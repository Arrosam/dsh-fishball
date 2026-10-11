# NI4/5 ordinary parser source review

**Status:** independent source-only ordinary interface/domain/test-coverage review of the approved parser delta. NP-ORD-01 from the prior report is explicitly RETRACTED after checking the exact frozen MemoryAdapter source: its `conflictRefs` limit is 16, matching the client parser. A boundary fixture gap remains; no functional mismatch is established. This is not ISTQB review, runtime/native verification, acceptance, or GO. All 87 AC remain HOLD.

## Exact reviewed pins

Capsule: `.runtime/ni4-5-normal-wiring-proposal/`.

- Approved parser-domain proposal: `docs/evidence/NI4-5/normal-entry-parser-domain-proposal.md`, SHA-256 `7900a2782979aaf67745a8dbc1aac0ee10b361ef708384db37ce3515417dcd14`.
- Candidate client: `src/client-entry.cjs`, SHA-256 `8789517fd4271eff7e1531b57ee34713de24c8cbc1899938c4e60b53a0b26e74`.
- Source fixture: `test/normal-parser-source.test.mjs`, SHA-256 `f4693d8e827cda18b898a752a8e82768784fa394e0fb8611ba0016d0fb6e515d`.
- Literal source/test delta: `parser-source-delta.patch`, SHA-256 `fd0e2052780f2249d9e850afa89ad2c02774ffe61f2e332b0c5b13a27ee5f164`.
- Draft source closure: `draft-source-closure.json`, SHA-256 `73c8088d785211c117820cb9205029a72262ccaab2b95962214b15b48287ddee`.
- Parser closure: `parser-source-closure.json`, SHA-256 `4f37d24fe84f31f2930e1eca784914847bb379582a4fb3b6dc5387d2a9124ac2`.
- Source-hold metadata: `docs/evidence/NI4-5/normal-entry-parser-source-hold.json`, SHA-256 `58a3c2afacad96ed6b60eefbe934debc49a9a1f054f1dcfc483b7b9b3c599685`.

Original public domains statically checked from the frozen candidate's source:

- `before/src/installed-events.mjs` `d04c3e05993843d938773ac115ceab3aee68ffb4fd43294e09c7f1b42ba9fe3a` and `before/src/event-clock.mjs` `65d7882c9960227dacdc7be3591da60c924cb17019b54e14e87a032f38f737c5`.
- `before/src/installed-memory-continuity.mjs` `e7163309956f2a07b9f80cec154fc29bf12f57b4fc2adeced7bc7595eda85382` and `before/src/memory.mjs` `dba915b9f3c2a76ef05cce50611a553ecb792e896b7095b70e7491a9cae72a01`.
- `before/src/fishball-memory-core.mjs` `65efb6117e6f60f5b669b2305b75f3e43ed7e77530c20c374158d504b7ac03bc`.
- Current candidate public feature endpoint source `src/installed-plugin.mjs` `cf079d25ade310e94da36c4c13ca4bf5a5d4af0f9d84e00c241fb2456c46a3a3`.

## Findings

### NP-ORD-01 — RETRACTED: `conflictRefs` cap matches the original public memory API

I initially claimed the original `MemoryAdapter` accepted more than 16 conflict references. That claim was wrong. I preserved the prior report pair byte-identically at `docs/evidence/NI4-5/history/parser-conflictrefs-before-correction/` before rechecking.

The exact frozen source `.runtime/ni4-5-normal-wiring-proposal/before/src/memory.mjs` has SHA-256 `dba915b9f3c2a76ef05cce50611a553ecb792e896b7095b70e7491a9cae72a01`; the current capsule copy has the same hash. At line 25 its helper is `function array(value, max = 16)`. Both `#validate()` at line 74 (`array(value.conflictRefs)`) and `#candidate()` at line 133 (`array(input.conflictRefs)`) omit the optional max and therefore use 16. The candidate parser at `src/client-entry.cjs:598,655` likewise defaults `normalRefs` to 16 and calls it with only `{ unique: false }`. The reviewed parser cap therefore matches both original write admission and projection validation. A 17–128 array does not establish valid original persisted data; the continuity capture's outer array ceiling does not widen the adapter's inner limit. No parser widening or >16 positive fixture is warranted by this evidence.

The source fixture set does not exercise the exact boundary trio of valid empty, valid 16-entry, and rejected 17-entry `conflictRefs` at the adapter/client projection boundary. That is a coverage gap only; it is not a demonstrated functional mismatch. The earlier claimed effect on readable persisted history is withdrawn.

### Other reviewed domains

- The parser closes all 21 automation-slot fields and nested pending-verification, clock-decision, and occurrence maps. Static comparison found the nullable clock/pending forms, source/clock revision distinction, recognized status enums, and occurrence date projection consistent with the public `installed-events` and `event-clock` source. The date conversion uses the original `Intl.DateTimeFormat('en-CA', {timeZone, year:'numeric', month:'2-digit', day:'2-digit'})` date parts, including years beyond four digits.
- Memory feature metadata is closed, including current candidate `installed-plugin`'s `continuityReady` boolean, accounting label, bounds, and disabled null shape. NP02, however, builds a declared response directly in its fixture rather than invoking the actual installed feature endpoint or asserting actual Panel visibility. The source shape was statically checked; NP02 is not an endpoint integration proof.
- Memory absent/live/deleted status, command-history observed/not-observed forms, metadata, projections, original previews, typed correction/forget/import/delete responses, and response-loss uncertainty behavior align with the reviewed public continuity and MemoryAdapter source. `conflictRefs` uses the same 16-entry bound in the original adapter and candidate parser, though that exact boundary is not covered by fixtures. Arbitrary bounded exchange JSON remains inert data with the same depth/key/array limits as the original Fishball memory core. Embeddings are checked as finite Float32 values, matching the original `Math.fround` normalization.
- Malformed post-commit mutation replies retain the original uncertain command and the public model blocks further mutations while uncertain. The fixture source asserts a malformed committed correction does not resend; this remains unexecuted.

## Fixture status and dependency boundary

NP01–NP05 are all `NOT_RUN`. Their source uses actual source-level event/memory service classes for schedule status and memory/history/preview operations, with finite wire corruption injected after original response generation. NP02 is the noted hand-built feature endpoint case. These authored fixtures do not establish runtime behavior.

The parser closure records the current NI3 runtime drift as excluded. The captured NI3 dependency is `4bb9aea5130e420cdcb30ae05e555e1dbfdb664543eed9069ef3c52fa973e71d`; later runtime `8e1d2a2fed33545e86be76fc6b566eebde1bb9ae0b3a9abcb25593891e3b73fc` is outside this parser review pending root disposition. The prior metadata is retained under `.runtime/ni4-5-normal-wiring-proposal/history/parser-6498-before-live-dependency-observation/`, and the immutable source-before-parser tree under `.runtime/ni4-5-normal-wiring-proposal/history/a5aa-source-before-parser-implementation/`. I did not inspect or alter the live NI3 runtime, shared source, or NI3 review artifacts.

No Node execution, syntax check, import, build, test, database/service/native access, browser, network, listener, or Git operation occurred. The S3 receipt/envelope investigation remains excluded. This review does not close the blocked core-code gap, claim positive native publication, or accept any AC. All 87 AC remain HOLD.
