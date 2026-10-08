# C1 CLI-r2 independent ISTQB affected test-design review

**Verdict: no material affected source blocker; SOURCE_ONLY_NOT_RUN.** The fresh successor addresses original H01 in source. It guards the complete retained HTTP exchange with one owning-process absolute alarm and adds the selected positive-only blocked-body/restoration control. Neither that control nor Q01–Q03 has run. This review grants no execution GO or acceptance.

Independent reviewer: gpt-6.1-sol, max reasoning, English; 2026-10-08. Scope is the final CLI-r2 driver, observer, proposed plan, README, literal delta and public manifest metadata, under AGENTS.md and the sealed CLI-r2 selection. The complete affected source was read before the final CODE pair. Only inert public text, JSON, literal comparison and SHA256 work was performed. No candidate evaluation, runtime, socket/timer control, listener, CLI, browser, provider, private-content or protected-semantic investigation occurred. Existing source and evidence remain unchanged.

## Affected design and coverage

The real transport sets its exchange end to `min(original RPC end, monotonic()+2)`. One `ITIMER_REAL`/`SIGALRM` scope covers request/connect/write, response headers and the bounded body read. Fixed socket timeouts supplement this absolute bound. An inactive original timer, default handler and unblocked signal are required before installation. Both ordinary and exceptional exits disarm and restore the original timer/handler before connection close and subsequent child cleanup. The handler emits a source-owned exception without response/error content; the actual transport alone converts its timeout to `EXECUTOR_HTTP_TOTAL_DEADLINE`. The first failure retains its original identity. No second endpoint, retry, model, thread or process is added.

The selected `HTTP_DEADLINE_CONTRACT` runs at most once in the positive driver, after root GO/pins/build-proof checks and before creating the case/profile or CLI. Within at most 0.2 seconds inside existing ceilings, two owning socketpairs exercise the real `HTTPResponse`: complete literal headers with a declared one-byte body withheld must time out while reading that body; a subsequent complete one-byte response must succeed. The source checks response/socket closure, original timer/handler restoration and unchanged first-failure object identity after each. Expected local timeout never resets or latches the real failure. This is a meaningful regression oracle for the original blocked-body gap; it is not exhaustive request/header/error/race coverage and introduces no separate public control counter.

| Partition | Source oracle | Actual status |
| --- | --- | --- |
| Ordinary complete exchange | Original bounded header/body and JSON/RPC gates survive the alarm scope | NOT_RUN |
| Expired/slow real exchange, including body read | Stable timeout failure, original first reason retained, restoration before close/cleanup | NOT_RUN |
| Foreign handler/timer or blocked SIGALRM | Fail before taking ownership of the alarm | NOT_RUN |
| Expected blocked-body control | Typed timeout after body wait; closed sockets and unchanged first reason | NOT_RUN |
| Follow-up one-byte control | Real complete read after restoration; no lingering alarm or socket | NOT_RUN |
| Other exception, repeated/late alarm or cleanup failure | Enabled/fired containment, nested disarm and original fail-closed final gates | NOT_RUN; source-only analysis |

The mechanism depends on the selected owning main-process POSIX signal support. Source restoration and deadline checks do not promise universal OS scheduling latency, atomic cancellation or an instantaneous stop. The two controls do not prove every real network or late-settlement interleaving.

## Conserved cases and meaningful actual oracles

Namespace normalization makes the observer byte-identical to the original. The original child/termination, setup, authentication and listener helpers are conserved. The entire main/final wrapper is conserved after removal of the single selected positive control call. The literal four-file delta was independently regenerated. Canonical 65-file metadata and all original 189 input records are conserved; inherited graph authority was reused without another full-host audit.

| Case | Required actual evidence | Remaining scope limit |
| --- | --- | --- |
| Q01 positive, two original CLI processes | Original authenticated readiness and consent; one complete-identity intake with exact deduplication; current CAS pause and zero work; original process stop with factual DF service/fiber terminal admission and service absence; complete EOF, owned group absence and one retained-endpoint connection failure; a new CLI using the same store must report the same paused task/version and duplicate identity with no replay | Idle foundation lifecycle only; no active worker interruption, restored-session work or browser close |
| Q02 disabled, one original CLI | Original Loader disablement, no DF service/routes, no database/vault creation and zero attempts; original owned stop/EOF/group/endpoint gates | Route absence uses the native HTTP fallback, not a standalone worker post-removal 404 |
| Q03 invalid, one original CLI | Fresh owned `home/profiles/web/df-invalid.sqlite` is one relative component under the original profile directory; original constructor rejects before database/vault preparation; failed enabled entry, no DF services/routes/leaves or work; original owned stop gates | Source-supported `SETUP_UNAVAILABLE`; actual code remains NOT_OBSERVED and is not inferred from opaque errors |

All cases retain the original CLI, assigned loopback port 0, original authentication, Loader/Cordis public interfaces and synthetic profile ownership. Production/shared QA and port 3080 are excluded. The read-only observer uses published entry injection and original fiber/service identities; it neither wraps host lifecycle methods nor adds DF disposal calls. No private route-prefix table or raw error is read. Unauthenticated/forged-cookie/foreign-origin refusals, currentness and setup-before-consent checks remain selected. Agent/session/worker/provider/model/tool/external attempts remain zero.

Exit 0 alone is insufficient because the original host may force process exit. PASS jointly requires the retained original SIGTERM submission, admission/disposal observations, EOF, owned group absence, retained listener absence and same-store restart facts. A forced fixture cleanup cannot convert failure to PASS. Denied or unknown signal ownership stops escalation; no retargeting or retry is selected. This bounded oracle observes DF foundation teardown in a real original process, not every hidden host disposer or full active-worker quit. Consumed W01 standalone `RESTARTED` is separate from the planned CLI quit/restart oracle.

## Bounds, closure and root duties

One trusted root controller must create the exclusive plan and absolute monotonic family end once, preserve its digest/deadline, invoke positive → disabled → invalid sequentially, retain each original supported return immediately and stop on any denial/nonzero/uncertainty. Drivers clamp their own case deadlines to that same end. Individual drivers do not independently enforce family ordering or prevent a separate concurrent root invocation.

The family ceiling is 180 seconds, with at most 10 seconds reserved for root records/cleanup within that same deadline. Case ceilings are 120/25/25 seconds, each reserving 10 seconds for case cleanup. Positive boot/RPC/stop limits are 15/20/8 seconds per original boot; negative boot/observation/RPC, stop and final limits are 15/8/2 seconds inside each 25-second case. All ceilings are nested and nonadditive. Maximum starts are three drivers plus four original CLI children, concurrency one. Native HTTP ceilings remain 32/8/8, total 48, with four family-total unsuccessful retained-endpoint stop probes counted separately. The new socketpair control consumes existing budgets and no native HTTP allowance.

The 16-field closed case record remains capped at 4096 bytes/read 4097, commands at 16384, before/after at 4096 and the selected plan at 65536. Original opaque capture caps remain 65536 per stream/131072 aggregate, with complete prefix/EOF and owning-group checks required. Partial/oversized/changed evidence, nonzero returns, forced cleanup or failure to finalize remain fail-closed.

Closure metadata is 202 inputs/8,643,279 bytes: 189 exact inherited records plus 13 additions. Five owned records plus manifest self and four final reviews yield 212 future pins; 207 current input/owned rows, three topology records and no source copies. All proposed GO flags are false, pins are empty, the family deadline is null and starts are zero. The two assigned report destinations were absent before exclusive creation. Source-author absence metadata is historical; the final CODE pair now exists. Root-reported commit 4fea2809345823b3da8cf3f6b165babd5701d482 changes no selected bytes or pins.

The descriptive filled-plan forecast differs by two bytes across illustrative monotonic numbers (author 35720; CODE 35718). Numeric width varies; the actual 65536-byte plan gate is the controlling oracle. This is not a material source finding or a request to alter the sealed packet.

## Disposition

No additional source repair is required by this affected review. Original H01 remains valid for the immutable original CLI packet, which is NOT_RUN/MUST_NOT_EXECUTE. Fresh CLI-r2 is still NOT_RUN until root independently selects its final reviewed plan and performs the supported invocation. Build-r2 and W01 are consumed PASS/DO_NOT_REPLAY; neither establishes Q01–Q03 or their control.

Overall acceptance remains HOLD. Exact criterion reconciliation is separate: full CLI quit is a prospective partial contribution to the criterion that also requires browser close; genuine existing-session resume/work is not selected. Full installed application quit, general recovery/fault coverage, visual/UI, denied cloud and protected final CODE dependencies remain unresolved. Browser LUA is a route restriction, not a blanket Luna model ban. No execution, future GO, canonical acceptance, publication or task-completion claim follows from this report.
