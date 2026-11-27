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
| `./cases` | `caseName`, `caseTest`, `integrationCase`, `withdrawnCase`, `forEachVersion(register)`: one naming scheme, `<id> <row> [SDK <version>] <title>`. |
| `./wait` | `sleep`, `until`, `settle` (harness waits, never oracles). |
| `./repo` | `REPO`, `packageDir(...)`. |
| `./page/*` | A scripted DSH page for client code: `browser-sandbox` (node:vm page), `client-graph` (DSH's client module table), `react-shim` (hooks + host tree queries), `primitives`, `services` (slots, locale, layout), `boot` (boot-page vocabulary), `chrome` (a real headless Chromium for layout rows). |
| `./static/*` | Static package analysis: `packages` (`observe()`: real `npm pack` listings and import specifiers on a throwaway copy), `tokens` (names and strings per file), `icon-set` (the icon rules and SVG reader), `mcp-pins` (the release's MCP SDK pins). |
| `./dsh/*` | `fake-llm` (the scripted model row a live DSH loads), `settings-schema` (a row's served settings), `inspect` (DSH's Plugins-page package inspection). |
| `./connector-world/*` | The real DSH the connector suites boot: `world` (one DSH per scenario and version, with the connector row wired and nothing faked inside it), `worker` (the process that runs it), `interactions` and `steps` (black-box steps over owner HTTP and a stock MCP client), their `*-constants` and `*-extension` modules, `rows`, `ready-probe`, and `fixture-bundle/` (fixture tools installed before the connector). |
| `./legacy-host/*` | An older host worker kept for the UI component's `shell` and `contract/embed` suites: `host` (`newHome`, `bootHost`), `worker`, `fixture-tools`, `contract-link`, and `fixtures/` (fixture bundles and the fake model it loads). |
| `./homes`, `./withdrawn`, `./legacy`, `./config`, `./constants` | Throwaway homes (`TEST_HOMES`), withdrawn rows kept as skipped cases with their reason, names the moved suites still import, run configuration, fixed vocabulary. |

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
  constants.mjs  config.mjs  repo.mjs  sdk.mjs  cases.mjs  wait.mjs  homes.mjs  withdrawn.mjs  legacy.mjs
  runner/           run.mjs  cli.mjs  links.mjs  names-reporter.mjs
  page/             browser-sandbox.mjs  client-graph.mjs  react-shim.mjs  primitives.mjs  services.mjs  boot.mjs  chrome.mjs
  static/           packages.mjs  tokens.mjs  icon-set.mjs  mcp-pins.mjs  acorn.mjs  specifiers-worker.mjs  tokens-worker.mjs  constants.mjs
  dsh/              fake-llm.mjs  fake-llm-constants.mjs  settings-schema.mjs  inspect.mjs
  connector-world/  world.mjs  worker.mjs  constants.mjs  rows.mjs  ready-probe.mjs  session-list-activity.mjs
                    interactions.mjs  interactions-constants.mjs  interactions-extension.mjs
                    steps.mjs  steps-constants.mjs  multi.mjs  multi-constants.mjs  multi-extension.mjs
                    fixture-bundle/  (index.js  package.json  cordis.patch.yml)
  legacy-host/      host.mjs  worker.mjs  constants.mjs  util.mjs  fixture-tools.mjs  contract-link.mjs
                    fixtures/  (fixture bundles fbtest-*, rec-*; fake-llm.mjs  boot-log.mjs  spoof-row.mjs ...)
tests/              helpers.test.mjs  independence.test.mjs
```

- **connector-world/** boots a real installed DSH web runtime in a throwaway home, as an ordinary
  profile with this checkout's connector installed as a bundle and a scripted fake model; no
  hosted child is ever launched. The connector suites (`interactions`, `mcp-http`, `oauth-web`,
  `settings-page`, `wire`), the UI component's `layout` suite and `integration/connector-watchdog`
  use it.
- **legacy-host/** is the older test worker from the root harness: it boots DSH with a plugin under
  test linked as a bundle, a fixture tools bundle and a fake model, driven over IPC. Only the UI
  component's `shell` and `contract/embed` suites still use it.

## Testing

```bash
npm test --workspace dsh-connector-test-helpers
```

`helpers.test.mjs` covers suite discovery (including the nested-package regression), case naming,
the day-to-day versus release version selection, and module binding. `independence.test.mjs`
checks the independence rule on every package: its tests reach other packages only by package name
or through this package, never by a relative path into another package's tests or sources.
