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
| U4 | "中途关掉会自动转交给Fishball": turning it off mid-way **hands the supervised sessions to Fishball**. The sessions keep running, nothing is halted. Fishball gets **one** notice listing them. Briefs and criteria are kept. U20 extends this same hand-over to watchdog faults and supersedes Q13 halting. The coupling rule (R17) still holds, with Fishball as the supervisor | X14 hand-over, §2.4 |
| U5 | Q-A = **B**, narrowed by U20: only while the watchdog is **enabled and healthy**, **every** managed session must have an **active** brief before Fishball sends it anything: sessions Fishball starts, sessions the user hands over, and sessions Fishball messages or redirects. Enforced by the instance. Reading, answering approvals or questions, and release stay allowed without a brief | X19, §2.5 |
| U6 | Q-B = **B**: turning the watchdog back on does **not** resume the kept briefs. They become `dormant`; Fishball gets one notice listing them and resumes each with `watchdog_resume`. A session whose brief is dormant has **no active brief**, so sends to it are refused (U5) until Fishball resumes that brief or writes a new one | X14, §2.4 Recovery, §2.5 |
| U7 | W0 tester Q4: "这个做成和普通的插件一样的管理". Configured enablement is `fishball-watchdog` in the child profile (`dsh.profile.bundles`), switched like any DSH plugin. No separate `gateOn` file. U20 distinguishes effective readiness: enabled but failed/not registered → gate off and Fishball hand-over, not `watchdog-unavailable` sends. Recovery gives dormant briefs (U6) | §2.4, §2.5, X19 |
| U8 | W0 tester Q3: "一个watchdog的session只负责盯一个会话，这是一个一对一的关系。watchdog会将session的请求redirect到watchdog上，如果watchdog不存在，就会直接走向fishball。" One watchdog side session per watched session (1:1). The watchdog **claims** a session when it attaches and drops the claim when it detaches; a claimed session's **permission requests only** go to the healthy watchdog, every other permission request goes to Fishball; questions/plan reviews always go to Fishball (U21) | X15, §2.6 |
| U10 | Q-C = **A-lite**: "A，优先保全DSH的拓展性和对DSH的生态的兼容能力". The child profile gets `dsh-web-app` back; the Fishball page is DSH's own web shell booted into Fishball's session with a minimal layout. **Guiding rule from now on: preserve DSH extensibility and ecosystem compatibility first.** Supersedes D28/I2 ("borrow styles only") for the chat page | §11 |
| U11 | "一打开就要是Fishball的页面，通过修改DSH的网页来删去其他的组件，只留下Fishball一个会话页。" and the mechanism: **one small `dsh.client` plugin, `fishball-page`, bundled inside fishball-instance, loaded only in the child's DSH web**, does every removal and layout change. Never installed into the main DSH; no patching of DSH code or bundles; CSS from the same plugin is the fallback | §11.2–§11.5 |
| U12 | "Fishball instance内的设置页也用DSH自带的插件设置页，且可以打开instance内的DSH setting页面，只是删除了侧边栏和其他的session页面，查看session只允许查看Fishball的session，并且拒绝启动任何的新session，并且整个fishball instance的DSH都没有只读以外的权限。" DSH's own Settings and Plugins pages are allowed destinations; only Fishball's session can be viewed; no new session can be started; nothing in the child goes above read-only | §11.4, §11.6, §11.7 |
| U13 | §9 answers (2026-11-08): Q-E A, Q-F A, Q-G B, Q-H A, Q-I A, Q-J A, Q-M A as recommended; **Q-K = B** (hide Remove for our bundled plugins with CSS in `fishball-page`); **Q-N = A** (the recommended tab only in the child's Plugins page); **Q-O = B** (label "Fishball 推荐" / "Fishball Recommended", id `fishball-recommended`); **Q-L changed**: "现在设置页还要，但是额外可以访问instance内的设置，推荐插件列表就放在DSH的插件页面内的这里的额外一个tab，也做成一个插件，就叫fishball- recommend-plugins。但是很多instance的设置，比如插件的开关可以依靠DSH自带的插件页面来实现。" | §11.8, §11.9 |
| U14 | "审批的卡片，要么直接判断，要么无法判断交给Fishball，如果Fishball也无法判断，才会变成一个无限时间的留给用户的卡片。而在此中间要么向上提交请示，要么直接批注，没有等待时间。删除等待时间。" No approval step waits on a timer: watchdog decides or escalates at once; Fishball decides or escalates at once; the user's card has no time limit | §12.1 |
| U15 | X3 namespace: option B. No validation API in X0-C; the prefix rule is enforced where plugins register their record types with DSH | §12.2 |
| U16 | "watchdog是无论用户在不在都要激活的，原理是利用一个小上下文的小助理来处理工作中反复被唤起，需要允许权限，以及监督会话防止跑偏的。这是一个token节约器，而非一个额外的安全选项。" The watchdog is a **token saver** for Fishball, active whether or not the user is present; not a security layer | §12.3 |
| U17 | **Final, Q-Q clarified.** Clear a resolved card at once; return the requesting tool's result. Decision records are ordinary chat-history entries only at the layers the request reached: watchdog-only decisions never enter Fishball's context or transcript **automatically**; requests escalated to Fishball or the user do. Q-T permits an explicit `watchdog_decisions` pull, including watchdog-only decisions (§12.8). Compaction removes the record from model context, not the searchable transcript. No separate decision-audit or attribution-label retention store | §12.4 |
| U18 | X0-C coverage gaps: option A. The tests cover them; behaviour they exposed as unspecified is specified in §12.5 | §12.5 |
| U19 | "看板任务永不清理，永久都可以通过grep查询关键字来找到过去完成的看板。而看板上的任务一旦完成就留30天，除非主动清除。" Board records are never deleted **while installed**; a closed task stays **on the board** for 30 days unless cleared early, then remains archived. Q-R = B: `board_search` searches the archive. Q-S = A: uninstall offers an archive export first, then deletes the runtime including the archive | §12.6 |
| U20 | "如果是watchdog的故障，视作没有开启Watchdog插件": watchdog faults are effective off. Fishball takes supervision/permissions; X19 passes sends. Supersedes Q13 stop/halt and narrows Q-A=B and K-3 to a healthy enabled watchdog. Recovery preserves U6 dormant briefs, not automatic re-claim | §2.3–§2.6 |
| U21 | Questions and plan reviews are never claimed by the watchdog; Fishball always handles them and may separately refine the watched session's direction while answering | §2.7, WD-11 |
| U22 | Old timer-contract third-party instances (1.1) are incompatible; no legacy exception. Negotiate timer-free contract 2.0 and reject 1.x at attach with `contract-version` | §3, §12.1, K1/K2 |
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
| X2 | `manager.registerSetup(pluginId, fn(agentCtx, agent)) → dispose` | the **one** way into the manager's agent scope: tools (`agentCtx.tools.register`), static sections (`systemPrompt.section`), dynamic context (`systemPrompt.context`). Runs on create and every resume, after the persona, in registration order. A late registration is applied to the live agent at once. Each registration runs as its own fiber `agentCtx.plugin({apply: fn})`, so `dispose` removes everything `fn` registered | fold (tool + section), board (3 tools including `board_search`, guide, dynamic context), watchdog (11 tools + loop section) | fE2 = b2; **replaces** wE3 `registerManagerTools` and wE4's `addManagerPromptSection` |
| X3 *(server projector withdrawn, U10; no validation API in X0-C, U15: the prefix rule is enforced where record types are registered, §12.2)* | `chat.registerRecordProjector(pluginId, type, fn(data, event) → {id, at, data, text?} \| undefined) → dispose` | show a plugin's log-only record in `GET api/chat` and the SSE `entry` frame as `{id, kind: 'plugin', plugin, at, data, text?}`; `type` must start `plugin:<pluginId>/`. **Added:** optional `text` (≤ `EXT_LIMITS.recordTextChars`, a new constant in `child/extensions.js`, equal to `CHAT_LIMITS.entryChars` (8000), the cap `chat.js` `notify` applies at `:679`), drawn by the instance as a plain record row when no page module renders the entry | fold (notice), watchdog (report, guard notices) | fE3; covers wE4's "shown in the manager's chat" |
| X4 *(withdrawn, U10)* | `ui.register({pluginId, module, style?, dictionaries}) → dispose`; `GET api/ui-extensions → [{pluginId, module, style?}]`; files served at `ui/ext/<pluginId>/…` with the `/ui/*` checks | load a plugin's page module; CSP stays `'self'` | fold, board | fE4 (a–c) = b3 |
| X5 *(withdrawn, U10: Connection Fetch routes, §11.3)* | `ui.registerRoute(pluginId, {method, path, handler(req) → {status, body}}) → dispose`, served at `api/ext/<pluginId>/<path>`, same bearer and body limits as `api/*` | a plugin's JSON routes | fold (`seen`), board (`board`, `export`) | fE4 (d) = b3 |
| X6 *(withdrawn, U10)* | `ui.signal(pluginId, type)` → SSE event `ext` `{pluginId, type}`, data-free, coalesced per `(pluginId, type)` per tick | tell a module to re-read | board | b3 (b) |
| X7 *(withdrawn, U10)* | Page hook object passed to each module's default export: `{document, i18n, request, sidebar({order}) → HTMLElement, onSignal(type, fn) → dispose, setTimelinePresenter(presenter) → dispose}` | page-side reach: an aside container (mounted above `#reminders`, ordered by `order`), the signal filtered to the module's own `pluginId`, and the **single-owner** timeline presenter with fE5's exact shape | fold (presenter), board (sidebar, signal) | fE5 + b3 (a)(b). Tested in the real browser, not in W0 (U9) |
| X8 | `attention.set(pluginId, {unread, importantUnread, latestAt}) → dispose`, single owner | the value sent as contract 2.0 `instance.attention` (§3) at once, after every handshake, and `{0, 0, null}` on dispose | fold | fE6 (instance half) |
| X9 | `inbox.claim({pluginId, kind, match(item) → key?}, onItem(item, key)) → dispose`; `inbox.release(key, {deliver, prefix?})`; `inbox.setBatcher(pluginId, fn(item, deliver)) → dispose` (single owner) | **one inbox pipeline** in `inbox.js receive`: approvals-row items → **claims** (a claimed item is acked at once and held) → **batcher** → `deliverInbox`. `release(…, {deliver: true})` re-enters the pipeline after the claims, so a released item is batched like any notice. `deliverInbox` gains an array form (fE7). `PERMISSION_NOTICE` marker added to `inbox-markers.js` | watchdog (claims), fold (batcher) | wE2 + fE7 |
| X10 | `manager.notify({pluginId, dedupeKey, text, record?: {type, data}, wake}) → Promise<{queued \| held \| duplicate}>` | a plugin's message to Fishball: `wake: true` is one notice turn (source `{kind: 'fishball-notice', form: 'plugin', pluginId}`); `wake: false` is held for the next turn; dedupe is durable. **Not batched** (fold §7 batches inbox items only) | watchdog | wE4 (notify half) |
| X11 | `manager.userTexts({limit, maxChars}) → [{text, at}]` | newest-first texts written by the **user** in Fishball's session, read-only | watchdog (`userQuote`) | wE8 |
| X12 | `bridge(pluginId, operations[]) → client` | a scoped connector client; an operation outside the list is refused locally with the code `forbidden` (U9: tests assert the code), and no request leaves the child; the list must lie within the instance's required set (no new handshake) | watchdog | wE1 |
| X13 | `sideAgents.open({…}) → {agent, sessionId, setSection}`, `sideAgents.runTurn(agent, message, {timeoutMs?, signal})`, `sideAgents.cancel(agent)` | locked-down side sessions: read-only, approval `never`, every global tool denied; check turns may set a timeout, decision turns omit it with no default timer (U14/Q-P) | watchdog | wE5 with U14/Q-P timeout change |
| X14 | `supervision.register(pluginId) → {ready(), fail(cause), set(sessionId, state, briefId), clear(sessionId), handedOver, dispose}` with `state` ∈ `active`, `paused`, **`dormant`**; `supervision.onManagedChange(listener)`; `supervision.endingReason() → 'hand-over' \| 'failure' \| undefined` | the persisted supervised set, instance-owned effective health/ownership generation, managed-change events; hand-over on disable **or failure**, never a fault-induced stop (§2.4, U20); **`dormant`** retained briefs on recovery (U6). `set` is synchronous and persisted before it returns, so a send right after it is judged on the new state. **The one source of truth** for X15's claims and X19's gate (§2.6) | watchdog | wE10 + U4 + U6 |
| X15 | `approvals.claim(sessionId, {id, name, onCard(card)}) → release`; `card(approvalId)`; `onSettled(listener)`; `answerApproval({…, decidedBy})`; the escalation card in the chat | **per-session claim (U8)**: a claimed session's `kind: approval` cards go to its claimant's `onCard`, every other session's to Fishball. At most one claim per session (a second → `owner-busy`). Questions/plan reviews never enter this claim (U21). A claim is accepted only while X14 is healthy and holds the session as `active` or `paused` (else `not-supervised`), and the instance drops it itself when X14 moves the session to `dormant` or clears it (§2.6). While a session is claimed, Fishball's `answer_approval` `grant` on it is refused `grant-off-supervised`, and `answerApproval` with `decidedBy` answers only cards of sessions the caller has claimed. The "代批 / Watchdog" tag; the open escalation card | watchdog | wE6 + wE9; **replaces** the global `setDelegate` and `supervised(sessionIds)` |
| X16 | `sessionStarts.register(pluginId, {parameter, schema, validate(arg) → {ok:true} \| {code}, attach(sessionId, arg) → Promise<{ok:true} \| {code}>}) → dispose`, single owner | **new (U2/U20)**: while registered **and effective on**, `start_session` has one more **required** argument and cannot start a session without it (§2.3). `attach` ends with `supervision.set(id, 'active')` and `approvals.claim(id, …)`, so the started session is sendable and subsequent permission cards go to its watchdog; pre-attach cards go to Fishball (§2.3) | watchdog | new |
| X19 | **Send gate** (instance-internal; the plugin only feeds it through X14): one check `gate.send(operation, sessionId) → ok \| {code, reason}` called by the bridge client for every manager→session send operation (`SUPERVISION.sendOperations` = `session.message`, `session.redirect`), plus the hand-over hint (§2.5) | **new (U5)**: while the gate is on, no send reaches a session without an **active** brief; replaces wE10's gate, which only covered `paused`/`halted`. **The gate is on only while `fishball-watchdog` is enabled AND healthy** (U7/U20); faults hand over to Fishball and pass sends | watchdog | wE10 gate + U5 + U7 |
| X17 | `RUNTIME.bundledPlugins = [{name: 'fishball-fold-notify'}, {name: 'fishball-board'}, {name: 'fishball-watchdog'}]` and placement at every child start | built in, on at first placement | all three | fE8 = b4 |
| X18 | `admin.plugins.get` marks a bundled plugin `{bundled: true, removable: false}`; `admin.plugin.remove` refuses `bundled-plugin`; enable/disable work. **Added:** disabling `fishball-watchdog`, through any path, is a hand-over (§2.4, U7) | the off switch the user keeps | all three | fE9 + U4 |
| K1 | contract 2.0 `instance.attention` + connector `state.unread = {count, important}` | the brand mark and frame unread count (today always 0) and the important alert | fold | fE6 (wire half), fold §9.1 |

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
7. Bundle removal still deletes the runtime; B10 adds the archive-export offer before deletion
   (U19/Q-S, §12.6).

Each name is placed **independently**: one failed placement does not stop the others.

**Watchdog bundled (U1/U20).** Failed placement of an enabled watchdog is `plugin-gone` and
means **effective off**, not a stop: X14 hands the persisted supervised set to Fishball (§2.4).
The persisted plugin enable setting is unchanged; no `guardGraceSeconds` stop is scheduled.

### 2.3 A watchdog at every start (U2, X16)

While a **current-generation, enabled and healthy** `sessionStarts` owner exists:

1. `start_session` is registered again with one more parameter, `watchdog` (the owner's
   `schema`), and it is **required**. In the watchdog this is the `watchdog_brief` fields without
   `session_id`. The tool's description gets one line saying a watchdog brief is required.
   *Why the schema and not prompt text alone.* The model cannot leave out a required argument
   without the call failing validation, and step 2 checks it again in code.
2. At dispatch, recheck effective readiness and capture its generation **before schema/argument
   validation**, so a pre-fault advertised schema cannot impose an off-mode requirement. If off,
   use the ordinary start path without requiring a brief. If healthy, call `validate(arg)`, then
   recheck the captured generation before `session.start`; a lost owner switches to the ordinary
   start path, never creates twice. If validation fails while still healthy, the call answers
   `{ok: false, code: 'watchdog-brief-required' | <validate code>}` and **no session is started**.
3. Then `session.start` as today. A failed start answers as today, and nothing is attached.
4. Then `attach(sessionId, arg)`, which creates the brief, its watch and the supervised entry
   (`supervision.set(id, 'active')`, so the session is sendable as soon as the call returns). On
   success the result also carries `{watchdog: {briefId}}`.
5. If `attach` fails or times out (`SESSION_STARTS.attachTimeoutMs` = the bridge's 30 s request
   timeout), classify it as watchdog failure and perform §2.4's hand-over, including this newly
   created session. Never call `session.stop` because assignment failed. Return the successful
   connector start result with `watchdog: {assigned: false, code: 'watchdog-assign-failed',
   supervisor: 'fishball'}` instead of `{briefId}`; the `sessionId` proves it already exists, so
   Fishball must not retry the start. Validation errors before creation still create nothing.
   An owner lost during start uses this same successful-start/fallback result. A late attach
   completion from the failed ownership generation cannot set active or re-claim the session.
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

**Effective state (U20).** Configuration and availability are distinct. The watchdog is
**effective on** only when enabled in `dsh.profile.bundles` AND its current X14 owner has declared
ready after model resolution, readable/writable stores and registration of its routing/start
hooks. Disabled, absent, starting/not registered, crashed or failed means **effective off**.
No separate `gateOn` file and no automatic edit of the user's plugin enable setting. A registration
alone is not readiness; the instance owns the health latch and ownership generation.

**Detection, not approval deadlines.** X0-S detects missing/failed bundle placement, owner disposal
or loss immediately (`plugin-gone`), and start-attach rejection/30 s timeout
(`watchdog-assign-failed`). WD-9 reports `model-unavailable` on resolution/open failure,
`store-unavailable` on failed read/write, or `failing` after the existing guard thresholds:
3 consecutive failed checks/decisions (preempted checks do not count), or 900 s without a successful
check while a watched session is running. These are health/check thresholds, not card wait timers;
a single failed decision still escalates its own card immediately under Q-P. Once a health fault
is detected it disables the **whole watchdog plugin's effective authority**, not merely one
brief. No 30 s plugin-gone grace retains claims or blocks sends. An unending model call with no
reported failure is not itself a new failure detector; Q-P's no-approval-timer rule stands.

X14's registration handle adds `ready()` and `fail(cause)` (synchronous, generation-scoped);
`ready()` is permitted only after the checks above and successful dormant-state persistence.
`fail` or owner loss atomically clears effective readiness before any subsequent route/gate
check; repeat reports for the same failure episode are idempotent. `endingReason()` remains
`'hand-over'` for explicit disable and `'failure'` for faults; **both use the same hand-over**:

1. Invalidate the old ownership generation, cancel its side-agent work, release X15/X9 claims,
   and disable its X2 tools/sections and X16 start schema. The instance does this even if plugin
   cleanup never runs. A stale callback cannot answer a card, set active, or re-claim. Re-route
   still-open watchdog-held permission cards and held inbox items to Fishball once; settled cards
   stay settled, and an item already queued to Fishball is not queued again.
2. Keep briefs, criteria and ordinary history. Move supervised entries to
   `handedOver: [{sessionId, briefId, state, at}]`, clear the supervised set and leave existing
   finished watches delivering to Fishball. Never stop a managed session because of watchdog
   failure, and never mark its brief `halted`. An already stopped session is not automatically
   resumed. Legacy halted briefs are retained as hand-over records, not re-stopped.
3. X19 passes sends exactly as when disabled; new starts take no watchdog argument. Fishball is
   now the direct supervisor, permission recipient and question/plan-review recipient; grants are
   no longer blocked by a watchdog claim. R17 now means **execution has an owner: watchdog or
   Fishball**, not “watchdog failure must stop execution”. An intentional `watchdog_pause` while
   healthy still stops before marking paused; that user/manager action is not a plugin fault.
4. Send one waking `manager.notify` per transition (`watchdog-handover:<episodeId>`), rendered
   as an ordinary visible Fishball notice for the user. Include cause, affected session ids/titles
   and prior states, explicit “watchdog unavailable/off; Fishball now handles supervision and
   approvals; no session was stopped”, and retained-brief recovery instructions. A failure notice
   is emitted even for zero affected sessions; a disable with none needs none. Repeated faults do
   not spam. Record the recovery episode in the instance's supervision state for retry/dedupe.
   If that store fails, open the gate and route to Fishball **in memory first**, emit the visible
   fault via the available manager/log channel, and retry persistence/notification on recovery;
   do not wait for a broken store to permit hand-over or claim a durable notice that was not saved.

**Recovery (U6 extended, no automatic re-claim).** Re-registration after restart/reload or repair
must first verify model/stores/hooks. `fail()` retires the old X14 owner slot and its generation-owned
registrations; the still-loaded repaired row may call `register` again without a process restart,
reinstall X2/X9/X16 hooks under the new generation, then finish recovery before `ready()`. Old
`ready`/`set`/claim callbacks cannot mutate the new generation; old `dispose` is a no-op against it.
Keep effective off until success. Persist every retained
brief as `dormant`, with the same id, before `ready()` turns the gate on. No check timer or approval
claim starts for dormant briefs. Send one recovery notice listing them and telling Fishball/user
that sends now require `watchdog_resume` or a new `watchdog_brief`; sessions continue under
Fishball until explicitly resumed. Even a quick reload has no grace-period auto-reclaim. Resume
runs its existing readiness/watch/check steps and then sets active + claims permission cards;
new brief creation supersedes a dormant brief. Sessions created during failure have no brief and
need one once healthy. Questions/plan reviews still stay with Fishball after recovery (§2.7).
If persistence cannot be restored, stay effective off; never discard a damaged store to invent
an active brief. On child boot, retained supervision is treated as handed over/dormant until
readiness and explicit resume, not silently restored active.

**Whole instance unavailable.** A dead/detached child cannot execute Fishball hand-over or send a
notice. Existing connector unavailable-instance/user routing applies until reconnect; no automatic
approval or session stop is added. Reconnect performs the recovery above and reports any interval
of unavailable supervision. This operational boundary is not an exception allowing a live but
failed watchdog to retain authority.

### 2.5 Every managed session needs an active brief (U5, X19)

**When the gate is on (U7 narrowed by U20).** Read the configured enable state through
`boot.readProfileManifest`, but activate X19 only while the watchdog is **enabled and healthy**
(§2.4's instance-owned readiness latch). There is no `gateOn` file.
- **Enabled and ready:** the table below; Q-A=B applies only here.
- **Enabled but failed/not registered/not ready:** effective off; sends pass and Fishball owns
  supervision. Neither `watchdog-unavailable` nor `store-unavailable` blocks an ordinary send.
- **Not enabled:** effective off, as in v1 (U3).

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
| off (enabled but failed/not ready) | any retained | allowed; Fishball owns supervision |
| on (enabled and healthy) | `active` | allowed |
| on | `paused` | refused `supervision-paused` (intentional pause, watchdog §4.5.2) |
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
- `approvals.claim(S, …)` is accepted only while X14 is healthy and holds *S* as `active` or `paused`;
  otherwise it is refused `not-supervised`.
- The instance itself releases the claim when X14 moves *S* to `dormant` or clears it.
- A disposed plugin loses all its claims with it.

| X14 state of *S* | Claimed ("a watchdog exists", for routing) | A card of *S* goes to | Sends to *S* (X19) |
| --- | --- | --- | --- |
| none / ended | no | Fishball | `watchdog-brief-required` if the gate is on, else allowed |
| `active` | **yes** | the watchdog (watchdog §6.2) | allowed |
| `paused` | **yes** | the watchdog: a card means the session ran, so R1b auto-resumes first | `supervision-paused` |
| `dormant`, healthy owner | **no** | Fishball (U6) | `watchdog-brief-required` |
| any, plugin failed/not registered/not ready | no (hand-over) | Fishball | allowed (gate off) |
| any, plugin turned off | no (hand-over) | Fishball | allowed (gate off) |

*Paused stays claimed only while healthy* (K-3 narrowed by U20). A deliberate pause still owns
its brief; a permission card caused by renewed execution invokes the existing auto-resume path.
If readiness fails, hand over to Fishball instead of halting/re-stopping. `halted` is no longer a
live X14 state: migrate old halted records through hand-over to dormant on recovery. All routing
rows above refer to **permission cards only**; questions and plan reviews bypass claims (§2.7).

*The 1:1 relation.* There is one brief per session (watchdog §2.2, `brief-exists`) and one side
session per brief, so one claim per session is the same relation seen from the approvals side.

X15 also binds each `onCard`/answer callback and `release` closure to its **claim incarnation**, not
only the plugin generation and session id. Detach → re-claim within one healthy generation cannot
revive an old decision or let an old release remove the replacement claim. Stale answers fail
`not-supervised`; a stale release is a no-op. This is internal handle identity, not a new wire field.

### 2.7 Questions and plan reviews belong to Fishball (U21)

X15 claims only `kind: approval` **permission requests**. Questions and plan reviews always
route directly to Fishball, even for active/paused briefs; they are never offered to watchdog
`onCard`, its decision queue, X9 claim, or side-agent context. A watchdog `ask` decision on a
permission request remains a connector clarification of that approval, not authority to handle
independent question/plan-review cards. Fishball answers with the existing question/prompt ports
or escalates to the user under U14/Q-P, without any deadline.

**Direction update: reuse `watchdog_refine`, not a new parallel tool.** While answering, Fishball
may separately call the manager-only tool with `{brief_id, expected_revision, reason, <fields>}`
to replace `goal`, `progress_signs`, `drift_signs`, `done_when`, `ignore` or `notes` using the
existing brief bounds. `reason` is 1–500 characters; result is `{ok:true, briefId, revision}`.
The update persists a new revision and replaces that brief's side-session instruction section
before its next turn. It does not send work to the managed session, change permission criteria,
auto-approve, or claim the question/plan review. WD-11 owns the tool and answer-path guide; WD-3
owns optimistic persistence, WD-4/WD-6 the section refresh/revised trigger, and WD-12 the tests.

Answer and refinement are two independent operations: an update failure never withholds, undoes,
or repeats an answer. Use `watchdog_view` to obtain the current revision; on `stale-revision`,
re-read and explicitly reconcile rather than overwrite. Keep existing `unknown-brief`,
`brief-ended`, `invalid-brief:<field>` and `reason-required` refusals. A failed/off watchdog has no
refine tool/authority: Fishball keeps direction in its ordinary conversation and can refine after
recovery. Refining a dormant/paused brief stores direction without a check, resume or claim; only
an active brief gets the existing `revised` trigger. A running turn may finish on its captured
revision; the next turn must use the new one, with no extra watchdog conversation or automatic
history delivery to Fishball. This reuses the source design's revision/section mechanism.

## 3. Timer-free contract 2.0 scope (K1 + K2, U22)

The complete version/delta/package/task baseline is [connector contract 2.0](../connector-contract-2.0.md).
The later [selected one-way MCP control direction](<connector-mcp-option.md>) parks custom-2.0
implementation pending MCP feasibility/schema freeze. No callback MCP server is required; optional
first-party custom pushback and external capability degradation are explicit. Preserve the baseline
below as requirements/history; §8 of the MCP design supersedes transport-dependent K1/K2 sequencing.

U14 removes timer semantics, so the release is **breaking**, not the previously proposed additive
1.2. Keep the existing contract id, set `CONNECTOR_CONTRACT.major = 2`, `minor = 0`; the wire
envelope's independently versioned `version: 2` is unchanged. The two attention additions remain:

| Item | Shape |
| --- | --- |
| Operation `instance.attention` (instance → connector), capability `instance.attention` | `{unread, importantUnread, latestAt}` → `{accepted: true}`; integers with `0 ≤ importantUnread ≤ unread ≤ LIMITS.unreadMax` (9999); `latestAt` an epoch-ms integer or `null`. An invalid frame fails validation as contract §3.1 says, and the last valid value stays |
| Connector view `state.unread = {count, important}` | `count = unread`, `important = importantUnread > 0`; `{0, false}` when no value, on detach and on transport close. This fixes today's bug: `client.js:740` reads `state.unread?.count`, but `index.js:137-232` has no `unread` view, so the count is always 0 |

- `LIMITS.unreadMax` goes in `limits.js`. `instance.attention` stays optional: never list it in
  `requiredCapabilities`, send only when welcome advertises it. Without it the count is zero;
  this optional UI capability does **not** negotiate away timer-free approvals.
- K1 owns attach negotiation/descriptors and rejection fixtures; K2 owns mandatory timer-free
  approval/question/plan-review semantics. Ship these together with the matching instance, never
  advertise 2.0 while retaining timer behavior. No legacy adapter, expiry exception or downgrade.
- `negotiateContract` validates id and major before attaching/routing any instance traffic.
  A 1.x declaration (including third-party 1.1), wrong id/major or malformed declaration fails
  with the existing attach error **`ContractError` / `contract-version`**; no instance attaches,
  no managed approval is delegated to it. Surface “incompatible contract: requires timer-free
  2.x; upgrade the instance/connector” to the caller/user. This is not an operation-level
  `unsupported-operation` or envelope-level `unsupported-version` error.
- Within 2.x retain the existing lower-minor negotiation and capability checks; missing required
  operation capabilities fail `unsupported-capability` at handshake. Timer-free behavior is
  mandatory for every 2.x peer, including third-party peers. A peer falsely declaring 2.x is
  nonconformant, not a supported legacy case. Contract conformance tests cover no timers.
- **Not in 2.0:** watchdog F1 (`session.supervise`) or F2 (user-answer operation). The watchdog
  hand-over/start rules stay child-side.

| Instance | Connector | Result |
| --- | --- | --- |
| 2.0 | 2.0 | attaches; timer-free cards; attention if advertised |
| 1.1 (or any 1.x third-party instance) | 2.0 | attach refused `contract-version`; never delegated cards |
| 2.0 | 1.1 (or any 1.x connector) | attach refused `contract-version`; no downgrade |
| 2.x without optional attention | 2.x | attaches if required operation capabilities match; timer-free cards, zero brand count |

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
| **K1** contract 2.0 negotiation + connector `unread` | `packages/connector/contract/{contract,limits}.js`, `docs/connector-contract.md`, `packages/connector/src/slim/host/bridge.js`, `src/connector-service.js`, `index.js` | —; release together with K2 | §3 table holds: same contract id, major 2/minor 0, envelope v2 unchanged; every 1.x peer (including third-party 1.1) is rejected at attach with `ContractError` / `contract-version`, no downgrade or traffic/card delegation; 2.x minor/capability negotiation remains; attention is optional, timer-free behavior mandatory; `state.unread` follows the last valid value, `{0,false}` on detach and close |
| **X0-C** core: service, manager, chat | new `child/extensions.js`; `child/app.js` (provide); `child/chat.js` (X1, X2 chain in `configure`/`composePersona` + live apply, X10, X11, `deliverInbox` array form and the X19 prefix call); `child/bridge.js` (**only** the one X19 `gate.send` call in the request path, a pass-through stub) | — (SP-X1 done) | `fishballInstance` v1 provided; X1, X2, X10, X11 behave as §1 and §12.5 (durable dedupe, the array form); X3 has **no** member in X0-C (U15); every other member a stub that refuses `not-implemented` as §12.5 specifies; the X19 call sites exist and pass everything while the watchdog is effectively off; X10 retries pending hand-over notifications after reservation/queue failure using one stable message identity, without losing or duplicating delivery (§12.5); existing no-plugin behavior holds except the approved lifecycle/contract changes |
| **X0-I** inbox pipeline | `child/inbox.js`, new `child/ext/inbox.js`, `src/slim/inbox-markers.js` | X0-C | X9: claims before the batcher, release re-enters, ack/refuse per item; U14: held cards never expire by time, and are dropped only on settlement/closure; U20: whole-plugin hand-over releases held items to Fishball once, invalidating stale callbacks; U21: questions/plan reviews bypass watchdog claims and always reach Fishball |
| ~~X0-U~~ | **withdrawn (U10)**; replaced by SP-PG, CHILD-WEB, EMB, PG-1, PANELS (§5.4) | — | — |
| **X0-W** wire: scoped bridge + attention | `child/bridge.js`, new `child/ext/{bridge-scope,attention}.js` | X0-C, K1 | X12 local `forbidden`; X8 sent on set, on each handshake, zero on dispose, skipped without the capability |
| **X0-G** side agents | new `child/ext/side-agents.js` | X0-C | X13 lock-down on both versions; U14/Q-P: omitted decision `timeoutMs` installs no timer, while explicit check timeouts still work |
| **X0-A** approvals seam (server) | `child/approvals.js`, `child/decisions.js` (the UI files move to PANELS) | X0-C | X15 per-session claim and routing (server half only; the tag and the escalation card move to PANELS) (§2.6); a claim is refused `not-supervised` unless the current X14 owner is ready and holds the session active or paused; dormant, clear or whole-plugin failure releases it immediately, with generation checks and once-only rerouting of open permission cards; U21 questions/plan reviews always bypass claims and watchdog context (§2.7); `delegate-no-grant`, `grant-off-supervised`; U14/Q-P: a Fishball decision turn ending without a decision escalates at once, with no timer; final U17/Q-Q: track reached layers, return the requesting tool result, record/notify once only at reached layers, wake Fishball once for a user decision and never for a watchdog-only decision; immediately clear instance cards, remove closed/retired and attribution-label retention, and retain only searchable transcript entries subject to normal compaction (§12.4); K2/PANELS own the corresponding connector/UI clear |
| **X0-S** supervision, start rule, send gate | `child/session-tools.js`, new `child/ext/{supervision,session-starts,send-gate}.js` | X0-C, X0-A (the claim port) | X14 owns synchronous generation-scoped `ready()` / `fail(cause)`, readiness and managed changes; disable or any detected fault immediately hands the whole supervised set to Fishball, releases claims/hooks and passes sends, with one durable/retryable notice and no stop/halt or plugin-gone grace (§2.4); storage failure opens routing/gate in memory first; recovery verifies model/stores/hooks and persists retained briefs as dormant before readiness, never auto-reclaims; X16 schema and execution both require a healthy current-generation owner, rechecking validation/start races; failed/timed-out/lost-owner attach preserves the successful start with `watchdog.assigned:false` and Fishball ownership (§2.3); X19 uses enabled AND healthy plus §2.5's table/prefix on both send paths; stale generations cannot set active, claim or answer; no `gateOn` file |
| **X0-B** bundling + admin | `packages/instance/package.json`, `src/native-runtime/{constants,installation,files,index}.js`, `child/admin.js` | X0-S (the hand-over port, stubbed until merged); SP-FN1 done | X17, X18 for the three names (the "Built in" tag is gone with the custom settings view, §11.7; Q-K); placement inside `initializeProfile` before `loadProfileDirectory` (U9); a failed placement of one name leaves the others; failed watchdog placement invokes effective-off hand-over immediately without changing configured enablement or stopping sessions (U20) |

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
| WD-1 … WD-10 | same, with U14/Q-P edits: WD-1 loses approval-time settings and the window-sum check; WD-8 keeps check timeouts only and WD-10 has no R4, escalating immediately on any decision-turn end without a decision; U17/Q-Q: WD-4 excludes decision records from its audit/rotation (operational audit remains); WD-8's rollover digest does not retain compacted decision entries; WD-9/WD-10 replace decision-audit/manager-label copies with reached-layer transcript records (§12.4); U20: WD-9 reports model/store failure or the retained 3-failure/900 s health thresholds through X14 `fail(cause)`, not stop/halt; remove plugin-gone grace-stop logic; U21: WD-3 persists optimistic refine revisions, WD-4 refreshes the brief section, WD-6 triggers `revised` only for active briefs, WD-10 never queues questions/plan reviews (§2.7) | `packages/watchdog/…` as watchdog §14 | WD-0 → the X0 task that owns the point (WD-8: X0-G; WD-10: X0-I, X0-A) |
| WD-11 manager tools | WD-11; Q-T = modified B: keep `watchdog_decisions {offset?, limit?, session_id?}`; done when §12.8's count-range defaults/bounds, newest-first order, result fields, refusals and EP/BVA cases hold, including watchdog-only and compacted history; explicit pull only, no automatic delivery or separate audit store; U21: reuse `watchdog_refine {brief_id, expected_revision, reason, <fields>}` and its answer-path guide (§2.7), with revision/refusal/bounds handling; answering questions/plan reviews is independent of optional refinement, stale revisions require explicit reconciliation, dormant/paused refinements do not check/resume/claim | `src/manager-tools.js` | registers through **X2** (not wE3/wE4); X0-C, WD-2, WD-3, WD-6, WD-9, WD-13; reads WD-8/WD-10's ordinary decision transcripts |
| WD-13 coupling | WD-13; U20 replaces Q13 halt coupling with continuous Fishball/watchdog ownership | `src/coupling.js` | X0-S; both `endingReason()` values use §2.4 hand-over with no stop/halt; readiness checks and durable `handedOver` → `dormant` recovery precede `ready()`, with one recovery notice; only explicit `watchdog_resume` or new `watchdog_brief` restores active/claims; old halted records migrate via hand-over, no automatic re-stop |
| **WD-14** start-time assignment (new) | U20: attach failure/timeout/lost generation hands over rather than stopping or retrying a successful start | new `src/start-assign.js` | X0-S (X16), WD-2, WD-6, WD-13; late completions cannot restore authority |
| WD-12 integration | WD-12; adds U20 whole-plugin failure/recovery and U21 routing/refine coverage (§6) | `index.js` wiring, e2e | all WD, X0-B |
| B1 … B4 | same, with U19 edits: B1 the visibility window; B3 the archive and visibility (§12.6); B4 the `clear` item | `packages/board/…` as board §14, plus `src/archive.js` | X0-C (X1, X2) |
| B5 board context + panel | B5 | `src/{inject,routes}.js` and `packages/board/client/` (`dsh.client`: a `rightbar` panel entry); U19 acceptance: one visibility projection for panel/context, Done **and Dropped** through 30 days inclusive, early clear removes either, reopen restores it; existing context budgets remain; `doneWindowHours` is only a recent-done count, never the panel cutoff | B4, PG-1 |
| **B10** archive export before uninstall | new, Q-S = A | `uninstall.js` and its existing removal entry point; complete archive export, not just `board.json`; export offered before removal, accepted export completes outside runtime, failure preserves runtime, decline permits deletion (§12.6) | B3, X0-B |
| **B11** archive search | new, Q-R = B | `packages/board/src/search.js`, tool registration and guide; `board_search {query, status?, limit?}` and the exact result/refusal/limit contract of §12.7; finds a keyword in a card older than 30 days, including cleared cards, without changing visibility | B3, B4, X0-C |
| B6 meow-memory recommended | B6 | `src/recommended.js` (the `noteKey` and the meow entry), DESIGN.md; the tab itself is RP | — (RP reads it) |
| B7 meow in the child | B7 | test rig only | B6 |
| B8 board e2e | B8 | `test/e2e/board.*`; includes visibility/clear/reopen, old-card search, and export-before-uninstall | B1–B5, B10, B11, X0-B |
| — | B9 | absorbed into X0-B (all three names) | — |
| **X-E2E** three bundled together | new | `test/e2e/bundled.*` | X0-*, FN-7, WD-12, B8 |
| FN-7 docs | FN-7 | README, contract cross-check | all FN |

### 5.4 A-lite page tasks (U10–U12, §11)

| Task | Owns | Depends | Done when |
| --- | --- | --- | --- |
| **SP-PG** pre-start spike (W1 prerequisite) | `spikes/instance-ext/page/*`, `docs/spikes/instance-ext-page.md` | — | yes or no on both versions for: (1) DSH's shell through the connector's embed path: `__DSH_BOOT__`, `<base href="./">`, combos, `api/remote.mux`, the token-to-cookie exchange, and the CSP the broker sets (today `frame-ancestors 'self'; default-src 'self'…` at `host/embed.js:75`; DSH's index injects inline `<script>` rows, `dsh-host-webserver/lib/index.js:69-97`, so the broker's CSP must change); (2) a `dsh.client` overlay row from the snapshot is served (`resolveMeta`); (3) Q-F rail options; (4) the navigation guard bounces `openSession` and `selectPanel`; (5) where the child's shortcut document lives and that `null` unbinds `session.new` and `session.search`; (6) any pre-create hook for sessions (Q-G); (7) the Settings sandbox field under the read-only overlay; (8) a third-party `plugins.tab` entry gets the install face (§11.9); (9) the Remove button can be targeted per plugin without hashed classes (§11.10) |
| **CHILD-WEB** child profile and overlay | `src/native-runtime/{constants,overlay,installation}.js` (add `dsh-web-app` back, keep the existing migration's backup rule), the overlay rows of §11.3/§11.6, the read-only `permission` presets and `defaultPreset`, `sandbox-policy` read-only, the Q-J approval rule, `tool-subagent` per Q-I, the Fetch route `api/fishball/session` | SP-PG | the child boots DSH's web on both versions; every enabled `dsh.client` row is served; the disabled rows are absent; `/permission` refuses everything but `read-only`; a user setting cannot raise the sandbox |
| **EMB** connector embed of the shell | `packages/instance/src/slim/host/embed.js` (prefix forwarding of `/`, `/plugins/*`, `/assets/*`, `/api/*` and the `api/remote.mux` upgrade; CSP from SP-PG(1)), `packages/connector/client.js` (the iframe unchanged except `allow` if SP-PG needs it) | SP-PG, CHILD-WEB | the Fishball view in the main DSH shows the child's shell with no token in any URL, as SP1 did; the main DSH's own pages are unaffected |
| **PG-1** `fishball-page` plugin | new `packages/instance/child-web/fishball-page/{package.json,client.js,removals.js,guard.js,shortcuts.js,messenger.js,record-definition.js,style.css,i18n.js}` | SP-PG, CHILD-WEB | U15: shared `recordDefinition(packageName, suffix, render)` used by Fishball client plugins; foreign-prefix registration throws, own-prefix records render (§12.2); §11.3 table holds; Remove is hidden for the bundled plugins (§11.10); the page opens on Fishball's session; §11.4 paths cannot leave it; DSH Settings and Plugins pages open and come back; grey bubbles and avatars as eaa33f5; composer plugins (a fixture plus voice input when installed) work |
| **K2** connector: mandatory timer-free 2.0 (U14/U22), immediate card clearing (U17 final) | `packages/connector/src/{approvals,questions,config,pile,card-lifecycle}.js`, `contract/contract.js` (remove approval/question/plan-review `expiresAt` descriptors), `slim/host/approvals.js`, `docs/connector-contract.md`, `DESIGN.md` item 11 | K1; coordinated 2.0 release | no approval, question or plan-review request moves on a timer; no deadline or expiry filtering, including for third-party 2.x peers; a 2.x descriptor carrying `expiresAt` fails `invalid-envelope`; explicit escalation advances immediately; no legacy expiry exception or downgrade, and K1 rejects every 1.x peer at attach; final U17 settlement returns the tool result and clears pile/session cards immediately without retained decision labels; reached-layer transcript results survive (§12.4) |
| **SET** slimmed Fishball settings page (§11.8) | `child-web/fishball-page/panels/settings.js`, its Fetch routes (status, restart, provider sync) | PG-1 | only the "stays" rows of §11.8 are on it; the links open DSH Settings and Plugins and come back; the moved items are not duplicated |
| **RP** `fishball-recommend-plugins` (§11.9) | new `packages/recommend-plugins/{package.json,index.js,client.js,i18n.js}`; `RUNTIME.bundledPlugins` entry in `src/native-runtime/constants.js` | SP-PG (8), CHILD-WEB, X0-B | the child's Plugins page shows the "Fishball 推荐" / "Fishball Recommended" tab next to Installed, Marketplace and Discover; it lists the recommended plugins with meow-memory's note; Install installs into the child profile; an installed one shows "Installed"; the main DSH's Plugins page has no such tab |
| **PANELS** our panels as DSH entries | `child-web/fishball-page/panels/{approvals,reminders}.js`, transcript attribution and the open escalation card as chat-node definitions; their Fetch routes in `src/slim/child/` | PG-1, X0-A, K2 | approvals and reminders work as `main` panels; open escalations render in Fishball's chat; U14: no approval countdown; final U17/Q-Q: settlement immediately removes all card UI (including the user's result card), repeated callbacks/reload never restore it, and eligible ordinary transcript results remain searchable with attribution; no watchdog-only decision appears in Fishball automatically; a Q-T explicit pull renders as an ordinary tool result, not an approval card or unsolicited notice (§12.8); user settlement wakes Fishball once, other settlements create no duplicate wake/entry; compaction drops context entries without deleting transcripts (§12.4) |
| **RETIRE** remove the custom page | delete `src/slim/ui/{shell.*,chat.js,composer.js,approvals.js,records.js,reminders.js,settings.js}` and their server routes once nothing uses them; keep `dsh-tokens.css` only if a panel still needs it | PANELS, SET, RP, FN-4, B5 | no route serves the old page; the instance tests for the old page are retired with it |

### 5.3 Waves

| Wave | In parallel |
| --- | --- |
| W0 (start now) | K1, X0-C (X3 reduced, see §5.5), FN-1, WD-1, B1 |
| W1 | **SP-PG first**; K2 (after K1); X0-I, X0-G, X0-A (server), X0-S, X0-W (needs K1), FN-A (needs K1); WD-2, WD-3, WD-4, WD-5, WD-7; B2, B3 |
| W2 | CHILD-WEB, then EMB and PG-1 (all after SP-PG); X0-B (after X0-S); FN-2, FN-6; WD-6, WD-8, WD-9; B4 |
| W3 | PANELS (after PG-1, X0-A, K2), SET (after PG-1), RP (after X0-B); FN-3, FN-4 (after PG-1); B5 (after PG-1), B10 (after B3, X0-B), B11 (after B3, B4); B6 (W1 is fine: data only); WD-10, WD-11, WD-13 |
| W4 | FN-5; WD-14; B7 (after RP); RETIRE (after PANELS, SET, RP, FN-4, B5) |
| W5 | FN-7, WD-12, B8, then X-E2E |

### 5.5 What changed for W0 and X0 (U10–U22, Q-P–Q-T)

- **K1/K2 changed (U22):** breaking contract 2.0 replaces additive 1.2; keep contract id and
  envelope v2, reject all 1.x peers at attach (`ContractError` / `contract-version`), and ship
  negotiation plus mandatory timer-free semantics together. Remove `expiresAt` descriptors;
  2.x cards carrying the field fail `invalid-envelope`. No downgrade/legacy expiry tests survive.
  X0-W/FN-A consume the new contract fixtures while retaining optional attention behavior.
- **X0-S/WD-9/WD-13/WD-14 changed (U20):** enabled is not readiness. X14 adds synchronous,
  generation-scoped `ready()` / `fail(cause)`; every detected fault, failed placement, missing
  owner or failed attach means whole-plugin effective off, immediate Fishball hand-over, released
  claims and a passing X19 gate. Remove plugin-gone grace stops and Q13 fault halts; keep 3 failed
  checks/decisions and 900 s health thresholds, not approval deadlines. Recover model/stores/hooks,
  persist dormant briefs, then declare ready; no automatic re-claim, checks or resume.
- **X0-A/X0-I/WD-10 changed (U21):** questions/plan reviews always reach Fishball and never the
  watchdog queue/context or claims. Permission claims remain per-session while enabled and healthy.
- **WD-1 changed (U14):** remove approval-time settings and window-sum validation; check timers
  remain. WD-8/WD-10 and X0-A implement Q-P's immediate escalation on decision-turn completion
  without an answer. X0-G/X13 must allow an omitted decision timeout, not apply a default one.
- **B1 changed (U19):** use the 30-day board visibility window instead of deletion/prune age;
  `doneWindowHours` is not a panel cutoff. B11 adds the search bounds of §12.7.
- **X0-I changed (U14):** remove expiry-based held-card drops; settlement/closure drops remain.
- **X0-C changed.** X3 is gone from X0-C entirely (U10, U15): remove every X3 case, including
  the foreign-prefix refusal and the `recordTextChars` BVA; the rule moves to §12.2's owner. The
  coverage gaps are closed by tests (U18), with the behaviour §12.5 specifies.
- **X0-U withdrawn.** Its test file `x0-u.test.mjs` is retired. Its server-side cases (module
  serving, `api/ext/*` routes, the `ext` signal, the CSP) have no successor; the page cases move to
  PG-1's browser tests.
- **X0-A changed (U14/U17, Q-P/Q-Q):** add no-decision completion escalation, reached-layer
  settlement records/notes, immediate card cleanup and removal of label retention. Replace the
  old-label loading cases with §12.4's transcript/compaction cases. UI acceptance moves to PANELS,
  including countdown removal, immediate clearing and no automatic watchdog-only records in Fishball.
- **WD-11 changed (Q-T = modified B):** keep `watchdog_decisions`; count-range reads include
  watchdog-only outcomes from ordinary watchdog transcripts, even after compaction. §12.8 owns
  defaults, maximum page size, ordering, result shape and invalid-range cases. Explicit tool results
  use normal turn context/history; they do not change settlement routing, wake Fishball, recreate
  cards or establish a separate decision store. PANELS uses ordinary tool-result rendering.
- **WD-11/WD-3/WD-4/WD-6/WD-12 changed (U21):** WD-11 reuses `watchdog_refine` and guides
  optional direction updates separately from Fishball's question/plan-review answer; WD-3 owns
  expected-revision persistence; WD-4/WD-6 own next-turn section refresh and active-only `revised`
  trigger; WD-12 covers refusal/race/state cases. Failed refinement never holds or repeats the
  answer; dormant/paused refinement neither checks, resumes nor claims. No parallel update tool.
- **K2/PANELS:** their U17 scope is final, not conditional on draft approval; K2 clears connector
  cards, X0-A clears instance cards, PANELS removes UI cards without erasing transcript results.
- **B5/B10/B11:** B5 shares the 30-day Done/Dropped visibility projection between panel/context
  with early clear/reopen; B10 exports before uninstall; B11 searches the permanent-while-installed
  archive. B8 covers all three. No Q-P–Q-T decision remains open.
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
| K1, K2 | `contract/contract.js`, `docs/connector-contract.md` | K1 negotiation/descriptors first, K2 timer removal rebases; release together as 2.0 |
| FN-4, FN-5 | `packages/fold-notify/client/*.css` | FN-4 first |
| CHILD-WEB, X0-B | `src/native-runtime/{constants,installation}.js` | X0-B first (placement), CHILD-WEB rebases |
| CHILD-WEB, EMB | none (child vs host), but EMB tests need CHILD-WEB | CHILD-WEB first |
| PG-1, PANELS, SET | `child-web/fishball-page/` | PG-1 first; PANELS and SET add files only |
| X0-B, RP | `src/native-runtime/constants.js` (`bundledPlugins`) | X0-B first; RP appends one entry |
| WD-11, WD-13 | the coupling interface | shared stub, as watchdog §14 |

## 6. Test-design outline per task (black-box, for the tester)

Each line names the technique: **EP** equivalence partitions, **BVA** boundary values, **DT**
decision table, **ST** state transitions.

- **SP.** Only the spike's yes/no questions; no TDD.
- **K1.**
  - EP: instance 2.0 / another 2.x minor / every 1.x (including third-party 1.1) × connector
    2.0 / 1.x; wrong contract id, malformed declaration, missing required capability, optional
    attention absent; a valid attention frame, malformed frame and unknown extra field.
  - DT: incompatible id/major/declaration fails attach `ContractError` / `contract-version`,
    before traffic or approval delegation, with an upgrade message and no downgrade; a missing
    required operation fails `unsupported-capability`; 2.x lower-minor negotiation remains.
    Contract major 2 does not change envelope `version: 2` or create `unsupported-version` here.
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
  - *(X3 has no case here: U15, §12.2.)*
  - §12.5 cases: notify dedupe survives a child restart (same key after restart → `duplicate`);
    every stub member refuses `not-implemented` as §12.5 specifies (sync throws, async rejects);
    with the watchdog disabled both `message_session` and `redirect_session` reach the connector,
    plus the distinct `fishballImages.message` path with exact request/result assertions (§12.5.1);
    `deliverInbox([a, b, c])` queues one followup with the three texts in order and one `{messageId}`
    receipt; §12.5.2 supplies the callable item shape, async error assertions and count/byte BVA.
  - X10 ST: reserve hand-over notification → queue failure/restart → retry pending with the same
    message identity → delivered once; a pending reservation is not a successfully delivered
    duplicate, and a delivered/queued identity is never requeued (§12.5).
  - X10 DT: `wake` × duplicate `dedupeKey` × agent busy or idle. X11 BVA: `limit` 0, 1, max, max+1;
    `maxChars` cut at a surrogate pair.
- **X0-I.**
  - EP: item kinds `session`, `watch`, `approval` marker, `system`, `plugin`, `user`, a card
    record.
  - DT: claimed × batcher present × `user` kind → claimant, batch or direct.
  - ST: claim held → release `deliver:true` (re-enters the batcher) / `deliver:false` / card
    settles or closes (dropped). No time-based drop (U14).
  - U20 ST: held item → whole-plugin failure → Fishball queued once, including settlement/release
    races and a stale-generation callback; settled/already queued items never reappear.
  - U21 DT: permission/watch notice or independent question/plan review × claimed/unclaimed ×
    active/paused/dormant × ready/failed → questions/plan reviews always bypass watchdog claims.
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
  - **DT routing (§2.6/§2.7):** X14 state of S (none, active, paused, dormant) × plugin
    (enabled and ready, registered but not ready, failed/unregistered, disabled) × request kind
    (permission, question, plan review). Only permission cards with a valid current-generation
    claim go to watchdog `onCard`; questions/plan reviews always go directly to Fishball and never
    enter watchdog queue/context. Legacy halted entries migrate via hand-over, not live claims.
  - EP for `claim`:
    - S active or paused, current owner ready → accepted;
    - S none, dormant or ended → `not-supervised`;
    - a second claim on S → `owner-busy`;
    - failed/not-ready or stale-generation owner cannot claim or answer;
    - claims on two different sessions → both accepted, each permission card reaches only its
      own claimant, and independent questions/plan reviews still bypass both.
  - ST per session: unclaimed → (brief attaches, claim) claimed → (intentional pause) still
    claimed → (dormant, clear, release, take-back, plugin failure/disposal) unclaimed. After release,
    open permission cards and the next card reach Fishball once; settlement races do not resurrect
    closed cards. No plugin fault stops or halts the session.
  - `answerApproval` with `decidedBy` on a card of a session the caller has not claimed → refused.
  - U14/Q-P: every Fishball decision-turn end without a decision escalates immediately; no
    approval timer is installed; settlement racing completion never escalates a closed request.
  - Final U17/Q-Q: §12.4's reached-layer decision table, once-only notes/wakes and tool result;
    watchdog-only records never enter Fishball automatically; WD-11's explicit pull is separate
    (§12.8). Remove label-store loading/retention; compaction
    drops context entries, not searchable transcript entries.
  - ST: open → settled/closed → card cleared immediately; repeated callbacks and reload do not
    restore it. Coordinate connector/UI coverage with K2 and PANELS.
- **X0-S.**
  - DT for effective state: configured enabled/disabled × owner absent/registered-not-ready/ready/
    failed × supervised set empty/nonempty. Only enabled + ready gates sends. Every detected
    fault hands over the whole set immediately, not only the failed brief; no stop/halt, grace
    timer, retained claim or unavailable-send refusal. Explicit disable with no sessions needs no
    notice; faults notify even with zero sessions, once per episode.
  - ST: none → active ⇄ intentionally paused; any → (release/take-back) cleared; active/paused →
    (disable/fault) handed-over → (model/stores/hooks verified, dormant persisted, `ready()`)
    dormant → (explicit resume/new brief) active. Running sessions keep running, already stopped
    sessions are not auto-resumed. Old halted records migrate via hand-over to dormant.
  - DT failure causes: failed placement, owner loss/disposal, attach rejection/timeout, model
    resolution/open failure, store read/write failure and health-threshold failure → same
    whole-plugin hand-over with the cause in one visible notice. The profile enable setting stays.
  - ST for a broken supervision store: clear readiness/routing/gate in memory first → notify via
    available channel → persistence/notification retry; never fabricate durable success or active
    recovery. Failure repeated within an episode is idempotent; late old-generation `ready`,
    `set`, claim, answer and attach callbacks cannot regain authority.
  - The disable path does not matter: settings switch or direct `setBundleEnabled(name, false)`
    both hand over. Quick reload has the same dormant/explicit-resume recovery, no grace reclaim.
  - X16 DT: effective-ready current owner × argument absent/invalid/valid × validation/start
    ownership race × connector start success/failure × attach success/rejection/timeout/owner loss.
    Before creation, invalid arguments create nothing; after successful creation, attach failure
    returns the original session id with `watchdog: {assigned:false, code:'watchdog-assign-failed',
    supervisor:'fishball'}`, leaves it running/sendable and hands over all sessions, without stop
    or retrying start. A lost owner during start follows the same fallback.
  - X16 ST: schema and execution use readiness, not mere registration; registration-not-ready is
    off. Ready → failed removes the required parameter; recovery makes it required only at ready.
    Attach timeout boundary is 30 s; a later completion cannot set active or claim.
  - X16: successful current-generation attach makes the session claimed and sendable; a permission
    card before attach goes to Fishball. Failed attach leaves the session unclaimed and sendable.
  - **X19 DT: session origin × watchdog × brief → send result.** Origins: started while healthy;
    started while off/failed; handed over; made managed by `answer_prompt`; kept across recovery.
    Watchdog: disabled, enabled-ready, enabled-not-ready/unregistered/failed. Brief: none, active,
    paused, dormant. “On” below means enabled AND healthy. Expected results by §2.5:

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
    | any | on | paused | `supervision-paused` |
    | any | enabled, not registered / not ready / failed | any | allowed; Fishball owns supervision |
    | any | enabled, store corrupt/unavailable | any retained | allowed in memory; Fishball owns supervision |
  - X19 EP for **not gated** actions with the gate on and no brief: `read_session`,
    `answer_approval`, `answer_question`, `answer_prompt`, `release_session`, `stop_session`,
    `watch_session` → all allowed; and a refused send reaches **no** connector request.
  - X19 hand-over line: present on `user` and `session` items from a session without an active
    brief while the gate is on; absent with an active brief, with the gate off, and on `watch`,
    `system`, `approval` items; the item is still acked only after its turn is queued.
  - X19 ST per session: no brief → (`watchdog_brief`) active → (pause) paused → (resume) active;
    active → (disable/fault) handed-over/gate off → (verified recovery + dormant persistence)
    dormant/gate on → (`watchdog_resume`) active; dormant → (`watchdog_brief`) old superseded,
    new active. At each state, one send checks the gate; failed recovery stays gate off.
  - X19 BVA: a send immediately after current-owner `set(…, 'active')` → allowed; immediately
    after `set(…, 'paused')` → refused; immediately after `fail(cause)`/owner loss → allowed.
  - X19 EP for the gate source (U7/U20):
    - `fishball-watchdog` absent from `dsh.profile.bundles` → gate off;
    - present, registered and ready → the table;
    - present but not registered/not ready/failed → gate off, sends pass;
    - corrupt/unwritable supervision store → gate off in memory, Fishball routing, retry recovery.
  - Recovery-generation ST: fail retires the owner slot → a still-loaded row registers a fresh
    handle and reinstalls hooks → verifies/persists dormant state → ready; stale handle disposal
    cannot clear the replacement. Per-claim incarnation also changes on same-session re-claim:
    callbacks, answers and releases from the previous claim cannot affect its replacement.
  - Whole-child unavailable/reconnect follows existing connector unavailable-instance routing;
    no automatic approval/stop. Reconnect reports the supervision gap and requires dormant recovery.
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
  - uninstall offers full archive export first, then leaves no runtime data; an accepted export
    survives outside runtime, and export failure prevents deletion (B10).
- **Plugin tasks.** As each design's §15, with these test-design changes:
  - fold: the namespace is `fishball-fold-notify`; a second presenter or attention owner gets
    `owner-busy`.
  - board: the inject is `fishballInstance?`, and a missing service gives `instance-hooks-missing`.
  - watchdog (WD-12 integrates these U20/U21 cases):
    - DT disable/fault with zero/one/many briefs → effective off, whole-plugin hand-over, no halt;
      one failure notice even at zero, no repeated fault spam; recovery lists retained dormant briefs.
    - ST active/paused → handed-over → verified readiness/dormant → explicit resume → active;
      no check, claim or automatic session restart on recovery; intentional pause still stops first.
    - WD-9 BVA: 2/3/4 consecutive failures and just below/at/above 900 s since a successful check
      while running; preempted checks do not count, success resets health tracking; model/store
      failures report immediately. One failed decision escalates its card immediately, independent
      of health thresholds; no unreported long call becomes a new approval timeout.
    - `watchdog_brief` on dormant: old `superseded`, result `sendUnlocked:true`; on active/paused:
      `brief-exists`; legacy halted records recover through hand-over, never as live halt state.
    - U21 DT permission/question/plan-review × active/paused/dormant/no brief × healthy/failed:
      independent questions/plan reviews always reach Fishball, never watchdog context or checks.
    - WD-11/WD-3 refine EP: manager/non-manager; known/unknown/ended brief; current/stale revision;
      each supported field (`goal`, `progress_signs`, `drift_signs`, `done_when`, `ignore`, `notes`)
      and invalid bounds; reason length 0/1/500/501. Verify §2.7 refusal codes and persisted
      `{ok:true, briefId, revision}`; no permission-criteria update or managed-session send.
    - Refine ST: view revision → optional update → new persisted revision/section; stale revision
      requires re-read/reconcile, never blind overwrite. Answer success × update failure/success:
      refinement never withholds, undoes or repeats the question/plan-review answer.
    - WD-4/WD-6 DT active/paused/dormant × refine: only active gets `revised`; paused/dormant store
      direction without check/resume/claim. A running turn may finish on its captured revision;
      its next turn uses the new section, with no extra side conversation or history push.
      Failed/off watchdog has no refine authority; Fishball retains direction in normal history.
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
- **PANELS.** Approvals/reminders match the server API; open escalations render without a
  countdown. Resolution clears every card UI immediately, including after reload; only eligible
  reached-layer transcript results remain (§12.4), with no retained labels or automatically pushed
  watchdog-only Fishball record. Explicit Q-T pulls render as ordinary tool results, never as
  recreated approval cards (§12.8). A user result wakes Fishball once; other settlements add no duplicate wake.
  The recommended tab lists meow-memory with its note (B6).
- **PG-1 (U15).** Foreign-prefix record definitions throw at registration; own-prefix definitions
  render using the shared helper in each Fishball client plugin.
- **K2.** DT permission/question/plan-review × instance/third-party 2.x × watchdog/Fishball/user
  layer: no timers, deadline, expiry filtering or wait-based transition; decisions or explicit
  escalation advance immediately, user cards wait indefinitely. Descriptor `expiresAt` absent →
  valid, present (past/future/null) → `invalid-envelope`; no legacy exception. K1 rejects 1.x
  before delegation. Settlement clears cards and returns the tool result once (§12.1/§12.4).
- **B5/B10/B11.** Use §12.6/§12.7's shared board visibility, full export before uninstall and
  historical keyword search cases. These are required coverage, not unchanged source-design tests.
- **RETIRE.** No old page route answers; the instance's other routes still do.
- **WD-14.**
  - EP: arg valid / each `invalid-brief:<field>`.
  - DT: §2.3 steps 2–5.
  - ST: no brief → brief active at start, with the window case (a permission card before attach
    goes to Fishball; questions/plan reviews always do). Attach failure/timeout or owner loss after
    successful start returns the existing session with unassigned/Fishball metadata, no stop or
    duplicate start; a stale attach completion cannot restore claims.
- **X-E2E**, one per DSH version:
  - a fresh child has all four bundled plugins on (no Remove shown), the "Fishball 推荐" tab in its Plugins page, and the Fishball page opens directly on Fishball's session, with no sidebar or other sessions reachable;
  - Fishball starts a session (a brief is required) → the watchdog supervises it;
  - the user hands over a session → the notice carries the brief-required line; a reply is
    refused `watchdog-brief-required`; after `watchdog_brief` the reply is delivered;
  - the user turns the watchdog off → one hand-over notice, and the session keeps running;
  - the next `start_session` takes no `watchdog` argument, and sends need no brief;
  - the user turns it on again → verify readiness, persist dormant briefs, then one recovery
    notice; a send is refused until `watchdog_resume`, then allowed;
  - with multiple supervised sessions, one detected watchdog fault → whole-plugin effective off,
    one visible hand-over notice, all claims released, open permissions routed to Fishball once,
    sends/new starts pass with no watchdog argument, no session stopped; recovery stays dormant
    until explicit resume even after a quick reload;
  - an active/paused watched session asks a question or requests plan review → Fishball answers;
    an optional refine updates direction independently, no watchdog claim/check for the card;
    paused/dormant refinement remains paused/dormant;
  - a third-party 1.1 instance cannot attach (`contract-version`), while a conforming 2.x peer
    without attention attaches with timer-free cards and zero unread count;
  - an important notify gives the brand alert;
  - the board panel refreshes;
  - uninstall offers full archive export first, then leaves no runtime data; an accepted export
    survives outside runtime, and export failure prevents deletion (B10).

## 7. Compatibility boundaries and unchanged scope

- **Contract changes deliberately (U22).** K1/K2 ship timer-free 2.0 together (§3/§12.1): same
  contract id and envelope v2, all 1.x attach attempts rejected, no downgrade/legacy expiry
  exception. Remove approval/question/plan-review `expiresAt`; presence in 2.x is `invalid-envelope`.
  Attention remains optional; timer-free behavior does not.
- **Connector.** K1, FN-A and K2 remove wait timers and expiry filtering and immediately clear
  settled cards, retaining only reached-layer transcript results (U17, §12.4). Whole-child
  unavailability still uses existing connector unavailable-instance/user routing, not auto-approval
  or a watchdog-failure stop.
- **Watchdog (U20/U21).** Enabled AND healthy owns supervision; faults mean effective off and
  whole-plugin Fishball hand-over, not stop/halt. Recovery requires dormant persistence/readiness
  then explicit resume. Questions/plan reviews always belong to Fishball; optional `watchdog_refine`
  is independent of answering and never gives watchdog ownership of those cards.
- **Main DSH profile.** None of the child-bundled plugins is installed there by this design.
- **Without these plugins**, extension hooks preserve ordinary instance behavior except the
  explicit U14/U17/U22 lifecycle and contract changes. Explicitly disabled or unavailable watchdog
  means Fishball directly supervises; absence of readiness never blocks an ordinary send (U20).

## 8. Doc edits the three designs need (canonical names and U1–U22 behavior changes)

| Design | Edit |
| --- | --- |
| fold-notify | (U10) §5/§9 E3–E5 → the fold is a `dsh.client` conversation group/node plugin and `seen` is a Fetch route; §13 the package gains `client/`; service `fishballInstanceExtensions` → `fishballInstance`; fE1 `fishballChat.sessionId()` → `manager.sessionId()`; fE2 → X2 `manager.registerSetup(pluginId, fn)`; fE3/fE5 → DSH conversation record/group definitions using PG-1's U15 namespace helper (no X3 projector or X7 presenter API); fE4 → DSH client slots, Fetch routes and notifications (§11); fE6 → X8 + K1 under contract 2.0 (U22), with optional attention but no 1.x attach compatibility; update mixed-peer tests to §3 and keep envelope v2; fE7 → X9 `inbox.setBatcher`; fE8/9 → X17/X18; seen route `api/fold-notify/seen` and `api/ext/fold-notify/seen` → `api/ext/fishball-fold-notify/seen`; §14 FN-0, FN-E6, FN-K, FN-B point to X0-*/K1; inject list in §13 |
| board | (U19) §6 storage: `board.json` (on-board cards) + append-only `archive.jsonl`; "prune age" → board visibility window; §3.2 `board_write` gains `{id, clear: true}`; §3.2/§5 add `board_search` and its guide/contract (§12.7, B11), not a grep instruction; §9 `BOARD_LIMITS` replaces prune age with visibility and adds search bounds; §5/§9/§10 replace `doneWindowHours` as panel cutoff with the inclusive 30-day visibility window (keep it only for the recent-done count), show Dropped as well as Done, and share clear/reopen visibility between context and panel within existing budgets; §6/B-D6 uninstall offers full archive export first, then deletes runtime (Q-S = A, B10); “never delete” applies while installed; (U10) §10 the panel is a `dsh.client` `rightbar` panel entry with Fetch routes, not a page module; inject `fishballInstanceExtensions?` → `fishballInstance?`; §8 rows → X1, X2, DSH client slots/Fetch/notifications (§11), X17/X18; remove the withdrawn `ui.signal`/custom-page APIs; `engines.dsh` `>=0.2.1-rc.5`; §14 X0 → X0-C plus CHILD-WEB/PG-1 for native UI, B9 → X0-B, B0 done (S1 yes), add B10/B11 and update B5/B8; §5 guide text: "the newest board block is the current one" (S1 note) |
| watchdog (U1–U22 **are** design changes) | (U20) §4.5/§6/§9/§13–§15 and WD-9/WD-13/WD-14 replace Q13 fault stops, plugin-gone grace and live `halted` state with whole-plugin effective-off hand-over: X14 `ready()`/`fail(cause)`, generation-bound authority, X19 passes, X15/X9 release, one visible cause/session notice, no managed-session stop; keep 3-failure/900 s health detectors and intentional pause, distinguish them from forbidden approval timers; failed start attach returns the successful session with Fishball/unassigned metadata; verified model/stores/hooks and persisted dormant briefs precede readiness, explicit resume/new brief precedes re-claim; migrate old halted records; (U21) §6 routing restricts watchdog to permission cards, questions/plan reviews always Fishball; §4.4/§5/§14–§15 reuse `watchdog_refine {brief_id, expected_revision, reason, <fields>}` independently of answers, WD-11 tool/guide, WD-3 optimistic persistence, WD-4/WD-6 section/active-only trigger, WD-12 race/refusal/state coverage (§2.7); no check/resume/claim for dormant/paused refinement; (U22) require timer-free contract 2.x and reject all 1.x at attach, no old expiry exceptions; (U14) remove the approval timers, R4, the window sum and the deadline wording (§12.1 list); (U16) reword as a token saver (§12.3); (U14/Q-P) any decision-turn end without a decision escalates at once, no custom fail-safe timer; (final U17/Q-Q) §8/§9 and WD-9/WD-10 remove retained decision-audit/label copies and associated decision-retention settings; ordinary decision entries stay only at reached layers, survive in searchable transcripts after compaction, and never re-enter context automatically; no watchdog-only X10 notification to Fishball, one wake for a user decision, and `onSettled` only updates a watchdog that handled the request (§12.4); WD-4 excludes decisions from its rotated audit, WD-8 removes decision retention from rollover digests, and WD-11 keeps `watchdog_decisions` under Q-T = modified B: §4.4 replaces its limit-only parameters with §12.8's count-range contract, including watchdog-only transcript decisions on explicit pull, not automatic delivery; update §14 WD-11 done-when and §15 EP/BVA accordingly; (U12) side sessions are instance-owned agent runs, allowed by the new-session refusal's exception (Q-H) and never viewable; the escalation card is a chat-node definition (PANELS); §6.2 R1 "no brief" → "session not claimed" (X15 `approvals.claim`, §2.6), R2 "plugin disabled" drops (a disabled plugin has no claims); E6 `setDelegate`/`supervised` → per-session `approvals.claim`; §9 has no `enabled` (U7); §2.1 "installed with Install for Fishball" → bundled (X17/X18); §12 package note; §13 wE3 and wE4's section half → X2, wE4 notify → X10, wE2 → X9 claims, wE9 → X15, wE10 → X14 + hand-over; remove the §9 `enabled` setting and the `disabled` halt cause (§4.5.4); add §4.5.6 "Turned off: hand-over" (§2.4 here), §4.5.7 "Turned on again: briefs stay dormant until `watchdog_resume`" (U6), and "Every managed session needs an active brief" (§2.3 `start_session.watchdog` + §2.5 send gate) |
| watchdog (state mapping continued) | §4.5.1 gains `dormant` (any running state allowed; sends refused only when enabled and healthy), hand-over/effective-off and “no brief” rows, removes live `halted` fault state; §4.5.2's intentional-pause gate → X19 `supervision-paused`; §4.4 `watchdog_brief` gains `sendUnlocked` and supersedes dormant rather than `brief-exists`; `watchdog_resume` accepts dormant/paused only through readiness/check steps; manager section narrows U5 to enabled AND healthy; §10 “Plugin uninstalled” → “not removable; failed placement is immediate effective-off Fishball hand-over, no stop”; §14 WD-0 → X0-*, add WD-14 and all revised done-when rows above; §15 adopts §6 cases here; §16.1 records U1–U22 |

## 9. Open questions for the user

| # | Question | A | B | Recommendation |
| --- | --- | --- | --- | --- |
| Q-C | *(closed: A-lite, U10)* | | | |
| Q-E … Q-M | *(closed by U13: E, F, G, H, I, J, M as recommended; K = B; L changed, §11.9)* | | | |
| Q-N, Q-O | *(closed by U13: Q-N = A, Q-O = B)* | | | |
| Q-P | **Closed: A.** No timers; any decision-turn end without a decision immediately escalates, including DSH transport-error termination (§12.1) | | | |
| Q-Q | **Closed: user clarification, neither old option.** No separate bounded audit/label store; ordinary records stay at reached layers, leave context on compaction and remain searchable in transcripts. U17 is final (§12.4) | | | |
| Q-R | **Closed: B.** Add manager-scoped `board_search {query, status?, limit?}` over the archive, owned by B11 (§12.7) | | | |
| Q-S | **Closed: A.** Offer archive export first, then uninstall deletes runtime/archive; permanent retention means while installed (§12.6, B10) | | | |
| Q-T | **Closed: B, modified by the user.** Keep `watchdog_decisions`; Fishball may explicitly read recent watchdog decisions by count range, including watchdog-only outcomes. No automatic push; the U17 reached-layer rule governs automatic context delivery, not this pull (§12.8) | | | |

No open user questions remain from Q-P–Q-T.

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
- **K-3 (closed, narrowed by U20/U21):** healthy paused briefs still claim **permission**
  requests. Fault-induced halted/guard re-stop behavior is superseded: failure hands over to
  Fishball. Questions/plan reviews always belong to Fishball, including while paused (§2.6–§2.7).

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
- `board.json` and the append-only board archive, the watchdog's brief, criteria and supervision
  files, fold-notify's `seen.json`;
- `chat.json`, reminders and ordinary reached-layer decision transcript entries (no separate
  approval-label retention store, final U17);
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


## 12. Decisions of 2026-11-09 (U14–U19)

### 12.1 No waiting time on approval cards (U14)

**Flow.** A permission request of a managed session:
1. **Watchdog**, if the session is claimed (§2.6): decides now (`allow` / `reject` / one `ask`) or
   escalates now. It has no decision budget and no deadline.
2. **Fishball**, if not claimed, or escalated to it: decides now with `answer_approval`, or
   escalates now with `escalate`.
3. **The user's card**: no time limit. It stays until the user answers, or until the request ends
   for a reason that is not time (the session stopped, released or taken back, or the instance
   detached, contract §9).

No step moves a card on a timer. "Silence never approves" still holds, because nothing approves
by itself: an unanswered card simply stays.

**Removed (watchdog design):**
- `decisionTimeoutSeconds`, `managerReserveSeconds`, `minDecisionSeconds` (watchdog §9 `:816-818`);
- the "≤ 120 window-sum" paragraph (`:824-827`);
- runtime rule R4 (`expiresAt` budgeting, `deadline-short`) and R6's `deadline = …` (§6.2
  `:610-614`);
- §6.6 "within the time left … `managerReserveSeconds` … the window runs out" (`:724-726`);
- §6.7's "the connector's window sends the request to the user" (`:741`): an `act-failed` goes
  TO-FISHBALL, and if that delivery also fails, the instance escalates the card to the user
  (`escalate`) at once;
- §3.5 "A permission request has a deadline; a check does not" (`:267`). Decisions still preempt
  checks, because the requesting session is blocked, not because of a deadline;
- §7 "Timeouts" row (`:759`): it keeps `checkTimeoutSeconds` only (checks are not approvals);
- the WD-1 done-when "including the window-sum check" (`:927`), and the §15 BVA "Deadline" and
  "Window sum" lines (`:972-974`).

**Removed elsewhere in the chain** (the owners are below):

| Item | Where today | Change | Task |
| --- | --- | --- | --- |
| `approvalAnswerSeconds` (120 s), and its timer that moves a request to the pile | connector `src/config.js:27`, `src/approvals.js:811-815`, `src/questions.js:779-782`; DESIGN §7a item 11, `:709`, `:1965` | removed. A request waits for the instance (watchdog or Fishball) until it answers or escalates. Questions and plan reviews too | **K2** (new, connector) |
| Descriptor `expiresAt` (contract §5.1) | `contract.js:432,446`; host `slim/host/approvals.js:247,266` filters expired | remove the field from permission/question/plan-review descriptors and remove expiry filtering; a 2.x card carrying this removed field fails `invalid-envelope`, not an ignored legacy deadline | K2 (mandatory timer-free contract 2.0; K1 rejects all 1.x peers at attach, §3/U22) |
| The approvals view's countdown | `src/slim/ui/approvals.js:110-112,334` | removed (moves with PANELS anyway) | PANELS |
| X9 "a held item is dropped when … its `expiresAt` passes" | wE2 | removed; dropped only when its card settles or closes | X0-I |

**Not approval waits, kept:**
- grant `expiresAt` (a grant must end, contract §4.4);
- attachment `hostRef` expiry;
- watchdog check timers (`every_seconds`, `stall_seconds`, `checkTimeoutSeconds`, guard
  `guardSeconds`). These supervise sessions; they do not decide cards.

**Decision-turn completion (Q-P = A).** No timer of ours is allowed, including a technical
fail-safe timer. Whenever a decision turn ends without a decision (normal completion without an
answer, invalid output, model error, crash or cancellation), escalate the still-open request at
once: watchdog → Fishball → user. DSH's own transport errors that end a hung call follow the same
path; this does not introduce an approval deadline. If a call never ends and DSH reports no
failure, it can remain hung: no elapsed-time escalation is promised. A settled or closed request
is not escalated again. Owners: WD-8/WD-10 for the watchdog, X0-A for Fishball, K2 for the connector
handoff. Test each end-without-decision path and a late completion after settlement; no timer
advances a card. X13's `timeoutMs` is optional and omitted for decisions; check turns keep their
check timeout.

### 12.2 X3 record-type namespace: option B (U15)

- X0-C has **no** X3 member and no validation API.
- DSH's `PluginRecordType` is only `plugin:${string}` (`dsh-session/lib/types/types.d.ts:520` rc.5,
  `:527` rc.1), and `appendPluginRecord` checks nothing (`dsh-session/lib/index.js:1295` /
  `:1297`). So no DSH registry enforces a prefix.
- The rule is enforced **where each plugin registers its record types with DSH**: its chat-node
  definition (`uiConversation.events.register`, matched by event type) only matches
  `plugin:<its package name>/…`.
- **Owner: PG-1.** PG-1 ships a shared helper used by every Fishball `dsh.client` plugin
  (`fishball-page`, fold-notify, the watchdog's PANELS card, board):
  `recordDefinition(packageName, suffix, render)`. It refuses (throws at registration) a type
  outside `plugin:<packageName>/`.
- Tests: in PG-1, a definition with a foreign prefix fails to register; an own-prefix one renders.

### 12.3 What the watchdog is (U16)

The watchdog is a **token saver for Fishball**:
- It is a small-context helper that absorbs Fishball's frequent wake-ups: permission requests,
  plus the routine supervision of sessions so they do not drift.
- It runs **whether or not the user is present**.
- It is **not** an extra security layer. The permission rules (the user's allowance, low risk)
  are the same rules Fishball applies today. The watchdog only applies them in a smaller context.

The on/off, claim, coupling and hand-over rules (U1–U8) apply as narrowed by U20/U21 (§2.4–§2.7). Wording to fix in the watchdog
design:
- §1's intro and R-table: R15 "The safety rules hold" becomes "The permission rules hold (the
  same rules Fishball applies)";
- §10's column "Why safe" becomes "Why";
- §6.1 / §7: state the purpose as cost, as in this section.

The canonical doc carries no security framing; checked.

### 12.4 Approval-card cleanup and layer-local history (U17 final, Q-Q clarified)

The user's rule is **“it stays at the layer it reached.”** Decision records are ordinary entries
in that layer's chat history, visible in its transcript and findable with session search. They
leave model context when it is compacted but remain in the transcript; no pinned context,
automatic re-injection after compaction, separate decision-audit file or attribution-label retention
store. This replaces the previous bounded-label proposal, not the brief/criteria operational state.

**Q-T clarification:** the following table governs automatic recording/notification at settlement.
It does not prohibit Fishball from explicitly reading watchdog-only history with
`watchdog_decisions` (§12.8). Such a pull returns an ordinary tool result to the requesting turn,
so its contents are available in that turn's model context and transcript, then subject to normal
compaction. It is not an automatic history import, a background notification, or a change to the
layer that originally handled the approval. The previous absolute prohibition on any watchdog-only
content entering Fishball is superseded by this explicit user-requested exception.

| Highest layer reached | Decision record and context | Resolution notification |
| --- | --- | --- |
| Watchdog only | watchdog context and transcript only | settle the requesting tool; `onSettled` completes the watchdog's pending work; **no** X10 notice, record or wake in Fishball |
| Fishball (including an unclaimed request delivered directly to it) | Fishball context/transcript, plus the watchdog's if it handled the request before escalation | settle the tool; any waiting watchdog receives `onSettled`; Fishball's own decision is already in its turn, so no duplicate note or wake |
| User | Fishball context/transcript and the user's card result, plus the watchdog's if it handled the request before escalation | settle the tool; notify any waiting watchdog through `onSettled`; one X10 resolution note to Fishball with `wake: true` |

**Offer handoff is not terminal resolution.** The existing wire `approval.settled` with
`decision: 'escalate'` retires the instance offer, not the user's unresolved request. Preserve its
user card and reached-layer correlation until a terminal answer/closure. X15 must distinguish
this handoff from its terminal `onSettled` notification; no terminal cleanup/wake is inferred from
the event name alone. Correlate later answer/closure markers and avoid duplicate history/wakes.

At terminal resolution:
1. The **requesting session** receives the normal tool result. This is not a copy of the
   supervisor's decision-audit entry into the requesting session.
2. Record the outcome once per reached agent layer: `[approval <id>] decided by
   <user|fishball|watchdog>: <decision>`. Reuse a turn's existing decision entry instead of adding
   a duplicate. Attribution is data in the transcript entry, not a retained label object.
   The watchdog's settlement callback records the outcome only if that watchdog handled the
   request; merely holding a claim is not enough. It completes pending work without starting a
   new turn unless the watchdog is waiting. No decision history is broadcast to an unreached layer.
3. The **card is cleared at once** from the connector pile, the requesting session's card,
   Fishball's chat card (if present), and the instance card store. A user's result survives as an
   ordinary transcript entry, not a closed card. There is no retention period.
4. Remove the closed/retired-card retention and the attribution-label retention store, including
   its count limit. `decidedBy` can remain transient settlement/record metadata. Do not rebuild
   legacy labels into a new audit store or inject them into context; existing transcripts stay.

Owners: X0-A (instance store, reached-layer tracking, records/notes and Fishball's decision-turn
completion), WD-4/WD-8/WD-9/WD-10 (remove decision audit/digest retention, watchdog history and
settlement), WD-11 (Q-T explicit transcript reads, §12.8), K2 (connector pile/session-card clear),
PANELS (UI). The watchdog design's decision-audit lines/rotation and manager-chat label copies
are replaced by this rule; non-decision operational records are outside this change.

Acceptance: card offered → resolved → all card surfaces cleared; one result/entry per applicable
target under repeated settlement callbacks; highest layer reached × decider × watchdog handled
request → the table above. A watchdog-only decision produces nothing automatically in Fishball's
transcript or context; a later explicit Q-T pull may return it as an ordinary tool result. A user
decision wakes Fishball once. Compaction removes decision entries from model
context without deleting their searchable transcript history; reload never restores closed cards
or a label-retention store. PANELS renders attribution from eligible transcript entries only.

### 12.5 X0-C behaviour made explicit (U18)

The tester's gaps did reveal four unspecified points. They are now specified:
1. **Durable dedupe (X10):** `manager.notify` records each `dedupeKey` in the instance's
   `notify-keys.jsonl` in the child home, reserved as **pending** before queueing/holding with a stable
   message identity, then marked accepted only after durable queue/hold acceptance. A pending key
   retries that same identity (including restart recovery); only an accepted key answers `duplicate`.
   Crash after reservation or queue acceptance cannot lose the notice or create two turns. Bound
   accepted history to the newest `EXT_LIMITS.notifyKeys` (10,000) keys; never evict pending work to
   pretend success. This applies to both watchdog hand-over and recovery notices.
2. **Stub refusals:** an unimplemented member throws, or rejects for an async member,
   `ExtensionError` with `code: 'not-implemented'` and `member: '<area.member>'`. It never returns
   a value.
3. **Disabled watchdog:** both send paths (the tools and `images.js`) reach the connector
   unchanged. This is X19's "gate off" row; §12.5.1 defines the callable images path and oracle.
4. **`deliverInbox(items[])`:** exactly one followup message is queued, not one model completion
   promised. Texts are in arrival order, each in its own sender framing, separated by one blank
   line. Each item's ack waits for successful queueing. §12.5.2 defines inputs, receipt, rejection
   and bounds, including the empty-array `invalid-input` rejection.

Real-loop and real-loader integration stay with their later owners (X-E2E, X0-B), as the tester
proposed. The following are authoritative public/test contracts: a test writer need not inspect
implementation files. Source references identify the existing baseline, not extra requirements
hidden in source. X0-C owns the new array behaviour and its documented refusals/limits.

#### 12.5.1 Images-path send with the watchdog off

The existing Cordis service is `ctx.get('fishballImages')`. Its callable send-to-existing-session
method is **`message`**, not `send`. The latter word in the module overview is descriptive.

```ts
fishballImages.message(request: {
  sessionId: string;
  message: string;
  attachments?: LocalAttachment[]; // default []
}): Promise<{
  status: 'delivered' | 'unconfirmed';
  watchId?: string;
  watchError?: string; // mutually exclusive with watchId, if returned by the connector
}>;

type LocalAttachment =
  | { kind: 'image'; attachment: {
      attachmentId: string; mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
      bytes: number; width: number; height: number; name?: string;
    } }
  | { kind: 'file'; attachment: { attachmentId: string; name: string; bytes: number } };
```

`sessionId` names a managed target; `message` is passed verbatim, with no prefix/trim/watchdog
brief requirement while the watchdog is off. Attachments are refs already admitted to the child's
attachment store, **not** connector hostRefs, paths or raw bytes. The existing service verifies
and uploads each ref through `attachment.put`, then sends the returned hostRefs in input order.
At most 20 attachments; existing attachment/connector validation still applies. “Unchanged” means
unchanged by X19, not bypassing attachment preparation or connector validation. This method has
no `notifyWhenFinished` parameter and does not synthesize a watch.

**Public W0 oracle, no attachment-store fixture required:** with the watchdog plugin absent or
disabled, use a connected connector fixture with a valid managed target `ses-target` and observe
its incoming requests (not a replacement for the child's gate-bearing bridge method):

```ts
const result = await fishballImages.message({
  sessionId: 'ses-target', message: '  unchanged\nmessage  ', attachments: [],
});
// Exactly one connector request:
// op = 'session.message'
// payload = { sessionId: 'ses-target', message: '  unchanged\nmessage  ', attachments: [] }
// If the connector responds { status: 'delivered' }, result deep-equals that response.
```

Omitting `attachments` gives the same payload. No `attachment.put` occurs for an empty list.
Repeat with connector response `{status: 'unconfirmed'}`: it is returned unchanged and never
retried. Assert one `session.message`, exact payload deep equality, and result deep equality;
a success receipt alone does not prove that the text reached the connector unchanged. For a
nonempty attachment fixture, expect its ordered `attachment.put` calls followed by exactly one
`session.message` with those hostRefs; text and target remain exact. A connector refusal rejects
the promise through the existing bridge contract, never a fabricated success.

**Existing surface:** [images service](../../packages/instance/src/slim/child/images.js#L410-L413)
(`message`), [attachment preparation](../../packages/instance/src/slim/child/images.js#L355-L373),
[service registration](../../packages/instance/src/slim/child/images.js#L471-L485), and
[connector contract §4.1](../connector-contract.md#L301-L328). X0-C adds the bridge gate call;
this signature/result is not a new service API.

#### 12.5.2 Inbox array delivery: shape, receipt and bounds

The service is `ctx.get('fishballChat')`. Preserve the existing singleton form and options; add
the array overload below. Optional means the field may be omitted, not supplied as `null`.

```ts
fishballChat.deliverInbox(
  items: InboxItem[],
  options?: { skipImages?: boolean }, // default {}, skipImages defaults to false
): Promise<{ messageId: string }>;
// Existing overload retained:
fishballChat.deliverInbox(
  item: InboxItem,
  options?: { skipImages?: boolean },
): Promise<{ messageId: string }>;

type InboxItem = {
  text: string; // required, nonempty, already sender-framed; never trim or re-frame
  kind?: 'session' | 'user' | 'system' | 'watch' | 'approval' | 'plugin';
  sourceSessionId?: string;
  messageId?: string;
  dedupeKey?: string;
  at?: number; // nonnegative safe-integer epoch milliseconds
  images?: InboxImage[]; // omitted means []
};
type InboxImage = {
  attachmentId: string;
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  width: number; height: number; bytes: number; // positive safe integers
};
```

The **local chat service** accepts text-only items such as `{text: 'first'}`. Supplied ids/keys
are nonempty strings. `sourceSessionId` is required when nonempty `images` are actually fetched;
it identifies the source for `attachment.read`. Each image's five fields are required, width ×
height ≤ 4,194,304, bytes ≤ 4,194,304, at most 20 images **per item** (connector §4.5). Optional
metadata is not interpolated into text. Additional item metadata is ignored by chat, not treated
as instructions. Callers must provide sender framing inside `text`; the service does not invent
it. The connector's `inbox.push` wire envelope is stricter: **all seven** fields `messageId`,
`kind`, `sourceSessionId`, `text`, `images`, `dedupeKey`, `at` are required there. Optional local
fields do not relax that wire contract. Transport dedupe/acks belong to the inbox pipeline, not
this chat method; duplicate texts in a direct call are not silently deduplicated.

**Observable queue contract:** after validating the whole array and preparing all needed images,
queue exactly one user-role followup message. Its text block is exactly
`items.map(item => item.text).join('\n\n')`; preserve every character within each text, even
existing leading/trailing newlines. Append image blocks in item order, then each item's image
order. `skipImages: true` queues text only and performs no image fetch. A one-item array uses the
singleton source mapping: a `session` item is `{kind: 'agent-message', form: 'relay',
senderSessionId?: sourceSessionId}`, otherwise `{kind: 'fishball-notice', form: 'notice'}`. A
multi-item array uses `{kind: 'fishball-notice', form: 'notice'}`; per-sender attribution remains
in each text rather than falsely attributing a mixed batch to one sender.

The promise resolves **after the one followup is queued**, to `{messageId}` with that queued
message's nonempty id. It is not `{acked:true}`, a list of ids, a turn-completed signal, or a promise
that a model call succeeds. For a public W0 agent fixture, record calls to its DSH
`followup(message)` boundary: exactly one call, `message.role === 'user'`,
`message.id === receipt.messageId`, and text content exactly the joined input. For a text-only
batch its content is exactly `[{type: 'text', text: joinedText}]`. Observe through that supplied
agent boundary or the resulting session message, not private chat functions or implementation
counters. `[a,b,c]` therefore proves one queue operation and three texts in order, none lost or
doubled; the receipt alone cannot prove either. No real model turn is required by W0.

The inbox/batcher owner may acknowledge each original wire item with `{acked:true}` only after
this shared promise fulfills; before fulfillment no item in that batch is acked. Rejection means
none is acked by this delivery attempt. It does not wait for the model's reply. Later X0-I/FN-6
owns the per-item wire-ack integration; W0 tests the chat receipt/queue boundary. Image preparation
failure queues no partial turn; the existing inbox owner's image-refusal handling is separate.

**Array validation and BVA:**
- 1–20 items inclusive, using fold-notify's approved `BATCH.maxItems = 20`. An empty array rejects
  with an error whose `name` is `ChatApiError` and `code` is **`invalid-input`**; it does not throw
  synchronously. Non-record items, missing/empty/non-string text, invalid supplied typed metadata
  or options also reject `invalid-input`, except the image-specific refusals below. Error message
  wording is not an assertion surface.
- Maximum joined text is **65,536 UTF-8 bytes**, including the `\n\n` separators, using existing
  `CHAT_LIMITS.messageBytes`. 21 items or 65,537 bytes rejects `ChatApiError` with `code: 'too-large'`.
  Validate shape first, then item count, then joined text size; no truncation, splitting or sorting.
  Rejected validation queues zero followups, fetches zero images and leaves inputs unmodified.
- After item shape/count/text checks and before fetching any image, validate each item's image
  list in order. A supplied non-array `images` rejects `ChatApiError/invalid-input`. Malformed
  image descriptors (including missing fields, invalid media type or nonpositive/non-safe integer
  dimensions/bytes) reject `ContractError/invalid-envelope`; more than 20 images in an item,
  pixel product > 4,194,304 or bytes > 4,194,304 rejects `ContractError/too-large`. These are the
  existing image service's error names/codes, not chat-error normalization. Metadata validation
  still applies with `skipImages: true`; that option skips fetching/model checks, not validation.
  Without skipping, a missing source session id rejects `ContractError/invalid-envelope`.
  Check image count before descriptors; image transfer/model failures after validation retain
  their existing codes. All these failures reject the promise, not synchronously throw.
- No additional total serialized-object limit or array-wide image count/byte cap is introduced
  here: image bounds apply per item before fetching; there are no raw image bytes in `items`.
  Existing transfer/model refusal codes remain unchanged. The array text/count caps do not
  retroactively change the legacy singleton overload's size policy.
- Required cases: item counts 0/1/19/20/21; joined bytes 65,535/65,536/65,537 (including multibyte
  text and separator bytes); invalid middle item produces no partial turn; duplicate texts stay
  duplicated; no caller object/array mutation; omitted versus empty `images`; image ordering and
  `skipImages`. The zero-item promise must reject with `invalid-input`, not resolve an empty receipt.

**Existing baseline and deliberate additions:**
[chat delivery](../../packages/instance/src/slim/child/chat.js#L635-L655) supplies singleton
`item/options`, unchanged text and image handling;
[queue receipt](../../packages/instance/src/slim/child/chat.js#L598-L605) supplies `{messageId}`;
[chat error vocabulary and byte limit](../../packages/instance/src/slim/child/chat.js#L88-L139)
supply `invalid-input` / `too-large` and 65,536 bytes;
[connector §4.5](../connector-contract.md#L415-L449) supplies the wire envelope/image metadata.
Fold-notify design §7 (snapshot `7347c1f169e3f1072cfa77c136645a086647f160`) supplies 20 items,
blank-line joining, image order and ack-after-queue rules. The array overload, validation errors
and mixed-batch source mapping above are the normative U18 additions; the existing singleton's
uncoded `TypeError` is **not** the empty-array test contract.

### 12.6 Board: never delete, 30-day visibility (U19)

- **Records are never deleted while the plugin is installed.** Every card is kept in an **append-only archive**:
  `<child home>/fishball-board/archive.jsonl`.
  - Each line is one plain-JSON card snapshot, written at each change.
  - The file is plain text, so grep finds past cards by keyword.
  - **Q-R = B:** Fishball uses the manager-scoped `board_search` tool (§12.7), not a guide
    instruction to use `grep`. The archive remains plain text and independently grep-able.
- **The board** (the panel and the `fishball-board:board` context) shows the open cards, plus the
  closed cards (`done`, `dropped`) whose `closedAt` is within the **board visibility window**
  (30 days). After that a closed card leaves the board. It is archived, not deleted, and stays
  findable.
  - The window replaces "prune age"; tests check the behaviour, not a constant name.
  - `board.json` holds only what is on the board. The 300-card cap applies to it.
  - A card that leaves the board, or is cleared, is no longer in `board.json`. Its full history is
    in the archive.
- **Active clearing:** `board_write` gains an item form `{id, clear: true}` for a closed card. It
  takes the card off the board now, and it stays in the archive.
  - Fishball can do it. The user does it by telling Fishball; the panel stays read-only (board Q3
    A).
  - Clearing an open card is refused `not-closed`.
- **Reopen** of a card that is off the board: `board_write` with its `id` restores it from the
  archive. The transitions of board §4 apply.
- **Panel/context (B5):** use the same on-board projection: open cards plus both Done and Dropped
  within the 30-day inclusive window, excluding early-cleared cards. Replace `doneWindowHours`
  as a panel cutoff; it may remain solely for the existing recent-done count. Existing context
  card/character budgets still apply; being on the board does not guarantee every card fits in
  the injected block. Clear/reopen refreshes panel and context together; reopening restores the
  card to its open group. Dropped is no longer hidden or export-only.
- **Uninstall (Q-S = A):** offer an export of the complete `archive.jsonl` before deletion, not
  merely the on-board JSON export. Then `uninstall.js` still deletes `fishball/runtime`, including
  the archive. “Never deleted” prohibits installed-plugin housekeeping, not explicit uninstall.
  The export is optional; an accepted export must finish at a user-chosen location outside the
  deleted runtime before removal proceeds. An export failure leaves the runtime intact for retry
  or an explicit choice to uninstall without export. Owner: B10 (§5.2); no automatic move to a
  permanent archive directory.
- **Tests (B3/B4):**
  - BVA: `closedAt` at 30 days − 1 ms, at 30 days, + 1 ms → on board, on board, off board.
  - After it leaves, the archive has its last line.
  - EP for clear: done, dropped → cleared; open → `not-closed`.
  - ST: done → on board → (30 days or clear) off board → (reopen) on board.
  - EP for search: `board_search` finds a title/note keyword in a card off the board for a year.
  - B5: Done and Dropped use the same inclusive 30-day window; early clear removes either from
    panel/context; reopen restores both projections, within existing context budgets.
  - B10: export accepted → full archive exported outside runtime before deletion; declined →
    runtime deleted; export fails → runtime remains; no archived card is pruned while installed.

### 12.7 Archive search contract (Q-R = B)

**Owner: B11** (archive-search tool/guide, new `src/search.js`), using B3's archive reader. Register through
X2 and enforce X1's manager identity, just like `board_write`; a read-only search never changes
cards, visibility, timestamps or the archive. The tool remains available when context injection
is off; disabling the plugin removes it with the other board tools.

`board_search {query, status?, limit?}`:
- `query`: required string, trimmed, 1–200 Unicode characters. Literal case-insensitive substring
  matching of `title` or `note` in each archived snapshot; no regex, shell execution, path input,
  tokenisation or fuzzy search. Case folding uses the same deterministic Unicode lowercase
  conversion for the query and fields, not the UI locale.
- `status`: optional single board status (`todo`, `in_progress`, `waiting`, `paused`, `done`,
  `dropped`); filters the **matching snapshot's** status, not the card's current status.
- `limit`: integer 1–50, default 20. Reject unknown fields, wrong types and out-of-bound inputs as
  `invalid-input`; never silently clamp. Put these bounds in `BOARD_LIMITS.search`.
- Search all committed archive lines, including snapshots of cleared/off-board cards and old
  text later edited away. Return **one hit per card id**, its newest matching snapshot. Order by
  that snapshot's `updatedAt` descending, then archive line number descending to break ties.
  These are historical matches, not a promise about the card's current state.
- Success: `{ok: true, query, results: [{card, archiveLine, matchedFields, onBoard}], truncated}`.
  `card` is the complete matching snapshot with the existing bounded board fields;
  `archiveLine` is its 1-based line number; `matchedFields` contains `title` and/or `note`;
  `onBoard` means that id is currently in the visibility projection (not that this snapshot is
  current). `truncated` is true exactly when more distinct matching card ids exist than returned.
  No match is `{ok: true, query, results: [], truncated: false}`.
- Refusals: `not-manager`; `invalid-input`; `board-unavailable` for an unreadable/corrupt archive.
  A fresh board with no archive yet is empty. Never hide corruption as an empty or complete result.
- Read a stable committed append boundary, so a concurrent append cannot expose half a line.
  There is no age/line-count cutoff: the archive is streamed, retaining only the bounded top
  results, rather than loaded into context or memory wholesale. A cancelled/failed scan returns
  no success result claiming completeness. Search can become slower as the archive grows; no
  search index or pagination API is introduced in this design.

**B11 acceptance:** a keyword in a card closed over 30 days ago (including a year-old, cleared
card) is found; title and note matches, mixed case, literal regex characters, status filters,
no matches, historical text edits, duplicate snapshots and ordering all follow this contract.
Boundary cases: query lengths 0/1/200/201 after trim; limits 0/1/20/50/51 and nonintegers;
more than 50 distinct matches set `truncated`. Read failure/corruption never yields partial
success. Search does not change board/context visibility, and a non-manager is refused.

### 12.8 On-demand watchdog decision history (Q-T = B, modified)

**Owner: WD-11**, registered through X2 and restricted to Fishball by X1. Keep the existing
`watchdog_decisions` name and optional `session_id` filter. This is a read-only **pull** of the
watchdog's decision records, including approvals it resolved without involving Fishball, not just
records that reached Fishball/user. No decision records are proactively copied to Fishball by this
tool. U17's automatic reached-layer settlement rules stay unchanged (§12.4).

**Parameters:** `watchdog_decisions {offset?, limit?, session_id?}`.
- `offset`: zero-based count of newest matching decisions to skip; default **0**, integer from
  0 through `Number.MAX_SAFE_INTEGER` (9,007,199,254,740,991).
- `limit`: number to return; default **5**, integer **1–50**. These defaults/bounds live in the
  watchdog's feature-owned `LIMITS.decisionHistory` constants, not a new user setting.
- `session_id`: optional nonempty string identifying the **watched session**, not the watchdog's
  side-session id. Use the existing session-id validation. Filter before applying offset/limit;
  a valid id with no history returns an empty page, including an ended/unmanaged session.
- “Last 5” is `{limit: 5}`; “decisions 6–15” is `{offset: 5, limit: 10}`. Reject an unsafe
  `offset + limit` as an invalid range; do not clamp, coerce strings, accept fractions or interpret
  negative offsets from the end. Unknown parameters (including `from`/`to`) are invalid.

**History and ordering:** read ordinary watchdog transcript decision entries across retained
side-session epochs, including entries no longer in model context after compaction. No separate
bounded audit/label store, background copy, pinned prompt section or restore-on-resume injection
is introduced. One count unit is one completed watchdog decision attempt/routing outcome
(including an `ask` or escalation); a later attempt for the same approval is a separate unit.
An `onSettled` note reporting someone else's later answer is not another watchdog decision, and
repeated callback delivery does not duplicate an entry. Non-decision supervision reports are not
included. Structured metadata belongs to the ordinary transcript entry; it is not a second store.

Sort by decision `at` descending; ties use the source side-session id in ascending code-point order,
then source event sequence descending. Read committed transcript boundaries captured for the call,
so concurrent decisions do not shift that call's page. Separate calls use the latest history: count
ranges are not stable cursors and may shift when new decisions arrive. No age or count-retention
cutoff is added; source transcripts remain subject to their normal lifecycle.

**Success:** `{offset, limit, decisions: [...], hasMore}`. Each decision contains:
- `at`, `approvalId`, `sessionId` (watched session), `toolName`;
- `outcome`, `reasonCode`, `reason`, optional `criterionId`: the existing decision-table fields
  and meanings, not a newly judged outcome or the later Fishball/user resolution;
- `source: {sessionId, eventSeq}` identifying the ordinary watchdog transcript entry.

Return at most `limit` entries; `hasMore` is true exactly when another matching decision exists
beyond the returned page. Fewer than requested is normal; an offset at or beyond the history's
length returns `decisions: []`, `hasMore: false`. Do not include raw approval arguments, full
prompts, or unrelated transcript messages. Preserve the existing decision-record text bounds.

**Refusals:** `{code, field?}` in the normal tool error envelope:
- `not-manager`: caller is not Fishball; check before reading any history.
- `invalid-input`: unknown field, invalid `session_id`, wrong type, nonfinite/fractional number;
  `field` identifies the offending parameter.
- `invalid-range`: integer offset below 0/above the safe maximum, limit outside 1–50, or unsafe
  `offset + limit`; `field` is `offset`, `limit` or `range` respectively.
- `history-unavailable`: required transcript data cannot be read or decoded. Do not return a
  partial page as complete or disguise an inaccessible transcript as no decisions. A fresh
  watchdog with no decision history is an empty success, not an error.

**Context effect:** an explicit call necessarily makes its returned data available to Fishball in
that turn's ordinary tool result/context and transcript. This is the user-authorized pull, not an
automatic history import. It neither changes the approval's reached-layer metadata nor sends X10
notifications, wakes another turn, reopens a card, or retains a separate audit copy. The tool result
leaves model context under ordinary compaction and remains in the transcript like any other tool
result. Reload/compaction never calls this tool automatically.

**WD-11 done-when / EP and BVA:**
- Omitted parameters return the last 5; `{offset: 5, limit: 10}` returns decisions 6–15 newest
  first. Cover 0/1/4/5/6 available records, short pages, and offsets just below/at/above the count.
- Offsets −1/0/1, the maximum safe integer and one above; limits 0/1/5/50/51; safe versus unsafe
  range sums; fractions, strings, null, nonfinite values and unknown fields yield the errors above.
- Filter absent/matching/no matches/invalid; filtering precedes range selection. Cross-epoch
  history, timestamp ties, compacted entries, repeated callbacks and multiple attempts for one
  approval follow the count and ordering rules. Concurrent appends cannot shift one call's page.
- A watchdog-only decision produces no automatic Fishball record; a later explicit call returns
  it. The tool result uses ordinary context/compaction, without recreating approval cards or a
  decision store. Unauthorized calls read nothing; unavailable history is not an empty success.
