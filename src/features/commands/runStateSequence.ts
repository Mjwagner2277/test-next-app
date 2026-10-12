import { validateStateUpdate, type SimulationState } from '../simulation/simulationState'

export type StateStep = { offsetMs: number; stateUpdate: SimulationState }

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

export async function runStateSequence(initial: SimulationState, steps: readonly StateStep[], options: SequenceOptions) {
  if (!steps.length) throw new Error('Provide at least one state step.')
  let previousOffset = -1
  // Validate and copy the whole sequence before sending any state.
  const sequence = steps.map((step) => {
    if (!Number.isSafeInteger(step.offsetMs) || step.offsetMs < 0 || step.offsetMs > 2147483647 || step.offsetMs < previousOffset) {
      throw new Error('Offsets must be nonnegative integer milliseconds in ascending order (maximum 2147483647).')
    }
    previousOffset = step.offsetMs
    return { offsetMs: step.offsetMs, stateUpdate: validateStateUpdate(step.stateUpdate) }
  })
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
