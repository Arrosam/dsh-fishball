# Traceability: requirement → cases

Generated from the `**Req:**` line of every case in this directory, against the requirement IDs of
[v3-requirements.md](<../../planning/v3-requirements.md>) at `e1e5577` plus the decided test-planning questions folded in on this branch (TQ-1 to TQ-5, TQ-R1 to TQ-R5, and the user's OAuth, name, id and Hand over answers of §1.16–§1.20). A case cites a requirement only
when it checks an observable of it. Requirements §4 (install matrix) and §4.1/§4.2 tables are cited
by UIM-DT-01, AUTH-DT-01/02, HOST-DT-01 and EXT-DT-03.

**Requirements with no case:**

| ID | Why |
| --- | --- |
| R-OA-10 | Withdrawn twice (1.16 direct access; 1.25 static headers replaced by the adapter, R-OA-21); the ID is reserved. Its negative is covered by AUTH-UC-07 and AUTH-EP-02 rows 7–8b. |
| R-WD-13 | Withdrawn (requirements 1.14); the ID is reserved. Its old behaviour (idle-stop bypass) is negatively covered by WD-UC-02 and WD-EP-01 #5: every `turn-finished` reaches Fishball. |

**Requirement → cases** (197 requirements, 174 active cases, 6 withdrawn ids kept):

| Requirement | Cases | Count |
| --- | --- | --- |
| R-ARCH-01 | PLAT-UC-04, PLAT-EP-03, PLAT-EP-07 | 3 |
| R-ARCH-02 | UIM-UC-04, UIM-DT-01 | 2 |
| R-ARCH-03 | HAND-EP-01, PLAT-EP-03 | 2 |
| R-ARCH-04 | HAND-UC-04, UIM-DT-01 | 2 |
| R-ARCH-05 | HOST-UC-08, HOST-EP-03, HOST-EP-01, PLAT-EP-03 | 4 |
| R-ARCH-06 | PLAT-UC-04, PLAT-EP-03, PLAT-DT-03 | 3 |
| R-ARCH-07 | PLAT-EP-06 | 1 |
| R-ARCH-08 | PLAT-EP-07 | 1 |
| R-CON-01 | AUTH-UC-08, PLAT-UC-01, PLAT-EP-01 | 3 |
| R-CON-02 | WATCH-UC-03, PLAT-UC-01, PLAT-UC-02, PLAT-EP-02 | 4 |
| R-CON-03 | HAND-DT-01, EVT-UC-01, EVT-EP-02, EVT-BVA-01, EVT-ST-01 | 5 |
| R-CON-04 | EVT-UC-01, REM-UC-02 | 2 |
| R-CON-05 | AUTH-DT-04, EVT-UC-02, REM-UC-02, PLAT-UC-02, PLAT-UC-07, PLAT-ST-01 | 6 |
| R-CON-06 | PLAT-UC-02, PLAT-UC-07, PLAT-ST-01 | 3 |
| R-CON-07 | PLAT-UC-02 | 1 |
| R-CON-08 | EVT-EP-01, UIM-UC-04, PLAT-UC-03, PLAT-UC-07 | 4 |
| R-CON-09 | EVT-BVA-02, EVT-DT-01, PLAT-UC-03 | 3 |
| R-CON-10 | AUTH-UC-01, AUTH-UC-09 | 2 |
| R-CON-11 | HAND-UC-01, HAND-UC-03, HAND-UC-04, HAND-EP-01, HAND-DT-01 | 5 |
| R-EXT-01 | EXT-UC-01, EXT-ST-01 | 2 |
| R-EXT-02 | EXT-UC-01, EXT-EP-01, EXT-EP-02 | 3 |
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
| R-TOK-00 | AUTH-UC-04, AUTH-UC-07, AUTH-EP-02, AUTH-EP-05, AUTH-UC-10, AUTH-DT-08 | 6 |
| R-TOK-01 | AUTH-UC-02, AUTH-UC-03, AUTH-UC-07, AUTH-UC-12, AUTH-EP-02, AUTH-DT-02, PLAT-EP-01 | 7 |
| R-TOK-02 | AUTH-EP-01, AUTH-EP-02 | 2 |
| R-TOK-03 | AUTH-UC-01 | 1 |
| R-TOK-04 | AUTH-UC-01, AUTH-UC-07, AUTH-UC-12, AUTH-EP-04, AUTH-UC-10, HOST-EP-02, PLAT-EP-05 | 7 |
| R-TOK-05 | AUTH-UC-06, AUTH-DT-04, AUTH-ST-05, EVT-EP-04, EVT-ST-01, HOST-UC-04, PLAT-ST-01 | 7 |
| R-TOK-06 | AUTH-UC-07, AUTH-EP-05, AUTH-BVA-06, AUTH-DT-08, REM-EP-03 | 5 |
| R-TOK-07 | AUTH-EP-07 | 1 |
| R-TOK-08 | AUTH-UC-01, AUTH-UC-09, AUTH-EP-04, AUTH-BVA-03, AUTH-ST-01, AUTH-DT-08 | 6 |
| R-TOK-09 | AUTH-UC-06, AUTH-EP-04, AUTH-DT-05, AUTH-ST-01 | 4 |
| R-TOK-10 | AUTH-EP-06 | 1 |
| R-OA-01 | AUTH-UC-02, AUTH-UC-08, AUTH-DT-09, AUTH-EP-10, AUTH-EP-09 | 5 |
| R-OA-02 | AUTH-UC-08, AUTH-EP-01, AUTH-DT-09 | 3 |
| R-OA-03 | AUTH-UC-02, AUTH-EP-01, AUTH-EP-03, AUTH-EP-05, AUTH-DT-01 | 5 |
| R-OA-04 | AUTH-UC-02, AUTH-UC-03, AUTH-EP-06, AUTH-DT-01, AUTH-DT-02, AUTH-ST-02 | 6 |
| R-OA-05 | AUTH-UC-02, AUTH-UC-03, AUTH-UC-08, AUTH-EP-01, AUTH-EP-02, AUTH-DT-07 | 6 |
| R-OA-06 | AUTH-UC-06, AUTH-EP-02, AUTH-DT-04, AUTH-ST-01, AUTH-ST-02, AUTH-ST-05 | 6 |
| R-OA-07 | AUTH-UC-02, AUTH-UC-03, AUTH-EP-01, AUTH-BVA-01, AUTH-BVA-06, AUTH-ST-02, AUTH-ST-05 | 7 |
| R-OA-08 | AUTH-EP-01, REM-UC-03, REM-EP-03 | 3 |
| R-OA-09 | AUTH-UC-02, AUTH-UC-08, PLAT-UC-01 | 3 |
| R-OA-10 | AUTH-UC-07, AUTH-EP-02 | 2 |
| R-OA-11 | AUTH-UC-12, AUTH-UC-10, AUTH-DT-08 | 3 |
| R-OA-12 | AUTH-UC-12, AUTH-UC-10, AUTH-ST-04, AUTH-DT-08 | 4 |
| R-OA-13 | AUTH-UC-12, AUTH-UC-10, AUTH-DT-07, AUTH-EP-08 | 4 |
| R-OA-14 | AUTH-UC-12, AUTH-UC-10, AUTH-DT-07, AUTH-ST-04, AUTH-BVA-07 | 5 |
| R-OA-15 | AUTH-ST-04, AUTH-BVA-07 | 2 |
| R-OA-16 | AUTH-UC-12, AUTH-UC-10, AUTH-ST-06, AUTH-ST-05, AUTH-BVA-08 | 5 |
| R-OA-17 | AUTH-BVA-06, AUTH-UC-10 | 2 |
| R-OA-18 | AUTH-DT-06, AUTH-UC-10 | 2 |
| R-OA-19 | AUTH-DT-06 | 1 |
| R-OA-20 | AUTH-UC-10, AUTH-DT-09, AUTH-EP-10, AUTH-EP-09, REM-UC-03 | 5 |
| R-OA-21 | AUTH-UC-12, AUTH-ST-06 | 2 |
| R-ID-01 | AUTH-UC-02 | 1 |
| R-ID-02 | AUTH-EP-03, AUTH-BVA-02, AUTH-DT-01, AUTH-DT-08 | 4 |
| R-ID-03 | AUTH-UC-02, AUTH-DT-02, AUTH-ST-01, AUTH-ST-02, AUTH-UC-10, AUTH-DT-08, NAME-UC-01 | 7 |
| R-ID-04 | AUTH-UC-04, AUTH-EP-05, AUTH-DT-02, AUTH-ST-01, AUTH-UC-10, AUTH-DT-08 | 6 |
| R-ID-05 | AUTH-UC-03, AUTH-DT-06, AUTH-ST-03, HOST-UC-02 | 4 |
| R-ID-06 | AUTH-UC-02, AUTH-EP-06, AUTH-DT-02, NAME-EP-03, EVT-EP-02, EVT-EP-04, EXT-UC-02 | 7 |
| R-ID-07 | AUTH-UC-05, AUTH-DT-06, AUTH-ST-03, REM-UC-01 | 4 |
| R-ID-08 | AUTH-UC-02, AUTH-UC-04 | 2 |
| R-ID-09 | AUTH-UC-06, AUTH-ST-01 | 2 |
| R-ID-10 | AUTH-UC-05, AUTH-EP-03, AUTH-DT-06, AUTH-ST-03 | 4 |
| R-ID-11 | AUTH-UC-04, AUTH-EP-03, AUTH-EP-07 | 3 |
| R-ID-12 | AUTH-UC-01, AUTH-UC-02, AUTH-UC-09, AUTH-BVA-05, AUTH-UC-10 | 5 |
| R-ID-13 | AUTH-EP-03, AUTH-DT-02, AUTH-DT-06, AUTH-DT-08 | 4 |
| R-NAME-01 | NAME-UC-03, NAME-EP-02, NAME-ST-01 | 3 |
| R-NAME-02 | AUTH-DT-08, NAME-UC-02, NAME-UC-03, NAME-EP-01, NAME-EP-02, NAME-EP-03, NAME-EP-04, NAME-BVA-01, NAME-BVA-03, NAME-DT-02, NAME-ST-01 | 11 |
| R-NAME-03 | AUTH-UC-05, NAME-UC-02, NAME-DT-03 | 3 |
| R-NAME-04 | NAME-UC-01, NAME-EP-04, NAME-DT-01, NAME-ST-01 | 4 |
| R-NAME-05 | AUTH-UC-09, NAME-UC-02, NAME-EP-04, HAND-UC-01, HAND-UC-03 | 5 |
| R-NAME-06 | AUTH-UC-10, NAME-UC-01, NAME-BVA-03, NAME-DT-01 | 4 |
| R-NAME-07 | NAME-ST-01, HOST-UC-03, HOST-ST-02 | 3 |
| R-NAME-08 | AUTH-DT-08, NAME-UC-01, NAME-EP-04, NAME-ST-01, HAND-UC-01, HAND-UC-03, HAND-EP-02, UIM-UC-05 | 8 |
| R-ROUTE-01 | HAND-UC-02, HAND-ST-01, WATCH-UC-01, HOST-UC-03 | 4 |
| R-ROUTE-02 | EVT-EP-01, EVT-DT-01 | 2 |
| R-ROUTE-03 | EVT-EP-01, EVT-DT-01, PLAT-UC-03 | 3 |
| R-ROUTE-04 | AUTH-UC-06, AUTH-DT-04, EVT-DT-01, HOST-UC-01, PLAT-UC-03 | 5 |
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
| R-INT-01 | EVT-UC-02, EVT-UC-03, EVT-DT-04, EVT-ST-02 | 4 |
| R-INT-02 | EVT-UC-02, EVT-EP-03, EVT-DT-02, EVT-EP-05, EVT-ST-02 | 5 |
| R-INT-03 | EVT-UC-03, EVT-DT-02 | 2 |
| R-INT-04 | EVT-UC-02, EVT-UC-03, EVT-EP-03, EVT-DT-02, EVT-DT-04, EVT-ST-02, WD-UC-04 | 7 |
| R-INT-05 | EVT-EP-03, EVT-ST-02 | 2 |
| R-INT-06 | WD-UC-01 | 1 |
| R-INT-07 | WD-UC-01, WD-UC-02, WD-UC-04, WD-EP-01, WD-DT-02, WD-ST-01 | 6 |
| R-INT-08 | EVT-UC-02, EVT-DT-03, EVT-DT-04, EVT-ST-01, EVT-ST-02 | 5 |
| R-INT-09 | EVT-UC-02, EVT-EP-05, EVT-ST-02, WD-UC-04 | 4 |
| R-EVT-01 | EVT-DT-01 | 1 |
| R-EVT-02 | EVT-UC-01, EVT-ST-01, HOST-UC-03 | 3 |
| R-EVT-03 | EVT-UC-02, EVT-DT-03, EVT-ST-02 | 3 |
| R-EVT-04 | EVT-UC-01, EVT-EP-04 | 2 |
| R-FB-01 | HOST-UC-08, HOST-EP-03, PLAT-UC-04, PLAT-EP-03, PLAT-EP-07 | 5 |
| R-FB-02 | HOST-DT-03, UIM-DT-01, PLAT-UC-04, PLAT-DT-04 | 4 |
| R-FB-03 | REM-UC-01, REM-EP-01, REM-DT-01 | 3 |
| R-FB-04 | AUTH-UC-05, AUTH-DT-06, AUTH-ST-03, REM-UC-01, REM-EP-01, REM-DT-01 | 6 |
| R-FB-05 | HOST-UC-05, REM-UC-01 | 2 |
| R-FB-06 | UIM-DT-01, PLAT-EP-04 | 2 |
| R-FB-07 | WD-UC-05, WD-ST-01, PLAT-DT-02 | 3 |
| R-FB-08 | PLAT-EP-06 | 1 |
| R-FB-09 | HOST-DT-03, UIM-DT-01, PLAT-UC-04, PLAT-DT-04 | 4 |
| R-FB-10 | HOST-UC-08, HOST-ST-01, UIM-DT-01, PLAT-UC-04, PLAT-DT-01 | 5 |
| R-FB-11 | PLAT-UC-07 | 1 |
| R-FB-13 | PLAT-UC-04, PLAT-UC-05 | 2 |
| R-FB-12 | PLAT-UC-04, PLAT-DT-04 | 2 |
| R-HOST-01 | HOST-UC-01 | 1 |
| R-HOST-02 | HOST-UC-01, HOST-UC-06, HOST-ST-01, PLAT-UC-06 | 4 |
| R-HOST-03 | HOST-UC-06, HOST-UC-07 | 2 |
| R-HOST-04 | HOST-UC-06, HOST-UC-08, HOST-EP-03 | 3 |
| R-HOST-05 | HOST-UC-01, HOST-UC-02, HOST-UC-05, HOST-EP-02, HOST-DT-01, REM-DT-01, UIM-DT-01 | 7 |
| R-HOST-06 | HOST-UC-01, HOST-ST-01, UIM-UC-01, UIM-EP-02 | 4 |
| R-HOST-07 | HOST-UC-07, HOST-UC-08 | 2 |
| R-HOST-11 | HOST-UC-08, HOST-EP-03, HOST-DT-03 | 3 |
| R-HOST-08 | WD-UC-05, WD-ST-01, HOST-UC-06 | 3 |
| R-HOST-09 | HAND-ST-01, HOST-UC-03, HOST-DT-01, HOST-DT-02, HOST-ST-02, PLAT-ST-01 | 6 |
| R-HOST-10 | HOST-UC-04, HOST-DT-01, HOST-DT-02 | 3 |
| R-UI-01 | UIM-UC-01, UIM-UC-02, UIM-UC-03, UIM-EP-01, UIM-DT-01 | 5 |
| R-UI-02 | UIM-UC-01, UIM-EP-02 | 2 |
| R-UI-03 | UIM-UC-01 | 1 |
| R-UI-04 | EXT-UC-04, UIM-UC-02, UIM-EP-01 | 3 |
| R-UI-05 | HAND-UC-01, HAND-UC-03, HAND-ST-02, UIM-UC-02 | 4 |
| R-UI-06 | HOST-UC-07, UIM-UC-01 | 2 |
| R-UI-07 | REM-UC-01 | 1 |
| R-UI-08 | EXT-DT-03, UIM-UC-02, UIM-EP-01, UIM-DT-01 | 4 |
| R-UI-09 | HAND-UC-04, EXT-DT-03, HOST-UC-05, UIM-UC-03, UIM-EP-01, UIM-DT-01, PLAT-EP-06 | 7 |
| R-UI-10 | NAME-EP-04, HAND-UC-01, HAND-UC-03, HAND-EP-02, HAND-ST-02, HAND-DT-01 | 6 |
| R-UI-11 | UIM-UC-04 | 1 |
| R-UI-12 | UIM-UC-04, UIM-UC-05, UIM-DT-02, PLAT-UC-07 | 4 |
| R-UI-13 | UIM-UC-04, UIM-UC-05, UIM-DT-02 | 3 |
| R-REM-01 | REM-UC-03, REM-EP-02 | 2 |
| R-REM-02 | AUTH-EP-10, REM-UC-03, REM-EP-02 | 3 |
| R-REM-03 | AUTH-UC-07, AUTH-UC-08, AUTH-EP-10, AUTH-EP-09, REM-UC-03, REM-EP-03, PLAT-EP-01 | 7 |
| R-REM-04 | REM-UC-02 | 1 |
| R-REM-05 | AUTH-EP-10 | 1 |
| R-WD-00 | WD-UC-01, WD-EP-03 | 2 |
| R-WD-01 | WD-EP-03 | 1 |
| R-WD-02 | WD-EP-03 | 1 |
| R-WD-03 | WD-UC-01, WD-UC-02, WD-UC-03, WD-UC-07, WD-EP-01, WD-BVA-03, WD-ST-03 | 7 |
| R-WD-04 | WD-UC-03, WD-UC-07, WD-EP-02, WD-BVA-01, WD-BVA-02, WD-BVA-03 | 6 |
| R-WD-05 | WD-UC-03, WD-EP-04 | 2 |
| R-WD-06 | WD-EP-04 | 1 |
| R-WD-07 | EVT-DT-04, WD-UC-04, WD-UC-05, WD-DT-02, WD-ST-01 | 5 |
| R-WD-08 | WD-UC-04, WD-EP-03 | 2 |
| R-WD-09 | WD-UC-01, WD-EP-01, WD-DT-01, UIM-UC-05, PLAT-ST-01 | 5 |
| R-WD-10 | WD-UC-06, WD-ST-02, WD-ST-03 | 3 |
| R-WD-11 | WD-DT-02, WD-ST-02 | 2 |
| R-WD-12 | WD-UC-01, WD-UC-02, WD-EP-01, WD-DT-01, WD-DT-02 | 5 |
| R-WD-13 | — | 0 |
| R-WD-14 | WD-UC-03, WD-UC-07, WD-BVA-02, WD-ST-02 | 4 |
| R-WD-15 | WD-UC-06, WD-UC-07, WD-EP-01, WD-BVA-03, WD-ST-02, WD-ST-03 | 6 |
| R-WD-16 | WD-EP-04, PLAT-UC-04 | 2 |
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
| R-SEC-01 | HAND-EP-01, HOST-EP-01, PLAT-EP-07 | 3 |
| R-SEC-02 | EVT-EP-05, HOST-EP-02, PLAT-EP-05 | 3 |
| R-SEC-03 | PLAT-EP-01, PLAT-BVA-02 | 2 |
| R-SEC-04 | EXT-EP-04 | 1 |

**Case index** (file, level, flags):

| Case | File | Level | Flags |
| --- | --- | --- | --- |
| AUTH-UC-01 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | D§5.2 (`fbt_` prefix), TQ-4 (decided A) |
| AUTH-UC-02 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | P:S7, K |
| AUTH-UC-03 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | TQ-5 (decided A) |
| AUTH-UC-04 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | — |
| AUTH-UC-05 | [01-auth-pairing.md](<01-auth-pairing.md>) | e2e (page), integration (core decisions) | — |
| AUTH-UC-06 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | D§5.3, TQ-2 (decided A), TQ-5 (decided A) |
| AUTH-UC-07 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | — |
| AUTH-UC-11 (withdrawn) | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | — |
| AUTH-UC-12 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration (a second DSH with a `dsh-mcp-client` row and the adapter, both SDKs), e2e (the approval page) | P:S7c |
| AUTH-UC-08 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | — |
| AUTH-UC-09 | [01-auth-pairing.md](<01-auth-pairing.md>) | e2e | — |
| AUTH-EP-01 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | TQ-3 (decided A, confirmed by S7), D§5.5 |
| AUTH-EP-02 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | — |
| AUTH-EP-03 | [01-auth-pairing.md](<01-auth-pairing.md>) | unit (validator), integration (endpoint, core settings) | TQ-1 (decided C) |
| AUTH-EP-04 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | TQ-4 (decided A) |
| AUTH-EP-11 (withdrawn) | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | — |
| AUTH-EP-05 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | — |
| AUTH-EP-06 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | — |
| AUTH-EP-07 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | — |
| AUTH-BVA-01 | [01-auth-pairing.md](<01-auth-pairing.md>) | unit (fake clock), integration | — |
| AUTH-BVA-02 | [01-auth-pairing.md](<01-auth-pairing.md>) | unit, integration | — |
| AUTH-BVA-03 | [01-auth-pairing.md](<01-auth-pairing.md>) | unit | TQ-4 (decided A: minimum 32 characters) |
| AUTH-BVA-04 (withdrawn) | [01-auth-pairing.md](<01-auth-pairing.md>) | unit | — |
| AUTH-BVA-05 | [01-auth-pairing.md](<01-auth-pairing.md>) | unit | D§5.8, K |
| AUTH-BVA-06 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration (fake clock, stock `ClientCredentialsProvider`) | K (limit and window frozen at V3-K), P:S7 |
| AUTH-DT-01 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | — |
| AUTH-DT-02 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | — |
| AUTH-DT-03 (withdrawn) | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | — |
| AUTH-DT-10 (withdrawn) | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | — |
| AUTH-DT-04 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | D§5.3, TQ-2 (decided A), TQ-5 (decided A) |
| AUTH-DT-05 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | — |
| AUTH-DT-06 | [01-auth-pairing.md](<01-auth-pairing.md>) | unit (core with a fake link) | — |
| AUTH-ST-01 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | — |
| AUTH-ST-02 | [01-auth-pairing.md](<01-auth-pairing.md>) | unit | — |
| AUTH-ST-03 | [01-auth-pairing.md](<01-auth-pairing.md>) | unit, e2e (warning) | — |
| AUTH-UC-10 | [01-auth-pairing.md](<01-auth-pairing.md>) | e2e (page), integration (flow with a scripted browser) | — |
| AUTH-DT-07 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | — |
| AUTH-ST-04 | [01-auth-pairing.md](<01-auth-pairing.md>) | unit (fake clock) | — |
| AUTH-ST-06 | [01-auth-pairing.md](<01-auth-pairing.md>) | unit (adapter with a fake connector and fake clock) | P:S7c |
| AUTH-DT-09 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration (a second process holding the port) | K (default port; rule 4's rebind timing) |
| AUTH-ST-05 | [01-auth-pairing.md](<01-auth-pairing.md>) | unit (fake clock), integration | K (maximum chain lifetime) |
| AUTH-DT-08 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | — |
| AUTH-EP-10 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration (a local TLS-terminating proxy as the tunnel) | — |
| AUTH-BVA-08 | [01-auth-pairing.md](<01-auth-pairing.md>) | unit (fake clock) | K (10 s) |
| AUTH-BVA-07 | [01-auth-pairing.md](<01-auth-pairing.md>) | unit (fake clock) | K (60 s and 10 min frozen at V3-K) |
| AUTH-EP-08 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration (stub HTTP servers) | K (time bound; size 5 KiB decided per spec) |
| AUTH-EP-09 | [01-auth-pairing.md](<01-auth-pairing.md>) | integration | — |
| NAME-UC-01 | [02-names.md](<02-names.md>) | integration | — |
| NAME-UC-02 | [02-names.md](<02-names.md>) | integration (core + C), e2e (page and marks) | — |
| NAME-UC-03 | [02-names.md](<02-names.md>) | integration | — |
| NAME-EP-01 | [02-names.md](<02-names.md>) | unit | — |
| NAME-EP-02 | [02-names.md](<02-names.md>) | unit | — |
| NAME-EP-03 | [02-names.md](<02-names.md>) | integration | — |
| NAME-EP-04 | [02-names.md](<02-names.md>) | integration (connector), e2e (embed-UI) | — |
| NAME-BVA-01 | [02-names.md](<02-names.md>) | unit | K (characters = Unicode code points after NFC) |
| NAME-BVA-02 (withdrawn) | [02-names.md](<02-names.md>) | unit | — |
| NAME-BVA-03 | [02-names.md](<02-names.md>) | integration | — |
| NAME-DT-01 | [02-names.md](<02-names.md>) | integration | — |
| NAME-DT-02 | [02-names.md](<02-names.md>) | integration | — |
| NAME-DT-03 | [02-names.md](<02-names.md>) | unit (core), e2e (page) | — |
| NAME-ST-01 | [02-names.md](<02-names.md>) | unit | — |
| HAND-UC-01 | [03-handover.md](<03-handover.md>) | e2e (control), integration (service) | — |
| HAND-UC-02 | [03-handover.md](<03-handover.md>) | e2e, integration | — |
| HAND-UC-03 | [03-handover.md](<03-handover.md>) | e2e | — |
| HAND-UC-04 | [03-handover.md](<03-handover.md>) | e2e | — |
| HAND-EP-01 | [03-handover.md](<03-handover.md>) | integration | — |
| HAND-EP-02 | [03-handover.md](<03-handover.md>) | unit (label builder with the locale files), e2e (rendering) | — |
| HAND-ST-02 | [03-handover.md](<03-handover.md>) | integration (service + embed-UI host half), e2e (rendering) | — |
| HAND-DT-01 | [03-handover.md](<03-handover.md>) | integration | K |
| HAND-DT-02 | [03-handover.md](<03-handover.md>) | integration | K |
| HAND-ST-01 | [03-handover.md](<03-handover.md>) | integration | — |
| EVT-UC-01 | [04-events-interception.md](<04-events-interception.md>) | integration | — |
| EVT-UC-02 | [04-events-interception.md](<04-events-interception.md>) | integration (core with a fake link and plugins) | P:S2 (E2 crash window, V3-S2) |
| EVT-UC-03 | [04-events-interception.md](<04-events-interception.md>) | unit | — |
| EVT-EP-01 | [04-events-interception.md](<04-events-interception.md>) | integration | — |
| EVT-EP-02 | [04-events-interception.md](<04-events-interception.md>) | integration | — |
| EVT-EP-03 | [04-events-interception.md](<04-events-interception.md>) | unit | — |
| EVT-EP-04 | [04-events-interception.md](<04-events-interception.md>) | integration (two pairs P and Q, each with an open listen stream) | — |
| EVT-BVA-01 | [04-events-interception.md](<04-events-interception.md>) | unit | K (page limit frozen at V3-K) |
| EVT-BVA-02 | [04-events-interception.md](<04-events-interception.md>) | integration | D§3.4 (default 200), K |
| EVT-DT-01 | [04-events-interception.md](<04-events-interception.md>) | unit (router), integration | — |
| EVT-DT-02 | [04-events-interception.md](<04-events-interception.md>) | unit | — |
| EVT-DT-03 | [04-events-interception.md](<04-events-interception.md>) | integration | P:S2 (rules 4, 5, 7–9; rules 1–3 and 6 settled by S2 `a499141`) |
| EVT-DT-04 | [04-events-interception.md](<04-events-interception.md>) | unit (core with a scripted interceptor and fake link) | — |
| EVT-EP-05 | [04-events-interception.md](<04-events-interception.md>) | integration (Fishball DSH with a scripted interceptor; inspect context and logs) | — |
| EVT-ST-01 | [04-events-interception.md](<04-events-interception.md>) | unit | TQ-2 (decided A) |
| EVT-ST-02 | [04-events-interception.md](<04-events-interception.md>) | unit | P:S2 (rows 2, 4–6, 9–11; rows 1, 3, 7, 8 settled by S2 `a499141`) |
| WD-UC-01 | [05-watchdog.md](<05-watchdog.md>) | integration | — |
| WD-UC-02 | [05-watchdog.md](<05-watchdog.md>) | integration | — |
| WD-UC-03 | [05-watchdog.md](<05-watchdog.md>) | unit (fake clock, fake link), integration | — |
| WD-UC-04 | [05-watchdog.md](<05-watchdog.md>) | integration | — |
| WD-UC-05 | [05-watchdog.md](<05-watchdog.md>) | integration | — |
| WD-UC-06 | [05-watchdog.md](<05-watchdog.md>) | integration | Q33 |
| WD-UC-07 | [05-watchdog.md](<05-watchdog.md>) | integration (manager tools in a Fishball DSH with a fake link, fake clock and a scripted Watchdog model that counts its calls) | Q33 |
| WD-EP-01 | [05-watchdog.md](<05-watchdog.md>) | unit | Q33 (rows 12–14) |
| WD-EP-02 | [05-watchdog.md](<05-watchdog.md>) | unit (settings validation) | — |
| WD-EP-03 | [05-watchdog.md](<05-watchdog.md>) | integration | — |
| WD-EP-04 | [05-watchdog.md](<05-watchdog.md>) | integration (fake model provider counting lookups) | — |
| WD-BVA-01 | [05-watchdog.md](<05-watchdog.md>) | unit | — |
| WD-BVA-02 | [05-watchdog.md](<05-watchdog.md>) | unit (fake clock) | — |
| WD-BVA-03 | [05-watchdog.md](<05-watchdog.md>) | unit (fake clock, a scripted model that records each call's brief) | Q33 |
| WD-DT-01 | [05-watchdog.md](<05-watchdog.md>) | unit (decision mapping with a scripted model) | — |
| WD-DT-02 | [05-watchdog.md](<05-watchdog.md>) | unit | — |
| WD-ST-01 | [05-watchdog.md](<05-watchdog.md>) | unit | — |
| WD-ST-02 | [05-watchdog.md](<05-watchdog.md>) | unit | Q33 (rows 8–9) |
| WD-ST-03 | [05-watchdog.md](<05-watchdog.md>) | unit (fake clock, scripted model) | Q33 |
| WATCH-UC-01 | [06-watch.md](<06-watch.md>) | integration | — |
| WATCH-UC-02 | [06-watch.md](<06-watch.md>) | integration | — |
| WATCH-UC-03 | [06-watch.md](<06-watch.md>) | integration | — |
| WATCH-EP-01 | [06-watch.md](<06-watch.md>) | integration | — |
| WATCH-ST-01 | [06-watch.md](<06-watch.md>) | integration | — |
| EXT-UC-01 | [07-contributors.md](<07-contributors.md>) | integration | — |
| EXT-UC-02 | [07-contributors.md](<07-contributors.md>) | integration | P:S3 (A3) |
| EXT-UC-03 | [07-contributors.md](<07-contributors.md>) | integration | — (K2: `QUARANTINE.moreThanFailures` = 2, `QUARANTINE.windowOutcomes` = 5) |
| EXT-UC-04 | [07-contributors.md](<07-contributors.md>) | integration | D§13.6 |
| EXT-EP-01 | [07-contributors.md](<07-contributors.md>) | unit | — (K2: `NAME_GRAMMAR.local` 1–48 of `[a-z0-9_.-]`; `SCHEMA_SUBSET`; `TOOL_LIMITS.descriptionBytes` 2048) |
| EXT-EP-02 | [07-contributors.md](<07-contributors.md>) | unit | D§13.3 |
| EXT-EP-03 | [07-contributors.md](<07-contributors.md>) | unit | — |
| EXT-EP-04 | [07-contributors.md](<07-contributors.md>) | unit (service surface), integration | — |
| EXT-BVA-01 | [07-contributors.md](<07-contributors.md>) | unit | — (K2: `NAME_GRAMMAR.publicMaxChars` 128) |
| EXT-BVA-02 | [07-contributors.md](<07-contributors.md>) | unit | — (K2: `EVENT_LIMITS.payloadBytes` 8192, `EVENT_LIMITS.summaryChars` 500; `EMIT_REFUSAL`) |
| EXT-BVA-03 | [07-contributors.md](<07-contributors.md>) | unit (fake clock) | — (K2: `EVENT_LIMITS.ratePerMinute` 30, `rateBurst` 10, `rateWindowMs` 60000; a refused emit takes no token) |
| EXT-BVA-04 | [07-contributors.md](<07-contributors.md>) | unit | — (K2: `TOOL_LIMITS.ceiling.argumentBytes` 65536, `resultBytes` 262144, `timeoutMs` 30000, `contributorInFlightCalls` 16) |
| EXT-DT-01 | [07-contributors.md](<07-contributors.md>) | unit | — (K2: `EMIT_CHECK_ORDER`) |
| EXT-DT-02 | [07-contributors.md](<07-contributors.md>) | unit | — |
| EXT-DT-03 | [07-contributors.md](<07-contributors.md>) | integration | P:S7 (E2p), remote-target harness (E6, E8; X-REMOTE) |
| EXT-ST-01 | [07-contributors.md](<07-contributors.md>) | integration | — |
| HOST-UC-01 | [08-hosted.md](<08-hosted.md>) | integration | — |
| HOST-UC-02 | [08-hosted.md](<08-hosted.md>) | integration | — |
| HOST-UC-03 | [08-hosted.md](<08-hosted.md>) | integration | — |
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
| HOST-ST-02 | [08-hosted.md](<08-hosted.md>) | integration | — |
| REM-UC-01 | [09-standalone-remote.md](<09-standalone-remote.md>) | integration (two DSHs), e2e (page) | P:S7 |
| REM-UC-02 | [09-standalone-remote.md](<09-standalone-remote.md>) | integration | — |
| REM-UC-03 | [09-standalone-remote.md](<09-standalone-remote.md>) | integration | — |
| REM-EP-01 | [09-standalone-remote.md](<09-standalone-remote.md>) | unit | P:S7 (row 6) |
| REM-EP-02 | [09-standalone-remote.md](<09-standalone-remote.md>) | integration | — |
| REM-EP-03 | [09-standalone-remote.md](<09-standalone-remote.md>) | integration | K (allowlist setting) |
| REM-DT-01 | [09-standalone-remote.md](<09-standalone-remote.md>) | unit | — |
| UIM-UC-01 | [10-embed-ui-matrix.md](<10-embed-ui-matrix.md>) | e2e (E3–E5 also integration with a scripted browser) | — |
| UIM-UC-02 | [10-embed-ui-matrix.md](<10-embed-ui-matrix.md>) | e2e | — |
| UIM-UC-03 | [10-embed-ui-matrix.md](<10-embed-ui-matrix.md>) | e2e | — |
| UIM-UC-04 | [10-embed-ui-matrix.md](<10-embed-ui-matrix.md>) | e2e | — |
| UIM-UC-05 | [10-embed-ui-matrix.md](<10-embed-ui-matrix.md>) | e2e (both SDKs), integration (embed-UI client against scripted session events) | — |
| UIM-EP-01 | [10-embed-ui-matrix.md](<10-embed-ui-matrix.md>) | integration | — |
| UIM-EP-02 | [10-embed-ui-matrix.md](<10-embed-ui-matrix.md>) | integration (scripted browser against a real host and child), e2e | — |
| UIM-DT-02 | [10-embed-ui-matrix.md](<10-embed-ui-matrix.md>) | unit (record builder fed scripted session events) | — |
| UIM-DT-01 | [10-embed-ui-matrix.md](<10-embed-ui-matrix.md>) | integration (headless rows), e2e (UI columns) | — |
| PLAT-UC-01 | [11-platform.md](<11-platform.md>) | integration | — |
| PLAT-UC-02 | [11-platform.md](<11-platform.md>) | integration | — |
| PLAT-UC-03 | [11-platform.md](<11-platform.md>) | integration | — |
| PLAT-UC-04 | [11-platform.md](<11-platform.md>) | integration (composition), e2e (page) | — |
| PLAT-UC-05 | [11-platform.md](<11-platform.md>) | integration (+ e2e for the page) | — |
| PLAT-UC-06 | [11-platform.md](<11-platform.md>) | integration | — |
| PLAT-UC-07 | [11-platform.md](<11-platform.md>) | integration (core with a scripted model), e2e (Fishball page) | K (card fields, K3) |
| PLAT-EP-01 | [11-platform.md](<11-platform.md>) | integration | D§3.1 |
| PLAT-EP-02 | [11-platform.md](<11-platform.md>) | integration | K (names D§3.2) |
| PLAT-EP-03 | [11-platform.md](<11-platform.md>) | unit (manifest/static analysis) | — |
| PLAT-EP-04 | [11-platform.md](<11-platform.md>) | integration | — |
| PLAT-EP-05 | [11-platform.md](<11-platform.md>) | integration (full-run acceptance) | — |
| PLAT-EP-06 | [11-platform.md](<11-platform.md>) | integration (traffic trace plus static check) | — |
| PLAT-EP-07 | [11-platform.md](<11-platform.md>) | unit (static analysis of manifests and imports), integration (row 8: a started host with a child) | TQ-R5 (decided B) |
| PLAT-BVA-01 | [11-platform.md](<11-platform.md>) | unit (fake clock) | K (day = 86400 s) |
| PLAT-BVA-02 | [11-platform.md](<11-platform.md>) | integration | K (limits frozen at V3-K) |
| PLAT-DT-01 | [11-platform.md](<11-platform.md>) | integration | — |
| PLAT-DT-02 | [11-platform.md](<11-platform.md>) | integration | K (`plugin-set-incomplete`, D§8.2) |
| PLAT-DT-04 | [11-platform.md](<11-platform.md>) | integration (a real DSH per SDK) | — |
| PLAT-DT-03 | [11-platform.md](<11-platform.md>) | integration (each row is a full suite run), e2e (UI rows) | — |
| PLAT-ST-01 | [11-platform.md](<11-platform.md>) | unit | — |
