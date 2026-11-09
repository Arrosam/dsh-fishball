# X0-C accepted-key retention boundaries

## Scope and requirement basis

- Branch: `test/v2-x0c-keys-scale`, separate worktree from `22550435262cd57fa3f2eb1bd43d331e3ad5255d` (`test/v2-xc-uc-02-a1`), whose parent is `b5a99ac4adea3f48ad4cd33039185d7db2ceed81` (fake-host maintenance).
- The [approved U18 contract](<../plugins/instance-extension-points.md#L1676-L1685>) defines **10,000 as the maximum retained accepted-key history**, not a throughput target. Pending reservations retain their stable message identity and must never be evicted to satisfy this cap.
- The [requirements-derived test design](<../test-design/instance-ext-w0-core-use-cases.md#L42-L54>) expressly requires the 9,999 / 10,000 / 10,001 accepted-history boundaries with a surviving pending reservation. The [audit](<../test-design/instance-ext-w0-audit.md#L48>) allows startup recovery to accept pending work; tests must not invent an acceptance ordering.
- The prior [fake-host verification](<v2-x0c-fakehost.md#L71-L74>) records all three 60 s timeouts. The user's decision was: “Go with A, test a reasonable count with per-notification writes”. Since this is a real retention limit, the bulk history belongs in a faithful committed-storage fixture; boundary notifications remain on the real product path.
- IDs and primary **BVA** classification remain `XC-BVA-KEYS-9999`, `XC-BVA-KEYS-10000`, and `XC-BVA-KEYS-10001` (no renames).

## Fixture boundary

Only the [three BVA bodies and their same-file setup](<../../packages/instance/test/instance-ext/x0-c.test.mjs#L464-L569>) change. One real failed pending notification supplies the reservation; one ordinary accepted notification supplies the actual committed JSONL records and matching SDK inbox/admission/closed-turn history. After idle, flush and orderly close, the test copies those committed templates into 9,998 accepted entries with unique correlated message identities and contiguous SDK sequence/turn counters. The pending prefix stays unchanged. Unsupported record tails or sequence-referencing event shapes fail explicitly rather than guessing a format.

The bulk fixture writes happen only with child rows closed, outside notification delivery. A faulted pending retry keeps the initial accepted count exact. Reopening must recognize the seeded oldest/newest keys as duplicates without queueing. Each case then sends **1 / 2 / 3 real boundary notifications** and checks retained keys, pending reservation/identity and genuine eviction before pending acceptance can increase the count. An unrestricted same-home reconstruction then accepts pending work exactly once by its reserved identity, checks retained duplicates and, for 10,001, permits the evicted original oldest key to notify again.

The existing same-file pending-notification helper gains only an optional `activate` argument, defaulting to its original `true`; existing callers are unchanged. These BVA cases alone opt out of HTTP activation. Shared test-support fixtures, product code, per-notification persistence/fsync and the 60 s timeout are unchanged. One extra real accepted notification per case obtains the template; pending recovery and the 10,001 eviction probe also use ordinary notification persistence.

## Technique and acceptance criteria

These remain **Boundary Value Analysis** cases: accepted history at limit−1, limit, and limit+1, with newest-key retention at the real limit. Secondary **Equivalence Partitioning** distinguishes retained accepted keys (`duplicate`) from evicted keys (eligible for acceptance). The notification **Decision Table** distinguishes failed pending queue attempts from accepted delivery; **State Transition** checks preserve the pending message identity through failure, retention trimming, child-row reconstruction and eventual acceptance. Secondary techniques do not create extra case IDs or change the primary category. This is a supplied-agent/local-service integration fixture, not real-model or live DSH process acceptance.

## Execution isolation

Node `v24.22.2`, plain `node --test`, normal `workspace-write` policy. The selected installed SDK packages are resolver-only inputs, read-only. Each run uses `env -i`, an explicit executable `PATH`, and separate disposable `HOME`, `TMPDIR`, `DSH_HOME`, `DSH_AGENTS_HOME`, instance-fixture temp root and test-home root under `/private/tmp/fbtest-x0c-keys-scale-4noO6k/<version>/`. No install, browser, network requests, credentials, `.npmrc`, live DSH home/profile or push is used. The rewritten cases disable HTTP activation and activate the supplied manager through ordinary public notifications instead. No product implementation is read to derive oracles, and no product code or shared test-support fixture is edited.

Command, repeated with `FBTEST_DSH_RUNTIME` selecting each SDK:

```sh
node --test --test-concurrency=1 --test-timeout=60000 --test-name-pattern='XC-BVA-KEYS' packages/instance/test/instance-ext/x0-c.test.mjs
```

## Independent review

A separate reviewer checked the requirements, both SDK public Session declarations, the existing test-support fixture and the completed test diff without reading product implementation. Review found one false-positive risk: checking original-oldest eviction only after pending recovery would let an incorrect cap of 10,001 pass. The final [pre-recovery file-membership assertion](<../../packages/instance/test/instance-ext/x0-c.test.mjs#L548>) closes that gap at the actual 10,001 boundary. The reviewer approved the final 93-addition / 24-deletion test diff with no remaining correctness or scope findings.

## Final runtime verification

Frozen test SHA-256: `3bb885d954d54eedd25b3472e62dd840a338134e6796e87e2b5be689803411e1`.

Per-case times below are Node's elapsed wall-clock test durations, including setup, assertions and teardown. Full-file wall times are the shell's `time` measurements, with both final runs executed sequentially, without a timeout wrapper or forced exit.

| Case | `0.2.1-rc.5` | `0.2.2-rc.1` |
| --- | ---: | ---: |
| `XC-BVA-KEYS-9999` | 7.296960 s — pass | 6.883282 s — pass |
| `XC-BVA-KEYS-10000` | 6.929542 s — pass | 7.295511 s — pass |
| `XC-BVA-KEYS-10001` | 7.859528 s — pass | 6.769540 s — pass |
| Full file, shell wall time | 22.712 s | 21.716 s |
| Process result | Natural exit 0; 3 pass, 0 fail/cancelled/skipped/TODO | Natural exit 0; 3 pass, 0 fail/cancelled/skipped/TODO |

The preliminary rc.5 run also passed all three and exited naturally (27.275 s), before the reviewer-requested eviction assertion. Only final frozen-source runs count in the table. Raw local logs are retained in ignored `.runtime/keys-scale-verification/`.

`node --check` and `git diff --check` passed. No full-file unfiltered suite or root suite was run for this narrowly scoped task, and no broader acceptance is claimed.
