import { Alert, Box, Paper, Stack, Typography } from '@mui/material'
import {
  formatFaultLabel,
  getFaultClass,
  getFaultVariantLabel,
  getSensorById,
  type ActiveFault,
  type SensorRow,
} from './faultModel'
import { activeFaultItemSx, alertPanelSx, panelTitleSx } from './faultUiStyles'

type ActiveFaultPanelProps = {
  activeFaults: ActiveFault[]
  sensors: SensorRow[]
}

export function ActiveFaultPanel({
  activeFaults,
  sensors,
}: ActiveFaultPanelProps) {
  return (
    <Paper variant="outlined" sx={alertPanelSx}>
      <Typography sx={panelTitleSx}>Faults in system</Typography>
      {activeFaults.length === 0 ? (
        <Alert severity="success" sx={{ mt: 1 }}>
          System is clear
        </Alert>
      ) : (
        <Stack spacing={1}>
          {activeFaults.map((fault) => {
            const sensor = getSensorById(sensors, fault.sensorId)
            const sensorName = sensor?.name ?? formatFaultLabel(fault.sensorId)
            const faultClassLabel = sensor
              ? getFaultClass(sensor).label
              : 'Unknown'
            const variantLabel = sensor
              ? getFaultVariantLabel(sensor, fault.variant)
              : formatFaultLabel(fault.variant)

            return (
              <Box key={fault.sensorId} sx={activeFaultItemSx}>
                <Typography sx={{ fontWeight: 800 }}>
                  {sensorName} -&gt; {variantLabel}
                </Typography>
                <Typography sx={{ color: '#c5d0da' }}>
                  {faultClassLabel} fault, {fault.detail}, elapsed{' '}
                  {fault.insertedAt}
                </Typography>
              </Box>
            )
          })}
        </Stack>
      )}
    </Paper>
  )
}
