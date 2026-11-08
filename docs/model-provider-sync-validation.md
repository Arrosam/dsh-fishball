# Provider/API-key record sync validation

Date: 2026-11-04. Branch: `feature/model-provider-sync`, based on `dfdb5a64fb8521b36a92f29a10ebce9221a74494`. This feature does not include the independent refresh commit `a9f10a1db841751659d0440e15ca1e9f546fd9ec`.

## Scope and safety

Development and test execution used only installed SDK/program source, generated opaque in-memory fake values and disposable HOME/DSH_HOME credential stores. No live configuration, environment credentials, keychain, API keys or secret exports were read. No install, restart, push, or real synchronization occurred during validation. Official credential-local persistence was the only fake-key file copy and was checked at mode 0600. No account-authentication network probe was made.

The implementation uses official root pi-ai Config/recordKeyFor, configurable-provider inventory, redacted settings descriptors, ConfigEditor owner entries, revision-fenced settings.mutate, credential describeRecord/readRecord/modifyRecord, and modelCatalog. It does not modify YAML/JSONL directly or extend session-management tools. Both pages explicitly pair; every import requires metadata preview, selected additions and confirmation.

## Independent requirement-only tests

Separate test authors did not inspect new production implementations/diffs while authoring tests. They used equivalence partitions, boundaries, decision tables and state transitions; the implementation author did not read their tests while coding.

- Lower-level suites: engine, source coordinator, dedicated loopback transport, official host boundary, official credential-local storage and end-to-end paired host adapters. Final **136/136** passed on both installed **DSH rc.3 and rc.2**, no skips; the public `FBTEST_DSH_RUNTIME` selector points fixtures to the chosen installation’s `node_modules` without reading live profiles.
- Owner page: **27/27** new tests (13 registered-component UI, 14 owner-route), plus **5/5** existing dedicated-model tests. Covers bilingual labels, capability scope, both pairing approvals, preview-only action, all four readable groups, fixed key mask, add-only selection and separate consent, minimal confirm payload, pending guard, sanitized errors, partial/unknown outcomes without retry, lazy initialization and close-during-initialization revocation.
- Final parent combined run: **252/252**, exit 0, no failures or skips, across all provider-sync suites and existing dedicated-model client/Save/system/messaging regressions. Final log: `.runtime/provider-sync-final.log` (local ignored artifact).

Public-API tests include actual paired loopback host adapters and official credential storage, not merely mocked final results. They assert zero record-value reads/writes during preview, the current selected source record at confirmation, a minimal providers/id set with expected revision, lock-held create-only import, existing record preservation, and no unset/delete/default/gate changes.

## Review-driven regressions

Independent review and black-box tests found and verified fixes for:

1. Mutable peer identity/pairId captured by reference: consent now stores immutable snapshots.
2. Cancellation after awaited metadata and lifecycle close races: merged owned signals, before-write fences, lock-callback checks and generation-bound initialization.
3. Silent rebasing of unrelated changes during import: only known own delta advances expected state.
4. Missing results for selected but unattempted items after partial halt: every selection gets an outcome.
5. Misreporting post-write failures: known imported/added outcomes survive metadata errors; ambiguous SDK/transport commit outcomes remain unknown, without retry or rollback. Known source-read failures are preserved on a lost response.
6. Orphan target API-key/grant records absent from provider directory: metadata-only preview and pre-add checks skip without filling configuration; late record appearance is also skipped.
7. Same-config owner restart: owner generation binds the official Cordis activation store, not only reused Entry/Fiber identity. Official pi-ai providers are volatile settings, so supported additions do not require an unsafe generation rebase.
8. Invitation explanation, readable skip names, safe protocol/endpoint/model IDs in consent, and uniform static owner-route refusal responses.

## Known limits / not claimed

- No real-browser layout/keyboard check or live owner-gateway end-to-end test was performed; component/route behavior is tested in the existing registered VM boundary. Existing DSH connection gateway owner authentication is reused, with an additional Origin/sec-fetch fence.
- Same-user loopback pairing is not an OS security sandbox or hostile-plugin attestation. Invitation/pair capabilities must remain private on owner pages; debug recordings of transfer bodies are not enabled.
- There is no cross-store atomic config/credential transaction or source credential CAS. The current source key at confirmation and config-first transient ambient-auth exposure were explicitly accepted. An already-started official SDK write cannot be revoked by cancellation.
- Official credential-local is owner-only plaintext YAML, not encrypted storage. No arbitrary reference, ambient, OAuth, grant or login transfer is supported.
- Catalog presence means advertised/routable metadata only, not verified account authentication. Existing provider model lists are not merged.
- Passing fixtures does not imply live installation or first real synchronization. Refresh and sync remain separate local commits until the approved combined installation step; the first real transfer still needs separate approval.

## Final review and rerun

Independent read-only security reviewer `b0551ed9-7d32-4963-a6e7-1ac5e3e49588` approved the frozen source for local fixture-only delivery and commit with no outstanding critical blockers. The reviewer read source/tests/official SDK only, modified nothing, ran no hosts/tests and accessed no live configuration/keys. This is not authorization or certification of live installation or real synchronization. The final frozen parent rerun passed 252/252 (exit 0); syntax checks for all new modules, client and index, plus git diff --check, also passed. A prior 251/252 run was investigated: the sole failing new display fixture used an uncontracted `protocol` property instead of the published `api` field; the independent author corrected that fixture without changing production behavior, then verified 32/32 page/model tests before the final combined run.
