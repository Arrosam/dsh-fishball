# Spike SP (SP1–SP3): Option A instance on DSH 0.2.1-rc.5 and 0.2.2-rc.1

Date 2026-11-06. Base `3509859` (`design/body-soul`), branch `spike/body-soul-sp`. Questions from
`docs/slim-native-design.md` §0.3, §0.8 (R1–R10), §18.1/§18.2 row **SP**. Investigation only: no
production module changed.

## How it was run

Spike code: `spikes/body-soul-sp/`.

| File | Role |
| --- | --- |
| `launch.mjs` | boots one child `dsh --profile web --patch <overlay> --port 0 --no-open` with a fresh `mkdtemp` home under `os.tmpdir()` (HOME, DSH_HOME, TMPDIR, cwd all inside it), serves a stand-in main page whose iframe loads `/fishball/embed/`, and proxies `/fishball/embed/*` (HTTP and the `api/remote.mux` upgrade) to the child with Host/Origin rewritten to the child authority, `Set-Cookie` stripped and the child cookie kept in memory. `--node` picks the child's Node (SP2). Stop = stdin EOF; SIGTERM only to its own spawned PID while `exitCode === null`. |
| `child-ui/` | the throwaway instance UI row. Host half: hands `connection.authenticatedUrl(origin)` to the launcher over IPC (stand-in for the lifecycle wire), creates one `session-fishball-<uuid>` in its own workspace (`workspaceRegistry.create` + `attachSession`) and answers its id on a **Connection Fetch route** `/api/fishball-sp/session`. Browser half: priority −1 empty occupants of `sidebar`, `shell.leading`, `conversation.hero.workspace`; a header action in `conversation.session.header.actions`; `uiWorkspace.openSession(id)`; `layout.toggleSidebar()`. |
| `fake-llm.mjs` | no-network adapter whose model declares reasoning efforts `low`/`high` (default `high`) and reports each request's `reasoningEffort` to the launcher. |

Overlay applied on both versions (as §0.5): `agent-default-model → sp-fake/sp-model`, `web-runtime
{printUrl:false, openBrowser:false}`, `client-hmr`, `ui-permission`, `ui-agent-preset` disabled,
plus the two rows above. The launch token never left the processes: it travelled over IPC, was spent
by a server-side `fetch(redirect:'manual')`, child output is filtered for `token=` before logging,
and a final scan of every spike log found no token. The browser was an Agent Window (BrowserSkill,
profile `8887dfdb`, extension protocol 1.3), closed at the end. The user's homes, `:54679`,
`:3081` and `:7713` were not touched.

Runs (all children stopped with exit 0; nine throwaway homes `…/T/dsh-sp-*` remain, holding no
secret):

| # | DSH | child Node | extra disabled rows | result |
| --- | --- | --- | --- | --- |
| 1 | 0.2.2-rc.1 | `DSH.app/…/core/node/node` launched as the launcher's own `process.execPath` | — | **child booted the whole DSH-X GUI shell** (Electron without `ELECTRON_RUN_AS_NODE`), Chromium sandbox errors, exit 0, no web child. See SP2. |
| 2 | 0.2.2-rc.1 | wrapper `core/node/node` (24.21.0, Electron 44.7.0) | — | ready 1.33 s, RSS 174–242 MB; SP1 + SP3 checks |
| 3 | 0.2.1-rc.5 | wrapper | — | ready 1.65 s, RSS 200 MB; SP1 + SP3 checks |
| 4, 5 | 0.2.1-rc.5, 0.2.2-rc.1 | Homebrew `node` 22.22.2 | — | both ready (1.40 s, 1.39 s) |
| 6 | 0.2.1-rc.5 | wrapper | all ten `ui-settings*` rows | ready 1.09 s; first turn failed (`{{model}}`, see F4) |
| 7 | 0.2.1-rc.5 | wrapper | — | same `{{model}}` failure, so not caused by the settings rows |
| 8 | 0.2.1-rc.5 | wrapper | all ten `ui-settings*` rows | after F4's fix: ready 1.34 s, reply streamed, RSS 253 MB |
| 9 | 0.2.2-rc.1 | wrapper | all ten `ui-settings*` rows | after F4's fix: ready 1.05 s, reply streamed, RSS 232 MB |

## SP1 — Option A on 0.2.1-rc.5 (and 0.2.2-rc.1), effort panel in the iframe

**Answer: yes on both versions.**

| Check | 0.2.2-rc.1 | 0.2.1-rc.5 |
| --- | --- | --- |
| Shell, `plugins/??…` combos, `api/*`, `api/remote.mux` through `/fishball/embed/*` | works | works |
| Server-side token exchange: `GET /?token` → 303 + cookie kept by the proxy; `document.cookie` in the iframe is empty; frame URL `/fishball/embed/` (no token) | works | works |
| Child route answering the session id | Fetch route works | **Fetch route works** (the earlier spike's `webServer.register({resource})` answered 400 on rc.5) |
| Session-only frame: the three shadows registered, `openSession` succeeded, sidebar collapsed (`data-sidebar-collapsed`), 56 px rail left | works | works |
| Header action in `conversation.session.header.actions` | renders | renders |
| Composer model picker shows "SP model · High" | yes | yes |
| Effort pane: Model ▸ / Effort ▸ menu lists `Low`, `High`; choosing `Low` updates the trigger (`aria-label … reasoning effort Low`) | yes | yes |
| The selected effort reaches the model: the fake adapter received `reasoningEffort: 'low'`; reply "SP reply (effort=low)" | yes | yes |

Evidence (rc.5 line / 0.2.2 line):

- Fetch route API identical: `get fetch()` `dsh-client-connection/lib/index.js:732`, `registerFetchRoute` `:840`, shared `/api` dispatch `createSharedFetchHandler` `:820-838` (both). The shared `/api` channel is mounted as a named **handler** route (`createSharedFetchHandler(API_PATH)` + `handler: async (req, res)` `dsh-client-connection/lib/index.js:1044,1048`, both), so it is unaffected by rc.5's handler-only dispatch `dsh-host-webserver/lib/index.js:384` (rc.5) vs `:469-471` (0.2.2, handler or resource). DSH itself registers child routes this way: `dsh-client-ui-deliverables/lib/index.js:49,55,84` (both).
- `authenticatedUrl` `dsh-client-connection/lib/index.js:440` (both); `webServer.getOrigin()` `dsh-host-webserver/lib/index.js:314` / `:363`; `web-runtime` prints the URL only when `printUrl` `dsh-web-app/lib/index.js:156,162` (both).
- Effort source: catalog carries `reasoning` `dsh-api-session-controller/lib/index.js:569-576` (rc.5); effort pane in `dsh-client-ui-model-selection/lib/client.js:1560` / `:1556`; selection effort `:872-873` (both); call-time validation `dsh-llm/lib/index.js:2187-2202` (rc.5). Spike adapter: `spikes/body-soul-sp/fake-llm.mjs:23,31-32`.
- Spike sources: `spikes/body-soul-sp/child-ui/index.js:36,41,51`, `child-ui/client.js:20,23,30,33`, `launch.mjs:103,113,116,156,165`.

### Findings for the design

- **F1. Use Connection Fetch routes for every child HTTP route.** `ctx.connection.fetch.register({path:'/api/<ns>/…', methods, requestBody, fetch})` works on both versions, sits behind DSH's own cookie and Host/Origin fence (owner peer only, `:829`), and avoids R3 entirely. Constraint: the path must lie under `/api/` with safe segments (`assertFetchRoute` `:973-977`, `endpointFromPath` `:926-931`). §0.5/§0.7 should say "Fetch routes" rather than "handler-form `webServer.register` routes".
- **F2. Shadowing `conversation.hero.workspace` does not remove the hero workspace chip.** The chip ("Fishball ▾") is rendered by the conversation itself (`WorkspaceChip` `dsh-client-ui-conversation/lib/client.js:17853` / `:20525`); the slot only supplies the picker popup (`:17862` / `:20534`). With the shadow, clicking the chip opens nothing (`aria-expanded=true`, no menu): harmless but visible. It shows only on the empty-session hero. Accept it (like D19), or hide the chip via a scoped CSS rule from `child/ui` (a class-name seam: R1).
- **F3. The `/permission` command still works with `ui-permission` disabled.** The `/` menu lists *Permission*, and `commands/execute` `/permission danger-full-access` from inside the iframe answered `preset danger-full-access` on both versions (restored with `read-only`). The command comes from the core row `permission` (`dsh-base/cordis.patch.yml:264`, `dsh-permission-presets/lib/index.js:209` / `:215`), not from `ui-permission`. This breaks D8 ("Fishball's session is hard-wired to read-only + ask"). Fix in the overlay: either restrict that row's `presets` to `read-only` only (the Config is a dict, `:139` / `:140`; the command refuses unknown names, `:220` / `:226`), or have the instance's preset register a shadowing `permission` command for its agent (definitions registered through an agent's command-injected child shadow globals for that agent, `dsh-commands/lib/index.js:207-208`, both). Disabling the row is not an option: `dsh-subagent/lib/index.js:409` / `:410` reads it, and it pins the initial preset of every session.
- **F4. A session created without `agentOptions` fails its first turn on both versions.** `agents.create({sessionId, meta})` leaves `agent.options.model` undefined until the composer's first `selectModel`; DSH's persona prefix `You are … {{model}} model.` (`dsh-web-app/cordis.patch.yml:19`, both) then throws `prompt variable "{{model}}" has no value` (`dsh-system-prompt/lib/index.js:177` / `:179`; variable from `dsh-agent-loop/lib/index.js:1592` / `:1346`; 0.2.2 also reads `context.modelSelection`, which an unselected session lacks too). DSH's own controller passes the default selection (`agentOptions()` `dsh-api-session-controller/lib/index.js:527` / `:440`; on 0.2.2 as live getters incl. `reasoningEffort`). Today's `src/slim/child/chat.js:417-420` already does this; I5 must keep it (and on 0.2.2 prefer the getter form, so a later default change applies). Fix verified in runs 8 and 9.

## SP2 — which Node launches the child under DSH.app

**Answer: neither "PATH `node`" nor `process.execPath` is a safe default.** Use the DSH-X wrapper
`<DSH.app>/Contents/Resources/core/node/node` (Electron 44.7.0 ⇒ Node **24.21.0**, run as Node via
`ELECTRON_RUN_AS_NODE=1`), which DSH-X itself uses to run every DSH; keep a configured
`nodeExecutable` as the override.

What each candidate is (this machine, DSH-X shell 0.1.24, core 0.1.25):

| Candidate | What it is | Version | Child result |
| --- | --- | --- | --- |
| `process.execPath` of a DSH started by DSH-X | `…/DSH.app/Contents/MacOS/DSH`, the Electron binary | Electron 44.7.0 / Node 24.21.0 | spawned **without** `ELECTRON_RUN_AS_NODE` it boots a second DSH-X GUI (run 1); unusable as-is |
| `…/Resources/core/node/node` | a POSIX shell script, not a binary: `exec $DSH_ELECTRON_BIN` or `../../../MacOS/DSH` with `ELECTRON_RUN_AS_NODE=1` | Node 24.21.0, `process.versions.electron = 44.7.0` | works on both DSH versions (runs 2, 3, 6–9), also with an empty env (`env -i`) |
| Homebrew `/opt/homebrew/bin/node` | user's plain Node | 22.22.2 | boots both versions (runs 4, 5), but 0.2.2-rc.1 declares `engines.node >=24.9.0` (`dsh/package.json:179`), so it is outside 0.2.2's supported range; rc.5 declares none |
| `DSH_RUNTIME_NODE` / settings "system node" | optional override read by DSH-X | — | not set here (`settings.json` `nodeRuntime: "bundled"`) |

What DSH-X provides (read-only):

- `core/platform.js:41-61`: `RUNTIME_NODE` = `DSH_RUNTIME_NODE`, else a bundled `core/node/node`, else `process.execPath`; `RUNTIME_NODE_ENV` adds `ELECTRON_RUN_AS_NODE=1` only when it is the Electron binary.
- `app/shell/env.mjs:18-26`: DSH-X prepends `core/node` to its own PATH, so a DSH it starts sees `core/node/node` as the first `node` on PATH. `env.mjs:41-85` (the opt-in "system node" lookup) searches only the user's original PATH plus `/opt/homebrew/bin`, `/usr/local/bin`.
- `app/shell/main.mjs:441`: sets `DSH_ELECTRON_BIN = process.execPath`, which the wrapper uses first.
- `core/server.js:2035-2038,2070`: each `dsh` child gets `RUNTIME_NODE_ENV`, `DSH_NODE=<RUNTIME_NODE>` and `PATH = withVersionBin(withBundledRuntime(...))`; `orderRuntimePaths` (`:2095-2103`) puts a user directory with `node` **before** the bundled dir. The generated shim `data/.bin/dsh` runs `core/node/node <bin.js>` (`server.js:2235-2239`).
- In this DSH session: PATH is `/opt/homebrew/bin` first, then `…/core/node`; `ELECTRON_RUN_AS_NODE` is set; `DSH_ELECTRON_BIN` and `DSH_NODE` are not set in the session environment.

Consequences for today's code:

- `launchDefaults` (`src/native-runtime/node-default.js:45-52`) picks the first `node` on PATH. Under DSH-X that is the user's Node if one exists (here 22.22.2: fine for rc.5, **below 0.2.2's engine floor**), otherwise the wrapper script.
- `verifyNode` (`src/native-runtime/installation.js:73-80`) **refuses the wrapper**: its probe sees `process.versions.electron` (`:79`). On a Mac without a user Node, the instance therefore fails `INVALID_NODE` even though DSH-X ships a working Node 24. Note that `verifyNode` runs `realpath(nodeExecutable)` (`:75`), which keeps the script path (it is not a symlink), and the probe's env is the child's isolated env, so the wrapper's `../../../MacOS/DSH` fallback still resolves (verified with `env -i`).
- Recommended default order (design change, task I2): (1) explicit `nodeExecutable`; (2) the main process's own runtime when it is plain Node ≥ the DSH version's `engines.node`; (3) under DSH-X: `DSH_RUNTIME_NODE`, else `<DSH.app>/Contents/Resources/core/node/node`, located from `process.execPath` (`…/MacOS/DSH` ⇒ `../Resources/core/node/node`), not from PATH; (4) PATH `node`. Then `verifyNode` should accept "Electron run as Node" when the launcher itself sets `ELECTRON_RUN_AS_NODE=1` for the child, and check `engines.node` of the installed `@deepseek-ai/dsh` instead of a fixed `22`.
- R8 is confirmed but narrower than written: "no plain `node`" does not mean "no Node". R5's cost under the wrapper: ready 1.05–1.65 s, RSS 174–253 MB (Electron-as-Node is heavier than the 139–142 MB of §0.3's plain-Node runs).

## SP3 — DSH's own settings inside the iframe; hide or expose for I6

**Answer: with the overlay of §0.5 they are reachable only by keyboard, and should be hidden by
disabling the `ui-settings*` page rows. DSH's own *Plugins* page is the exception: expose it,
inside the instance settings page, for I6's "plugins" row of §0.7.**

Reachability with the §0.5 overlay (both versions, runs 2 and 3):

| Path | Result |
| --- | --- |
| Sidebar Settings / Plugins entries | gone: they live in the shadowed `sidebar` (`sidebar.settings` slot `dsh-client-ui-sidebar/lib/client.js:518,639` / `:564,761`) |
| Header "More actions" menu, "+" menu, `/` menu | no settings entry (`/` lists File, Goal, Plan, Feedback, Compact, Permission, Model, Export) |
| `⌘⌥,` (`settings.open`, web defaults `dsh-client-ui-settings-general/lib/client.js:1210` / `:1493`) | the key is consumed (`defaultPrevented`) but **no panel appears**: the settings shell and its store are registered inside `sidebar.settings` (`:1186` / `:1469`), which never mounts once `sidebar` is shadowed |
| `⌘/` shortcut reference | opens, and lists "Open settings ⌥⌘," (a dead entry) |
| `layout.selectPanel('plugins')` (programmatic only) | DSH's Plugins page renders in the iframe (`main` key `plugins`, `dsh-client-ui-plugin-manager/lib/client.js:4355,4411` / `:7680,7744`) |

Disabling `ui-settings-general, -models, -plugin-inventory, -session-log, -plugins, -shell,
-agent-loop, -subagent, -web-search, -account` (runs 6, 8, 9):

- boots on both versions, no errors or warnings in the child log; the chat, model picker and effort pane work and a turn streams;
- `⌘⌥,` is no longer consumed and the reference no longer lists "Open settings";
- the Plugins page (`ui-plugin-manager`) still renders and lists bundles, because it depends on `configForms` from the **`ui-settings`** row (`dsh-client-ui-settings/lib/client.js:1270`, both), which stays enabled. Conversation, chat, locale and theme also inject `configForms` (e.g. `dsh-client-ui-conversation/lib/client.js:19643` / `:22500`), so `ui-settings` itself must **not** be disabled;
- side effects: disabling `ui-settings-models` also removes the first-run welcome/preview notice (its `settings.onboarding` step, `dsh-client-ui-settings-models/lib/client.js:4503` / `:5483`), which retires R7's pre-acknowledgement; disabling `ui-settings-general` removes the in-iframe UI for the busy-Enter, theme and language preferences (their stored values still apply, which matters for R10/I9).

Recommendation for I6: (a) add the ten `ui-settings-*` page rows (not `ui-settings`) to the
overlay's disabled list, which closes R6 and R7; (b) build the instance settings page as the
instance's own `main` panel, as §0.5 says, and for "plugins, plugin settings" either embed DSH's
Plugins page by calling `layout.selectPanel('plugins')` from a button there (it brings install,
enable and per-row config forms through `configForms` for free), or call the child's
`pluginManager` remote. The first reuses DSH's UI and needs no new route; its back navigation is
`layout.selectPanel(null)` (verified: returns to the chat). Models and API keys stay with provider
sync (§10), so `ui-settings-models` is not needed.

## Design changes needed (summary)

1. §0.5/§0.7/R3: child HTTP routes are Connection Fetch routes under `/api/<ns>/…` (F1); R3 then no longer applies.
2. §0.5 overlay: also disable the ten `ui-settings-*` page rows (keep `ui-settings`); restrict the `permission` row to `read-only` or shadow `/permission` per agent (F3, D8); remove R7's version-specific pre-acknowledgement (now unnecessary).
3. §0.5 session-only frame: shadowing `conversation.hero.workspace` leaves an inert workspace chip on the empty hero (F2); accept it or hide it via CSS.
4. §0.5 Fishball's session (I5): always pass `agentOptions` from `agentDefaultModel` (F4).
5. R8/SP2/I2: new Node default order; teach `verifyNode` to accept the DSH-X wrapper (Electron as Node) and to check the installed DSH's `engines.node` (24.9+ for 0.2.2) instead of a fixed 22; update R5's memory figure for the wrapper (≈175–255 MB).
6. §0.7 plugins row: DSH's own Plugins page (`layout.selectPanel('plugins')`) is the reuse candidate for I6.
