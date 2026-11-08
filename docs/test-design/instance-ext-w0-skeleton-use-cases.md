# W0 skeleton use cases — pinned U14–U22 reconciliation

## Authority and boundary

Requirements only: canonical [instance extension design](<../../../design-instance-ext/docs/plugins/instance-extension-points.md>) pinned **`15d6f1f214144db3575f9bc0ba15238b1450c2a7`**, §0 U14–U22, §12 and task rows §5.4/§5.5, plus [one-way MCP decisions](<../../../design-instance-ext/docs/plugins/connector-mcp-option.md>) and [approved design](<../../../design-instance-ext/DESIGN.md>), incorporating fold-notify/watchdog/board source designs. Canonical decisions override old source wording. FN-1/WD-1/B1 remain local W0 skeletons with no new transport dependency. No product source was read or changed. Existing package-loading support and per-file Cordis stubs are reused; no shared harness changed. Use Cases below are the human stories defined before test edits; executable skeleton observations are not the later live outcomes.

A row `apply` test is a skeleton load, not proof that Samuel's bundle switch, supervision, board, browser or real model loop works. Later journeys are defined below and remain named `it.todo` with their owners. U14 removes approval-time settings, R4 `expiresAt` budgeting and the window-sum test: **WD1-BVA-02 is retired, not blocked**. U15 removes X3 from skeleton stubs; namespace registration belongs to PG-1. U17 removes decision-audit/label retention, not non-decision operational audit. U19 is board **visibility**, not archive pruning.

## Human stories and retained flow IDs

Samuel is the primary actor; Fishball is his assistant. LOAD/CONFIG/BUNDLE IDs are steps beneath human goals, not separate human stories. W0 executable skeleton checks observe package exports, schema/defaults and stub `apply`. Deferred outcomes are requirements predictions, not UI evidence.

## Story 3 — Samuel keeps a busy Fishball conversation manageable (FN-1)

**Everyday trigger:** Samuel returns after other work to a busy Fishball conversation. He wants folded/notification contributions when enabled, sensible defaults, and the option to switch them off without losing his choice on restart.

**Outcome / never happens:** The later feature should make his conversation manageable; disabled contributions must not linger. Skeleton load/schema checks do not prove folding, notifications, attention or persistence.

| Story step | Existing IDs | Evidence / owner |
| --- | --- | --- |
| Start with the plugin available, including an older instance. | FN1-UC-LOAD-M, FN1-UC-LOAD-A | Executable FN-1 stub load. |
| Keep defaults, choose a supported setting, or correct an invalid setting. | FN1-UC-CONFIG-M, FN1-UC-CONFIG-A, FN1-UC-CONFIG-E | Executable schema/default validation; EP/BVA partitions remain independent. |
| Switch the bundle, or encounter unavailable placement. | FN1-UC-BUNDLE-M, FN1-UC-BUNDLE-A, FN1-UC-BUNDLE-E | TODO X0-B; later FN tasks prove contributions. |

### FN1-UC-LOAD — load the row (FN-1, X1/X2)
- Preconditions: installed skeleton, required tools stub, valid empty config.
- M: supply public `fishballInstance`; call `apply`; load completes.
- A: omit the optional service on both context surfaces; load still completes.
- Missing package is existing harness diagnostics, not a separately specified recovery flow.

### FN1-UC-CONFIG — choose notification settings (FN-1, X18)
- M: omit settings; defaults are `foldDefault=true`, `systemNotification=when-hidden`, `batchWindowMs=1500`.
- A: accept both valid boolean choices; FN1-EP-02 independently covers notification-policy partitions.
- E: `foldDefault='true'` is rejected. Schema-only checks do not assert persistence/rollback.

### FN1-UC-BUNDLE — switch bundled fold-notify (X0-B, X17/X18)
- Preconditions: disposable child with initialized profile and bundled package, using ordinary DSH plugin management.
- M: first placement enables once; disable then enable restores membership and row loading.
- A: disable survives restart/upgrade; no tool/persona/batcher/presenter/attention contribution; attention resets, seen data stays.
- E: missing/unsafe placement logs `BUNDLED_PLUGIN_UNAVAILABLE`; child starts without this plugin, other placements proceed.
- Postconditions: main profile unchanged; bundled removal is refused `bundled-plugin`. All three are TODO, not W0 evidence.

## Story 4 — Samuel saves Fishball tokens with a small-context helper (WD-1)

**Everyday trigger:** Samuel delegates work and sometimes stays at his desk, sometimes leaves. The watchdog absorbs frequent permission wake-ups and routine supervision in a smaller context in **both** cases; it applies Fishball's existing permission rules, not an extra security layer. Midway Samuel may choose Fishball's direct handling, then deliberately enable the helper again.

**Outcome / never happens:** Routine permission decisions cost less context regardless of Samuel's presence. A request is decided or escalated immediately, not budgeted against a deadline. Turning the helper off **or any detected failure** immediately hands work to Fishball without stopping sessions or erasing briefs. Only enabled **and healthy/ready** is effective on; configured but unregistered/failed is effective off, never a send refusal. Recovery never silently resumes or reclaims kept briefs. Questions and plan reviews always go to Fishball, never watchdog claims/context. W0 proves schema/stub load only, not these live outcomes.

| Story step | Existing IDs | Evidence / owner |
| --- | --- | --- |
| Load the helper with or without the optional instance service. | WD1-UC-LOAD-M, WD1-UC-LOAD-A | Executable WD-1 stub load, not supervision proof. |
| Keep supported defaults, change output budget, or submit an invalid value. | WD1-UC-CONFIG-M, WD1-UC-CONFIG-A, WD1-UC-CONFIG-E | Executable schema checks under U7/U14/U17. |
| Use the helper while present or away; disable it or encounter failed placement. | WD1-UC-BUNDLE-M, WD1-UC-BUNDLE-A, WD1-UC-BUNDLE-E | TODO X0-B/X0-S/WD-13 as below. |
| Re-enable deliberately, or encounter enabled-plugin failure. | WD1-UC-BUNDLE-R, WD1-UC-BUNDLE-F | TODO X0-C/X0-S/WD-13; immediate effective-off handover and dormant recovery, never fault-induced stop or automatic resume. |
| Ask a question or review a plan, optionally refining direction independently. | WD1-UC-QUESTION-M, WD1-UC-QUESTION-A | TODO X0-I/X0-A/WD-3/WD-4/WD-6/WD-10/WD-11/WD-12; questions never reach watchdog claims/context. |
| Rely on immediate decide/escalate without an approval timeout; answer the unlimited user card and later find the result. | WD1-UC-APPROVAL-M; XA-UC-SETTLE-M, XA-UC-HISTORY-M, XA-UC-HISTORY-A | Named W0 WD continuation TODO WD-8/WD-10/K2/PANELS; U17 server DT checks are executable test bodies only. |

### WD1-UC-LOAD — load the helper (WD-1, X1/X2)
- Preconditions: installed skeleton and agents/tools/llm/profileContext stubs, valid empty config.
- M: public instance stub supplied; `apply` completes.
- A: optional service absent; `apply` still completes (older-instance compatibility).
- Missing package is harness diagnostics, not a specified product fallback.

### WD1-UC-CONFIG — choose helper settings (WD-1, U7/U14/U17)
- M: all **remaining** §9 defaults are declared. `enabled`, `decisionTimeoutSeconds`, `managerReserveSeconds` and `minDecisionSeconds` are absent.
- A: `maxOutputTokens=2048` is accepted; WD1-BVA-01 independently calls each public field schema at min/max and min−1/max+1, not a whole Config with potentially incompatible defaults.
- WD1-DT-GROWTH TODO **WD-1**: retain the non-approval growth constraint `turnGrowthTokens ≥ readMaxBytes × (1 + readsPerTurn) / 3 + card + maxOutputTokens`; with `readsPerTurn=2` (source §2.2), once card-token measurement and rounding are specified, exercise below/equal/above threshold with coherent vectors. A — freeze those deterministic terms now (recommended); B — keep aggregate case deferred to WD-1 freeze. Do not assert every individual field maximum can coexist with defaults, or silently delete this retained constraint.
- E: `maxOutputTokens=255` is rejected.
- Postconditions: check timeouts, intentional-pause polling and `guardFailures`/`guardSeconds` health detection remain. Mandatory `guardRestops` default/bounds assertions are retired: their source-only fault-halted re-stop loop is superseded by U20; no unapproved schema absence/presence is asserted. `auditEntriesKept=2000`, bounds 100–100000, remains for **non-decision operational audit**; it never limits ordinary decision transcripts or defines a decision-retention store. WD-4/WD-8/WD-9/WD-10 own that history behavior, not this schema test. No approval window sum or R4 deadline is asserted.

### WD1-UC-BUNDLE — switch or recover the helper (X0-B/X0-S/WD-13, U1–U8/U16/U20)
- Preconditions: disposable child, bundled helper, supervised entries, briefs/criteria, operational history, ordinary decision transcripts and watches.
- M: first placement enables; manifest membership is configured enablement regardless of user presence. Enabled but unregistered/not ready is **effective off**: both send paths pass, Fishball owns permissions/supervision. Only verified current-generation readiness activates the brief gate; registration alone is not readiness.
- A: manifest removal precedes disposal; `endingReason` is `hand-over`. Immediately invalidate old generation, remove claims/hooks, re-route open permission cards/held items once, preserve briefs/criteria/history, move entries to `handedOver`, and issue one durable/retryable waking notice when sessions are affected. No stop/halt/unwatch/grace timer; gate off; choice survives restart/upgrade.
- E: enabled package unavailable logs `BUNDLED_PLUGIN_UNAVAILABLE`; child starts, effective-off sends pass. Cause is `plugin-gone`, `endingReason` is `failure`, **same hand-over** and one visible fault notice even with zero affected sessions. Configured enablement stays unchanged.
- R: re-enable/repair verifies model/stores/hooks, persists retained briefs dormant before `ready()`, and never reclaims/checks/resumes them automatically. One recovery notice lists nonempty retained briefs; healthy sends then require explicit resume/new brief. Failure to persist stays effective off; stale generation cannot set/claim/answer.
- F: disposal/reload while manifest remains enabled is `failure`: immediate whole-plugin Fishball hand-over, pass sends and one durable cause/session notice, **no grace or fault-induced stop**. Pending notification retry reuses a stable message identity, including same-home recovery; no lost/duplicate delivery. Storage failure opens gate/routes in memory first, then retries persistence/notification.
- Postconditions: no separate enabled Config or `gateOn` file. M/E TODO X0-B + X0-S; A/R/F TODO X0-S + WD-13 (A also switch path X0-B, F local notice persistence X0-C).

### WD1-UC-QUESTION — Fishball answers independently of the helper (U21)
- M: independent question or plan review arrives for an active or paused claimed session. It goes directly to Fishball and never enters watchdog `onCard`, decision queue, X9 claim or side-session context. Fishball may answer/escalate immediately without a timer.
- A: Fishball separately refines direction with the existing `watchdog_refine` revision contract. Failed refinement never withholds, repeats or undoes the answer. Paused/dormant refinement does not resume/check/claim; an active next turn uses the revised section. Failed/off watchdog has no refine authority; direct Fishball handling continues.
- Ownership: both named TODO **X0-I/X0-A/WD-10/WD-11/WD-12** (A also WD-3/WD-4/WD-6). No external watchdog endpoint or callback-MCP topology.

### WD1-UC-APPROVAL — use the helper without waiting on approval timers (U14/U17)
- M: whether Samuel is present or away, watchdog decides/escalates immediately; if a decision turn ends without an answer, the still-open request escalates at once. Fishball similarly decides/escalates, and the user's card waits without a time limit. There is no R4 `expiresAt` budget or custom fail-safe timer. On resolution the normal tool result returns, cards clear, and only reached-layer ordinary history remains.
- Ownership: one named W0 TODO WD-8/WD-10/K2/PANELS; a never-ending call without a DSH-reported failure is not promised elapsed-time escalation. Detailed completion/invalid/error/crash/cancel paths belong to the later owners, not WD-1 schema coverage.

### XA-UC-SETTLE — Samuel answers an escalated request (U17, K2/PANELS)
- Preconditions: request reached Fishball/user and is still open; Samuel sees the user's card.
- M: Samuel answers; normal requesting-tool result returns. Connector pile, requesting-session, Fishball, user-result and instance cards clear immediately. Repeated callbacks/reload never restore any closed card or retained attribution label.
- Ownership: TODO K2/PANELS for requesting-tool/connector/UI integration, not claimed by W0 server checks.

### XA-UC-HISTORY — Samuel can find a reached decision after continuing work (U17/Q-T)
- M: watchdog-only resolution records only in watchdog history, never automatically in Fishball. Fishball/user resolutions record once at each reached layer; a watchdog merely holding a claim without handling gets no decision copy. User resolution wakes Fishball once; own Fishball decisions add no duplicate note/wake. Attribution is ordinary transcript data, not a label store.
- A: compact reached-layer context; the result leaves context but remains searchable in its transcript. Reload restores neither closed cards nor retained labels. Only an explicit `watchdog_decisions` pull may bring watchdog-only history into Fishball's ordinary tool-result context/transcript, subject to normal compaction.
- Ownership: M TODO PANELS/WD-9/WD-10; A TODO PANELS/WD-8 (explicit pull WD-11). These are defined continuations, not a W0 real-compaction/search claim.
- Related executable server bodies: XA-EP-05 now rejects legacy-label/closed-card restoration or history import; XA-ST-03 clears on repeated settlement; XA-DT-06 proves no automatic Fishball record/wake for watchdog-only resolution; XA-DT-07 checks the reached-user once-only note/wake. Requesting-session actual tool-result delivery remains K2.

## Story 5 — Samuel revisits finished work without losing the board's history (B1)

**Everyday trigger:** Samuel returns to ongoing work, changes context injection or temporarily disables board contributions. Weeks later he wants old completed work by a remembered title/note keyword; he may clear finished clutter early, reopen it, or export history before uninstalling.

**Outcome / never happens:** Open work remains available; Done **and Dropped** remain on board for 30 days inclusive unless cleared early, then stay archived and searchable while installed. The 30-day window never deletes archive records. Reopen restores the open board/context projection; clear refuses unfinished work. Optional uninstall export covers the full archive, not merely current board JSON. W0 schema/load tests do not prove any of this storage/UI behavior.

| Story step | Existing IDs | Evidence / owner |
| --- | --- | --- |
| Load board, including an older instance. | B1-UC-LOAD-M, B1-UC-LOAD-A | Executable B1 load/warning. |
| Keep defaults, change injection, or correct an invalid value. | B1-UC-CONFIG-M, B1-UC-CONFIG-A, B1-UC-CONFIG-E | Executable schema checks. |
| Switch board bundle or encounter failed placement. | B1-UC-BUNDLE-M, B1-UC-BUNDLE-A, B1-UC-BUNDLE-E | TODO X0-B; later board tasks prove contributions. |
| Revisit, clear or reopen completed cards. | B1-UC-HISTORY-M, B1-UC-HISTORY-A, B1-UC-HISTORY-E | TODO B2/B3/B4/B5; B2 owns reopen/clear transitions. |
| Search year-old off-board/cleared work. | B1-UC-SEARCH-M | TODO B11. |
| Export before uninstall, decline, or retry failed export. | B1-UC-UNINSTALL-M, B1-UC-UNINSTALL-A, B1-UC-UNINSTALL-E | TODO B10. |

### B1-UC-LOAD — load board (B1, X1/X2)
- M: installed skeleton, tools stub and public points; `apply` completes.
- A: points absent; load completes and logs exactly one `instance-hooks-missing`. Later tools/context/panel must not be added; W0 observes load/warning only.
- Missing package remains harness diagnostics, not a product recovery promise.

### B1-UC-CONFIG — choose board settings (B1, U19)
- M: required defaults `inject=true`, `contextCards=20`. If `doneWindowHours` is retained, its original 24 default and 0–168 bounds apply **only to the recent-done count**. Tests permit the property to be absent, and never treat it as the visibility cutoff.
- A: both boolean inject choices are accepted.
- E: string `true` is rejected. No schema-only UI/persistence claim.
- B1-BVA-02 is conditional on the retained property, not a requirement to retain/remove it. No arbitrary visibility constant name is asserted; B3/B5 behavioral boundaries below own the 30-day projection.

### B1-UC-BUNDLE — switch board (X0-B, X17/X18)
- M: first placement enables once; disable/re-enable restores bundle and the same saved cards.
- A: disable survives restart/upgrade; no tools/context/panel, data retained.
- E: failed placement logs `BUNDLED_PLUGIN_UNAVAILABLE`; other bundles remain loadable.
- Main profile unchanged; bundled removal still refused. All three TODO X0-B with later board tasks.

### B1-UC-HISTORY — revisit, clear and reopen (B2/B3/B4/B5, §12.6)
- M: for both Done and Dropped, `closedAt` age 30 days−1ms / exactly 30 days / +1ms gives on board / on board / off board. Panel and context share that projection (existing context card/character budgets still apply), and archive retains the final snapshot. No installed-plugin housekeeping prunes history. TODO B2/B3/B5.
- A: clear either closed status early; remove from board/panel/context, keep archive; reopen the off-board id from archive and restore its open group in both projections. TODO B2/B3/B4/B5, using existing status-transition rules.
- E: attempt clear for each open status; refuse `not-closed`, board/archive unchanged. TODO B2/B4.

### B1-UC-SEARCH — find old work (B11, §12.7)
- M: search a title/note keyword from a year-old closed card, including an early-cleared card; `board_search` returns the historical hit without changing visibility. TODO B11. The exact query/filter/limit/refusal partitions belong to B11, not a new W0 executable scope.

### B1-UC-UNINSTALL — keep history before explicit removal (B10, §12.6)
- M: accept export; complete archive, including off-board/cleared history, finishes at a chosen location outside runtime before deletion.
- A: explicitly decline export; runtime including archive is deleted.
- E: export fails; runtime/archive remain for retry or later explicit decline. All three TODO B10. “Never deleted” applies while installed, not explicit uninstall.

## Counting, IDs and verification boundary

Counts are top-level test bodies, not assertions or parameter values. Primary techniques are mutually exclusive; LOAD M/A supply secondary DT present/absent rules without double counting. TODO is a defined deferred journey, never executable W0 proof.

Each cell is **executable / TODO**. Only five primary techniques are used; load/config stories have secondary Decision Table rules but are counted once as Use Case.

| Task | EP | BVA | Decision Table | State Transition | Use Case | Total executable / TODO |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| FN-1 | 4 / 0 | 1 / 0 | 0 / 0 | 0 / 0 | 5 / 3 | 10 / 3 |
| WD-1 | 3 / 0 | 1 / 0 | 0 / 1 | 0 / 0 | 5 / 8 | 9 / 9 |
| B1 | 3 / 0 | 2 / 0 | 0 / 0 | 0 / 0 | 5 / 10 | 10 / 10 |
| Skeleton total | 10 / 0 | 4 / 0 | 0 / 1 | 0 / 0 | 15 / 21 | 29 / 22 |

B1 has 10 executable bodies; the optional-field BVA asserts retained bounds only when `doneWindowHours` exists. Counts come from dry registration of test bodies without executing callbacks/importing product code. `node --check` passes all four owned test files; no runtime test was executed by this author. X0-A is parent-owned; the approval continuations below are explanatory stories, not additional cases/counts owned here.

| UC flow group | Executable IDs | Deferred IDs |
| --- | --- | --- |
| FN1-UC-LOAD / CONFIG | LOAD-M/A; CONFIG-M/A/E | — |
| WD1-UC-LOAD / CONFIG | LOAD-M/A; CONFIG-M/A/E | — |
| B1-UC-LOAD / CONFIG | LOAD-M/A; CONFIG-M/A/E | — |
| FN1-UC-BUNDLE | — | M/A/E |
| WD1-UC-BUNDLE | — | M/A/E/R/F |
| WD1-UC-APPROVAL | — | M |
| WD1-UC-QUESTION | — | M/A |
| B1-UC-BUNDLE | — | M/A/E |
| B1-UC-HISTORY | — | M/A/E |
| B1-UC-SEARCH | — | M |
| B1-UC-UNINSTALL | — | M/A/E |
| XA-UC-SETTLE | — | M |
| XA-UC-HISTORY | — | M/A |

**ID migration:** all existing FN1/WD1/B1 UC IDs remain. WD1-BVA-02 → **retired by U14**, not renamed/blocked. WD1-EP-01 now also excludes the three removed approval-time settings. B1-BVA-02 → same ID, conditional recent-done-count bounds, never a presence requirement or panel cutoff. XA-EP-05 → same ID, **discard legacy labels/closed/retired**, replacing “load as manager-decided.” XA-ST-03 → same ID, once-only clear/no labels. New executable IDs: XA-DT-06/07. New TODO IDs: WD1-UC-APPROVAL-M, B1-UC-HISTORY-M/A/E, B1-UC-SEARCH-M, B1-UC-UNINSTALL-M/A/E, XA-UC-SETTLE-M, XA-UC-HISTORY-M/A. Previous DT/default/boolean-to-UC aliases in existing titles remain unchanged; reclassification is not extra coverage.

These 3 human stories contain 16 flow-group definitions (14 skeleton groups plus 2 parent-owned approval continuations), 39 defined UC flows = 15 executable + 24 deferred. Skeleton-only totals are 36 UC flows = 15 executable + 21 TODO. New deferred IDs WD1-UC-QUESTION-M/A cover U21; WD1-UC-BUNDLE-M/E/F replace obsolete enabled-no-owner refusal and fault grace-stop oracles with immediate effective-off behavior. `guardRestops` mandatory assertions are retired, not changed into a new field-removal requirement. [Core use cases](<instance-ext-w0-core-use-cases.md>) owns X0-C inventory independently; K1 and X0-A inventories remain parent-owned. No product, shared harness or parent-owned main test-design doc changes by this author; syntax checks are not runtime passes.

One-way MCP is not a new skeleton feature: external delegated approvals/questions are default-on with no off setting, idle non-polling items wait, first committed outcome wins, and W1 MCP-SERVER removes old control endpoints/exports in the coordinated upgrade with no legacy path. Watchdog `approvalsEnabled` controls its own permission helper only, not an external-delegation off switch. Full transport/settlement tests belong to K1/K2/MCP-SERVER/FB-PUSH and local routing owners, never fabricated FN-1/WD-1/B1 implementation tests.
