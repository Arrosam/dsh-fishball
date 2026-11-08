# Revised W0 test-only audit — pinned MCP design

Date: 2026-11-09. Status: **cases submitted for user review before development**. No product implementation delivered.

## 1. Provenance and isolation

- Required base: `test/instance-ext-w0` at **`aad37b27df0f02160f96570e5124d94e9dfb9f5b`**, 154 prior W0 cases.
- Created requested worktree `.agents/worktrees/test-w0-mcp` and branch **`test/w0-mcp`** directly from that branch. No reset/rewrite of existing history; no push.
- Authoritative requirements: **`design/instance-ext` at `15d6f1f214144db3575f9bc0ba15238b1450c2a7`**. Verified exact HEAD and clean pinned requirement files in the sibling design worktree. Three authoritative documents: [extension points](<../../../design-instance-ext/docs/plugins/instance-extension-points.md>), [MCP option](<../../../design-instance-ext/docs/plugins/connector-mcp-option.md>) and [design](<../../../design-instance-ext/DESIGN.md>).
- Retained skeleton detail comes from incorporated clean requirement snapshots: fold `7347c1f`, watchdog `1bef938`, board `fc9bc8d`. Canonical decisions override their earlier timer/halt/prune wording.
- Two independent requirements-only test authors wrote the case changes. A third independent reviewer read requirements, tests and safe support only. No product implementation was read to derive expectations or edited.
- Shared safe-harness helpers unchanged. No dependency installs, `.npmrc` reads, real credentials/profile reads or credential copies. No real DSH process launched, stopped or restarted. Only existing fake-row/resolver harnesses ran; no full runner or old K1 real-DSH boot path.

## 2. Review entry points and case inventory

Use Cases lead all eight tasks. See [main review guide](<instance-ext-w0.md>), [MCP stories/case table](<instance-ext-w0-mcp-use-cases.md>), [core story](<instance-ext-w0-core-use-cases.md>) and [skeleton stories](<instance-ext-w0-skeleton-use-cases.md>).

Primary technique counts include executable and TODO entries, counted **once per registered top-level case**, not assertions, parameter samples, story definitions or each runtime run.

| Task | EP | BVA | Decision Table | State Transition | Use Case | Total | Executable | TODO |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| MCP-S1 | 4 | 3 | 4 | 2 | 3 | 16 | 0 | 16 |
| MCP-S2 | 5 | 2 | 6 | 6 | 3 | 22 | 0 | 22 |
| MCP-S3 | 4 | 1 | 2 | 2 | 3 | 12 | 0 | 12 |
| K1 | 8 | 4 | 4 | 4 | 4 | 24 | 0 | 24 |
| X0-C | 41 | 22 | 12 | 3 | 26 | 104 | 95 | 9 |
| FN-1 | 4 | 1 | 0 | 0 | 8 | 13 | 10 | 3 |
| WD-1 | 3 | 1 | 1 | 0 | 13 | 18 | 9 | 9 |
| B1 | 3 | 2 | 0 | 0 | 15 | 20 | 10 | 10 |
| **Total** | **72** | **36** | **29** | **17** | **75** | **229** | **124** | **105** |

Exactly **EP, BVA, Decision Table, State Transition and Use Case**; no sixth category. Eight human stories and 75 registered UC flows are different units; 75 is not a claim of 75 independent human goals.

### Why MCP entries are TODO rather than artificial red

All 74 MCP-S1/S2/S3/K1 entries are actionable owner-named acceptance obligations: concrete preconditions/data/outcomes with acceptance trace. The pinned design has not frozen the callable spike/report/profile/schema/result/error interfaces. Testing an invented import, old export or authored behavior mock would be the wrong failure reason. K1 contains **19 W0 shared-profile/fixture obligations + 5 W1 runtime continuations**. S1/S2/S3 have 50 W0 feasibility/freeze obligations. None is counted as a pass or completed spike.

The remaining 31 TODOs belong to local/core/skeleton continuations: real model/loader, durable accepted-queue/hold fault reconciliation, typed port alignment, async/dynamic-context setup, aggregate growth-budget validation and later runtime/UI/archive behavior. Every registered TODO names its owner. [Decision questions](<instance-ext-w0-decisions.md>) preserve unresolved freeze/readiness/budget choices instead of silently fixing behavior.

## 3. Requirement changes and retired oracles

- Retired all 15 old K1 IDs and their custom framing/attach/minor negotiation, legacy-success and real-DSH boot assumptions. Optional attention domain/9999 limit survives as shared acceptance, without requiring an old export to survive W1 removal.
- MCP is the only control plane; first-party push is authenticated event/ack only. Default-on external delegated approvals/questions have **no off setting**. Idle never-polling offers wait. First **committed** outcome wins, not first fetch/ack/attempt.
- Actual old control endpoint/export deletion and built-in binding/peer/snapshot replacement are **MCP-SERVER W1**, coordinated with K2/X0-W/FB-PUSH. W0 defines removal requirements, not a premature runtime deletion.
- U20 failure is effective off: no failure-induced halt, stop or plugin-gone grace. Enabled-but-not-ready passes both tool and image send paths. U21 questions/plan reviews never enter watchdog claims/queue/context.
- X0-C pending notify reservation is not accepted delivery: retries preserve stable identity, including hand-over/recovery row reconstruction. Accepted history is capped at 10,000 without evicting pending work. Removed queue-failure→duplicate and serialized JSONL layout assumptions. Startup recovery may accept pending work; retention tests do not freeze acceptance ordering.
- WD numeric field boundaries are checked through each public field schema; a full config with one field changed and incoherent defaults is not required to pass. Retained growth-budget validation has its own explicit TODO; U14 removed only approval-window budgeting. Mandatory `guardRestops` assertions retired with fault re-stopping, without inventing a requirement that the inert field must be absent.
- U14 approval time settings/window-sum remain retired; U17 ordinary reached-layer history and immediate cleanup, U19 permanent installed archive/inclusive 30-day board visibility remain intact.
- Inherited later-wave test files were neither executed nor certified by this W0-only rewrite.

## 4. Final safe execution

Node **v24.22.2**. Both installed DSH runtime directories were verified present. Runtime packages resolve from the selected installation using the existing resolver-only bridge; no DSH CLI/host process starts.

Six package-local files only:

- [MCP feasibility registration](<../../packages/connector/test/instance-ext/mcp-feasibility.test.mjs>)
- [K1 registration](<../../packages/connector/test/instance-ext/k1.test.mjs>)
- [X0-C cases](<../../packages/instance/test/instance-ext/x0-c.test.mjs>)
- [FN-1 cases](<../../packages/fold-notify/test/instance-ext/fn-1.test.mjs>)
- [WD-1 cases](<../../packages/watchdog/test/instance-ext/wd-1.test.mjs>)
- [B1 cases](<../../packages/board/test/instance-ext/b1.test.mjs>)

Command shape, once per requested version:

```sh
TMPDIR=/private/tmp \
FBTEST_DSH_RUNTIME="/Users/samuel/Library/Application Support/DSH/data/versions/<version>/node_modules" \
node --test --test-concurrency=1 --test-reporter=tap \
  packages/connector/test/instance-ext/mcp-feasibility.test.mjs \
  packages/connector/test/instance-ext/k1.test.mjs \
  packages/instance/test/instance-ext/x0-c.test.mjs \
  packages/fold-notify/test/instance-ext/fn-1.test.mjs \
  packages/watchdog/test/instance-ext/wd-1.test.mjs \
  packages/board/test/instance-ext/b1.test.mjs
```

| Selected DSH SDK | Pass | Expected red | TODO | Skipped | Cancelled | Registered | Node test exit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.2.1-rc.5 | 0 | 124 | 105 | 0 | 0 | 229 | 1 |
| 0.2.2-rc.1 | 0 | 124 | 105 | 0 | 0 | 229 | 1 |

Per-version red classification is identical:

| Task | Pass | Red | TODO | Observed legitimate missing-feature gate |
| --- | ---: | ---: | ---: | --- |
| MCP-S1 | 0 | 0 | 16 | Acceptance not yet executable; not spike evidence |
| MCP-S2 | 0 | 0 | 22 | Acceptance not yet executable; not spike evidence |
| MCP-S3 | 0 | 0 | 12 | Callable/schema freeze not supplied |
| K1 | 0 | 0 | 24 | Shared binding and later runtime owners pending |
| X0-C | 0 | 95 | 9 | Public `fishballInstance` service not provided by child app row |
| FN-1 | 0 | 10 | 3 | Required skeleton files absent |
| WD-1 | 0 | 9 | 9 | Required skeleton files absent |
| B1 | 0 | 10 | 10 | Required skeleton files absent |

No import/module-not-found/ReferenceError/TypeError or test-driver failure is included in the final 124 reds. Each executable stops at an actual requirement-backed missing-feature assertion or diagnostic, not an unconditional synthetic failure. Assertions downstream of these gates are statically reviewed but **not dynamically proven**; this is a red test-design baseline, not acceptance of the implementation.

Evidence lives in guarded disposable [run evidence](</private/tmp/fbtest-w0-mcp.1OKu7p/>). **The final rerun after all four review corrections** is [rc.5 TAP](</private/tmp/fbtest-w0-mcp.1OKu7p/0.2.1-rc.5-committed-candidate.tap>) and [rc.1 TAP](</private/tmp/fbtest-w0-mcp.1OKu7p/0.2.2-rc.1-committed-candidate.tap>), with [rc.5 detailed inventory](</private/tmp/fbtest-w0-mcp.1OKu7p/0.2.1-rc.5-committed-candidate-inventory.json>) and [rc.1 detailed inventory](</private/tmp/fbtest-w0-mcp.1OKu7p/0.2.2-rc.1-committed-candidate-inventory.json>). The [source-hash record](</private/tmp/fbtest-w0-mcp.1OKu7p/committed-candidate-sha256.txt>) was checked against all seven final test/spec files; every hash matched. Both logs contain 229 unique case IDs and the exact totals above. The durable, committed [review inventory](<instance-ext-w0-inventory.json>) preserves all case IDs, task/technique classifications, per-version status totals and requirement-backed failure categories so review does not depend on temporary logs.

### Preliminary runs excluded

An ad hoc stdin Node event-stream counting attempt inherited `--input-type=module` into file workers (`ERR_INPUT_TYPE_NOT_ALLOWED`). It executed no cases, was diagnosed, and was replaced with the ordinary supported `node --test` CLI. This is not a product red. Initial concurrent-authoring runs included a temporary obsolete K1 locator assertion/duplicate ID; those runs are superseded, not included in final counts. No real DSH was launched by either attempt.

## 5. Independent review and checks

Independent reviewer found and authors corrected:

1. A temporary old K1 export locator would fail the approved coordinated removal: removed, replaced with shared owner TODO.
2. WD per-field endpoints against whole-config defaults contradicted the retained growth-budget rule: isolated public field schemas and added the aggregate TODO/A-B question.
3. X2 async/dynamic-context lifecycle coverage was omitted: explicit X0-C-owned acceptance TODOs added, without invented scheduling/signatures.
4. Allowed startup pending-notice acceptance could legitimately evict an old accepted key: retention oracle checks the old boundary before rebuild and avoids forcing it after that new acceptance.

Syntax validation covers all seven test/spec modules; `git diff --check` is clean. Four safe path-guard checks passed (unsafe root, outside-root, relative rejected; safe disposable descendant accepted). Shared safe harness and product files are unchanged, so no full regression suite was run; the full runner can boot DSH and is outside the user's safety instruction.

No browser/model/real-loader/MCP feasibility pass is claimed. Local commit only; no push or publish. User review remains the next gate before development.
