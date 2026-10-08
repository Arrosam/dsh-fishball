# R11 independent ordinary lifecycle and requirement diagnosis

Date: 2026-10-08. Independent Sol 6.1 max root-cause lane. This is a read-only source/requirement assessment under the parent's new completion steering from reported local HEAD `87c333e3`; no Git query, candidate execution or implementation change occurred.

## Concrete conclusion

The strict **standalone Context root UID=null/state=4** requirement is an overstrict diagnostic assumption relative to the accepted product requirements and the original host contract. It is not a supported terminal-root operation on this baseline. This conclusion rests on both requirement provenance and original source, not on an assertion having failed. The accepted requirements still demand that full DSH quit stops plugin reception/scheduling, that unload removes owned listeners/entries/resources, and that genuine worker stop, persistence drain, authoritative settlement/release and child disposal are proved separately.

The independent R10 finish blocker remains **NOT_ESTABLISHED**. Original public agent/scope disposal provides joined completion promises; the selected original chain does not prove a self-await cycle or a finite completion-time guarantee. `finishTrace=104` establishes only the existing client timer before observed response headers. It does not identify which server-side finish await was reached or remained pending. Correcting the future root observation cannot fix or excuse the still-unproved actual finish, stop or release.

## Requirement and strict-oracle provenance

| Basis | Concrete requirement or qualification | Consequence |
| --- | --- | --- |
| R1:19–20, 68–84, 474–475 | Full DSH exit stops the plugin; no independent daemon. Unload unregisters listeners, entry points and resources. Repeated reload must not create duplicate scheduling or orphan work. Restart reconciles durable facts before work. | These remain real DF001/product lifecycle obligations. They do not prescribe a standalone dependency-container object's UID or state. |
| R1:141–158 | Use original host creation, readiness, execution, cancellation and ending interfaces with factual state evidence. The ticket does not require an upstream single-session close capability that was never published. | An unsupported terminal API cannot be invented. Supported original AgentHandle disposal now supplies a genuine owned-worker completion boundary. |
| R1:350–351; A1:27–32 | A timed-out worker whose end is unconfirmed continues to occupy its slot. Uncertain reservations and effects remain charged. | No test correction may equate timeout, idle, registry absence, process exit or root restart with worker settlement/release. |
| R2:27, 31, 33, 39; R3:3–9; R4:5, 10, 12–16, 50 | Current owner amendments retain native workers and lifecycle acceptance, map BUB to DF, prohibit another harness/daemon, and require the normal installed path. Original Loader reload seals admission and awaits owned child disposal. | This is required product work. Synthetic local evidence remains partial; full acceptance and blocked gates are unchanged. |
| D1:1–23; D3:18, 22 | Bootstrap preparation/diagnostic work introduced a rootClosed/rootDisposed observation, separate from actual product acceptance. | The root flag originated in the diagnostic caller contract. |
| D2:5–9; D4:3, 25 | The clarification explicitly identified root dispose as restart and conservatively retained the ancestor UID-null/state-4 assertion for that frozen diagnostic. The positive freeze carried it forward and required honest FAILED_HOLD for an active restarted root. | This deliberately preserved a known unsupported assertion in consumed capsules. It did not add that assertion to the accepted product requirements. A future change needs a fresh concrete freeze/review. |

The historical approved source retains its original planning wording and BUB aliases; current applicability is controlled by R2/R3 and AGENTS. R5 is labelled AUTHOR CONTRACT DRAFT and R6 is a lifecycle design, not actual acceptance. Their detailed safety obligations support implementation review and do not manufacture passed acceptance.

## Original supported lifecycle contracts

The paths and full-byte identities behind S1–S11 are in the provenance table below and the JSON pair. Line numbers refer to those exact original public files.

1. **Root versus child.** A runtime-null root is created with UID0/state2 and `dispose = () => this.restart()` (S1:1102–1113). Restart sets the epoch inactive, refreshes, and awaits stable lifecycle work (S1:1410–1414). A normal plugin child disposer clears that child's UID, unregisters the original plugin instance, initiates unload and awaits every current inertia (S1:1075–1089). State4 derives from UID=null (S1:1288–1292). The selected public Context declaration has no separate terminal-root close API (S3:15–100); this is a bounded interface conclusion, not a claim about every upstream launcher module. A settled application/plugin owning fiber can be terminally disposed without making its enclosing standalone root terminal. D2:5 records this distinction for official application shutdown.

2. **Effect disposal has ordering and identity.** Cordis composite effects collect exact yielded disposer identities and run them in reverse order (S1:1175–1196). The first asynchronous cleanup is joined before the next collected cleanup. The effect retains in-flight completion in `effectInertia`; original `runDisposable` uses that retained promise even when a repeated raw call returns nothing (S1:964–967, 1221–1247). Merely awaiting the effect function waits setup and yields a disposer; it does not itself run teardown (S1:1270–1276). No wrapper, private field mutation or private-control invocation is proposed.

3. **AgentHandle disposal is the supported owned-worker primitive.** Its declared contract is a holder-owned capability that stops/drains, unregisters, removes the session and unwinds its scoped registrations; factory unload structurally owns the same handles (S10:130–167). The concrete implementation memoizes one disposal, joins any publication, cancels with cause disposed, awaits stable `whenIdle`, then scope completion, then persistence handle.close, then exact agent/session detaches, then owner-effect unfollow; failures are retained and rethrown (S7:1677–1708). The declaration describes the same final obligations in a different narrative order; the implementation places scope disposal before persistence close and registry detachment. This distinction is not evidence of an actual hang.

4. **The original scope boundary is joined.** `createScope` returns the exact child fiber's raw disposer and a shared memoized quiescent disposer. Quiescence awaits `fiber.dispose()` and follows already-pending inertia until none remains (S5:281–305; S6:59–83). The agent owner's composite yields that exact raw disposer followed by its lifecycle callback. On reverse teardown the callback starts owned-agent disposal; if disposal is already pending it returns without recursively joining that same operation (S7:1713–1721). This and the retained Cordis in-flight promise close the previously missing ordinary source boundary; neither proves the actual finish reached it.

5. **Driver and factory completion are real awaits.** The driver promise is installed before running status, then settled from the original initiator/kick continuation; `whenIdle` follows the stable current activity promise (S7:854–875). Factory teardown seals acceptance and awaits all live-handle and startup promises (S7:1419–1446). Initiator teardown explicitly excludes its own reentrant boundary from the drain (S9:624–667, 682–696). No concrete unconditional cycle is established in these selected original interactions.

6. **Disposal and durability observations remain separate.** Agent and session detach closures remove only the exact live entry, with deferred removal around publication/append critical sections and contained disposed notifications (S9:510–560; S11:1755–1773, 1806–1817). Original SessionStore.flush awaits all participating durability listeners and propagates failure after they all settle (S11:1819–1854). The handle.close call is joined by the agent disposer; the earlier sealed D5/D6 contain the selected ordinary persistence producer assessment. Its body was not re-expanded in this lane. No finite wall-clock bound follows from these Promise contracts.

Cordis unload concurrently joins its registered disposers and contains/logs their rejections (S1:1372–1383). Consequently a settled restart, stable child UID-null/state-4, or historical disposed-event count alone cannot prove successful cleanup of every underlying resource. Existing factual resource/stop/settlement observations and retained original child handles remain necessary. Global root observers may already be removed during child teardown; D2:9 forbids treating those counters as continuous coverage or post-close service queries.

## What the consumed R10 actual evidence establishes

E0's identity exactly matches the parent's sealed proof: 22,776 bytes, SHA-256 `0e59d6dc2b05b7522135f96c4fac6ecd20be7f0c471ee1717e4e6f05c389c1f8`. E1–E5 are its five closed public records; no raw actual stream, profile, log, database, key, capture, response or error content was opened.

The once-only supported return `0a9928` was exit1, after the initial supported chunk `eda2d9` and poll `b5806f`. Guarded execute returned HTTP200/RPC_VALUE_RETURNED with the original idle witness RETURNED and no execute transport failure. Execution commitment, genuine capture and the exact ordinary returned-result source/input-digest/usage/disposition oracle were reached. The first work failure is WORKER_FINISH/REJECTION/refusal NONE, at HTTP23, with finishTrace104: CLIENT_REQUEST_PREPARED / NO_HEADERS_OBSERVED / EXISTING_CLIENT_HTTP_TIMER. Server receipt, a server refusal, the pending server await and its latency are unobserved.

Factual worker stop, agent/session absence before teardown, release, final status, six-owned-entry closure, post-removal404 and the positive path remain unestablished. E1 truthfully records workerStopped=false, reservationReleased=false, ownedEntriesRemoved=false, positivePath=false and rootClosed=false. The later cleanup entryRemoved=true and completed native counters cannot replace any missing finish proof. Executor EOF/process-group closure is separate. The original strict root oracle remains FAILED_HOLD for this immutable R10 run; no result is reclassified or replayed.

E5 explicitly repeats the standalone-root qualification. Its selected wait metadata also confirms the ordinary finish caller still has the existing 2s HTTP and 2.5s RPC waits inside the fixed work budget. The original host completion contracts provide no 2s guarantee; this is a caller/latency exposure, not proof that increasing a timeout would fix the server path. Existing execution and timing evidence was not rerun or reconstructed.

## Proposed fresh supported correction and meaningful oracles

The proposed change is **future source/test selection only**, not execution GO, acceptance, or a retroactive change to R10:

- Replace the unsupported standalone-root-terminal assumption with an explicitly named observation of the original root unload/restart completing and its owned installed resources actually closing. Keep the original root dispose call; do not call it terminal close or report rootClosed=true for UID0. Retain original child Fiber handles returned by the existing eleven plugin installations, without adding installations, wrapping a host, introducing another application/harness or changing provider/session ownership. Join their original disposal/await boundaries and require their exact UID-null/state-4 terminal observations. The six existing owned Loader entries keep their original removal/joins and same terminal checks. If an exact retained child cannot be proved disposed, closure remains unknown/HOLD.
- Before destroying services, require the genuine once-only workerFinish value with exact current source/result/usage/CAS authority, the same original worker child UID-null/state-4 and exact agent/session absence, drained owned persistence, factual returned settlement and reservation disposition, final authoritative status, preset release, each owned-entry removal, and the existing post-entry-removal404 while the original WebServer still exists. Admission must already be sealed. Root teardown, service disappearance, process exit and timer expiration remain unable to discharge an unresolved worker/ledger obligation.
- Preserve all existing 23 stream/header/projection contract assertions and five finishTrace controls, one admitted request/stream/turn/step, zero tools, source/full-graph unchanged checks, budget limits, private-content exclusions, EOF/group closure and every uncertainty guard. Any future schema/oracle rename needs a fresh closed finite grammar, literal byte-bound review, author/code/ISTQB review and root readback; this report supplies no candidate bytes or tests.

This corrects the test's unsupported root expectation while retaining and making explicit real owned-lifetime cleanup. It does not satisfy the separate full DSH quit/restart product criterion merely by testing a standalone container. The genuine original application/profile owner shutdown is the appropriate future host-level quit oracle. This lane neither invokes it nor invents an upstream terminal-root API.

If the pending actual finish origin is still needed, the smallest useful next discriminator belongs at the existing once-only ordinary finish call/await boundaries, under a new reviewed freeze: one finite monotonic field recording which allowed boundary was entered/completed before destructive cleanup. Useful boundaries are ordinary before-stop validation, exact public owned disposer completion, stopped validation and returned guarded finish. Values must be latched into the existing bounded result before timeout cleanup, ignore late callbacks, reveal no error/payload content and add no dispatch, model, HTTP, polling or retry. A client-only104 cannot choose among these server-side boundaries. Root owns the actual handler trace and may choose a more specific source-proved correction; this lane does not select or execute instrumentation or a longer timeout.

The parent has meanwhile selected a separate source-only R11 server-wait diagnostic: one fixed seven-ASCII `finishWait` marker around existing ordinary finish/history awaits, frozen by the original client terminal observation, with the current 2s finish/shared24s budgets and strict root observation preserved. Its authoring freeze and diagnostic consolidation are recorded as parent-reported metadata in the JSON pair, not independently read or reviewed by this lane. No runtime result follows. The owned-child root-oracle correction remains a separate proposal requiring its own review; it is not substituted into that diagnostic. Genuine cleanup-failure HOLD qualifications remain mandatory.

## Limits and disposition

Actual server-side finish cause/self-await is NOT_ESTABLISHED. The selected original public lifecycle promises are supported but have no proven finite completion bound; third-party registered effects, persistence and opaque core finish can still defer completion. Opaque core.native capture/finish bodies and protected final CODE receipt/signature/envelope/revision999 remain BLOCKED_UNCHANGED. No inference about their internals, ledger release or exact actual failing guard follows from event counts.

All87 HOLD / accepted0 / root HOLD remain. No implementation, test, producer evaluation, runtime/listener/browser/model/network/credential operation, Git mutation, helper delegation, cloud retry, remote or publication occurred. Browser and final CODE gates remain blocked, and twice-denied cloud action receives no third call. Only this fresh report pair is authored, with repository-absolute O_EXCL creation after exact absence checks and full final readback before external byte/SHA seals.

## Exact public provenance

All identities below were measured directly from the selected public files in this lane. Hashing these public files is not a full-graph re-audit or a claim that every byte was semantically inspected. The JSON records the exact full-read versus selected-read qualification. S5/S6 are the explicitly parent-authorized narrow ordinary scope extension, independently matching the parent's reported source seals.

| ID | Repository-relative file | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| A1 | `AGENTS.md` | 8292 | `f7b4685d6c376159a9de2114c10acd3c08710ceed732b4ea7f07f7ed404e95ba` |
| R1 | `docs/reference/approved-ticket-review.zh.txt` | 45578 | `cf38310f93b9a7bd96efaca8ab53e1d71c16e86d6810513807c4b56ed33d1ca3` |
| R2 | `docs/owner-amendment-2026-10-04.md` | 5304 | `92f1b4b2cae959e88e6e35a351c253e186ef4b3567f2f048cd60fc7017b8a89e` |
| R3 | `docs/owner-normal-entry-continuation-2026-10-04.md` | 2024 | `e1370ac0a8fe31be56a111d443a1110307d195e2c24389470619df5716351078` |
| R4 | `docs/normal-entry-integration-plan.md` | 13532 | `19b983febe21f74a75c1a9b87862b47342ef855bb88f240d5ec72834b65820d0` |
| R5 | `docs/normal-worker-contract.md` | 51095 | `c3c55af46f5ec2dc2f23a045b45129e70201024029fc33a28cc976abdeaa198b` |
| R6 | `docs/prep/W2/worker-lifecycle.md` | 14564 | `a4c9adedb041a1b8db40b242380eebb9661e5e3eae40439a25546de90ae090c9` |
| D1 | `docs/ni6-bootstrap-diagnostic-r1-freeze-2026-10-07.md` | 8555 | `3b3f9cd28317c5b94b3c8f1564d1b53483efc5088753c18a69027b3a1a9f9d40` |
| D2 | `docs/ni6-bootstrap-diagnostic-r1-lifecycle-clarification-2026-10-07.md` | 2845 | `37d5a51c8fb5d1ccbec5727a7de998c33a7f951564caef4aa5e898430c3b9826` |
| D3 | `docs/contracts/ni6-public-preparation-diagnostic-v1.md` | 2079 | `c68c943a72438940f19196d2f12e8d1f862231af9b9496562d93beebdcc66bf2` |
| D4 | `docs/ni6-positive-one-worker-r1-freeze-2026-10-07.md` | 8057 | `9771c74235b594a9480882447f5602ee780500de4466ef710c1f874ea99aa134` |
| D5 | `docs/evidence/NI6/ordinary-finish-r9-public-diagnosis.md` | 20812 | `6b46da880313ee548917f29adc59efef5c1261fb001224216da1bfe839280421` |
| D6 | `docs/evidence/NI6/ordinary-finish-r9-public-diagnosis.json` | 41244 | `92922d5518c869f9d2861b8657f890cfb85a29e01f8acbd7b3e6d6b4e7b96897` |
| E0 | `docs/evidence/NI6/positive-one-worker-r10-actual-return.json` | 22776 | `0e59d6dc2b05b7522135f96c4fac6ecd20be7f0c471ee1717e4e6f05c389c1f8` |
| E1 | `docs/evidence/NI6/positive-one-worker-r10-execution/fixture-result.json` | 912 | `a832a85d83d90c5df6487d8a67d49ef39a23f74db57a3d2ca64d28bd0a64ce3e` |
| E2 | `docs/evidence/NI6/positive-one-worker-r10-execution/executor-result.json` | 4621 | `378e29b67db7a4af0b26eacd4ad5e6c1468eceda8e8a66d082eed78be3f02b3b` |
| E3 | `docs/evidence/NI6/positive-one-worker-r10-execution/command-results.json` | 2999 | `300385526f409192c896bdce317efc1342bf041b080f21501763315b3fe64d90` |
| E4 | `docs/evidence/NI6/positive-one-worker-r10-execution/before-after.json` | 286 | `3a0db5de5f5e87dc3be9297836d90e98bbe68613c7dc75533b2a81eb309c8d1b` |
| E5 | `docs/evidence/NI6/positive-one-worker-r10-execution/root-plan.json` | 216706 | `52b81e64ee07e78e6e27c2958f6e3a215a6240f027de4ee844763a6c1677cfb3` |
| S1 | `.runtime/dsh-web/node_modules/@deepseek-ai/cordis/lib/index.js` | 60361 | `6a9394c0877ff45218818c6e815edd038f8057e1a1deb390a8d43ec81c57691e` |
| S2 | `.runtime/dsh-web/node_modules/@deepseek-ai/cordis/lib/types/fiber.d.ts` | 8430 | `eec0d229849c8a293ede90cc2b107c54262db28acfdcdf9181cfec5cd1d0a7d4` |
| S3 | `.runtime/dsh-web/node_modules/@deepseek-ai/cordis/lib/types/context.d.ts` | 4749 | `ddbdfbaace4a8e1982dded8fdb9a05b3f14b4db3613628caff53e623542f5b71` |
| S4 | `.runtime/dsh-web/node_modules/@deepseek-ai/cordis/lib/types/index.d.ts` | 858 | `51237bf92ef225c92c897c5fb0aa8e4482267a5ae6ff1cf768726a40c9a7db86` |
| S5 | `.runtime/dsh-web/node_modules/@deepseek-ai/dsh-scope/lib/index.js` | 12151 | `2829df71d76e08941457d4dd173eac60783e55354921137c8b75e8b5c0d2ecca` |
| S6 | `.runtime/dsh-web/node_modules/@deepseek-ai/dsh-scope/lib/types/index.d.ts` | 5168 | `203beba1f2b00636990eefa4fe763207c1d657987a16531ca89dc6de3713f96e` |
| S7 | `.runtime/dsh-web/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js` | 72994 | `00c4814d63f3d1e2754eb09144832d19b30499d6ea444730473f740b587948c2` |
| S8 | `.runtime/dsh-web/node_modules/@deepseek-ai/dsh-agent-loop/lib/types/agent.d.ts` | 3414 | `66131a86c5f024fabb77e99103f3f07cdca5818cbce7d6aaecb058197c66589e` |
| S9 | `.runtime/dsh-web/node_modules/@deepseek-ai/dsh-agent/lib/index.js` | 28207 | `7b9aa39474de83115cf890dd7f8904cf0d59df0811cb335ab85565a04f1aac93` |
| S10 | `.runtime/dsh-web/node_modules/@deepseek-ai/dsh-agent/lib/types/index.d.ts` | 20779 | `3531899158347ff10627228732c67462c78ea0352e31a7eabc19631f90b08bc1` |
| S11 | `.runtime/dsh-web/node_modules/@deepseek-ai/dsh-session/lib/index.js` | 89972 | `b847e7ec736ce4049ec40ea0b20753bad5d7c2388785b4369d2bf00baa32472b` |
