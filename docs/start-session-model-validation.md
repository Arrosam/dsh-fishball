# start_session model selection validation

## Scope and baseline

- Local branch: `feature/start-session-model`; isolated worktree created from development commit `93773b66eb35d95c7dbbdbf1fdbe1d09f6586223`, which already contains `feature/dedicated-model-settings`.
- No main-checkout edits, push, live installation, DSH restart or real DSH-home changes were performed for this feature.
- `model` is an optional full provider/model route. `reasoning_effort` is optional but requires `model` (owner's answer). Both absent keeps the existing path. The optional existing-session tool was deferred.
- Shared catalog/validation reuses the dedicated model settings boundary. Official host APIs: `sessionController.modelCatalog/create/resolveAgent`, `llm.resolveCallConfig`, `agent.runMaintenance`, `Session.append('model/selection', ...)`, `sessions.flush` and exported `installModelSelection`. The GUI selection convenience API also saves the global default, so is intentionally not called. No controller-private members or raw session-log writes.

## Independent tests and review

Tests were authored by a separate requirement-only agent using equivalence partitions, boundary values, decision tables and state transitions. The implementation author did not read test code while coding. A separate read-only reviewer verified official API ownership, the temporary first-request bridge, concurrency guards, persistence/default omission and test isolation.

Final feature matrix: **45 passed, 0 failed**, independently run against **DSH 0.2.1-rc.2** and **0.2.1-rc.3**, using real throwaway hosts and a network-free fake adapter. Coverage includes first/later request routing; explicit/omitted effort cold restart; dynamic model-specific efforts; no-default/no-dedicated-settings changes; invalid choices; silent adapter fallback refusal; append/flush failures; caps/audit/watch behavior; concurrent external wake and GUI selection; GUI override after or during the first assembly.

The complete repository command `/opt/homebrew/bin/node test/run.mjs` ran all then-enumerated files (including the original 40 feature cases and two GUI race cases): **2230 tests, 2222 passed, 5 failed, 3 skipped**, 288 suites, exit 1, about 18 minutes. Two additional model-only persistence cases and the third GUI race were subsequently added and verified as part of the final 45-case runs above.

The five failures were investigated rather than hidden or weakened:

1. Four pre-existing PTC approval cases fail because nested macOS sandbox startup returns `sandbox-exec: sandbox_apply: Operation not permitted`. The exact same four failures reproduced against unchanged baseline `93773b6`, loaded from a worktree-local git archive. No sandbox bypass was used.
2. One package dry-run check failed writing to the existing npm cache. The unchanged seven-case messenger test file was rerun with a worktree-local `HOME`/npm cache and passed **7/7**. No global cache ownership or permissions were changed.

Production module syntax checks (`node --check`) and `git diff --check` passed. The package defines no separate lint/type/build script.

## Boundaries and delivery

Creation publication is host-owned: if a GUI/plugin has already started or selected the new session before this tool acquires idle maintenance, the tool fails closed and returns its id rather than silently running the wrong model. It cannot undo independent external work. The first-request bridge covers prompt assembly/request routing; stock image admission before the first header is still a host-private-cache concern (this tool sends text only).

A later installation must first integrate this local commit with the other UI branch, run the checks in a host environment that permits nested PTC sandbox startup, then use DSH's normal plugin installation/update flow for each intended instance. Installing/reloading or restarting remains a separate explicitly approved operation; it was not done here.
