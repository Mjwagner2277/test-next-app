import { Stack } from '@mui/material'
import type { ActiveFault, FaultVariantId, SensorRow } from './faultModel'
import { ActiveFaultPanel } from './ActiveFaultPanel'
import { FaultLegendPanel } from './FaultLegendPanel'
import { FaultVariantOverviewPanel } from './FaultVariantOverviewPanel'

type FaultStateAsideProps = {
  activeFaults: ActiveFault[]
  sensors: SensorRow[]
  selectedVariants: Record<string, FaultVariantId>
}

export function FaultStateAside({
  activeFaults,
  sensors,
  selectedVariants,
}: FaultStateAsideProps) {
  return (
    <Stack component="aside" spacing={1.5} aria-label="Fault state">
      <ActiveFaultPanel activeFaults={activeFaults} />
      <FaultLegendPanel />
      <FaultVariantOverviewPanel
        sensors={sensors}
        selectedVariants={selectedVariants}
        activeFaults={activeFaults}
      />
    </Stack>
  )
}
