import {
  Code,
  ConnectError,
  createClient,
  type Client,
} from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
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
  // Browsers use the Connect protocol here. Envoy is only proxying HTTP
  // requests, so the upstream server must expose Connect protocol endpoints.
  const transport = createConnectTransport({
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

export function describeConnectError(error: unknown): string {
  // ConnectError.from normalizes thrown values from fetch, Envoy, ConnectRPC,
  // and plain JavaScript errors into one shape for display.
  const connectError = ConnectError.from(error)
  const codeName = Code[connectError.code] ?? 'Unknown'

  return `${codeName}: ${connectError.rawMessage}`
}
