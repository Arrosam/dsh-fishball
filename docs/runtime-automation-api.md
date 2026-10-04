# Stage3 workspace runtime API

Status: schema4 implementation contract, approved GO after reviewed Stage2 integration and rename. Methods are published before dependent implementation; availability is reported per tested logical unit. Same private principal binding, authenticated encryption, stable errors and one authoritative Ledger transaction domain as [RuntimeStore](runtime-api.md). An AutomationStore export may alias the same RuntimeStore; no second connection/SQL callback or memory-only task authority is introduced.

## Workspace memory

`memoryBinding(handle)` returns authenticated `{ownerRef,workspaceRef,role}` without a task anchor. Worker/reviewer handles cannot access workspace memory. Host reads; owner/coordinator writes; owner deletes.

```js
putMemory(handle,{namespaceRef,commandRef,expectedRevision,content,sourceRefs,requestDigest?})
getMemory(handle,{namespaceRef})
listMemory(handle)
deleteMemory(handle,{namespaceRef,commandRef,expectedRevision,requestDigest?})
```

Content is a bounded UTF-8 string, normally a caller-serialized immutable Fishball projection. SourceRefs is a distinct bounded SHA256 list (maximum16). Creation uses expectedRevision0; subsequent writes/deletion use exact current revision. Put returns `{ownerRef,workspaceRef,namespaceRef,revision,digest,recordRef,deleted:false,createdAt,updatedAt}`. Get adds decrypted content; missing namespace returns null; deleted namespace returns dated tombstone metadata with no content. List returns metadata only. Same command/content returns its immutable receipt, changed content conflicts. Deletion advances revision, removes live ciphertext and retains command/tombstone identity; it cannot silently resurrect (MEMORY_DELETED). Backups may contain older encrypted bytes; local deletion does not promise physical media erasure.

A trusted adapter may compute requestDigest from its immutable external request and call `memoryCommandReceipt(handle,{namespaceRef,commandRef,requestDigest})` before reconstructing a projection. It returns scoped metadata receipt/null; a changed request digest conflicts. Normal put still checks the complete content/source/CAS command binding. This is a durable command lookup, not a second projection authority.

Trusted host caps default to memory content4MiB, namespaces16, aggregate encrypted content64MiB. These are explicit bounded implementation capacities, not performance/latency claims. Task content remains65536 bytes; workspace hashing/encryption does not widen task or metadata input. Registered secret sentinels are rejected before any write. Stable errors include STALE_MEMORY, MEMORY_DELETED, MEMORY_LIMIT, IDEMPOTENCY_CONFLICT, SECRET_REJECTED, KEY_MISMATCH. Namespace facts/summaries are projections and never task/action/grant authority.

## Sources, subscriptions and atomic ingress

Source/subscription configuration is workspace-scoped and owner controlled. Closed reference/enums/counters configure an injected trusted adapter; a payload permission/scope flag never proves app access. No actual provider setup, webhook account, inference or rate/performance threshold is implied by this API.

```js
configureSource(owner,{
 commandRef,sourceRef,expectedRevision,
 spec:{kind:'schedule'|'webhook'|'chat'|'internal',identityMode:'unique_id'|'unavailable',
       enabled,adapterRef,permissionPolicyRef,maxEventAgeMs,rate:{windowMs,maxEvents},
       routeBinding?:{pairingRef,pairingRevision,principalRef,conversationRef,threadRef?,conversationKind:'private'|'group'}}
})
configureSubscription(owner,{
 commandRef,subscriptionRef,sourceRef,expectedRevision,expectedSourceRevision,
 spec:{enabled,triggerRef,route:'new_task'|'supplement',targetTaskRef?,goalNamespaceRef?}
})
source(handle,{sourceRef})
subscription(handle,{subscriptionRef})
listSources(handle)
listSubscriptions(handle)
ingestEvent(host,{
 commandRef,sourceRef,subscriptionRef,expectedSourceRevision,expectedSubscriptionRevision,
 eventRef,eventDigest,observedAt,receivedAt,taskId,providerRef,sourceIdentityRef,routeBinding?,
 targetTaskRef?,expectedTaskVersion?,expectedAuthEpoch?,goal?,clockRef?,expectedCursor?,scheduledAt?,verificationPlanDigest?
})
```

References are stored hashes, never rehashed. taskId alone is a raw bounded ID for a newly created task. Ingress transaction rechecks enabled source/subscription revision, exact route/source binding and rate cursor, durably deduplicates complete source/event identity with immutable event digest, creates or supplements the authoritative task, encrypts optional goal and updates clock/rate/event receipt together. A duplicate never changes original task association. A different event digest for the same identity conflicts. Supplements require exact target taskVersion/authEpoch. Adapter permission validation happens before this transaction; the transaction closes concurrent source/subscription revocation and task revision races. No nested Foundation intake transaction is allowed.

Schedule planning belongs to event-clock's explicit IANA/DST/gap/quiet/catch-up policy. ClockRef/expectedCursor/scheduledAt binds a concrete occurrence from that policy; durable cursor plus event dedup prevents blind missed-run replay. The bounded event/source/subscription/rate-retention caps and stable errors are specified below. An unavailable external event ID persists degraded identity semantics; it cannot claim safe exactly-once resends.

## Required audit gate

The task-scoped audit methods use the same schema4 transaction domain and private reviewer identities; no default severity/repair threshold or JSON pass flag is trusted.

```js
configureAudit(owner/coordinator,{
 taskRef,commandRef,expectedTaskVersion,expectedAuthEpoch,auditRef,expectedAuditRevision,
 artifactRef,artifactVersion,digest,material:[{recordRef,digest}],
 policyRef,blockingSeverities,maxRepairRounds
})
reportAudit(reviewer,{
 taskRef,commandRef,auditRef,artifactVersion,digest,materialDigest,claimRef,generationRef,
 coverageRefs,unexaminedRefs,verdict,findings:[{findingRef,severity,code,evidenceRef,resolved}],evidenceRef
})
recordRepair(owner/coordinator/host,{
 taskRef,commandRef,expectedTaskVersion,expectedAuthEpoch,auditRef,claimRef,generationRef,
 round,previousReportRef,evidenceRef
})
audit(handle,{taskRef,auditRef})
```

Configure returns auditRef/auditRevision/bindingDigest/materialDigest/round/state. Revision0 creates; owner CAS rebind after an admitted repair can advance a requirement to a changed artifact without erasing prior reports/rounds. Material is canonical-sorted by recordRef, with exact scoped data digests including the artifact. MaterialDigest hashes that sorted list. BindingDigest includes scope/task/audit/artifact/material and explicit policy. PolicyRef is trusted owner provenance; severity threshold is the supplied list, never an inferred D13 default. Severity is fatal/blocking/warning/info; fatal always blocks. MaxRepairRounds0..8 is a structural ceiling. Finding code is scope_violation/permission_bypass/secret_exposure/artifact_mismatch/coverage_gap/review_failure/other. Findings/prose remain encrypted or reference metadata.

Reports require a separate independently admitted held review claim/generation, exact artifact material and targetDigest=bindingDigest/dataDigest=artifact digest. CoverageRefs/unexaminedRefs partition the configured material. Verdict passed/failed/unknown/budget_exhausted stays immutable per round; reportRef is commandRef. A contradictory same-round report fails AUDIT_REPORT_CONFLICT and retains the prior failure. A payload resolved flag never removes prior required failures. Repair binds an approved charged exact repair claim, full original binding and bounded prior-report/round lineage; no automatic retry.

Task completion fails while a configured required audit is pending, stale, unexamined, unknown, failed, budget exhausted, fatal or blocked by explicit unresolved severity. Admission failure before a reviewer claim leaves required pending, never success. Artifact mutation invalidates its gate. New goal/constraint/clarification/branch/context semantic changes invalidate the audited requirements even when old immutable artifact/material still exists; procedural review claim/settlement CAS changes do not silently change semantic requirements. Semantic-revision tracking distinguishes protected requirement changes from procedural CAS changes and is tested against later context revision. Snapshot.audits and immutable reports preserve history across reopen.

## Schema and evidence boundary

Schema4 upgrades supported schema3 under an acquired migration lock with exact topology, rows and crypto metadata validation before a fsynced `.schema-3.backup`; target checks complete before COMMIT. Schema1/2 paths remain supported through their documented migration backup. WAL/SHM/future/unsupported/corrupt stores remain fail closed and preserved. Runtime source and memory methods cannot bypass Stage2 task/action/reservation/unknown holds. Module tests and independent reviews remain per-ticket; full cross-stage functional/visual regression and live provider/model/UI/catalog gates remain deferred in the acceptance-debt register.


## Frozen schema4 additions

UTC timestamps and maxEventAgeMs are integers0..8640000000000000. maxEventAgeMs is required, explicitly configured and has no product default. At the locked intake point observedAt≤receivedAt≤trusted now and now−observedAt≤maxEventAgeMs. Source rate policy is explicit windowMs≥1/maxEvents≥0; rejected events do not consume quota or cursor. Exact duplicate receipts do not consume another quota. Event IDs persist for the bounded store lifetime without automatic eviction; capacity rejects rather than deleting dedup knowledge. Chat-only routeBinding is owner-configured and rechecked against privately authenticated adapter facts; serialized identity fields never authenticate a callback. A new chat task records its original route digest. Chat supplement requires an existing identical route association, and cannot attach an unrelated configured target. Rate changes with unchanged route preserve access; changed pairing/principal/conversation/thread cannot inherit historical tasks.

```js
eventClock(host,{sourceRef,subscriptionRef,clockRef}) // null or clock receipt
advanceEventClock(host,{commandRef,sourceRef,subscriptionRef,expectedSourceRevision,
 expectedSubscriptionRevision,clockRef,expectedCursor,through,
 decision:'skipped'|'verification_required',planDigest})
chatTask(host,{sourceRef,subscriptionRef,expectedSourceRevision,expectedSubscriptionRevision,taskRef})
chatControl(host,{sourceRef,subscriptionRef,expectedSourceRevision,expectedSubscriptionRevision,
 taskRef,commandRef,expectedTaskVersion,expectedAuthEpoch,kind:'pause'|'resume'|'cancel'})
```

Clock receipt is `{sourceRef,subscriptionRef,clockRef,cursor,decision,planDigest,sourceRevision,subscriptionRevision,pendingVerification}`. expectedCursor null creates; otherwise it is exact current admitted UTC cursor. Skipped/runnable through strictly advances. verification_required keeps the previous admitted cursor (null if none) and sets pendingVerification `{through,planDigest,approved:false}`; it queues no task/effect. It cannot be cleared by skipped advancement or unapproved ingestion. All source/subscription revision/enabled/route/cursor checks occur in the same transaction as clock or control state. ChatTask exposes the scoped task snapshot only after matching the current private route to the originally committed association; ChatControl calls the existing control helper in that same transaction and offers no approval/grant endpoint.

`putData` accepts optional `expectedMemory:{namespaceRef,revision}`. Revision0 means explicitly observed absence and requires no namespace row; a tombstone is not absence. Revision≥1 requires the exact live nondeleted revision. Omission means intentionally memory-free input. Context metadata adds optional authenticated sourceTaskVersion/sourceAuthEpoch/semanticRevision and memory namespace/revision facts. Prior v2 metadata/AAD stays unchanged; no resealing. Initial prepared context has no generation; the action binds its future generation.

```js
beginContextExecution(host,{taskRef,actionRef,actionDigest,claimRef,generationRef,
 contextRecordRef,commandRef,expectedTaskVersion,expectedAuthEpoch})
assertExecutionCurrent(host,{taskRef,claimRef,generationRef,actionDigest,executionRef})
```

Begin returns `{executionRef,claimRef,generationRef,contextRecordRef,actionDigest,state,deduplicated}` with one immutable context intent per held claim. Kind=context, complete content/action data digest, authenticated scope/provenance/semantic and memory facts must match. Final assert is a documented atomic consume despite its historical name: only the first current caller gets `{admitted:true,state:'dispatch_intent',executionRef,...}`. Duplicates/unresolved/reopened intents return admitted:false/current state and must not call native send. Current claim/control/auth/expiry/resource-model policy and trusted permission are checked under the consume lock. No await separates a successful consume from public native send. Cancellation/crash after that point may leave unknown effects with held ownership; there is no automatic replay, idle completion or release.

Audit semanticRevision tracks goal/constraints/clarification/branch/context changes separately from procedural task CAS. Exact requirement bindings include that revision. `claimAction` accepts `auditRepair:{auditRef,round,previousReportRef,evidenceRef}` to commit charged repair lineage/max-round admission with the claim. Configured audit-targeted repair cannot dispatch without this binding. Configure/report/repair retain immutable prior reports; task completion requires current material/artifact/semantic binding and a complete independently charged accepted report, never a payload pass/resolved flag.

Technical capacities are memory4194304 bytes/16 namespaces/67108864 aggregate bytes, sources32/subscriptions128/events4096/clocks128 per workspace, requirements16/task/material16/findings16/reports9 per requirement. These are persistence bounds, not measured throughput/latency or chosen review thresholds. Current command/metadata caps and held-claim reconciliation reserve still apply. Stable additions are STALE_SOURCE, STALE_SUBSCRIPTION, SOURCE_DISABLED, SUBSCRIPTION_DISABLED, EVENT_EXPIRED, EVENT_CLOCK_INVALID, RATE_LIMIT, EVENT_LIMIT, STALE_EVENT_CLOCK, VERIFICATION_REQUIRED, ROUTE_MISMATCH, AUDIT_PENDING, AUDIT_STALE, AUDIT_REPORT_CONFLICT, AUDIT_REPAIR_LIMIT, AUDIT_BINDING_MISMATCH; existing memory/scope/CAS/idempotency/storage/crypto errors remain.

Traceability: memory isolation/recovery/revision/authority maps BUB007-03..06; event dedup/unknown/restart/clock/rate maps BUB009-01..05; original conversation/pairing/edit/attachment/rate and uncertainty maps DF010-C01..C05 with original BUB010 aliases preserved; independent material/completion/version/bounded repair/no permission mint maps BUB015-01..05. Actual provider delivery remains out of phase; these contracts never mark source/native/full-visual acceptance passed.


## Implemented typed unit and persistence

The schema4 logical unit implements these methods on RuntimeStore. It adds `workspace_memory` for encrypted namespace projections and `automation_records` for closed source/subscription/event/clock/semantic/audit/report/repair/execution metadata. Only typed methods may edit them; no callback/SQL/raw database accessor is exported by the native facade. Automation metadata uses a keyed canonical `automation-record/v1` integrity envelope bound to owner/workspace/kind/id/task; all trusted route, cursor, report and execution fields are checked before reads/recovery. Workspace content uses AES256GCM with unbranded `workspace-memory/v1` AAD binding complete immutable metadata. Tombstones authenticate an empty ciphertext and retain revision/digest/provenance while removing live plaintext bytes. Technical caps and registered-secret/Unicode guards apply before writes. No memory/source/audit record independently authorizes a task action.

Schema1/2 migration adds schema4 directly after the original source validation and fsynced backup. Schema3 migration checks exact prior topology/rows/key/crypto2 under the acquired migration lock before `.schema-3.backup` or DDL. A nonempty unverified legacy encrypted source rejects CRYPTO_LEGACY_UNVERIFIED; invalid key/metadata rejects before backup/write. Foundation without a key-aware runtime validator rejects encrypted schema3 migration as RUNTIME_MIGRATION_REQUIRED; empty/W1-only schema3 remains supported. Current crypto2 ciphertext/AAD is carried unchanged. The isolated rollback-journal validation copies and WAL/SHM/header safeguards remain, then target topology/rows validate beforeCOMMIT. Stored refs remain refs; no rehash bridge occurs.

```js
approveEventClock(owner,{commandRef,sourceRef,subscriptionRef,expectedSourceRevision,
 expectedSubscriptionRevision,clockRef,expectedCursor,planDigest})
eventReceipt(host,{sourceRef,subscriptionRef,eventRef})
listEventReceipts(host,{sourceRef,subscriptionRef})
```

Private owner clock approval marks only the exact pending plan approved, retaining through/plan and dated approver metadata; it creates no task or action grant. IngestEvent optional verificationPlanDigest must equal that approved plan, with scheduledAt after the previous cursor and no later than pending through. Success advances cursor/clears pending and retains resolvedVerification; every failure leaves pending/cursor/task/rate unchanged. Source/subscription checks precede even command receipt replay. A command replay or complete-ID duplicate returns deduplicated:true/current task and cannot trigger fresh handler work. EventReceipt/list retain original registered identity/digest/time/task association but derive registered/processing/completed/unknown from current authoritative task/actions/holds. Stored processed means ingress routing committed, not effect completion or provider replay assurance.

Supplement route appends an encrypted kind=context closed `{contractVersion:'df.supplement/v1',materialKind:'current_instruction',content,sourceRef,subscriptionRef,eventRef,eventDigest,observedAt,taskRef}` envelope. It keeps the original goal. Exact target CAS and (for chat) original route association precede an atomic task-version and semantic-revision increment, content/ingress/event/rate/clock commit. Receipt includes supplementRecordRef/supplementDigest. Authenticated metadata has pre-write sourceTaskVersion/sourceAuthEpoch, post-write taskVersion, semanticRevision, sourceRef and no generation. Already admitted supplements remain current/protected across source disable; no retract policy is inferred. ContextAssembler explicitly validates this envelope before optional selections, protects all admitted instructions against trimming/recordRefs omission, and rechecks task/memory after async assembly. Duplicate event adds no second content/revision.

Task-content command binding hashes well-formed UTF-8 content with its byte count instead of serializing prose twice into metadata limits. Accepted prior full-content command digests remain replay alternatives, so schema3 idempotency is not silently broken. All actual stored content still obeys65536 bytes; a serialized supplemental/execution envelope must fit as a whole. Workspace memory commands similarly bind the complete content digest plus exact CAS/source/optional external requestDigest; no raw projection is stored in command metadata.

The final execution consume is the native-send admission linearization point. It stores dispatch_intent once; re-opened unresolved intent/dispatch becomes unknown. Resulting terminal/effect evidence is recorded through existing workerObservation/settleAction; idle status alone does not complete or release. Known effect and exact terminal evidence can reconcile a held execution while other message/delivery/handoff obligations continue holding it. Required audit reports and the first context execution intent receive protected admitted-claim command headroom; duplicate/noop new-command IDs do not consume terminal reserve. Keyed semantic required-audit identities and action executionRef inverse markers detect lost authoritative rows before recovery or dispatch.


## Command receipt integrity and prior history

Every current command acknowledgement is a keyed `command-receipt/v1` envelope over complete owner/workspace/command/task/intent digest/operation/result. Read, historical replay and startup validation authenticate that complete binding before returning any receipt. A changed payload, operation, digest, task or removed envelope fails STORAGE_INVALID; memory replay after later revisions/deletion returns its original authenticated acknowledgement, never current projection data.

Genuine schema3 commands may contain earlier plaintext acknowledgements whose contents cannot be verified retroactively. Migration preserves those exact receipt strings, plus signed ID/command-binding markers and a per-workspace signed legacy-ID digest/count boundary. It does not authenticate or reseal their acknowledgement contents. Existing tasks/data/held intent recovery remain supported; attempting any old plaintext command replay fails CRYPTO_LEGACY_RECEIPT_UNVERIFIED before a write/effect. Deleted/modified migration markers or envelope stripping on a new command fails STORAGE_INVALID. Legacy rows are untrusted historical bytes, never recovery/completion/grant facts. A separately authorized evidence reconstruction would be needed to recover their acknowledgement, and is not implemented here.
