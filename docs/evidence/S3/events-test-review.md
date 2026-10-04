# BUB009 independent event-clock test review

Status: **pure clock utility PASS; final frozen-unit review pending**. Reviewer `/root/istqb_review`, Sol6.1/max, is independent of the root author and correctness reviewer. Root explicitly allocated this evidence file. No event registration, ledger/schema edit, timer, daemon, provider, browser, native host, network, credential, install or Git action occurred in this lane. The [three-stage authorization](../../three-stage-development.md) and [acceptance debt](../acceptance-debt.md) retain full BUB009 acceptance for later evidence.

Reviewed [event-clock.mjs](../../../src/event-clock.mjs), [its eight tests](../../../test/event-clock.test.mjs), shared strict input/canonical-digest guards and all five retained [BUB009 source AC](../../tickets/BUB009.md). This utility computes bounded proposals synchronously. It authenticates no event or caller, stores no cursor/inbox/subscription, admits no work and performs no effect. A schedule-bound hash is equality evidence, never authority.

## Provisional exact evidence

Environment: Node v22.22.2, macOS arm64, actual runtime Intl/IANA time-zone data. Fixed synthetic UTC instants and explicit schedule/quiet policies; no wall-clock wait, timer or external service. Corrected source SHA256: `65d7882c9960227dacdc7be3591da60c924cb17019b54e14e87a032f38f737c5`. A final feature SHA/tree has not yet been supplied for this unit.

| Command / scope | Expected | Actual |
| --- | --- | --- |
| `node --test test/event-clock.test.mjs` |All eight pure units pass with stable range/provenance/input rejection |8/8 PASS,0 FAIL,0 SKIP, exit0, after EV-T01 fix. |
| Independent `node --input-type=module` heredoc importing the actual clock |75 meaningful boundary/decision/DST/provenance/hostile vectors listed below |75/75 PASS,0 FAIL, corrected source hash above. |
| Independent actual `quietAt` invalid-zone reproduction before correction |Invalid timezone rejects in ordinary, equal-minute-disabled and permitted-emergency branches |Ordinary rejected; disabled and permitted-emergency returnedfalse: EV-T01 reproduced and promptly reported. |
| Independent three-branch `quietAt` corrective heredoc |All three branches reject `TIMEZONE_INVALID`, message exactly the stable code |3/3 PASS on corrected hash. Distinct from the75 broader probes; total78 independent corrected vectors. |

The independent checks run actual production functions. Fixed expected UTC occurrence lists, exact inclusion/expiry decisions and zero-trap assertions are not derived by copying the implementation. These prove behavior of the available runtime time-zone database; compatibility with a future host/TZDB requires an explicit rerun. This lane did not research or change any operating-system timezone.

## Risk-based partitions and boundaries

| IDs / count | Concrete oracle | Actual |
| --- | --- | --- |
| EV-CURSOR01..11 /11 |Interval due atN−1/N/N+1; strict `(after,through]` cursor around exactN;127/128/129 occurrences; equal cursor empty; reversed cursor rejects. Exactly128 is allowed;129 refuses with review-required, never a partial due set. |PASS. |
| EV-LOCAL01..08 /8 |Owner UTC/Shanghai midnight supplies the correct local date; daily minute0/1439 accepted,−1/1440 refused; Sunday included by[0], excluded by[1]. |PASS. |
| EV-DST01..12 /12 |New York repeated1:30 first/both/skip; restart cursor between folds preserves that policy; spring missing2:30 is skipped. Lord Howe30-minute repeated1:45 yields exact14:45Z/15:15Z choices; missing2:15 is skipped. Apia's missing2011-12-30 produces no occurrence for that local date. |PASS. No assumption that every DST change is60 minutes. |
| EV-SCAN01..03 /3 |A one-hour daily window with26-hour lookaround on both ends spans3180 minutes. Budget3179 requires review;3180/3181 yields the expected10:00 occurrence. |PASS. Span is bounded and failure is explicit; the caller must persist any review-required gap. |
| EV-AGE01..03 /3 |Newest missed occurrence age99/100/101 with maxAge100. Exactly100 remains eligible;101 skips. |PASS. |
| EV-CATCHUP01..06 /6 |Explicit skip/coalesce/verify policies, externalEffect false/true and no due occurrences. External effects require verification even when normal work coalesces. |PASS. Caller-supplied policy is a proposal, not a grant or automatic replay. |
| EV-PROVENANCE01..08 /8 |Altered instant, timezone, localDate, reference, future occurrence, duplicate occurrence and changed policy digest reject. Validated spec/weekdays/returned due copies are frozen and resist input mutation. |PASS. No occurrence hash may authorize an event or task. |
| EV-QUIET01..12 /12 |Cross-midnight and same-day start-inclusive/end-exclusive boundaries; emergency denied/allowed/ordinary decisions; valid equal-minute policy disables quiet hours. |PASS. The utility returns a notification decision only; it does not pause background work. |
| EV-RANGE01..06 /6 |Negative, NaN, fractional, Date-limit and unsafe-integer instants reject before Intl/arithmetic. Largest supported `8640000000000000−26h` empty interval/empty missed plan is valid. |PASS with stable `TIME_RANGE_INVALID`. |
| EV-INPUT01..06 /6 |Timezone getter/proxy reject with zero traps and no canary output; duplicate, sparse, extra-own-field, out-of-range and empty weekday arrays reject. |PASS with allowlisted stable errors. |
| EV-T01-A..C /3 |Invalid timezone in disabled quiet, permitted emergency and ordinary branches always rejects before any early return. |PASS after correction. |

The first ten rows sum75; the final corrective row adds3. The scan bound includes the deliberate fold-detection lookaround. A small configured scan budget may require review even for a short cursor window; that is an explicit refused proposal, not an offline task silently skipped by the utility.

## Independent finding and retained reviewer fixes

| ID | Reproduction / implication | Correction / retest |
| --- | --- | --- |
| EV-T01 |`quietAt(2026-10-04T12:00Z,{timezone:'No/SuchZone',startMinute:0,endMinute:0,emergencyAllowed:false})` and a permitted-emergency variant returnedfalse without validating the timezone. The same config in the ordinary branch rejected. Invalid persisted configuration therefore had branch-dependent acceptance. |Root validates `formatter(timezone)` before equal-minute/emergency returns and adds all three branch regressions within the retained author test. Independent3/3 corrective plus75 broader probes and author8/8 PASS. |

Correctness-review findings EV-CR01/02 are separately owned: exact occurrence/schedule binding, duplicate rejection, frozen copies and safe Date bounds. This review independently exercises those resulting behaviors without claiming their discovery. All prior tests and every source AC remain retained.

## Individual source AC and future observable oracles

| Source AC | Later concrete oracle | Current disposition |
| --- | --- | --- |
| BUB009-01 |Authoritative transaction deduplicates full owner/workspace/provider/event ID; subscription/task-version route binds trusted source. Freeze retention policy, test same ID in each foreign scope, no ID, bad signature, expired event and wrong subscription. Two independent ingress processes produce one dispatch intent; readback after handler reentry distinguishes registered facts from effect receipts. |Occurrence/provenance utility tests PASS only for schedule equality. Typed source/subscription/atomic inbox API pending; authentication, durable dedup/retention and actual routing **NOT RUN**. No arbitrary-effect exactly-once claim. |
| BUB009-02 |Actual child cuts before/after registration, after processing claim, after unknown effect and after receipt commit; third process distinguishes unhandled/inflight/handled/unknown. Unknown requires trusted query before a retry and retains action/resource ownership. |Clock has no durable/effect state. Separate existing S2 crash/unknown tests do not substitute for event-specific cuts. **NOT RUN** pending schema4 event implementation. |
| BUB009-03 |Stop host, advance trusted time and restart with persisted cursor. Report missed local schedule/gap, explicit skip/coalesce/verify result and unavailable provider replay without inventing received events. External-effect catch-up asks verification; no effect is launched solely from missed timestamps. |Bounded explicit missed-plan utility, max-age and review-required gap PASS. Actual stopped/restarted host/cursor/provider-gap reporting **NOT RUN**. No background daemon or promise of reception while DSH is stopped. |
| BUB009-04 |Persist owner timezone changes; observe exact next UTC/local occurrence and UI timezone/next-run label. Actual restart between first/second fold preserves policy; missing time and midnight produce declared results. |UTC/Shanghai midnight, New York gap/fold and restart cursor,30-minute fold/gap and missing local date PASS at pure utility level. Durable timezone/cursor mutation, native scheduling and visible display **NOT RUN**. |
| BUB009-05 |Actual notification adapter queues/merges ordinary notices until quiet end; permitted background work proceeds; emergency exception, pause and frequency cap obey trusted version-bound policy. Test start/endN−1/N/N+1 and competing notice/manual/schedule paths. |Pure quiet/emergency boundary decisions PASS after EV-T01. Persistence, aggregation, frequency policy, pause/control, delivery and visible notification behavior **NOT RUN**. The owner's phase amendment excludes live chat accounts/providers; adapter-contract tests remain required and cannot masquerade as live-provider acceptance. |

Additional event risks remain explicit: out-of-order source facts, queue bursts, revoked subscription versus ingest/claim in both commit orders, schedule/manual collision, version/auth changes during pending delivery, reload between cursor/effect/receipt and provider timeout/redelivery. Independent OS-process barriers, abrupt exits and third-process readback are required once the actual typed API exists. Structural mock vectors alone cannot prove these state transitions.

This corrected pure utility is ready for a frozen-unit development review. **Full BUB009, functional/visual, MVP and release acceptance remains open**; timer/daemon/provider effects are neither implemented nor exercised by this file.
