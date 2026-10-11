# Independent SOURCE amendment: F06 escaped configured secrets

Status: the exact projected source fixes the configured-knownSecrets quote/backslash/newline gap. It is NOT_APPLIED/NOT_RUN/HOLD. Active normal-contracts42e19dd5 remains unchanged and retains the previously reported F06 gap. Root owns any source application/freeze and separate bounded original public preparation tests. This amendment preserves all prior independent reports/designs and cannot close all87 or original blocked finalCODE.

| Reviewed input | SHA256 | Bytes |
| --- | --- | --- |
| docs/evidence/NI6/schema7-core-author-f06-escaped-secret-proposal/required.diff | ba73faf193b60694d0f7fdc84ababd393d5e973a9aab1c2abad781a19fbdcd5d | 4189 |
| docs/evidence/NI6/schema7-core-author-f06-escaped-secret-proposal/normal-contracts-projected.mjs.txt | 98e68b5678070815e1da07c6410000eb7ce4a711f72ebe87f5070bf9fbc97e67 | 31990 |
| .runtime/ni6-schema7-core/src/normal-contracts.mjs | 42e19dd55ba878d79fb3993c47ea4c753895198d447884a3fcd0d8196a7496fe | 31947 |
| .runtime/ni6-schema7-core/src/memory.mjs | 074ec0bb4ce686b9b8fddec1e71e885ca5890f108b876b482f4a1ec086f0f1e9 | 36680 |
| .runtime/ni6-schema7-core/src/context.mjs | f6c8ec033c53ee11617d090a416ad61da9162a3feb7f526088cac89cdef91cb9 | 28297 |
| .runtime/ni6-schema7-core/src/runtime-store.mjs | 59e7b1130ce4a80293881b3aa7bcb7e649402d817922290eee09544b7deafd07 | 330375 |

The full source-only required.diff and projected normal-contracts agree exactly. Both before and projected files have234 lines, and only line30 changes. Other233 lines, imports, closed schema, bounds, finiteRequestCanonical, structuredClone return and preparationDigest are identical. No source was applied or evaluated.

The retained predicate is knownSecrets.some(secret=>encoded.includes(secret)). The projected predicate is knownSecrets.some(secret=>encoded.includes(secret)||v.terms.some(term=>term.includes(secret))). Keeping encoded.includes preserves every prior encoded rejection. Adding raw term.includes covers a configured secret whose interior quotation mark, backslash or actual newline changes when JSON encodes the term. It does not decode, normalize or rewrite the original value.

The added scan runs after the unchanged exact field/descriptor/type, reference, integer, term/vector/ref/limit and whole encoded request-size checks. Terms are already a genuine plain bounded array of well-formed strings with no NUL, so the new predicate adds no input shape or getter allowance. The original actual adapter validates configured secrets through contextText at memory50, copies them at54 and calls preparationRequest(input,this.#secrets) at285 before historical lookup/status and before assembly awaits. Once this exact projection is applied, matching configured raw terms therefore reject before the historical return. No tokenizer/current memory/source assembly/new-only observer occurs on that branch; actual observations remain unrun.

Accepted requests still use the same detached complete value and complete scoped preparation digest. Rejection is SECRET_REJECTED under the existing precedence: malformed/oversized input fails before the secret predicate. The independent store policy remains intact. No context/check/receipt/currentness/digest/reference/capability/native authority or origin is created by the raw scan.

Scope is configured knownSecrets only. The original contextText supplemental automatic pattern checks remain in their existing fresh-assembly location. This one-line proposal neither moves nor proves their broader policy equivalence. The broader R1-O11 obligation remains outside this amendment and NOT_RUN/HOLD; no new escaped configured-secret defect is asserted from it.

| Unchanged domain | Exact requirement |
| --- | --- |
| required6 | taskRef, commandRef, expectedTaskVersion, expectedAuthEpoch, terms, now |
| optional3 | recordRefs, vectors, limit |
| optionalOwnUndefined | Rejected unchanged |
| taskAndCommandRefs | Unchanged lowerhex64 |
| integers | expectedTaskVersion>=1; expectedAuthEpoch/now safe nonnegative, unchanged |
| terms | Genuine plain array0..32; each well-formed string, no NUL, UTF8 bytes<=8192 |
| recordRefs | Optional original plain array<=64 Ref; original order/duplicates preserved |
| vectors | Optional original array<=32; each<=128; finite Float32 representable numbers; unsafe integer rejected unchanged |
| limit | Optional safe integer0..32 |
| wholeEncodedRequestBytes | <=65536, unchanged before secret check |
| detachAndDigest | structuredClone(v) and finiteRequestCanonical/preparationDigest unchanged |
| configuredAdapterSecrets | Original contextText constructor list<=64, each nonempty string length1..4096; list copied to private #secrets |
| additionalRawComparisons | At most64x32=2048 per-term configured-secret comparisons under actual admitted adapter domain; no hard wallclock claim |

| Independent finite obligation | Trigger and oracle | Remaining feasibility |
| --- | --- | --- |
| F06-O01 Interior quotation mark | Distinctive synthetic S with an interior quotation mark. Genuine preparation with terms:[S] and no matching configured secret; recreate genuine adapter with supported knownSecrets:[S]. Compare exact historical replay and fresh command. Projected SOURCE rejects raw S with SECRET_REJECTED before historical lookup in both paths, despite the escaped JSON quote. No tokenizer/queryHost/new-only observer or current memory/source assembly. Existing stored receipt/check/context are preserved. | Root application/executable/public preparation fixture GO pending; no fabricated historical receipt or private lookup counter. NOT_RUN/HOLD. |
| F06-O02 Interior backslash | The same public lifecycle with S containing an actual interior backslash code point, distinct from source spelling or serialized doubled backslash. Raw term.includes(S) recognizes the exact value before replay. It neither decodes encoded JSON nor normalizes/reforges the original request. Fresh/replay policy agree for configured S. | Use actual strings via ordinary supported API only under later GO; no fixture authored. NOT_RUN/HOLD. |
| F06-O03 Actual newline | The same public lifecycle with S containing U+000A. Compare a term with actual LF to the different two-character backslash+n sequence as a nonmatching control when the encoded policy also does not match S. Actual newline raw match rejects before lookup. Distinct raw values stay distinct; no escape-equivalence normalization or digest change. No secret value in diagnostics; only stable error code. | Genuine original preparation required; all control variants must stay within existing well-formed/NUL/byte bounds. NOT_RUN/HOLD. |
| F06-O04 ASCII and unmatched controls | Matching ordinary ASCII S, an unrelated nonmatching valid term, empty admitted terms and empty configured secrets, with actual complete historical request where appropriate. Earlier encoded matching still rejects; new raw match adds only supported configured-secret rejection. Nonmatching admitted exact replay retains its original receipt/digest and zero new observer/origin/commit effects. | Empty knownSecrets cannot prove secret detection. Genuine callbacks measure only their own effects; current private read-call counters remain unavailable. NOT_RUN/HOLD. |
| F06-O05 Encoded-only rejection retained | A valid configured synthetic secret that appears in existing encoded request material but in no raw term; compare a valid request with a structurally invalid or oversized counterpart. Existing encoded.includes(secret) remains an OR branch, so its old rejection is never weakened. Existing structural/numeric/text/size failures still precede the secret check; stable codes and closed shape remain. | Pure parser negatives prove only parser admission; real public replay must use genuine stored preparation, not a caller receipt. NOT_RUN/HOLD. |
| F06-O06 Unchanged joint bounds and closed shape | One variable at a time: terms0/32/33, raw term UTF8 bytes8191/8192/8193, whole encoded request65535/65536/65537 where jointly valid, extra/accessor/symbol/Proxy/optional-undefined, refs64/65, vectors32x128 domain and safe finite Float32 numbers. Same before/projected shape and bound predicates apply before the added raw scan. No wider request/term/vector/ref/numeric domain, bigger cap, default change, truncation or getter-trap-zero promise. | Source confirms equality; executable parser/actual public boundary points need root GO. No giant Cartesian matrix or unreachable joint-positive claim. NOT_RUN/HOLD. |
| F06-O07 Accepted digest and detached request | Supported nonmatching quote/backslash/newline-containing request terms, omitted versus present-empty optionals, ordered/duplicate recordRefs and finite original vector values. For accepted input the exact unchanged finiteRequestCanonical/structuredClone/preparationDigest preserve complete value and request identity. Raw scan does not rewrite, sort, decode, conflate or mutate fields; admitted meaning remains original. | Only parser/digest behavior can be observed in a pure fixture; no authority or authentic graph provenance follows from a digest. NOT_RUN/HOLD. |
| F06-O08 Actual early caller and independent policies | Genuine constructor validates/copies the adapter secret list; protected prepareExecutionContext invokes preparationRequest(input,this.#secrets) at memory285 before captured historical lookup. Distinct independent store policy remains. If projected parser is applied exactly, matching configured raw terms throw before historical/status lookup, awaits, tokenizer, source/current-memory retrieval or new-only observer. Store policy remains independent; original task admission/limits/currentness/receipt flow unchanged. | Static call order is verified. Root separately decides application and bounded public preparation tests. Private read/graph counters have no approved seam; no descriptor replacements or instrumentation. NOT_RUN/HOLD. |

The minimal positive historical setup must come from genuine original public preparation with actual constructor-bound capability and genuine ContextAssembler/MemoryAdapter, initially without the selected configured secret. Recreated actual adapter options introduce that supported synthetic secret; exact replay and fresh-command counterparts then establish the policy comparison. No native history/collector or fabricated receipt is needed. A pure parser input proves only syntax/matching/digest behavior, never authentic graph or authority.

Available trusted original tokenizer/queryHost/new-only observer callbacks count only their own effects. Private captured historical-read/graph counters have no approved seam; they cannot become claimed observations. Source establishes the early call order. Constructor/open/migration effects require their own separately approved lifecycle and accounting. No new instrumentation, descriptor replacement, private negative construction, DB mutation or source fixture was created.

Direct preserved groups A02/P04 and affected obligations R1-O09/R1-O10/R1-O11 retain their original files. R1-O10 configured escaped domain is conditionally source-remediated only in projected98e; the broader R1-O11 policy domain is not closed here. All prior41 groups and24 affected obligations remain NOT_RUN/HOLD. Runtime7 authentic collector/current-live guards, native/cold/migration/host/DOM physical oracles and original public writable-open repair/allocation limits remain held. F03 remains withdrawn and unchanged.

Verification used Python stdlib literal text/JSON/hash only. The six reviewed input pins and ten prior sealed independent artifacts are exact. All eight new obligations are unique and NOT_RUN/HOLD; all eleven product-effect counters are zero. No author regression/assertion/oracle/mixed diff or blocked CODE artifact was read, no source applied, and no Node parser/import/check/build/test, DB/migration/native/provider/service/browser/Git operation occurred. All87 HOLD and original finalCODE blocked unchanged.

| Preserved independent artifact | SHA256 |
| --- | --- |
| docs/evidence/NI6/schema7-independent-design.md | 9a01d8d71fe97def605bff63a4c2da3556bdbff61adf7376ee6741636dc8c5ec |
| docs/evidence/NI6/schema7-independent-design.json | 706113919029e0812b96950d737f26ea1c055927a352f8f14f488b0ee5395611 |
| docs/evidence/NI6/schema7-core-independent-source-review.md | e5e400fc24242b3ce62256fadceeb8442587c7b54f7193ac8e203ae88f86bd83 |
| docs/evidence/NI6/schema7-core-independent-source-review.json | f3c3bf9f9c8f3c6e0636a2d84b58232d7a61b023ee195337f83a3e1c7bfd4bec |
| docs/evidence/NI6/schema7-core-independent-source-review-fixes-r1.md | 41691ac2b12f5cffd7c4ca2b3f4012dd95bae18f4c2c0f62875eb96af9690366 |
| docs/evidence/NI6/schema7-core-independent-source-review-fixes-r1.json | 9000dd96b0e3c674e824b212fc10ef4a8b32117267e8cb4b5e7fb8bd344b412e |
| docs/evidence/NI3/native-runtime-execution-recovery-independent-design.md | 291dcf436aef2ae8df6d0f472d515da2fc9c8db35289f357a442a83f567f47c6 |
| docs/evidence/NI3/native-runtime-execution-recovery-independent-design.json | c78c1fdc27be32aac1d5e99cc727cdc3151b11023fedf5c4e739d20a285577d4 |
| docs/evidence/NI3/native-runtime-execution-recovery-independent-design-amendment-01.md | 62eb8b12db1a866b679238ecd512f6316c3cff2e9789a5e3286b746e8f9ed79d |
| docs/evidence/NI3/native-runtime-execution-recovery-independent-design-amendment-01.json | 3e5d5b4421fdc00575ecae81214cd9edf753e70722d00e0e02979e4b52959e4e |
