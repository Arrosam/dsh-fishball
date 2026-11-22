# dsh-connector-test-helpers

Shared test tools for this repository. **Test-only and private**: never packed, never a
dependency of a product package. Every package's tests and every integration package import
their shared tooling from here, and from nowhere else — a package's tests never import another
package's tests or sources.

## What it provides

| Export | What it is |
| --- | --- |
| `./runner` (`src/runner/run.mjs`) | `runPackage(dir, args)`: runs one package's suites (`tests/**/*.test.mjs`, a nested package's suites excluded) in one `node --test` process with a throwaway HOME/TMPDIR/XDG tree. No time limit. `src/runner/cli.mjs` is every package's `npm test`. |
| `./sdk` | DSH version selection and binding: `versions()` (the current DSH, or the release matrix when `DSH_TEST_MATRIX` is set), `importBound(version, file)` / `boundUrl` (a repository module whose `@deepseek-ai/*` imports resolve to that DSH), `importSdk`, `requireSdk`, `runtimeOf`, `sdkFile`. |
| `./cases` | `caseName`, `caseTest`, `withdrawnCase`, `forEachVersion(register)`: one naming scheme, `<id> <row> [SDK <version>] <title>`. |
| `./wait` | `sleep`, `until`, `settle` (harness waits, never oracles). |
| `./repo` | `REPO`, `packageDir(...)`. |
| `./page/*` | A scripted DSH page for client code: `browser-sandbox` (node:vm page), `client-graph` (DSH's client module table), `react-shim` (hooks + host tree queries), `primitives`, `services` (slots, locale, layout), `boot` (boot-page vocabulary), `chrome` (a real headless Chromium for layout rows). |
| `./static/*` | Static package analysis: `packages` (`observe()`: real `npm pack` listings and import specifiers on a throwaway copy), `tokens` (names and strings per file). |
| `./dsh/*` | `fake-llm` (the scripted model row a live DSH loads), `settings-schema` (a row's served settings), `inspect` (DSH's Plugins-page package inspection). |

## Which DSH a run covers

- Day to day: the **current DSH** only — `DSH_TEST_CURRENT`, else the version the DSH shell's
  default launch preset uses (`~/Library/Application Support/DSH/settings.json`).
- Release: `scripts/test-release.mjs` sets `DSH_TEST_MATRIX` to the release matrix
  (`RELEASE_MATRIX` in `src/constants.mjs`); `forEachVersion` then registers every suite once
  per version. A matrix version that is not installed fails the run.
- `DSH_TEST_VERSIONS_DIR` moves the folder DSH versions are read from.

## Structure

```
src/
  constants.mjs  config.mjs  repo.mjs  sdk.mjs  cases.mjs  wait.mjs  homes.mjs
  runner/   run.mjs  cli.mjs  links.mjs  names-reporter.mjs  suite-runner.mjs
  page/     browser-sandbox.mjs  client-graph.mjs  react-shim.mjs  primitives.mjs  services.mjs  boot.mjs  chrome.mjs
  static/   packages.mjs  tokens.mjs  acorn.mjs  specifiers-worker.mjs  tokens-worker.mjs  constants.mjs
  dsh/      fake-llm.mjs  fake-llm-constants.mjs  settings-schema.mjs  inspect.mjs
tests/      helpers.test.mjs
```

## Testing

```bash
npm test --workspace dsh-connector-test-helpers
```

The cases cover discovery (including the nested-package regression), case naming, the
day-to-day versus release version selection, and module binding.
