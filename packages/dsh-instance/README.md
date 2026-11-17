# dsh-instance

The hosted child, on the DSH side. It runs Fishball in its own private DSH profile, attached to the
DSH it is installed in: started after that DSH is ready, stopped with it. It places the Fishball
plugins in the child, gives the child a token from this DSH's connector once, syncs the model list,
and has its own settings page. It imports no Fishball-side code and has no `dsh-connector` peer: it
looks the connector's services up at runtime (`dshConnectorTokens`).

Version `1.0.0-alpha.1` in the release (this checkout's manifest still reads `0.1.0-alpha.0`).
Install and uninstall are in the [root README](<../../README.md>).

## The child

- **Where:** `<DSH_HOME>/fishball/runtime`: the child's DSH home `dsh-home` (profile `fishball`),
  `workspace`, `os-home`, `agents-home`, `tmp`, `launches`, the owner marker, the lifecycle secret
  and logs. The DSH home must be a canonical real path, else `INVALID_MAIN_HOME`.
- **How it starts:** with the main process's own executable and arguments (debugger flags
  dropped), `127.0.0.1` with an OS port, HMR off. The launch overlay carries only that, the two
  instance rows (the lifecycle row and the child-side row `dsh-instance-child`, whose config holds
  the target URL) and the isolation of the child's instructions and skills from yours. No guard row
  and no token: the guards are fishball-core's own patch.
- **Placement:** at every start, before the profile loads, `fishball-board`, `fishball-ui` and
  `fishball-core` are copied into `<profile>/vendor/<name>` and `<profile>/node_modules/<name>` and
  appended to the profile's bundles in that order, core last. Sources: `bundled/<dir>` in a packed
  instance, else the sibling workspace folders of this checkout. The record
  `fishball-placement.json` keeps your switches: a plugin is on at its first placement, a later
  disable survives, and one deleted while off comes back off. An enabled plugin the child cannot
  load fails the start with `PROFILE_INCOMPATIBLE`, naming it.
- **Ready:** the child's base services are mounted, its `appReady` has fired and its web server
  listens with the admission route registered. States: `disabled`, `waiting`, `starting`, `ready`,
  `stopping`, `stopped`, `failed`.

## The hosted token

At each start the instance asks the child whether it already holds a credential. Only when it does
not, and the target is this DSH's own connector, it calls the connector's `createHosted` once and
imports the value into the child's credential reference `DSH_AGENT_TOKEN`; the value never stays on
the host. The entry keys it created, and its stable instance id, are kept in
`<DSH_HOME>/fishball/hosted.json`, outside the runtime tree, so an uninstall or reinstall keeps
them. Retry never creates a token; after you delete the hosted entry it leaves the notice
`hosted-entry-deleted`. **Reconnect** creates one new entry and imports it once; it moves and
deletes nothing, so delete the old entry yourself on the connector's settings page.

**Reinstall.** When the child has lost its credential (its home was removed, or the instance was
reinstalled) and `hosted.json` already lists an entry the instance made, the new entry becomes that
entry's successor: once the new Fishball has paired, the instance asks the connector (`retire`) to
move the old entry's managed sessions, name, live offers and pending events to it and to delete the
old entry. Until that has happened it is retried at each start and whenever the connector's pairs
change; a Reconnect meanwhile makes its new entry the successor. A deleted or user-made entry is
never succeeded.

## Settings page

DSH → Plugins → `dsh-instance` (`client.js`, `client.status.js`, `client.models.js`):

- the child's status, its failed-start detail, **Retry** and its notice;
- **Reconnect** and **Open Fishball** (a new tab; open DSH at `127.0.0.1` or `localhost`);
- `enabled` (saving it off stops the child at once, on starts it; private data is kept) and
  `targetUrl` (**Remote target**: the MCP endpoint of another DSH's connector; blank uses this DSH's
  connector; applies at the next start);
- **Model for Fishball**: model sync.

## Model sync

The instance copies the main DSH's API-key providers and their model lists into the child. It
syncs the list only; the model Fishball uses is chosen in fishball-core's settings or fishball-ui's
model dialog.

- **Once, automatically, at first install:** when a newly created child first becomes ready, the
  instance runs a Check, then Adds every missing provider (`src/host/initial-sync.js`). The marker
  `initial-model-sync.json` sits in the runtime folder, so a reinstall syncs again. A refused check
  or add writes no marker and is tried at the next start. It never affects the start.
- **Manual after that:** **Check for new models** lists the providers the child lacks; **Add
  selected** adds what you tick. Login providers, providers with custom headers and non-https
  endpoints are not offered. Providers the child already has are kept; nothing is removed. Keys
  never reach the page, the logs or the chat.

## Without the connector

The child still starts. With no connector in this DSH and no remote target, it has no target: set
one in fishball-core's settings, or install `dsh-connector` and press Reconnect. Reconnect answers
`connector-missing` while there is none.

## Uninstall

DSH has no uninstall hook, so the package ships `uninstall.js`, run with DSH quit before removing
the package. It removes `<DSH_HOME>/fishball/runtime` and nothing else. See the root README for the
command and its refusal codes (`CHILD_RUNNING`, `CHILD_STATE_UNKNOWN`, `UNSAFE_DIRECTORY`, `UNOWNED_RUNTIME`,
`INVALID_MAIN_HOME`).
