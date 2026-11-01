# rev11d hand checks (test session)

Branch `claude/test-rev11d-9f993c` = rev11d tests + `claude/rev11d-3e302c` (`d60c290`) + `rebuild/managed-sessions` (`8b5f60d`). Not pushed.

## Result: PASS (no code bug found; the first run of stage 2 found one, fixed by the builder: the `grant` schema lacked `additionalProperties`, so Fishball did not load)

## Suite
First full run, `/opt/homebrew/bin/node test/run.mjs` on the merged branch: **tests 1558, suites 186, pass 1540, fail 17, skipped 1** (the known OFM-06 skip). It ran while my hand-check server was also up, so the machine was loaded. All 17 failures were sorted, with no code bug:
- **3 timing flakes under load** (limits-live L56, L57, L58): the file passes alone (with the OWN file: 57 of 57).
- **1 test bug, OWN-01** (`builtin:permission-requests` lists its tools): the plugin now also owns `list_grants` and `revoke_grant` (DESIGN §7a.8, "Fishball's `list_grants` / `revoke_grant` (plugin Permission requests)"); the constant is updated, the file passes.
- **13 failures in my own new rev11d cases**, all test bugs, fixed (each commit message says why):
  - GRT-07: the notice needle of a changed exact call matched the creating request; each variant now carries its own marker.
  - GRT-08 `terminal_send`: its command text is in `text` (the builder's reading, confirmed by the manager), so the fixture call and the grant now use `text`.
  - GRT-09 / GRT-10: a schema-level refusal ("grant.kind must be one of …") is a refusal too, so a refusal is either `ok:false` with a code or an "invalid arguments" error, and the request stays pending; a refused `create` now ends its turn; reject answers carry `risk` (every decision except escalate and ask needs it).
  - `run_code` is a PTC-mode DSH built-in that no fixture can stand in for ("unknown tool"); `demo_echo` stands in for "every other tool" in the exact-only cases (CASES.md A-r11d-8).
  - END-01: a 4 s end time ran out during the set-up; now 9 s. END-08: sessions are resumed after the restart. REG-01/02: the `escalate` audit row appears when the request ends, so it is read after the agent finishes.
- Final: `rev11d-grants` 35 of 35, `rev11d-end` 8 of 8, `rev11d-regress` 3 of 3 pass. The rest of the suite was not re-run as one whole after the test fixes (the touched files were re-run in full).

## Done-when items (rev11d row)
Driven in a real DSH worker (this checkout's plugin, fake model, scripted stock prompt after the broker, the shell fixtures asking in their body) kept up by `test/hand-checks/rev11d-serve.mjs`, with the built-in browser pane on its web page.
1. **PASS** An `npm test*` grant (`answer_approval` grant, prefix `npm test*`, +1 h) answered ok with a `grt_…` id. Six following runs (`npm test`, `npm test -- --watch=false`, `npm testing x`, `--a`, `--b`, `npm test && git push --dry-run`) all returned `outcome=allowed-once`, with **0** new Fishball model steps and no notice. Snapshot: `uses` 6, `lastUsedAt` set, `prefix` stored as `npm test` (the star dropped).
2. **PASS** `npm test && git push --dry-run` is covered (in the run above).
3. **PASS** Refusals: by hand, a prefix grant on `demo_echo` answered `prefix-not-shell-tool` and the request stayed pending (a later reject was then answered by the code's own `risk-required`, i.e. still pending). The rest of the refusals (prefix on `terminal_open`, no / past / garbage end time, unknown kind, empty prefix, prefix not in the call, risk high, empty reason) and the accepted ones (`pwsh`, `terminal_send` prefix, exact on `terminal_open` and `demo_echo`, a year-long end time, three active grants) are checked by the suite (GRT-08 to GRT-11), not repeated by hand; the exact grant on `fbtest_ask` and its list row were seen by hand.
4. **PASS** Endings: expiry (a 25 s grant left the list on its own and the next run reached Fishball); your Revoke click in the list (row left, stored `revoked` by `user`, `decisions` row `revoke` by `user`, next run to Fishball); Fishball's `revoke_grant`, Take back and `release_session` and a second revoke / unknown id: suite END-02 to END-05.
5. **PASS** Survives a restart: after rebooting the worker the same grants are listed with the same end time and `uses`, both sessions still managed, and a call ran on the grant with 0 Fishball steps. A grant past its end time during a restart is not honoured (END-08).
6. **PASS** Pause: with Permission requests turned off the list marks each grant `paused: true`, the covered call showed the session's stock prompt (once), no Fishball step, no new use; turned back on, `paused: false`, the end time unchanged, and the same grant covered the next call. Fishball not live: END-07.
7. **PASS** Audit and `decisions`: `decisions` rows `grant` by `fishball` (with the grant id), `revoke` by `user`; the approvals audit holds `grant` for the creating request and `grant-used` per covered call (GRT-02 counts five).
8. **PASS** One tag per covered call: the stored `tags` rows have kind `grant` with `{kind, toolName, prefix}`; in the browser the session's turn tail shows "Allowed by Fishball's grant: npm test*" for covered calls and "Asked Fishball · granted (standing grant)" on the grant answer.
9. **PASS** The grants list in Fishball's chat above the composer: "Standing grants (1)", session title, tool, `npm test*` (or "exact fbtest_ask call"), "ends 02/11/2026, 03:59:37 · used 1 times", and Revoke; clicking Revoke removed it at once.
10. **PASS** rev11b escalate and ask fix: escalate with no `risk` and no `reason`, and `ask` with only its question, are accepted (REG-01, REG-02, REG-03).

## Not run by hand
- `run_code` itself (a PTC-mode built-in): the refusal of a prefix grant and acceptance of an exact grant are covered with `demo_echo` standing in.
- Light theme (dark only); the settings page's "Active standing grants: n" line and audit labels; 30+ grants in the scrolling list (the suite checks three active at once).

## Notes for the manager
- `list_grants`' `{grants:[…]}` shape and a few field names were read tolerantly (CASES.md A-r11d-1, 2).
- The audit rows a `reject` by Fishball when the request had timed out showed up as `decisions` `reject` by `user` in my server: that is the scripted stock prompt answering, not a rev11d issue.
