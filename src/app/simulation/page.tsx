'use client'

import { useEffect, useState } from 'react'
import { Alert, Box, Typography } from '@mui/material'
import type { SimulationState } from '@/features/simulation/simulationState'

export default function SimulationPage() {
  const [state, setState] = useState<SimulationState | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function refresh() {
      try {
        const response = await fetch('/api/simulation/state', { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error('Unable to read state')
        const next: SimulationState = await response.json()
        if (!controller.signal.aborted) { setState(next); setError(false) }
      } catch {
        if (!controller.signal.aborted) setError(true)
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 1000)
      }
    }
    void refresh()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [])

  return (
    <Box component="main" sx={{ p: 3 }}>
      <Typography component="h1" variant="h4">Simulation state</Typography>
      <Typography>Updates from the command screen appear here automatically.</Typography>
      {error && <Alert severity="error">Unable to refresh state. Any values shown may be out of date. Retrying…</Alert>}
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
