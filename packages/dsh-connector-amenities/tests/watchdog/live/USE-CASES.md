# WD-LIVE: dsh-connector-watchdog on a real DSH

The real amenities bundle is linked beside `dsh-agent-connector` in a booted DSH (the C-WIRE worker with
the interactions extension). Fishball is a stock MCP client; the supervised session and the judge's side
session answer from the scripted fake model. Source: [watchdog-project-notes.md](../../../../../docs/watchdog-project-notes.md)
§2–§3 and the user's decisions of 2026-11-20.

| Row | Technique | What it proves |
|---|---|---|
| WD-L01 | UC | The bundle loads `dsh-connector-watchdog` and `preset-watchdog`; the four tools are listed. |
| WD-L02 | EP | Only the manager may brief or refine; empty purpose, second brief and unbriefed refine are refused; a new manager may replace an old manager's brief. |
| WD-L03 | UC, EP | In scope → allowed with no offer; `settlement {allowed, by: delegate, delegate.name: watchdog}`; the side session's prompt carries purpose, scope and request; the brief and side session id are persisted. |
| WD-L04 | EP | Beyond the purpose and dangerous → rejected; the agent reads the reason; `settlement {rejected}`. |
| WD-L05 | DT | Pass, or an unreadable answer → a normal offer to the manager, no Watchdog settlement. |
| WD-L06 | UC, ST | Drift at a request → rejected, turn stopped, `contributed:dsh-connector-amenities.drift` to the manager; the manager can still message the session. |
| WD-L07 | ST | Paused → nothing judged, request offered; resumed → judged again. |
| WD-L08 | DT | After Take back the brief does not apply: the stock prompt shows; the judge is not asked. |
| WD-L09 | ST | A brief survives a DSH restart. |

Not here: patrol timing (minimum 60 s) is covered over fake timers in `../core.test.mjs`; a real model's judgement is not tested.
