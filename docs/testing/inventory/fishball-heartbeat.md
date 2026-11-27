# Old-test behaviour inventory: fishball-heartbeat

Generated from the baseline run of `integrate/2026-11-22-fixes` (0377153f) on DSH 0.2.1-rc.5 and 0.2.2-rc.1, before the restructure.
One row per case id of an old suite: the number of distinct behaviours (test names, SDK folded) it registered,
their baseline results, and one sample title. **Where now** is filled in by the port: the new test file, or
`retired: <reason>` (withdrawn, todo placeholder, subject moved to another repository), or `bug: <report id>`.

## test/v3/fishball-amenities/heartbeat

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| HB-BVA-01 | 5 | pass 5 | HB-BVA-01 row 1 intervalSeconds 0 (below min) is refused: no tool, no heartbeat | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-BVA-02 | 3 | pass 3 | HB-BVA-02 row 1 maxConsecutive 0 (below min) is refused: no tool, no heartbeat | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-BVA-03 | 6 | pass 6 | HB-BVA-03 row 1 focus of 2000 ASCII code points: accepted | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-BVA-04 | 4 | pass 4 | HB-BVA-04 row 1 restart interval/2 after the last turn end: fires for the remaining time | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-BVA-05 | 4 | pass 4 | HB-BVA-05 row 1 the heartbeat fires at exactly interval after the turn end (none at interval - 1 ms), once per idle gap | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-BVA-06 | 2 | pass 2 | HB-BVA-06 row 1 a timer firing 5000 ms after due: sent | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-BVA-07 | 3 | pass 3 | HB-BVA-07 row 1 restart with the clock set back 1 ms behind the last turn end: fires exactly one interval after arming | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-CAU-BVA | 5 | pass 5 | HB-CAU-BVA row 1 only the first splice is caused: a second consecutive next-step splice is work: + the heartbeat notice → real turn | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-CAU-DT | 14 | pass 14 | HB-CAU-DT row 1 caused reminder + the heartbeat notice → heartbeat turn | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-CAU-INT | 7 | pass 7 | HB-CAU-INT row 1 incident: 3 heartbeats, cooling compaction, taskboard reminder injected; no activity until a meow-memory dream admits it → real turn, 3 more he | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-CAU-ST | 9 | pass 9 | HB-CAU-ST row 1 R2: an idle compaction and its caused reminder mid-gap do not move the anchor (fires at T + interval) | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-CMP-BVA | 9 | pass 9 | HB-CMP-BVA row 1 context of threshold - 1 at cooling: not compacted | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-CMP-DT | 22 | pass 22 | HB-CMP-DT row 1 cooling by limit, context over the threshold → one compaction | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-CMP-EP | 9 | pass 9 | HB-CMP-EP row 1 only compactThresholdTokens set: the row stays off (no tool, no heartbeat, no compaction) however long the context | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-CMP-INT | 1 | pass 1 | HB-CMP-INT row 1 real → hb → hb (max 2) → one compaction after the last heartbeat turn ended → real turn → heartbeats resume → compaction again | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-CMP-ST | 8 | pass 8 | HB-CMP-ST row 1 once per cooling: neither time, a later heartbeat turn nor an empty turn compacts again while the context stays long | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-DT-01 | 18 | pass 18 | HB-DT-01 row 1 heartbeat notice, no user message → heartbeat turn | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-EP-01 | 6 | pass 6 | HB-EP-01 row 1 neither set: the row is up but registers no tool, sets no timer and sends nothing | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-EP-02 | 7 | pass 7 | HB-EP-02 row 1 no fishballInstance: exactly one fishball-core-missing warning at load; nothing else | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-EP-03 | 15 | pass 15 | HB-EP-03 row 1 heartbeat_focus declares one optional untyped parameter, focus (described as a string), and nothing for the interval or limit | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-EP-04 | 2 | pass 2 | HB-EP-04 row 1 another session's turns neither reset nor arm the timer | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-EP-05 | 3 | pass 3 | HB-EP-05 row 1 a fishball-event batch turn resets the count at the limit: heartbeats resume | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-INT | 5 | pass 5 | HB-INT row 1 the focus is saved under <home>/fishball-heartbeat/ and survives a row reload and a restart | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-LC-BVA-01 | 4 | pass 4 | HB-LC-BVA-01 row 1 intervalSeconds 0 set live: refused, the old 60 s stays | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-LC-DT-01 | 4 | pass 4 | HB-LC-DT-01 row 1 from {"intervalSeconds":60,"maxConsecutive":1000} live to {}: off | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-LC-EP-01 | 3 | pass 3 | HB-LC-EP-01 row 1 DSH's settings service serves the fishball-heartbeat namespace with the user's values | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-LC-SC-01 | 4 | pass 4 | HB-LC-SC-01 index index.js exports the same Config (volatile fields) as its row's schema | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-LC-SC-02 | 1 | pass 1 | HB-LC-SC-02 board fishball-board Config is unchanged: inject, contextCards, doneWindowHours, none volatile | integration: fishball-board's Config (packages/fishball-board src/config.js) must be present: its fields inject, contextCards, doneWindowHours stay non-volatile |
| HB-LC-ST-01 | 6 | pass 6 | HB-LC-ST-01 row 1 off → both set live → on: heartbeat_focus appears and a real turn arms one heartbeat at intervalSeconds; not remounted | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-ST-01 | 1 | pass 1 | HB-ST-01 row 1 a real turn in the middle of the run resets the count (max 2: hb, real, hb, hb, then cool) | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-ST-02 | 10 | pass 10 | HB-ST-02 row 1 restart inside the interval after real, heartbeat (max 2): one more heartbeat | packages/fishball-heartbeat/tests/heartbeat.test.mjs |
| HB-UC-01 | 1 | pass 1 | HB-UC-01 main system flow over a real Session: real turn → heartbeats with the focus set each time → limit → cool → real turn → heartbeats resume | packages/fishball-heartbeat/tests/heartbeat.test.mjs |

## test/v3/fishball-amenities/live-settings

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| LS-BVA-01 | 5 | pass 5 | LS-BVA-01 row 1 count 0 (min 1, max 10): refused by the Loader: no re-run, old values stay | packages/fishball-heartbeat/tests/live-settings.test.mjs |
| LS-DT-01 | 4 | pass 4 | LS-DT-01 row 1 a re-run whose body throws: the row is restarted (apply runs again) and comes up with the new value | packages/fishball-heartbeat/tests/live-settings.test.mjs |
| LS-EP-01 | 6 | pass 6 | LS-EP-01 row 1 a schema-resolved config: each volatile reference becomes its current value, a plain field passes through | packages/fishball-heartbeat/tests/live-settings.test.mjs |
| LS-EP-02 | 1 | pass 1 | LS-EP-02 row 1 a live change of one row re-runs only that row, not another row using runWithSettings | packages/fishball-heartbeat/tests/live-settings.test.mjs |
| LS-ST-01 | 5 | pass 5 | LS-ST-01 row 1 a volatile-only change: the old child is disposed, then body runs again with the new values; the row is not remounted | packages/fishball-heartbeat/tests/live-settings.test.mjs |
| LS-UC-01 | 4 | pass 4 | LS-UC-01 row 1 the first run: body(scope, settings) once, with the row's values, as a child plugin of the row | packages/fishball-heartbeat/tests/live-settings.test.mjs |
