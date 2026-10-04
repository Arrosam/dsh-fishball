# NI3 runtime review and repair: read-only proposal

Status: **PROPOSAL; no implementation GO and no independent design freeze.** This records the authorized read-only preparation by the existing `ledger_core` coding lane. It is neither an independent CODE review nor evidence that runtime audit acceptance passed. NI1 is the active implementation; NI2 precedes this proposed unit.

The [normal integration plan](normal-entry-integration-plan.md) retains all BUB015 criteria. Existing factories expose bounded audit primitives, but the normal entry still needs repeatable private reviewer identities, actual approved input/material coverage, separately charged execution and repair lineage. Configuration cannot create an audit report or confer reviewer authority.

## Observed seams

`runtime-plugin.mjs` currently allocates one reviewer handle for its installed reviewer closure. `RuntimeStore.bindExecution` denies rebinding an existing private handle. Repeated tasks and rounds therefore need a fresh private handle per task/audit/generation, a bounded pool and a disposer that closes old admission.

Ordinary execution in `runtime-store.mjs`, `worker.mjs` and `native-adapter.mjs` binds the execution-context digest to `action.dataDigest`. Audit approval instead binds artifact/audit material. A separate typed immutable-input association must cover both meanings without weakening the original artifact, target, action or grant digests.

`WorkerManager.dispatch` does not forward `auditRepair`, while the audit/core claim already supports atomic repair lineage. Its future optional typed field must be captured before asynchronous preparation and passed unchanged into the atomic charged claim.

## Proposed typed contract

An optional complete action field would be:

```js
executionInput: {
  recordRef, digest,
  purpose: 'audit_review', // alternatively audit_repair
  auditRef, bindingDigest, materialDigest,
  previousReportRef // repair only where required
}
```

`action.dataDigest` remains the exact approved artifact/material digest, and `targetDigest` remains the audit binding. The complete action digest additionally covers the typed input, purpose and lineage, so preview and grant bind the actual wakeup input as well as its reviewed material. Ordinary actions without this field retain their current meaning.

Proposed `prepareAuditInput(ownerOrCoordinator, input)` accepts exact task/command/version/auth/audit/revision/purpose/round/previous-report fields. It prepares deterministic bounded encrypted `context` material from authorized immutable records, requirements and any required previous report, with a signed `audit_input` association. It is derived data and does not increment semantic revision. The existing65536-byte envelope bound applies; protected material refuses on overflow instead of truncating.

Proposed `bindAuditReviewer(host, privateHandle, binding)` binds the exact claimed task/audit/generation/session and derives an allowlist from that held review claim and the actual owned native session. Its private closures cannot be supplied by owner JSON or model output. Each admitted review uses a separate identity and reservation.

Proposed `beginAuditExecution(host, input)` and the existing atomic final consume recheck current claim, task/auth, audit binding, material/input, generation and session facts. No await separates that consume from the exact public native send. An idle created session is not a review result. Unknown outcomes remain held and are never automatically resent.

The proposed detached `auditRepair` dispatch field contains `{auditRef,round,previousReportRef,evidenceRef}`. The atomic claim checks current lineage and repair limits, charges resources, and persists submitted intent before native creation. Preparation, claim, submission, settlement, termination and resource release remain distinct facts.

Actual returned review material needs a typed signed association with execution/claim/generation/session/input digest, cursor, encrypted result digest and factual evidence. Only that actual response can support a current private report. Late output may be reconciled as a fact; it cannot certify newer requirements or silently gain authority.

## Proposed schema and verification

Even without new SQL columns, the changed persisted consent format should increment the ledger to schema5 so an old runtime refuses before mutation. A4→5 migration would validate the graph, crypto2 records, signed receipts and held facts under the lock, preserve a fsynced `.schema-4.backup`, and retain existing cipher AAD/action digests/receipt formats. Wrong keys, hot journals, sidecars, injected faults and future schemas must preserve data. Migration fabricates no new input proof for an old action.

Independent test design must precede this code. Proposed meaningful cases include two tasks and repeated rounds with distinct private handles/native sessions/charged claims; exact material and immutable input coverage; exclusion of foreign/stale/tampered/lineage facts before wakeup; one concurrent consume with zero duplicate stream; quit/restart uncertainty without replay; atomic repair limits with zero effect on refusal; and a genuine schema4 migration fixture with crash and preservation evidence. An emitted physical normal-entry package is a separate required oracle.

Owner choices still include review models, budgets, grant expiry, context bounds, severity/repair policy and round limits. Product code derives native identity, ownership, catalog and current execution facts. Missing choices do not excuse missing interfaces. Final independent CODE, browser/model-quality and full BUB015/product acceptance remain HOLD.
