# fishball-shared

The Fishball side's library. Version `1.0.0-alpha.1`.

## What it does

It is not a DSH plugin: its manifest has no `dsh` field, so it has no bundle, row, client or service and
never appears on a Plugins page. It ships inside the tarball of every Fishball-side package that uses it,
as a bundled dependency, so an install fetches nothing from a registry. You never install it by hand.

It holds only modules that at least two Fishball-side packages use: a module with one user lives in that
user. Today there are two:

- `./ui-seam`: the contract between `fishball-core` and `fishball-ui` (the status words, the
  `fishballInstance.ui` seam, the target list `SEAM_TARGETS` and its routes, the brand setting
  `SEAM_BRAND`, the pairing words `SEAM_PAIRING`, and the page's one live connection
  `SEAM_PAGE_STREAM`), so fishball-ui never imports core.
- `./instance-follower`: `followInstance` and `reportCoreMissing`, how each Fishball amenity
  (`fishball-board`, `fishball-heartbeat`, `fishball-taskboard`) and fishball-ui's Node row bind to a
  compatible `fishballInstance` and report a missing core once. It was `board/src/instance.js` inside
  `fishball-amenities` until the amenities became their own packages (2026-11-21).

It imports no other package. The DSH side has its own library, `dsh-connector-shared` (in the
dsh-connector repository); no module is shared across the two sides.

## Structure

| path | what |
|---|---|
| `package.json` | manifest: exports `./ui-seam`, `./instance-follower`; no `dsh` field |
| `ui-seam.js` | the core / fishball-ui seam: frozen data only |
| `instance-follower.js` | `followInstance`, `reportCoreMissing` |
| `tests/` | its own tests (not shipped) |

## Testing

```bash
node scripts/test.mjs fishball-shared
node scripts/test.mjs fishball-shared --file=instance-follower
node scripts/test.mjs fishball-shared --against=<git-ref>
```

| entry | what it covers |
|---|---|
| `ui-seam.test.mjs` | every export of `./ui-seam`: exact frozen values and shapes, SEAM_TARGETS' routes, SEAM_PAGE_STREAM (24 cases) |
| `instance-follower.test.mjs` | `followInstance` (binding, arrival, replacement, removal) and `reportCoreMissing` (one warning) (35 cases) |

Details and the case-id index: [tests/README.md](<tests/README.md>). Its users' tests observe it too.
[`integration-release`](<../integration-release/>) checks the "each module has at least two users" rule
across the packages. The one cross-package seam row (UI-UC-07 "E1 drift": SEAM_STATUS's restated words
equal fishball-core's `contracts/constants.js`) is listed as an integration row but is not in an
integration package yet. Rules and
runner: [docs/testing/README.md](<../../docs/testing/README.md>).
