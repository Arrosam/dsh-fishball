# rev11f hand check (test session)

Build: `claude/rev11f-dc5b62` (c75112c) merged with `rebuild/managed-sessions` (a4f0e0b). Real DSH worker (this checkout's plugin, fake model, scripted stock prompt after the broker, settings fixtures, `demo_echo` asking in its body) kept up by `test/hand-checks/rev11f-serve.mjs`, with the built-in browser pane on its web page. Server stopped.

## Suite
- Full run 2: 1687 tests, 1674 pass, 12 fail; all 12 are rev11e's: APR-03, APR-04, APR-08, APR-10, DCD-08, FRZ-02 to FRZ-07, L31. APR-03/04/10 and L31 are the known ones. DCD-08 is fixed on `claude/test-rev11e-a6ba37`, which this branch has not merged. FRZ-02 to 07 fail identically on the rev11e build `c6e667f` with the same tests (checked in a scratch worktree), so they are not caused by rev11f.
- rev11f's own 35 cases (request 15, scope 7, detail 8, cap 5) all pass, alone and in the suite. Older files touched: approvals-routing (RTE-01, RTE-04), own-plugins (tool list), rev11c-leave LVE-06 pass.
- Run 1 had 33 failures; 15 were test bugs of mine against the confirmed readings, fixed (see commits): the waiting wording (the result's `note` says "waits for the user's approval"), the install's second card (`set_plugin_enabled`), `why` for the reason bound, the plain-text `too-many-waiting` answer, the `remove_plugin` plugin key, the audit row now kept for own requests (kind `own`), the tool list of Permission requests.

## Done-when items
1. **PASS** `add_plugin` returns at once with a card; Fishball answers another message meanwhile. Seen: result `waiting-for-approval` in 139 ms, card "Fishball asks [Fishball] add_plugin" with exact arguments and "Reason", "Waiting for you (1)", no stock prompt; another message answered in 86 ms with the card still there (OWN-01, OWN-02).
2. **PASS** Allow wakes Fishball; the identical retry runs with no second card; a changed argument makes a new card. Seen in the browser: Allow once clicked, "run it again" notice naming the request and the exact call, the retry (keys in another order) installed `fbtest-added`; the install then raised the confirmed second card `set_plugin_enabled {plugin, on:true}` with the tool list. Changed argument, one-time pass: OWN-09, SCP-03.
3. **PASS** Reject reaches Fishball without starting a turn (OWN-07, SCP-07; no model step in 1 s, next turn carries the notice).
4. **PASS** A restart before the click leaves the card (same id), and Allow after it works (seen by hand: card kept, Allow 200, retry installed `fbtest-added-b`; OWN-11).
5. **PASS** Withdraw removes the card (OWN-08: 409 `expired` afterwards, refusal of a second withdraw, an unknown id and a session's card).
6. **PASS** Never-asking mode refuses with no card (OWN-10).
7. **PASS** `set_plugin_settings`, turning on one of Fishball's own plugins and a plugin tool that asks each return a card at once, never a prompt (SCP-01 to SCP-07).
8. **PASS** Detail list bound at, just under and just over `argumentExcerptBytes`, a first entry over the bound, one over-long entry (DET-01 to DET-07). The card's list showed in the browser under the arguments.
9. **PASS** Fishball's own cards count toward the cap and `too-many-waiting` ("or withdraw one") follows (CAP-01 to CAP-05, LVE-06).

NOT RUN by hand: Reject and Withdraw clicks in the browser (covered by the route tests); Chinese wording.

## Ambiguities left
- The `too-many-waiting` answer is plain text, not the JSON `{ok:false, code}` of the waiting answer; the tests accept either.
