import {
  DEFAULT_GRPC_WEB_PROXY_URL,
  type GrpcBrowserConfig,
} from './config'

export function getGrpcBrowserConfig(): GrpcBrowserConfig {
  // Helm and normal server environments can change these values when the
  // container starts. This avoids rebuilding the Next.js image for each gRPC
  // proxy URL.
  const proxyUrl =
    process.env.GRPC_WEB_PROXY_URL?.trim() ||
    process.env.NEXT_PUBLIC_GRPC_WEB_PROXY_URL?.trim()

  // This token is returned to the browser by /api/grpc-config. That is fine for
  // demo/public tokens, but private credentials should be added server-side by a
  // backend-for-frontend instead.
  const authToken =
    process.env.GRPC_AUTH_TOKEN?.trim() ||
    process.env.NEXT_PUBLIC_GRPC_AUTH_TOKEN?.trim()

  return {
    baseUrl: proxyUrl || DEFAULT_GRPC_WEB_PROXY_URL,
    authToken: authToken || undefined,
  }
}
