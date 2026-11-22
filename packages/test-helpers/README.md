# fishball-test-helpers

Shared test tools for the Fishball packages. Private, never published or shipped; no package under
test imports it, and it imports no package under test. Each package's tests reach it by name
(`fishball-test-helpers/<module>`). See [docs/testing/README.md](<../../docs/testing/README.md>) for the
rules it serves.

## Modules

| module | what it gives |
|---|---|
| `./dsh` | the current DSH (`DSH_VERSION`, `DSH_RUNTIME`), the release matrix, `importDsh(name)` |
| `./bind` | `importBound(file)`: a repository module with its `@deepseek-ai/*` imports bound to the current DSH |
| `./cases` | `caseName` / `caseTest`: `<ID> <row> [DSH <v>] <title>` |
| `./wait` | `until`, `settle`, `settleFor`, `sleep` |
| `./packages` | the package catalogue (`packageByName`, `testFiles`, `exportPath`) |
| `./boundaries` | the independence check `scripts/test.mjs` runs first |
| `./runner` | `runFiles(files, version)` in an isolated environment |
| `./runtime` | `RUNTIME` (FBTEST_DSH_RUNTIME, else the current DSH's), `importRuntime(name)`, `runtimeFile(name, file)` |
| `./fake-llm` | the scripted model row (`FAKE`, `FAKE_MODELS`, `FAKE_WINDOW`, `REQUEST_PLACEHOLDER`, `FAKE_LLM_MODULE`, `model`, `chunksFor`, `FakeAdapter`) |
| `./dsh-world` | a booted standalone DSH in a child process: `bootWorld(home, {packages, env, extension, overlay})`, `scenario(label, steps, options)`, `newHome(label)`, `removeHome`; base ops in `dsh-world-child.mjs` |
| `./fake-connector` | fake connector peers over loopback: `FakeConnector` (base), `startFakeConnector`, `startFakeDsh`, `startConnectFake` + `approvalBrowser`, `startFakeTarget`, `FakePairs`, `RetirablePairs`, `newToken`, `clientOf`; `RPC`, `WEB`, `OAUTH`, `MAILBOX`, `FAKE_DSH`, `REDIRECT`, `HARNESS` |
| `./dsh-host` | an in-process cordis host with DSH's `dsh-credentials-local` and `dsh-authorization` (+ caller-chosen plugins): `openHost(root, {plugins})`, `tempRoot`, `cleanups`, `canonicalTmp`, `logText` |
| `./connector-contract/mcp-schema`, `./connector-contract/tools` | the dsh-connector's published K1 / K2 modules, vendored ([README](<connector-contract/README.md>)) |
| `./temp-path` | `tempPath(target, {root, allowRoot, boundary})`: canonical containment below a temp root |
| `./fake-dom` | a DOM for node:vm pages: `createDom()` (elements, simple selectors, capture/bubble events, attribute MutationObservers, `hostRef` for the React shim), `createEvent`, `matchesSelector` |
| `./browser-sandbox` | `createBrowserSandbox({lang, baseURI, hash, fetch, console, EventSource, media, dom})`: a node:vm page for classic client scripts (`registrations`, `run`, `runFile`, `dispatchWindow`, `setMedia`, `styleTexts`, `clearTimers`) |
| `./react-shim` | `createReactShim(observe, {renderGuard})` (hooks, effects with cleanup, re-render, unmount), `jsxRuntime`, `reactDomModules`, `primitivesModule`, `fakePrimitives`; queries `textOf`, `walk`, `findAll`, `byAttr`, `subtree`, `contains`, `buttons`, `press`, `edit`; `deferred`, `idempotent`, `effectDisposer`, `snapshotStore` |
| `./client-graph` | DSH's browser module table: `moduleTable({page, platform, graph, loadChunk})`, `applyPlugins(root, graph, table, errors)`, `loadClients(page, clients, {platform, chunkFiles})` |
| `./dsh-primitives` | `primitivesFor(React, {version, modal, extra})`: the primitives module with DSH's own `SettingsFormModel`/`settingsTextField` (`realFormLogic(version)`) and faithful stand-ins; `STAND_IN`, `DESIGN`, `frontendAssets` |
| `./scripted-page` | the scripted DSH page: `createWorld({clients: [{id, file}], …})`, `loadPage(t, world)` → page handle, `cordisRemote`, `loadChunkAlone(file)`, `applyOps`, `settle`; `DSH_PAGE`, `SCRIPTED` |
| `./event-source` | `eventSourceClass()` → `{EventSource, opened, live, at}`: a health-aware EventSource stand-in; `SOURCE_STATE` |
| `./browser` | headless Chromium over CDP, loopback only: `chromeBinary`, `launchChromium`, `startEnvironment({origins})`, `openTab`, `keyFor`, `KEYS`; `measure`, `sharedBrowser`, `stopBrowser`, `PROBE`; DSH's styles `frontendStyles`, `themeSheets`, `dshSheetCount`, `documentOf`, `htmlOf`; `BROWSER`, `DSH_STYLES` |
| `./wcag` | WCAG 2.x arithmetic: `parseColour`, `over`, `backdrop`, `luminance`, `contrast`, `meets`, `shown`; `WCAG` |

## Testing

```bash
node scripts/test.mjs fishball-test-helpers
```
