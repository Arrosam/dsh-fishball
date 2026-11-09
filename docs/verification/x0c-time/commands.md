# Reproduction commands and isolation

All operations are local in the requested isolated worktree, branch `verify/x0c-time`. Node is v24.22.2. No dependency install or DSH executable is involved. The existing tests load the explicitly selected installed SDK using the repository's resolver-only bridge. The only source-run dependency preparation is a worktree-local `fishball-connector` symlink to this worktree's connector source; no package-manager invocation.

## Worktree and merge

```sh
git worktree add -b verify/x0c-time .agents/worktrees/verify-x0c-time fd0f46aa3315b0e09bf937307c5410651a80d2a1
git -C .agents/worktrees/verify-x0c-time merge --no-ff 00d4cd2319ed01a2ef6ad6a67522aee389f5cd9b \
  -m "merge: verify X0-C host timestamp fix on W0 baseline"
```

Before creation, the baseline/fix branch tips and absent destination/branch were verified. Merge `6d26ab71828241f0e7c7d329a718dec54f69cfcc` has exactly those two parents. No source branch or existing history is modified.

## Approved 137 IDs

One background job per version, collected after completion. Shell `noclobber` retains every new evidence file. Equivalent invocation for each `version` in `0.2.1-rc.5 0.2.2-rc.1`:

```sh
set -uo pipefail
set -C
out="docs/verification/x0c-time/evidence/tasks-${version}"
printf '%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "${out}.started"
TMPDIR=/private/tmp \
FBTEST_DSH_RUNTIME="/Users/samuel/Library/Application Support/DSH/data/versions/${version}/node_modules" \
node --test --test-concurrency=1 --test-reporter=tap \
  packages/instance/test/instance-ext/x0-c.test.mjs \
  packages/fold-notify/test/instance-ext/fn-1.test.mjs \
  packages/board/test/instance-ext/b1.test.mjs > "${out}.tap" 2>&1
result=$?
printf '%s\n' "$result" > "${out}.exit"
printf '%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "${out}.finished"
exit "$result"
```

This retains the prior corrected tests unchanged. Full-suite elapsed time includes the three real-file 9,999/10,000/10,001 retention bodies. No performance threshold is invented. Jobs: `bash-e8adef77b76f40c2` (rc.5), `bash-acaee32e73a04c67` (rc.1), both completed and collected exit 0: each **115 pass / 0 fail / 22 TODO**, X0-C **95 / 0 / 9**, FN-1 **10 / 0 / 3**, B1 **10 / 0 / 10**. Both reconcile all 137 exact unique IDs/titles/TODO states, no skips/cancellations. Only baseline status change is `XC-EP-V-05` Fail → Pass. Durations are 372.889 s / 372.983 s.

## Existing 44 safe regressions + existing TODO

For each selected version, same `TMPDIR` and `FBTEST_DSH_RUNTIME`, `--test-concurrency=1` and TAP reporter:

```sh
node --test --test-concurrency=1 --test-reporter=tap \
  test/e1-p2-model-choice.test.mjs \
  test/body-soul-i7-records.test.mjs \
  test/body-soul-i3-admission.test.mjs
```

New outputs: `evidence/regressions-<version>.tap/.exit`. Parent job `bash-8c602d5401304e2b` runs both sequentially, completed and collected, exit 0. Per-host results are 44 pass / 0 fail / 1 existing TODO. These are fake-peripheral/fake-DOM/local-HTTP checks, not browser or model-loop evidence.

## Actual installed detached Session regression

Separate executor runs the unchanged supplementary test, once per explicitly selected SDK:

```sh
TMPDIR=/private/tmp \
FBTEST_DSH_RUNTIME="/Users/samuel/Library/Application Support/DSH/data/versions/${version}/node_modules" \
node --test --test-reporter=tap test/verification/w0-host-session.test.mjs
```

New outputs: `evidence/host-session-<version>.tap/.exit`. This uses real `Session.create`, host `createUserMessage` and `Session.append` with no synthetic `event.at`. It replaces only the harness's Session boundary; surrounding agent/context/transport remain fake. It asserts finite/exact timestamps, source/order/filter-before-limit and read-only behavior. `maxChars=100` is above fixture lengths; this supplement does not prove clipping, persistence, actual model turn, durable queue or real wake.

## Actual installed Cordis activation

Separate executor follows the prior minimal-environment/read-only-permission invocation for each version:

```sh
node_path="$(command -v node)"
runtime="/Users/samuel/Library/Application Support/DSH/data/versions/${version}/node_modules"
env -i PATH="$(dirname "${node_path:?}")" \
  HOME=/private/tmp/fbtest-w0-cordis-no-home TMPDIR=/private/tmp LANG=C \
  FBTEST_DSH_RUNTIME="${runtime:?}" "${node_path:?}" \
  --permission --allow-fs-read="$PWD" --allow-fs-read="${runtime:?}" \
  --test --test-isolation=none --test-concurrency=1 --test-reporter=tap \
  test/verification/w0-cordis.test.mjs
```

New outputs: `evidence/cordis-<version>.tap/.exit`. No write/worker/child-process/addon allowances; test installs a network tripwire. Real Cordis plugin/fiber ACTIVE/PENDING/DISPOSED behavior with in-memory optional instance and tools is distinct from the DSH profile/bundle loader, real agents, persistence or wake.

## Integrity, inventory and cleanup

The baseline ledger and approved inventory are reconciled against final TAP by exact ID, unique registration, preserved TODO states, Node summaries, exit codes and raw-evidence SHA-256. Frozen test/support SHA-256 values are checked against the prior report before execution and again at completion. Installed runtime manifests are read only to confirm SDK/Cordis/Session/Schema versions and hashes. No `.npmrc` or credential file is read or copied. Source refs and the single-line product diff are checked before and after execution. Existing fixture hooks dispose their listeners/effects and remove only their guarded disposable homes.

Only requested file-local test entrypoints are executed; no full runner or H-STUB path. No live DSH/CLI/profile/server, install, restart, remote mutation or push. No system-wide process scan is necessary and no unrelated process is stopped. Raw TAP is preserved byte-for-byte. The full `git diff --cached --check`, **including all captured TAP**, passes on this all-green run; no exception is needed. The prior run's diagnostic-whitespace exception is historical only.
