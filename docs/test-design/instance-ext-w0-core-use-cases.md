# W0 core predicted use cases

Requirements-only test design. Canonical source: [extension points](<../plugins/instance-extension-points.md>) §1 rules, X2/X10, §2.1, §3 and §5. Samuel is the primary human actor; Fishball helps him carry out the goals below. Existing API-level IDs are flow groups beneath these stories, not twelve independent human goals. Fixture state is W0 evidence only, never proof of what Samuel sees in a browser or a real model request. Predicted later journeys remain explicitly deferred.

## Story 1 — Samuel returns to Fishball without stale unread alerts (K1)

**Everyday context / trigger:** Samuel leaves Fishball working while he handles other work, then returns after notices arrive or the child reconnects. He wants to know whether current work needs attention, not chase an alert left behind by an old connection.

**Human outcome:** Samuel should see the current unread/important indication; an attachment that has gone away must never leave a stale alert. W0 proves the connector state supplying that indication, not the rendered badge, frame or browser reconnection experience. Later fold/page integration owns that visible proof; no new executable UI case is claimed here.

| Story step | Existing test IDs | Evidence / owner |
| --- | --- | --- |
| 1. Notices arrive while Samuel is away; the current report changes the attention state. | K1-UC-01-M | Executable H-STUB state, K1; badge rendering deferred to later fold/page integration. |
| 2. He reconnects after explicit detach, or loses the connection unexpectedly. | K1-UC-01-M, K1-UC-01-A1 | Executable reset/re-report state, K1; never retain stale unread state. |
| 3. A bad report arrives, or Samuel still uses an older child. | K1-UC-01-E1, K1-UC-01-E2 | Executable error recovery / legacy ordinary exchange, K1; no UI proof. |

### Flow group K1-UC-01 — keep the connector's unread indication current

**Supporting actor / boundary:** child reports attention on Samuel’s behalf; connector state is observed.
**Goal:** current unread/important indication, never a stale indication from a disconnected child.
**Trace:** K1, canonical §3, X8 (report sender integration), K1 (legacy actual attachment).
**Preconditions:** connector contract 1.2 host running in a throwaway home; child attached; no report means `{count:0, important:false}`; attention advertised as optional.

| Flow/test ID | Steps and expected results | Postconditions / ownership |
| --- | --- | --- |
| K1-UC-01-M | Child reports `{3,1,t}`; host accepts and exposes `{3,true}`. Child reports `{5,0,t2}`; state becomes `{5,false}`. Child explicitly detaches; state clears to `{0,false}`. Child reconnects; state stays zero until it reports `{7,2,t3}`; host then exposes `{7,true}`. | Only current attachment reports determine state. Executable H-STUB integration flow, K1. Secondary technique ST. |
| K1-UC-01-A1 | With attached child, report `{3,1,t}` and observe `{3,true}`. Transport disconnects instead of explicit detach; read the still-running host state. | State is `{0,false}`. Independent H-STUB alternative, K1. Secondary ST. |
| K1-UC-01-E1 | Host and child handshake. Child sends malformed attention (`unread=10000`); host returns an error. Child corrects to valid `{3,1,t}` on the same connection. | Valid request is accepted; malformed traffic did not destroy connection usability. Executable host/wire exception, K1; secondary invalid EP. Validator EP/BVA cases retain detailed malformed partitions. |
| K1-UC-01-E2 | Start a real contract-1.1 child which does not require or send attention. Attach to 1.2 host, negotiate common minor 1, and issue ordinary `session.list` with `{limit:0}` (contract §5 operation table). Expect a response with `{sessions:[]}`; handshake is not repeated. | Attachment and ordinary exchange succeed without attention; no attention capability is made mandatory. Executable H-STUB flow, owner K1. Existing K1-DT-01 separately checks negotiated common minor; this flow proves actual legacy attachment. |

**Exceptions outside these flows:** invalid payload field/type/range combinations are separately specified by existing K1 EP/BVA cases; no undocumented internal host callback is required. The main flow and transport-close alternative have separate tests rather than combining unrelated exits in one scenario.

## Story 2 — Samuel keeps working with Fishball as plugins join and send updates (X0-C)

**Everyday context / trigger:** Samuel opens his ongoing Fishball conversation to continue work. A plugin supplies capabilities for that work; a watchdog update arrives while he is talking or away. He wants Fishball to have the capability and receive the update once, without a faulty plugin derailing his conversation.

**Human outcome:** Fishball can use the registered capability and react to a waking notice, or carry a quiet update into Samuel's next turn. Samuel should not get duplicate notice-driven work, lose healthy capabilities because one callback fails, or have a quiet notice start its own turn. Actual model use and rendered chat are not established by fake agent scopes/queues; the real next-request and restart journeys remain X-E2E TODOs.

| Story step | Existing test IDs | Evidence / owner |
| --- | --- | --- |
| 1. Samuel opens or resumes the conversation with plugin capabilities available. | XC-UC-01-M, XC-UC-01-A1 | Executable scope create/resume, X0-C; resume is a fixture trigger, not process restart. |
| 2. A plugin joins while Fishball is live or busy; another plugin fails. | XC-UC-01-A2, XC-UC-01-A3, XC-UC-01-E1 | Executable scope/log guarantees, X0-C; real next-request add/remove is XC-UC-01-A4 TODO, X-E2E. |
| 3. Fishball receives one waking update while idle or busy. | XC-UC-02-M, XC-UC-02-A2, XC-UC-02-A3 | Executable queued text/source/count, X0-C; no rendered chat or scheduling-loop claim. |
| 4. Samuel continues later after a quiet update, or the sender retries. | XC-UC-02-A1, XC-UC-02-E1 | Executable held-next-turn / in-process dedupe, X0-C. |
| 5. After child restart, the same update must not wake Fishball twice. | XC-UC-02-E2 | TODO X-E2E; durable restart proof, not supplied by fixture queue. |

### Flow group XC-UC-01 — make a plugin available in Fishball's manager scope

**Supporting actor / boundary:** plugin registering a manager tool/section via public `fishballInstance.manager`.
**Goal:** the manager has the plugin's agent-scoped capability at the correct lifecycle point without a failing plugin breaking another.
**Trace:** X0-C / X2, canonical §1 registration/error rules and §2.1; X-E2E for a real next-model-request proof.
**Preconditions:** child rows booted with existing `bootChild`; service available; plugin id is its npm name; no product internals inspected to derive outcomes.

| Flow/test ID | Steps and expected results | Postconditions / ownership |
| --- | --- | --- |
| XC-UC-01-M | Before manager activation, plugin registers a tool and section; a second plugin registers a section. Activate manager via chat. Observe tool and both sections, with registration order after persona. | Created scope contains both registrations in order. Executable X0-C, secondary DT create rule. |
| XC-UC-01-A1 | Register before activation; activate and establish manager Session. Remove the fake live handle (fixture resume trigger), then request chat again. Observe second agent context and registered tool there. | Resume reapplies registration. Executable X0-C, secondary DT resume rule. No process-restart persistence claim. |
| XC-UC-01-A2 | Start with live manager and no late tool. Plugin registers a tool and section. Inspect that same live agent context immediately. | Tool/section are installed without recreating manager. Executable X0-C, secondary DT live rule. |
| XC-UC-01-A3 | Start live manager, mark fake manager running, register midturn tool, inspect live scope. | Tool is visible immediately in running scope. Executable X0-C; this is not a model-request assertion. |
| XC-UC-01-E1 | Register callback which throws, then a healthy plugin tool. Activate manager; healthy tool is present and failure logged once. Trigger resume and inspect warning count again. | Failure skipped, healthy registration proceeds, same plugin/point warning not repeated. Executable X0-C, secondary DT exception rule. |
| XC-UC-01-A4 | In real child/model loop register a tool/section from a running turn. Capture next model request; tool/section are offered. Dispose registration and capture following request. | Disposed tool/section absent; manager continues. Fully defined `test.todo`, owner X-E2E, X2/SP-X1. |

**Other alternatives:** disable/dispose/re-register is still independently exercised by XC-ST-01; repeated dispose by XC-EP-V-02. These remain ST/EP, not duplicated UC tests. Callback exception does not define a new recovery policy beyond log-once and skip.

### Flow group XC-UC-02 — deliver one plugin notice to Fishball

**Supporting actor / boundary:** watchdog/plugin with a notice for the manager.
**Goal:** wake immediately or hold until next turn, without duplicate turns for the same durable key.
**Trace:** X0-C / X10, canonical §1 X10; X-E2E for child-restart durable dedupe.
**Preconditions:** public service and live manager Session; plugin supplies pluginId, dedupeKey, text and wake; fresh key unless the exception says otherwise.

| Flow/test ID | Steps and expected results | Postconditions / ownership |
| --- | --- | --- |
| XC-UC-02-M | Send notice with `wake:true`. Observe queued response and one followup containing notice text and `{kind:'fishball-notice',form:'plugin',pluginId}` source. | Exactly one plugin-sourced turn queued. Executable X0-C. |
| XC-UC-02-A1 | Send with `wake:false`; observe held response and zero turns. Submit next user turn through chat. Inspect queued messages. | Held text joins next turn, never starts its own. Executable X0-C. |
| XC-UC-02-A2 | Establish idle manager, send waking fresh-key notice, inspect response, text and followup count. | Queued once while idle. Independent executable X0-C. |
| XC-UC-02-A3 | Establish running manager, send waking fresh-key notice, inspect response, text and followup count. | Queued once while busy. Independent executable X0-C, not a real scheduling-loop proof. |
| XC-UC-02-E1 | Send fresh key and observe queued. Retry same key with different text. Observe duplicate response, one total followup and no retry text. | No second turn in the same process. Executable X0-C. |
| XC-UC-02-E2 | In real child send a fresh-key waking notice; observe queued turn. Stop and restart same child home, reload plugin, retry identical key. Observe duplicate response and no additional notice turn. | Dedupe survives process restart. Fully defined `test.todo`, owner X-E2E / X10. Fake-session harness is not durable-log evidence. |

All executable notice flows have secondary DT rules (wake × duplicate × manager state). They have one primary counting category, UC; no original body is copied to inflate coverage.

## Inventory and migration

Counts are top-level test cases, not assertion count, parameter values, definitions, or passes. The generated idle/running loop creates two independent cases. `test.todo` is not executable. Five primary categories are mutually exclusive; secondary technique links above preserve traceability without double counting.

| Owned task | EP | BVA | DT | ST | UC executable | Executable total | UC todo |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| K1 | 7 | 3 | 1 | 0 | 4 | 15 | 0 |
| X0-C | 7 | 2 | 0 | 1 | 10 | 20 | 2 |
| Owned total | 14 | 5 | 1 | 1 | 14 | 35 | 2 |

**Story definitions:** 2 human scenarios covering K1 and X0-C. **Existing flow-group definitions:** 3 (IDs retained). Across both owned UC documents: **5 stories + 12 flow groups**, **42 UC flows = 29 executable + 13 TODO**. **Defined UC flows:** 16 = 14 executable + 2 todo. Original owned executable count was 32 (K1 13 + XC 19); now 35, because legacy actual attachment is added and explicit detach versus transport-close and idle versus busy each get separate tests. No deleted acceptance requirement or duplicate executable body.

**ID migration:** K1-EP-03 → K1-UC-01-E1; K1-ST-01 → K1-UC-01-M plus independent K1-UC-01-A1. XC-DT-01/02/03/04 → XC-UC-01-M/A1/A2/E1; XC-EP-V-07 → XC-UC-01-A3. XC-DT-05/06/07 → XC-UC-02-M/A1/E1; XC-DT-08 → independent XC-UC-02-A2/A3. New executable ID: K1-UC-01-E2. New todo IDs: XC-UC-01-A4, XC-UC-02-E2. These are the added test-title IDs; reclassified IDs are not extra case counts.

## Explicit exclusions and verification boundary

No changes to window-sum, X3 validation seam, prune-age naming, or remaining core acceptance gaps. Existing X3 cases are untouched. No shared harness, product, or main design document edits. Skeleton UC documentation and test titles are updated only within the separate authorized files. The prior main document's UC N/A/count rows are superseded for these owned files by this inventory; parent updates its combined inventory. Todo definitions are predictions from requirements, not feature acceptance or deferred definition. Syntax checks do not execute product; no runtime pass claim is made here.
