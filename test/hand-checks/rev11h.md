# rev11h hand checks (stop and redirect)

Merged: `rebuild/managed-sessions` (a9c492b), then `c811a89` (rev11h b416d3e merged with rebuild; no conflicts after that).

## Suite
- First full run: 1802 tests, 1798 pass, 3 fail, 1 skipped.
  - OWN-01 (test bug, fixed): Session messages now has `stop_session` and `redirect_session` (the manager's settled choice), so `OWN_PLUGINS.messages.tools` in `test/support/constants.mjs` gained both.
  - STP-02 (test bug, fixed): an `ask_fishball` call has no DSH approval event, so "settled cancelled" was asserted on the wrong thing. STP-02 now checks the call ended aborted; new STP-02b makes a direct call wait for Fishball and checks `approval/decided` is `cancelled`.
  - FLW-12 (rev11g, timing): failed once, passes alone (rev11g-flow: 62 pass with own-plugins). Not rev11h.
- Added assertions for the settled choices: `stopped` true/false, decisions outcome `ok`/`idle`, outbox kind `redirect`.
- Second full run: 1803 tests, 1802 pass, 0 fail, 1 skipped.
- `test/rev11h-stop.test.mjs`: 17 tests, all pass.

## Done-when item 9 (and the rev11h row)
Checked in a real DSH 0.2.1-rc.2 runtime with the fake model (the test host). Stage 2 follow-up added ORG-01, OFF-01 and the browser label check; `test/rev11h-stop.test.mjs` now has 19 tests, all passing. The shared helpers did not change, so the full suite was not re-run after them (last full run: 1802 pass, 0 fail).

| Item | Result | What I did / saw |
|---|---|---|
| stop_session ends a running managed turn, aborted, session stays managed and idle | PASS | STP-01 |
| pending approval settles cancelled; card leaves | PASS | STP-02, STP-02b |
| pending question settles ASK_ABORTED; pile and own cards leave; late answers refused | PASS | STP-03 |
| stopping an idle session changes nothing | PASS | STP-04 (`stopped:false`, outcome `idle`, no turn end) |
| message queued before stop stays parked until next wake | PASS | STP-05, STP-06 |
| redirect stops turn, new turn from Fishball | PASS | RDR-01, RDR-02, RDR-06 |
| queued message runs before the instruction | PASS | RDR-03 |
| both refuse yours / Fishball's own | PASS | STP-07, RDR-04 (`not-managed`, `is-fishball`) |
| both audited | PASS | STP-08, RDR-05 (decisions + outbox kind `redirect`) |
| no cap on stop; redirect counts toward messagesPerHour | PASS | CAP-01, CAP-02 |
| permission request from a redirected turn names "Fishball (redirect_session)" | PASS | ORG-01 (header matches, not message_session) |
| Session messages off: both tools refused, nothing stopped or audited | PASS | OFF-01. With the plugin off the tool is hidden from Fishball (DSH's "not available" error); the `feature-off` code itself only shows for a call already running when it goes off, which the harness cannot time, so that part is NOT RUN |
| settings page outbox shows Redirect / 重定向 | PASS | built-in browser pane on a test host (real DSH, fake model) after one `redirect_session`: Plugins > Installed > dsh-fishball page, "Sent by Fishball" lists "Redirect session-… Delivered"; with Language 中文 the list reads "重定向 … 已送达" under "Fishball 发出的". Server stopped, tab closed |
