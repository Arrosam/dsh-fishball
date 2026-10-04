# Proposed milestones

| Milestone | Tickets/stages | Exit evidence |
|---|---|---|
| M1 foundation (authorized now) | bounded BUB001,003,006; minimum BUB012 admission | Native plugin fixture on concrete installed host libraries; fail-closed configuration; transactional ledger; durable recovery; scoped approvals; bounded admission; independent code and test reviews |
| M2 first native vertical slice | BUB002,004,005,008,011,012; local parts of013/014 | coordinator → durable task → one DSH worker → local result → independent check → native report/control; real DSH inference only with separate bounded authorization |
| M3 isolated memory | BUB007A then007B; complete008 integration | pinned source/license, real portable reuse, isolated retrieval/corrections; no automatic personal-data import |
| M4 events and first chat channel | BUB009,010/010A; remaining002/005/006/011/012 | provider selected, trusted binding, event/schedule recovery, real chosen channel and permitted scopes |
| M5 results, controls and runtime audit | complete013,014,015 and remaining integration AC | correct artifact version/delivery evidence, real UI function/visual tests, bounded independent runtime audit |
| M6 proposed full preview MVP | BUB016 plus every applicable source AC001–015 including007A/B | full chain/fault acceptance, licenses, reproducible install/uninstall, supported matrix and owner acceptance before publication |

M1 acceptance is not acceptance of the entire BUB001,003,006 or012 tickets. Missing product choices remain together in [decisions](../decisions.md). No scope reduction is implied by the staged order.
