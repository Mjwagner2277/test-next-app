import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import SensorsIcon from '@mui/icons-material/Sensors'
import {
  Button,
  Chip,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import type {
  ActiveFault,
  FaultVariantId,
  SelectedFaultVariants,
  SensorRow,
} from './faultModel'
import {
  getFaultClass,
  getFaultVariantLabel,
  getFaultVariantOptions,
  getSelectedFaultVariant,
} from './faultModel'
import {
  injectedChipSx,
  injectButtonSx,
  readyChipSx,
  removeButtonSx,
  selectSx,
} from './faultUiStyles'

type SensorFaultMatrixProps = {
  sensors: SensorRow[]
  selectedVariants: SelectedFaultVariants
  activeFaultBySensorId: Map<string, ActiveFault>
  canCall: boolean
  onSelectVariant: (sensorId: string, variant: FaultVariantId) => void
  onInjectFault: (sensor: SensorRow) => void
  onClearFault: (sensor: SensorRow) => void
}

export function SensorFaultMatrix({
  sensors,
  selectedVariants,
  activeFaultBySensorId,
  canCall,
  onSelectVariant,
  onInjectFault,
  onClearFault,
}: SensorFaultMatrixProps) {
  return (
    <TableContainer
      component={Paper}
      variant="outlined"
      sx={{
        overflowX: 'auto',
        borderColor: '#33404d',
        borderRadius: 1,
        bgcolor: '#1d2530',
      }}
    >
      <Table
        size="small"
        aria-label="Sensor faults available for injection"
        sx={{
          minWidth: { xs: 640, md: 760 },
          '& th': {
            py: 1.25,
            color: '#aab6c2',
            borderColor: '#33404d',
            fontSize: 12,
            fontWeight: 800,
            textTransform: 'uppercase',
          },
          '& td': {
            py: 1.25,
            color: '#eef4f8',
            borderColor: '#33404d',
          },
          '& tbody tr:last-child td': {
            borderBottom: 0,
          },
        }}
      >
        <TableHead>
          <TableRow>
            <TableCell>Sensor</TableCell>
            <TableCell>Live reading</TableCell>
            <TableCell>Fault variant</TableCell>
            <TableCell align="center">In system</TableCell>
            <TableCell>Action</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sensors.map((sensor) => {
            const activeFault = activeFaultBySensorId.get(sensor.id)
            const isInjected = activeFault !== undefined
            const faultClass = getFaultClass(sensor)
            const variantOptions = getFaultVariantOptions(sensor)
            const selectedVariant = getSelectedFaultVariant(
              sensor,
              selectedVariants,
            )

            return (
              <TableRow
                key={sensor.id}
                sx={{
                  bgcolor: isInjected ? '#4a1d19' : 'transparent',
                }}
              >
                <TableCell>
                  <Stack spacing={0.25}>
                    <Typography sx={{ fontWeight: 800 }}>
                      {sensor.name}
                    </Typography>
                    <Typography sx={{ color: '#c5d0da' }}>
                      {sensor.location}
                    </Typography>
                  </Stack>
                </TableCell>
                <TableCell>{sensor.liveReading}</TableCell>
                <TableCell sx={{ width: { xs: 210, md: 260, lg: 360 } }}>
                  <Stack spacing={0.75}>
                    <Typography
                      sx={{
                        color: '#aab6c2',
                        fontSize: 12,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                      }}
                    >
                      {faultClass.label}
                    </Typography>
                    <Select
                      fullWidth
                      size="small"
                      value={selectedVariant}
                      displayEmpty
                      renderValue={(selected) =>
                        typeof selected === 'string' && selected.length > 0
                          ? getFaultVariantLabel(sensor, selected)
                          : 'Select fault'
                      }
                      onChange={(event) =>
                        onSelectVariant(
                          sensor.id,
                          event.target.value as FaultVariantId,
                        )
                      }
                      disabled={isInjected}
                      aria-label={`${sensor.name} fault variant`}
                      // The MUI Select menu is rendered in a portal outside this
                      // table. Keep its layout explicit so the fault options show
                      // as separate selectable rows.
                      MenuProps={{
                        sx: {
                          '& .MuiPaper-root': {
                            border: '1px solid #33404d',
                            bgcolor: '#111820',
                            color: '#eef4f8',
                          },
                          '& .MuiMenu-list': {
                            display: 'flex',
                            flexDirection: 'column',
                            p: 0.5,
                          },
                        },
                      }}
                      sx={selectSx}
                    >
                      {variantOptions.map((faultVariant) => (
                        <MenuItem
                          key={faultVariant.id}
                          value={faultVariant.id}
                          sx={{
                            display: 'flex',
                            width: '100%',
                            justifyContent: 'flex-start',
                          }}
                        >
                          {faultVariant.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </Stack>
                </TableCell>
                <TableCell align="center" sx={{ width: { xs: 135, md: 160 } }}>
                  <Chip
                    size="small"
                    label={
                      isInjected
                        ? `${getFaultVariantLabel(
                            sensor,
                            activeFault.variant,
                          )} injected`
                        : 'Not inserted'
                    }
                    sx={isInjected ? injectedChipSx : readyChipSx}
                  />
                </TableCell>
                <TableCell>
                  {isInjected ? (
                    <Button
                      variant="outlined"
                      startIcon={<DeleteSweepIcon />}
                      onClick={() => onClearFault(sensor)}
                      disabled={!canCall}
                      sx={removeButtonSx}
                    >
                      Remove
                    </Button>
                  ) : (
                    <Button
                      variant="outlined"
                      startIcon={<SensorsIcon />}
                      onClick={() => onInjectFault(sensor)}
                      disabled={!canCall}
                      sx={injectButtonSx}
                    >
                      Inject
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
