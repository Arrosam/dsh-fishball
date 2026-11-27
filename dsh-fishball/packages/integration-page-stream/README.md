# fishball-integration-page-stream

Integration tests (private, never shipped) for **fishball-core's one page stream** (DESIGN §34) with
**fishball-ui** (its strip topic, its browser carrier `fishballPageStream`) and **fishball-taskboard** (its
board and audit topics and its Task board tab). Ported from the old `test/v3/fishball-ui/connections`
system and taskboard rows, plus the coverage gap port-taskboard-board found.

Integrates: fishball-core, fishball-ui, fishball-taskboard, fishball-shared (by name: `createRequire` from this
package and `fishball-test-helpers/packages` `exportPath`).

## Run

```bash
node scripts/test.mjs fishball-integration-page-stream                 # all, current DSH
node scripts/test.mjs fishball-integration-page-stream --file=stream    # the booted DSH rows only
```

Page rows (Chromium) skip, saying so, where no Chromium exists (`FBTEST_CHROME` names one).

## Cases

| entry | ids | level | what |
|---|---|---|---|
| `stream.test.mjs` ([stream/](<tests/stream/cases.mjs>)) | **PS-TB-DT-01** bound / not installed, **PS-TB-ST-01**, **PS-TB-ST-02** (new) | system | fishball-taskboard registers `fishball-taskboard` and `fishball-taskboard-auto` while bound, even with auto-update off; the board frame equals `GET /api/fishball-taskboard/board`; a committed board change is one more board frame |
| | CONN-SYS-EP-01…07, ST-01…04, UC-01 | system (wire) | core's Host registration `fishballInstance.page.register`: face, TypeErrors on bad topics and providers, duplicates (built-ins included), one `{topic, frame}` per topic at open, built-in frames, `frame(url)`, the strip in the carrier's language, change / no repeat / late / throwing / disposed |
| | CONN-SYS-DT-01, ST-05, UC-02, UC-03, EP-08 | system (DSH's real page in Chromium) | exactly 2 EventSources (DSH's `/plugins/events` + the carrier) for 0 / 1 / 5 amenity topics, the Task board shown and hidden, after a text and an image send; the carrier opened once, no retired route; each send reaches the model and the composer leaves "sending" within 5 s; no budget warning |
| `board-tab.test.mjs` ([board-tab/](<tests/board-tab/cases.mjs>)) | CONN-TB-01…05 | component (scripted page) | fishball-taskboard's tab beside fishball-ui's client rides the one carrier (hidden, two tabs, bad frames keep the last board); without fishball-ui it opens its own `/api/fishball-taskboard/events` |

### Why the new PS-TB rows are meaningful

`--against=<ref>` swaps only the package under test (this integration package), so it cannot run these rows
against an old fishball-taskboard. A **controlled world** stands in, in the same run:
- a second DSH home where fishball-taskboard is **not installed**: the carrier has only `asks` and `strip`
  (PS-TB-DT-01 "not installed");
- in the main home, the taskboard's row **switched off** through DSH's plugin manager (unbound): a new carrier
  has neither taskboard topic; switching the row back on restores both (PS-TB-ST-01).

## Techniques and observation

EP (arguments, topic names, fishballPageStream present/absent, frame kinds), DT (page state → EventSources;
bound × topic), BVA (0/1/5 topics, one/two tabs, 5 s), ST (change sequences, row off → on, hidden → shown). System
rows boot a real standalone DSH (`fishball-test-helpers/dsh-world`, scripted model with images) with core
(whose patch carries fishball-ui's row) and fishball-taskboard installed as DSH's add installs them. This package's
world ops (`tests/support/world-ext.mjs`) drive only `fishballInstance.page.register`. The carrier is read from
Node with the owner's cookie, and DSH's page in headless Chromium is counted from DevTools.
