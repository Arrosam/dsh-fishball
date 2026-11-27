# Spike V3-S7c: an OAuth adapter plugin for DSH's MCP client

- **Date:** 2026-11-13
- **Branch:** `spike/v3-s7c`, from `141ac3b` (`spike/v3-s7b`)
- **Inputs:** S7b report [v3-s7b.md](v3-s7b.md) (F1, Q-S7B-1…3). User decisions, verbatim: "给DSH的MCP客户端加个Adapter，用来帮DSH的MCP客户端更新token，以此来满足网页端授权" and "adapter做成单独的插件，或者去找找有没有已经做了这个功能的插件".
- **Specification read:** MCP 2026-07-28 [Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization.md), [Client Registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration.md), [Security Considerations](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations.md); OAuth 2.1 draft; RFC 9207, RFC 9700, RFC 8707.
- **Prototype:** [spikes/v3-s7c/](../../spikes/v3-s7c/README.md) (throwaway). Evidence: `spikes/v3-s7c/evidence-<version>.json`. Survey: [spikes/v3-s7c/survey.md](../../spikes/v3-s7c/survey.md).

## 1. Question

Can a normal DSH plugin, with no host patch, on both 0.2.1-rc.5 and 0.2.2-rc.1, act as an adapter for a stock `dsh-mcp-client` row that:
1. runs browser authorization: discovery, CIMD, the approval page and the loopback redirect;
2. holds the refresh token securely, never in logs;
3. keeps the access token fresh before its 1 h expiry, and recovers on a 401, through a public mechanism?

The user asked for a standalone plugin, generic for any `dsh-mcp-client` row if that was no harder, and for a survey of existing plugins first. After the spike the user narrowed the scope to Fishball connectors only (§6, Q-S7C-1 = C); the prototype itself is generic.

## 2. What I tried

**Host APIs read (both versions, read-only).** Files that are byte-identical across the two versions are marked "=". The rest changed between versions.
- `dsh-mcp-client` (=). `createTransport` passes `config.headers` as `requestInit.headers`, and the SDK copies them into a new `Headers` on every request (`_commonHeaders`). The config schema has no auth option, and Schemastery drops unknown keys such as `authProvider` and `fetch`. On a 401 with no `authProvider`, the transport throws `UnauthorizedError` to the caller and nothing else happens. Reconnect runs only on a lost connection, never on a 401.
- `cordis` (changed). **0.2.1:** `fiber.config` is the resolved config, the same object the row's transport holds. **0.2.2:** `fiber.config` is the raw config, and the resolved one is the private `_effectiveConfig`. `fiber.restart()` and `ctx.plugin()` are public in both.
- `cordis-plugin-loader` (changed). `!!js` config is evaluated `with (ctx)` when the row starts. A row can `inject` a service; it then starts after the service and restarts whenever the service is re-provided.
- `dsh-config-editor` (changed; one internal call differs). `configEditor.edit(entry, change)` validates the config, writes the profile patch `profiles/<p>/cordis.patch.yml` (mode 0600) and reconciles the loader. It refuses rows that come from a home patch or a `--patch` overlay.
- `dsh-settings` (changed). `settings.mutate/update` accepts only volatile fields. `dsh-mcp-client` declares none.
- `dsh-credentials` and `dsh-credentials-local` (=). These provide `readRecord` and `modifyRecord` (read-decide-replace under a cross-process file lock, 30 s wait) with `{kind:'grant', payload}` records, plus the event `credentials/record-updated`. The file is `.credentials.yaml`, mode 0600, and the store refuses to start if group or other bits are set.
- `dsh-authorization` (=). `ctx.authorization.registerFlow({key, label, methods, run})` and `begin()`: one attempt per key, a `notify({message, url})` / `prompt` vocabulary, and a commit through `credentials.modifyRecord`. It is in `dsh-base` on both versions. On both versions its only consumers are `llm-pi-ai`'s logins and the DeepSeek account. I found no generic Web surface that lists other plugins' flows (Q-S7C-3).
- `@modelcontextprotocol/client` 2.2.0 (=, S7b). `auth()`, `refreshAuthorization()`, `validateAuthorizationResponseIssuer()`, a minimal `AuthProvider` `{token, onUnauthorized}`, `Client`, and `StreamableHTTPClientTransport`.

**Prototype** ([adapter-plugin.mjs](../../spikes/v3-s7c/adapter-plugin.mjs)). One plugin, injecting `credentials`, `authorization`, `webServer` and `tools`.
- **Per row, one token manager:**
  - *Browser leg:* a `ctx.authorization` flow. A loopback callback listens on an OS-assigned port, path `/callback`. The SDK's own `auth()` runs with a CIMD `clientMetadataUrl`, then `auth(…, {authorizationCode, iss})`. The adapter checks `state` itself (the SDK does not), and checks `iss` on error responses too.
  - *Grant:* `{upstream, clientInformation, discovery, resource, tokens}`, stored as a `grant` record `mcp-oauth-adapter/<row>`.
  - *Refresh:* single-flight in the process, run inside `modifyRecord`. A caller refreshes only if the stored access token is still the one that failed, or near expiry. A caller that lost the race finds the newer token and declines. A timer fires 300 s (K) before `expires_in`. On `invalid_grant` the adapter drops the tokens and the row returns to "needs authorization".
- **Mechanisms**, all on the same token manager:

| Id | Mechanism | How the bearer reaches the server |
| --- | --- | --- |
| a1 | `config-editor` | `configEditor.edit()` rewrites `headers.Authorization` in the profile patch; the loader restarts the row |
| a2 | `live-object` | The row starts with `headers: !!js mcpOAuthAdapter.headers('a2')`; later tokens are written into the running row's resolved `headers` object |
| a3 | `js-restart` | Same `!!js` row; every new token restarts the row (`fiber.restart()`) |
| c | `proxy` | The row has `url: !!js mcpOAuthAdapter.url('c')` (a loopback proxy in the adapter) and a per-start local bearer; the proxy swaps in the real bearer, and on a 401 refreshes once and retries |
| c2 | `child-row` | As c, but the adapter mounts the stock `dsh-mcp-client` itself with `ctx.plugin(mcpClient, {...})`; the user's config holds no row and no `!!js` |
| d | `own-client` | The adapter runs its own SDK `Client` with a minimal `AuthProvider` and registers the tools with `dsh-mcp-client`'s exported `createMcpToolDefinition` |

- **Mechanism (b)**, a public hook to give `dsh-mcp-client` an `authProvider` or transport wrapper, was checked by reading the code. It has no prototype because no such hook exists.

**World.**
- Two disposable DSHs of the same version, under `$TMPDIR/dsh-s7c-runtime`:
  - the *connector DSH* runs the S7b prototype unchanged, with the adapter's CIMD document added to S7b's stand-in `agent.example` host;
  - the *client DSH* runs the adapter and the stock rows.
- `HOME = DSH_HOME = TMPDIR` is the throwaway home, telemetry is off, and the npm cache is under `$TMPDIR` with empty user and global configs.
- Every DSH run exited with code 0, and no spike process was left.
- Nothing touched a real DSH home, `~/.npmrc` or real credentials. Installed DSH packages were only read.
- S7b's `launch.mjs` and `world.mjs` gained optional parameters (base rows, ready file, home reuse, profile patch, `!!js` rendering, extra CIMD documents). S7b's own defaults are unchanged.

**Probe** ([probe.mjs](../../spikes/v3-s7c/probe.mjs)). There are 19 checks per version, and the scripted browser is S7b's. **19/19 pass on 0.2.1-rc.5, 19/19 on 0.2.2-rc.1.** Some checks record a behaviour rather than assert it; their observed values are in the tables below. The leak check (L1) planted 74 secrets per run:
- connector tokens, access tokens, refresh tokens and codes;
- checked against every file of both homes, except `.credentials.yaml` and, for a1 only, the profile patch;
- and against the probe console.

It found 0 hits.

**Survey** ([survey.md](../../spikes/v3-s7c/survey.md)), read-only:
- the public index at awesome-dsh-plugin.com (5,123 entries);
- npm (`npm search` and `npm view`, tarballs packed into `.runtime/` and read, never installed or run);
- GitHub.

## 3. Result: **PASS, with mechanism (c)**

A standalone plugin can do all three on both versions without a host patch. Only the proxy-based mechanisms (c, c2) and the own client (d) also handle the 401 path. The header-based mechanisms (a) work only while the adapter's clock is right.

### 3.1 Per mechanism and per SDK

| Mechanism | 0.2.1-rc.5 | 0.2.2-rc.1 | Restart of the row per token | 401 recovery | Where the access token sits |
| --- | --- | --- | --- | --- | --- |
| (a1) ConfigEditor rewrites `headers` | **PASS** (proactive only) | **PASS** (proactive only) | yes, every refresh (R1: 1) | **none**: the row never tells the adapter (R2: 0 signals) | **profile patch on disk** (0600), plus the record |
| (a1′) `settings.mutate` | **FAIL** | **FAIL** | — | — | — (S3: "has no volatile fields") |
| (a2) live write into the running config | **PASS**, but private | **FAIL** | no (R1: 0) | none | memory |
| (a3) `!!js` header + `fiber.restart()` | **PASS** (proactive only) | **PASS** (proactive only) | yes, every refresh | none | memory |
| (b) `authProvider` / transport hook | **FAIL** (none exists) | **FAIL** | — | — | — |
| (c) loopback proxy, `!!js` row | **PASS** | **PASS** | no (once, at first authorization) | **yes**: refresh once, retry (R2, R3) | memory in the adapter; the row holds only a per-start local bearer |
| (c2) proxy + child stock row | **PASS** | **PASS** | no | **yes** | memory in the adapter |
| (d) own SDK client | **PASS** | **PASS** | n/a | **yes** (`AuthProvider.onUnauthorized`) | memory in the adapter |

In every mechanism the refresh token lives only in `.credentials.yaml` (a `grant` record, file 0600). The adapter's status surface (`state`) never shows a value (S1).

### 3.2 Detail

**Before authorization (N0).** Every stock row gets a 401 and registers no tools. All rows report `needs-authorization`.

**Browser flow (B-a1 … B-d, B-forms).** The flow is the same for every mechanism, because it belongs to the token manager.
- **Discovery:** RFC 9728, then RFC 8414, on the connector.
- **The authorization request:**
  - `client_id = https://agent.example/dsh-mcp-oauth-adapter.json` (CIMD, because the connector advertises `client_id_metadata_document_supported`), with no registration request;
  - `code_challenge_method = S256`, `state`, `scope = fishball`, `resource = <canonical MCP URI>`;
  - `redirect_uri = http://127.0.0.1:<OS port>/callback`, accepted against the registered `:7777/callback` (S7b's loopback-port rule).
- **The approval:** the user approved with a fresh connector token entry. The page returned a 303 to the adapter's listener, the adapter checked `state` and `iss`, and the code exchange sent `resource` with no client secret.
- **Result:** `whoami` shows a `browser` pair per row, and the tools `mcp__<server>__pair` and `mcp__<server>__whoami` appear under the stock row's names.

**Storage (S1–S3).**
- `.credentials.yaml` is mode 600 and holds one `kind: grant` record per row.
- **a1 writes `Authorization: Bearer <access token>` into `profiles/web/cordis.patch.yml`** (also 0600) on every refresh. It never writes the refresh token there, and no other mechanism writes either token there.
- `settings.mutate('mcp-a1', headers.Authorization)` is refused: "Plugin entry "mcp-a1" has no volatile fields".

**Proactive refresh (R1).** Both clocks were moved into the refresh lead.
- Each row sent exactly one `refresh_token` grant and kept working.
- Row restarts: a1 1, a3 1, and a2, c, c2 and d 0.
- `refresh-reuse` 0.

**401 path (R2).** The connector dropped every access token early, while the adapter's clock still said they were valid.
- **c, c2 and d:** the call that hit the 401 succeeded. The adapter saw one 401 per row and made one refresh.
- **a1, a2 and a3:** both calls failed with `SdkHttpError: Error POSTing to endpoint`, and the adapter saw **0** signals. The stock client throws `UnauthorizedError` to the tool call, does not reconnect, and exposes no event.

**Refresh race (R3).** Eight concurrent calls hit an expired token, on each of c, c2 and d.
- All 8 succeeded each time, with **one** refresh per row and `refresh-reuse` 0.
- This is S7b F2 avoided without the grace window (Q-S7B-1 B): the refresh runs single-flight inside `modifyRecord`, compares the failed token against the stored one, and runs under the store's cross-process lock, so the same refresh token is never presented twice, even from two processes.

**Recovery of (a) by timer only (R4).** Only the adapter's clock was moved into the lead.
- On **0.2.1:** a1, a2 and a3 recover, because the timer refreshes and the new header reaches the row.
- On **0.2.2:** **a2 stays broken.** `fiber.config.headers` is now the raw `!!js` node (`publicConfigIsRaw: true`), so the adapter cannot reach the object the transport holds. a1 and a3 recover through their restart.

**Restarts (P1–P3).**
- **P1, client DSH restart:** every row comes back from the stored grant with no browser and no token request. The adapter loads the records before it provides its service, so `!!js` rows start with the current header.
- **P2, connector restart:** this is S7b TQ-5, where tokens are held in memory.
  - The adapter's refresh gets `invalid_grant`, and c, c2 and d report `needs-authorization`.
  - The a-rows still say `authorized`: they cannot learn of the 401, so the adapter does not know until its timer fires.
- **P3, re-authorization:** the old connector token is refused as `already-paired` (Q-S7B-3), and a new token entry works.

### 3.3 Survey of existing plugins

The full table is in [survey.md](../../spikes/v3-s7c/survey.md).

| Candidate | Licence / last update / maintainer | Browser flow and registration | Refresh / storage | Fit and concerns |
| --- | --- | --- | --- | --- |
| [`dsh-connector-hub`](https://github.com/Looori/dsh-connector-hub) (index) | **none** / 0.2.0, 2026-11-06 / Looori | SDK `auth()`, CIMD or a preset client id | refresh; macOS Keychain; stock rows behind a loopback gateway (our design c) | **Only its own 13-service catalog**, no user URL. No licence, so it cannot be reused. Closest design. |
| `dsh-mcp-auth` (npm) | MIT / 0.2.1, 2026-10-28 / z-y-q | SDK 1.29 `auth()`; CIMD, then static, then DCR; PKCE; loopback | plain JSON under the user's real home `~/.dsh/mcp-auth` (0600) | Our a3 without the restart: `!!js` header evaluated once, so **a refreshed token needs a DSH restart**. Ignores `DSH_HOME`. |
| `dsh-oauth-mcp`, `dsh-mcp-master`, `suveng-dsh-plugin-mcp-manager`, `dsh-plugin-mcp-apps`, `@smai-kit/dsh-smkit` (npm, MIT) | Nov 2026, single maintainers | DCR (only `dsh-plugin-mcp-apps` has CIMD); PKCE | refresh; plain JSON or `ctx.credentials` | **Replace** `dsh-mcp-client` with their own clients, all on **legacy** MCP (2025-03-26 to 2025-06-18), so they fail against our modern-only connector. Some hard-code `~/.dsh`. |
| `@plaudai/dsh-mcp-oauth` (npm) | **UNLICENSED** / 0.1.2 | DCR, PKCE | 0600 file | The only DSH plugin that negotiates 2026-07-28. Unusable because of the licence. |
| [`mcp-remote`](https://github.com/punkpeye/mcp-remote) (external, through a stdio row) | MIT / 0.16.6, 2026-11-11 / punkpeye (Glama), orig. geelen | CIMD (`--client-metadata-url`, if the server advertises it), DCR or static; PKCE; RFC 8707 | proactive refresh under a cross-process lease; **plain JSON** in `~/.mcp-auth`, files 0600 but the **folder follows the umask**; **`--debug` can dump the token object** | Not a plugin. It **translates** between protocol eras (`--protocol auto`; the default `legacy` fails against us). Moves fast (131 versions), runs through `npx`, has a 30 s auth timeout, and had CVE-2025-6514 (fixed). Not tested here. |
| [`mcp-oauth-gateway`](https://github.com/zmhhaha/mcp-oauth-gateway) (external) | MIT / 0.3.0, 2026-10-03 / zmhhaha | DCR or a preset client id, **no CIMD**; PKCE | refresh; plain JSON 0700/0600 | A byte-passing proxy (our c, outside DSH). A separate `serve` process; its local token sits in the patch. Not tested. |

**Conclusion:** no existing plugin is reusable. None combines a user-supplied server URL, CIMD, live refresh, a 401 retry, DSH's credential store and MCP 2026-07-28 under a licence we can use. Two independent projects (`dsh-connector-hub`, `mcp-oauth-gateway`) arrived at the same design as (c), which supports the recommendation.

### 3.4 Findings

**F1. The stock row cannot report a 401.** `dsh-mcp-client` turns a 401 into a failed tool call. It does not reconnect (reconnect is only for a dropped connection) and emits no event. A mechanism that only feeds the row a header therefore has no 401 path. It depends on the adapter's clock agreeing with the server's, and it fails every call between an early server-side expiry and the adapter's next timer: up to the refresh lead (300 s, K) before expiry, or the whole remaining lifetime after a connector restart. This rules out (a) for "on a 401".

**F2. (a2) breaks on 0.2.2.** In 0.2.2, Cordis keeps the resolved config in a private field, so the only live-update path is private. Do not use it.

**F3. (a1) puts the access token in the profile patch.** It is the user's own configuration file, rewritten every hour and backed up and edited like any other config. It is 0600, but it is the wrong store for a credential (R-OA-10 keeps bearers out of config). Each write also restarts the row.

**F4. `ctx.authorization` is the public seam for the browser leg.** It runs one attempt per key and commits through `credentials.modifyRecord`. Its notice carries the approval URL for a surface to open. On both versions no generic DSH Web surface lists third-party flows, so the adapter must hand out the URL itself (decided: an agent tool, Q-S7C-3 = B).

**F5. The adapter's single-flight refresh makes Q-S7B-1 moot for its rows.** It never presents a refresh token twice (R3), including across processes, because the decision runs under the record lock. The connector's reuse detection stays strict. Q-S7B-1 still matters for other clients, such as the plain SDK.

**F6. Mechanism (c) restarts the row once.** Before the first authorization the stock row cannot connect and sits in its reconnect backoff, then gives up after `maxAttempts`. The adapter therefore restarts it once when the first token arrives. After that, tokens change without restarts. c2 avoids even that, because the adapter mounts the child row only once a grant exists.

## 4. Recommendation

The design below includes the user's decisions in §6: Fishball connectors only (Q-S7C-1 = C), a user-hosted CIMD document (Q-S7C-2 = C), sign-in through an agent tool (Q-S7C-3 = B), and refresh-token digests persisted on the connector (Q-S7C-4 = A).

**Mechanism (c2): a standalone plugin, `fishball-connector-adapter` (working name).**
- **What it owns:** the OAuth grant for each configured Fishball connector, the loopback proxy, and the stock `dsh-mcp-client` as a child plugin pointed at the proxy. (c) with a user-written `!!js` row is the same code. c2 is preferred because it needs no `!!js` in the user's config.
- **Configuration:**
  - `clientMetadataUrl`: **required, no default** (Q-S7C-2). It must be an https URL with a non-root path; the SDK refuses anything else.
  - `servers`: a list of `{serverName, url}`.
  - Until `clientMetadataUrl` is set, every server is `needs-configuration` and no authorization request is sent.
- **The user's CIMD document must:**
  - be served from a public https host, because the connector refuses private and loopback addresses and redirects, and caps the document at 5 KiB (S7b);
  - have `client_id` equal to its own URL, and a `client_name`;
  - list `redirect_uris: ["http://127.0.0.1:<any port>/callback"]`;
  - say `token_endpoint_auth_method: "none"` and carry no secret.

  The plugin's README documents this, with a template.
- **Fishball connectors only (Q-S7C-1):** before any authorization request, discovery must show that the server is a Fishball connector. The rule is Q-S7C-5 A:
  - the protected-resource `resource` equals the configured URL, with path `/api/fishball/mcp`;
  - `authorization_servers[0]` is the same origin plus `/api/fishball/oauth`;
  - `scopes_supported` includes `fishball`.

  A server that fails is refused with a message, and no request is sent.
- **Registration:** CIMD only. The SDK's `auth()` runs with the configured `clientMetadataUrl`. Fishball connectors advertise CIMD and have no `registration_endpoint`, so there is no dynamic-registration fallback.
- **Sign-in (Q-S7C-3): one agent tool, `fishball_connector_sign_in` (working name), input `{server}`:**
  - `authorized`: nothing to do;
  - `approval-url`: the URL, with the instruction "open it in your browser and enter a token from the connector's settings". A second call while the attempt is pending returns the same URL;
  - `needs-configuration`: the client-id setting is missing, or the server is not a Fishball connector.

  Other properties of the tool:
  - It returns at once. The attempt runs on as a `ctx.authorization` flow until the loopback callback, the timeout (K, at most the connector's 600 s pending lifetime) or cancellation.
  - The URL carries no secret (`client_id`, `redirect_uri`, `state`, the PKCE challenge, `resource`), and it is dead once the attempt ends.
  - The connector token is typed only on the approval page, never in the chat.
  - Once the grant is committed, the adapter mounts the child row and the server's tools appear.
  - The tool is registered like the stock client's own tools (global, not agent-scoped).
- **Storage:** the grant is a `ctx.credentials` record. No token goes into config, logs or the chat.
- **The proxy:**
  - listens on 127.0.0.1 only;
  - authenticates the child row with a per-start local bearer that is never written to disk;
  - drops hop-by-hop headers and the inbound `authorization`;
  - streams responses;
  - handles a 401 by refreshing once and retrying, single-flight under the record lock.
- **Connector restart (Q-S7C-4):**
  - Access tokens are lost, so the adapter's stored access token gets a 401. Refresh-token digests persist, so the proxy's single 401 refresh succeeds and the call goes through.
  - This is why c2's 401 path matters. The P2/P3 behaviour in §3.2 (re-authorization with a new token) was observed against S7b's in-memory prototype and does not apply to the decided connector.
- **Why not d:** (d) also passes, but it duplicates `dsh-mcp-client`: reconnect, tool sync, resources, instructions and images. Its tool bridge reuses only `createMcpToolDefinition`, so it would drift from the stock client over versions. (c2) keeps DSH's own client and replaces nothing.

**Differences from the prototype.** The prototype accepts any URL, has a control route instead of the tool, and does not check that the server is a Fishball connector. Its `clientMetadataUrl` already comes from config with no default.

**Plan for the product plugin.** It needs no host patch and works on both 0.2.1-rc.5 and 0.2.2-rc.1. Each phase ends with tests, a review and a commit, per AGENTS.md.
1. **K1: contract.**
   - the config schema, with `clientMetadataUrl` required;
   - grant record format v1;
   - the states `needs-configuration`, `needs-authorization`, `authorizing`, `authorized` and `failed`;
   - the Fishball-connector check (Q-S7C-5 A);
   - the tool's input and results;
   - the proxy rules;
   - K values: refresh lead, auth timeout, body cap.
2. **K2: token manager.**
   - the `ctx.authorization` flow, CIMD from the setting, PKCE, loopback, and the `state` and `iss` checks;
   - single-flight refresh in `modifyRecord`, and the timer;
   - `invalid_grant` falling back to `needs-authorization`.
3. **K3: proxy and child row.** Mount the child once a grant exists, and dispose of it when the grant is removed.
4. **K4: the sign-in tool**, per the results above.
5. **Tests:** written separately from the requirements.
   - against S7b's connector prototype, and later the real connector with persisted refresh digests;
   - on both DSH versions;
   - multi-process refresh, and a restart of either side;
   - a non-Fishball server is refused, and a missing setting reports `needs-configuration`;
   - the leak check, including the session transcript.

## 5. Decided per spec

| Decision | Source |
| --- | --- |
| The adapter is a public client: `token_endpoint_auth_method: none`, PKCE S256, no client secret anywhere | OAuth 2.1 §2.1, §4.1.1; MCP Authorization § Authorization Code Protection |
| Registration: CIMD only, with the client-id URL from the user's setting, which must be https with a non-root path. There is no dynamic-registration fallback (Fishball connectors have no `registration_endpoint`) and no hard-coded client | MCP Client Registration; CIMD draft §3 |
| The redirect is `http://127.0.0.1:<OS port>/callback`, a loopback IP literal rather than `localhost`, on a fresh port per attempt; the CIMD registers the path, and loopback ports may vary | OAuth 2.1 §8.4.2; RFC 8252 §7.3, §8.3 |
| The client generates `state` and checks it on the callback, because the SDK does not | OAuth 2.1 §4.1.2.1; RFC 9700 §4.7 |
| `iss` is checked on success *and* error responses before believing them | RFC 9207 §2.4; MCP Authorization § Authorization Response Validation |
| `resource` (the canonical MCP URI from the protected-resource metadata) is sent on the authorization, code and refresh requests | RFC 8707; MCP Authorization § Resource Parameter Implementation |
| The scope requested is the PRM's `scopes_supported`; `offline_access` only if the AS lists it | MCP Authorization § Scope Selection Strategy (SDK `determineScope`) |
| Refresh tokens are rotated by the server; the client keeps only the newest, presents each one once (single flight under a lock), and treats `invalid_grant` as "authorize again" | OAuth 2.1 §4.3.1, §6.1; MCP Security § Token Theft |
| The access token is sent only in the `Authorization` header and only to the MCP server it was issued for, never in a URL or to the proxy's caller | OAuth 2.1 §5.1.1, §7.4; MCP Authorization § Token Requirements, Access Token Privilege Restriction |
| On a 401, refresh once and retry once; a second 401 surfaces as "needs authorization" with no loop | MCP Authorization § Error Handling; RFC 6750 §3.1 |
| Tokens are stored only in the host's credential store (0600), never in config files, logs or the chat; the sign-in tool returns only the authorization URL, which carries no secret | MCP Security § Token Storage; OAuth 2.1 §7.1 |
| The loopback proxy binds 127.0.0.1 only and requires a per-start random local bearer, compared in constant time | MCP Security § Local MCP Server Compromise (bind locally, authenticate); RFC 9700 §4.2 |
| The proxy does not forward the client's own `Authorization` upstream (no token passthrough) | MCP Security § Token Passthrough |

## 6. Questions for the user: decided

The user's answers are "CCB" for Q-S7C-1 to Q-S7C-3. Q-S7C-4 was already settled by the V3 auth decisions, and Fishball decided Q-S7C-5 as an implementation detail. My earlier recommendations were B, A, A and A; they are kept below for the record.

### Q-S7C-1. Which servers the adapter serves: **decided C, Fishball connectors only**

- **Background:** a generic adapter would fetch discovery from any URL the user enters and start an OAuth exchange with whatever authorization server it names.
- **Options:**
  - A: any URL;
  - B: any URL, with a one-time confirmation per new origin (my recommendation);
  - C: Fishball connectors only.
- **Effect:**
  - The plugin is Fishball-scoped (working name `fishball-connector-adapter`).
  - Before any authorization request it checks that the server is a Fishball connector (Q-S7C-5).
  - A failed check is reported as `needs-configuration`, and no request is sent.

### Q-S7C-2. The client identity (CIMD): **decided C, each user hosts their own document**

- **Background:** the connector needs a CIMD client id, an https URL for a JSON document. A local plugin has no https origin of its own.
- **Options:**
  - A: one document at a URL we control (my recommendation);
  - B: dynamic registration only, which the connector does not offer;
  - C: per-user, hosted by the user.
- **Effect:**
  - `clientMetadataUrl` is a required setting with **no default**. Without it every server is `needs-configuration`.
  - The document must be on a public https host and meet the content rules in §4. The README ships a template.
  - Registration is CIMD only, with no dynamic-registration fallback (§5).

### Q-S7C-3. How the user starts sign-in: **decided B, an agent tool returns the approval URL in the chat**

- **Background:** `ctx.authorization` runs the flow and hands out the approval URL. Neither DSH version has a page that lists other plugins' sign-ins, and open-in-app opens folders, not URLs.
- **Options:**
  - A: the adapter's own settings card (my recommendation);
  - B: an agent tool that returns the URL in the chat;
  - C: both.
- **Effect:**
  - One tool, `fishball_connector_sign_in` (working name), with the results in §4.
  - The URL goes into session history. It carries no secret and is dead once the attempt ends.
  - The connector token is still typed only on the approval page, so my concern behind A (the token in a transcript) does not arise.
  - The leak check gains the session transcript.

### Q-S7C-4. After a connector restart: **decided A, refresh-token digests are persisted on the connector**

- **Background:** with refresh tokens in memory (S7b TQ-5), a connector restart sent the adapter back to `needs-authorization`, and re-approving needed a new connector token (P2, P3).
- **Effect:**
  - After a restart the adapter's access token gets a 401, the proxy's single refresh succeeds, and the call goes through without the user.
  - This settles S7b Q-S7B-3 option A for the adapter's rows.

### Q-S7C-5. How the adapter recognizes a Fishball connector: **decided A, by the metadata it already serves**

- **Background:** Q-S7C-1 = C needs a rule, applied before any authorization request. The rule should rest on what the decided connector already serves (v3-design §5.5; observed in S7b D1 and T1, on loopback and behind a tunnel).
- **Options:**
  - **A.** Check the discovered metadata:
    - the protected-resource `resource` equals the configured URL, with path `/api/fishball/mcp`;
    - `authorization_servers[0]` is the same origin plus `/api/fishball/oauth`;
    - `scopes_supported` includes `fishball`.

    This needs no connector change.
  - **B.** Check only that the configured URL's path is `/api/fishball/mcp`. This is weaker: any server can use that path.
  - **C.** A Fishball marker advertised by the connector, such as a field in its metadata. This needs a connector change.
- **Decided A** (Fishball, as an implementation detail, following my recommendation). The rule is the three checks in A, made on the discovered metadata before any authorization request, with no connector change.

## 7. Effect on the design

- **v3-design §5.5 / AUTH-UC-10:** "a DSH using another DSH's connector" now has a supported path: `fishball-connector-adapter` (c2), with sign-in through its agent tool and a user-hosted CIMD. S7b Q-S7B-2 option A ("a plain `dsh-mcp-client` row is not supported") can become "supported through the adapter plugin, for Fishball connectors".
- **Q-S7B-3:** decided A (Q-S7C-4); the adapter relies on it for silent recovery after a connector restart.
- **Q-S7B-1:** still needed for third-party clients that race (the plain SDK). It is not needed for the adapter (F5).
- **DESIGN.md:** a new standalone package, scoped to Fishball connectors. I did not change DESIGN.md or the cases in this spike. All questions are decided; the update is listed here for the next design revision.
