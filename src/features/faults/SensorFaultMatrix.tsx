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
  SensorRow,
  UiFaultVariant,
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
  variants: UiFaultVariant[]
  selectedVariants: Record<string, UiFaultVariant>
  activeFaultBySensorId: Map<string, ActiveFault>
  canCall: boolean
  onSelectVariant: (sensorId: string, variant: UiFaultVariant) => void
  onInjectFault: (sensor: SensorRow) => void
  onClearFault: (sensor: SensorRow) => void
}

export function SensorFaultMatrix({
  sensors,
  variants,
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
          minWidth: 760,
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
                <TableCell sx={{ width: { xs: 260, lg: 360 } }}>
                  <Select
                    fullWidth
                    size="small"
                    value={selectedVariants[sensor.id]}
                    displayEmpty
                    renderValue={(selected) =>
                      typeof selected === 'string' && selected.length > 0
                        ? selected
                        : 'Select fault'
                    }
                    onChange={(event) =>
                      onSelectVariant(
                        sensor.id,
                        event.target.value as UiFaultVariant,
                      )
                    }
                    disabled={isInjected}
                    aria-label={`${sensor.name} fault variant`}
                    // The MUI Select menu is rendered in a portal outside this
                    // table. Keep its layout explicit so the fault options show
                    // as three selectable rows instead of collapsing inline.
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
                    {variants.map((variant) => (
                      <MenuItem
                        key={variant}
                        value={variant}
                        sx={{
                          display: 'flex',
                          width: '100%',
                          justifyContent: 'flex-start',
                        }}
                      >
                        {variant}
                      </MenuItem>
                    ))}
                  </Select>
                </TableCell>
                <TableCell align="center" sx={{ width: 160 }}>
                  <Chip
                    size="small"
                    label={
                      isInjected
                        ? `${activeFault.variant} injected`
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
