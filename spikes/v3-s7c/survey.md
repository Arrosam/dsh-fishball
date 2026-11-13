# Spike S7c survey: existing OAuth add-ons for DSH's MCP client

Date: 2026-11-12 (NZDT). Read-only survey. Nothing was installed into a DSH home and nothing was run against a server. Packages were fetched with `npm pack --ignore-scripts` into `.runtime/survey/tgz/` (not committed), unpacked into `.runtime/survey/pkg/` and read with grep. "Code-verified" below means I read it in the packed tarball. Everything else comes from the README or the registry and is marked as such.

Working files:
- `index.json`: a copy of https://awesome-dsh-plugin.com/index.json (5,123 entries).
- `npm-meta.txt`: `npm view` metadata.
- `probe.txt`: per-package feature grep.
- `probe-proto.sh`: protocol-revision grep.

## TL;DR

- **No DSH plugin adds generic OAuth to `@deepseek-ai/dsh-mcp-client` itself in a way that fits our needs.** Our needs are: an arbitrary streamable-http server, CIMD or DCR, PKCE with a loopback redirect, live refresh, secure storage, and MCP 2026-07-28. Every generic DSH candidate falls into one of three groups:
  - It replaces the official client with its own MCP client. Most of these speak only legacy revisions, 2025-03-26 to 2025-06-18.
  - It injects a header into the official row once at boot (`dsh-mcp-auth`), so a refreshed token only takes effect after a restart.
  - It is restricted to a curated catalog (`dsh-connector-hub`).
- **The curated index has only one generic MCP-OAuth plugin**, `dsh-connector-hub`, and it is catalog-only with no licence. Most of the ~60 OAuth entries in the index are LLM-subscription logins. About 15 are single-vendor MCP connectors.
- **Two no-code paths fit dsh-mcp-client's existing rows:**
  1. **`mcp-remote` through a stdio row.** It is mature, supports CIMD (`--client-metadata-url`), DCR, PKCE, refresh and RFC 8707. With `--protocol auto` it bridges a 2025-era stdio client to a 2026-07-28 server. It is *not* a byte passthrough: it rewrites JSON-RPC between protocol eras. Its default, `legacy`, would fail against our modern-only server. Tokens are kept in plaintext JSON under `~/.mcp-auth`.
  2. **`mcp-oauth-gateway` through a streamable-http row.** It is a loopback reverse proxy that pipes HTTP bytes, so it does not depend on the protocol era. It does DCR or uses a pre-registered client id, plus PKCE and refresh, but has **no CIMD**. It must run as a separate `serve` process.

## 1. awesome-dsh-plugin.com index

Source: https://awesome-dsh-plugin.com/index.json, 5,123 plugins. I filtered names and descriptions for mcp, oauth, auth, token, proxy, header, credential, bearer and pkce.

### 1a. Generic: OAuth for any MCP server

| Entry | Link | Latest | Notes |
|---|---|---|---|
| `dsh-connector-hub` (Looori) | https://awesome-dsh-plugin.com/p/Looori/dsh-connector-hub--packages-connector-hub/ · https://github.com/Looori/dsh-connector-hub | 0.2.0, 2026-11-06 | Code-verified. 13 curated remote connectors. Uses OAuth through MCP SDK `@modelcontextprotocol/client` 2.2.0 `auth()`, with CIMD (`clientMetadataUrl`, documents hosted on looori.github.io) or a pre-set client id. Has refresh with cross-process coordination. Tokens are stored in the **macOS Keychain** (`@napi-rs/keyring`, service `dsh-connector-hub`). Official `dsh-mcp-client` rows point at a **loopback credential gateway** (127.0.0.1) that injects the bearer. This is the closest design to what S7c wants. **But:** the README says "The API does not accept arbitrary user-supplied URLs" and "No user-defined connectors outside the catalog". There is no `license` field and no LICENSE file, so the code cannot be reused. |
| `pi2dsh` (weijiafu14) | https://awesome-dsh-plugin.com/p/weijiafu14/pi2dsh/ | 0.27.1, 2026-11-03 | A Pi-extension compatibility engine. Its description says it runs `pi-mcp-adapter` (https://github.com/nicobailon/pi-mcp-adapter, MIT, 7.0.1), which has OAuth and `@napi-rs/keyring`. This is a heavy indirect stack (17 MB, many DSH peer dependencies). I did not inspect it further. |
| `dsh-mcp-connector` (duhu2000) | https://awesome-dsh-plugin.com/p/duhu2000/dsh-mcp-connector/ | 0.2.101, 2026-11-11 | An MCP "marketplace" of 100+ connectors with authorization settings, mainly the same author's Qichacha data sources. Not packed. |

### 1b. Single-vendor MCP OAuth (not generic)

These are useful only as reference implementations.

| Entry | Notes |
|---|---|
| `qcc-dsh-mcp-oauth`, `qcc-dsh-mcp-legal-oauth` (duhu2000) | PKCE, DCR, refresh. They write rows into dsh-mcp-client dynamically. |
| `dsh-qixin-insight-mcp-oauth` | OAuth 2.1 with PKCE, refresh and revoke. |
| `dsh-notion-oauth-ui` | Notion MCP with PKCE. |
| `@adenxie/dsh-vercel` | Vercel MCP. |
| `@nexscope/dsh-nexscope`, `dsh-plugin-knowra`, `dsh-quberi`, `dsh-reviso`, `fitmeet-dsh-plugin`, `@hiai-gg/dsh-docsmint`, `dsh-stitch-mcp` | Pasted OAuth token. |
| `dsh-plugin-adwhispr` | **Uses `mcp-remote`** for browser OAuth. This is a precedent for the stdio-bridge path. |

### 1c. MCP managers or header and secret helpers without OAuth

`dsh-mcp-tools` (Postman-style headers), `dsh-mcp-registry`, `@wingsky-1/dsh-mcp-manager`, `@xxxyz/dsh-mcp-manager`, `@moon16u/dsh-mcp-console`, `dsh-mcp-servers-panel`, `dsh-mcp-client-manager`, `@hyzyn/dsh-mcp`, `@zhujiuyi/dsh-mcpserver-manager`, `dsh-mcp-autoload`, `dsh-mcp-link`, `dsh-tavily-mcp`, `dsh-github-mcp`, `@specstream/dsh-plugin`, `dsh-mcp-tunnel` (mcp-proxy plus cloudflared, which is the opposite direction), `dsh-proxy-egress`, `dsh-net-proxy`.

None of these does the MCP authorization flow.

**Conclusion for the index:** it contains nothing that adds generic, any-URL MCP OAuth to dsh-mcp-client. The nearest entry (`dsh-connector-hub`) is catalog-locked and unlicensed.

## 2. npm: DSH plugins not in the index

Searched with `npm search` using these terms: `dsh mcp oauth`, `dsh-plugin oauth`, `dsh oauth mcp-client`, `cordis mcp oauth`, `mcp oauth proxy` and `mcp-remote oauth`. I checked each name against the index, and none of the packages below appear there.

| Package | Licence / last publish / maintainer | Flow and registration | Refresh / storage | MCP protocol and fit |
|---|---|---|---|---|
| `dsh-oauth-mcp` (https://github.com/lunnlew/dsh-oauth-mcp) | MIT · 0.0.5, 2026-11-09 (created 2026-11-08) · karoy (lunnlew) | Code-verified. RFC 9728/8414/OIDC discovery, PKCE S256, DCR. **No CIMD.** Loopback callback on 127.0.0.1:39271, or a manual paste-back of the callback URL. | Refresh: yes. Tokens in `ctx.credentials`, the DSH credential store. Per this repo's README that store is plaintext YAML with owner-only permissions. | Its own MCP session at `protocolVersion: '2025-06-18'`, which is **legacy only**. It registers its own `mcp_oauth__*` tools and does not use dsh-mcp-client. Brand new, version 0.0.x. |
| `dsh-mcp-auth` (no repo link) | MIT · 0.2.1, 2026-10-28 · z-y-q | Code-verified. Uses the MCP SDK 1.29 `auth()`. Client identity in order: **CIMD** (`clientMetadataUrl`), then a static client id, then DCR. PKCE, and a loopback listener on 127.0.0.1 with a state check. | Tokens in `~/.dsh/mcp-auth/tokens.json` (file 0600, directory 0700), plaintext. Refresh is "best-effort … applies to the next boot". | **Injects headers into the official dsh-mcp-client row** through `headers: !!js ctx.mcpAuth.headers('x')`, which is evaluated once at boot. Its own README admits the official row has no 401 handling. Because the header goes through the official client, the protocol era is that client's, not this plugin's. The stale-token-until-restart limitation rules it out for live refresh. |
| `dsh-mcp-oauth` (https://github.com/k0ndrateff/dsh-plugins) | MIT · 0.3.0, 2026-10-26 · k0ndrateff | README: a **library, not a plugin**. RFC 9728/8414, DCR, PKCE S256, loopback redirect. **No CIMD.** | Refresh under a cross-process lock. Uses `@deepseek-ai/dsh-credentials` (plaintext YAML). | Own bridge on `@modelcontextprotocol/client` 2.2.0. That SDK knows 2026-07-28, but its default negotiation is `"legacy"`, and this package never sets `versionNegotiation`. Used by the same author's Jira, Sentry, GitLab and Figma plugins. |
| `@plaudai/dsh-mcp-oauth` | **UNLICENSED** · 0.1.2, 2026-11-04 · larrylvplaud | DCR and PKCE. | Store under `~/.dsh` (configurable), 0600. | Sets `versionNegotiation: { mode: 'auto' }`, so it is the only DSH plugin found that is 2026-07-28-capable. Unusable because of the licence. |
| `dsh-plugin-mcp-apps` (https://github.com/xiaoqin422/dsh-plugin-mcp-apps) | MIT · 0.5.7, 2026-11-03 | README and code: DCR, **CIMD** (it serves its own metadata document from the DSH web origin), or a manual client id. PKCE plus state. The callback goes through the DSH web origin. | `$DSH_HOME/mcp-apps/connections.json`, 0600, plaintext. | Own SDK 2.x client with no `versionNegotiation`, so legacy. Not a dsh-mcp-client add-on. |
| `dsh-mcp-master` (https://github.com/lastorder/dsh-mcp-master) | MIT · 0.1.2, 2026-11-09 | README and code: RFC 9728, then 8414/OIDC, then DCR, then PKCE S256 with RFC 8707. **No CIMD.** | Refresh: yes. `~/.dsh/mcp-master/state.json`, 0600, plaintext. The README says logs redact codes and tokens. | Own zero-dependency client at 2025-06-18, so legacy. Replaces dsh-mcp-client. |
| `suveng-dsh-plugin-mcp-manager` (https://github.com/suveng/dsh-plugin-mcp-manager) | MIT · 0.1.2, 2026-11-04 | DCR or a manual client id. PKCE, RFC 8707. **No CIMD.** | Refresh with rotation. Hard-coded `~/.dsh/dsh-plugin-mcp-manager.json` (0600, directory 0700), which ignores `DSH_HOME`. | Own client at 2025-03-26, so legacy. |
| Others found, not deep-read | `@smai-kit/dsh-smkit` (MIT, 1.20.1, DCR and PKCE, 2025-03-26), `@hualiong/dsh-oauth-mcp-client` and the `@hualiong/dsh-plugin-suite` wrapper (MIT, SDK 1.29), `@vontean/dsh-oauth-mcp-client` (MIT, SDK 1.32), `dsh-mcp-oauth-client` (MIT, SDK 1.15), `@opfield/dsh-mcp-hub`, `dsh-mcp-skill-hub`, `@anht3889/dsh-mcp-mgmt-bundle` and `-oauth`, `@guilduo/dsh-oauth-poc`, `dsh-cloudflare-mcp`, `dsh-vercel-mcp`, `@xrxs-ai/dsh-xrxs-mcp`, `dsh-plugin-scys-mcp` | All are replacement clients or vendor-specific. None showed CIMD or 2026-07-28 support in grep. |

## 3. External stdio and HTTP bridges

### 3a. `mcp-remote`: stdio to remote proxy (main candidate)

- **Links:** https://www.npmjs.com/package/mcp-remote and https://github.com/punkpeye/mcp-remote. The old https://github.com/geelen/mcp-remote now redirects to punkpeye.
- **Licence:** MIT.
- **Latest:** 0.16.6, published 2026-11-11. There are 131 versions. Releases are fast: 0.2.0 on 2026-08-24, then 0.16.x in November.
- **Maintainer:** npm maintainer `punkpeye` (Frank Fiegel, frank@glama.ai). Original author Glen Maddern (geelen).
- **Size:** 2.4 MB unpacked. Dependencies: express, open, undici, strict-url-sanitise. The MCP SDK is bundled.
- **Browser flow (code-verified):**
  - Discovery: RFC 9728 (`oauth-protected-resource`, `resource_metadata` from `WWW-Authenticate`), then RFC 8414 and OIDC.
  - PKCE S256 and the RFC 8707 `resource` parameter, sent on the authorize, token and refresh requests.
  - Also supports `--device-code` (RFC 8628) and `--client-credentials`.
- **Registration:** all three kinds.
  - **CIMD:** `--client-metadata-url https://…` (HTTPS with a non-root path). It is used only when the authorization server advertises `client_id_metadata_document_supported: true`; otherwise it falls back to DCR. The flag pins the callback port so the document's `redirect_uris` stay valid.
  - **DCR:** the default.
  - **Pre-registered:** `--static-oauth-client-info` (JSON or `@file`, with `${ENV}` expansion).
- **Refresh:** proactive refresh before expiry under a cross-process lease (`refresh_in_progress.json`). It also handles another instance having already redeemed the refresh token.
- **Token storage (code-verified):**
  - Location: `${MCP_REMOTE_CONFIG_DIR:-~/.mcp-auth}/mcp-remote-v1/<hash>_tokens.json`, plus `_client_info.json`, `_code_verifier_<state>` and the discovery state.
  - Format: **plaintext JSON**. There is no keychain.
  - File permissions: written with mode 0600 through an atomic temp-and-rename.
  - **Directory permissions: `fs.mkdir(dir, {recursive:true})` sets no mode**, so the directory follows the umask (usually 0755). Directory listings expose server hashes but not token contents. Only the debug-log path creates the directory with 0700.
- **Logging:**
  - stderr always gets the full authorization URL (state and code_challenge, which are not secrets) and the device `user_code`.
  - `--debug` writes `~/.mcp-auth/<hash>_debug.log` (mode 0600). Most token logging is reduced to booleans (`hasAccessToken`, …).
  - **Exception:** when `expires_in` is missing or negative, debug mode dumps `tokenObject: JSON.stringify(tokens)`, including the access and refresh tokens, to stderr *and* the debug log. Never enable `--debug` here.
  - Passing `--header Authorization:…` exposes the secret in `ps`. `--header-file` avoids that.
- **Callback:**
  - An express server binds to 127.0.0.1 by default. The redirect host is `localhost`, path `/oauth/callback`.
  - The port is derived from the server-URL hash, somewhere in 3335–49150, walking up to 8 ports. A fixed port is possible.
  - The callback sets `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
  - `state` is checked against an issued-state pattern, and the verifier is looked up per state.
  - The listener also exposes unauthenticated `/wait-for-auth` and an id endpoint on loopback that reveals the server hash.
  - Auth timeout defaults to 30 s (`--auth-timeout`).
- **Browser opening:** the `open` package, then on Linux the fallbacks `/usr/bin/xdg-open`, `gio`, `x-www-browser` and `sensible-browser`. The URL goes through `strict-url-sanitise`, which is the fix for **CVE-2025-6514**: OS command injection through a crafted `authorization_endpoint`, CVSS 9.6, affecting 0.0.5–0.1.15 ([NVD](https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-2025-6514)).
- **Protocol:**
  - The local, stdio side speaks the 2025 era (`LATEST_PROTOCOL_VERSION = "2025-11-25"`).
  - `--protocol auto` sends `server/discover`. If a 2026-07-28 server answers, mcp-remote answers the local `initialize` itself and rewrites every request into the modern era: per-request `_meta` and the `MCP-Protocol-Version` header. It also bridges `subscriptions/listen` and `input_required`.
  - **The default is `legacy`, which would fail against our server.** So it is a translating proxy, not a passthrough.
  - It is unverified whether a 2026-07-28 client on the stdio side would be accepted. That depends on which era dsh-mcp-client speaks over stdio, which I did not check because I was told not to read the installed DSH.
- **Fit for DSH:** it is not a DSH plugin. It is usable as a dsh-mcp-client `stdio` row, for example `command: npx`, `args: [-y, mcp-remote@0.16.6, <url>, --protocol, auto, --transport, http-only, --client-metadata-url, <cimd>]`, optionally with `env MCP_REMOTE_CONFIG_DIR`. Risks:
  - plaintext tokens and a umask-dependent directory;
  - `npx` supply-chain exposure, given the release velocity (pin a version);
  - a 30 s default auth timeout, with the browser opening from a background DSH process;
  - the token-dump-on-debug edge case.
  - Precedent: `dsh-plugin-adwhispr` in the index uses it.

### 3b. Forks of mcp-remote

| Fork | Licence / version / date | Notes |
|---|---|---|
| `@abluva/mcp-remote` (https://github.com/abluva-research/mcp-remote) | MIT · 2.1.0 · 2026-09-07 | Built on MCP SDK 1.30. Defaults to `auto` with a 2026-07-28 stateless mode. No CIMD hits in grep. Tokens stored with mode 0600. |
| Other forks | — | `mcp-remote-acn`, `mcp-remote-ma`, `mcp-remote-next`, `@automattic/mcp-remote`, `@computec/mcp-remote` and others. All are lower-signal forks and were not examined. |

### 3c. `mcp-oauth-gateway`: loopback HTTP gateway

- **Links:** https://github.com/zmhhaha/mcp-oauth-gateway and https://www.npmjs.com/package/mcp-oauth-gateway.
- **Licence / version / maintainer:** MIT · 0.3.0, published 2026-10-03 · zmhhaha. Zero dependencies.
- **Not in the index.** It ships a DSH bundle patch (`dsh/cordis.patch.yml`) that inserts a `@deepseek-ai/dsh-mcp-client` streamable-http row pointing at `http://127.0.0.1:33419/mcp`, with a static `x-mcp-gateway-token` header. That header is a local gateway token, not the OAuth credential.
- **Flow (code-verified):**
  - RFC 9728 and RFC 8414/OIDC discovery.
  - **DCR if offered, otherwise `--client-id` (pre-registered). No CIMD.**
  - PKCE S256 with `resource`.
  - Device flow is also available.
- **Refresh:** silent refresh before expiry.
- **Storage:** `$XDG_CONFIG_HOME/mcp-oauth-gateway` (or `%APPDATA%`). Directory 0700, file 0600 with chmod. Plaintext JSON; any client secret is stored beside the tokens.
- **Forwarding:**
  - Pipes request and response bodies, so it **does not depend on the protocol era**. It forwards `MCP-Protocol-Version` and the session headers.
  - Strips hop-by-hop headers, `host`, any inbound `authorization` and its own token header.
  - Compares the local token with `timingSafeEqual`.
  - Listens on 127.0.0.1 and ::1.
- **Fit:** an era-agnostic, no-code path through dsh-mcp-client's streamable-http row. Costs:
  - a separately supervised `serve` process;
  - the long-lived local token sits in plaintext in `cordis.patch.yml`;
  - no CIMD;
  - a young, single-maintainer project.

### 3d. Other generic proxies, seen in npm search but not examined

`mcp-oauth-bridge` (stdio, PKCE), `@dreygur/mcp`, `mcp-connector`, `@qelos/better-mcp`, `mcp-auth-adapter`, `mcp-remote-static`, and `@ni-c/mcp-hub` (CIMD-first, but server-side).

## 4. Implications for S7c

1. Nothing off the shelf adds OAuth *inside* dsh-mcp-client with live refresh. The header-injection approach (`dsh-mcp-auth`) is boot-time only, because loader `!!js` is evaluated once.
2. Two existing designs keep the official row and move the credential into a loopback proxy: the `dsh-connector-hub` gateway with a keychain, and `mcp-oauth-gateway`. This is the proven architecture for a plugin, but neither can be reused directly. The first is unlicensed and catalog-only; the second has no CIMD and runs as an external process.
3. The fastest no-code check is `mcp-remote@0.16.6 --protocol auto --client-metadata-url …` in a stdio row. Before relying on it:
   - confirm which era dsh-mcp-client speaks over stdio;
   - test against a throwaway server or config directory;
   - accept or mitigate plaintext `~/.mcp-auth` (set `MCP_REMOTE_CONFIG_DIR` to a pre-created 0700 directory);
   - never pass `--debug`.
