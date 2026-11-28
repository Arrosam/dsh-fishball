<div align="center">

<img src="assets/fishball-icon.svg" alt="Fishball for DeepSeek Harness" width="88">

<h1>Fishball for DeepSeek Harness</h1>

<p>A personal assistant that coordinates your <b>DeepSeek Harness (DSH)</b> sessions from its own child DSH.</p>

<p>
  <a href="#install"><b>Install</b></a> ·
  <a href="#how-it-fits-together"><b>How it works</b></a> ·
  <a href="#components"><b>Components</b></a> ·
  <a href="#the-connector-endpoints"><b>MCP &amp; OAuth</b></a> ·
  <a href="TESTING.md"><b>Development</b></a> ·
  <a href="README.zh-CN.md"><b>中文</b></a>
</p>

<p>
  <a href="https://www.npmjs.com/package/dsh-fishball-bundle"><img alt="npm alpha" src="https://img.shields.io/npm/v/dsh-fishball-bundle/alpha?label=npm%20alpha&color=22d3ee&labelColor=0c1219"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-5eead4?labelColor=0c1219"></a>
  <img alt="DSH" src="https://img.shields.io/badge/DSH-0.2.1--rc.5%20%7C%200.2.2--rc.1-a78bfa?labelColor=0c1219">
  <br>
  <img alt="Protocol" src="https://img.shields.io/badge/protocol-MCP%20%2B%20OAuth%202.1-38bdf8?labelColor=0c1219">
  <img alt="Node" src="https://img.shields.io/badge/node-%E2%89%A5%2024.9-3c873a?logo=nodedotjs&logoColor=white&labelColor=0c1219">
  <a href="https://github.com/Arrosam/dsh-fishball/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/Arrosam/dsh-fishball?color=eab308&labelColor=0c1219"></a>
</p>

</div>

---

**Fishball** is an always-on personal assistant for DeepSeek Harness. It runs one long-lived
session in a **child DSH** of its own, and from there it manages sessions in your **main DSH**
through **`dsh-connector`**. It reads their progress, answers or passes on their permission
requests, questions and plan reviews, starts new sessions and messages them for you. It reads,
sorts, decides and delegates, but does no work itself and never writes your local files (its own
private Skills are the one exception).

Fishball is an ordinary MCP agent. The connector exposes a DSH's sessions over MCP with OAuth 2.1,
and Fishball uses that public surface only. The two sides never import each other's code, and the
connector serves any MCP client, not only Fishball.

> **One install** — `dsh-fishball-bundle` brings the connector, the hosted instance, Watchdog and
> the cross-DSH adapter into your main DSH. `dsh-instance` then creates, starts and supervises
> Fishball's child DSH, gives it a connector token and copies your API-key model providers into it.
>
> **Hand over, Take back** — you choose which sessions Fishball manages. It sees nothing else.
>
> **Watchdog** — an optional supervisor with its own model that keeps a managed session on purpose
> and settles its in-scope permission requests before they reach Fishball.

---

## How it fits together

```
Main DSH  (your workspaces and sessions)
  │
  ├── dsh-agent-connector       MCP /api/agent/mcp + OAuth 2.1 /api/agent/oauth, Hand over / Take back
  │     └── dsh-connector-ui    the Fishball sidebar entry and window, the notify prompt
  ├── dsh-connector-watchdog    supervises managed sessions, decides in-scope permission requests
  ├── dsh-connector-adapter     signs this DSH in to other DSHs' connectors
  └── dsh-instance              creates, starts and supervises the child DSH
        │
        └── Child DSH  (<DSH_HOME>/fishball/runtime)
              ├── fishball-core        the manager session  ── MCP ──▶ the main DSH's connector
              │     └── fishball-ui    the Fishball page, ask cards, sidebar targets
              └── fishball-amenities   board · heartbeat · taskboard · consultant
```

Five ideas, each doing one job:

| Concept | What it is |
|---|---|
| **Main DSH** | The DSH you work in. The connector, Watchdog, the adapter and the instance run here. |
| **Child DSH** | Fishball's own private DSH profile, run by `dsh-instance` and stopped with the main DSH. |
| **Connector** | `dsh-agent-connector`: the MCP endpoint and OAuth server that lets an agent with a token manage this DSH's sessions. |
| **Manager session** | Fishball's one long-lived session in the child, with its persona, reminders and private Skills. |
| **Managed session** | A main-DSH session Fishball started with `session_start`, or one you handed to it with **Hand over**. Fishball sees and operates only these. |

What happens in a managed session:

| Event | Where it goes |
|---|---|
| A turn comes to a standstill | Fishball gets one `turn-finished` with the final reply (cut to 4 KB) or the stop reason. |
| A permission request | Watchdog first, when it supervises the session: in scope → allow; off purpose and dangerous → reject; anything else → Fishball. Your own prompt shows when Fishball escalates it. |
| A question or plan review | Fishball, and your card in the session too. The first answer counts. |
| **Take back**, `session_release`, or its token switched off | Management ends, and anything still waiting comes to you. |

Fishball wakes on connector events in batches, one turn per batch, and anything you type is never
delayed.

---

## What you get

- **A coordinator, not a worker.** One manager session with a persona, reminders (`schedule_*`),
  `message_user` for the Fishball page, `ask_user` question cards and private Skills.
- **Scoped access.** The connector shows an agent only the sessions it manages. **Hand over to
  <agent>** and **Take back** sit in each session's header and sidebar menu, and a managed row shows
  Fishball's fish.
- **A hosted child that looks after itself.** `dsh-instance` places `fishball-core` and
  `fishball-amenities` in the child at every start, provisions its connector token once, and offers
  **Restart**, **Reconnect** and **Open Fishball**. A **Fishball** tab on the Plugins page installs,
  switches and removes the child's own plugins from the main DSH.
- **Guided first run.** Four skippable onboarding pages: Fishball's model, Watchdog's model,
  recommended memory and long-context plugins, and a welcome.
- **Model sync.** API-key providers and their model lists are copied into the child once,
  automatically; after that, **Check for new models** offers only what the child lacks. Keys never
  reach the page, the logs or the chat.
- **More than one DSH.** Fishball's settings hold a list of DSH targets, one connector endpoint each.
  In a hosted child the main DSH comes first and cannot be removed.
- **Watchdog.** Briefed per session with a purpose and a scope, it patrols on a timer, stops a
  drifting turn, and uses its own model. It stays off until you choose that model.
- **Cross-DSH sign-in.** `dsh-connector-adapter` lets a DSH use another DSH's connector through
  DSH's own MCP client, with browser OAuth.
- **Optional amenities** in the child: `fishball-taskboard` (a task board and memo pad in the right
  sidebar's **Task board** tab), `fishball-heartbeat` (keeps the prompt cache warm while Fishball is
  idle; off until both timer settings are set), `fishball-board` and `fishball-consultant`. See
  their READMEs for current limits: the board stays idle beside today's `fishball-core`, and the
  consultant sends nothing without a protected connector capability that current connectors lack.
- **Programmatic tool calling.** On DSH 0.2.2 the manager session calls its tools from `run_code`
  by default; DSH 0.2.1 keeps direct tool calls.

---

## Install

Fishball is in **alpha**. The packages are on npm under the `alpha` tag.

| | Path | Best for |
|---|---|---|
| **1** | [The bundle](#1-the-bundle-recommended) | Everyone. One plugin in your main DSH; Fishball runs in a child it manages. |
| **2** | [Components, hosted](#2-components-hosted) | Choosing the main-DSH packages yourself. |
| **3** | [Standalone Fishball DSH](#3-standalone-fishball-dsh) | Running Fishball in a DSH you set up yourself, on this machine or another. |
| **4** | [From source](#4-from-source) | Offline installs and local builds. |

### Requirements

| Requirement | Detail |
|---|---|
| **DSH** | Tested on `0.2.1-rc.5` and `0.2.2-rc.1`, DSH Web or the DSH bundled with DSH-X. |
| **Node.js** | `24.9+` to run DSH. The packages and release tooling need `22.14+`. |
| **`$DSH_HOME`** | Default `~/.dsh`. It must be a canonical real path, not one through a symbolic link, or `dsh-instance` refuses with `INVALID_MAIN_HOME`. |

### 1. The bundle (recommended)

`dsh-fishball-bundle` is the package at this repository's root. It depends on
`dsh-agent-connector`, `dsh-connector-adapter`, `dsh-connector-watchdog` and `dsh-instance`, and
its [`cordis.patch.yml`](cordis.patch.yml) wires them, and Watchdog's `preset-watchdog` agent preset,
into your profile.

1. **Quit DSH.** If you installed a pre-V3 preview (`dsh-fishball`, `fishball-connector`,
   `fishball-instance`, `fishball-embed-ui`, `dsh-fishball-*`), remove it and delete
   `<DSH_HOME>/fishball/`. Nothing is migrated.
2. **Install** on DSH's Plugins page (**Add plugin → `dsh-fishball-bundle@1.0.0-alpha.3`**), or from
   a terminal (`web` is the profile name; use your own):

   ```bash
   dsh plugin --profile web add dsh-fishball-bundle@1.0.0-alpha.3
   ```

   pnpm may report DSH's own `@deepseek-ai/*` packages as missing peers. DSH provides them at run
   time, so the warning is expected.
3. **Start DSH** and open it at `http://127.0.0.1:<port>` or `http://localhost:<port>`. The Fishball
   window refuses other host names.
4. **Open Fishball** with the fish in the sidebar, or with **Plugins → Fishball → Open Fishball**, and
   follow the onboarding.

> **Do not add the components on top.** The bundle already contains `dsh-agent-connector`,
> `dsh-connector-adapter`, `dsh-connector-watchdog` and `dsh-instance`. Installing any of them, or
> `dsh-connector-amenities`, beside it creates duplicate plugin rows.

**Plugins → Fishball** is the one settings page:

- **Fishball** tab: the child's status, **Open Fishball**, **Reconnect**, model sync and the on/off switch.
- **Connector** tab: MCP tokens (`dsht_…`), the approval page port (default `47615`), the DSH name
  and the connector's limits.
- **Components**: open `dsh-connector-adapter` or `dsh-connector-watchdog` to configure it.

### 2. Components, hosted

The same hosted set-up without the bundle. Quit DSH, then install the connector and the instance in
your main profile. `dsh-instance` places `fishball-core` and `fishball-amenities` in the child itself.

```bash
dsh plugin --profile web add dsh-agent-connector@alpha dsh-instance@alpha
# Optional: the adapter and Watchdog together
dsh plugin --profile web add dsh-connector-amenities@alpha
```

### 3. Standalone Fishball DSH

Fishball in a DSH of its own, managing one or more other DSHs.

1. **In each managed DSH**, install the connector, then create a token under **Plugins → Fishball connector
   → Tokens → New token**. The `dsht_…` value is shown once.

   ```bash
   dsh plugin --profile web add dsh-agent-connector@alpha
   ```

2. **In the Fishball DSH**, install `fishball-core` (it carries `fishball-ui`), and optionally the
   amenities. Install either the `fishball-amenities` umbrella or single amenities, never both.

   ```bash
   dsh plugin --profile fishball add fishball-core@alpha
   dsh plugin --profile fishball add fishball-amenities@alpha
   ```

3. **Link them** in **Plugins → fishball-core**: add the managed DSH's endpoint, for example
   `http://127.0.0.1:<port>/api/agent/mcp`, then either paste the token into that target's token
   field and **Save**, or use **Connect** (browser OAuth with a Client ID Metadata Document you host;
   see the [connector README](dsh-connector/packages/dsh-connector/README.md#browser-clients-authorization-code-with-pkce)).

Plain `http` is accepted only on loopback (`127.0.0.1`, `localhost`, `[::1]`). Any other target must
be `https`, for example behind your own tunnel with DSH started with `--trusted-host`.

### 4. From source

Pack the components from a checkout of this repository, Fishball first so the instance can embed its
tarballs for offline placement:

```bash
npm run pack:v3                            # → dsh-fishball/.runtime/release/<version>/
(cd dsh-connector && npm run pack)         # → dsh-connector/.runtime/release/<version>/
(cd dsh-fishball-instance && npm run pack) # → dsh-fishball-instance/.runtime/release/<version>/
```

Each release folder holds the tarballs, `SHA256SUMS`, an offline pnpm store and an `INSTALL.md` with
the exact install commands. See the [workspace and release layout](docs/layout.md).

---

## First run

1. **Fishball's model.** Onboarding syncs your API-key providers into the child and asks for the model
   Fishball uses, with its reasoning effort. OAuth/login providers, providers with custom headers and
   non-https endpoints are not copied; sign in to those inside Fishball. Until a model is chosen,
   Fishball uses the child's default model.
2. **Watchdog's model** (optional). Watchdog is disabled until it has one.
3. **Memory and context plugins** (optional), installed into the child.
4. **Hand over** a session from its header or sidebar menu, or ask Fishball to start one. **Take
   back** returns it to you at any time.

---

## The connector endpoints

Any MCP client can manage sessions on a DSH that runs `dsh-agent-connector`. Create a token for each
agent first; a token serves one agent and grants full manager rights over this DSH's sessions.

| Purpose | Path |
|---|---|
| MCP (Streamable HTTP, revision `2026-07-28`) | `/api/agent/mcp` |
| OAuth 2.1 issuer and token endpoint | `/api/agent/oauth`, `/api/agent/oauth/token` |
| Protected-resource metadata (RFC 9728) | `/.well-known/oauth-protected-resource/api/agent/mcp` |
| Authorization-server metadata (RFC 8414) | `/.well-known/oauth-authorization-server/api/agent/oauth` |
| Approval page for browser clients | `/authorize` on the approval port (default `47615`) |

Two ways in: **client credentials** for headless agents (the token is the client secret, then one
`pair` call), or **authorization code with PKCE `S256`** for browser clients, whose client id is a
Client ID Metadata Document you host. The flows, the MCP tools, session routing and the settings are
in the [connector README](dsh-connector/packages/dsh-connector/README.md).

---

## Components

This repository is an npm workspace and, at its root, the `dsh-fishball-bundle` package. The
component packages keep their own npm names and are released separately.

| Package | Folder | Installed in | Role |
|---|---|---|---|
| `dsh-fishball-bundle` | [`/`](.) | main DSH | The all-in-one bundle: depends on the four main-DSH plugins and carries the combined settings page. |
| `dsh-agent-connector` | [`dsh-connector/packages/dsh-connector`](dsh-connector/packages/dsh-connector/README.md) | main / managed DSH | The MCP endpoint, OAuth, tokens, session routing, Hand over / Take back. Ships the `dsh-connector-ui` component. |
| `dsh-connector-adapter` | [`dsh-connector/packages/dsh-connector-adapter`](dsh-connector/packages/dsh-connector-adapter/README.md) | any DSH | Signs a DSH in to another DSH's connector. |
| `dsh-connector-watchdog` | [`amenities/watchdog`](amenities/watchdog/README.md) | main / managed DSH | Supervises managed sessions for their manager. |
| `dsh-connector-amenities` | [`amenities/connector-amenities`](amenities/connector-amenities/README.md) | main / managed DSH | Umbrella for the adapter and Watchdog, with their settings pages. |
| `dsh-instance` | [`dsh-fishball-instance/packages/dsh-instance`](dsh-fishball-instance/packages/dsh-instance/README.md) | main DSH | Runs the hosted Fishball child and bridges it to the connector. |
| `fishball-core` | [`dsh-fishball/packages/core`](dsh-fishball/packages/core/README.md) | Fishball DSH / child | The manager session, its tools and links to DSH targets. Ships the `fishball-ui` component. |
| `fishball-amenities` | [`amenities/fishball-amenities`](amenities/fishball-amenities/README.md) | Fishball DSH / child | Umbrella for [`fishball-board`](amenities/board/README.md), [`fishball-heartbeat`](amenities/heartbeat/README.md), [`fishball-taskboard`](amenities/taskboard/README.md) and [`fishball-consultant`](amenities/consultant/README.md). |
| `fishball-shared`, `dsh-connector-shared` | [`dsh-fishball/packages/shared`](dsh-fishball/packages/shared/README.md), [`dsh-connector/packages/dsh-connector-shared`](dsh-connector/packages/dsh-connector-shared/README.md) | bundled | Libraries inside the tarballs. Not plugins. |

```
.                        dsh-fishball-bundle: index.js, client.js, cordis.patch.yml, locale/
dsh-fishball/            Fishball: core, UI, shared library, design docs, integration packages
dsh-connector/           the connector, the adapter, the shared library, integration packages
dsh-fishball-instance/   dsh-instance and its integration packages
amenities/               Fishball amenities (child) and connector amenities (main DSH)
scripts/                 the per-package test runner
docs/                    workspace layout and recovered release history
```

Each component folder has its own index: [Fishball](dsh-fishball/README.md),
[Connector](dsh-connector/README.md) and [Instance](dsh-fishball-instance/README.md). The approved
design is [dsh-fishball/DESIGN.md](dsh-fishball/DESIGN.md).

---

## Uninstall

DSH runs no plugin code when a plugin is removed, so clear the child first.

1. **Quit DSH.** That also stops Fishball's child.
2. **Remove the child's runtime** (`<DSH_HOME>/fishball/runtime` and nothing else). Add
   `--home <DSH_HOME>` if you do not use `~/.dsh`:

   ```bash
   node ~/.dsh/profiles/web/node_modules/dsh-instance/uninstall.js
   ```

   It refuses, deleting nothing, while the child still runs or when the folder is not provably this
   home's. The codes are listed in the [instance README](dsh-fishball-instance/README.md#install-and-uninstall).
3. **Remove the plugin:**

   ```bash
   dsh plugin --profile web remove dsh-fishball-bundle
   ```

The connector's settings and token entries stay in the profile, as for any DSH plugin.

---

## Development

Work from the repository root. Test one package, or the packages your change touches; there is no
whole-repository run for development.

```bash
npm run test:changed -- --list   # preview which packages a change selects
npm run test:changed             # test them, one worker per package
npm test -w fishball-core        # one package, by npm name
npm test -- dsh-fishball-bundle  # the root package
```

Tests run in throwaway homes, never against a live DSH profile. Integration packages and
`npm run test:release` are for releases only. The rules, options and package independence checks are
in **[TESTING.md](TESTING.md)**; packing is in [docs/layout.md](docs/layout.md).

## License

[MIT](LICENSE)
