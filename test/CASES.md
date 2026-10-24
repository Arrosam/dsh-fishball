# Fishball P2 black-box test catalogue

Run everything with `/opt/homebrew/bin/node test/run.mjs` (node:test, exits non-zero on failure).

## How the suite works

- Each test file boots the real installed DSH Web 0.2.1-rc.2 runtime in a child process ([support/worker.mjs](support/worker.mjs)), on a throwaway `DSH_HOME` under `.runtime/test-homes/`. stdin stays open, because DSH's launcher shuts down on stdin EOF. `run.mjs` deletes the test homes left by earlier runs.
- The profile is initialized from the shipped `web` template. It links two bundles: the repo root as `dsh-fishball`, and the fixture bundle [fbtest-tools](support/fixtures/fbtest-tools/index.js). The fixture bundle registers global tools under the hidden names, the shell names, `demo_echo` and a `bsk_inspect` with `output` and a `videoAction` enum containing `save`. It also records `agent/created` and `agent/disposed`.
- The model is a scripted fake adapter ([fake-llm.mjs](support/fixtures/fake-llm.mjs)) with no network. It records every conversation request (system text and tools) and answers `ok` when nothing is queued. Session-title calls are answered separately.
- An overlay patch adds the fake model, sets it as the default, and adds a test preset `fbtest-bare`, whose only row is time-context. Its sessions therefore see exactly the global tools, so they are the "ordinary session" used for comparison.
- Every system test talks HTTP to the real `/api/fishball/*` routes with the browser cookie minted from the printed `dsh web:` token. The tests inspect the host only through public DSH services (sessionPersistence, workspaceRegistry, agents, sessionController, settings, sandboxPolicy, approval, agentPresets, pluginManager), never through the implementation.
- No test reads the implementation (`index.js`, `src/**`, `client.js`).

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

## Environment limits

- The harness runs inside a macOS sandbox, so real shell writes cannot be exercised. Shell tests use fixture tools named `bash`, `pwsh`, `terminal_open` and `terminal_send`, and assert the plugin's refusals and pass-through only.
- Approval prompts are never answered. The tests count `approval/asked` events only.