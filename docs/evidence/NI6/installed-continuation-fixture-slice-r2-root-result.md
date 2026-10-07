# NI6 continuation fixture slice r2: root result

Root completed the bounded oracle development unit on 2026-10-07 UTC. Four syntax checks and the one 25-case pure test command passed, once each. All 57 execution pins remained unchanged. The final independent code and ISTQB design reviews report no new affected source or test-design blocker. This is a tested fixture-oracle subset; all 87 product criteria remain accepted 0 / HOLD.

The local branch is `feat/S3-integrations`, starting HEAD `b3bd4c7a9192ecbd081649fdb98a09385fe4bfca`; local main remains `3b136e1ab264040b535c1e787b89f659328b30c4`. There is no remote. Root owns Git and execution; the source author and the two reviewers ran no validation command or Git operation.

## Change and independent review

R1 is preserved with its two independent finding reports. R2 fixes three concrete oracle defects: hidden/symbol/accessor fields escaping the closed DTO check, an old donor announcement satisfying current resume ordering, and closed observer counters masquerading as a live zero-effect witness. It adds 13 descriptor and 12 event-window regressions. The direct-instance native fixture body is unchanged.

The final manifest is 19,964 bytes / `c2ea5a0ffe0d046626297a84817eaa3ae87a19d1203c15a37d98e76057affb58`; all 11 owned and 37 input records matched. The exact source delta is +151/-15 across two helpers and one new test file, SHA256 `8ec19635ebea93f324f1d20138b161a67a5f942218ccfa4cdc1195cc8fd048ce`.

- [Independent code review](installed-continuation-fixture-slice-r2-independent-source-review.md), `/root/ni6_r3_independent_source_review`, Sol6.1 max: F01–03 source-supported, no new affected blocker, functional HOLD.
- [Independent test-design review](installed-continuation-fixture-slice-r2-independent-test-design-review.md), `/root/ni5_lifetime_independent_design`, Sol6.1 max: the 25 pure cases cover the selected descriptor/window defects; original observer lifecycle remains IH03/HOLD.

Root fully read the final source, exact literal, public callable declarations, both final review reports and the finite prepared plan. The author's false-GO plan is retained at its original hash `7141cea2d8b91f1d36dbb7931445dc5e25894c10b12ac5446996f0e72580ea28`. Root created a separate once-only GO plan, SHA256 `29fb218a204475a90c23c4a43f3e6cb7faef4a144409def838db2eb9792d6080`, and verified canonical Node plus absent `NODE_OPTIONS`, `NODE_PATH` and `NODE_TEST_CONTEXT` before launch.

## Actual execution

Root invoked the unchanged, reviewed 60-second runner once at 12:32:39 UTC. The canonical runtime is Node 22.22.2 at `/opt/homebrew/Cellar/node@22/22.22.2_1/bin/node`, SHA256 `463b47d6e984e4f84cd2421dabf5081414e40ab9d967e828b2db7858e707f6de`.

| Command | Result | Scope |
| --- | --- | --- |
| `node --check public-oracles.mjs` | PASS | Syntax only |
| `node --check original-observers.mjs` | PASS | Syntax only; observer not evaluated |
| `node --check public-instance-fixtures.mjs` | PASS | Syntax only; native imports not evaluated |
| `node --check fixture-oracles.test.mjs` | PASS | Syntax only |
| `node --test --test-concurrency=1 fixture-oracles.test.mjs` | 25 PASS, 0 FAIL, 0 SKIP, 0 CANCELLED | Pure DTO/window assertions only |

The test command took 0.209484 seconds; raw TAP is 4,343 bytes / `63081277aa5e4429571cef2436989d63df3ec8cc199a49227ae843cb7c6011c8`. All five stderr files are empty. No timeout, retry or downstream omission occurred. [Raw TAP](installed-continuation-fixture-slice-r2-pure-execution/command-05.stdout.txt), [command receipts](installed-continuation-fixture-slice-r2-pure-execution/command-results.json) and [final pin verification](installed-continuation-fixture-slice-r2-pure-execution/root-after-verification.json) are retained with exact source and plan copies.

The executed closure contains only the test and `public-oracles.mjs`, with Node test/assert builtins. Cordis, the original observer, RuntimeStore, MemoryAdapter, WorkerManager and their host/native graph were not evaluated. Node's ordinary test worker is not a native process or cold-start proof. There was no native fixture, owner authority, donor, DB, model, network, tool, browser, profile or listener operation. The full original host graph was not newly verified.

## Retained scope and recovery

Native coverage remains 0 complete / 8 partial / 2 held observation-only; standalone functional host cells remain 0. The future pending-only recipe's 47 direct public calls were not selected or executed. IH01 complete signed-spec provenance, IH02 revoke/report/policy contracts, IH03 actual admitted original instances/donors/live observation and IH05 true A-exit/fresh-B remain unresolved. CG01–04 preserve source/check/task domain and provenance, first-intent index baseline, conservation accounting and full role/denial/cold boundaries. No pure pass supplies those facts or closes protected final CODE.

Three root read-only requests briefly failed before process creation with `exec-server transport disconnected`. No mutation or runtime command was entered through them. The ordinary checkout-status check later succeeded; no session reinitialization, duplicate mutation or alternate execution of these five commands occurred. The independent review seals truthfully record NOT_RUN at their earlier checkpoint; this later root result records the actual execution without rewriting them.

The owned synthetic QA service was independently rechecked at 12:29:39 UTC: CLI PID 17114 still held 127.0.0.1:3080; wrapper PID 17111 and original synthetic workspace cwd matched. The [committed composite handoff](../UI/worker-reconnect-current-handoff-2026-10-07.md) remains the active package/profile identity. Mac UI access remains blocked by the previously reported lock; corrected frontend/native connection and enabled controls are unobserved. Cancelled record 4da34a6d is retained readonly. No opener or service lifecycle action occurred in this unit.

See the [remaining work list](../ni3-ni6-remaining-work-2026-10-07.md) for implementation, automated, browser and blocked-review scope. Real Ollama remains paused after the two automatic approval-review rejections, with zero executed calls and no new attempt. Protected final CODE stays permanently blocked; no publication or full MVP acceptance is claimed.
