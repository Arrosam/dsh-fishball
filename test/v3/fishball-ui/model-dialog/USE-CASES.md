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
| STRIP-SYS-01 | BVA/EP | First SSE frame arrives immediately, en/zh, lines kind/text and nullable control |
| STRIP-DT-01 | DT | Core Connect returns ConnectBegin; core cancel returns ConnectStatus. There is no strip press route (lead correction 2026-11-17). |
| MODEL-ST-03 | ST/system | HMR native disable of core → picker restored, core-missing row enabled; fishball-ui's rows follow core off (DESIGN §20 live core on/off, 1.41 Q-G2 = A), so the strip route and core's Connect route answer 404 |

Deferred E2E-CORE: real browser reload, focus/accessibility, Settings navigation. Scripted page recreation is executable now; no actual browser starts. HMR system row is executable, not todo, because the reusable standalone worker supports native live bundle changes.

Known coverage boundary: core routes are checked against the real core's no-target state, not a fake successful OAuth approval URL. Browser strip button dispatch and successful approval URL opening remain E2E-CORE. Catalog failures/loading are not assigned product behavior by the fixed interface. SSE reads the named fishballStatus service (UI_SEAM.status in fishball-shared/ui-seam). Removing core live switches fishball-ui's rows off (no fishball-off frame is served).

## UI-POLISH-F §2 and §4 (`strip-cases.mjs`, `strip.mjs`, `polish-cases.mjs`)

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
