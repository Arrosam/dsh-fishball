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
| U10 | Q-C = **A-lite**: "A，优先保全DSH的拓展性和对DSH的生态的兼容能力". The child profile gets `dsh-web-app` back; the Fishball page is DSH's own web shell booted into Fishball's session with a minimal layout. **Guiding rule from now on: preserve DSH extensibility and ecosystem compatibility first.** Supersedes D28/I2 ("borrow styles only") for the chat page | §11 |
| U11 | "一打开就要是Fishball的页面，通过修改DSH的网页来删去其他的组件，只留下Fishball一个会话页。" and the mechanism: **one small `dsh.client` plugin, `fishball-page`, bundled inside fishball-instance, loaded only in the child's DSH web**, does every removal and layout change. Never installed into the main DSH; no patching of DSH code or bundles; CSS from the same plugin is the fallback | §11.2–§11.5 |
| U12 | "Fishball instance内的设置页也用DSH自带的插件设置页，且可以打开instance内的DSH setting页面，只是删除了侧边栏和其他的session页面，查看session只允许查看Fishball的session，并且拒绝启动任何的新session，并且整个fishball instance的DSH都没有只读以外的权限。" DSH's own Settings and Plugins pages are allowed destinations; only Fishball's session can be viewed; no new session can be started; nothing in the child goes above read-only | §11.4, §11.6, §11.7 |
| U13 | §9 answers (2026-11-08): Q-E A, Q-F A, Q-G B, Q-H A, Q-I A, Q-J A, Q-M A as recommended; **Q-K = B** (hide Remove for our bundled plugins with CSS in `fishball-page`); **Q-N = A** (the recommended tab only in the child's Plugins page); **Q-O = B** (label "Fishball 推荐" / "Fishball Recommended", id `fishball-recommended`); **Q-L changed**: "现在设置页还要，但是额外可以访问instance内的设置，推荐插件列表就放在DSH的插件页面内的这里的额外一个tab，也做成一个插件，就叫fishball- recommend-plugins。但是很多instance的设置，比如插件的开关可以依靠DSH自带的插件页面来实现。" | §11.8, §11.9 |
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
| X3 *(server projector withdrawn, U10: a plugin's own `uiConversation.events.register` definition renders its record, §11.3)* | `chat.registerRecordProjector(pluginId, type, fn(data, event) → {id, at, data, text?} \| undefined) → dispose` | show a plugin's log-only record in `GET api/chat` and the SSE `entry` frame as `{id, kind: 'plugin', plugin, at, data, text?}`; `type` must start `plugin:<pluginId>/`. **Added:** optional `text` (≤ `EXT_LIMITS.recordTextChars`, a new constant in `child/extensions.js`, equal to `CHAT_LIMITS.entryChars` (8000), the cap `chat.js` `notify` applies at `:679`), drawn by the instance as a plain record row when no page module renders the entry | fold (notice), watchdog (report, guard notices) | fE3; covers wE4's "shown in the manager's chat" |
| X4 *(withdrawn, U10)* | `ui.register({pluginId, module, style?, dictionaries}) → dispose`; `GET api/ui-extensions → [{pluginId, module, style?}]`; files served at `ui/ext/<pluginId>/…` with the `/ui/*` checks | load a plugin's page module; CSP stays `'self'` | fold, board | fE4 (a–c) = b3 |
| X5 *(withdrawn, U10: Connection Fetch routes, §11.3)* | `ui.registerRoute(pluginId, {method, path, handler(req) → {status, body}}) → dispose`, served at `api/ext/<pluginId>/<path>`, same bearer and body limits as `api/*` | a plugin's JSON routes | fold (`seen`), board (`board`, `export`) | fE4 (d) = b3 |
| X6 *(withdrawn, U10)* | `ui.signal(pluginId, type)` → SSE event `ext` `{pluginId, type}`, data-free, coalesced per `(pluginId, type)` per tick | tell a module to re-read | board | b3 (b) |
| X7 *(withdrawn, U10)* | Page hook object passed to each module's default export: `{document, i18n, request, sidebar({order}) → HTMLElement, onSignal(type, fn) → dispose, setTimelinePresenter(presenter) → dispose}` | page-side reach: an aside container (mounted above `#reminders`, ordered by `order`), the signal filtered to the module's own `pluginId`, and the **single-owner** timeline presenter with fE5's exact shape | fold (presenter), board (sidebar, signal) | fE5 + b3 (a)(b). Tested in the real browser, not in W0 (U9) |
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

*Why paused and halted stay claimed* (confirmed by the user, K-3 = A). The coupling rule (R17): those briefs still own the session,
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
| **X0-C** core: service, manager, chat | new `child/extensions.js`; `child/app.js` (provide); `child/chat.js` (X1, X2 chain in `configure`/`composePersona` + live apply, X3 in `entryOfEvent`, X10, X11, `deliverInbox` array form and the X19 prefix call); `child/bridge.js` (**only** the one X19 `gate.send` call in the request path, a pass-through stub) | — (SP-X1 done) | `fishballInstance` v1 provided; X1, X2, X10, X11 behave as §1, and X3 keeps only the record-type rule (`plugin:<pluginId>/…`; the server projection into `GET api/chat` is withdrawn, U10); every other member a stub that refuses `not-implemented`; the X19 call sites exist and pass everything while the watchdog is not enabled; the instance tests are unchanged and green with no plugin |
| **X0-I** inbox pipeline | `child/inbox.js`, new `child/ext/inbox.js`, `src/slim/inbox-markers.js` | X0-C | X9: claims before the batcher, release re-enters, ack/refuse per item |
| ~~X0-U~~ | **withdrawn (U10)**; replaced by SP-PG, CHILD-WEB, EMB, PG-1, PANELS (§5.4) | — | — |
| **X0-W** wire: scoped bridge + attention | `child/bridge.js`, new `child/ext/{bridge-scope,attention}.js` | X0-C, K1 | X12 local `forbidden`; X8 sent on set, on each handshake, zero on dispose, skipped without the capability |
| **X0-G** side agents | new `child/ext/side-agents.js` | X0-C | X13 lock-down on both versions |
| **X0-A** approvals seam (server) | `child/approvals.js`, `child/decisions.js` (the UI files move to PANELS) | X0-C | X15 per-session claim and routing (server half only; the tag and the escalation card move to PANELS) (§2.6); a claim is refused `not-supervised` unless X14 holds the session active, paused or halted, and the instance releases it on dormant or clear; old labels load as manager-decided; `delegate-no-grant`, `grant-off-supervised` |
| **X0-S** supervision, start rule, send gate | `child/session-tools.js`, new `child/ext/{supervision,session-starts,send-gate}.js` | X0-C, X0-A (the claim port) | X14 guard, managed changes, `dormant`, the hand-over decided from `dsh.profile.bundles` at disposal (§2.4), and re-enable; X16 attach = set active + claim (§2.3); X19: the gate is on exactly while the plugin is enabled, `watchdog-unavailable` while enabled and unregistered, plus the table and the hand-over line (§2.5), on both send paths; no `gateOn` file exists anywhere in the child home |
| **X0-B** bundling + admin | `packages/instance/package.json`, `src/native-runtime/{constants,installation,files,index}.js`, `child/admin.js` | X0-S (the hand-over port, stubbed until merged); SP-FN1 done | X17, X18 for the three names (the "Built in" tag is gone with the custom settings view, §11.7; Q-K); placement inside `initializeProfile` before `loadProfileDirectory` (U9); a failed placement of one name leaves the others |

### 5.2 Plugin tasks, re-based on the canonical names

| Task | Was | Owns | Depends |
| --- | --- | --- | --- |
| FN-1 skeleton | FN-1 | `packages/fold-notify/{package.json,cordis.patch.yml,index.js,src/constants.js,src/config.js}` | — |
| FN-2 tool + section | FN-2 | `src/tool.js` | X0-C (X1, X2), FN-1 |
| FN-3 notices, seen, attention | FN-3 | `src/notices.js`, the `seen` Fetch route | X0-C, X0-W (X8), FN-1, CHILD-WEB (Fetch routes) |
| FN-4 fold as a DSH conversation plugin | FN-4 | `packages/fold-notify/client/` (`dsh.client`: a group/node definition on `uiConversation`, its CSS, i18n) | PG-1 |
| FN-5 notify side (viewed, title, system notification, important bar) | FN-5 | `packages/fold-notify/client/notify.js` (+ its CSS after FN-4) | FN-3, FN-4 |
| FN-6 turn batching | FN-6 | `src/batcher.js` | X0-I (X9 batcher), FN-1 |
| FN-A connector alert | FN-A | `packages/connector/client.js` (fold §9.1 rows) | K1 |
| — | FN-0, FN-E6, FN-K, FN-B | absorbed into X0-*, K1 | — |
| WD-1 … WD-10 | same | `packages/watchdog/…` as watchdog §14 | WD-0 → the X0 task that owns the point (WD-8: X0-G; WD-10: X0-I, X0-A) |
| WD-11 manager tools | WD-11 | `src/manager-tools.js` | registers through **X2** (not wE3/wE4); X0-C, WD-2, WD-3, WD-6, WD-9, WD-13 |
| WD-13 coupling | WD-13 | `src/coupling.js` | X0-S; **adds** `endingReason()` handling (§2.4 step 2), the `handedOver` → `dormant` list on register with the one notice (§2.4 step 6), `watchdog_resume` of a dormant brief, `watchdog_brief` superseding a dormant brief |
| **WD-14** start-time assignment (new) | — | new `src/start-assign.js` | X0-S (X16), WD-2, WD-6, WD-13 |
| WD-12 integration | WD-12 | `index.js` wiring, e2e | all WD, X0-B |
| B1 … B4 | same | `packages/board/…` as board §14 | X0-C (X1, X2) |
| B5 board panel | B5 | `packages/board/client/` (`dsh.client`: a `rightbar` panel entry) and `src/routes.js` (Fetch routes) | B4, PG-1 |
| B6 meow-memory recommended | B6 | `src/recommended.js` (the `noteKey` and the meow entry), DESIGN.md; the tab itself is RP | — (RP reads it) |
| B7 meow in the child | B7 | test rig only | B6 |
| B8 board e2e | B8 | `test/e2e/board.*` | B1–B5, X0-B |
| — | B9 | absorbed into X0-B (all three names) | — |
| **X-E2E** three bundled together | new | `test/e2e/bundled.*` | X0-*, FN-7, WD-12, B8 |
| FN-7 docs | FN-7 | README, contract cross-check | all FN |

### 5.4 A-lite page tasks (U10–U12, §11)

**W0 task → test files:** see §5.6 below for the package-owned K1, X0-C, FN-1, WD-1 and B1 gates. This keeps the existing page-task table unchanged.

| Task | Owns | Depends | Done when |
| --- | --- | --- | --- |
| **SP-PG** pre-start spike (W1 prerequisite) | `spikes/instance-ext/page/*`, `docs/spikes/instance-ext-page.md` | — | yes or no on both versions for: (1) DSH's shell through the connector's embed path: `__DSH_BOOT__`, `<base href="./">`, combos, `api/remote.mux`, the token-to-cookie exchange, and the CSP the broker sets (today `frame-ancestors 'self'; default-src 'self'…` at `host/embed.js:75`; DSH's index injects inline `<script>` rows, `dsh-host-webserver/lib/index.js:69-97`, so the broker's CSP must change); (2) a `dsh.client` overlay row from the snapshot is served (`resolveMeta`); (3) Q-F rail options; (4) the navigation guard bounces `openSession` and `selectPanel`; (5) where the child's shortcut document lives and that `null` unbinds `session.new` and `session.search`; (6) any pre-create hook for sessions (Q-G); (7) the Settings sandbox field under the read-only overlay; (8) a third-party `plugins.tab` entry gets the install face (§11.9); (9) the Remove button can be targeted per plugin without hashed classes (§11.10) |
| **CHILD-WEB** child profile and overlay | `src/native-runtime/{constants,overlay,installation}.js` (add `dsh-web-app` back, keep the existing migration's backup rule), the overlay rows of §11.3/§11.6, the read-only `permission` presets and `defaultPreset`, `sandbox-policy` read-only, the Q-J approval rule, `tool-subagent` per Q-I, the Fetch route `api/fishball/session` | SP-PG | the child boots DSH's web on both versions; every enabled `dsh.client` row is served; the disabled rows are absent; `/permission` refuses everything but `read-only`; a user setting cannot raise the sandbox |
| **EMB** connector embed of the shell | `packages/instance/src/slim/host/embed.js` (prefix forwarding of `/`, `/plugins/*`, `/assets/*`, `/api/*` and the `api/remote.mux` upgrade; CSP from SP-PG(1)), `packages/connector/client.js` (the iframe unchanged except `allow` if SP-PG needs it) | SP-PG, CHILD-WEB | the Fishball view in the main DSH shows the child's shell with no token in any URL, as SP1 did; the main DSH's own pages are unaffected |
| **PG-1** `fishball-page` plugin | new `packages/instance/child-web/fishball-page/{package.json,client.js,removals.js,guard.js,shortcuts.js,messenger.js,style.css,i18n.js}` | SP-PG, CHILD-WEB | §11.3 table holds; Remove is hidden for the bundled plugins (§11.10); the page opens on Fishball's session; §11.4 paths cannot leave it; DSH Settings and Plugins pages open and come back; grey bubbles and avatars as eaa33f5; composer plugins (a fixture plus voice input when installed) work |
| **SET** slimmed Fishball settings page (§11.8) | `child-web/fishball-page/panels/settings.js`, its Fetch routes (status, restart, provider sync) | PG-1 | only the "stays" rows of §11.8 are on it; the links open DSH Settings and Plugins and come back; the moved items are not duplicated |
| **RP** `fishball-recommend-plugins` (§11.9) | new `packages/recommend-plugins/{package.json,index.js,client.js,i18n.js}`; `RUNTIME.bundledPlugins` entry in `src/native-runtime/constants.js` | SP-PG (8), CHILD-WEB, X0-B | the child's Plugins page shows the "Fishball 推荐" / "Fishball Recommended" tab next to Installed, Marketplace and Discover; it lists the recommended plugins with meow-memory's note; Install installs into the child profile; an installed one shows "Installed"; the main DSH's Plugins page has no such tab |
| **PANELS** our panels as DSH entries | `child-web/fishball-page/panels/{approvals,reminders}.js`, the "代批 / Watchdog" tag and the escalation card as chat-node definitions; their Fetch routes in `src/slim/child/` | PG-1, X0-A | approvals and reminders work as `main` panels; the escalation card renders in Fishball's chat |
| **RETIRE** remove the custom page | delete `src/slim/ui/{shell.*,chat.js,composer.js,approvals.js,records.js,reminders.js,settings.js}` and their server routes once nothing uses them; keep `dsh-tokens.css` only if a panel still needs it | PANELS, SET, RP, FN-4, B5 | no route serves the old page; the instance tests for the old page are retired with it |

### 5.3 Waves

| Wave | In parallel |
| --- | --- |
| W0 (start now) | K1, X0-C (X3 reduced, see §5.5), FN-1, WD-1, B1 |
| W1 | **SP-PG first**; X0-I, X0-G, X0-A (server), X0-S, X0-W (needs K1), FN-A (needs K1); WD-2, WD-3, WD-4, WD-5, WD-7; B2, B3 |
| W2 | CHILD-WEB, then EMB and PG-1 (all after SP-PG); X0-B (after X0-S); FN-2, FN-6; WD-6, WD-8, WD-9; B4 |
| W3 | PANELS (after PG-1, X0-A), SET (after PG-1), RP (after X0-B); FN-3, FN-4 (after PG-1); B5 (after PG-1); B6 (W1 is fine: data only); WD-10, WD-11, WD-13 |
| W4 | FN-5; WD-14; B7 (after RP); RETIRE (after PANELS, SET, RP, FN-4, B5) |
| W5 | FN-7, WD-12, B8, then X-E2E |

### 5.5 What changed for W0 and X0 (U10–U12)

- **Unaffected, start now:** K1, FN-1, WD-1, B1. Server-side X0 tasks X0-I, X0-G, X0-S and X0-W
  (W1) are unaffected as well. Their tests stand.
- **X0-C changed in one point.** X3's server projection into `GET api/chat` and the SSE `entry`
  frame is dropped; only the record-type rule remains (a foreign prefix is refused). Remove the
  tester's X3 projection and fallback-row cases (the BVA on `recordTextChars` too); keep the X1,
  X2, X10 and X11 cases.
- **X0-U withdrawn.** Its test file `x0-u.test.mjs` is retired. Its server-side cases (module
  serving, `api/ext/*` routes, the `ext` signal, the CSP) have no successor; the page cases move to
  PG-1's browser tests.
- **X0-A:** server cases unchanged; the UI cases (tag, escalation card) move to PANELS.
- **X0-B:** the "Built in" tag case and the settings-view cases are dropped; X17/X18 server cases
  stand.

**File pairs that collide.** Merge each pair in the order shown, never in parallel on the same
lines.

| Pair | Shared file | Order |
| --- | --- | --- |
| X0-S, X0-B | the hand-over port | X0-S first, or X0-B against X0-C's stub |
| X0-C, X0-I | `deliverInbox` array form lives in `chat.js` | X0-C first (it owns `chat.js`) |
| X0-C, X0-W | `child/bridge.js` (X0-C adds only the X19 call; X0-W the scope and attention) | X0-C first |
| K1, FN-A | none (`client.js` is FN-A's only) | — |
| FN-4, FN-5 | `packages/fold-notify/client/*.css` | FN-4 first |
| CHILD-WEB, X0-B | `src/native-runtime/{constants,installation}.js` | X0-B first (placement), CHILD-WEB rebases |
| CHILD-WEB, EMB | none (child vs host), but EMB tests need CHILD-WEB | CHILD-WEB first |
| PG-1, PANELS, SET | `child-web/fishball-page/` | PG-1 first; PANELS and SET add files only |
| X0-B, RP | `src/native-runtime/constants.js` (`bundledPlugins`) | X0-B first; RP appends one entry |
| WD-11, WD-13 | the coupling interface | shared stub, as watchdog §14 |

### 5.6 W0 test files (definition of done per task)

The tests are black-box and live outside `test/run.mjs`'s `test/*.test.mjs` glob, so the existing
suite stays green and each task is selected by file. The full case table, the technique counts and
the open questions are in `docs/test-design/instance-ext-w0.md`. The developer's check command is
`node --test <file>` with `FBTEST_DSH_RUNTIME` naming the installed 0.2.2-rc.1 runtime.

| Wave/task | Gating test file | Covers |
| --- | --- | --- |
| **W0 K1** | `packages/connector/test/instance-ext/k1.test.mjs` | contract 1.2 `instance.attention`, `LIMITS.unreadMax`, mixed peers, the host bridge and `state.unread` |
| **W0 X0-C** | `packages/instance/test/instance-ext/x0-c.test.mjs` | X1, X2, X10, X11 and X3's record-type rule only (§5.5) |
| **W0 FN-1** | `packages/fold-notify/test/instance-ext/fn-1.test.mjs` | package, row, config bounds, fixed constants |
| **W0 WD-1** | `packages/watchdog/test/instance-ext/wd-1.test.mjs` | package, row, §9 config bounds (no `enabled`, U7), window-sum check blocked pending exact Config rules (test-design §7.2) |
| **W0 B1** | `packages/board/test/instance-ext/b1.test.mjs` | package, row, Config ranges, constants, loads with and without the points |
| W1 X0-I | `test/instance-ext/x0-i.test.mjs` | X9 |
| W1 X0-G | `test/instance-ext/x0-g.test.mjs` | X13 |
| W1 X0-A | `test/instance-ext/x0-a.test.mjs` | X15 server half (claims and routing; tag/card are PANELS) |
| W1 X0-S | `test/instance-ext/x0-s.test.mjs` | X14, X16, X19 (U7 gate source, U8 claims, §2.6) |
| W1 X0-W | `test/instance-ext/x0-w.test.mjs` | X12, X8 (X8 also needs K1) |
| W2 X0-B | `test/instance-ext/x0-b.test.mjs` | X17, X18, §2.2 start-up rules |

~~X0-U~~ is withdrawn (U10); its test file is retired with it. The page cases move to PG-1's
browser tests. K1's `state.unread` end-to-end case uses the existing H-STUB harness (one real DSH
boot) and stays under `/private/tmp` (the W0 rule).

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
  - X3 (reduced, U10): a record `type` with a foreign prefix is refused. *(The projection and
    fallback-row cases, and the `recordTextChars` BVA, are dropped.)*
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
- **X0-U.** *Withdrawn (U10); see PG-1.*
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
- **SP-PG.** The spike's yes/no questions only; no TDD.
- **CHILD-WEB.**
  - EP for rows: each row of §11.3/§11.6's disabled list is absent; a fixture `dsh.client` bundle
    enabled in the child profile is served by `client-modules`.
  - DT for permissions: preset requested (`read-only`, `workspace-write`, `danger-full-access`,
    unknown) × path (`/permission`, settings, `DSH_PERMISSION_MODE` in the env) → only `read-only`
    is accepted; the sandbox mode is `read-only` after each.
  - DT for widening (Q-J A): a denied write × the agent retries with a widening request → refused,
    and no approval card asks the user.
  - EP for plugin storage (b): a bundled plugin writing its own file through `node:fs` succeeds;
    the agent writing the same path through DSH's file tools is refused.
- **EMB.**
  - EP for routes under the embed prefix: `/`, `/assets/*`, `/plugins/*`, `/api/*`, the
    `api/remote.mux` upgrade → forwarded; a path outside the prefix → refused as today.
  - No token appears in any URL the iframe sees; the main DSH's own pages render unchanged.
- **PG-1** (real browser, both versions; U9 Q1):
  - EP for destinations (allowed): Fishball's session; DSH Settings; DSH Plugins page; a plugin's
    settings form; our panels (approvals, reminders, recommended, board).
  - EP for destinations (blocked): another session by `openSession`; the empty new-session view;
    the session search; a panel id not on the allow list; a session reference link in a message.
  - DT navigation guard: destination (each EP above) × trigger (UI click, shortcut, programmatic
    call from a fixture plugin, session-reference click) → stays or bounces to Fishball within one
    frame.
  - EP for shortcuts: `session.new`, `session.search`, `session.fork`, `session.archive`,
    `workspace.add`, `session.rename` → unbound (no effect); `settings.open` and `shortcuts.open` →
    allowed.
  - Removed components (§11.3): sidebar, `shell.leading`, the rail (per Q-F), the hero workspace
    picker, header lineage, the permission picker, the agent preset picker → absent or not visible;
    the conversation, the Composer and every `conversation.input.*` and `conversation.composer.dock`
    entry from a fixture composer plugin → present and working.
  - ST page: load → Fishball opened → (open Settings) settings → (back) Fishball → (attempt another
    session) Fishball; reload → Fishball.
  - Browser Back after each step stays on the Fishball page.
  - Bubbles and avatars: Fishball's reply is the grey bubble with the fish avatar and name; your
    message is right-aligned and tinted; a session sender is green; consecutive rows group; light
    and dark themes.
  - BVA for viewport width: 767, 768 and 1024 px (rc.1's drawer threshold) → no rail, no drawer
    toggle.
- **Session-start refusal** (CHILD-WEB, PG-1, Q-G/Q-H/Q-I):
  - DT: origin (the UI, a shortcut, the session-controller RPC `create` from the page, a subagent
    tool call, the schedule, the instance's own `agents.create` for Fishball, the watchdog's X13
    `open`) → refused or allowed exactly per Q-G/Q-H/Q-I. With Q-G B, an RPC-created session ends
    archived and is never shown.
  - EP: after every refused start the Fishball page is still shown and no new session is listed.
- **SET.**
  - EP for page content: each "stays" row of §11.8 present; each "moves" row absent.
  - ST: settings → (DSH Settings link) DSH Settings → (back) settings; settings → (Plugins link)
    Plugins page → (back) settings. All of them are allowed destinations for the guard.
- **RP.**
  - EP for where the tab shows: the child's Plugins page (present, between the DSH tabs as DSH
    orders them); the main DSH's Plugins page (absent).
  - EP for the label: zh → "Fishball 推荐", en → "Fishball Recommended"; the tab id is `fishball-recommended` in both.
  - EP for a row: not installed (Install); installed (Installed); install fails (DSH's own error,
    no change); the meow-memory row shows its note in en and zh.
  - DT: plugin `fishball-recommend-plugins` enabled or disabled × tab present or absent; disabled →
    no tab, DSH's other tabs unchanged.
  - ST per row: not installed → (Install) installing → installed; (DSH removes it) → not installed.
- **Q-K CSS** (in PG-1, real browser):
  - EP: the detail page of each of the four bundled plugins → no Uninstall button visible; the
    detail page of any other installed plugin → Uninstall visible and working.
  - EP for language: en and zh → the same result.
  - Enable/disable switch on our bundled plugins still visible and working.
- **PANELS.** The approvals and reminders panels show the same data as the server API; the
  escalation card renders for a `decidedBy.kind = watchdog` label; the recommended panel lists
  meow-memory with its note (B6).
- **RETIRE.** No old page route answers; the instance's other routes still do.
- **WD-14.**
  - EP: arg valid / each `invalid-brief:<field>`.
  - DT: §2.3 steps 2–5.
  - ST: no brief → brief active at start, with the window case (a card before attach goes to
    Fishball).
- **X-E2E**, one per DSH version:
  - a fresh child has all four bundled plugins on (no Remove shown), the "Fishball 推荐" tab in its Plugins page, and the Fishball page opens directly on Fishball's session, with no sidebar or other sessions reachable;
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

## 8. Doc edits the three designs need (names only, no design change except U1–U12)

| Design | Edit |
| --- | --- |
| fold-notify | (U10) §5/§9 E3–E5 → the fold is a `dsh.client` conversation group/node plugin and `seen` is a Fetch route; §13 the package gains `client/`; service `fishballInstanceExtensions` → `fishballInstance`; fE1 `fishballChat.sessionId()` → `manager.sessionId()`; fE2 → X2 `manager.registerSetup(pluginId, fn)`; fE3 → X3 (add `pluginId` argument); fE4 → X4/X5/X7; fE5 → X7 `setTimelinePresenter`; fE6 → X8 + K1; fE7 → X9 `inbox.setBatcher`; fE8/9 → X17/X18; seen route `api/fold-notify/seen` and `api/ext/fold-notify/seen` → `api/ext/fishball-fold-notify/seen`; §14 FN-0, FN-E6, FN-K, FN-B point to X0-*/K1; inject list in §13 |
| board | (U10) §10 the panel is a `dsh.client` `rightbar` panel entry with Fetch routes, not a page module; inject `fishballInstanceExtensions?` → `fishballInstance?`; §8 rows → X1, X2, X4–X7, X17/X18; `signal(namespace, type)` → `ui.signal(pluginId, type)`; `engines.dsh` `>=0.2.1-rc.5`; §14 X0 → X0-C/X0-U, B9 → X0-B, B0 done (S1 yes); §5 guide text: "the newest board block is the current one" (S1 note) |
| watchdog (U1–U12 **are** design changes) | (U12) side sessions are instance-owned agent runs, allowed by the new-session refusal's exception (Q-H) and never viewable; the escalation card is a chat-node definition (PANELS); §6.2 R1 "no brief" → "session not claimed" (X15 `approvals.claim`, §2.6), R2 "plugin disabled" drops (a disabled plugin has no claims); E6 `setDelegate`/`supervised` → per-session `approvals.claim`; §9 has no `enabled` (U7); §2.1 "installed with Install for Fishball" → bundled (X17/X18); §12 package note; §13 wE3 and wE4's section half → X2, wE4 notify → X10, wE2 → X9 claims, wE9 → X15, wE10 → X14 + hand-over; remove the §9 `enabled` setting and the `disabled` halt cause (§4.5.4); add §4.5.6 "Turned off: hand-over" (§2.4 here), §4.5.7 "Turned on again: briefs stay dormant until `watchdog_resume`" (U6), and "Every managed session needs an active brief" (§2.3 `start_session.watchdog` + §2.5 send gate); §4.5.1 state table gains `dormant` (any running state allowed, sends refused) and the "no brief" row; §4.5.2's gate text → X19's `supervision-paused` row; §4.4 `watchdog_brief` result gains `sendUnlocked`, and on a dormant brief it supersedes instead of `brief-exists`; `watchdog_resume` accepts `dormant` as well as `paused`; the manager section states the U5 rule in one line; §10 "Plugin uninstalled" row → "not removable; a failed placement = `plugin-gone`"; §14 WD-0 → X0-*, add WD-14; §15 test edits of §6 here; §16.1 add U1–U6 |

## 9. Open questions for the user

| # | Question | A | B | Recommendation |
| --- | --- | --- | --- | --- |
| Q-C | *(closed: A-lite, U10)* | | | |
| Q-E … Q-M | *(closed by U13: E, F, G, H, I, J, M as recommended; K = B; L changed, §11.9)* | | | |
| Q-N, Q-O | *(closed by U13: Q-N = A, Q-O = B)* | | | |

**Conflicts with earlier decisions (listed, not chosen):**
- **K-1 (closed by U10):** D28/I2 is superseded for the chat page.
- *(history)* **K-1, the composer and D28/I2.**
  - D28/I2: the child does **not** boot DSH's Web UI (`docs/slim-native-design.md:52`, `:608`).
  - §0.5 "Plugins in the child": plugins' browser halves have no host in the child (`:398-401`).
  - The composer request needs DSH's client kernel in the child page (§10.1). Q-C = A therefore
    reverses D28 for the whole page, not only for the composer.
- **K-2 (closed by U10):** X4–X7 are withdrawn (§11.7).
- *(history)* **K-2, X4–X7 page modules.** Under Q-C = A the page becomes DSH's own Web client.
  - Fold's presenter (X7 `setTimelinePresenter`) and the board's panel (X7 `sidebar`) become DSH
    client slots (`conversation.chat.node`, the sidebar), as eaa33f5's messenger was.
  - X4–X7, FN-4, FN-5 and B5 would need a redesign for React slots.
  - Under Q-C = B nothing changes.
- **K-3 (closed, user answer A, 2026-11-08):** while a session's brief is paused or halted, its
  requests still go to that session's own watchdog (it stays claimed), not to Fishball. The §2.6
  table stands as written.

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

### 10.3 Can we take only the session page and keep plugin compatibility? (user question 2026-11-08)

User's words: "不能单独拆会话页面，又维持对DSH插件兼容性吗？"

**Short answer: not without the web app's client half.** A composer plugin is not a component the
page can import. It is a **browser Cordis plugin** that registers slot entries into the Composer's
slots, inside DSH's browser kernel. To keep that compatibility, the page has to run that kernel and
load the plugins' `./client` bundles. Only `dsh-web-app` serves those (§10.3.2). What we *can* do is
run the web app and show only the session view. That is A-lite.

#### 10.3.1 How composer plugins hook in

They hook in on **both sides**: a server-side row (a node plugin) plus a browser half declared as
`dsh.client` and loaded by the web shell. The browser half registers **slot entries**. There is no
separate composer registry, except for a few typed input events.

| Example | Server side | Browser side | rc.5 | rc.1 |
| --- | --- | --- | --- | --- |
| Voice input (`dsh-experimental-voice-input-bundle`) | rows `speech-to-text`, `-sensevoice`, `api-speech-to-text` (`cordis.patch.yml`) | row `ui-voice-input`, package `dsh-experimental-client-ui-voice-input`, `dsh.client.inject` = remotes, session-controller, locale, **`dsh-client-ui-conversation`**, primitives, gateway, plugin-manager (`package.json`); it registers slot `conversation.input.activity` and writes into the editor through the bar's `inputActions.insertText` | `lib/client.js:2920`, `:1832-1947` | `:3653`, `:1832-1948` |
| Model picker (`dsh-client-ui-model-selection`) | `agent-default-model` and the session controller's model API | registers slot `conversation.input.model` | `lib/client.js:1903` | `:2064` |
| Goal (`dsh-client-ui-goal`) | goal tool | registers an input event through `ctx.uiConversation.events.register` | `lib/client.js:571` | `:661` |

The slot names are declared by the bar entry (`dsh-client-ui-conversation/lib/client.js:20092-20131`
rc.5, `:22958-22997` rc.1). The browser halves are found by `dsh-client-modules`' node half, which
scans the loader's rows for `dsh.client` (`dsh-client-modules/lib/index.js:732` rc.5, `:789` rc.1),
composes `window.__DSH_BOOT__` and serves `/plugins/<id>/client.js` (`dsh-web-app/cordis.patch.yml`
row `modules` `:227` rc.5, `:223` rc.1).

#### 10.3.2 The smallest thing that gives the real Composer

| Candidate | Finding | Verdict |
| --- | --- | --- |
| Load the Composer component alone into today's page | not exported (§10.1); `InputBar` needs `useSession`, `useInput`, the input hub, file uploads and the keymap through slot injection from the kernel (`:18955` rc.5, `:21757` rc.1) | impossible |
| Load only `dsh-web-frontend`'s bundle | `dist/` (5.3 MB rc.5, 5.5 MB rc.1) is the shell kernel. It only runs with `window.__DSH_BOOT__`, which the node half of `modules` composes, plus `/api` from the `connection` row, the session controller, file upload and the web server. Those are all rows of `dsh-web-app` (`cordis.patch.yml:121,179,197,227,234,245` rc.5; `:117,175,193,223,230,241` rc.1) | needs the web app's node rows anyway |
| An existing "embed", "focus" or single-session route in the shell | none found. No client package reads `location.search` or `location.hash` for a mode; the only `URLSearchParams` in the conversation client are Lexical's error links (`:5292` rc.5, `:5488` rc.1). "zen" in the bundle is a markdown renderer field, not a layout mode | does not exist |
| The web shell, booted into one session with a minimal layout | proven by the 2026-11-06 SP spike (`docs/spikes/body-soul-sp.md`, SP1): priority −1 empty occupants of `sidebar` and `shell.leading`, `layout.toggleSidebar()`, `uiWorkspace.openSession(id)`. The root slot has the children `sidebar`, `main`, `rightbar`, `shell.bottom`, `shell.overlay`, `shell.leading` (`dsh-client-ui-layout/lib/client.js:624-650` rc.5, `:706-732` rc.1); `root` itself cannot be replaced. A 56 px rail remains (`computeColumns`, `:38` rc.5, `:39` rc.1) | **works**: A-lite |

So the smallest working form is: `dsh-web-app` in the child profile; the rows a single session does
not need disabled (the list is in `spikes/instance-ext/measure-web.mjs` `LITE_OFF`: right sidebar,
document preview, browser, terminal, files, the ten `ui-settings-*` pages, `ui-permission`,
`ui-agent-preset`, workflow run, trajectory, telemetry, open-in-app, HMR); and one child client
plugin of the instance that shadows `sidebar`, `shell.leading` and the hero workspace picker, opens
Fishball's session, and hides the rail.

#### 10.3.3 Memory (measured 2026-11-08)

Method: `spikes/instance-ext/measure-web.mjs`, in-process `runProfile` in a throwaway
`/private/tmp/spx-mem-*` home, the fake model, Homebrew Node 22.22.2, RSS 4 s after ready. One run
each, so this is indicative only. The homes were deleted, and no process was left running.

| Variant | rc.5 RSS / ready | rc.1 RSS / ready |
| --- | --- | --- |
| base only (today's child) | 144 MB / 0.65 s | 141 MB / 0.62 s |
| + `dsh-web-app`, every row | 247 MB / 1.04 s | 248 MB / 0.99 s |
| + `dsh-web-app`, `LITE_OFF` disabled (A-lite) | 229 MB / 0.91 s | 244 MB / 0.89 s |

- A-lite costs **about +85–105 MB RSS** and about +0.3 s to start. Disabling the rows a single
  session does not need saves only 4–18 MB, because the kernel, the web server and the client
  module table are what weigh.
- Under the DSH-X wrapper (Electron as Node), SP2 measured 174–253 MB for the Web child.
- The browser side also loads the 5.3–5.5 MB shell bundle into the iframe once. That memory is the
  browser's, not the child's.

#### 10.3.4 What of today's planned page survives under A-lite

| Part | Under A-lite | Keep or redo |
| --- | --- | --- |
| Sidebar fish, dots, unread (`packages/connector/client.js`, main DSH) | not in the child page at all; it lives in the **main** DSH's connector client | **kept** unchanged |
| K1 `instance.attention` and the connector alert | instance → connector wire | **kept** |
| Every X point on the server side (X1–X3, X8–X19), the watchdog, the board's tools and context | child core, not the page | **kept** |
| X3 record projection | DSH's chat renders session records through its own projection; a plugin record needs a DSH chat node renderer | **redo**, as a slot entry on `conversation.chat.node` |
| Fold-notify's presenter (FN-4/FN-5) and X7 `setTimelinePresenter` | DSH's chat list is React and slot-driven; folding becomes a chat-node or group plugin (`ConversationGroupRegistry` is exported, `dsh-client-ui-conversation/lib/types/client/index.d.ts:25`) | **redo** |
| Board panel (B5) and X7 `sidebar` | a `rightbar` or `main` panel slot entry instead of our aside | **redo** (small) |
| Bubbles and avatars (UI-1) | eaa33f5's messenger **was** this, as a slot plugin with a stylesheet on `conversation.chat.node` (§10.1) | **reuse eaa33f5** almost as it is, instead of porting it to plain DOM |
| Read Only chip (D8) | disable `ui-permission`; the `/permission` command still works, so the core `permission` row must be limited to `read-only` (SP spike F3) | **redo** as configuration |
| Hand over and Take back | main-DSH connector UI | **kept** |
| The instance settings view, approvals view, reminders | today's custom page; under A-lite, a `main` panel (SP3 showed DSH's Plugins page renders there) | **redo** as panel slot entries |
| X4–X6 (`ui.register`, `ui.registerRoute`, `ui.signal`) | plugins ship their own `dsh.client` half and use Connection Fetch routes (SP spike F1) | **replaced** by DSH's own mechanism; X4–X7 are withdrawn |

### 10.2 Proposal *(superseded by §11, U10; kept as history)*

Under **A-lite**, UI-1 below becomes "re-enable eaa33f5's messenger stylesheet as the instance's
child client plugin", and task UI-C is the A-lite page (W1–W2, before FN-4, FN-5 and B5, which then
target DSH slots). Under **B**, UI-1 and UI-C' stand as written.

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

## 11. The Fishball page under A-lite (U10, U11, U12)

§10.2's UI-1 / UI-C / UI-C' tasks are replaced by this section. Line numbers are in the installed
DSH packages (rc.5 / rc.1), read only.

### 11.1 Rules

1. **Ecosystem first (U10).** Every `dsh.client` plugin enabled in the child profile loads as in
   any DSH. This holds because `dsh-client-modules` scans the loader rows for `dsh.client`
   (`dsh-client-modules/lib/index.js:732` / `:789`) and serves them all. We shadow slots; we never
   filter that scan.
2. **Removal only through DSH's own mechanisms.** In this order of preference:
   1. a slot occupant at priority −1 (an empty component);
   2. the layout and shortcut APIs;
   3. disabling a child UI row in the launch overlay;
   4. as the fallback, CSS from the same plugin.

   No fork of DSH, and no patching of its code or bundles.
3. **Native mechanisms for our own UI.**
   - Chat rows: `uiConversation.events.register` (as `dsh-client-ui-goal/lib/client.js:571` / `:661`).
   - Panels: `main` or `rightbar` slot entries (as `dsh-client-ui-plugin-manager` and
     `dsh-client-ui-schedule` do).
   - Settings: DSH's Settings and Plugins pages.
   - HTTP: Connection Fetch routes (SP spike F1).

   The custom page (`src/slim/ui/*`, X4–X7) is retired.
4. **Read Only by configuration** (§11.6). The user cannot switch it in the UI.
5. **The door to full option A stays open.** Everything is a shadow or a disabled row in the
   **child's** overlay. Turning off `fishball-page` and re-enabling the rows gives DSH's full UI
   back, with no data migration: the session, its log and the plugins are the same.
6. **The main DSH is untouched.** Its profile, web, plugins and settings are never changed. The
   only main-side change is the connector's embed frame and broker (task EMB).

### 11.2 The `fishball-page` plugin (U11)

- **Package:** `packages/instance/child-web/fishball-page/` (its own `package.json` with
  `dsh.client: {platform: 'web', inject: [...]}` and `exports["./client"]`), shipped inside
  `fishball-instance`.
  - *Why a sub-package.* `fishball-instance`'s own `package.json` is read by the **main** DSH's
    client-modules, so the page plugin must not be declared there.
  - The main DSH never has a row for it, so it can never load there.
- **How it loads in the child:** as a **row in the instance's launch overlay**
  (`src/native-runtime/overlay.js`), the way `fishball-native-app` is inserted today. It comes from
  the snapshot that `copyChildCode` writes.
  - *Why not the §2.2 bundled placement.* A bundle is listed in DSH's Plugins page and can be
    switched off. Switching this one off would put the sidebar and the other sessions back, which
    U11 rules out.
  - This is Q-E (§9). The spike SP-PG checks that `client-modules` serves a `dsh.client` row whose
    package lives in the snapshot (`resolveMeta`, `dsh-client-modules/lib/index.js:720-745` rc.5).
- **Inject:** `slots`, `layout`, `uiWorkspace`, `sessions`, `shortcuts`, `uiConversation`, `locale`.
- **One more module in the same package:** eaa33f5's messenger (grey bubbles and avatars, UI-1),
  taken almost verbatim (eaa33f5 `packages/messenger/client.js:122-180`, `:251-320`).

### 11.3 What it removes, and how

| Component | Mechanism (first choice) | rc.5 / rc.1 source | Fallback |
| --- | --- | --- | --- |
| Left sidebar (workspaces, session list, panel list, new chat) | empty occupant of `sidebar` at priority −1 (SP1 proven) | root children `dsh-client-ui-layout/lib/client.js:624-650` / `:706-732`; `sidebar.workspaces` `dsh-client-ui-workspace/lib/client.js:5222` / `:6051` | CSS `display:none` on the sidebar column |
| `shell.leading` (sidebar toggle and the controls beside it) | empty occupant of `shell.leading` (SP1) | `dsh-client-ui-sidebar/lib/client.js:651` / `:773` | CSS |
| **56 px rail** | **no DSH mechanism**: `collapsedWidth` is 56 unless `data-platform="darwin"`, `data-windows-titlebar`, or (rc.1 only) the viewport is < 768 px | `dsh-client-ui-layout/lib/client.js:242` / `:267` (`computeColumns` `:38` / `:39`) | CSS from the plugin; see Q-F |
| Collapse the sidebar once | `layout.toggleSidebar()` at start (SP1) | `selectPanel` `:468` / `:522` | — |
| Hero workspace picker (empty session only) | empty occupant of `conversation.hero.workspace`; the inert chip stays (SP F2) | `dsh-client-ui-workspace` | CSS hides the chip |
| Header lineage links (parent/child sessions) | empty occupant of `conversation.session.header.lineage` | `dsh-client-ui-subagent/lib/client.js:979` / `:1262` | CSS |
| Header utilities that leave the page (open-in-app) | the row is disabled (read-only, §11.6) | `dsh-web-app/cordis.patch.yml` `open-in-app`, `ui-open-in-app` (rc.1 `:73,:84`) | — |
| Permission picker | `ui-permission` row disabled (SP1) | `cordis.patch.yml:418` / `:420` | — |
| Agent preset picker | `ui-agent-preset` row disabled (SP1) | `:423` / `:425` | — |
| **Kept:** conversation view, Composer, all `conversation.input.*` and `conversation.composer.dock` entries, chat nodes, header actions of other plugins, `rightbar` panels (except terminal, §11.6), DSH Settings and Plugins pages | — | — | — |

### 11.4 Allowed destinations and escape prevention

**Allowed:** Fishball's session view, plus the `main` panels for DSH Settings, Plugins and any
plugin's settings (U12), plus our own panels (approvals, reminders, board). **Blocked:** every other
session, the session list or search, the new-session view, and any other panel.

Every path ends in one **navigation guard** in `fishball-page`. *Why one guard.* A guard on the
result catches paths we have not listed, including other plugins.
- It subscribes to the sessions store. The session in the main view is the one whose
  `retainedBy.mainView > 0`; the workspace shortcuts read the same fact
  (`dsh-client-ui-workspace/lib/client.js:89` / `:100`).
- It subscribes to the layout's active panel.
- When the main view shows a session other than Fishball's, or a panel not on the allow list, it
  calls `uiWorkspace.openSession(fishballId)` or `layout.selectPanel(null)` within the same frame.

| Path | Handled by | Notes |
| --- | --- | --- |
| Opening the page | the plugin opens Fishball's session at start (SP1); the session id comes from a child Fetch route | lands directly on Fishball |
| Deep link to another session or page | **none exists**: DSH's client keeps no route in the URL (no `history.pushState`, `location.hash` or `popstate` handling in the client packages; the only `popstate` string in the bundle is React's event table) | the guard covers anything a future version adds |
| Browser Back | the iframe's history has no DSH entries (same reason), so Back cannot reach another DSH view | Back inside the iframe only reloads the page, which opens on Fishball |
| `Cmd+K` (`session.search`), `Cmd+N` (`session.new`), fork, archive, add workspace, rename | (1) unbound through DSH's shortcut preferences, where "null explicitly unbinds" (`dsh-client-shortcuts/lib/types/configuration.d.ts:2-5`), written once by the instance into the child's shortcut document; (2) the guard catches whatever still opens | ids from `dsh-client-ui-workspace/lib/client.js:123-176` / `:134-187`. The registry refuses a second registration of the same id (`dsh-client-shortcuts/lib/client.js:1211`), so overriding by registering is impossible. Where the document lives is spike item SP-PG(5) |
| Session references inside messages (`session-reference`, `ui-reference`) | the guard bounces back | the rows stay, for ecosystem compatibility |
| A plugin that calls `openSession` or `selectPanel` | the guard | — |
| `/new`-like commands in the composer | the server refusal (§11.5) and the guard | — |

### 11.5 No new sessions (U12)

| Layer | What refuses | Proven? |
| --- | --- | --- |
| UI | the sidebar and new-chat entry are gone, the shortcuts are unbound, the guard bounces | design (SP-PG) |
| Server, session-controller RPC `create` | **no veto hook found**: `create` goes straight to `agents.createSession` (`dsh-api-session-controller/lib/index.js:755-786` / `:666-697`); `agent/created` fires only after creation (`dsh-agent/lib/index.js:581` / `:710`) | gap, Q-G |
| Fishball's own tools | the child has no tool that starts a child session (`start_session` targets the **main** DSH through the connector) | yes |
| DSH subagents (`tool-subagent`, `provider: spawn`) | create child sessions in the child DSH (`dsh-base/cordis.patch.yml:380-383` / `:381-384`) | conflict, Q-I |
| DSH schedule (`schedule`, `ui-schedule` rows) | runs scheduled prompts as new sessions | disabled in the child (derived from U12; K-4) |
| Instance-owned agents: Fishball's own session (first run or replacement), watchdog side sessions (X13) | created by the instance's rows through `ctx.agents.create` | the exception, Q-H |

### 11.6 Read-only everywhere (U12)

All of these are set in the **launch overlay**, which is applied after the profile's own patch layer
and so outranks anything the user saves in Settings (`dsh/lib/profile-boot.js` `composeProfile`
order: bundles, profile layer, home layer, `--patch` overlays).
- `sandbox-policy.mode = read-only` (today: `overlay.js:31`).
- The `permission` row's `presets` contain `read-only` only, and `defaultPreset: read-only`. Then
  `/permission` refuses any other name (SP spike F3).
- `ui-permission` disabled.
- Rows that act outside read-only are disabled: `terminal-controller` and `ui-sidebar-terminal` (a
  shell); `open-in-app` and `ui-open-in-app` (native launches); `schedule` and `ui-schedule` (new
  sessions). This is K-4.
- **Escalation.** In read-only mode a denied tool may retry with a widening request that asks for
  approval (`dsh-sandbox-policy/lib/index.js:74`). Under U12 nothing may widen, so the child's
  approval policy must refuse widening. This is Q-J.

**What read-only does and does not cover.** Read-only is the **agent's tool and file permission**:
what the model can make DSH's tools do. A plugin's **own storage**, written by its own Node code
through `node:fs`, is not a tool call and is not sandboxed. So these keep working:
- `board.json`, the watchdog's brief, criteria and supervision files, fold-notify's `seen.json`;
- `chat.json`, reminders, approval labels;
- provider/model sync (X0 code, D-series);
- meow-memory's library (`.dsh-meow`, written by its own code).

A plugin feature that asks **the agent** to write through DSH's file tools is refused. That is the
intent of U12.

**Settings (U12, (c); revised by U13).** Opening Settings, installing, removing and switching plugins, and changing
providers or models are **the user's** actions, not the agent's, so read-only does not restrict
them. The risks:
- A user setting that tries to raise the sandbox is overridden by the overlay. The field may still
  show the user's value, which is misleading; SP-PG checks how DSH shows it.
- DSH's Plugins page offers **Remove** for the bundled plugins (`removable: true`, SP-FN1), which
  bypasses X18's refusal in our relay. This is Q-K.

### 11.7 What changes for the earlier plan

| Item | Change |
| --- | --- |
| X3 | the server-side projector into `GET api/chat` is withdrawn. A plugin renders its own record with a chat-node definition (`uiConversation.events.register`). X3's record **type rule** (`plugin:<pluginId>/…`) stays as a convention |
| X4–X7 | withdrawn. Plugins ship their own `dsh.client` half; routes are Fetch routes; refresh uses DSH's own state or the plugin's route |
| X0-U | **withdrawn**, replaced by CHILD-WEB, EMB and PG-1 |
| X0-A | the server half is unchanged; its UI half (the "代批" tag, the escalation card in `ui/approvals.js` and `ui/records.js`) moves to PANELS |
| X0-B | X17/X18 server half unchanged; the bundled plugins show in DSH's Plugins page, with Remove hidden by `fishball-page` (Q-K B, §11.10) |
| Custom settings view (I6) | **kept, slimmed** (U13, §11.8). Only what DSH's own pages cannot do stays; the user can also open the child DSH's Settings |
| FN-4/FN-5 | the fold presenter becomes a conversation group/node plugin (`ConversationGroupRegistry`, `dsh-client-ui-conversation/lib/types/client/index.d.ts:25`); `seen` uses a Fetch route |
| B5 | the board panel is a `rightbar` panel entry, with its read and export Fetch routes |
| UI-1 | becomes the messenger module of `fishball-page` (§11.2) |
| Connector embed | the broker forwards DSH's shell (EMB, SP-PG(1)) |

### 11.8 The Fishball settings page: what stays, what moves (U13)

The Fishball settings page stays, as a `main` panel of `fishball-page` (allowed destination). It is
reached from a header action in Fishball's session and from the connector's Fishball view, as today.
From it, and from DSH's own entry, the user can open the child DSH's Settings and Plugins pages
(allowed destinations, §11.4). Only what DSH's pages cannot do stays on it.

| Item (today's `src/slim/ui/settings.js`) | Where it goes | Why |
| --- | --- | --- |
| Status and Restart (`drawStatus` `:243`) | **stays** | DSH cannot restart its own child process; it is the instance's lifecycle |
| Model provider sync (check and add DSH's models, `settings.modelSyncHint`) | **stays** | instance-specific: it copies the main DSH's providers into the child |
| Fishball's default model and effort (`drawModel` `:284`) | **moves** to DSH Settings → Models, and the Composer's own picker | DSH already sets the default model; `agent-default-model` is DSH's row |
| Read Only notice (D8, U12) | **stays**, one line | explains why the permission picker is absent |
| Plugins list, on/off, Uninstall, Install (`drawPlugins` `:370`) | **moves** to DSH's Plugins page (Installed tab) | DSH does it natively; Remove of our bundled three is hidden (§11.10) |
| Recommended plugins (`settings.recommendedTitle`) | **moves** to the new Plugins-page tab (§11.9) | U13 |
| Plugin settings forms (`namespaceForm` `:531`) | **moves** to DSH's Plugins page (`plugins.bundle.config`, `plugins.row.config`) | DSH renders each plugin's config form |
| Links to "DSH Settings" and "Plugins" | **new** on the page | U13: "额外可以访问instance内的设置" |

Task **SET** owns this (below). The server routes for the moved items (`admin.plugin.*`,
`admin.settings.*`) stay while the main-side relay still uses them, and are retired with RETIRE
once nothing calls them.

### 11.9 `fishball-recommend-plugins`: a tab in DSH's Plugins page (U13)

**DSH mechanism.** The Plugins page renders a **list slot `plugins.tab`** (root scope). Each entry
is one tab, with `id` and `label`, rendered as the tab's panel:
- the declaration is `dsh-client-ui-plugin-manager/lib/client.js:4428-4431` (rc.5) and
  `:7764-7767` (rc.1);
- the tabs are read from `ctx.slots.entries("plugins.tab")` at `:4311` / `:7636`;
- they are rendered at `:4082` / `:7236`.

DSH's own `Discover` tab is registered this way by `dsh-client-ui-plugin-market`:
`ctx.slots.register({name: "plugins.tab", id: "discover", label, locale, inject})`, at
`lib/client.js:1623` (rc.5) and `:2354` (rc.1).

**The `Fishball` tab in the screenshot** is the **legacy** in-process Fishball's plugin manager tab:
the old root `client.js` registers `plugins.tab` with id `fishball` (`feat/slim-native-embedded-ui`
106e93c `client.js:4166`, `makeFishballTab` `:4064`). Today's connector and instance packages do not
register any `plugins.tab` (`git grep` on `feat/body-soul` `packages/` finds none). So the
screenshot is from a DSH where the legacy package is still installed; the new tab replaces it in
spirit.

**The plugin.**
- **Package:** `packages/recommend-plugins/`, npm name `fishball-recommend-plugins`, `dsh.client`
  (web) only, plus a tiny Node row that serves the list through a Fetch route.
- **Bundled** like the other three (§2.2): `RUNTIME.bundledPlugins` gains
  `{name: 'fishball-recommend-plugins'}`. It is in the **child** profile only (Q-N = A).
- **The tab:** `plugins.tab` entry with id `fishball-recommended` and label "Fishball 推荐" (zh) / "Fishball Recommended" (en) (Q-O = B). It
  lists `RECOMMENDED_PLUGINS` (`src/recommended.js`), with B6's meow-memory note. Each row has
  **Install**, which calls DSH's own install flow (`pluginManager.installBundle` through the page's
  injected face, as the Discover tab does), or shows "Installed" when a bundle of that name exists.
- **Retires** B6's panel and the `recommended` part of the admin relay (`ADMIN_RECOMMENDED`).
- **Unproven, so in SP-PG (8):** that a third-party `plugins.tab` entry gets the same install face
  as Discover (`inject: () => face`), on both versions; otherwise the tab calls the child's
  `pluginManager.installBundle` remote itself.

### 11.10 Hiding Remove for our bundled plugins (Q-K = B)

- **The button:** DSH's package detail renders `Uninstall` inside the element
  `data-plugin-detail="<package name>"` (`dsh-client-ui-plugin-manager/lib/client.js:2845` /
  `:5896`). The button is at `:2865-2873` / `:5927-5935`; its only stable hooks are its
  `aria-label` (`uninstallLabel`, localised) and an icon, and its class is hashed.
- **Rule** in `fishball-page`'s CSS, one per bundled name:
  `[data-plugin-detail="<name>"] [aria-label="<uninstallLabel for name>"] { display: none }`. The
  label text is built at run time from DSH's own locale string (`ctx.locale`, plugin-manager
  namespace), so no hashed class name is used.
- The card list (`data-plugin-package="<name>"`, `:2625` / `:5665`) has no Remove button, so
  nothing to hide there.
- **Unproven, so in SP-PG (9):** that the localised `uninstallLabel` can be read through
  `ctx.locale` from another plugin, on both versions. If not, the fallback is the button's position
  inside `[data-plugin-detail=…]` relative to `plugins.detail.actions`. If neither is reliable,
  Q-K goes back to the user (A: accept Remove as "off", as before).

