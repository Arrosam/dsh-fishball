# Schema7 independent functional and interface source review

**CHANGES REQUIRED.** Five concrete functional/API blockers and one new preparation-graph inverse gap remain in frozen source `8ae78baf7e66697f4d490ad24a5f4bca2162d0f5e22dad30a8785ff2bdd3fdc8`; RuntimeStore is `bc7074c72abe97780055cbf15b71bce223e53191e0867e6c09ff13a3860333d8`. This review is source only. All41 planned design groups remain NOT_RUN; all87 AC and the original blocked final CODE remain HOLD.

Reviewer `/root/ni6_independent_design`, parent `/root`, recorded `2026-10-07T04:44:09.978014+00:00`. Parent baseline attribution is `b17f0eb` on `feat/S3-integrations`; Git was not invoked. Exactly18 frozen src/contracts/original entries independently match the author manifest. The full freeze identifier is attributed to the author inventory; excluded author fixture/history bodies were neither read nor hashed.

The sealed original design is preserved exactly: [docs/evidence/NI6/schema7-independent-design.md](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/docs/evidence/NI6/schema7-independent-design.md) (`9a01d8d71fe97def605bff63a4c2da3556bdbff61adf7376ee6741636dc8c5ec`) and [docs/evidence/NI6/schema7-independent-design.json](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/docs/evidence/NI6/schema7-independent-design.json) (`706113919029e0812b96950d737f26ea1c055927a352f8f14f488b0ee5395611`). This new report adds review findings/prerequisites; it does not replace their41 cases, seven authentic-public fixture scopes, eight finish cuts or earlier NI1/NI2/NI3 obligations.

## Concrete findings

Review IDs `SRC-Fxx` are distinct from design case IDs `Fxx`. F01/F02 were acknowledged by the author. Root controls correction decisions; later source and affected fixtures require separate review.

### SRC-F01 — Live history sourceRef is compared with the stable descriptor hash

**HIGH; functional/interface; CONFIRMED_BY_AUTHOR_OPEN_IN_FROZEN_SOURCE.**

#historyJoin rejects h.sourceRef !== intent.sourceRef. intent.sourceRef is canonicalDigest(stableSource); original installed-worker-facts computes a lifetime-bound sourceRef. Both create baseline and capture validate through this join.

Supported trigger: An actual original public source-owned collector returns NativeHistoryObservation.sourceRef from the admitted live installed source, with genuine stable configuration and genuine native identity/history.

Expected: Historical live observation identity remains distinct from durable stable descriptor compatibility. Current original class/module/Loader/fiber/provider/preset/environment/invocation guards independently authorize new effects; restart does not require nonce equality.

Impact: Genuine baseline/capture cannot satisfy the documented source contract; restart also cannot rely on durable nonce equality. No native positive or cold continuation proof is available.

Required correction: Use the root-selected explicit stable/live separation in a new frozen revision, retain actual historical observation sourceRef unchanged, and require final runtime live guards separately.

Independent actual-public oracle: Actual original public create/flush/stat/read/projection captures with their real live sourceRef, followed by restart with the same stable bytes/backend and a fresh live nonce. Never substitute a descriptor hash as a positive source witness. **NOT_RUN.**

Source: [.runtime/ni6-schema7-core/src/runtime-store.mjs:3093](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni6-schema7-core/src/runtime-store.mjs:3093), [src/installed-worker-facts.mjs:185](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/src/installed-worker-facts.mjs:185), [docs/evidence/NI6/schema7-root-contract-disposition-2026-10-07.md:7](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/docs/evidence/NI6/schema7-root-contract-disposition-2026-10-07.md:7). Design groups: N01, N03, N04, N05, R01, R02, R07, R08, R11.

### SRC-F02 — Capture cursor is incorrectly required to equal complete event count

**HIGH; functional/interface; CONFIRMED_BY_AUTHOR_OPEN_IN_FROZEN_SOURCE.**

#captureBase requires input.cursor === h.events.length and #validateCapture requires v.cursor === h.events.length. Original collector explicitly checks a.seq === result.cursor, and original adapter keeps the stream cursor.

Supported trigger: A genuine completed original assistant/message has zero-based event.seq returned as NativeAdapter result.cursor; the complete public log includes step/end and turn/end after that assistant event.

Expected: Capture.cursor equals the actual matching original assistant event.seq. Capture.eventCount separately equals the complete bounded log length; completion/prefix/usage/execution association is verified.

Impact: Every genuine completed producer/audit/resumed capture is rejected even after SRC-F01 is repaired; a fabricated count-valued cursor is not an original native positive.

Required correction: Bind cursor to the exact matching original assistant event, retaining separate complete eventCount and existing input/execution/prefix/termination checks in writer and graph validator.

Independent actual-public oracle: Observe actual assistant event.seq, native result.cursor, trailing completed turn events and complete event count in original public history; require exact capture cursor and separate count. **NOT_RUN.**

Source: [.runtime/ni6-schema7-core/src/runtime-store.mjs:3099](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni6-schema7-core/src/runtime-store.mjs:3099), [.runtime/ni6-schema7-core/src/runtime-store.mjs:3105](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni6-schema7-core/src/runtime-store.mjs:3105), [src/installed-worker.mjs:180](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/src/installed-worker.mjs:180), [src/native-adapter.mjs:325](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/src/native-adapter.mjs:325). Design groups: N01, N03, N04, R02, R11.

### SRC-F04 — New capability operations bypass original task-bound handle admission

**HIGH; functional/authority interface; REPORTED_ROOT_AND_AUTHOR_OPEN_IN_FROZEN_SOURCE.**

#normalAuthority and #originalEffectAuthority call #ctx(handle,undefined). #normalMut gives c directly to #mut, bypassing #ctx(handle,input.taskRef). #cas/#task do not compare c.taskRef. finishNormalNativeExecution separately checks its owner Q, but normal plan/claim/capture/preparation lookup and identity resolution do not generally check the input task against both bound handles.

Supported trigger: Two genuine tasks A/B share owner/workspace. Bind a genuine owner or host handle with taskRef=A, issue its genuine native/preparation capability, and present an otherwise genuine B graph/input to a new task-bearing capability operation.

Expected: Original #ctx(handle,B,roles) denies the task mismatch before reads/mutation/effects, while legitimate historical replay still skips current CAS and source reconstruction.

Impact: Narrow capabilities can exercise operations or read historical facts on B despite original handle scope A. Same owner/workspace equality does not preserve the original task restriction.

Required correction: Reapply actual taskRef admission to the genuine bound owner/coordinator/host as appropriate before each task-bearing read and mutation, and before factored original effects. Do not add CAS to historical reads.

Independent actual-public oracle: Use only original public constructor-bound handles and genuine B prepared facts; compare ordinary owner/host B denial with new capability B denial. Include owner-A/host-B and owner-B/host-A partitions, and task-unbound valid controls. **NOT_RUN.**

Source: [.runtime/ni6-schema7-core/src/runtime-store.mjs:125](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni6-schema7-core/src/runtime-store.mjs:125), [.runtime/ni6-schema7-core/src/runtime-store.mjs:146](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni6-schema7-core/src/runtime-store.mjs:146), [.runtime/ni6-schema7-core/src/runtime-store.mjs:202](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni6-schema7-core/src/runtime-store.mjs:202), [.runtime/ni6-schema7-core/src/runtime-store.mjs:234](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni6-schema7-core/src/runtime-store.mjs:234), [.runtime/ni6-schema7-core/src/runtime-store.mjs:3016](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni6-schema7-core/src/runtime-store.mjs:3016), [.runtime/ni6-schema7-core/src/runtime-store.mjs:3017](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni6-schema7-core/src/runtime-store.mjs:3017). Design groups: A01, P04, N01, N07, F01, F04, R05, R10.

### SRC-F05 — New terminal operations are missing from terminal-progress dispatch

**HIGH; functional/terminal capacity; REPORTED_ROOT_AND_AUTHOR_OPEN_IN_FROZEN_SOURCE.**

All three new capture/repair writers and finish pass protectedOp=terminal. #terminalProgress recognizes no new names and falls through to #claim(c,input). Repair always reaches ref(undefined) at #claim823 before its effect body. Other new names return false after claim lookup and therefore cannot use reserved terminal capacity.

Supported trigger: Call writeNormalNativeRepairArtifact with its exact ten-field valid literal input, which includes producerClaimRef and generationRef but no claimRef. Separately reach the original reserved terminal command-capacity band with a genuine new capture or finish pending.

Expected: Authentic new terminal progress uses the original protected reservation rule. Repair artifact checks map its producer claim correctly; no broadened generic operation or rewritten public input is needed.

Impact: The new repair-artifact writer has no successful path with its own exact input. Captures and finish can fail COMMAND_LIMIT where reserved original terminal capacity should permit progress, retaining unresolved charged work.

Required correction: Add explicit bounded new terminal dispatch predicates with correct claim field mapping and genuine pending-progress tests. Retain original generic operation rules and original capacity ceilings.

Independent actual-public oracle: Actual source-owned repair output followed by fixed-target artifact acknowledgement; independently fill command capacity through ordinary supported writes and complete authentic producer/audit/repair capture and finish at the reserved boundary. No raw row count edits. **NOT_RUN.**

Source: [.runtime/ni6-schema7-core/src/runtime-store.mjs:261](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni6-schema7-core/src/runtime-store.mjs:261), [.runtime/ni6-schema7-core/src/runtime-store.mjs:345](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni6-schema7-core/src/runtime-store.mjs:345), [.runtime/ni6-schema7-core/src/runtime-store.mjs:823](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni6-schema7-core/src/runtime-store.mjs:823), [.runtime/ni6-schema7-core/src/runtime-store.mjs:3102](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni6-schema7-core/src/runtime-store.mjs:3102), [.runtime/ni6-schema7-core/src/runtime-store.mjs:3103](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni6-schema7-core/src/runtime-store.mjs:3103), [.runtime/ni6-schema7-core/src/runtime-store.mjs:3104](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni6-schema7-core/src/runtime-store.mjs:3104), [.runtime/ni6-schema7-core/src/runtime-store.mjs:3113](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni6-schema7-core/src/runtime-store.mjs:3113). Design groups: P08, N03, N04, F03, F05, B02.

### SRC-F06 — Historical preparation replay skips the adapter knownSecrets check

**MEDIUM; functional/request boundary; REPORTED_ROOT_AND_AUTHOR_OPEN_IN_FROZEN_SOURCE.**

Protected prepareContext calls preparationRequest(input) without this.#secrets and can immediately return the historical receipt. Store preparationRequest uses only store.#secrets. The new/ordinary #assemble checks input.terms against adapter.#secrets at257.

Supported trigger: An authentic preparation request is committed under a valid genuine MemoryAdapter with no matching forbidden term. Recreate a genuine adapter with that request term in its supported knownSecrets option, independently of the store knownSecrets, then replay the exact command/request.

Expected: The complete request is checked against the active adapter secret policy before historical lookup, without tokenizer, assembly or memory retrieval.

Impact: Historical replay accepts a request the same current adapter rejects on a fresh command. The early replay path violates the admitted complete-request boundary.

Required correction: Pass this.#secrets to the initial immutable preparationRequest validator before lookup; preserve store validation and effectless replay.

Independent actual-public oracle: Actual genuine historical preparation, fresh genuine adapter with its supported independently stricter secret list, exact replay and fresh-command comparison; require refusal before any source/memory/tokenizer callbacks. **NOT_RUN.**

Source: [.runtime/ni6-schema7-core/src/memory.mjs:43](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni6-schema7-core/src/memory.mjs:43), [.runtime/ni6-schema7-core/src/memory.mjs:257](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni6-schema7-core/src/memory.mjs:257), [.runtime/ni6-schema7-core/src/memory.mjs:285](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni6-schema7-core/src/memory.mjs:285), [.runtime/ni6-schema7-core/src/runtime-store.mjs:3069](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni6-schema7-core/src/runtime-store.mjs:3069), [.runtime/ni6-schema7-core/src/normal-contracts.mjs:30](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni6-schema7-core/src/normal-contracts.mjs:30). Design groups: A02, P04.

### SRC-F07 — Prepared graph validation omits required shared-field inverse joins

**MEDIUM; new-graph contract conformance; REPORTED_ROOT_AND_AUTHOR_SOURCE_JOIN_GAP.**

#preparedGraph compares selected identifiers/digests/principal/request and context metadata, but omits the listed check-to-binding shared-field comparisons. #validate7Scope calls it with value.taskRef without supplementing row.taskRef equality.

Supported trigger: Inspect the new PreparedCheck/PreparedBinding association validation against the root complete-inverse contract. An authentic inconsistent stored graph is not constructible through the currently reviewed ordinary public writer and is not fabricated here.

Expected: All new graph identity/scope and shared fields agree: binding row task/value task, check task, selectionMode, checkedSetDigest, source and committed task/auth CAS, semanticRevision, generatedAt, method and memory namespace/revision, in addition to the implemented digest/principal/command/context joins.

Impact: The source does not implement the full declared preparation graph inverse. This is a structural validation gap, not a claimed reachable unauthorized writer or an authenticated database-negative test result.

Required correction: Make the new-field joins explicit and freeze a supported inert closed-graph validation seam if independent malformed-association predicates are needed. Keep authentic encrypted-DB negatives HOLD without supported construction.

Independent actual-public oracle: A separately approved pure closed-graph predicate can reject one-field association mismatches; it proves only that predicate. Actual signed graph positives must still come from genuine public preparation writers. **NOT_RUN.**

Source: [.runtime/ni6-schema7-core/src/runtime-store.mjs:3034](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni6-schema7-core/src/runtime-store.mjs:3034), [.runtime/ni6-schema7-core/src/runtime-store.mjs:3064](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni6-schema7-core/src/runtime-store.mjs:3064), [.runtime/ni6-schema7-core/src/runtime-store.mjs:3085](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni6-schema7-core/src/runtime-store.mjs:3085). Design groups: P07, N01, M03.

### SRC-F03 — retracted held-null hypothesis

Original #planEffect initializes releaseEvidenceRef:null at618. #settleEffect893 spreads that metadata and preserves null when held; original returned wire at912 therefore matches NativeFinish null. The supported normal held path does not have the hypothesized mismatch.

Root prohibits the unnecessary runtime receipt comparison diff. Formal companion may clarify releaseEvidenceRef?: Ref|null only. Do not change original wire/strict validation or fabricate held receipts.

Source: [.runtime/ni6-schema7-core/src/runtime-store.mjs:618](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni6-schema7-core/src/runtime-store.mjs:618), [.runtime/ni6-schema7-core/src/runtime-store.mjs:891](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni6-schema7-core/src/runtime-store.mjs:891), [.runtime/ni6-schema7-core/src/runtime-store.mjs:911](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni6-schema7-core/src/runtime-store.mjs:911), [.runtime/ni6-schema7-core/src/runtime-store.mjs:3113](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni6-schema7-core/src/runtime-store.mjs:3113).

## Source observations and practical limits

- **O01 Issuer/assembler source binding:** Captured genuine RuntimeStore prototype/private symbol and ContextAssembler private brand plus exact captured original preparation source method descriptors reject duck types/dynamic overrides by construction. Returned three-field scope is detached and is never accepted as a capability. Task-binding gap SRC-F04 remains. SOURCE_OBSERVED, NOT_RUN.
- **O02 Preparation literal/material:** Original15 persisted envelope remains separate from ten put arguments. Full examined sourceObservation flows through capability-bound genuine assembly; historical request identity is complete scoped finite canonical input; current authority integer canonicalization is unchanged. P03 final memory compaction removes memory backgrounds while protecting original context text. SOURCE_OBSERVED, NOT_RUN.
- **O03 Exactly six kinds and nonadoption:** normal_native_intent/origin/capture/finish plus normal_resume/resume_claim, separate prepared/native registries, hidden exact-kind encrypted data, and generic marked-effect refusals exist. True6 additive migration uses copied original6 and preserves original backup/authentication path; no pre7 normal backfill/adoption writer. SOURCE_OBSERVED, NOT_RUN.
- **O04 Original digest and actual usage finish:** #planEffect613 keeps H({ownerRef,workspaceRef,taskRef,taskVersion,authEpoch,spec}); normal observation principal is separate from original owner/host effect principal. Acknowledged finish is actual-only; held null wire is original and remains exact. Resumed capture joins resume_claim→resume→original origin/intent. SOURCE_OBSERVED, NOT_RUN.
- **O05 Read-first finish:** Owner read checks detached exact8 Q and lookup before current CAS/native/map/backend availability. Q digest is distinct from full original private mutation digest. Present changed command conflicts; fresh command for finished claim refuses. Core contains no physical stop and runtime final invocation/read-delivery checks remain outside this capsule. SOURCE_OBSERVED, NOT_RUN.
- **O06 Full config and aggregate limits:** All15 limits are represented, existing7 resource policy fields stay mutable and8 selected constructor ceilings remain; omitted/disabled/enabled continuation parent mapping is literal-bound. Explicit aggregate role/continuation total is checked without silent total inference; original per-task attempts and whole-store held/released/spent resource charges are reused. Original Math.max(reserved,actual) accounting is not total-policy inference. SOURCE_OBSERVED, NOT_RUN.
- **O07 Static imports:** New context↔store ESM cycle has a source-only declaration-time argument; no module was parsed/imported. Author import metadata falsely lists specifier ", " as external for fishball-memory-core original/candidate; actual source line4 only imports node:util and line136 is a comment. Manifest inventory is not an executable import/effects proof. SOURCE_OBSERVED, NOT_RUN.
- **O08 Complete wire feasibility:** Status checks complete minimum signed wrapper and worst-case six reason codes; commit checks actual context/check/binding/read envelopes within selected limits, original counts and transaction. This is not a proof all maxima jointly fit or actual configured ready status works at runtime. SOURCE_OBSERVED, NOT_RUN.

The parser is deliberately narrowed to selected deterministic text/stop original events. A closed parser, source descriptor/hash, detached header/message JSON or boolean usage label is not original native provenance. Genuine native positives require source-owned complete public flush/stat/read/projection/usage witnesses and all current original guards.

Public writable SessionStore open may repair or allocate. The original public API has no filesystem CAS/maxRead argument; this report asserts no whole-filesystem rollback, hard decompression/allocation bound or exactly-once arbitrary effect. Cold failure retains charged unknown/held facts; it cannot invent stop or acknowledgement.

## Root eleven contract dispositions

| Seam | Current independent source disposition |
| --- | --- |
| 1 Stable/live source | CHANGES_REQUIRED_SRC_F01_AND_RUNTIME_GUARD_CLOSURE |
| 2 Preparation delivery | SOURCE_PATH_PRESENT_SRC_F04_F06_F07_AND_RUNTIME_PUBLICATION_PENDING |
| 3 Fanout | CORE_NEW_ONLY_OBSERVER_PRESENT_RUNTIME_GENERIC_FANOUT_CLOSURE_PENDING |
| 4 Collector | LITERAL_HOOK_ADAPTER_DISTINCTION_PRESENT_ACTUAL_SOURCE_OWNED_COLLECTOR_PENDING |
| 5 Role capture graph | SOURCE_UNION_PRESENT_SRC_F01_F02_F05_PRECLUDE_POSITIVES |
| 6 Configuration/IDs | SOURCE_COMPLETE_CANONICAL_CONFIG_ORIGINAL_IDS_PRESENT_NOT_RUN |
| 7 Finish order | CORE_READ_FIRST_PRESENT_ACTUAL_ACK_RUNTIME_RESPONSE_ORACLE_PENDING |
| 8 Specs/policy | SOURCE_EXPLICIT_SHARED_TOTAL_ORIGINAL_CHARGES_PRESENT_NOT_RUN |
| 9 Capacity | SOURCE_COMPLETE_WRAPPER_PRESENT_SRC_F05_TERMINAL_CAPACITY_GAP |
| 10 Digest | ORIGINAL_SCOPED_PLANNED_CAS_FULLSPEC_DIGEST_PRESERVED_NOT_RUN |
| 11 Approval | CORE_SYNC_PAIR_PRESENT_FINAL_OWNER_PREVIEW_GRANT_RUNTIME_CLOSURE_PENDING |

## Prerequisites for all41 sealed case groups

Every row is DESIGN_ONLY, NOT_RUN and HOLD. D00 applies everywhere: no new independent fixture author lease or executable lease exists. Core-only meaningful fixtures can be authored once root settles the source/API and grants a finite author scope. Native-positive fixtures additionally need actual original runtime/source oracles; blocked cells cannot be replaced by fake positives.

| Prerequisite | Required literal or actual-public seam |
| --- | --- |
| D00 Root revision and bounded authorship/execution lease | Root disposition of open findings, newly frozen corrected source/import/effects closure and a separate finite independent fixture-author scope precede any fixture creation or execution; all cases currently NOT_RUN. |
| D01 Genuine preparation/capability composition | Actual constructor-issued same-store preparation/native capabilities and original scoped owner/coordinator/host handles; genuine ContextAssembler/MemoryAdapter captured descriptors, tokenizer and new-only observer; supported original sources and memory writes. SRC-F04/SRC-F06 must be fixed. |
| D02 Runtime new-only publication and captured guards | Final runtime origin/fanout composition, exact captured invocation/carrier/live source authority, current preparation return, postcommit/source-loss and owner-read/final-response guards. Core helper scope objects are never proof or authority. |
| D03 Original native host and full pinned configuration | Frozen actual product/host files and canonical backend descriptor plus current original Agent/Session/Handle/Loader/module/fiber/provider/preset/environment guards; complete actual configuration/15 limits. Use original public create and source-owned synthetic provider only. SRC-F01 must be fixed. |
| D04 Complete original public history witness | Actual flushtrue, stat, bounded complete own read and actual Session.create/messageProjections/registered projections with complete raw original events and corresponding surface/messages. Runtime source collector and closure are pending. Echo JSON/headers/hashes/stubs are negative-parser inputs only. |
| D05 Original output cursor and actual usage | Observe current actual persisted turn usage/execution/user/assistant associations and original assistant event.seq result cursor distinct from eventCount. SRC-F02 must be fixed; no accumulated-prefix usage or provider-label zero inference. |
| D06 Original review/repair completion and terminal capacity | Real audit reviewer submission/fixed child artifact/version completion, source-owned output plus immutable second repair capture, actual physical stop/drain/unregister and original held/released receipts. SRC-F05 must be fixed; absent/unknown never acknowledged. |
| D07 Genuine6 migration and preservation observation | Exact copied original6 public donor writes and namespace-only scope, original backup/recheck flow and future-reader refusal under a separate DB/migration lease. Exact old opaque ciphertext/AAD needs a separately approved original observation; public receipt equality is insufficient. |
| D08 Supported races and original process cuts | Named original pre/postcommit/stop/setup/first-next boundaries and finite already-open processes, actual owned crash/abort/unload/handle failures, original CUT04 transaction cut. No arbitrary private row edits or fake claims. |
| D09 Original public cold continuation | Full creator close/exit, fresh original module/invocation guards, retained genuine backend/key, no old handles/maps/previews/permits; public AgentRegistry.resume same native ID with new claim/generation/execution/objects, registered empty inbox and empty interruptedTurnClosers. Actual writable open may allocate/repair; no filesystem CAS or hard decode/rollback promise. |
| D10 Complete consent, policy and aggregate accounting | Final synchronous readResumeInput pair, exact full history/request/context/config/currentness and wire checks before token/grant; owner consent then distinct exact full-spec grant; explicit shared per-task total and original whole-store released/spent/held resource accounting, 15 displayed/7 mutable/8 constructor ceilings. |
| D11 Safe negative and reachability oracles | Supported inert typed new-graph validation seam is currently absent. Authentic encrypted-DB missing-edge/orphan negatives, legitimate removed-source SOURCE_UNAVAILABLE, high ordinal8 positives and later adapter-only dropped summary require real supported reachability; otherwise exact cells HOLD. SRC-F07 must be resolved. |
| D12 Final installed package and client lifecycle | Final package/source/CLI/auth/Loader lifecycle, separate synthetic profile/listener/browser/model-quality lease and full-history owner UI propagation. No QA/frozen a58 reuse; fixture success cannot replace physical acceptance. |
| D13 Literal/runtime import and wrapper boundary confirmation | Final exact literal refinements/import inventory and source effect review; subsequent separately authorized actual ESM/module/constructor/selected metadata/wire feasibility checks. Static cycle reasoning and byte counts are not syntax/import/runtime results. |

| Design group | Frozen source observation | Required prerequisites and oracle |
| --- | --- | --- |
| A01 | Genuine store private-symbol/captured-prototype and assembler brand paths exist; task-scoped original admission is incomplete. Findings SRC-F04. | D00, D01, D13. Actual scoped handles and same-store genuine brand controls; no copied scope object as proof. |
| A02 | Closed immutable finite request parser exists; adapter-secret early replay is incomplete. Findings SRC-F06. | D00, D01, D13. Actual optional-field/order/fraction/Proxy/accessor/secret boundary cases before historical lookup. |
| P01 | Original fifteen-field envelope and separate ten-input write are preserved in literal/source. | D00, D01, D02. Actual original examined-source assembly and admitted queryHost supplements; no fake positive observation. |
| P02 | all_eligible/explicit_records and sorted examined summary checks exist; original summary sourceRefs are retained. | D00, D01. Public original summary writers and full examined branch witness, including unselected semantic drift. |
| P03 | Assembler summary observations are retained through adapter result; final adapter compaction protects unit.context.text and pops only memory backgrounds. | D00, D01, D11. Actual assembler stale/budget-drop and adapter memory-drop cases. Later adapter-only dropped-summary positive is not source-reachable and remains HOLD. |
| P04 | Historical lookup precedes #assemble/retrieve/tokenizer/status; current reconstruction is skipped, but task scope and adapter-secret checks are incomplete. Findings SRC-F04, SRC-F06. | D00, D01, D02, D09. Authentic prior receipt plus legitimate task/auth/source/memory drift and fresh composition; constructor/recovery effects counted separately. |
| P05 | Original transaction returns historical disposition for late duplicate and request digest excludes volatile observations. | D00, D01, D08. Named precommit rendezvous with two actual early misses; changed immutable request conflict. |
| P06 | New-only synchronous observer repeats genuine binding/task/auth/semantic/memory checks after commit; runtime final invocation/source delivery pending. | D00, D01, D02, D08. Actual durable new commit followed by supported invocation/source/observer loss; exact replay cannot recreate origin. |
| P07 | Three currentness booleans and six closed sorted reasons exist; preparation graph inverse lacks shared-field joins. Findings SRC-F07. | D00, D01, D11. Legitimate public source/memory/CAS drift. Missing associated facts/removal cells need supported seams; otherwise HOLD. |
| P08 | Minimum signed-binding and full worst-case read wrapper feasibility plus atomic actual material checks exist. Findings SRC-F05. | D00, D01, D06, D13. Reachable selected-domain/joint wrapper boundaries and original command reservation capacity; no Cartesian max-fit assumption. |
| N01 | Six exact native kinds, separate mandatory registries, factored original effects and original scoped full-spec digest exist; positive history/capture has blockers. Findings SRC-F01, SRC-F02, SRC-F04, SRC-F05, SRC-F07. | D00, D01, D03, D04, D05, D06, D11. Full actual original create/idle/turn/flush/capture/physical finish graph; never hash/stub provenance. |
| N02 | New-kind generic read/write hiding and marked generic plan/claim/capture/settle refusals are present; no adoption writer is offered. | D00, D03, D07. Public genuine6/generic/advanced facts plus early native-effect counters; malformed signed DB cells held. |
| N03 | Purpose/phase union and immutable same-kind repair second capture exist, but valid repair artifact is blocked by terminal dispatch. Findings SRC-F01, SRC-F02, SRC-F05. | D00, D03, D04, D05, D06. Actual review submit and repair fixed target/version+1 completion; output/artifact uncertainty counted distinctly. |
| N04 | Actual-only finish and role-complete release predicate exist; held preserves null original release wire. Findings SRC-F01, SRC-F02, SRC-F05. | D00, D03, D04, D05, D06. Actual stopped original role work with real obligations met/unmet and released/held writer branches, no invented unknown marker. |
| N05 | Stable source descriptor/backend parsing exists; history join conflates it with actual lifetime source. Findings SRC-F01. | D00, D02, D03, D04, D09. Restart same stable bytes/backend with fresh live original source; independently change each current gate. |
| N06 | Full15 limits, closed config, exact original encrypted data identities and H(scope+plannedCAS+fullspec) are preserved. | D00, D03, D10, D13. Actual full configuration/selection/preset/tools/permission and distinct context/history/input/Q/action digest partitions. |
| N07 | Marked generic effects refuse and original begin/assert normal admission derives from signed graph; capability task constraints are incomplete. Findings SRC-F04. | D00, D01, D03, D11. Each public bypass using actual marked facts; authentic marker deletion remains HOLD without supported construction. |
| F01 | Public owner read validates detached Q and does no CAS/source/native lookup; finish row lookup is keyed and historical. Findings SRC-F01, SRC-F02, SRC-F05. | D00, D02, D03, D04, D05, D06, D09. First real acknowledgement then warm/full-exit cold oldQ replay with legitimate later drift and exact unchanged receipt. |
| F02 | Present changedQ conflict and finished fresh-command refusal are explicit; original full mutation identity remains separate. Findings SRC-F01, SRC-F02, SRC-F05. | D00, D03, D04, D05, D06, D09. Genuine acknowledged finish and each permitted Q field change/other-operation collision; no generic receipt adoption. |
| F03 | Unknown/missing finish is not acknowledged; actual-held original null path is source-consistent; initial reviewer SRC-F03 is retracted. Findings SRC-F01, SRC-F02, SRC-F05. | D00, D03, D04, D05, D06, D08, D09. Actual stop failure/drain/transaction uncertainty and genuinely held acknowledgement if produced; cold absence cannot settle. |
| F04 | Core historical owner read preserves scope; runtime captured invocation/guard-after-read response check remains outside core. Findings SRC-F04. | D00, D01, D02, D08, D09. Actual denied owner read and postlookup invocation/unload loss; no committed-fact erasure or native reconciliation. |
| F05 | One original transaction couples new finish/command/registry, but process/race proof and terminal-capacity path are unexecuted. Findings SRC-F05, SRC-F07. | D00, D06, D08, D09, D11. CUT01..08 and concurrent actual acknowledged reads; CUT04 and authenticated graph negatives require separate approved seam. |
| R01 | Released producer-only predecessor eligibility and fresh prepared input checks are present; no automatic resume API path. Findings SRC-F01, SRC-F02, SRC-F05. | D00, D01, D03, D04, D05, D06, D09, D10. Real original producer release followed by explicit fresh preparation; held/pre7/audit/repair/replayed controls. |
| R02 | Selected deterministic original event/surface/message parser is closed; actual complete collector and sourceRef/cursor fixes pending. Findings SRC-F01, SRC-F02. | D00, D03, D04, D05, D09. Actual complete original header/events/surface/messages/persisted usage plus supported pure parser negatives. |
| R03 | Core accepts bounded detached history only; registered original inbox restore and interrupted closers are runtime prerequisites. | D00, D04, D09. Actual registered SessionProjectionRegistry.restore with offset/inherited0 and empty inbox/closers before claim/setup. |
| R04 | Closed history1..96/messages3..17/bytes256..49152 and joint pair limits exist; physical decode behavior remains original API gap. | D00, D04, D09, D11, D13. Actual complete naturally reachable prefixes and public stat/read129; ordinal8/count-max success cannot be invented. |
| R05 | Synchronous readNormalResumeInput checks whole pair and preparation currentness; final preview/consent token/grant layer pending. Findings SRC-F04. | D00, D01, D02, D04, D10. Exact whole-history/config/15limits/spent/remaining display and both-side await/pair/wire checks before token and distinct grant. |
| R06 | Original locked successor check and claim effect precede signed resume_claim, retaining original charges. | D00, D08, D09, D10. Two genuine already-open processes sharing predecessor/last quota; loser has zero claim/native stream. |
| R07 | Core resolves stable original identity; actual public write-open/setup and live prefix/source rechecks belong to runtime owner. Findings SRC-F01. | D00, D02, D03, D04, D08, D09. Original public AgentRegistry.resume under actual prefix/lease/abort/backend races; possible repair/allocation is honestly retained. |
| R08 | resume_claim joins original origin/intent with new generation/claim and same session; actual original agent publication/explicit send pending. Findings SRC-F01, SRC-F02. | D00, D02, D03, D04, D05, D09. Full-exit same-ID new real Agent/Session/Handle, idle0streams then explicit full-prefix one-use send1stream. |
| R09 | Core action/claim/generation/execution associations are explicit; stale callback/disposer/incarnation isolation lives in runtime. | D00, D02, D03, D08, D09. Actual old frame/cursor/permit/disposer arriving after fresh original incarnation, no borrowing new objects. |
| R10 | Original signed fullspec and grant claim checks are preserved; outer preparedCall/lazy first-next captured source guard closure pending. Findings SRC-F04. | D00, D01, D02, D03, D08, D10. Actual revoke/cancel/policy/unload/abort at each named original await boundary with exact trusted permission fields. |
| R11 | Resumed capture explicitly joins resume_claim→resume→original origin/intent; live source/cursor blockers prevent genuine capture. Findings SRC-F01, SRC-F02. | D00, D03, D04, D05, D09. Current actual new turn usage/cursor and complete flushed history; old artifact/receipts unchanged. |
| B01 | Explicit shared total configuration checks and original per-task attempts are retained; original accounting Math.max(reserved,actual) remains separate. Findings SRC-F01, SRC-F02, SRC-F05. | D00, D03, D06, D09, D10, D11. Actual producer/review/repair/resume charges through naturally reached ordinals1..8, one beyond ceiling, no total reset/inference. |
| B02 | Original whole-store runtime/usage/cost and active holds are reused; released/spent remain counted. Findings SRC-F05. | D00, D03, D06, D07, D08, D10. Two actual tasks with spent/released/current unknown work and last quota/terminal capacity boundaries; unknown never zero. |
| B03 | Spent/remaining uses existing attempts/action charge facts and selected policy, with unknown conservative refusal. | D00, D03, D09, D10. Actual reopen and accepted mutable policy downshift; 15-display/7-write/8-ceilings and explicit insufficient choice refusal. |
| M01 | Ledger schema7 migration is additive through original guarded backup path; copied genuine6 source hashes match. | D00, D07, D13. Original public6 donor then authorized7 migration and old6 future refusal; approved opaque ciphertext/AAD observation needed. |
| M02 | Dual signed zero registries initialize migrated scopes, including namespace-only union; new scopes initialize only in mutation. | D00, D07, D13. Actual empty boot/status and namespace-only6 migration; no raw user_version donor or fabricated registries. |
| M03 | Both new graphs validate alongside existing6 before recovery; preparation inverse joins are incomplete. Findings SRC-F07. | D00, D07, D08, D09, D11. Actual genuine unknownwork reopen plus separately approved inert predicate negatives; authentic missing-edge/orphan DB cells HOLD. |
| U01 | Core capsule defines no installed publication/physical quit/restart behavior. Findings SRC-F01, SRC-F02, SRC-F05. | D00, D02, D03, D04, D05, D06, D09, D12. Final packed CLI/auth/Loader full lifecycle on separate owned synthetic profile; no fixture-only acceptance. |
| U02 | Core offers bounded status/pair/wire interfaces; final owner client/history consent and source/service UX remain independent dependency. | D00, D02, D10, D12. Actual final client complete-history/limits/uncertain state/result propagation and separate browser/model-quality oracles; all87 HOLD. |

Specific unavailable negatives stay held: authentic encrypted-DB missing-edge/orphan/duplicate signed facts require supported construction; exact old opaque ciphertext/AAD requires an approved observation; SOURCE_UNAVAILABLE needs a legitimate removal lifecycle. Final adapter compaction cannot create a dropped-summary positive while protecting unit.context.text. Naturally unreachable ordinal8/count-max native positives are not fabricated. The paired JSON preserves each original trigger/oracle and the eight CUT01..08 expectations.

## Exact inputs and unchanged scope

| Input | SHA256 | Bytes |
| --- | --- | --- |
| .runtime/ni6-schema7-core/contracts/core-refinements.d.ts.txt | `5d5384b66d5cc5ec8682cd79a77bf7e32fd77af762f583d1054ade03e0f0aa5d` | 8035 |
| .runtime/ni6-schema7-core/contracts/literal-refinements.md | `c2398d136b1e408e518a31705f08eedb78b9cee0382f44f7b4afbe7f48c94b95` | 10989 |
| .runtime/ni6-schema7-core/contracts/proposed-operation-bindings.txt | `e1e7a279a5c5025b015ad780305141da32794033fbe6200e294e05aef70ecc0e` | 8878 |
| .runtime/ni6-schema7-core/contracts/schema7-contracts.d.ts.txt | `3559319922afc9ca20a0ee30d3e2aa84543efa005ca7ad8384c86e69b457b210` | 45312 |
| .runtime/ni6-schema7-core/contracts/source-manifest.json | `f6a629cd45aa423bcd23037819b00c9eddf1f99e307d6dfa2740abbcf7c01c73` | 21461 |
| .runtime/ni6-schema7-core/original/context.mjs | `6fd7ba5b84353382fe5d3656af8717d1d4200c309dd808d79c52fe20728f3700` | 24196 |
| .runtime/ni6-schema7-core/original/fishball-memory-core.mjs | `65efb6117e6f60f5b669b2305b75f3e43ed7e77530c20c374158d504b7ac03bc` | 21009 |
| .runtime/ni6-schema7-core/original/ledger.mjs | `c42893e85399836ad2bb41f96627104455c5bc31de576a4c993e41d487c0a258` | 21567 |
| .runtime/ni6-schema7-core/original/memory.mjs | `dba915b9f3c2a76ef05cce50611a553ecb792e896b7095b70e7491a9cae72a01` | 31812 |
| .runtime/ni6-schema7-core/original/runtime-security.mjs | `66fd91b6042eadf7de89c22d18e12a68ed27aec67a87aa4aaf7e5c6df0eda820` | 5323 |
| .runtime/ni6-schema7-core/original/runtime-store.mjs | `1742b0f3ffb190f285ac0a915e8efd0fde2fde42d62ecd22a4e75a86930ad27f` | 239793 |
| .runtime/ni6-schema7-core/src/context.mjs | `6b284217281a821f3fb6de61b41e6df62f8786614f1d8c50f36117315c7fb993` | 28179 |
| .runtime/ni6-schema7-core/src/fishball-memory-core.mjs | `65efb6117e6f60f5b669b2305b75f3e43ed7e77530c20c374158d504b7ac03bc` | 21009 |
| .runtime/ni6-schema7-core/src/ledger.mjs | `250cfddd11187ac08defd006737491df54b1bfa5901e1df90ef577f72882fbb4` | 21799 |
| .runtime/ni6-schema7-core/src/memory.mjs | `516fcb08e43e6eba2884eee3eb6999b5857929eb8cec14e581c4d1f1a9a09531` | 36431 |
| .runtime/ni6-schema7-core/src/normal-contracts.mjs | `e07bbfcff66db140aedff87e30d2cc8dd8eb2d527e18b6a83a939f0211ca83f8` | 31883 |
| .runtime/ni6-schema7-core/src/runtime-security.mjs | `ee3c1051f3c16adf8c9d4f66a15623de5e13c1a3fef844a40927b9e7193c406d` | 6033 |
| .runtime/ni6-schema7-core/src/runtime-store.mjs | `bc7074c72abe97780055cbf15b71bce223e53191e0867e6c09ff13a3860333d8` | 322302 |
| AGENTS.md | `dea33c79f404cbab39acfc96b70b5e01962b9214cfd44f5cb6524764b1e45fc4` | 7668 |
| docs/owner-amendment-2026-10-04.md | `92f1b4b2cae959e88e6e35a351c253e186ef4b3567f2f048cd60fc7017b8a89e` | 5304 |
| docs/evidence/NI6/schema7-root-contract-disposition-2026-10-07.md | `2fc7f793695244c575fe71d2bcd6a2bc15212dbb285a9632f7b78c9e872ea9ca` | 7179 |
| docs/evidence/NI6/schema7-core-author-source-manifest.json | `d5cc393ae18c3ddf2231c6e82b9f836437ca61aa1be52716642553d75905b0f0` | 27805 |
| docs/evidence/NI6/schema7-core-author-freeze.md | `60ea9d78ce1b1ec65c5267c8997656aa908318c4658e1a91b26d3605cc16107a` | 5901 |
| docs/evidence/NI6/schema7-core-author-source.diff | `eff465680408c0446d8ec2d10e7c984e1a2474da5ff88ada9079a743d694e509` | 185067 |
| docs/evidence/NI6/schema7-core-author-literal-refinements.md | `c2398d136b1e408e518a31705f08eedb78b9cee0382f44f7b4afbe7f48c94b95` | 10989 |
| docs/evidence/NI6/schema7-combined-api-proposal.md | `523308225b96173368a8259df23510918cd32174c665e5092f078e0886c8d973` | 46462 |
| .runtime/ni6-schema7-proposal/schema7-contracts.d.ts.txt | `3559319922afc9ca20a0ee30d3e2aa84543efa005ca7ad8384c86e69b457b210` | 45312 |
| .runtime/ni6-schema7-proposal/proposed-operation-bindings.txt | `e1e7a279a5c5025b015ad780305141da32794033fbe6200e294e05aef70ecc0e` | 8878 |
| .runtime/ni6-schema7-proposal/proposed-contract-diff.txt | `6811e12d731e5e84495dffce313f174a46264c8471cad4d4f2020233e03df195` | 46932 |
| .runtime/ni6-schema7-proposal/source-manifest.json | `f6a629cd45aa423bcd23037819b00c9eddf1f99e307d6dfa2740abbcf7c01c73` | 21461 |
| src/installed-worker-facts.mjs | `22cb737371b43575a81eaf5281027a0cfae5c90b7fdbb89895d501f5dabc18b8` | 20368 |
| src/installed-worker.mjs | `61c6eaabe82a7b32b31d8cf996bfd965f9b8188d70f407673e7a9907a2af20fb` | 33262 |
| src/native-adapter.mjs | `eb990b3def82c29312ec7f94cf5aa1f3003a5f8364a26e9b9b0f8a6cac644bb0` | 37074 |
| scripts/dsh-web-runtime-lock.json | `68d3847884edf5b2c21d9d254bc059c3beb8105baec50c6d637c3328bbf187a3` | 388886 |
| docs/evidence/NI6/schema7-core-author-review-amendment-01-required.diff | `29d16511d7a3e2089865890622695f930dda39a9df2777d6019c8468d384c54a` | 36155 |

The original design JSON retains its63 firsthand input pins, including original public DSH package/type sources. Those are prior-read attributions, not a blanket fresh-source review. Its installed-audit source drift disclosure remains exact. No QA/frozen a58 source/profile/listener was touched.

Old private receipt/envelope machinery treated as black-box calls; no investigation. A bounded #mut excerpt ending at282 unintentionally displayed the beginning of #receiptMac; earlier broad excerpts showed nearby old record/memory metadata paths. Not followed or analyzed, excluded from conclusions. SRC-F07 concerns newly declared shared-field graph joins only. No protected row modification, fake HMAC, signed fake fixture, or encrypted authenticated negative construction was performed.

Author freeze/manifest describes unexecuted test filenames/imports/stated scope. No test/assertion/oracle body or result was inspected. No Node parse/import/check/test/build, fixture creation/execution, DB open/write/migration, native/provider/model/tool/service/profile/listener/browser/network/install or Git operation occurred. Only filesystem text reads/hashes and Python stdlib artifact processing were used; product source edits0, blocked experiment reruns/reroutes0.

The author reports an unapplied root-selected F01/F02 B+cursor amendment at [docs/evidence/NI6/schema7-core-author-review-amendment-01-required.diff](/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/docs/evidence/NI6/schema7-core-author-review-amendment-01-required.diff) (`29d16511d7a3e2089865890622695f930dda39a9df2777d6019c8468d384c54a`; independently hash-checked only). Frozen implementation remains unchanged. Amendment code/oracles were not reviewed here and no correction is treated as implemented.

This independent schema7 functional/interface review cannot close or replace the original service-blocked receipt-envelope/rev999/final CODE investigation. Browser, model-quality, installed physical lifecycle, MVP and publication acceptance remain held.
