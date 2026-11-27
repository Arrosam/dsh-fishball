# fishball-integration-core-ui

Integration tests (private, never shipped) for **fishball-core with fishball-ui**. fishball-ui is core's
`./ui/` component: its own package and manifest, but its rows live in core's `cordis.patch.yml` and DSH loads
it from core's folder. So whatever fishball-ui looks like in a DSH is decided by the two packages together.

Integrates: fishball-core, fishball-ui, fishball-shared (by name: `fishball-test-helpers/packages`,
`exportPath`, `createRequire` from this package; never a folder string).

## Run

```bash
node scripts/test.mjs fishball-integration-core-ui                    # all, current DSH (the booted rows take several minutes)
node scripts/test.mjs fishball-integration-core-ui --file=patch       # one entry
```

## Cases

| entry | level | ids | what |
|---|---|---|---|
| `patch.test.mjs` ([patch/](<tests/patch/cases.mjs>)) | unit / integration (DSH's patch loader, composer, Loader `interpolate`) | UI-BVA-01 inserted, UI-UC-06 rows, UI-DT-01, UI-EP-03, UI-EP-02 reverse, UI-UC-07 E1, UI-UC-08, EFIX3-UI-DT/EP/SHAPE/OWNER, NOCORE-ARCH/NOTICE | core's patch inserts fishball-ui's component rows (path rows into ./ui/) and its 8 UI guard rows as plain `{id, disabled: true}` for every startedBundles / HMR; DSH's Preview Notice only with the hosted child row (DT, EP over overlays, owner layer wins); core never names fishball-ui; ui-seam equals core's contracts; core's client loads only its settings chunk |
| `asks.test.mjs` ([asks/](<tests/asks/cases.mjs>)) | component (scripted page) | ASK-UI-01 (5), ASK-UC-04 main 1/2 | core's AskCard frames on the `asks` topic drawn by fishball-ui's card dock: question, arguments, reason, Allow/Reject or Reject only, markup as text; client.asks.js ships and is a chunk of fishball-ui's client |
| `entries.test.mjs` ([entries/](<tests/entries/cases.mjs>)) | component (scripted page, both clients) | SET3-UC-07, SET3-BVA-03, SET3-DT-02/03/04, SET3-UC-08, SET3-EP-05, SET3-ST-04, SET3-UC-10 (entries), UIPF-ENTRY-EP-01/ST-01 | fishball-ui's two header entries open core's settings page (pluginNavigation / Plugins panel) and DSH's Settings launcher (present / absent / later); `#view=settings` continuation and the session mark; icon-only buttons with Tooltips in en/zh |
| `system.test.mjs` ([system/](<tests/system/cases.mjs>)) | system (booted DSH) | UI-UC-01, EFIX3-UI-SYS-01, MODEL-SYS-01, STRIP-SYS-01, STRIP-DT-02, MODEL-ST-03, PLAT-DT-02 (integration), WIRE-SYS (ui+core, board stand-in+ui+core, broken board), SESSIONS-WATCH SYS S1–S4 | core + its UI component in a real standalone DSH: rows, boot graph, the Recommended route, the composer picker off, the strip's first SSE frame, per-target Connect, core switched off live, the status service, the manager's tools and the set check with a board stand-in, the §35 watch against a fake target (no read without a page; read at once on open; a self-started session in ui.targets and the strip topic; gone; reads stop) |
| `guards.test.mjs` ([guards/](<tests/guards/cases.mjs>)) | system (booted DSH, stand-in bundles in [fixtures/](<tests/fixtures/README.md>)) | PLAT-DT-04 rules 1–6, PLAT-UC-04 main/A1/A2/E1/post, UIM-DT-01 9/10b/all rows | core's disabled rows and presets, default policy and preset, native controller tools and owner tool overrides; standalone one-time self-reorder (HMR on / off), owner moves and late installs; owner row, policy and preset changes; core off live and at the next start |

The default-install rows also cover [CORE-WIRE-B1](<../../docs/testing/failures.md>): with Team mode off,
DSH's registered `team_task_*` tools are not model-reachable.

Techniques: EP, BVA, DT, ST, UC as each file's header states. Observation: DSH's own loader, settings, plugin
manager, credential and session services; core's published `fishballInstance` / `fishballStatus` and
contracts; the profile manifest and reorder record; owner routes; the page's boot graph; the scripted model. This
package's world ops are in `tests/support/world-ext.mjs`.

The message_user page rows in Chromium (MSG-PAGE-*, MSG-PAGING-*, MSG-STREAM-*) and the child-plugins rows
(CP-R2…R5) are in [fishball-integration-page-ui](<../integration-page-ui/README.md>).
