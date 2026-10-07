# NR-UI05 finite actual client-model composition plan

DESIGN ONLY / NOT AUTHORED / NOT RUN. Use actual createModel + createAuditModel on the same actual task model instance. No replacement task refresh/getSnapshot or private model state. React/RPC and producer capture interface are explicit wires only.

## RM01 — Actual before-model first-mutator discriminator

Use preserved0909 actual factory createModel and createAuditModel, public owner list/status/detail RPC wires, explicit producer capture interface. Initialize task via actual task.refresh, then audit.refresh/configure. Original configure returns true but actual own refresh detail:null loses requirement. This is the legitimate earliest baseline failure; do not inject state or pretend baseline can reach execute.

## RM02 — Actual projected-model successful mutation composition

Use projected actual createModel and createAuditModel. Populate audit state exclusively via public refresh/configure/prepare/plan/preview/accept/grant/create/execute. Script actual list/status/detail pipeline after every mutation, including legitimate CAS version changes. Capture task subscriber publications proving exact selected A/detail:null/stale:true/ready transient, then fresh same A. Require returned requirement/input/action/worker/execution facts survive only owned same-task transient; no automatic collection/finish inference.

## RM03 — Lost execute response with bounded original refresh transient

From legitimate full projected workflow, executeAudit wire commits19-key row and original action executionRef metadata then loses response. Hold actual status reply during own task refresh. Observe uncertain executeAudit plus retained requirement/input/action/worker, executionnull; task stale and audit busy block all mutation/query/recovery, previewnull/acceptedfalse. Release fresh same A status/detail; uncertainty and audit stale persist, only exact unique original-projection recovery may then copy executionRef, no execute resend.

## RM04 — Lost dispatch response through actual task model

After genuine projected prepare/plan/preview/grant, dispatchAudit wire records current task worker then loses reply. Actual owned refresh transient retains known action/input and dispatch uncertainty, worker remainsnull. Fresh same A permits existing exact candidate auditQuery; query preserves stale/unknown and does not dispatch/execute again.

## RM05 — Foreign or empty selected-task result during owned refresh

Parameterize actual list returning only B or empty list while own refresh is in progress. Actual select B/null publishes foreign/null selection; narrow predicate refuses, existing mappings reset. Old task refs never authorize query/recovery/new execute; no cross-task response adoption or replay.

## RM06 — Actual offline/reset during transient

Defer actual status at same-A null-detail transient, invoke actual audit.disconnected and task.disconnected in installed apply order. Offline fails predicate; controllers/read epochs fence late status/mutation responses and all admission remains blocked. Do not assert retained authority or resolved outcome: existing outside-predicate clearing behavior remains a residual, not a new recovery promise.

## RM07 — Same-task explicit refresh outside own refresh is not generalized retention

After stored projected facts, invoke public taskModel.refresh/select A directly with no audit-owned mutation. Actual null-detail transition follows existing revision/key/reset path, preserving original outside-own behavior. Assert stale/blocked old mutation and no automatic retry/adoption. Do not claim manual refresh now preserves audit unknown; this proposal is restricted to own refresh.

## RM08 — External auth/version drift while mutation response pending

Two finite cases: same A version increment or auth epoch increment via actual external task refresh/status while execute RPC deferred before own refresh. Existing revision fencing ignores late response; no worker/execution adoption, acceptance or resend. Compare predicates to prove no exception is applied without ownRefresh.

## RM09 — Fresh same-task different incarnation retains no new authority

After lost execute, actual same A status wires return different claim/gen/session/reservation worker mapping. Existing recoveredExecution exact-current-worker/action/execution comparisons reject recovery; exact retained query cannot accept changed returned identities. Unknown stays visible only within permitted retained scope and no create/execute retry follows.

## RM10 — List/status failures and stale read race

Three finite cases: list failure, status failure after same-A transient, and foreign-select superseding delayed old status. Existing real createModel phase/error/read/selected fences apply; predicate does not retain on error/offline/foreign state. No late old response or phantom completion/finish/collection, and no retry.

## RM11 — Direct recovery/finish boundary after real-model correction

Using actual two-model lost-execute workflow, retained original row can recover only after fresh task detail. Public finish stays false/zero auditFinish until separate collection reply and explicit status refresh; recovery keeps stale/unknown/previewnull. Original host wire error after explicit collection supplies no completion/release authority.

## RM12 — Narrow predicate public transition discriminator

Via actual public model transitions, record accepted only-own/same-A/detailnull/staletrue/ready shape and refusal controls from RM05–08 for foreign/null selection, non-own select, offline/error. Test observed public publications without replacing task.getSnapshot/refresh, patching source, invoking private variables, or manufacturing special transient hooks.

