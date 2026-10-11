# NR-UI04 ordinary source review: execution reference recovery

**Status:** affected source-only ordinary code/interface/test-coverage re-review completed for the approved public finish guard. The earlier direct-call gap is closed in this exact source pin. This does not close the blocked independent core review, provide ISTQB review, establish native behavior, or accept any criterion. All 87 AC remain HOLD.

## Reviewed pins

Current capsule: `.runtime/ni3-native-execution-recovery-proposal/`.

- Proposed client: `proposed/client-entry.cjs`, SHA-256 `0909a3effda67f0c1780b5ca9fc090650920d15ce0fe9f3acb137df122cb85b0`.
- Wire fixture: `test/native-runtime-execution-recovery-client.test.mjs`, SHA-256 `be73e92cf993f9bb2d0c99b77764d825aff5bc5dd908188b1e65e3293a75ad1a`.
- Source closure: `source-closure.json`, SHA-256 `2f0776d20db26a4fecb2e1d37816c110b5e94a7284db7d09c32b8bc275496f4b`.
- Authored fixture status: `authored-fixture-status.json`, SHA-256 `09b15b47209a630ce9b0ae2f59b96d2f14cc40c2e3373773054d80ef02883d36`.
- Root-approved finish guard proposal patch: SHA-256 `88e6a06672c95861a84b2458fbda9b7e945cfa636cf88eac271596c18a407ee2`; applied source-and-test amendment patch: SHA-256 `361cb85cad8abf35cf8f37be0b89c9eb3aa858882e36097c53882d09a27a5696`.
- Original public host source read for snapshot/execution lifecycle: `.runtime/ni3-native-runtime/src/runtime-store.mjs`, SHA-256 `1742b0f3ffb190f285ac0a915e8efd0fde2fde42d62ecd22a4e75a86930ad27f`.
- Existing public task-model/client source used for selected-detail semantics: `.runtime/ni3-native-runtime/src/client-entry.cjs`, SHA-256 `cd703f820c1d2a02d5d4586922d39c25291843ec9f025c13b526c6acd87f14c0`.

Historical pre-correction snapshot is retained at `.runtime/ni3-native-execution-recovery-proposal/history/NR-UI04-ordinary-terminal-before/`: client `b23be8f04f30dcb7436599531644cbfcd160f9ce21f32e039f82cdc227c5e332`, fixture `40befeac957af94f422854e0dee1c8e562370ead2f84116f7466d10a32b551dd`, closure `eec5fe4d9e35658f79cb60eccb223f4305c16e8d68fba89ab9f128abcff0ba1d`. That version allowed unsupported `cancelled` and omitted reachable `terminated`; the final candidate corrects both. Its exact historical pins are preserved, not treated as current.

The directly previous review pins are preserved at `.runtime/ni3-native-execution-recovery-proposal/history/NR-UI04-finish-guard-before/`: client `436c5c6732bafe658cc851962dfcad2220d0cbf270908c2eaabd4efe128cdc98`, fixture `613c509f461987d11db8a5a1fe42c217f6233d0e8516856c0adf774f132c5ad1`, closure `7bf897c95f05d5c0237b803c3341aa3c53fdac94176b48924ebf5dadfed783ae`, and prior report pair unchanged.

## Review findings

### Recovery path is read-only and preserves uncertainty

`recoveredExecution()` reads the public task model snapshot. It requires the audit client to retain an uncertain `executeAudit`, the original action/input/worker context, and no already-retained execution. It rejects stale snapshots, task-version/auth-epoch drift, absent or oversized arrays, duplicate matching workers/actions/executions, and nonmatching identities. The candidate execution must be the sole `audit_input` row for the claim and must bind to the exact current task, action/digest, claim, generation, session, input record/digest, audit, binding/material digest, purpose, and the `executionRef` in the action's public metadata.

The execution parser uses a closed allowlist: 19 required fields and five optional fields (`admittedAt`, `resultRef`, `reportRef`, `outcomeEvidenceRef`, `terminalEvidenceRef`). It retains historical `dataDigest` and `semanticRevision` literally rather than comparing them with present-day artifact/task values. It checks actual relationships such as `resultRef === executionRef`, report requires result, dispatch intent requires `admittedAt`, and terminal outcomes require outcome and terminal evidence references.

This aligns with the reviewed public host path: `beginAuditExecution()` stores an `intent_committed` `audit_input` record and writes its `executionRef` to action metadata; `assertExecutionCurrent()` advances to `dispatch_intent` with `admittedAt`; capture/report writers add their corresponding optional references; `settleAction()` supports `completed`, `failed`, `unknown`, and `terminated`, and stores `unknown` when worker terminal evidence is absent. The corrected candidate accepts exactly those stored execution states and excludes `cancelled`.

`recoverExecution()` issues no RPC and no task refresh, mints no identifier, and does not change `stale` or `uncertain`. It sets only the retained execution and clears preview/acceptance/error state. Busy, disposed, disconnect epoch changes, task selection changes, or replacement of the snapshot during the synchronous read cause refusal. The actual task model binds `detail.task` to the selected task and marks selection/detail refresh in progress stale; the recovery reader also verifies snapshot freshness and compares the same snapshot object before publication.

### Fixture coverage and limits

The twelve ER groups are explicit React/RPC/task-model wire doubles driving the actual client factory and public model methods. They do not write private model state. Coverage includes lost execute reply, disconnect and late reply, no replay, duplicate/missing/oversized arrays, foreign identities, closed schema and field domains, actual optional/terminal shapes, stale/task drift/busy/disposed handling, task switching, Panel control boundaries, retained-reference conflict, and historical digest/revision/command preservation.

All 12 fixture groups are `NOT_RUN`. They are authored source fixtures, not native DSH records, a database/service test, an independent ISTQB review, or evidence that recovery works against a live host. No test, import, build, runtime, database, service, browser, network, listener, or Git operation was performed for this review.

### Direct finish gap closed in the final source

The previous pin lacked a method-level collection check; that finding is closed here. The final public `finish()` returns `false` before `run()` unless both `state.execution` and `state.collection` exist. ER10 now directly calls `finish()` immediately after recovery and again after the read-only audit-status refresh while collection is null; both return false, add no RPC or refresh, and preserve stale/execute uncertainty. Once a separate collection response exists, the original finish request can be sent. The fixture's explicit `AUDIT_UNKNOWN` response leaves worker phase unchanged and paints an error/stale state rather than a successful finish or release fact.

The finish guard is the exact root-approved narrow amendment: `!state.execution || !state.collection` returns false before the existing request flow. It does not change host authority, uncertainty, or execution recovery. The fixture also demonstrates that the mocked `AUDIT_UNKNOWN` reply does not create completion/release UI facts. These are source and wire-double observations only; they do not establish native host behavior. A residual contract limit remains that any non-null collection object enables the explicit request, including an `unknown` collection; host refusal/authority is not independently verified here.

## Scope and disposition

This review covered ordinary public interfaces and source fixtures only. The S3 receipt/envelope experiment and related protected internals were excluded as instructed; no retry/reroute or adjacent private-core inspection was performed. The task does not close the blocked CODE final review gap. No web PASS, native PASS, or acceptance is claimed. All 87 AC remain HOLD; no MVP acceptance or publication.
