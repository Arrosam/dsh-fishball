# MSG-USER: Fishball speaks to the user only through `message_user`

Authority: the implementer's black-box spec relayed by the lead (2026-11-21), items 1–7; its refinement of item 6
(a turn's assistant replies are visible exactly when that turn's control `button[data-turn-process]` is open
(`data-open`) or disabled; hidden for a closed enabled control, a running turn, or no control); the lead's look rule
(avatar, "Fishball" label and bubble move to the message row; expanded replies keep DSH's plain look). The look
itself is also pinned at component level by fishball-ui.brand AVATAR-EP-03/05 (`test/v3/fishball-ui/brand`).

Levels:
- **unit**: `MESSAGE_TOOL` (packages/core/src/manager/message-tools.js), `GUARDS.coreTools` (contracts) and `PERSONA_ROLE`, imported as published;
- **system**: core installed as a bundle in a real standalone DSH (the manager suite's world, `../manager/world.mjs`) with the
  scripted model (`test/support/fixtures/fake-llm.mjs`), and DSH's **real web UI** opened in the LITE headless Chromium
  (`page.mjs`), logged in with the owner cookie. Page facts are DSH's public chat markup plus the page's published hooks
  (`[data-chat-flow-kind="fishball-message"]`, `div[data-fishball-message]`, `data-fishball-folded`). Page rows skip without Chromium.

Before the page opens, Fishball's `model` is set to a routable scripted model: with it unset the page's model dialog
(fishball-ui.model-dialog) is a modal over the chat and DSH's control cannot be clicked.

| Id | Technique | Checks |
| --- | --- | --- |
| MSG-TOOL-EP-01 | EP (unit) | message-tools.js has no import/require/re-export; `MESSAGE_TOOL` = `{send:'message_user'}` |
| MSG-TOOL-EP-02 | EP (unit) | `GUARDS.coreTools` holds `{module:'../manager/message-tools.js', table:'MESSAGE_TOOL'}` |
| MSG-TOOL-EP-03 | EP (system) | every manager turn offers `message_user`; `message` is a required string; Markdown is mentioned |
| MSG-TOOL-EP-04 | EP (system) | an ordinary `sessionController.create` session is not offered it |
| MSG-TOOL-EP-05 | EP (system) | the guard report's `extraManagerTools` and `overridden` never name `message_user` |
| MSG-TOOL-DT-01 ×9 | DT + BVA | text, 1 char, padded → `{shown:true}`; `''`, one space, `\n\t  \n` → `{shown:false, code:'message-empty'}`; number, null, missing → DSH's argument error (isError, no `shown`) |
| MSG-PERSONA-EP-01…07 | EP (unit) | names message_user and embed-ui__notify; replies/reasoning/tool calls hidden; user sees **only** what message_user surfaces; attention/action → tell them yourself (proactive) with message_user plus a notify notice; nothing for routine events, batch; every reply, the setup greeting and the report after stop/redirect go through message_user; no "tell the user in this chat" sentence without the tool. Word/regex checks, never exact sentences. |
| MSG-PAGE-EP-00 | precondition | the manager world's DSH web UI is the Fishball page (`<html data-fishball-page>`) |
| MSG-PAGE-EP-01 | EP | 4 non-empty calls in one turn (across two model steps) → 4 rows in call order; `**first**` drawn as `<strong>`, no `**` |
| MSG-PAGE-DT-01 | DT | `''`, whitespace-only, number, missing, unparsable arguments → no row (and no row anywhere beyond the shown texts) |
| MSG-PAGE-EP-02 | EP × ST | message rows visible, in main.conversation, not in the turn-process fold / step group, not folded, with the control closed, open, closed again |
| MSG-PAGE-EP-03 | EP | message row: avatar mask on ::before, `"Fishball"` ::after, a `div[data-fishball-message]` bubble (background or radius) |
| MSG-PAGE-DT-02 | DT: enabled + closed | the turn's two replies are hidden |
| MSG-PAGE-DT-03 | DT: disabled, no data-open | (a text-only turn) its reply is visible |
| MSG-PAGE-ST-01 / 01b / 02 | ST closed→open→closed (trusted clicks) | open: replies visible, `message_user` tool rows are normal rows inside the fold; expanded replies have no avatar/label and the same content style as with fishball-page unloaded; closed again: hidden |
| MSG-PAGE-ST-03 | ST running (held at its 2nd model request) | message row visible at once, outside the fold; the reply hidden |
| MSG-PAGE-ST-04 | ST running → completed (closed enabled control) | message stays, replies hidden |
| MSG-PAGE-ST-05 | ST running → stopped (control open + disabled) | replies visible, message stays |
| MSG-PAGE-ST-06 | ST: DSH `ui-chat.transcriptView` verbose ⇄ default | every control open + disabled → replies visible; back → hidden |
| MSG-PAGE-ST-07 | ST reload | rows rebuilt from the stored session in call order; replies hidden |
| MSG-PAGE-ST-08 / 09 | ST unload / reload of the `fishball-page` row (DSH's Plugins switch) | off: no page mark, no message rows, no `data-fishball-folded`, DSH's control opens and shows replies as DSH does; on again: rows return |

## PAGING and STREAM (the lead, 2026-11-21: folded replies must not break DSH's chat scrolling or paging)

[paging.mjs](paging.mjs), on a home of its own. 40 manager turns, each a hidden reply with a `message_user` call and a
hidden final reply (4 messages a turn), so DSH's Turn-aligned window (≥ 50 messages and 2 Turns a page,
`HISTORY_PAGE_OPTIONS`, both SDKs) opens on the newest part only. Input is trusted: wheel steps on DSH's
scrollport `[data-conversation-scroll]`, and a click on DSH's own "Load earlier" control. That control is how DSH pages
(reaching the top by wheel loads nothing by itself, on both SDKs).

| Id | Technique | Checks |
| --- | --- | --- |
| MSG-PAGING-EP-00 | precondition | the first window holds fewer than 40 messages; "Load earlier" is offered; wheel input reaches the top |
| MSG-PAGING-ST-01 | ST: newest window → each older page → all loaded | after every page the message rows are the newest contiguous run in call order, all visible; at the end all 40 and no "Load earlier" |
| MSG-PAGING-ST-02 | ST, BVA ±2px | the topmost message row fully on screen before the click keeps its offset in the scrollport (sampled every 100 ms until 2 s after the page arrived) |
| MSG-PAGING-EP-01 | EP, ±0.5px | every hidden reply seat has a 0×0 box, and the gap between the visible rows around it equals the gap with every hidden seat taken out of the document (measured in one task) |
| MSG-PAGING-EP-02 | EP | no uncaught page exception names Fishball's code while scrolling and paging |
| MSG-STREAM-ST-01 | ST running (400 text deltas, 10 ms apart) | the streamed reply grows while sampled and is never visible and never has height; the message before it is drawn and visible throughout; at the end both messages are visible |
| MSG-STREAM-ST-02 | ST running → completed → opened | replies hidden behind a closed enabled control; both messages visible; a trusted click opens it and the streamed reply shows complete |
| MSG-STREAM-EP-01 | EP | no uncaught page exception names Fishball's code during the stream |

## Todo rows
- MSG-PAGE-EP-04 "outside the Fishball page nothing changes" for another session in the **same** DSH: no public
  route was found that shows a non-manager session there (`/session/<id>`, `?session=`, `#/session/`, `/s/` all
  left the chat empty). ST-08 covers "unloading removes all of it".

## Harness additions (test-only)
- fake-llm: a text step's `deltas` / `delayMs` streams it as that many text-delta chunks, spaced in time.
- fake-llm: a step's `rawArgs` sends the tool-call arguments text as given (unparsable call); `model.holdNth`
  holds a session's n-th conversation request (a running turn).
- manager world: `turn` takes `scripts`; `startTurn` / `held` / `release` / `stopTurn` (DSH's user cancel) / `idle`;
  `toolSpec`; `mutate` takes a namespace; `setRowEnabled` (DSH's plugin manager, as the guards worker).
