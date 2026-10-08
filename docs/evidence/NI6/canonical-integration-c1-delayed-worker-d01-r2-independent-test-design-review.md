# D01-r2 independent affected test-design review

SOURCE_ONLY_NOT_RUN. The selected uncertain-creation cleanup correction resolves D01-ISTQB-01 at source-design level. No new material affected design blocker was found. This is neither runtime PASS nor execution, acceptance or publication GO. Original D01 remains immutable MUST_NOT_EXECUTE. Reviewer: gpt-6.1-sol, max; independent ISTQB lane, separate from author and CODE.

This review reuses the fully read, sealed original D01 design pair and examines the changed risk. It does not repeat an unchanged whole-graph semantic audit. Whole-file inert byte comparison establishes fixture equality after only selected namespaces, latch declaration/assignment and final guard reversal; the entire driver is equal after namespace reversal. Candidate code was never parsed, imported, evaluated, checked, built or run.

## Finding closure and cleanup permission

At fixture line230, `workerCreationAttempted` starts false. Line491 sets it true immediately before the original named `workerCreate` expression at492; there is no intervening await and no reset. The immutable selector's numeric17 is clerical: the unchanged29-operation table and root-qualified author records identify create16, ready query17. No order or call count changed.

The old defect allowed entry/root destruction when a potentially effective create had no validated local `workerAgent`. Line549 now uses `ctx && (!workerCreationAttempted || facts.workerStopped)`. Local handle presence/truthiness is irrelevant. Refusal, rejection, missing reply, timeout, invalid phase, binding, agent lookup/count or late callback cannot convert an attempted create into a pre-create state.

The only assignment of `facts.workerStopped=true` is line533, after the original stopped worker phase, all seven original bindings, empty agent/session registries and agentDisposed/sessionDisposed counts1. These exact original assertions provide the factual permission; the permission alone does not grant PASS. Failures after factual stop may perform bounded teardown while preserving first failure. Positive-path removals542–545 also remain downstream of533.

Before an attempt, the original local cleanup remains eligible. After an attempt without the factual permission, finally548 releases the stream gate,550–553 skip destructive work,554 records rootCleanup UNCERTAIN and closes transport. The owning driver retains its original bounded owned-group/EOF authority. That process closure does not prove an unknown reservation was released or a durable association was reconciled. Conservative preservation may retain an uncertain native/ledger resource; no retry, compensating call, extra signal or cleanup shortcut is authorized.

## Finite source-derived fault partitions

Every declaration is NOT_RUN_SOURCE_DERIVED. The matrix is a static decision-table classification, not ten executed tests, mutation coverage or fault-injection proof. The three reachable permission states are no attempt, attempted/unverified stop, and attempted/factual stop.

| Row | Partition | Destructive fixture cleanup |
| --- | --- | --- |
| M01 | Failure before create submission | Eligible with ctx |
| M02 | Create may act; reply pending; no local handle | Refused |
| M03 | Create refusal or HTTP/RPC rejection | Refused |
| M04 | Timeout, interruption or missing response | Refused |
| M05 | Invalid/not-ready phase or binding | Refused |
| M06 | Invalid agent count, lookup, session or creation count | Refused |
| M07 | Handle exists; factual stopped binding unestablished | Refused |
| M08 | Stopped reply but paired absence/disposition incomplete | Refused |
| M09 | Original stopped binding plus paired absence/disposition established | Eligible; other PASS gates still required |
| M10 | Late callback or falsy handle after attempted creation | Refused without factual stop |

The guard agrees with all ten metadata rows. The new latch exists only in the main invocation scope, with one false initialization, one true assignment and one guard use. Neither a delayed reply nor an event handler can reset it. M05/M06 identify families of invalid evidence; they do not establish that every field mutation or every interleaving has executed. Finite absence observations also do not prove continuous exclusion or instant cancellation.

## Conserved meaningful oracles and false-PASS controls

All38 C/F/G/L controls remain byte-identical:23 header/projection/compact-stream groups, five finish-trace, five wait/freeze and five lifecycle groups. The13080-byte control block SHA256 is `06da8c0022843d356dcfe170150f4181244c64d296596da1cd46b9269cbaff84`. Original D01-D12 remain12 domain groups, total50 source-derived groups. The ten matrix declarations add no named group, HTTP call or helper.

The unchanged original llm/stream waterfall invokes the original next exactly once, forwards its first text delta unchanged, then holds iteration for at most4000ms inside the original work budget. One synthetic original request/stream/worker/session/turn/step executes task A; task B is only queued. No provider replacement, second execution, tool or real external inference occurs. Pending statusA, intakeB, reviseA and statusA must each fully decode with original A factual running, execute unsettled and gate held at send/return; domain assertions and pending facts are required before immutable release/failure freeze. Late callbacks cannot promote the16-field responsiveness record. Finite ceil-ms0..30000 values and public environment are observations to obtain, not measured results now; the existing2s transport bound is not a newly invented <=2000ms criterion threshold.

The unchanged domain journey also requires truthful committed-or-unknown settlement, exact old-CAS STALE_VERSION refusal, original unknown worker binding, fresh corrected goal plus front/middle/end constraints with old goal absent, no adopted artifact, and factual stop/paired absence before destruction. Operation27 directly checks HTTP value.receipt.reservationsHeld===1. Operation29 checks current paused task, same unknown action and all seven execution identity fields/no artifact; later held retention is inference from27 and no finish/release, not a measured status budget scalar. The already resolved ordinary workerQuery task-refresh shape at public installed-worker:255 is reused: STOPPED_QUERY updates currentTask before final version/auth binding. No RuntimeStore or protected body was reopened.

Success remains joint: complete selected command capture, both EOF, owned-group absence, exact original child return, strict closed decoders, main and responsiveness PASS cross-binding, all functional assertions, returned factual disposal predicate, currentness/build/once/auth/policy/consent guards and the supported owner's final return. A positive boolean, restarted root, ten source matrix rows or group count alone cannot establish success. An uncertain path retains FAILED_HOLD/UNKNOWN/UNCERTAIN; valid partial diagnostics remain subject to the original finally window and do not become PASS. RESTARTED is standalone root restart, not whole application quit.

## Bounds, closure and independent checks

I independently matched nine supplied r2 seals and all13 added authority records. Manifest arithmetic is209 distinct inputs /8,868,110 bytes: the196 inherited rows (8,501,749 bytes) are literal-equal, plus13 rows (366,361 bytes) for eight original D01 artifacts, four final finding reports and r2 selection. The inherited65 canonical metadata rows remain exactly1952632 bytes. Five owned files, manifest self and four fresh affected-review destinations yield219 distinct future pins. There are three inherited topology rows and zero source copies. These checks reuse inherited identities; they do not claim a new physical hash/currentness pass over all196 inherited files or a host-tree enumeration. Root's exact currentness gates remain necessary at execution.

The complete four-file281-line delta regenerated byte-exactly with documented unified-diff convention. After namespace normalization, proposal changes are only cleanupCreationAttemptGate, failureCleanup and sourceOnlyFaultPathMatrix. All other manifest limits/effects/protocol/topology metadata is conserved. Three proposal GO flags remain false and pins{};17 exact selected actual destination names and this exclusive report pair were absent at review cut, checked without a private walk. The independent219-pin fixed64-character digest forecast is49327 bytes within the65536 root-plan cap. The forecast is metadata sizing, not a root plan or GO.

Main grammar remains36 fields/63 phases,873 compact and1018 pretty bytes including LF; auxiliary remains16 fields,465/530 bytes. Caps remain1024, read maximum1025; main pretty headroom is six bytes. Previous independent Cartesian scalar forecasts are reused because the entire grammar and serialization/decoder source are conserved, rather than evaluating a candidate helper. Six public records retain original closed decoding, caps and cross-bindings. Private stdout/stderr remain opaque and are never read by this reviewer.

Maximum starts remain three (Python owner and sequential syntax/functional Node), at most two concurrently live, test-worker starts0. Exact HTTP remains29 domain POSTs + authGET + post-removal404 =31. The nonadditive90s family retains setup20, primary85/final reserve5, syntax5 and functional35 including their own cleanup/bookkeeping; fixture work24/final30, gate4 within work, cleanup5 clamped to final-minus0.5. Original private stream caps131072 each/262144 aggregate, request2048/response65536 and public report caps remain. No deadline, process, listener, model, policy, retry, endpoint or helper expansion occurred. Reviewer/author candidate starts are0.

## Criterion and stage limits

The correction improves a Stage2 cleanup-safety partition of BUB004; it does not execute uncertain-create reconciliation. BUB002-02 retains a source-design portion for revision/current context/stale refusal, with genuine subsequent corrected work still missing. BUB002-04 retains the four overlap oracles and public observation plan, with calibrated D3/performance/load/recovery remaining. BUB008 context continuity/model-limit/privacy matrices and BUB012 slot boundaries, budget/status panel, accounting/load/recovery remain separate open evidence needs. Stage3 and final CLI/browser/UI, protected final semantics and aggregate acceptance remain ungranted. No affected full criterion PASS is granted by this SOURCE_ONLY review.

The legacy all87='HOLD' source/diagnostic metadata means aggregate acceptance remains ungranted; it is not an87-row status table and does not justify mechanically assigning every criterion HOLD. Existing DF010-C02 PASS from the sealed consumed actual assessment and other genuine canonical/build/W01 actual cuts remain evidence at their recorded boundaries. This review does not replay, demote, replace or extend them; exact individual reconciliation follows distinct actual cuts. Both existing C02 actual assessment seals were independently re-matched for this preservation statement.

## Boundary and handoff

Prior exposure qualifications remain: a mistaken broad ordinary-field search exposed excluded implementation snippets; a mistaken consumed-namespace filename search exposed private pathnames only; root's narrow public shape read also displayed an unused envelope-helper prefix. Those materials are neither reproduced nor interpreted/used here; no private contents were read, hashed or copied and no pristine historical boundary is claimed. R2 added no such exposure. Protected implementation/final CODE remains BLOCKED_UNCHANGED.

Only these two exclusive0600 reports were created. Administrative public text/JSON/hash/literal comparison and document writes were used; no candidate parser/check/import/eval/test/build/helper/runtime/listener/model/network/browser/cloud/Git action, source edit, private walk or protected semantic read occurred. One administrative expected declaration-line assertion was off by one; raw occurrence inspection corrected it to230 without changing any source or executing any candidate.

Root must complete its separate final affected review/currentness/exclusive supported once selection before any r2 runtime. Future actual assessment must bind the six original public records to the original supported owner return and apply the meaningful joint oracles. Original D01 remains MUST_NOT_EXECUTE. No execution, runtime PASS, acceptance, publication, main merge or remote GO is issued by this report. Full gapless authored readback and external size/SHA sealing precede final handoff; self-identities are supplied externally to avoid self-referential seals.
