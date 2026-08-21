import { Alert, Box, Paper, Stack, Typography } from '@mui/material'
import type { ActiveFault } from './faultModel'
import { activeFaultItemSx, alertPanelSx, panelTitleSx } from './faultUiStyles'

type ActiveFaultPanelProps = {
  activeFaults: ActiveFault[]
}

export function ActiveFaultPanel({ activeFaults }: ActiveFaultPanelProps) {
  return (
    <Paper variant="outlined" sx={alertPanelSx}>
      <Typography sx={panelTitleSx}>Faults in system</Typography>
      {activeFaults.length === 0 ? (
        <Alert severity="success" sx={{ mt: 1 }}>
          System is clear
        </Alert>
      ) : (
        <Stack spacing={1}>
          {activeFaults.map((fault) => (
            <Box key={fault.sensorId} sx={activeFaultItemSx}>
              <Typography sx={{ fontWeight: 800 }}>
                {fault.sensorName} -&gt; {fault.variant}
              </Typography>
              <Typography sx={{ color: '#c5d0da' }}>
                {fault.detail}, elapsed {fault.insertedAt}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}
    </Paper>
  )
}
