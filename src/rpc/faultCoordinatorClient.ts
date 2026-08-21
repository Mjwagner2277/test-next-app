import {
  Code,
  ConnectError,
  createClient,
  type Client,
} from '@connectrpc/connect'
import { createGrpcWebTransport } from '@connectrpc/connect-web'
import { FaultCoordinatorService } from '../gen/proto/controlpanel/v1/control_panel_pb'

// Client<typeof Service> gives TypeScript methods that match the .proto file.
// If the proto changes and you rerun `npm run proto:gen`, these method names
// and request/response shapes update with it.
export type FaultCoordinatorClient = Client<typeof FaultCoordinatorService>

type ClientOptions = {
  baseUrl: string
  authToken?: string
}

export function createFaultCoordinatorClient({
  baseUrl,
  authToken,
}: ClientOptions): FaultCoordinatorClient {
  // ConnectRPC provides this gRPC-Web transport. The browser sends gRPC-Web to
  // Envoy, and Envoy translates that request to native gRPC for the upstream.
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

  return createClient(FaultCoordinatorService, transport)
}

export function describeRpcError(error: unknown): string {
  // ConnectError.from normalizes thrown values from fetch, Envoy, ConnectRPC,
  // and plain JavaScript errors into one shape for display.
  const rpcError = ConnectError.from(error)
  const codeName = Code[rpcError.code] ?? 'Unknown'

  return `${codeName}: ${rpcError.rawMessage}`
}
