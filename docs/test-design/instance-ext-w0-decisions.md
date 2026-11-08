# Historical W0 acceptance questions — superseded by 6f7412b

**Historical record only, not current test acceptance.** All four questions below were answered in the final design: U14 removes approval budgets/window-sum checks; U15 assigns namespace validation to PG-1; U18 requires the concrete core tests in §12.5; U19 replaces prune age with inclusive board visibility and permanent installed-plugin archive history. Current tests follow those decisions. The old explanation is retained for provenance, not as active approval/timer or prune requirements.

## Source provenance

Exact line references below are to `docs/plugins/instance-extension-points.md` **at e002ec3**, not the edited worktree copy. The canonical document has 1178 lines at that commit. Source plugin designs are the exact revisions named in its §0 introduction/table: watchdog **1bef938** and board **fc9bc8d** (canonical lines 9–13). Their contents are not present in the canonical file; claiming their settings tables have e002ec3 canonical line numbers would be misleading. Retrieve immutable sources with `git show e002ec3:docs/plugins/instance-extension-points.md`, `git show 1bef938:docs/plugins/watchdog-design.md`, and `git show fc9bc8d:docs/plugins/board-design.md`.

## 1. Watchdog window-sum validation

### Written requirements and uncertainty

Canonical e002ec3 §5.2 line 439 incorporates watchdog §14 task rows; §6 WD task coverage is supplementary. The actual detailed rule is in incorporated watchdog §9 lines 816–827: defaults `decisionTimeoutSeconds=30`, `managerReserveSeconds=60`, `minDecisionSeconds=10`; “must fit it … ≤120 at the defaults”; the plugin cannot read the connector setting, so R4 uses each approval card's `expiresAt`. Watchdog §14 line 927 nevertheless makes “including the window-sum check” part of WD-1; §15 line 974 calls for sums 120/121. Thus the requirement clearly calls for a check, but does not fully reconcile a fixed save-time 120-second rule with actual per-card deadlines or specify the Config error presentation/code.

Example: Samuel gives watchdog 50 seconds for `decisionTimeoutSeconds`, reserves 60 for Fishball, and sets `minDecisionSeconds=10`: sum 120. Raising decision timeout to 51 makes 121. Defaults sum to 100, not 120. These field values are each independently within §9's bounds. R4 is a different runtime calculation: `remaining=expiresAt-now-managerReserveSeconds`; less than minDecisionSeconds routes directly to Fishball; otherwise decision budget is min(decisionTimeoutSeconds, remaining) (watchdog §6.2 lines 610–614). With 120 seconds left and reserve 60, remaining is 60; a 51-second decision can fit. Conversely, even a valid default configuration must hand over if a card arrives with only 65 seconds left (remaining 5 < minimum 10).

### A — reject the fixed sum at settings validation

Config accepts sum 120, rejects 121 before saving, even though each field individually fits. Samuel receives a settings validation failure; precise copy and rollback semantics still need a specified acceptance contract. This prevents an over-budget combination relative to the standard 120-second baseline. It can also reject combinations that would work for a longer-lived card, because WD-1 cannot read the connector's configured window. Runtime expiry checks remain mandatory.

Work/risk: small explicit cross-field validator and BVA/decision tests now (WD-1); update settings acceptance and WD-10 deadline tests, plus integration WD-12. Risk: hard-coding a main-side default into child configuration; later connector window changes require revisiting the limit. Benefit: closest to the existing WD-1 “window-sum check” wording, catches questionable settings early.

### B — independent field validation plus per-card runtime budgeting

Save the 121 combination if its fields are valid; apply the actual expiry budget when each approval arrives. Samuel sees valid settings, but a short-deadline request is handed to Fishball rather than entrusted to a watchdog turn that cannot finish. This behavior follows the specified R4 calculation; it is not a promise to extend expiry. Exact visible hand-over presentation belongs to approval routing/UI tasks, not WD-1.

Work/risk: WD-1 remains simpler; expressly amend its done-when and the 120/121 test expectation. WD-10 must test actual deadlines and reserve/min boundaries; WD-12 verifies the user journey. Risk: poor combinations are noticed later through more hand-overs rather than a settings error. Benefit: no incorrect assumption about connector settings or remaining card lifetime.

Recommendation: **B**, if the priority is actual deadline correctness, but only after explicit approval of the WD-1 requirement change. If “must fit 120 at save time” is intended policy, choose A instead. Neither choice removes R4. Separately, context tokens are model-dependent: watchdog §9 lines 803–805 uses min(contextRolloverTokens, contextWindow-turnGrowthTokens-maxOutputTokens), not a fixed 200k sum. This must not be folded into an invented timing validator.

## 2. X3 namespace enforcement location

Canonical e002ec3 §1 lines 51–53 says record types are `plugin:<pluginId>/…`. §5.1 line 418 retains only X3's type rule. §5.5 lines 481–484 and §6 lines 530–531 say a foreign prefix “is refused”. But §11.7 line 1095 calls the same rule a “convention” and moves rendering to `uiConversation.events.register`; §1 line 69 still displays the withdrawn projector signature. No surviving public enforcement boundary is specified. This is an actual reconciliation gap, not a question about restoring server projection.

Example: `fishball-board` submits `plugin:fishball-board/card` (own namespace) versus `plugin:fishball-watchdog/report` (foreign namespace). Mistaken identity could produce a misleading row or renderer collision; the documents do not establish cryptographic origin verification, so namespace rejection must not be advertised as complete security isolation.

A: document a surviving instance-owned public boundary that receives plugin identity and record type, accepts own prefix, refuses foreign prefix. Samuel normally notices nothing; a faulty plugin cannot create a watchdog-looking record through that boundary. Plugin author gets a defined refusal, without breaking chat. Work: choose signature/refusal behavior, X0-C validator tests, migrate record producers (FN-3 and watchdog reporting), integrate DSH rendering. Risk: accidentally rebuilding a withdrawn registry or parallel DSH mechanism; benefit: one testable rule early.

B: use DSH's record/node path for enforcement later, or explicitly make the namespace a convention. Samuel sees native plugin rows; a faulty plugin's failure is only caught where the later mechanism actually validates it. If DSH does not support owner-aware validation, a convention alone cannot satisfy today's “foreign prefix is refused” requirement. Work: specify/verify the native enforcement seam (PG-1/PANELS, FN-3/FN-4, watchdog reporting, X-E2E), revise X0-C acceptance and remove the old projector-based tests only after decision. Risk: delay or no enforcement; benefit: fewer custom extension mechanisms.

Recommendation: **A if foreign-prefix refusal remains a W0 requirement**, using the smallest surviving public boundary, not reviving projection. Otherwise B requires an explicit requirement change, not silently treating refusal as documentation. No boundary is chosen by this test-only work.

## 3. Board 30-day prune-age constant

Canonical e002ec3 §5.2 line 444 incorporates board §14 tasks. Incorporated board §9 lines 256–257 specifies frozen BOARD_LIMITS with “cards 300, prune age 30 days”; §14 lines 350–352 assigns constants/config skeleton to B1 and pruning store to B3. Board §6 lines 167–168 prunes closed cards older than 30 days first when the cap is reached; §15 lines 378–379 specifies 299/300/301 cards and age 30 days ±1 ms. The duration and behavior are defined; the exported prune-age property name and unit representation are not. This is primarily a test/public-API naming issue, not an undefined retention policy.

Example: Samuel has 300 cards. When saving another card, a closed card older than 30 days may be pruned first. An open card is not eligible just because it is old. This is not an automatic daily deletion of every card on its thirtieth birthday. 30 days = 2,592,000,000 ms; a mistaken seconds/milliseconds conversion could prune far too early or fail to prune at all. Exact equality handling must follow the specified older-than wording and B3 boundary tests, not an invented skeleton export key.

A: standardize a public key/unit now, for example BOARD_LIMITS.pruneAgeDays=30 (example proposed name, not current design). Developer sees a clear B1 constant test; Samuel sees no immediate UI change. Work: tiny specification/constant-test addition now; B3 still needs real pruning tests. Risk: unnecessary public API coupling and unit-conversion assumptions; direct constant pass cannot prove B3 uses it.

B: let implementation choose the internal key and test observable B3 pruning at 300/301 cards and 30 days ±1ms, plus old open-card preservation. Samuel's data retention, not an export name, determines acceptance. Work: no naming freeze now; add/keep B3 EP/BVA scenarios and B8 integration; B1 does not claim prune-age export coverage. Risk: internal wrong constant discovered later; benefit: black-box tests and fewer artificial API constraints.

Recommendation: **B**, unless BOARD_LIMITS property names are deliberately a supported public API. The 30-day policy is unchanged in either option.

## 4. Remaining X0-C coverage gaps

The requirements are not all ambiguous: most are explicit but incompletely demonstrated. A/B here is a scope/acceptance decision. Canonical e002ec3 §5.1 line 418 requires implemented X1/X2/X10/X11, other typed stubs refusing not-implemented, X19 call sites and watchdog-off pass-through. §1 line 76 says “dedupe is durable”; §1 lines 56–61 requires disposal and callback containment; §2.1 lines 103–110 plus §6 lines 525–529 require resume/live/next-step behavior; §1 line 75 and §5.5 coordination line 498 assign array delivery to chat/X0-C.

Concrete gaps and production risks:
1. **Restart-durable notify dedupe:** same-process duplicate suppression exists; real restart + retry is TODO. A crash after queueing may make Fishball wake twice, repeat a report or duplicate an action. Test stored/reloaded real session state and retry same key, without inventing storage layout.
2. **Typed stub refusal contracts:** member-existence assertions allow empty objects or successful no-ops. A later plugin could think it registered supervision/approval routing when the method does nothing, or crash with TypeError instead of not-implemented. Test the documented public methods and observable refusal; do not guess an error transport shape the design has not defined.
3. **Watchdog-off send pass-through and X19 call sites:** no dedicated W0 test proves both message/redirect paths reach connector when disabled. Fishball could be unable to reply after disable, or a path could permanently bypass the future gate. W0 checks disabled pass-through; X0-S owns enabled gating and full route matrix.
4. **deliverInbox array form:** no dedicated core assertion proves a batch is one ordered manager input and no item is lost/duplicated. Samuel returning to three finished sessions could see only one result, repeated turns, or reordered context. X0-C core array contract and X0-I/FN-6 integration should be tested separately.
5. **Real running-turn next-request/disposal:** fake running status proves immediate fixture tool visibility, not real model request composition. A newly enabled tool may be absent until next turn, or disabled tool/prompt remain offered. Keep deterministic stub tests plus real-loop integration; existing TODO names X-E2E and SP-X1 is prior evidence, not new coverage.
6. **Real loader/package wiring:** row apply under a hand-built service stub does not validate bundle patch contents or real Cordis effect teardown. Plugin can pass unit tests yet fail to load, inject wrong services, or leak registrations on disable. This is cross-cutting FN-1/WD-1/B1/X0-C; real loader smoke and X0-B/X-E2E integration own full verification.
7. **X3 public seam:** current tests call the old projector registration to check prefix ownership. They may force an obsolete API or test the wrong boundary; resolve question 2 before changing them.

A: close the explicit core gaps before declaring task test files a complete definition of done. Users normally notice nothing: duplicate actions, lost summaries, stuck sends and stale tools are prevented. Work now: moderate test-fixture/integration effort (durable real session, real loop, loader), targeted core tests; real integrations still have later owners. Risk: slower W0 handoff and brittle tests if they inspect internals; use public effects only. Benefit: stronger acceptance and cheaper defect localization.

B: explicitly narrow W0 sign-off, retain written scenarios and TODO owners with a scheduled later gate. W0 proceeds sooner; Samuel may encounter those defects if later gates are skipped. Work now: scope/task documentation and ownership, not merely passing skipped tests; later X0-I/X0-S/FN-6/WD-12/B8/X-E2E must add the tests. Risk: integration discovers architecture defects late and a misleading “done” if exceptions are hidden.

Recommendation: **A for explicit X0-C contracts**, with true real-loop/loader integration at its named later gate only if that exception is explicitly approved. No missing test is a proven production bug. Existing TODOs remain predictions; this document does not implement gaps, choose signatures, or change acceptance scope.
