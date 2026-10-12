'use client'

import { Box, Button, Typography } from '@mui/material'
import type { CommandButtonDefinition } from './commandConfig'
import type { StateStep } from './runStateSequence'

type Props = {
  button: CommandButtonDefinition
  disabled: boolean
  pending: boolean
  onStateUpdate: (steps: readonly StateStep[], buttonId: string) => Promise<void>
}

export function CommandButton({ button, disabled, pending, onStateUpdate }: Props) {
  const steps = button.sequence ?? (button.stateUpdate ? [{ offsetMs: 0, stateUpdate: button.stateUpdate }] : [])
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
      <Button
        variant="outlined"
        disabled={disabled || steps.length === 0}
        onClick={() => { if (steps.length) void onStateUpdate(steps, button.id) }}
        sx={{ width: '100%', minWidth: 0, minHeight: 144, flex: 1, p: 3, display: 'flex', flexDirection: 'column', gap: 1, fontSize: 22, bgcolor: '#20303b', color: '#eef4f8', borderColor: '#4d6475', touchAction: 'manipulation', '&:hover': { bgcolor: '#2c4552', borderColor: '#77e7d6' }, '&:active': { bgcolor: '#315a63' }, '&.Mui-focusVisible': { outline: '3px solid #77e7d6', outlineOffset: 3 }, '&.Mui-disabled': { color: '#99aab7', borderColor: '#3c4c59' } }}
      >
        <span>{pending ? 'Running…' : button.label}</span>
        {button.description && <Typography component="span" sx={{ fontSize: 16, color: 'inherit' }}>{button.description}</Typography>}
      </Button>
    </Box>
  )
}
