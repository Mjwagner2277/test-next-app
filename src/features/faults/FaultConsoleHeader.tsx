import AutorenewIcon from '@mui/icons-material/Autorenew'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { Box, Button, Chip, Stack, Typography } from '@mui/material'
import { commandButtonSx } from './faultUiStyles'

type FaultConsoleHeaderProps = {
  faultCount: number
  canCall: boolean
  onRefreshState: () => void
  onResetSystem: () => void
}

export function FaultConsoleHeader({
  faultCount,
  canCall,
  onRefreshState,
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
          startIcon={<AutorenewIcon />}
          onClick={onRefreshState}
          disabled={!canCall}
          sx={commandButtonSx}
        >
          Refresh state
        </Button>
        <Button
          variant="outlined"
          color="error"
          startIcon={<RestartAltIcon />}
          onClick={onResetSystem}
          disabled={!canCall || faultCount === 0}
          sx={{
            minHeight: 36,
            borderColor: '#ff8d80',
            color: '#ffb0a6',
            bgcolor: '#421c18',
            '&:hover': {
              borderColor: '#ffb0a6',
              bgcolor: '#55231f',
            },
          }}
        >
          System reset
        </Button>
      </Stack>
    </Box>
  )
}
