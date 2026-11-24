<div align="center">

<img src="assets/fishball-icon.svg" alt="Fishball for DeepSeek Harness" width="88">

<h1>Fishball for DeepSeek Harness</h1>

<p>An always-on personal assistant and MCP/OAuth control plane for <b>DeepSeek Harness (DSH)</b>.</p>

<p>
  <a href="#quick-start-embedded-edition"><b>Quick start</b></a> ·
  <a href="#how-it-fits-together"><b>How it fits together</b></a> ·
  <a href="#standalone-edition"><b>Standalone</b></a> ·
  <a href="#connecting-external-agents-mcp--oauth-21"><b>MCP &amp; OAuth</b></a> ·
  <a href="#repositories"><b>Repositories</b></a> ·
  <a href="README.zh-CN.md"><b>中文</b></a>
</p>

<p>
  <a href="https://www.npmjs.com/package/dsh-fishball-bundle"><img alt="npm alpha" src="https://img.shields.io/npm/v/dsh-fishball-bundle/alpha?label=npm%20alpha&color=22d3ee&labelColor=0c1219"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-5eead4?labelColor=0c1219"></a>
  <img alt="DSH" src="https://img.shields.io/badge/DSH-0.2.1--rc.5%20%7C%200.2.2--rc.1-a78bfa?labelColor=0c1219">
  <br>
  <img alt="Protocol" src="https://img.shields.io/badge/protocol-MCP%20%2B%20OAuth%202.1-38bdf8?labelColor=0c1219">
  <img alt="Node" src="https://img.shields.io/badge/node-%E2%89%A5%2024.9-3c873a?logo=nodedotjs&logoColor=white&labelColor=0c1219">
  <a href="https://github.com/Arrosam/dsh-fishball-bundle/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/Arrosam/dsh-fishball-bundle?color=eab308&labelColor=0c1219"></a>
</p>

</div>

---

**Fishball** runs a dedicated assistant session inside **DeepSeek Harness (DSH)** that coordinates your other DSH sessions, summarizes progress, relays or handles permission requests, questions, and plan reviews, and dispatches work on your behalf without modifying local files directly.

`dsh-fishball-bundle` is the **all-in-one embedded distribution** for general users: one plugin install brings in the isolated Fishball child runtime, the MCP/OAuth connector, the in-DSH portal UI, and the Watchdog & cross-DSH adapter amenities.

> **One-command embedded install** — no separate child profile to manage. `dsh-instance` launches and supervises Fishball's isolated child DSH, syncs your API-key providers, and provisions its token automatically.
>
> **Watchdog & cross-DSH** — `dsh-connector-watchdog` supervises managed sessions with its own configurable model and auto-approves in-scope permissions; `dsh-connector-adapter` signs into other DSH connectors over MCP.
>
> **Open MCP + OAuth 2.1** — the same `dsh-agent-connector` endpoint lets Claude Code, custom bots, or any external MCP client manage handed-over DSH sessions safely.

---

## How it fits together

```
Main DSH (your workspace & sessions)
  │
  ├── dsh-agent-connector        MCP (/api/agent/mcp) + OAuth 2.1 (/api/agent/oauth)
  │     └── dsh-connector-ui     Sidebar Fishball entry, portal window, Hand over / Take back
  ├── dsh-connector-watchdog     Supervises managed sessions (dedicated model + preset-watchdog)
  ├── dsh-connector-adapter      Signs this DSH in to other DSH connectors (OAuth PKCE + CIMD)
  └── dsh-instance               Launches & bridges the isolated child DSH
        │
        └── Child DSH (~/.dsh/fishball/runtime)
              ├── fishball-core        Assistant runtime, persona, private skills
              └── fishball-amenities   Board, Heartbeat, and Taskboard
```

Four packages wired together by [`cordis.patch.yml`](cordis.patch.yml):

| Package | Role |
| --- | --- |
| `dsh-instance` | Spawns and manages Fishball's isolated child DSH (`fishball-core` + `fishball-amenities`), syncs API-key model providers, and provisions the hosted token. |
| `dsh-agent-connector` | Exposes this DSH's sessions over MCP (`/api/agent/mcp`) and OAuth 2.1 (`/api/agent/oauth`), and renders the Fishball portal & **Hand over / Take back** controls. |
| `dsh-connector-adapter` | Lets this DSH sign in to remote or sibling DSH connectors over MCP. |
| `dsh-connector-watchdog` | Supervises managed sessions against their goal and approves in-scope permission requests (`preset-watchdog`). |

> **Do not install separately.** Never install `dsh-agent-connector`, `dsh-connector-amenities`, or `dsh-instance` alongside `dsh-fishball-bundle` — it already includes all of them, and separate installs will create duplicate plugin entries.

---

## Quick start (Embedded edition)

### Prerequisites

| Requirement | Detail |
| --- | --- |
| **DSH** | `0.2.1-rc.5` or `0.2.2-rc.1` (and compatible `0.2.2` releases), DSH Web or DSH-X. |
| **Node.js** | `24.9+` for running DSH (`22.14+` for package tooling). |
| **`$DSH_HOME`** | Default `~/.dsh` must be a **real, non-symlink** directory (otherwise `dsh-instance` refuses with `INVALID_MAIN_HOME`). |

### 1. Install

Quit DSH before installing. If you previously installed pre-V3 preview packages (`dsh-fishball`, `fishball-connector`, `fishball-instance`, `fishball-embed-ui`, `dsh-fishball-*`) or older separate packages (`dsh-agent-connector`, `dsh-connector-amenities`, `dsh-instance`), remove them first (and delete `<DSH_HOME>/fishball/` if upgrading from pre-V3).

Install via DSH's UI (**Plugins → Add plugin → `dsh-fishball-bundle@1.0.0-alpha.3`**), or from your terminal (replace `web` with your DSH profile name if different):

```bash
dsh plugin --profile web add dsh-fishball-bundle@1.0.0-alpha.3
```

*(pnpm may print missing-peer warnings for `@deepseek-ai/*` packages; DSH provides those at runtime, so the warning is expected.)*

### 2. First start & onboarding

1. Start DSH and open it in your browser at `http://127.0.0.1:<port>` or `http://localhost:<port>` (non-loopback hostnames are restricted for local security).
2. Click the **Fishball** icon in the sidebar (or go to **Plugins → Fishball → Open Fishball**).
3. Complete the first-run onboarding wizard:
   - **Fishball model:** Syncs your API-key model providers once automatically and lets you pick Fishball's model. *(OAuth/login providers and non-HTTPS endpoints are not copied automatically — sign in inside Fishball if needed.)*
   - **Watchdog model:** Optionally pick a dedicated model for `dsh-connector-watchdog` (disabled by default until configured).
   - **Recommended plugins:** Optionally install recommended Fishball plugins into the child DSH.
4. Open **Plugins → Fishball** at any time to manage everything in one place:
   - **Fishball** tab: child runtime status, **Open Fishball**, **Reconnect**, model sync, and auto-launch toggle.
   - **Connector** tab: create/manage MCP tokens (`dsht_...`), approval page port (default `47615`), DSH display name, and safety limits.
   - **Components** section: click `dsh-connector-adapter` or `dsh-connector-watchdog` to configure cross-DSH servers or Watchdog's model and patrol limits.

### 3. Uninstall

1. Quit DSH (stops the embedded Fishball child process).
2. Remove `<DSH_HOME>/fishball/runtime` cleanly (`--home <path>` if not using `~/.dsh`):

   ```bash
   node ~/.dsh/profiles/web/node_modules/dsh-instance/uninstall.js
   ```

3. Remove the bundle:

   ```bash
   dsh plugin --profile web remove dsh-fishball-bundle
   ```

---

## Standalone edition

If you prefer running Fishball in its **own separate DSH instance** (on the same computer or a remote server) to manage one or more target DSH instances:

### Step 1: Install Connector on the managed DSH

Quit the managed DSH, then run:

```bash
dsh plugin --profile web add dsh-agent-connector@1.0.0-alpha.3
# Optional: adapter + watchdog amenities
dsh plugin --profile web add dsh-connector-amenities@1.0.0-alpha.1
```

Start the managed DSH, open **Plugins → Fishball connector**, enter a label under **Tokens**, and click **New token**. Copy the `dsht_...` token immediately (it is shown only once).

### Step 2: Install Fishball on the Fishball DSH

Quit the dedicated Fishball DSH, then run:

```bash
dsh plugin --profile fishball add fishball-core@1.0.0-alpha.1
# Optional: board, heartbeat, and taskboard amenities
dsh plugin --profile fishball add fishball-amenities@1.0.0-alpha.1
```

*(Omit `--profile fishball` or replace with your profile name as needed.)*

### Step 3: Link Fishball to the managed DSH

Open the Fishball DSH → **Plugins → fishball-core**:

1. Set **Target** to the managed DSH's MCP endpoint, e.g. `http://127.0.0.1:<port>/api/agent/mcp` (or `https://<host>/api/agent/mcp` for a remote DSH).
2. Authenticate using either method:
   - **Direct Token:** Paste `dsht_...` into **Token for connecting a DSH** and click **Save**.
   - **Browser Connect (OAuth PKCE + CIMD):** Host a [Client ID Metadata Document](#method-b-browser--public-oauth-clients-pkce-s256--cimd), enter its `https://...` URL in **Client metadata URL**, click **Connect**, and enter `dsht_...` on the approval page (default `http://127.0.0.1:47615/authorize`).

> **Loopback vs. remote:** Non-loopback connections require **HTTPS** (for example behind a reverse proxy or tunnel with `--trusted-host`). Plain HTTP is accepted only on `127.0.0.1`, `localhost`, and `[::1]`.

---

## Connecting external agents (MCP + OAuth 2.1)

Any MCP-compatible agent or orchestrator (Claude Code, custom bots, scripts, or another DSH) can manage sessions on a DSH running `dsh-agent-connector`. Create a dedicated token (`dsht_...`) in **Plugins → Fishball → Connector** (embedded) or **Plugins → Fishball connector** (standalone).

### Endpoints

| Purpose | Path |
| --- | --- |
| MCP Streamable HTTP (`2026-07-28`) | `/api/agent/mcp` |
| OAuth 2.1 Issuer / Token Endpoint | `/api/agent/oauth` (`/api/agent/oauth/token`) |
| Protected Resource Metadata (RFC 9728) | `/.well-known/oauth-protected-resource/api/agent/mcp` |
| Authorization Server Metadata (RFC 8414) | `/.well-known/oauth-authorization-server/api/agent/oauth` |
| Browser Approval Page (PKCE) | `http://127.0.0.1:47615/authorize` *(port configurable)* |

### Method A: Machine / headless agents (`client_credentials`)

1. Request a 1-hour access token from `POST <origin>/api/agent/oauth/token`:
   - `grant_type=client_credentials`
   - `client_id=<agent-id>` (`1–64` chars matching `[A-Za-z0-9_-]+`)
   - `client_secret=<dsht_token>` (via HTTP Basic `client_secret_basic` or form body `client_secret_post`)
   - `resource=<origin>/api/agent/mcp`
2. Connect to `/api/agent/mcp` with `Authorization: Bearer <access_token>` (do **not** send a browser `Origin` header; requests with `Origin` are rejected).
3. On first connection, the token starts with `agent:pair` scope — call the MCP tool `pair` (with optional `name`) once to bind `<agent-id>` to the token. Thereafter, tokens for that `<agent-id>` receive full `agent` scope.

### Method B: Browser / public OAuth clients (PKCE `S256` + CIMD)

For interactive MCP clients without a client secret (including `dsh-connector-adapter` in another DSH):

1. Host a **Client ID Metadata Document (CIMD)** over public `https://` (no redirects, max 5 KiB, no private/loopback host):

   ```json
   {
     "client_id": "https://example.com/dsh/client.json",
     "client_name": "My Agent",
     "redirect_uris": ["http://127.0.0.1/callback"],
     "token_endpoint_auth_method": "none"
   }
   ```

   `client_id` must match the document URL (`http://127.0.0.1:<port>/callback` allows any loopback port).
2. Complete OAuth 2.1 Authorization Code + PKCE (`S256`) using `client_id` = your CIMD URL and authorize on the approval page with your `dsht_...` token. Refresh tokens rotate on use.
3. From another DSH using `dsh-connector-adapter`, configure `clientMetadataUrl` and `servers` (`{ serverName, url }`), then ask the agent to invoke `dsh_connector_sign_in`.

### Session & event workflow

- **Scoped access:** Agents only see and operate sessions they started (`session_start`) or sessions explicitly handed over by the user (**Hand over** in DSH's session header/menu).
- **Mailbox events:** Subscribe to `dsh-agent://events` for change hints, read events with `inbox_poll`, and acknowledge them with `inbox_ack`.
- **Approvals & control:** Use `session_message`, `session_read`, `session_stop`, `session_redirect`, `session_release`, `permission_decide`, `question_answer`, and `plan_review_decide`. Subscribe to `dsh-agent://identity` for live DSH name updates.
- **Remote exposure:** Route both DSH's web port and the approval port (`47615`) over `https://` behind your reverse proxy or tunnel, passing `--trusted-host` to DSH.

---

## Repositories

Source code, test suites, and offline release packers live across the three component repositories:

| Repository | npm Packages | Description |
| --- | --- | --- |
| [`Arrosam/dsh-connector`](https://github.com/Arrosam/dsh-connector) | `dsh-agent-connector`, `dsh-connector-amenities`, `dsh-connector-adapter`, `dsh-connector-watchdog`, `dsh-connector-shared` | Generic DSH-side MCP/OAuth connector, session UI, cross-DSH adapter, and Watchdog. |
| [`Arrosam/dsh-fishball`](https://github.com/Arrosam/dsh-fishball) | `fishball-core`, `fishball-amenities`, `fishball-board`, `fishball-heartbeat`, `fishball-taskboard`, `fishball-shared` | Fishball assistant runtime, persona, private skills, and Fishball-side amenities. |
| [`Arrosam/dsh-fishball-instance`](https://github.com/Arrosam/dsh-fishball-instance) | `dsh-instance` | Embedded child DSH launcher, model provider sync, onboarding, and lifecycle management. |

## License

[MIT](LICENSE)
