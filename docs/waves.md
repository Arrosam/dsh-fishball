# Explicit development waves and gates

A wave is a small development phase. Parallelize ready non-conflicting work using clearly owned files; isolate conflicting changes in branches/worktrees after shared contracts are fixed. Root owns Git changes and integration. Each wave converges into integration tests, independent code + separate ISTQB reviews, finding remediation and final retest before the next wave.

## W1 / M1 foundation (authorized now)
- W1a prerequisite: new local main, tracked AGENTS/workflow/tickets/source AC and foundation interface contract committed BEFORE implementation delegation.
- W1b concurrent split:
  - **Host/bootstrap author:** BUB001; owns src/index.mjs, src/config.mjs, src/host-probe.mjs, package files, scripts/host-smoke.mjs, test/bootstrap.test.mjs and docs/evidence/M1/host-interface.md. Verify installed public native services, Node/runtime compatibility, config and reversible load/reload/unload. No live profile/settings/inference.
  - **Core author:** BUB003/006 plus minimum012; owns src/ledger.mjs, src/foundation.mjs, test/core.test.mjs and docs/evidence/M1/core-design.md. Single transaction domain handles task/action/approval/resource races; established contract is docs/foundation-contract.md.
  - **Independent ISTQB reviewer:** starts risk/test design in parallel; owns docs/evidence/M1/test-review.md and test/adversarial.test.mjs. No core/bootstrap changes. Reviews final tests after code converges. Sol6.1 max.
- W1c dependency gate: authors agree core export/config contract; root integrates host bootstrap with ledger, runs automated and actual supported local functional validation. Separate code reviewer (not either author) and test reviewer audit exact final code. Authors fix findings in owned files; integration and changed-code retests + reviewers' final checks follow.
- W1d exit: all executable bounded M1 AC supported, remaining full-ticket/real-host-profile gates explicitly pending; logical feature history retained and local squash to main. No W2 implementation until this report.

## W2 / M2 native vertical slice (proposed)
Prerequisite: W1 accepted bounded foundation. Freeze coordinator/task/worker/result/context contracts first.
Parallel ready lanes:002 intake/interruptions +008 briefing;004 native worker lifecycle +011 environment/handoff;005 scoped broker;012 resource/model controls;013/014 local reporting/control contract.
Gate: coordinator → durable task → one DSH worker → local result → independent runtime check → report. Actual inference requires separate bounded approval. Integrate/review/retest before next wave.

## W3 / M3 memory (proposed)
Prerequisite: pinned source + license/redistribution decision.007A portability spike may run parallel with independent W2 tasks once source/license work is allowed; cannot claim accepted reuse from static Kotlin support.007B follows007A and uses W1 isolation plus008. Gate: actual portable isolated code reuse, no personal-data import, integrated retrieval/corrections tests.

## W4 / M4 events and first channel (proposed)
Prerequisite: provider/source decisions and accepted006/012 boundaries. Freeze adapter/ingress/outbox contracts.009 events/schedules and010/010A chat adapter/provider can run in parallel; remaining identity/handoff controls use separate owned files. Gate: real chosen-provider and event chain with recovery, scopes and resource tests, then independent audits/retests.

## W5 / M5 presentation and runtime audit (proposed)
Prerequisite: accepted artifact/control/audit contracts.013 results/delivery,014 native UI and015 bounded runtime independent review run in parallel. Gate: actual UI function/visual checks, version-bound artifacts and delivery evidence, bounded audit failures/repair budget tests and independent development audits.

## W6 / M6 full preview MVP acceptance (proposed)
Prerequisite: all source AC from001–015 including007A/B, licenses and unresolved product policies resolved or explicitly accepted by owner.016 full-chain acceptance, migration/export/delete/quit/restart/scoped authorization/admission/fault evidence. Gate: agreed full MVP acceptance before separately authorized upload/public Arrosam/bubbles creation. Default preview; no stable implied.
