import { createSignalStimProxy } from '../../../server/signalStimProxy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  // Read server-only configuration at runtime so the same built image can be
  // deployed in multiple clusters. Never expose these values to the browser.
  return createSignalStimProxy({
    upstreamBaseUrl: process.env.SIGNAL_STIM_UPSTREAM_URL,
    timeoutMs: Number(process.env.SIGNAL_STIM_TIMEOUT_MS ?? 30_000),
    logMaxPayloadBytes: Number(process.env.RPC_LOG_MAX_PAYLOAD_BYTES ?? 65_536),
  })(request)
}
