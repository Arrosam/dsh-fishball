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

- **Active regression:** `HOST-UC-02 A1` in [hosted-token.test.mjs](<../../integration/hosted-child/tests/hosted-token.test.mjs>), both SDKs.
- **Observed:** after a host restart on a different port, the child is ready and uses the new URL from the launch overlay, but the original paired entry stays disconnected.
- **Expected:** the child reconnects to the same hosted entry and agent ID; it retains management of the existing session and can take another one. This does not authorize credential reuse across origins for targets added manually.

## BUG-3: later host restarts create new hosted entries

- **Active regression:** `HOST-UC-02 main`, same file, both SDKs.
- **Observed:** repeated restarts with a changed port can add a `Fishball (hosted)` connector entry without recording it in `hosted.json`.
- **Expected:** repeated port changes leave one connector entry, the same recorded key and the same agent ID.

## BUG-4: Reconnect replaces a live entry that should be reused

- **Active regressions:** `HOST-UC-02 reconnect` and `reconnect deleted`, same file, both SDKs; bilingual success feedback in [settings.test.mjs](<../../packages/dsh-instance/tests/pages/settings.test.mjs>).
- **Observed:** Reconnect returned `{ok:true}`, recorded a second entry and disconnected the original. That second entry did not pair because the original still owned the agent ID.
- **Expected:** Reconnect after a host port change reuses the live owned pairing. A deleted entry can be replaced and paired without transferring its managed sessions. Where only storage was confirmed, the English and Chinese acknowledgement must not present it as confirmed pairing.
