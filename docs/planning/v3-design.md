# Fishball V3: design draft

Status: **draft, 2026-11-11, docs only.** It answers [v3-requirements.md](<v3-requirements.md>)
(R-…). Q1, Q2, Q5, Q7, Q8, Q10 and Q20 are decided (requirements §1.3–§1.7). Where the design
depends on another open question, the
recommended answer is assumed and the question id is named. No code, test or spike was
run for this draft. DSH facts are from read-only inspection of the installed SDKs; MCP facts are
from the public specification pages listed in §2. All proposed names (packages, tools, URIs,
services, settings keys) are review vocabulary until the schema freeze (§11).

SDK paths are shortened: `rc.5` = `~/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules`,
`rc.1` = the same under `0.2.2-rc.1`.

## 1. Architecture

Q1's answer sets the shape: every piece is an ordinary DSH plugin, and Fishball itself is a set of
plugins that turns an ordinary DSH into Fishball. Hosted mode wraps that set with a launcher;
standalone mode is the same set installed by hand.

```text
 Main DSH  (an ordinary, full DSH; any plugins)            Host DSH (often the same process)
 ┌──────────────────────────────────────┐                  ┌───────────────────────────────────────┐
 │ fishball-connector                    │                  │ fishball-instance  (hosted mode only) │
 │  · MCP endpoint /api/fishball/mcp  ◄──┼── MCP + token ─┐ │  · launch / lifecycle / launch config │
 │  · mailbox, lanes, tokens, routing    │                │ │  · places the plugin set in the child │
 │  · message_fishball / ask_fishball    │                │ │  · token hand-off, child locator ──┐  │
 │  · contribution service ◄─────────────┼─ registers ────┼─┤ dsh-fishball-embed-UI             ▼  │
 │  · state service (Q3: marks, hand-over)┼─ in-process ──┼─►  · fish, dots (owns the latch), frame│
 │ other plugins (contributors X) ───────┼─ register      │ │  · contributes attention.* tools     │
 └──────────────────────────────────────┘                │ └──────────────────┬────────────────────┘
                                                          │                    │ private lifecycle wire
               ┌──────────────────────────────────────────┤ ┌──────────────────▼────────────────────┐
               │ Standalone Fishball DSH (any machine)    │ │ Hosted child: an ordinary DSH profile │
               │  an ordinary DSH + the Fishball set ─────┘ │  + the Fishball plugin set ───────────┘
               └──────────────────────────────────────────┘ └───────────────────────────────────────┘
     Fishball plugin set (same packages in both):  fishball-core (incl. its fishball-ui component) ·
                                                    fishball-board · fishball-fold-notify · fishball-watchdog
```

### 1.1 Packages

| Package | Installed in | Owns | Never does |
| --- | --- | --- | --- |
| `fishball-connector` | a main DSH | MCP server; tokens over `ctx.credentials`; per-principal mailbox and lanes; routing (R-ROUTE, Q7 decided); session operations (today's `src/*.js` domain); `message_fishball` / `ask_fishball`; managed-session approval interception; the contribution service `fishballConnectorTools` (§13); a no-UI state service for marks and Hand over (Q3) | browser client, slots, HTML, CSS, iframes; an attention latch |
| `fishball-instance` | a host DSH | hosted mode only (§6): launching the child with its launch configuration, its lifecycle, placing the four plugins, target and token hand-off, the child locator `fishballChild`, hosted model sync, uninstall cleanup | any session, approval, question or prompt service of the host DSH (R-ARCH-05); UI |
| `dsh-fishball-embed-UI` | the host DSH, beside the instance | the sidebar entry and fish, the attention latch and its contributed tools (§13.6), marks and Hand over drawing (Q3), the frame around the child page, status and Retry, the Plugins card and the model-sync trigger | secrets; session operations of its own; anything without the instance (R-UI-01) |
| **Fishball plugin set** (Q2, decided: four plugins) | a Fishball DSH (hosted child or standalone) | §5a | acting on any DSH except its own, other than through the target connector's MCP (R-FB-08) |

### 1.2 The Fishball plugin set (Q2, decided)

Four plugins. `fishball-ui` is not a plugin of its own: it is a component (a directory and a
client module) inside `fishball-core`'s package, installed, enabled and removed with core.

| Plugin | Contents (from V2, re-homed) | Requires |
| --- | --- | --- |
| `fishball-core` | **agent:** the manager session and persona; the MCP link to the target (§6.3); the event router and acceptance ledger; the scoped bridge façade (X12), claims (X15) and send gate (X19); the extension service `fishballInstance` (X1–X20) for feature plugins; manager tools; the private Skills tool; the admin and settings routes it serves to its own web page. **`fishball-ui` component:** the A-lite page client module (Fishball-only page, hidden navigation, shortcut remapping or unbinding, explicit return from Settings/Plugins); the guard rows in core's bundle patch (read-only preset with the Skills exception, disabled session-creating rows); the `fishball-recommended` tab; the slim settings panel | — |
| `fishball-board` | board tools, `board_search`, archive | `fishball-core` |
| `fishball-fold-notify` | notice batching, attention via embed-UI's tool | `fishball-core` |
| `fishball-watchdog` | supervision (§7) | `fishball-core` |

Inside core, the two parts stay separate modules with a narrow interface: the ui component reads
the manager's identity and status from the agent side, and has no session powers of its own. So
they can still be tested apart, which was the reason for the earlier split.

**Why the extension service keeps the name `fishballInstance`:** feature plugins already inject
`fishballInstance?` (instance-extension-points §1). The provider is now `fishball-core`, in both
modes. Renaming it would break the agreed X1–X19 contract for no gain.

### 1.3 Hosted versus standalone

| Concern | Standalone (F installed by hand) | What hosted mode adds (the instance) |
| --- | --- | --- |
| Getting the plugins | the user installs the set's tarballs with DSH's native "add plugin" | the instance ships the set inside its package and places it at every child start (§8) |
| Process | the user starts and stops that DSH | launch after host ready, stop with the host, restart, Retry, crash status (R-HOST-02) |
| Guards | from `fishball-core`'s bundle patch (its `fishball-ui` component); the owner may override individual rows, reported as `guards-overridden` | **nothing extra**: the same guards from the same patch, equally overridable and reported (Q20, decided) |
| Target and token | the user fills in `fishball-core`'s settings and puts the token in that DSH's credential store (manual; Q8 decided) | the instance supplies the target; with a same-DSH connector it creates and hands over the token automatically, in memory (R-HOST-05, Q8 decided) |
| UI | that DSH's own web UI **is** the Fishball page | embed-UI frames the child in the host DSH, plus the fish, dots and hand-over |
| Model and provider settings | that DSH's own native settings | plus hosted model sync from the host (R-HOST-07) |
| Uninstall | DSH's native remove of each plugin | the instance's cleanup removes the child runtime after the board export offer |

### 1.4 Why the split is safe

- In a main DSH, only the connector holds **Fishball** authority over sessions (R-SEC-01). The
  instance's host row injects no session service. Embed-UI only draws, owns its latch, and uses
  the connector's state service for marks and hand-over.
- Every Fishball DSH (hosted or standalone) reaches sessions only through a connector's MCP, under
  a token, exactly like an external agent. There is no privileged path for the hosted child.
- Tool contributions (§13) extend the endpoint without adding a second one. They run behind the
  same token and limits, and gain no Fishball authority.
- The main DSH stays a full DSH. No Fishball package changes which other plugins can run there.

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
  document. `fishball-core` uses its own client link (§6.3), not the stock plugin.
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
| `session_start`, `session_message`, `session_redirect`, `session_stop`, `session_release` | §4.1 | `unconfirmed` is never retried. `session_start` makes the caller the managing principal (R-ROUTE-01) |
| `session_read` | `session.read` | bounded; `truncated` |
| `session_watch`, `session_unwatch`, `watches_list` | §4.1 | watch notices land in the mailbox |
| `approvals_list`, `approval_answer` | §4.2 | timer-free descriptor (no `expiresAt`); answer authority is checked against the live `offerId`, the principal and the lane (§3.4) |
| `question_answer`, `question_ask`, `question_answer_own` | §4.2 | plan review included |
| `prompts_list`, `prompt_answer`, `grants_list`, `grant_revoke` | §4.3 | |
| `attachment_put`, `attachment_read` | §4.4 | chunked; `hostRef` single-use, 10 min |
| `inbox_poll`, `inbox_ack` | new (replaces `inbox.push`) | §3.4 |
| `lane_assign`, `lane_release`, `lane_handoff` | new | §3.4, used by Watchdog through `fishball-core` |
| ~~`attention_signal`~~ | §4.6 (D3) | **moved**: now `embed-ui.attention.signal`, contributed by embed-UI (§13.6) |

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
- `tools.listChanged: true` is declared. A listen stream with `toolsListChanged: true` (modern)
  or a legacy session gets `notifications/tools/list_changed` when contributions come or go
  (§13.4).

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

### 3.5 Routing between several principals (R-ROUTE; Q7 decided)

- A managed session's **managing principal** is the principal that started it with
  `session_start`, or the designated Fishball principal for a user Hand over.
  `session_release` clears it.
- That session's permission requests and questions become `offer` events only for its managing
  principal. Its watch and state events go to the principals that watch it.
- `message_fishball` and `ask_fishball` from a session go to its managing principal. An
  unmanaged session's calls go to the **designated Fishball principal** (setting
  `routing.fishballToken`, default the hosted Fishball's token entry, if any; R-ROUTE-04).
- `ask_fishball` with the target principal not connected keeps contract 1.2 §9: it answers
  `unavailable` at once. "Connected" means the principal has made an authenticated request or
  held a listen stream within the current connector life (decided at schema freeze), **not** a
  timer on the answer.
- A managed session whose principal is revoked or deleted returns to the user (unmanaged), and
  its live offers go to the user in that session (§5.3).

## 4. Embed-UI: locating and showing the hosted child

Embed-UI works only beside a hosted instance (R-UI-01). It never frames a standalone Fishball
(R-UI-07): a standalone DSH's own web UI is already the Fishball page.

### 4.1 The child locator service (instance side)

The instance's host row provides a Cordis service, proposed name `fishballChild`. It replaces the
`ui`/`status`/`retry` fields that V2 passed through contract 1.2.

```js
fishballChild = {
  apiVersion: 1,
  status(),                 // {state: STATUS, code: STATUS_CODES | target code | null}
  onChange(fn) → dispose,   // state, origin or target-status changes
  origin(),                 // the child web's own origin, or null while not ready
  admit({view, lang}),      // Promise<{url}>: one-time admission URL at the child origin
  retry(),                  // Promise<void>: restart the child
  targetStatus(),           // {state: 'connected'|'target-unreachable'|'token-refused'|'target-unset', code}
  providerSync,             // hosted model sync (R-HOST-07), triggered from embed-UI's card
}
```

- `admit` reuses V2's PG-ORIGIN admission (`src/slim/host/native-web-access.js`): a
  single-use, short-lived ticket bound to the current child generation and audience. It is
  redeemed once by the child's own origin, with no-referrer. The ticket is never logged. The
  returned URL is used once as the frame's first navigation; any later reload asks for a new
  ticket. The child side of the redemption is `fishball-core`'s admission route, which accepts
  tickets only when the instance's launch overlay has given it the admission key (hosted mode).
- The service is host-only, so no browser can call it. Only same-process plugins that inject it
  can.

### 4.2 Embed-UI

- **Host half:** `inject: ['fishballChild?', 'fishballConnectorState?', 'fishballConnectorTools?']`.
  - Without `fishballChild` it registers nothing and logs `instance-missing` once (R-UI-01, Q18 = A).
  - With it, it registers its own authenticated DSH Fetch routes for status, Retry, admission and
    model sync, re-serving the locator's results to its own web client. `connection.fetch`
    already authenticates the browser owner. This is V2's route set, moved out of the instance.
- **Web half** (`dsh.client`, the same injects as today's connector and instance clients):
  - the sidebar entry and fish;
  - the frame: `src` comes from `admit`; when `lang` changes it asks for a new admission;
  - status and Retry, outside the frame;
  - the Plugins card with the model-sync trigger;
  - with `fishballConnectorState` present (Q3 = A, a connector in the same DSH): managed marks
    and Hand over / Take back;
  - with `fishballConnectorTools` present: its own `attention.*` tools (§13.6). From its own latch
    it draws the green dot and the important animation, and it clears the latch on page open.
- **Connector state service** (Q3 = A), host-only, no UI:
  `{apiVersion: 1, managed(): [{sessionId, principalLabel}], onChange, handOver(sessionId, note),
  takeBack(sessionId, note)}`. It has **no attention members**: the latch belongs to embed-UI.
  The connector exposes this service whether or not embed-UI exists, so R-ARCH-03 holds.
- The D3 behaviour is unchanged, with embed-UI as the latch's new owner: a 0/1 latch with
  importance, cleared once on page open, no timer (§13.6).
- **Remote target, no connector in this DSH** (matrix row 7, Q4 = A): neither connector service
  is present, so embed-UI shows only the page, status and Retry. The frame still points at the
  **local** child; only the child's MCP link is remote.

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

### 5.2 Creation (R-TOK-08; Q5 decided)

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
  value through the generic form is not available without a custom page. That is why Q5 was
  asked; the user chose this design (A).

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

### 5.4 The Fishball DSH's token (R-HOST-05; Q8 decided)

**Hosted, connector in the same DSH (automatic).**
- The connector provides a host-only service `fishballConnectorTokens`
  (`{apiVersion: 1, ensureHosted(instanceId) → Promise<{ref, label}>}`). It creates, once, a
  "Fishball (hosted)" token entry whose value goes into the shared credential store, and returns
  only the reference name. It never returns the value.
- The instance injects it optionally. It resolves the value itself with `ctx.credentials.resolve`
  on each child connect, and sends it to the child over the authenticated lifecycle wire (mutual
  HMAC proof, `src/native-runtime/wire.js`) on a new channel, `mcp-credential`, after
  `auth accepted`. `fishball-core` in the child holds it only in memory.
- Nothing is written to the child home, the overlay, argv or env (R-HOST-05).
- A credential change (`credentials/reference-updated`) pushes the new value, and the child
  reconnects. Revoking the entry in the connector's settings stops the hosted Fishball's access,
  like any other token.

**Hosted with a remote target.** The instance's `target.tokenRef` names a reference in the host
DSH's credential store. The user puts there the value of a token created in the remote
connector's settings (§5.2). The hand-off to the child is the same as above.

**Standalone.** `fishball-core`'s own settings name `target.url` and `target.tokenRef`. The value
lives in the standalone DSH's credential store, and `fishball-core` resolves it per connection.
Nothing goes over a lifecycle wire, because there is none.

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
in DSH's credential store. Embed-UI, the instance and every Fishball DSH show only a token's label and
its configured or unconfigured state, never the value.

## 5a. The Fishball plugin set in any DSH

### 5a.1 Composition

Each member is a bundle (`dsh.bundle.patch` inserting one row), installed in the Fishball DSH's
profile. Their `engines.dsh` is `>=0.2.1-rc.5`. They take their peer DSH packages from the
Fishball DSH's own installation, like any plugin, and declare no peer on `fishball-instance` or
`fishball-connector`.

- `fishball-core` provides `fishballInstance` (X1–X20) from its app row once its own setup is
  ready. Feature plugins keep their optional `fishballInstance?` inject, so a missing core never
  fails their load (R-FB-06).
- `fishball-core` registers its `fishball-ui` component's client module through its own
  `dsh.client` entry and its guard rows through its own `cordis.patch.yml`. There is no separate
  `fishballLite` service and no `lite-missing` state (Q2, decided).
- `fishball-core` ships its own copy of the MCP client (§9.1). It does not use the host's
  transitive `@modelcontextprotocol/client` or the stock `dsh-mcp-client` row (§6.3).

### 5a.2 How `fishball-core`'s `fishball-ui` component reshapes a DSH

V2 applied these changes as instance launch overlays (`packages/instance/src/native-runtime/overlay.js`
`LITE`). In V3 they move into `fishball-core`'s own `cordis.patch.yml` (the `fishball-ui`
component's part of it), so they work without an instance:
- `disabled: true` on the session-creating rows (`ui-subagent`, `ui-schedule`, `schedule`,
  `ui-permission`, `ui-agent-preset`, `entry-customization`, `ui-open-in-app`, `open-in-app`,
  `ui-sidebar-terminal`, `terminal-controller`) and the session-creating preset tools;
- the read-only permission preset (sandbox read-only, approval policy) with the private Skills
  root exception;
- its client module: the A-lite page, shortcut remapping, the recommended tab and the slim
  settings panel.

A bundle patch may target any row id (`PatchOptions {id, disabled, config, …}`,
`cordis-plugin-include`, both SDKs). **Order matters:** DSH composes bundle patches first, then
the profile's own patch file, then `$DSH_HOME/cordis.patch.yml`, then launch overlays
(`readProfilePatches`: `dsh-app-boot/lib/index.js` rc.5 :1127–1132, rc.1 :1908–1913). So in a
Fishball DSH, hosted or standalone, the owner's own patches win over core's: that is the accepted
"can override" of Q20. The instance's launch overlays carry no guard rows (§6.2), so the hosted
child behaves exactly like a standalone DSH here.

**Override report (Q20, A).** At app ready, and on every `settings/document-updated`, core reads
the effective composition and policy of its own DSH: the guard rows' `disabled` state and the
active permission preset. It compares them with its own patch's intended values. A difference
sets status `guards-overridden` with the list of overridden guards. It also adds one line to
the Fishball page's status strip and one notice to Fishball's manager context, so Fishball
knows its guarantees are weaker. Core keeps running and changes nothing back.

**Engineering check (spike V3-S6):** whether a bundle patch that disables *another* bundle's rows
is accepted by both SDKs' compatibility preflight and plugin manager without being reported as a
conflict, and which public API exposes the effective composition and policy so core can detect
an override (without reading DSH's files directly).

### 5a.3 Standalone setup, step by step

1. Install the four tarballs (core is required; the three features are optional) in the DSH with DSH's native "add plugin", then restart that DSH.
2. In the **target** DSH's connector settings, add a token entry (§5.2).
3. Put that token's value in the standalone DSH's credential store, under the reference named in
   `fishball-core`'s settings, and enter the target URL there.
4. Open the standalone DSH's web UI. It is the Fishball page.

`fishball-core` reports `target-unset`, `target-unreachable` or `token-refused` until steps 2–3
are done.

## 6. Hosted mode: the instance, and the MCP link

### 6.1 The instance (host row)

- Kept from V2: start after `appReady`, private home and profile, the mutual-HMAC lifecycle wire,
  restart and Retry, the uninstall cleanup command.
- Removed: `src/host/binding.js` and the `control` wire channel (the connector binding); the
  instance-owned child rows (app, session tools, approvals, inbox, admin, provider-sync target,
  native web, `fishball-page`), which move into the plugin set (requirements §6).
- Kept on the wire: `admin` and `instance-settings` (now served by `fishball-core` in the child),
  and `provider-sync` (hosted model sync).
- Added:
  - the `mcp-credential` wire channel (§5.4);
  - the `fishballChild` locator (§4.1);
  - placement of the whole plugin set (§8);
  - the launch configuration (§6.2).
- Host row `inject`: lifecycle, webserver (for the origin), credentials (for the token), settings,
  storage, and the optional `fishballConnectorTokens?` (§5.4). **No** session, approval,
  question or prompt service (R-ARCH-05).
- The settings form holds `target.url` (blank means a connector in this DSH), `target.tokenRef`,
  and a read-only target status note. Status codes gain `TARGET_UNREACHABLE`, `TOKEN_REFUSED` and
  `TARGET_INCOMPATIBLE`. These are locator codes; they no longer travel in a contract.

### 6.2 Launch configuration (no guards; Q20, decided)

At each child start the instance writes, as launch overlays, only what a hosted child needs to
run under its host:
- `hmr` disabled (the child is restarted, not hot-reloaded);
- the webserver and web-runtime settings that give the child its own origin and port (V2
  PG-ORIGIN);
- the admission key for `fishball-core`'s ticket route (embed-UI's frame), and the target URL.

It writes **no** guard rows and forces no plugin on. The guards come only from `fishball-core`'s
own patch, exactly as in a standalone DSH, so the child's owner can override them and core
reports `guards-overridden` (§5a.2). The child's native Plugins page is unmodified. V2's
Q-K = B Remove-hiding is not revived. A removed plugin is re-placed at the next start, off if it
was off (§8.1). If the owner disables `fishball-core`, the child still starts and the locator
reports `fishball-off` (R-FB-10).

### 6.3 The MCP link (`fishball-core`, both modes)

- A client row in `fishball-core` uses its packaged `@modelcontextprotocol/client` 2.x (§9.1)
  with `versionNegotiation: {mode: 'auto'}`. It keeps one logical link:
  - discover or initialize;
  - list tools;
  - open the listen stream (modern) or `resources/subscribe` (legacy) on `fishball://mailbox`;
  - reconnect with bounded backoff;
  - poll once on every (re)connect.
- **The token:**
  - hosted mode: it arrives over the lifecycle wire, in memory (§5.4);
  - standalone mode: `fishball-core` resolves it from its own DSH's credential store per
    connection, as DSH's own providers do (`ctx.credentials.resolve`).
  - Either way it is sent only to the target's origin, and only over `https:` for a non-loopback
    target. Credentials are never forwarded on a redirect.
- **No raw `mcp__…` tools reach the model.** Fishball's manager tools stay the X12 bridge façade
  (`bridge(pluginId, operations)`), under the local scope, the X19 send gate and the image gates.
  Contributed tools are re-exposed through the same façade, filtered by the Q17 allowlist. The
  stock `dsh-mcp-client` is not mounted for the target.
- An answer attempted while the link is down fails `disconnected`. The offer waits at the
  connector (R-REM-04).

### 6.4 Event router and wake (R-EVT-03)

```text
listen hint / reconnect ─► inbox_poll(default lane) ─► acceptance ledger (durable, Fishball DSH storage)
   ─► route:  offer of a session claimed by healthy Watchdog?  → (already in Watchdog's lane; never here)
              question / plan review                             → Fishball (U21)
              permission offer, unclaimed                        → Fishball
              message / watch / state / handover / notice        → X9 inbox pipeline (claims → fold batcher → deliver)
   ─► Agent.followup wake (one turn per accepted entry) ─► inbox_ack
```

- Acceptance is durable before the ack, and the ack follows acceptance. A replay with a known
  `eventId` is dropped. This is MCP-S2's reconciliation design. **Open gate:** MCP-S2 showed real
  windows (restored-pending-without-wake, claimed-before-processing) that are not yet closed.
  Implementation waits on that spike's continuation (**V3-S2**, §11). Nothing in this design
  claims exactly-once model execution.
- The custom first-party push of decision 1a is dropped (Q11 = A). A standalone Fishball on
  another machine could not use it anyway.

### 6.5 Remote targets (R-FB-05, R-REM)

- The target is any connector endpoint URL. The same tool set applies, so a remote target needs
  no extra code path. Images use the chunked `attachment_put` / `attachment_read`.
- Hints may drop, and polls recover them. Offers wait; nothing is settled by time. Losing the link
  never stops remote sessions.
- In hosted mode the embed frame stays local; only the child's MCP link is remote.

## 7. Watchdog

### 7.0 What Watchdog is (R-WD-00; Q10 decided)

Watchdog is Fishball's helper, like a subagent of Fishball. At the connector it is **part of
Fishball's principal**: the same token, the same mailbox, and its own lane and subscription
inside it. It holds no authority of its own. The lane only lets Watchdog take the permission
offers that Fishball has handed it (by the X15 claim), without a Fishball turn. Answers it
commits are Fishball's answers: settled by `fishball` in the record, and fenced by the lane's
offer ids.

### 7.1 Its own subscription (R-WD-02)

1. On `fishball-core`'s X14 `ready()`, Watchdog creates its lane through `fishball-core`'s MCP link,
   `lane = 'watchdog'`.
2. It opens a **second listen stream** for `fishball://lanes/watchdog` (or a legacy
   `resources/subscribe`), under the Fishball DSH's token (R-WD-02), through a `fishball-core` service
   `fishballInstance.mcp.subscribe(pluginId, uris, onHint) → dispose` (a new extension point,
   **X20**).
3. It polls and acks its own lane with `inbox_poll` / `inbox_ack({laneId: 'watchdog'})`, through
   X12 with a Watchdog-only operation list. Its acceptance is its own durable record. Its events
   never pass through Fishball's router or a Fishball turn.
4. The X15 claim maps to the connector: `approvals.claim(sessionId)` in `fishball-core` calls
   `lane_assign(watchdog, sessionId)`. Release (pause end, release, failure) calls
   `lane_release`.
5. One side session per watched session (U8) consumes that session's lane events.

### 7.2 Requests to Fishball inside the child (R-WD-08)

Watchdog never talks to Fishball over MCP. It uses the Fishball DSH's in-session communication:
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
  - When a hosted child cannot start (R-BND-03), the instance keeps the pending notice in its
    lifecycle state and delivers it on the next successful start (R-HOST-08). In a standalone
    DSH, `fishball-core` checks at app ready whether an enabled `fishball-watchdog` has
    registered, and sends the notice if not (R-FB-07).
- **Pause = stop the session first** (R-WD-10). Models follow DSH native session timing; Save
  does no model lookup.
- **If the link to the connector is down:** `lane_release` cannot reach the connector. The lane's
  offers stay there and wait, so no stale Watchdog answer can commit (offer fencing). Fishball
  is told the Watchdog is down. Once reconnected, `fishball-core` replays the pending
  `lane_release` before anything else.

## 8. Placement of the plugin set

### 8.1 Hosted mode (R-BND)

The design is the bundled-placement note (`f71717e`), options **P3 + 3a**, now applied to the
whole set:
- Sources live under `packages/instance/bundled/{core,board,fold-notify,watchdog}/` and are
  listed in the instance's `files`. In the host DSH they are inert data: not in its resolution,
  not bundles there.
- At every child start, inside `initializeProfile` and before `loadProfileDirectory`, each one is
  copied to `<child>/vendor/<name>` and `<child>/node_modules/<name>` (temp + rename), with
  `dependencies[name] = file:./vendor/<name>`.
- Each plugin goes into `dsh.profile.bundles` only when the instance's `bundled: [...]` record
  lacks them, so a disable survives. A feature plugin deleted while off is copied back, and the
  record still has it, so it stays **off** (3a; this answers placement Q2).
- `fishball-core` follows the same first-placement rule as the features: on at first placement;
  a later disable survives; deleted while off is re-placed off (R-BND-02, R-FB-10).
- An enabled member skipped by `loadProfileDirectory` (incompatible `engines.dsh`, unresolvable)
  fails the start with `PROFILE_INCOMPATIBLE`, naming it (answers placement Q3). The old
  per-start exemption and `BUNDLED_PLUGIN_UNAVAILABLE` are dropped.
- A native remove of any of the four plugins is re-placed at the next start: on if it was on, off
  if it was off.

### 8.2 Standalone mode

The user installs the set with DSH's native plugin management. DSH's own rules apply: an
incompatible bundle is skipped at boot, not fatal. So:
- `fishball-core` reports which expected members are missing or skipped in its status
  (`plugin-set-incomplete`, naming them);
- a skipped or failed Watchdog produces one "watchdog is down" notice per start (R-FB-07);
- there is no placement record: the user's native switches are the truth, as in hosted mode.

### 8.3 How each feature fits V3

| Plugin | Uses | V3 change |
| --- | --- | --- |
| board | X1, X2 (tools `board_*` + `board_search`, dynamic context) | none to its domain. Archive forever, 30-day visibility. Export offer: the instance's uninstall in hosted mode; in standalone mode, a `board_export` manager tool and a note in the README, because DSH's native remove offers no hook |
| fold-notify | X2, X9 batcher, X8 attention | X8 now calls embed-UI's contributed `embed-ui.attention.signal` over the MCP link. If it is absent, the call gets `unsupported-operation` (D3 rule). The batcher sits after Watchdog claims in X9, unchanged |
| watchdog | X1, X2, X10, X11, X12, X13, X14, X15, X16, X19, **X20** | its own lane subscription (§7). X15 claims map to lanes |

## 9. Packaging and compatibility

### 9.1 Manifests (proposed)

| Package | Change |
| --- | --- |
| `fishball-connector` | Drop `dsh.client`, `client.js`, `client.records.js`, `assets`, UI locale, and the `./client`, `./contract` and `./records` exports. Add `./mcp-schema` (tool and event schemas, limits, vocabularies) and `./tools` (contribution types, `apiVersion`, the shared result-code vocabulary, a `defineTool` helper that validates at the call site; data and types only). Add a runtime `dependencies` entry for the MCP server SDK and its Node adapter, installed inside the connector's folder, never as a DSH peer. Keep `engines.dsh >=0.2.1-rc.5`. |
| `fishball-instance` | Drop the `fishball-connector` peer, the main-side `client.js`, `child-web/` and the `LITE` guard overlays. Keep the host row, the native runtime (lifecycle, launch configuration, placement), `uninstall.js` and hosted model sync. Add `bundled/` (the four set members) to `files`. |
| `fishball-core` (new, from `packages/instance/src/slim/child/**`, `src/persona.js`, the private Skills tool, `native-child.js`'s app pieces, and, as its `ui/` component, `packages/instance/child-web/**` and the `LITE` overlay rows) | Bundle row(s) for the Fishball DSH; its `cordis.patch.yml` also carries the guard rows; `dsh.client` (platform web) for the `fishball-ui` page, recommended tab and slim settings. Runtime dependency on `@modelcontextprotocol/client` 2.x and on `fishball-connector/mcp-schema`, vendored as a copy so a standalone install needs nothing from the connector package at runtime. |
| `fishball-board`, `fishball-fold-notify`, `fishball-watchdog` | Change the peer from `fishball-instance` to nothing: they find `fishball-core` through the optional `fishballInstance?` inject. |
| `dsh-fishball-embed-UI` (new) | Host row + `dsh.client` (platform web) with the inject lists of today's two main-DSH clients combined. Optional peers `fishball-instance` and `fishball-connector` (the latter for `./tools` types only; embed-UI never imports connector code). Owns the moved locale strings. |

Release numbers stay release bookkeeping. The V3 connector, instance and plugin set are one
coordinated breaking release:
- a V2 instance finds no `fishballConnector` service and reports `connector-upgrade-required`;
- a V3 `fishball-core` hitting a V2 connector gets 404 on the MCP route and reports
  `TARGET_INCOMPATIBLE`.

### 9.2 DSH 0.2.1-rc.5 and 0.2.2-rc.1 (read-only check)

| Interface | rc.5 | rc.1 | Use |
| --- | --- | --- | --- |
| `webServer.register` raw `WebRoute`, `host`, `protocol`, `getOrigin()` | present | present (rc.1 adds `WebResourceRoute` GET/HEAD and a `peer` argument to `webserver/index-inject`) | MCP route; listener checks (§3.1) |
| `ctx.credentials`: `resolve`, `describe`, `set`, `unset`, records; event `credentials/reference-updated` | `dsh-credentials/lib/types/index.d.ts` | **identical** type files | tokens (§5), standalone token resolution (§6.3) |
| `role('credential-ref')` / `role('secret')` + `redactSecrets` | `dsh-settings`, `dsh-web-search-deepseek` | same | token entries use `credential-ref` |
| Generic plugin form secret widget | none found in `dsh-client-ui-plugin-manager` / `dsh-client-ui-settings` | none found | §5.2 (Q5 decided) |
| `@modelcontextprotocol/client` / `core` | 2.2.0 | 2.2.0, dist byte-identical | `fishball-core`'s link (packaged copy of the same line) |
| `dsh-mcp-client` | tools + list-changed only, `capabilities: {}`, static headers | same lines | not used for the target (§6.3) |
| MCP server runtime | not installed | not installed | packaged by the connector |
| Bundle patch rows `{id, disabled, config, insert}` (`cordis-plugin-include` `PatchOptions`) | present | present (`patch.d.ts`) | `fishball-core` guard rows (§5a.2) |
| Patch composition order: bundles → profile patch file → home patch → launch overlays | `dsh-app-boot` `readProfilePatches` :1127–1132 | :1908–1913 | Q20 (decided): core's guards are overridable in both modes; the instance's overlays carry no guards |
| Plugin-manager slots `plugins.bundle.config`, `plugins.row.config`, `plugins.tab` | present | present | embed-UI card; core's recommended tab |
| `Agent.followup` | `dsh-agent-loop` | present (different line) | `fishball-core` wake |
| Shortcut, origin and A-lite findings | V2 final scope §4.3 | same | `fishball-core` (`fishball-ui`) |
| Cordis service provide / optional `ctx.inject([...], cb)` sub-scope, `ctx.effect` disposers, `fiber.name` | cordis 4.0.5 | cordis 4.1.0, `Service` and `Fiber` effect/name types the same | contribution service (§13.7), `fishballInstance`, `fishballLite`, `fishballChild` |

A version-specific path is allowed only where V2 already needed one (tool executor batching,
MCP-S1 §1). It stays hidden behind `fishball-core`'s existing adapters.

## 10. Migration from V2

Order matters, because embed-UI is new and the connector loses its UI:
1. **Upgrade the connector.** The sidebar fish, marks and frame disappear until embed-UI is
   installed. The release notes and README say so, and the connector logs one line pointing at
   embed-UI.
2. **The connector's first V3 start:**
   - V2 settings that still apply keep their values (`maxMessageBytes`, read limits,
     `maxQueuedInputs`); dropped ones stay inert (D2);
   - the intake ledger's pending V2 items move into the designated Fishball principal's default
     lane, keeping their ids as `eventId`;
   - V2 attached-instance state is discarded (there are no live offers across a restart anyway,
     contract §5.1).
3. **Upgrade the instance.**
   - On its first V3 start with a connector in the same DSH, the instance asks the connector for
     the "Fishball (hosted)" token (R-HOST-05, Q8 decided).
   - The child profile, home, Fishball session history, Skills and child settings are kept.
   - The child's launch overlay no longer inserts the V2 instance-owned rows. The plugin set is
     placed instead: core on, the three features on at first placement (R-MIG-02).
     Row ids are kept where V2 already had them, so stored settings carry over.
   - V2 managed sessions keep their connector-side managed state, now owned by the hosted
     principal.
4. **Install embed-UI.** The fish, marks and page return.

There are no compatibility adapters and no dual control period (1c = B). A V2 child profile that
already contains a manually installed board, fold-notify or Watchdog: placement replaces the
`node_modules` copy with the bundled one and keeps the on/off state the user had. A test pins
this case.

**Standalone** is new in V3, so there is nothing to migrate.

## 11. Spikes and freeze before implementation

| ID | Question | Gate |
| --- | --- | --- |
| V3-S1 | Can a packaged MCP server SDK (2.x) serve **both** 2026-07-28 and 2025-11-25 on a raw `webServer` route, with bearer checking before dispatch, Origin/header validation, listen streams and legacy GET/subscribe, on both hosts? | Both stock-host clients (2.2.0, auto negotiation) and one 2025-era client list, call, subscribe and get hints. A 401 path never reaches the SDK |
| V3-S2 | MCP-S2 continuation: a durable child acceptance ledger plus `Agent.followup` gives one routed entry and one user-visible wake after a lost ack, a child crash and reconnect | the open TODO from MCP-S2 §11.5 closes; no duplicate wake |
| V3-S3 | Lanes: assign, release and handoff with offer re-issue under concurrent user/Watchdog/Fishball answers | OQ-14 race matrix; no stale-lane commit |
| V3-S4 | Embed-UI as a separate package: can the moved connector client still register its sidebar/slot contributions (the same injects) and frame the PG-ORIGIN child origin, without the connector client present? | both hosts; main shortcuts untouched |
| V3-S5 | Contribution service (§13): caller identity from the injecting fiber, auto-withdrawal on contributor disable/unload/HMR, `tools/list_changed` delivery on both eras, containment of throw/hang/oversize, on both hosts | independent cases across register/dispose/reload/quarantine states |
| V3-S6 | `fishball-core` as a plain bundle carrying its `fishball-ui` component: one bundle that inserts its own rows, disables other bundles' rows and sets the read-only preset in an ordinary DSH on both SDKs; one `dsh.client` serving the page, tab and settings; the hosted child behaves the same with the instance's launch configuration in place; core can read the effective composition and policy through a public API to report `guards-overridden`, in both modes; the A-lite page works without the instance (standalone) | both modes, both hosts; no host patch |
| V3-K | Freeze `./mcp-schema` and `./tools`: tool names and schemas, result envelope, event kinds, error map, page limit, retention, "connected" definition (§3.5) | reviewed; independent requirements-only case authoring starts after this |

Process stays: requirements → independent case authoring → implementation without reading tests
→ independent review → local commit, per AGENTS.md.

## 12. Security summary

- **Main DSH:** a full DSH (Q1, decided). Only the connector holds Fishball authority over its
  sessions. The instance's host row injects no session service, and embed-UI holds no session
  authority. No host patch anywhere; only public services, slots and patch rows.
- **Fishball DSHs:** hosted and standalone alike reach sessions only through a connector's MCP
  under a token, exactly like an external agent. The guards are the same in both modes and come
  only from `fishball-core`'s patch. The owner may override them (Q20, decided), which is reported, never
  hidden.
- **Contributed tools** (§13.5):
  - They run in the main DSH with their contributor's own DSH authority. The connector adds no
    Fishball authority, no tokens and no mailbox, lane or offer access (Q14 = A).
  - They are reached only through the same authenticated endpoint and its limits.
  - Each call is contained, and repeat offenders are quarantined.
  - Fishball's model sees only admitted namespaces (Q17 = A).
  - The residual risk is the same as installing any DSH plugin. It is shown to the user in the
    connector's native settings (R-EXT-15).
- **Credentials:**
  - Token values live only in `ctx.credentials`.
  - Hosted: the token goes to the child over the authenticated wire, in memory only. Standalone:
    it stays in that DSH's credential store and is resolved per connection.
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

## 13. Tool contributions from other plugins (R-EXT)

Added on 2026-11-11 for the user's requirement (requirements §1.2). The connector's MCP tool set
can be extended by other plugins in **the connector's own DSH process**. Embed-UI is the first
contributor.

### 13.1 Why an in-process DSH service

- The contributor and the connector share one DSH host process. A Cordis service is the
  supported way for one plugin to offer an API to others: `ctx.provide` / a `Service` subclass,
  consumed with an optional `ctx.inject([...], cb)` sub-scope. V2 already uses this for
  `fishballConnector` (`packages/instance/src/host/binding.js`), on both SDKs.
- Rejected alternatives:
  - **Contributor runs its own MCP server** that the connector proxies: a second endpoint and a
    second auth surface per plugin, against R-ARCH-06.
  - **Reuse `ctx.tools`** (DSH's agent tool registry): that registry feeds DSH's own agents, not
    an MCP endpoint. Registering there would expose the tools to every main-DSH agent session,
    which is not what the user asked for.
  - **Config-driven contributions** (the user lists tools in settings): a list cannot carry an
    execute function.

### 13.2 The service: `fishballConnectorTools`

Provided by the connector row on apply, removed when the row unloads. Typed in the connector's
`./tools` export (§9.1). Proposed shape:

```ts
interface FishballConnectorTools {
  readonly apiVersion: 1
  /** Register one tool for the calling plugin. Throws ToolContributionError on refusal. */
  register(definition: ContributedTool): () => void
  /** Read-only view of this caller's own registrations and their state. */
  mine(): readonly { name: string; publicName: string; state: 'exposed' | 'hidden' | 'quarantined' }[]
}

interface ContributedTool {
  name: string                    // local name, [a-z0-9][a-z0-9_.-]{0,47}; no leading/trailing '.'
  title?: string
  description: string             // non-empty, ≤ 2 KiB UTF-8
  inputSchema: JsonSchemaObject   // object root; keyword subset below
  outputSchema?: JsonSchemaObject
  limits?: { argumentBytes?: number; resultBytes?: number; timeoutMs?: number }  // each ≤ the connector ceiling
  codes?: readonly string[]       // the domain refusal codes this tool may return, [a-z][a-z0-9-]{0,47}
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean }
  execute(args: unknown, call: ContributedCall): Promise<ContributedResult>
}

interface ContributedCall {
  principal: { id: string; label: string }     // never the token
  era: 'modern' | 'legacy'
  signal: AbortSignal                          // client cancel, disconnect, revocation, timeout, contributor unload
}

type ContributedResult =
  | { ok: true; data: JsonValue; text?: string }
  | { ok: false; code: string; message?: string }
```

**Registration rules.**
- `register` must be called from the contributor's own context, `ctx.fishballConnectorTools.register(…)`
  inside its `inject` sub-scope. The registry records the **caller's fiber**: Cordis service
  calls see the caller's active context (`getTraceable`, cordis `utils.d.ts`), and
  `ctx.fiber.name` names the plugin.
  - The namespace comes from that name, so a contributor cannot pick another's namespace.
  - The returned disposer is bound to that fiber with `ctx.effect`, so the fiber's unload
    disposes it even if the contributor forgets.
  - Whether `getTraceable` gives the *caller's* fiber through an injected service on both
    SDKs is spike **V3-S5**. If it does not, the fallback is that a contributor passes its own
    `ctx` (`register(ctx, definition)`) and the registry checks
    `Context.is(ctx) && ctx.fiber.name`.
- Refusals throw `ToolContributionError {code}` and register nothing:
  - `tool-invalid`: bad name, description, schema, limits over the ceilings, codes grammar;
  - `tool-exists`: the same public name;
  - `namespace-reserved`;
  - `registry-closed`: the connector is unloading.
- A disposer called twice is a no-op. Re-registering after dispose is allowed.

### 13.3 Names and namespacing

- `namespace` = the contributor's DSH plugin name, normalised to `[a-z0-9-]` (scope `@x/` →
  `x-`). It is unique because DSH plugin names are unique in one profile.
- Public MCP name = `<namespace>.<name>`, for example `dsh-fishball-embed-ui.attention.signal`.
  - It fits MCP's rule (1–128 characters of `A-Z a-z 0-9 _ - .`, case-sensitive).
  - DSH's own MCP client renders it as `mcp__<server>__<raw>` and replaces `.` and truncates to
    its 64-character contract with a hash suffix (`dsh-mcp-client/lib/index.js:57–100`, both
    SDKs). So the name stays unique, but long names are shortened for DSH-hosted agents. The
    freeze sets a soft budget so that typical names avoid truncation.
- Reserved namespaces: `fishball` and the connector's own plugin name. Core tools keep unprefixed
  names (§3.2). No contributed name can collide with them, because every contributed name
  contains a `.`.
- Embed-UI gets the short alias namespace `embed-ui` (a fixed first-party mapping in the
  connector, for readable tool names). No other alias exists.

### 13.4 Lifecycle and `tools/list_changed`

- **Spec check (2026-07-28):** servers declaring `tools.listChanged` SHOULD send
  `notifications/tools/list_changed` to clients with a `subscriptions/listen` stream opened with
  `toolsListChanged: true`. `tools/list` MUST NOT vary per connection but MAY vary by
  authorization ([tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools.md),
  [subscriptions](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions.md)).
  The 2025-11-25 era has the same notification on the legacy session stream.
- Events that change the list: register; dispose; contributor fiber unload (disable, uninstall,
  reload, HMR); quarantine; the Q16 per-contributor switch; connector unload (closes everything).
- On a change, the registry:
  1. swaps its immutable tool table **synchronously**, so the next `tools/list` or `tools/call`
     sees the new table (R-EXT-04);
  2. aborts in-flight calls of withdrawn tools through their `signal`. Their result, if it still
     arrives, is dropped, and the client gets `{ok: false, code: 'tool-withdrawn'}`;
  3. coalesces notifications per event-loop tick and sends one `notifications/tools/list_changed`
     on every open stream that opted in.
- Clients that did not subscribe see the new list on their next `tools/list` (`ttlMs` on the
  list result is kept short, so caches refresh).
- **DSH-hosted clients:** stock `dsh-mcp-client` re-syncs its tools on `list_changed`
  (`listChanged.tools.onChanged` → `refreshTools`, both SDKs). `fishball-core`'s link (§6.3) does
  the same and re-filters through the Q17 allowlist.

### 13.5 Auth, limits, codes and isolation

**Order for a contributed `tools/call`:** steps 1–5 of §3.1, then:
1. resolve the name in the current table (unknown → JSON-RPC -32602 "unknown tool", spec
   protocol error);
2. state check: hidden or quarantined → unknown tool, never "exists but hidden";
3. argument byte size ≤ min(declared, connector ceiling) → `limit-exceeded`;
4. JSON Schema validation of `arguments` against `inputSchema` → `invalid-arguments` (the
   validator is the connector's own; the keyword subset matches what the hosts' client accepts);
5. per-principal and per-contributor in-flight and rate limits → `queue-full` / `rate-limited`;
6. `execute(args, call)` under a timeout (min(declared, ceiling)) and the abort signal.

**Result handling:**
- The result must be the `ContributedResult` shape.
- `data` must be JSON-serialisable within min(declared, ceiling) bytes, and valid against
  `outputSchema` when one is declared.
- `code` must be in the tool's `codes` or the connector's shared vocabulary
  (`limit-exceeded`, `forbidden`, `unknown-session`, `expired`, `conflict`, `unavailable`,
  `unsupported-operation`, `operation-failed`, …). An undeclared code becomes `operation-failed`.
- `message` is cut to 500 characters and passes the connector's secret-shape scrub (the same
  patterns DSH's secret mask uses) before it leaves.
- The client always gets the connector envelope (§3.2): a successful `CallToolResult` with
  `structuredContent` `{ok, …}` plus a text fallback. A contributor cannot produce `isError` or
  raw content blocks.

**Isolation:**
- `execute` throwing, rejecting, returning a bad shape, timing out or producing oversize output
  → that call gets `{ok: false, code: 'contributor-failed'}`. Nothing else is affected. There is
  no stack, message text or path in the reply.
- Logging: one warn line per (contributor, failure kind) per window, with the namespace, tool
  name and kind only. Never the arguments, the result or the principal's token.
- **Quarantine** (R-EXT-09): `contributor-failed` on more than N of the last M calls of one
  contributor (both frozen constants in the connector's limits, not settings) withdraws that
  contributor's tools (§13.4). It lifts on the contributor's reload, or through the Q16 switch.
- **What containment does not cover:** a contributor is ordinary in-process code. A synchronous
  infinite loop or memory exhaustion affects the whole DSH process, as any DSH plugin can. Process
  isolation is out of scope (requirements §5).
- **Authority:** `call` gives the principal's id and label only. The connector passes no
  credentials, mailbox, lane, offer, answer or other-tool handles (R-EXT-10/11). A contributor
  that wants session data must use its own DSH services under its own authority (Q14 = A).

**Visibility to the user** (R-EXT-15, Q16 = A): the connector's native settings gain a read-only
list `contributors: [{namespace, tools, state}]` (state `exposed`, `hidden` or `quarantined`)
and an `exposed` switch per namespace. The values come from the registry. No custom UI.

### 13.6 Embed-UI's notification tools (Q3 revised)

The attention latch moves out of the connector into embed-UI. Its behaviour is unchanged (D3).

| Public name | Input | Result | Behaviour |
| --- | --- | --- | --- |
| `embed-ui.attention.signal` | `{important: boolean}` | `{ok: true, accepted: true}` | sets `count = 1`, `important ||= important`; stateless, no counts or timestamps, no replay |
| `embed-ui.attention.state` | `{}` | `{ok: true, count: 0 \| 1, important: boolean}` | read-only; lets a client check the latch |

- The latch lives in embed-UI's host row, in memory, exactly as the connector held it in V2:
  - the page-open clear runs once through embed-UI's own authenticated route, no longer
    `/api/fishball/connector/attention/read`;
  - it resets on embed-UI's unload, and on loss of the designated Fishball principal's
    connection (§3.5), read from the connector state service.
- Embed-UI registers these tools only while both the connector (contribution service) and the
  hosted instance (child locator) are present (Q18 = A). Without either, they are absent, and
  fold-notify's attention call gets `unsupported-operation`, the same D3 rule as an unserved
  signal.
- Other notification-type UI state (managed marks, Hand over / Take back) stays on the
  connector side, because it is connector state. Embed-UI reads it through the Q3 = A state
  service. That service is now marks and hand-over only.

### 13.7 Compatibility on both SDKs (read only)

| Need | 0.2.1-rc.5 | 0.2.2-rc.1 |
| --- | --- | --- |
| Provide a named service; auto-removed with the owning fiber | cordis 4.0.5 `Service` (`service.d.ts`: "registered immediately and is automatically removed with the owning fiber"), `reflect.provide` | cordis 4.1.0, `service.d.ts` identical |
| Optional consumer sub-scope that activates and unloads with the service | `registry.inject(deps, cb)`; already used in V2 (`binding.js`), both versions per its comment | same |
| Caller identity | `ctx.fiber` (`fiber.d.ts:9–10`), `Fiber.name` (`:135`); `getTraceable` wraps services so calls see the caller's context (`utils.d.ts`) | `Fiber.name` `:139`; `getTraceable` same |
| Disposers bound to the caller | `Fiber.effect(execute, label)` | same signature (`fiber.d.ts:161–163`) |
| MCP `tools/list_changed` to DSH-hosted clients | `dsh-mcp-client` `listChanged.tools.onChanged` → re-sync | same lines (`:596–609`) |
| Model-facing name normalisation | `publicToolName`, 64 characters + hash (`dsh-mcp-client/lib/index.js:57–100`) | same |
| Not usable for this | `ctx.tools` (agent tool registry): wrong audience (§13.1) | `ToolsService.register` with scopes: same reason |

No version-specific path is needed for the contribution service. The caller-identity mechanism is
the one item to prove (V3-S5).

### 13.8 Relation to Q1 and the install matrix

- Contributors run in the **connector's DSH**, because the service is in-process with the
  connector. Q1's answer confirms that this DSH is a full DSH where any plugin may be installed,
  so any plugin may contribute. The connector is the only component with **Fishball** authority;
  other plugins keep their own DSH authority and gain none from Fishball (Q14).
- A standalone Fishball DSH has no connector of its own (matrix row 11 is unsupported), so it
  hosts no contributions; its Fishball uses the target connector's (requirements §4.1 E8).
- A contributor in some other DSH (for example the host DSH of matrix row 7, with a remote
  connector) has no connector to contribute to. Its tools do not exist anywhere (requirements
  §4.1 E6–E7). Cross-process contribution is out of scope.
