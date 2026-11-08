# `fishball-instance` extension points: one change for fold-notify, board and watchdog

Status: design, 2026-11-08. Branch `design/instance-ext`, first cut from `feat/body-soul` at
003db61, **rebased onto `feat/body-soul` 1425384** ("Merge branch 'fix/e1-p3'"; it includes
90ec004). The file references below were checked against 1425384.

Sources, kept as they are (§8 lists the doc edits each one needs to use the canonical names):

| Plugin | Branch, commit | Design | Its points |
| --- | --- | --- | --- |
| fold-notify | `design/fold-notify` 7347c1f | `docs/plugins/fold-notify-design.md` §9, §13 | E1–E9 (fE1…fE9) |
| watchdog | `design/watchdog` 1bef938 | `docs/plugins/watchdog-design.md` §13, §4.5 | E1–E10 (wE1…wE10) |
| board | `design/recall-memory` fc9bc8d | `docs/plugins/board-design.md` §8, §7 | 4 needs (b1…b4) built on fE1, fE2, fE4, fE8/9 |

This file also records the user's decisions of 2026-11-08 on the watchdog (§0), which change the
watchdog design. They replace the earlier open question "is the watchdog bundled?". The user's answers to the two
open questions of the first cut (Q-A = B, Q-B = B) are U5 and U6; §9 now has none.

## 0. The user's watchdog decisions (2026-11-08)

| # | Decision (user's words where given) | Where it lands |
| --- | --- | --- |
| U1 | The watchdog is **bundled** with `fishball-instance`, like fold-notify and board: on by default, can be turned off, cannot be removed | X17, X18 |
| U2 | "开着时Fishball在启动会话时必须一并Assign Watchdog": while the watchdog is on, every session Fishball starts gets a brief at start | X16, enforced in code (§2.3) |
| U3 | With the watchdog **off**, Fishball runs everything directly, as v1 does today: permission requests and supervision go to Fishball; no watchdog tools, no watchdog prompt sections | §2.4 |
| U4 | "中途关掉会自动转交给Fishball": turning it off mid-way **hands the supervised sessions to Fishball**. Not a Q13 failure: the sessions keep running, nothing is halted. Fishball gets **one** notice listing them. Briefs and criteria are kept. Q13 halting applies only to failures while the watchdog is **on**. The coupling rule (R17) still holds, with Fishball as the supervisor | X14 hand-over, §2.4 |
| U5 | Q-A = **B**: while the watchdog is on, **every** managed session must have an **active** brief before Fishball sends it anything: sessions Fishball starts, sessions the user hands over, and sessions Fishball messages or redirects. Enforced by the instance. Reading, answering approvals or questions, and release stay allowed without a brief | X19, §2.5 |
| U6 | Q-B = **B**: turning the watchdog back on does **not** resume the kept briefs. They become `dormant`; Fishball gets one notice listing them and resumes each with `watchdog_resume`. A session whose brief is dormant has **no active brief**, so sends to it are refused (U5) until Fishball resumes that brief or writes a new one | X14, §2.4 step 6, §2.5 |

## 1. The canonical extension points

**One service.** Every point is a member of one Cordis service, **`fishballInstance`**, provided
by the instance's app row: `{apiVersion: 1, manager, chat, inbox, ui, attention, bridge,
sideAgents, approvals, supervision, sessionStarts}`.

*Why one service, and this name.* Fold and board named it `fishballInstanceExtensions`, the
watchdog `fishballInstance`. The watchdog's name is chosen because it is **versioned**
(`apiVersion`): a plugin injects it optionally (`'fishballInstance?'`), so a missing service or an
older `apiVersion` is "older instance". That covers board §11 `instance-hooks-missing` and fold
"plugin off" without a second probe. `fishballChat` stays the instance's **internal** port. No
plugin reads it, so the manager's identity (fE1) moves to `manager.sessionId()`.

**Rules for every point**
- `pluginId` is the caller's npm name (`fishball-fold-notify`, `fishball-board`,
  `fishball-watchdog`). It is also the **namespace**: record types are `plugin:<pluginId>/…`,
  routes `api/ext/<pluginId>/…`, UI files `ui/ext/<pluginId>/…`, signals `(pluginId, type)`.
  *Why.* fold used `fold-notify` in one place and the board used `fishball-board`; one rule means
  no second registry of short names.
- Every `register…`/`set…` returns `dispose()`. The plugin wraps it in its own `ctx.effect`, so a
  disposed row (disable, reload) removes all of its registrations. A second `dispose` is a no-op.
- **Single-owner** points refuse a second owner with `{code: 'owner-busy'}`. Fold's "first
  registered" and the watchdog's `delegate-busy` become one code.
- A registered callback that throws is logged once per `(pluginId, point)` and skipped. It never
  breaks the chat, the inbox or a page.

### 1.1 Table

| X | Canonical name and signature | Purpose | Used by | Merges |
| --- | --- | --- | --- | --- |
| X1 | `manager.sessionId() → string \| undefined` | Fishball's (the manager's) session id; refuse calls from other agents | fold, board, watchdog | fE1 = wE7 = b1 |
| X2 | `manager.registerSetup(pluginId, fn(agentCtx, agent)) → dispose` | the **one** way into the manager's agent scope: tools (`agentCtx.tools.register`), static sections (`systemPrompt.section`), dynamic context (`systemPrompt.context`). Runs on create and every resume, after the persona, in registration order. A late registration is applied to the live agent at once. Each registration runs as its own fiber `agentCtx.plugin({apply: fn})`, so `dispose` removes everything `fn` registered | fold (tool + section), board (2 tools, guide, dynamic context), watchdog (11 tools + loop section) | fE2 = b2; **replaces** wE3 `registerManagerTools` and wE4's `addManagerPromptSection` |
| X3 | `chat.registerRecordProjector(pluginId, type, fn(data, event) → {id, at, data, text?} \| undefined) → dispose` | show a plugin's log-only record in `GET api/chat` and the SSE `entry` frame as `{id, kind: 'plugin', plugin, at, data, text?}`; `type` must start `plugin:<pluginId>/`. **Added:** optional `text` (≤ `EXT_LIMITS.recordTextChars`, a new constant in `child/extensions.js`, equal to `CHAT_LIMITS.entryChars` (8000), the cap `chat.js` `notify` applies at `:679`), drawn by the instance as a plain record row when no page module renders the entry | fold (notice), watchdog (report, guard notices) | fE3; covers wE4's "shown in the manager's chat" |
| X4 | `ui.register({pluginId, module, style?, dictionaries}) → dispose`; `GET api/ui-extensions → [{pluginId, module, style?}]`; files served at `ui/ext/<pluginId>/…` with the `/ui/*` checks | load a plugin's page module; CSP stays `'self'` | fold, board | fE4 (a–c) = b3 |
| X5 | `ui.registerRoute(pluginId, {method, path, handler(req) → {status, body}}) → dispose`, served at `api/ext/<pluginId>/<path>`, same bearer and body limits as `api/*` | a plugin's JSON routes | fold (`seen`), board (`board`, `export`) | fE4 (d) = b3 |
| X6 | `ui.signal(pluginId, type)` → SSE event `ext` `{pluginId, type}`, data-free, coalesced per `(pluginId, type)` per tick | tell a module to re-read | board | b3 (b) |
| X7 | Page hook object passed to each module's default export: `{document, i18n, request, sidebar({order}) → HTMLElement, onSignal(type, fn) → dispose, setTimelinePresenter(presenter) → dispose}` | page-side reach: an aside container (mounted above `#reminders`, ordered by `order`), the signal filtered to the module's own `pluginId`, and the **single-owner** timeline presenter with fE5's exact shape | fold (presenter), board (sidebar, signal) | fE5 + b3 (a)(b) |
| X8 | `attention.set(pluginId, {unread, importantUnread, latestAt}) → dispose`, single owner | the value sent as contract 1.2 `instance.attention` (§3) at once, after every handshake, and `{0, 0, null}` on dispose | fold | fE6 (instance half) |
| X9 | `inbox.claim({pluginId, kind, match(item) → key?}, onItem(item, key)) → dispose`; `inbox.release(key, {deliver, prefix?})`; `inbox.setBatcher(pluginId, fn(item, deliver)) → dispose` (single owner) | **one inbox pipeline** in `inbox.js receive`: approvals-row items → **claims** (a claimed item is acked at once and held) → **batcher** → `deliverInbox`. `release(…, {deliver: true})` re-enters the pipeline after the claims, so a released item is batched like any notice. `deliverInbox` gains an array form (fE7). `PERMISSION_NOTICE` marker added to `inbox-markers.js` | watchdog (claims), fold (batcher) | wE2 + fE7 |
| X10 | `manager.notify({pluginId, dedupeKey, text, record?: {type, data}, wake}) → Promise<{queued \| held \| duplicate}>` | a plugin's message to Fishball: `wake: true` is one notice turn (source `{kind: 'fishball-notice', form: 'plugin', pluginId}`); `wake: false` is held for the next turn; dedupe is durable. **Not batched** (fold §7 batches inbox items only) | watchdog | wE4 (notify half) |
| X11 | `manager.userTexts({limit, maxChars}) → [{text, at}]` | newest-first texts written by the **user** in Fishball's session, read-only | watchdog (`userQuote`) | wE8 |
| X12 | `bridge(pluginId, operations[]) → client` | a scoped connector client; an operation outside the list is refused `forbidden` locally; the list must lie within the instance's required set (no new handshake) | watchdog | wE1 |
| X13 | `sideAgents.open({…}) → {agent, sessionId, setSection}`, `sideAgents.runTurn(agent, message, {timeoutMs, signal})`, `sideAgents.cancel(agent)` | locked-down side sessions: read-only, approval `never`, every global tool denied | watchdog | wE5 (unchanged) |
| X14 | `supervision.register(pluginId) → {set(sessionId, state, briefId), clear(sessionId), handedOver, dispose}` with `state` ∈ `active`, `paused`, `halted`, **`dormant`**; `supervision.onManagedChange(listener)`; `supervision.endingReason() → 'hand-over' \| 'failure' \| undefined` | the persisted supervised set, the `plugin-gone` guard, managed-change events; **added:** the user's-disable **hand-over** (§2.4) and the **`dormant`** state of a brief kept across off → on (U6). `set` is synchronous and persisted before it returns, so a send right after it is judged on the new state | watchdog | wE10 + U4 + U6 |
| X15 | `approvals.setDelegate({id, name, onCard}) → dispose`, `card(approvalId)`, `onSettled`, `answerApproval({…, decidedBy})`, `supervised(sessionIds)`; the escalation card in the chat | the approval seam and its UI (the "代批 / Watchdog" tag; the open escalation card) | watchdog | wE6 + wE9 |
| X16 | `sessionStarts.register(pluginId, {parameter, schema, validate(arg) → {ok:true} \| {code}, attach(sessionId, arg) → Promise<{ok:true} \| {code}>}) → dispose`, single owner | **new (U2)**: while registered, `start_session` has one more **required** argument and cannot start a session without it (§2.3). `attach` ends with `supervision.set(id, 'active')`, so the started session is sendable at once | watchdog | new |
| X19 | **Send gate** (instance-internal; the plugin only feeds it through X14): one check `gate.send(operation, sessionId) → ok \| {code, reason}` called by the bridge client for every manager→session send operation (`SUPERVISION.sendOperations` = `session.message`, `session.redirect`), plus the hand-over hint (§2.5) | **new (U5)**: while the gate is on, no send reaches a session without an **active** brief; replaces wE10's gate, which only covered `paused`/`halted` | watchdog | wE10 gate + U5 |
| X17 | `RUNTIME.bundledPlugins = [{name: 'fishball-fold-notify'}, {name: 'fishball-board'}, {name: 'fishball-watchdog'}]` and placement at every child start | built in, on at first placement | all three | fE8 = b4 |
| X18 | `admin.plugins.get` marks a bundled plugin `{bundled: true, removable: false}`; `admin.plugin.remove` refuses `bundled-plugin`; enable/disable work. **Added:** disabling `fishball-watchdog` is a hand-over (§2.4) | the off switch the user keeps | all three | fE9 + U4 |
| K1 | contract 1.2 `instance.attention` + connector `state.unread = {count, important}` | the brand mark and frame unread count (today always 0) and the important alert | fold | fE6 (wire half), fold §9.1 |

### 1.2 Disagreements and the pick

| Topic | Options | Pick | Why |
| --- | --- | --- | --- |
| Manager-scope mechanism | fE2 `registerAgentSetup(fn)` vs wE3 `registerManagerTools` + wE4 `addManagerPromptSection` | **X2 only** | wE4 takes a static `{name, text}`, so the board's per-turn context cannot use it (board §8 b2). The DSH scope already has `tools.register`, `systemPrompt.section` and `systemPrompt.context` (§4). Helpers would duplicate them. |
| Service name | `fishballInstanceExtensions` vs `fishballInstance` | `fishballInstance` (`apiVersion: 1`) | versioned; one optional inject detects an older instance |
| Manager identity | `fishballChat.sessionId()` vs `manager.sessionId()` | `manager.sessionId()` | keeps `fishballChat` internal; it sits next to the other manager members |
| Single-owner refusal code | "first registered wins" (fE5) vs `delegate-busy` (wE6) | `owner-busy` for X7 presenter, X8, X9 batcher, X15 delegate, X16 | one rule, one test partition |
| Namespace | `fold-notify` vs `fishball-board` | the package name | one rule for records, routes, files and signals |
| Showing plugin records | fE3 needs a page module; the watchdog has none | X3 with an optional `text` fallback | the watchdog's guard notice must reach the user even with fold-notify off (watchdog §4.5.4 step 3) |
| Inbox: claims vs batcher order | not stated by either | claims first, then the batcher; a released item re-enters after the claims | a claimed approval notice must never be delivered, batched or not; a released notice is an ordinary notice for fold §7 |
| Watchdog's own `enabled` setting (watchdog §9) vs the Plugins block switch (X18) | two off switches | **one**: the Plugins block switch; the `enabled` setting is removed | fold §10 did the same. With two switches, "off" would have two meanings (halt vs hand-over), and U4 defines off as hand-over |

## 2. Behaviour the reconciliation adds

### 2.1 Order inside the manager's setup (X2)

`configure` (create): sandbox, approval policy, persona, then each X2 registration in registration
order. `composePersona` (resume): persona, then the same registrations. A registration made
while the agent is live runs `agentCtx.plugin(...)` on the live agent's scope.
**SP-X1 (done, yes on both versions, `docs/spikes/instance-ext.md`):** a late registration is
offered from the next model request, even inside the running turn (the step after the tool result).
`dispose` removes its tool and section from the next request.

### 2.2 Bundling (X17, X18)

Fold §13 steps 1–7 for each entry of `RUNTIME.bundledPlugins`, in list order. Steps 2 and 6 are
sharpened by **SP-FN1** (`docs/spikes/instance-ext.md`, yes on both versions with these two
conditions):
1. an exact-version `dependencies` entry in `packages/instance/package.json`;
2. at every child start, a copy to `<child profile>/vendor/<name>` **and** to
   `<child profile>/node_modules/<name>` (each to a temp directory, then renamed, with
   `copyChildCode`'s rules; no pnpm run by the instance).
   - *Why both.* DSH resolves a bundle only through `node_modules`, and a `file:` entry alone is
     skipped. `vendor/` is the `file:` source that a later `admin.plugin.install` (`pnpm add`)
     reinstalls from. The profile is `nodeLinker: hoisted`, so a real directory in `node_modules`
     is what pnpm itself would place;
3. the child manifest gets `dependencies[name] = "file:./vendor/<name>"`, and `dsh.profile.bundles`
   gets the name **only the first time** (runtime state `bundled: [...]`), so a disable survives
   restarts and upgrades. *Required, not optional:* DSH's disable removes the name from
   `dsh.profile.bundles` (`selectBundle`), so adding it on every start would turn the plugin on
   again;
4. it is on at the first placement;
5. the settings view shows "Built in", the switch and the settings, with no Remove;
6. a failed placement logs `BUNDLED_PLUGIN_UNAVAILABLE`, and the child starts without it.
   - DSH only skips an unresolvable bundle. But `initializeProfile` fails the start on any skipped
     bundle (`installation.js:154`).
   - So that check ignores exactly the bundled names whose placement failed **this** start; every
     other skipped bundle stays fatal.
   - The manifest is not edited on a failure, because its bundle list is the user's enable state;
7. `uninstall.js` needs no change.

Each name is placed **independently**: one failed placement does not stop the others.

**Watchdog bundled (U1).** For the watchdog, a failed placement while the persisted supervised set
is non-empty is the Q13 cause `plugin-gone`. The instance's guard stops those sessions after
`guardGraceSeconds`. The user listed "plugin missing" as a failure, so this is not a hand-over.

### 2.3 A watchdog at every start (U2, X16)

While a `sessionStarts` owner exists:

1. `start_session` is registered again with one more parameter, `watchdog` (the owner's
   `schema`), and it is **required**. In the watchdog this is the `watchdog_brief` fields without
   `session_id`. The tool's description gets one line saying a watchdog brief is required.
   *Why the schema and not prompt text alone.* The model cannot leave out a required argument
   without the call failing validation, and step 2 checks it again in code.
2. `execute`: first `validate(arg)`. If it fails, the call answers
   `{ok: false, code: 'watchdog-brief-required' | <validate code>}` and **no session is started**.
3. Then `session.start` as today. A failed start answers as today, and nothing is attached.
4. Then `attach(sessionId, arg)`, which creates the brief, its watch and the supervised entry
   (`supervision.set(id, 'active')`, so the session is sendable as soon as the call returns). On
   success the result also carries `{watchdog: {briefId}}`.
5. If `attach` fails or times out (`SESSION_STARTS.attachTimeoutMs`, a new constant in `child/ext/session-starts.js`, equal to the bridge's `requestTimeoutMs` (30 s, `child/bridge.js:38`)), the instance calls
   `session.stop` on the new session and answers
   `{ok: false, code: 'watchdog-assign-failed', sessionId, stopped: true | false}`.
   *Why stop.* The coupling rule (R17): a session with no watchdog would otherwise run on, in a
   state the user ruled out. If the stop fails as well, the result says `stopped: false`, and the
   session stays managed for Fishball to handle. That is the same visible failure the guard
   reports.
6. **The start-to-attach window.** The session is running before step 4 ends. A permission card in
   that window has no brief yet, so it goes to Fishball (watchdog §6 "no brief → Fishball"),
   which is safe.
7. When the owner disposes (watchdog off), `start_session` is registered again **without** the
   parameter, exactly as in v1.

*Scope.* `start_session` is where a session **gets** its brief. Every later send to any managed
session is checked by the send gate (§2.5, U5).

### 2.4 Watchdog off: what Fishball does (U3) and the hand-over (U4)

**Off from the start (U3).** The row is not loaded, so none of its X2, X9, X10, X14, X15 or X16
registrations exist. Inbox notices and permission cards reach Fishball as in v1. Fishball has no
`watchdog_*` tools and no watchdog section, and `start_session` has no `watchdog` parameter. The
instance's own persona never mentions the watchdog.

**Turned off mid-way (U4): the hand-over.** The only off path is the Plugins block switch (X18),
served by the instance's `admin.js`. So the instance knows a disable is the user's and not a
failure.

1. `admin.plugin.disable` of `fishball-watchdog`: the instance records the intent
   `hand-over-pending`, then calls `pluginManager.setBundleEnabled(name, false)`. If that fails,
   the intent is cleared and nothing else changes.
2. While the row disposes, `supervision.endingReason()` returns `'hand-over'`. The plugin then
   keeps its briefs, criteria and audit, and does **not** unwatch: its `finished` watches stay, and
   their notices now reach Fishball, because the claims are gone. It does not stop any session.
3. The instance, on the registrant's disposal with the intent set:
   - moves every supervised entry into `handedOver: [{sessionId, briefId, state, at}]` in its own
     supervision file and empties the supervised set;
   - **turns the send gate off** (§2.5; `gateOn: false` in the supervision file), so paused or
     halted sessions and sessions without a brief can all be messaged. A stopped session stays
     stopped;
   - starts **no** grace timer and stops nothing;
   - sends **one** waking `manager.notify` (dedupe `watchdog-handover:<at>`) that lists the
     sessions, their titles and their states, and says Fishball now handles their approvals and
     supervision directly;
   - clears the intent.
4. From then on Fishball is the supervisor. Approvals go to Fishball (no delegate), finished
   notices go to Fishball, and Fishball's `answer_approval` `grant` is allowed again (X15
   `supervised` is empty). So R17 holds: no session runs without a supervisor.
5. **Failures stay Q13.** A disposal **without** the intent (crash, a failed reload, a failed
   placement) is `plugin-gone`. So are model unavailable, repeated failures, 900 s without a
   successful check while running, and a broken store, all of which can happen only while the
   watchdog is on: those halt, stop and notify exactly as watchdog §4.5.4 says. The cause
   `disabled` is removed from the watchdog's halt causes.
6. **Turning it on again (U6, no automatic resume).** The first `supervision.register` after a
   hand-over:
   - turns the send gate on again (`gateOn: true`);
   - moves every `handedOver` entry into the supervised set as **`dormant`** (same `briefId`) and
     returns the list to the plugin;
   - the plugin sets each kept brief to `dormant` in its own store, starts **no** timer, makes no
     check and stops nothing, then sends **one** waking `manager.notify` (dedupe
     `watchdog-reenabled:<at>`) listing the dormant briefs (brief id, session, title) with "resume
     each with `watchdog_resume`, or write a new brief with `watchdog_brief`; until then Fishball
     cannot send to these sessions". With an empty list, no notice.
   - **Dormant means "no active brief"** for U5. The session may keep running: Fishball is still
     its supervisor (its approvals go to Fishball, watchdog §6 "no brief → Fishball"; its finished
     notices reach Fishball). Only sends to it are refused until the brief is active.
   - `watchdog_resume` on a dormant brief runs watchdog §4.5.3 steps 1–4 and then
     `supervision.set(id, 'active')`. `watchdog_brief` on a session whose brief is dormant ends the
     dormant brief (`endedReason: 'superseded'`) and creates the new one active. Both unlock sends
     at once.
   - Sessions Fishball started, or the user handed over, while the watchdog was off have **no**
     brief at all. They are treated as in §2.5: sends are refused until Fishball writes one.

### 2.5 Every managed session needs an active brief (U5, X19)

**When the gate is on.** `gateOn` is persisted in the instance's supervision file. It is set true
by the first `supervision.register` and false only by the user's-disable hand-over (§2.4 step 3).
*Why persisted, not "a registrant exists".* After a crash or during child boot the row may not be
registered yet; a gate that opened then would let sends through unsupervised. With `gateOn` true
and no registrant, sends are refused `watchdog-unavailable` (the plugin-gone guard of X14 covers the
rest). With the watchdog off from the start, `gateOn` was never set, so v1 behaviour is untouched
(U3).

**Where it sits.** In the bridge client's one request path (`child/bridge.js`), for the operations
in `SUPERVISION.sendOperations`. Both send paths go through it: the `message_session` /
`redirect_session` tools (`session-tools.js:195,207`) and the image-carrying sends
(`images.js:412,417`). *Why there and not in each tool.* A later send path cannot skip it, and the
watchdog's own scoped bridge (X12) is never given a send operation anyway.

**The rule** (checked before the request leaves the child; nothing reaches the connector on a
refusal):

| Gate | Brief of the target session | `message_session`, `redirect_session`, image sends |
| --- | --- | --- |
| off | any | allowed (v1) |
| on, no registrant | any | refused `watchdog-unavailable` |
| on | `active` | allowed |
| on | `paused`, `halted` | refused `supervision-paused` (watchdog §4.5.2, §4.5.4) |
| on | none, `dormant` | refused **`watchdog-brief-required`** |

The `watchdog-brief-required` result is `{ok: false, code, sessionId, briefId?, reason}`, and the
`reason` tells Fishball the next step: "This session has no active watchdog. Call `watchdog_brief`
for it (or `watchdog_resume` for brief `<briefId>`), then send again."

**Not gated** (no brief needed): `read_session`, `list_sessions`, `watch_session`,
`unwatch_session`, `list_watches`, `answer_approval`, `answer_question`, `answer_prompt`,
`ask_user`, `list_grants`, `revoke_grant`, `release_session`, and `stop_session`. *Why
`stop_session` too.* It only ends execution, so it can never let work run unsupervised, and
blocking it would stop Fishball from halting a session that misbehaves before it has a brief.
`start_session` is governed by X16 instead.

**The hand-over path (smooth, one extra call).**
1. The user hands a session over. The connector pushes the `user` inbox item (contract §4.5).
2. While the gate is on and that session has no active brief, the instance's `deliverInbox`
   **prepends one fixed line** to the item's text, `TEXT.briefRequired(sessionId)`: "This session
   has no watchdog yet. Call `watchdog_brief` with session_id `<id>` before replying to it." The
   same line is prepended to a `session` item (a message the session sent with
   `message_fishball`) from a session without an active brief. *Why the instance and not an X9
   claim.* A claimed item is acked at once; a hand-over note is the user's words and must keep the
   normal ack-after-queue rule.
3. Fishball calls `watchdog_brief({session_id, …})` once. It creates the brief, its watch and
   `supervision.set(id, 'active')` before it returns; the result carries `sendUnlocked: true`.
4. Fishball's next `message_session` to it is allowed. If Fishball replies first, it gets
   `watchdog-brief-required` with the same instruction, so the order is self-correcting.

Approvals and questions of a session without an active brief reach Fishball in the meantime (no
delegate covers it), so a hand-over never leaves a card unanswered.

## 3. Contract 1.2 scope (K1)

Exactly two additions. Both are additive, and nothing else changes:

| Item | Shape |
| --- | --- |
| Operation `instance.attention` (instance → connector), capability `instance.attention` | `{unread, importantUnread, latestAt}` → `{accepted: true}`; integers with `0 ≤ importantUnread ≤ unread ≤ LIMITS.unreadMax` (9999); `latestAt` an epoch-ms integer or `null`. An invalid frame fails validation as contract §3.1 says, and the last valid value stays |
| Connector view `state.unread = {count, important}` | `count = unread`, `important = importantUnread > 0`; `{0, false}` when no value, on detach and on transport close. This fixes today's bug: `client.js:740` reads `state.unread?.count`, but `index.js:137-232` has no `unread` view, so the count is always 0 |

- `CONNECTOR_CONTRACT.minor` 1 → 2 (`packages/connector/contract/contract.js:1289`).
  `LIMITS.unreadMax` goes in `limits.js`.
- The instance **never** lists `instance.attention` in `requiredCapabilities`. It sends the value
  only when the welcome lists the capability.
- **Not in 1.2:** watchdog F1 (`session.supervise`) and F2 (a user-answer operation). The watchdog
  stays child-side, and its hand-over and start rule (§2.3–§2.4) need no wire change.

**Mixed peers** (from `contract.js` itself):

| Instance | Connector | Result |
| --- | --- | --- |
| 1.2 | 1.2 | attention sent; brand count and alert work |
| 1.2 | 1.1 | attaches (`:1381` "accept any minor of this major"). The welcome lacks the capability, so nothing is sent. If it were sent, the 1.1 side answers `unsupported-operation` and keeps the channel open (`:1146-1150`). The count stays as on 1.1 today; the chat page's own important bar still shows |
| 1.1 | 1.2 | attaches; the unknown-capability rule (`:560-564`) does not apply because the 1.1 instance announces nothing new; it never sends attention, so `state.unread = {0, false}` |

## 4. Compatibility: DSH 0.2.1-rc.5 and 0.2.2-rc.1

Read under `~/Library/Application Support/DSH/data/versions/<v>/node_modules/@deepseek-ai/`
(read only). Lines are of `lib/types/` files.

| API | Used by | 0.2.1-rc.5 | 0.2.2-rc.1 |
| --- | --- | --- | --- |
| `AgentSetup = (agentCtx, agent) => commit?` | X2, X13 | `dsh-agent/…/index.d.ts:40` | `index.d.ts:41` |
| `create/resume({…, setup})` | X2, X13 | `dsh-agent/…/index.d.ts:103,127` (methods `:278,286`) | `:105,129` (`:292,300`) |
| `agents.get(id)` | X2 late apply, X13 | `dsh-agent/…/index.d.ts:343` | `:357` |
| Cordis `ctx.plugin(plugin, config)` (X2's fiber per registration) | X2 | `cordis/…/registry.d.ts:120,198` | `:120,198` |
| Cordis `ctx.provide(name, value)` | `fishballInstance` | `cordis/…/reflect.d.ts:144` | `:152` |
| Cordis `ctx.effect(execute)` | every `dispose` | `cordis/…/fiber.d.ts:157,159` | `:161,163` |
| `tools.register(def)` | X2 (inside), X16 re-register | `dsh-tools/…/index.d.ts:637`, one argument | `index.d.ts:50`, `(def, options?)`: use the one-argument form |
| `ToolDefinition` | X16, plugin tools | `dsh-tools/…/index.d.ts:115` | `contracts.d.ts:23` |
| `exec.agent` (optional) | X1 checks | `dsh-tools/…/index.d.ts:229` | `contracts.d.ts:176` |
| `ToolDefinition.when` | not used | **absent** | `contracts.d.ts:118` |
| `tools.restrict`, `tools.schemas` | X13 | `dsh-tools/…/index.d.ts:645,712` | `index.d.ts:58,110` |
| `systemPrompt.section`, `.context` | X2 (inside) | `dsh-system-prompt/…/index.d.ts:250,269` | `:256,275` |
| `appendPluginRecord` | X3 sources, X10 `record` | `dsh-session/…/index.d.ts:117` | `:121` |
| `setSandboxMode`, `setApprovalPolicy` | X13 | `dsh-sandbox-policy/…/session-mode.d.ts:49`; `dsh-user-approval/…/index.d.ts:63` | same files, `:49`; `:63` |
| `agent.cancel`, `agent.followup` | X10, X13 | `dsh-agent/…/runtime-types.d.ts:157,192` | `:184,219` |
| `llm.resolveModelInfo`, `resolveCallConfig` | X13 checks | `dsh-llm/…/index.d.ts:377,391` | `:377,391` |
| `pluginManager.listBundles`, `setBundleEnabled`, `removeBundle` | X18 | `dsh-plugin-manager/…/index.d.ts:88,111,141` | `:128,193,226` |
| `BundleInfo.enabled`, `.removable` | X18 | `dsh-plugin-manager/…/types.d.ts:69,82` | `:92,105` |
| refusal code `not-removable` | X18 | `types.d.ts:19` | `types.d.ts:40` |
| `initProfile`, `readProfileManifest`, `loadProfileDirectory`, `resolveProfileDir` | X17 | `dsh-app-boot/…/profile.d.ts:155,215,248,134` | `:137,197,231,129` |
| `writeProfileBundles` | X17 | `dsh-app-boot/…/profile-plugins.d.ts:48` | `:48` |

Not proven by types, so these were spiked (`docs/spikes/instance-ext.md`, 2026-11-08). The result on both versions is noted after each:
- **SP-X1:** X2's late registration on a live agent takes effect at the next step. **Yes**,
  including mid-turn; `dispose` removes it.
- **SP-FN1 (fold §14):** a `file:` vendored bundle loads from the child profile, survives an
  `admin.plugin.install`, and its disable persists. **Yes**, if the package is also placed in
  `node_modules` (§2.2 step 2). It survives `pnpm add` of another bundle, and a disable persists
  across a restart.
- **B0/S1 (board §12):** an agent-scoped context is re-materialised after a compaction and after a
  resume. **Yes**: the provider is evaluated on every request, after `compactNow` and after
  `agents.resume` with the same `setup`. *Note for B5:* earlier values remain in the history as
  older `request/context` entries until a compaction, so the board guide says the newest board block
  is the current one.

No behaviour branches on the DSH version. `engines.dsh` is `>=0.2.1-rc.5` for the instance and all
three plugins. The board's `>=0.2.1-rc.2` is raised to match, because X17 is tested only on rc.5
and rc.1.

## 5. Tasks

Every task is one dev branch from the then-current `feat/body-soul`. The tester writes its tests
first, from §6 and this spec only. A dev session does not read the tests.

**Collision rule.** X0-C creates `child/extensions.js` with every member as a typed stub. Each
other X0 task owns **its own** new file `child/ext/<area>.js` and fills its member there.
`extensions.js` only composes, so the X0 tasks do not edit one shared file.

### 5.1 Instance and contract (X0, K1)

| Task | Owns | Depends | Done when |
| --- | --- | --- | --- |
| **SP** spikes SP-X1, SP-FN1, B0/S1 | `spikes/instance-ext/*`, `docs/spikes/instance-ext.md` | — | **done 2026-11-08: all yes on both versions** (§4) |
| **K1** contract 1.2 + connector `unread` | `packages/connector/contract/{contract,limits}.js`, `docs/connector-contract.md`, `packages/connector/src/slim/host/bridge.js`, `src/connector-service.js`, `index.js` | — | §3 table holds; 1.1 instance attaches; `state.unread` follows the last valid value, `{0,false}` on detach and close |
| **X0-C** core: service, manager, chat | new `child/extensions.js`; `child/app.js` (provide); `child/chat.js` (X1, X2 chain in `configure`/`composePersona` + live apply, X3 in `entryOfEvent`, X10, X11, `deliverInbox` array form and the X19 prefix call); `child/bridge.js` (**only** the one X19 `gate.send` call in the request path, a pass-through stub) | — (SP-X1 done) | `fishballInstance` v1 provided; X1–X3, X10, X11 behave as §1; every other member a stub that refuses `not-implemented`; the X19 call sites exist and pass everything while `gateOn` is unset; the instance tests are unchanged and green with no plugin |
| **X0-I** inbox pipeline | `child/inbox.js`, new `child/ext/inbox.js`, `src/slim/inbox-markers.js` | X0-C | X9: claims before the batcher, release re-enters, ack/refuse per item |
| **X0-U** page modules | `child/server.js`, new `child/ext/ui.js`, `ui/shell.{js,html,css}`, `ui/chat.js` | X0-C | X4–X7; the X3 `text` fallback row; the CSP unchanged; with no module, the page is identical to today |
| **X0-W** wire: scoped bridge + attention | `child/bridge.js`, new `child/ext/{bridge-scope,attention}.js` | X0-C, K1 | X12 local `forbidden`; X8 sent on set, on each handshake, zero on dispose, skipped without the capability |
| **X0-G** side agents | new `child/ext/side-agents.js` | X0-C | X13 lock-down on both versions |
| **X0-A** approvals seam + escalation card | `child/approvals.js`, `child/decisions.js`, `ui/approvals.js`, `ui/records.js` | X0-C | X15; old labels load as manager-decided; `delegate-no-grant`, `grant-off-supervised` |
| **X0-S** supervision, start rule, send gate | `child/session-tools.js`, new `child/ext/{supervision,session-starts,send-gate}.js` | X0-C | X14 guard, managed changes, `dormant`, hand-over and re-enable (§2.4 steps 3–6); X16 (§2.3); X19 table and hand-over line (§2.5), on both send paths |
| **X0-B** bundling + admin | `packages/instance/package.json`, `src/native-runtime/{constants,installation,files,index}.js`, `child/admin.js`, `ui/settings.js`, `ui/i18n.js` | X0-S (the hand-over port, stubbed until merged); SP-FN1 done | X17, X18 for the three names; hand-over intent order (§2.4 step 1); a failed placement of one name leaves the others |

### 5.2 Plugin tasks, re-based on the canonical names

| Task | Was | Owns | Depends |
| --- | --- | --- | --- |
| FN-1 skeleton | FN-1 | `packages/fold-notify/{package.json,cordis.patch.yml,index.js,src/constants.js,src/config.js}` | — |
| FN-2 tool + section | FN-2 | `src/tool.js` | X0-C (X1, X2), FN-1 |
| FN-3 notices, seen, attention | FN-3 | `src/notices.js` | X0-C (X3), X0-U (X5), X0-W (X8), FN-1 |
| FN-4 presenter | FN-4 | `ui/fold.js`, `ui/fold.css`, `ui/i18n.js` | X0-U (X4, X7) |
| FN-5 page notify side | FN-5 | `ui/notify.js` (+ `ui/fold.css` after FN-4) | FN-3, FN-4 |
| FN-6 turn batching | FN-6 | `src/batcher.js` | X0-I (X9 batcher), FN-1 |
| FN-A connector alert | FN-A | `packages/connector/client.js` (fold §9.1 rows) | K1 |
| — | FN-0, FN-E6, FN-K, FN-B | absorbed into X0-*, K1 | — |
| WD-1 … WD-10 | same | `packages/watchdog/…` as watchdog §14 | WD-0 → the X0 task that owns the point (WD-8: X0-G; WD-10: X0-I, X0-A) |
| WD-11 manager tools | WD-11 | `src/manager-tools.js` | registers through **X2** (not wE3/wE4); X0-C, WD-2, WD-3, WD-6, WD-9, WD-13 |
| WD-13 coupling | WD-13 | `src/coupling.js` | X0-S; **adds** `endingReason()` handling (§2.4 step 2), the `handedOver` → `dormant` list on register with the one notice (§2.4 step 6), `watchdog_resume` of a dormant brief, `watchdog_brief` superseding a dormant brief |
| **WD-14** start-time assignment (new) | — | new `src/start-assign.js` | X0-S (X16), WD-2, WD-6, WD-13 |
| WD-12 integration | WD-12 | `index.js` wiring, e2e | all WD, X0-B |
| B1 … B5 | same | `packages/board/…` as board §14 | X0 → X0-C (X1, X2), X0-U (X4–X7) |
| B6 meow-memory recommended | B6 | `src/recommended.js`, `src/slim/host/admin.js`, `ui/settings.js`, `ui/i18n.js`, DESIGN.md | **after X0-B** (shares `settings.js`, `i18n.js`) |
| B7 meow in the child | B7 | test rig only | B6 |
| B8 board e2e | B8 | `test/e2e/board.*` | B1–B5, X0-B |
| — | B9 | absorbed into X0-B (all three names) | — |
| **X-E2E** three bundled together | new | `test/e2e/bundled.*` | X0-*, FN-7, WD-12, B8 |
| FN-7 docs | FN-7 | README, contract cross-check | all FN |

### 5.3 Waves

| Wave | In parallel |
| --- | --- |
| W0 | K1, X0-C, FN-1, WD-1, B1 (SP done) |
| W1 | X0-I, X0-U, X0-G, X0-A, X0-S, X0-W (needs K1), FN-A (needs K1); WD-2, WD-3, WD-4, WD-5, WD-7; B2, B3 |
| W2 | X0-B (needs SP, X0-S); FN-2, FN-4, FN-6; WD-6, WD-8, WD-9; B4 |
| W3 | B6 (after X0-B); FN-3; WD-10, WD-11, WD-13 (shared stub, as watchdog §14); B5 |
| W4 | FN-5; WD-14; B7 |
| W5 | FN-7, WD-12, B8, then X-E2E |

**File pairs that collide.** Merge each pair in the order shown, never in parallel on the same
lines.

| Pair | Shared file | Order |
| --- | --- | --- |
| X0-B, B6 | `ui/settings.js`, `ui/i18n.js` | X0-B first |
| X0-B, X0-A | `ui/i18n.js` (`settings.builtIn` vs `approvals.by.watchdog`) | append-only keys; X0-A first, X0-B rebases |
| X0-S, X0-B | the hand-over port | X0-S first, or X0-B against X0-C's stub |
| X0-C, X0-I | `deliverInbox` array form lives in `chat.js` | X0-C first (it owns `chat.js`) |
| X0-C, X0-W | `child/bridge.js` (X0-C adds only the X19 call; X0-W the scope and attention) | X0-C first |
| X0-U, X0-A | `ui/chat.js` vs `ui/records.js`; the escalation card stays in `records.js`/`approvals.js` | none if X0-A keeps out of `ui/chat.js` |
| K1, FN-A | none (`client.js` is FN-A's only) | — |
| FN-4, FN-5 | `ui/fold.css` | FN-4 first |
| WD-11, WD-13 | the coupling interface | shared stub, as watchdog §14 |

## 6. Test-design outline per task (black-box, for the tester)

Each line names the technique: **EP** equivalence partitions, **BVA** boundary values, **DT**
decision table, **ST** state transitions.

- **SP.** Only the spike's yes/no questions; no TDD.
- **K1.**
  - EP: instance 1.1 / 1.2 × connector 1.1 / 1.2; a valid frame, a malformed frame, an unknown
    extra field.
  - BVA: `unread` −1, 0, 1, 9999, 10000; `importantUnread` 0, `= unread`, `unread + 1`;
    `latestAt` null, 0, a float.
  - DT: §3 mixed-peers table.
  - ST: `unread` view none → value → newer value → detach `{0,false}` → reattach (stays `{0,false}`
    until a report) → close.
- **X0-C.**
  - EP: caller = manager or another agent; `fishballInstance` present or absent; `apiVersion` 1 or
    another.
  - DT for X2: create or resume × registered before or after live × `fn` ok, throws or async
    → whether it was applied, and the order (persona first, then the registrations in order).
  - ST for X2: registered → applied → disposed (its tools and section gone at the next step) →
    registered again; a registration made **during a turn** is offered at the turn's next step
    (SP-X1).
  - X3: `type` with a foreign prefix is refused; `fn` returns `undefined` (dropped); `text`
    present or absent.
  - BVA: `text` at `EXT_LIMITS.recordTextChars` and +1.
  - X10 DT: `wake` × duplicate `dedupeKey` × agent busy or idle. X11 BVA: `limit` 0, 1, max, max+1;
    `maxChars` cut at a surrogate pair.
- **X0-I.**
  - EP: item kinds `session`, `watch`, `approval` marker, `system`, `plugin`, `user`, a card
    record.
  - DT: claimed × batcher present × `user` kind → claimant, batch or direct.
  - ST: claim held → release `deliver:true` (re-enters the batcher) / `deliver:false` / card
    settles (dropped) / `expiresAt` passes.
  - BVA: `prefix` 500 and 501 chars.
  - Single owner: a second batcher gets `owner-busy`.
- **X0-U.**
  - EP: 0, 1, 2 modules; a module file missing or a path escape (404); a route with a wrong method
    (405); a body over the limit.
  - X6 coalescing: n signals in one tick give one event. `sidebar` order: equal orders and negative
    orders.
  - Presenter: a second one gets `owner-busy`.
  - CSP header unchanged. The X3 fallback row is drawn when no module renders the entry.
- **X0-W.**
  - EP: an operation in the scope list, outside it, or outside the instance's required set (refused
    at `bridge()`).
  - DT for X8: capability present × owner set or disposed × handshake again → sent or not, and the
    value.
  - ST: none → value → reconnect (the same value sent again) → dispose `{0,0,null}`.
- **X0-G.** Watchdog §15 lock-down partitions: a global tool call `not-permitted`, a scoped name
  allowed, sandbox `read-only`, approval `never`. Resume after a restart.
- **X0-A.**
  - DT: `decidedBy` present × decision `allow`, `reject`, `grant`, `ask` → `delegate-no-grant` on
    `grant`; manager `grant` on a supervised session `grant-off-supervised`.
  - EP: old labels without `decidedBy` load as manager-decided.
  - ST for the escalation card: open → settled or closed.
- **X0-S.**
  - DT for the gate: state `active`, `paused`, `halted`, handed-over × `message_session`,
    `redirect_session`.
  - ST for the supervised entry: none → active ⇄ paused → halted; any → (release, take-back)
    cleared; any → handed-over (user disable).
  - DT for disposal: intent set? × entries non-empty? → hand-over (one notice, no stop, gate lifted)
    or guard after the grace (stop running and managed ones, `plugin-gone`).
  - BVA: re-register at 29 s, 30 s and 31 s.
  - X16 DT: owner present × `watchdog` argument absent, invalid or valid × start ok or failed ×
    attach ok, failed or timeout × stop ok or failed → the exact result code, and whether a
    session runs.
  - X16 ST: the `start_session` schema with and without the parameter, as the owner registers and
    disposes.
  - **X19 DT: session origin × watchdog × brief → send result.** Origins: started by Fishball while
    on (brief from X16); started while off; handed over while on; handed over while off; made
    managed by `answer_prompt`; kept across off → on (dormant). Watchdog: off from the start; on;
    on but not registered (boot or crash); turned off (hand-over). Brief: none, active, paused,
    halted, dormant. Expected results by the §2.5 table; in particular:

    | Origin | Watchdog | Brief | `message_session` / `redirect_session` / image send |
    | --- | --- | --- | --- |
    | any | off from the start | — | allowed |
    | any | turned off (hand-over) | any kept | allowed |
    | started by Fishball | on | active | allowed |
    | started while off | on | none | `watchdog-brief-required` |
    | handed over | on | none | `watchdog-brief-required` |
    | handed over | on | active (after `watchdog_brief`) | allowed |
    | `answer_prompt` made managed | on | none | `watchdog-brief-required` |
    | kept across off → on | on | dormant | `watchdog-brief-required` (with `briefId`) |
    | kept across off → on | on | active (after `watchdog_resume`) | allowed |
    | any | on | paused / halted | `supervision-paused` |
    | any | on, not registered | any | `watchdog-unavailable` |
  - X19 EP for **not gated** actions with the gate on and no brief: `read_session`,
    `answer_approval`, `answer_question`, `answer_prompt`, `release_session`, `stop_session`,
    `watch_session` → all allowed; and a refused send reaches **no** connector request.
  - X19 hand-over line: present on `user` and `session` items from a session without an active
    brief while the gate is on; absent with an active brief, with the gate off, and on `watch`,
    `system`, `approval` items; the item is still acked only after its turn is queued.
  - X19 ST per session: no brief → (`watchdog_brief`) active → (pause) paused → (resume) active;
    active → (user disable) handed-over/gate off → (re-enable) dormant → (`watchdog_resume`)
    active; dormant → (`watchdog_brief`) old superseded, new active. At each state, one send
    checks the gate.
  - X19 BVA: a send immediately after `supervision.set(…, 'active')` returns (allowed), and
    immediately after `set(…, 'paused')` (refused); `gateOn` file absent (gate off), `true`,
    `false`, corrupt (`store-unavailable`, sends refused).
- **X0-B.**
  - ST per bundled name: absent → placed, on → off (user) → off (restart, upgrade) → on.
  - Remove is refused with `bundled-plugin`.
  - EP: placement ok, the package missing, a symlink, an unsafe path; one of three failing.
  - Placement writes both `vendor/<name>` and `node_modules/<name>`; after an `admin.plugin.install`
    of another package both are still there and the row is on.
  - DT for the start check: a bundle is skipped × it is a bundled name whose placement failed this
    start → the start goes on (`BUNDLED_PLUGIN_UNAVAILABLE`); any other skipped bundle →
    `PROFILE_INCOMPATIBLE` as today.
  - DT for disabling `fishball-watchdog`: `setBundleEnabled` ok or failed × supervised set empty or
    not → hand-over or nothing changed.
  - BVA: `bundled` state file absent, empty, or listing an unknown name.
  - `uninstall.js` leaves nothing.
- **Plugin tasks.** As each design's §15, with these test-design changes:
  - fold: the namespace is `fishball-fold-notify`; a second presenter or attention owner gets
    `owner-busy`.
  - board: the inject is `fishballInstance?`, and a missing service gives `instance-hooks-missing`.
  - watchdog:
    - the `disabled` halt cause is removed;
    - add a DT "disable with briefs → hand-over, not halt";
    - add an ST "brief active → handed-over → (re-enable) dormant → (`watchdog_resume`) active";
    - re-enable with n dormant briefs: n = 0 (no notice), 1, many (one notice listing all); no
      check runs and no session is stopped at re-enable;
    - `watchdog_brief` on a session with a dormant brief: old `superseded`, result
      `sendUnlocked: true`; on a session with an active, paused or halted brief: `brief-exists`.
- **WD-14.**
  - EP: arg valid / each `invalid-brief:<field>`.
  - DT: §2.3 steps 2–5.
  - ST: no brief → brief active at start, with the window case (a card before attach goes to
    Fishball).
- **X-E2E**, one per DSH version:
  - a fresh child shows all three as "Built in" and on;
  - Fishball starts a session (a brief is required) → the watchdog supervises it;
  - the user hands over a session → the notice carries the brief-required line; a reply is
    refused `watchdog-brief-required`; after `watchdog_brief` the reply is delivered;
  - the user turns the watchdog off → one hand-over notice, and the session keeps running;
  - the next `start_session` takes no `watchdog` argument, and sends need no brief;
  - the user turns it on again → one notice listing the dormant briefs; a send is refused until
    `watchdog_resume`, then allowed;
  - an important notify gives the brand alert;
  - the board panel refreshes;
  - `uninstall.js` leaves nothing.

## 7. What does not change

- **Contract.** Nothing beyond §3.
- **Connector.** No code beyond K1 and FN-A.
- **Main DSH profile.** None of the three plugins is ever a bundle there.
- **Without these plugins**, the instance behaves byte for byte as it does today.

## 8. Doc edits the three designs need (names only, no design change except U1–U6)

| Design | Edit |
| --- | --- |
| fold-notify | service `fishballInstanceExtensions` → `fishballInstance`; fE1 `fishballChat.sessionId()` → `manager.sessionId()`; fE2 → X2 `manager.registerSetup(pluginId, fn)`; fE3 → X3 (add `pluginId` argument); fE4 → X4/X5/X7; fE5 → X7 `setTimelinePresenter`; fE6 → X8 + K1; fE7 → X9 `inbox.setBatcher`; fE8/9 → X17/X18; seen route `api/fold-notify/seen` and `api/ext/fold-notify/seen` → `api/ext/fishball-fold-notify/seen`; §14 FN-0, FN-E6, FN-K, FN-B point to X0-*/K1; inject list in §13 |
| board | inject `fishballInstanceExtensions?` → `fishballInstance?`; §8 rows → X1, X2, X4–X7, X17/X18; `signal(namespace, type)` → `ui.signal(pluginId, type)`; `engines.dsh` `>=0.2.1-rc.5`; §14 X0 → X0-C/X0-U, B9 → X0-B, B0 done (S1 yes); §5 guide text: "the newest board block is the current one" (S1 note) |
| watchdog (U1–U6 **are** design changes) | §2.1 "installed with Install for Fishball" → bundled (X17/X18); §12 package note; §13 wE3 and wE4's section half → X2, wE4 notify → X10, wE2 → X9 claims, wE9 → X15, wE10 → X14 + hand-over; remove the §9 `enabled` setting and the `disabled` halt cause (§4.5.4); add §4.5.6 "Turned off: hand-over" (§2.4 here), §4.5.7 "Turned on again: briefs stay dormant until `watchdog_resume`" (U6), and "Every managed session needs an active brief" (§2.3 `start_session.watchdog` + §2.5 send gate); §4.5.1 state table gains `dormant` (any running state allowed, sends refused) and the "no brief" row; §4.5.2's gate text → X19's `supervision-paused` row; §4.4 `watchdog_brief` result gains `sendUnlocked`, and on a dormant brief it supersedes instead of `brief-exists`; `watchdog_resume` accepts `dormant` as well as `paused`; the manager section states the U5 rule in one line; §10 "Plugin uninstalled" row → "not removable; a failed placement = `plugin-gone`"; §14 WD-0 → X0-*, add WD-14; §15 test edits of §6 here; §16.1 add U1–U6 |

## 9. Open questions for the user

None. Q-A and Q-B of the first cut are decided (U5 = Q-A B, U6 = Q-B B, §0).
