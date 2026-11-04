# Pile group disclosure — independent black-box test report

Date: 2026-11-04 (Pacific/Auckland). Scope: independent tests only; no implementation edits or commits. The test author loaded general-coding-principle and read [AGENTS.md](<../../AGENTS.md>) before work. Requirements and existing test/public host contracts supplied the oracle; the parent's implementation changes were not read. The parent received behavior conclusions, not test source.

## Scope and boundaries

- [Integration cases](<../pile-disclosure.integration.test.mjs>): registered client component boundary, using the existing hook harness. **26 pass** (13 with normal motion preference and 13 with reduced motion preference).
- [System cases](<../pile-disclosure.system.test.mjs>): **5 pass**, using a real isolated DSH host, fake model, authenticated real operation routes, real SSE snapshots, and the DSH-served browser combo plugin executed through its public registered slot.
- [Existing model UI cases](<../dedicated-model-client.test.mjs>): **5 pass** after extending the shared harness. Dedicated selection gating and ordinary-session isolation remain covered.
- New shared requirement-owned adapter: [pile-disclosure support](<../support/pile-disclosure.mjs>). Existing [client harness](<../support/dedicated-model-client.mjs>) gained optional served script/fetch/motion inputs, full snapshot emission and document event boundaries so it could be reused rather than duplicated.
- [Runner](<../run.mjs>) already discovers every top-level test filename ending in .test.mjs; no runner edit was necessary.
- The system tests above are not a real browser/DOM renderer. They do not prove geometric alignment, focus movement, native Enter/Space activation, actual CSS media-query application, or visual animation timing.

## Acceptance criteria

1. Standing grants start collapsed and the title freely expands/collapses the whole grants group.
2. Pending requests retain the existing initially-expanded default; the title freely expands/collapses the whole pending group, not multiple card details.
3. Each group is independent, counts remain current, and fresh snapshots never undo the user's folded state.
4. Existing single-card detail interaction remains exclusive, Back/Escape work, newly arriving requests do not replace the selected detail, and disappearing selected requests return to the list.
5. Allow once, Reject and Revoke keep their operation routes and outcomes. Existing audit/note/late-answer behavior does not regress.
6. Titles provide accessible button semantics, aria-expanded, and do not submit the composer. Model-selection UI and ordinary sessions remain isolated.
7. Containers align with composer edges in narrow/wide layouts and follow host composer variables. Native keyboard, focus, animation and reduced-motion visual behavior do not regress.

## Test derivation

### Equivalence partitions

| Domain | Partitions exercised | Oracle |
|---|---|---|
| Group content | Pending only; grants only after pending resolves; mixed; no pending rows | Group/title counts and actionable contents match data |
| Session | Fishball; ordinary | Fishball groups do not leak into ordinary composer |
| Group state | Expanded; collapsed | Whole-group visibility changes without opening card details |
| Motion preference | Normal; reduce | Same functional transitions under both inputs |
| Updates | Arrival; removal; changed title/note/use count; external answer | Latest counts/data, user fold choice retained |
| Action | Allow once; Reject; Revoke | Same public POST contracts and real host outcomes |
| Dedicated model | Missing; confirmed | Folding never confirms a missing model or blocks an ordinary session |

### Boundary values

- Entry counts: 0, 1, 2 and representative scroll-size 12. This is a count boundary/representative, not a claim that 12 is a limit.
- Live system trajectory: 2 → 3 → 2 → 1 → 0 pending requests; 1 → 0 grants.
- Use count: 0/1/2 represented through generated grants and updated count 2.
- No unspecified max count, persistence across reload, or empty-group toggle policy was invented.

### Decision table

| Rule | Pending expanded | Grants expanded | Pending rows | Grant revoke actions | Details |
|---|---|---|---|---|---|
| R1 | Yes | No | All | None | None |
| R2 | Yes | Yes | All | All | None |
| R3 | No | Yes | None | All | None |
| R4 | No | No | None | None | None |

All four rules plus restoration to R1 are exercised in both motion preferences.

### State transitions

| Start | Event | Expected next state | Coverage |
|---|---|---|---|
| Initial mixed | First render | Pending expanded; grants collapsed | Integration + system |
| Expanded group | Click its title | Whole group collapsed; other group unchanged | Integration + system |
| Collapsed group | Click its title | Whole group expanded; other group unchanged | Integration + system |
| Collapsed group | Snapshot adds/removes/updates content | Still collapsed, latest count/data | Integration + system |
| List | Open one request | Exactly one detail; other rows/grants hidden | Integration |
| Detail | Back/Escape | List restored with prior group choices | Integration |
| Detail | New request arrives | Same detail; updated pending count | Integration |
| Detail | Selected request disappears | Return to list; remaining rows available | Integration |
| Reopened list | Allow/Reject then latest snapshot | Only chosen real request resolves/leaves | Integration + system |
| Reopened grants | Revoke | Chosen grant ends; duplicate revoke refused | Integration + system |

## Commands and measured results

### Initial existing baseline

~~~sh
/opt/homebrew/bin/node --test --test-concurrency=3 --test-reporter=spec test/dedicated-model-client.test.mjs test/rev11-pile-list.test.mjs test/rev11c-answer.test.mjs test/rev11d-end.test.mjs test/rev11-ui-fixes.test.mjs
~~~

48 tests: **43 pass / 5 fail**, exit 1. All five failures were the same grant-lifecycle file beginning with END-04: creating its second grant got no answer_approval tool result, and END-05..08 then could not deliver later requests into Fishball. This was not relabeled as a pass: it was investigated with fresh isolated runs below.

~~~sh
/opt/homebrew/bin/node --test --test-reporter=spec --test-name-pattern="END-04|END-05" test/rev11d-end.test.mjs
/opt/homebrew/bin/node --test --test-reporter=spec test/rev11d-end.test.mjs
~~~

Fresh host: **2/2 pass**, exit 0. Entire file fresh host: **8/8 pass**, exit 0 (106.7 s). The initial failure/cascade did not reproduce; no product defect conclusion was drawn from it.

### Final focused verification

~~~sh
/opt/homebrew/bin/node --test --test-concurrency=3 --test-reporter=spec test/dedicated-model-client.test.mjs test/pile-disclosure.integration.test.mjs test/pile-disclosure.system.test.mjs test/rev11-pile-list.test.mjs test/rev11c-answer.test.mjs test/rev11-ui-fixes.test.mjs
~~~

**71 tests / 71 pass / 0 fail / 0 cancel / 0 skip**, exit 0, 48.2 s. Breakdown: 26 new integration + 5 new system + 5 existing model UI + 35 existing pile-list/answer/UI-fix regression tests. Thus the new disclosure plus model-focused subset is **36/36**; the genuinely new disclosure cases are **31/31**.

Initial new-test development exposed incomplete synthetic event/card payloads and combo-module/old-SSE-frame handling in the test adapter. Those test-harness issues were corrected; they were not reported as product regressions. Latest system snapshots are used rather than replaying any historical frame that happens to match a removal predicate.

### Environment failure diagnostics requested by parent

~~~sh
/opt/homebrew/bin/node --test --test-reporter=spec test/approvals-ptc.test.mjs test/rev11b-ptc.test.mjs
~~~

**0/4 pass**, exit 1. PTC-01/02 expose the concrete cause: the host run_code returns sandbox-unavailable before executing the inner tool: sandbox-exec: sandbox_apply: Operation not permitted, File sandbox: workspace-write; enforcement: full. PTA-01/PTC-03 consequently see no inner request. This is evidence of unavailable nested sandbox execution here, not evidence that the disclosure feature changed PTC contracts. No escalation, bypass, or sandbox-mode change was attempted.

~~~sh
/opt/homebrew/bin/node --test --test-reporter=spec --test-name-pattern="MCJ-06" test/messenger-client.test.mjs
~~~

**0/1 pass**, exit 1. npm pack --dry-run exits 255 on EPERM opening /Users/samuel/.npm/_cacache/tmp/...; npm also cannot write its log directory and diagnoses root-owned cache files. Root ownership was not independently established; the observed fact is the permission failure. No cache mutation, ownership change or escalation was attempted.

The parent, not this test author, ran the full runner. Its reported final result was **2188 tests / 2180 pass / 5 fail / 3 skip**. The five failures match the four PTC sandbox failures and MCJ-06 cache permission failure above. This report does not claim the full suite was independently rerun by the test author.

~~~sh
git diff --check -- test
~~~

Passed (exit 0). Only test/ was edited. No commits were made by the test author.

## Browser/system matrix still requiring acceptance

The parent reported the current GUI lacks authentication and its browser assistance request timed out. This test author did not open a different browser/backend or bypass authentication. The following are **Not Run**, not passing based on source inspection:

| Case | Technique | Procedure and expected result | Status |
|---|---|---|---|
| PD-B01 narrow/wide alignment | EP/BVA | At narrow and wide actual conversation-column widths, compare pending/grants outer left/right edges to actual composer card edges; repeat all four fold combinations and detail/list transitions. Edges should match and no horizontal overflow appears. | Not Run |
| PD-B02 host-variable responsiveness | BVA/ST | Change real host chat/composer width, including the point where composer max width stops binding. Check values immediately below/at/above that host-defined boundary rather than inventing a plugin breakpoint. Containers track composer edges. | Not Run |
| PD-B03 embedded/narrow column | EP | Repeat alignment in an embedded or constrained host conversation column, if supported; host composer variables remain authoritative. | Not Run |
| PD-B04 native keyboard and focus | ST | Tab to each title, press Enter/Space repeatedly, verify whole group toggles once and composer never submits. Open a detail by keyboard; Back/Escape/outside return with prior focus behavior and no hidden action in tab order. | Not Run |
| PD-B05 actual reduced motion | EP | With real prefers-reduced-motion enabled, fold/unfold, open/close detail, add/remove requests; no visual transitions/animation, same counts/actions. With it disabled, existing transition behavior stays intact. | Not Run |
| PD-B06 long-list layout | BVA | Real 0/1/2/12 cards with grants; scrolling remains capped, sticky title opaque and composer visible in narrow/wide layouts. | Not Run |

Verdict: automatic behavioral integration/system boundary coverage passes. Full browser geometry, native keyboard activation/focus and visual reduced-motion acceptance remain outstanding. Do not describe this as complete visual or real-browser system acceptance.
