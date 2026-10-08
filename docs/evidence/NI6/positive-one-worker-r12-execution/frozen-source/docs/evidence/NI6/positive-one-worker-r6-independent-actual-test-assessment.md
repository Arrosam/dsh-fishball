# R6 independent actual test assessment

Date: 2026-10-08. Reviewer: independent ISTQB test-design reviewer, gpt-6.1-sol, max. Decision: **D02 FAIL / consumed FAILED_HOLD**. This assessment reads only the six sealed public JSON records listed in the companion report. It does not repeat source-design verification or perform runtime, replay, private payload, cause-probe or protected CODE work.

The [root actual-return proof](positive-one-worker-r6-actual-return.json) and [fixture projection](positive-one-worker-r6-execution/fixture-result.json) agree with the executor, command and before/after records. All six supplied byte counts and SHA256 seals match. The fixture has the planned 29 fields, finite values and a compact projection within the 1024-byte cap. These are evidence consistency checks, not a new execution.

| Case or milestone | Assessment | Published evidence and limit |
| --- | --- | --- |
| D01 syntax | PASS | Syntax child exit 0. Syntax success does not establish runtime success. |
| C01-C03 ordinary header literals | PASS | headerCases=3; these are the selected local header oracles. |
| C04-C15 stored projection literals | PASS | projectionCases=12; these are the selected pure projection oracles. |
| Genuine creation/readiness milestone | PASS | taskCreated=true, workerCreated=true and actual createPhase=ready. |
| Native event count milestone | PASS | requests=streams=turnStarts=turnEnds=stepStarts=stepEnds=1; tools=0. This does not prove execution settlement or result delivery. |
| D02 full genuine positive path | FAIL | First reported failed checkpoint WORKER_EXECUTE / REJECTION; refusalCode=NONE, HTTP count 19, positivePath=false; functional child exit 1. |

Execution acknowledgement failed after the native event milestones. executionCommitted=false and resultReturned=false mean the commitment and returned-result oracles were not established; they do not prove the absence of a ledger entry. Exact acknowledged usage settlement is also NOT_ESTABLISHED. The normal follow-up query, capture, returned-result, finish/final-status and post-disposal 404 path was NOT_REACHED. The complete 25-request positive path did not pass. REJECTION and refusalCode=NONE identify only the closed reported checkpoint/category, not a host response, private exception or first underlying cause. Those details remain NOT_ESTABLISHED.

workerStopped=false and reservationReleased=false mean factual stop and release were NOT_ESTABLISHED. No remaining worker state, held balance, zero balance, recovery adoption or automatic replay is inferred. entryRemoved=true establishes the selected entry-removal observation. ownedEntriesRemoved=false is an unreached full positive-path milestone, not proof that every cleanup attempt failed. rootClosed=false retains the independent mandatory root cleanup HOLD. Owned operating-system group absence is not proof of reservation release, complete service disposal or root closure.

The [command records](positive-one-worker-r6-execution/command-results.json) publish child exits 0/1, complete EOF on both streams, absent owned groups, no signals, timeout, interruption, overflow or truncation. The [before/after record](positive-one-worker-r6-execution/before-after.json) reports complete, unchanged 742 pins and the 27,577-file/12-link host graph at both boundaries; this assessment checks the public records for agreement and does not rehash that graph. These observations do not turn D02 into a pass.

The [executor](positive-one-worker-r6-execution/executor-result.json) reports FAILED_HOLD / EXECUTOR_COMMAND_NONZERO, finalized=false. Separately, the actual supported driver return was directly captured: initial chunk 4afdae/session 36981, intermediate poll fd1dfb, final chunk 565f24 with exit 1 and empty output. The consumed marker remains FAILED_HOLD; finalized=false is not permission to reset or repeat it. Root's directly captured R6 return does not repair R4's NOT_CAPTURED return.

Child durations (0.065260 and 8.841962 seconds), executor preterminal observedSeconds (20.792196749942377) and conservativeActiveSeconds (25.79219741700217), marker timestamps, and supported request/poll observations are distinct. The last poll's wall time is not driver execution time. Final enclosing driver duration remains NOT_ESTABLISHED despite directly observed exit 1. The [sealed root plan](positive-one-worker-r6-execution/root-plan.json) records the earlier authorization and bounds; its prospective status/effects are not evidence that later completion milestones occurred.

All 87 remain HOLD, accepted 0; strict root cleanup HOLD, protected CODE BLOCKED_UNCHANGED, locked UI PAUSED and cloud action BLOCKED_AFTER_SECOND_REVIEWER_REJECTION remain. No task completion, review, delivery or aggregate acceptance is established. R6 is consumed; no additional run or investigation is authorized by this assessment. The sealed R6 source-design pair is unchanged.
