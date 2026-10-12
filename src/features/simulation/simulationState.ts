export type SimulationValue = boolean | number | string
export type SimulationState = Record<string, SimulationValue>

export function validateStateUpdate(input: unknown): SimulationState {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Expected an object mapping component names to values.')
  }
  const entries = Object.entries(input)
  if (entries.length === 0 || entries.length > 100) {
    throw new Error('Provide between 1 and 100 component values.')
  }
  for (const [key, value] of entries) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,127}$/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) {
      throw new Error('Component names must start with a letter and contain only letters, numbers, or underscores (maximum 128 characters).')
    }
    if (!(typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && value.length <= 1024))) {
      throw new Error(`Invalid value for ${key}: use a boolean, finite number, or string up to 1024 characters.`)
    }
  }
  return Object.fromEntries(entries)
}
