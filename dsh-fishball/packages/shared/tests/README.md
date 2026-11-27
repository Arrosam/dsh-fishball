# fishball-shared's tests

The package's own tests (docs/testing/README.md). fishball-shared is a library with no DSH row: its
two modules are tested by their published names (`fishball-shared/ui-seam`,
`fishball-shared/instance-follower`), as its users import them. Run them with

```bash
node scripts/test.mjs fishball-shared
```

| entry | area | what it covers |
|---|---|---|
| `ui-seam.test.mjs` | [ui-seam/](<ui-seam/cases.mjs>) | the fishball-core / fishball-ui seam: the `./ui-seam` export, every export's exact frozen value and shape, SEAM_TARGETS' routes, SEAM_PAGE_STREAM |
| `instance-follower.test.mjs` | [instance-follower/](<instance-follower/cases.mjs>) | `followInstance` (binding to a compatible `fishballInstance`, following its arrival, replacement and removal) and `reportCoreMissing` (one warning) |

Written 2026-11-27 for the test restructure (port-shared). fishball-shared had no tests of its own;
its behaviour was observed only through its users' suites. No row needs a second package of this
repository; the one that does (UI-UC-07 "E1 drift": SEAM_STATUS's restated words equal fishball-core's
`contracts/constants.js`) is an integration row (port-ui-b's mapping).

## ui-seam

**Sources.** UI-UC-07 (moved here from `test/v3/fishball-ui/package` by port-ui-b; interface item 7),
the K3/K3a oracles for SEAM_STATUS's restated words, R-FIX-FUI F1 (SEAM_PAIRING), LOGO-BUTTON /
BRAND-UC-06 (SEAM_BRAND), the K3a-MULTI oracle for SEAM_TARGETS (MULTI-0 freeze and the MULTI-1 list
amendment) and DESIGN.md §34 (SEAM_PAGE_STREAM). The values and their sources are in
[ui-seam/constants.mjs](<ui-seam/constants.mjs>).

**Techniques.** Use Case UI-UC-07 (main, UI_SEAM, UI_GUARDS, SEAM_STATUS, data only); Equivalence
Partitioning over the exports (SEAM-EP-01: every export deeply frozen data, writes refused), the word
sets (SEAM-EP-02), SEAM_TARGETS' route classes (SEAM-EP-03: GET list vs POST actions, withdrawn
routes, distinct words) and SEAM_PAGE_STREAM (SEAM-EP-04); Boundary Value Analysis on the page's
connection count, 0 / 1 / 2 (SEAM-BVA-01). 24 cases.

**How it is observed.** The module's exports as imported by name; the package manifest's `exports`;
the module's source text only for "imports nothing" (comments blanked). `UI_INSTANCE.apiVersion` is
checked for its type only: no requirement fixes its value today (see port-shared-failures.md).

## instance-follower

**Sources.** fishball-shared's README and DESIGN.md §33 (the shared helper, moved unchanged from the
board), the extension points §1 (one versioned `fishballInstance`; a missing service or another
`apiVersion` is an "older instance", nothing attached), R-FB-06 (one `fishball-core-missing` line
per load, at DSH's app ready, or at load on a host without `appReady`), and the rows of the old
amenity suites that observed it (fishball-heartbeat HB-EP-02 rows 1–7, fishball-taskboard TB-EP-08
rows 1–5, fishball-board PLAT-EP-04 row 1 / PEERS-EP-01 row 1, which stay in those packages). Values:
[instance-follower/constants.mjs](<instance-follower/constants.mjs>).

**Techniques.**
- Equivalence Partitioning over the instance met at load (FOLLOW-EP-01 rows 1–5: none, compatible,
  older, newer, no `apiVersion`) and arriving after load (FOLLOW-EP-02 rows 2–5);
- Boundary Value Analysis on `apiVersion` (FOLLOW-BVA-01 rows 1–6: v − 1, v, v + 1 for the two
  versions the amenities bind, 1 and 2);
- State Transitions: the walk present → replaced → removed → present (FOLLOW-ST-01), and one row per
  further transition (FOLLOW-ST-02 rows 1–6: compatible ↔ older, a late core after an older one, an
  unrelated service event, a provider still loading, the row disposed while bound);
- Decision Table for the warning (CORE-MISSING-DT-01 rows 1–13): appReady (none / live / already
  fired) × core at load (none / compatible / older) × later events (ready, a core arriving or leaving
  before ready, the row disposed before ready, repeated core events after ready).
35 cases.

**How it is observed.** In-process ([instance-follower/world.mjs](<instance-follower/world.mjs>)):
the current DSH's real cordis `Context` (`importDsh('cordis')`); a row plugin calling
`followInstance` / `reportCoreMissing` the way the amenities do; the fake core as its own plugin
fiber providing `fishballInstance`, so its arrival, reload and removal are cordis' own
`internal/service` events; an `appReady` stand-in with DSH's `onReady(fn) → dispose` shape (a late
listener called at once). Oracles: `binding.attached()`, the instances handed to `attach`, each
returned dispose's calls, and `warn`'s calls.

**Regression.** No row of either area names a fix commit.

## Case-id index

UI-UC-07 (main, UI_SEAM, UI_GUARDS, SEAM_STATUS, data only) · SEAM-EP-01 (documented, frozen,
immutable) · SEAM-EP-02 (UI_STATUS, UI_INSTANCE, SEAM_PAIRING, SEAM_BRAND) · SEAM-EP-03 (values,
action routes, list route, withdrawn, words) · SEAM-EP-04 (values, route, fields, member) ·
SEAM-BVA-01 (rows 1–3) · FOLLOW-EP-01 (rows 1–5) · FOLLOW-EP-02 (rows 2–5) · FOLLOW-BVA-01 (rows 1–6) ·
FOLLOW-ST-01 (walk) · FOLLOW-ST-02 (rows 1–6) · CORE-MISSING-DT-01 (rows 1–13).
