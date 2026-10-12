import type { SimulationState } from '../simulation/simulationState'

export type CommandButtonDefinition = {
  id: string
  label: string
  description?: string
  stateUpdate?: SimulationState
}

export type CommandTabDefinition = {
  id: string
  label: string
  buttons: readonly CommandButtonDefinition[]
}

// Add tabs and buttons here. Set stateUpdate to define the component values sent by a button.
export const COMMAND_TABS: readonly CommandTabDefinition[] = [
  {
    id: 'tab-a',
    label: 'Tab A',
    buttons: [
      { id: 'a-1', label: 'Enable X', stateUpdate: { mechanical_component_x: true } },
      { id: 'a-2', label: 'Disable X', stateUpdate: { mechanical_component_x: false } },
      { id: 'a-3', label: 'Command A3' },
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
