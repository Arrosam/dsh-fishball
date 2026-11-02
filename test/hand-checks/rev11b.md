# rev11b hand checks (test session)

Branch `claude/test-rev11b-71f563` = `ecc9bae` + `git merge --no-ff claude/rev11b-21f5cd` (brings in `0c01133`). Not pushed.

## Suite
`/opt/homebrew/bin/node test/run.mjs`, run in the background while I did the hand checks (other suites may have been running too):
**tests 1461, suites 175, pass 1460, fail 0, cancelled 0, skipped 1** (the known OFM-06 skip). No timing-sensitive failures, so no single-file reruns.

## How I drove it
A real DSH worker (this checkout's plugin linked in, fake model, scripted stand-in for the stock prompt after Fishball's broker), played by my own scripts:
- `test/hand-checks/rev11b-drive.mjs [main|off|ptc]`: Fishball's answers are real `answer_approval` calls in Fishball's session; every agent result and Fishball notice below is the raw text seen. (`ptc` boots with `DSH_TOOLS_MODE=ptc` for `run_code`.)
- `test/hand-checks/rev11b-serve.mjs`: keeps that DSH up for the browser pane (Fishball's chat → "Fishball settings" → Permission requests → "Managed sessions").
Requests are raised with the suite's `fbtest_ask` tool (its body asks DSH for approval, like a bash call needing escalation) because the harness sandbox cannot run a real `bash` escalation. All servers stopped, no stray processes.

## rev11b: the ten cases
1. **PASS** `list_user_messages` and quotes.
   - Lists only typed messages, newest first, with id, time and excerpt (the notice and runtime-context entries are not listed).
   - A quote of a typed id: Fishball's notice has `quoted_user_messages: [{id, text: <full text>}]`.
   - Quote of a `runtime-context` id gives `not-user-message` ("Nothing was sent"), and Fishball got no notice.
   - `userMessagesListed` 2 and `userMessageExcerptChars` 5 set through settings: the next call returned 2 messages with 5-character excerpts, no restart.
2. **PASS** Allow, reject, ask, escalate.
   - Allow: agent got `allowed`; the identical call then ran with no stock prompt and no second notice (audit: an `asked/allow` row, then a `pass` row).
   - Reject with an empty reason gave `reason-required` and the request stayed pending. With a reason, the agent got `rejected` + reason.
   - Ask: 3 question rounds, then allow. The agent saw `question` with the same request id each time. Fishball's last round carried the whole thread in order (q1, reply, q2, reply, q3, reply). The final `allowed` covered the call (no stock prompt).
   - Escalate gave `to-user` (request_id + "make the call yourself; the user is asked in this session"), then the stock prompt showed once with no new Fishball notice.
3. **PASS** Pass. Allow, then the same call with one argument changed went to Fishball again as a "direct call" (new `apr_`). An allow never used: the next turn's identical call went to Fishball again (a new `apr_`).
4. **PASS** Direct call with the hint.
   - Fishball got "a direct call" with `latest_user_message` and `reason_given`.
   - Allow: the result read `outcome=allowed-once` then "Fishball approved this call once. Next time, call ask_fishball before a call that needs approval, and explain why it is needed."
   - Inside `run_code` (ptc host): the program got the plain value; the hint arrived as a separate `fishball-notice` message after the result. A reject was thrown as "Fishball rejected this call: <reason>" + hint. An ask was thrown with the request id, the question and the ask_fishball instruction.
5. **PASS** Retry after a reject. Result "Fishball rejected this call: not now" + hint, with no "the user rejected". The identical retry reached Fishball again (a different `apr_`).
6. **PASS** Direct call answered with ask: an error result naming `apr_…` and the question. `ask_fishball({request_id, reply})` put the reply in the same thread, then allow gave `allowed`, and the identical call ran with no stock prompt.
7. **PASS** (one note, see Gaps 1) Fishball off or slow.
   - A request waiting when Permission requests was turned off: the ask answered `unavailable`, the direct call showed its stock prompt.
   - A request waiting when Fishball was archived: the ask answered `unavailable`, the direct call showed its stock prompt.
   - `ask_fishball` while Fishball was archived: `unavailable` in about 100 ms. After unarchive, a request reached Fishball again.
   - `approvalAnswerSeconds` 5, no answer: ask gave `to-user` after 5.4 s; a direct call showed the stock prompt after 5.1 s.
8. **PASS** Take back while the ask waited: `no-longer-managed` with the request id; audit answer `released`.
9. **PASS** `maxMessageBytes` 2000, quote of a 2500-byte message: `too-large` in about 100 ms, no notice in Fishball.
10. **PASS** Your clicks. After an escalate, the scripted stock prompt allowed once: a `decisions` row `allow-once`, by `user`, target = the request id. Rejecting gave `reject`, by `user`, target = the request id. A timeout case had the same shape.

Also:
- **PASS** A session that is yours (never handed over): its request showed `ask_fishball`, `list_user_messages` and `message_fishball` for none of the three; it was answered by the stock prompt only; Fishball got 0 notices. The managed session's request offered all three.
- **PASS** Persona: `src/persona.js` now says "reject with a reason the session sees, ask the session a question…, or escalate", the "beyond the request and dangerous" rule, and "quotes never grant". There is no "cannot reject" text anywhere in the shipped source.

## Managed sessions list (browser pane, real settings page)
- **PASS** Empty: "Nothing yet." under "Managed sessions" (the page has a second "Nothing yet." for the audit list).
- **PASS** One row per managed session, newest first (4 sessions, order by "since").
- **PASS** Row: title; or the session id in code style when DSH has not named it yet (a session handed over before its first turn); the tag; "since <local time>".
- **PASS** Tags seen live: "Handed over by you", "Messaged by Fishball".
- **PASS** A rename (DSH's session-title service) showed on the page with no reload or restart.
- **PASS** "Take back from Fishball" is on every row while Session messages is on and Fishball is live; gone while Session messages is off (rows still listed); gone while Fishball is archived (rows still listed, page still reachable from Plugins → Installed → dsh-fishball).
- **PASS** Refused Take back: with the page's snapshot frozen (so it was stale) and Session messages turned off in the server, clicking Take back showed the "Managed by Fishball" dialog, "Fishball's Session messages plugin is off.", over the settings page, with Close.
- **PASS** Wording: every string (heading, hint, four by-tags, `since {at}`, approvalsHint, takeBack, nothingYet), in English and Chinese, is identical to `client.js` at the approved commit 36d9ee2 (diff of each key empty). I rendered English only.

## Gaps and notes
1. **Unclear.** With Permission requests turned off and no request in flight, the next model request no longer lists `ask_fishball` (DESIGN §5e registers the tools only while the plugin runs), so a new call gets `Error: unknown tool "ask_fishball"` instead of `unavailable`. `unavailable` came for calls already waiting and while Fishball is archived. The builder's notes document this reading; the §14 rev11b wording ("Fishball or Permission requests off: `ask_fishball` answers `unavailable` at once") can be read either way. The manager should confirm.
2. **Unclear.** `answer_approval`'s schema requires `risk` and `reason` for every decision, so `escalate` without them is refused (`invalid arguments: missing required property "risk"`). DESIGN §7a.3's table says escalate needs "None". The suite's ASK-04 passes `risk: 'high', reason: ''`, so the suite treats this as inherited from P7. Not a code bug against a stated rule; flagging the ambiguity.
3. Your clicks (case 10) were the harness's scripted stock prompt, not clicks in the browser pane. The recorded row is the same code path, but I did not click a real prompt in a browser.
4. Tags "Sent by you" and "Started by Fishball" were not seen live (only the two above); no Chinese rendering was looked at in the browser.
5. "Hand over to Fishball" in the session menu was not clicked; the Host route it calls (`POST /api/fishball/managed`) was used.
