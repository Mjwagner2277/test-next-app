import { Stack } from '@mui/material'
import type { ActiveFault, SelectedFaultVariants, SensorRow } from './faultModel'
import { ActiveFaultPanel } from './ActiveFaultPanel'
import { FaultLegendPanel } from './FaultLegendPanel'
import { FaultVariantOverviewPanel } from './FaultVariantOverviewPanel'

type FaultStateAsideProps = {
  activeFaults: ActiveFault[]
  sensors: SensorRow[]
  selectedVariants: SelectedFaultVariants
}

export function FaultStateAside({
  activeFaults,
  sensors,
  selectedVariants,
}: FaultStateAsideProps) {
  return (
    <Stack component="aside" spacing={1.5} aria-label="Fault state">
      <ActiveFaultPanel activeFaults={activeFaults} sensors={sensors} />
      <FaultLegendPanel />
      <FaultVariantOverviewPanel
        sensors={sensors}
        selectedVariants={selectedVariants}
        activeFaults={activeFaults}
      />
    </Stack>
  )
}
