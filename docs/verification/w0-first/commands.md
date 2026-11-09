# Reproduction commands and environment

All commands run locally in the isolated verification worktree with Node v24.22.2. No install or full test runner. Version loop selects an existing installed SDK; it never invokes the DSH executable. Named stdout/stderr files contain test results, not runtime credentials.

## Approved task cases (initial)

```sh
for version in 0.2.1-rc.5 0.2.2-rc.1; do
  TMPDIR=/private/tmp \
  FBTEST_DSH_RUNTIME="/Users/samuel/Library/Application Support/DSH/data/versions/$version/node_modules" \
  node --test --test-concurrency=1 --test-reporter=tap \
    packages/instance/test/instance-ext/x0-c.test.mjs \
    packages/fold-notify/test/instance-ext/fn-1.test.mjs \
    packages/board/test/instance-ext/b1.test.mjs \
    > "docs/verification/w0-first/evidence/tasks-$version.tap" 2>&1
  result=$?
  printf '%s\n' "$result" > "docs/verification/w0-first/evidence/tasks-$version.exit"
done
```

Initial jobs: bash-6702cd26beb14aa3, bash-5c82403f9b6c479a. Both collected; exited 1 with identical 103 pass / 12 fail / 22 TODO. Three 9,999/10,000/10,001 real file-retention cases dominate elapsed time (~392s per SDK); no performance requirement or timeout was invented.

Targeted observer correction uses `--test-name-pattern='XC-UC-01-E1'` with the same SDK/TMPDIR settings, one pass and exit 0 on each version. Targeted sends use `--test-name-pattern='X0-C U18/U20 (effectively-off tool send path|images service sends with watchdog effectively off)'`: 10 pass on each host. Final task run repeated the three-file command to new `tasks-<version>-final.tap/.exit` after test-only corrections; it did not overwrite initial evidence. Final jobs bash-9ca52879221b42da and bash-70f9452efee04058 both finished, were collected, and exited 1: 114 pass / 1 fail / 22 TODO, no skip/cancellation, ~366 seconds per SDK. Only XC-EP-V-05 remains failed. All final case IDs/TODO states and frozen test/support hashes reconcile; source of truth is [results](<results.json>).

## Safe existing regressions

Same SDK/TMPDIR settings:

```sh
node --test --test-concurrency=1 --test-reporter=tap \
  test/e1-p2-model-choice.test.mjs \
  test/body-soul-i7-records.test.mjs \
  test/body-soul-i3-admission.test.mjs
```

Evidence `regressions-<version>.tap/.exit`. Both initial regression jobs collected and exited 0: 44 pass / 0 fail / 1 pre-existing malformed-record TODO. These exercise chat model-selection/projection and bearer admission boundaries over fake peripheral services/fake DOM/local HTTP, not a real DSH launch or browser.

## Actual installed Cordis framework

```sh
node_path="$(command -v node)"
for version in 0.2.1-rc.5 0.2.2-rc.1; do
  runtime="/Users/samuel/Library/Application Support/DSH/data/versions/${version}/node_modules"
  env -i PATH="$(dirname "${node_path:?}")" \
    HOME=/private/tmp/fbtest-w0-cordis-no-home TMPDIR=/private/tmp LANG=C \
    FBTEST_DSH_RUNTIME="${runtime:?}" "${node_path:?}" \
    --permission --allow-fs-read="$PWD" --allow-fs-read="${runtime:?}" \
    --test --test-isolation=none --test-concurrency=1 --test-reporter=tap \
    test/verification/w0-cordis.test.mjs \
    > "docs/verification/w0-first/evidence/cordis-${version}-final.tap" 2>&1
  result=$?
  printf '%s\n' "$result" > "docs/verification/w0-first/evidence/cordis-${version}-final.exit"
done
```

Ran with new evidence destinations / shell noclobber. No allow-fs-write, child-process, worker, or addons flags. Only bash redirects create the named logs; test uses a network tripwire and asserts zero attempted entry points. No fixture home was created. Real `Context.plugin()` activation/fiber state/disposal is tested under Cordis 4.0.5 / 4.1.0 with in-memory `tools` and optional `fishballInstance`. Six unique bodies, six passes each version. This is not DSH profile-loader, tools/agents, session persistence or real wake evidence. Initial rc.5 logger-observer mismatch and intermediate logs are retained and explicitly superseded by `-final` logs.

## Actual installed Session API regression

Use explicit SDK/TMPDIR settings and run only:

```sh
node --test --test-reporter=tap test/verification/w0-host-session.test.mjs
```

Expected observed regression is nonfinite/missing `userTexts.at`; it must remain red until the product is fixed. Detached `Session.create` + real `append` validation uses the installed public API in process, with fake agent/transport boundaries. No persistence plugin, real Agent/model/queue/wake or DSH runtime launch is involved.

## Checks and cleanup

`node --check` for changed tests/harness, scoped `git diff --check` for authored files, four guarded disposable-path assertions, inventory ID/status reconciliation, exact source-ref checks and product hash/diff verification. Unrestricted staged `git diff --check` exits 2 only on Node-generated whitespace-only TAP diagnostic lines; raw evidence is retained byte-for-byte so hashes remain valid. Final authored-file command excludes only captured TAP: `git diff --cached --check -- . ':(glob,exclude)docs/verification/w0-first/evidence/*.tap'`. This is an evidence-format exception, not a test-oracle or product-check relaxation. Existing fixture `t.after` disposes row HTTP listeners/effects and guarded temporary homes; Cordis test disposes child fibers/registries/services. Owned jobs are collected rather than killed indiscriminately. A system-wide process-list attempt was denied by the sandbox; no retry or broader access was used. No unrelated process is stopped. Job completion and test cleanup provide owned-process evidence; no claim of an OS-wide clean process census.
