import {
  Box,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import {
  FAULT_CLASSES,
  getFaultVariantColor,
  getFaultVariantLabel,
  type ActiveFault,
  type FaultClass,
  type FaultVariantId,
  type SensorRow,
} from './faultModel'
import { panelSx, panelTitleSx } from './faultUiStyles'

type FaultVariantOverviewPanelProps = {
  sensors: SensorRow[]
  selectedVariants: Record<string, FaultVariantId>
  activeFaults: ActiveFault[]
}

type FaultClassSummary = {
  faultClass: FaultClass
  sensorCount: number
  activeCount: number
}

export function FaultVariantOverviewPanel({
  sensors,
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
  const configuredFaultClassIds = new Set(
    sensors.map((sensor) => sensor.faultClassId),
  )
  const summaries = FAULT_CLASSES.filter((faultClass) =>
    configuredFaultClassIds.has(faultClass.id),
  ).map((faultClass) =>
    buildFaultClassSummary(faultClass, sensors, activeFaults),
  )

  return (
    <Paper variant="outlined" sx={panelSx}>
      <Typography sx={panelTitleSx}>Fault classes</Typography>

      <Stack spacing={1.25} sx={{ mt: 1.25 }}>
        {summaries.map((summary) => (
          <FaultClassRow
            key={summary.faultClass.id}
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
              label={`${sensor.name}: ${getFaultVariantLabel(
                sensor,
                selectedVariants[sensor.id],
              )}`}
              sx={{
                maxWidth: '100%',
                border: '1px solid #33404d',
                bgcolor: '#141a21',
                color: getFaultVariantColor(
                  sensor,
                  selectedVariants[sensor.id],
                ),
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

function FaultClassRow({
  summary,
  totalSensors,
}: {
  summary: FaultClassSummary
  totalSensors: number
}) {
  const configuredPercent =
    totalSensors === 0 ? 0 : (summary.sensorCount / totalSensors) * 100
  const classColor = summary.faultClass.variants[0]?.color ?? '#c5d0da'

  return (
    <Box>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}
      >
        <Typography
          sx={{ color: classColor, fontWeight: 800 }}
        >
          {summary.faultClass.label}
        </Typography>
        <Typography sx={{ color: '#c5d0da' }}>
          {summary.sensorCount} configured / {summary.activeCount} active
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={configuredPercent}
        sx={{
          height: 8,
          borderRadius: 999,
          bgcolor: '#111820',
          '& .MuiLinearProgress-bar': {
            borderRadius: 999,
            bgcolor: classColor,
          },
        }}
      />
    </Box>
  )
}

function buildFaultClassSummary(
  faultClass: FaultClass,
  sensors: SensorRow[],
  activeFaults: ActiveFault[],
): FaultClassSummary {
  return {
    faultClass,
    sensorCount: sensors.filter(
      (sensor) => sensor.faultClassId === faultClass.id,
    ).length,
    activeCount: activeFaults.filter(
      (fault) => fault.faultClassId === faultClass.id,
    )
      .length,
  }
}
