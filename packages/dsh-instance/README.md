# dsh-instance

The hosted child, on the DSH side. It runs Fishball in its own private DSH profile, attached to the
DSH it is installed in: started after that DSH is ready, stopped with it. It places the Fishball
plugins in the child, gives the child a token from this DSH's connector once, syncs the model list,
and has its own settings page. It imports no Fishball-side code and has no `dsh-connector` peer: it
looks the connector's services up at runtime (`dshConnectorTokens`).

Version `1.0.0-alpha.1`. Uninstall instructions and the repository index are in the
[root README](<../../README.md>).

## Installation options

Use [`dsh-fishball-bundle`](https://github.com/Arrosam/dsh-fishball-bundle) for an all-in-one
install; do not install it alongside `dsh-instance`. To install the components manually, quit DSH,
then install `dsh-agent-connector@1.0.0-alpha.2` and `dsh-instance@1.0.0-alpha.1` in the same
profile through the Plugins page, or run (replace `web` with your profile name):

```bash
dsh plugin --profile web add dsh-agent-connector@1.0.0-alpha.2 dsh-instance@1.0.0-alpha.1
```

Missing peer warnings about DSH's own `@deepseek-ai/*` packages are expected; the host provides
these at runtime. For a source or offline install, pack the sibling `dsh-fishball` and
`dsh-connector` checkouts first, then use this repository's `npm run pack` and the generated
release's `INSTALL.md`.

The compatibility test SDKs are **0.2.1-rc.5** and **0.2.2-rc.1** (Web or DSH-X). Use Node **22.14+**
for packing and **24.9+** for DSH. After starting DSH, open Fishball from the sidebar or from
**DSH → Plugins → dsh-instance → Open Fishball** and choose a model when prompted.

## The child

- **Where:** `<DSH_HOME>/fishball/runtime`: the child's DSH home `dsh-home` (profile `fishball`),
  `workspace`, `os-home`, `agents-home`, `tmp`, `launches`, the owner marker, the lifecycle secret
  and logs. The DSH home must be a canonical real path, else `INVALID_MAIN_HOME`.
- **How it starts:** with the main process's own executable and arguments (debugger flags
  dropped), `127.0.0.1` with an OS port, HMR off. The launch overlay carries only that, the two
  instance rows (the lifecycle row and the child-side row `dsh-instance-child`, whose config holds
  the target URL) and the isolation of the child's instructions and skills from yours. No guard row
  and no token: the guards are fishball-core's own patch.
- **Placement:** at every start, before the profile loads, `fishball-amenities` and `fishball-core`
  (which carries the Fishball UI) are copied into the child's profile and added to its bundles in
  that order. The amenities bundle supplies board, heartbeat, and taskboard. A standalone
  `fishball-ui` from an earlier instance is still treated as the child's own. Sources: the bundled
  tarballs in a packed instance, else `$FISHBALL_REPO/packages/` or the sibling Fishball checkout.
  Only the files each manifest's `files` list ships are copied, read as npm pack reads them: an entry
  starting with `!` excludes that path. The record
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

The instance keeps the hosted entry key in `<DSH_HOME>/fishball/hosted.json` and the secret in
DSH’s credential store, not in the launch overlay, command line, or settings page. On every start
it sends the current URL, entry key, and held secret over the authenticated child lifecycle wire.
Fishball only uses that handoff for the reserved parent and for the URL it names. A port change
starts a new routing epoch but reuses the same connector entry, agent ID, and managed sessions.
Manually added targets still lose their old credentials when retargeted to another port.

**Reconnect** hands off the same credential again while the owned entry exists and the secret is
available. A disabled entry must be re-enabled. If the entry was deleted, or neither the host nor
child still has its credential, Reconnect can create a replacement after the connector has released
the old pairing. It does not move the old pairing or managed sessions. The page distinguishes
“re-bound,” “new token stored and paired,” and “token stored, pairing not confirmed.” Storing a
token is not proof that Fishball paired or came online. Retry never creates a token; after you
delete the hosted entry it leaves the notice `hosted-entry-deleted`.

**Reinstall.** When the child has lost its credential (its home was removed, or the instance was
reinstalled) and `hosted.json` already lists an entry the instance made, the new entry becomes that
entry's successor: once the new Fishball has paired, the instance asks the connector (`retire`) to
move the old entry's managed sessions, name, live offers and pending events to it and to delete the
old entry. Until that has happened it is retried at each start and whenever the connector's pairs
change. A deleted or user-made entry is
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

- a **Fishball** tab: the child's own plugins (name, optional version, description) with an
  on/off switch and **Uninstall** (confirmed first), plus **Restart** (the settings page's,
  same rules and confirmation) and **Install for Fishball**. Switching off keeps the package
  installed; the switch changes only the child's enabled bundle list;
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
`…/uninstall` `{name}`, `…/use` `{name}`, `…/toggle` `{name, enabled}`. Progress arrives as DSH's own
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

The instance copies the main DSH's API-key providers and model lists into the child. On first
open, if Fishball does not have a configured model, onboarding asks for a model and lets you set
its reasoning effort separately. After onboarding, change the model in Fishball's settings.

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

## Testing

`npm test` in this folder runs this package's own tests (`tests/`). The compatibility suites run
on DSH 0.2.1-rc.5 and 0.2.2-rc.1. Pass a path to run one area:
`node ../../scripts/test-package.mjs . tests/placement`.

| Area | What it covers |
| --- | --- |
| `tests/host` | the hosted token (first start, restarts, Retry, Reconnect, disable and delete), the locator, the admission ticket and route, the credential wire, the status and Open routes, the hosted record, the host row itself |
| `tests/succession` | reinstall succession: pending in `hosted.json`, retire retried at starts and on connector changes, Reconnect retargets |
| `tests/placement` | `shippedFiles` (the `!` exclusions), placement through `composedProfile` into a scratch home, the launch overlay |
| `tests/manifest` | the package's manifest, shipped files and imports (no Fishball-side package) |
| `tests/ready` | readiness of the child, the first model sync, the published surface |
| `tests/pages` | the settings page, Restart, the Fishball tab and the per-bundle buttons, on a scripted DSH page |
| `tests/onboarding` | first-open onboarding and the child model selection, including reasoning effort |
| `tests/fishball-dir-perms` | directory permission checks and host and UI notices |
| `tests/hmr-barrier` | host reload and child shutdown ordering |
| `tests/remote-embed` | opt-in remote embedding and the host/child relay contract |
| `tests/stderr-log` | the child's stderr log: line buffering through redaction, one rotation, the cut |
| `tests/uninstall` | `uninstall.js` and `runtime.uninstall()`: removes only a tree proven dead and this home's |

Fakes shared by several areas are in `tests/support/`; generic tools are
[@dsh-instance/test-helpers](<../test-helpers/README.md>). Behaviour that needs a real host DSH, the
real connector, the real fishball-core or a packed release is in the integration packages, run
before a release. How tests are written: [docs/testing/writing-tests.md](<../../docs/testing/writing-tests.md>).
