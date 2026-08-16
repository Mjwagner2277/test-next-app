// This file intentionally contains only values and types that are safe to share
// with the browser. Server-side environment lookups live in serverConfig.ts.

// This URL is the browser-facing Connect protocol endpoint. In local
// development it is Envoy on port 8080, not the upstream service itself.
export const DEFAULT_CONNECT_PROXY_URL = 'http://localhost:8080'

export type ConnectBrowserConfig = {
  // controlPanelClient.ts calls this "baseUrl" because that is the name used by
  // ConnectRPC transports.
  baseUrl: string
  // If provided, this is sent from the browser and is therefore visible to end
  // users. Do not put private server credentials here.
  authToken?: string
}
