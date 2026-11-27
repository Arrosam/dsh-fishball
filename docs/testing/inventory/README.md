# Old-test behaviour inventory

Step 1 of the test restructure (2026-11-22): what the old `test/` tree covered, per package, before it
was replaced by per-package tests. Every row's **where now** column names the new entry file, or why it
was retired, or the integration package that covers it.

## How it was taken

- Source: a full run of the old runners on `integrate/2026-11-22-fixes` at 0377153f,
  `node test/run-affected.mjs --all` (the V3 lane) and `--all --lane=legacy`, each on DSH 0.2.1-rc.5 and
  0.2.2-rc.1, with a reporter that records every test's name and result. The V3 lane took about 41
  minutes; that is the cost this restructure removes from day-to-day work.
- A **behaviour** is one test name with the SDK tag folded (`[SDK 0.2.1-rc.5]` and `[SDK 0.2.2-rc.1]` of
  one case are one behaviour). A **case id** is the first word of a name (`HB-CAU-DT`, `MULTI-NAME-ST-01`):
  one row of these tables groups the behaviours of one id.
- Each id is filed under the package whose functionality it tests; ids of packages that now live in
  other repositories (`dsh-connector`, `dsh-instance`, `dsh-connector-adapter`) are in
  [retired-subjects.md](<retired-subjects.md>).

## Totals (unique behaviours)

| file | old suites | case ids | behaviours |
|---|---|---|---|
| [fishball-core.md](<fishball-core.md>) | 19 | 636 | 2021 |
| [fishball-ui.md](<fishball-ui.md>) | 12 | 296 | 1271 |
| [fishball-taskboard.md](<fishball-taskboard.md>) | 2 | 64 | 266 |
| [fishball-heartbeat.md](<fishball-heartbeat.md>) | 2 | 38 | 226 |
| [fishball-amenities.md](<fishball-amenities.md>) | 3 | 42 | 173 |
| [fishball-board.md](<fishball-board.md>) | 1 | 1 | 2 |
| [integration.md](<integration.md>) | 1 | 12 | 16 |
| [retired-subjects.md](<retired-subjects.md>) | 5 | 16 | 20 |
| **all** | | **1105** | **3995** |

## Baseline results

Of the 3995 behaviours, the baseline showed 3247 passing on both SDKs. The rest were:

- **skipped** (about 330): rows registered as `skip` because a later decision withdrew them (MULTI-0's
  scalar settings page, the withdrawn slim panel, F-SETTINGS' old Connect route, the pairing rows of the
  single-target link). They assert nothing; the port retires them with the reason they carried.
- **todo** (about 230): placeholders naming a task that never landed or a subject that moved away. The
  port keeps a todo only when its subject is still in this repository.
- **failing** (about 430, of which 148 are one private-skills fixture file failing to load): classified
  one by one in [../failures.md](<../failures.md>) as a real bug or an outdated test.
## Coverage after the port

All 1105 case ids have a destination (the agents' mappings; one row per id and old suite):

| outcome | case ids |
|---|---|
| ported to the package's own tests | 871 |
| ported, with some rows retired (withdrawn skips, placeholders) | 30 |
| ported, with some rows needing a second package (those rows are integration) | 21 |
| moved to another package's own tests (strip view → fishball-ui, ui-seam → fishball-shared) | 5 |
| integration only (needs two or more packages of this repository) | 107 |
| retired (withdrawn requirement, placeholder, or subject in another repository) | 110 |

Ids filed by the old inventory under the wrong suite (it attributed cases by name) are noted in the
row itself.
