# BUB001 bounded native interface evidence

Author: delegated `host_bootstrap` (gpt-6.1-sol, high or above), 2026-10-04. Starting branch `feat/M1-foundation`, prerequisite commit `abb28b7e3962fa46c492b077c6cce5a8613a843b`. Root alone controls Git. This document records implementation and executable fixture evidence; independent reviews and the final reviewed SHA are recorded by root separately. It does not accept the full BUB001 ticket, a full MVP, or a release.

## Policy and dependency gate

Read AGENTS, development-workflow, waves, foundation-contract, M1-foundation and BUB001 before implementation. Inspected enabled tools and installed public package inventory: no separate `runtime-policy` tool/package was supplied. Root confirmed the applicable policy is the managed workspace-write sandbox plus owner restrictions. All execution used normal `use_default` permissions. No action was denied; one exec-server transport disconnect was retried normally. No escalation or bypass occurred.

Imports are confined to built-in Node APIs and existing public installed Cordis/session/approval modules. No install, download, package script from an external dependency, credential/profile/settings read/write, live launcher, inference, model registration or external transport was used. SQLite is built in; no storage dependency was needed. `package.json` is private and `0.1.0-preview.1`, with exact peer declarations documenting host requirements. No package lock is required for zero newly installed dependencies; do not run `npm install` for this fixture. No distribution source was copied and no owner copyright license was selected.

## Concrete support target and provenance

Only target `desktop-0.9.1-harness-0.1.5-rc.2` is supported by the native bootstrap. The installed Mac directory pin is intentional M1 scope; portable installation/packaging remains later work. The fixture imports public modules from `/Applications/DSH Desktop.app/Contents/Resources/app/node_modules/@deepseek-ai/` and executes `/Applications/DSH Desktop.app/Contents/Resources/app/node_modules/node/bin/node`.

| Component | Observed version | SHA256 checked by bootstrap |
| --- | --- | --- |
| Desktop `app/package.json` | 0.9.1 | `fc1389b7779ce658572760f9b304e1e9f01b0b551959861cb79869b6428887db` |
| embedded `dsh/package.json` | 0.1.5-rc.2 | version only; concrete public services below are source-pinned |
| `cordis/lib/index.js` | 4.0.2 | `1729cdbf8ee40b17c8839e06bf96491490548559e11ef7e411271e0754e751c5` |
| `dsh-session/lib/index.js` | 0.1.5-rc.2 | `05e94f57d96e7979670a5b51024c8591572eb0051ce793613dbdec35cf2c47bf` |
| `dsh-user-approval/lib/index.js` | 0.1.5-rc.2 | `fbd3f2e348358d27234739f8cbc4bdb2d6450b0a6b1b207572463977b14a5ecb` |
| bundled Node | v24.9.0 | runtime version and actual SQLite capability checked |
| bundled built-in SQLite | 3.50.4 | actual `DatabaseSync(':memory:')` and SQL version query |

Development Node v22.22.2 also provides built-in SQLite, observed 3.53.2 by the core author. It runs the core/config unit suite; it does not pass the exact native runtime target. `npm test` invokes the bundled Node for the host fixture inside the bootstrap test. `npm run test:host` runs the complete suite under the bundled Node. The package engine declaration permits both tested development/runtime versions, while `probeHost` permits only v24.9.0 as the native target.

Version strings do not suffice. Bootstrap requires the Cordis global context brand **and exact installed Context class identity**, exact installed SessionStore/ApprovalService class provenance, native `provide/effect/on`, `sessions.create/get/list`, `approval.request/effectivePolicy`, pinned source hashes, and actual built-in SQLite use. Handmade method lookalikes fail provenance. Missing or changed packages/services/runtime fail before Foundation construction; no fallback to CLI or master is attempted. Update any version/hash only after reviewing and retesting that concrete public implementation. `probeHost()` returns named failed checks, versions/hashes and stable bridge status without raw paths/config/errors. Native load failures use `HOST_CAPABILITY_UNSUPPORTED`; the exported probe supplies the concrete capability differences for diagnosis.

The current official [Cordis primer](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md) was browser-verified on 2026-10-04. Its public plugin/injection/reversible-effect model informed the implementation; installed 4.0.2 source, not current master assumptions, determined the actual APIs. Initial `main` references failed; the official repository uses `master`. Official [master package metadata](https://github.com/deepseek-ai/deepseek-harness/blob/master/package.json) was separately browser-observed at **0.2.1-alpha.1**. It is not the installed version, supported target, or upgrade authorization.

Global CLI `/opt/homebrew/bin/dsh` resolves to `/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/lib/bin.js`; its package is **0.1.1-rc.2**, package.json SHA256 `dc930c0b18158f49ae3753ceaf6b1b7ae71dc6c8f45c85a2d679b142024addf7`. It was inspected read-only, not launched. Its public services/package/runtime differ from the pinned Desktop target; this bootstrap does not claim CLI compatibility. The SDK-minimal/app/JSON-RPC packages and DSH-X are not used: bubbles remains a native host plugin and creates no additional runtime, daemon or launcher.

## Bootstrap/core interface and trust

ESM default export is `{name, inject:['sessions','approval'], Config, apply}`; named exports include `createPlugin`, `Config`, `validateConfig`, `apply`, `probeHost`. Cordis 4.0.2 accepts the synchronous Standard Schema `Config['~standard'].validate` contract. Config requires an absolute bounded databasePath; only databasePath/hostTarget/limits are accepted. All accessors, Proxies (including revoked ones), unusual prototypes, symbols, unknown keys, invalid number types and invalid target strings fail with fixed codes. Proxy traps are never invoked by record validation. Paths/keys/values/errors are never interpolated into diagnostics. Limits default to queue32/active2/attempts3/tasks1000/actions16/events128/metadata1024; metadata min256, explicit conservative caps and active≤queue≤tasks are validated before opening storage.

`Foundation({databasePath,limits,hostPermission:()=>false,trustedOperators:[]})` starts recovery and supplies `close()`. Storage lives only in the private effect closure. `ctx.bubbles` publishes no Foundation handle, capability, grant/revoke function, tool, event ingress, timer, provider or worker. Its default native identity bridge is unavailable, so task calls fail `IDENTITY_UNAVAILABLE`; native dispatch remains denied. `deleteTask` fails `OPERATOR_UNAVAILABLE` until a trusted operator bridge exists. A denied action never becomes an allowed action because a durable grant exists in another fixture.

`createPlugin({identity})` accepts a trusted same-process callback outside JSON/config for controlled host integration. The callback is sampled once before ledger creation and copied/frozen per activation; subsequent mutation of its source object cannot change scope. Native operations derive scope exclusively from that binding: `intake(input)`, `getTask(taskId)`, `listTasks()`, `exportTask(taskId)`, `transition(taskId,input)`, `requestAction(taskId,input)`, `claim(taskId,actionId,input)`, `cancel(taskId,input)`, `settle(taskId,actionId,input)`. Request objects accept only their per-method field allowlist. Payload scope/owner/workspace/principal/verified flags cannot authenticate or override the binding. Arbitrary JSON callers have no exported permission/authority mint.

One `ctx.effect` owns SQLite cleanup and `ctx.provide('bubbles',service)`; cleanup registered before publication handles startup failures. Borrowed methods additionally check public fiber state/uid: Cordis marks unload synchronously but schedules disposer work asynchronously. Consequently old references fail `SERVICE_DISPOSED` from the unload linearization point, including before disposal promises settle. Required-service loss stops dependents; their reappearance creates a new service and reruns config/capability validation and recovery. Changing identity requires a new activation.

## Actual executable fixture and commands

`scripts/host-smoke.mjs` creates the installed public Context, loads installed SessionStore and ApprovalService with policy `never`, and imports the real bubbles plugin. All IDs are synthetic and ledgers are temporary and removed in finally. It does not create the Desktop app, read a profile, mount an agent loop or configure an inference provider.

Commands run from the bubbles repository:

- Bundled `node -e` SQLite probe: v24.9.0, actual SQLite3.50.4; success.
- `npm run check`: syntax success for all runtime/test/script ESM files; zero installs/downloads. Final count is recorded by root after integration.
- `node --test test/bootstrap.test.mjs`: **8/8 passed** under development Node22.22.2, including the metadata min256 N-1/N/N+1 boundary; actual host fixture spawned bundled Node24.9.0.
- `npm run host:smoke`: **passed**, JSON result loads11/reloads10/entries11, permissionOutcome=`rejected`, inferenceCalls=0, profileAccess=false, all capability checks true.

Fixture checks: real approval request runs inside a synthetic turn and policy never rejects it; fixture session unload removes it. Malformed config fails before ledger creation and sentinel config values/keys do not enter errors. Default native task identity rejects spoofed JSON. Eleven real plugin activations with ten reloads each submit one synthetic input twice and produce exactly one durable entry per input; reopen retains prior entries. No worker sessions appear. Plugin registry count returns to baseline and ctx.bubbles disappears after every unload. Every captured method rejects immediately after unload is requested and after it settles. Mutating the trusted identity source after load leaves bound scope unchanged. Missing both required services, late approval appearance, approval disappearance/reappearance, and session disappearance are tested; no ledger is created while dependencies are missing. Provider removal closes old admission immediately.

An independent reviewer reproduced an initial unload-before-disposer race (CR-02); public fiber state/uid checks fixed it and the regression now runs before awaiting every disposal. The reviewer independently retested that fix. An initial deletion argument mismatch was replaced with explicit native operator denial. A hostile input Proxy could originally throw its raw error through record validation (CR-05); `util.types.isProxy` now rejects hostile/revoked Proxies without invoking traps and unit/native-fixture regressions pass. These changes require the independent final review/retest recorded by root; this author does not self-accept them.

## Supported/pending matrix

| Gate | Status/evidence |
| --- | --- |
| Installed public Cordis/session/approval package/runtime pin | tested supported for the exact target above |
| Native library plugin config/load/unload/reload10 and dependency changes | tested supported in disposable public-service fixture |
| Strict config / fake capability / identity override denial | automated fixture/unit checks passed |
| Native DSH owner/session-principal bridge, operator bridge, exact runtime permissions | pending; default identity unavailable/operator unavailable/dispatch denied |
| Actual Desktop profile install/activation/settings integration | pending, not run; requires bounded profile/settings authorization |
| Desktop UI/window-close/full-quit/restart lifetime | pending, not run; library fixture is not app lifetime evidence |
| CLI0.1.1-rc.2 | unsupported by this exact target pin; full CLI compatibility/functional tests pending |
| Upstream0.2.1-alpha.1 | observed only; no install/upgrade/runtime acceptance |
| Real agent/provider/inference/effects | pending later milestones; zero calls in M1 |
| Full BUB001-01..05 / full MVP / release | pending; bounded M1 API foundation only |

## Installed native worker/control findings for W2 (read-only)

These are concrete installed **0.1.5-rc.2** source findings, not M1 runtime acceptance. `SessionStore.create` constructs an in-memory Session and explicitly supplies no persistence by itself. AgentRegistry (`ctx.agents`, `dsh-agent/lib/index.js`, create at line417/resume430) instead requires a registered factory and returns an owning AgentHandle after setup/publication/loop start. `resume` requires configured persistence through that factory. The factory is AgentLoop (`ctx.agentLoop`), injecting agents/sessions/llm/tools/systemPrompt/sessionProjections. Its worker Agent methods in `dsh-agent-loop/lib/index.js` at lines783–803 include `send`, `followup` (next-turn+wakeup), `steer` (next-step+wakeup), `inject` (next-step without wakeup), `cancel` (clears inbox unless keepInbox and signals current abort). Calling cancellation is not confirmed termination or proof that an effect was reversed.

`SubagentRuntime` (`ctx.subagents`, `dsh-subagent/lib/index.js`) is a named-provider registry. One-shot `start` and continuation/control paths are different. Continuations require agents, session persistence and query; listing/control also requires sessionProjections/sessions/sessionQuery and rejects missing seams with named capability errors. Provider capability flags must be checked for the desired operation. `SessionController` (`ctx.sessionController`, `dsh-api-session-controller/lib/index.js`) injects agentDefaultModel/agents/attachments/fileUploads/llm/sessions/sessionProjections/sessionQuery/typert/workspaceRegistry and exposes create/resume/fork/cancel adapters. M1 mounts none of these worker assemblies. W2 must verify actual factory/provider/control methods and trusted host identities before using them; SessionStore success proves no worker-loop support.

Additional installed source SHA256 values, not bootstrap acceptance hashes:

- dsh-agent/lib/index.js: `b05aa36fce8e2f910596a682fb1d2b461eac2549e344360c92711a557d06b0bb`
- dsh-agent-loop/lib/index.js: `257eb83c00a05ee068e9f4ba80ca71ab94e3a1275d24b7a0cf5038ff23dd0fd8`
- dsh-subagent/lib/index.js: `b8ea0e37bd6f1d9c4bd870c4ca03839f6d0e42f648a83578e31a448f6dffe4ef`
- dsh-api-session-controller/lib/index.js: `2c0fa776bc3ad457477d48d929a41cc0e7ef5f7d8d2ffbe102b77ae97780bab0`

Suggested root commit units: (1) config/probe/native service/package declaration, (2) bootstrap regression tests + installed public smoke + coordinated syntax-check script, (3) host-interface evidence together with root-reviewed integration/remediation evidence. Core files and independent review/adversarial tests remain their respective authors' units.
