# Explicit development waves and gates

A wave is a small implementation milestone within the [approved three-stage development plan](three-stage-development.md). Parallelize ready non-conflicting work using clearly owned files; isolate conflicting changes after shared contracts are fixed. Root owns Git/integration. Each development unit converges through unit/module tests, independent code + separate ISTQB reviews, finding remediation and changed-code retest. Under the owner's08:46UTC authorization, full cross-stage functional/visual regression follows completion of Stage3; retain all [acceptance debt](evidence/acceptance-debt.md).

## W1 / M1 foundation (authorized now)
- W1a prerequisite: new local main, tracked AGENTS/workflow/tickets/source AC and foundation interface contract committed BEFORE implementation delegation.
- W1b concurrent split:
  - **Host/bootstrap author:** BUB001; owns src/index.mjs, src/config.mjs, src/host-probe.mjs, package files, host installation/runner/smoke scripts, test/bootstrap.test.mjs and docs/evidence/M1/host-interface.md. Verify/install/pin latest official Web distribution in project-local isolation, public native services, runtime compatibility, config and reversible load/reload/unload. Synthetic project-local Web profile only; no personal settings/credentials/inference or old Desktop shims.
  - **Core author:** BUB003/006 plus minimum012; owns src/ledger.mjs, src/foundation.mjs, test/core.test.mjs and docs/evidence/M1/core-design.md. Single transaction domain handles task/action/approval/resource races; established contract is docs/foundation-contract.md.
  - **Independent ISTQB reviewer:** starts risk/test design in parallel; owns docs/evidence/M1/test-review.md and test/adversarial.test.mjs. No core/bootstrap changes. Reviews final tests after code converges. Sol6.1 max.
- W1b additional independent Web validation lane: Sol6.1 xhigh reviews actual loopback browser shell and safe native profile/plugin integration after the host runner is ready, with owned evidence/screenshots. It does not accept unimplemented BUB014 UI. Initial Desktop checks stay historical, superseded by the owner-approved Web baseline.
- W1c dependency gate: authors agree core export/config contract; root integrates host bootstrap with ledger, runs automated and actual supported local functional validation. Separate code reviewer (not either author) and test reviewer audit exact final code. Authors fix findings in owned files; integration and changed-code retests + reviewers' final checks follow.
- W1d development integration: reviewed executable bounded M1 subset may squash to local main with feature history retained. Unverified browser/UI/source criteria remain deferred acceptance debt. The owner's newer three-stage authorization permits W2 implementation now; it does not mark M1 fully accepted. Future host breaking updates are assessed explicitly, never silently floated.

## W2 / M2 native vertical slice (proposed)
Development prerequisite: independently reviewed W1 executable foundation and frozen reviewed coordinator/task/worker/result/context contracts. W1 browser acceptance debt is deferred under the newer owner instruction, not a development block.
Parallel ready lanes:002 intake/interruptions +008 briefing;004 native worker lifecycle +011 environment/handoff;005 scoped broker;012 resource/model controls;013/014 local reporting/control contract.
Gate: coordinator → durable task → one DSH worker → local result → independent runtime check → report. Actual inference requires separate bounded approval. Integrate/review/retest before next wave.

## W3 / M3 memory (proposed)
Prerequisite for private portability work: BUB007A triage and pinned source/provenance in an authorized wave. License review may proceed in parallel; redistribution remains blocked until its license decision.007A portability spike may run parallel with independent W2 tasks; cannot claim accepted reuse from static Kotlin support.007B follows007A and uses W1 isolation plus008. Gate: actual portable isolated code reuse, license evidence, no personal-data import, integrated retrieval/corrections tests.

## W4 / M4 events and chat adapter contract
Prerequisite: reviewed006/012 implementation boundaries. Freeze adapter/ingress/outbox contracts.009 events/schedules and010 provider-neutral adapter can proceed in parallel. Under the latest [owner amendment](owner-amendment-2026-10-04.md),010A actual chat software/provider is future and out of this phase. Validate DF010-C01..C05 against the native ledger and synthetic adapters; do not claim provider connectivity. Remaining applicable identity/handoff/event-chain controls remain required.

## W5 / M5 presentation and runtime audit (proposed)
Prerequisite: reviewed artifact/control/audit contracts.013 results/delivery,014 native UI and015 bounded runtime independent review run in parallel. Development checks include version-bound artifacts and bounded audit failures/repair tests plus independent reviews; actual UI function/visual and recipient-delivery evidence remain final-regression gates.

## W6 / M6 full preview MVP acceptance (proposed)
Prerequisite: all currently applicable source AC from001–015 including007A/B and DF010-C01..C05, applicable notices and product policies resolved or explicitly accepted by owner. The owner-selected MIT grant is tracked; actual chat/provider criteria are out of this phase.016 full-chain acceptance, migration/export/delete/quit/restart/scoped authorization/admission/fault evidence. Gate: agreed full MVP acceptance before separately authorized upload/public Arrosam/dsh-fishball creation. Default preview; no stable implied. Mobile/Hydrogen remote-control is much later and out of current scope.
