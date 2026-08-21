import { Stack } from '@mui/material'
import type { ActiveFault, SensorRow, UiFaultVariant } from './faultModel'
import { ActiveFaultPanel } from './ActiveFaultPanel'
import { FaultLegendPanel } from './FaultLegendPanel'
import { FaultVariantOverviewPanel } from './FaultVariantOverviewPanel'

type FaultStateAsideProps = {
  activeFaults: ActiveFault[]
  sensors: SensorRow[]
  variants: UiFaultVariant[]
  selectedVariants: Record<string, UiFaultVariant>
}

export function FaultStateAside({
  activeFaults,
  sensors,
  variants,
  selectedVariants,
}: FaultStateAsideProps) {
  return (
    <Stack component="aside" spacing={1.5} aria-label="Fault state">
      <ActiveFaultPanel activeFaults={activeFaults} />
      <FaultLegendPanel />
      <FaultVariantOverviewPanel
        sensors={sensors}
        variants={variants}
        selectedVariants={selectedVariants}
        activeFaults={activeFaults}
      />
    </Stack>
  )
}
