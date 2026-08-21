import { Box, Paper, Stack, Typography } from '@mui/material'
import { panelSx, panelTitleSx } from './faultUiStyles'

export function FaultLegendPanel() {
  return (
    <Paper variant="outlined" sx={panelSx}>
      <Typography sx={panelTitleSx}>State legend</Typography>
      <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap' }}>
        <LegendItem color="#71cf84" label="Normal reading" />
        <LegendItem color="#f0bf58" label="Variant selected" />
        <LegendItem color="#ff8d80" label="Fault inserted" />
      </Stack>
    </Paper>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
      <Box
        component="span"
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          bgcolor: color,
          flex: '0 0 auto',
        }}
      />
      <Typography sx={{ color: '#c5d0da' }}>{label}</Typography>
    </Stack>
  )
}
