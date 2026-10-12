'use client'

import { Alert, Box, Typography } from '@mui/material'
import { useSimulationStore } from '@/features/simulation/useSimulationStore'
import { useSimulationPolling } from '@/features/simulation/useSimulationPolling'

export default function SimulationPage() {
  useSimulationPolling()
  const state = useSimulationStore((store) => store.componentState)
  const error = useSimulationStore((store) => store.error)

  return (
    <Box component="main" sx={{ p: 3 }}>
      <Typography component="h1" variant="h4">Simulation state</Typography>
      <Typography>Updates from the command screen appear here automatically.</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {state === null ? <Typography>Loading state…</Typography> : Object.keys(state).length === 0 ? (
        <Typography>No component values have been set yet.</Typography>
      ) : (
        <Box component="dl">
          {Object.entries(state).map(([name, value]) => (
            <Box key={name} sx={{ mb: 2 }}>
              <Typography component="dt" sx={{ fontWeight: 'bold' }}>{name}</Typography>
              <Typography component="dd" sx={{ ml: 0 }}>{String(value)}</Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
