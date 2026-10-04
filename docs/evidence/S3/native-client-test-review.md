# Stage3 independent native/client test review

Reviewer `/root/istqb_review`, Sol6.1/max, independent of native/client/root authors and correctness reviewer. **PASS for the held public-library/module checkpoint; actual browser, full source-ticket and consolidated acceptance remain HOLD.** This review uses the installed official DSH Web0.2.1-alpha.1/Cordis4.0.5-alpha.1, synthetic private identity, temporary encrypted SQLite/JSONL and bounded local deterministic providers. No listener, Web profile/browser launch, credentials, external model/provider, install or Git mutation was performed.

## Earlier exact independent checkpoint

```sh
node --test test/native-adapter.test.mjs test/worker.test.mjs test/environment.test.mjs test/native-runtime-integration.test.mjs test/client.test.mjs test/client-build.test.mjs
node scripts/build-client.mjs --check
```

Expected: real public service/protocol/session composition obeys exact identity/current consent/input/lifetime; client module and generated bundle agree; no unauthorized tool/provider work. Actual: **53 PASS,0 FAIL,0 SKIP**,738.653084ms, and deterministic bundle check exit0. Counts:18 native-adapter,14 worker,2 environment,2 native-runtime integration,16 client,1 build. The author's59-case broader selection is separate evidence, not this independent command. Eleven selected file hashes match before/after; global Stage3 committed freeze is still pending.

TAP `/tmp/df-istqb-S3-native-client-first.tap`, SHA256 `ef62eae33e5143941fdeaa01f7744c596db1b9ba20fb0659c1931c41a5d075bb`; hash list `/tmp/df-istqb-S3-native-before.sha256`, SHA256 `16426aca6583591c82ba17e5088702c6fa94e33f4e88a82fe0b2395c21f00910`.

| File | Held SHA256 |
| --- | --- |
| src/native-adapter.mjs |f066aef5fed0f022ccb5477f7eb2493ba27dac38e8707701c2eae41184b92c8f|
| src/runtime-plugin.mjs |0762fe666a3b94ba1a1c2a3c4f1b7fe07e3dca394b4ff3d437e3a47fa7686c72|
| src/worker.mjs |6b3ecf23c2fcc9cd883effa88d8330688807278d0e028c1939a4444920e52d61|
| src/environment.mjs |ee110abe5bbc485249da4f945962aa59f319c87c3d88a8dc4a050279b5ba3a63|
| src/client-entry.cjs |a6324e48905da4843bf0a9ceaac0cd6182656039c3a93ad60e85115c6f137c9d|
| lib/client.js |def14844f565a465c396d3b3efd7530b39476220566717dd04f2b57462b9e7c6|
| test/native-runtime-integration.test.mjs |480b0eee9d821c9483ee77a7582706704a6e586de7e5e15041837c947bfa94dc|

Core/data integrity uses the separate held169-case checkpoint, RuntimeStore63dbc100… and ledger64cc42e1…; see [memory review](memory-test-review.md). A digest or mock source label never supplies identity or authentic native effect evidence.

## Expected versus actual boundaries

| Risk/partition | Executed observable oracle and result |
| --- | --- |
| Public carrier versus serialized owner |Genuine HostConnectionService request/response framing with synthetic BrowserAuth and captured Node streams reaches scoped encrypted store; unauthenticated request401, unknown report endpoint and injected owner/producer fields refuse. ctx.df exposes diagnostics only, no owner handles/closures. PASS for module protocol; actual credential/browser carrier remains unrun. |
| Concrete preview versus hashes/forged token |Actual native connection+ApprovalPreview+core client fixture rejects well-formed forged token; fresh private-instance token, exact scope/action/data/model/environment/tool/resource meaning and explicit owner expiry admit one grant. Worker/claim/provider counts remain0. Pure preview31-case checkpoint is separately recorded. PASS. |
| Create versus execution/effect completion |Actual AgentLoop creation is owned/idle/ready with0 local stream; explicit final atomic consume sends one complete authenticated current context and observes its own committed session result. Duplicate execution admits:false and never wakes again. No native creation or idle state completes task or releases a claim. PASS. |
| Complete context/result provenance |Actual MemoryAdapter prepared envelope→encrypted core→immutable grant→native input verifies whole digest and current constraint; flushed JSONL retains original input once. Captured `df.native-result/v1` binds task/action/claim/gen/session/execution/input/result/cursor, and JSON content/proof/producer substitution is denied. PASS. |
| New incarnation resume versus replay |Genuine persisted public JSONL resumes the same trusted session with a new approved claim/generation, idle0stream; a fresh current context/grant plus explicit consume creates one own new committed result. Original/new inputs occur once; no automatic replay/completion/release. Separate mock-persistence resume is labelled mock. PASS. |
| Trusted tools versus late/nonempty schema |Mandatory private synchronous toolGuard attests actual public ToolRuntime.schemas(agent) empty. Per-agent scoped monotonic tools.guard vetoes actual public execute even after extensible pre-execute allow. Late registration body0; changed schema blocks final consume/provider0; disposal removes only owned guard, independent global tool remains. PASS for empty-tools phase; nonempty tool execution remains unaccepted. |
| Scope/current claim/environment/model |Worker input freezes before await; raw/JSON handles, foreign owner/action cache, wrong/late successor generation or session, revoked claim, changed environment/current state/model effort deny or remain safe unknown. No preparation denial creates/reserves. PASS. |
| Unknown creation/send and stop/quit |Timeout/late receipt retains original exact claim/digest/hold. Product cancel and direct inactive-fiber quit stop owned agents, dispose stale diagnostics/private reviewer immediately, remove registered route and reopen recovery with held ownership. Separate trusted effect settlement remains required. PASS for public module lifecycle. |
| Independent review versus owner proof |Product fixture privately binds a separate charged reviewer to exact captured artifact, permits only allowlisted read/verify/report and blocks owner report/complete shortcuts. Synthetic report proves gate/material/identity only; it does not prove review-model quality or automatic completion. PASS. |
| Client CAS/lifetime/races |List/detail share current version/epoch; exact cancel doubleclick admits one command and reads pending authoritative state. Old page/selection/disconnect/disposal/deferred digest/preview rejects late paint/writes and performs no auto-retry. Stable error labels exclude arbitrary prose; throwing UUID source clears busy with0RPC writes. PASS. |
| Native module/panel/bundle |Lazy host React factory, official ModuleLoader/SlotCore/Cordis lifetime, additive main/df/sidebar registration and cleanup, deterministic source/bundle check. Escaped Chinese and semantic element labels are tested in renderer doubles. PASS for module semantics; no real React/browser visual/accessibility claim. |

## Source-AC coverage and remaining oracles

| AC | Local observed proof | Remaining applicable gate |
| --- | --- | --- |
| BUB014-01 |Actual native protocol/encrypted list-detail CAS, timestamp/state and late-response exclusion PASS. |Real rendered list/detail and refresh in supported isolated Web profile. |
| BUB014-02 |Pending/running/recovery/terminal control state, pause/cancel readback, held native stop stage PASS. |Real native state/control visibility and complete supported profile/browser lifecycle. |
| BUB014-03 |Doubleclick/stale/disconnect/unknown/grant-preview no-retry current commands PASS. |Actual browser focus/loading/error/uncertainty behavior under connection reset. |
| BUB014-04 |Long Chinese/escaped text/accessibility element labels and cleanup module tests PASS only at mock-renderer level. |Actual resize/keyboard/tab/focus/contrast/zoom/font/control reachability and native layout: NOT RUN. |
| BUB014-05 |Scope/record/session/approval refs never confer identity; foreign/stale/disposed shortcuts deny; exact concrete preview fetched owner-scoped PASS. |Real supported owner-only navigation, artifact/session/auth UI and secret-free rendering. |
| BUB008-04/05 |Genuine local deterministic provider/session feed exact context input, once-only consume and stale memory/semantic/policy/current-claim checks PASS. |Final adversarial complete native composition and real model/tokenizer/catalog constraints as authorized. |
| BUB011-01..05 |Exact environment/model/permission/tools/session mapping, trusted resolver, unknown held handoff, no new harness and stable native errors PASS for recorded partitions. |Applicable nonempty tool/model/catalog and supported native handoff/UI/profile regression remain visible debt. |
| BUB004/006/013/015 carried rows |Module creation/uncertainty, private authority/concrete consent, captured artifact/independent charged material gate PASS for recorded partitions. |All other individually retained source rows in [plan](test-design.md), native review quality and full fault/visual regression. |

The three-stage authorization postpones complete cross-stage functional/visual regression; it does not make these mock/provider/module levels equivalent. Live chat software/accounts/provider-specific transport are OUT by amendment, rather than failed prerequisites. Native DSH and actual task UI remain applicable.

## Remediation history and final disposition

UI-CR01 disconnect during async command digest and independently reported UI-T01 throwing UUID were fixed before this checkpoint. Regression asserts originating epoch/lifetime,0writes/busy cleared/stable error and later explicit retry; no automatic retry was added. Earlier first155/156 Stage2 failure and superseded157 precrypto freeze remain historical evidence, not current acceptance. The Stage3 tool-guard change adds actual scoped invocation protection; it does not retroactively change those old exact snapshots.

The owned live rename fixture now supplies explicit trusted toolGuard in its two prepare-only constructors. Its exact legacy/current/unbound session identity, mismatch, default permission and all zero-create/stream/session assertions remain; targeted1/1 passes. Historical dd07d1b rename report/manifest stays unchanged. No existing native assertion was weakened to accommodate this new constructor requirement.

No new unresolved native/client test-design defect was reproduced in the recorded checkpoint. Independent correctness review and root's final committed code/test/package/bundle manifest remain required. Actual supported Web/browser rendering, complete native/profile regression and any real model invocation are unrun; no whole BUB014/MVP/release PASS is issued.

## Frozen UI/session extension and corrected independent retest

The53-case checkpoint above is retained history. The subsequent UI/session extension was committed at `acdc0c6aedf9f984ff12012374cccff489be6510`, with21-file [native-ui manifest](native-ui.sha256) SHA256 `4c19800eb1aa850d750827fedecaa417a553dc10ae648796d89c5ea8a259031a`. This reviewer independently verified all21 entries before/after and ran the author's exact eight-file command: **73/73 PASS,0 SKIP**,754.673542ms. TAP `/tmp/df-istqb-native-ui-owned.tap`, SHA256 `3afcc0abc60e9abf54334789d6522b37c4e0e03c9740179c1341b1f0d4e491d2`. Independent additional typed-client probes then reproduced two UI consistency defects below; author success was not accepted as sufficient evidence.

The author repaired those predicates and retained separate regression tests in [native-ui-corrections manifest](native-ui-corrections.sha256), SHA256 `377c00caa5d142efe35888b11c9a16b2c4f46d3d546b5ddd79d823d3de5d6207`. The original manifest/TAP remains historical, not relabeled. Corrected exact files:

| File | Corrected SHA256 |
| --- | --- |
| `src/client-entry.cjs` |`39776f4994fb7c3434286ae91c877093ed629b50c450114e1070e5c00dee5c0b` |
| `lib/client.js` |`077e7dc6d445039d04db7153ea84c04e14d4ac93933dfffaaa4c3cfe09d9519d` |
| `test/client-features.test.mjs` |`95492bd9d8de24cb15704b322d68c104512df1e852e265d276a43ff0ef434d8c` |
| Independent `test/client-feature-adversarial.test.mjs` |`1a16cff79b85aa399f7c91e44eb430cb4a426ce529c5e1cce7c0f860a5607a5f` |

Final affected command on held corrected files:

```sh
node --test test/client-feature-adversarial.test.mjs test/native-adapter.test.mjs test/native-runtime-integration.test.mjs test/runtime-plugin.test.mjs test/operator-bridge.test.mjs test/worker.test.mjs test/client.test.mjs test/client-features.test.mjs test/client-build.test.mjs
node scripts/build-client.mjs --check
```

Actual **109/109 PASS,0 FAIL,0 SKIP**,757.516209ms, exit0;34 independently designed probes plus75 author checks. Bundle --check exit0. Original21 entries overlaid by the five corrective entries, plus the independent test, form23 reviewed entries: every hash/check matches before/after. Combined list `/tmp/df-istqb-native-ui-corrected.sha256` SHA256 `be62b27cddef5ee168c98efcf114f6323ef3d533a4b3a7d778ab3be948abd5dc`; final TAP `/tmp/df-istqb-native-ui-corrected.tap` SHA256 `2212d4222edef815d674c06341b9d7e23682aab152289de7f26b4e94a177e6f0`. Original unchanged scratch probe also independently retested34/34, retaining the initial32/34 JSON and exact script hash. The checked-in test is repo-relative and uses node:test; assertion oracles were not narrowed during that conversion.

| Independent family / count | Expected / actual |
| --- | --- |
| Original captured goal/constraints and complete answers /2 |Mutating caller data during digest await preserves the originally captured strings/CAS; concurrent second mutation submits0; one original command writes, busy clears, no grant/dispatch/execute. PASS. |
| Second native session-link fields /9 |After a valid first read/hash, changed actionRef/claimRef/sessionRef/taskVersion/taskRef/generationRef/actionDigest/authEpoch/native raw sessionId in the second read navigates0/writes0; busy clears. PASS. |
| Session hash await invalidation /3 |Disconnect, disposal or fresh snapshot refresh after the first native mapping read denies navigation with0 mutations; paused navigation remains a read, not a grant. PASS. |
| Exact independent report bindings /6 |Wrong task/audit/material/binding/artifact version/body digest never publishes coverage/reports. PASS. |
| Final audit exact task /1 |Equal version/authorization numbers on a foreign task do not establish currentness of the selected task.0reports published. PASS after UI-T02. |
| Approval/source/subscription await invalidation /9 |Each operation crossed with disconnect/disposal/automation reload submits0. Originating lifetime and exact loaded snapshot are checked after digest; no automatic retry. PASS. |
| Plan source/subscription association /1 |Mixed subscription source and pending-plan source never submits an approval. PASS after UI-T03. |
| Complete explicit source policy capture /1 |Caller mutates original provider rate/permission policy after load and during disable await; command preserves loaded complete policy and exact revision, changing only explicitly chosen enabled. No effect grant/tick/register. PASS. |
| Private callback redaction /2 |Uppercase private navigation/digest canary never enters model state; stable RESULT_UNCONFIRMED, busy false. PASS. |

These34 probes run the actual production client model with synthetic RPC/React callbacks. They are deliberately typed module tests. Genuine encrypted owner/RPC/native session and private provider/tool/result/quit composition is supplied by the affected author tests independently executed in the109-case batch, not inferred from the typed doubles. Native session links check actual owned AgentLoop/session object identity and SHA256(raw ID), current task/action/claim/generation/session/CAS; paused owner navigation wakes0 providers. JSON never chooses raw session identity or establishes a role/grant. Tool invocation remains vetoed through the actual scoped public ToolRuntime in this empty-tools phase.

The actual native UI Workspace service is an explicit dependency; the bundle remains lazy/additive and scope-disposed. The rendered tree fixtures exercise escaped prose, labels/fields, original material and distinct verification/delivery/current access/audit coverage. They do not establish real DOM rendering, visual quality, focus, keyboard operation or accessibility.

| Retained AC | Concrete extension proof | Remaining acceptance gate |
| --- | --- | --- |
| BUB014-01 |List/detail/version/epoch coherence, timestamps/stale refresh; report display rejects mismatched material and foreign final status. |Actual rendered list/detail/refresh in isolated authenticated Web; coherent global functional/fault regression. |
| BUB014-02 |Applicable pause/resume/cancel, explicit goal/constraints/complete question answers, loaded missed-plan owner approval; exact concrete preview/expiry grant; these choices do not create/grant effects implicitly. |Actual interaction for each retained task/approval/control state; no claimed instant cancellation or full execution consent from a question answer. |
| BUB014-03 |Double mutation blocked, immutable inputs, disconnect/dispose/refresh/load-currentness await guards, stale/native error handling, busy cleanup; no retry/writes/navigation from a superseded view. |Actual concurrent windows/old pages/host reconnect and meaningful user-visible failure/readback. |
| BUB014-04 |Bounded Chinese/markup/text/records and semantic mock element tree. |Actual supported browser resize/long Chinese/keyboard/focus/empty/loading/error/accessibility/visual oracle: NOT RUN. |
| BUB014-05 |Genuine admitted owner native session mapping, exact hash/current incarnation and second client read; wrong task/generation/version/session fails. Artifacts, scope, receipts and audit coverage retain separate meanings; no public private-review proof endpoint. |Actual native session navigation/artifact/approval UI under authenticated real carrier and another workspace; no credential display. |
| Carried BUB002/006/008/009/011/013/015 |Typed client preserves current instruction/question/context/source/plan/material/consent identities and actual native backend checks them. Source controls and schedule decisions are not effect grants. |All original remaining AC and full cross-stage security/context/source/resource/native/visual oracles; selected live chat carrier portions OUT this phase. |

**UI-T02 — CLOSED.** Original inspectAudit final status reread compared only version/authEpoch. A foreign taskRef with equal numbers returnedtrue and published the report. Author requires exact selected taskRef too; original no-publish oracle passes. This was a client consistency failure, not an observed core owner/authorization bypass.

**UI-T03 — CLOSED.** Original approveSchedule found source and subscription at matching revisions but did not require subscription.sourceRef to equal plan.sourceRef. A mixed association submitted an approval. Author adds exact association before digest/write; original no-submit oracle passes. The actual core already rejects this mixed pair; no backend effect/grant bypass was claimed.

Initial immutable scratch script `/tmp/df-istqb-ui-session-probes.mjs` SHA256 `89613a9595a5be6d3949fd7a482960dfabb06f30c7eb9fae4f8362e1ae7e3a9d`; first32PASS/2FAIL JSON `/tmp/df-istqb-ui-session-probes-first.json` SHA256 `4a4269f764eb8edb511a10f5ecea9ba6b74cafe14e4038dd266b89e74f3071ec`; unchanged corrected34/34 JSON `/tmp/df-istqb-ui-session-probes-fixed.json` SHA256 `880ec08e7ad617a6fe59305c44c75e023656bd8946faba39cc668488ca629411`. Root may archive those raw artifacts without changing them. No assertion, retained source criterion or failing evidence was removed.

**Corrected UI/native module test-design checkpoint PASS; whole source-ticket/MVP/visual/release acceptance HOLD.** No remaining UI test-design defect is open in this reviewed bounded unit. The separate correctness verdict remains blocked, root's corrected/global commit/manifest is not represented by the earlier acdc0c6 source, and the newly proposed actual-host fixture has not been run by this lane. No browser, auth-backing change, host launch or denied experiment was performed. Final coherent-tree regression and applicable acceptance debt remain required.
