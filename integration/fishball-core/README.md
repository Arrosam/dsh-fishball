# @dsh-instance/integration-fishball-core

The instance's hosted-child composition with the **real** `fishball-core` of the sibling
`dsh-fishball` checkout.

## What it tests

The instance's public `composedProfile` (manifest export `./native-runtime`) does what a start does
without launching anything: layout, placement of fishball-core from the sibling checkout
(`FISHBALL_REPO`), profile load and launch overlay. Its result is composed with each SDK's own
`dsh-app-boot`.

- `tests/guards.test.mjs`: the guards come from core's own patch. `LITE-UC-03`, `LITE-EP-13` and
  `SET-EP-12` check effective read-only, guarded rows and shipped presets off, and `/permission`
  read-only only. The overlay sets no sandbox, and an owner's stored wider sandbox wins.
  `HOST-UC-06 post` checks that the overlay disables nothing but hmr and inserts only the two
  instance rows. The guard vocabulary is read from core's `contracts/guards.d.ts`.
- `tests/core-patch.test.mjs` (`HOST-EP-03 row 7`): core's patch rows as each SDK parses them (the
  guards path row, the unified UI rows into their own `ui/` packages, no slim rows, the
  `fishball-core/main` row). A placed child holds fishball-core only, core last, and nothing of
  fishball-ui or fishball-board (commit 8fdd0ef).
- `tests/shipped-files.test.mjs` (`SHIP-UC-01`): the copy placed in the child is exactly
  `npm pack --dry-run --json` of the real core minus `README.md`, so the `!ui/tests/` exclusion
  (commit fab3837) is honoured.

## What it needs

- The sibling checkout `../dsh-fishball` (or `FISHBALL_REPO`), read only. When it is missing, the
  cases are skipped with the reason.
- The installed DSH SDKs, and `npm` on PATH (the dry run writes nothing and runs offline).

## Run

```bash
node scripts/test-package.mjs integration/fishball-core
```

About 30 s.
