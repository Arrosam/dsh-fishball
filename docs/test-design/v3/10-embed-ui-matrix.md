# 10. Embed-UI and the install matrix (UIM)

Requirements: R-UI-01…09, R-ARCH-03, R-ARCH-04, requirements §4 (rows 1–15), §4.2. Conventions:
[README](<README.md>).

## Use Cases

### UIM-UC-01 — The user opens the hosted Fishball page
**Req:** R-UI-01, R-UI-02, R-UI-03, R-HOST-06, R-UI-06 · **Level:** e2e (E3–E5 also integration with a scripted browser) · **Flags:** —

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
  - E3. The user opens the host DSH as `localhost` (or `[::1]`, or `127.0.0.1`) → the frame is opened under the **same** hostname with the child's port and the ticket bound to it; the page loads (S4-Q1 decided A). A frame under a different hostname than the main page would get 401 (`SameSite=Strict`) and is never produced.
  - E4. The host DSH is reached under a non-loopback name (for example through a tunnel) → no frame; embed-UI shows "Open DSH at 127.0.0.1 to use Fishball" (out of scope).
  - E5. A ticket minted for `localhost` is redeemed at `127.0.0.1` → refused by the child.
- **Postconditions:** the child turns the single-use ticket into **its own login cookie** through DSH's public API, so the browser never sees the child's launch token (S4); no credential or token in the frame URL, page, or network responses; no ticket in logs; embed-UI stores no secret.

### UIM-UC-02 — Embed-UI in a DSH with a connector but no instance (Q18)
**Req:** R-UI-08, R-UI-01, R-UI-04, R-UI-05 · **Level:** e2e · **Flags:** —

- **Actor:** DSH owner, row 6 (C + U).
- **Main flow:** marks with principal names (or `ID: <id>`), the Hand over control (one button naming the one connected agent, or the "Handover to…" dropdown) and Take back are shown; the sidebar fish shows attention dots; embed-UI's attention tools are contributed.
- **Alternative flows:** A1. The fish has no page to open: clicking it opens nothing (K: no-op or a hint).
- **Exception flows:** E1. One `instance-missing` diagnostic; no frame registered.
- **Postconditions:** no Fishball page or frame exists.

### UIM-UC-03 — Embed-UI with a remote-target instance (Q4)
**Req:** R-UI-09, R-UI-01, R-FN-01 · **Level:** e2e · **Flags:** —

- **Actor:** DSH owner, row 7 (I + U, remote target).
- **Main flow:** the Fishball page, status and Retry work; the frame is the **local** child.
- **Alternative flows:** A1. Fishball's attention signal (fold-notify) goes to the remote connector; it lights the remote DSH's fish if that DSH runs embed-UI, else `unsupported-operation`.
- **Exception flows:** —
- **Postconditions:** in this DSH: no dots, no marks, no Hand over, no contributed tools, and no traffic over the lifecycle wire other than lifecycle (no relay).

### UIM-UC-04 — The Fishball entry, and no answer controls in the main DSH
**Req:** R-UI-11, R-UI-12, R-UI-13, R-CON-08, R-ARCH-02 · **Level:** e2e · **Flags:** —

- **Actor:** DSH owner in H (C + I + U), and an agent session S1 in H.
- **Main flow:**
  1. The sidebar shows the Fishball entry with the fish; DSH's own brand mark and name are unchanged.
  2. S1 calls `ask_fishball` → S1's conversation shows a read-only record row for it (R-UI-13), with **no** Allow once / Reject or other answer control; S1 waits.
  3. Fishball answers → the same record shows the answer.
- **Alternative flows:**
  - A1. In row 6 (C + U, no instance) → the sidebar entry is still the fish (no page to open); the brand is still unchanged; records are drawn as in the main flow.
  - A2. Without embed-UI (row 2) → S1 shows DSH's generic tool-call row; still no answer control.
- **Exception flows:** E1. Fishball cannot decide → nothing appears in H's session for the user to press; the ask appears in Fishball's own page (PLAT-UC-07).
- **Postconditions:** embed-UI registered no `sidebar.brand.*` slot; its `ask_fishball` view is read-only.

### UIM-UC-05 — A managed session shows its Fishball requests and their outcomes inline
**Req:** R-UI-13, R-NAME-08, R-UI-12, R-WD-09 · **Level:** e2e (both SDKs), integration (embed-UI client against scripted session events) · **Flags:** —

- **Actor:** DSH owner watching managed session S1 in H (C + I + U); S1 is managed by "Navigator".
- **Preconditions:** embed-UI loaded; S1 handed over to Navigator.
- **Main flow:**
  1. S1 requests permission for a command; it goes to Navigator → S1 shows a read-only record "sent to Navigator" inline, like a tool-use row.
  2. Navigator (or its Watchdog) allows it → the same record shows "allowed".
  3. S1 calls `ask_fishball("Which branch?")` → an inline record shows the question, sent to Navigator.
  4. Navigator answers "main" → the record shows the answer.
- **Alternative flows:**
  - A1. Watchdog sends a high-risk request to the user's card (Q13) → the record shows "sent to your card"; once the user settles the card, the record shows the user's answer.
  - A2. S1 is managed by a nameless principal → the record names it `ID: <id>`.
  - A3. The decision is a justified reject → the record shows "rejected" with the justification text S1 received.
- **Exception flows:**
  - E1. S1 is unmanaged → its permission requests go to the user directly; no Fishball record is drawn for them (only `ask_fishball`, which goes to the designated Fishball, gets a record).
  - E2. The SDK does not expose the decision in S1's own events → the task raises one question to the user (R-UI-13); the case is then revised.
- **Postconditions:** records carry no answer control; embed-UI used no new hand-over-service member and no connector read call to draw them (only S1's own events and the existing `managed()`).

## Equivalence Partitioning

### UIM-EP-01 — What embed-UI registers by service availability
**Req:** R-UI-01, R-UI-04, R-UI-08, R-UI-09 · **Level:** integration · **Flags:** —

| # | `fishballChild` | `fishballConnectorHandover` | `fishballConnectorTools` | Registers |
| --- | --- | --- | --- | --- |
| 1 | no | no | no | nothing (one `instance-missing` line) |
| 2 | yes | no | no | page, frame, status, Retry, Plugins card |
| 3 | no | yes | yes | marks, Hand over, fish + dots, attention tools; no frame |
| 4 | yes | yes | yes | everything |
| 5 | older locator (`apiVersion` ≠ 1) | — | — | treated as absent: `instance-missing` (K) |
| 6 | instance disabled | yes | yes | as #3 |

### UIM-EP-02 — Main page hostname and the child frame
**Req:** R-UI-02, R-HOST-06 · **Level:** integration (scripted browser against a real host and child), e2e · **Flags:** —

| # | Main page opened as | Frame URL host | Result |
| --- | --- | --- | --- |
| 1 | `http://127.0.0.1:<main>` | `127.0.0.1:<child>` | page loads |
| 2 | `http://localhost:<main>` | `localhost:<child>` | page loads |
| 3 | `http://[::1]:<main>` | `[::1]:<child>` | page loads |
| 4 | a tunnel or LAN name | — | no frame; "Open DSH at 127.0.0.1 to use Fishball" |
| 5 | `LOCALHOST` (case variant) | `localhost:<child>` (K: case-normalised) | page loads |
| 6 | any of 1–3, ticket replayed under another of 1–3 | — | refused (the ticket is bound to its hostname) |

## Decision Tables

### UIM-DT-02 — Which inline record a session event draws
**Req:** R-UI-13, R-UI-12 · **Level:** unit (record builder fed scripted session events) · **Flags:** —

| Rule | Session event | Session managed | Record drawn |
| --- | --- | --- | --- |
| 1 | `ask_fishball` tool call | any | "asked <principal>: <question>", pending |
| 2 | its tool result | any | the same record, now with the answer |
| 3 | its tool result is an `unavailable` refusal | any | the record shows "no Fishball available" |
| 4 | permission request | yes, by P | "sent to <P>", pending |
| 5 | its resolution: allow / reject | yes | the record shows the decision (and the reject justification) |
| 6 | its resolution: moved to the user's card | yes | "sent to your card"; then the user's answer when settled |
| 7 | permission request | no | none (DSH's own approval UI handles it) |
| 8 | any record | — | no button, no input; never an answer path |
| 9 | the principal renames itself later | yes | new records use the new name; earlier records keep what they showed (K) |

### UIM-DT-01 — Install matrix (requirements §4)
**Req:** §4, R-UI-01, R-UI-08, R-UI-09, R-ARCH-02, R-ARCH-04, R-FB-02, R-FB-06, R-FB-09, R-FB-10, R-HOST-05 · **Level:** integration (headless rows), e2e (UI columns) · **Flags:** P:S6

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
| 12 | C used by hosted + standalone | yes | yes | yes | yes | yes | two | both default to "Fishball" locally: the first holds it, the second is nameless (`ID: <id>`) until renamed; clashing rename `name-taken` |
| 13 | feature plugins, no core | no | no | no | no | no | no | each logs `fishball-core-missing` once; boot succeeds |
| 13b | core only | no | own UI | no | no | no | yes | board, fold-notify, Watchdog absent |
| 14 | any F, guard overridden | — | yes | — | — | — | yes | `guards-overridden` naming the guard |
| 15 | hosted child, core disabled | — | yes (status) | — | — | — | no | `fishball-off`; child starts |

Every row also checks R-ARCH-02: no other plugin is refused, hidden or disabled because a Fishball package is present (except the Fishball DSH's own guards).
