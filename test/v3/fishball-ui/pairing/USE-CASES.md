# R-FIX-FUI F1: the pairing warning UI (and its F3 stream health)

Requirement: the R-FIX-FUI brief (lead, 2026-11-18) F1, with the review additions relayed the same
day (`key` and `needsConfirm` in the view; a new warning resets the box and the alert; a stale card
keeps its lines readable). The copy is fishball-ui `src/pairing/text.js` `PAIRING_TEXT`, which the
requirement names as the specified copy, so the oracle (`subject.mjs` `expectedView`) formats with it.

Levels: unit (the pure `pairingView`), integration (fishball-ui's real Node row in a real Cordis root
of each SDK, core's `fishballInstance` provided, replaced and removed by its own fibers), component
(the card drawn by fishball-ui's real client in the F-SETTINGS scripted page, fed real `pairingView`
frames by the health-aware EventSource stand-in of `../stream/event-source.mjs`).

| Id | Technique | Expected outcome |
| --- | --- | --- |
| PAIR-DT-01 `<state> <lang>` | DT (state × lang) | Lines, confirm, choices (order, labels, `needsConfirm`), title and failed as the requirement's table |
| PAIR-EP-01 | EP | The result is deeply frozen with exactly state, title, lines, confirm, choices, failed (and key) |
| PAIR-EP-02 | EP | lang `fr`, `zh-CN`, `EN`, `''`, undefined → the en copy |
| PAIR-BVA-01 | BVA | lastSeenAt null → `neverSeen`; 0 and a time → Intl medium/short |
| PAIR-EP-03 | EP | Two valid zones write different times; invalid / empty / absent zones → the default zone, no throw |
| PAIR-EP-04 | EP | A nameless bound pair is shown as `ID: <id>` |
| PAIR-DT-02 | DT (code × named/nameless × state × lang) | A name issue adds one line of its code: `nameTaken`/`nameInvalid` + space + `nameInUse(name)` / `nameless(id)` |
| PAIR-BVA-02 | BVA | Core absent (view undefined) → no lines, no choices |
| PAIR-EP-05 | EP | `key` equal for equal views, different when state, warning or nameIssue changes |
| PAIR-INT-01 | integration | The row registers the stream (GET) and choose (POST) routes |
| PAIR-INT-02 | integration | First frame at once, `text/event-stream`, = pairingView(view, lang, tz); other lang / bad tz → en, default zone |
| PAIR-ST-01 | ST | One frame per change; an identical consecutive view sends none |
| PAIR-ST-02 | ST | absent (no lines) → provided → replaced (old listener dropped) → removed (no lines) |
| PAIR-EP-06 | EP | apiVersion 2 / no `ui.pairing` counts as absent |
| PAIR-ST-03 | ST | Request abort and row disposal close streams, drop listeners, withdraw routes |
| PAIR-DT-03 | DT | choose results answered with 200; choose throws / rejects / no core → 503 pairing-unavailable |
| PAIR-EP-07 | EP | Only `confirmed === true` is passed as confirmed |
| PAIR-EP-08 | EP | Bad bodies → 400 invalid-arguments, core not called; any string choice is passed on |
| PAIR-UI-01 | EP | The stream URL carries lang (UI locale `zh*` → zh, else en) and the browser's tz |
| PAIR-UI-02/03/04 | DT | Card per state; continue disabled until ticked; no lines → nothing drawn |
| PAIR-DT-04 | DT (choice × answer × lang) | Posted `{choice, confirmed}`; non-ok / 503 / network / non-JSON → `[data-fishball-pairing-failed]` role=alert with `failed`; ok → none |
| PAIR-ST-04/05 | ST | Continue stays disabled unticked; failed → ok clears; a new warning resets box and alert; the same warning keeps the tick |
| PAIR-HEALTH-01/02/03 | ST/DT | Stale / closed: notice, lines readable, box and choices disabled, Reconnect on closed; a valid frame recovers, an invalid one does not; unmount closes |

**Re-baselined (MULTI-3 requirement D; the lead, 2026-11-18):** the pairing dock card, its chunk
and its routes `/api/fishball/pairing` and `/api/fishball/pairing/choose` are removed. Pairing is shown
in each target's sidebar details and posted to `/api/fishball/targets/pairing` `{targetId, choice, confirmed}`.
See `../model-dialog` TGT-SB-ST-05 and TGT-SB-DT-03. The PAIR-INT / ST-01–03 / EP-06–08 / DT-03 route rows and the
PAIR-UI / DT-04 / ST-04 / ST-05 / HEALTH card rows stay listed, withdrawn. The pure `pairingView`
rows (PAIR-DT-01 … PAIR-EP-05) are unchanged. New: PAIR-INT-00, fishball-ui's row registers neither route.
