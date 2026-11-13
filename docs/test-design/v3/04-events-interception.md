# 4. The `fishball-events` stream, exactly-one delivery and core's interception (EVT)

Requirements: R-CON-03, R-CON-04, R-EVS-01…04, R-EVT-01…04, R-INT-01…08, R-ID-06, R-ROUTE-02,
R-ROUTE-03. Conventions: [README](<README.md>).

## Use Cases

### EVT-UC-01 — An external agent receives events through the one subscription
**Req:** R-EVS-01, R-EVS-02, R-EVS-04, R-CON-03, R-CON-04, R-EVT-02, R-EVT-04 · **Level:** integration · **Flags:** —

- **Actor:** external agent P(E1, `a`) with a full AT.
- **Preconditions:** P manages S1.
- **Main flow:**
  1. P opens `subscriptions/listen` with `resourceSubscriptions: ["fishball://events"]` and receives the acknowledgement.
  2. S1 asks a permission → within the same dispatch as the commit to P's mailbox, P gets `notifications/resources/updated {uri: "fishball://events"}`; the notification carries no event body.
  3. P calls `inbox_poll` → one event with `eventId`, `type: "permission"`, source session S1, correlation id = offer id, bounded payload.
  4. P calls `inbox_ack` with the receipt; a later poll does not return it.
- **Alternative flows:**
  - A1. P never subscribes → it sees the same event on its next poll.
  - A2. The notification is lost (stream dropped) → P re-listens, polls once and gets the event.
  - A3. P polls without acking → the event is returned again with the **same** `eventId`.
- **Exception flows:**
  - E1. P polls with a cursor of another pair → `forbidden`.
  - E2. P polls with a stale cursor (older mailbox generation) → explicit `{resync: {reason, headSequence}}`, never a silent skip.
  - E3. P tries `resources/read` / subscribe on any other event URI → not found; there is no per-kind stream.
- **Postconditions:** P received all its events in order, each typed; the connector did no interception for P.

### EVT-UC-02 — The official Fishball dispatches an event to an interceptor or to its agent
**Req:** R-INT-01, R-INT-02, R-INT-04, R-INT-08, R-INT-09, R-EVT-03, R-CON-05 · **Level:** integration (core with a fake link and plugins) · **Flags:** P:S2 (E2 crash window, V3-S2)

- **Actor:** `fishball-core` in a Fishball DSH; plugin X registered `intercept({pluginId: "x", types: ["contributed:demo.ping"]})`.
- **Preconditions:** core is paired, idle, subscribed.
- **Main flow:**
  1. A `contributed:demo.ping` event arrives; core polls it and records it in its acceptance ledger.
  2. Core finds X's matching registration and hands it over; X first calls `await ctl.accept()`, which makes core's record durable and open.
  3. Core acks the event at C only after `accept` resolved; X then acts and its handler returns; core closes the record.
  4. **No** Fishball LLM turn starts, and nothing about the event appears in Fishball's context; it is in the background log only (R-INT-09).
- **Alternative flows:**
  - A1. A `message` event arrives (no registration) → it goes to the Fishball agent through the X9 pipeline and starts exactly one Fishball turn.
  - A3. The same `message` arrives while Fishball is in a turn → core holds it in its delivery list; when the turn ends and nothing is queued, it starts exactly one **new** turn for it (S2).
  - A2. X releases the event with `release(e, {toFishball: true})` → Fishball is woken for it, once.
- **Exception flows:**
  - E1. X's handler throws **before** `accept` → Fishball gets the event and is woken once; X does not see it again.
  - E1a. X's handler throws **after** `accept`, with no `commit` begun → the event goes to Fishball once.
  - E1b. The Fishball DSH restarts while X's record is open → the event is offered to X again with the same `eventId` (X dedupes); if X's plugin is off, Fishball gets it once.
  - E2. The Fishball DSH crashes after acceptance but before the ack → after restart the replay (same `eventId`) is dropped; exactly one wake in total.
  - E2a. The Fishball DSH crashes **during** the Fishball turn for the event → after restart there is no second turn and no notice turn for it; the interrupted turn shows DSH's crash notice (S2-Q2 decided A).
  - E3. An event arrives while Fishball is busy, and the user then stops that turn cleanly → the event is still delivered as the next turn, never lost (the case the earlier design failed, S2).
  - E4. The user stops the Fishball turn that had claimed the event **before** it was admitted, or removes the queued event from DSH's inbox → the event is discarded (acked, no retry, no wake); a permission offer inside it stays live at the connector and can still be answered (S2-Q3 decided A).
- **Postconditions:** the event is handled exactly once, by exactly one side, and acked once.

### EVT-UC-03 — A plugin registers and disposes an interception
**Req:** R-INT-01, R-INT-03, R-INT-04 · **Level:** unit · **Flags:** —

- **Actor:** a plugin in the Fishball DSH.
- **Main flow:** `intercept({pluginId, types: ["notice"]}, onEvent)` → returns `dispose`; the handler receives `ctl` with exactly `accept`, `commit` and `release`; later `dispose()` → `notice` events go to Fishball again.
- **Alternative flows:** A1. A second plugin registers `types: ["notice"]`, priority 0 → accepted, core logs **one** warning naming both plugins; the first registration still wins.
- **Exception flows:** E1. The registration is disposed while an event is in flight to it → the event goes to Fishball.
- **Postconditions:** `priority` defaults to 0.

## Equivalence Partitioning

### EVT-EP-01 — Event types and recipient
**Req:** R-EVS-02, R-EVS-03, R-ROUTE-02, R-ROUTE-03, R-CON-08, R-WATCH-02 · **Level:** integration · **Flags:** —

M = managing pair of the named session; D = designated pair.

| # | Type | Source | Recipient |
| --- | --- | --- | --- |
| 1 | `permission` | managed session | M only |
| 2 | `question` | managed session | M only |
| 3 | `plan-review` | managed session | M only |
| 4 | `permission` | unmanaged session | none: the user answers in the session (R-CON-09) |
| 5 | `settlement` | outcome of an offer | the pair that held the offer |
| 6 | `retirement` | withdrawal of an offer | the pair that held the offer |
| 7 | `turn-finished` | managed session | M; payload says running yes/no and queued yes/no |
| 8 | `state` | managed session | M |
| 9 | `turn-finished` / `state` | unmanaged session | not produced at all |
| 10 | `message` | `message_fishball` from managed session | M |
| 11 | `message` | from unmanaged session | D |
| 12 | `ask` | `ask_fishball` from managed / unmanaged | M / D |
| 13 | `handover` | Hand over | D (now M) |
| 14 | `takeback` | Take back | the previous M |
| 15 | `notice` | connector notice naming no session | D (K: which notices exist) |
| 16 | `contributed:<ns>.<e>` | with / without `sessionId` | see EXT-DT-02 |

### EVT-EP-02 — Mailbox access
**Req:** R-ID-06, R-CON-03, R-EVS-01 · **Level:** integration · **Flags:** —

| # | Access | Expected |
| --- | --- | --- |
| 1 | full AT of the pair: poll / ack / listen / read `fishball://events` | own mailbox |
| 2 | full AT of pair B reading `fishball://events` | B's mailbox only; never A's events |
| 3 | pair-only AT | HTTP 403 `insufficient_scope` |
| 4 | ack of another pair's `eventId` | refused; nothing acked (K code) |
| 5 | ack with a wrong `payloadDigest` | refused (K) |
| 6 | `resources/read fishball://events` | `{pending, headSequence, mailboxGeneration}` only, never bodies (D§3.3) |
| 7 | answering an offer of another pair | `forbidden` |
| 8 | ack confers no answer authority | ack an offer event of own pair, then answer after its revocation → refused |

### EVT-EP-03 — Dispatch inside the Fishball DSH
**Req:** R-INT-02, R-INT-04, R-INT-05, R-EVS-04 · **Level:** unit · **Flags:** —

| # | Class | Expected receiver | Fishball turn |
| --- | --- | --- | --- |
| 1 | no registration for the type | Fishball | yes (if idle, exactly one) |
| 2 | registration for the type, filter true | interceptor | no |
| 3 | registration for the type, filter false | Fishball | yes |
| 4 | registration for the type, filter throws | treated as no match → Fishball (or next match) | yes if Fishball |
| 5 | interceptor accepts then later `release(toFishball)` | Fishball | yes |
| 6 | interceptor's plugin disabled / not ready | Fishball | yes |
| 7 | external agent | events unchanged, no interception | n/a |

### EVT-EP-04 — Per-principal isolation of streams and hints
**Req:** R-ID-06, R-TOK-05, R-EVT-04, R-EVS-03 · **Level:** integration (two pairs P and Q, each with an open listen stream) · **Flags:** —

| # | Event or action | P's stream | Q's stream |
| --- | --- | --- | --- |
| 1 | an event committed to P's mailbox | one `notifications/resources/updated` hint | nothing |
| 2 | an event committed to Q's mailbox | nothing | one hint |
| 3 | P and Q with ids that differ only in case (`agent` / `Agent`; ids are unique and case-sensitive) | hints stay per pair (rows 1–2 hold) | |
| 4 | P's entry is disabled | closed | stays open and keeps receiving its own hints |
| 5 | Q polls after row 1 | — | Q's mailbox has nothing of P's |
| 6 | 100 events to P in a burst | ≥ 1 hint, never more than one per commit | nothing |

## Boundary Value Analysis

### EVT-BVA-01 — Poll page size and cursor
**Req:** R-CON-03 · **Level:** unit · **Flags:** K (page limit frozen at V3-K)

LIMIT = the frozen page limit.

| # | Pending | `limit` | Expected |
| --- | --- | --- | --- |
| 1 | 0 | default | `events: []`, `hasMore: false` |
| 2 | 1 | default | 1 event |
| 3 | LIMIT | LIMIT | LIMIT events, `hasMore: false` |
| 4 | LIMIT + 1 | LIMIT | LIMIT events, `hasMore: true`, next page gives 1 |
| 5 | any | 0 | refused `limit-exceeded` / `invalid-arguments` (K) |
| 6 | any | LIMIT + 1 | refused or clamped (K) |
| 7 | ordering | 3 events committed e1, e2, e3 | returned e1, e2, e3 |

### EVT-BVA-02 — Mailbox capacity (`maxQueuedInputs`)
**Req:** R-CON-09, R-EXT-18 · **Level:** integration · **Flags:** D§3.4 (default 200), K

| # | Queued automated events | Next event | Expected |
| --- | --- | --- | --- |
| 1 | max − 1 | `message` | queued |
| 2 | max | `message` | `queue-full` to the caller |
| 3 | max | `handover` (user note) | queued anyway (D§3.4) |
| 4 | max, then one acked | `message` | queued |

## Decision Tables

### EVT-DT-01 — Recipient of an event (routing)
**Req:** R-EVS-03, R-EVT-01, R-ROUTE-02, R-ROUTE-03, R-ROUTE-04, R-CON-09, R-EXT-17 · **Level:** unit (router), integration · **Flags:** —

| Rule | Names a session | Session managed (at creation) | Follow-up of an earlier event | Designated exists | Recipient |
| --- | --- | --- | --- | --- | --- |
| 1 | yes | yes, by M | no | any | M |
| 2 | yes | no | no | yes | D (only for `message`, `ask`, `notice`, contributor) |
| 3 | yes | no | no | no | none → no-principal rules (message queues, `ask` `unavailable`, contributor `no-fishball`) |
| 4 | no | — | no | yes | D |
| 5 | no | — | no | no | none (as rule 3) |
| 6 | any | any | `settlement` / `retirement` | any | the pair that held the offer |
| 7 | yes | was managed by M, now Take back | `takeback` | any | M |
| 8 | yes | managed by M when the event is created; M changes before delivery | no | any | M (decided at creation) |
| 9 | any | any | any | any | never more than one pair, and exactly **one** mailbox entry per produced event (assert across all rules: count entries in every mailbox) |

### EVT-DT-02 — Interceptor choice
**Req:** R-INT-02, R-INT-03, R-INT-04 · **Level:** unit · **Flags:** —

Registrations R1 (registered first), R2 (second) for the same type.

| Rule | R1 priority | R2 priority | R1 filter | R2 filter | Receiver |
| --- | --- | --- | --- | --- | --- |
| 1 | 0 | 0 | true | true | R1 (earliest); one warning was logged at R2's registration |
| 2 | 0 | 5 | true | true | R2 |
| 3 | 5 | 0 | true | true | R1 |
| 4 | 5 | 0 | false | true | R2 |
| 5 | 5 | 0 | throws | true | R2 |
| 6 | 0 | 0 | false | false | Fishball |
| 7 | −1 | (none) | true | — | R1 (negative priority allowed? K) |
| 8 | 5 | 0 | true, handler throws | true | Fishball (R-INT-04: the event falls back to Fishball, not to R2) |

### EVT-DT-03 — Ack timing and wake
**Req:** R-INT-08, R-EVT-03 · **Level:** integration · **Flags:** P:S2 (rules 4, 5, 7–9; rules 1–3 and 6 settled by S2 `a499141`)

| Rule | Receiver accepted durably | Crash point | Ack sent | Fishball turns started |
| --- | --- | --- | --- | --- |
| 1 | Fishball, yes | none | after acceptance | 1 |
| 2 | Fishball, yes | before ack | after restart, once | 1 in total |
| 3 | Fishball, no | before acceptance | after restart's acceptance | 1 |
| 4 | interceptor, yes | none | after acceptance | 0 |
| 5 | interceptor, yes | before ack | after restart | 0 |
| 6 | Fishball busy (not idle) | — | after acceptance | 1, started as the **next** turn once fully idle; nothing injected into the running turn |
| 7 | Fishball busy; the user then stops the running turn cleanly | — | after acceptance | 1 (as the next turn; the event is not lost) |
| 8 | interceptor, `ctl.accept()` resolved, crash before the handler settles | after `accept` | after `accept` | 0; after restart the open record is offered to the same plugin (dedupe by `eventId`), or to Fishball once if the plugin is off |
| 9 | Fishball, admitted by `followup`, the turn started, then the Fishball DSH crashes | crash after admission | before or after the crash (acceptance preceded it) | **1** (the interrupted turn); after restart: no new turn, no re-delivery, no notice turn; DSH's own crash notice shows on that turn (S2-Q2 decided A) |

### EVT-DT-04 — Where an intercepted event ends up when something fails
**Req:** R-INT-01, R-INT-04, R-INT-08, R-WD-07 · **Level:** unit (core with a scripted interceptor and fake link) · **Flags:** —

| Rule | `ctl.accept()` resolved | `ctl.commit(send)` begun | Failure | Event goes to | Commits to the connector |
| --- | --- | --- | --- | --- | --- |
| 1 | no | no | handler throws / rejects | Fishball, once | at most Fishball's |
| 2 | no | no | plugin off / down / disposed | Fishball, once | at most Fishball's |
| 3 | yes | no | handler throws | Fishball, once | at most Fishball's |
| 4 | yes | no | plugin disabled mid-decision (Watchdog down) | Fishball, once | at most Fishball's |
| 5 | yes | yes, reached the connector | handler throws after sending | stays with the interceptor | the interceptor's only; Fishball gets no turn |
| 6 | yes | yes, never reached the connector | plugin fails during the send | fenced: Fishball, once | at most Fishball's (never both) |
| 7 | yes | no | Fishball DSH restart, plugin up | the same plugin again (dedupe by `eventId`) | the interceptor's only |
| 8 | yes | no | Fishball DSH restart, plugin off | Fishball, once | at most Fishball's |
| 9 | (acted before `accept`) | — | — | treated as not accepted (rules 1–2) | — |

### EVT-EP-05 — What an interceptor-only event leaves behind
**Req:** R-INT-09, R-INT-02, R-SEC-02 · **Level:** integration (Fishball DSH with a scripted interceptor; inspect context and logs) · **Flags:** —

| # | Where | Expected after an event an interceptor handled alone |
| --- | --- | --- |
| 1 | Fishball's next turn (prompt, messages, notices, tool results) | nothing about the event |
| 2 | any other agent session in the Fishball DSH (Watchdog side session excluded: it is the interceptor) | nothing |
| 3 | core's acceptance / delivery records | present as internal state; never shown in any context |
| 4 | the background log | one entry per acceptance, commit and outcome; no token or payload secret |
| 5 | the same event after `release(toFishball)` | appears in Fishball's context once, as the released event |
| 6 | a Watchdog `escalate` later settled by the user | only the non-waking settlement note reaches Fishball (R-WD-09) |
| 7 | a Watchdog allow or justified reject | nothing in Fishball's context; logged only |

## State Transitions

### EVT-ST-01 — One mailbox event
**Req:** R-CON-03, R-EVT-02, R-INT-08, R-EXT-19, R-TOK-05 · **Level:** unit · **Flags:** TQ-2 (decided A)

| # | From | Event | To |
| --- | --- | --- | --- |
| 1 | (none) | commit | Pending (hint sent to the pair's listen streams) |
| 2 | Pending | poll | Pending (same identity) |
| 3 | Pending | ack with correct digest | Acked |
| 4 | Pending | contributor withdrawn (contributed type) | Retired |
| 5 | Pending | offer settled by the user (offer type) | Pending event still present; a `settlement` follows (K: is the offer event retired?) |
| 6 | Pending | principal disabled (any non-offer type, `ask` included) | Held (30 days, R-TOK-05) |
| 6a | Pending (offer type) | principal disabled or deleted | Retired (offer to the user) |
| 6b | Pending / Held | principal deleted | Dropped (an `ask` answers `unavailable` to its asker) |
| 6c | Held | 30 days pass | Dropped (as 6b) |
| 7 | Held | entry re-enabled | Pending |
| 8 | Acked | ack again | Acked (no-op, K) |
| 9 | Acked | contributor withdrawn | Acked (stays with the client) |

### EVT-ST-02 — Core's handling of one event
**Req:** R-INT-01, R-INT-02, R-INT-04, R-INT-05, R-INT-08, R-INT-09, R-EVT-03 · **Level:** unit · **Flags:** P:S2 (rows 2, 4–6, 9–11; rows 1, 3, 7, 8 settled by S2 `a499141`)

| # | From | Event | To |
| --- | --- | --- | --- |
| 1 | Polled | ledger record | Recorded |
| 2 | Recorded | match found | OfferedTo(R) |
| 3 | Recorded | no match | ToFishball |
| 4 | OfferedTo(R) | `ctl.accept()` resolves | Open(R) → ack (core's record, durable) |
| 5 | OfferedTo(R) | throw / reject / plugin down / disposed before `accept` | ToFishball (once) |
| 5a | Open(R), no `commit` begun | throw / reject / plugin down / disposed | ToFishball (once) |
| 5b | Open(R) | `ctl.commit(send)` begins | Committing(R) |
| 5c | Committing(R) | the interceptor fails | Committing(R): the answer is committed or fenced, never both; not sent to Fishball |
| 5d | Open(R) or Committing(R) | handler settles | Closed(R): log only, nothing in any agent's context |
| 5e | Open(R) | Fishball DSH restart, plugin R up | OfferedTo(R) again, same `eventId` (R dedupes) |
| 5f | Open(R) | Fishball DSH restart, plugin R off | ToFishball (once) |
| 6 | Open(R) | `release(toFishball)` | ToFishball |
| 7 | ToFishball | durable acceptance | AcceptedBy(Fishball) → in core's delivery list → ack |
| 10 | AcceptedBy(Fishball), agent fully idle | `runMaintenance` | Admitted (`Agent.followup`; leaves the list) → one turn |
| 11 | AcceptedBy(Fishball), agent busy | the turn ends, nothing queued | Admitted as the next turn |
| 11a | Admitted, turn running | the Fishball DSH crashes | Done (interrupted): no re-wake after restart (S2-Q2 decided A) |
| 12 | AcceptedBy(Fishball), not yet admitted | the user stops the Fishball turn, or removes the queued event from the inbox | Discarded: acked, never retried, no wake; offers inside it stay live at the connector (S2-Q3 decided A) |
| 8 | Recorded | replay with known `eventId` | Recorded (dropped) |
| 9 | Closed(R) | R's plugin then fails | Closed(R): never re-dispatched |
