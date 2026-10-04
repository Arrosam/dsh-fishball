# Independent approval-preview code review

Reviewer: `/root/code_audit`, Sol 6.1 max, independent of the author and ISTQB reviewer. Ownership is this report only. No source/test/Git writes, native/Web/browser launch, external inference, dependency installation, credentials, personal data or remote action.

Status: **PASS for the corrected bounded module checkpoint.** PREVIEW-CR01 and PREVIEW-CR02 are closed by independent original-oracle retesting. The evidence below uses typed store doubles, not the authoritative encrypted/native composition. Root's full Stage3 snapshot is not frozen and no whole Stage3, ticket, native/client, visual or release acceptance is inferred.

## Exact reviewed files

The checkpoint is an uncommitted logical unit on parent HEAD `dd07d1bfba090bfa5a65be973191b544807eaa10`; HEAD does not contain the new preview files. These SHA256 fingerprints, rather than HEAD alone, identify the corrected unit. The module and its two imported source dependencies match before and after final tests/probes.

| File | Final SHA256 |
| --- | --- |
| `src/approval-preview.mjs` | `921d8946bd76c76f08fd6a21dbd73254c75716abcb86d6d2aadd33694ab3aa30` |
| `test/approval-preview.test.mjs` | `222197415eaed758d4e66dc81c2966854e93c05eca73359ec78f627017d9119a` |
| `docs/native-preview-api.md` | `494ae6f4a0ef9835188b0df8fdc25e605c339eba42dfed44771325cdd40d61e9` |
| imported `src/runtime-security.mjs` | `6edf9f8a544444169f9190fc5e24230ab3a0928ea8d7c295f1b085824c91ac07` |
| imported `src/context.mjs` | `8c38f2d0d8e30933a35012e436afa65d89c58e00b01517bb5646e85115c40ab5` |

Initial defective preview source: `d6a21db8812051618868b673e281e7aa3ed91ce3c10d6bf05c77e0ffde4531c7`. Initial author test source: `db71c87aec833191c75d431d39f7bfe6afe2f2c85747d5eeb024749f3a4eab7c`; API source: `2fbcb8939e7734e84b3642894ba4fdaf8524c8c488c40b9f675553ca4edbcb72`. Initial five author tests passed despite both independently reproduced defects. Supplemental tests during authoring were not treated as a final immutable checkpoint; the final five-file fingerprint check removes that ambiguity.

## Findings and retests

| Finding / severity | Reproduction and impact | Final disposition |
| --- | --- | --- |
| PREVIEW-CR01 / Medium | `prepare` checked cached size before awaiting the resolver, with no pending reservation. Block the resolver, start65 equivalent preparations, then release it:65 distinct live tokens are returned despite documented cap64, with no grants. Pending trusted-resolution work was also unbounded. | Closed. Cached plus pending preparations reserve the same64 slots synchronously before the first await; `finally` releases every pending slot. Original65 request probe now issues64 and rejects one `PREVIEW_CAPACITY` before the resolver. All64 rejected callbacks release capacity; a later valid preparation succeeds. Mixed60 cached plus four pending is capped, expiry frees the cache, and disposal prevents every late publication. |
| PREVIEW-CR02 / Medium | Both callback catch blocks rethrew any instance of the exported `PreviewError`. A trusted resolver throwing that class with a synthetic known-secret/private-path code exposed its raw code/message during both prepare and grant; no grant was performed. The existing plain Error regression did not cover this class. | Closed. Resolver exceptions are caught separately from internal label validation and always become `PREVIEW_UNAVAILABLE`. Original exported-class attacks now redact in both phases; only Boolean leak indicators were recorded, never the canary or private path. |

The author also added a synchronous per-entry grant-in-progress fence. A65-call burst against one valid preview now starts one resolver and one typed authoritative grant;64 calls reject `PREVIEW_BUSY` before further resolution. The fence clears in `finally` after a rejected callback, allowing an explicit retry before any authoritative grant occurred. This narrows resource use; the store remains responsible for actual atomic CAS and committed/uncertain receipt reconciliation.

The documentation now correctly calls preview references copyable JSON strings recognized by their originating private instance. A valid serialized copy is not an identity credential; a foreign instance rejects it. No uncopyable-string or token-derived operator promise remains. The clock watermark rejects rollback rather than extending a cached preview under a backwards clock.

## Boundary assessment

Input objects are closed and reference/version fields are validated and copied before awaits. Model/RPC payloads cannot supply labels, resolver functions, owner handles, key material or verified flags. The instance captures its trusted owner handle; resolution receives frozen spec/task copies. The returned display is also deeply frozen.

Preparation verifies exact record identity, full content digest and current task/auth/control/action/model/resource policy. After resolution it rechecks current state, spec and complete data. Grant binds the captured task/action/digest/task version/auth epoch, checks current immutable material and policy, re-resolves concrete meaning, then rechecks expiry/liveness/state/data before calling the typed store's synchronous grant transaction. Grant duration remains an explicit owner input, distinct from explicit installation preview TTL. Neither previews nor grants start work. Unknown estimated cost remains unknown; no zero or price is fabricated.

The cache carries process-local display evidence only. A random nonce plus bound material identifies each entry; no entry survives disposal or restart. Strict `isAlive() === true` rejects Promise/object/string/undefined values before trusted resolution. Callback redaction and secret checks do not introduce a log/export or persistent plaintext cache.

These properties narrow an already admitted owner operation. They cannot make an arbitrary resolver trustworthy, authenticate a caller from task/reference hashes, prove model/tool/environment meaning from hash strings, or make a typed mock transaction authoritative. The installed resolver must derive concrete labels from actual trusted host bindings. Native integration must supply peer/plugin liveness and enforce the admitted operator before calling this instance; the constructor's ordinary local lifetime default does not prove a hosted disconnect fence.

## Executed evidence

`node --test test/approval-preview.test.mjs`:8/8 PASS, fail0, skip0, exit0, Node22.22.2, TAP duration132.1545ms. Independent raw TAP: `/tmp/df-approval-preview-code-final.tap`. Five source/dependency hashes match before and after the command.

Independent in-memory fixture evaluation:22/22 partitions PASS, exit0. The evaluation imports the exact reviewed module and reuses the synthetic author fixture setup without editing its file. Partitions cover original65 preparation boundary; pending failure cleanup; unload during pending preparation; combined cached/pending capacity and expiry; both exported-error attacks;65 concurrent grants; failed-callback guard cleanup; backwards clock; expiration during resolver await; foreign-instance reference; four nonboolean liveness cases; six preparation-await task/auth/control/data/policy/unload races; and a changed data-kind metadata observation during grant await. Only counts/digests/Boolean outcomes are emitted. No real store, host, network, external provider or model is involved.

## Remaining integration gates

The corrected module checkpoint is ready for local integration. The final authoritative encrypted-store/native operator/client composition and the final Stage3 source snapshot require separate review and execution. That review must establish actual grant CAS/expiry/idempotency, immutable AES metadata/spec bindings, peer/plugin unload fences, concrete host-derived labels, exact displayed content and explicit expiry, and rejection of stale/disconnected/foreign context. New author's composition fixtures reported after this checkpoint are not credited here before their independent review. Full consolidated functional/visual regression remains unpassed. Live chat/account/provider delivery is outside the owner-defined phase; provider-neutral contract validation remains required.

