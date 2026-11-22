# @dsh-instance/test-helpers

Shared test tools for this repository's packages and integration packages. Private, never packed or
shipped. A test imports a part by name, `@dsh-instance/test-helpers/<part>`; the runner links the
workspace packages into the root `node_modules` first (nothing is installed).

Tests import only this package and the package they test, never another package's files.

## Parts

| Part | What it gives |
| --- | --- |
| `cases` | `caseName(sdk, id, part, title)`, `caseTest(sdk, id, part, title, fn, options)`, `eachSdk(register)`. A case is named `<id> <part> [SDK <version>] <what it checks>`; a part starting with a digit reads `row <n>`. |
| `constants` | `REPO`, `SDK` (installed versions folder, the two supported versions), `RUN`, `PAGE`, `SCRATCH`. |
| `sdk` | `importBound(version, absoluteFile)` imports a repository module with every `@deepseek-ai/*` import resolved from that installed SDK (both SDKs side by side in one process); `importSdk(version, pkg)`, `cordisOf(version)`, `runtimeOf(version)`, `frontendAssetsOf(version)`. |
| `scratch` | `cleanups(t)` (one LIFO cleanup stack per test), `tempRoot(scope, prefix?)` (a guarded mkdtemp folder), `canonicalTmp()`, `filesUnder(dir)`, `leakHits(values, {places, dirs, allowed})`, `sweepableHome()`, `modeOf(file)`. |
| `react-shim` | `createReactShim(observe)`: hooks, effects, re-render, unmount; `textOf`, `findAll`, `byAttr`, `walk`, `subtree`, `contains`, `buttons` over the rendered tree. |
| `primitives` | `primitivesFor(sdk, React, options?)` (DSH's own `SettingsFormModel` cut from the SDK's web bundle, plus faithful stand-ins of DSH's design primitives), `fakePrimitives(React)` (generic elements), `STAND_IN` handles, `snapshotStore`. |
| `page` | `openPage(t, {sdk, packageDir, id, entry, lang, base, primitives, respond, services})`: a scripted DSH page running the package's client scripts unread; `pageServices`, `configForm`, `json`, `wordsOf`, `settle`. |
| `browser-sandbox`, `client-graph` | The node:vm page and DSH's browser module table the page is built on. |
| `wait` | Waits with no deadline: `gate()` (`{promise, open(value)}`), `hold()` (a step held until `open()`: `reached`, `enter()`, `wait(value)`), `turn()`, `until(cond, step?)`, `drain(turns?)`, `settled()` (quiet: no file request in flight for several turns), `untilQuiet(cond)`, `settle(fn)` → `{value}` \| `{error}`. |
| `json` | `show(value)`, `showClipped(text)`, `textOf(value)` (a deep text, Buffers as hex, for leak sweeps), `parseJson(text)` (undefined when not JSON). |
| `routes` | DSH's route registries without a server: `fetchRegistry()` (`connection.fetch.register`), `callRoute(routes, method, path, {origin, body, host})` → `{status, json, headers, text}`, `nodeResponse()` (a Node ServerResponse stand-in for a `webServer` route). |
| `swap` | `swapWorlds(tag, {root, replace})` → `{open(state), close(id), importIn(id, file, params)}`: load a module graph under a world tag with some modules (files or builtins) answered by fakes; `worldOf(tag, import.meta.url)` in a fake finds its world's state. Runs before the SDK binding hook. |
| `runner` | `runPackage(dir, args)`, `testFiles(dir)`, `linkWorkspaces()`, `cancelOnSignal`. Used by `scripts/test-package.mjs` and `scripts/test-release.mjs`. |

## Running

- One package: `npm test` in its folder, or `node scripts/test-package.mjs <dir> [path under it …] [node --test flags]`.
- Everything, before a release: `npm run test:release` at the root.

Each run gets its own throwaway HOME, TMPDIR and XDG folders and never inherits `DSH_HOME`.
`FBTEST_DSH_VERSIONS` moves the folder holding the installed DSH SDKs. No time limit is set.
