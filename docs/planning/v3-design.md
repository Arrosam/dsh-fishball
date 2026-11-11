# Fishball V3: design draft

Status: **draft, 2026-11-11, docs only.** It answers [v3-requirements.md](<v3-requirements.md>)
(R-…). Where it depends on an open question, the recommended answer is assumed and the question
id is named (Q1–Q13). No code, test or spike was run for this draft. DSH facts are from read-only
inspection of the installed SDKs; MCP facts are from the public specification pages listed in §2.
All proposed names (tools, URIs, services, settings keys) are review vocabulary until the schema
freeze (§11).

SDK paths are shortened: `rc.5` = `~/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules`,
`rc.1` = the same under `0.2.2-rc.1`.

## 1. Architecture

```text
 Main DSH (managed sessions)                         Local DSH (often the same process)
 ┌───────────────────────────────┐                   ┌──────────────────────────────────────┐
 │ fishball-connector            │                   │ fishball-instance (launcher row)     │
 │  · MCP server  /api/fishball/mcp◄─── MCP + token ──┤  · child lifecycle, target + token   │
 │  · mailbox, lanes, tokens     │    (Streamable    │  · child locator service  ───────┐   │
 │  · message_fishball/ask_…     │     HTTP)         │                                  │   │
 │  · approval interception      │                   │ dsh-fishball-embed-UI            ▼   │
 │  · connector state service ───┼─(same process,    │  · sidebar fish/dots, marks, frame   │
 │    (Q3, no UI)                │   Q3 = A)────────►│  · status/Retry, provider-sync button│
 └───────────────────────────────┘                   └──────────────┬───────────────────────┘
                                                                    │ authenticated lifecycle wire
                                                     ┌──────────────▼───────────────────────┐
                                                     │ Child DSH (private home/profile)     │
                                                     │  · Fishball manager session          │
                                                     │  · MCP client link (X12 façade)      │
                                                     │  · event router → Watchdog / Fishball│
                                                     │  · bundled: board, fold-notify,      │
                                                     │    watchdog (own lane subscription)  │
                                                     │  · A-lite page, recommended tab (Q2) │
                                                     └──────────────────────────────────────┘
```

### 1.1 Package boundaries

| Package | Runs in | Owns | Never does |
| --- | --- | --- | --- |
| `fishball-connector` | main DSH (host only) | MCP server; token registry over `ctx.credentials`; per-principal mailbox and lanes; session operations (today's `src/*.js` domain); `message_fishball` / `ask_fishball`; managed-session approval interception; a no-UI connector state service (Q3) | browser client, slots, HTML, CSS, iframes, locale for UI (R-ARCH-02) |
| `fishball-instance` | local DSH (launcher row) + child | child process lifecycle; target URL and token reference; lifecycle wire; child locator service with admission tickets; provider-sync engine; inside the child: manager, MCP client link, event router and acceptance ledger, extension service `fishballInstance` (X1–X19), bundled plugin placement, child web modules (Q2 = A) | main-DSH UI; reading main sessions except over MCP |
| `dsh-fishball-embed-UI` | local DSH (host + web client) | everything visual in the main DSH: sidebar entry and fish, dots and attention latch, managed marks, Hand over / Take back buttons, the frame around the child page, status/Retry, the Plugins card and the provider-sync trigger | secrets; session operations of its own; anything without the instance (R-UI-01) |
| `fishball-board`, `fishball-fold-notify`, `fishball-watchdog` | child only | their features through `fishballInstance` | load in the main DSH (R-BND-01) |

Dependency direction: embed-UI → instance (required, optional inject) and → connector state
service (optional, Q3/Q4). Instance → connector only over MCP. The connector depends on nothing
Fishball. Package manifests: embed-UI declares `fishball-instance` as an optional peer, never
the reverse; the instance drops its `fishball-connector` peer (§9).

### 1.2 Why the split is safe

- The connector is the only component holding authority over main sessions (R-SEC-01). The
  instance's launcher row and embed-UI only touch their own settings, the child and the
  connector's published state.
- The MCP endpoint is the single control plane. Fishball has no privileged path that an external
  agent lacks, except the in-process UI state service of Q3, which carries no session control.
- Embed-UI can be absent without changing Fishball's behaviour: the child runs headless (matrix
  row 5).

## 2. MCP: what the current specification actually provides

Read on 2026-11-11 (public pages, read only):
- [versioning](https://modelcontextprotocol.io/docs/2026-07-28/learn/versioning.md): the current
  revision is **2026-07-28**;
- [changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog.md);
- [Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http.md);
- [subscriptions](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions.md);
- [resources](https://modelcontextprotocol.io/specification/2026-07-28/server/resources.md);
- [authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization.md);
- [versioning and compatibility](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning.md);
- [2025-11-25 resources](https://modelcontextprotocol.io/specification/2025-11-25/server/resources.md).

| Fact (2026-07-28 unless noted) | Design consequence |
| --- | --- |
| Stateless: no `initialize`; every request carries protocol version, client info and capabilities in `_meta`; servers MUST implement `server/discover`. Protocol-level sessions and `Mcp-Session-Id` are removed; servers keep cross-call state in explicit server-minted handles | The principal comes from the bearer token on each request, never from a transport session. Cursors and lane handles are explicit tool arguments |
| Streamable HTTP: one endpoint, POST only; a response is JSON or a request-scoped SSE stream; GET stream removed; **no resumability** (`Last-Event-ID` removed): a broken stream loses its in-flight request | Delivery cannot rely on a stream. Durable mailbox + poll/ack is required (R-CON-03). Notifications are hints (R-CON-04) |
| Server→client change notifications only on a long-lived `subscriptions/listen` stream, filtered by `toolsListChanged`, `promptsListChanged`, `resourcesListChanged`, `resourceSubscriptions` (URIs). Server MUST ack first with `notifications/subscriptions/acknowledged`; every notification carries `io.modelcontextprotocol/subscriptionId` | Events surface as `notifications/resources/updated` for the principal's mailbox / lane URI; the client then calls `inbox_poll`. MCP has no custom event payload channel, so the payload never rides the notification |
| `resources/list` MUST NOT vary per connection but MAY vary by the authorization presented | Mailbox and lane URIs can be per principal |
| Server-to-client requests (sampling, elicitation, roots) are embedded in results via MRTR (`InputRequiredResult`); unsolicited server requests are gone | Not usable for "DSH asks Fishball". Not used (requirements §5) |
| Cancellation on HTTP = closing the response stream | A closed listen stream is not revocation and not loss of authority (S1 rule kept) |
| Security: servers MUST validate `Origin` (403 if present and invalid), SHOULD bind localhost when local, SHOULD authenticate | R-REM-03; loopback default |
| Auth: optional. HTTP servers that support it SHOULD follow the OAuth 2.1 resource-server profile; the token goes in `Authorization: Bearer` on **every** HTTP request and **never** in the query string; invalid token → 401 | Static connector-issued bearer tokens on every request (R-TOK-01/02). The full OAuth discovery flow is out of scope (§5.6) |
| Required request headers `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name` must match the body, else 400 `HeaderMismatch` (-32020) | The server SDK must validate. Freeze-time conformance test |
| 2025-11-25 (legacy era): `initialize` handshake, `Mcp-Session-Id`, GET SSE stream, `resources/subscribe` → `notifications/resources/updated`, resumable streams | Dual-era server (Q12 = A) serves both: same tools/resources, same mailbox semantics; legacy subscription via `resources/subscribe` on the session |

What both DSH SDKs ship (read only, byte-identical client/core dist in both):
- `@modelcontextprotocol/client` and `core` **2.2.0**. `LATEST_PROTOCOL_VERSION = '2025-11-25'`,
  and the client contains the 2026-07-28 path: `Client.listen(filter)`, which needs a negotiated
  2026-era connection, `versionNegotiation` modes, and a `resources/subscribe` legacy path. See
  `rc.5/@modelcontextprotocol/client/dist/index.mjs` around the `listen` method (≈ line 3940).
- `@deepseek-ai/dsh-mcp-client` creates `new Client(..., {capabilities: {}, versionNegotiation:
  {mode: 'auto'}, listChanged: {tools}})`. It wires only tool-list refresh; static `headers` come
  from config (`rc.5/@deepseek-ai/dsh-mcp-client/lib/index.js:46, :596–609, :796`).
  `dsh-mcp-resources` does list/read only. The stock adapter therefore **cannot** turn a
  subscription into a Fishball wake, and its header config would put the token in a settings
  document. The child uses its own client link (§6.2), not the stock plugin.
- No MCP server package is installed at runtime. Server `2.2.0` appears only as a devDependency
  (MCP-S1 §1). The connector must declare its own server dependency (§9).

## 3. The connector's MCP server

### 3.1 Transport and mounting (Q9 = A, Q12 = A)

- **Route:** `webServer.register({kind: 'exact', path: '/api/fishball/mcp', handler})`, the raw
  Node handler. It is present with the same contract in both SDKs
  (`rc.5/@deepseek-ai/dsh-host-webserver/lib/types/index.d.ts` `WebRoute`, `register`). The rc.1
  `WebResourceRoute` is GET/HEAD only and is not used. `connection.fetch` is owner-only and has
  no peer identity, so it is not used either (MCP-S1).
- **Exposure follows DSH's listener.** On load, the connector reads `webServer.host` and
  `webServer.protocol`:
  - loopback host: served;
  - non-loopback host over `https:`: served (remote, R-REM-02);
  - non-loopback host over `http:`: the route answers 503 `insecure-listener` and logs one
    diagnostic. This never falls back silently.
  - A user-run tunnel to a loopback listener counts as loopback.
- **Order of checks per request** (the cheapest refusal first; nothing past a refusal runs):
  1. method is POST (legacy era: GET/DELETE only with a valid legacy session);
  2. `Origin`, when present, is in the allowlist (default: none; non-browser agents send no
     Origin) → 403;
  3. bearer token (§5.5) → 401 with `WWW-Authenticate: Bearer`;
  4. body and in-flight limits → 413/429 (R-SEC-03);
  5. era detection (modern `_meta` or legacy `initialize`), version and header checks → 400
     with `UnsupportedProtocolVersion` (-32022) or `HeaderMismatch` (-32020);
  6. dispatch.
- **Server SDK:** an explicitly packaged `@modelcontextprotocol/server` of the same 2.x line as
  the hosts' client (2.2.0), with its Node HTTP adapter. It must serve both eras. Proving that on
  both hosts is spike **V3-S1** (§11). If the server SDK cannot serve both eras, the fallback is
  Q12 = B, not a hand-written protocol.

### 3.2 Tools

Each tool wraps today's connector domain function (`packages/connector/src/*`) and keeps contract
1.2's semantics, vocabularies and limits (§4, §6, §8 there). Input schemas come from the frozen
`LIMITS`; byte limits are checked in domain code (JSON Schema lengths count characters).

| Tool | Domain source (contract 1.2) | Notes |
| --- | --- | --- |
| `sessions_list` | `session.list` | sessions related to **this principal** |
| `session_start`, `session_message`, `session_redirect`, `session_stop`, `session_release` | §4.1 | `unconfirmed` is never retried. `session_start` makes the caller the managing principal (Q7 = A) |
| `session_read` | `session.read` | bounded; `truncated` |
| `session_watch`, `session_unwatch`, `watches_list` | §4.1 | watch notices land in the mailbox |
| `approvals_list`, `approval_answer` | §4.2 | timer-free descriptor (no `expiresAt`); answer authority is checked against the live `offerId`, the principal and the lane (§3.4) |
| `question_answer`, `question_ask`, `question_answer_own` | §4.2 | plan review included |
| `prompts_list`, `prompt_answer`, `grants_list`, `grant_revoke` | §4.3 | |
| `attachment_put`, `attachment_read` | §4.4 | chunked; `hostRef` single-use, 10 min |
| `inbox_poll`, `inbox_ack` | new (replaces `inbox.push`) | §3.4 |
| `lane_assign`, `lane_release`, `lane_handoff` | new | §3.4, used by Watchdog through the child |
| `attention_signal` | §4.6 (D3) | sets the connector latch |

**Result shape.** Every tool returns a *successful* `CallToolResult` whose `structuredContent` is
`{ok: true, …}` or `{ok: false, code, message}`, with a short text fallback. Reason: stock DSH
throws on `isError: true` before keeping `structuredContent` (`dsh-mcp-client` conversion,
[option §6](<../plugins/connector-mcp-option.md#6-security-discovery-and-limits>)), so a refusal
code would be lost to DSH-hosted agents. JSON-RPC errors are kept for protocol faults only.

### 3.3 Resources and subscriptions

| URI | `resources/read` returns | Subscribed by |
| --- | --- | --- |
| `fishball://mailbox` | this principal's default-lane summary: `{pending, headSequence, mailboxGeneration}`, never event bodies | every principal that wants hints |
| `fishball://lanes/{laneId}` | the same summary for one lane | Watchdog (§7) |
| `fishball://sessions` | this principal's related sessions (as `sessions_list`) | optional |

- **Modern era:** the client opens `subscriptions/listen` with
  `resourceSubscriptions: ['fishball://mailbox']`, and optionally `toolsListChanged`. After the
  required acknowledgement, the server sends `notifications/resources/updated {uri}` after
  **each commit** to that mailbox or lane (R-EVT-04). It sends SSE keep-alive comments while
  quiet.
- **Legacy era:** `resources/subscribe {uri}` on the legacy session, notifications on its GET
  stream.
- A notification is a hint. The client always `inbox_poll`s. A hint lost to a dropped stream is
  recovered by polling on reconnect: on every (re)listen the client polls once before trusting
  hints.
- `resources/list` varies by token only (spec-allowed). `listChanged` is declared for lanes
  appearing or going.

### 3.4 Mailbox, lanes and delivery

This follows the MCP-S2 proposal (`spike/mcp-s2-recovery-cuts` §3, §6), adjusted to V3.

- **Per principal**, the connector keeps a durable ledger in its own storage domain: one
  **default lane** plus any **named lanes** the principal creates.
  - An event has `{eventId, mailboxGeneration, sequence, laneId, kind, sourceSessionId,
    correlationId, offer?: {offerId, revision, decisionKind}, payload, payloadDigest}`.
  - The kinds are `offer` (approval/question), `settlement`, `retirement`, `watch`, `state`,
    `message` (`message_fishball`), `handover` and `notice`.
- **`inbox_poll({laneId?, cursor?, limit})`** returns `{events, nextCursor, hasMore}` or an
  explicit `{resync: {reason, headSequence}}`.
  - Reading a page is not acking it.
  - Cursors are opaque and bound to the principal, the lane and `mailboxGeneration`. A foreign
    cursor gets `forbidden`; a stale one gets `resync`.
- **`inbox_ack({laneId, receipts:[{eventId, payloadDigest}]})`** marks events accepted.
  - Unacked events replay with the same identity.
  - An ack never confers answer authority.
- **Lanes.** `lane_assign({laneId, sessionId})` routes that session's **permission** offers
  into the lane. Questions and plan reviews never enter a non-default lane (U21; refused
  `question-not-laneable`).
  - Only the session's managing principal may assign it, so one principal's lanes cannot capture
    another principal's sessions.
  - `lane_release({laneId, sessionId?})` moves the lane's pending offers back to the default lane.
    Each moved offer is **re-issued with a new `offerId`**, so a late answer from the released
    lane fails `expired`.
  - `lane_handoff({laneId, approvalId})` does the same for one offer (Watchdog → Fishball
    escalation).
- **Answer authority.** `approval_answer` or `question_answer` is accepted only for the current
  `offerId`, by the principal and lane that hold it. The first committed outcome wins (OQ-14).
  No timer ever settles an offer (R-CON-05).
- **Bounds.** `maxQueuedInputs` (default 200) still caps automated kinds per principal with
  `queue-full`; user hand-over notes are always accepted (contract 1.2 §9 rule). The page limit
  and retention are frozen with the schema (§11).

### 3.5 Routing between several principals (Q7 = A)

- A managed session's **managing principal** is the principal that started it with
  `session_start`, or the designated Fishball principal for a user Hand over.
  `session_release` clears it.
- That session's permission requests and questions become `offer` events only for its managing
  principal. Its watch and state events go to the principals that watch it.
- `message_fishball` and `ask_fishball` from a session go to its managing principal. An
  unmanaged session's calls go to the **designated Fishball principal** (setting
  `routing.fishballToken`, default the local token of Q8).
- `ask_fishball` with the target principal not connected keeps contract 1.2 §9: it answers
  `unavailable` at once. "Connected" means the principal has made an authenticated request or
  held a listen stream within the current connector life (decided at schema freeze), **not** a
  timer on the answer.
- A managed session whose principal is revoked or deleted returns to the user (unmanaged), and
  its live offers go to the user in that session (§5.3).

## 4. Embed-UI: locating and showing the child

### 4.1 The child locator service (instance side)

The instance's launcher row provides a Cordis service, proposed name `fishballChild`, in the
local DSH. It is the replacement for the `ui`/`status`/`retry` fields that V2 passed through
contract 1.2.

```js
fishballChild = {
  apiVersion: 1,
  status(),                 // {state: STATUS, code: STATUS_CODES | target code | null}
  onChange(fn) → dispose,   // state, origin or target-status changes
  origin(),                 // the child web's own origin, or null while not ready
  admit({view, lang}),      // Promise<{url}>: one-time admission URL at the child origin
  retry(),                  // Promise<void>: Fishball's restart
  targetStatus(),           // {state: 'connected'|'target-unreachable'|'token-refused'|'unset', code}
  providerSync,             // the existing provider-sync service (main-card trigger)
}
```

- `admit` reuses V2's PG-ORIGIN admission (`src/slim/host/native-web-access.js`): a
  single-use, short-lived ticket bound to the current child generation and audience. It is
  redeemed once by the child's own origin, with no-referrer. The ticket is never logged. The
  returned URL is used once as the frame's first navigation; any later reload asks for a new one.
- The service is host-only, so no browser can call it. Only same-process plugins that inject it
  can.

### 4.2 Embed-UI

- **Host half:** `inject: ['fishballChild?', 'fishballConnectorState?']`.
  - Without `fishballChild` it registers nothing and logs `instance-missing` once (R-UI-01).
  - With it, it registers embed-UI's own authenticated DSH Fetch routes for status, Retry,
    admission and provider-sync, re-serving the locator's results to its own web client.
    `connection.fetch` already authenticates the browser owner. This is the V2 route set moved
    out of the instance.
- **Web half** (`dsh.client`, the same injects as today's connector and instance clients):
  - the sidebar entry and fish;
  - the frame: `src` comes from `admit`; when `lang` changes it asks for a new admission;
  - status/Retry outside the frame;
  - the Plugins card with the provider-sync trigger;
  - with `fishballConnectorState` present (Q3 = A, Q4 = A): managed marks, the green dot and
    the important animation from the latch, Hand over / Take back, and the attention clear on
    page open.
- **Connector state service** (Q3 = A), host-only, no UI:
  `{apiVersion: 1, managed(): [{sessionId, principalLabel}], onChange, attention(): {count,
  important}, clearAttention(), handOver(sessionId, note), takeBack(sessionId, note)}`. The
  connector exposes it whether or not embed-UI exists, so R-ARCH-02 holds.
- Embed-UI carries the D3 behaviour unchanged: the 0/1 latch, cleared once on page open, with no
  timer.
- **Remote target, no local connector** (matrix row 7): `fishballConnectorState` is absent, so
  embed-UI shows only the page and status. The frame still points at the **local** child; only
  the child's MCP link is remote.

## 5. Tokens

### 5.1 Model

- A token is a **connector settings list entry** plus a value in DSH's credential store:
  ```yaml
  tokens:
    - label: Fishball (local)        # shown in the native form; not a secret
      enabled: true
      ref: FISHBALL_TOKEN_LOCAL       # credential reference (POSIX env-var name), role('credential-ref')
  ```
- The value lives **only** in `ctx.credentials` under `ref`. In the local provider, that means
  `$DSH_HOME/.credentials.yaml`, then the environment and `.env` fallbacks.
- The settings document holds the label, the switch and the reference name, never the value.
  This is DSH's own pattern for keys: `apiKeyEnv: z.string().role('credential-ref')` in
  `dsh-web-search-deepseek` and `dsh-llm-*`, resolved per operation with `credentials.resolve`.
- `role('secret')` fields are **not** used. They are redacted on the wire but stored in the
  settings document, which R-TOK-04 forbids.

### 5.2 Creation (Q5 = A)

- The user adds a list entry in **Plugins → fishball-connector → settings**: DSH's native,
  auto-generated form. There is no custom page.
- On the settings change (`settings/document-updated`), for each enabled entry whose `ref` is not
  configured (`credentials.describe(ref).configured === false`) and is writable, the connector:
  1. generates a value: 32 random bytes from `crypto.randomBytes`, base64url, with prefix
     `fbt_`, so secret scanners and DSH's own secret mask recognise it;
  2. stores it with `credentials.set(ref, value)`;
  3. keeps it in memory only for the comparison digest (§5.5).
- The value is never shown in any DSH UI. The user hands it to an external agent by reading
  their own credential store, or sets a value of their choice there or in the environment before
  enabling the entry. The connector then uses it as is, if it meets the minimum length.
- **Finding:** in both SDKs DSH's generic plugin form has no secret-entry widget. The native
  secret inputs (`SettingsSecretField` plus `remote.credentials.set`) are used only by DSH's own
  Models and web-search pages. The plugin-manager auto form has no secret handling. So a typed-in
  value through the generic form is not available without a custom page, which is why Q5 exists.

### 5.3 Revocation

Disabling or deleting an entry, or unsetting its credential value, revokes the principal at the
next request (R-TOK-05):
- later requests get 401;
- open listen streams and legacy sessions close with the graceful completion result;
- pending answers fail;
- its live **offers** are retired and go to the user in their sessions;
- its **lanes** are dropped;
- its queued `message`/`watch`/`state` events are kept for 30 days, so re-enabling the same
  entry restores them (proposed; frozen with the schema);
- managed sessions become unmanaged, with one `system` note each.

Deleting an entry also asks `credentials.unset(ref)` when the connector generated the value
(recorded in its storage domain), and never otherwise.

### 5.4 The instance's token

- The instance's settings carry `target.url` (blank = the local connector, built from
  `webServer.getOrigin()` + route) and `target.tokenRef` (credential reference, default
  `FISHBALL_TOKEN_LOCAL`).
- On each connect, the **launcher row** resolves the value with `ctx.credentials.resolve`. It
  sends the value to the child over the existing authenticated lifecycle wire (mutual HMAC proof,
  `src/native-runtime/wire.js`) on a new channel, `mcp-credential`, after `auth accepted`. The
  child holds it only in memory.
- Nothing is written to the child home, the overlay, argv or env (R-INS-04).
- A credential change (`credentials/reference-updated`) pushes the new value; the child then
  reconnects.

### 5.5 Handshake and checking

- Every HTTP request needs `Authorization: Bearer <value>` (MCP spec: on every request, never in
  the query string). A query parameter named `access_token` or `token` gets 400 and is refused
  even with a valid header.
- Modern era: the first request is usually `server/discover`. Legacy era: `initialize`. Both
  carry the header. There is no unauthenticated discovery.
- The connector keeps a per-entry SHA-256 digest of the current value, refreshed on
  `credentials/reference-updated`. It compares the request digest with `timingSafeEqual` against
  each enabled entry. A miss costs the same as a hit.
- The principal id is the entry's stable internal id, never `clientInfo` (R-TOK-07).
- Failed attempts are counted per remote address for a bounded backoff on 401. The counter holds
  no token material.

### 5.6 Why not OAuth

The MCP authorization spec is OPTIONAL. It needs an authorization server, protected-resource
metadata and client registration, which are out of proportion for one user's own agents.
Connector-issued static bearer tokens meet the spec's token-usage rules (header on every
request, never in the URL, 401 on invalid). Fishball returns 401 with `WWW-Authenticate: Bearer`
and no `resource_metadata`, so OAuth-capable clients see that no discovery is offered. If OAuth
is wanted later, it is additive.

### 5.7 Where the user manages tokens

All of it is in DSH's native Plugins settings for `fishball-connector`: add, label, enable or
disable, delete, and choose the designated Fishball token (`routing.fishballToken`). Values live
in DSH's credential store. Embed-UI, the instance and the child show only a token's label and its
configured or unconfigured state, never the value.

## 6. Instance and child

### 6.1 Launcher row (local DSH)

- V2 lifecycle unchanged: start after `appReady`, private home and profile, mutual-HMAC wire,
  restart and Retry.
- Removed: `src/host/binding.js` and the `control` wire channel (connector binding). Kept: the
  `admin`, `provider-sync` and `instance-settings` channels.
- Added: the `mcp-credential` channel and the `fishballChild` service.
- The settings form gains `target.url`, `target.tokenRef` and a read-only target status note.
  Status codes gain `TARGET_UNREACHABLE`, `TOKEN_REFUSED` and `TARGET_INCOMPATIBLE`, which are
  locator-only codes (they no longer travel through `STATUS_CODES` in a contract).

### 6.2 Child MCP link

- An instance-owned client row in the child uses the packaged `@modelcontextprotocol/client`
  2.x (§9) with `versionNegotiation: {mode: 'auto'}`. It keeps one logical link:
  - discover or initialize;
  - list tools;
  - open the listen stream (modern) or `resources/subscribe` (legacy) on `fishball://mailbox`;
  - reconnect with bounded backoff;
  - poll once on every (re)connect.
- **No raw `mcp__…` tools reach the model.** Fishball's manager tools stay the X12 bridge façade
  (`bridge(pluginId, operations)`). They call MCP tools under the local scope, the X19 send gate
  and the image gates (option §5). The child does not mount the stock `dsh-mcp-client`.
- `ask_fishball` / `approval` offers needing an answer while the link is down: the answer call
  fails `disconnected`. The offer waits at the connector (R-REM-04).

### 6.3 Event router and wake (R-EVT-03)

```text
listen hint / reconnect ─► inbox_poll(default lane) ─► acceptance ledger (durable, child storage)
   ─► route:  offer of a session claimed by healthy Watchdog?  → (already in Watchdog's lane; never here)
              question / plan review                             → Fishball (U21)
              permission offer, unclaimed                        → Fishball
              message / watch / state / handover / notice        → X9 inbox pipeline (claims → fold batcher → deliver)
   ─► Agent.followup wake (one turn per accepted entry) ─► inbox_ack
```

- Acceptance is durable before the ack, and the ack follows acceptance. A replay with a known
  `eventId` is dropped. This is MCP-S2's reconciliation design. **Open gate:** MCP-S2 showed real
  windows (restored-pending-without-wake, claimed-before-processing) that are not yet closed.
  V3 implementation work waits on that spike's continuation (**V3-S2**, §11). Nothing in this
  design claims exactly-once model execution.
- The custom first-party push channel of decision 1a is dropped (Q11 = A). The wake comes from
  the child's own router, not from the transport.

### 6.4 Remote DSH (R-INS-07, R-REM)

- The target is any URL of a connector endpoint. A non-loopback URL must be `https:`; the child
  refuses `http:` to a non-loopback host before sending the token.
- The token only ever goes to the configured origin. Redirects are not followed with
  credentials.
- Everything is the same tool set, so a remote target needs no extra code path. Images use the
  chunked `attachment_put` / `attachment_read`.
- Latency and loss: hints may drop, and polls recover them. Offers wait; nothing is settled by
  time. A loss of the link never stops remote sessions.
- The embed frame stays local. The remote DSH needs only the connector.

## 7. Watchdog

### 7.1 Its own subscription (R-WD-02, Q10 = A)

1. On the instance's X14 `ready()`, Watchdog creates its lane through the child link,
   `lane = 'watchdog'`.
2. It opens a **second listen stream** for `fishball://lanes/watchdog` (or a legacy
   `resources/subscribe`), under the instance's token, through an in-child service
   `fishballInstance.mcp.subscribe(pluginId, uris, onHint) → dispose` (a new extension point,
   **X20**).
3. It polls and acks its own lane with `inbox_poll` / `inbox_ack({laneId: 'watchdog'})`, through
   X12 with a Watchdog-only operation list. Its acceptance is its own durable record. Its events
   never pass through Fishball's router or a Fishball turn.
4. The X15 claim maps to the connector: `approvals.claim(sessionId)` in the child calls
   `lane_assign(watchdog, sessionId)`. Release (pause end, release, failure) calls
   `lane_release`.
5. One side session per watched session (U8) consumes that session's lane events.

### 7.2 Requests to Fishball inside the child (R-WD-08)

Watchdog never talks to Fishball over MCP. It uses the child's in-session communication:
- `manager.notify` (X10) for "watchdog is down", reports and abnormalities: one waking notice
  turn, durably deduped;
- the X9 inbox for released notices;
- an escalation is `lane_handoff` (the offer moves to Fishball's default lane with a new offer
  id) **plus** one `manager.notify` that carries the Watchdog's reasoning, so Fishball's turn has
  the context.

### 7.3 Behaviour (carried from T0 and the user's rules)

- **Triggers:** passive (permission offer, turn finished) and patrol. Patrol runs no more often
  than `minCheckIntervalSeconds` per session: default 1740, inclusive 60–86400. There is one
  timer per watched session for patrol only. Passive triggers, `check_now` and refine are not
  throttled. No other timers exist (R-WD-05).
- **Decision table:**

  | Request | Watchdog decision |
  | --- | --- |
  | in scope, low risk | allow |
  | beyond the task **and** dangerous | reject, with a justification |
  | other high risk | `escalate` to the user's card (Q13 = A) |
  | uncertain | `lane_handoff` to Fishball |
  | question / plan review | never reaches Watchdog |

- **Failure = off** (R-WD-07):
  - The X14 `fail()` runs synchronously: it releases claims (`lane_release` for all, offers
    re-issued to Fishball), passes sends and fences callbacks.
  - It also sends one `manager.notify` "watchdog is down" per down episode.
  - Loss of Watchdog's subscription stream **with** a failed re-listen counts as a failure. A
    stream close that re-listens is not one.
  - When the child cannot start (R-BND-03), the instance keeps the pending notice in its
    lifecycle state and delivers it on the next successful start.
- **Pause = stop the session first** (R-WD-10). Models follow DSH native session timing; Save
  does no model lookup.
- **If the link to the connector is down:** `lane_release` cannot reach the connector. The lane's
  offers stay there and wait, so no stale Watchdog answer can commit (offer fencing). Fishball
  is told the Watchdog is down. Once reconnected, the instance replays the pending
  `lane_release` before anything else.

## 8. Bundled plugins

### 8.1 Placement (R-BND)

The design is the bundled-placement note (`f71717e`) with options **P3 + 3a**, and the later
decisions over it:
- Sources live under `packages/instance/bundled/{board,fold-notify,watchdog}/` and are listed in
  the instance `files`. They are inert data in the main DSH (they are not in the main resolution
  and not bundles).
- On every child start, inside `initializeProfile` and before `loadProfileDirectory`, the
  instance copies each one to `<child>/vendor/<name>` and `<child>/node_modules/<name>`
  (temp + rename) and records `dependencies[name] = file:./vendor/<name>`.
- `dsh.profile.bundles` gets a name only when the instance's `bundled: [...]` record lacks it,
  so a disable survives. A plugin deleted while off is copied back, and the record still has it,
  so it stays **off** (3a; this answers placement Q2).
- An enabled bundled plugin skipped by `loadProfileDirectory` (incompatible `engines.dsh`,
  unresolvable) fails the start with `PROFILE_INCOMPATIBLE`, naming it (answers placement Q3).
  The old per-start exemption and `BUNDLED_PLUGIN_UNAVAILABLE` exemption are dropped.
- Toggles say restart-required (the child runs without HMR). Remove stays hidden for these names
  in the child Plugins page (Q-K = B), which needs no host patch. A native API remove of a
  disabled one is re-placed off next start.

### 8.2 How each fits V3

| Plugin | Uses | V3 change |
| --- | --- | --- |
| board | X1, X2 (tools `board_*` + `board_search`, dynamic context) | none to its domain. Archive forever, 30-day visibility, export on uninstall (B10) |
| fold-notify | X2, X9 batcher, X8 attention | X8 now calls the MCP `attention_signal` through the child link. The batcher sits after Watchdog claims in X9, unchanged |
| watchdog | X1, X2, X10, X11, X12, X13, X14, X15, X16, X19, **X20** | its own lane subscription (§7). X15 claims map to lanes |

## 9. Packaging and compatibility

### 9.1 Manifests (proposed)

| Package | Change |
| --- | --- |
| `fishball-connector` | Drop `dsh.client`, `client.js`, `client.records.js`, `assets`, UI locale and the `./client`, `./contract`, `./records` exports. Add `./mcp-schema` (tool/event schemas, limits and vocabularies, shared with the instance). Add a runtime `dependencies` entry for the MCP server SDK and its Node adapter; install it inside the connector's folder, never as a DSH peer. Keep `engines.dsh >=0.2.1-rc.5`. |
| `fishball-instance` | Drop the `fishball-connector` peer. Add a runtime dependency on `@modelcontextprotocol/client` 2.x, and copy it into the child snapshot (do not rely on the host's transitive copy). Add `bundled/` to `files`. Drop the main-side `client.js` (moved to embed-UI); keep `child-web/` (Q2 = A). |
| `dsh-fishball-embed-UI` | New. Host row + `dsh.client` (platform web) with the inject list of today's two clients combined. Optional peer `fishball-instance`. Owns the moved locale strings. |

Release numbers stay release bookkeeping. The V3 connector and instance are a coordinated
breaking release: each refuses the other's V2 form (R-MIG-02). A V2 instance finds no
`fishballConnector` service and reports `connector-upgrade-required`. A V3 instance hitting a V2
connector gets 404 on the MCP route and reports `TARGET_INCOMPATIBLE`.

### 9.2 DSH 0.2.1-rc.5 and 0.2.2-rc.1 (read-only check)

| Interface | rc.5 | rc.1 | Use |
| --- | --- | --- | --- |
| `webServer.register` raw `WebRoute`, `host`, `protocol`, `getOrigin()` | present | present (rc.1 adds `WebResourceRoute` GET/HEAD and a `peer` argument to `webserver/index-inject`) | MCP route; listener checks (§3.1) |
| `ctx.credentials`: `resolve`, `describe`, `set`, `unset`, records; event `credentials/reference-updated` | `dsh-credentials/lib/types/index.d.ts` | **identical** type files | tokens (§5) |
| `role('credential-ref')` / `role('secret')` + `redactSecrets` | `dsh-settings`, `dsh-web-search-deepseek` | same | token entries use `credential-ref` |
| Generic plugin form secret widget | none found in `dsh-client-ui-plugin-manager` / `dsh-client-ui-settings` | none found | Q5 |
| `@modelcontextprotocol/client` / `core` | 2.2.0 | 2.2.0, dist byte-identical | the child link (packaged copy of the same line) |
| `dsh-mcp-client` | tools + list-changed only, `capabilities: {}`, static headers | same lines | not used by the child (§6.2) |
| MCP server runtime | not installed | not installed | packaged by the connector |
| Plugin-manager slots `plugins.bundle.config`, `plugins.row.config`, `plugins.tab` | present | present | embed-UI card; child recommended tab |
| `Agent.followup` | `dsh-agent-loop` | present (different line) | child wake |
| Shortcut, origin and A-lite findings | V2 final scope §4.3 | same | unchanged child web |

A version-specific path is allowed only where V2 already needed one (tool executor batching,
MCP-S1 §1). It is hidden behind the instance's existing adapters.

## 10. Migration from V2

Order matters, because embed-UI is new and the connector loses its UI:
1. **Upgrade the connector.** The sidebar fish, marks and frame disappear until embed-UI is
   installed (document it in the release notes and the README; the connector logs one line
   pointing at embed-UI).
2. **Connector first V3 start:**
   - the V2 settings that still apply keep their values (`maxMessageBytes`, read limits,
     `maxQueuedInputs`); dropped ones stay inert (D2);
   - the intake ledger's pending V2 items move into the designated Fishball principal's default
     lane, with the same ids as `eventId`;
   - V2 attached-instance state is discarded (there are no live offers across a restart anyway,
     contract §5.1);
   - Q8 = A creates the "Fishball (local)" token entry and value when the instance's default
     `target.tokenRef` is unconfigured.
3. **Upgrade the instance.**
   - The child profile, home, Fishball session history, Skills and child settings are kept.
   - The child snapshot is rebuilt: contract copy removed, MCP schema and client added, bundled
     plugins placed for the first time and on.
   - V2 managed sessions keep their connector-side managed state, now owned by the local
     principal.
4. **Install embed-UI.** The fish, marks and page return.

There are no compatibility adapters and no dual control period (1c = B). A V2 profile that
already contains a manually installed board, fold-notify or Watchdog: placement replaces the
`node_modules` copy with the bundled one and keeps the on/off state the user had. This is the
only migration case for bundles; a test pins it.

## 11. Spikes and freeze before implementation

| ID | Question | Gate |
| --- | --- | --- |
| V3-S1 | Can a packaged MCP server SDK (2.x) serve **both** 2026-07-28 and 2025-11-25 on a raw `webServer` route, with bearer checking before dispatch, Origin/header validation, listen streams and legacy GET/subscribe, on both hosts? | Both stock-host clients (2.2.0, auto negotiation) and one 2025-era client list, call, subscribe and get hints. A 401 path never reaches the SDK |
| V3-S2 | MCP-S2 continuation: a durable child acceptance ledger plus `Agent.followup` gives one routed entry and one user-visible wake after a lost ack, a child crash and reconnect | the open TODO from MCP-S2 §11.5 closes; no duplicate wake |
| V3-S3 | Lanes: assign, release and handoff with offer re-issue under concurrent user/Watchdog/Fishball answers | OQ-14 race matrix; no stale-lane commit |
| V3-S4 | Embed-UI as a separate package: can the moved connector client still register its sidebar/slot contributions (the same injects) and frame the PG-ORIGIN child origin, without the connector client present? | both hosts; main shortcuts untouched |
| V3-K | Freeze `./mcp-schema`: tool names and schemas, result envelope, event kinds, error map, page limit, retention, "connected" definition (§3.5) | reviewed; independent requirements-only case authoring starts after this |

Process stays: requirements → independent case authoring → implementation without reading tests
→ independent review → local commit, per AGENTS.md.

## 12. Security summary

- **Main DSH:** only the connector acts on main sessions. Embed-UI and the launcher row hold no
  session authority (Q1 = A). No host patch anywhere; only public services and slots.
- **Credentials:**
  - Token values live only in `ctx.credentials`.
  - They go to the child over the authenticated wire, in memory only.
  - They are never in settings, logs, lifecycle files, temp files, argv, env, URLs, tool results,
    resource contents or browser responses.
  - The `Authorization` header is never logged. Error details name only the reference or the
    label.
  - Admission tickets are single use and are never logged.
- **Endpoint:**
  - loopback by default; non-loopback only over TLS;
  - Origin allowlist, bearer token on every request and constant-time comparison;
  - limits below the codec; no query-string tokens; no unauthenticated discovery.
- **Authority:**
  - offers are fenced by `offerId`, principal and lane, and the first commit wins;
  - acks and notifications never grant authority;
  - revocation takes effect at the next request;
  - Watchdog failure releases authority synchronously, with nothing settled by time.
- **Verification hook (R-SEC-02):** the acceptance suite plants recognisable token values and
  greps every log, lifecycle file, child home and temp directory after a full run. Any hit is a
  failure.
