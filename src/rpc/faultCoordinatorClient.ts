import {
  Code,
  ConnectError,
  createClient,
  type Client,
} from '@connectrpc/connect'
import { createGrpcWebTransport } from '@connectrpc/connect-web'
import { SignalStimService } from '../gen/proto/controlpanel/v1/control_panel_pb'

// Client<typeof Service> gives TypeScript methods that match the .proto file.
// If the proto changes and you rerun `npm run proto:gen`, these method names
// and request/response shapes update with it.
export type SignalStimClient = Client<typeof SignalStimService>

type ClientOptions = {
  // Optional escape hatch for unusual local development. Production Gateway
  // deployments should omit this so the browser calls the same origin that
  // served the GUI.
  baseUrl?: string
  authToken?: string
}

function resolveGrpcWebBaseUrl(baseUrl: string | undefined): string {
  const trimmedBaseUrl = baseUrl?.trim() ?? ''

  // Same-origin is the normal cluster path:
  // browser -> Envoy Gateway -> app for page assets
  // browser -> Envoy Gateway -> gRPC-Web route for service calls
  if (trimmedBaseUrl.length === 0 && typeof globalThis.location !== 'undefined') {
    return globalThis.location.origin
  }

  return trimmedBaseUrl
}

export function createSignalStimClient({
  baseUrl,
  authToken,
}: ClientOptions = {}): SignalStimClient {
  // ConnectRPC provides this gRPC-Web transport. The browser sends gRPC-Web to
  // the same origin that served the GUI. Envoy Gateway owns routing those
  // /controlpanel.v1.SignalStimService/* paths to the gRPC-Web endpoint.
  const transport = createGrpcWebTransport({
    baseUrl: resolveGrpcWebBaseUrl(baseUrl),
    interceptors: authToken
      ? [
          // Interceptors can add headers, log requests, or measure timing. This
          // one adds an Authorization header when the public config provides a
          // token.
          (next) => async (request) => {
            request.header.set('Authorization', `Bearer ${authToken}`)
            return next(request)
          },
        ]
      : [],
  })

  return createClient(SignalStimService, transport)
}

export function describeRpcError(error: unknown): string {
  // ConnectError.from normalizes thrown values from fetch, Envoy, ConnectRPC,
  // and plain JavaScript errors into one shape for display.
  const rpcError = ConnectError.from(error)
  const codeName = Code[rpcError.code] ?? 'Unknown'

  return `${codeName}: ${rpcError.rawMessage}`
}
