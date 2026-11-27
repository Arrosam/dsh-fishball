# fishball-integration-release

Integration tests (private, never shipped) for **every Fishball package together**: the package
boundaries between them and the release folder `node scripts/pack-v3.mjs` writes. Ported from the old
`test/v3/contract/package-boundaries` and `test/v3/release/pack`. Their entry files and `release/pack/cases.mjs`
were deleted in 6b7c53bf, so none of these rows ran in the 0377153f baseline. This package re-registers them
for this repository (the DSH-side packages left in 6b7c53bf).

Integrates (manifest `dependencies`, each found by name through `fishball-test-helpers/packages`):
fishball-shared, fishball-core, fishball-ui, fishball-board, fishball-heartbeat, fishball-taskboard, fishball-amenities.

## Run

```bash
node scripts/test.mjs fishball-integration-release                       # boundaries always; release rows skip without a release
node scripts/pack-v3.mjs --out <dir>/1.0.0-alpha.1                       # a throwaway release (needs the registry once)
FBTEST_RELEASE_DIR=<dir>/1.0.0-alpha.1 node scripts/test.mjs fishball-integration-release
FBTEST_RELEASE_REQUIRED=1 node scripts/test.mjs fishball-integration-release   # the old release-check gate: missing release fails
```

The rows that read a release folder (`.runtime/release/1.0.0-alpha.1`, or `FBTEST_RELEASE_DIR`) **skip with
the reason** "release folder missing: run `node scripts/pack-v3.mjs` first" when it is absent.

## Cases

| entry | ids | what | technique |
|---|---|---|---|
| `boundaries.test.mjs` ([boundaries/](<tests/boundaries/cases.mjs>)) | PLAT-EP-07 rows 3/7b, 4, 5, 6 | fishball-shared is a library: no dsh field, refused by DSH's own bundle inspection, imports nothing, every importer (or its carrier: fishball-ui ships in core's tarball) depends on and bundles it, every module used by ≥ 2 packages, no live copy elsewhere | EP per module; BVA/EP on the counting rule over synthetic tables (`6 rule`) |
| | PLAT-EP-07 rows 1, 2, 7c | core ↔ fishball-ui never reach each other; no amenity reaches core, another amenity, the ui or the umbrella; only the umbrella names amenities; every cross-package import names a published export; `dsh.client` exactly where a client entry ships | EP per package |
| | HOST-EP-03 row 1 | skills-store.js takes nothing from fishball-shared; core imports none of the modules REMOVE-V2b moved into it | EP |
| | SHELVE-EP-01 | core and fishball-ui name the board in no shipped JS token, data file or manifest field (the rule that still holds after 2e1dbfd4) | EP holder × reference kind; the rule's own samples |
| | REL-TESTS, REL-HELPERS (**new**) | no package's `npm pack` listing holds a tests/ folder (fishball-core's carries `ui/`: `!ui/tests/` must hold); a controlled synthetic package shows the row fails when a tests folder is shipped; fishball-test-helpers is private; no shipped file of a package imports it and no manifest names it | EP per package; controlled world (ships / excluded) |
| `release.test.mjs` ([release/](<tests/release/cases.mjs>)) | REL-ORACLE | junk, SHA256SUMS and publish-line rules on samples; the tarball parser equals `tar -tzf` | BVA, EP |
| | REL-EP-01…03, REL-EP-02, REL-EP-14 | the folder layout (6 tarballs, docs, offline-store.mjs, warmed store), SHA256SUMS lines and digests, PUBLISH.md's one `--tag alpha` line per tarball (library first) | EP per tarball, BVA |
| | REL-EP-04, REL-DT-01, REL-DT-02 | each tarball manifest (name, version, engines, license, repository.directory = its folder, publishConfig, zod and host peers, MCP pin); engines.dsh: the current DSH admitted, 0.2.1-rc.4 not; libraries carry none; internal deps exact | DT plugin × library, BVA |
| | REL-EP-05, 06, 08, 09, REL-DT-03, REL-TESTS | no link entries, no junk, no tests/ in any tarball, the folder's own dry-run listing equals the tarball (less staged node_modules/), library copies byte-identical, core's closure and MCP client bundled | EP, DT |
| | REL-ST-01 | `--check`: absent folder fails; valid → tampered (first/middle/last byte) → restored; tarball removed / stray tarball (reported unexpected) / each doc removed → restored | ST, BVA |
| | REL-SYS-02, 03, REL-DT-04 | every tarball alone, each INSTALL.md set, core with an empty store: `dsh plugin add` offline with the current DSH's CLI | EP, DT |
| | REL-EP-10, REL-ST-02 | INSTALL.md: per set the online add before its one `--offline` block, only released packages named; each offline block run as written, twice, then a later `--offline` add from elsewhere, no network request (counting proxy) | ST |

Techniques of observation: `npm pack --dry-run --ignore-scripts` offline (under the runner's isolated HOME and
cache), Node's built-in acorn in a worker (`--expose-internals`) for specifiers and tokens, a gzip + ustar/pax
reader for the tarballs, DSH's own `PluginManager.inspect` and CLI of the current DSH, `pack-v3.mjs --check`
in a child process. No product module is loaded and nothing in the checkout is written.

Retired from the old suites (`.runtime/port/integration-2-mapping.tsv` has the reasons): every row on
dsh-instance, dsh-connector, dsh-connector-ui, dsh-connector-adapter and dsh-connector-shared (6b7c53bf), the
hosted set and `bundled/` rows, and REL-SHELVE's release half (the board ships since 2e1dbfd4).
