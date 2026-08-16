declare namespace NodeJS {
  interface ProcessEnv {
    readonly GRPC_WEB_PROXY_URL?: string
    readonly GRPC_AUTH_TOKEN?: string
    // Backwards-compatible fallback for older local .env files. Prefer the
    // non-NEXT_PUBLIC names so Helm runtime values are not confused with
    // build-time browser bundle variables.
    readonly NEXT_PUBLIC_GRPC_WEB_PROXY_URL?: string
    readonly NEXT_PUBLIC_GRPC_AUTH_TOKEN?: string
  }
}
