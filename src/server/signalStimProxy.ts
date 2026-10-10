import { randomUUID } from 'node:crypto'
import {
  toJson,
  type DescMessage,
  type DescMethodUnary,
  type MessageShape,
} from '@bufbuild/protobuf'
import {
  Code,
  ConnectError,
  createClient,
  createConnectRouter,
  type CallOptions,
  type HandlerContext,
} from '@connectrpc/connect'
import { createEnvelopeReadableStream, createFetchHandler } from '@connectrpc/connect/protocol'
import { findTrailerError, parseTimeout } from '@connectrpc/connect/protocol-grpc'
import { trailerFlag, trailerParse } from '@connectrpc/connect/protocol-grpc-web'
import { createGrpcWebTransport } from '@connectrpc/connect-web'
import {
  SignalStimService,
  Status,
  type ResponseStatus,
  type SignalsResponse,
} from '../gen/proto/controlpanel/v1/control_panel_pb'

export type SignalStimProxyOptions = {
  upstreamBaseUrl?: string
  timeoutMs?: number
  logMaxPayloadBytes?: number
  fetch?: typeof globalThis.fetch
  writeLog?: (line: string) => void
}

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_LOG_PAYLOAD_BYTES = 65_536
const MAX_REQUEST_BYTES = 1_048_576

// Keep protobuf parsing/framing in ConnectRPC. This bridge adds container-side
// visibility while preserving the browser's generated gRPC-Web client.
export function createSignalStimProxy(options: SignalStimProxyOptions = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const configuredLogLimit = options.logMaxPayloadBytes ?? DEFAULT_LOG_PAYLOAD_BYTES
  const logLimit = isPositiveInteger(configuredLogLimit)
    ? configuredLogLimit
    : DEFAULT_LOG_PAYLOAD_BYTES
  const writeLog = options.writeLog ?? ((line: string) => console.log(line))

  return async function handle(request: Request): Promise<Response> {
    const requestId = randomUUID()
    const startedAt = performance.now()
    const pathname = new URL(request.url).pathname
    const method = SignalStimService.methods.find(
      (candidate) => pathname === `/${SignalStimService.typeName}/${candidate.name}`,
    )
    const metadata = {
      request_id: requestId,
      service: SignalStimService.typeName,
      method: method?.name ?? 'Unknown',
    }
    let invoked = false

    function log(event: string, level: string, fields: Record<string, unknown> = {}) {
      // Only explicit fields are logged, never request/response headers, cookies,
      // URLs (which can contain credentials), or the complete Request object.
      const entry = { timestamp: new Date().toISOString(), level, event, ...metadata, ...fields }
      try {
        writeLog(JSON.stringify(entry))
      } catch {
        // A logging sink failure must not turn an accepted hardware command into
        // a failed command that the operator might inadvertently repeat.
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(), level: 'error',
          event: 'rpc.logging_error', ...metadata,
        }))
      }
    }

    const elapsed = () => Math.round((performance.now() - startedAt) * 100) / 100
    log('rpc.received', 'info', { http_method: request.method })

    if (!method) {
      log('rpc.rejected', 'warn', { http_status: 404, duration_ms: elapsed() })
      return new Response(null, { status: 404, headers: { 'x-request-id': requestId } })
    }

    async function forward<I extends DescMessage, O extends DescMessage>(
      rpcMethod: DescMethodUnary<I, O>,
      input: MessageShape<I>,
      context: HandlerContext,
      call: (
        client: ReturnType<typeof createUpstreamClient>,
        callOptions: CallOptions,
      ) => Promise<MessageShape<O>>,
    ): Promise<MessageShape<O>> {
      invoked = true
      context.responseHeader.set('x-request-id', requestId)
      log('rpc.request', 'info', payloadFields(rpcMethod.input, input, logLimit))

      try {
        // This target comes exclusively from server configuration. Never accept
        // an upstream URL from a browser header, query parameter, or payload.
        const upstream = validateUpstream(options.upstreamBaseUrl, request.url)
        if (!isPositiveInteger(timeoutMs) || timeoutMs > 2_147_483_647 ||
            !isPositiveInteger(configuredLogLimit)) {
          throw new ConnectError('Invalid RPC timeout or log payload limit configuration', Code.FailedPrecondition)
        }

        const headers = new Headers({ 'x-request-id': requestId })
        const authorization = context.requestHeader.get('authorization')
        if (authorization) headers.set('authorization', authorization)
        const remainingMs = context.timeoutMs()
        if (remainingMs !== undefined && remainingMs <= 0) {
          throw new ConnectError('Request deadline exceeded', Code.DeadlineExceeded)
        }
        const output = await call(createUpstreamClient(upstream, options.fetch), {
          headers,
          signal: context.signal,
          timeoutMs: Math.min(remainingMs ?? timeoutMs, timeoutMs),
        })
        const successful = isApplicationSuccess(rpcMethod.name, output)
        log('rpc.response', successful ? 'info' : 'warn', {
          duration_ms: elapsed(),
          application_status: successful ? 'success' : 'failure',
          ...payloadFields(rpcMethod.output, output, logLimit),
        })
        return output
      } catch (error) {
        const rpcError = ConnectError.from(error)
        log('rpc.error', 'error', {
          duration_ms: elapsed(),
          error: {
            code: Code[rpcError.code],
            message: rpcError.rawMessage.slice(0, 4096),
          },
        })
        throw rpcError
      }
    }

    const router = createConnectRouter({
      grpc: false,
      connect: false,
      grpcWeb: true,
      readMaxBytes: MAX_REQUEST_BYTES,
    })
    router.service(SignalStimService, {
      setSignal: (input, context) => forward(
        SignalStimService.method.setSignal, input, context,
        (client, callOptions) => client.setSignal(input, callOptions),
      ),
      removeSignals: (input, context) => forward(
        SignalStimService.method.removeSignals, input, context,
        (client, callOptions) => client.removeSignals(input, callOptions),
      ),
      resetAll: (input, context) => forward(
        SignalStimService.method.resetAll, input, context,
        (client, callOptions) => client.resetAll(input, callOptions),
      ),
    })
    const handler = router.handlers.find((candidate) => candidate.method.name === method.name)!
    // Clamp before Connect creates its deadline timer. A huge caller timeout
    // would otherwise overflow Node's timer and immediately cancel the call.
    const response = await createFetchHandler((incoming) => {
      const header = new Headers(incoming.header)
      const parsed = parseTimeout(header.get('grpc-timeout'), Number.MAX_SAFE_INTEGER)
      const cap = isPositiveInteger(timeoutMs) && timeoutMs <= 2_147_483_647
        ? timeoutMs : DEFAULT_TIMEOUT_MS
      if (!parsed.error && (parsed.timeoutMs === undefined || parsed.timeoutMs > cap)) {
        header.set('grpc-timeout', cap <= 99_999_999 ? `${cap}m` : `${Math.floor(cap / 1000)}S`)
      }
      return handler({ ...incoming, header })
    })(request)
    response.headers.set('x-request-id', requestId)
    response.headers.set('cache-control', 'no-store')
    if (!invoked) {
      // Framing/content-type/decoding errors occur before service invocation.
      // HTTP 200 can still contain a gRPC error trailer. Inspect that trailer
      // without consuming the response that will be returned to the browser.
      const error = await rejectedRequestError(response)
      log('rpc.rejected', 'warn', {
        duration_ms: elapsed(), http_status: response.status,
        reason: 'Request rejected before RPC invocation; inspect the gRPC status or HTTP response',
        ...(error ? { error: { code: Code[error.code], message: error.rawMessage.slice(0, 4096) } } : {}),
      })
    }
    return response
  }
}

function createUpstreamClient(baseUrl: string, fetch?: typeof globalThis.fetch) {
  return createClient(SignalStimService, createGrpcWebTransport({ baseUrl, fetch }))
}

function validateUpstream(value: string | undefined, requestUrl: string): string {
  let url: URL
  try {
    url = new URL(value ?? '')
  } catch {
    throw new ConnectError('SIGNAL_STIM_UPSTREAM_URL must be configured with an HTTP(S) Envoy endpoint', Code.FailedPrecondition)
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.search || url.hash || url.origin === new URL(requestUrl).origin) {
    throw new ConnectError('SIGNAL_STIM_UPSTREAM_URL must point directly to the internal Envoy endpoint without credentials or query parameters', Code.FailedPrecondition)
  }
  return url.toString().replace(/\/$/, '')
}

function isPositiveInteger(value: number) {
  return Number.isSafeInteger(value) && value > 0
}

function isApplicationSuccess(method: string, output: object): boolean {
  if (method === 'ResetAll') return (output as ResponseStatus).status === Status.SUCCESS
  const response = output as SignalsResponse
  return response.responseStatus?.status === Status.SUCCESS && response.signalErrors.length === 0
}

function payloadFields<T extends DescMessage>(schema: T, message: MessageShape<T>, maxBytes: number) {
  const payload = toJson(schema, message, { alwaysEmitImplicit: true })
  const serialized = JSON.stringify(payload)
  const bytes = Buffer.byteLength(serialized, 'utf8')
  if (bytes <= maxBytes) return { payload }
  return {
    payload_truncated: true,
    payload_bytes: bytes,
    // stream:true omits an incomplete trailing UTF-8 character at the cutoff.
    payload_preview: new TextDecoder().decode(Buffer.from(serialized, 'utf8').subarray(0, maxBytes), { stream: true }),
  }
}

async function rejectedRequestError(response: Response) {
  const headerError = findTrailerError(response.headers)
  if (headerError || response.status !== 200 || !response.body) return headerError
  const reader = createEnvelopeReadableStream(response.clone().body!).getReader()
  let error: ConnectError | undefined
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return error
      if (value.flags & trailerFlag) error = findTrailerError(trailerParse(value.data))
    }
  } catch {
    return undefined
  } finally {
    reader.releaseLock()
  }
}
