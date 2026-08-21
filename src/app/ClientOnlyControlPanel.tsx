'use client'

import { useEffect, useState } from 'react'
import { ControlPanelConsole } from './ControlPanelConsole'

export function ClientOnlyControlPanel() {
  // MUI styles are generated in the browser for this operator console. Rendering
  // the heavy interactive surface only after mount avoids server/client Emotion
  // style-order mismatches in this minimal scaffold.
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  return <ControlPanelConsole />
}
