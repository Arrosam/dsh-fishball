# Session-list bump verification

Date: 2026-11-09 (Pacific/Auckland). Verification branch: `verify/list-bump`.

## Inputs and integrity

- Product fix: `8653c3faebc619433ef4f4ee707ac3f582e4d0ad` (`fix/list-bump`).
- Approved tests: `8b400255de276cca1e24951dff7460e06e0616b0` (`test/list-bump`).
- Local verification merge: `c0c8eba0f809b106c78f7cc8b8d0141902b8ab76`, with exactly those two parents.
- Worktree: `.agents/worktrees/verify-list-bump` relative to the source repository.
- Product files are byte-identical to the fix commit. Tests and the historical RED design are byte-identical to the approved test commit. No test bug was evidenced, so there is no test-correction commit.
- The merge is local only; nothing was pushed.

The owner's decisions are authoritative: timestamps strictly advance (a tied/backward clock uses the baseline plus 1 ms), and activity is emitted only after delivery is confirmed. The unresolved questions in the [original RED design](<list-bump.md#L134-L140>) describe its historical scope, not unresolved current requirements. The consumer-reducer cases TC-17/18 correctly reject raw timestamps at or below its cached baseline; they do not conflict with the producer's strictly advancing timestamp policy and must not be changed.

## Results

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

## Safety and bounded verdict

Only the existing disposable H-STUB worker, temporary test homes and scripted model were used. No live DSH profile, real model, credentials or `.npmrc` was read; no live DSH instance was started, restarted or stopped. TC-26's approved restart is confined to its disposable test host. The global deleting runner, native-production runners and install suites were not used. All four owned jobs exited and were collected; the approved process check found no remaining worker under this verification worktree. Syntax and whitespace checks passed.

**Ready to merge for the approved verification scope:** all 26 approved cases and 165 focused safe regressions pass on both supported versions, without product or test-source changes. Independent test review found no incorrect approved expectation.

Limits, not newly discovered defects: TC-17–21 exercise the installed pure reducer in an isolated VM and a test-owned list/reconnect model; this is not real browser or remote-stream verification. The existing cases do not deterministically force the producer's tied/backward-clock fallback or observe a pending asynchronous flush before its fulfillment/rejection, so exact fallback and temporal confirmation ordering are not independently runtime-proven by this suite. The implementation contains those decision gates, but these passes must not be represented as additional controlled boundary tests. No such new harness or coverage was invented for this task.
