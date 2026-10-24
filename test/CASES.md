# Fishball P2 + P3 black-box test catalogue

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
| HTP-01 | EP | GET state shape | 200 application/json; exactly the keys status, sessionId, workspaceId, cwd, error, limits (12 integers), hiddenTools |
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
| CFG-01 | EP | defaults | the settings entry `fishball` applies live; its value and `state.limits` equal the default table |
| CFG-02 ×12 | BVA (minimum valid) | 1, or 0 for the three hourly caps | update ok; `state.limits` shows the value; the profile `cordis.patch.yml` row config holds it |
| CFG-03 ×12 | BVA (minimum − 1) | 0 for "≥ 1" fields, −1 for hourly caps | update throws; patch file byte-identical; live limits and settings value unchanged |
| CFG-04 ×9 | EP (negative) | −1 for "≥ 1" fields | rejected; nothing changes |
| CFG-05 ×12 | EP (non-integer) | 1.5, or 0.5 for hourly caps | rejected; nothing changes |
| CFG-06 ×12 | EP (string) | "5" or "x" | rejected; nothing changes |
| CFG-07 | BVA (large) | no upper bound | 1,000,000 accepted |
| CFG-08 | EP | the defaults again | accepted together |
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
| CAT-01 | EP (Fishball / ordinary session) | the three plugin tools exist only for Fishball | listed in every Fishball request; absent from an ordinary request and from the global tool list |
| CAT-02 | EP | list_plugins shape | exact keys `{plugins, allowedTools, otherTools}`; each plugin has exactly the 8 fields with the documented enums and types; unique keys; tool and allowance entries have exactly their keys |
| CAT-03 ×7 | DT (one row per built-in) | built-in keys and defaults | kind builtin; on for compaction, web, time and reminders; off for ask-user, skills and shell; changedBy null; lastError null |
| CAT-04 | EP (enabled in the profile) | fbtest-tools | kind profile, on, changedBy null |
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
| ADD-02 | DT (Allow once) | installed with its bundle off | dependency added; bundle not in dsh.profile.bundles; not in the global list or an ordinary request; listed fishball-only |
| ADD-03 | ST added→on (Allow) | follows R6/R8 | its code runs; its tool in Fishball's next request only |

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

## Environment limits

- The harness runs inside a macOS sandbox, so real shell writes cannot be exercised. Shell tests use fixture tools named `bash`, `pwsh`, `terminal_open` and `terminal_send`, and assert the plugin's refusals and pass-through only.
- P2: approval prompts are never answered, and the tests count `approval/asked` events only. P3 answers Fishball's own prompts with a scripted host-level answerer (above); DSH's browser prompt itself is not driven.
- add_plugin installs offline: a local directory through pnpm in the throwaway profile (`/opt/homebrew/bin/pnpm` on PATH). No registry or network spec is tested.