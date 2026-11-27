# fishball-ui.pairing: the pairing view model (R-FIX-FUI F1)

Requirement: the R-FIX-FUI brief (lead, 2026-11-18) F1, with the review additions relayed the same
day (`key` and `needsConfirm` in the view; a new warning resets the box and the alert; a stale card
keeps its lines readable). The copy is fishball-ui `src/pairing/text.js` `PAIRING_TEXT`, which the
requirement names as the specified copy, so the oracle (`subject.mjs` `expectedView`) formats with it.

Levels: unit (the pure `pairingView` of fishball-ui `src/pairing/`, imported bound to the current DSH
with fishball-test-helpers/bind) and one integration row (fishball-ui's real Node row `index.js` in a real
Cordis root of the current DSH, observing the routes it registers). Core's views are fixtures in the
seam's words (`../support/pairing.mjs`). Entry file: `../pairing.test.mjs`.

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
| PAIR-INT-00 | integration | fishball-ui's row registers neither `/api/fishball/pairing` nor `/api/fishball/pairing/choose` |

**Retired (MULTI-3 requirement D; the lead, 2026-11-18):** the pairing dock card, its chunk and its routes
`/api/fishball/pairing` and `/api/fishball/pairing/choose` were removed. Pairing is shown in each target's
sidebar details and posted to `/api/fishball/targets/pairing` `{targetId, choice, confirmed}` (the sidebar
rows TGT-SB-ST-05 and TGT-SB-DT-03). The PAIR-INT-01/02, ST-01–05, EP-06–08, DT-03/04, UI and HEALTH rows are
no longer registered.
