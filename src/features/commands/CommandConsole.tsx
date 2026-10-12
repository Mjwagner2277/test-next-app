'use client'

import { useState } from 'react'
import { Box, Tab, Tabs, Typography } from '@mui/material'
import { COMMAND_TABS } from './commandConfig'
import { CommandButton } from './CommandButton'
import { TabPanel } from './TabPanel'

export function CommandConsole() {
  const [selectedIndex, setSelectedIndex] = useState(0)
  return (
    <Box component="main" sx={{ minHeight: '100svh', bgcolor: '#0f151c', color: '#eef4f8', p: { xs: 1, md: 3 } }}>
      <Box component="header" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 3 }}>
        <Box>
          <Typography sx={{ color: '#91a5b6', mb: 0.5 }}>Operator console</Typography>
          <Typography component="h1" sx={{ fontSize: { xs: 26, md: 36 }, fontWeight: 800 }}>Commands</Typography>
        </Box>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '100px minmax(0, 1fr)', sm: '180px minmax(0, 1fr)', lg: '224px minmax(0, 1fr)' }, minHeight: 'calc(100svh - 150px)', border: '1px solid #33404d', borderRadius: 2, overflow: 'hidden' }}>
        <Box component="nav" aria-label="Command groups" sx={{ bgcolor: '#141f29', borderRight: '1px solid #33404d', py: 2 }}>
          <Tabs orientation="vertical" value={selectedIndex} onChange={(_, value: number) => setSelectedIndex(value)} aria-label="Command groups" sx={{ '& .MuiTabs-indicator': { left: 0, right: 'auto', width: 4, bgcolor: '#55d6c2' } }}>
            {COMMAND_TABS.map((tab, index) => (
              <Tab key={tab.id} value={index} label={tab.label} id={`command-tab-${tab.id}`} aria-controls={`command-panel-${tab.id}`} sx={{ minHeight: 88, fontSize: { xs: 18, sm: 22 }, color: '#b9c9d5', touchAction: 'manipulation', '&.Mui-selected': { color: '#77e7d6', bgcolor: '#213943' }, '&.Mui-focusVisible': { outline: '3px solid #77e7d6', outlineOffset: -3 } }} />
            ))}
          </Tabs>
        </Box>
        {COMMAND_TABS.map((tab, index) => (
          <TabPanel key={tab.id} value={selectedIndex} index={index} id={tab.id}>
            <Typography component="h2" sx={{ fontSize: 26, fontWeight: 800, mb: 1 }}>{tab.label}</Typography>
            <Typography sx={{ color: '#a6bac9', mb: 3 }}>Select a command to run.</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gridAutoRows: '1fr', gap: 2 }}>
              {tab.buttons.map((button) => (
                <CommandButton key={button.id} button={button} />
              ))}
            </Box>
          </TabPanel>
        ))}
      </Box>
    </Box>
  )
}
