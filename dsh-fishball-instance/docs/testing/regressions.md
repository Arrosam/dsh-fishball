# Regression cases

A fix comes with cases that fail on the code before the fix and pass on the fix. This file records,
for each fix, which cases those are and how the before/after run was shown.

## fab3837: `!` entries of a manifest's `files` list are exclusions

**Fix.** `shippedFiles` (packages/dsh-instance/src/native-runtime/placement.js) read fishball-core's
`"!ui/tests/"` as a file name, found no such path, and refused the source with
`PLACEMENT_SOURCE_UNAVAILABLE`, so the Fishball child could not start from a dsh-fishball checkout.
Since fab3837 an entry starting with `!` excludes that path (file or folder, with or without a
trailing slash) and everything under it, in any position, as npm pack reads it; a missing excluded
path is not refused; a name prefix is kept.

**Cases.** `packages/dsh-instance/tests/placement/shipped-files.test.mjs`, 49 per SDK:

- SHIP-DT-01: decision table, entry kind (folder / file / wildcard) × exclusion (none / folder with
  slash / folder without slash / single file / nonexistent / name prefix) × order (exclusion before /
  after the positive entries);
- SHIP-EP-01: exclusion depth, a positive entry after the exclusion, only exclusions, several
  exclusions, file-name prefixes one character short and one character long;
- SHIP-EP-02: the refusals that must stay (a missing positive entry, a symlink in the shipped tree);
- SHIP-UC-01: a fishball-core-shaped listing (`cordis.patch.yml`, `src/`, `ui/`, `!ui/tests/`) in a fake
  checkout. The same check over the real fishball-core checkout is in integration/fishball-core.

**Shown.** `node packages/dsh-instance/tests/placement/before-fix.mjs` extracts packages/dsh-instance
at `fab3837^` with `git archive` into a temp folder and runs the same file against it
(`FBTEST_PLACEMENT_FROM`), then against this checkout. Run on 2026-11-22, both SDKs:

| Code | Cases | Pass | Fail |
| --- | --- | --- | --- |
| `fab3837^` (before the fix) | 98 | 10 | 88 |
| this checkout | 98 | 98 | 0 |

The 5 cases per SDK that pass on both are the three "no exclusion" rules and the two SHIP-EP-02
refusals, which the fix must not change.

## BUG-1: `pack.mjs --check` verifies tarball bytes

**Fix.** The checker previously validated tarball names, layout and archive links without
comparing the tarballs with their SHA-256 digests in the release manifest.

**Case.** [pack-checksum.test.mjs](<../../integration/release/tests/pack-checksum.test.mjs>) runs
`REL-ST-01 tamper` offline without building a release or selecting an SDK. A gzip timestamp-byte
change leaves the archive contents unchanged, so archive inspection alone cannot detect it.
First, middle and last byte flips also require a checksum diagnostic. Restoring the original bytes
makes `--check` succeed again.

**Shown.** Run `node scripts/test-package.mjs integration/release tests/pack-checksum.test.mjs`
with the file selector given as an absolute path (or relative to the package). With the test in
place, the original checker reported the timestamp-altered archive intact; Node reported 0 pass,
5 fail (four subtests plus their parent). After the fix: 5 pass, 0 fail.
