# Local W0 integration handoff — skeleton/increment only

## Scope and provenance

Branch: `integration/w0-verified-20261109`, created at `15d6f1f214144db3575f9bc0ba15238b1450c2a7` (`design/instance-ext`). The request concatenated branch/task labels and SHAs; B1 resolves to `3cce06c`, not `13cce06c`.

- Merged `6c879d75e0d3209f31667802538ea7652ac82848` (`verify/x0c-time`): X0-C `c5099d4`, timestamp fix `00d4cd2`, FN-1 `572f9e4`, B1 `3cce06c`, approved W0 tests, corrected harnesses and historical verification evidence.
- Merged `c7856d797ee026f0d4e3d34b10a1d7570c38c8d1` (`verify/wd-1`): WD-1 `2200928`, budget authority `9cafd92`, native verification/ESM driver correction and evidence.
- Shared WD test/support/design blobs were identical before merging. Distinct design sections merged automatically; no repeated correction or manual resolution.
- Cherry-picked with provenance: `8653c3f` → `85b57a2` (product), `8b40025` → `e80eb37` (original tests), `748f8e7` → `071b1f7` (evidence), `9ceab99` → `19ba16d` (boundary tests/evidence).
- List-bump's product parent blob matches the design baseline. Cherry-picking avoids its unrelated `5eb4c58`/`64bff60`/`81dcccd` ancestry and unrelated E1-P3 test update. No main merge; unfinished alpha0 privacy fix `566fe97` excluded.

No conflicts occurred; no product or test logic was edited. Existing worktrees and the source checkout's untracked pnpm store were left intact. Local commits only; no test execution, install, push, publish, deployment, restart, profile access or credentials/.npmrc reads/copies. Git hooks were disabled for these local commits to prevent implicit execution.

## Checks and limitations

- `node --check` passed on all 47 changed JS/MJS files (syntax only, no imports/test bodies executed).
- Full `git diff --check 15d6f1f HEAD` reports trailing whitespace in historical W0-first TAP diagnostics. Preserve those raw artifacts unchanged. The same check excluding `docs/verification/**/evidence/*.tap` passes.
- Prior reports describe their pinned inputs, NOT a test pass on this combined integration.
- Preserve all owner TODOs: X0-C/FN-1/B1 retain 22 combined; WD-1 retains 24. Other imported future-task tests remain future-task scope, not executable acceptance gates for this increment.
- Native-compatible aggregate settings editor and atomic save bridge remain unimplemented/unaccepted; WD-1/WD-12 continuation allocation and SET/PG-1 coordination still need resolution. Recovery, runtime/model, bundle, browser and full feature acceptance are not claimed.
- List-bump evidence references ignored logs in its original verification worktree; those logs are not copied or newly generated here. Live GUI/remote-stream ordering remains unverified.

## Independent dual-SDK verification (commands NOT run by integrator)

Run from this integration worktree, pin its final commit, and record fresh evidence separately without overwriting imported reports. Use installed SDKs `0.2.1-rc.5` and `0.2.2-rc.1`. Never invoke the repository's global runner, install suites or a main DSH profile. Review existing isolation helpers before execution. Required source-contract linking is local preparation, not installation:

```sh
node --input-type=module -e "import('./test/support/contract-link.mjs').then(m => m.linkContractForSourceRun())"
```

For EACH version, assign the explicit runtime and a new disposable scratch directory; do not reuse historical scratch paths:

```sh
version=0.2.1-rc.5 # repeat separately with 0.2.2-rc.1
runtime="/Users/samuel/Library/Application Support/DSH/data/versions/${version}/node_modules"
scratch="$(mktemp -d /private/tmp/fbtest-w0-integrated.XXXXXX)"
mkdir -p "$scratch/home" "$scratch/tmp" "$scratch/dsh-home" "$scratch/agents-home"
node_path="$(command -v node)"
run_sdk() {
  env -i PATH="$(dirname "$node_path"):/usr/bin:/bin" LANG=C \
    HOME="$scratch/home" TMPDIR="$scratch/tmp" \
    DSH_HOME="$scratch/dsh-home" DSH_AGENTS_HOME="$scratch/agents-home" \
    FBTEST_DSH_RUNTIME="$runtime" "$node_path" "$@"
}

run_sdk --test --test-concurrency=1 --test-reporter=tap \
  packages/instance/test/instance-ext/x0-c.test.mjs \
  packages/fold-notify/test/instance-ext/fn-1.test.mjs \
  packages/board/test/instance-ext/b1.test.mjs
run_sdk --test --test-concurrency=1 --test-reporter=tap \
  test/e1-p2-model-choice.test.mjs test/body-soul-i7-records.test.mjs \
  test/body-soul-i3-admission.test.mjs
run_sdk --test --test-reporter=tap test/verification/w0-host-session.test.mjs

run_sdk --permission --allow-fs-read="$PWD" --allow-fs-read="$runtime" \
  --test --test-isolation=none --test-concurrency=1 --test-reporter=tap \
  test/verification/w0-cordis.test.mjs

run_sdk --import ./test/verification/wd1-safe-preload.mjs \
  --test --test-isolation=none --test-concurrency=1 --test-reporter=tap \
  packages/watchdog/test/instance-ext/wd-1.test.mjs
run_sdk --import ./test/verification/wd1-safe-preload.mjs \
  --test --test-isolation=none --test-concurrency=1 --test-reporter=tap \
  test/verification/wd1-native.test.mjs

run_sdk --test --test-concurrency=2 --test-reporter=tap \
  test/session-list-activity-boundaries.test.mjs test/session-list-activity.test.mjs \
  test/messaging-outbound.test.mjs test/approvals-provenance.test.mjs \
  test/rev11h-stop.test.mjs test/messaging-start-title.test.mjs \
  test/messaging-start-halfmade.test.mjs
```

These commands adapt the prior documented invocations to an empty-base environment and disposable homes; the adaptation itself has not been executed here. The list-bump suites intentionally launch disposable H-STUB workers, never a live profile. Collect every command's exit code and raw output independently, verify all TODO IDs remain unchanged, and clean only tester-owned canonical scratch paths after checking containment/process disposal. Prior scope/isolation references: [X0-C commands](<x0c-time/commands.md>), [WD-1 report](<wd1/report.md>), [list-bump verification](<../test-design/list-bump-verification.md>).
