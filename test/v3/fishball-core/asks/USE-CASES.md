# F-ASKCARD: Use Cases and derived cases

Written from the requirements alone (R-FB-11, R-UI-12, R-CON-05, R-CON-06, R-CON-08; K3
`packages/core/contracts/ask-card.d.ts` and `ui.d.ts` `asks`; the user's decision Q3 = A; test design
PLAT-UC-07). The implementation (`packages/core/src/asks/`, and the browser half
`packages/fishball-ui/client.asks.js`, moved there from core by F-UI) was not
read. Every expected outcome below comes from those requirements.

Actors: S1, an agent session that calls `ask_agent` (the asker); Fishball's model (it may call
`ask_user`); core's link (`onPoll`, `callTool`); the user, who reads and answers cards on the Fishball
page (through `ui.asks` or the two Fetch routes).

## Use Cases

### ASK-UC-01: Fishball files an ask it cannot decide, and the user answers it (PLAT-UC-07)
- **Main**: S1's `ask` event is polled; Fishball's model calls `ask_user({offer_id})`; a card is
  filed with the ask's fields, state `open`, choices `allow` / `reject`; the user picks one, with an
  optional reason; core sends one `approval_answer` through the link; the card is `answered`.
- **A1**: Fishball decides itself (no `ask_user` call): no card, nothing in `list()`.
- **A2**: Fishball calls `ask_user` again for the same open ask: the same card, no duplicate.
- **E1**: nobody answers for 48 h (fake clock): the card stays open, nothing is sent.
- **E2**: the ask is settled or retired elsewhere after the card is filed: the card is `closed`; a
  late answer gets `expired` and sends nothing.
- **E3**: the ask is settled or retired before Fishball files it: `ask_user` answers `expired`, no card.
- **E4**: the link is down (or the connector refuses) when the user answers: the code comes back and
  the card stays open, so the user can answer again.
- **E5**: the user answers twice at once: one `approval_answer`, the second gets `already-settled`.

### ASK-UC-02: The Fishball page follows and answers the cards (routes)
- **Main**: the page opens `GET /api/fishball/asks/events` and gets a frame with the manager session id
  and the cards at once, then one frame per change; it posts `{approvalId, choice, text?}` to
  `POST /api/fishball/asks/answer` and gets `200 {ok:true}`.
- **E1**: a refused answer: `409 {ok:false, code}`; an unreadable body or invalid answer: `400`.
- **E2**: the routes are withdrawn: the open stream ends.

### ASK-UC-03: Cards survive a restart
- **Main**: the Fishball DSH stops and starts again; a new store over the same table lists the same
  cards with the same states; an open card can still be answered once, an answered one cannot.

### ASK-UC-04: The main DSH shows nothing (R-UI-12, Q-U2)
- **Main**: no main-DSH package (dsh-connector, dsh-connector-ui, dsh-instance) loads the card's
  browser chunk or calls the card routes; the chunk is fishball-ui's own (`fishball-ui`, shipped in
  fishball-ui's `files`, F-UI); the routes are the only registrations the module makes.

### ASK-UC-07: Startup reconciliation deletes ended unfiled asks (Fishball's decision 2026-11-16)
- **Main**: at a start, `reconcile()` asks `approvals_list({sessionId})` once per session that has
  unfiled asks; an unfiled ask whose approvalId is not listed is deleted, a listed one is kept;
  `unknown-session` deletes every unfiled ask of that session; any other refusal or a rejected call
  keeps them all. Filed cards (open, answered, closed) are never touched, counted or listed for.
- **A1** two sessions: S1 ended, S2 live → S1's ask deleted, S2's kept.
- **E1** a deleted ask: `ask_user` → `expired` in the same process (a replay does not revive it),
  `unknown-offer` after another restart; no card, no `onChange`.
- **E2** no unfiled asks → `{deleted: 0, kept: 0}`, no call; no timer reconciles by itself.

## Derived cases (technique → rows)

| Id | Technique | Rows |
| --- | --- | --- |
| ASK-EP-01 | EP, `ask_user` arguments | 1 missing `offer_id` → `invalid-arguments`; 2 a number; 3 `null`; 4 an offer id never seen → `unknown-offer`; 5 the offer id of a `question` or `plan-review` event → `unknown-offer` (re-baselined by F-FIX: until the user's 2026-11-17 decision "Permission requests become cards", row 5 named a permission); 6 a seen ask → `{ok:true, card}` |
| ASK-EP-06 | EP, card-able offer types (F-FIX) | `permission` and `ask` → filed with K3's fields (question = prompt, choices exactly allow/reject, open); a permission with title `''` → `sessionTitle: null`; an unfiled permission → not listed |
| ASK-UC-08 | Use case, a permission card (F-FIX) | allow/reject × reason given or absent → one `approval_answer`, as for an ask, then answered; a settlement or retirement closes it (a late answer gets `expired`); ended before filing → `expired`; an `ask` still works beside it; system: a real DSH turn files it |
| ASK-ST-02 | State transitions, re-offer (F-FIX) | unfiled → re-offer (same approvalId, new offerId): replaced, not listed; the new id files; the old id → `unknown-offer` or `expired`. Open (filed, unanswered) → re-offer: replaced, unlisted until filed; the answer commits the new offerId. A replay of the same offerId (open or unfiled) → nothing changes. Answered → re-offer → unchanged, nothing sent. r1 → r2 → r3 → only r3 files |
| ASK-EP-02 | EP, card fields | 1 every field from the event/descriptor; 2 empty title → `sessionTitle: null`; 3 descriptor choices non-empty → still exactly `allow`, `reject` |
| ASK-EP-03 | EP, invalid answers | 1 not an object (`null`); 2 a string; 3 `choice` missing; 4 `choice` not offered (`grant`); 5 wrong case (`Allow`); 6 `text` a number; 7 `text` `null` → each `invalid-arguments`, nothing sent, card open |
| ASK-EP-04 | EP, events that close a card | 1 settlement naming the card → closed; 2 settlement naming another ask → open; 3 retirement naming the ask's eventId → closed; 4 retirement naming the approvalId (not the eventId) → open |
| ASK-BVA-01 | BVA, reason text | absent, `''`, `'   '`, `'\n\t'` → the fixed line; `'x'`, `' x '`, `'\n\tx\n'` → `x` |
| ASK-BVA-02 | BVA, time | 48 h on a fake clock → open, nothing sent |
| ASK-DT-01 | Decision table, answer object | allow/reject × reason given/absent → decision, risk, reason |
| ASK-DT-02 | Decision table, connector answer | ok → answered; `already-settled` / `expired` → closed + that code; `disconnected`, `reason-required`, `arguments-incomplete` → open + that code; rejected call → `operation-failed`, open |
| ASK-DT-03 | Decision table, late answer / filing | answered card → `already-settled`; closed card → `expired`; unknown id → `expired`; `ask_user` on answered / closed / settled-unfiled / retired-unfiled → `expired` |
| ASK-ST-01 | State transitions | (none)→open by `ask_user`; open→open by `ask_user` again or a replay; open→answered; open→closed (settlement, retirement); open→open after a stays-open refusal, then →answered; answered→answered on a settlement or replay; closed→closed on a replay or settlement; first commit wins on two concurrent answers |
| ASK-EP-05 | EP, what reconcile reads | no asks → {0,0}, no call; only filed cards (session ended) → {0,0}, no call, cards unchanged; two unfiled asks of one session → one call |
| ASK-DT-04 | Decision table, reconcile | approvals_list answer (ok listed / ok not listed / ok empty / `unknown-session` / `not-managed` / `forbidden` / `disconnected` / `operation-failed` / rejected) × unfiled → deleted or kept; filed open/answered/closed × (not listed, `unknown-session`) → untouched, uncounted |
| ASK-UC-07 | Use case, reconcile | two sessions; replay after delete; another restart → unknown-offer; no onChange; same-process reconcile; no timer (48 h) |
| ASK-UC-05 | onChange | called with `list()` after filing, answering and closing; disposer stops it; a throwing listener affects no other |
| ASK-UC-06 | Link follow | `createAsks` follows `onPoll` once; `close()` disposes it; an ask polled after close is unknown |

Levels: integration (the module over a real dsh-storage-domain table and a fake link with K1 shapes)
and system (the `ask_user` tool registered in a real DSH tool runtime, called by a scripted model in a
real agent; the routes driven with real `Request` / `Response` objects).
