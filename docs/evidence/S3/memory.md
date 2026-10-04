# BUB007B memory adapter development evidence

Status: coherent adapter and prepared-context implementation against the actual schema4 encrypted RuntimeStore, amended with protected admitted event supplements. The current author regression passes61 tests:34 memory,13 context and14 retained coordinator tests, with zero failures or skips. The earlier frozen57-case unit is recorded below. Independent review of these new integration changes is pending. This is development evidence, not complete BUB007-03..06, BUB008 or MVP acceptance. The owner selected dsh-fishball (df), MIT, and adapter-contract validation with no first chat provider this phase. Final native functional/visual/model-input debt remains distinct.

## Source reuse versus new integration code

`src/fishball-memory-core.mjs` is a private Node22 native ESM semantic translation of the exact Kotlin main/release algorithms pinned in [provenance](../../fishball-provenance.md): bounded MemoryStore record types, source/default TTL and confirmation/invalidation, BMP/UTF-16 bigram Jaccard, Float32 cosine, candidate thresholds, turn searches/revisions, whole snapshot and release last-revision-wins JSONL/snapshot union migration. Kotlin source files, JVM collections/atomics, Android UI, Ktor gateways, model-based extraction and the fishball application are not copied into this repository. This is actual algorithm adaptation executed by JavaScript, not a Kotlin/JS compile or reuse of the whole original Kotlin core. Fail-closed corruption/unknown-field/persistence handling, exact bounds, private namespaces and secret checks are deliberate documented corrections.

`src/memory.mjs` is new integration code for the authoritative encrypted RuntimeStore and current coordinator context. It calls the small port's normalization, monotonic allocation and retrieval routines, then commits one fully validated projection through typed workspace methods. No private SQL, second database, exported handle/key or separate task/approval authority exists. The minimal shared-core boundary covers the memory domain, search/similarity, serialization/version contract and source/confidence/revision adapters; the pure core implements records/search/TTL/migration while this new adapter supplies source/confidence/revision policy; durable identity, encryption, command replay, CAS and deletion belong to RuntimeStore. Projection source/time/confidence/revision/tombstone policy and context protection belong to this adapter.

The tests explicitly distinguish fake typed-store unit fixtures from actual encrypted RuntimeStore integrations. The latter execute real scoped bindings, encryption, reopen, two operating-system processes racing CAS, transaction faults and abrupt child-process exits against synthetic temporary databases. Injected fact extraction, host responses and token counting remain synthetic doubles; no real provider/model/tokenizer/native session behavior is established. The earlier reviewed public Cordis fixture really executes the installed library plus encrypted synthetic RuntimeStore; it is not actual DSH Web-profile acceptance. No inference, external chat setup, personal fishball import, network or credential is used.

## Implemented interface and bounds

MemoryAdapter privately captures the trusted constructor-injected handle and calls `memoryBinding(handle)` for factual owner/workspace/role. Public refs do not authenticate and stored refs are never passed through raw-ID hashing again. Owner/coordinator can remember, correct, forget or explicitly import supplied synthetic data; only owner can delete the namespace. Host reads; worker/reviewer and forged handles deny. Default behavior creates no source-file lookup/import.

One encrypted namespace projection contains the validated native snapshot and per-fact provenance: sourceRefs, observedAt, confidence0..1, fact revision/previousRevision, explicit conflictRefs and deleted tombstones. IDs are allocated inside the adapter, never supplied on new remembers; allocation persists monotonically through correction/delete/reopen. Correction removes the prior value from current searchable core, deletion removes plaintext and retains a tombstone; no persistent retrieval cache exists. Memory reads always obtain the fresh scoped namespace revision. Opposite facts remain separately sourced candidates requiring verification; no semantic inference silently chooses one.

All mutation requests use namespace revision CAS. The adapter computes an immutable normalized operation/request digest locally and consults authoritative `memoryCommandReceipt` before deriving a new snapshot; an identical historical request replays its receipt without writing, while changed request or cross-operation reuse conflicts. Receipt replay contains durable metadata, not a newly allocated fact result. Writes require an exact committed digest/scope/revision receipt; uncertainty is visible. Stable codes redact raw storage/extractor/tokenizer exceptions.

The complete outer projection is at most4MiB UTF-8, matching the workspace content cap without widening task data's64KiB cap. Core rows/vectors/strings/JSON remain independently bounded; projection metadata has at most1536 live/tombstone entries, at most16 distinct source refs per fact/mutation, at most16 extracted facts per batch. Tombstone retention is bounded and no silent compaction/ID reuse or namespace resurrection occurs. Deletion is logical current-data deletion; prior encrypted migration backups may exist and physical erasure is not claimed.

Injected extraction receives secret-checked immutable input before any callback. The entire returned bounded fact batch is validated before one CAS write. A namespace change during an await rejects; silence/no facts creates no saved claim. No real extractor/model call is implemented. Explicit source import validates the exact supplied snapshot/JSONL and provenance, only into a new empty namespace; no existing personal-data imports or automatic merge exist.

`projectContext` keeps current ledger/task and latest decrypted goal/constraints in separate authoritative fields. Every retrieved memory candidate is labelled memory_only/requiresVerification. `assembleContext` uses existing ContextAssembler's current input as protected text, appends sourced memory backgrounds through the existing byte/injected-token compactor, and rechecks task version/auth epoch/generation plus namespace revision after await/tokenizer callbacks. It refuses rather than trim current protected constraints. This conservative module composition has no native model dispatch/input or real tokenizer acceptance claim.

## Prepared execution-context contract

Construct MemoryAdapter with the actual RuntimeStore, opaque coordinator/owner handle, stored namespaceRef, configured ContextAssembler and injected tokenizer. Call:

```js
await memory.prepareExecutionContext({
  taskRef, commandRef, expectedTaskVersion, expectedAuthEpoch,
  terms, now,
  // Optional: recordRefs, vectors, limit (0..32).
});
```

No generationRef is accepted: a prepared context exists before the future worker generation. `now` belongs to the bounded retrieval request; generatedAt comes from the factual store snapshot. Paused, cancelled, terminal or recovery tasks refuse preparation. Caller refs are stored digests and do not authenticate or get hashed again. Preparation captures validated input before await, resolves current scoped encrypted goal/constraints and selected source material, and protects the complete current ledger work facts. Source provenance includes actual encrypted-record refs/digests/task and authorization versions/timestamps, plus sourced material lineage and any refreshed host observation. Memory remains a separately labelled candidate with namespace/fact revision, sourceRefs, observedAt and confidence; summary approval/completion assertions never become ledger authority.

The complete JSON value has contractVersion `df.execution-context/v1`, materialKind `execution_context`, sourceScope, sourceTaskVersion, sourceAuthEpoch, generatedAt, sourceRefs, sourceProvenance, ledgerSnapshotDigest, memory namespace/revision/retained-fact provenance, content, inputCounts, retainedRefs, droppedRefs and verification `module_prepared_execution_context_only`. It is closed and versioned. `ledgerSnapshotDigest` binds the snapshot's task and protected work facts; it is no claim of current authorization. Counts cover decoded input including headers/separators using the injected tokenizer. The durable record cap separately covers the complete UTF-8 JSON envelope, including escaped text and provenance. Preparation removes optional memory records whole and recomputes counts; if protected current input and envelope alone exceed65536 bytes, it refuses without writing.

Preparation uses one typed `putData(kind:'context')` transaction with task/auth CAS and `expectedMemory:{namespaceRef,revision}`. Revision0 means an observed absent namespace and requires no row; a tombstone is not absence. Positive revision requires exactly that live namespace revision. A namespace creation, correction or deletion before commit rejects, as does a concurrent current task correction. Core derives and authenticates sourceTaskVersion/sourceAuthEpoch and flattened memoryNamespaceRef/memoryRevision as record metadata. Preparation does not initialize or resurrect memory. The encrypted record's generationRef is null.

The returned receipt is metadata only:

```js
{
  recordRef, digest, kind: 'context', byteLength, cryptoVersion: 2,
  sourceRef, task, sourceTaskVersion, sourceAuthEpoch,
  memory: { namespaceRef, revision },
  inputCounts: { bytes, tokens }, retainedRefs, droppedRefs,
  verification: 'module_prepared_execution_context_only'
}
```

`digest` hashes the entire stored envelope, not only content. `task` is the post-write CAS value for the root's later action/grant transaction. No decrypted text, content, handle or key is returned. The native worker must later read that exact record under a current approved claim; preparation itself grants no action or model authorization. Existing execution envelopes are validated and omitted by default during assembly; explicit selection rejects `CONTEXT_RECURSION`, preventing recursive old context. A stale task CAS on a repeated preparation may refuse; automatic retry/dispatch is not promised.

## Admitted supplemental instructions amendment

The core event transaction now stores each admitted supplement as encrypted task-scoped context with this exact closed payload:

```js
{
  contractVersion: 'df.supplement/v1', materialKind: 'current_instruction',
  content, sourceRef, subscriptionRef, eventRef, eventDigest, observedAt, taskRef
}
```

Authenticated data metadata binds the owner/workspace/task, sourceRef, pre-append sourceTaskVersion/sourceAuthEpoch, post-append taskVersion/authEpoch, generationRef null and createdAt. Assembly compares the payload task/source refs with that resolved metadata and current scope, requires sourceTaskVersion=taskVersion−1 and sourceAuthEpoch=authEpoch, and bounds observedAt by createdAt/current observation. It rejects unknown/future contracts, extra fields, mismatched versions/source/task/time/generation. No payload owner/workspace/permission assertion is accepted as identity. These are admitted current instructions, not optional memory or summaries, and provider prose saying approved/completed confers no permission or terminal status.

All admitted supplements remain protected, even with recordRefs:[] or a selection excluding them. They appear in increasing task-version order alongside original goal/latest constraints; no text-based deduplication occurs. A later source disable prevents new admission but does not retroactively erase a current admitted instruction. There is no implicit retraction lifecycle. Protected minimum over byte/token/storage bounds refuses without truncating instructions or persisting a phantom preparation. The prepared envelope includes each supplement's original encrypted recordRef/digest and authenticated source versions, plus a closed nested supplement provenance object retaining sourceRef/subscriptionRef/eventRef/eventDigest/observedAt/taskRef and exact contractVersion. It retains all supplement source refs regardless optional selection. A supplement arriving at preparation commit changes task CAS and rejects the stale prepared record.

Actual encrypted-store tests cover append→prepare→reopen, original goal and multiple supplemental texts, new-ID same-text retention, duplicate receipt/no version or record increase, changed duplicate conflict, stale ingress and preparation CAS, foreign scope read denial, secret rejection before admission with rollback, source disable preservation and protected byte-minimum refusal. Pure module partitions separately exercise malformed authenticated metadata/shape; they do not authenticate a live provider.

## Exact AC-to-test mapping

| Source AC | Meaningful module oracle | Actual-store/native remainder |
| --- | --- | --- |
| BUB007-03 | Trusted workspace/opaque handle test, identical-query foreign namespace exclusion, list metadata only, host-write and worker denial, empty default/no import; actual encrypted foreign-scope exclusion and reopen. | Native owner/model facade and final isolation regression remain pending. |
| BUB007-04 | Read/write exceptions visibly fail with stable codes; no phantom saved state; malformed/future/oversize projection rejection; complete UTF-8 N−1/N/N+1 boundary; actual precommit rollback and abrupt process exit before commit/after acknowledgement with reopened receipt/state. | Native failure display/recovery and final crash regression remain pending. |
| BUB007-05 | Source/time/confidence/fact revision preserved; correction/deletion no stale cache/plaintext retrieval; internal IDs/tombstones; explicit pinned migration; secret/getter/non-index-array rejection before extraction/write; async batch/CAS and historical command replay; actual two-process CAS, ciphertext byte scan, deletion/reopen and known-secret exclusion before injected extraction. | Real configured extractor/source-provider behavior and source-to-native migration/UI oracles remain unexecuted. |
| BUB007-06 | Memory allegations of approved/completed cannot change ledger; projectContext uses current task/instructions; actual encrypted prepared context preserves front/middle/end constraints/source facts, full-envelope digest, source versions and post-write CAS; actual task/memory commit races reject. | Native current-model input isolation and UI contradiction verification remain final debt. No actual approvals or terminal states are taken from memory. |
| BUB008 memory integration | Existing ContextAssembler and whole-record compactor; protected-minimum refusal; real encrypted complete-context65535/65536 acceptance and65537 refusal including escaping; old-envelope validation/no recursion; injected-token boundaries and prepared-write rollback/reopen. | Actual selected-model tokenizer/assembled model request, native scoped material flow and full functional/visual regression remain unpassed. |
| BUB002-01/02 and BUB008-01..05 supplement integration | Actual event append/new-ID same-text/duplicate CAS, latest protected instructions and original goal/provenance through prepared encrypted reopen; source/foreign-scope exclusion; stale preparation and minimum refusal; no prose approval/completion authority. | Provider-neutral native intake bridge, actual assembled selected-model input isolation/token limits, host freshness and final functional/visual acceptance remain pending. This narrow amendment does not replace the other source-AC oracles. |

## Commands and current results

Node22.22.2. Current `node --test test/memory.test.mjs test/context.test.mjs test/coordinator.test.mjs`:61 PASS,0 failures/cancelled/skips,53 top-level plus8 nested tests. `test/memory.test.mjs` contributes34, `test/context.test.mjs`13 and retained coordinator regression14. All actual-store cases activate with current schema4 core; no fake typed-store test is counted as encrypted-core evidence. Crash fixtures exit73 deliberately before commit and immediately after the adapter acknowledgement, without calling close; subsequent real encrypted reopen proves both persistence cuts. Prepared-context fault injection rolls back task/version/data and successfully retries after reopen. No author installs, Git changes, source-provider setup or native host launch were performed. Separate independent code and ISTQB review were requested for these integration changes; verdicts and exact final hashes follow the coherent freeze.

Historical pre-supplement freeze: the same command passed57 cases with0 failures/skips. Source/test SHA256 at that freeze: memory `dba915b9f3c2a76ef05cce50611a553ecb792e896b7095b70e7491a9cae72a01`; context `8c38f2d0d8e30933a35012e436afa65d89c58e00b01517bb5646e85115c40ab5`; memory tests `ab89e8b763f4a6edb6628cd4dad9604bc7c2b9b7706de00d91b106a6844709d5`; context tests `35209445079eb474a0733fd675d482ac683ed042b70da28357c22701edb20699`. Its evidence hash was `963f3343f78d12a9f2f4af8488605fd5d760d67da5ffd4e8327364f77f97b743`. Those are preserved historical results, not the amended reviewed tree.

S3-MEM-CR01 remediation requires a complete persisted native core object and uses undefined-only absence for intentional new construction. Exact digest-correct core:null, false and0 partitions reject both read and write, with no new persistence; their regression passes.

Owner-authorized MIT covers current owner-authored ESM code; publication remains conditional on full agreed acceptance. The bounded complete reused-path contributor check found only owner-identity matches and AI trailers, with no concrete third-party contributor/license conflict. Both upstream READMEs declare MIT while tracked root LICENSE is absent. Root coordinates the owner's df-project MIT notice and packaging; no blanket blocker is inferred solely from the absent upstream file, and no rights claim is made for the unincorporated whole application/dependencies. Kotlin/JS compilation and full source portability are not claimed.
