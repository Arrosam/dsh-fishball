# NI5 schema6 typed local admission and applicable audit scope

Status: additive source-only contract candidate. This resolves two concrete static composition gaps identified during the isolated schema6 author lease. It does not amend the already-held NI3, NI4, NI5 contracts or claim executable, CODE, native, browser or acceptance evidence. Root authorized this exact interpretation; independent design binding and a later promotion/execution lease remain required.

## One existing atomic claim, two typed entry points

The new `RuntimeStore.claimLocalDelivery(handle,input)` accepts exactly:

```js
{
  taskRef, actionRef, actionDigest, commandRef,
  expectedTaskVersion, expectedAuthEpoch,
  delivery: {deliveryRef},
}
```

There is no normal boolean, callback, caller provenance, outbox/message selector or auditRepair field. The original constructor-bound owner/coordinator/host identity rules remain the authority boundary. Root's normal ResultPipeline composition privately binds its existing claimAction slot to this typed method. The generic advanced RuntimeStore.claimAction and generic advanced ResultPipeline remain unchanged for genuinely unmarked records. A mode-none executor by itself does not identify a normal local delivery.

Both entry points call the SAME internal synchronous claim implementation and original Ledger transaction. Before any action attempt/reservation/worker/outbox/counter mutation, the typed local path checks the exact immutable accepted delivery/action/full digest, fresh task/auth/grant/expiry/control and current resource/model policies, complete current native verification/material/semantic chain, exact full canonical publication UTF8 bytes against the approved charges.usageUnits, and all applicable sticky normal notification predicates. Existing last-slot, bounded review/repair/attempt/budget/history/command limits and private synchronous hostPermission still apply. The local action remains original kind write, role worker, executor none with explicit units/runtime/usage; estimated zero monetary effect requires the actual private source-owned local composer, never a caller zero/flag or generic unknown price. No inference, new queue, claim, reservation or outbox is introduced.

The return is exactly the original claim receipt:

```js
{claimRef, reservationRef, actionRef, actionDigest,
 generationRef, sessionRef, task}
```

The typed command uses the fixed `claimLocalDelivery` operation namespace in the existing keyed command digest/receipt envelope. Original claimAction receipts remain byte-for-byte original and are never reinterpreted as local receipts. A same command ID crossing the two operation namespaces conflicts. Exact typed receipt replay is acknowledgement only, with no new attempt/claim/counter/effect; unknown/reopen holds never become fresh publication authority. The existing before_commit/after_claim fixture boundaries are shared with the original transaction; no callback/await enters it.

Sticky signed localReportOnly policies enforce the complete normal manifest/source/UTF8 predicate even through generic claimAction. Truly unmarked generic deliveries retain their prior claim behavior. `publishLocalDelivery` retains the held exact signature and original getDelivery return shape, and ALWAYS repeats full local/native/currentness/byte/permission checks under its publication transaction regardless of the original claim path. It uses the SAME already-committed claim/reservation/outbox/group/fact/frequency ownership; no second admission, counter charge or own-pending-group conflict. Revoke/cancel first refuses publication. Publication first preserves sent/opening-unknown ownership for exact later reconciliation.

The byte recipe is unchanged:

```js
canonical({taskRef,deliveryRef,artifactRef,artifactVersion,digest,
  recipientRef,channelRef,content})
```

The entire canonical UTF8 envelope is charged at both typed claim and publication. There is no content truncation or metadata-cap widening. Private source-owned accounting is df-local-utf8-byte-units/v1, distinct from provider billing or measured runtime.

## Applicable source audits avoid a circular notification

A localReport.sourceStates snapshot contains the actual audit requirements for its SELECTED artifactRef. Each retains its actual historical/current artifact version/material/semantic/native report/finding/repair facts and the held closed layout. A revision, rebind, new round or changed material/verification for that selected artifact changes currentness; an old version remains explicitly stale rather than silently disappearing or becoming passed. Historical signed snapshots and native evidence remain immutable/readable.

An unrelated later audit of a notification-manifest artifact is not a source audit of the original selected progress artifact. Merely configuring/reviewing that notification therefore cannot circularly stale the very progress manifest being reviewed. This interpretation does not ignore semantic task changes: the shared semantic revision/current protected input/material predicates still invalidate stale reports. Preparing a new context that actually advances semantic authority requires a fresh exact source report/review; it is not treated as a procedural grant/claim/version change.

The whole-task REQUIRED audit gate still runs at normal claim/publication. The notification artifact itself needs its exact current independent native review and current material/semantic binding. Every selected original-goal/statement/blocker byte binding claimed by the notification must be covered by that notification review's exact material; reviewing reference-only manifest bytes does not certify extra statements. Fatal/configured blocking findings, missing coverage, unknown/budget/failed audit, stale semantics, unverified raw progress or unavailable native provenance cannot be waived by this source-scope interpretation. Source progress report states keep the original precedence: stale, blocked, budget_limited, unexamined, unknown, failed, not_run, passed.

## Later executable oracles

The later explicit source6 execution lease must test: unmarked advanced mode-none claim compatibility; normal typed full-byte minus-one/exact/plus-one denial and no partial reservation; typed-vs-generic same-command conflict; actual native source/capability/expiry/permission/policy/currentness denials; sticky normal-policy raw-progress/lying-manifest refusal even through generic claim; publication repeating the same exact checks without double frequency/resource accounting; both revoke/publication orders; unknown/reopen no replay; source progress -> notification artifact -> independent notification review -> typed claim/publication without circular currentness; same selected-artifact audit revision/round/material/semantic mutation correctly stale; unrelated audit cannot clear whole-task failure/coverage gates. These are planned oracles, not executed results. No protected plaintext-row corruption or blocked CODE experiment is authorized.
