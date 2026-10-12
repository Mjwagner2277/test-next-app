export type CommandButtonDefinition = {
  id: string
  label: string
  description?: string
  onClick?: () => void
}

export type CommandTabDefinition = {
  id: string
  label: string
  buttons: readonly CommandButtonDefinition[]
}

// Add tabs and buttons here. Set onClick to connect a button to a command.
export const COMMAND_TABS: readonly CommandTabDefinition[] = [
  {
    id: 'tab-a',
    label: 'Tab A',
    buttons: [
      { id: 'a-1', label: 'Command A1' },
      { id: 'a-2', label: 'Command A2' },
      { id: 'a-3', label: 'Command A3' },
      { id: 'a-4', label: 'Command A4' },
    ],
  },
  {
    id: 'tab-b',
    label: 'Tab B',
    buttons: [
      { id: 'b-1', label: 'Command B1' },
      { id: 'b-2', label: 'Command B2' },
      { id: 'b-3', label: 'Command B3' },
      { id: 'b-4', label: 'Command B4' },
    ],
  },
]
