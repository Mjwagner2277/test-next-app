import { validateStateUpdate, type SimulationState } from '../simulation/simulationState'

type SequenceOptions = {
  signal: AbortSignal
  send: (state: SimulationState, signal: AbortSignal) => Promise<SimulationState>
  onSaved: (state: SimulationState) => void
  now?: () => number
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted()
    const cancel = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve() }, milliseconds)
    signal.addEventListener('abort', cancel, { once: true })
  })
}

export async function runStateSequence(initial: SimulationState, updates: ReadonlyMap<SimulationState, number>, options: SequenceOptions) {
  if (!updates.size) throw new Error('Provide at least one state step.')
  // Validate and copy the whole sequence before sending any state.
  const sequence = Array.from(updates, ([stateUpdate, offsetMs]) => {
    if (!Number.isSafeInteger(offsetMs) || offsetMs < 0 || offsetMs > 2147483647) {
      throw new Error('Offsets must be nonnegative integer milliseconds (maximum 2147483647).')
    }
    return { offsetMs: offsetMs, stateUpdate: validateStateUpdate(stateUpdate) }
  }).sort((a, b) => a.offsetMs - b.offsetMs)
  const now = options.now ?? (() => performance.now())
  const pause = options.wait ?? wait
  const start = now()
  let state = { ...initial }
  for (const step of sequence) {
    options.signal.throwIfAborted()
    const remaining = step.offsetMs - (now() - start)
    if (remaining > 0) await pause(remaining, options.signal)
    options.signal.throwIfAborted()
    const nextState = { ...state, ...step.stateUpdate }
    state = await options.send(nextState, options.signal)
    options.signal.throwIfAborted()
    options.onSaved(state)
  }
  return state
}
