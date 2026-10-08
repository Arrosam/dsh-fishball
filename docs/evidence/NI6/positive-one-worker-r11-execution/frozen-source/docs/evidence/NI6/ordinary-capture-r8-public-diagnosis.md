# Ordinary capture R8 public diagnosis

2026-10-08; independent Sol6.1 max root-cause lane, /root/ordinary_execute_ack_diagnosis.

**A concrete ordinary producer/validator mismatch is established: the original compact text stream stores N texts with N−1 timing gaps, while frozen normal-contracts.mjs:38 requires N gaps and rejects an empty gap array.** The approved single-delta producer therefore creates dt=[]/texts=[one], which this validator rejects. This is a specific source correction, not a timer issue. The exact first refusing guard in consumed R8 remains unwitnessed because earlier guards could fail and native-adapter.mjs:356–357 collapses every live-hook exception to WORKER_RESULT_UNAVAILABLE.

The minimal correction is confined to the ordinary text-chunks branch: allow dt minimum 0, keep texts minimum 1, and require dt.length + 1 === texts.length. Refresh the authentic copied package descriptor's public validator pin to match the corrected bytes under a fresh root freeze. Preserve the existing numeric, text, time, index, array, exact-field, record-type and bound checks, plus every source/currentness/identity/content/usage/persistence/result/stop/release guard. No host/provider change, extra dispatch/model/HTTP/retry or numeric timeout change is proposed.

Authority is [R9 freeze](../../ni6-positive-one-worker-r9-capture-diagnosis-freeze-2026-10-08.md), 5,677 bytes, SHA256 5a1bfc3b23096f0c2156d1c95da4c163b4c2aeab229a4ffe16a75e19c937fdb6, and the [narrow original LLM read amendment](../../ni6-r9-ordinary-llm-source-read-scope-2026-10-08.md), 1,231 bytes, SHA256 d01c091c0f8a33fc745c14e51c4d182ee2ea3b867b086ed66aad8b571af618ca. Parent additionally authorized directly supporting ordinary boundAgent/currentness and trusted installed-invocation functions. The original LLM file identity was independently matched to the pinned manifest; no backend or inference implementation was investigated.

The fully read root R8 actual record is 16,510 bytes, SHA256 676e95f50e8b0223fb68e1edd6f8821cd5586728974aca73ade6a5f955a2bb2f. Supported return chunk7597b6 is exit 1. The original execute returned HTTP_200/RPC_VALUE_RETURNED, idle RETURNED, no transport failure and passed exact input-plus-known-output UTF-8 actual usage/digest assertions. Query passed its unchanged guards. Capture then refused at WORKER_CAPTURE/REJECTION/WORKER_RESULT_UNAVAILABLE, HTTP request 21. One request/stream/step/turn and zero tools, 3 header cases and 12 projection cases were recorded. Actual captured/returned result, factual worker stop, reservation release, later finish/final status/post404 and strict root closure remain NOT_ESTABLISHED. Absent child groups with complete EOF remain separate observations. Earlier exact acknowledgement latency cause, general timer-only fix and enclosing monotonic duration remain NOT_ESTABLISHED.

| Original public producer → ordinary validation | Exact source lines | Fact |
| --- | --- | --- |
| Approved deterministic worker | testing-provider.mjs:119,121,123 | One text delta, then usage and stop. |
| Compact text record | dsh-llm/lib/index.js:1171–1183 | First record sets dt=[] and texts=[chunk.text]; each later contiguous delta adds one gap and one text. |
| Durable snapshot | dsh-llm/lib/index.js:1234–1247 | Removes only lastTime and copies the gap/text arrays unchanged. |
| Original assistant event | dsh-agent-loop/lib/index.js:396–400,449–450,1144–1150 | Feeds the original accumulator and appends its snapshot as stream. |
| Capture live validation | installed-worker.mjs:219–221 | Checks permit/result usage, obtains original live history and validates it. |
| Stored-root projection | native-history-collector.mjs:24–39,69,76–81 | Original flush/open/read precedes nativeEvents and original SurfaceManager projection. |
| Incompatible consumer | normal-contracts.mjs:38–39 | dt minimum 1 rejects the single-delta record; equal gap/text count is also off by one for every nonempty run. |
| Public refusal collapse | native-adapter.mjs:356–357 | Any live-hook throw becomes WORKER_RESULT_UNAVAILABLE. |

These statements derive from original public source, not an actual private stored event. Conditional on earlier capture checks passing and the unchanged producer path reaching stored validation, the mismatch necessarily refuses. The public R8 record cannot identify which check failed first. The static correction is justified independently of that limitation. No stored record is padded, decoded, rewritten or used as acceptance evidence.

The original LLM usage producer is also compatible with the permit contract: BlockAssembler stores chunk.usage unchanged at997–999 and returns it at1096–1099. Agent-loop461–462/1148 persists that same usage; testing-provider121 supplies inputTokens, outputTokens and totalTokens. No source-supported token-field stripping mismatch was found in this producer boundary.

The suggested fresh user/system order mismatch is disproved. Original inbox claim103–110/mutate180–207 appends only agent/inbox/spliced. SystemPromptProjection267–270 creates the first system append; loop1056–1060 appends that system/message before user/message1061. SurfaceManager432–433 pushes sequence order. Session.deriveMessages1554–1568 follows these nodes, and loop1262–1272 supplies that exact array to the provider. The fresh order is system/user/assistant, so validateCommitted143's penultimate-user guard is source-consistent. Reordering the stored surface is not a supported correction.

Successful execute still does not eliminate every earlier capture origin. Native execute330/332 computes committed from stream settlement/input cursor independently of the conditional committedResult assignment331. Installed workerExecute253 checks committed output event and permit usage without requiring committedResult. Native readResult338 can therefore still refuse in principle. Original kick887–900 contains turn errors and settles idle; idle return does not prove a completed persisted turn. R8 checked the one-step/turn counters at execute327, but those counters carry neither stored stream shape, turn-end reason nor persistence/Session agreement.

The finite candidate origins are bounded below. None is selected as the actual first R8 origin. All ordinary product names resolve to the frozen R8 package, never canonical src/native-adapter.mjs.

| Candidate | Existing refusing boundary | Exact source reference |
| --- | --- | --- |
| R01 | Native committed result and binding | native-adapter.mjs:335-338 |
| R02 | Native live handle | native-adapter.mjs:352-354 |
| R03 | Trusted invocation/source/owned agent | installed-worker.mjs:60,66,150-156,221 |
| R04 | Permit usage/result binding | installed-worker.mjs:219-220 |
| R05 | Collector owned binding and idle | native-history-collector.mjs:49-57,104-107 |
| R06 | Original durability flush | native-history-collector.mjs:67-70 |
| R07 | Bounded persistence selection | native-history-collector.mjs:72-80 |
| R08 | Ordinary stored-root schema/projection | native-history-collector.mjs:24-39,81 |
| R09 | Interrupted turn/inbox/limits | native-history-collector.mjs:83-89 |
| R10 | Borrowed original Session and persisted cut | native-history-collector.mjs:90-97 |
| R11 | Committed observation and exact producer events | native-history-collector.mjs:109,131-138 |
| R12 | Completed turn and persisted usage | native-history-collector.mjs:139-140 |
| R13 | Surface cardinality/prefix/message pair | native-history-collector.mjs:141-143 |
| R14 | Post-hook identity and returned facts | native-adapter.mjs:358-366 |
| R15 | Ordinary capture currentness/input selection | normal-native-operations.mjs:71-74 |
| R16 | Opaque original capture call and later return | normal-native-operations.mjs:74-75 |

The specific scalar correction and matching descriptor should be frozen and independently reviewed before a fresh once-only functional run. Preserve all 15 earlier assertions. Root independently reports that existing projection cases C04–C15 cover baseline approval/request records and do not exercise assistantStream (read chunk260189); this is qualified parent coverage evidence, not a new full fixture audit by this lane. R8 remains consumed and must not be replayed. A source pass or reviewed patch does not establish actual capture/result/stop/release.

Only if a separately reviewed fresh run still refuses after this concrete scalar correction, the smallest useful further observation is one closed captureOrigin field with short source-defined codes. It is conditional only; no observation source change is selected for the initial correction. The companion JSON supplies a proposed C00..C30 map covering admission/readResult, live usage/currentness, original flush/open/read, schema including the compact-text timing guard, original surface/inbox/live agreement, committed-event checks, returned native facts and the opaque capture boundary. A fixture-only whenIdle observer cannot select these capture guards because no corresponding public guard event exists in the inspected interface.

Arm this marker only for the exact fresh capture invocation under unchanged operator/currentness/CAS/identity guards. Trusted ordinary code sets constant markers immediately before existing guards or awaited calls; it does not duplicate a guard or call an original method again. Latch the first attempted boundary when the original rejection begins, before native error masking and cleanup, and ignore every error argument. Keep that snapshot immutable against later callbacks/disposal. On success freeze the guarded capture-return code. Deliver only the finite code through the already selected capture HTTP outcome and closed fixture/executor metadata, with no extra call or host-method wrapper. This is a proposal requiring a separately frozen source scope, independent reviews and root execution selection; no observer is authored or run here.

For a 13-character captureOrigin key and three-character values, independent literal ASCII arithmetic adds at most 22 compact or 26 pretty bytes to R8's conservative 812/945-byte maxima, yielding 834/971 within the unchanged 1,024-byte cap/1,025-byte read. This is a preliminary scalar bound, not candidate evaluation; the exact future frozen grammar must be independently remeasured.

Meaningful proposed oracles, all NOT_RUN by this lane, are:

- The actual pinned AssistantStreamAccumulator must produce and snapshot a single-delta zero-gap record that passes ordinary stored-root projection unchanged. Multiple consecutive deltas must retain N texts/N−1 gaps; separate runs retain their own first record and exact text boundaries. Use the original producer, not surrogate hand-built stream records.
- Preserve refusal of empty texts, incorrect gap counts including an invented leading gap, malformed/non-dense/accessor/extra-field arrays or records, invalid original numeric/text/index/time/type bounds and every unrelated ordinary header/event/history case.
- If the finite origin probe is selected, verify exact trusted admission, source-defined codes, first-rejection capture before masking, cleanup immunity, zero added calls and the unchanged bounded grammar.
- On one separately reviewed fresh genuine fixture, require the unchanged committed exact usage/digest acknowledgement, guarded capture and exact workerResult content/source refs/cursor/input and output digests, CAS/context/consent/catalog/policy, one request/stream/step/turn and zero tools.
- Preserve original factual finish, exact agent/session absence and supported reservationHeld=false; then six once-owned Loader removals, preset disposer, post-removal404, the original 25-request complete path, complete EOF/owned groups and strict rootClosed independently.

core.native.captureNormalNativeResult at normal-native-operations.mjs:74 is an opaque boundary. Its implementation and factual finish implementation were not inspected. If a fresh marker reaches this call and refusal occurs there, report that exact dependency and stop there. Protected final CODE receipt/signature/envelope/revision999 remains BLOCKED_UNCHANGED; this diagnosis does not reroute into it or claim to close it.

AGENTS, browser-entry authority, both diagnosis authorities, root actual proof, the four small closed records and R8 source report were fully read. The fifth closed record, root-plan, was consulted through budgets/grammar/selection/terminal metadata; its large pin/source-copy arrays and the full host graph were not re-audited. Manifest reads selected exact public source identities only. Browser absence at01:45UTC is qualified parent evidence, not a new browser probe. Parent reports R8 evidence checkpoint05473800f17b746e6387ccee2dd3a96274f882f5; no Git query occurred.

A preliminary source-selector search and neighboring mixed ordinary ranges incidentally displayed excluded audit/stopped-witness branch snippets. Those snippets were not followed, analyzed or used as diagnosis evidence. No protected final CODE implementation module or actual private profile/key/database/history/capture/response/error content was opened. Source hashes below identify individually selected public modules; they do not claim full implementation audits.

Only this fresh report pair is written. No implementation, candidate parse/import/check/build/test/run, runtime/listener/browser/network/model/credential operation, helper delegation, Git or consumed-evidence mutation occurs. All 87 HOLD, accepted 0, root HOLD, UI paused/no corrected authenticated fixture, cloud twice denied/no third attempt and local-only publication gates persist.

| Individually selected public source | Bytes | SHA256 |
| --- | ---: | --- |
| `.runtime/ni6-positive-one-worker-r8/fixture.mjs` | 39553 | `1798ad35f380f469f2818f9bd04ee4f02f4a340ba03cf82d15612634552dc869` |
| `.runtime/ni6-positive-one-worker-r8/run-once.py` | 33147 | `304710cf2b64706b17f672729ba5e0cbb9e9e93dde90b4008e1f2caf5f565d55` |
| `.runtime/ni6-positive-one-worker-r8/package/src/native-adapter.mjs` | 40778 | `78407d88f88f2bce0580040777096d3c3adb9977fe5f5c9145366191274ab18c` |
| `.runtime/ni6-positive-one-worker-r8/package/src/installed-worker.mjs` | 47301 | `772b6aca59c52780e8e123cc1dd68907507c65adf81d37733e73d9f4fdc435d4` |
| `.runtime/ni6-positive-one-worker-r8/package/src/native-history-collector.mjs` | 12958 | `5473de8f79f8b4aec13ba56f212ef8ee7a32e68e7dee9ce8ce61ed8be1704149` |
| `.runtime/ni6-positive-one-worker-r8/package/src/normal-native-operations.mjs` | 20325 | `278294f6f3a2006298b8fc89180b3deb0e062dd4da5f90efebf25c82afac81fe` |
| `.runtime/ni6-positive-one-worker-r8/package/src/normal-contracts.mjs` | 32057 | `d9a764eb3cf648877a6ee3d1769039fe28621d0242fa71efd2659ff81f850d11` |
| `.runtime/ni6-positive-one-worker-r8/package/src/testing-provider.mjs` | 15937 | `1a45f5c441d4cd98a02297b6633e63960e7c04c793915ec26bcbb830a7648c0c` |
| `.runtime/ni6-positive-one-worker-r8/package/src/installed-invocation.mjs` | 2341 | `5c07bdfae80e7f624d1e6242a6b7ca97b50c6724860973be1906168fb0d35484` |
| `.runtime/dsh-web/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js` | 72994 | `00c4814d63f3d1e2754eb09144832d19b30499d6ea444730473f740b587948c2` |
| `.runtime/dsh-web/node_modules/@deepseek-ai/dsh-session/lib/types/surface.js` | 26100 | `ebe8920a22fca8d987cbacab94c9db92f71df44863f58370a1be559155be734e` |
| `.runtime/dsh-web/node_modules/@deepseek-ai/dsh-session/lib/index.js` | 89972 | `b847e7ec736ce4049ec40ea0b20753bad5d7c2388785b4369d2bf00baa32472b` |
| `.runtime/dsh-web/node_modules/@deepseek-ai/dsh-session-projection/lib/index.js` | 20021 | `022f1d13e25aeb3c18e10407d84c69e018c1c05a65c9ee36ed14d89b185a4fa8` |
| `.runtime/dsh-web/node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js` | 17395 | `ff422afac6ba85f89afa985d921aed0b603feb354a05a549c48eae04cf0d2f57` |
| `.runtime/dsh-web/node_modules/@deepseek-ai/dsh-session-persistence-jsonl/lib/index.js` | 142847 | `0845707017acc2b4a8a75eab2244fa3fd88587b8094ab32014321dce7ca1e31b` |
| `.runtime/dsh-web/node_modules/@deepseek-ai/dsh-llm/lib/index.js` | 103333 | `a8a8288910c8862342cda571d096e1ea4489b01dd0f70b5db28bc86525ee283e` |

The companion JSON includes input seals, the exact static mismatch, finite candidate origins, conditional observation map, proposed correction/oracles and retained gates. Both reports are fully read back and externally sealed after writing; no recursive self-pin.

