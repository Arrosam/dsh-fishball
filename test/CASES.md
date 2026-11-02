# Fishball P2 + P3 + P4 + P5 + P6 + P7 + P8 + unread-replies + plugin-statuses + P11 + P12 black-box test catalogue

Run everything with `/opt/homebrew/bin/node test/run.mjs` (node:test, exits non-zero on failure).

## How the suite works

- Each test file boots the real installed DSH Web 0.2.1-rc.2 runtime in a child process ([support/worker.mjs](support/worker.mjs)), on a throwaway `DSH_HOME` under `.runtime/test-homes/`. stdin stays open, because DSH's launcher shuts down on stdin EOF. `run.mjs` deletes the test homes left by earlier runs.
- The profile is initialized from the shipped `web` template. It links two bundles: the repo root as `dsh-fishball`, and the fixture bundle [fbtest-tools](support/fixtures/fbtest-tools/index.js). The fixture bundle registers global tools under the hidden names, the shell names, `demo_echo` and a `bsk_inspect` with `output` and a `videoAction` enum containing `save`. It also records `agent/created` and `agent/disposed`.
- The model is a scripted fake adapter ([fake-llm.mjs](support/fixtures/fake-llm.mjs)) with no network. It records every conversation request (system text and tools) and answers `ok` when nothing is queued. Session-title calls are answered separately.
- An overlay patch adds the fake model, sets it as the default, and adds a test preset `fbtest-bare`, whose only row is time-context. Its sessions therefore see exactly the global tools, so they are the "ordinary session" used for comparison.
- Every system test talks HTTP to the real `/api/fishball/*` routes with the browser cookie minted from the printed `dsh web:` token. The tests inspect the host only through public DSH services (sessionPersistence, workspaceRegistry, agents, sessionController, settings, sandboxPolicy, approval, agentPresets, pluginManager), never through the implementation.
- No test reads the implementation (`index.js`, `src/**`, `client.js`).
- **P3 additions.** The profile also has four fixture bundles installed as dependencies but not enabled in `dsh.profile.bundles`: `fbtest-only`, `fbtest-only-b` and `fbtest-only-c`, whose patches only insert their own row, and `fbtest-edits`, whose patch also edits the `fbtest-tools` row. Each registers one tool (`only_echo`, `only_b_echo`, `only_c_echo`, `edits_echo`) and records `apply` and `dispose`, so a test can tell whether its code runs. Every fixture tool description has two lines.
- **Scripted approver.** The worker adds a prepended host-level `approval/request` answerer (the S12 position, ahead of the browser forwarder). It records each question (session, toolName, reason) and answers with an outcome the test sets: `allowed-once`, `rejected`, `unavailable` or `cancelled`. The default is `rejected`, so a prompt nobody expected cannot pass a case or hang a turn.
- **Host probe (start_session titles).** The worker's `startProbe` op wraps the host's own methods for the sessions created while it is armed (never Fishball's): the session-title service's `rename`, the new agent's `steer` and the new session's `flush`. It records the calls in order and can make `rename` throw the real `SessionTitleInvalidError` or a plain `Error`, make the steer throw, or make the first flush after the steer reject or answer `false`. `FBTEST_NO_SESSION_TITLE=1` boots DSH without its `session-title` row, so there is no `sessionTitle` service. The worker also records DSH's logger warnings and errors (`loggedProblems`). The fake model now records each tool's description next to its name and parameters.
- **Host operations for the read_session roles and half-made start_session fixes.** `injectUserMessage` appends one user/message (any source, or none; empty content with `text: ''`) to a live session's log with DSH's own `session.append` and the `surfaceOp: 'append'` marker DSH requires, so no turn runs. `failAttach` makes one registered workspace's `attachSession` throw; DSH's own `sessionController.create` then really creates the session and throws its real `session/workspace-attach-failed` (details `{sessionId, workspaceId}`), and `attachCalls` lists the failed attaches. `failCreate` replaces `sessionController.create` with one that throws a given `code` and `details` (optionally after really creating the session through DSH's create, `createFirst`; `createdByWrapper` lists those sessions); no code restores DSH's own. The start_session helpers shared by the start-title and half-made files live in [support/start-session.mjs](support/start-session.mjs).
- **Making fixture tools visible (P3).** The fixture tools are not on Fishball's checked list, so they are unchecked and hidden. P2 cases that need them visible (CMP-03..09, PTC-01/02, FW-03/05) first call `set_plugin_enabled({plugin:'fbtest-tools', on:true})` from a scripted Fishball turn, with the approver answering Allow once. They then wait for the change to apply ("settle", A20).
- **add_plugin** installs the local directory `support/fixtures/fbtest-added` by absolute path. DSH's plugin manager runs pnpm in the throwaway profile; a local directory needs no network.

## Case catalogue

Techniques: EP = equivalence partitioning, BVA = boundary value analysis, DT = decision table, ST = state transition.

### [singleton.test.mjs](singleton.test.mjs): R-SINGLETON first start and restarts, package shape

| id | technique | requirement | expected result |
|---|---|---|---|
| PKG-01 | EP | ESM npm package named dsh-fishball | `package.json` has name `dsh-fishball` and type `module` |
| PKG-02 | EP | patch inserts one host row | `listBundles` rows = [[fishball, dsh-fishball]]; bundle enabled |
| SGL-01 | EP (first start) | exactly one session | one stored session with agentPreset `fishball:assistant`, and one session in the folder; its id equals `state.sessionId` |
| SGL-02 | EP (folder missing) | cwd `<DSH_HOME>/fishball/assistant`, created if missing | folder exists; header cwd and `state.cwd` equal it |
| SGL-03 | EP | no workspace registered (amended) | no workspace path equals realpath(folder); `state.workspaceId` is null |
| SGL-04 | EP | pinned | `pinnedSessionIds` contains it |
| SGL-05 | EP | sentinel preset id, never registered | header agentPreset `fishball:assistant`; `agentPresets.list()` lacks it |
| SGL-06 | EP | read-only and ask at creation | log has `sandbox/mode` read-only and `approval/policy` ask; resolved mode read-only; override ask |
| SGL-07 | ST start→live | live without user action | status live, error null, `ctx.agents.get(id)` defined |
| SGL-08 | EP | controller returns the live agent | `sessionController.resolveAgent(id).agent` is the live agent |
| SGL-09 | DT (archive without stopActivity while live) | archive guard | `WorkspaceActiveSessionError` with activity kind `fishball`; not archived; still live |
| SGL-10 | ST first creation | one setup turn (amended) | 1 model request; log has turn/start and turn/end, plus one user/message with source `{kind:'fishball-notice', form:'notice', summary:'Fishball is set up'}` whose text mentions "set up" |
| SGL-11 | ST restart | same session, no setup turn | same id; still one notice; 0 model requests; one sentinel session |
| SGL-12 | BVA (N = 3 boots) | one session across N restarts | one sentinel session, one session in the folder; still read-only, ask and pinned |
| SGL-13 | ST starting→live; EP (folder already exists) | live only after the setup turn ends | every state snapshot taken while the setup request is held is not `live` and is a documented status; `live` comes after release; the existing folder is used |
| SGL-14 | DT (retry × starting); BVA (answer within ~2 s) | retry during the setup turn is a no-op and does not hang | status `starting` with a sessionId; POST retry answers 200 `{ok:true}` with the same sessionId in under 2.5 s, while the setup request is still held; one session; one setup request and one notice |
| SGL-15 | ST (stored blank session –start→ live) | a resumed session that never had a turn gets the setup turn | the stored id is resumed (no new session); one setup request; one notice; the setup turn ends `completed`; pinned (setup in A14) |
| SGL-16 | ST (restart –turn→ completed) | the resumed agent is usable (inferred, A13) | a turn steered after a restart makes 1 model request and ends `completed` |

### [lifecycle.test.mjs](lifecycle.test.mjs): R-SINGLETON recovery and archive (state transitions)

The test makes the stored session "gone" by moving its JSONL directory and projection-cache file out of `DSH_HOME`, and restores it by moving them back.

| id | technique | transition | expected result |
|---|---|---|---|
| LIF-01 | ST live –restart, store lost→ recovery | resume impossible | status recovery; `error.code` is a non-empty string; no Fishball session created; old id not live |
| LIF-02 | ST recovery –retry (still lost)→ recovery | failed retry | still recovery; nothing created |
| LIF-03 | ST recovery –retry (restored)→ live | retry resumes | 200 `{ok:true}`; live; same id; error null; one sentinel session |
| LIF-04 | ST recovery –adopt→ live | adopt | 200 `{ok:true, state}`; live; new id ≠ old; exactly one sentinel session; agent live, read-only, ask, pinned |
| LIF-05 | ST live –restart→ live | adopted record kept | the adopted id resumes; one sentinel session |
| ARC-01 | ST live –archive with stopActivity→ archived | user archive | status archived; agent no longer live |
| ARC-02 | ST archived –restart→ archived | not resumed | status archived; agent not live; no new session |
| ARC-03 | ST archived –unarchive + retry→ live | resume after unarchive | 200 `{ok:true}`; live; same id |
| PIN-01 | ST (live –unpin through the registry, restart→ live) | pinned after every resume | pinned again |
| PIN-02 | ST (pin removed from the stored registry while DSH is down –start→ live) | same | pinned again |
| FAIL-01 | EP (store partition: malformed JSON) | store unreadable | status `failed`; `error.code` `store-unreadable`; no session created; store file byte-identical |
| FAIL-02 | EP (store partition: future version) | same | same |
| FAIL-03 | EP (store partition: record breaks the schema) | same | same |
| FAIL-04 ×3 | DT (retry × failed) | no lifecycle runs | 409 `{ok:false, code:'unavailable'}`; no session; still `failed`; store unchanged |
| FAIL-05 ×3 | DT (adopt × failed) | same | same |

### [http.test.mjs](http.test.mjs): R-HTTP

| id | technique | requirement | expected result |
|---|---|---|---|
| HTP-01 | EP | GET state shape | 200 application/json; exactly the keys status, sessionId, workspaceId, cwd, error, limits (integers: the 12 original fields plus rev11-limits' 16 plus rev11b's 2), hiddenTools |
| HTP-02 | EP | hiddenTools | exactly the 18 names (with `spawn_teammate`), sorted; also checked against the literal list |
| HTP-03 | EP (no cookie) | behind browser auth | not 200 |
| HTP-04/05 | EP + ST | SSE | 200 text/event-stream; first frame within 3 s equals GET state; a limit change produces a frame with the new value |
| HTP-06 | DT body validation | bad-body | invalid JSON, a JSON array, `{}`, `"restart"`, `"ADOPT"` and `1` each give 400 `{ok:false, code:'bad-body'}` |
| HTP-07 | DT (adopt × live) | not-in-recovery | 409 `{ok:false, code:'not-in-recovery'}`; same session; one sentinel session |
| HTP-08 | DT (retry × live) | retry is a valid action | 200 `{ok:true, state}` with the same sessionId; still live (see A6) |
| HTP-09 | EP (no cookie) | POST behind auth | not 200; nothing changes |

### [config.test.mjs](config.test.mjs): R-CONFIG

| id | technique | requirement | expected result |
|---|---|---|---|
| CFG-01 | EP | defaults | the settings entry `fishball` applies live; its value and `state.limits` equal the default table (rev11-limits: the 12 original fields plus the 16 moved ones; rev11b: plus `userMessagesListed` 20 and `userMessageExcerptChars` 1000, 30 in all) |
| CFG-02 ×12 | BVA (minimum valid) | 1, or 0 for the three hourly caps | update ok; `state.limits` shows the value; the profile `cordis.patch.yml` row config holds it |
| CFG-03 ×12 | BVA (minimum − 1) | 0 for "≥ 1" fields, −1 for hourly caps | update throws; patch file byte-identical; live limits and settings value unchanged |
| CFG-04 ×9 | EP (negative) | −1 for "≥ 1" fields | rejected; nothing changes |
| CFG-05 ×12 | EP (non-integer) | 1.5, or 0.5 for hourly caps | rejected; nothing changes |
| CFG-06 ×12 | EP (string) | "5" or "x" | rejected; nothing changes |
| CFG-07 | BVA (large) | no upper bound | 1,000,000 accepted |
| CFG-08 | EP | the defaults again (all 30 fields since rev11b) | accepted together |
| CFG-09 | ST live –update→ live | no remount | same agent object; one agent/created and no agent/disposed for Fishball; status live |

### [composition.test.mjs](composition.test.mjs): R-COMPOSITION and R-ISOLATION

| id | technique | requirement | expected result |
|---|---|---|---|
| CMP-01 | EP | persona | every Fishball request (setup and driven) contains "You are Fishball", "does/do no work" (A1) and "never create, change, move or delete a file", and does not contain "coding agent" |
| CMP-02 ×16 | EP (one per name) | hidden names registered at boot (with `spawn_teammate`) | absent from every Fishball request; present in the ordinary session's request |
| CMP-03 | EP | other names stay visible | demo_echo, bsk_inspect, bash, pwsh, terminal_open and terminal_send are visible to Fishball |
| CMP-04 | EP | bsk_inspect copy | no `output`; the other properties are kept; videoAction enum = original minus `save` |
| CMP-05 | DT (no save option) | pass-through | original called once with the same arguments; non-error result carrying the original's text |
| CMP-06 ×3 | DT (output / save / both) | refused | tool error; original not called |
| CMP-07 | BVA (neighbour of `save`) | `stop` passes | original called; non-error |
| CMP-08 | ST (added after start) | re-evaluation | late `ralph` and `code_review_report` hidden from Fishball and shown to the ordinary session; late ordinary `late_echo` visible to Fishball |
| CMP-09 | ST (removed, then re-added) | re-evaluation | removing tools keeps Fishball working and drops `late_echo`; a hidden name registered again stays hidden |
| ISO-01 | EP (standard preset) | ordinary session unchanged | "coding agent", no Fishball persona; every fixture name; bsk_inspect schema identical to the original |
| ISO-02 | EP (preset without its own tools) | same | same as ISO-01 |
| PTC-01 | EP (process booted with `DSH_TOOLS_MODE=ptc`, which the Web tools row reads) | Fishball's tools are presented natively | Fishball's request lists `demo_echo` and `bsk_inspect` and no hidden name; an ordinary session's request lists `run_code` |
| PTC-02 | EP (same process) | native call works | Fishball's direct `demo_echo` call is not an error, and the fixture runs once |

### [filewrite.test.mjs](filewrite.test.mjs): R-FILEWRITE

| id | technique | requirement | expected result |
|---|---|---|---|
| FW-01 ×4 | EP (hidden global tool) | write, edit, str_replace_editor, plugin_manager | tool error; fixture body never runs |
| FW-02 ×4 | EP ("somehow visible": registered in Fishball's own agent scope, which restrict cannot mask) | same names | tool error; body never runs (the test notes when the tool was not even offered) |
| FW-03 ×24 | DT: tool {bash, pwsh, terminal_open, terminal_send} × mode {read-only, workspace-write, danger-full-access} × sandbox_permissions {absent, present} | shell rule | runs only for read-only with the key absent; every other row is a tool error with no body run; rows with the key never add approval/asked |
| FW-04 ×3 | BVA (value of sandbox_permissions) | "includes" means key present | `"read-only"`, `"danger-full-access"` and `""` are all refused with no approval/asked |
| FW-05 | ST read-only → workspace-write → read-only | guard follows the current mode | refused, then runs again |
| FW-06 | EP (run_code) | run_code with sandbox_permissions | tool error; no approval/asked (weak, see A2) |
| FW-07 ×5 | EP (ordinary session) | no effect on other sessions | the fixture write, edit, str_replace_editor, plugin_manager and bash (with and without sandbox_permissions) run normally |

## P3 cases

### [plugins-catalog.test.mjs](plugins-catalog.test.mjs): R1-R4, R13, R14

| id | technique | requirement | expected result |
|---|---|---|---|
| CAT-01 | EP (Fishball / ordinary session) | the four plugin tools (with remove_plugin) exist only for Fishball | listed in every Fishball request; absent from an ordinary request and from the global tool list |
| CAT-02 | EP | list_plugins shape | exact keys `{plugins, allowedTools, otherTools}`; each plugin has exactly the 8 fields with the documented enums and types; unique keys; tool and allowance entries have exactly their keys |
| CAT-03 ×7 | DT (one row per built-in) | built-in keys and defaults | kind builtin; on for compaction, web, time and reminders; off for ask-user, skills and shell; changedBy null; lastError null |
| CAT-04 | EP (enabled in the profile, new install) | fbtest-tools | kind profile, **off** (dsh-disabled), changedBy null (plugin statuses) |
| CAT-05 ×3 | EP (installed, not enabled) | fbtest-only, -b, -edits | kind fishball-only, off |
| CAT-06 | EP (DSH-optional, not enabled) | listed | each such bundle from listBundles is fishball-only and off |
| CAT-07 | EP | dsh-fishball never appears; nothing else appears | no dsh-fishball entry; every bundle entry is a profile dependency or DSH-optional; every profile dependency is listed, with its kind matching `enabled` |
| CAT-08 | EP (first start) | default tools | the setup request and a later one list web_search, web_fetch, the four schedule tools, the three plugin tools and working_directory; not ask_user_question, skill, bash or any hidden name |
| CAT-09 | EP (attributable unchecked) | R4 | fixture tools are absent from Fishball's request, `unchecked` under fbtest-tools, and present for an ordinary session |
| CAT-10 | EP | hidden names under a plugin | status `hidden` |
| CAT-11 | EP (unattributable) | a tool registered by no plugin (root context) | listed in otherTools only, as `unchecked`; hidden from Fishball; present for an ordinary session |
| CAT-12 | EP | built-in tools that are on | status `visible` |
| CAT-13 ×2 | EP (guard, R14) | direct call of an unchecked / unattributable tool | tool error; the body never runs |
| CAT-14 ×3 | DT (plugin with no unchecked tools) and ST off→on→off | ask-user, skills, shell | `{ok:true,on:true}` with no approval; not in the same turn's next request; in the next turn's request; changedBy fishball; off removes it again |
| CAT-15 | ST (everything on) | R13 | state.hiddenTools is still the 18 names; no hidden name in Fishball's request; hidden fixture names stay `hidden`; a direct `subagent` call is refused |

### [plugins-toggle.test.mjs](plugins-toggle.test.mjs): R5-R9, R14 (one host, ordered transitions)

| id | technique | requirement | expected result |
|---|---|---|---|
| TOG-01..03 | DT (answer: rejected / unavailable / cancelled) | on with unchecked tools | exactly one approval with toolName set_plugin_enabled; the reason has one `- name: first line` per unchecked tool and never the second line; `{ok:false, code:'rejected', unchecked:[names]}`; tools stay hidden and unchecked; no allowance; the plugin stays on |
| TOG-04 | DT (allowed-once) | Allow once | `{ok:true, on:true, allowedTools:[names]}`; not in the same turn's next request; in Fishball's next request; allowedTools lists each, with key and module; status visible |
| TOG-05 | ST on→off | R5 | `{ok:true, plugin, on:false, note:string}`; tools still present until the turn ends; then absent with status plugin-off; an ordinary session keeps and runs them; profile package.json and cordis.patch.yml byte-identical |
| TOG-06 | EP (guard) | direct call of a plugin-off tool | tool error; the body never runs |
| TOG-07 | ST off→on (allowed before) | no second question | no approval; tools back; profile files unchanged |
| TOG-08 | ST allowed→(schema change)→unchecked | R7 | the tool is re-registered by fbtest-tools with an extra property; hidden and `unchecked`; other allowed tools stay; an ordinary session sees the new schema |
| TOG-09 | ST unchecked→allowed | allow again | one approval listing only the changed tool; `allowedTools:['demo_echo']`; Fishball sees the new schema |
| TOG-10 | EP (nothing unchecked) | no approval | `{ok:true}`, no question |
| ONLY-01 | ST off→on (Fishball-only, Allow) | R8 mount | its code runs; one approval listing only_echo; `allowedTools:['only_echo']`; visible to Fishball; not in the global list or an ordinary request; a call runs |
| ONLY-02 | ST on→off | unmount | dispose recorded; the tool is gone; a direct call is refused and never runs |
| ONLY-03 | ST off→on (Reject) | Reject unmounts | `{ok:false, code:'rejected', unchecked:['only_b_echo']}`; its last recorded event is dispose; off; tool absent |
| ONLY-04 | EP (patch edits another row) | refused | `{ok:false, code:'edits-other-rows'}`; no approval; its code never ran; off |
| LIM-01 | BVA (running 1, limit 2) | one below the limit | accepted; both run |
| LIM-02 | BVA (running 2, limit 2) | at the limit | fbtest-only-c refused `limit-reached`; no approval; its code never ran; off |
| LIM-03 | ST (limit lowered to 1 while 2 run) | lowering stops nothing | both still run, are on, and their tools are visible |
| LIM-04 | BVA (running 1, limit 1) | at the limit again | turning the other back on is refused `limit-reached`; not mounted |

### [plugins-http.test.mjs](plugins-http.test.mjs): R11

| id | technique | requirement | expected result |
|---|---|---|---|
| PHT-01 | EP | state includes catalog | 8 keys; catalog has the list_plugins keys and equals list_plugins' answer |
| PHT-02 | ST on→off by the user (Fishball idle) | applied at once; changedBy user; no approval | 200 `{ok:true,state}` showing the change; applied with no Fishball turn; changedBy user; tools absent from the next request (status plugin-off or unchecked, A22); no approval question |
| PHT-02b | ST on→off→on by the user (built-in with visible tools) | same | schedule_create absent from the request, status plugin-off or unlisted (A23); back after on |
| PHT-03 | ST off→on by the user | never asks, never allows | 200; changedBy user; unchecked tools stay unchecked and hidden; no approval |
| PHT-04 | ST (SSE) | frame after a plugin change | a frame whose catalog shows the change; frame has the 8 keys |
| PHT-05 ×3 | DT (unknown key / dsh-fishball / wrong case) | 409 unknown | `{ok:false, code:'unknown'}`; catalog unchanged |
| PHT-06 ×9 | DT (body) | 400 bad-body | invalid JSON, array, `{}`, missing on, on `"true"`, on 1, on null, missing plugin, plugin 1 |
| PHT-07 | ST (Fishball-only, user on) | mounted; tools wait for approval | 200; its code runs; its tool unchecked and absent from Fishball's request and the global list; no approval |
| PHT-08 | BVA (limit 1, running 1) | refused | 409 `{ok:false, code:'refused'}`; off; code never ran |
| PHT-09 | EP (edits other rows) | refused | 409 `refused` (A24); code never ran |
| PHT-10 | ST allowed→removed | remove an allowance | 200; allowedTools lacks the key and keeps the others; the tool becomes unchecked and leaves the next request; another allowed tool stays |
| PHT-11 ×5 | DT (remove body) | 400 / 409 | invalid JSON, array, `{}`, toolKey 1 → 400 bad-body; unknown key → 409 unknown; allowances unchanged |
| PHT-12 | EP (no cookie) | behind auth | both routes are not 200; catalog unchanged |

### [plugins-persist.test.mjs](plugins-persist.test.mjs): R10, R12

| id | technique | requirement | expected result |
|---|---|---|---|
| PER-01 | ST (choices → restart) | states, visibility and allowances survive | plugin, kind, on, changedBy, tool statuses and allowedTools keys are equal; Fishball's request has the same tools; the Fishball-only plugin runs again |
| PER-02 | EP | storage | fishball.json `tables` has plugins, tool_approvals and plugin_changes, each non-empty |
| PER-03 | BVA (auditEntriesKept 2, three changes) | audit retention | at most 2 plugin_changes rows, including the newest; the oldest of the three is gone |
| ADD-01 | DT (Reject) | nothing installed | one approval with toolName add_plugin whose reason contains the spec and the reason; `{ok:false, code:'rejected'}`; profile package.json byte-identical; nothing in node_modules |
| ADD-02 | DT (Allow once) | installed into Fishball's own folder (plugin statuses) | in `profiles/.fishball-plugins`; profile package.json byte-identical; listBundles unchanged; not in the global list or an ordinary request; listed fishball:fbtest-added, kind fishball-installed, on |
| ADD-03 | ST added→on (by add_plugin) | follows R6/R8 | its code runs; its tool in Fishball's next request only |
| ADD-04 | ST (restart) | plugin statuses | the Fishball-installed plugin is still listed, on and running |

### [plugins-review.test.mjs](plugins-review.test.mjs): post-review changes 1-13

Host A boots with extra flags. `FBTEST_REVIEW_BUNDLES=1` links the defective Fishball-only fixtures: `fbtest-broken` (its main file is missing), `fbtest-norows` (its patch inserts nothing), `fbtest-idinsert` (an entry with an id and an insert), `fbtest-dup` (two id-less rows naming one module), `fbtest-waits` (injects a service the worker provides on request) and `fbtest-leak` (provides a service of its own). `FBTEST_SPOOF_ROWS=1` adds host rows `fb-web--x` and `fbo-fbtest-only--x`, each registering one tool. `FBTEST_AGENT_SCOPE_TOOL=1` makes fbtest-tools register `agent_scope_echo` in every new agent's own scope. The approver can also throw, or answer from a queue.

| id | technique | change | expected result |
|---|---|---|---|
| CAT-02 (updated) | EP | 1, 3 | the plugin entry has 9 keys, `waiting` boolean; lastError null or one of the 7 codes |
| REV-01 | ST off→on→waiting→(service provided)→running | 1 | on, `waiting:true`, lastError null, code not run, assistant live; after the service is provided its code runs and `waiting` becomes false; all other entries `waiting:false` |
| REV-02 | EP (agent-scope tool) | 2 | Fishball's call is a tool error and never runs; an ordinary session runs it |
| REV-03 | EP (run_code inner call) | 2 | an unchecked tool called inside run_code never runs for Fishball (weak, A30) |
| REV-04 | EP (missing main file) | 3 | `row-failed` (A31); not applied; assistant and other plugins keep running |
| REV-05 | EP (no rows) | 3 | `no-rows` (A31); not applied |
| REV-06 | EP (id together with insert) | 4 | `{ok:false, code:'edits-other-rows'}`; no approval; code never ran; off |
| REV-07 | EP (two rows, same id) | 5 | `row-id-conflict` (A31); off; code never ran; another Fishball-only plugin keeps running; assistant live |
| REV-08 | EP (service of its own) | 3 | a documented end state (A33): running with lastError null, or off with `leaks-service` (observed: `leaks-service`) |
| REV-09 ×2 | EP (host row ids `fb-web--x`, `fbo-fbtest-only--x`) | 11 | the tool is `unchecked`, listed under neither builtin:web nor fbtest-only, while both are on; absent from Fishball's request; a direct call is refused; an ordinary session has it |
| REV-10 | ST (on and applied →on, same turn) | 6 | no approval; the tool stays in the same turn's next request and the next turn |
| REV-11 | ST (X off then Y on, one turn) | 7 | X's tools are in all 3 requests of that turn; gone next turn; Y's tool visible next turn |
| REV-12 ×2 | DT (answerer throws / unavailable) | 8 | `{ok:false, code:'rejected'}`; events `apply` then `dispose`; off; tool absent |
| REV-13 | BVA (limit 1) | 12 | three built-ins turn on while one Fishball-only runs at limit 1; another Fishball-only is refused `limit-reached`; with none running it is accepted although the three built-ins are on |
| REV-14 | EP | 10 | every plugin_changes and tool_approvals key matches `[A-Za-z0-9_-]+`, including after toggling an `@scope/name` plugin |
| REV-15 | DT (add rejected) | 9 | plugin_changes never contains the raw spec; the add entry's plugin is `spec:<16 hex>` or the bundle name |
| REV-16 | DT (install ok, enable refused by the limit) | 9 | dependency added; `{ok:false, installed:'fbtest-added-b'}`; no raw spec in the audit |
| REV-17a | ST (bundle installed and enabled through `pluginManager.installBundle` while DSH runs) | 13 | GET state's catalog lists it (kind profile, on, with its tool) within 10 s, with no other action |
| REV-17b | ST (same bundle) | 13 | list_plugins lists it; its tool is `unchecked` and hidden; an ordinary session has it; after Allow once it is visible |

### [plugins-review2.test.mjs](plugins-review2.test.mjs): second review round (R1-R4; R5 = REV-01, R6 = REV-17a)

Host D boots with `FBTEST_REVIEW_BUNDLES=1` and with `FBTEST_AGENT_SCOPE_SHADOW=demo_echo,schedule_list`, so fbtest-tools also registers those two names in every new agent's own scope. New fixtures: `fbtest-throws` (its apply starts its effect, then throws), `fbtest-import-throws` (its module throws on import, recording `import` first) and `fbtest-leak-b` (a second service-providing plugin). The approver can now hold a question open until the test releases it (`APPROVER_HOLDS`), which keeps Fishball inside a turn.

| id | technique | req | expected result |
|---|---|---|---|
| SHD-01 | EP (agent-scope copy of an allowed fixture tool) | R1 | the catalog shows demo_echo `visible`; Fishball's call is a tool error and no demo_echo body runs for Fishball |
| SHD-02 | EP (agent-scope copy of a built-in tool) | R1 | schedule_list: tool error; the agent-scope body never runs for Fishball |
| SHD-03 | EP (ordinary session) | R1 | both names run normally |
| SHD-04 | EP (control, unshadowed) | R1 | pwsh (allowed, not shadowed) still runs for Fishball |
| THR-01 ×2 | EP (apply throws / import throws) | R2 | the mount was attempted (`apply` or `import` recorded); the answer is `ok:false`; not applied; every apply has its dispose; assistant and built-ins keep running (observed lastError `row-failed`) |
| THR-02 ×2 | ST (later applies) | R2 | after two user toggles of another plugin and a Fishball turn, no new apply or import is recorded, and the plugin is still not applied |
| ATM-01 | ST (prompt held → user turns another Fishball-only on and lowers the limit → Allow once) | R3 | the answer is `ok:false`; GET state allowedTools equal to before; the plugin is off, not running, and its tool hidden |
| BRK-01 | ST (Fishball held in a turn; two leaking plugins toggled on by the user; one idle applies both) | R4 | both off with lastError `leaks-service`; each apply disposed; fbtest-only keeps running and stays visible; built-ins applied; assistant live |

REV-05 and REV-07 are tightened to the A31 answer: answer code `no-rows` / `row-id-conflict` with lastError null. REV-06 also asserts lastError null.

## P4 cases (context window, C1-C14)

**Harness additions.** The fake model now records each request's `model`, `maxTokens` and total message characters. It records each auxiliary call's purpose, `maxTokens` and final user message, and answers a `compaction` call with a summary text. One provider serves three models: `test-model` (window 128000, or `FBTEST_MODEL_WINDOW`, where `none` means no window), `test-model-b` (300000) and `test-model-nowin` (no window), each with `defaultMaxTokens` 4096. The worker can change a model's window and re-commit the adapter's routes, which publishes `llm/adapters-updated`. It can pick a model through `sessionController.selectModel` (the model picker's API), hold one conversation request open, and list a session's `compaction/*` events and auxiliary calls. Expected values come from the formulas in C2, C4 and C5 ([support/expect.mjs](support/expect.mjs)). `moveArtifacts` moved from lifecycle.test.mjs to support/expect.mjs so that P4 can reuse it.

### [context-window.test.mjs](context-window.test.mjs): C1-C4, C6-C9 through the HTTP API

| id | technique | req | expected result |
|---|---|---|---|
| CTX-01 | EP | C1 | GET state and the first SSE frame have `contextWindow` with exactly the 9 keys; each number field is null or a whole number; `error` is null or one of the 3 codes; `compactionOff` is a boolean |
| CTX-02 | EP (nothing set) | C2, C13 | modelWindow = effectiveWindow = 128000; the setting fields and outputCap are null; threshold = floor(min(W·0.8, W−4096−65536)) = 58368; pressureTokens is a positive integer after the setup turn |
| CTX-03 | EP | C2 | every Fishball request carries maxTokens 4096 (the adapter default) |
| CTX-04 ×20 | DT (body) | C3 | invalid JSON, array, string, number, null, `{}`, either key missing, 0, −1, a fraction, a string, a boolean, an array or an object as a value: 400 `bad-body`; state unchanged |
| CTX-05 ×13 | DT + BVA (accepted) | C3, C4, C6 | 200 `{ok:true,state}`; the answer and GET show the values and the derived fields. Rows: N 40000 (cap 5000, threshold 30000); 40000/10000; 40000/1; 24000; 127999 (W−1); 128000 (= W, acts as unset); 1e9; O alone at 1000, 1, 32000 (the update's example) and 49980 (the engine's largest); 200000 with O 1000; both null |
| CTX-06 ×16 | DT + BVA (refused) | C3, C7 (review update) | 409 with the code; state unchanged. `output-too-large`: 20000/30000; 40000/40000 (O = N); 4096/4096; O alone at 128000, 128001, 70000, 62464 (W−O−65536 = 0), 62463 and 49981 (the engine's largest + 1). `window-too-small`: 40000/39999 (O = N−1); N 1000, 5000 and 1; 1/1; 4095; 4095/1 |
| CTX-07 | BVA (bisection) | C7 | the smallest accepted N (O null) is accepted with the C4/C5 values; N−1 is `window-too-small`. **Observed: 6418** (A46) |
| CTX-07b | BVA (bisection, O alone) | C6, C7 (review update) | the largest O accepted alone equals the engine rule's: O < W, W−O−65536 > 0, and floor((W−O)·0.16) < threshold. That gives 49980; 49981 is `output-too-large` |
| PRE-01 ×5 | BVA + DT (no request measured yet: the first call is held before its request is prepared) | C7 (review update) | N 4095, 4095/1, 1, 1/1 and 8: `window-too-small` |
| PRE-02 | ST (N 6000 accepted early → prompt measured) | C7 (review update) | 200 or `window-too-small` early; after live a turn completes; the state is consistent (A49); saving 6000 again is refused |
| CTX-08 ×7 | ST unset → 24000 → clear → 40000/2000 → 200000 → 24000 → clear | C4, C6, C8 | Fishball's next request has maxTokens 4096, ≤3000, 4096, ≤2000, 4096, ≤3000, 4096; an ordinary session keeps 4096 throughout |
| CTX-09 | ST (SSE) | C1, C3 | a frame with the saved value follows a save |
| CTX-10 | EP (no cookie) | C3 | not 200; nothing changes |
| CTX-11 | EP (model with no window, nothing set) | C1 | modelWindow, effectiveWindow and threshold are null; error null |
| CTX-12 ×3 | DT (no window × N / O / both) | C7 | 409 `model-window-unknown`; state unchanged |
| CTX-13 | EP (no window, clear) | C8 | both null: 200 |
| CTX-14 | ST (24000/2000 –restart→) | C9 | same session; the values survive; the next request has maxTokens ≤2000 |
| CTX-16 | ST (recovery, save) | C3 | diagnostic (A40): a save while in recovery is accepted (200) |
| CTX-15 | ST (setting stored → recovery → adopt) | C9 | the new session's state is at defaults; its setup request and a later request carry 4096 |
| CTX-17 | DT (failed store × save) | C3 | 409 `unavailable`; `contextWindow` is null while failed (A41) |

### [context-compaction.test.mjs](context-compaction.test.mjs): C4, C5, C10-C14 in Fishball's session

| id | technique | req | expected result |
|---|---|---|---|
| CMPN-01 | BVA (pressure below / at threshold(N)) | C5 | N 40000 (threshold 30000) with turns of 40,000 characters (about 10k tokens): no compaction in a turn that ends more than 1000 tokens below the threshold; the session compacts no later than the first turn that starts at or above the threshold; this is below DSH's default threshold for the model (58368); every turn ends completed. Observed pressure: 3414 → 13431 → 23448 → 33465, then a compaction (23443). The compaction comes in the turn that starts above the threshold, not in the turn that crosses it (A50) |
| CMPN-02 | EP | C5 (review update) | each `compaction` call has maxTokens H = min(65536, N/8) = 5000; its final user message contains all 7 headings and "Keep the whole checkpoint under about 3750 words" (floor(H·0.75)) |
| CMPN-03 | EP | C13 | after the compaction, pressureTokens < threshold |
| CMPN-04 | EP (standard-preset session, same turns) | C5, C4 | no `compaction/*` event and no compaction call; its requests keep 4096 |
| CMPN-05 | EP | C4 | every Fishball request of the load has maxTokens ≤ outputCap |
| MOD-01 | ST (model a –pick b, turn→) | C10 | the request went to b; modelWindow and effectiveWindow 300000; threshold = DSH default for (300000, 4096); outputCap null |
| MOD-02 | ST (adapters-updated) | C10 | b's window becomes 200000 and the state follows without a turn |
| MOD-03 | DT (N 200000 between 128000 and 300000) | C6, C10 | on a: effective 128000, cap null; on b: effective 200000, cap 25000, request ≤25000; back on a: effective 128000, the stored value kept |
| MOD-04 | ST (the model's window disappears with N set) | C7, C10 | `error: model-window-unknown`, modelWindow null, the stored value kept; the next turn completes; when the window returns, error null and effective 40000 |
| MID-01 | ST (save while a request is held) | C14 | the save answers 200; the held turn ends completed; the next request has maxTokens ≤3000 |
| OVF-01 | EP (one 100,000-character message, N 24000, W_eff−O = 21000) | C12 | the turn ends completed with an assistant answer and a compaction; the message is logged in full (A44). Per the C12 update, whether it reached the model verbatim is only a diagnostic |
| OVF-03 | EP (oversized message, summary call answers no text) | C12 (review update) | the turn completes with an answer and no `compaction/summary`; the request carried the whole message; it is logged in full; the next turn completes |
| LKP-01 | ST (N 40000; lookups throw; adapters-updated announces window 60000) | C10 (review update) | a lookup was attempted; the state is unchanged (window 128000, cap 5000, threshold 30000, error null); a turn completes with maxTokens ≤5000 |
| LKP-02 | ST (lookups hang 15 s) | C10 (review update) | the same, during and after the hang |
| LKP-03 | ST (lookups work again) | C10 | modelWindow 60000, effective 40000, error null |
| BOOT-01 ×2 | ST (window 128000 → 200000 during boot, announced by adapters-updated: on adapter registration, or right after the first lookup answered 128000) | C15 | N 150000 was stored on the 128000 model, where it acts as unset; after boot the state shows effective 150000, cap 18750, threshold 112500, error null |
| BOOT-02 ×2 | ST (→ next idle → load of about 20k tokens per turn) | C15 | the session compacts at 112500, not at the stale 58368 (old policy) or 130368 (DSH default for 200000); caps ≤18750; summary maxTokens 18750 (A50) |
| OVF-02 | ST (next turn) | C13 | completed; pressureTokens < threshold (A43) |
| OFF-01 | ST (user turns builtin:compaction off, N set) | C11 | compactionOff true; the next request has maxTokens ≤3000 |
| OFF-02 | EP (100,000 characters above the threshold, compaction off) | C11 | no `compaction/*` event in that turn or the next; the turn completes |
| OFF-03 | DT (off × no smaller window; on × smaller window) | C11 | compactionOff false in both; true again with off and a smaller window |

## P5 cases (messaging, intake, outbox; M1-M14 and the review update)

**Harness additions.** The fake model records the last 60,000 characters of each request's message text (`texts`), so a test can tell which inputs a request carried. It can also answer by **marker**: a request from any session other than an excluded one, whose user messages contain a registered marker, takes that marker's next scripted answer. Tests use this to script subagents and sessions Fishball starts, whose ids they cannot know in advance; `markerState` reports which sessions took the answers. New worker operations: `agentStatus`, `createWorkspace`, `userMessages`, `defaultPreset`, `requestsContaining`, `header`, `allSessions` and `resume` (`sessionController.resolveAgent`, as opening a session in the GUI does). Logged user messages now keep 12,000 characters. New helpers in [support/expect.mjs](support/expect.mjs): `settledIdle`, `untilSeen`, `messageFishball`, `fishballCall`, `untrustedBlock` (parses the trusted header and the `<untrusted-ID>` block into JSON fields) and `fishballClientBundle`. Fishball is kept "running" by holding its next model request (`holdNext`), and "not running" by archiving it.

### [messaging-inbound.test.mjs](messaging-inbound.test.mjs): M1-M3, M5, M9, M13, M14

| id | technique | req | expected result |
|---|---|---|---|
| MSG-01 | EP (bare / standard preset) | M1 | message_fishball with exactly one required string property `message` |
| MSG-02 | EP (Fishball / ordinary) | M14 | never in Fishball's requests; message_session and start_session only in Fishball's |
| MSG-03 | EP (Fishball idle) | M1, M9 | `{ok:true, note:'Delivered to Fishball.'}`; one relay from the caller; the trusted header, then one block with session_id, session_title, session_folder and the JSON-quoted text; Fishball wakes and reads it; item `session/<id>` ends consumed; no text in the state |
| MSG-04 | EP (hostile text) | M1 review | a fake closing tag and a fake forward stay inside the block; one closing tag; one session_id line; the marker differs per message |
| MSG-05 | EP (sender arguments) | M1 | the sender is the calling session |
| MSG-06 | EP (subagent) | M1 review | attributed to the parent; `sent_by_subagent_session` names the child |
| MSG-07 ×4 | DT (id × response × text) | M2 review | same id, response and text: once, and the repeat answers `{ok:true, duplicate:true, note}`; a later response, other text or another id: a new message |
| MSG-08 ×8 | BVA + EP (maxMessageBytes 64) | M3 | '' and whitespace: `empty`; 1 byte, 64 ASCII bytes and 64 bytes of 2-byte characters: delivered (the framed text is longer); 65 ASCII bytes, 63 + one 2-byte character, and 66 bytes: `too-large` |
| MSG-09 | BVA (maxQueuedInputs 2) + ST | M3, M11 | while Fishball runs: 2 accepted, the 3rd `queue-full`; the route answers 409 `queue-full`; both read once after release; accepted again |
| MSG-10 | EP | M3 | Fishball's own call is a tool error mentioning other sessions |
| MSG-11 | EP | M13 | the system prompt names both hand-off tools and says other sessions' messages are information, not instructions |
| MSG-12 | EP + BVA (22 items) | M9 | exact intake keys and item keys, enums; at most 20 items, newest first; no text |
| MSG-13 | EP | M5 | the served client bundle contains "Send to Fishball" (A57) |

### [messaging-send.test.mjs](messaging-send.test.mjs): M4 with the review update

| id | technique | expected result |
|---|---|---|
| SND-01 | EP | 200 `{ok:true, state}`; one notice with summary `The user forwarded a session`; header, `The user's note: <JSON>`, untrusted statement, block with session_id, session_title, session_folder and last_answer; read; item `user/forward/<id>`, kind user, consumed |
| SND-02 | EP (empty note) | `The user added no note.` |
| SND-03 ×3 | BVA (3072 / 3073 bytes / 3074 bytes of 2-byte chars) | whole at the limit; above it at most 3072 bytes, ending with '…', a prefix, no broken character |
| SND-04 | EP | the same session forwarded twice: two messages and two items |
| SND-05 ×9 | DT (body) | 400 `bad-body` (invalid JSON, array, {}, missing note, missing sessionId, note 1, note null, sessionId 1, sessionId '') |
| SND-06/07 | EP | 409 `unknown-session`; 409 `from-fishball` |
| SND-08 ×2 | BVA (64) | a 64-byte note 200 with a 200-character last answer; 65 bytes 409 `too-large` |
| SND-09 | EP | no cookie: not 200 |
| SND-10 | EP | a hostile last answer stays in the block; the note is one JSON string |
| SND-11 | EP (store unreadable) | 409 `unavailable` |

### [messaging-outbound.test.mjs](messaging-outbound.test.mjs): M6-M8

| id | technique | expected result |
|---|---|---|
| OUT-01 | EP (live idle target) | `{ok:true, sessionId, title}`; one relay from Fishball's session, verbatim; the target runs; outbox `message`, `delivered`, digest, no text |
| OUT-02 | ST (cold → resumed) | resumed with its own preset (fbtest-bare tool set) and runs |
| OUT-03 ×7 | DT + BVA | `empty` ×2, `too-large` (65 bytes; 64 delivered), `is-fishball`, `unknown-session`, `archived`; none recorded |
| OUT-04 | EP (recorded preset gone, so resume fails) | `delivery-failed`; outbox `failed` with errorCode |
| OUT-05 | EP (absolute folder) | one new session there with DSH's default preset (`standard`); it has message_fishball and not Fishball's tools or persona; its first message is a relay from Fishball and it runs; no workspace registered; outbox `start` with folder |
| OUT-06 | EP (workspace id) | the session belongs to that workspace |
| OUT-06b | EP (workspace id, folder deleted) | `no-folder`; the folder is not created; nothing recorded |
| OUT-07 ×9 | DT (folder × message) | `no-folder` (missing (A51), '', a missing path that is never created, a file); `not-absolute` (relative; unknown non-path value, A52); `empty` ×2; `too-large`; nothing created or recorded |
| OUT-08 | EP | outbox entry keys and enums, newest first |
| CAP-01 | BVA (messagesPerHour 2) | the 3rd send: `hourly-cap`, not recorded, not delivered |
| CAP-02 | BVA (sessionsPerHour 1) | the 2nd start: `hourly-cap`, no session |
| CAP-03 | EP (0) | no cap |
| CAP-04 | BVA (auditEntriesKept 1 < cap 5, with 4 delivered this hour) | the 5th is delivered, the 6th refused |
| CAP-05 | BVA (21 sends) | the state lists 20, newest first |
| CAP-06 | BVA (auditEntriesKept 2) | at most 2 entries, including the newest |

Every `start_session` call in these tests passes a `title` now (`TITLE.plain`): OUT-05..07, CAP-02/03 and the start_session calls in the watch (NTF-02/06/08, T-06), own-plugin (OFW-03) and approval (APR-16) cases.

### [messaging-start-title.test.mjs](messaging-start-title.test.mjs): start_session names the session (R1-R7)

Three hosts: A has DSH's session-title service, B checks the order of the checks with `sessionsPerHour` 1, C boots without the service. A runs with `sessionsPerHour` 0.

| id | technique | req | expected result |
|---|---|---|---|
| SST-01 | EP (schema) | R1 | `folder`, `title`, `message` required strings; `notify_when_finished` optional boolean; the description matches /title/ |
| SST-01b | EP (schema) | R7 | message_session keeps `session_id`, `message` (required) and `notify_when_finished`; no title |
| SST-02 | ST created → renamed → steered → flushed | R3, R4 | rename once, with the live session of the new id and the title as given, before the one steer; the steer's source is `{kind:'agent-message', form:'relay', senderSessionId: Fishball}`; a flush after it; ok with `sessionId`, `folder`, `title`; the new session got the text verbatim once; outbox `start`, `delivered`, only the documented keys; DSH reports the title |
| SST-03 ×4 | EP + BVA (length) | R3 | rename gets the title exactly as given; the answer's `title` is what the snapshot returned (plain; whitespace collapsed and trimmed; non-ASCII; 300 characters cut at DSH's cap); DSH reports the same |
| SST-03b | ST | R3 | the title is the same after the new session's first turn |
| SST-03c ×3 | BVA | R2, R3 | one visible character, padded with spaces, padded with no-break and ideographic spaces: all accepted, title `x` |
| SST-03d ×3 | EP (visible text + invisible characters) | R2 (update), R3 | accepted; DSH strips the zero-width space, bidi marks, word joiner, control characters and escape sequences (`ab`, `Release plan`, `Report ready`) |
| SST-04 ×2 (+ control) | EP | R5 | rename throws the real `SessionTitleInvalidError` / a plain `Error`: ok, `titleError` `title-invalid` / `title-failed`, no `title` key, session and folder in the answer, rename once and before the steer, message delivered and recorded; a warning is logged for `title-failed`; a normal start logs none |
| SST-05 ×4 | DT (rename ok / invalid × flag) | R6 | the watch (`createdBy` assistant) or none, next to `title` or `titleError`; one notice after the first turn; delivered |
| SST-05b | ST (the first turn fails at once) | R6 | one notice, reason error |
| SST-06, 06b | EP (the first flush after the steer rejects / answers false) | R6 | ok, `unconfirmed: true`, `title` present, `folder`; steered once; outbox `unconfirmed` |
| SST-07 ×3 | DT (steer throws × rename ok / invalid / fails) | R6 (update) | `{ok:false, code:'delivery-failed', sessionId}` plus `title` or `titleError`, never `folder`; renamed once, before the steer; the session exists; outbox `failed` with `errorCode` |
| SST-08 | EP (live and cold target) | R7 | message_session never calls rename; titles unchanged. The failed-delivery refusal of message_session stays `{ok:false, code:'delivery-failed'}` (OUT-04's `deepEqual`) |
| ORD-01 ×3 | DT (message) | R2 | empty (empty, whitespace) and too-large win over a bad title and a missing folder |
| ORD-02 ×17 | EP (title) × DT | R2 (update) | `no-title` for `''`, spaces, line breaks and tabs, Unicode spaces, zero-width space, LRM, bidi overrides, word joiner + BOM, control characters, a CSI and an OSC escape sequence, whitespace around invisible characters (each checked to normalize to empty with DSH's `normalizeSessionTitle`); no title / number / null / array / object: `no-title` or a tool error (A51). A missing folder in every row. Nothing created or recorded |
| ORD-03 ×2 | DT (good title × folder) | R2 | `no-folder`, `not-absolute` |
| ORD-04 | ST (cap 1) | R2 | after every refusal above a valid start still succeeds: none was counted |
| ORD-05 ×5 | DT (cap spent × other checks) | R2 | `hourly-cap` before the folder; `no-title`, `empty`, `too-large` before the cap |
| UNA-01 | EP (no service) | R5 | ok, `titleError` `title-unavailable`, no `title`; delivered, recorded; no title set |
| UNA-02 | DT (no service × flag) | R6 | the watch next to `titleError`; one notice |
| UNA-03 ×2 | DT (no service × empty / invisible title) | R2 | `no-title`: the title is checked without the service |
| UNA-04 | EP (no service, steer throws) | R6 (update) | `delivery-failed`, `sessionId`, `titleError` `title-unavailable`, no `folder` |

### [messaging-durable.test.mjs](messaging-durable.test.mjs): M9-M11

| id | technique | expected result |
|---|---|---|
| WAK-01 | EP (input while running) | wakeupsThisHour unchanged; read by that turn |
| WAK-02 | EP (cap 0) | each of 3 inputs from idle wakes Fishball |
| WAK-03 | BVA (cap = count + 1) | that input still wakes; the next two are parked: `accepted`, queued 2, no model request for 3 s, Fishball idle |
| WAK-04 | ST (parked → chat turn) | that turn reads both; consumed, never discarded; queued 0 |
| WAK-05 | ST (parked → Send to Fishball) | the forward wakes Fishball at once; the same turn reads the parked inputs |
| DUR-01 | ST (accepted while running → restart) | delivered exactly once after the restart; consumed |
| DUR-02 | ST (archived → message → restart → unarchive + retry) | note starts `Queued for Fishball`; `pending`, still `pending` after the restart; delivered once when live; consumed |
| DUR-03 | EP | `storages/fishball_intake` has per-record files without message text |
| DUR-04 | ST (restart) | nothing already read is delivered again |
| ADO-01 | ST (accepted in the old inbox → session lost → adopt) | `discarded`; the new session never receives it |

### [messaging-unchecked.test.mjs](messaging-unchecked.test.mjs): M12

| id | technique | expected result |
|---|---|---|
| UNC-01 | ST (first live) | one notice listing every unchecked fbtest-tools tool with its plugin and set_plugin_enabled, and no hidden name; item `fishball/unchecked-tools`, kind system, consumed; read |
| UNC-02 | ST (restart) | no second notice |
| UNC-03 | ST (changed schema) | one new notice naming the tool |
| UNC-04 | ST (same changed schema again) | none |
| UNC-05 | ST (profile bundle installed and enabled while running) | a notice naming its tool and plugin |
| UNC-06 | ST (restart) | no notice repeats |

## P6 cases (watches; W1-W11 and the review changes)

**Harness additions.** The fake model can end a response with an error finish (`{fail: code}`, a code DSH's retry does not retry, so the turn ends `error`) or at the output ceiling (`{text, finish:'max-tokens'}`). New worker operations: `cancel` (the GUI's Stop: `aborted`), `rejectNextStep` (one `agent/pre-step` reject: `blocked`), `followup` (a queued turn that starts before the agent is idle), `flush` and `turnEnds`. The host handle can `kill()` DSH (SIGKILL, a crash), so the target's open turn is closed `interrupted` at resume. New helpers: `watchesNow`, `watchById`, `watchesOn`, `watchNotices` (Fishball notices naming a watch id) and `noticesSettled` (waits for n notices, then for quiet). Every notice count is taken after Fishball and the target are idle and a quiet period.

### [watches-http.test.mjs](watches-http.test.mjs): W1, W2, W9, W11

| id | technique | req | expected result |
|---|---|---|---|
| WCH-01 | EP | W1 | state and first SSE frame: `watches` {active, watches}; fresh home {0, []} |
| WCH-02 | EP | W1, W2 | 200 {ok, state}; the 10 keys; finished, once, createdBy {kind:'user'}, active, 0, null, null |
| WCH-03 | ST (same session while active) | W2 | no second watch |
| WCH-04 ×7 | DT (body) | W2 | 400 bad-body |
| WCH-05 ×3 | DT (target) | W2 | 409 unknown-session / is-fishball / archived |
| WCH-06/07 | BVA (limit 2: 1 accepted, 2 refused; limit 1) + ST (closed frees a place) | W2 | 409 limit-reached at the limit |
| WCH-08 | ST (active → closed → remove again) | W2 | 200 closed; then 409 unknown-watch; unknown id unknown-watch |
| WCH-09 ×5 | DT (remove body) | W2 | 400 bad-body |
| WCH-10 | ST (removed, target finishes) | W2 | no notice |
| WCH-11 | BVA (52) | W1, W11 | 50 listed; active first, each group newest first |
| WCH-12 | EP (no cookie) | W2 | not 200 |
| WCH-13 | ST (SSE) | W1 | a frame shows the new watch |
| WCH-14 | EP | W9 | bundle has 'Tell Fishball when finished', 'Watches', 'Remove', 'Watched session', 'Fishball is watching' |
| WCH-15 | EP (Fishball archived) | W2 | 409 unavailable |
| WCH-16 | EP (store unreadable) | W2 | 409 unavailable |
| WCH-17 | BVA (auditEntriesKept 3, 5 closed) | W11 | at most 3 closed, newest kept, oldest gone; the (oldest) active watch is listed first |
| WCH-18 | ST (target archived), observed | review | the watch stays active (A70) |

### [watches-fire.test.mjs](watches-fire.test.mjs): W3-W6, W8, W10

| id | technique | req | expected result |
|---|---|---|---|
| FIR-01 | EP (completed) | W3 | one notice: source {fishball-notice, notice, 'A watched session finished (completed)'}; text: finished, JSON reason, watch id, 'user'; block session_id/title/folder/last_answer; Fishball woke; closed, firedCount 1, lastReason, lastFiredAt |
| FIR-02 | ST (closed once, more turns) | W3 | no more notices |
| FIR-03 ×4 | EP (error / max-tokens / aborted / blocked) | W3 | one notice with that reason |
| FIR-04 | ST (turn + queued follow-up before idle; finished repeat) | W3 | one notice after it settles, with the final answer |
| FIR-05 | ST (per-turn repeat ×3) | W4 | 3 notices saying 'ended a turn'; active; firedCount 3 |
| FIR-06 | ST (per-turn, turn + follow-up) | W4 | 2 notices |
| TOL-01 | EP | W5 | the four tools only in Fishball's requests, not global |
| TOL-02 | EP (defaults) | W5 | finished, once, createdBy assistant |
| TOL-03 ×4 | DT | W5 | unknown-session, is-fishball, archived, limit-reached |
| TOL-04 | EP | W5 | list_watches equals the state |
| TOL-05 | ST | W5 | {ok, watchId, status:'closed'}; again unknown-watch |
| TOL-06 ×12 | DT (relation) | W5 + review | ok: watched now / before, messaged Fishball, forwarded, messaged by and started by Fishball; not-related or unknown-session for a topic, an intake identity, a forward identity, a watch id; not-related for unrelated; is-fishball; unknown-session for an unknown id |
| TOL-07 | BVA (20 turns, 1.5 KB each side) | W5 | ≤ 12 messages, roles user/assistant, ≤ 12288 text bytes, newest kept |
| TOL-07b | BVA (one 16 KB answer) | W5 | ≤ 12288 text bytes, no broken character |
| TOL-08 | EP (hostile answer) | W5 | one closing tag; one messages line |
| TOL-09 | ST (outbox entry pruned at auditEntriesKept 1) | W5 review | ok while kept, not-related after |
| NTF-01/02 | EP (message_session / start_session + flag) | W6 | watch createdBy assistant; one notice |
| NTF-03 | DT (flag × limit) | W6 | ok, watchError limit-reached, no watch, delivered |
| NTF-04 | EP (message_fishball + flag) | W6 | watch on the caller, createdBy {agent, caller}; one notice |
| NTF-05 | EP (subagent) | W6 | watch on the root; createdBy.id = the child |
| NTF-06 ×3 | EP (no flag) | W6 | no watch, no 'watch' key |
| NTF-07/08 | EP (fast turn: first call fails) | W3 review | one notice, reason error |
| QFL-02 | ST (queue full → finishes → idle) | W8 review | arrives once without a restart |
| QFL-03 | ST (per-turn, queue full, 3 turns) | W4 review | 3 notices, in order, each with its own answer |
| WKC-01 | EP | W10 | a waking notice counts one wake-up |
| WKC-02 | BVA (at the cap) + ST (chat turn) | W10 | parked; the next chat turn reads it |

### [watches-durable.test.mjs](watches-durable.test.mjs): W3 (interrupted), W7, W8

| id | technique | req | expected result |
|---|---|---|---|
| DWT-01 | ST (restart) | W7 | same watch; fires once after |
| DWT-02 | ST (archived → finishes → live) | W7 | one notice |
| DWT-03 | ST (per-turn; archived → turn → DSH restart → live → restart) | W7 | one notice, never two; firedCount 1 |
| DWT-04 | ST (per-turn; 2 turns while archived) | W7, re-review | 2 notices, in order, each with its own answer |
| DWT-05 | ST (target files deleted while DSH is down) | W7, re-review | target-missing; no notice |
| DWT-06 | ST (row off → 3 turns, last max-tokens → row on) | W7 review | ONE notice, last answer, lastReason max-tokens |
| DWT-06b | ST (Fishball archived, row running, 3 turns) | W7 review | one notice (which turn: diagnostic, A69) |
| INT-01 | ST (target turn open → SIGKILL → resume closes it interrupted) | W3 | no notice; active; firedCount 0 |
| QFL-01 | ST (queue full → finishes → release; restart if still missing) | W8 | exactly one notice later |

## P7 cases (ApprovalBroker; P1-P13 and the review update)

**Harness additions.** With `FBTEST_APPROVER_AFTER=1` the scripted answerer stands in for the browser prompt **after** the broker: fbtest-tools (mounted before dsh-fishball) prepends an `approval/request` listener at boot, so Fishball's broker, prepended later, runs first and its `next()` reaches the stand-in. Without the flag the worker's own listener answers first, as before. The root then also registers `fbtest_ask` for ordinary sessions: its body calls `ctx.approval.request` with its own call id (`nocall` omits it, `fakecall` names an id not in the log, `as` asks under another tool name) and records the outcome (`asks`). Fishball's model answers a request from its text through a **plan** (`planApproval`: the newest request message containing a needle is answered once with `answer_approval` and the id read from it). New worker operations: `asks`, `approvalEvents`, `setApprovalPolicy` (DSH's policy switch), `askInNewAgents` (switch every new agent to `ask`, see A76), `planApproval`, `planState`, `clearPlans`; `driveStart` takes a message `source`. Fixed: the logged `tool/result` summary read `message.callId`, but DSH names it `toolCallId`, so `callId` was always null (A86).

### [approvals-broker.test.mjs](approvals-broker.test.mjs): P1-P6, P8-P10, P13

| id | technique | req | expected result |
|---|---|---|---|
| APR-01 | EP (first request, no allowance) | P1 | one fishball-notice, summary `Permission request: "fbtest_ask"`; text starts `[permission request apr_<hex>]`; answer time 120 s; `Arguments: complete`; started by and turn by `the user`; the "expired is normal" line; the 9 block fields once each, with session_id, folder, tool, reason, the call's JSON arguments and the latest user message; no subagent or call_was_to_tool field; Fishball woke |
| APR-02 | EP | P1 | permission_mode = the session's sandbox mode (read-only after a switch); approval_policy "ask" |
| APR-03 | EP | P2 | answer_approval in every Fishball request only; not global; an ordinary session's call is a tool error |
| APR-04 | DT (allow, low, reason) | P2, P3 | `{ok:true, requestId, decision:'allow'}`; outcome allowed-once; exactly one approval/decided allowed-once for that call; the next answerer never asked |
| APR-05 ×4 | DT (allow+high, '' reason, whitespace reason, allow on truncated) | P2 | the code; the request stays pending and X waits; a later valid answer works |
| APR-06 ×2 | DT (unknown id, answered id) | P2 | `expired` (timed-out id in APR-08, withdrawn id in APR-10) |
| APR-07 | ST (escalate → stand-in holds → allows) | P4 | the stand-in is asked; X gets its outcome allowed-once; no Fishball request since; one non-waking note naming the outcome, in the next turn's request; audit escalate/high/allowed-once |
| APR-08 ×2 | BVA (approvalAnswerSeconds 2 and 1) | P5 | the header names n s; the stand-in is asked no earlier than n s − 150 ms and within n s + 2.5 s; its outcome stands; note "got no answer in time" in the next turn; a late answer is `expired`; audit timeout |
| APR-09 | ST (Fishball held in a turn when the request arrives) | P5, update | the stand-in is asked about 2 s after arrival while Fishball is still held |
| APR-10 | ST (cancel after Fishball idled) | P6 | cancelled; the stand-in not asked; note "was withdrawn" in the next turn; a later answer `expired`; audit withdrawn/cancelled |
| APR-11 | ST (cancel while Fishball is held, before it reads the notice) | P6 update | the same, without the note check |
| APR-12 | ST (cancel while the escalated request waits at the stand-in) | P6 update | cancelled; audit finalOutcome cancelled (answer is a diagnostic; observed `withdrawn`) |
| APR-13 ×4 | BVA (argumentExcerptBytes L, L+1, L−1, L−8; L = the arguments' JSON bytes, with 2-byte characters) | P1 | complete and whole at L and L+1; below: truncated, "alone makes it high risk", ends with …, a prefix of the JSON within the limit, no broken character; audit argumentsStatus |
| APR-14 ×3 | EP (no call id / id not in the log / call to another tool) | P1, update | unavailable with the high-risk line; no arguments shown; call_was_to_tool = the real tool only in the third (and summary names the asked tool); allow → `arguments-incomplete`, still pending |
| APR-15 ×3 | BVA (2048 / 2049 / 3000 bytes) | P1 | whole at 2048; above it at most 2048 bytes and a prefix |
| APR-16 ×5 | DT (provenance) | P1 update | relay from Fishball → user / Fishball (message_session); relay from another agent → user / another agent or a notice, and latest_user_message stays the user's; start_session → Fishball (start_session) / Fishball (message_session); a blank session whose first message is Fishball's relay → Fishball (start_session); a first message from another agent → "another agent or a notice" or "unknown", never "the user" |
| APR-17 | EP (subagent of a standard session, its policy switched to ask) | P1 update | session_id = the parent; asked_by_subagent_session = the child; the parent's latest user message; audited under the parent |
| APR-18 | EP (wakeupsPerHour = current count) | P1 | a message is parked (control); a request still wakes Fishball and is answered |
| APR-19 | EP (policy never) | P7 | rejected; no request message; stand-in not asked; not recorded |
| APR-20 | EP (stand-in throws) | P13 | unavailable; audited with finalOutcome unavailable |
| APR-21 | EP | P8 | approvals has pending and recent; a waiting request is pending with exactly id, sessionId, toolName, at; after it, recent entries have exactly the 10 keys with the enums, newest first; neither the state nor any audit file holds the arguments |
| APR-22 | BVA (21 requests) | P8 | 20 listed, newest first |
| APR-23 | BVA (auditEntriesKept 2, 3 requests) | P8 | at most 2 audit files, the newest among them |
| APR-24 | EP | P9; revision 11 §7a.7, Q-r11-reject-rubric | the rubric phrases (rules 1-5 word for word, now also rules 4 and 5) in Fishball's system prompt; "You cannot reject" absent; one line lets Fishball reject only when the call goes beyond what the user asked that session AND is dangerous (found by meaning: reject + beyond the request + dangerous) |
| APR-25 | EP | P10 | the client bundle has "Permission requests" |

### [approvals-routing.test.mjs](approvals-routing.test.mjs): P7 bypass and P12 (one host, in order)

| id | technique | req | expected result |
|---|---|---|---|
| RTE-01 ×2 | EP (set_plugin_enabled with unchecked tools, add_plugin) | P7a | the stand-in is asked for Fishball's session; no request message; not recorded |
| RTE-02 | BVA (maxPendingApprovals 2, 1 pending, Fishball held) | P7c | the second is pending and not at the stand-in (routed) |
| RTE-03 | BVA (2 pending = limit) | P7c | bypass: the stand-in within 1 s, no request message, not recorded; still 2 pending |
| RTE-04 | BVA (maxQueuedInputs 1, filled while Fishball is held) | P7d | bypass |
| RTE-05 | ST (2 waiting → Fishball archived) | P12 | both go to the stand-in within 5 s (observed ~50 ms); audit answer timeout, finalOutcome rejected |
| RTE-06 | EP (archived) | P7b | bypass |
| RTE-07 | ST (unarchive + retry → live) | P7b | requests reach Fishball again |

### [approvals-ptc.test.mjs](approvals-ptc.test.mjs): P11

| id | technique | req | expected result |
|---|---|---|---|
| PTA-01 | EP (PTC host, run_code calls fbtest_ask) | P11 | arguments = the inner call's JSON, complete; the inner call id has `:ptc:`; allow → allowed-once |

## P8 cases (ctx.fishball sources; X1-X10 and the review update)

**Harness additions.** With `FBTEST_SOURCES=1` the profile links three source fixtures, and the overlay adds one host row:
- [fbtest-source](support/fixtures/fbtest-source/index.js): enabled, with two rows on one module, `fbtest-source` (label src-a) and `fbtest-source-b` (src-b).
- [fbtest-source-static](support/fixtures/fbtest-source-static/index.js): enabled, with a static `inject: ['fishball']`.
- [fbtest-source-only](support/fixtures/fbtest-source-only/index.js): installed but off in the profile.
- The overlay row `fbtest-source-row` ([source-row.mjs](support/fixtures/source-row.mjs)), named by an absolute path. No catalog plugin owns it.

Each row records apply and dispose. It captures the context in which it gets the `fishball` service, so the worker can call `registerSource` *as that row* and keep each source under a key.

New worker operations: `sourceRegister`, `sourcePublish`, `sourceState` (`enabled` and the count of onEnabled calls), `sourceOffEnabled`, `sourceRow`, `fishballService`, `sourceRegisterRoot`, `sourceRegisterDetached`, `sourceRegisterStale`, `sourceBadListener`/`sourceBadCalls`, `settingsOf`/`settingsUpdateNs`.

`FBTEST_EXAMPLE=everyone|only` links the real example plugin from a folder in the home. That folder symlinks the example's `index.js`, `package.json` and README, and writes a bundle patch whose row config holds `FBTEST_EXAMPLE_NOTES`. The patch is rewritten at every boot, so a restart can carry a changed list of notes.

New helpers: `sourcesNow`, `sourceIn`, `pluginNotices`, `register`, `publish`. `STATE_KEYS` has 14 keys (`sources`).

### [sources-register.test.mjs](sources-register.test.mjs): X1-X3, X9, X10

| id | technique | req | expected result |
|---|---|---|---|
| SRC-01 | EP (ctx.inject / static inject / host row) | X1 | the root realm has `fishball` with registerSource; every fixture row gets it; a source has publish and onEnabled and a boolean `enabled` |
| SRC-02 ×15 | EP + BVA | X2 | ids `a`, `Z`, `0`, `a.b_c-d` and 64 characters are accepted; `''`, 65 characters, `.a`, `_a`, `-a`, `a b`, `a/b`, `é`, 1 and a missing id are FISHBALL_INVALID |
| SRC-03 ×7 | EP + BVA (bytes) | X2 | titles of 1 byte, 200 ASCII bytes and 200 bytes of 2-byte characters are accepted; `''`, missing, 201 bytes and 199 + one 2-byte character are FISHBALL_INVALID |
| SRC-04 ×5 | EP + BVA | X2 | a description that is absent, or exactly 1024 bytes (ASCII or 2-byte characters), is accepted; 1025 bytes and 1023 + one 2-byte character are FISHBALL_INVALID |
| SRC-05a-d | DT (caller) | X2, X3 | the same id twice from one row gives FISHBALL_SOURCE_DUPLICATE; from the bundle's other row, from another bundle and from a host row it is accepted, each with its own identity |
| SRC-06 | BVA (default 8) | X2 | the 8th source of a bundle is accepted, the 9th gives FISHBALL_LIMIT and is not listed |
| SRC-07 | BVA (limit n+2, two rows) | X2 | one more from each row is accepted; then FISHBALL_LIMIT from either row |
| SRC-08 | EP | X3 | identities are `fbtest-source/fbtest-source/<id>`, `fbtest-source/fbtest-source-b/<id>`, `fbtest-source-static/fbtest-source-static/<id>` and `<module>/fbtest-source-row/<id>` (A87) |
| SRC-09 | EP | X9 | `sources` = `{sources}`; each entry has exactly identity, plugin, title and enabled; plugin is a catalog key and the identity's bundle part, or null for the host row; identities are unique |
| SRC-10 | ST (SSE) | X9 | a frame shows a new source |
| SRC-11 | EP (root context) | §8 as built | FISHBALL_UNKNOWN_PLUGIN |
| SRC-12 | EP | X9 | the client bundle has "Plugin sources" and "Plugin event" |
| SRC-13 | EP (detached `registerSource`) | X10 (guide) | FISHBALL_UNKNOWN_PLUGIN |

### [sources-publish.test.mjs](sources-publish.test.mjs): X4-X6

| id | technique | req | expected result |
|---|---|---|---|
| PUB-01 | EP | X4, X5 | `{intakeId, status:'accepted'}`; ONE notice whose source is `{fishball-notice, notice, summary:'Plugin event: "<source title>"'}` (review update, A92); the header names the source title and identity, JSON-quoted; one block with source, title, occurred_at and body, once each; Fishball wakes; +1 wake-up; the item has kind `plugin` and the identity, and ends consumed |
| PUB-02 | EP | X5 | occurred_at is the given value |
| PUB-03 ×16 | DT + BVA | X4, X10 | the dedupeKey is missing, `''`, 257 bytes, or 255 bytes + one 2-byte character; the title is missing, `''`, blanks, or contains \n or \r (guide, A90); the body is missing, `''` or blanks; occurredAt has no offset, is not a date, is a date only, or is a number. Each gives FISHBALL_INVALID, and nothing is stored or delivered |
| PUB-04 ×4 | BVA | X4 | accepted: a 256-byte dedupeKey (ASCII, or mostly 2-byte characters); a 120-character title, which reaches the block whole and is not in the summary; occurredAt in the `Z` form |
| PUB-05 ×3 | BVA | X4 | a 121-character title, a body of maxMessageBytes + 1 bytes, and maxMessageBytes − 1 bytes + one 2-byte character: FISHBALL_TOO_LARGE, nothing stored |
| PUB-06 ×2 | BVA (maxMessageBytes 256) | X4 | a body of exactly 256 bytes (ASCII or 2-byte characters) is accepted and delivered whole |
| PUB-07 | EP (hostile) | X5 | a fake closing tag stays inside the block; one closing tag; one source line; nothing after the block |
| DED-01 | ST | X6 | the same key, also with another title and body: `duplicate` with the same intakeId; nothing delivered again |
| DED-02 ×2 | EP | X6 | the same key from another source, or another key from the same source: accepted with a new intakeId |
| QUE-01 | BVA (maxQueuedInputs 2, Fishball held) | X4 | 2 accepted, the 3rd FISHBALL_QUEUE_FULL; both read once; the refused event never arrives and is accepted once there is room |
| SUM-01 | BVA (200-character source title) | X5 review | the summary has at most 120 characters (observed: 119 + '…'), and apart from the '…' it is a prefix of the full summary |
| WKP-01 | BVA (cap reached) | X5 | parked: no request for 3 s; the next chat turn reads it |
| DED-03 | ST (restart, register again) | X6 | `duplicate` with the same intakeId; still one notice |

### [sources-enabled.test.mjs](sources-enabled.test.mjs): X2 (unload), X7

| id | technique | req | expected result |
|---|---|---|---|
| ENA-01 | EP | X7 | enabled, and listed enabled |
| ENA-02 | ST on → user off | X7 | `enabled` false for both rows; publish answers `{intakeId:null, status:'disabled'}`; nothing is stored or delivered; listed disabled; the code keeps running; a host row's source stays enabled |
| ENA-03 | ST (register while off) | X7 | it starts disabled |
| ENA-04 | ST off → user on | X7 | enabled; onEnabled once per source of the plugin and not for the host row; the key refused earlier is now accepted |
| ENA-05 | ST (set_plugin_enabled off, then on) | X7 | disabled after Fishball's turn, then enabled; onEnabled +1 |
| ENA-06 | EP | X7 | after the function onEnabled returned is called, the listener is not called again |
| ENA-07 | ST live → archived → live | X7 | every source disabled and listed disabled; publish `disabled`; once live they are enabled, onEnabled +1, and an event arrives |
| ENA-09 | EP (listener throws / rejects) | X7 review | not fatal: DSH and Fishball keep running, the other listeners run, publish works |
| ONL-01 | ST (Fishball-only, off) | X8 | its row never ran; no source |
| ONL-02 | ST off → on | X2, X3 | the row runs; identity `fbtest-source-only/fbtest-source-only/<id>` (the same as for everyone, A89); plugin = the bundle; accepted, delivered, kind `plugin` |
| ONL-03 | ST on → off | X2 | the row is disposed; the source leaves the state; publish gives FISHBALL_SOURCE_DISPOSED; enabled false |
| ONL-03b | EP (a kept service object after the unload) | X10 guide | FISHBALL_UNKNOWN_PLUGIN (A91) |
| ONL-04 | ST off → on | X2, X6 | the same id registers again; the earlier key is `duplicate` |
| ENA-08 | ST starting → live (first request held 6 s) | X7 | while starting: enabled false and publish `disabled`; once live: enabled, onEnabled once |

### [sources-example.test.mjs](sources-example.test.mjs): X8 (R5)

| id | technique | req | expected result |
|---|---|---|---|
| EXA-01 | ST (first boot; the plugin loads before Fishball is live) | X8, X5 | each of 3 notes arrives exactly once and is read; summary `Plugin event: "Example notes"`; identity `fishball-source-example/fishball-source-example/notes`; items kind `plugin`, consumed; listed `{identity, plugin:'fishball-source-example', title:'Example notes', enabled:true}` |
| EXA-02 | ST (restart) | X6, X8 | nothing twice |
| EXA-03 | ST (user off for Fishball; restart with a 4th note) | X7, X8 | its code keeps running: the source is registered again after the restart and listed disabled; the 4th note is neither stored nor delivered |
| EXA-04 | ST off → on | X7, X8 | onEnabled makes it republish: the 4th note arrives once, and the others are not delivered again |
| EXO-01 | ST (installed, off) | X8 | its code never ran: no source, nothing arrives; catalog `fishball-only`, off |
| EXO-02 | ST off → on for Fishball | X8 | each note arrives once |
| EXO-03 | ST on → off; restart with a 4th note | X8 | the source is removed; after the restart it is still not running, and the 4th note does not arrive |
| EXO-04 | ST off → on | X8 | the 4th note arrives once; nothing twice |

### Cases changed by the brand icon feature

- **HTP-01, HTP-04/05, PHT-01, PHT-04, SND-01**: 16 state keys (`preferences`, from `STATE_KEYS`). HTP-01 also checks that `preferences` is exactly `{brandStyle}`, `'fishball'` by default (implementer's contract, DESIGN §9/§10 1b). POST /api/fishball/brand is not covered here.

### Cases changed by P8

- **HTP-01, HTP-04/05, PHT-01, PHT-04, SND-01**: 14 state keys (`sources`), from `STATE_KEYS`.

### Cases changed by P7

- **HTP-01, HTP-04/05, PHT-01, PHT-04, SND-01**: 13 state keys (`approvals`), from `STATE_KEYS`.

### Cases changed by P6

- **HTP-01, HTP-04/05, PHT-01, PHT-04, SND-01**: 12 state keys (`watches`), from `STATE_KEYS`.
- **MSG-01**: message_fishball has `message` (required string) and `notify_when_finished` (optional boolean).

### Cases changed by P5

- **HTP-01, HTP-04/05, PHT-01, PHT-04**: 11 state keys (`intake`, `outbox`), from `STATE_KEYS` in constants.
- **HTP-02, CAT-15**: hiddenTools also lists `message_fishball` (`STATE_HIDDEN_TOOLS`). The fixture-name list `HIDDEN_TOOLS` is unchanged, because fbtest-tools never registers message_fishball.
- **SGL-10, SGL-11, SGL-14, SGL-15**: count setup notices and turns. Exactly one `Fishball is set up` notice, in the first turn; at most one other Fishball notice (the unchecked-tools notice); model requests = 1 + other notices. A restart adds no setup notice and no second unchecked-tools notice. SGL-10 and SGL-15 read the log 1.5 s after live, because the notice can arrive just after.

### P3 cases changed by P4

- **HTP-01, HTP-04/05, PHT-01, PHT-04**: 9 state keys (with `contextWindow`).

### P2 cases changed by P3 (requirement changes from the implementer, not regressions)

- **PKG-02**: the patch inserts `fishball-attribution` (module `dsh-fishball/attribution`) and then `fishball`; package exports has `./attribution`.
- **HTP-01**: 8 state keys (with `catalog`), and the catalog is not null while live. **FAIL-01..03** also assert `catalog: null` while the store is unreadable.
- **HTP-04/05**: the first frame equals GET state apart from `catalog`, because tool changes can emit frames at any time. A frame with the changed limit must still arrive.
- **CMP-03..09, PTC-01/02, FW-03/05**: the fixture tools are allowed first (see "Making fixture tools visible"). **CMP-03a** (new) records that they are hidden before allowance. **CMP-08**: late tools are registered as the fbtest-tools plugin. The late ordinary tool is `unchecked` until allowed, and visible after.

## Ambiguities (tests follow the most literal reading)

- **A1. Role wording.** The brief says the prompt states that Fishball "does no work". The approved role text in DESIGN.md §7 is second person: "You do no work yourself." CMP-01 accepts "does no work" or "do no work".
- **A2. `run_code` cannot be a fixture.** DSH reserves the name `run_code`; registering it throws. FW-06 therefore asserts only a tool error and no `approval/asked`. That also holds when `run_code` is simply not visible to Fishball, so the `run_code` rows of the shell decision table are not proven. The read-only "reaches the tool" row is untested for `run_code`.
- **A3. "Includes output".** Any present `output` key counts, whatever its value. Tested with a path string.
- **A4. "Includes sandbox_permissions".** Any present key counts, including `""` and a value equal to the current mode (FW-04).
- **A5. Status before live.** Only "live after the setup turn ended" is specified. SGL-13 accepts any documented status other than `live` while the setup request is held. If the HTTP API is unreachable during that window, the case reports "inconclusive" as a diagnostic instead of failing.
- **A6. `retry` while live.** Only `adopt` is specified to give 409 while live. HTP-08 treats `retry` while live as a successful request: 200 `{ok:true, state}`, same session, still live.
- **A7. Unknown or malformed bodies.** A JSON array, a missing action, a wrong-case action and a non-string action all count as a malformed body or unknown action, so 400 `bad-body`.
- **A8. "Persisted session is gone".** Simulated by moving the session's JSONL directory and projection-cache file out of `DSH_HOME` while DSH is stopped. A retry after moving them back is expected to resume, because DSH's JSONL store looks sessions up on disk at every open.
- **A9. "Workflow" tools.** The brief lists the single name `workflow`; DESIGN.md says "workflow tools". Only `workflow` is tested.
- **A10. Ordinary-session comparisons.** FW-07 and CMP-02 use the `fbtest-bare` preset (no tools of its own), because the standard preset registers its own `bash`, `write` and `edit`, which would shadow the fixtures. ISO-01 also checks a standard-preset session by tool name and persona.
- **A11. Rejection of invalid limits.** "Rejected (throws)" is read as `ctx.settings.update` rejecting. String values such as `"5"` count as invalid even when numeric.
- **A12. Hourly caps at 0.** Only acceptance and display of 0 are tested here. The meaning "no cap" belongs to later phases, which use these caps.

- **A13. A usable agent after resume (SGL-16).** The brief requires "the same session id is resumed" and "the agent is live". SGL-16 reads "live" as "can run a turn": a steered message must reach the model and the turn must end `completed`.
- **A14. Arranging a "blank" session (SGL-15).** The test boots the home once with the plugin installed but not selected, and creates a session through `ctx.agents.create` in `<DSH_HOME>/fishball/assistant` with agentPreset `fishball:assistant`, without a turn. It then writes `$DSH_HOME/storages/fishball.json` naming it, in the layout DESIGN.md §9 gives for the `global` record (`{sessionId, workspaceId, cwd, createdAt}`, domain version 1). If the store layout differs from §9, this case tests the unreadable-store path instead and says so in its failure.
- **A15. Unreadable store (FAIL-01..03).** The store file is `$DSH_HOME/storages/fishball.json` (S8). Three partitions: malformed JSON, a future `unit.version`, and a `global` record of the wrong types. All are expected to give `failed` with `store-unreadable`. The `compose-failed` code is not provoked, because that needs a fault inside the plugin's own composition.
- **A16. 409 while failed.** Both retry and adopt answer 409 `unavailable` while the store is unreadable. The brief names both actions.
- **A17. PTC mode.** "Presented natively" is checked as: Fishball's request lists its visible tools by name. Whether `run_code` is also listed for Fishball is not asserted.

- **A18. "Exactly one approval request".** Counted as the questions the prepended `approval/request` answerer sees for Fishball's session during that call. A browser prompt is not exercised: the scripted answer stands in for the person's click.
- **A19. Reason format.** "lists each unchecked tool as `- name: first description line`" is checked as a substring per tool. Nothing else about the reason is asserted, except that a second description line never appears.
- **A20. When a change "applies".** Observed as the next turn's model request. `settle` waits until every catalog entry reports `applied === on`; this is how the implementation reports it (an off plugin reports `applied:false`). The meaning of `applied` is not specified. Each assertion is on the request itself, so a different meaning would show up as a request failure, not a false pass.
- **A21. Which bundles the catalog lists.** Read as profile dependencies plus DSH-optional bundles (`listBundles` `installed` or `optional`), minus dsh-fishball. The installation's surface bundles (dsh-base, dsh-web-app), which are neither, must not appear.
- **A22. Unchecked tools of an off plugin.** Both "unchecked" and "plugin-off" apply. PHT-02 accepts either; the implementation reports `unchecked`. TOG-05 turns the plugin off after its tools were allowed, where only `plugin-off` fits, and asserts `plugin-off`.
- **A23. Tools of an off built-in.** A built-in that is off is not mounted, so its tools may be unlisted rather than `plugin-off`. PHT-02b accepts either.
- **A24. Refusal code of the settings route.** R11 names only `unknown` and `refused` for 409. A bundle that edits other rows, when the user turns it on, is expected as 409 `refused`, the same as the limit.
- **A25. Precedence of the limit and edits-other-rows.** When a candidate would be refused for both reasons, the order is unspecified. The DSH-optional bundles in this installation edit other rows and answer `edits-other-rows` at the limit. LIM-02 therefore uses a clean fixture (fbtest-only-c).
- **A26. Allow once for a plugin with several unchecked tools.** One answer allows all the listed tools. A per-tool choice is not offered by DSH's prompt.
- **A27. add_plugin spec.** A local directory given as an absolute path (DSH's plugin manager refuses relative paths). The tests do not check that `add_plugin` turns the plugin on by itself: R12 says Fishball "then follows R6/R8", which ADD-03 does with an explicit `set_plugin_enabled`.
- **A28. Audit retention.** Checked on the stored table after three user toggles, with auditEntriesKept 2. The test identifies entries by the plugin key appearing anywhere in the stored row, not by a field name.

- **A29. "Waiting" fixture.** A host service that is still starting is simulated by a service nobody provides until the test provides it from the root context. REV-01 expects the plugin to stop waiting and run within 5 s of that.
- **A30. run_code inner calls.** DSH reserves `run_code`, and Fishball's tools are presented natively (PTC-01), so `run_code` may simply be unavailable to Fishball. REV-03 checks only that the inner tool never runs. That also holds when `run_code` itself is refused, so it does not prove a per-call check inside a working `run_code`.
- **A31. Where a refusal code appears (answered).** A refusal before anything is mounted (`no-rows`, `edits-other-rows`, `row-id-conflict` found while reading rows) is returned in the answer and leaves lastError null. lastError is set only when a plugin that was on or mounted is turned off. REV-05/06/07 assert exactly that. REV-04 (missing main file) still accepts the code in either field, because whether its failure happens before or after mounting is not observable.
- **A32. Agent-scope tool status.** Change 2 says such a tool "appears nowhere in list_plugins". Observed: it is offered in Fishball's request (it is in the agent's own scope, which restrict cannot mask), it has no catalog status, and the guard refuses it. REV-02 asserts the refusal only.
- **A33. Leaking a service.** Whether a row that provides its own service is a leak is the plugin's audit to decide. REV-08 accepts running with lastError null, or off with `leaks-service`. Observed: `leaks-service`.
- **A34. "Picks it up without an unrelated change".** Read as: GET state shows the new bundle with no Fishball turn and no toggle (REV-17a). Observed: GET state does not list `fbtest-added-c` within 10 s of a live install, although its tool is already global. The next `list_plugins` call does list it, and that is what REV-17b checks.

- **A35. "Mounting for listing throws".** This is driven by two fixtures: a plugin whose apply throws after its effect has started, and a module that throws on import. Both end with lastError `row-failed`. The requirement does not name a code, so THR-01 does not assert one. "A later apply" means: two user toggles of builtin:ask-user, each applied while Fishball is idle, and one Fishball turn.
- **A36. Shadowing fixture and the run_code exemption.** The same-name tool is registered by fbtest-tools on `agent/created` through `agent.ctx.tools`, for every agent. SHD-01 cannot tell which definition the refusal blocked. It asserts that no recorded fixture body ran for Fishball, and both definitions record the same name. The `run_code` exemption is not tested: `run_code` cannot be a fixture (A2), and Fishball has no working `run_code` (A30).
- **A37. Racing the enable (ATM-01).** "Refused between the prompt and the write" is produced by holding the prompt open. Meanwhile a user toggle turns a second Fishball-only plugin on, and the limit is lowered to 1. Allow once is then given. Observed: the racing toggle answers 200, and the enable answers `ok:false`.
- **A38. "The second only fails after the first is removed" (BRK-01).** Black-box, the order in which one apply detects failures cannot be controlled. BRK-01 applies two independently failing plugins (each provides its own service) at one idle and checks the end state required: both off with lastError set, and everything else running. It does not prove that the second failure was found only after the first plugin was removed.

- **A39. Threshold when maxOutputTokens is set alone (C6).** C2 defines R as "the request's reply cap", so with O set and no smaller window the expected threshold is floor(min(W·0.8, W−O−65536)), using O as R. Observed so.
- **A40. Saving while in recovery.** C3 says "before the assistant session exists → 409 unavailable". In `recovery` a session record exists, but its session cannot be resumed. Observed: the save answers 200 and is stored for the old session id, and `contextWindow` shows the old session's value (pressureTokens null). CTX-16 records this as a diagnostic and accepts 200 or 409 `unavailable`. Please confirm which is intended.
- **A41. State while no session exists.** C1 does not say what `contextWindow` is while `failed`. Observed: `null`. CTX-17 accepts null or the full shape.
- **A42. Driving a model change (C10).** The model is picked through `sessionController.selectModel`, the API behind DSH's model picker; this also saves DSH's default model. `llm/adapters-updated` is produced by re-committing the fake adapter's routes after changing a model's window. A model that loses its window while a value is set (MOD-04) is read as `error: model-window-unknown`, keeping the stored value; turns keep completing.
- **A43. Pressure after an overflow compaction (C13).** Right after the OVF-01 turn, pressureTokens was 28425, above the threshold 18000. The oversized user message is the latest message, so it stays in the retained tail. C13 is therefore checked after the next turn (OVF-02), where it holds. Whether "after a compaction it is below the threshold" should also hold right after an overflow turn needs a decision.
- **A44. Which mechanism handled the oversized message.** With N 24000, a 25k-token message is also above the pressure threshold, so step-pressure compaction or the synthetic overflow (C12) could each produce the compaction. Black-box, the two cannot be told apart. OVF-01 checks only the required outcome.
- **A45. Refusal code for a large maxOutputTokens alone (answered).** The review update says O alone is refused `output-too-large` exactly when DSH's engine would refuse it. CTX-07b now asserts that the boundary equals the engine rule (49980 accepted, 49981 refused) and that the code is `output-too-large`.
- **A46. Boundaries depend on the prompt.** The smallest accepted N (6418) and the largest O accepted alone (49980) depend on the size of Fishball's system prompt and tools in this test profile, about 3,400 tokens. Tests find them by bisection and assert only that the neighbouring values are accepted and refused. "Noticeably earlier" (C5) is read as: below DSH's default threshold for the model.
- **A47. Unknown extra keys in the body.** C3 lists what is bad; an extra key is not mentioned. Observed: `{contextWindowTokens:40000, maxOutputTokens:null, extra:1}` is accepted. Not asserted.
- **A48. "Other sessions' requests are unchanged" (C4).** Checked as: a session of the `fbtest-bare` preset (CTX-08) and of the standard preset (CMPN-04) keep maxTokens 4096. A standard-preset session runs DSH's own compaction at threshold 58368, which the CMPN load (about 33k tokens) stays below.

- **A49. A window accepted before the prompt is measured.** Per the update, only N < 4096 and zero caps are refused before any request has been measured. A window that fits the 4096 floor but not the real prompt (N 6000) is accepted early: 200, state effective 6000. Once the setup request has measured the prompt (about 3.4k tokens), the state shows `error: window-too-small`, effectiveWindow 128000, outputCap and threshold null, and requests carry 4096 with no smaller-window cap. The stored value is kept. PRE-02 accepts this end state, or a cap-consistent one. Whether a stored value that turns out too small should fall back to the full window this way needs confirming.
- **A50. When the compaction runs.** Observed in every load: the session compacts in the first turn that *starts* at or above the threshold. The turn whose new message takes it across the threshold does not compact. C5 says "once its measured request size reaches the threshold", and the measured size between turns is the previous request's. The tests assert the observed rule and allow up to one load turn of slack. C15's boot-flip fake changes the window at two moments (adapter registration, right after the first lookup); whether a remount was actually in progress at that moment cannot be observed black-box.

### [unread.test.mjs](unread.test.mjs): Unread replies from Fishball (R1-R8)

Replies are made by the scripted model in Fishball's own session (`drive`); `nReplies(n)` scripts n assistant messages (n-1 with text plus a tool call, then a closing text). Persistence cases edit `storages/fishball.json` while DSH is stopped. Fishball's setup turn already makes replies, so every case first reads (`resetUnread`) to start from 0, except UNR-02. "Stable" means the count is checked again 400 ms after it first matches.

| id | technique | requirement | expected result |
|---|---|---|---|
| UNR-01 | EP | R1 | state and every SSE frame have `unread` with exactly the key `count`, a non-negative integer |
| UNR-02 | EP (oracle) | R2 | in a fresh home count = number of non-blank assistant messages in Fishball's log |
| UNR-03 ×4 | BVA (1, 2, 3, 5 replies in one turn) | R2 | count = n |
| UNR-04 ×10 | DT (content × delta) | R2, R3 | non-empty text (also " a ", text + tool call, blank block + text, two text blocks in one message): +1; tool call only, '', ' ', '\n\t  \n', blank text + tool call: +0 |
| UNR-05 | EP (user message, turn events) | R3 | a non-empty user message and turn events with a blank answer add 0 |
| UNR-06 | EP (other sessions) | R3 | replies in a bare session, a standard session and a subagent add 0 |
| UNR-07 | EP (real flow) | R2 | another session's message_fishball wakes Fishball; its one reply adds 1 |
| UNR-10 | EP (body {}) | R4 | 200 `{ok:true,state}`, count 0 in the answer and in GET state |
| UNR-11 ×2 | EP (other objects) | R4 | `{extra:1}` and `{count:5}` give 200 and 0 |
| UNR-12 ×8 | DT (body kind) | R4 | malformed, empty, `[]`, `[{}]`, string, number, null, true: 400 `{ok:false,code:'bad-body'}`; count unchanged |
| UNR-13 | ST (0 –read→ 0) | R4 | 200, state count 0, no new SSE frame in 1.5 s |
| UNR-14 | ST (n –read→ 0 –reply→ 1) | R4 | replies after a read count from 0 |
| UNR-15 | EP (no cookie) | R4 | not 200; count unchanged |
| UNR-20 | ST (SSE, 3 replies) | R7 | frames show 0,1,2,3 in order |
| UNR-21 | ST (SSE, read) | R7 | frames show 2,0 |
| UNR-22 | ST (reply, read ×5) | R7 | frames show 0,1,0,1,0,1,0,1,0,1,0: nothing lost or double counted |
| UNR-23 | ST (3 replies, read, 1 reply) | R7 | frames show 0,1,2,3,0,1; final 1 |
| UNR-30 | ST (restart) | R5 | count 3 survives; stored record has exactly sessionId, count, changedAt (date string), sessionId = Fishball's |
| UNR-31 | ST (read, restart) | R5 | 0 after restart; stored record, if any, says 0 |
| UNR-32 ×9 | BVA (stored 0, 1, 2, 98, 99, 100, 101, 1000000, MAX_SAFE_INTEGER) | R1, R5 | state, first SSE frame and the stable count show the stored number |
| UNR-33 ×2 | BVA (99 → 100, 100 → 101) | R2, R5 | one reply adds exactly 1 |
| UNR-34 | EP (no record) | R5, R6 | 0 |
| UNR-35 | EP (record of another session) | R6 | 0; later replies count (2) and survive a restart |
| UNR-36 | EP (record with count 0) | R5 | 0; a reply gives 1 |
| UNR-40 | ST (recovery –retry→ same session) | R1, R5, R6 | recovery state still has a valid `unread`; after retry the count 7 is kept |
| UNR-41 | ST (recovery –adopt→ new session) | R6 | count equals the new session's own replies (not the old 7); +2 replies counted; survives a restart |
| UNR-50 | EP (client bundle) | R8 | served bundle contains `data-fishball-badge`, `Open Fishball` and `prefers-reduced-motion` |

- **A96. R8 browser half is not driven.** The harness has no browser, so these are manual cases: (1) count 0 shows no pill and no wag class; (2) 1, 2, 98, 99 show that number; 100 and a large value (e.g. 1000000) show "99+"; (3) the pill is `[data-fishball-badge]` on the brand mark, with the wag class only when count > 0; (4) aria-label "Open Fishball, N unread" for N>0 (also N=1) and "Open Fishball" for 0; (5) with prefers-reduced-motion the animation is none and the pill stays; (6) Fishball's session in a visible tab with count > 0 sends POST /api/fishball/read; a hidden tab or another session's tab does not; (7) the POST is not repeated at count 0. The bundle is minified/bundled by DSH and does not contain the literal "99+" nor the route path, so UNR-50 checks only the three strings above.
- **A97. UNR-02.** The setup turn's replies are counted at first start (observed 2, matches the log). The requirements do not say whether the first-start setup reply should count; UNR-02 asserts only count = replies in the log.
- **A98. "Publishes nothing new" (R4).** UNR-13 checks no SSE frame in 1.5 s after a read at 0.
- **A99. Subagent case (UNR-06).** A subagent is a separate session, so its replies are excluded; its parent's own reply is made in an ordinary session, also excluded.
- **A100. Stored count validity.** R5 does not say what a stored negative, fractional or non-numeric count does; not tested. MAX_SAFE_INTEGER is accepted as stored.
- **A101. Stale/failed states.** R1 says unread is in every snapshot; only live and recovery are checked (UNR-01, UNR-40). Failed/archived are not asserted (STATE_KEYS now includes `unread`, so HTP-01 checks the key set).

## Plugin statuses cases (three statuses; DSH plugins default off in Fishball)

**Requirement summary.** A catalog entry has `status` (`installed-in-fishball`, `dsh-enabled`, `dsh-disabled`, `builtin`), `actions` (in order) and `removing`. Kinds: `profile`, `fishball-only`, `builtin` and `fishball-installed` (key `fishball:<name>`). Every case uses this decision table (`expectedStatus` and `expectedActions` in [support/expect.mjs](support/expect.mjs)):

| kind | on | removing | status | actions |
|---|---|---|---|---|
| builtin | true / false | false | builtin | [disable] / [enable] |
| profile or fishball-only | true | false | dsh-enabled | [disable] |
| profile or fishball-only | false | false | dsh-disabled | [enable] |
| fishball-installed | true / false | false | installed-in-fishball | [disable, uninstall] / [enable, uninstall] |
| fishball-installed | any | true | installed-in-fishball | [] (implementer's clarification) |

Defaults decision table (install × when the DSH plugin appeared × enabled in the profile × stored choice):

| install | DSH plugin appeared | profile | stored choice | on in Fishball | case |
|---|---|---|---|---|---|
| new | before the first start | enabled / disabled / DSH-optional | none | off | DEF-01, DEF-02 |
| new | any | any | user on | on, survives a restart | DEF-05 |
| new | installed while running | enabled / disabled | none | off | DEF-06, DEF-07 |
| new | installed while DSH was down | enabled | none | off | DEF-08 |
| new | removed, then installed again | enabled | was on | off, changedBy null | DEF-09 |
| existing | present at the upgrade | enabled | none | on | UPG-01 |
| existing | present at the upgrade | disabled | none | off | UPG-02 |
| existing | present at the upgrade | enabled | off | off | UPG-03 |
| existing | present at the upgrade | disabled | on | on | UPG-04 |
| existing | installed after the upgrade (while running / while down) | enabled | none | off | UPG-06, UPG-08 |
| existing | present at the upgrade, removed, then installed again | enabled | none (was on) | off | UPG-09 |

**Harness additions.** The worker re-points the profile's `dsh-fishball` link on every boot (`FBTEST_PLUGIN_DIR`, default the repo root). One home can therefore boot the previous version (commit f368ad2, extracted with `git archive` under `.runtime/`; no worktree, branch or tag is touched) and then this one. `FBTEST_LINK` links more bundles on a later boot (installed while DSH was down). New worker operation `removeBundle` (DSH's plugin manager). New fixture [fbtest-notbundle](support/fixtures/fbtest-notbundle/package.json): a package with no bundle patch. Fishball's own folder is `<DSH_HOME>/profiles/.fishball-plugins` (implementer's answer). `inFishballFolder` checks its node_modules and package.json; `profileSnapshot` checks the profile's package.json, cordis.patch.yml and lockfile.

### [plugins-status.test.mjs](plugins-status.test.mjs): statuses, actions, add and remove, the two new routes

| id | technique | expected result |
|---|---|---|
| STA-01 | EP | every entry in list_plugins, GET state and the first SSE frame has the 12 keys and follows the decision table; removing false |
| STA-02 ×9 | DT (kind × on, at defaults) | the 7 built-ins keep their defaults, status builtin, [disable] or [enable]; fbtest-tools (profile) and fbtest-only (fishball-only) are off, dsh-disabled, [enable] |
| STA-03 | ST dsh-disabled → dsh-enabled → dsh-disabled | user on, then set_plugin_enabled off; actions follow; no prompt; profile files and listBundles flags unchanged; an ordinary session keeps the tools |
| STA-04 ×12 | DT (remove route × entry) | DSH plugin on or off, built-in on or off: 409 refused; unknown key, `fishball:<unknown>`, dsh-fishball: 409 unknown; invalid JSON, array, {}, plugin 1, plugin null: 400 bad-body; nothing changes |
| STA-05 ×5 | DT (remove_plugin × entry) | unknown keys: unknown-plugin; DSH plugin on or off, built-in: not-removable; no prompt |
| STA-06 ×4 | EP + BVA (spec '', blanks, ./rel, ../rel) | install-failed / invalid-spec; no prompt; profile unchanged |
| STA-07 | DT (Reject) | one add_plugin prompt naming the spec and the reason; rejected; nothing in Fishball's folder or the profile |
| STA-08 | DT (Allow) | `{ok:true, plugin, on:true, installed}` = fishball:fbtest-added; in Fishball's folder; profile files and listBundles unchanged; entry fishball-installed, installed-in-fishball, on, [disable, uninstall]; no entry under the bare name |
| STA-09 | EP | its code runs; its tool is in Fishball's request and runs; not global; not in an ordinary session |
| STA-10 | EP (same package again) | install-failed / already-installed; one entry |
| STA-11 | ST on → off → on | [enable, uninstall], then [disable, uninstall]; disposed, then applied; off keeps the package |
| STA-12 | BVA (maxFishballOnlyPlugins 1) | a Fishball-installed plugin that is on fills the limit: a fishball-only plugin gets 409 refused / limit-reached; with it off, accepted |
| STA-13 | DT (remove_plugin, Reject) | one prompt (remove_plugin); rejected; nothing changes |
| STA-14 | ST on → removing → gone | `{ok:true, plugin, removing:true}`; list_plugins later in the same turn shows removing and actions []; after the turn the entry, the package and the tool are gone; profile untouched; audit action `remove` |
| STA-15 | ST gone → added again | succeeds |
| STA-16 | EP (no bundle patch) | install-failed / not-bundle; not kept; no entry |
| STA-17 ×7 | DT (install body) | invalid JSON, array, {}, spec 1, spec null, '', blanks: 400 bad-body |
| STA-18 ×2 | BVA (maxMessageBytes 64) | a 65-byte spec: 409 too-large; 64 bytes: 200, delivered (A106) |
| STA-19 | ST (install route) | 200 `{ok, state}`; Fishball gets a message with the spec, calls add_plugin (scripted by marker), and the add_plugin prompt is in Fishball's session; fishball:fbtest-added-b ends on |
| STA-20 | ST (user uninstall while Fishball runs) | 200, no prompt; removing true and actions [] in the answer, GET state and an SSE frame while the turn is held; the package stays until the turn ends, then the entry and the package go |
| STA-21 | ST (user uninstall while idle) | gone at once, with no Fishball model request |
| STA-22 | DT (same name as a DSH plugin) | fishball:fbtest-added-c and fbtest-added-c are separate entries; the DSH one stays fishball-only and off; the route refuses the DSH one; removing the Fishball one leaves the DSH one installed |
| STA-23 | BVA (maxQueuedInputs 1, Fishball held) | the 1st install request 200, the 2nd 409 queue-full |
| STA-24 | EP (no cookie) | neither new route answers 200 |
| STA-25 | EP (store unreadable) | the install route answers 409 unavailable |

### [plugins-defaults.test.mjs](plugins-defaults.test.mjs): defaults on a new install

| id | technique | expected result |
|---|---|---|
| DEF-01 ×3 | DT (present at first start × enabled / disabled) | fbtest-tools (profile) and fbtest-only (fishball-only) are off, dsh-disabled, changedBy null; listBundles still has fbtest-tools enabled |
| DEF-02 | DT (DSH-optional) | each is off |
| DEF-03 | EP | fbtest-tools' tools are absent from Fishball's setup request and later ones; an ordinary session has them |
| DEF-04 | ST (restart) | still off |
| DEF-05 | ST (user on → restart) | on, dsh-enabled, changedBy user |
| DEF-06 | DT (installed and enabled while running) | off; its tool not in Fishball's request; an ordinary session has it |
| DEF-07 | DT (installed, not enabled, while running) | off |
| DEF-08 | DT (installed and enabled while down) | off |
| DEF-09 | ST (on → removed → installed again) | off, changedBy null |

### [plugins-upgrade.test.mjs](plugins-upgrade.test.mjs): defaults on an existing install

| id | technique | expected result |
|---|---|---|
| UPG-00 | precondition | the old version shows profile-enabled bundles on and the user's two choices; its entries have no status field |
| UPG-01..04 | DT (see the defaults table) | the four combinations keep their previous state; fbtest-tools' tool statuses are as before; fbtest-only runs |
| UPG-05 | EP | every entry follows the status/actions table |
| UPG-06 | ST | a bundle installed and enabled while running starts off |
| UPG-07 | ST (restart) | every state above is kept |
| UPG-08 | ST | a bundle linked while DSH was down starts off |
| UPG-09 | ST | a bundle present at the upgrade, removed and installed again, starts off with changedBy null |

### Cases changed by plugin statuses

- **CAT-01**: four Fishball plugin tools (with `remove_plugin`, `FISHBALL_TOOLS`). **CAT-02**: 12 keys (`PLUGIN_KEYS`) and the status/actions table, at defaults and after fbtest-tools is on. **CAT-03/05/06** read the default catalog. **CAT-04**: fbtest-tools is **off** (dsh-disabled) on a new install. **CAT-07**: fishball-installed entries are not DSH bundles. **CAT-09/10/15** first turn fbtest-tools on through POST plugins.
- **TOG-01..10, PHT-02..04, PHT-10**: the file's `before` turns fbtest-tools on through the user route (no allowance, no prompt), so the cases still start from "on with unchecked tools". Cases that already turn it on through `allowFixtures` (CMP, FW, PER, REV host B, review2) are unchanged: set_plugin_enabled on works from off.
- **ADD-02/03**: add_plugin installs into Fishball's folder, not the profile, and turns the plugin on itself (key fishball:fbtest-added). **ADD-04** (new): it survives a restart.
- **REV-15/16**: the add entry may name fishball:<name>. REV-16's `installed` is fishball:fbtest-added-b, installed in Fishball's folder. **REV-17a/b**: a bundle installed and enabled while DSH runs is listed **off**. Its tool stays hidden (unchecked or plugin-off, A22) until set_plugin_enabled on is answered Allow.
- **UNC-00** (new): no notice at first live. **UNC-01**: the notice comes after the user turns fbtest-tools on. **UNC-05**: no notice while the late bundle is off, one after the user turns it on. **UNC-07** (new): a fishball-only plugin brings no notice. This follows the implementer's answer: the notice covers profile-enabled plugins that are on for Fishball.
- **ENA-01..07, PUB-*, DED-***: fbtest-source is turned on for Fishball first. **ENA-08**: once live, the source stays disabled until the user turns the plugin on. **EXA-00** (new): the profile-enabled example starts disabled and nothing is delivered. EXA-01..04 follow after the user turns it on.

### Ambiguities (plugin statuses)

- **A102. Uninstall in the audit.** "Records action remove" is checked as at least one plugin_changes row with `action: 'remove'` after an allowed remove_plugin. The row's other fields are not asserted.
- **A103. Limit refusal codes (STA-12).** The route answers 409 `refused` and the tool `limit-reached`, as for fishball-only plugins before.
- **A104. "Immediately if idle" (STA-21).** Checked as: the entry leaves GET state within 60 s with no Fishball model request.
- **A105. Upgrade fixture.** "Existing install" is a home that ran f368ad2 until live. At that point the bundles enabled in the profile are fbtest-tools, fbtest-added and fbtest-added-b (linked at the first boot). The user's choices were made through POST plugins with the old version.
- **A107. PTA-01 is a known environment failure.** During the plugin-statuses round the inner run_code request never reaches Fishball (10 s timeout). It fails the same way with the previous version (f368ad2), under both the current harness and that version's own unchanged harness, while earlier recorded runs (p8, p9) passed. So something outside this plugin changed (the environment or the DSH install). It was not investigated in this round.
- **A106. What maxMessageBytes bounds for the install route.** Read as in P5: the user's own text (the spec), not Fishball's framing around it. So a 64-byte spec fits maxMessageBytes 64.

## Environment limits

- The harness runs inside a macOS sandbox, so real shell writes cannot be exercised. Shell tests use fixture tools named `bash`, `pwsh`, `terminal_open` and `terminal_send`, and assert the plugin's refusals and pass-through only.
- P2: approval prompts are never answered, and the tests count `approval/asked` events only. P3 answers Fishball's own prompts with a scripted host-level answerer (above); DSH's browser prompt itself is not driven.
- add_plugin installs offline: a local directory through pnpm in the throwaway profile (`/opt/homebrew/bin/pnpm` on PATH). No registry or network spec is tested.

- **A51. start_session without `folder`.** M7 says "missing or empty folder → no-folder". The tool schema marks `folder` required, so DSH rejects the call before the tool runs ("invalid arguments: missing required property folder", a tool error). OUT-07 accepts either; an empty string gives `no-folder`.
- **A52. A folder that is neither a workspace id nor an absolute path.** Observed `not-absolute`. Whether an unknown workspace id should be `no-folder` instead is not specified; OUT-07 accepts both.
- **A53. Extra arguments to message_fishball.** A call with `senderSessionId`/`sessionId`/`session_id` next to `message` is accepted and attributed to the caller (MSG-05). Whether such calls should be refused is not specified.
- **A54. `unconfirmed`.** The `{ok:true, unconfirmed:true}` outcome and outbox status `unconfirmed` need a session flush that fails after delivery. Nothing public produces that, so OUT-08 only allows the status. start_session's is now driven with the host probe (SST-06/06b), which fails the first flush after the steer.
- **A55. Not driven black-box: delivery retries and `failed` items.** "Three failed deliveries → `failed` with `delivery-failed`", "retried each time Fishball goes idle", a start_session whose session cannot be created at all (answers `delivery-failed`, not recorded), and caps counting "failed after the session was created" all need a fault inside steer, flush or create. The fixtures cannot inject one. message_session's `delivery-failed` is driven by a target whose recorded preset no longer exists (OUT-04). start_session's is driven by the host probe, which makes the steer into the new agent throw (SST-07, UNA-04); a session that cannot be created at all is still not driven.
- **A144. What "unconfirmed" is.** The flush is DSH's `ctx.sessions.flush(session)`, which answers a boolean and rejects on a listener failure. SST-06 makes it reject, SST-06b makes it answer `false`; both are expected to give `unconfirmed: true`. Only the first flush after the steer fails, because failing every later one would also break the new session's own turn.
- **A145. Missing and non-string titles.** The schema marks `title` as a required string, so DSH rejects a call without it (or with a number, null, array or object) before the tool runs, as for a missing folder (A51). ORD-02 accepts `no-title` or a tool error for those rows; an empty or whitespace-only or invisible-only string must give `no-title`.
- **A146. Invisible titles (R2 update).** "Empty after DSH's `normalizeSessionTitle(title, Number.MAX_SAFE_INTEGER)`" is tested with the real function as a precondition of each ORD-02 row, and every expected kept title (SST-03d) is written out by hand. `title-invalid` can no longer come from DSH's real service through start_session, so SST-04 gets it from a stub that throws the real `SessionTitleInvalidError` class.
- **A148. Rev11 start_session calls.** MGL-02 (start) and MGL-05 changed with the title fix: a started session is titled from the start, so its entry is no longer `null`, and the user's first message does not replace the title. UPM-00's start_session is made to the previous version (PRE_REV11A), which has no title argument, and passes none.
- **A147. A started session's first message text.** The relay text of a start_session is the message verbatim (observed; no header), unlike message_fishball's relays. SST-02 asserts equality.
- **A56. The wake guard for stranded items.** DSH's turn-retirement gap cannot be triggered on purpose. WAK-04 covers parked items read by the next turn (consumed, never discarded), and DUR-02 covers pending items delivered once Fishball is live again.
- **A57. GUI (M5).** Only the served client bundle is checked: it contains "Send to Fishball". The row menu, the header action, its visibility rules (live only, never in Fishball's own session) and the dialog are not exercised in a browser. Whether the bundle names the route path literally is a diagnostic only.
- **A58. Wake-ups per process.** DESIGN §5b counts wake-ups per process, so a restart resets the count. This is not asserted. WAK-03 sets the cap to the current count + 1 at runtime instead of starting from a known zero, because the setup turn may or may not count the unchecked-tools notice.
- **A59. "Not running" for the queued note.** The M1 review says the note is 'Queued for Fishball …' when Fishball is not running. This is driven by archiving Fishball (DUR-02). The `starting` and `recovery` states are not driven.
- **A60. DUR-01: a turn interrupted by shutdown (fixed during the round).** The input is accepted into the inbox of a running turn, and DSH then stops; the old turn ends `interrupted`. In the first run the item ended `discarded` and was never read (reported). After the implementer's change it is delivered exactly once after the restart and ends `consumed`; DUR-01 passes.
- **A61. UNC-05: a bundle installed while DSH runs (fixed during the round).** In the first run, `pluginManager.installBundle(..., {enabled:true})` gave no notice, even after one more Fishball turn (reported). After the implementer's change the notice names `added_c_echo` and its plugin within about 2 s; UNC-05 passes.
- **A62. Session titles.** The fake model titles every session "fbtest title", so tests assert only that `session_title` is a string.
- **A63. Ordinary sessions after a restart.** DSH resumes only Fishball at boot. Restart cases reopen the sender through `sessionController.resolveAgent`, as opening it in the GUI does, before using it again.
- **A64. ADO-01: adopt versus "never lost" (fixed during the round).** Steps: Fishball is held in a turn, an input is accepted (status `accepted`), DSH stops, Fishball's session artifacts are moved away, and DSH boots into recovery. The item is still `accepted` right before the adopt. After the A60 fix, the item was redelivered to the adopted session and ended `consumed`. The implementer found that the record did not store which session it was delivered to. Now it ends `discarded` and never reaches the new session, as M9 says; ADO-01 passes.
- **A65. Empty message_fishball (fixed during the round).** In the first run, '' and whitespace answered `{ok:true}` and delivered an empty relay (reported). They now answer `empty`.
- **A67. W2 while Fishball is archived (finding).** W2 says "Fishball not running → 409 unavailable". With Fishball archived (`status: archived`) POST watches answers 200 and adds an active watch (WCH-15 fails). With the store unreadable it answers 409 unavailable (WCH-16 passes), and `state.watches` is null while failed. Either archived should count as "not running" for watches, or W2 should be narrowed to "core failed". Please decide.
- **A68. read_session on an unknown id (finding).** W5 lists `unknown-session` for an unknown id. Observed: `not-related`, which the relatedness check gives before the existence check. The review note allows either for non-session strings (TOL-06b accepts both), but a well-formed unknown session id still gets `not-related` (TOL-06 fails). Please decide which code is intended.
- **A69. "While Fishball was down".** Archiving Fishball stops its agent, but the `fishball` row keeps running and watching. So in DWT-06b the first settled turn end already counts, and it is reported when Fishball is live again (observed: turn 1 of 3). The review rule ("several turns while down → one notice for the LAST end") is tested where nothing of Fishball runs: DWT-06 boots DSH with the row off (`FBTEST_PLUGIN=off`) while the target runs three turns, and passes.
- **A70. Archiving a watched session (observed, per the implementer).** The watch stays active (WCH-18). Not a requirement.
- **A71. Order of deferred per-turn notices.** Answered in the re-review: each notice carries the answer as of its own turn end, so QFL-03 and DWT-04 check order through `last_answer`. Both pass.
- **A72. GUI (W9).** Only the served bundle's strings are checked. The menu and header placement, the "Fishball is live / other session" visibility, "Fishball is watching" only for your own active watch, the refusal dialog and Remove are not driven in a browser.
- **A73. read_session byte bound (finding).** "At most 12288 bytes in total" is measured as the sum of the messages' text bytes. With one 16 KB answer, TOL-07b sees 2 messages totalling 12290 bytes, 2 over. That fits a cut to 12288 plus a 3-byte '…', or a bound counted another way. TOL-07, with many messages, stays at 12288 exactly. Please confirm what the 12288 bytes count (text, the JSON array, or the whole block) and whether the ellipsis is inside the bound.
- **A74. target-missing (finding at the time of the run).** DWT-05 deletes the target's session directory and projection-cache file while DSH is stopped (`sessionPersistence.stat` then returns null). After the restart the watch stays `active` for 10 s and never becomes `target-missing`. The re-review says only DSH's "session not found" closes it, so how session-query reports a deleted session needs checking.
- **A75. What cannot be driven black-box.** W8: a notice refused for any reason other than a full queue. W7: a crash between firing and recording the watermark (the "never two notices across restarts" guard is only tested across clean restarts and a SIGKILL during a target turn). W3: the `forked` reason. W5: relatedness through pruned *intake* rows (TOL-09 covers the outbox only), and the exact excerpt rule beyond the bounds.
- **A76. Subagent requests need the ask policy (P1 update).** DSH pins every subagent's approval policy to `never` at delegation (dsh-subagent `captureDelegatedPolicyOverrides`), so by default a subagent's request is rejected before any answerer and never reaches the broker. APR-17 switches every new agent back to `ask` through DSH's policy switch on `agent/created`. Attribution to the parent is then observed as required. So the subagent rule only matters when something widens a child's policy; please confirm this is expected.
- **A77. Unavailable arguments are an empty string.** With no call id, an id not in the log, or a call to another tool, the block has `arguments: ""`, not an absent field. APR-14 only asserts that nothing of the call is shown.
- **A78. Where the ellipsis counts.** Observed for both bounds: the shown text including '…' fits the limit (argumentExcerptBytes 92: an 89-byte prefix plus '…' = 92; latest_user_message 3000 bytes: 2047 shown). The tests assert the weaker rule "the prefix is within the limit" plus "the latest message is at most 2048 bytes".
- **A79. Wording the tests parse.** The provenance line is read as `Session started by: <X>; its current turn started by: <Y>.`, the answer time as "<n> s", and the notes by the strings in `APR_NOTE`. The summary is JSON-quoted per the review update (the first brief had it unquoted).
- **A80. Non-waking notes.** The escalated, timeout and withdrawn notes are injected, so they appear only in Fishball's next turn (in its request and log). The tests assert: no Fishball request for 1.5 s, then the next turn's request carries the note. The note for a request cancelled before Fishball read it (APR-11) is not asserted.
- **A81. Timing tolerance.** Answer-time cases measure from the asking tool's call to the stand-in's question: at least n s − 150 ms, at most n s + 2.5 s (APR-08), and 1.85-4.5 s for 2 s while Fishball is busy (APR-09). "At once" for a bypass is under 1 s; for P12 under 5 s (observed about 50 ms).
- **A82. A routed request while Fishball is held.** While Fishball is inside a held model request, the request message waits in its inbox and is not yet in its log, so RTE-02 proves routing by "pending and not at the stand-in", not by the message.
- **A83. Not driven black-box.** P7b and P12 only with Fishball archived: `stopped`, `recovery` and a row unload while requests wait are not driven. The real browser prompt (DSH's gateway forwarder) is replaced by the stand-in. An escalate handed on at the exact moment of a cancel (P6 update, second half) is covered only as "cancelled while waiting at the stand-in" (APR-12, audit answer observed `withdrawn`). A turn started by "Fishball (message_session)" vs a session started by start_session whose later turn is the user's is not driven. Requests from ordinary sessions arise only from the fixture tool `fbtest_ask`, not from a real sandbox escalation.
- **A84. Audit record files.** "Audit kept to auditEntriesKept" is checked on the per-record files under `storages/fishball_intake/approvals` (DESIGN §9). The state's `recent` follows the pruning (observed 2 after pruning to 2).
- **A85. Bypassed or policy-never requests in the audit.** P8 says bypassed requests are not recorded; RTE-01..06 and APR-19 assert that the newest audit key is unchanged. A request that went to the stand-in after Fishball stopped (P12) is recorded with answer `timeout`, as the update says.
- **A86. Harness fix: tool-result call ids.** The worker's `tool/result` summary read `message.callId`, but DSH's ToolResultMessage names the field `toolCallId`, so every summary's `callId` was null. Only the new P7 helper `resultOfCall` uses it. The worker now reads `toolCallId` and falls back to `callId`.
- **A87. A host row's identity.** X3 says that a plain host row's bundle is "its module name". The overlay names the fixture row by an absolute file path. SRC-08 accepts either that path or its `file://` URL as the bundle part, followed by `/fbtest-source-row/<id>`. In the first probe (07:13) the identity was `file:///…/source-row.mjs/fbtest-source-row/q`. After the 07:21 change it was `file:/file:///…/source-row.mjs/q`, which lost the entry id; this was reported and fixed. Whether the bundle part should be the path as written in the patch or the loader's URL is not specified.
- **A88. Fishball's states not driven for X7.** Covered: `starting` (ENA-08), `archived` (ENA-07), and the profile plugin turned off by the user or by `set_plugin_enabled`. `stopped` and `recovery` are not driven with a registered source. With the store unreadable (`failed`), the root realm has **no** `fishball` service at all (probe: `ctx.get('fishball')` undefined, and the fixture rows never got a context). So "enabled false while failed" cannot be observed: there is no source.
- **A89. A Fishball-only plugin's identity.** X3 says the bundle name. The entry id of a private-tree row is not stated in X3. The updated guide says that the identity is the same for everyone and for Fishball only, so ONL-02 expects the bundle's own row id (`fbtest-source-only/fbtest-source-only/<id>`, observed), not the private row id `fbo-…--…`.
- **A90. A title with a line break.** X4 lists only missing and blank titles. The guide says "one line (no line breaks)", and the review update makes a line break FISHBALL_INVALID. PUB-03 tests \n and \r.
- **A91. A call after the plugin unloaded.** Cordis itself refuses `ctx.fishball` on an inactive context ("cannot get required service … in inactive context"), before Fishball sees the call. ONL-03b therefore calls `registerSource` on the service object the row kept from before the unload, and gets FISHBALL_UNKNOWN_PLUGIN.
- **A92. Notice summary (requirement change).** X5 said the summary is the event title, bounded to 120. The review update (P8 L2: no plugin text outside the untrusted block) changed it to `Plugin event: "<source title>"`, bounded by DSH to 120 characters. Observed: 119 characters + '…'. PUB-01, PUB-04, EXA-01 and SUM-01 follow the update. The source title is also plugin-chosen text outside the block, both in the summary and in the header. It is JSON-quoted, and the plugin registers it rather than taking it from an event.
- **A93. Not driven black-box.** FISHBALL_SOURCE_DISPOSED for a profile-wide plugin that reloads (driven only by unmounting a Fishball-only plugin, which disposes its row). A source registered before the catalog knew its bundle, after a runtime install (review update). That a throwing onEnabled is *logged* (ENA-09 checks only that it is not fatal). Dedupe after the intake rows are pruned (`auditEntriesKept`, per the updated guide): not tested, because it is "remembered while kept" and not a promise. A full queue during `onEnabled` republishing.
- **A94. The example's notes cannot be edited live.** The example's `notes` config is not `.volatile()`: DSH's settings service refuses an update ("Plugin entry … has no volatile fields"). The README's "add notes on its Plugins page" therefore takes effect when the row remounts. EXA-03/EXO-03 add a note across a restart instead. Whether the example should declare its notes volatile, so that a new note arrives without a restart, needs a decision.
- **A95. A host row is always enabled.** Observed, and stated in the guide: a source of a row no catalog plugin owns stays enabled while Fishball is live, whatever plugin is turned off (ENA-02). It follows Fishball's state (ENA-07).
- **A66. Runs while the implementation changes.** One full run made while the working tree was being edited gave 7 failures in the older lifecycle and context files (boots that never became ready). Rerun alone, those files passed 120/120, and the next full run passed 486/486.

## P11 cases (Messenger look, revision 9; R1-R5)

**Requirement summary.** A Fishball built-in `builtin:messenger` ("Messenger look", kind and status `builtin`) is on by default, on a new install and on an install from before P11 with no stored choice. It is switched like other built-ins (POST plugins, `set_plugin_enabled`), cannot be uninstalled (route 409 `refused`, tool `not-removable`), mounts no rows, registers no tools and does not count toward `maxFishballOnlyPlugins`. The snapshot carries `look`: `{messenger: <current choice>}` once the catalog exists, `null` before it or when the core failed. GET `/api/fishball/messenger/client.js` serves `packages/messenger/client.js` (`text/javascript; charset=utf-8`, `no-store`) whatever the look. Every intake message's `source` gains `author: {kind, name?, seed?}`. The name is the title at arrival, absent when the title is empty, and at most 200 UTF-8 bytes (a cut ends with `…`, the ellipsis inside the bound).

| input | author |
|---|---|
| message_fishball from S (or from a subagent of S) | `{kind:'session', name: title(S), seed: S}` on the unchanged relay source |
| Send to Fishball of S | `{kind:'user', name: title(S), seed: S}` |
| install request (POST plugins/install) | `{kind:'user'}` |
| watch notice for S | `{kind:'watch', name: title(S), seed: S}` |
| permission request from S | `{kind:'approval', name: title(S), seed: S}` |
| plugin source (identity I, title X) | `{kind:'plugin', name: X, seed: I}` |
| unchecked-tools notice; the note after you answer a request Fishball passed on | `{kind:'system'}` |

**Harness additions.** These are append-only. The worker's overlay raises DSH's title cap when `FBTEST_TITLE_MAX_BYTES` is set (`TITLE_ENV`, 1024 bytes; dsh-base sets 80), so titles longer than the 200-byte author bound can exist. New worker operations: `renameSession` (DSH's session-title service `rename`, a user title), `sessionTitle` (the title DSH reports, `''` when none) and `fishballRows` (dsh-fishball's row ids from DSH's plugin manager). New constants: `MESSENGER`, `LOOK_KEYS`, `AUTHOR_KIND`, `AUTHOR_KEYS`, `AUTHOR_NAME_MAX_BYTES`, `TITLE_ENV` and `PRE_MESSENGER` (commit e221d23, the last commit before P11's code, extracted with `git archive` as plugins-upgrade does). Every author case first checks that DSH reports the title it set. The new tests were also run against e221d23 (`FBTEST_PLUGIN_DIR`) and all 42 host cases failed there, so they tell the two versions apart.

### [messenger-catalog.test.mjs](messenger-catalog.test.mjs): R1, R2 on a new install

| id | technique | expected result |
|---|---|---|
| MSL-01 | EP (fresh install; GET state and first SSE frame) | exactly one `builtin:messenger`: title "Messenger look", kind builtin, status builtin, on, [disable], tools [], removing false, changedBy null; 12 keys; decision table |
| MSL-02 | EP (list_plugins) | the same entry |
| LOK-01 | EP (normal start) | `look` is exactly `{messenger: true}` |
| LOK-02 | ST on → off (user) | the POST answer's `state.look.messenger` is false; entry off, changedBy user, [enable]; GET state agrees; an SSE frame carries false |
| LOK-03 | ST off → on while Fishball is held in a turn | the answer, GET state and an SSE frame show true before the turn ends |
| MSL-03 ×2 | DT (POST plugins/remove × on/off) | 409 `refused`; entry and look unchanged |
| MSL-04 ×2 | DT (remove_plugin × on/off) | `not-removable`; no prompt |
| MSL-05 | ST on → off → on (set_plugin_enabled) | ok:true, no prompt, changedBy fishball; look follows |
| MSL-06 | EP (on vs off) | the same Fishball request tools, global tools, dsh-fishball rows and profile files; the entry's tools are [] |
| MSL-07 | BVA (maxFishballOnlyPlugins 1, reached by fbtest-only) | another fishball-only plugin is refused (precondition); the messenger off and on both answer 200 ok |
| LOK-04 | EP (every frame collected) | with a catalog, `look.messenger` equals the entry's `on` |
| MSL-08 | ST off → restart → on → restart | the choice survives each restart (changedBy user) |
| LOK-05 | EP (store unreadable: core failed) | `look` is present and null in GET state and the first frame |
| LOK-06 | ST starting → live (setup request held) | in every snapshot and frame: no catalog → look null; catalog → `{messenger: entry.on}`; live → `{messenger: true}` |

### [messenger-upgrade.test.mjs](messenger-upgrade.test.mjs): R1 on an existing install

| id | technique | expected result |
|---|---|---|
| UPL-00 | precondition | the old version (e221d23) has no entry and no `look` field |
| UPL-01 | DT (existing install × no stored choice) | on, builtin, [disable], changedBy null; look `{messenger:true}` |
| UPL-02 | DT (existing install × other built-ins changed by the user) | builtin:reminders stays off, builtin:ask-user stays on |
| UPL-03 | ST (restart) | still on |
| UPL-04 | ST (user off → restart) | stays off; the default is not applied again |

### [messenger-client.test.mjs](messenger-client.test.mjs): R3

| id | technique | expected result |
|---|---|---|
| MCJ-01 | EP (GET, look on) | 200, `text/javascript; charset=utf-8`, `no-store`, body byte-for-byte `packages/messenger/client.js` |
| MCJ-02 | ST (look off, then on) | the same answer in both states |
| MCJ-03 | EP (POST) | not 200, and never the file |
| MCJ-04 | EP (no cookie) | not 200, and not the file |
| MCJ-05 | EP | `packages/messenger/package.json` name `dsh-fishball-messenger` |
| MCJ-06 | EP | `files` lists `packages/messenger/`; `npm pack --dry-run` lists `packages/messenger/package.json` and `packages/messenger/client.js` |
| MCJ-07 | EP | client.js calls `window.__ModuleLoader__.load({ … id: 'dsh-fishball-messenger' … })` |

### [messenger-table.test.mjs](messenger-table.test.mjs): markdown tables stay inside Fishball's reply bubble and fit it when they can (follow-up fix to the Messenger look)

**Requirements.** R1: in Fishball's session with the look on, a table in a reply stays inside the bubble (the wrapper's edges do not pass the bubble's content edges). R2 (changed in the second round): a 4+ column table (`md-table-wide`) fits the bubble width when it can: its cells wrap, so every column shows without scrolling (table width at most the wrapper's, last cell's right edge at most the bubble's right content edge); a short wide table keeps its natural compact width and is not stretched; only a table that cannot fit even with wrapping (each cell has `min-width: 100px`, so for example eight columns) overflows the wrapper and scrolls sideways inside the bubble on hover or focus, DSH's hover rule (`overflow-x: scroll`) keeping that working. R3: tables with fewer columns (`_tableFill_*`) also stay inside. R4: other sessions (no `data-fishball-messenger` marker) keep DSH's stock layout. R5: rows that are not replies (for example `reasoning`) are not changed. R6: with the look off (the plugin disposed, its style element removed) DSH's stock behaviour returns.

**How.** Node has no layout engine, so the cases run the module's browser file in a `vm` against a stub host ([support/messenger-style.mjs](support/messenger-style.mjs); the file is executed, its source is not read) and check the stylesheet it mounts: a small CSS parser, a selector-specificity calculator, the cascade winner of a property (`!important`, then specificity, then order), and a decision table that asks which rules a DOM context (marker, row part, wrapper class) selects. The real layout was measured separately in headless Chrome with DSH 0.2.1-rc.3's CSS (before and after each fix, chat-area widths 1200, 1000, 750, 749 and 700, with and without the marker and with the style removed, with a real hover and Tab focus); that fixture is not part of the suite. `FBTEST_MESSENGER_CLIENT=<path>` runs the cases against another copy of the file (the file from before any fix fails MTB-01, 02, 03 #1, 05, 06, 09, 10 and 11; the file after the first fix fails MTB-10 and 11, which is the R2 change). A first mutation check wrapped the file of the first round with eleven defects (unscoped rule, any row part, low specificity, `overflow-x: hidden`, a negative margin, a fixed width, a hashed class name, a fill wrapper widened, a dropped padding or max-width, a disposer that keeps the style); every one was caught. For R2 a second check wrapped the current file with ten table defects (width `100%`, `max-content` or `512px`, a `min-width`, `white-space: nowrap`, a zero-specificity table rule, a table rule without the marker or for every row part, a dropped table rule, `overflow-x: hidden` on the wrapper); every one is caught, and the equivalent spelling `width: fit-content` still passes.

| id | technique | expected result |
|---|---|---|
| MTB-00 | EP (helpers) | `parseCss` keeps quoted `;` `{`, groups of selectors and at-rules whole; specificity: scoped reply selector `[0,5,0]`, DSH's `.hWmORq_body .md-table-wide` `[0,2,0]`, `:where()` counts nothing |
| MTB-01 | EP (look on) | one style element; a table rule applies to a wide wrapper in a Fishball reply row |
| MTB-02 | EP (R1) | the rules about the wrapper itself (not the table in it) give width `auto`/`100%`, max-width `100%`, margin-left and padding-left `0` |
| MTB-03 ×7 | DT (marker × row part × wrapper class) | applies for marker + reply + wide; applies for none of: no marker, `reasoning` row, other row part, fill wrapper without marker or outside replies |
| MTB-03 (R3) | EP | any rule that applies to a fill wrapper in a Fishball reply keeps it contained (the case does not require such a rule) |
| MTB-04 | BVA (specificity against DSH's `[0,2,0]`) | each contained declaration is `!important` or has higher specificity than DSH's stock rule |
| MTB-05 | EP (R2) | no table rule sets `overflow`, `overflow-x`, `overflow-y`, `display: none` or `visibility: hidden` |
| MTB-06 | EP (R4, R5) | every table rule needs the conversation, the marker, the step kind and the reply part |
| MTB-07 | EP (R3) | the stylesheet does not name DSH's generated classes `_tableScroll_*` and `_tableFill_*` (they change with DSH's build) |
| MTB-08 | ST (on → dispose) | the style element is removed; nothing is left in `document.head` (R6) |
| MTB-09 | ST (on, off, on, off, on) | one style element with the same text each time it is on, none while off (R6) |
| MTB-10 | EP + BVA (specificity against DSH's `[0,1,1]`) | the cascade's winning `width` on the table inside a wide wrapper in Fishball's reply is `auto` (or `fit-content`: shrink-to-fit, so cells wrap to fit the bubble and a short table keeps its natural width), `!important` or with higher specificity than DSH's `._tableScroll_* table { width: max-content }` (R2) |
| MTB-11 | EP (forbidden values) | a rule is about that table; none of them sets a `width` other than `auto`/`fit-content` (pinned `max-content`, stretched `100%`, fixed px), a `min-width` other than `0`/`auto`, or `white-space: nowrap`/`pre` (R2) |
| MTB-12 ×4 | DT (marker × row part, wide wrapper) | no rule sets a width on the table without the marker, in a `reasoning` row, in another row part, or with neither (R2 R4 R5) |

### [messenger-layout.test.mjs](messenger-layout.test.mjs): round avatars and the footer under the reply bubble (second follow-up fix to the Messenger look)

**Requirements.** R7: DSH's theme turns `border-radius: 50%` into a rounded square (`@supports (corner-shape: superellipse(1.5)) { *, :before, :after { corner-shape: var(--dsw-corner-shape) } }`). Fishball's reply avatar (the reply row's `::before`) and the sender avatars (`.fbm-avatar`) compute `corner-shape: round` (Chrome serialises it `superellipse(1)`, the same shape) and look round; other elements keep the superellipse. R8: DSH's footer under a reply (copy button, time) is a separate chat row (`data-chat-flow-kind="turn-tail"`). In Fishball's session its content box starts at the reply bubble's left border edge, not under the avatar (the copy button box starts 6px further left because of DSH's -6px margin, which lines the icon up with that edge); in another session the footer is unchanged.

**How.** As for the table cases: the module's file is executed in a `vm` and the stylesheet it mounts is checked. The left offset of a row is its `margin-left` plus `padding-left` from the cascade's winner (the reply row's offset plus the bubble's own left margin is where the bubble's left border edge sits; the footer's offset is where its content starts); only `px` and `0` are accepted. The real layout and the pixels were checked in headless Chrome against DSH's CSS (computed `corner-shape` of both avatars and of the controls, sampled pixels on the circle's and the superellipse's diagonals, footer content-left against the bubble's left border edge at several widths, with and without the marker); that fixture is not part of the suite. The same `FBTEST_MESSENGER_CLIENT` switch and mutation wrapper were used: the file from before any fix fails MLY-01 to 04, MLY-05 #1, MLY-06 and MLY-07; the file after the first table fix fails the same ones. Eleven avatar defects (a missing `corner-shape` on either avatar or both, the squircle value, a global `*`, one on the bubble, the theme variable redefined, a radius of 4px, a zero-specificity rule) and eight footer defects (28px, no rule, no marker, no conversation, the inner button touched, reasoning or process rows shifted, a percentage) are caught; a `margin-left` or the `padding: 0 0 0 36px` shorthand instead of `padding-left` still passes.

| id | technique | expected result |
|---|---|---|
| MLY-00 | EP (helpers) | `lastCompound` ignores whitespace inside `(...)`/`[...]`; `isPseudoElement`; `winning` (`!important` > specificity > later rule); `pxLength` (`px` and `0` only); the left side of a 1 to 4 value shorthand; a longhand wins over a shorthand |
| MLY-01 | EP + BVA (specificity against DSH's `[0,0,1]`) | the reply row's `::before` (it has `content`) has winning `corner-shape` `round`/`superellipse(1)`, keeps `border-radius` `50%` (or at least 14px), and the winning rule is `!important` or outranks DSH's `*, :before, :after` (R7) |
| MLY-02 | EP + BVA | the same for `.fbm-avatar` (R7) |
| MLY-03 | EP (what else may change) | every rule that sets `corner-shape` is about `.fbm-avatar` or the reply row's `::before`; the stylesheet never writes `--dsw-corner-shape` (R7: other elements keep the superellipse) |
| MLY-04 | EP | the footer row has a left margin or padding; its offset is more than 0 and equals the reply row's offset plus the bubble's left margin (R8) |
| MLY-05 ×6 | DT (marker × row kind × row part) | a left margin/padding rule applies to: Fishball's footer and Fishball's reply row; to none of: another session's footer, another session's reply row, Fishball's `reasoning` row, Fishball's `turn-process` row (R8, R4, R5) |
| MLY-06 | EP | every rule that names the footer row has the conversation and the marker, and styles the row itself, not what is inside it (DSH's -6px margin on the copy button stays) (R8, R4) |
| MLY-07 | ST (on, off, on, off, on) | each time the look is on the reply avatar, sender avatar and footer rules are mounted; each time it is off there is no style element (R6, R7, R8) |

### [messenger-author.test.mjs](messenger-author.test.mjs): R4 (one host with source fixtures and the raised title cap)

| id | technique | expected result |
|---|---|---|
| AUT-01 | EP (message_fishball; title with quotes and markup) | source = `{agent-message, relay, senderSessionId: S, author: {session, title, S}}`; the name is the title verbatim; text and block unchanged |
| AUT-02 | EP (subagent of S) | author `{session, title(S), S}`, not the child |
| AUT-03 | EP (Send to Fishball) | source = `{fishball-notice, notice, 'The user forwarded a session', author: {user, title(S), S}}` |
| AUT-04 | EP (install route) | author exactly `{kind:'user'}` |
| AUT-05 | EP (watch notice) | source = `{fishball-notice, notice, 'A watched session finished (completed)', author: {watch, title(S), S}}` |
| AUT-06 | EP (plugin source) | source = `{fishball-notice, notice, 'Plugin event: "X"', author: {plugin, X, identity}}` |
| AUT-07 ×2 | BVA (source title exactly 200 bytes: ASCII, emoji) | the whole title |
| AUT-08 | EP (unchecked-tools notice) | author exactly `{kind:'system'}` |
| AUT-09 ×9 | BVA × EP (bytes × character width) | whole: 199 and 200 ASCII bytes, 66 CJK + 2 ASCII, 50 emoji, 100 'é'. Cut: 201 ASCII bytes, 67 CJK (201), 51 emoji (204), 100 'é' + 1 ASCII (201). A cut name is ≤ 200 bytes, ends with '…', is a prefix of the title and splits no character |
| AUT-10 | EP (empty title) | author `{session, seed: S}` with no `name` key |
| AUT-11 | ST (title A → message → rename B → message) | the first stored message keeps A; the second has B |
| AUT-12 | EP (Send to Fishball, 250-byte title) | cut by the same rule |
| AUT-13 | EP (sweep of Fishball's log) | every author has only kind/name/seed, a known kind and string values; a present name is non-empty and ≤ 200 bytes; every relay and every notice except the setup message has one |

### [messenger-author-approvals.test.mjs](messenger-author-approvals.test.mjs): R4 for permission requests (scripted answerer after the broker)

| id | technique | expected result |
|---|---|---|
| AUT-14 | EP (S asks; Fishball escalates) | source = `{fishball-notice, notice, 'Permission request: "fbtest_ask"', author: {approval, title(S), S}}`; text still starts `[permission request apr_…]` |
| AUT-15 | EP (the user answers the escalated request) | the note in Fishball's next turn has author exactly `{kind:'system'}` |
| AUT-16 | EP (no answer in time; the user answers) | the timeout note has author exactly `{kind:'system'}` |
| AUT-17 | BVA (201-byte title) | the approval author's name is cut (≤ 200 bytes, '…', a prefix) |

### R5 browser behaviour (manual; the suite drives no browser)

Run these against a live DSH Web with the Messenger look on, unless the case says otherwise.

| id | technique | expected result |
|---|---|---|
| MAN-01 | EP | In Fishball's session your messages are right-aligned bubbles labelled "You" |
| MAN-02 | EP (one per author kind) | Each input is a left-aligned bubble with its author's name and an initials disc coloured from `seed`. A system notice shows Fishball's fish. Each bubble wraps DSH's own row for that message |
| MAN-03 | EP (two consecutive inputs from one author, then another author) | The name and avatar appear once per run of bubbles |
| MAN-04 | EP | Fishball's replies are bubbles with the fish and the name "Fishball"; work rows (tools, reasoning) are muted |
| MAN-05 | ST idle → running → idle | The header shows "online", then "typing…", then "online" |
| MAN-06 | EP (an ordinary session, look on and off) | It renders exactly as without the plugin |
| MAN-07 | ST on → off → on (settings page or set_plugin_enabled), no reload | The stock look comes back at once, then the messenger look |
| MAN-08 | DT (pre-P11 messages without author: relay / Fishball notice / user) | The fallback names are "Another session", "Fishball notice" and "You" |
| MAN-09 | EP (a title containing markup) | The name is shown as plain text |

### Ambiguities (P11)

- **A108. Which notes are "the note after you answer".** The escalated note (AUT-15) and the timeout note (AUT-16) are both injected after the user answers a request that Fishball passed on, so both are expected to have `{kind:'system'}`. The withdrawn note is not asserted.
- **A109. The setup message.** "Fishball is set up" is not in the author table and is not an intake message, so AUT-13 does not require an author on it.
- **A110. How short a cut name is.** The requirement bounds the cut (≤ 200 bytes, ends with '…', no split character); it does not say the cut must keep the longest prefix. The tests do not assert that. Observed: 200 bytes (ASCII), 198 (CJK), 199 (emoji), 199 (é + ASCII), which is the longest prefix that fits.
- **A111. "Other methods are not served by Fishball."** Checked as: a POST never gets 200 or the file's bytes. The exact status DSH answers is not asserted.
- **A112. An empty title.** DSH's rename refuses an empty title, so AUT-10 builds a session whose only turn was started by a relay. DSH derives titles from the user's messages only, so the session has no title; the test checks this first.
- **A113. Titles over 80 bytes.** DSH caps titles at 80 bytes by default, so the 200-byte rule can only bite when the cap is raised. The author files raise it to 1024 through the overlay (`TITLE_ENV`).
- **A114. "Exactly like other built-ins" for set_plugin_enabled.** The Messenger look has no tools, so MSL-05 expects no prompt (as for builtin:time).

### Cases changed by P11

R2 adds a top-level `look` and R4 adds `author` to every intake source, so exact-match assertions in earlier files were updated on the coordinator's instruction. Each expected author is derived from the R4 table. Every other assertion is unchanged.

- **`STATE_KEYS`** ([support/constants.mjs](support/constants.mjs)) gains `look` (17 keys). This covers HTP-01, HTP-04/05, PHT-01, PHT-04 and SND-01's key check.
- New helpers in [support/expect.mjs](support/expect.mjs):
  - `sessionAuthor(host, kind, sid)` builds `{kind, name: <the title DSH reports for sid>, seed: sid}`, with no `name` when the title is empty. The title is the fake model's "fbtest title", which does not change after it arrives and is within the 200-byte bound.
  - `pluginAuthor(title, identity)` builds `{kind:'plugin', name: title, seed: identity}`.
- **MSG-03** expects `author: sessionAuthor(session, bare)`. **MSG-06** expects `sessionAuthor(session, std)`: the root session, not the subagent.
- **SND-01** expects `author: sessionAuthor(user, target)`.
- **APR-01** and the APR-14 row "the call was to another tool" expect `author: sessionAuthor(approval, x)`.
- **PUB-01** expects `author: pluginAuthor(SRC.title, IDENT)`. **EXA-01** expects `pluginAuthor(EXAMPLE.source.title, IDENT)`.
- **FIR-01** expects `author: sessionAuthor(watch, sid)`.
- Knock-ons that need no edit: FIR-02 (it depends on FIR-01) and APR-15, the first APR-16 row and APR-18 (they failed only because the failing APR-14 row left a request pending).
- OUT's two relay assertions (messaging-outbound) are unchanged. They cover Fishball's messages to other sessions, which R4 leaves out of scope.

## P12 cases (plugin manager, revision 10; DESIGN §10d, §13c S28-S30, §14 "Plugin manager")

**Requirement summary.** Every snapshot catalog entry gains `dsh` (profile→`on`, fishball-only→`off`, built-in→`builtin`, installed in Fishball only→`none`), `runs` from the desired states (a profile plugin `everywhere` when on in Fishball, else `dsh`; every other kind `fishball` when on, else `nowhere`), `packageName` and `version` (null for built-ins or unknown), `description` (the package's own, or null), `meta` (DSH's localized `title`/`description`, or null), `hasIcon`, and `settings` (`unused` stored values of a plugin on in DSH, `none` on in DSH with nothing stored or no rows, `changed`, `default`). Only plugins whose rows run in Fishball's private tree have settings; a plugin on in DSH is shared and refuses them; the Compaction engine row has no form. Stored values per row live in table `plugin_settings` of domain `fishball`, never in the profile. A save deep-merges (objects merge, arrays and other values replace), then removes `reset` paths (`[]` removes all), deletes an empty record, and checks the complete config (patch config plus your values) against the row's schema: invalid → the first failing field's path. Changes apply at the next idle phase: an ordinary field restarts only that row, a `.volatile()` field reaches the plugin without a restart, a row that fails to mount turns the plugin off with `row-failed` and keeps the stored values. Secrets never leave the Host. Routes: GET `detail` (`{ok, detail:{plugin, shared, settings, rows, history}}`, 400 `bad-body` without plugin, 404 `unknown`), GET `icon` (the image, or 404 `unknown`), POST `settings` (`{plugin, row, values?, reset?}`; 200 with the state, 400 `bad-body`, 400 `invalid` with `path`, 409 `unknown`/`shared-with-dsh`/`no-settings`). Tools: `get_plugin_settings` (no prompt; refused `unknown-plugin`) and `set_plugin_settings` (refused before any prompt, in order: `unknown-plugin`, `shared-with-dsh`, `unknown-row`, `no-settings`, `secret-field`, `invalid` with `path`, `no-change`; otherwise DSH's normal prompt listing `path: old → new` with each value as JSON cut to 200 bytes and Fishball's reason; Allow once saves, Reject answers `rejected`). Every change is audited in `pluginChanges` with action `settings`. Nothing in the manager writes `package.json`, the lockfile or `cordis.patch.yml`.

**Harness additions** (append-only, so the other files keep their catalog):
- `FBTEST_MANAGER=1` (`MANAGER_ENV`) links three fixtures at a home's first boot ([support/fixtures](support/fixtures)): `fbtest-settings` (installed, not selected: fishball-only; version 1.2.3, a description and an SVG icon; row `fbtest-settings` whose `Config` has a string, a natural number 1..10, a boolean, a choice of two constants, a `role('secret')` string the patch sets, a `.volatile()` string, a nested object, a list of text, a list of objects a group `auth` with a plain `user` and a secret `key` the patch also sets, and a list of objects `accounts` whose items hold a secret the patch sets; row `fbtest-settings-side` with no `Config`; a greeting of `boom` makes apply throw), `fbtest-settings-dsh` (selected: on in DSH, with a `Config`, no description, no icon) `fbtest-settings-bad` (fishball-only; its patch config misses a required field) and `fbtest-settings-leak` (fishball-only; its patch gives the secret number `pin` a string, so the raw schema error would repeat the secret after " but got ").
- Each fixture row's apply records its mounted entry id and the config it received (volatile fields read through their getter, as S30 did) in the worker's store (`settingsRow`, `plainConfig` in [support/fixture-tools.mjs](support/fixture-tools.mjs)). Private-tree rows are told apart by their documented `fbo-` prefix (§4 "Row ids").
- New worker operations: `settingsEvents`, `settingsLive` (the latest apply's config read now) and `setBundleEnabled` (DSH's plugin manager, your own move on DSH's Installed tab). `bootLive(home, {env})` passes extra environment.
- New helpers in [support/expect.mjs](support/expect.mjs): `Schema` (DSH's Schemastery), `expectedDsh`/`expectedRuns` (the decision tables), `detailOf`, `getIcon`, `saveSettings`, `userOf`, `valueOf`, `storedRecord`, `assertNoSecret` (five sentinels: the patch's top-level, nested, list and error secrets, and yours), `assertCutError`, `withoutSecrets`, `settingsAudit`, `privateApplies`, `untilApply`, `promptLine`, `quiet`.
- The scripted approver can hold a `set_plugin_settings` prompt open, and `holdNext` then holds Fishball's next model request, so a test can look at the state after Allow once while Fishball's turn is still running.

### [manager-catalog.test.mjs](manager-catalog.test.mjs): snapshot fields

| id | technique | expected result |
|---|---|---|
| MCAT-01 | EP | every entry has 20 keys (`PLUGIN_KEYS`); `dsh`, `runs`, `settings` from their enums; `packageName`/`version`/`description` string or null; `meta` null or `{title?, description?}` as DSH's LocalizedText (A115); `hasIcon` boolean |
| MCAT-02 | DT (kind × on) | for every entry, `dsh` from its kind and `runs` from kind and on |
| MCAT-03 ×3 | ST off→on→off (user route) | fbtest-settings-dsh dsh→everywhere→dsh; fbtest-settings and builtin:ask-user nowhere→fishball→nowhere |
| MCAT-04 | EP (built-in) | `packageName` and `version` null; `dsh` builtin |
| MCAT-05 | EP | fbtest-settings: its name, 1.2.3, its description, hasIcon true; fbtest-settings-dsh: its name, 0.0.1, description null, hasIcon false |
| MCAT-06 | DT (settings state) | fbtest-settings-dsh `none`; builtin:messenger `none`; builtin:time and fbtest-settings `default`; a save → `changed`; reset all → `default` |
| MCAT-07 | EP (secret) | after you set a secret: neither secret in the route's answer, GET state, the SSE frames or list_plugins |
| MCAT-08 | EP (installed in Fishball only) | after add_plugin (Allow once): `dsh` none, `runs` fishball, packageName fbtest-added, version 0.0.1, settings default; off → nowhere |
| MCAT-09 | EP | package.json, cordis.patch.yml and lockfile byte-identical |

### [manager-detail.test.mjs](manager-detail.test.mjs): GET detail and GET icon

| id | technique | expected result |
|---|---|---|
| DET-01 | EP | 200 `{ok:true, detail}` with the 5 keys; rows `[fbtest-settings, fbtest-settings-side]` in patch order (A124), each with the 9 keys; module names the package |
| DET-02 | EP (row with a schema) | `schema` rebuilds with `new Schema(json)`, has the 11 fields and resolves `base`; `base` = the patch config resolved with every secret (token, auth.key, accounts[0].secret) removed (A125); `user` {}; `value` = base; `secrets` [{accounts.0.secret}, {auth.key}, {token}], each set; `error` null; `editable` true |
| DET-03 | EP (no schema) | `schema` null, `editable` false, `error` null |
| DET-04 | EP (secret) | neither secret in the answer, before or after you set one; `token` absent from base, user and value; still `set` |
| DET-05 | EP | reading an off plugin's detail (fbtest-settings, fbtest-settings-bad) records no apply; still off and unapplied |
| DET-06 | DT (on in DSH) | shared true, settings none, every row editable false |
| DET-07 | DT (Compaction engine row) | builtin:compaction lists compaction-basic with editable false; shared false |
| DET-08 | EP (no rows) | builtin:messenger: rows [], settings none |
| DET-09 | EP (invalid patch config) | error a non-empty string; schema present; editable true |
| DET-10 | BVA (0, 9, 10, 11 changes) | history lengths 0, 9, 10, 10; keys {action, by, at, outcome}; newest first; by user; outcome ok (A122); the 11th drops the oldest |
| DET-11 ×3 | EP | no query, a wrong parameter name: 400 bad-body; an empty plugin: 400 bad-body or 404 unknown (A117) |
| DET-12 ×3 | EP | unknown key, dsh-fishball, wrong case: 404 unknown |
| DET-13 | DT (icon, no icon, unknown) | fbtest-settings: 200 `image/svg+xml` with the fixture's file; fbtest-settings-dsh and an unknown key: 404 unknown (A123) |
| DET-14 | EP (no cookie) | detail and icon not 200, no secret |
| DET-15 | EP | profile files byte-identical |
| DET-16 | EP (error with rejected secret data) | fbtest-settings-leak: `rows[].error` a non-empty message without "but got" or the secret; the whole answer carries neither |

### [manager-settings-route.test.mjs](manager-settings-route.test.mjs): POST settings (one host, in order; fbtest-settings and fbtest-only on)

| id | technique | expected result |
|---|---|---|
| SET-01 ×16 | EP/BVA (body shapes) | invalid JSON, array, {}, plugin or row missing or a number, neither values nor reset, values null/array/string/number, reset an object/strings/number segment/null: 400 bad-body; nothing stored |
| SET-02 ×5 | EP | unknown plugin, dsh-fishball, unknown row, another plugin's row, builtin:messenger: 409 unknown |
| SET-03 ×2 | EP (on in DSH) | fbtest-settings-dsh, fbtest-tools: 409 shared-with-dsh; nothing stored; settings stays none |
| SET-04 ×2 | EP | the row without a schema, the Compaction engine row: 409 no-settings |
| SET-05 | ST idle default→changed | 200 `{ok:true, state}` with settings changed; user {limit:7}; the row's apply gets 7; the side row and fbtest-only are not restarted; one audit `settings`/user/ok; the stored record has the row's values and changedBy user |
| SET-06 ×9 | BVA (1, 10 valid; 0, 11 invalid) + EP | 1, 10: 200; 0, 11, 2.5, "many": 400 invalid path [limit]; mode, nested.b, enabled: their paths; stored values unchanged |
| SET-06b | EP (rejected data) | invalid limit "<rejected>": 400 [limit] and the answer lacks the value; fbtest-settings-leak {note:2}: 400 [pin], no secret, no "but got" |
| SET-07 | EP | nested.a then nested.b both stored; tags [x,y,z] then [q] → [q] |
| SET-08 | ST reset path | reset nested.a → value x, sibling kept; reset greeting → hello (the patch's, not the schema's hi), received by the plugin |
| SET-09 | DT (values + reset) | user has limit 4 and no greeting |
| SET-10 | ST changed→default (reset []) | user {}; value = base; settings default; record deleted; the plugin receives the base config and the patch secret |
| SET-11 ×2 | BVA (empty) | `{values:{}}` and `{reset:[]}`: 200, nothing stored, no audit entry (A121) |
| SET-12 | EP (secret) | your secret: 200; no secret in the answer, detail or state; set; the plugin receives it; reset → the patch's again |
| SET-13 | ST (mid-turn) | saved at once; not applied while the turn is held; applied after it ends |
| SET-13b | ST (mid-turn save, then a listing mount) | save {limit:5} while Fishball is held; Fishball's set_plugin_enabled then mounts fbtest-only-b to list its tool (prompt held): the settings row never gets 5 mid-turn; after Reject and the turn end it does; fbtest-only-b stays off |
| SET-14 | EP (volatile) | the plugin's live config shows two; no new apply of either row |
| SET-15 | ST on→off row-failed | greeting boom: off with lastError row-failed, value kept; reset and on again → mounted with hello |
| SET-16a | ST (invalid patch config) | {size:3}: 400 invalid [name]; nothing stored |
| SET-16b | ST | {name:n}: 200, error null; then {size:3}: 200 |
| SET-16c | ST (a reset that leaves values) | reset [name] leaves {size:3}: 400 invalid [name]; values kept |
| SET-16d | ST (resets that leave no values) | reset [name],[size]: 200; user {}; the plugin's own error again; record deleted (A118) |
| SET-16e | ST (reset []) | {name:m} then reset []: 200; user {}; error again |
| SET-17 | EP (no cookie; foreign Origin with the cookie) | not 200; nothing stored |
| SET-19 | EP (no-change saves) | with {limit:7} stored: {limit:7}, a reset of an unset field, and both together: 200; no audit entry; the stored record identical, changedAt included (A128) |
| SET-18 | EP (afterEach) | profile files byte-identical after every case |

### [manager-settings-tools.test.mjs](manager-settings-tools.test.mjs): get_plugin_settings and set_plugin_settings (one host, in order; your secret set first)

| id | technique | expected result |
|---|---|---|
| GPS-01 | EP | no prompt; `{ok:true, plugin, shared:false, rows:[main only]}`; every listed path; non-secret fields have exactly {path, kind, description, pluginValue, value, changed, secret}, and `mode` (a fixed list) also `choices` = [fast, slow] (A120); unchanged; plugin values from the patch |
| GPS-02 | EP (secret, top-level, nested, in a list) | token and auth.key: exactly {path, kind, description, secret:true, set:true, changed}; other fields secret false (accounts not asserted, A127); accounts, when shown, is [{name:a1}]; auth.user plain; no secret in the result |
| GPS-07 | EP (error with rejected secret data) | fbtest-settings-leak: the row's error without "but got" or the secret; no secret in the result |
| GPS-03 | EP | unknown plugin: `{ok:false, code:'unknown-plugin'}`, no prompt |
| GPS-04 | EP (on in DSH) | `{ok:true, shared:true, rows:[]}` (A119) |
| GPS-05 | EP | compaction-basic not among the rows |
| GPS-06 | EP | fbtest-settings-bad: error a non-empty string |
| SPS-01 ×20 | DT (refusal order) | each row also breaks every later rule and answers the earliest code: unknown-plugin; shared-with-dsh; unknown-row (also for builtin:messenger); no-settings (side row, Compaction engine); secret-field (with an invalid value; a cleared secret; a nested secret with an invalid value; a nested secret beside a changed sibling; a list of objects holding secrets, with and without them; the parent object of a secret replaced; a path under a secret); invalid [limit], [limit] with rejected data, [nested, b] (with an unchanged field), [name] (invalid patch), [pin] (invalid patch holding a secret); no-change. No refusal repeats rejected data or "but got". The approver would Allow, yet no prompt is raised; values, audit and the plugin unchanged; no secret echoed |
| SPS-02 | ST (prompt open) | stored values unchanged and no audit while the prompt waits |
| SPS-03 | DT (Reject) | `rejected`; unchanged; never applied; one audit `settings`/fishball/rejected |
| SPS-04 | EP (prompt text) | toolName set_plugin_settings; names fbtest-settings and its row; `limit: 3 → 8` and `nested.a: "x" → "z"`; Fishball's reason; no secret |
| SPS-05 | DT (Allow once) + ST (mid-turn) | `{ok:true, plugin, row, changed:[limit, nested.a], note}`; saved at once; not applied while Fishball's next request is held; applied after the turn with your secret kept; one audit `settings`/fishball/ok; stored changedBy fishball |
| SPS-06 | EP | limit changed true, value 8, pluginValue 3; greeting unchanged |
| SPS-07 ×2 | BVA (JSON 200 / 201 bytes) | 198 characters shown whole; 199 shown as a prefix of ≤ 200 bytes, never whole |
| SPS-08 | EP | `{limit: 8}` after the save: no-change, no prompt |
| SPS-10 | EP (beside a nested secret) | {auth:{user:v}}: one prompt with `auth.user: "u" → "v"`; no secret in the prompt or the answer |
| SPS-11 | ST (your save while the prompt is open) | your {mode:slow} during the prompt and Fishball's {greeting:F} after Allow once are both stored |
| SPS-12 | ST (re-check at save time) | {name:n} stored; Fishball proposes {size:5}; you reset all during the prompt; Allow once answers invalid [name]; nothing saved |
| SPS-09 | EP (afterEach) | profile files byte-identical after every case |

### [manager-stale.test.mjs](manager-stale.test.mjs): Q-manager-stale and restart (one home, in order)

| id | technique | expected result |
|---|---|---|
| STL-01 | ST default→changed | on for Fishball, {limit:6} saved: settings changed, the private row receives 6 |
| STL-02 | ST fishball-only→profile (DSH's setBundleEnabled) | kind profile, dsh on, settings unused; detail shared, unused, user {limit:6} kept, nothing editable; DSH's own row gets 3, never 6 (checked when DSH applies the move live, A126); no private mount |
| STL-03 | EP (shared) | route 409 shared-with-dsh; tool shared-with-dsh with no prompt; values kept; profile unchanged by these actions |
| STL-04 | ST profile→fishball-only | kind fishball-only, settings changed, user {limit:6}; the private row receives 6 again |
| STL-05 | ST restart | settings changed, user {limit:6}; the private row receives 6 after the restart |

### Browser behaviour (checked live, not by this suite)

The Fishball tab, the plugin page and settings form, the tag and switch on DSH's bundle pages and the summary line on Fishball's settings page are browser-only (§10d "Where it appears", "Look", "The list", "The plugin page"). They are checked in a real browser against DSH's Installed tab in light and dark, as the P12 exit says.

### Ambiguities (P12)

- **A115. "DSH's localized title and description".** Read as DSH's `LocalizedText`: a string, or translations by language with a required `en` string. The browser picks the UI language (§10d "The list"). MCAT-01 accepts both forms.
- **A116. list_plugins carries the new fields.** §10d names only the snapshot. PHT-01 (P3) requires the snapshot catalog to equal list_plugins, and `PLUGIN_KEYS` is shared, so CAT-02 now also expects the 20 keys from list_plugins.
- **A117. An empty `plugin` query.** "Without plugin" clearly covers a missing parameter. An empty value is accepted as either 400 bad-body or 404 unknown.
- **A118. Resets on a row whose own patch config is invalid (decided, now in DESIGN §10d).** Removing all of a row's values is never refused, whether by `reset [[]]` or by resets that leave the row with no values (SET-16d/e). Any save that leaves values stored is still checked and refused 400 invalid with the path (SET-16a/c).
- **A119. get_plugin_settings for a plugin on in DSH.** It is refused only for an unknown plugin and lists "the rows with a schema that can be edited", so a shared plugin answers `{ok:true, shared:true, rows:[]}`.
- **A120. Exact field keys (decided, now in DESIGN §10d).** GPS-01/02 expect exactly `{path, kind, description, pluginValue, value, changed, secret}`, plus `choices` on a field with a fixed list of values and on no other field; a secret field has `set` instead of the two values. Any other extra key fails.
- **A121. Empty `values` and `reset`.** `{values:{}}` is "a plain object" and `{reset:[]}` "an array of paths", so both are valid bodies that change nothing (200).
- **A122. The outcome of a change that went through.** §10d names only `rejected`. Earlier plugin-change audits record `ok`, which DET-10 and SPS-05 expect.
- **A123. The icon of an unknown plugin.** §10d names 404 `unknown` for a plugin without an icon; an unknown plugin is expected to answer the same.
- **A124. Row ids.** `row` in the detail, the route, the tools and `plugin_settings` is the row's own id from the bundle patch, not the private tree's `fbo-` id.
- **A125. Volatile and secret values in `base`.** `base`, `user` and `value` hold plain values: a `.volatile()` field shows its value (`live: 'one'`), and a secret field's key is absent (DSH's `redactSecrets` removes it).
- **A127. A list of objects holding secrets in get_plugin_settings.** Whether `accounts` is listed, and whether it is marked `secret`, is not specified. Only its value is checked: when shown, it carries no secret.
- **A128. "A save that changes nothing".** Read as: the stored values after the merge and resets equal those before. Resetting a field that is not stored, or saving a value already stored, changes nothing. Saving a value equal to the plugin's own value when nothing is stored for it is not asserted.
- **A126. Moving a plugin to DSH and back.** Done live through DSH's plugin manager (`setBundleEnabled`), as on DSH's Installed tab. The check that DSH's own row gets the plugin's value runs only when DSH reports the move applied live. After moving back, the plugin's stored on/off choice may mount it at once, so STL-04 turns it on only when it is off.

### Cases changed by P12

- **`PLUGIN_KEYS`** ([support/constants.mjs](support/constants.mjs)) gains `description`, `dsh`, `hasIcon`, `meta`, `packageName`, `runs`, `settings` and `version` (20 keys). This covers CAT-02, MSL's key checks and the plugin-statuses key check (A116).
- **`FISHBALL_TOOLS`** gains `get_plugin_settings` and `set_plugin_settings`. CAT-01 then expects them only for Fishball, CAT-08 in its default request and CAT-09 not in the global list.
- **The worker's `drive` results** leave out the replacements DSH's tool-result pruner appends: a `tool/result` right after a `compaction/prune` event is a shortened copy of an earlier result, not a result of the turn's calls (`dsh-compaction-tool-result-pruner`). With the new fields, list_plugins answers are larger. In plugins-toggle, Fishball's context reached the pruner during ONLY-04's list_plugins turn, and the old slice returned ten results, so the helper's "exactly one result" check failed. Call ids are not deduplicated, because MSG-07 reuses them on purpose. No assertion changed.

## Revision 10a cases (Install for Fishball; DESIGN §10d "Install for Fishball", §4 "Who changes what", S31, Q-install-route, Q-install-10a)

**Requirement summary.** `POST /api/fishball/plugins/install` (the spec handed to Fishball's chat) is removed. Three routes replace it, each answering 400 `bad-body` for a malformed body and 409 `unavailable` before Fishball is ready:
- `POST /api/fishball/install/inspect` (`{spec}`): Fishball's own checks first (409 `invalid-spec`, `already-installed` in Fishball's folder, `no-profile`), then `{ok:true, inspection}`, DSH's `PluginSpecInspection` (accepted with `kind`, `name?`, `version?`, `description?`, `bundle`, `registry`, `host?`; or refused with `problem` and `reason`). Nothing is installed.
- `POST /api/fishball/install` (`{spec, requestId, approvedBuilds?}`): installs into Fishball's own folder through DSH's inherited install process; your call is the approval. It answers `{ok:true, plugin:'fishball:<name>', name, version, on}`, or `on:false` with `code` when turning it on was refused. Refusals are 409 with a PACKAGE_ERROR code. A success turns the plugin on for Fishball (changed by you) and is audited `add` by you. The DSH profile's files never change.
- `POST /api/fishball/install/cancel` (`{requestId}`): `{ok:true, outcome}`, where the outcome is DSH's answer: `cancelled`, `too-late` or `not-running`.
- DSH's `plugin-manager/install-state` and `install-log` events carry the request id.

`add_plugin` installs through the same process after its Allow once.

**Harness additions.** The worker records every `plugin-manager/install-state` and `install-log` event on the host bus (`installEvents` op, with the payload's `requestId`). New constants: `INSTALL_API`, `PACKAGE_ERRORS` (adds `cancelled` and `build-blocked`), `CANCEL_OUTCOMES`, `INSPECT_STATUS`, `INSPECT_PROBLEM`, `INSTALL_EVENTS` and `ADD_ACTION`. `API.removedPluginsInstall` and `API.unknownRoute` are used for the absence check.

### [manager-install.test.mjs](manager-install.test.mjs): the install routes (one new-install host, in order)

| id | technique | expected result |
|---|---|---|
| INS-01 ×25 | EP/BVA (body shapes) | inspect: invalid JSON, array, {}, spec 1/null/''/blanks. Install: the same plus spec missing, requestId missing/''/1, approvedBuilds a string, an object, [1] or ['']. Cancel: invalid JSON, {}, requestId ''/1. Each answers 400 bad-body, and nothing is installed |
| INS-02 | EP (accepted) | a local bundle folder: `{ok:true, inspection:{status:'accepted', kind:'path', name, version:'0.0.1', bundle:true, registry}}`; nothing installed; no entry |
| INS-03 ×2 | DT (refused by DSH) | a missing absolute folder: refused, not-found or not-a-package (A129); a folder without a bundle: refused, not-a-bundle; reason a string |
| INS-04 ×2 | EP | `./fbtest-rel`, `../fbtest-rel`: 409 invalid-spec (Fishball's own check) |
| INS-05 | ST not installed→installed, on | `approvedBuilds: []` (BVA, valid). Answer `{ok:true, plugin:'fishball:fbtest-added', name, version:'0.0.1', on:true}`. A `file:` dependency in `.fishball-plugins` resolving inside that folder, not to the source. The entry is fishball-installed, dsh none, runs fishball, on, changedBy user. added_echo stays unchecked. Audited add/user; no prompt; DSH's bundle list unchanged |
| INS-06 | EP | install-state and install-log events carry `fbtest-ins-05` |
| INS-07 | ST installed→install again | inspect and install: 409 already-installed; one entry |
| INS-08 | EP (no bundle) | 409 not-bundle; gone from Fishball's folder (package.json and node_modules) within 30 s (A130); no entry |
| INS-09 | EP (nothing at the path) | 409 with a code from `PACKAGE_ERRORS` |
| INS-10 | EP (cancel, unknown request) | 200 `{ok:true, outcome:'not-running'}` (A131) |
| INS-11 | DT (installed, turning on refused) | maxFishballOnlyPlugins 1 with fishball:fbtest-added on: `{ok:true, plugin:'fishball:fbtest-added-b', name, version, on:false, code:'limit-reached'}`; installed; entry off |
| INS-12 | EP (afterEach) | profile files byte-identical. They are snapshotted again after the limit is lowered, because the limit is profile config (§9) |

### Ambiguities (revision 10a)

- **A129. A missing local folder.** DSH classifies it; observed `not-a-package`. INS-03 accepts `not-found` or `not-a-package`.
- **A130. "Not-a-bundle refused and undone".** The refusal may answer before the removal finishes, so INS-08 and STA-16 wait up to 30 s. Observed: the dependency leaves package.json, but `node_modules/fbtest-notbundle` stays until a later pnpm run. INS-08 counts that as kept (§4 "removed again").
- **A131. Cancel's `outcome`.** "`{ok: true, outcome}`, DSH's answer: `cancelled`, `too-late` or `not-running`" is read as the outcome being that string. DSH's own `cancelInstall` answers `{status}`.

### Cases changed by revision 10a

- **plugins-status:**
  - STA-17 (7 bad bodies of the removed route) is now one case: the removed route answers what DSH answers for a path no route serves (not 200), and Fishball receives nothing.
  - STA-18 (too-large) and STA-23 (queue-full) are removed, because they covered the removed route.
  - STA-19 now installs fbtest-added-b through `POST /api/fishball/install`: no prompt, on, changedBy user, profile unchanged. STA-20 still uninstalls it.
  - STA-24 covers the remove route and the three install routes.
  - STA-25 (core failed) expects 409 unavailable from install/inspect and install.
  - STA-16 waits for the undo (A130).
- **plugins-status, Refresh (DESIGN §10d "Refresh"):** new cases. STA-26: `POST /api/fishball/plugins/refresh` `{}` answers 200 `{ok:true, state}` whose catalog lists fishball:fbtest-added-b (installed in STA-19). STA-27: a bundle the test links into the profile while DSH runs, without DSH's plugin manager (new fixture [fbtest-refresh](support/fixtures/fbtest-refresh/index.js), `REFRESH_BUNDLE`), is in the refresh answer's catalog as fishball-only and off, and none of its code ran. STA-28 ×5: invalid JSON, array, string, number or null answers 400 bad-body. STA-24 also covers refresh without the cookie, and STA-25 expects 409 unavailable from it while the core failed (now ×3).
- **messenger-author:** AUT-04 (the install request's author) is removed with its input kind, and the P11 author table row "install request (POST plugins/install)" no longer applies.

## Revision 10b cases (blocked plugins; DESIGN §4 "Auditing" → "Plugins that publish a service" and "Known before trying", §10d `blocked`, S1, S32)

Requirement (as given to the test author): every catalog entry gains `blocked`: `edits-other-rows`, `no-rows` or `no-profile` (read from the plugin's patch when the list is read), or `leaks-service` (once Fishball turned the plugin off for publishing a service, until it is reinstalled or its choice is reset); otherwise null. A blocked plugin that is off offers no `enable` action; one installed in Fishball only still offers `uninstall`. Turning it on through `POST /api/fishball/plugins` answers 409 `refused`; `set_plugin_enabled` refuses with the blocked code. A plugin whose rows publish a service is still turned off with lastError `leaks-service` (the isolation tried in S32 was not adopted).

**Harness additions.** Worker op `rootServices({names})`: whether each service resolves from DSH's root context. New fixtures: [fbtest-installed-edits](support/fixtures/fbtest-installed-edits/index.js) (self-contained; its patch edits the fbtest-tools row; installed for Fishball only by BLK-06) and [fbtest-installed-leak](support/fixtures/fbtest-installed-leak/index.js) (self-contained; provides `fbtestInstalledLeaked`; installed into the profile while DSH runs by BLK-08). New constants: `BLOCKED`, `DSH_BLOCKED_BUNDLES`, `INSTALLED_EDITS_BUNDLE`, `INSTALLED_LEAK_BUNDLE`, `CODE.leaksService`, and the `service` names of `REVIEW_BUNDLES.leak`/`leakB`. `expectedActions` drops `enable` for a blocked entry that is off, and `assertEntryContract` checks `blocked` is null or one of `BLOCKED`.

### [plugins-blocked.test.mjs](plugins-blocked.test.mjs): one host with the defective fixtures (`FBTEST_REVIEW_BUNDLES=1`), in order

| id | technique | expected result |
|---|---|---|
| BLK-01 ×13 | DT (patch shape × kind) | In GET state and list_plugins: fbtest-edits and fbtest-idinsert `edits-other-rows`, fbtest-norows `no-rows`, each off with actions []. fbtest-only, fbtest-leak (not tried yet), fbtest-tools (kind profile) and the 7 built-ins: null with their usual actions |
| BLK-01b | EP (S32) | DSH's agent-team and session-titles bundles, when the installation ships them: `edits-other-rows`, actions [] |
| BLK-02 ×2 | DT (patch reason × route/tool) | fbtest-edits, fbtest-norows: POST on answers 409 `{ok:false, code:'refused'}`; set_plugin_enabled `{ok:false, code:<blocked>}` with no prompt; still off and blocked, actions []; its code never ran |
| BLK-03 | ST null → leaks-service | fbtest-leak turned on by the user: off, lastError and blocked `leaks-service`, actions []; every apply disposed; its service not left in DSH's root realm; fbtest-only keeps running; assistant live; profile files unchanged |
| BLK-04 | ST leaks-service → on | POST on 409 refused; set_plugin_enabled `{ok:false, code:'leaks-service'}`; no new apply; still blocked |
| BLK-05 | ST (Fishball turns it on) | fbtest-leak-b by set_plugin_enabled with Allow: answer ok:false leaks-service or ok:true (A132; observed ok:false leaks-service); ends off, blocked `leaks-service`, not running, service not in the root realm |
| BLK-06 | DT (installed for Fishball only × edits other rows) | install 200 `{ok:true, plugin:'fishball:fbtest-installed-edits', on:false}`; entry fishball-installed, blocked `edits-other-rows`, actions [uninstall]; code never ran; the uninstall route answers 200 and the entry goes; profile files unchanged |
| BLK-07 | ST (restart) | fbtest-leak still off with lastError and blocked `leaks-service` after a restart; its code did not run at the boot |
| BLK-08 | ST leaks-service → removed → installed again | fbtest-installed-leak installed (not enabled) through DSH's plugin manager and turned on: blocked `leaks-service`; removed and installed again: blocked null, off, actions [enable] |

### Ambiguities (revision 10b)

- **A132. Fishball turning on a service-publishing plugin nobody tried.** The leak may be found in the mid-turn listing mount (answer `{ok:false, code:'leaks-service'}`) or only at the idle apply (answer ok:true). BLK-05 accepts either and checks the end state. Observed: ok:false leaks-service.
- **A133. Not covered.** `no-profile` (Fishball always runs with a profile in the test homes) and clearing `leaks-service` by resetting the choice ("or its choice is reset" names no route).

### Cases changed by revision 10b

- **Entry keys:** `PLUGIN_KEYS` gains `blocked` (21 keys), so the key checks of plugins-catalog CAT-02, plugins-status STA-01, manager-catalog and messenger-catalog MSL-01 expect it.
- **Actions:** `expectedActions` (used by `assertEntryContract` in plugins-catalog, plugins-status, plugins-upgrade and messenger-catalog) no longer expects `enable` for a blocked entry that is off: DSH's own bundles that edit other rows, fbtest-edits, fbtest-idinsert and fbtest-norows now offer [].
- **plugins-defaults DEF-01/02/07/08/09:** `assertOff` expects `expectedActions(p)` instead of `[enable]`, because DEF-02 covers DSH's optional bundles, two of which are blocked `edits-other-rows`.
- **Not changed:** REV-08 (plugins-review) and BRK-01 (plugins-review2) still expect a service-publishing plugin to end off with `leaks-service` (A33: observed `leaks-service`); BLK-03 to BLK-05 now require it.

## Revision 10c cases (Fishball's own plugins; DESIGN §10d "Fishball's own plugins", Q-own-plugins, Q-own-plugins-open)

**Requirement summary.** Every tool Fishball registers belongs to a catalog plugin. Four new built-ins (kind `builtin`, no rows) and the Messenger look form the first group, "Fishball". These five entries report `dsh: 'fishball'`, and every other built-in keeps `'builtin'`:
- Session messages (`builtin:session-messages`): message_session, start_session, and message_fishball with status `other-sessions`.
- Session watching (`builtin:session-watching`): watch_session, list_watches, unwatch_session, read_session.
- Plugin management (`builtin:plugin-management`): the six plugin tools.
- Permission requests (`builtin:permission-requests`): answer_approval.

The rules:
- **otherTools.** It no longer holds message_fishball.
- **Defaults.** Each of the five is on by default, on a fresh install and on an existing one.
- **Applied state.** Each follows its applied state, which changes at the idle-phase apply. The snapshot's `features: {messages, watching, plugins, approvals}` follows the applied state too (coordinator's correction).
- **Off removes the feature:**
  - Session messages: its tools are masked, message_fishball is unregistered for every session, and `POST send` answers 409 `feature-off`.
  - Session watching: its tools are masked and `POST watches` answers 409 `feature-off`. notify_when_finished still delivers the message but answers `watchError: 'feature-off'`. Existing watches stay active. A turn end while it is off sends no notice and is passed over. Remove still works.
  - Permission requests: requests go to DSH's normal prompt, waiting ones are released at once, and answer_approval is masked.
  - Plugin management: only its tools are masked.
- **Who may switch:**
  - The user switches freely.
  - Fishball turns any of the four off freely.
  - Turning one of the four on raises a prompt, "Fishball asks to turn on …". Only Allow once grants it; otherwise the answer is `{ok:false, code:'rejected'}`.
  - The Messenger look keeps free switching.
  - Fishball's own tools stay trusted, so they are never unchecked.

**Harness additions.** New constants: `OWN_PLUGINS`, `FISHBALL_GROUP_KEYS`, `FEATURE_KEYS`, `FEATURE_OFF`, `OWN_ASK`, `PRE_OWN_PLUGINS` (commit 90a6a8c), `TOOL_STATUS.otherSessions` and `DSH_STATE.fishball`. `expectedDsh` returns `fishball` for the Fishball group.

### [own-plugins.test.mjs](own-plugins.test.mjs): catalog and switches (one new-install host, in order)

| id | technique | expected result |
|---|---|---|
| OWN-01 ×5 | EP (each Fishball-group entry) | kind builtin, dsh fishball, status builtin, on, applied, [disable], changedBy null, its title, exactly its tools |
| OWN-02 | EP | own tools visible; message_fishball (and since rev11b ask_fishball, list_user_messages) other-sessions |
| OWN-03 | EP | no own tool in otherTools (state and list_plugins); each under exactly one plugin |
| OWN-04 | EP | the 7 DSH built-ins dsh builtin; exactly the 5 group keys dsh fishball |
| OWN-05 | EP | features all true in GET state and the first SSE frame |
| OWN-06 | EP (Fishball / managed session) | Fishball has its tools but none of the three for other sessions; a managed session has only message_fishball, ask_fishball and list_user_messages (rev11b) |
| OWN-10 ×4 | DT (user × own × off/on, idle) | no prompt; off applied at once, features false, tools plugin-off and absent; on: visible (never unchecked), features true |
| OWN-11 ×3×3 | DT (Fishball × messages/watching/approvals × off / on+Reject / on+Allow once) | off: no prompt, the same turn keeps the tools, the next request lacks them. Reject: one prompt with "Fishball asks to turn on" and the title shown on the tab (A135), `rejected`, stays off. Allow once: on, tools back, no unchecked |
| OWN-12 | DT (on × unavailable) | `rejected`, stays off |
| OWN-13 | ST (Fishball turns Plugin management off) | only its tools are masked; features `{plugins:false}` and the rest true; the masked set_plugin_enabled is a tool error and changes nothing; the user turns it back on |
| OWN-14 ×2 | DT (Fishball × Messenger look / ask-user × on) | no prompt, ok |
| OWN-15 ×6 | DT (remove) | POST plugins/remove: 409 refused for the five; remove_plugin: not-removable, no prompt |
| OWN-16 ×3 | BVA (near-miss keys) | 409 unknown |
| OWN-17 | EP (Fishball × own plugin already on × on) | no prompt, ok, stays on |
| OWN-18 | ST (your off arrives during Fishball's turn, before its set_plugin_enabled(on)) | the off holds: one prompt (Reject → `rejected`), or `ask-first` without a prompt; stays off |
| OWN-19 ×6 | ST (race: your off POSTed while Fishball's set_plugin_enabled(on) of an on plugin runs; offsets 0–75 ms) | the off holds without an Allow once. The answer is ok without a prompt (your off came after the write), `rejected` after a prompt, or `ask-first` without a prompt; the plugin ends off (A142) |
| OWN-20 | ST (user off while Fishball is held) | applied stays true; features.messages true and message_fishball registered until the turn ends; then both off; an ordinary request lacks it |
| OWN-21 | ST (user on while held) | applied false; POST send 409 feature-off and message_fishball absent until the turn ends; then back, send 200 |
| OWN-30 | EP (invariant over every SSE frame) | `features[f] === entry.applied` |

### [own-plugins-features.test.mjs](own-plugins-features.test.mjs): Session messages and Session watching off (one host, in order)

| id | technique | expected result |
|---|---|---|
| OFM-01 | precondition | message_fishball global and in an ordinary request; send 200 |
| OFM-02 | ST on→off | features.messages false; message_fishball leaves the global list and the ordinary request; message_session/start_session plugin-off and absent for Fishball |
| OFM-03 | EP | POST send 409 feature-off; nothing delivered |
| OFM-04 | EP (guard) | Fishball's message_session is a tool error; the target gets nothing |
| OFM-05 | ST off→on | message_fishball back and works; send 200 |
| OFM-06 | ST (an ordinary request made while on and held; the off applies; then it calls message_fishball) | `{ok:false, code:'feature-off'}`, or skipped as not reachable black-box when DSH refuses the unregistered tool itself; Fishball receives nothing |
| OFP-01 | ST (Plugin management off; the user turns on fbtest-tools, which has unchecked tools) | no unchecked-tools notice |
| OFP-02 | ST (Plugin management on; a fixture tool's schema changes) | unchanged: one new notice naming the tool |
| OFW-08 | DT (Session watching off × Fishball archived) | POST watches 409 `feature-off`, not unavailable |
| OFW-01 | ST on→off | features.watching false; 4 tools plugin-off and absent; watch_session call is a tool error |
| OFW-02 | EP | POST watches 409 feature-off; watches unchanged |
| OFW-03 ×3 | DT (message_session / start_session / message_fishball × flag × off) | ok:true, watchError feature-off, no `watch` key, delivered, no watch |
| OFW-04 | ST (active watch, target finishes while off) | no notice; active, firedCount 0 |
| OFW-05 | EP | POST watches/remove 200; closed |
| OFW-06 | ST off→on | no late notice for the passed-over turn end; still active |
| OFW-07 | ST (next turn end) | exactly one notice; closed |
| OFU-01 | EP | the served client bundle mentions `features` (hiding the buttons is checked by hand in a browser) |

### [own-plugins-approvals.test.mjs](own-plugins-approvals.test.mjs): Permission requests off (scripted answerer after the broker)

| id | technique | expected result |
|---|---|---|
| OFA-01 | precondition | a request is routed to Fishball, pending 1 |
| OFA-02 | ST (pending → user off while idle) | released to the normal prompt within 5 s; pending 0; features.approvals false; answer_approval plugin-off |
| OFA-03 | EP | a new request goes straight to the normal prompt (< 1 s); no request message |
| OFA-04 | EP | answer_approval absent from the request; a direct call is a tool error |
| OFA-05 | ST off→on | routed to Fishball again |
| OFA-02/06 (note) | EP (released by the feature going off) | Fishball's next turn carries no "timed out" note for those requests |
| OFA-07 | EP (control: feature on, approvalAnswerSeconds 1 runs out) | the timed-out note is in Fishball's next turn |
| OFA-08 | ST (Fishball archived while a request waits → unarchive, retry) | as before revision 10c: released to the normal prompt; no timed-out note (A141) |
| OFA-06 | ST (pending; user off while Fishball is held) | until the turn ends: features.approvals true, the request waits, a new one is still routed (pending 2). After the apply: both go to the normal prompt, features false, pending 0 |

### [own-plugins-upgrade.test.mjs](own-plugins-upgrade.test.mjs): existing install (old version 90a6a8c, Messenger look off there)

| id | technique | expected result |
|---|---|---|
| UPO-00 | precondition | the old version has no own plugins and no features |
| UPO-01 ×4 | DT (existing × no choice) | on, applied, dsh fishball, builtin, [disable], changedBy null |
| UPO-02 | DT (existing × stored off) | the Messenger look stays off (changedBy user), dsh fishball |
| UPO-03 | EP | features all true; message_fishball registered; no own tool in otherTools |
| UPO-04 | ST (user off → restart) | stays off; features.watching false; POST watches 409 feature-off |
| UPO-05 | ST (user on → restart) | on |

### Ambiguities (revision 10c)

- **A134. message_fishball's status while Session messages is off.** It is not specified whether it reads `plugin-off` or stays `other-sessions`. Only Fishball's two tools are asserted `plugin-off`.
- **A135. The prompt's wording and tool name.** The phrase "Fishball asks to turn on" and the title shown on the tab are asserted (review follow-up; the first build named the key). The prompt's toolName is logged (observed: `set_plugin_enabled`), not asserted.
- **A136. Fishball asking to turn on a plugin that is already on.** Read from review M1 ("it was on when Fishball checked", so Fishball decided not to ask): no prompt and ok (OWN-17).
- **A137. Unanswered outcomes.** "Only Allow once grants" is read as unavailable answering `rejected`, as `set_plugin_enabled` does for unchecked tools (TOG-02).
- **A138. Removing an own plugin.** These are built-ins, so removal is refused as for every built-in (STA-04/05).
- **A141. "When Fishball stops, the timed-out note behaviour is unchanged."** Observed with the same probe on 90a6a8c and on this version: after an archive while a request waits, then unarchive and retry, Fishball's next turn carries no timed-out note. OFA-08 encodes that baseline. OFA-07 checks the note on a real answer timeout.
- **A142. The ask-first race (review M1).** The window between Fishball's check and its write cannot be hit on purpose from outside. OWN-18 checks the deterministic part: an off that arrives before the call. OWN-19 fires the off at six offsets and asserts the invariant for whichever order happened; it logs each answer. If no run lands in the window, `ask-first` is simply not observed, and the case still passes.
- **A143. A message_fishball call after the off (OFM-06).** DESIGN lists it under Permission requests; the coordinator's follow-up places it under Session messages, as tested. If DSH refuses a tool that was unregistered after the request was made, Fishball's code never runs, and the case skips as not reachable.
- **A139. Releasing at the apply (OFA-06).** The release is expected after the turn ends, within the case's 20 s waits. No exact bound is stated.

### Cases changed by revision 10c

- **`STATE_KEYS`** gains `features` (18 keys). This affects HTP-01, PHT-01/04 and SND-01.
- **`TOOL_STATUS`** gains `otherSessions`, so CAT-02 accepts message_fishball's status.
- **`DSH_STATE`** gains `fishball`, and **`expectedDsh`** returns it for the Fishball group. This affects MCAT-01/02.
- **`CODE.askFirst`** (`ask-first`) is new (review M1).
- **MCAT-04** expects `expectedDsh(p)` for built-ins instead of `builtin` for all of them.

## Revision 11 rev11-limits cases (DESIGN §14 row rev11-limits; §16 "Plugin config: the safety limits", "Hard-coded limits moved to config", "Values that stay constants", decision rows "Limits: …")

Written black-box from DESIGN only. The sixteen fields and defaults are `LIMITS_R11` in [support/constants.mjs](support/constants.mjs); every minimum is 1 (§16 "Rules") except `replyCapShare`, whose minimum is 2 (addendum below). The worker gained one read-only operation, `settingsSchema`, which returns the row's form exactly as DSH's settings service describes it to its settings page (`describe().schema`).

### [limits-config.test.mjs](limits-config.test.mjs): the fields in the fishball row config (one host)

| id | technique | input | expected |
|---|---|---|---|
| L1 | EP (form) | DSH settings `describe()` schema of `fishball` | a field for each of the 16 names and the 12 existing ones; rebuilt with Schemastery, `{}` resolves to each default |
| L2 | EP (value, nothing saved) | settings value | each new field at its default; the 12 existing at theirs |
| L3 | EP (existing install) | save one old field (`maxQueuedInputs`) | the saved row config holds none of the 16 names; the value still shows every default |
| L4 ×16 | BVA (min) | each field = 1 | accepted; value 1; saved in the profile patch |
| L5 ×64 | BVA (min−1) + EP (negative, fraction, string) | 0, −1, 1.5, "5" | refused; patch file and value unchanged |
| L6 | BVA (large) | all 16 at ten times the default | accepted |
| L7 | ST (changed → defaults) | all 16 defaults in one update | accepted |
| L8 | EP (form minimum) | rebuilt form with 0, 1.5, 1 | 0 and 1.5 fail validation, 1 passes |
| L9 | DT (tool × Fishball's own row) | `set_plugin_settings` on `dsh-fishball`/`fishball`, approver would allow | `ok:false`, no prompt, value unchanged |
| L10 | EP | parameters of every tool in Fishball's request | none names a limit field |
| L11 | ST (live → updates → live) | after all of the above | same agent, not disposed, created once, status live |

### [limits-context.test.mjs](limits-context.test.mjs): context-window fields (one host, fake window 128000)

| id | technique | input | expected |
|---|---|---|---|
| L20 | EP (defaults) | N 40000 | outputCap 5000, threshold 30000 |
| L21 | BVA + ST | minWindowTokens 50000; N 49999, 40000, 50000 | 49999 and 40000 refused `window-too-small`, nothing stored; 50000 accepted |
| L22 | EP (the §14 example) | minWindowTokens 8192; N 6000 | `window-too-small` |
| L23 | ST (back) | minWindowTokens 4096; N 40000 | accepted, cap 5000 |
| L24 | EP | defaultReplyCapTokens 2000; N 40000 | outputCap 2000; next Fishball request maxTokens ≤ 2000 |
| L25 | DT (your cap wins) | defaultReplyCapTokens 2000; N 40000, O 10000 | outputCap 10000 |
| L26 | EP (the §14 example) | model window 400000; N 200000 at default, then defaultReplyCapTokens 16000 | outputCap 25000, then 16000 |
| L27 | EP | replyCapShare 4; N 40000 | outputCap 10000, threshold 25000 |
| L28 | EP | headroomShare 4; N 40000 | outputCap 5000, threshold 25000 |
| L29 | ST (all back) | defaults; N 40000 | 5000 / 30000 again |
| L30 | ST (no restart) | after all | same agent, created once, not disposed, live |

### [limits-live.test.mjs](limits-live.test.mjs): shown and excerpt fields (one host, approver after the broker)

| id | technique | input | expected |
|---|---|---|---|
| L50 | ST | readSessionMessages 12 → 3 → 1 → 12 on a 16-message session | 12, 3 (newest answer kept), 1, 12 |
| L51 | ST | readSessionBytes 12288 → 2000 → 12288, about 9 KB of answers | > 2000 text bytes, ≤ 2000, the default excerpt again |
| L52 | ST | watchesShown 50 → 2 → 50 with 1 active and 5 closed watches | state and `list_watches`: all, then ≤ 2 including the active one, then all |
| L53 | ST | intakeRowsShown 20 → 2 → 20 | ≥ 3 rows, exactly 2, the earlier count |
| L54 | ST | outboxShown 20 → 2 → 20 | ≥ 3 entries, exactly 2, the earlier count |
| L55 | ST | forwardExcerptBytes 100 then 3072, a 500-byte answer forwarded | ≤ 100 bytes and a prefix, then whole |
| L56 | ST | requestUserMessageBytes 100 then 2048, a 300-byte user message | `latest_user_message` ≤ 100 bytes and a prefix, then whole |
| L57 | ST | rationaleChars 10 then 500, a 60-character reason | audit rationale ≤ 10 characters and a prefix, then whole |
| L58 | ST (the §14 example) | approvalsShown 5 → 1 → 20 with ≥ 6 entries | 5, 1, all |
| L59 | ST (no restart) | after all | same agent, created once, not disposed, live |

### [limits-manager.test.mjs](limits-manager.test.mjs): plugin-manager fields (one host, settings fixtures)

| id | technique | input | expected |
|---|---|---|---|
| L60 | ST | pluginHistoryShown 10 → 3 → 1 → 10 after 4 changes | history 4, newest 3, newest 1, 4 (newest first) |
| L61 | ST | settingsPromptValueBytes 200 → 50 → 200, a 152-byte JSON value | whole, ≤ 50 bytes and a prefix, whole |
| L62 | ST (no restart) | after all | same agent, not disposed, live |

### [limits-source.test.mjs](limits-source.test.mjs): file checks (no host)

| id | technique | input | expected |
|---|---|---|---|
| L40 ×20 | EP (one per old name) | `index.js`, `client.js`, `packages/*/client.js`, `src/**/*.js` as text | no `OBJ.field`, `OBJ?.field` or `OBJ['field']` for each "Today in code" name and the four `FISHBALL_PACKAGES` package bounds (bare `OUTBOX_SHOWN`). Checked to fail against the pre-phase commit (every name found there) |
| L41 ×19 | EP (one per staying name) | same files | each constant §16 keeps (`maxTimerMs`, `HOUR_MS`, `idPattern`, `dshDefaults`, `minCapTokens`, the three `ctx.fishball` sizes, `nameBytes`, `maxSubagentDepth`, `resumeAttempts`, `resumeRetryMs`, `maxAttempts`, `modelInfoTimeoutMs`, `SEQ_DIGITS`, `DIGEST_HEX_CHARS`, `WORDS_PER_TOKEN`, `ROUNDING_GUARD`, `FIBER_ACTIVE`) is still named. Values are not read |
| L42 ×3 | EP | `docs/plugin-author-guide.md` | a line names the dedupe key with 256 bytes, the description with 1,024 (or 1024) bytes, and the title with 200 bytes |

### Addendum 2026-11-01: `replyCapShare` minimum 2 (user's decision)

`replyCapShare`'s minimum is now 2, so the automatic reply cap is never more than half the window. Every other field keeps its minimum. `LIMITS_R11.replyCapShare.min` is 2 in [support/constants.mjs](support/constants.mjs).

Changed existing cases (now computed from each field's `min`; other fields' inputs are unchanged):
- **L4** `replyCapShare` accepts 2 (was 1).
- **L5** inputs are min−1, −1, min+0.5 and "5", plus 0 where min > 1. For `replyCapShare` that is 1, 0, −1, 2.5, "5" (65 cases, was 64).
- **L8** the rebuilt form refuses min−1 and min+0.5 and accepts min: for `replyCapShare` 1 and 2.5 fail, 2 passes.

| id | technique | input | expected |
|---|---|---|---|
| L12 (limits-config) | BVA | `replyCapShare` 8, then 1, then 2 | 1 refused: profile patch, settings value and `state.limits` keep 8; 2 accepted: value, saved config and `state.limits` show 2 |
| L31 (limits-context) | ST + BVA | `replyCapShare` 8 → 2 → 1 → 8; N 40000 (floor(N/2) 20000 < `defaultReplyCapTokens` 32000) | at 2: outputCap 20000, threshold 15000, next Fishball request maxTokens in (5000, 20000]; 1 refused, `state.limits` keeps 2, cap stays 20000; back at 8: 5000 / 30000; same agent, not disposed, live throughout |

### Not automated (rev11-limits)

- **Package operations follow DSH's plugin-manager values** (`outputBytes`, `idleTimeoutMs`, `lockWaitMs`, `inspectTimeoutMs`), and DSH's defaults apply when its manager cannot be read. DSH's plugin-manager row has no live (volatile) settings form, so the settings service cannot change it in a running host. Showing the effect would need slow pnpm installs that are made to time out or overflow on purpose. L40 checks that the four Fishball constants are gone. The behaviour needs a review or a manual check.
- **`pluginManagerStartMs` taking effect.** It is covered as a config field (L1-L8). Making the inherited plugin manager start slowly is not reachable from the support code.
- **"Shown in the limits form on Fishball's settings page"** in the client. L1 checks the form DSH's settings service gives the page (`describe().schema`). Rendering is left to the visual pass.

### Ambiguities (rev11-limits)

- **A-L1. Minimums.** §16 says only that every value is a whole number of at least 1. The tests use min 1 for 15 fields, including `minWindowTokens` and `pluginManagerStartMs`, and 2 for `replyCapShare` (user's decision 2026-11-01, see the addendum).
- **A-L2. `watchesShown` with active watches.** "Older closed watches are not shown" can mean either that the cap counts all watches and the active ones are kept, or that only closed ones are capped. L52 asserts at most 2 shown with the active one among them, which holds under the first reading only. Under the second, 2 would be the closed count alone.
- **A-L3. Whether `state.limits` lists the new fields (resolved).** §16 makes each moved limit "a config field like those above", and §3 makes `Config` the one object every component reads limits from. So the default table is now 28 fields: the 12 original ones and the 16 moved ones. CFG-01 and CFG-08 (`config.test.mjs`) and HTP-01's `state.limits` key check (`http.test.mjs`) expect all 28 in the settings value and in `state.limits`, built from `LIMITS` plus `LIMITS_R11`.
- **A-L4. A stored window that the new `minWindowTokens` makes too small.** Not stated. L21 clears the window before raising the minimum.
- **A-L5. When a context-window field change shows in `state.contextWindow`.** Not stated whether a field change alone recomputes the shown cap and threshold of a stored window. The tests save the window again after each change (that save is the "next use").

## Revision 11 rev11a cases (managed sessions; DESIGN §14 row rev11a, §5b, §5e, §7a.1, §9, §10d, §10e; §16 Q-r11-managed, Q-r11-upgrade, Q-r11-plugins-off, Q-r11-subagent-tools, Q-r11-nongoals, Q-r11-defaults; S34, S37)

The user's amendment applies: in rev11a the per-agent registration holds `message_fishball` only (`ask_fishball` and `list_user_messages` come in rev11b and are not tested here), and the ways in built and tested are `start_session`, `message_session`, Hand over (`POST /api/fishball/managed {sessionId, managed:true}`) and Send to Fishball (`answer_prompt` is rev11e). "A permission request reaches Fishball" means a `[permission request apr_…]` notice in Fishball's session naming the session; "reaches its stock prompt" means the scripted answerer after the broker (`FBTEST_APPROVER_AFTER=1`) is asked within 1 s.

Support added: `MANAGED_*`, `RELEASE_TOOL`, `UNKNOWN_TOOL_TEXT`, `MANAGED_LABELS`, `PRE_REV11A`, `FISHBALL_WORD` (constants.mjs); `setManaged`, `managedNow`, `managedEntry`, `managedItems`, `makeManaged` (expect.mjs); worker ops `createKept` / `disposeKept` (a session whose agent handle the worker keeps, so it can be disposed and resumed). `STATE_KEYS` gains `managed`; `OWN_PLUGINS.messages.tools` gains `release_session` (§5e "Which Fishball plugin").

### [managed-ways.test.mjs](managed-ways.test.mjs): yours vs managed, the ways in and out (one host, approver after the broker, in order)

| id | technique | requirement | expected |
|---|---|---|---|
| MGD-01 | EP (first start, new install) | Q-r11-upgrade | snapshot `managed` is `[]` |
| MGD-02 ×2 | EP (yours: bare / standard preset) | item 3 | no request has `message_fishball` or a tool named \*fishball\*; no "Fishball" in system text, tool schemas or messages (the standard preset's quote of this checkout's own AGENTS.md is left out: test environment) |
| MGD-03 | EP (yours; Fishball live; Permission requests on) | item 3, §7a.1 | stock prompt at once; no permission notice; zero Fishball model steps; no new intake item |
| MGD-04 | ST yours –Hand over→ managed | items 2, 5; §10e | 200 `ok`; entry exactly `{sessionId, since, by:'hand-over'}`, since at the change; exactly one note (intake `fishball/managed/<id>`, kind `user`, consumed = Fishball woke) whose text names the folder and the user; next request has `message_fishball`; next permission request reaches Fishball |
| MGD-05 | ST yours –Send to Fishball→ managed | item 2 | 200; entry by `send`; the forward arrives; no management note; tool; request to Fishball |
| MGD-06 | ST yours –message_session→ managed | item 2, §5d | ok; entry by `message`; the request that reads the message already has the tool; no note; request to Fishball |
| MGD-07 | ST none –start_session→ managed | item 2 | ok with `title`; entry by `start`; every request of the new session has the tool; no note; its request reaches Fishball. With the title fix the order is create → rename → managed → first message: the probe's rename time ≤ the entry's `since` ≤ the first steer's time |
| MGD-08 | ST managed –Take back→ yours | items 4, 5 | 200; entry gone; one note (kind `user`) naming folder and user; next request lacks the tool and mentions no Fishball; request to the stock prompt, zero Fishball steps |
| MGD-09 | ST managed –release_session→ yours | items 4, 5 | `{ok:true}`; entry gone; one note (kind `system`) naming the folder; tool gone; stock prompt |
| MGD-10 ×2 | DT (message_fishball × yours / managed) | §5b, S34 | yours: tool error UNKNOWN_TOOL, no relay, no intake item; managed: `{ok:true, note:'Delivered to Fishball.'}`, one relay from it, intake item `session/<id>` |
| MGD-11 ×5 | DT (route × Fishball's own / unknown) | §10e, done-when | hand over / take back Fishball → 409 `is-fishball`; `message_session(Fishball)` → `is-fishball`; Fishball never listed, never has the tool; unknown id with managed true and false → 409 `unknown-session`, list unchanged |
| MGD-12 ×8 | EP (bad body) | §10e "boundary checks" | invalid JSON, array, `{}`, no managed, no sessionId, managed `'true'`, sessionId `1`, sessionId `''` → 400 `bad-body`; nothing changes |
| MGD-13 ×2 | EP (watch route; watch_session then read_session) | §5e Reading | none makes the session managed; no tool; requests still to the stock prompt |
| MGD-14 | EP (subagent of a managed session) | Q-r11-subagent-tools | parent's requests have the tool; the child's have none |
| MGD-15 ×2 | ST (Hand over / Take back while step 1 is held) | S34 mid-turn | step 1 as before; step 2 of the same turn has / lacks the tool |
| MGD-16 | EP | §10e, S37 | the client bundle carries "Hand over to Fishball" and "Take back from Fishball" |
| MGD-17 | diagnostic | (silent) | hand over twice; take back or release a session that is yours: answers recorded only; the session stays yours |

### [managed-durable.test.mjs](managed-durable.test.mjs): agent re-creation, plugin switches, restart (one home, in order)

| id | technique | requirement | expected |
|---|---|---|---|
| DUR-01 | ST managed –agent disposed→ resume | §5e "New agents", S34 | a new agent is created (`agent/created`); its next request has the tool; entry unchanged |
| DUR-02 | DT (Session messages off × managed / yours × route) | §5b, §5e, Q-r11-plugins-off | `features.messages` false; entry kept unchanged; managed session's tool gone; Hand over and Take back → 409 `feature-off`, nothing changes; the managed session's request still reaches Fishball |
| DUR-03 | ST off → on | §5e | the still-managed session has the tool again; Hand over works again |
| DUR-04 | DT (Permission requests off × managed) | §7a.1 | stock prompt at once, zero Fishball steps; still managed, keeps the tool; back on → Fishball again |
| DUR-05 | EP (Fishball archived) | §10e "409 unavailable before Fishball is ready" | POST managed → 409 `unavailable`; entries unchanged after recovery |
| DUR-06 | ST (restart) | done-when "survives a restart", §9 | same entries (since and by); resumed managed sessions have the tool and their requests reach Fishball; a taken-back session and one that is yours do not |
| DUR-07 | ST (Fishball's bundle off → on) | §5e "Ownership" | while off the managed session's tool is gone; back on it is still managed and has the tool again |

### [managed-upgrade.test.mjs](managed-upgrade.test.mjs): existing install (old version a5aed26)

| id | technique | requirement | expected |
|---|---|---|---|
| UPM-00 | precondition | — | the old version has outbox entries for a messaged and a started session and no `managed` field |
| UPM-01 | ST (first start of rev11a) | Q-r11-upgrade | `managed` is `[]` |
| UPM-02 | EP | Q-r11-upgrade | the messaged, started and old `message_fishball` caller sessions have no tool and no entry |
| UPM-03 | EP | item 3 | an outbox session's request reaches its stock prompt at once, zero Fishball steps |
| UPM-04 | ST | item 2 | Hand over works after the upgrade (by `hand-over`, tool at the next request) |

### Older tests changed by rev11a

rev11a deliberately changes two older behaviours: every other session's permission request went to Fishball (now managed sessions only), and `message_fishball` was a global tool in every session, subagents included (now per managed agent, never subagents). Cases about a session talking to Fishball now hand the session over first (`makeManaged`, the Hand over route, waiting until Fishball has read the note); no coverage was deleted.

| file | change | why |
|---|---|---|
| support/constants.mjs | `STATE_KEYS` + `managed`; Session messages tools + `release_session` | §10e snapshot; §5e plugin |
| messaging-inbound | `bare` and `std` handed over in setup; MSG-01 reads "managed session"; MSG-06 now: a subagent of a managed session has no `message_fishball`, nothing reaches Fishball | §5e, Q-r11-subagent-tools |
| messaging-durable | each sender handed over | only managed sessions have the tool |
| watches-fire | TOL-06 "messaged Fishball", NTF-04, NTF-06 (message_fishball), QFL sender handed over; NTF-05 now: the subagent has no tool, no watch on root or child | §5e "notify_when_finished from a subagent no longer exists" |
| watches-durable | QFL-01 sender handed over | as above |
| approvals-broker | `fresh()` sessions, APR-16e and APR-17's sessions handed over | §7a.1 managed only |
| approvals-routing, approvals-ptc, own-plugins-approvals, messenger-author-approvals | asking sessions handed over | §7a.1 |
| limits-live | L53 senders and the permission-request session handed over | as above |
| messenger-author | senders handed over (`relayed`, AUT-10); AUT-02 now: the subagent of a managed session has no tool, so nothing is authored | Q-r11-subagent-tools |
| unread | UNR-07's sender handed over before the reset (the note's reply is cleared by it) | §5e |
| own-plugins | `bare` handed over; OWN-06 reads "managed session"; OWN-20/21 check the managed session's next request instead of the global tool list | §5e: no global registration |
| own-plugins-features | `bare` and ofw-03c handed over; OFM-01/02/05 read the managed session's request; OFM-06's precondition is `features.messages` false (the held session cannot be sampled) | as above |
| own-plugins-upgrade | UPO-03: `message_fishball` is not global; it is still listed under Session messages as `other-sessions` | §5e, §10d |

### Ambiguities (rev11a)

- **A-r11a-1. Send to Fishball and a management note.** Item 5 and §5e's Reading list only hand-over, take-back and release. MGD-05 asserts no `fishball/managed/<id>` note for Send (the forward itself tells Fishball).
- **A-r11a-2. "Who did it".** Checked by the note's words (`user` for your clicks) and the intake kind (`user` for Hand over / Take back, `system` for release; the coordinator confirmed these kinds).
- **A-r11a-3. Route while Fishball is not live.** §10e says 409 `unavailable` "before Fishball is ready"; DUR-05 reads an archived Fishball as not ready (as the watches route does, §5c).
- **A-r11a-4. Snapshot keys.** rev11a adds only `managed` to the snapshot; `pile`, `grants`, `questionMode` belong to later phases.
- **A-r11a-5. Unspecified transitions** (hand over a managed session, take back or release a session that is yours, release refusal codes) are diagnostics only (MGD-17).
- **A-r11a-6. Turning a plugin back on.** Not stated directly; DUR-03 and DUR-07 derive from "a managed session has `message_fishball`" that a still-managed session gets the tool back.
- **A-r11a-7. Session messages off and permission requests.** Routing depends on managed status, Fishball live and Permission requests (§7a.1), so DUR-02 expects a managed session's request still to reach Fishball while Session messages is off.
- **A-r11a-8. "Nothing mentions Fishball"** is checked case-sensitively (`Fishball`), because the test homes sit under the lowercase `dsh-fishball` checkout path; the standard preset's quote of this repository's AGENTS.md is test environment, not product text.
- **A-r11a-9. Agent re-creation by clear or compaction** is not exercised; resume (dispose + resume, and a restart) is.

## Revision 11 rev11b cases (asking Fishball first; DESIGN §14 row rev11b, §7a.1-§7a.6 (§7a.6: "To-you ticket" and "Before rev11c" only), §5e, §9 "Revision 11 additions", §16 Q-r11-list, Q-r11-quote-bound, Q-r11-rounds, Q-r11-direct-ask, Q-r11-direct-reply, Q-r11-release, Q-r11-audit-user, limits `userMessagesListed`, `userMessageExcerptChars`, `maxMessageBytes`; requirements items 6-13; S35)

Before rev11c "to the user" is the stock prompt in the asking session: the scripted answerer after the broker (`FBTEST_APPROVER_AFTER=1`). "Reaches Fishball" means a `[permission request apr_…]` notice in Fishball's session; Fishball's fake model answers through a plan (`planApproval`), or only says "ok" so the request waits. The asking fixture tool `fbtest_ask` asks DSH for approval in its body and returns `outcome=<DSH outcome>`, so "the call runs" is its own output and "the stock prompt" is the scripted answerer's record. The ask_fishball code for "to the user" is provisional (`ASK_CODE.toUser`, one constant).

Support added: rev11b constants (`ASK_FISHBALL`, `LIST_USER_MESSAGES`, `MANAGED_TOOLS`, `ASK_CODE`, `ASK_REFUSALS`, `DECISION`, `QUESTION_REQUIRED`, S35 wording `HINT_NEXT` / `HINT_ALLOWED` / `ALLOWED_TEXT` / `REJECTED_TEXT`, `DSH_REJECT_WORDS`, `ASK_OUTPUT`, `LIMITS_R11B`, `AUDIT_KIND`, `AUDIT_ANSWER`, `DECISION_ACTION`, `DECISIONS_TABLE`, `USER_RPC_SOURCE`, `REQUEST_PLACEHOLDER`; `RUBRIC` gains rules 4 and 5, `RUBRIC_REMOVED`, `REJECT_RULE`); helpers `step`, `askStep`, `callStep`, `resultById`, `stockSeen`, `approvalAudit`, `auditOf`, `storedRows`, `roundsOf`, `managedSession`, `blockArguments` (expect.mjs); worker op `userMessageLog` (DSH message ids and source kinds of a session's user messages); the fake model replaces a scripted argument equal to `REQUEST_PLACEHOLDER` with the newest `apr_…` id in the conversation (so a script can answer a question minted during the turn) and records each request's last 8 messages (`last`: role, source kind, text), so a context message after a tool result can be seen.

### [rev11b-list.test.mjs](rev11b-list.test.mjs): the three tools, list_user_messages, its config (one host)

| id | technique | requirement | expected |
|---|---|---|---|
| LUM-01 | EP (managed) | done-when "all three tools" | the next model request lists `message_fishball`, `ask_fishball`, `list_user_messages` |
| LUM-02 ×2 | EP (yours: `ask_fishball` / `list_user_messages`) | done-when, §5e "Refusal is DSH's own" | not listed; calling it is DSH's UNKNOWN_TOOL error; no permission notice, zero Fishball steps |
| LUM-03 | ST managed –Take back→ yours | §5e | none of the three at the next request |
| LUM-04 | EP (Fishball's own session) | §5e | neither tool in Fishball's request |
| LUM-05 | EP (sources: `user`, user-rpc form, relay from `message_session`, Fishball notice, runtime context, another session's) | item 6, §7a.2 | `{ok:true, messages:[{id, at, excerpt}]}` (exactly those keys): the user-typed messages of that session only, DSH message ids, ISO times, newest first, short texts whole |
| LUM-06 ×2 | BVA (`userMessagesListed` 20: 20 / 21 messages) | done-when | all 20; 21 → the newest 20, the oldest left out |
| LUM-07 | BVA (`userMessagesListed` 1) | §16, done-when "without a restart" | only the newest; state.limits 1; same Fishball agent, live |
| LUM-08 ×2 | BVA (`userMessageExcerptChars` 1000: 1000 / 1001 characters of 2-byte text) | done-when | 1000 → whole; 1001 → at most 1000 characters, a prefix (a trailing ellipsis allowed) |
| LUM-09 | BVA (`userMessageExcerptChars` 1) | §16 | every excerpt at most 1 character; applied without a restart |
| LUM-10 | EP | done-when "config fields in the limits form" | form defaults 20 and 1000, settings value and state.limits |
| LUM-11 ×4 | BVA (minimum 1) | §16 rules | 1 accepted (state.limits shows it); 0 refused, value unchanged |

### [rev11b-ask.test.mjs](rev11b-ask.test.mjs): ask_fishball and Fishball's answers (one host, in order)

| id | technique | requirement | expected |
|---|---|---|---|
| ASK-01 | EP (allow) | items 7-8, §7a.2 | `{ok:true, code:'allowed', request_id}`; one notice saying the session asked first (header names `ask_fishball`) with tool, arguments, why, `latest_user_message`, empty `quoted_user_messages`; audit kind `asked`, answer `allow`, no quotes |
| ASK-02 | EP (reject + reason) | item 8, done-when | `{ok:false, code:'rejected', reason, request_id}`; audit `reject` |
| ASK-03 ×7 | DT (answer_approval refusals) | §7a.3, done-when "as in P7" | allow+high → `allow-needs-low-risk`; allow `''` / `'   '` → `reason-required`; reject `''` → `reason-required`; ask with no / `''` question → `question-required`; unknown id → `expired`; each leaves the request pending and the agent waiting |
| ASK-04 | DT (escalate, empty reason) | §7a.3 "None", §7a.6, Q-r11-audit-user | **Changed by rev11c** (see "Older tests changed by rev11c"): `{ok:true, requestId, decision:'escalate'}`; a card, the agent keeps waiting, no stock prompt; your Allow once → `allowed`, the identical call runs on the pass, `decisions` row `allow-once` by user, audit `escalate` then `pass` (outcome allowed-once) |
| ASK-05 | DT (allow on truncated arguments, `argumentExcerptBytes` 16) | §7a.3 | `arguments-incomplete`, still pending; reject then works |
| ASK-06 | BVA (`approvalAnswerSeconds` 1) | item 11, done-when | **Changed by rev11c**: a card after about 1 s, the agent keeps waiting; your Reject with a note → `rejected` with that note, `decisions` row `reject`; audit `timeout` |
| ASK-07 | ST (3 question rounds, then allow) | Q-r11-rounds, done-when | each round `question`, same request_id, Fishball's question; 4 notices of the same request, each with the thread so far in order (`from` fishball/agent alternating); the final allow covers the call (own output, no prompt, no further notice); audit `allow` then `pass` |
| ASK-08 ×3 | EP (request_id unknown / settled / another session's) | contract `expired` | `{ok:false, code:'expired'}`, no request_id, nothing sent |
| ASK-09 | EP (Permission requests off) | item 10 | at once; `unavailable` (or DSH's UNKNOWN_TOOL, A-r11b-3); nothing sent; the call then to the stock prompt |
| ASK-10 | ST (Permission requests off while an ask_fishball and a direct call wait) | §7a.5, done-when | `unavailable`; the direct call shows its stock prompt |
| ASK-11 | ST (Fishball archived while waiting; asked while archived) | §7a.5 | `unavailable` both times, at once the second time, each with request_id; live again after recovery |
| ASK-12 | ST (Take back while waiting) | §5e, done-when | `no-longer-managed` with request_id; audit `released` |
| ASK-13 | BVA (`maxPendingApprovals` 1, 1 pending) | §7a.2, §7a.6 | `over-capacity` at once with request_id, nothing sent; the identical call to the stock prompt |

### [rev11b-pass.test.mjs](rev11b-pass.test.mjs): one-time passes (one host, in order)

| id | technique | requirement | expected |
|---|---|---|---|
| PAS-01 | EP (exact call after allow) | done-when | own output, not an error, no stock prompt, only the ask notice |
| PAS-02 | ST (pass used → same call again) | §7a.3 "the pass is used" | the second identical call is a new request to Fishball |
| PAS-03 | EP (one argument changed) | done-when | to Fishball; after it is rejected the original call in the same turn still runs on the unused pass |
| PAS-04 | EP (same arguments, other key order) | S35 canonical JSON | covered, no further notice |
| PAS-05 | ST (unused → turn ends) | done-when, defaults "Pass lifetime" | the identical call next turn goes to Fishball |
| PAS-06 | EP (identical call from another managed session while the pass is live) | §7a.3 "same session" | goes to Fishball; the owner's call then runs on its pass |

### [rev11b-direct.test.mjs](rev11b-direct.test.mjs): direct calls (one host, in order)

| id | technique | requirement | expected |
|---|---|---|---|
| DIR-01 | EP (allow) | item 12, S35 | notice header says direct; `latest_user_message` = your last turn; result exactly output + `\n\nFishball approved this call once. …`, not an error; audit kind `direct`, `allow` |
| DIR-02 | EP (reject) | done-when, S35 | error result exactly `Fishball rejected this call: <reason>\nNext time, call ask_fishball …`; no "the user rejected"; audit `reject` |
| DIR-03 | ST (rejected → retried next turn) | item 13 | a new request to Fishball; allowed with the hint |
| DIR-04 | ST (ask on a direct call → ask_fishball reply → allow) | Q-r11-direct-ask, Q-r11-direct-reply | error naming the request id, the question and `ask_fishball`; the reply continues the same request (2 rounds, thread [question, reply]); `allowed`, same id; the call made again runs on the pass |
| DIR-05 | EP (escalate) | done-when, Q-r11-audit-user | the stock prompt answers the call; one notice only; `decisions` `allow-once` by user, target the request id; audit `escalate` |
| DIR-06 | BVA (`approvalAnswerSeconds` 1) | item 11 Reading "direct calls too" | the stock prompt after ≥ 1 s; `decisions` `reject`; audit `timeout` |

### [rev11b-quotes.test.mjs](rev11b-quotes.test.mjs): quotes and size (one host, in order)

| id | technique | requirement | expected |
|---|---|---|---|
| QUO-01 | EP (a 1500-character message and a short one) | item 7, done-when | `quoted_user_messages` = the quoted ids with their full text, in order, inside the untrusted block; audit `quotes` = the ids, never the text |
| QUO-02 ×6 | EP (relay / notice / runtime context / another session's / unknown id / valid + relay) | done-when | `not-user-message` at once, ok false, no request_id; nothing sent; no audit row |
| QUO-03 | BVA (message exactly at `maxMessageBytes`, 6000) | Q-r11-quote-bound | reaches Fishball; the notice is exactly 6000 bytes |
| QUO-04 | BVA (one byte over) | done-when | `too-large` at once, no request_id, no notice, no Fishball step |
| QUO-05 | BVA (a reply round over the limit) | §7a.2 "each round must still fit" | the big reply `too-large`, nothing sent; a fitting reply continues the same request |

The size is calibrated per run: two requests with reasons of 100 and 600 bytes give the notice's size; the test requires one byte of reason to add one byte of notice, then sizes the reason so the notice is exactly the limit. "The whole request message" is read as the notice text Fishball receives (A-r11b-4).

### [rev11b-ptc.test.mjs](rev11b-ptc.test.mjs): calls inside run_code (PTC tool mode)

| id | technique | requirement | expected |
|---|---|---|---|
| PTC-01 | EP (inner call allowed) | §7a.4, S35 PTC | the plain value in the run_code result, no hint there; after it in the next request a message of source `fishball-notice` with the hint; the notice is in the session log |
| PTC-02 | EP (inner call rejected) | S35 PTC | the program catches exactly the rejection text |
| PTC-03 | EP (ask on an inner call) | §7a.4 | the caught error names the request id, the question and `ask_fishball` |

### Not automated (rev11b)

- The live-model scenarios of the done-when (Fishball rejects a dangerous call beyond your request; sends a dangerous call within it, or a harmless one beyond it, to you): prompt rules, not code. APR-24 checks the rule's line is in the prompt.
- "An `ask_fishball` request that is already your card answers unavailable, its card leaves": automated by rev11c (LVE-03, LVE-04).

### Older tests changed by rev11b

| file | change | why |
|---|---|---|
| config CFG-01, CFG-08 | the default table has 30 fields: `LIMITS_R11B` (`userMessagesListed` 20, `userMessageExcerptChars` 1000) added | §16 "Revision 11's new limits" |
| http HTP-01 | `state.limits` keys include the two new fields | §16 |
| own-plugins OWN-01/02/03/06/10/11 (constants `OWN_PLUGINS.approvals.tools`) | Permission requests now holds `answer_approval`, `ask_fishball`, `list_user_messages`; the two new tools are, like `message_fishball`, status `other-sessions` and never in Fishball's own requests (`MANAGED_TOOLS` replaces the single `message_fishball` exception) | §5e "Which Fishball plugin", §7a.2 |
| approvals-broker APR-24, constants `RUBRIC` | "You cannot reject" no longer expected (now `RUBRIC_REMOVED`, asserted absent); rules 4 and 5 phrases added; the new reject rule asserted by meaning | DESIGN §7a.7 last paragraph, Q-r11-reject, Q-r11-reject-rubric |

### Ambiguities (rev11b)

- **A-r11b-1. Pass and ticket lifetime within a turn.** A to-you ticket "ends as a pass does" (used, or the turn ends), so the cases make the identical call in the same turn as the `ask_fishball` that minted it.
- **A-r11b-2. Notice wording for the kind.** The contract says the notice states whether the session asked first or made a direct call; the tests read it as the header naming `ask_fishball` (asked) or containing "direct" (direct call).
- **A-r11b-3. Permission requests off and the tool.** The tools belong to Permission requests and exist only while it runs, yet `ask_fishball` "answers unavailable" when it is off. ASK-09 accepts either `unavailable` or DSH's UNKNOWN_TOOL for a call made while it is off; ASK-10 (a call already waiting) requires `unavailable`.
- **A-r11b-4. "The whole request message".** Measured as the UTF-8 bytes of the notice text in Fishball's log (QUO-03 requires that notice to be exactly `maxMessageBytes`).
- **A-r11b-5. `escalate` "needs nothing extra".** `answer_approval`'s schema still requires `risk` and `reason` for every decision (P7); ASK-04 reads "nothing extra" as no code rule, so an escalate with an empty reason is accepted.
- **A-r11b-6. "One audit row per request".** The implementation also records the follow-up call under the same request id (`pass` for a call on a pass, `to-user` for a call the ticket sends to your prompt), which is how the contract's answers `pass` and `to-user` appear. ASK-04, ASK-06 and ASK-07 expect exactly the decision row followed by that row; no row per question round.
- **A-r11b-7. request_id on answers given at once.** The contract says every answer except refusals carries `request_id`; ASK-11 (Fishball not live) and ASK-13 (`over-capacity`) require it.
- **A-r11b-8. A call run on a pass gets no hint** (S35 "it ran under a pass: next()"), so PAS-01, ASK-07 and DIR-04 expect the tool's own output exactly.

## rev11a follow-up: managed sessions list (DESIGN §10e "Settings page", "Snapshot")

The user's decisions: the Permission requests section lists the managed sessions, each with its **title** (not its id), a tag for `by` and the time since it is managed, newest first; Take back shows only while Session messages is on and Fishball is live, but the list always shows; an empty list shows the page's usual "Nothing yet". The snapshot entry becomes `{sessionId, title, since, by}`: `title` is the session's current DSH title (it follows a later retitle, published without a restart) and `null` while unknown. The browser's order and the unknown-title fallback are not testable here (the fallback is still undecided); the browser half is checked through the served client bundle only. The heading "Managed sessions" and the by-tags are the wording the coordinator stated.

Titles: DSH derives a title from the user's messages; a session whose only turn came from Fishball or a relay has none (`''` in DSH's title service). A retitle is DSH's own rename (worker op `renameSession`); `sessionTitle` is the reference.

Support added: `MANAGED_ENTRY_KEYS` gains `title`; `MANAGED_LIST_LABELS` (constants.mjs). The `title` key also changes MGD-04 (exact keys) and DUR-06 (entries equal across a restart, now including the title).

### [managed-list.test.mjs](managed-list.test.mjs): the list (one home, in order; restart last)

| id | technique | requirement | expected |
|---|---|---|---|
| MGL-01 | EP (titled session, Hand over) | decision 1 | entry has exactly `{by, sessionId, since, title}`; title is DSH's title, a non-empty string, not the id |
| MGL-02 ×3 | EP (way in: send / message / start) | decision 1 | send, message: title is DSH's title, by as named; start: the title Fishball gave it (DSH reports the same) |
| MGL-03 | BVA (no title yet: `''` in DSH) | decision 1 | title `null`, not `''`, not the id |
| MGL-04 | ST (null –rename A→ A –rename B→ B) | decision 1 "follows a later retitle" | each title reaches the snapshot and an events frame without a restart; since and by unchanged |
| MGL-05 | ST (started with a title –the user's first message→ same) | decision 1, title fix | the title Fishball gave stays in DSH and in the snapshot: DSH pins an explicit title, so the user's message does not replace it (before the fix: the entry was `null` until the user wrote) |
| MGL-06 | EP (quotes, markup, CJK, emoji) | decision 1 | title listed verbatim |
| MGL-07 | ST (managed –Take back from the list→ yours) | decision 3 | `POST /api/fishball/managed {sessionId, managed:false}` → 200 ok; the entry leaves the snapshot and an events frame; a later rename does not list it again |
| MGL-08 | EP (rename a session that is yours) | decision 1 | no entry appears |
| MGL-09 | EP (several renames) | decision 1 | each session listed once |
| MGL-10 ×2 | DT (Session messages off / Fishball archived) | decision 3 "the list always shows" | the snapshot still has the same entries with titles (`features.messages` false / status not live) |
| MGL-11 | EP (served bundle) | decisions 1, 3, 4 | carries "Managed sessions", "Handed over by you", "Sent by you", "Messaged by Fishball", "Started by Fishball", "Take back from Fishball", "Nothing yet"; the literal route path is a diagnostic |
| MGL-12 | ST (restart) | decision 1 | entries equal after the restart, before any resume: titled ones keep their title, an untitled one stays `null`, since and by unchanged |
| MGL-13 | diagnostic | decision 2 | the host array order is recorded (the browser sorts newest first; the host order is unspecified) |

### Ambiguities (rev11a follow-up)

- **A-r11a-10. Title after a restart.** "Kept after restart" is read as: the snapshot shows the same title before the session is resumed (as DSH's sidebar does for sessions that are not open).
- **A-r11a-11. Does Fishball's message retitle?** Not stated; MGL-02 compares with DSH's own title service, whatever it says.
- **A-r11a-12. Labels.** The heading and by-tag wording come from the coordinator, not the requirements text; the "since" line's wording is not checked.


## Revision 11 rev11c cases (your pile for `ask_fishball` requests; DESIGN §14 row rev11c, §7a.2 "to-user", §7a.3 "Tags", §7a.5, §7a.6, §9 "Session cards", "Tag records", §10e, §16 Q-r11-cap-own, Q-r11-release-pile, Q-r11-tag-*; requirements items 14-16, defaults "Card cap", "The user's Reject takes an optional note"; S37)

The builder's contract is the DESIGN text alone (no code was read). Black-box surfaces: the snapshot (`pile`, and the tag records wherever the Host publishes them), `POST /api/fishball/requests/answer` (the one route both the pile's buttons and the buttons on the running `ask_fishball` row call, S37), tool results, the audit and `decisions` tables, and the `tags` table of `storages/fishball.json`. A request becomes a card when Fishball escalates it (the fake model escalates from a plan) or when `approvalAnswerSeconds` passes. Cards for **direct calls** are rev11e: in rev11c a direct call sent to you shows the stock prompt only (PIL-07; rev11e flips it).

Support added: `test/support/rev11c.mjs` (host boot/reboot, `escalated`, `waiting`, shared helpers); rev11c constants (`PILE_API`, `PILE_CODE`, `CLICK`, `CARD_KIND`, `CARD_KEYS`, `LIMITS_R11C`, `TAGS_TABLE`, `TAG_KIND`, `TAG_KEYS`, `TOO_MANY_WAITING`, `STATE_KEYS_OPTIONAL`; `STATE_KEYS` gains `pile`; `ASK_CODE.toUser` and `AUDIT_ANSWER.toUser` removed); helpers `pileNow`, `cardOf`, `untilCard`, `untilNoCard`, `answerCard`, `cardArguments`, `tagsOf`, `snapshotTags` (expect.mjs).

### [rev11c-pile.test.mjs](rev11c-pile.test.mjs): the pile (one host)

| id | technique | requirement | expected |
|---|---|---|---|
| PIL-01 | EP (nothing waiting) | item 14, §10e snapshot | `state.pile` is `[]`; the first SSE frame carries `pile: []` |
| PIL-02 | EP (3 managed sessions escalate) | item 14, done-when "three cards", §10e order | three cards, newest first, one per session; every card has `arguments`, `callId`, `kind: 'asked'`, `requestId`, `sessionId`, `since`, `toolName` (= the tool asked about), `why`; `callId` is the `ask_fishball` call's id (S37: the row buttons match on it); the three agents still run |
| PIL-03 | EP (answer the middle one) | item 15, done-when | only that card leaves; the other two stay with their agents waiting; the answered agent gets `rejected` |
| PIL-04 | EP (quote + one question round + escalate) | item 14 | the card shows the quoted message (id and full text), the thread `[question, reply]` in order, Fishball's reason as `note`; `callId` is the reply call's (the call that is waiting now) |
| PIL-05 | BVA (`argumentExcerptBytes` 16 / default, 200-byte arguments) | §9 "arguments (excerpt)" | cut: text of at most 16 bytes + an ellipsis, a prefix of the real arguments; default: whole |
| PIL-06 | EP (markup in arguments, reason, note) | done-when "nothing renders as markup" | the snapshot holds the exact text; the client draws it as plain text (drawing is a hand check) |
| PIL-07 | EP (direct call, Fishball escalates) | §7a.6 "Built in rev11e" | **changed in rev11e:** a card of kind `direct` and the (held) stock prompt both show; your click in the session clears the card (was: the stock prompt answers; no card) |
| PIL-08 | ST (SSE) | §10e "fed by the state stream" | a frame holds the card; after the answer a later frame does not |
| PIL-09 ×4 | BVA (`pileMaxHeightVh` 45 / 1 / 0 / 1.5) | §16 new limits, "Rules" | default 45 in `state.limits`; 1 accepted live; 0 and 1.5 refused, value stays |

### [rev11c-answer.test.mjs](rev11c-answer.test.mjs): Allow once / Reject on a card (one host)

| id | technique | requirement | expected |
|---|---|---|---|
| ANS-01 | EP (Allow once) | items 8, 14, defaults | agent `allowed` + `request_id`; its identical call runs on a pass (own output), no stock prompt, no further notice; card gone; `decisions` row `allow-once` by `user`; audit `escalate` (final outcome allowed-once) … `pass` |
| ANS-02 | EP (Reject + note) | defaults "optional note" | agent `rejected`, `reason` = the note exactly; card gone; `decisions` `reject` by user; audit `escalate`, final outcome rejected |
| ANS-03 | EP (Reject, no note) | defaults | agent `rejected`, `ok:false`, `request_id` |
| ANS-04 | EP (note with markup, newlines, tab) | S33 Reading | reason unchanged |
| ANS-05 | ST (second click; unknown id; settled id) | §10e 409 `expired` | 409 `{code:'expired'}`; the first answer stands |
| ANS-06 ×12 | DT (10 bad bodies; foreign origin; Fishball's late answer) | §10e "same boundary checks", §7a.3 "a request in your pile is yours" | bad bodies 400 `bad-body`; foreign origin not 200; `answer_approval` on a card answers `expired`; card and waiting agent unchanged |
| ANS-08 | BVA (`approvalAnswerSeconds` 1, no answer) | item 11, §7a.5 | no card before the answer time, a card after; the agent keeps waiting (no `to-user`, no stock prompt); Allow once → `allowed`; audit `timeout`, final outcome allowed-once |
| ANS-09 | ST (after your click) | §7a.14 "kept for cards" | no new Fishball model request; a later Fishball turn holds a note naming the request |
| ANS-10 | ST (question round, escalate, Allow once) | item 8 | `allowed`, same `request_id` |

### [rev11c-leave.test.mjs](rev11c-leave.test.mjs): when a card leaves, and the cap (one host; restart last)

| id | technique | requirement | expected |
|---|---|---|---|
| LVE-01 | ST (a session's turn stopped, the Stop button's path) | item 16 | that card leaves, the other session's stays; a click on the gone card is 409 `expired` |
| LVE-02 | ST (Take back while a card) | defaults "Leaving management", §7a.6 | `no-longer-managed` + `request_id`; card leaves; audit `released` |
| LVE-03 | ST (Permission requests off while a card) | Q-r11-release-pile | `unavailable`; card leaves; the agent's identical call goes to the stock prompt |
| LVE-04 | ST (Fishball stopped while a card) | Q-r11-release-pile | as LVE-03; Fishball live again |
| LVE-05 ×3 | BVA (`maxPendingApprovals` 2: card + waiting = full; third; after an answer) | "Card cap", §7a.6 Reading | the third request `over-capacity` at once and its identical call to the stock prompt; after one card is answered a new request is accepted |
| LVE-06 | BVA (cap 1 with one card; Fishball's own request) | Q-r11-cap-own | Fishball's tool returns `too-many-waiting` at once; DSH is not asked |
| LVE-07 | ST (restart with two cards) | item 16 | pile empty after the restart; old ids 409 `expired`; the sessions stay managed |

### [rev11c-tags.test.mjs](rev11c-tags.test.mjs): tag records (one host; restart and bound last)

| id | technique | requirement | expected |
|---|---|---|---|
| TAG-01 | EP (allow, `ask_fishball`) | §7a.3 Tags, §9 | one row in table `tags`: `sessionId`, `callId` (the ask call), integer `seq`, `answer` naming allow, `kind: 'approval'`, `at` |
| TAG-02 | EP (reject) | §7a.3 | `answer` names reject |
| TAG-03 | ST (ask, reply, allow) | §7a.3 "every decision" | one tag per decision on its own call; later call has the greater `seq` |
| TAG-04 | EP (escalate) | §7a.3 "Sent to you"; your click | a `sent-to-you` tag; your own click adds none |
| TAG-05 ×2 | EP (direct call allowed / rejected) | Q-r11-tag-approvals | an approval tag on the direct call's id |
| TAG-06 | EP (snapshot) | §9 "published in the snapshot" | the snapshot (any key) publishes each stored record |
| TAG-07 | BVA (two answers, one session) | §9 `seq` | later `seq` is greater |
| TAG-08 | EP (turn stopped, no answer) | §7a.3 | no tag |
| TAG-10 | ST (restart) | Q-r11-tag-store | the same rows remain and are still published |
| TAG-11 | BVA (`auditEntriesKept` 2, three answers) | Q-r11-tag-bound | two rows; the oldest dropped first |

### Not automated (rev11c)

- **The look of the pile and the row buttons** (item 14 layout, "Waiting for you (n)", scrolling at `pileMaxHeightVh`, the composer staying in view, light and dark; plain-text drawing of markup; Allow once / Reject on the running `ask_fishball` row in the session's own chat; answering there clears the pile and the reverse; the "Asked Fishball" and "Sent to you" tag texts in the turn tail, visible in a folded turn and in an old turn after a restart): browser rendering, checked by hand (`test/hand-checks/rev11c.md`). The route is exercised by the tests above.
- A notice that cannot be delivered sending the request to the pile (§7a.6 Reading): no way to make delivery fail from outside.
- The `ask_fishball` row's buttons "while the request is a card, not while Fishball decides" (hand check).
- Fishball's own cards (rev11f): only the cap rule (LVE-06) is a rev11c item.

### Older tests changed by rev11c

| file | change | why |
|---|---|---|
| rev11b-ask ASK-04 | escalate no longer answers `to-user` with a stock-prompt ticket: the request is a card, the agent keeps waiting; your Allow once (route) → `allowed`, the identical call runs on the pass; audit `escalate`, `pass` | DESIGN §7a.2 "`to-user` (rev11b only) … rev11c replaces it with waiting on a card", §7a.6 |
| rev11b-ask ASK-06 | the 1 s timeout no longer answers `to-user`: a card, the agent keeps waiting; your Reject with a note → `rejected` with the note; audit `timeout` only | same, item 11 "the agent keeps waiting" |
| constants `ASK_CODE.toUser`, `AUDIT_ANSWER.toUser` | removed | the answer no longer exists |
| STATE_KEYS (http HTP-01/HTP-?, plugins-http, messaging-send) | gains `pile` (20 keys); a `tags` key, if the Host publishes the records under that name, is dropped before comparing (`STATE_KEYS_OPTIONAL`) | DESIGN §10e "Snapshot", §9 "published in the snapshot" |
| config CFG-01, CFG-08, http HTP-01 limits | the default table has 31 fields: `LIMITS_R11C` (`pileMaxHeightVh` 45) added | §16 "Revision 11's new limits" |
| ASK-09, ASK-10, ASK-13, DIR-05, DIR-06 | unchanged on purpose: `unavailable`, `over-capacity` and direct calls still use the stock prompt (a to-you ticket / the pass-through) until rev11e | §7a.5, §7a.6 "Cap", "Built in rev11e" |

### Ambiguities (rev11c)

- **A-r11c-1. Where the tag records are published.** §9 says "published in the snapshot" without a key. The tests find them by shape anywhere in the snapshot (`snapshotTags`) and tolerate a `tags` key in the exact-key checks. Also: `answer` is checked by a regular expression on its JSON (allow / reject / ask|question), since the design gives its wording only for the client.
- **A-r11c-2. Which `callId` a card carries after a question round.** Each `ask_fishball` reply is a new tool call; the card is taken to carry the id of the call that is waiting now (the running row with the buttons), PIL-04.
- **A-r11c-3. Card field names.** From §9 "Session cards": `requestId, kind, sessionId, toolName, arguments, quotes, why, thread, note, since` plus `callId` (S37). `arguments` may be a JSON string or an object; `quotes` entries are expected to hold the message id and full text; `thread` entries have `text` as in the notice; `note` is Fishball's escalate reason.
- **A-r11c-4. Reject without a note.** The agent's `reason` is not asserted (it may be a default text).
- **A-r11c-5. Fishball's own cap rule before rev11f.** LVE-06 asks for `too-many-waiting` from a Fishball tool that asks for approval, with a card from another session filling the cap; rev11f owns Fishball's cards but the rev11c row lists the rule.
- **A-r11c-6. The note after your click** (ANS-09) is read as "Fishball is told, without waking it" (§7a.14 Reading); its wording is not asserted, only that it names the request id.
- **A-r11c-7. Timeout is not "Sent to you".** TAG tests do not require a tag when a request times out.

## Revision 11 rev11d cases (standing grants; DESIGN §14 row rev11d, §7a.3 "grant", §7a.5, §7a.8, §9 "Standing grants", "Tag records", "Audit", "Fishball's other decisions", §10e "Active grants", "Host API", §16 Q-r11-prefix-tools, Q-r11-grant-bounds, Q-r11-grants-off, Q-r11-tag-scope, Q-r11-audit-user; requirements items 17-19, defaults "Restarts", "Prefix grants", "Audit"; written from the requirements alone, no code read)

Black-box surfaces: the snapshot's `grants`, `POST /api/fishball/grants/revoke` (`{grantId}`, 409 `unknown`/`ended`), Fishball's tools (`answer_approval` with `decision: 'grant'` and `grant: {kind, prefix?, expires_at}`, `list_grants`, `revoke_grant({grant_id, reason})`), the `grants`, `decisions`, `tags` tables of `storages/fishball.json`, the approvals audit files, tool results, Fishball's model-request count (`requests`) and the scripted stock prompt. "Covered" = the call runs (allowed-once), Fishball takes no model step, no notice reaches it, and no stock prompt is shown.

Support added: `test/support/rev11d.mjs` (host with the shell fixtures asking in their body, `direct`/`create`/`covered`/`uncovered`, grant readers); `FBTEST_ASKING_TOOLS` in `fixture-tools.mjs` (the fixture tools bash, pwsh, terminal_open, terminal_send, run_code ask DSH for approval under their own name and call id, so a grant on those tool names can be exercised); constants `GRANT_*`, `PREFIX_TOOLS`, `EXACT_ONLY_TOOLS`, `ASKING_SHELL_ENV`; `STATE_KEYS` gains `grants` (21 keys, §10e "Snapshot").

### [rev11d-grants.test.mjs](rev11d-grants.test.mjs): creating grants and what they cover (one host)

| id | technique | requirement | expected |
|---|---|---|---|
| GRT-01 | EP (valid prefix grant) | item 17-18, §7a.3, §9 | the creating call runs; snapshot lists it (session, tool, prefix, end time); stored row active, uses 0; `decisions` row grant by fishball; audit `grant`; a tag for the creating call |
| GRT-02 | ST (five covered runs) | done-when 6, Q-r11-tag-scope | all run, Fishball takes zero steps, `uses` 5 and `lastUsedAt`, five `grant` tags (one per call), five `grant-used` audit rows |
| GRT-03 | EP | item 18 (accepted risk) | `npm test && git push` is covered |
| GRT-04 ×8 | BVA/EP (command against prefix `npm test`) | item 18 (raw text) | longer, `npm testing`, exactly the prefix: covered; `npm tes`, `npm run test`, `NPM test`, `npm  test`, `echo npm test`: to Fishball |
| GRT-05, 06 | EP | §7a.8 "same session, tool" | the same command in pwsh, or in another session: not covered |
| GRT-07 | DT (exact grant) | item 18 | repeats covered, also with another key order; a changed argument, a changed text, or an extra argument: to Fishball |
| GRT-08 ×3 | EP (pwsh, terminal_send; a trailing `*`) | Q-r11-prefix-tools; manager 2026-11-02 | prefix grant accepted and covers a following command; a trailing `*` is dropped |
| GRT-09 ×5 | EP (run_code, fbtest_ask, terminal_open prefix refused; exact on run_code and terminal_open accepted) | Q-r11-prefix-tools, requirements "Prefix grants" | prefix refused, `ok:false`, request still pending (a reject works), no grant row; an exact grant on run_code is accepted and covers |
| GRT-10 ×10 | DT (refused answers) | §7a.8 "an end time is required and must be in the future", `allow`'s rules | no end time; past (an hour, one second); not a time; no grant object; unknown kind; prefix kind with no or an empty prefix; a prefix that is not the start of the asking command; risk high; empty reason: `ok:false` with a code, no grant row, no `decisions` row, request still pending |
| GRT-11 | BVA (end time a year out; three active) | Q-r11-grant-bounds | accepted; three active grants of one session at once |
| GRT-12 | EP (via `ask_fishball`) | §7a.3 Reading | grant through an `ask_fishball` answer: allowed; later direct call covered; `ask_fishball` for another covered command answers `allowed` with no Fishball step |

### [rev11d-end.test.mjs](rev11d-end.test.mjs): how grants end, pause and survive (one host, a session per case)

| id | technique | requirement | expected |
|---|---|---|---|
| END-01 | ST (expiry) | item 19 | covered before the end time; after it the next run goes to Fishball; row expired/ended by `expiry`; not in the active list |
| END-02 | ST (your Revoke) | item 19, Q-r11-audit-user | route 200; next run to Fishball; `decisions` revoke by user; row revoked by user; a second revoke and an unknown id answer 409 |
| END-03 | ST (`revoke_grant`) | item 19 | `list_grants` lists the active grant; revoke ok; row ended by fishball; `decisions` revoke by fishball; not active in `list_grants`; next run to Fishball; a second revoke and an unknown id refused, no extra row |
| END-04 | ST (Take back) | item 19, item 4 | its grants end (take-back), another session's stay; handing over again does not revive |
| END-05 | ST (`release_session`) | item 19 | its grants end (release) |
| END-06, 07 | ST (Permission requests off / Fishball not live, then back) | Q-r11-grants-off, §7a.5 | the covered call shows the stock prompt, Fishball is not asked, no use counted, no tag; the grant stays active with an unmoved end time and is marked paused; when back, the same grant covers again |
| END-08 | ST (restart) | defaults "Restarts" | an unexpired grant survives with uses and end time and still covers; managed status stays; a grant whose end time passes is not honoured |

### [rev11d-regress.test.mjs](rev11d-regress.test.mjs): rev11b regression (the manager's decision of 2026-11-02, DESIGN §7a.3 table)

| id | technique | requirement | expected |
|---|---|---|---|
| REG-01 | DT (escalate, no `risk`, no `reason`) | §7a.3 "None: any request can go to you" | accepted (`ok:true`, `decision:'escalate'`; the tool's own schema must not require them); a card; the agent keeps waiting; no stock prompt; audit `escalate`; your Allow once → `allowed` |
| REG-03 | DT (ask with only a question) | manager 2026-11-02 | accepted, no risk or reason needed; the agent gets `question` |
| REG-02 | DT (escalate, risk high, empty reason) | same | same |

### Not automated (rev11d)

- The grants list in the pinned area with Revoke and the "paused" wording, and the tag text "Allowed by Fishball's grant: <prefix or exact call>" in the turn tail: checked by hand (client rendering).
- A year-out end time in the client's list; the exact wording of Fishball's prompt for grants (prompt-only judgement, item 17).

### Ambiguities (rev11d)

- **A-r11d-1. The end time's format.** `expires_at` is given as an ISO 8601 text (`new Date().toISOString()`); a number is not tried. Snapshot and stored fields are read as `expiresAt` (or `expires_at`), as a number or a date text.
- **A-r11d-2. Id and field names.** The grant id is read from `grant_id`/`grantId`/`grant.id` in the answer, else from the stored row's key (§9: keyed by grant id); the snapshot entry's id from `grantId`/`id`. The snapshot lists active grants (an entry with no `status` counts as active). The tool name is `toolName` (or `tool`). "Marked paused" is `paused: true` or the word "paused" anywhere in the entry. `list_grants` is read as `{grants:[…]}`.
- **A-r11d-3. Terminal tools' command argument.** The fixtures for `terminal_open` and `terminal_send` carry the command text in `command`; the design says "read from their schema in rev11d", so a different real argument name would need the fixture schema changed.
- **A-r11d-4. Refusal codes.** Only `ok:false` with a string `code` is asserted for refused grants, not the code name. Whether a prefix must be a prefix of the asking call's command (§9: "comes from the asking call") is not tested.
- **A-r11d-5. Revoke reasons.** `revoke_grant` with an empty reason is not tested.
- **A-r11d-6. Expiry rows.** Expiry is checked on the grants row (`expired`/`ended`, `endedBy: 'expiry'`), not on a `decisions` row; the design says expiry is audited without naming the table.

- **A-r11d-7. Manager's readings (2026-11-02), built in:** `terminal_open` takes exact grants only; a prefix is the start of the asking command; a trailing `*` is dropped; expiry writes no `decisions` row (END-01 checks the grants row only).

- **A-r11d-8. run_code.** `run_code` is a DSH built-in present only in PTC mode, so the fixture cannot register it (`unknown tool`). `demo_echo` stands in for "every other tool" in the exact-only cases (GRT-09); `run_code` itself is left to the hand check.


## Revision 11 rev11e cases (prompts already showing, `answer_prompt`, cards for direct calls)

Written by the test session from the requirements (items 2, 15, 20), DESIGN §7a.1, §7a.5, §7a.6, §7a.9, §9, §10e, §14 row rev11e, §16 and spike S33, before the build existed. No implementation was read. The harness change: the scripted stock prompt can be **held** (`setApprover({outcome:'hold'})`, `releaseApproval` = your click), which stands in for a prompt showing in a browser. The worker now (a) reports `closed: true` in the `approvals` records once a prompt's signal aborts (the plugin answered it, S33) and (b) drops a closed prompt from the held list. Helpers: [support/rev11e.mjs](support/rev11e.mjs).

### [rev11e-frozen.test.mjs](rev11e-frozen.test.mjs): `list_frozen_sessions` (item 20, §7a.9)

| id | technique | requirement | expected |
|---|---|---|---|
| FRZ-01 | EP (nothing showing) | §7a.9 | `ok`, no entry |
| FRZ-02 | EP (a prompt in a session that is yours) | item 20, done-when 1 | listed with the session, tool `fbtest_ask`, the exact arguments, a prompt id; when the prompt appeared Fishball took no step (model-request count, intake items, notices and audit rows unchanged over 1 s); no card; the session is still yours |
| FRZ-03 | EP (quotes, markup, unicode, several fields) | "exact arguments" | listed arguments deep-equal the call's |
| FRZ-04 | EP (two sessions) | §7a.9 | two entries, distinct ids, own session and arguments; your click removes only the clicked one |
| FRZ-05, 06 | ST (your Allow once / Reject) | done-when "after your own click the entry leaves the list" | the call gets your outcome; entry gone; Fishball told nothing; a late `answer_prompt` is refused; session stays yours |
| FRZ-07 | ST (turn stopped) | §7a.9 "asker's own abort" | entry gone; late `answer_prompt` refused; no decisions row |

### [rev11e-answer.test.mjs](rev11e-answer.test.mjs): `answer_prompt` and the fifth way in (items 2, 20; §7a.9, §9, §16)

| id | technique | requirement | expected |
|---|---|---|---|
| APR-01 | EP (allow) | done-when | ok; prompt closed (signal aborted, nothing held); the call ran with `allowed-once`; entry gone |
| APR-02 | EP (reject + reason) | done-when | ok; prompt closed; the agent's result carries the reason and not "the user rejected"; entry gone |
| APR-03, 04 | ST (yours –answer→ managed) | item 2, done-when | snapshot entry `{sessionId, since, by:'prompt-answer', title}`; the session's final request of the turn and its next turn list the three tools; Fishball's result mentions the session is managed; no `fishball/managed` note |
| APR-05 ×6 | DT (refused answers) | §7a.9 "reject needs a reason", "`allow` follows `allow`'s code rules"; §7a.3 | reject with no / blank reason, allow with no reason, allow with risk high, a decision other than allow/reject, an unknown prompt id: each refused; prompt still listed and not closed; session still yours; no tag, no decisions row |
| APR-06 | ST (second answer) | "only pending ids, once" | refused (already answered / expired); first outcome stands; one tag, one decisions row |
| APR-07 | ST (your click first) | S33 "first answer wins" | Fishball's answer refused; session not managed; no tag; no decisions row |
| APR-08 | EP (tags) | Q-r11-tag-scope, §9 | tag record `{sessionId, callId = the frozen call, kind:'prompt', seq (integer), answer naming the decision, at}`; published in the snapshot; two answers in one session: later `seq` is greater |
| APR-10 | EP (audit) | §7a.13, §9 | one `decisions` row `answer-prompt` by `fishball`, `sessionId`, `target` = prompt id, `outcome` naming the decision; approvals audit rows of kind `prompt` with allow and reject |
| APR-12 | EP | Q-r11-managed-tag-prompt | the served client bundle contains "Prompt answered by Fishball" |
| APR-11 | ST (restart) | defaults "Restarts" | managed by `prompt-answer` survives; tag and decisions rows unchanged; no prompt listed |

### [rev11e-direct.test.mjs](rev11e-direct.test.mjs): cards for direct calls kept in step with the stock prompt (item 15, §7a.6)

| id | technique | requirement | expected |
|---|---|---|---|
| DCD-01 | EP (escalate) | item 15, done-when | a card of kind `direct` with the documented keys, the call's id, the exact arguments, AND the stock prompt showing; the agent waits; no further Fishball step or notice |
| DCD-02 | ST (Allow once on the card) | item 15 | route 200; prompt closes; card leaves; the call runs; `decisions` allow-once by user; audit `escalate` |
| DCD-03 | ST (Reject + note on the card) | defaults "Reject takes an optional note" | prompt closes; card leaves; the agent's result carries the note and not `allowed-once` |
| DCD-04, 05 | ST (your click in the session) | item 15 "answering in either place clears both" | card leaves; the call gets your outcome; a later click on the card is 409 `expired`; one `decisions` row by user; no new notice |
| DCD-06 | BVA (`approvalAnswerSeconds` 1) | item 11 | card and prompt appear after ≥ 1 s; the card's Reject closes both; audit `timeout` |
| DCD-07 | ST (turn stopped) | item 16 | card leaves; prompt closes; a later card click is 409 |
| DCD-08 | BVA (`maxPendingApprovals` 2: ask card + direct card, then a third) | defaults "Card cap" | the third shows the stock prompt only: no card, no notice; your click answers it |
| DCD-09 | ST (Permission requests off while both show) | §7a.5 "keeps the prompt" | the prompt stays; your click answers the call; no card remains afterwards |
| DCD-10 | EP (second answer) | §7a.6 "first answer wins" | after the card answered, a second card click is 409 and nothing is left to click; one decisions row |
| DCD-11 | BVA (`maxQueuedInputs` 1, queue full; `maxPendingApprovals` 1) | §11 Reading on undeliverable notices; manager 2026-11-02 | a direct call whose notice cannot be delivered gets a card and the stock prompt like a timeout, no notice, no tag; a second one past the cap gets the stock prompt only |

### Older cases changed by rev11e

| file | change | why |
|---|---|---|
| rev11c-pile PIL-07 | flipped: a direct call sent to you now shows a card of kind `direct` and the (held) stock prompt; your click in the session clears the card | §7a.6 "Built in rev11e", rev11e "done when" |
| rev11b-direct DIR-05, DIR-06 | assertions unchanged (the stock prompt answers; decisions row by user; audit `escalate` / `timeout`); the card now also exists and leaves with the answer, which rev11e-direct checks | same |
| ASK-09, ASK-10, ASK-13, rev11c LVE-05 third request | unchanged on purpose: `unavailable` / `over-capacity` retries go straight to the stock prompt through a to-you ticket (no Fishball involvement), and past the cap the stock prompt shows alone | §7a.5, §7a.6 "Cap", "To-you ticket" |
| worker.mjs approver | held prompts report `closed` and leave the held list when their signal aborts; `approvals` records gain a `closed` flag | harness only; no expected value of an older case changes |

### Not automated (rev11e)

- The tag text "Answered by Fishball: <decision>" in the turn tail, the "Prompt answered by Fishball" label on the managed list's row, and the buttons on the session's own prompt: client rendering, by hand (APR-12 only checks the bundle carries the label).
- Closing a prompt in a real browser (S33 did this); here the signal abort is the observable.

### Ambiguities (rev11e)

- **A-r11e-1. Answer shapes.** The design names `prompt_id`, `decision`, `reason` (and, by "follows `allow`'s code rules", `risk`) for `answer_prompt`, and "session, tool, exact arguments" for the list, without key names. The tests read entries from any list in the answer, with the id from `prompt_id`/`promptId`/`id`, the tool from `tool`/`tool_name`/`toolName`, the arguments from `arguments`/`args` (object or JSON text), and find the session by its id appearing in the entry. A refusal is `ok:false` or an error result.
- **A-r11e-2. Whether a managed session's own escalated direct call (card + stock prompt) is also listed by `list_frozen_sessions`.** §7a.9 says the registry holds each request the broker passed on, so it should be, but it also says answering it would be ambiguous with the card; not tested.
- **A-r11e-3. A session that is already managed and whose prompt Fishball answers**: whether `by` changes. Not tested.
- **A-r11e-4. Take back / release while a direct card and its prompt show.** The prompt must stay (the session is the user's again); whether the card leaves is not stated. Not tested. DCD-09 (Permission requests off) asserts only that the prompt stays and the settled call leaves no card.
- **A-r11e-5. The tag record's `callId`** is taken to be the frozen call's id (the call whose prompt was answered); `answer` is matched by a regular expression on the decision word.
- **A-r11e-7. (manager 2026-11-02)** `answer_prompt` allow adds no hint (APR-01 asserts the result is exactly `outcome=allowed-once`); a request with no call id cannot carry the reject reason or the note, a known limit, not tested.
- **A-r11e-6. "No note" for a Fishball-initiated way in** follows the §16 Reading "Fishball's own actions need no extra note beyond the tool result" (APR-03 asserts no `fishball/managed` item).

## Revision 11 rev11f cases (Fishball's own requests; DESIGN §14 row rev11f, §7a.11, §7a.6 "Cap", §7 N3/N4, §9 `own_requests`, §10e, §16 Q-r11-own, Q-r11-own-scope, Q-r11-own-card-detail, Q-r11-cap-own; requirements items 21-24; S35; written from the requirements alone, no code read)

Black-box surfaces: Fishball's tool results (`add_plugin`, `remove_plugin`, `set_plugin_enabled`, `set_plugin_settings`, `withdraw_request`, a visible plugin tool that asks in its body), the snapshot's `pile`, `POST /api/fishball/requests/answer`, Fishball's model requests and user messages (the "run it again" notice), the scripted stock prompt after the broker, the `own_requests` table of `storages/fishball.json`, the settings stores and the profile folder. "Retry" = Fishball's woken turn makes the identical call: the fake model is scripted for it through a marker (`queueMarker`, marker = the request id, queued just before the click), because a pass lasts only as long as the turn Fishball was woken for.

Support added: `test/support/rev11f.mjs` (host, `ownTools`: call / click with scripted retries / withdraw, `ownRows`, `detailEntries`); constants `OWN_REQUEST`, `WITHDRAW_TOOL`, `OWN_STATUS`, `OWN_MORE`, `OWN_WITHDRAW_HINT`, `OWN_ASKING_TOOL` (demo_echo asks in its body through `FBTEST_ASKING_TOOLS`); `fishballTool` in `expect.mjs` now works with cards (below).

### [rev11f-request.test.mjs](rev11f-request.test.mjs): add_plugin and remove_plugin (one host, in order)

| id | technique | requirement | expected |
|---|---|---|---|
| OWN-01 | EP (mode asks) | item 21; §14 "returns at once with a card" | `ok:false`, code `waiting-for-approval`, waiting text, within seconds; a card of Fishball's session with tool, exact arguments and its reason; the stock prompt not asked; nothing installed; `own_requests` row `waiting` |
| OWN-02 | ST (card waiting) | item 21 "keeps handling whatever else comes in" | another message gets its model step; the one card is still there |
| OWN-03 | ST (waiting → approved) | item 22 | route 200; card leaves; a notice naming the request and saying to run it again wakes Fishball (a model step) |
| OWN-04 | ST (approved → used) | item 22 "one-time pass covers the identical retry" | the retry installs; no second card; no stock prompt; row `used` |
| OWN-07 | ST (waiting → rejected) | item 22; defaults "Rejecting Fishball's own card tells Fishball without waking it" | no model step for 1 s; row `rejected`; Fishball's next turn carries a text naming the request; the identical call asks again (no pass) |
| OWN-08 ×4 | DT (withdraw: waiting / again / unknown / a session's card) | item 23 | waiting: ok, card gone, row `withdrawn`, a click is 409 `expired`; a second withdraw, an unknown id and a managed session's card id are refused; the session card stays |
| OWN-09 | ST (pass ends with the woken turn) | defaults "Pass lifetime" | Allow with a woken turn that does not retry; a call in a later turn files a new card |
| OWN-10 | EP (policy never) | §7a.11 "Never-asking modes" (a fact since S35); §14 (Reading) | refused (`ok:false`, not waiting), no card, no stock prompt, no `own_requests` row |
| OWN-11 | ST (restart before the click) | item 24; §14 "Allow after it still works" | the card is in the pile after the start with the same tool and arguments; Allow works, the woken turn's retry installs; no second card |
| OWN-12 | BVA (`rationaleChars` 5 / default) | §9 `own_requests.reason` | Fishball's reason on the card is cut to 5 characters; whole at the default |
| OWN-13 | BVA (`argumentExcerptBytes` 16 / default) | §9 `own_requests.arguments` | arguments on the card cut to 16 bytes + an ellipsis, a prefix of the real ones; whole at the default |
| OWN-14 | EP (remove_plugin) | item 21 | a card, no stock prompt; the package stays until Allow; the retry removes it |

### [rev11f-scope.test.mjs](rev11f-scope.test.mjs): every kind of Fishball request (settings fixtures; demo_echo asks in its body)

| id | technique | requirement | expected |
|---|---|---|---|
| SCP-01 | EP (unchecked tools) | §7 N4; Q-r11-own-scope | a card with a detail list naming the plugin's tools; no stock prompt; Allow + retry turns the plugin on |
| SCP-02 | EP (a plugin tool that asks in Fishball's session) | Q-r11-own-scope; S35 | returns at once with the waiting text; a card for the tool with its exact arguments; no stock prompt |
| SCP-03 | DT (retry after Allow: changed value / other key order / second use) | §7a.11 "The pass key" (S35 table) | changed `command` → new card; same arguments, other key order → runs (`outcome=allowed-once`); the same call again → new card |
| SCP-04 | EP (turning on one of Fishball's own plugins) | Q-r11-own-scope; §10d | a card, no stock prompt, the feature stays off; Allow + retry turns it on |
| SCP-05 | EP (set_plugin_settings) | Q-r11-own-scope | at once; the card's detail lists `path: old → new`; stored values unchanged; no audit row; no secret; no stock prompt |
| SCP-07 | ST (Reject) | item 22 | Fishball not woken; nothing saved |
| SCP-06 | ST (Allow + retry) | item 22 | the retry saves (`ok:true`, `changed`); no second card; the stored values changed; audited |

### [rev11f-detail.test.mjs](rev11f-detail.test.mjs): the bound on the detail list (Q-r11-own-card-detail)

| id | technique | expected |
|---|---|---|
| DET-01 | EP (default limit) | every unchecked tool of the plugin once, with the first description line and never the second; no "and N more" |
| DET-02 ×2 | BVA (limit L, L+1; L = the list's bytes) | the whole list |
| DET-03 | BVA (limit L−1) | whole entries that are a prefix of the full list (≥ 1, < n), then "and K more", K = the entries left out; the shown entries fit the limit |
| DET-04 | EP (a limit between) | the same shape |
| DET-05 | BVA (settings, 4 changes: L, L−1; a 400-char value) | whole at L; cut shape at L−1; the value still cut to `settingsPromptValueBytes` |
| DET-07 | BVA (first entry longer than the limit 20, more behind it) | first entry cut with "…" to fit, then "and n−1 more" (manager decision 2026-11-02) |
| DET-06 | BVA (one over-long entry: E, E−1, 20) | whole at E; at E−1 and 20 one entry cut with "…" (a prefix, at most limit + the ellipsis); no "and N more" |

### [rev11f-cap.test.mjs](rev11f-cap.test.mjs): own cards and `maxPendingApprovals` (Q-r11-cap-own)

| id | technique | expected |
|---|---|---|
| CAP-01 | BVA (cap 2: 1st, 2nd, 3rd) | two cards; the third returns `too-many-waiting` at once with "or withdraw one"; no card, no row, no stock prompt |
| CAP-02 | ST (full → withdraw one) | the next request is a card; then full again |
| CAP-03 | ST (full → Reject a card) | a place is free |
| CAP-04 | DT (one session card + one own card, cap 2) | together they fill the cap; the next own request is refused |
| CAP-05 | BVA (default cap 8: the 8th, the 9th) | eight cards, the ninth refused |

### Older cases changed by rev11f (changed on purpose; why)

| file | change | why |
|---|---|---|
| `fishballTool` (support/expect.mjs) | still takes the scripted answers (`OUTCOME.allow` / `reject`, a list in order), but applies them to the cards: when the call returns waiting, Allow once is clicked and Fishball's woken turn makes the identical call (a new call id); a second card (the unchecked-tools prompt after the install prompt) takes the next answer; Reject is clicked and the waiting result is returned. The result gains `cards`; `approvals` (stock prompts) is now empty for Fishball's own tools | §7a.11: Fishball's own requests no longer reach the stock prompt. The ~12 older files that call Fishball's tools through this helper keep their intent without edits |
| approvals-routing RTE-01 ×2 | flipped: the stock prompt is not asked for Fishball's session; the call returns `waiting-for-approval` and a card of Fishball's session is in the pile; still no request message, not recorded | §7a.11, N3 replaced |
| rev11c-leave LVE-06 | adds: the `too-many-waiting` text carries "or withdraw one" | manager's decision 2026-11-02 (DESIGN §16) |
| **Expected to need repair in stage 2, against the build** | plugins-review (REV-15 asserts a rejected add_plugin's result shape), manager-settings-tools (SPS-02 to SPS-12 hold the stock prompt open with `APPROVER_HOLDS`; the held request is now a card, and "prompt text" is the card's detail), manager-settings-route, messenger-author-approvals, plugins-review2, approvals-broker (where it holds a Fishball tool's prompt), own-plugins (OWN_ASK prompt text) | They read a stock prompt for Fishball's own request or the old rejected result shape; the repair is mechanical (the card replaces the prompt) but cannot be checked without the build |

### Not automated (rev11f)

- The card's look and its "Fishball" label in the browser (client rendering): by hand.
- A plugin tool that asks through a prepended `tools/pre-execute` `ask` (S35 variant A) needs a listener plugin the harness does not have; the body-ask path is tested (SCP-02, SCP-03).
- Withdrawing an `approved` card while the woken turn still runs (needs the woken turn held; the pass is gone either way after the turn ends, OWN-09).

### Ambiguities (rev11f)

- **A-r11f-1. The card's shape for Fishball's own requests.** §9 lists the session-card keys but not the label or the detail list. The tests find a Fishball card as a pile entry whose `sessionId` is Fishball's own session, with `toolName`, `arguments` and `requestId`, take the detail list from a `detail` key (an array, or text with one entry per line), and look for Fishball's reason anywhere in the card's JSON. How the card is "labelled Fishball" is not asserted (client look).
- **A-r11f-2. The waiting result's fields.** `{ok:false, code:'waiting-for-approval', card}` for Fishball's own tools (§7a.11); for another plugin's tool the post-execute text only. The tests match the code or the text `/waiting for your approval/i`, and take the card from the pile, not from the result.
- **A-r11f-3. The wording of the wake notice** ("approved, run it again") is matched by `/run it again/i` and by the request id; the scripted woken turn is triggered by the request id appearing in Fishball's messages.
- **A-r11f-4. Does the closing "and N more" count inside the bound?** The tests measure only the entries before it and assert they fit; they never assert a count that depends on the answer. Likewise, whether the "…" counts inside the bound (A78) or after it (PIL-05): up to limit + 3 bytes is accepted.
- **A-r11f-5. A first entry longer than the bound with more entries behind it** is not tested (cut with "…" and then "and N more", or something else); only a single over-long entry is.
- **A-r11f-6. Withdrawing a card that is not Fishball's own, or already settled**: refused is all the tests require (`ok` not true); the code is not asserted. Reject's note reaching Fishball: only its next turn naming the request is asserted.
- **A-r11f-7. Already-installed packages.** Whether add_plugin asks before or after it finds a package already installed is not stated, so the card-only cases use a package that is never installed (the fbtest-added-c fixture) and the one-time pass is shown with a stateless plugin tool (SCP-03), not with add_plugin.
- **A-r11f-8. Policy never** (OWN-10) asserts the refusal shape only as `ok:false`, not waiting; DSH's own wording is not asserted.

### Manager's decisions on the rev11f ambiguities (2026-11-02), applied

A-r11f-1 confirmed (`sessionId` = Fishball's session, list under `detail`). A-r11f-4: "and N more" is not counted in the bound; the shown entries total at most the limit and the next whole entry would not fit; a cut entry's "…" counts inside the limit. A-r11f-5 is now DET-07. A-r11f-3: the notice must contain "run it again" and the request id.

- **A-r11d-8. run_code.** `run_code` is a DSH built-in present only in PTC mode, so the fixture cannot register it (`unknown tool`). `demo_echo` stands in for "every other tool" in the exact-only cases (GRT-09); `run_code` itself is left to the hand check.

## Revision 11 rev11g cases (questions and plan reviews in managed sessions; DESIGN §14 row rev11g, §7a.10, §9 "Session cards"/"Open questions"/"Tag records"/`settings['questions']`, §10e "Question mode"/"Host API", §11 "Revision 11", §16 Q-r11-questions, Q-r11-question-card, Q-r11-timed-wait, Q-r11-timed-release, Q-r11-continued-cards, Q-r11-question-off, Q-r11-mode-place, Q-r11-question-tag; requirements items 25-27; S36, S37; written from the requirements alone, no code read)

Files: `rev11g-hold` (7), `rev11g-flow` (15), `rev11g-modes` (18), `rev11g-plan` (11), `rev11g-validate` (30), `rev11g-tags` (8), `rev11g-restart` (6). Shared set-up: [support/rev11g.mjs](support/rev11g.mjs) on the rev11c host.

### Harness added for rev11g (test code only)

- **The session's own question card** is a stand-in registered by the fixture bundle (`FBTEST_QUESTIONS=1`, fixtures/fbtest-tools): a prepended `user-questions/request` listener that mounts before dsh-fishball, so Fishball's router (prepended later) runs first and its `next()` reaches it, as the approvals stand-in does. It keeps the card OPEN until `qAnswer` (your click), `qDiscuss` (Discuss: `ASK_CANCELLED`) or the request's signal aborts, which closes it (the gateway's `cancel` to a browser). It does NOT claim `attachWait`, so a timed question is held only if Fishball's router holds it. Worker ops: `qCards`, `qAnswer`, `qDiscuss`, `qContinued` (`userQuestions.answer`, what the browser's RPC calls), `qProjection`, `planCommand` (`/plan`, `/plan off`), `planQuestion`.
- **Presets** `fbtest-ask` (legacy blocking `ask_user_question`, as the shipped presets) and `fbtest-ask-timed` (timed, default 120 s, per-call `timeout`). Plan reviews use the `standard` preset, because `/plan` and `exit_plan_mode` come with it.
- **Fishball's model** answers a question notice from a plan (`planQuestion {needle, args}` → `answer_question({question_id, …args})`), the question id taken from the newest user message with the needle and a `qst_…` id.
- `eventSummary` also gives each event's `seq` (when it has one) and a `tool/call`'s `callId` and `name`, so a tag's `seq` can be checked against its turn.
- No older case is changed. (`support/constants.mjs` gains `PRESET.ask`/`askTimed` and the rev11g constants; the old `CARD_KIND.question` is used as is.)

### What is checked, per "done when" item

| Done-when item | Cases |
|---|---|
| `attachWait` proof first: a timed question's wait is held through `approvalAnswerSeconds` past the tool's shorter `timeout`, and still held once it is a pile card | HLD-01, HLD-02, HLD-03, HLD-04, HLD-05, HLD-06, HLD-07 (file first) |
| 120 s limit measured against `approvalAnswerSeconds` | FLW-07 (1 s, 3 s), HLD-01..03, MOD-04..06 (no answer) |
| In each mode a question behaves as item 25 says; User mode: Fishball's answer is refused and its note shows on the card | MOD-01..07 (decision table), FLW-12, PLN-10 |
| A question answered in the session's own card clears its pile card, and the reverse | FLW-08, FLW-09, FLW-05, FLW-13, HLD-02, PLN-05..07, RST-05/06 |
| Every answered question and plan review shows its tag in the turn tail (not on the question row) | QTG-01..08 (tag records, `seq` in the right turn, no tag text in the session's log or the result); the drawing itself is a hand check |
| A session that is yours keeps its questions with no Fishball step | FLW-01, PLN-11 |
| Fishball or Permission requests off: the question stays in its own card, Fishball takes no step | OFF-01..04 |
| The router answers in the browser's exact shape (result matches a browser answer byte for byte); a malformed batch is refused and the question stays open | FLW-04, FLW-03, VAL-01 ×13, VAL-02..05 |
| Legacy question's call id recovered from the log, so its tag lands in the right turn | QTG-01, QTG-03, QTG-04, FLW-10 (the card's `callId`) |
| Plan review: Approve exits plan mode; Keep planning with feedback keeps it on and the agent sees the feedback; Discuss closes the pile card | PLN-02..08 |
| A blocking question or plan review open at a restart ends with its card | RST-01 |
| A timed question Fishball answers within its time returns in the same turn | HLD-01, HLD-05, QTG-05 |
| A continued timed question open at a restart has its pile card again after the start | RST-02..06 |
| A child agent's question never reaches Fishball | CHD-01 |
| The session's own question card is open while Fishball decides, and the first answer wins | FLW-02, FLW-03, FLW-05, FLW-06, HLD-06 |
| In a real browser: the session's own question card (legacy and timed) and plan-review panel close when Fishball's answer wins; the pile card closes when you answer in the session first | not automated: stage 2 hand check |

### Readings the tests take (the design is silent or loose; a different builder reading is reported, not hidden)

1. **Names the design leaves open.** The pile card's id is read as `questionId`, falling back to `requestId`/`id`; a question card has `kind: 'question'` (§9), its `callId` and `sessionId`, and shows the question text, choices (or the plan) and Fishball's note anywhere in its JSON. A plan-review card is also `kind: 'question'`. The snapshot key for the mode is `questionMode` (§10e). Refusals are `{ok:false}` or an error result; only User mode's code (`mode-user`) is named, so only it is compared. A question notice is a `fishball-notice` user message that carries the `qst_…` id.
2. **User mode shows the pile card at once** ("always the pile", §7a.10), not after `approvalAnswerSeconds`. MOD-06, PLN-10.
3. **`to_user: true`** makes a card at once with the note, in any mode (FLW-12, PLN-05).
4. **A note** (`answer_question({question_id, note})` with no answer) is accepted in every mode and shows on the card (MOD-06).
5. **Keep planning with no feedback** is `answer_question({question_id, approve: false})`; the agent is then told to revise and present again (PLN-04, dsh-plan-mode's wording).
6. **After a restart, "at start" means the cards exist without anyone resuming the sessions** (RST-02, §7a.10 "At start the router rebuilds"). Resuming a session first would hide a router that only rebuilds on resume. If the builder rebuilds lazily, RST-02 fails and the question for the manager is whether that is intended.
7. **`qContinued`** (your late answer in the session) is the call the browser's RPC makes; the router learns it from the `user-question-reply` message (S36).
8. **A question that left Fishball** (Permission requests turned off while it waited, OFF-02) is no longer answerable through the route (409). The design says only that it goes back to the session's own card.
9. **Not asserted, because the design leaves it open:** whether Fishball's answer is still accepted after a question moved to the pile (the design says "the question moves to your pile"); the Auto-mode rule (prompt-only); the multi-select "same label twice" batch (VAL-04 last row only checks that nothing crashes).

### Not automated (hand checks in stage 2)

- The turn-tail drawing of "Asked Fishball" plus the answer, and that nothing is drawn on the question row (QTG-07 checks only that the Host leaves the tag out of the tool result and the session's log).
- The pile cards' look (question form, plan with Approve and Keep planning plus a feedback field) and the mode switch on Fishball's settings page.
- The real browser: the session's own question card (legacy and timed) and plan-review panel closing when Fishball's answer wins; the pile card closing when you answer in the session first; `attachWait` against the real gateway/browser claim.

### rev11g addendum: too-many-waiting as JSON (manager's decision, 2026-11-02)

`rev11g-cap.test.mjs` CAP-01: past `maxPendingApprovals`, Fishball's own request answers parsed JSON `{ok: false, code: 'too-many-waiting', …}` with "or withdraw one" in the text. Total rev11g cases: 96. Readings 1-4 above (User mode/`to_user` card at once, cards rebuilt at start without resuming, 409 after a question goes back to its session, `questionId`) are confirmed by the manager.

- **A-r11e-8. Audit of `answer_prompt` (settled, manager 2026-11-02).** Follows DESIGN §9: a `decisions` row `answer-prompt` AND an approvals audit row of kind `prompt`; APR-10 expects both.

### rev11g after the build (stage 2)

Older cases changed on purpose: `STATE_KEYS` gains `questionMode` (HTP-01, HTP-04/05, SND-01, PHT-01, PHT-04) and `OWN_PLUGINS.approvals.tools` gains `answer_question` (OWN-01): DESIGN §10e, §7a.10. Readings 1 and the rest above changed as follows: plan-review cards are `kind: 'plan-review'` (the helper accepts both); a tag record's `answer` is a word (`answer`, `approve`, `keep-planning`) and the published record carries Fishball's words (the user's confirmed reading); a rebuilt continued card is the user's and Fishball's answer on it is `expired` (RST-04); a `to_user` question gets a Sent-to-you tag (FLW-12); the route's `bad-answer` for a well-shaped body with invalid answers (FLW-14); the session's own card is untimed (HLD-01). Full report: [hand-checks/rev11g.md](hand-checks/rev11g.md).

## Revision 11 rev11i cases (managed-session marks; DESIGN §14 row rev11i, §10e "Managed-session marks", §16 sixth round; requirements item 30; S37; written from the requirements alone, no code read)

### Automated: [managed-marks.test.mjs](managed-marks.test.mjs)

The banner and icon are drawn in the browser, so these check what a client reads: the snapshot's `managed` list, `features.messages`, `status`, `preferences.brandStyle`, the route of the banner's button, and the served bundle. Technique: EP, ST, DT.

| id | technique | expected result |
|---|---|---|
| MKS-01a..d | EP (way in: Hand over, Send to Fishball, message_session, start_session) | the session is in `managed` with its way's tag. (The fifth way, `answer_prompt`, is asserted in rev11e-answer: `by` is `prompt-answer`.) |
| MKS-02 | EP (yours, Fishball's own) | neither is listed; the list is exactly the four managed ones |
| MKS-03 | ST (managed –Take back, banner route→ yours) | 200; the id leaves the snapshot and an events frame; the others stay |
| MKS-04 | ST (managed –release_session→ yours) | the id leaves the snapshot and an events frame |
| MKS-05 | DT (Fishball's own / unknown / bad body) | 409 `is-fishball` / 409 `unknown-session` / 400 `bad-body`; list unchanged (the banner's refusal dialog comes from these) |
| MKS-06 | ST (Session messages on –off→ on) | off: `features.messages` false and the entries kept unchanged; on: true and the same entries |
| MKS-07 | EP | `status` live while entries exist |
| MKS-08 | EP | `preferences` has only `brandStyle`, one of fishball / deepseek, default fishball |
| MKS-09 | EP | the served client bundle has "Managed by Fishball" and "Take back from Fishball" (weak: the first string may already exist elsewhere on base; the browser checks decide) |
| MKS-10 | ST (restart) | the same entries after a restart |

Not automatable here: Fishball not live (no way to stop the assistant without ending the host), brandStyle change (a plugin setting set through the browser page), everything drawn.

### Browser checks (real DSH, fake model, built-in browser pane; one row per "done when" item, plus the partitions)

Setup: sessions A (Hand over), B (Send to Fishball), C (message_session), D (start_session), E (answer_prompt on a frozen prompt), M (yours), plus Fishball's own chat F. Screenshot each row. Themes: light and dark. Languages: English and 简体中文 (banner wording proposed: 由 Fishball 管理).

| id | done-when item | technique | steps | expected |
|---|---|---|---|---|
| BRW-01 | banner after each way in | EP (5 ways in) | open each of A–E | banner above the composer: mark, "Managed by Fishball", "Take back from Fishball"; appears in the open chat without a reload when the way in happens while it is open (at least for A and C) |
| BRW-02 | banner never in yours / Fishball's chat | EP | open M and F | no banner in either; F shows its pile (when cards exist), never the banner |
| BRW-03 | banner leaves after Take back | ST (managed → yours) | click the banner's button in A | banner gone with no reload; A's header menu offers Hand over again; Fishball got one note |
| BRW-04 | banner leaves after release_session | ST | Fishball releases C | banner gone with no reload |
| BRW-05 | button refusal shows the dialog | DT (refusal) | make the route refuse (for example stop the Host-side feature or take back in another tab first, so 409 `unknown`/`feature-off` follows), click | the same refusal dialog and wording as the session menu; banner state stays consistent |
| BRW-06 | mark follows Sidebar icon | EP (fish vs orca) | change the "Sidebar icon" setting on Fishball's page while A is open | banner mark switches between Fishball's fish and DSH's orca at once, no reload; same for the sidebar mark |
| BRW-07 | hidden while Session messages off | DT (messages off × managed) | turn Session messages off | banner and sidebar mark of A–E disappear; sessions stay managed (settings list still lists them); turning it on brings them back |
| BRW-08 | hidden while Fishball isn't live | DT (not live) | put Fishball into recovery/archived (archive its session) | banner and sidebar mark hidden; back when it is live again |
| BRW-09 | sidebar mark while idle | EP (idle) | idle managed session A | Fishball's mark (or orca per setting) in the status-light place of A's row; unmanaged M keeps DSH's normal row |
| BRW-10 | sidebar shows DSH's light when not idle | ST (idle → running → waiting → just finished → idle) | run a turn in A; hold a prompt (waiting); let it end | running: DSH's light (no mark); waiting: DSH's light; just finished: DSH's light; idle again: the mark returns |
| BRW-11 | no mark on yours or Fishball's own row | EP | look at M's row and F's row | no Fishball mark on either (F keeps whatever DSH shows) |
| BRW-12 | themes | EP (light, dark) | repeat BRW-01, BRW-09 in both | readable, token colours, no clipped text |
| BRW-13 | languages | EP (en, zh) | switch language, repeat BRW-01 | banner text and button follow the language |
| BRW-14 | order among docks | EP | A with a Todo or Queue dock showing | the banner sits among the docks without hiding the composer; record the order (builder's choice) |
| BRW-15 | pile never with banner | EP | cards in the pile, open A and F | the pile shows in F only; A shows only the banner |
| BRW-16 | Take back from three places agree | ST | Take back from the banner, then Hand over again from menu, then Take back from the settings list | all places update; one note each time |
| BRW-17 | restart | ST | restart the Host, reload | banner and marks present for managed sessions again |

## Fix: read_session labels who wrote each message, start_session keeps a half-made session (DESIGN §5c, §5d, Q-read-roles, Q-start-half-made)

Baseline before the fix: 1240 pass / 0 fail / 1 skip (OFM-06). Every new file was also run against the version before the fix (d63322a, extracted with `git archive` and booted with `FBTEST_PLUGIN_DIR`): the control and regression cases pass there, the cases that need the fix fail there.

### [messaging-read-roles.test.mjs](messaging-read-roles.test.mjs): read_session labels (ROL-nn)

Two hosts: one for everything but the restart, one restarted so the session is read from its stored log.

| id | technique | expected result |
|---|---|---|
| ROL-01 ×25 | DT (source kind × sender id) | `user` for kind `user` (also with an rpc id, also kind `user-rpc`); `fishball` for a relay whose sender is Fishball's session; `agent` with `from` for any other sender (including Fishball's id plus one character, minus one character, in upper case); `context` with `source` = the kind for notice, goal, schedule, runtime-context, webhook, team-message, subagent-settled, skill-invocation, session-reference, user-approval, user-question-reply, `agent-message-extra`, a made-up kind, and the near-misses `User`, `USER`, `user `, `Agent-Message`; each entry has exactly the keys of its label |
| ROL-02 ×1 | ST | one entry per message, in recorded order, newest last, nothing else in the session |
| ROL-03 | EP | role `user` for the three user rows and no other |
| ROL-04 | EP (real turn) | a scripted answer is `{role:'assistant', text}`; the typed message is `user`; the context DSH adds to a first turn is `context` with its kind; the whole list equals the oracle |
| ROL-07 | EP (a turn with a tool call) | the assistant message that only calls a tool (no text) and the tool result are not listed; the typed message and the final answer are |
| ROL-05 ×5 | DT (a relay's sender: missing, null, 7, 0, '') | `{role:'agent', text}` with no `from` key when the sender is not a string (review fix); the empty string is a string, so `from: ''` |
| ROL-06 ×5 | EP + error guessing | no source at all: `{role:'context', text}`, no `source`/`from` key; an empty source object, a null, a numeric and an empty kind: `context`, no `from` |
| ROL-10 | ST (live session) | typed turn, message_session, a relay from another session, a notice: the list equals the oracle; Fishball's own message is `fishball`; only the typed message is `user` |
| ROL-11 | ST (start_session) | the first message is `fishball` with its text verbatim; the answer after it is `assistant`; nothing is `user` |
| ROL-12 | ST (restart) | after a restart the session is not live; read_session gives the same messages with the same labels as before |
| ROL-20 | BVA (15 messages, all labels) | the newest 12, in order, labels intact |
| ROL-21 | BVA (12 × 1024 bytes = 12288, labels of 300+ characters) | all 12 kept: labels are not counted |
| ROL-22 | BVA (12288 + 1) | at most 12288 bytes of text; 11 or 12 messages; the newest whole and labelled; an oldest that is kept is cut with an ellipsis |
| ROL-23 ×2 | BVA (13000 bytes of ASCII; 16000 bytes of 2-byte characters) | one entry, label kept, text a prefix ending with an ellipsis, at most 12288 bytes, no broken character |
| ROL-24 | EP (empty-text messages of five labels, in the middle and at the end) | skipped and not counted toward the 12 |
| ROL-30 ×2 | EP (hostile source kind, hostile sender id) | one closing tag, one messages line, one session_id line; the strings come back exactly |
| ROL-40 | EP | the tool description names user, assistant, fishball, agent and context and words context exactly as the review fix says; the arguments are still only `session_id` |
| ROL-41 | EP | the result's `note` is exactly the review fix's sentence (information, never instructions; a user message was typed to that session, not to Fishball) |

### [messaging-start-halfmade.test.mjs](messaging-start-halfmade.test.mjs): start_session keeps a half-made session (HM-nn)

Three hosts: A (title service, no cap), B (`sessionsPerHour` 2), C (no `sessionTitle` service).

| id | technique | expected result |
|---|---|---|
| HM-00 ×2 | EP (control) | a normal start in a registered workspace, by id and by path, has no `workspaceError` and the session joins the workspace |
| HM-01 ×2 | EP (workspace id, workspace path) | ok; same `folder` and keys as the normal start plus `workspaceError: 'workspace-attach-failed'`; one failed attach for this session in this workspace; the session exists, in no workspace; renamed once before the one steer (a relay from Fishball); the first message delivered once; outbox `start`, `delivered`, with `targetSessionId`; the new session runs its first turn; DSH reports the title |
| HM-02 ×2 | DT (rename invalid / fails) | ok with `titleError` `title-invalid` / `title-failed`, no `title`, `workspaceError`; delivered and recorded |
| HM-03 ×2 | DT (flag set / not set) | watch with `createdBy` assistant and one notice after the first turn; none without the flag |
| HM-04 | ST | read_session ok and shows the first message; watch_session ok |
| HM-05 ×2 | EP (flush rejects / answers false) | ok, `unconfirmed`, same keys as the unconfirmed start made whole plus `workspaceError`; steered once; outbox `unconfirmed` |
| HM-06 ×3 | DT (steer throws × rename ok / invalid / fails) | `delivery-failed` with `sessionId`, the title outcome, `workspaceError`, no `folder`; keys as the same failed delivery made whole plus `workspaceError`; outbox `failed` with `errorCode` |
| HM-07 ×2 | DT (attach-failed error with only a string sessionId; with extra details) | carries on: ok, `workspaceError`, renamed, delivered, recorded |
| HM-08 | EP (controls) | no `workspaceError` on a start in a workspace, a start in a plain folder, or a normal failed delivery |
| HM-10 ×9 | DT (create fails: a different code; the attach code in upper case; with a suffix; with no details; details without a sessionId; a numeric, null and object sessionId; an error with no code) | `{ok:false, code:'delivery-failed'}`; outbox unchanged; a session created anyway gets no message and no title |
| HM-11 | ST (cap 2) | none of HM-10 was counted: a half-made start succeeds |
| HM-12 | ST (cap 2) | a half-made start whose delivery fails is refused `delivery-failed` with `workspaceError` |
| HM-13 ×2 | ST (cap 2 spent) | the next start, normal or half-made, is refused `hourly-cap` and creates nothing: both half-made starts were counted |
| HM-30, HM-31 | EP (no sessionTitle service) | `titleError` `title-unavailable` with `workspaceError`, delivered and recorded; a failed delivery carries both and the sessionId |

### [approvals-provenance.test.mjs](approvals-provenance.test.mjs): permission-request provenance by source kind (PRV-nn)

| id | technique | expected result |
|---|---|---|
| PRV-01 ×9 | DT (source of the message that starts the turn; session started by the user) | started by `the user`; turn by `the user` for kind user (also with an rpc id), `Fishball (message_session)` for a relay from Fishball, `another agent or a notice` for a relay from anyone else (including Fishball's id plus one character), a Fishball notice, a goal round, a schedule and a made-up kind |
| PRV-02 ×9 | DT (source of the session's first message, which is also its first turn) | started by `the user`, `Fishball (start_session)` for a relay from Fishball, otherwise `another agent or a notice` or `unknown`; turn by as in PRV-01 |
| PRV-04 ×14 | DT (source of a later message; the user typed earlier) | the request's `latest_user_message` is the later message for kind user (also with an rpc id) and the earlier typed message for every other source, including relays with a null, numeric or missing sender, `User` and `user ` |
| PRV-03 | ST | after a relay from Fishball the user types: the new turn is `the user`'s, the session is still started by Fishball |

### Ambiguities (read_session roles, half-made start)

- **A149. A message with no source.** DSH's steer crashes on a message with a null source ("Cannot read properties of null (reading 'kind')", observed) and DSH's own load check refuses one without a source, so a no-source message can only be produced by appending the event to a live session's log. ROL-06 does that (`injectUserMessage`); a no-source message read back from a stored log is not driven. The same op appends every ROL-01 row; a steered message is stored with exactly the source it was given (observed with the table's kinds), so the appended events have the shape of real ones, and ROL-04 and ROL-10..12 repeat the labels through the real paths (DSH's own turns, steer with a source, message_session, start_session).
- **A150. Sources the requirement does not name.** An empty source object, and a `kind` that is null, a number or the empty string: the tests require only "never `user`", `context`, and no `from` key. (A relay whose sender is not a string was in this list until the review fix specified it: `{role:'agent', text}` with no `from`, ROL-05.) The empty-string sender is read literally: a string other than Fishball's, so it keeps `from: ''`. Whether such a message carries a `source` key is not asserted.
- **A151. Provenance regression.** "Its behaviour must be unchanged" is tested by PRV-01..03 plus the existing APR-01 and APR-16 cases, and the PRV file was run against the version before the fix with the same answers. The labels for a Fishball notice, a goal round, a schedule and a made-up kind come from DESIGN §7a's value `another agent or a notice`; for a session's first message from them, `unknown` is accepted too, as in APR-16.
- **A152. Shapes.** Each entry is compared whole with `deepEqual`: `{role, text}`, `{role, from, text}` or `{role, source, text}`, as the requirement writes them. An extra key (for example a timestamp) would fail the cases.
- **A153. Bounds with labels.** "Count message text as before" is read as: at most 12 messages and at most 12288 bytes of message text, with `from` and `source` not counted. At exactly 12288 bytes of text all 12 messages must come back (ROL-21). One byte over (ROL-22) the requirement says only that older ones are dropped first and one long message is cut with an ellipsis, so the case accepts the oldest being dropped or being cut with an ellipsis and requires the newest to be whole.
- **A154. Empty text.** A user/message with no content blocks is an empty-text message (ROL-24). Whitespace-only text is not tested.
- **A155. The oracle for real sessions.** ROL-04, 10, 11 and 12 compare read_session with the labels computed from the session's own event log (`expectedFromLog` in the test: the requirement's rule applied to each `user/message` source and `assistant/message`; empty text skipped). Sessions in these cases stay under 12 messages and 12 KB. DSH adds a `runtime-context` and a `time-context` message to a session's first turn (observed on 0.2.1-rc.2); they must read as `context` with those sources. ROL-04 logs them and does not require them.
- **A156. The tool description.** "Explains the five roles" is tested as: the description contains each of `user`, `assistant`, `fishball`, `agent`, `context` as a word (case-insensitive). The wording is not asserted.
- **A157. Simulating the attach failure.** `failAttach` replaces `attachSession` on the registered workspace's own object, so DSH's real `sessionController.create` creates the session and throws its real error. The session is then in no workspace (what DSH shows under Ungrouped). Only the folder forms the requirement names are used: a workspace id, and the path of a registered workspace; both put the session in the workspace when the attach works (HM-00).
- **A158. Other create failures.** `failCreate` throws an error with a given `code` and `details` instead of DSH's own. Rows that need a session id in the details create the session through DSH's own create first (`createFirst`). "Without a string `details.sessionId`" is tested with the id missing, a number, null and an object, and with the details missing; an empty-string id and an id naming no session are not tested. HM-07 shows the recognized error is the code plus a string `details.sessionId`: `workspaceId` need not be there and extra details are ignored.
- **A159. What the half-made answer must look like.** The requirement lists `sessionId`, `folder`, the title outcome and `workspaceError`. The tests compare the answer with the same start made whole in the same workspace (the reference, made in the same host): same `folder` (observed: the workspace's path, for an id and for a path), same keys, plus `workspaceError`. Fields that come with a case (`unconfirmed` with its `note`, `watch`) are therefore not listed by name in HM-05.
- **A160. The cap.** "Counts it against `sessionsPerHour`" is tested by spending a cap of 2 with one half-made success and one half-made failed delivery and then expecting `hourly-cap`, from a normal start and from a start that would be half-made (which must create nothing). HM-11 shows that nine other failures were not counted.
- **A161. The refusal for other failures.** `{ok:false, code:'delivery-failed'}` exactly, as OUT-04 and as before the fix. A session that was created anyway (`createFirst`) is not sent the first message and is not titled.
- **A162. The restart case.** ROL-12 relies on a restarted host resuming only Fishball's own session, so the other session is read from its stored log; it asserts that first (`agentStatus` null) and that reading does not make it live.
- **A163. Wording fixed by the review fix.** The `read_session` note and the tool description's definition of context are asserted verbatim (ROL-40, ROL-41), because the coordinator gave the exact sentences. The earlier checks (each role named as a word) stay.
- **A164. The request's latest user message (PRV-04).** "Only DSH user sources count" is tested with kind `user` (with and without an rpc id) as the only sources that replace the user's earlier typed message; every other source in the table leaves it. The literal kind `user-rpc` is not used there: DSH never records it (its rpc source has kind `user`). PRV-04 also passes on the version before the fix.

### Cases changed by this fix

- No existing expectation changed. The start_session helpers of messaging-start-title.test.mjs (`useHost`, `assertDelivered`, `assertTitleError`, `assertFailedDelivery`, `assertRefused` and the rest) moved to [support/start-session.mjs](support/start-session.mjs) unchanged; `assertDelivered` gained an optional `folder` argument that defaults to the old behaviour.
- `READ_ROLES` in support/constants.mjs still lists `user` and `assistant`: TOL-07 reads a session that has only those two, and still passes. `READ_ROLE` (five labels) and `HALF_MADE` are new.

## Revision 11: the live fixes on revision 11 (start_session managed step, read_session settings, list_user_messages sources)

The merge brought the live branch's tests (ROL, HM, PRV above) onto revision 11, where only managed sessions' permission requests reach Fishball, `start_session` also makes the session managed (DESIGN §5d "Not made managed", §5e) and read_session's bounds are the settings `readSessionMessages` and `readSessionBytes` (§16). The files below are new; the harness gained `failStoreTable`, `storeWriteCalls` and `storeRecord` ([support/worker.mjs](support/worker.mjs)) and [support/read-session.mjs](support/read-session.mjs).

### [managed-start.test.mjs](managed-start.test.mjs): R3, start_session makes the session managed and carries on when it cannot (MST-nn)

Two hosts (approver after the broker, as managed-ways): A has no cap; B has `sessionsPerHour` 2. The new session's first message makes it ask for permission at once, so where its request goes shows whether it is the user's (its own stock prompt) or managed (a request to Fishball).

| id | technique | expected result |
|---|---|---|
| MST-01 | EP (control, the registry works) | no `managedError`; managed by `start`; every request has the three managed tools; its request goes to Fishball |
| MST-02 | EP (the managed-list write fails before storing) | ok with `managedError: 'manage-failed'`, the control's keys plus `managedError`; the write was tried after the rename and before the first message; renamed once; first message delivered once as a relay from Fishball; outbox `start`/`delivered`; the session ran its first turn; not listed, not stored, no Fishball tool in any request, its request went to the stock prompt and Fishball was not told |
| MST-03 | EP (the write is stored, then the call fails) | no `managedError`; the control's keys; listed by `start`; its request goes to Fishball |
| MST-04 ×2 | DT (flag × write fails) | the watch (`createdBy` assistant) and one notice after the first turn, or none; `managedError` either way |
| MST-05 ×3 | DT (write fails × rename ok / invalid / fails) | `managedError` next to `title` or `titleError`; delivered and recorded |
| MST-06 ×2 | DT (flush rejects / answers false × write fails) | ok, `unconfirmed`, `managedError`; keys as the unconfirmed start made whole plus `managedError`; steered once; outbox `unconfirmed` |
| MST-07 ×2 | DT (steer throws × write fails / write stored then fails) | `delivery-failed` with `sessionId`, the title, no `folder`, outbox `failed`; with `managedError` and the session the user's (first), without and managed (second) |
| MST-08 | EP (control, steer throws, registry works) | `delivery-failed` without `managedError`; the session is managed |
| MST-09 ×2 | DT (workspace attach fails × write fails / works) | both `workspaceError` and `managedError` (the session the user's, in no workspace) / `workspaceError` alone (managed) |
| MST-10 | ST (the user's after a failed write → Hand over) | 200, managed by `hand-over`, the next request has the three tools |
| MST-20..22 | ST (cap 2) | a start whose write fails succeeds; one whose delivery also fails is refused with `managedError`; the next start is refused `hourly-cap`, creating nothing |

### [rev11b-sources.test.mjs](rev11b-sources.test.mjs): R4, list_user_messages lists only what the user typed (LUS-nn)

| id | technique | expected result |
|---|---|---|
| LUS-00..03 | DT (one message per source in a managed session's log; 2 typed, 15 not) | listed: kind `user` plain and with an rpc id. Not listed: relays from Fishball, from another session and with a null, numeric or missing sender; a Fishball notice, a goal round, a schedule, runtime context; `user-approval`, `user-question-reply`, a made-up kind, `User`, `user `; an empty source object. The list equals the log's typed messages, newest first, with DSH's ids. Passes on the base branch (83e4275) too |

### [limits-read-roles.test.mjs](limits-read-roles.test.mjs): read_session's bounds are settings, with labelled messages (LRR-nn)

| id | technique | expected result |
|---|---|---|
| LRR-01 | ST + BVA (`readSessionMessages` 12 → 3 → 1 → 12; 15 messages of five labels) | the newest 12 / 3 / 1 / 12, in order, labels intact, applied to the next read |
| LRR-02 | BVA (`readSessionBytes` 2048 / 3072 / default; four messages of exactly 1024 bytes with 300-character labels) | the newest 2 / 3 / all 4: labels are not counted |
| LRR-03 | BVA (`readSessionBytes` 2047) | at most 2047 bytes of text; the newest whole with its label |
| LRR-04 | BVA (`readSessionBytes` 2048, one 5000-byte message from another session) | one entry, label kept, a prefix ending with an ellipsis, at most 2048 bytes |

### Ambiguities (revision 11 fixes)

- **A165. Simulating the failing managed-list write.** `failStoreTable` wraps `put` and `update` on the `managed` table handle of Fishball's open store domain (DSH's storage-domain facility, `ctx.storageDomain.get('fishball')`, its diagnostic lookup), so only that table fails and the outbox the same start writes to keeps working. Mode `reject` stores nothing. Mode `after` lets the write complete and then rejects: this stands in for the requirement's "a change listener throws after the store write", because DSH contains failures of its own domain listeners and Fishball's own listeners cannot be reached from outside.
- **A166. "Managed" when the throw comes after the write.** MST-03 and MST-07's second row require: no `managedError`, the session in the managed list by `start`, and (when it runs) its permission request going to Fishball. They do not require the managed tools in its requests: in this simulation the call fails before the registry can give the session its tools (observed: its requests have none), and DESIGN §5d names a failure while giving the tools among those that leave the session managed.
- **A167. "The session is then the user's."** Not in the managed list, not in the store, no tool whose name mentions Fishball or is `list_user_messages` in any request of the session, its request asked its own stock prompt once and Fishball was not told. A start whose delivery failed ran no turn, so only the first three are checked there.
- **A168. The answer's shape.** The control start in the same host is the reference: the half answer has the same keys plus `managedError` (so `unconfirmed` with its note, or `watch`, need not be named). The refusal for a failed delivery has the keys of the same failed delivery made whole plus `managedError`.
- **A169. The order.** "After naming it and before delivering the first message" is checked with timestamps: the rename (probe), the failing write attempt (`storeWriteCalls`) and the first steer (probe), in that order.
- **A170. A failed delivery still leaves the session managed.** Because the managed step comes before the delivery (A169), a start whose delivery fails but whose registry works leaves the session managed (MST-08). This follows from the order and is not stated separately.
- **A171. list_user_messages and a message with no source.** DSH's agent loop cannot run a turn over a message with no source (it throws reading the source's kind), and the tool is called inside a turn, so the table has no such row; read_session's ROL-06 covers it. The literal kind `user-rpc` is not used either: DSH records its rpc source with kind `user` (LUM-05's USER_RPC_SOURCE).
- **A172. Older tests changed by the merge.** approvals-provenance hands each session over to Fishball first (`makeManaged`), as the rev11a older-tests list does for the other approvals files, because only a managed session's requests reach Fishball. messaging-start-title keeps revision 11's filter for DSH's unrelated `client-module-registry` warning. The merged tests that start a session (HM, ROL-11) pass unchanged: `start_session` makes the session managed there, which they do not look at.

## Revision 11 rev11h cases (stop and redirect; DESIGN §14 row rev11h, §7a.12, §9 "Fishball's other decisions", §11, §16 Q-r11-stop, Q-r11-stop-cap, Q-r11-redirect-order; requirements items 28-29, done-when 9; S34; written from the requirements alone, no code read)

File: `rev11h-stop` (16 cases: STP-01..09 in 8 tests, RDR-01..06, CAP-01..02), on the rev11g host (stand-in question card). Each case uses a fresh managed session; a "running" turn is one held at its first model request (`holdNext`).

| id | technique | expected |
|---|---|---|
| STP-01 | EP | `stop_session` on a running turn: ok, turn ends `aborted`, session idle and still managed, script does not continue |
| STP-02 | ST | pending approval card: card leaves, approval settles `cancelled`, turn `aborted`, later click 409 |
| STP-03 | ST | pending question (User mode): pile card leaves, own card closes, result ASK_ABORTED, late answers refused |
| STP-04 | ST | idle session: ok, no turn end, no model request, still managed |
| STP-05 | ST | idle until next message; a Fishball message then runs a completed turn |
| STP-06 | ST | message queued before the stop starts no turn; it runs at the next wake |
| STP-07 | DT | yours / taken back: `not-managed`, turn untouched, not audited; Fishball's own: `is-fishball`; unknown id refused |
| STP-08/09 | EP | one `decisions` row `stop` by fishball keeping the reason; reason optional |
| RDR-01 | EP | old turn `aborted`, new turn from Fishball (relay source with `senderSessionId`) completes |
| RDR-02 | ST | waiting approval and question cancelled, cards leave, new turn runs |
| RDR-03 | ST | queued user message is read before Fishball's instruction (log order) |
| RDR-04 | DT | refusals as STP-07; nothing delivered |
| RDR-05 | EP | one `decisions` row `redirect` by fishball |
| RDR-06 | EP | idle managed session: instruction just starts a turn |
| CAP-01 | BVA | `messagesPerHour` 2: two redirects ok, third `hourly-cap` and undelivered, `message_session` shares the count; six `stop_session` calls all ok and audited |
| CAP-02 | BVA | `messagesPerHour` 0: no cap for redirect |

Readings (not in the design text, taken from existing conventions): refusal codes are `not-managed`, `is-fishball` (P5 code); a decisions row carries `action`, `sessionId`, `by`, `at`, with the reason somewhere in the row; Stop on a question needs User mode so the question is a pile card at once. No older case is changed.

## Revision 11 rev11-ui-fixes cases (five small UI fixes R1-R5; written from the requirements alone, no code read)

File: `rev11-ui-fixes` (5 cases UIF-01..05; two of them fail until the fix lands). The stored field that records who gave a pass is not named by the requirements, so UIF-01..04 compare the pass entries of the two givers by every field that is not identity, time or free text (snapshot `approvals.recent` and the stored audit record).

| id | technique | expected |
|---|---|---|
| UIF-01 | DT (giver you / Fishball) × (snapshot, store) | answer stays `pass`; the remaining fields differ between the givers |
| UIF-02 | EP (two passes of each giver) | same giver, same remaining fields |
| UIF-03 | ST (restart) | the same fields after a restart, in snapshot and store |
| UIF-04 | EP (entry written before the fix: giver's field removed) | host starts live; the entry, if listed, still reads `pass` |
| UIF-05 | EP (served client bundle) | holds "Ran on your one-time approval", "used once", "used {count} times" |

Left to the hand check (the suite cannot see them): R1 (pile and grants title rows opaque, light and dark, nothing shows through while scrolling); R2 wording for counts 0, 1, 2 in English and Chinese "已使用 {count} 次"; R3 "Fishball:" label on the session's row (and the Chinese label, "Reason:" kept for the agent's reason); R4 audit labels in the settings page, an Allow once on the session's row, Chinese label; R5 wordmark label "Open Fishball" after a language change and fresh load.

## Revision 11 pile list (one-line rows, detail view, animations; P1-P9)

Host-side cases in [rev11-pile-list.test.mjs](rev11-pile-list.test.mjs). PLL-01 and PLL-02 fail on the base until the builder's P3 lands. The layout, animation, focus and fallback-wording requirements are drawn only in the browser, so they are left to the hand check (`hand-checks/rev11-pile-list.md`).

| id | technique | requirement | expected result |
|---|---|---|---|
| PLL-01 | EP | P3 | Fishball's system text tells it to write the note as one conversational sentence |
| PLL-02 | EP | P3 | the note/reason parameter description of `answer_approval` says "one sentence" |
| PLL-03 | EP | P2, P9 | an escalated card carries Fishball's note verbatim; `arguments`, `why`, `callId`, `kind` and every CARD_KEYS key unchanged |
| PLL-04 | BVA (2000 chars) | P4 | a long note is kept whole on the card |
| PLL-05 | EP | P2 | a direct call sent to you has a card with its documented keys (no Host-invented note) |
| PLL-06 | BVA (12 cards, cap raised) | P1, P7 | count 12, newest first, count falls by one per answer |
| PLL-07 | DT | P1, P9 | Reject with no note, Reject with a note, Allow once each answer 200 with the matching code; a repeat is 409 `expired` |
| PLL-08 | ST | P5 | a stopped turn removes only its own card |
| PLL-09 | ST | P6 | a card arriving while another waits joins at the top; the older card is unchanged |
| PLL-10 | EP | P9 | markup in a note is kept verbatim |

Left to the hand check (HC): PLL-HC-P1 rows (two lines, ellipsis, buttons per kind, newest first, count); PLL-HC-P2 fallback why line in English and Chinese and live replacement; PLL-HC-P4 detail (content, other rows and grants hidden, Back/outside/Escape, answer returns, focus); PLL-HC-P5 detail closes when the request leaves; PLL-HC-P6 arrival while detail open; PLL-HC-P7 scrolling, cap, opaque title, grants below; PLL-HC-P8 animations and reduced motion; PLL-HC-P9 `ask_fishball` row, plain-text drawing, Chinese, light and dark.

## Fix: Chinese punctuation stays outside bold text (persona rule; DESIGN §7 "Bold text and Chinese punctuation", §16 Q-bold-punct; requirements R-B1..R-B4; written from the requirements alone, no behaviour code read)

DSH's markdown renderer can leave bold text unclosed when it ends in Chinese punctuation and a letter follows (`**还在进行中：**dsh` showed its asterisks). Fishball cannot change the renderer, so the persona gets one last line asking the model to write `**还在进行中**：` and not `**还在进行中：**`. Two files; both import only the data exports of `src/persona.js` (`PERSONA_ROLE`, `PERSONA_ROW`, `HIDDEN_PROMPT_ENTRIES`), through [support/persona-bold.mjs](support/persona-bold.mjs). Named values are in `PERSONA_BOLD`, `DSH_MARKDOWN`, `AFTER_PUNCT`, `CHINESE_PUNCT` and `BOLD_SENTENCES` in [support/constants.mjs](support/constants.mjs).

### [persona-bold.test.mjs](persona-bold.test.mjs): R-B1, R-B2, R-B3 (PBD-nn; 20 tests; static cases need no host, the R-B3 prompt cases boot one)

| id | technique | expected result |
|---|---|---|
| PBD-01 | EP (rule line count) | exactly one line holds both forms of the example; each form occurs once in the whole persona |
| PBD-02 | BVA (last line) | that line is the last line (index = length − 1); it is not empty; the persona has no trailing line break and no carriage return |
| PBD-03 | EP (wording) | the line contains "bold", "Chinese punctuation", "outside" (case-insensitive) and `**` |
| PBD-04 | DT (order × lead-in) | the form to write comes before the form not to write; "write" just before the first, "not" just before the second |
| PBD-10 | BVA (line count) | baseline lines + 1 (equal if the baseline already has the rule) |
| PBD-11 | EP (every old line) | line i equals the baseline's line i for every baseline line |
| PBD-12 | BVA (edges) | line 0 and the baseline's last line unchanged; the rule line sits right after the last old line |
| PBD-13 | BVA (blank lines) | blank lines at the same indices as the baseline's; the rule line is not blank |
| PBD-14 | EP (exact text) | persona = baseline + line break + rule line |
| PBD-15 | EP (rest of module) | same export names (the three above); `PERSONA_ROW` equal to the baseline's except `config.prefix`; `HIDDEN_PROMPT_ENTRIES` equal |
| PBD-20 | EP (mounted row) | `PERSONA_ROW.name` is `@deepseek-ai/dsh-persona`; `config.prefix` equals the persona and ends with the rule line |
| PBD-21 ×4 | DT (session × rule) | rule line once in Fishball's setup-turn and driven-turn system prompts; in neither the bare-preset nor the standard-preset ordinary session's |
| PBD-22 | EP (prompt shape) | the whole persona occurs once in Fishball's prompt, and the rule line is where it ends |
| PBD-23 ×2 | EP (ordinary) | neither ordinary session's prompt holds either form of the example, "Chinese punctuation" or "还在进行中" |
| PBD-24 | ST (restart) | after a restart the same Fishball session's next request holds the persona once, with the rule line |

The baseline is `git show rebuild/assistant:src/persona.js`, imported from a `data:` URL (no file is written). R-B2's cases are skipped, with the reason, when that ref is not in the clone. When the live branch has taken the rule in, "the added line" is already part of the baseline and the cases expect no difference at all. `FBTEST_PLUGIN_DIR` points both the data import and the booted host at another checkout, so a baseline run of the file shows the cases that need the rule failing.

Checked by changing a copy of the persona (eight mutants, run through `FBTEST_PLUGIN_DIR`, not committed): no rule; rule in the middle; blank line before it; the two forms swapped; an earlier line edited; trailing line break; two rule lines; ASCII colon in the example. Every mutant fails at least one of PBD-01..20.

### [persona-bold-render.test.mjs](persona-bold-render.test.mjs): R-B4, DSH's own parser (PBR-nn; 30 tests for each installed version in `DSH_MARKDOWN.versions`: 0.2.1-rc.3 and 0.2.1-rc.2)

[support/dsh-markdown.mjs](support/dsh-markdown.mjs) cuts the chat's markdown parser verbatim out of the installed web frontend bundle (`dsh-web-frontend/dist/assets/index-*.js`: micromark `fromMarkdown` with the gfm extension, DSH's own `cjkFriendlyAttention` rule and the math extensions) and imports it with the bundle's vendor chunk. It is not another markdown library. Not DSH's code: a stub `document` while the vendor chunk loads, and a stub for the one image-file-type helper of the post-processing step (it only rewrites a paragraph that is a single local image path). The mdast to React step is not run: a `strong` node is what the chat shows in bold. A version that is not installed, or whose bundle has another shape, skips its cases with the reason.

| id | technique | expected result |
|---|---|---|
| PBR-01 | EP (the reported bug) | `**还在进行中：**dsh`: no `strong` node, the `**` stay in plain text |
| PBR-02 | EP (the rule's form) | `**还在进行中**：dsh`: `strong` "还在进行中", plain text "：dsh", no asterisk |
| PBR-03 ×9 | DT (form × what follows the mark: letter, capital, digit, accented letter, Cyrillic letter, Chinese character, space, end of line, ASCII mark) | rule's form: bold in every row. The forbidden form: asterisks shown after a letter or digit (five rows), closed by the renderer after the other four |
| PBR-04 ×15 | EP (each Chinese mark: `，。！？；：、）」”…—（【》`) | rule's form bold; the forbidden form followed by a letter shows its asterisks |
| PBR-05 ×3 | EP (in context) | a mark mid-line; two bold runs in one line; two list items: every bold run found, no asterisk left in plain text |
| PBR-06 | EP (the persona's own text) | the two example forms cut from the persona's rule line behave as PBR-01/02 |

### Ambiguities and findings (persona rule)

- **A173. "First part of the system prompt".** The persona is not at the very start of Fishball's system prompt: DSH puts its own line `You are an AI agent powered by DeepSeek Harness.` first (the persona starts at character 51), and the persona is followed by blank-line separated sections (web search notes and so on). PBD-22 therefore checks that the whole persona occurs once and that the rule line is where it ends, not that it starts at index 0.
- **A174. Wording.** The requirement fixes the examples (`**还在进行中**：` to write, `**还在进行中：**` not to) and the sense ("in bold text, put Chinese punctuation outside the `**` markers"), not the exact sentence. PBD-03/04 check the words "bold", "Chinese punctuation", "outside", `**`, and the order "write … not …"; a rewording that drops one of them fails there on purpose and is a one-line change to `PERSONA_BOLD.terms` / `before`.
- **A175. The persona has no list marker requirement.** The new line begins `- ` like its neighbours, but the requirement does not ask for it, so no case checks it.
- **A176. What the renderer does (finding, PBR-03/04).** The asterisks stay visible when a letter or digit of any script follows the closing marker (Latin, capital, digit, accented, Cyrillic); a Chinese character, a space, the end of the line or an ASCII mark after it closes the bold text. All 15 Chinese marks tried (`，。！？；：、）」”…—（【》`) behave alike. The rule is therefore needed only before a letter or digit, but it is safe in every position. The same happens with an ASCII mark (`**still going:**dsh`, `**还在进行中:**dsh` keep their asterisks): the persona rule covers Chinese punctuation only, as the requirement says.
