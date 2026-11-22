# fishball-core tests: manager

Core's one manager session (F-WIRE, DESIGN §20): reminders in the manager (MGR-REM), the singleton and
its setup (MGR-SET), the generated identity (MGR-ID, RFIX-F09), Fishball's model (MGR-MOD), the
R-FIX-CORE review fixes (RFIX-F05…F18, RFIX2) and the Watchdog persona (WD-PERSONA). Row index:
[USE-CASES.md](<USE-CASES.md>); entry [../manager.test.mjs](<../manager.test.mjs>).

| file | rows |
|---|---|
| [cases.mjs](<cases.mjs>) | MGR-REM, MGR-SET, MGR-ID, RFIX-F09, MGR-MOD (one scenario: boot A, then boot B after a downtime) |
| [rfix.mjs](<rfix.mjs>), [rfix2.mjs](<rfix2.mjs>) | RFIX-F05..F18, RFIX2-* (in-process, [inproc.mjs](<inproc.mjs>)) |
| [watchdog-persona.mjs](<watchdog-persona.mjs>) | WD-PERSONA-* |

## How it is observed

- **System rows**: one fishball-test-helpers `scenario` over one home with two boots of the current DSH,
  core installed ([../support/core-world.mjs](<../support/core-world.mjs>)), the scripted model as DSH's
  default. Facts: DSH's session controller and persistence, settings, agent presets, the scripted
  model's requests, the owner routes, core's guard report. The generated id is seen as the `agent_id`
  core's Connect passes to a metadata-only target (fishball-test-helpers/fake-connector `startFakeTarget`).
- **In-process rows** ([inproc.mjs](<inproc.mjs>)): the current DSH's real parts (cordis, sessions with
  JSONL persistence, agent loop, tools, llm) by name (fishball-test-helpers/dsh `importDsh`); core's
  manager modules imported bound to that DSH (`importBound`). Fakes: the model adapter only.
- **Persona rows**: PERSONA_ROLE as published. WD-PERSONA-ST-01 reads the persona before the Watchdog
  change with `git archive` of core's own folder at the parent of the commit that brought WATCHDOG into
  persona.js; fishball-shared is linked by name for its imports.

## Regression rows

RFIX2 (the 90% create/update bound, fix 9c1a2057): `node scripts/test.mjs fishball-core --against=08c81c9f --
--test-name-pattern=RFIX2` fails the six over-the-bound rows (CREATE-BVA-01 boundary+1 and 91%,
UPDATE-BVA-01 boundary+1 and 91%, ABOVE-DT-01 grow by one byte and create: "was not refused
schedule-store-full") and passes the at-or-under rows; the normal run passes all 16. constants.mjs
imports core's contracts and fishball-shared's ui-seam as namespaces so these rows still load on a commit
older than WATCHDOG and SEAM_TARGETS.

## Not ported

The todo rows MGR-SET-ST-03, MGR-MOD-EP-01, -ST-07, -ST-08 (their requirement names no observable
outcome) are retired.