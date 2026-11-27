# rev11g hand check (test session)

Build: `claude/rev11g-ac4f08` (5cfd854) merged with `rebuild/managed-sessions` (829bd4d). Real DSH worker (this checkout's plugin, fake model, no question stand-in, so the real gateway and browser carry the questions), kept up by `test/hand-checks/rev11g-serve.mjs`, with the built-in browser pane on its web page. Server stopped, viewport reset.

## Suite
- Full run 3: 1786 tests, 1785 pass, 1 skipped (an older, known skip), 0 fail. rev11g's own: 96 cases in 8 files (hold 7, flow 15, modes 18, plan 11, validate 30, tags 8, restart 6, cap 1).
- Run 1 had 35 failures, run 2 had 10. All were test bugs, none a code bug:
  - helper bug: the question id was read as the regex capture group (undefined), which failed a third of the files;
  - older files: the snapshot gains `questionMode` (DESIGN §10e) and Permission requests gains `answer_question` (§7a.10): `STATE_KEYS` and `OWN_PLUGINS.approvals.tools` updated (HTP-01, HTP-04/05, SND-01, PHT-01, PHT-04, OWN-01);
  - the session's own card is now passed on untimed (S36-attachWait amendment, manager 2026-11-02), so HLD-01 no longer expects `timed: true`;
  - the confirmed readings: tags store no answer text (QTG-01/02/04 now check `answer` is the word `answer`, `approve` or `keep-planning`, and the snapshot's published record carries Fishball's words); a rebuilt continued card is the user's and Fishball's answer on it is `expired` (RST-04); a `to_user` adds a "Sent to you" tag (so "no tag" means no answer tag, PLN-07/08, FLW-12 now asserts the Sent-to-you tag);
  - `bad-answer` is the route's code for a well-shaped body whose answers are no valid batch (§10e: validated "as answer_question is"); `bad-body` stays for wrong shapes (FLW-14);
  - plan-review cards carry `kind: 'plan-review'` (the design's §9 names only 'question');
  - VAL-05 set approvalAnswerSeconds after the question opened; FLW-04/13 minted a new call id on each use of a helper.

## Done-when items
1. **PASS** In each mode a question behaves as item 25 says; in User mode Fishball's answer is refused (`mode-user`) and its note shows on the card (MOD-04..06, FLW-12, PLN-10). The settings page's mode buttons were not clicked by hand (route and snapshot tested: MOD-02/03).
2. **PASS** attachWait hold, in the suite and in the real browser. A timed question with `timeout: 3` or `5` and `approvalAnswerSeconds` 40: after 8 s and after 20+ s the tool has not returned, no `pending` result, the session's own card is open and shows NO countdown (the card text is just the question, choices, Skip and Submit). Fishball's answer at 7 s returned the batch in the same turn (HLD-01, HLD-05, HLD-04; hand: HC5). After the limit the pile card appeared at 49 s while the session's card stayed open and answerable (HLD-02, HLD-03; hand: HC2).
3. **PASS** 120 s limit measured against `approvalAnswerSeconds` (FLW-07 at 1 s and 3 s, HLD-01..03).
4. **PASS** Answering in the session clears the pile card, and the reverse. By hand: HC2 answered in the browser's own card (Red, Submit) → pile card left, the tool returned in the same turn, no reply message, no tag; HC4 answered on the pile route → the session's card closed and the turn ended; HC7 answered with Send answer on the pile card in Fishball's chat (Blue) → the session's card closed. Suite: FLW-05, FLW-08, FLW-09, PLN-05..07, RST-05/06.
5. **PASS** Real browser, the session's card closing when Fishball's answer wins: legacy question (HC1, answered at 1m 42s: card gone, tool row done), timed question (HC5: card gone), plan review (HC6: "Plan review" panel with Request changes and Approve closed, "Plan approved").
6. **PASS** Tags in the turn tail, not on the question row. Seen in the browser: "Asked Fishball · Blue" (legacy and timed) and "Asked Fishball · plan approved", each at the end of the turn that holds the question; the question row itself carries no tag. Records in the suite: QTG-01..08 (`seq` inside the right turn, parallel legacy calls, bound).
7. **PASS** Plan review: Approve exits plan mode (`/plan off` says already inactive); Keep planning with feedback keeps it on and the agent sees the feedback; Discuss closes the pile card (PLN-02..08; hand: Approve).
8. **PASS** A session that is yours keeps its questions with no Fishball step (FLW-01, PLN-11).
9. **PASS** Fishball or Permission requests off: the question stays in its own card; Fishball takes no step; a waiting one goes back (OFF-01..04).
10. **PASS** The router answers in the browser's exact shape (result byte-identical to a browser answer, FLW-04); a malformed batch is refused and the question stays open (VAL-01 ×13, VAL-03/04, VAL-05, FLW-14).
11. **PASS** A legacy question's call id is recovered from the log and its tag lands in the right turn (QTG-01, QTG-03, QTG-04, FLW-10).
12. **PASS** A blocking question or plan review open at a restart ends with its card (RST-01).
13. **PASS** A continued timed question open at a restart has its pile card again after the start, without resuming the session; it is the user's card (RST-02..06).
14. **PASS** A child agent's question never reaches Fishball (CHD-01).
15. **PASS** Fishball's own `too-many-waiting` answer is the JSON `{ok:false, code:'too-many-waiting'}` with "or withdraw one" (CAP-01).

NOT RUN by hand: the mode buttons on the settings page; Chinese wording; a restart in the browser (suite RST-01..06 covers it); turning Permission requests off with a held timed question and seeing `continued` in the browser (the suite checks off with a blocking question, OFF-02).

## Ambiguities left (none changes the verdict)
- Pile-card kind for plan reviews is `plan-review`, not `question` (§9 lists only `question`).
- The answer words of a tag are published as `answerText` in the snapshot (not in the design); the stored record holds only the word.
- A `to_user` question gets a "Sent to you" tag (the builder's reading of Q-r11-tag-scope; the design's tag list names only escalate).
- A well-shaped route body with no decision (`{questionId}` alone) gets `bad-answer`, not `bad-body`.
