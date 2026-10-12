# Touchscreen commands and shared simulation state

Open `/commands` for the touchscreen and `/simulation` in another browser or
page to see the shared state. The viewer refreshes once per second. The fault
console stays at `/`; these simulation values do not send fault RPCs.

`COMMAND_TABS` in `src/features/commands/commandConfig.ts` defines tabs and buttons.
The console maps it into tabs and matching `TabPanel` components. Selection starts
at numeric index `0`; IDs provide keys and accessibility links. Each panel maps
its buttons to the separate `CommandButton.tsx` component.

Configure a button with one or several component values:

```ts
{
  id: 'conflict',
  label: 'Simulate Conflict',
  stateUpdate: {
    mechanical_component_x: false,
    mechanical_component_y: true,
    mechanical_component_z: 'unknown',
    mechanical_component_position: 42,
  },
}
```

Values can be booleans, finite numbers, or strings (up to 1024 characters).
Names start with a letter and contain letters, numbers, or underscores, up to
128 characters. Reserved prototype names are rejected. Send 1–100 fields per
update. Arrays, nested objects, and null are not accepted; multiple components
are represented by multiple entries in the object. Buttons without an update
are disabled. A request failure is shown on the button and can be retried.

`PATCH /api/simulation/state` accepts that object and returns the complete merged
state. Updates are applied together, preserving omitted fields (including false
and zero values). Invalid requests return 400 without changing state; storage
failures return 500. `GET /api/simulation/state` returns the current object, or
`{}` before the first update. Both responses disable caching.

Other pages can fetch it directly:

```ts
const response = await fetch('/api/simulation/state', { cache: 'no-store' })
if (!response.ok) throw new Error('Unable to load simulation state')
const state = await response.json()
```

State is stored in `.data/simulation-state.json`, or the path specified by
`SIMULATION_STATE_FILE`. Writes are serialized within one Node process and
replace the file atomically. State survives process restarts on the same disk.
The Docker image prepares `/app/.data` for its non-root user; mount a persistent
volume there, writable by UID 1001, to survive container replacement. Run one
app process/replica with this file backend. Multi-replica or serverless deployments
need a shared database instead. Keep this simulator within the same trusted
access boundary as the existing app; the API does not add authentication.
