# Stage3 local progress notification integration

Author: delegated `prep_messages_results`, Sol6.1 high. This is a distinct unit for retained BUB009-05 and BUB013-01..05, especially BUB013-04/05. Root owns events, schedules, chat and Git; core owns the single authoritative ledger; this lane owns the notification facade/tests and necessary ResultPipeline binding edits. Live chat software/account/delivery acceptance remains outside this phase. Native UI and production recipient acceptance remain unpassed. No model/provider call, install, host/browser launch or Git mutation is authorized here.

## Frozen acceptance and risk boundary

Ordinary notifications defer through owner-configured quiet windows and merge rules while otherwise permitted background work remains possible. Important blockers may use explicit configured emergency kinds. All frequency and interval bounds remain hard admission checks, including emergency exceptions. Owner time zone, enabled state, windows, emergency/merge kinds, merge interval and frequency values must be supplied explicitly; no product defaults are selected.

Progress comes from authoritative scoped encrypted records and complete goal/scope/evidence/not-run/unfinished/next-step reports. No memory-only queue or second store is allowed. Durable notification associations deduplicate unchanged immutable progress facts even if concurrent writers produce different progress references. Sent or unknown groups retain ownership and resource obligations across restart and policy changes; time expiry never authorizes another blind effect.

Every effect still requires the original complete approved artifact/version/data/recipient/channel/notification binding, independent artifact verification, current task/auth and policy revisions, resource admission and existing atomic delivery outbox. Accepted intent, claim, sent, recipient-confirmed delivery, current access and task completion remain different facts. Confirmed failure retries require exact reconciliation/release and a new immutable attempt; unknown results only query. Caller JSON flags or summaries confer no emergency, scope, delivery or approval authority.

Highest-risk oracles: exact quiet start/end, wrap/midnight and repeated/missing local clock hours; emergency exception without frequency bypass; frequency/minimum interval races across tasks or independent store connections; unchanged facts under different refs; coalescing boundaries; policy revision after consent; revoke/cancel before and after claim; side effect then timeout and restart; held group with newer facts/policy; known failure versus unknown retry; exact byte/recipient binding and plaintext canaries.

## Agreed typed dependency

Root approved owner `configureNotificationPolicy`/`getNotificationPolicy` with closed explicit enabled/timeZone/quietWindows/emergencyKinds/mergeKinds/mergeWindowMs/minIntervalMs/frequency fields. Existing accepted `recordDelivery` gains immutable `notification:{policyRef,policyRevision,progressRefs,mergeKeyRef}`, included in its full target digest. Existing `claimAction(delivery)` evaluates current policy and trusted clock under the same transaction that commits frequency/progress ownership, resource reservation and outbox.

Agreed semantics: quiet windows are half-open, support overnight wrap, and full-day0→1440; equal endpoints are rejected. Emergency kinds bypass quiet and merge waiting only. Multi-progress requires all selected kinds in mergeKinds and waits until oldest timestamp plus mergeWindowMs. Dedup identity includes task plus immutable progress digest plus recipient/channel. Held/sent/unknown task+recipient/channel+merge-key groups block newer progress and policy revisions until exact known result and actual settlement. No eviction or separate retry queue is introduced.

The core published and implemented these exact fields in docs/runtime-automation-api.md. The facade consumes the core methods and signed snapshot.notifications/notificationFacts associations. Independent code and ISTQB review remain development integration gates; no production acceptance is inferred.


## Implemented local facade and integration

`NotificationService(store,{resultPipeline,policyRef,recipientRef,channelRef,mergeKeyRef})` requires every route reference explicitly at trusted construction. `configure(handle,{commandRef,expectedRevision,spec})` writes the owner policy through the typed core API; `policy(handle)` returns that scoped policy and durable counters. The closed normalizer rejects missing fields, guessed time zones, extra emergency booleans, duplicate kinds, sparse/getter/proxy inputs and unbounded windows.

`pending(handle,taskRef)` derives ordered candidates, batches, suppressed facts, explicit failed retry references and held delivery metadata from the authoritative snapshot. It authenticates owner/coordinator/host context, reads and validates exact encrypted report bytes and returns references/digests/kinds/timestamps/stable states only. Worker/reviewer contexts cannot inspect or configure notification policy. Half-open local IANA windows, emergency kinds, merge wait and fixed frequency windows are read-time hints; these hints confer no dispatch authority and may become stale immediately.

`prepare(handle,{taskRef,commandRef,expectedTaskVersion,expectedAuthEpoch,artifactRef,version,progressRefs})` derives a deterministic reference-only manifest containing task/owner/workspace and each stored progress reference, immutable digest, kind and complete normalized goal/scope/evidence/unrun/unfinished/next report. It writes the artifact using the existing atomic ResultPipeline/core composite. No caller prose, file path, model summary or emergency flag becomes notice content or authority. The merged artifact retains existing UTF-8 byte bounds; a too-large manifest rejects without an orphan record or task revision.

`accept(handle,{taskCAS,deliveryRef,artifactRef,artifactVersion,digest,policyRevision,progressRefs,previousDeliveryRef?})` checks that the reviewed artifact contains exactly that manifest and the same bytes/digest. It creates only accepted intent, binding the constructor recipient/channel and closed immutable notification references. ResultPipeline now accepts and normalizes that optional binding in both initial and explicit failed-retry intents, and includes it in the full original target digest. The manifest does not embed policy revision, so a known failed, released item can retain exact reviewed bytes while receiving a fresh explicitly approved policy-bound action. This never permits automatic reapproval or retry.

`dispatch` consumes the existing exact approved action descriptor and delegates to ResultPipeline. Atomic core claim repeats policy revision/enabled/clock, progress kind/evidence membership, quiet/merge/frequency, digest dedup and unknown group/fact checks alongside task/auth/resource/permission/outbox admission. `reconcile` queries the existing recipient adapter only. No second store, memory queue, automatic transport, implicit grant, review or effect is introduced. The stage2 source/tests and earlier hashes remain historical evidence; this new unit changes only the optional binding path in results.mjs.

## Author verification checkpoint

Environment: installed Node22.22.2, built-in node:test/SQLite/Intl/crypto and synthetic temporary encrypted databases. No installation, real model/provider/account, host/browser launch or Git action. Every recipient callback is synthetic and project-local. Synthetic callback charges explicitly use one resource unit and runtime estimate, zero inference usage/cost estimates; this is fixture data, not a product policy default or free-review bypass.

Initial19 checks found five test failures: the restarted task's stronger recovery gate prevented preparing a new charged review, revoke/cancel used the actual APPROVAL_INVALID/TASK_BLOCKED error codes, and opening a second process changed held usage to unknown before a nonzero synthetic inference estimate. The fixtures were corrected to assert these real gates, test held notification admission before restart and retained recovery ownership after restart, and use explicit zero inference estimates for callbacks that invoke no inference. No author/core invariant was relaxed to make a test pass. The corrected initial19/19 passed. Three further boundary cases bring the notification file to22/22 passing checks (16 top-level plus six nested checks).

Final focused command: `node --test test/notifications.test.mjs test/results.test.mjs test/messages.test.mjs test/control.test.mjs test/audit.test.mjs`,2026-10-04. Result86PASS,0FAIL,0SKIP; output captured locally at `/tmp/df-notifications-bundle.tap`. Existing Stage2 checks28 and audit36 are included unchanged; notifications adds22.

| Required oracle | Actual local result |
| --- | --- |
| Explicit closed policy and binding; missing/default/prose/getter/emergency-boolean rejection | PASS pure normalization; no payload authority |
| Durable progress selection, complete report/evidence/unrun fields, canonical artifact and encrypted bytes after reopen | PASS actual SQLite; accepted intent has no claim or callback |
| Quiet start-inclusive/end-exclusive, overnight wrap and full day | PASS actual atomic dispatch denial plus exact end-boundary delivery |
| Repeated fall-back local minute and skipped spring-forward quiet hour | PASS deterministic IANA advisory classification at actual UTC instants; no effects |
| Read snapshot eligible before quiet begins; claim after start | PASS core rejects quiet claim with no callback or ownership |
| Emergency quiet/merge exception with minimum interval/frequency/disabled hard gates | PASS actual SQLite original grant/claim pipeline |
| Merge oldest timestamp exact wait boundary and nonmerge mixed rejection | PASS actual core admission |
| Immutable unchanged bytes under another progress reference | PASS delivered facts suppress both references; new approved attempt rejected duplicate after reopen |
| Timeout after synthetic effect, sent versus delivered, new progress/policy and restart | PASS known/unknown query axes retained; held reservation/group blocks another effect, stronger recovery gate retained after reopen |
| Known delivery before release and exact known release | PASS group stays held until actual settlement |
| Known failed exact item versus blind resend/early/unknown retry | PASS only explicit released predecessor with new consent/action sends |
| Interval and frequency exact boundary | PASS interval1999 rejects, interval2000 still frequency-blocked, window3000 admits |
| Quiet notification/policy disabled with otherwise permitted background work | PASS background resource claim remains independent |
| Revoke/cancel first and cancellation after claim | PASS first forbids ownership/callback; later unknown preserves reservation and durable group after reopen |
| Global endpoint frequency across tasks and simultaneous independent child processes | PASS exactly one atomic claim, one NOTIFICATION_FREQUENCY denial, one counter/group and no callback |
| Exact artifact/progress/recipient route and scope, reviewer/worker limitations | PASS arbitrary body/missing progress/forged role/emergency flag denied |
| UTF-8 merged manifest bounds and rejected composite atomicity | PASS oversized notice leaves task/data/progress/artifact/receipt snapshot unchanged |

Reviewed-candidate SHA256, author checkpoint:

- src/notifications.mjs:545c9505b63793718b280d5d10394ccfd4b88c3df42a1e9ddc86275743164503
- src/results.mjs:8a44c8e3e2fb4dfcdeae1fd7f69ddc90dd8c36b4cdf7d292964ebfd5cf5af077
- test/notifications.test.mjs:aceb197245c67e1f7488b4d565aba9c0b1f5de25f2764089e1600b9aad9e07e8

The unchanged audit source/test still hash a1f6bff346c7897d4cf5c7cffa2b8f12e1fee5d69cd2a6fc78c4c4d843475beb/e0c24d1b1857565b927e5b731f53567f6ea35ed382ff18a3db528b09b60dc0ec. Independent code and ISTQB reviewers received the coherent unit before this checkpoint; findings and any remediation/retest belong below. Core signed notification receipt/counter graph and its separate fault/process tests belong to the ledger_core evidence, not this facade's claimed authorship.

## Remaining acceptance boundaries

This demonstrates local ledger/facade behavior, not real recipient delivery or native UI acceptance. Native owner policy configuration, task rendering, actual receiver permission/openability/receipts and full consolidated quit/restart/functional/visual regression remain unpassed. Actual chat software/provider/account delivery is explicitly out of this phase, not mocked as accepted. The new facade does not automatically drain candidates, approve actions, run model reviews, choose a provider, wake native work or silently recover unknown external outcomes. Host/root wiring and independent review are required before local development integration; all retained BUB009/BUB013 source AC and general acceptance debt remain.

## Independent finding S3-NT01 and remediation

The independent ISTQB reviewer reproduced a NotificationService.dispatch seam that accessed input.taskRef/input.deliveryRef before checking property descriptors. An enumerable getter/proxy could run an untrusted trap and throw raw canary text before domain validation; no effect occurred, but this violated stable-code/no-raw-diagnostic handling. The author's earlier pure policy/getter checks did not exercise this dispatch entry point.

Remediation validates the complete closed dispatch descriptor with fields/binding/reference checks and captures immutable input before reading any property or delivery metadata. The author added a real RuntimeStore/ResultPipeline facade regression for both getter and proxy commands, expecting INVALID_INPUT, zero traps and zero callbacks. The independent reviewer was notified to rerun its separate canary regression. Source/API authority and existing core atomic admission are unchanged.

Post-fix focused command is the same five-file bundle above:87PASS,0FAIL,0SKIP, including notifications23/23 (17 top-level plus six nested) and unchanged Stage2/audit64. The previous86-pass checkpoint and its hashes remain historical, not the final reviewed candidate. Current candidate hashes:

- src/notifications.mjs:85071387f087f90aae67753802500d3a83f9f18ef0d03269f04aac4a723471e0
- src/results.mjs:8a44c8e3e2fb4dfcdeae1fd7f69ddc90dd8c36b4cdf7d292964ebfd5cf5af077
- test/notifications.test.mjs:b473f780ac370fa61da7dd0771ed9153d5fdf9d6374653d9d65f8a807930843e

Independent code review and final ISTQB retest dispositions remain pending at this author checkpoint. No full ticket/native recipient/UI/visual acceptance is claimed.

Author also ran the separately owned preserved S3-NT01 regression without editing it: `node --test --test-name-pattern='independent notifications' test/automation-adversarial.test.mjs` →1PASS,0FAIL,0SKIP, zero getter/proxy traps and transport calls. This is the author's remediation check using independent test material, not a substitute for the independent reviewer's final retest/disposition.
