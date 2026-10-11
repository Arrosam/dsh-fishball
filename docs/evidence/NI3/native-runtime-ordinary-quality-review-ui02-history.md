# NI3 ordinary native runtime quality review

Status: independent source-only review complete for the exact pins below. This is an ordinary code-quality/interface/test-coverage review under the owner-authorized Luna exception in `AGENTS.md`; it does not close the blocked final CODE review, accept NI3, or change any AC disposition.

## Scope and method

Reviewed the ordinary NI3 native runtime client, installed worker, configuration and plugin boundary, role recipes, invocation carrier and owned-stream adapter, plus related source fixtures. Public DSH host interfaces were considered only through the project source and existing source test fixtures. No Node import, test, build, browser, service, database, network, Git, listener, or installation command was run. No product source was edited.

Read `AGENTS.md`, `docs/owner-amendment-2026-10-04.md`, and `docs/evidence/S3/review-session-blocker.md` for scope and exclusions. I did not inspect the protected S3-MEM-CR02 experiment or core receipt/envelope, migration, quarantine, or recovery internals. One broad search response briefly included adjacent ordinary audit preview/callback lines from `installed-audit.mjs`; I discarded that output and did not follow or use it as evidence.

## Findings

**F1 — Resolved in reviewed source: optional `auditRoles` rejected a valid audit-disabled policy preview.** `createInstalledWorker.description()` includes `auditRoles` only when audit is enabled, while the earlier client parser treated it as a required `workerRecord` field. The reviewed client now allows the field in the closed key set but requires only the prior fields; if present, it validates the bounded closed role shape. The new `native-runtime-client.test.mjs` source fixture covers the disabled shape and checks missing legacy fields, extra fields, and malformed `auditRoles`, with no confirmation/grant/create/execute calls. This is a source-level correction; the fixture was not executed in this review.

**F2 — Resolved in reviewed source: audit request cleanup skipped after a task revision.** `createAuditModel.clear()` advances the local revision when the task key changes. Its request continuation correctly refuses to publish stale results, but the prior `finally` condition also depended on revision equality and could leave `busy` set after the stale request settled. The reviewed source ties busy cleanup to connection epoch instead, while retaining the busy gate until that operation settles. The new source fixtures cover delayed status refresh after task drift, delayed configure after auth drift, and ensuring an old connection's `finally` cannot clear a new connection's busy state. These fixtures were not executed in this review.

**F3 — Resolved in reviewed source: stale audit mutations/previews and query identity were not fenced separately.** The approved client now gates ordinary operations while audit state is stale, leaves the same-task query path available, preserves stale/uncertain state on query, and compares all returned worker identity fields against the retained mapping. The audit card has a separate query gate for the currently selected task. New source fixtures cover task drift, safe same-task uncertainty query, changed task refusal, a late query response after auth drift, and foreign values for action/action digest/claim/reservation/generation/session identity. These fixtures were not executed in this review.

**F5 — Open: an uncertain audit create cannot reach its safe query path.** If `dispatchAudit` loses its response, `run()` records `uncertain='dispatchAudit'` and refreshes the task model, but it does not project a newly observed worker into audit model state. `create()` is then fenced by the uncertainty marker, while `query()` and the query button both require `state.worker`. The current task snapshot may contain the created worker, but the audit model does not derive the exact mapping from it. The safe query path therefore handles uncertain execute (where the worker mapping is already known) but not uncertain create. Reconcile exactly one worker for the current same-task audit action from current task facts, or refuse when that mapping is ambiguous; add a response-loss fixture that proves no second create is sent and query uses only the observed mapping. Host authority remains the final fence; this is a recovery/interface gap.

**F4 — Documented midstream-revocation cleanup boundary.** The updated `native-runtime-source.test.mjs` now covers two lazy `next()` pulls across an await, an authorized awaited consumer `return()`, revocation before first pull, and revocation after a yield before consumer `return()`. The latter asserts the revoked callback is refused before the producer finalizer runs and explicitly makes no cleanup claim. Static inspection confirms each iterator operation uses the captured token. This fails closed for callback authority and matches the project's no-instant-cancellation boundary; it does not establish producer-side resource termination or reservation release, which remain factual host lifecycle matters outside this helper's assertion.

## Evidence pins

Each entry is SHA-256 of the exact file reviewed. Hashes identify the review input, not a Git commit or acceptance claim.

| File | SHA-256 |
| --- | --- |
| `.runtime/ni3-native-runtime/src/client-entry.cjs` | `6bae1b62801348ef8c3cdd489b624882ceaeb7fdd1c5e2e061573551a0474620` |
| `.runtime/ni3-native-runtime/src/installed-worker.mjs` | `cdb1397b5e212d6bd25f435eba4f568a4032441dc2b2add0052c8e32771ff237` |
| `.runtime/ni3-native-runtime/src/installed-role-recipes.mjs` | `e8b98864eb136c51ece9837c6adf0219f27fffcb49cf2af2b039211d58739950` |
| `.runtime/ni3-native-runtime/src/installed-owned-stream.mjs` | `a059363119a2aac9ba39244cc147c6fc1f5c8d7536e23fe068eed83b28647df6` |
| `.runtime/ni3-native-runtime/src/installed-invocation.mjs` | `5c07bdfae80e7f624d1e6242a6b7ca97b50c6724860973be1906168fb0d35484` |
| `.runtime/ni3-native-runtime/src/installed-plugin.mjs` | `c57d089d50013af6fcee7d36831dd631a970d72e2e5d8f0bc4b2c6ffba0aee97` |
| `.runtime/ni3-native-runtime/src/installed-config.mjs` | `8161a5ed881d413e0b889ba20d4167b5ec502619240f5a1ef2b33808d12bccee` |
| `.runtime/ni3-native-runtime/src/host-probe.mjs` | `03e34e0bc3e82a8cbc0841a8f208cf98eac99e8accd7393f2997d394581d33c8` |
| `.runtime/ni3-native-runtime/src/runtime-plugin.mjs` | `a266fca5409ca81f91686a8c5f6227eb1cf1e84edc57fd59db7f51791127a83d` |
| `.runtime/ni3-native-runtime/test/native-runtime-client.test.mjs` | `6ae5613fc5b948f7e2e9fdba4368dcf967f8a0b302a71022e46706450af065a4` |
| `.runtime/ni3-native-runtime/test/native-runtime-source.test.mjs` | `16e7cd79bd893fba3c659d76afff56cef12cb93ba219b35918cccec1d8c6e248` |
| `.runtime/ni3-native-runtime/test/native-runtime-original-chain.test.mjs` | `5155043b548c832479a2c56e61fa261523eb8569109ae1bd5e44306bc0496272` |
| `test/worker-client.test.mjs` | `c65cf4333fc34e7b88be6e55396629afee5100e0427e68f3b18737ca01f728bd` |
| `test/worker-client-functional.test.mjs` | `34f2d7c1d53e28f9842587e211e73ef9d4670fdb887c22ab0d39b5a6ca079787` |
| `test/installed-worker.test.mjs` | `73d39e3d1c8a8b46bf475385c9586c70c5ab0a280170bef758e4d03cab0bcddf` |
| `test/installed-worker-runtime.test.mjs` | `d22914e0b439a104ac4ce41b5768984442f1ebc368e42a6755392c374fcf2653` |

## Bounds

No tests or runtime checks were executed, so this review provides no WebPASS, behavioral acceptance, or claim that source fixtures pass. F5 remains open as an audit create recovery gap. The stream fixture makes its midstream revocation boundary explicit without proving host cleanup. All 87 AC remain held; final NI3/CODE review, MVP acceptance, and publication are outside this review and remain blocked or deferred as recorded elsewhere.
