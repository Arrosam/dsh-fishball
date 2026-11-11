# Traceability: requirement → cases

Generated from the `**Req:**` line of every case in this directory, against the requirement IDs of
[v3-requirements.md](<../../planning/v3-requirements.md>) at `e1e5577` plus the decided test-planning questions folded in on this branch (TQ-1 to TQ-5, TQ-R1 to TQ-R4). A case cites a requirement only
when it checks an observable of it. Requirements §4 (install matrix) and §4.1/§4.2 tables are cited
by UIM-DT-01, AUTH-DT-01/02, HOST-DT-01 and EXT-DT-03.

**Requirements with no case:**

| ID | Why |
| --- | --- |
| R-WD-13 | Withdrawn (requirements 1.14); the ID is reserved. Its old behaviour (idle-stop bypass) is negatively covered by WD-UC-02 and WD-EP-01 #5: every `turn-finished` reaches Fishball. |

**Requirement → cases** (174 requirements, 153 cases):

| Requirement | Cases | Count |
| --- | --- | --- |
| R-ARCH-01 | PLAT-UC-04, PLAT-EP-03, PLAT-EP-07 | 3 |
| R-ARCH-02 | UIM-DT-01 | 1 |
| R-ARCH-03 | HAND-EP-01, PLAT-EP-03 | 2 |
| R-ARCH-04 | HAND-UC-04, UIM-DT-01 | 2 |
| R-ARCH-05 | HOST-UC-08, HOST-EP-03, HOST-EP-01, PLAT-EP-03 | 4 |
| R-ARCH-06 | PLAT-UC-04, PLAT-EP-03, PLAT-DT-03 | 3 |
| R-ARCH-07 | PLAT-EP-06 | 1 |
| R-ARCH-08 | PLAT-EP-07 | 1 |
| R-CON-01 | AUTH-UC-08, PLAT-UC-01, PLAT-EP-01 | 3 |
| R-CON-02 | WATCH-UC-03, PLAT-UC-01, PLAT-UC-02, PLAT-EP-02 | 4 |
| R-CON-03 | EVT-UC-01, EVT-EP-02, EVT-BVA-01, EVT-ST-01 | 4 |
| R-CON-04 | EVT-UC-01, REM-UC-02 | 2 |
| R-CON-05 | AUTH-DT-04, REM-UC-02, PLAT-UC-02, PLAT-ST-01 | 4 |
| R-CON-06 | PLAT-UC-02, PLAT-ST-01 | 2 |
| R-CON-07 | PLAT-UC-02 | 1 |
| R-CON-08 | EVT-EP-01, PLAT-UC-03 | 2 |
| R-CON-09 | EVT-BVA-02, EVT-DT-01, PLAT-UC-03 | 3 |
| R-CON-10 | AUTH-UC-01, AUTH-UC-09 | 2 |
| R-CON-11 | HAND-UC-01, HAND-UC-03, HAND-UC-04, HAND-EP-01, HAND-DT-01 | 5 |
| R-EXT-01 | EXT-UC-01, EXT-ST-01 | 2 |
| R-EXT-02 | EXT-UC-01, EXT-EP-01 | 2 |
| R-EXT-03 | EXT-UC-01, EXT-UC-04, EXT-EP-01, EXT-EP-02, EXT-BVA-01 | 5 |
| R-EXT-04 | EXT-UC-01, EXT-UC-03, EXT-ST-01 | 3 |
| R-EXT-05 | AUTH-UC-02, AUTH-EP-06, EXT-UC-01, EXT-DT-03 | 4 |
| R-EXT-06 | EXT-UC-01, EXT-BVA-04 | 2 |
| R-EXT-07 | EXT-UC-01, EXT-EP-03, EXT-BVA-04 | 3 |
| R-EXT-08 | EXT-UC-03, EXT-EP-03, EXT-BVA-04 | 3 |
| R-EXT-09 | EXT-UC-03, EXT-ST-01 | 2 |
| R-EXT-10 | EXT-UC-01, EXT-EP-04 | 2 |
| R-EXT-11 | EXT-EP-04 | 1 |
| R-EXT-12 | EXT-UC-01 | 1 |
| R-EXT-13 | EXT-UC-04, EXT-DT-03, PLAT-EP-02 | 3 |
| R-EXT-14 | EXT-DT-03 | 1 |
| R-EXT-15 | EXT-UC-01, EXT-UC-03 | 2 |
| R-EXT-16 | EXT-UC-02, EXT-EP-02, EXT-DT-01 | 3 |
| R-EXT-17 | EVT-DT-01, EXT-UC-02, EXT-DT-01, EXT-DT-02 | 4 |
| R-EXT-18 | EVT-BVA-02, EXT-UC-02, EXT-BVA-02, EXT-BVA-03, EXT-DT-01 | 5 |
| R-EXT-19 | EVT-ST-01, EXT-UC-03, EXT-DT-01, EXT-ST-01 | 4 |
| R-EXT-20 | WD-UC-02, EXT-UC-02 | 2 |
| R-TOK-00 | AUTH-UC-04, AUTH-UC-07, AUTH-EP-02, AUTH-EP-05 | 4 |
| R-TOK-01 | AUTH-UC-02, AUTH-UC-03, AUTH-EP-02, AUTH-DT-02, PLAT-EP-01 | 5 |
| R-TOK-02 | AUTH-EP-01, AUTH-EP-02 | 2 |
| R-TOK-03 | AUTH-UC-01 | 1 |
| R-TOK-04 | AUTH-UC-01, AUTH-UC-07, AUTH-EP-04, HOST-EP-02, PLAT-EP-05 | 5 |
| R-TOK-05 | AUTH-UC-06, AUTH-DT-04, EVT-EP-04, EVT-ST-01, HOST-UC-04, PLAT-ST-01 | 6 |
| R-TOK-06 | AUTH-UC-07, AUTH-EP-05, AUTH-BVA-06, REM-EP-03 | 4 |
| R-TOK-07 | AUTH-EP-07 | 1 |
| R-TOK-08 | AUTH-UC-01, AUTH-UC-09, AUTH-EP-04, AUTH-BVA-03, AUTH-ST-01 | 5 |
| R-TOK-09 | AUTH-UC-06, AUTH-EP-04, AUTH-DT-05, AUTH-ST-01 | 4 |
| R-TOK-10 | AUTH-EP-06 | 1 |
| R-OA-01 | AUTH-UC-02, AUTH-UC-08 | 2 |
| R-OA-02 | AUTH-UC-08, AUTH-EP-01 | 2 |
| R-OA-03 | AUTH-UC-02, AUTH-EP-01, AUTH-EP-03, AUTH-EP-05, AUTH-DT-01 | 5 |
| R-OA-04 | AUTH-UC-02, AUTH-UC-03, AUTH-EP-06, AUTH-DT-01, AUTH-DT-02, AUTH-ST-02 | 6 |
| R-OA-05 | AUTH-UC-02, AUTH-UC-03, AUTH-UC-08, AUTH-EP-01, AUTH-EP-02 | 5 |
| R-OA-06 | AUTH-UC-06, AUTH-EP-02, AUTH-DT-04, AUTH-ST-01, AUTH-ST-02 | 5 |
| R-OA-07 | AUTH-UC-02, AUTH-UC-03, AUTH-EP-01, AUTH-BVA-01, AUTH-BVA-06, AUTH-ST-02 | 6 |
| R-OA-08 | AUTH-EP-01, REM-UC-03, REM-EP-03 | 3 |
| R-OA-09 | AUTH-UC-02, AUTH-UC-08, PLAT-UC-01 | 3 |
| R-OA-10 | AUTH-UC-07, AUTH-EP-02, AUTH-BVA-04, AUTH-DT-03 | 4 |
| R-ID-01 | AUTH-UC-02 | 1 |
| R-ID-02 | AUTH-UC-07, AUTH-EP-03, AUTH-BVA-02, AUTH-BVA-04, AUTH-DT-01, AUTH-DT-03 | 6 |
| R-ID-03 | AUTH-UC-02, AUTH-UC-07, AUTH-DT-02, AUTH-ST-01, AUTH-ST-02, NAME-UC-01 | 6 |
| R-ID-04 | AUTH-UC-04, AUTH-EP-05, AUTH-DT-02, AUTH-ST-01 | 4 |
| R-ID-05 | AUTH-UC-03, AUTH-DT-06, AUTH-ST-03, HOST-UC-02 | 4 |
| R-ID-06 | AUTH-UC-02, AUTH-EP-06, AUTH-DT-02, NAME-EP-03, EVT-EP-02, EVT-EP-04, EXT-UC-02 | 7 |
| R-ID-07 | AUTH-UC-05, AUTH-DT-06, AUTH-ST-03, REM-UC-01 | 4 |
| R-ID-08 | AUTH-UC-02, AUTH-UC-04 | 2 |
| R-ID-09 | AUTH-UC-06, AUTH-ST-01 | 2 |
| R-ID-10 | AUTH-UC-05, AUTH-EP-03, AUTH-DT-06, AUTH-ST-03 | 4 |
| R-ID-11 | AUTH-UC-04, AUTH-EP-03, AUTH-EP-07 | 3 |
| R-ID-12 | AUTH-UC-01, AUTH-UC-02, AUTH-UC-09, AUTH-BVA-05 | 4 |
| R-NAME-01 | NAME-UC-03, NAME-EP-02, NAME-ST-01 | 3 |
| R-NAME-02 | NAME-UC-02, NAME-UC-03, NAME-EP-01, NAME-EP-02, NAME-EP-03, NAME-BVA-01, NAME-BVA-03, NAME-DT-02, NAME-ST-01 | 9 |
| R-NAME-03 | AUTH-UC-05, NAME-UC-02, NAME-DT-03 | 3 |
| R-NAME-04 | NAME-UC-01, NAME-BVA-02, NAME-BVA-03, NAME-DT-01, NAME-ST-01 | 5 |
| R-NAME-05 | AUTH-UC-09, NAME-UC-02, HAND-UC-01, HAND-UC-03 | 4 |
| R-NAME-06 | NAME-UC-01, NAME-DT-01 | 2 |
| R-NAME-07 | NAME-ST-01, HOST-UC-03, HOST-ST-02 | 3 |
| R-ROUTE-01 | HAND-UC-02, HAND-ST-01, WATCH-UC-01, HOST-UC-03 | 4 |
| R-ROUTE-02 | EVT-EP-01, EVT-DT-01 | 2 |
| R-ROUTE-03 | EVT-EP-01, EVT-DT-01, PLAT-UC-03 | 3 |
| R-ROUTE-04 | AUTH-UC-06, AUTH-DT-04, HAND-DT-01, EVT-DT-01, HOST-UC-01, PLAT-UC-03 | 6 |
| R-ROUTE-05 | HAND-UC-01, HAND-UC-02, HAND-DT-01, HAND-DT-02, HAND-ST-01 | 5 |
| R-ROUTE-06 | AUTH-UC-06, AUTH-DT-04, HAND-ST-01, HOST-UC-04 | 4 |
| R-EVS-01 | EVT-UC-01, EVT-EP-02 | 2 |
| R-EVS-02 | EVT-UC-01, EVT-EP-01, WATCH-UC-01, EXT-UC-02 | 4 |
| R-EVS-03 | HAND-UC-02, HAND-DT-02, EVT-EP-01, EVT-EP-04, EVT-DT-01, WATCH-EP-01, EXT-DT-02 | 7 |
| R-EVS-04 | EVT-UC-01, EVT-EP-03 | 2 |
| R-WATCH-01 | AUTH-UC-06, HAND-UC-01, HAND-ST-01, WATCH-UC-01, WATCH-UC-02, WATCH-EP-01, WATCH-ST-01 | 7 |
| R-WATCH-02 | HAND-UC-01, EVT-EP-01, WATCH-UC-01, WATCH-EP-01 | 4 |
| R-WATCH-03 | WATCH-UC-03, PLAT-EP-02 | 2 |
| R-WATCH-04 | HAND-UC-02, WATCH-UC-02, WATCH-ST-01, HOST-UC-03 | 4 |
| R-WATCH-05 | WD-UC-02, WD-ST-02, WATCH-EP-01 | 3 |
| R-INT-01 | EVT-UC-02, EVT-UC-03 | 2 |
| R-INT-02 | EVT-UC-02, EVT-EP-03, EVT-DT-02, EVT-ST-02 | 4 |
| R-INT-03 | EVT-UC-03, EVT-DT-02 | 2 |
| R-INT-04 | EVT-UC-03, EVT-EP-03, EVT-DT-02, EVT-ST-02, WD-UC-04 | 5 |
| R-INT-05 | EVT-EP-03, EVT-ST-02 | 2 |
| R-INT-06 | WD-UC-01 | 1 |
| R-INT-07 | WD-UC-01, WD-UC-02, WD-UC-04, WD-EP-01, WD-DT-02, WD-ST-01 | 6 |
| R-INT-08 | EVT-UC-02, EVT-DT-03, EVT-ST-01, EVT-ST-02 | 4 |
| R-EVT-01 | EVT-DT-01 | 1 |
| R-EVT-02 | EVT-UC-01, EVT-ST-01, HOST-UC-03 | 3 |
| R-EVT-03 | EVT-UC-02, EVT-DT-03 | 2 |
| R-EVT-04 | EVT-UC-01, EVT-EP-04 | 2 |
| R-FB-01 | HOST-UC-08, HOST-EP-03, PLAT-UC-04, PLAT-EP-03, PLAT-EP-07 | 5 |
| R-FB-02 | HOST-DT-03, UIM-DT-01, PLAT-UC-04 | 3 |
| R-FB-03 | REM-UC-01, REM-EP-01, REM-DT-01 | 3 |
| R-FB-04 | AUTH-UC-05, AUTH-DT-06, AUTH-ST-03, REM-UC-01, REM-EP-01, REM-DT-01 | 6 |
| R-FB-05 | HOST-UC-05, REM-UC-01 | 2 |
| R-FB-06 | UIM-DT-01, PLAT-EP-04 | 2 |
| R-FB-07 | WD-UC-05, WD-ST-01, PLAT-DT-02 | 3 |
| R-FB-08 | PLAT-EP-06 | 1 |
| R-FB-09 | HOST-DT-03, UIM-DT-01, PLAT-UC-04 | 3 |
| R-FB-10 | HOST-UC-08, HOST-ST-01, UIM-DT-01, PLAT-UC-04, PLAT-DT-01 | 5 |
| R-HOST-01 | HOST-UC-01 | 1 |
| R-HOST-02 | HOST-UC-01, HOST-UC-06, HOST-ST-01, PLAT-UC-06 | 4 |
| R-HOST-03 | HOST-UC-06, HOST-UC-07 | 2 |
| R-HOST-04 | HOST-UC-06, HOST-UC-08, HOST-EP-03 | 3 |
| R-HOST-05 | HOST-UC-01, HOST-UC-02, HOST-UC-05, HOST-EP-02, HOST-DT-01, REM-DT-01, UIM-DT-01 | 7 |
| R-HOST-06 | HOST-UC-01, HOST-ST-01, UIM-UC-01 | 3 |
| R-HOST-07 | HOST-UC-07, HOST-UC-08 | 2 |
| R-HOST-11 | HOST-UC-08, HOST-EP-03, HOST-DT-03 | 3 |
| R-HOST-08 | WD-UC-05, WD-ST-01, HOST-UC-06 | 3 |
| R-HOST-09 | HAND-ST-01, HOST-UC-03, HOST-DT-01, HOST-DT-02, HOST-ST-02, PLAT-ST-01 | 6 |
| R-HOST-10 | HOST-UC-04, HOST-DT-01, HOST-DT-02 | 3 |
| R-UI-01 | UIM-UC-01, UIM-UC-02, UIM-UC-03, UIM-EP-01, UIM-DT-01 | 5 |
| R-UI-02 | UIM-UC-01 | 1 |
| R-UI-03 | UIM-UC-01 | 1 |
| R-UI-04 | EXT-UC-04, UIM-UC-02, UIM-EP-01 | 3 |
| R-UI-05 | HAND-UC-01, HAND-UC-03, UIM-UC-02 | 3 |
| R-UI-06 | HOST-UC-07, UIM-UC-01 | 2 |
| R-UI-07 | REM-UC-01 | 1 |
| R-UI-08 | EXT-DT-03, UIM-UC-02, UIM-EP-01, UIM-DT-01 | 4 |
| R-UI-09 | HAND-UC-04, EXT-DT-03, HOST-UC-05, UIM-UC-03, UIM-EP-01, UIM-DT-01, PLAT-EP-06 | 7 |
| R-REM-01 | REM-UC-03, REM-EP-02 | 2 |
| R-REM-02 | REM-UC-03, REM-EP-02 | 2 |
| R-REM-03 | AUTH-UC-07, REM-UC-03, REM-EP-03, PLAT-EP-01 | 4 |
| R-REM-04 | REM-UC-02 | 1 |
| R-WD-00 | WD-UC-01, WD-EP-03 | 2 |
| R-WD-01 | WD-EP-03 | 1 |
| R-WD-02 | WD-EP-03 | 1 |
| R-WD-03 | WD-UC-01, WD-UC-02, WD-UC-03, WD-UC-07, WD-EP-01, WD-BVA-03, WD-ST-03 | 7 |
| R-WD-04 | WD-UC-03, WD-UC-07, WD-EP-02, WD-BVA-01, WD-BVA-02, WD-BVA-03 | 6 |
| R-WD-05 | WD-UC-03, WD-EP-04 | 2 |
| R-WD-06 | WD-EP-04 | 1 |
| R-WD-07 | WD-UC-04, WD-UC-05, WD-DT-02, WD-ST-01 | 4 |
| R-WD-08 | WD-UC-04, WD-EP-03 | 2 |
| R-WD-09 | WD-UC-01, WD-EP-01, WD-DT-01, PLAT-ST-01 | 4 |
| R-WD-10 | WD-UC-06, WD-ST-02, WD-ST-03 | 3 |
| R-WD-11 | WD-DT-02, WD-ST-02 | 2 |
| R-WD-12 | WD-UC-01, WD-UC-02, WD-EP-01, WD-DT-01, WD-DT-02 | 5 |
| R-WD-13 | — | 0 |
| R-WD-14 | WD-UC-03, WD-UC-07, WD-BVA-02, WD-ST-02 | 4 |
| R-WD-15 | WD-UC-06, WD-UC-07, WD-EP-01, WD-BVA-03, WD-ST-02, WD-ST-03 | 6 |
| R-BND-01 | HOST-UC-01, HOST-EP-03, PLAT-EP-07, PLAT-DT-01 | 4 |
| R-BND-02 | HOST-UC-01, HOST-UC-08, HOST-EP-03, HOST-DT-03, PLAT-DT-01 | 5 |
| R-BND-03 | HOST-DT-03, HOST-ST-01, PLAT-DT-01 | 3 |
| R-BND-04 | HOST-UC-08, HOST-DT-03, PLAT-DT-01 | 3 |
| R-BND-05 | HOST-DT-03, REM-UC-01, PLAT-DT-02 | 3 |
| R-BRD-01 | PLAT-UC-06, PLAT-BVA-01 | 2 |
| R-BRD-02 | HOST-UC-06, PLAT-UC-06 | 2 |
| R-FN-01 | EXT-UC-04, UIM-UC-03 | 2 |
| R-MIG-01 | PLAT-UC-05 | 1 |
| R-MIG-02 | PLAT-UC-05 | 1 |
| R-MIG-03 | PLAT-UC-05 | 1 |
| R-MIG-04 | PLAT-UC-05 | 1 |
| R-MIG-05 | HOST-UC-01, PLAT-UC-05 | 2 |
| R-COMPAT-01 | PLAT-DT-03 | 1 |
| R-SEC-01 | HAND-EP-01, HOST-EP-01 | 2 |
| R-SEC-02 | HOST-EP-02, PLAT-EP-05 | 2 |
| R-SEC-03 | PLAT-EP-01, PLAT-BVA-02 | 2 |
| R-SEC-04 | EXT-EP-04 | 1 |

**Case index** (file, level, flags):

| Case | File | Level | Flags |
| --- | --- | --- | --- |
| AUTH-UC-01 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | D§5.2 (`fbt_` prefix), TQ-4 (decided A) |
| AUTH-UC-02 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | P:S7, P:S3 (race), K |
| AUTH-UC-03 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | TQ-5 (decided A) |
| AUTH-UC-04 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | — |
| AUTH-UC-05 | [01-auth-pairing.md](<01-auth-pairing.md>) | e2e (page), integration (core decisions) | — |
| AUTH-UC-06 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | D§5.3, TQ-2 (decided A), TQ-5 (decided A) |
| AUTH-UC-07 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | TQ-1 (decided C) |
| AUTH-UC-08 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | P:S1, P:S7 |
| AUTH-UC-09 | [01-auth-pairing.md](<01-auth-pairing.md>) | e2e | — |
| AUTH-EP-01 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | TQ-3 (decided A, confirmed by S7), D§5.5 |
| AUTH-EP-02 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | — |
| AUTH-EP-03 | [01-auth-pairing.md](<01-auth-pairing.md>) | unit (validator), integration (endpoint, core settings) | TQ-1 (decided C) |
| AUTH-EP-04 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | TQ-4 (decided A) |
| AUTH-EP-05 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | — |
| AUTH-EP-06 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | — |
| AUTH-EP-07 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | — |
| AUTH-BVA-01 | [01-auth-pairing.md](<01-auth-pairing.md>) | unit (fake clock), integration | — |
| AUTH-BVA-02 | [01-auth-pairing.md](<01-auth-pairing.md>) | unit, integration | — |
| AUTH-BVA-03 | [01-auth-pairing.md](<01-auth-pairing.md>) | unit | TQ-4 (decided A: minimum 32 characters) |
| AUTH-BVA-04 | [01-auth-pairing.md](<01-auth-pairing.md>) | unit | TQ-1 (decided C) |
| AUTH-BVA-05 | [01-auth-pairing.md](<01-auth-pairing.md>) | unit | D§5.8, K |
| AUTH-BVA-06 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration (fake clock, stock `ClientCredentialsProvider`) | K (limit and window frozen at V3-K), P:S7 |
| AUTH-DT-01 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | — |
| AUTH-DT-02 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | — |
| AUTH-DT-03 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | TQ-1 (decided C) |
| AUTH-DT-04 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | D§5.3, TQ-2 (decided A), TQ-5 (decided A) |
| AUTH-DT-05 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | — |
| AUTH-DT-06 | [01-auth-pairing.md](<01-auth-pairing.md>) | unit (core with a fake link) | — |
| AUTH-ST-01 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | — |
| AUTH-ST-02 | [01-auth-pairing.md](<01-auth-pairing.md>) | unit | — |
| AUTH-ST-03 | [01-auth-pairing.md](<01-auth-pairing.md>) | unit, e2e (warning) | — |
| NAME-UC-01 | [02-names.md](<02-names.md>) | integration | — |
| NAME-UC-02 | [02-names.md](<02-names.md>) | integration (core + C), e2e (page and marks) | TQ-6 |
| NAME-UC-03 | [02-names.md](<02-names.md>) | integration | — |
| NAME-EP-01 | [02-names.md](<02-names.md>) | unit | TQ-6 |
| NAME-EP-02 | [02-names.md](<02-names.md>) | unit | — |
| NAME-EP-03 | [02-names.md](<02-names.md>) | integration | — |
| NAME-BVA-01 | [02-names.md](<02-names.md>) | unit | K (characters = Unicode code points after NFC) |
| NAME-BVA-02 | [02-names.md](<02-names.md>) | unit (allocator), integration (`pair`) | TQ-7 |
| NAME-BVA-03 | [02-names.md](<02-names.md>) | integration | P:S3 |
| NAME-DT-01 | [02-names.md](<02-names.md>) | integration | — |
| NAME-DT-02 | [02-names.md](<02-names.md>) | integration | — |
| NAME-DT-03 | [02-names.md](<02-names.md>) | unit (core), e2e (page) | TQ-6 |
| NAME-ST-01 | [02-names.md](<02-names.md>) | unit | — |
| HAND-UC-01 | [03-handover.md](<03-handover.md>) | e2e (buttons), integration (service) | P:S4, TQ-8 |
| HAND-UC-02 | [03-handover.md](<03-handover.md>) | e2e, integration | — |
| HAND-UC-03 | [03-handover.md](<03-handover.md>) | e2e | P:S4 |
| HAND-UC-04 | [03-handover.md](<03-handover.md>) | e2e | — |
| HAND-EP-01 | [03-handover.md](<03-handover.md>) | integration | — |
| HAND-DT-01 | [03-handover.md](<03-handover.md>) | integration | TQ-8, K |
| HAND-DT-02 | [03-handover.md](<03-handover.md>) | integration | K |
| HAND-ST-01 | [03-handover.md](<03-handover.md>) | integration | TQ-8 |
| EVT-UC-01 | [04-events-interception.md](<04-events-interception.md>) | integration | P:S1 |
| EVT-UC-02 | [04-events-interception.md](<04-events-interception.md>) | integration (core with a fake link and plugins) | P:S2, P:S3 |
| EVT-UC-03 | [04-events-interception.md](<04-events-interception.md>) | unit | — |
| EVT-EP-01 | [04-events-interception.md](<04-events-interception.md>) | integration | — |
| EVT-EP-02 | [04-events-interception.md](<04-events-interception.md>) | integration | — |
| EVT-EP-03 | [04-events-interception.md](<04-events-interception.md>) | unit | — |
| EVT-EP-04 | [04-events-interception.md](<04-events-interception.md>) | integration (two pairs P and Q, each with an open listen stream) | P:S1, P:S7 |
| EVT-BVA-01 | [04-events-interception.md](<04-events-interception.md>) | unit | K (page limit frozen at V3-K) |
| EVT-BVA-02 | [04-events-interception.md](<04-events-interception.md>) | integration | D§3.4 (default 200), K |
| EVT-DT-01 | [04-events-interception.md](<04-events-interception.md>) | unit (router), integration | — |
| EVT-DT-02 | [04-events-interception.md](<04-events-interception.md>) | unit | — |
| EVT-DT-03 | [04-events-interception.md](<04-events-interception.md>) | integration | P:S2 |
| EVT-ST-01 | [04-events-interception.md](<04-events-interception.md>) | unit | TQ-2 (decided A) |
| EVT-ST-02 | [04-events-interception.md](<04-events-interception.md>) | unit | P:S2 |
| WD-UC-01 | [05-watchdog.md](<05-watchdog.md>) | integration | P:S3 |
| WD-UC-02 | [05-watchdog.md](<05-watchdog.md>) | integration | — |
| WD-UC-03 | [05-watchdog.md](<05-watchdog.md>) | unit (fake clock, fake link), integration | TQ-9 |
| WD-UC-04 | [05-watchdog.md](<05-watchdog.md>) | integration | P:S3 |
| WD-UC-05 | [05-watchdog.md](<05-watchdog.md>) | integration | — |
| WD-UC-06 | [05-watchdog.md](<05-watchdog.md>) | integration | Q33 |
| WD-UC-07 | [05-watchdog.md](<05-watchdog.md>) | integration (manager tools in a Fishball DSH with a fake link, fake clock and a scripted Watchdog model that counts its calls) | Q33 |
| WD-EP-01 | [05-watchdog.md](<05-watchdog.md>) | unit | Q33 (rows 12–14) |
| WD-EP-02 | [05-watchdog.md](<05-watchdog.md>) | unit (settings validation) | — |
| WD-EP-03 | [05-watchdog.md](<05-watchdog.md>) | integration | — |
| WD-EP-04 | [05-watchdog.md](<05-watchdog.md>) | integration (fake model provider counting lookups) | — |
| WD-BVA-01 | [05-watchdog.md](<05-watchdog.md>) | unit | — |
| WD-BVA-02 | [05-watchdog.md](<05-watchdog.md>) | unit (fake clock) | TQ-9 |
| WD-BVA-03 | [05-watchdog.md](<05-watchdog.md>) | unit (fake clock, a scripted model that records each call's brief) | Q33 |
| WD-DT-01 | [05-watchdog.md](<05-watchdog.md>) | unit (decision mapping with a scripted model) | TQ-10 |
| WD-DT-02 | [05-watchdog.md](<05-watchdog.md>) | unit | — |
| WD-ST-01 | [05-watchdog.md](<05-watchdog.md>) | unit | P:S3 |
| WD-ST-02 | [05-watchdog.md](<05-watchdog.md>) | unit | TQ-9, Q33 (rows 8–9), TQ-11 |
| WD-ST-03 | [05-watchdog.md](<05-watchdog.md>) | unit (fake clock, scripted model) | Q33 |
| WATCH-UC-01 | [06-watch.md](<06-watch.md>) | integration | TQ-12 |
| WATCH-UC-02 | [06-watch.md](<06-watch.md>) | integration | — |
| WATCH-UC-03 | [06-watch.md](<06-watch.md>) | integration | — |
| WATCH-EP-01 | [06-watch.md](<06-watch.md>) | integration | — |
| WATCH-ST-01 | [06-watch.md](<06-watch.md>) | integration | — |
| EXT-UC-01 | [07-contributors.md](<07-contributors.md>) | integration | P:S5 |
| EXT-UC-02 | [07-contributors.md](<07-contributors.md>) | integration | P:S5 |
| EXT-UC-03 | [07-contributors.md](<07-contributors.md>) | integration | P:S5, K (N of M) |
| EXT-UC-04 | [07-contributors.md](<07-contributors.md>) | integration | P:S5, D§13.6 |
| EXT-EP-01 | [07-contributors.md](<07-contributors.md>) | unit | K (grammar `[a-z0-9][a-z0-9_.-]{0,47}`, D§13.2; keyword subset) |
| EXT-EP-02 | [07-contributors.md](<07-contributors.md>) | unit | P:S5, D§13.3, TQ-13 |
| EXT-EP-03 | [07-contributors.md](<07-contributors.md>) | unit | — |
| EXT-EP-04 | [07-contributors.md](<07-contributors.md>) | unit (service surface), integration | — |
| EXT-BVA-01 | [07-contributors.md](<07-contributors.md>) | unit | K |
| EXT-BVA-02 | [07-contributors.md](<07-contributors.md>) | unit | K (refusal codes `payload-too-large`, `event-invalid` from D§13.2) |
| EXT-BVA-03 | [07-contributors.md](<07-contributors.md>) | unit (fake clock) | K (token-bucket semantics assumed: capacity 10, refill 0.5/s) |
| EXT-BVA-04 | [07-contributors.md](<07-contributors.md>) | unit | K (ceilings) |
| EXT-DT-01 | [07-contributors.md](<07-contributors.md>) | unit | K (precedence order of checks) |
| EXT-DT-02 | [07-contributors.md](<07-contributors.md>) | unit | TQ-14 |
| EXT-DT-03 | [07-contributors.md](<07-contributors.md>) | integration | P:S5 |
| EXT-ST-01 | [07-contributors.md](<07-contributors.md>) | integration | P:S5 |
| HOST-UC-01 | [08-hosted.md](<08-hosted.md>) | integration | P:S6, TQ-15 |
| HOST-UC-02 | [08-hosted.md](<08-hosted.md>) | integration | — |
| HOST-UC-03 | [08-hosted.md](<08-hosted.md>) | integration | P:S3 |
| HOST-UC-04 | [08-hosted.md](<08-hosted.md>) | integration (C + I), e2e (Retry) | — |
| HOST-UC-05 | [08-hosted.md](<08-hosted.md>) | integration | — |
| HOST-UC-06 | [08-hosted.md](<08-hosted.md>) | integration | — |
| HOST-UC-07 | [08-hosted.md](<08-hosted.md>) | e2e (card), integration (sync engine) | — |
| HOST-UC-08 | [08-hosted.md](<08-hosted.md>) | integration (child DSH with a scripted settings page), e2e (panel and Plugins page) | TQ-R4 (decided B) |
| HOST-EP-03 | [08-hosted.md](<08-hosted.md>) | unit (static import analysis), integration (rows 6–7, a started child) | TQ-R4 (decided B) |
| HOST-EP-01 | [08-hosted.md](<08-hosted.md>) | unit (manifest/static) | — |
| HOST-EP-02 | [08-hosted.md](<08-hosted.md>) | integration | — |
| HOST-DT-01 | [08-hosted.md](<08-hosted.md>) | unit | — |
| HOST-DT-02 | [08-hosted.md](<08-hosted.md>) | unit | — |
| HOST-DT-03 | [08-hosted.md](<08-hosted.md>) | integration | TQ-R4 (decided B) |
| HOST-ST-01 | [08-hosted.md](<08-hosted.md>) | integration | K (status codes) |
| HOST-ST-02 | [08-hosted.md](<08-hosted.md>) | integration | P:S3 |
| REM-UC-01 | [09-standalone-remote.md](<09-standalone-remote.md>) | integration (two DSHs), e2e (page) | P:S6, P:S7 |
| REM-UC-02 | [09-standalone-remote.md](<09-standalone-remote.md>) | integration | — |
| REM-UC-03 | [09-standalone-remote.md](<09-standalone-remote.md>) | integration | P:S1 |
| REM-EP-01 | [09-standalone-remote.md](<09-standalone-remote.md>) | unit | P:S7 (row 6) |
| REM-EP-02 | [09-standalone-remote.md](<09-standalone-remote.md>) | integration | — |
| REM-EP-03 | [09-standalone-remote.md](<09-standalone-remote.md>) | integration | K (allowlist setting) |
| REM-DT-01 | [09-standalone-remote.md](<09-standalone-remote.md>) | unit | — |
| UIM-UC-01 | [10-embed-ui-matrix.md](<10-embed-ui-matrix.md>) | e2e | P:S4 |
| UIM-UC-02 | [10-embed-ui-matrix.md](<10-embed-ui-matrix.md>) | e2e | P:S4 |
| UIM-UC-03 | [10-embed-ui-matrix.md](<10-embed-ui-matrix.md>) | e2e | P:S4 |
| UIM-EP-01 | [10-embed-ui-matrix.md](<10-embed-ui-matrix.md>) | integration | P:S4 |
| UIM-DT-01 | [10-embed-ui-matrix.md](<10-embed-ui-matrix.md>) | integration (headless rows), e2e (UI columns) | P:S4, P:S6 |
| PLAT-UC-01 | [11-platform.md](<11-platform.md>) | integration | P:S1 |
| PLAT-UC-02 | [11-platform.md](<11-platform.md>) | integration | P:S3 |
| PLAT-UC-03 | [11-platform.md](<11-platform.md>) | integration | TQ-16 |
| PLAT-UC-04 | [11-platform.md](<11-platform.md>) | integration (composition), e2e (page) | P:S6 |
| PLAT-UC-05 | [11-platform.md](<11-platform.md>) | integration (+ e2e for the page) | P:S6 |
| PLAT-UC-06 | [11-platform.md](<11-platform.md>) | integration | — |
| PLAT-EP-01 | [11-platform.md](<11-platform.md>) | integration | D§3.1 |
| PLAT-EP-02 | [11-platform.md](<11-platform.md>) | integration | K (names D§3.2) |
| PLAT-EP-03 | [11-platform.md](<11-platform.md>) | unit (manifest/static analysis) | — |
| PLAT-EP-04 | [11-platform.md](<11-platform.md>) | integration | — |
| PLAT-EP-05 | [11-platform.md](<11-platform.md>) | integration (full-run acceptance) | — |
| PLAT-EP-06 | [11-platform.md](<11-platform.md>) | integration (traffic trace plus static check) | — |
| PLAT-EP-07 | [11-platform.md](<11-platform.md>) | unit (static analysis of manifests and imports), integration (row 8: a started host with a child) | TQ-R5 (A assumed) |
| PLAT-BVA-01 | [11-platform.md](<11-platform.md>) | unit (fake clock) | K (day = 86400 s) |
| PLAT-BVA-02 | [11-platform.md](<11-platform.md>) | integration | K (limits frozen at V3-K) |
| PLAT-DT-01 | [11-platform.md](<11-platform.md>) | integration | — |
| PLAT-DT-02 | [11-platform.md](<11-platform.md>) | integration | K (`plugin-set-incomplete`, D§8.2), TQ-17 |
| PLAT-DT-03 | [11-platform.md](<11-platform.md>) | integration (each row is a full suite run), e2e (UI rows) | — |
| PLAT-ST-01 | [11-platform.md](<11-platform.md>) | unit | P:S3 |
