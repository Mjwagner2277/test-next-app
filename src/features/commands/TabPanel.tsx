import type { ReactNode } from 'react'
import { Box } from '@mui/material'

type TabPanelProps = {
  value: string
  id: string
  children: ReactNode
}

export function TabPanel({ value, id, children }: TabPanelProps) {
  return (
    <Box
      role="tabpanel"
      id={`command-panel-${id}`}
      aria-labelledby={`command-tab-${id}`}
      hidden={value !== id}
      sx={{ p: { xs: 1.5, md: 4 }, minWidth: 0 }}
    >
      {value === id && children}
    </Box>
  )
}
