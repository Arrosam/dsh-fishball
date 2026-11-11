# Fishball V3: test cases (requirements-only)

Status: **draft, 2026-11-11.** Written from [v3-requirements.md](<../../planning/v3-requirements.md>)
and [v3-design.md](<../../planning/v3-design.md>) at `e1e5577` (final design; first drafted at
`ddd34c3`, then fast-forwarded and re-read for the Q33 change) only. No implementation code was
read. The requirements are the authority. The design is used only where a requirement defers to it
(for example R-TOK-05 → design §5.3) or for a proposed name that is still review vocabulary until
V3-K; such expectations carry the flag `D§n`.

**Q33 is decided B** (requirements §1.15, R-WD-03, R-WD-15): Watchdog is assigned passively.
There is no `watchdog_check_now`; `watchdog_brief` / `watchdog_refine` are data-only and start no
run; `watchdog_pause` / `watchdog_resume` start no run either. Cases that pin this carry `Q33`.
No requirement question remains open in the requirements document.

## Files

| # | Area | File |
| --- | --- | --- |
| 1 | OAuth client credentials, tokens, pairing | [01-auth-pairing.md](<01-auth-pairing.md>) |
| 2 | Names | [02-names.md](<02-names.md>) |
| 3 | Hand over / Take back | [03-handover.md](<03-handover.md>) |
| 4 | `fishball-events`, exactly-one delivery, interception | [04-events-interception.md](<04-events-interception.md>) |
| 5 | Watchdog activation, decisions, failure | [05-watchdog.md](<05-watchdog.md>) |
| 6 | Watching = managing | [06-watch.md](<06-watch.md>) |
| 7 | Contributor tools and events | [07-contributors.md](<07-contributors.md>) |
| 8 | Hosted launch, token per pairing, reinstall takeover | [08-hosted.md](<08-hosted.md>) |
| 9 | Standalone Fishball and remote DSH | [09-standalone-remote.md](<09-standalone-remote.md>) |
| 10 | Embed-UI and the install matrix | [10-embed-ui-matrix.md](<10-embed-ui-matrix.md>) |
| 11 | Everything else (protocol, routing rest, plugin set, placement, board, fold-notify, migration, compatibility, security) | [11-platform.md](<11-platform.md>) |
| — | Traceability: requirement → cases | [traceability.md](<traceability.md>) |
| — | Gaps and contradictions found while writing the cases | [questions.md](<questions.md>) |

The parallel-development task table that consumes these cases is
[v3-tasks.md](<../../planning/v3-tasks.md>).

## Counts

147 cases. A UC, DT or ST case holds many rows (flows, rules, transitions); the counts below are
cases, not rows.

| Area | UC | EP | BVA | DT | ST | Total |
| --- | --- | --- | --- | --- | --- | --- |
| AUTH (OAuth, tokens, pairing) | 9 | 7 | 5 | 6 | 3 | 30 |
| NAME | 3 | 3 | 3 | 3 | 1 | 13 |
| HAND (Hand over / Take back) | 4 | 1 | 0 | 2 | 1 | 8 |
| EVT (events, interception) | 3 | 3 | 2 | 3 | 2 | 13 |
| WD (Watchdog) | 7 | 4 | 3 | 2 | 3 | 19 |
| WATCH | 3 | 1 | 0 | 0 | 1 | 5 |
| EXT (contributors) | 4 | 4 | 4 | 3 | 1 | 16 |
| HOST (hosted mode) | 7 | 2 | 0 | 2 | 2 | 13 |
| REM (standalone, remote) | 3 | 3 | 0 | 1 | 0 | 7 |
| UIM (embed-UI, install matrix) | 3 | 1 | 0 | 1 | 0 | 5 |
| PLAT (rest) | 6 | 6 | 2 | 3 | 1 | 18 |
| **Total** | **52** | **35** | **19** | **26** | **15** | **147** |

Levels (a case may span two): unit 51, integration 97, e2e 19. Provisional on a spike (`P:Sn`): 34.

## Conventions

**Case ids.** `<AREA>-<TECHNIQUE>-<nn>`. Areas: `AUTH`, `NAME`, `HAND`, `EVT`, `WD`, `WATCH`, `EXT`,
`HOST`, `REM`, `UIM`, `PLAT`. Techniques, and only these five:

| Code | Technique |
| --- | --- |
| `UC` | Use Case (actor, preconditions, main flow, alternative and exception flows, postconditions) |
| `EP` | Equivalence Partitioning |
| `BVA` | Boundary Value Analysis |
| `DT` | Decision Table (one case per table; each rule row is a test row) |
| `ST` | State Transition (one case per machine; each transition row is a test row, invalid transitions included) |

**Levels.**

| Level | Meaning |
| --- | --- |
| unit | one module with fakes (clock, store, credentials, transport) |
| integration | real packages in a DSH host process, or over real HTTP / a real child DSH, with no browser |
| e2e | browser-driven only; runs after merge |

**Flags.**

| Flag | Meaning |
| --- | --- |
| `P:Sn` | **Provisional**: depends on the result of spike V3-Sn. Re-check the case when the spike reports. |
| `K` | An exact value, code or algorithm is fixed only at the V3-K freeze. The case uses the requirement's value, or the design's proposed one; re-check at V3-K. |
| `Q33` | Pins the Q33 = B decision (R-WD-03, R-WD-15): no on-demand Watchdog run. |
| `TQ-n` | Depends on open test-planning question n in [questions.md](<questions.md>). The expected result shown is the recommended answer. |
| `D§n` | The expected value comes from design section n, because the requirement defers to it. |

**Common oracle for every refusal** ("refused", requirements §3): the operation returns its
machine-readable code, **changes nothing** (store, mailbox, pairs, names, settings) and **leaks
nothing** (no token, id of another pair, stack, path). Every refusal row checks all three.

**Fixtures used across files.**

| Name | Meaning |
| --- | --- |
| C | the connector under test, in main DSH M |
| E1, E2, … | token entries; `v(E1)` is E1's secret value |
| P(E, id) | the principal of entry E bound to id |
| D | the designated Fishball principal (`routing.fishballToken`) |
| HF | the hosted Fishball principal |
| S1, S2, … | sessions in M |
| AT | an access token; `AT-pair` pair-only, `AT-full` full |
| clock | an injected fake clock; times are seconds after the reference instant |
