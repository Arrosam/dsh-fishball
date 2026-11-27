# message-page: message_user on the Fishball page

DESIGN §32 and the MSG-USER spec items 5–7: fishball-ui's fishball-page draws each non-empty `message_user` call of
fishball-core's manager as its own `fishball-message` row (with Fishball's avatar, label and bubble). It hides the
turn's assistant replies unless DSH's own turn control is open or disabled. Ported from
`test/v3/fishball-core/message-user/` (cases.mjs page half, paging.mjs, page.mjs, constants.mjs, USE-CASES.md). The
tool and persona rows stay in fishball-core's own tests.

| file | rows |
|---|---|
| [cases.mjs](<cases.mjs>) (entry `../message-page.test.mjs`) | MSG-PAGE-EP-00…03, DT-01…03, ST-01, ST-01b, ST-02…09 |
| [paging.mjs](<paging.mjs>) (entry `../message-paging.test.mjs`, a home of its own) | MSG-PAGING-EP-00…02, ST-01/02, MSG-STREAM-EP-01, ST-01/02 |
| [facts.mjs](<facts.mjs>) | snapshot readers by turn, the manager session (core's `/api/fishball/session`, Fishball's model set), opening the page |
| [constants.mjs](<constants.mjs>) | the tool, DSH's chat markup words, the scripted turns, paging and stream budgets |

**Techniques.** EP (argument partitions, row look), DT (control open / disabled / closed × replies shown), BVA
(one-character and padded messages, ±2 px anchor, ±0.5 px gaps, 40 turns over DSH's 50-message window), ST (closed →
open → closed, running → completed / stopped, verbose ⇄ default, reload, the row off → on, newest window → every older
page, running stream → completed → opened).

**How it is observed.** A booted standalone DSH with fishball-core (whose patch carries fishball-ui's rows) and the
scripted model, and DSH's real web UI in headless Chromium logged in as the owner
([../support/page.mjs](<../support/page.mjs>)). Turns are scripted per model request. A running turn is held at its
second request. The stop is DSH's own user cancel. The work-details switch is DSH's `ui-chat.transcriptView` setting.
The row switch is DSH's plugin manager. Input is trusted. One scenario per entry collects the facts, and each case
reads them.

**DSH 0.2.2-rc.3.** Two changes are absorbed in the harness and are not product changes. First, the history
control's stacked labels: the shown label is read. Second, DSH's own paging at the history edge: `pageOnce` lets DSH
page by itself and clicks "Load earlier" only where DSH waits for it. ST-02's anchor discounts the wheel step that
triggered the page.

MSG-PAGE-EP-04 is not ported because it cannot be observed: no public route shows a non-manager session in a core +
fishball-ui DSH's page. ST-08 covers "nothing is left when fishball-page is off".
