# Owner amendment 2026-10-23: install into the live DSH home

Owner request (2026-10-23 NZDT): "Install it to my current working DSH instance called DSH." Explicit answers recorded during the session:

| Question | Owner decision |
| --- | --- |
| Live host runs on DSH-X's bundled Node 22.19.0, pinned is 22.22.2 | "Update my npm version", then "Official Node 22.22.2 into DSH-X": replace the DSH-X bundled runtime with the official nodejs.org v22.22.2 darwin-arm64 build after checksum verification. |
| Live rc.2 install has no root `package-lock.json`; npm's `node_modules/.package-lock.json` lists the same 615 packages and integrities but npmmirror download URLs | "Compare by package in code". |
| Features | Base + memory + deterministic test worker. |
| The worker requires owning the profile's JSONL session root, which would hide the live `web` profile's sessions | "Add a separate 'fishball' profile with the worker". The owner's `web` profile is not modified. |

## Decisions applied

- **Host lock policy (supersedes byte-exact whole-lock).** `hostLockMatches()` in [host-probe.mjs](../src/host-probe.mjs) compares the installed graph to [the pinned lock](../scripts/dsh-web-runtime-lock.json) per package: same package set, and every field except `resolved` (download mirror) identical. The install-root row `""` is ignored. Lock source is `<root>/package-lock.json`, else `<root>/node_modules/.package-lock.json`. Version/integrity/extra/missing/metadata changes still fail closed. All former byte comparisons (probe, memory, worker facts, testing provider, native source descriptor) use this single helper. The source manifest's `lockDigest` now pins the product's own lock file.
- **Peers.** `@deepseek-ai/dsh-session-projection` and `@deepseek-ai/dsh-util-values` were imported but undeclared; app-boot only routes declared peers for a linked package, so they are now peers and a test requires every source-named host package to be declared.
- **Node.** The DSH-X bundled `node` and `npm` were replaced by the official v22.22.2 (SHASUMS256 verified, npm 10.9.7). The 22.19.0 binary and npm 10.9.3 are kept at `dsh-x/release/DSH-X-node-22.19.0-backup-20261023/`. The app was re-signed ad hoc exactly as DSH-X's own `pack-mac.mjs` does. DSH-X's bundled pnpm is unchanged.
- **Profile.** New `~/.dsh/profiles/fishball` (bundles `dsh-base` + `dsh-web-app` only), linked to this checkout, offline posture of the reviewed initial-preview launcher, port 3092, added as DSH-X launch item `fishball`. See [live install](live-install.md).

Nothing here grants acceptance, stable status, real-model use or publication. All 87 AC remain HOLD. These changes were verified by the full suite and a real browser check, not by an independent Claude Opus 5.5 CODE/ISTQB review, which remains outstanding for this unit.
