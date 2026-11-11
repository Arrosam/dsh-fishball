# 3. Hand over / Take back through embed-UI and the connector (HAND)

Requirements: R-CON-11, R-ROUTE-01, R-ROUTE-04, R-ROUTE-05, R-ROUTE-06, R-UI-05, R-UI-08,
R-UI-10, R-NAME-05, R-NAME-08, R-WATCH-01 (requirements 1.20: the user picks the target). Conventions: [README](<README.md>).

The host-only service is named `fishballConnectorHandover` with `managed()`, `principals()`,
`onChange`, `handOver(sessionId, principalKey, note?)`, `takeBack` (D§3.6, K). The control lists every
enabled, paired principal; **online** = an open `fishball-events` listen stream now (Q-HO-1 decided C).

## Use Cases

### HAND-UC-01 — The user hands a session over to an agent they pick
**Req:** R-ROUTE-05, R-UI-10, R-CON-11, R-UI-05, R-NAME-05, R-NAME-08, R-WATCH-01, R-WATCH-02 · **Level:** e2e (control), integration (service) · **Flags:** —

- **Actor:** DSH owner in main DSH M (C + U installed, with or without I).
- **Preconditions:** enabled, paired principals HF ("Navigator", online) and P2 (no name, id `agent-x`, online); S1 unmanaged.
- **Main flow:**
  1. S1 shows a dropdown **Handover to…** listing "Navigator" and "ID: agent-x", each with a **green** light.
  2. The user picks "ID: agent-x", optionally adding a note.
  3. Embed-UI calls the connector's hand-over service in-process with P2's principal key (no HTTP, no MCP, no token).
  4. C makes **P2** the managing principal of S1 and commits exactly **one** `handover` event (with the note) to P2's mailbox; HF gets nothing.
  5. `onChange` fires; S1 shows a managed mark "ID: agent-x" and a **Take back** button.
- **Alternative flows:**
  - A1. HF is the only enabled, paired principal → S1 shows one button **Hand over to Navigator** with a green light; pressing it hands S1 to HF.
  - A2. P2 is the only one and has no name → the button reads **Hand over to ID: agent-x**.
  - A4. P2 is **offline** (red light) and the user picks it → the Hand over succeeds; P2 becomes S1's manager; the `handover` event waits in P2's mailbox and is delivered when P2 next connects and polls.
  - A3. P2 later sets the name "Indexer" → the mark and every control show "Indexer" without a reload.
- **Exception flows:**
  - E1. No enabled, paired principal exists → S1 shows no Hand over control; a service call is refused `no-fishball`; S1 stays unmanaged.
  - E2. The picked principal is **disabled or deleted** between the menu opening and the click → `no-fishball`; S1 stays unmanaged; the control refreshes without it.
  - E2a. The picked principal merely **disconnects** before the click → the Hand over succeeds (as A4); its light turns red.
  - E4. Another tab handed S1 over first → `conflict`; S1's manager is unchanged; the control is replaced by Take back.
  - E3. Unknown session id → `unknown-session` (D§3.6).
- **Postconditions:** S1 is managed by the picked principal only, which now receives S1's `turn-finished`, `state`, permission requests and questions. The designated Fishball setting played no part.

### HAND-UC-02 — The user takes a session back
**Req:** R-ROUTE-05, R-ROUTE-01, R-EVS-03, R-WATCH-04 · **Level:** e2e, integration · **Flags:** —

- **Actor:** DSH owner.
- **Preconditions:** S1 managed by P(E2), either because it started S1 with `session_start` or because the user handed S1 to it.
- **Main flow:**
  1. The user clicks **Take back** on S1.
  2. C clears S1's manager and commits one `takeback` event to **P(E2)**, the pair that managed it until then.
  3. The mark disappears; S1 shows the Hand over control again (R-UI-10).
- **Alternative flows:** A1. Events queued for P(E2) before Take back stay in its mailbox; no later `turn-finished` / `state` of S1 is produced for anyone.
- **Exception flows:** E1. S1 is unmanaged → refused (K code), no event.
- **Postconditions:** S1's later permission requests go to the user in S1; `message_fishball` from S1 now goes to the designated Fishball.

### HAND-UC-03 — Embed-UI keeps marks, names and the control in sync
**Req:** R-UI-05, R-UI-10, R-NAME-05, R-NAME-08, R-CON-11 · **Level:** e2e · **Flags:** —

- **Actor:** embed-UI (web half) observed by the user.
- **Preconditions:** S1 managed by "Fishball"; S2 managed by a principal with no name, id `agent-b`; S3 unmanaged; two enabled, paired principals, both online.
- **Main flow:** the marks read "Fishball" on S1 and "ID: agent-b" on S2; S3 shows the "Handover to…" dropdown.
- **Alternative flows:**
  - A1. The `agent-b` principal calls `set_name("Indexer")` → S2's mark and S3's dropdown entry read "Indexer" without a reload.
  - A2. One of the two principals disconnects → its row stays in S3's dropdown and its light turns **red** without a reload; it turns **green** again when it reconnects.
  - A3. A third token entry is paired → it appears in S3's dropdown; it disappears when its entry is disabled or deleted.
  - A5. Only one principal is listed and it goes offline → the single button stays, with a red light.
  - A4. The user changes `routing.fishballToken` → no mark or Hand over label changes (the designated Fishball has no role in Hand over).
- **Exception flows:** E1. The `agent-b` entry is revoked → S2's mark disappears; S2 gets one `system` note.
- **Postconditions:** marks match `managed()`; the control lists exactly the enabled, paired principals in `principals()`, with lights matching `online`.

### HAND-UC-04 — Hand over in a DSH where embed-UI cannot offer it
**Req:** R-UI-09, R-ARCH-04, R-CON-11 · **Level:** e2e · **Flags:** —

- **Actor:** DSH owner.
- **Main flow:** in a DSH with I + U and a remote target (row 7), the session list shows no marks and no Hand over or Take back control.
- **Alternative flows:** A1. In a DSH with C only (no U), there is no Hand over UI; the hand-over service exists but nothing draws it.
- **Exception flows:** —
- **Postconditions:** Hand over for the remote DSH's sessions is possible only in that remote DSH.

## Equivalence Partitioning

### HAND-EP-01 — Who can reach the hand-over service
**Req:** R-CON-11, R-SEC-01, R-ARCH-03 · **Level:** integration · **Flags:** —

| # | Caller | Expected |
| --- | --- | --- |
| 1 | a plugin in the same DSH injecting the service | can call `handOver` / `takeBack` / `managed` / `principals` |
| 2 | an MCP client (any AT) | no tool or route exposes hand-over; a `handover` tool name is an unknown tool |
| 3 | a browser fetch to any connector path | no hand-over route; nothing served |
| 4 | a plugin in another DSH | not reachable |
| 5 | the service object | no session read, approval or answer member; `principal.key` is never a token or entry label; `principal.id` is the non-secret fishball id |

### HAND-EP-02 — Labels of the Hand over control
**Req:** R-UI-10, R-NAME-08 · **Level:** unit (label builder with the locale files), e2e (rendering) · **Flags:** —

| # | Enabled, paired principals | Control, labels and lights |
| --- | --- | --- |
| 1 | none enabled and paired | no Hand over control |
| 2 | one, named "Navigator", online | button "Hand over to Navigator", green light |
| 2a | one, named, offline | the same button, red light |
| 3 | one, no name, id `agent-x` | button "Hand over to **ID:** agent-x" (prefix bold) |
| 3a | one, **named** "ID: agent-x" by hand | button "Hand over to ID: agent-x" in plain text (visibly different from row 3) |
| 4 | two: "Navigator" online, nameless `agent-x` offline | dropdown "Handover to…": "Navigator" green, "**ID:** agent-x" (bold prefix) red |
| 4a | an entry that is paired but **disabled** | not listed |
| 4b | an entry that is enabled but **unpaired** | not listed |
| 5 | three, all named | dropdown with three names, in a stable order (K) |
| 6 | any | no label reads "Hand over to Fishball" unless a principal is actually named "Fishball" |
| 7 | UI language switched | all labels come from embed-UI's locale files; the name and id are inserted unchanged |
| 8 | a name with markup characters (`<b>x</b>`) | shown as text, never interpreted |
| 9 | every light | has a text alternative ("online" / "offline") for screen readers; colour is not the only signal |

### HAND-ST-02 — A listed principal's status light
**Req:** R-UI-10, R-UI-05 · **Level:** integration (service + embed-UI host half), e2e (rendering) · **Flags:** —

| # | From | Event | To | Observable without a page reload |
| --- | --- | --- | --- | --- |
| 1 | (not listed) | an enabled entry is paired | Listed, Offline | row added, red light |
| 2 | Offline | the principal opens a `fishball-events` listen stream | Online | light turns green |
| 3 | Online | its last listen stream closes (disconnect, network loss) | Offline | light turns red; row stays |
| 4 | Online | it makes authenticated requests but holds no listen stream | Offline | stays red (online = listen stream) |
| 5 | Online or Offline | its entry is disabled | (not listed) | row removed |
| 6 | (not listed, disabled) | entry re-enabled | Listed, Offline | row back, red until it listens |
| 7 | any | entry deleted | (not listed) | row removed |
| 8 | Online | the principal renames itself | Online | the row's label changes |
| 9 | any | the connector restarts | Offline (all) | all lights red until each reconnects |

## Decision Tables

### HAND-DT-01 — `handOver(sessionId, principalKey)` outcome
**Req:** R-ROUTE-05, R-CON-11, R-UI-10, R-CON-03 · **Level:** integration · **Flags:** K

| Rule | Session exists | Session managed | Chosen principal | Result | Event |
| --- | --- | --- | --- | --- | --- |
| 1 | no | — | any | `unknown-session` | none |
| 2 | yes | no | no enabled, paired principal at all | `no-fishball` | none |
| 3 | yes | no | enabled, paired, online | ok; manager = chosen | one `handover`, delivered with the usual hint |
| 4 | yes | no | the designated Fishball | ok; manager = it (as rule 3; no special case) | one `handover` to it |
| 5 | yes | no | enabled, paired, **offline** | ok; manager = chosen | one `handover` waits in its mailbox until it connects (R-CON-03; 30 days if it is later disabled, R-TOK-05) |
| 6 | yes | no | disabled or deleted at call time | `no-fishball` | none; `onChange` refreshes the control |
| 7 | yes | yes (by anyone) | any | `conflict` | none; manager unchanged |
| 7a | yes | no | enabled but unpaired | refused (K: `no-fishball`) | none |
| 8 | yes | no | unknown key | refused (K code) | none |

### HAND-DT-02 — `takeBack(sessionId)` outcome
**Req:** R-ROUTE-05, R-EVS-03 · **Level:** integration · **Flags:** K

| Rule | Session managed by | Result | `takeback` goes to |
| --- | --- | --- | --- |
| 1 | P (after a Hand over to P) | ok | P |
| 2 | P2 (started it) | ok | P2 |
| 3 | nobody | refused (K) | none |
| 4 | unknown session | `unknown-session` | none |

## State Transitions

### HAND-ST-01 — Management of one session (management = watch)
**Req:** R-ROUTE-01, R-ROUTE-05, R-ROUTE-06, R-WATCH-01, R-HOST-09 · **Level:** integration · **Flags:** —

States: **Unmanaged**, **Managed(P)**.

| # | From | Event | To | Events produced |
| --- | --- | --- | --- | --- |
| 1 | (none) | P calls `session_start` | Managed(P) | none for the start itself; later `turn-finished` / `state` to P |
| 2 | Unmanaged | Hand over to enabled, paired P (online or offline) | Managed(P) | one `handover` to P (queued if offline) |
| 3 | Unmanaged | Hand over with no enabled, paired principal | Unmanaged | `no-fishball` |
| 4 | Managed(P) | Take back | Unmanaged | one `takeback` to P |
| 5 | Managed(P) | P calls `session_release` | Unmanaged | none (K: does release emit anything? not stated) |
| 6 | Managed(P) | P's entry disabled or deleted | Unmanaged | one `system` note in the session; live offers to the user |
| 7 | Managed(P) | Q24 succession P → P' | Managed(P') | one `system` note; later events to P' |
| 8 | Managed(P) | the designated Fishball changes | Managed(P) | none |
| 9 | Managed(P) | Q calls `session_release` on it | Managed(P) | refused `forbidden` (R-ROUTE-02, K) |
| 10 | Unmanaged | any event of the session | Unmanaged | no `turn-finished` / `state` for anyone |
| 11 | Managed(P) | Hand over (service call) | Managed(P) | `conflict` |
| 12 | Unmanaged | Hand over to a principal that just disconnected | Managed(P) | one `handover` waits in P's mailbox |
| 13 | Unmanaged | Hand over to a principal disabled a moment before | Unmanaged | `no-fishball` |
