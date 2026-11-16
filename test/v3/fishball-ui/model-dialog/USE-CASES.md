# F-WIRE model dialog and status strip

Authority: fixed F-WIRE interface; user decision to prompt on every Fishball page opening when core.model is unset, keep host default until chosen; K3a ui seam. Browser chunks execute unread through fishball-ui's client.js using the existing browser-sandbox and DSH configForms page harness. Remote session.modelCatalog follows both SDKs' public catalog shape.

| Row | Technique | Expected outcome |
| --- | --- | --- |
| MODEL-EP-01 | EP | Unset core model, two catalog models, en/zh: dialog visible and catalog listed |
| MODEL-ST-01 | ST | Choose catalog entry → configForms mutation at fishball-core ['model'] with provider/model and optional reasoningEffort |
| MODEL-ST-02 | ST | Dismiss → no settings write; focus does not reopen; new page opens dialog again |
| MODEL-EP-02 | EP | Set core model → no dialog and no mutation |
| MODEL-BVA-01 | BVA | Zero models → explanation and DSH Settings launcher button; no selection write |
| MODEL-SYS-01 | Integration/system | Real standalone with core switches ui-model-selection off |
| STRIP-SYS-01 | BVA/EP | First SSE frame arrives immediately, en/zh, lines kind/text and nullable control |
| STRIP-DT-01 | DT | Core Connect returns ConnectBegin; core cancel returns ConnectStatus. There is no strip press route (lead correction 2026-11-17). |
| MODEL-ST-03 | ST/system | HMR native disable of core → picker restored, core-missing row enabled; fishball-ui's rows follow core off (DESIGN §20 live core on/off, 1.41 Q-G2 = A), so the strip route and core's Connect route answer 404 |

Deferred E2E-CORE: real browser reload, focus/accessibility, Settings navigation. Scripted page recreation is executable now; no actual browser starts. HMR system row is executable, not todo, because the reusable standalone worker supports native live bundle changes.

Known coverage boundary: core routes are checked against the real core's no-target state, not a fake successful OAuth approval URL. Browser strip button dispatch and successful approval URL opening remain E2E-CORE. Catalog failures/loading are not assigned product behavior by the fixed interface. SSE reads the named fishballStatus service (UI_SEAM.status in fishball-shared/ui-seam). Removing core live switches fishball-ui's rows off (no fishball-off frame is served).
