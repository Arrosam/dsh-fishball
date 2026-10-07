# NI6-PREP01 preparation r2 affected independent test-design review

Status: **FIXTURE_SOURCE_SUPPORTED / NOT_RUN / EXECUTOR_SUCCESSOR_PREREQUISITE_HOLD**. Reviewer `/root/ni5_r3_affected_review`, Sol6.1 max. No new selected-scope fixture/oracle blocker was identified. The rejected r1 TD01/TD02 metadata/conservation gaps are source-remediated. Every original nine-case functional family and all31 pure DTO cells remain NOT_RUN/HOLD; the pure cells are UNIT_ONLY. This is not build, runtime, native or aggregate acceptance.

The implementation-independent nine-case design remains unchanged: MD SHA256 `c827612dcb572c14b0854fbf495e563fd8975f60c99ea9dcd441c74e3e74c87e`, JSON `77bf9aa7dd56355a0931b3ea65c410c2806954790e39dea5829c9340d4b1d7f8`. The root-selected31-cell delta is `69d640925d3d0292d5eee875707439c69a254fe393954e02117292aefca185d5`; the prior fixture/executor freeze is `63197b73ef53b8b40e2185cb88b225474db347311e85edffbef20c08db43a9bb`. Those expectations preceded the author's new assertion source. The executor's separate36-family design and rejected executor reports are preserved; this report does not revise them.

## Exact source readback

| File | Bytes | SHA256 |
| --- | ---: | --- |
| `.runtime/ni6-public-preparation-r2/source-manifest.json` |84782|`bf8e64c0d9f6146553ea2a1860147a5c303d10260f652e4e4339c48b33828ec8`|
| `public-oracles.mjs` in that capsule |12757|`8517a015814684cb4cc27007e56a3b3f5c534281ea9a22bff2a7de4f0c7075e9`|
| `public-preparation.test.mjs` |10489|`fbdc1addc3f2d095a1663f562c5ff0ec6bdddd4032763132a469a890a45e6173`|
| `fixture-oracles.test.mjs` |8805|`f4bcd2d1b707a81a3e526e4c80734e71a51d6141a0b2b955c4c35333a8d606fa`|
| `original-bootstrap.mjs` |8721|`6f66cbd564448be228621cdc7d30d6d3b871fa6fd30fd1c25e51485839083421`|
| `preflight.mjs` |9332|`71dfc54e39bfbf5d2ee0aeee4f3839f1b4d804aab75a9648435ca95ca8a24290`|
| `http-rpc.mjs` |5810|`184bfb9f85aa8dd711f9d9eaec26c6940972a686b431cb91d5cf64b80cc3a597`|
| `source-delta.diff` |88544|`1528a20258900038d57f567fbf11f5799622bfe574b3191beb99d995a5c83970`|

All309 records (79 owned/230 inputs) independently match declared sizes/hashes. The physical inventory is78 files including the manifest. All63 original r4 package inputs match both r2 copies and r1 copies. The original r1 manifest `a69066641fac0abcf4300135de1c81e3790af774428392798061bfbab741a77d` and all220 predecessor records remain unchanged. HTTP/.gitignore are byte-identical; the Python verifier's only change is the capsule-path retarget. Independent text reconstruction matches the exact13-section delta,521 added/113 removed lines. No generated client, descriptor, peer link, profile/database/listener or command result was invented or run.

All six fixture modules were read completely as text, along with declarations/plans/effect/import inventories and the author's source-report pair. Relevant original public Loader remove/entries/await and Fiber.await source was checked; no application was parsed/imported/executed. There were no builds/tests/fault probes, runtime/profile/listener/database/browser/provider/model/network/OS process/signal/Git actions or private-content reads. Only public source/JSON/hash metadata helpers and this new evidence pair were used.

## Remediation and complete public joins

**TD01 is source-remediated.** public-oracles13–16 admits only plain own enumerable data fields, excluding extra/accessor/symbol shapes. Snapshot is closed18; task closed9; goal metadata closed10; context metadata closed15. The exact context extension is sourceTaskVersion/sourceAuthEpoch/semanticRevision/memoryNamespaceRef/memoryRevision. dataMetadata34–48 checks kind,64hex refs, safe unsigned numbers, positive task/source versions, nonzero bounded byte length, cryptoVersion2 and generationRef null. Snapshot49–64 checks schema7/active control, exact task, observation/semantic domains, unique record references and all11 empty work arrays. dataDetail74–80 closes `{task,data}` and metadata plus its sole content field, with full equality to the corresponding public metadata. Status/export/detail cannot agree on a leaked extra field and still pass.

**TD02 is source-remediated.** preparedJoin103–154 validates both closed snapshots, receipt and full detail. It requires one retained goal plus one public context, exact old goal metadata, taskVersion+1, semanticRevision+1, context semantic agreement and equality of every other public top-level field after excluding only observedAt/task/data/semanticRevision. Policy is explicitly conserved and also included in the conserved14 top-level fields. Current metadata/source/auth/memory/digests join the receipt, envelope, detail and public task. Every snapshot in functional baseline/current/repeat/stale/export paths is validated before its unchanged comparison.

Receipt88–102 remains exactly14 fields with closed task/memory/inputCounts and original source-version/auth/reference/crypto/byte domains. Envelope125–153 remains exactly15 fields: source scope/version/auth, sourceRefs/provenance, memory, ledger snapshot digest, protected text, independent byte/token counts, retained/dropped refs and verification. Complete protected text is compared at functional113–114 to the independently projected public baseline, including the goal and original no-constraints/work-facts text. Protected goal sourceRefs/provenance contain the actual goal; optional background retainedRefs/droppedRefs and memory provenance are empty. Whole envelope UTF8 byte length/digest remain distinct from content-only bytes and original fixed-density tokens `ceil(content.length/4)+4`; these are context-admission estimates, not model API usage or billing. generatedAt is a safe original timestamp; no generatedAt=request.now rule was introduced.

The request at functional105–106 is the same frozen six-field literal, including terms:[] and one now. Repeat118–121 demands full historical receipt equality and full current public-state equality except observedAt. Stale122–127 changes only commandRef, keeps V0/A0/terms/now, requires the exact STALE_VERSION safe logical error, and conserves status/export. There is no refreshed CAS, retry, extra preparation/query/check, grant or dispatch.

## Original transport, lifetime and finite observations

Bootstrap uses one original Context, the explicit launch snapshot before activation,11 official direct plugins (SystemPrompt before Tools), then one original Loader-created installed entry and genuine setup-created runtime child. Fresh profile/auth/workspace/storage/session paths are explicit. There are no provider/preset/Loop/JSONL activations, supplied PeerScope, captured domain handler, original-method override or observer counter reset.

The corrected disposeEntry95–104 retains actual entryId/fiber, calls original Loader.remove once, awaits the saved Fiber.await and Loader.await, then checks public entry absence and saved fiber closed. Original remove stops/unlinks/deletes; saving the fiber matters because Loader's remaining-tree tasks no longer include the removed entry. The parent services stay live for the sole post-removal HTTP404; whole original root-fiber disposal follows. No removed fiber is disposed a second time. HTTP404 is unmatched-route evidence before root close, not a stopped-socket/native/release/currentness witness. No post-root network probe, restart, rebind, process kill or cold reopen is selected.

The fixed transport sequence is the original D01–D18: setup status/prepare/confirm/status; list/intake/status/export/goal detail/prepareContext/status/context detail/export/exact repeat/status/different stale prepare/status/export. One original private native launch-token/index exchange precedes it; one framed `/df-rpc/v1/status` POST after entry removal follows. Exactly20 HTTP attempts/18 domain attempts are selected. Counters advance before transport and establish **attempts**, not a fabricated count of accepted backend dispatches. Host/Origin/cookie/trust/Peer admission remains the original Connection. RPC IDs and closed server-response/success/error envelopes are checked; only D16's closed STALE_VERSION error is expected. There are no redirects followed or retries.

The44 live windows trace exactly: bootstrap2; functional pre/post-auth2;36 from before/after18 RPCs; disposeEntry1; post-entry/pre-4041; post-4041; pre-root-close1. Each reads original agents.list/sessions.list/tools.schemas/llm.listProviders:176 total,44 per surface. Seven original natural count-only categories are installed before activation; stream/tool callbacks delegate next. One public diagnostics read checks genuine schema7/memory capabilities and unselected capabilities. After root close, counts are historical only. This is the explicitly agreed refinement of the original21-window design, with no extra HTTP/native/model/authority operation. No actual count was observed here.

Source expects no agent/session/provider/model/tool/native-worker/policy/grant/claim/execute/stream/capture/finish effects. worker.enabled true selects constructor composition needed for schema7; executionEnabled remains false and no provider/preset is registered. Empty original inventory/events plus the closed source call set support the prospective zero-effect boundary. They do not prove typed raw-instance currentness, original donors, worker roles, native usage/release or global acceptance.

Proposed storage checks inspect only type/owner/mode/device/inode for database, setup namespace/key/state before/after close. No key/cipher/database content/hash/private SQL is read. Native host-auth creation is confined to the fresh synthetic auth home and is separate from DF preview's no-write requirement. Ordinary SQLite sidecar teardown is allowed; no byte-identical DB/WAL claim is made. Tokenized URLs/cookies/headers/raw wrappers stay private; finite PREP01 errors and the existing14-field refs/count diagnostic are the only public summary surface.

## Nine functional families and31 pure cells

| Original family | Source trace / expected boundary |
| --- | --- |
| NI6-PREP01-01 | Preflight's real original build results, generated64 descriptor/client, host graph/peer/fresh namespace precede bootstrap import. No authored descriptor substitutes. |
| -02 | Genuine original token-cookie exchange and exact18 framed/correlated HTTP RPC attempts; original trust/owner admission. |
| -03 | Setup required/false, no DF preview storage, explicit current preview/digest accept:true, ready/schema7 after original activation. |
| -04 | Empty list, one fresh queued intake/A0=0/V0>0, exact goal/status/detail/export tuple and metadata joins. |
| -05 | Closed receipt14/envelope15/snapshot18/detail/metadata, full protected text, independent digest/bytes/tokens, source/memory and one task/semantic/context transition. |
| -06 | Exact whole request repeated once; full historical receipt and current public-state conservation. |
| -07 | Only new commandRef with stale V0/A0; exact safe refusal and complete status/export conservation. |
| -08 |44 live four-surface windows/176 reads, seven natural event categories, one diagnostics, zero selected native/model/authority effects; observations not yet made. |
| -09 | Original remove/saved-fiber settlement/public absence, parent-live empty404, original root-fiber close, preserved storage metadata; no release/cold proof. |

All nine remain NOT_RUN/HOLD, encoded with unchanged original expectations in the companion JSON.

The31 literal pure cells are three positive (U01 ordinary baseline, U02 frozen baseline, U03 complete transition/detail) and28 negative. U04–U08 cover snapshot missing/extra/schema/control/semantic domain. The finite11-item loop U09–U19 independently makes actions/workers/messages/artifacts/deliveries/progress/reviews/executions/audits/notificationFacts/notifications nonempty. U20–U23 leak/miss goal/context metadata; U24–U25 add detail fields; U26 mismatches source version; U27–U29 miss/double/mismatch semantic revision; U30 changes policy; U31 changes the retained goal. Each refusal requires its exact finite error predicate. No nested tests or host/product/provider imports exist; the transitive pure closure is built-in test/assert/crypto plus public-oracles. Synthetic DTO construction is explicit UNIT_ONLY and supplies no original lifecycle or authority evidence. None of these cells was run.

## Remaining execution gates and truthful limits

No new fixture-source blocker is asserted. **Current build/runtime GO remains blocked by executor-r2 ER2-01/F-EXE-R2-S01 and its explicit selection.** Preflight43, manifest/proposals/import/effect metadata still honestly select that rejected r2. A reviewed executor successor alone cannot satisfy this hardcoded gate: root needs the separately frozen coupled fixture/executor selection amendment and new affected exact pins before build. Do not alter this sealed r2 or describe a later executor as already selected here.

Four original build/gate commands, six syntax checks in frozen order, one pure31 then one functional command and max16 interpreter starts remain prospective. The10s preflight/40s active/5s cleanup/55s Node test and shared180s/cleanup-inclusive60s outer bounds require genuine supported root observations. Synchronous preflight checks cannot instantly interrupt OS work; Promise.race timeout does not cancel the underlying original operation. Timeout/disposal/drain unknowns remain HOLD. Successful summaries require actual original joins/removal404/root-fiber assertions and a successful root driver return, not source readback or persisted PASS alone.

Root owns exact future GO/pins, genuine build/readback and finite loopback execution. No extra tests/probes/RPCs or verification layer is authorized by this report. All87 accepted0/HOLD, direct-instance/donor/currentness/cold/browser/native gaps and permanently blocked final CODE remain unchanged.
