# Touchscreen commands

Open `/commands` for the standalone command screen. The fault console stays at `/`.

Edit `src/features/commands/commandConfig.ts` to define tabs, buttons, and handlers.
Each tab has a unique `id`, a `label`, and a `buttons` array. Each button has a
unique `id`, a `label`, an optional `description`, and a `commandId`.

Add a button to either tab:

```ts
{ id: 'a-5', label: 'New command', commandId: 'newCommand' }
```

Register its handler under the same command ID in `COMMAND_HANDLERS`:

```ts
newCommand: async () => {
  const response = await client.newCommand({ /* protobuf request fields */ })
  if (!isSuccessful(response)) throw new Error('Command rejected')
}
```

Import or create the appropriate protobuf client when that API is provided.
Resolve only on success; throw on application failure. Transport errors are
automatically caught by the screen. Parameters can be captured by the handler.
No RPCs are attached to the sample buttons. Unmapped buttons show “Not connected”
and report that status when tapped without making a request.

Copy a tab definition to add more tabs. The screen renders the configuration
automatically. Buttons use a responsive grid with 144px minimum height; tabs use
88px minimum height. Keyboard navigation and visible focus are supported.
During a command, all command buttons are disabled and rapid double taps are
blocked. Success is shown only after the handler resolves.
