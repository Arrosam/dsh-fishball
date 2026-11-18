# Fishball V3: test cases (requirements-only)

Status: **draft, 2026-11-13; spikes S1–S7, S7b and S7c folded in, K2 frozen.** Written from [v3-requirements.md](<../../planning/v3-requirements.md>)
and [v3-design.md](<../../planning/v3-design.md>) at `e1e5577` (final design; first drafted at
`ddd34c3`, then fast-forwarded and re-read for the Q33 change) only. No implementation code was
read. The requirements are the authority. The design is used only where a requirement defers to it
(for example R-TOK-05 → design §5.3) or for a proposed name that is still review vocabulary until
V3-K; such expectations carry the flag `D§n`.

**Read with the current names (DOCS, 2026-11-17).** The cases predate requirements 1.41: read
`fishball-connector` as `dsh-connector`, `fishball-embed-ui` as `dsh-connector-ui`,
`fishball-instance` as `dsh-instance`, `fishball-connector-adapter` as `dsh-connector-adapter`, and the
MCP names by design §1.0c (`/api/agent/mcp`, scope `agent`, `agent_id`, `message_agent`,
`ask_agent`). `fishball-hosted-settings` (R-HOST-11) and fold-notify (1.34) are withdrawn: a row
about either expects nothing. The hosted set the instance places is `fishball-ui`, `fishball-core`
(core last). **`fishball-board` is shelved** (SHELVE-BOARD, the user, 2026-11-18: "fishball-board先从这次release中移除，我要改的地方太多了。先封存，留到下一批再说。所以不要预留在子实例的Fishball内。"):
it is not in release 1.0.0-alpha.1, nothing places, installs, enables or records it in a hosted child,
core's set check has no member, and a row below that expects the board placed, bundled, listed in a
release, or named by core's status reads as "the board is absent". Its own rows (PLAT-UC-06, PLAT-BVA-01,
FEAT-PEERS) stay with the shelved package and its shelved suite `fishball-board.peers`. The executable
cases under `test/v3/` are the ones kept current.

**Watchdog left V3** (requirements 1.37): its cases (the former `05-watchdog.md`, area `WD`) are
gone; its notes are the separate project's. A managed session's permission requests go to its
Fishball and on to the user.
No requirement question remains open in the requirements document. Test-planning questions TQ-1
to TQ-5 and TQ-R1 to TQ-R4 are decided and folded into the requirements, design and cases on this branch; the rest
are open in [questions.md](<questions.md>).

## Files

| # | Area | File |
| --- | --- | --- |
| 1 | OAuth client credentials, tokens, pairing | [01-auth-pairing.md](<01-auth-pairing.md>) |
| 2 | Names | [02-names.md](<02-names.md>) |
| 3 | Hand over / Take back | [03-handover.md](<03-handover.md>) |
| 4 | `fishball-events`, exactly-one delivery, interception | [04-events-interception.md](<04-events-interception.md>) |
| 6 | Watching = managing | [06-watch.md](<06-watch.md>) |
| 7 | Contributor tools and events | [07-contributors.md](<07-contributors.md>) |
| 8 | Hosted launch, token per pairing, reinstall takeover | [08-hosted.md](<08-hosted.md>) |
| 9 | Standalone Fishball and remote DSH | [09-standalone-remote.md](<09-standalone-remote.md>) |
| 10 | Embed-UI and the install matrix | [10-embed-ui-matrix.md](<10-embed-ui-matrix.md>) |
| 11 | Everything else (protocol, routing rest, plugin set, placement, board, migration, compatibility, security) | [11-platform.md](<11-platform.md>) |
| — | Traceability: requirement → cases | [traceability.md](<traceability.md>) |
| — | Gaps and contradictions found while writing the cases | [questions.md](<questions.md>) |

The parallel-development task table that consumes these cases is
[v3-tasks.md](<../../planning/v3-tasks.md>).

## Counts

164 active cases (plus 6 withdrawn ids kept for traceability). A UC, DT or ST case holds many rows (flows, rules, transitions); the counts below are
cases, not rows.

| Area | UC | EP | BVA | DT | ST | Total |
| --- | --- | --- | --- | --- | --- | --- |
| AUTH (OAuth, tokens, pairing, the connector adapter) | 13 | 13 | 8 | 10 | 7 | 51 |
| NAME | 3 | 4 | 2 | 3 | 1 | 13 |
| HAND (Hand over / Take back) | 4 | 2 | 0 | 2 | 2 | 10 |
| EVT (events, interception) | 3 | 5 | 2 | 4 | 2 | 16 |
| WATCH | 3 | 1 | 0 | 0 | 1 | 5 |
| EXT (contributors) | 4 | 4 | 4 | 3 | 1 | 16 |
| HOST (hosted mode) | 8 | 3 | 0 | 3 | 2 | 16 |
| REM (standalone, remote) | 3 | 3 | 0 | 1 | 0 | 7 |
| UIM (embed-UI, install matrix) | 5 | 2 | 0 | 2 | 0 | 9 |
| PLAT (rest) | 7 | 7 | 2 | 4 | 1 | 21 |
| **Total** | **53** | **44** | **18** | **32** | **17** | **164** |

Levels (a case may span two): unit 47, integration 119, e2e 29. Provisional on a spike (`P:Sn`): 9.

## Conventions

**Case ids.** `<AREA>-<TECHNIQUE>-<nn>`. Areas: `AUTH`, `NAME`, `HAND`, `EVT`, `WATCH`, `EXT`,
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
| `TQ-n` | Depends on open test-planning question n in [questions.md](<questions.md>). The expected result shown is the recommended answer. |
| `D§n` | The expected value comes from design section n, because the requirement defers to it. |

**Owner.** A case may name the task that writes its test, as `**Owner:** <task id>` after its flags, using the ids of
[v3-tasks.md](<../../planning/v3-tasks.md>) and `.runtime/reports/v3-remaining-plan.md`. Every
case of the connector-adapter section of [01-auth-pairing.md](<01-auth-pairing.md>) does; for the
other cases the owner is the task whose "Cases" column lists it.

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

## Where the suites live, and running only what a change needs

The V3 suites are laid out by package and module, `test/v3/<package>/<module>/` (2026-11-16, the
user: split by the real plugin layout, so a change runs only its own tests). `test/v3/contract/`
holds the cross-package rows: the K1–K3 freezes, package boundaries and R-EMBED. Legacy root and
V2 files keep their paths and are grouped by package in an opt-in lane.

[test/suites.mjs](<../../../test/suites.mjs>) is the one map from source paths to suites.

| Command | Runs |
| --- | --- |
| `test/run-affected.sh <base-ref>` | the suites the working tree's changes against `<base-ref>` need |
| `test/run-affected.sh --suite=dsh-connector.tokens` | one suite; a prefix such as `dsh-connector` runs a whole package |
| `npm run test:all` | all unshelved V3 suites |
| `npm run test:all -- --lane=legacy` | pre-V3/root groups; use `npm run test:affected -- <base-ref> --lane=legacy` for just those affected |
| `npm run test:release-check` | release, placement, and package-boundary checks with release artifacts required |
| `npm run test:map` | ownership and representative selection checks |

`--sdk=0.2.1-rc.5|0.2.2-rc.1` selects one SDK's V3 files; `--list` prints the selection. An unmapped
path, shared test support, or runner change selects all suites in the chosen lane. `--suite` explicitly
selects the named suites, irrespective of the lane.

Ordinary runs report `release folder missing` as a skip on artifact-only rows. Source-only tests still
run. An existing incomplete or invalid release still fails; use `--release-check` (also set by
`npm run test:release-check`) to make missing artifacts fail too. Build the artifacts first with
`npm run pack:v3`, or set `FBTEST_RELEASE_DIR` to an existing release.
