# D1–D3 superseded-case maintenance ledger

## Authority and scope

User decision, verbatim: “D1D2都做，D3改成instance单向点亮connector的提示灯，connector单向显示未读，点开后自动消除未读提示。instance只发送无状态提示，状态在connector处处理。”

Authority: [contract 1.2](<../connector-contract.md#L290-L323>) and [D3 signal/latch contract](<../connector-contract.md#L493-L517>), read together with the complete [superseded inventory](<v2-d1-d3-independent-inventory.md#L90-L114>) and [baseline delta](<v2-d1-d3-baseline-delta.md>). Only documentation, existing tests and test support were inspected by this author; no product implementation or SDK source was read. The test author made no commit; the coordinating agent owns the final local commit.

An unchanged ID below is a deliberate rewritten oracle, **not** a claim that a historical pass proves the new requirement. Deleted cases are explicitly identified. EP, BVA, Decision Table (DT), State Transition (ST), and Use Case (UC) are preserved where they were the original categories. The existing K2/XW `P` labels are retained as historical property-style checks rather than falsely relabelled as one of those five techniques.

## Executable-case mapping

| Existing case ID / variant | Old → new | Technique retained / reason |
|---|---|---|
| K2-V-01 | exact contract 1.1 → exact 1.2 | Existing P; published version changes, language compatibility checks remain. |
| K2-V-04 | peer 1.1 → minor 1 and peer 1.5 → cap 1 → cap 2 for 1.5; older peer remains minor 1 | Existing P; lower-common-minor rule unchanged. |
| XW-DT-01 | attention.set count/timestamp → attention.signal exact importance, exact accepted acknowledgment | DT, served-capability rule retained. |
| XW-DT-02 | absent old capability suppresses set → absent signal capability returns unsupported-operation and emits no request | DT, optionality retained; contract now specifies refusal. |
| XW-ST-01 | retain/replay value and unset disposer zero frame → signal, reconnect with no replay, service disposal with no clear frame | ST; instance has no retained unread state. Both original and replacement transport logs checked. |
| XW-P-02 | exclusive unread owner/owner-busy/unset disposer → **deleted** | Existing P retired; ownership/disposer behavior no longer exists. |
| XW-P-03 | old attention never required, built-in attaches to 1.1 → attention.signal optional; interaction.timerfree required; capable no-attention peer ready | Existing P; removes false version-only readiness inference. |
| XC-EP-STUB-04 | attention.set must be a typed not-implemented stub → **deleted** | EP retired with removed method. All other generated stub IDs retain their original numbering (05–15), and bridge remains 16. |
| APR-01 | descriptor deadline/countdown instruction → exact timerfree descriptor keys, explicit expiresAt absence, no within-N-seconds instruction | EP; provenance, argument text/status, notice count, expiry-after-explicit-end wording and unrelated fields preserved. |
| APR-08 / stored 2 seconds | timed fallback/timeout audit → raw retained setting, still listed and pending past old window, no stock prompt or timeout audit; explicit escalation preserves user outcome, closure notice and late refusal | BVA; former setting partition and crossed former boundary preserved, obsolete silence-driven terminal replaced. |
| APR-08 / stored 1 second | same old minimum timeout branch → same timerfree checks at former minimum | BVA; independent minimum partition retained. |
| APR-09 | unacknowledged notice starts timeout → unacknowledged notice stays pending beyond old window, explicit allow settles once | ST; unacknowledged → elapsed time → explicit answer sequence retained. |
| FLW-07 / stored 1 second | question withdrawn at minimum timeout → remains offered/open, no timed settled event, answer still accepted | BVA; former minimum crossed using existing real-time fixture convention. |
| FLW-07 / stored 3 seconds | question withdrawn at configured timeout → same pending/answerable oracle | BVA; second original setting partition retained. |
| FLW-08 | wait for timed withdrawal, then user answer → wait beyond former window without withdrawal, user answer wins, stale instance answer refused | ST; dependent timer prerequisite removed, original user-result coverage retained. |
| FLW-10 | offer at plus computed expiresAt → at retained, expiresAt absent | EP; complete questions/options/call/session assertions unchanged. |
| HLD-01 | editor sets 6 seconds and instance has until 6 → raw retained 6; native 1-second foreground wait still held and instance answers same turn | BVA; native-question timeout coverage unchanged, no active editor implied. |
| HLD-02 | native timeout 1 / connector timeout 2, then departure → both former window and native timeout pass without withdrawal; same-turn own-card result, no continued projection | BVA; held native wait remains meaningful. |
| HLD-03 | native timeout 2 / connector timeout 1, then departure → past both bounds still held/offered, same-turn own-card result | BVA; inverse ordering preserved. |
| HLD-04 | editor sets 8, answer within deadline → raw stored 8, native timeout -1 answer without connector deadline | EP; no-foreground-limit partition retained. |
| HLD-05 | editor reset to 120 → raw historical default reload; same-turn result/no pending/no late reply unchanged | EP; default native-timeout partition retained. |
| HLD-06 | active editor 6 and user wins while held → raw stored 6 and same user-first/late-answer refusal | ST; only setup modernized. |
| HLD-07 | timed move precedes Stop → no move beyond old window, then Stop closes own card/refuses late answer/no recorded answer | ST; Stop behavior preserved without impossible prerequisite. |
| DIR-06 | one-second silence prompts/rejects/audits timeout → no timed prompt/outcome/timeout audit; explicit escalation preserves user Reject, result hint and user decision row | BVA; retained former minimum and post-window observation, not a timer pass. |
| ASK-06 | one-second silence creates user card → no timed card/prompt/timeout audit, request remains live; explicit escalation then Reject retains exact note and user decision row | BVA; meaningful negative and terminal assertions retained. |
| ANS-08 | no card before deadline, card after → no timed card before or beyond former minimum; live offer/running/no timeout audit; explicit escalation then Allow once | BVA; before/after temporal observations retained without invented deadline. |
| DCD-06 | timed card and stock prompt → neither appears from silence; explicit escalation creates both, card Reject closes both and audit says escalate | BVA; original dual-surface clearing assertions preserved. |
| L63 | live setting 2/120 changes expiry → raw stored 120 → 2 → 120 reloads stay deadline-free, former 2-second crossing causes no prompt/timeout audit; explicit rejection works | ST; retired controls are not invoked. |
| L59 | all settings never restart → active settings still never reattach/close; L63's explicit raw-store reload is checked/reset as a fixture boundary | ST; pre-L63 assertion protects earlier active-limit regression, original end assertion protects later changes. |
| MOD-01 | fresh editor/snapshot default auto → **deleted** | EP retired: removed mode editor has no default-selection behavior to test. No schema-representation oracle invented. |
| MOD-02 | valid modes accepted by editor → **deleted** | EP retired: removed editor does not accept mode edits. Retention covered independently. |
| MOD-03 / unknown word | form rejects bogus mode → **deleted** | DT retired with mode control validation. |
| MOD-03 / wrong case | form rejects AUTO → **deleted** | DT retired with mode control validation. |
| MOD-03 / number | form rejects numeric mode → **deleted** | DT retired with mode control validation. |
| MOD-03 / empty string | form rejects empty mode → **deleted** | DT retired with mode control validation. |
| MOD-04 / instance answers | stored auto: formerly editor-set → raw auto, accepted answer/result unchanged | DT, instance-answer column preserved. |
| MOD-04 / user answers | editor-set auto → raw auto, own-card result unchanged | DT, user-answer column preserved. |
| MOD-04 / nobody answers | timed withdrawal → stays offered/open past former window | DT, silence column rewritten. |
| MOD-05 / instance answers | editor-set fishball → raw fishball, accepted answer/result unchanged | DT, instance-answer column preserved. |
| MOD-05 / user answers | editor-set fishball → raw fishball, own-card result unchanged | DT, user-answer column preserved. |
| MOD-05 / nobody answers | timed withdrawal → stays offered/open past former window | DT, silence column rewritten. |
| MOD-06 / instance answers | saved user causes mode-user refusal → saved user permits offer, note remains accepted, eligible answer accepted | DT; note assertion retained independently; removed switch cannot refuse answer. |
| MOD-06 / user answers | editor-set user → raw user, own-card result unchanged | DT, user-answer column preserved. |
| MOD-06 / nobody answers | only own card waits → offer and own card both remain live beyond former window | DT, silence column matches inert mode. |
| MOD-07 | mode survives restart and editor shows it → raw user survives restart without rewrite, eligible instance answer succeeds | ST; raw retention preserved; no editor claim. |
| MOD-08 | retired mode route 404 leaves active snapshot unchanged → same 404 plus raw stored config unchanged | EP; retired route regression retained, no active-mode snapshot required. |
| PLN-10 | user mode refuses approve, fishball accepts → raw user/fishball/auto all offer eligible plan; instance and source-user approvals both work | DT; saved-mode rules rewritten, source-user result assertions preserved. |
| XB-DT-01 | capability-ready event fixture contains deadline → same event omits deadline | DT; only negotiated fixture payload changes, handover/gate/no-stop/claims assertions untouched. |
| XS-DT-05 | first-card event fixture contains deadline → same fixture omits deadline | DT; start/brief/claim assertions untouched. |
| FN1-UC-LOAD-M | local stub only has attention.set → async signal acknowledgment stub | UC, load journey unchanged; fixture compatibility only, not signal/latch conformance proof. |

Additional active-limit catalog effects from shared support modernization (no unrelated assertion changes):

- [config cases](<../../test/config.test.mjs>): CFG-01 and CFG-08 exact default tables now cover 14 active fields, not 15. CFG-02 approvalAnswerSeconds min and CFG-03 min−1 validation are removed generated cases (BVA); CFG-04 negative, CFG-05 fraction and CFG-06 string validation for approvalAnswerSeconds are removed generated cases (EP). The retired load-only field is no longer an active limit. All other generated fields and bounds remain.
- [limit-form cases](<../../test/limits-config.test.mjs>): L1 and L2 still assert all active original defaults, now six rather than seven (EP); new/revision limits and unrelated L1b/L3–L8 assertions stay intact. Hidden-retention schema metadata versus absent keys is deliberately unspecified here; no key-absence assertion is substituted for UI testing.
- [X0-W](<../../test/instance-ext/x0-w.test.mjs>) keeps scoped-client XW-P-01 and XW-EP-01/02/03 unchanged; explicit capable fixture defaults restore those observations rather than weakening them.

## K1 TODO catalog mapping

All entries remain real `it.todo` inventory, **not passes**. Original `K1-MCP-*` IDs are kept so supersession is traceable. The wrapper comments now state V2 precedence. Historical MCP-S1/S2/S3 entries remain separate future-task inventory and must not be treated as current V2 requirements.

| Case ID | Old → new | Retained technique / reason |
|---|---|---|
| K1-MCP-UC-01-M | latest count/timestamp report journey → ordinary/important sticky latch, page-open clear, fresh ordinary, detach/reconnect no replay | UC; human return-to-Fishball goal retained. |
| K1-MCP-UC-01-E1 | invalid unread=10000 then valid report → malformed signal refuses unchanged, next valid signal works | UC; error recovery goal retained. |
| K1-MCP-EP-01 | zero/current timestamp count payloads → false/true importance with exact acknowledgment | EP; valid schema partitions. |
| K1-MCP-EP-02 | each count/time field missing → sole required important missing | EP; required-field invalid partition. |
| K1-MCP-EP-03 | wrong count/time primitive types → wrong important/payload primitive types | EP; no coercion invariant retained. |
| K1-MCP-EP-04 | generic extra report field → unread/importantUnread/latestAt/clear/extra independently refused | EP; strict keys and private producer-state rejection. |
| K1-MCP-EP-06 | removed expiry has no legacy exception → strict default legacy numeric expiry versus explicit timerfree absence | EP; legacy default validators remain valid by contract. |
| K1-MCP-BVA-01 | unread input −1/0/1 → observed 0/1/2 ordinary-signal saturation | BVA; producer count domain removed, connector 0/1 projection boundary retained. |
| K1-MCP-BVA-02 | unread maximum 9998/9999/10000 → zero/one/two signals after page-open reset | BVA; new bounded latch, no fictitious count cap. |
| K1-MCP-BVA-03 | important unread numeric bounds → **deleted** | BVA retired; numeric important-count domain no longer exists. |
| K1-MCP-BVA-04 | timestamp null/integer/fraction and fractional count → **deleted** | BVA retired; signal has neither numeric domain. |
| K1-MCP-DT-01 | both mixed-version directions refused and no minor negotiation → mutual semantic-marker rules, legacy control-only, built-in refuses old connector, independent optional attention | DT; explicit compatibility decision table. |
| K1-MCP-ST-01 | latest valid report replaces count/importance → importance sticky until page-open reset | ST; correct state owner/transition. |
| K1-MCP-ST-02 | HTTP/SSE close preserves report and logical reset → attached transport loss clears latch, reconnect no replay, stale-detach protection | ST; current contract transport lifecycle, not future MCP lifecycle. |
| K1-MCP-EP-07 | unread maximum 9999 export → exact acceptance response plus dot-free non-signal legacy traffic | EP; no old count maximum exists; unread inference forbidden. |
| K1-MCP-UC-02-M | actual MCP latest-report projection → actual connector signal/page-open journey with GUI wiring separately observed | UC; no service-only GUI pass claim. |
| K1-MCP-ST-03 | runtime logical-auth reset/report replay → runtime old-owner fencing, actual channel reset, stateless reconnect/dispose | ST; existing envelope attachment lifecycle retained. |
| K1-MCP-DT-03 | reject both mixed peer directions → legacy controls allowed, interactions feature-off/user fallback/no queued bypass; built-in old-connector upgrade/detach | DT; asymmetric D1 compatibility is intentional. |
| K1-MCP-DT-04 | breaking MCP removal/consumer upgrade → bounded 1.2/envelope-v2/public-service preservation, inert settings, removed producer state | DT; no unauthorized transport replacement. |

Unchanged K1 TODOs: UC-01-A1, EP-05, DT-02, EP-08 and ST-04. K1 total falls from 24 to 22 TODOs; historical S1/S2/S3 50 TODOs remain unchanged. This count change is removal of obsolete numeric domains, not successful execution.

## Complete author-owned changed-file list

- [K1 wrapper](<../../packages/connector/test/instance-ext/k1.test.mjs>)
- [K1 TODO catalog](<../../packages/connector/test/instance-ext/mcp-w0-cases.spec.mjs>)
- [fold-notify cases/local stub](<../../packages/fold-notify/test/instance-ext/fn-1.test.mjs>)
- [X0-C](<../../packages/instance/test/instance-ext/x0-c.test.mjs>)
- [approval broker](<../../test/approvals-broker.test.mjs>)
- [K2 frame/version](<../../test/body-soul-k2-frame.test.mjs>)
- [config](<../../test/config.test.mjs>)
- [X0-B](<../../test/instance-ext/x0-b.test.mjs>)
- [X0-S](<../../test/instance-ext/x0-s.test.mjs>)
- [X0-W](<../../test/instance-ext/x0-w.test.mjs>)
- [limits form](<../../test/limits-config.test.mjs>)
- [limits live](<../../test/limits-live.test.mjs>)
- [ask](<../../test/rev11b-ask.test.mjs>)
- [direct](<../../test/rev11b-direct.test.mjs>)
- [answer](<../../test/rev11c-answer.test.mjs>)
- [direct card](<../../test/rev11e-direct.test.mjs>)
- [question flow](<../../test/rev11g-flow.test.mjs>)
- [question hold](<../../test/rev11g-hold.test.mjs>)
- [stored modes](<../../test/rev11g-modes.test.mjs>)
- [plan review](<../../test/rev11g-plan.test.mjs>)
- This ledger.

Shared test support changes are owned by the separate fixture author, not this author. Their interface used here is explicit `seedStoredInteractionConfig(booted,patch,{resume:[sessionIds]})` / `q.seedStoredConfig(patch,{resume:[sessionIds]})`: raw retired fields are seeded only in the disposable stopped fixture, original environment retained, then explicitly listed stored sessions are reopened using the existing worker resume boundary. No automatic hidden inference of sessions or product behavior is added. Tests rebind host/stub when needed. Existing six independent v2 suites remain untouched.

## Verification, boundaries and unresolved observations

- This author ran `node --check` on changed test modules and `git diff --check`; no live DSH test, browser, network client, credential access, install, push or commit was run. Parent owns scoped runtime results and final review; [results ledger](<v2-d1-d3-superseded-results.md>) is the separate execution record.
- Parent reported the initial selected matrix on both SDKs as 277 total / 162 pass / 28 fail / 87 TODO before the two K1 TODO deletions; the final selected expected inventory is 275 total / 162 pass / 28 fail / 85 TODO. The two removed executable cases are exactly XW-P-02 and XC-EP-STUB-04, not dropped unrelated coverage. Parent must finalize actual results, not infer them from this arithmetic.
- All H-STUB/root real-host rewrites remain **unexecuted**: they spawn DSH and are excluded by authorization. Reload/resume mechanics have static review only; no claim of working real-host integration is made.
- Existing real-time fixture conventions observe beyond former 1/2/3-second windows with slack. They are not controlled-clock −1/0/+1 ms proof; former-minimum/configuration partitions and native-timeout orderings retain BVA intent without claiming sub-ms precision. The old 120-second default is reloaded and verified structurally, not waited out for two minutes.
- K2 is syntax/review only: its pre-existing top-level source-text extraction reads the connector browser bundle, so executing it would violate this author's no-product-source constraint. X0-B placement cases also create local symlinks and start a fake boot child; they were not run. X0-S was not broadened into execution either.
- Rendered D2 editor removal, instruction-copy absence, actual page-open clear POST wiring, sidebar green dot/animation, and repeated iframe/state-update no-clear remain UI/system observations, not inferred from config or TODO inventory. Schema absence versus hidden load-only fields is not a product rule.
- Signal arrival while the Fishball page is already open remains unspecified and has no invented oracle.
- Legacy default-schema tests, grant and attachment expiration, raw retention/retired routes, and unrelated control/data-limit assertions are preserved. Historical future MCP S1/S2/S3 text is explicitly not used to override V2.
