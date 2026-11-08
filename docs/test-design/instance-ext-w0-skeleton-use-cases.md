# W0 skeleton Use Cases — defined before test changes

## Authority and boundary

Definitions precede executable-test edits. Requirements only: canonical [instance extension design](<../plugins/instance-extension-points.md>) §1, §2.2–2.5, X1/X2/X17/X18/X19 and U7; fold-notify source design §8/§10/§13/FN-1, watchdog source design §9/WD-1, board source design §9/§11/§13/B1 (source copies supplied under `/private/tmp/fbtest-designs.eoppMc`). Canonical reconciliation overrides the source designs. No product source was read. Existing package-loading support and per-file Cordis stubs are reused without shared harness changes.

A row `apply` test is a skeleton load, not proof that a user's bundle switch works. Later integrated journeys below are fully defined now but remain explicit `it.todo` in the skeleton suites, owned by X0-B/X0-S/WD-13. No behavior is invented for W0. Window-sum, X3, prune age and core gaps are unchanged; WD1-BVA-02 remains blocked.

## Human stories and their existing flow groups

Samuel is the primary actor in each story; Fishball is his assistant. LOAD/CONFIG/BUNDLE IDs are retained step groups, not separate human goals. The desired visible outcomes below are predictions for later integration, not W0 UI evidence. W0 observes package exports, schema acceptance/defaults, and stub `apply` only.

### Story 3 — Samuel keeps a busy Fishball conversation manageable (FN-1)

**Everyday context / trigger:** Samuel returns to a busy conversation after other work and wants fold-notify available with sensible defaults. He may adjust notification policy or turn the bundled plugin off when he does not want its contributions.

**Human outcome / never happens:** He should eventually see the designed folded/notification experience when enabled, and no plugin contributions when disabled; his enable choice must survive restart. Stub load and declared settings do not prove folding, notifications, attention, settings UI or persistence.

| Story step | Existing test IDs | Evidence / owner |
| --- | --- | --- |
| 1. Samuel starts Fishball with the plugin available, including older-instance compatibility. | FN1-UC-LOAD-M, FN1-UC-LOAD-A | Executable stub load, FN-1; no bundle-switch or UI proof. |
| 2. He keeps defaults, chooses a supported setting, or supplies an invalid value. | FN1-UC-CONFIG-M, FN1-UC-CONFIG-A, FN1-UC-CONFIG-E | Executable schema/default checks, FN-1; EP/BVA partitions remain independent. No persistence/rollback proof. |
| 3. He enables/disables the bundle; startup encounters unavailable placement. | FN1-UC-BUNDLE-M, FN1-UC-BUNDLE-A, FN1-UC-BUNDLE-E | TODO X0-B; later FN tasks own feature contributions; later integrated visible outcomes only. |

#### Flow group FN1-UC-LOAD — load the fold-notify row (FN-1; X1/X2)
- Supporting actor / boundary: child plugin loader. Preconditions: installed skeleton, required tools stub, valid empty config.
- M: resolve public row; supply `fishballInstance`; call `apply`; loading completes without rejection.
- A: omit optional instance service on both context surfaces; call `apply`; loading still completes.
- N/A (product exception unspecified): missing package is reported by existing loader support as FN-1 missing-file failure; this is harness diagnostics, not an invented product recovery contract (not a separate product test).
- Postconditions: row load succeeds for M/A; no claim about later notification functionality.

#### Flow group FN1-UC-CONFIG — configure fold-notify (FN-1; X18)
- Supporting actor / boundary: user through plugin-settings validation. Preconditions: row Config available; validation boundary only, not a live settings UI.
- M: user leaves settings unspecified; declared defaults are true / when-hidden / 1500.
- A: user chooses a supported notification policy or boolean; FN1-UC-CONFIG-A separately accepts both boolean choices; FN1-EP-02 retains notification-policy partitions.
- E: user supplies string `true` for foldDefault; Config rejects it (separate executable flow).
- Postconditions: M declares designed defaults; E returns no accepted configuration; persistence/rollback is not asserted by schema-only tests.

#### Flow group FN1-UC-BUNDLE — user switches bundled fold-notify (X0-B; X17/X18)
- Supporting actor / boundary: user in child DSH Plugins page. Preconditions: disposable child, bundled package available, initialized profile; ordinary DSH bundle manager, not a W0 apply stub.
- M (enable): first placement enables once; user disables then enables using normal switch; name is restored in child bundles and plugin loads.
- A (disable): user disables; restart and upgrade retain absence from bundles; no notify tool/persona/batcher/presenter/attention owner; attention resets to zero, seen data retained.
- E (placement): package missing or unsafe path; log BUNDLED_PLUGIN_UNAVAILABLE; child starts without that plugin, other bundles remain loadable.
- Postconditions: user switch survives restart; main-profile bundles untouched; bundled remove remains refused `bundled-plugin` (X18 existing decision coverage).
- Execution: M/A/E TODO, owning X0-B (feature contribution behavior additionally belongs to later FN tasks).

### Story 4 — Samuel takes supervision back without stopping his work (WD-1)

**Everyday context / trigger:** Samuel has delegated ongoing work to Fishball and wants watchdog available with valid limits. Midway he chooses to supervise through Fishball instead, then later turns watchdog back on deliberately.

**Human outcome / never happens:** Turning watchdog off must hand work to Fishball, never halt it or erase briefs. Re-enabling must not silently resume kept briefs. A crash while still enabled must never masquerade as that voluntary hand-over. W0 proves only schema and stub load, not supervision, plugin switching or visible cards/notices.

| Story step | Existing test IDs | Evidence / owner |
| --- | --- | --- |
| 1. Samuel starts Fishball with the plugin available, including older-instance compatibility. | WD1-UC-LOAD-M, WD1-UC-LOAD-A | Executable stub load, WD-1; no bundle-switch or UI proof. |
| 2. He keeps defaults, chooses a supported setting, or supplies an invalid value. | WD1-UC-CONFIG-M, WD1-UC-CONFIG-A, WD1-UC-CONFIG-E | Executable schema/default checks, WD-1; EP/BVA partitions remain independent. No persistence/rollback proof. |
| 3. He enables/disables the bundle; startup encounters unavailable placement. | WD1-UC-BUNDLE-M, WD1-UC-BUNDLE-A, WD1-UC-BUNDLE-E | TODO X0-B/X0-S/WD-13, as assigned per flow below; later integrated visible outcomes only. |
| 4. He re-enables deliberately, or the enabled plugin fails instead of being disabled. | WD1-UC-BUNDLE-R, WD1-UC-BUNDLE-F | TODO X0-S/WD-13; dormant recovery versus failure, never an automatic resume. |

#### Flow group WD1-UC-LOAD — load the watchdog row (WD-1; X1/X2)
- Supporting actor / boundary: child plugin loader. Preconditions: installed skeleton and required agents/tools/llm/profileContext stubs; valid empty config.
- M: supply public instance stub and apply; no rejection.
- A: omit optional instance service and apply; no rejection (canonical older-instance compatibility).
- N/A (product exception unspecified): missing package fails with WD-1 diagnostics through existing support, not a specified product fallback.
- Postconditions: M/A complete load only; no claim that supervision is active.

#### Flow group WD1-UC-CONFIG — configure watchdog (WD-1; X18/U7)
- Supporting actor / boundary: user through settings validation. Preconditions: Config available.
- M: omit settings; every §9 default is declared, except removed enabled setting.
- A: choose supported non-default maxOutputTokens=2048; WD1-UC-CONFIG-A accepts it. WD1-BVA-01 covers endpoints independently.
- E: submit maxOutputTokens below its minimum (255); Config rejects it in a separate executable flow.
- Postconditions: accepted values satisfy specified field bounds; no `enabled` control exists. Unresolved window-sum relation is expressly outside this UC's acceptance oracle.

#### Flow group WD1-UC-BUNDLE — user switches bundled watchdog (X0-B/X0-S/WD-13; X14/X17/X18/X19/U7)
- Supporting actor / boundary: user through ordinary child DSH plugin manager (including non-UI switch paths). Preconditions: disposable child, bundled watchdog, supervised entries/briefs/criteria/audit and watches.
- M (enable): first placement enables; membership of fishball-watchdog in child's dsh.profile.bundles means enabled exactly; while enabled but not registered gated sends refuse watchdog-unavailable; after registration normal X19 brief table applies.
- A (disable): manager saves manifest without name before disposal; endingReason is hand-over; no stops/unwatch/grace timer; preserve briefs/criteria/audit, transfer entries to handedOver, remove claims, one waking hand-over notice; gate off, Fishball receives cards/notices. Disable persists restart/upgrade.
- E (placement): enabled package unavailable; child starts, logs BUNDLED_PLUGIN_UNAVAILABLE, enabled-unregistered sends refuse watchdog-unavailable; failure remains plugin-gone, not user hand-over.
- R (re-enable alternative): name restored; registration restores handedOver entries as dormant, no checks/timers/stops; one notice for nonempty list; sends require active brief until explicit resume/new brief; no notice for empty list.
- F (failure exception): disposal while name remains present is failure/reload, not disable; grace/guard path applies, no hand-over misclassification.
- Postconditions: enabled iff manifest membership, never an enabled Config or gateOn file. Off delegates to Fishball; re-enable never automatically resumes briefs.
- Execution: M/E TODO X0-B + X0-S; A/R/F TODO X0-S + WD-13 (A also X0-B switch path).


### Story 5 — Samuel keeps his work board while changing how Fishball uses it (B1)

**Everyday context / trigger:** Samuel comes back to ongoing work and wants the board available with its designed defaults. He may change context injection or switch the bundled board off temporarily without losing saved cards.

**Human outcome / never happens:** He should eventually see the same saved cards after re-enabling, no board contributions while disabled, and his choice retained across restart. An older instance should not break startup. W0 load/warning/schema checks do not prove a rendered board, retained cards or working settings controls.

| Story step | Existing test IDs | Evidence / owner |
| --- | --- | --- |
| 1. Samuel starts Fishball with the plugin available, including older-instance compatibility. | B1-UC-LOAD-M, B1-UC-LOAD-A | Executable stub load, B1; no bundle-switch or UI proof. |
| 2. He keeps defaults, chooses a supported setting, or supplies an invalid value. | B1-UC-CONFIG-M, B1-UC-CONFIG-A, B1-UC-CONFIG-E | Executable schema/default checks, B1; EP/BVA partitions remain independent. No persistence/rollback proof. |
| 3. He enables/disables the bundle; startup encounters unavailable placement. | B1-UC-BUNDLE-M, B1-UC-BUNDLE-A, B1-UC-BUNDLE-E | TODO X0-B; later board tasks own tools/context/panel; later integrated visible outcomes only. |

#### Flow group B1-UC-LOAD — load the board row (B1; X1/X2)
- Supporting actor / boundary: child plugin loader. Preconditions: installed skeleton, tools stub, valid empty config.
- M: supply public instance points and apply; no rejection.
- A: omit points and apply; no rejection and exactly one `instance-hooks-missing` warning.
- N/A (product exception unspecified): missing package fails with B1 diagnostics through existing support, not a specified product fallback.
- Postconditions: M loads; A degrades without adding tools/context/panel (the W0 observable check is load plus warning; later features own contribution checks).

#### Flow group B1-UC-CONFIG — configure board (B1; X18)
- Supporting actor / boundary: user through settings validation. Preconditions: Config available.
- M: omit settings; defaults inject=true, contextCards=20, doneWindowHours=24 are declared.
- A: choose valid inject boolean; B1-UC-CONFIG-A separately accepts both boolean choices.
- E: supply string `true` for inject; Config rejects it in a separate executable flow.
- Postconditions: invalid type is not accepted; schema tests make no UI/persistence claim.

#### Flow group B1-UC-BUNDLE — user switches bundled board (X0-B; X17/X18)
- Supporting actor / boundary: user in child DSH Plugins page. Preconditions: disposable child with bundled board and saved cards.
- M (enable): first placement enables once; user disables then enables; bundle returns and board shows same saved cards.
- A (disable): disable then restart/upgrade; bundle remains absent, no tools/context/panel; board data retained.
- E (placement): missing/unsafe package logs BUNDLED_PLUGIN_UNAVAILABLE; child starts, other bundles unaffected.
- Postconditions: persisted enable choice, preserved cards; main profile unaffected; bundled removal refused by X18.
- Execution: M/A/E TODO X0-B; later board tasks own actual tools/context/panel.

## Counting conventions and execution boundary

### Exact flow ID ledger

| UC | Executable flow IDs | Deferred flow IDs |
| --- | --- | --- |
| FN1-UC-LOAD | FN1-UC-LOAD-M, FN1-UC-LOAD-A | — |
| WD1-UC-LOAD | WD1-UC-LOAD-M, WD1-UC-LOAD-A | — |
| B1-UC-LOAD | B1-UC-LOAD-M, B1-UC-LOAD-A | — |
| FN1-UC-CONFIG | FN1-UC-CONFIG-M, FN1-UC-CONFIG-A, FN1-UC-CONFIG-E | — |
| WD1-UC-CONFIG | WD1-UC-CONFIG-M, WD1-UC-CONFIG-A, WD1-UC-CONFIG-E | — |
| B1-UC-CONFIG | B1-UC-CONFIG-M, B1-UC-CONFIG-A, B1-UC-CONFIG-E | — |
| FN1-UC-BUNDLE | — | FN1-UC-BUNDLE-M, FN1-UC-BUNDLE-A, FN1-UC-BUNDLE-E |
| WD1-UC-BUNDLE | — | WD1-UC-BUNDLE-M, WD1-UC-BUNDLE-A, WD1-UC-BUNDLE-E, WD1-UC-BUNDLE-R, WD1-UC-BUNDLE-F |
| B1-UC-BUNDLE | — | B1-UC-BUNDLE-M, B1-UC-BUNDLE-A, B1-UC-BUNDLE-E |

| Task | EP executable | BVA executable | DT | ST | UC executable | UC TODO | Blocked BVA | Total including deferred/blocked |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| FN-1 | 4 | 1 | 0 | 0 | 5 | 3 | 0 | 13 |
| WD-1 | 3 | 1 | 0 | 0 | 5 | 5 | 1 | 15 |
| B1 | 3 | 2 | 0 | 0 | 5 | 3 | 0 | 13 |
| Total | 10 | 4 | 0 | 0 | 15 | 11 | 1 | 41 |

Secondary decision-table coverage is preserved by LOAD-M/LOAD-A: instance service present → loads for each row; absent → loads for each row, with one warning for board. These six rules are primarily counted as UC, not double-counted as DT. Existing configuration EP/BVA acceptance and refusal rules remain.

UC primary counts include deferred: FN-1 8, WD-1 10, B1 8. Tests have not been executed; executable means an assertion body exists, not that it passes. Prior syntax-check evidence is not a runtime pass claim; no tests are executed in this story/title-only follow-up.

Primary technique is counted once per test; aliases do not increase totals. UC-LOAD M/A replace DT load cases (six executable flows). UC-CONFIG M replaces default checks (three); E extracts invalid-setting checks (three); boolean alternatives are reclassified as UC and remaining EP/BVA partitions stay independent. Thus 3 human stories contain 9 existing flow-group definitions, 15 executable UC flows and 11 deferred UC flow TODOs. Together with the core document: 5 stories + 12 flow groups; 42 UC flows = 29 executable + 13 TODO. Harness missing-file diagnostic exceptions do not count as separate product flows. Configuration alternatives have separately counted executable UC tests; reclassification avoids duplicating the former boolean EP assertions. A TODO is a defined deferred journey, not W0 coverage.
