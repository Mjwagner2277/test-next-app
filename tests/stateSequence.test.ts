import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runStateSequence } from '../src/features/commands/runStateSequence'

test('offsets are relative to sequence start and each step sends cumulative state', async () => {
  let time = 0
  const starts: number[] = []
  const payloads: unknown[] = []
  const result = await runStateSequence({ x: false, position: 0, untouched: 'ok' }, [
    { offsetMs: 0, stateUpdate: { x: true } },
    { offsetMs: 1000, stateUpdate: { position: 50 } },
    { offsetMs: 2000, stateUpdate: { x: false, position: 100 } },
  ], {
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
  await assert.rejects(runStateSequence({}, [{ offsetMs: 0, stateUpdate: { x: true } }, { offsetMs: -1, stateUpdate: { x: false } }], options))
  assert.equal(sends, 0)
  const steps = [{ offsetMs: 0, stateUpdate: { x: true } }, { offsetMs: 0, stateUpdate: { x: false } }]
  await assert.rejects(runStateSequence({}, steps, { ...options, send: async () => { sends++; throw new Error('failed') } }))
  assert.equal(sends, 1)
  await assert.rejects(runStateSequence({}, steps, { ...options, onSaved: () => controller.abort() }))
  assert.equal(sends, 2)
})
