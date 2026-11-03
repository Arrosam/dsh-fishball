# Fishball runtime isolation investigation

Status: investigation and proposed migration, 2026-11-03. **The running Fishball has not been migrated.** This document replaces the assumption that a private agent scope provides independence from main-profile plugins; it does not mark the migration complete. Host API baseline inspected: DSH 0.2.1-rc.3.

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

### Conversation UI and approvals

Reuse stock DSH conversation components with a private `ClientSessions`/remote connection and runtime-owned session controller/projections. Carrier-neutral connection and gateway APIs exist (`dsh-client-connection/lib/types/index.d.ts:49-56`, `dsh-api-gateway/lib/types/index.d.ts:88-100`); the stock client session manager accepts a remote interface. These establish a possible seam, **not a proven drop-in dual-runtime UI**.

A separate client root (or stronger embedded-page boundary) must prevent main-profile frontend extension slots from mutating Fishball’s conversation. Do not re-register its agent in the host to make the current open-session call work. Fishball’s own approvals must return to private pending-request state, including cancellation/disconnect handling; no live answerer means fail closed. Host-managed-session approvals remain intentional host integration.

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

Acceptance includes main-only prompt, skill, MCP, memory, tool guard, session-hook and LLM middleware probes leaving Fishball unchanged; Fishball plugin enable/disable/config writes leaving main state unchanged; same-version resolution without downloading DSH; fail-closed worker/bridge failures; and complete process cleanup. Approved bridges are the only intentional exceptions.
