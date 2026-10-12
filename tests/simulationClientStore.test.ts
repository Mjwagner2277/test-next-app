import assert from 'node:assert/strict'
import { test } from 'node:test'
import { useSimulationStore } from '../src/features/simulation/useSimulationStore'

test('poll responses update Zustand, retain last values on failure, and ignore aborted responses', async () => {
  const originalFetch = globalThis.fetch
  const signal = new AbortController().signal
  useSimulationStore.setState({ componentState: null, error: null })
  try {
    globalThis.fetch = async (_input, options) => {
      assert.equal(options?.cache, 'no-store')
      assert.equal(options?.signal, signal)
      return Response.json({ mechanical_component_x: false, position: 0 })
    }
    await useSimulationStore.getState().refresh(signal)
    assert.deepEqual(useSimulationStore.getState().componentState, { mechanical_component_x: false, position: 0 })
    globalThis.fetch = async () => new Response(null, { status: 500 })
    await useSimulationStore.getState().refresh(signal)
    assert.ok(useSimulationStore.getState().error)
    assert.deepEqual(useSimulationStore.getState().componentState, { mechanical_component_x: false, position: 0 })
    globalThis.fetch = async () => Response.json({ mechanical_component_x: true })
    await useSimulationStore.getState().refresh(signal)
    assert.deepEqual(useSimulationStore.getState().componentState, { mechanical_component_x: true })
    assert.equal(useSimulationStore.getState().error, null)
    const cancelled = new AbortController()
    globalThis.fetch = async () => {
      cancelled.abort()
      return Response.json({ mechanical_component_x: false })
    }
    await useSimulationStore.getState().refresh(cancelled.signal)
    assert.deepEqual(useSimulationStore.getState().componentState, { mechanical_component_x: true })
    assert.equal(useSimulationStore.getState().error, null)
  } finally {
    globalThis.fetch = originalFetch
    useSimulationStore.setState({ componentState: null, error: null })
  }
})
