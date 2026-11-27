# fishball-integration-page-ui

Integration tests (private, never shipped) for **fishball-ui's page parts over fishball-core**:

- **message-page**: fishball-ui's `fishball-page` draws fishball-core's manager `message_user` calls as their own rows
  and folds the assistant replies behind DSH's own turn control (DESIGN §32). It also checks that the fold does not
  break DSH's chat paging or a long stream. Observed in **DSH's real web UI** in headless Chromium, over a **booted
  standalone DSH** with core installed. Core's patch inserts fishball-ui's rows, so DSH loads fishball-page from core's
  `./ui/`.
- **child-plugins**: in an instance-run child, core's patch runs fishball-ui's `fishball-child-plugins` row. Its client
  hides DSH's own install entries on the Plugins page and shows the notice (DESIGN §28 R2–R5). The mode comes from
  DSH's own composition of core's patch with launch overlays (dsh-app-boot, cordis-plugin-loader). The row's client
  runs in the scripted page after DSH's real locale runtime and the Plugins / Discover dictionaries. Its sheets are
  laid over PluginManagerPage-like markup in Chromium.

Integrates fishball-core and fishball-ui, both found by name: `createRequire` from this package's manifest for core
(fishball-shared through core's own dependency), and `fishball-test-helpers/packages` `packageByName('fishball-ui')`.
No folder strings are used.

## Run

```bash
node scripts/test.mjs fishball-integration-page-ui                       # all, current DSH (about 2 min)
node scripts/test.mjs fishball-integration-page-ui --file=message-page   # one entry
```

Rows that need Chromium skip, saying so, when no Chromium is installed (`FBTEST_CHROME` names one). CP-R2-06 needs
no browser.

## Cases

| entry | ids | level | what |
|---|---|---|---|
| `message-page.test.mjs` ([message-page/cases.mjs](<tests/message-page/cases.mjs>)) | MSG-PAGE-EP-00…03, DT-01…03, ST-01, ST-01b, ST-02…09 (17) | system, real DSH page | one row per non-empty call, in call order, Markdown drawn; blank, non-string, missing and unparsable calls draw none; rows visible outside the fold; avatar, label and bubble; replies hidden behind a closed enabled control, shown when it is open or disabled (plain turn, stopped turn, verbose work details); running → completed / stopped; reload; the fishball-page row off / on in DSH's Plugins |
| `message-paging.test.mjs` ([message-page/paging.mjs](<tests/message-page/paging.mjs>)) | MSG-PAGING-EP-00…02, ST-01/02, MSG-STREAM-EP-01, ST-01/02 (8) | system, real DSH page | 40 turns: the first window, each older page in order and all visible, the anchor row kept within 2 px, hidden seats 0×0 with no extra gap, no Fishball exception; a 400-delta stream hidden while it streams, complete when opened |
| `child-plugins.test.mjs` ([child-plugins/cases.mjs](<tests/child-plugins/cases.mjs>)) | CP-R2-01…09, CP-R3-01…10, CP-R4-01…04, CP-R5-01…04 (45) | integration (composition + scripted page + Chromium) | Add plugin / menu anchor / Uninstall / every Update hidden in instance-run, all shown standalone (the control rows); the Host's plugin-management rows unchanged and the Node half reads nothing; the Discover tab rules; the en / zh notice following the language (ja falls back to en); hiding kept across language switches |

The technique of each row (EP, BVA, DT, ST) is in its id and in each cases file's header table.

## Observation

- **System rows**: `fishball-test-helpers/dsh-world` boots a real standalone DSH with the scripted model. It uses only
  the world's base ops: turns, held / released / stopped turns, settings `mutate` (core's `model`, DSH's
  `ui-chat.transcriptView`) and DSH's plugin-manager row switch. [tests/support/world-ext.mjs](<tests/support/world-ext.mjs>)
  only waits for core's `fishballInstance`. The page is read through DSH's public chat markup and fishball-page's
  published hooks (`<html data-fishball-page>`, `fishball-message` rows, `div[data-fishball-message]`,
  `data-fishball-folded`). Input is trusted (DevTools mouse and wheel events).
- **Child-plugins rows**: [tests/child-plugins/subject.mjs](<tests/child-plugins/subject.mjs>). The mode is not a flag.
  The row's client is put on the page exactly when DSH's loader runs the composed `fishball-child-plugins` row (each
  case first checks that precondition). The row's folder is the composed row's `name`, and that sub-package's own
  manifest names its entries. "Hidden" means Chromium's `checkVisibility()` is false.

## Copied support (candidate for fishball-test-helpers)

[tests/support/page.mjs](<tests/support/page.mjs>) is a Chromium driver for DSH's real web UI. Its tab opening
follows `fishball-integration-page-stream`'s `tests/support/page.mjs`, and its snapshot, viewport, gap and aim
probes are the old `test/v3/fishball-core/message-user/page.mjs`. It is copied, not imported, because the
independence rule forbids reaching another package's tests. The lead may move the shared part into
fishball-test-helpers. [tests/child-plugins/subject.mjs](<tests/child-plugins/subject.mjs>) repeats the composition
helpers of `packages/core/tests/support/core-static.mjs` for the same reason.

## DSH 0.2.2-rc.3 changes these rows absorb (test-side, not product)

- The history control now holds every state's label (Load earlier, Loading earlier, …) as spans and hides all but
  the current one. The driver reads the shown label, which still works on 0.2.2-rc.1's single label.
- DSH now prepends an older page by itself when wheel input reaches the history edge, as well as on a click on
  "Load earlier". `pageOnce` wheels one step at a time and clicks only when DSH waits at the top. MSG-PAGING-ST-02
  takes its anchor from the last viewport before the window grew and discounts that wheel step's own scroll.

## Not ported

- MSG-PAGE-EP-04 ("outside the Fishball page nothing changes"): it cannot be observed. fishball-page's guards keep
  DSH's web UI of a core + fishball-ui install on the manager session, and no public route shows another session there.
  MSG-PAGE-ST-08 covers "with fishball-page off, nothing of it is left".
- CP-R2-09 "aria-label" and CP-R4-05: old todos for an accepted limit and an unspecified placement (see the mapping).
