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

`node scripts/pack-v3.mjs` builds the nine release tarballs into `.runtime/release/1.0.0-alpha.1/`,
with SHA256SUMS, an offline pnpm store, `INSTALL.md` (install and uninstall, from npm or offline) and
`PUBLISH.md` (the publish commands). The packages are published to npm under the `alpha` tag by the
maintainer only. The connector's npm name is **`dsh-agent-connector`** (`dsh-connector` is taken on
npm); its folder, plugin row id and settings stay `dsh-connector`.

## Packages

**DSH side** (generic MCP; installed in the DSH whose sessions are exposed):

| Package | What it does |
| --- | --- |
| [`dsh-connector`](packages/dsh-connector) | The backend. The MCP endpoint `/api/agent/mcp` and its own OAuth server (`/api/agent/oauth`, scope `agent`); token entries, pairs and names, the per-agent mailbox, routing, `message_agent` / `ask_agent`, the hand-over service and the tool contribution service. Its own settings page: tokens (New token, revealed once), the designated agent, the approval-page port, the limits. It changes no other DSH UI. Needs `@deepseek-ai/dsh-web-app` in the profile. |
| [`dsh-connector-ui`](packages/dsh-connector-ui) | The frontend. The sidebar fish and its light; the window that opens the hosted child's Fishball page; a hint when no child instance runs here; the notify prompt; the managed marks with **Hand over** / **Take back**. It declares the `notify` and `attention.*` tools, which the connector handles. It stores nothing. Without a connector it logs `connector-missing` and draws nothing. |
| [`dsh-instance`](packages/dsh-instance) | The hosted child. Runs Fishball in its own private DSH profile under `<DSH_HOME>/fishball/runtime`, started after DSH is ready and stopped with it. Places the Fishball plugins in the child, gives the child a token from this DSH's connector once, and has its own settings page (status, Retry, Reconnect, Open Fishball, model sync, `enabled`, `targetUrl`). It imports no Fishball code. |
| [`dsh-connector-adapter`](packages/dsh-connector-adapter) | Optional, for a DSH that uses **another** DSH's connector through DSH's own MCP client (`dsh-mcp-client`): browser sign-in, refreshed tokens and a loopback proxy. See [Use a connector from another DSH](#use-a-connector-from-another-dsh). |
| [`dsh-connector-shared`](packages/dsh-connector-shared) | A library inside the DSH-side tarballs. Not a plugin. |

**Fishball side** (installed in a Fishball DSH: the hosted child, or a DSH you set up yourself):

| Package | What it does |
| --- | --- |
| [`fishball-core`](packages/core) | The backend: the one manager session and its preset, persona, reminders and private Skills; the MCP link to the target connector, Connect, interception, status, the ask cards, the guard rows; its own settings page (target, Connect, identity, token field, **Fishball's model**). |
| [`fishball-ui`](packages/fishball-ui) | Every UI change inside a Fishball DSH: the Fishball page, the UI guard rows, the Recommended tab, the status strip, the pairing views, the ask cards and the model dialog. Without core it logs `fishball-core-missing` and changes nothing. |
| [`fishball-board`](packages/board) | Fishball's work board: `board_*` tools, `board_search`, the archive. |
| [`fishball-shared`](packages/shared) | A library inside the Fishball-side tarballs (today only the core/ui seam). Not a plugin. |

Not in this release: fold-notify (its notify function is `dsh-connector-ui`'s `notify` tool), the
hosted settings bundle, and Watchdog (a separate future project). The repository root is not a
plugin. See [docs/package-layout.md](<docs/package-layout.md>).

## Supported DSH versions

- DSH **0.2.1-rc.5** and **0.2.2-rc.1**, either the DSH Web build or the one bundled with DSH-X.
- Node: whichever one runs your DSH. The instance starts its child with DSH's own executable and
  arguments. The connector needs Node 22.14 or later; DSH itself needs Node 24.9 or later.

## Install (hosted: Fishball runs inside your DSH)

This is the usual set-up. The commands use the profile `web`; use your own profile after
`--profile`. Quit DSH first.

1. **Remove any earlier Fishball packages** (`dsh-fishball`, `fishball-connector`,
   `fishball-instance`, `fishball-embed-ui`, `dsh-fishball-*`), and delete
   `<DSH_HOME>/fishball/` if an earlier release left it. Nothing is migrated.

2. **Install the three DSH-side plugins** from the release tarballs:

   ```bash
   dsh plugin --profile web add dsh-agent-connector@1.0.0-alpha.1 dsh-connector-ui@1.0.0-alpha.1 dsh-instance@1.0.0-alpha.1
   ```

   To install from the release folder with no network, see its `INSTALL.md`.
   You do not install the Fishball-side packages: the instance installs `fishball-ui`,
   `fishball-board` and `fishball-core` into its child, from npm at its own version, or from the
   tarballs it carries when the registry cannot be reached; the child's bundles end with board, ui,
   then core last. pnpm may list DSH's own packages as missing peers; DSH provides them when it runs,
   so that warning is expected.

3. **Start DSH.** The instance starts Fishball once DSH is ready. On its first start it creates the
   child under `<DSH_HOME>/fishball/runtime`, gives the child a token from this DSH's connector,
   and copies your DSH model list into the child once (see
   [Fishball's model](#fishballs-model)). The DSH home must be a canonical real path, not a path
   through a symbolic link such as `/tmp` (`/private/tmp` on macOS); otherwise the instance reports
   `INVALID_MAIN_HOME` and does not start.

4. **Open Fishball** with the fish in the sidebar, or with **Open Fishball** on the instance's
   settings page (DSH → Plugins → `dsh-instance`). Open DSH at `127.0.0.1` or `localhost`: the
   window refuses other host names. With no model set, Fishball asks you to choose one.

Without `dsh-connector-ui` the connector and the instance still work, but there is no fish, window
or Hand over button; open Fishball from the instance's settings page. With only the connector, no
DSH UI changes at all.

## Install (standalone: Fishball in its own DSH)

Use a separate DSH (on this machine or another one) as Fishball, and link it to the DSH you want it
to manage:

1. In the **managed DSH**, install `dsh-agent-connector` (and `dsh-connector-ui` if you want the fish and
   Hand over there).
2. In the **Fishball DSH**, install the three Fishball plugins, core last:

   ```bash
   dsh plugin --profile web add fishball-ui@1.0.0-alpha.1 fishball-board@1.0.0-alpha.1 fishball-core@1.0.0-alpha.1
   ```

   If core is not last, it moves itself to the end of the profile's bundles at its first start;
   its guards then hold after one restart (or at once with HMR on).
3. Host a Client ID Metadata Document (below) and put its https URL in **fishball-core**'s
   settings as **Client metadata URL**. Set **Target** to the managed DSH's connector endpoint,
   for example `http://127.0.0.1:<port>/api/agent/mcp`.
4. Press **Connect** in fishball-core's settings, open the approval page, and enter a token you
   created with **New token** on the managed DSH's connector settings page. Fishball's id is sent
   for you. The grant is saved and refreshed; a restart needs no new sign-in.

A target on another machine must be **https** (only loopback may use plain http), for example
through your own tunnel. Connect from a browser on another machine also needs Fishball's own page
served over https.

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
DSH home (its profile, Fishball's session, settings, model keys, private Skills, board data and
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

### `dsh-agent-connector`, `dsh-connector-ui`, `dsh-connector-adapter`

Remove them like any plugin (`dsh plugin --profile web remove <name>`, or on the Plugins page).
Their data is kept, as for any DSH plugin. Agents using a removed connector lose their access.

### Fishball plugins in a standalone DSH

Remove `fishball-core`, `fishball-ui` and `fishball-board` like any plugin. The board's data stays
in `<DSH home>/fishball-board/`, because DSH gives a plugin no removal hook. **We recommend that you
delete that folder yourself** after removing the plugin. There is no board export.

### Reinstall

Install again as above. After the cleanup command, the instance starts with a fresh child and syncs
the model list once more.

## Licence

[MIT](LICENSE). Each package carries its own `LICENSE` and, where it has third-party code,
`THIRD_PARTY_NOTICES.md`. The repository is public on GitHub. The packages are not published to npm.
