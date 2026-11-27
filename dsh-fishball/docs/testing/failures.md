# Baseline failures, classified

Every case that failed in the baseline run of the old tests (0377153f, DSH 0.2.1-rc.5 and 0.2.2-rc.1,
[inventory/](<inventory/README.md>)) and every case that failed when ported to the current DSH, sorted
into **real bugs** (the product breaks a requirement that still stands) and **outdated tests** (the
requirement changed, or the subject left this repository), plus **environment** failures (the test
machine lacked something the product needs). The porting notes behind each row are in the branch's
commit messages and the area READMEs.

## Real bugs

| id | package | requirement | observed | evidence | status |
|---|---|---|---|---|---|
| CORE-WIRE-B1 | fishball-core, fishball-integration-core-ui | R-FB-13: the guard compares the manager’s reachable tools to its defaults, excluding core’s own tools | On DSH 0.2.2-rc.3, the four globally registered `team_task_*` tools triggered `guards-overridden` even with Team mode off. The model did not receive them, but core read the registered schemas without checking admission. | Two core cases (WIRE-SYS “manager tool scope and guards hold”, MGR-REM-EP-04) and three core/UI cases (UI-UC-01 main 4, UI-UC-01 A1 restore, and WIRE-SYS board + UI + core guards) failed. | **Fixed:** use DSH’s admitted tool set during a model step and exclude conditional tools when no step exists. Reachable overrides still report `guards-overridden`. |

No other real bug was found.

## Environment

| rows | baseline error | why |
|---|---|---|
| fishball-core MULTI-CONN-*, MULTI-NAME-*, MULTI-CRED-*, MULTI-LIFE-*, MULTI-ASK-SYS-*, MULTI-TOOL-EP/BVA/ST-02, MULTI-SVC-EP/ST-01, WAKE-SYS-*, MGR-ID-EP-02, MGR-ID-ST-02, RFIX-F09-* (about 50 behaviours) | `Cannot find package '@modelcontextprotocol/client'`; targets never connected; Connect answered 503 TARGETS_UNAVAILABLE | The baseline checkout had no `node_modules/@modelcontextprotocol/client`, fishball-core's own dependency. With it present, every row passes. `docs/testing/README.md` lists it as a precondition. |
| fishball-core LNK-FIX3-DT-01 rule 4, LNK-FIX3-ST-01 row 1, EFIX3-LS-DT-01, EFIX3-LS-ST-01 | an "import succeeds" partition logged `ERR_MODULE_NOT_FOUND` | same cause; all 21 LNK-FIX3 and 19 EFIX3-LS rows pass with the client |

## Outdated tests

| rows | baseline error | change that outdated them | now |
|---|---|---|---|
| fishball-core MULTI-TOOL-ST-01, MULTI-SVC-DT-01 (and MULTI-TOOL-ST-02's hold) | `A did not get its call 2 !== 1` | the running-sessions read (2026-11-21): core calls `sessions_list {limit: 100}` on connect (DESIGN §35 adds the watching poll); the rows counted every `sessions_list` call | count the case's own calls by their arguments; pass |
| fishball-core MULTI-EVT-SYS-01 | the manager got one `fbe_` message, not two | DESIGN §29 wake batching: both targets' copies arrive in one batch message whose id is its first record's | read the batch's listed records: each copy once, acked only on its own target; pass |
| fishball-core identity suite (whole file) | `OWN.names is not iterable` at registration | 00a66572 dropped `OWN.names` from the own-schema constants | the list restored as identity's own data; 108 pass |
| fishball-core K3a-LINK, K3a-MCP, K3a-META, K3a-MULTI-EP-05 (39 rows) | `Cannot find module packages/dsh-connector/mcp-schema` | 6b7c53bf moved dsh-connector to its own repository | compared against the vendored K1/K2 contract (`fishball-test-helpers/connector-contract`); all 39 pass, so core's copy still matches |
| fishball-core K3a-HOST "instance copy", K3a-TARGET (5), HOST-EP-03 rows 1/2/4, HOST-UC-08 | `packages/dsh-instance/... is missing`, hosted child never ready | 6b7c53bf moved dsh-instance to dsh-fishball-instance | retired here; core's own halves are ported |
| fishball-core private Skills (148 rows) | `Cannot find module packages/dsh-instance/src/native-runtime/overlay.js` | 6b7c53bf; the harness imported the overlay for all rows though only SK-ST-12-T4 used it | overlay import dropped; 178 pass (they never ran in the baseline); the overlay half of SK-ST-12-T4 retired |
| fishball-core ASK-UC-04 main 3 | `ENOENT scandir packages/dsh-connector` | 6b7c53bf | retired |
| fishball-ui LITE-UC-01, EP-06, DT-02, DT-05, ST-01 | `sidebar.left.toggle must be the contract binding`, `6 !== 7` | MULTI-3 (docs/planning/v3-multi-dsh.md §6.1): `sidebar.left.toggle` is no longer remapped (the sidebar is Fishball's target list) | six commands remapped; LITE-EP-06 asserts the toggle keeps its native gesture; pass |
| fishball-ui LITE-EP-02, EP-08 | the session search launcher is focusable | §6.1: the page no longer hides the whole sidebar, it occupies `sidebar.workspaces` | the leave-the-session launchers stay unreachable and the page holds the slot; pass |
| fishball-ui LITE-UC-02 | `Plugins button present` | §6.4: no Fishball tray, no duplicate Plugins button | assertion removed |
| fishball-ui B3-EP-01, B3-ST-01…04 | the page navigation is not rendered | MULTI-3 removed the page-drawn `nav`; status and Retry moved to the page's `sidebar.footer.action` entry | the harness reads that entry; R4 still holds; pass |
| fishball-ui LITE-UC-03, EP-12, EP-13; v2-recommendation R1, TC-31, TC-32 (DSH-side halves); v2-pg-origin-frame-policy | missing `packages/dsh-instance` / `packages/dsh-connector` / dsh-connector-ui files | 6b7c53bf | retired; fishball-ui's halves of TC-23/31/32 ported |
| fishball-ui (on 0.2.2-rc.5) MULTI-BAR-DT-01 (6), NARROW-RESIZE-01, NARROW-TOGGLE-01 | panel rows 51 px apart | DSH 0.2.2-rc.5's SidebarRoot wraps New Session in `div.newSessionRow`; the frame fixture did not | fixture writes the wrapper when DSH's class map has it; pass on rc.1, rc.5 and 0.2.1-rc.5 |
| fishball-ui (on 0.2.2-rc.5) CSS-module reader, drawer/rail branch, native-label reader, persona parser pick | readers failed on rc.5's minified bundles; a branch chosen by version name | DSH's own build changes | readers accept both layouts; branches follow the current DSH's own markup |

## Skipped and todo rows

About 330 behaviours were registered as `skip` for a withdrawn requirement (MULTI-0's scalar settings
page and Connect route, the withdrawn slim panel, MULTI-3's status card and tray) and about 230 as
`todo` placeholders. The new tests register neither: a withdrawn requirement removes its cases, and a
placeholder whose subject left this repository or that nothing plans is retired, each with its reason
in the inventory mapping.
