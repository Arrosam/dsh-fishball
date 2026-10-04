# W2 independent preparatory test review

Verdict: **prep-only PASS** for the frozen candidate contracts, schema/vector structure and test design below. **W1/M1 remains HOLD** for its recorded actual Web browser gate. W2 implementation, all 40 full source AC, native behavior, UI/provider acceptance, release and main convergence remain **not accepted**. No unresolved contradictory safety requirement was found in this reviewed prep unit; pending product choices and unexecuted runtime tests remain explicit.

Reviewer `/root/istqb_review`, delegated by root, independent of root and all four lane authors; requested Sol6.1/max. Owned only [test-design.md](test-design.md), this report and the 12 independent mock fixture files. Root alone handles Git. No Git command/mutation, W1 test rerun, Foundation mutation, DSH service/profile/model/tool/browser/credential/provider action, install or network request was performed by this reviewer during W2 preparation. The owner's separate manual W1 host handoff supplies no W2 evidence.

## Exact reviewed unit

Root froze the artifacts at commit `51f36a5997d96be71d54c57e0644ea29a3bb21e8`. Independently recomputed the following Git-format object digests using Node filesystem/crypto built-ins, without invoking Git; all five supplied digests match the actual bytes. The commit identity is root's handoff; these comparisons establish the reviewed artifact contents.

| Artifact | Independently matched object digest |
| --- | --- |
| `prep/w2` tree | `cf520f5153ad9fbae7eaee2728b3c658436b32cb` |
| `prep/w2/schemas` tree | `fb4174057070bce9ae791cbbe07087233c08f3d1` |
| `prep/w2/fixtures` tree | `3931537af01f3f694169837f64a73daf44e865b4` |
| `prep/w2/verify.mjs` blob | `e631590dd7d3e61b375c1488574f426837cdc4f1` |
| `docs/prep/W2/test-design.md` blob | `d503ad24b4b76ff1148d3960179e0aba5a5cb366` |

Read `AGENTS.md`, W2 README/shared/conflicts, all five lane documents and six schemas, all author/independent vectors, verifier/provenance, pending decisions and the 40 exact retained source AC in BUB002/004/005/008/011/012/013/014. The design's individual source-oracle rows were mechanically compared with those40 IDs:40 rows, no missing/duplicate ID. Every row specifies a later observable oracle, partitions and evidence class; all runtime/native/UI cases are explicitly **not run**.

Actual local validator process: Node `v22.22.2`, `/opt/homebrew/Cellar/node@22/22.22.2_1/bin/node`, `darwin/arm64`. Root's loader successfully verifies the existing Ajv8.20.0 manifest/entry hashes, tracked/installed lock equality and provenance before importing the local draft2020-12 validator. No dependency acquisition or lifecycle script runs. Strict schema/types/numbers remain enabled; `strictRequired:false` addresses enclosing-object conditional lint only, while actual required-field validation remains enabled. No coercion, defaults or removal of unknown fields is enabled.

## Final commands and expected/actual observations

All commands ran in the repository on the matched frozen artifact unit. The additional probes use `node --input-type=module` heredocs, exported `loadPinnedAjv()`/`evaluateVectors()` and memory clones; no artifact/dependency was changed. The 25 verifier fault probes comprise nine metadata/expectation, ten provenance and six schema checks; all 25 match their expected results. The precise mutations and expected results are recorded below.

| Command / check | Expected | Actual |
| --- | --- | --- |
| `node prep/w2/verify.mjs` | Exit0; all candidate expectations match; explicit structural scope, W1 HOLD, W2 not assessed. | Exit0, `PASS`, 6 compiled schemas, 17 fixture files, 239 vectors:98 positive/141 negative, 0 failures; 85 positive top-level unknown-field rejections, 307 mock evidence objects. `verificationScope=schema_and_fixture_structure_only`, `w1Acceptance=HOLD`, `w2TicketAcceptance=NOT_ASSESSED`, native/inference calls0. |
| Independent metadata/expectation faults, `node --input-type=module` | All9 reject or return the specified failed expectation. |9/9 match exact codes; assertions pass, exit0. |
| Independent local provenance faults, `node --input-type=module` | All10 fail before accepting a changed validator/pin. |10/10 match exact codes; assertions pass, exit0. Read bytes were substituted in process memory and restored; filesystem writes0. |
| Independent schema/verifier faults, `node --input-type=module` | All6 reject malformed/unreviewed schemas or detect the open envelope. |6/6 match exact codes; assertions pass, exit0; no remote reference was fetched. |
| Independent closed-object sweep, `node --input-type=module` | In every object reachable from a positive vector, adding an unknown field invalidates that instance. |969/969 mutations rejected across 98 positive vectors, 0 unexpected acceptances; assertions pass, exit0. Includes 85 root objects plus884 nested objects, rather than969 additional roots. |
| Independent optional estimated-cost branch probes, `node --input-type=module` |15 specified shape/range outcomes; no actual cost before effect or hard-bill-cap claim. |15/15 match:4 valid/11 invalid; assertions pass, exit0. Entirely synthetic mock evidence; no spending threshold or price selected. |
| Individual source-oracle ID check, `node --input-type=module` | Exactly 5 source rows for each of 8 retained tickets. |40/40 IDs match, 0 missing/duplicate; all R/N/U cases marked NOT_RUN. |

The verifier's source metadata names39 AC; BUB014-04 has no JSON visual vector. Its required resize/long-Chinese/keyboard/focus/empty/loading/error checks are explicitly mapped in the 40-row design and remain actual-UI work. The39 metadata labels are traceability references, not39 fulfilled source AC.

### Independent vectors retained in the frozen unit

All files are under [fixtures/independent](../../../prep/w2/fixtures/independent/), use `fixtureKind:mock` and contain only `sourceKind:mock` evidence. Expected structural positives that would be denied semantically are intentional tests of the schema's limits; their reasons require later runtime denial rather than claiming permission.

| Independent file | Positive / negative | Added partitions or boundary/state oracle |
| --- | --- | --- |
| `common-ref.json` |2 /10 | Exact64 lowercase hex; 63/65, non-hex, uppercase, whitespace, Unicode and non-string. |
| `common-version.json` |3 /6 |1 and safe integer ceiling; 0/negative/fraction/string/null/ceiling+1 reject. |
| `common-epoch.json` |4 /5 |0 valid; finite integer/ceiling/type boundaries. |
| `common-time.json` |4 /5 |0 valid; finite integer/ceiling/type boundaries, no freshness/causality claim. |
| `common-scope.json` |2 /13 | All three ref positions independently short/long/missing/null; serialized trust flags reject. Equal refs do not authenticate. |
| `common-binding.json` |2 /10 | Complete finite task/auth CAS and command ref; nested/outer authority fields reject. |
| `common-evidence.json` |2 /9 | Ref/digest/time bounds, required mock source field, no approval flag. |
| `coordinator-boundaries.json` |6 /6 | Materials15/16/17, conflicts8/9, summary provenance, above-limit ready rejection, unanswered clarification, foreign-owner/stale-ledger shape counterexamples. |
| `worker-boundaries.json` |3 /9 | Three separate release facts, terminal-with-unknown-effect held, unknown reconciliation, denied admission, generation65, closed environment, expired/verified handoff. |
| `message-boundaries.json` |7 /6 | Declared bytes0/65535/65536/65537; accepted/sent/consumption distinctions, unknown reservation, bounded route, immutable grant/receiver/route semantic counterexamples. |
| `resource-boundaries.json` |3 /10 | Partial terminal/outcome retained while held; all three release facts; unresolved axes, total/group attempt bounds, expiry declaration counterexample, create-session intent, unknown cost and no free reviewer. |
| `result-boundaries.json` |6 /6 | Historical delivered versus revoked/stale current access; receipt-time proof; version/digest/operator-ref semantic counterexamples; terminal controls, partial cancel, verification evidence and no token field. |
| **Independent total** |**44 /95** |**139** vectors; authors retain their 100 vectors, making 239 combined. |

Common primitive cases target explicit `$defs` fragments. A bare common schema root is an unconstrained definition library and is deliberately refused as a meaningful fixture root.

### Nine metadata/expectation probes

Each mutation starts from a memory clone of the five author fixture documents. The actual code equals the expected code below. A failed expectation remains a verifier FAIL, not a passing invalid vector.

| Mutation | Expected = actual |
| --- | --- |
| Flip CC-01 valid expectation to false | `VECTOR_EXPECTATION_MISMATCH` |
| Flip CC-05 invalid expectation to true | `VECTOR_EXPECTATION_MISMATCH` |
| Unknown private schema ID | `FIXTURE_SCHEMA_INVALID` |
| Bare common schema ID | `FIXTURE_SCHEMA_INVALID` |
| Repeat a string vector ID within its file | `VECTOR_ID_INVALID` |
| Supply an array ID `['coercion']` | `VECTOR_ID_INVALID` |
| Remove `sourceAC` | `VECTOR_SOURCE_AC_INVALID` |
| Add `approved` vector metadata | `VECTOR_FIELDS_INVALID` |
| Insert a false nested `native_observation` source label | `FIXTURE_NONMOCK_PROVENANCE` |

The deliberately false source label is malformed in-memory test input, never saved or counted as native/mock evidence.

### Ten provenance probes

Temporarily substitute bytes returned by `node:fs.readFileSync` only for the exact local provenance/lock/manifest paths, synchronize built-in ESM exports, call `loadPinnedAjv()`, then restore reads in `finally`. No on-disk modification, new dependency import path, installed-DSH change or network call occurs. Every actual rejection equals its expected code.

| Mutation | Expected = actual |
| --- | --- |
| Provenance version becomes 8.19.0 | `VALIDATOR_PIN_INVALID` |
| Provenance entry names another package | `VALIDATOR_PIN_INVALID` |
| Wrong tracked-lock hash | `VALIDATOR_LOCK_MISMATCH` |
| Extra installed-lock byte | `VALIDATOR_LOCK_MISMATCH` |
| Wrong package-manifest hash | `VALIDATOR_SOURCE_MISMATCH` |
| Wrong entry hash | `VALIDATOR_SOURCE_MISMATCH` |
| Wrong lock integrity | `VALIDATOR_PROVENANCE_MISMATCH` |
| Wrong resolved tarball URL | `VALIDATOR_PROVENANCE_MISMATCH` |
| Changed manifest version with recomputed manifest hash | `VALIDATOR_VERSION_MISMATCH` |
| Changed host lock pin with both locks/provenance hash updated in memory | `HOST_LOCK_PIN_MISMATCH` |

### Six schema/verifier probes

Each mutation starts from a memory clone of the six schemas; the original fixture documents remain unchanged. All actual results match.

| Mutation | Expected = actual |
| --- | --- |
| Add an HTTPS schema reference | `SCHEMA_EXTERNAL_REFERENCE` |
| Add unsupported `format` | `SCHEMA_UNSUPPORTED_EXTENSION` |
| Repeat a schema ID | `SCHEMA_ID_INVALID` |
| Remove one schema | `SCHEMA_SET_INCOMPLETE` |
| Make `required` a string | `SCHEMA_META_INVALID` |
| Open coordinator root `additionalProperties` | Verifier FAIL with `OPEN_TOP_LEVEL_ENVELOPE` for all 14 affected positive author vectors. |

### Fifteen optional estimated-cost probes

The frozen file vectors keep D10 pending/unpriced. Additional memory instances exercise the unrepresented proposed estimated-policy branch with mock source evidence. Policy limit0/maximum and admission estimate0/maximum are the 4 valid shapes; negative/unsafe limit, lowercase currency, hardBillCap=true, continue-on-unknown, missing price evidence, negative estimate, unsafe error bound, premature actual charge, extra approval field and missing error bound are the 11 invalid shapes. All15 outcomes match. These are currency/number/evidence shape checks; they do not establish trusted policy authority, price correctness, total aggregation, affordability or selected D10 defaults.

## Findings, remediation and cross-lane coherence

1. **Combined strict-type compilation failure — resolved.** The initial combined verifier failed on `scoped-messages#/allOf/14/if/properties/sourceIdentity` because nested `properties` lacked an object type. Reported to the author/root; authors supplied explicit object/array conditional annotations. Final strict compilation and all 239 retained expectations pass. No verifier type relaxation or removed negative was used.
2. **Historical delivery/current access contradiction — resolved.** The initial delivered shape forced current granted/verified access, losing the true historical delivered fact after later revocation. The author split dated `receiptAccess` from current `permissionState/openability/accessObservedAt`; RC20 and IO-delivered-then-access-revoked/stale are positive, while revoked receipt-time access is negative. A later runtime/UI test must authenticate receipt bytes/version and display both axes; no recipient access was tested here.
3. **Common-root false assurance — addressed.** Primitive fixtures use constrained fragments, and the independent bare-root probe fails. The common definition library itself makes no root-envelope guarantee.
4. **Other cross-lane resolutions independently checked.** One complete immutable actionDigest; create-session receipt attaches without rehashing approved intent; raw/ref adapter boundary prevents double hashing; intake uniqueness excludes task association while message/delivery identity retains scoped immutable intent; candidate phases do not invent native accepted/ready proof; unknown/partial outcomes remain held; release needs native terminal, reconciled outcome and atomic ledger proof; exact action-target revoke and pause/cancel blocked dispatch remain explicit. ID coercion and forged provenance guards fail closed in the final verifier. Root/other independent reviewer findings retain their own authorship in [conflicts](conflicts.md) and [contract review](contract-review.md).

Schema-valid foreign scope, stale ledger, mismatched grant/content/incarnation, exceeded chosen hop limit, expired consent, mismatched review/delivery version or arbitrary operatorContextRef are intentionally possible shapes. Their positive vectors document mandatory future trusted equality/current-state/permission rejection; they supply no behavioral PASS. Digests must later be computed over canonical actual bytes, not trusted because a string is64 hex characters.

## Unexecuted obligations and remaining gates

[Test design](test-design.md) preserves every source AC and the risk/decision/state/boundary plan. All actual R/N/U cases remain **NOT_RUN**, including:

- Independent OS-process duplicate/CAS/final-slot contenders, revoke/cancel ordering in both directions, abrupt intent/create/effect/receipt/report crash cuts, restart/reconnect/history replay, reused session generations and unknown-with-unavailable-query recovery.
- Trusted caller/operator/owner/workspace/task isolation at actual input/assembly/forward/artifact/UI boundaries; secrets/canaries in resolved bodies, assembled model input, logs and durable state; exact version/digest/recipient grant equality under the claim lock; expiry at minus-one/exact/plus-one with lock wait.
- Actual pinned-native create/ready/resume/observable artifact/cancel/termination, environment/tool permission path, model/reasoning catalog mapping, fresh tool/page handoff verification and stopped-versus-settled release evidence.
- Actual model tokenizer N−1/N/N+1 with protected constraints, selected queue/active-unit/attempt/time/usage/cost/storage/history limits, burst/blocked-worker/log-growth/IO-failure load and main/control latency. Candidate ceilings and mock numeric values select no production thresholds.
- Same-byte independent artifact review and recipient/channel opening, partial deliveries/unknown send reconciliation, quiet/coalesced progress, actual list/detail/control consistency and visual resize/Chinese/keyboard/focus/empty/loading/error checks.

D2 provider/account, D3/D10 measured performance/budgets, D4 retention, D5/D6 scopes/pairing/handoff, D8/D9 context/notification policies, D11 artifacts/report depth and D12 supported native UI entry remain decisions before the relevant implementation. D1's fixed pin does not prove each worker/tool/model/UI capability; D13 runtime review/repair remains separate from mandatory development reviews. Cancelled dsh-std adoption/conformance is **not an active requirement, dependency or gate**. No fishball source or data was used.

The recorded W1 browser `ERR_BLOCKED_BY_CLIENT` condition remains an actual acceptance HOLD, without a bypass or automated retry in this lane. Mock prep PASS does not accept W1, authorize W2 runtime implementation, narrow the 40 source AC, select an account/price/default, or imply a release/squash. This report completes the independent preparatory test-design review only.
