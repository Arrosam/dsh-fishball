# @dsh-instance/integration-release

The packed release of this repository, built by the tests themselves.

## What it tests

Each test file builds its own release into a scratch folder:
`node scripts/pack.mjs --out <scratch> --fishball-release <dsh-fishball>/.runtime/release/<version>`.
It runs with dead proxies and registry and no user npm config, because the pack stages with
`npm pack` only and needs no network.

- `tests/pack.test.mjs`: the release layout (the one `dsh-instance` tarball, `SHA256SUMS`,
  `INSTALL.md`, `PUBLISH.md`, `offline-store.mjs`, `pnpm-store/`, `pnpm-cache/`). It covers the
  tarball manifest and contents: no links, no junk, `bundled/` holding exactly the
  fishball-core tarball byte for byte, and npm's own file list. It covers `--check` state
  transitions on a copy, `PLAT-EP-07 row 5` (library copies) and an offline
  `dsh plugin add` of the tarball with each SDK's CLI.
- `tests/placement-install.test.mjs` (`PINST-*`, `RFI-F02`): the packed instance, unpacked,
  places fishball-core from its bundled tarball while the registry is dead (`composedProfile`,
  export `./native-runtime`). It then checks the skip when already installed, a disable
  surviving, a stale or missing install being redone, a tampered or missing tarball giving
  `PLACEMENT_INSTALL_FAILED`, and a `vendor/` symlink giving `UNSAFE_DIRECTORY`.

## What it needs

- The Fishball release folder `../dsh-fishball/.runtime/release/<instance version>` with
  `fishball-core-<version>.tgz` (pack dsh-fishball first). It is only read. Without it the cases
  are skipped with the reason.
- The installed DSH SDKs, plus `npm`, `pnpm` (used by DSH's plugin manager) and `tar` on PATH.

## Run

```bash
node scripts/test-package.mjs integration/release
```

About 25 s.
