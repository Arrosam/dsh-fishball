# @dsh-instance/integration-hosted-child

Integration tests of `dsh-instance` with a **real host DSH and a real hosted child**: the instance
linked into a throwaway DSH home's profile, beside the real connector, placing the real Fishball bundles
into a child it launches. Run before a release (`npm run test:release`), never day to day.

## What it tests

| File | Behaviour |
| --- | --- |
| `tests/placement.test.mjs` | Placement (README "Placement"): the set (fishball-amenities, then fishball-core), its record, on/off rules PLAT-DT-01 1–9, the incompatible-member block, board placed as an amenity dependency rather than as a standalone bundle, the launch overlay's shape and removal, what the child page serves (HOST-UC-08 A3), HOST-ST-01 rows 1–3, HOST-UC-01 E2. |
| `tests/child-plugins.test.mjs` | The Fishball tab's routes (README "Plugins for Fishball", "Settings page" Restart): CP-R1…R10 — fences, list, install, use, protected bundles, uninstall, remove-failed, restart (ready, queued, failed), busy and cancel on a registry that never answers, switched off, not-ready. |
| `tests/private-sdk-copy.test.mjs` | A compatible private SDK copy remains in place across child restarts (R4-EP-01, R4-ST-01). |
| `tests/hosted-token.test.mjs` | The hosted token and lifecycle (README "The hosted token", "Ready", "Model sync", "Uninstall"): the first start's one entry and the child's pairing, restart and Reconnect, where the value may appear, model sync and its one automatic run, ready/stop/fatal start, reinstall succession, the uninstall command, the child stopping with its host. |

Every case is registered once per supported SDK (`eachSdk`). One host per SDK per file; the cases
of a file run in order and later ones build on the earlier ones' state (restarts of the same home).

## What it needs

- The installed DSH SDKs `0.2.1-rc.5` and `0.2.2-rc.1` (`FBTEST_DSH_VERSIONS` moves their folder).
- In-tree sources, **read only**: the connector and its shared library are linked into the host
  profile; Fishball core, amenities and their shipped dependencies are copied into the child under
  the throwaway home. `DSH_CONNECTOR_REPO` and `FISHBALL_REPO` can override these sources. If either
  source is absent, cases are registered as skipped with the reason.
- `npm` on the PATH, for `npm pack --offline` of the fixtures in `fixtures/` (written into the
  throwaway home). Nothing is downloaded: the one registry the tests use is a local socket that never
  answers.

The incompatible-member cases boot once with `FISHBALL_REPO` pointing at a scratch copy of the
Fishball core (its `engines.dsh` made impossible) under the OS temp folder, removed afterwards.

## How to run

From `dsh-fishball-instance/`:

```sh
node scripts/test-package.mjs integration/hosted-child
node scripts/test-package.mjs integration/hosted-child tests/placement.test.mjs   # one file
```

Each run gets its own HOME, TMPDIR and test-homes folder. Each case has 180 s, with a separate
20 s cleanup budget for its SDK world. The held install spans two cases and has its own bound;
the fixture closes its socket and cancels outstanding HTTP on cleanup. Deadline failures name the
SDK, case and active stage without logging admissions or credentials. If a timed-out case needs
its shared world torn down, the remaining cases in that world report the missing prerequisite.
A full run takes minutes.

## Fixtures

`fixtures/fbtest-only-b`, `fbtest-only-c` (installed into the child as packed tarballs) and
`fbtest-only` (linked into the main profile only, not selected: a name no installation ships) are
minimal bundles that register nothing.

## Known gaps (registered `todo`)

- `CP-R8 stopped`, `CP-R3 cancel, connection open`, `IREADY-SYSTEM operations`,
  `IREADY-SYSTEM publish-dispose`, `HOST-DT-01 row 7`: not observable from outside (each case says why).
- Hosted-entry restart and Reconnect regressions are tracked as BUG-2, BUG-3 and BUG-4
  ([docs/testing/bugs.md](<../../docs/testing/bugs.md>)); their dedicated cases are active.

## Open DSH SDK defect: ownerless credential lock

`CP-R8 failed` requires the child to come back ready after the test restores its base service.
In an isolated baseline on `0.2.1-rc.5`, both restart requests with the service disabled returned
only after separate ~31 s writer-lock failures. Restoring the service let the next generation boot
and listen, but it also exited on the same credential writer-lock timeout. The SDK had left a
zero-byte `.credentials.yaml.lock` (no holder PID); an incomplete lock cannot be reclaimed via
the normal dead-PID rule. The test now reports a settled `failed` recovery instead of polling
forever. It does not delete the lock, retry the recovery, or relax the requirement. The process
that left the empty lock was not identified.

The bounded rerun passed both restart cases on `0.2.1-rc.5`, but reproduced the same lock
failure in `CP-R8 queued` on `0.2.2-rc.1`: both restart requests returned, then the child
settled at `failed` / `NATIVE_CHILD_EXITED` with a zero-byte lock and a writer timeout.
The case reached its deadline, and only that case’s dependent shared-world rows were skipped.
The SDK must address how to recover an incomplete lock without taking it from a live writer;
the fixture deliberately does not make that decision.
