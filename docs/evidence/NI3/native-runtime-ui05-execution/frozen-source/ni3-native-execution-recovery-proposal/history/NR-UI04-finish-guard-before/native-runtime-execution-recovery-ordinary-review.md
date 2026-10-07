# NR-UI04 ordinary source review: execution reference recovery

**Status:** source-only ordinary code/interface/test-coverage review. This does not close the blocked independent core review, provide ISTQB review, establish native behavior, or accept any criterion. All 87 AC remain HOLD.

## Reviewed pins

Current capsule: `.runtime/ni3-native-execution-recovery-proposal/`.

- Proposed client: `proposed/client-entry.cjs`, SHA-256 `436c5c6732bafe658cc851962dfcad2220d0cbf270908c2eaabd4efe128cdc98`.
- Wire fixture: `test/native-runtime-execution-recovery-client.test.mjs`, SHA-256 `613c509f461987d11db8a5a1fe42c217f6233d0e8516856c0adf774f132c5ad1`.
- Source closure: `source-closure.json`, SHA-256 `7bf897c95f05d5c0237b803c3341aa3c53fdac94176b48924ebf5dadfed783ae`.
- Authored fixture status: `authored-fixture-status.json`, SHA-256 `b501f4e651649fe56f116de523ec517596544d7ac5759915af24805bcbed5b25`.
- Original public host source read for snapshot/execution lifecycle: `.runtime/ni3-native-runtime/src/runtime-store.mjs`, SHA-256 `1742b0f3ffb190f285ac0a915e8efd0fde2fde42d62ecd22a4e75a86930ad27f`.
- Existing public task-model/client source used for selected-detail semantics: `.runtime/ni3-native-runtime/src/client-entry.cjs`, SHA-256 `cd703f820c1d2a02d5d4586922d39c25291843ec9f025c13b526c6acd87f14c0`.

Historical pre-correction snapshot is retained at `.runtime/ni3-native-execution-recovery-proposal/history/NR-UI04-ordinary-terminal-before/`: client `b23be8f04f30dcb7436599531644cbfcd160f9ce21f32e039f82cdc227c5e332`, fixture `40befeac957af94f422854e0dee1c8e562370ead2f84116f7466d10a32b551dd`, closure `eec5fe4d9e35658f79cb60eccb223f4305c16e8d68fba89ab9f128abcff0ba1d`. That version allowed unsupported `cancelled` and omitted reachable `terminated`; the final candidate corrects both. Its exact historical pins are preserved, not treated as current.

## Review findings

### Recovery path is read-only and preserves uncertainty

`recoveredExecution()` reads the public task model snapshot. It requires the audit client to retain an uncertain `executeAudit`, the original action/input/worker context, and no already-retained execution. It rejects stale snapshots, task-version/auth-epoch drift, absent or oversized arrays, duplicate matching workers/actions/executions, and nonmatching identities. The candidate execution must be the sole `audit_input` row for the claim and must bind to the exact current task, action/digest, claim, generation, session, input record/digest, audit, binding/material digest, purpose, and the `executionRef` in the action's public metadata.

The execution parser uses a closed allowlist: 19 required fields and five optional fields (`admittedAt`, `resultRef`, `reportRef`, `outcomeEvidenceRef`, `terminalEvidenceRef`). It retains historical `dataDigest` and `semanticRevision` literally rather than comparing them with present-day artifact/task values. It checks actual relationships such as `resultRef === executionRef`, report requires result, dispatch intent requires `admittedAt`, and terminal outcomes require outcome and terminal evidence references.

This aligns with the reviewed public host path: `beginAuditExecution()` stores an `intent_committed` `audit_input` record and writes its `executionRef` to action metadata; `assertExecutionCurrent()` advances to `dispatch_intent` with `admittedAt`; capture/report writers add their corresponding optional references; `settleAction()` supports `completed`, `failed`, `unknown`, and `terminated`, and stores `unknown` when worker terminal evidence is absent. The corrected candidate accepts exactly those stored execution states and excludes `cancelled`.

`recoverExecution()` issues no RPC and no task refresh, mints no identifier, and does not change `stale` or `uncertain`. It sets only the retained execution and clears preview/acceptance/error state. Busy, disposed, disconnect epoch changes, task selection changes, or replacement of the snapshot during the synchronous read cause refusal. The actual task model binds `detail.task` to the selected task and marks selection/detail refresh in progress stale; the recovery reader also verifies snapshot freshness and compares the same snapshot object before publication.

### Fixture coverage and limits

The twelve ER groups are explicit React/RPC/task-model wire doubles driving the actual client factory and public model methods. They do not write private model state. Coverage includes lost execute reply, disconnect and late reply, no replay, duplicate/missing/oversized arrays, foreign identities, closed schema and field domains, actual optional/terminal shapes, stale/task drift/busy/disposed handling, task switching, Panel control boundaries, retained-reference conflict, and historical digest/revision/command preservation.

All 12 fixture groups are `NOT_RUN`. They are authored source fixtures, not native DSH records, a database/service test, an independent ISTQB review, or evidence that recovery works against a live host. No test, import, build, runtime, database, service, browser, network, listener, or Git operation was performed for this review.

### Residual interface gap: finish guard is only at the Panel

The Panel disables “Finish owned role session” while no collection exists, and recovery itself creates no collection and sends no finish request. However, the returned public audit-model `finish()` method has no `state.collection` precondition. Immediately after recovery, stale state makes the generic `run()` gate refuse it. After the public read-only audit-status refresh clears that stale flag, a direct caller can invoke `finish()` while `state.collection` is still null; that method enters `run('auditFinish', ...)` and can send the RPC. The Panel remains disabled. ER10 tests the disabled Panel button and verifies recovery emits no finish call, but it does not invoke `finish()` after that refresh.

This is a concrete caller/interface boundary gap, not evidence that the host accepts the request or that recovery itself grants host authority. The host remains authoritative. Root and the runtime author were notified; no source edit was made in this review. Until the method guard or an explicit contract is addressed, the UI-only collection/finish boundary is not complete for arbitrary callers.

## Scope and disposition

This review covered ordinary public interfaces and source fixtures only. The S3 receipt/envelope experiment and related protected internals were excluded as instructed; no retry/reroute or adjacent private-core inspection was performed. The task does not close the blocked CODE final review gap. No web PASS, native PASS, or acceptance is claimed. All 87 AC remain HOLD; no MVP acceptance or publication.
