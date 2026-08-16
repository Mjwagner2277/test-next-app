import {
  DEFAULT_CONNECT_PROXY_URL,
  type ConnectBrowserConfig,
} from './config'

export function getConnectBrowserConfig(): ConnectBrowserConfig {
  // Helm and normal server environments can change these values when the
  // container starts. This avoids rebuilding the Next.js image for each Connect
  // proxy URL.
  const proxyUrl =
    process.env.CONNECT_PROXY_URL?.trim() ||
    process.env.NEXT_PUBLIC_CONNECT_PROXY_URL?.trim()

  // This token is returned to the browser by /api/connect-config. That is fine
  // for demo/public tokens, but private credentials should be added server-side
  // by a backend-for-frontend instead.
  const authToken =
    process.env.CONNECT_AUTH_TOKEN?.trim() ||
    process.env.NEXT_PUBLIC_CONNECT_AUTH_TOKEN?.trim()

  return {
    baseUrl: proxyUrl || DEFAULT_CONNECT_PROXY_URL,
    authToken: authToken || undefined,
  }
}
