import { Stack } from '@mui/material'
import type { ActiveFault, RpcLogEntry } from './faultModel'
import { ActiveFaultPanel } from './ActiveFaultPanel'
import { ConnectionStatusPanel } from './ConnectionStatusPanel'
import { FaultLegendPanel } from './FaultLegendPanel'

type FaultStateAsideProps = {
  activeFaults: ActiveFault[]
  proxyEndpoint: string
  configError: string | null
  pendingAction: string | null
  history: RpcLogEntry[]
}

export function FaultStateAside({
  activeFaults,
  proxyEndpoint,
  configError,
  pendingAction,
  history,
}: FaultStateAsideProps) {
  return (
    <Stack component="aside" spacing={1.5} aria-label="Fault state">
      <ActiveFaultPanel activeFaults={activeFaults} />
      <FaultLegendPanel />
      <ConnectionStatusPanel
        proxyEndpoint={proxyEndpoint}
        configError={configError}
        pendingAction={pendingAction}
        history={history}
      />
    </Stack>
  )
}
