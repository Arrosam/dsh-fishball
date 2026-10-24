# Fishball P2 + P3 + P4 + P5 + P6 black-box test catalogue

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

## Environment limits

- The harness runs inside a macOS sandbox, so real shell writes cannot be exercised. Shell tests use fixture tools named `bash`, `pwsh`, `terminal_open` and `terminal_send`, and assert the plugin's refusals and pass-through only.
- P2: approval prompts are never answered, and the tests count `approval/asked` events only. P3 answers Fishball's own prompts with a scripted host-level answerer (above); DSH's browser prompt itself is not driven.
- add_plugin installs offline: a local directory through pnpm in the throwaway profile (`/opt/homebrew/bin/pnpm` on PATH). No registry or network spec is tested.

- **A51. start_session without `folder`.** M7 says "missing or empty folder → no-folder". The tool schema marks `folder` required, so DSH rejects the call before the tool runs ("invalid arguments: missing required property folder", a tool error). OUT-07 accepts either; an empty string gives `no-folder`.
- **A52. A folder that is neither a workspace id nor an absolute path.** Observed `not-absolute`. Whether an unknown workspace id should be `no-folder` instead is not specified; OUT-07 accepts both.
- **A53. Extra arguments to message_fishball.** A call with `senderSessionId`/`sessionId`/`session_id` next to `message` is accepted and attributed to the caller (MSG-05). Whether such calls should be refused is not specified.
- **A54. Not driven black-box: `unconfirmed`.** The `{ok:true, unconfirmed:true}` outcome and outbox status `unconfirmed` need a session flush that fails after delivery. Nothing public produces that. OUT-08 only allows the status.
- **A55. Not driven black-box: delivery retries and `failed` items.** "Three failed deliveries → `failed` with `delivery-failed`", "retried each time Fishball goes idle", a start_session whose session cannot be created at all (answers `delivery-failed`, not recorded), and caps counting "failed after the session was created" all need a fault inside steer, flush or create. The fixtures cannot inject one. message_session's `delivery-failed` is driven by a target whose recorded preset no longer exists (OUT-04); start_session's is not.
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
- **A66. Runs while the implementation changes.** One full run made while the working tree was being edited gave 7 failures in the older lifecycle and context files (boots that never became ready). Rerun alone, those files passed 120/120, and the next full run passed 486/486.
