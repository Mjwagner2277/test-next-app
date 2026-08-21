// This file intentionally contains only values and types that are safe to share
// with the browser. Server-side environment lookups live in serverConfig.ts.

// This URL is the browser-facing gRPC-Web endpoint. In local development it is
// Envoy on port 8080, not the native gRPC server itself.
export const DEFAULT_GRPC_WEB_PROXY_URL = 'http://localhost:8080'

export type GrpcWebBrowserConfig = {
  // ConnectRPC transports call this value "baseUrl".
  baseUrl: string
  // If provided, this is sent from the browser and is therefore visible to end
  // users. Do not put private server credentials here.
  authToken?: string
}
