# Ordinary execute R7B public diagnosis

2026-10-08; independent Sol6.1 max diagnosis lane, /root/ordinary_execute_ack_diagnosis.

**The exact server acknowledgement cause remains NOT_ESTABLISHED. R7B's one step/end and turn/end cannot show that the native driver finished before the client timer: the fixture publishes those counters after cleanup, and the original host appends both ends in finally on success, error or abort.** The inspected public completion chain contains a resolver for its idle activity; it does not establish a never-returning promise or justify a numerical timeout increase.

The concrete static mismatch is narrower: this synchronous workerExecute waits for full native completion under a60000ms product deadline, while its caller destroys the selected HTTP request after at most2000ms inside shared work and has a2500ms outer RPC step. No headers are written until the operation returns. This mismatch can preempt an otherwise valid operation and abort its currentness carrier, but neither source nor R7B proves that it was the actual server-side cause.

The smallest discriminating correction is a fresh fixture observation through the original public whenIdle interface at the exact owned agent's first running transition. It needs no host wrapper, replacement method, additional dispatch/HTTP, provider change or timeout change. Root must freeze any subsequent implementation and supported once execution separately.

The diagnosis authority is [R8 freeze](../../ni6-positive-one-worker-r8-acknowledgement-diagnosis-freeze-2026-10-08.md) and [individual agent-loop scope amendment](../../ni6-r8-ordinary-agent-loop-read-scope-2026-10-08.md). The amendment is1321 bytes, SHA2562574789333199c3b24e65848834d5f53988cd6e73f93a393f92ce938cf77de47. AGENTS, R7/R7B authority, the full root actual-return proof, four small closed execution JSONs and both final actual assessment pairs were read. Saved root-plan/source-manifest graphs were not re-audited; their preserved pins and full-graph claims are used only as qualified public evidence from the sealed root record.

The actual proof is13492 bytes, SHA256c0e5ea7289cfa0058ffaa0048aa7aa203a3e7b67e2b90c2843b8f672b38d2f78. Its established result is consumed FAILED_HOLD / driver exit1; WORKER_EXECUTE/REJECTION/refusalNONE/HTTP19; REQUEST_STARTED/TIMER_EXPIRED/NOT_RETURNED; create ready, one request/stream/turn/step and tools0. All15 pure contract cases pass. Actual commitment, acknowledged usage, result, stop and reservation release remain NOT_ESTABLISHED.

| Ordinary call/return boundary | Exact source lines | Source-supported fact |
| --- | --- | --- |
| Selected caller | fixture.mjs:12,38-48,171-191,218,315 | HTTP<=2000ms and RPC step<=2500ms; work24s/final30s. No complete operation timeout equivalence follows. |
| Original HTTP/gateway | dsh-host-webserver/lib/index.js:228-259; dsh-client-connection/lib/index.js:34-38,82-88,640-655,695-696 | Route awaits the handler; headers follow handler completion. Early socket close aborts its original signal. |
| Owner operation | operator-bridge.mjs:89-119; installed-invocation.mjs:42-59 | Original operation is awaited under operator/service/signal currentness. Abort cannot erase already admitted durable work. |
| Installed worker | installed-worker.mjs:253,259-262; runtime-plugin.mjs:227-238,490,494,506 | Original marked normal execute forwards to executeContext with60000ms, then synchronous guards and return. normal-native-rpc.mjs:8-15 adds other owner operations; it is not the workerExecute handler. |
| Ordinary operation race | normal-native-operations.mjs:61-69; worker.mjs:10-15 | One native completion is awaited/raced, with synchronous observation after it; original deadline cancellation does not prove closure/release. |
| Native execution | native-adapter.mjs:317-333 | One send at327; await whenIdle at328 is its final execute await. Result/stream verification and return follow synchronously. |
| Activity promise | dsh-agent-loop/lib/index.js:854-900; dsh-agent/lib/index.js:398-400,643-667 | Fresh driver.promise is installed before running is emitted; withInitiator returns kick's exact promise and its then settles driver. whenIdle follows stable activity; no initiator-drain await occurs in this path. |
| Deterministic stream | dsh-llm/lib/index.js:2277-2365; installed-owned-stream.mjs:4-26; testing-provider.mjs:103-125 | Finite approved text/usage/stop producer; original host/owned iterators await next and terminate on done. Stream middleware, failure and cleanup can intervene; a stream counter does not prove producer completion. |
| Counter qualification | dsh-agent-loop/lib/index.js:990-995,1025-1033; fixture.mjs:274-278,330-339 | Ends are appended in finally, and exported counts are collected after cleanup. Their ordering relative to the timer is absent. |

All product basenames in this table refer to the corrected frozen R7B package under .runtime/ni6-positive-one-worker-r7b/package/src/, never canonical src/native-adapter.mjs. The fixture is .runtime/ni6-positive-one-worker-r7b/fixture.mjs. Host basenames resolve under .runtime/dsh-web/node_modules/@deepseek-ai/. The exact public files and seals are below; selected ordinary ranges were inspected, not a broad runtime or protected-domain audit.

The public idle-promise observer can attach safely at running. wakeDriver installs activityDone at860, then setPhase emits running at861-867, before withInitiator(kick) at868. A listener on the exact already verified workerAgent can therefore call its original whenIdle once and attach contained success/rejection callbacks without returning/awaiting that observer from the event listener. A pre-send observer would incorrectly see the old resolved idle activity. whenIdle itself does not wake, send, cancel or dispose; it waits until activity identity is stable at870-875.

Root can freeze a four-value observation, NOT_OBSERVED/WAITING/RETURNED/REJECTED. Arm only for the selected request's exact owned agent and first running edge, with one attachment; ignore rejection payloads. At the selected first still-unsettled transport failure, latch its current value before req.destroy and cleanup. At a guarded successful RPC return, latch its value there instead. Settled/late callbacks and teardown cannot rewrite the first snapshot. Re-measure the closed result size and preserve the1024-byte cap,1025-byte bounded read and every original oracle.

| First selected snapshot | Meaning and next bounded dependency |
| --- | --- |
| NOT_OBSERVED | This read-only listener did not witness the selected running edge before failure; no driver completion inference. |
| WAITING | The original idle observer has not returned before the first client failure. Provider iteration, middleware, serial turn-stopping or driver continuation can still be the boundary; this is not proof of an indefinitely unresolved promise. |
| RETURNED with no headers | Original stable idle completion was witnessed before the first client failure. The missing acknowledgement lies in later product currentness/observation/return or gateway/response scheduling. It still does not prove committed output or exact worker-operation return. |
| REJECTED | The public idle observer rejected before failure. Preserve the finite fact; inspect no exception name, message, code, stack or content. |
| RETURNED and guarded RPC_VALUE_RETURNED/HTTP_200/NONE | Idle and public acknowledgement are witnessed; success still requires committed exact usage/result plus the independent result/stop/release oracles. |

This observer and the existing transport observer distinguish witnessed driver completion from a missing later public acknowledgement. The exact worker-operation return has no separate standalone public event in this scope: gateway headers occur after handler resolution, and RPC_VALUE_RETURNED occurs after the caller's unchanged checks. Do not equate idle-return with worker-return. If the fresh snapshot establishes RETURNED/no headers, root can separately freeze one internal ordinary value-ready/return milestone around installed-worker.mjs:253 or operator-bridge.mjs:117; no such product observer is authored or selected here.

A behavioral fix cannot yet be specified honestly. If an ordinary await is shown to remain pending, correct that precise producer/continuation contract. If normal server completion is observed beyond the caller window, align the selected execute's HTTP and enclosing step with one finite admitted acknowledgement window inside existing aggregate work/cleanup bounds. Raising only the inner HTTP timer would leave the2500ms outer step and signal revocation intact. No new numeric bound, shortened product runtime policy, blanket timeout increase or budget expansion is justified by the current record.

The meaningful functional oracle remains the genuine full path: exact original host/one deterministic worker; one admitted send/request/stream/turn/step and tools0; acknowledged committed execution with exact input-plus-known-output UTF-8 usage; exact approved result via capture/workerResult; original finish after factual owned stop; final absent exact agent/session identities and reservationHeld=false from the supported interface. Preserve refs/CAS/context/consent/catalog/policy and no retries/replay/adoption. Finish implementation is opaque at normal-native-operations.mjs:127, core.native.finishNormalNativeExecution; no protected final CODE internals are investigated or closed.

Also require the six once-owned Loader removals, preset disposer, post-removal404, complete EOF/owned-group evidence and strict rootClosed observation. Factual stop/release, process-group absence, service disposal and root closure remain distinct. The proposed observation should demonstrate correct attachment to fresh activity and a first-failure snapshot immune to later cleanup; it does not turn event counts into a receipt or balance oracle. All these functional cases are NOT_RUN by this lane. No actual result/stop/release claim follows from this source diagnosis.

Only this fresh report pair is written, then fully read back and externally sealed. No candidate parse/import/check/build/test/run, helper delegation, Git/source mutation, listener/browser/model/network/cloud/credentials action, private runtime/profile/key/database/history/capture/response/error content access or protected receipt/signature/envelope/revision999 work occurs. Source hashing is restricted to these individually selected public source and authority files. R6/R7B remain consumed immutable; no reset/replay/adoption. All87 HOLD/accepted0, strict rootHOLD, CODE BLOCKED_UNCHANGED, locked UI PAUSED without corrected handoff, cloud blocked after the second automatic-review rejection and local-only publication persist.

| Individually selected public source | Bytes | SHA256 |
| --- | ---: | --- |
| `.runtime/ni6-positive-one-worker-r7b/fixture.mjs` | 38353 | `12ceb405f7929f3c405cb39b2c66486ead98f505431d272842d04cfb5a00d6dd` |
| `.runtime/ni6-positive-one-worker-r7b/package/src/normal-native-rpc.mjs` | 1473 | `3f38c5811c076adba5caa42a3985863b05c22abfc3e2eebb1560c519469ce917` |
| `.runtime/ni6-positive-one-worker-r7b/package/src/normal-native-operations.mjs` | 20325 | `278294f6f3a2006298b8fc89180b3deb0e062dd4da5f90efebf25c82afac81fe` |
| `.runtime/ni6-positive-one-worker-r7b/package/src/normal-native-request.mjs` | 2675 | `2118b8775d7b31d8cd8d5213bb515b6fc07834ea1139b0f6cb831b968c937039` |
| `.runtime/ni6-positive-one-worker-r7b/package/src/installed-worker.mjs` | 47301 | `772b6aca59c52780e8e123cc1dd68907507c65adf81d37733e73d9f4fdc435d4` |
| `.runtime/ni6-positive-one-worker-r7b/package/src/installed-worker-facts.mjs` | 21961 | `9443dab98db9937dc10b84ddc14a1c2d1d8751b744d1993357133344925dc5c7` |
| `.runtime/ni6-positive-one-worker-r7b/package/src/installed-owned-stream.mjs` | 1071 | `a059363119a2aac9ba39244cc147c6fc1f5c8d7536e23fe068eed83b28647df6` |
| `.runtime/ni6-positive-one-worker-r7b/package/src/native-adapter.mjs` | 40778 | `78407d88f88f2bce0580040777096d3c3adb9977fe5f5c9145366191274ab18c` |
| `.runtime/ni6-positive-one-worker-r7b/package/src/testing-provider.mjs` | 15937 | `1a45f5c441d4cd98a02297b6633e63960e7c04c793915ec26bcbb830a7648c0c` |
| `.runtime/ni6-positive-one-worker-r7b/package/src/operator-bridge.mjs` | 9944 | `8b0b5e7ede27b4cc1b9c6d97c41b614ab7fc4faf9a0b69a2233da6b3ab170286` |
| `.runtime/ni6-positive-one-worker-r7b/package/src/runtime-plugin.mjs` | 67362 | `b7d1243d463c8425cf0ad7ea1b3eff453dbd8d2c557142413334cf69a4d16095` |
| `.runtime/ni6-positive-one-worker-r7b/package/src/installed-invocation.mjs` | 2341 | `5c07bdfae80e7f624d1e6242a6b7ca97b50c6724860973be1906168fb0d35484` |
| `.runtime/ni6-positive-one-worker-r7b/package/src/worker.mjs` | 36640 | `cfe51d3fa2cc9ed1a5bc584b830c50959d7929dc1866252a7ab5dcac61723e8a` |
| `.runtime/dsh-web/node_modules/@deepseek-ai/dsh-agent/lib/index.js` | 28207 | `7b9aa39474de83115cf890dd7f8904cf0d59df0811cb335ab85565a04f1aac93` |
| `.runtime/dsh-web/node_modules/@deepseek-ai/dsh-agent/lib/types/index.d.ts` | 20779 | `3531899158347ff10627228732c67462c78ea0352e31a7eabc19631f90b08bc1` |
| `.runtime/dsh-web/node_modules/@deepseek-ai/dsh-agent/lib/types/types.d.ts` | 3946 | `5a081173f2064e948b5652f9090ccdc41351fc3ef49d3f9b9e9f11e7ce18bbf7` |
| `.runtime/dsh-web/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js` | 72994 | `00c4814d63f3d1e2754eb09144832d19b30499d6ea444730473f740b587948c2` |
| `.runtime/dsh-web/node_modules/@deepseek-ai/dsh-agent-loop/lib/types/agent.d.ts` | 3414 | `66131a86c5f024fabb77e99103f3f07cdca5818cbce7d6aaecb058197c66589e` |
| `.runtime/dsh-web/node_modules/@deepseek-ai/dsh-llm/lib/index.js` | 103333 | `a8a8288910c8862342cda571d096e1ea4489b01dd0f70b5db28bc86525ee283e` |
| `.runtime/dsh-web/node_modules/@deepseek-ai/dsh-session/lib/index.js` | 89972 | `b847e7ec736ce4049ec40ea0b20753bad5d7c2388785b4369d2bf00baa32472b` |
| `.runtime/dsh-web/node_modules/@deepseek-ai/cordis/lib/index.js` | 60361 | `6a9394c0877ff45218818c6e815edd038f8057e1a1deb390a8d43ec81c57691e` |
| `.runtime/dsh-web/node_modules/@deepseek-ai/dsh-client-connection/lib/index.js` | 35140 | `3950f524aed44e28240140a254cd928ea40eba8e2d04cc8fd04f92a687f5c91d` |
| `.runtime/dsh-web/node_modules/@deepseek-ai/dsh-host-webserver/lib/index.js` | 13284 | `6efea1375eadeff62d5cfb6d1f515ff75a939d40405a62e5d138e8e7a6b18df5` |

The companion JSON records the full input seals, causal chain, proposed observation/decision oracles and retained limitations. Both report self-seals are supplied externally after full readback; no recursive self-pin.

