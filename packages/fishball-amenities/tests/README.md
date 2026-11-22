# fishball-amenities' tests

The package's own tests (docs/testing/README.md). Run them with

```bash
node scripts/test.mjs fishball-amenities
```

fishball-amenities is the umbrella: it depends on and bundles fishball-board, fishball-heartbeat,
fishball-taskboard and fishball-shared, so its tests reach those by name (their published exports and manifests)
— never another package. Shared reading of them is [support/](<support/>): `packages.mjs` (each package's folder
as Node resolves it from here), `pack.mjs` (`npm pack --dry-run`), `temp.mjs` (throwaway folders).

| entry | area | what it covers |
|---|---|---|
| `packages.test.mjs` | [packages/](<packages/README.md>) | the split from the umbrella's side: manifests, patches, DSH's bundle inspection, pack listing, members' imports (AM-*) |
| `icons.test.mjs` | [icons/](<icons/README.md>) | each shipped package's plugin icon: DSH's reader, SVG, self-containment, light/dark render, ICON-SET base (PI-*) |
| `settings-page.test.mjs` | [settings-page/](<settings-page/README.md>) | the umbrella's client: the bundle hint and each configurable member row's Configure page over DSH's real settings service and form (PG-*) |

Not here (integration rows; `.runtime/port/port-amenities-mapping.tsv`): the root workspaces (AM-EP-07) and the
icon rows that compare with fishball-core's or fishball-ui's icon. The heartbeat and live-settings suites that
lived under `test/v3/fishball-amenities/` are fishball-heartbeat's own tests now.

### Case-id index

AM-EP-01…06, AM-EP-08, AM-DT-01, AM-DT-02, AM-BVA-01, AM-SC-01…03 · PI-EP-01…06, PI-DT-01…03, PI-BVA-01,
PI-RENDER-01, PI-CONSIST · PG-EP-01…06, PG-DT-01, PG-ST-01…03, PG-UC-01…03, PG-BVA-01, PG-MF-01, PG-MF-02.
