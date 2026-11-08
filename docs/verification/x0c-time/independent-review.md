# Independent requirements and evidence review

Date: 2026-11-09 (Pacific/Auckland). Reviewer: separate agent `a32fb253-2253-4310-a076-a95ea7639268`, distinct from parent executor and supplemental executor `aa1116c4-f60d-4b19-9099-1ae6cca38f81`.

## Requirements and preserved-test review

The reviewer independently read the approved W0 design/decisions, inherited tests/inventory and previous report. Its dry-registration audit found:

- **137 unique approved IDs**, exact inherited titles and TODO states: X0-C 95 executable + 9 TODO = 104; FN-1 10 + 3 = 13; B1 10 + 10 = 20.
- Zero missing, extra, duplicate or promoted cases. No new timestamp test or test correction is needed.
- Exact baseline `fd0f46a` and fix `00d4cd2` are ancestors of local merge `6d26ab7`; prior correction/supplement commits `720e680`, `c38b97e` and `79274fc` are retained.
- Approved tests, support, supplements and test-design documents are unchanged. The sole product delta from baseline is `event.at` → `event.time` in the public timestamp projection.
- Existing detached host Session supplement asserts finite **and exact** source `event.time`, source filtering, newest-first order, filter-before-limit, repeat determinism and event/seq/followup/options immutability. It does not synthesize `event.at` or prove persistence/wake/model-loop behavior. Clipping is in the approved suite, not this supplement.

## Readiness guardrails

The reviewer recommends distinguishing ready-to-merge W0 supplied-boundary integration from completed X0-C acceptance. Even if all 95 executable cases pass, local async awaited publication/rejection/disposal fencing, dynamic-context lifecycle, durable lost-receipt/reservation/quiet-hold recovery and valid-image preparation/order/no-partial-turn remain unproved. Nine inherited X0-C TODOs cannot all be reassigned to later owners. FN-1 and B1 remain skeleton-only readiness; later-owner TODOs and UI/loader/recovery limitations must be explicit.

## Final evidence review

The initial review correctly remained pending until both parent-owned complete task jobs finished and were collected. **Final independent evidence/report review is now approved, with no material correction remaining.** This is offline evidence verification, not another test execution or a completed-X0-C acceptance claim.

- Independently parsed both complete raw task TAPs, excluding TAP suite containers, and compared every registered case's exact ID/full title, task, technique and TODO state against the approved inventory, initial ledger and both result presentations. Each SDK has **137 unique cases: 115 pass / 0 fail / 22 TODO**, zero missing/extra/duplicate/promoted/skip/cancel. Per task: **X0-C 95 / 0 / 9; FN-1 10 / 0 / 3; B1 10 / 0 / 10**. Raw TAP SHA-256, exit 0, start/finish records, exact durations and the Markdown per-ID table all reconcile with the [machine results](<results.json>).
- Independently compared prior per-ID outcomes: **only `XC-EP-V-05` changes Fail → Pass** on each SDK. No historical evidence was reclassified or overwritten.
- All six supplementary/regression raw TAP hashes, exit files, parsed node totals and full row names/statuses match the [supplement results](<supplement-results.json>). Per SDK: detached installed Session **4 passing nodes = one scenario plus three children**; actual Cordis **6 passing bodies**; safe regressions **44 pass / 0 fail / 1 existing TODO**. Regression row names/states are identical to the prior run; the retained TODO is `I7-EP-02` malformed-record semantics. Supplements remain outside the approved 137 IDs.
- Rechecked all twelve frozen test/support/product hashes and eight selected runtime manifest hashes. Reviewed the [parent cleanup/integrity record](<evidence/cleanup.json>) and [supplement executor record](<evidence/supplement-cleanup.json>): all seven jobs are recorded completed, exit 0 and explicitly collected; no owned terminals remain. Re-reading Git refs and source hashes confirmed all seven recorded refs and twelve source files match. This reviewer certifies the records and integrity checks, not an independent OS-wide process census.
- All 34 staged paths inspected are new verification artifacts under this report directory, with no product/test/approved-design/prior-evidence diff. The full staged whitespace check **including raw TAP** passes; no evidence-format exclusion is needed. Parent will restage the final review/document updates and repeat that check before its local report commit.
- The final [report](<report.md>) correctly distinguishes **timestamp-fix / W0 supplied-boundary integration merge readiness** from **unaccepted completed X0-C acceptance**, retains every local async/dynamic-context/durable/image obligation and later-owner continuation, and limits FN-1/B1 to **W0 skeleton merge readiness**. Actual Session/Cordis evidence is not promoted to UI, full profile-loader, model-loop, persistence/restart/recovery or exactly-once real-wake proof; absent WD/MCP implementation is not labeled a defect in these three tasks.
- Two wording precision requests were incorporated and reread: generated vectors count when they register distinct bodies, and this run's full staged whitespace check actually passed including captured TAP. No remaining material review finding. No new tests or product edits were required; this reviewer ran only static registration/artifact/hash/Git checks and edited its audit/review evidence.

Review-method note: the first offline supplementary parser accidentally included five TAP `type: 'suite'` containers. Reading the raw suite diagnostics corrected only that reviewer-owned parser; all evidence bytes remained unchanged, and the corrected independent reconciliation passed. This was not a product/test failure or a test-suite rerun.
