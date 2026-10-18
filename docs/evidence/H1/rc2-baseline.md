# H1: green full-suite baseline on DSH Web 0.2.1-rc.2

Branch `feat/H1-rc2-baseline` (local only), based on `feat/S3-integrations` at `6b2c77f`. Commits: `2c5088d` (host pin and API adaptation) and `3e12090` (regression and oracle repair). The owner decisions are recorded in [the rc.2 amendment](../../owner-amendment-2026-10-18-rc2.md).

## Result

The canonical command was run on Node v22.22.2 (Python 3.15.0 for the manifest builder):

```sh
/usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=$HOME DF_FISHBALL_CORDIS_REVIEWED=1 \
  node --test --test-concurrency=4 test/*.test.mjs
```

| Run | Host | Tests | Pass | Fail | Cancelled | Skipped |
| --- | --- | --- | --- | --- | --- | --- |
| Before, `6b2c77f` | none installed (missing `.runtime/dsh-web`) | 1595 | 1545 | 50 | 0 | 1 |
| First rc.2 run, pins only | rc.2 | 2131 | 1887 | 236 | 8 | 0 |
| After, `3e12090` | rc.2 | 2181 | 2181 | 0 | 0 | 0 |
| After review remediation (final H1 commit) | rc.2 | 2194 | 2194 | 0 | 0 | 0 (todo 0) |

The suite was never green after the canonical integration `4fea280` (Oct 8). Its recorded regression checkpoints ran selected subsets only. About 20 failures were present without any host change.

## Root-cause categories

**(c) Product regressions from `4fea280`, fixed in `src/runtime-plugin.mjs`:**

1. A memory-only normal install (no worker) ran `prepareContext` outside the installed invocation carrier. The guarded projection store then refused with `SERVICE_DISPOSED`, which surfaced as `MEMORY_UNAVAILABLE`. Fix: route it through the existing normal-operation carrier wrapper.
2. The advanced runtime (`createRuntimePlugin` without installers) demanded a carrier it can never have. Fix: owner-carrier checks apply only when `installed || continuity`; otherwise the original `assertAlive` path applies.
3. After an installed seal (receipt-observer uncertainty), the read-only `memoryRead` refused. This contradicts BUB006-05 ("installed admission seals while scoped task/memory/data reads remain usable"). Fix: `memoryRead` checks plugin liveness plus the carrier. Every mutation still requires `installedAlive`.

**(b) rc.2 host changes:**

- `operator` became `browserPeer`.
- `BrowserAuth.authenticateApi` was added.
- JSONL persistence is now a plugin namespace.
- A disposed Connection now answers 401 before plugin routes run (formerly a 200 `SERVICE_DISPOSED` envelope).
- `dsh-client-ui-slots` is now bundled into the web frontend, not a package.
- `tool-ralph` moved into an opt-in bundle.
- 38 of 58 pinned host files changed bytes.

Each change is in the amendment table or in its test-file comments.

**(a) Stale Oct-5 test oracles after intended product changes:**

- Ledger schema 7 (`4fea280`), plus sealed empty registries written at migration.
- `readMemoryCommand` (`7df1c2c`, authorized in [the core6 lease](../NI4/core6-source-only-lease.md)).
- Installed invocation carrier gate.
- Features and capabilities additions (`memoryContinuity`, `automation`, `results`).
- Role models in the catalogue.
- Per-chunk provider currentness (NAT05).
- Lazy native composition latch.
- Fixture shapes (task-detail `executions`, adapter binding `spec`/`sessionRef`).

## Explicit oracle decisions for reviewers

| Decision | Rationale | Owner of risk |
| --- | --- | --- |
| A10 ("revoke after first output keeps late committed output, capture, finish") is superseded by NAT05 ([design](../NI4-5/normal-selected-byte-reviewer-independent-design.md) row NAT05). Revoke after the first chunk now denies later chunks: usage stays charged, there is no capture or finish, and the reservation stays held. | `4fea280` deliberately rechecks currentness after every yielded chunk. The new behavior is fail-closed. | Root; flagged for independent review. |
| R03 (**decided**): a failed lazy native construction latches native composition permanently unavailable (`WORKER_SOURCE_UNAVAILABLE`, no reattempt within the lifetime) but intentionally does **not** seal installed admission (`isAlive()` stays true). Before `4fea280`, eager composition sealed it. | Native admission is already permanently closed by the latch, so a full seal would add no protection. It would only remove task/memory/read work that BUB006-05 and the test's own intent keep usable. Sealing remains required for uncertain observer outcomes (R06). The test is renamed and gains a positive "not sealed" assertion. | Root decision 2026-10-18 after ISTQB M3. |
| M17's exact readonly-check count (6) became a lower bound plus a multiple-of-3 structure. | `installed-owned-stream` rechecks around every iterator step, so the count depends on the number of host stream steps. The no-mutation check runs inside every pass. | Flagged for ISTQB review. |
| Disposed-connection refusals are asserted as HTTP 401 instead of a `SERVICE_DISPOSED` envelope. | The rc.2 host refuses earlier, before the df bridge. This is still a refusal. | — |

## Authors and reviews

- Root: Claude Opus 5.5, owning Git, src, scripts and docs.
- Helper authors: four separate Claude Opus 5.5 sessions, each restricted to disjoint test-file groups (A ledger/schema, B installed seams, C native provider, D installation/memory/web/client). None ran Git mutations; root applied every src or script change after verifying it.
- Independent CODE and ISTQB reviews: separate Claude Opus 5.5 sessions on `3e12090`; results are in the section below.

### Independent CODE review (Claude Opus 5.5, read-only, on `2c5088d`+`3e12090` vs `6b2c77f`)

Verdict **APPROVE_WITH_FINDINGS**, with 0 blocking and 0 major findings.

The reviewer verified the following:

- All 56 hash literals in `src/` and `scripts/` match their rc.2 files.
- No alpha pin or check remains.
- The tracked lock is byte-identical to the installed lock, and all 615 packages have the same version and integrity.
- `browserPeer` gives exactly the alpha.1 `operator` semantics. rc.2 API Peers and `createPeer()` Peers are distinct objects and are refused by identity.
- The `prepareContext` changes skip no owner check and double-wrap nothing.
- The `memoryRead` seal exemption is stricter than pre-`4fea280` behavior.

| Finding | Disposition |
| --- | --- |
| 1 minor: `native-adapter` `isJsonlPersistence` partly tautological; only base class + writable `name` | Fixed: provider lineage required (service fiber `session-persistence-jsonl-service`, parent fiber whose runtime callback is the pinned JSONL `apply`) |
| 2 minor: worker-facts binding relied on the Cordis single-provider invariant | Fixed: new `providedByJsonlEntry` binds the service fiber's parent to the exact located Loader entry fiber and the pinned `apply` |
| 3 minor: `memoryStatus`/`memoryCommandStatus` (pure reads) refused after the seal, inconsistent with `memoryRead` | Fixed: an explicit `SEAL_SURVIVING_READS` set holds the three pure reads; all other normal operations still require `installedAlive` |
| 4 minor: Ralph absence enforced only by a test | Fixed: `prepareRuntimeWeb` refuses any bundle selection other than the two base layers (`FIXTURE_PROFILE_BUNDLE_INVALID`) |
| 5 nit: stale alpha refs in README/notices | Fixed (versions/licenses re-verified from rc.2 package metadata); `prep/w2/verify.mjs` left as historical W2 preparation |
| 6 nit: `identityBridge: 'connection-operator'` | Renamed `connection-browser-peer` |
| 7 nit: backtick literal / overstated comment | Fixed |

A test helper found one further issue during remediation, and root fixed it in src. A throwing authority callback at between-chunk checks 2–4 leaked its raw message into the host stream finish reason, which violates the redact-by-stable-code invariant. `recheck()` now redacts any throw to `WORKER_REQUEST_DENIED` and seals the permit.

### Independent ISTQB review (Claude Opus 5.5, read-only, on `2c5088d`+`3e12090` vs `6b2c77f`)

Verdict **APPROVE_WITH_FINDINGS**: 0 blocking, 4 major, 6 minor. The reviewer independently reran the full suite: 2181/2181 pass, 0 fail/cancelled/skipped, 243.9 s.

| Finding | Disposition |
| --- | --- |
| M1: M17 exact count weakened to a lower bound (4 calls of slack) | Remediation: exact formula with named stream and non-stream checks |
| M2: R06 does not exercise post-seal `/df-rpc` mutations through the changed wrapper | Remediation: TC4 seal partitions with memory revision unchanged |
| M3: R03 negative oracle inverted without a recorded decision | Decided (table above); test renamed and given a positive non-seal assertion |
| M4: NAT05 has no per-chunk denial decision table; usage asserted only as not-null | Remediation: TC3 k=1..4 table, exact usage |
| m6/TC1–TC2: no genuine rc.2 API Peer end-to-end refusal on `/df-rpc` and `/df-setup` | Remediation: new end-to-end tests |
| m5/TC8: no forged `session-persistence-jsonl` subclass negative | Remediation: new negative |
| m1–m4 (401 replacements, migration registries, CCF split, carrier-less coverage) | Accepted as justified; TC7 (NAT05 recovery) and TC9 (exact registry payload) retained as open coverage debt |

Remediation, done by a separate Claude Opus 5.5 test-author session that edited test files only:

- **M17:** now exact: `readonlyChecks === 54`, i.e. (3F+2 stream steps + 4 provider checks) × 3, with F = 4.
- **R06 and R06b:** after the seal, real `/df-rpc` `memoryRemember`/`memoryCorrect`/`prepareContext` refuse with `SERVICE_DISPOSED`, with memory state and ledger unchanged. Reads survive the seal and stop after disposal.
- **R03:** renamed, with a positive "not sealed" mutation proof.
- **P16:** k = 1..4 decision table, for both return-false and throw.
- **NAT05:** exact usage (`totalUnits = 3198`).
- **TC1/TC2:** new [rc2-api-peer-adversarial](../../../test/rc2-api-peer-adversarial.test.mjs). A genuine rc.2 launch-token API Peer is admitted by the host but refused with `OPERATOR_REQUIRED` on `/df-rpc` and on every `/df-setup` route, with no writes and no child.
- **TC8/F16:** a forged `session-persistence-jsonl` backend from a non-pinned module refuses with `WORKER_SOURCE_UNAVAILABLE` (no pinned-namespace entry), and no directory is created.

P16 found a real product defect. Throwing authority callbacks at checks 2–4 leaked their raw message, and the fix is in `src/testing-provider.mjs` (`recheck()`).

These are Opus 5.5 reviews under the owner's 2026-10-18 instruction. They do not close the separately blocked historical final CODE investigation. No ticket, criterion or MVP acceptance follows from a green suite. All 87 criteria remain HOLD.

## Not done in this unit

No browser or visual run, no real model call, no package/install lifecycle run against rc.2, no `initial-preview` launcher run on rc.2, no main merge, no push.
