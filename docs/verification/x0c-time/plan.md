# W0 timestamp-fix reverification plan

Date: 2026-11-09 (Pacific/Auckland). This is explicit execution of the already approved 137-case inventory, not new case design or a new approval cycle. Baseline evidence is preserved under [w0-first](<../w0-first/report.md>).

## Pinned scope

- Worktree: `.agents/worktrees/verify-x0c-time`; branch `verify/x0c-time`.
- Baseline: `verify/w0-first` `fd0f46aa3315b0e09bf937307c5410651a80d2a1`.
- Local no-ff merge: `6d26ab71828241f0e7c7d329a718dec54f69cfcc`, with fix `00d4cd2319ed01a2ef6ad6a67522aee389f5cd9b`.
- Only inherited product delta: project source `event.time` to public `at`. No product edits are authorized.
- Preserve test-only corrections `720e6808469d19b1973dcab5daaff93a29094672`, `c38b97e820aef460c7b656f4d7740dc0bd525de0` and supplementary checks `79274fc57c2f51614e8d5e8411746195327a0f2c` unchanged unless an independently justified test correction is necessary, in its own commit.

## Acceptance and execution

1. Run all 137 approved IDs on installed SDK 0.2.1-rc.5 and 0.2.2-rc.1: X0-C 95 executable + 9 TODO, FN-1 10 + 3, B1 10 + 10. Reconcile exact unique IDs and preserve TODO states.
2. Run the unchanged actual installed in-process Session regression: finite epoch-millisecond timestamps must equal source host event times; user-authored source filtering, newest-first order, filtering before limits and read-only behavior must remain correct. Its `maxChars=100` is above fixture text lengths; clipping is covered by the approved suite, not this supplement. No persistence/model/wake inference.
3. Run unchanged actual Cordis activation checks on each SDK, in minimal environment and read-only Node permissions with network tripwire. Do not equate this with the live DSH profile/bundle loader.
4. Run the 44 existing safe regressions and their existing TODO on both SDKs, using only the prior three-file safe selection.
5. Retain raw TAP, exit codes, source/runtime provenance, per-ID results, independent review and cleanup evidence. Report unresolved local acceptance obligations separately from later-owner TODOs and UI/recovery limitations.

## Safety

Use existing isolated harness, selected installed SDK packages and guarded `/private/tmp` fixtures only. No full runner, live DSH, restarts, installs, pushes or other remote changes. No `.npmrc` or credential reads/copies/backups. New report/evidence paths only; do not overwrite prior evidence. Collect owned jobs and rely on test cleanup hooks; do not stop unrelated processes. Local evidence/report commits are allowed.

## Initial ledger and run log

[Machine ledger](<plan.json>) starts all 137 approved IDs as `Not Run`, retaining the inherited names, techniques and original approval states. Results will be written separately, retaining this initial ledger for provenance. Raw task/regression/framework evidence is recorded under [evidence](<evidence/>).

- Preparation: exact base and fix refs verified; isolated worktree created; merge clean. Product diff is exactly the timestamp projection line. Existing task tests, harness and supplement files match the baseline.
- Completed and collected both full task jobs: SDK 0.2.1-rc.5 and 0.2.2-rc.1 each X0-C **95 pass / 0 fail / 9 TODO**, FN-1 **10 / 0 / 3**, B1 **10 / 0 / 10**, total **115 / 0 / 22**, exit 0. All 137 unique approved IDs and full titles/TODO states reconcile; zero missing/extra/duplicate/skip/cancel/promoted TODO. Only `XC-EP-V-05` changes from historical Fail to Pass.
- Completed safe regressions on each SDK: **44 pass / 0 fail / 1 inherited TODO**; complete body names/statuses match the prior selection.
- Separate executor completed/collected actual installed Session (one top-level scenario + three children, Node 4 pass) and actual Cordis (six passing bodies) on each SDK, all exit 0. Finite/exact source timestamps, source/order/filter-before-limit and read-only assertions pass unchanged.
- Initial machine ledger deliberately remains `Not Run` for provenance. [Final machine results](<results.json>), [per-ID table](<results.md>) and [report](<report.md>) are the final outcome source. No new test correction was needed. TODOs and real UI/loader/model/persistence/recovery/wake limitations remain explicitly unaccepted.
