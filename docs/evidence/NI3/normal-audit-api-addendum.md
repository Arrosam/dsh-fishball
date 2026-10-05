# NI3 normal audit installer and typed API refinement

Status: **Revised AUTHOR HOLD for root and separate independent binding; no installer GO.** The first AUTHOR HOLD is preserved verbatim in [normal-audit-api-addendum.1ca02630.md](normal-audit-api-addendum.1ca02630.md), SHA256 `1ca026309fcff9dc5fa74ce0ca29b80027ec610c7f23d64cee6391052c378d06`. Root selected the optional private audit-preview read branch and bounded original-owned-execution replay clarification below. This note grants no executable-source lease or acceptance. The earlier author candidate had SHA256 `fcaca0f186b2f9234c676b47eccd026352f111abe1fcf9686f02d737428920d0`; its read history remains retained. The [held contract](../../normal-runtime-audit-contract.md) remains byte-identical at `9e806aaf1c224581d43ae54fffe6775e18d58400c20fcc42814b844859a1c012`; its [freeze](contract-freeze.md) and [independent design](test-design.md), SHA256 `f3e4f79e761310ed98f568bf14843c01448fcba4b22cabfa543acfa7a94d354f`, remain authoritative. All82 original criteria and5 current contract criteria remain retained.

At this lane's initial read, isolated `.runtime/ni3-core-candidate/source-hold.json` was hash-matched to `326bb09a6939bfea12755358e1cb284529fa7d4650ff7e4bdb97939b7470e995`; every candidate file matched it. That historical checkpoint describes schema5 source and syntax checks only, with zero product imports, database opens or executed tests. Root subsequently promoted the exact core to genuine schema5 after releasing the schema4 leases; [promotion preflight](source5-promotion-preflight.json) preserves that source transition. Root reports the first authored core run13/13 PASS. Those are later core-lane facts, not tests performed by this documentation lane or normal/native acceptance. This lane imported no candidate/product and opened no database or executed test.

## Source observations and remaining implementation work

The read source pins were:

| Source | SHA256 |
| --- | --- |
| `src/installed-worker.mjs` | `8ad5aa8d081ff51d9d09bf496a79cb78a5adb4eba178ed0bb6b5d8a2f8a4db4f` |
| `src/worker.mjs` | `55b93114668db772c887b08928bbbb312f1a3d236524b2375791ae6da958b653` |
| `src/native-adapter.mjs` | `caba6d841cc4db6825e5b5aebce95c7b83dab3a501a6602bfea91efb00b7c49e` |
| `src/installed-worker-facts.mjs` | `22cb737371b43575a81eaf5281027a0cfae5c90b7fdbb89895d501f5dabc18b8` |
| NI2 `manager-invocation-source-clarification.md` proposal | `5f1dabb6c93f3d770f6e60c76c7882144d07659ee11ef08fe3530a4ff15a0b9d` |
| isolated candidate `src/runtime-store.mjs` | `5825291007bf33e52797257aaefd7fa8156cea8209001416788c34682f5319e5` |
| current ordinary `src/approval-preview.mjs` | `921d8946bd76c76f08fd6a21dbd73254c75716abcb86d6d2aadd33694ab3aa30` |

Current NI2 owns a process-private preparation receipt map, producer-capture map, original-service facts, explicit confirmed policy and exact request carriers. Current `executeContext` requires `context.digest === action.spec.dataDigest`; it cannot execute an audit whose dataDigest remains the artifact digest. Current WorkerManager has no audit-input branch, compound repair dispatch forwarding, reviewer-result collection or audit finish association. Its normal producer capture writes an actual `df.native-result/v1` artifact; that header alone is not origin.

The read core, now promoted, implements `prepareAuditInput`, `bindAuditReviewer`, `beginAuditExecution`, `captureAuditResult` and `submitAuditResult`. At initial inspection its authenticated input validator was private and snapshot exposed requirements/executions, not authenticated audit-input associations. Root subsequently authorized and held the exact historical `readAuditInput` addition below in [read-input-root-hold.md](read-input-root-hold.md): RuntimeStore SHA256 `694b98fbf41090f0278e1421c3b324a236a0f0fcf11d94ff2d685e54d8f2b648`, source hold `1b140e452bc48c470b9005664be8254ed2d4388e69d9817eb6353c9a21e06046`. Its four new read and six affected migration/process families passed10/10 in the core author lane; this documentation lane only read source/evidence and ran no product test. That read creates no current execution/native origin. The separately held source-local review/repair provider extension, NI2 role/policy/request integration, independent genuine schema5 migration evidence and original host binding remain prerequisites. Typed fixture callbacks prove module behavior only.

NI2 runtime/bridge guard source has subsequently changed under the separately authorized source-only lease described in [manager-guard-source-draft.md](../NI2/manager-guard-source-draft.md). These changes are documented preparation, not current tested NI2 source, schema5 consumer proof or native acceptance. The earlier source pins remain historical observations; this addendum neither re-holds nor edits that lane. Ordinary ApprovalPreview currently compares approved record/content digest to spec.dataDigest; an audit input with a distinct artifact dataDigest would always refuse. The new private opt-in branch below is required implementation work.

## Closed factory, installer and root composition

Future exclusive module: `src/installed-audit.mjs`; authored module tests: `test/installed-audit.test.mjs`. It exports `validateInstalledAudit` and `createInstalledAudit`. No helper source or shared-file edit is implied by this note.

`validateInstalledAudit(selection)` applies the exact optional `audit` selection from the held contract. Omission and `{enabled:false}` detach to exactly `{enabled:false}`. Enabled selection requires all held role selections, charges, byte limits, severity list, repair/attempt limits and reviewer capacity. Zero rounds forbids repair selection; positive rounds require it. Structural maximum32 and explicit selected lower capacity both apply. No role/model/resource/round/severity default is supplied. Reject Proxy through supported node:util types.isProxy before reflection; inspect only inert own data descriptors for other objects. Accessor, inherited, hidden, symbol, callback, handle or extra-field config refuses before invoking getters, coercion or source activity.

`createInstalledAudit({selection,identity,profile,worker})` takes closed root-owned validated constructor inputs: identity exactly `{ownerId,workspaceId}`, profile exactly `{dir,name}`, worker the detached NI2 selection. Enabled audit requires enabled worker composition; omitted/exact disabled audit also accepts the ordinary disabled NI2 worker and stays inert. Disabled code must not dereference absent worker role/charges/bounds/TTL or require enabled-worker facts. These inputs are private installation composition, not RPC. A disabled audit returns a named inert `installedAuditInstaller`; no boot preparation, policy, session, provider resolution or inference occurs. The installer receives exactly:

```js
{ctx, snapshotOwner, readOwnerData, currentPolicy, planOwnerAction,
 prepareOwnerPreview, grantOwnerPreview,
 readProtectedContextFacts, readCapturedProducerFacts, readAuditActionFacts,
 readAuditInput,
 configureOwnerAudit, prepareOwnerAuditInput,
 assertNativeRequestCurrent, composeNativeAudit,
 subscribeRuntimeReceipts, isAlive}
```

Root supplies bound original methods; no serialized function can become a capability. `ctx` is the original admitted child Context after original HostConnectionService/OperatorPeer and public source/class checks. Original owner/host/store handles remain inside root closures. The installer returns exactly `{hostPermission,previewResolver,previewTtlMs,operations,status,dispose}`. Enabled preview TTL is the explicitly selected NI2 value; disabled previewTtlMs is exactly null and root excludes that inactive contribution from preview composition, rather than selecting a TTL default. Disabled status uses the held `{enabled:false,ready:false,reason:null,bounds:null}`; its operations/resolver refuse bounded `AUDIT_DISABLED`, permission is literalfalse, and it performs zero data/policy/report/artifact/claim/native reads or writes. Preserve one private receipt-lifecycle registration and its disposer even while disabled, including the default disabled-worker case.

Root owns the single actual receipt publisher and fans it to named installed contributions. Listener receives immutable actual `{operation,input,receipt}` from the original successful method before its response. Extend its union only for configured audit preparation/planning/preview/grant, actual audit dispatch/execution/capture/submission and factual finish. Listeners are observers; they cannot authorize, replay or undo a committed transaction. Failure seals admission and returns uncertainty. No public emitter or second store/queue exists.

The root composite matcher selects exactly one of producer, audit-review, audit-repair or local-publication targets. Zero or overlapping matches deny. NI3 accepts only its private source-planned full spec with `executionInput`, kind/role review or repair and exact current requirement/input binding; ordinary worker/context and NI5 delivery targets are disjoint. Neither config-enabled nor `role:'review'` supplied by an owner is a matcher. Root later wires the named contribution and normal panel; a standalone module is not installed acceptance.

## Private source projections

The following callbacks take closed ref-only objects, recheck original source/lifetime/scope, and return detached immutable facts. They accept no owner proof or result content.

`readAuditActionFacts({taskRef,purpose})`, private purpose exactly review or repair derived from authenticated association purpose audit_review or audit_repair, returns exactly:

```js
{configurationRef,nativeSourceRef,resourcePolicyVersion,modelPolicyVersion,
 presetRef,modelRef,reasoningRef,catalogEvidenceRef,environmentRef,
 bindingDigest,toolsDigest,permissionPolicyDigest,effectiveReasoningEffort,
 accounting,pricing,costProvenanceRef}
```

This projection is supplied by the future NI2/root role composition from actual current original catalog/preset/environment/provider facts and its private explicitly confirmed expanded shared-policy receipt. Original core currentPolicy alone cannot establish installed acceptance. Producer acceptance with maxTotalAttempts1 cannot admit review/repair or silently expand model policy. Version fields are positive safe integers; all Ref/Digest fields are lowercase64-hex except costProvenanceRef is null when unknown. effectiveReasoningEffort is explicit null or the actual selected advertised bounded native value; accounting is the actual source-owned accounting identifier or null. pricing is source_zero or unknown; only authentic current source_zero has non-null costProvenanceRef. Unknown pricing refuses COST_UNKNOWN before plan/admission. The callback returns no service/handle/principal/permit/current:true flag. Selected role choices and charges remain constructor choices, compared against this actual role resolution. Locked original core admission and independently captured native request gates still check current policies and source. A typed mock projection is not original provider/service proof.

`readProtectedContextFacts({taskRef,contextRecordRef})` returns exactly:

```js
{recordRef,digest,kind:'context',byteLength,cryptoVersion:2,
 originSourceRef,sourceTaskVersion,sourceAuthEpoch,
 memory:{namespaceRef,revision},
 taskRef,taskVersion,authEpoch,semanticRevision,
 configurationRef,nativeSourceRef}
```

Origin is the actual NI2 preparation receipt in the current installation lifetime, checked against original authenticated permitted data, complete content digest, ContextAssembler validation, original command/record and memory binding. `originSourceRef` is the preparation record source; `nativeSourceRef` is the current original native-service/lifetime association. Task/semantic/currentness come from the original store, never body labels. No auditInputRef may be admitted as a prepared producer context. Procedural claim/grant CAS does not by itself change semantic currentness; fresh owner route CAS is still required separately. Reconfiguration, semantic/context change, replacement preparation or lost lifetime invalidates new use. Prefix/version/JSON/header/digest equality alone is insufficient.

`readCapturedProducerFacts({taskRef,artifactRef,artifactVersion,digest})` returns exactly:

```js
{taskRef,artifactRef,artifactVersion,recordRef,digest,producerClaimRef,
 generationRef,sessionRef,executionRef,inputDigest,cursor,resultDigest,
 configurationRef,nativeSourceRef}
```

Derive this from the actual private original capture input/receipt, current exact artifact/data association and original owned native result validation. Verify the persisted approved user input and later assistant output, original session/options/provider gates, byte/digest limits and producer mapping. The receipt map is process-private origin, not a database. Missing current-lifetime capture origin refuses normal configuration; cold JSON is not adopted. Factual historical artifacts remain readable. Usage is obtained separately by original native finish and is not invented by this projection. A repair-created artifact uses the equivalent privately recorded actual repair collector association; it never inherits producer provenance merely by writing the same envelope.

Separately implemented/held historical typed core read, to be bound privately by root during normal integration:

```js
RuntimeStore.readAuditInput(host,{taskRef,inputRecordRef})
// -> {association,data}
```

`association` is the exact authenticated existing `df.audit-input-association/v1` object:

```js
{contractVersion,ownerRef,workspaceRef,taskRef,auditRef,auditRevision,round,
 purpose,recordRef,digest,byteLength,bindingDigest,materialDigest,
 artifactRef,artifactVersion,artifactDigest,semanticRevision,
 sourceTaskVersion,sourceAuthEpoch,contextRecordRef,contextDigest,
 previousReportRef,material:[{recordRef,digest}],
 inputByteLimit,resultByteLimit,createdAt}
```

`data` is the original permitted readData projection for that exact record, with encrypted-context metadata plus content; its kind is context and authenticated auditInputRef equals recordRef. Core calls its original authenticated input validator under the existing lock: signed association, crypto2, original body/digest/material/context/report/scope and forward/inverse associations must all agree. Scope mismatch refuses; corruption remains an error, never missing/provenance-null. This historical read authorizes no execution. Current requirement/control/policy/CAS checks repeat when planning, claiming and consuming. No generic raw-data read or parsed envelope substitutes for this typed association. All refs/digests are stored lowercase64-hex, not raw IDs to hash again; authenticated input material2..16 includes distinct artifact/context. Positive safe integers apply to auditRevision/artifactVersion/semanticRevision/sourceTaskVersion; sourceAuthEpoch/createdAt are nonnegative safe integers; round0..8 and purpose audit_review|audit_repair are closed. Review previousReportRef is exactly null; repair requires the original ref. Byte limits1..65536 and positive byteLength additionally obey original store bounds.

## Closed normal operations and literal core mapping

Each owner operation receives only its closed input plus private second argument exactly `{assertCurrent}`. Enter the existing exact-child-Context invocation carrier. Validate/detach inputs before source callbacks; check the captured carrier before every original typed mutation, after every await on success and caught failure, and again at lazy outer/inner native-provider gates. Retain the first stable transport denial. An aborted owner call cannot borrow a background observation carrier or a later request.

The normal operation payloads in the held contract remain unchanged. This note additionally names `auditPreview` and `auditGrant` using the corresponding NI2 closed preview/grant fields; they disclose and approve the actual audit input rather than a producer context:

```js
auditPreview:{taskRef,actionRef,actionDigest,recordRef,
 expectedTaskVersion,expectedAuthEpoch}
auditGrant:{taskRef,actionRef,actionDigest,commandRef,
 expectedTaskVersion,expectedAuthEpoch,expiresAt,previewRef,accept:true}
```

Root selects the normal `configureAudit` branch when this installer is present; raw advanced policy/spec/report/verify writes cannot bypass this branch for a normal audit action. Existing advanced semantics remain available only through their unchanged separately trusted integration. Normal `workerFinish` is routed by the exact original action to producer or audit finish; it does not acquire a second generic settlement path.

### Private audit-input ApprovalPreview branch

The exact additive constructor signature is:

```js
new ApprovalPreview({store,ownerHandle,resolve,ttlMs,clock,isAlive,
 knownSecrets,readAuditInput})
// optional readAuditInput({taskRef,inputRecordRef}) -> {association,data}
```

All existing arguments/default behavior stay unchanged; this introduces no audit-mode config/RPC field. If supplied, readAuditInput must be a synchronous private function bound by root to original `RuntimeStore.readAuditInput(host,...)`. It receives exactly the two closed refs and returns the authenticated projection defined above. Native Promise, Proxy, thenable/extra/accessor/nonplain/descriptor-unsafe pair refuses PREVIEW_UNAVAILABLE without invoking a trap/getter/then/coercion. Inspect safe own inert descriptors only after types.isProxy/types.isPromise rejection. Callback failure remains bounded unavailability or current transport denial; reflecting an error can never confer origin or permission.

Only an exact authenticated stored `spec.executionInput` plus this private constructor callback selects the audit branch. An audit spec without the callback refuses; an ordinary spec ignores the callback and follows its unchanged record/content equals spec.dataDigest recipe. Owner prefixes, kind=context, audit labels, model/role flags or a native-looking body do not select this branch.

For auditPreview, require `input.recordRef === spec.executionInput.recordRef === association.recordRef === data.recordRef`, `association.digest === data.digest === spec.executionInput.digest === hash(data.content)`, context kind, exact byteLength/UTF8/secret/input bounds and original authenticated auditInputRef. Compare purpose/audit/binding/material/previous-report equality against the full executionInput, `association.artifactDigest === spec.dataDigest` and `association.bindingDigest === spec.targetDigest`. Review previousReportRef is null in association and absent from executionInput; repair has the same required prior report ref. Validate the entire exact association and permitted data object; never check a subset payload hash or relabel inputDigest as artifact dataDigest.

Retain `canonicalDigest({association,data})` as the private displayed-pair identity. Re-read/validate the whole pair before resolver wait, after resolver wait, at grant entry, after its resolver wait and at the final synchronous grant mutation boundary. Compare complete immutable pair, full stored spec/actionDigest, current CAS/control, actual original policy and private planned resolver labels. Current snapshot requirement revision/round/semantic/material/binding/prior report and exact current artifactRef/version/digest must still match; procedural CAS alone does not change semantic identity, but requested current task/auth CAS remains mandatory for new grant. Core admission remains the final locked authority over grant/policies/input/material/limits. No await separates the last synchronous checks/current invocation assertion from original grantAction.

Existing description.data is unchanged: `{recordRef,digest,kind,content}` displays every approved audit input byte, with digest equal to inputDigest. Original actionDigest and artifact spec.dataDigest remain untouched. Preview's private cache adds the full pair identity; it issues no reviewer/session/claim and is lost on disposal/restart. Original ordinary previews, token capacity/expiry, grant receipt, no-claim check, secret limits and advanced absent-callback behavior retain their meanings. This opt-in preview implementation is a separately leased shared-file prerequisite; the constructor refinement is not current source capability.

Audit preview additionally preflights the complete successful wire envelope before publishing/caching its private token: `Buffer.byteLength(JSON.stringify({ok:true,value:preview}),'utf8') <= 65536`. Use the actual closed immutable preview candidate, including full approved description.data content, refs/CAS/expiry, model/environment/tool/limit/evidence labels and JSON escaping. Input byteLength alone cannot prove the response fits. Overflow or serialization refusal yields existing bounded PREVIEW_UNAVAILABLE, zero new private cache entries/returned token/grant permit and no truncation, alternate mode or selected default. Pending capacity is released normally. An ephemeral candidate identifier confers no token capability before cache publication. The ordinary advanced preview branch is unchanged. Retain legal complete-envelope N−1/N/N+1 partitions with N=65536, including escaping-heavy and multibyte material plus labels; assert inclusive N succeeds and N+1 has no new token or grant.

### Immutable outer collect and original phase receipts

Child hashes alone do not enforce the outer command identity. Before any collector await or child effect, the installed composer retains a detached immutable outer record for the exact privately owned execution. The lookup key is trusted `{ownerRef,workspaceRef,taskRef,operation:'collectAuditResult',commandRef}`; normalize/validate the entire owner input before any field access. Bind its full canonical outer digest, exact original action/claim/generation/session/execution/input/purpose and phase selection. `operationRef` is exactly:

```js
canonicalDigest(['df.installed-audit.collect-operation/v1',
 {ownerRef,workspaceRef,taskRef},normalizedCompleteOuterInput])
```

It is an identifier, never a capability. Root-selected private `composeNativeAudit.collectAuditResult` accepts the unchanged closed public input plus a second source-owned argument exactly `{operationRef,artifactTarget}`. Review artifactTarget is null. Repair artifactTarget is exactly `{artifactRef:association.artifactRef,version:association.artifactVersion+1}`, selected once from the authentic input before child effects. The native closure revalidates exact owned action/execution/input and this fixed target; no owner chooses it, and no current-latest version replaces it.

Ordering is strict: current original transport/lifetime/scope and safe normalized input; immutable outer lookup; same key/different complete input -> IDEMPOTENCY_CONFLICT before fresh CAS, collector or child hash; exact already completed outer -> original privately captured phase receipts with zero new source mutations/native streams, before checking fresh task CAS. This preserves replay after a successful artifact write advanced task version. A busy exact outer refuses AUDIT_COLLECT_BUSY with no second collector. Only a genuinely new or incomplete phase proceeds through fresh source/current CAS/policy/control/required binding checks.

New outer bookkeeping is bounded: at most selected audit.maxTotalAttempts owned-execution collection entries per installation lifetime and at most that selected value outer commands per owned execution, each structurally at most32. Reserve the execution-entry capacity before its dispatch claim/native create, so already-admitted execution has a retained collection slot before any model effect. These are private retention ceilings derived from an explicit existing selection, not expanded durable attempts or a production default. Capacity refuses AUDIT_COLLECT_CAPACITY before new admission or a new child effect; known exact historical lookup remains available. Entries/immutable phase choices are not evicted, timed out into absence or adopted from database/body labels. Cold/lost/replaced lifetime refuses AUDIT_COLLECTION_UNAVAILABLE for normal collection/reconciliation; factual core history remains separately readable and reservations stay held. Neither a private entry nor capacity refusal releases a claim.

Each entry retains the original selected phase sequence (review capture→submit; repair capture→artifact), fixed artifact target, actual original capture/submit/artifact receipts and any original pending child command/input before invoking that phase. The same original typed-call/receipt fanout records source provenance; callback success/echo/header/record equality alone does not populate a completed receipt. Retain uncertainty if that original receipt is unavailable. New source-native collection calls must not resend an input; one actual capture/output remains bound to its original execution.

The execution-level repair record distinguishes capture-only (actual signed capture, no artifact phase attempted), write-uncertain (original immutable write intent, no authenticated return) and written (actual original write receipt). Later outer commands join this retained execution record; they cannot choose an additional artifact. Written returns the original actual selected-version receipt as history, even if the task's current artifact is newer; it does not call writeArtifact. Query/refresh/navigation performs zero phase writes. Same outer replay returns only its retained original receipts; stale incomplete phases return stale/unknown instead of pretending completion.

An explicit later owner collect/reconciliation may associate a still-unwritten selected version only after original mapping/source/current CAS checks; preserve the selected artifactRef/version and source output. For write-uncertain, first recover the original exact child receipt from the retained actual receipt fanout or by an explicit invocation of the retained original idempotent writeArtifact command/input through the guarded original store. Core authenticates the old command before its current CAS. If already committed, it returns that genuine old receipt with zero additional artifact version. If absent, that exact command can write only its still-current selected version under original CAS and current source admission; stale/conflict/refusal without an authentic receipt remains uncertain. A missing original receipt cannot be replaced by an invented successful observation or a newly selected latest version. No automatic typed-call retry occurs, and no model/external effect is retried by this local explicit reconciliation.

Capture-only with no attempted write can use the new explicit outer/current CAS to form its first artifact child command, while retaining the original artifact target/source. A fresh outer command cannot discard a write-uncertain intent and invent a different child write. The source-owned native closure retains/validates the same phase-intent facts before its original typed calls; this is private bounded bookkeeping inside the original execution composition, not another durable/schema authority. Actual node/store/native implementation and independent phase-loss oracles remain required.

| Normal operation | Private source and exact original typed method |
| --- | --- |
| `configureAudit` | Require exact current captured producer/repair artifact and current protected-context facts; require material entries include those exact record/digests. Add only source-derived policyRef, explicit configured blockingSeverities/maxRepairRounds. Invoke original `configureAudit(owner,{taskRef,commandRef,expectedTaskVersion,expectedAuthEpoch,auditRef,expectedAuditRevision,artifactRef,artifactVersion,digest,contextRecordRef,material,policyRef,blockingSeverities,maxRepairRounds})`. Return the actual requirement including current task; no owner/model verdict. |
| `prepareAuditInput` | Recheck original preparation/capture facts and current requirement; invoke `prepareAuditInput(owner,input)` with the held exact ref/CAS/purpose/round/previousReportRef shape. Return its actual `{recordRef,digest,byteLength,auditRef,auditRevision,round,bindingDigest,materialDigest,purpose,task,deduplicated}`. The original transaction builds/encrypts every material byte and authenticates auditInputRef; no task/semantic CAS advance. |
| `planAuditAction` | Read the authenticated input association, current requirement and accepted shared policy; resolve actual selected role catalog/preset/model/source/environment. Derive the full spec below and invoke original `planAction(owner,{taskRef,commandRef,expectedTaskVersion,expectedAuthEpoch,spec})`. No caller spec, role, environment or model policy. |
| `auditPreview` / `auditGrant` | Require the original private planned spec and exact inputRecordRef; existing source-bound preview resolver discloses complete input/material/artifact/role/limits/persistence. Grant requires explicit literal accept and selected expiry bound; original grant receipt must match the actual current planned digest and private preview. Generic JSON approval does not install native permission. |
| `dispatchAudit` | Derive purpose/lineage from authenticated stored input. Pass detached `auditRepair:{auditRef,round,previousReportRef,evidenceRef}` only for repair into the original manager's compound claimAction transaction. Review has no repair member. Persist submitted intent before one original idle create; no provider stream. Bind a new private reviewer only for review after exact owned native session exists. Unknown claim/create/ack holds; never replay. |
| `executeAudit` | Bind exact private owned ticket and authenticated input; call original `beginAuditExecution(host,{taskRef,actionRef,actionDigest,claimRef,generationRef,inputRecordRef,commandRef,expectedTaskVersion,expectedAuthEpoch})`. Native `executeApprovedInput` validates inputDigest separately from original artifact dataDigest; consuming original assertExecutionCurrent must match and return admitted:true. No await separates consume and original Agent.send; later provider iteration also rechecks the captured current carrier and exact request. |
| `collectAuditResult` | Original collector alone supplies task/claim/gen/exec/session/inputCursor/cursor/content/evidence to `captureAuditResult(host,...)`. For review, the bound private fresh reviewer calls `submitAuditResult(reviewer,{taskRef,commandRef,auditRef,executionRef,resultRef})`; return actual distinct report/verification. For repair, capture factual signed output then associate an actual new artifact as specified below; never call review submission. No owner content/resultRef/cursor/verdict/coverage/usage/evidence. |
| `workerFinish` | Route only to this exact owned audit execution. Seal its one-use provider permit, validate original persisted output and actual usage, stop/drain the original session, then guarded original settleAction with source-derived outcome/evidence/actual usage. Public input remains refs/CAS only. Known stopped is separate from task completed; unknown/no output/no actual usage prevents optimistic release. |

Use exactly these three finite child command phase tags:

```js
'df.installed-audit.capture/v1'
'df.installed-audit.submit/v1'
'df.installed-audit.repair-artifact/v1'
```

For each phase, childCommandRef is `canonicalDigest([phaseTag,outerCommandRef,{binding,phaseInput}])`. No dynamic tag, raw identifier concatenation, phase alias or extra command authority exists. `binding` is exactly the following complete detached immutable binding, derived from original authenticated input/action/execution and the validated outer collect operation:

```js
{ownerRef,workspaceRef,taskRef,auditRef,auditRevision,round,semanticRevision,
 bindingDigest,materialDigest,artifactRef,artifactVersion,artifactDigest,
 inputRecordRef,inputDigest,purpose,actionRef,actionDigest,claimRef,
 generationRef,sessionRef,executionRef,outerInput}
```

`outerInput` is the entire held closed collectAuditResult input, including commandRef and expected task/auth CAS. The distinct `phaseInput` objects are exactly:

```js
// capture: complete original capture arguments except its derived commandRef;
// content represented by its full exact UTF8 digest and byte count
{taskRef,claimRef,generationRef,executionRef,sessionRef,inputCursor,cursor,
 contentDigest,contentByteLength,evidenceRef}
// submit: complete original submit arguments except its derived commandRef,
// plus the actual captured-record and private reviewer binding
{taskRef,auditRef,executionRef,resultRef,resultRecordRef,resultDigest,
 reviewerBinding:{taskRef,auditRef,claimRef,generationRef,sessionRef}}
// repair artifact: complete original writeArtifact arguments except its
// derived commandRef/content, plus exact captured source
{resultRef,resultRecordRef,resultDigest,
 artifactWrite:{taskRef,expectedTaskVersion,expectedAuthEpoch,artifactRef,
 version,producerClaimRef,generationRef,contentDigest,contentByteLength}}
```

Actual content bytes must hash/measure exactly to these digest/byte fields before the original typed call; nothing is truncated or normalized into different content. Source evidence/cursors and private reviewer binding cannot be supplied by owner JSON. Repeating the same outer command returns original phase receipts; changing outer/binding/content/phase input conflicts, and existing one-result-per-execution/immutable-report/artifact-version constraints remain independent guards. No free automatic capture retry, repair or review is introduced by deriving a child ref. Factual finish uses its original explicit outer commandRef and existing complete command binding; it is not a fourth child phase.

## Complete consent, model role and private native composition

Full normalized action spec keeps existing closed fields: actionRef, kind, role, targetDigest, dataDigest, units, charges, attemptGroupRef, attemptIndex, resourcePolicyVersion, modelPolicyVersion, model, executor and executionInput. Review uses kind/role review; repair uses kind/role repair. Units1 and per-attempt maxAttempts1 stay held; shared policy total attempts, runtime and usage are explicitly confirmed, never raised at mount. Review/re-review/repair use the same original counters/reservations.

Derive `targetDigest=association.bindingDigest`, `dataDigest=association.artifactDigest`, and `executionInput={recordRef:association.recordRef,digest:association.digest,purpose,auditRef,bindingDigest,materialDigest,previousReportRef?}`; previousReportRef occurs only for repair. Derive fresh generation/action/attempt refs from complete task/audit/round/input/configuration/outer command; preallocate a fresh original owned session in mode create. Model/preset/reasoning/catalog/environment/binding/tools/permission/resource digests come from actual current original services and explicitly accepted role choices. Complete immutable actionDigest covers every field and input; no receipt attachment changes it.

Private `composeNativeAudit({worker,nativeHooks})` is called at most once per enabled installation after explicit valid policy/source facts. `worker` retains the original closed `{environments,permission,toolGuard,resolveSession}` trusted shape with create-only mapping and no owner resolver. `nativeHooks` remains exactly `{setupAgent,commitAgent,bindExecution,validateResult}`, with the same original native arguments; its source-owned implementations add explicit review/repair purpose checks. Root creates the original manager and NativeAdapter with the guarded original store. Root's bound original composition allocates/binds reviewer principals internally after native ownership, and holds submit handles for its collector. The closure returns exactly `{dispatch,executeApprovedInput,query,sessionLink,collectAuditResult,finishExecution,dispose}`; it exposes no agent, ticket, handle, principal, provider callback, arbitrary send/read or report method. Arguments are the validated normal shapes above, with source-derived compound lineage inside dispatch and collect's separately closed source-owned operationRef/artifactTarget argument. Return values are original bounded worker/execution/capture/finish facts, not success flags proving native provenance.

Native reviewer ownership must be established from the original AgentRegistry, SessionStore/backend, public classes and exact child Context, selected empty preset, empty tools, owned transcript/profile, original provider registration and options. Fresh native Context/agent/session are required for each review round/generation, distinct from producer and prior reviewer. The factory creates its opaque store reviewer handle internally only after this binding; calls literal `bindAuditReviewer(host,handle,{taskRef,auditRef,claimRef,generationRef,sessionRef})`; derives read allowlist from exact held input/material. Handle/allowlist never leaves the closure. Repairs do not get a reviewer role or submission capability.

The selected `maxPrivateReviewers` applies to pending creates plus bound active closures before effect, never only ready entries. Core's independent maximum32 remains enforced under lock. Reserve the local pending slot before async preparation and retain unknown native creation ownership until actual reconciliation; a timeout cannot free it to create another. Seal released/stopped closures and reject generation/session reuse; slot release requires actual ended ownership, not caller completion. Neither private capacity nor unavailable factory releases durable budget obligations.

Role system prompts and request recipes require a later exact primary-author hold alongside the deterministic review/repair provider extension before native integration. This API hold selects no prompt text, provider recipe, response fixture or production model default. Review sees only the complete approved input and fixed review task; repair sees its complete input/prior report and fixed repair task. Empty tools, no title/compaction/extra step, exact native user id/content/source and output limits remain required. Existing worker plaintext model cannot be relabeled review-ready; catalog names or monetary zero config are not source facts. Unpriced selections refuse COST_UNKNOWN. Actual source-owned testing accounting is separately attributable and is not useful real-model quality evidence.

## Actual repair artifact and factual finish

For repair, signed capture remains factual output. A private actual native collector validates the approved input user cursor and committed later assistant record, then existing original atomic `writeArtifact(owner,{taskRef,commandRef,expectedTaskVersion,expectedAuthEpoch,artifactRef,version,producerClaimRef,generationRef,content})` associates the actual bounded repair output. artifactRef/version are the already fixed authenticated input target `{artifactRef:association.artifactRef,version:association.artifactVersion+1}`; content comes only from the captured source, never owner text. Current artifact history is used only to check staleness/mapping or recover the actual original receipt, never to recompute a latest/next target. It records the private capture origin for the resulting artifact. A new artifact version invalidates prior verification; identical bytes/evidence repair does not imply changed content or passed review.

Capture and artifact write are distinct factual operations. If the latter refuses CAS/capacity/current carrier, the authentic captured audit_result may remain historical and the reservation remains held; it is not a partial pass, lost output or permission to repeat effect. An explicit later ref/CAS request may reconcile the same captured output without resending only after the original typed mapping is current. No write, rebind or submit happens automatically. Root and core author agree this typed factual path; it is not implemented by current WorkerManager and requires the separately authorized native integration.

Successful collection is not settlement. Native finish needs an actual captured current execution, known original stop, flushed/revalidated owned transcript and source actual usage. Review report must commit while its charged independent claim remains held; settlement follows actual finish. Repair may then be explicitly rebound and reviewed by a fresh charged reviewer. No output/report/verdict clears a hold, raises policy, ends a task or waives required pending/stale/unknown/fatal/budget/unexamined gates. Late factual output can remain history; current certification remains subject to original locked checks.

Dispose, disable, reload and full quit synchronously seal owner/native/reviewer/collector/request admission before asynchronous owned shutdown. The NI2 proposal's exact original lifecycle observation path may retain factual stopped receipts during owned drain, but cannot claim/capture/submit/settle on borrowed authority. After drain it seals too. Reopen reads durable facts, marks unresolved execution unknown, and allocates zero reviewer/session/stream. Original receipts/holds remain; no ephemeral receipt map is adopted from output labels.

## Required additional independent oracles and evidence limits

Independent design must bind this exact addendum before affected source GO. Preserve all20 original N3-01..N3-20 families, including N3-20's literal authenticated panel/bridge, wrong-peer/scope/CAS, stale/double-click and distinct gate/verification/completion projections; rendered UI assertions remain HOLD. Add: disabled factory/subscription behavior; descriptor/Proxy validation before traps; exact private input read/ref/body/inverse association; producer-context versus audit-input exclusion; current-lifetime original preparation/capture versus copied headers; disjoint target matcher including overlaps; new preview/grant role disclosures; optional synchronous typed-pair preview versus ordinary dataDigest, hostile/Promise pair refusal, pair mutation across prepare/grant waits and final mutation; pending-create selected capacity races and unknown holds; fresh original class/context/session ownership; guarded begin/capture/submit/repair-artifact/finish after awaits; no await after final consume; original provider iteration using the same captured execution carrier; review-only submit and repair-only factual artifact; changed-same outer conflict before CAS/child hashes, concurrent same outer, historical replay after version advance, capture-only/write-uncertain/written reconciliation to one selected version, unavailable original receipt refusing synthetic success, no query-driven writes or cold adoption; explicit capture-success/write-refusal history; malformed/unknown outputs with zero invented report; factual stop with denied settlement; scope/material/version/semantic drift; bounded commands/records and reconciliation capacity; genuine4→5 encrypted migration and old4 refusal.

Module fixture carriers may prove closed validators, call forwarding, guards, sequencing and zero effect counters. They cannot prove original DSH class/service/request origin, actual persisted native cursors, authenticated schema5 data, two-process transactions, provider response parsing, no hidden native stream or real review usefulness. Those require separate original-store/native/package proofs after exact author and independent source holds. No product tests, database, host launch, native execution, provider call, raw-row corruption, account, browser or CODE experiment was performed for this documentation pass. Final CODE/browser/full MVP/publication remain HOLD.
