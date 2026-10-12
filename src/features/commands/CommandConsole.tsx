'use client'

import { useRef, useState } from 'react'
import { Alert, Box, Button, Chip, CircularProgress, Tab, Tabs, Typography } from '@mui/material'
import { COMMAND_HANDLERS, COMMAND_TABS, type CommandButtonDefinition } from './commandConfig'

type Notice = { severity: 'success' | 'warning' | 'error'; message: string }

export function CommandConsole() {
  const [tabId, setTabId] = useState(COMMAND_TABS[0]?.id ?? '')
  const [pending, setPending] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const inFlight = useRef(false)
  const selectedTab = COMMAND_TABS.find((tab) => tab.id === tabId)

  async function execute(button: CommandButtonDefinition) {
    // The ref also blocks rapid double taps before React renders disabled buttons.
    if (inFlight.current) return
    const handler = COMMAND_HANDLERS[button.commandId]
    if (!handler) {
      setNotice({ severity: 'warning', message: `${button.label} is not connected yet.` })
      return
    }
    inFlight.current = true
    setPending(button.id)
    setNotice(null)
    try {
      await handler()
      setNotice({ severity: 'success', message: `${button.label} completed.` })
    } catch (error) {
      setNotice({ severity: 'error', message: `${button.label} failed: ${error instanceof Error ? error.message : 'Unable to complete command.'}` })
    } finally {
      inFlight.current = false
      setPending(null)
    }
  }

  return (
    <Box component="main" sx={{ minHeight: '100svh', bgcolor: '#0f151c', color: '#eef4f8', p: { xs: 1, md: 3 } }}>
      <Box component="header" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 3 }}>
        <Box>
          <Typography sx={{ color: '#91a5b6', mb: 0.5 }}>Operator console</Typography>
          <Typography component="h1" sx={{ fontSize: { xs: 26, md: 36 }, fontWeight: 800 }}>Commands</Typography>
        </Box>
        <Chip label={pending ? 'Command in progress' : 'Ready'} sx={{ bgcolor: '#20303b', color: '#eef4f8' }} />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '100px minmax(0, 1fr)', sm: '180px minmax(0, 1fr)', lg: '224px minmax(0, 1fr)' }, minHeight: 'calc(100svh - 150px)', border: '1px solid #33404d', borderRadius: 2, overflow: 'hidden' }}>
        <Box component="nav" aria-label="Command groups" sx={{ bgcolor: '#141f29', borderRight: '1px solid #33404d', py: 2 }}>
          <Tabs orientation="vertical" value={tabId || false} onChange={(_, value: string) => { setTabId(value); setNotice(null) }} aria-label="Command groups" sx={{ '& .MuiTabs-indicator': { left: 0, right: 'auto', width: 4, bgcolor: '#55d6c2' } }}>
            {COMMAND_TABS.map((tab) => (
              <Tab key={tab.id} value={tab.id} label={tab.label} id={`command-tab-${tab.id}`} aria-controls={`command-panel-${tab.id}`} sx={{ minHeight: 88, fontSize: { xs: 18, sm: 22 }, color: '#b9c9d5', touchAction: 'manipulation', '&.Mui-selected': { color: '#77e7d6', bgcolor: '#213943' }, '&.Mui-focusVisible': { outline: '3px solid #77e7d6', outlineOffset: -3 } }} />
            ))}
          </Tabs>
        </Box>
        {selectedTab ? (
          <Box role="tabpanel" id={`command-panel-${selectedTab.id}`} aria-labelledby={`command-tab-${selectedTab.id}`} sx={{ p: { xs: 1.5, md: 4 }, minWidth: 0 }}>
            <Typography component="h2" sx={{ fontSize: 26, fontWeight: 800, mb: 1 }}>{selectedTab.label}</Typography>
            <Typography sx={{ color: '#a6bac9', mb: 3 }}>Select a command to run.</Typography>
            <Box aria-live="polite" aria-atomic="true" sx={{ mb: 3 }}>
              {notice && <Alert severity={notice.severity}>{notice.message}</Alert>}
              {pending && <Typography role="status">Running command…</Typography>}
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 2 }}>
              {selectedTab.buttons.map((button) => (
                <Button key={button.id} variant="outlined" disabled={pending !== null} onClick={() => { void execute(button) }} sx={{ minHeight: 144, p: 3, display: 'flex', flexDirection: 'column', gap: 1, fontSize: 22, bgcolor: '#20303b', color: '#eef4f8', borderColor: '#4d6475', touchAction: 'manipulation', '&:hover': { bgcolor: '#2c4552', borderColor: '#77e7d6' }, '&:active': { bgcolor: '#315a63' }, '&.Mui-focusVisible': { outline: '3px solid #77e7d6', outlineOffset: 3 }, '&.Mui-disabled': { color: '#99aab7', borderColor: '#3c4c59' } }}>
                  {pending === button.id && <CircularProgress size={24} color="inherit" />}
                  <span>{button.label}</span>
                  {button.description && <Typography component="span" sx={{ fontSize: 16, color: 'inherit' }}>{button.description}</Typography>}
                  {!COMMAND_HANDLERS[button.commandId] && <Typography component="span" sx={{ fontSize: 14, color: '#a6bac9' }}>Not connected</Typography>}
                </Button>
              ))}
            </Box>
          </Box>
        ) : <Typography sx={{ p: 3 }}>No command tabs defined.</Typography>}
      </Box>
    </Box>
  )
}
