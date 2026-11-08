# W0 reverification after the X0-C timestamp fix

Date: **2026-11-09 (Pacific/Auckland)**. Verification only; local merge and report/evidence commits allowed. No product edits, installs, live DSH operations or remote changes.

## Verdict

**The X11 timestamp defect is fixed and independently reverified on both supported SDKs. No executed test fails.** X0-C is ready to merge as a **W0 core/supplied-boundary integration increment**, with all 95 executable approved checks passing and all nine inherited TODOs retained. This is **not acceptance of X0-C as a completed task**: local async, dynamic-context, durable recovery and valid-image obligations remain unproved. **FN-1 and B1 remain ready for W0 skeleton merge only.**

Both complete task jobs finished and were collected: **X0-C 95 pass / 0 fail / 9 TODO; FN-1 10 / 0 / 3; B1 10 / 0 / 10 on each SDK**. All 137 exact unique IDs/titles and TODO states reconcile, zero missing/extra/duplicate/skip/cancel. The sole status change from the prior run is `XC-EP-V-05` **Fail → Pass**. All supplementary and safe-regression runs also pass.

## 1. Exact isolation and revisions

Branch **`verify/x0c-time`**, worktree `.agents/worktrees/verify-x0c-time`, created at the exact requested baseline. Clean local no-ff merge; no source branch changed.

| Input / artifact | Full SHA | Disposition |
| --- | --- | --- |
| Baseline `verify/w0-first` | `fd0f46aa3315b0e09bf937307c5410651a80d2a1` | Exact starting point; prior evidence preserved |
| Fix `fix/x0c-time` | `00d4cd2319ed01a2ef6ad6a67522aee389f5cd9b` | Local merge, not cherry-pick or product rewrite |
| Tested merge | `6d26ab71828241f0e7c7d329a718dec54f69cfcc` | Parents are exactly baseline and fix |
| Original X0-C | `c5099d4429ed0bd64fb461031294c7ffd2b845da` | Inherited |
| FN-1 | `572f9e4803078568412b7979ec2525ad74355e7e` | Inherited |
| B1 | `3cce06c984272dc61b0784390f0579e1aa963ba8` | Inherited |
| Approved amended tests | `ab24c84daa32dec7105bd25f5ec4cb78399f1f2d` | Inherited |
| Warning observer correction | `720e6808469d19b1973dcab5daaff93a29094672` | Preserved unchanged |
| Attachments oracle / opt-in image peripheral correction | `c38b97e820aef460c7b656f4d7740dc0bd525de0` | Preserved unchanged |
| Installed Session / Cordis supplements | `79274fc57c2f51614e8d5e8411746195327a0f2c` | Preserved unchanged |

The sole inherited product delta from baseline is [timestamp projection](<../../../packages/instance/src/slim/child/extensions.js#L167-L175>): `at: event.time` instead of `at: event.at`. No verification-side product or test edit has been made, so no new test-correction commit is necessary. The six frozen task-test/support/supplement hashes match the prior report; [source/runtime record](<evidence/source-runtime.json>) pins Node v24.22.2, actual installed SDK/Cordis/Session/Schema versions, manifest hashes and product hashes. [Merge provenance](<evidence/merge-provenance.txt>) records full refs and the exact one-line diff. Exact safe commands are in [commands](<commands.md>).

## 2. Approved inventory and final per-version results

This reruns **already approved** cases, not a new design/sign-off cycle. Authority: [approved decisions](<../../test-design/instance-ext-w0-decisions.md>), [core cases](<../../test-design/instance-ext-w0-core-use-cases.md>), [skeleton cases](<../../test-design/instance-ext-w0-skeleton-use-cases.md>) and [inventory](<../../test-design/instance-ext-w0-inventory.json>). The new [initial ledger](<plan.json>) preserves all 137 full titles/IDs/techniques with `Not Run` and original approval states. A separate requirements reviewer independently confirmed exact registrations and unchanged TODO status.

| SDK | X0-C pass / fail / TODO | FN-1 | B1 | Approved total | Exit |
| --- | --- | --- | --- | --- | --- |
| **0.2.1-rc.5** | **95 / 0 / 9** | **10 / 0 / 3** | **10 / 0 / 10** | **115 / 0 / 22 = 137** | **0** |
| **0.2.2-rc.1** | **95 / 0 / 9** | **10 / 0 / 3** | **10 / 0 / 10** | **115 / 0 / 22 = 137** | **0** |

Final full TAP: [rc.5](<evidence/tasks-0.2.1-rc.5.tap>), [rc.1](<evidence/tasks-0.2.2-rc.1.tap>). Complete runs took **372.889 s** and **372.983 s** respectively, including all three 9,999/10,000/10,001 real-file retention boundaries. Every executable approved body passes: **115/115 (100%) per SDK**, excluding TODOs. [Machine results](<results.json>) retain full per-ID outcomes, exact start/finish times, TAP hashes, per-task counts and baseline comparison; [per-ID table](<results.md>) makes every result visible. The [independent dry-registration audit](<evidence/independent-inventory-audit.json>) separately confirms all original full titles, IDs and deferred states. Supplemental counts/hashes are in [supplement results](<supplement-results.json>).

Historical baseline on **each** SDK: X0-C **94 / 1 / 9**, FN-1 **10 / 0 / 3**, B1 **10 / 0 / 10**, total **114 / 1 / 22**. The only historical failed approved ID was `XC-EP-V-05`. Historical evidence remains byte-for-byte under [w0-first](<../w0-first/report.md>); no old failure log is overwritten or relabeled as a passing rerun.

Counts are registered case bodies, not assertion totals or sample values within a body; generated vectors count when they register distinct bodies. Two SDK executions are not twice as many unique approved tests. TODOs are neither passes nor waived acceptance. Supplemental framework checks stay outside the 137-ID task inventory.

## 3. X11 timestamp, source and order contract

The unchanged [installed Session regression](<../../../test/verification/w0-host-session.test.mjs#L83-L122>) now passes on both hosts:

- Real installed, detached `Session.create` + `createUserMessage` + `Session.append('user/message', ..., {surfaceOp:'append'})` supply actual host events. Preconditions assert finite source `event.time` and absent `event.at`; no fixture alias conceals the original bug.
- Returned `at` is **finite** and **exactly equal** to each originating event's epoch-millisecond `time`, not a fabricated timestamp. Both installed public SessionEvent declarations explicitly define `time` as Unix epoch milliseconds: [rc.5 declaration](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-session/lib/types/types.d.ts#L490-L496>), [rc.1 declaration](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-session/lib/types/types.d.ts#L497-L503>). Numeric values are not printed by the unchanged TAP; its equality and finiteness assertions provide the proof.
- A later user-role message from a **non-user producer** is excluded. User-authored quotes remain newest-first; filtering happens before `limit` (1 and 2).
- Empty Session, repeated reads, and event log / sequence / followup queue / caller-option immutability all pass. The supplement's `maxChars=100` exceeds its texts, so it does **not** itself prove clipping; the approved suite covers that boundary.

Evidence: [rc.5 Session TAP](<evidence/host-session-0.2.1-rc.5.tap>), [rc.1 Session TAP](<evidence/host-session-0.2.2-rc.1.tap>). Each is **one passing top-level scenario with three passing children**; Node reports **4 pass / 0 fail**, exit 0. Do not describe these as four independent scenarios or add them to approved case counts.

This is actual installed **in-process Session API** coverage with fake agent/context/transport surroundings and disposable files/local HTTP only. It does not certify persistence, a real Agent/model turn, queue durability, restart recovery or exactly-once wake.

## 4. Actual Cordis activation and safe regressions

| Scope | SDK 0.2.1-rc.5 | SDK 0.2.2-rc.1 | Evidence boundary |
| --- | --- | --- | --- |
| Actual Cordis framework | **6 pass / 0 fail**, exit 0; Cordis **4.0.5** | **6 / 0**, exit 0; Cordis **4.1.0** | FN-1/B1 ACTIVE with optional instance present/absent; required-tools PENDING gate; B1 missing-hooks warning exactly once; disposal drains effects/registries/services/registrations |
| Existing safe regressions | **44 pass / 0 fail / 1 existing TODO**, exit 0 | **44 / 0 / 1**, exit 0 | Model selection, transcript/card projection and bearer admission over fake peripherals/DOM/local HTTP |
| Disposable path guards | **4 pass**, shared helper check | Same shared check | Root/outside/relative paths refused; safe disposable descendant accepted, without creating/removing it |

Cordis evidence: [rc.5](<evidence/cordis-0.2.1-rc.5.tap>), [rc.1](<evidence/cordis-0.2.2-rc.1.tap>). The unchanged [Cordis supplement](<../../../test/verification/w0-cordis.test.mjs>) runs actual `Context.plugin`/fiber lifecycle, not merely direct `apply()` over a fake context. Minimal replaced environment, read-only Node permissions and network tripwire are preserved; no attempted common network entrypoint. In-memory `tools` and optional instance services are still peripherals. This does **not** certify DSH profile/bundle loading or real tools/agents/model/UI/persistence.

Regression evidence: [rc.5](<evidence/regressions-0.2.1-rc.5.tap>), [rc.1](<evidence/regressions-0.2.2-rc.1.tap>). Selection remains [model choice](<../../../test/e1-p2-model-choice.test.mjs>), [records](<../../../test/body-soul-i7-records.test.mjs>), [admission](<../../../test/body-soul-i3-admission.test.mjs>). The one inherited malformed-card-record TODO remains a TODO, not a task defect. Path evidence: [guards](<evidence/path-guards.json>).

Static reread of both manifests and bundle patches confirms each exported row and declared shipping files; each patch inserts only its named row with empty config and explicitly leaves placement to X0-B. No package install or full profile-loader acceptance is inferred. Prior ad hoc fractional-config / withdrawn-X3 observations are historical only, not counted as new runs here.

## 5. Unchanged acceptance TODOs and limitations

**All 22 approved TODOs remain.** Some X0-C obligations are local acceptance gaps, not merely absent later-owner implementation:

| X0-C TODO ID | Unproved obligation / ownership |
| --- | --- |
| `XC-UC-01-A4` | Real next-model-request tool appearance/disposal during a model turn; X-E2E |
| `XC-UC-01-A5` | Dynamic `systemPrompt.context` create/resume/live evaluation and disposal; X0-C / X-E2E |
| `XC-UC-01-E2` | Approved A: await async setup before create/resume publication, late readiness, rejected callback isolation/once-only log, disposed-completion fence; X0-C |
| `XC-UC-02-E3` | Durable queue acceptance with lost receipt, stable identity/rebuild reconciliation; X0-C / FB-PUSH / X-E2E |
| `XC-UC-02-E4` | Reservation persistence fault, no accepted success without persistence, stable retry; X0-C |
| `XC-UC-02-A4` | Quiet held notice surviving rebuild and joining next user turn once, no independent wake; X0-C / X-E2E |
| `XC-UC-03-F` | Whole-watchdog failure handover, claim release, both sends, no halt/stop, one durable retryable notice; X0-S / X0-A / X0-I / WD-13 |
| `XC-UC-05-M` | Reviewed typed control/intake ports before W1; MCP-S3 / K1 / X0-C / X0-W / FB-PUSH; no invented transport |
| `XC-UC-04-A1` | Valid image preparation/order/no-partial-turn; X0-C owns local array-image behavior despite inherited label X0-I/FN-6; those later owners own item wire acknowledgements |

- **FN-1 three TODOs:** bundled enable, disable/restart preservation and failed placement/startup belong to X0-B.
- **B1 ten TODOs:** bundle placement 3 (X0-B); history/30-day inclusive visibility/clear/reopen 3 (B2–B5); old/cleared archive search 1 (B11); export/uninstall 3 (B10). A 30-day visibility window does not prune the archive; `doneWindowHours` remains a recent-done count only.
- The async A policy is decided, not a new design question. The existing fake agent harness does not await setup before publication and cannot prove the approved lifecycle from synchronous passes.
- No browser/UI run, package install, live DSH profile loading, real model request, durable queue/restart recovery, real wake or exactly-once wake certification. Existing rows/harness and framework checks do not erase those limits.
- WD-1 and later WD/MCP implementations are not accepted by this run. Their absence is **not** counted as a defect in X0-C/FN-1/B1. No WD gate, transport/control migration or model loop is invented.

## 6. Failures, cleanup and merge readiness

**Failures: none** across both complete approved suites, safe regressions and supplementary checks. Historical defect **W0-X11-01** is closed for the finite/exact public timestamp projection on both installed SDKs. No test was changed, weakened, skipped or promoted out of TODO; no new correction commit was necessary.

| Scope | Merge readiness |
| --- | --- |
| X0-C timestamp fix / W0 supplied-boundary integration | **Ready to merge as the verified W0 increment.** All 95 executable checks and actual Session source/time/read-only contract pass on both SDKs. |
| X0-C completed-task acceptance | **Not accepted as complete.** All nine TODOs remain, including the local async/dynamic-context/durable-recovery/valid-image obligations above. |
| FN-1 | **Ready for W0 skeleton merge only**, with three X0-B placement continuations untouched; no implemented folding/batching/UI claim. |
| B1 | **Ready for W0 skeleton merge only**, with ten placement/history/search/export continuations untouched; no archive/UI/storage acceptance inferred. |

The [independent review](<independent-review.md>) records separate requirements/inventory/contract review and final-evidence review status. Both complete task jobs are collected; evidence is final, not a forecast from partial logs.

Safety: no DSH executable/CLI/profile/server launched or restarted; no dependency install, package publish, push, remote mutation, credential transfer or `.npmrc`/credential-file read/copy/backup. No remote-changing operation was needed, so no Fishball remote approval was requested. Only worktree-local source link, new report/evidence files and guarded disposable fixture writes. Prior tests and evidence are preserved. Test hooks dispose owned HTTP listeners, effects/fibers and disposable homes; no unrelated process is stopped. All **seven owned jobs** are completed and explicitly collected; no owned terminal remains. [Final cleanup/integrity record](<evidence/cleanup.json>) and [supplement executor record](<evidence/supplement-cleanup.json>) preserve the evidence basis. Source refs, frozen source/tests and installed manifests are unchanged after execution; seven syntax checks, JSON/hash validation and the **full staged whitespace check including raw TAP** pass (no evidence-format exclusion needed for this run). No OS-wide process census is claimed.

This remains a local verification branch, not a merge into `main` or source branches. Final report/evidence commit SHA will be provided in the delivery response.
