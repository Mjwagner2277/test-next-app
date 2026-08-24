import RestartAltIcon from '@mui/icons-material/RestartAlt'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { Box, Button, Chip, Stack, Typography } from '@mui/material'

type FaultConsoleHeaderProps = {
  faultCount: number
  isBusy: boolean
  onResetSystem: () => void
}

export function FaultConsoleHeader({
  faultCount,
  isBusy,
  onResetSystem,
}: FaultConsoleHeaderProps) {
  return (
    <Box
      component="header"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) auto' },
        gap: 1.5,
        alignItems: 'center',
        p: 2,
        borderBottom: '1px solid #33404d',
        bgcolor: '#111820',
      }}
    >
      <Box>
        <Typography
          sx={{
            color: '#aab6c2',
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          Sensor failure injection
        </Typography>
        <Typography component="h1" variant="h2" sx={{ color: '#f7fafc' }}>
          Sensor Fault Matrix
        </Typography>
      </Box>

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.25}
        sx={{ alignItems: { xs: 'stretch', sm: 'center' } }}
      >
        <Chip
          icon={<WarningAmberIcon />}
          label={`${faultCount} fault${faultCount === 1 ? '' : 's'} in system`}
          sx={{
            minHeight: 36,
            border: '1px solid',
            borderColor: faultCount > 0 ? '#ff8d80' : '#71cf84',
            bgcolor: faultCount > 0 ? '#421c18' : '#163b1f',
            color: faultCount > 0 ? '#ffb0a6' : '#b6f1bf',
            fontWeight: 800,
            '& .MuiChip-icon': { color: 'inherit' },
          }}
        />
        <Button
          variant="outlined"
          startIcon={<RestartAltIcon />}
          onClick={onResetSystem}
          // Reset stays available during local UI review and when there are no
          // active faults. Only an in-flight RPC disables it to prevent double
          // submitting the command.
          disabled={isBusy}
          sx={{
            minHeight: 36,
            borderColor: '#4cc9d4',
            color: '#8ae4ec',
            bgcolor: '#10383d',
            fontWeight: 800,
            '&:hover': {
              borderColor: '#8ae4ec',
              bgcolor: '#164a51',
            },
            '&.Mui-disabled': {
              borderColor: '#33404d',
              color: '#aab6c2',
              bgcolor: '#1d2530',
            },
          }}
        >
          System reset
        </Button>
      </Stack>
    </Box>
  )
}
