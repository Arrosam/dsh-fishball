# PLUGINS-STUCK · Host Plugins / R2-09

**Attribution.** Plain DSH reproduces the exact `Reading plugins…` symptom without Fishball. In Chrome over HTTP/1.1, simultaneous long-lived responses can occupy the origin's connection pool: the native manager is waiting for its **first** inventory POST, but the host hasn't received it. It is not waiting for npm in this reproduction. **Released Fishball makes this happen at three host tabs instead of six**: its sidebar/overlay adds a second persistent stream even in background tabs. Closing only one Fishball stream recovered Plugins on both SDKs with every tab still open. We changed that stream, not DSH. The original round had no network capture, so this is a sufficient cause, not a retrospective identification of its pending request.

## Historical evidence, not a new result

At `c88aca2c` on `dev/v3-e2e-r2`, [the round-two report, lines 59–63](https://github.com/Arrosam/dsh-fishball/blob/c88aca2c276440ace902aeed2b53f3aa500eddf8/.runtime/reports/e2e-r2/report.md#L59-L63) describes an authenticated rc.1 host with a working Fishball tab. Open a separate host tab → Plugins; later open Plugins from the worker tab. Both showed the loader with Add and Refresh disabled, no list, error or login prompt. The first was still stuck minutes later; reload timed out and subsequent browser-tool reads were refused while an earlier Chrome read was pending. The already-open child still rendered core settings. **R2-09 was not run**, not a failed rename save (E2-09/E2-14, UI tree; lines 21, 59–63). R2-14/15/18/19 concern a *later*, different surface: Fishball's hosted frame showed `检查中` after General → Language → 中文 and did not recover on switching back. Neither that incident nor the child's install phase is established as the trigger of the earlier list failure. No historical timing breakdown, request trace, tab count at failure or included screenshots.

## What the native page is waiting for

Paths here are relative to each installed SDK's `node_modules/@deepseek-ai/`; line numbers are rc.1 unless noted.

* `dsh-client-ui-plugin-manager/lib/client.js:3630–3666` sets loading, awaits `pluginInventory.list()` (**3636**), then if `managementAvailable === true` awaits `Promise.all([listBundles(), listPlugins()])` (**3650**); ready only after both succeed. The respective rc.5 awaits are **1374, 1388**. A returned `ok:false` goes to error; no manager deadline governs these waits. `finally` only clears `inFlight`; it isn't a loading-state fallback. The separate Settings inventory (`dsh-client-ui-settings-plugin-inventory/lib/client.js:293–307`) is not the Add/Refresh page. Manual Refresh/version checks are not part of first open.
* `dsh-client-connection/lib/client.browser.js:1209–1231` sends unary HTTP POSTs, not WebSocket list frames. The native per-tab HMR channel opens `EventSource('plugins/events')` (`dsh-client-hmr/lib/client.js:235,288–305`); its host keeps an HTTP response open (`dsh-client-hmr/lib/index.js:124–143`). This is separate from the gateway's WebSocket mux for Remote streams.
* If the host **does** receive the POST: `dsh-host-plugin-inventory/lib/index.js:121–156` snapshots loader entries/metadata and awaits failed-fiber diagnostics and preset composition inventory. Preset readiness, tree/fiber audit, and in some cases loader settling are further await points (`dsh-agent-preset-registry/lib/index.js:154–173,549–556,807–822`). `dsh-plugin-manager/lib/index.js:2098–2116` reads profile patches and repeats the inventory walk for `listPlugins`; `:2123–2146,2194–2250` builds bundle rows from local installation/profile manifests, selections, bundle metadata/patches and offline catalog. No registry round trip, settings-pane render, or host package mutation lock in the cold list. A wedged preset could cause a *different* wait; none was seen here.

## Packed host API: actual two-SDK experiment

Used both installed DSH executables with private OS/DSH homes, canonical temp/cache directories and ephemeral loopback listeners. Verified the eight `1.0.0-alpha.1` release tarballs against `SHA256SUMS`; installed the three **host** bundles from tarballs using the offline release procedure. `packages/` and `scripts/` have identical Git trees at release source `e1324391` and investigation base `f2525fea`. Do not install `fishball-core` on the parent: allow `dsh-instance` to install/start `fishball-ui` and `fishball-core` in the private child. Launch with `dsh web --no-open --port 0`; use its own ephemeral login in memory. The following are measurements, not time budgets or throughput benchmarks.

For one page-equivalent read, POST `pluginInventory/list`, then POST `pluginManager/listBundles` and `pluginManager/listPlugins` concurrently under `/api/`. Validate correlation ID and `result.ok` on all three, management available, nonempty plugin rows and all three Fishball host bundles enabled. No credentials or response payloads are included. A test-only 20 s request deadline bounds the probe. Four concurrent readers each ran the full sequence after separate login exchanges, outside Chrome's socket pool. On another live start, use the UI's durable write (`settings/describe` → revision, `settings/mutate` → set `locale.preference` to `zh`, read back, then list; repeat for `en`); this checks the host preference/API, not the frame admission flow.

| Packed condition · whole list, ms | 0.2.1-rc.5 | 0.2.2-rc.1 |
|---|---:|---:|
| First authenticated list after boot, child `starting` before **and after** | 362 | 769 |
| Second read during first child start | 263 | 560 |
| Four simultaneous readers (min–max) | 920–1,006 | 2,058–2,064 |
| Child `ready`, both child packages present | 327 | 607 |
| After verified live `zh` / `en` | 484 / 352 | 1,120 / 660 |
| Completed / attempted; bundles / plugin rows | **9/9; 23 / 197** | **9/9; 27 / 202** |

Child ready was observed at 9.86 s / 8.31 s from launch respectively. Parent manifest and pnpm lockfile content hashes matched before and after. This confirms successful real child installation and overlap with `starting`; it does not timestamp the package-manager lock during each individual read.

## Plain DSH control: reproduce and recover without touching the host

In a separate clean default web profile with **no** Fishball, use one private Chrome 158 profile and one host origin. Open an ordinary DSH tab, click native Plugins and confirm it loads. Open five more ordinary tabs in the same profile, waiting for the native HMR stream on each. On a tab that has never opened Plugins, click Plugins. Observe the native status, count allowlisted requests arriving at the host, and from a separate authenticated Node client issue the three list calls. Close **one other tab**; watch the original tab without reloading. No injected stall, synthetic SSE, browser request interception or host mutation.

| Control observation | rc.5 | rc.1 |
|---|---:|---:|
| One-tab list ready | 425 ms | 605 ms |
| Five tabs, all five HMR streams stay open; first uncached Plugins → ready | 1,044 ms | 1,429 ms |
| Active HMR streams at stall / HTTP version | 6 / 1.1 | 6 / 1.1 |
| Spinner duration sampled before intervention, zero list POSTs received from waiting browser | ≥5,218 ms | ≥5,243 ms |
| Independent Node reads during stall (all three OK) | 314–316 ms; 20 bundles, 194 plugins | 576–581 ms; 24 bundles, 199 plugins |
| Close one tab → its stream closed / queued inventory arrived / original tab ready | 2 / 44 / **475 ms** | 2 / 39 / **683 ms** |

The second page completed with both lists following inventory; no restart, locale reset, reinstall or repeated Refresh. A deliberately bounded observation is not a measured infinite hang.

## How many host connections, and which one is ours?

| Host page, after boot | DSH persistent HTTP/1.1 responses | Fishball persistent HTTP/1.1 responses | First persistent list queue observed |
|---|---:|---:|---|
| Plain DSH | 1 HMR SSE per tab (`/plugins/events`) | 0 | 6 host tabs |
| With release, real Fishball sidebar/overlay mounted | Same 1 per tab | **+1 per tab**, visible or hidden: `/api/dsh-connector/ui/events` | **3 host tabs** |
| With fix | Same 1 per tab | **+1 per visible subscribed document, 0 per hidden document** | **5 tabs** with one visible; 3 and 4 now load |

These are persistent waits after the tab's streams are established, not the first millisecond of transient scheduling during app bootstrap. Multiple mounted Fishball components share a store per route *within* a document (`packages/dsh-connector-ui/src/client/client.shell.js`, `eventStore` / `uiStores`, lines 454–500,513–520); multiple documents did not share one. The parent part of the embed adds **zero** further long-lived host HTTP streams: a finite status GET (visible, at most one in flight) and a finite admission POST when `{view,lang,ready,generation}` changes. The iframe loads the child's own origin/port, not an extra stream in the host pool. Instance summary/connector settings polls are finite GETs, not reserved connections; they can nevertheless queue behind saturation. Do not count upgraded WebSocket traffic toward the measured six persistent HTTP/1.1 responses.

**Packed isolating experiment, Chrome 158.** One tab → open native Plugins; repeat with two. Now open three on the same host, let both streams establish on each; two documents hidden, third visible. Open native Plugins for the first time on the third. With all three tabs still open, close *only* the Fishball connector EventSource in a hidden document (test intervention, not an operator instruction). Leave all three native HMR streams alone. Both SDKs recovered, directly isolating our contribution:

| Release | One tab ready | Two tabs ready | Three tabs, zero package cards | Release one Fishball stream → ready |
|---|---:|---:|---:|---:|
| rc.5 | 693 ms | 482 ms | ≥3,011 ms | **416 ms**, 7 package cards |
| rc.1 | 1,351 ms | 825 ms | ≥3,039 ms | **846 ms**, 8 package cards |

Package cards are rendered UI groups, not raw bundle/plugin RPC row counts. This does not implicate an individual Fishball settings schema: no card can render before native inventory completes.

**Related CHECKING-STALL P1.** The `dev/v3-checking-stall` investigation independently held the host admission POST on rc.1: the Fishball pane showed “checking”, disabled Refresh and no iframe despite healthy status GETs; releasing that POST recovered the pane. The release's `packages/dsh-connector-ui/src/client/client.shell.js:765–776,813–831` waits for admission before it can render the frame or enable Refresh. A queued admission POST and a queued inventory POST can therefore explain both R2 symptoms from one exhausted origin pool. That is a likely common mechanism, **not** proof both historical requests were queued: holding a POST tests the downstream UI response, not why the original POST was pending.

## Mitigation and post-fix browser check

Close background host tabs first; let the pending read finish **without** refreshing, reinstalling packages, or changing language. For automation, reuse one host tab and log whether inventory reached the host before investigating locks/presets. Report upstream that a healthy host cannot answer a browser request it never receives: consider sharing or suspending the HMR subscription across documents, multiplexing it on an existing transport, or giving the page a bounded wait and useful recovery message. A timeout alone cannot free the occupied pool.

Our fix takes the smaller option: suspend only the connector snapshot stream when a document is hidden, cancel pending retries, open once on visibility return and use the stream's immediate full server snapshot (`packages/dsh-connector/src/ui/routes.js:120,144–146`). Stopping also invalidates cached notices and ownership so an old Dismiss or Take back action cannot be used while waiting for the replacement's first frame. Late callbacks from an old stream are ignored. Still one stream per route shared by that page's visible subscribers. A cross-tab worker/leader could share one across *visible windows* as well but would require tab coordination, auth isolation and failover; it would not remove DSH's own per-tab streams.

Repeated the private packed-profile run with **only the connector shell chunk replaced**. Chrome confirmed document visibility `[hidden, hidden, visible]`, three established native streams and one Fishball stream. Focus transfers 3 → 1 → 3 moved the sole Fishball stream without dropping DSH's streams. No request interference or HTTP/2 configuration in the post-fix run.

| Patched browser measurement, one foreground tab | rc.5 | rc.1 |
|---|---:|---:|
| Three tabs: first foreground Plugins → cards; inventory/bundles/plugins all 200 | 385 ms; 7 | 920 ms; 8 |
| Four tabs: first foreground read → cards | 683 ms; 7 | 734 ms; 8 |
| Five tabs: five HMR + one connector; inventory pending while sampled | ≥3 s | ≥3 s |
| Close one hidden tab → five-tab wait clears | 524 ms | 1,098 ms |

Switching **General → English → 中文** on each live host changed the document language to `zh-CN`, inherited by new tabs. The three- and four-tab runs still loaded; at five, the visible skeleton had accessible name `正在读取插件…` (English: `Reading plugins…`), zero cards, and pending inventory. Closing one hidden tab recovered in 418 ms / 943 ms. The string is the skeleton's accessible label, not necessarily visible body text.

One single-tab rc.1 run also took >3 s but **had already received inventory** and completed without intervention. Elapsed time alone does not diagnose exhaustion. This mitigation does not fix DSH or remove all possible holds; multiple simultaneously visible windows can still own multiple connector streams.

## Fishball interaction audit

* The three host bundle patches add their own rows, not a native listing hook. Connector and instance settings renderers target just their own rows (`packages/dsh-connector/client.js:774–787`, `packages/dsh-instance/client.models.js:486–508`). The connector schema declares token-entry fields, approval settings and numeric limits; the instance has a volatile enable switch (`packages/dsh-connector/src/settings/schema.js:15–30`, `packages/dsh-instance/host.js:90–92`). None is called by DSH's manifest/list functions. Unlike connector settings' detail-only runtime GET, the instance can poll status if rendered as a summary. It skips hidden/in-flight polls and aborts on unmount; the handler reads cached lifecycle/notice and does not contact the child (`packages/dsh-instance/client.models.js:444–448`, `client.status.js:132–146`, `src/host/routes.js:66–70` within that package).
* Connector activation awaits opening its services (`packages/dsh-connector/index.js:37–53`), but instance starts its child **after** host app-ready with `void start()` (`packages/dsh-instance/host.js:437–441`). Placement reuses DSH's PM implementation, not the parent profile: `packages/dsh-instance/src/native-runtime/placement.js:193–231` supplies child `dir` **and** `cwd`, disables autoactivation, tries exact versions then vendored tarballs. The PM write lock is on `join(dir, 'package.json')` (`dsh-plugin-manager/lib/types/operations.js:619`). First pairing can mutate host connector settings; remount/disposal can await in-flight hosted operations (`packages/dsh-instance/host.js:353–386`). Neither is invoked by the list. Core's bundle reordering / Recommended tab operate in the child in this deployment, not in the host profile.
* Concurrent reads took longer in this sample. Child startup and simultaneous list reads did not prevent any of the 54 packed list RPCs across the two SDKs from completing. A working child is consistent with a stalled host tab: a separate child origin has a separate connection pool.

## Regression and verification

An independent author wrote black-box cases first. The released behavior failed hidden startup, hide and a retry due while hidden on each SDK (6 failures, 4 controls passed). Independent review then identified that dismissing an old notice on resume could dismiss its replacement. A test holding the replacement stream's first frame reproduced both obsolete Dismiss and Take back actions (2/2 failed); after cache invalidation **all 8 cases per SDK pass**. They also cover sharing, missing visibility API, repeated focus changes, stale callbacks, visible retries and last unsubscribe. No existing assertion was changed. The reviewer approved the final diff. `npm run test:map` reports zero missing, duplicate, unowned or misselected paths.

Final `node test/run-affected.mjs --suite=dsh-connector-ui,contract --sdk=both`: **14 suites, 27 files, exit 0**. rc.5: **1,092 passed**, 104 skipped, 194 TODO; rc.1: **1,063 passed**, 104 skipped, 194 TODO. Neither SDK had failures or cancellations. The framework reports skipped/TODO as distinct from passes; counts include the new rows and are not added to the broader matrix.

Changing the suite map also selected the repository-wide unshelved lane (`npm run test:affected -- f2525fea --sdk=both`, 58 suites, 116 files). That run began before the review follow-up and exited 1. Raw totals (pass / fail / cancelled / skipped / TODO): **rc.5: 6,570 / 5 / 4 / 755 / 384; rc.1: 6,159 / 5 / 5 / 755 / 384**. Other non-green rows included a core duplicate-name case (`MULTI-NAME-DT-01`, rc.5) and a schedule size-bound timeout (`RFIX-F07-BVA-01`, rc.1); neither was separately compared to base. The rc.1 delayed-first-frame failure in it is the old red result, superseded by the final run above. Other failures were not in the changed store. In particular:

* On untouched `f2525fea`, `AUTH-UC-12 main 8` reproduced 3/3 times per SDK (second refresh not observed). `EVT-BVA-02` rows 1–4 timed out in the broad run; representative row 1 also hit its 60 s timeout on each clean SDK, while still filling the mailbox on rc.5, before its boundary assertion.
* Instance first-start import (`RFI-F01`), off/on teardown (`RFI-F07`) and pair-change (`ISUCC-ST-02`) failures also occurred on clean base, not always on the same SDK. The one-listener case (`ISUCC-ST-01`) failed intermittently on the branch; isolated reruns also passed, and its failure was **not** reproduced in four baseline observations. These host-side cases do not exercise the browser snapshot store. No unrelated tests, assertions, timings or implementation were changed.
