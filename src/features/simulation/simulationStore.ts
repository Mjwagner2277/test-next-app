import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { validateStateUpdate, type SimulationState } from './simulationState'

// One serialized writer per file, including across development hot reloads.
const globalStore = globalThis as typeof globalThis & { simulationWrites?: Map<string, Promise<unknown>> }
const writes = globalStore.simulationWrites ??= new Map()
const defaultPath = () => resolve(/* turbopackIgnore: true */ process.env.SIMULATION_STATE_FILE || '.data/simulation-state.json')

export async function readSimulationState(path = defaultPath()): Promise<SimulationState> {
  try {
    const state: unknown = JSON.parse(await readFile(path, 'utf8'))
    if (state && typeof state === 'object' && !Array.isArray(state) && Object.keys(state).length === 0) return {}
    // Validate stored values individually; the accumulated state may exceed 100 keys.
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Invalid stored simulation state.')
    for (const [key, value] of Object.entries(state)) validateStateUpdate({ [key]: value })
    return state as SimulationState
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }
}

export function updateSimulationState(input: unknown, path = defaultPath()): Promise<SimulationState> {
  const update = validateStateUpdate(input)
  const pending = (writes.get(path) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const state = { ...await readSimulationState(path), ...update }
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, path)
    } finally {
      await unlink(temporary).catch(() => {})
    }
    return state
  })
  writes.set(path, pending)
  return pending
}
