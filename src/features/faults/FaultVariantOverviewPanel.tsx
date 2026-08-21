import {
  Box,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import type { ActiveFault, SensorRow, UiFaultVariant } from './faultModel'
import { panelSx, panelTitleSx } from './faultUiStyles'

type FaultVariantOverviewPanelProps = {
  sensors: SensorRow[]
  variants: UiFaultVariant[]
  selectedVariants: Record<string, UiFaultVariant>
  activeFaults: ActiveFault[]
}

type VariantSummary = {
  variant: UiFaultVariant
  selectedCount: number
  activeCount: number
}

export function FaultVariantOverviewPanel({
  sensors,
  variants,
  selectedVariants,
  activeFaults,
}: FaultVariantOverviewPanelProps) {
  const activeSensorIds = new Set(activeFaults.map((fault) => fault.sensorId))
  const readySelections = sensors.filter(
    (sensor) => !activeSensorIds.has(sensor.id),
  )
  const visibleReadySelections = readySelections.slice(0, 3)
  const hiddenReadySelectionCount =
    readySelections.length - visibleReadySelections.length
  const summaries = variants.map((variant) =>
    buildVariantSummary(variant, sensors, selectedVariants, activeFaults),
  )

  return (
    <Paper variant="outlined" sx={panelSx}>
      <Typography sx={panelTitleSx}>Variant overview</Typography>

      <Stack spacing={1.25} sx={{ mt: 1.25 }}>
        {summaries.map((summary) => (
          <VariantRow
            key={summary.variant}
            summary={summary}
            totalSensors={sensors.length}
          />
        ))}
      </Stack>

      <Box
        sx={{
          mt: 1.5,
          p: 1.25,
          border: '1px solid #33404d',
          borderRadius: 1,
          bgcolor: '#111820',
        }}
      >
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}
        >
          <Typography
            sx={{
              color: '#aab6c2',
              fontSize: 12,
              fontWeight: 800,
              textTransform: 'uppercase',
            }}
          >
            Ready selections
          </Typography>
          <Chip
            size="small"
            label={readySelections.length}
            sx={{
              bgcolor: '#10383d',
              border: '1px solid #4cc9d4',
              color: '#8ae4ec',
              fontWeight: 800,
            }}
          />
        </Stack>

        <Stack
          direction="row"
          useFlexGap
          spacing={0.75}
          sx={{ flexWrap: 'wrap' }}
        >
          {visibleReadySelections.map((sensor) => (
            <Chip
              key={sensor.id}
              size="small"
              label={`${sensor.name}: ${selectedVariants[sensor.id]}`}
              sx={{
                maxWidth: '100%',
                border: '1px solid #33404d',
                bgcolor: '#141a21',
                color: variantColor(selectedVariants[sensor.id]),
                fontWeight: 800,
              }}
            />
          ))}
          {hiddenReadySelectionCount > 0 ? (
            <Chip
              size="small"
              label={`+${hiddenReadySelectionCount} more`}
              sx={{
                border: '1px solid #33404d',
                bgcolor: '#141a21',
                color: '#aab6c2',
                fontWeight: 800,
              }}
            />
          ) : null}
        </Stack>
      </Box>
    </Paper>
  )
}

function VariantRow({
  summary,
  totalSensors,
}: {
  summary: VariantSummary
  totalSensors: number
}) {
  const selectedPercent =
    totalSensors === 0 ? 0 : (summary.selectedCount / totalSensors) * 100

  return (
    <Box>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}
      >
        <Typography
          sx={{ color: variantColor(summary.variant), fontWeight: 800 }}
        >
          {summary.variant}
        </Typography>
        <Typography sx={{ color: '#c5d0da' }}>
          {summary.selectedCount} selected / {summary.activeCount} active
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={selectedPercent}
        sx={{
          height: 8,
          borderRadius: 999,
          bgcolor: '#111820',
          '& .MuiLinearProgress-bar': {
            borderRadius: 999,
            bgcolor: variantColor(summary.variant),
          },
        }}
      />
    </Box>
  )
}

function buildVariantSummary(
  variant: UiFaultVariant,
  sensors: SensorRow[],
  selectedVariants: Record<string, UiFaultVariant>,
  activeFaults: ActiveFault[],
): VariantSummary {
  return {
    variant,
    selectedCount: sensors.filter(
      (sensor) => selectedVariants[sensor.id] === variant,
    ).length,
    activeCount: activeFaults.filter((fault) => fault.variant === variant)
      .length,
  }
}

function variantColor(variant: UiFaultVariant) {
  switch (variant) {
    case 'High':
      return '#ffb0a6'
    case 'Low':
      return '#8ae4ec'
    case 'Unknown':
      return '#f0bf58'
  }
}
