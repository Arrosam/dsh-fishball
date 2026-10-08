# Native worker R6 checkpoint

R6 executed once on2026-10-08 and made concrete progress: all15 contract cases passed, actual native worker creation returned ready, and one deterministic request/stream/turn/step completed with zero tools. The full worker path failed at WORKER_EXECUTE/REJECTION/refusalNONE after19 HTTP requests. Commitment, returned result, factual stop and reservation release are not established. The actual supported driver exit1 was directly captured. This is consumed FAILED_HOLD, not a full positive-path or MVP pass.

| Gate | Actual result |
| --- | --- |
| Node syntax D01 | PASS; child exit0 |
| Three ordinary root-header cases C01–C03 | PASS |
| Twelve unchanged-history/constructor-conservation cases C04–C15 | PASS |
| Genuine task/native creation and ready admission | PASS within the selected local milestone |
| One request/stream/turn/step, zero tools | Established event counts; no settlement implication |
| Full worker D02: acknowledgement, accounting, capture/result, finish/release | FAIL; later normal path not reached |
| Selected entry removal | entryRemoved=true; no claim that every owned entry was disposed |
| Strict root cleanup | rootClosed=false; HOLD remains |
| Supported driver return | Directly observed exit1; separate from child exits0/1 |

The [actual-return proof](positive-one-worker-r6-actual-return.json), [fixture](positive-one-worker-r6-execution/fixture-result.json), [executor](positive-one-worker-r6-execution/executor-result.json) and [command records](positive-one-worker-r6-execution/command-results.json) preserve exact public identities, first-failure and actual-return evidence. Both captures reached EOF and both owned groups were observed absent, with no signals, process timeouts, interruption, overflow or truncation. The [before/after record](positive-one-worker-r6-execution/before-after.json) establishes742 pins and the original27,577-file/12-link graph unchanged at both boundaries. OS termination observations do not establish ledger release, complete service disposal or root closure. Final enclosing driver duration is not established by preterminal scalars or polling time.

R6 derives from sealed R5 with only the missing ordinary request-header implications and producer session-path ordering corrected. Its whole18,440-byte ordered descriptor matches the producer's inert measured construction: SHA25606fce97380e5efe41df8f59bdbd27911edd22b22171d6683b11ebbd32cf776a9. The other62 regular package files, both depth-zero header fixes and original built client are exact ancestors; no new build is claimed. The [source seal](positive-one-worker-r6-source.md), separate [code review](positive-one-worker-r6-independent-source-review.md) and [ISTQB design review](positive-one-worker-r6-independent-test-design-review.md) cover that final derivative. Their source-only clearance is separate from actual D02 failure.

Separate [execution-evidence review](positive-one-worker-r6-independent-execution-evidence-review.md) and [actual test assessment](positive-one-worker-r6-independent-actual-test-assessment.md) qualify the new public evidence. They do not investigate the actual private response/caught cause or repeat the source review. No private profile/key/database/history/capture/response/error payload was inspected, decoded, copied or hashed by root/reviewers. The normal host's previously authorized synthetic operation and its finite public evidence are separate from private evidence inspection. External/paid inference and browser input were zero.

No R6 replay/reset/adoption is permitted. Completed event counts do not establish acknowledgement, exact usage settlement, delivery, held/zero balance or task completion. R3/R5 stay UNRUN; consumed R2/R4 and R4's NOT_CAPTURED driver return remain unchanged. The old UI profile and cancelled task were untouched. The Mac is locked, QA is paused and no corrected authenticated UI fixture handoff has been made.

The next finite gate is the [R7 transport observation freeze](../../ni6-positive-one-worker-r7-transport-observation-freeze-2026-10-08.md). The existing two-second execute HTTP timer is a possible explanation, not an observed cause. A fresh derivative may expose only closed transport-event/status stages without changing package code, guards, timers, budgets, calls or provider scope. Root waits for the two R6 actual assessment seals, then permits source-only authoring, one affected code/ISTQB review and the supported fresh once test. No receipt/signature/envelope/revision999 internals, private exception or protected CODE route is included.

The remaining native integration work is successful acknowledged settlement/result/finish/release and correct host shutdown/restart evidence, followed by actual UI regression when the Mac is accessible. Existing three-stage feature work and M1's earlier109 passing foundation checks do not satisfy these gates. [M1 scope](../../milestones/M1-foundation.md), [all-ticket mapping](../../three-stage-development.md) and local ticket IDs remain intact. All87 HOLD/accepted0 and protected final CODE BLOCKED_UNCHANGED persist. Git is local, granular feature history is retained, no remote/push/publication/stable release occurred, and eventual Arrosam/dsh-fishball remains gated by full agreed acceptance.
