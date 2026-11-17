# PLAN-MULTI — multiple DSH MCP connections, minimal complete change

**Status:** planning only; no product implementation authorized by this document. Requirements dated **2026-11-18**. Release **1.0.0-alpha.1** may slip; Board remains shelved. Baseline: local `integrate/v3-w2`, commit `a6a72d45712d61e08b335613b56b5fc689df8727`; planning branch `dev/v3-plan-multi`. This document amends the single-target portions of the [approved design](<../../DESIGN.md>) and [canonical V3 design](<v3-design.md>), not the unaffected architecture/security rules.

## 1. Scope and decision record

The smallest complete change is **one Fishball manager with a list of ordinary DSH MCP client connections**. DSH already exposes its operations through Connector; Fishball connects to each server and uses that server's tools. This is not a new multiplexed Connector protocol.

### 1.1 Settled user decisions (not questions)

Citations below are direct instructions in the PLAN-MULTI conversation on 2026-11-18; quotations identify the decision without inventing unavailable message IDs.

| ID | Decision and source |
|---|---|
| D01 | Multiple independent MCP servers distinguish the DSH being operated. PLAN-MULTI architecture instruction (paraphrased): Connector exposes ordinary MCP controlling its DSH; Fishball connects multiple such servers. No `dsh` argument added to MCP tools. |
| D02 | Narrow bottom navigation dynamically covers **all DSH sidebar navigation**, including third-party plugins, not a frozen button list. PLAN-MULTI brief; supersedes the three-button-only rule in [DESIGN §22](<../../DESIGN.md#L2177-L2189>). |
| D03 | Move target summaries to the sidebar, **remove the chat-top status card**. Each target shows its name and connected / connecting / failed / not set; clicking opens details. PLAN-MULTI brief. |
| D04 | Connector advertises `serverInfo.name = <configured connector DSH name, else OS device name>-DSH`; Fishball displays that MCP name. Earlier naming decision in PLAN-MULTI (paraphrased). Reuse `approval.dshName`, not a second setting or an URL-derived name. |
| D05 | Device name: “直接用操作系统的 device name”. Use standard Node **`node:os.hostname()`**; no special lookup, shell command, friendly-name registry, DSH instance-name service, request Host or URL fallback. |
| D06 | Special characters: “不做额外处理，照 MCP 协议来”. Preserve the emitted server name; render it as **plain text**, never HTML. Derive a separate safe internal tool-prefix key; do not sanitize the display identity. |
| D07 | Duplicate display/identity names: later appearance receives ` (2)`, then ` (3)`, etc.; existing targets never renumber. A renamed target is the later appearance in its new name group. User: “哪个名字后出现，就给哪个加（2）”. This is **Fishball-local**, not a rewrite of the server's metadata. |
| D08 | Connected rename updates Fishball live through MCP (Q02 now requires push, not polling). User: “MCP 服务器改名后，Fishball 界面也跟着显示新名字”. Do not defer until manual reconnect; §4 gives the verified modern-protocol mechanism. |
| D09 | Hosted child: the actual parent is fixed first; additional targets are configured inside Fishball. Fresh install, no migration path. PLAN-MULTI brief. |
| D10 | Keep local reminders/notify; independent package sides; freeze seams before parallel Opus implementation; report product choices here rather than asking questions directly. PLAN-MULTI brief. |
| D11 | Release `1.0.0-alpha.1`, date 2026-11-18, release may slip, Board shelved. Planning deliverables only: this document and [DESIGN amendment](<../../DESIGN.md>). |

Only the additive standard identity-resource contract in §4.3 expands the MCP resource surface. No new transport, Connector OAuth, pairing wire, mailbox envelope, remote reminder service, stock MCP-client replacement, host-sidebar patch, cross-side import or Board work is in scope. Retain the existing Fishball façade's authorization, image and send gates. Only its **local model-facing names** change, explicitly superseding the old ban on model-facing `mcp__…` names in [V3 §6.3](<v3-design.md#L1299-L1326>).

## 2. Measured coupling before task split

Inspected the real composition, callers and both installed SDKs, not just the settings schema. Hours below are engineering estimates, **not benchmarks or elapsed time**. They include focused black-box tests and review; implementation will use a separate test author. These rows are disjoint work areas, not proposed microtasks.

| Area | Actual singleton/collision and smallest edit | Reuse / rough hours |
|---|---|---|
| Composition/settings/status | [main](<../../packages/core/src/main/index.js#L95-L206>) constructs one link, bridge, events, asks and scalar UI seam. [config](<../../packages/core/src/main/config.js>), [follow](<../../packages/core/src/main/follow.js>), [constants](<../../packages/core/src/main/constants.js>), [target selection](<../../packages/core/src/settings/target.js>), [settings routes](<../../packages/core/src/settings/index.js>), [settings UI](<../../packages/core/client.settings.js>) and [status](<../../packages/core/src/status/status.js#L45-L79>) really need collection/addressed behavior. Add one small target runtime owner, not parallel copies of main. | Manager/session/model/guards remain singletons; settings editor belongs to core, **not** the 5-file UI estimate. **8–12h**. |
| Connect/credentials/pairing | [credentials](<../../packages/core/src/link/credentials.js>) keys grants by origin and shares `DSH_AGENT_TOKEN`; separate instances alone are unsafe. [web callback](<../../packages/core/src/link/web-callback.js>) has one `pending` slot; [Connect](<../../packages/core/src/link/connect.js>) already has per-instance cancellation/generation. [identity records](<../../packages/core/src/identity/records.js>) use kind/origin/ref. | Inject target-qualified record/reference keys and scope pairing storage. Reuse [OAuth refresh manager](<../../packages/core/src/link/oauth-client.js>) and [pairing state machine](<../../packages/core/src/identity/pairing.js>), including cross-process refresh locking and agent-id checks. **7–10h**. |
| Discovery/name/link lifecycle | [link](<../../packages/core/src/link/link.js#L369-L412>) connects/lists/pairs/subscribes but does not publish live server identity or an explicit connecting phase. | Reuse SDK transport, list refresh and generation fences. Add local name allocation and immediate identity-resource notification → discovery with coalescing and subscription-open/reconnect recovery; no metadata polling. **6–10h**. |
| Events/asks | [ledger](<../../packages/core/src/events/ledger.js#L45-L62>) keys raw event IDs and produces `fbe_ + eventId`; [delivery](<../../packages/core/src/events/delivery.js>) uses that ID in one manager. [ask store](<../../packages/core/src/asks/store.js>), [ask pipeline](<../../packages/core/src/asks/index.js>) and [ask routes](<../../packages/core/src/asks/routes.js>) assume globally unique remote IDs. | Target-partition existing stores/state machines; additionally qualify manager message IDs and UI handles. Aggregate [event service](<../../packages/core/src/events/index.js>) registrations for existing/future targets. Keep raw wire IDs and receipts. **8–12h**. |
| Tools/persona | [bridge](<../../packages/core/src/bridge/index.js>) is link-bound; [names](<../../packages/core/src/bridge/names.js>) maps only contributed dots and preserves built-ins; [persona](<../../packages/core/src/persona.js>) embeds unqualified tool names. | Reuse façade gates, whitelist and per-link call binding; namespace **all exposed remote tools** and target-bound local filing helpers; update persona guidance. **8–12h**. |
| Connector identity | [wire resolver](<../../packages/dsh-connector/src/wire/index.js#L96-L108>) falls back to listener origin; [endpoint](<../../packages/dsh-connector/src/mcp/http/endpoint.js#L196-L209>) builds each request from static `SERVER_INFO`. [HTTP constants](<../../packages/dsh-connector/src/mcp/http/constants.js>), [settings copy](<../../packages/dsh-connector/src/settings/constants.js>) and [client copy](<../../packages/dsh-connector/client.js>) also change. | Seven runtime files: add [stream broadcast](<../../packages/dsh-connector/src/mcp/http/streams.js>) and [resource constants](<../../packages/dsh-connector/mcp-schema/constants.js>) to the five above; [HTTP API documentation](<../../packages/dsh-connector/src/mcp/http/index.js>) is comment-only. Reuse live settings, standard resource notifications and per-request SDK factory; add readable identity resource, not tool/OAuth schema changes. **10–17h**. |
| Hosted parent | [host](<../../packages/dsh-instance/host.js>) passes an optional remote override; [hosted helper](<../../packages/dsh-instance/src/host/hosted.js#L29-L55>) prefers it; [instance UI](<../../packages/dsh-instance/client.models.js>) edits it. Literal parent-first requires removing all three parts, not merely ignoring an input. | Keep child-row/credential wire and token succession/reconnect. Three runtime files plus regressions. **5–7h**. |
| Sidebar/navigation/ask cards | [page](<../../packages/fishball-ui/fishball-page/client.js>), [strip client](<../../packages/fishball-ui/client.strip.js>), [status projection](<../../packages/fishball-ui/src/status/index.js>), [status text](<../../packages/fishball-ui/src/status/text.js>) and [ask-card client](<../../packages/fishball-ui/client.asks.js#L164-L215>): **five** expected runtime edits. Ask rendering currently keys/posts raw approval IDs and displays only session source, so this fifth file is necessary. | Reuse native primitives, settings launcher and [SSE route](<../../packages/fishball-ui/src/status/route.js#L43-L84>) if aggregate snapshot fits existing serialization. Focused dual-SDK/390px tests and the required first-step 2–3h owner-compatibility spike included. **18–28h**. |
| Reminders/manager/notify | [reminders](<../../packages/core/src/manager/reminders.js>) depends on the manager, not the remote link. [main](<../../packages/core/src/main/index.js#L159-L166>) registers it once. | **No redesign or per-target copies; 0 implementation hours.** Regression verification included in core/integration. [Manager persona wrapper](<../../packages/core/src/manager/persona.js>) should remain unchanged. |

**Totals:** core **37–56h**; connector + hosted **15–24h**; UI **18–28h**; seam freeze + final integration **11–17h**; **81–125 person-hours overall**. The core is not a one-line array refactor: credential storage, the callback slot, manager message IDs, approval handles and persona have actual singleton assumptions. Conversely, existing link/OAuth/pairing/mailbox state machines are reused, not rebuilt. The previous 74–114h increases by **5–8h** for push/resource-contract work and **2–3h** for the now-included original-icon spike. Host/owner changes or platform-specific OS-name watchers are excluded and require report-back/re-estimation before building. Parallelism reduces elapsed time only after seam decisions, not total effort. Three implementation slices are sufficient (§8).

## 3. Target collection and lifecycle

### 3.1 Data and ownership

Logical record: **`{id, url, name, credentials, state}`**. Store only configuration/identity metadata in settings/storage; derive runtime state.

- `id`: stable opaque local target ID, generated once; never a mutable name, list index, URL or remote session ID. Removing and re-adding is a new target identity.
- `url`: canonical MCP endpoint; existing URL security policy unchanged. An endpoint edit invalidates that target's generation, Connect attempt and old tool handles before reconnection; no credential crosses an origin change. To preserve a stable settings-row ID without reusing durable remote identities, persist a separate opaque `endpointEpoch`, replaced on every canonical endpoint change (even same-origin). Every remote-derived local key/handle/credential reference includes `(targetId, endpointEpoch)`. Old epochs are retired, never reconciled or answered through the new endpoint, including after restart; Q07 covers their history presentation. A purely syntactic URL edit canonicalizing to the identical endpoint does not replace the epoch.
- `name`: Fishball-local resolved identity. Keep `serverName` (raw observed MCP name) separately from `name` (raw name plus any Fishball duplicate suffix) and from `toolKey` (encoded internal prefix). Persist allocations so restart/reconnect does not renumber unchanged targets. Before discovery, do not invent an advertised MCP name from the URL; show “Not set” / “Name unavailable” plus Connect under Q01, URL only in details.
- `credentials`: opaque credential references/status only, never token material in target JSON, public status, SSE, logs or cards. Credential records include stable target ID **and** existing canonical-origin/agent-id binding. Two records on the same origin must not overwrite each other.
- `state`: public connected / connecting / failed / not set; retain existing detailed link/Connect/pairing codes internally. Connecting includes authorization/active attempts; refused/unreachable map to failed; unknown maps to failed, never success. Preserve actionable reason/retry/approval controls in details.

One manager identity and manager session serve all targets. The collection owner composes the existing link, credentials, pairing, events, asks and bridge factories once **per target**, starts them after their own durable recovery, and disposes only that target. No one-target failure stalls the rest. Keep central guard/plugin checks and local reminders once. Shared interceptor registrations must be installed in existing and newly added target pipelines, preserve ordering and detach on disposal; do not silently create N unrelated public interception services.

Core settings supports add/remove/edit URL, per-target token entry, Connect/cancel/retry and pairing recovery; all actions address stable `targetId`. Identity and model remain global; retain one global user-hosted CIMD URL (Fishball's provisional Q06 call), with no per-target override. Public owner-only routes select a target locally; this is **not a new MCP `dsh` argument**. Reject duplicate canonical MCP URLs within the profile under Q04. A removed target cannot receive a late OAuth callback, poll result or tool-registration completion.

### 3.2 Connect and credential reuse

Keep PKCE S256, loopback callback or verified HTTPS web callback, `state`/issuer checking, resource/issuer origin pins, no redirects, user-hosted CIMD, no dynamic registration, and HTTPS except exact loopback HTTP (`localhost`, `127.0.0.1`, `[::1]`). Each target owns its existing Connect/pairing/refresh generation. Rename changes none of these keys.

Replace the shared web callback's scalar `pending` with a bounded-by-live-attempts state-indexed registry **for concurrent Connect across targets (Q05)**; no single attempt may overwrite another. Each callback resolves a target and generation from the stored attempt, not query-provided target identity. Cancel/remove/URL edit disposes its entry; consume once and retain Host/Origin/state/issuer checks. Allow only one pending attempt per target while other targets authorize concurrently.

The existing refresh manager accepts a caller-supplied storage key; use it. Do not create a periodic token-refresh subsystem. Accepted replacement values replace the saved copy; refused values retain existing refusal/retry semantics. Pair `set_name` is the **Fishball agent name**, not the Connector's server name; leave its wire meaning unchanged.

### 3.3 Hosted versus standalone

Standalone starts with an empty target collection (Q01 defines presentation). A hosted child has a reserved first target for the **actual parent Connector**, non-removable and URL-read-only; missing parent Connector leaves this reserved entry not set/failed as appropriate, never replaced by an arbitrary remote. Additional entries use exactly the standalone settings flow.

Remove the old instance remote-target override from host schema, launched state, token eligibility branches and instance settings UI. Do not merely change `childTargetUrl` while leaving `remoteTarget` checks that would refuse parent token provisioning. Preserve [child row](<../../packages/dsh-instance/child-row.js>), native child configuration handoff and credential import wire. Reserve `DSH_AGENT_TOKEN`, `fishball-core/hosted-agent` and the hosted pending-origin record **only** for the reserved parent. Manually added targets use target-qualified references/records and can never satisfy the hosted credential probe or suppress provisioning. Reconnect/succession rules remain unchanged. No migration/read-old-format/remote-override conversion; fresh installs only.

## 4. Server identity, duplicates and live rename

### 4.1 Correct MCP metadata, both SDKs

MCP is pinned to **2026-07-28**, SDK **2.2.0**, modern `server/discover`; do not add legacy `initialize` negotiation. Standard location is `result._meta['io.modelcontextprotocol/serverInfo']`, **not** `result.serverInfo`. [Discovery specification](<https://modelcontextprotocol.io/specification/2026-07-28/server/discover.md>) and [schema](<https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/schema/2026-07-28/schema.ts>) define required `Implementation.name`/`version` and optional `title`. `name` has no tool-name regex/length restriction. Fishball uses `name`, never substitutes `title`.

Connector reuses the existing live `approval.dshName` resolver, replacing URL fallback with `node:os.hostname()`. Existing whitespace-only setting counts as unset; otherwise preserve the configured string verbatim. Append literal `-DSH` once as an operation, even if the configured base already ends with `-DSH`; no suffix deduplication or trimming of a nonblank base. Preserve manifest version. Inject the live name into each per-request `McpServer` factory; approval page can reuse the resolved base rather than keep an URL fallback. The standard Node API is identical under both supported hosts; see [Node hostname documentation](<https://nodejs.org/api/os.html#oshostname>).

UI names, cards, tool descriptions and event source labels are untrusted text: React text nodes, no `dangerouslySetInnerHTML`, no HTML interpolation or executable instruction treatment. Only locally generated target ID/epoch/tool binding keys are trusted provenance; server-supplied names remain data, even in a locally assembled provenance object. In model context/descriptions, encode and delimit those names as untrusted data using the existing framing discipline, not raw prose beside trusted instructions. Server identity is not authentication; origin/token/agent-id validation remains authoritative.

### 4.2 Duplicate allocation

After receiving a new/changed raw server name, serialize local allocation: claim that exact name if free; otherwise append ` (2)`, ` (3)`, etc. until a free resolved name exists. Compare complete resolved names too, so a literal server name ending in ` (2)` cannot collide with a generated alias. Unchanged observed name retains its allocation on refresh/reconnect. A renamed target relinquishes its old current allocation and claims in the new group **after existing names**, including when it renames into a duplicate; it does not steal the first target's name. Never renumber another target when one is removed or renamed. Persist the resulting allocation/order for restart stability. Q03 is resolved: reuse the lowest free suffix for future arrivals, checking literal-name collisions too; preserve all existing allocations.

Thus two servers both advertising `Office-DSH` are shown as `Office-DSH` and `Office-DSH (2)`. If the first later renames to `Lab-DSH`, the second stays `Office-DSH (2)`. Raw server metadata is unchanged. The local resolved identity feeds tool-prefix derivation; stable target ID still owns credentials, storage and calls.

### 4.3 Verified live mechanism (not a speculative notification)

The pinned schema's `ServerNotification` union has **no server-name/discovery-metadata-changed notification**. `tools/list_changed` is not an identity-change notification and must not be repurposed. Modern discovery can be called on the existing connection without reauthorization or re-pairing. Both installed client builds implement `Client.discover()` by sending `server/discover` and replacing `_discoverResult`; it **does not update `_serverVersion`**. Consume the returned `_meta` value (or latest `getDiscoverResult()`), not the stale connect-time `getServerVersion()`. The SDK method takes `RequestOptions`, not `cacheMode`; no unsupported bypass flag is needed.

Q02 supersedes the polling proposal. User: “即时推送，MCP有标准做法，就和现在的DSH向Fishball发出消息一样”. Use **standard `notifications/resources/updated` with only its standard `{uri}` parameter over the existing `subscriptions/listen` stream**, backed by a real read-only identity resource (planned URI `dsh-agent://identity`, frozen by MULTI-0). Its JSON text content is the standard MCP `Implementation` object `{name, version}` from the same live getter as discovery. This is an additive standard resource contract, **not** a new notification method, custom notification field, or nonexistent standard identity-changed notification. The [existing per-pair notifier](<../../packages/dsh-connector/src/mcp/http/streams.js#L116-L135>) already supports `resourceUpdated(uri)`; broadcast to subscribed authenticated pairs using that registry. Reuse the [wire settings subscription](<../../packages/dsh-connector/src/wire/index.js>) to compare effective advertised names after setting changes and push only when the resource changes. Do not fake an events-resource update when its mailbox summary is unchanged; no mailbox event/envelope changes are needed.

Fishball includes both events and identity URIs in its **one existing listen stream**, installs the notification handler before opening it, and immediately calls `client.discover()` on an identity hint. Verify the identity resource exists through `resources/list`: an acknowledged URI filter alone proves only capability, not resource existence. Unsupported servers show the unsupported live-identity capability in details; never silently fall back to polling. Perform authoritative rediscovery after every subscription acknowledgement/reopen as well as connection, closing the discovery-before-subscription gap and recovering snapshots after a broken stream. Coalesce hints with one in-flight discovery and a dirty flag/follow-up; generation/target/endpoint fencing cancels stale completions. **No metadata polling or retry timer**, extra MCP client, reconnect or reauthorization for a healthy rename. Existing mailbox draining/recovery and transport reconnection are unchanged; they are not identity polling.

Keep the last valid name on transient discovery failure and expose stale/error in details. With no retry timer, refresh resumes on the next hint or reconnect; no guaranteed delivery deadline or durable notification replay is claimed. **Authentication refusal is different:** route invalid-token/invalid-grant/revocation/origin failures through existing refusal/teardown, withdraw tools and surface failed/pairing state. The push path covers Connector setting changes, including clearing the configured name. **Technical limitation, not a changed user decision:** `node:os.hostname()` has no portable change subscription; an external OS hostname rename without a settings/connection event is observed on the next live getter read, not guaranteed to trigger a spontaneous push. Report that limitation before implementation if immediate external OS rename is required; platform-specific OS watchers are not included or silently substituted. Both-SDK source inspection verifies the notification/filter mechanism; implementation still owes end-to-end tests, not an assertion that push has already shipped.

On observed rename: allocate the new resolved identity and prevalidate new bindings; gate dispatch for this target, withdraw its old registrations and synchronously register its new set in one JavaScript turn, then publish the new offered-tool snapshot/status. The host exposes individual register/disposer operations, **not a batch transaction**: if any rename-generation registration fails, dispose all registrations made for that generation, keep that target's tools unavailable and report the error/retry, rather than expose a partially renamed set or roll a stale alias onto another server. Other targets remain available. This is local publication/dispatch atomicity, not a claim that an already-running model request changes its tool snapshot. Its old names must fail closed or remain bound to their original identity, never retarget. Existing in-flight RPCs stay bound to their captured target/link generation; never resolve them through the new display name. Reject stale uninvoked handles. Preserve target ID, credentials, manager session, asks and receipts. Update visible provenance to the current name while retaining an original name snapshot in durable history for diagnosis.

### 4.4 Safe model tool names

[MCP tool-name guidance](<https://modelcontextprotocol.io/specification/2026-07-28/server/tools.md#tool-names>) is 1–128 characters from `[A-Za-z0-9_.-]`; server names are expressly not guaranteed unique. Both DSH hosts impose the **stricter model-facing** `[A-Za-z0-9_-]`, maximum **64**. The stock MCP client's server-key limit (1–32) is an adapter setting restriction, **not** a restriction on `serverInfo.name`.

Proposed core-owned mapping: derive a readable safe `toolKey` from the resolved local identity, but **always** include a stable target/endpoint discriminator, even for short valid names. Final names follow `mcp__<readable-key>__<façade-name>_<digest>` within 64 characters; the digest covers an unambiguous encoding of `(targetId, endpointEpoch, resolved identity, raw tool name)`. Use the host's established 12-hex SHA-256 suffix pattern as a design precedent, not an unsupported private import. Normalize/truncate only the internal readable components. Persist binding allocations/tombstones and detect final-name collisions before registration; fail closed for a conflicting binding rather than overwrite it, including a retired name belonging to another target/endpoint. Display suffix reuse under Q03 can never permit dispatch-key reuse. This protects a model call generated before rename/removal but dispatched by name afterwards, not merely calls already inside a captured closure. Freeze exact serialization, truncation budgets, digest length and collision behavior in MULTI-0 with boundary examples. Suffix text/spaces/Unicode must never leak invalid characters into the final name. Keep raw wire tool names and arguments untouched.

Namespace all exposed remote built-ins **and** contributions; retain withheld `pair`, `set_name`, `inbox_poll`, `inbox_ack` and existing façade validation. Update hardcoded persona references to the registered target names; descriptions include plain-text resolved source names. Keep reminder tools unprefixed and local. A local ask-filing helper must be target-bound or use an unambiguous local handle; it cannot infer a server from raw approval/session IDs. Bridge/attention/interception host seams also need explicit local target identity; do not change remote schemas to compensate.

## 5. Events, approvals, questions, reminders

Local provenance is `{targetId, endpointEpoch, serverName, name}` alongside the unchanged remote event/session/offer/approval IDs; only the locally assigned identity/epoch are trusted routing data, while names remain untrusted text. Define a collision-free tuple encoding (not delimiter concatenation) for local `(targetId, endpointEpoch, eventId)`, `(targetId, endpointEpoch, approvalId)` and `(targetId, endpointEpoch, sessionId)` keys. The same remote ID arriving from A and B is two different local records; so is the same remote ID before and after an endpoint change. Retired-epoch records never participate in active reconciliation or answer dispatch, including after restart.

- Partition existing ledger/ask/identity tables through a small scoped-store adapter or explicit compound keys; do not clone persistence/state-machine implementations. Table partition alone is insufficient: change `messageIdOf` so the **one manager** cannot dedupe A's `event-1` against B's `event-1`.
- Keep remote receipt `{eventId,payloadDigest}` exactly as received and ack only through that target's captured link. Durable filing/handover precedes ack; failed storage is not acknowledged. Reuse compare-and-swap, crash recovery, Stop and owner-teardown semantics.
- Public interception contract gains trusted source identity and target-qualified dedupe rules; raw envelopes remain unmodified. Registration order/priority and dispose semantics remain the same.
- Permission cards filed in Fishball show source name and carry an opaque target-qualified handle. Answer/cancel/reconcile routes resolve that handle to the stored target + remote approval ID; never trust a user-editable label. All same-ID cross-target cases must be tested.
- Managed session **questions and plan reviews stay the session's own cards** under the existing first-answer-wins broker rules. Fishball's offer/event representation still needs source labeling and target-bound answering; this work does not move those cards into Fishball or change escalation rules. Avoid reopening [DESIGN §21](<../../DESIGN.md#L2159-L2175>).
- On remove/URL edit, no pending action may silently retarget. Under Q07, confirm the destructive change, void retired pending cards, retain labeled read-only history and delete retired token material; do not emit a remote allow/reject as a side effect of a local rename or remove.
- Local reminders and manager notify remain one subsystem and one local store. Do not add a target selector or remote scheduler to reminder tools. A reminder can mention a DSH in its text; subsequent model actions still use that DSH's namespaced tools. Existing end-delete, Stop-drop and restart-reoffer semantics remain intact.

## 6. UI and native navigation evidence

### 6.1 Target UI

All targets appear in the sidebar with resolved name + the four public states; selecting one expands its details inline in the sidebar, with no modal (Q08). Show per-target Connect/cancel/retry/approval link, pairing resolution and contributed-tool count **including zero**. Keep URL and errors in details, no credentials. Add/remove stays in core's settings page; details can deep-link there. The old target card above chat is removed, not retained as a duplicate summary. Global guard/start notices are separate from target cards and remain once per process; relocate any needed global diagnostics into details/settings, not a replacement chat-top target card.

Use DSH native primitives, icons and tokens, both languages/themes, focus handling and accessible names. A row's name can be long, RTL, Unicode or markup-looking; truncate visually with accessible full plain text, not a new protocol limit. Selecting a row is a **view selection**, not a global switch that silently redirects model tools (Q09).

**Measured mount/visibility solution:** retain the native sidebar shell/owner and register target summaries as the content occupant of its public single `sidebar.workspaces` slot, **replacing the workspace/session browser**, not the sidebar owner. Both contracts pass `{wide, expandSidebar}` to this flexible central content region before the settings foot: [rc.5 placement](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js#L502-L519>), [rc.1 placement](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js#L541-L565>). Use normal `slots.inject`/`slots.register` lifecycle, not cross-owner rendering. The [page](<../../packages/fishball-ui/fishball-page/client.js#L710-L715>) adds this slot to its Empty shadow list at its current priority; the [strip client](<../../packages/fishball-ui/client.strip.js#L188-L195>) replaces its conversation-dock registration with a stronger-priority target-content registration. Freeze named priority constants and verify winner semantics on both SDKs. Always render owned empty/loading/core-off states; never fall back to the native workspace browser. The page's Empty occupant remains fail-closed when the strip unloads.

Selectively remove the [page's wholesale sidebar/descendant/toggle/mask hiding](<../../packages/fishball-ui/fishball-page/client.js#L159-L164>), grid-zero override and [forced drawer-close](<../../packages/fishball-ui/fishball-page/client.js#L222-L227>); retain forbidden New Session/workspace/session navigation/shortcut guards. In the mixed CSS rule retain `data-shell-leading` and hidden-control suppression; remove only sidebar toggle/mask suppression. Remove only `sidebar.left.toggle` from the shortcut-remap list, retaining forbidden session/workspace remaps. Install the Empty workspace shadow **before** restoring visibility; on teardown restore visibility policy before releasing the shadow, with disposer order tested. This narrows the previous full-sidebar-hide rule to a target-only content replacement, not authorization to reopen workspace/session management. Restore the native sidebar toggle, geometry and mobile drawer/inert/focus behavior so the target list is reachable at 390px. Do not bluntly unhide all launchers or clear native inert attributes. Native desktop panel icons remain owned by the sidebar; the separate narrow bottom bar still uses §6.2's metadata/overflow policy. `sidebar.footer.action` is only a list of actions beside Settings, not a suitable all-target summary region. Tests must prove target reachability **and** no native workspace/session controls or portals on initial load, missing stream, strip unload, locale change and mobile drawer. This fits the measured page/strip changes and the revised 18–28h UI estimate including the icon spike; no extra host/loader work is assumed.

### 6.2 Both SDKs: supported APIs and restrictions

Supported installed hosts: `0.2.1-rc.5` and `0.2.2-rc.1`. Read-only inspection found the same contracts:

| Requirement | Verified API/evidence |
|---|---|
| Live destinations | `ctx.slots.entriesOfSlot('sidebar.panellist')`; map `options.id`, `order ?? 0`, `resolveSlotLabel(options.label) ?? id`; stable ascending order; subscribe to slot and locale changes and synchronize initially. Native [rc.5 implementation](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js#L566-L584>) / [rc.1 implementation](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js#L688-L706>). |
| React lifecycle | `entriesOfSlot` returns a fresh metadata array; cache/deduplicate derived snapshots, do not return it directly as a `useSyncExternalStore` snapshot. Dispose slot/locale subscriptions on unmount/replacement. [Registry contract](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/types/client/registry.d.ts#L160-L174>). |
| Select/highlight | `ctx.layout.selectPanel(id)` and observable `panelInfo`; missing main key can throw. Handle disappearing active entry through host behavior, no stale selection retry loop. [Layout contract](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-client-ui-layout/lib/types/client/service.d.ts#L14-L37>). Fishball return uses its existing `session.back`; Settings keeps native launcher callback. |
| Built-ins and plugins | `sidebar.panellist` includes Plugins and Schedules as well as third-party entries. Do not append a duplicate Plugins button. Schedules is normally absent because [Fishball guards it off](<../../packages/fishball-ui/cordis.patch.yml#L31-L43>); owner override must make it appear dynamically. Native pin filtering is a separate policy, not encoded in this list. |
| Slot boundaries | `sidebar.workspaces` is the workspace/session content browser, not another global navigation list; `sidebar.settings` and footer actions have separate contracts. [Sidebar contract](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/types/client/contract/slots.d.ts#L43-L86>). Preserve Settings/Fishball special navigation separately. |
| Original plugin icons | Native sidebar renders child slot components with `{size,active}`; icon is **not `metadata.icon`**. Both [rc.5 renderer](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/client.js#L342-L350>) and [rc.1 renderer](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/client.js#L342-L350>) enforce declared-child ownership; context `renderSlot` is root-only. Fishball `shell.overlay` cannot directly render `sidebar.panellist` icons. |

Q11 now requires **the original icon contributed by each plugin to the sidebar**: “用插件给侧边栏提供的图标”. Do not substitute generic icons or use a naïve overlay `renderSlot` call. MULTI-3's **first step is an included 2–3h owner-compatibility spike** on both SDKs to find a lawful way to reuse those icons in narrow navigation/More. If this needs host or owner changes, report back **before building**; no such changes are authorized or included in the estimate. Existing native desktop sidebar rendering already owns its icons; the unresolved technical issue is the separate narrow navigation surface, not the product choice. Q10 fixes overflow as a native More menu.

### 6.3 390px and dynamic coverage

Use one fixed-height native navigation row under Q10: Settings/Fishball and dynamically derived available primary entries (Plugins at most once), all remaining discovered destinations in a native **More** menu. This is not a fixed list: registration/unregistration/order/locale changes update the complete reachable set live. Do not wrap an unbounded row: existing [page clearance](<../../packages/fishball-ui/fishball-page/client.js#L35-L41>) assumes 44px at ≤480px. More menu follows native portal/focus/aria patterns, not custom popup positioning.

At 390px verify many plugins, long labels, target details, retry/status text, composer stats, both themes/languages, keyboard focus, menu scrolling and target list scrolling. No clipped controls, overlay on composer stats or inaccessible final destination. Test zero entries, plugin add/remove/relabel, missing labels, equal order, active plugin removal, guarded Schedules absent/override present and Plugins exactly once. Fakes alone are insufficient: a host-backed ownership/API test is required on both SDKs.

### 6.4 MULTI-3 icon spike result and the user's amendment (2026-11-18)

**Spike (both SDKs, identical):** no lawful way exists to draw contributed panel icons outside the sidebar owner. The icon is the entry's component, rendered only through the sidebar's own `renderSlot('sidebar.panellist', {size, active}, {only})`; props `renderSlot` throws `SlotOwnershipError` for an undeclared child, a second declaration of `sidebar.panellist` throws "already declared", `ctx.slots.renderSlot` is root-only, and no Factory exposes panel icons. Reported before building, as Q11 required.

**User decision (supersedes the separate tray of §6.2–§6.3):** “改成本质修改侧边栏的样式而非做自己的tray，也就是那一排按钮实际上就是侧边栏，只是被重度修改了样式。” On Fishball's page at narrow width, the bottom row **is DSH's real sidebar**, restyled by Fishball's page CSS into a horizontal bar: every entry keeps its own icon, active state and live add/remove/relabel/order, and ownership is untouched. No mirroring code, no icon seat, no overlay tray.

- **Scope:** only under `[data-fishball-page]` and only at the narrow breakpoint; DSH elsewhere is unchanged. Hooks are DSH's slot anchors (`[data-slot="sidebar"]`, `sidebar.panellist`, `sidebar.settings`, `sidebar.footer.action`, `sidebar.workspaces`) and layout attributes (`data-sidebar-collapsed`, `data-sidebar-drawer`); the bar uses no hashed class chain. (The frame/column themselves are reached through the layout's own `[data-sidebar-collapsed]` frame attribute plus the column holding `[data-slot="sidebar"]`.)
- **rc.1 below 768px (user choice b):** rc.1's layout turns the sidebar into a drawer that is `inert` while closed, and CSS cannot lift `inert`. There is **no bottom bar** there: the native drawer toggle stays, and the drawer shows the real sidebar (all panels with their icons, Settings, the target list). rc.5 at every narrow width, and rc.1 from 768px up, keep the restyled bar.
- **Overflow (user choice, amends Q10):** pure CSS cannot create the native More (it exists only while `sidebar.panellist.actions` has a registration, and its one provider is guarded off). The fixed 44px row **scrolls horizontally** instead; nothing registers an actions row.

## 7. Constants, seams and limits to freeze

No behavior literals scattered through clients. Feature-owned constants/config carry target field paths, route keys, statuses, suffix strings, tuple encodings, namespace budgets and identity-resource URI/notification routing. Browser copies follow the existing explicit shared-contract discipline; do not import Node modules into client chunks.

| Item | Freeze / keep |
|---|---|
| Target collection | `targets` configuration vs derived snapshot, reserved hosted ID/kind, display-allocation persistence, add/remove/URL-edit lifecycle. Q12: no new hard target-count cap. |
| UI/host seam | Versioned target snapshots, stable `targetId` action selectors, target-qualified ask handles, global manager/guards, source context on bridge/attention/events; validate unknown/deleted IDs. [UI contract](<../../packages/core/contracts/ui.d.ts>), [events contract](<../../packages/core/contracts/events.d.ts>), [ask contract](<../../packages/core/contracts/ask-card.d.ts>) and [shared seam](<../../packages/shared/ui-seam.js>) must agree. |
| Wire | Existing Connector tool schemas, raw names, receipts and OAuth URLs unchanged. No extra MCP `dsh` field; amend K3/K3a where local services change and K1 for the additive readable identity resource and standard resource-update subscription contract. |
| Naming | Raw identity unrestricted by tool grammar; plain text. Local duplicate delimiter ` (n)`; model output max64 `[A-Za-z0-9_-]`; proposed digest12 hex. Reject collisions, don't assume hashes prove uniqueness. |
| Identity push | Freeze `dsh-agent://identity`, standard Implementation content and `notifications/resources/updated {uri}` on the existing listen stream. Discover immediately on hint and after subscription acknowledgement/reopen; one in flight plus dirty follow-up, generation fencing. No metadata polling/retry timer (Q02). |
| Existing link/security bounds | Preserve [contract constants](<../../packages/core/contracts/constants.js>): link backoff1000→60000ms; retry count3 with1000ms ×2; ID/name bounds64 where already defined for agent/tool contracts (not MCP server display name); contribution ID128/local48. Preserve HTTP/request/mailbox bounds. |
| Durable events | Existing ledger retention30 days, durable-before-ack and per-target duplicate handling; no new global approval queue cap. Use storage API common to both hosts (`delete`, not rc.1-only `deleteMany`). |
| Reminders | Existing 4MiB store, 90% edit reserve, retry5000ms and max-delay2147483647ms unchanged. No new limits from multiplying targets. |
| Fresh install | No migration adapters or old-format compatibility. Still amend frozen contracts/docs and test them; fresh install is not permission to skip contract consistency. |

## 8. Parallel Opus execution: four tasks, three implementation slices

**All 12 product choices are resolved in §9; this remains planning only. Do not start implementation without authorization and MULTI-0's seam commit.** MULTI-3 must complete its icon spike first and report back before building if host or owner changes are needed. All workers branch from that exact freeze commit. Exclusive ownership below includes tests/docs; changes outside the allocation go through MULTI-0, not concurrent edits. Each implementation worker delegates tests to an independent agent from requirements/seam/acceptance cases, does not read tests while coding, and obtains independent review before its logical commit.

### MULTI-0 — freeze and integrate (lead; 11–17h)

Dependencies: product decisions → seam freeze; after MULTI-1/2/3 → final integration. This is one lead task with a deliberate pause while implementation slices run, not another feature team.

Exclusive ownership:

```text
DESIGN.md
README.md
docs/planning/v3-design.md
docs/planning/v3-multi-dsh.md
packages/core/contracts/**
packages/shared/ui-seam.js
packages/shared/README.md
test/v3/contract/**
test/suites.mjs
```

Freeze exact collection/snapshot/action types, opaque handles and trusted provenance; credential reference/hosted reservation contract; namespace mapping + persona examples; lowest-free duplicate persistence; concurrent per-target callback registry; immediate push-triggered discovery; inline sidebar details and native More with original contributed icons. Carry Q01–Q12 into the contracts; Q06 remains Fishball's provisional call. Record MULTI-3's icon-spike evidence and stop/report if host or owner changes are needed. Confirm K3/K3a versioning and references, no cross-side imports, no K1 tool change. Publish small examples for two equal remote IDs and two equal server names. Integration resolves only owned seam/docs/contract tests; runtime fixes return to their owners.

Done: all three slices independently reviewed and merged; focused suites plus full non-shelved V3/map/package checks pass on both SDKs; final diff contains no migration/Board/host patch. Release remains user-published. Existing suite IDs: `contract.own-schema`, `contract.k1-mcp-schema`, `contract.k1d-amendments`, `contract.k2-tools`, `contract.k3-host-services`, `contract.k3a-core-seams`, `contract.package-boundaries`, `contract.split-shared`, `contract.embed`, `contract.suite-map`.

### MULTI-1 — core target composition and isolation (Opus; 37–56h)

Dependency: MULTI-0 seam freeze. Parallel with MULTI-2 and MULTI-3 using frozen mocks.

Exclusive ownership:

```text
packages/core/src/**
packages/core/client.settings.js
packages/core/README.md
test/v3/fishball-core/**
```

Expected production edits are the concrete core files in §2, their feature constants and small target collection/scoped-storage/name helpers; ownership is not a mandate to refactor the entire tree. Keep manager/reminders and reusable algorithms untouched unless a demonstrated integration requirement exists. Own the multiple-target settings editor and core-side status tests/harnesses, even when UI cases consume them. Coordinate harness changes in the freeze interface, not by editing UI tests.

Done: A/B connect independently; same-origin credentials remain isolated; cancellation/removal/URL edit reject late results; hosted references reserved; both servers can emit equal event/session/approval IDs without collision; ack/answer/tool calls reach only the correct server; names and duplicate suffixes persist and rename live; all exposed remote tools namespaced; persona matches actual names; manager/reminders/notify still exactly once. Preserve durable-before-ack, agent-id binding, image/send gates and security failure modes. Separate requirements-only tests cover equivalence classes, boundaries, decision tables and transitions including concurrent Connect and rename during an in-flight call. Assert duplicate canonical URL rejection, one global CIMD URL, lowest-free suffix reuse without renumbering or retired-tool rebinding, and confirmation/voided cards/read-only history/token deletion on removal or endpoint retirement. Push rename tests cover duplicate/burst hints, subscription-open races and reconnection, auth refusal, disposal and absence of a metadata polling timer.

Suites: `fishball-core.package`, `.bridge`, `.events`, `.link`, `.asks`, `.identity`, `.link-save`, `.status`, `.settings`, `.wire`, `.manager`. Their entries in [suite map](<../../test/suites.mjs>) already cover both host SDKs; do not create a redundant test matrix.

### MULTI-2 — Connector identity and hosted parent (Opus; 15–24h)

Dependency: MULTI-0 freeze. No dependency on core implementation completion; use metadata and hosted-reservation fixtures from the seam.

Exclusive ownership:

```text
packages/dsh-connector/src/wire/index.js
packages/dsh-connector/src/mcp/http/endpoint.js
packages/dsh-connector/src/mcp/http/streams.js
packages/dsh-connector/src/mcp/http/index.js
packages/dsh-connector/mcp-schema/constants.js
packages/dsh-connector/src/mcp/http/constants.js
packages/dsh-connector/src/settings/constants.js
packages/dsh-connector/client.js
packages/dsh-connector/README.md
packages/dsh-instance/host.js
packages/dsh-instance/src/host/hosted.js
packages/dsh-instance/client.models.js
packages/dsh-instance/README.md
test/v3/dsh-connector/{mcp-http,wire,oauth-web,settings-page,tokens}/**
test/v3/dsh-instance/**
```

Done: standard discovered metadata has configured/OS name + literal suffix, raw Unicode/special characters preserved, live setting change pushes standard identity-resource invalidation over the existing stream, triggering immediate rediscovery without endpoint remount; resource read/discovery share one live getter; version/tools/OAuth unchanged; no origin/Host-derived name. Hosted target always actual parent, old remote override field and refusal branches removed, fixed parent never editable through child core settings. Hosted credential import/succession remains correct even with added remote credentials. Tests include unset/blank/name already suffixed/long/markup-looking names, zero tool changes on rename, subscription filtering/broadcast isolation, unchanged-name no-op, disconnect/reconnect recovery, no polling and no token or existing-schema regression; additive resource contract is explicitly tested.

Suites: `dsh-connector.mcp-http`, `.wire`, `.oauth-web`, `.settings-page`, `.tokens`; `dsh-instance.placement`, `.ready`, `.host`, `.succession`, `.uninstall`, `.stderr-log`, `.placement-install`. Contract tests stay MULTI-0's, not duplicated here.

### MULTI-3 — sidebar targets and complete dynamic navigation (Opus; 18–28h, including 2–3h icon spike)

Dependency: MULTI-0 frozen target snapshot/actions reflecting the resolved Q08–Q11 choices. Implement against agreed snapshot fixtures while core proceeds.

Exclusive ownership:

```text
packages/fishball-ui/fishball-page/client.js
packages/fishball-ui/client.strip.js
packages/fishball-ui/client.asks.js
packages/fishball-ui/src/status/index.js
packages/fishball-ui/src/status/text.js
packages/fishball-ui/README.md
test/v3/fishball-ui/**
```

**First step: the 2–3h owner-compatibility spike required by Q11, included in 18–28h.** Verify lawful original contributed icons on both SDKs. If host or owner changes are required, report back before building; the estimate excludes those unapproved changes and does not assume a generic-icon fallback.

Expected **five** runtime files, including the ask-card client's source label, opaque-handle POST/React keys and retired-target states. Existing SSE route should need no edit; if evidence requires it or shared dock styling, request a bounded ownership amendment from MULTI-0. No host, loader, guards or settings-entry rewrite. Core settings editor belongs to MULTI-1, shared seam to MULTI-0.

Done: no chat-top target card; every target visible with name/state and inline details/actions, no modal; Q01 placeholders/Connect and URL-only-in-details; selection never sets a routing default; no target cap; fixed-height native More and original plugin-contributed icons; raw names safely text-rendered and duplicate aliases match core; dynamic complete navigation on both SDKs, plugins once, live locale/order/add/remove behavior; no invalid icon renderSlot use; 390px controls and composer remain accessible. Requirements-only tests plus real-host verification cover light/dark and zh/en. Existing UI nav cases/harness and strip cases/harness are extended, not replaced by a framework.

Suites: `fishball-ui.package`, `.model-dialog`, `.contrast`, `.guards`; core status/asks/settings suites remain MULTI-1-owned even where the UI harness imports their fixtures. Shared fixture changes must remain backwards-compatible with the frozen interface until integration.

### Integration commands and release gate

Use the established [affected runner](<../../test/run-affected.mjs>) / [V3 runner](<../../test/run-v3.mjs>) and suite IDs above. Verify command options against the runner before invocation; don't invent suite names. Standard Node is `/opt/homebrew/bin/node` (≥22.14). Full gate:

```sh
pnpm run test:map
pnpm run test:v3
pnpm run pack:v3:check
git diff --check
```

The implementation gate is **not executed in this planning-only delivery**. PLAN-MULTI validates document links/claims, scope, ownership, question numbering and diff hygiene, then independent document review and a docs-only commit/push. No server/browser needed and **do not touch :7713**. No registry publication, additional remote or remote issue creation.

## 9. Resolved product decisions (Q01–Q12)

**Open product questions: 0.** Recorded from the user's answers on 2026-11-18. Q04 is Fishball's choice under the user's least-work instruction; Q06 is explicitly Fishball's provisional call, not a direct user answer. These replace the earlier alternatives/recommendations. Technical seam verification and Q11's report-back gate remain; they do not reopen the settled product choices.

1. **Q01 — A: First-run / unnamed target presentation.** Show “Not set” / “Name unavailable” plus a Connect action. The URL appears in details only; no URL-derived identity placeholder.
2. **Q02 — Immediate push; no polling.** User: “即时推送，MCP有标准做法，就和现在的DSH向Fishball发出消息一样”. Use the Connector's existing server→client event/notification channel. When its name changes, Connector pushes and Fishball re-reads identity immediately. Use a semantically valid standard notification if one fits; otherwise use the existing event channel. Do not invent a custom field when a standard form fits, misuse `tools/list_changed`, or retain metadata polling. §4.3 freezes the supported form and honest transport limits.
3. **Q03 — B: Reuse the lowest free suffix.** Existing targets still never renumber. Check complete resolved-name collisions, including literal names ending in suffix text. Display suffix reuse never permits another target/endpoint to reuse a retired model tool binding.
4. **Q04 — A: Reject duplicate canonical MCP URLs.** User: “哪个工作量小就怎么做”. Fishball chooses rejection within one profile because it is less work. Same-origin/different-endpoint targets still require isolated credentials and histories.
5. **Q05 — A: Parallel Connect.** One pending authorization per target, running concurrently across targets. Never overwrite another attempt; callbacks remain bound to their stored target/epoch/generation.
6. **Q06 — A: One global client metadata URL.** **Fishball's call, subject to change.** The user asked what CIMD is; CIMD means Client ID Metadata Document, the user-hosted client metadata URL used for browser sign-in. Keep the existing global URL as the least-work option consistent with the user's Q04 preference; no per-target overrides. Validate it independently during each Connect; token refresh/issuer/resource binding remains per target.
7. **Q07 — A: Confirm deletion; void pending cards; retain history; delete token.** Confirm before deleting a target (and before retiring an endpoint under §3.1). Pending local cards are voided, history stays labeled/read-only under normal retention, and that target's retired token material is deleted. Never implicitly answer/revoke a remote request; remote credential revocation is a separate server action.
8. **Q08 — B: Inline target details.** Expand inline in the sidebar, **no modal**. Keep the other target summaries reachable and remove the old chat-top target card.
9. **Q09 — A: Details only.** Selecting a target does not set a routing default. Fishball judges the target from context and asks when ambiguous; existing tools and approvals never silently retarget.
10. **Q10 — A: Fixed-height native More menu.** Keep every overflow destination reachable from the live registry; do not wrap an unbounded row over the composer. **Amended 2026-11-18 (§6.4):** the row is the restyled real sidebar and overflows by horizontal scroll in its fixed 44px height; no More menu.
11. **Q11 — Original contributed icons.** User: “用插件给侧边栏提供的图标”. Third-party entries use the icon their plugin contributes to the sidebar. MULTI-3 starts with the **included 2–3h owner-compatibility spike**. If it requires host or owner changes, **report back before building**; do not substitute generic icons or silently expand scope. Direct overlay `renderSlot` is not a valid implementation on either SDK. **Resolved 2026-11-18 (§6.4):** the spike found no lawful owner-external rendering; the user chose to restyle the real sidebar as the bottom bar (no tray), and on rc.1 below 768px the native drawer instead.
12. **Q12 — A: No hard cap.** Show every target with scrolling/overflow and independent connection failure handling. Existing transport/tool/provider budgets still apply; no new target-count cap and no metadata polling timer.

## 10. Acceptance checklist for the plan and implementation

- [x] Record all 12 resolved product answers with Q04/Q06 attribution; preserve D01–D11 and the source quotes.
- [ ] Two servers, equal names and equal event/approval/session IDs, isolated credentials and answers; same-origin different targets included. URL edit followed by restart and equal remote IDs must isolate old endpoint history/credentials/asks from the new endpoint epoch.
- [ ] Restart/reconnect retains duplicate names; rename into an existing name allocates a later suffix, never renumbers others; Unicode/markup remains plain text; safe valid ≤64-character model names.
- [ ] Automatic live rename uses returned discovery metadata, not stale SDK `getServerVersion`; push invalidation, subscription-open/reconnect recovery, auth-refusal teardown, malformed metadata and stale-success handling covered on both hosts, with no metadata polling timer. Rename/remove during model inference before dispatch never reuses a name for another identity; registration failure never exposes mixed/partial renamed namespaces. Adversarial server names remain data in both UI and model context.
- [ ] Hosted parent first/non-editable even if old remote override configuration would have differed; remote credentials never satisfy parent probe; fresh install only.
- [ ] Core settings add/remove/connect and callback cancellation work per target; no new wire argument, authorization relaxation or raw token disclosure.
- [ ] Durable-before-ack, per-target manager message IDs, crash/Stop/recovery and global interception semantics preserved; no question/permission broker redesign.
- [ ] One manager, one reminder store, unchanged notify/reminder behavior; no Board or cross-side import.
- [ ] Inline sidebar target details (no modal) replace chat-top card; fixed-height native More, original contributed icons and full dynamic navigation; both SDKs, 390px, themes/locales; Q11 spike/report-back gate honored.
- [ ] Q01–Q12 are recorded with correct attribution; push-triggered identity rediscovery has no polling timer, subscription race/reconnect tests pass, and the standard readable resource contract is frozen.
- [ ] Three implementation slices have exclusive files/tests, frozen seams, separate test authors, independent review and logical commits; lead runs final non-shelved gates.
