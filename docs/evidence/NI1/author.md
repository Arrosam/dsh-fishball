# NI1 author checkpoint

Status: **source HELD, partial author validation; not NI1 acceptance**. The required fractional-confidence normal-RPC correction is pending its separately frozen contract/design and GO. Final independent CODE and browser/visual gates remain HOLD. NI2–NI6 remain required implementation. No actual host/HTTP/listener/browser/provider/recipient operation was performed by this lane.

The implementation follows [the frozen NI1 contract](../../normal-entry-integration-plan.md) and [the independent preimplementation design](test-design.md), SHA256 `701efb747c86570653ed72023f34d7c04e7c58dfedff185d44bfe718cb639cc8`. Exact executable/supporting bytes are in [the 18-path manifest](author-held.sha256), SHA256 `361b4e8b76fec9db107864beeeaaf401aceb614ddbf954ca1d8bf4ff35adfbbc`. [Machine-readable disposition](author-held.json) preserves results and remaining gates.

## Implemented API

- `installed-config.mjs` exports `validateInstalledConfig(input)` and synchronous Standard Schema `Config`. Output is detached/frozen `{databasePath,hostTarget,limits,memory}`. Ordinary and null-prototype enumerable own data dictionaries are supported; hostile descriptors/proxies and explicit undefined memory refuse. Memory omitted/false normalizes to `{enabled:false}`; true requires explicit byte1..65536 and token1..131072 safe integers. The original base Config remains unchanged and rejects memory.
- `installed-memory.mjs` exports `MEMORY_ACCOUNTING` and `prepareInstalledMemory(enabledChoice)`. The latter verifies the canonical public peer/export/version/source and whole-host lock before returning a private frozen binder `(identity,profile) => {namespaceRef,tokenize,byteLimit,tokenLimit}`. No tokenizer callback or evidence override is accepted. Product calls the binder only from verified SetupState activation. Direct synthetic binder tests are pure derivation tests, not proof that JSON identity authenticates.
- The installed entry exports the installed Config, passes only frozen base fields to the unchanged runtime factory, and composes memory inside verified activation. Required services/carrier, original setup responses, diagnostics-only `dfSetup`, setup vault/HMAC/key/schema4 and synchronous own-child disposal remain unchanged. `hostPermission` stays false; later optional features stay absent.
- Original authenticated `/df-setup/v1/features` accepts exactly `{}`. Its closed output contains memory enabled/ready/accounting/bounds only. Ready requires SetupState ready and the actual current admitted child with a live UID and literal memory capability true. Config enablement or before-consent status is insufficient. Own disposal returns the existing `SERVICE_DISPOSED` projection.

## Accounting and provenance

The actual existing public `@deepseek-ai/dsh-token-meter/estimate`0.2.1-alpha.1 is used, source `lib/types/estimate.js`, SHA256 `1ec049c1e11f8014c84c6ce0568417227177ad7166f5520c00568e9b6e92589f`. Only its pure estimator export runs; no optional meter/model/provider service is activated. Package metadata adds exactly this consumed peer; no download/install/lock change occurred.

`estimateContent([{type:'text',text}])` accounts one rendered block as `ceil(text.length/4)+4`, where length is UTF-16 units. Label `dsh-fixed-density-text/v1` states heuristic semantics; actual bytes use UTF-8. This is not exact provider tokenization, billing or total-request capacity. The unchanged context modules measure complete rendered protected/background text and remove optional backgrounds whole. Stored context JSON/provenance has its separate65536-byte limit.

Namespace is the exact SHA256/UTF-8 JSON-array formula in the frozen contract, using verified private setup identity and canonical profile. It is stable across selected bounds, disable/re-enable and reload; different identity/profile derives another namespace. No config/RPC namespace selector or public identity/key/profile proof was added.

## Commands and results

Node was `v22.22.2`. Results are module oracles, not physical packed CLI acceptance:

| Command / evidence | Result | Scope |
| --- | --- | --- |
| `node --test test/installed-memory.test.mjs` / [first](author-first.tap) |17/18 | Genuine normal native module rejects confidence0.9 before MemoryAdapter. Required integration gap preserved. |
| Same command / [second](author-second.tap) |17/18 | Long preference did not match short query `English` at the existing Jaccard threshold. Corrected author query to exact preference; no memory algorithm change. |
| Same command / [third](author-third.tap) |18/18 | Explicit supported confidence1 plus retained fractional no-write negative. This does not close the required confidence0.9 gap. |
| `node --test test/installed-memory.test.mjs test/installation.test.mjs test/installation-adversarial.test.mjs test/runtime-plugin.test.mjs test/operator-bridge.test.mjs test/native-runtime-integration.test.mjs test/memory.test.mjs test/context.test.mjs` / [final affected](author-affected-final.tap) |144/144,0skip | Current held source/test bytes. Original authored/independent tests untouched. |
| `node --test test/onboarding-client.test.mjs test/onboarding-client-adversarial.test.mjs test/onboarding-client-405-adversarial.test.mjs` / [onboarding](author-onboarding.tap) |72/72,0skip | Existing strict setup client envelopes remain unaffected. |
| `node --test test/portability.test.mjs test/portability-adversarial.test.mjs` / [portability](author-portability-first.tap) |30/31,0skip | Sole old independent exact-peer-set expectation differs only by new authorized token-meter peer. Negative relocation/peer/root/source/lock gates pass. Old assertion was not edited. |
| `node scripts/check.mjs` / [syntax](author-check.txt) |PASS,90ESM | Current new/runtime/test scripts. |
| `node scripts/build-client.mjs --check` / [bundle check](author-client-check.txt) |PASS | No client/bundle edit. |

The author provenance fixture copies only pinned public estimator metadata/source and the frozen lock into disposable roots to test canonical/missing/version/source/alias/symlink/lock/mixed-root partitions. Its canonical estimator result is not full host acceptance. Original no-listener native tests separately use genuine public Cordis, Loader, unchanged Connection/BrowserAuth/OperatorPeer and WebServer constructor without initialization; requests are in-memory streams through original native framing/authentication, not actual HTTP.

## Observable bounded facts

The native module proves enabled/disabled and owner/anonymous preconsent partitions with no DF parent/key/vault/DB write; empty memory read at0; explicit sourced remember; exact immutable protected context through admitted detail; actual heuristic tokens and UTF-8 bytes; plaintext canary absent from the main encrypted DB; unchanged key/state hashes and exact vault entries. The default base metadata bound1024 succeeds for that simple sourced context without any increase. Ten own reloads plus disable/re-enable preserve namespace/revision and add no sessions/meter/provider/tool/recipient effects. Old own route/diagnostics deny synchronously on disposal.

The separate actual-store author tests preserve protected-overflow/stale-version no-write results. Two independently open Node processes race revision0: one encrypted mutation commits revision1 and acknowledges, the other refuses `STALE_MEMORY`; both abruptly exit, and reopening recovers the acknowledged digest. This demonstrates the stated memory transaction cuts, not arbitrary external exactly-once effects.

## Required open corrections and evidence

Unchanged `operator-bridge.mjs` JSON capture accepts only safe integral numbers. MemoryAdapter accepts finite confidence0..1; therefore normal confidence0.9 currently fails `INVALID_INPUT` before mutation. Root requires a narrow operation-classified numeric correction under a new frozen addendum/design. The first counterexample remains, and the current positive confidence1 case is not treated as its remediation. No bridge edit was made in this checkpoint.

The unchanged independent portability peer-set assertion needs its separately authorized new exact-peer expectation, preserving previous bytes and all negatives. Independent NI1 adversarial execution is pending the held source. Root alone owns emitted physical-package/original native CLI proof. Those gates, NI2–NI6 and final CODE/browser/visual acceptance are not supplied by these author totals.
