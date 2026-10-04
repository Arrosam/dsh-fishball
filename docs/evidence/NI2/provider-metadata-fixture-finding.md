# NI2 explicit synthetic-provider metadata expectations

The preserved [first authored TAP](provider-metadata-author-first.tap) has71 tests,68 passed and3 failed. Failures are the old exact four-export and21-peer snapshots after the frozen NI2 addition. No original factory/client mapping changed, dependency was installed or host lock changed.

Root verified former independent source hashes before correction: `test/installation-adversarial.test.mjs` SHA256 `3a0cca0b3030fa70ab01a02cf4b2bd2f0a235cf72f1f049f96c9b7c193dea756`; `test/portability-adversarial.test.mjs` SHA256 `cc7a3040498a0cd159206d741df74d3e486aefbe777f7390847b74626c9fc2ee`. Their previous bytes remain in granular Git history.

Root extends only the exact export expectations with `./testing-provider` → `./src/testing-provider.mjs`, and the peer set with original public Loader1.0.6-alpha.1, SystemPrompt0.2.1-alpha.1 and AgentPresetRegistry0.2.1-alpha.1. The relocated bare-resolution positive case now exercises the fifth subpath and expects five resolved paths for the current package. Historical supplied artifacts retain their former exact optional-entry contract. Arbitrary extra exports/peers, path escapes, aliases, mixed native class/source roots, missing peers and resolver fallback remain rejected by unchanged negative assertions.

A held-source rerun must verify the corrected expectations. No testing-provider registration/stream/native CLI/package/browser/CODE acceptance is implied by an import-resolution or metadata assertion.
