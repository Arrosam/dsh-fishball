# Native client module implementation evidence

Owner authorized Stage3 client implementation on the pinned official DSH Web 0.2.1-alpha.1. This is module evidence and a source-inspected extension boundary; real Web loading, rendered interaction, keyboard, responsive layout, focus, connection reset and visual regression remain deferred acceptance oracles. No Web process, browser, model stream, external service or dependency installation was invoked by this unit.

## Public extension boundary

Installed sources are beneath `.runtime/dsh-web/node_modules/@deepseek-ai/`. The public client manifest declares `window.__ModuleLoader__.load({id,factory})`; the registered factory is lazy and resolves dependencies through the host module table. Our `dsh-fishball` module resolves only the host's `react`. It uses ordinary React `createElement`, hooks and native slot registration. The builtin Node emitter serializes our own self-contained factory, performs syntax validation, and writes a deterministic reviewed bundle; it copies no host source and invokes no bundler/download.

| Inspected public source | SHA256 |
| --- | --- |
| dsh-client-modules/lib/types/client/manifest.d.ts | d416fc7327b3cdca52c530b0b4f51aba65f5aa5d025582f31acc1711e8b06752 |
| dsh-client-ui-slots/lib/index.js | 57e1314e31a2015f30231e1e7596da658f1bb5cb64c103c4cf13381647412c99 |
| dsh-client-ui-renderer/lib/types/client/index.d.ts | e143cabd2ab72466e37b4d62fbf1ff9e5ee0054d6fd48a1dfe29327b696be4f1 |
| dsh-client-connection/lib/types/client/index.d.ts | 5bcacf56ca3c3fb26256a6ee3aff980a399dcf4901d594b034d960ae04bd2f8d |
| dsh-client-ui-layout/lib/types/client/index.d.ts | de04ea7bb5e1c0d44dc87c31eb6565786c4cc629f4eefd92064e1b3142817260 |
| dsh-client-ui-sidebar/lib/types/client/index.d.ts | 924baa712881de5a9c499cd49117718654ebb56cf8242768cda512382202fb49 |

The client requests `connection`, `slots`, `layout` and adds keyed `main/df` plus list `sidebar.panellist/df`, using the native sidebar label/panel mechanism. It does not replace the native root/sidebar, inject a DOM subtree, build another application or expose a host/operator/store handle. Slot/event/subscription/model lifetime belongs to the plugin fiber.

Root owns package metadata: `exports["./client"]="./lib/client.js"`, `dsh.client.platform="web"`, and client inject package names `@deepseek-ai/dsh-client-connection`, `@deepseek-ai/dsh-client-ui-renderer`, `@deepseek-ai/dsh-client-ui-layout`, `@deepseek-ai/dsh-client-ui-sidebar`. The module ID equals package name `dsh-fishball`. The exact tracked bundle and metadata are to be independently reviewed together.

## Implemented behavior and bounds

The owner-facing panel uses only admitted logical `/df-rpc`, endpoints `v1/list`, `status`, `detail`, `intake`, `control`, `preview`, `grant`. The host owner bridge supplies identity; client fields do not authenticate. Task list and selected details share the authoritative version and authorization epoch. Immutable encrypted goal/context/branch/result/proof prose is fetched through the owner's task-scoped `detail` endpoint using snapshot CAS, rather than treating hashes as explanation. List is bounded at1000 tasks, status collections at128 entries, visible authorized records at32, record content at65536 characters and intake at65536 UTF8 bytes.

Pause/resume/cancel capture exact task/version/epoch and one command reference. Duplicate clicks cannot admit a second mutation. A successful request requires a fresh readback; cancellation is shown as requested until the actual server state proves otherwise. Errors display fixed friendly labels/stable codes, never RPC exception prose. Missing/failed responses become stale and disable controls. Connection loss increments an epoch, aborts requests and rejects late results; selection revisions and unload similarly prevent stale/cross-task paint. Mutations are never automatically retried.

Action metadata exposes immutable scope/model/environment/resource bindings for inspection. Grant is disabled until the admitted owner obtains a fresh trusted concrete preview. The panel displays exact kind/role, target meaning, immutable scoped content and data references, provider/model/reasoning/preset, tools, project/environment and resource charges. Unknown cost is displayed as unknown. An empty datetime input requires an explicit owner approval expiry; preview validity is separate from grant duration. The client captures previewRef, action digest and task/auth CAS, rechecks them after asynchronous command construction, and submits one grant. Grant never automatically starts work. Missing/expired/mismatched previews and offline/stale states disable approval. Clarification editing, artifact navigation/delivery, reviewer/repair presentation and handoff interaction remain integration work, not passed AC.

## Author checks

`node scripts/build-client.mjs` and syntax checks for source, emitter and generated bundle passed. `node --test test/client.test.mjs test/client-build.test.mjs`:17/17 passed on the current unit. Tests cover lazy native module registration, exact source/bundle reproducibility, list/detail CAS coherence, one cancellation request plus authoritative pending readback, stale native rejection without retry/prose leak, aborting late mutation on disconnect, cross-task selection/unload isolation, disabled terminal/recovery approval paths, escaped Chinese/synthetic markup and accessible semantic element labels.

The lifecycle test uses the actual pinned public SlotCore and Cordis Context, with a mock renderer binding that assigns registrations to the plugin context. It verifies additive registration and removal while the root declaration survives. React element/hook doubles verify module semantics only: they establish neither real React rendering nor browser visibility, color contrast, keyboard focus or native layout sizing.

An additional module integration test uses actual public HostConnectionService HTTP RPC framing and Cordis with a private synthetic BrowserAuth double, registered route callbacks without a listener/browser, and the root native RuntimePlugin/SQLite encrypted store. The client model creates a synthetic Chinese goal, fetches its scoped immutable detail, pauses/resumes/cancels with current CAS, and agrees with the list version. Session count remains0; route registration disappears on unload. This is actual native protocol/module evidence without Web/browser rendering or model activity.

The independent auditor reproduced UI-CR01: connection loss during asynchronous command digest could submit under the new epoch. Control and intake now capture the originating epoch before the await and revalidate it, active lifetime and current admission/view before sending. Direct deferred-digest regressions prove both paths send0writes, stay offline/stale, and exact64reference checks reject trailing newline. The reviewed bundle is regenerated from the corrected source; build --check passed.

Independent ISTQB UI-T01 reproduced a throwing intake uuid callback outside the guard, which escaped raw prose and left busy set. UUID/task ID construction is now inside try/finally. The direct synthetic canary regression returns a stable error, clears busy, performs0RPC writes and allows a later explicit intake. No mutation auto-retry was added.

Independent code/ISTQB review and the exact root-committed snapshot remain required. Full functional/visual regression is held until the consolidated post-Stage3 acceptance gate.

## Concrete preview module checkpoint

The current author command `node --test test/client.test.mjs test/client-build.test.mjs` passed17/17, with no skipped tests. New tests cover exact displayed preview/body/environment/model/limits, explicit empty expiry, forged scope/digest/token/content, expiration, disconnect while preparing a preview or command digest, and redacted digest failure with busy cleared. A separate integration uses the genuine public HostConnectionService request/response framing, admitted synthetic OperatorPeer, ApprovalPreview, and actual encrypted RuntimeStore. A well-formed forged preview token passes no authority and the server refuses the grant. A fresh server-captured token with explicit expiry increments the authoritative authEpoch; no claim, worker, provider call or execution is started. This fixture uses trusted module composition and in-memory registered HTTP handlers with no server listener; it does not establish RuntimePlugin browser/profile integration.

The first new integration run used a wrong absence oracle: snapshot omits claimRef before claim rather than returning null. The test was corrected to require the field absent, preserving the zero-claim/zero-worker requirement, and reran green. Independent verdicts and the final root snapshot remain separate.

## Current owned unit snapshot

Final author command `node --test test/native-adapter.test.mjs test/worker.test.mjs test/client.test.mjs test/client-build.test.mjs` passed **48/48**, with zero failures or skips. `node scripts/build-client.mjs --check` passed. `node scripts/check.mjs` checked 57 ESM files. These results describe local module development; independent final review, root commit identity and consolidated functional/visual acceptance remain separate.

| Owned file | SHA256 |
| --- | --- |
| src/client-entry.cjs | a6324e48905da4843bf0a9ceaac0cd6182656039c3a93ad60e85115c6f137c9d |
| scripts/build-client.mjs | f5c98d5daabcfea01ef8829284fd589085e47dae95d9a72ec652283366a65702 |
| lib/client.js | def14844f565a465c396d3b3efd7530b39476220566717dd04f2b57462b9e7c6 |
| test/client.test.mjs | 1743d439ea7d3b260471b3dfc18737edcfeb05057dd043c7711ad9aea5312b1e |
| test/client-build.test.mjs | 98e1b61d1ddd9ee52631edbd6f65e34258a39ec89782a4a00c8af4f426445a40 |
