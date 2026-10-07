# PREP01 public snapshot root cause and SOURCE amendment

PREP01's `snapshot.data.length + 2` oracle is incorrect for the actual public API. Schema7 persists a prepared context and its paired check, but ordinary snapshot.data exposes only the context. This explains actual3 versus expected4 without establishing a product defect. The failed run stopped before the typed check getter, so no executed check-persistence assertion is claimed.

Status: **SOURCE PROPOSAL SEALED; NOT PARSED/IMPORTED/RUN; independent affected review and fresh root GO required.** Author `/root/ni6_prep01_rootcause`; date2026-10-07. Current AGENTS and the October7 owner amendment were read; their model/service authorization adds no effect to this lane. Parent owns Git and future execution.

## Historical execution retained

Root ran the exact reviewed continuation manifest `74ed025c33df6eab4bbf19709c33ae8440ee8ce8657d2538060df846a438b199` and wrapper `.runtime/root-ni6-public-continuation-r2.test.mjs` once. The immutable raw command evidence records syntax exit0, functional exit1, MIG02/MIG03 PASS, PREP01 ERR_ASSERTION at original line13 (3 !== 4), then22 SKIP STOPPED_AFTER_FIRST_FAILURE. Prior MIG01 PASS was not rerun. Root's before/after records confirm all132 inputs unchanged. These raw results retain their original status.

Firsthand read evidence: `docs/evidence/NI6/schema7-r2-independent-public-continuation-execution/command-results.json`, SHA256 `68080e3cb247f1a38eaf2bee3a176cde5a267fe41f2db7e9dcd85c1b26a119c5`; command02 stdout SHA256 `da6f87c8db1de910fc86341975dd4efa6e9f87ad04338159ba0690ef76efe995`. No store/database was opened.

## Source cause

| Actual source | Public contract |
| --- | --- |
| Original6 runtime-store23,509..522,1288..1327 | The nine ordinary DATA_KINDS feed role-filtered listData and snapshot.data. |
| Original6 memory272..295 | prepareExecutionContext persists the original15 JSON.stringify envelope through putData(kind:'context'); no paired schema7 check is written. |
| Current7 normal-contracts7 and runtime-store23,481..482 | The nine ordinary kinds are unchanged. Separate NATIVE_DATA_KINDS contains context_check; ordinary read allowance rejects all such kinds for every role. |
| Current7 runtime-store550..566,1344..1383 | listData filters metadata through that allowance; snapshot.data uses the same projection. One preparation therefore adds exactly one publicly visible data entry. |
| Current7 memory281..312 and runtime-store3125..3127 | Genuine capability preparation preserves the original15 envelope, writes context and context_check, associates binding/registry, and increments task/semantic once. |
| Current7 runtime-store3128 and r2 support171..183 | The typed owner readPreparedContextCheck returns check/currentness for the contextRecordRef. The existing context helper uses readData and checks content digest and byteLength. |

Paths in this table are under `.runtime/ni6-schema7-core/{original,src}/`. The exact current runtime-store remains SHA256 `59e7b1130ce4a80293881b3aa7bcb7e649402d817922290eee09544b7deafd07`; original runtime-store remains `1742b0f3ffb190f285ac0a915e8efd0fde2fde42d62ecd22a4e75a86930ad27f`.

The sealed independent design remains unchanged: P01 requires the genuine original15 envelope/provenance, P05 one atomic context/check/binding/registry/command/receipt with one task/semantic increment, and P08 jointly fitting storage/record capacity with whole refusal. None promises two entries in ordinary snapshot.data. Its current MD/JSON pins are `9a01d8d71fe97def605bff63a4c2da3556bdbff61adf7376ee6741636dc8c5ec` and `706113919029e0812b96950d737f26ea1c055927a352f8f14f488b0ee5395611`.

This review does not inspect raw private rows/ciphertext or analyze private #preparedGraph, cipher/AAD, revision999, protected receipt tamper, inverse-graph or blocked final CODE behavior. Incidental encryption code lines in ordinary writer/read excerpts were not followed or analyzed. No product source changes are proposed.

## Exact sealed proposal

Only the new `.runtime/ni6-prep01-oracle-amendment-r1/` capsule was created. The full source bodies are inert `.mjs.txt`; the complete required diffs, public-oracle literal, proposal, preservation checks and manifest are sealed there. There is no runnable dispatcher/support/wrapper or scratch path.

| Leaf | Original frozen SHA256 | Proposed complete body SHA256 | Bytes |
| --- | --- | --- | ---: |
| PREP-01 | `8f440c4113b2342431fed2cc6d2bc4262dbad866395d9e868e201e90e239eefb` | `eedd0521951243c7c78d452887fc7dde5156028910dae1ee24693f9d753e1069` | 3867 |
| PREP-04 | `ee19643d8b707a56edd9aae615142d3f668756b8df099f8103d35e8eb49049c8` | `ae5308a46f348f2ac2990d4a666f167c76bfb34f530843d03f092fa410199da8` | 2073 |
| PREP-12 | `64b5dc4d221f8ab17ce4797a3cc86096f35ea472628270781787d489cbf0384e` | `17e1a9fb8defee03c93aa7339a3e3098f53255a670ebc2d6b5cb50ed9696315f` | 2288 |

| Leaf | Complete literal diff SHA256 | Exact correction |
| --- | --- | --- |
| PREP-01 | `d076debc3e7036afba7660841ab12c1ea7ec678172a49df3584dbe24af045758` | Line13 +2→+1; line36 output name publicDataRecordsAdded; public envelope/check linkage. |
| PREP-04 | `91e3b325c4e4fb6dbea277953a6a49a6b57b61695bc25c0161928abaf7b95a86` | Line18 +2→+1; line21 output publicDataRecordsAdded uses observed delta; public linkage. |
| PREP-12 | `fbb2f06ff19707118fa7676fc633ff4187cf63c1a92ed276301f472f30db07a3` | Line16 visible length4→3; public linkage; selected quotas3/4 unchanged. |

Manifest SHA256: `a320fac7f20ab1077fc7428a4716e96506b9b9bf6eb73cf837ac56c0ed4c163f` (60272bytes). It pins141 immutable inputs and9 new owned files; all150 actual hashes and byte sizes match. All132 root continuation inputs remain unchanged. All126 expected r2 manifest byte sizes also match. All three required diffs exactly equal the actual before→proposed source text diff. Of42 original assertion statements, only the three incorrect public-count expectations changed; the other39 remain literal-identical.

PREP01 reuses its existing public getters. It requires exactly one added snapshot metadata row equal to the actual readData metadata (excluding only its content field), while that helper checks exact content digest/byteLength. It links the typed check's context/task/digest, source and committed CAS, semantic revision, generatedAt, ledger digest, memory, owner/workspace, command and method to actual public request/envelope/receipt/snapshot values. All original envelope15/source/currentness/callback/tokenizer/input-count/no-memory assertions are unchanged.

PREP04 retains the two genuine pending calls, fulfilled/equal replies, task/semantic increments, callback and original callback checkRef assertion. PREP12 retains quota3 whole rollback/no receipt/no callback, quota4 success, full-quota new-command refusal/unchanged snapshot, and exact historical equality/no extra callbacks. Both add minimal actual readData/typed-check linkage. No hidden row count or private metric is asserted or reported; no value normalization, alternative accepted length or shape adoption is introduced.

## Remaining stopped-leaf scan and effects

All22 stopped leaf bodies and their shared secret helper were read as text for the exact same visibility assumption. Only PREP04 original line18/output21 and PREP12 original line16 are affected. Root authorized these same-cause corrections in this new proposal. PREP06 line17's +1 describes its genuine public goal writer during tokenization and remains unchanged. PREP12 initial visible length2 is also unchanged. Other leaves use refusal/replay snapshot equality or typed checks/envelopes without equating protected storage count with visible data length. This narrow scan is not a fresh full semantic review of the unchanged leaves.

The SOURCE bodies retain the sole relative specifier `../support.mjs`. Parent approved `.mjs.txt` evidence names: a later coherent continuation must place exact content bytes at `leaves/prep-XX.mjs` with reviewed byte-identical r2 support at equivalent .runtime depth. Its existing six ordinary original/current entry imports and13 transitive modules are pinned; no new dependency or shared support/core change is proposed.

PREP01 adds no getter invocation. PREP04 and PREP12 each add exactly one public readData observation plus one check helper invocation (one public task read and one owner typed check read). Their existing seven constructor/close, seven direct prepare, three fresh scratch and three expected new-callback upper bounds remain unchanged. No whole/transitive/private read bound is claimed.

This lane performed zero Node/JS parse/import/test/fixture/store/DB/migration/preparation/tokenizer/callback/native/provider/model/tool/profile/browser/listener/network/Git action. Shell text/hash/stat/jq/diff and new evidence text generation only were used. Original/r1/r2 source, manifests, wrappers, plans, raw logs and scratch were preserved.

Fresh independent affected SOURCE review must inspect these exact three proposed bodies/diffs and the cause/import/effects/pins. Root then needs a NEW coherent finite continuation selecting corrected PREP01 plus22 stopped leaves (23 IDs), excluding prior PASS MIG01/MIG02/MIG03, and a separate reviewed bounded GO. No rerun or GO occurred here. All87 and the blocked final CODE remain HOLD; native/current-source/cold/inverse/crypto/UI/model-quality/full acceptance are unchanged.
