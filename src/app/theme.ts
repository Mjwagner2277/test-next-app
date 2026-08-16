import { createTheme } from '@mui/material/styles'

// Keep shared visual decisions here instead of repeating them across every
// component. The page can still use sx for layout-specific details.
export const appTheme = createTheme({
  // The palette avoids a single-hue dashboard look: teal for primary actions,
  // blue for secondary actions, and orange for destructive/stop actions.
  palette: {
    background: {
      default: '#f4f7f6',
      paper: '#ffffff',
    },
    primary: {
      main: '#0f766e',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#2563eb',
      contrastText: '#ffffff',
    },
    warning: {
      main: '#c2410c',
      contrastText: '#ffffff',
    },
    text: {
      primary: '#15221f',
      secondary: '#65746f',
    },
  },
  shape: {
    // MUI interprets this as px. It keeps cards/buttons compact and work-tool
    // oriented instead of oversized.
    borderRadius: 8,
  },
  typography: {
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: {
      fontSize: 'clamp(2rem, 4vw, 3.25rem)',
      fontWeight: 800,
      lineHeight: 1.05,
      letterSpacing: 0,
    },
    h2: {
      fontSize: '1rem',
      fontWeight: 800,
      letterSpacing: 0,
    },
    button: {
      fontWeight: 800,
      letterSpacing: 0,
      textTransform: 'none',
    },
  },
  components: {
    // Component overrides are defaults for the whole app. Use these for rules
    // that should apply everywhere rather than styling each button/card.
    MuiButton: {
      styleOverrides: {
        root: {
          minHeight: 58,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
  },
})
