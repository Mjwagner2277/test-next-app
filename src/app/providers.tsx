'use client'

// MUI's ThemeProvider needs to run on the client because it participates in
// React rendering and style injection for interactive pages.
import { ThemeProvider } from '@mui/material/styles'
import type { ReactNode } from 'react'
import { appTheme } from './theme'

type ProvidersProps = {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  // globals.css handles the small reset this scaffold needs. Avoiding
  // CssBaseline keeps the minimal MUI setup from inserting a server-rendered
  // Emotion global style that can drift from the client render order.
  return <ThemeProvider theme={appTheme}>{children}</ThemeProvider>
}
