# fishball-core events: MULTI-1 additions

Authority: PLAN-MULTI §5; core contracts README "MULTI-0 amendment" (Provenance, Local keys) and
its normative example "A and B both send eventId event-1"; `events.d.ts` `InterceptedEvent.source`.
Seam (relayed by the implementer 2026-11-18, signatures only): `createEvents({table, link: {ack(receipts, source), live(source)}, …})`,
`intake(event, source)`. Expected values come from the freeze through `../wire/targets-oracle.mjs`.

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
