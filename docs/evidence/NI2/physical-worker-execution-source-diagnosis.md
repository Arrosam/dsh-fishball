# NI2 physical worker execution: independent source diagnosis

This is the new root-authorized source-only functional root-cause lane for the first physical worker execution on frozen archive `a58c522`. `/root/native_functional` performed no product/native/context import, executable test, host launch, HTTP request, native send, model/provider/tool invocation, credential/key access, database read/write, installation, product/helper mutation or Git operation. The only new deliverable is this document. This is not CODE review or a route around the recorded CODE platform block.

**A concrete instrumentation defect was found:** both root-owned physical request observers register a callback on the original `agent/request` waterfall but omit `next()`. The startup observer is inserted before the later physical observer. Original Cordis interprets omission of `next()` as a veto of the remaining chain and its final request configuration. The callback returns `undefined`; original AgentLoop subsequently reads `proposedConfig.provider`. This explains an actual turn and step ending without reaching the later observer, adapter stream or provider output. It is a helper fixture defect, not a proposed weakening or repair of the frozen product's authority gates.

The smallest read-only confirmation is the existing startup observer's `agentRequests` count, expected to be `1` for this single attempt. If needed, root may independently extract only the existing original turn/end reason kind and a strictly allowlisted undefined-request-config/TypeError category. The complete raw error, session content, credentials and private keys are unnecessary. This source investigation does not perform either read or report an unprovided runtime result.

## Actual observations supplied by root

Root reported that the original CLI runs as PID `91790` on the same port `3080`, following an approved original sandbox bind and declaration of a matching original read-only/never preset. Actual original class/fiber/backend/profile facts passed. Actual native owner setup, storage, policy and action consent completed, and one idle worker was created. These are root physical observations, not independently repeated executions here.

The held initial `physical/smoke.mjs` failed `ERR_ASSERTION` at `one-explicit-source-owned-stream`: `workerExecute` returned `ok`, but its execution projection was `unknown`, without committed output or actual usage. Root preserved this first outcome.

Root then performed original authenticated read-only status without a wake or replay. The safe metadata file `evidence/root-first-chain-readonly.json`, SHA-256 `c76a862d036a60f6d01706f640e84e1135c8f4c2151f2bf07a1bd2f14eec7a6f`, contains:

| Fact | Original observed value |
| --- | --- |
| Task | `running`, version `3`, auth epoch `1` |
| Action | `dispatch_intent`, outcome `null`, usage state `estimated` |
| Native worker | `ready`, cursor `8`, reservation still present |
| Context execution | `dispatch_intent` |
| Artifacts | `0` |

Root's subsequent read of existing passive observation supplied event count `8`: `other:4`, `turn/start:1`, `step/start:1`, `step/end:1`, `turn/end:1`. Assistant frames, the later physical observer's agent requests, stream entries and tool attempts were each `0`; one original agent was idle and one session remained. Warnings were `3`, logger errors `0`, with no allowlisted error codes or categories. No initial-create cursor was separately retained; current cursor `8` is not evidence of its initial value.

The turn and step boundaries materially refine the first hypothesis. They show that the owned native wake and initial pre-step progressed. A failure before `agent.send`, or before the step entry in prompt assembly/pre-step, does not explain this observed step/start. The relevant boundary is original step → request preparation → the `agent/request` waterfall. A zero later observer counter does not mean that no earlier request callback ran.

## Exact original and frozen source chain

| Boundary | Source and reasoning |
| --- | --- |
| Authenticated installed invocation | Frozen `operator-bridge.mjs` lines 87–119, `installed-invocation.mjs`, and the installed manager binding in `runtime-plugin.mjs` preserve the admitted original peer, request signal, exact context/carrier and lifecycle checks. No denial bypass is proposed. |
| Durable dispatch consume | Frozen `worker.mjs` lines 126–160 begins the context intent and calls original `assertExecutionCurrent` through the adapter's synchronous admission callback. The actual `dispatch_intent` is retained; it is not success, result capture or release. |
| Native bind and wake | Frozen `native-adapter.mjs` `executeContext` validates the exact context and owned idle agent, awaits model resolution, consumes dispatch admission, invokes `bindExecution`, then calls the exact owned `agent.send(..., 'next-turn', true)` with no intervening await. The actual turn/step evidence places this attempt beyond the proposed pre-send failure branch. |
| Binding hooks | Frozen `installed-worker.mjs` lines 163–167 checks the bound agent and context origin, captures the exact invocation token, and issues the private original testing-provider permit. Issue does not itself invoke the provider. No source defect at this binding hook is established by the observed failure. |
| Original native driver | Original `dsh-agent-loop/lib/index.js` lines 800–805 splices/wakes the input, lines 854–871 reserve a driver, and lines 937–1034 append turn and step boundaries. `preStep` at 902–929 assembles the prompt and proposes the step before step/start. `step` at 1041–1067 renders the assembly and calls request preparation before appending the user/message and starting an assistant frame. |
| Original request contract | Original `dsh-agent-loop/lib/index.js` lines 1163–1185 builds `seedConfig`, awaits `this.dispatch.waterfall('agent/request', payload, () => Promise.resolve(seedConfig))`, then dereferences `proposedConfig.provider` and `.model`. A `void` return is not a valid resolved request configuration. |
| Original waterfall contract | Original `cordis/lib/index.js` lines 308–326 documents and implements outermost-first callbacks. The last dispatch argument is the final `next`; a callback omitting `next()` vetoes the rest. Its own return becomes the waterfall return. Original `dsh-agent/lib/index.js` lines 242–275 forwards this exact waterfall through the agent scope carrier. |
| Containment and truthful facade | Original `AgentLoop.turn` records error/end and emits agent/error; `kick` at lines 887–900 contains that error and restores idle. Frozen NativeAdapter can return noncommitted `unknown`; WorkerManager additionally catches adapter failures as unknown. Frozen `installed-worker.mjs` line 202 projects committed success only with validated original provider usage and assistant/message output. The observed unknown is therefore not successful useful work. |

## Concrete helper counterexample

Original inspected bytes:

```js
// physical/startup-observer.mjs, line 41
ctx.on('agent/request', () => { state.agentRequests++; observe(); });

// physical/observer.mjs, line 35
ctx.on('agent/request',()=>{state.agentRequests++;write();});
```

Both callbacks return `undefined`. The actual profile's ordered inserted entries include `df-ni2-startup-observer` before `df-testing-provider`, `df-installed` and `df-ni2-observer`. The helpers share this original request waterfall; it is not an emit-only notification. The startup callback can increment its own counter and write its own observation, then prevent the later physical callback and the native `seedConfig` continuation from running. No inference about absent provider calls is borrowed from a copied receipt or a background fabricated callback.

Source-backed predicted sequence for the held attempt:

1. Exact native send opens the original turn, claims the input and passes pre-step; original step/start is appended.
2. `prepareRequest` enters `agent/request`. The startup observation callback returns `undefined` without delegating.
3. The later physical observer remains at `agentRequests:0`; the seed request config is never returned.
4. Original AgentLoop attempts to read `proposedConfig.provider` and throws before user/message commitment or assistant-stream start.
5. Step/end and turn/end are retained; driver containment returns the agent to idle. No provider usage or successful result is produced.
6. The installed response truthfully projects unknown, artifacts remain absent, and the dispatch reservation remains held.

The separately inspected later physical callback has the same defect even if the startup callback is repaired alone. A narrow helper-only repair must make **both** callbacks delegate exactly once and return the original `next()` result unchanged. Observation writing must not introduce a new request authority decision or automatically replay a failed continuation. Root alone owns any helper edit, new hold and further execution decision. No repair was made here.

## Finite diagnostic decisions and residuals

| Existing original diagnostic | Interpretation |
| --- | --- |
| Startup `agentRequests:1`, later physical `agentRequests:0` | Matches the precise first-observer veto. Together with the source and turn/step evidence, this is the smallest confirmation. |
| Existing turn/end reason `error`, strict undefined-request-config/TypeError category | Supports the dereference at original line 1185. Raw message/stack/session input are not needed. |
| Startup callback count `0` | The known helper defect still exists, but is not enough to locate this particular failure; inspect only the already recorded original request-preparation error category. Do not invent a callback execution. |
| A native authority/currentness/permission denial | Stop the affected action. The helper finding is not authorization to bypass a denial. |

`agents:[]` is ruled out as an execution-disabling profile setting: original AgentLoop lines 1533–1597 uses it for declarative startup auto-creation while still registering the genuine native factory. The independent no-listener manager fixture also used an empty declarative list, but its passing execution is historical evidence, not a rerun here. No paid inference, external delivery, tool execution, output fabrication or release is inferred from the actual dispatch consume.

The first execution is not eligible for captured result/factual finish merely because the helper defect is understood. No committed assistant/message, validated output or actual usage was observed. Its durable intent and held reservation remain exact historical facts. Query, changed instrumentation, a later task or changed current authorization must not promote those facts or replay the original operation. Any further physical attempt needs root's separately explicit bounded decision and a new helper hold; unknown/crash reconciliation remains a product residual.

## Exact byte binding

All `38` frozen `source-a58c522/src/` files matched the actual unpacked `home/profiles/web/node_modules/dsh-fishball/src/` bytes. The original public AgentLoop, SystemPrompt, AgentRegistry, preset registry, Session and Cordis sources matched the previously pinned `.runtime/dsh-web/` baseline. The `57` rows of `evidence/root-product-held.sha256` (manifest `4f03d530b8695173b12a1270c3e587d64a3c6d16bfda54434e317044f2795783`) and the `19` manager-independent artifacts (manifest `bad10f59c225371e3960fe882d9a1eca55f55cba5e67a3dd634b27b478dd5677`) matched. These are source preservation checks, not newly executed tests.

| Frozen source/helper | SHA-256 |
| --- | --- |
| `installed-worker.mjs` | `61c6eaabe82a7b32b31d8cf996bfd965f9b8188d70f407673e7a9907a2af20fb` |
| `native-adapter.mjs` | `caba6d841cc4db6825e5b5aebce95c7b83dab3a501a6602bfea91efb00b7c49e` |
| `installed-invocation.mjs` | `5c07bdfae80e7f624d1e6242a6b7ca97b50c6724860973be1906168fb0d35484` |
| `operator-bridge.mjs` | `9227a0126e662bc150fa64b152cd4a380c8b70c7e5160a1ed151c6103422aa77` |
| `runtime-plugin.mjs` | `30c8e1c0aee9d495563d19eb4b71357198912ea472b6b61201168079b7885fb2` |
| `worker.mjs` | `55b93114668db772c887b08928bbbb312f1a3d236524b2375791ae6da958b653` |
| `installed-worker-facts.mjs` | `22cb737371b43575a81eaf5281027a0cfae5c90b7fdbb89895d501f5dabc18b8` |
| `testing-provider.mjs` | `524ac375aaf4011536ebc1e2b9f8c418d96a2c5f242329a278f55afcfbb3d8d7` |
| Original `dsh-agent-loop/lib/index.js` | `00c4814d63f3d1e2754eb09144832d19b30499d6ea444730473f740b587948c2` |
| Original `cordis/lib/index.js` | `6a9394c0877ff45218818c6e815edd038f8057e1a1deb390a8d43ec81c57691e` |
| Original `dsh-agent/lib/index.js` | `7b9aa39474de83115cf890dd7f8904cf0d59df0811cb335ab85565a04f1aac93` |
| Original `dsh-system-prompt/lib/index.js` | `ff422afac6ba85f89afa985d921aed0b603feb354a05a549c48eae04cf0d2f57` |
| Initial `physical/startup-observer.mjs` | `3255db945e522a76a4af03a23f1a3bd010dcf24490336825d1be99caca357356` |
| Initial `physical/observer.mjs` | `61cc8320586f2a8e6a6f289997585171f9c09fc496ed3880ed8a1c3782fd24c2` |
| Held initial `physical/smoke.mjs` | `752e3513d783b0e57fed088cd04a13f0515005c3c89b6c3e3934620687b808fb` |
| Actual root profile patch, 38 rows | `6c6000a9d8d782ba2b2747d50629bf24fbc6dc70a4e045d71d79010dbd6ac315` |

The earlier source-only startup diagnosis remains unchanged at `ef7d461c93354aaa968d3b2c7b759e1efe4179dea2d20e6bce88c86aebd40f4e`. No manager result was repeated, modified or superseded. Verdict: the request-observer veto is a concrete original-contract counterexample; physical first-chain completion, result/finish, browser/CODE, model quality, full 82+5 acceptance, MVP and publication remain HOLD.
