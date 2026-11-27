# fishball-heartbeat: tests

The package's own tests (docs/testing/README.md). They are black box: they observe what DSH, the user or fishball-core
can observe (the notices sent, the manager scope's tools, the session log, files under the profile
home, log lines by level, the Loader's fibers, DSH's settings service). They never read a private variable of
`src/`. They import only `node:`, this package's own files, and `fishball-test-helpers/*`. DSH's own packages
(cordis, cordis-plugin-loader, dsh-session, dsh-llm, schemastery, dsh-settings) come through
`fishball-test-helpers/dsh` `importDsh`, and the code under test through `fishball-test-helpers/bind`
(`rowModule`, `importBound`), so its `@deepseek-ai/*` imports bind to the DSH under test.

| entry file | area | what is covered |
|---|---|---|
| [heartbeat.test.mjs](<heartbeat.test.mjs>) | [heartbeat/](<heartbeat/README.md>) | the heartbeat row: timer, count, `heartbeat_focus`, restart, the core seam, live settings, compaction on cooling, what its own compaction causes |
| [live-settings.test.mjs](<live-settings.test.mjs>) | [live-settings/](<live-settings/README.md>) | `src/live-settings.js`: `settingsSnapshot` and `runWithSettings` on a fixture row |

## Running

```bash
node scripts/test.mjs fishball-heartbeat                                   # everything, current DSH (about 2.5 minutes)
node scripts/test.mjs fishball-heartbeat -- --test-name-pattern=HB-CAU     # one area by id prefix
node scripts/test.mjs fishball-heartbeat --against=23e334c8 -- --test-name-pattern=HB-CAU   # the regression rows on the pre-fix code (9 fail)
```

(`npm test` in this folder runs the same as the first line.) Case names are
`<ID> <row> [DSH <version>] <title>`.

## Case-id index

### Heartbeat (heartbeat/cases.mjs)

| id | technique | what |
|---|---|---|
| HB-EP-01 | EP | config partitions: neither / one / both timer settings, live re-apply |
| HB-EP-02 | EP | the core seam: absent, apiVersion 1, appReady, late, removed, replaced |
| HB-EP-03 | EP | `heartbeat_focus`: parameters, non-manager caller, invalid and non-object arguments, trim, clear, storage failure |
| HB-EP-04 | EP | only the manager session's turns count |
| HB-EP-05 | EP | core's event batches are work; undelivered events change nothing |
| HB-BVA-01 | BVA | intervalSeconds 0 / 1 / max / max+1 / 1.5 |
| HB-BVA-02 | BVA | maxConsecutive 0 / 1 / 2 |
| HB-BVA-03 | BVA | focus length 2000 / 2001 code points (ASCII, astral, trimmed) |
| HB-BVA-04 | BVA | restart edge: interval/2, interval−1 ms, interval, interval+1 ms |
| HB-BVA-05 | BVA | the firing edge, reset by every turn, none while a turn is open |
| HB-BVA-06 | BVA | late timer: 5000 ms sent, 5001 ms dropped with a warning |
| HB-BVA-07 | BVA | the delay cap after the clock was set back |
| HB-DT-01 | DT | turn classification (notice × work × step × end reason) |
| HB-ST-01 | ST | a real turn mid-run resets the count |
| HB-ST-02 | ST | restart reconstruction of count and anchor, X2 create late, reload keeps the dedupeKey |
| HB-UC-01 | UC | the main flow over a real Session |
| HB-INT | INT | focus persistence, rejected notify, disable, X2 disposal, no interval/limit through the tool |

### Live settings of the row (heartbeat/live-cases.mjs)

| id | technique | what |
|---|---|---|
| HB-LC-SC-01 | EP | Config fields, order, volatile, bounds, descriptions; index.js exports the same Config |
| HB-LC-EP-01 | EP | DSH's settings service serves the namespace (set and unset) |
| HB-LC-ST-01 | ST | off → on → interval changed → off, each live, without a remount |
| HB-LC-BVA-01 | BVA | a live intervalSeconds 0 / 1 / max / max+1 |
| HB-LC-DT-01 | DT | interval set × max set, reached live |

### Compaction on cooling (heartbeat/compact-cases.mjs)

| id | technique | what |
|---|---|---|
| HB-CMP-EP | EP | off configs never compact; warming never compacts; Fishball cannot set the threshold |
| HB-CMP-BVA | BVA | threshold −1 / = / +1, the default 256000, 0 tokens, invalid thresholds |
| HB-CMP-DT | DT | cooling reason × size, which engine, missing services, failing engines |
| HB-CMP-ST | ST | once per cooling, a new cooling after a real turn, restart, whenIdle, disposal aborts |
| HB-CMP-INT | INT | the whole flow over a real Session |

### What its own compaction causes (heartbeat/caused-cases.mjs): regression rows of 2a375e82

| id | technique | what |
|---|---|---|
| HB-CAU-DT | DT | how the message became pending × what else the turn admits |
| HB-CAU-BVA | BVA | "directly after" the compaction/end; first vs second splice; the end's compactionId |
| HB-CAU-ST | ST | mid-gap compaction, restarts, compaction inside a turn, caused ids forgotten |
| HB-CAU-INT | INT | the incident of 2026-11-22 with the heartbeat's own compactNow |

### live-settings.js (live-settings/cases.mjs)

| id | technique | what |
|---|---|---|
| LS-EP-01 | EP | settingsSnapshot partitions |
| LS-EP-02 | EP | one row's change does not re-run another |
| LS-UC-01 | UC | the first run |
| LS-ST-01 | ST | re-run after a volatile-only change, row disposal |
| LS-BVA-01 | BVA | count 0 / 1 / 10 / 11 / 3.5 |
| LS-DT-01 | DT | re-run failures restart the row; an ordinary change remounts; equal values do nothing |

### Integration rows (not here)

HB-LC-SC-02 and HB-LC-EP-01 row 3 need fishball-board's Config; the integration packages hold them.
