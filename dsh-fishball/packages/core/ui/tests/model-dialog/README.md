# fishball-ui: model dialog, sidebar DSH targets, ask-card source, running sessions

Entry: [`../model-dialog.test.mjs`](<../model-dialog.test.mjs>). Ported from `test/v3/fishball-ui/model-dialog/`
(F-WIRE, UI-POLISH-F §4, R-FIX-FUI F4, MULTI-3 A–G and its follow-up, the running-sessions feature).

## How it is observed

- **Unit**: fishball-ui's pure frame module `src/status/index.js` (`targetsView`) and `src/pairing/index.js`
  (`pairingView`), imported with `importBound` (fishball-test-helpers/bind) so their DSH imports bind to the
  current DSH; only their exports are read.
- **Component**: fishball-ui's real `client.js` and the chunks it loads, **alone**, in fishball-test-helpers'
  scripted DSH page (`clients: [{id: 'fishball-ui', file: <ui>/client.js}]`). Nothing of fishball-core runs:
  what core would serve is scripted — the page connection's frames (`/api/fishball/page/events`, topics
  `strip` and `asks`, through the helpers' EventSource stand-in), core's owner-only target routes and the ask
  answer route (the page's fetch), core's settings namespace `fishball-core` (DSH's configForms), and DSH's
  `remote.session.modelCatalog()`.
- Support: [`../support/b-model.mjs`](<../support/b-model.mjs>) (the dialog's page: `<html data-fishball-page>`,
  the catalog read, DSH's Modal stand-in, DSH's native Settings launcher), [`../support/b-sidebar.mjs`](<../support/b-sidebar.mjs>)
  (the `sidebar.workspaces` winner, row / item finders), [`../support/b-targets.mjs`](<../support/b-targets.mjs>)
  (MULTI-3 vocabulary, `targetView` / `snapshotOf` fixtures in the contracts' shape). Shared support by
  port-ui-a: `ui-page.mjs`, `page-stream.mjs`, `ask-card.mjs`, `pairing.mjs`, `seam.mjs` (ui-seam's values,
  imported by name through core's declared dependency).
- A user's view: row buttons are buttons with `aria-expanded`; a target's item is the largest subtree around
  its row holding no other row (plus its `aria-controls` element); text nodes are read as text, so markup in a
  name must stay text.

## Rows

| Id | Technique | Expected outcome |
| --- | --- | --- |
| MODEL-REMOVED-01 en/zh | ST | With core model unset, there is no picker slot entry or dialog, no catalog read and no settings mutation; reopening the page still shows no dialog |
| MODEL-REMOVED-02 en/zh | BVA | With core model unset and no catalog models, there is no dialog, Settings launcher click or settings mutation |
| TGT-VIEW-EP-01 shape / order | EP | Frame keys exactly on, title, empty, notices, targets, words, brandStyle; target keys exactly the 12 of the frame; snapshot order kept |
| TGT-VIEW-EP-03 brandStyle (5) / off | EP | absent, unknown, other case → fishball; deepseek → deepseek; core off → fishball |
| TGT-VIEW-DT-01 core absent / off / undefined × en/zh | DT | on false, notices `[fishball-off]`, targets [], empty null |
| TGT-VIEW-DT-02 guards × set | DT | ok/ok → none; overridden; incomplete; both, each with text |
| TGT-VIEW-BVA-01 0 × en/zh / 1 / 40 | BVA | 0 → the empty text ("No DSH target yet…" in en, another in zh); 1 and 40 → that many views (no cap) |
| TGT-VIEW-EP-02 state (8) / badges × en/zh | EP | The four states kept; any other word, '', null, undefined → failed with the failed badge; four distinct badges, en ≠ zh |
| TGT-VIEW-DT-03 state × name null × url (24), names (10), empty | DT (Q01) | No URL → "Not set" / "未设置"; a URL → "Name unavailable" / "名字未知"; never URL-derived; names verbatim |
| TGT-VIEW-EP-03 line order / url field | EP | Lines why, contributed-tools, identity; the URL is the view's `url`, no line carries it |
| TGT-VIEW-EP-04 why kinds × en/zh, unknown, codes | EP | Every kind core emits translated, en ≠ zh; unknown verbatim; a code appended |
| TGT-VIEW-BVA-02 tools null / 0 / 1 / 7; 1 vs 7 | BVA | null → no line; 0, 1, 7 → one line with the number; en singular / plural differ |
| TGT-VIEW-EP-05 identity × en/zh | EP | pending / live / unsupported / stale → one line each, four texts |
| TGT-VIEW-DT-04 control × state × en/zh; no retry | DT | connect / cancel → `{action, label}` Connect / 连接, Cancel / 取消; null → null; retry only when failed |
| TGT-VIEW-EP-06 pairing × en/zh | EP | `pairing` = `pairingView(target.pairing, lang, tz)` |
| TGT-VIEW-EP-07 | EP | title and words differ between en and zh |
| TGT-SB-EP-01 | EP | fishball-ui's `sidebar.workspaces` entry has a priority below -1 (fishball-page's Empty) and 0 (DSH) |
| TGT-SB-ST-01 not the page / mark later | ST | No mark → no rows; mark set → rows; removed → none |
| TGT-SB-EP-02 en/zh | EP | One source `/api/fishball/page/events?lang=<lang>&tz=<browser zone>` |
| TGT-SB-BVA-01 1 / 3 / 40 | BVA (Q12) | One row button per target, aria-expanded false, name and badge, no URL while closed |
| TGT-SB-EP-03 en/zh | EP (Q01) | Placeholders drawn in the rows |
| TGT-SB-EP-04 markup / unicode / long | EP | The name is one text node, verbatim; no `<b>`, no dangerouslySetInnerHTML |
| TGT-SB-EP-05 empty / off | EP | Empty text and `[data-fishball-target-settings]` → openBundle('fishball-core'); off → no rows, the off notice |
| TGT-SB-ST-02 expand/collapse; inline | ST | Details inline (why, Address + URL, tools, identity); no dialog role, no overlay entry; other rows stay |
| TGT-SB-ST-03 select sends nothing; survives a frame | ST (Q09) | Toggling sends nothing, writes nothing; an open row stays open across a new frame |
| TGT-SB-DT-01 connect / cancel × en/zh; retry; none | DT | POST `/api/fishball/targets/{connect,cancel,retry}` with exactly `{targetId}`; never the withdrawn K3a routes |
| TGT-SB-ST-04 approval × en/zh; not http | ST | `approval-url` → window.open(url, '_blank') and the "Open the approval page" link; a javascript: URL → nothing |
| TGT-SB-ST-05 pairing | ST | warn-match lines and checkbox; Continue disabled until ticked; posts `{targetId, choice, confirmed}` |
| TGT-SB-EP-06 settings link | EP | openBundle('fishball-core'), else selectPanel('plugins') |
| TGT-SB-DT-02 answer × status (8); statuses differ; zh; refused then ok | DT | One role=alert `[data-fishball-target-refused]` sentence with core's code; the sentences differ; zh ≠ en; a later ok clears it |
| TGT-SB-DT-04 needs-configuration × en/zh | DT | The needs-configuration sentence with the code |
| TGT-SB-ST-07 refusal survives collapse / remount; sending lock; latest press | ST | Press state per target; only the latest press's approval page opens |
| TGT-SB-DT-03 pairing answer | DT | A refused pairing choice → role=alert `[data-fishball-pairing-failed]` with the code |
| TGT-SB-ST-06 stale / closed; Reconnect | ST | The stream notice, every action disabled, the pairing warning still readable, Reconnect only when closed; one Reconnect reopens one page connection |
| TGT-DOCK-EP-01 no strip / no pairing card | EP (requirement D) | No dock entry `fishball-strip`; no `[data-fishball-pairing]`, no pairing stream |
| TGT-ASK-EP-01 source × en/zh; null | EP | `data-fishball-ask` = handle; "DSH:" prefix and the name as text; null → "Name unavailable" |
| TGT-ASK-EP-02 / -EP-03 | EP | POST `/api/fishball/asks/answer` with exactly `{handle, choice, text}`; equal approvalIds → each card its own handle |
| TGT-ASK-ST-01 voided × en/zh | ST | A voided (finished) card is not drawn in the composer dock (f24f814a) |
| TGT-ASK-DT-01 answer × status | DT | 404, 409 `expired`, network → one role=alert in the card with the code |
| SES-VIEW-BVA-01 0 / 1 / 3 | BVA | `sessions` = core's `runningSessions` `[{sessionId, title}]`, in order |
| SES-VIEW-EP-01 null / absent / not an array | EP | `sessions` [] |
| SES-VIEW-EP-02 connecting / failed / not-set / unknown | EP | `sessions` [] even with a list |
| SES-VIEW-EP-03 en/zh; SES-VIEW-EP-04 | EP | Untitled → "Untitled session" / "未命名会话"; heading word; titles verbatim |
| SES-SB-EP-01 en/zh; -EP-02 | EP | The list `[data-fishball-target-sessions]` inside the target's item without a press, items with an ongoing dot and the title; no control; markup as text |
| SES-SB-DT-01 (3) / SES-SB-ST-01..03 | DT / ST | No list without sessions, unknown or not connected; the list goes when sessions end, hides while the stream is not live; details disclosure unaffected |

## Not here

- **Integration** (they need fishball-core running): MODEL-SYS-01, STRIP-SYS-01, MODEL-ST-03 (a real standalone
  DSH with core and its ./ui component); STRIP-DT-02 (core's per-target Connect route).
- **Retired**: the in-page picker's MODEL-EP/BVA and MODEL-ST-01/02/04/05/06, UIPF-MODEL-* and CAT-* rows.
  DSH onboarding superseded the page picker; core's Settings model/effort controls have their own [tests](<../../../tests/settings/model-picker.mjs>).
- **Retired**: STRIP-DT-01 and every UIPF-STRIP-* row (withdrawn: MULTI-0 review S6, MULTI-3 D03 — no status card);
  the "browser page reload and settings navigation" todo (E2E, no subject here).
