# Stage3 runtime independent audit

Author: delegated `prep_messages_results`, Sol6.1 high. Source BUB015-01..05 remains unchanged. Product runtime review is separate from independent development code and ISTQB review. Neither this unit nor a product reviewer report signs off its own development, accepts a ticket, releases the product or satisfies deferred native/provider/UI regression.

## Frozen acceptance and risks

Audit input binds one owner/workspace/task, exact artifact version/content digest, individually allowlisted encrypted material records and an explicit owner-configured policy. Material coverage and unexamined portions remain visible. Only a trusted independent reviewer generation with an admitted held exact review claim may report; review and repair consume the existing shared resource and attempt budgets. No summary, worker terminal state, payload role, severity or resolved flag grants authority or completes a task.

An authoritative core completion gate must preserve pending, failed, unknown, budget exhausted, stale, incomplete coverage, fatal and policy-blocking reports. Artifact or audited-material changes invalidate prior success while preserving historical reports. Bounded repair lineage links exact approved repair claims and prior reports; the configured bound hands remaining work to the owner. No chosen defaults for D13 categories, severity thresholds or rounds. Reviewer roles may not grant, expand scope, send sensitive content or read unrelated private material; malformed or malicious output rejects without effects.

Highest-risk tests: writer self-review and reused generation, uncharged/stale/wrong-material review claim, cross-owner/task reads, completion attempted directly on the store, unknown or exhausted reviewer, mutable artifact during review, conflicting same-round results, incomplete coverage, report replay/CAS, bounded repair under shared budgets, cancellation race and reopen. Adapters remain mock-only. Actual provider/DSH reviewer execution and UI presentation are final acceptance debt.

## API coordination and implementation status

Typed proposal coordinated with `ledger_core`: `configureAudit`, `reportAudit`, `recordRepair`, `audit`, and `snapshot.audits`, plus the core `revise(completed)` gate. No private audit database, SQL or alternative authority is permitted. Schema4 implementation waits for the parent-controlled Stage2 integration. Pure closed normalization and the capability-bound facade can be prepared first; actual authoritative transaction and reopen tests require the published implemented API. No passing runtime gate is claimed from schema validity alone.

## Prepared pure unit

`src/audit.mjs` exports immutable closed material/policy/requirement/report/repair normalizers and `RuntimeAudit`, which forwards opaque handles only to the typed authoritative store methods. Material canonicalization sorts individually bound record references; its digest is not a proof of review or consent. Configuration requires explicit task/auth CAS, audit revision, policy provenance, blocking severities and repair bound. Repair requires task/auth CAS, prior immutable report and exact claim/generation. Fatal blocking is a core invariant; an empty configured severity list selects no additional threshold. Structural repair ceiling8 does not select a product default.

Command `node --test test/audit.test.mjs`, actual Node22.22.2: **6 passed, 0 failed, 0 skipped**. These are pure metadata/facade tests only: canonical material and changed bytes, bounded explicit policy, getter/proxy/hidden/role/prose/path rejection without callbacks, coverage/unknown/fatal metadata preservation, bounded lineage, unavailable typed capability and opaque-handle forwarding. No SQLite audit completion gate, reviewer or repair runtime assertion is claimed from this run.

| Retained source AC | Prepared boundary / required actual oracle |
| --- | --- |
| BUB015-01 | Individual material references/digests and explicit coverage/unexamined arrays; authoritative reviewer allowlist and unrelated data denial require core integration tests. |
| BUB015-02 | Development author/code-reviewer/ISTQB identities and reviewed hashes remain separately recorded; product runtime reports cannot self-sign development acceptance. Trusted independent producer/reviewer generation check requires core tests. |
| BUB015-03 | Reference-only unknown/budget/failure/fatal findings preserved; required direct-store completion gate and current task/material/artifact version binding require core tests. |
| BUB015-04 | Explicit repair bound and prior-report/claim lineage normalized without dispatch; shared charged budgets, approved repair, no implicit retry and owner escalation require core tests. |
| BUB015-05 | Closed output rejects authority flags, paths and raw prose before typed calls; actual forged reviewer/grant/send/cross-task denials require core tests. |

Typed revisions agreed with core: `expectedAuditRevision` is mandatory (0 for new audit), materialDigest equals canonical sorted material, reportRef equals commandRef, one immutable report per round and contradictory report conflicts. Reconfiguration preserves history and requires prior admitted bounded repair; repair carries normal task/auth CAS. The core will enforce full scoped bindingDigest and fatal blocking independent of serialized findings flags. Source task-version change during review remains an explicit risk requiring a meaningful goal/constraints/context invalidation oracle, rather than an artifact-only gate.

Published candidate API: `docs/runtime-automation-api.md`, coordinated with `ledger_core`. Configure returns auditRef/auditRevision/bindingDigest/materialDigest/round/state. BindingDigest covers complete scoped requirement; exact review/repair targetDigest equals bindingDigest and dataDigest equals artifact bytes digest. Core will track semantic changes separately from procedural claim/settlement CAS so new goal/constraints/context invalidates the gate without invalidating an otherwise unchanged review merely because its own claim advances the task version. Schema4 and actual transaction tests remain unavailable until the root-reviewed Stage2 integration handoff.

Owner phase clarification relayed by root: project rename to dsh-fishball (df) and MIT are coordinated by root only; this lane performs no concurrent rename. No chat provider is selected or connected in this phase. Live account/chat delivery acceptance is outside this phase; provider-neutral adapter contract work remains in scope. No external inference or provider calls occurred.
