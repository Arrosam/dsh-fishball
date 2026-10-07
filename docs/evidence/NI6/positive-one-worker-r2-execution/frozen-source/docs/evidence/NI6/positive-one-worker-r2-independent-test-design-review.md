# NI6 positive one-worker r2 affected independent test-design review

Decision: **NO_NEW_SOURCE_GATE_BLOCKER_SOURCE_ONLY_NOT_RUN**. T01 is closed by source review for this fresh r2; no runtime success or acceptance is claimed. The sealed, unrun r1 and its final reviews remain immutable. All87 HOLD, accepted0; CODE remains BLOCKED and UI paused. Root owns actual GO and supported execution.

The affected correction is exactly three oracle operations plus namespace changes. `fixture.mjs:186` initializes an internal byte count. Line226 counts UTF-8 `JSON.stringify(options.messages)` bytes at the sole public `llm/stream`, requires one stream and a positive safe integer at most16384, and returns `next()` unchanged. Line266 now requires actual usage units to equal that input count plus `Buffer.byteLength(expected,'utf8')`, retaining actual accounting/state, the32768 reservation bound, exact output digest and all existing event counts. An incorrect or zero usage total can no longer satisfy that positive oracle. This conclusion is source-supported; no incorrect-unit or boundary case was executed.

The established public Llm forwarding basis is sufficient for the selected fresh system/user text-only request: file/image/developer/assistant projections do not alter its message values. The unchanged genuine r3 testing provider charges JSON UTF-8 input bytes plus its deterministic output bytes. The count stays internal; no messages/options are mutated, hashed or published and no request is added. This equivalence is limited to that frozen ordinary request shape.

Complete affected delta, proposal, README and author narratives were read. Inert readback matched all eight seals below and reconstructed the literal four-file delta byte-for-byte (16405 bytes). Restoring the three oracle operations and namespace gives the exact reviewed r1 fixture; the executor changes only three namespace paths. The proposal changes only namespace and13 provenance copies. All438 inherited input rows remain exact;13 added input and seven owned hashes match, giving451 inputs/17363903 bytes,463 future pins and42 source copies. Original package/build-return/full graph authority is inherited; no broad re-audit or rebuild was performed.

Conserved source obligations include the25 ordinary HTTP requests, returned refs/CAS/output/result/finish oracles, one native execute/stream/turn/step with zero tools, six owned raw-fiber Loader entries, post-removal404 before positivePath, first failure and declared private credentials/SQLite/JSONL effects. The26-field1024-byte result,1025-byte bounded executor read, phase/refusal sets, ownership/once-only/EOF/group/drift guards,90-second outer allocation20+5+35+25+5/primary85 and Node24/5/30 are unchanged. All proposal GO/report/approval flags are false and pins empty; fresh actual plan/marker/runtime/capture/result/evidence paths were absent at readback.

D01 syntax and D02 the single ordinary positive path remain NOT_RUN, inheriting the r1 design with exact synthetic usage now required. No additional fault, negative or boundary run is selected by this review. Strict root restart still requires rootClosed=false/FAILED_HOLD if active, independent of successful positive observations. Assess actual flags/counts, child return, executor first reason and supported-tool return together; schema selection and preterminal timing scalars cannot substitute for those observations. Existing r1 qualifications remain in force. No task completion, review, delivery, protected CODE or87-assertion acceptance follows.

Reviewed source identities:

- `.runtime/ni6-positive-one-worker-r2/fixture.mjs`: 32061 bytes; SHA256 `414547d5dcda859b41c0d41551d83ebf5862a92595ca0db34c8185b49d64afdd`.
- `.runtime/ni6-positive-one-worker-r2/run-once.py`: 31987 bytes; SHA256 `8cf8cfa6a258ee35b31fb1a5c5f19459aeec937b7272a9705540bdc3220ddc6b`.
- `.runtime/ni6-positive-one-worker-r2/execution-plan.proposed.json`: 8282 bytes; SHA256 `00101ceca8c67265fc9a398e20ec64188417354205beb5e6e5a568dc7be2179f`.
- `.runtime/ni6-positive-one-worker-r2/source-delta.diff`: 16405 bytes; SHA256 `5989a943f7ddc5c3b790e718881f600f2f430c3e79266e403a23c1fb98def79c`.
- `.runtime/ni6-positive-one-worker-r2/README.md`: 4111 bytes; SHA256 `bc3fbe4e4676a1f9fc672594e976ba4946eec8975be3a1ad2ef262c0aa01d6cb`.
- `.runtime/ni6-positive-one-worker-r2/source-manifest.json`: 113487 bytes; SHA256 `357bd5d18c5d7dbaded35b06ab56a1380c56fd057652cb64407e5f7b33540e47`.
- `docs/evidence/NI6/positive-one-worker-r2-source.md`: 2827 bytes; SHA256 `443eb73654432ac6c8738999ee6fc1bf23991f48e8543327e9a1e82db5f89b0f`.
- `docs/evidence/NI6/positive-one-worker-r2-source.json`: 12839 bytes; SHA256 `be69865ee60f6ac26eadbac5917a33441b4bf064a6fcc516212e3fc8b849572c`.
