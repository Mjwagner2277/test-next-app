import {
  Code,
  ConnectError,
  createClient,
  type Client,
} from '@connectrpc/connect'
import { createGrpcWebTransport } from '@connectrpc/connect-web'
import { ControlPanelService } from '../gen/proto/controlpanel/v1/control_panel_pb'

// Client<typeof Service> gives TypeScript methods that match the .proto file.
// If the proto changes and you rerun `npm run proto:gen`, these method names
// and request/response shapes update with it.
export type ControlPanelClient = Client<typeof ControlPanelService>

type ClientOptions = {
  baseUrl: string
  authToken?: string
}

export function createControlPanelClient({
  baseUrl,
  authToken,
}: ClientOptions): ControlPanelClient {
  // Browsers speak gRPC-Web here. Envoy receives that request and translates it
  // to native gRPC/HTTP2 for the upstream server configured in envoy.yaml.
  const transport = createGrpcWebTransport({
    baseUrl,
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

  return createClient(ControlPanelService, transport)
}

export function describeGrpcError(error: unknown): string {
  // ConnectError.from normalizes thrown values from fetch, Envoy, ConnectRPC,
  // and plain JavaScript errors into one shape for display.
  const grpcError = ConnectError.from(error)
  const codeName = Code[grpcError.code] ?? 'Unknown'

  return `${codeName}: ${grpcError.rawMessage}`
}
