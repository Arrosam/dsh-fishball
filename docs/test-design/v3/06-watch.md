# 6. Watching is managing (WATCH)

Requirements: R-WATCH-01…05, R-EVS-02, R-EVS-03, R-CON-02. Conventions: [README](<README.md>).

## Use Cases

### WATCH-UC-01 — A principal automatically watches a session it starts
**Req:** R-WATCH-01, R-WATCH-02, R-EVS-02, R-ROUTE-01 · **Level:** integration · **Flags:** TQ-12

- **Actor:** external agent P.
- **Preconditions:** P is paired.
- **Main flow:**
  1. P calls `session_start` (no watch argument exists).
  2. S1 runs one turn and ends with nothing queued → P gets one `turn-finished` with `running: false`, `queued: false`.
  3. Every change of S1's running or pending-interaction state gives P one `state` event.
- **Alternative flows:**
  - A1. P calls `session_message` while S1 is idle and the turn ends at once → P still gets that `turn-finished` (D§3.5: watermark read before the message).
  - A2. A turn ends while a message is queued → `turn-finished` with `queued: true`.
- **Exception flows:** E1. P passes `notifyWhenFinished: true` → refused by schema (`invalid-arguments`, K) or ignored; either way no separate watch exists (TQ-12).
- **Postconditions:** no other principal received any `turn-finished` / `state` of S1.

### WATCH-UC-02 — A watch ends with management
**Req:** R-WATCH-01, R-WATCH-04 · **Level:** integration · **Flags:** —

- **Actor:** P managing S1.
- **Main flow:** P calls `session_release` → events already queued for P stay; S1's later turns produce no `turn-finished` / `state` for anyone.
- **Alternative flows:** A1. Take back by the user → same. A2. P's entry revoked → same, plus one `system` note.
- **Exception flows:** —
- **Postconditions:** S1 is unmanaged and unwatched.

### WATCH-UC-03 — A client calls a removed V2 watch tool
**Req:** R-WATCH-03, R-CON-02 · **Level:** integration · **Flags:** —

- **Actor:** an MCP client written for V2.
- **Main flow:** `tools/list` contains no `session_watch`, `session_unwatch` or `watches_list`.
- **Exception flows:** E1. A `tools/call` to each → the MCP "unknown tool" error.
- **Postconditions:** nothing changed.

## Equivalence Partitioning

### WATCH-EP-01 — Who receives `turn-finished` / `state`
**Req:** R-WATCH-01, R-WATCH-02, R-WATCH-05, R-EVS-03 · **Level:** integration · **Flags:** —

| # | Session class | Receiver |
| --- | --- | --- |
| 1 | started by P | P only |
| 2 | handed over to D | D only |
| 3 | unmanaged | nobody (not produced) |
| 4 | managed by P, with D a different principal | P only, never D |
| 5 | managed by a Fishball whose Watchdog supervises it | Fishball (never Watchdog) |
| 6 | after Q24 succession P → P' | P' only |

## State Transitions

### WATCH-ST-01 — Watch follows management
**Req:** R-WATCH-01, R-WATCH-04 · **Level:** integration · **Flags:** —

| # | From | Event | To | Check |
| --- | --- | --- | --- | --- |
| 1 | Unwatched | `session_start` by P | Watched(P) | next turn → P |
| 2 | Unwatched | Hand over to connected P | Watched(P) | |
| 3 | Watched(P) | `session_release` | Unwatched | queued events stay with P; no later ones |
| 4 | Watched(P) | Take back | Unwatched | same |
| 5 | Watched(P) | revocation / deletion of P | Unwatched | same |
| 6 | Watched(P) | succession P → P' | Watched(P') | later events to P' only; none sent twice (pending ones moved with their `eventId`s) |
| 7 | Watched(P) | any other principal calls a watch tool | Watched(P) | unknown tool |
| 8 | Watched(P) | `session_read` by another principal | Watched(P) | no watch started (K: refused `forbidden` or allowed read) |
