# Real bugs found by the tests

A case that fails because the code breaks a requirement that still holds stays as written and is
registered with `{ todo: 'BUG: …' }`: it runs and reports, without failing the run, until the bug is
fixed. None is fixed on this branch (the restructure changes tests and documents only).

## BUG-1: `pack.mjs --check` does not verify SHA256SUMS

- **Case:** `REL-ST-01 tamper` in [integration/release/tests/pack.test.mjs](<../../integration/release/tests/pack.test.mjs>), both SDKs.
- **Observed:** in a copied release, one byte of `dsh-instance-1.0.0-alpha.1.tgz` is flipped (first,
  middle or last offset); `node scripts/pack.mjs --check --out <copy>` still prints "is intact" and
  exits 0.
- **Expected:** a non-zero exit naming the checksum mismatch. `--check` "verifies an existing release
  offline" (root README, `npm run pack:check`), and `SHA256SUMS` is part of the layout it checks;
  the old REL-ST-01 requirement was valid → tampered (non-zero) → restored (0).
- **Cause:** `check()` in [scripts/pack.mjs](<../../scripts/pack.mjs>) checks the tarball names, the
  layout files and that no tarball holds a link; it never compares a tarball with its `SHA256SUMS`
  line. The pack script of dsh-fishball it was split from (`scripts/pack-v3.mjs` `check`) does.
