# 10. Embed-UI and the install matrix (UIM)

Requirements: R-UI-01…09, R-ARCH-03, R-ARCH-04, requirements §4 (rows 1–15), §4.2. Conventions:
[README](<README.md>).

## Use Cases

### UIM-UC-01 — The user opens the hosted Fishball page
**Req:** R-UI-01, R-UI-02, R-UI-03, R-HOST-06, R-UI-06 · **Level:** e2e · **Flags:** P:S4

- **Actor:** DSH owner in H with C + I + U (row 8).
- **Preconditions:** the child is running.
- **Main flow:**
  1. The sidebar shows the Fishball entry and fish.
  2. The user opens it → embed-UI asks the locator for a single-use admission URL; the frame loads the child's native page at the **child's own origin**.
  3. Child status and Retry appear outside the frame.
- **Alternative flows:**
  - A1. The user changes the UI language → embed-UI asks for a new admission.
  - A2. The frame reloads → a new ticket is used; the old one is rejected.
- **Exception flows:**
  - E1. The child is down → status shows the code; Retry restarts it.
  - E2. Replaying a used admission URL → rejected by the child.
- **Postconditions:** no credential or token in the frame URL, page, or network responses; no ticket in logs; embed-UI stores no secret.

### UIM-UC-02 — Embed-UI in a DSH with a connector but no instance (Q18)
**Req:** R-UI-08, R-UI-01, R-UI-04, R-UI-05 · **Level:** e2e · **Flags:** P:S4

- **Actor:** DSH owner, row 6 (C + U).
- **Main flow:** marks with principal names and Hand over / Take back (naming the designated Fishball) are shown; the sidebar fish shows attention dots; embed-UI's attention tools are contributed.
- **Alternative flows:** A1. The fish has no page to open: clicking it opens nothing (K: no-op or a hint).
- **Exception flows:** E1. One `instance-missing` diagnostic; no frame registered.
- **Postconditions:** no Fishball page or frame exists.

### UIM-UC-03 — Embed-UI with a remote-target instance (Q4)
**Req:** R-UI-09, R-UI-01, R-FN-01 · **Level:** e2e · **Flags:** P:S4

- **Actor:** DSH owner, row 7 (I + U, remote target).
- **Main flow:** the Fishball page, status and Retry work; the frame is the **local** child.
- **Alternative flows:** A1. Fishball's attention signal (fold-notify) goes to the remote connector; it lights the remote DSH's fish if that DSH runs embed-UI, else `unsupported-operation`.
- **Exception flows:** —
- **Postconditions:** in this DSH: no dots, no marks, no Hand over, no contributed tools, and no traffic over the lifecycle wire other than lifecycle (no relay).

## Equivalence Partitioning

### UIM-EP-01 — What embed-UI registers by service availability
**Req:** R-UI-01, R-UI-04, R-UI-08, R-UI-09 · **Level:** integration · **Flags:** P:S4

| # | `fishballChild` | `fishballConnectorHandover` | `fishballConnectorTools` | Registers |
| --- | --- | --- | --- | --- |
| 1 | no | no | no | nothing (one `instance-missing` line) |
| 2 | yes | no | no | page, frame, status, Retry, Plugins card |
| 3 | no | yes | yes | marks, Hand over, fish + dots, attention tools; no frame |
| 4 | yes | yes | yes | everything |
| 5 | older locator (`apiVersion` ≠ 1) | — | — | treated as absent: `instance-missing` (K) |
| 6 | instance disabled | yes | yes | as #3 |

## Decision Tables

### UIM-DT-01 — Install matrix (requirements §4)
**Req:** §4, R-UI-01, R-UI-08, R-UI-09, R-ARCH-02, R-ARCH-04, R-FB-02, R-FB-06, R-FB-09, R-FB-10, R-HOST-05 · **Level:** integration (headless rows), e2e (UI columns) · **Flags:** P:S4, P:S6

Columns: MCP = endpoint served; Page = Fishball page in this DSH; Marks = marks + Hand over; Dots = fish dots; Tools = embed-UI tools contributed here; FB = a Fishball runs; Status = expected status code.

| Row | Installed | MCP | Page | Marks | Dots | Tools | FB | Status / note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | none | no | no | no | no | no | no | ordinary DSH |
| 2 | C | yes | no | no | no | no | no | `message_fishball` routes to a connected principal; `ask_fishball` `unavailable` with none |
| 3 | U | no | no | no | no | no | no | `instance-missing` once |
| 4 | I, blank | no | no | no | no | no | yes (child) | `target-unreachable`; no UI path |
| 4r | I, remote | no | no | no | no | no | yes | manages remote; no UI path |
| 5 | C + I | yes | no | no | no | no | yes | automatic token; headless |
| 6 | C + U | yes | no | yes | yes | yes | no | `instance-missing`; no page |
| 7 | I + U, remote | no | yes | no | no | no | yes | no relay |
| 7b | I + U, blank | no | yes | no | no | no | yes | `target-unreachable` |
| 8 | C + I + U | yes | yes | yes | yes | yes | yes | everything |
| 8r | 8 + external agents | yes | yes | yes | yes | yes | yes | one manager per session; unmanaged → designated |
| 9 | F → elsewhere | no | own UI | no | no | no | yes | guards as hosted; manual token |
| 9b | F, blank | no | own UI | no | no | no | yes | `target-unset` |
| 10a | F + U | no | own UI | no | no | no | yes | U inert |
| 10b | F + I | no | own UI | no | no | no | yes | the `fishball-instance` row is disabled by core's guards; no nested child |
| 11 | F + C | — | — | — | — | — | — | unsupported: no checks promised (excluded) |
| 12 | C used by hosted + standalone | yes | yes | yes | yes | yes | two | names "Fishball" / "Fishball-2"; clashing rename `name-taken` |
| 13 | feature plugins, no core | no | no | no | no | no | no | each logs `fishball-core-missing` once; boot succeeds |
| 13b | core only | no | own UI | no | no | no | yes | board, fold-notify, Watchdog absent |
| 14 | any F, guard overridden | — | yes | — | — | — | yes | `guards-overridden` naming the guard |
| 15 | hosted child, core disabled | — | yes (status) | — | — | — | no | `fishball-off`; child starts |

Every row also checks R-ARCH-02: no other plugin is refused, hidden or disabled because a Fishball package is present (except the Fishball DSH's own guards).
