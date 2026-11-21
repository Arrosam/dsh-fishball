# WD-LIVE: dsh-connector-watchdog on a real DSH

The real dsh-connector-watchdog bundle is linked beside `dsh-agent-connector` in a booted DSH (the C-WIRE worker with
the interactions extension). Fishball is a stock MCP client; the supervised session and the judge's side
session answer from the scripted fake model. Source: [watchdog-project-notes.md](../../../../../docs/watchdog-project-notes.md)
§2–§3 and the user's decisions of 2026-11-20.

| Row | Technique | What it proves |
|---|---|---|
| WD-L01 | UC | The bundle loads `dsh-connector-watchdog` and `preset-watchdog`; the five tools are listed (with `watchdog_session_start`, since this connector offers `dshConnectorSessions.start`); `watchdog_brief`'s description mentions `watchdog_session_start`. |
| WD-L02 | EP | Only the manager may brief or refine; empty purpose, second brief and unbriefed refine are refused; a new manager may replace an old manager's brief. |
| WD-L03 | UC, EP | In scope → allowed with no offer; `settlement {allowed, by: delegate, delegate.name: watchdog}`; the side session's prompt carries purpose, scope and request; the brief and side session id are persisted. |
| WD-L04 | EP | Beyond the purpose and dangerous → rejected; the agent reads the reason; `settlement {rejected}`. |
| WD-L05 | DT | Pass → the offer carries `delegate {watchdog, passed, reason}`; an unreadable answer, an unknown verdict or an allow with an empty reason → `delegate {watchdog, failed, judge-unreadable}`; no Watchdog settlement. |
| WD-L06 | UC, ST | Drift at a request → rejected, turn stopped, `contributed:dsh-connector-watchdog.drift` to the manager; its `turn-finished` reads `stop {aborted, 'the turn was cancelled (hook: Watchdog stopped the session (permission): <reason>)'}`; the manager can still message the session. |
| WD-L07 | ST | Paused → nothing judged, request offered; resumed → judged again. |
| WD-L08 | DT | After Take back the brief does not apply: the stock prompt shows; the judge is not asked. |
| WD-L09 | ST | A brief survives a DSH restart. |
| WD-L10 | EP | `watchdog_session_start`'s input schema: `session_start`'s properties plus `purpose` and `scope` (strings); required = `session_start`'s plus `purpose`; closed. |
| WD-L11 | ST | The gap closed (the user, 2026-11-21): a session started with `watchdog_session_start` (answer `supervised: true`) whose first turn's first call asks → judged by Watchdog (allow): `settlement {allowed, by: delegate, delegate.name: watchdog}`, no offer to the manager. |
| WD-L12 | ST | Contrast, the known window: `session_start`, its first request reaches the manager as a plain offer (no `delegate`), and only then `watchdog_brief` (the order is made deterministic by briefing after the offer arrived): the brief succeeds, the waiting request stays with the manager, the judge is not asked. |
| WD-L13 | DT | Refusals over MCP: empty purpose → `empty-purpose`; a start refusal keeps a declared or K2 shared code (`invalid-decision`, `forbidden`, `unknown-session`, `limit-exceeded`) with message `session_start refused: <code>`; `invalid-arguments` (a K2 call code) → `operation-failed`, the K1 code in the message; nothing created. |

`watchdog_session_start`'s own logic (args without purpose/scope, the brief inside `afterManaged`, `managed: false` → `supervised: false`, no `start` → `forbidden`) is in `../core.test.mjs` over a scripted `start`; the connector's `dshConnectorSessions.start` is SRV-START-01…06 in `dsh-connector/tests/interactions/start-cases.mjs`.

Not here: patrol timing (minimum 60 s) is covered over fake timers in `../core.test.mjs`; a real model's judgement is not tested.
