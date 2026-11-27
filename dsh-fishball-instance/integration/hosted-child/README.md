# @dsh-instance/integration-hosted-child

Integration tests of `dsh-instance` with a **real host DSH and a real hosted child**: the instance
linked into a throwaway DSH home's profile, beside the real connector, placing the real Fishball bundles
into a child it launches. Run before a release (`npm run test:release`), never day to day.

## What it tests

| File | Behaviour |
| --- | --- |
| `tests/placement.test.mjs` | Placement (README "Placement"): the set (fishball-amenities, then fishball-core), its record, on/off rules PLAT-DT-01 1–9, the incompatible-member block, board placed as an amenity dependency rather than as a standalone bundle, the launch overlay's shape and removal, what the child page serves (HOST-UC-08 A3), HOST-ST-01 rows 1–3, HOST-UC-01 E2. |
| `tests/child-plugins.test.mjs` | The Fishball tab's routes (README "Plugins for Fishball", "Settings page" Restart): CP-R1…R10 — fences, list, install, use, protected bundles, uninstall, remove-failed, restart (ready, queued, failed), busy and cancel on a registry that never answers, switched off, not-ready. |
| `tests/hosted-token.test.mjs` | The hosted token and lifecycle (README "The hosted token", "Ready", "Model sync", "Uninstall"): the first start's one entry and the child's pairing, restart and Reconnect, where the value may appear, model sync and its one automatic run, ready/stop/fatal start, reinstall succession, the uninstall command, the child stopping with its host. |

Every case is registered once per supported SDK (`eachSdk`). One host per SDK per file; the cases
of a file run in order and later ones build on the earlier ones' state (restarts of the same home).

## What it needs

- The installed DSH SDKs `0.2.1-rc.5` and `0.2.2-rc.1` (`FBTEST_DSH_VERSIONS` moves their folder).
- The sibling checkouts, **read only**: `dsh-connector` (the connector and its shared library are
  linked into the host profile) and `dsh-fishball` (placement copies fishball-amenities, fishball-core,
  and their shipped dependencies from it into the child under the throwaway home). They are found beside this
  repository's main checkout, or where `DSH_CONNECTOR_REPO` / `FISHBALL_REPO` point. When either is
  absent, every case is registered skipped with the reason.
- `npm` on the PATH, for `npm pack --offline` of the fixtures in `fixtures/` (written into the
  throwaway home). Nothing is downloaded: the one registry the tests use is a local socket that never
  answers.

The incompatible-member cases boot once with `FISHBALL_REPO` pointing at a scratch copy of the
sibling's core (its `engines.dsh` made impossible) under the OS temp folder, removed afterwards.

## How to run

From the repository root:

```sh
node scripts/test-package.mjs integration/hosted-child
node scripts/test-package.mjs integration/hosted-child tests/placement.test.mjs   # one file
```

Each run gets its own HOME, TMPDIR and test-homes folder (scripts/test-package.mjs); no time limit
is set, so a condition that never comes shows as a hang. Each child start takes a few seconds, so a
full run takes minutes.

## Fixtures

`fixtures/fbtest-only-b`, `fbtest-only-c` (installed into the child as packed tarballs) and
`fbtest-only` (linked into the main profile only, not selected: a name no installation ships) are
minimal bundles that register nothing.

## Known gaps (registered `todo`)

- `CP-R8 stopped`, `CP-R3 cancel, connection open`, `IREADY-SYSTEM operations`,
  `IREADY-SYSTEM publish-dispose`, `HOST-DT-01 row 7`: not observable from outside (each case says why).
- `HOST-UC-02 A1`, `HOST-UC-02 main` and `HOST-UC-02 reconnect`: real bugs BUG-2, BUG-3 and BUG-4
  ([docs/testing/bugs.md](<../../docs/testing/bugs.md>)).
