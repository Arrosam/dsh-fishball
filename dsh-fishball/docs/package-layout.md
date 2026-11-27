# Package layout

This repository holds the Fishball side's packages. The DSH side (dsh-connector, dsh-connector-ui,
dsh-connector-adapter, dsh-connector-shared, dsh-instance) left it on 2026-11-20 (6b7c53bf) for the
dsh-connector and dsh-fishball-instance repositories; the two sides never import each other (R-ARCH-10,
design §1.0). The root `package.json` is private and not a plugin; it lists the workspaces and the
day-to-day test command. Install, uninstall and the supported DSH versions are in the
[README](<../README.md>).

## Tree

```
package.json                    root, private: workspaces, scripts
packages/
  core/                         plugin fishball-core: the backend (manager session, link, Connect, events, asks, status, guards)
    client.js client.settings.js   its own settings page
    contracts/                  K3/K3a types and constants.js (runtime values, core's copy of the connector's MCP surface)
    src/                        main/ manager/ link/ targets/ events/ asks/ bridge/ guards/ identity/ session/ settings/ status/ page/
    ui/                         plugin fishball-ui, its own package shipped inside core's tarball: every UI change in a Fishball DSH
      client.js client.{asks,brand,entries,strip}.js   flat browser chunks
      fishball-page/ fishball-recommend-plugins/ fishball-child-plugins/   its sub-packages
      tests/                    fishball-ui's tests (not shipped)
    tests/                      fishball-core's tests (not shipped)
  fishball-board/               plugin: the session-linked work board (shelved in core's view; ships in the umbrella)
  fishball-heartbeat/           plugin: cache-warming heartbeat turns
  fishball-taskboard/           plugin: task board and memo pad, with its own client.js (the Task board tab)
  fishball-consultant/          plugin: opt-in cross-DSH skill consultation
  fishball-amenities/           umbrella: depends on and bundles the four amenities and inserts their rows
  shared/                       library fishball-shared (no dsh field): ui-seam, instance-follower
  test-helpers/                 private, never shipped: fishball-test-helpers, the shared test tools
  integration-*/                private, never shipped: cross-package integration test packages
scripts/
  test.mjs                      one package's tests on the current DSH
  test-release.mjs              every package and integration package in parallel over the DSH matrix
  pack-v3.mjs release/          the release tarballs
```

Each shipped package has a `tests/` folder of its own tests
([testing](<testing/README.md>)); `tests/` is never in a package's `files` (fishball-core's `files`
lists `ui/` and excludes `ui/tests/`), and the release stage drops any `tests` folder.

## Rules

- **No cross-side import.** No Fishball package imports, peers, vendors, bundles or generates code from
  a DSH-side package, and the reverse. The only coupling is the connector's public MCP surface; core
  keeps its own copy of the constants it needs (`core/contracts/constants.js` `MCP`, `LINK`), checked
  by core's contract tests against the vendored contract in `fishball-test-helpers/connector-contract`.
- **One library.** `fishball-shared` holds only modules at least two Fishball packages use (R-ARCH-08,
  strict). Each user lists it in `dependencies` and `bundleDependencies`, so its tarball carries it.
- **Chunks, not folders, for browser code.** DSH serves a package's `client.js` and only
  `client.<name>.js` files beside it, so browser parts are flat chunks.
- **Tests are per package.** A package's tests import only its own files, `fishball-test-helpers`, and
  by name the packages it depends on; cross-package behaviour is tested in `packages/integration-*`.

## Packing

`node scripts/pack-v3.mjs` builds every tarball (one shared version `1.0.0-alpha.1`, `engines.dsh`
`>=0.2.1-rc.5`, the bundled libraries) into `.runtime/release/<version>/`; `--check` re-verifies it.
