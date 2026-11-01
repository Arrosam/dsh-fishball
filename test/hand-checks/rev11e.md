# rev11e hand checks (test session)

Branch `claude/test-rev11e-a6ba37` = rev11e tests + `claude/rev11e-7d7a1d` (`c6e667f`) + `rebuild/managed-sessions` (`15c8e6e`). Not pushed.

## Result: PASS (final run, see "Re-run after the fixes"; the sections below record the first run)

## Suite
Second full run `/opt/homebrew/bin/node test/run.mjs` after the test fixes: **tests 1594, pass 1589, fail 4, skipped 1**. The first run (before the fixes) had 14 failures: 7 were my frozen-list reader (`arguments` live in the untrusted `details` text, A-r11e-1), 2 my own test bugs in DCD-08 (call id regenerated), 1 APR-08 (a session that became managed no longer shows a stock prompt: now taken back before the second prompt), 1 APR-10 (see below), RTE-04 and OWN-01 (older cases changed on purpose, see commits), and L31.
Remaining failures:
- **APR-03b, APR-04b: CODE BUG.** After `answer_prompt` the session is managed (`by: prompt-answer`, the next *turn* has the three tools), but the model request that follows the answered call *in the same turn* has none of them (`message_fishball`, `ask_fishball`, `list_user_messages` all missing, 24 tools before and after). Done-when: "its next model request has the three tools"; a hand-over mid-turn gives them from the next step (MGD-15). Steps: show a prompt in a session that is yours, `answer_prompt` allow, look at the tools of the session's last request. Likely cause: the registry/tool registration happens after the prompt settles, so the agent builds the next request first.
- **L31 (rev11-limits): CODE, to decide.** `replyCapShare` 2 with a 40000 window answers 409 `window-too-small`. It passes on `15c8e6e` and fails on `c6e667f`, so rev11e's added persona lines and two tools grew Fishball's prompt+tools envelope past what that window allows (§6: the smallest window depends on the prompt and tools). Either the envelope growth is trimmed, or the manager accepts a new boundary for L31 (not changed by me).
- **FIR-03, W3** (watches fire): load flakes; `watches-fire` alone 48 of 48.

## Done-when items (rev11e row)
Driven in a real DSH worker (`rev11e-serve.mjs`, fake model, scripted stock prompt held to stand in for a browser prompt) with the built-in browser on its page.
1. **PASS** `list_frozen_sessions` lists a prompt in a session that is yours: `prompt_id`, `session_id`, `managed:false`, `tool:"fbtest_ask"`, `arguments_status:"complete"`, exact arguments in `details`. Fishball took **0** steps while the prompt showed (suite FRZ-02 too).
2. **PASS** `answer_prompt` allow with risk high: `allow-needs-low-risk`, prompt stays; allow low: prompt closed, call ran (`outcome=allowed-once`).
3. **PASS** reject (suite APR-02): prompt closes, agent sees "Fishball rejected this call: <reason>"; refusals (APR-05) leave it showing.
4. **FAIL (code)** the session is managed (`by: prompt-answer`, next turn has the three tools, Fishball's result says "now managed by you"), but not in the same turn's next request (APR-03b/04b above). The managed-list label "Prompt answered by Fishball" is in the client bundle (APR-12); not looked at on the settings page by hand.
5. **PASS** after your own click the entry leaves the list (FRZ-05, 06); a late `answer_prompt` is refused.
6. **PASS** a direct call sent to you (escalate) in a managed session: the pile card "Direct call · fbtest_ask" with the arguments, the agent's reason and "Fishball: needs you" showed above the composer in the browser, and the stock prompt was showing; "Allow once" on the card closed the prompt and cleared the card; the call ran. Either side answering clears both (DCD-02 to 05, 10), timeout (DCD-06), stopped turn (DCD-07), cap (DCD-08), Permission requests off (DCD-09), undeliverable notice (DCD-11).
7. **PASS** tags in the session's turn tail in the browser: "Answered by Fishball: allowed once" for the `answer_prompt` answer and "Sent to you" for the escalated direct call; tag records kind `prompt` (callId = the frozen call) and `decisions` row `answer-prompt` by fishball.

## Unclear for the manager
- **Approvals audit row of kind `prompt`.** DESIGN §9 lists kind `prompt` for approvals rows; the build writes only the `decisions` row (builder's note). Requirements say every prompt answer goes "in the audit list". APR-10 requires only the `decisions` row (A-r11e-8).

## Not run by hand
Settings page managed list; real browser prompt (a scripted held prompt stands in; S33 did the real one).

## Re-run after the fixes
Merged `claude/rev11e-7d7a1d` (`2edee60`) and `rebuild/managed-sessions` (`20fafc4`). Full suite: **tests 1655, pass 1654, fail 0, skipped 1** (the known OFM-06).
- APR-03b, APR-04b pass: the model request after the answered call, in the same turn, has `ask_fishball`, `list_user_messages` and `message_fishball` (also seen by hand with a debug run: the three tools listed in the turn's last request).
- APR-10 passes with both rows (`decisions` `answer-prompt` and approvals rows of kind `prompt`).
- L31 was a test fixture bug (manager 2026-11-02): window raised to 60000 (64000 would make floor(N/2) equal `defaultReplyCapTokens` and hide the effect; 60000 leaves ~10,200 tokens of room). Share 2 accepted and applied live; 1 refused.
- Done-when item 4 now PASS.
