# Independent W0 verification: X0-C, FN-1 and B1

Date: **2026-11-09 (Pacific/Auckland)**. Verification-only delivery; no product fix, install, push, live DSH launch or restart.

## Verdict

**FN-1 and B1 are ready at their approved W0 skeleton boundary. X0-C is not merge-ready as a completed task.** A confirmed X11 timestamp defect affects both requested hosts, and approved local async/durable/context/image acceptance TODOs remain explicitly unproved. Later WD/MCP implementation absence is not counted as a defect in these tasks.

Both complete final runs have finished and been collected: **X0-C 94 pass / 1 fail / 9 TODO; FN-1 10 / 0 / 3; B1 10 / 0 / 10 on each SDK**. All 137 unique case IDs and TODO states reconcile to the approved inventory. Initial evidence and targeted correction results are retained, not overwritten.

## 1. Isolation and exact revisions

Verification branch: **`verify/w0-first`**, in the requested isolated worktree `.agents/worktrees/verify-w0-first`. Created directly from `design/instance-ext` at `15d6f1f214144db3575f9bc0ba15238b1450c2a7`.

| Input | Pinned SHA | Disposition |
| --- | --- | --- |
| Approved design | `15d6f1f214144db3575f9bc0ba15238b1450c2a7` | Exact base |
| X0-C product | `c5099d4429ed0bd64fb461031294c7ffd2b845da` | Local no-ff merge |
| FN-1 product | `572f9e4803078568412b7979ec2525ad74355e7e` | Local no-ff merge |
| B1 product | `3cce06c984272dc61b0784390f0579e1aa963ba8` | Local no-ff merge |
| Approved amended tests | `ab24c84daa32dec7105bd25f5ec4cb78399f1f2d` | Local no-ff merge |
| WD budget design | `9cafd921be8a8e67f828ab225bf5fe636887c5c5` | Referenced authority in inherited documentation only; **not merged**, no WD implementation invented |

Requested input integration snapshot: **`c8aecc7a398f339842523115bd983802689d0279`**. All merges were clean. No `main` merge; source branch refs remain exact. See [merge provenance](<evidence/merge-provenance.txt>) and [product source hashes](<evidence/product-sha256.txt>).

Separate justified local test commits:

- **`720e6808469d19b1973dcab5daaff93a29094672`** — fix callback-warning observer to measure the pre-registration delta, retain exactly-one warning and assert healthy resume.
- **`c38b97e820aef460c7b656f4d7740dc0bd525de0`** — correct required empty `attachments[]` wire oracle; opt six empty-image cases into a fail-on-use attachment peripheral without changing default harness behavior.
- **`79274fc57c2f51614e8d5e8411746195327a0f2c`** — supplementary actual-Cordis activation and deliberately red installed-Session timestamp checks. These are separate from approved case counts.

No product file was edited after the requested product merges. No source branch was changed. No remote-changing operation was needed or attempted; therefore no Fishball remote approval was requested.

## 2. Approved inventory and execution

Authority: [approved decisions](<../../test-design/instance-ext-w0-decisions.md>), [core cases](<../../test-design/instance-ext-w0-core-use-cases.md>), [skeleton cases](<../../test-design/instance-ext-w0-skeleton-use-cases.md>) and [review inventory](<../../test-design/instance-ext-w0-inventory.json>). This is execution of already approved amended cases, not a new test-design sign-off cycle. An independent requirements/test-only reviewer confirmed counts and case IDs.

| Task | Executable bodies | TODO bodies | Total |
| --- | ---: | ---: | ---: |
| X0-C | 95 | 9 | 104 |
| FN-1 | 10 | 3 | 13 |
| B1 | 10 | 10 | 20 |
| **Task total** | **115** | **22** | **137** |

Counts are registered case bodies, not assertion counts, generated sample values, or doubled SDK executions. Original inventory statuses are the pre-implementation red baseline, not current results. No approved ID, requirement or TODO was removed or promoted to pass by a test fix. Both initial and final per-SDK executions reconciled all **137 unique IDs**, zero missing/duplicate IDs, no skip/cancellation. The [initial plan](<plan.md>) and [initial ledger](<plan.json>) preserve the run start; [final machine results](<results.json>) and [per-case table](<results.md>) preserve every final outcome without overwriting that baseline.

### Initial unchanged-test run

| SDK | X0-C pass/fail/TODO | FN-1 | B1 | All pass/fail/TODO | Exit |
| --- | --- | --- | --- | --- | ---: |
| DSH 0.2.1-rc.5 | 83 / 12 / 9 | 10 / 0 / 3 | 10 / 0 / 10 | 103 / 12 / 22 | 1 |
| DSH 0.2.2-rc.1 | 83 / 12 / 9 | 10 / 0 / 3 | 10 / 0 / 10 | 103 / 12 / 22 | 1 |

Evidence: [rc.5 initial TAP](<evidence/tasks-0.2.1-rc.5.tap>), [rc.1 initial TAP](<evidence/tasks-0.2.2-rc.1.tap>), [rc.5 initial ID audit](<evidence/initial-inventory-0.2.1-rc.5.json>), [rc.1 initial ID audit](<evidence/initial-inventory-0.2.2-rc.1.json>). Every failure was inspected; [failure triage](<triage.md>) records the classifications and minimal reproductions.

### Final complete corrected run

| SDK | X0-C pass/fail/TODO | FN-1 | B1 | All pass/fail/TODO | Exit |
| --- | --- | --- | --- | --- | ---: |
| **DSH 0.2.1-rc.5** | **94 / 1 / 9** | **10 / 0 / 3** | **10 / 0 / 10** | **114 / 1 / 22** | **1** |
| **DSH 0.2.2-rc.1** | **94 / 1 / 9** | **10 / 0 / 3** | **10 / 0 / 10** | **114 / 1 / 22** | **1** |

Final TAP: [rc.5](<evidence/tasks-0.2.1-rc.5-final.tap>), [rc.1](<evidence/tasks-0.2.2-rc.1-final.tap>). Both complete runs have 137 cases, no skipped/cancelled cases, and only `XC-EP-V-05` failing for the confirmed X11 timestamp defect. All 11 test-side initial failures are corrected and pass in the complete rerun; no product failure is hidden. The three 9,999/10,000/10,001 retention cases pass on both. Final source hashes match the frozen [runtime/source record](<evidence/final-source-runtime.json>); [results](<results.json>) carry TAP hashes and all per-case statuses. Overall executable pass rate is 114/115 (99.13%) per SDK; TODOs are excluded from that rate and remain unaccepted.

## 3. Confirmed product defect — X11 timestamp

**W0-X11-01, medium severity, both hosts.** Public `manager.userTexts()` omits the `at` epoch timestamp required by X11. It returns the correct user-authored text/source order, but `Number.isFinite(at)` is false.

- Expected: each returned user quote has `at` equal to its source host event's finite epoch-millisecond `time`.
- Actual: `at` is `undefined` (omitted when JSON-serialized).
- Cause identified by independent verification: [timestamp projection](<../../../packages/instance/src/slim/child/extensions.js#L167-L175>) reads `event.at`. Both installed Session APIs expose `event.time`, not `event.at`.
- The approved `XC-EP-V-05` finite-timestamp assertion is retained and fails. This is not an inherited WD/MCP absence or a reason to relax X11.

Minimal reproduction:

1. Use the existing safe child-row fixture and activate its fake manager.
2. Create a detached `Session` from the explicitly selected installed `@deepseek-ai/dsh-session`; append `createUserMessage` through real `Session.append('user/message', ..., {surfaceOp:'append'})`.
3. Supply that real Session at the manager boundary and call the public `manager.userTexts({limit:2,maxChars:100})`.
4. The real host event has numeric `time` and no `at`; returned quote has text only.

Reproduction evidence: [rc.5 host-event JSON](<evidence/usertexts-host-session-repro-0.2.1-rc.5.json>), [rc.1 host-event JSON](<evidence/usertexts-host-session-repro-0.2.2-rc.1.json>), and independent [host Session regression](<../../../test/verification/w0-host-session.test.mjs>). Both [rc.5 Session TAP](<evidence/host-session-0.2.1-rc.5.tap>) and [rc.1 Session TAP](<evidence/host-session-0.2.2-rc.1.tap>) contain **one failing top-level scenario**, with one passing source/order/read-only subtest and two dependent timestamp failures. Node reports 4 nodes: 1 pass / 3 fail because the failed parent is included. This represents **one defect**, not three, and is not added to the approved 137 task cases.

This is an actual installed **in-process Session API** check with fake agent/transport surroundings. It does not prove file persistence, real Agent activation, a model turn, queue durability or wake behavior.

## 4. Test defects corrected, requirements unchanged

| Classification | Affected cases | Correction and proof |
| --- | --- | --- |
| Observer defect | XC-UC-01-E1 | Pre-existing image-service warning was incorrectly counted as a callback warning. Reproduction on both SDKs: boot=1, create=2, resume=2; healthy setup survives. Measure exactly +1 since baseline; resume cannot add another. [rc.5 repro](<evidence/setup-warning-repro-0.2.1-rc.5.json>), [rc.1 repro](<evidence/setup-warning-repro-0.2.2-rc.1.json>); targeted corrected observer passes both. |
| Oracle defect | Four effectively-off tool-send cases | Existing wire contract [§4.1](<../../connector-contract.md#L301-L328>) requires `attachments[]` on `session.message` and `session.redirect`. Expected deep equality now includes `attachments: []`; exact target/text and one-request assertions remain. No product output changed. |
| Fixture precondition defect | Six image-send cases | Default fixture deliberately has no attachment store, so image-service construction cannot reach the tested existing method. Opt-in host-shaped peripheral supplies the required four methods; every method fails and is audited if called. Empty/omitted attachment sends still prove no storage/fetch/upload, exact request and response/refusal, no retry/watch. [Corrected helper](<../../../packages/instance/test/instance-ext/x0-c.test.mjs#L521-L533>), [opt-in harness](<../../../test/support/instance-ext.mjs#L387-L395>). |
| Supplement-only observer defect | Initial rc.5 B1 Cordis warning check | Cordis generations have different INFO/WARN numeric thresholds. Test-owned exporter now observes DEBUG/all severities; exact once-only warning oracle remains. Final actual activation checks pass on both. Initial and intermediate logs are preserved as superseded. |

The ten corrected send cases pass in both [rc.5 targeted TAP](<evidence/send-fixture-0.2.1-rc.5.tap>) and [rc.1 targeted TAP](<evidence/send-fixture-0.2.2-rc.1.tap>). No source/test requirement was silently changed to manufacture green. Separate requirements-only test authors made the warning and send-fixture corrections; an independent requirements/test-only reviewer inspected both final candidates and found no material concern. The author and reviewer roles are distinct, as recorded in the [independent review record](<independent-review.md>). Approved IDs/counts/TODO statuses and the X11 timestamp requirement remain intact.

## 5. Safe regressions and actual framework checks

| Evidence scope | DSH 0.2.1-rc.5 | DSH 0.2.2-rc.1 | What it proves / does not prove |
| --- | --- | --- | --- |
| Existing safe regressions | 44 pass / 0 fail / 1 TODO | 44 / 0 / 1 | Chat model selection, transcript/card projection and bearer admission with fake peripherals/DOM/local HTTP; not browser/model-loop/live DSH. |
| Actual Cordis framework | 6 pass / 0 fail | 6 / 0 | FN-1/B1 ACTIVE with optional instance present/absent, required-tools PENDING gate, B1 warning once absent only, disposal/effects/services clean. Actual Cordis 4.0.5 / 4.1.0, in-memory peripherals. Not DSH profile/bundle-loader or real tools/agents integration. |
| Actual detached Session API | One top-level flow fails | Same | Source filtering/order/read-only child passes; finite/exact timestamp children fail for one X11 defect. Not persistence/wake. |
| Disposable path guards | 4 pass (shared check) | Same helper | Unsafe root, outside and relative targets rejected; guarded disposable descendant accepted. |

Regressions: [rc.5](<evidence/regressions-0.2.1-rc.5.tap>), [rc.1](<evidence/regressions-0.2.2-rc.1.tap>), using [model choice](<../../../test/e1-p2-model-choice.test.mjs>), [records](<../../../test/body-soul-i7-records.test.mjs>) and [admission](<../../../test/body-soul-i3-admission.test.mjs>). The one pre-existing TODO concerns malformed card-record semantics; it is not a task defect.

Actual-Cordis final evidence: [rc.5](<evidence/cordis-0.2.1-rc.5-final.tap>), [rc.1](<evidence/cordis-0.2.2-rc.1-final.tap>), [supplementary test](<../../../test/verification/w0-cordis.test.mjs>). Six unique bodies run on two hosts are **not** twelve unique tests. A minimal replaced environment, Node read-only permissions and network tripwire restrict this check; zero network entry points were attempted. Real framework activation is not merely direct `row.apply()` over a fake context.

Manual static verification also read both package manifests, declared files and bundle patches: each patch inserts only its named skeleton row with empty config; each manifest exports the row and lists shipping files. B1 retains `visibilityDays:30`, count-only `doneWindowHours` integer schema, and explicitly no archive pruning. This is source inspection, not a package install/profile-loader test.

## 6. Deferred obligations and separate scope

TODOs are not passes or waived acceptance:

- **X0-C 9:** real next-model-request tool lifecycle; dynamic context lifecycle (**X0-C/X-E2E**); approved async await/rejection/disposed-completion behavior (**X0-C**); durable queue-accepted/lost-receipt recovery; reservation-write fault; quiet held recovery; whole-watchdog handover; typed W1 port alignment; valid-image preparation/order/no-partial-turn. The image TODO currently names only X0-I/FN-6, but local array-image behavior also belongs to X0-C; per-item wire acknowledgements alone belong to the later inbox/batcher owners.
- **FN-1 3:** bundled enable/disable/recovery placement belongs to X0-B.
- **B1 10:** bundled placement 3 (X0-B); history/visibility/clear 3 (B2–B5); search 1 (B11); export/uninstall 3 (B10). Thirty-day inclusive board visibility does not delete the installed archive.
- Approved **A** means await manager setup before create/resume publication, isolate rejected callbacks, and fence disposed completions. It is not an unresolved design option. Existing fake harness publishes its agent without awaiting setup and cannot certify that lifecycle even if synchronous tests pass.
- Smaller approved-test gaps noted: retained `doneWindowHours` fraction rejection and explicit negative withdrawn-X3 surface assertion are not in the approved executable checks. Supplementary ad hoc public-boundary checks on both SDKs rejected `doneWindowHours:1.5` and confirmed the withdrawn record-projector member is absent: [rc.5](<evidence/additional-boundaries-0.2.1-rc.5.json>), [rc.1](<evidence/additional-boundaries-0.2.2-rc.1.json>). No invented namespace-validation API is used as an acceptance gate. These are not added to approved case counts or promoted to UI/loader evidence.
- **WD-1 absent**, **MCP-S1/S2/S3/K1 and W1 transport work not accepted here**. Their absence is separately unimplemented/deferred, **not a defect** in X0-C/FN-1/B1. No WD gate, callback server, model loop, control migration or implementation was invented for this verification.
- Fake followup counts prove calls at the supplied boundary only. **No exactly-once real wake guarantee** is assumed; MCP-S2's investigation remains independent.

## 7. Safety, cleanup and merge readiness

- No DSH executable/CLI/profile/server launched or restarted. Existing row harness uses only its disposable local HTTP fixture; actual Cordis/Session checks run in process.
- No full test runner or H-STUB boot path. No dependency install, package publish, push, credential transfer, `.npmrc` or credential-file reads/copies/backups.
- All fixture homes/cache writes use guarded `/private/tmp`; test-owned HTTP listeners/effects/fibers and temporary homes are disposed by cleanup hooks. Both initial task jobs, both regression jobs and both complete final task jobs have finished and been collected; supplementary authors also report their owned jobs collected and no terminals remaining. No unrelated process was killed. A sandbox-denied process census was not retried; no OS-wide process-cleanliness claim is made.
- Product diff against the merged requested snapshot is empty; syntax and authored source/document whitespace checks pass; source branch heads are unchanged. The unrestricted staged whitespace check reports whitespace-only blank lines emitted by Node's raw TAP diagnostics. Those captured evidence bytes are intentionally preserved (and hashed), not reformatted to disguise failures; the scoped authored-file check excludes raw TAP only. See [commands and environment](<commands.md>) for exact safe invocations, source/runtime selection, cleanup limits and exploratory-run classifications.

| Task | Merge readiness |
| --- | --- |
| FN-1 | **Ready for W0 skeleton merge**, with its three explicit X0-B continuations untouched. No claim of implemented fold/batching/UI behavior. |
| B1 | **Ready for W0 skeleton merge**, with its ten later placement/history/search/uninstall obligations untouched. No archive/UI/storage acceptance inferred. |
| X0-C | **Not ready as completed:** fix confirmed X11 timestamp defect, rerun unchanged timestamp checks, and explicitly close/verify local async/durable/context/image acceptance obligations before claiming full completion. Later WD/MCP work is not a substitute blocker or product defect here. |

This branch is a local verification artifact with merge commits, justified test-only corrections and report/evidence. No integration into source branches or `main`, no push/install, and no product edit is proposed by this report.
