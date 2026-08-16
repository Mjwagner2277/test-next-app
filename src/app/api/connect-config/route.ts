import { NextResponse } from 'next/server'
import { getConnectBrowserConfig } from '@/rpc/serverConfig'

// Force a runtime response so Kubernetes/Helm environment values are read from
// the running container instead of being frozen into a static build artifact.
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json(getConnectBrowserConfig(), {
    headers: {
      // Config should reflect the current pod environment, so browsers and
      // proxies should not cache it across deploys.
      'Cache-Control': 'no-store',
    },
  })
}
