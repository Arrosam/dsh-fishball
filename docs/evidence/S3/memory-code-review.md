# BUB007B independent memory adapter review

Reviewer: `/root/code_audit`, requested Sol6.1 max, independent of author and separate ISTQB review. Owns this evidence only; no author code/tests/Git, install, personal fishball data, host/browser/provider or inference.

Status: **IN PROGRESS; synthetic typed-store module reviewed and corrected. Actual schema4 storage/integration is pending and not accepted.** Pure pinned adaptation has a separate [review](fishball-code-review.md).

Reviewed `src/memory.mjs`, dedicated tests and candidate `docs/runtime-automation-api.md`. The module obtains scope/role from opaque-handle `memoryBinding`, never input refs. It uses the one typed RuntimeStore domain, no SQL or in-memory task authority. Projection version, scoped content digest, internally allocated IDs, bounded provenance/confidence/revisions and tombstones are validated. Every retrieval is a fresh scoped read; correction/delete removes prior live retrieval, monotonic IDs retain deletion history. Model-like extraction is injected, receives immutable original input/provenance and cannot write before validating the whole batch/current revision. Durable request-digest lookup avoids deriving a new projection on command replay.

Context is sourced memory requiring verification against current task/constraints/ledger. Existing ContextAssembler text remains protected; only complete optional memory candidates can be dropped. Final task/epoch/generation and namespace revision are rechecked after await. Memory strings cannot grant authority or complete tasks. No auto-import, personal file lookup, whole fishball app or model provider is introduced.

| ID / severity | Reproduction and impact | Disposition |
| --- | --- | --- |
| S3-MEM-CR01 / Low | Digest-correct persisted projection with required `core:null`, `false` or0 and empty facts silently normalizes to fresh empty memory through truthy `#core(snapshot)`. Corruption is treated as initialization. | Undefined-only intentional absence plus required complete persisted core object. Original independent three partitions reject `MEMORY_INVALID`; author read+remember regression records no additional write. Closed on current working source; final-tree repetition pending. |

Independent `node --test test/memory.test.mjs`: **13 PASS,0 FAIL,3 explicit SKIP**, Node22.22.2. The13 cases use a synthetic typed store; skipped cases are actual encrypted RuntimeStore/reopen/tombstone, atomic fault rollback and separate OS-process memory CAS. These skips remain pending schema4 evidence and are not passed. Original corrupt-core corrective partitions3/3 pass. Byte N−1/N/N+1, namespace/role, secret/accessor, source extraction/CAS, projection/assembly and immutable replay cases execute.

Pending exact root freeze and actual sole-store schema4 implementation, migration/crypto/source/command retention checks, trusted native composition and true worker input boundary. Candidate facade existence and typed-store mocks cannot establish durable memory authority, process fault behavior, model-context isolation or full BUB007/008 AC. Name/protocol/AAD compatibility and project MIT/notice packaging remain integration review items; publication remains outside this task.
