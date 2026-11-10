# D1–D3 superseded-test maintenance verification

## Scope and authority

- Work branch: `test/v2-d1-d3-superseded`, created from `8b3873d1d9c440de91f167cf9ad25531bd265002` (`dev/v2-compat-d1-d3`) in its own worktree.
- Requirements: [public contract 1.2](<../connector-contract.md>), [independent inventory](<v2-d1-d3-independent-inventory.md>), and [existing-suite baseline delta](<v2-d1-d3-baseline-delta.md>).
- Direct user decision, 2026-11-09: “D1D2都做，D3改成instance单向点亮connector的提示灯，connector单向显示未读，点开后自动消除未读提示。instance只发送无状态提示，状态在connector处处理。”
- Test/support changes only. Product implementation was not read; no product edits. No browser, external network, credentials, `.npmrc`, live DSH/profile/home, package installation or push. Local in-process fixtures may listen on disposable localhost endpoints.
- Both SDK package roots were consumed read-only through explicit `FBTEST_DSH_RUNTIME`. Commands run with the session's `workspace-write` file policy and the existing Node runtime, not a replacement server or DSH launcher.

## Baseline reproduced

The unchanged baseline commit `5d93891aa41bd9b716faa91306b22095d3b076c2` was archived under this worktree's ignored scratch directory. The same eight existing files were run on each SDK before maintenance. No current fixtures were backported to that archive.

| SDK | Total | Pass | Fail | TODO | Cancelled | Skipped | Exit |
|---|---:|---:|---:|---:|---:|---:|---:|
| 0.2.1-rc.5 | 245 | 126 | 32 | 87 | 0 | 0 | 1 |
| 0.2.2-rc.1 | 245 | 126 | 32 | 87 | 0 | 0 | 1 |

TODOs are inventory, not passes. The four old X0-W attention-owner failures are among these 32; rewriting/deleting superseded requirements is not a product fix.

## Exact selected invocation

The historical development matrix comprises the eight existing files below plus the two schema/version files (34 additional cases). The unchanged baseline has only the eight existing files.

```sh
for version in 0.2.1-rc.5 0.2.2-rc.1; do
  runtime="/Users/samuel/Library/Application Support/DSH/data/versions/$version/node_modules"
  FBTEST_DSH_RUNTIME="$runtime" TMPDIR=/private/tmp node \
    --test --test-concurrency=1 --test-timeout=60000 \
    packages/connector/test/instance-ext/k1.test.mjs \
    packages/connector/test/instance-ext/mcp-feasibility.test.mjs \
    packages/instance/test/instance-ext/x0-c.test.mjs \
    packages/fold-notify/test/instance-ext/fn-1.test.mjs \
    test/instance-ext/x0-w.test.mjs \
    test/body-soul-i3-admission.test.mjs \
    test/body-soul-i7-records.test.mjs \
    test/e1-p2-model-choice.test.mjs \
    test/v2-d1-contract.test.mjs \
    test/v2-d1-d3-schema.test.mjs
done
```

Additional independent D1–D3 invocation, separate from the selection totals:

```sh
FBTEST_DSH_RUNTIME="$runtime" TMPDIR=/private/tmp node \
  --test --test-concurrency=1 --test-timeout=60000 \
  test/v2-d1-runtime.test.mjs \
  test/v2-d1-contract.test.mjs \
  test/v2-d1-d3-schema.test.mjs \
  test/v2-d2-config-retention.test.mjs \
  test/v2-d3-connector-attention.test.mjs \
  test/v2-d3-signal-producer.test.mjs
```

## Current results

Both final selected runs and both independent runs completed and were collected. Each selected invocation exits 1 because of the 28 pre-existing baseline failures; each independent invocation exits 0.

| SDK | Total | Pass | Fail | TODO | Cancelled | Skipped | Δ pass/fail/TODO vs baseline |
|---|---:|---:|---:|---:|---:|---:|---|
| 0.2.1-rc.5 | 275 | 162 | 28 | 85 | 0 | 0 | +36 / −4 / −2 |
| 0.2.2-rc.1 | 275 | 162 | 28 | 85 | 0 | 0 | +36 / −4 / −2 |

The 34 pre-existing schema/version cases account for 34 additional passes versus the old eight-file baseline. Three former X0-W failing cases now pass under rewritten stateless-signal requirements; one obsolete failing owner-busy case was deleted. The obsolete passing `attention.set` stub case was deleted, and the two obsolete count/timestamp BVA TODOs were deleted. Thus the old development total 279 becomes 275, rather than disguising deleted cases as passing coverage. See the [per-case old → new inventory](<v2-d1-d3-superseded-cases.md>).

Compared with the development run's 147 pass / 45 fail / 87 TODO, the maintenance yields 162 pass / 28 fail / 85 TODO: all 13 added failures are gone. There are no newly failing cases. The remaining 28 have the **same names and first diagnostic text on each SDK as in the independently reproduced unchanged baseline**; there is no longer a timerfree-readiness refusal masking those failures.

| Independent six-file run | Total | Pass | Fail | TODO | Cancelled | Skipped |
|---|---:|---:|---:|---:|---:|---:|
| 0.2.1-rc.5 | 50 | 50 | 0 | 0 | 0 | 0 |
| 0.2.2-rc.1 | 50 | 50 | 0 | 0 | 0 | 0 |

The independent totals overlap the selected run's 34 schema/version cases and must not be added to 275 as unique cases.

### Every remaining failure: classification on both SDKs

All rows below are **pre-existing baseline**, not a newly observed D1–D3 product defect. They remain failures, not waivers. Product implementation was not inspected, so this task does not decide whether the old durable-queue gap is ultimately fixture support or unrelated product behavior.

| Case ID | Observed diagnostic / boundary | Classification |
|---|---|---|
| XC-EP-STUB-16 | Expected scoped bridge `ExtensionError/not-implemented` rejection is missing | Pre-existing baseline |
| XC-UC-02-M | `manager.notify: durable-queue-unavailable` | Pre-existing baseline |
| XC-UC-02-A1 | `manager.notify: durable-queue-unavailable` | Pre-existing baseline |
| XC-UC-02-E1 | `manager.notify: durable-queue-unavailable` | Pre-existing baseline |
| XC-UC-02-E2 | `manager.notify: durable-queue-unavailable` | Pre-existing baseline |
| XC-DT-01 | Followup rejection-injection boundary not reached: actual 0, expected 1 | Pre-existing baseline |
| XC-ST-NOTIFY-HANDOVER | Followup rejection-injection boundary not reached: actual 0, expected 1 | Pre-existing baseline |
| XC-ST-NOTIFY-RECOVERY | Followup rejection-injection boundary not reached: actual 0, expected 1 | Pre-existing baseline |
| XC-BVA-KEYS-9999 | Followup rejection-injection boundary not reached: actual 0, expected 1 | Pre-existing baseline |
| XC-BVA-KEYS-10000 | Followup rejection-injection boundary not reached: actual 0, expected 1 | Pre-existing baseline |
| XC-BVA-KEYS-10001 | Followup rejection-injection boundary not reached: actual 0, expected 1 | Pre-existing baseline |
| XC-UC-02-A2 | `manager.notify: durable-queue-unavailable` | Pre-existing baseline |
| XC-UC-02-A3 | `manager.notify: durable-queue-unavailable` | Pre-existing baseline |
| XC-UC-04-M | `manager.notify: durable-queue-unavailable` | Pre-existing baseline |
| XC-BVA-BATCH-COUNT-1 | `manager.notify: durable-queue-unavailable` | Pre-existing baseline |
| XC-BVA-BATCH-COUNT-19 | `manager.notify: durable-queue-unavailable` | Pre-existing baseline |
| XC-BVA-BATCH-COUNT-20 | `manager.notify: durable-queue-unavailable` | Pre-existing baseline |
| XC-BVA-BATCH-BYTES-65535 | `manager.notify: durable-queue-unavailable` | Pre-existing baseline |
| XC-BVA-BATCH-BYTES-65536 | `manager.notify: durable-queue-unavailable` | Pre-existing baseline |
| XC-EP-BATCH-01 | `manager.notify: durable-queue-unavailable` | Pre-existing baseline |
| XC-DT-03 | `manager.notify: durable-queue-unavailable` | Pre-existing baseline |
| XC-DT-04 | `manager.notify: durable-queue-unavailable` | Pre-existing baseline |
| XC-BVA-BATCH-IMAGECOUNT-19 | `manager.notify: durable-queue-unavailable` | Pre-existing baseline |
| XC-BVA-BATCH-IMAGECOUNT-20 | `manager.notify: durable-queue-unavailable` | Pre-existing baseline |
| XC-BVA-BATCH-IMAGE-pixels-4194303 | `manager.notify: durable-queue-unavailable` | Pre-existing baseline |
| XC-BVA-BATCH-IMAGE-pixels-4194304 | `manager.notify: durable-queue-unavailable` | Pre-existing baseline |
| XC-BVA-BATCH-IMAGE-bytes-4194303 | `manager.notify: durable-queue-unavailable` | Pre-existing baseline |
| XC-BVA-BATCH-IMAGE-bytes-4194304 | `manager.notify: durable-queue-unavailable` | Pre-existing baseline |

Summary: 21 explicit durable-queue refusals, six unreached rejection-injection assertions, one missing scoped-stub rejection. No new fixture failure and no D1–D3 product failure was observed in the authorized selection.

### Local execution evidence

Raw outputs are retained in the ignored worktree scratch directory, not checked in:

- Baseline: [0.2.1-rc.5](<../../.runtime/v2-d1-d3-superseded/baseline-0.2.1-rc.5.tap>), [0.2.2-rc.1](<../../.runtime/v2-d1-d3-superseded/baseline-0.2.2-rc.1.tap>).
- Final selection: [0.2.1-rc.5](<../../.runtime/v2-d1-d3-superseded/final-0.2.1-rc.5.tap>), [0.2.2-rc.1](<../../.runtime/v2-d1-d3-superseded/final-0.2.2-rc.1.tap>).
- Independent D1–D3: [0.2.1-rc.5](<../../.runtime/v2-d1-d3-superseded/independent-0.2.1-rc.5.tap>), [0.2.2-rc.1](<../../.runtime/v2-d1-d3-superseded/independent-0.2.2-rc.1.tap>).

These `.tap` paths contain Node's default spec-reporter text; they are the actual uncooked command outputs, not a claim that the reporter format is TAP.

## Support checks and review

- Public envelope-codec black-box probe confirmed explicit negotiated context as the third `encodeEnvelope` argument and in `decodeEnvelope` options; no product source inspection was used to fill the legacy helper-table documentation gap.
- The support author ran bounded fake EventEmitter IPC checks without launching a worker/DSH: current contract/marker defaults, explicit 1.1 legacy defaults, legacy handshake, exact caller capability/contract overrides, and listener cleanup all passed.
- A separate public-codec smoke checked modern mutual advertisement, pre-handshake/default legacy descriptor schema, timerfree event/list encoding, deadline rejection, exact explicit capabilities, and legacy host refusal of required timerfree. It passed without booting child rows.
- Final `node --check` passed on all 26 modified JavaScript test/support files; `git diff --check` passed.
- Independent read-only review of all 26 modules and both ledgers finished with **no outstanding actionable findings**. Review fixes addressed explicit session resumption after stopped-profile seeds, the overlooked plan-mode case, preservation of pre-restart active-limit no-remount evidence, raw-wire negative signal assertions, and canonical containment of the seeded patch target. The final selected matrix was rerun after the raw-wire assertion fix, with unchanged totals and baseline-matching diagnostics. Review covered only docs/tests/support, not product implementation.

## Exclusions and limits

Real-host integration suites that spawn DSH are not run, including revised H-STUB deadline/mode cases. The new stopped-profile seed/restart helper is statically reviewed and syntax checked, not runtime-proven against DSH; it resumes only session IDs explicitly listed by each caller and does not discover sessions or replay in-flight requests. Static/syntax review of those rewrites is not runtime proof. The revised K2 file also remains unexecuted because its existing top-level helper extracts product client source; the extra X0-B file remains unexecuted because its initializer creates additional boot/link artifacts. No browser execution is permitted, so actual page-open UI wiring is not verified by this task. Former-deadline wall-clock waits do not establish controlled-clock −1/0/+1 ms precision. Existing legacy default-schema checks and grant/attachment expiry remain independent of negotiated timer-free descriptors.

## LEDGER addendum: `I1c-V-02` connector-upgrade code (2026-11-10, append-only)

Branch `test/v2-ledger-i1c` from `b5b14755b7fb9a93d06944831919248a58061782`, per [final-scope §4.1](<https://github.com/Arrosam/dsh-fishball/blob/cd87106f3bc761d68c6e919e83ffd40ac8e86262/docs/planning/v2-final-scope.md>). The results above are unchanged in meaning.

- **Reason.** D1 ([contract 1.2 §3.2.1](<../connector-contract.md#321-negotiated-timer-free-interactions-d1>), [extension points §3](<../plugins/instance-extension-points.md#3-v2-retained-connector-compatibility-d1d3>)) requires the built-in to report that an old connector must be upgraded and to detach itself. Final-scope §4.1 names that diagnostic `NATIVE_CONNECTOR_UPGRADE_REQUIRED`, and Fishball confirmed it on 2026-11-10 as an instance-only status code: shown on the card and the status route, and filtered out of the public `status()`. The [status suite](<../../test/body-soul-i1c-status.test.mjs>) still had the pre-D1 vocabulary.
- **Old result.** At `b5b1475`, `I1c-V-02` was the only ordinary root failure on both SDKs (wave-3a: 1570 total, 1 fail).
- **Change (test only, no product edit).** The code is added to the exact expected instance vocabulary (`I1c-V-02`). There is a new explicit partition, `I1c-ST-EP-06`, after the `I1c-ST-EP-02/03/05` partitions: failed with this code never reaches `status()`. `I1c-V-04` explicitly checks that the code is not a contract `STATUS_CODES` value. No assertion was removed or loosened. The dynamic `I1c-ST-DT-01` loop is not counted as this explicit coverage.
- **Not proven here.** The rendered upgrade message, the no-ready/owner-fenced detach and Retry behavior are not exercised by this suite. Inventory TC-04 stays **Not Run**.
- **Known stale requirement text.** [instance.md O1](<instance.md>) still lists only `NATIVE_INSTANCE_BUSY` and `NATIVE_CONTRACT_VERSION` as instance codes. It omits `INVALID_MAIN_HOME` (D2) and `NATIVE_CONNECTOR_UPGRADE_REQUIRED` (D1). A docs task should align it; this ledger task did not edit it.
- **New result.** See the [wave-3a addendum](<../verification/v2-nov9-wave3a.md#ledger-addendum-i1c-v-02-2026-11-10-append-only>).
