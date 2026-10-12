'use client'

import { Box, Button, Typography } from '@mui/material'
import type { CommandButtonDefinition } from './commandConfig'
import type { SimulationState } from '../simulation/simulationState'

type Props = {
  button: CommandButtonDefinition
  disabled: boolean
  pending: boolean
  onStateUpdate: (changes: SimulationState, buttonId: string) => Promise<void>
}

export function CommandButton({ button, disabled, pending, onStateUpdate }: Props) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
      <Button
        variant="outlined"
        disabled={disabled || !button.stateUpdate}
        onClick={() => { if (button.stateUpdate) void onStateUpdate(button.stateUpdate, button.id) }}
        sx={{ width: '100%', minWidth: 0, minHeight: 144, flex: 1, p: 3, display: 'flex', flexDirection: 'column', gap: 1, fontSize: 22, bgcolor: '#20303b', color: '#eef4f8', borderColor: '#4d6475', touchAction: 'manipulation', '&:hover': { bgcolor: '#2c4552', borderColor: '#77e7d6' }, '&:active': { bgcolor: '#315a63' }, '&.Mui-focusVisible': { outline: '3px solid #77e7d6', outlineOffset: 3 }, '&.Mui-disabled': { color: '#99aab7', borderColor: '#3c4c59' } }}
      >
        <span>{pending ? 'Sending…' : button.label}</span>
        {button.description && <Typography component="span" sx={{ fontSize: 16, color: 'inherit' }}>{button.description}</Typography>}
      </Button>
    </Box>
  )
}
