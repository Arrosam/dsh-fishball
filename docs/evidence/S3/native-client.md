# Native client module implementation evidence

Owner authorized Stage3 client implementation on the pinned official DSH Web 0.2.1-alpha.1. This is module evidence and a source-inspected extension boundary; real Web loading, rendered interaction, keyboard, responsive layout, focus, connection reset and visual regression remain deferred acceptance oracles. No Web process, browser, model stream, external service or dependency installation was invoked by this unit.

## Public extension boundary

Installed sources are beneath `.runtime/dsh-web/node_modules/@deepseek-ai/`. The public client manifest declares `window.__ModuleLoader__.load({id,factory})`; the registered factory is lazy and resolves dependencies through the host module table. Our `bubbles` module resolves only the host's `react`. It uses ordinary React `createElement`, hooks and native slot registration. The builtin Node emitter serializes our own self-contained factory, performs syntax validation, and writes a deterministic reviewed bundle; it copies no host source and invokes no bundler/download.

| Inspected public source | SHA256 |
| --- | --- |
| dsh-client-modules/lib/types/client/manifest.d.ts | d416fc7327b3cdca52c530b0b4f51aba65f5aa5d025582f31acc1711e8b06752 |
| dsh-client-ui-slots/lib/index.js | 57e1314e31a2015f30231e1e7596da658f1bb5cb64c103c4cf13381647412c99 |
| dsh-client-ui-renderer/lib/types/client/index.d.ts | e143cabd2ab72466e37b4d62fbf1ff9e5ee0054d6fd48a1dfe29327b696be4f1 |
| dsh-client-connection/lib/types/client/index.d.ts | 5bcacf56ca3c3fb26256a6ee3aff980a399dcf4901d594b034d960ae04bd2f8d |
| dsh-client-ui-layout/lib/types/client/index.d.ts | de04ea7bb5e1c0d44dc87c31eb6565786c4cc629f4eefd92064e1b3142817260 |
| dsh-client-ui-sidebar/lib/types/client/index.d.ts | 924baa712881de5a9c499cd49117718654ebb56cf8242768cda512382202fb49 |

The client requests `connection`, `slots`, `layout` and adds keyed `main/bubbles` plus list `sidebar.panellist/bubbles`, using the native sidebar label/panel mechanism. It does not replace the native root/sidebar, inject a DOM subtree, build another application or expose a host/operator/store handle. Slot/event/subscription/model lifetime belongs to the plugin fiber.

Root owns package metadata: `exports["./client"]="./lib/client.js"`, `dsh.client.platform="web"`, and client inject package names `@deepseek-ai/dsh-client-connection`, `@deepseek-ai/dsh-client-ui-renderer`, `@deepseek-ai/dsh-client-ui-layout`, `@deepseek-ai/dsh-client-ui-sidebar`. The module ID equals package name `bubbles`. The exact tracked bundle and metadata are to be independently reviewed together.

## Implemented behavior and bounds

The owner-facing panel uses only admitted logical `/bubbles-rpc`, endpoints `v1/list`, `status`, `detail`, `intake`, `control`. The host owner bridge supplies identity; client fields do not authenticate. Task list and selected details share the authoritative version and authorization epoch. Immutable encrypted goal/context/branch/result/proof prose is fetched through the owner's task-scoped `detail` endpoint using snapshot CAS, rather than treating hashes as explanation. List is bounded at1000 tasks, status collections at128 entries, visible authorized records at32, record content at65536 characters and intake at65536 UTF8 bytes.

Pause/resume/cancel capture exact task/version/epoch and one command reference. Duplicate clicks cannot admit a second mutation. A successful request requires a fresh readback; cancellation is shown as requested until the actual server state proves otherwise. Errors display fixed friendly labels/stable codes, never RPC exception prose. Missing/failed responses become stale and disable controls. Connection loss increments an epoch, aborts requests and rejects late results; selection revisions and unload similarly prevent stale/cross-task paint. Mutations are never automatically retried.

Action metadata exposes immutable scope/model/environment/resource bindings for inspection. Grant is deliberately disabled until a future host endpoint can provide concrete immutable target/data meaning and validate it against the proposed action digest plus fresh CAS; current hashes alone cannot support informed owner approval. Clarification editing, artifact navigation/delivery, reviewer/repair presentation, handoff interaction and actual native model execution remain integration work, not passed AC.

## Author checks

`node scripts/build-client.mjs` and syntax checks for source, emitter and generated bundle passed. `node --test test/client.test.mjs test/client-build.test.mjs`:12/12 passed. Tests cover lazy native module registration, exact source/bundle reproducibility, list/detail CAS coherence, one cancellation request plus authoritative pending readback, stale native rejection without retry/prose leak, aborting late mutation on disconnect, cross-task selection/unload isolation, disabled terminal/recovery approval paths, escaped Chinese/synthetic markup and accessible semantic element labels.

The lifecycle test uses the actual pinned public SlotCore and Cordis Context, with a mock renderer binding that assigns registrations to the plugin context. It verifies additive registration and removal while the root declaration survives. React element/hook doubles verify module semantics only: they establish neither real React rendering nor browser visibility, color contrast, keyboard focus or native layout sizing.

An additional module integration test uses actual public HostConnectionService HTTP RPC framing and Cordis with a private synthetic BrowserAuth double, registered route callbacks without a listener/browser, and the root native RuntimePlugin/SQLite encrypted store. The client model creates a synthetic Chinese goal, fetches its scoped immutable detail, pauses/resumes/cancels with current CAS, and agrees with the list version. Session count remains0; route registration disappears on unload. This is actual native protocol/module evidence without Web/browser rendering or model activity.

The independent auditor reproduced UI-CR01: connection loss during asynchronous command digest could submit under the new epoch. Control and intake now capture the originating epoch before the await and revalidate it, active lifetime and current admission/view before sending. Direct deferred-digest regressions prove both paths send0writes, stay offline/stale, and exact64reference checks reject trailing newline. The reviewed bundle is regenerated from the corrected source; build --check passed.

Independent ISTQB UI-T01 reproduced a throwing intake uuid callback outside the guard, which escaped raw prose and left busy set. UUID/task ID construction is now inside try/finally. The direct synthetic canary regression returns a stable error, clears busy, performs0RPC writes and allows a later explicit intake. No mutation auto-retry was added.

Independent code/ISTQB review and the exact root-committed snapshot remain required. Full functional/visual regression is held until the consolidated post-Stage3 acceptance gate.
