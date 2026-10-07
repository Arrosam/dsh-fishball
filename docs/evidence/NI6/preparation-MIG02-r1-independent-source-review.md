# NI6 MIG02-r1: independent fixture source review

The literal correction is supported by the genuine public MemoryAdapter source, with no blocking defect found in the changed leaf. Execution preflight is blocked by current `AGENTS.md` drift: 86 of 87 input pins and all six sibling-owned pins match, for 92 of 93 total. The source proposal remains NOT_PARSED / NOT_IMPORTED / NOT_RUN; all87 and final CODE remain HOLD.

Reviewer: `/root/ni3_fixture_source_safety_review`; date: 2026-10-07. This is an English ordinary fixture CODE SOURCE review requested at max under the repository Sol 6.1 audit rule. Author assertions in the affected fixture are the subject of this review. No new independent fixture/oracle or test design was authored, and this ordinary review does not replace the blocked final CODE investigation.

The reviewed scope is the complete required literal and complete new MIG02 leaf, new support/selection seams, unchanged original MIG02/support/dispatch/wrapper source, full original public MemoryAdapter source, the affected current adapter path, public memoryCommandReceipt boundary, and read/effect/pin/continuation metadata. Other original leaves and author core-test oracles were hashed only. Raw first-run logs were hashed without opening their transcript bodies. No private command-receipt implementation, SQL/crypto/tamper/schema999 investigation, blocked final CODE experiment, failed DB, data/profile or credentials were inspected. No JavaScript parser, import, target execution, DB/native/provider/model/listener/network/build/Git action occurred. Only this new MD/JSON evidence pair was created.

| Exact sibling artifact | SHA-256 | Bytes |
| --- | --- | ---: |
| `source-manifest.json` | `8cb53b8b147251521e00deb79eff7d6f252a081a585b2c53170c508f211bf6d7` | 36498 |
| `leaves/mig-02.mjs` | `568de55b4423f302e82d85affd77e49b2372b27d85e40bbbdceee8e52c3db9cb` | 3516 |
| `required-leaf.diff` | `8812904092415d12ba114ab223738630ff73b06bfe5f765cac3d196fe6ff689a` | 3008 |
| `review.json` | `3f3d3b53da92475f830347492a5a6b25fe6165f9404e136d39f6974653cf610e` | 45391 |
| `review.md` | `8b6b9da468ccc9051fd5800fb2ae6031b85894a2be3d90c1fdd115912a3da5fa` | 5311 |
| `selected-leaf.mjs` | `8d769c0ea4784bc8bccd3e5e1f7b5ad52e0cb9a9ef8f0296670e9a59e791d335` | 1242 |
| `support.mjs` | `5aa23dacc52192cf3901b1449f0a2c8aaaa77eee75005ce688a05fb3948762c1` | 1002 |

Paths in this table are relative to `.runtime/ni6-preparation-independent-mig02-r1/`. Read-only text diff of the preserved old leaf and complete new leaf exactly equals the supplied `required-leaf.diff`, including SHA `8812904092415d12ba114ab223738630ff73b06bfe5f765cac3d196fe6ff689a`. No patch was applied and no JS source was parsed.

| Public cause or original preservation boundary | SHA-256 |
| --- | --- |
| Original `ni6-schema7-core/original/memory.mjs` | `dba915b9f3c2a76ef05cce50611a553ecb792e896b7095b70e7491a9cae72a01` |
| Current `ni6-schema7-core/src/memory.mjs` | `074ec0bb4ce686b9b8fddec1e71e885ca5890f108b876b482f4a1ec086f0f1e9` |
| Original public store boundary source | `1742b0f3ffb190f285ac0a915e8efd0fde2fde42d62ecd22a4e75a86930ad27f` |
| Current schema7 store, hash only | `59e7b1130ce4a80293881b3aa7bcb7e649402d817922290eee09544b7deafd07` |
| Original support | `239de9035ac5c6543471702b1f2fcc5efb45da3406c0a978361bffc77fe453e8` |
| Original MIG02 leaf | `9510f099bbdc95b485c6082778cf7ad6c1dbb7da88b6578bed77c78d7c557206` |
| Original capsule manifest | `7c09ddea671916956ea14891a0881c034f2eb6ac6747ba5b3f3fc77775eb96cd` |
| Original root wrapper | `5245a3308e23003bda2e651958dce59edd75902f76a05e0d6c7b91b5b2ecf7bc` |
| Original root execution freeze | `7221c3e4296112140aa65e983a541cf69e97bf7dcdb205655a46b1882730a6f6` |
| First functional stdout, hash only | `fdebb2b8c85d9778c8af0646d899a8a9a47ee2324c47e68ad1241b9d846769d2` |

The original public adapter's `#replay` at lines 100–103 obtains the actual public command receipt and returns its clone with `deduplicated: true`. `#mutate` checks that replay first at lines 110–111, before looking at the current projection revision; the fresh path computes a local edit result at line 114, persists through public `putMemory`, and returns `{ ...receipt, result }` at line 122. Historical replay therefore does not regenerate that local result. Original `remember` lines 148–151 binds the unchanged candidate/request and memory-only result. The current adapter retains these phases at lines 107–129 and 155–158. The public store boundary `memoryCommandReceipt` lines 1429–1439 validates scope/command/request digest and returns the existing receipt. Its private receipt implementation was not investigated.

The old MIG02 line 22 compared a candidate historical replay to the original first mutation return. The correction keeps the original first receipt/state captures, adds explicit namespace/revision/not-deleted/memory-only result/actual fact-ID/source assertions, and performs exactly one additional original public `memory.remember(rememberInput)` at new line 22 before closing the schema6 store. That genuine warm value must have `deduplicated: true` and no own `result`, while retaining first receipt record/digest/request digest/revision/namespace/owner/workspace/source identity. Original state must remain exactly equal after the duplicate. No expected receipt is constructed, no key is stripped or normalized, and no comparison tolerance is introduced.

After genuine public schema7 opening, the existing ready status, empty task set, namespace snapshot and adapter-state comparisons remain. New lines 45–49 compare the entire candidate replay exactly to the actual original warm replay and recheck exact adapter state, exact public namespace value and empty tasks. The unchanged helper imports `node:assert/strict`; neither comparison implementation nor returned payload is overridden. The wrong cross-phase equality is the only equality replaced. Both the genuine first mutation's memory-only result and historical receipt representation remain checked.

The new support reexports the sealed original constructor helpers; no facade, private brand, collector or native-origin witness is added. Original support `open6`/`open7` still use actual public stores with the same complete limits, fixed clock, synthetic key/owner handles and genuine preparation capability. The leaf does not supply preparation capability or tokenizer/observer callbacks to either ordinary MemoryAdapter. Its calls create no task authority or fictitious native result.

The new scratch path is its own `runs/MIG-02-<mkdtemp>` directory, reached only during the selected invocation. It cannot reuse the original failed lease through this leaf's fixed construction path. The original store closes before the candidate opens the same newly owned scratch database; the remaining owned store closes in `finally`. Scratch and a genuine migration backup are retained. Genuine public construction may migrate, repair, create/recover/write the database, journal or backup, so this review makes no physical no-write promise.

New selection source allows only `MIG-02`, requires the externally supplied reviewed manifest hash, and checks all 87 inputs plus six owned source/evidence files before its dynamic leaf import. Its top-level imports are Node builtins; the leaf/helper only define or reexport functions at their new top levels. The unchanged original support graph becomes reachable on a later authorized leaf import. The entry enforces selection, while root's future finite wrapper must enforce exactly one invocation. No new wrapper was authored or executed in this review.

| Prospective successful-path direct leaf/helper call count | Count |
| --- | ---: |
| Public store constructors / MemoryAdapter constructors | 2 / 2 |
| First original remember / additional original warm duplicate / candidate historical duplicate | 1 / 1 / 1 |
| Original state / candidate state | 2 / 2 |
| Explicit candidate `getMemory` | 3 |
| Explicit original / candidate `listTasks` | 1 / 2 |
| Explicit `preparedContextStatus` | 1 |
| Owned public store closes | 2 |
| Preparation calls or supplied tokenizer/commit-observer callbacks | 0 |

Q01 (LOW): author metadata's `candidatePublicGetMemoryReads: 3` is a direct leaf-call count. Each of the two candidate `state()` calls also invokes public `getMemory` through adapter `#read`. Three is therefore not a global/transitive bound; root must qualify the count and account for adapter/constructor/internal operations in its future effects record. No backend operation total or private numeric-counter proof was inferred. The returned duplicate/tokenizer/observer numbers remain source call-path labels until execution, and `privateRegistryCounts` remains `SOURCE_ONLY`.

B01 (execution-preflight blocker): the exact manifest and original78 freeze still pin `AGENTS.md` at 7668 bytes, SHA `dea33c79f404cbab39acfc96b70b5e01962b9214cfd44f5cb6524764b1e45fc4`. Its current bytes changed during this review to 8292 bytes, SHA `f7b4685d6c376159a9de2114c10acd3c08710ceed732b4ea7f07f7ed404e95ba`. The updated instructions were read; their broader model authorization was not used in this source-only lane. The selected entry would reject this drift before importing or invoking the leaf. Root must preserve the old artifacts and resolve the instruction change through a separately reviewed current generation or amendment and new bounded GO. This reviewer did not restore or repin any file.

All 87 input pin definitions were checked against their actual bytes, and the preserved original78 definitions exactly match the old root freeze. Current matches are 77 of those 78 original inputs plus all nine first-execution evidence files; all six owned sibling files also match. The only mismatch is current `AGENTS.md`. The original leaf, wrapper, source manifest, freeze, before/after verification records and failed stdout/stderr logs remain unchanged. Historical root before/after records still report all78 unchanged at the first execution; they do not establish current all78 preservation after the instruction update. The companion JSON records every expected/actual size and hash.

Root reported the historical outcome as MIG01 PASS, MIG02 FAIL and 24 leaves stopped/skipped. Read command metadata confirms first syntax command exit 0 and functional command exit 1, with first-failure stopping and historical before/after input checks. This review did not read the raw transcript or independently recount its subtests. The first failure is preserved, and neither the original warm capture nor the corrected MIG02 has executed here. Whole original graph verification remains false.

The continuation metadata is exact: its 24 unique remaining IDs equal the original frozen26 order after MIG01 and MIG02. Root's future wrapper must run corrected MIG02 once via the new sibling dispatcher and reviewed valid manifest, then the stopped original24 once through their original dispatcher/manifest, with sequential concurrency1 and first-unexpected-failure stop. Passed MIG01 must not repeat; the failed old MIG02 must not be rerouted for another attempt. The proposed check/test argv shapes are metadata only, fit the stated command/argv caps, and confer no GO. Current pin drift affects both exact frozen dispatch paths.

Q02 (INFORMATIONAL): supported source diagnosis and unchanged strict comparison do not prove a repaired runtime outcome. No source proposal, historical MIG01 result or this fixture review closes all87/final CODE, the full41 design groups, eight F06 obligations, unsupported native/inverse/cold/sourcecollector/automatic-pattern historical prerequisites, or native/UI/model-quality acceptance. Root owns a fresh reviewed wrapper/freeze, pin-drift resolution and any new bounded execution.

The previous NI3 fixture-correction, P01 and NI4–5 lifetime review evidence was independently rehashed unchanged. Their exact pins are included in the companion JSON. No source, manifest, wrapper, previous evidence, failed log or frozen artifact was altered by this reviewer.
