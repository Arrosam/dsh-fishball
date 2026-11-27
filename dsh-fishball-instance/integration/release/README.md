# @dsh-instance/integration-release

The packed instance release, built by the tests themselves.

## What it tests

Each test file builds its own release into a scratch folder:
`node scripts/pack.mjs --out <scratch> --fishball-release <dsh-fishball>/.runtime/release/<version>`.
It runs with dead proxies and registry and no user npm config, because the pack stages with
`npm pack` only and needs no network.

- `tests/pack.test.mjs`: the release layout (the one `dsh-instance` tarball, `SHA256SUMS`,
  `INSTALL.md`, `PUBLISH.md`, `offline-store.mjs`, `pnpm-store/`, `pnpm-cache/`). It covers the
  tarball manifest and contents: no links, no junk, `bundled/` holding exactly the
  `fishball-amenities` and `fishball-core` tarballs byte for byte, and npm's own file list. It
  covers `--check` state transitions on a copy, `PLAT-EP-07 row 5` (bundled library copies,
  including board, heartbeat and taskboard inside amenities), and an offline
  `dsh plugin add` of the tarball with each SDK's CLI.
- `tests/placement-install.test.mjs` (`PINST-*`, `RFI-F02`): the packed instance, unpacked,
  places `fishball-amenities` then `fishball-core` from the bundled tarballs while the registry
  is dead (`composedProfile`, export `./native-runtime`). It checks that an exact-version install
  is skipped, a disable survives, a stale or missing install is redone, a tampered or missing
  tarball gives `PLACEMENT_INSTALL_FAILED`, and a `vendor/` symlink gives `UNSAFE_DIRECTORY`.

## What it needs

- The Fishball release folder `../dsh-fishball/.runtime/release/<instance version>` with
  (or the directory set by `FISHBALL_RELEASE_DIR`), with both `fishball-amenities-<version>.tgz` and `fishball-core-<version>.tgz` (run `npm run pack:v3` at the monorepo root first). The tests read but do not modify the folder, and skip if either tarball is missing.
- The installed DSH SDKs, plus `npm`, `pnpm` (used by DSH's plugin manager) and `tar` on PATH.

## Run

From `dsh-fishball-instance/`:

```bash
node scripts/test-package.mjs integration/release
```
