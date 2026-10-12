# Touchscreen commands

Open `/commands` for the touchscreen screen. The fault console stays at `/`.

`COMMAND_TABS` in `src/features/commands/commandConfig.ts` defines each tab and
its buttons. `CommandConsole` maps that constant into `<Tab>` elements and
`<TabPanel>` elements, then maps each tab's buttons inside its panel.
`TabPanel` shows its children only when its ID matches the selected tab.

Add a button with its command callback directly in the constant:

```ts
{ id: 'a-5', label: 'New command', onClick: () => runCommand() }
```

Import your command function in the configuration file. Handle any asynchronous
progress or errors in that function as needed. Sample buttons have no callbacks
and are disabled until connected.

To add a tab, append an object with a unique `id`, `label`, and `buttons` array.
Give each button a unique `id`, a `label`, and optionally a `description` and
`onClick` callback. Both the tab and its panel render from the same constant.
