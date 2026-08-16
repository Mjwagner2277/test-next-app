'use client'

// MUI's ThemeProvider and CssBaseline need to run on the client because they
// participate in React rendering and style injection for interactive pages.
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import type { ReactNode } from 'react'
import { appTheme } from './theme'

type ProvidersProps = {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider theme={appTheme}>
      {/* CssBaseline gives MUI a predictable browser reset. */}
      <CssBaseline />
      {children}
    </ThemeProvider>
  )
}
