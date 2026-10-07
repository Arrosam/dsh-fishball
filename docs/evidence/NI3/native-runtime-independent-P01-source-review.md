# NI3 P01 optional public fields: independent source review

Reviewer: `/root/ni3_fixture_source_safety_review`. Review date: 2026-10-07 06:10:50 UTC. Delegated audit configuration: gpt-6.1-sol, maximum reasoning. **Disposition: no blocking literal source finding; unapplied and NOT_RUN by this reviewer.** The direct-helper plugin-count qualification below must accompany any new effects freeze. All 87 AC remain HOLD. The protected final CODE receipt/envelope/binding investigation, cipher/schema999/SQL experiment and associated acceptance gap remain blocked and were not accessed, rerouted or retried.

This is independent CODE SOURCE review of an author-proposed fixture correction. The entry's authored assertions are the review subject. No independent test design, test fixture or assertion was authored, and this report does not supply the separate test-review gate. Previous NL01/ER08 review files and all existing source/results remain unchanged.

## Exact inputs

SHA-256 pins and byte counts below were independently read from current files. Paths are relative to `dsh-fishball`.

| Input | SHA-256 | Bytes |
| --- | --- | ---: |
| `proposals/P01-optional-public-fields/native-entry-public-fields.patch` under `.runtime/ni3-native-runtime-independent` | `a911967b87c627b7560926f5a3c646cdf781c25a62d86bd3d5630b9bbab5c1c5` | 4178 |
| Same proposal's `source-proposal.json` | `127b21f5a19d3058450fe04543a47dcc10eb2872794f300e7ad344f0e003ea87` | 2135 |
| Same proposal's `import-effects-inventory.json` | `13a6b6c250561625174463f79512872be75d79a606578f5531687117b0a27f4a` | 5121 |
| Same proposal's `projected-source-delta.json` | `86a36941e5ee5db902f8ddc70a8ba95c80793b1349e68dd032cbd32b65227945` | 24701 |
| `.runtime/ni3-native-runtime-independent/test/native-runtime-independent.test.mjs` | `86160441437d9d708621ca5ab19bd582fc25c6329f08193e4db875d986132bec` | 20649 |
| `.runtime/ni3-native-runtime-independent/test/native-host-fixture.mjs` | `1524af956132b80ef8eefe6595e8d1336de8893fbebdfd3ae809d1c2b49e0f92` | 26778 |
| `docs/evidence/NI3/native-runtime-independent-P01-public-field-rootcause.md` | `433a74f52d25d68c79a4ba1b83eff8155b47c25ef2fa7008484e00b7457f17dd` | 4694 |
| Companion root-cause JSON | `ee732dbdec1a59b331acf5a6bf3775702904aea344c90b7575a62249c6abbbf4` | 11797 |

The metadata's `projectedAfterEntry` names the same current target path and declares projected hash `b5ab53385ac4e3bc1020f999312000a530e6cdda30a580b70d3e8d97c7f3aa56`, 21894 bytes. No separate projected JavaScript copy is present in the named proposal directory. The projected source was reviewed as the exact two-hunk literal over current entry `861604…`; no source copy was materialized, no patch/dry-run was performed, and that projected-byte hash was not independently recomputed. Root must verify any later applied bytes against its fresh exact-input freeze.

## Public representation and strict claim handling

The source mechanism matches the diagnosed representation error. Original `planAction` metadata initializes planned task/auth versions and null outcome/terminal/release evidence fields without `claimRef` (runtime-store lines 604–606). Its receipt contains only actionRef/actionDigest/taskVersion/authEpoch (lines 608–610). The original action decoder parses stored metadata and returns it without injecting a claim field (lines 575–581); the public snapshot exposes actionRef/actionDigest/spec/state/attempts and spreads that metadata (lines 1295–1299). Therefore an unclaimed planned action has no own `claimRef`. The old fixture filter `a.claimRef !== null` includes its absent `undefined` value, explaining the extra counted action. The old strict-null check has the same mismatch.

The literal changes the shared filter to `Object.hasOwn(a, 'claimRef')`, then asserts `isRef(action.claimRef)` for every included action. The unchanged helper predicate requires a primitive lowercase 64-hex string (helper line 21). An absent own property alone is excluded; an own `undefined`, `null`, malformed string, uppercase/non-64-hex string or non-string reaches the assertion and fails according to the source. These are source-derived conclusions, not executed partition tests. The original expected count, unique claim IDs and unique executor generations remain exact. The correction neither normalizes invalid values nor silently filters them away.

The shared helper is used by L01/L02/P01/S01/S02/D02/D03/T01. Its expected suite invocation count rises from eight to nine because P01 adds one pure check of the already-read before snapshot. S01/S02 share the same source call through `abortedReview`, so each contributes an invocation. The literal does not change their authored operations or other entry assertions. Earlier L01/L02 results remain evidence for old entry `861604…`, not the corrected helper. Any future affected validation needs its own exact source attribution.

## Exact planned generation and public lifecycle observation

The P01 additions resolve the planned action from `before.actions` by the returned plan actionRef, assert existence and matching digest, require executor mode `create`, and validate both generation/session references. They require that generation and session differ from the producer. Original installed `planAuditAction` constructs this fresh generation in the normalized public action spec, derives `sessionRef` with `reference('df-' + generationRef)`, checks that the public planned action matches its spec/digest and returns the unchanged plan receipt (installed-audit lines 344–357). The receipt is not a generation alias.

The new `ctxAbsent` uses `planned.spec.executor.generationRef`, validates it, verifies the exact session-reference digest and checks both original registries at the exact `df-${generation}` ID. `reference` is plain string SHA-256 through original `hash` (runtime-security lines 5, 8), matching the helper's `sha` string hash (helper line 20) and documented convention. `AgentRegistry.get` and `SessionStore.get` are direct map lookups returning the exact live agent/session or undefined (original agent lines 594–595, session lines 1861–1862). The boolean conjunction performs at most two gets and refuses if either registry contains the planned ID. It no longer infers a planned generation from an empty whole registry or an optional receipt field. It constructs/disposes no registry object, invokes no service lifecycle and supplies no native identity.

## Revoke, refusal and conservation

The original revoke call, exact action/digest/CAS payload and dispatch attempt are retained. The new capture asserts the original revoke receipt targets the planned action and returns `reservationHeld === false`. Original public revoke returns that target and `!!a.claim_id` (runtime-store lines 639–650), so this is an available action-specific hold observation for the still-unclaimed reviewer, not an invented resource counter.

The literal retains `refused.ok === false` and the exact existing permitted error family: GRANT_REQUIRED, GRANT_EXPIRED, HOST_PERMISSION_DENIED, PERMISSION_DENIED, AUDIT_ALREADY_SUBMITTED, AUDIT_STALE, AUDIT_SOURCE_STALE and WORKER_SOURCE_UNAVAILABLE. It requires absent own reviewer `claimRef` before and after. The single before producer claim must equal `producer.worker.claimRef`; after refusal, claim IDs must match that original before list. Full public worker mappings replace the old length-only comparison, artifacts remain deeply equal, and the planned action digest/spec must remain unchanged. The original `completeStreams(f, 1)` remains, including exact descriptor/text counts and terminal chunk/tool checks. No refusal guard or complete-stream assertion is weakened.

These checks strengthen conservation of the available public facts. They do not demonstrate private allocation/reservation arrays or general numeric resource counters, which are absent from the public observation under review. Historical producer claim count is not an active-reservation counter. The action-specific false hold receipt and unchanged visible worker mappings do not establish all private budget counters are zero or conserved. That numeric observability gap remains HOLD; no SQL query, private map or invented numeric-counter proof is introduced by the literal.

## Effects and bounds

The exact patch adds no imports and changes only the shared claim filter/assertion plus P01 public observations. The five literal imports remain the same. Helpers, host packages, actual provider/tool/authority/currentness chain, abort barriers, timeout and first-failure stop behavior remain source-identical by scope; no denied listener retry is introduced. Current helper `1524…` still constructs the original WebServer directly. P01 leaves that helper unchanged, so the previous EPERM listener operation remains stopped.

P01's unchanged RPC count can be decomposed from current helper source: initialize 8, producer plan 6, producer create 2, producer completion 8, audit configure 2, audit prepare/plan/preview/grant 8, and P01's before/revoke/refused-dispatch/after sequence 6 = **40 RPC**. The additional before-claims check, receipt assertions, comparisons and registry/digest checks are local observations of existing values. They add zero RPC, CAS reads, setup/profile operations, claims, reviewer sessions, streams, native mutations, provider/tool effects, directory/store operations, timers, sockets or network effects to the case. The public transcript read sequence is unchanged.

The source budget remains one producer claim/session, one descriptor, one text effect and one transcript read sequence; no reviewer dispatch succeeds. The provided full-suite budget remains 293 native RPC + 57 wire calls = 350, twelve claim/session pairs, eleven descriptors and ten text effects because this literal's operation delta is zero. Those aggregate absolute counts were not recomputed across all leaves by this review. Any later execution still creates separately authorized fresh synthetic roots; this report creates none and authorizes no command.

**P01-F01 — LOW, carried effects-count qualification:** inventory `P01SourceBudgets.ctxPluginCalls: 10` means the helper's ten direct installation statements. It is not an inclusive transitive lifecycle call total: the genuine OperatorPeer owns an internally created Cordis scope, and Loader/plugin internals have their original calls. This is the same qualification recorded in the preserved NL01 review. Record it in any new effects freeze before interpreting ten as an inclusive call budget. It is not a blocker for the exact literal's source safety.

## Evidence boundary and remaining gates

The prior root execution is attributed by delegation/root-cause evidence: L01/L02 passed, P01 passed its refusal assertions then failed at `claims` with `2 !== 1`, and fourteen leaves were skipped. Later conservation assertions were not reached. This review did not reopen raw TAP or execute a corrected case; it supplies no new runtime/native/DOM PASS. The reported preservation of all 128 root pins and the original 27577-file/12-link graph is a root/author observation, not independently reverified here. Only the listed current proposal/helper/entry and causal source pins were independently hashed.

Read-only source windows were restricted to the literal/current fixture and helper, the named metadata/root-cause artifacts, public plan/snapshot/revoke shapes, action decoding, public installed plan output, digest helper and exact original registry methods/contracts. The cited public runtime-store implementation windows contain static ledger SQL strings; they were not executed or used to obtain private state. No protected blocked-investigation artifact, cipher/schema999 or SQL experiment was accessed. No reviewed JavaScript parsing, imports, runtime, test/build, DB/profile/listener/model/provider/network/credential or Git operation occurred. Only these two new review files were written.

Remaining gates: separate independent test review, root literal disposition, fresh exact projected/applied-source and effect freeze, and any separately bounded affected/remainder execution GO. Source safety does not close NI3 acceptance, the numeric-counter observability gap or the blocked final CODE gap. Prior NL01/ER08 review pins remain Markdown `9990c609ef58c5b790a8d468b7c4177803882f1515117f9540bb1709d6cc0eb3` and JSON `b92a0aafb0879ca77aea85edafff221ca5b03651185542fb02c0e7fc1ab7082e`.

Causal source pins, exact inspected line ranges, effect arithmetic and boundaries are recorded in the companion JSON. Evidence tools were source text reads/searches, SHA-256/byte-count reads, a read-only UTC clock and report-file creation; no language parser or source application was used.
