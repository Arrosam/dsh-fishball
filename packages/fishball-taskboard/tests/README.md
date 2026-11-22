# fishball-taskboard's tests

The package's own tests (docs/testing/README.md). Run them with

```bash
node scripts/test.mjs fishball-taskboard
```

| entry | area | what it covers |
|---|---|---|
| `taskboard.test.mjs` | [taskboard/](<taskboard/USE-CASES.md>) | the row: tools, routes, wake notice, compaction reminder, persistence, the package surface |
| (view) | `view/` | the Task board tab (browser half): see the section **view** below |

## taskboard

Ported from `test/v3/fishball-taskboard` (2026-11-22, the test restructure). The cases, their
derivation and the oracle sources are in [taskboard/USE-CASES.md](<taskboard/USE-CASES.md>); the
oracle values, each with its source (REQ, DOC §n of
[docs/plugins/fishball-taskboard.md](<../../../docs/plugins/fishball-taskboard.md>), SURFACE, DSH), are in
[taskboard/constants.mjs](<taskboard/constants.mjs>).

**Techniques.** Use Cases (TB-UC), Equivalence Partitioning (TB-EP), Boundary Value Analysis (TB-BVA),
Decision Tables (TB-DT), State Transitions (TB-ST): 154 cases. A case that depends on one of the
document's PENDING choices (statuses, memo, limits, delete) says "provisional" in its title; each such
value is one constant.

**How it is observed.** In-process ([taskboard/world.mjs](<taskboard/world.mjs>)): the real row
(`index.js`, imported with `fishball-test-helpers/bind` `rowModule`, so its `@deepseek-ai/*` imports
bind to the current DSH) mounted as a loader row of the current DSH, over that DSH's real
`dsh-storage` + `dsh-storage-json` + `dsh-storage-domain` in a temp root and a real `SessionStore`
(`fishball-test-helpers/dsh` `importDsh`). Fakes stand only for the host services: `connection.fetch`
(the routes are called with real `Request`s), `fishballInstance` (apiVersion 2: manager, X2
`registerSetup`, `notify`, the live agent's `inject`) and `appReady`. A restart closes the whole DSH
and opens a new one over the same root. What is asserted is public: tool values, route responses and
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

TB-UC-01…05 · TB-EP-01…09, TB-EP-12 · TB-BVA-01…12 · TB-DT-01…05 · TB-ST-01…05 (rows per id in
[taskboard/USE-CASES.md](<taskboard/USE-CASES.md>)).

## view

<!-- To be filled by the agent porting test/v3/fishball-taskboard-view into tests/view/. -->

*(Reserved for the Task board tab's suite, `tests/view/`: written by its own port.)*
