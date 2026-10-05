# Source-derived prepared context: candidate typed API

Status: **DOCS ONLY; exact API proposal pending root/core/independent freeze. NO SOURCE7, IMPORT, DB OR TEST GO.** Binds root [schema7 addendum](continuity-schema7-addendum.md), corrected [controls API](continuity-controls-api-addendum.md) and [continuity design](continuity-independent-design.md), without editing them. Preserve original df.execution-context/v1 content, dataDigest, task increment, source/AAD semantics and enriched normal receipt. This document defines private source seams; none is an owner payload proof or an implemented API claim. CODE/browser/useful-model/full AC/MVP/publication remain HOLD.

## 1. Actual baseline and capability issuance

Actual MemoryAdapter.prepareExecutionContext validates the original closed request, assembles/retrieves first, then writes original putData(kind=context), validates its metadata and enriches the public receipt from its envelope. Actual ContextAssembler validates original scoped encrypted sources, protects current goal/constraints/admitted instructions/work facts/clarification, excludes stale summaries, compacts optional background and rechecks task after callbacks. It currently returns no complete examined-summary observation; the adapter discards the transient conflicts from the persisted receipt. Those gaps require source work; adding a caller label or inspecting a decoded body does not close them.

Core assessed this proposed constructor-only addition coherent:

```text
RuntimeStore constructor optional preparationPrincipals:
 [{capability,ownerHandle,namespaceRef}]  // EXACT entry fields
```

The optional preparationPrincipals array has at most64 unique entries, with own enumerable data descriptors and no sparse/Proxy/accessor entries, matching the existing trusted principal capacity. Normal installation uses one entry for its fixed namespace; this technical constructor cap is not an owner memory policy. capability is a unique non-Proxy opaque object created by trusted runtime composition, with no serialized fields and no ordinary role attached. ownerHandle must already be bound in this SAME store's existing principals. Core can support actual owner/coordinator scope principals; the normal installed composition supplies its actual private owner handle. namespaceRef is the exact already-verified private NI1 binding, copied immutably. Duplicate capability, unbound/foreign/wrong-role handle, Proxy or invalid namespace refuses constructor configuration. No new owner-entered namespace, public mint method, generic host role or callback Config issues a capability. Normal runtime privately gives that exact capability only to the actual same-store MemoryAdapter/ContextAssembler preparation composition. Disabled memory creates no capability/preparation work.

Core derives stable descriptor `preparationPrincipalRef=H(['df.prepared-context.principal/v1',ownerRef,workspaceRef,namespaceRef])`; object identity is NOT serialized or hashed as authority. The descriptor cannot recreate the capability. Reopen may privately bind a fresh object to the same verified scope/namespace and original descriptor; it cannot restore a live NI2 prepared-input permit. Capability is accepted only by these narrow typed methods, never generic plan/grant/claim/control or #ctx role minting. Actual native admitted operator, current invocation carrier and lifecycle/signal guard still precede every external operation/read/write.

This issuer is a **core-agreed proposal**, not current constructor syntax. Exact public constructor source/optional API must be included in the coherent schema7 freeze. Any alternative issuer must preserve these same private scope/source constraints and receive root/core/independent agreement before source implementation.

## 2. Immutable original request and early lookup

Request EXACT required fields `{taskRef,commandRef,expectedTaskVersion,expectedAuthEpoch,terms,now}` plus optional `{recordRefs,vectors,limit}`. No generationRef/confidence/sourceScope/namespace/handle/capability/proof/observer/output field is permitted. Original domains remain: lowercase hex64 refs; task version≥1/auth epoch≥0/now≥0 safe integers; terms≤32 secret-checked strings each≤8192UTF-8 bytes; recordRefs≤64 with original accepted order/duplicates; vectors≤32 finite Float32-compatible arrays (normal transport remains array128 at each level); optional limit integer0..32. Terms may be empty, vectors/recordRefs may explicitly be empty. Preserve absence versus explicit values; supplied undefined, sparse/accessor/hidden/symbol/Proxy/custom-prototype inputs refuse. Normal finite-vector transport admits safe integers or finite nonintegral components; unsafe integral/nonfinite components refuse without weakening generic authority canonicalization. now is the existing explicit retrieval-time input, not native approval/expiry/current server-time proof.

Detach/freeze the complete request before hashing or awaiting. Enforce original whole request65536/depth12/object64 and source/domain/secret admission without invoking the tokenizer, memory retrieval or source resolver. Canonical request hashing uses the existing MemoryAdapter finite numeric encoding and exact optional-field meaning:

```text
preparationRequestDigest = H(['df.prepared-context.request/v1',
 ownerRef,workspaceRef,namespaceRef,preparationPrincipalRef,
 'putPreparedContext',request])

preparedContextCommandReceipt(capability,{request})
 -> {receipt,checkRef} | null
```

Lookup validates current capability/owner read permission, complete immutable request/domain/digest, authentic command policy/receipt and full mandatory prepared graph. It runs BEFORE assembler, tokenizer, current-memory lookup/retrieval, summary/source reads, host query or native/model work. Reading the command/associated original context/check ciphertext for historical reconstruction is allowed; reading current source/memory state to decide whether to reconstruct is not. It performs no write or current task-version CAS that would reject an otherwise valid identical historical receipt. Task scope/read permission is still real; no foreign or unbound task is authorized by a command hash.

Valid absent command returns null; changed request/operation/principal/private namespace/task collision returns IDEMPOTENCY_CONFLICT, without assembly. Exact authentic historical command returns its original enriched receipt and checkRef even after later task/memory/source changes or permanent namespace tombstone. Null is not a no-effect proof after uncertainty and never triggers automatic replay. The original MemoryAdapter prepare method currently lacks this early seam; it must be added before #assemble, not after a fresh tokenizer/namespace read. A historical result cannot mint current prepared origin.

## 3. Literal atomic input and actual private observation

Proposed exact private commit call, refining the held ref/disposition arguments with immutable request and observation:

```text
putPreparedContext(capability,
 {taskRef,commandRef,expectedTaskVersion,expectedAuthEpoch,
  expectedMemory,content,sourceRef,summaryChecks,request,observation})
 -> {receipt,checkRef,commitDisposition:'new'|'historical'}

expectedMemory EXACT {namespaceRef,revision}
summaryChecks rows EXACT {recordRef,disposition}
```

All ten input fields are required. The four task/command/CAS fields exactly equal request. expectedMemory is the actual current retrieved namespace/revision, privately bound; revision0 means genuine absence, never tombstone. content is the exact ORIGINAL JSON.stringify execution-context envelope bytes produced by the adapter, not a canonical rewrite. sourceRef preserves its exact original recipe `SHA256(JSON.stringify({sourceScope,sourceTaskVersion,sourceAuthEpoch,sourceRefs,expectedMemory}))` and object-key order. No caller supplies a finished check, winning version, source metadata, receipt, preparationPrincipalRef or new-commit claim. Core recomputes those from its private binding and authenticated rows.

summaryChecks contains distinct deterministically sorted actual examined-summary refs, at most64. disposition is retained_background/dropped_for_budget/excluded_stale_summary. It is an actual source observation, not owner classification. Proposed observation EXACT:

```text
{contractVersion:'df.preparation-observation/v1',sourceScope,
 sourceTaskVersion,sourceAuthEpoch,generatedAt,ledgerSnapshotDigest,
 selectionMode,examinedSummaryRefs,winningSourceRefs,
 retainedRefs,droppedRefs,inputCounts}

sourceScope EXACT {ownerRef,workspaceRef,taskRef}
inputCounts EXACT {bytes,tokens}
```

All twelve observation fields are required. source task/auth/generatedAt/ledger digest/counts/retained+dropped exactly match the unchanged assembled envelope. generatedAt is the adapter's actual revalidated snapshot observedAt, not request.now or a newly fabricated lookup date. selectionMode is all_eligible iff original request omits recordRefs, otherwise explicit_records. examinedSummaryRefs and winningSourceRefs are distinct sorted hex64 lists≤64; summaryChecks refs equal examinedSummaryRefs exactly. Winning refs derive actual latest goal/constraints and all admitted current_instruction/df.supplement source branches; clarification/host_snapshot are not relabelled instructions. retained/dropped preserve the final original envelope's exact order, each≤64 and disjoint. inputCounts.bytes is actual UTF-8 content-text count (not outer envelope length); tokens is the actual integer heuristic count already measured. No tokenizer callback runs under lock.

The actual assembler must collect these private examined/winner observations in the same source-reading/compaction path that produced text. It cannot reconstruct a supposedly performed check by reparsing owner JSON or merely calling public assemble() and guessing missing summaries from retainedRefs. MemoryAdapter forwards the exact observation and actual summary disposition from that path, including stale exclusions and budget drops; its second memory-background/envelope compaction supplies final retained/dropped/counts without changing source-selection observations. **Exact cross-class private observation delivery/identity remains a joint MemoryAdapter/ContextAssembler author source seam to freeze; this literal does not invent an already-exported assembler method or callback.** Raw observation is never accepted by owner RPC or diagnostic exports; capability comes from the actual private composition.

Under the original ledger lock, core checks complete graph first; authenticates original command branch; rechecks task/auth/control/execution eligibility, private scope/expectedMemory, actual source bytes/crypto2 metadata/source versions/generated dates/ref availability, complete winning source set and actual eligible summary-set rule. Recompute original work-facts ledgerSnapshotDigest from the same precommit authoritative snapshot/key ordering. Compare observed refs and envelope provenance/dispositions to those facts. Derive summary versions/digests/sourceRefs and stale subset; only actual budget retention/drop is an observation supplied by the trusted assembler. Do not call callbacks, tokenizer, host/native/model, public nested transaction methods or asynchronous code under lock. Validate source row kinds and exact admitted supplement branch; exclude derived audit inputs, protected execution_context and context_check from ordinary summary background according to the actual source rules.

Command identity is the complete original request/preparation principal/operation binding, not a fresh assembly timestamp or derived body. In a concurrent historical branch, source-generated observation/content/CAS drift cannot silently replace the original graph; validate the original signed request binding and return it without a new write. The exact stable command-digest recipe must be frozen by core, rather than reusing generic #mut on the entire volatile request/observation bundle. First commit advances task version and semantic revision ONCE, auth unchanged, status unchanged except existing original progress semantics. Writes original context plus encrypted full check plus constant signed association plus registry membership plus original signed command receipt atomically. Reject capacity/CAS/source mismatch before any joint commit. No separately staged context, second semantic bump or compensating erase. Original context metadata/source versions, generation:null, memory guard, crypto2/AAD/digest/content/createdAt semantics remain. New context_check uses its exact new kind's own existing data-ID/AAD recipe, not a context AAD marker. Original old ciphertext and command results are not resealed.

## 4. New versus historical commit and private origin

commitDisposition is derived only from the actual original transaction's branch: new means this call committed the new exact composite; historical means that exact command already existed, including another process winning AFTER the early lookup missed. No check of optional deduplicated, result presence, receipt equality or task revision can substitute. Both dispositions return the unchanged authenticated enriched receipt/checkRef. A historical final transaction branch validates the complete same request/principal/graph before returning; it does not rebuild a check with new assembly observations or perform another write.

The discriminator is a process-private return field, NOT an owner wire input/output, durable receipt field, Config fact or source-class label. It need not be stored/resealed. No callback is invoked inside the transaction. The trusted composer consumes the returned result after the transaction, with current invocation/lifecycle/source fences. Only the actual new disposition is eligible for a private current preparation-origin observation, and even it must satisfy current task/semantic/memory/source facts; another change after commit can invalidate it. Historical lookup/final replay returns an acknowledgement and may idempotently clear caches; it never creates a live origin, grant, preview permit or execution authority.

The original successful fanout `{operation:'prepareContext',input,receipt}` stays detached/frozen and the wire still extracts receipt only. **A separate privately bound new-commit observer must consume the source result, not the generic historical receipt fanout.** Proposed private observer data is EXACT `{input,receipt,checkRef,commitDisposition}` supplied only by the actual adapter's returned commit result. Normal payload cannot set it. Observer registration/delivery ownership must be coordinated with the primary runtime composer in its exact source freeze; no guessed shared installer field is added here. Primary author agrees this branch is compatible; current schema4 fanout remains historical until separately frozen integration. A postcommit observer/reply failure is uncertain acknowledgement and preserves the graph; no erase/re-execute. Clearing-only memory onMutation remains distinct and may run for every successful historical/new memory acknowledgement, without an exactly-one promise.

## 5. Exact original enriched receipt and replay reconstruction

receipt EXACT required fields:

```text
{recordRef,digest,kind:'context',byteLength,cryptoVersion:2,sourceRef,task,
 sourceTaskVersion,sourceAuthEpoch,memory,inputCounts,
 retainedRefs,droppedRefs,verification:'module_prepared_execution_context_only'}

task EXACT {ownerRef,workspaceRef,taskRef,status,version,taskVersion,
 authEpoch,createdAt,updatedAt}
memory EXACT {namespaceRef,revision}
inputCounts EXACT {bytes,tokens}
```

All fourteen outer fields are required; do not append checkRef, commitDisposition, conflicts, preparationPrincipalRef or deduplicated to this established wire shape. task.version equals task.taskVersion; it is the exact ORIGINAL signed postcommit task snapshot, not current task/read status. sourceTaskVersion remains the original precommit version and sourceAuthEpoch the original epoch. byteLength hashes/counts the complete exact encrypted envelope bytes; inputCounts describes the envelope's inner content. Memory/read refs are readonly source-derived descriptors, not caller-selected namespace authority.

Original signed store context receipt remains its existing metadata plus original task: `{recordRef,digest,kind,sourceRef,taskVersion,authEpoch,generationRef,createdAt,byteLength,cryptoVersion,sourceTaskVersion,sourceAuthEpoch,semanticRevision,memoryNamespaceRef,memoryRevision,task}`. New operation/principal discriminator is distinct, but the receipt's original data fields/meaning are not changed. Core authenticates this command result, scoped context metadata/AAD/digest and full associated check. For reconstruction, take raw record/digest/kind/byteLength/crypto/sourceRef/task/source versions from that original signed result; take memory/inputCounts/retained+dropped/verification from the ORIGINAL authenticated execution-context envelope. Compare every duplicated field to exact constant/full check and context metadata. Return detached/frozen enrichment exactly as the current adapter does, with no current memory projection, source row read, assembly/tokenizer/host callback or native work. Never substitute association committed versions for a fresh task snapshot or regenerate counts/time.

If an authoritative lookup finds the command but its check/context/registry/receipt is missing/mismatched, return STORAGE_INVALID, not null/unavailable or a generic putData adoption. Pre7/advanced generic contexts cannot get a check by reconstructing their shape. A well-formed changed request conflicts before fresh assembly. A corrupt authenticated-context envelope/receipt is storage failure during historical reconstruction, not a fresh domain refusal. Prepared old command replay remains historical even if the current task/source/memory still happens to match.

## 6. Closed persisted rows and registry

Canonical encrypted full check is EXACT24 fields:

```text
{contractVersion:'df.prepared-context-check/v1',checkRef,taskRef,
 contextRecordRef,contextDigest,sourceTaskVersion,sourceAuthEpoch,
 committedTaskVersion,committedAuthEpoch,semanticRevision,generatedAt,
 ledgerSnapshotDigest,memory:{namespaceRef,revision},
 method:'version-currentness/v1',winningSources,summaryChecks,conflicts,
 ownerRef,workspaceRef,commandRef,preparationPrincipalRef,
 preparationRequestDigest,selectionMode,checkedSetDigest}

winningSources row EXACT {recordRef,digest,kind}
 kind = goal|constraints|current_instruction
summaryChecks row EXACT {recordRef,digest,sourceTaskVersion,sourceAuthEpoch,
 generatedAt,sourceRefs,disposition}
conflicts row EXACT {recordRef,reason:'stale_summary',winningTaskVersion,
 winningAuthEpoch}
```

Rows distinct and deterministically sorted, each list≤64. Summary sourceRefs retain original ordered1..16 refs, including duplicates accepted by that source schema. Whole source digest/authenticated scope is exact. conflicts is the stale-summary subset only, with actual precommit task/auth winning values. Same-version contradictory prose is not detected by this method. Memory candidate conflicts/verification prompts are not silently converted into summary checks or approval evidence. All refs/digests hex64, dates/versions/counts integers; plaintext/prose/key/path is absent.

Constant signed prepared_context_check is EXACT21 fields:

```text
{contractVersion:'df.prepared-context-binding/v1',checkRef,taskRef,
 contextRecordRef,contextDigest,checkRecordRef,checkDigest,commandRef,
 preparationPrincipalRef,preparationRequestDigest,selectionMode,
 checkedSetDigest,sourceTaskVersion,sourceAuthEpoch,committedTaskVersion,
 committedAuthEpoch,semanticRevision,generatedAt,namespaceRef,memoryRevision,
 method:'version-currentness/v1'}
```

Owner/workspace are its original authenticated row scope. checkDigest hashes the complete canonical encrypted full material. `checkRef=H(['df.prepared-context.check/v1',ownerRef,workspaceRef,taskRef,contextRecordRef,contextDigest])`; context/check data record IDs use the existing same-command kind-specific recipe. Registry kind prepared_context_registry, id=workspaceRef, task:null, payload EXACT `{contractVersion:'df.prepared-context-registry/v1',recordCount,recordDigest}`. Sorted scoped members EXACT `{taskRef,contextRecordRef,contextDigest,checkRef}`. Mandatory signed zero registry cannot be invented on boot/status; migration/first admitted scoped mutation establishes it.

Validate command putPreparedContext/private principal→one context/check/association/member, and all reverse links including scan of all signed preparation commands, before open/read/mutation/recovery. Missing stripped/recomputed or extra nodes refuse; generic putData cannot mint context_check or association/registry. Legitimate missing historical source affects currentness, not the integrity of the original historical association; a missing associated context/check/command/member is corruption. Native registry remains exactly six kinds and is validated separately along with mandatory schema6 registries. No arbitrary external writer or whole-database rollback immunity is claimed.

## 7. Historical reads, absence and failure precedence

```text
readPreparedContextCheck(ownerHandle,
 {taskRef,contextRecordRef,expectedTaskVersion,expectedAuthEpoch})
 -> {check,currentness}

currentness EXACT {instructionsCurrent,memoryCurrent,
 taskSnapshotCurrent,reasonCodes}

readMemoryCommand(ownerHandle,{namespaceRef,commandRef})
 -> original signed putMemory/deleteMemory metadata receipt | null
```

The normal boundary privately derives namespace and accepts only commandRef for memoryCommandStatus. Both methods use current actual owner scope, no worker/reviewer/host/model read handle. Context currentness booleans are literal; unique sorted reasons drawn exactly from SEMANTIC_CHANGED/WINNING_SOURCE_CHANGED/CHECKED_SET_CHANGED/SOURCE_UNAVAILABLE/MEMORY_CHANGED/TASK_SNAPSHOT_CHANGED, at most6. Read exact current task/auth CAS before/after any await; no write. Semantic matches actual postcommit semantic, protected winning identities/digests and declared checked-set predicate; memory matches the exact namespace/revision/state, including revision0 still truly absent; task snapshot matches original committed task/auth. Later auth/grant change can affect only taskSnapshotCurrent without automatically reinterpreting instructions. Tombstone is never absence. Selected/all-eligible fingerprint rules preserve root7ccf; a legitimate removed source leaves historical facts readable with SOURCE_UNAVAILABLE/false currentness, not a rewritten check. Actual unauthenticated/corrupt current source is storage failure, not trustworthy missing-source drift.

Failure precedence, not a new public fact oracle:

1. Existing external native admission/invocation/lifetime/signal denial wins: OPERATOR_REQUIRED/SERVICE_DISPOSED/REQUEST_ABORTED. Core cannot bless a dead carrier from a capability hash.
2. Core rejects invalid/unbound/wrong-store capability/owner scope as UNAUTHORIZED. Pure malformed typed request/input is INVALID_INPUT; original adapter normal domain admission projects its existing MEMORY_INVALID/CONTEXT_INVALID/SECRET_REJECTED before callbacks. Private observation cannot be owner input. No exception prose is echoed.
3. Existing key/schema/crypto/complete graph/receipt corruption refuses with actual KEY_MISMATCH/STORAGE_UNSUPPORTED/SCHEMA_FUTURE/STORAGE_INVALID. Signed corruption is not an absent command/check or a changed-intent conflict.
4. Early preparation lookup: identical command returns historical receipt/checkRef, changed operation/request/principal/scope/task returns IDEMPOTENCY_CONFLICT, valid absent command returns null; no new task/version CAS or current-memory/source read precedes historical success. Scope read permission remains required.
5. Genuine new put checks existing exact CAS/control/memory/source/capacity: STALE_VERSION/STALE_AUTHORITY/STALE_MEMORY/EXECUTION_BLOCKED/SOURCE_UNAVAILABLE/CONTEXT_INVALID/SECRET_REJECTED/INPUT_TOO_LARGE/CONTEXT_LIMIT/CONTEXT_PREPARATION_LIMIT/RECORD_LIMIT/COMMAND_LIMIT as the actual frozen core boundary emits. Original adapter guarded COMMAND_LIMIT is MEMORY_UNAVAILABLE, not invented COMMAND_CAPACITY. A known rollback code is not a claim about an unrelated external effect; unknown after entered commit/reply is CONTEXT_UNCERTAIN.
6. readPreparedContextCheck: missing scoped task TASK_NOT_FOUND; stale requested current CAS STALE_VERSION/STALE_AUTHORITY. A requested unknown/mismatched scoped record is SOURCE_UNAVAILABLE. A present legitimate generic/pre7 context with no normal preparation discriminator is CONTEXT_CHECK_UNAVAILABLE, never retroactively checked. A signed normal command/registry/member implying missing association/context/check is STORAGE_INVALID. Otherwise return the immutable full check and exact currentness; false currentness is not an error/permission.
7. readMemoryCommand: valid absent owned command null; same-owned-scope nonmemory/other-namespace collision IDEMPOTENCY_CONFLICT; valid signed original receipt success, without current memory body retrieval or resurrection. Foreign owner/workspace rows cannot leak or become a same-scope receipt. Original #ctx authorization/error projection remains.

Public normal helper maps only actual typed-source finite codes to `{ok:false,error:{code,message:code,details:{}}}`. It never reads arbitrary callback getter/prose. Newly proposed context additions are CONTEXT_CHECK_UNAVAILABLE, the three literal CONTEXT_PREPARATION_* codes in section8, and preservation of CONTEXT_UNCERTAIN; exact bridge allowlist/mapping of core INVALID_INPUT→normal adapter domain code must be frozen by shared owners, not silently widened here. Unclassified precommit source failure is CONTEXT_UNAVAILABLE, unclassified entered-write/receipt/observer failure CONTEXT_UNCERTAIN; native denial still wins but implies uncertain acknowledgement after a possible commit. No saved/denied/rolled-back field, absence-as-success or automatic retry. readMemoryCommand inherits the controls taxonomy. Currentness reasons are not error codes, grants or settlement proofs.

## 8. Joint bounds, literal readiness and freeze gates

Apply every existing selected lower limit plus technical ceilings: full canonical context_check≤49152UTF-8 bytes, constant metadata≤4096, original context≤65536 and actual selected maxDataBytes, whole success request/preview/check-read envelope≤65536. Before any commit preflight complete `{ok:true,value:{check,currentness}}` with the finite worst-case six reasons, and original enriched receipt. Refuse if either record/receipt/metadata/wire joint limit fails. No truncation, extra unlimited route, wider namespace/context limit or repeated read callback. Enforce original data-record/command/automation aggregate capacities and held reconciliation reserves for TWO data rows/one association/registry member/one command; no recursive public transaction or hidden extra task increment. Valid zero examined summaries still has a complete authentic association.

**Concrete current default constraint:** a docs-only compact JSON size calculation of the exact21-field constant with64-character refs and minimum valid integers yields1187bytes, already above current normal memory-only maxMetadataBytes1024. Current worker-enabled config explicitly requires4096. Root resolved this policy: preserve base1024 and all existing selected lower limits, no implicit widening or new Config flag. Existing read/remember and eight controls remain available within their valid selected bounds. Required preparation refuses the entire graph if the exact metadata does not fit. Usable normal-composition examples explicitly select the existing limits.maxMetadataBytes4096 before setup consent; worker-enabled already requires it. No statement that every memory-enabled config is preparation-ready is allowed. This is literal size algebra, not a product test. New facade mounting/correction/import alone does not require a schema bump; the durable graph does.

Proposed additional owner closure/route `contextPreparationStatus({})` is separate from the eight controls and preserves the original /df-setup/features envelope. Its exact response is `{phase,reasonCode,configured,ready,bounds}`. phase is disabled/unavailable/limited/ready; configured/ready are literal booleans. Disabled memory returns disabled/CONTEXT_PREPARATION_DISABLED/false/false/null without a preparation capability or estimator activation. Missing actual admitted child, issuer or verified schema7 writer/read seams returns unavailable/CONTEXT_PREPARATION_UNAVAILABLE/false/false/null, without fabricated readiness. An actual current issued composition for which the source-owned complete legal-graph feasibility check cannot fit the selected metadata returns limited/CONTEXT_PREPARATION_LIMIT/true/false with its actual bounds. Actual current composition satisfying that full feasibility check returns ready/null/true/true with bounds. ready means the feature can attempt complete per-request preflight, not a promise any requested context/source set/CAS or Cartesian maximum fits. Runtime lifecycle/invocation denies stale status rather than retaining readiness after unload.

bounds EXACT `{contextByteLimit,checkByteLimit,metadataByteLimit,wireByteLimit,minBindingBytes}`; derive contextByteLimit from min(65536,actual selected maxDataBytes), checkByteLimit from min(49152,actual selected maxDataBytes), metadataByteLimit from min(4096,actual selected maxMetadataBytes), wireByteLimit65536; minBindingBytes is the actual source-computed minimum required selected metadata capacity for a reachable complete legal graph under ORIGINAL #check/signature/command wrapper rules, not a fixed1187 payload threshold. Source must evaluate the full automation {version:1,data,mac} envelope, data metadata, stable command binding, original command result and command-receipt wrapper (whose original cap allows the documented extra512), registry and applicable selected limits without writes/callbacks. The1187 payload arithmetic proves1024 is insufficient only; it does not prove whole signed metadata fit or a ready status at1187. Exact pure source feasibility implementation requires core/independent agreement before freeze. Actual large versions/dates/selection/full material still undergo per-request joint preflight. The private proposed `preparedContextStatus(capability,{})` can supply verified issued-source/selected bounds after graph authentication without memory/source/tokenizer reads or writes; exact issuer/source/complete feasibility implementation remains a core freeze prerequisite. Normal disabled/unavailable closure construction cannot manufacture a capability just to query it.

Proposed finite new public codes are **CONTEXT_PREPARATION_DISABLED, CONTEXT_PREPARATION_UNAVAILABLE, CONTEXT_PREPARATION_LIMIT**. New typed graph/metadata/read-wire joint preflight returns CONTEXT_PREPARATION_LIMIT from the actual named source boundary, with no partial context/check/receipt. Original protected content/token-budget failures remain CONTEXT_LIMIT, not relabelled graph capacity. A currentness drift uses the separate six reason codes, never a preparation status. Exact shared bridge/code projection requires root/core/independent freeze before source GO. Local UI messages derive solely from these codes: disabled asks for explicit memory selection; unavailable says required preparation source is unavailable; limit explains plainly that context checks need a larger configured record limit, with a documentation link for explicit existing limits.maxMetadataBytes4096 before setup consent. Product text does not show schema/registry/signature internals. UI neither chooses it, mutates configuration, truncates context/check nor confirms setup automatically. Client loading/error/disconnect responses cannot fabricate ready. No browser or UI test is implied.

An illustrative declarative fragment is `limits:{maxMetadataBytes:4096}` alongside the owner's explicit existing enabled memory bounds; it is not a complete profile, credential/identity input, new policy default or proof every full check fits. Keep setup key/vault/HMAC and existing data unchanged on lawful reload. Readiness/limit status cannot create a namespace, registry, command or migration merely to appear ready.

Freeze prerequisites: exact constructor issuer optional syntax and private class observation delivery; actual normal reconstruction/store receipt split; private transaction-derived new/historical result and observer ownership; whole source/CAS/currentness rules and finite public errors; resolved explicit metadata-limit policy plus exact readiness/code/source projection; coherent genuine6→7 both graphs/capacities/migration backup/inverses; independent exact API binding. Preserve source5/6/candidate7 observations, original cipher/AAD/action/grant/receipt/history and no old origin/check adoption/reseal. Old6 SCHEMA_FUTURE before write/recovery; legitimate migration adds authentic zero prepared registry. New7 verifies complete graphs before recovery, unknown work held with0native calls. No implementation-ready source/migration/test or acceptance result is inferred from this document.
