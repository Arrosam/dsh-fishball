# Stage3 independent required-audit test review

Reviewer `/root/istqb_review`, Sol6.1/max, independent of audit/core authors and correctness review. **PASS for the held actual-store module checkpoint; full BUB015 and consolidated acceptance remain HOLD.** Product audit reports cannot replace this development review or sign off their own implementation.

Reviewed [audit implementation evidence](runtime-audit.md), actual facade/core/tests and [61-row independent plan](test-design.md). Source BUB015-01..05 remains immutable. Policy severities/rounds are explicit; this review selects no suggested default2, severity threshold or model quality assumption.

## Evidence and exact scope

The held-core command and16-file hashes are recorded in [memory/context review](memory-test-review.md): **169/169 PASS,0 SKIP**, including36 audit cases, five independent audit top-level cases with multiple decision partitions, and carried store/notification cases. Raw TAP `/tmp/df-istqb-S3-core-held.tap`, SHA256 `d3ad330dfb907560731f0b839c81dcc0b80ea97c8f05e7872c248cc9382abe91`.

| File | Held SHA256 |
| --- | --- |
| src/audit.mjs |a1f6bff346c7897d4cf5c7cffa2b8f12e1fee5d69cd2a6fc78c4c4d843475beb|
| test/audit.test.mjs |e0c24d1b1857565b927e5b731f53567f6ea35ed382ff18a3db528b09b60dc0ec|
| src/runtime-store.mjs |63dbc100d4dfa4fa42db31003c84a7925de025dd66af08f5bae589a4e8e7e850|
| test/automation-adversarial.test.mjs |f42a7ab100dfcc5ff02ff82e6ab6f3b76971aeb35c832e123b25303042cb09a9|

Earlier six/seven pure tests establish normalization/forwarding only. Current activated actual SQLite tests have0 API-unavailable skips and exercise the core primitive, private bound generations, immutable encrypted artifacts/material and charged reservations. No review model, external inference or native Web/browser is invoked by these cases.

## Expected versus actual risk decisions

| Decision/state | Exact executed oracle and result |
| --- | --- |
| Required pending versus direct core completion |Author `actual required pending gate cannot be bypassed by direct core completion…`; independent multi-requirement case completes only after both distinct required reports and known releases. One passed requirement cannot satisfy another. PASS. |
| Exact charged independent reviewer versus producer/role forgery |Author producer-generation reuse, unbound material/wrong target and private allowlist; independent wrong-target reviewer cannot certify second requirement. Claim/generation/complete material binding required; role/pass flags do not supply it. PASS. |
| Complete coverage versus missing input |Author individually allowed goal/artifact bytes, unrelated message denial and coverage partition; independent explicit unexamined case remains required after known release/reopen. PASS. |
| Passed versus failed/unknown/budget/fatal/resolved assertion |Author all report outcomes, configured warning threshold and fatal resolved flag; independent fatal-resolved/unknown/budget/unexamined variants all block direct completion and retain reports across reopen. PASS. |
| Exact current artifact/semantic meaning versus old success |Author changed artifact plus all semantic kinds. Independent loop separately changes goal/constraints/clarification/branch/context, keeps old artifact digest exact, then requires AUDIT_STALE before and after reopen. Old report remains historical. Procedural claim/settlement alone does not invalidate unchanged meaning. PASS. |
| Duplicate versus contradictory same-round report |Author exact duplicates retain receipt, changed same command conflicts and new contradictory report fails AUDIT_REPORT_CONFLICT without erasing prior failure. PASS. |
| Approved repair with lineage versus direct primitive bypass |Author facade atomic claim and direct exact-grant omission; independent omitted auditRepair fails AUDIT_BINDING_MISMATCH with snapshot unchanged, attempts0, no worker/SQL claim/reservation. PASS. |
| Configured repair0/shared total attempts |Independent configured0 fails AUDIT_REPAIR_LIMIT before charge; author bounded prior report/round, shared total admission exhaustion, changed-byte fresh review and unchanged-byte evidence repair retain failure history. PASS. No automatic repair/retry is introduced. |
| Requirements15/16/17 hard cap |Independent API-configured16 mandatory requirements remain,17th fails RECORD_LIMIT with complete snapshot unchanged and direct completion still AUDIT_PENDING. PASS. Material/findings/report/round ceilings are separately normalized/author-tested; no unexecuted exhaustive all-cap product claim. |
| Cancellation/recovery/immutability |Author late report after cancellation denies and held claim survives reopen. Current complete command/MAC receipt mutations fail before historical result reuse; audit/semantic/execution lost inverse rows refuse startup. PASS. |

## Each source AC

| AC | Current observable proof | Remaining applicable gate |
| --- | --- | --- |
| BUB015-01 |Actual exact individually allowlisted material, complete coverage/unexamined partition, wrong target/foreign data denied. Local public native product fixture reads only privately bound artifact material. |Full supported native reviewer input/adversarial material and visible source/coverage presentation. |
| BUB015-02 |Different producer/reviewer generation and charged claim required; author, correctness and ISTQB identities/reports remain separate. Synthetic private reviewer cannot replace development sign-off. |Root final frozen committed tree and complete independent review records. |
| BUB015-03 |Direct core gate blocks pending/failed/unknown/budget/unexamined/fatal/threshold/stale; exact artifact/material/task semantic versions retained after reopen. |Actual review-model failure/quality and supported native UI/state presentation; no deterministic report fixture is credited as model audit quality. |
| BUB015-04 |Explicit bound0..8, approved charged repair lineage, direct omission/zero/shared exhaustion refusal, fresh exact review and immutable prior history. |Full native reviewer/repair run, owner escalation interaction and consolidated race/fault regression. |
| BUB015-05 |Malicious authority/prose/path fields, producer reuse, wrong material/claim/target and unrelated plaintext deny; no grant/send/scope expansion from report. |Final native adversarial input/output and browser control regression. |

Provider-neutral chat scope follows the owner amendment; live chat accounts/delivery are OUT this phase. This does not waive audit, native DSH, artifact, security or visual criteria.

## Failure history and limitations

Author initial actual activation found an absent a.kind access where the core action exposes a.spec.kind. Core repaired report/repair checks and moved repair preflight under the atomic claim. The author retained the10/35 activation failure, later35/63 and36/64 checkpoints. This reviewer does not claim finding ownership; current held tests preserve all checks and pass.

This lane's requested-action absence fixture initially expected null and failed31/32. The correction explicitly proves omitted metadata, attempts0, no corresponding worker, SQL claim_id null and reservations0; denial and whole-state equality remain. The complete169-case retest passes. No production source was edited by the reviewer.

Actual process report-versus-repair/completion ordering beyond the recorded cases, full supported native review/repair execution, real model/tool/catalog evidence and actual browser visualization remain planned oracles. No full BUB015 acceptance, product release or whole-Stage3 verdict is made before root's exact final freeze and consolidated regression.
