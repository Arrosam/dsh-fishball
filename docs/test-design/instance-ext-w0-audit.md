# W0 test-only audit — 2026-11-09

## Starting state

Branch `test/instance-ext-w0` was clean at `cd2d32a`; previous commits were `c6873ce`, `e002ec3`. No leftovers existed and no stash was needed. `e002ec3` was already an ancestor, so no further rebase or merge was necessary. Existing history was preserved.

## Executed package-local gates

Runtime: `/Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules`.

Evidence directory: `/private/tmp/fbtest-w0-verified.iU0DCH`.

| Task | Cases | Failed | Skipped | Observed cause |
| --- | ---: | ---: | ---: | --- |
| K1 | 13 | 13 | 0 | contract minor/attention operation/limit/unread state absent |
| X0-C | 19 | 19 | 0 | child app does not provide fishballInstance |
| FN-1 | 9 | 9 | 0 | required skeleton package files absent |
| WD-1 | 7 | 6 | 1 | required skeleton package files absent; window-sum requirement unresolved |
| B1 | 9 | 9 | 0 | required skeleton package files absent |

X0-C was rerun after strengthening ordering, running-agent setup and once-only logging assertions: `/private/tmp/fbtest-core-final.zuGqL6/x0-c.log`, exit 1 for missing fishballInstance.

These expected failures do not independently prove that assertions after the missing-feature gate are harness-correct. Independent static review found remaining gaps recorded in the main test-design document; W0 acceptance sign-off is withheld.

## Regression history

The first full run was invalidated by concurrent helper editing: seven files loaded an intermediate `os.tmpdir()` reference after its import was removed. This was a test-harness error, not a missing-feature red and not a product defect. The stable helper uses a guarded `/private/tmp` root. The fresh stable full run passed: exit 0, 1484 tests, 1456 passed, 0 failed, 21 skipped, 7 existing TODO cases, 0 cancelled. Evidence: `/private/tmp/fbtest-w0-verified.iU0DCH/regression.log`. Existing TODO/skipped cases were not converted to passes.

## Safety and scope

Only tests, test helpers and test/design documentation changed. No product implementation was read to derive expectations or modified. All execution homes and npm caches were throwaway `/private/tmp` directories. No credential file was read, printed or copied; no push or publish occurred. Four direct temporary-path checks passed (outside root, root-as-home and relative paths refused; a safe descendant accepted).

## Technique correction rerun — 2026-11-09

Taxonomy is now exactly EP, BVA, Decision Table, State Transition and Use Case. Former positive cases are valid EP partitions or documented decision rules, not a sixth category. This historical revision incorrectly deferred Use Case definitions to later integration tasks; the subsequent Use Case revision supersedes that approach. Use Cases must constrain design before development, including flows driven through stubs and written flows awaiting later-task execution.

All five package-local gates were rerun on 0.2.2-rc.1 with isolated homes and npm cache under `/private/tmp`. Evidence: `/private/tmp/fbtest-w0-techniques.Toq5QP`.

| Task | Failed | Skipped | Exit | Cause |
| --- | ---: | ---: | ---: | --- |
| K1 | 13 | 0 | 1 | missing contract 1.2/attention/unread additions |
| X0-C | 19 | 0 | 1 | missing public fishballInstance service |
| FN-1 | 9 | 0 | 1 | missing package skeleton files |
| WD-1 | 7 | 1 | 1 | missing package skeleton files; existing window-sum block unchanged |
| B1 | 9 | 0 | 1 | missing package skeleton files |

X0-C was additionally rerun after its final ID-only reclassification (`XC-ST-02` → `XC-EP-V-07`): `/private/tmp/fbtest-w0-core-techniques.xA3U9g/x0-c.log`, exit 1 for the same missing service.

No shared harness code changed in this correction, so the regression suite was not rerun; the prior green regression above remains the latest full-suite evidence. No product code changed, and the four pending ambiguity decisions were left untouched.

## Predicted Use Case revision — 2026-11-09

Use Cases are now specified before development, not deferred as definitions: 12 actor-goal definitions, 42 individual flows (29 executable and 13 explicit owner-named TODOs). Each definition gives actors, preconditions, main/alternative/exception flows and observable postconditions, traced to task and X IDs. W0 totals exclude the unchanged blocked window-sum case: 64 executable + 13 TODO = 77; including that block, the five files register 78 tests. Secondary EP/DT/ST coverage is not double-counted.

The five files were run on 0.2.2-rc.1 with isolated `/private/tmp` homes/cache. Initial evidence: `/private/tmp/fbtest-w0-usecases.VngM8W`. All five exited 1. K1 initially exposed a test mistake (attempting a second handshake on an already-handshaken connection); that is not accepted as a missing-feature red and requires the corrected K1 rerun evidence below. Other files: X0-C 20 missing-service failures + 2 TODO; FN-1 10 missing-package failures + 3 TODO; WD-1 9 missing-package failures + 5 TODO + 1 unchanged skip; B1 10 missing-package failures + 3 TODO.

Corrected K1 rerun: `/private/tmp/fbtest-w0-uc-k1.iPztFw/k1.log`, exit 1, 15 failures. The legacy 1.1 child successfully attaches and lists related sessions; its remaining failure is the missing zero-valued `state.unread`, not protocol misuse. Final aggregate: **64 expected missing-feature failures, 13 TODO, 1 unchanged skip, 0 passes** across 78 registered test entries. All five task files are red.

No shared harness changed, so no new regression run was needed. No product code or pending ambiguity decision changed. Written TODOs constrain existing design behavior and do not implement or resolve the pending core-gap discussion.

## Human story revision — 2026-11-09

Five realistic Samuel/Fishball stories now frame the same 12 retained flow groups and 42 UC flows. The rewritten story context/goal/trigger/outcome and story-step tables distinguish executable W0 state/schema/scope evidence from owned TODOs. All existing test IDs, assertions and EP/BVA coverage remain; test changes are titles only.

Fresh five-file run on 0.2.2-rc.1: `/private/tmp/fbtest-w0-stories.WcOLs8`. K1 15 failures; X0-C 20 failures +2 TODO; FN-1 10 failures +3 TODO; WD-1 9 failures +5 TODO +1 blocked skip; B1 10 failures +3 TODO. Each file exit 1. All failures are the expected missing contract/unread/service/package features; no ReferenceError, TypeError or ERR_MODULE_NOT_FOUND harness failure was observed. Total 64 failures, 13 TODO, 1 skip across 78 entries. No product/shared harness changes or push; no full regression rerun required.

The four questions are explained in the separate decision document using immutable e002ec3 canonical line numbers plus its incorporated source-design revisions. They are not resolved or implemented.

## Acceptance questions

1. **WD sum:** A — formally define Config acceptance at sum 120 and rejection at 121, including exact fields and model-window handling; B — define these as runtime deadline calculations, not Config refusal. Recommendation: B unless save-time validation is explicitly intended; keep the blocked case until the owner chooses.
2. **X3 seam:** A — retain a public namespace validator with a documented signature; B — enforce the namespace through DSH's record registration later. Recommendation: A only if X0-C must reject foreign namespaces now; do not require a withdrawn projector implementation implicitly.
3. **B1 prune age:** A — name a public exported constant for 30 days; B — test pruning behavior in the storage task without fixing skeleton export names. Recommendation: B unless skeleton constants are intended as public API.
4. **Remaining W0 coverage:** A — complete durable dedupe, stub-refusal, pass-through, array-delivery and real-loader checks before using files as developer done criteria; B — explicitly narrow W0 acceptance to current coverage. Recommendation: A.
