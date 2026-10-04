# Stage3 trusted native runtime composition

This is author module evidence for a development integration, not full product acceptance. The executable boundary uses the already pinned official DSH Web 0.2.1-alpha.1 public packages in `.runtime/dsh-web/node_modules/@deepseek-ai`. Node22.22.2, NAPI10, darwin-arm64 were observed. No Web server, browser, installed profile, external provider, paid inference, account, credential, network request or tool body was invoked. All identities, data, providers, permissions and review reports are explicitly synthetic; SQLite/JSONL files live in owned disposable temporary directories and are removed in `finally`.

## Trusted installation boundary

`createRuntimePlugin` requires private installation identity and encryption-key callbacks before storage. Its captured public HostConnection OperatorPeer admits owner operations on `/df-rpc`; JSON principal/role/scope claims cannot authenticate. Cordis `ctx.df` exposes diagnostics only. Encryption keys, owner/coordinator/host/reviewer handles, native AgentHandles and report/observation/settlement authority do not become service methods or RPC payloads.

Memory requires an explicit namespace, tokenizer and byte/token bounds. Worker configuration requires an explicit environment registry, permission callback and tool guard; session resolution is separately trusted when needed. Preview requires an explicit concrete resolver and TTL1..60000ms. No model, reasoning level, tool set, environment, permission, approval lifetime or provider is guessed. Missing feature configuration returns `CAPABILITY_UNAVAILABLE`; partial configuration fails with a stable error. The default exported runtime remains unavailable without identity/key installation.

Owner operations compose typed module APIs for context preparation, action planning, concrete preview, explicit expiry/grant, idle worker create/resume, explicit execute, query, handoff, source-bound result capture, owner-authored artifacts/progress, audit configuration/read, control and optional result delivery. Raw owner grant cannot bypass preview. There is no RPC for reviewer report, verification, worker observation, release, settlement, authority minting or raw store access. Optional delivery requires its own explicit ResultPipeline adapter. Events/scheduler/chat/notification installation hooks are separate units, not silently enabled here.

A separately installed private reviewer receives only bind/read/audit/report/verify closures. Core admission still requires a distinct scoped held review action/claim/generation and exact permitted material. The installer never receives owner handles, keys, store or native agent handles. This fixture's private synthetic report proves the authority/material/gate contract; it does not prove real model audit quality.

## Actual native flow and durable facts

`test/native-runtime-integration.test.mjs` composes actual public Context, SessionProjectionRegistry, SessionStore, ApprovalService(policy `never`), JSONL SessionPersistence, AgentRegistry, LlmRuntime, SystemPrompt, ToolRuntime, AgentLoop and HostConnectionService. The genuine connection's registered route is exercised through synthetic request/response streams with its configured admission/authentication; no HTTP listener is opened.

Each of two product lifetimes verifies:

1. Authenticated owner intake and constraints; unauthenticated requests and JSON principal substitution reject.
2. MemoryAdapter/ContextAssembler creates a full protected authenticated context. Exact encrypted record bytes/digest become the complete action's data binding.
3. Explicit model/resource/environment/tools/permission intent; concrete preview displays the exact scoped record and trusted meaning. Owner chooses an explicit grant expiry. Missing preview denies grant.
4. Native dispatch creates an owned idle session with zero provider streams. One explicit execution consumes the core's durable one-use intent immediately before public `Agent.send`; one local deterministic provider stream produces the exact own input and committed assistant/message. Duplicate execution causes no additional send.
5. Private native result capture requires that own execution input, a later committed stream revision, the exact public assistant feed frame and task/action/claim/generation/session mapping. The encrypted artifact contains a `df.native-result/v1` envelope with original actionDigest, input digest, cursor, result digest and native result bytes. JSON substitution of result content and owner-supplied producer binding reject. Ordinary owner-authored artifacts remain a separate path.
6. Premature completion and owner report RPC reject. A new independently approved review action creates a distinct charged idle review worker/session/generation without another stream. Its private binding reads only the permitted exact artifact, verifies it and supplies immutable audit coverage. The task remains uncompleted and both reservations remain held.
7. One lifetime cancels through atomic task control before native disposal; the other quits with both workers still active. Plugin disposal invalidates diagnostics/reviewer closures synchronously, seals previews/admission, tears down both owned native workers, unregisters RPC and closes storage. Reopening retains stopped facts and unreleased reservations: cancel_requested after cancellation, recovery_required after quit. No automatic execution/release follows restart.

Each execute request has a2000ms adapter deadline; the deterministic stream is local and finite. Native quiescence is not completion or effect-settlement evidence. The public JSONL persistence fixture and reviewed existing flock pins are documented in [native-worker](native-worker.md); no additional addon/install/build or launcher ran.

## Scoped tool enforcement

The phase deliberately supports an empty actual scoped tool surface. A trusted installation `toolGuard` receives `{agent,taskRef,generationRef,claimRef,toolsDigest,permissionPolicyDigest,schemas}` and must return exactly `true` synchronously. The native adapter independently requires actual public ToolRuntime and `schemas(agent).length===0`; a callback cannot approve a nonempty surface. The check runs during unpublished setup, its final publication commit and immediately before final execution consume, after asynchronous model resolution.

The installed public `scopeOf(agentCtx)` must equal the actual agent and `agent.ctx` must equal that registration context. Through that context the adapter registers public `ToolRuntime.guard(() => 'DF_TOOL_DISPATCH_UNAVAILABLE')`. This is the documented monotonic guard after the extensible `tools/pre-execute` waterfall and before every tool body. Registration belongs to the actual agent scope and disappears with its disposal. ToolsDigest does not authorize a newly introduced native tool.

The added public-pipeline regression registers a synthetic late tool and an extensible allow callback, then invokes actual `ToolRuntime.execute`. The monotonic guard returns a stable denial, body counter stays0, and no provider runs. The changed schema also denies explicit execution before consume (counter0). After agent disposal the owned guard is absent while the independent global definition remains; its body is never invoked. Real nonempty-tool dispatch and selected live tool meaning remain unaccepted.

Pinned public implementation sources: `dsh-tools/lib/index.js` SHA256 `2e9b6a72ba6b917197965c08eb894d4e8d01dc6f81e0e1c9870a5ae8514687a7`; `dsh-scope/lib/index.js` SHA256 `2829df71d76e08941457d4dd173eac60783e55354921137c8b75e8b5c0d2ecca`, both0.2.1-alpha.1. Existing native AgentLoop/Agent/Llm hashes remain in `probeWorkerHost` and the worker report. No guessed guardExecute API is used.

## Verification checkpoint

Author command:

```text
node --test test/native-adapter.test.mjs test/native-runtime-integration.test.mjs test/runtime-plugin.test.mjs test/operator-bridge.test.mjs test/worker.test.mjs test/client.test.mjs test/client-build.test.mjs
node scripts/check.mjs
node scripts/build-client.mjs --check
```

Result:59tests passed,0failed; syntax checked65ESM files; reviewed client bundle reproduced exactly. Within this run native adapter18/18, new product integration2/2 and runtime plugin4/4 passed. No runtime-policy denial occurred.

Historical48-test worker/client checkpoint remains historical. The first new product fixture used an unsupported intake constraints field; corrected it to the typed revise operation. The first capture probe used `event.data.content`; inspecting the installed public assistant/message declaration/implementation established `event.data.message.content`, after which the source-bound assertion passed. Tool hardening initially exposed older mock factory dependency/scope deficiencies (6failures); they now use actual public Service/createScope with declared dependencies and the same protected runtime context-holder pattern used by AgentLoop. All original fault oracles were retained and subsequently passed. None of these failures establishes production acceptance.

Working-tree source hashes at the59-test checkpoint (root owns subsequent Git freeze):

| File | SHA256 |
| --- | --- |
| src/native-adapter.mjs | f066aef5fed0f022ccb5477f7eb2493ba27dac38e8707701c2eae41184b92c8f |
| src/worker.mjs | 6b3ecf23c2fcc9cd883effa88d8330688807278d0e028c1939a4444920e52d61 |
| src/runtime-plugin.mjs | 0762fe666a3b94ba1a1c2a3c4f1b7fe07e3dca394b4ff3d437e3a47fa7686c72 |
| src/operator-bridge.mjs | a8ffcf696261c97fd2f9554d6a9995f103903f3f425ab0b96624ec1c4bbd8f31 |
| test/native-adapter.test.mjs | 735f1270adb6d6f07126ab48edf165f6d53a940e8ad1f6b713d50fbb42556872 |
| test/native-runtime-integration.test.mjs | 480b0eee9d821c9483ee77a7582706704a6e586de7e5e15041837c947bfa94dc |
| test/runtime-plugin.test.mjs | b0739077dad20948dce61833feb2976331130d6aea5d1bea4f3ead52c4e594d4 |

Independent exact-tree code and ISTQB reviews are required before integration acceptance. Actual installed Web/profile restart, rendered product controls, real selected-provider work, nonempty native tools, handoff UI/current state and real independent model audit quality remain deferred gates in the acceptance-debt register. The earlier blocked browser routes were not retried or bypassed. A successful module run does not satisfy those gates or authorize release.

## Optional native automation and notifications installation checkpoint

The later trusted constructor seam accepts `automationInstaller` only from process composition. It receives a frozen bounded facade: source/subscription configure/read/list, event receipt/read/list, private registerEvent/ingestEvent, registerSchedule/tickSchedule/statusSchedule/startSchedule/stopSchedule and createChat. The facade contains no raw store, key or owner/host handle. Event and schedule registrations return identity-compared opaque tokens; copied tokens fail and neither registration nor callback ingestion is an owner RPC. Chat creation has closed explicit binding/callback/attachment/outbound inputs, cannot override internal store/router/liveness, and is capped at32 owned instances. Its frozen facade exposes only ingest/status/control/readAttachment/recipientAdapter/dispose. A paired control first commits ChatAdapter's authenticated exact requestDigest/task/CAS core control, then asks WorkerManager to stop the receipt's factual task workers for pause/cancel. It returns `{receipt,workers}` so authority control and native observations remain separate; no stopped/settled/instant cancellation or resume wakeup is inferred.

Owner endpoints configureSource/configureSubscription/source/subscription/listSources/listSubscriptions/eventReceipt/listEventReceipts/approveSchedule require the explicit automation installation. Exact owner missed-plan approval records consent to that private durable plan only. It creates no task/action/grant or effect by itself. Diagnostics report configured native boundaries and provider-neutral contract availability; they do not fabricate provider connectivity. No anonymous Web listener is installed.

An explicit notification route requires configured ResultPipeline and all policyRef/recipientRef/channelRef/mergeKeyRef values. Owner configureNotifications/notificationPolicy/pendingNotifications/prepareNotification/acceptNotification/dispatchNotification/reconcileNotification compose NotificationService. Policy has no implied timezone/quiet/emergency/merge/frequency values. Prepare produces the notification unit's canonical progress manifest, not the distinct native-result envelope above. Independent review, immutable exact action grant and core rate/hold admission still precede any adapter effect. There is no automatic drain, delivery, recipient wakeup, policy approval or background model work.

Added actual native module oracles prove complete-ID dedup, owner-authenticated source controls, copied-token denial, durable event receipts, a three-occurrence missed schedule that stays verification_required until exact owner plan approval, one task ingress after approval, explicit timer start/stop and teardown, private paired chat status/control binding without a caller commandRef, notification policy unavailable until explicit configuration, empty pending selection with0recipient calls, and async authorization held across quit failing SERVICE_DISPOSED before ingress. Reopened encrypted stores contain only the admitted tasks and no actions/workers. Closures/tokens/chats reject immediately after fiber disposal. Timers, chats, router and installation cleanup are disposed before workers and storage. Invalid installer return or throwing callback gets stable RUNTIME_ADAPTER_INVALID without callback prose or surviving RPC.

The initial added chat fixture incorrectly expected paused task status; the actual published core keeps task status queued and independently stores control=paused. The corrected oracle asserts both factual axes. No source implementation or security predicate was relaxed.

Author command extends the prior command with `test/events.test.mjs test/scheduler.test.mjs test/chat.test.mjs test/notifications.test.mjs`:146tests passed,0failed. Syntax checked66ESM files and client bundle --check passed. This includes62owned boundary/client tests and84 event/schedule/chat/notification module tests; the earlier59 checkpoint and hashes remain historical. New composition hashes are runtime-plugin `89ee5b2993b050c8b6d7f8ffae432ce3e1ca756fdf60a6d78a7867b941be9237`, operator-bridge `8fe93cc819d061cc2d6387dc4760e57a8558b4da66e5bf5eef5340283835350c`, runtime-plugin test `a1da510da992549ae2f77bd25c57509769f94d1e9dd5ff844cf0323f2108c686`, native-runtime-integration test `cec18fff3cb88d4d0760c9c04856ca53a54634a7114b4c200f493405bc6c57e5`. NativeAdapter/WorkerManager hashes are unchanged from the59 checkpoint. Independent final code review remains pending under the reported service flag; the blocked experiment was not retried or bypassed. ISTQB review and full functional/visual acceptance remain separate gates.

## Export selection and installation composition

Package root `dsh-fishball` selects `src/index.mjs`, whose default is the bounded foundation plugin. The current synthetic Cordis patch still selects that foundation entry. The separately exported `dsh-fishball/runtime` selects `src/runtime-plugin.mjs`; its default `runtimePlugin` requires private installation identity/key and remains unavailable when they are absent. The browser `dsh.client` entry independently loads `lib/client.js`. Loading the foundation and its diagnostics is not evidence that the Stage3 owner RPC, memory, approvals, workers or task UI function.

The authorized synthetic module composition is implemented concretely in `test/native-runtime-integration.test.mjs`. A trusted process selects `createRuntimePlugin`, after composing the exact public services and registering the local deterministic provider. The following is a composition outline, not automatic production setup:

```js
import { randomBytes } from 'node:crypto';
import { createRuntimePlugin } from 'dsh-fishball/runtime';
// Native public services + a local deterministic MockProvider are already
// installed in this disposable Context. No Web listener or accounts exist.
const fixtureKey = randomBytes(32); // never put this value in YAML or evidence
const plugin = createRuntimePlugin({
  identity: () => trustedSyntheticPrincipal, // privately bound raw owner/workspace
  encryptionKey: () => fixtureKey,
  hostPermission: explicitSyntheticClaimPolicy,
  memory: { namespaceRef, tokenize, byteLimit, tokenLimit },
  worker: { environments: exactSyntheticEnvironmentRegistry,
    permission: explicitSyntheticWorkerPolicy,
    toolGuard: ({ agent, schemas }) => schemas.length === 0 &&
      ctx.tools.schemas(agent).length === 0,
    resolveSession: trustedOriginalNativeSessionResolver },
  previewResolver: trustedConcreteScopeResolver,
  previewTtlMs: explicitlyChosenPreviewTtl,
  reviewerInstaller: privateIndependentSyntheticReviewer,
  automationInstaller: privateSyntheticEventInstallation,
  results: { recipientAdapter: privateSyntheticRecipient },
  notifications: { policyRef, recipientRef, channelRef, mergeKeyRef },
});
const fiber = ctx.plugin(plugin, { databasePath: ownedTemporaryLedger });
await fiber;
// Explicit authenticated operations plan, preview and grant; create/inject
// remain idle. Execute requires its separate one-use final core admission.
// At teardown await fiber.dispose(), then close the owned Context/files.
```

Every identifier/callback/policy variable is supplied explicitly by the trusted synthetic composition; unresolved variables are not defaults. Provider/model/reasoning/preset/environment/permission/tools bindings come from that same private installation and current immutable core action. Source/subscription, notification policy and owner grant expiry are configured separately and explicitly. Real installation identity/key/model/tool/permission/memory setup is not supplied by this example or public RPC JSON. No plaintext key is tracked. A future actual Web smoke must select the intended runtime export and demonstrate that trusted configuration, or record exact default-unavailable prerequisites; a foundation-only host smoke cannot be credited as Stage3 runtime acceptance.


## Native owner UI metadata and session read extension

The current optional automation boundary adds owner `listSchedulePlans({})`, a bounded read of each trusted registered ScheduleDriver token's actual status plus captured explicit source/subscription/spec/goal/start/externalEffect metadata. No private token, callback or registration authority is serialized. Missing or invalidated registration returns an unavailable metadata row. Source/clock plan semantics and configured versus live connectivity remain distinct.

New owner `sessionLink` delegates to WorkerManager with the exact task/action/digest/claim/generation/session reference and task/auth CAS. It revalidates owner scope, authoritative action and worker mapping, privately held ticket, actual live public registry/session object and SHA256 native ID; it rechecks task/auth after resolution and returns only allowlisted references plus the owned native ID. This read does not require a currently dispatchable grant, mint a claim, create/resume or wake a provider. A stopped/reopened mapping has no live handle and fails WORKER_SESSION_UNAVAILABLE. The native request/response integration proves exact resolution and denies foreign task/session fields; the public native adapter lifetime test proves permission-denied read and teardown refusal with0streams.

Current extended unit:73owned tests and157combined module checks pass, syntax68ESMfiles and deterministic bundlecheck pass. [Native client evidence](native-client.md) records the new controls, public navigation source hashes and exact-source manifest. Prior62/146 snapshot remains the committed historical unit01df5afd; the current UI unit awaits root commit and independent review. Existing private configuration/default-unavailable/export-selection restrictions remain unchanged. Real browser/history-only transcript access and full MVP acceptance remain separate gates.
