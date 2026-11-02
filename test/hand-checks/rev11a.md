# Hand check: phase rev11a (managed sessions) and the `replyCapShare` fix

Tester: Sonnet 5.5 session, 2026-11-01. Branch `claude/test-rev11a-041aec`, which contains `95a5c97`. Nothing in `src/`, `index.js`, `client.js`, tests, `DESIGN.md` or the requirements file was edited. The real model was never called. The main checkout, `~/.dsh` and the user's profiles were not touched.

## Suite

`/opt/homebrew/bin/node test/run.mjs` on the merged branch: **1383 tests, 1382 pass, 0 fail, 0 cancelled, 1 skipped** (163 suites, about 513 s). The builder's run was 1379 of 1380, so this adds 3 tests. The skip is the same one (OFM-06).

## Method

Scratch scripts outside the repo (scratchpad) booted a real DSH 0.2.1-rc.2 `web` profile with this checkout linked as `dsh-fishball`, on port 3199, through `spikes/harness.mjs` and the fake model. They created ordinary sessions through DSH's session controller, drove Fishball's own session with scripted tool calls (`message_session`, `start_session`, `release_session`), and registered a fixture tool `needs_ok` that asks for approval, to raise permission requests. Hand over, Take back, Send, plugin toggles and state reads went through the real `/api/fishball/*` routes. Buttons, prompts and notices were checked in the built-in browser pane. Restart used the harness's `SPIKE_REUSE_HOME`. The upgrade check booted a home with the previous version (`a5aed26`, extracted with `git archive`) and rebooted it with this checkout.

## Results

| Item | Result | What I did and saw |
|---|---|---|
| Base check | PASS | `git merge-base --is-ancestor 95a5c97 HEAD` succeeded. |
| Suite | PASS | Counts above. |
| Buttons: row menu | PASS | The menu of a managed session lists "Send to Fishball", then "Take back from Fishball", then "Tell Fishball when finished". After Take back, the same menu shows "Hand over to Fishball" in that spot. |
| Buttons: header | PASS | Header order is "Tell Fishball when finished", "Send to Fishball", then "Hand over to Fishball" (yours) or "Take back from Fishball" (managed), then the session's avatar/menu at the far right. I clicked Hand over in the header: it flipped to "Take back" and `managed` listed the session with `by: hand-over`. I clicked Take back in the row menu: both header and menu flipped back to "Hand over". Hand over from the row menu was shown but not clicked. |
| Fishball's own session shows neither button | PASS | Its header shows only "Fishball settings". The API also answers 409 `is-fishball`; an unknown session gives 409 `unknown-session`. |
| Hidden while Session messages is off | PASS | After turning the plugin off, a yours session showed only "Tell Fishball when finished" in header and row menu. "Send to Fishball" and "Hand over" were gone. The managed sessions stayed in `managed`. |
| Hand over answers 409 while off | PASS, with a note | While Session messages was off, Hand over and Take back answered **409 `feature-off`**, not `unavailable`. DESIGN §10e (the managed route) and §5e's Host API list `feature-off`; `unavailable` is for "Fishball not live". The task text said `unavailable` for both. |
| Hand over answers 409 `unavailable` while Fishball isn't running | NOT RUN | I did not stop or archive Fishball's session by hand (risk of leaving the throwaway home in recovery). Only the suite covers it (DUR-05). Buttons hidden while Fishball isn't running: NOT RUN for the same reason. |
| Way in 1: Hand over | PASS | `managed` listed the session (`hand-over`); its next model request had `message_fishball`. |
| Way in 2: Send to Fishball | PASS | `POST send` ok; `managed` listed it (`send`); next request had `message_fishball`. |
| Way in 3: `message_session` to an existing session | PASS | `managed` listed it (`message`); next request had `message_fishball`. |
| Way in 4: `start_session` | PASS | `managed` listed the new session (`start`); its very first agent request already had `message_fishball`. |
| Way out 1: Take back | PASS | `managed` dropped it. Next request had no Fishball tool (header click, row-menu click, and via API with a permission request waiting). |
| Way out 2: `release_session` | PASS | Result `ok, managed:false`; `managed` dropped it; next request had no Fishball tool. |
| A session that is yours: no tool, no text | PASS | Four fresh sessions: no Fishball tool in any model request, no "fishball" anywhere in the request messages/system text. Same after the upgrade and after Take back. |
| Yours: `message_fishball` gives `UNKNOWN_TOOL` | PASS | The call returned `Error: unknown tool "message_fishball"`, error code `UNKNOWN_TOOL`. |
| Yours: permission request | PASS | The host saw one request. Fishball took 0 model steps, the Fishball inbox count did not change, and the session sat on its own prompt. In the browser it showed "Waiting for approval", reason text, **Reject** and **Allow once**. Allow once let the call run ("after"). Same for a session that was taken back (prompt moved to its own session) and one released by `release_session` (after restart). |
| A managed session's permission request reaches Fishball | PASS | Fishball took 1 step, the inbox count rose by 1, and its message was a `[permission request apr_…]` naming the session. Still true after restart. |
| Notes in Fishball's chat | PASS | Hand over, Take back and release each added exactly one notice: two hand-overs, two take-backs and one release gave 2, 2 and 1 notices in Fishball's log. The browser showed the "Fishball notice" entry: "the user handed this session over to you …", followed by the session's id, title and folder in an untrusted block. Take back reads "the user took this session back", release reads "you released this session (release_session)". Send, start and message add no note. |
| Restart | PASS | After a restart on the same home, `managed` still listed the `message` and `start` sessions; the managed ones had `message_fishball` at their next request, the yours and released ones did not. |
| Upgrade | PASS | No session managed at first start (`managed: []`, fresh home). A home written by `a5aed26` (no `managed` field; its plain session had `message_fishball`; its outbox had one `start` entry) rebooted on this checkout: `managed: []`, outbox entry kept, and neither the plain session nor the outbox-started session had a Fishball tool or any "fishball" text. |
| Subagents | PASS | A subagent started by a managed session had no Fishball tools (parent had `message_fishball`). |
| `replyCapShare` 1 refused, old value stays | PASS | `ctx.settings.update` with 1 was refused: `$.replyCapShare expected number >= 2 but got 1`. Value and `state.limits.replyCapShare` stayed 8. |
| `replyCapShare` 2 accepted, live | PASS | Update ok; value and `state.limits.replyCapShare` read 2 at once, `applies: live`, no restart. I set it back to 8. |

## Gaps

- Settings-page list of managed sessions: out of scope as agreed.
- The two `unavailable` items above (Fishball not running) were left to the suite.
- Session messages off: I checked the buttons, the routes and that sessions stay managed. I did not read a managed session's next model request while it was off (suite covers tool removal).
- `replyCapShare` was changed through DSH's settings service (`ctx.settings.update`, which the settings page uses), not by typing in the form.
- Sessions made by the harness land under "Ungrouped" in the sidebar; that is the harness, not the plugin. The sidebar re-collapsed groups between clicks in the browser pane, which made clicking slow but did not affect results.
- I archived a session once by a mis-click in the throwaway DSH and undid it.
