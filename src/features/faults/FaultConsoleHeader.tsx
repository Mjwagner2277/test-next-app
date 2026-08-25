import RestartAltIcon from '@mui/icons-material/RestartAlt'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import { Box, Button, Chip, Stack, Typography } from '@mui/material'
import {
  faultConsoleActionsSx,
  faultConsoleEyebrowSx,
  faultConsoleHeaderSx,
  faultConsoleTitleSx,
  faultCountChipSx,
  resetFaultButtonSx,
  systemResetButtonSx,
} from './faultUiStyles'

type FaultConsoleHeaderProps = {
  faultCount: number
  canResetFaults: boolean
  isBusy: boolean
  onResetFaults: () => void
  onResetSystem: () => void
}

export function FaultConsoleHeader({
  faultCount,
  canResetFaults,
  isBusy,
  onResetFaults,
  onResetSystem,
}: FaultConsoleHeaderProps) {
  return (
    <Box
      component="header"
      sx={faultConsoleHeaderSx}
    >
      <Box>
        <Typography sx={faultConsoleEyebrowSx}>
          Sensor failure injection
        </Typography>
        <Typography component="h1" variant="h2" sx={faultConsoleTitleSx}>
          Sensor Fault Matrix
        </Typography>
      </Box>

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.25}
        sx={faultConsoleActionsSx}
      >
        <Chip
          icon={<WarningAmberIcon />}
          label={`${faultCount} fault${faultCount === 1 ? '' : 's'} in system`}
          sx={faultCountChipSx(faultCount)}
        />
        <Button
          variant="outlined"
          startIcon={<DeleteSweepIcon />}
          onClick={onResetFaults}
          // Fault reset is tied to the fault workflow. It should only be
          // available when the app can call the service and there is something
          // active to clear.
          disabled={!canResetFaults}
          sx={resetFaultButtonSx}
        >
          Reset faults
        </Button>
        <Button
          variant="outlined"
          startIcon={<RestartAltIcon />}
          onClick={onResetSystem}
          // System reset is a general command and stays available during local
          // UI review. Only an in-flight RPC disables it to prevent double
          // submitting the command.
          disabled={isBusy}
          sx={systemResetButtonSx}
        >
          System reset
        </Button>
      </Stack>
    </Box>
  )
}
