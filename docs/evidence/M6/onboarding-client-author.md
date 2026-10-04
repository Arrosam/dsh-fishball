# Native onboarding client author evidence

Status: **IMPLEMENTED; author module tests PASS; independent ISTQB execution pending; final CODE and actual browser/visual acceptance HOLD.** Author `/root/onboarding_ui`, inherited owner-requested Sol6.1/high. No blocked correctness session was substituted. No browser tooling exists for the required render/keyboard/focus observations.

Root published and committed the independent design before implementation: [installation-test-design.md](installation-test-design.md), SHA256 `5321fdc7898780972ba3b9d1a5f59fd4b2819b98aec30b8155c7084fa0f1b127`, commit `334fabccca99669538724117a69ea1c86cf5c98c`. Implementation GO followed root's review. The amended [onboarding contract](../../onboarding-contract.md) SHA256 is `f61ea745b6ae9080f9d9f12bdbbcf27ff5235d5278fcfce41827e40af7aa6fcd`. Branch at author checkpoint is `feat/S3-integrations`; starting local main is `3b136e1ab264040b535c1e787b89f659328b30c4`. Root is the sole Git writer; this lane performed no Git mutation.

## Implemented boundary

Exclusive source changes are `src/client-entry.cjs` and its reproducibly generated `lib/client.js`; author tests are the new `test/onboarding-client.test.mjs`. Existing authored tests remain unchanged. The optional `Panel({ model, setupModel })` preserves direct existing `createModel` task workflows and hooks. Native `apply` owns both models but initially queries only setup status. A confirmed server `ready` status starts the original task-list refresh. Mount, refresh and reconnect never confirm setup.

`createSetupModel(rpc, {clock = Date.now})` provides `refresh`, `prepare`, `setAccepted`, `confirm`, `canConfirm`, `now`, `disconnected`, `dispose`, `subscribe` and `getSnapshot`. `setAccepted(boolean, previewRef?, planDigest?)` and `confirm(previewRef?, planDigest?)` default optional bindings to the current frozen preview for direct module use. The actual checkbox and separate confirmation button capture the exact displayed refs. A captured old handler cannot accept or confirm a new plan. Acceptance is reset by refresh/new preview/disconnect/confirmation. The confirmation payload contains only `{ previewRef, planDigest, accept:true }`.

Status/preview/description output rejects unknown fields, accessor/nonenumerable/symbol fields, unexpected prototypes and invalid constants. The displayed absolute database location is bounded to4096 UTF-8 bytes with no controls or unpaired surrogates. Refs/digest are exact64-character lowercase hex. Expiry must be a safe integer greater than response-time clock and no later than response-time clock plus60000ms. This response-time upper bound allows the native server's60s TTL despite RPC latency; the server remains the expiry authority. Request-time and observed-clock rollback fences disable stale client consent. Public error prose/secret fields are never retained or rendered; stable codes only.

Epoch/revision checks, request aborts and pending guards prevent duplicate confirmations and late result publication. A disconnect synchronously triggered by pending-state publication fences dispatch before RPC. If confirmation throws, rejects, has a malformed response or reports another target, the client invalidates consent and queries status once. It never retries confirmation or creates keys. A readback may show real server ready, setup-required, recovery or unavailable status, while retaining a stable error for the lost/invalid acknowledgement.

Advanced-runtime compatibility recognizes only the pinned public native error string `transport failure for /df-setup/v1/status: HTTP 404`; root independently verified the original public `createWebConnectionRpc` source at `lib/client.js:1227`. A successful fresh original `/df-rpc` list is additionally required before the original task UI becomes usable. Auth/403/500/network/other404/substring matches and failed lists stay blocked. Setup status refresh invalidates a previously usable task snapshot before any replacement list can complete.

The setup card explains the exact local storage target, private local namespace/native owner meaning, encryption, owner-only files, and absence of model/tool/action/recipient/event authority. It explicitly states model/action execution unavailable and host permissions deny by default. Recovery/unavailable/offline/loading/pending/stale/expired states disable confirmation. No keys, native/private handles, identity callbacks, HTTP implementation or provider/model/host invocation were added.

## Author verification

Runtime: Node `v22.22.2`, Python `3.14.5`, macOS, no dependency install. Build used the existing native bundle emitter. Commands:

- `node scripts/build-client.mjs`
- `node --test test/onboarding-client.test.mjs test/client.test.mjs test/client-features.test.mjs test/client-feature-adversarial.test.mjs test/client-build.test.mjs`
- `node scripts/build-client.mjs --check`
- `node scripts/check.mjs` (83 ESM files syntax checked at that shared-tree checkpoint)
- `git diff --check -- src/client-entry.cjs lib/client.js`

The retained [author TAP](onboarding-client-author.tap) reports **83/83 PASS**:20 new setup author tests plus63 existing client/build/feature/adversarial tests. First focused20-case setup run and the final affected83-case run passed; there was no author test assertion failure, removed test or weakened test. Existing client tests include genuine public Cordis/SlotCore and captured Connection/encrypted-store fixtures; they remain module evidence. No HTTP/listener/native CLI/browser/provider/inference action was executed by this lane.

UISET-01..09 receive author module contributions: status-only first load/prepare, displayed checkbox plus separate exact confirm, double-click guard, pending/disconnect/unload/late result fences, uncertain status-only reconciliation, exact404 plus fresh-list compatibility, closed output/callback canaries, phase/expiry/rollback explanations and backward-compatible existing task tests. Additional cases cover old handler closures, synchronous disconnect at dispatch publication, and preview TTL with simulated transit latency. These are synthetic typed React trees and RPC facades, not visual/accessibility acceptance and not an independent correctness review.

The [held manifest](onboarding-client-author.sha256) binds the final source, generated bundle, new author tests and frozen design/contract. Source is held for root integration and independent ISTQB tests. Server publication, real installed package/native profile initialization and actual authentication/process tests belong to their respective authors/root. UISET-10 is NOT RUN / HOLD; final CODE remains blocked by the flagged independent session. Full MVP acceptance/publication remain HOLD. No personal credentials/settings or external services were touched.
