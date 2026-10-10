import assert from 'node:assert/strict'
import test from 'node:test'
import { create } from '@bufbuild/protobuf'
import {
  Code,
  ConnectError,
  createClient,
  createConnectRouter,
  type ServiceImpl,
} from '@connectrpc/connect'
import { createFetchHandler } from '@connectrpc/connect/protocol'
import { createGrpcWebTransport } from '@connectrpc/connect-web'
import {
  CardModel,
  SignalStimService,
  SignalsRequestSchema,
  Status,
  type SignalsRequest,
} from '../src/gen/proto/controlpanel/v1/control_panel_pb'
import { createSignalStimProxy } from '../src/server/signalStimProxy'

type ProxyOptions = Parameters<typeof createSignalStimProxy>[0]
type LogEntry = {
  event: string
  request_id: string
  method: string
  service: string
  timestamp: string
  duration_ms?: number
  application_status?: string
  payload?: unknown
  payload_preview?: string
  payload_bytes?: number
  payload_truncated?: boolean
  error?: { code: string; message: string }
}

const serviceName = 'controlpanel.v1.SignalStimService'
const signals = create(SignalsRequestSchema, {
  signals: [
    { signalId: 18446744073709551615n, cardModel: CardModel.TYPE1, signalValue: { case: 'analog', value: 0 } },
    { signalId: 18446744073709551615n, cardModel: CardModel.TYPE2, signalValue: { case: 'discrete', value: false } },
    { signalId: 3003n, cardModel: CardModel.TYPE2, signalValue: { case: 'serial', value: 'sensor conflict: A ≠ B' } },
    { signalId: 4004n, cardModel: CardModel.TYPE1, signalValue: { case: 'discrete', value: true } },
  ],
}).signals
const jsonSignals = [
  { signalId: '18446744073709551615', cardModel: 'CARD_MODEL_TYPE1', analog: 0 },
  { signalId: '18446744073709551615', cardModel: 'CARD_MODEL_TYPE2', discrete: false },
  { signalId: '3003', cardModel: 'CARD_MODEL_TYPE2', serial: 'sensor conflict: A ≠ B' },
  { signalId: '4004', cardModel: 'CARD_MODEL_TYPE1', discrete: true },
]

function harness(
  implementation: Partial<ServiceImpl<typeof SignalStimService>> = {},
  options: Partial<ProxyOptions> = {},
) {
  const router = createConnectRouter({ grpc: false, connect: false })
  router.service(SignalStimService, implementation)
  const upstreamHandlers = new Map(router.handlers.map((handler) => [handler.requestPath, createFetchHandler(handler)]))
  const forwarded: Request[] = []
  const responses: Response[] = []
  const logs: LogEntry[] = []
  const upstreamFetch: typeof fetch = options.fetch ?? (async (input, init) => {
    const request = new Request(input, init)
    const handler = upstreamHandlers.get(new URL(request.url).pathname)
    assert.ok(handler, 'proxy must call an existing upstream method')
    return handler(request)
  })
  const proxy = createSignalStimProxy({
    upstreamBaseUrl: 'http://coordinator.test',
    ...options,
    fetch: async (input, init) => {
      const request = new Request(input, init)
      forwarded.push(request)
      return upstreamFetch(request)
    },
    writeLog: (line) => logs.push(JSON.parse(line) as LogEntry),
  })
  const client = createClient(SignalStimService, createGrpcWebTransport({
    baseUrl: 'http://proxy.test',
    useBinaryFormat: true,
    fetch: async (input, init) => {
      const response = await proxy(new Request(input, init))
      responses.push(response)
      return response
    },
  }))
  return { proxy, client, logs, forwarded, responses }
}

function logged(logs: LogEntry[], event: string, method?: string) {
  const entry = logs.find((item) => item.event === event && (!method || item.method === method))
  assert.ok(entry, `expected ${event}${method ? ` for ${method}` : ''}`)
  return entry
}

function isCode(code: Code) {
  return (error: unknown) => error instanceof ConnectError && error.code === code
}

function pendingFetch(onRequest: (request: Request) => void): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init)
    onRequest(request)
    return new Promise<Response>((_, reject) => {
      // Keep a referenced guard timer, and make broken abort propagation fail
      // promptly instead of leaving the suite awaiting a never-settled fetch.
      const guard = setTimeout(() => reject(new Error('Upstream fetch was not aborted')), 1_000)
      const onAbort = () => {
        clearTimeout(guard)
        reject(request.signal.reason)
      }
      if (request.signal.aborted) onAbort()
      else request.signal.addEventListener('abort', onAbort, { once: true })
    })
  }
}

test('binary set and remove preserve complete signal groups and log decoded values', async () => {
  const received: { method: string; request: SignalsRequest }[] = []
  const h = harness({
    setSignal(request) {
      received.push({ method: 'SetSignal', request })
      return { responseStatus: { status: Status.SUCCESS } }
    },
    removeSignals(request) {
      received.push({ method: 'RemoveSignals', request })
      return { responseStatus: { status: Status.SUCCESS } }
    },
  })

  for (const count of [1, 4]) {
    for (const [method, call] of [
      ['SetSignal', h.client.setSignal],
      ['RemoveSignals', h.client.removeSignals],
    ] as const) {
      h.logs.length = 0
      const response = await call({ signals: signals.slice(0, count) })
      assert.equal(response.responseStatus?.status, Status.SUCCESS)
      assert.deepEqual(received.at(-1), {
        method, request: create(SignalsRequestSchema, { signals: signals.slice(0, count) }),
      })
      assert.deepEqual(logged(h.logs, 'rpc.request', method).payload, { signals: jsonSignals.slice(0, count) })
      const responseLog = logged(h.logs, 'rpc.response', method)
      assert.deepEqual(responseLog.payload, { responseStatus: { status: 'STATUS_SUCCESS' }, signalErrors: [] })
      assert.equal(responseLog.application_status, 'success')
      assert.ok(typeof responseLog.duration_ms === 'number' && responseLog.duration_ms >= 0)
    }
  }
})

test('ResetAll logs its empty request and explicit zero-valued success status', async () => {
  const h = harness({ resetAll: () => ({ status: Status.SUCCESS }) })
  assert.equal((await h.client.resetAll({})).status, Status.SUCCESS)
  assert.deepEqual(logged(h.logs, 'rpc.request', 'ResetAll').payload, {})
  assert.deepEqual(logged(h.logs, 'rpc.response', 'ResetAll').payload, { status: 'STATUS_SUCCESS' })
  assert.equal(logged(h.logs, 'rpc.response').application_status, 'success')
})

test('application and per-signal failures are returned intact and logged as failures', async () => {
  const h = harness({
    setSignal: () => ({ responseStatus: { status: Status.FAILURE } }),
    removeSignals: () => ({
      responseStatus: { status: Status.SUCCESS },
      signalErrors: [{ signal: signals[1], signalErrors: ['Override could not be removed'] }],
    }),
    resetAll: () => ({ status: Status.FAILURE }),
  })

  assert.equal((await h.client.setSignal({ signals })).responseStatus?.status, Status.FAILURE)
  const removed = await h.client.removeSignals({ signals })
  assert.equal(removed.responseStatus?.status, Status.SUCCESS)
  assert.deepEqual(removed.signalErrors[0].signal, signals[1])
  assert.deepEqual(removed.signalErrors[0].signalErrors, ['Override could not be removed'])
  assert.equal((await h.client.resetAll({})).status, Status.FAILURE)
  assert.equal(h.logs.filter((entry) => entry.event === 'rpc.response').length, 3)
  for (const entry of h.logs.filter((item) => item.event === 'rpc.response')) {
    assert.equal(entry.application_status, 'failure')
  }
  assert.deepEqual(logged(h.logs, 'rpc.response', 'RemoveSignals').payload, {
    responseStatus: { status: 'STATUS_SUCCESS' },
    signalErrors: [{ signal: jsonSignals[1], signalErrors: ['Override could not be removed'] }],
  })
})

test('upstream gRPC errors preserve their code and produce a correlated terminal error log', async () => {
  const h = harness({
    setSignal() { throw new ConnectError('Coordinator is unavailable', Code.Unavailable) },
  })
  await assert.rejects(h.client.setSignal({ signals }), isCode(Code.Unavailable))
  const requestLog = logged(h.logs, 'rpc.request')
  const errorLog = logged(h.logs, 'rpc.error')
  assert.equal(errorLog.request_id, requestLog.request_id)
  assert.equal(errorLog.error?.code, 'Unavailable')
  assert.match(errorLog.error?.message ?? '', /Coordinator is unavailable/)
  assert.ok(typeof errorLog.duration_ms === 'number' && errorLog.duration_ms >= 0)
  assert.equal(h.logs.some((entry) => entry.event === 'rpc.response'), false)
})

test('concurrent requests receive distinct IDs that correlate logs, upstream calls, and response headers', async () => {
  const upstreamIds = new Map<string, string | null>()
  let bothStarted!: () => void
  const started = new Promise<void>((resolve) => { bothStarted = resolve })
  const h = harness({
    async setSignal(request, context) {
      upstreamIds.set(request.signals[0].signalId.toString(), context.requestHeader.get('x-request-id'))
      assert.equal(context.requestHeader.get('authorization'), 'Bearer test-secret-token')
      if (upstreamIds.size === 2) bothStarted()
      await started
      return { responseStatus: { status: Status.SUCCESS } }
    },
  })
  const headers = { authorization: 'Bearer test-secret-token', cookie: 'session=test-secret-cookie', 'x-request-id': 'untrusted-incoming-id' }
  await Promise.all([10n, 20n].map((signalId) => h.client.setSignal({
    signals: [{ signalId, signalValue: { case: 'analog', value: 0 } }],
  }, { headers })))

  const ids = [...upstreamIds.values()]
  assert.equal(new Set(ids).size, 2)
  for (const id of ids) {
    assert.match(id ?? '', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    const entries = h.logs.filter((entry) => entry.request_id === id)
    assert.deepEqual(entries.map((entry) => entry.event), ['rpc.received', 'rpc.request', 'rpc.response'])
    for (const entry of entries) {
      assert.equal(entry.method, 'SetSignal')
      assert.equal(entry.service, serviceName)
      assert.ok(Number.isFinite(Date.parse(entry.timestamp)))
    }
    const signalId = [...upstreamIds].find(([, value]) => value === id)![0]
    assert.deepEqual(logged(entries, 'rpc.request').payload, {
      signals: [{ signalId, cardModel: 'CARD_MODEL_TYPE1', analog: 0 }],
    })
  }
  assert.deepEqual(new Set(h.responses.map((response) => response.headers.get('x-request-id'))), new Set(ids))
  assert.doesNotMatch(JSON.stringify(h.logs), /test-secret-token|test-secret-cookie|untrusted-incoming-id|authorization|cookie/i)
})

test('bounded UTF-8 log previews do not truncate requests or responses sent over the wire', async () => {
  // A 70-byte cap ends inside the first multibyte character in the request.
  const serial = '🌡 temperature ≠ pressure; '.repeat(200)
  let receivedSerial: string | boolean | number | undefined
  const h = harness({
    setSignal(request) {
      receivedSerial = request.signals[0].signalValue.value
      return { responseStatus: { status: Status.FAILURE }, signalErrors: [{ signal: request.signals[0], signalErrors: [serial] }] }
    },
  }, { logMaxPayloadBytes: 70 })
  const response = await h.client.setSignal({
    signals: [{ signalId: 1n, signalValue: { case: 'serial', value: serial } }],
  })
  assert.equal(receivedSerial, serial)
  assert.equal(response.signalErrors[0].signal?.signalValue.value, serial)
  assert.deepEqual(response.signalErrors[0].signalErrors, [serial])
  for (const event of ['rpc.request', 'rpc.response']) {
    const entry = logged(h.logs, event)
    assert.equal(entry.payload_truncated, true)
    assert.equal('payload' in entry, false)
    assert.ok((entry.payload_bytes ?? 0) > 70)
    assert.ok(typeof entry.payload_preview === 'string')
    assert.ok(Buffer.byteLength(entry.payload_preview, 'utf8') <= 70)
    assert.doesNotMatch(entry.payload_preview, /\uFFFD/)
  }
})

test('unknown methods and malformed protobuf are rejected and logged before upstream forwarding', async () => {
  const h = harness()
  for (const method of ['UnknownMethod', 'SetSignal']) {
    h.logs.length = 0
    const response = await h.proxy(new Request(`http://proxy.test/${serviceName}/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/grpc-web+proto' },
      body: new Uint8Array([0, 0, 0, 0, 1, 255]),
    }))
    await response.arrayBuffer()
    assert.equal(h.forwarded.length, 0)
    const rejected = logged(h.logs, 'rpc.rejected')
    assert.equal(rejected.method, method === 'UnknownMethod' ? 'Unknown' : method)
    assert.equal(rejected.request_id, response.headers.get('x-request-id'))
    assert.equal(h.logs.some((entry) => entry.event === 'rpc.request'), false)
    if (method === 'SetSignal') {
      assert.equal(rejected.error?.code, 'Internal')
      assert.match(rejected.error?.message ?? '', /parse binary: .+/)
    }
  }
})

test('missing or invalid upstream configuration returns a gRPC failure and logs the request', async () => {
  for (const upstreamBaseUrl of [undefined, 'ftp://coordinator.test']) {
    const h = harness({}, { upstreamBaseUrl })
    await assert.rejects(h.client.resetAll({}), isCode(Code.FailedPrecondition))
    assert.equal(h.forwarded.length, 0)
    assert.deepEqual(logged(h.logs, 'rpc.request').payload, {})
    assert.equal(logged(h.logs, 'rpc.error').error?.code, 'FailedPrecondition')
  }
})

test('the configured upstream deadline caps longer caller deadlines and aborts in-flight fetch', async () => {
  let upstreamSignal: AbortSignal | undefined
  const h = harness({}, {
    timeoutMs: 30,
    fetch: pendingFetch((request) => { upstreamSignal = request.signal }),
  })
  await assert.rejects(h.client.setSignal({ signals }, { timeoutMs: 5_000 }), isCode(Code.DeadlineExceeded))
  assert.equal(upstreamSignal?.aborted, true)
  assert.equal(logged(h.logs, 'rpc.error').error?.code, 'DeadlineExceeded')
})

test('browser cancellation aborts the coordinator call and records its cancellation', async () => {
  const controller = new AbortController()
  let upstreamAborted = false
  const h = harness({}, {
    fetch: pendingFetch((request) => {
      request.signal.addEventListener('abort', () => { upstreamAborted = true }, { once: true })
      queueMicrotask(() => controller.abort())
    }),
  })
  await assert.rejects(h.client.removeSignals({ signals }, { signal: controller.signal }), isCode(Code.Canceled))
  assert.equal(upstreamAborted, true)
  assert.equal(logged(h.logs, 'rpc.error').error?.code, 'Canceled')
})

test('extremely large incoming deadlines are capped before creating overflowing server timers', async () => {
  let upstreamTimeout: string | null = null
  const h = harness({}, {
    timeoutMs: 50,
    fetch: pendingFetch((request) => { upstreamTimeout = request.headers.get('grpc-timeout') }),
  })
  const start = performance.now()
  await assert.rejects(h.client.resetAll({}, {
    headers: { 'grpc-timeout': '99999999H' },
  }), isCode(Code.DeadlineExceeded))
  assert.ok(performance.now() - start >= 20, 'deadline must not overflow to an immediate timeout')
  assert.match(upstreamTimeout ?? '', /^\d+m$/)
  assert.ok(Number.parseInt(upstreamTimeout!, 10) <= 50)
  assert.equal(logged(h.logs, 'rpc.error').error?.code, 'DeadlineExceeded')
})

test('requests larger than the read limit never reach the coordinator', async () => {
  const h = harness()
  await assert.rejects(h.client.setSignal({
    signals: [{ signalId: 1n, signalValue: { case: 'serial', value: 'x'.repeat(1024 * 1024) } }],
  }), isCode(Code.ResourceExhausted))
  assert.equal(h.forwarded.length, 0)
  assert.equal(h.logs.some((entry) => entry.event === 'rpc.request'), false)
  const rejected = logged(h.logs, 'rpc.rejected')
  assert.equal(rejected.error?.code, 'ResourceExhausted')
  assert.ok((rejected.error?.message ?? '').length > 0)
})
