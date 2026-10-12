import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SimulationState } from '../src/features/simulation/simulationState'
import { runStateSequence } from '../src/features/commands/runStateSequence'

test('offsets are relative to sequence start and each step sends cumulative state', async () => {
  let time = 0
  const starts: number[] = []
  const payloads: unknown[] = []
  const result = await runStateSequence({ x: false, position: 0, untouched: 'ok' }, new Map<SimulationState, number>([
    [{ x: false, position: 100 }, 2000],
    [{ x: true }, 0],
    [{ position: 50 }, 1000],
  ]), {
    signal: new AbortController().signal,
    now: () => time,
    wait: async (ms) => { time += ms },
    send: async (state) => { starts.push(time); payloads.push(state); time += 200; return state },
    onSaved: () => {},
  })
  assert.deepEqual(starts, [0, 1000, 2000])
  assert.deepEqual(payloads[1], { x: true, position: 50, untouched: 'ok' })
  assert.deepEqual(result, { x: false, position: 100, untouched: 'ok' })
})

test('invalid sequences send nothing; failures and cancellation stop remaining steps', async () => {
  let sends = 0
  const controller = new AbortController()
  const options = { signal: controller.signal, send: async (state: Record<string, boolean | number | string>) => { sends++; return state }, onSaved: () => {} }
  await assert.rejects(runStateSequence({}, new Map<SimulationState, number>([[{ x: true }, 0], [{ x: false }, -1]]), options))
  assert.equal(sends, 0)
  const steps = new Map<SimulationState, number>([[{ x: true }, 0], [{ x: false }, 0]])
  await assert.rejects(runStateSequence({}, steps, { ...options, send: async () => { sends++; throw new Error('failed') } }))
  assert.equal(sends, 1)
  await assert.rejects(runStateSequence({}, steps, { ...options, onSaved: () => controller.abort() }))
  assert.equal(sends, 2)
})
