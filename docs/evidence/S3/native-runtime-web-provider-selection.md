# Shipped profile compiler: synthetic native credential selection

This correction follows the actual original-profile launch at031d66b. Root's immutable [first process report](native-runtime-web-original-profile-first.md) records ACTIVE followed by smoke failure before HTTP: expected private JSON auth record absent. The previous observer's literal credentialBacking label did not prove provider selection and is withdrawn. Root stopped the owned process; no task/action/provider/tool/recipient operation was admitted. The retained key/database/profile and synthetic-home .credentials.yaml were not modified or read by this author correction lane.

The pinned public include compiler treats patch.name as an expected-name guard, not replacement. `applyEntryPatches` destructures name separately at lib/index.js:68, and lines95–97 warn and skip a mismatching target. Public app-boot composeEntries at1054 applies the same shipped patch semantics. Therefore the historical `{id:credentials,name:runtime-web-credentials.mjs}` row was skipped, retaining official credentials-local. Original Connection's name-free inject patch applied. Connection.apply at819 passes ctx.credentials directly to original BrowserAuth.create; native signing format/authentication remains unchanged. Read-only metadata showed a regular0600/161-byte .credentials.yaml under the synthetic home, consistent with the default provider; its contents were never read, deleted, migrated or used as JSON proof.

The supported correction uses public patch semantics:

```yaml
- id: credentials
  disabled: true
- insert:
    - id: df-runtime-synthetic-credentials
      name: <trusted-project-runtime-web-credentials-module>
      config: {}
```

The original Connection package/name/Config/apply/client metadata, inject:[webServer] and trustedHosts[] remain unchanged. Only the separate synthetic fixture selects this explicit backing. No global DSH bytes, private register call, tracing symbols, authentication algorithm, alternate transport or namespace are changed. The previous synthetic-home YAML remains preserved.

[runtime-web-profile.test.mjs](../../../test/runtime-web-profile.test.mjs) parses shipped base/Web YAML with the exported entryListSchema and invokes actual public composeEntries. Its historical negative preserves the skipped name guard. The corrected vector requires no warnings, exactly one disabled official provider, exactly one enabled inserted synthetic provider, and unchanged original Connection metadata. This closes the literal-JSON-only test gap.

The native module case imports the exact selected provider module/class. Its narrow trusted factory binds only the backing path to fresh temporary JSON storage; a temporary module selects that same factory through real public Loader.create. It is an explicit test-storage adaptation, not the exact retained CLI profile activation. Original Connection is mounted by Loader from the compiled metadata and retains exact moduleNamespace/Config/apply and merged credentials+webServer dependencies. Public WebServer is constructed inside a plugin callback without Service.init/listen; server.server remains undefined. Original native303 token exchange, actual OperatorPeer admission, anonymous401, cross-origin403, record digest retention across remount and awaited route cleanup pass. Temporary synthetic record bytes are read privately for digest comparison; token/cookie/record contents remain absent from output. No owned host profile, listener, HTTP, browser, model/provider/tool call or retained-profile credential read occurs in these module cases.

The runtime fixture now injects credentials and verifies actual FixtureCredentialProvider, native grant description configured:true/kind:grant/writable:true, and private regular backing before any key/store/ACTIVE write. credentialBacking is derived allowlisted metadata, never a literal readiness claim. An immutable opaque fixtureInstance value checks same provider incarnation across the asynchronous description; it contains no secret or authorization. Public Cordis shadows wrap service objects and even bound methods, so direct object/function equality is unsuitable. The first authored2PASS/1FAIL run is preserved in [provider-selection-first.tap](native-runtime-web-provider-selection-first.tap); the faulty equality assumption was corrected without weakening the provider replacement predicate.

Before independent retest, an additional author temporary-path probe showed that valid provider metadata plus an unrelated regular0600 file could pass the initial verification seam. [The original allowlisted failure](native-runtime-web-provider-selection-wrong-path-first.json) and first held manifest are preserved. Root authorized the minimal correction: the provider-bound synchronous assertFixtureBacking(path) requires its exact private backing path, active native grant and exact0600 mode after the asynchronous metadata/instance check. This emits no credential payload and rejects an unrelated file and0400 mode. The original owned profile/key/database/YAML remain untouched.

`env -i PATH=/opt/homebrew/bin:/usr/bin:/bin node --test test/operator-bridge.test.mjs test/runtime-plugin.test.mjs test/native-runtime-integration.test.mjs test/runtime-web-fixture.test.mjs test/runtime-web-profile.test.mjs` passes25/25,0skip; [final raw output](native-runtime-web-provider-selection-owned-final.tap). The earlier25/25 output remains separately preserved before the path-binding correction. `node scripts/check.mjs` checks78ESM files. The independent original19/35 and compiler-selection oracles are separate reviewer-owned evidence, pending retest on this held correction.

Source provenance, all already installed and read-only:

| Public package/surface | Exact version | SHA256 |
| --- | --- | --- |
| cordis-plugin-include/lib/index.js |1.0.10-alpha.1|ad5eaf3b80a8fd9945466486493a0d1a8e9590895bcde01e5673f3d07b4fd306|
| dsh-app-boot/lib/index.js |0.2.1-alpha.1|619d80619320e953e5ddcee7c71e4b97e90e722a7d17da8819f3bb47e00587be|
| dsh-base/cordis.patch.yml |0.2.1-alpha.1|9c2be64f46a193eff3cca190c26e697e8e8eee25c9b40149dfdb56f8142c252d|
| dsh-web-app/cordis.patch.yml |0.2.1-alpha.1|3073a35dbb1dafd933143e7c299452256073f9f7f5f129aeeeba85a55fa85192|
| dsh-client-connection/lib/index.js |0.2.1-alpha.1|3950f524aed44e28240140a254cd928ea40eba8e2d04cc8fd04f92a687f5c91d|

Installed paths are `.runtime/dsh-web/node_modules/@deepseek-ai/<package>`; exact official registry integrity entries remain in [tracked runtime lock](../../../scripts/dsh-web-runtime-lock.json). The committed031d66b15-file manifest and every old failure/manifest remain immutable; fresh corrective hashes are native-runtime-web-provider-selection.sha256.

Root controls preparation of the same retained profile and any actual process/listener/HTTP retry. No such action occurred in this author lane. Normal layered CLI provider selection, authenticated owner HTTP/intake/context/dedup/restart, portable production secret storage/private installation, true model/tool behavior, browser render/navigation and final independent CODE remain unpassed/HOLD. Module success is bounded synthetic credential infrastructure for unchanged original native auth, not normal default-profile/MVP acceptance.
