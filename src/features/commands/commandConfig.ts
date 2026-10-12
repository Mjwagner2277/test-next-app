export type CommandHandler = () => Promise<void>

export type CommandButtonDefinition = {
  id: string
  label: string
  description?: string
  commandId: string
}

export type CommandTabDefinition = {
  id: string
  label: string
  buttons: readonly CommandButtonDefinition[]
}

// Add tabs or buttons here. commandId connects each button to the registry below.
export const COMMAND_TABS: readonly CommandTabDefinition[] = [
  {
    id: 'tab-a',
    label: 'Tab A',
    buttons: [
      { id: 'a-1', label: 'Command A1', commandId: 'a1' },
      { id: 'a-2', label: 'Command A2', commandId: 'a2' },
      { id: 'a-3', label: 'Command A3', commandId: 'a3' },
      { id: 'a-4', label: 'Command A4', commandId: 'a4' },
    ],
  },
  {
    id: 'tab-b',
    label: 'Tab B',
    buttons: [
      { id: 'b-1', label: 'Command B1', commandId: 'b1' },
      { id: 'b-2', label: 'Command B2', commandId: 'b2' },
      { id: 'b-3', label: 'Command B3', commandId: 'b3' },
      { id: 'b-4', label: 'Command B4', commandId: 'b4' },
    ],
  },
]

// Register protobuf calls here when their definitions are available.
// A handler must throw if the response reports failure so the UI never shows
// success for a rejected command. Example:
// a1: async () => {
//   const response = await client.someCommand({ ...request })
//   if (!isSuccessful(response)) throw new Error('Command rejected')
// },
export const COMMAND_HANDLERS: Readonly<Partial<Record<string, CommandHandler>>> = {}
