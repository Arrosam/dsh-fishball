# rev11c hand checks (test session)

Branch `claude/test-rev11c-082bd1` = rev11b head + `git merge claude/rev11c-29ccbf` (`b3fbbc5`) + `git merge rebuild/managed-sessions` (`9385656`). Not pushed.

## Suite
`/opt/homebrew/bin/node test/run.mjs` (background, while the hand checks ran): **tests 1512, suites 182, pass 1509, fail 2, skipped 1** (the known OFM-06 skip). Both failures were **test bugs** in my own new cases, fixed; the two files then passed alone (`rev11c-leave` 9/9, `rev11c-tags` 10/10):
- LVE-03: it made the agent's follow-up call in a new turn; a to-you ticket ends with the turn (§7a.6), so the call rightly went to Fishball. Now the call is made in the same turn as the `unavailable` answer, as rev11b's cases do.
- TAG-11: ran after TAG-10's restart without resuming the session ("no live agent"). Now resumes it.
No code bug found. (Final counts after the fixes were not re-run as one full suite; the touched files were re-run in full.)

## How I drove it
A real DSH worker (this checkout's plugin, fake model, scripted stock prompt after the broker) kept up by `test/hand-checks/rev11c-serve.mjs`, driven by my command file, with the built-in browser pane on its web page (800x600 and 1200x900). Requests are raised with the suite's `fbtest_ask` tool and Fishball's answers are real `answer_approval` calls from its fake model. Server stopped, no stray processes.

## Done-when items (rev11c row)
1. **PASS** Three managed sessions escalate: pile "Waiting for you (3)" above Fishball's composer, newest first, each card with session, "Asked first", tool, JSON arguments, Reason, "Fishball: <note>", Allow once / Reject.
2. **PASS** Allow once on a card: that session's `ask_fishball` returned `allowed`, its identical call ran (`outcome=allowed-once`) with no prompt; card left (count 2); `decisions` row allow-once by user.
3. **PASS** Reject with a note: clicking Reject opens "Note to the agent (optional)" with Allow once / Reject / Cancel; typed `not now <b>x</b>`; agent got `rejected` with that exact reason; `decisions` row reject, `withNote: true`.
4. **PASS** Answer in either place: Allow once on the running `ask_fishball` row in the session's own chat (row reads "Ask Fishball · … · Waiting for you" with the buttons) took the card out of the pile (3 → 2); Reject on the pile card gave the agent `rejected` and the row lost its buttons (answered through the route for the last one; the turn then showed its tags). A second click on a gone card: 409 `expired`.
5. **PASS** A card leaves when its turn is stopped (cancel, the Stop button's path: pile 0, audit `escalate` / `cancelled`, a late click 409); on Take back (`no-longer-managed`, audit `released`); after a restart (pile empty, 6 sessions still managed, tags kept).
6. **PASS** Cap: `maxPendingApprovals` 2 with two cards: a third session's `ask_fishball` → `over-capacity` at once, no notice to Fishball, its next call showed the stock prompt once. Fishball's own `set_plugin_enabled` → "too-many-waiting: …Try it again once the user has answered some…" at once, DSH not asked (the manager's reading b).
7. **PASS** Timeout and escalate land in the pile: `approvalAnswerSeconds` 3: a card after 2.9 s, empty note, agent still running, no stock prompt, no tag (reading c). Escalate: card with Fishball's reason as the note.
8. **PASS** Nothing renders as markup: `<b>`, `<img onerror>`, `**bold**`, `[link](…)` in the arguments, reason and Fishball's note show as literal characters on cards and rows; no alert; the reject note with `<b>` reached the agent unchanged.
9. **PASS** Tags: allow → "Asked Fishball · allowed once", reject → "· rejected", ask → "· asked a question" (the reply round has its own), a direct call Fishball allowed → "· allowed once" (the result carries the hint); escalate → "Sent to you" in its own turn's tail. Visible in the finished, folded turn ("Completed in …"). After a DSH restart the old turns still show them (5 tags in the turn); `tags` in the snapshot kept all 14 rows.
10. **PASS** "Sent to you" only on Fishball's escalate (audit and tag); a timeout gives none.
11. **PASS** `pileMaxHeightVh`: six cards at 800x600: the pile stops at about 45% (title on top, scrolls), composer in view. Set to 20 live: it shrinks with no restart. (Default, minimum 1 and 0 / fraction refused: PIL-09 in the suite.)
12. **PASS** Permission requests turned off with cards waiting: all cards left, each agent got `unavailable` (the agent's own call then goes to its stock prompt, LVE-03). Fishball stopped (archive): LVE-04 in the suite (not repeated by hand).

## Not run by hand
- Undelivered notice → card (needs a full Fishball queue); not covered by the suite either.
- Fishball archived with a card waiting: suite only.
- Light theme (checked in dark only).
