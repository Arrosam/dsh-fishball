# F-WIRE model dialog and status strip

Authority: fixed F-WIRE interface; user decision to prompt on every Fishball page opening when core.model is unset, keep host default until chosen; K3a ui seam. Browser chunks execute unread through fishball-ui's client.js using the existing browser-sandbox and DSH configForms page harness. Remote session.modelCatalog follows both SDKs' public catalog shape.

Page open (code review, F-WIRE): the Fishball page is open while `<html data-fishball-page>` is present (fishball-page's public root mark). The harness sets it when it mounts the open page, as the real page does; the dialog shows only while it is present, and a dismissal is forgotten when it goes away.

| Row | Technique | Expected outcome |
| --- | --- | --- |
| MODEL-EP-01 | EP | Unset core model, two catalog models, en/zh: dialog visible and catalog listed |
| MODEL-ST-01 | ST | Choose catalog entry → configForms mutation at fishball-core ['model'] with provider/model and optional reasoningEffort |
| MODEL-ST-02 | ST | Dismiss → no settings write; focus does not reopen; new page opens dialog again |
| MODEL-ST-04 | ST | Mark absent + model unset → no dialog, no mutation |
| MODEL-ST-05 | ST | Mark absent → set → dialog with catalog models |
| MODEL-ST-06 | ST | Dismiss → mark removed (no dialog) → mark set again → dialog again; no mutation |
| MODEL-EP-02 | EP | Set core model → no dialog and no mutation |
| MODEL-BVA-01 | BVA | Zero models → explanation and DSH Settings launcher button; no selection write |
| MODEL-SYS-01 | Integration/system | Real standalone with core switches ui-model-selection off |
| STRIP-SYS-01 | BVA/EP | First SSE frame arrives immediately, en/zh. Re-baselined (MULTI-3 B): the frame is targetsView's `{on, title, empty, notices, targets, words, brandStyle}` (brandStyle is the normalized logo theme: fishball/deepseek, default fishball); every target's state is one of the four, its lines kind/text, its control null or connect/cancel; on with no target → a non-empty `empty` |
| STRIP-DT-01 | DT | Withdrawn (MULTI-0 review S6): the K3a `/api/fishball/connect` routes are gone |
| STRIP-DT-02 | DT (todo until MULTI-1 lands) | Real DSH: POST `/api/fishball/targets/connect` with an unknown id → 404 `unknown-target`; the K3a Connect route → 404 |
| MODEL-ST-03 | ST/system | HMR native disable of core → picker restored, core-missing row enabled; fishball-ui's rows follow core off (DESIGN §20 live core on/off, 1.41 Q-G2 = A), so the strip route answers 404 and the per-target Connect route 404 or 503 `TARGETS_UNAVAILABLE` (re-baselined: the K3a route is withdrawn) |

Deferred E2E-CORE: real browser reload, focus/accessibility, Settings navigation. Scripted page recreation is executable now; no actual browser starts. HMR system row is executable, not todo, because the reusable standalone worker supports native live bundle changes.

Known coverage boundary: core routes are checked against the real core's no-target state, not a fake successful OAuth approval URL. Browser strip button dispatch and successful approval URL opening remain E2E-CORE. Catalog failures/loading are not assigned product behavior by the fixed interface. SSE reads the named fishballStatus service (UI_SEAM.status in fishball-shared/ui-seam). Removing core live switches fishball-ui's rows off (no fishball-off frame is served).

## UI-POLISH-F §2 and §4 (`strip-cases.mjs`, `strip.mjs`, `polish-cases.mjs`)

**Re-baselined (MULTI-3, D03 / requirement D):** there is no chat-top status card any more. Every
UIPF-STRIP-* row is kept listed and skipped as withdrawn; the per-target status, Connect / Cancel,
tools count and approval link are the sidebar rows below (TGT-SB-*).

Requirement: `.runtime/reports/ui-polish-f/SPEC.md` §2 (the status card) and §4 (the model dialog).
The strip rows mount fishball-ui's `fishball-strip` dock entry in the scripted page and feed it
frames built by the real pure `stripView(snapshot, lang)`.

| Id | Technique | Expected outcome |
| --- | --- | --- |
| UIPF-STRIP-DT-01 `<kind>` en / zh (every SPEC §2 row + any other kind) | DT | `div[data-fishball-strip][role=status][data-fishball-strip-state=<state>]`, heading = card.title, badge in a DSH Tag with `data-fishball-strip-badge`, StateDot before the heading (done / spinner / error / warning / idle); line kinds and texts kept |
| UIPF-STRIP-EP-01 tools chip en / zh | EP, BVA 0/1/2 | The contributed-tools chip: tabIndex 0, DSH Tooltip label = toolsHint, aria-label `<text> · <toolsHint>`, no native title, the reworded text |
| UIPF-STRIP-DT-02 none / connect / cancel × en / zh | DT | No button / primary Connect / outline Cancel, labels unchanged |
| UIPF-STRIP-ST-01 approval en / zh; no approval without cancel | ST | After Connect answers an approval URL and the control is cancel: `a[data-fishball-strip-approval]` href/title URL, `_blank`, `noopener noreferrer`, text "Open the approval page" / "打开授权页面"; gone when the control leaves cancel |
| UIPF-MODEL-EP-01 aria-labels / visible en / zh | EP | Each choice's aria-label is `<group> / <model>` or `… · <effort>`; it shows the model name, the effort as a Tag, not the group |
| UIPF-MODEL-EP-02 headings | EP | Group names are headings, each before its own choices, in catalog order |
| UIPF-MODEL-EP-02 role group | EP | Each group is `role="group"` named by its heading and holds exactly its choices |
| UIPF-MODEL-BVA-01 one group | BVA | One group, one model → one choice |
| UIPF-MODEL-EP-03 refused / none | EP | Refused read: one `role=alert` line, no choice. Empty catalog: no choice, Open DSH settings |

## R-FIX-FUI F4 (`catalog-cases.mjs`): the catalog on every opening

| Id | Technique | Expected outcome |
| --- | --- | --- |
| CAT-ST-01 | ST | Opened with A → closed → opened with B: B's models, none of A's |
| CAT-BVA-01 | BVA | One read per opening; focus and re-renders read nothing |
| CAT-ST-02/03 | ST | Pending → loading, no choice; the reopening's first paint is loading |
| CAT-ST-04 | ST | A read settling after close changes nothing; a late read of an earlier opening is never shown |
| CAT-EP-01 | EP (refused / rejects × lang) | Failed alert and `[data-fishball-model-retry]` 'Try again' / '重试'; it reads again; success shows the models |

## MULTI-3: the sidebar DSH targets (`targets-cases.mjs`, `targets.mjs`, `targets-constants.mjs`)

Requirements: the MULTI-3 brief A–G (lead, 2026-11-18) and its follow-up the same day (MULTI-0
review fixes 1249c517: `SEAM_TARGETS.http` statuses shown as en/zh sentences with core's code; no
answer → a generic sentence; the K3a Connect routes withdrawn; the empty list offers Fishball
settings `[data-fishball-target-settings]`); PLAN-MULTI §3, §5, Q01, Q08, Q09, Q12; the frozen
contracts targets.d.ts, ask-card.d.ts, ui.d.ts and fishball-shared's `SEAM_TARGETS` / `SEAM_STATUS`.
The implementation is not read.

Levels: unit (`targetsView` bound to each SDK); component (fishball-ui's real client in the
F-SETTINGS scripted page with `<html data-fishball-page>`; the winner of the single slot
`sidebar.workspaces` mounted as DSH elects it, lowest priority; frames from the real `targetsView`;
target routes are the page's fetch). Row buttons are the buttons carrying `aria-expanded`.

| Id | Technique | Expected outcome |
| --- | --- | --- |
| TGT-VIEW-EP-03 brandStyle | EP | Frame `brandStyle` is fishball for absent/unknown, deepseek for the stored deepseek, and fishball when core is off |
| TGT-VIEW-EP-01 shape / order | EP | Frame keys exactly on, title, empty, notices, targets, words, brandStyle; target keys exactly targetId, kind, name, placeholder, state, badge, url, lines, control, retry, pairing; snapshot order kept |
| TGT-VIEW-DT-01 core absent / off / undefined × en/zh | DT | `{fishball: 'fishball-off'}` (no `targets`), off with targets, or undefined → on false, notices `[fishball-off]`, targets [], empty null |
| TGT-VIEW-DT-02 guards × set | DT | ok/ok → none; overridden → `guards-overridden`; incomplete → `plugin-set-incomplete`; both → both, each with text |
| TGT-VIEW-BVA-01 0 / 1 / 40 targets × lang | BVA | 0 → `empty` text ("No DSH target yet…" in en, a zh text in zh); 1 and 40 → that many views (no cap) |
| TGT-VIEW-EP-02 state | EP | connected / connecting / failed / not-set kept; an unknown word, '', null, undefined → failed with the failed badge; four distinct badges per language, en ≠ zh |
| TGT-VIEW-DT-03 state × name | DT (Q01) | name null: not-set → placeholder Not set / 未设置, others → Name unavailable / 名字未知, never URL-derived; plain, suffixed, Unicode, markup and 200-char names verbatim |
| TGT-VIEW-EP-03 line order / url | EP | why, url, contributed-tools, identity, in order; the url line shows the URL |
| TGT-VIEW-EP-04 why | EP | Every line kind core's rule emits (UI-POLISH-F §2 table but fishball-off) translated, en ≠ zh; an unknown kind verbatim; a code appended (known and unknown kinds). Connect `authorized` is not a kind core emits (the lead): no row |
| TGT-VIEW-BVA-02 tools | BVA | null → no line; 0, 1, 7 → one line with the number (zero included); en 1 vs 7 read differently |
| TGT-VIEW-EP-05 identity × lang | EP | pending / live / unsupported / stale → one identity line each, four texts |
| TGT-VIEW-DT-04 control × state | DT | connect / cancel → `{action, label}` with Connect / 连接, Cancel / 取消; null → null; retry a label only when failed |
| TGT-VIEW-EP-06 pairing | EP | `pairing` equals `pairingView(target.pairing, lang, tz)` for paired, warn-match, warn-mismatch, need-token × en/zh |
| TGT-VIEW-EP-07 | EP | title and words differ between en and zh |
| TGT-SB-EP-01 priority | EP | fishball-ui's `sidebar.workspaces` entry has a priority below -1 (fishball-page's Empty) and 0 (DSH) |
| TGT-SB-ST-01 not the page / mark later | ST | No mark → no target rows; mark set → rows; mark removed → none |
| TGT-SB-EP-02 stream url × lang | EP | `/api/fishball/strip?lang=<en/zh>&tz=<browser zone>` |
| TGT-SB-BVA-01 1 / 3 / 40 rows | BVA (Q12) | One row button per target, aria-expanded false, name and badge shown, no URL while closed |
| TGT-SB-EP-03 placeholders × lang | EP (Q01) | not-set null name → Not set / 未设置; failed null name → Name unavailable / 名字未知 |
| TGT-SB-EP-04 markup / unicode / long | EP | The name is one text node, verbatim; no `<b>` element, no dangerouslySetInnerHTML |
| TGT-SB-EP-05 empty / off | EP | Empty → the empty text and `[data-fishball-target-settings]` → openBundle('fishball-core'); off → no rows, the off notice |
| TGT-SB-ST-02 expand/collapse; inline | ST | false → press → true: why, Address + URL, tools (0 included), identity inline → press → false, URL gone; no dialog role / aria-modal, no overlay entry, the other rows stay |
| TGT-SB-ST-03 select sends nothing; survives a frame | ST (Q09) | Opening / closing sends no request, writes no setting or credential; an open row stays open across a new frame |
| TGT-SB-DT-01 connect / cancel × lang; retry; none | DT | POST `/api/fishball/targets/{connect,cancel,retry}` with exactly `{targetId}`; never the withdrawn K3a routes; a connected target without control has no Connect / Cancel / Retry |
| TGT-SB-ST-04 approval × lang; not http | ST | `{outcome: approval-url, url}` → window.open(url, '_blank') and a link "Open the approval page" / "打开授权页面" (after the next frame shows the attempt); a javascript: URL → no link, nothing opened |
| TGT-SB-ST-05 pairing | ST | warn-match lines and checkbox in the details; Continue disabled until ticked → POST `/api/fishball/targets/pairing` `{targetId, choice: continue, confirmed: true}`; another choice unticked → `confirmed: false` |
| TGT-SB-EP-06 settings link | EP | The details' "Fishball settings" → openBundle('fishball-core'), else selectPanel('plugins') |
| TGT-SB-DT-02 answer × status | DT (follow-up) | 200 ok → no alert; 200 ok:false, 400, 404, 409, 503, 409 without body, network → one role=alert `[data-fishball-target-refused]` sentence, core's code appended when present; the 400 / 404 / 409 / 503 / network sentences differ; zh differs from en; a later ok clears it |
| TGT-SB-DT-03 pairing answer | DT (follow-up) | A refused / failed pairing choice → role=alert `[data-fishball-pairing-failed]` in the details (code appended); ok → none |
| TGT-SB-ST-06 stale / closed; Reconnect | ST | The stream notice in the sidebar, every action control disabled, Reconnect only when closed; one Reconnect reopens the sidebar and asks streams |
| TGT-DOCK-EP-01 no strip / no pairing card | EP (requirement D) | No dock entry `fishball-strip`; no `[data-fishball-pairing]`, no pairing stream |
| TGT-ASK-EP-01 source × lang | EP | `data-fishball-ask` = handle; source.name as text (markup verbatim); null → Name unavailable / 名字未知 |
| TGT-ASK-EP-02 post by handle | EP | POST `/api/fishball/asks/answer` with exactly `{handle, choice, text}` (no approvalId) |
| TGT-ASK-EP-03 equal approvalId | EP | Two targets' `ap-1` → two cards, each posting its own handle |
| TGT-ASK-ST-01 voided × lang | ST | Read-only: "Voided" / "已作废", the question shown, no button or reason box |
| TGT-ASK-DT-01 answer × status | DT (follow-up) | ok → no alert; 404, 409 `expired`, network → one role=alert in the card, the code appended |

Withdrawn rows of earlier tasks are listed as skipped with their reason (`withdrawn.mjs`,
`targets-constants.mjs` WITHDRAWN): the strip, the pairing card and its routes, the K3a Connect
routes, the tray.
