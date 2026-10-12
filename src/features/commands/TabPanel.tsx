import type { ReactNode } from 'react'
import { Box } from '@mui/material'

type TabPanelProps = {
  value: number
  index: number
  id: string
  children: ReactNode
}

export function TabPanel({ value, index, id, children }: TabPanelProps) {
  return (
    <Box
      role="tabpanel"
      id={`command-panel-${id}`}
      aria-labelledby={`command-tab-${id}`}
      hidden={value !== index}
      sx={{ p: { xs: 1.5, md: 4 }, minWidth: 0 }}
    >
      {value === index && children}
    </Box>
  )
}
