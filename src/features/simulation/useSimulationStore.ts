'use client'

import { create } from 'zustand'
import type { SimulationState } from './simulationState'

type SimulationStore = {
  componentState: SimulationState | null
  error: string | null
  refresh: (signal: AbortSignal) => Promise<void>
}

// Updated only by client-side polling; components subscribe to the fields they need.
export const useSimulationStore = create<SimulationStore>()((set) => ({
  componentState: null,
  error: null,
  refresh: async (signal) => {
    try {
      const response = await fetch('/api/simulation/state', { cache: 'no-store', signal })
      if (!response.ok) throw new Error('Unable to refresh simulation state.')
      const componentState: SimulationState = await response.json()
      if (!signal.aborted) set({ componentState, error: null })
    } catch {
      // Retain the last successful snapshot and ignore requests cancelled on unmount.
      if (!signal.aborted) set({ error: 'Unable to refresh state. Any values shown may be out of date. Retrying…' })
    }
  },
}))
