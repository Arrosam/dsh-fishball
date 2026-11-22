# F-WIRE manager acceptance (reminders, singleton, identity, model)

Authority: [.runtime/f-wire-interface.md](../../../../.runtime/f-wire-interface.md) (fixed 2026-11-16),
DESIGN.md §20, R-FB-02, R-FB-13, R-ID-10, R-OA-22 (`agent_id`), the V2 reminder rules core keeps
"unchanged" (docs/slim-native-design.md T10) and the session route X1a
(docs/plugins/instance-extension-points.md). Black box: core runs as an installed bundle in a real
standalone DSH ([world.mjs](world.mjs)); no connector, instance or hosted child. The scripted model
(test/support/fixtures/fake-llm.mjs) is DSH's default model and drives the manager's tool calls.

One scenario per SDK, two boots of one home under the repo's TEST_HOMES (os.tmpdir()):
**A** (first start) and **B** (next start, after a 12 s downtime).

| Row | Technique | Steps | Oracle |
| --- | --- | --- | --- |
| MGR-REM-EP-01 | EP (manager scope) | manager turn | the request's tools include schedule_create/list/update/delete |
| MGR-REM-EP-02 | EP (other scope) | `sessionController.create` + a turn | no core tool (reminders, ask_user, private_skill_*) |
| MGR-REM-EP-03 | EP | GET/POST `/api/reminders`, `/api/reminders/<id>`, `/fishball/embed/api/reminders` | 404 |
| MGR-REM-DT-01 ×6 | DT + BVA | schedule_create: after 3600; after 0; every 59; every 60; after+every; after 1 | accepted rows listed by schedule_list, refused rows never |
| MGR-REM-ST-01 | ST created→fired→ended | after_seconds 1 | its prompt reaches the manager as a user-role message; then not active |
| MGR-REM-ST-02 / 03 | ST | schedule_update title / schedule_delete | renamed in place / gone from the list |
| MGR-REM-ST-04 | ST across restart | list in B | the renamed reminder survives |
| MGR-REM-ST-05 | ST (downtime) | after_seconds 6 created at the end of A | delivered after B starts |
| MGR-REM-EP-04 | EP (R-FB-13) | guards report after the reminder tools ran, in A and B | `ok`, nothing overridden |
| MGR-SET-ST-01 | ST / concurrency | two concurrent POST + one POST `/api/fishball/session`, GET, `manager.sessionId()` | 200, one id everywhere |
| MGR-SET-ST-02 | ST across restart | POST then GET in B | the same id |
| MGR-SET-EP-01 | EP | `agentPresets.presetForSession` (0.2.2-rc.1 only) | effective preset `fishball` (recorded, else the default) |
| MGR-SET-EP-01b | EP | `agentPresets.defaultId` | `fishball` |
| MGR-SET-EP-02 | EP | manager request tools minus core's own | exactly read, read_image, working_directory, ask_user_question (the user, 2026-11-18: "用DSH自带的提问工具") |
| MGR-SET-EP-03 | EP | manager system prompt | has session_message, approval_answer; none of message_session, answer_approval, list_plugins, watch_session |
| WD-PERSONA-EP-01 / 01b | EP | core's contract `WATCHDOG`, `MCP.tools.sessionStart` | frozen; tools exactly `{sessionStart: watchdog_session_start, brief: watchdog_brief}`; `session_start` |
| WD-PERSONA-EP-02 | EP | `PERSONA_ROLE` | one sentence names watchdog_session_start, then session_start after "instead of", conditional on a DSH offering Watchdog |
| WD-PERSONA-EP-03 / 04 | EP | that line | "same arguments", "purpose", "approvable scope"; Watchdog supervises from the "first request" |
| WD-PERSONA-EP-05 | EP | `PERSONA_ROLE` | watchdog_brief named with "only … running … after the brief" |
| WD-PERSONA-EP-06 | EP (source of the names) | persona.js in a temp copy whose contract `WATCHDOG.tools` names are swapped | the swapped names appear, the real ones do not (no literals) |
| WD-PERSONA-DT-01 / 02 | DT (Watchdog offered / not) | `PERSONA_ROLE` | every Watchdog-tool line carries the condition; session_start guidance stays in Watchdog-free lines and nothing forbids session_start |
| WD-PERSONA-EP-07 | EP | session_start lines | placement (workspaceId as folder, verified ID or absolute path, workspaceError), model from models_list, hand-over still there |
| WD-PERSONA-ST-01 | ST (before → after) | persona of the parent of the commit that brought WATCHDOG into persona.js vs now | every earlier line kept in order; the only new line is the Watchdog one (skipped if the clone lacks that history) |
| WD-PERSONA-EP-08 / 09 | EP (style) | `PERSONA_ROLE` | one bold rule line, still last; no CR, no trailing newline; the Watchdog line has balanced `**` and no Chinese mark before a closing `**` |
| WD-PERSONA-SYS-01 | EP (system) | the manager's model request in boot A | carries the Watchdog line, both Watchdog tools and session_start |
| MGR-ID-EP-01 | BVA (first start) | profile/home `cordis.patch.yml` and DSH's settings document before vs after A's start | unchanged; no `identity.id` in the user layer |
| MGR-ID-EP-02 | EP | Connect POST with a fake loopback target + CIMD URL | approval URL `agent_id` matches `^fb-[a-z2-7]{16}$`; still not in settings |
| MGR-ID-ST-01 | ST across restart | Connect in B | the same id |
| MGR-ID-ST-02 / 03 | ST | set `identity.id` = `fbtest-owner-id-1` / unset it | that id / the generated id again |
| MGR-MOD-ST-01…06 | ST | unset → routable → unroutable → unset → routable → (restart) → unset | request model: default, b, default, default, b on activation, default |

## Todo rows (owners)
- MGR-SET-ST-03, **F-WIRE**: GET `/api/fishball/session` before any ensure on a fresh home (null or an id) is not specified.
- MGR-MOD-ST-07, **F-WIRE**: "an unroutable selection is logged once" names no logger or text.
- MGR-MOD-EP-01, **E2E-CORE**: the scripted route declares no reasoning effort, so `model.reasoningEffort` cannot be seen in a request.
- MGR-MOD-ST-08, **F-WIRE**: whether a live change of DSH's own default reaches a manager whose `model` is unset is not specified.

## Not observable from outside
- Where the generated id is stored (`fishball_core_main`, DESIGN §20): only "not in the settings document" and its use (`agent_id`) are checked.
- The R-FB-13 check itself on 0.2.1-rc.5 (no `presetForSession`): the tool list and the report are checked instead.

## Harness facts
- Reminder results are read from the tool-role message the next model request carries. A one-shot that fired is "ended" if it is gone or listed with a status other than a scheduled one's (DSH's list keeps ended records).
- Connect needs a target that passes the connector check, so [subject.mjs](subject.mjs) serves K1's RFC 9728/8414 metadata on loopback; nothing is ever authorized.

## MULTI-1 re-baseline
- MGR-ID rows: MULTI-0 withdrew `target.url` and `/api/fishball/connect{,/cancel}`. Boot A adds the
  Connect target through `ui.targets.add(url)` and Connect runs on `SEAM_TARGETS.route.connect` /
  `.cancel` with `{targetId}`; boot B uses the same target id (its record is durable, MULTI-1
  requirement 1). The `agent_id` oracle is unchanged.
- One manager, one reminder store with several targets: wire/ MULTI-SVC-ST-01.
