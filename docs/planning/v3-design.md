# Fishball V3: design draft

Status: **draft, 2026-11-11, docs only.** It answers [v3-requirements.md](<v3-requirements.md>)
(R-…). Every question in requirements §7 is decided, Q30 last, with the user's own design of one
typed event stream and an interception registry (requirements 1.11). No code, test or spike was
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
 │  · mailbox, tokens, OAuth AS, routing │                │ │  · places the plugin set in the child │
 │  · message_fishball / ask_fishball    │                │ │  · token hand-off, child locator ──┐  │
 │  · contribution service ◄─────────────┼─ registers ────┼─┤ fishball-embed-ui                 ▼  │
 │  · hand-over service (Q3)  ◄──────────┼─ in-process ───┼─┤  · fish, dots, marks, hand-over, frame│
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
| `fishball-connector` | a main DSH | MCP server; its own client-credentials OAuth authorization server (§5.5); tokens over `ctx.credentials`; pairs and names (§5.8); per-pair mailbox; routing (R-ROUTE, Q7 decided); session operations (today's `src/*.js` domain); `message_fishball` / `ask_fishball`; managed-session approval interception; the contribution service `fishballConnectorTools` (§13); the no-UI hand-over service (Q3, decided); **its own plugin settings page** with New token and the one-time reveal (§5.9; requirements 1.28: a settings page is not UI) | any change to DSH's own UI: sidebar, other slots, HTML pages, global CSS, iframes; an attention latch |
| `fishball-instance` | a host DSH | hosted mode only (§6): launching the child with its launch configuration, its lifecycle, placing the four plugins, target and token hand-off, the child locator `fishballChild`, hosted model sync (engine), the hosted settings bundle `fishball-hosted-settings` it places in the child (R-HOST-11), uninstall cleanup | any session, approval, question or prompt service of the host DSH (R-ARCH-05); UI |
| `fishball-embed-ui` | the host DSH, beside the instance | the sidebar entry and fish, the attention latch and its contributed tools (§13.6), marks and Hand over / Take back buttons that drive the connector's hand-over service (Q3, decided), the frame around the child page, status and Retry, the Plugins card and the model-sync trigger | secrets; session operations of its own; a Fishball page or frame without the instance (R-UI-01); anything at all with neither a connector nor an instance (R-UI-08) |
| **Fishball plugin set** (Q2, decided: four plugins) | a Fishball DSH (hosted child or standalone) | §5a | acting on any DSH except its own, other than through the target connector's MCP (R-FB-08) |

### 1.2 The Fishball plugin set (Q2, decided)

Four plugins. `fishball-ui` is not a plugin of its own: it is a component (a directory and a
client module) inside `fishball-core`'s package, installed, enabled and removed with core.

| Plugin | Contents (from V2, re-homed) | Requires |
| --- | --- | --- |
| `fishball-core` | **agent:** the manager session and persona; the MCP link to the target (§6.3); the `fishball-events` subscription, the interception service and the acceptance ledger (§6.4); the scoped bridge façade (X12), claims (X15) and send gate (X19); the extension service `fishballInstance` (X1–X19) for feature plugins; manager tools; the private Skills tool; the admin and settings routes it serves to its own web page. **`fishball-ui` component:** the A-lite page client module (Fishball-only page, hidden navigation, shortcut remapping or unbinding, explicit return from Settings/Plugins); the guard rows in core's bundle patch (read-only preset with the Skills exception, disabled session-creating rows); the `fishball-recommended` tab; the generic slim settings panel with its settings-section extension point (hosted-only sections are injected by the instance, R-HOST-11); the **ask card** for asks Fishball cannot decide (R-FB-11) | — |
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
  the connector's hand-over service for marks and Hand over / Take back.
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
- [2025-11-25 resources](https://modelcontextprotocol.io/specification/2025-11-25/server/resources.md)
  (read for comparison only; that revision is not served, Q12).

| Fact (2026-07-28 unless noted) | Design consequence |
| --- | --- |
| Stateless: no `initialize`; every request carries protocol version, client info and capabilities in `_meta`; servers MUST implement `server/discover`. Protocol-level sessions and `Mcp-Session-Id` are removed; servers keep cross-call state in explicit server-minted handles | The principal comes from the bearer token on each request, never from a transport session. Cursors are explicit tool arguments |
| Streamable HTTP: one endpoint, POST only; a response is JSON or a request-scoped SSE stream; GET stream removed; **no resumability** (`Last-Event-ID` removed): a broken stream loses its in-flight request | Delivery cannot rely on a stream. Durable mailbox + poll/ack is required (R-CON-03). Notifications are hints (R-CON-04) |
| Server→client change notifications only on a long-lived `subscriptions/listen` stream, filtered by `toolsListChanged`, `promptsListChanged`, `resourcesListChanged`, `resourceSubscriptions` (URIs). Server MUST ack first with `notifications/subscriptions/acknowledged`; every notification carries `io.modelcontextprotocol/subscriptionId` | Events surface as `notifications/resources/updated` for the pair's one event resource (`fishball-events`, §3.3); the client then calls `inbox_poll`. MCP has no custom event payload channel, so the payload never rides the notification |
| `resources/list` MUST NOT vary per connection but MAY vary by the authorization presented | The one URI `fishball://events` resolves to the caller's own pair's mailbox (content varies by access token) |
| Server-to-client requests (sampling, elicitation, roots) are embedded in results via MRTR (`InputRequiredResult`); unsolicited server requests are gone | Not usable for "DSH asks Fishball". Not used (requirements §5) |
| Cancellation on HTTP = closing the response stream | A closed listen stream is not revocation and not loss of authority (S1 rule kept) |
| Security: servers MUST validate `Origin` (403 if present and invalid), SHOULD bind localhost when local, SHOULD authenticate | R-REM-03; loopback default |
| Auth: optional. HTTP servers that support it SHOULD follow the OAuth 2.1 resource-server profile; the access token goes in `Authorization: Bearer` on **every** HTTP request and **never** in the query string; invalid → 401. Servers MUST publish RFC 9728 protected resource metadata (in `WWW-Authenticate` and/or well-known); authorization servers publish RFC 8414 metadata; tokens are audience-bound (RFC 8707). The **OAuth Client Credentials extension** (`io.modelcontextprotocol/oauth-client-credentials`) defines machine-to-machine use: `client_credentials` grant with client secret or JWT assertion, no browser | The connector is a client-credentials-only authorization server for its own endpoint (§5.5, R-OA) |
| Required request headers `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name` must match the body, else 400 `HeaderMismatch` (-32020) | The server SDK must validate. Freeze-time conformance test |
| 2025-11-25 (legacy era): `initialize` handshake, `Mcp-Session-Id`, GET SSE stream, `resources/subscribe` → `notifications/resources/updated`, resumable streams | **Not served** (Q12, decided). The connector is modern-only; legacy clients must upgrade (§3.1) |

What both DSH SDKs ship (read only, byte-identical client/core dist in both):
- `@modelcontextprotocol/client` and `core` **2.2.0**. `LATEST_PROTOCOL_VERSION = '2025-11-25'`,
  and the client contains the 2026-07-28 path: `Client.listen(filter)`, which needs a negotiated
  2026-era connection, and `versionNegotiation` modes (`legacy` is the default; `auto` probes
  modern first; `{pin: '2026-07-28'}` is modern-only). `fishball-core` pins 2026-07-28 (§6.3). See
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

### 3.1 Transport and mounting (Q9 and Q12 decided)

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
  1. method is POST; GET and DELETE get 405 (no GET stream, no sessions);
  2. `Origin`, when present, is in the allowlist (default: none; non-browser agents send no
     Origin) → 403;
  3. bearer token (§5.5) → 401 with `WWW-Authenticate: Bearer`;
  4. body and in-flight limits → 413/429 (R-SEC-03);
  5. version and header checks: `MCP-Protocol-Version` and `_meta` must both say
     `2026-07-28`, else 400 with `UnsupportedProtocolVersion` (-32022, `supported:
     ["2026-07-28"]`); mismatched mirrored headers → 400 `HeaderMismatch` (-32020). A legacy
     `initialize` request gets a JSON-RPC error whose message names the supported revision, so a
     2025-era client can show the user why it can't connect;
  6. dispatch.
- **Server SDK:** an explicitly packaged `@modelcontextprotocol/server` of the same 2.x line as
  the hosts' client (2.2.0), with its Node HTTP adapter, configured **modern-only (2026-07-28)**.
  Proving it on both hosts is spike **V3-S1** (§11).
- **Older clients must upgrade (Q12, decided).** The connector serves no 2025-11-25 or earlier
  client. The README and the connector's settings note say so, and the refusal above names the
  supported revision.

### 3.2 Tools

Each tool wraps today's connector domain function (`packages/connector/src/*`) and keeps contract
1.2's semantics, vocabularies and limits (§4, §6, §8 there). Input schemas come from the frozen
`LIMITS`; byte limits are checked in domain code (JSON Schema lengths count characters).

| Tool | Domain source (contract 1.2) | Notes |
| --- | --- | --- |
| `sessions_list` | `session.list` | sessions related to **this principal**; a session another principal manages is omitted, and `session_read` of it is `forbidden` (1.23) |
| `session_start`, `session_message`, `session_redirect`, `session_stop`, `session_release` | §4.1 | `unconfirmed` is never retried. `session_start` makes the caller the managing principal (R-ROUTE-01), which also makes it the session's only watcher (R-WATCH-01). No `notifyWhenFinished` argument; no watch tools exist (R-WATCH-03) |
| `session_read` | `session.read` | bounded; `truncated` |
| `approvals_list`, `approval_answer` | §4.2 | timer-free descriptor (no `expiresAt`); answer authority is checked against the live `offerId` and the pair (§3.4) |
| `question_answer`, `question_ask`, `question_answer_own` | §4.2 | plan review included |
| `prompts_list`, `prompt_answer`, `grants_list`, `grant_revoke` | §4.3 | |
| `attachment_put`, `attachment_read` | §4.4 | chunked; `hostRef` single-use, 10 min |
| `inbox_poll`, `inbox_ack` | new (replaces `inbox.push`) | §3.4 |
| `pair`, `set_name` | new | §5.8 (R-ID, R-NAME) |
| ~~`attention_signal`~~ | §4.6 (D3) | **moved**: now `embed-ui.attention.signal`, contributed by embed-UI (§13.6) |

**Result shape (decided per spec, requirements 1.18: Tools § Error Handling, § Structured
Content).** Every tool returns `structuredContent` `{ok: true, …}` or `{ok: false, code, message}`
**and** the same JSON serialised in a text content block. A refusal is a tool execution error:
`isError: true`. Stock DSH throws on `isError: true` before keeping `structuredContent`
(`dsh-mcp-client` conversion, [option §6](<../plugins/connector-mcp-option.md#6-security-discovery-and-limits>)),
so the code is also carried in the text block, which DSH-hosted agents still see. `fishball-core`'s
own link reads `structuredContent` directly. Every output schema admits the refusal envelope (K1).
JSON-RPC errors are kept for protocol faults only.

### 3.3 The `fishball-events` stream (R-EVS; Q30 decided)

| Resource | `resources/read` returns | Subscribed by |
| --- | --- | --- |
| `fishball-events` (URI `fishball://events`) | this pair's mailbox summary: `{pending, headSequence, mailboxGeneration}`, never event bodies | every principal that wants hints |
| `fishball://sessions` | this principal's related sessions (as `sessions_list`); data, not an event stream | optional |

- **One stream, typed events.** There is exactly one event resource. Every event a pair can
  receive (`handover`, `takeback`, `permission`, `question`, `plan-review`, `settlement`,
  `retirement`, `turn-finished`, `state`, `message`, `ask`, `notice`,
  `contributed:<ns>.<event>`) is an entry in that pair's mailbox with a `type` field (R-EVS-02). Kinds are told apart only by `type`.
- **Exactly one pair per event** (R-EVS-03): the session's managing pair as of the event; else,
  or with no session, the designated Fishball pair. Follow-up events (`settlement`,
  `retirement`, `takeback`) go to the pair that got the original. There is no watch exception:
  a pair watches exactly the sessions it manages (R-WATCH, Q31 decided).
- The client opens `subscriptions/listen` with `resourceSubscriptions: ['fishball://events']`,
  and optionally `toolsListChanged`. After the required acknowledgement, the server sends
  `notifications/resources/updated {uri}` after **each commit** to that pair's mailbox
  (R-EVT-04). It sends SSE keep-alive comments while quiet.
- A notification is a hint. The client always `inbox_poll`s. A hint lost to a dropped stream is
  recovered by polling on reconnect: on every (re)listen the client polls once before trusting
  hints.
- `resources/list` varies by access token only (spec-allowed).
- `tools.listChanged: true` is declared. A listen stream with `toolsListChanged: true` gets
  `notifications/tools/list_changed` when contributions come or go (§13.4).

### 3.4 Mailbox and delivery

This follows the MCP-S2 proposal (`spike/mcp-s2-recovery-cuts` §3, §6), adjusted to V3. Earlier
V3 drafts had named lanes for Watchdog; they are dropped (requirements 1.8 item 4).

- **Per pair** (token entry + bound id, R-ID-06), the connector keeps one durable ledger in its
  own storage domain. It is the content behind that pair's `fishball-events` resource (§3.3).
  - An event has `{eventId, mailboxGeneration, sequence, type, sourceSessionId, correlationId,
    offer?: {offerId, revision, decisionKind}, payload, payloadDigest}`.
  - The `type` vocabulary is R-EVS-02's: `permission`, `question`, `plan-review` (the three
    offer types), `settlement`, `retirement`, `turn-finished`, `state`, `message`
    (`message_fishball`), `ask` (`ask_fishball`), `handover`, `takeback`, `notice`, and
    `contributed:<namespace>.<event>` (contributor events, §13.5a).
- **`inbox_poll({cursor?, limit})`** returns `{events, nextCursor, hasMore}` or an explicit
  `{resync: {reason, headSequence}}`.
  - Reading a page is not acking it.
  - Cursors are opaque and bound to the pair and `mailboxGeneration`. A foreign cursor gets
    `forbidden`; a stale one gets `resync`.
- **`inbox_ack({receipts:[{eventId, payloadDigest}]})`** marks events accepted.
  - Unacked events replay with the same identity.
  - An ack never confers answer authority.
- **Answer authority.** `approval_answer` or `question_answer` is accepted only for the current
  `offerId`, from a full access token of the pair that holds the offer. The first committed
  outcome wins (OQ-14). No timer ever settles an offer (R-CON-05). Inside a Fishball DSH, who
  answers (Fishball or its Watchdog) is the Fishball DSH's own business (§7); the connector sees
  one principal.
- **Bounds.** `maxQueuedInputs` (default 200) still caps automated kinds per pair with
  `queue-full`; user hand-over notes are always accepted (contract 1.2 §9 rule). The page limit
  and retention are frozen with the schema (§11).

### 3.5 Routing between several principals (R-ROUTE; Q7 decided)

- A managed session's **managing principal** is the principal that started it with
  `session_start`, or the designated Fishball principal for a user Hand over.
  `session_release` clears it.
- That session's permission requests, questions and plan reviews become `permission`,
  `question` and `plan-review` events for its managing pair. Every event naming the session,
  `turn-finished` and `state` included, goes to one pair by R-EVS-03.
- **Watching is managing (R-WATCH, Q31 decided).** The managing pair automatically gets every
  `turn-finished` and `state` event of its sessions, from start or Hand over until release or
  Take back. Unmanaged sessions produce neither. The connector's V2 watch machinery (watch ids,
  modes, watermarks per watch) collapses into one per-session watermark owned by the managing
  pair. It is read before each `session_message`, so a turn that ends at once is still reported,
  as V2's `notifyWhenFinished` did.
- `message_fishball` and `ask_fishball` from a session go to its managing principal. An
  unmanaged session's calls go to the **designated Fishball principal** (setting
  `routing.fishballToken`, default the hosted Fishball's token entry, if any; R-ROUTE-04).
- `ask_fishball` with the target principal not connected keeps contract 1.2 §9: it answers
  `unavailable` at once. "Connected" means the principal has made an authenticated request or
  held a listen stream within the current connector life (decided at schema freeze), **not** a
  timer on the answer.
- A managed session whose principal is revoked or deleted returns to the user (unmanaged), and
  its live offers go to the user in that session (§5.3).

### 3.6 Hand-over service (R-CON-11; Q3 decided)

The connector keeps only what contacts Fishball: the `handover` / `takeback` events and the
managed-session state they change. Embed-UI's buttons drive it in-process, through a host-only
Cordis service (no UI, no token, same DSH):

```js
fishballConnectorHandover = {
  apiVersion: 1,
  managed(),                      // [{sessionId, principal: {key, name, id}}]; names unique per connector (Q23), may be null (1.20)
  principals(),                   // [{key, name, id, online, enabled, paired, designated}]; the Hand over control lists enabled+paired ones
  onChange(fn) → dispose,         // managed set, names or connection changed
  handOver(sessionId, principalKey, note?), // → {ok, principal} | {ok: false, code: 'no-fishball'|'conflict'|'unknown-session'|…}
  takeBack(sessionId, note?),     // → {ok} | {ok: false, code}
}
```

- `handOver` makes the **chosen** principal (requirements 1.20, R-ROUTE-05) the managing
  principal and commits one `handover` event (with the user's note) to its mailbox; `takeBack`
  clears it and commits one `takeback` event. Both are the V2 domain operations with the same
  refusal codes. The target may be offline: its `handover` waits in its mailbox. A target
  disabled or deleted by the time the call lands gets `no-fishball`; an already-managed session
  gets `conflict` (Q-HO-1 decided C).
- `online` is true while the principal holds an open `fishball-events` listen stream. `onChange`
  fires on every change of it, so embed-UI's lights stay live. K1 freezes this as the one
  "connected" definition (§3.5), recommended for `ask_fishball`'s `unavailable` check too.
- `principal.key` is an opaque connector-side key, never a token. `principal.id` is the
  non-secret fishball id, given only so a nameless principal can be shown as `ID: <id>`. The service exposes no
  session read, approval or answer power, and is not reachable over MCP or HTTP.
- Embed-UI subscribes to `onChange` to redraw marks and the Hand over control (R-UI-10): no
  control with no enabled, paired principal; one button "Hand over to <name>" (or "Hand over to
  ID: <id>") with one; a "Handover to…" dropdown with several. Each row and the single button
  carry a green (online) or red (offline) light. Labels come from embed-UI's locale files.


## 4. Embed-UI: locating and showing the hosted child

Embed-UI's **page and frame** work only beside a hosted instance (R-UI-01). Its marks, Hand over
/ Take back, fish and dots, and contributed tools need only a connector in the same DSH (R-UI-08). It never frames a standalone Fishball
(R-UI-07): a standalone DSH's own web UI is already the Fishball page.

### 4.1 The child locator service (instance side)

The instance's host row provides a Cordis service, proposed name `fishballChild`. It replaces the
`ui`/`status`/`retry` fields that V2 passed through contract 1.2.

```js
fishballChild = {
  apiVersion: 1,
  status(),                 // {state: STATUS, code: STATUS_CODES | target code | null}
  onChange(fn) → dispose,   // state, origin or target-status changes
  origin(hostname),         // the child web's origin under that loopback hostname, or null while not ready
  admit({view, lang, hostname}), // Promise<{url}>: one-time admission URL; hostname ∈ {127.0.0.1, localhost, [::1]}
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
- **S4 (`b9809b7`, PASS):** the child redeems the ticket into **its own login cookie** through
  DSH's public API, so the browser never sees the child's launch token. The cookie is
  `SameSite=Strict`: opening the host DSH as `localhost` while the child is on `127.0.0.1` (or the
  reverse) makes the frame answer 401. Dropped surfaces (S4-Q2 decided): sidebar entry kept, brand not overridden; no `ask_fishball` row
  (an undecidable ask becomes a card in Fishball's own page, R-FB-11); records are drawn inline in the
  managed session from its own events (Q-S4-2b decided B, R-UI-13). Package name (S4-Q3 decided B): `fishball-embed-ui`, lowercase, matching `fishball-connector` and
  `fishball-instance`.
- **Hostname (S4-Q1 decided A):** embed-UI's admit route passes the hostname of the main page's
  request; the locator accepts only `127.0.0.1`, `localhost` or `[::1]`, keeps the child's own
  port, and binds the ticket to that hostname. The child is reachable under all three names. Any
  other name: the route refuses and embed-UI shows "Open DSH at 127.0.0.1 to use Fishball". The
  frame through a tunnel is out of scope.

### 4.2 Embed-UI

- **Host half:** `inject: ['fishballChild?', 'fishballConnectorHandover?', 'fishballConnectorTools?']`.
  - Without `fishballChild` it registers no frame and logs `instance-missing` once (R-UI-01).
    With the connector services but no instance, it still draws marks, Hand over / Take back and
    the fish with its dots, and contributes its attention tools, with no page or frame (Q18,
    decided; R-UI-08). With neither, it registers nothing.
  - With it, it registers its own authenticated DSH Fetch routes for status, Retry, admission and
    model sync, re-serving the locator's results to its own web client. `connection.fetch`
    already authenticates the browser owner. This is V2's route set, moved out of the instance.
- **Web half** (`dsh.client`, the same injects as today's connector and instance clients):
  - the sidebar entry and fish (the one Fishball entry; DSH's brand mark is not overridden, R-UI-11);
  - **no** answer controls for `ask_fishball` (R-UI-12);
  - **inline records** (R-UI-13, Q-S4-2b decided B): read-only rows in the managed session, drawn
    when the session sends a request to Fishball and when the answer comes back, built only from
    the session's own events: its `ask_fishball` tool call and result (a read-only
    `tool.call.toolview` for `ask_fishball`, a slot S4 showed embed-UI can fill) and its approval
    request and resolution (a `conversation.chat.node` record). The principal's name comes from the
    existing `managed()`. No new service member, no connector read API;
  - the frame: `src` comes from `admit`; when `lang` changes it asks for a new admission;
  - status and Retry, outside the frame;
  - the Plugins card with the model-sync trigger;
  - with `fishballConnectorHandover` present (Q3, decided): managed marks with principal names
    (or `ID: <id>`), the Hand over control (one button or the "Handover to…" dropdown, R-UI-10)
    and Take back, which call the service (§3.6);
  - with `fishballConnectorTools` present: its own `attention.*` tools (§13.6). From its own latch
    it draws the green dot and the important animation, and it clears the latch on page open.
- The connector's hand-over service is specified in §3.6. It has **no attention members**: the
  latch belongs to embed-UI. The connector exposes it whether or not embed-UI exists, so
  R-ARCH-03 holds.
- The D3 behaviour is unchanged, with embed-UI as the latch's new owner: a 0/1 latch with
  importance, cleared once on page open, no timer (§13.6).
- **Remote target, no connector in this DSH** (matrix row 7; Q4, decided; R-UI-09): neither
  connector service is present, so embed-UI shows only the page, status and Retry: no dots, no
  marks, no Hand over and no relay over the lifecycle wire. The frame still points at the
  **local** child; only the child's MCP link is remote.

## 5. Tokens

### 5.1 Model (amended by requirements 1.27)

- A token is a **connector settings list entry** plus a **digest** of its value in the
  connector's own storage domain:
  ```yaml
  tokens:
    - label: Claude on the laptop    # shown in the native form; not a secret
      enabled: true
      key: 6kq2…                      # opaque entry key the connector wrote at creation; not a secret
  ```
- **Only the connector generates a value**, and it is shown **once**, in the reveal modal (§5.9).
  Nobody can view or edit it afterwards (requirements 1.27).
- **Storage is digest-only.** The connector keeps `SHA-256(value)` (K1 `TOKEN_VALUE.digestAlgorithm`)
  in the entry's record (C-TOKENS' `fishball_tokens` domain) and never the value. This is enough,
  because nothing ever reads a value back:
  - the client-credentials grant authenticates with `TokenRegistry.match(client_secret)`
    (`mcp/oauth/client-credentials.js`), a constant-time compare of the presented value's digest;
  - the approval page authorizes with the same `match(value)` (`mcp/oauth-web/approval.js`);
  - access and refresh tokens are already digest-only and carry the entry's generation (§5.5).
- **Why a plain digest and no HMAC key.** W2's HMAC fingerprint key (`tokens/fingerprint.js`, C-TOKENS
  question 2 = A) existed so that a stored digest of a short, user-chosen value could not be
  brute-forced offline. Every value is now 256 random bits, so a SHA-256 digest is not
  guessable, and the key record is no longer needed.
- **No exception for hosted entries (R1, requirements 1.28).** A "Fishball (hosted)" value is
  stored only inside the Fishball child (§5.4). The connector keeps its digest, like any other, and
  the host DSH's credential store holds no token value at all.
- The settings document holds the label, the switch and the entry key, never the value, a digest
  or a reference. `role('secret')` and `role('credential-ref')` fields are not used.

### 5.2 Creation (R-TOK-03, R-TOK-08, R-TOK-11; requirements 1.27)

- The user presses **New token** on the connector's own plugin settings page in **Plugins**
  (§5.9; R2, requirements 1.28), and types a label.
- The connector then:
  1. generates a value: 32 random bytes from `crypto.randomBytes`, base64url, with prefix `fbt_`,
     so secret scanners and DSH's own secret mask can recognise it;
  2. writes the entry's record (entry key, label, digest, generation 0) **before** the settings
     item, so the sync that sees the new `key` finds its record;
  3. adds `{label, enabled: true, key}` to the native list through the K1d `SettingsWriter`;
  4. returns the value **once**, to the caller that asked for it, and keeps no copy.
- If step 2 or 3 fails, nothing is returned and the record is removed again: there is no entry
  whose value nobody saw.
- **Withdrawn (1.27):** a value the user sets in the store or the environment; `token-too-short`
  and its 32-character minimum (TQ-4's length part); `token-unconfigured`; `ref-duplicate` and
  value-duplicate (C-TOKENS questions 4 and 5 lapse with them); "a value unset waits for a
  save". Only label and switch edits, removals and reordering are accepted; duplicates are
  refused with a notice (R3, §5.9).
- **Finding (still true):** DSH's generic plugin form has no secret-entry widget and no one-shot
  display, so the reveal needs the connector's own settings page (§5.9).

### 5.3 Revocation

Disabling or deleting an entry revokes the principal at the next request (a value can no longer
change or be unset, requirements 1.27; K1 `RevocationKind` `value-changed` is withdrawn) (R-TOK-05, R-OA-06). TQ-2 is decided **A**. Common to every
revocation:
- every access token derived from the entry is invalid; MCP requests get 401 and the token
  endpoint answers `invalid_client`. A request already past the token check completes; the next
  one is refused (TQ-5 decided A);
- open listen streams close with the graceful completion result;
- pending answers fail;
- its live **offers** are withdrawn (a `retirement` event follows each, R-EVS-03) and go to the
  user in their sessions;
- managed sessions become unmanaged, with one `system` note each.

**Disable:** every other queued event, of every type, `ask`
included, is kept for **30 days**; re-enabling the same entry restores the same pair (R-ID-09) and
the events are pollable again. The designated-Fishball role stays with the entry, so while it is
off `ask_fishball` from an unmanaged session answers `unavailable` and `message_fishball` queues
(R-ROUTE-04). After 30 days the kept events are dropped as on delete.

**Delete:** every queued event is dropped, and the designated role is cleared
(`routing.fishballToken` unset; R-ROUTE-04's default then applies).

**Dropped `ask`:** when an `ask` event is dropped (delete, or the end of the 30 days), the waiting
`ask_fishball` call in the asking session returns `unavailable`, the code it already uses when no
principal is available, so the session never waits for an answer that cannot come. While the
entry is only disabled, the call keeps waiting: no timer settles it (R-CON-05).

Deleting an entry drops its digest record. No value is stored on the connector's side, hosted
ones included, so nothing is unset (requirements 1.27, 1.28). A deleted hosted entry's value stays
in the child's credential store, dead, until the user supplies a new token or a reinstall replaces
it (§5.4; R6 = B).

### 5.4 The Fishball DSH's token (R-HOST-05; Q8 decided)

**Hosted, connector in the same DSH (automatic; Q8 revised by requirements 1.9).**
- The connector provides a host-only service `fishballConnectorTokens`
  (`{apiVersion: 1, createHosted(instanceId) → Promise<{entryKey, label, value}>, entryState, retire(oldEntryKey, successorEntryKey)}`).
  `createHosted` creates a **new** "Fishball (hosted)" token entry, keeps only its digest, and
  returns the value **once**, in process, to the instance (the only caller; never to a UI, and no
  reveal modal). It is called only when the child holds no paired credential (first start, or
  after a reinstall), never on restart or reconnect.
- **Where the value lives (R1, requirements 1.28: "存在fishball子实例内，第一次启动的时候由instance插件传入").**
  The instance holds the value in memory just long enough to send it **once**, at the child's
  first start, over the authenticated lifecycle wire (mutual HMAC proof,
  `src/native-runtime/wire.js`) on the channel `mcp-credential`, after `auth accepted`. The
  child-side receiver stores it with the **child's own** `ctx.credentials.set` under a fixed
  reference that the hosted settings bundle names as core's `target.tokenRef`. From then on
  `fishball-core` resolves it per connection, exactly as in standalone mode, and uses it as its
  OAuth client secret (§5.5). The instance then drops it. The host keeps **no** copy: not in its
  credential store, lifecycle state, overlay, argv or env.
- **"First start" means the child holds no credential.** The instance asks the child's receiver
  whether a credential is stored (a yes/no answer, never the value) before it calls `createHosted`.
  The receiver acknowledges the store; only then does the instance record the entry key. If the
  child cannot store it (an unwritable child credential store), the instance deletes the new entry
  and reports `credentials-unwritable` (PROPOSED: the K3 code moves from the connector's side to
  the child's).
- **Host restart:** the child keeps its value in its own store, so nothing is created or sent; the
  child reconnects with it. **Child restart or crash:** the same. **Reinstall** (child home
  removed or reinstalled): the stored value is gone with the old home, so the new child's start is
  a first start: a new hosted entry, its value passed in once, then succession (R-HOST-09, below).
  **Uninstall:** the value goes with the child runtime; the hosted entry's digest stays in the
  connector until the user deletes the entry. **User delete, then Retry** (R-HOST-10; R6 = B,
  requirements 1.29): Retry creates **no** token. It shows a notice telling the user to create a new
  token themselves (New token, §5.9); the child keeps its dead value until then (where the user
  puts the new one: open question R8).
- **Reinstall succession (Q24, decided; R-HOST-09).** The instance keeps the entry key of the
  hosted entry it created (non-secret, in its lifecycle state). When a reinstalled child pairs
  with a new hosted token, the instance calls `retire(oldEntryKey, newEntryKey)`. In one storage
  transaction the connector:
  1. moves managed sessions, and with them their watch (R-WATCH-04);
  2. moves the designated role, if the old entry held it;
  3. copies the name;
  4. re-issues the old entry's live offers into the new mailbox with new offer ids (old ids then
     answer `expired`);
  5. moves pending events with their `eventId`s;
  6. deletes the old entry (its digest; there is no value on the host to unset);
  7. adds one `system` note per moved session.
  `retire` refuses any old entry that `createHosted` did not create for this instance. A failure
  rolls everything back, and the instance retries at its next start.
- A user who disables a hosted entry gets `token-revoked` in the child and no automatic
  replacement (R-HOST-10).

**Saved once at the first connection (R7, requirements 1.29: "在第一次连接远程dsh的时候保存一次到fishball本地，这也apply to standalone fishball").**
- **Hosted with a remote target.** The instance's `target.tokenRef` names a reference in the host
  DSH's credential store. The user creates a token in the remote connector's DSH (§5.2), copies it
  from the reveal modal (§5.9) and puts it there. At the child's **first connection** to that
  remote DSH, the instance reads it there once and passes it in on `mcp-credential`, and the child
  saves it once into its own credential store under the same fixed reference as a hosted value.
  From then on the child connects with its saved copy; a host or child restart sends nothing. The
  user's host copy is the user's and is never deleted or written by Fishball.
- **Standalone.** `fishball-core`'s own settings name `target.url` and `target.tokenRef`. At the
  **first connection** to that target, core reads the value under `target.tokenRef` once and saves
  it into its own local credential record (a core-owned key, not the user's reference). From then on
  it connects with that saved copy only, and never writes or deletes the user's reference. Nothing
  goes over a lifecycle wire, because there is none.
- When the saved copy is replaced (a changed target, a refused token) is open question R9.

### 5.5 OAuth: client credentials, the connector as its own authorization server (R-OA)

**Spec alignment (read 2026-11-11):**
- the MCP authorization spec (2026-07-28): RFC 9728 protected resource metadata, RFC 8414
  authorization server metadata, RFC 8707 audience binding, short-lived access tokens, HTTPS
  for authorization server endpoints;
- the **OAuth Client Credentials extension**, `io.modelcontextprotocol/oauth-client-credentials`
  ([overview](https://modelcontextprotocol.io/extensions/auth/oauth-client-credentials.md)):
  the `client_credentials` grant with a client secret or a JWT assertion, with no browser;
- pre-registration ([client registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration.md)):
  the client is configured with a client id and secret.

Both DSH SDKs' `@modelcontextprotocol/client` 2.2.0 ships `ClientCredentialsProvider`:
`client_secret_basic`, `expectedIssuer` pinning, and TLS required for the token endpoint except
on localhost and 127.0.0.1. `fishball-core` uses it unchanged.

**Endpoints (same listener as the MCP endpoint, no UI):**

| Path | Content |
| --- | --- |
| `/.well-known/oauth-protected-resource/api/fishball/mcp` | `{resource: <canonical MCP URI>, authorization_servers: [<issuer>], bearer_methods_supported: ["header"], scopes_supported: ["fishball"]}` |
| `/.well-known/oauth-authorization-server/api/fishball/oauth` | `{issuer, token_endpoint, authorization_endpoint: <approval origin>/authorize, grant_types_supported: ["client_credentials", "authorization_code", "refresh_token"], response_types_supported: ["code"], code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"], client_id_metadata_document_supported: true, authorization_response_iss_parameter_supported: true, scopes_supported: ["fishball", "fishball:pair"]}` (never `offline_access`); no `registration_endpoint` (§5.5a) |
| `/api/fishball/oauth/token` | the token endpoint |

**Issuer and canonical URI follow the checked host** (spike V3-S1 Q2 + Q-S7-2, settled by the
specification: the metadata's `issuer` MUST equal the issuer used to build its well-known URL).
For a request under an allowed host H (loopback names, the bind address, DSH's `--trusted-host`
list; R-REM-03), issuer = `<scheme>://H/api/fishball/oauth`, canonical MCP URI =
`<scheme>://H/api/fishball/mcp`, and the access token's audience is that URI.

The issuer has a path component (`/api/fishball/oauth`), so it sits under DSH's own listener
without claiming the bare `/.well-known/oauth-authorization-server` that DSH might use itself.
Clients find it through the protected resource metadata, as the spec requires.

**Token endpoint, in order (nothing past a failure runs):**
1. method POST, form body, the Host and Origin checks and limits (§3.1);
2. `grant_type` is `client_credentials`, `authorization_code` or `refresh_token` (§5.5a), else
   `unsupported_grant_type`. Steps 3–4 are for `client_credentials`; the other two are public-client
   grants (`none`; a client secret gets `invalid_client`), and `resource` is required on all three;
3. the client secret is compared, in constant time, against the enabled token entries' digests.
   A miss returns `invalid_client` (401, `WWW-Authenticate: Basic`) and reveals nothing about ids
   or pairs;
4. `client_id` is a valid fishball id (R-ID-02: no dot), else `invalid_client`;
5. `resource` must be present and be the canonical MCP URI, else `invalid_target` (R-OA-05, TQ-3
   decided A; spike V3-S7 confirmed the stock `ClientCredentialsProvider` sends it on both SDKs);
6. issue an access token: an opaque value of 256 bits of randomness, stored by SHA-256 digest
   with `{entryKey, fishballId, audience, expiresAt}`, **in memory only** (TQ-5 decided A): a
   connector restart loses every access token, and clients re-authenticate on the 401. Its power is **full** if the entry is bound
   to this id, else **pair-only** (R-OA-04). Response, standard fields only (requirements 1.17;
   S7 found the stock client drops custom ones):
   `{access_token, token_type: "Bearer", expires_in, scope: "fishball" | "fishball:pair"}`.
   `expires_in: 3600`. No refresh token for `client_credentials`; a `refresh_token` grant from such a
   client gets `invalid_grant` (Q27; browser clients: §5.5a).

**MCP endpoint check, per request:**
- `Authorization: Bearer` is looked up by digest; missing, unknown, expired, of another audience,
  or derived from a disabled, deleted or changed entry → 401 with
  `WWW-Authenticate: Bearer resource_metadata="<metadata URL>", scope="fishball"` (plus
  `error="invalid_token"` when one was sent).
- A pair-only token (`scope: fishball:pair`) reaches only discovery, `tools/list` (which then
  lists `pair` only) and `pair`. Anything else gets **HTTP 403** `WWW-Authenticate: Bearer
  error="insufficient_scope", scope="fishball", resource_metadata="…"`, with `error_description`
  `not-paired` or `id-mismatch` (decided per spec: Authorization § Runtime Insufficient Scope
  Errors; R-ID-06). A token request asking `scope=fishball` while unpaired is narrowed to
  `fishball:pair`, not refused (OAuth 2.1 §1.4.1).
- **Static header access** (requirements 1.25, R-OA-10; the user: "那就也接受直接贴token+id的请求头"):
  a request carrying `Fishball-Agent-Id: <fishball id>` is authenticated by
  `Authorization: Bearer <token value>` instead of an access token. The value is compared in
  constant time against the enabled entries on **every** request; an unbound entry with a free id
  is paired on the first request (no name), exactly like the approval page; an entry bound to that
  id is that pair at full power; otherwise 401 `invalid_token` with `error_description`
  `already-paired`, `id-taken` or `id-invalid`. No expiry: disable, delete or a value change refuses
  the next request. Without `Fishball-Agent-Id`, a raw token value or the old `<id>.<token>` form
  is an invalid access token. This serves clients that can only send fixed headers, such as DSH's
  `dsh-mcp-client`, and is the **second documented departure** from the MCP authorization
  specification (requirements 1.17).

**Why no refresh tokens for machine exchange (Q27, decided; browser clients get rotating ones, Q-OA-2 A, §5.5a):** a client-credentials client re-authenticates with its own
id + token, which the stock provider already does. A refresh token would be a second long-lived
secret with no gain here. Revocation is immediate either way, because every access token points
back to its entry.

### 5.5a Browser authorization (requirements 1.16, 1.17, R-OA-11…20)

The user's answers: the OAuth page also authenticates ("同时兼顾网页认证和机器换码"), with no direct
access, and the page on its own port ("授权的网页单开一个，改成单独一个端口暴露，不然会被DSH的token要求卡住").
External behaviour follows MCP 2026-07-28 (requirements 1.17). Machine exchange (§5.5) is unchanged
and stays the only path for `fishball-core` (R-OA-19).

**Listeners.**

**Transport (Q-SPEC-1 decided A):** both listeners are plain HTTP on loopback, a documented
departure from the specification's HTTPS rule (the other is static header access, §5.5); any non-loopback host is HTTPS, directly or through
the user's tunnel (R-OA-08, R-REM-05).

| Listener | Serves |
| --- | --- |
| DSH's web listener (§3.1) | MCP endpoint, protected-resource metadata, AS metadata, token endpoint |
| the connector's **approval listener** (R-OA-20) | `GET /authorize` (the approval page) and `POST /authorize/decision` only; any other path 404 |

One issuer (§5.5) names both; the AS metadata's `authorization_endpoint` points at the approval
listener. **Port (Q-OA-7 decided A):** a native setting with a fixed default (frozen at V3-K),
always open while the connector runs. On a clash: one diagnostic, status `approval-port-in-use`,
and the metadata **keeps** `authorization_endpoint` (stock clients reject metadata without it,
S1/S7), so MCP and machine exchange are unaffected and only the page is unreachable. Host and
Origin are checked on both (S1 (a)).

**Registration [spec: Client Registration]:** Client ID Metadata Documents only (an `https:`
`client_id` URL with a path, fetched with SSRF limits, cached by HTTP cache headers, `client_id`
in the document identical to the URL, `redirect_uris` required). No dynamic client registration:
it is deprecated in the specification. Machine clients are pre-registered by their token entry.

**Flow (Q-OA-5 decided: the page asks only for a token):**
1. The client finds the AS through the protected-resource metadata (unchanged), sees
   `client_id_metadata_document_supported: true`, and uses its metadata-document URL as
   `client_id`.
2. It opens the browser at the approval listener's `/authorize` with `response_type=code`,
   `client_id`, `redirect_uri` (one of the document's; exact, except any port for a loopback
   redirect, OAuth 2.1 §2.3.1),
   `code_challenge` (S256), optional `state`, and `resource`.
3. The page shows the client's `client_name` (unverified), the redirect URI's host, a warning if
   every redirect is `localhost`, the client-id host, this DSH and its canonical MCP URI, "full
   manager rights", and "one token, one agent". Its inputs: a **token** (required; the proof, no
   owner login, ticket or password, R-TOK-00), the agent's **fishball id** (required, typed,
   unique, 1.19), and an optional **name** (1.20).
4. The owner (or whoever holds the token) types the value of an entry they created by hand in the
   connector's settings and presses **Authorize**. The POST body carries it; it is never in a URL.
5. The connector verifies it in constant time against the enabled entries, under the same
   per-client failure limit as the token endpoint:
   - not valid → one uniform message on the page; the request stays pending;
   - valid but already paired → `already-paired` on the page, "create a new token", with the bound
     pair's name and last-seen time; nothing changes;
   - valid and unpaired → the typed id must be valid (`id-invalid`) and held by no other entry
     (`id-taken`); a non-empty name must pass §5.8 (`name-invalid`, `name-taken`); any refusal is
     shown on the page and binds nothing;
   - all pass → in one storage transaction, bind the entry to the typed id (client-id URL and
     redirect URI recorded), set the typed name or **none** (no default names, Q-NAME-1 B),
     mint a code (single use, 60 s, bound to client, redirect, challenge, resource and entry), and
     redirect with `code`, `state` (if sent) and `iss`.
6. The client checks `iss` and posts `grant_type=authorization_code`, `code`, `redirect_uri`,
   `code_verifier`, `client_id`, `resource` (public client, `token_endpoint_auth_method: none`) →
   `scope: "fishball"`, `expires_in: 3600`, in memory, audience-bound, **plus a refresh token**
   (Q-OA-2 A). Each `refresh_token` grant (same `client_id`, `resource` required) rotates it; a
   spent token presented again within **10 s** (K) by the same client for the same resource gets
   the identical successor (Q-S7B-1 B: the stock TS client refreshes concurrently); later reuse
   revokes the whole chain and answers `invalid_grant`; disable, delete or value change of the entry
   kills every refresh token. **Restart (Q-S7B-3 decided A):** refresh tokens are persisted as
   **digests only**, with chain id and entry generation, in the connector's storage, so a browser
   client refreshes after a restart; access tokens stay in memory; the 10 s window is not
   persisted; maximum chain lifetime K. Re-entering the bound token on the page stays
   `already-paired`.
7. **Cancel** → `error=access_denied`, `iss`, `state`; nothing bound. A pending request expires
   after 10 min; nothing survives a connector restart.
8. **Page and responses (S7b, decided per spec):** every authorization response carries `iss`;
   a bad `client_id` or `redirect_uri` is shown on the page, never redirected; the redirect after
   the form POST is `303`; the page sends a restrictive CSP and `Referrer-Policy: no-referrer`.
   On loopback `authorization_endpoint` uses the client's hostname with the approval port, and the
   approval listener rebuilds the issuer from its own `Host` with DSH's port; behind a tunnel both
   use the one tunnel hostname with path routing (S7b F4).
9. **CIMD fetch (S7b, decided per spec):** https only; private, loopback, link-local and
   unique-local addresses refused after resolution; no redirects; 5 KiB; errors not cached;
   `max-age` respected; secret-bearing documents refused.

**`dsh-mcp-client` (S7b F1; Q-S7B-2 decided, requirements 1.25):** DSH's own MCP client has no OAuth
support (no `authProvider`, no OAuth config). It is supported through static header access
(§5.5): a row with `headers: {Authorization: "Bearer <token value>", "Fishball-Agent-Id": "<id>"}`
pairs on its first request and keeps working until the entry is revoked. Fishball's own DSHs are
unaffected: `fishball-core` uses the SDK's `ClientCredentialsProvider` (R-OA-19).

**The page never creates an entry.** The entry is the one the owner made by hand; the page only
pairs it. A bound entry is an ordinary entry: listed in native settings with its pair state and
client-id URL (§5.7), disabled, re-enabled and deleted as in §5.3. Its value stays in the
credential store and in the owner's hands; the client only ever holds OAuth tokens. A replayed
code fails `invalid_grant` and revokes the tokens issued from it. The page is sent
`Cache-Control: no-store`, the token field is masked with autofill off, and nothing echoes the
value back.

**Public exposure** (R-REM-05): no tunnel feature. Behind the user's tunnel, `Host`/`Origin` are
checked against `--trusted-host`, and issuer, canonical URI and `authorization_endpoint` follow the
checked host, with `https` for any non-loopback host. The README explains that hosted clients
(for example Claude's hosted connectors, which call from Anthropic's servers) need such a tunnel,
for both listeners.

### 5.6 Token hygiene: the token is the security boundary (R-TOK-00)

- Entropy: every token is generated: 32 random bytes, base64url, `fbt_` prefix. There is no
  user-set value (requirements 1.27), so no length rule.
- Storage: the connector keeps a SHA-256 digest of each value and never the value (§5.1); a hosted
  value lives only in the child's own credential store (§5.4). Pairs and access tokens are stored by
  digest only.
  The value leaves the connector once, in the creation response to the reveal modal (§5.9). Nothing leaves in settings, logs, chat, tool results, test
  fixtures or error details.
- Comparison is constant-time. 401 responses are uniform. Failed attempts are counted per remote
  address for backoff, and the counter holds no token material.
- Revocation happens by disabling or deleting the entry, and takes effect on the next request
  for every derived access token. A value never changes; a lost one is replaced by delete plus
  create (§5.9).
- The Host and Origin checks, TLS rule, body limits and rate limits apply to the token endpoint,
  the MCP endpoint and the approval listener alike.
- "Keep it minimal" applies only to pairing and ids (§5.8), never to this section.

### 5.7 Where the user manages tokens

All of it is in DSH's native Plugins settings for `fishball-connector`: label, enable or
disable, delete and **create** (New token, on the connector's own settings page there, §5.9), choose the designated Fishball (`routing.fishballToken`), and see each entry's
pair state (and, for an entry created by browser approval, its client id URL) (bound id, name, last seen, connected). The
connector keeps only a digest of each value (§5.1). Embed-UI, the instance and every Fishball DSH
show only a token's label, never the value; the connector's one-time reveal modal (§5.9) is the
only place a value is ever shown.

### 5.8 Pairing and names (R-ID, R-NAME)

- **`pair({name?})`**, with a pair-only or full access token:
  - unbound entry: bind (entry → id) atomically, store `pairedAt`, set the given name if usable and
    free, else **none** (Q-NAME-1 B: no default names; the name check is inside the same
    transaction, so two concurrent pairings never hold one name), and return `{ok: true, paired:
    true, id, name}` (`name` may be `null`). The same access
    token becomes full at once;
  - bound entry: `{ok: false, code: 'already-paired', bound: {idMatches, boundId, name, pairedAt,
    lastSeenAt}, advice}`. A concurrent second binder gets the same;
  - unbound entry, id held by another entry → `{ok: false, code: 'id-taken'}`; nothing binds. The
    bind runs under a **unique index on the id** (Q-ID-1 decided A), so two concurrent pairings with
    one id on two tokens bind exactly one.
- **`set_name({name})`**, full token only. Names are **unique per connector** (Q23, decided):
  - normalise: trim, collapse inner whitespace, NFC;
  - compare by Unicode case folding;
  - another principal holding the name → `{ok: false, code: 'name-taken'}`, and the caller's
    name is unchanged.
  The check and the write are one transaction, under a unique index on the folded name.
- **`pair` with a clashing or invalid name** still binds, leaves the name empty and returns
  `name: null, nameAssigned: false, nameRefused` (R-NAME-06). Pairing never fails over a name.
- **No default names** (Q-NAME-1 B): a nameless principal is shown as `ID: <id>` everywhere, with the
  prefix in **bold** (R-NAME-08); chosen names, including ones starting with "ID:", are plain text.
  `set_name({name: null})` clears a name. `fishball-core`'s local `identity.name` defaults to "Fishball".
- **Successor** (R-HOST-09): delete the old entry and move its name (or its lack of one) to the
  new principal, in the one `retire` transaction (R-NAME-07).
- `lastSeenAt` is updated at most once a minute per pair, to bound writes.
- **`fishball-core`'s flow:**
  1. it reads `identity.id`, `identity.name` and its token;
  2. it gets an access token through `ClientCredentialsProvider` (client id = fishball id,
     `expectedIssuer` from the protected resource metadata);
  3. when its local "paired" record for this target and token reference is missing, it calls
     `pair`. On success it writes the record; if `nameAssigned` is false it shows the name clash
     (R-NAME-03). On `already-paired` it pauses and shows the R-ID-07 warning;
  4. otherwise it works normally, and calls `set_name` when the name changes.
- **Not hardened, by design.** The same token and the same id from two clients are one
  principal (R-ID-11). Pairing only prevents one token being spread over many agents. Events are
  delivered per pair, so one event wakes one agent.

### 5.9 One-time reveal, and what it changes (requirements 1.27, 1.28; W4 question 1, R1–R4)

The user's words (W4 question 1, 2026-11-15): "不允许改token值，一旦生成确定了连看都不能看，只有生成的时候弹出modal显示token并允许复制".
R2 (2026-11-15): "生成入口放在插件设置页内，这个不算UI，不带UI的意思是不影响dsh本身的UI".

**Who owns the modal: the connector (R2).** It lives on the connector's **own plugin settings
page**, which by the user's rule is not "UI": "no UI" means the connector does not change DSH's own
UI. R-ARCH-03 and R-ARCH-04 are reworded to match (requirements 1.28). So:
- the connector gets one `dsh.client` entry whose only registration is its settings page, in the
  Plugins page's **`plugins.row.config`** slot under the key `fishball-connector#fishball-connector`
  (`<package>#<row id>`; present on both SDKs, `dsh-client-ui-plugin-manager` `slot-contract.d.ts`).
  The page receives DSH's host-owned `form` (`state`, `mutate`), so every list edit is an ordinary
  settings save through DSH's settings service. It registers nothing else: no sidebar, no other
  slot, no global CSS;
- embed-UI's existing `plugins.bundle.config` card for the connector (its limits form, D24) is a
  different key and stays embed-UI's; it shows no token;
- with embed-UI uninstalled, the connector's settings page, New token and the modal still work.

**Where it appears.** The connector's row page in **Plugins**: the token list (label, switch,
delete, reorder; pair state read-only, R-ID-12), a label field and **New token**, and the duplicate
notice (below). The other connector settings (designated Fishball, approval port) are on the same
page.

**Flow.**
1. The owner types a label and presses **New token**.
2. The page POSTs `{label}` to the connector's own owner-only Fetch route (`connection.fetch`,
   behind DSH's Host and Origin fence; JSON body bound). The route serves JSON only, never HTML.
3. The route calls the registry's `create(label)`: §5.2 steps 1–4. It resolves
   `{entryKey, label, value}`. With `createHosted`, these are the **only** two calls that ever
   return a value, each once per entry.
4. The route answers `{ok: true, entryKey, label, value}` with `Cache-Control: no-store`, and logs
   nothing but the label.
5. The page opens a modal showing the value, with **Copy** (`navigator.clipboard.writeText`) and
   **Close**. The value lives only in that modal's state; closing it drops it. Nothing re-opens it.
6. The list refreshes and shows the new entry, without a value.
- A failure at step 3 answers a refusal code and shows no modal; nothing was created.
- If the answer is lost after step 3 (page closed, network), the entry exists but nobody saw its
  value: the owner deletes it and creates another. Nothing can show it again.
- Hosted entries never use this path and never show a modal (§5.4).

**Storage decision: digest only** (§5.1). The OAuth and client-credentials checks need only a
digest: the client-credentials grant and the approval page both call `TokenRegistry.match(value)`,
and the bearer verifier needs only `get(entryKey)` and the generation. By R1 there is no exception
any more: a hosted value lives only in the child's own credential store (§5.4), so the host DSH
holds no token value at all.

**Regenerate: none (R4 = the recommended option).** A lost or leaked value is replaced by
**delete** plus **New token**; there is no Replace control. That is a new principal: the old one's
sessions become unmanaged (R-ROUTE-06), its queued events are dropped, the designated role is
cleared, and its id and name are freed (R-ID-13), so the agent pairs again with the new token and
may take the same name.

**Duplicates (R3: "发现有重复的就拒绝服务并提示"), read narrowly.** A duplicate is two items with
the same identity: the same entry `key`, or two entries with the same value digest. The page cannot
make one, so one comes only from a settings document edited by hand or a store edited by hand.
- In a **save**: the save is refused and the previous list written back (the existing
  `restoreTokens` path), and the settings page shows a notice naming the labels. Code PROPOSED:
  `token-duplicate` (K1d `SETTINGS_REFUSAL`, replacing `ref-duplicate` and `value-duplicate`).
- Found **outside a save** (at start, or a store edited by hand): every entry involved refuses
  service (no token request, approval or MCP request succeeds for it) until it is fixed, and the
  page shows the same notice. This is the W2 "stays unusable" rule, with a notice added.
- An item with **no record** (added by hand, so no digest; R5 = the recommendation, requirements
  1.29) is treated like a duplicate: a save that adds one is refused with the same notice; one found
  at start is listed with the notice and can never authenticate.

**What this changes in existing code (W2 C-TOKENS, merged in `integrate/v3-w2`):**

| Area | Today | After |
| --- | --- | --- |
| `tokens/registry.js` | each sync reads every `ref` with `credentials.resolve`, fingerprints it, generates for an unconfigured `ref`, refuses `ref-duplicate` / value-duplicate, tracks `awaitSave` (C-TOKENS Q5 = B), announces `value-changed`; `refresh()` on `credentials/reference-updated` | sync reads no credential: entries come from their records; `create(label)` and `createHosted` generate, record the digest, add the item; the duplicate check above (R3); revocations only `disabled` / `deleted`; `refresh()`, the credential listener, `awaitsSave`, `introduced`, `valueGroups` and `refClashesOf` go. `match` compares SHA-256 digests in constant time over every entry, as now |
| `tokens/fingerprint.js` | HMAC key in a connector-owned credential record (C-TOKENS Q2 = A) | removed: a 256-bit random value needs no key (§5.1) |
| `tokens/store.js` | record `{entryKey, ref, label, enabled, generation, generated, fingerprint, keyId, awaitSave, removed}` | `{entryKey, label, enabled, generation, digest, hosted, removed}` (the `instanceId` stays in C-SUCCEED's `hosted/` storage); `TOKEN_STORE.version` 2 |
| `tokens/constants.js`, `index.js` | `REVOCATION.valueChanged`, `SYNC_REASON.credentials`, `REF_PATTERN`, `findRefDuplicates`, value-duplicate logs | removed (no credential reference is left on the connector's side); a `findDuplicates` (key or digest) replaces `findRefDuplicates` |
| Settings schema (C-WIRE, W4b) | planned items `{label, enabled, ref}` with `role('credential-ref')` | items `{label, enabled, key}`; no credential reference |
| Connector package (R-ARCH-03 reworded, R2) | no `dsh.client` (R-EMBED, design §9.1) | one `dsh.client` entry, the settings page only (`plugins.row.config`, its own row key), and one owner-only JSON Fetch route for `create`; PLAT-EP-03 row 1 and HAND-EP-01 row 3 are reworded to allow exactly these |
| Instance (I-HOST) | resolves the hosted value from the host's store at every child start and sends it on `mcp-credential` | sends it **once**, at the child's first start, from `createHosted`'s answer; asks the child whether a credential is stored; the child receiver stores it in the child's `ctx.credentials`; the host stores nothing (R1) |
| K1 `ENTRY_STATUS` | `ok`, `token-too-short`, `token-unconfigured` | `ok` only. The field stays, so `mcp/oauth/bearer-verifier.js` and `mcp/oauth-web/issue.js` (`status === ok`) are unchanged |
| K1 `SETTINGS_REFUSAL` | `ref-duplicate`, `value-duplicate` | `token-duplicate` (PROPOSED, R3); plus R5's code if R5 is answered "refuse" |
| K1 `TOKEN_VALUE.minChars`, `isTokenLongEnough` | 32 code points | withdrawn |
| K1 `RevocationKind`, `TokenEntry` | `value-changed`; `ref`, `generated` | `disabled`, `deleted`; `hosted: boolean` replaces `ref` and `generated` (no caller outside `tokens/` reads them) |
| K3 `host-services/tokens.d.ts` | `createHosted → {ref, entryKey, label}` (value resolved from the host store), `entryState`, `retire`; `disabled` also means "changed or unset its value" | `createHosted → {entryKey, label, value}`, once, to the instance (R1); `create(label)` is connector-internal (its own route), not a K3 member; `credentials-unwritable` becomes the instance's, reported when the child cannot store the value; `disabled` means switched off only |
| Callers: `mcp/oauth/*`, `mcp/oauth-web/*`, `pairs/`, `routing/`, `handover/` | `match`, `get`, `list`, `onRevoked` | unchanged; C-OAUTH's `followRevocations` already treats every kind alike |

**Requirements and cases withdrawn or changed** (IDs kept, as for R-OA-10):
- Requirements changed: R-FB-03 (1.29, R7), R-HOST-10 (1.29, R6), R-ARCH-03, R-ARCH-04 (1.28, R2), R-TOK-03, R-TOK-04, R-TOK-08, R-TOK-09,
  R-OA-06, R-CON-10, R-HOST-05 (where the hosted value lives, R1; remote target), R-HOST-09 (no
  value to unset), R-UI-03; new R-TOK-11. Withdrawn parts: TQ-4's 32-character minimum and
  `token-too-short`; `token-unconfigured`; `ref-duplicate`; value-duplicate (C-TOKENS question 4 = A);
  the unset-value wait (C-TOKENS question 5 = B); the HMAC key (C-TOKENS question 2 = A, superseded);
  "changed value" revocations (W4 question 1, which this answer dissolves).
- Cases withdrawn: AUTH-UC-01 A1, A2, E1, E2, E3; AUTH-UC-06 A2, A3; AUTH-EP-04 rows 2–7, 7a;
  AUTH-BVA-03 rows 1–6; AUTH-DT-04 row 12; AUTH-DT-05 rows 3, 4; AUTH-DT-08 rule 4; AUTH-ST-01 row
  10 and C-TOKENS' rows 10a–10m.
- Cases changed: AUTH-UC-01 (main: create and reveal; post: the one response that carries the
  value); AUTH-EP-04 rows 1, 8; AUTH-DT-05 rows 1, 2 (a hosted value only); AUTH-ST-01 (state
  Unconfigured removed; row 1 becomes "none → New token → Ready"); AUTH-ST-02 row 4, AUTH-ST-05
  rows 6, 12b, 12d, AUTH-EP-02 row 5 and AUTH-ST-06 row 15: the "value changed" trigger goes;
  HOST-UC-02 precondition (value copied from the modal); the K1 code-freeze row (AUTH-UC-02 K);
  HOST-EP-02 rows 1–3 (R1: present in the **child's** credential store only; absent from the host
  credential store, child home files other than that store, overlays and lifecycle files) and row 7
  (on `mcp-credential` at the first start only); HOST-UC-01 main 2–3 (C returns the value once, to I; I passes it in once and the child stores it); PLAT-EP-03 row 1 and HAND-EP-01 row 3 (the connector's settings page and its one route).
- Cases to author (new IDs): **AUTH-UC-15** create a token and copy it once; **AUTH-DT-13** what a
  save of the tokens list does (duplicates refused with a notice, R3; R5's rule); **AUTH-ST-08** the
  reveal modal (open → copied / closed, never re-shown); **HOST-ST-03** the hosted value's
  lifecycle (first start → stored in the child; host restart, child restart, reinstall, uninstall,
  delete then Retry → notice, no token, R6 = B); **REM-ST-02** the saved copy at the first connection
  (standalone and hosted remote, R7).

**Open product questions (R8–R9, raised 2026-11-15; recommendations in brackets).** R1–R7 are
answered (requirements 1.28, 1.29).
- **R8. Where the user puts a new hosted token after R6's notice.** The child takes a value only
  from the instance, and DSH has no secret field for plugins. Put it under the instance's
  `target.tokenRef` on the host, so that the next Retry passes it in once (R7's rule) and the child
  replaces its dead value; or add a paste field to the hosted settings inside the child?
  *[The instance's `target.tokenRef`: it reuses the remote-target path and adds no UI.]*
- **R9. When the saved copy is replaced, and what "first connection" means.** Save only after the
  target accepts the token (so a mistyped one is not kept), or at the first attempt? And after a
  changed target URL, or a saved copy the target refuses (`token-refused`, `token-revoked`)?
  *[Save after the first accepted token request; a changed target origin is a new first
  connection; a refused copy is replaced once the user's reference holds a different value.]*

## 5a. The Fishball plugin set in any DSH

### 5a.1 Composition

Each member is a bundle (`dsh.bundle.patch` inserting one row), installed in the Fishball DSH's
profile. Their `engines.dsh` is `>=0.2.1-rc.5`. They take their peer DSH packages from the
Fishball DSH's own installation, like any plugin, and declare no peer on `fishball-instance` or
`fishball-connector`.

- `fishball-core` provides `fishballInstance` (X1–X19) from its app row once its own setup is
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
  `ui-sidebar-terminal`, `terminal-controller`) and the `fishball-instance` row (no nested hosted
  Fishball);
- **agent presets (Q-S6-2 decided B, amended; requirements 1.24):** `disabled: true` on every
  DSH-shipped agent preset row (`preset-standard`, `preset-ptc`, `preset-cordis`,
  `preset-minimal` on both SDKs; the list is core's constant per SDK) — **switched off, not
  deleted** — and core's own `preset-fishball` inserted with `agent-preset-registry.default:
  fishball`. The session-creating tools live inside each shipped preset's `config.plugins`, which
  no patch can reach (S6 §3.2), so switching the presets off is how they leave the model.
  `fishball-watchdog` contributes its own `preset-watchdog` for its side sessions (§7);
- the read-only permission preset (sandbox read-only, approval policy) with the private Skills
  root exception;
- its client module: the A-lite page, shortcut remapping, the recommended tab and the slim
  settings panel.

A bundle patch may target any **root or group** row that an **earlier** layer or bundle has
inserted (`PatchOptions {id, disabled, config, …}`, `cordis-plugin-include`, both SDKs; S6). It
cannot reach rows inside an agent preset's `config.plugins`, and a patch on a row not yet inserted
is **skipped** with only a debug-level warning. So core's bundle must come **last** (Q-S6-1
decided B, R-FB-12; spike V3-S6 round 2 `7c2230e`): the instance writes it last when it builds a hosted child; in standalone
mode core, in its own row's `apply`, moves itself to the end of `dsh.profile.bundles` with
`dsh-app-boot`'s `readProfileManifest` / `writeProfileBundles` under `dsh-atomic-write`'s
`withFileLock` on the profile `package.json`. With HMR on, DSH recomposes live within seconds;
with HMR off, the guard holds from the next start. Until it holds, core reports
`guards-overridden`. **Order matters a second time:** DSH composes bundle patches first, then
the profile's own patch file, then `$DSH_HOME/cordis.patch.yml`, then launch overlays
(`readProfilePatches`: `dsh-app-boot/lib/index.js` rc.5 :1127–1132, rc.1 :1908–1913). So in a
Fishball DSH, hosted or standalone, the owner's own patches win over core's: that is the accepted
"can override" of Q20 (decided). The instance's launch overlays carry no guard rows (§6.2), so the hosted
child behaves exactly like a standalone DSH here.

**Override report (Q20, decided).** At app ready, on every `settings/document-updated` and on every
`plugin-manager/changed` (S6), and never before app ready, core reads the effective composition
and policy of its own DSH through public services only: `ctx.loader.entries()` (`disabled`),
`sandboxPolicy.defaultMode`, `ctx.approval.config.policy` (read directly, one test per SDK;
requirements 1.24 item 4), `permissionPresets` and `agentPresets` (default `fishball`, shipped
presets off). It compares them with its own patch's intended values. A difference
sets status `guards-overridden` with the list of overridden guards; a later check that finds them
restored clears it. It also adds one line to
the Fishball page's status strip and one notice to Fishball's manager context, so Fishball
knows its guarantees are weaker. Core keeps running and changes nothing back.

**Spike V3-S6 (`86800d2` + round 2 `7c2230e`, PASS on both SDKs):** preflight and plugin manager
accept a bundle patch that disables another bundle's rows; the public API for the override report
is the list above; the reorder, the switched-off shipped presets with `fishball` and `watchdog`
offered, the read-only manager (`read`, `read_image`, `working_directory`) and its resume in a new
process all hold. On resume core checks the manager's **tool list**, not its preset name, because
rc.5 has no `presetForSession` ([impl], R-FB-13).

### 5a.3 Standalone setup, step by step

1. Install the four tarballs (core is required; the three features are optional) in the DSH with DSH's native "add plugin", then restart that DSH.
2. In the **target** DSH's connector settings, press New token (§5.2) and copy the value from
   the reveal modal (§5.9); it is never shown again.
3. Put that value in the standalone DSH's credential store, under the reference named in
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
- Kept on the wire: `admin` (now served by `fishball-core` in the child), `instance-settings`
  (served by the instance's injected settings sections, R-HOST-11) and `provider-sync` (hosted model
  sync).
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
- the admission key for `fishball-core`'s ticket route (embed-UI's frame), and the target URL;

It writes **no** guard rows and forces no plugin on. The guards come only from `fishball-core`'s
own patch, exactly as in a standalone DSH, so the child's owner can override them and core
reports `guards-overridden` (§5a.2). The child's native Plugins page is unmodified. V2's
Q-K = B Remove-hiding is not revived. A removed plugin is re-placed at the next start, off if it
was off (§8.1). If the owner disables `fishball-core`, the child still starts and the locator
reports `fishball-off` (R-FB-10).

### 6.3 The MCP link (`fishball-core`, both modes)

- A client row in `fishball-core` uses its packaged `@modelcontextprotocol/client` 2.x (§9.1)
  with `versionNegotiation: {mode: {pin: '2026-07-28'}}` (modern-only, Q12). It keeps one
  logical link:
  - `server/discover`;
  - list tools;
  - open the `subscriptions/listen` stream on `fishball://events` (the one `fishball-events`
    resource, §3.3);
  - reconnect with bounded backoff;
  - poll once on every (re)connect.
- **The credentials:**
  - hosted mode: the token arrives once over the lifecycle wire and the child stores it in its own
    credential store (§5.4, R1, R7);
  - standalone mode: at the first connection `fishball-core` reads it once under `target.tokenRef`
    and saves it into its own local credential record (§5.4, R7);
  - either way core then resolves its saved copy per connection (`ctx.credentials.resolve`), as
    DSH's own providers do;
  - either way it is the OAuth client secret, with the fishball id as the client id (§5.5). It is
    sent only to the target's token endpoint, pinned by `expectedIssuer`, and only over `https:`
    for a non-loopback target. MCP requests carry only the access token. Credentials are never
    forwarded on a redirect.
- **No raw `mcp__…` tools reach the model.** Fishball's manager tools stay the X12 bridge façade
  (`bridge(pluginId, operations)`), under the local scope, the X19 send gate and the image gates.
  All contributed tools are re-exposed through the same façade, unfiltered (Q17, decided). The
  stock `dsh-mcp-client` is not mounted for the target.
- An answer attempted while the link is down fails `disconnected`. The offer waits at the
  connector (R-REM-04).

### 6.4 Interception service and wake (R-INT, R-EVT-03; Q30 decided)

`fishball-core` holds the pair's **one** `fishball-events` subscription and mailbox. Instead of
a fixed router, core provides an **interception service** that any plugin in the Fishball DSH
can register with. Only events nobody intercepts reach the Fishball agent and can start an LLM
turn.

```ts
fishballInstance.events.intercept(
  { pluginId, types: EventType[], filter?: (e) => boolean, priority?: number },   // priority default 0
  onEvent: (e, ctl) => Promise<void>,
) → dispose
// await ctl.accept()                                // FIRST: core makes its acceptance record durable (R-INT-01/08)
// await ctl.commit(send)                            // fence around an answer sent through core's link (R-INT-04)
// ctl.release(e, { toFishball: true })              // hand the event back (R-INT-05)
// core keeps the record open until onEvent settles (S2-Q1 / Q-S3-2 decided B)
```

```text
listen hint / reconnect ─► inbox_poll ─► acceptance ledger (durable, Fishball DSH storage)
   ─► dispatch (no LLM):
        candidates = registrations with e.type ∈ types AND filter(e) == true   (a throwing filter = false)
        none            → Fishball agent: X9 pipeline (fold batcher) ─► core's delivery list
                          ─► Agent.followup inside runMaintenance, only when the agent is fully idle
        one or more     → the highest priority; ties → the earliest registration (R-INT-03)
          ctl.accept() resolves     → record open (durable) → ack
            handler settles         → record closed; no Fishball turn; log only (R-INT-09)
            commit begun, then fail → stays with the interceptor (committed or fenced)
          throws/rejects, plugin off/down/not ready, disposed:
            not accepted, or accepted-undecided → Fishball agent, once (R-INT-04)
          restart with an open record → same plugin again (dedupe by eventId), else Fishball once
          ctl.release(toFishball)   → Fishball agent (R-INT-05)
   ─► inbox_ack after the receiving side's durable acceptance (R-INT-08)
```

- **Watchdog's registrations** (R-INT-07; Q13 decided; redefined by requirements 1.14),
  priority 0:
  - `types: ['permission']`, `filter: e => supervision.isActive(e.sourceSessionId)` (healthy X14
    state and a live X15 claim);
  - `types: ['settlement', 'retirement']`, `filter: e => watchdog.handled(e.correlationId)`
    (offers it held or escalated to the user).
  Everything else (every `turn-finished`, mid-work or idle; `state`; questions, plan reviews,
  messages, asks, hand-over and take-back, notices, contributor events, unsupervised sessions)
  matches no Watchdog registration and reaches Fishball. Watchdog's patrol is not an
  interception; it is driven by its own timer (§7.1).
- **Other plugins** may register too (fold-notify, the board, third-party child plugins), for
  example for `contributed:<ns>.*` types. The same rules apply. A registration with the same
  types and priority as another is accepted with one logged warning (R-INT-03).
- **Exactly once inside the Fishball DSH:** the acceptance ledger is **core's** (S2-Q1 / Q-S3-2
  decided B): it records which side took the event (`interceptor:<pluginId>` or `fishball`), and
  for an interceptor whether its record is open, its commit begun, or closed. A fallback
  re-dispatches only an event that was not accepted, or accepted and undecided with no commit
  begun, so an event is never lost and never committed twice (R-INT-04).
- **Out of context (R-INT-09, the user's rule "如果插件接手了一件事，且没有传导给Agent，那就没有记录，记录只留在后台的log里，不会进上下文"):**
  an event an interceptor handles alone leaves no trace in any agent's context; core writes its
  acceptance, commit and outcome to the background log only. Only `release`, a waking
  `manager.notify` or the non-waking settlement note reach Fishball.
- Acceptance is durable before the ack, and the ack follows acceptance. A replay with a known
  `eventId` is dropped. This is MCP-S2's reconciliation design.
- **Delivery to the agent (spike V3-S2 `a499141`, PARTIAL).** Core never calls `Agent.followup` while the agent is busy:
  calling it during a turn and then stopping cleanly loses the event (the one case the literal
  earlier design failed). Instead core keeps each event it accepted for the Fishball agent in its
  **own durable delivery list**, and hands the head of the list to `Agent.followup` from inside
  `runMaintenance`, only when the agent is **fully idle** (no turn running, nothing queued). A busy
  Fishball therefore receives the event as its **next** turn, never inside the running one. An
  entry leaves the list only once the followup is admitted. **After admission, a crash does not
  re-wake** (S2-Q2 decided A): the interrupted turn was the one wake, DSH shows its own crash notice,
  and the event is neither re-delivered nor followed by a notice turn. Startup reconciliation
  classifies by stable message id in the durable log. **A user's Stop or inbox removal before
  admission discards the event** (S2-Q3 decided A): acked, never retried; offers inside it stay
  live at the connector (R-CON-05). S2-Q1 is decided (§6.4 `ctl.accept()`). Nothing in this design claims exactly-once model
  execution.
- When Watchdog fails (X14 `fail()`), its filter turns false at once and it disposes its
  registration. In-flight events it has not accepted fall back to Fishball (R-WD-07, R-INT-04).
- **External agents** have none of this. Their subscription receives the typed events
  unchanged (R-EVS-04).
- The custom first-party push of decision 1a is retired (Q11, decided). A standalone Fishball
  on another machine could not use it anyway.

### 6.5 Remote targets (R-FB-05, R-REM)

- The target is any connector endpoint URL. The same tool set applies, so a remote target needs
  no extra code path. Images use the chunked `attachment_put` / `attachment_read`.
- Hints may drop, and polls recover them. Offers wait; nothing is settled by time. Losing the link
  never stops remote sessions.
- In hosted mode the embed frame stays local; only the child's MCP link is remote.

## 7. Watchdog

### 7.0 What Watchdog is (R-WD-00; Q10 decided, revised by requirements 1.8)

Watchdog is Fishball's helper, like a subagent of Fishball. At the connector it does not exist:
everything it does goes out as Fishball's principal, through `fishball-core`'s MCP link. It has
no token, subscription, mailbox or lane of its own.

### 7.1 How events reach it (R-WD-02, R-INT-07)

1. On `fishball-core`'s X14 `ready()`, Watchdog registers with core's interception service
   (§6.4) for `permission` requests of the sessions it supervises while healthy, and for
   `settlement` / `retirement` of offers it held or escalated. That is all it intercepts
   (requirements 1.14). This replaces the V2 X9 `inbox.claim` and the earlier "router claim";
   there is no new transport extension point, and X20 of earlier drafts is dropped.
2. Core hands it the matching events without a Fishball LLM turn.
3. Watchdog calls `await ctl.accept()` first; core's record is the durable acceptance, and core
   acks only after it (R-INT-08). Watchdog's answers go through `ctl.commit(send)`. A decision it
   makes alone (allow, justified reject) leaves no trace in Fishball's context; it is logged only
   (R-INT-09).
4. **Patrol (R-WD-14):** for each supervised session, Watchdog's own timer fires once every
   `minCheckIntervalSeconds`. It then reads the session through core's link: `sessions_list`
   for running and pending state, and `session_read` from its last patrol watermark, bounded
   by its read limits. It needs no `turn-finished` or `state` events, which all go to Fishball.
5. One Watchdog side session per watched session (U8), running Watchdog's own `watchdog` agent
   preset (contributed by `fishball-watchdog`; R-WD-16), handles that session's permission
   requests and patrols, on Watchdog's own model settings.
6. An escalation **to Fishball** is `ctl.release(e, {toFishball: true})` (R-INT-05). An
   escalation **to the user** commits `escalate` at the connector (§7.2).
7. **No on-demand runs (Q33 decided).** Fishball has no `watchdog_check_now`. `watchdog_refine`
   only stores a new brief or criteria for a session, which Watchdog reads at its next permission
   judgement or patrol. It starts no turn and moves no timer (R-WD-15).

### 7.2 Requests to Fishball inside the Fishball DSH (R-WD-08)

Watchdog never talks to Fishball over MCP. It uses the Fishball DSH's in-session communication:
- `manager.notify` (X10) for "watchdog is down", reports and abnormalities: one waking notice
  turn, durably deduped;
- an **escalation to Fishball** (only an item that is not high-risk and that Watchdog cannot
  decide) **re-routes** the offer to the Fishball branch. It is still the same live offer at the
  connector, with the same offer id, because the principal is the same. Watchdog adds one
  `manager.notify` carrying its reasoning, so Fishball's turn has the context;
- an **escalation to the user** (any other high-risk item, Q13 decided) is committed through
  core's link as `approval_answer` with decision `escalate`. The connector shows the user's card in
  that session, with no time limit and no Fishball turn. When the user settles it, the
  `settlement` event is intercepted by Watchdog (its second registration), and Watchdog gives
  Fishball a non-waking `manager.notify` (`wake: false`) with the outcome for its next turn;
- answers Watchdog commits (allow, justified reject) go out through core's link as Fishball's
  principal. The connector's first-commit rule (OQ-14) still settles races with the user.

### 7.3 Behaviour (carried from T0 and the user's rules)

- **Activation (requirements 1.14, R-WD-03):** exactly two cases: a supervised session's
  permission request, and Watchdog's own patrol timer, once every `minCheckIntervalSeconds` per
  session (default 1740, inclusive 60–86400). There is one timer per watched session, for patrol
  only. Permission handling is never delayed by it. Nothing else starts a Watchdog run:
  there is no `check_now`, and a refine only updates the brief (Q33 decided, R-WD-15). No other
  timers exist (R-WD-05).
- **Decision table:**

  | Request | Watchdog decision |
  | --- | --- |
  | in scope, low risk | allow |
  | beyond the task **and** dangerous | reject, with a justification |
  | other high risk | `escalate` to the user's card, no Fishball turn (Q13, decided) |
  | not high-risk, but Watchdog cannot decide | re-route to Fishball (§7.2) |
  | question / plan review | never reaches Watchdog |

- **Failure = off** (R-WD-07):
  - The X14 `fail()` runs synchronously: it disposes its interception registration; items it was
    offered or accepted but had not decided go to Fishball once; an answer whose `commit` had begun
    stays Watchdog's (committed or fenced, never both, R-INT-04); stale callbacks are fenced.
  - It also sends one `manager.notify` "watchdog is down" per down episode.
  - Watchdog has no stream of its own. Loss of core's link is core's status, not a Watchdog
    failure; events simply wait at the connector until the link is back.
  - When a hosted child cannot start (R-BND-03), the instance keeps the pending notice in its
    lifecycle state and delivers it on the next successful start (R-HOST-08). In a standalone
    DSH, `fishball-core` checks at app ready whether an enabled `fishball-watchdog` has
    registered, and sends the notice if not (R-FB-07).
- **Pause = stop the session first** (R-WD-10). Models follow DSH native session timing; Save
  does no model lookup.
- **If the link to the connector is down,** neither Watchdog nor Fishball can answer. Offers wait
  at the connector (R-REM-04). After reconnect core dispatches again from the mailbox, and an
  answer from before the outage that never committed is not replayed.

## 8. Placement of the plugin set

### 8.1 Hosted mode (R-BND)

The design is the bundled-placement note (`f71717e`), options **P3 + 3a**, now applied to the
whole set:
- Sources live under `packages/instance/bundled/{core,board,fold-notify,watchdog,hosted-settings}/` and are
  listed in the instance's `files`. In the host DSH they are inert data: not in its resolution,
  not bundles there.
- At every child start, inside `initializeProfile` and before `loadProfileDirectory`, each one is
  copied to `<child>/vendor/<name>` and `<child>/node_modules/<name>` (temp + rename), with
  `dependencies[name] = file:./vendor/<name>`.
- **Order (Q-S6-1 B, R-FB-12):** `dsh.profile.bundles` lists `fishball-instance` (if present) and
  the three features and `fishball-hosted-settings` **before** `fishball-core`; the instance writes
  that order at every start.
- Each plugin goes into `dsh.profile.bundles` only when the instance's `bundled: [...]` record
  lacks them, so a disable survives. A feature plugin deleted while off is copied back, and the
  record still has it, so it stays **off** (3a; this answers placement Q2).
- `fishball-core` follows the same first-placement rule as the features: on at first placement;
  a later disable survives; deleted while off is re-placed off (R-BND-02, R-FB-10).
- An enabled member skipped by `loadProfileDirectory` (incompatible `engines.dsh`, unresolvable)
  fails the start with `PROFILE_INCOMPATIBLE`, naming it (answers placement Q3). The old
  per-start exemption and `BUNDLED_PLUGIN_UNAVAILABLE` are dropped.
- **`fishball-hosted-settings`** (R-HOST-11, TQ-R4 decided B) is placed by the same code and the
  same record as the four set members, from `bundled/hosted-settings/`, with the same rules: on at
  first placement, a disable survives, deleted while off is re-placed off, an enabled incompatible
  copy fails the start naming it. It is not a set member: core's guards do not target it, its
  `guards-overridden` check ignores it, and a standalone DSH never has it.
- A native remove of any of the four plugins is re-placed at the next start: on if it was on, off
  if it was off.

### 8.2 Standalone mode

The user installs the set with DSH's native plugin management. DSH's own rules apply: an
incompatible bundle is skipped at boot, not fatal. Native install appends in install order, so core
moves itself last at its first start; the guard holds at once with HMR, or after one restart
(R-FB-12). So:
- `fishball-core` reports which expected members are missing or skipped in its status
  (`plugin-set-incomplete`, naming them);
- a skipped or failed Watchdog produces one "watchdog is down" notice per start (R-FB-07);
- there is no placement record: the user's native switches are the truth, as in hosted mode.

### 8.3 How each feature fits V3

| Plugin | Uses | V3 change |
| --- | --- | --- |
| board | X1, X2 (tools `board_*` + `board_search`, dynamic context) | none to its domain. Archive forever, 30-day visibility. Export offer: the instance's uninstall in hosted mode; in standalone mode, a `board_export` manager tool and a note in the README, because DSH's native remove offers no hook |
| fold-notify | X2, X9 batcher, X8 attention | X8 now calls embed-UI's contributed `embed-ui.attention.signal` over the MCP link. If it is absent, the call gets `unsupported-operation` (D3 rule). The batcher sits on the Fishball branch, after interception (§6.4) |
| watchdog | X1, X2, X9 (now the interception service), X10, X11, X12, X13, X14, X15, X16, X19 | an interceptor in core for supervised `permission` only (§6.4, §7); patrol by its own timer; no `check_now`, and refine is a data update (R-WD-15) |

## 9. Packaging and compatibility

### 9.1 Manifests (proposed)

| Package | Change |
| --- | --- |
| `fishball-connector` | Replace the V2 `dsh.client` with one that registers only its settings page (§5.9; requirements 1.28); drop `client.js`'s V2 parts, `client.records.js`, `assets`, and the `./client`, `./contract` and `./records` exports. Add `./mcp-schema` (tool and event schemas, limits, vocabularies) and `./tools` (contribution types, `apiVersion`, the shared result-code vocabulary, a `defineTool` helper that validates at the call site; data and types only). Add a runtime `dependencies` entry for the MCP server SDK and its Node adapter, installed inside the connector's folder, never as a DSH peer. Keep `engines.dsh >=0.2.1-rc.5`. |
| `fishball-instance` | Depend on `fishball-shared` (bundled); never on `fishball-core` (R-BND-01 strict). Drop the `fishball-connector` peer, the main-side `client.js`, `child-web/` and the `LITE` guard overlays. Add `bundled/hosted-settings/` (the `fishball-hosted-settings` bundle, R-HOST-11; instance-owned source, a plain bundle with one row and a `dsh.client` entry, registering into core's settings-section extension point). Keep the host row, the native runtime (lifecycle, launch configuration, placement), `uninstall.js` and hosted model sync. Add `bundled/` (the four set members) to `files`. |
| `fishball-core` (new, from `packages/instance/src/slim/child/**`, `src/persona.js`, the private Skills tool, `native-child.js`'s app pieces, and, as its `ui/` component, `packages/instance/child-web/**` and the `LITE` overlay rows) | Bundle row(s) for the Fishball DSH; its `cordis.patch.yml` also carries the guard rows; `dsh.client` (platform web) for the `fishball-ui` page, recommended tab and slim settings. Runtime dependency on `fishball-shared` (bundled), `@modelcontextprotocol/client` 2.x and `fishball-connector/mcp-schema`, vendored as a copy so a standalone install needs nothing from the connector package at runtime. |
| `fishball-shared` (new, `packages/shared`; TQ-R3 and TQ-R5 decided, R-ARCH-08) | A **library**, not a plugin: no `dsh` field, no row, no client. Holds only modules **more than one** V3 package uses; first contents: the child `admin` constants, the provider-sync wire codec, the file helpers core and the instance share. Imports nothing from any other V3 package. **Any** V3 package may depend on it (connector, embed-UI, core, instance, feature plugins, `fishball-hosted-settings`); each that does lists it in `dependencies` **and** `bundleDependencies`, so its release tarball carries it and nothing is fetched from a registry. Loading it never loads a module of the Fishball set (R-BND-01). |
| `fishball-board`, `fishball-fold-notify`, `fishball-watchdog` | Change the peer from `fishball-instance` to nothing: they find `fishball-core` through the optional `fishballInstance?` inject. |
| `fishball-embed-ui` (new; S4-Q3 decided B) | Host row + `dsh.client` (platform web) with the inject lists of today's two main-DSH clients combined. Optional peers `fishball-instance` and `fishball-connector` (the latter for `./tools` types only; embed-UI never imports connector code). Owns the moved locale strings. |

Release numbers stay release bookkeeping. The V3 connector, instance, embed-UI, plugin set and
`fishball-shared` are one coordinated breaking release, versioned together; `fishball-shared` is
released only inside the tarballs of the packages that depend on it (no registry, requirements §5):
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
| Bundle patch rows `{id, disabled, config, insert}` (`cordis-plugin-include` `PatchOptions`); applied in bundle order, a patch on a row not yet inserted is skipped with a debug-level warning (S6) | present | present (`patch.d.ts`) | `fishball-core` guard rows (§5a.2) |
| Patch composition order: bundles → profile patch file → home patch → launch overlays | `dsh-app-boot` `readProfilePatches` :1127–1132 | :1908–1913 | Q20 (decided): core's guards are overridable in both modes; the instance's overlays carry no guards |
| Plugin-manager slots `plugins.bundle.config`, `plugins.row.config`, `plugins.tab` | present | present | embed-UI card; core's recommended tab |
| `Agent.followup` | `dsh-agent-loop` | present (different line) | `fishball-core` wake |
| Shortcut, origin and A-lite findings | V2 final scope §4.3 | same | `fishball-core` (`fishball-ui`) |
| Cordis service provide / optional `ctx.inject([...], cb)` sub-scope, `ctx.effect` disposers, `fiber.name` | cordis 4.0.5 | cordis 4.1.0, `Service` and `Fiber` effect/name types the same | contribution service (§13.7), `fishballInstance`, `fishballChild` |

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
   - the intake ledger's pending V2 items are kept in a **holding queue**, with their ids as
     `eventId`. They move into the designated Fishball principal's mailbox as soon as one exists
     (normally when the upgraded instance's hosted entry pairs in step 3), or into the mailbox of
     the first principal the user designates;
   - V2 attached-instance state is discarded (there are no live offers across a restart anyway,
     contract §5.1).
3. **Upgrade the instance.**
   - On its first V3 start with a connector in the same DSH, the instance asks the connector for
     a new "Fishball (hosted)" token; the child authenticates and calls `pair` (R-HOST-05).
   - The child profile, home, Skills and child settings are kept. **Earlier sessions are not
     migrated** (requirements 1.24: nobody installed V2): each leftover is archived through
     `workspaceController.archiveSession` (DSH has no public delete), with no crash, and stays
     archived after a restart; the first V3 start begins a new manager session under the
     `fishball` preset.
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
| V3-S1 | Can a packaged MCP server SDK (2.x), configured **modern-only (2026-07-28)**, serve on a raw `webServer` route, with bearer checking before dispatch, Origin/header validation, OAuth resource metadata and listen streams, on both hosts? | Both stock-host clients (2.2.0, `pin: '2026-07-28'`) discover, list, call, subscribe and get hints; a 2025-era `initialize` gets the version refusal; GET/DELETE get 405; a 401 path never reaches the SDK |
| V3-S2 | **Done `a499141` (PARTIAL):** delivery list + `Agent.followup` in `runMaintenance` when fully idle; S2-Q1 decided (core-owned acceptance + commit fence, with Q-S3-2); S2-Q2 decided A (no re-wake after a mid-turn crash); S2-Q3 decided A (the user's Stop discards an unadmitted event). MCP-S2 continuation: a durable child acceptance ledger plus `Agent.followup` gives one routed entry and one user-visible wake after a lost ack, a child crash and reconnect | the open TODO from MCP-S2 §11.5 closes; no duplicate wake |
| V3-S3 | **Done `b4dca86` (PASS):** one serial pair/name registry; succession as one registry write with idempotent offer re-issue; the user's answer never `expired` by succession; `ctl.accept()` / `ctl.commit(send)` needed (Q-S3-1, Q-S3-2 pending; Q-S3-3 decided: 0.2.2-rc.1 baseline). Interception and pairing (Watchdog intercepts only supervised `permission` and its own `settlement`/`retirement`; every `turn-finished`/`state` reaches Fishball; a refine starts no run): core's interception service hands events to the right interceptor (priority, ties, filters) without an LLM turn, and falls back to Fishball on throw/down/dispose without loss or double handling; `pair` races, `already-paired` results; OQ-14 races between user, Watchdog and Fishball answers on one principal | race matrix; no stale commit; one event wakes one agent |
| V3-S4 | Embed-UI as a separate package: can the moved connector client still register its sidebar/slot contributions (the same injects) and frame the PG-ORIGIN child origin, without the connector client present? | both hosts; main shortcuts untouched |
| V3-S5 | **Done `8f2788e` (PASS):** namespace from the caller's loader-entry package (`contributor-unidentified` otherwise); quarantine on the contributor's activation; `_meta` contributor field; owner-fiber check on list/call; `.` kept; Q5 decided A (namespace is attribution only). Contribution service (§13): caller identity from the injecting fiber; auto-withdrawal of tools **and** pending events on contributor disable/unload/HMR; quarantine lifted only by a new fiber; `tools/list_changed` delivery on 2026-07-28 listen streams; event limits and recipient routing; containment of throw/hang/oversize, on both hosts | independent cases across register/dispose/reload/quarantine states |
| V3-S6 | **Done `86800d2` + `7c2230e` (PASS):** composition, client, override API, reorder (one restart with HMR off; the instance writes core last), shipped presets off with `fishball` / `watchdog` offered, read-only manager resumed; discard = archive; tool-list check on resume; Q-S6-3 impl (`approval.config.policy`), Q-S6-4 (rc.1 = 0.2.2). `fishball-core` as a plain bundle carrying its `fishball-ui` component: one bundle that inserts its own rows, disables other bundles' rows and sets the read-only preset in an ordinary DSH on both SDKs; one `dsh.client` serving the page, tab and settings; the hosted child behaves the same with the instance's launch configuration in place; core can read the effective composition and policy through a public API to report `guards-overridden`, in both modes; the A-lite page works without the instance (standalone) | both modes, both hosts; no host patch |
| V3-S7 | OAuth: the connector as a client-credentials authorization server on the DSH listener (RFC 9728/8414 metadata, token endpoint, audience binding) works with the stock `ClientCredentialsProvider` of both SDKs and with one non-DSH client-credentials client; immediate revocation; the direct-access fallback on and off | both hosts; no token in any log |
| V3-S7b | **Done `141ac3b` (PARTIAL):** server side 45/45 on both SDKs with the SDK client and Python; `dsh-mcp-client` has no OAuth (Q-S7B-2); refresh race decided (10 s window); restart (Q-S7B-3) pending. Browser authorization on the connector's **own approval listener** (requirements 1.16): that the stock `@modelcontextprotocol/client` 2.2.0 (both SDKs) and the Python MCP SDK complete `authorization_code` + PKCE S256 with a **Client ID Metadata Document** `client_id`, a loopback redirect, `iss` in the response, and the issuer and `authorization_endpoint` on different origins (one issuer, metadata on DSH's listener, page on the approval port); whether either client requires a refresh token or `offline_access`; that both keep accepting a plain-`http` loopback authorization server (Q-SPEC-1 decided A: the one documented departure); how the the token-only page: entry of a token value in a POST form, uniform refusal, `already-paired` on the page, and the failure limit shared with the token endpoint; issuer and `authorization_endpoint` behind a tunnel host from `--trusted-host`; the second listener's bind and clash behaviour on both SDKs: with the approval port taken, machine exchange still works and stock clients accept metadata that keeps `authorization_endpoint` (Q-OA-7 decided A) | both hosts, both clients reach `scope: fishball` after one approval; deny returns `access_denied`; no token value in any page, URL or log |
| V3-K | Freeze `./mcp-schema` and `./tools`: tool names and schemas, result envelope, event types (R-EVS-02), error map, OAuth metadata and error mapping, page limit, retention, "connected" definition (§3.5) | reviewed; independent requirements-only case authoring starts after this |

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
    Fishball authority, no tokens and no mailbox or offer access. Toward Fishball they can only
    emit events, expose tools and accept their calls (Q14, decided).
  - They are reached only through the same authenticated endpoint and its limits.
  - Each call is contained, and repeat offenders are quarantined.
  - Fishball's model sees every contributed tool, and every contributor event reaches Fishball
    unless a plugin in the Fishball DSH intercepts its type (R-EXT-20);
    the only control is installing or enabling the contributor plugin (Q15, Q16, Q17 decided).
  - The residual risk is the same as installing any DSH plugin. It is visible through log lines
    and `tools/list` annotations, and the user controls it by disabling the plugin (R-EXT-15,
    Q16 decided).
- **The token is the security boundary (R-TOK-00).** Ids, pairs and names are foolproofing
  only, and never relax a token rule (§5.6).
- **Credentials:**
  - The connector keeps only digests of token values; a hosted value lives only in the child's credential store (§5.1, §5.4); MCP requests carry short-lived, audience-bound
    access tokens (§5.5).
  - Hosted: the token goes to the child once, at its first start, over the authenticated wire, and is stored in the child's own credential store. Standalone:
    it stays in that DSH's credential store and is resolved per connection.
  - They are never in settings, logs, lifecycle files, temp files, argv, env, URLs, tool results,
    resource contents or browser responses.
  - The `Authorization` header is never logged. Error details name only the reference or the
    label.
  - Admission tickets are single use and are never logged.
- **Endpoint:**
  - loopback by default; non-loopback only over TLS;
  - Origin allowlist; an access token on every MCP request; client credentials only at the token
    endpoint; constant-time comparison; 401 with `WWW-Authenticate` and resource metadata;
  - limits below the codec; no query-string tokens; no unauthenticated discovery.
- **Authority:**
  - offers are fenced by `offerId` and the pair, and the first commit wins;
  - acks and notifications never grant authority;
  - revocation takes effect at the next request;
  - Watchdog failure releases authority synchronously, with nothing settled by time.
- **Verification hook (R-SEC-02):** the acceptance suite plants recognisable token values and
  greps every log, lifecycle file, child home and temp directory after a full run. Any hit is a
  failure.

## 13. Tool and event contributions from other plugins (R-EXT)

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
  /** Emit one event to Fishball (Q14, decided; R-EXT-16..20). Never throws for a refusal. */
  emit(event: ContributedEvent): Promise<{ ok: true; eventId: string } | { ok: false; code: EmitRefusal }>
  /** Read-only view of this caller's own registrations and their state. */
  mine(): readonly { name: string; publicName: string; state: 'active' | 'quarantined' }[]
}

interface ContributedEvent {
  event: string                   // local name, same grammar as a tool name; public name <namespace>.<event>
  payload: JsonValue              // ≤ 8 KiB UTF-8 when serialised
  summary?: string                // plain text, ≤ 500 characters, shown to Fishball's model
  sessionId?: string              // when the event is about one main-DSH session (recipient: R-EXT-17)
  dedupeKey?: string              // a pending event with the same key from the same contributor is not queued again
}

type EmitRefusal = 'event-invalid' | 'payload-too-large' | 'rate-limited' | 'queue-full'
  | 'duplicate' | 'no-fishball' | 'contributor-unavailable' | 'registry-closed'

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
  principal: { key: string; name: string }     // opaque principal key + current name; never the token, id or entry label
  protocolVersion: '2026-07-28'              // the only revision served (Q12)
  signal: AbortSignal                          // client cancel, disconnect, revocation, timeout, contributor unload
}

type ContributedResult =
  | { ok: true; data: JsonValue; text?: string }
  | { ok: false; code: string; message?: string }
```

**Registration rules.**
- `register(definition)` must be called from the contributor's own context,
  `ctx.fishballConnectorTools.register(…)` inside its `inject` sub-scope. The registry records the
  **caller's fiber** (Cordis service calls see the caller's active context, `getTraceable`).
  - **Namespace (spike V3-S5 `8f2788e`, Q1):** the normalised **package name of the caller's loader entry**, so a
    contributor cannot pick another's namespace. A caller with no traceable package is refused
    `contributor-unidentified`. The signature stays `register(def)` (the `register(ctx, def)`
    fallback is not needed).
  - The returned disposer is bound to that fiber with `ctx.effect`, so the fiber's unload
    disposes it even if the contributor forgets.
  - **Owner check (Q4):** `tools/list` and `tools/call` also require the owner fiber to be loading
    or active, so a tool whose owner is being disposed is invisible at once (R-EXT-04).
- Refusals throw `ToolContributionError {code}` and register nothing:
  - `tool-invalid`: bad name, description, schema, limits over the ceilings, codes grammar;
  - `contributor-unidentified`: the caller has no traceable package (Q1);
  - `tool-exists`: the same public name;
  - `namespace-reserved`;
  - `registry-closed`: the connector is unloading.
- A disposer called twice is a no-op. Re-registering after dispose is allowed.

### 13.3 Names and namespacing

- `namespace` = the contributor's package name from its loader entry, normalised to `[a-z0-9-]`
  (scope `@x/` → `x-`). It is unique because DSH plugin names are unique in one profile.
- Public MCP name = `<namespace>.<name>`, for example `board-helper.lookup` for a plugin named
  `board-helper`; embed-UI's tools use its alias, `embed-ui.attention.signal` (below).
  - It fits MCP's rule (1–128 characters of `A-Z a-z 0-9 _ - .`, case-sensitive).
  - The `.` separator is kept [spec: server/tools § Tool Names] (S5, Q6). DSH-hosted agents see
    **hashed** names: DSH's own MCP client renders `mcp__<server>__<raw>`, replaces `.` and
    shortens to its 64-character contract with a hash suffix (`dsh-mcp-client/lib/index.js:57–100`,
    both SDKs). That is the client-side disambiguation the specification allows; names stay
    unique. There is **no** soft name-length budget: S5 showed DSH hashes **every** dotted name,
    whatever its length (K2 `d1d0b25`, `packages/connector/tools/README.md`).
- Reserved namespaces: `fishball` and the connector's own plugin name. Core tools keep unprefixed
  names (§3.2). No contributed name can collide with them, because every contributed name
  contains a `.`.
- Embed-UI gets the short alias namespace `embed-ui` (a fixed first-party mapping in the
  connector, for readable tool names). No other alias exists.

**Who sees contributed tools (Q15, decided):** every **full** access token, with no per-token
filter. A pair-only token sees none (R-EXT-05). `tools/list` is the same for every full access token. The only filters are the
contributor plugin being installed and enabled. Fishball's model sees them all too (Q17,
decided): there is no allowlist.

*Prompt-size note (documented, not a setting):* every contributed tool's name, description and
schema is part of every Fishball turn, so many or verbose contributors grow Fishball's prompt.
Contributors should keep descriptions short. `fishball-core`'s status shows the number of
contributed tools on offer, and the README explains the cost.

### 13.4 Lifecycle and `tools/list_changed`

- **Spec check (2026-07-28):** servers declaring `tools.listChanged` SHOULD send
  `notifications/tools/list_changed` to clients with a `subscriptions/listen` stream opened with
  `toolsListChanged: true`. `tools/list` MUST NOT vary per connection but MAY vary by
  authorization ([tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools.md),
  [subscriptions](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions.md)).
- Events that change the list: register; dispose; contributor fiber unload (disable, uninstall,
  reload, HMR); quarantine; connector unload (closes everything). There is no connector-side
  per-contributor switch (Q16, decided).
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
  the same, with no filter (Q17, decided).

### 13.5 Auth, limits, codes and isolation

**Order for a contributed `tools/call`:** steps 1–5 of §3.1, then:
1. resolve the name in the current table (unknown → JSON-RPC -32602 "unknown tool", spec
   protocol error);
2. state check: quarantined → unknown tool, never "exists but quarantined";
3. argument byte size ≤ min(declared, connector ceiling) → `limit-exceeded`;
4. JSON Schema validation of `arguments` against `inputSchema` → `invalid-arguments` (the
   validator is the connector's own; the keyword subset matches what the hosts' client accepts);
5. per-principal limits, and the **per-contributor in-flight bound** (`TOOL_LIMITS.contributorInFlightCalls`
   = 16 calls of one contributor at once; one more → `queue-full`). There is **no per-contributor
   call rate** in V3 (K2 `d1d0b25`, `packages/connector/tools/README.md`);
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
  contributor, frozen by K2 as `QUARANTINE.moreThanFailures` = 2 of `QUARANTINE.windowOutcomes` = 5
  counted outcomes (finished calls, where a failure is `contributor-failed`, and validated emits,
  where a failure is `event-invalid` or `payload-too-large`; `tool-withdrawn` and refusals before
  `execute` are not counted), so the 3rd failure in 5 quarantines;
  (frozen constants, not settings) withdraws that
  contributor's tools (§13.4) and stops its events (§13.5a). The quarantine is an effect on the
  contributor's root fiber (S5, Q2), so it lifts only with a new activation of the contributor
  (disable and re-enable, reload, or hot reload); a connector reload does not lift it; there is no
  connector-side control (Q16, decided).
- **The namespace is attribution, not a boundary (S5-Q5, decided A; the user: "选A，自己安装的插件自己负责"):** any
  in-process plugin can reach another plugin's context through the loader and register under its
  namespace. The namespace attributes honest contributors; it does not isolate hostile ones. A
  plugin the user installed is the user's responsibility (R-SEC-04, README).
- **What containment does not cover:** a contributor is ordinary in-process code. A synchronous
  infinite loop or memory exhaustion affects the whole DSH process, as any DSH plugin can. Process
  isolation is out of scope (requirements §5).
- **Authority:** `call` gives the principal's opaque key and name only. The connector passes no
  credentials, mailbox, offer, answer, hand-over or other-tool handles (R-EXT-10/11). A contributor
  that wants session data must use its own DSH services under its own authority. Its whole scope
  toward Fishball is: emit events, expose tools, accept their calls (Q14, decided; R-EXT-11).

**Visibility to the user** (R-EXT-15; Q16, decided): there are **no** per-contributor rows or
switches in the connector's settings. To stop a contributor, the user disables its plugin in
DSH's Plugins page. Registrations, refusals, withdrawals and quarantines are logged once each
with the namespace only, and `tools/list` names the contributor plugin and version in
`_meta["io.github.dsh-fishball/contributor"] = {plugin, version}`; `annotations` keeps only the specification's behaviour hints (S5, Q3).

### 13.5a Contributor events (R-EXT-16–20; Q14 decided)

- **Emit path:**
  1. `emit()` validates the name, size and rate;
  2. it resolves the one recipient pair (R-EXT-17, R-EVS-03);
  3. it commits one mailbox event of type `contributed:<namespace>.<event>` with
     `payload: {namespace, event: <namespace>.<event>, data, summary?}` and `sourceSessionId`;
  4. it sends the usual `notifications/resources/updated` hint.
  It is the same ledger, the same `eventId`, ack and replay, and the same (token, id) delivery as
  every other event (R-ID-06).
- **Limits** (frozen constants, V3-K):

  | Limit | Value |
  | --- | --- |
  | payload | 8 KiB |
  | summary | 500 characters |
  | rate per contributor and recipient | 30 per minute, burst 10 |

**Frozen by K2 (K2 `d1d0b25`, `packages/connector/tools/README.md`; [impl], decided by Fishball):** `TOOL_LIMITS.ceiling.argumentBytes` = 65536
(64 KiB), `TOOL_LIMITS.ceiling.resultBytes` = 262144 (256 KiB), `TOOL_LIMITS.ceiling.timeoutMs` = 30000
(30 s, below DSH's 60 s client default), `TOOL_LIMITS.contributorInFlightCalls` = 16,
`TOOL_LIMITS.descriptionBytes` = 2048, `TOOL_LIMITS.messageChars` = 500, `EVENT_LIMITS` payload 8192 bytes,
summary 500 code points, 30 per minute with burst 10 per (contributor, recipient),
`QUARANTINE` 2 of 5; the closed `SHARED_CODES` (`limit-exceeded`, `forbidden`, `unknown-session`,
`expired`, `conflict`, `unavailable`, `unsupported-operation`, `operation-failed`); `CALL_CODE`;
`ABORT_REASON` (`cancelled`, `disconnected`, `revoked`, `timeout`, `tool-withdrawn`); `EMIT_CHECK_ORDER`.
The README is the authority; this table only names them.
  | queue | the recipient's `maxQueuedInputs` |

  `dedupeKey` collapses a still-pending duplicate.
- **Fate shared with tools:** quarantine, disable, unload or uninstall of the contributor makes
  `emit` return `contributor-unavailable`. Its still-pending events are retired from every
  mailbox (an event of type `retirement` replaces each); acked ones stay with their client.
- **In a Fishball DSH:** contributor events go through core's interception service like every
  event (R-INT-02): to a plugin registered for their `contributed:…` type, else to the Fishball
  agent through the X9 pipeline (fold-notify may batch them), possibly waking its LLM. Watchdog
  never registers for them. No allowlist filters them (Q17, decided).
- **Not an authority path:** an event carries data only. Fishball decides what to do; the event
  cannot answer, approve or hand over anything.

### 13.6 Embed-UI's notification tools (Q3 decided)

The attention latch moves out of the connector into embed-UI. Its behaviour is unchanged (D3).

| Public name | Input | Result | Behaviour |
| --- | --- | --- | --- |
| `embed-ui.attention.signal` | `{important: boolean}` | `{ok: true, accepted: true}` | sets `count = 1`, `important ||= important`; stateless, no counts or timestamps, no replay |
| `embed-ui.attention.state` | `{}` | `{ok: true, count: 0 \| 1, important: boolean}` | read-only; lets a client check the latch |

- The latch lives in embed-UI's host row, in memory, exactly as the connector held it in V2:
  - the page-open clear runs once through embed-UI's own authenticated route, no longer
    `/api/fishball/connector/attention/read`;
  - it resets on embed-UI's unload, and on loss of the designated Fishball principal's
    connection (§3.5), read from the connector's hand-over service.
- Embed-UI registers these tools whenever the connector's contribution service is present
  (Q18, decided: with or without an instance). Without it they are absent, and
  fold-notify's attention call gets `unsupported-operation`, the same D3 rule as an unserved
  signal.
- Managed marks and Hand over / Take back are connector state. Embed-UI reads and drives them
  through the hand-over service (§3.6, Q3 decided).

### 13.7 Compatibility on both SDKs (read only)

| Need | 0.2.1-rc.5 | 0.2.2-rc.1 |
| --- | --- | --- |
| Provide a named service; auto-removed with the owning fiber | cordis 4.0.5 `Service` (`service.d.ts`: "registered immediately and is automatically removed with the owning fiber"), `reflect.provide` | cordis 4.1.0, `service.d.ts` identical |
| Optional consumer sub-scope that activates and unloads with the service | `registry.inject(deps, cb)`; already used in V2 (`binding.js`), both versions per its comment | same |
| Caller identity | the traceable `this.ctx` at the use site (both versions, S5); `fiber.name` is not identity; `symbols.caller` is 4.1.0-only and not used | `Fiber.name` `:139`; `getTraceable` same |
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
  hosts no contributions; its Fishball uses the target connector's (requirements §4.2 E8).
- A contributor in some other DSH (for example the host DSH of matrix row 7, with a remote
  connector) has no connector to contribute to. Its tools do not exist anywhere (requirements
  §4.2 E6–E7). Cross-process contribution is out of scope.
