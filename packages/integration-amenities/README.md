# fishball-integration-amenities

Integration tests (private, never shipped) for the Fishball amenities **beside fishball-core,
fishball-ui and the repository root**: the facts that no single package's own tests can check, because
they compare two packages or read the repository's layout
([docs/testing/README.md](<../../docs/testing/README.md>) rule 3).

Integrates (manifest `dependencies`, all reached by name through `fishball-test-helpers/packages`):
fishball-amenities, fishball-board, fishball-heartbeat, fishball-taskboard, fishball-core, fishball-ui,
fishball-shared.

## Run

```bash
node scripts/test.mjs fishball-integration-amenities            # all, current DSH
node scripts/test.mjs fishball-integration-amenities --file=icons
```

## Cases

| entry | ids | what | technique | observed through |
|---|---|---|---|---|
| `icons.test.mjs` ([icons/](<tests/icons/cases.mjs>)) | PI-EP-01…05, PI-RENDER-01 (fishball-core, the reference) | the family reference passes the same icon rules as the amenities (a guard on the rules) | EP (one more partition), state light/dark | manifest, `npm pack --dry-run`, DSH's `readPluginMeta`, DSH's saxes, headless Chromium `<img>` |
| | PI-CONSIST (×4) | each amenity's base (tile, fish, ring, chip, glyph frame) equals fishball-core's, and it draws its own glyph | consistency | the SVGs as XML |
| | PI-EP-06 | the six icons (four amenities, fishball-core, fishball-ui's shipped `assets/fishball-ui-icon.svg`) are pairwise different drawings and glyphs | EP pairwise | the SVGs as XML |
| `settings.test.mjs` ([settings/](<tests/settings/cases.mjs>)) | HB-LC-SC-02, HB-LC-EP-01 row 3 | fishball-board's Config is unchanged (inject, contextCards, doneWindowHours, none volatile) and DSH's settings service serves no fishball-board namespace, while the heartbeat's became live | EP | fishball-board's `.` export bound to the current DSH; DSH's own `dsh-settings` (`fishball-test-helpers/settings`) |
| `repository.test.mjs` ([repository/](<tests/repository/cases.mjs>)) | AM-EP-07 (×5) | the root workspaces list each amenity's folder and fishball-shared's, and every listed folder (globs expanded) has a package.json | EP per folder | the root package.json |

The icon helpers ([icons/](<tests/icons/>)) are copies of fishball-amenities' own (`tests/icons`), less its
BVA and oracle rows, plus `baseOf`; packages' tests are never imported.

Sources: `.runtime/port/port-amenities-mapping.tsv`, `port-heartbeat-mapping.tsv` (rows marked integration).
