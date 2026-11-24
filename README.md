# Fishball for DeepSeek Harness (`dsh-fishball-bundle`)

[中文文档](README.zh-CN.md)

**Fishball** is an always-on personal assistant for **DeepSeek Harness (DSH)**. It runs a dedicated assistant session that coordinates your other DSH sessions, summarizes progress, relays or handles permission requests, questions, and plan reviews, and dispatches work on your behalf without modifying local files directly.

This repository is the **main entry point for general users**:

- **Embedded Edition (Recommended):** Install `dsh-fishball-bundle` with one command to get the complete Fishball experience inside your main DSH.
- **Standalone Edition:** Run Fishball in its own separate DSH profile or machine and link it over MCP.
- **Connect Any MCP Agent:** Expose your DSH sessions to external agents or clients via standard MCP + OAuth 2.1.

---

## Supported DSH Versions

- **DSH `0.2.1-rc.5` and `0.2.2-rc.1`** (and compatible `0.2.2` releases), either DSH Web or DSH-X.
- **Node `24.9+`** for running DSH (`22.14+` for package tooling).
- Your `$DSH_HOME` directory (default `~/.dsh`) must be a real, non-symlink path (otherwise the embedded Fishball child reports `INVALID_MAIN_HOME`).

---

## 1. One-Click Embedded Edition (Recommended)

`dsh-fishball-bundle` bundles everything required for the embedded edition into a single plugin install:

| Included Package | Role |
| --- | --- |
| `dsh-instance` | Launches and manages Fishball's isolated child DSH (`fishball-core`, `fishball-ui`, and `fishball-amenities`), syncs API-key model lists, and provisions its hosted token automatically. |
| `dsh-agent-connector` | Exposes this DSH's sessions over MCP (`/api/agent/mcp`) and OAuth (`/api/agent/oauth`), renders the Fishball sidebar entry & window (`dsh-connector-ui`), and adds **Hand over / Take back** controls in sessions. |
| `dsh-connector-adapter` | Allows this DSH to sign in to another DSH's connector over MCP. |
| `dsh-connector-watchdog` | Supervises managed sessions against their goal and automatically approves in-scope permission requests (`preset-watchdog`). |

> **Important:** Do **not** install `dsh-agent-connector`, `dsh-connector-amenities`, or `dsh-instance` separately alongside `dsh-fishball-bundle` — it already includes all of them, and installing them separately will create duplicate plugin entries.

### Install

Quit DSH before installing. If you previously installed pre-V3 preview packages (`dsh-fishball`, `fishball-connector`, `fishball-instance`, `fishball-embed-ui`, `dsh-fishball-*`) or older separate packages (`dsh-agent-connector`, `dsh-connector-amenities`, `dsh-instance`), remove them first (and delete `<DSH_HOME>/fishball/` if upgrading from pre-V3).

Install via DSH's UI (**Plugins → Add plugin → `dsh-fishball-bundle@1.0.0-alpha.3`**) or run from your terminal (replace `web` with your DSH profile name if different):

```bash
dsh plugin --profile web add dsh-fishball-bundle@1.0.0-alpha.3
```

*(pnpm may print missing-peer warnings for `@deepseek-ai/*` packages; DSH provides those at runtime, so the warning is expected.)*

### First Start & Configuration

1. Start DSH and open it in your browser at `http://127.0.0.1:<port>` or `http://localhost:<port>` (the Fishball window restricts non-loopback hostnames for local security).
2. Click the **Fishball** icon in the sidebar (or go to **Plugins → Fishball → Open Fishball**).
3. On first start, Fishball copies your API-key model providers once automatically and prompts you to choose a model for Fishball. (OAuth/login providers and non-HTTPS endpoints are not copied automatically — sign in to those directly inside Fishball if needed.)
4. Open **Plugins → Fishball** to configure everything in one place:
   - **Fishball** tab: child runtime status, **Open Fishball**, **Reconnect**, **Model for Fishball** sync, and auto-launch toggle.
   - **Connector** tab: create/manage MCP tokens, approval page port (default `47615`), DSH display name, and safety limits.
   - **Components** section: click `dsh-connector-adapter` or `dsh-connector-watchdog` to configure cross-DSH connections or Watchdog intervals/limits.

### Uninstall (Embedded Edition)

1. Quit DSH (this stops the embedded Fishball child process).
2. Run the instance cleanup script to remove `<DSH_HOME>/fishball/runtime` cleanly (`--home <path>` if not using `~/.dsh`):

   ```bash
   node ~/.dsh/profiles/web/node_modules/dsh-instance/uninstall.js
   ```

3. Remove the bundle:

   ```bash
   dsh plugin --profile web remove dsh-fishball-bundle
   ```

---

## 2. Standalone Edition (Separate Fishball DSH)

If you prefer running Fishball in its **own separate DSH instance** (on the same computer or a remote server) to manage one or more target DSH instances:

### Step 1: Install Connector on the Managed DSH

On the DSH whose sessions you want to manage (quit DSH first):

```bash
dsh plugin --profile web add dsh-agent-connector@1.0.0-alpha.3
# Optional: install adapter + watchdog amenities as well
dsh plugin --profile web add dsh-connector-amenities@1.0.0-alpha.1
```

Start the managed DSH, open **Plugins → Fishball connector**, enter a label under **Tokens**, and click **New token**. Copy the `dsht_...` token immediately (it is shown only once).

### Step 2: Install Fishball on the Fishball DSH

On the separate DSH dedicated to Fishball (quit DSH first):

```bash
dsh plugin --profile fishball add fishball-core@1.0.0-alpha.1
# Optional: board, heartbeat, and taskboard amenities
dsh plugin --profile fishball add fishball-amenities@1.0.0-alpha.1
```

*(Omit `--profile fishball` or replace with your profile name as needed.)*

### Step 3: Link Fishball to the Managed DSH

Open the Fishball DSH → **Plugins → fishball-core**:

1. Set **Target** to the managed DSH's MCP endpoint, e.g. `http://127.0.0.1:<port>/api/agent/mcp` (or `https://<host>/api/agent/mcp` for a remote DSH).
2. Authenticate using either method:
   - **Direct Token:** Paste the `dsht_...` token into **Token for connecting a DSH** and click **Save**.
   - **Browser Connect (OAuth PKCE + CIMD):** Host a [Client ID Metadata Document](#client-id-metadata-document-cimd), enter its `https://...` URL in **Client metadata URL**, click **Connect**, and enter the `dsht_...` token on the approval page (default `http://127.0.0.1:47615/authorize`).

> **Note:** Non-loopback connections require **HTTPS** (for example via your reverse proxy or tunnel, started with `--trusted-host`). Plain HTTP is accepted only on `127.0.0.1`, `localhost`, and `[::1]`.

---

## 3. Connecting Other Agents via MCP

Any MCP-compatible agent or orchestrator (Claude Code, custom bots, external scripts, or another DSH) can manage sessions on a DSH running `dsh-agent-connector` (included in both `dsh-fishball-bundle` and `dsh-agent-connector`).

### Endpoints

| Purpose | Path |
| --- | --- |
| MCP Streamable HTTP (`2026-07-28`) | `/api/agent/mcp` |
| OAuth 2.1 Issuer / Token Endpoint | `/api/agent/oauth` (`/api/agent/oauth/token`) |
| Protected Resource Metadata (RFC 9728) | `/.well-known/oauth-protected-resource/api/agent/mcp` |
| Authorization Server Metadata (RFC 8414) | `/.well-known/oauth-authorization-server/api/agent/oauth` |
| Browser Approval Page (PKCE) | `http://127.0.0.1:47615/authorize` (port configurable) |

First, create a dedicated token (`dsht_...`) for your agent in the Connector settings (**Plugins → Fishball → Connector** in the embedded edition, or **Plugins → Fishball connector** in standalone mode).

### Method A: Machine / Headless Agents (`client_credentials`)

1. Request a 1-hour access token from `POST <origin>/api/agent/oauth/token`:
   - `grant_type=client_credentials`
   - `client_id=<agent-id>` (`1–64` chars matching `[A-Za-z0-9_-]+`)
   - `client_secret=<dsht_token>` (via HTTP Basic `client_secret_basic` or form body `client_secret_post`)
   - `resource=<origin>/api/agent/mcp`
2. Connect to `/api/agent/mcp` with `Authorization: Bearer <access_token>` (do **not** send a browser `Origin` header; requests with `Origin` are rejected).
3. On first connection, the token starts with `agent:pair` scope — call the MCP tool `pair` (with optional `name`) once to bind `<agent-id>` to the token. After pairing, the token and future `client_credentials` tokens for that `<agent-id>` receive full `agent` scope.

### Method B: Browser / Public OAuth Clients (PKCE S256 + CIMD)

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
2. Perform standard OAuth 2.1 Authorization Code + PKCE (`S256`) using `client_id` = your CIMD URL and authorize on the approval page with your `dsht_...` token. Refresh tokens rotate on use.
3. If connecting from another DSH using `dsh-connector-adapter`, configure `clientMetadataUrl` and `servers` (`{ serverName, url }`), then ask the agent to invoke `dsh_connector_sign_in`.

### Session & Event Workflow

- **Scoped access:** Agents only see and operate sessions they started (`session_start`) or sessions explicitly handed over by the user (**Hand over** in DSH's session header/menu).
- **Mailbox events:** Subscribe to `dsh-agent://events` to receive change hints, read events with `inbox_poll`, and acknowledge them with `inbox_ack`.
- **Approvals & control:** Use `session_message`, `session_read`, `session_stop`, `session_redirect`, `session_release`, `permission_decide`, `question_answer`, and `plan_review_decide`. Subscribe to `dsh-agent://identity` for live DSH name updates.
- **Remote exposure:** Both DSH's web port and the approval port (`47615`) must be routed over `https://` behind your own reverse proxy/tunnel, with `--trusted-host` passed to DSH.

---

## 4. Underlying Packages & Repositories (Advanced Users & Developers)

If you want to inspect the source code, run test suites, customize individual components, or build offline tarballs manually, see the underlying repositories:

| Repository | npm Packages | Description |
| --- | --- | --- |
| [`Arrosam/dsh-connector`](https://github.com/Arrosam/dsh-connector) | `dsh-agent-connector`, `dsh-connector-amenities`, `dsh-connector-adapter`, `dsh-connector-watchdog`, `dsh-connector-shared` | Generic DSH-side MCP/OAuth connector, session UI components, cross-DSH adapter, and Watchdog. |
| [`Arrosam/dsh-fishball`](https://github.com/Arrosam/dsh-fishball) | `fishball-core`, `fishball-amenities`, `fishball-board`, `fishball-heartbeat`, `fishball-taskboard`, `fishball-shared` | Fishball assistant runtime, persona, private skills, and Fishball-side amenities. |
| [`Arrosam/dsh-fishball-instance`](https://github.com/Arrosam/dsh-fishball-instance) | `dsh-instance` | Embedded child DSH launcher, model provider sync, and lifecycle management. |

## License

[MIT](LICENSE)
