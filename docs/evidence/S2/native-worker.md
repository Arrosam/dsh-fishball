# Stage2 native worker and environment evidence

Development implementation for BUB004/BUB011; acceptance is pending. Owner authorized staged development and mock module tests on2026-10-04, with full functional/visual regression after Stage3. No Web server, browser, model drive, external account, network, credential, personal profile/skill or dependency installation occurred in this lane. Execution used managed workspace-write/use_default; no policy denial occurred. Node was22.22.2 with the existing exact isolated official DSH Web0.2.1-alpha.1, Cordis4.0.5-alpha.1 and SQLite3.53.2. Old Desktop and SDK interfaces are unused.

## Installed public interface facts

Sources are project-local `.runtime/dsh-web/node_modules/@deepseek-ai/<package>/lib/index.js` and each package's published `lib/types` declarations, with the existing official transitive runtime lock checked by `requireHost`. All packages below are0.2.1-alpha.1. Source SHA256 values:

| Package/source | SHA256 |
| --- | --- |
| dsh-agent/lib/index.js | 7b9aa39474de83115cf890dd7f8904cf0d59df0811cb335ab85565a04f1aac93 |
| dsh-agent/lib/types/index.js | 7e7c47fc0b82f0718b73e1705c07ad9496cfdbc21598db94de858f718cd23490 |
| dsh-llm/lib/index.js | a8a8288910c8862342cda571d096e1ea4489b01dd0f70b5db28bc86525ee283e |
| dsh-llm/lib/types/index.js | 825553a8446c9721ba5189f5aa2506c8dd8e0c9d04a1a28fb03751dfec59c411 |
| dsh-agent-loop/lib/index.js | 00c4814d63f3d1e2754eb09144832d19b30499d6ea444730473f740b587948c2 |
| dsh-tools/lib/index.js | 2e9b6a72ba6b917197965c08eb894d4e8d01dc6f81e0e1c9870a5ae8514687a7 |
| dsh-system-prompt/lib/index.js | ff422afac6ba85f89afa985d921aed0b603feb354a05a549c48eae04cf0d2f57 |
| dsh-session-projection/lib/index.js | 022f1d13e25aeb3c18e10407d84c69e018c1c05a65c9ee36ed14d89b185a4fa8 |

`AgentRegistry.create` requires caller-supplied `sessionId`; `resume` requires `resumeSessionId` and a persistence service. Both return an owned `AgentHandle`, whose public `dispose()` stops the driver, waits for quiescence, unwinds its scope and removes registrations. Looking up `agents.get(id)` supplies visibility without minting a disposal capability. Factory setup runs before publication; its synchronous commit can revalidate the claim at that boundary. Actual AgentLoop owns rollback and ordered teardown, but no external effect is made atomic with later revocation.

Native agent status has only idle/running. Bubbles records submitted, created, ready, running, stopped and unknown independently from task status. Created means an exact owned public handle was returned; ready means that published exact instance is idle with validated setup. Running is native driver activity, not evidence of completed work or an artifact. A cancellation request uses public `agent.cancel({kind:'user'},{keepInbox:false})` and awaits `whenIdle`; idle is quiescence, not closure or effect rollback. Only owned disposal or an exact native `agent/disposed` observation supplies stopping evidence.

`LlmRuntime.resolveCallConfig` validates explicit registered provider/model/reasoning without silently clamping effort. Readiness metadata alone does not bind AgentLoop's later provider generation or prove usable credentials. Standalone catalog membership is advisory. This lane never calls model discovery or an external provider stream; one explicitly authorized deterministic local mock provider fixture is described below. `ApprovalService.request` is async and requires an already-open agent turn, so it cannot serve as generic pre-creation approval. Root's private trusted host/operator bridge and authoritative synchronous admission remain required; native permission defaults to deny.

`session/event` offsets supply committed cursors. Native assistant-stream start/chunk/end frames are transient; only a committed end can refer to a durable session offset. The pinned AgentLoop increments global revision for every start/chunk/end frame; revision/index deduplication and gap detection preserve unknown outcomes. A committed end is matched to an observed exact session sequence and event type. If its feed has not arrived, awaiting_commit remains unknown to query; no snapshot is fabricated. The map stores at most128 allowlisted event sequence/type records. Raw chunk text, arguments and native errors are never put into receipt metadata or evidence; historical events never call task intake.

## Implemented private composition

`WorkerManager` consumes RuntimeStore's opaque handle, original immutable intent and atomic claim, with task/action cache keys inside a verified host owner/workspace scope. Caller input is captured before asynchronous preparation. Native tickets bind the complete normalized spec, selected scope/task, original action digest, generation and claim. Fresh `assertClaimCurrent` guards creation and synchronous publication; default-denied permission and environment checks cannot select an alternate route. The durable submitted observation precedes the native await. A timed-out creation retains its original reservation and late result mapping; neither query nor restart issues another create/resume.

EnvironmentRegistry receives trusted process configuration, canonical project-local cwd/root, exact workspace/tools/permission/model/preset refs and a trusted current-state reader. JSON capability/verified flags do not authenticate. A digest is compared with this private configuration rather than treated as host evidence. Environment changes fail closed. Private tickets and owned handles are not exported through an RPC facade.

Handoff context includes target, reason, steps, resume condition, expiry and original task/version/auth/action/claim/generation binding. Context is stored in the core encrypted branch data plane; atomic `putHandoff` commits encrypted context and the authoritative pending obligation together and retains the reservation even after native stop and known action outcome. No credential export, environment switch, permission grant or automatic resume occurs. Same-process current-state verification rejects expired, cloned, changed-task and changed-environment requests; persistent native handoff/resume UI proof remains deferred. The future bridge must reconcile actual current host state before resolving that durable obligation.

The private MessageBroker transport validates exact owned recipient task/session/generation and body bytes/digest/kind. Its trusted `messageAdmission` callback defaults to deny and must synchronously call authoritative `assertMessageCurrent` for the current independent message outbox/claim/grant/expiry/spec and `assertWorkerOwned` for the recipient’s exact held live mapping, original grant not explicitly revoked, and active task control. A later independent grant advances task authEpoch and invalidates new work under the old creation grant; it does not itself invalidate already-owned recipient identity. Creation retains its original epoch guard. Message payload fields cannot confer either authority. `Agent.inject` queues without wakeup and returns sent only. Query remains unknown without recipient consumption evidence. Duplicate send is refused within the transport and durable outbox replay is refused by the broker. Verification bodies are accepted only for review_result metadata. No native wakeup or model execution is inferred from queue acceptance.

## Module validation

Command: `node --test test/worker.test.mjs test/environment.test.mjs test/native-adapter.test.mjs` —25/25 passed before final review, with no skipped tests. Tests use synthetic identities, private test authority and disposable ledgers/paths, then dispose owned contexts and remove fixture directories.

The genuine AgentLoop fixture loads public Context, SessionProjectionRegistry, SessionStore, ApprovalService(policy never), AgentRegistry, LlmRuntime, SystemPrompt, ToolRuntime and AgentLoop({agents:[],maxParallelToolCalls:1}). A reviewed LlmAdapter supplies only synthetic model metadata; its stream increments a counter and throws if invoked. Idle fixtures call prepare/create/query/cancel/dispose only. Actual native agent/session counts go1→0; provider stream count remains0 in idle fixtures. The combined real SQLite + real AgentLoop fixture verifies unchanged actionDigest, scoped generation/session attachment, atomically pending encrypted handoff, exact native stop and held reservation after separate known-outcome settlement.

The actual SQLite RuntimeStore → WorkerManager → MessageBroker → NativeAdapter public mock-factory fixture verifies a separately approved fresh message reaches the owned recipient once after its grant advances the epoch; model stream count remains0. Queue acknowledgment is only sent, query remains unknown, broker replay produces no new injection, and a cancel committed after the message claim but before native inject blocks delivery while preserving all unknown outbox/reservations. A separate default-admission test proves a live well-formed recipient alone cannot authorize a message.

A separate root-authorized genuine AgentLoop fixture registers only the local deterministic synthetic LlmAdapter (no tools, policy never), submits one explicit synthetic input through public Agent.send(next-turn,true), and waits for whenIdle with a2second timeout. Public StreamChunk vocabulary supplies text block-start/delta/end, usage1+1 and stop. One local stream occurred, actual native status changed running→idle, frames advanced revisions1…7, and committed assistant/message seq9 matched the post-commit session feed. Native runtime context produced a separate user record; the explicit submitted message was identified once by its ID digest. The original action digest, claim, generation and session mapping remained intact; the reservation stayed held and the task did not complete. This proves bounded observable local module behavior, not real provider credentials/inference, rendered UI, artifact verification, delivery or native persistent resume. Owned manager/handle/context and disposable ledger paths were cleaned in finally; no server/network/paid call was started.

The first genuine observable-loop author run failed: the previous adapter mistakenly expected constant revision within an attempt, so actual chunk revision2 was classified as a gap and the task became recovery_required. Source inspection of AssistantStreamAttempt.start/push/settle (every frame uses nextRevision()) established the cause. The implementation and mocked fault vectors were corrected to that public contract; the real loop retained its positive committed-stream oracle and the original missing-frame negative. The rerun passed. No assertion was weakened to label an unobserved effect complete.

Additional fault-order tests cover create timeout/late receipt, cancellation while create is pending, restart with no ownership handle, forged scope/input, stored terminality, caller-input mutation while prepare awaits, and identical task/action/generation hashes in two owner scopes. The independent code audit found the mutable async dispatch input and cross-scope cache issues during implementation; both were fixed and direct regressions added. Final independent code and ISTQB verdicts belong to their separate reports.

## Remaining source-AC gates

| Source AC | Development evidence | Remaining gate |
| --- | --- | --- |
| BUB004-01 | Actual public AgentLoop created/ready/running/idle/stop plus local deterministic committed stream | Native rendered panel and real selected-provider observable work |
| BUB004-02 | Durable timeout/late same-generation mapping; no second create | Actual native delayed publication/reconnect oracle |
| BUB004-03 | Public resume delegated with mock persistence only | Real public persistence resume plus owner-authorized observable work/artifact |
| BUB004-04 | Atomic control first; late creation canceled/stopped; outcomes held | Real completion/cancel race with observable effects |
| BUB004-05 | Cursor/frame dedup and gap uncertainty; SQLite restart held | Actual profile reload/disconnect/re-subscription and native transcript reconciliation |
| BUB011-01/02 | Exact trusted workspace/environment/tools/model bindings; deny stops | Live selected tools/env and real host permission path |
| BUB011-03/04 | Encrypted pending context, independent obligation and freshness/expiry checks | Native handoff UI and actual tool/page state verified before resume |
| BUB011-05 | Stale env/disconnect unknown; no alternate route/replay | Real environment loss/recovery with preserved observable effects |

Public native persistent resume requires the installed sessionPersistence service, scoped synthetic local storage and explicit verification of its create/load/write-handle lifecycle. That inventory and execution are deferred; the mock resume test does not meet BUB004-03. Native root identity/model readiness and Stage3 UI composition remain integration seams, and full functional/visual acceptance is still debt. No stable/full-MVP/release claim is made.
