# fishball-core's tests

fishball-core's own tests ([docs/testing/README.md](<../../../docs/testing/README.md>)): one entry file per
area, each registering its cases once on the current DSH. They reach only core's own files,
`fishball-test-helpers/*` and, by name, core's dependencies and peers; nothing of fishball-ui (nested in
`../ui`, its own package with [its own tests](<../ui/tests/README.md>)) is loaded. Shared modules of
several areas are in [support/](<support/README.md>).

```bash
node scripts/test.mjs fishball-core                 # all 17 entry files
node scripts/test.mjs fishball-core --list          # the entry files, nothing run
node scripts/test.mjs fishball-core --file=events   # one entry file
node scripts/test.mjs fishball-core --against=<ref> -- --test-name-pattern=<ID>
```

## Areas

Counts are the pre-merge baseline for entries present before the staging port. See the
[staging supplement](<../../../docs/testing/inventory/staging-f8bcb158.md>) for added cases.

| entry | area README | what it covers | case-id prefixes | cases |
|---|---|---|---|---|
| `asks.test.mjs` | [asks/](<asks/README.md>) | ask cards: `ask_user` per target, the card store, answers committed once, settlement, startup reconciliation, the two routes, failed writes | ASK-*, PLAT-UC-07, MULTI-ASK-*, RFIX-F12-* | 166 |
| `bridge.test.mjs` | [bridge/](<bridge/README.md>) | the façade: offered tools and names, call gates, X12 bridge, X8 attention, `attachment_read` as an image | EXT-UC-02/04, EXT-DT-03, F-FACADE, K2-AMEND-1, RFIX-F13-* | 70 |
| `child-plugins.test.mjs` | [child-plugins/](<child-plugins/README.md>) | which mode row core's patch turns on, instance-run child or standalone (DESIGN §28) | CP-R1-01…06 | 12 |
| `contracts.test.mjs` | [contracts/](<contracts/README.md>) | `contracts/` against the vendored connector K1/K2 and DSH's grammars; no generated schema | K3a-*, K3a-MULTI-*, K3a-MULTI-SEC-*, OWN-ARCH | 196 |
| `events.test.mjs` | [events/](<events/README.md>) | interception, acceptance ledger, one wake per event, presenter retry, crash recovery, per-target tuples, wake batching | EVT-*, MULTI-EVT-*, RFIX-F11/F14-*, WAKE-EVT-* | 163 |
| `identity.test.mjs` | [identity/](<identity/README.md>) | identity and pairing against a fake connector | AUTH-*, NAME-*, HOST-UC-04, TOKEN-REVOKED, OWN-NAME | 94 |
| `link-save.test.mjs` | [link-save/](<link-save/USE-CASES.md>) | saved credentials and Connect over DSH's real credential store and authorization | REM-UC/ST-*, FLS-*, EFIX3-LS-*, MULTI-CRED-*, RFIX-F01/F10/F16-* | 167 |
| `link.test.mjs` | [link/](<link/README.md>) | the MCP link: target URL classes, status, drop and return, where the secret may go, client-import failures | REM-UC-02, REM-EP-01, REM-DT-01, F-LINK, LNK-FIX3-*, RFIX-F02/F03/F04-* | 71 |
| `manager.test.mjs` | [manager/](<manager/README.md>) | the manager session: reminders, singleton, generated identity, model, review fixes, Watchdog persona | MGR-REM/SET/ID/MOD-*, RFIX-F05…F18, RFIX2-*, WD-PERSONA-* | 116 |
| `message-user.test.mjs` | [message-user/](<message-user/README.md>) | `message_user`: its table, scope, guard entry, result; the persona's rules | MSG-TOOL-*, MSG-PERSONA-* | 21 |
| `package.test.mjs` | [package/](<package/README.md>) | core's manifest, bundle patch and shipped source (static) | HOST-EP-03 and the package rows | 8 |
| `persona.test.mjs` | [persona/](<persona/README.md>) | the bold-punctuation rule against DSH's own chat markdown parser | PBR-01…06 | 30 |
| `settings.test.mjs` | [settings/](<settings/README.md>) | core's settings page in a scripted DSH page: form, per-target cards, Connect races, model select, logo, wake settings | SET3-*, MULTI-SET-*, CONNECT-*, EFIX3-SET-*, BRAND-SET/STATUS-*, WAKE-SET-* | 134 |
| `skills.test.mjs` | [skills/](<skills/README.md>) | private Skills tools, provider and confined store | SK-UC/EP/BVA/DT/ST-* | 178 |
| `start-panels.test.mjs` | — | Fishball Start entries and workspace-files guards against real DSH | START-PANELS-DT-01 | 3 scenarios |
| `status.test.mjs` | [status/](<status/README.md>) | the status snapshot, strip line, set check, guards notice, gentle tools notice | UC-STATUS-*, F-STATUS-*, MULTI-STATUS-*, TOOLS-*, PLAT-*, HOST-DT, REM-DT | 138 |
| `wire.test.mjs` | [wire/](<wire/README.md>) | the main row in a booted standalone DSH, multiple targets, hosted lifecycle, retirement, running sessions, brand config, wake from the manager | WIRE-*, MULTI-TGT/HOST/CRED/NAME/TOOL/CONN/SVC/EVT-SYS/ASK-SYS-*, MULTI-LIFE-*, MULTI-1-FIX, SESSIONS(-WATCH), BRAND-CONFIG-*, WAKE-SYS-* | 137 |

## Regression rows

Each fix's rows fail on the code before it and pass now; the commands and results are in the area
READMEs: EVT-ST-02 5h–5k, MULTI-EVT-RETIRED-ST-01, RFIX-F11/F14 ([events](<events/README.md>));
LNK-FIX3-* ([link](<link/README.md>)); RFIX2 (`--against=08c81c9f`, [manager](<manager/README.md>));
MULTI-1-FIX (`--against=8421cfee`, [wire](<wire/README.md>)); EFIX3-SET-MUT-01 (c4845000's chunk,
[settings](<settings/README.md>)).

## Not here

Rows that need fishball-ui (or another package) beside core are listed in each area README and run in
the integration packages: [`integration-page-stream`](<../../integration-page-stream/>),
[`integration-release`](<../../integration-release/>) and
[`integration-amenities`](<../../integration-amenities/README.md>). What the old `test/` tree covered,
case id by case id, is in [docs/testing/inventory/fishball-core.md](<../../../docs/testing/inventory/fishball-core.md>).
