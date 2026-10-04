# W2 candidate worker lifecycle and environment binding

Status: mock-only preparation on `prep/W2-contracts`. Source AC: BUB004-01..05 and basic BUB011-01..05. W1 browser acceptance remains HOLD; this contract implements no ticket, adds no Foundation/schema2 method, table or task status, and invokes no native host, model, tool, browser or account.

Read [shared vocabulary](shared.md), [BUB004](../../tickets/BUB004.md), [BUB011](../../tickets/BUB011.md) and the [pinned source findings](../../evidence/M1/host-interface.md). The closed draft2020-12 candidate schema is [worker-lifecycle.schema.json](../../../prep/w2/schemas/worker-lifecycle.schema.json), ID `urn:bubbles:w2-prep:worker-lifecycle:v1`. [Twenty vectors](../../../prep/w2/fixtures/worker-lifecycle.json) exercise structural invariants only; every evidence sourceKind is mock.

## Mapping, immutable intent and trust

A future trusted adapter owns the exact tuple: scope(ownerRef,workspaceRef,taskRef), factual taskVersion/authEpoch, actionRef/actionDigest, reservationRef/claimRef, generationRef and any known sessionRef. Generation is allocated before an attempted create. A discovered session is associated with that original tuple; session ID reuse cannot inherit a prior generation's authority. Cross-task/session/generation/claim evidence is rejected before applying a receipt.

Root's shared `actionDigest` covers one complete immutable normalized spec, including target/data, units/charges, task/auth/resource/model policy and executor/environment/tools/permission bindings. It is not a worker-only digest. A known session is included in the original resume intent. A newly discovered create session is receipt/mapping evidence under the original actionDigest+claimRef+generationRef; discovering it does not rehash the approved intent. Canonical byte encoding/digest recomputation, resource integration and durable mapping storage remain implementation gates.

The environment object binds environmentRef, bindingDigest, toolsDigest and permissionPolicyDigest. These describe the actual requested workspace/environment and public tool/permission composition, not a payload-selected substitute. Environment unavailable, unsupported, denied or uncertain permission blocks further admission. A different machine, workspace, tool or permission path requires a new authorized bound action; a host denial never triggers a workaround.

Refs are equality keys, not capabilities. Current W1 trusted APIs accept bounded raw IDs and persist SHA256 refs; these candidate refs must not be passed to Foundation as if they were raw IDs, which would hash them again and change identity. Mapping raw native session IDs/private handles, candidate refs, trusted caller identity and existing ledger facts needs an explicit reviewed adapter/data plane. No serialized role, sourceKind, permissionOutcome, verified handoff or matching digest authenticates a caller. Current native identity/operator/permission bridges remain unavailable/deny-all.

The snapshot carries the original mutation binding (expectedTaskVersion/expectedAuthEpoch/commandRef) alongside factual taskVersion/authEpoch. They can differ after an observed transition; a future mutation must compare against the authoritative current ledger rather than copy a stale snapshot. JSON checks shape, not equality, freshness, atomicity, provenance or permission.

## Candidate wrapper operations and worker facts

These wrapper names are proposals, not native exports:

| Candidate wrapper operation | Required future boundary/oracle |
| --- | --- |
| create | Trusted scope, immutable intent, capability/permission and atomic reservation/claim before exactly one submitted creation attempt. Persist intent before calling the native factory. |
| resume | Query/verify the exact existing session, generation ownership, current task/epoch and environment; reconcile previous effects before invoking the native factory. No missing/out-of-scope or uncertain session resumes. |
| dispatch | Fresh readiness and bound environment/tools/permission, current task/epoch and atomic action claim. Dispatch only once for a resolved claim; unknown receipt requires reconciliation. |
| request_cancel | Block new claims first, record request, invoke the verified native control for the exact incarnation and retain ownership until real termination/effect evidence. |
| query / reconcile | Query current native state, associate it with the original scoped claim/incarnation, and reconcile ledger facts without creating another executor or replaying arbitrary effects. |
| request_handoff / verify_handoff | Create a bounded request bound to original action/target/environment/expiry. Trusted current-state evidence verifies the requested condition; verification alone does not grant permission or resume work. |

Worker phases are mapping facts separate from existing task states:

| Phase | Meaning and evidence boundary |
| --- | --- |
| create_requested | Durable creation intent/reservation recorded; no assertion that the host has accepted or created anything. |
| create_accepted | Candidate wrapper admission receipt; not a native creation/ready acknowledgement. Display wording must distinguish local acceptance from host creation until a real pinned service acknowledgement is verified. |
| created | Exact session/generation association evidenced. Creation is not permission, model readiness or started execution. |
| ready | Current capability/environment/model/tool readiness independently observed for this incarnation. No existing source-inspected ready acknowledgement is assumed. |
| running | Native current execution observation for this incarnation. It does not complete the task or verify an artifact. |
| terminal | Observed worker/creation-attempt closure with completed/failed/cancelled/no_executor outcome. These are mapping outcomes, not new schema2 task statuses. |
| unknown | Missing/uncertain create, stream, query, cancellation or environment observation. Hold reservation/claim and query the same incarnation; never blindly recreate, resume or replay. |

The schema requires a sessionRef after created/ready/running and for a terminal executor. Unknown creation may lack a sessionRef but always retains its preallocated generationRef and claimRef. A terminal no_executor creation attempt can have no sessionRef, but a transient not-found query cannot prove that no asynchronous create remains pending.

`nextOperation` is a bounded candidate observation workflow marker, never an executable instruction. Unknown always means query_same_incarnation. dispatch_bound_action requires ready/open admission and an online environment/allowed permission shape; runtime trust/CAS still decides whether any dispatch occurs. Native status events cannot simply be renamed to these richer phases.

## Races, disconnects and accountable release

Cancel/revoke serialized before a new claim blocks that claim. A claim committed first stays accountable, including late completion or unknown effects; a later cancellation cannot roll back a send or file modification. Cancel requested/unknown, worker unknown and pending handoff retain reservationRef/claimRef. Held snapshots forbid a releaseBasis/releaseEvidence but may retain partial outcomeEvidence without freeing capacity. A timeout, aborted client await, closed browser, lost stream, worker self-report or expired handoff is not termination evidence.

A terminal observation alone also need not release. Candidate releaseBasis is confirmed_no_executor or confirmed_stopped_and_settled, with separate worker terminalEvidence, reconciled outcomeEvidence and trusted ledger releaseEvidence. The first requires authoritative closure of the exact creation attempt and absence of an executor/effects, including no pending create that could later publish. The second requires actual stop plus settlement of effects/reservation obligations. A ledger release receipt cannot be substituted by a worker observation, nor can a stopped worker prove settlement of all obligations. Unknown effects remain held; completed effects and late evidence remain recorded. Other unknown message/delivery/handoff obligations must be reconciled by the shared resource/ledger owner before aggregated capacity is released. No instantaneous cancellation, exactly-once external effects, forced orphan deletion or arbitrary per-session close is promised.

After disconnect/reload, resubscribe is observation, not new intake. Reconcile current native query with durable scoped mapping, original action/claim and cursor/evidence identity; retain terminal facts and deduplicate historical events. A response for the wrong generation or older mapping cannot overwrite the current one. Missing evidence leaves unknown. Automatic orphan cleanup and environment migration remain owner-policy decisions, not defaults in this proposal.

## Handoff and sensitive data

A pending handoff contains requestRef, actionDigest, targetDigest, environmentBindingDigest, reasonCode, bounded step codes, resumeCondition and expiresAt. Its referenced bounded data plane/UI must resolve target/reason/steps into a useful request without putting credentials or raw paths/prose in this wire envelope. BUB011-03's visible pending-user state is a later UI oracle, not an implemented panel.

Pending/expired handoff blocks admission. Verified requires verificationEvidence but still needs trusted current task/epoch, exact request/action/environment digest, expiry, native current state and the normal permission/claim path. User silence, a changed page, a self-reported login or success for another request is insufficient. No automatic continuation follows verification. Final credential/UI/session binding and supported owner surface remain pending decisions.

## Concrete native source observations and deferred proof

The existing pinned evidence covers official DSH Web0.2.1-alpha.1 source hashes; no additional source/runtime inspection or execution is performed here.

| Source-inspected public surface | What is actually known | What is deferred |
| --- | --- | --- |
| dsh-session / SessionStore | create/get/list/prepare and event facts concern persistence/identity. | Execution readiness, native cancellation and proof of work cannot be inferred. |
| dsh-agent / AgentRegistry | create(options)/resume(options) delegate to a registered factory; create's handle resolves after setup/publication/loop start. | Mapping wrapper accepted/created/ready stages to actual receipts and ownership across uncertain asynchronous creation. |
| dsh-agent-loop / ReactLoopAgent | send(message,target,wakeup), followup, steer, inject and cancel(cause,options); cancellation aborts an active phase and may preserve inbox. | Correct native messages, actual stop/late effects, state queries, resume and observable artifact production. No generic close is invented. |
| dsh-api-session-controller | Source has native create/fork/cancel and live/cold session projections. | Exact callable scoped command/query/event contract and permission/identity bridge. |
| dsh-tool-subagent | Source composes agent-scoped delegation tools with preset/model-selection lifecycle. | Worker delegation, model catalog mapping, scope isolation and budgets. Codex Sol6.1 preference is not verified DSH provider/model identity. |

## Exact source AC and future real test oracles

| AC | Future oracle and fault cut; all currently unexecuted |
| --- | --- |
| BUB004-01 | Capture actual create response, exact mapping, readiness observation, execution event and terminal query separately. Reject dispatch before ready; do not substitute a local accepted receipt for native creation proof. |
| BUB004-02 | Fault after native creation submission but before receipt/persistence; query discovers the same incarnation and associates it without a second creation. Also query-inconclusive/negative-while-create-pending keeps claim/reservation and no retry. |
| BUB004-03 | Trusted scoped existing-session resume performs one observable work item and yields a digest-bound artifact. Missing/wrong owner/workspace/task/epoch/generation or changed environment rejects before native invocation. |
| BUB004-04 | Race cancel/revoke with committed dispatch and completion at both serialization orders. Preserve real completed effects/late evidence; release only after actual stop/settlement proof. |
| BUB004-05 | Cut stream before/after terminal; current query plus durable mapping reconciles it. Replay history once as observations, never fresh tasks; stale generation cannot replace terminal evidence. |
| BUB011-01 | Compare requested and actual workspace/environment/tool-binding records. Offline/unsupported/denied environment results in a bounded blocked state and zero substitute environment actions. |
| BUB011-02 | Actual public permission denial stops the exact action; counters show no alternate-tool path. Recheck changed policy after lock acquisition before any new claim. |
| BUB011-03 | Authorized owner surface displays bound target/reason/steps/resume condition and pending-user state. Sentinel credentials never enter chat/logs/wire reports. |
| BUB011-04 | Verify current native/page state after the user's action; mismatched, expired, revoked or changed request cannot approve another action. Silent user/page-only change leaves blocked. |
| BUB011-05 | Disconnect tool/environment at pre-effect/post-effect/receipt cuts; query and retained evidence distinguish completed from unknown. Reconnect cannot blindly rerun an uncertain step. |

Preparatory schema/vector validation establishes only bounded closed shapes and selected state-specific constraints. The native/atomic/security/effect/model/UI oracles above remain separate gates after W1 acceptance and reviewed W2 implementation.

## Author structural verification

Using root's provenance-checked `loadPinnedAjv()` (existing Ajv8.20.0), the worker schema compiles with `strict:true`, `strictRequired:false`, `allErrors:true`, `validateFormats:false`, `coerceTypes:false`, `useDefaults:false`, `removeAdditional:false`, `ownProperties:true`, `logger:false`. All 20 author expectations match (11 valid, 9 invalid); evidence objects are mock only. Root's strictTypes finding on the preliminary conditional fragments was fixed by explicit object/array annotations, without relaxing the verifier or removing negatives. This result proves schema/vector structure only. The aggregate verifier and independent frozen-tree reviews belong to root; no native/inference/browser or W1 test execution is part of this verification.
