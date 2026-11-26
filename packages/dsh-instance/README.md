# dsh-instance

The hosted child, on the DSH side. It runs Fishball in its own private DSH profile, attached to the
DSH it is installed in: started after that DSH is ready, stopped with it. It places the Fishball
plugins in the child, gives the child a token from this DSH's connector once, syncs the model list,
and has its own settings page. It imports no Fishball-side code and has no `dsh-connector` peer: it
looks the connector's services up at runtime (`dshConnectorTokens`).

Version `1.0.0-alpha.1`. Install and uninstall are in the [root README](<../../README.md>).

## The child

- **Where:** `<DSH_HOME>/fishball/runtime`: the child's DSH home `dsh-home` (profile `fishball`),
  `workspace`, `os-home`, `agents-home`, `tmp`, `launches`, the owner marker, the lifecycle secret
  and logs. The DSH home must be a canonical real path, else `INVALID_MAIN_HOME`.
- **How it starts:** with the main process's own executable and arguments (debugger flags
  dropped), `127.0.0.1` with an OS port, HMR off. The launch overlay carries only that, the two
  instance rows (the lifecycle row and the child-side row `dsh-instance-child`, whose config holds
  the target URL) and the isolation of the child's instructions and skills from yours. No guard row
  and no token: the guards are fishball-core's own patch.
- **Placement:** at every start, before the profile loads, `fishball-ui` and
  `fishball-core` are copied into `<profile>/vendor/<name>` and `<profile>/node_modules/<name>` and
  appended to the profile's bundles in that order, core last (`fishball-board` is shelved, not in
  1.0.0-alpha.1, and is never placed). Sources: `bundled/<dir>` in a packed
  instance, else the sibling workspace folders of a source checkout. The record
  `fishball-placement.json` keeps your switches: a plugin is on at its first placement, a later
  disable survives, and one deleted while off comes back off. An enabled plugin the child cannot
  load fails the start with `PROFILE_INCOMPATIBLE`, naming it.
- **Ready:** the child's base services are mounted, its `appReady` has fired and its web server
  listens with the admission route registered. States: `disabled`, `waiting`, `starting`, `ready`,
  `stopping`, `stopped`, `failed`.

## The hosted token

The actual parent DSH is the hosted child's reserved first target (`id: parent`, `kind: parent`).
Its URL comes only from `dsh-instance-child.targetUrl`; Fishball keeps it read-only and non-removable.
The instance has no remote-target override. Add other targets inside Fishball instead.

At each start the instance asks whether the child already holds a **parent** credential. Only when
it does not, with a usable parent connector, it calls `createHosted` once and imports the value into
`DSH_AGENT_TOKEN`; the value never stays on the host. That reference, `fishball-core/hosted-agent`
and `pending-token-origin` belong only to the reserved parent. Additional targets have separate
credentials and cannot satisfy the hosted probe or suppress parent provisioning. The child-row
configuration and credential handoff wire are unchanged. The entry keys it created, and its stable instance id, are kept in
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

DSH → Plugins → `dsh-instance` (`client.js`, `client.status.js`, `client.models.js`; the
Fishball tab is `client.fishball.js`, below):

- the child's status, its failed-start detail, **Retry** (when it failed) and its notice;
- **Restart**: restarts Fishball after a confirmation ("Running work in Fishball stops and the
  Fishball window reloads."). Shown while the instance is on and the child is ready, failed or
  stopped; disabled while it starts or stops and while a Fishball plugin change runs. Route
  `POST /api/dsh-instance/restart` (queued behind other starts and stops; refused with
  `instance-disabled` while the instance is off and `busy` while a Fishball plugin change runs);
- **Reconnect** and **Open Fishball** (a new tab; use `127.0.0.1`, `localhost` or the configured HTTPS URL below);
- `enabled` (saving it off stops the child at once, on starts it; private data is kept);
- **Model for Fishball**: model sync.

## Remote embedding (opt-in)

Set `remoteEmbedUrl` on the host's `dsh-instance` row using an instance patch (profile `cordis.patch.yml` or the invocation's `--patch`). Use the same public **main DSH** root the browser opens, including any mount prefix. This is not the Fishball URL or the MCP target. For example:

```yaml
- id: dsh-instance
  config:
    enabled: true
    remoteEmbedUrl: https://dsh.example.com/ui/
```

Preserve other values in the row if editing an existing override, then restart the main DSH. Without the field (or with an empty string), only the original local access is available.

- For sidebar access, install a connector built with the [companion change](../../patches/dsh-connector-remote-embed.patch). Older connectors refuse non-loopback sidebar admission; the instance settings page's **Open Fishball** does not depend on that change.
- Continue to configure the main DSH's `--trusted-host` and TLS as usual. If an outer reverse proxy terminates TLS, it must preserve `Host`, strip only the main DSH prefix (`/ui` in the example), and forward WebSocket upgrades at `/ui/fishball/api/remote.mux` to the **main** DSH. Do not publish the child's port. Use the native Node Web host with mount-aware frontend assets and the Connection owner APIs (0.2.2-rc.3 Web SDK contract).
- HTTP requests and WebSocket handshakes require the existing main DSH browser-owner session. The relay exchanges a one-use ticket with the ready child, and keeps the resulting child credential server-side. Connector tokens are not used for webpage authentication.
- **Trust boundary:** the proxied page and its frontend plugins share the main DSH's browser origin. A path prefix is not a JavaScript or browser-storage sandbox; enable this only for Fishball plugins you also trust with the main DSH web session. Child login endpoints, the experimental inspector and requests to register a child Service Worker are not relayed.

## Plugins for Fishball

Only this DSH runs pnpm on the child profile (design §28): a pnpm run inside the child used the
child's private home and refused the store the set install had linked (`ERR_PNPM_UNEXPECTED_STORE`).
The instance mounts DSH's own plugin manager for the child profile, on first use, in an isolated
scope (`src/host/child-plugins.js`): DSH's inspect, install, cancel, registry fallbacks, progress
and build-script approval run unchanged; it does not reload this DSH and is hidden from the
browser gateway. After a change the child's bundle list is written (with a backup) and the child
restarts; while the instance is switched off the list is still written and the answer (and the
page) says it takes effect the next time Fishball starts. One change runs at a time, until the restart it queued has
settled; the child's bundle list is written under DSH's profile lock.

On DSH's Plugins page (`client.fishball.js`):

- a **Fishball** tab: the child's own plugins (name, version, on/off) with **Uninstall**
  (confirmed first), **Restart** (the settings page's, same rules and confirmation),
  **Install for Fishball**, and the **Recommended** list (a copy of
  fishball-core's `ui/src/recommended.js`, which a standalone Fishball shows; change both
  together; each entry **Install**, or "Installed in Fishball");
- **Install for Fishball** in DSH's Add plugin menu;
- on each bundle's page: **Uninstall from Fishball** when Fishball has it; else **Use in
  Fishball** for an official bundle DSH ships (added to the child's list, no pnpm run); else
  **Install to Fishball** with the bundle's install source. Nothing for the bundles the
  instance owns (the child's base bundles, fishball-core, dsh-instance), which the Host lists as
  `protected`;
- the install dialog: package field, check, confirmation (name, version, description, source),
  progress with pnpm's output and **Cancel**, then the result (Fishball restarts) or the reason with
  **Retry** (or **Allow these scripts and retry**).

The child's base bundles, the Fishball set and dsh-instance are never listed or uninstalled.
Routes (owner-only, same-origin): `GET /api/dsh-instance/plugins`, `POST …/plugins/inspect`
`{spec}`, `…/install` `{spec, requestId, approvedBuilds?}`, `…/cancel` `{requestId}`,
`…/uninstall` `{name}`, `…/use` `{name}`. Progress arrives as DSH's own
`plugin-manager/install-state` and `install-log` events. Uninstall first runs `pnpm remove` for
a package the child profile declares, then drops the plugin from the child's list, so a failed
removal (`remove-failed`) changes nothing.

Limits:
- bundle detail images are not served for Fishball-only bundles: the child manager's
  `connection` is isolated, because DSH's own manager already holds the exact detail-image route
  `/api/plugin-manager/detail-file`;
- the **Restart** and **Install for Fishball** buttons sit at the top of the Fishball tab, not in
  DSH's page header (DSH hides its own header actions on a contributed tab and offers no header slot);
- version exemptions are read from the child profile.

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

The child still starts, retaining its reserved parent entry as not set/failed rather than replacing
it with an arbitrary remote. Install `dsh-connector` in the parent and press Reconnect; it answers
`connector-missing` while there is none. Additional targets can still be configured inside Fishball.

## Uninstall

DSH has no uninstall hook, so the package ships `uninstall.js`, run with DSH quit before removing
the package. It removes `<DSH_HOME>/fishball/runtime` and nothing else. See the root README for the
command and its refusal codes (`CHILD_RUNNING`, `CHILD_STATE_UNKNOWN`, `UNSAFE_DIRECTORY`, `UNOWNED_RUNTIME`,
`INVALID_MAIN_HOME`).
