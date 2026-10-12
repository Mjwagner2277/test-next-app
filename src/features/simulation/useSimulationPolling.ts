'use client'

import { useEffect } from 'react'
import { useSimulationStore } from './useSimulationStore'

// Mount once in the page (or shared layout) whose children consume simulation state.
export function useSimulationPolling() {
  const refresh = useSimulationStore((store) => store.refresh)

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      await refresh(controller.signal)
      // Schedule after completion so slow requests never overlap.
      if (!controller.signal.aborted) timer = setTimeout(poll, 1000)
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [refresh])
}
