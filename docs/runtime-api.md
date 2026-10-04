# Stage2 RuntimeStore interface

Status: implementation interface freeze, revision `bubbles.runtime/v1`; development integration only. Full cross-stage functional/visual acceptance remains deferred in the acceptance-debt register. No serialized role, scope, approval flag or schema-valid record confers authority.

```js
import { RuntimeStore, RuntimeError, reference, canonicalDigest } from './src/runtime-store.mjs';
const store = new RuntimeStore({
  databasePath, encryptionKey: Buffer.alloc(32), // host-provided key, never stored/exported
  principals: [{handle: opaqueObject, role: 'owner'|'coordinator'|'host'|'worker'|'reviewer',
                scope: {ownerId, workspaceId}, taskRef?, generationRef?, sessionRef?, readRecordRefs?}],
  limits, clock: Date.now, hostPermission: () => false,
  forbiddenSecrets: ['synthetic-canary'], // host-registered, never stored/logged
});
```

`reference(rawId)` validates and hashes a raw ID once. Runtime methods take stored `taskRef` and other SHA256 references directly; never feed them back to W1 raw-ID methods. Constructor scope uses raw owner/workspace IDs and privately binds handle identity. Owner/coordinator/host are workspace-bound; worker/reviewer additionally require exact task/generation. Only configured owner handles grant/revoke/policy changes. Host may bind a worker/reviewer handle to an exact task/generation through `bindExecution(hostHandle, executionHandle, binding)`; it cannot mint an owner/coordinator/host capability. No raw database or capability mint is exposed on the native facade.

## Typed methods

All calls are synchronous unless an adapter outside the store invokes a provider. Unknown keys fail closed. Durable receipts use references/digests, never decrypted prose. Every mutation has one SQLite transaction and stable error codes.

| Method | Input / output |
| --- | --- |
| `intake(handle, {taskId,provider,source,eventId,commandRef,goal?})` | Raw bounded ingress IDs, optional bounded encrypted goal. Atomically dedups full ingress and returns `{deduplicated,task}`; cannot rebind an existing event to a new task. |
| `task(handle, taskRef)`, `listTasks(handle)` | Scoped factual task snapshots: refs, version/auth epoch, status, timestamps. |
| `revise(handle, {taskRef,commandRef,expectedTaskVersion,expectedAuthEpoch,status?,goal?,constraints?,reason})` | Owner/coordinator CAS revision and immutable command digest; encrypted data plane references returned. |
| `putData(handle,{taskRef,commandRef,kind,content,sourceRef,expectedTaskVersion,expectedAuthEpoch})` | Typed scoped encrypted records: goal/constraints/clarification/branch/context/message/artifact/verification/progress. Returns `{recordRef,digest,kind,version}`. Reads via `readData(handle,{taskRef,recordRef})`; lists metadata via `listData(handle,{taskRef,kind?})`. Worker/reviewer writes limited to their task/generation and allowed kinds. |
| `policy(handle,{commandRef,expectedVersion,limits,modelPolicy})` | Owner-only immutable resource/model policy revision. Downshift preserves held obligations; model references/presets must be supplied by trusted configuration, no automatic DSH mapping. `getPolicy(handle)` returns snapshot. |
| `planAction(handle,{taskRef,commandRef,expectedTaskVersion,expectedAuthEpoch,spec})` | Owner/coordinator records complete normalized immutable intent. Returns `{actionRef,actionDigest,taskVersion,authEpoch}`. `spec` binds role, target/data, units/charges, attempt group, resource/model versions and executor generation/environment/tools/permission. |
| `grantAction(owner,{taskRef,actionRef,actionDigest,commandRef,expectedTaskVersion,expectedAuthEpoch,expiresAt})` | Exact fresh consent; returns current task/auth snapshot and grant receipt. |
| `revokeAction(owner,{taskRef,actionRef,actionDigest,commandRef,expectedTaskVersion,expectedAuthEpoch})` | Atomic authority invalidation; already claimed work remains held. |
| `claimAction(handle,{taskRef,actionRef,actionDigest,commandRef,expectedTaskVersion,expectedAuthEpoch,outbox?,delivery?})` | Trusted host/owner/coordinator; exact CAS/spec/grant/expiry/policy/permission/budget under lock. Returns `{claimRef,reservationRef,actionDigest,generationRef,task}`. No provider call inside transaction. |
| `workerObservation(host,{taskRef,claimRef,generationRef,commandRef,phase,sessionRef?,evidenceRef})` | Exact native observation mapping; created/ready/running/unknown/cancel_requested/stopped/not_created. Newly discovered session attaches to original action digest without rehash. |
| `settleAction(host,{taskRef,claimRef,generationRef,commandRef,outcome,evidenceRef,terminalEvidenceRef?})` | Known/unknown action outcome recorded; action result never completes task. Unknown stays held. Release only once exact executor terminal/absence and known outcomes match; ledger release receipt generated atomically. |
| `control(handle,{taskRef,commandRef,expectedTaskVersion,expectedAuthEpoch,kind,actionRef?,actionDigest?})` | Owner/coordinator pause/resume/cancel/revoke/read/confirm_cancel; no extra worker. Cancellation request is distinct from confirmed stopping. |
| `enqueueMessage(handle,{taskRef,commandRef,expectedTaskVersion,expectedAuthEpoch,messageRef,recipientRef,bodyRecordRef,bodyDigest,immutableMetadata})` | Scoped immutable outbox intent; owner/coordinator/worker according to bound scope. `messageObservation(host,{taskRef,messageRef,commandRef,state,evidenceRef,claimRef?,generationRef?})` records sent/consumed/unknown/rejected. Same ID changed content conflicts; unknown is never resent automatically. |
| `recordArtifact(handle,{taskRef,commandRef,expectedTaskVersion,expectedAuthEpoch,artifactRef,version,recordRef,digest,producerClaimRef?,generationRef?})` | Immutable scoped artifact association. `verifyArtifact(reviewer,{taskRef,commandRef,artifactRef,version,digest,verdict,evidenceRef})` requires a task-bound independent reviewer. `artifact(handle,{taskRef,artifactRef})` reads metadata. |
| `snapshot(handle,{taskRef})`, `exportTask(handle,{taskRef})`, `diagnostics()`, `close()` | Scoped consistent snapshot/export of metadata only; no decrypted data, key, secrets or raw error. |

`bindExecution` is a trusted host integration operation, not a model-facing tool. Exact native recipient/environment/session observations remain adapter responsibilities; opaque hashes do not authenticate them. Input evidence references must refer to the current claimed mapping; provider payload assertions do not establish trust.

Canonicalization sorts object keys recursively, rejects accessors/proxies/non-JSON/unbounded content and hashes the complete immutable command/intent. A new created session is a receipt fact; it is not added to the approved create intent. Repeated commandRef with changed normalized content conflicts. Policy changes never rewrite admitted specs. Reviewer/repair work count against shared active units/attempt/time/usage budgets. Unknown cost/usage remains unknown; dispatch budgets are not hard billing caps.

## Storage and compatibility

RuntimeStore extends the same authoritative SQLite ledger with a real schema migration and pre-migration durable backup. W1 Foundation remains a supported reference-only client of that store; no independent memory authority is introduced. Exact table topology/version/journal guards apply. Goals/prose/artifacts use host-key authenticated encryption, scoped AAD, bounded records and registered secret rejection before persistence; diagnostics/export/approval metadata expose references only. Native service facade must bind handles privately and never expose RuntimeStore or key directly.

No method above runs inference or a native effect. Adapters perform effects only after a durable claim and reconcile observations afterward. Restart marks in-flight mappings/outbox as unknown while preserving reservations; it never creates/replays/resends. Global acceptance and live catalog/usage/latency/UI gates remain deferred, not passed.

## Implemented shapes (author module revision 2)

The implementation uses schema **3**. Supported schema1/2 DELETE stores are validated under the migration lock, backed up with fsync to `.schema-N.backup`, then upgraded atomically. WAL headers or either WAL/SHM sidecar are rejected before SQLite opens; future/ambiguous headers and source corruption preserve originals. Existing W1 facts remain intact. Foundation mutators fail `RUNTIME_MANAGED` on runtime tasks and its recovery excludes runtime claims.

Complete spec (all references are lowercase SHA256 strings; integers are nonnegative safe integers except versions/units/attemptIndex, which are positive):

```js
{
 actionRef, kind: 'read'|'write'|'review'|'repair', role: 'worker'|'review'|'repair',
 targetDigest, dataDigest, units,
 charges: {runtimeMs,usageUnits,costEstimateMicros?,costState?:'estimated'|'unknown',costProvenanceRef?},
 attemptGroupRef, attemptIndex, resourcePolicyVersion, modelPolicyVersion,
 model: {presetRef,modelRef,reasoningRef,catalogEvidenceRef},
 executor: {mode:'create'|'resume'|'none',generationRef,sessionRef?,environmentRef,
            bindingDigest,toolsDigest,permissionPolicyDigest}
}
```

`actionDigest` includes this entire normalized spec plus owner/workspace/task references and planned task/auth versions. Create may include a trusted preallocated native sessionRef because the verified public DSH create API requires a caller-supplied sessionId. Otherwise a new session attaches through a receipt without changing actionDigest. Resume requires sessionRef; none forbids it. Unknown cost omits its estimate and fails budget-dependent admission with `COST_UNKNOWN`; no invented zero or hard billing cap. Policy `{expectedVersion,limits,modelPolicy:{version,presetRefs,catalogEvidenceRef}}` stays unavailable for model dispatch until a trusted owner supplies an explicit mock or verified host binding. HostPermission still defaults deny.

`content` is a bounded UTF-8 string, including caller-serialized JSON. `putData`/`revise` increment taskVersion. `readData` returns `{recordRef,kind,digest,sourceRef,taskVersion,authEpoch,generationRef,createdAt,byteLength,content}`; list/snapshot omit content. Reviewer reads require individually bound `readRecordRefs`; worker reads only goal/constraints/context plus its own generation's message/artifact/progress. An exact addressed sent/consumed message grants only its unchanged body access. Bindings/allowlists are copied privately. `bindExecution` also accepts sessionRef/readRecordRefs. `context(handle,taskRef)` exposes authenticated binding metadata, never a capability or key.

`claimAction` optionally accepts **one** of `{outbox:{messageRef}}` or `{delivery:{deliveryRef}}`. It validates exact stored target/data digests and atomically changes accepted intent to outbox_committed with the claim/reservation. Accepted intent alone never authorizes a send. `assertClaimCurrent(host,{taskRef,claimRef,generationRef,actionDigest})` checks current authority, cancellation/pause, exact claim and expiry synchronously before an adapter invocation. External effects remain outside the SQLite transaction; a later revoke cannot undo a committed effect.

Message enqueue shape replaces the initial table proposal: `{taskRef,commandRef,expectedTaskVersion,expectedAuthEpoch,messageRef,recipientRef,bodyRecordRef,bodyDigest,immutableMetadata}`. Closed metadata: `{senderRef,senderSessionRef,senderGenerationRef,recipientRef,recipientSessionRef,recipientGenerationRef,category,purposeRef,sourceRef,eventRef,originalMessageRef?,hopLimit,dedupMode?}`. Categories include task/direct/broadcast/result/control/question/progress/status/context/review_request/review_result/control_request. DedupMode unique_id/unavailable preserves source identity degradation; no safe replay is inferred. Forwarding preserves the parent purpose/source/event and original hop limit, verifies exact prior recipient as new sender, derives route from durable consumed parent and rejects loops/overlong routes. `getMessage` returns immutableMetadata/targetDigest/byteLength/state/claimRef/reservationRef/generationRef. Host observation sent/consumed/unknown/rejected requires exact claim/generation.

Artifacts require positive immutable `version`; reviewer verification also binds it and requires an independently admitted held review action for its generation and exact artifact digest. `artifact` accepts optional version. `recordDelivery` takes `{taskRef,commandRef,expectedTaskVersion,expectedAuthEpoch,deliveryRef,artifactRef,artifactVersion,digest,recipientRef,channelRef,targetDigest,previousDeliveryRef?}`. It requires accepted independent verification. A retry references one confirmed failed predecessor with its exact released claim and unchanged item/recipient/channel; a new delivery/action/grant is required. `getDelivery(handle,{taskRef,deliveryRef})` reads metadata. `deliveryObservation` takes `{taskRef,commandRef,deliveryRef,state,evidenceRef,permissionState,openability,observedAt,claimRef,generationRef}`: state sent/delivered/failed/unknown; permission allowed/denied/unknown; openability openable/unavailable/unknown. Historical delivery receipt survives subsequent denied/unavailable currentAccess observations. Sent/unknown keep reservations.

`recordProgress` accepts `{taskRef,commandRef,expectedTaskVersion,expectedAuthEpoch,progressRef,recordRef,digest,kind}` with kind milestone/obstacle/question/final. The module owns quiet/coalescing policy over durable immutable progress records. `control` supports pause/resume/cancel/revoke/read/confirm_cancel; cancellation request invalidates authority before returning and remains requested until all exact holdings release and explicit confirmation. No instant termination assertion.

Snapshot contains observedAt/task/data/actions/workers/messages/artifacts/reviews/deliveries/progress/policy/control. Actions expose complete immutable metadata-only spec. Snapshot/export is one SQLite snapshot. Default caps: queue32, active weighted units2, per-group attempts3, total attempts12, tasks1000, actions/task16, events/task128, metadata8192 bytes, encrypted content65536 bytes, records/task128, commands4096, reserved control128, declared runtime3600000ms, usage1000000 units and cost estimate1000000 micros. Downshift permits zero resource/attempt/time/usage/cost/queue budgets and preserves holdings. Declared charges count cumulatively after release; estimated/actual/unknown usage is recorded separately, never advertised as a billing ceiling. Ordinary commands reserve reconciliation/control headroom and claims reserve task history before admission. Fixture hooks and maxPageCount require fixtureMode; hooks before_commit and after_claim are synthetic fault seams. They never invoke inference.


Remediation contracts: no-op pause/cancel/resume preserves task version/history; reversible toggles use ordinary capacity, while first invalidation/recovery/settlement/cancel confirmation retains reserved headroom. Explicit malformed limits/proxy configuration fails before any SQLite open. Every live action read/claim/readiness check revalidates complete normalized digest/base binding under the transaction. Runtime graph links and managed markers are checked in both directions before recovery; malformed source1/2 ingress rejects before backup. Unknown restart/observation usage is recorded unknown, and measured actual usage above declared estimates counts conservatively against later admission.

`writeArtifact(handle,{taskRef,commandRef,expectedTaskVersion,expectedAuthEpoch,artifactRef,version,content,producerClaimRef?,generationRef?})` atomically encrypts content and associates the immutable artifact version. `writeProgress(handle,{taskRef,commandRef,expectedTaskVersion,expectedAuthEpoch,progressRef,kind,content})` does the same for progress. Association/version/capacity failure rolls back data, task CAS and command together. The lower-level reference association methods explicitly accept already stored data; result pipeline writes use composites.

`putHandoff(owner/coordinator/host,{taskRef,commandRef,expectedTaskVersion,expectedAuthEpoch,claimRef,generationRef,actionDigest,content,sourceRef})` atomically encrypts the branch and marks the exact worker claim's handoff pending. SourceRef must equal actionRef; handoffRef is the new encrypted recordRef. Returns recordRef/digest/task/handoffRef/claimRef/generationRef. Native environment activation remains outside this request and requires separate current trusted authority. `markHandoff(host,{taskRef,claimRef,generationRef,commandRef,handoffRef,state,evidenceRef})` records exact pending/resolved metadata; pending handoff independently blocks release even after worker stopping and known effect. There is no autonomous orphan discard.

Delivery/access observations are monotonic by trusted observedAt: older or equal-time contradictory facts fail STALE_OBSERVATION under the transaction; exact same fact is idempotent. A later access denial never overwrites historical delivered proof, and a delayed allowed receipt cannot erase a newer denial.

Protected command accounting depends on actual progress: terminal fact/release or first authority invalidation. New command IDs for already stopped/consumed/resolved/delivered or known-but-held facts use ordinary command capacity; they cannot consume the slots reserved for native terminal proof, outbox/handoff reconciliation, known settlement and cancel confirmation. Same original command remains durably idempotent. Delivery observations reserve the16thslot and512metadata bytes for a known final receipt; ordinary sent/unknown observations fail earlier.

`assertMessageCurrent(host,{taskRef,messageRef,claimRef,reservationRef,generationRef})` validates the current independent send grant/claim/outbox/spec/expiry under lock. `assertWorkerOwned(host,{taskRef,workerClaimRef,generationRef,sessionRef})` checks exact live held recipient mapping, original grant not explicitly revoked, native phase and current control/noncancel state; unrelated later grant epochs do not invalidate an already owned executor. New message dispatch still requires its own fresh exact authority. Native adapter seams are private trusted callbacks and default deny; no payload approval bypass is introduced.

Policy updates accept only resource admission keys queueCapacity/maxActive/maxAttempts/maxTotalAttempts/maxRuntimeMs/maxUsageUnits/maxCostEstimateMicros; immutable technical persistence/reconciliation caps are constructor limits. Unknown policy keys fail rather than silently imply unenforced downshifts. Persisted policies are type/limit/model validated on open and live reads before admission.
