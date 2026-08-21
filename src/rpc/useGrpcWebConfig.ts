'use client'

import { useEffect, useState } from 'react'
import type { GrpcWebBrowserConfig } from './config'

export function useGrpcWebConfig() {
  // This config is loaded from the Next.js server at runtime. Helm sets the
  // server environment variables, and browser components read the resolved
  // values through /api/grpc-config.
  const [grpcWebConfig, setGrpcWebConfig] =
    useState<GrpcWebBrowserConfig | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)

  useEffect(() => {
    let isCurrentRequest = true

    async function loadGrpcWebConfig() {
      try {
        const response = await fetch('/api/grpc-config', {
          cache: 'no-store',
        })

        if (!response.ok) {
          throw new Error(`Config request failed with HTTP ${response.status}`)
        }

        const nextConfig = (await response.json()) as GrpcWebBrowserConfig

        if (isCurrentRequest) {
          setGrpcWebConfig(nextConfig)
          setConfigError(null)
        }
      } catch (error) {
        if (isCurrentRequest) {
          setConfigError(
            error instanceof Error
              ? error.message
              : 'Unable to load gRPC-Web configuration',
          )
        }
      }
    }

    loadGrpcWebConfig()

    return () => {
      // Ignore late fetch results if React remounts the component during
      // development or navigation.
      isCurrentRequest = false
    }
  }, [])

  return {
    grpcWebConfig,
    configError,
    proxyEndpoint: grpcWebConfig?.baseUrl ?? 'Loading configuration',
  }
}
