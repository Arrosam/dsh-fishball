# 3. Hand over / Take back through embed-UI and the connector (HAND)

Requirements: R-CON-11, R-ROUTE-01, R-ROUTE-04, R-ROUTE-05, R-ROUTE-06, R-UI-05, R-UI-08,
R-NAME-05, R-WATCH-01. Conventions: [README](<README.md>).

The host-only service is named `fishballConnectorHandover` with `managed()`, `principals()`,
`onChange`, `handOver`, `takeBack` (D§3.6, K).

## Use Cases

### HAND-UC-01 — The user hands a session over to the designated Fishball
**Req:** R-ROUTE-05, R-CON-11, R-UI-05, R-NAME-05, R-WATCH-01, R-WATCH-02 · **Level:** e2e (buttons), integration (service) · **Flags:** P:S4, TQ-8

- **Actor:** DSH owner in main DSH M (C + U installed, with or without I).
- **Preconditions:** D = HF, named "Fishball-2", connected; S1 unmanaged.
- **Main flow:**
  1. S1 shows a **Hand over to Fishball-2** button.
  2. The user clicks it, optionally with a note.
  3. Embed-UI calls the connector's hand-over service in-process (no HTTP, no MCP, no token).
  4. C makes D the managing principal of S1 and commits exactly **one** `handover` event (with the note) to D's mailbox.
  5. C's `onChange` fires; embed-UI redraws S1 with a managed mark "Fishball-2" and a **Take back** button.
- **Alternative flows:**
  - A1. The user hands over a second session S2 → one more `handover` event; two marks.
  - A2. D is designated but **not connected** → the Hand over still succeeds and the event waits in D's mailbox (R-CON-03). *(R-ROUTE-04 refuses only `ask_fishball`; see TQ-8.)*
- **Exception flows:**
  - E1. No designated principal → `no-fishball`; S1 stays unmanaged; no event anywhere; the button reports the refusal.
  - E2. Unknown session id → `unknown-session` (D§3.6).
  - E3. S1 already managed by P2 → refused (K: V2 domain code, e.g. `conflict`); S1's manager unchanged. *(Requirements do not state; TQ-8.)*
- **Postconditions:** S1 is managed by D; D now receives S1's `turn-finished` and `state` events (watch = manage) and its permission requests and questions.

### HAND-UC-02 — The user takes a session back
**Req:** R-ROUTE-05, R-ROUTE-01, R-EVS-03, R-WATCH-04 · **Level:** e2e, integration · **Flags:** —

- **Actor:** DSH owner.
- **Preconditions:** S1 managed by P(E2) (an external agent that started it with `session_start`, or D after a Hand over).
- **Main flow:**
  1. The user clicks **Take back** on S1.
  2. C clears S1's manager and commits one `takeback` event to **P(E2)** (the pair that managed it until then), not to D.
  3. The mark disappears; the button becomes Hand over to D.
- **Alternative flows:** A1. Events queued for P(E2) before Take back stay in its mailbox; no later `turn-finished` / `state` of S1 is produced for anyone.
- **Exception flows:** E1. S1 is unmanaged → refused (K code), no event.
- **Postconditions:** S1's later permission requests go to the user in S1 (no principal); `message_fishball` from S1 now goes to D.

### HAND-UC-03 — Embed-UI keeps marks and names in sync
**Req:** R-UI-05, R-NAME-05, R-CON-11 · **Level:** e2e · **Flags:** P:S4

- **Actor:** embed-UI (web half) observed by the user.
- **Preconditions:** S1 managed by "Fishball", S2 by "Agent B".
- **Main flow:** the marks show "Fishball" on S1 and "Agent B" on S2.
- **Alternative flows:**
  - A1. Agent B calls `set_name("Indexer")` → S2's mark shows "Indexer" without a reload.
  - A2. The user changes `routing.fishballToken` to Agent B's entry → unmanaged sessions' buttons read "Hand over to Indexer"; S1 stays managed by "Fishball" (R-ROUTE-06).
  - A3. Agent B starts S3 with `session_start` → S3 gains a mark "Indexer".
- **Exception flows:** E1. Agent B's entry is revoked → S2's mark disappears; S2 gets one `system` note.
- **Postconditions:** marks always match `managed()`.

### HAND-UC-04 — Hand over in a DSH where embed-UI cannot offer it
**Req:** R-UI-09, R-ARCH-04, R-CON-11 · **Level:** e2e · **Flags:** —

- **Actor:** DSH owner.
- **Main flow:** in a DSH with I + U and a remote target (row 7), the session list shows no marks and no Hand over / Take back.
- **Alternative flows:** A1. In a DSH with C only (no U), no Hand over UI exists; the hand-over service exists but nobody draws it.
- **Exception flows:** —
- **Postconditions:** Hand over for the remote DSH's sessions is possible only in that remote DSH.

## Equivalence Partitioning

### HAND-EP-01 — Who can reach the hand-over service
**Req:** R-CON-11, R-SEC-01, R-ARCH-03 · **Level:** integration · **Flags:** —

| # | Caller | Expected |
| --- | --- | --- |
| 1 | a plugin in the same DSH injecting the service | can call `handOver` / `takeBack` / `managed` |
| 2 | an MCP client (any AT) | no tool or route exposes hand-over; `handover` tool name → unknown tool |
| 3 | a browser fetch to any connector path | no hand-over route; nothing served |
| 4 | a plugin in another DSH | not reachable |
| 5 | the service object | exposes no session read, approval or answer member; `principal.key` is never a token, entry label or id |

## Decision Tables

### HAND-DT-01 — `handOver(sessionId)` outcome
**Req:** R-ROUTE-04, R-ROUTE-05, R-CON-11 · **Level:** integration · **Flags:** TQ-8, K

| Rule | Session exists | Session managed | Designated set | Designated connected | Result | Event |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | no | — | — | — | `unknown-session` | none |
| 2 | yes | no | no | — | `no-fishball` | none |
| 3 | yes | no | yes | yes | ok, manager = D | one `handover` to D |
| 4 | yes | no | yes | no | ok (TQ-8) | one `handover` waits in D's mailbox |
| 5 | yes | yes, by D | yes | — | refused (TQ-8) | none |
| 6 | yes | yes, by P2 ≠ D | yes | — | refused (TQ-8) | none |
| 7 | yes | no | yes, but D's entry disabled | — | `no-fishball` (TQ-8) | none |

### HAND-DT-02 — `takeBack(sessionId)` outcome
**Req:** R-ROUTE-05, R-EVS-03 · **Level:** integration · **Flags:** K

| Rule | Session managed by | Result | `takeback` goes to |
| --- | --- | --- | --- |
| 1 | D (after Hand over) | ok | D |
| 2 | P2 (started it) | ok | P2 |
| 3 | nobody | refused (K) | none |
| 4 | unknown session | `unknown-session` | none |

## State Transitions

### HAND-ST-01 — Management of one session (management = watch)
**Req:** R-ROUTE-01, R-ROUTE-05, R-ROUTE-06, R-WATCH-01, R-HOST-09 · **Level:** integration · **Flags:** TQ-8

States: **Unmanaged**, **Managed(P)**.

| # | From | Event | To | Events produced |
| --- | --- | --- | --- | --- |
| 1 | (none) | P calls `session_start` | Managed(P) | none for the start itself; later `turn-finished` / `state` to P |
| 2 | Unmanaged | Hand over, D = P | Managed(P) | one `handover` to P |
| 3 | Unmanaged | Hand over, no D | Unmanaged | `no-fishball` |
| 4 | Managed(P) | Take back | Unmanaged | one `takeback` to P |
| 5 | Managed(P) | P calls `session_release` | Unmanaged | none (K: does release emit anything? not stated) |
| 6 | Managed(P) | P's entry disabled or deleted | Unmanaged | one `system` note in the session; live offers to the user |
| 7 | Managed(P) | Q24 succession P → P' | Managed(P') | one `system` note; later events to P' |
| 8 | Managed(P) | designated changes P → Q | Managed(P) | none |
| 9 | Managed(P) | Q calls `session_release` on it | Managed(P) | refused `forbidden` (R-ROUTE-02, K) |
| 10 | Unmanaged | any event of the session | Unmanaged | no `turn-finished` / `state` for anyone |
| 11 | Managed(P) | Hand over | Managed(P) | refused (TQ-8) |
