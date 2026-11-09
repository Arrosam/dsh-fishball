# D1–D3 independent test inventory and scoped execution

## Execution update (subsequent authorization)

**Final authored six-file matrix: 50/50 pass on EACH SDK**, no failure/cancel/skip/TODO. Includes seven independently authored [runtime gate cases](<../../test/v2-d1-runtime.test.mjs>), 34 schema/version cases, four inert config partitions, four producer cases, and one multi-step [connector latch case](<../../test/v2-d3-connector-attention.test.mjs>) proving sticky importance, clear reset, detach reset and stale detach protection. Exact command: `FBTEST_DSH_RUNTIME="$runtime" TMPDIR=/private/tmp node --test --test-concurrency=1 --test-timeout=60000 test/v2-d1-runtime.test.mjs test/v2-d1-contract.test.mjs test/v2-d1-d3-schema.test.mjs test/v2-d2-config-retention.test.mjs test/v2-d3-connector-attention.test.mjs test/v2-d3-signal-producer.test.mjs`.

[Full existing-suite baseline delta](<v2-d1-d3-baseline-delta.md>) lists every failed case by full name. Both SDK current matrices: 279 total, 147 pass, 45 fail, 87 TODO, no cancel/skip; relative to baseline, 13 added failures and zero resolved. This total includes the original 34 schema tests. Both SDK runs completed and were collected; all owned jobs are finished. Temporary baseline archive was removed after verification.


Latest authorization explicitly allows disposable localhost test HTTP fixtures. Resumed matrix: four package files previously listed plus `test/instance-ext/x0-w.test.mjs`, `test/body-soul-i3-admission.test.mjs`, `test/body-soul-i7-records.test.mjs`, `test/e1-p2-model-choice.test.mjs` and the two new schema files. Baseline `5d93891aa41bd9b716faa91306b22095d3b076c2` archived into a fresh workspace directory; same existing-file selection on each SDK returned **245 tests: 126 pass, 32 fail, 87 TODO**, no skip/cancel. Failures include 28 pre-existing X0-C failures and four old X0-W attention.set stub failures.

Added [producer behavior tests](<../../test/v2-d3-signal-producer.test.mjs>): **4/4 pass on both SDKs** for exact false/true payloads, absent-capability no-wire behavior, and no replay on reconnect. Initial optionality assertion was corrected: a local rejection is unspecified and permitted; no wire request is the required invariant. Existing fixtures unchanged; explicit timerfree advertisement supplied on reconnect. No implementation read for the correction.


Coordinator subsequently authorized version-pinned SDK reads and scoped tests. The new SDK-free suite ran with `node --test --test-concurrency=1 --test-timeout=60000 test/v2-d1-contract.test.mjs test/v2-d1-d3-schema.test.mjs`: **34 pass, 0 fail, 0 cancelled, 0 skipped, 0 TODO**, ~162 ms. This proves the authored schema/version cases only, not runtime negotiation/attention transitions or D2.

Combined package-suite job `bash-85e12844c34742e7` began on rc.5 but was cancelled and collected (SIGTERM) after coordinator clarified that listening HTTP/network is forbidden: existing bootChild fixture uses localhost fetch at [fixture HTTP entry](<../../test/support/instance-ext.mjs#L628-L631>). Its partial output is not a full result; rc.1 was not reached. Additional existing root suites were not started. No real DSH process/model/external network was launched by this author. Do not report cancelled package coverage as pass or as a product regression. This historical restriction was subsequently lifted; resumed matrix above supersedes this partial run.

The canonical status table distinguishes fully observed assertions from partial schema/service coverage and unexecuted runtime/UI observations.


Requirements source: direct coordinator brief, 2026-11-09. No product implementation was read. Existing tests/support were read only for public fixture conventions and superseded assertions. Only authorized local fixtures and read-only immutable SDK imports executed; no installs, browser/model calls, external network, live profiles, or commits. New files only.

## Acceptance criteria

- AC1 / D1: contract 1.2; optional `interaction.timerfree`; built-in requires it; negotiate only when both advertise before ready.
- AC2 / D1: timerfree descriptors omit `expiresAt`; default legacy helpers retain legacy schema.
- AC3 / D1: legacy control works; approval.list empty; approval.answer, question.answer, question.ask, question.answerOwn, prompt.list and prompt.answer return feature-off; direct requests fall back to user without queued bypass.
- AC4 / D1: new instance refuses old connector, gives upgrade message and detaches.
- AC5 / D2: stored questionMode/approvalAnswerSeconds retained but ignored; controls removed; no deadlines.
- AC6 / D3: optional attention.signal exact request `{important:boolean}` / response `{accepted:true}`, stateless instance; no counts/timestamp/clear to instance or timers.
- AC7 / D3: connector count projection 0/1, important sticky until page-open clear; old instances send no signal, show no dot.

D2 [retained inert configuration tests](<../../test/v2-d2-config-retention.test.mjs>) also pass **4/4 on each SDK**: object/null/user/unknown mode and malformed duration partitions are retained, readQuestionMode remains fishball, readLimits omits the retired timer. UI removal and temporal no-deadline behavior are not inferred from this result.

## Written coverage

- [Contract tests](<../../test/v2-d1-contract.test.mjs>): nine cases: advertised 1.2; minors 0/1/2/3; unsupported major predecessor/successor 0/2; legacy attachment minors 0/1.
- [Schema tests](<../../test/v2-d1-d3-schema.test.mjs>): 25 cases: semantic name; 2 descriptor modes × 2 public surfaces (event/list) × deadline presence; signal operation name; boolean partitions; nine invalid partitions; exact acknowledgment and three invalid acknowledgments.

Both import only the public connector contract, avoiding fixture linking or live SDK resolver defaults. Public validator signatures were confirmed by the coordinator; 34 tests passed in the initial SDK-free run. A missing export is a real interface/setup failure, not a skip. Full runtime integration remains designed below, not disguised as TODO passes.

## Decision table

| Rule | Connector advertises timerfree | Instance advertises timerfree | Built-in requires | Expected |
|---|---|---|---|---|
| R1 | no | no | no | legacy controls; interaction routes gated |
| R2 | yes | no | no | legacy controls; interaction routes gated |
| R3 | no | yes | no | not timerfree; interaction routes gated |
| R4 | yes | yes | yes/no | timerfree before ready |
| R5 | no | yes | yes | upgrade notice, detach, never ready |

## Attention transition table

| State (count, important) | ordinary signal | important signal | page open |
|---|---|---|---|
| clear (0,false) | (1,false) | (1,true) | (0,false) |
| ordinary (1,false) | (1,false) | (1,true) | (0,false) |
| important (1,true) | (1,true) | (1,true) | (0,false) |

Reconnect/dispose must not replay or clear a stored instance attention value: the instance has no such state. Behavior when a new signal arrives while the page is already open is not specified; do not invent an oracle for it.

## Canonical cases

| TC No. | TC Name | Details | Techniques Used | AC Covered | Expected Behaviour | Status |
|---|---|---|---|---|---|---|
| TC-01 | Negotiate version boundaries | Supported minor 2, peers 0/1/2/3 and major 0/2 | EP / BVA | AC1 | common minor min(peer,2); incompatible major refused | Pass |
| TC-02 | Keep legacy attachment | Attach peers 1.0 and 1.1 without semantic capability | EP | AC3 | attachment validation succeeds | Pass |
| TC-03 | Gate mutual advertisement | Exercise R1–R4; capture first ready observer | Decision Table (R1–R4) / State Transition | AC1, AC3 | only R4 timerfree, established before ready | Not Run |
| TC-04 | Refuse old connector | Built-in requires timerfree; connector omits it | Decision Table (R5) / State Transition | AC4 | understandable upgrade message, detach, no ready | Not Run |
| TC-05 | Validate descriptors | Event and list; deadline present/absent in legacy/default and timerfree modes | Decision Table | AC2 | legacy requires deadline; timerfree rejects its presence | Pass |
| TC-06 | Keep unrelated controls | Legacy peer performs session list/read/message/stop | EP | AC3 | existing authorized control behavior remains | Not Run |
| TC-07 | Gate every interaction route | Legacy peer calls each six gated methods; approval.list separately | EP | AC3 | feature-off for six; empty approvals list | Not Run |
| TC-08 | Block queued bypass | Legacy peer attached during direct approval/question; then reconnect timerfree | State Transition | AC3 | immediate user fallback; no legacy offers or queued intake replay | Not Run |
| TC-09 | Preserve dormant settings | Stored questionMode auto/user and approvalAnswerSeconds 1/120; restart | EP / State Transition | AC5 | values retained, same timerfree behavior; no controls | Partial: inert schema retention passes; restart/UI untested |
| TC-10 | Cross former deadline | timerfree approval and question at old limit −1/0/+1 ms using controlled clock | BVA | AC5 | still pending; no timeout audit, offer deadline, automatic fallback | Not Run |
| TC-11 | Reject private signal data | missing/null/array/string/number importance; count/timestamp/clear extras separately | EP | AC6 | each malformed payload rejected independently | Pass |
| TC-12 | Accept both importance values | Exact false and true payloads, exact accepted:true acknowledgment | EP | AC6 | both accepted; no response state | Pass |
| TC-13 | Saturate unread projection | 0, 1, 2 ordinary signals | BVA / State Transition | AC7 | count 0,1,1; no accumulation | Partial: mixed signal saturation passes |
| TC-14 | Preserve importance | ordinary → important → ordinary → important | State Transition | AC7 | (1,false) → (1,true) → (1,true) → (1,true) | Partial: ordinary→important→ordinary passes |
| TC-15 | Clear only on page open | important → page open → ordinary; duplicate page open | State Transition | AC6, AC7 | clear both flags; no instance clear request; next ordinary not important | Partial: clearAttention boundary passes; GUI wiring untested |
| TC-16 | Keep instance stateless | signal → reconnect → dispose | State Transition | AC6 | no signal replay, no disposal zero/clear frame | Partial: reconnect no replay passes; disposal wire not observed |
| TC-17 | Keep signal optional | connector does not advertise attention.signal | Decision Table | AC6 | no attention request, normal attachment | Pass |
| TC-18 | Keep old instance dot-free | old peer sends ordinary non-signal control/event traffic | EP | AC7 | no inferred unread dot | Not Run |
| TC-19 | Reject extra ack data | missing/false accepted, extra count | EP | AC6 | rejection, not inferred successful projection | Pass |
| TC-20 | Exclude timers | capture timer registration at attention/interaction ownership boundaries only | EP | AC5, AC6 | no deadline/reset/debounce timers for these behaviors | Not Run |

EP, BVA, decision tables and transitions applied. Error-guessing is covered by extra-field rejection and queued-backdoor/reconnect sequences; no broader unrelated testing invented.

## Existing assertions superseded (do not edit without explicit test decision)

| Existing case name/ID | Path | Superseded assertion / reason |
|---|---|---|
| K2-V-01 CONNECTOR_CONTRACT is 1.1; K2-V-04 common minor lower | [K2 tests](<../../test/body-soul-k2-frame.test.mjs#L68-L82>) | exact 1.1 and cap of 1 for peer 1.5 become 1.2/cap 2; older peer negotiation remains |
| XW-DT-01 set sends value; XW-DT-02 without capability nothing sent | [X0-W](<../../test/instance-ext/x0-w.test.mjs#L74-L89>) | replace attention.set/count payload with optional signal; absence behavior retained |
| XW-ST-01 none→value→reconnect→dispose zero | [X0-W](<../../test/instance-ext/x0-w.test.mjs#L91-L103>) | replay and zero-state clearing contradict stateless signal |
| XW-P-02 second owner owner-busy | [X0-W](<../../test/instance-ext/x0-w.test.mjs#L105-L112>) | old attention ownership/disposer API removed |
| XW-P-03 attention never required | [X0-W](<../../test/instance-ext/x0-w.test.mjs#L114-L118>) | optionality remains, old operation and claim that built-in attaches to 1.1 connector superseded |
| XC-EP-STUB-04 attention.set refuses typed metadata | [X0-C](<../../packages/instance/test/instance-ext/x0-c.test.mjs#L120-L150>) | removed attention.set member cannot remain required stub |
| APR-01 descriptor/notice; APR-08 ×2 silence timeout; APR-09 answer time starts at request | [Approval broker](<../../test/approvals-broker.test.mjs>) | deadline keys, within-N-seconds and timed fallback removed; non-timer assertions retained |
| FLW-07 ×2 question leaves after seconds; FLW-10 offer contents | [Question flow](<../../test/rev11g-flow.test.mjs>) | no negotiated expiresAt or timed withdrawal |
| HLD-02/HLD-03 leaves instance after limit | [Question hold](<../../test/rev11g-hold.test.mjs>) | no deadline-based departure; native question remaining held still valid |
| DIR-06 stock prompt after 1 s | [Direct requests](<../../test/rev11b-direct.test.mjs>) | configured timeout no longer schedules fallback |
| ASK-06 card after 1 s | [Ask](<../../test/rev11b-ask.test.mjs>) | configured timeout no longer schedules escalation |
| ANS-08 card after answer time | [Answer](<../../test/rev11c-answer.test.mjs>) | no timeout-driven card or timeout audit |
| DCD-06 card and stock prompt after 1 s | [Direct card](<../../test/rev11e-direct.test.mjs>) | no timeout-driven card or timeout audit |
| L63 approvalAnswerSeconds 2/120 deadlines | [Live limits](<../../test/limits-live.test.mjs>) | stored legacy setting inert |
| MOD-01 default shown; MOD-02 valid modes accepted by form; MOD-03 invalid form values; MOD-04/05 nobody-answer timeout branches; MOD-06 mode-user refusal | [Modes](<../../test/rev11g-modes.test.mjs>) | control removed and stored mode ignored; MOD-07 raw retention and MOD-08 retired route need independent preservation, not wholesale deletion |

Not superseded merely by an `expiresAt` spelling: grants and attachment transfer expiry. Likewise old helper default-schema tests remain valid; only explicitly timerfree paths omit deadline. Many root integration suites use a legacy instance stub; successful instance interaction assertions must migrate fixture advertisement intentionally or expect feature-off, not blindly update every old expected result.

K1's current MCP TODO inventory also conflicts with this D1–D3 decision: `K1-MCP-EP-01/02/03/04`, `BVA-01/02/03/04`, `EP-07`, `ST-01` require count/timestamp reports; `UC-01-M`, `UC-01-E1`, `UC-02-M`, `ST-02/03` require latest-report/reset semantics; `EP-06` says no legacy schema exception; `DT-01/03/04` requires breaking removal rather than legacy controls. These are TODO descriptions, not failures/passing runtime assertions. Their definitions are in [MCP case catalog](<../../packages/connector/test/instance-ext/mcp-w0-cases.spec.mjs>); K1 execution wrapper is [K1](<../../packages/connector/test/instance-ext/k1.test.mjs>). Supersede only the conflicting parts; do not count TODO checkmarks as passes.

Fold-notify fixture supplies only `attention.set` ([fixture](<../../packages/fold-notify/test/instance-ext/fn-1.test.mjs#L28>)); new signal calls need an updated fixture before those cases can observe them. This is fixture compatibility, not proof fold-notify behavior regressed.

## Offline SDK setup and exact scoped invocation

Initial offline fixture search found no SDK. Subsequent coordinator authorization explicitly permits the immutable installed version SDK directories read-only: `/Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules` and `/Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules`. These are the exact now-authorized resolver roots, not profiles/homes. A scoped run of the four existing suite files and two new files was subsequently authorized with `node --test --test-concurrency=1 --test-timeout=60000` on each. Execution results are finalized above.

Search of workspace `.agents` for `**/node_modules/@deepseek-ai/dsh/package.json` and `**/*dsh*.tgz` returned none. Parent confirms root node_modules absent. This is a scoped finding, not a claim no SDK exists anywhere. No live or backup contents searched. The two immutable version SDK roots above are now explicitly authorized read-only; no other installed DSH data paths are authorized.

Existing package suites have no package-specific test runner. Exact package-file invocation (authorized immutable roots are supplied through these variables):

```sh
# Set to the two explicitly authorized immutable version node_modules directories above.
: "${OFFLINE_RC5_NODE_MODULES:?offline SDK 0.2.1-rc.5 required}"
: "${OFFLINE_RC1_NODE_MODULES:?offline SDK 0.2.2-rc.1 required}"
for runtime in "$OFFLINE_RC5_NODE_MODULES" "$OFFLINE_RC1_NODE_MODULES"; do
  FBTEST_DSH_RUNTIME="$runtime" TMPDIR=/private/tmp node \
    --test --test-concurrency=1 --test-timeout=60000 \
    packages/connector/test/instance-ext/k1.test.mjs \
    packages/connector/test/instance-ext/mcp-feasibility.test.mjs \
    packages/instance/test/instance-ext/x0-c.test.mjs \
    packages/fold-notify/test/instance-ext/fn-1.test.mjs
 done
```

This is exact existing connector/instance/fold-notify package suite selection, not the whole repository integration suite. K1 is explicit TODO inventory, not executable conformance proof. MCP feasibility was inspected and consists only of TODO inventory. Existing fixture default SDK resolver points outside workspace; explicit FBTEST_DSH_RUNTIME is mandatory. Do not use root `test/run.mjs`: it deletes the test-home root, links the contract, and runs broader real-host suites outside this task.

New SDK-free coverage invocation:

```sh
node --test --test-concurrency=1 --test-timeout=60000 \
  test/v2-d1-contract.test.mjs test/v2-d1-d3-schema.test.mjs
```

Remaining coverage gaps: existing legacy fake-host advertisement is intentionally unchanged; full runtime handshake/direct-fallback coverage is incomplete; no full runtime/system coverage claimed. Signal local service signature confirmed by coordinator as `signal(pluginId,{important})`. Invalid payload rejection code not specified, so tests assert rejection without inventing an error code. Signal-while-page-already-open behavior requires clarification before a dependent case.

## Additional runtime coverage and remaining limits

Seven runtime tests authored independently by a second test agent passed in the final matrix: host semantic marker readiness ordering, pre-handshake refusal, legacy session.read controls, six legacy interaction gates plus empty list without handler entry, capable handlers/deadline-free request/list, legacy suppression of three approval event kinds, five ordinary inbox kinds, and pending approval intake unchanged across capable reconnect. These do not prove built-in upgrade-message/detach UX, full domain ledger integration, UI clear wiring, or controlled-clock no-deadline behavior. Existing fake-host failures can mask unrelated regressions; no complete green existing-suite claim is made.
