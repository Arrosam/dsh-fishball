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

Taxonomy is now exactly EP, BVA, Decision Table, State Transition and Use Case. Former positive cases are valid EP partitions or documented decision rules, not a sixth category. W0 true user e2e flows remain assigned to later integration tasks; the K1 H-STUB scenario remains State Transition because the child is a fixture.

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

## Acceptance questions

1. **WD sum:** A — formally define Config acceptance at sum 120 and rejection at 121, including exact fields and model-window handling; B — define these as runtime deadline calculations, not Config refusal. Recommendation: B unless save-time validation is explicitly intended; keep the blocked case until the owner chooses.
2. **X3 seam:** A — retain a public namespace validator with a documented signature; B — enforce the namespace through DSH's record registration later. Recommendation: A only if X0-C must reject foreign namespaces now; do not require a withdrawn projector implementation implicitly.
3. **B1 prune age:** A — name a public exported constant for 30 days; B — test pruning behavior in the storage task without fixing skeleton export names. Recommendation: B unless skeleton constants are intended as public API.
4. **Remaining W0 coverage:** A — complete durable dedupe, stub-refusal, pass-through, array-delivery and real-loader checks before using files as developer done criteria; B — explicitly narrow W0 acceptance to current coverage. Recommendation: A.
