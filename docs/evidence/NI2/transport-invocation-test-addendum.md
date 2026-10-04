# NI2 independent transport-invocation test addendum

Status: **independent design HOLD against the exact private invocation clarification; documentation only, all new executable cases NOT RUN.** This binds [transport-invocation addendum](transport-invocation-addendum.md) SHA256 `f89d492baf618945210474ef0cfbe709dde9aaf488fd078bce7cfad379a97f44`. Independent owner `normal_integrations_istqb`, separate from author and the flagged CODE experiment. Root authorized this narrow binding before affected source GO. The held [NI2 design](test-design.md) `f37f4b66e2c5f69a818afd83c52c7040cc3cf5c00c47b5d5de5336bd954efaea`, [preview seam design](preview-seam-test-addendum.md) `df4dde5d1445c1c8fe4c27a9b63f700b29b3ecff180d4bd911b15e2542ff0adb` and [worker contract](../../normal-worker-contract.md) `c3c55af46f5ec2dc2f23a045b45129e70201024029fc33a28cc976abdeaa198b` remain unchanged.

## Actual legacy constraint and exact private seam

Read-only inspection of [operator bridge](../../../src/operator-bridge.mjs) SHA256 `968daa6bd54af89ae554acb21560c75a0cf98cd8eb046a26944733b24c7b2e96` and [unchanged old tests](../../../test/operator-bridge.test.mjs) `dd131ed2c325b683dc749ca54cb65072a787e9d797b9fee2646563437297ad04` establishes the concrete compatibility constraint. Current bridge validates active/literal isAlive, exact DSH-admitted captured peer and nonaborted signal before operation(input), then awaits that operation without an unconditional final guard. The old test “capture disconnects mutable input and abort fences only new admission” starts an asynchronous operation, mutates caller input, aborts its request and releases the gate; its expected result stays `{ok:true,value:'original'}`. A new call with that aborted signal rejects REQUEST_ABORTED. This document preserves that exact test/behavior; it did not run it.

The proposed second argument is one private immutable object exactly `{assertCurrent}`. Its synchronous function captures that invocation's original bridge lifetime/connection/OperatorPeer/actually admitted handler peer/native signal. It checks active/literal true isAlive, connection.operator===capturedPeer, admittedPeer===capturedPeer and !signal.aborted. Failure codes are bounded SERVICE_DISPOSED, OPERATOR_REQUIRED and REQUEST_ABORTED. Only trusted operation use of this function opts that invocation into the final after-await check. No caller flag, command name, payload identity, shared latest guard, exposed peer/signal or serializable capability selects this mode. The existing first detached closed JSON argument and special fractional transport meanings remain unchanged.

Normal wrappers call the exact guard before starting, after each asynchronous source/native/preview step, immediately before effect and through the private final current callback when a manager awaits before atomic claim. That guard only narrows authority; current grant/CAS/auth/control/source/permission/native lifecycle predicates still apply. Final core callback remains synchronous with0await/recursive store read. A transport abort after commit may suppress a normal success response; authoritative receipt/claim/stream/output/unknown reservation survives and is queried under a fresh admitted invocation without replay. [Runtime composition](../../../src/runtime-plugin.mjs) observed SHA256 `928bb093c21f923d70eb7abc4b8ccf041117bf54348e88b8b0e953ced3eaa3dc` still composes the existing bridge; the private invocation/current normal wiring is future affected source, not this source read's executable proof.

## Planned discriminating checks

All rows are planned/NOT RUN; each refines existing NI2 lifetime/preview/permission families, without new wire/API or effect scope.

| ID / priority / existing family | Independent expected distinction | Level |
| --- | --- | --- |
| N2T-01 P0 / N2-01/06/14/18 | Each operation receives immutable exact second context with only own assertCurrent function; first input remains detached/frozen closed JSON. No peer/signal/identity/handle/function enters wire, result or config. Callable/proxy/accessor/hidden/inherited/symbol/mixed authority payload cannot select or replace the guard; zero callable payload access. | T/N |
| N2T-02 P0 / N2-06/12/18 | Guard decision table at start: retired/disposed or false/truthy/Promise/throwing isAlive→SERVICE_DISPOSED; original connection/peer or admitted peer mismatch→OPERATOR_REQUIRED; exact current nonaborted positive, aborted→REQUEST_ABORTED. Secret/raw throwing details redact; synchronous check accepts no Promise authority. | T/N |
| N2T-03 P0 / N2-07/12/14; PV03/06/07 | Suspend each source/native/preview resolution independently. Change peer, connection.operator, lifetime or signal before resuming and immediately before effect. Opted normal wrapper refuses with0subsequent grant/claim/create/send/store-effect calls. Exact current positive proceeds; unchanged data still needs normal source/CAS permission. | T/D/N |
| N2T-04 P0 / N2-08/10/12 | Where manager awaits before claim, exact invocation guard survives into final private current callback. Force authority loss after initial wrapper check but before locked effect. Callback adds0recursive transaction/read/await; original core permission/CAS/revoke test remains final linearization. False guard cannot be converted to permit by payload/model bool. | T/D/N |
| N2T-05 P0 / N2-06/07/14; PV06/07 | Run two delayed invocations A/B with different signals/peers and reversed resolution. Abort/retire A while B stays current; A cannot borrow B's guard and B cannot inherit A's abort. After lifetime replacement, captured old guards never authorize replacement work. No shared latest-invocation variable. | T/D/N |
| N2T-06 P0 / N2-12/14 | Operation calls its guard, awaits, then returns after peer/signal/lifetime loss. Opt-in final bridge check rejects bounded code before success publication. Unchanged current positive returns the original result. This is a transport-response fence, not rollback or evidence that an effect never occurred. | T/N |
| N2T-07 P0 / N2-14; compatibility | Preserve unchanged old abort test bytes and result exactly. Legacy operation ignores second argument: caller mutation remains detached and post-admission abort still returns original value. Guard-aware and ignored-second-argument operations under the same channel remain distinct through closure use; no blanket final rejection or command-name heuristic. Other advanced domain validators/fractional rules remain unchanged. | T |
| N2T-08 P0 / N2-08/12/13; PV08/09 | Force effect/grant/claim/publication commit before abort or peer loss; then final normal response may reject. Read original authoritative receipt/versions/reservations under new admitted invocation: retained exact committed/unknown facts,0automatic regrant/create/send/retry/release. Force loss-first order separately:0new commit. Typed counter doubles do not prove either actual stored outcome. | D/N/P |
| N2T-09 P0 / N2-14/18 | Creating bridge, capturing context, installing normal wrappers, boot/status/subscriptions and final readback create0policy/grant/claim/preview/session/provider effects unless that explicit operation requires them. Current status/reconcile is observational; stale handlers/guards cannot resurrect an owned lifetime. | T/D/N/P |
| N2T-10 P0 / N2-15/18 | New guard codes retain exact bounded transport error/message/details and no raw peer/signal/request/profile/secret/capability. Current exception allowlist lacks late OPERATOR_REQUIRED/REQUEST_ABORTED mapping, so future guard-aware source must preserve those specified codes through its opt-in path. Hostile error accessors/proxies cannot execute; other errors retain original safe projection. | T/N |
| N2T-11 P0 / N2-02/04/12/18 | Synthetic handler carrier is only T provenance. N/P later establish exact pinned original HostConnectionService/OperatorPeer/Loader/profile/admission and real native signal/class identity, ten owned reloads/full quit and no old private effect. No anonymous RPC, new bridge channel, permission/account/credential or provider is added. | N/P |

## Individual retained source AC mapping

[Retained traceability](../../acceptance-traceability.md) keeps82 original plus five DF010 criteria; original source SHA256 `cf38310f93b9a7bd96efaca8ab53e1d71c16e86d6810513807c4b56ed33d1ca3`. These28 bounded transport contributions are individually planned/unpassed. Direct NI2 mappings stay as frozen; cross-cutting ledger/lifecycle/evidence IDs below keep their original retained meaning and require their existing independent D/N/P oracles.

| Retained AC | Additive contribution / remaining oracle |
| --- | --- |
| BUB002-02 | N2T-03/04 stale task/source after await cannot authorize changed work; actual context D/N pending. |
| BUB002-03 | N2T-03/06/08 loss-first stops admission, commit-first preserves actual stopped/unknown facts. |
| BUB004-04 | N2T-06/08 actual committed output/effect survives abort/cancel; no erased/undone outcome. |
| BUB004-05 | N2T-05/08/09 current scoped query, no late/replacement replay; D/N pending. |
| BUB005-02 | N2T-03/04 current immutable worker permission; no extra message grant. |
| BUB005-03 | N2T-05/08 duplicate/unknown work does not reexecute; durable dedup D pending. |
| BUB005-05 | N2T-06/08 response success/loss distinct from actual accepted/claimed/output facts. |
| BUB006-01 | N2T-01/02/05/11 actual captured/admitted native peer; T shape cannot prove N provenance. |
| BUB006-02 | N2T-03/04/06 exact current task/auth/data/permission checks after every await. |
| BUB006-03 | N2T-01/10 private context and bounded secret-safe transport errors. |
| BUB006-04 | N2T-03/04 approved exact source still mandatory; no signal boolean data authority. |
| BUB006-05 | N2T-02/03/04 unknown/denied current authority stops effect; fresh scoped reads remain separate. |
| BUB008-05 | N2T-03/04 current source/ledger facts at original final effect boundary. |
| BUB011-04 | N2T-01/02/04 caller-ready/permission/proof flags cannot establish native currentness. |
| BUB011-05 | N2T-03/05/08 drift/disconnect preserves unknown work, no automatic recreation. |
| BUB012-03 | N2T-08 no free abort retry/regrant; actual cumulative reservation D pending. |
| BUB012-05 | N2T-01/09/10 unchanged input bounds and no new boot/cache/effect growth; aggregate caps pending. |
| BUB003-01 | N2T-08 receipt/commit/readback order actual D/P, never inferred from rejected transport. |
| BUB003-02 | N2T-04/08 actual final atomic CAS/auth/current predicate and immutable receipt. |
| BUB003-03 | N2T-08/10 failure retains storage facts and safe uncertainty; real IO/crypto D pending. |
| BUB014-02 | N2T-06/08/09 explicit operation/result/reconcile states; U controls remain HOLD. |
| BUB014-03 | N2T-03/05/06 late replies/concurrent invocation guards cannot authorize another request. |
| BUB001-02 | N2T-05/09/11 owned reload seals old callbacks; ten actual reloads N/P pending. |
| BUB001-04 | N2T-08/09/11 actual full quit/restart holds, window/browser distinction HOLD. |
| BUB016-01 | Exact additive hashes, unchanged legacy evidence and planned residuals; no executable review claim. |
| BUB016-02 | N2T-03/04/11 normal installed execution contribution; actual M/N/P/aggregate acceptance pending. |
| BUB016-03 | N2T-03/04/05/08 actual loss/race/restart matrix still D/N/P pending. |
| BUB016-04 | N2T-11 genuine physical package/original native peer P NOT RUN; preview/no release. |

## Hold and execution boundary

No unresolved additive API/design mismatch remains against f89d492b. The private bridge guard/wrapper propagation and exact final original manager/core callback are source implementation dependencies, not pending owner configuration. The unchanged old test is a source constraint here, not a newly executed pass. Later new independent tests must preserve first outcomes and all original test bytes under separate root source/executable leases. T closures prove only invocation/currentness shapes and counters; actual admitted native peer/signal/permission is N, actual receipt/reservation/commit-before-abort is D, bare installed package/full quit/restart is P. No product test/source/native/provider/Git/CODE/browser operation ran for this document. CODE/browser/model/full82+5/MVP/release remain HOLD; the separate NI4 103/103 typed result is not reused or relabeled. Root must hold this exact document before affected source GO.
