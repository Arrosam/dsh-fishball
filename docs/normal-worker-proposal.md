# NI2 normal worker: read-only implementation proposal

Status: **PROPOSAL; no implementation GO or independent NI2 design freeze.** This preserves read-only preparation by the existing `onboarding_ui` coding lane. It is not a CODE-review replacement. NI1 remains the active held implementation; [the required normal stages](normal-entry-integration-plan.md) and all source AC remain unchanged.

## Closed configuration and missing composition

Optional installed-only `worker` is omitted/disabled by default. Enabled configuration must contain closed detached immutable selections: provider/model/preset/advertised reasoning and request maximum output tokens; canonical workspace root/cwd; selected native JSONL directory/compression/retain policy; preview/grant expiry, runtime/usage/cost ceilings and per-action reservations. Example numbers or values are neither production defaults nor grants. Reject callbacks, secrets, identity/role/handle/proof/digest claims, hidden/accessor/proxy/unknown properties and invalid bounds.

The smallest initial unit requires enabled NI1 context, one active worker, one initial attempt per task, an available empty preset composition, empty native tool schemas and the existing unconditional tool-body veto. A session-specific original native approval override is `never`. Configuration may expose unavailable reasons; it neither writes durable policy nor grants/creates/executes on boot.

Product code needs a new installed-worker composer, narrow private installed operations, preset mounting and a final native request gate. Existing base/runtime defaults and SetupState/vault remain unchanged. Server-derived owner operations should refresh catalog facts, prepare/confirm the selected resource/model policy and plan an owned context action from task/context references and CAS. Reuse existing context/preview/grant/dispatch/execute/query/revoke/control interfaces. The panel needs explicit policy acceptance, exact action acceptance, idle creation and context execution controls; reconnect/refresh/mount performs none of those actions.

## Current facts and public limitations

Resolve providers/models using original `LlmRuntime.listProviders/listModels/resolveModelInfo/resolveCallConfig`; verify effective reasoning rather than trusting a supplied label. Preset readiness uses original `resolve/readDocument/compositionInventory`, then `mount` and `inspectCompositions` during unpublished setup. There is no public preset generation token or catalog-change event; do not invent one. Use fresh exact public observations and mounted checks. The actual `llm/adapters-updated` and public Loader lifecycle/configuration events can invalidate cached readiness.

Derive canonical current environment, original service/class identities, profile, persistence and tool facts. Approval uses public `ApprovalService.config/overrideOf/setApprovalPolicy`. An immutable process-private admission snapshot is published after asynchronous fact resolution. The synchronous RuntimeStore permission callback compares the exact action and current lifetime/configuration/environment fences; it cannot recurse into RuntimeStore or await ApprovalService.

Owner-selected usage/cost reservations are bounds, not measured provider pricing. The inspected LLM API supplies no general text-price fact. Do not infer free calls from a provider name or relabel a reservation as verified pricing; preserve `COST_UNKNOWN` where facts are unavailable. Request maxTokens and input/result bounds are separate from total provider tokens, billing or a hard disk quota.

## Original persistence and consent

`AgentLoop.createStoredSession/resume` use the context captured by their native factory. Shadowing a plugin-local persistence service cannot redirect them, and the registry rejects a second global factory. Use and verify the original JSONL backend and supplying active public Loader Entry, matching service instance, canonical configured directory and compression. Do not create a parallel service realm or reconfigure global services.

The selected directory is a disclosed profile-owned sibling of the setup vault. A broader DSH_HOME native sessions root cannot be called profile-owned. Readiness remains unavailable until the original JSONL Loader Entry is configured through its supported public `root/compression` fields. Root may configure those original fields only in a later fresh synthetic fixture; this proposal changes no host.

Native JSONL transcripts are unencrypted, also when compressed. Preview must disclose directory, encoding and retention, and bind this separate persistence consent into the immutable action target. Observe/drain only owned `df-…` sessions. Public AgentHandle exposes agent/dispose rather than its private write SessionHandle; do not access that handle or flush the shared service. Pinned JSONL appends/publication fsync their own writes. Its public configuration supplies no hard disk quota or retention enforcement; retain ledger/request/capture bounds and explicitly report that unsupported guarantee rather than claim it.

The concrete preview covers provider/model/effective reasoning/preset, environment, exact approved context, empty tools, plaintext session persistence, reservations/attempts and expiry. A bounded existing target label could carry the disclosure; a structured additive preview needs its own separately frozen contract. Persisting new installation-consent data also needs a separate schema decision.

## One-use native execution and lifetime

Keep the existing sequence: exact approved action, atomic claim/reservation, durable dispatch intent, native idle creation, separate explicit execution intent, one-use final admission and native send. Await public preset mounting and set the owned approval override before public setup commit; final commit checks remain synchronous.

The original loop performs asynchronous `agent/request` and `llm.prepareCall` work after send. A before-send configuration check alone does not close that later provider boundary. An installed-only public `llm/stream` guard should identify exact owned session IDs and original `isAgentLoopRequest` requests, recheck current execution/configuration/empty tools, and consume one private provider-request permit before `next()`. This smallest unit refuses auxiliary compaction/title/retry/additional-step requests and passes unrelated native sessions through unchanged. It invokes no provider during configuration or planning.

Unload seals admission before asynchronous disposal. Restart restores durable observations without recreating ownership handles, previews, grants or work. Unknown create/execution keeps reservations and uncertainty; query cannot replay. Revocation/cancellation stops new admission and records current facts without promising instant termination.

## Source seams and next freeze

Repository seams: installed-config; new installed-worker; installed-plugin; a narrow private runtime-plugin installer; environment effective options; native-adapter preset/setup/request gate; worker/runtime-store current execution assertion; and explicit client controls plus regenerated bundle. Existing schema4 records may represent this bounded unit if persistence consent is fully bound in action target/preview; no vault change is proposed. New persisted fields require a new frozen storage contract first.

The lane inspected pinned public sources under `.runtime/dsh-web/node_modules/@deepseek-ai`: dsh-llm index/types/call-config; dsh-agent-preset-registry index/types/composition-inventory; dsh-agent index/runtime-types; dsh-agent-loop index/types (captured persistence around1820/1922, later request preparation around1166–1201); dsh-session-persistence types/handle; dsh-session-persistence-jsonl index/types (durable paths around2869/3178/3229); dsh-user-approval index/types; dsh-permission-presets types; cordis-plugin-loader Entry/tree types; and dsh profile-boot types. Exact newly consumed peer/class/source pins must be frozen before code; this list alone is not provenance acceptance.

Independent design must cover hostile/disabled config; missing/stale catalogs/reasoning/presets/mounted tools; canonical path/service/root drift; plaintext disclosure and unchanged vault/unrelated sessions; each async lookup/setup/request boundary raced with revoke/cancel/provider/policy/environment/unload; nonrecursive atomic admission; and uncertainty/duplicate zero-replay. Actual packed proof must use original CLI/authentication, explicitly configured original JSONL root and local deterministic provider: idle0streams, explicit1stream, duplicate0additional, exact owned input/output, reload/quit/restart without replay. No real inference, tool body, external recipient, personal credential or browser operation is authorized.

Root must turn this proposal into a bounded contract and obtain independent design before NI2 GO. Final CODE/browser/model quality/full ticket/MVP/publication gates remain HOLD.
