# NI6 R8: original idle witness and bounded execute acknowledgement window

Root selection, 2026-10-08. This is a fresh, source-only authoring freeze following consumed R7B. Execution remains NO-GO until root fully reads and seals the candidate and both independent affected reviews, constructs the exact once plan, and receives supported execution approval. No acceptance is granted.

## Evidence and purpose

R7B is immutable FAILED_HOLD: the selected execute request started, no headers were observed, and its first transport origin was TIMER_EXPIRED. The post-cleanup turn/step end counts do not prove native completion before that timer. The exact server acknowledgement cause remains NOT_ESTABLISHED.

Root fully read and independently verified the diagnostic pair:

- `docs/evidence/NI6/ordinary-execute-r7b-public-diagnosis.md`, 14604 bytes, SHA-256 `8347ef30acbdc978cce643695c0c2744e01e31a89b8f7f77c3ce2a272abddd5c`.
- `docs/evidence/NI6/ordinary-execute-r7b-public-diagnosis.json`, 31870 bytes, SHA-256 `5a4e9a5ba412e185c10780fe5f1c2b4e2b7bff8ed991fc902fe61c5602e10184`.

The inspected original gateway sends headers only after handler completion. Original workerExecute waits for native execution under a 60000 ms product deadline; the R7B caller capped its HTTP wait at 2000 ms and its enclosing RPC step at 2500 ms. That mismatch can preempt admitted work and revoke request currentness. It is an established source-contract mismatch, not proof of R7B's actual server cause or a proven timer-only fix.

## Exact selected change

Create only a fresh `.runtime/ni6-positive-one-worker-r8/` packet and `docs/evidence/NI6/positive-one-worker-r8-source.{md,json}`. Preserve the predecessor; do not reuse its runtime or once marker. The eight authored artifacts are fixture.mjs, run-once.py, execution-plan.proposed.json, source-delta.diff, README.md, source-manifest.json, and that source-report pair. Do not author or run a root execution plan.

1. Add exactly one closed field, `executeIdlePhase`, with values NOT_OBSERVED, WAITING, RETURNED, REJECTED. Total fixture result grammar becomes 33 fields; keep the other 32 fields and their semantics. No error strings, identifiers, timestamps, private content, or arbitrary diagnostic values are exported.
2. Attach at most one observer using the original public `workerAgent.whenIdle()` at the exact verified owned agent's first `agent/status` running transition while the selected execute request is unsettled. The original driver installs its fresh activity promise before emitting that event. Do not observe before send, wrap or replace a host method, await/return the observer from the event listener, dispatch, retry, or introduce another model/HTTP call. Contain success and rejection callbacks; ignore exception arguments.
3. Latch the idle phase before destruction/cleanup at the first selected still-unsettled transport failure, or after unchanged caller guards at successful RPC_VALUE_RETURNED. Later idle callbacks, finally/end events, cleanup, and transport callbacks cannot rewrite that snapshot. A guarded RPC rejection must also freeze the observation without inspecting error details. WAITING means return was not witnessed before that boundary; RETURNED witnesses original stable idle, not independently the worker-operation return or execution commitment.
4. Only selected workerExecute HTTP acknowledgement may wait up to **10000 ms**, bounded by the unchanged shared work remainder. Its enclosing selected RPC step may wait up to **10500 ms**, also bounded by that same remainder. Other HTTP waits stay 2000 ms and other RPC steps stay 2500 ms. These two finite caller bounds are a jointly selected correction/probe of the mismatch. They neither cover the 60000 ms product policy nor establish the actual server cause. No aggregate budget expansion or product policy change.
5. Keep the 65 package files, client, descriptor, 15 pure cases, 51 phases, 8 create phases, 37 refusals, all routes and original execution/result/finish/stop/release assertions byte-identical or semantically unchanged as appropriate. Recompute compact and pretty worst-case output bounds under the unchanged 1024-byte cap and 1025-byte bounded read. Extend both fixture and executor validators to the same exact enum/field grammar.

## Provenance and review

Preserve every R7B input row exactly, then add necessary explicit public predecessor artifacts, all four final R7B review pairs, five closed execution records, root actual-return proof, diagnosis pair, scope amendment and this freeze, plus copied fresh package files. Compute exact counts, deduplicate by explicit path, and keep owned/inputs/self/review pins disjoint. Copy public files only from explicit manifest-selected paths. No broad runtime enumeration or private read/hash/copy. Host public agent-loop declarations may be selected by the already approved ordinary-agent-loop read-scope amendment; no whole host or full graph re-audit in author/review lanes.

All three proposed execution flags stay false and review pins stay empty. Root alone owns Git, GO selection, supported once execution and actual-result capture. One fresh independent Sol6.1 max code review and one fresh independent Sol6.1 max ISTQB review cover this affected scope. Source checks, import/check/build/test/run, listener, browser, inference and network operations remain unauthorized in author and review lanes. Public source text reads, inert schema/hash/count comparisons and writing this packet/reports are authorized. Coding uses Sol6.1 high or above; English delegated prompts only.

## Original functional oracles and retained gates

One genuine original Context/Loader/persistence/provider worker and one deterministic request/stream/turn/step; tools zero. Original refs/CAS/consent/context/catalog/policy/identity guards and exact committed result plus actual UTF-8 usage remain required. Original capture/workerResult must bind the exact owned source. Original factual finish must establish stop, agent/session absence and reservationHeld=false. Six once-owned Loader removals, preset disposer, post-removal 404, complete EOF/owned groups and strict rootClosed remain independent assertions. Idle metadata never substitutes for them.

Outer 90 s, primary 85 s, setup 20 s, syntax 5 s, functional 35 s, post 25 s, terminal 5 s; fixture work 24 s, cleanup 5 s, final 30 s and 500 ms reserve remain unchanged. Stream caps, once/inode/ownership/drift/official graph, first failure, cancellation, process groups and strict root cleanup remain unchanged.

No consumed fixture reset/replay/adoption. No protected final CODE receipt/signature/envelope/revision999 read, hash, close or reroute. No private profile/key/database/history/capture/response/error content read/copy/decode/hash, personal memory, real or paid inference, live accounts, cloud retry, credentials, global DSH change, UI service or handoff, remote or publication. Cancelled UI record 4da34a6d stays unusable. All87 HOLD, accepted0, root HOLD, CODE BLOCKED_UNCHANGED. UI stays paused while Mac is locked; this ephemeral fixture is not port3080's UI service.
