# NI4 independent stopped-clock ISTQB test addendum

Status: **independent design frozen against the author clock addendum; documentation only, executable work NOT RUN, affected-source GO NOT GIVEN.** Exact addendum SHA256: `66737dfd6c88b26ba3174dfcdef329ad3cd4c6644652b56be6ee715e9acd3293`. This is a separate addition to the held [NI4 design](test-design.md), SHA256 `4d61064d6c05ba72dd23fd6b3502eb5b3d84b20490e067bb9f9b8693af8f69e0`, and [NI4 contract](../../normal-events-contract.md), SHA256 `6d3a6800ddaede4d0d9242bc8dabed33bfa5cd5425ffceb128e1d0c13f5ab405`. Their held bytes stay unchanged. Independent owner: `normal_integrations_istqb`; contract/module author: `prep_messages_results`; serial core owner: `ledger_core`; root alone controls Git and affected-source leases.

Root requested the [clock-status addendum](clock-status-addendum.md) after module scaffolding exposed the boot/stopped history gap. First independently inspected addendum SHA256 was `7287470a3c3c6c9fbeaf2bfb8630c483fb471c32c90a75b6d5fe126af775da30`; it remains an earlier observation, not the held contract. The later66737dfd bytes close the exact field/reason and independent read requirements, and record the accepted core stored-revision approval prerequisite. This pass writes this new document only. No executable test, host/native/browser/provider/tool launch, account action, source/library/original-test edit or held-evidence revision occurs. Final CODE/browser/model/full-ticket/MVP acceptance remains HOLD; blocked review and unavailable browser are never substituted or rerouted. All82 original AC and five DF010 criteria remain retained.

## Actual API observations and required contract

`ScheduleDriver.status(token)` uses its private registered-entry lookup, checks current source/subscription binding, then calls scoped `RuntimeStore.eventClock(host,{sourceRef,subscriptionRef,clockRef})`. Consequently a cold or explicitly stopped installer has no token from which to obtain retained history. Registering or starting merely to display status would violate the existing no-boot-mutation contract.

`RuntimeStore.eventClock` is the existing host-scoped signed read: it accepts only the three route references, verifies the authenticated automation envelope, rejects a stored source/subscription route mismatch and returns its detached record or null. It does not assert clock revision currentness. Its stored clock contains actual cursor,decision,planDigest,sourceRevision,subscriptionRevision,pendingVerification and optional resolvedVerification. These durable facts are separate from a live timer/token. Read failure is unavailable history; it cannot be represented as an absent clock.

Add exactly one private same-ledger input closure, `readScheduleClock({sourceRef,subscriptionRef,clockRef})`, bound directly to that original scoped read and detached before publication. No new owner RPC or host API exists. The module derives the references from its native-scoped slot; clockRef is `canonicalDigest({sourceRef,subscriptionRef,scheduleDigest})` for the exact normalized selected spec. Owner `localAutomationStatus` remains `{}` or `{key}` and never accepts references, time, proof, clock state or a callback. Each selected schedule reads durable clock history independently of registration and configuration readiness. An absent clock alone gives null facts/currentness; existing historical facts remain visible when configuration is disabled, missing, stale or unavailable. Polling is a separate fact from the current private registration.

The closed additional schedule status fields are exactly clockRef,clockCurrent,clockSourceRevision,clockSubscriptionRevision,clockDecision,clockReason. The derived clockRef is hex64 even when its history is missing/unavailable. clockCurrent is boolean|null; stored revisions are positive integers|null. clockDecision is null or exactly `{decision,planDigest}`, with decision skipped|verification_required|ingested and planDigest hex64. clockReason is null|CLOCK_MISSING|CLOCK_NOT_CURRENT|CLOCK_UNAVAILABLE. Existing cursor is a bounded nonnegative instant|null; pendingVerification is null or exactly `{through,planDigest,approved,approvedAt?,approverRef?}` with actual source approval fields only when present. Owner-ingress slot clock fields remain null. Missing is clockCurrent:null/CLOCK_MISSING; existing noncurrent history is false/CLOCK_NOT_CURRENT; only failed/corrupt clock read is unavailable. The complete recipe/current source pair prerequisite additionally follows the separate [source-pair addendum](source-pair-addendum.md); its migration/storage oracles are separately held, not waived by this read design.

The original `approveEventClock` validates the caller's current source/subscription binding and old route/cursor/pending plan digest, but the inspected baseline does not compare stored clock source/subscription revisions against that binding. The same schedule spec preserves clockRef across configuration revisions, so a request using the new revisions and historical cursor/digest could mark the old pending plan approved; the later tick then rejects stale. This is a read-derived contract challenge, not an executed failure. Root/core were notified before this design freezes. The required locked approval predicate must reject stale stored clock revisions before any clock/command receipt write; UI `clockCurrent` alone cannot enforce the original authenticated approval RPC. No read seam may repair or approve that state.

## Independent oracles and risk families

All cases are planned/not run. T means typed module/counter probes; D means the actual encrypted RuntimeStore with independent open connections and OS-process reopen/crash fixtures; N means original pinned native Connection/OperatorPeer/Loader lifecycle under later root GO; P means root's physical bare-installed package/profile/quit/restart proof. U remains HOLD rendered observation. T cannot replace D/N/P, and none substitutes for blocked CODE, actual rendered UI or useful-model acceptance.

Count configureSource/configureSubscription/register/start/tick/ingress/advance/approve/task/action/grant/session/tool/recipient calls separately. Status/boot/refresh/read must leave every mutation counter at zero, preserve logical ledger projections, preserve clock bytes/signature and avoid timer set/clear/unref. Normal disposal may clear an explicitly owned running timer; status itself never performs cleanup. Compare exact original file/sidecar bytes for failed pre-open/schema/crypto cases, rather than calling a synthetic fake-store row durable proof.

| ID / priority | Independent partition and required observation | Level |
| --- | --- | --- |
| N4S-01 P0 boot/stopped read only | Fresh enabled installer against a retained real clock, no schedule token or start receipt: status exposes exact cursor/pending/revisions/decision while register/start/tick/clock-write/approve/ingress/timer/native-action counters all remain0. Explicit stop and cold restart preserve those facts with polling false. Status repeated under different trusted time creates no durable receipt or timer. | T/D/N/P |
| N4S-02 P0 exact scoped read and detach | Each schedule derives its own three route refs and exact normalized-spec clockRef; owner `{}` or `{key}` supplies none. Foreign owner/workspace/profile/slot/clock or route mismatch refuses before history is exposed. Mutating a detached result cannot change store or later status. Unknown/inherited/hidden/symbol/accessor/Proxy/nonplain inputs and caller-supplied clock/currentness/approval/time/handle fields reject before closure calls or getter effects. | T/D/N |
| N4S-03 P1 absent versus unavailable | Only actual null yields missing-clock null facts/currentness. Source/subscription missing or disabled, template mismatch, read throw, bad signature, corrupt ciphertext/topology or closed record-shape refusal has a stable bounded reason. Independent clock success preserves historical fields even if configuration read failed; failed clock read never fabricates cursor0, empty history or no missed work. No raw error/secret/private path reaches output. | T/D/N |
| N4S-04 P0 currentness decision table | Clock revision pair equals actual enabled exact recipe/current signed local pair versus either revision differs, same revisions with changed recipe, missing/stale local pair or half-config, disabled source/subscription or stale template. Only the complete current case is clockCurrent true with clockReason null. Existing historical cursor/pending/decision remain unchanged in all noncurrent cases and are labeled false/CLOCK_NOT_CURRENT. No summary, last timer state, supplied digest or config label promotes history to current authority. | T/D |
| N4S-05 P0 stale pending approval | Create a real verification-required clock; approve it under its exact original pair; reconfigure either source/subscription with the same spec/clockRef. Status shows historical pending and not-current. Original owner approveSchedule with old pair, or new pair plus old cursor/planDigest, must reject before clock/command receipt change. Copying approved:true or changing status fields cannot approve replacement work. Applicable fresh plan approval still requires exact current pair/cursor/digest. | T/D/N |
| N4S-06 P0 configuration/read races | Force already-open connections into clock/config read before and after revision drift, disable, task template selection or peer/lifetime replacement. A separately read status is advisory and cannot authorize work; inconsistent observed pair is not-current/unavailable, never silently merged as current. Owner approval repeats current locked predicates. No read performs cursor repair or clears pending. | D/N |
| N4S-07 P0 active registration separate | Running status combines direct durable history with only the exact current owned registration's polling metadata. Stopping/disposal invalidates its epoch; durable cursor does not imply polling, queued callback success does not imply clock/current approval, and a stale token/lastState cannot overwrite newer durable facts. Reading status never calls register/start/tick/stop/unregister or timer operations. | T/D/N |
| N4S-08 P0 history/reopen/crash preservation | Actual child exits after clock plan, approval or cursor commit but before acknowledgement. Reopen with no start retains exact pending/resolved/decision/cursor/revision facts in the actual store and projects only the closed allowed status fields, with no automatic admission. Unknown/future schema, key/tamper/storage refusal preserves original recoverable bytes; missing native capability cannot delete history or cause fallback registration. | D/P |
| N4S-09 P1 bounds and truthful proposal | Cursor null/0/maximum, decision/pending variants, exact reference lengths and slot-count N±1 preserve bounded closed metadata. Next due/timezone/DST display is a separate bounded proposal; no proposal asserts task admission, approval or execution. No status read recomputes a persisted plan, advances through time, truncates hidden pending work or concludes no events were missed. | T/D/U |
| N4S-10 P0 sealed lifetime | Status/read entered before disable/reload/full quit cannot publish into a replacement installer after lifetime sealing. Ten owned reloads show retained clock without recreating tokens/timers; stale callbacks/serialized refs cannot invoke the replacement read authority. Native services unavailable remain unavailable with zero fallback listener/model/tool/recipient activity. | T/D/N/P |

## Individual retained AC contribution

Every contribution below is NOT RUN; these are additional focused oracles alongside [the complete NI4 mapping](test-design.md). No source criterion is removed, passed or replaced by this read-only seam.

| Retained AC | Additional oracle / residual |
| --- | --- |
| BUB003-01 | N4S-01/08 actual retained plan/approval/cursor and no acknowledged uncommitted history. |
| BUB003-02 | N4S-02/04/05/06 exact scope/revisions/route and locked stale-plan refusal. |
| BUB003-03 | N4S-03/08 storage/crypto/topology refusal cannot fabricate absent history. |
| BUB003-04 | N4S-08 unsupported/future-format fail-closed byte preservation; migration acceptance remains NI3/NI6. |
| BUB003-05 | N4S-03/08 retained historical facts, full deletion/export/retention matrix remains NI6. |
| BUB006-01 | N4S-02/10 private current native owner/workspace/profile/lifetime scoped reads. |
| BUB006-02 | N4S-04/05/06 old approval/current configuration drift cannot authorize new work. |
| BUB006-03 | N4S-02/03/09 bounded closed metadata and secret-safe stable errors. |
| BUB006-05 | N4S-03/04/10 unavailable current authority refuses rather than inventing proofs or fallback. |
| BUB009-02 | N4S-08 crash and retained cursor/plan history; arbitrary-effect replay remains forbidden. |
| BUB009-03 | N4S-01/04/08/10 full quit/cold restart display missed-plan history with zero reception/start. |
| BUB009-04 | N4S-04/09 exact selected timezone/spec/currentness; actual rendered DST/time display stays U/HOLD. |
| BUB009-05 | N4S-01/07 no status-driven background work or notification drain; quiet policy remains separate. |
| BUB012-05 | N4S-02/03/09 bounded complete slot/history/status output, no timer/resource growth. |
| BUB014-01 | N4S-01/03/04/07 truthful stopped/current/historical/unavailable status, actual renderer HOLD. |
| BUB014-02 | N4S-04/05 explicit separate current approval/start controls, no status side effect. |
| BUB014-03 | N4S-05/06/10 stale/double-click/late reply cannot approve drifted history. |
| BUB014-04 | N4S-09 malformed/long/loading/error metadata; actual focus/resize/keyboard observation HOLD. |
| BUB014-05 | N4S-02/04 exact clock/plan/source associations; actual native navigation remains HOLD. |
| BUB001-02 | N4S-07/10 one owned current registration, repeated read/reload creates no extra timers. |
| BUB001-04 | N4S-01/08/10 full-stop/cold status without an implicit start; browser/window distinction HOLD. |
| BUB016-01 | Exact contract/design/source/failure/retest evidence and retained82+5; no acceptance claim. |
| BUB016-02 | D/N/P actual normal retained-status contribution, aggregate rendered/model scenarios NI6/HOLD. |
| BUB016-03 | N4S-05/06/08/10 stale-plan/restart/quit/race oracles, aggregate regression remains required. |
| BUB016-04 | P bare installed package/original native lifecycle proves the private read binding, no release claim. |

## Inspection pins and later execution hold

| Inspected source on 2026-10-04 | SHA256 / role |
| --- | --- |
| src/runtime-store.mjs | `63dbc100d4dfa4fa42db31003c84a7925de025dd66af08f5bae589a4e8e7e850`; original eventClock/approveEventClock, no mutation by this lane |
| src/scheduler.mjs | `af61bd963ad09daf588bd192436790a39b5adcfc837e05fc01f23d0ab4c4e8c2`; live-token-only status |
| src/runtime-plugin.mjs | `a80aee8e12b0e98fb7723f041957db0d3574ba96309d275338af8012b128de40`; original private scheduler wiring |
| src/event-clock.mjs | `65d7882c9960227dacdc7be3591da60c924cb17019b54e14e87a032f38f737c5`; exact normalized spec/proposal |
| src/installed-events.mjs | `3b21b80fb2a9125cfd2d1c12dd5f262f47f6780fbea192203a0955e59c14e3e1`; unheld author scaffold inspected read-only, not baseline or accepted source |

The original public Connection/RPC/OperatorPeer/Cordis hashes remain the held [NI4 design](test-design.md) pins. This closure is a product-private binding to the existing store, never a new public native method.

After root holds the final exact author addendum and this separate design and gives affected source/execution GO, extend only the independently owned new `test/installed-automation-adversarial.test.mjs`. Hold first test/source/manifests; preserve first failure/TAP, exact fix/retest and logical/file/counter/crash evidence. Actual-store and native/physical cases require their separate authorized commands and source holds. Prior held tests/evidence are not edited or reclassified; original assertions remain intact. No unresolved clock-read design issue remains in the66737dfd bytes. Required core approval remediation, separately held source-pair/schema6 integration and affected-source/execution GO are implementation dependencies, not successful tests or acceptance.
