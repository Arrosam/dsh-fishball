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

## Stage3 implementation GO

Root authorized implementation after the coordinated physical rename to dsh-fishball, parent-reported branch `feat/S3-integrations` baseline `dd07d1b`. Stage2 source/tests stay frozen. Core is now implementing schema4, rather than waiting for authorization; dependent actual audit tests wait for importable methods, not another owner permission. The complete candidate API remains `docs/runtime-automation-api.md`.

The facade adds `claimRepair` with exact actionRef/actionDigest and task/auth CAS plus auditRef/round/previousReportRef/evidenceRef. It calls one typed `claimAction(auditRepair)` transaction for shared-budget reservation and bounded approved lineage before any repair effect. No adapter, provider, model or task-completion call occurs in this method. The existing `repair` method is the typed exact helper, not an independent grant.

Updated pure command `node --test test/audit.test.mjs`: **7 passed, 0 failed, 0 skipped**. This supersedes the earlier six-test pure snapshot only. A temporary actual-store test fragment covers direct completion bypass, independent charged review/release, unknown/failed/budget/unexamined outcomes, fatal resolved-flag and configured threshold, report conflict/dedup, goal/constraints/clarification/branch/context/artifact staleness, exact repair/history/fresh review, shared attempt budget and zero-repair bound, producer-generation reuse, unbound material/wrong target and cancellation/reopen. It is not activated or claimed passed until the actual core API exists.

## Implemented authoritative integration checkpoint

The actual schema4 audit API is now importable. The facade remains a thin typed capability consumer: no SQL, independent authority, provider/model call, automatic repair, grants or task-completion method. The authoritative core checks exact current artifact and encrypted material digests, owner/workspace/task and semantic revision, a privately bound independent reviewer generation and held charged claim, full approved target binding and current report/repair lineage. The direct core completion gate is tested, not only a wrapper decision. Product verdicts do not constitute development code or ISTQB sign-off.

Command: `node --test test/audit.test.mjs test/messages.test.mjs test/results.test.mjs test/control.test.mjs`, actual Node22.22.2: **63 passed, 0 failed, 0 skipped**. This checkpoint supersedes the seven-test pure-only snapshot: audit35 (23 top-level with nested risk cases; seven pure), unchanged Stage2 broker11/results12/controls5. No Stage2 source/test edit, package install, native host launch, model call, paid inference, external provider or Git mutation occurred. Core is still completing its own integrity/process checks; its final reviewed source snapshot remains the root's integration gate.

Actual SQLite audit proofs:

- Required pending cannot bypass completion via direct `RuntimeStore.revise`. A charged independent review does not itself complete a task; exact known executor settlement releases its holding before explicit owner completion.
- Unknown, failed, budget-exhausted and unexamined reports remain required after known reviewer release and reopen. Fatal findings block even with a payload resolved flag; explicitly configured warning thresholds block too. No missing policy chooses a default.
- Exact report duplicates reuse a receipt. Changed same-command content conflicts; a new contradictory same-round report conflicts and preserves the original. Wrong bytes/material/claim/generation/coverage or authority fields leave the authoritative snapshot unchanged.
- Producer generation reuse under another reviewer role is denied. A charged review of another full target does not certify this audit. Individual material access permits required goal bytes and denies unrelated message bytes; coverage cannot silently omit a configured input.
- Artifact mutation and new goal/constraints/clarification/branch/context invalidate an otherwise passed gate. Procedural review claim/CAS and known settlement do not invalidate unchanged requirements. Owner semantic rebind preserves old history and requires fresh full-target review, even with unchanged artifact bytes.
- Exact approved repair commits bounded lineage and shared reservation atomically before effects. Changed bytes require fresh independent review. An unknown review can instead recover through charged evidence repair without changing bytes; audit revision/round changes the binding so an old claim cannot certify the new round. Both retain prior reports.
- Review and repair share total attempts. Exhausted admission leaves the audit required, while configured zero rounds rejects the repair claim with zero dispatched attempts. Late review after cancellation is denied; task cancellation and the original accountable claim survive reopen.
- Synthetic plaintext artifact and unrelated message canaries are absent from SQLite bytes. There is no path/symlink API or raw report prose in the facade.

Initial actual activation found a core interface defect: `reportAudit` and repair binding read absent `a.kind` although authoritative action records expose `a.spec.kind`. Core author corrected both checks and moved repair preflight under the claim lock before reservation; no core edit was made by this lane. The initial10/35 passing activation was followed by the complete63/63 compatibility retest above. Producer/cancelled-report expected codes were aligned to the implemented stable generic UNAUTHORIZED denial while retaining unchanged-state and held-obligation checks.

Author-owned snapshot for independent review:

| File | SHA256 |
| --- | --- |
| src/audit.mjs | a1f6bff346c7897d4cf5c7cffa2b8f12e1fee5d69cd2a6fc78c4c4d843475beb |
| test/audit.test.mjs | 41e00d3abf4b8631004a8edc7befb65998579b0abcb3c15a44451ff12a28451f |

| Retained source AC | Current local proof / remaining oracle |
| --- | --- |
| BUB015-01 | Individually allowed exact goal/artifact material; unrelated bytes denied; complete coverage partition and explicit unexamined portions tested. Actual supported native reviewer material consumption remains final regression debt. |
| BUB015-02 | Product producer-generation reuse denied and independent charged review tested. Development author/code-reviewer/ISTQB identities and exact reviewed source remain separately evidenced by root and independent reviewers; product reports cannot replace them. |
| BUB015-03 | Actual direct core completion gates pending/unknown/failed/budget/unexamined/fatal/threshold/stale; task meaning/artifact version binding and procedural CAS separation tested, including reopen. Real provider/model failure and native rendering remain outside these synthetic module proofs. |
| BUB015-04 | Atomic approved bounded repair, zero-round/total-attempt rejection, fresh review and retained history tested; unchanged-byte evidence repair is recoverable. Configured thresholds remain explicit, not chosen product defaults; actual native reviewer/repair execution is unrun. |
| BUB015-05 | Reviewer grant/scope and malformed malicious output denied; wrong target/material/generation cannot certify; no raw report/prose/path or provider adapter in facade. Actual native adversarial material and final supported UI regression remain unrun. |

Independent code and separate ISTQB review are now requested against this coherent checkpoint; their findings, remediation and retest will be appended separately. This author checkpoint is an implementation/module result, not acceptance, release, stable status or a waiver of consolidated regression debt. No live chat account/delivery acceptance is added to this phase.

### Final author checkpoint: direct repair bypass regression

The same combined command was repeated after core added direct-claim enforcement for audit-targeted repair: **64 passed, 0 failed, 0 skipped** (audit36, unchanged Stage2 28). The additional actual SQLite regression supplies a fresh exact owner grant but calls direct core `claimAction` without audit lineage. It fails AUDIT_BINDING_MISMATCH with the complete snapshot unchanged, zero attempts and no claim. This proves the primitive cannot be bypassed by skipping `RuntimeAudit.claimRepair`. Only the author test fixture gained an explicit prepare-only seam to inspect pre-claim state; production source remains unchanged.

Final owned source SHA256 remains `a1f6bff346c7897d4cf5c7cffa2b8f12e1fee5d69cd2a6fc78c4c4d843475beb`; final `test/audit.test.mjs` SHA256 is `e0c24d1b1857565b927e5b731f53567f6ea35ed382ff18a3db528b09b60dc0ec`. This supersedes the earlier35-audit/63-combined test snapshot and its41e00d3 test hash; independent reviewers were sent the updated final test hash. Core remains under its own final integrity review.
