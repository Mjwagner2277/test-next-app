import type { StateStep } from './runStateSequence'
import type { SimulationState } from '../simulation/simulationState'

export type CommandButtonDefinition = {
  id: string
  label: string
  description?: string
  stateUpdate?: SimulationState
  sequence?: readonly StateStep[]
}

export type CommandTabDefinition = {
  id: string
  label: string
  buttons: readonly CommandButtonDefinition[]
}

// Defaults for the shared state object. Saved server values override these on load.
export const INITIAL_COMPONENT_STATE: SimulationState = {
  mechanical_component_x: false,
  mechanical_component_y: false,
  mechanical_component_z: 'unknown',
  mechanical_component_position: 0,
}

// Each button changes these fields on the shared object before the object is sent.
export const COMMAND_TABS: readonly CommandTabDefinition[] = [
  {
    id: 'tab-a',
    label: 'Tab A',
    buttons: [
      { id: 'a-1', label: 'Enable X', stateUpdate: { mechanical_component_x: true } },
      { id: 'a-2', label: 'Disable X', stateUpdate: { mechanical_component_x: false } },
      {
        id: 'a-3', label: 'Move X',
        sequence: [
          { offsetMs: 0, stateUpdate: { mechanical_component_x: true, mechanical_component_position: 0 } },
          { offsetMs: 1500, stateUpdate: { mechanical_component_position: 50 } },
          { offsetMs: 3000, stateUpdate: { mechanical_component_x: false, mechanical_component_position: 100 } },
        ],
      },
      { id: 'a-4', label: 'Command A4' },
    ],
  },
  {
    id: 'tab-b',
    label: 'Tab B',
    buttons: [
      { id: 'b-1', label: 'Simulate Conflict', stateUpdate: { mechanical_component_x: false, mechanical_component_y: true, mechanical_component_z: 'unknown', mechanical_component_position: 42 } },
      { id: 'b-2', label: 'Command B2' },
      { id: 'b-3', label: 'Command B3' },
      { id: 'b-4', label: 'Command B4' },
    ],
  },
]
