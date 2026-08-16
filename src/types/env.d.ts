declare namespace NodeJS {
  interface ProcessEnv {
    readonly CONNECT_PROXY_URL?: string
    readonly CONNECT_AUTH_TOKEN?: string
    readonly NEXT_PUBLIC_CONNECT_PROXY_URL?: string
    readonly NEXT_PUBLIC_CONNECT_AUTH_TOKEN?: string
  }
}
