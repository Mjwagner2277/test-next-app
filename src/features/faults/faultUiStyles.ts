export const panelSx = {
  p: 1.5,
  borderColor: '#33404d',
  borderRadius: 1,
  bgcolor: '#1d2530',
  color: '#eef4f8',
}

export const alertPanelSx = {
  ...panelSx,
  borderColor: '#ff8d80',
  bgcolor: '#421c18',
}

export const panelTitleSx = {
  fontSize: 14,
  fontWeight: 800,
  color: '#f7fafc',
}

export const disabledControlSx = {
  opacity: 1,
  borderColor: '#667684',
  color: '#c5d0da',
  bgcolor: '#26313a',
}

const disabledButtonStateSx = {
  '&.Mui-disabled': {
    ...disabledControlSx,
  },
  '&.Mui-disabled .MuiSvgIcon-root': {
    color: '#aab6c2',
  },
}

export const faultConsoleHeaderSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) auto' },
  gap: 1.5,
  alignItems: 'center',
  p: 2,
  borderBottom: '1px solid #33404d',
  bgcolor: '#111820',
}

export const faultConsoleEyebrowSx = {
  color: '#aab6c2',
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 1,
  textTransform: 'uppercase',
}

export const faultConsoleTitleSx = {
  color: '#f7fafc',
}

export const faultConsoleActionsSx = {
  alignItems: { xs: 'stretch', sm: 'center' },
}

export function faultCountChipSx(faultCount: number) {
  return {
    minHeight: 36,
    border: '1px solid',
    borderColor: faultCount > 0 ? '#ff8d80' : '#71cf84',
    bgcolor: faultCount > 0 ? '#421c18' : '#163b1f',
    color: faultCount > 0 ? '#ffb0a6' : '#b6f1bf',
    fontWeight: 800,
    '& .MuiChip-icon': { color: 'inherit' },
  }
}

export const activeFaultItemSx = {
  p: 1.25,
  border: '1px solid #33404d',
  borderRadius: 1,
  bgcolor: '#141a21',
}

export const commandButtonSx = {
  minHeight: 36,
  borderColor: '#4cc9d4',
  color: '#8ae4ec',
  '&:hover': {
    borderColor: '#8ae4ec',
    bgcolor: '#10383d',
  },
  ...disabledButtonStateSx,
}

export const injectButtonSx = {
  ...commandButtonSx,
  minWidth: 112,
}

export const removeButtonSx = {
  minHeight: 36,
  minWidth: 112,
  borderColor: '#ff8d80',
  color: '#ffb0a6',
  '&:hover': {
    borderColor: '#ffb0a6',
    bgcolor: '#421c18',
  },
  ...disabledButtonStateSx,
}

export const resetFaultButtonSx = {
  ...removeButtonSx,
  fontWeight: 800,
}

export const systemResetButtonSx = {
  ...commandButtonSx,
  bgcolor: '#10383d',
  fontWeight: 800,
  '&:hover': {
    borderColor: '#8ae4ec',
    bgcolor: '#164a51',
  },
  ...disabledButtonStateSx,
}

export const selectSx = {
  color: '#eef4f8',
  bgcolor: '#111820',
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: '#33404d',
  },
  '&:hover .MuiOutlinedInput-notchedOutline': {
    borderColor: '#4cc9d4',
  },
  '& .MuiSvgIcon-root': {
    color: '#eef4f8',
  },
  '&.Mui-disabled': {
    opacity: 1,
    bgcolor: '#26313a',
    color: '#c5d0da',
  },
  '& .MuiSelect-select.Mui-disabled': {
    WebkitTextFillColor: '#c5d0da',
  },
  '&.Mui-disabled .MuiOutlinedInput-notchedOutline': {
    borderColor: '#667684',
  },
  '&.Mui-disabled .MuiSvgIcon-root': {
    color: '#aab6c2',
  },
}

export const readyChipSx = {
  bgcolor: '#111820',
  border: '1px solid #33404d',
  color: '#c5d0da',
  fontWeight: 800,
}

export const injectedChipSx = {
  bgcolor: '#4a1d19',
  border: '1px solid #ff8d80',
  color: '#ffb0a6',
  fontWeight: 800,
}
