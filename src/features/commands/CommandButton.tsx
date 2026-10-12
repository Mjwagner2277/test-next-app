'use client'

import { useRef, useState } from 'react'
import { Alert, Box, Button, Typography } from '@mui/material'
import type { CommandButtonDefinition } from './commandConfig'

export function CommandButton({ button }: { button: CommandButtonDefinition }) {
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<{ error: boolean; message: string } | null>(null)
  const inFlight = useRef(false)

  async function sendUpdate() {
    if (inFlight.current || !button.stateUpdate) return
    inFlight.current = true
    setPending(true)
    setResult(null)
    try {
      const response = await fetch('/api/simulation/state', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(button.stateUpdate),
      })
      if (!response.ok) throw new Error('The server could not save this state update.')
      setResult({ error: false, message: 'Simulation state updated.' })
    } catch (error) {
      setResult({ error: true, message: error instanceof Error ? error.message : 'Unable to update simulation state.' })
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
      <Button
        variant="outlined"
        disabled={pending || !button.stateUpdate}
        onClick={() => { void sendUpdate() }}
        sx={{ width: '100%', minWidth: 0, minHeight: 144, flex: 1, p: 3, display: 'flex', flexDirection: 'column', gap: 1, fontSize: 22, bgcolor: '#20303b', color: '#eef4f8', borderColor: '#4d6475', touchAction: 'manipulation', '&:hover': { bgcolor: '#2c4552', borderColor: '#77e7d6' }, '&:active': { bgcolor: '#315a63' }, '&.Mui-focusVisible': { outline: '3px solid #77e7d6', outlineOffset: 3 }, '&.Mui-disabled': { color: '#99aab7', borderColor: '#3c4c59' } }}
      >
        <span>{pending ? 'Sending…' : button.label}</span>
        {button.description && <Typography component="span" sx={{ fontSize: 16, color: 'inherit' }}>{button.description}</Typography>}
      </Button>
      <Box aria-live="polite">
        {result && <Alert severity={result.error ? 'error' : 'success'}>{result.message}</Alert>}
      </Box>
    </Box>
  )
}
