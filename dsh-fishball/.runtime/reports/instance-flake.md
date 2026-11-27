# INSTANCE-FLAKE — diagnosis on `f2525fea`

**Finding:** the two suites passed all three clean rounds in both modes on both SDKs (12/12 SDK runs), as did rename `3e3bb3f5` and pushed narrow-bar `d6181c3a` (12/12 each). Neither branch produced a difference in these isolated runs. After the test-only fix, all five consecutive rounds passed for both SDKs and both modes: 20/20 SDK runs, 6,520 passing test results, zero failures or cancellations. That is not evidence that the old failures were introduced by a branch. A previously retained checkout that produced the host errors matched **all 1,391 tracked blobs** of `f2525fea`. Controlled slow writes reproduced the early cleanup in *both* clean-tip suites. Neither branch changed the instance implementation or the two suites. Load can expose the ordering bug; no CPU/load threshold or individual competing process is claimed as the cause.

## What was actually racing

Locations below refer to the unchanged integration commit. There are two separate failure phases:

1. **While asserting.** [Host first-start rows](../../test/v3/dsh-instance/host/fix-cases.mjs) waited for child readiness, slept a fixed interval and asserted import count at line 195. [Host transport](../../packages/dsh-instance/host.js) lines 257–263 starts first-start provisioning asynchronously. Ready is not an import acknowledgement. [Succession fixture](../../test/v3/dsh-instance/succession/subject.mjs) lines 136–140 waits for the *invocation* of retire, then sleeps for 150 ms. The fake counts it on entry. [The pending assertions](../../test/v3/dsh-instance/succession/cases.mjs) lines 61–64 check the live record first, then reopen disk. On pair-change retry the successful answer and the durable `settle` happen *after* invocation ([hosted logic](../../packages/dsh-instance/src/host/hosted.js), lines 175–185, 203–217). The record publishes the new live state only after the write succeeds. Neither a short sleep nor existence of the initially empty file proves completion.
2. **While tearing down.** [Scratch cleanup](../../test/v3/dsh-instance/host/subject.mjs) lines 51–58 registered recursive removal before [host disposal](../../test/v3/dsh-instance/host/row.mjs) line 148 or [succession close](../../test/v3/dsh-instance/succession/subject.mjs) line 85. Node's after-hooks ran in that order. The writer was **the test worker process itself**, not a child DSH, watcher, listener, or another SDK job. [Record initialization and queued writes](../../packages/dsh-instance/src/host/hosted-record.js) lines 43–55, 75–81 use [atomic private writes](../../packages/dsh-instance/src/native-runtime/files.js) lines 29–38: exclusive sibling `hosted.json.<uuid>` → write → fsync → close → rename. The existing [host shutdown](../../packages/dsh-instance/host.js) lines 353–386 and [hosted close](../../packages/dsh-instance/src/host/hosted.js) lines 248–254 already expose a drain. The fixture removed the tree *before invoking* that drain. Retrying `rm` alone would leave both the assertion race and the possibility of silently losing a write.

### Controlled evidence (separate from all uninstrumented counts)

A diagnostic preload targeted only the named row worker, its private root, and the matching exclusive file handle. It logged payload **shape**, same-process open/rename/remove order and outstanding operations. A 1 s delay *before* native fsync widened one write window; this is not a claim that the kernel itself took 1 s. No-delay controls for `RFI-F01 before launch` and `ISUCC-DT-02 row 3d` had no outstanding write at removal on either SDK. On unmodified `f2525fea`, with the delay, all four removals succeeded **with a write still pending**, then the rename failed `ENOENT`, although all four rows reported pass:

| Row and delayed write | rc.5: rm → rename error (ms from worker trace start) | rc.1 |
|---|---:|---:|
| `RFI-F01 before launch (MULTI-2)`, init, zero entries | 283 → 1176 | 286 → 1171 |
| `ISUCC-DT-02 row 3d`, settle, two entries, pending cleared in outgoing payload | 731 → 1580 | 717 → 1566 |

With the same delay on `3e3bb3f5`, each of the following four rows failed on **both SDKs** (8/8). These are the complete assertion messages; stack locations are on the pre-fix tree:

| Row | Error text, actual and expected | Assertion site |
|---|---|---|
| `RFI-F01 first start local → remote` | `AssertionError [ERR_ASSERTION]: imports` / `0 !== 1` | `host/fix-cases.mjs:195:14` |
| `ISUCC-DT-02 row 2c` | `AssertionError [ERR_ASSERTION]: after ok (the live record)` / actual `'fbtest-entry-1'`, expected `undefined` | `succession/cases.mjs:62:10` |
| `ISUCC-ST-01 pair during the call` | `AssertionError [ERR_ASSERTION]: after the second call answered ok (the live record)` / same actual/expected | same |
| `ISUCC-ST-02 row 2 (pair change)` | `AssertionError [ERR_ASSERTION]: after retire ok (the live record)` / same actual/expected | same |

The assertion failed **first**, followed by removal during the outstanding write and a secondary `ENOENT` on rename. Historical `Error: ENOTEMPTY, Directory not empty: '<private scratch path>'` (`errno: 66`, `code: 'ENOTEMPTY'`, `syscall: 'rm'`, host/subject.mjs:57:8) is consistent with the worker creating a sibling during recursive removal. The old stacks do not trace the writer. The controlled interleaving proves overlap, **not** that those exact historical rm calls overlapped the exact same syscall; it did not itself return `ENOTEMPTY`.

## Historical cross-check (not added to matrix totals)

- The earlier TEST-SPEED integration at `f2525fea` passed three full default runs and one full serial run per SDK, including these rows. A later byte-identical integration snapshot failed the two `RFI-F01` first-start transitions on rc.5 (`imports`) and failed before-launch (`ENOTEMPTY`) plus local→remote (`imports`) on rc.1.
- Rename's affected run: rc.5 had F01 local→remote and F07 off/on (`ENOTEMPTY`), F01 remote→blank (`imports`), DT-02 2c and ST-01 pair during call (old live marker); rc.1 had F01 local→remote (`imports`) and ST-02 pair change (old marker). Serial recheck: rc.5 ST-02 pair change and ST-01 pair during call; rc.1 those two plus F01 local→remote and DT-02 3d cleanup. Rename changed connector UI, its tests and suite selection, not the instance paths. No attributable behavioral difference for these isolated suites.
- Narrow-bar's affected run had F01 local→remote on rc.5 and F01 before-launch on rc.1, both `ENOTEMPTY`. Its changes were Fishball page layout/tests and docs, not the instance paths. Workspace-place also saw all three signatures: F01 before-launch and DT-02 3d cleanup, F01 first-start imports, and DT-02 2c/ST-02 pair change/ST-01 pair during call stale pending state.
- **Not X-11, not AUTH-DT-09.** X-11's fake bound a wildcard IPv6 ephemeral listener on macOS; traffic on an advertised exact loopback reached a different listener. Two traces showed zero requests at the fake and `HTTPParserError` at discovery (`7b0574d1`: bind both exact loopbacks). AUTH-DT-09's *fixed* physical default approval port was occupied (`approval-port-in-use` and `EADDRINUSE`); `ae11e98f` isolated the socket, `5a756f6c` restored the independent logical default/rebind expectations. The instance traces show private filesystem operations and in-process fakes, no bind/discovery/port errors.

## Uninstrumented run ledger

Commands: `node test/run-affected.mjs --suite=dsh-instance.host,dsh-instance.succession --sdk=both [--serial]` (separate spec reports per SDK). Default is parallel. Node v24.22.2 on macOS, 20 logical CPUs. Each SDK report selects the same 342 rows: on a fully green run **326 passed, 14 skipped, 2 TODO**, none cancelled. Both suites were the only suites selected. `npm install` was run once; runners used private job HOME/DSH_HOME/tmp and the installed SDKs.

Loads below are one-minute machine load at invocation start/end (not CPU utilization). During clean round 1, two independent affected-run report files advanced on disk: checking-stall and workspace-place. Process enumeration was unavailable. The rename comparison overlapped targeted probes and an invalid archive-only narrow-bar attempt. The valid narrow-bar comparison overlapped fixed-fixture verification, not rename.

| Checkout | Round | Mode | Load start → end | rc.5 failures and IDs | rc.1 failures and IDs |
|---|---:|---|---:|---|---|
| integration `f2525fea` | 1 | parallel | 18.79 → 29.33 | 0 — none | 0 — none |
| integration `f2525fea` | 1 | serial | 29.33 → 26.13 | 0 — none | 0 — none |
| integration `f2525fea` | 2 | parallel | 26.13 → 28.19 | 0 — none | 0 — none |
| integration `f2525fea` | 2 | serial | 28.19 → 24.73 | 0 — none | 0 — none |
| integration `f2525fea` | 3 | parallel | 24.73 → 21.52 | 0 — none | 0 — none |
| integration `f2525fea` | 3 | serial | 21.52 → 30.03 | 0 — none | 0 — none |
| rename `3e3bb3f5` | 1 | parallel | 8.56 → 11.64 | 0 — none | 0 — none |
| rename `3e3bb3f5` | 1 | serial | 11.64 → 9.46 | 0 — none | 0 — none |
| rename `3e3bb3f5` | 2 | parallel | 9.46 → 6.76 | 0 — none | 0 — none |
| rename `3e3bb3f5` | 2 | serial | 6.76 → 8.13 | 0 — none | 0 — none |
| rename `3e3bb3f5` | 3 | parallel | 8.13 → 11.74 | 0 — none | 0 — none |
| rename `3e3bb3f5` | 3 | serial | 11.74 → 13.17 | 0 — none | 0 — none |
| narrow `d6181c3a` | 1 | parallel | 11.48 → 10.38 | 0 — none | 0 — none |
| narrow `d6181c3a` | 1 | serial | 10.38 → 7.14 | 0 — none | 0 — none |
| narrow `d6181c3a` | 2 | parallel | 7.14 → 5.29 | 0 — none | 0 — none |
| narrow `d6181c3a` | 2 | serial | 5.29 → 4.52 | 0 — none | 0 — none |
| narrow `d6181c3a` | 3 | parallel | 4.52 → 3.95 | 0 — none | 0 — none |
| narrow `d6181c3a` | 3 | serial | 3.95 → 8.07 | 0 — none | 0 — none |
| fixed fixtures on `f2525fea` | 1 | parallel | 11.25 → 10.17 | 0 — none | 0 — none |
| fixed fixtures on `f2525fea` | 1 | serial | 10.17 → 8.63 | 0 — none | 0 — none |
| fixed fixtures on `f2525fea` | 2 | parallel | 8.63 → 5.71 | 0 — none | 0 — none |
| fixed fixtures on `f2525fea` | 2 | serial | 5.71 → 4.86 | 0 — none | 0 — none |
| fixed fixtures on `f2525fea` | 3 | parallel | 4.86 → 4.23 | 0 — none | 0 — none |
| fixed fixtures on `f2525fea` | 3 | serial | 4.23 → 7.51 | 0 — none | 0 — none |
| fixed fixtures on `f2525fea` | 4 | parallel | 7.51 → 6.18 | 0 — none | 0 — none |
| fixed fixtures on `f2525fea` | 4 | serial | 6.18 → 3.18 | 0 — none | 0 — none |
| fixed fixtures on `f2525fea` | 5 | parallel | 3.18 → 2.99 | 0 — none | 0 — none |
| fixed fixtures on `f2525fea` | 5 | serial | 2.99 → 5.22 | 0 — none | 0 — none |

## Correction and verification

- The [host fixture](../../test/v3/dsh-instance/host/subject.mjs#L51-L60) now uses one existing LIFO cleanup scope per test. The [row context](../../test/v3/dsh-instance/host/row.mjs) and [succession owner](../../test/v3/dsh-instance/succession/subject.mjs) drain before the guarded scratch removal. On automatic teardown the fake releases its own blocked F05/F07 gates, so a failed assertion cannot strand the drain. No retry or new global sleep was added.
- A separate black-box author updated only the two [first-start transitions](../../test/v3/dsh-instance/host/fix-cases.mjs) and three [pair-change rows](../../test/v3/dsh-instance/succession/cases.mjs). Their bounded waits observe import or retire count plus cleared live/reopened state; exact count, arguments, ordering, quiet interval and final assertions remain. An independent reviewer approved the applied five-file test diff. No product, runtime, dependency or suite-runner changes.
- Repeated the same six controlled one-second-delay rows on each SDK after the fix: **12/12 passed**, no skips. All 38 traced file opens committed before same-root removal; all 12 removals had an empty outstanding list, zero write or removal errors. The selected initialization/settlement write was held exactly once in each run (actual 1000.28–1003.11 ms). This is separate from the five-round uninstrumented acceptance matrix above.
- `npm run test:map` passed: `missing: 0`, `twice: 0`, `v3Unowned: 0`, `rootUnowned: 0`, `selection: 0`.

**Comparison validity.** The narrow-bar ref was verified against `origin` before testing. An initial archive-only setup lacked Git metadata: two boundary rows failed their `git ls-files` prerequisite. These invalid runs were retained locally but excluded from the matrix. The replacement was a detached Git checkout of the exact pushed commit; 1,392 tracked blobs and all nine installed dependency links were verified, and its package file manifest matched the reference. It did not require a second install. The two boundary rows passed in the replacement checkout.
