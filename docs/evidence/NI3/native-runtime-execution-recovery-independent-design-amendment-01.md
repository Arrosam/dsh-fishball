# NR-UI05 independent affected execution-recovery design

**NR4-SRC01 is source-remediated for the exact owned successful same-task refresh transient; NOT_TESTED.** Current client [.runtime/ni3-native-execution-recovery-proposal/proposed/client-entry.cjs](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni3-native-execution-recovery-proposal/proposed/client-entry.cjs) is `a281011d3a9aac1071fbe7be081a5645a67619d78b2dfae4912989d75590adf2`,121721 bytes/718 lines. Exact delta [.runtime/ni3-native-execution-recovery-proposal/proposals/NR-UI05-real-model-refresh/literal-client.patch](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni3-native-execution-recovery-proposal/proposals/NR-UI05-real-model-refresh/literal-client.patch) is `d8990e358032417c0b0153b55493f9e134215a8685c09837768965b2066fea17`,1726 bytes. Only line545 differs from preserved0909.

Reviewer `/root/ni6_independent_design`, parent `/root`, `2026-10-07T05:08:05.795564+00:00`. This is a separately assigned affected design after sealing the original0909 pair. It neither rewrites the original28 groups/blocker nor treats later bytes as originally reviewed.

## Source disposition and boundary

The real successful task refresh publishes phase ready before select publishes selectedA/detail:null/stale:true. The new subscription early return at [.runtime/ni3-native-execution-recovery-proposal/proposed/client-entry.cjs:545](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni3-native-execution-recovery-proposal/proposed/client-entry.cjs:545) matches that actual transient and preserves the previous key/read-only local facts, so the0909 unconditional reset no longer erases retained execute uncertainty there. Restored detail still reaches the original task/version/auth key logic. The added guard is the conjunction of:

- `ownRefresh===true`
- `previous selected key is non-null`
- `s.detail===null`
- `s.stale===true`
- `s.phase==='ready'`
- `s.selected===previousSelectedKey.taskRef`

No stale/busy/status/execution/collection/permit field is newly published, no RPC/import/ref is added and no host authority is created. Actual task stale/audit busy gates remain during the transient. Fresh details/foreign selection/no selected task/missing or undefined detail/nonowned/offline/loading/error fall through existing code. Manual/offline/error retention and inherited successful-own-refresh auth/version admission are not solved or proven; keep those specific cells held.

Original closed19+5 schema, thirteen binding joins, typed historical fields, local recovery, exact8 collection/finish request and final600 missing-collection guard remain unchanged. They still require actual original owner/source/currentness and result/stop evidence. UI wire is not host/DOM proof.

## Finite affected obligations

All12 obligations are independently derived from the one-line delta and original real model; none is an executed result or author fixture assertion. Original28 remain NOT_RUN/HOLD.

| Obligation | Trigger | Oracle and remaining scope |
| --- | --- | --- |
| NR5-AX01 Canonical real owned refresh (NR4-D02/NR4-D03) | Use exact createModel/createAuditModel public setup and mutation methods. Expose actual same-A refresh loading→ready→select(detail:null/stale:true)→restored detail, success and lost execute reply. | New line545 returns only at exact transient, preserving tracked key/read-only mappings/uncertainty instead of original reset. Restored detail still processes original key logic. Do not inject private state. **SOURCE_REMOVED_CANONICAL_RESET_NOT_RUN / NOT_RUN/HOLD.** |
| NR5-AX02 Lost execute stays uncertain (NR4-D02/NR4-D15/NR4-D17) | One execute request loses reply; real own refresh restores same current A after transient; recover then explicit status. | Keep uncertain executeAudit/execution null/stale true until explicit unique recovery. Recovery copies original row, preserves stale/uncertainty and adds0RPC/ref/native effects. Status remains explicit; no execute retry. **AFFECTED_POSITIVE_NOT_RUN / NOT_RUN/HOLD.** |
| NR5-AX03 Each guard conjunct boundary (NR4-D04/NR4-D23) | Individually false ownRefresh, previous key absent, detail undefined/empty/non-null, stale false, phase loading/error/offline, selected null/foreign. Keep others fixed as bounded wire negatives. | No early-return exemption outside exact six-conjunct predicate. Existing invalidation/key/reset rules run. Impossible carrier combinations are wire negatives only, not genuine model states. **PREDICATE_BOUNDARIES_NOT_RUN / NOT_RUN/HOLD.** |
| NR5-AX04 Transient gates remain closed (NR4-D03/NR4-D21) | At real select detail:null while ownRefresh awaits, attempt audit mutation/query/recovery, including canRecover and explicit recover. | Task model stale and audit busy guards deny mutation/query/recovery. New early return changes no stale/busy/status/execution/collection/permit field and issues no request. **READ_ONLY_GATE_REGRESSION_NOT_RUN / NOT_RUN/HOLD.** |
| NR5-AX05 Foreign selection during owned refresh (NR4-D23/NR4-D25) | While A own refresh awaits status/detail, select actual B/no-task via original public task model and deliver old A reply. | Different selected task fails same-task clause and old maps cannot lend authority. Existing detailRevision/revision/identity checks prevent late A publication to B. No auto recovery/create. **RACE_NOT_RUN / NOT_RUN/HOLD.** |
| NR5-AX06 Auth/version changes still observed (NR4-D22/NR4-D23) | Return fresh same-A details with changed version/auth; separately publish external changes outside own refresh at original digest/RPC awaits. | Non-null fresh detail cannot hit early return and original key path still runs. Lost execute remains read-only/stale. Outside-owned changes retain revision/stale fencing. Successful-own-refresh authority semantics are inherited and not proved by this delta; original host currentness required. **AUTHORITY_ORACLE_HOLD / NOT_RUN/HOLD.** |
| NR5-AX07 New worker incarnation cannot borrow (NR4-D07/NR4-D08/NR4-D09/NR4-D23) | Restore same task with changed current worker/action/claim/gen/session/execution/input bindings after preserving old local facts. | Unchanged recoveredExecution exact current identity joins refuse old retained mapping. Preservation creates no new worker/capability/source/currentness/permission; no latest-incarnation borrowing. **INCARNATION_NEGATIVES_NOT_RUN / NOT_RUN/HOLD.** |
| NR5-AX08 Offline/error/loading/reset/dispose (NR4-D24) | Disconnect/reset/dispose or cause real status/detail refresh error while detail is null; also ordinary offline with detail retained. | Phase offline/error/loading fails narrow predicate; existing epoch/active/controller/revision/stale gates remain. No late response/recovery/send/native work. Outside-predicate outcome retention/reset is inherited and not claimed reconciled. **OFFLINE_ERROR_RECOVERY_HOLD / NOT_RUN/HOLD.** |
| NR5-AX09 Manual nonowned refresh (NR4-D03/NR4-D17/NR4-D24) | Invoke real owner task refresh/select outside audit ownRefresh after lost execute and retained facts. | No exemption (ownRefresh false), original reset/invalidation behavior remains. This amendment does not solve manual missing-detail retention or promise recovery after every refresh; specific original cells remain HOLD. **MANUAL_RECOVERY_HOLD / NOT_RUN/HOLD.** |
| NR5-AX10 Full wire reconciliation requests (NR4-D01/NR4-D16/NR4-D18/NR4-D19/NR4-D20) | After corrected canonical public setup/lost response/unique ref recovery, explicitly refresh audit status, call original collect and then guarded original finish with actual allowed wire reply literal once frozen. | Exact original8 identity/CAS request keys and final missing-execution/collection guard unchanged. Observation adds no collection/finish authority; original host reply/currentness remains necessary. Unknown/error never proves stop/release. **WIRE_PATH_NOT_RUN_HOST_PROVENANCE_HOLD / NOT_RUN/HOLD.** |
| NR5-AX11 Unchanged literal/source effects (All NR4-D01..NR4-D28) | Compare exact0909→a281 source text; verify only line545 changed, existing parser/recovery/call/Panel/apply/finish lines and imports untouched by delta. | No new import/RPC/ref generation/native/receipt/host/DOM path. Original28 required groups carry forward without being passed; source text comparison is not syntax/import/runtime proof. **TEXT_COMPARISON_ONLY / NOT_RUN/HOLD.** |
| NR5-AX12 Original-host and mounted UI evidence (NR4-D27/NR4-D28) | Final original public owner/source-owned synthetic role and actual React/DSH DOM after separately authorized exact current closure and runtime/profile lease. | Actual result/collection/physical stop/currentness/held-released/DOM claims require original host/DOM oracles. This one-line model source fix cannot pass them or original finalCODE/all87. **HOST_DOM_NATIVE_HOLD / NOT_RUN/HOLD.** |

## Exact inputs and preserved artifacts

| Input | SHA256 | Bytes |
| --- | --- |
| .runtime/ni3-native-execution-recovery-proposal/proposed/client-entry.cjs | `a281011d3a9aac1071fbe7be081a5645a67619d78b2dfae4912989d75590adf2` | 121721 |
| .runtime/ni3-native-execution-recovery-proposal/proposals/NR-UI05-real-model-refresh/before/client-entry.cjs | `0909a3effda67f0c1780b5ca9fc090650920d15ce0fe9f3acb137df122cb85b0` | 121601 |
| .runtime/ni3-native-execution-recovery-proposal/proposals/NR-UI05-real-model-refresh/projected-client-entry.cjs | `a281011d3a9aac1071fbe7be081a5645a67619d78b2dfae4912989d75590adf2` | 121721 |
| .runtime/ni3-native-execution-recovery-proposal/proposals/NR-UI05-real-model-refresh/literal-client.patch | `d8990e358032417c0b0153b55493f9e134215a8685c09837768965b2066fea17` | 1726 |
| .runtime/ni3-native-execution-recovery-proposal/proposals/NR-UI05-real-model-refresh/source-contract.json | `e2692f6b7157f19c06903bdcbe5e3b287a89a78c85b56b22240fc5b0d3918314` | 3609 |
| docs/evidence/NI3/native-runtime-execution-recovery-independent-design.md | `291dcf436aef2ae8df6d0f472d515da2fc9c8db35289f357a442a83f567f47c6` | 28130 |
| docs/evidence/NI3/native-runtime-execution-recovery-independent-design.json | `c78c1fdc27be32aac1d5e99cc727cdc3151b11023fedf5c4e739d20a285577d4` | 39078 |
| docs/evidence/NI6/schema7-independent-design.md | `9a01d8d71fe97def605bff63a4c2da3556bdbff61adf7376ee6741636dc8c5ec` | 44965 |
| docs/evidence/NI6/schema7-independent-design.json | `706113919029e0812b96950d737f26ea1c055927a352f8f14f488b0ee5395611` | 110282 |
| docs/evidence/NI6/schema7-core-independent-source-review.md | `e5e400fc24242b3ce62256fadceeb8442587c7b54f7193ac8e203ae88f86bd83` | 47338 |
| docs/evidence/NI6/schema7-core-independent-source-review.json | `f3c3bf9f9c8f3c6e0636a2d84b58232d7a61b023ee195337f83a3e1c7bfd4bec` | 108175 |

The original0909 [docs/evidence/NI3/native-runtime-execution-recovery-independent-design.md](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/docs/evidence/NI3/native-runtime-execution-recovery-independent-design.md) and paired JSON remain exact, as do all four prior NI6 artifacts. The full before/after text comparison shows718 lines each and one difference at545. This is text evidence, not a Node parser/import/runtime result.

## Remaining limits

- Root approved d899 source literal/applieda281 after source review only. Current source contract still labels itself proposal/not applied; that status is historical declaration, not execution evidence.
- Root identifies original2f077 source closure as historical/stale during authoring; no source/import/fixture executable GO follows from it. New final closure must be independently reviewed by root.
- No author actual-model-fixture-plan or ER fixture/assertion/oracle body was read.
- An imprecise bounded client excerpt238-259 displayed unrelated automation code; not followed/analyzed/used. Actual public task disconnected276 retains detail when present, sets offline/stale and fences revisions; detail-null offline case is reachable if disconnect occurs during select.

No source edit, fixture creation/execution, author fixture-plan/assertion/oracle body or ordinary oracle report read, Node parser/import/check/test/build, DB/migration/native/provider/model/tool/browser/profile/listener/network/install/Git occurred. No blocked receipt-envelope/rev999/legacy/quarantine/finalCODE investigation/reroute or QA/frozen a58 change. All effects counters0.

Source-only remediation cannot close the original blocked finalCODE, all87AC, manual/offline/error/cold recovery, actual host/DOM/native/model-quality/MVP/physical/publication acceptance.
