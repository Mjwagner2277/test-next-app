import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateStateUpdate } from '../src/features/simulation/simulationState'
import { readSimulationState, updateSimulationState } from '../src/features/simulation/simulationStore'

test('validates grouped primitive values without dropping false, zero, or empty strings', () => {
  assert.deepEqual(validateStateUpdate({ x: false, y: 0, z: '', status: 'unknown' }), { x: false, y: 0, z: '', status: 'unknown' })
  for (const input of [null, [], {}, { x: null }, { x: {} }, { x: [] }, { x: Infinity }, { 'bad-name': true }, JSON.parse('{"__proto__":true}'), { x: 'a'.repeat(1025) }]) {
    assert.throws(() => validateStateUpdate(input))
  }
})

test('persists grouped updates and preserves unrelated fields across concurrent requests', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'simulation-test-'))
  const path = join(directory, 'state.json')
  try {
    assert.deepEqual(await readSimulationState(path), {})
    await updateSimulationState({ x: true, y: 'unknown', position: 42 }, path)
    await Promise.all([updateSimulationState({ x: false }, path), updateSimulationState({ z: 0 }, path)])
    const expected = { x: false, y: 'unknown', position: 42, z: 0 }
    assert.deepEqual(await readSimulationState(path), expected)
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), expected)
    assert.throws(() => updateSimulationState({ x: true, bad: null }, path))
    assert.deepEqual(await readSimulationState(path), expected)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
