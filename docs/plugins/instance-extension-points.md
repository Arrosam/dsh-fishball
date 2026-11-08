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
| U7 | W0 tester Q4: "这个做成和普通的插件一样的管理". The watchdog is on exactly when `fishball-watchdog` is enabled in the child profile (in `dsh.profile.bundles`), switched like any DSH plugin. No separate `gateOn` file. Enabled but not registered yet (starting, crashed) → sends refused `watchdog-unavailable`. Turning it off is the hand-over (U4); on again gives dormant briefs (U6) | §2.4, §2.5, X19 |
| U8 | W0 tester Q3: "一个watchdog的session只负责盯一个会话，这是一个一对一的关系。watchdog会将session的请求redirect到watchdog上，如果watchdog不存在，就会直接走向fishball。" One watchdog side session per watched session (1:1). The watchdog **claims** a session when it attaches and drops the claim when it detaches; a claimed session's requests go to the watchdog, every other session's go to Fishball | X15, §2.6 |
| U9 | W0 tester Q1 = A, Q2 = A, Q5 = A: X7's page-hook behaviour is tested in the real browser later (W0 tests the server side only); an out-of-scope X12 call answers `forbidden` (the other refusals stay "observable effect only"); bundled placement runs inside `initializeProfile`, before `loadProfileDirectory` and the skipped-bundle check | X7, X12, §2.2, X0-B |

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
| X7 | Page hook object passed to each module's default export: `{document, i18n, request, sidebar({order}) → HTMLElement, onSignal(type, fn) → dispose, setTimelinePresenter(presenter) → dispose}` | page-side reach: an aside container (mounted above `#reminders`, ordered by `order`), the signal filtered to the module's own `pluginId`, and the **single-owner** timeline presenter with fE5's exact shape | fold (presenter), board (sidebar, signal) | fE5 + b3 (a)(b). Tested in the real browser, not in W0 (U9) |
| X8 | `attention.set(pluginId, {unread, importantUnread, latestAt}) → dispose`, single owner | the value sent as contract 1.2 `instance.attention` (§3) at once, after every handshake, and `{0, 0, null}` on dispose | fold | fE6 (instance half) |
| X9 | `inbox.claim({pluginId, kind, match(item) → key?}, onItem(item, key)) → dispose`; `inbox.release(key, {deliver, prefix?})`; `inbox.setBatcher(pluginId, fn(item, deliver)) → dispose` (single owner) | **one inbox pipeline** in `inbox.js receive`: approvals-row items → **claims** (a claimed item is acked at once and held) → **batcher** → `deliverInbox`. `release(…, {deliver: true})` re-enters the pipeline after the claims, so a released item is batched like any notice. `deliverInbox` gains an array form (fE7). `PERMISSION_NOTICE` marker added to `inbox-markers.js` | watchdog (claims), fold (batcher) | wE2 + fE7 |
| X10 | `manager.notify({pluginId, dedupeKey, text, record?: {type, data}, wake}) → Promise<{queued \| held \| duplicate}>` | a plugin's message to Fishball: `wake: true` is one notice turn (source `{kind: 'fishball-notice', form: 'plugin', pluginId}`); `wake: false` is held for the next turn; dedupe is durable. **Not batched** (fold §7 batches inbox items only) | watchdog | wE4 (notify half) |
| X11 | `manager.userTexts({limit, maxChars}) → [{text, at}]` | newest-first texts written by the **user** in Fishball's session, read-only | watchdog (`userQuote`) | wE8 |
| X12 | `bridge(pluginId, operations[]) → client` | a scoped connector client; an operation outside the list is refused locally with the code `forbidden` (U9: tests assert the code), and no request leaves the child; the list must lie within the instance's required set (no new handshake) | watchdog | wE1 |
| X13 | `sideAgents.open({…}) → {agent, sessionId, setSection}`, `sideAgents.runTurn(agent, message, {timeoutMs, signal})`, `sideAgents.cancel(agent)` | locked-down side sessions: read-only, approval `never`, every global tool denied | watchdog | wE5 (unchanged) |
| X14 | `supervision.register(pluginId) → {set(sessionId, state, briefId), clear(sessionId), handedOver, dispose}` with `state` ∈ `active`, `paused`, `halted`, **`dormant`**; `supervision.onManagedChange(listener)`; `supervision.endingReason() → 'hand-over' \| 'failure' \| undefined` | the persisted supervised set, the `plugin-gone` guard, managed-change events; **added:** the hand-over when the plugin is disabled (§2.4) and the **`dormant`** state of a brief kept across off → on (U6). `set` is synchronous and persisted before it returns, so a send right after it is judged on the new state. **The one source of truth** for X15's claims and X19's gate (§2.6) | watchdog | wE10 + U4 + U6 |
| X15 | `approvals.claim(sessionId, {id, name, onCard(card)}) → release`; `card(approvalId)`; `onSettled(listener)`; `answerApproval({…, decidedBy})`; the escalation card in the chat | **per-session claim (U8)**: a claimed session's `kind: approval` cards go to its claimant's `onCard`, every other session's to Fishball. At most one claim per session (a second → `owner-busy`). A claim is accepted only while X14 holds the session as `active`, `paused` or `halted` (else `not-supervised`), and the instance drops it itself when X14 moves the session to `dormant` or clears it (§2.6). While a session is claimed, Fishball's `answer_approval` `grant` on it is refused `grant-off-supervised`, and `answerApproval` with `decidedBy` answers only cards of sessions the caller has claimed. The "代批 / Watchdog" tag; the open escalation card | watchdog | wE6 + wE9; **replaces** the global `setDelegate` and `supervised(sessionIds)` |
| X16 | `sessionStarts.register(pluginId, {parameter, schema, validate(arg) → {ok:true} \| {code}, attach(sessionId, arg) → Promise<{ok:true} \| {code}>}) → dispose`, single owner | **new (U2)**: while registered, `start_session` has one more **required** argument and cannot start a session without it (§2.3). `attach` ends with `supervision.set(id, 'active')` and `approvals.claim(id, …)`, so the started session is sendable and its cards go to its watchdog from the first card | watchdog | new |
| X19 | **Send gate** (instance-internal; the plugin only feeds it through X14): one check `gate.send(operation, sessionId) → ok \| {code, reason}` called by the bridge client for every manager→session send operation (`SUPERVISION.sendOperations` = `session.message`, `session.redirect`), plus the hand-over hint (§2.5) | **new (U5)**: while the gate is on, no send reaches a session without an **active** brief; replaces wE10's gate, which only covered `paused`/`halted`. **The gate is on exactly while `fishball-watchdog` is enabled in the child profile** (U7) | watchdog | wE10 gate + U5 + U7 |
| X17 | `RUNTIME.bundledPlugins = [{name: 'fishball-fold-notify'}, {name: 'fishball-board'}, {name: 'fishball-watchdog'}]` and placement at every child start | built in, on at first placement | all three | fE8 = b4 |
| X18 | `admin.plugins.get` marks a bundled plugin `{bundled: true, removable: false}`; `admin.plugin.remove` refuses `bundled-plugin`; enable/disable work. **Added:** disabling `fishball-watchdog`, through any path, is a hand-over (§2.4, U7) | the off switch the user keeps | all three | fE9 + U4 |
| K1 | contract 1.2 `instance.attention` + connector `state.unread = {count, important}` | the brand mark and frame unread count (today always 0) and the important alert | fold | fE6 (wire half), fold §9.1 |

### 1.2 Disagreements and the pick

| Topic | Options | Pick | Why |
| --- | --- | --- | --- |
| Manager-scope mechanism | fE2 `registerAgentSetup(fn)` vs wE3 `registerManagerTools` + wE4 `addManagerPromptSection` | **X2 only** | wE4 takes a static `{name, text}`, so the board's per-turn context cannot use it (board §8 b2). The DSH scope already has `tools.register`, `systemPrompt.section` and `systemPrompt.context` (§4). Helpers would duplicate them. |
| Service name | `fishballInstanceExtensions` vs `fishballInstance` | `fishballInstance` (`apiVersion: 1`) | versioned; one optional inject detects an older instance |
| Manager identity | `fishballChat.sessionId()` vs `manager.sessionId()` | `manager.sessionId()` | keeps `fishballChat` internal; it sits next to the other manager members |
| Single-owner refusal code | "first registered wins" (fE5) vs `delegate-busy` (wE6) | `owner-busy` for X7 presenter, X8, X9 batcher, X15 (per session), X16 | one rule, one test partition |
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

**Where (U9).** Placement runs inside `initializeProfile` (`src/native-runtime/installation.js`), after `slimProfileBundles` and **before** `loadProfileDirectory` and its skipped-bundle check. This is the only order in which step 6 can tell "failed this start" from any other skipped bundle.

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

**Turned off mid-way (U4, U7): the hand-over.** The watchdog is switched like any DSH plugin: the
settings view's switch (X18), or any other `pluginManager.setBundleEnabled`. There is no intent
record.

*How the instance tells a disable from a failure.* DSH saves the manifest without the name
**before** it reloads and disposes the row: `selectBundle` → `saveManifest` (rc.5
`dsh-plugin-manager/lib/index.js:2304`, rc.1 `:3073`), then `reload` (rc.5 `:1952`, rc.1 `:2691`).
So when the registrant disposes, the instance reads `dsh.profile.bundles` once:

| `fishball-watchdog` in `dsh.profile.bundles` at disposal | Meaning | What the instance does |
| --- | --- | --- |
| absent | the user turned it off | hand-over, steps 2–3 |
| present | crash, failed reload, child stop | `plugin-gone`: X14's grace timer (watchdog §4.5.4). The timer lives in the child process: a child stop discards it, and the next boot re-registers within the grace |

1. (No step: the disable is DSH's own.)
2. While the row disposes, `supervision.endingReason()` returns `'hand-over'` (computed from the
   manifest as above). The plugin then:
   - keeps its briefs, criteria and audit;
   - does **not** unwatch: its `finished` watches stay, and their notices now reach Fishball,
     because the claims are gone;
   - stops no session.
3. The instance:
   - moves every supervised entry into `handedOver: [{sessionId, briefId, state, at}]` in its own
     supervision file and empties the supervised set. This drops every X15 claim (§2.6);
   - leaves the send gate off, because the plugin is disabled (§2.5). Paused or halted sessions and
     sessions without a brief can all be messaged; a stopped session stays stopped;
   - starts **no** grace timer and stops nothing;
   - sends **one** waking `manager.notify` (dedupe `watchdog-handover:<at>`). It lists the sessions,
     their titles and their states, and says Fishball now handles their approvals and supervision
     directly.
4. From then on Fishball is the supervisor. Approvals go to Fishball (no delegate), finished
   notices go to Fishball, and Fishball's `answer_approval` `grant` is allowed again (no session is
   claimed in X15). So R17 holds: no session runs without a supervisor.
5. **Failures stay Q13.** A disposal while the name is still in `dsh.profile.bundles` (crash, a
   failed reload), and a failed placement of an enabled watchdog (§2.2), are `plugin-gone`. So are model unavailable, repeated failures, 900 s without a
   successful check while running, and a broken store, all of which can happen only while the
   watchdog is on: those halt, stop and notify exactly as watchdog §4.5.4 says. The cause
   `disabled` is removed from the watchdog's halt causes.
6. **Turning it on again (U6, no automatic resume).** The first `supervision.register` after a
   hand-over:
   - (the send gate is on again because the plugin is enabled, §2.5);
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

**When the gate is on (U7).** The gate is on exactly while `fishball-watchdog` is in the child
profile's `dsh.profile.bundles`, which is DSH's own enable state. The instance reads the manifest
through `boot.readProfileManifest`, the same read `slimProfileBundles` makes. There is no `gateOn`
file.
- **Enabled and registered:** the table below.
- **Enabled but not registered** (child boot before the row is up, a crash, a failed placement):
  every gated send is refused `watchdog-unavailable`. *Why.* A gate that opened while the row is
  missing would let sends through unsupervised. The plugin-gone guard of X14 covers the rest.
- **Not enabled** (off from the start, or turned off): the gate is off, and behaviour is v1's (U3).

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
| on (enabled), not registered | any | refused `watchdog-unavailable` |
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

Approvals and questions of a session without an active brief reach Fishball in the meantime,
because the session is not claimed (§2.6). So a hand-over never leaves a card unanswered.

### 2.6 One watchdog per session: the claim (U8, X15)

**Rule.** A `kind: approval` card of session *S* goes to the watchdog **if and only if** *S* is
claimed in X15. Otherwise it goes to Fishball, as in v1.
- The watchdog claims *S* when it attaches a brief to it, and releases the claim when it detaches.
- The same claim governs the inbox. A `watch` or `approval` notice whose source session is claimed
  may be taken by the plugin's X9 claim. A notice from an unclaimed session is never offered to X9
  claims and goes to Fishball.

**Kept in step with X14** (one source of truth):
- `approvals.claim(S, …)` is accepted only while X14 holds *S* as `active`, `paused` or `halted`;
  otherwise it is refused `not-supervised`.
- The instance itself releases the claim when X14 moves *S* to `dormant` or clears it.
- A disposed plugin loses all its claims with it.

| X14 state of *S* | Claimed ("a watchdog exists", for routing) | A card of *S* goes to | Sends to *S* (X19) |
| --- | --- | --- | --- |
| none / ended | no | Fishball | `watchdog-brief-required` if the gate is on, else allowed |
| `active` | **yes** | the watchdog (watchdog §6.2) | allowed |
| `paused` | **yes** | the watchdog: a card means the session ran, so R1b auto-resumes first | `supervision-paused` |
| `halted` | **yes** | the watchdog: under R1b the guard re-stops the session, which cancels the card; nothing is answered | `supervision-paused` |
| `dormant` | **no** | Fishball (U6) | `watchdog-brief-required` |
| any, plugin enabled but not registered | no (the claims went with the plugin) | Fishball | `watchdog-unavailable` |
| any, plugin turned off | no (hand-over) | Fishball | allowed (gate off) |

*Why paused and halted stay claimed.* The coupling rule (R17): those briefs still own the session,
and the guard, not Fishball, decides what happens when it runs again. Handing a halted session's
cards to Fishball would let Fishball answer work the guard is stopping.

*The 1:1 relation.* There is one brief per session (watchdog §2.2, `brief-exists`) and one side
session per brief, so one claim per session is the same relation seen from the approvals side.

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
| **X0-C** core: service, manager, chat | new `child/extensions.js`; `child/app.js` (provide); `child/chat.js` (X1, X2 chain in `configure`/`composePersona` + live apply, X3 in `entryOfEvent`, X10, X11, `deliverInbox` array form and the X19 prefix call); `child/bridge.js` (**only** the one X19 `gate.send` call in the request path, a pass-through stub) | — (SP-X1 done) | `fishballInstance` v1 provided; X1–X3, X10, X11 behave as §1; every other member a stub that refuses `not-implemented`; the X19 call sites exist and pass everything while the watchdog is not enabled; the instance tests are unchanged and green with no plugin |
| **X0-I** inbox pipeline | `child/inbox.js`, new `child/ext/inbox.js`, `src/slim/inbox-markers.js` | X0-C | X9: claims before the batcher, release re-enters, ack/refuse per item |
| **X0-U** page modules | `child/server.js`, new `child/ext/ui.js`, `ui/shell.{js,html,css}`, `ui/chat.js` | X0-C | X4–X7; the X3 `text` fallback row; the CSP unchanged; with no module, the page is identical to today |
| **X0-W** wire: scoped bridge + attention | `child/bridge.js`, new `child/ext/{bridge-scope,attention}.js` | X0-C, K1 | X12 local `forbidden`; X8 sent on set, on each handshake, zero on dispose, skipped without the capability |
| **X0-G** side agents | new `child/ext/side-agents.js` | X0-C | X13 lock-down on both versions |
| **X0-A** approvals seam + escalation card | `child/approvals.js`, `child/decisions.js`, `ui/approvals.js`, `ui/records.js` | X0-C | X15 per-session claim and routing (§2.6); a claim is refused `not-supervised` unless X14 holds the session active, paused or halted, and the instance releases it on dormant or clear; old labels load as manager-decided; `delegate-no-grant`, `grant-off-supervised` |
| **X0-S** supervision, start rule, send gate | `child/session-tools.js`, new `child/ext/{supervision,session-starts,send-gate}.js` | X0-C, X0-A (the claim port) | X14 guard, managed changes, `dormant`, the hand-over decided from `dsh.profile.bundles` at disposal (§2.4), and re-enable; X16 attach = set active + claim (§2.3); X19: the gate is on exactly while the plugin is enabled, `watchdog-unavailable` while enabled and unregistered, plus the table and the hand-over line (§2.5), on both send paths; no `gateOn` file exists anywhere in the child home |
| **X0-B** bundling + admin | `packages/instance/package.json`, `src/native-runtime/{constants,installation,files,index}.js`, `child/admin.js`, `ui/settings.js`, `ui/i18n.js` | X0-S (the hand-over port, stubbed until merged); SP-FN1 done | X17, X18 for the three names; placement inside `initializeProfile` before `loadProfileDirectory` (U9); a failed placement of one name leaves the others |

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
| W2 | X0-B (needs SP, X0-S); FN-2, FN-4, FN-6; WD-6, WD-8, WD-9; B4; UI-1 (after X0-U), UI-C' if Q-C = B |
| W3 | B6 (after X0-B); FN-3; WD-10, WD-11, WD-13 (shared stub, as watchdog §14); B5 |
| W4 | FN-5; WD-14; B7 |
| W5 | FN-7, WD-12, B8, then X-E2E; UI-C after it if Q-C = A |

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
| X0-U, UI-1 | `ui/chat.js` (`buildEntry`) | X0-U first |
| UI-1, UI-C' | `ui/shell.css` | UI-1 first |
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
  - X6 coalescing: n signals in one tick give one event.
  - **Server side only in W0 (U9).** These are tested later in the real browser: `sidebar` order,
    `onSignal` filtering, and a second `setTimelinePresenter` → `owner-busy`.
  - CSP header unchanged. The X3 fallback row is drawn when no module renders the entry.
- **X0-W.**
  - EP: an operation in the scope list; outside it (answer code `forbidden`, and no request leaves
    the child; U9); or outside the instance's required set (refused at `bridge()`).
  - DT for X8: capability present × owner set or disposed × handshake again → sent or not, and the
    value.
  - ST: none → value → reconnect (the same value sent again) → dispose `{0,0,null}`.
- **X0-G.** Watchdog §15 lock-down partitions: a global tool call `not-permitted`, a scoped name
  allowed, sandbox `read-only`, approval `never`. Resume after a restart.
- **X0-A.**
  - DT: `decidedBy` present × decision `allow`, `reject`, `grant`, `ask` → `delegate-no-grant` on
    `grant`; the manager's `grant` on a claimed session → `grant-off-supervised`, on an unclaimed one
    → allowed.
  - **DT routing (§2.6):** X14 state of S (none, active, paused, halted, dormant) × the plugin
    (registered, enabled but unregistered, disabled) → the card goes to the watchdog's `onCard` or
    to Fishball, exactly as in the §2.6 table.
  - EP for `claim`:
    - S active, paused or halted → accepted;
    - S none, dormant or ended → `not-supervised`;
    - a second claim on S → `owner-busy`;
    - claims on two different sessions → both accepted, and each card reaches only its own
      claimant.
  - ST per session: unclaimed → (a brief attaches, claim) claimed → (pause, halt) still claimed →
    (dormant, clear, release, take-back, plugin disposed) unclaimed. After the release, the next card
    goes to Fishball.
  - `answerApproval` with `decidedBy` on a card of a session the caller has not claimed → refused.
  - EP: old labels without `decidedBy` load as manager-decided.
  - ST for the escalation card: open → settled or closed.
- **X0-S.**
  - DT for the gate: state `active`, `paused`, `halted`, handed-over × `message_session`,
    `redirect_session`.
  - ST for the supervised entry: none → active ⇄ paused → halted; any → (release, take-back)
    cleared; any → handed-over (user disable).
  - DT for disposal: `fishball-watchdog` in `dsh.profile.bundles` at disposal × supervised set
    empty or not:
    - name absent → hand-over: one notice, no stop, the gate off, the claims dropped;
    - name present → the guard after the grace: it stops the running, managed sessions
      (`plugin-gone`);
    - an empty set → no notice either way.
  - The disable path does not matter: the settings switch and a direct
    `pluginManager.setBundleEnabled(name, false)` both give the hand-over.
  - BVA: re-register at 29 s, 30 s and 31 s.
  - X16 DT: owner present × `watchdog` argument absent, invalid or valid × start ok or failed ×
    attach ok, failed or timeout × stop ok or failed → the exact result code, and whether a
    session runs.
  - X16 ST: the `start_session` schema with and without the parameter, as the owner registers and
    disposes.
  - X16: after a successful start the session is claimed (its first card reaches the watchdog) and
    sendable; after `watchdog-assign-failed` it is neither.
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
    | any | enabled, not registered | any | `watchdog-unavailable` |
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
  - X19 BVA: a send immediately after `supervision.set(…, 'active')` returns → allowed;
    immediately after `set(…, 'paused')` → refused.
  - X19 EP for the gate source (U7):
    - `fishball-watchdog` absent from `dsh.profile.bundles` → gate off;
    - present and registered → the table;
    - present and not registered → `watchdog-unavailable`;
    - a corrupt supervision file while enabled → `store-unavailable`, sends refused.
- **X0-B.**
  - ST per bundled name: absent → placed, on → off (user) → off (restart, upgrade) → on.
  - Remove is refused with `bundled-plugin`.
  - EP: placement ok, the package missing, a symlink, an unsafe path; one of three failing.
  - Placement writes both `vendor/<name>` and `node_modules/<name>`; after an `admin.plugin.install`
    of another package both are still there and the row is on.
  - Order (U9): placement has finished before `loadProfileDirectory` runs.
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

## 8. Doc edits the three designs need (names only, no design change except U1–U8)

| Design | Edit |
| --- | --- |
| fold-notify | service `fishballInstanceExtensions` → `fishballInstance`; fE1 `fishballChat.sessionId()` → `manager.sessionId()`; fE2 → X2 `manager.registerSetup(pluginId, fn)`; fE3 → X3 (add `pluginId` argument); fE4 → X4/X5/X7; fE5 → X7 `setTimelinePresenter`; fE6 → X8 + K1; fE7 → X9 `inbox.setBatcher`; fE8/9 → X17/X18; seen route `api/fold-notify/seen` and `api/ext/fold-notify/seen` → `api/ext/fishball-fold-notify/seen`; §14 FN-0, FN-E6, FN-K, FN-B point to X0-*/K1; inject list in §13 |
| board | inject `fishballInstanceExtensions?` → `fishballInstance?`; §8 rows → X1, X2, X4–X7, X17/X18; `signal(namespace, type)` → `ui.signal(pluginId, type)`; `engines.dsh` `>=0.2.1-rc.5`; §14 X0 → X0-C/X0-U, B9 → X0-B, B0 done (S1 yes); §5 guide text: "the newest board block is the current one" (S1 note) |
| watchdog (U1–U8 **are** design changes) | §6.2 R1 "no brief" → "session not claimed" (X15 `approvals.claim`, §2.6), R2 "plugin disabled" drops (a disabled plugin has no claims); E6 `setDelegate`/`supervised` → per-session `approvals.claim`; §9 has no `enabled` (U7); §2.1 "installed with Install for Fishball" → bundled (X17/X18); §12 package note; §13 wE3 and wE4's section half → X2, wE4 notify → X10, wE2 → X9 claims, wE9 → X15, wE10 → X14 + hand-over; remove the §9 `enabled` setting and the `disabled` halt cause (§4.5.4); add §4.5.6 "Turned off: hand-over" (§2.4 here), §4.5.7 "Turned on again: briefs stay dormant until `watchdog_resume`" (U6), and "Every managed session needs an active brief" (§2.3 `start_session.watchdog` + §2.5 send gate); §4.5.1 state table gains `dormant` (any running state allowed, sends refused) and the "no brief" row; §4.5.2's gate text → X19's `supervision-paused` row; §4.4 `watchdog_brief` result gains `sendUnlocked`, and on a dormant brief it supersedes instead of `brief-exists`; `watchdog_resume` accepts `dormant` as well as `paused`; the manager section states the U5 rule in one line; §10 "Plugin uninstalled" row → "not removable; a failed placement = `plugin-gone`"; §14 WD-0 → X0-*, add WD-14; §15 test edits of §6 here; §16.1 add U1–U6 |

## 9. Open questions for the user

| # | Question | A | B | Recommendation |
| --- | --- | --- | --- | --- |
| Q-C | How does Fishball's chat page reuse DSH's Composer (§10.2)? | Run DSH's own browser client in the child: put `dsh-web-app` back into the child profile, so DSH's Composer and the composer plugins really run there. This reverses D28/I2, costs about 175–250 MB of memory instead of 65–140 MB plus a slower start, and makes a new phase that rewrites the page. | Keep today's child page and rebuild its composer from DSH's composer **look** (layout, tokens, the Read Only chip, attachments, the resize corner), without DSH's code. DSH plugins that extend the composer still do **not** work in Fishball. | **Your call.** Only A gives "DSH 内改动 composer 的插件 Fishball 也可以拿来用"; B is cheap but misses it. If you want those plugins, choose A. |

**Conflicts with earlier decisions (listed, not chosen):**
- **K-1, the composer and D28/I2.**
  - D28/I2: the child does **not** boot DSH's Web UI (`docs/slim-native-design.md:52`, `:608`).
  - §0.5 "Plugins in the child": plugins' browser halves have no host in the child (`:398-401`).
  - The composer request needs DSH's client kernel in the child page (§10.1). Q-C = A therefore
    reverses D28 for the whole page, not only for the composer.
- **K-2, X4–X7 page modules.** Under Q-C = A the page becomes DSH's own Web client.
  - Fold's presenter (X7 `setTimelinePresenter`) and the board's panel (X7 `sidebar`) become DSH
    client slots (`conversation.chat.node`, the sidebar), as eaa33f5's messenger was.
  - X4–X7, FN-4, FN-5 and B5 would need a redesign for React slots.
  - Under Q-C = B nothing changes.
- **K-3, paused and halted cards (U8 against R17).**
  - U8: "the watchdog exists → the request goes to the watchdog".
  - §2.6 counts `paused` and `halted` as "exists", so their cards stay with the watchdog. This
    follows the coupling rule and watchdog §6.2 R1b (auto-resume, or the guard re-stops).
  - If the user means "a watchdog that is watching right now", paused and halted cards would go to
    Fishball instead. That is a different rule, so please confirm §2.6.

## 10. Chat page: DSH Composer, grey bubbles, avatars (user request 2026-11-08)

User's words: "整个composer要复用DSH里的Composer，这样一些DSH内的改动composer的插件Fishball也可以拿来用。给Fishball聊天气泡，就用旧版里的这个灰色。也要有头像气泡，都复用旧版里的样式。" This partly overrides I2 (D28) for the composer.

### 10.1 Findings (read only)

**How DSH builds its Composer.** Line numbers are in `dsh-client-ui-conversation/lib/client.js`.

| Fact | 0.2.1-rc.5 | 0.2.2-rc.1 |
| --- | --- | --- |
| The composer seat is the slot chain `conversation.composer`; its fallback is the single slot `conversation.composer.bar` | `:17885-17917` | `:20557-20589` |
| The default bar is the React component `InputBar`, with a Lexical editor (`ComposerContentEditable`). It reads the session store (`useSession`, `useInput`, `useProjection`), the input hub, file uploads and the keymap through slot injection | `:18941-18955` | `:21743-21757` (adds `useAccess`) |
| Composer plugins hook in as **slot entries**: `conversation.input.{attachments, overlay, permission, left, plan, right, model, activity}` and `conversation.composer.dock`, which the bar declares as its children. They do not import the Composer | `:20092-20131` | `:22958-22997` |
| The packages that register entries there: approval, attachment, chat, commands, goal, input-trigger, message-feedback, model-selection, permission-presets, plan, subagent, user-questions and voice-input (`dsh-client-ui-*/lib/client.js`) | 13 packages | the same, plus forge and liveshare |
| The `./client` export is a Cordis browser plugin, not a component library. Its `dsh.client.inject` needs the session controller, file upload, locale, layout, renderer, session, settings and workspace client services (`package.json`) | — | the same, plus context-menu |

So the Composer is **not exported** as a component. It runs only inside DSH's browser client
kernel: `dsh-client-modules`, the `connection` client, the session-controller API and the
renderer. That kernel comes with `dsh-web-app` (`dsh-web-app/cordis.patch.yml:228,234` rc.5,
`:224,230` rc.1). A composer plugin is a set of slot entries, and those exist only inside that
kernel. An iframe page that loads no DSH module cannot host them.

**Today's instance composer** (`packages/instance/src/slim/ui/composer.js`):
- `createComposer` (`:353`) builds a plain `<form>` with a `<textarea class="prompt">`.
- The resize corner is `resize: vertical` (`shell.css:297-300`).
- "Read Only" is a text chip, `composer-mode` (`composer.js:366-369`, `shell.css:290`), with no
  permission control (D8).
- Attachments are the T06 chips plus the upload route.
- The page loads no DSH module. The CSP is `default-src 'self'`, and the child boots no web app
  (D28).

**The old in-process look** (eaa33f5, `packages/messenger/client.js`):

| Part | eaa33f5 | Style |
| --- | --- | --- |
| Fishball's reply bubble (**grey**) | `:162` (reply), `:137` (`.fbm-bubble`) | `padding:6px 12px; border-radius:4px 18px 18px 18px; background:var(--dsw-alias-bg-module-platform); border:1px solid var(--dsw-alias-border-l2)` |
| Fishball's avatar | `:163` | a 28 px circle (`CIRCLE` `:84`, `border-radius:50%; corner-shape:round`) in the accent magenta, with the white FishMark at 60 % |
| Name above the bubble | `:164` | "Fishball", 12 px/600, accent colour, an 18 px line; the bubble starts after the avatar and an 8 px gap (`REPLY_LAYOUT` `:54`) |
| Other senders | `:133`, `makeAvatar` `:251` | initials on a hue from the sender's seed (`AVATAR` `:55`); sessions in green `hsl(142 70% 42%)` (`:76`); tinted bubble and edge (`SENDER_COLOUR` `:69`) |
| Your messages | `:150` | right-aligned, the bubble tinted 10 % accent with a 40 % edge (`YOU_TINT` `:62`), no name |
| Grouping | `makeBubble` `:260` | consecutive messages from one author show the avatar and name once |

The tokens it used are already in the instance's `ui/dsh-tokens.css`. The old file was a React
slot plugin on DSH's chat (`conversation.chat.node`, `:31`). Its CSS values can be reused; its
React code cannot.

### 10.2 Proposal

**UI-1: bubbles and avatars.** No conflict. Wave **W2**, after X0-U, which owns `ui/chat.js`.

*Files:*
- `packages/instance/src/slim/ui/chat.js`: `buildEntry` wraps the assistant, user and inbox rows
  in avatar + name + bubble, with grouping.
- `ui/shell.css`: the classes.
- `ui/i18n.js`: the sender words.
- New `ui/bubble.js`: the author model, ported from eaa33f5 `:196-249` as plain DOM. It holds
  `authorOf`, the initials, the hue from a seed, and green for sessions.

*Values and constraints:*
- One frozen `BUBBLE` object holds eaa33f5's numbers (`AVATAR`, `REPLY_LAYOUT`, `YOU_TINT`,
  `SENDER_COLOUR`). Colours come from `dsh-tokens.css` only.
- Fishball's avatar is the FishMark the page already draws (`chat.js:154-157`).
- The CSP refuses inline styles, so a sender's hue is a `data-hue` bucket (12 classes), not
  eaa33f5's inline `style`.

*Done when:*
- Fishball's replies are grey bubbles, with the round fish avatar and "Fishball" above.
- Your messages are right-aligned and tinted.
- Inbox senders have initials avatars, with sessions in green.
- Consecutive rows group.
- Light and dark themes both look right.
- The bubble is the entry's inner element, so FN-4 still folds the entries.

**The composer** depends on Q-C:
- **Q-C = A: task UI-C**, a new phase after W5.
  - The child profile gets `@deepseek-ai/dsh-web-app` back, with the rows the SP spike disabled
    (`docs/spikes/body-soul-sp.md`).
  - Fishball's chat becomes DSH's own session view of Fishball's session, as in D16's Option A.
  - Composer plugins installed into the child then work.
  - `slim-native-design.md` §0.5 and §2.1 are rewritten. The custom `ui/*`, X4–X7, FN-4, FN-5,
    B5 and UI-1 move to DSH client slots, as eaa33f5's messenger did.
  - The child's RSS rises to 174–253 MB (SP2), from 65–140 MB today.
- **Q-C = B: task UI-C'**, in W2 after X0-U.
  - Owns `ui/composer.js` and `ui/shell.css` (after UI-1).
  - The page's composer takes DSH's composer layout and tokens: the card; the bottom row with the
    Read Only chip on the left and attach and send on the right; the editor growing with its text;
    the resize corner kept.
  - No DSH code is loaded, and composer plugins do not work.

UI-1 is useful under either answer: under A its CSS moves into a slot stylesheet, as eaa33f5's
did. Decide Q-C before W2 starts.
