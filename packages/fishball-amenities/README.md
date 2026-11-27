# fishball-amenities

An umbrella that installs the optional Fishball amenities together. Each amenity is its own package and
DSH bundle, installable on its own; this package depends on them and carries their settings pages.
Version `1.0.0-alpha.1`, DSH `>=0.2.1-rc.5`.

## What it does

| Package | What it is |
|---|---|
| [`fishball-board`](<../fishball-board/README.md>) | Fishball's session-linked work board (binds `fishballInstance` apiVersion 1, so beside today's core it stays idle). |
| [`fishball-heartbeat`](<../fishball-heartbeat/README.md>) | Keeps Fishball's prompt cache warm while it is idle with useful heartbeat turns; off until both of its timer settings are set; when it stops, it compacts a long context once. |
| [`fishball-taskboard`](<../fishball-taskboard/README.md>) | Fishball's own task board and memo pad, which the user views and edits in the right sidebar's **Task board** tab. |

All three ship in this release through this umbrella (DESIGN §33). Installing `fishball-amenities`
installs all three and loads them: its dependencies bring the packages (bundled in its tarball with
`fishball-shared`), and its own patch inserts their rows (DSH makes only a profile's direct dependencies
bundles, so an umbrella carries its members' rows, as DSH's own `dsh-cua-bundle` does). Install an amenity
on its own instead and its own patch is used. Do not install the umbrella together with an amenity as a
direct dependency: both would insert the same rows.

Installed through the umbrella, the amenities show as its components on its plugin page, under a hint
that names them. Open `fishball-heartbeat` there (the arrow beside its name) to set its settings
(`intervalSeconds`, `maxConsecutive`, `compactThresholdTokens`). A saved change applies at once: the
heartbeat re-applies itself with the new values, without a DSH restart, and the values are kept in the
profile's `cordis.patch.yml`. `fishball-board` and `fishball-taskboard` have no settings page: the
taskboard has no settings, and the board's settings (`inject`, `contextCards`, `doneWindowHours`) are
read by nothing yet, so they are not offered.

Known limit: the pages are this umbrella's (`client.js`); the heartbeat has no browser code. Installed
alone, without the umbrella, `fishball-heartbeat` has no settings page: edit its row's `config` in the
profile's `cordis.patch.yml` instead.

Only this umbrella (`client.js`: the settings-page hint and the heartbeat's settings page) and
`fishball-taskboard` (its Task board tab) have browser code, so only they declare `dsh.client`.

## Structure

| path | what |
|---|---|
| `package.json` | manifest: depends on and bundles the three amenities and `fishball-shared`; `dsh.client` web |
| `cordis.patch.yml` | inserts `fishball-amenities`, `fishball-board`, `fishball-heartbeat` and `fishball-taskboard` by package name |
| `index.js` | the umbrella's own empty row |
| `client.js` | the plugin-page hint and one settings page per configurable member row, built from the schema DSH serves |
| `assets/` | the plugin icon |
| `tests/` | its own tests (not shipped) |

## Testing

```bash
node scripts/test.mjs fishball-amenities
node scripts/test.mjs fishball-amenities --file=settings-page
node scripts/test.mjs fishball-amenities --against=<git-ref>
```

| entry | what it covers |
|---|---|
| `packages.test.mjs` | the split from the umbrella's side: manifests, patches, DSH's bundle inspection, pack listing, members' imports (48 cases) |
| `icons.test.mjs` | each shipped package's plugin icon: DSH's reader, SVG, self-containment, light/dark render, the ICON-SET base (64 cases) |
| `settings-page.test.mjs` | the umbrella's client: the bundle hint and each configurable member row's page over DSH's real settings service and form (40 cases) |

Details and the case-id index: [tests/README.md](<tests/README.md>). Integration:
[`integration-amenities`](<../integration-amenities/README.md>) (the icons as one family with core's and
fishball-ui's, the board's `Config` through DSH's settings service, the root workspaces) and
[`integration-release`](<../integration-release/>) (package boundaries, release folder). Rules and runner:
[docs/testing/README.md](<../../docs/testing/README.md>).
