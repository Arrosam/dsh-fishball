# fishball-core events: MULTI-1 additions

Authority: PLAN-MULTI §5; core contracts README "MULTI-0 amendment" (Provenance, Local keys) and
its normative example "A and B both send eventId event-1"; `events.d.ts` `InterceptedEvent.source`.
Seam (relayed by the implementer 2026-11-18, signatures only): `createEvents({table, link: {ack(receipts, source), live(source)}, …})`,
`intake(event, source)`. Expected values come from the freeze through `../support/targets-oracle.mjs`.

The F-INTERCEPT rows (cases.mjs, rfix.mjs, crash.mjs) are kept: the world plays one target
(`SOURCE.a`) and their message-id oracle is the frozen `fbe_` + base64url tuple form, which
replaced `fbe_<eventId>`.

| Row | Technique | Oracle |
| --- | --- | --- |
| MULTI-EVT-EP-01 1 | EP (origin: both with equal id) | two ledger records keyed by each tuple; two manager messages `fbe_<handle>`; two wakes; each acked on its own mailbox; no misrouted ack |
| MULTI-EVT-EP-01 2 | EP (origin: B only) | B's tuple only; no ack on A |
| MULTI-EVT-EP-01 3 | EP (source shape) | `source` exactly `{targetId, endpointEpoch, serverName, name}` of B; mailbox fields unchanged |
| MULTI-EVT-DT-01 1–2 | DT (interceptor handles × two targets) | one registration covers both: two offers / two wakes; per-mailbox acks |
| MULTI-EVT-DT-01 3 | DT (filter on source.targetId) | only B's copy intercepted; A's goes to Fishball once |
| MULTI-EVT-ST-01 1 | ST (durable → ack → restart → equal id from B) | every ack after its tuple's record exists; B's copy not deduped after restart |
| MULTI-EVT-RETIRED-ST-01 1–4 | ST (pending → SIGKILL → restart with A's epoch retired) + EP (retired / live source) | A's pending inbox copy removed; never admitted nor sent to a model; A's ledger record equal to before the crash; B's pending event delivered once; no ack to a retired link |

# WAKE-BATCH (batch.mjs; settings/wake.mjs; wire/batch.mjs)

Authority: the user-approved wake-batching design relayed 2026-11-21 (items 1–7) and the relayed seam
(`createEvents({batching, timers})`, contracts `WAKE`, `TEXT.batchLimit(n)`; page markers
`data-fishball-wake-setting`, `data-fishball-wake-class`). The pre-batching rows run with
`quietWindowSeconds: 0` (subject.mjs default, a harness choice); oracles unchanged.

| Row | Technique | Oracle |
| --- | --- | --- |
| WAKE-EVT-EP-00 contract / no batching option | EP | WAKE.defaults = 10 s, 20, the listed classes; without `batching` a message waits the 10 s default |
| WAKE-EVT-EP-01 <type> (9 K1 types, drift, other contributed) | EP | alone: no delivery at window − 1 ms, one at the window |
| WAKE-EVT-EP-02 state / settlement / retirement / timer | EP, ST | alone: never a turn, acked, recorded; the next wake delivery holds it; never starts or restarts the timer |
| WAKE-EVT-DT-01 wake→silent / silent→wake / window / max batch | DT (live setting) | a changed `batching()` applies to the next event |
| WAKE-EVT-ST-01 main | ST | events at 0, 6, 12 s → nothing at 21.999 s, one turn at 22 s with all three |
| WAKE-EVT-BVA-01 restart at window − 1 ms / window 0 / real clock | BVA | restart; window 0 = next idle; a real 1 s window is honoured |
| WAKE-EVT-BVA-02 19 / 20 / 21 / silent not counted / max batch 1 | BVA | flush at the limit with TEXT.batchLimit(n); the 21st starts a new buffer |
| WAKE-EVT-DT-02 wake / silent only / wake + silent / nothing (control) | DT | a user message clears the timer; one turn, one model step with the user text and every buffered event; no later turn |
| WAKE-EVT-ST-02 admitted / Stop / restart while buffered | ST | ledger admitted once each; a Stop discards every record of the batch, acked once, no retry; buffered at close → delivered once after the restart |
| WAKE-EVT-UC-01 interceptor first | UC | an interceptor keeps its event; only the Fishball branch is batched |
| WAKE-SET-EP-01/02, BVA-01, CFG-01/02 | EP, BVA, DT | core's page shows and writes the three settings at nested paths; out-of-bounds → alert, no write; Config volatile and normalizing |
| WAKE-SYS-TOOL-01, ST-01, EP-01, EP-02 | system | MCP.tools has workspaces_list / models_list and the manager is offered them; one delivery for three events in a live 2 s window; turn-finished final message reaches the model; persona (item 7) |
