# W0 core predicted use cases

Requirements-only test design. Canonical source: [extension points](<../plugins/instance-extension-points.md>) final design `479df59` (including §12.5.1/§12.5.2) §0 U14–U19, §1 rules, X2/X10, §2.1, §3, §5.4/§5.5 and §12. U18 now specifies durable dedupe, typed stub refusals, watchdog-off send pass-through and ordered inbox arrays. Samuel is the primary human actor; Fishball helps him carry out the goals below. Existing API-level IDs are flow groups beneath these stories, not independent human goals. Fixture state is W0 evidence only, never proof of what Samuel sees in a browser or a real model request. Predicted later journeys remain explicitly deferred.

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

**Human outcome:** Fishball can use the registered capability and react to a waking notice, or carry a quiet update into Samuel's next turn. Samuel should not get duplicate notice-driven work, lose healthy capabilities because one callback fails, or have a quiet notice start its own turn. Actual model use and rendered chat are not established by fake agent scopes/queues. The real next-request journey remains X-E2E TODO; same-home child-row restart/durable-file dedupe is now executable, not an obsolete deferred requirement.

| Story step | Existing test IDs | Evidence / owner |
| --- | --- | --- |
| 1. Samuel opens or resumes the conversation with plugin capabilities available. | XC-UC-01-M, XC-UC-01-A1 | Executable scope create/resume, X0-C; resume is a fixture trigger, not process restart. |
| 2. A plugin joins while Fishball is live or busy; another plugin fails. | XC-UC-01-A2, XC-UC-01-A3, XC-UC-01-E1 | Executable scope/log guarantees, X0-C; real next-request add/remove is XC-UC-01-A4 TODO, X-E2E. |
| 3. Fishball receives one waking update while idle or busy. | XC-UC-02-M, XC-UC-02-A2, XC-UC-02-A3 | Executable queued text/source/count, X0-C; no rendered chat or scheduling-loop claim. |
| 4. Samuel continues later after a quiet update, or the sender retries. | XC-UC-02-A1, XC-UC-02-E1 | Executable held-next-turn / in-process dedupe, X0-C. |
| 5. After child-row restart, the same update must not wake Fishball twice. | XC-UC-02-E2 | Executable X0-C same-home rebuilt service + persisted key + retained fixture session log; not a real-loader/process/UI claim. |
| 6. With the helper disabled, Fishball sends directly without changing the connector payload. | XC-UC-03-M1, XC-UC-03-M2, XC-UC-03-A1 family | Executable tool and images-service connector-boundary cases under §12.5.1; no attachment-store fixture is required for the empty-list oracle. |
| 7. Several inbox notices arrive together. | XC-UC-04-M | Executable local chat queue/receipt contract §12.5.2; per-original-item wire ack integration belongs to X0-I/FN-6. |

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
**Trace:** X0-C / X10, canonical §1 X10 and §12.5; persisted-key restart and bounded newest-key retention are executable fixture integration.
**Preconditions:** public service and live manager Session; plugin supplies pluginId, dedupeKey, text and wake; fresh key unless the exception says otherwise.

| Flow/test ID | Steps and expected results | Postconditions / ownership |
| --- | --- | --- |
| XC-UC-02-M | Send notice with `wake:true`. Observe queued response and one followup containing notice text and `{kind:'fishball-notice',form:'plugin',pluginId}` source. | Exactly one plugin-sourced turn queued. Executable X0-C. |
| XC-UC-02-A1 | Send with `wake:false`; observe held response and zero turns. Submit next user turn through chat. Inspect queued messages. | Held text joins next turn, never starts its own. Executable X0-C. |
| XC-UC-02-A2 | Establish idle manager, send waking fresh-key notice, inspect response, text and followup count. | Queued once while idle. Independent executable X0-C. |
| XC-UC-02-A3 | Establish running manager, send waking fresh-key notice, inspect response, text and followup count. | Queued once while busy. Independent executable X0-C, not a real scheduling-loop proof. |
| XC-UC-02-E1 | Send fresh key and observe queued. Retry same key with different text. Observe duplicate response, one total followup and no retry text. | No second turn in the same process. Executable X0-C. |
| XC-UC-02-E2 | Send a waking fresh-key notice; observe one queued turn and the key in the documented child-home JSONL. Close the child rows, boot a new service on the same home with retained fixture DSH log, retry the key. | Duplicate response and no new turn; child rows/service are rebuilt, retained user history remains. Executable X0-C disk/reboot seam, not separate-process real-loader/model proof. |

All executable notice flows have secondary DT rules (wake × duplicate × manager state). They have one primary counting category, UC; no original body is copied to inflate coverage.

### Flow group XC-UC-03 — send directly while the helper is off (U18/X19)

**Supporting actor / boundary:** Fishball's existing session tools and image send path. **Goal:** Samuel's work continues under Fishball directly when watchdog is disabled; the existing connector payload is not rewritten.

| Flow/test ID | Steps and expected result | Ownership |
| --- | --- | --- |
| XC-UC-03-M1 | Boot child with watchdog disabled; call `message_session` for a session with no watchdog brief using Unicode message text; observe exactly `session.message` and unchanged session/message payload. | Executable X0-C tool-path integration. |
| XC-UC-03-M2 | Same disabled condition; independently call `redirect_session`; observe exactly `session.redirect` and unchanged payload. | Executable X0-C tool-path integration, not a duplicate M1 body. |
| XC-UC-03-A1 family | With watchdog absent/disabled and a connected managed target, call `fishballImages.message({sessionId, message, attachments:[]})` using leading/trailing whitespace and a newline. Repeat with omitted attachments and the specified delivered/unconfirmed response partitions. | Executable X0-C images-path connector-boundary contract. Exactly one `session.message`, exact `{sessionId,message,attachments:[]}` payload and exact response; no upload, synthesized watch, or retry. Final case suffixes/IDs are recorded by the test writer in the main inventory. |

### Flow group XC-UC-04 — receive an ordered inbox batch (U18, §12.5.2)

**Goal:** Fishball receives one coherent queued message for several arriving notices, preserving the sender framing already supplied by each caller. Queue success is not a completed model turn. No original wire item is acknowledged early by the later inbox/batcher integration.

| Flow/test ID | Steps and expected result | Ownership |
| --- | --- | --- |
| XC-UC-04-M | Call `fishballChat.deliverInbox(items, options?)` with a text-only array whose texts already contain sender framing. Observe exactly one user-role followup with `items.map(item => item.text).join('\n\n')`, one text block, preserved order/characters, and a nonempty queued message id equal to receipt `{messageId}`. | Executable X0-C local chat queue/receipt boundary, not a model-completion or wire-ack test. The service never trims, re-frames or interpolates optional metadata into text. |

**Alternatives and refusals in this flow group:** the authoritative contract now supplies the executable EP/BVA oracle; the test writer/main inventory owns the final individual IDs rather than this story inventing suffixes.

- Omitted versus empty `images`, singleton versus one-item array, mixed multi-item source mapping, duplicate texts preserved, and no caller array/object mutation. A one-item session array uses relay source mapping; multi-item batches use `fishball-notice`/`notice`, with per-sender attribution only inside caller text.
- Item counts 0/1/19/20/21: empty array rejects asynchronously with `ChatApiError/invalid-input`; 21 rejects `ChatApiError/too-large`. No rejected validation queues a followup or fetches an image.
- Joined UTF-8 bytes 65,535/65,536/65,537, including separator bytes and multibyte text: first two accepted, last rejects `ChatApiError/too-large`. No truncation, split or sort. Whole-array shape validation precedes count, then joined-byte validation; an invalid middle item never causes partial queueing.
- Non-record items, missing/empty/non-string text, invalid supplied typed metadata/options reject `ChatApiError/invalid-input`. Local optional fields do not relax the seven required connector wire fields. No extra serialized-object or array-wide image cap is invented.
- Images are appended in item order then image order. `skipImages:true` queues text without fetch/model checks but still validates metadata. Supplied non-array image lists reject `ChatApiError/invalid-input`; malformed descriptors or missing required fetch source reject `ContractError/invalid-envelope`; per-item count >20, pixels >4,194,304, or bytes >4,194,304 reject `ContractError/too-large`. Image failures queue no partial message and retain the specified existing error codes.

**Ack ownership:** the local promise fulfills only after successful queueing and returns `{messageId}`, never `{acked:true}`. X0-I/FN-6 may ack each original wire item only after this shared promise fulfills; rejection means none is acked by that attempt. They do not wait for a model reply. Those per-item wire acknowledgements remain later-owner integration, not W0 chat receipt evidence.

### U18 non-UC acceptance accompanying Samuel's story

- `XC-EP-STUB-01`…`15`: each surviving unimplemented method throws/rejects `ExtensionError` with `code='not-implemented'` and the exact `<area.member>`; no success value. `XC-EP-STUB-16` checks bridge refusal without inventing an undeclared member-name spelling. Withdrawn APIs are not revived.
- `XC-DT-01`: injected queue failure proves the dedupe key is observable on disk **before** queue acceptance; retry is duplicate. No invented queue-error envelope.
- `XC-BVA-KEYS-9999/10000/10001`: newest 10000 keys retained; file and reloaded duplicate behavior agree; an evicted old key may notify again. These are retention boundaries, not new UC flows.

## Inventory and migration

Counts are top-level test cases, not assertions, parameter values, flow-group definitions or runtime passes. Generated partitions remain independent cases; primary technique counts are mutually exclusive. **See the [main test-design document](<instance-ext-w0.md>) for final executable/TODO counts and the completed case-ID ledger** after the core writer applies §12.5.1/§12.5.2. This document deliberately does not retain the stale pre-contract count table or predict the writer's new image/batch suffixes.

Story definitions remain two human scenarios (K1/X0-C), with K1-UC-01 and XC-UC-01/02/03/04 beneath them. [Skeleton use cases](<instance-ext-w0-skeleton-use-cases.md>) separately maps the three skeleton stories and reached-layer approval continuations. No rendered UI/model-completion pass is inferred from either fixture inventory.

**ID migration:** existing K1 aliases stay: K1-EP-03 → K1-UC-01-E1; K1-ST-01 → K1-UC-01-M + independent A1; K1-UC-01-E2 remains legacy actual attachment. Existing XC-DT-01/02/03/04 aliases → XC-UC-01-M/A1/A2/E1 and XC-EP-V-07 → XC-UC-01-A3 remain. Existing XC-DT-05/06/07 → XC-UC-02-M/A1/E1 and XC-DT-08 → independent A2/A3 remain. XC-UC-02-E2 keeps its ID but is now executable durable reboot proof. XC-EP-V-06/XC-EP-03 (X3 namespace cases) retire from X0-C; PG-1 owns prefix registration tests. New existing acceptance IDs remain XC-EP-STUB-01…16, XC-DT-01 (U18 queue-order contract; prior title alias historical), XC-BVA-KEYS-9999/10000/10001 and XC-UC-03-M1/M2. **XC-UC-03-A1 (image family) and XC-UC-04-M (array main flow) move from awaiting-contract TODO to executable contracts under `479df59`;** the main ledger records their concrete suffixes and bounded-item/byte/error cases. XC-UC-01-A4 remains the real-model next-request TODO owned by X-E2E. No obsolete durable-dedupe or pending-contract TODO remains.

## Explicit exclusions and verification boundary

U14–U19 and §12.5.1/§12.5.2 are authoritative requirements, not open questions. X3 has no X0-C member/validation contract; PG-1 owns registration-prefix behavior. The images callable method, exact connector oracle, inbox shape/receipt/refusals/bounds and ack ownership are now specified; neither image nor array story is blocked on design. The real-model next-request proof remains TODO X-E2E; XC-UC-04-A1 additionally names X0-I/FN-6 image integration for successful image fetch/order and preparation-failure no-partial delivery, because this W0 fixture has no valid image-capable model/transport. All text-only/skipImages contract tests are executable, with no pending callable-interface question. Skeleton/approval stories separately define K2/PANELS and B2/B5/B10/B11 later-owner journeys without claiming W0 UI coverage. No product, code, shared harness or parent main-document edit in this follow-up. Parent core writer owns executable cases/IDs and parent owns final counts/runs. Syntax/whitespace checks are not product/runtime passes.
