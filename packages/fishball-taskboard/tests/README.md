# fishball-taskboard's tests

The package's own tests (docs/testing/README.md). Run them with

```bash
node scripts/test.mjs fishball-taskboard
```

| entry | area | what it covers |
|---|---|---|
| `taskboard.test.mjs` | [taskboard/](<taskboard/USE-CASES.md>) | the row: tools, routes, wake notice, compaction reminder, persistence, the package surface |
| `auto-update.test.mjs` | [taskboard/auto-cases.mjs](<taskboard/auto-cases.mjs>) | opt-in auto-updates, reviews, undo, persistence and real model routing; runs on DSH 0.2.2-rc.3 |
| `view.test.mjs` | [view/](<view/USE-CASES.md>) | the Task board tab (browser half): see the section **view** below |

## taskboard

Ported from `test/v3/fishball-taskboard` (2026-11-22, the test restructure). The cases, their
derivation and the oracle sources are in [taskboard/USE-CASES.md](<taskboard/USE-CASES.md>); the
oracle values, each with its source (REQ, DOC §n of
[docs/plugins/fishball-taskboard.md](<../../../docs/plugins/fishball-taskboard.md>), SURFACE, DSH), are in
[taskboard/constants.mjs](<taskboard/constants.mjs>).

**Techniques.** Use Cases (TB-UC), Equivalence Partitioning (TB-EP), Boundary Value Analysis (TB-BVA),
Decision Tables (TB-DT), State Transitions (TB-ST) and prompt-guide cases (TB-PG): 164 cases. A case that depends on one of the
document's PENDING choices (statuses, memo, limits, delete) says "provisional" in its title; each such
value is one constant.

**How it is observed.** In-process ([taskboard/world.mjs](<taskboard/world.mjs>)): the real row
(`index.js`, imported with `fishball-test-helpers/bind` `rowModule`, so its `@deepseek-ai/*` imports
bind to the current DSH) mounted as a loader row of the current DSH, over that DSH's real
`dsh-storage` + `dsh-storage-json` + `dsh-storage-domain` in a temp root and a real `SessionStore`
(`fishball-test-helpers/dsh` `importDsh`). Fakes stand only for the host services: `connection.fetch`
(the routes are called with real `Request`s), `fishballInstance` (apiVersion 2: manager, X2
`registerSetup`, `notify`, the live agent's `inject`) and `appReady`. A restart closes the whole DSH
and opens a new one over the same root. The guide is observed through the current DSH's real
`SystemPrompt` service in a `dsh-scope` manager scope. What is asserted is public: tool values, route responses and
SSE frames, the fakes' recorded calls, log lines by code, and the package's manifest and own
`cordis.patch.yml` (read with the current DSH's own `yaml`).

**Not here.** Rows that need a second package of this repository (the umbrella fishball-amenities
inserting the same row, the board on fishball-core's real page stream) are integration rows. The old
suite had none of its own: its one patch row (TB-EP-12 row 2) reads this package's own patch; the
umbrella's copy of the row is fishball-amenities' AM-DT-02.

**Regression.** TB-EP-05 rows 4 and 5 (a missing `tasks` / `id` answers the typed `invalid-input`
refusal, not DSH's `ToolArgsError`) cover 1cd04063 ("typed refusal for a missing tasks/id"); they fail
on its parent 5b5fe4c2 and pass after it. At that commit the row lived in
`packages/fishball-amenities/taskboard/`, so `--against` (which keeps the folder) cannot reach it; the
evidence was taken by running these tests in an extract of each commit (lead report,
`.runtime/port/port-taskboard-board-failures.md`).

### Case-id index

TB-UC-01…05 · TB-EP-01…09, TB-EP-12 · TB-PG-01…03 · TB-BVA-01…12 · TB-DT-01…05 · TB-ST-01…06 (rows per id in
[taskboard/USE-CASES.md](<taskboard/USE-CASES.md>)).

## view

Ported from `test/v3/fishball-taskboard-view` (2026-11-22, the test restructure): 29 ids, 114 cases. The
cases, their derivation and the oracle sources are in [view/USE-CASES.md](<view/USE-CASES.md>); the oracle values
(the view requirements B1, V1–V12, E1–E2 relayed by the lead on 2026-11-22, the lead's V6 and title-hook
refinements, the package's routes) are in [view/constants.mjs](<view/constants.mjs>).

**Techniques.** Boundary values (TBV-B1, V1, V7, V9, V12), equivalence partitions (V1, V2, V6, V8, V9, V11),
decision tables (TBV-FORM-DT-01 status × subtree × depth × parent → form; V2 colour; V4; V10; E2 save outcomes),
state transitions (V6, V7, V8, V9, E1, E2) and use cases (E1, E2).

**How it is observed** ([view/page.mjs](<view/page.mjs>)). Scripted: `client.js` alone in
`fishball-test-helpers/scripted-page` on the current DSH's Cordis, the right sidebar's services recorded, an
`fishball-test-helpers/event-source` stand-in for the tab's own `/api/fishball-taskboard/events` stream (no
fishball-ui, so no page carrier), the save route answered by the case. What is asserted: the rendered tree's
public markup (`data-fishball-*`, roles, aria), its text and the page's recorded requests. Rendered: the
same tree in `fishball-test-helpers/browser` `documentOf` (DSH's page styles and theme sheets, then the tab's
own sheets) measured in a headless Chromium, light and dark; skipped only where no Chromium exists.

**Regression.** TBV-B1-BVA-01 covers 746a18e0 (the bar fill laid out 0×0): `--against=746a18e0^` fails 8/10,
`--against=746a18e0` passes 10/10.

**Not here.** The board on fishball-ui's page carrier (`fishballPageStream`) and the row's page-stream topic
registration need a second package: integration rows.

### Case-id index

TBV-B1-BVA-01 · TBV-V1-EP-01, V1-BVA-01, V1-BVA-02 · TBV-FORM-DT-01 · TBV-V2-EP-01, V2-DT-01 · TBV-V4-DT-01 ·
TBV-V6-EP-01, V6-ST-01, V6-ST-02 · TBV-V7-BVA-01, V7-ST-01 · TBV-V8-EP-01, V8-ST-01, V8-ST-02 · TBV-V9-BVA-01,
V9-ST-01, V9-ST-02, V9-EP-02 · TBV-V10-DT-01 · TBV-V11-EP-01 · TBV-V12-BVA-01 · TBV-E1-UC-01, E1-ST-01 ·
TBV-E2-UC-01, E2-DT-01, E2-ST-01 · TBV-AUTO-01…02 (rows per id in [view/USE-CASES.md](<view/USE-CASES.md>)).
