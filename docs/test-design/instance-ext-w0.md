# Revised W0 test cases — one-way MCP, review before development

Status: **user-approved cases, B / A / A; budget and host-injection follow-up**, 2026-11-09. This delivery changes tests only. It does not implement the feature, execute feasibility spikes, install plugins, or change a running DSH instance.

## 1. Use Cases first

Samuel's human goals lead the test design; API checks are supporting evidence, not substitute stories. Every W0 task has a story with trigger, actors, preconditions, main/alternative/exception flows and observable outcomes.

- [MCP stories and acceptance cases](<instance-ext-w0-mcp-use-cases.md>): MCP-S1, MCP-S2, MCP-S3 and K1.
- [Local core stories](<instance-ext-w0-core-use-cases.md>): X0-C.
- [Plugin skeleton stories](<instance-ext-w0-skeleton-use-cases.md>): FN-1, WD-1 and B1.

A defined flow awaiting another task is an actual `test.todo` entry naming its owner. TODOs are reviewable acceptance obligations, **not passes**. Fake scopes, queues and service loading are not browser, real-model-loop, real-loader or MCP-server evidence.

## 2. Authority and scope

Requirements are pinned to **`design/instance-ext` at `15d6f1f214144db3575f9bc0ba15238b1450c2a7`**:

- [Extension points](<../../../design-instance-ext/docs/plugins/instance-extension-points.md#L506-L524>): revised W0 task table; §0, §3, §5, §6 and §12.5 apply.
- [One-way MCP decisions and revised waves](<../../../design-instance-ext/docs/plugins/connector-mcp-option.md>): capability matrix, delivery/auth/fencing and acceptance.
- [Design](<../../../design-instance-ext/DESIGN.md#L39-L54>): approved direction.

The sibling design worktree was verified at that exact commit and these three files were clean. The budget follow-up additionally pins **`design/wd-budget` at `9cafd921be8a8e67f828ab225bf5fe636887c5c5`**, [§2.8](<../../../design-wd-budget/docs/plugins/instance-extension-points.md#L404-L456>), verified exact and clean. The user's host correction supersedes literal optional-injection syntax: FN-1/B1 require `tools` and resolve `fishballInstance` at runtime, rather than requiring the nonexistent literal service `fishballInstance?`. The older design copies inherited by this test branch are **not** the authority for this rewrite. Incorporated plugin requirements supply retained skeleton settings only where these approved decisions do not supersede them.

Starting point: `test/instance-ext-w0` at **`aad37b27df0f02160f96570e5124d94e9dfb9f5b`**, 154 W0 cases. This rewrite is on **`test/w0-mcp`**, in the requested worktree. It does not merge product implementation or alter requirements to fit current code.

| W0 task | Acceptance boundary |
| --- | --- |
| MCP-S1 | Feasibility criteria for explicitly packaged one-way server/transport, private auth/discovery, manager scope and preserved errors/limits on both hosts. |
| MCP-S2 | Feasibility criteria for durable poll/cursor/ack and first-party push/intake/wake, replay/reconciliation, routing and fallback. |
| MCP-S3 | Freeze after S1/S2: capabilities, schemas/error mapping, ownership fencing, first-commit settlement and coordinated removal inventory. |
| K1 | Shared MCP semantic profile, minimal push event/ack contract and conformance fixtures; no custom-control negotiation implementation. |
| X0-C | Local extension service, manager/chat, durable notify/intake seams, pass-through X19 hook and typed ports aligned with K1 before W1. No server or push adapter implementation. |
| FN-1 | Fold-notify package/config/constants/loading skeleton. |
| WD-1 | Watchdog package/config/constants/loading skeleton, with timer-free and effective-off amendments. |
| B1 | Board package/config/constants/loading skeleton; closed-card visibility is not archive deletion. |

S1/S2 → S3 → K1 is an acceptance dependency, not eight wholly parallel development tasks. Local X0-C and skeleton work may proceed independently; transport-facing ports must align with the freeze before W1.

## 3. Mandatory interpretation

1. A failed, missing or not-ready watchdog is **effectively off**. Fishball handles supervision/permissions; sends pass; no failure-induced halt, stop or grace-stop. Recovery retains dormant briefs and requires explicit resume/rebrief.
2. Independent questions and plan reviews **never** enter watchdog claims, queues or context, including active/paused claimed sessions.
3. Authorized external offer-capable agents receive delegated approvals/questions **by default, with no disable setting**. Missing authorization/capability is a safety refusal, not an opt-out. Idle never-polling offers wait.
4. **First committed outcome wins**, not first fetch, ack, submission or attempted answer. Late outcomes cannot overwrite the committed result.
5. MCP is the only control plane. Push carries events/acks, not controls. No reverse MCP, legacy adapter, dual-control interval or downgrade.
6. Actual old endpoint/export removal, built-in binding/peer upgrades and child snapshot replacement belong to **MCP-SERVER in W1**, coordinated with K2/X0-W/FB-PUSH. W0 freezes the removal requirements and conformance obligations; it does not require a prematurely removed runtime.
7. Attention is optional. Logical authenticated-session loss/detach clears the projection; ordinary HTTP/TCP or optional SSE closure does not. Invalid input preserves the last valid value.
8. Every `manager.notify` key is reserved pending with a stable identity before queue/hold acceptance. Only accepted keys return `duplicate`. Pending failures/rebuild recovery retry that identity; accepted history is capped at 10,000 without evicting pending work.
9. U14 approval timers/window-sum validation remain removed; check/transport/health timers are different. U17 keeps reached-layer ordinary transcript history, not closed-card/label retention. U19 keeps installed board archive history with inclusive 30-day board visibility.
10. Budget tokens are `ceil(canonical JSON UTF-8 bytes / 3)`; total card/non-read input allowance is 768 tokens / 2,304 bytes inclusive. Full-config growth requires `3 * ceil(readMaxBytes / 3) + 768 + maxOutputTokens`, default minimum 9,985. Default rollover is 64,000, equality rotates between turns; a fresh context still too large or a measurement/provider failure hands over effective off without halting.
11. Approved async setup policy A awaits completion before publishing a created/resumed manager; late registration becomes usable after completion, with rejection isolation and disposed-completion fencing. Exact MCP callable freeze B remains with its owning tasks.

## 4. Techniques and counting

Exactly five primary techniques: **EP, BVA, Decision Table, State Transition, Use Case**. One primary technique per registered top-level case/flow; no extra success-case category. Parameter samples, assertions, story definitions and secondary technique coverage are not additional cases.

- EP: valid/invalid partitions; isolate invalid classes where one refusal could mask another.
- BVA: documented ordered bounds, including UTF-8 bytes and equality; no invented schema-name or numeric release boundary.
- Decision Table: explicit conditions/actions and rule IDs in the story ledgers.
- State Transition: allowed/invalid transitions and critical sequences, especially authority loss, settlement and durable intake recovery.
- Use Case: human-goal main/alternative/exception flows, including deferred journeys.

The [machine-readable review inventory](<instance-ext-w0-inventory.json>) and [run audit §6](<instance-ext-w0-audit.md#L119>) record **255 cases: 135 executable and 120 TODO** after the approved budget follow-up (**+26 cases: +11 executable, +15 net TODO**). Technique totals are **EP 75, BVA 51, Decision Table 32, State Transition 21, Use Case 76**. Both requested SDK runs produced **0 pass, 135 requirement-backed red, 120 TODO, 0 skipped/cancelled**. Executable, TODO and pass/red counts are kept separate.

## 5. Executable and deferred evidence

The new MCP tools, export locations, result/error envelope and typed transport-port signatures are deliberately **freeze work**, not existing callable APIs. The acceptance cases must not fabricate names, mock the promised implementation, assert a constant `false`, or fail on an invented import to manufacture red. They stay owner-named TODOs until an approved callable boundary exists. This limitation is explicit rather than counted as successful MCP feasibility.

Existing X0-C and skeleton public contracts can be executed against the current code. An expected missing `fishballInstance` service or required skeleton file is a valid first missing-feature gate; later assertions behind it are reviewed, not dynamically proved. A downstream assertion hidden by an earlier red is not independent proof that the harness could make that test pass.

The old K1 custom-envelope/minor-negotiation/legacy-attachment tests are retired. Existing later-wave gate files inherited from the old branch are outside this W0 run; they are not certified as aligned to the revised design. Full runtime approval routing, real MCP attachment/removal, UI, model turns and loader integration belong to their named follow-on owners.

## 6. Safe execution only

- Reuse the existing in-process safe harness and resolver-only DSH package bridge. Resolve SDK packages separately from installed **0.2.1-rc.5** and **0.2.2-rc.1**.
- Run only the package-local W0 files. Do not invoke the full runner or old K1 H-STUB path that boots DSH.
- All fixture homes/cache roots stay under guarded `/private/tmp`. Rebuilding fake child rows on the same disposable home is fixture recovery, **not a real DSH restart**.
- No real DSH instance, launcher, profile or server is started/restarted. The existing row harness may use its disposable local HTTP fixture; it is not a DSH process.
- Do not read `.npmrc`, credentials or real profile secrets. No credential transfer, dependency install, network enrollment, push or publish.
- Only tests/test-design evidence changes. No product implementation was read to derive expected behavior or changed.

Example single-file invocation (use the chosen installed version, never an implicit default):

```sh
TMPDIR=/private/tmp \
FBTEST_DSH_RUNTIME="/Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules" \
node --test packages/instance/test/instance-ext/x0-c.test.mjs
```

Exact commands, exit status, task/technique totals, legitimate-red classification and verification limitations are in the [audit](<instance-ext-w0-audit.md>). The user's **B / A / A** approvals and concrete budget/injection amendments are in the [decision note](<instance-ext-w0-decisions.md>). Cases were reviewed **before development**; remaining named TODOs are execution/owner obligations, not reopened product decisions.
