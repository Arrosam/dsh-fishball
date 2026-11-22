# fishball-core tests: events

What core does with the events it polls from each target's mailbox: the interception service
(`fishballInstance.events.intercept`, K3 `contracts/events.d.ts`), the acceptance ledger
(`STATE`, `LEDGER` in `contracts/constants.js`), the one wake of the Fishball agent per event, the
presenter retry and give-up, recovery after a crash, MULTI-1's per-target tuples and wake batching
(`WAKE`). The case index with techniques and oracles is [USE-CASES.md](<USE-CASES.md>); entry
[../events.test.mjs](<../events.test.mjs>).

| file | rows |
|---|---|
| [cases.mjs](<cases.mjs>) | EVT-UC-02, EVT-UC-03, EVT-EP-03, EVT-EP-05, EVT-DT-02…04, EVT-ST-02 (incl. the close() rows 5h–5k and the decisions of 2026-11-14) |
| [rfix.mjs](<rfix.mjs>) | RFIX-F11-ST-01, RFIX-F14-DT-01 |
| [multi.mjs](<multi.mjs>), [retired.mjs](<retired.mjs>) | MULTI-EVT-EP-01, -DT-01, -ST-01, MULTI-EVT-RETIRED-ST-01 |
| [batch.mjs](<batch.mjs>) | WAKE-EVT-* (the wake batching design of 2026-11-21) |

## How it is observed

One in-process Fishball DSH of the current DSH's real parts ([world.mjs](<world.mjs>): cordis, sessions with
JSONL persistence, storage domain over storage-json, the agent loop, dsh-llm), imported by name through
`fishball-test-helpers/dsh` ([../support/events-dsh.mjs](<../support/events-dsh.mjs>)). Core's
`src/events/` is imported bound to that DSH (`fishball-test-helpers/bind`) and composed with ports in
[subject.mjs](<subject.mjs>). The only fakes: a scripted model that records each request; the target
mailbox (K1 `inbox_poll` / `inbox_ack` shapes from `fishball-test-helpers/connector-contract/mcp-schema`)
over a durable file; interceptor plugins that are real cordis fibers. Oracles are public: durable
`user/message` admissions in the Fishball session log, ack receipts at the mailbox, model requests,
the logger exporter's lines, and the ledger table by its contract name.

Crash rows ([crash.mjs](<crash.mjs>), [retired.mjs](<retired.mjs>)) SIGKILL a real child process holding one world and
reopen the same root in a second one (the child inherits FBTEST_DSH_VERSION). Wake batching runs on an
injected fake clock (`fakeClock`); one row keeps the real clock.

[constants.mjs](<constants.mjs>) holds every value (K1, K3, DSH vocabulary, fixture data, harness waits). Its
`WAKE_CONTRACT` (with the 0 s window for the pre-batching rows) is also what core's other areas import
when they need the batching option (bridge/world.mjs does).

## Regression rows

EVT-ST-02 5h–5k (close() while an offer is in flight: f1dc747e, 0daf0370, 55cab94a), MULTI-EVT-RETIRED-ST-01
(a721df21) and RFIX-F11 / RFIX-F14 (45e8d398) fail against the commit before each fix and pass now:
see `.runtime/port/port-core-events-failures.md`.

## Not ported

- EVT-UC-02 E4 (inbox removal) and EVT-EP-03 rows 6 (not ready) and 7 (external agent) were `todo`
  placeholders for E2E-CORE, F-WIRE and C-MAILBOX: C-MAILBOX left with the connector (6b7c53bf); the
  not-ready path and the browser removal flow have no planned owner in this repository's tests.
- EVT-ST-02 11 (queued) was withdrawn by WAKE-BATCH item 5; WAKE-EVT-DT-02 'busy, user queued' replaces it.
