# Fishball runtime isolation investigation

Status: investigation and proposed migration, 2026-11-03. **The running Fishball has not been migrated.** This document replaces the assumption that a private agent scope provides independence from main-profile plugins; it does not mark the migration complete. Host API baseline inspected: DSH 0.2.1-rc.3.

> **Later state (0.1.0-alpha.0).** The migration this document proposes has since landed: the
> built-in instance runs Fishball as a separate child DSH process with its own home/profile/env
> (`packages/instance/src/native-runtime/**`), an authenticated lifecycle wire and the slim session
> bridge (`packages/connector/src/slim/host/bridge.js`). The release targets DSH 0.2.1-rc.5 and
> 0.2.2-rc.1 (not rc.3). The "Existing model accounts" open question was resolved by provider sync
> (`packages/instance/src/provider-sync*.js`), which copies API-key records into the child home.

## Requirement and decisions

The owner requests Fishball to be unaffected by the main DSH profile’s plugins, while reusing the existing DSH installation rather than downloading another DSH. The owner selected reuse of existing model accounts through an explicit bridge.

- **Installation is not runtime state.** A separate process can load the exact packages supplied by the running DSH installation, with its own root context, services, profile, and event bus.
- **Upgrade behavior:** after DSH updates and restarts, a newly started Fishball worker resolves the updated host installation. Already-running processes do not hot-swap loaded packages. No independently installed or separately updated DSH copy is needed.
- **Recommended execution boundary:** a child process. A separate Cordis root in the same process isolates registry/event namespaces but not module singletons, environment changes, monkey patches, or process failures.
- **Pending decision:** current public APIs cannot combine arbitrary existing subscription accounts with a hook-free model bridge. Approval to extend DSH’s supported model API, or an explicit relaxation of the requirement, is still needed. The timed-out choice prompt is not approval.
- **Pending validation:** reuse of the stock conversation UI through a separate client root/transport. UI extension isolation is separate from backend isolation.

## Why the current implementation leaks

| Boundary | Current behavior and evidence | Consequence |
|---|---|---|
| Plugin switch | [Catalog](<../src/plugin-catalog.js#L5-L25>) reuses an already-running main-profile plugin and masks its tools when off. | Turning a plugin off for Fishball does not stop its hooks. |
| Private composition | [Composition](<../src/composition.js#L123-L153>) creates a child scope from the host row and mounts a private Loader tree. | This is an overlay, not an independent runtime. The service leak audit checks publication out of the tree, not inherited host behavior. |
| Lifecycle | [Lifecycle](<../src/lifecycle.js#L177-L219>) resumes/creates Fishball through the host agents service. | Fishball lifecycle and session events enter the main event bus. |
| Prompt | [Persona](<../src/persona.js#L48-L61>) and [composition](<../src/composition.js#L262-L268>) shadow selected entries. | Unknown prompt entries, anonymous providers and global assembly hooks are not excluded. |
| Settings | [Catalog settings](<../src/plugin-catalog.js#L807-L837>) marks main-profile plugin settings as shared. | Independent configuration is intentionally unavailable for shared instances. |
| Package folder | [Private manager](<../src/fishball-plugin-manager.js#L75-L85>) isolates one service name and overrides the profile destination. | Independent install files do not imply independent runtime services. |
| Durable state | [Store](<../src/store.js#L322-L327>) opens Fishball domains using the host storage service. | Named domains separate Fishball records, not every plugin’s storage or ambient home. |
| Chat | [Client](<../client.js#L1673-L1684>) opens an ordinary host session. | Moving only tool execution into a worker leaves the agent/session boundary shared. |

Installed host implementation references (paths below are relative to the installation’s `node_modules/@deepseek-ai/`, not user configuration):

- `dsh-scope/lib/index.js:177-180`: merged scoped registries begin with global registrations; `:315-335`: untagged/global listeners are admitted.
- `cordis/lib/index.js:258-263`: `global: true` listeners bypass context filtering. `:1677-1689`: constructing a new Context creates a new registry/event root; `:1711-1725`: isolating a service name does not create that root.
- `dsh-agent-preset-registry/lib/index.js:495-505`: presets also use child scopes; a preset is not a replacement isolation boundary.
- `dsh-home-paths/lib/index.js:101-125`: `DSH_HOME` and `DSH_AGENTS_HOME` are separate roots. Changing only a profile name leaves other discovery/storage paths shared.

A concrete installed-plugin example is OpenViking: its memory plugin registers `agent/created`, `agent/pre-step`, `session/event`, and `session/flush` handlers, independently of visible MCP tools. These can inject recall or capture conversations even when Fishball masks the plugin’s tools. This is evidence from plugin code, **not a claim that every inspected plugin is currently enabled**. Likewise, filesystem skills/instructions and MCP resources can be inherited independently of a plugin-specific tool switch.

## Proposed runtime boundary

```text
One DSH installation (shared package code, no second download)
  main DSH process                         Fishball child process
    main profile/plugins                     explicit Fishball profile/plugins
    main sessions/event bus                  private agents/sessions/event bus
    main model accounts                      private prompts/tools/skills/MCP
    Fishball integration controller  <---->  private persistence/configuration
                         explicit IPC capabilities only
```

1. Resolve the worker’s DSH package set from the running host, not a fixed version directory, global CLI search, or the main profile’s enabled bundle list. Use the same runtime executable where supported. Check host/worker compatibility before serving commands.
2. Use the public `dsh-app-boot.boot(binName, absoluteConfigPath, patches, prepare, bareModuleBaseUrl)` API. Its documented installation-resolution base supports reusing host packages; an explicit empty patch list prevents optional profile overlays. It constructs a fresh root and audits startup. See `dsh-app-boot/lib/types/index.d.ts:317-347` and implementation `lib/index.js:4507-4544`.
3. Give the worker its own home, agents home, profile, cwd, session store, storage domains, plugin install folder, caches, and discovery configuration. Establish the environment **before imports**; do not spread parent environment variables, loader flags, profile variables or secrets into the child. Enumerate necessary platform variables and handle tool/network configuration explicitly. Do not copy the main profile or symlink its mutable stores.
4. Load only Fishball’s explicit core/plugin composition. Reuse stock DSH services/classes rather than reimplementing agent loops, persistence or plugin installation. Main-profile plugin activation/configuration must not change Fishball activation/configuration. Resolve optional Fishball packages independently with compatible host peers.
5. Keep all worker agent/tool/prompt/LLM/session lifecycle events private. Never publish its live Agent/Session objects in the host registry or replay its internal events through the host bus merely to preserve the UI.
6. Parent lifecycle owns child startup, readiness, shutdown and restart. Version mismatch, bridge disconnect or failed required plugin must fail closed; never fall back to creating Fishball on the host agents service. Restart behavior and durable migration must be tested before enabling this by default.

This is execution and state isolation from unrelated plugins, **not a hostile-code security sandbox**. Both processes still run as the same OS user unless an additional OS sandbox is configured; a malicious filesystem writer could reach other user-owned data. Sharing installed code also means updates to explicitly selected code remain intentional dependencies.

## Narrow bridges

### Existing model accounts: unresolved supported API

A bridge to host `llm.stream()` is insufficient. The stream returned by public `llm.prepareCall()` also enters the main `llm/stream` waterfall. Both allow main-profile middleware to observe or alter Fishball requests. Installed `dsh-llm/lib/index.js:2220-2258,2393-2397` and `lib/types/index.d.ts:109-115,407-434` confirm this; direct registration lookup and adapter dispatch are private.

Installed subscriptions 0.9.11 exposes plugin mounting/configuration, not a raw adapter or injectable account-token store. Adapters/token maps live inside its initialization, and its authentication/preferences/cache files use `dshHomePath`. Sharing that home shares mutable state; isolating it does not retain the existing login. Copying/symlinking live OAuth stores risks competing refresh writers and is not an account bridge.

**Recommended prerequisite:** a supported, explicitly authorized raw prepared-provider operation in DSH, retaining registration binding, request validation, normalization, cancellation and error handling while excluding unrelated host LLM middleware. The selected provider adapter and its account policy remain intentionally trusted. Credentials stay with the provider/account owner. IPC carries only permitted model requests, responses, metadata and cancellation; attachments require bounded data access, not arbitrary host path access. Subscription account pooling/failover remains adapter-owned unless it exposes account pinning; provider/model selection alone must not be described as selecting a single account.

Alternative: a supported provider-level account broker that allows a private worker-side adapter. Native DeepSeek exports a protocol adapter with injectable authentication callbacks, but that does not solve arbitrary subscription providers. Do not introspect private adapter maps, monkey-patch the host waterfall, modify installed host files silently, or quietly use the hook-bearing stream API.

### DSH session integration

Keep a host-side controller for the intentional operations Fishball already performs on main DSH sessions: messaging, watching, management and permission/question routing. Define validated request/response/event DTOs with bounded payloads and explicit authorization. Only the required notifications cross into Fishball’s intake; arbitrary host lifecycle hooks do not. Main sessions remain subject to their own DSH plugins: managing them is not isolation of those sessions.

### Existing-state migration inventory (source audit, 2026-11-04)

Changing the runtime root is not a safe copy of the current Fishball storage domains. The following inventory comes from source only: no live profile, archive, stored message or secret was read. It identifies migration work, not an implemented importer or an approved retention policy.

| Current state | Verified ownership/dependency | Migration constraint |
|---|---|---|
| Assistant identity and history | The [assistant record](<../src/store.js#L69-L75>) stores session/workspace/cwd identifiers; [startup](<../src/lifecycle.js#L170-L218>) resumes or creates through host agents. The Fishball domains do not contain the DSH conversation archive. | Copying this record does not transfer a session. Decide whether to import supported session history or start a new private session while retaining the old host history; verify the chosen path before switching the active assistant. Never point private persistence at the host archive. |
| Session-bound settings and pending intake | [Context settings/unread](<../src/store.js#L32-L58>) are session-bound; [intake records](<../src/store.js#L218-L233>) track message IDs, dedupe keys and delivery targets. [Reconciliation](<../src/intake.js#L269-L287>) can discard an accepted item belonging to another assistant, or redeliver one missing from the same session. | Identity, inbox/log and ledger transfer must be coordinated. Blindly retaining or replacing the ID can lose queued work or duplicate effects. Preserve delivery evidence and test interrupted transfer/retry rather than replaying every stored message. |
| Main-session management, watches and security audit | [Managed sessions](<../src/managed.js#L104-L146>) and [watches](<../src/watches.js#L98-L122>) use host services/events. [Grants, decisions and tags](<../src/store.js#L120-L167>) and [outbox/approval audit](<../src/store.js#L235-L268>) contain session/call references. | Managed targets and watches refer to main sessions, while audit tables can also include [Fishball’s own decisions](<../src/own-requests.js#L423-L430>). Classify each reference by its original runtime and role; keep host operations behind the explicit management bridge; do not rebind a matching ID to a different runtime or treat an audit outcome as new approval authority. |
| Plugin selections and defaults | [Legacy defaults](<../src/plugin-defaults.js#L4-L20>) depend on which main-profile plugins were enabled when an existing install was observed. [Stored plugin choices](<../src/store.js#L77-L100>) include removal state and prior failures; [tool allowances](<../src/store.js#L197-L203>) are also durable authorization records. | Do not import the main enabled-bundle list as the private boot profile. Resolve old catalog identities against an explicit private composition; record unavailable/incompatible choices rather than silently inheriting a host instance. Treat durable tool allowances as authorization to reconcile against the destination tool identity, not mere display preferences. |
| Plugin configuration and other sensitive data | [Plugin settings](<../src/store.js#L102-L111>) can include secrets and use row IDs; the [overlay](<../src/plugin-settings.js#L196-L215>) merges them into plugin configuration. [Own requests](<../src/store.js#L169-L195>) can retain argument excerpts/notes, and intake can retain message bodies. | A whole-domain dump is not a harmless preferences export. Define the allowed transfer and secret handling before implementation; validate destination plugin schemas/identities, keep secrets out of diagnostics/browser DTOs, preserve appropriate redaction for other sensitive content, and leave model-account credentials host-held. |
| Live approval/question state versus durable passes | [Approval requests and settlement callbacks](<../src/approvals.js#L282-L287>), [question entries](<../src/questions.js#L310-L319>) and [one-time call passes](<../src/passes.js#L1-L23>) are in memory. Fishball [own-request cards/passes](<../src/store.js#L169-L195>) are durable and [catch-up](<../src/own-requests.js#L277-L295>) depends on the old session log/turns. | A stored card is not a serializable live reply channel. Settle or explicitly reconstruct requests under their original owner; never revive an authorization solely by importing its record. Specify cutover treatment of pending requests and test expiry, disconnect and stale replies. |

Before implementation, settle history/identity retention and pending-work/secret transfer semantics alongside the model API scope. Proposed migration safety gates: quiesce the old assistant and all state writers before taking a consistent snapshot; validate a separate destination without overwriting the source; record a resumable migration revision and identity mapping; permit only one active assistant writer at cutover; and verify restart/rollback at each boundary. Rollback after new external effects must reconcile the ledger, not blindly re-enable the old queue. These are review requirements, **not evidence that any migration or rollback mechanism currently exists**. No automatic copying, resetting, deleting or re-authorizing existing user state has been selected.

### Conversation UI and approvals

Reuse stock DSH conversation components with a private client context, remote connection and runtime-owned session controller/projections. Carrier-neutral connection and gateway APIs exist (`dsh-client-connection/lib/types/index.d.ts:49-56`, `dsh-api-gateway/lib/types/index.d.ts:88-100`). Although the internal `ClientSessions` constructor accepts a remote interface, it is **not exported by the supported client entrypoint**; install the stock session-controller client plugin rather than deep-importing that class. These establish a possible seam, **not a proven drop-in dual-runtime UI**.

A separate client root (or stronger embedded-page boundary) must prevent main-profile frontend extension slots from mutating Fishball’s conversation. Do not re-register its agent in the host to make the current open-session call work. Fishball’s own approvals must return to private pending-request state, including cancellation/disconnect handling; no live answerer means fail closed. Host-managed-session approvals remain intentional host integration.

### Client composition audit (2026-11-04)

The rc.3 public client entrypoints expose enough composition seams to investigate reuse without publishing private sessions into the host. This is a source audit, not a browser integration result:

| Public owner | Verified seam | Constraint for the private composition |
|---|---|---|
| `@deepseek-ai/dsh-client-connection/client` | `installConnection(ctx, options)` accepts an instance-local `transport.rpc` (decoded unary/stream carrier), plus explicit interaction participation and location. | Use explicit options; the plugin’s ordinary `apply` reads page-global `__DSH_TRANSPORT__`. Never replace the main page’s global transport. A missing private carrier must fail startup rather than default to host HTTP. |
| `@deepseek-ai/dsh-api-session-controller/client` | `apply(ctx)` constructs its session owner from `ctx.remote`, subscribes to remote session events, and owns the reconnecting control stream. | Requires private connection, file upload, Typert contexts and generated `commands`, `session`, `subagents` remotes. Reusing the host services would reintroduce cross-runtime routing. |
| `@deepseek-ai/dsh-client-ui-renderer/client` | `apply(ctx)` creates a context-owned slot registry and a `uiRenderer.mount(container)` disposer. | A private registry can exclude host slot entries, but shared page globals, the module loader and CSS remain shared. This does not establish a separate browser execution realm. |
| `@deepseek-ai/dsh-client-ui-session/client` | `apply(ctx)` binds session UI sources and scopes to the installed sessions, slots, remote and remote-access services. | All four must belong to the private client composition. A private backend plus the existing host UI scope is insufficient. |

The existing [Fishball opener](<../client.js#L1676-L1684>) passes its session ID to the host workspace. Its [status EventSource](<../client.js#L1544-L1576>) is not the stock session/control transport. Neither can simply be pointed at a worker session ID. Before UI delivery, demonstrate stock private-session history, streaming, tool cards, uploads, approvals, cancellation and reconnect in the actual served GUI; demonstrate host extension-slot exclusion and define the page/realm boundary. A same-origin frame alone is not protection against malicious parent-page scripts, just as a child process alone is not an OS filesystem sandbox.

## Delivery gates

| Phase | Required evidence before delivery |
|---|---|
| Boundary investigation | Independently authored tests distinguish global child-scope inheritance, fresh child roots, separate home paths, and host LLM middleware. They prove DSH primitives only, not migrated Fishball. |
| Model capability | Decision on the supported host/provider API; independent tests for normalization, streaming, cancellation, model/account changes, middleware exclusion and no credential leakage. |
| Worker core | Same-install boot, independent plugin lifecycle/config/state and private events; restart/exit cleanup; compatibility failure; no host fallback. |
| Integration/UI | Separate transport/client composition, existing messaging/watching/management features, private approvals, no lifecycle republication or host UI-plugin injection. |
| Migration | Preserve existing history/settings by an explicit, backed-up migration policy; do not blindly migrate old shared plugins or credentials. Decide plugin/config selection before switching. |
| Release | End-to-end hostile-hook probes against real Fishball; restart and host upgrade rehearsal; independent code review; local logical commits. |

### Investigation test result

The independently authored [boundary test](<../test/runtime-isolation-boundary.test.mjs>) passed all four cases against installed DSH 0.2.1-rc.3 using a fake provider, no live account, and no network requests. It distinguishes scoped/global event routing and disposal; demonstrates inherited ordinary services; proves both public model stream paths run host middleware; and boots a child from the same resolved installed packages with separate process globals, services, event hooks, profile and both home roots. Parent marker files remained unchanged. This verifies the primitive boundary, **not Fishball migration, a real model-account bridge, frontend isolation, OS sandboxing or upgrade behavior**.

Run it with an explicit rc.3 installed package directory (the investigation test does not download DSH). It is opt-in: without `DSH_RUNTIME_ROOT`, it reports a skip so the existing default test suite retains its own runtime prerequisites; an explicitly configured invalid installation fails:

```sh
DSH_RUNTIME_ROOT="/absolute/path/to/installed/dsh/node_modules" node --test test/runtime-isolation-boundary.test.mjs
```

### Transport and approval proof result (2026-11-04)

The independently authored [transport test](<../test/runtime-isolation-transport.test.mjs>) passes four tests (three behavioral subtests plus their parent) against the installed rc.3 packages:

- Unary invoke, stream and uplink calls reach the private controller; live host-side control calls establish that the host observers are registered but do not receive private traffic.
- Stock `ApprovalService` returns `unavailable` without a private answerer, even when the other root has an allowing plugin.
- Stock `api-remotes` projects a private approval event; answering it through the private Connection direct Fetch handler and Gateway returns `allowed-once` to the private approval request, without involving the host approval listener.

The fixture uses two independent roots in one test process, synthetic controllers/session audit sinks and direct in-process carriers. No network listener, account or live user session is used. This validates the public backend transport and approval seams; it **does not prove IPC, browser client installation, real session persistence, disconnect/reconnect, production approval migration, model-account access or hostile-code isolation**. The opt-in selector behavior is the same as the boundary proof: absent skips; explicitly invalid fails.

```sh
DSH_RUNTIME_ROOT="/absolute/path/to/installed/dsh/node_modules" node --test test/runtime-isolation-transport.test.mjs
```

Validation scope: the targeted proofs above passed; no full-suite pass is claimed. The earlier optional `npm test` run, with disposable homes, was stopped after roughly 255 seconds after PTA-01 failed while waiting for an inner approval request. Its cause was not established and no baseline rerun was performed. The job was stopped and collected and its disposable regression homes were cleaned. This is neither proof of a pre-existing failure nor proof of a regression from these investigation tests.

Acceptance includes main-only prompt, skill, MCP, memory, tool guard, session-hook and LLM middleware probes leaving Fishball unchanged; Fishball plugin enable/disable/config writes leaving main state unchanged; same-version resolution without downloading DSH; fail-closed worker/bridge failures; and complete process cleanup. Approved bridges are the only intentional exceptions.
