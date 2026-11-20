# C-UI-BACKEND: use cases and derived tables

Written from the requirements only (R-UI-05 / Q-G5, R-UI-10, R-ROUTE-05 / K3, design §13.6, R-FN-01
with Q-N1 and Q-N3 = A, R-EXT-13, Q-U2, Q-G4) and the surface the dev session relayed. Nothing under
`packages/dsh-connector/src/ui/` was read. `cases.mjs` registers one test per row below, named
`<id> <row> [SDK …] <title>`. Rows marked *Q-UIB-n* were open questions; they are written from the dev session's answers
(2026-11-16, constants.mjs `DECIDED`).

Actors: the **owner** (the user, through embed-UI's drawing, which calls the owner-only routes),
an **agent** (any principal calling the contributed tools through C-EXT), **embed-UI** (the
contributor package `dsh-connector-ui`, which only declares the tools), the **hand-over service**
(K3, the source of marks and targets).

## Use cases

### UIB-UC-01 Hand over an unmanaged session
- Preconditions: the backend is provided on the connector row; at least one enabled, paired principal.
- Main: the owner reads `state` → `targets` lists the enabled, paired principals in `principals()`
  order; the owner POSTs `handover {sessionId, principalKey}` → the service's `handOver(sessionId,
  principalKey)` is called with the note omitted → 200 `{ok: true, principal, state}`; the session
  appears in `marks`.
- A1: a `note` is given → it is passed as the third argument.
- E1: the service refuses (`unknown-session`, `conflict`, `no-agent`) → 409 `{ok: false, code,
  state}`, nothing changes.
- E2: the body is not JSON or not the closed shape → 400 `invalid-request`; the service is not called.
- E3: the service throws or rejects → 500 `operation-failed`.
- Postcondition: marks = `managed()`; every JSON answer is `application/json; charset=utf-8`, `no-store`.

### UIB-UC-02 Take back a managed session
- Main: POST `takeback {sessionId}` → `takeBack(sessionId)` → 200 `{ok: true, state}`; the mark goes.
- A1: with `note`. E1: refusal `unknown-session` / `not-managed` → 409. E2: bad body → 400. E3: throw → 500.

### UIB-UC-03 An agent notifies the owner
- Main: an agent calls `notify {message}` → `{ok: true, data: {accepted: true}}`; `notice =
  {message: trimmed, important: false, count: 1}`; `light.on`.
- A1: `important: true` → notice and light important. A2: a second notice replaces the first and
  `count` becomes 2. A3: the owner clicks it (`dismiss`) → `notice: null`, the latch untouched.
  A4: the owner opens the window (`opened`) → notice and latch cleared.
- E1: the trimmed message is empty → `message-empty`. E2: over 4000 code points → `limit-exceeded`.
  A refused call changes nothing.

### UIB-UC-04 The attention latch
- Main: `attention.signal {important}` → `{accepted: true}`, count 1, important ||= important;
  `attention.state {}` reads `{count, important}` and changes nothing.
- A1: the window opens → cleared. A2: embed-UI's contribution ends → reset. A3: the designated
  principal's connection is lost (online → offline, or the designation moves away from an online
  principal) → reset.

### UIB-UC-05 The live view
- Main: GET `events` → `text/event-stream`, a first frame at once, then one frame per change
  (hand-over `onChange`, signal, notify, dismiss, open, latch reset, contribution end); each frame is
  `data: <JSON Snapshot>\n\n`.
- E1: the request is aborted → its stream ends. E2: `close()` → every stream ends.

### UIB-UC-06 Contribution through C-EXT
- Main: with embed-UI (`dsh-connector-ui`) loaded, `tools/list` holds the three public names
  `namespaceOf('dsh-connector-ui') + '.' + local` (K2); calls reach the connector's handlers with
  the C-EXT envelope.
- A1: embed-UI unloads → the three are gone; latch and notice reset (Q-N3); reloading brings them back.
- E1: no embed-UI → none of the three is listed (no notify tool).

## Equivalence partitions

| Id | Rows |
| --- | --- |
| UIB-EP-01 targets filter | 1 enabled+paired+online → listed online; 2 enabled+paired offline → listed offline; 3 disabled → absent; 4 unpaired → absent; 5 disabled+unpaired → absent; 6 nameless → name null; 7 designated → listed like any; 8 order = `principals()` order |
| UIB-EP-02 handOver body | 1 valid without note; 2 valid with note; 3 not JSON; 4 JSON but not an object; 5 sessionId missing; 6 principalKey missing; 7 sessionId not a string; 8 principalKey not a string; 9 note not a string; 10 an extra key; 11 empty body; 12 empty-string sessionId / 12b principalKey → passed unchanged, the service's refusal → 409 *Q-UIB-4* |
| UIB-EP-03 takeBack body | 1 valid; 2 with note; 3 not JSON; 4 not an object; 5 sessionId missing; 6 sessionId not a string; 7 note not a string; 8 extra key (incl. principalKey); 9 empty-string sessionId → passed unchanged *Q-UIB-4* |
| UIB-EP-04 notify args (C-EXT) | 1 message only; 2 important true; 3 important false; 4 markup is kept as plain text; 5 important not a boolean → invalid-arguments; 6 message missing → invalid-arguments; 7 extra key → invalid-arguments |
| UIB-EP-05 attention args (C-EXT) | 1 signal {important: true}; 2 signal {important: false}; 3 signal {} → invalid-arguments; 4 signal extra key → invalid-arguments; 5 state {} → ok; 6 state extra key → invalid-arguments |
| UIB-EP-06 surface | 1 service frozen, apiVersion 1, routes = UI_ROUTE (frozen, six absolute paths); 2 provide: service and six routes, each inside an effect, `requestBody: 'buffered'`; 3 the three definitions are valid K2 tools with closed schemas and notify declares `message-empty`; 4 no card or record surface (Q-U2, Q-G4); 5 snapshot shape |
| UIB-EP-07 ignored bodies | 1 dismiss with any body → 200; 2 opened with any body → 200 |

## Boundary values

| Id | Values |
| --- | --- |
| UIB-BVA-01 trimmed message code points | 0 (empty), whitespace only, 1, 1 inside whitespace, 4000, 4001, 4000 astral, 4001 astral, 3999 + 1 astral (4001 UTF-16 units), 4000 inside whitespace |
| UIB-BVA-02 request body UTF-8 bytes | 65536 ASCII → accepted; 65537 ASCII → 400; 65536 with multi-byte characters → accepted; over 65536 bytes but under 65536 UTF-16 units → 400; 6 dismiss / 6b opened over the limit → 200, body never read *Q-UIB-3* |
| UIB-BVA-03 target count | 0, 1, 2 |
| UIB-BVA-04 notice count | 1 after the first, 2 after the second, 1 again after a dismiss |

## Decision tables

**UIB-DT-01 the light** (latch count, latch important, notice pending, notice important → on, important)

| Rule | latch | latch imp. | notice | notice imp. | on | important |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0 | – | no | – | false | false |
| 2 | 1 | false | no | – | true | false |
| 3 | 1 | true | no | – | true | true |
| 4 | 0 | – | yes | false | true | false |
| 5 | 0 | – | yes | true | true | true |
| 6 | 1 | false | yes | false | true | false |
| 7 | 1 | false | yes | true | true | true |
| 8 | 1 | true | yes | false | true | true |

**UIB-DT-02 latch reset on the designated principal** — re-baselined by C-WIRE-2 (the user's q5, "Remove agentToken entirely"): no designated principal exists, so rules 1–3 and 7–11 keep the latch (and the notice) and rules 4–6 are withdrawn; A3, UIB-ST-01 #7 and the routed row 6 keep the latch; UIB-ST-04 #2g is withdrawn. The table below is the original. (a set latch; a change of principals())

| Rule | before | after | reset |
| --- | --- | --- | --- |
| 1 | D designated, online | D offline | yes |
| 2 | D designated, offline | another principal renamed | no |
| 3 | D designated, offline | D online | no |
| 4 | D designated, online | the designation moves to online P | yes |
| 5 | D designated, online | no principal designated | yes |
| 6 | D designated, offline | the designation moves to online P | no |
| 7 | D designated, online; P online | P offline | no |
| 8 | D designated, online | D renamed | no |
| 9 | no designated; P online | P offline | no |
| 10 | D designated, online | D's entry deleted | yes, notice stays *Q-UIB-1* |
| 11 | D designated, online | D's entry disabled (still online) | yes, notice stays *Q-UIB-2* |

**UIB-DT-03 the handOver / takeBack route** (body valid?, service outcome → status, body, called?)

| Rule | body | service | status | answer |
| --- | --- | --- | --- | --- |
| 1 | valid | ok | 200 | handOver `{ok, principal, state}`; takeBack `{ok, state}` exactly |
| 2 | valid | each K3 refusal code | 409 | `{ok: false, code, state}`, state unchanged |
| 3 | invalid | – (not called) | 400 | `{ok: false, code: 'invalid-request'}` exactly |
| 4 | valid | throws | 500 | `{ok: false, code: 'operation-failed'}` exactly |
| 5 | valid | rejects | 500 | as rule 4 |

**UIB-DT-04 what each action clears** (latch, notice)

| Rule | action | latch | notice |
| --- | --- | --- | --- |
| 1 | dismiss | kept | cleared |
| 2 | opened | cleared | cleared |
| 3 | contribution end | cleared | cleared |
| 4 | refused notify | kept | kept |
| 5 | attention.state | kept | kept |

## State transitions

**UIB-ST-01 latch** (Clear = {0, false}, Set = {1, false}, Hot = {1, true})

| # | from | event | to |
| --- | --- | --- | --- |
| 1 | Clear | signal(false) | Set |
| 2 | Clear | signal(true) | Hot |
| 3 | Set | signal(false) | Set |
| 4 | Set | signal(true) | Hot |
| 5 | Hot | signal(false) | Hot |
| 6 | Hot | opened | Clear |
| 7 | Set | designated loss | Clear |
| 8 | Hot | contribution end | Clear |
| 9 | Set | dismiss | Set |
| 10 | Clear | opened | Clear |

**UIB-ST-02 notice** (None, Pending(n))

| # | from | event | to |
| --- | --- | --- | --- |
| 1 | None | notify | Pending(1) |
| 2 | Pending(1) | notify (important differs) | Pending(2), message and important replaced |
| 3 | Pending | dismiss | None |
| 4 | Pending | opened | None |
| 5 | Pending | contribution end | None |
| 6 | Pending(1) | refused notify | Pending(1) unchanged |
| 7 | None | dismiss | None (200) |
| 8 | None (after dismiss) | notify | Pending(1) |

**UIB-ST-03 backend lifecycle**

| # | from | event | to |
| --- | --- | --- | --- |
| 1 | created | provide | provided; ctx disposal runs every disposer |
| 2 | provided | provide again | throws |
| 3 | any | contribute(non-function) | TypeError, nothing registered |
| 4 | any | contribute, register throws on the 2nd tool | the 1st disposed, the error rethrown |
| 5 | contributed | dispose, dispose | each registration disposed once |
| 6 | provided, streaming, contributed | close | streams end, no onChange listener left, registrations disposed |
| 7 | closed | close | no throw |
| 8 | contributed | contribute again while active | both registered; ending one resets latch and notice, the other stays *Q-UIB-5* |
| 8b | contributed through C-EXT | contribute again from embed-UI's scope | C-EXT `tool-exists` rethrown; the first unaffected *Q-UIB-5* |

**UIB-ST-04 stream** — #1 open → first frame = snapshot, then quiet; #2a–#2g each change (onChange, signal, notify, dismiss, open, contribution end, designated-loss reset), from a state with the latch set and a notice pending, → exactly one frame = the new snapshot; #2h a refused notify → no frame; #2i–#2l a signal on a set latch with the same importance, a dismiss with no notice, an open with all clear, a contribution end with all clear → no frame; #2m a hand-over onChange with nothing changed → one frame *Q-UIB-7*; #3 abort → that stream ends, others go on; #4 close → all end (UIB-UC-05 E2); #5 two streams each get every change.

## Live view over the real hand-over service (UIB-UC-07, integration with C-ROUTE)
Rows 1–6: a principal connects (light green), disconnects (red), is renamed (name in targets and
marks), is disabled (leaves targets), a new one pairs (joins targets), a hand over through the route
marks the session and a take back clears it; the designated principal's disconnect resets the latch.

## R-FIX-CUI (cui-cases.mjs)

From the requirements relayed for R-FIX-CUI (2026-11-18; `.runtime/reports/review-x-dsh-connector-ui.md`
UI-01, UI-02) and the dev session's port answer (routing `sessions.rootOf(id) → Promise<root | undefined>`;
a read failure → 500 `operation-failed`). The routing world's FakeSessions holds R, its child C and C's child G.

| Id | Technique | Rows |
|---|---|---|
| RFC-UI01 | DT (route × given id × root state), EP | POST handover of C, R unmanaged → 200, marks [R: B], no mark for C; of G with R managed by A → 409 `conflict`, marks unchanged; POST takeback of C, R managed → 200, no mark; R unmanaged → 409 `not-managed`; the session store unreadable → 500 `operation-failed` for both, marks unchanged |
| RFC-UI02 | BVA (N = 1, 2, 2000), ST | a stream nobody reads; N changes → a reader that starts then gets ≤ 3 frames, the last the current snapshot (count N); stalled 2000 → draining → each later change one frame = snapshot; a draining reader sees each change in order; stalled 2000 then cancel / abort / close → the stream ends with ≤ 3 frames left; later changes do not throw; read → changes 1, 2 → read → change 3 → drain: the last frame read is the latest snapshot (3) and no frame older than one already read follows it |
