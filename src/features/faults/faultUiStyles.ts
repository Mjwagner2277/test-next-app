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
