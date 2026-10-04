# Independent owner approval-preview test review

Status: **provisional preview module PASS; encrypted/native/client composition and final frozen-unit review pending.** Reviewer `/root/istqb_review`, Sol6.1/max, is independent of root's implementation and separate from correctness review. This lane owns this report and [approval-preview-adversarial.test.mjs](../../../test/approval-preview-adversarial.test.mjs); it edits no production/author files and runs no host, browser, external model, install, network or live provider.

The actual [ApprovalPreview](../../../src/approval-preview.mjs) executes against strict typed store/resolver doubles. Its exact opaque owner handle is checked at every fixture store operation. The doubles model trusted immutable snapshots, concrete provenance and synchronous authoritative CAS; they cannot prove real encryption, stored consent validation, native authentication, browser display or native model execution. A preview token is a copyable reference within the originating private instance and grants no identity. The authoritative grant/claim remains the actual store's responsibility.

## Current command and hashes

`node --test test/approval-preview-adversarial.test.mjs test/approval-preview.test.mjs` on Node22.22.2/macOS arm64: **31/31 PASS**,0 FAIL,0 CANCELLED,0 SKIP, exit0,197.430041ms. There are23 independent cases and8 author cases. Nested vector loops are not counted as additional Node tests. Raw independent TAP `/tmp/df-istqb-preview-first.tap`, SHA256 `7b871448a1117a5415558e07094de6a3def94b35cda9dacc758db98c761b0029`; the first executed combined run passed, so no independent failing run is suppressed.

| Available reviewed file | Recorded SHA256 |
| --- | --- |
| src/approval-preview.mjs |`921d8946bd76c76f08fd6a21dbd73254c75716abcb86d6d2aadd33694ab3aa30` |
| test/approval-preview.test.mjs |`222197415eaed758d4e66dc81c2966854e93c05eca73359ec78f627017d9119a` |
| test/approval-preview-adversarial.test.mjs |`d817fb87346a324c6a425ac37cc1e8b96bb4b0752c1cf0adbb92e866ff527eb7` |
| docs/native-preview-api.md |`494ae6f4a0ef9835188b0df8fdc25e605c339eba42dfed44771325cdd40d61e9` |

Hashes were recorded after the run, consistent with the reviewed available source and the separate code review's final unit hashes. A complete feature SHA/manifest has not yet been supplied; changing those files or the composition requires the later exact-tree review. No global Stage3 or consolidated regression is credited by this command.

## Independent risk partitions and boundaries

| Independent cases | Explicit expected/actual oracle |
| --- | --- |
| P01: exact immutable material |Displayed UTF-8 content hashes to the exact requested data digest; record/target/body/units/charges remain exact and frozen. Unknown cost stays unknown without fabricated zero. Prepare grants0; explicit valid grant returns frozen receipt and advances auth once. PASS. |
| P02–P03: preview TTL |Trusted TTL1/60000 accepted;0/60001/negative/fractional/nonfinite/string/null refused. Grant at expiresAt−1 succeeds; exact expiresAt/+1 refuse before authority. Preview TTL differs from explicit grant expiry. PASS. |
| P04–P06: bounded cache and pending work |63/64 completed entries allowed,65 refused without a read/resolver or live eviction.64 blocked resolver prepares reserve all slots synchronously;65 refused.63 cached+1 pending caps64. Rejected pending callback releases only its reserved slot; expiry at exact boundary permits new preparation and old token refuses. PASS. |
| P07: duplicate concurrent grant |Two commands against one captured preview: only one enters the resolver; second returns PREVIEW_BUSY. Exactly one authority call/receipt; after consumption replay returns PREVIEW_STALE and writes0 further. PASS. No arbitrary-effect exactly-once claim. |
| P08–P09: immutable caller/token binding |Input mutation while awaited prepare/grant cannot swap task, record, epoch, expiry or command. Every altered task/action/digest/version/epoch/token rejects; same-looking token in a separate private instance rejects. PASS. String/JSON reference copying alone is not treated as identity forgery. |
| P10: hostile descriptors and payload authority |Unknown scope/owner/verified/labels, proxy/accessor/nonenumerable/symbol/null-prototype/array payloads reject before callback/read; reflection/getter counters0. Grant proxy/verified payload also refuses. PASS. |
| P11–P12: concrete meaning/provenance |Nine altered target/model/reasoning/preset/catalog/environment/binding/tools/permission refs refuse stale. Missing/unknown resolver field, proxy and getter reject with zero traps. Labels never derive authorization from opaque hash spelling. PASS. |
| P13–P14: tool/label capacities |Tool names63/64 allowed,65 refused; duplicate/sparse/accessor/proxy/extra-field arrays refuse with zero traps. Concrete label UTF-8 bytes4095/4096 accepted,4097 refused; tool bytes255/256 accepted,257 refused; whitespace/empty/unpaired surrogate refuse. PASS. |
| P15–P16: initial decision table |Wrong record/digest/body/nonstring/ill-formed UTF-8 refused. Stale task/auth, paused/cancelling/cancelled control, terminal/recovery task, absent/altered/already claimed/non-requested action, absent/mismatched resource-model policy/catalog/preset all refuse before resolver/grant. PASS. |
| P17–P18: async races |Prepare rejects task/auth/control/spec/data/metadata/catalog/lifetime changes across await. Grant rejects body/kind/metadata/task/auth/control/policy/preset/claim/lifetime changes after displayed consent and across resolver await. All authority calls0. PASS. |
| P19: reconfiguration |All seven concrete labels, tool list and concrete evidence ref changed after preview require fresh explicit consent; old grant refuses. PASS. |
| P20: trusted clock |Backward, negative, fractional, nonfinite and Date-limit+1 clock fails safely; expiry during awaited grant refuses. Date-limit plus TTL refuses before caching; grant calls0. PASS. |
| P21–P22: secrets/error projection |Ordinary Error, exported PreviewError and thrown object carrying known canary/private path return only PREVIEW_UNAVAILABLE in both prepare/grant. Known canary in each concrete label/tool/body and bearer/key/private-key patterns refuses before output. No canary/private-path stack/message; grant calls0. PASS. |
| P23: immediate disposal |Captured completed and pending tokens refuse after dispose; late resolver return cannot write; no automatic retry or resolution beyond the two explicit calls. PASS. |

Current invalid-input/error checks exercise real module guards, not a schema-only validator. The resolver and tokenizer/model/catalog facts remain synthetic. The policy table verifies factual binding/version changes; enforcement of remaining resource budget, signed-in owner identity, grant expiry and later dispatch linearization must be tested against the actual authoritative core and native composition.

The correctness reviewer independently reproduced two prior source issues:65 blocked prepares exceeded the documented64 capacity, and a resolver-thrown exported PreviewError propagated arbitrary secret text. Root fixed synchronous cached+pending reservation/finally and catch-all resolver projection before this lane's executed suite. P05/P06 and P21 independently verify the resulting original boundary oracles. Root also serializes grant work per preview as PREVIEW_BUSY, fences late publication and rejects clock rollback. This lane does not claim discovery of those correctness findings.

Root's earlier author async data-race failure is retained in its development evidence: a final data reread after resolver await was absent, then corrected. P17/P18 test same-digest body and metadata edits after await. The later exact unit must preserve these tests; no weaker stale-task-only assertion replaces the actual data oracle.

## Source criteria and remaining composition oracles

| Requirement linkage | Later observable oracle / remaining disposition |
| --- | --- |
| BUB006-01..05 exact identity/action consent |Real paired/native owner peer reaches preview/grant; worker/reviewer/foreign/JSON identity does not. Read authenticated encrypted exact data; meaningful labels come from real installed tool/model/environment provenance. Expiry/revoke/claim both commit orders use actual store CAS; preview hashes are never authority. Module binding tests PASS; complete actual composition NOT RUN. |
| BUB012 model/resource policy |Reconfigure real catalog/preset/model/reasoning/resource budget during pending preview/grant; actual full immutable approved digest and current policy reject stale consent without any provider/tool call. Cost unknown remains visibly unknown. Typed binding PASS; actual catalog/budget/native input NOT RUN. |
| BUB011 target/environment |Exact environment and cwd/tool/permission meaning displayed and later dispatched under approved binding; handoff/reconfiguration invalidates preview, with held uncertainty preserved. Typed reconfiguration PASS; native environment/dispatch NOT RUN. |
| BUB014 task/detail/approval UI |Actual host React/client displays complete exact record and concrete target/model/tool/env/limits, disables unavailable/stale/busy consent, captures explicit grant expiry, and handles disconnect/reconnect/selection/unload without late state/write. Escaping/accessibility and meaningful Chinese/long text in real browser. Client/native/visual gates remain pending; this module contains no UI. |
| BUB003 durable grant uncertainty |Crash/reload after store grant before transport response is reconciled by exact immutable command receipt/current authoritative status. Private preview cache is lost; a new preview never fabricates knowledge of the prior result. No automatic retry/provider effect. Actual durable/native fault oracle NOT RUN. |

Provisional conclusion: this available preview module has no reproduced independent omission after the cited fixes. It is ready for later actual encrypted/native/client composition and an exact frozen-unit review. Full ticket, cross-stage functional/visual, model/provider and release acceptance remain unpassed; live chat platform integration remains OUT by owner amendment.
