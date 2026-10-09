# Frontend validation — 2026-10-09

Current result: **UI_FIX_HOST_READY; IAB_RETEST_PENDING; REAL_DF_OLLAMA_POLICY_BLOCKED**. This ledger retains the actual IAB failure and focused correction without promoting untested cases. The resumed browser task `01a1192f-8e15-7798-b971-2859e338e0e3` reached authenticated native UI and reproduced a blank DF panel. Browser retest of the fixed candidate and task/worker journeys remain pending.

## Candidate and scope

| Item | Identity |
| --- | --- |
| Checkout at start | `da2423909de771834fe9e6c5b14bf5c3d636dc35`, branch `feat/S3-integrations` |
| Delivered archive source | `f538ff416ac5c60c202877973af98e02a3b42a53` |
| Tested executable source | `9f23122eed4ff63e0208944cd35d9c83e31b0865` |
| Package | `dsh-fishball` `0.1.0-preview.1` |
| Archive SHA256 | `7bea1f0332ac535e6c6f6f156b536ea200053d85be93f726cab8db47ae4d588b` |
| Client SHA256 | `2df9592a085c65f01f104e552f52128d8a4657bb57ef4ba3592e2fdb89748d41` |
| Host | Pinned original DSH Web `0.2.1-alpha.1`, Node `22.22.2` |
| Library | Same item `libfile_8ea2bcadbba88191bfbafb7bb5023913`, last confirmed version `1`; no replacement in this phase |

Checkout comparison against the delivered source found no change in `src`, `lib`, the native source manifest, or the three initial-preview scripts. The two reserved tracked drafts were preserved. This phase changes documentation only. No new review agent, broad test rerun, product modification, build, model call or publication occurred.

Parent-requested identity clarification: `git diff 9f23122..f538ff4` contains five documentation/README files only (`fe21e0`). A targeted opaque-byte comparison of all68 packaged executable members (`src`, `lib`, `scripts`, package metadata and native source manifest) found zero differences between the active extraction, the delivered archive's member hashes and committed `f538ff4` source (`732a62`). Thus `9f23122` is the earlier executable commit, and `f538ff4` is its later documentation-only packaging commit; executable content is identical, including the corrected result reader. Runtime BUILD-METADATA truthfully remains `9f23122`; it is not relabeled. No runtime replacement, data migration or restart is needed for this clarification. Actual frontend results remain pending.

The authorized practical UI scope covers native loading/navigation, task intake/status/control/results, settings, validation and empty/loading/error states, repeated interactions, cancellation, refresh/reopen persistence, and desktop/narrow layout. Synthetic provider checks remain separate from real inference. BUB014-01–05, BUB003 and BUB013 remain subject to their original acceptance criteria; this bounded run does not close full ticket/MVP acceptance.

## Actual runtime observations and recovery

At `05:57:52 UTC`, the retained ready receipt still described PID93984, but both its CLI process and launcher PID93977 were absent. Its owner marker bound this exact extraction, pinned host, UID and profile, and its client bytes matched the recorded digest. At `05:58:16 UTC`, one unauthenticated loopback GET returned `ConnectionRefusedError`/errno61. Evidence: tool chunks `a4d3ff`, `903bc5`. These observations explain the IAB lane's connection-refused result; they are not a UI defect.

After the parent explicitly requested host restoration, root verified exact ownership, matching launch records, both original processes absent, a refused endpoint and unchanged client bytes. It preserved the stale owned lock by renaming it inside the private directory to `launcher.lock.retained-2026-10-09-ac7b4baa-3f2b-43fc-9bf1-afef6145bf93`. The profile database, keys, transcript and task records were not copied, deleted or edited. This was explicit owner recovery, not automatic lock clearing or work replay. Evidence: `f86cce`.

Root then invoked the unchanged packaged `scripts/initial-preview.mjs` with the exact `.runtime/dsh-web` host through normal execution approval. The foreground launcher reported ready with setup ready. Evidence: `2893b6`, `d96310`. A restricted signal-zero process check returned `PermissionError`; no signal retry or alternate process controller was used. The launcher session and authenticated HTTP check supply current readiness evidence instead.

A bare HTTP client's authentication redirect initially failed because it did not retain cookies. With standard in-memory cookie handling, the same private local handoff returned native HTML200 at `06:02:23 UTC`, with the DeepSeek Harness marker and no authentication gate. No HTML body, cookie or private URL was emitted. This is HTTP readiness evidence, not browser rendering or a UI PASS. Evidence: `562884` (initial failed client), `28cbda` (corrected HTTP check).

| Current handoff | Value |
| --- | --- |
| Clean endpoint | `http://127.0.0.1:3091/` |
| Native profile | `df-initial-preview` |
| Original CLI PID / launcher PID | `8918` / `8911` |
| Owned foreground PTY | `46436`; root retains lifecycle ownership |
| Storage receipt | `ready` |
| Provider / model | `df-testing-local` / `df-testing-worker-v1` |
| Preset | `df-initial-preview-read-only` |
| Ready/access/current/lock launch identity | Matched |
| Client digest versus ready receipt | Matched |
| RPC / worker / real-model requests in readiness check | `0` / `0` / `0` |

Exact active extraction: `.runtime/result-reopen-package-9f23122/dsh-fishball-0.1.0-preview.1-initial-preview/`. Under that extraction, `.runtime/initial-preview/private/current-launch.json` points to the **new** local authenticated access handoff. The browser lane must read it locally through its supported flow; never post the authenticated URL, tokens or cookies. Earlier access files are historical. Authentication-required HTML at the clean endpoint alone is not the application.

Use a new owned IAB tab; the browser route does not establish a separately isolated browser cookie profile. Isolation here refers to the native host/profile/state and synthetic data. Preserve retained smoke task `d441229f…` and its stopped worker/artifact; no execution replay. Never use old3080 or cancellation-requested task `4da34a6d`. Root issues no worker/model request in this handoff. Additional UI execution must use a fresh synthetic task and the existing exact policy/action consent flow.

## Frontend execution ledger

This root executor exposes no callable CUA/IAB/Chrome controller. Supported browser instructions were read from the existing Hydrogen reference `browser-route.md` without modifying Hydrogen. No external browser controller, Browser LUA or source-based acceptance substitute was used. The parent separately confirmed IAB availability in the resumed browser task; that task owns actual browser execution and will supply findings.

The table below retains root's original planned cases, which root did not execute through a browser. The actual IAB findings below supersede their initial disposition where evidence is available. IAB exercised desktop1440×900 and narrow390×844; DF task/worker controls were inaccessible because of the render crash. Root's HTTP/source checks remain distinct.

| Case | Steps / synthetic data | Expected behavior | Acceptance / technique | Actual / status |
| --- | --- | --- | --- | --- |
| UI01 | Open current private handoff in a new owned IAB tab; navigate to DF panel. | Authenticated native UI; expected host/profile/provider/preset; connected worker controls. | BUB014-01/05; EP | Not Run; host HTTP readiness only. |
| UI02 | Open/close Settings; return to DF; refresh setup and tasks twice. | Settings usable; current timestamps; same task identities/count; no duplicate mutation. | BUB014-01/03/04; Error Guessing | Not Run. |
| UI03 | Enter empty/whitespace draft; then multiline Chinese synthetic draft `UI QA 2026-10-09：核对本地任务。\n第二行：仅使用合成模型。`; create once. | Empty submission disabled; multiline editable; one owned task with consistent list/detail version. | BUB014-01/03/04; EP, State Transition | Not Run. |
| UI04 | Rapidly repeat the one task-create interaction and refresh. | Busy controls prevent duplicate work; persisted authoritative count can be checked; failures remain explicit. | BUB014-03; Error Guessing | Not Run. |
| UI05 | On a fresh queued task, pause, inspect state, continue, then request cancellation; repeat cancellation interaction. | Versioned transitions; cancellation requested with no implied instant stop; repeat disabled/no extra dispatch. | BUB014-01/02/03; State Transition | Not Run. |
| UI06 | Create a separate fresh worker task; inspect status/catalogue; preview and explicitly confirm exact synthetic policy; prepare context; plan/preview/grant exact action. | No worker created before required decisions; bounded selected synthetic model, empty tools and read-only preset; invalid expiry disabled. | BUB014-02/05; Decision Table, EP | Not Run. |
| UI07 | Explicitly create idle worker, execute once, query, capture, load captured result and finish through UI. | Current worker/execution/artifact state and factual result; not-reviewed/not-requested labels; explicit finish and bounded admission. | BUB013; BUB014-01/05; State Transition | Not Run; October8 API smoke remains separate historical evidence. |
| UI08 | Refresh and reopen owned tab; inspect saved task, records/artifact and available result-view path without executing again. | Persisted task/version/artifact/content remains viewable; no execution or capture replay. | BUB003; BUB013; BUB014-01/03; State Transition | Not Run; October8 basic API result reopen remains separate. |
| UI09 | Use keyboard navigation, visible focus and multiline editing; inspect long Chinese text, result digests and approval scope. | Critical text/actions readable and reachable; no credentials; appropriate focus/keyboard behavior. | BUB014-04/05; EP, Error Guessing | Not Run. |
| UI10 | Inspect desktop and narrow layout at advertised viewport sizes; capture sanitized screenshots and restore viewport. | Controls and status remain usable; no obscured critical text/actions. | BUB014-04; Error Guessing | Not Run; no screenshots/viewports observed. |
| UI11 | Observe loading and existing validation/error states through supported UI flow; coordinate any intentional host stop with root. | Pending, offline, stale and failed/unconfirmed states are explicit; unsafe controls unavailable; no automatic replay. | BUB014-01/02/03/04; Decision Table, State Transition | Not Run; host stop not requested for this handoff. |
| UI12 | Inspect empty list only in an approved genuinely fresh synthetic fixture if needed; retain current nonempty profile. | Empty state is intelligible without deleting retained evidence. | BUB014-04; EP | Not Run; current fixture is nonempty. |

BVA for undocumented business limits is deferred; this handoff does not invent new product limits or acceptance criteria. The local webtesting skill's tracing/status techniques are adapted to the repository and existing execution/fix authorization; no Jira, OAuth or additional sign-off workflow is introduced.

## Remaining work

The IAB task needs the fixed candidate and fresh private handoff for retest. Root owns the single implementation lane, targeted checks and factual runtime/evidence record. The localized render fix changes source/client hashes and requires a new package identity; delivered Library version1 remains historical until an actual guarded replacement. Native continuation, protected final CODE, full MVP acceptance and publication remain open.

## Renewed Ollama test request and concrete integration blocker

The parent relayed renewed explicit owner authorization on October9 for testing DF with the previously selected existing Ollama model. It then assigned the real task submission to the browser lane and placed root inference on HOLD pending coordination to prevent duplicate calls. The IAB lane subsequently reported `net::ERR_BLOCKED_BY_CLIENT` at the clean3091 endpoint; its bounded browser-policy diagnosis and any non-browser fallback remain parent-owned. This is distinct from the earlier stopped-host refusal and root's missing browser tools. No browser PASS is inferred.

Root verified the existing endpoint and exact model through normal execution approval at `06:09:11 UTC` (`cda96d`):

| Metadata check | Actual result |
| --- | --- |
| Endpoint | `http://127.0.0.1:11434` |
| `GET /api/version` | HTTP200, Ollama `0.40.0` |
| `POST /api/show`, exact model | HTTP200, `deepseek-v4.1-flash:cloud` |
| Advertised capabilities | completion, thinking, tools, vision |
| Inference requests / credential changes | `0` / `0` |

The exact intended inference target is the existing `/api/chat` route for `deepseek-v4.1-flash:cloud`, with harmless synthetic text only. Endpoint/model availability is proven; **DF real-worker readiness is not**. The active service and delivered product remain the byte-identical synthetic candidate. No models were pulled, credentials created, accounts altered or persistent access configured.

One bounded implementation lane, `/root/ollama_ui_bridge_author` (gpt-6.1-sol/high), checked feasibility using current public source boundaries and earlier Ollama work as reference. It stopped before editing because the normal durable worker path is explicitly synthetic-only. Root independently checked these exact public boundaries; neither lane inspected or changed protected implementation bodies:

| Current public boundary | Concrete incompatibility |
| --- | --- |
| `src/installed-worker-facts.mjs:214`; `src/client-entry.cjs:334/337/396` | Current source binding/status/execution accepts synthetic pricing and byte accounting; changing model configuration alone cannot admit or render honest token accounting. |
| `src/normal-native-selection.mjs:35` (`159853`) | Normal native selection requires `source_zero`, `df-testing-utf8-byte-units/v1` and deterministic effort. |
| `src/native-history-collector.mjs:123/127` (`13036e`) | Persisted usage requires synthetic accounting and equates output token count to UTF-8 output byte count. Ollama API tokens are a different unit. |
| `src/normal-contracts.mjs:154/229` (`5455ae`) | Public `NativeCapture` contract mandates `df-testing-utf8-byte-units/v1`. |
| `src/normal-native-operations.mjs:75` (`449360`) | Current public protected-core capture call supplies `usageUnits` without an accounting discriminator. Public-only model/UI changes cannot establish correct durable accounting. |

No adapter patch, source modification or inference was made. Relabeling real API tokens as synthetic byte units, reporting cloud pricing as free, or swapping an older fixture into the running delivered candidate would not satisfy this test. Earlier uncertain/denied requests and fixture positions remain untouched. No new action-time inference approval was requested, because parent coordination is still pending and this candidate has no established compatible real DF capture path.

The parent subsequently directed a focused accounting fix with truthful minimal/unknown usage rather than a billing expansion. Normal approval rejected root's targeted `rg` of RuntimeStore accounting literals/capture entry points before process creation: “The read-only grep targets the protected RuntimeStore implementation, which the trusted project instructions explicitly require to remain opaque and not be inspected; use public contracts instead.” No workaround or indirect inspection followed.

The author checked a public-only byte-volume alternative. Existing persisted history requires its token fields to equal byte counts, so substituting byte volume would misrepresent real provider usage. A separate byte observation cannot establish the closed durable capture contract. Four unwired adapter drafts were authored then removed; none were exported, installed, committed or executed. Accounting source remains unchanged; inference0.

The exact blocked scope is inspection and minimal change of the native usage-accounting discriminator in `captureNormalNativeResult` and corresponding durable capture/finish validation, plus the public callers/validators listed above. The separate receipt/signature/envelope/revision999 investigation remains excluded. Truthful unknown usage is acceptable, but needs a compatible authoritative representation. Further protected work needs explicit authorization resolving the opaque-source restriction and normal approval. Hold the real DF task while the independent UI repair/retest continues.

## Actual IAB finding and focused render repair

Primary browser evidence is `/Users/samuel/Documents/Codex/2026-10-08/task-4/df-frontend-qa-20261009/report.md`; `screenshots/reopened-panel-desktop.jpg`, console receipts and narrow-layout measurements are alongside it. Root read the report (`65d780`) without altering that workspace. It records supported Codex IAB in a new owned tab, normal private authenticated access, native DSH Web0.2.1-alpha.1, desktop1440×900 and narrow390×844. The tab was closed and viewport reset. No task/inference was submitted.

| Actual case on executable9f23122 | Outcome |
| --- | --- |
| Fresh authenticated native home/sidebar | PASS |
| Select DF; reload and select again | FAIL, reproduced blank main panel |
| Native Settings open/close/reopen | PASS, with unavailable service visibly surfaced |
| Narrow native Settings containment | PASS, measured dialog/document fit390px viewport |
| Narrow native Settings readability | Usability FAIL observation in native host, compressed content column |
| DF task/status/control/result/repeated actions | NOT_RUN, blocked by render failure |
| Real Ollama task/durable capture | NOT_RUN/HELD, no inference |

F1 is the blocking DF defect: `ReferenceError: button is not defined` in `ContinuationCard` and `OwnerFinishRecoveryCard`, served bundle lines136573/136596, source lines774/796 before repair. Each called a helper scoped inside other functions. Authenticated selection and reload/reselection reproduced the crash; it is not merely a source hypothesis.

The same sole Sol6.1/high author added a local renderer to each component using existing styling, `type=button`, original callbacks and busy/disabled gates. Code commit `9e505b7`, branch `feat/S3-integrations`. No worker/accounting/permission contract changed; synthetic behavior and protected core remain unchanged.

Root rebuilt the client (`d0861c`) and ran `node --test test/client-control-card-render.test.mjs test/client-build.test.mjs` with pinned Node22.22.2 (`196453`): **2 passed,0 failed**. The component case renders both cards before selection with real initial client models, verifies zero render-time RPCs, selected callbacks, distinct approval prerequisites and disabled busy controls. The bundle case checks reproducible lazy registration/materialization. Module checks do not replace IAB retest.

Only two source/client hashes were refreshed by opaque byte hashing (`876d35`); other62 product members and the host descriptor stayed unchanged. Fixed client SHA256 `00f1f5b30885509e093eb149b5a40a7687ff513d65435b4732a6d78eaf4360b2`; source factory SHA256 `133eb7ad9386cd0bafb9faea822037ac28ac5b00cfd7e1b152554fac5d5a19be`. Manifest compact formatting was preserved. No additional review lane was opened, per parent instruction.

F2 is native Settings `permissionPresets/catalog` service-unavailable; F3 is the native narrow Settings layout observation. This repair does not patch upstream DSH or broaden access. Post-fix rendering and DF functional/visual acceptance remain pending.

## Fixed preview ready for IAB retest

Root packaged and verified the committed fixed source (`7b271b`, `0c51eb`), stopped its own original launcher through Ctrl+C with exit130/state retained (`1ae41e`), then upgraded only the allowlisted public package files in place (`3e69f4`). Old changed public bytes were retained privately; archived historical candidates remain unchanged. The package root stays at the same physical path so its strict owner marker and native profile remain valid. No owner rebinding, profile/database/key/transcript copying, private-state selection or protected-source change occurred. The directory's `9f23122` name is historical; current BUILD-METADATA identifies the new source below.

The unchanged supported launcher restarted through normal execution approval (`fcb338`, `6b0417`). At06:35:57UTC, normal local authentication returned native HTML200 with no auth gate; ready/access/current/lock identity and actual client digest matched (`a3d42a`). This remains readiness evidence, not a rendered regression PASS.

| Fixed candidate / current handoff | Value |
| --- | --- |
| Package source | `2768365e7a51a10ef5b3f3856b2f737b3dffdd6b` |
| UI code commit | `9e505b7` |
| Local archive | `dist/initial-preview-2026-10-09/dsh-fishball-0.1.0-preview.1-ui-fix-2768365.tar.gz` |
| Archive SHA256 | `8e103e9de91083664008dc0253f848b0848990dc5e4910c81603fc448b83b74e` |
| Archive bytes / public files | `635563` / `121` |
| Version / host | `0.1.0-preview.1` / DSH Web0.2.1-alpha.1 |
| Client SHA256 | `00f1f5b30885509e093eb149b5a40a7687ff513d65435b4732a6d78eaf4360b2` |
| Clean endpoint / native profile | `http://127.0.0.1:3091/` / `df-initial-preview` |
| CLI / launcher / owned PTY | `10281` / `10274` / `20516` |
| Storage / provider / model | ready / `df-testing-local` / `df-testing-worker-v1` |
| Readiness RPC / inference requests | `0` / `0` |

The fresh private handoff is the same extraction-relative `.runtime/initial-preview/private/current-launch.json`, updated by the new launch. Keep its access data private. Root owns lifecycle; IAB owns actual retest. Retained smoke task/result and old cancellation-requested4da34a6d are not execution inputs. Real Ollama admission remains blocked; this candidate has the UI repair only. Library version1 has not been replaced while browser/accounting outcomes remain pending.
