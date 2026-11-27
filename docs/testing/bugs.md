# Real bugs found by the tests

A case that fails because the code breaks a requirement that still holds is registered with
`{ todo: 'BUG-<n> …' }`: it runs and reports, without failing the run, until the bug is fixed.

## BUG-1 (fixed): `pack.mjs --check` did not verify SHA256SUMS

- **Case:** `REL-ST-01 tamper` in [pack-checksum.test.mjs](<../../integration/release/tests/pack-checksum.test.mjs>), offline and SDK-independent.
- **Observed before the fix:** changing bytes in `dsh-instance-1.0.0-alpha.1.tgz` could leave it
  readable as an archive; `node scripts/pack.mjs --check --out <copy>` then printed "is intact"
  and exited 0.
- **Expected:** a non-zero exit naming the checksum mismatch. `--check` "verifies an existing release
  offline" (root README, `npm run pack:check`), and `SHA256SUMS` is part of the layout it checks;
  the old REL-ST-01 requirement was valid → tampered (non-zero) → restored (0).
- **Cause:** `check()` in [scripts/pack.mjs](<../../scripts/pack.mjs>) checks the tarball names, the
  layout files and that no tarball holds a link; it never compares a tarball with its `SHA256SUMS`
  line. The checker now hashes each tarball and compares with the manifest before inspecting the
  archive. See [regressions.md](<regressions.md>) for the before/after run.

## BUG-2: after a host restart the child does not link to the parent again

- **Case:** `HOST-UC-02 A1` in [integration/hosted-child/tests/hosted-token.test.mjs](<../../integration/hosted-child/tests/hosted-token.test.mjs>), both SDKs.
- **Observed:** after the host DSH restarts, the child is ready and serves its page, but the original
  paired entry stays disconnected. The latest reproduction saw Fishball adopt the new URL from the
  launch overlay; the earlier report of a stale stored URL did not reproduce.
- **Expected:** the child links again with its paired entry. Package README, "The hosted token":
  the parent's URL comes only from `dsh-instance-child.targetUrl`.
- **Cause / boundary:** the test host uses an ephemeral port. When the parent origin changes,
  Fishball's target synchronizer creates a new endpoint epoch and retires the old epoch's credentials.
  That is deliberate protection against sending a credential to a different endpoint. Reusing the
  credential would require an upstream decision about how to establish continuity of the same parent
  across an origin change. A fixed-port restart is not covered by this reproduction.

## BUG-3: later host restarts create new hosted entries

- **Case:** `HOST-UC-02 main`, same file, both SDKs.
- **Observed:** after repeated restarts with a changed port, the connector can get a new
  "Fishball (hosted)" entry without a corresponding key in `hosted.json`.
- **Expected:** no new entry while the child holds a parent credential. Package README: "Only when
  it does not … it calls `createHosted` once."
- **Cause / boundary:** after Fishball retires the saved credential (BUG-2), the host's DSH credential
  probe can legitimately report that neither the reference nor saved record is present. The host
  then provisions as specified and only records an entry after a successful import. Treating an old
  entry key as proof of a current credential would also suppress valid provisioning after credential
  loss; resolving the changed-origin lifecycle requires the same decision as BUG-2.

## BUG-4: the child does not pair the entry Reconnect created

- **Case:** `HOST-UC-02 reconnect`, same file, both SDKs.
- **Observed:** Reconnect answers `{ok: true}`, records exactly one new entry and the child drops its
  link on the old one, but it never pairs the new entry (also not after a restart).
- **Expected:** the child pairs it. Package README: "Reconnect creates one new entry and imports it
  once" and moves/deletes nothing.
- **Cause / boundary:** the import reaches Fishball, but the connector refuses `pair` with
  `id-taken` when another entry is still paired to the same Fishball identity. Fishball then
  waits for a new identity. Preserving the old pairing and pairing the new entry to the same identity
  are incompatible with the current connector contract. Which pairing or identity should change
  needs a design decision; no credential or pairing policy was changed here.
