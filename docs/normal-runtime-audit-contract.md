# NI3 normal installed runtime audit contract

Status: **candidate contract; documentation only, awaiting root contract/design GO.** The author inspected the baseline identified by root as `d91d749`. This document specifies changes that are not implemented. It does not replace independent CODE review, satisfy browser/model-quality acceptance, or mark any ticket complete. The blocked CODE experiment must not be retried or rerouted.

This is the bounded NI3 unit in the [normal integration plan](normal-entry-integration-plan.md), refining the [read-only proposal](normal-runtime-audit-proposal.md). Original [BUB015/DF015 acceptance criteria](tickets/BUB015.md) and BUB003/004/006/008/012/013 remain unchanged. NI2 supplies the normal model/environment/permission/preview/owned-session execution path; NI3 supplies independently charged audit input, execution, result and repair associations through that path. Every durable fact uses the existing authoritative Ledger, opaque process-private principals and authenticated records.

## Normal configuration and readiness

Add installed-only optional `audit`. Omission is equivalent to exactly `{enabled:false}`. A disabled object forbids other fields. Disabled configuration cannot remove a previously committed required audit, settle a claim, erase a report or release a reservation.

The proposed closed enabled shape is:

```js
audit: {
  enabled: true,
  inputByteLimit, resultByteLimit, maxPrivateReviewers,
  blockingSeverities, maxRepairRounds, maxTotalAttempts,
  review: { selection, charges: { runtimeMs, usageUnits } },
  repair: { selection, charges: { runtimeMs, usageUnits } } // required iff maxRepairRounds > 0
}
selection: { provider, model, agentPreset, reasoningEffort, maxOutputTokens }
```

`inputByteLimit` and `resultByteLimit` are explicit safe integers1..65536; the complete serialized envelope must fit both the selected bound and existing task-data bounds. `maxPrivateReviewers` is1..32, an in-process handle bound additionally constrained by actual shared active units and retained storage capacities. `blockingSeverities` is a distinct array drawn from `fatal/blocking/warning/info`, maximum4; fatal always blocks even when omitted. `maxRepairRounds` is0..8. Zero forbids `repair`; positive values require it. The source ticket's suggested two rounds is not a selected default.

Each role uses the [NI2 closed charges contract](normal-worker-contract.md): safe integers `runtimeMs` in1..60000 and `usageUnits` in1..100000000. Runtime cannot exceed the accepted shared policy; usage must be at least `worker.bounds.requestBytes + selection.maxOutputTokens` and cannot exceed that policy. `resultByteLimit` additionally cannot exceed `worker.bounds.resultBytes`. The initial normal policy fixes units1, maxActive1 and maxAttempts1 per exact attempt group. `maxTotalAttempts` is an explicit safe integer2..32 for this proposed bounded NI3 unit; it must admit the producer plus separately charged review/repair/re-review, and insufficient chosen budgets truthfully refuse work. These structural ceilings are not measured performance, pricing or hard-billing guarantees. Review, re-review and repair consume the same shared units, attempts, runtime and usage; no independent audit budget or free retry exists.

NI2's current normal producer policy fixes maxTotalAttempts1. NI3 activation cannot overwrite it automatically. Extend `workerPolicyPreview({expectedPolicyVersion})` and `workerPolicyConfirm({previewRef,planDigest,commandRef,expectedPolicyVersion,accept:true})` to disclose/accept the complete NI3-enabled shared policy using existing `policy(owner,{commandRef,expectedVersion,limits,modelPolicy})`. Product code derives limits and role catalog facts from the detached current config; owner JSON supplies only the current prepared-policy reference/command/version, not a full policy or proof. Confirm atomically commits the shared policy with maxActive1/maxAttempts1, selected maxTotalAttempts and all producer/review/repair model-policy roles. The current policy version and model-policy version enter every complete action/grant; replacement stales future admission under old consent. Existing reservations/totals remain counted. Audit configuration's policyRef is product-derived from the exact accepted config/role policy, not a caller-selected equality label. `configureAudit` must match its selected severity/round policy. No automatic failure reset/rebind occurs.

The selection object is the NI2 candidate selection, not a second catalog. Provider/model/preset are bounded nonempty native selectors; reasoning is explicitly null or an advertised native choice. NI2's initial `maxOutputTokens`128..4096 partition applies. NI2 resolves the actual public catalog, effective reasoning, mounted preset, fixed scoped system prompt, suppressed unrelated runtime context, empty tools, canonical environment and original owned JSONL backend. Audit reuses NI2 environment/persistence selections and their separate plaintext transcript disclosure. It cannot redirect native persistence or add setup-vault files.

No config accepts cost proofs, digests, callbacks, handles, identities, reviewer factories or approval flags. Product code derives catalog/permission/persistence facts. Generic unpriced models remain unavailable through `COST_UNKNOWN`; they are not relabeled free. The proposed source-owned deterministic testing provider can supply source-proven zero monetary/network effects and synthetic usage only after its actual current registration and NI2 request gates are verified. Enabled config, mounting, setup confirmation, refresh, reload and restart create no audit, action, grant, session, report or provider request.

The admitted read-only feature envelope gains:

```js
audit: {
  enabled, ready,
  reason: null | 'setup_required' | 'worker_unavailable' | 'selection_unavailable'
    | 'policy_unavailable' | 'capacity_unavailable' | 'disposed',
  bounds: null | { inputByteLimit, resultByteLimit, maxPrivateReviewers, maxRepairRounds }
}
```

Omission/disabled returns false/false/null/null. Enabled readiness requires the current admitted child, NI2 composer/request gate, actual role selections, accepted shared policies and current lifetime. Readiness grants nothing and does not imply a particular task can be admitted. Detailed provider/environment/persistence/resource disclosures belong in the concrete owner preview. Input/coverage/report failures and disabled/missing dependencies remain visible; the panel must not replace them with success.

NI2 has published those exact prepared-policy route names and agreed the shared per-execution finish seam below. The additive role disclosures/private permits and proposed audit config remain subject to root/independent design freeze; they are not presently accepted installed config keys or implemented capability.

## Schema5 and preserved storage boundary

Increment `SCHEMA_VERSION` to5 for changed persisted action consent and audit execution/result semantics. Existing `runtime_data` and signed `automation_records` suffice; no new table, column, database connection, SQL callback or second authority is required. Add closed signed kinds `audit_input` and `audit_result`; extend the existing execution record by an explicit audit-input discriminator. Existing schema4 execution records retain their interpretation.

For a genuine4→5 migration, validate exact topology, rows, key, crypto2 AAD, signed command/automation envelopes, legacy-receipt boundary, and all bidirectional held/action/worker links before any backup or mutation. Repeat version/journal/topology/key/graph checks under the original migration lock. Preserve a fsynced exclusive `.schema-4.backup`, then change the version transactionally and validate the target before commit. A backup collision fails closed. Supported1/2/3 migration paths retain their source-specific checks and exact backups while reaching5; they must not silently drop state or relabel source fixtures.

Migration leaves existing encrypted bytes, nonce/tag/AAD, raw-ID-to-ref bridge, canonical action digests, grants, expiry, auth/task versions, policies, receipts, tombstones and held reservations unchanged. It creates no input/result proof or actual reviewer ownership for old actions. Existing signed schema4 acknowledgements remain authentic; older schema3 plaintext acknowledgements retain the signed restricted replay boundary and `CRYPTO_LEGACY_RECEIPT_UNVERIFIED`. Unverified legacy encrypted records still reject `CRYPTO_LEGACY_UNVERIFIED`; no resealing or blessing of unverifiable metadata is allowed.

WAL/SHM/header/future/unsupported/corrupt inputs reject before writable SQLite open where required by the current boundary. Keep isolated-copy authentication of supported DELETE hot journals, cleanup of the validation copy, and revalidation under the original lock before business recovery. Wrong keys, tampered associations, migration faults and invalid topology preserve original durable bytes/sidecar presence and recoverable backups. Supported rollback recovery may change a valid source only after validation. No atomic protection against arbitrary external filesystem writers is claimed.

An old schema4 runtime must reject schema5 before mutation. An old action without the new field remains an old advanced/reference action; normal NI3 cannot execute it as an audit input or fabricate missing proof. Acceptance of its existing advanced API behavior is not normal-entry NI3 acceptance.

## Two distinct consent digests

Extend the normalized action with optional, closed `executionInput`, required for every normal NI3 review/repair:

```js
executionInput: {
  recordRef, digest,
  purpose: 'audit_review' | 'audit_repair',
  auditRef, bindingDigest, materialDigest,
  previousReportRef // required only for audit_repair
}
```

All refs/digests are stored SHA256 references, not raw IDs to hash again. `dataDigest` remains the approved artifact digest and `targetDigest` the exact audit binding. The full canonical `actionDigest` additionally covers the input reference/digest/purpose/lineage alongside all current environment/model/tools/permission/resource fields. Preview and grant therefore approve the complete native input and the original material. No field is rehashed or substituted after consent. Ordinary context actions without `executionInput` retain `dataDigest === context.digest`.

Normal review requires kind/role `review`, fresh `executor.mode:'create'`, unique generation and the NI2 preallocated owned session mapping. Repair requires kind/role `repair` and a fresh owned generation/session. Initial NI3 does not resume a prior producer/reviewer session or reuse its conversation context. Repair bindings include the exact failed/unknown prior report and next bounded round; environment and model policies remain independent immutable versions.

## Derived immutable input

Proposed typed core method:

```js
prepareAuditInput(ownerOrCoordinator, {
  taskRef, commandRef, expectedTaskVersion, expectedAuthEpoch,
  auditRef, expectedAuditRevision,
  purpose: 'audit_review' | 'audit_repair', round,
  previousReportRef // repair only
})
// -> {recordRef,digest,byteLength,auditRef,auditRevision,round,
//     bindingDigest,materialDigest,purpose,task, deduplicated}
```

The normal composer supplies a new trusted constructor-only immutable `auditExecutionBounds:{inputByteLimit,resultByteLimit}` to RuntimeStore, after closed config validation. It is not a method payload, callback, RPC capability or second policy store. Direct RuntimeStore constructor callers remain trusted integrations. New audit preparation/capture methods refuse without that bound context. Under their original transaction they apply the private selected limit and existing maxDataBytes before any content/association/receipt commit; signed associations retain the selected limits. Final consume rechecks the current private input limit. Recomposition seals the old lifetime and bindings; changed bounds do not rewrite old ciphertext/association/consent. Existing ordinary and advanced methods keep their existing maxDataBytes behavior.

Inside one transaction, check current task/auth/control, exact current requirement/artifact/semantic revision, authentic configured material and bounded round/report lineage. Build the full deterministic envelope from that authoritative state; no caller-supplied instructions/material/prose/policy proof are accepted. Persist an encrypted `context` plus signed `audit_input` association and receipt atomically. This derived operation advances neither semantic revision nor task version: it introduces no new goal/requirement and must not stale the audit it is preparing. Its authenticated metadata records the observed current source task/auth/semantic versions. New metadata conforms to existing crypto2 AAD; prior records are never rewritten.

The full serialized envelope is `df.audit-input/v1` with purpose, complete scope/task/audit/revision/round/semantic/artifact/binding/material identifiers, explicit policy, canonical-sorted material entries `{recordRef,digest,kind,content}`, the exact previous report for repair (otherwise null), and response contract `df.audit-response/v1`. Every required material byte is included and accounted. Source/material content is untrusted text; it cannot issue tool, grant, cross-task or reviewer-binding commands. Selected byte bounds, UTF-8 well-formedness, registered-secret rejection, current record/command caps and future reconciliation headroom apply before commit. Oversize material refuses as a whole; it is not trimmed or marked covered without delivery to the reviewer.

The normal requirement includes both the exact artifact and a current authenticated protected execution-context envelope prepared through NI2/NI1, plus explicitly selected evidence. That context must match current semantic requirements and retain goal/constraints/current supplements; it is not an optional summary or stale producer self-description. Configure checks the mandatory data association under its CAS. If mandatory material plus selected evidence exceeds the existing16-entry/full-envelope limit, refuse instead of omitting requirements.

Normal composition accepts that context only from its private current-lifetime receipt of an actual protected ContextAssembler/MemoryAdapter preparation, checks its authenticated original command/record/digest/source CAS, and rejects an owner-written context label or native-output label as origin. This receipt permits no action or grant; core current semantic/data/CAS checks remain authoritative. After process/lifetime loss, a new preparation is required for new configure/input operations; old labels are not silently blessed. The signed audit_input records the exact accepted protected-context association when prepared. Already persisted authentic audit_input facts remain inspectable across restart, but cannot recreate process-private session ownership or re-admit unknown execution. This is an explicit NI2 private-composer prerequisite; if NI2's normal prepare path does not expose the actual receipt to that composer, its runtime closure must be extended before NI3 GO.

Identical command replay returns its authenticated historical association without new data or effect; changed normalized content conflicts. A replayed input is not current admission: plan, claim, begin and final consume independently check current immutable associations. Current procedural claims/observations do not change semantic requirements; goal, constraint, clarification, branch, supplement and protected-context changes do and invalidate old requirements/input.

## Fresh private reviewer binding

Replace the one-handle installed reviewer closure with a bounded private factory. A fresh opaque handle is allocated for each admitted review claim/task/audit/round/generation. The factory never exports a handle, principal, report callback or read allowlist through owner RPC, features, model messages or tools.

```js
bindAuditReviewer(host, privateHandle, {
  taskRef, auditRef, claimRef, generationRef, sessionRef
})
```

Under the same store lock, derive binding from the held exact review action, current input association and requirement. Derive permitted reads from the configured exact material plus the one approved input record; no supplied `readRecordRefs` or serialized role can enlarge it. Verify distinct artifact producer/reviewer identity and generation. The normal composer additionally proves the actual separately owned native session and original registry/backend/class identity before exposing private read/audit/report closures. It cannot turn session hashes into native ownership proof.

Reuse of a handle, generation, producer session, unrelated task or stale audit fails closed. At most `maxPrivateReviewers` active closures exist; released/stopped generations are sealed and cannot be rebound. Losing a process-private handle does not release or discard its durable reservation. Reopen reconciles facts without recreating a reviewer, session or send. Dispose/disable/quit seals all new admissions synchronously, then stops only owned native handles and preserves uncertainty.

## Prepare, claim, submit, consume

Forward this existing typed compound binding through `WorkerManager.dispatch`:

```js
dispatch(caller, {
  taskRef, actionRef, actionDigest, commandRef,
  expectedTaskVersion, expectedAuthEpoch, timeoutMs?,
  auditRepair: {auditRef,round,previousReportRef,evidenceRef} // repair only
})
```

Validate and detach/freeze the nested object before any asynchronous preparation. Forward it unchanged into `claimAction`; core commits approval/CAS/expiry/current policies/host permission, weighted budgets/attempts, repair round and prior-report lineage with the claim/reservation. Normal audit-targeted repair cannot take the plain dispatch path. Failure leaves all claim/lineage/charges/outbox/task facts unchanged. No post-claim `recordRepair` substitutes for this atomic path.

After claim, persist submitted intent before native create. Actual create publishes an idle separately owned session, with zero provider streams. Session receipt may attach the exact original mapping without changing the approved digest. Unknown create/receipt/submission stays held and cannot replay. Failure after claim but before native call is reconciled explicitly, not automatically compensated or retried.

```js
beginAuditExecution(host, {
  taskRef, actionRef, actionDigest, claimRef, generationRef,
  inputRecordRef, commandRef, expectedTaskVersion, expectedAuthEpoch
})
// -> {executionRef,taskRef,actionRef,actionDigest,claimRef,generationRef,
//     inputRecordRef,inputDigest,dataDigest,auditRef,bindingDigest,
//     materialDigest,purpose,state,deduplicated}

assertExecutionCurrent(host, {
  taskRef,claimRef,generationRef,actionDigest,executionRef
})
// -> same binding, state:'dispatch_intent', admitted:true only for first consume
```

One immutable execution intent exists per held claim. Final consume branches on the explicit execution kind, authenticates complete input/material/requirement/repair binding, and checks current task semantics/auth/control/grant expiry/generation/session/model-resource policy/native permission under one lock. Intent duplication or state dispatch/unknown/terminal returns `admitted:false`; it never authorizes another wakeup. Any changed binding conflicts.

Native `executeApprovedInput` retains separate `inputDigest` and original `dataDigest`; it verifies the complete authenticated input body against `inputDigest`, not against the artifact digest. Ordinary `executeContext` is unchanged. NI2 asynchronous readiness and native ownership/tool/request checks apply. The private final consume must return matching bindings and `admitted:true` immediately before the exact public send, with no await between consume and send. NI2's later public provider-boundary permit is also required; no title, compaction, retry or extra-step stream is implicitly allowed.

Consume is the dispatch linearization point. A crash or cancellation afterward may leave an uncertain outcome; cancellation does not retract earlier effects. Reopen changes unresolved native execution to unknown and keeps all reservations. Query, refresh, mount, retrying a command and model output cannot resend.

## Actual output, report and artifact verification

Add private native collection and a typed core association:

```js
captureAuditResult(host, {
  taskRef,commandRef,claimRef,generationRef,executionRef,sessionRef,
  inputCursor,cursor,content,evidenceRef
})
// -> {resultRef,recordRef,digest,inputDigest,executionRef,claimRef,
//     generationRef,sessionRef,cursor,state:'captured',deduplicated}

submitAuditResult(reviewer, {taskRef,commandRef,auditRef,executionRef,resultRef})
// -> {report, verification}
```

The normal native collector calls capture only after the original owned native session's committed assistant output is observed beyond the exact execution input cursor. The core recomputes content digest/bytes, validates mapping/monotonic cursor/one immutable result, and atomically stores bounded encrypted output plus signed `audit_result` and receipt. Only that private native bridge supplies content/cursors/evidence. No owner route accepts an output, report, `verified:true`, coverage list or native receipt. Labeling an owner-written record `df.native-result` creates no authority. Idle creation, `whenIdle` and callback success alone provide no result.

The deterministic testing provider must actually return exactly this closed `df.audit-response/v1` JSON value in the reviewer session:

```js
{
  contractVersion: 'df.audit-response/v1',
  bindingDigest, materialDigest, inputDigest,
  verdict: 'passed' | 'failed' | 'unknown' | 'budget_exhausted',
  coverageRefs: [recordRef], unexaminedRefs: [recordRef],
  findings: [{findingRef,severity,code,evidenceRef,resolved}]
}
```

Digest/ref fields are lowercase64-hex strings. Coverage and unexamined arrays are distinct, each maximum16, together a disjoint complete partition of the exact configured/delivered material. Findings maximum16 have distinct findingRefs; severity is fatal/blocking/warning/info, code is scope_violation/permission_bypass/secret_exposure/artifact_mismatch/coverage_gap/review_failure/other, evidenceRef is64-hex and resolved is a literal boolean. No extra keys, reportRef/actor/scope/command/permission/grant/action/tool/send fields, prose, non-JSON values or schema repair are allowed. Internal report fields are derived from authoritative bindings; evidence refs are references to captured output, not permission proof. An empty findings array is valid but does not compensate for missing coverage. The bridge parses the captured bytes without fallback prose or markdown repair; output size/Unicode/secret/schema failure leaves the required audit pending/blocked with a factual failed-attempt diagnostic, not an invented pass or fabricated model report.

NI2's currently proposed testing model `df-testing-worker-v1` emits fixed plaintext and cannot satisfy this response contract. NI3 requires a separately frozen source-owned testing-provider extension advertising proposed `df-testing-review-v1` and `df-testing-repair-v1` through the same original active adapter. Review must actually parse the delivered audit-input and return the above bounded JSON from that input; repair returns a bounded synthetic changed/evidence artifact through its exact repair input. Deterministic positive/failure/unknown fixtures belong in source tests, not a Config output/report/permission field. Actual selected model/registration, lazy request permit and source-known zero-cost facts must be resolved; a model name does not establish them. Root must assign this shared provider-file extension without conflicting with the NI2 author. It is an implementation dependency, not present model availability or semantic review quality proof.

Submit authenticates the result/input/execution, exact private reviewer claim/generation/session, current requirement/artifact/semantic material and independence. The coverage partition must equal delivered configured material. It derives report fields from the captured response; caller flags cannot certify coverage. Report and artifact-verification associations commit together in one transaction with independently reserved record/command capacity. They remain distinct records: report binds the whole requirement/material; verification binds the exact artifact/version/digest and captured result. A current fully covered passed report with no fatal/configured-blocking finding yields accepted verification; failed/blocking yields rejected; incomplete/unknown/budget-exhausted yields unknown. No output assertion can clear a prior immutable same-round failure or bypass a configured severity; `resolved:true` does not remove a fatal finding.

For actions carrying `executionInput`, direct report/verify entry points must require this result association or fail `AUDIT_RESULT_REQUIRED`; normal callers cannot take the old advanced result-free route. Old schema4 advanced actions remain explicitly separated. Artifact change, semantic revision, revoke/pause/cancel, foreign generation, stale mapping/result or newer requirement prevents late certification. A late actual output may be stored as a reconciliation fact without changing the gate or granting new authority. Output evidence does not prove semantic review quality; that remains a separate acceptance obligation.

## Reservation sequence with one active worker

Preserve NI2's initial one-active policy; NI3 does not increase it silently. The sequence is producer capture → exact owned stop and known effect settlement → released producer reservation → separately granted review claim → actual review input/output → current report and verification while review claim is held → owned stop and settlement → released review reservation → separately approved repair claim, if allowed → captured repair output/stop/settlement → explicit requirement rebind and fresh charged re-review. A fresh task/round uses a fresh private reviewer and native session.

NI2 has agreed to expose a shared owner-requested `finishExecution` lifecycle operation, through the normal `workerFinish` wrapper:

```js
finishExecution(caller, {
  taskRef,actionRef,claimRef,generationRef,executionRef,commandRef,
  expectedTaskVersion,expectedAuthEpoch
})
// -> {claimRef,reservationHeld,terminalEvidenceRef?,releaseEvidenceRef?,task}
```

The private adapter derives exact captured output/native effect facts and real owned stop evidence; the host calls existing trusted settlement. JSON cannot supply outcome, terminal proof, usage, permission or evidence. The known safe-effect proof is limited to the current source-owned deterministic provider, empty tools, exact committed response and no outstanding message/delivery/handoff obligations. Unknown output/stop/usage/effects remain unknown as appropriate; no terminal-label inference or idle release. Stop and settlement remain separate durable operations, with fault cuts between them; final release is the existing atomic ledger decision. Failed/unknown review output can remain held and block repair until exact reconciliation. Producer/reviewer action completion does not complete the task.

No automatic mutual reviewer invocation or repair occurs. An owner explicitly selects the next allowed action; maximum rounds/total attempts/budgets apply before adapter effect. Repair may change evidence rather than artifact bytes; explicit rebind can preserve identical bytes with a new current requirement/round, while immutable prior reports remain. Exhaustion escalates to owner and leaves required work blocked. Task completion still passes the current audit gate and requires no held obligations.

## Normal owner routes and UI

Use the original admitted operator bridge and lifetime, not public owner handles or supplied scope. Preserve configureAudit/audit/preview/grant/query/revoke/control and NI2 worker/session navigation. Proposed narrow operations are `prepareAuditInput`, `planAuditAction`, `dispatchAudit`, `executeAudit`, `collectAuditResult`, `finishExecution`. Each accepts only task/audit/action/input/claim refs and relevant CAS/command fields; normal plan derives the complete spec from the captured input, selected verified NI2 role facts and accepted shared policy. It does not accept a full caller-written spec/model digest/role/proof. Dispatch repair derives/forwards the exact immutable stored lineage; result collection invokes only the private native collector and reviewer submit closure.

The panel shows separate required audit state, current artifact/material/input versions, reviewer generation/session, exact role/model/context/transcript/resource/expiry preview, coverage/unexamined/finding severity, repair count/budget and outstanding holdings. Explicit buttons separate configure, prepare/plan, preview/grant, idle dispatch, execute, collect report, finish and repair/rebind. Opening/navigation/refresh does none of these. Pending/failed/stale/unknown/budget-exhausted/disposed states are visible and cannot present a completion/release checkmark. Disabled/readiness unavailable does not waive an existing task gate. Owner choices concern models, resources, severity/rounds and data/transcript bounds; current catalog/ownership/result/readiness facts are product responsibilities.

Proposed closed normal operation payloads (original admitted operator context supplies identity):

```js
configureAudit: {taskRef,commandRef,expectedTaskVersion,expectedAuthEpoch,
  auditRef,expectedAuditRevision,artifactRef,artifactVersion,digest,
  contextRecordRef,material} // normal composer adds accepted policy, mandatory context
prepareAuditInput: {taskRef,commandRef,expectedTaskVersion,expectedAuthEpoch,
  auditRef,expectedAuditRevision,purpose,round,previousReportRef?}
planAuditAction: {taskRef,commandRef,expectedTaskVersion,expectedAuthEpoch,
  auditRef,inputRecordRef,purpose}
dispatchAudit: {taskRef,actionRef,actionDigest,commandRef,
  expectedTaskVersion,expectedAuthEpoch,timeoutMs?}
executeAudit: {taskRef,actionRef,actionDigest,claimRef,generationRef,
  inputRecordRef,commandRef,expectedTaskVersion,expectedAuthEpoch,timeoutMs?}
collectAuditResult: {taskRef,actionRef,claimRef,generationRef,executionRef,
  commandRef,expectedTaskVersion,expectedAuthEpoch}
workerFinish: {taskRef,actionRef,claimRef,generationRef,executionRef,
  commandRef,expectedTaskVersion,expectedAuthEpoch}
```

Normal plan derives fresh action/generation/session refs and the full spec; dispatch derives stored repair lineage; collect derives actual native result/cursors and private reviewer identity. Child capture/submit command refs derive deterministically from the one outer command and phase, preserving full-input conflicts and avoiding a second command authority. `configureAudit` material uses the existing exact `{recordRef,digest}` entries and includes the mandatory artifact/context. Core API remains the broader trusted-integration interface; normal routes never expose its owner handle, generic report/verify or arbitrary policy/spec writes. Feature and route naming must align with NI2 root composition before GO.

## Required independent design and bounded oracles

| Source criterion | Required NI3 evidence before acceptance |
| --- | --- |
| BUB015-01 | Two tasks and repeated rounds deliver exact full material to distinct native reviewer inputs; unlisted/foreign data is inaccessible; actual parsed coverage/unexamined facts retain original record digests. Oversize/secret input refuses without truncation. |
| BUB015-02 | Producer/reviewer handles, generations, native sessions, actions and charged claims are separately attributable. No same-author/self-sign satisfies development review; runtime evidence is not the blocked independent CODE verdict. |
| BUB015-03 | Actual failed/unknown/budget/incomplete/fatal/configured-blocking response prevents task completion; material/task semantic mutation stales reports. Idle/session creation cannot report/verify. Current result and verification association survive reopen. |
| BUB015-04; BUB012 | Compound repair claim versus last slot/revoke races across processes; round0/N/N+1, total attempts and weighted review/repair/time/usage admissions; refusal has zero claim/charge/submission/native effect. One-active producer/review/repair release sequence tested with crash cuts. |
| BUB015-05; BUB006 | Malicious output/material requesting grants, cross-task reads or sends cannot enlarge private capabilities; forged output labels/coverage/results reject. Cancellation/expiry/policy drift at preparation, creation, final consume and later NI2 provider boundary block new effect. |

Add genuine schema4 migration fixtures containing authenticated data, grants, tombstones, signed and restricted legacy receipts and unknown held claims. Test wrong key/metadata/result/input/receipt mutation, backup collision, source/target faults and real DELETE hot-journal abrupt exits with exact-byte preservation or supported recovery. Two real processes racing final consume must have one admitted receipt and zero duplicate stream. Unknown/reopen/quit/duplicate produces no retry.

Physical package evidence must use bare `dsh-fishball/installed`, the original public Loader/profile/operator authentication and separately owned JSONL sessions. Source-owned deterministic native provider returns actual bounded review JSON after explicit approved input: idle0streams, one permitted stream per execution, repeat0additional streams, actual input/result/coverage provenance, independent reviewer session, lineage-bound repair and stop/restart uncertainty. No real inference/tool body/network/account/external recipient is authorized. Source/behavior hash manifests and authored plus separate ISTQB results must freeze before reporting a checkpoint.

NI2 config/composer/private policy/previews/provider gate/finish lifecycle, current protected-context origin and the NI3 deterministic provider extension plus root design freeze are concrete dependencies. CODE/browser/model-quality/full-ticket/MVP/publication acceptance remain HOLD; counts or synthetic examples cannot close them.
