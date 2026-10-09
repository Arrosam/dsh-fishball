# Frontend validation — 2026-10-09

Current result: **HOST_READY; BROWSER_EXECUTION_PENDING**. This is the implementation lane's readiness and handoff record. It contains no rendered frontend PASS, screenshot or completed visual assessment. The parent has resumed browser task `01a1192f-8e15-7798-b971-2859e338e0e3`, which confirmed supported IAB access. Its initial navigation encountered the stopped host; the corrected ready handoff below supersedes that runtime observation.

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

All cases below are **Not Run in this lane**. Browser/version/viewports actually exercised, screenshots, observed behavior and localized fixes must be appended from the IAB lane. Proposed viewports are desktop1440×900 and narrow390×844, subject to the browser's advertised viewport capability; they are not measured results.

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

The IAB task can resume at the ready endpoint using the updated private handoff. Its current-source UI findings and sanitized evidence are still pending. If it identifies a localized defect, root owns the single implementation lane, targeted validation and factual retest record. No product change has been established here, so no package rebuild or guarded Library replacement is warranted. Real inference, native continuation, protected final CODE, full MVP acceptance and publication remain outside this readiness milestone.
