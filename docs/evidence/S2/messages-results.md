# Stage 2 messaging, results and controls

Author: delegated `prep_messages_results`, Sol6.1 high. Scope: BUB005 module behavior and local BUB013/BUB014 control primitives under the owner's 2026-10-04 08:46UTC three-stage authorization. Full native/provider/visual regression remains deferred to the final consolidated gate; this unit does not imply ticket acceptance, release or stable status.

## Frozen source AC and risk boundary

All BUB005-01..05, BUB013-01..05 and BUB014-01..05 remain unchanged in their source cards. The reviewed prep contracts, shared vocabulary and PREP-01..13 guide implementation but provide no authority. This unit must preserve trusted opaque capability identity; owner/workspace/task/session-generation isolation; exact version/epoch/grant/content binding at one claim/outbox transaction; revoke/cancel ordering; full immutable dedup; accountable unknowns; bounded original-source/purpose relay; distinct accepted/outbox/sent/consumed facts; artifact version/digest and independent review; separate historical delivery/current access; partial per-file retry; explicit report verification; progress policy/dedup; optimistic controls and refreshed snapshots.

Highest-risk module tests: forged roles/capabilities and other scopes; session ID reuse; revoked/current epoch and stale version; transport timeout after side effect; reopen after committed outbox; digest conflict under the same source identity; relay cycle and byte/hop bounds; artifact mutation between review and delivery; forged or wrong-version receipts; partial batch retries; progress suppression/coalescing; double-click and stale controls; cancellation with retained unknown reservations; synthetic secret canaries and absence of filesystem path input/symlink escape.

Store/API dependency: `ledger_core` alone owns schema/migration and the authoritative typed transaction API. The broker/result/control modules may not create tables, private durable stores or SQL access. Host/provider/session and artifact-opening observations are injected trusted adapters; a serialized flag or model summary never counts as receipt, identity, review or operator consent. Native services remain default deny until separately verified. No install, paid inference, live account/channel, host launch, Git or unrelated file mutation is authorized for this lane.

## Evidence disposition

Implementation and module commands/results are recorded below against the published typed core API. Independent code and ISTQB review remain required before development integration. Actual native worker consumption, recipient permissions/channel opening, current DSH UI controls and visual/keyboard/window behavior are unexecuted Stage3/final-regression obligations, not passed mocks.

## Implemented local unit and module evidence

`MessageBroker` accepts only opaque core-authenticated handles and exact session/generation contexts. Payload sender/role/grant flags are closed out; native recipient hooks are trusted constructor injection. Its complete immutable metadata is held in the core ledger, forwarded origin is reconstructed from scoped immutable consumed predecessors, and bounded loop/hop/body checks occur before acceptance. `claimAction(outbox)` atomically links the exact approved immutable target/data to committed message and reservation before the callback. Repeated active/unknown/sent/consumed dispatch calls return existing facts; timeout/invalid-generation receipt stays unknown with no blind resend. Worker/reviewer callers cannot dispatch other senders' messages. Reviewer reports are narrowly own-generation verification bodies of category review_result; they cannot grant controls or authority.

`ResultPipeline` writes bounded text artifacts through a single encrypted scoped core transaction that checks and associates immutable incrementing versions (no filesystem path API). Version, producer-binding, association-capacity or progress-reference conflict failures leave data, task CAS and command receipt unchanged. Independent verification requires a separate task/generation-bound reviewer with admitted charged review action; producer identity and exact material/version/digest remain bound. Mutation leaves latest version unverified, preserves immutable historical versions, and blocks old accepted delivery at the current-artifact check (also guarded by core's atomic claim). Delivery accepted, outbox, sent, actual opening-confirmed delivered, failed and unknown remain distinct from task completion. Later revoked current access preserves the original exact recipient-opening receipt, including after the reservation was legitimately settled and the store reopened. Retry uses a new intent/action/claim and persisted predecessor identity; the core requires confirmed failure and the exact old release before accepting it. Delivered and unknown sibling items receive no batch resend.

Reports require original-goal/completed-scope/unfinished/next-step references and explicit passed/failed/not_run/stale evidence disposition. Progress facts persist and deduplicate; an explicitly injected policy returns quiet/coalesced/eligible local decisions without inferring notification delivery. Actual notices, deferred-notice draining, recipient channels and associated delivery receipts remain complete Stage3 BUB013 work; no native/provider success is claimed by this local primitive.

`TaskControl` submits immutable scoped task/auth CAS and durable command identity to the core. Double-clicks return one outcome; changed content under an existing command conflicts; stale pages receive current-version stale outcomes and fresh authoritative snapshots. Pause/cancel blocks new admission while in-flight facts/reservations remain. Cancellation with held work reports partial/requested and query_effect, never observed termination. Lost control replies report unknown until authoritative refresh. Lists use explicit bounded pagination and show total/more information rather than silently truncating; actual UI buttons/render/focus remain Stage3 work.

Command: `node --test test/messages.test.mjs test/results.test.mjs test/control.test.mjs` under actual Node v22.22.2: **28 passed, 0 failed, 0 skipped** (messages11, results12, controls5). Uses actual authoritative SQLite transactions/encryption/reopen and injected synthetic adapters. Includes callback-after-effect timeout, immutable input during async duplicate dispatch, revocation-first zero callback/claim, sender and owner forgery, scoped collision, same-ID immutable conflicts, bounded relay and independent receiver-generation checks, own verification reports, unrelated-body denial, registered secret rejection/encrypted-byte canaries, current/historical artifact/delivery distinctions, exact released failed-item lineage, UTF-8 65,536-byte boundary, quiet/coalesce/progress dedup, fresh snapshots/CAS/pagination and cancel-held reservations. No package install, native host launch, browser action, real model invocation or remote mutation occurred.

Author snapshot SHA256 after S2-CR08 remediation, for independent retest:

| Artifact | SHA256 |
| --- | --- |
| src/messages.mjs | a44d8ba0d2fff046bee618e4e3affd08ec79f662a09b13745d9d60e6ca030a6d |
| src/results.mjs | 94c334bdf1d4b00d1526f38294f5949071d2c1a057b1459c8809ad549f3762c7 |
| src/control.mjs | a41673f9a4f5de6825b6f3c49f4796a55ed6051d043fb02b41737f517323cd2f |
| test/messages.test.mjs | 82c77813fe9b7c792f458a77718efa9872d4daa83c5e0b8abe40af01b8e52f20 |
| test/results.test.mjs | 7f6ba4d095ab1aa319933eb3bfe4ac60fdbeb454abaf6dc658c52774c5bc94fe |
| test/control.test.mjs | 89245eec97b7083eb0e7d0feaa112aa0a88384dda60a37e5f22eaa371bc349ad |

## Source AC disposition and remaining evidence

| Source AC | Local evidence / remaining oracle |
| --- | --- |
| BUB005-01 | Core opaque caller scope/endpoint checks, authorized body/worker relay, wrong owner and unbound role denial; actual native parent recipient observation remains deferred. |
| BUB005-02 | Compound claim+outbox, exact grant/current version/epoch and sequential revoke-first plus async already-claimed window; independent-process concurrency and final native transport race regression remain separate review/final tests. |
| BUB005-03 | Same-ID immutable conflict, no repeated effect callback, persisted unknown/reopen and reservations; full process fault matrix/actual arbitrary recipients remain final oracles. |
| BUB005-04 | Pure and SQLite two-hop origin/purpose/source retention and loop checks; actual native multi-session route remains deferred. |
| BUB005-05 | Accepted/outbox/sent/consumed distinctions and exact receipt binding through trusted synthetic callback; real recipient consumption remains unverified. |
| BUB013-01 | Complete reference report and explicit evidence/not_run checks; actual human report rendering/readability remains Stage3/final work. |
| BUB013-02 | Actual encrypted bytes, immutable versions, independent charged reviewer, stale-current delivery refusal, recipient-opening mock receipt and historical/current access; real recipient channel/permissions/opening remain deferred. |
| BUB013-03 | Per-item durable outcomes, new failed-item retry lineage after exact release, no replay of delivered/unknown siblings; real multi-file provider regression remains deferred. |
| BUB013-04 | Persistent progress facts/dedup and explicitly injected quiet/coalesce policy decisions; actual timely native/channel notice queue/draining/coalescing and receipt integration remains Stage3. |
| BUB013-05 | Actual timeout-after-mock-effect persists unknown/reopen/no automatic replay; real selected provider records and unsupported-query behavior remain deferred. |
| BUB014-01 | Core consistent dated snapshots, refreshed current state and bounded explicit task pagination; real list/detail UI equality/render remains deferred. |
| BUB014-02 | Local status/control primitive and requested cancellation with held execution; actual applicable button/capability matrix remains Stage3. |
| BUB014-03 | CAS/durable idempotency/stale facts, lost-reply unknown and explicit refresh; actual old-tab/reload/remote UI race remains deferred. |
| BUB014-04 | Not run: actual supported DSH UI resize, long Chinese, keyboard/focus/font/empty/loading/error and large lists. |
| BUB014-05 | Scope/generation/material checks and ref-only snapshots; actual authorized shortcuts/native UI entry remain Stage3. |

S2-CR02's historical delivery/current-access contradiction was fixed in coordinated core/module edits and retested against actual SQLite before and after exact release/reopen. Independent reviewers still own their final findings and acceptance disposition. This author evidence is a development module check, not product runtime audit, acceptance, release or a replacement for the complete deferred debt register.

S2-CR08 found an intermediate two-transaction artifact-write gap. The pipeline now calls typed `writeArtifact` and `writeProgress` composites. Actual SQLite regressions prove rejected initial version, invalid producer binding, changed progress content and association-capacity exhaustion preserve the complete task/data/artifact/progress/action/receipt snapshot, including after reopen. A previously rejected command can subsequently succeed with corrected content; successful duplicates retain one receipt. The 28-test run above supersedes the earlier 26-test author snapshot; independent reviewer retest remains separate.

RT-T03 independent testing found out-of-order current-access observations could restore older permissions. Core now rejects older or equal-time contradictory observations before append/update while retaining exact duplicates. The timeout-query fixture uses a genuinely later trusted observation timestamp (1500 after 1000), preserving its no-resend and held-unknown assertions. The same 28-test author command passes with this guard; independent monotonic-access regression remains reviewer-owned.
