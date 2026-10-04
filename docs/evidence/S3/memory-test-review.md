# Stage3 independent memory/context test review

Reviewer `/root/istqb_review`, Sol6.1/max, independent of the memory/core/coordinator authors and correctness reviewer. **PASS for the held local module checkpoint; HOLD for whole-ticket and consolidated acceptance.** No global Stage3 committed freeze has been supplied. This report extends the [source-AC plan](test-design.md) and [pinned-port review](fishball-test-review.md); it does not claim Kotlin/JS compilation, whole Fishball reuse, personal-data import, real model behavior or browser evidence.

## Executed checkpoint

Actual Node22.22.2. The independent command was:

```sh
node --test test/automation-adversarial.test.mjs test/automation-store.test.mjs test/memory.test.mjs test/context.test.mjs test/coordinator.test.mjs test/audit.test.mjs test/notifications.test.mjs
```

Expected: every selected test passes, no API-unavailable skip, immutable acknowledged facts survive reopen, and denied writes leave no partial projection/context/receipt. Actual: **169 PASS,0 FAIL,0 SKIP**,30081.701959ms. Breakdown:34 independent adversarial,15 core automation,61 memory/context/coordinator,36 audit,23 notification. This is one run, not169 memory tests. Sixteen selected source/test hashes matched before/after. TAP `/tmp/df-istqb-S3-core-held.tap`, SHA256 `d3ad330dfb907560731f0b839c81dcc0b80ea97c8f05e7872c248cc9382abe91`; hash list `/tmp/df-istqb-S3-core-held-before.sha256`, SHA256 `08cbeef1d01082a9f078cee5da46dc882aab55ff20d84683592a83dfa8f5a163`.

| File | Held SHA256 |
| --- | --- |
| src/runtime-store.mjs |63dbc100d4dfa4fa42db31003c84a7925de025dd66af08f5bae589a4e8e7e850|
| src/ledger.mjs |64cc42e1a834701263c260f311d05d113c6e34af67017901cfd7a95f22c9b650|
| src/memory.mjs |dba915b9f3c2a76ef05cce50611a553ecb792e896b7095b70e7491a9cae72a01|
| src/context.mjs |e2837f8ef709a09e928c49e8fa14ee4f34e6776ad2b6ab0ca598ab53b3a9525c|
| test/memory.test.mjs |0ea938dd1fbe179922bc3115f75970902ffddbc69366ef4237cee7b0af302d68|
| test/context.test.mjs |dce8ec648405579ea402e6d3d3d6e64e6d62699c798bd7db72b331d676347c42|
| test/automation-adversarial.test.mjs |f42a7ab100dfcc5ff02ff82e6ab6f3b76971aeb35c832e123b25303042cb09a9|

The earlier97-case memory/context/coordinator/audit run and47-case automation run passed but RuntimeStore changed4add1eac…→35b186c5… during them. They remain provisional historical diagnostics. The held169-case retest above is the stable-file checkpoint; it is still not a committed whole-product freeze.

## Risk-based actual oracles

| Partition/risk | Exact test evidence and expected/actual |
| --- | --- |
| Private namespace identity |Independent `exact private owner/workspace identity, raw/ref and generation roles remain isolated`: identical namespace references in foreign owner/workspace have separate facts/capacity; forged/JSON/worker/reviewer handles deny. Stored refs are not rehashed. PASS. |
| Correction/deletion/ID and historical replay |Author `actual encrypted RuntimeStore memory isolation/reopen…` plus independent `old command receipts replay exactly after new revisions and tombstones…`: revision1 receipt still returns1 after live2 and tombstone3; no resurrection or reused internally allocated fact ID; current reads remain deleted. PASS. |
| Full byte/provenance/count bounds |Independent `complete4MiB UTF-8 N-1/N/N+1…`, source-list16/17/duplicate/sparse, namespaces15/16/17 and retained tombstone capacity. Author complete projection and execution JSON65535/65536/65537 include escaping/punctuation. Accepted N and refused N+1 retain task/projection/receipt state. PASS. No independent aggregate64MiB throughput/load claim. |
| Encryption and immutable metadata |Independent nine workspace-metadata edits reject live read/list and reopen with exact file bytes/presence. Registered plaintext/key canaries remain absent from stored files; task data crypto2 provenance is authenticated before role access. PASS. |
| Receipt integrity |Independent `current command receipts…` exercises nine complete-row/result/MAC mutations; exact historical lookup rejects STORAGE_INVALID while the untouched live namespace remains correct. The original code-review revision999 counterexample is not claimed as this lane's discovery. PASS after keyed-envelope remediation. |
| Actual process/fault causality |Independent OS-process memory CAS has one committed winner, loser STALE_MEMORY, and a third-process exact readback. Author actual precommit/postack abrupt exits, rollback and healthy reopen distinguish unsaved memory from an acknowledged immutable receipt. PASS. No in-memory double is credited as a process test. |
| Optional memory versus current authority |Independent prepared-context test decrypts the complete envelope, checks whole SHA256, current goal/constraints and memory revision/provenance, and proves no approval/completion comes from a remembered assertion. Author contradictory memory, whole-record trimming and protected minimum refusal execute. PASS. |
| Absence/live/tombstone concurrency |Independent atomic context-memory guard covers absent0, live1, stale1 after2, deleted and tombstone-as-absence. Refusal leaves the whole snapshot unchanged. Author asynchronous preparation races against create/correct/delete/task changes. PASS. |
| Admitted supplemental instructions |Author actual new-event append, same-ID dedup, changed digest, new-ID same text, stale/CAS ingress, preparation-race and disable-after-admission cases pass. All admitted supplement texts remain protected even with recordRefs:[]; original goal/constraints and encrypted source/event/time provenance remain. No retract policy is inferred. |
| Secrets/UTF-8/hostile callbacks |Independent secret/lone-surrogate/source descriptor cases reject before write; author extraction rejects known canary before extractor invocation and captures immutable source/CAS across await. Zero proxy/getter traps and stable errors; valid scalar/pair strings remain distinct from malformed input. PASS. |
| No envelope recursion |Author complete encrypted preparation/reopen includes `df.execution-context/v1`; prior execution envelopes are validated then excluded, and explicit recursive selection refuses CONTEXT_RECURSION. Prepared module text alone is not native consumption. PASS. |

## Source-AC disposition

| Retained source AC | Local expected/actual evidence | Remaining applicable oracle |
| --- | --- | --- |
| BUB007-01 |Pinned main/release portability is separately reviewed; actual encrypted adapter and public native session input are covered by this checkpoint and [native review](native-client-test-review.md). |Final native profile/packaging portability, with explicit ESM adaptation and no Kotlin/JS claim. |
| BUB007-02 |Owner MIT and bounded source/contributor provenance are in the retained port/rename reports; no concrete conflicting contributor/notice was identified. |Final package/dependency notice inventory and publication gate. Absence of an upstream root LICENSE alone is not a blanket private-development block. |
| BUB007-03 |Opaque owner/workspace namespace isolation, raw/ref identity, worker/reviewer denial and encrypted reopen PASS. |Final native facade and complete worker input isolation on frozen composition. |
| BUB007-04 |Actual rollback, unknown save, command causality, key/corruption/future/migration refusal and process crash/reopen PASS. |Supported native error display and consolidated fault/profile regression. |
| BUB007-05 |Fresh correction/deletion, sourced confidence/time/revision, internally allocated IDs/tombstones, whole extraction/CAS and no cache authority PASS. |Final UI/source presentation; no real extractor/provider quality is inferred. |
| BUB007-06 |Memory-only assertions cannot grant/complete; current constraints/supplements are protected and stale/conflicting summaries are excluded PASS. |Actual supported UI conflict/verification path and full native adversarial input regression. |
| BUB008-01 |Current task facts after reopen, immutable briefing and no prior-envelope recursion PASS. |Actual complete-stop/restart/alternate session at the consolidated profile gate. |
| BUB008-02 |Exact scope/task/auth/time/source provenance and async task/memory/CAS recheck PASS. |Supported native snapshot freshness/conflict presentation. |
| BUB008-03 |Injected tokenizer and whole UTF-8/serialized envelope N±1 limits PASS. |Actual selected native model/tokenizer context cap; no fixture tokenizer is credited as model-cap evidence. |
| BUB008-04 |Foreign decrypted/assembled canaries deny; deterministic public native input oracle is in the native report. |Full frozen supported native input isolation and browser flow; external models require separate authorization. |
| BUB008-05 |Protected current authority/control/semantic/memory checks and once-only atomic consume races PASS. |Current supported environment/catalog/tool/permission and profile/browser regression. |

Original BUB003/006/011/012 interactions and all other retained AC continue through the61-row design and acceptance-debt register. This checkpoint does not waive them.

## Migration boundary and honest failure history

Schema4 genuinely retains source1/2/3/current4 scenarios. The owned retained fixtures now drop workspace_memory/automation_records when seeding3, and also runtime_* when seeding2; they assert exact source user_version/topology before testing. Current export uses SCHEMA_VERSION and future uses SCHEMA_VERSION+1. Actual schema2 WAL, schema3 WAL and current4 WAL remain distinct cases. No old fault/assertion was removed.

Selected migration/WAL/hot-journal command executed13/13 PASS; separately `node --test --test-name-pattern='genuine unverified v1' test/runtime-adversarial.test.mjs` executed1/1 PASS. TAPs `/tmp/df-istqb-schema4-adaptation.tap` SHA256 `b054dbf9ea75517e38f593e11c5957d4a55d3508c5b1530ed657acd89693d96e`, and `/tmp/df-istqb-schema4-v1-adaptation.tap` SHA256 `b56e74ca346c827f255fe8052cfc13f214df41c3ca1704a9861a96dc1eb4fdf4`. These are required version/topology adaptations, not a new broad W1 acceptance run.

Independent crypto2 schema3 migration covers missing/wrong key, authenticated metadata tamper, failed/occupied backup and exact supported ciphertext preservation. Genuine encrypted-v1 remains CRYPTO_LEGACY_UNVERIFIED before original recovery/writes; no automatic reseal. Genuine prior plaintext command receipts are a different boundary: exact original strings remain preserved with signed ID/count/digest markers, replay fails CRYPTO_LEGACY_RECEIPT_UNVERIFIED, and marker/envelope stripping fails STORAGE_INVALID. Neither format can be made trusted retrospectively by a cosmetic rename. Owner-provenance acknowledgement reconstruction is separately required and unimplemented.

The first25-case independent expansion failed two context-race fixtures because their ready observation omitted required sessionRef. The fixture now supplies a synthetic observed session without changing approved intent; targeted2/2 passed. The first32-case run passed31 and failed the reviewer fixture's claimRef===null assumption. Requested actions omit that metadata field; the corrected test requires field absence, attempts0, no worker, SQL claim_id null and reservations0, retaining whole-snapshot equality and the exact repair denial. All first TAPs are retained. These were test-oracle corrections, not product remediations or weakened zero-effect checks.

No unresolved memory/context test-design finding remains in this held checkpoint. Independent correctness review, exact final committed composition and consolidated functional/visual/profile gates remain required before source-ticket acceptance.
