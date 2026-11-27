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

## BUG-2: after a host restart the child does not link to the parent again

- **Case:** `HOST-UC-02 A1` in [integration/hosted-child/tests/hosted-token.test.mjs](<../../integration/hosted-child/tests/hosted-token.test.mjs>), both SDKs.
- **Observed:** the child pairs at its first start. After the host DSH restarts, the child is ready
  and its page is served, but the connector shows its entry `connected: false`. The new launch
  overlay names the host's new `targetUrl`; the child's fishball-core still holds the first
  start's parent URL in its own target storage.
- **Expected:** the child links again with its paired entry. Package README, "The hosted token":
  the parent's URL comes only from `dsh-instance-child.targetUrl`.
- **Note:** the test host takes a new OS port at every boot, which a real DSH on its fixed port does
  not. The requirement still holds, but the fix may be on the Fishball side (core keeping a stale
  parent URL) rather than in this repository.

## BUG-3: later host restarts create new hosted entries

- **Case:** `HOST-UC-02 main`, same file, both SDKs.
- **Observed:** from the second host restart after pairing, the connector lists new
  "Fishball (hosted)" entries although the child holds its credential. The new entries never pair,
  and some are never recorded in `hosted.json`.
- **Expected:** no new entry while the child holds a parent credential. Package README: "Only when
  it does not … it calls `createHosted` once." Probably linked to BUG-2 (same port change).

## BUG-4: the child does not pair the entry Reconnect created

- **Case:** `HOST-UC-02 reconnect`, same file, both SDKs.
- **Observed:** Reconnect answers `{ok: true}`, records exactly one new entry and the child drops its
  link on the old one, but it never pairs the new entry (also not after a restart).
- **Expected:** the child pairs it. Package README: "Reconnect creates one new entry and imports it
  once"; the import feeds core's ordinary token path, which pairs.
