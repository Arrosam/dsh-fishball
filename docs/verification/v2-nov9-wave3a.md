# Wave 3a integration verification

## Scope

Branch `integrate/v2-nov9-wave3a`, based on `5d93891aa41bd9b716faa91306b22095d3b076c2`, in its own worktree. Local `--no-ff` merges, in order:

1. `83b37409f99a375f72b6f6e0835af574e2f8f13c` → merge `aaa44a7a9b5a751bf88f6ef15970be290bbc652a`.
2. `528509f51c7a7b370ce86554d26944a5a8b73408` → merge `04e39ecafb29383a20b425e9ecac40ba5d62177f`.
3. `ca3dd3e7da25a31d140bf93bc2e090c1e809d0f3` → merge `381e10bd5dc8459dfa8a3edb6c573be610661c42`.

The only textual conflicts were the two additive amendments in [DESIGN.md](../../DESIGN.md) and SDK-backed fake-agent definitions versus D1–D3 capability definitions in [instance-ext.mjs](../../test/support/instance-ext.mjs). Both sides were retained. No assertion changes were introduced by integration. Root verification subsequently found one incoming product defect, fixed by restoring the missing `APPROVAL` constants import in [questions.js](../../packages/connector/src/questions.js). Four existing uses remained after D1–D3 removed the import, causing session-event listeners and question recovery paths to throw. The one-line fix restores existing behavior; no new behavioral rule was added.

Full-root verification also exposed an incoming fixture regression from `528509f5`: [restart helper](../../test/support/instance-stub.mjs) persisted per-boot `attach:false`, so a later plain restart had no attachment and four durable-watch cases failed during setup (`record.id` on undefined). The fix stops persisting `attach`, while preserving environment, linked fixtures, client variant, and explicit per-call attachment options. No watch implementation or test assertion was changed.

## Independent static review

An independent read-only reviewer compared merge `04e39ec` with both parents and reviewed automatically merged product/support changes. No actionable merge-induced findings. SDK SessionStore semantics, validation, publication restrictions, setup ordering, flush/restart durability, injection/index behavior and teardown remain intact; modern and explicit legacy capability negotiation is retained. The review preceded this final evidence commit. A separate independent diagnosis/review approved the one-line `APPROVAL` import restoration; seven unchanged session-title/question files passed 134/134 on each SDK. Those supplementary runs omitted the 60-second test-timeout flag and are not the required-flag certification; the final full-root runs cover them with the requested flag. The fixture restart fix also received independent static review and unchanged full durable-watch verification on both SDKs: 12/12 passed per SDK with all requested flags, versus 8 pass/4 fail before the fix.

## Verification method

Both installed SDK node_modules roots are read-only: `0.2.1-rc.5` and `0.2.2-rc.1`. All tests use plain Node with `--test --test-concurrency=1 --test-timeout=60000`, workspace-write, no installs or pushes. Root invocation is `node test/run.mjs --test-concurrency=1 --test-timeout=60000`; the runner delegates to plain Node tests. Root runs use `env -i` with disposable HOME, DSH_HOME and DSH_AGENTS_HOME, `/private/tmp` temporary storage, telemetry disabled and explicit FBTEST_DSH_RUNTIME. No browser, external network/model service, live profile or real credential access is intended. Root's scripted model and generated dummy credential fixtures are not live services. Root includes disposable DSH subprocess fixtures; package-install opt-ins remain unset. Static execution-safety audit found no project `.env` and no default external/live-profile access.

Focused invocations:

- Full X0-C: `packages/instance/test/instance-ext/x0-c*.test.mjs` (includes held-context regressions).
- D1–D3 selection: exact ten-file invocation in [maintenance results](../test-design/v2-d1-d3-superseded-results.md#exact-selected-invocation).
- Independent D1–D3: the six-file invocation in that same section (50 cases; 34 overlap the selection).
- Search: `packages/board/test/instance-ext/b11-search.test.mjs`.
- B1: `packages/board/test/instance-ext/b1.test.mjs`.
- FN-1: `packages/fold-notify/test/instance-ext/fn-1.test.mjs`.

Raw logs are retained locally under the ignored `.runtime/wave3a/` directory. TODOs and skips are not passes. Counts across suites overlap and must not be summed as unique coverage.

## Results

Final-source root runs completed naturally (`*-root-verified.log`); both exited 1 solely because of the unchanged stale vocabulary assertion below. Earlier runs were diagnostic: the pre-import-fix run was stopped, the intermediate rc.5 run completed with the four restart-fixture failures, and the intermediate rc.1 run was stopped after the fixture diagnosis. None is substituted for final-source totals. Focused suites were also rerun after both fixes (`*-verified.log`).

Known root assertion mismatch: `I1c-V-02` hardcodes the old instance-code vocabulary and excludes the D1–D3 `NATIVE_CONNECTOR_UPGRADE_REQUIRED` value. Independent diagnosis classifies this as an outdated test expectation, not an unwanted product status: the approved contract requires reporting the upgrade and detaching when timer-free support is missing, and `contractStatus` filters instance-only values from the public contract status. The assertion is retained unchanged per the integration constraint; removing the valid diagnostic to manufacture a pass would violate the supplied behavior.

| SDK | Suite | Total | Pass | Fail | TODO | Skip | Cancelled |
|---|---|---:|---:|---:|---:|---:|---:|
| 0.2.1-rc.5 | Full root | 1570 | 1545 | 1 | 7 | 17 | 0 |
| 0.2.2-rc.1 | Full root | 1570 | 1541 | 1 | 7 | 21 | 0 |
| 0.2.1-rc.5 | Full X0-C including held-context | 110 | 101 | 0 | 9 | 0 | 0 |
| 0.2.2-rc.1 | Full X0-C including held-context | 110 | 101 | 0 | 9 | 0 | 0 |
| 0.2.1-rc.5 | D1–D3 selection | 275 | 190 | 0 | 85 | 0 | 0 |
| 0.2.2-rc.1 | D1–D3 selection | 275 | 190 | 0 | 85 | 0 | 0 |
| 0.2.1-rc.5 | Independent D1–D3 | 50 | 50 | 0 | 0 | 0 | 0 |
| 0.2.2-rc.1 | Independent D1–D3 | 50 | 50 | 0 | 0 | 0 | 0 |
| 0.2.1-rc.5 | b11-search | 102 | 102 | 0 | 0 | 0 | 0 |
| 0.2.2-rc.1 | b11-search | 102 | 102 | 0 | 0 | 0 | 0 |
| 0.2.1-rc.5 | B1 | 20 | 10 | 0 | 10 | 0 | 0 |
| 0.2.2-rc.1 | B1 | 20 | 10 | 0 | 10 | 0 | 0 |
| 0.2.1-rc.5 | FN-1 | 13 | 10 | 0 | 3 | 0 | 0 |
| 0.2.2-rc.1 | FN-1 | 13 | 10 | 0 | 3 | 0 | 0 |

Root wall times: rc.5 1,113.066 seconds; rc.1 1,164.949 seconds. The root's existing provider-sync HTTP classification case `P3-H-DT-01` remains a TODO with a failing diagnostic, not an additional ordinary failure and not a pass. No claim is made to fix that unrelated existing TODO. The remaining I1c-V-02 failure is outside the historical 28-case group.

## Historical 28 failures

The source ledger is [D1–D3 maintenance results](../test-design/v2-d1-d3-superseded-results.md#every-remaining-failure-classification-on-both-sdks). It was measured without the SDK-backed fake host now merged.

- 21 explicit `manager.notify: durable-queue-unavailable` cases: repaired fixture capability, with held-notice behavior also benefiting from the supplied product inject fix. Current results must establish these paths instead of treating baseline names as continuing failures.
- Six unreached rejection-injection cases: three retry/handover/recovery boundaries are exercised through the supplied SDK-backed fake host. The three KEYS cases were already superseded by the supplied independently authored bounded 9,998-seed + 1/2/3-notification retention tests; passing them is not evidence that obsolete 10k-throughput cases meet 60 seconds.
- `XC-EP-STUB-16`: the old not-implemented oracle was already superseded on the supplied X0-C branch by in-scope delegation and out-of-scope local refusal/no-wire/no-new-handshake assertions. A pass is not a repair of the retired stub requirement.

**None of the 28 remain as failures in the current selection on either SDK:** 275 total, 190 pass, 0 fail, 85 TODO versus 162 pass, 28 fail, 85 TODO before integration. The 24 non-superseded cases pass; three KEYS cases and the scoped-stub case pass their already-supplied replacement requirements. Thus this is not a claim that all 28 historical assertions were preserved and repaired. No remaining failure in that selection needs a product-versus-fixture disposition. The separate full-root run did expose the missing-import product defect described above. Integration does not alter the supplied assertions.

## LEDGER addendum: I1c-V-02 (2026-11-10, append-only)

This adds to the results above without changing them: the two root runs at `b5b1475` exited 1 only because of `I1c-V-02`. Branch `test/v2-ledger-i1c` updates the stale oracle. It adds `NATIVE_CONNECTOR_UPGRADE_REQUIRED` (D1, named in final-scope §4.1, confirmed by Fishball as an instance-only status code) to the exact instance vocabulary. It also adds the explicit partition `I1c-ST-EP-06` and explicit `I1c-V-04` non-leak coverage. These are test changes only, no product edit. Reason and scope: [D1–D3 results addendum](<../test-design/v2-d1-d3-superseded-results.md#ledger-addendum-i1c-v-02-connector-upgrade-code-2026-11-10-append-only>).

The method is the same as above, except the test-home root is set explicitly with `FBTEST_TEST_HOMES`. Plain `node --test --test-concurrency=1 --test-timeout=60000` runs every `test/*.test.mjs` except `native-production-*`, the same file set as `test/run.mjs`. The run uses `env -i`, a disposable HOME/DSH_HOME/DSH_AGENTS_HOME/TMPDIR under `/private/tmp`, and an explicit `FBTEST_DSH_RUNTIME`. Raw logs are under the ignored `.runtime/ledger/`.

| SDK | Suite | Total | Pass | Fail | TODO | Skip | Cancelled | Exit |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 0.2.1-rc.5 | Full root | 1571 | 1547 | 0 | 7 | 17 | 0 | 0 |
| 0.2.2-rc.1 | Full root | 1571 | 1543 | 0 | 7 | 21 | 0 | 0 |

The total rises from 1570 to 1571 because of the one new case, `I1c-ST-EP-06`. `P3-H-DT-01` is still the existing TODO with a failing diagnostic, not a pass. Inventory TC-04 (rendered upgrade message, owner-fenced detach, Retry) stays Not Run.
