# REQ-02 public malformed-request root cause and inert oracle proposal r1

The observed REQ-02 failure is an unsupported blanket error-code expectation. The source supports exact `INVALID_INPUT` for refused rows 0–16 and exact `MEMORY_INVALID` for refused rows 17–18. Both latter rows are unsupported top-level fields and are refused by the original public MemoryAdapter shape gate. This finding supports a two-row-specific fixture correction; it supplies no product change or new accepted request shape.

Status: **SOURCE_ONLY / NOT_PARSED / NOT_IMPORTED / NOT_RUN / HOLD**. The old r3 raw result remains fourteen PASS, one FAIL, eight STOPPED. The inferred first failing row is 17 (`generationRef`), because raw TAP reports only the common loop line and no row index. No individual refused-row runtime result is invented from that inference. All87 accepted0/HOLD and the permanently blocked final CODE gate remain unchanged.

## Contract and source diagnosis

- [Current MemoryAdapter](../../../.runtime/ni6-schema7-core/src/memory.mjs) lines 281–285 calls its own `exact` at line 282 and its own command-ref check at line 283 before the capability-bound `preparationRequest`. Its shape helper at lines 22–25 rejects unsupported keys with `MEMORY_INVALID`. The exception is thrown directly, before any source binding, historical lookup, status read, assembly or await.
- [Original public MemoryAdapter](../../../.runtime/ni6-schema7-core/original/memory.mjs) lines 20–23 has the same `MEMORY_INVALID` shape helper. Its original `prepareExecutionContext` lines 272–274 has the same allowed/required keys and excludes both `generationRef` and `extra`. The ordinary current [src/memory.mjs](../../../src/memory.mjs) lines 272–274 retains that contract. The new capability path did not introduce this refusal category.
- [Normal request parser](../../../.runtime/ni6-schema7-core/src/normal-contracts.mjs) line 30 supplies the stricter normal preparation domains after the outer gate. Its dense array helper at line 12, text helper at line 11, supplied-undefined test, integer bounds and vector numeric tests all throw `INVALID_INPUT`. This call is outside the MemoryAdapter `guarded` wrapper, so its stable code is preserved directly. Its complete finite request encoding is capped at 65536 UTF8 bytes, with `INPUT_TOO_LARGE` for overflow, before detachment and historical lookup.
- [PrepareRequest declaration](../../../.runtime/ni6-schema7-core/contracts/schema7-contracts.d.ts.txt) lines 63–73 gives the six required and three optional fields, 32 terms of at most 8192 bytes, 64 recordRefs preserving order/duplicates, 32 vectors of at most 128 components and limit 0–32. [Literal refinements](../../../.runtime/ni6-schema7-core/contracts/literal-refinements.md) line 25 retains finite/F32 values, safe integer components, supplied-undefined refusal, 65536-byte whole request and `structuredClone` detachment. Neither contract specifies one universal stable code for every malformed public adapter shape.
- [Independent design](schema7-independent-design.md) A02 at line 101 requires invalid shapes to refuse while preserving valid original finite request meaning. It does not require `INVALID_INPUT` to replace the original adapter's `MEMORY_INVALID` for unsupported public fields. [ContextAssembler](../../../.runtime/ni6-schema7-core/src/context.mjs) line 147 also excludes generationRef from its preparation-specific input. Its general assembler's generationRef allowance at lines 150–152 does not admit that field to `prepareExecutionContext`.

The root's existing [raw TAP](schema7-r3-independent-public-continuation-execution/command-02.stdout.txt) records actual `MEMORY_INVALID` versus expected `INVALID_INPUT` at `leaves/req-02.mjs:28`. The fixture's [request helper](../../../.runtime/ni6-preparation-independent-continuation-r3/support.mjs) lines 162–168 obtains current task/auth CAS through a genuine public task read and then preserves each supplied patch, including supplied undefined. The parent-owned r3 execution and its all204 preservation result are historical evidence, not a run by this lane.

## Finite nineteen-row expected-code oracle

Indexes and values below are the unchanged refused array at [r3 REQ-02](../../../.runtime/ni6-preparation-independent-continuation-r3/leaves/req-02.mjs) lines 16–25. For rows 0–16 the route is `MemoryAdapter.prepareExecutionContext` line 282 (outer gate passes) → line 285 → `preparationRequest` line 30. Rows 17–18 stop at the outer exact gate. Each row has one required code, never a set of acceptable alternatives.

| Index | Unchanged malformed patch | First refusing predicate | Exact expected code |
| ---: | --- | --- | --- |
| 0 | terms length 33 | normal array helper line 12, max 32 | INVALID_INPUT |
| 1 | one term of 8193 ASCII bytes | normal text helper line 11, max 8192 | INVALID_INPUT |
| 2 | `terms: ['a\0b']` | normal text helper line 11, NUL | INVALID_INPUT |
| 3 | `terms: ['\ud800']` | normal text helper line 11, not well formed | INVALID_INPUT |
| 4 | `terms: new Array(1)` | normal array helper line 12, missing own index 0 | INVALID_INPUT |
| 5 | vectors length 33 | normal array helper line 12, max 32 | INVALID_INPUT |
| 6 | one vector length 129 | normal array helper line 12, max 128 | INVALID_INPUT |
| 7 | `vectors: [[NaN]]` | parser line 30, component not finite | INVALID_INPUT |
| 8 | `vectors: [[Infinity]]` | parser line 30, component not finite | INVALID_INPUT |
| 9 | `vectors: [[1e39]]` | parser line 30, Math.fround result not finite | INVALID_INPUT |
| 10 | `vectors: [[Number.MAX_SAFE_INTEGER + 1]]` | parser line 30, integer is unsafe | INVALID_INPUT |
| 11 | `limit: -1` | parser line 30, integer below 0 | INVALID_INPUT |
| 12 | `limit: 33` | parser line 30, integer above 32 | INVALID_INPUT |
| 13 | supplied `limit: undefined` | parser line 30, own optional undefined | INVALID_INPUT |
| 14 | supplied `recordRefs: undefined` | parser line 30, own optional undefined | INVALID_INPUT |
| 15 | supplied `vectors: undefined` | parser line 30, own optional undefined | INVALID_INPUT |
| 16 | recordRefs length 65 | normal array helper line 12, max 64 | INVALID_INPUT |
| 17 | `generationRef: state.seed.goal.recordRef` | memory exact helper lines 23–25, unsupported key | MEMORY_INVALID |
| 18 | `extra: true` | memory exact helper lines 23–25, unsupported key | MEMORY_INVALID |

All nineteen routes refuse before normal-parser detachment completes, source binding/lookup, retrieve, assembler, tokenizer or new-commit callback. The genuine request helper's task read remains outside that refusal call. The source supports zero tokenizer and new-callback deltas for every malformed row. The proposed body retains the original per-row `expectNoCallbacks(actual.count, stable)` and final complete public snapshot deep equality byte for byte. `expectNoCallbacks` at support lines 47–50 compares both tokenizerCalls and newCommitCallbacks exactly; `expectCode` at lines 37–39 rejects a different code or a successful return. The snapshot assertion establishes the unchanged public snapshot, not whole database/cipher byte identity or a private read-count claim.

## Exact separate source proposal

Only NEW inert files exist under `.runtime/ni6-request-validation-proposal-r1/`:

- [Before literal](../../../.runtime/ni6-request-validation-proposal-r1/req-02.before.mjs.txt): 2177 bytes, SHA256 `2b7acbb1264a47a1bc4f9983207d66b961bfbf4b751fed462cdc7c4aaed9b145`. A byte comparison confirms it is identical to the untouched r3 leaf.
- [After literal](../../../.runtime/ni6-request-validation-proposal-r1/req-02.after.mjs.txt): 3181 bytes, SHA256 `ad01fe3fe3c9e4f4a4a20cfdffe74af7437f92969bf69213e96147d5fb4218ac`.
- [Exact unified diff](../../../.runtime/ni6-request-validation-proposal-r1/required-req02.diff): adds the frozen nineteen-entry `refusedCodes` vector and exact length assertion, then changes only the expected-code argument of the existing refusal call. Entries 0–16 remain INVALID_INPUT; only entries 17–18 are MEMORY_INVALID. This diff is a proposal between inert text files and has not been applied to any capsule.

The ten accepted patches, all nineteen malformed patches, order, command labels, genuine methods, awaited loop, assertion helper, per-row stable counter check, entire public snapshot equality and returned observations remain unchanged. No product source, SAFE_CODES set, exception mapping, limit, source/auth/CAS/secret admission, detachment rule or refusal domain changes. There is no blanket two-code allowlist and no swallowed exception. The `.mjs.txt` bodies are not dispatcher members and have never been parsed or imported.

## Proposed continuation scope and limits

After root adoption into a separate NEW same-depth capsule, the proposed exact order is **REQ-02, REQ-03, REQ-04, SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06**. Exclude the fourteen already passed r3 leaves PREP-01–13 and REQ-01, plus all three already passed historical migrations MIG-01–03. The eight STOPPED leaves keep their previously reviewed exact source bytes and existing oracles. This lane does not inspect or alter their security internals.

The reviewed r3 source bounds at [independent source review](public-preparation-continuation-r3-independent-source-review.md) lines 119–127 yield this nine-leaf subset:

| Leaf | Genuine RuntimeStore constructor / owned close upper bounds | Direct prepare-call upper bound | Expected new callbacks on complete intended outcome |
| --- | ---: | ---: | ---: |
| REQ-02 | 2 / 2 | 29 | 10 |
| REQ-03 | 2 / 2 | 5 | 2 |
| REQ-04 | 2 / 2 | 2 | 1 |
| SEC-01 | 3 / 3 | 7 | 2 |
| SEC-02 | 3 / 3 | 7 | 2 |
| SEC-03 | 3 / 3 | 9 | 3 |
| SEC-04 | 3 / 3 | 7 | 2 |
| SEC-05 | 2 / 2 | 7 | 1 |
| SEC-06 | 2 / 2 | 5 | 0 |
| Total | **22 / 22** | **78** | **23** |

These are direct source bounds and expected outcomes, not executed observations or complete transitive/private operation counts. The fresh scratch-directory and ledger-path upper bounds are nine, parallel leaves one, parallel preparations one. REQ-02 still makes ten accepted calls and nineteen refused calls; refused tokenizer/callback deltas must each stay exactly zero. REQ-04 retains only its already reviewed caller-input mutation during the genuine tokenizer. Source aggregate tokenizer counts for successful leaves are not supplied by the reviewed table and are not fabricated here.

The whole request ceiling remains exactly 65536 finite-canonical UTF8 bytes, independently of term/vector/reference face limits. Preserve unchanged REQ-03's genuine 65535/65536 accepted-and-replayed boundaries and 65537 `INPUT_TOO_LARGE` refusal with zero tokenizer/callback delta and full public snapshot equality. Preserve unchanged REQ-04's original submitted request/delivery and replay/detachment assertions. Independent maxima never promise a Cartesian maximum request will fit.

Root must compose and freeze the separate NEW nine-member dispatcher, manifest, root wrapper and exact bounded plan. Keep the original canonical pinned Node `/opt/homebrew/Cellar/node@22/22.22.2_1/bin/node`, 84640 bytes, SHA256 `463b47d6e984e4f84cd2421dabf5081414e40ab9d967e828b2db7858e707f6de`. Retain complete canonical path/size/hash checks for every active input, exact selected and physical leaf inventory, original genuine core/helper imports and a manifest digest check before any candidate/helper/core import. Historical r3/r2/original source and all204 r3 execution inputs remain immutable evidence, with no repinning or fallback to an old dispatcher.

Obtain a fresh independent affected SOURCE review and a separate root bounded GO before any parse/import or execution. The proposed future commands remain the pinned Node syntax check and one sequential Node test wrapper invocation, each capped at 60 seconds, with one awaited leaf at a time, once-only selected calls, first unexpected failure stopping all later calls, no retry and retained raw/scratch/backup evidence. The new scope may perform its ordinary genuine fresh synthetic constructor/open/migration/recovery effects; migration *test leaves* are excluded. Neither this proposal nor a review grants execution authority.

## Lane closure

This lane used shell/source-text reads, byte comparisons/hashes and NEW-file authoring only. Actual JS parses/imports/test launches, product constructors/DB/migrations/preparations/tokenizers/callbacks, native/model/provider/tool/network/profile/browser/Git operations are all zero. No prior shared source, frozen capsule, failure/raw file or pinned input was written. The cited source/raw input hashes remain unchanged at closure; the parent retains ownership of the complete all204 preservation check.

Only ordinary public malformed-request validation and declared continuation bounds were inspected. The blocked final CODE investigation was not reopened or delegated through this lane. Root retains adoption, review routing, Git and execution ownership. Every proposed corrected outcome remains NOT_RUN/HOLD.
