# Stage3 independent risk and acceptance test design

Reviewer `/root/istqb_review`, Sol6.1/max, independent of implementation and correctness review. This plan extends the retained [Stage2 design](../S2/test-design.md) and [40-AC preparation](../../prep/W2/test-design.md). It freezes observable risk/requirement oracles before final Stage3 review; a proposed oracle is **NOT RUN** until its exact command/result is recorded in the corresponding review. Root controls Git/integration. This lane owns dedicated adversarial tests and evidence, never author code/tests, credentials, installs, network, personal data or native/browser process control.

The [three-stage authorization](../../three-stage-development.md) allows local unit/module development now and consolidated functional/visual regression after Stage3. It neither passes W1's browser debt nor waives independent ticket reviews. [Current owner amendment](../../owner-amendment-2026-10-04.md) controls dsh-fishball/df/MIT and provider-neutral chat; live chat software/accounts/platform delivery are OUT of this phase. The original BUB IDs/text remain historical aliases. No external model inference, paid call, remote publication, dsh-std, extra harness or daemon is part of this lane.

Source inventory: original BUB007 has six source AC, split007A-01..02 and007B-03..06; the approved source/cards do not enumerate07..09. The main Stage3 matrix below retains36 original source rows, five current DF010 contract rows and20 carried storage/security/environment/resource rows: **61 individual rows**, not61 passed tests. Retained Stage2's remaining002/004/005 source rows and foundation001/016 aggregate debt continue through their existing matrices/register. Nothing in this plan silently retires them.

## Evidence levels and independent oracles

| Level | What can be demonstrated | What it cannot establish |
| --- | --- | --- |
| Structural |Closed schemas/normalizers, hostile descriptor zero-trap rejection, exact hashes and immutable typed fixtures |Private identity, authentic producer/source, atomic storage, native input, recipient delivery or visible UI. |
| Pure semantic |Actual port/clock/compactor production functions, deterministic independently calculated expected values |Durable reconciliation, provider/timezone compatibility beyond the recorded runtime or native composition. |
| Actual module/store |Actual crypto2 SQLite/typed modules, child OS processes, real transactions, abrupt exits and independent reopened readback |Real provider authentication/model inference, native profile/browser rendering or complete cross-stage acceptance. |
| Public native fixture |Installed pinned public DSH/Cordis/AgentLoop/Connection/Slot classes with synthetic identities, captured streams, local deterministic provider/session backend |Live model/provider or signed-in browser credential acceptance; mock renderer is not visual evidence. |
| Consolidated native/browser |Actual isolated Web/profile, supported plugin/UI loading, genuine owner controls, quit/restart, visible accessibility/Chinese/resize/keyboard and combined current-task execution/result flow |No criterion passes until observed after Stage3 and authorized within the agreed runtime scope. |

All mock evidence states sourceKind mock. A durable reference/digest proves equality, never authority. Every negative test inspects resulting rows/receipts/version/holds and zero effect counters; exception existence alone is insufficient. A third independently opened process reads winners where concurrency is claimed. A copied SQL oracle reads refused WAL/hot-journal logical facts without modifying refused originals.

## Risk priorities, partitions and boundaries

| Priority / family | Equivalence partitions and exact boundary values | Required observable oracle |
| --- | --- | --- |
| Critical AUTH/ROUTE |Exact opaque owner/coordinator/host versus worker/reviewer/clone/JSON/foreign owner/workspace/task; paired current private route versus revoked, changed ID/thread, group, forwarded or unbound task |Only privately admitted actor may operate. Wrong raw/ref double hashing and lookalike IDs grant nothing. Original task route remains immutable; no unrelated plaintext, control or approval. |
| Critical EXEC |Prepared context versus ordinary/foreign/stale context; correct versus wrong claim/action/gen/full digest/memory/semantic provenance; requested/held/unknown/released |Begin intent commits once; atomic consume admits at most one current send. Unknown/reopen/duplicate do not send/replay; holds persist until actual stop/effect/message/delivery/handoff proofs. |
| Critical AUDIT |Exact individually allowlisted material and independent charged generation versus producer reuse, unrelated record, wrong target/artifact/version, incomplete coverage, stale semantic revision |Direct core completion blocks pending/failed/unknown/budget/fatal/unexamined/stale; a wrapper or payload pass/resolved flag cannot bypass it. Full immutable report/round history remains. |
| Critical STORAGE |Genuine schemas1/2/3/4, future/current+1, incomplete topology, corrupt row/key/AAD/crypto-v1, WAL/header/sidecar-only, valid/invalid hot DELETE journal, backup collision, write/full faults |Validate under lock before fsynced original backup; source main/sidecars/backup exact on refusal. Supported v2 data survives migration; unproved v1 refuses with explicit owner-provenance recovery gate, no reseal. |
| High CONTEXT/MEM |Namespace missing versus live versus tombstone; revision0 absence versus live revision; same terms foreign spaces; current instructions versus contradictory/expired summary/memory; no-generation versus future worker |Current ledger constraints are protected whole. Memory is sourced optional background; corrections/deletions/tombstones/ID allocation survive reopen and never confer grant/completion. Complete context/provenance digest reaches actual native input. |
| High EVENT |Unique ID versus unavailable/degraded; same full identity/same digest versus changed digest/provider/source/subscription/scope; signed/admitted versus invalid/expired/revoked |One immutable original association/dedup fact; no invented exactly-once arbitrary effect. Invalid ingress changes no rate/cursor/task. Unknown receipt queries before retry. |
| High CAPACITY |Memory4194304−1/N/+1 bytes, namespaces15/16/17, aggregate64MiB; task envelope65535/65536/65537 including JSON escaping; source31/32/33, subscription127/128/129, event4095/4096/4097, clock127/128/129 |AtN accepted andN+1 refused atomically, with existing dedup/tombstones/unknown proofs retained. No eviction, capacity widening or partial write to make a test pass. Other earlier limits still bind. |
| High REVIEW/BUDGET |Requirements15/16/17; material/findings15/16/17; reports8/9/10; repair bound0 and configuredN−1/N/N+1 within ceiling8; reviewer/repair units/runtime/usage/cost and total attempts |Limits charge before effects. Configured0 means no repair. Admission exhaustion remains required/blocked. Structural ceilings select no product severity/budget threshold. |
| High TIME/ORDER |Observed≤received≤trusted now, event ageN−1/N/N+1; rate window endN−1/N/N+1; clock null/current/stale/equal/future; DST fold/gap/non-hour change/missing date; preview TTL1/60000, expiry exact |At configured ageN valid, greater expired; at rate boundary new window. Verification-required cursor cannot be cleared by skip/automatic retry. Trusted rollback fails; actual owner timezone/next-run later visible. |
| High RESULTS |Accepted/sent/unknown/delivered/current accessible are distinct; same/older/equal-conflicting receipt; partial multi-file outcomes; changed artifact/body/version |Historical genuine delivered receipt retained after current access revokes. Never local-path delivery. Retry only known failed items, immutable task/artifact/recipient/channel binding, no blind resend unknown. |
| High PREVIEW/UI |Cache63/64/65 completed+pending; forged/foreign/stale/disposed token; concurrent duplicate grant; changed catalog/target/tool/env/model/data across await; hidden/getter/proxy/sparse fields |Concrete exact data displayed and explicit owner expiry required. One bounded resolver/grant; late/stale/disconnected UI writes0. Error/secret canaries excluded. Mock elements cannot prove visual behavior. |
| High OUTPUT |Known secret in prose/IDs/metadata/source/extractor/resolver/tool labels/error/log chunks, valid UTF-8 versus lone high/low surrogate, exact ciphertext/AAD fields |Secret rejected before callback/hash/write; no raw key/handle/prose in metadata export/log/receipt. Whole immutable metadata is authenticated before role/generation checks, including live reads and reopen. |

Technical capacities are implementation boundaries, not performance or product defaults. Tests that reach a later cap must configure other trusted capacities high enough to reach that cap legitimately, and still inspect all counters. Bypassing API validation by inserting thousands of fake rows is not acceptance of normal ingestion.

## Decision and state/fault tables

| Facts at the linearization point | Required decision/state |
| --- | --- |
| Wrong actor/route/source/sub revision or disabled/revoked source |Deny before task/rate/cursor/command effect; current route cannot inherit an old task from changed pairing/thread. |
| Complete event identity already registered with identical digest |Return original association/receipt, consume no further rate or cursor; changed same identity digest conflicts. Degraded no-ID identity advertises uncertainty. |
| Fresh event, valid age/clock/rate, queue space and current route/CAS |One compound transaction registers event + creates/supplements task + encrypts goal/context + updates rate/cursor + immutable receipt. Any error rolls back all facts. |
| Clock catch-up requires owner verification |Persist pending verification; no task/effect/cursor advance pretending completion. Exact privately admitted owner approval is required before a bound subsequent occurrence. |
| Prepared full context/current semantic-memory provenance + held fresh approved claim + live native lifetime |Commit one intent; first atomic consume admits current send. Success is admitted intent, not proof of remote effect/consumption/completion. |
| Revoke/cancel wins before consume |No send; record appropriate refusal, hold only already admitted ownership. |
| Consume wins before revoke/cancel |Dispatch may have begun; stop new work, preserve uncertainty and reservation, then reconcile actual lifecycle/effect/input/handoff receipts. No instant-cancel guarantee. |
| Crash before compound commit / after commit before acknowledgement |Before: no partial event/context/charge/receipt. After: durable original identity/receipt and safe unknown state; explicit same command returns prior receipt without reexecution. |
| Native create/send times out or returns late wrong-generation receipt |Unknown scoped to exact original task/claim/generation; never recreate or attach to successor. Query bound native session before deciding; unknown holds. |
| Audit producer equals reviewer or target/material stale |No accepted report/repair claim/completion. Prior report stays historical; fresh fully bound independently charged work required. |
| Required audit report unknown/failed/budget/fatal/unexamined |Task stays pending/blocked even after executor stops; released resource does not imply audit success. |
| Known effect + stopped/no executor + message/delivery/handoff proofs complete |Only exact core settlement may release once; task completion is separate explicit current CAS and audit gate. |

Actual OS-process barriers will force both commit orders for source/sub revoke versus ingest, namespace update versus prepared-context commit, owner revoke versus context consume, repair/report/completion and last rate/queue/active slot. Open race participants before creating held intents where startup reconciliation would correctly mark them unknown; a test must not suppress reconciliation just to arrange a race. Independent readback verifies the winner and loser, immutable receipts and resource ownership.

Abrupt children exit at implemented `before_commit` seams and immediately after acknowledged API return; exit code alone is not proof. Inspect actual rollback-journal/WAL magic/frame data where applicable, then reopened facts. Execute valid hot-journal recovery and refused legacy/key/AAD/future/corruption modes independently, preserving source bytes and path entries on refusal. The unsupported WAL policy remains explicit; no read-only SQLite probe may mutate original sidecars.

## Each original Stage3 source AC

All rows below are planned observable oracles. Existing provisional module reports may record partial proof; complete source acceptance remains pending until its remaining applicable oracle is executed.

| Source AC | Explicit later observable oracle / level and current applicability |
| --- | --- |
| BUB007-01 |Pinned main snapshot/release last-revision JSONL union load/write/reopen/migrate in actual public plugin + encrypted backend; report exact ESM adaptation, omitted JVM/Android and no Kotlin/JS compilation. Pure/module/public library proof is separate from native profile portability. |
| BUB007-02 |Exact source/dependency pins/notices and bounded contributor identities; owner MIT grant recorded, no guessed whole-upstream license; final package license inventory/publication gate. Owner-source evidence permits private development, no publication yet. |
| BUB007-03 |Actual identical queries under two owner/workspace namespaces return only their respective encrypted facts; worker/reviewer/clone/raw-ref confusion denies; empty default imports nothing. Native facade/input isolation later required. |
| BUB007-04 |Read/write/key/corrupt/future/full faults and actual precommit/postack exits yield visible stable failure or original receipt; reopening never claims a noncommitted memory save. Native error display remains later. |
| BUB007-05 |Source/time/confidence/revision/previous/tombstone/internal nextId exact after correction/deletion/reopen; no old cache hit; secret checked before extraction; async batch validates entirely before one CAS. No personal import or real extractor claim. |
| BUB007-06 |Inject contradictory approved/completed memory and old instructions; ledger task/grant state unchanged and current constraint retained whole in actual prepared/native input. Conflict requires verification, never authority. |
| BUB008-01 |Stop/reopen/alternate session recovers latest goal, constraints, unresolved and acknowledged work; previous context envelopes do not recurse or replay old work; current native briefing exact. |
| BUB008-02 |Source scope/time/task/auth provenance on summary; concurrent current instruction wins, stale summary excluded with recorded conflict. Prepared durable envelope metadata and full digest rechecked after await. |
| BUB008-03 |Injected tokenizer and whole UTF-8 envelopeN±1 module limits, then actual selected model context/token capN±1; optional whole records dropped, protected minimum refusal; no truncating denial. Real tokenizer/model-cap evidence remains deferred. |
| BUB008-04 |Canaries in each foreign owner/workspace/task/worker/reviewer record never decrypted/assembled; actual native provider-input/session feed examines complete input, not retrieval alone. Local deterministic provider is explicitly mock. |
| BUB008-05 |Current ledger/grant/control/resource reread under final atomic consume; stale host snapshot labelled and queried; changed lifetime/semantic/memory/policy denies before send, unknown hold retained. |
| BUB009-01 |Full source identity/digest durable dedup, invalid signature/admitted caller/no ID/age/subscription partitions; independent concurrent ingestion gives one association, same identity changed bytes conflict; hard-cap retained dedup, no arbitrary-effect exactly-once claim. |
| BUB009-02 |Actual exits before registration commit/after receipt/after intent/after native unknown; independent receipt read distinguishes registered, processing, completed and unknown; queries precede replay. |
| BUB009-03 |Actual stopped/restarted isolated host with persisted clock cursor; explicit skip/coalesce/verification and unavailable-replay gap reported; no receiver while DSH stopped or fabricated upstream history. |
| BUB009-04 |UTC/local midnight, fold first/both/skip, spring gap, Lord Howe30min and Apia missing date; timezone revision persists; actual UI shows owner timezone/next run after reopen. |
| BUB009-05 |Quiet start-inclusive/end-exclusive and emergency policy; allowed work continues while notices defer/merge; rate/pause control validated by actual ledger/adapters; visible notification state later. |
| BUB010-01 |Historical actual selected-provider pairing/receive/reply/read/stop/unbind is **OUT this phase**. Current private pairing/revoke/control contract is DF010-C01; no mock claims actual connectivity. |
| BUB010-02 |Duplicate/out-of-order/edit/delete/thread semantics with immutable source/action versions and visible conflict/new-event correction; no silent post-execution consent edit. Contract applicable; platform behavior OUT. |
| BUB010-03 |Original private conversation/thread/task association; group/forwarded/wrong window/changed pairing cannot read/control; return route bound before await. Contract applicable; provider transport OUT. |
| BUB010-04 |Bounded synthetic attachment source/digest/access descriptors; actual recipient-scope validation failure is explicit and local path never delivered. Contract applicable; platform authentication/download/upload OUT. |
| BUB010-05 |Bounded backpressure/rate/disconnect/unknown send receipt; no receipt shows sent/unconfirmed, not guaranteed delivered; reconcile before retry. Contract applicable; live provider delivery OUT. |
| BUB013-01 |Report retains original/current scope, exact artifacts/version/evidence/unfinished/next decision; unrun tests visibly unverified; actual UI report no empty all-pass summary. |
| BUB013-02 |Review/verification/delivery same task/artifact version/digest; changed file, expired link, wrong recipient or current revoked access fail actual adapter check. Native/local recipient oracle required; live chat slice OUT. |
| BUB013-03 |Partial multi-file accepted/sent/delivered per item; retry only known failed items, unknown retained/query first; exact immutable receipt after reopen. Live provider slice OUT; generic/local delivery contract remains. |
| BUB013-04 |Exact unchanged progress emits no duplicate; important block retained; quiet ordinary notices merge/defer; actual concurrent same-progress commands and native display checked. |
| BUB013-05 |Actual injected transport timeout after a send marker yields unknown; query reconciliation, withheld resend and explicit duplicate risk; historical delivered/current access independent. Live chat carrier OUT. |
| BUB014-01 |Actual native list/detail same task version/block/snapshot timestamp; refresh rereads ledger, stale selection/disconnect cannot commit old response. Mock renderer only earlier module evidence. |
| BUB014-02 |Every active/pending/running/paused/cancelling/recovery/terminal state gets contract-appropriate controls; cancel shows real held stage, pause stops new dispatch only; actual owner control readback. |
| BUB014-03 |Doubleclick/old page/concurrent controls/grant preview admit one current command; busy/stale/disconnect/unknown errors tell user to verify rather than infer success; no automatic retry. |
| BUB014-04 |Actual DSH browser: resize, long Chinese, keyboard/tab/focus, empty/loading/error, zoom/fonts and all control reachability; untruncated concrete approval scope. Requires real renderer/accessibility/visual evidence after Stage3. |
| BUB014-05 |Actual owner-only links to exact session/artifact/authorization; foreign workspace/generation shortcuts and secrets absent; disposed stale panel fenced. Hash references alone supply no authority. |
| BUB015-01 |Actual individually allowlisted exact material and report coverage/unexamined partition; unrelated task/message private canaries denied; native reviewer input later examined. |
| BUB015-02 |Separate development author/code/ISTQB identities, exact frozen hashes and reports; product same-producer/reused generation cannot satisfy independently charged review. Product report never signs its development acceptance. |
| BUB015-03 |Direct core completion after pending/failed/unknown/budget/fatal/policy-blocking/unexamined/stale reports refuses; exact current artifact/material/semantic binding, immutable history after reopen. Real reviewer failure/UI later. |
| BUB015-04 |Explicit configured rounds0..8, roundN±1, approved atomic repair lineage/prior immutable report and shared total budget; no omitted-lineage direct claim bypass, bounded remaining-owner escalation. No fixture selects suggested product default2. |
| BUB015-05 |Malicious reviewer/record role/pass/grant/send/cross-task/scope fields refuse with zero effect; exact reviewer allowlist/claim target; no authority from findings or resolved flags; actual native adversarial material later. |

## Current provider-neutral chat AC

| Current criterion | Concrete authoritative synthetic-adapter oracle |
| --- | --- |
| DF010-C01 |Privately injected paired identity only; exact current pairing version/private conversation, revoked/stale/group/wrong window/JSON owner denies access/control. Both revoke versus ingress/control commit orders and reconnect generation tested. |
| DF010-C02 |Full provider/source/event identity with immutable digest and original route; duplicate produces one task, edits/deletes/out-of-order cause explicit new fact/conflict; cannot replace already approved/executed action. |
| DF010-C03 |Query/control/reply target exact original source/conversation/thread/pairing; forward/screenshot/payload assertions confer no authority; a reconfigured subscription cannot attach unrelated existing task. |
| DF010-C04 |Attachment descriptor count/bytes/UTF-8/ref/access expiryN±1; exact source/body digest, trusted recipient/channel proof; wrong task/source/path-only/forged receipt denied; metadata output no credential. |
| DF010-C05 |Rate last-slot race, disconnect before/after admitted send, unknown-held result and query reconciliation; sent versus genuine historical delivered versus currently accessible distinct; no blind replay/whole batch resend. |

These five apply now. Their synthetic authoritative contract evidence is valid for the explicitly chosen scope, while live software/platform authentication/receipt behavior remains OUT. This scope amendment does not relax native DSH, artifact, security or visual requirements.

## Carried authoritative integration AC

| Source AC | Additional Stage3 interaction oracle; existing Stage2/foundation evidence retained |
| --- | --- |
| BUB003-01 |One authoritative task/version/semantic lineage across memory/context/event/chat/audit; reopen metadata snapshots coherent. |
| BUB003-02 |Immutable event/context/memory/audit command receipt and dedup under independent processes, no projection authority. |
| BUB003-03 |Genuine1/2/3→4 migration validates crypto/current topology under lock; source/backup/sidecar/future/full faults preserved. |
| BUB003-04 |Actual intent/send/receipt crash cuts distinguish registered/unknown/known; no auto-replay, held ownership survives reopen. |
| BUB003-05 |Native export is current scoped metadata, excludes plaintext/secrets/key/handles; no foreign shortcut. |
| BUB006-01 |Native/RPC/adapter original trusted private actor, revoked pairing and JSON/raw-ref tricks deny. |
| BUB006-02 |Preview and grants bind exact full task/auth/action/target/data/tool/env/model/resource limits/expiry. |
| BUB006-03 |Source/sub/pair/grant/control revoke versus ingest/consume both locked orders; admitted unknown remains held. |
| BUB006-04 |Memory/extractor/summary/event/audit/panel metadata cannot mint authority or enlarge scope; secrets before callbacks. |
| BUB006-05 |Expiry/stale approval UI/reconnect/unload denies; query previous grant receipt before retrying uncertainty. |
| BUB011-01 |Prepared context uses exact approved real native environment/tool/model/permission and bound immutable session. |
| BUB011-02 |Create/resume/late session/feed receipts bind exact task/gen/claim; no foreign environment or successor attach. |
| BUB011-03 |Unknown context delivery/handoff preserves typed obligation and reservation across native disposal/reopen. |
| BUB011-04 |Current branch/environment semantic changes invalidate old preview/context/audit; proper new consent/context required. |
| BUB011-05 |Actual native errors/state readback remain stable and no fresh runtime/daemon/permission bridge introduced. |
| BUB012-01 |Event/manual/context/audit/repair compete for actual last queue/weighted active slot before effect. |
| BUB012-02 |Installed catalog/preset/reasoning evidence plus current owner policy checked under consume, no labels-as-authority. |
| BUB012-03 |Review/repair attempts, per-group and total capsN±1 shared with workers; missing lineage admits0. |
| BUB012-04 |Trusted runtime/usage/estimated-or-unknown-cost source, hard cap before work; no fabricated pricing or measured throughput claim. |
| BUB012-05 |Burst/bounded queues/output/projection/events/preview buffers, starvation/unknown-held capacity visible; later actual host load/latency report required. |

## Browser and final review prerequisites

Before consolidated acceptance, root supplies an exact coherent source/test/scripts/package/bundle manifest and pins the installed host/runtime. All authors pause; this lane verifies hashes before/after targeted final commands and independent findings are fixed/retested. Module/native public-library evidence remains separately labelled. Main, development squash, product reviewer pass, pure schema success and mock element rendering cannot replace acceptance.

Actual Web/browser regression requires a supported active isolated profile, verified owner/control carrier, project-only roots, trusted key/identity callbacks and private access handling, native module/panel loading, zero unapproved external model calls, current task/context/artifact/session facts and graceful complete-stop/no-listener proof. Browser blocked/not-run cases remain visible in [acceptance debt](../acceptance-debt.md); no retry, launch or credential is authorized in this independent lane. Visual review uses a real rendered UI and supported tools, not generated mock screenshots.

Acceptance reports must list exact expected/actual command evidence for every individually applicable row, honest first failures/remediation, unexecuted remainder and owner-amended OUT rows. Runtime BUB015 reports remain product behavior, not this independent development review. No full MVP, ticket, publication or release verdict is made by this plan.
