# Stage3 independent native/client test review

Reviewer `/root/istqb_review`, Sol6.1/max, independent of native/client/root authors and correctness reviewer. **PASS for the held public-library/module checkpoint; actual browser, full source-ticket and consolidated acceptance remain HOLD.** This review uses the installed official DSH Web0.2.1-alpha.1/Cordis4.0.5-alpha.1, synthetic private identity, temporary encrypted SQLite/JSONL and bounded local deterministic providers. No listener, Web profile/browser launch, credentials, external model/provider, install or Git mutation was performed.

## Exact independent run

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
