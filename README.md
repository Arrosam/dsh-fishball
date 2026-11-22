# Fishball

Fishball is an always-on personal assistant for DeepSeek Harness (DSH). It keeps one long-lived
session that gathers information from your other sessions, from plugins and from you. It reads,
sorts, decides and delegates, but does no work itself and never writes local files (its own
private Skills are the one exception).

Fishball is an ordinary MCP agent. A DSH exposes its sessions over MCP through `dsh-connector`, and
Fishball is a set of plugins that turns another DSH into a single-session assistant that uses that
endpoint. The two sides never import each other; the connector's public MCP surface is the only
link between them, and it serves any agent, not only Fishball.

The design is in [docs/planning/v3-design.md](<docs/planning/v3-design.md>) (§1.0 first) and
[docs/planning/v3-requirements.md](<docs/planning/v3-requirements.md>); the decision log is
[DESIGN.md](DESIGN.md) §17–§20. The original brief is [SMART-PROMPT.md](SMART-PROMPT.md).

## Status

Release **1.0.0-alpha.1** (V3). Every package carries this version. This is a fresh install: it
reads, migrates and accepts nothing from an earlier Fishball release. The older "dsh-fishball (df)"
preview is archived at tag `archive/df-preview-2026-10-23`.

`node scripts/pack-v3.mjs` (or `npm run pack:v3`) builds the six release tarballs (`fishball-shared`,
`fishball-core`, `fishball-board`, `fishball-heartbeat`, `fishball-taskboard`, `fishball-amenities`)
into `.runtime/release/1.0.0-alpha.1/`, with `SHA256SUMS`, an offline pnpm store, `INSTALL.md`
(install and uninstall, from npm or offline) and `PUBLISH.md` (the publish commands). When published,
packages go to npm under the `alpha` tag by the maintainer only. The connector's npm name is
**`dsh-agent-connector`** (`dsh-connector` is taken on npm); its folder, plugin row id and settings
stay `dsh-connector`.

## Packages

This repository holds the **Fishball-side** packages (installed in a Fishball DSH: either a standalone DSH you set up yourself, or the hosted child managed by [`dsh-fishball-instance`](https://github.com/Arrosam/dsh-fishball-instance)):

| Package | What it does |
| --- | --- |
| [`fishball-core`](packages/core) | One plugin with 2 components: **`fishball-core`** (manager session, preset, persona, reminders, private Skills, MCP link, Connect, interception, status, ask cards, guard rows, bundle settings page) and **`fishball-ui`** (`./ui/`, Fishball page, Recommended tab (standalone only), the instance-run child's Plugins page notice, sidebar targets & pairing views, ask cards, brand row, model dialog). |
| [`fishball-board`](packages/fishball-board) | Optional amenity: Fishball's session-linked work board. Its own bundle. |
| [`fishball-heartbeat`](packages/fishball-heartbeat) | Optional amenity: keeps Fishball's prompt cache warm with useful heartbeat turns while it is idle. Its own bundle. |
| [`fishball-taskboard`](packages/fishball-taskboard) | Optional amenity: Fishball's task board and memo pad, with the right sidebar's **Task board** tab. Its own bundle. |
| [`fishball-amenities`](packages/fishball-amenities) | Umbrella: depends on the three amenities so one install brings them all; carries only its settings-page hint and `fishball-heartbeat`'s settings page. |
| [`fishball-shared`](packages/shared) | A library inside the Fishball-side tarballs (the core/ui seam and the amenities' instance follower). Not a plugin. |

### Related repositories

The DSH-side connector and hosted runner live in their own repositories:

- **[`dsh-connector`](https://github.com/Arrosam/dsh-connector)** — Generic DSH MCP connector plugins (`dsh-agent-connector`, which ships the `dsh-connector`, `dsh-connector-ui`, `dsh-connector-adapter`, and `dsh-connector-watchdog` components in one bundle, plus standalone `dsh-connector-amenities` / `dsh-connector-adapter` / `dsh-connector-watchdog` packages and `dsh-connector-shared`).
- **[`dsh-fishball-instance`](https://github.com/Arrosam/dsh-fishball-instance)** — Hosted Fishball bridge plugin (`dsh-instance`) that installs and runs a Fishball child (`fishball-core` and `fishball-amenities`) inside a main DSH with `dsh-agent-connector`.

Not in this release: fold-notify (its notify function is `dsh-connector-ui`'s `notify` tool) and the
hosted settings bundle. Watchdog now ships as `dsh-connector-watchdog` in [`dsh-connector`](https://github.com/Arrosam/dsh-connector) (included in the `dsh-agent-connector` bundle). The amenities (`fishball-board`,
`fishball-heartbeat`, `fishball-taskboard`) ship in this release through the `fishball-amenities`
umbrella (the user, 2026-11-21) and are placed into the hosted child alongside `fishball-core` by `dsh-instance`. The repository root is not a
plugin. See [docs/package-layout.md](<docs/package-layout.md>).

## Supported DSH versions

- DSH **0.2.1-rc.5** and **0.2.2-rc.1**, either the DSH Web build or the one bundled with DSH-X.
- Node: whichever one runs your DSH. The instance starts its child with DSH's own executable and
  arguments. The connector and release packing need Node 22.14 or later; DSH itself needs Node 24.9 or later.

## Install (hosted: Fishball runs inside your DSH)

This is the usual set-up. The commands use the profile `web`; use your own profile after
`--profile`. Quit DSH first.

1. **Remove any earlier pre-V3 Fishball packages** (`dsh-fishball`, `fishball-connector`,
   `fishball-instance`, `fishball-embed-ui`, `dsh-fishball-*`, or legacy standalone `fishball-ui` /
   `dsh-connector-ui` packages), and delete `<DSH_HOME>/fishball/` if an earlier release left it.
   Nothing is migrated.

2. **Install `dsh-agent-connector` and `dsh-instance` into your main DSH profile.** You do not
   install `fishball-core`, `fishball-amenities`, or `dsh-connector-amenities` separately:
   `dsh-agent-connector` already includes its UI component (`dsh-connector-ui`) and connector
   amenities (`dsh-connector-adapter`, `dsh-connector-watchdog`), and `dsh-instance` automatically
   installs both `fishball-core` (including `fishball-ui`) and `fishball-amenities`
   (`fishball-board`, `fishball-heartbeat`, `fishball-taskboard`) into its private child DSH.

   - **Option A — Standard DSH install (from npm under `alpha`, via DSH Plugins page or CLI):**

     In DSH's Plugins page (**Plugins → Add plugin**), install `dsh-agent-connector@1.0.0-alpha.1`
     and `dsh-instance@1.0.0-alpha.1`, or run:

     ```bash
     dsh plugin --profile web add dsh-agent-connector@1.0.0-alpha.1 dsh-instance@1.0.0-alpha.1
     ```

     When offline from npm, `dsh-instance` embeds `fishball-core` and `fishball-amenities` in
     `bundled/`. pnpm may list DSH's own packages as missing peers; DSH provides them when it runs,
     so that warning is expected.

   - **Option B — From GitHub source (pack & install offline when `1.0.0-alpha.1` is not on npm):**

     Clone all three repositories side by side, then pack in order (`dsh-fishball` before
     `dsh-fishball-instance` so `dsh-instance` automatically embeds `fishball-core-1.0.0-alpha.1.tgz`
     and `fishball-amenities-1.0.0-alpha.1.tgz` into `bundled/`):

     ```bash
     git clone https://github.com/Arrosam/dsh-fishball.git
     git clone https://github.com/Arrosam/dsh-connector.git
     git clone https://github.com/Arrosam/dsh-fishball-instance.git

     (cd dsh-fishball && npm run pack:v3)
     (cd dsh-connector && npm run pack)
     (cd dsh-fishball-instance && npm run pack)
     ```

     Install `dsh-agent-connector` and `dsh-instance` from their generated release folders using the
     offline store helper:

     ```bash
     (cd dsh-connector/.runtime/release/1.0.0-alpha.1 &&
       DSH_CONNECTOR_STORE="$(node "$PWD/offline-store.mjs" "$PWD/pnpm-store" "$(dsh plugin --profile web root --silent)" "$(dsh plugin --profile web store path --silent)")" &&
       dsh plugin --profile web add "$PWD/dsh-agent-connector-1.0.0-alpha.1.tgz" --offline --store-dir="$DSH_CONNECTOR_STORE" --cache-dir="$PWD/pnpm-cache" --registry=https://registry.npmjs.org)

     (cd dsh-fishball-instance/.runtime/release/1.0.0-alpha.1 &&
       FISHBALL_INSTANCE_STORE="$(node "$PWD/offline-store.mjs" "$PWD/pnpm-store" "$(dsh plugin --profile web root --silent)" "$(dsh plugin --profile web store path --silent)")" &&
       dsh plugin --profile web add "$PWD/dsh-instance-1.0.0-alpha.1.tgz" --offline --store-dir="$FISHBALL_INSTANCE_STORE" --cache-dir="$PWD/pnpm-cache" --registry=https://registry.npmjs.org)
     ```

3. **Start DSH.** The instance starts Fishball once DSH is ready. On its first start it creates the
   child under `<DSH_HOME>/fishball/runtime`, gives the child a token from this DSH's connector,
   and copies your DSH model list into the child once (see
   [Fishball's model](#fishballs-model)). The DSH home must be a canonical real path, not a path
   through a symbolic link such as `/tmp` (`/private/tmp` on macOS); otherwise the instance reports
   `INVALID_MAIN_HOME` and does not start.

4. **Open Fishball** with the fish in the sidebar, or with **Open Fishball** on the instance's
   settings page (DSH → Plugins → `dsh-instance`). Open DSH at `127.0.0.1` or `localhost`: the
   window refuses other host names. With no model set, Fishball asks you to choose one.

## Install (standalone: Fishball in its own DSH)

Use a separate DSH (on this machine or another one) as Fishball, and link it to the DSH you want it
to manage:

1. In the **managed DSH**, install `dsh-agent-connector` (from `dsh-connector`'s release folder as
   shown above, or `dsh plugin --profile web add dsh-agent-connector@1.0.0-alpha.1` once published).
2. In the **Fishball DSH**, install `fishball-core` (which already includes `fishball-ui`):

   - **From source release folder** (`(cd dsh-fishball && npm run pack:v3)`):

     ```bash
     (cd dsh-fishball/.runtime/release/1.0.0-alpha.1 &&
       FISHBALL_STORE="$(node "$PWD/offline-store.mjs" "$PWD/pnpm-store" "$(dsh plugin --profile web root --silent)" "$(dsh plugin --profile web store path --silent)")" &&
       dsh plugin --profile web add "$PWD/fishball-core-1.0.0-alpha.1.tgz" --offline --store-dir="$FISHBALL_STORE" --cache-dir="$PWD/pnpm-cache" --registry=https://registry.npmjs.org)
     ```

   - **From npm (once published under `alpha`):**

     ```bash
     dsh plugin --profile web add fishball-core@1.0.0-alpha.1
     ```

   As in the hosted install, remove any earlier Fishball packages first, and expect pnpm's missing-peer warning.
3. In **fishball-core**'s settings, set **Target** to the managed DSH's connector endpoint, for
   example `http://127.0.0.1:<port>/api/agent/mcp`.
4. Link it in one of two ways. Either way the token comes from **New token** on the managed DSH's
   connector settings page, and Fishball's id is sent for you.
   - **With a token:** paste the token into **Token for connecting a DSH** in fishball-core's
     settings and press **Save**. It is used at the next connection and saved once the target
     accepts it.
   - **With Connect:** host a Client ID Metadata Document (below), put its https URL in
     **Client metadata URL**, press **Connect**, open the approval page and enter the token there.
     The grant is saved and refreshed; a restart needs no new sign-in.

A target on another machine must be **https** (only loopback may use plain http), for example
through your own tunnel. Connect from a browser on another machine also needs Fishball's own page
served over https.

## Optional amenities (standalone installs)

- **Hosted mode (`dsh-instance` + `dsh-agent-connector`):** both `fishball-amenities` (in Fishball's
  child DSH) and the connector amenities (`dsh-connector-adapter`, `dsh-connector-watchdog` inside
  `dsh-agent-connector`) are already installed automatically—do not install `dsh-connector-amenities`
  or `fishball-amenities` a second time alongside them.
- **Standalone Fishball DSH (`dsh-fishball`):** install `fishball-amenities` (umbrella for
  `fishball-board`, `fishball-heartbeat`, and `fishball-taskboard`) or an individual amenity—never
  both the umbrella and a member at the same time. See `.runtime/release/1.0.0-alpha.1/INSTALL.md`
  after packing for exact offline/online commands.
- **DSH without `dsh-agent-connector` (`dsh-connector`):** install `dsh-connector-amenities` (or
  `dsh-connector-adapter` / `dsh-connector-watchdog` individually) only when `dsh-agent-connector`
  is not installed in that profile.

## Quick install prompt (for an AI coding assistant)

You can paste this prompt into your AI coding assistant (Claude Code, Codex, Antigravity, etc.) to
clone, pack, and install the hosted Fishball setup into your DSH `web` profile:

> Please install Fishball V3 (hosted mode) into my DSH profile `web` using the three repositories:
> `https://github.com/Arrosam/dsh-fishball`, `https://github.com/Arrosam/dsh-connector`, and `https://github.com/Arrosam/dsh-fishball-instance`.
> First check whether DSH is running (ask me to quit it if so) and verify my DSH version (`0.2.1-rc.5` or `0.2.2-rc.1`) and non-symlink `$DSH_HOME`. Clone the three repos side-by-side, run `npm run pack:v3` in `dsh-fishball`, `npm run pack` in `dsh-connector`, and `npm run pack` in `dsh-fishball-instance` in that order, then install `dsh-agent-connector-1.0.0-alpha.1.tgz` and `dsh-instance-1.0.0-alpha.1.tgz` from their `.runtime/release/1.0.0-alpha.1/` folders using each folder's `INSTALL.md` (`offline-store.mjs` + `dsh plugin --profile web add ... --offline`). Tell me when it's ready so I can start DSH and open Fishball from the sidebar.

## Fishball's model

- **The list:** the instance copies your DSH's API-key providers and their model lists into the
  child **once, automatically**, when the child is first created. After that, sync is manual: on the
  instance's settings page, **Model for Fishball** → **Check for new models** lists only providers
  the child lacks, and **Add selected** adds what you tick. OAuth/login providers, providers with
  custom headers and non-https endpoints are not offered; log in to those inside Fishball. Keys
  never reach the page, the logs or the chat. Providers Fishball already has are kept.
- **The choice:** sync only copies the list. The model Fishball uses is chosen in **fishball-core's
  settings** (Fishball's model) or in the **model dialog** fishball-ui shows when you open the
  Fishball page with no model set. Until one is chosen, Fishball uses that DSH's default model.

## Use a connector from another DSH

`dsh-connector-adapter` lets any DSH use another DSH's connector through DSH's own MCP client:

1. Install it in the DSH that uses the connector (not in the connector's DSH).
2. In its settings, set **clientMetadataUrl** (required, no default) to the https URL of your
   Client ID Metadata Document, and add each connector under **servers** as `{serverName, url}`.
   `url` is the connector's MCP endpoint ending in `/api/agent/mcp`; it must be **https**, except on
   a loopback host (`127.0.0.1`, `[::1]`, `localhost`), where `http` is allowed. Any other `http`
   URL refuses the adapter's start (`insecure-server-url`).
3. Ask the agent to call `dsh_connector_sign_in` with the server name. It answers `authorized`
   (nothing to do), `approval-url` (open the URL in your browser and enter a connector token there;
   never paste a token into the chat), `needs-authorization` (the attempt ended before a URL was
   ready: call it again), `needs-configuration`, `failed` or `unknown-server`. Once signed in, the
   server's tools appear as `mcp__<serverName>__<tool>`.

Before any authorization request the adapter checks that the server is a DSH connector (its
metadata names `/api/agent/mcp`, the `/api/agent/oauth` issuer and the `agent` scope).

### The Client ID Metadata Document

Connect (fishball-core) and the adapter are browser OAuth clients without a secret. You host their
client document yourself on a public https URL with a path (not `/`). The connector fetches it with
no redirects, at most 5 KiB, and refuses private and loopback addresses. A template:

```json
{
  "client_id": "https://example.com/dsh/client.json",
  "client_name": "My Fishball",
  "redirect_uris": ["http://127.0.0.1/callback"],
  "token_endpoint_auth_method": "none"
}
```

`client_id` must equal the document's own URL. Clients use `http://127.0.0.1:<any port>/callback`;
a loopback redirect may differ from a registered one in its port only (`localhost` is a different
host). For Connect from a browser on another machine, also register
`https://<Fishball's own host>/api/fishball/connect/callback`.

### One departure from the MCP specification

The specification asks for https on every authorization-server URL. DSH's listener and the
connector's approval page are plain http on loopback, so on loopback the connector serves them
over http. Every non-loopback host must be https. The connector has no tunnel feature; to reach it
from outside, put both listeners (DSH's port and the approval port, default 47615) behind your own
tunnel and start DSH with `--trusted-host`. Hosted MCP clients (for example Claude's hosted
connectors) call from their provider's servers and need such a tunnel.

## Uninstall

DSH runs no plugin code when a plugin is removed: removing it on the Plugins page stops it as
Disable does, and `dsh plugin remove` only runs pnpm. So the instance ships a cleanup command.

### `dsh-instance`

1. Quit DSH. That also stops Fishball's child.
2. Run the cleanup command from the installed package:

   ```bash
   node ~/.dsh/profiles/web/node_modules/dsh-instance/uninstall.js
   ```

   It works on `$DSH_HOME` if set, else `~/.dsh`. For another home, add `--home <DSH_HOME>`.
3. Remove the package: `dsh plugin --profile web remove dsh-instance`, or start DSH and remove it
   on the Plugins page.

**What it removes:** the whole `<DSH_HOME>/fishball/runtime` tree and nothing else: the child's
DSH home (its profile, Fishball's session, settings, model keys, private Skills and
placed plugins), its workspace and other folders, the owner marker, secret and logs. It keeps
`<DSH_HOME>/fishball/hosted.json` (the keys of the token entries the instance created, so a
reinstall can retire them) and never touches the connector's token entries: delete a dead hosted
entry yourself on the connector's settings page. A symbolic link inside the tree is removed as a
link; what it points to is never touched.

**When it refuses**, it removes nothing and prints a code (exit code 1):

| Code | Meaning |
| --- | --- |
| `CHILD_RUNNING` | Fishball's child is still running. Quit DSH, wait a few seconds and run it again. |
| `CHILD_STATE_UNKNOWN` | Whether Fishball's child runs cannot be checked. The message names the cause. If `/bin/ps` cannot be run here (in a sandbox, say), quit DSH and run the command where it works. If the child's launch record is missing, its state cannot be confirmed: stop DSH, check that no Fishball child process is left running, then delete `<DSH_HOME>/fishball/runtime` yourself. |
| `UNSAFE_DIRECTORY` | A folder on the way (`fishball`, `runtime` or one inside it) is a symbolic link, not private to you, or not a folder. |
| `UNOWNED_RUNTIME` | The tree belongs to another DSH home: its owner marker names a different home. |
| `INVALID_MAIN_HOME` | The home is not an absolute real path. Pass the real path with `--home`. |

"Nothing to remove" (exit code 0) means that home has no tree. If you removed the package without
running the command, quit DSH and delete `<DSH_HOME>/fishball/runtime` yourself.

### `dsh-agent-connector`, `dsh-connector-amenities`, `dsh-connector-adapter`, `dsh-connector-watchdog`

Remove them like any plugin (`dsh plugin --profile web remove <name>`, or on the Plugins page).
Their data is kept, as for any DSH plugin. Agents using a removed connector lose their access.

### Fishball plugins in a standalone DSH

Remove `fishball-core` (and `fishball-amenities` or individual amenities if installed) like any plugin.

### Reinstall

Install again as above. After the cleanup command, the instance starts with a fresh child and syncs
the model list once more.

## Licence

[MIT](LICENSE). Each package carries its own `LICENSE` and, where it has third-party code,
`THIRD_PARTY_NOTICES.md`. The repository is public on GitHub, and the packages are on npm under the
`alpha` tag.
