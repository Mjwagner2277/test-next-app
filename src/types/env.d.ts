declare namespace NodeJS {
  interface ProcessEnv {
    readonly GRPC_WEB_PROXY_URL?: string
    readonly GRPC_WEB_AUTH_TOKEN?: string
    readonly NEXT_PUBLIC_GRPC_WEB_PROXY_URL?: string
    readonly NEXT_PUBLIC_GRPC_WEB_AUTH_TOKEN?: string
  }
}
