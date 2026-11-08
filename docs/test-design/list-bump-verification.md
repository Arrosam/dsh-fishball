# Session-list bump verification

Date: 2026-11-09 (Pacific/Auckland). Verification branch: `verify/list-bump`.

## Inputs and integrity

- Product fix: `8653c3faebc619433ef4f4ee707ac3f582e4d0ad` (`fix/list-bump`).
- Approved tests: `8b400255de276cca1e24951dff7460e06e0616b0` (`test/list-bump`).
- Local verification merge: `c0c8eba0f809b106c78f7cc8b8d0141902b8ab76`, with exactly those two parents.
- Worktree: `.agents/worktrees/verify-list-bump` relative to the source repository.
- Product files are byte-identical to the fix commit. The original 26 cases, five safe regression suites, their shared harness, and the historical RED design remain unchanged. The initial run needed no test correction; the requested deterministic follow-up adds separate test-only files.
- The merge is local only; nothing was pushed.

The owner's decisions are authoritative: timestamps strictly advance (a tied/backward clock uses the baseline plus 1 ms), and activity is emitted only after delivery is confirmed. The unresolved questions in the [original RED design](<list-bump.md#L134-L140>) describe its historical scope, not unresolved current requirements. The consumer-reducer cases TC-17/18 correctly reject raw timestamps at or below its cached baseline; they do not conflict with the producer's strictly advancing timestamp policy and must not be changed.

## Initial verification results

These are the initial unchanged-suite results. The owner's subsequent deterministic-boundary follow-up is recorded separately below.

| Installed DSH | Approved cases | Existing baseline regressions | Additional safe regressions | Total passed | Failed | Skipped / cancelled |
|---|---:|---:|---:|---:|---:|---:|
| 0.2.1-rc.5 | 26/26 | 70/70 | 95/95 | **191/191** | 0 | 0 / 0 |
| 0.2.2-rc.1 | 26/26 | 70/70 | 95/95 | **191/191** | 0 | 0 / 0 |

All four test commands exited 0. Across both versions: 382 passed, zero failed/skipped/cancelled/todo. The four original RED cases, TC-01/02/03/25, now pass on both versions without changing their assertions.

### Approved case results (same on both versions)

The complete preconditions, technique tables, acceptance criteria and expectations remain in the [approved 26-case catalogue](<list-bump.md#L89-L132>). These are its current verification results, not replacements for its historical RED run.

| Case | Observable result | Status |
|---|---|---|
| TC-01 | Actual target activity advances the modeled automatic list above its newer peer, without re-seeding. | Pass |
| TC-02 | Successful start emits activity for the created target. | Pass |
| TC-03 | Successful running-target redirect delivers the replacement and emits activity. | Pass |
| TC-04 | Message's throwing steer emits no activity. | Pass |
| TC-05 | Start's throwing steer emits no activity. | Pass |
| TC-06 | Redirect's throwing followup emits no activity. | Pass |
| TC-07 | Unknown message target emits no activity. | Pass |
| TC-08 | Archived message target emits no activity. | Pass |
| TC-09 | Unknown redirect target emits no activity. | Pass |
| TC-10 | Archived redirect target emits no activity. | Pass |
| TC-11 | Message keeps exact Fishball relay source and text. | Pass |
| TC-12 | Start keeps exact Fishball relay source and text. | Pass |
| TC-13 | Redirect keeps exact Fishball relay source and text. | Pass |
| TC-14 | Message preserves Fishball turn provenance and original human session origin. | Pass |
| TC-15 | Start preserves Fishball session/turn provenance. | Pass |
| TC-16 | Redirect preserves Fishball turn provenance and original human session origin. | Pass |
| TC-17 | Installed reducer ignores incoming T−1 at cached T. | Pass |
| TC-18 | Installed reducer ignores incoming T at cached T. | Pass |
| TC-19 | Installed reducer accepts incoming T+1 at cached T. | Pass |
| TC-20 | Modeled greater/equal/older sequence never regresses cached activity. | Pass |
| TC-21 | Modeled reconnect can restore persisted baseline order. | Pass |
| TC-22 | Relay leaves authoritative host updatedAt unchanged. | Pass |
| TC-23 | Relay leaves durable manual order and pin metadata unchanged. | Pass |
| TC-24 | Stop without message delivery emits no activity. | Pass |
| TC-25 | Cold managed target resumes, receives the relay and emits activity. | Pass |
| TC-26 | Disposable-host restart retains the persisted timestamp, not a synthetic durable bump. | Pass |

### Safe regression scope

| Existing suite | Leaves per version |
|---|---:|
| [messaging-outbound](<../../test/messaging-outbound.test.mjs>) | 37 |
| [approvals-provenance](<../../test/approvals-provenance.test.mjs>) | 33 |
| [rev11h-stop](<../../test/rev11h-stop.test.mjs>) | 17 |
| [messaging-start-title](<../../test/messaging-start-title.test.mjs>) | 50 |
| [messaging-start-halfmade](<../../test/messaging-start-halfmade.test.mjs>) | 28 |
| **Total** | **165** |

The first two are the original list-bump regression baseline. The remaining three exercise the shared delivery helper's start, partial-start, stop/redirect, source and audit boundaries. This is the focused safe regression scope, not a full repository-suite run. The previously documented rc.1 K1-EP-53 test race did not reproduce; no retry or test weakening was required.

## Failures and classification

- Product failures: **0**.
- Test expectation/fixture failures: **0**; test corrections: **none**.
- Harness/import/setup failures: **0** in the four verification runs.
- Tooling-only issue: the sandbox initially denied a read-only process listing. A subsequently approved process check succeeded. This was outside the test runs and did not affect their counts.

## Reproduction and evidence

Prepare only the existing source-contract link (no dependency installation):

```sh
/opt/homebrew/bin/node --input-type=module -e "import('./test/support/contract-link.mjs').then(m => m.linkContractForSourceRun())"
```

For each version, set `FBTEST_DSH_RUNTIME` to the installed version's `node_modules` directory and run:

```sh
/opt/homebrew/bin/node --test --test-reporter=spec test/session-list-activity.test.mjs
/opt/homebrew/bin/node --test --test-concurrency=2 --test-reporter=spec test/messaging-outbound.test.mjs test/approvals-provenance.test.mjs test/rev11h-stop.test.mjs test/messaging-start-title.test.mjs test/messaging-start-halfmade.test.mjs
```

Exact runtime roots used:

```text
/Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules
/Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules
```

The installed CLI package manifests independently report those versions. Ignored local evidence:

- [rc.5 activity log](<../../.runtime/verify-list-bump/activity-rc5-initial.log>): 26/26, 14.007 s.
- [rc.1 activity log](<../../.runtime/verify-list-bump/activity-rc1-initial.log>): 26/26, 14.474 s.
- [rc.5 regression log](<../../.runtime/verify-list-bump/regression-rc5-initial.log>): 165/165, 44.888 s.
- [rc.1 regression log](<../../.runtime/verify-list-bump/regression-rc1-initial.log>): 165/165, 45.792 s.

## Initial safety and bounded verdict

Only the existing disposable H-STUB worker, temporary test homes and scripted model were used. No live DSH profile, real model, credentials or `.npmrc` was read; no live DSH instance was started, restarted or stopped. TC-26's approved restart is confined to its disposable test host. The global deleting runner, native-production runners and install suites were not used. All four owned jobs exited and were collected; the approved process check found no remaining worker under this verification worktree. Syntax and whitespace checks passed.

**Ready to merge for the approved verification scope:** all 26 approved cases and 165 focused safe regressions pass on both supported versions, without product or test-source changes. Independent test review found no incorrect approved expectation.

Initial limitations: TC-17–21 exercise the installed pure reducer in an isolated VM and a test-owned list/reconnect model; this is not real browser or remote-stream verification. The original cases did not deterministically force the producer's tied/backward-clock fallback or observe a pending asynchronous flush before its fulfillment/rejection. The owner explicitly requested the follow-up below to close these two runtime-verification gaps while retaining the live-GUI limitation.

## Deterministic producer follow-up

The owner requested deterministic producer tests without changing the original 26 cases or product code. The separate [boundary test suite](<../../test/session-list-activity-boundaries.test.mjs>) adds 13 leaves. Its [support client](<../../test/support/session-list-boundaries.mjs>), [requirement-owned data](<../../test/support/session-list-boundaries-data.mjs>), and [opt-in fixture](<../../test/support/fixtures/fbtest-session-list-boundaries/index.mjs>) extend the existing disposable H-STUB harness, not the running DSH instance.

### Cases and techniques

| Added boundary | Leaves/version | Techniques | Expected observable result |
|---|---:|---|---|
| Message producer with clock T−1, T, T+1 relative to the actual host row baseline T | 3 | BVA, EP | Each confirmed delivery emits exactly T+1 ms; authoritative row remains T. These are producer tests, separate from unchanged consumer TC-17–19. |
| Two message deliveries on the same port with clock frozen at T | 1 | State Transition | Actual bus timestamps are T+1, then T+2; authoritative row T and durable workspace order/pins remain unchanged. |
| Message/start/redirect, each pending flush → fulfilled true | 3 | Decision Table, State Transition | The real connector checkpoint is reached exactly once. No activity across any target while pending; after the real host flush confirms true, exactly one target event records confirmed state and the real true result. |
| Message/start/redirect, each pending flush → fulfilled false | 3 | Decision Table, State Transition | No activity across any target while pending or after unconfirmed completion and actual relay/target settlement. |
| Message/start/redirect, each pending flush → asynchronous rejection | 3 | Decision Table, State Transition | No activity across any target while pending or after rejection and actual relay/target settlement. |
| **Total** | **13** | | |

The new tests import and execute the real connector's existing `createSessionPort(ctx, {now})` seam as a black box over real disposable host services. The clock is injected only into that port: no global clock replacement, synthetic activity, copied timestamp algorithm, reducer model, authoritative-row override, or cache mutation is used. The original 26 continue to exercise normal bridge delivery paths.

Only the tested port receives a narrow `sessions` facade. Its gate controls that port's flush checkpoint and delegates other host operations; the agent's own request/turn durability barriers continue using the unchanged real service. A start's target is learned at the reached checkpoint and checked against its returned session ID. Exact Fishball relay text/source is verified afterward in the actual host log.

Pending-state observations are synchronized by a reached deferred gate, three awaited actual public-list reads interleaved with event-loop progress, and an unsettled-operation assertion—not a sleep-based race. The host-bus listener synchronously records confirmation state at emission. The positive release awaits the installed host's actual flush returning true before marking confirmation; false/rejection cases inject those outcomes only at the tested checkpoint. Negative assertions include all events since the operation offset, not merely events naming the expected target, and are repeated after operation/relay settlement. Pending gates are released and facade descriptors restored in failure cleanup/disposal; the real service's own/prototype descriptor chain is checked unchanged.

### Development failure classification

The first rc.5 new-only smoke executed 13 leaves but all 13 failed during a fixture setup invariant, before delivery: it compared two reads of `sessions.flush` by reference. Both SDKs' Cordis traceable service getter creates a fresh method proxy per access, so that comparison was invalid even without mutation. This is a **test-fixture bug, not a product failure**. The correction removed only that impossible proxy-reference assertion and retained the underlying own/prototype property-descriptor checks. No product expectation was relaxed. The corrected smoke passed 13/13, zero failed/skipped/cancelled. Independent review additionally strengthened pending/unconfirmed/rejected checks to reject wrong-target activity too, before the final combined runs.

- [Initial failed smoke evidence](<../../.runtime/verify-list-bump/boundaries-rc5-smoke.log>): 0 pass / 13 fixture failures, exit 1.
- [Corrected smoke evidence](<../../.runtime/verify-list-bump/boundaries-rc5-corrected-smoke.log>): 13/13 pass, exit 0.

### Final reproduction command

For each of the same two installed runtime roots, set `FBTEST_DSH_RUNTIME` and run the unchanged six existing suites plus the separate added suite:

```sh
/opt/homebrew/bin/node --test --test-concurrency=2 --test-reporter=spec test/session-list-activity-boundaries.test.mjs test/session-list-activity.test.mjs test/messaging-outbound.test.mjs test/approvals-provenance.test.mjs test/rev11h-stop.test.mjs test/messaging-start-title.test.mjs test/messaging-start-halfmade.test.mjs
```

### Final follow-up results

| Installed DSH | New deterministic cases | Original approved cases | Safe regressions | Total passed | Failed | Skipped / cancelled |
|---|---:|---:|---:|---:|---:|---:|
| 0.2.1-rc.5 | 13/13 | 26/26 | 165/165 | **204/204** | 0 | 0 / 0 |
| 0.2.2-rc.1 | 13/13 | 26/26 | 165/165 | **204/204** | 0 | 0 / 0 |

Both final combined commands exited 0: **408 passes across both versions**, zero failures/skips/cancellations/todo. These are unique final-run counts; smoke and earlier rerun counts are not added. Both the unchanged existing 191 and the added 13 were exercised in each final command.

- [Final rc.5 log](<../../.runtime/verify-list-bump/final-rc5.log#L237-L290>): added 13, original 26, 204 total; 64.230 s.
- [Final rc.1 log](<../../.runtime/verify-list-bump/final-rc1.log#L237-L290>): added 13, original 26, 204 total; 67.793 s.

Final classification: **0 product failures, 0 outstanding test/fixture failures, 0 harness/setup failures**. The initial 13 setup failures share the corrected fixture defect above; they were not accepted as product RED evidence. Independent read-only review approved the six new files, their sensitivity and cleanup, and confirmed original-case/product/shared-harness integrity. The review's negative-event strengthening was included in both final runs.

**Final verdict: ready to merge for the requested verification scope.** Exact tied/backward clock and repeated live-watermark behavior, and pending/confirmed/false/rejected flush event behavior, now have deterministic real-producer integration evidence on both installed SDK versions. No product change was needed. All new test sources and this evidence update are committed together locally, separately from the product/test-branch merge; no remote change or push was performed.

The new tests exercise the real producer port directly, not bridge transport timing. Existing approved cases continue to cover normal bridge delivery. Clock BVA/repeat target the message producer path; all three operations receive the flush-state table. False/rejection cases assert absence of activity after the injected outcome, not the operation's response-status contract. Negative observation is finite, not proof against arbitrarily delayed unrelated events. **Live GUI, browser sorting and remote-stream behavior remain separately unverified.** No live DSH start/restart, credential or `.npmrc` access, credential backup/copy, dependency installation, or remote-changing operation was used. All owned verification jobs were collected after exit; a separately approved read-only process check found no remaining verification-worktree worker or recorded new-test worker PID.
