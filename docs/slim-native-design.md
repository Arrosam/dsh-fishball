# Slim native Fishball: embedded UI, narrow bridge, and the retirement of in-process Fishball

Status: **design for approval, 2026-11-05**. No production code is written until Fishball reports the
user approved this design. Development and testing stay separate: this document names test
scenarios; a separate testing session writes and runs them in a disposable environment.

**Revision 2026-11-06 (connector and instance, §0):** the user chose Option A and split Fishball
into two plugins, `fishball-connector` (the body, in the main DSH) and `fishball-instance` (the
soul, its own attached DSH profile). §0 is the current design; where it conflicts with §1–§15 it
wins. D1, D2 and D4 are superseded (marked in §1). The task list is §18; §15 stays as the
record of the delivered waves. The follow-up of the same day adds the user's answers (D22–D25), K1's contract, the SP spike results and the resolved test-design questions (§18.3, §18.5, §18.6). A second follow-up adds D26 (model sync is a fetch-and-choose button, no switch) and D27 (the connector draws the frame around the instance's pages), with a checklist for the two test designs (§18.7). Testing is TDD from this revision: every §18 task carries its
test design, and a separate test-design session writes the cases before any dev session starts.

**Revision 2026-11-07 (D28–D30, base `feat/body-soul` 2a1b0c3).** The user replaced Option A's
child: the child does **not** boot DSH's Web UI (D28). It keeps today's base-only child and its own
chat page, restyled to DSH's look (D29), launched exactly as the main DSH is launched (D28), and
served in two languages that the connector chooses between (D30). §0.5–§0.8 and §18 are rewritten
for it. §2 and §3 (the base-only child, its loopback server and the bearer proxy) describe the
current design again; §0.3 is kept as the record of the Option A spike. Where §0 and §2–§3 still
disagree, §0 wins. The user's answers to §0.9 (same day) are folded in: U1, U2, U4, U5, U6 and U7
are closed; U3 (theme) was closed later the same day with its proposed form ("可以").

## 0. Connector and instance (revision 2026-11-06)

### 0.1 The user's decisions

The user's words (2026-11-06): "Fishball分成两个大组件，一个是DSH内用于操纵session的组件，相当于是身体，
这部分的设置在DSH内更改。然后一个额外的组件，用于启动一个独立的fishball profile来操纵DSH，作为Fishball的
灵魂……灵魂组件承担大多数UI改动，DSH内的那个操纵DSH的Fishball身体组件只负责承接发送给fishball，和DSH内
session显示fishball icon之类的DSH这边的工作。然后身体组件会请求打开fishball灵魂那边的会话UI，设置UI进行
配置两边的组件。但是请求的UI的host都是在灵魂的profile那边的web页面", and later: "两个组件，就叫
'fishball-connector'（身体）和 'fishball-instance'（灵魂）。这两个组件在一个Repo内，但是算作两个插件，
用户可以只开一个connector，然后自己去实现一个instance来通过connector沟通DSH内的Session。我们内置的
instance就做现在这些功能，独立的DSH profile但依附于DSH本体，提供聊天界面，提供设置界面，同步模型信息等。"

| # | Decision | Source |
| --- | --- | --- |
| D14 | Two DSH plugins in one repository: **`fishball-connector`** (body) and **`fishball-instance`** (soul). Each installs and enables on its own. | user |
| D15 | The connector works alone. Its interface to an instance (session tools, approvals, questions, inbox and records, status, hand-over, UI registration) is a **documented, versioned contract** (`fishball-connector` v1, §0.4) that a third-party instance can implement. The connector has no private coupling to our instance. | user |
| D16 | The built-in instance is Option A: an independent DSH profile attached to the main DSH (`dsh-base` + `dsh-web-app`), whose own DSH session view is Fishball's chat, and which also hosts Fishball's settings page and syncs models. Fishball's chat page looks like a normal DSH session, and plugins that act on the DSH UI work there when they are installed into the instance's profile (§0.5). | user |
| D17 | Installing both plugins binds them automatically; no profile edit, no hand-appended row (this also closes B2, §0.6). | user |
| D18 | The connector only *requests* the instance's pages: the chat page and the settings page are web pages hosted by the instance profile and framed in the main DSH. The settings page configures the instance; connector limits stay in DSH's form (D24, §0.7). | user |
| D19 | The about-56 px sidebar rail that DSH keeps beside a collapsed sidebar is accepted for now (§0.5). | user |
| D20 | The chat composer has DSH's own model picker **with its reasoning-effort selector**, and Fishball's settings are reachable from the chat page (§0.5). Both were missing in the custom slim chat. | user |
| D21 | The user's own main DSH keeps the old in-process Fishball for now. Every install and every test of this revision runs in disposable test environments only. | user |
| D22 | There is no plugin called "Fishball" any more: only `fishball-connector` and `fishball-instance`. The connector only manages in-DSH sessions and connects an external instance. Its product icon is fixed: the Fishball fish logo with a wrench badge (no brand-style or sidebar-entry setting). "Fishball" stays the assistant's name. (2026-11-06) | user |
| D23 | Every instance setting lives in the instance's own DSH profile and its own settings page. The instance exposes to the main DSH only what it needs before the child exists (§0.7). Model sync is a button, not a setting (D26). (2026-11-06; the sync consent switch removed by D26) | user |
| D24 | Connector limits change only in DSH's own plugin settings form of `fishball-connector`. No instance can read or change them through the contract; contract v1 has no settings operation. (Option B, 2026-11-06) | user |
| D25 | An instance installed without the connector shows `connector-missing` and never installs the connector. (2026-11-06) | user |
| D26 | Model sync is **a button, not a switch**: "不是加开关，是加个按钮，按下就抓取同步一次，只做增量，抓取本地没有的模型信息，让用户选择加入". One press fetches once and lists only what the instance does not have yet. The user chooses from the list, and only the chosen entries are written. The button is in the "Model for Fishball" block of the `fishball-instance` Plugins card in the main DSH. It is the only place a sync starts: the instance's own settings page has no sync button (user's choice, 2026-11-06). The `providerSync` switch is removed (§0.7, §10). (2026-11-06) | user |
| D27 | The frame around the instance's pages is the connector's: "那个页面外面的框是由connector提供的，框上的按钮可以打开Fishball connector的设置，也显示Fishball的状态". The instance supplies only the content (its chat and its settings page, proxied as before). The connector's Fishball view draws the frame. The frame shows Fishball's state and unread count, and has a button that opens `fishball-connector`'s own DSH settings form. No browser message crosses the frame (§0.5, §18.6 item 13 dropped). (2026-11-06) | user |
| D28 | "I2: 只要复用DSH内的一些样式，让它看起来和DSH风格对得上就行，不需要复用整个DSH内的web UI。Node也是复用主DSH的进程。主DSH怎么启动，fishball就怎么启动。" The child does **not** boot DSH's Web UI: it stays the base-only child with its own chat page, which reuses DSH's styles so it looks like DSH. The child is launched the way the main DSH is launched: the same executable, the same exec arguments and the same runtime environment variables (§0.5 "Child launch"). (2026-11-07) | user |
| D29 | "I8: 不要删，留着，只是改个样式。" The custom chat is kept and restyled to DSH's look; nothing is deleted except code that is truly dead (§0.5 "Chat page", I8, I10). (2026-11-07) | user |
| D30 | "I9: 分不同语言提供两套界面，由Connector选择打开哪一个语言的界面" The instance serves its pages in two languages, and the connector chooses which one to open (§0.5 "Languages"). (2026-11-07) | user |

Superseded: D1 (the child's own custom chat page) and D2 (no DSH Web UI in the child) by D16;
D4 (the main settings page manages the child) by D18. D3, D5–D13 stand, applied to the new owners
below.

**2026-11-07:** D28 supersedes D16's Option A child (`dsh-base` + `dsh-web-app`, DSH's own session
view as Fishball's chat, DSH-UI plugins working in it). What stays of D16 is the independent,
attached DSH profile that hosts Fishball's chat and settings pages and syncs models. D1 and D2 are
in force again, with D29's restyle. D19 (the 56 px rail) no longer applies: there is no DSH sidebar
in the child. D20 stands, met by the custom chat's own model and effort pickers and its header
Settings action.

### 0.2 Packages and what each owns

One repository, two installable packages, one shared contract:

```
packages/connector/          npm name fishball-connector   (body; main DSH)
  package.json               dsh.bundle.patch ./cordis.patch.yml, dsh.client ./client.js,
                             exports ".", "./client", "./contract", "./records", "./package.json"
  cordis.patch.yml           inserts one row: id fishball-connector, name fishball-connector
  index.js                   the row (was the root index.js)
  client.js                  fixed icon, opener view and its frame, managed-row marks, hand-over,
                             the connector's Plugins card (limits form, "Open instance settings")
  client.records.js          the card-record conversation definition and row, exported as
                             ./records (C3, a package-local chunk of the client bundle)
  contract/                  the public contract (K1 put it in src/connector/: contract.js,
                             limits.js, card-record.js, inbox-markers.js, attachment-transfer.js)
  src/                       main-side session work (list below)
packages/instance/           npm name fishball-instance    (soul; built-in instance)
  package.json               dsh.bundle.patch ./cordis.patch.yml; peerDependency fishball-connector
  cordis.patch.yml           inserts one row: id fishball-instance, name fishball-instance
  host.js                    the main-side row (was native-host.js)
  client.js                  the instance's Plugins card in the main DSH: status, Retry, the
                             `enabled` field and the "Model for Fishball" sync button (§0.7, §10);
                             nothing else
  native-child.js, src/      the real layout after M1 is docs/package-layout.md: the main half
                             (src/host/, src/native-runtime/, src/slim/host/, provider sync) and
                             the child half copied into the attached profile (src/slim/child/**,
                             src/slim/ui/** — the custom chat, kept by D29 —, persona, provider-sync
                             engine). There is no child/ui/ client plugin (D28)
docs/connector-contract.md   the contract a third-party instance implements
```

**Row ids (decided 2026-11-06, D22).** The connector row is renamed to `fishball-connector` and
the instance row to `fishball-instance`; no row is called `fishball` or `fishball-native-host`.
Why: (1) no plugin is called Fishball; the row id is the settings namespace DSH's form edits, so it
should carry the plugin's name. (2) D21 keeps the old in-process `dsh-fishball` in real profiles
until release. A test or a user who installs the connector into such a profile would otherwise get
a duplicate `fishball` row, which the loader refuses. (3) The old id patches become inert after the
old package goes: the loader only warns "patch: entry not found" (`dsh-app-boot/lib/index.js:97` /
`:542`).

**One-time settings migration.** At its first apply, each new row copies the user's old values once:

| New row | Old source | What is copied |
| --- | --- | --- |
| `fishball-connector` | (a) the live `fishball` form, when `settings.describe()` still lists it; otherwise (b) the `- id: fishball` config patch in the profile's patch file (`settings.prepareDocument()`, parsed with DSH's own `yaml` dependency); (c) the question mode from the store record `settings/questions` | every field the connector's Config still has (§18.5 conn-OQ-20), plus `questionMode` |
| `fishball-instance` | the same, for the old `fishball-native-host` row | `nodeExecutable`, `executableSearchPath`, `enabled` |

Rules: the copy runs only when the new namespace has no user value yet and the store has no
`migrated` marker. Each field is validated by the new schema, and an invalid field is skipped and
logged by key, never by value. The copy is written with `settings.update(newId, values)` (one
revisioned write), then the marker is stored. The old patch and the old store records are left as
they are and ignored, so a rollback to the old package still finds them. The brand-style and
sidebar-entry records are not migrated (D22: fixed icon). Moving a real install is still a release
step (D21).

**Imports between the packages.** The instance may import only the connector's `./contract` and
`./records` exports. The connector imports nothing from the instance. Package versions are
independent; the connector's major equals its contract major, and the instance declares
`peerDependencies: {"fishball-connector": "^1"}`.

Module ownership after the split (current paths, at `feat/slim-integration` 535a807):

| Owner | Modules |
| --- | --- |
| connector | `index.js`, `client.js` (minus the settings renderers that move to the instance), `src/{approvals,audit,author,card-lifecycle,card-records,config,constants,digest,errors,framing,grants,http,intake,keys,managed,messaging,model-catalog,model-selection,session-model,own-questions,passes,pile,preferences,questions,request-desk,result-wording,session-info,session-titles,state-feed,store,text,tool-results,tool-rules,watches}.js`, `src/slim/host/{bridge,session-port,approvals,images}.js` |
| contract (exported by the connector) | `src/connector/{contract,limits,card-record,inbox-markers,attachment-transfer}.js` (K1, `feat/k1-contract` bb0f756), `src/pile-note.js` (shared wording), `docs/connector-contract.md`; the browser record definition becomes `./records` |
| instance, main half | `native-host.js`, `src/native-web.js`, `src/native-preflight.js`, `src/native-runtime/**`, `src/slim/host/{embed,fetch-routes,provider-sync-routes}.js`, `src/provider-sync-{service,coordinator,host}.js`, `src/provider-sync.js`, `src/recommended.js` |
| instance, child half | `native-child.js`, `src/slim/child/**`, `src/slim/ui/**` (kept and restyled, D29), `src/persona.js` |
| retired | `src/preferences.js` and the brand/sidebar-entry routes (D22, done by C2); the connector's old instance settings page (done by C3); and, as truly dead code (I10): `src/native-control/**` (v1, not mounted), `packages/messenger/` (no caller since legacy removal), `src/native-runtime/node-default.js` (D28). Kept, revised 2026-11-07: the custom chat, its server and auth, its HTTP routes, `decisions.js`, and the admin relay with its routes (§0.7) |

### 0.3 Option A: evidence

*Record only since 2026-11-07: D28 withdrew Option A. The rc.5/0.2.2 citations about DSH's Web UI
no longer bind any task; SP2's Node findings are why §0.5 "Child launch" copies
`ELECTRON_RUN_AS_NODE`.*

Spike of 2026-11-06 (disposable `/tmp` homes, free ports, a throwaway prefix proxy at
`/fishball/embed/*` and a throwaway child client plugin; all processes stopped afterwards).

| Check | 0.2.2-rc.1 | 0.2.1-rc.5 |
| --- | --- | --- |
| Child Web UI through the prefix proxy: shell, `plugins/??…` combos, `api/*` RPC, `api/remote.mux` WebSocket | works | works |
| No token in any browser URL: the proxy exchanges the launch token server-side and keeps the child cookie | works | works |
| Session-only frame: priority −1 empty occupants of `sidebar` and `shell.leading`, `layout.toggleSidebar()`, then `uiWorkspace.openSession(id)` | works; a 56 px rail remains | works (SP1); the first spike's `webServer.register({resource})` route answered 400 on rc.5, a Connection Fetch route works on both |
| Replace the `root` slot instead | refused: a child slot cannot be declared twice | — |
| Permission picker gone by disabling the `ui-permission` row; model picker stays | works | works (SP1) |
| Effort pane in the iframe; the chosen effort reaches the model | works (SP1) | works (SP1) |
| A session shows in its workspace only after `workspaceRegistry.create(realpath)` and `workspace.attachSession(id)` | required | same code |
| Ready time / memory footprint (base-only child, for comparison: 0.56 s / 65–113 MB) | plain Node: 1.36 s / 142 MB; 114 MB with three UI rows disabled. DSH-X wrapper (SP2): 1.05–1.65 s / RSS 174–253 MB | plain Node: 1.61 s / 139 MB |

Code the design relies on (rc.5 line / 0.2.2 line, both read-only):

- Document-relative app: `<base href="./">` in `dsh-host-frontend-static/lib/index.js:85` / `:132`;
  combo references `dsh-client-modules/lib/index.js:217` / `:275`; RPC
  `dsh-client-connection/lib/client.browser.js:1221` (both); stream mux
  `dsh-api-gateway/lib/client.browser.js:106,761` (both).
- Browser auth (both versions, same lines in `dsh-client-connection/lib/index.js`):
  `authenticatedUrl` `:440`, token-to-cookie exchange on `GET /` `:464`, the cookie name bound to the
  Host authority `:335`, loopback Host and same-authority Origin fence `:240`, `requestRejection`
  `:737`, the exact Fetch-route registry `get fetch()` `:732`. The proxy therefore rewrites Host and
  Origin to the child's authority.
- WebSocket pass-through: `webServer.registerUpgrade` (exact path) `dsh-host-webserver/lib/index.js:340` /
  `:389`; `register(route)` `:326` / `:375`; rc.5 dispatches named routes as `route.handler(req,res)`
  (`:384`).
- Session-only frame: sidebar slot `dsh-client-ui-sidebar/lib/client.js:611` / `:733`; layout
  `computeColumns(..., collapsedWidth = 56)` `dsh-client-ui-layout/lib/client.js:38` / `:39`,
  `selectPanel` `:468` / `:522`; conversation `main` key `dsh-client-ui-conversation/lib/client.js:20237` /
  `:23105`; session header actions slot `conversation.session.header.actions` `:20058` / `:22924`;
  workspace picker `conversation.hero.workspace` `dsh-client-ui-workspace/lib/client.js:5329` / `:6138`;
  `openSession` `:1471` / `:1473` and `replaceMain` `:1652` / `:1661`.
- Rows to disable in the child (`dsh-web-app/cordis.patch.yml`): `ui-permission` `:418` / `:420`,
  `ui-agent-preset` `:423` / `:425`, `client-hmr` `:218` / `:214`; the `web-runtime` row `:197` / `:193`
  takes `printUrl`/`openBrowser` (`dsh-web-app/lib/index.js:31-32`, both).
- Model and effort: slot `conversation.input.model` `dsh-client-ui-model-selection/lib/client.js:1903` /
  `:2064`; its effort pane `:1560` / `:1556`; the effort a selection uses `:872-873` (both).
- Records and presets: `appendPluginRecord` `dsh-session/lib/types/index.d.ts:117` / `:121`;
  `uiConversation.events.register` as DSH's goal plugin uses it `dsh-client-ui-goal/lib/client.js:571` /
  `:661`; `AgentPresetRegistry.register` `dsh-agent-preset-registry/lib/types/index.d.ts:44` / `:52`;
  `attachSession` `dsh-workspace/lib/index.js:111` (both).
- Spike SP (`spike/body-soul-sp` 6f393d2, `docs/spikes/body-soul-sp.md`): child HTTP routes as
  Connection Fetch routes (`get fetch()` `dsh-client-connection/lib/index.js:732`,
  `registerFetchRoute` `:840`, the shared `/api` handler route `:1044,1048`, both); the DSH-X Node
  wrapper and its environment (DSH-X `core/platform.js:41-61`, `app/shell/env.mjs:18-26`,
  `core/server.js:2035-2038`); the `/permission` command from the core `permission` row
  (`dsh-base/cordis.patch.yml:264`, `dsh-permission-presets/lib/index.js:209` / `:215`); the
  settings pages registered inside `sidebar.settings`
  (`dsh-client-ui-settings-general/lib/client.js:1186` / `:1469`); DSH's Plugins page as the `main`
  key `plugins` (`dsh-client-ui-plugin-manager/lib/client.js:4355` / `:7680`).

**Option B is rejected** (show the instance's session in the main DSH's own chat view). The main page
connects to one backend only (the stream URL is document-relative, `client.browser.js:761`); a
session id the main DSH does not know throws in `replaceMain` (`sessions.retain: unknown session`,
seen in the spike); `dsh-api-remotes` selects its capabilities at build time; the only shipped way to
show another host's session, LiveShare, needs a separately deployed relay with OAuth; and reading
the instance's log from the main process would break one-writer-per-session.

### 0.4 The connector contract (`fishball-connector` v1)

The contract is what a third-party instance implements. It is written down in
`docs/connector-contract.md` and its machine form is the connector's `./contract` export.

**Binding (in process).** The connector row provides the service `fishballConnector` at apply,
independent of any instance. An instance is any plugin in the same main profile that injects it and
calls:

```
fishballConnector.attachInstance({
  id, name,                         // stable instance id; display name
  contract: { id: 'fishball-connector', major: 1, minor },
  transport: { send(string), onMessage(fn), onClose(fn), close() },
  ui?: { chat?: path, settings?: path },   // same-origin absolute paths, e.g. '/fishball/embed/'
  status?: () => ({ state, code }),        // shown by the connector's opener
  retry?: () => Promise<void>,             // the opener's Retry
}) → { detach() }
```

Rules (frozen by K1, `docs/connector-contract.md` §1, with the §18.6 corrections): one instance
at a time (a second attach while one is attached is refused `instance-busy`); a different contract
id or `major` is refused `contract-version`; `ui` paths must start with exactly one `/`, carry no
scheme, no `token` parameter in the query or the fragment, and be at most 512 characters, or the
attach is refused `ui-invalid`; a fragment is otherwise accepted; a transport missing any of its
four functions is refused `transport-invalid`; a malformed `id`, `name`, `status` or `retry`, or an
unknown descriptor key, is refused `instance-invalid`. `detach()` and `transport.onClose` both
return the connector to no-instance mode. The service has two members, `attachInstance` and the
read-only `current()` (§18.5 conn-OQ-08).

**Frames.** Over `transport` the instance and the connector exchange envelope-v2 frames exactly as
§5 defines them (the instance is the "child" side). The handshake is unchanged; capability
negotiation keeps minor versions compatible: a minor version only adds operations, events or
optional fields, and each addition is advertised as a capability.

**No settings operation (D24).** Contract v1 adds no operation over §5.2: there is no
`settings.describe` and no `settings.update`. An instance never reads or changes connector limits.
The instance interface is §5.2: session tools (`session.*`), approvals,
questions, prompts and grants, attachments, `inbox.push` (hand-over notes, session messages,
finished-session notices, card records), and the `approval.*`, `watch.status` and `session.state`
events.

**No instance attached (the connector alone):**

| Input | Behaviour |
| --- | --- |
| `message_fishball`, a finished-session notice, a hand-over note, a managed-session change | queued in the intake ledger (bounded by `maxQueuedInputs`; past it `queue-full`), delivered once each, in global arrival order, on the next attach |
| `ask_fishball`, a direct call that needs approval, a question or plan review from a managed session | not queued and not offered: `ask_fishball` returns `unavailable` at once and the session makes the call, so the user is asked in that session (DESIGN.md §7a.5); a question goes to its own session's prompt. A request answered there is never offered to a later instance |
| Hand over / Take back | work; the session becomes managed or unmanaged |
| Fishball view (sidebar row, brand) | the connector's frame (§0.5 "The frame") with the state `unattached` and its settings button. The content area shows an empty state, "No Fishball instance is attached", with a link that opens DSH's Plugins panel; no iframe |
| managed-row marks | shown from the connector's own state |
| connector settings | DSH's own Plugins → settings form of `fishball-connector`, the same place as with an instance attached (D24) |

### 0.5 The built-in instance

Revised 2026-11-07 for D28–D30. The Option A child of the 2026-11-06 revision (`[dsh-base,
dsh-web-app]`, DSH's session view in the iframe, a child UI plugin, an agent preset) is withdrawn.
Its spike stays in §0.3 as a record.

**Child profile (unchanged from today).** Bundles `[dsh-base]` only. The launch overlay keeps
today's rows (lifecycle, session tools, approvals, app, inbox, admin, provider-sync target,
time-context, read-only sandbox, approval ask, `client-hmr` disabled; §2.3). The existing slim
migration stays: a manifest that still lists `dsh-web-app` loses it, owner bundles keep their order,
and the old manifest is kept once as `package.json.pre-slim-<UTC stamp>`
(`src/native-runtime/installation.js` `slimProfileBundles`). Nothing is added for D28: no
`[base, web-app]` migration, no `ui-*` rows to disable, no `web-runtime` row, no child UI row.

**Readiness (unchanged).** The base core services plus the app row's loopback server, which
answers 401 without the bearer and 200 with it (`RUNTIME.requiredServices`, `appService:
'fishballApp'`, `src/native-runtime/child.js` `authenticatedReadiness`). There is no wait for
`webServer`, `connection` or `sessionController`, because the child has no Web UI. The startup
bound stays 60 s (`NATIVE_TIMEOUT`).

**Child launch (D28: "主DSH怎么启动，fishball就怎么启动").** The child is spawned exactly as the
main DSH process runs:

- executable: the main process's own `process.execPath`. There is no `node` lookup on PATH, no
  search order, no DSH-X wrapper lookup, no version probe and no setting to choose another one
  (U1: "不要指定node了……就跟随原本的寄宿的DSH就行了");
- exec arguments: the main process's `process.execArgv`, in order, without `--inspect*` and
  `--debug-port` flags, before the child's own
  `--import <parent-watch preload> <dsh bin> --profile fishball --patch <overlay> --host 127.0.0.1
  --port 0 --no-open`. Under DSH-X this carries `--use-system-ca`, `--max-http-header-size=131072`
  and its two `--import` hooks (`DSH.app/…/core/server.js` `dshArgs`), so the child gets the same
  session-log compatibility hook as the main DSH;
- environment: the child's isolated variables as today (`HOME`, `DSH_HOME`, `XDG_*`, `TMPDIR`,
  `DSH_TELEMETRY_DISABLED`, `installation.js` `isolatedEnvironment`), plus the main process's
  values of the runtime variables in one fixed constant list, `RUNTIME_ENV = [NODE_OPTIONS]`,
  copied only when set, and `ELECTRON_RUN_AS_NODE=1` whenever the main process is Electron (below); `NODE_OPTIONS` carries DSH-X's worker-thread hook (`compat/worker-events.cjs`,
  needed by DSH's session-log worker) and its `instance-link.cjs`, which stays inert in the child
  because the child gets no `DSH_X_INSTANCE_LINK`. No other main variable is copied: no API key, no
  token, no `DSH_X_*` (D6);
- `PATH`: the main process's absolute PATH entries, in order (today's rule, without the chosen
  node's folder in front).

**Electron host (U2: "如果是Electron进程，就改成后台子进程").** When the main process is Electron
(`process.versions.electron` is set), the start never fails for that reason: the child is always
spawned as a background Node process, with `ELECTRON_RUN_AS_NODE=1` set in its environment whatever
the main process has, detached, with no window and no stdin (`stdio` as today: ignore, ignore, the
stderr pipe, the lifetime pipe). Without that variable the Electron binary would open a second
DSH-X window (SP2 run 1). Under DSH-X today the main process already has the variable, so the
child's environment is unchanged there.

**`--inspect*` / `--debug-port` are dropped from `execArgv`** (Fishball's own call, pending the
user's confirmation): a debugger port the main DSH already holds would make the child fail to
start, and the child has no debugger of its own. No other flag is touched.

`verifyNode` and its probe are removed: the executable is the one already running DSH. The
`nodeExecutable` and `executableSearchPath` fields are removed (U1).

**Chat page (D29).** The child keeps its own page: `src/slim/ui/**` served by
`src/slim/child/server.js` (document, `/ui/*`, `/api/*`, SSE `api/events`), behind the main
DSH's `/fishball/embed/*` proxy with the parent-only bearer (§3). The page is restyled to DSH's
look (task I8):

- DSH's design tokens: the child ships one stylesheet, `src/slim/ui/dsh-tokens.css`, a copy of the
  `--dsw-*` and `--dsh-font-*` custom properties of `dsh-client-ui-theme` (`base_css`,
  `design_platform_css`, `focus_css`, `gradient_shadow_text_css` in its `lib/client.js`, MIT), for
  light on `body` and dark on `body[data-ds-dark-theme]`, the attribute DSH's own layout sets
  (`dsh-client-ui-layout/lib/client.js:505,553` on rc.5, `:571,619` on 0.2.2-rc.1). The copy is
  needed because those properties are set on the main page's `body` and an iframe document does
  not inherit them. It is taken from 0.2.2-rc.1, the SDK baseline; the two versions' token
  strings differ, so the copy names its source version, and THIRD_PARTY_NOTICES names the licence;
- DSH's look, not DSH's classes: DSH's component classes are build-hashed CSS-module names (for
  example `_8HJdBW_group`), so the page keeps its own class names and draws them with DSH's tokens
  and measures: the session header (52 px row, 10 px 28 px padding, 14/20 title, the values C3
  already uses as `DSH_SESSION_HEADER`), the conversation column, the user bubble
  (`--dsw-specific-bubble`), the composer (`--dsw-specific-input-major`, `--dsw-radius-*`), DSH's
  primary and ghost buttons, the system font stack `--dsh-font-family-text-default`;
- no frame chrome (D27): the page's permanent "Fishball" title and connection status tag go. A
  lost SSE connection shows only the §11 "Reconnecting…" banner while it lasts. The header keeps
  the model and effort pickers (D20) and one empty actions area, which I6 fills with Settings;
- the page loads no DSH module and no remote file; the CSP stays `default-src 'self'` (§3.3).

**Settings view (D20, D18).** The same page shows Fishball's settings when its URL has
`view=settings` (the registered `ui.settings` is `/fishball/embed/?view=settings`). The header's
Settings action opens it and writes `view=settings` with `history.replaceState`; its Back action
removes the parameter. Only the first `view` parameter with the exact lowercase value `settings`
selects the view; anything else shows the chat. The view's blocks are in §0.7 and task I6.

**Languages (D30).** The page exists in two variants, English and Chinese: one page and one code
path, with two dictionaries (`src/slim/ui/i18n.js`, keys equal in both). The variant comes from
the page URL's first `lang` parameter: exactly `zh` selects Chinese, anything else or no `lang`
selects English (DSH's own fallback locale, `dsh-client-locale` `FALLBACK_LOCALE`). The page sets
`<html lang>` (`zh-CN` or `en`, DSH's own mapping, `syncDocumentLanguage`). The main proxy's 503
page follows the same parameter. The connector chooses the variant by the URL it frames: contract
1.1 (task K2, approved by the user as U4) adds `lang` to the framed path. Until K2 is merged the
page shows English, and the instance can already be tested with a hand-written `?lang=zh`.

**Theme (decided, §0.9 U3).** The user's direction: "类似一个web app的明暗模式跟随浏览器一样，内嵌窗口也跟随
外框的进程进行修改" — the iframe follows the outer page's light or dark mode live, the way a web app
follows the browser. **Decided** (the user's "可以" to the proposal, 2026-11-07; delivered by I9 in
`src/slim/ui/theme.js`): the page is same-origin with the main page (it is served under
`/fishball/embed/` on the main origin), so it reads `window.parent.document.body`'s
`data-ds-dark-theme` attribute, the one DSH's own layout sets for dark (`dsh-client-ui-layout`,
§0.5 "Chat page"), sets the same attribute on its own `body`, and follows every change with a
`MutationObserver` on that one attribute, with no reload. When the parent is not reachable (the
page opened alone with "Open in a tab", or a cross-origin parent), it falls back to
`prefers-color-scheme` and follows that live. Nothing is posted to the parent, so D27's "no browser
message crosses the frame" still holds; the page only reads one attribute. Its cost: the attribute
is a DSH-internal name (it is in both 0.2.1-rc.5 and 0.2.2-rc.1), so a test watches it (R1).
Every access to the parent is guarded, so a cross-origin or missing parent never throws. There is
no `theme` URL parameter and no contract change. *(The alternative, a `theme=light|dark`
parameter in K2 with a reload on change, was not taken: it would lose an unsent draft.)*

**Child routes.** The child's HTTP surface stays its own loopback server (§3.1), not Connection
Fetch routes: there is no DSH Web host in the child. The SP F1 rule applies to main-side routes
only.

**The frame (D27, delivered by C3).** Unchanged: the page around the iframe is the connector's,
with Fishball's state, the unread count, Connector settings, Refresh, "Open in a tab" and Retry.
The child page sends no `postMessage` and the connector listens for none.

**Fishball's session (unchanged).** `src/slim/child/chat.js` creates or resumes the one session
itself: id `session-fishball-<uuid>`, sandbox read-only, approval ask, persona registered in the
agent's own scope on create and resume, `agentOptions` from DSH's default model. Nothing else in
the child resumes it, so no agent preset and no workspace registration are needed (I5 withdrawn).
The composer's model and effort pickers are the page's own (D20).

**Records.** Card records (`plugin:fishball/card-record`) and inbox notices
(`plugin:fishball/inbox-notice`) are already written into Fishball's session. Today the custom
chat projects only the notices (`chat.js` `entriesOfEvents`); I7 adds the card records. The
connector's browser module `packages/connector/client.records.js` cannot be reused there: it is a
React component loaded through DSH's client module loader, and the child page has neither. The
shared part is the record schema in the contract (`card-record.js`), which both sides already
import (§0.9 U6). Fishball's own decision labels stay as they are, beside the card records (U5):
I7 adds the records and changes nothing in the labels.

**Plugins in the child.** Plugins installed into the child profile run in the child's core (their
tools, hooks and settings). Their browser halves (`dsh.client`) have no host in the custom page,
so a plugin that only changes DSH's UI has no effect in Fishball's chat. This is the cost of D28,
stated for the user (§0.9).

### 0.6 Automatic binding (covers B2)

- Each package's bundle patch inserts its own row (`fishball-connector`, `fishball-instance`), so
  `dsh plugin add fishball-connector fishball-instance` needs no profile edit.
- The instance row reads `fishballConnector` through an optional `ctx.inject` sub-scope. With no
  connector, its status is `connector-missing`, it does not start the child, and its own Plugins
  card in the main DSH states the reason. It never fails the main boot and never installs the
  connector (D25). When the connector appears later, the sub-scope activates and the instance
  starts without a main restart; when it goes away, the instance stops its child and returns to
  `connector-missing`. (Delivered by I1 and I1b.)
- After main `appReady` the instance starts its child (§0.5 "Child launch"), and on every
  authenticated wire it calls `attachInstance` with the wire's control channel as `transport`,
  `ui`, `status` and `retry` (I1c, delivered in 2d4b8ea). `ui` is `{chat: '/fishball/embed/'}`
  today; I6 adds `settings: '/fishball/embed/?view=settings'` together with the settings view, so
  "Open instance settings" never opens the chat. A child restart is a detach followed by a new
  attach. With K2, the connector adds `lang` to whichever path it frames; there is no `theme`
  parameter (U3).
- `status()` returns `{state, code}` from the instance's own status, whose states and codes are
  the contract's `STATUS` and `STATUS_CODES` while it is attached. `retry()` is the instance's
  restart and rejects when the restart ends `failed`.
- An attach refused `instance-busy` gives `failed` with `NATIVE_INSTANCE_BUSY`, and one refused
  `contract-version` gives `failed` with `NATIVE_CONTRACT_VERSION`; in both the child is stopped and
  not restarted by itself (inst-OQ-03; delivered by I1c).
- Disabling or uninstalling either plugin detaches; the connector returns to no-instance mode, and
  the instance stops its child.

### 0.7 Settings: who stores what, who shows it

| Setting | Stored in | Edited from |
| --- | --- | --- |
| Connector: its limits (§18.5 conn-OQ-20) and the question mode | the main DSH, the `fishball-connector` row's config (volatile fields) | **only** DSH's own Plugins → settings form of `fishball-connector`, rendered by the connector's client (D24). No instance reads or writes them |
| Instance, needed before the child exists: `enabled` | the `fishball-instance` row config in the main DSH | DSH's own Plugins → settings form of `fishball-instance` |
| Instance: status, Retry / Restart | the instance's main half | its Plugins card in the main DSH (state, code, Retry while `failed`; I1c, `POST /api/fishball-instance/retry`), the connector's frame (Retry through `retry()`), and the settings view's Restart. All three use the main half's own restart; the settings view calls the existing admin route `admin.restart` (below), so no upward wire operation is needed |
| Instance: model sync (D26), a button, not a setting | the child's own settings and credentials (the result); nothing is stored in the main DSH | the "Model for Fishball" block of the `fishball-instance` Plugins card in the main DSH: **Check for new models** fetches once, the user ticks entries, and **Add selected** writes only those (§10). The instance's settings view has no sync button |
| Instance: plugins, plugin settings, recommended plugins | the child profile | the settings view's Plugins block, which calls the existing admin routes (below): list, install, enable, disable, remove, recommended, and each plugin's settings. DSH's own Plugins page cannot be used: the child has no Web UI (D28) |
| Instance: the chat's model and reasoning effort | the child's own settings | the composer's own pickers (D20) |
| Instance: runtime limits (startup, stop and request timeouts, frame and log sizes) | fixed constants of the instance (`RUNTIME_LIMITS`) | not exposed (D23) |

**What the main DSH exposes for the instance (D23, D26, D28), exactly:** the form field `enabled`,
plus the status line, Retry and the sync button on the same card, which are not fields. The old
`limits`, `controlLimits` and `providerSync` keys are no longer in its schema, and neither are
`nodeExecutable` and `executableSearchPath` (U1, task I2); a stored value is ignored without a
warning, and the one-time migration copies only `enabled` and drops the two old values silently.

The settings view is hosted by the instance: it is the child page at `?view=settings`, framed
through `/fishball/embed/?view=settings` inside the connector's frame (D27), and opened from the
chat header and from the connector's Plugins card ("Open instance settings", C3).

**Admin routes (kept, D29).** The main-to-child admin relay stays: the owner-only Fetch routes
`/api/fishball/native/admin/*` (`src/slim/host/settings-routes.js`) call the relay
(`src/slim/host/admin.js`), which answers `status` and `restart` itself and sends every other
operation over the authenticated wire to the child's admin service (`src/slim/child/admin.js`,
11 operations). The settings view is framed on the main origin, so it calls these routes directly,
with the main DSH's cookie, exactly as the connector's old settings page did; the browser never
reaches the child's admin service any other way, and the main process still never writes a child
file (§9). The relay's status check accepts the instance's own `connector-missing` state and
codes (I1c). The view shows no connector limits
and has no link of its own to them: the frame's **Connector settings** button opens DSH's form of
`fishball-connector` (inst-OQ-05).

### 0.8 Risks

1. **R1 Copied tokens drift.** `dsh-tokens.css` is a copy; a DSH release can rename or retune
   tokens (rc.5 and 0.2.2-rc.1 already differ). A test compares every copied name with the
   installed DSH's theme module and reports names that are gone.
2. **R2 The main runtime's arguments.** The child inherits `execArgv` and `NODE_OPTIONS` as DSH-X
   sets them today. A DSH-X update can add a flag the child should not have; only the debugger
   flags are dropped (§0.5).
3. **R3 Electron as Node.** Under DSH-X the child is the Electron binary run as Node. Its cost for a
   base-only child is not measured (SP2 measured only the Web child: RSS 174–253 MB; the plain-Node
   base child was 65–113 MB).
4. **R4 Shared localStorage.** The iframe shares localStorage with the main page; the custom page
   uses none today, and any later use must prefix its keys.
5. **R5 Plugins with only a browser half** do nothing in Fishball's chat (§0.5 "Plugins").
6. **R6 Contract maintenance.** A public contract freezes names: a breaking change needs a major
   bump, and both sides must keep the version check. K2 is an additive minor (1.1).
7. **R7 Theme attribute** (U3 decided): the page mirrors DSH's `data-ds-dark-theme`; a DSH rename
   of that attribute would silently show the framed page in light; a test watches the name. A
   page opened in its own tab follows the OS scheme, not an explicit DSH choice.

### 0.9 Decisions for the user (2026-11-07)

The user answered on 2026-11-07: "1. 不要指定node了，我从来没说过这个要求。搜索路径也不需要，就跟随原本的寄宿的
DSH就行了。2. 如果是Electron进程，就改成后台子进程 3. 类似一个web app的明暗模式跟随浏览器一样，内嵌窗口也
跟随外框的进程进行修改。4.同意 5.具体是什么情况？6.同意 7.同意", and then on U5: "U5就这样也行".

| # | Question | Answer |
| --- | --- | --- |
| U1 | `nodeExecutable` and `executableSearchPath`: keep as an override, or remove? | **Closed: removed.** The child always follows the host DSH: its executable, its `execArgv` and its PATH (§0.5). The instance's card has only `enabled`; the migration drops the two old values silently. Task I2. |
| U2 | What happens when the host process is Electron? | **Closed: never refuse.** The child is spawned as a windowless background Node child with `ELECTRON_RUN_AS_NODE=1` (§0.5 "Electron host"). Dropping `--inspect*` / `--debug-port` from `execArgv` is Fishball's own call and still waits for the user's confirmation. |
| U3 | Theme: how does the iframe follow DSH's light or dark choice? | **Closed: decided ("可以", 2026-11-07).** The page follows the outer DSH page's `body[data-ds-dark-theme]` live, with no reload. The iframe is same-origin, so it reads `window.parent.document.body`, watches it with a `MutationObserver`, and mirrors the marker onto its own body. Every access is guarded: a cross-origin or missing parent must not throw. When there is no reachable parent (the page was opened in its own tab), it follows `prefers-color-scheme` through `matchMedia`, live. No `theme` URL parameter, and no contract change (§0.5 "Theme"; delivered by I9). |
| U4 | D30's form | **Closed: contract 1.1 (K2) with a `lang` query parameter** on the framed path: DSH's active locale id (`zh` or `en`), replacing a `lang` the path already has, before the fragment; a locale change reloads the iframe. The descriptor is unchanged. |
| U5 | Fishball's decision labels and the card records both describe a card Fishball decided. Merge them? | **Closed: keep both as they are.** The label and the record may both show; there is no merge or replacement logic, and I7 does not de-duplicate. |
| U6 | I7 cannot reuse the connector's React record module | **Closed: share the schema and the words, not the renderer.** The custom chat draws its own row from the contract's `card-record.js`; a test checks that both sides' `record.*` words are equal in both languages. |
| U7 | "Two sets of UI" (D30) | **Closed: one page, two dictionaries,** served as two variants, `?lang=en` and `?lang=zh`. |

Not a decision, for the record: D28 brings back work that Option A got from DSH. The settings
view's model, plugins and plugin-settings blocks (I6) are built in the custom page over the kept
admin routes, as the connector's old settings page did before C3 removed it
(`packages/connector/client.js` at `8fb79c2`, `makeModelSettings`, `makeChildPlugins`,
`makeChildSettings`; React for DSH's loader, so a reference for behaviour and wording, not code to
move). Browser-only DSH
plugins do nothing in Fishball's chat (R5). `DESIGN.md` line 9 carries the
same amendment.

Base: `d67e69f` on `integration/native-runtime-on-74fe6be`, branch `feat/slim-native-embedded-ui`.
SDK baseline: DSH **0.2.2-rc.1**, the newest published 0.2.2 build (no final 0.2.2 exists; npm
`latest` is 0.2.1-rc.5). Verified against a temporary install at `/tmp/dsh-022` (read-only for this
repository); every citation below is 0.2.2-rc.1. rc.3 keeps working where the contracts are
unchanged and is not a separate target.

## 1. Decisions

| # | Decision | Source |
| --- | --- | --- |
| D1 | The isolated Fishball serves its **own chat page**; the main DSH shows it in an iframe through a same-origin broker route on the main DSH. UI code lives in the child and changes without touching the main page or plugin. **Superseded 2026-11-06 by §0 (D16/D18).** | user |
| D2 | The child no longer runs a DSH Web UI. It runs the DSH **core** (`dsh-base`) plus one Fishball-owned app plugin. **Superseded 2026-11-06 by §0 (D16/D18).** | user |
| D3 | The isolated Fishball fully replaces legacy in-process Fishball; no automatic fallback. Lifecycle unchanged (starts/stops with the main DSH). | user |
| D4 | Main DSH settings manage the child's model, plugins, settings, status and restart. **Superseded 2026-11-06 by §0 (D16/D18).** | user |
| D5 | Models and API keys arrive through provider sync. API-key providers only, including keys on built-in routes; add-only; logins never copied. The way it runs was amended twice on 2026-11-06: first to **Refresh models** with no preview or confirm step, then by D26 to a button that fetches what is missing and writes only what the user ticks (§10). | user |
| D6 | The narrow bridge keeps start/message/read/approve powers over main-DSH sessions and receives no main DSH credentials. | user |
| D7 | Fishball must be able to see and send images, by reference, never by file path. | user |
| D8 | Fishball's own session is hard-wired read-only; its composer has no permission control. | user |
| D9 | Fishball decisions are labelled inline in Fishball's own chat, not in a trail under managed sessions. | user |
| D10 | One "Hand over to Fishball" button with an optional user note replaces watch-only and send-only. | user |
| D11 | Managed sessions show the Fishball fish in DSH's idle leading slot with green unread / yellow needs-action dots; the running fish-under-the-hollow-spinner layout waits for a DSH upstream slot and no CSS approximation is used. | user |
| D12 | Fishball-accent buttons become normal DSH buttons with one magenta ring, from one shared constant/token. | user |
| D13 | Main-DSH plugins may technically script the same-origin embedded Fishball page; accepted, because the child process, its home and its credentials stay isolated. | user |

Rejected alternatives are recorded where they were rejected (§3.2, §6.2, §13).

## 2. Architecture

### 2.1 What the child runs

**Decision:** the child boots the shipped `dsh` launcher with a Fishball-owned profile whose only
bundle is `dsh-base`, plus a launch overlay that inserts the rows base does not ship: the Fishball
app row (`fishball-native-app`) and the restored web-standard row `time-context` (§2.3). The app
row also owns reminders (T10), so no DSH schedule row is mounted. The child app owns a loopback
`node:http` server (UI, JSON API, SSE) and wires the DSH core services to it.

It runs: `agent`, `session` + JSONL persistence + projection + storage, `llm` + adapters
(`llm-pi-ai`, `llm-deepseek-api-key`), `tools` (bash/fs/web search/web fetch/skill/goal/jobs/todo),
`user-approval`, `user-questions` (the service base ships, with no question tool mounted),
`system-prompt`, `time-context`, `settings`, `config-editor`, `plugin-manager`, plus the
Fishball app row, which also owns reminders (T10). Fishball asks the user
with its own `ask_user` card tool instead of a DSH question tool (§2.3, T09).

It does not run: `dsh-web-app`, the browser client kernel (`client-modules`, `web-frontend`), any
`dsh-client-ui-*` package, the web server row, MCP clients, memory plugins, X search, or
`tool-present`. Base's web search and web fetch stay in, and `present` stays out, because the slim
UI is Fishball's own (§2.3).

### 2.2 Evidence that 0.2.2 can start a core without the Web UI

| Claim | Evidence (0.2.2-rc.1 SDK) |
| --- | --- |
| Profiles are bundle stacks; several shipped templates have no web UI | `dsh-official-bundles/lib/index.js:4-8`: `"headless"` = base + headless, `"sdk"` = base + sdk-app, `"sdk-minimal"` = sdk-minimal alone. |
| A base-backed core is a supported, documented composition | `dsh-headless/package.json:3`: "a direct core Agent/Session runner over dsh-base with no Host, HTTP, or browser layer". |
| The launcher provides the services a non-web app needs | `dsh/lib/profile-boot-e2mS45fC.js:305-315`: `profileContext`, launch environment, `cmdlineArgs`/`appReady` are provided by the launcher before the tree composes. |
| Boot does not require `webServer`/`connection` | Same file: the tree is only patch layers; rows gate on `profileContext` (`dsh-base/cordis.patch.yml:20,105,109`). Nothing in base injects `webServer`. |
| The sdk bundle is stdio-bound, so unsuitable for a detached child | `dsh-sdk-app/lib/index.js:39` calls `exitOnStdinEnd(ctx, "sdk-app.stdin")`, while the native child is spawned with stdio ignored plus one pipe (`src/native-runtime/index.js:211`). |
| A headless core can be long-lived only if a plugin holds the process | `runProfile` returns after `appReady.commit()` (`dsh/lib/profile-boot-e2mS45fC.js:315`); the child app's listening server keeps the loop alive and calls `ctx.appExit` on stop. |
| Core services suffice for a chat agent | `ctx.agents.create/resume` (`dsh-agent/lib/types/index.d.ts:292,300`), session events (`dsh-session/lib/types/index.d.ts:228`), approval waterfall (`dsh-user-approval/lib/index.js:201`), question waterfall (`dsh-user-questions/lib/index.js:709`). |

This is the "headless core" option rather than a purpose-built agent loop or a bare minimal server:
DSH's own agent, session, tool and model stack runs the chat, and only the transport and UI are
Fishball's. The headless bundle itself is not the runtime — it is a one-shot runner (`dsh headless
"run the tests"` answers one task and exits, `dsh/lib/bin.js` help examples) and carries the same
`dsh-base` rows we compose directly.

**Why not reuse `dsh-web-app` with rows disabled:** its bundle patch is 117 rows
(`dsh-web-app/cordis.patch.yml`), including the client kernel, the frontend dist and the whole UI
roster. Disabling rows would still ship and mount the web shell, which is what D2 removes.

**Why not include `dsh-host-webserver` in the child:** that row requires `webStartup`
(`dsh-web-app/cordis.patch.yml:175-184`), which belongs to the web app. The child app therefore
binds its own `127.0.0.1:0` server. Route registration, SSE and
backpressure are the child app's responsibility.

### 2.3 Child profile and launch overlay

- Profile: `<child home>/profiles/fishball` with `dsh.profile.bundles = ["@deepseek-ai/dsh-base"]`
  (replaces today's `boot.PROFILE_TEMPLATES.web.bundles` at `src/native-runtime/installation.js:113`).
- Overlay rows: `fishball-native-child` (lifecycle, required), `fishball-native-session-tools`,
  `fishball-native-approvals`, `fishball-native-app` (required), `fishball-native-inbox`,
  `fishball-native-admin`, `fishball-native-provider-sync`, `time-context`. The bridge, approvals
  and inbox modules are their own loader rows, not plugins the lifecycle row starts itself, and the
  app row injects `attachments`, `llm` and `fishballApprovals`: Cordis then starts each row once
  the services it reads exist, and the loader's boot settlement covers the whole chain before
  `appReady` (2026-11-06 fix B5; before it, `/api/upload` and `/api/approvals` were 404 on 0.2.2).
  Keep `hmr` disabled, set `sandbox-policy.mode = read-only`,
  `approval.policy = ask`, `bash-sandbox` unchanged. `time-context` is one of the web
  `standard` preset's rows (`dsh-web-app/presets/standard.patch.yml:19-20`); base already carries
  the `user-questions` service (`dsh-base/cordis.patch.yml:79-80`), web search and fetch
  (`:486-487`) and the prompt registry (`:510-513`). The SDK app mounts the same row at the root
  of a non-web profile (`dsh-sdk-app/cordis.patch.yml:61-68`), which is the layer this overlay
  uses. `time-context` keeps its defaults (host zone until the child composer reports
  `clientTimeZone`).
- **Ask User is removed (T02b reversed, user decision 2026-11-05).** T02b also restored the
  preset's `tool-ask-user` row, which gave the child DSH's blocking `ask_user_question`. It is
  gone: the user's decision is that questions go through cards like everything else, so the child
  mounts no question tool and the base `user-questions` service stays unused by Fishball's own
  asks. The child's replacement is its own `ask_user` tool (T09, §5.2): it files a card
  in the user's pile and returns at once, so nothing waits and no card has a deadline.
- Not restored: `present` (`@deepseek-ai/dsh-tool-present`, `standard.patch.yml:123-124`) because
  the slim UI is self-made. Persona is not an overlay row: `@deepseek-ai/dsh-persona` is
  scope-only and collides when mounted globally (`dsh-persona/lib/index.js:7-11`). T07's chat
  agent instead registers Fishball's persona (`src/persona.js`, including the "Asking the user"
  section) in its own agent scope from its `agents.create` / `agents.resume` setup; it shadows
  the deployment persona for that one agent, and a resumed session gets the current text. The
  module and its one text dependency (`src/pile-note.js`) ship in the child snapshot.
- The child profile may still carry the old native build's `ui-settings-general` Web UI row in
  its own `cordis.patch.yml`. The launch overlay disables that exact row (a loader patch cannot
  delete a row), so the slim child composes no `dsh-client-ui-*` row and the profile patch stays
  byte-identical.
- Question seam for T09: **Fishball asks the user with a card, not with a DSH question.** Its
  `ask_user` tool sends `question.ask` over the bridge; the main host files a card in the user's
  pile (`pile.file(...)`, §5.2) and returns the card id at once, so the tool call never blocks.
  The card carries no end time (nothing arms a timer, `src/card-lifecycle.js`), it is answered on
  the card with DSH's options, and the answer settles it with `CARD_END.user`. A card that leaves
  unanswered goes through `Pile.onClose` → `closeCard()`, which is the same closure line every
  other card gets. The child keeps its own copy of the question (`state.questions`), answerable
  through T09's existing `own` answer action, and either answer settles the one pile card. The
  words reach Fishball's chat as the T09 carrier already in use: a `QUESTION_ANSWER` inbox system
  item plus one `answers()` row, so an answer to Fishball's own question looks like an answer to a
  question a session sent it. The base `user-questions` service is still answered in process by
  the child app for a DSH question another plugin raises (the SDK adapter's shape,
  `dsh-sdk-jsonrpc-server/lib/index.js:165-169`); Fishball's own ask no longer uses it.
- The row's config carries `mainHome`, `hostId`, `instanceId`, `limits`, `control`, and the
  256-bit bridge bearer endpoint. Nothing else crosses into the child.
- `native-child.js` no longer injects `webServer`/`webApp`; it injects `nativeRuntime`,
  `agents`, `sessions`, `tools`, `profileContext`, `appExit`, `appReady`. Its readiness probe
  becomes "server is listening + core services present + authenticated request succeeds".
- Child rows obey Cordis's `apply` contract: the return value is the fiber's disposer (a function)
  or nothing. A service or endpoint is published with `ctx.provide` or through the runtime's
  channel callback, never returned; Cordis rejects any other non-null return as `Invalid effect`
  and unloads the row.

### 2.4 Lifecycle (unchanged rules)

Start after main `appReady`, stop on dispose/exit, HMR stop-then-restart, one writer per attached
home, bounded stop (4000 ms inside 0.2.2's 5000 ms grace), parent-lifetime pipe, no PID-only signals.
The app row's server close ends its SSE streams first and then closes idle and remaining HTTP
connections before awaiting `server.close`; a browser keep-alive or SSE socket would otherwise
hold the child's stop open until the lifecycle stop window.
Only the readiness checks and the copied code set change: `src/native-runtime/constants.js`
`requiredServices`, `overlay.js` row assertions, and `copyChildCode` now copies `src/slim/**`
in addition to the lifecycle modules.

### 2.5 0.2.2 compatibility notes

Verified against **0.2.2-rc.1** (temporary install at `/tmp/dsh-022`). rc.3 is not a separate
target; where a contract is unchanged the same code runs there.

| Area | 0.2.2-rc.1 | rc.3 |
| --- | --- | --- |
| Profile templates | moved to `dsh-official-bundles/lib/index.js:4-8`; `dsh-app-boot/lib/index.js:15` imports it | owned by `dsh-app-boot` |
| Boot sequence | `dsh/lib/profile-boot-e2mS45fC.js:305-315` | `profile-boot-C14i-8IN.js:304-314` |
| Attachment RPC | reads the supplied reference without checking Session history (`dsh-api-session-controller/lib/index.js:886-895`) | checked the log (`referencedImage`) |
| Sidebar slots | new always-mounted `sidebar.session.row.trailing` (`dsh-client-ui-workspace/lib/client.js:2635`, registered `:6066`); the leading slot is still idle-only (`:2535,2609`) | no trailing slot |
| Client assets | `dsh-web-frontend/dist/assets/index-BgUyXZcc.js` (`StateDot`, one minified line), `.../index-lh_YM6sT.css` (spinner rules, one minified line) | other hashes |
| New UI packages | `dsh-client-ui-action-cards`, `dsh-client-ui-file-actions` (not used) | absent |
| Agent, session, approvals | `dsh-agent/lib/types/index.d.ts:292,300`; `dsh-session/lib/types/index.d.ts:228`; `dsh-user-approval/lib/index.js:201`; `dsh-user-questions/lib/index.js:709` | shifted |
| Plugin API | `settings.mutate`, `credentials.modifyRecord`, `pluginManager.listPlugins/inspect` and `dsh-plugin-manager/operations` (`runPluginCommand`) unchanged | same |

Design impact: the bridge keeps its own image-reference authorization instead of the changed
attachment RPC; every other difference above is a line shift or an unused package. All tasks target
0.2.2-rc.1; rc.3 compatibility is verified only where the contract is unchanged and never adds
scope.

The agent-scope persona uses `systemPrompt.section` and `getSectionOrder`, the same API in
0.2.2-rc.1 and rc.3, and `agents.resume({ setup })` exists in both, so Fishball's persona and its
re-application on resume work on rc.3. The only known rc.3 degrade in this design remains the
0.2.2-only trailing sidebar seat: T13a's running fish waits silently and does not render (the idle
leading mark and T14's header button do not depend on it). Attachment authorization is the slim
bridge's own check, so rc.3's stricter RPC does not break it; the moved profile templates and the
new 0.2.2 UI packages are not used by the slim path.

## 3. Embedded UI

### 3.1 Serving and ownership

- The child app serves `/` (HTML), `/ui/*` (its own ES modules, CSS, assets), `/api/*` (JSON)
  and `/api/events` (SSE). All bytes are child-owned, so a UI change is one child update.
- The **main DSH** registers one prefix route, `/fishball/embed/*`, on its own web server and
  reverse-proxies it to the child, keeping the browser on the main origin. The route is the only
  path a browser uses; the child's port is never addressed by the browser.
- Main-side route ownership: `src/slim/host/embed.js`. It admits the request with
  `ctx.connection.requestRejection(request)` (`dsh-client-connection/lib/types/rpc.d.ts:185`),
  requires `sec-fetch-site: same-origin`, and forwards to the child with the bridge bearer.

### 3.2 Authentication without a separate login

The browser already has the main DSH session. The broker route is authenticated by that session;
the child is authenticated by the **parent process**, not by the browser:

1. On child readiness the child mints a 256-bit bearer and returns it over the lifecycle control
   channel (unix socket, HMAC-authenticated; `src/native-runtime/wire.js`).
2. The main host keeps it in memory and attaches `Authorization: Bearer <token>` to every proxied
   child request. Tokens rotate on restart; nothing is persisted.
3. The child accepts only that bearer on its loopback server. Any other request gets `401`.

Consequences, each a requirement:

- **No separate login**: the iframe request carries the main DSH cookie (same origin, same site).
- **No token in URLs**: the iframe `src` is `/fishball/embed/` with no query and no fragment.
- **No token in main-page-readable storage**: the child token never reaches JavaScript; the browser
  holds only the existing HttpOnly DSH cookie.

**Rejected alternatives**

- Direct iframe to `http://127.0.0.1:<childPort>`: the first request needs either a capability in
  the URL (forbidden) or a page-readable token (forbidden), or a cookie the child cannot set before
  it has authenticated the browser.
- `postMessage` handshake from the main page: the capability would live in main-page memory, where
  any main-profile plugin can read it, and the requirement forbids it.
- Reusing the main DSH's cookie as the child's credential: cookies ignore ports
  (`dsh-client-connection/lib/index.js:335-350` binds the name to the authority but the browser
  still sends it to every port on the host), so the child would receive the main session cookie.
  D6 forbids handing main credentials to the child.

### 3.3 CSP and framing

- Embed route response headers:
  `Content-Security-Policy: frame-ancestors 'self'; default-src 'self'; img-src 'self' data:; connect-src 'self'`,
  `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` on the
  shell document, long-lived immutable caching for `/ui/*` with content hashes.
- The child's own loopback responses add `Content-Security-Policy: frame-ancestors 'none'` and
  `Cross-Origin-Resource-Policy: same-origin`, so the child origin can never be framed directly.
- Because the iframe is same-origin with the main page, frame-ancestors is a second fence, not the
  first: the main page could script the iframe. That is accepted (see risks) — the isolation goal
  is UI ownership and process separation, not a security boundary against the user's own main page.

### 3.4 Desktop shell (DSH-X)

The shell does not use `file://` for DSH pages: the window loads the instance URL
(`/Applications/DSH.app/Contents/Resources/app/shell/tabs.mjs:138`, `.../app/shell/main.mjs:304`) with
`sandbox: true, contextIsolation: true` (`main.mjs:335-338`). So the top-level origin is
`http://127.0.0.1:<mainPort>` and the same-origin broker works unchanged. The shell's
`setWindowOpenHandler` (`main.mjs:323`) only affects new windows; the embed uses an iframe and
never opens one. The shell's `will-navigate` guard applies to the main frame, not subframes.

### 3.5 Cookies and SameSite across ports on 127.0.0.1

For the record, because a direct-iframe design would hit this: 0.2.2 mints
`HttpOnly; SameSite=Strict` cookies whose name hashes the authority
(`dsh-client-connection/lib/index.js:335-350`). Cookies are host+path scoped, not port scoped, so
two `127.0.0.1:<port>` origins are **same-site** (ports never change the site), share the cookie
jar, and `SameSite=Strict` would still be sent in an iframe. That is exactly why a direct iframe
would work at the cookie layer but leak the main session cookie to the child origin. The broker
removes the question: the browser never talks to the child origin, so there is no cross-port cookie,
no `SameSite=None; Secure` workaround, and no dependency on `127.0.0.1` vs `localhost` spelling.

### 3.6 Proxy contract

| Concern | Rule |
| --- | --- |
| Methods | `GET`, `HEAD`, `POST` only. |
| Paths | `/fishball/embed` (document), `/fishball/embed/ui/*`, `/fishball/embed/api/*`, `/fishball/embed/api/events`. No traversal, no encoded `..`, no absolute URL. |
| Streaming | SSE passes through unbuffered; the client's `AbortSignal` closes the upstream child request. Backpressure: pause the child response when the browser response returns `false` from `write`. |
| Limits | 1 MiB JSON body; 8 MiB on the one upload route (base64 of a 4 MiB image plus headroom); 32 concurrent proxied streams; 30 s idle timeout (SSE heartbeat every 15 s). |
| Failure | Child not ready — `503` with a static page carrying the error and a Retry button; never a redirect to legacy Fishball. |

## 4. Feature migration

| Feature | Runs today | Runs after | Notes |
| --- | --- | --- | --- |
| Fishball chat UI | main DSH conversation + injected slots (`client.js:156-175`) | child UI (`src/slim/ui/`) | D1; not feature-parity with DSH at v1. UI changes ship as a child update; Fishball never edits its own UI at runtime. |
| Permission mode in Fishball's composer | DSH composer selector (`dsh-client-ui-permission-presets/lib/client.js:1026`) | absent from the child composer; the session is fixed read-only | D8, §8.4. |
| Fishball agent/session | main process (`index.js`, `src/lifecycle.js`) | child (`src/slim/child/chat.js`) | read-only sandbox (§8.4). |
| `message_fishball`, `ask_fishball`, `list_user_messages` | main, `src/messaging.js`, `src/request-desk.js` | tool definitions stay in the main host (they run in managed sessions); delivery moves over the bridge into the child's inbox | §5. |
| Session control (`start_session`, `message_session`, `stop_session`, `redirect_session`) | main `src/messaging.js` | bridge operations executed by the main host (§5.2) | Fishball calls them from the child. |
| `read_session`, `watch_session`, `list_watches`, `unwatch_session` | main `src/watches.js` | bridge operations + child-side tools | §5.2. |
| Approvals: Fishball decides allow/grant/reject/escalate | main `src/approvals.js` | child decides and answers over the bridge; the live card stays in the managed session's pile on the main DSH | §5.2, §8.1. |
| User questions / plan reviews | main `src/questions.js` | child receives and answers over the bridge | same rules; Fishball's own question to the user is a pile card filed by `ask_user` (T09), never a DSH question. |
| Pile/cards | main dock (`client.js:3242+`) | live cards stay in the main DSH on the session they belong to; Fishball's own requests appear in the child UI | Q1. |
| Decision labels | main turn tail (`client.js:3376-3389`) | child timeline (§8.1) | host tag records removed (`src/tags.js`, `src/approvals.js:397,465,878,1182`). |
| Reminders | main `dsh-schedule` | child-owned scheduler in the app row, child UI list | §2.1, T10. |
| Memory / web / X search plugins | main profile plugins, shared via the legacy composition | not installed in the child by default; installable per child | D2. |
| Plugin hooks (`agent/created`, `session/event`, ...) | main profile plugins can inject into Fishball's agent | only plugins installed in the child see the child's agent | the isolation win. |
| Model choice / context window | main settings | child settings applied through the admin API | §9. |
| Provider sync | main to other profile (pairing channel, removed) | main to child on the instance card's Check → choose → Add (child owns the write; D26) | §10. |
| Open isolated Fishball | new browser tab (`client.js:2403-2425`) | embed panel; `openUrl` route removed | §7. |
| Unread count / brand mark | main `client.js` | main unchanged, plus the idle-slot marker with Fishball's unread / needs-action dots; the fish-under-spinner layout arrives after a DSH slot change (§8.2) | — |
| Send / watch / hand over | three header buttons (`client.js:4138-4143`) | one hand-over button with a note (§8.3) | D10. |

## 5. The narrow bridge

### 5.1 Auth model

Two independent channels; neither is a generic RPC tunnel.

| Channel | Transport | Authentication | Who may use it |
| --- | --- | --- | --- |
| Lifecycle + admin | existing unix/TCP control wire, framed HMAC (`src/native-runtime/wire.js`) | per-instance 256-bit secret, mutual HMAC proof, host/instance identity | the main host process only |
| Session bridge | messages on the same authenticated wire, operation allowlist (`src/native-control/protocol.js:66-101`) | the wire identity plus a per-session authorization check on the main host | the child process only |
| Embed | main DSH web route to child loopback | main browser session + parent bearer | the browser, through the main origin |
| Provider sync | the `provider-sync` payload channel on the lifecycle wire | the wire identity; preview token held by the main host | the owner's settings page, through one owner-only route |

Rules that do not change: every session operation carries an explicit `sessionId`; the main host
checks it against `managedSessionIds`, the workspace registry and archived state
(`src/native-host-adapter.js:31-45`); the child never receives main credentials; no operation can
read a main file, plugin or config.

### 5.2 Operations

All payloads are exact-key validated; unknown keys reject the frame. Text limits are byte bounded;
attachment frames are bounded separately (§6.2). Answer and label caps live in
`src/slim/limits.js`: a 500-character reason/question/note/feedback/custom text, a 200-character
label or session title, a 2048-byte quoted message, a 512-character grant prefix, and 32 questions
with 32 selected labels each.

| Op | Direction | Payload | Authorization | Result / errors |
| --- | --- | --- | --- | --- |
| `session.list` | child to main | `{workspaceId?, limit}` | related sessions only (managed, watched, messaged by, forwarded) | `{sessions:[{sessionId,title,workspaceId,running,pendingInteraction}]}`; bounded (100). |
| `session.start` | child to main | `{folder, title, model?, reasoningEffort?, message, attachments[], notifyWhenFinished?}` | folder must exist and be a workspace or absolute path the user opened | `{sessionId, managed, titleError?, workspaceError?, watchId? or watchError?}`; never creates folders. |
| `session.message` | child to main | `{sessionId, message, attachments[], notifyWhenFinished?}` | managed session, live or resumable | `{status: delivered or unconfirmed, watchId? or watchError?}`; never retried after an unconfirmed flush. `notifyWhenFinished: true` (here and on start) makes the host set the watch up with the target's watermark read before the delivery, so a turn that ends at once is still reported (DESIGN §5b/§5c, 7713 N5); a refused watch never undoes the message. |
| `session.redirect` | child to main | `{sessionId, message, attachments[]}` | managed session | as `message`, after `cancel`. |
| `session.stop` | child to main | `{sessionId, reason?}` | managed session | `{stopped:true}`. |
| `session.read` | child to main | `{sessionId, maxMessages, maxBytes}` | related session (managed, watched, messaged by, or forwarded) | `{messages:[{seq,role,author,text,images:[...]}], truncated}`. |
| `session.watch` | child to main | `{sessionId, mode}` | related session | `{watchId}`; refusal carries `watchError`. |
| `session.watches` | child to main | `{}` | — | bounded list. |
| `session.unwatch` | child to main | `{watchId}` | — | `{ok}`. |
| `session.release` | child to main | `{sessionId, reason}` | managed session | `{sessionId, managed:false}`; `unknown-session`, `is-fishball`, `not-managed`, `feature-off`. |
| `approval.list` | child to main | `{sessionId}` | managed session | `{approvals:[descriptor]}`; live requests only, current `offerId`. |
| `approval.answer` | child to main | `{sessionId, approvalId, offerId, answer: {decision, risk?, reason?, question?, grant?}}` | live offer, not expired | `{accepted:true, grantId?, expiresAt?}`; `expired`, `conflict`, `risk-required`, `reason-required`, `allow-needs-low-risk`, `arguments-incomplete`, `question-required`, `grant-invalid`, `prefix-not-shell-tool`, `prefix-empty`, `prefix-not-in-call`, `expires-at-required`, `expires-at-invalid`, `expires-at-past`. |
| `question.answer` | child to main | `{sessionId, questionId, answers?, approve?, feedback?, toUser?, note?}` | managed session's open question | `{accepted:true}`; `expired`, `mode-user`, `bad-answer`, `already-settled`, `session-not-live`. |
| `question.ask` | child to main | `{sessionId, questions[]}` | the child instance only; `sessionId` is Fishball's own child session, the card's author | `{questionId}` for the card just filed in the user's pile; the call never waits, and the card has no deadline. |
| `question.answerOwn` | child to main | `{questionId, answers[]}` | an open `question.ask` card | `{accepted:true}`; `expired` once it is answered or closed, `bad-answer` when the batch does not fit. The answer also returns as the inbox item below. |
| `prompt.list` | child to main | `{}` | — | `{prompts:[{promptId,sessionId,title,toolName,argumentsStatus,since,managed}]}`. |
| `prompt.answer` | child to main | `{sessionId, promptId, decision: allow or reject, risk?, reason}` | that frozen prompt's session | `{promptId, decision, managed}`; `expired`, `invalid-decision`, `risk-required`, `reason-required`, `allow-needs-low-risk`, `arguments-incomplete`. |
| `grant.list` | child to main | `{}` | — | `{grants:[{grantId,sessionId,toolName,kind,prefix?,expiresAt,uses,lastUsedAt?,paused}]}`. |
| `grant.revoke` | child to main | `{grantId, reason}` | an active grant of a managed session | `{grantId, revoked:true}`; `reason-required`, `unknown`, `ended`. |
| `attachment.read` | child to main | `{sessionId, attachmentId}` | the image is referenced by that session's log; 0.2.2's own attachment RPC no longer makes that check (`dsh-api-session-controller/lib/index.js:886-895`), so the bridge verifies the log itself | chunked bytes; `not-referenced`, `too-large`. |
| `attachment.put` | child to main | `{transferId, total, sha256, mediaType, name?, chunks[]}` | the child instance only; bytes are admitted by the host's own attachment store | `{hostRef, expiresAt}` for one later `session.start`/`session.message` |
| `inbox.push` | main to child | `{messageId, kind, sourceSessionId, text, images[], dedupeKey, at}` | a managed session authored it | `{acked:true}`; re-delivered unchanged after reconnect |
| event `approval.request` | main to child | v1's `{approvalId, offerId, kind, prompt, choices, expiresAt}` plus `title`, `at`, `toolName`, `callId`, `reason`, `quotes`, and for a question `questions[]` | managed session | `kind` selects `approval.answer` or `question.answer`. |
| event `approval.settled` | main to child | `{approvalId, decision, by: user or fishball}` | managed session | lets the child update decision labels (§8.1). |
| event `watch.status` | main to child | existing | watch owner | — |
| event `session.state` | main to child | `{sessionId, running, pendingInteraction}` | managed session | drives the indicator and the child's list. |

**Requests and questions.** `approval.list` and `approval.request` carry both permission requests
and questions. The descriptor keeps v1's `approvalId`, `offerId`, `kind`, `prompt`, `choices` and
`expiresAt`, and adds the decision-label snapshot of §8.1: `title`, `at`, `toolName`, `callId`,
`reason` and `quotes`. A question (`kind: question`) also carries `questions[]` in DSH's shape
(`id`, `question`, `options`, `multiSelect`, optional `detail`, `header` and the plan-review
`intent`); `kind` selects `approval.answer` or `question.answer`. `callId` is null when the request
names no tool call.

**Approval answers.** `decision` is `allow`, `grant`, `reject`, `ask` or `escalate`; `risk` is
`low` or `high`; `reason` is at most 500 characters; `question` (with `ask`) at most 500; `grant`
is `{kind: exact|prefix, prefix?, expiresAt}` with an epoch-ms `expiresAt` in the future and a
prefix of at most 512 characters. The host applies today's decision rules (allow and grant need low
risk and a reason, reject a reason, ask a question) and returns the typed refusals above; a grant
answer also returns the minted `grantId` and its `expiresAt`.

**Question answers.** `answers` is `[{id, selected[], custom?}]`, one item per question, with labels
copied from that question's options; a plan review uses `approve: boolean` and `feedback` instead.
`toUser: true` sends the question to the user, and `note` adds Fishball's note. A payload cannot
carry both `answers` and `approve`/`feedback`. All bridge times (`at`, `since`, `expiresAt`,
`lastUsedAt`) are epoch milliseconds; the main host converts its ISO store values.

**Fishball's own question is a card (T09).** `question.ask` files one card in the user's pile,
through its own pile instance in the same store (`PILE_SCOPE.ownQuestions`) —
`pile.file({requestId, questionId, kind: question, sessionId, questions, …})` — and returns its id
at once, so the tool call never blocks; no timer is armed and the card has no end time. The user
answers on that card (the pile's question form) or on the child's own copy of it
(`question.answerOwn`, the `own` action of the child's answer route); both settle the one card with
`CARD_END.user`. Any other end uses `pile.settle(id, {end: dismissed | cancelled | …})`, and
`Pile.onClose` → `closeCard()` gives the child its `[card closed …]` line. The answer's words
travel back as the `QUESTION_ANSWER` inbox item (the same carrier `toUser` questions use), so the
child shows one answer row and one `answers()` entry whatever card the user answered.

In `session.start`, `session.message` and `session.redirect`, the `attachments` list carries the
`hostRef`s returned by `attachment.put`; the host consumes each ref at the same time as it builds
the message.

**Inbox (main to child).** `inbox.push` carries a message a managed session sent to Fishball, with
a dedupe key, the caller's framed text and image references. The main host's existing intake
ledger (`src/intake.js`) remains the durable queue, so a stopped child never loses a message; the
child acks each item and the host re-delivers unacked items after a reconnect with the same
dedupe key. A hand-over note arrives the same way with `kind: user`: it is the user's own words
outside the untrusted block (§8.3). Take back is a main-page action; Fishball's own release is
`session.release`.

Delivery rules (2026-11-06, with the in-process Fishball removed, §12):
- **Every producer is the ledger.** message_fishball (`kind: session`), the hand-over note
  (`user`), a managed-session change (Hand over / Take back / release, `system`), a watch notice
  (`watch`) and the notice of a permission request or question waiting for Fishball (`approval`)
  all call `IntakeLedger.publish`. Card closures and the user's answers keep their own
  `QUESTION_ANSWER` / `CARD_CLOSED` items from the approval relay (T09).
- **Durable first, then pushed.** A row is written `pending` before anything is sent; `publish`
  answers duplicate for the same source and key, and `maxQueuedInputs` bounds the open rows.
- **The row id is the bridge's dedupe key.** The child remembers delivered keys, so a row pushed
  twice (a reconnect, a restarted host) reaches Fishball's chat once.
- **Ack consumes.** The child acks only after its chat queued the turn; the row then becomes
  `consumed` and its message body is dropped (the digest stays).
- **Child down: queue, never refuse.** Hand over, Take back, watches and message_fishball do not
  answer 409 while the child is stopped. Their rows stay `pending`; on every bridge ready edge the
  relay hands the ledger the new host's `pushInbox` (`attachInbox`), and every pending row goes to
  it. The bridge host keeps an unacked item for its next connection itself.
- **Wake-up belongs to the child.** The in-process wake guard and `wakeupsPerHour` cap went with the
  in-process agent: the child's chat queues each item as a follow-up turn.
- Permission requests and questions also need the child connected to be *answered*: while it is
  down they go to the user at once (the broker's and router's `canAnswer` is the bridge's ready
  state), and the child's ready edge re-offers the live cards.

**Not in the bridge:** file writes, plugin or config changes on the main side, agent/session
objects, model calls, main credentials, shell execution. The admin operations are on the lifecycle
channel, not here.

## 6. Images and attachments

### 6.1 Channels

| Channel | Direction | What carries images |
| --- | --- | --- |
| `message_fishball` | session to Fishball | new optional `images: [{attachment_id}]`; ids must be images the **calling session's** log references. |
| `ask_fishball` | session to Fishball | new optional `images: [{attachment_id}]` from the quoted user messages of the calling session. |
| Finished-session notice | session to Fishball | the existing watch notice gains an `images` list of ids from the watched session's last assistant turn; Fishball pulls the ones it wants with `attachment.read`. |
| `read_session` / history | session to Fishball | per-message `images: [{attachmentId, mediaType, width, height, bytes}]`, never bytes by default. |
| `message_session` / `start_session` / `redirect_session` | Fishball to session | new optional `attachments: [{attachment_id, kind: 'image' or 'file'}]` from Fishball's own store. |
| Fishball chat uploads | user to Fishball | the child UI posts bytes to its own API; the child admits them into its own store. |

### 6.2 Format, limits, and 0.2.2 reuse

0.2.2 already has the whole vocabulary; we reuse it and add no new image format.

| Need | 0.2.2 API | Evidence |
| --- | --- | --- |
| Image content part | `ImageBlock { type:'image', attachment: ImageAttachmentRef }` | `dsh-llm/lib/types/types.d.ts:68-78` |
| Allowed media types | `image/png`, `image/jpeg`, `image/webp`, `image/gif` | `dsh-attachment/lib/types/types.d.ts:5` |
| Durable, content-addressed id | `ImageAttachmentRef.attachmentId` (`types.d.ts:7-20`); file ids are the sha256 of the bytes (`:34-41`) | `dsh-attachment/lib/types/types.d.ts` |
| Admission and normalization | `saveImage`, `saveImages`, `admitPromptContent`, `readImage` | `dsh-attachment/lib/types/index.d.ts` (`AttachmentStore`) |
| Defaults | 20 images/message, 4 194 304 pixels, 4 194 304 normalized bytes | `dsh-attachment-local/lib/index.js:978-1016` |
| Capability gate | reject when the route's model lacks `image` in `inputModalities` | `dsh-api-session-controller/lib/index.js:848` |
| Request budget and placeholders | `requiredImageOffload`, `projectOffloadedImages`, `projectImagesForTextModel` | `dsh-llm/lib/types/content.d.ts` |
| File blocks stay text for models | `projectFilesToText`, `fileHandleText` | `dsh-llm/lib/types/content.d.ts` |
| Reading an image by reference | `attachments.readImage` and base64; 0.2.2 does not verify Session references, so the bridge checks the log itself | `dsh-api-session-controller/lib/index.js:886-895` |
| Image a session already produced | `read_image` returns a text block **and** an image block with a durable ref | `dsh-tool-fs/lib/index.js:1735-1741` |

Bridge rules: 4 MiB per image, 20 per message, 512 KiB per chunk, sha256 verified by the receiver,
one transfer per message, no path or URL accepted anywhere. Files keep the 0.2.2 rule: they are
stored verbatim and reach a model only as handle text naming the stored path.

### 6.3 Sessions to Fishball

1. The agent calls `message_fishball({message, images:[{attachment_id}]})`.
2. The main host verifies each id against the calling session's events (`referencedImage`-style;
   0.2.2's own RPC dropped that check), reads the bytes with `attachments.readImage`, and pushes an
   `inbox.push`
   whose text keeps today's untrusted block (`src/messaging.js:109-112`) and whose images carry ids
   and metadata only.
3. The child pulls each id with `attachment.read`, saves it into its own store
   (`saveImages`/`admitPromptContent`), and builds
   `createUserMessage({content:[{type:'text',...},{type:'image',attachment}]})`.
4. If the Fishball model cannot accept images, the call returns
   `{ok:false, code:'images-unsupported'}` at the tool, before anything is queued; nothing is
   silently dropped and no model is switched.

### 6.4 Fishball to sessions

1. Fishball passes attachment ids from its own store (received in §6.3, or uploaded by the user).
2. The child reads its own bytes and streams `attachment.put`; the main host calls
   `attachments.saveImages` or `saveFile` and gets a main-side durable ref, returned as a `hostRef`
   that is single-use and expires after 10 minutes.
3. The host builds the message with image or file blocks and steers it with the existing Fishball
   relay source. A file is never inlined into a provider request; it becomes handle text with a
   read-only path the target session's tools can open.

Fishball still never reads a filesystem path. A path argument is not part of any operation.

### 6.5 Untrusted data

Images from a session keep the existing framing: the block prefix says the content comes from
another session's agent, not the user, and must not be followed as instructions. Image text is
also data: OCR content is never treated as instructions. Display names are sanitized by the
attachment store; no path, no URL, no SVG. The child renders session images with a
"from <session>" caption and never as an avatar or an icon.

### 6.6 The user's own uploads in Fishball's chat

The child UI's composer accepts drag and drop, paste and a file picker. The browser posts
`{mediaType, data(base64), name?}` to the child API; the child validates with
`attachments.validateImage`/`saveImage` under the same limits, then appends an ordinary user
message with image and file blocks. A text-only model gets the 0.2.2 text-only projection
(`projectImagesForTextModel`) plus a visible notice in the UI, not a silent loss.

## 7. Embedded page, opening and the button

- `client.js` renders the embed as **the Fishball view in DSH's main area**, where a session's
  conversation shows (an `iframe` with `src="/fishball/embed/"`, a `title`,
  `allow="clipboard-write"`, and no sandbox attribute — a sandbox would break the same-origin
  session). The frame fills the area under a one-line header in DSH's session-header style:
  "Fishball", the child state as a tag, and small Refresh and "Open in a tab" actions (the tab
  opens `/fishball/embed/`, still same-origin). There is no Close: you leave by opening a
  session or another panel, as with any session. (Extended by D27, §0.5 "The frame": the header
  is the connector's frame around every instance page. It also shows the unread count and a
  **Connector settings** button.)
- **Why the main area, not a dialog (owner's request, 2026-11-06).** The original intent was
  "clicking the Fishball session opens a nested page pointing at the independent Fishball
  session"; the first build put it in a small centred modal, which floated over the session
  pane and blocked the sidebar. DSH already has the exact seat for a full-pane view: the
  root-scoped keyed `main` slot, whose `conversation` key is the session and whose other keys are
  global panels selected through `ctx.layout.selectPanel(id)` (Plugins `plugins`, Tasks
  `schedules`). Opening a session calls `selectPanel(null)` (`dsh-client-ui-workspace`
  `replaceMain(..., "reveal")`), so navigating away needs no code of ours, and re-selecting
  Fishball mounts the view again. 0.2.1-rc.5 and 0.2.2-rc.1 have the same contract (layout
  `MainPanel`/`selectPanel`/`retainMainPanels`; 0.2.2 only wraps the slot in a flex `mainPanel`
  div), so there is one implementation with no feature detection.
- **Entries.** By default the sidebar has a Fishball row in DSH's panel list
  (`sidebar.panellist`, id `fishball`, order −10, above Plugins), drawn by DSH with its own
  selected highlight and `aria-current` while the view is open; its icon is the brand mark with the
  unread count. The top-left brand button opens the same view. Fishball's settings page has a
  "Sidebar entry" switch (owner's choice, 2026-11-06: "a row by default; settings can switch to
  only the top-left button"), stored with the brand icon (`POST /api/fishball/sidebar-entry`,
  `{entry:'panel'|'brand'}`). The `main` key stays registered either way, so the brand works
  without the row. On macOS Desktop the brand row has no button, so there the row is the way in.
- The per-session green/yellow dots and the running fish stay on managed **session** rows only:
  they describe one main session, and the Fishball row is not one (Fishball's own cards carry
  Fishball's session id, which no row shows). Fishball's own unread count stays on its mark.
- The `POST /api/fishball/native/open` route and its capability URL (`src/native-web.js`) are
  removed; the lifecycle still exposes status.
- When the child is not ready (or while its status is read) the view shows, centred in the same
  area and in DSH's empty/error-state style, the state, the safe code (`NATIVE_CHILD_EXITED`,
  `NATIVE_TIMEOUT`, ...), and Retry as the §8.5 accent button. Retry calls the existing restart
  service, never a legacy fallback.

## 8. Main-DSH session UI

### 8.1 Decision labels move into Fishball's chat

Today: Fishball's own chat timeline is DSH's conversation renderer (`dsh-client-ui-conversation`),
and each decision writes a tag record (`src/tags.js`; writes at
`src/approvals.js:397,465,878,1182`) that `client.js:3376-3389` renders inside the managed session's
turn tail (`conversation.chat.turnTail`, `client.js:172`). That is the trail the user dislikes.

After (built in T08): the label is a child-side timeline entry (`src/slim/child/approvals.js`
records it, `src/slim/ui/approvals.js` renders it, `src/slim/child/decisions.js` keeps it across a
child restart), one compact row such as "Fishball asked about <session> and allowed it once",
expanding to the request card (tool, session, exact arguments when the host has them) and
Fishball's reply. A call that ran on an approval already given is its own row ("ran on Fishball's
one-time approval", "ran on your one-time approval", "ran on Fishball's standing grant"),
delivered as the `approval.ran` event. The host stops writing tag records; `SLOT.turnTail` no
longer renders them. The decision audit list that used to sit on Fishball's settings page is
gone with the same rule: settings keeps only the question mode.

Bridge data for each record: `decisionId`, `kind` (message, start, redirect, stop, approval,
grant, question, plan review, escalation), `sessionId` and title, `at`, the request snapshot
(`toolName`, `callId`, prompt and choices, reason, quoted user messages), Fishball's answer text,
the outcome, and — for escalations — the user's final decision delivered by `approval.settled`.
The child owns placement and rendering; the host owns authorization and outcomes.

### 8.2 Sidebar mark: idle marker now, fish-under-spinner after upstream

Q13 answered: wait for DSH upstream support. The CSS approximation keyed to `data-row-key` is
rejected, so nothing in this design paints the sidebar through DSH's row internals.

**Ships now (T13a).** The managed-session marker renders only in DSH's
`sidebar.session.row.leading` slot, which DSH mounts when the row's primary status is idle
(`dsh-client-ui-workspace/lib/client.js:2535,2609`). It shows the Fishball fish plus the green
unread dot and the yellow needs-action dot at the top-right; needs-action wins when both apply.
While a session runs, DSH shows its own spinner and no Fishball mark. Under
`prefers-reduced-motion: reduce` nothing animates; the dots and the accessible name carry the state.

**Later (T13b, blocked on upstream).** The accepted target layout: the fish is the base layer in
every managed state; DSH's hollow running spinner draws above it and the fish shows through its
centre; the dots stay at the top-right; the fish flips, and with the DeepSeek-icon switch on the
orca plays 0.2.2's own swim.

**Why the target waits.** Evidence:

- The leading cell is one 16x20 inline-flex span (`dsh-client-ui-workspace/lib/client.js:1955`).
- It renders DSH's `SessionStatusDots` whenever the primary status is not idle, and the
  `sidebar.session.row.leading` slot only when it is idle
  (`dsh-client-ui-workspace/lib/client.js:2535,2609`). The slot is unmounted while running, so no
  plugin element can sit under the spinner.
- The hover slot lives inside the hover card (`dsh-client-ui-workspace/lib/client.js:2418`) and
  the row-action slot is hover-only (`dsh-client-ui-workspace/lib/client.js:2663`); neither
  mounts in the leading cell.
- The spinner is `StateDot` for `ongoing`: a 14px SVG in
  `dsh-web-frontend/dist/assets/index-BgUyXZcc.js` (the `ongoing` branch, one minified line) whose
  track and arc are `fill:none; stroke-width:2` in
  `dsh-web-frontend/dist/assets/index-lh_YM6sT.css` (one minified line) — a hollow ring, as assumed.
- The row exposes a stable `data-row-key="session:<id>"` (`dsh-client-ui-workspace/lib/client.js:2560`),
  which would allow a CSS layer, but Q13 rejects that approximation.

**0.2.2 does not unblock T13b.** The leading slot is still idle-only
(`dsh-client-ui-workspace/lib/client.js:2535,2609`). 0.2.2 adds an always-mounted
`sidebar.session.row.trailing` slot (`:2635`, registered `:6066`), but it renders next to the
timestamp in the right-hand resting area, not under the leading spinner, so it is not the target
placement; it is useful as precedent in the upstream request.

**Upstream request (ready to file, not filed).** Either render
`sidebar.session.row.leading` in every state and draw DSH's status dot/spinner above it, or add a
`sidebar.session.row.accessory` slot rendered inside the leading cell in every state. The slot
must be mounted for idle and running rows, the status dot must paint above it, the cell stays
16x20, and rows without contributions are unchanged. Then the fish is an ordinary slot element,
the spinner overlays its hollow centre, Fishball's dots and `role="img"` label live in the same
element, and the orca SMIL swim runs unchanged.

Reuse, do not redraw: the orca morph is 0.2.2's `HeroFish` — `FISH_LOGO_PATH`,
`HERO_SWIM_UP_PATH`, `HERO_SWIM_DOWN_PATH`, a SMIL `d` animation over 1.6 s
(`dsh-client-ui-conversation/lib/client.js:20394,20406`) with the CSS sway
(`dsh-client-ui-conversation/lib/client.js:20314`, gated by hover and reduced-motion media
queries). The Fishball client should import `FISH_LOGO_PATH` and `FISH_LOGO_VIEWBOX` from
`dsh-client-ui-primitives` instead of keeping its own copy (this repository's `client.js:32`
already imports from that package; the current `ORCA_SWIM` copy at `client.js:474` is replaced).

The "DeepSeek icon" condition is Fishball's existing switch (`client.js:1688,3413`, host
preference `brandStyle`), not a DSH theme setting. 0.2.2 ships no such user setting: the official
brand package is presentation only (`dsh-client-ui-brand-official/lib/index.js:3-8`, an empty
`apply`), and the only icon choice found is Fishball's own.

### 8.3 One hand-over button

Current header buttons: "Tell Fishball when finished" (`client.js:2652`, `WATCH_HEADER` 66),
"Send to Fishball" (`client.js:2538`, `SEND_HEADER_ID` 74) and "Hand over to Fishball"
(`client.js:2706`, `MANAGE_HEADER` 79), registered at `client.js:4140-4142`; the same flows exist
as session-menu items (`makeSendMenuItem` 2529, `makeWatchMenuItem` 2641, `makeManageMenuItem` 2690,
registered 4144-4148).

After: only "Hand over to Fishball" (and "Take back from Fishball" when managed). Clicking opens a
small dialog with an optional note ("watch it and tell me when it is done", "approve builds and
tests"). Confirming makes the session managed and forwards the note as the **user's own words**,
in the existing notice (`TEXT.forwarded`, `src/messaging.js:114-119`: "The user's note: ..."),
which is not inside the untrusted block. The note is bounded by `maxMessageBytes` and is optional.

What replaces the other two flows: hand-over with the note covers both. Watch-only (watch a
session Fishball does not manage) is dropped; send-only (forward a note without managing) is
dropped because forwarding already made the session managed (`src/messaging.js:203-221`). If the
user wants watch-only back, it becomes a hand-over note rather than a separate button (Q11).

### 8.4 Fishball's session is read-only

Fishball's own session is created with the read-only permission preset and `approval: ask`; the
child exposes no permission switch in the composer and rejects any request that would change the
session's preset (admin API included), and no bridge operation can change it. Because the child's
sandbox is `read-only` and its workspace
is the private runtime workspace, file-mutating tools fail at the sandbox rather than at a UI
convention. Installing plugins into Fishball is a host action of the settings page, not a model
tool, so read-only costs nothing there.

### 8.5 One Fishball button style

Today's Fishball-accent buttons are filled magenta by the `.fb-...accent` rules
(`client.js:1602-1603`, constants `FISHBALL_COLOUR` at `client.js:369-375`). Every call site:

| # | Call site | Button |
| --- | --- | --- |
| 1 | `client.js:1889` | Recommended plugin · Install |
| 2 | `client.js:1896` | Recommended · Turn on |
| 3 | `client.js:2122` | Install dialog · Install |
| 4 | `client.js:2140` | Install dialog · Install (confirm) |
| 5 | `client.js:2160` | Install done · Open plugin page |
| 6 | `client.js:2173` | Build blocked · Allow scripts |
| 7 | `client.js:2174` | Install failed · Retry |
| 8 | `client.js:3744` | "+ Install for Fishball" |
| 9 | `client.js:3975` | Limits form · Save |

Sites 3 to 7 go through the `accent()` helper (`client.js:2104`). Switches inside the same wrapper
(`client.js:3676`, rules `1607-1609`) are switches, not buttons; they keep the magenta knob.
For completeness, these Fishball buttons use DSH's plain `primary`, `outline` or `ghost` and are
**not** restyled: pile Allow (`client.js:2953,3112`), model gate "Open settings" (`2486`), settings
Save (`2239`, `2351`), send dialog (`2573-2574`), notice Close (`2671`), Adopt (`1851`), mode
radio (`3192`), uninstall (`4039`).

After: one shared token and one helper. `FISHBALL_ACCENT = '#EC0A6E'` (already `FISH_MARK.eyeColor`)
is exposed once as `--fb-accent` on the plugin root; a single `accentButton` helper renders DSH's
`Button` with `variant: 'secondary'` (DSH's normal background and text) plus class `fb-outline`
whose rule is `box-shadow: 0 0 0 1px color-mix(in srgb, var(--fb-accent) 55%, transparent)`;
DSH's hover and active states come from the variant, focus-visible is unchanged. The fill, text and
hover constants are deleted. Light and dark both work because the ring mixes the accent with the
current surface rather than a fixed white. The restyle lands in the new settings page (§9); legacy
copies are deleted, not restyled.

## 9. Settings page and admin

The Plugins → Fishball → settings page is rebuilt around the isolated Fishball:

- Status and restart, with the safe state/code the host already exposes.
- Model: provider/model/reasoning effort from the child's own catalog; applies through the admin
  API and takes effect on the next request.
- Plugins: list the child's installed packages, enable/disable, install (spec or market entry),
  uninstall; everything targets the child's profile; nothing touches the main profile.
- Settings: the child plugin config forms that the page can render; limits that belong to Fishball.
- Provider sync: the Model block's **Refresh models** also syncs API-key providers from the main DSH (§10).
  (Superseded by D26: the sync button is on the `fishball-instance` Plugins card in the main DSH,
  and the instance's settings page has none.)
- No legacy sections (intake, outbox, watches, approvals, hidden tools, main plugin catalog) —
  those concepts are either main-side or gone. The intake, outbox and watches blocks' leftover
  client code (renderers, strings and the unused watches/remove request) is removed; their
  services and HTTP routes stay for Fishball's tools.
- Kept from the approvals section: the question mode (Auto / Fishball / You) with its one-line
  description, the one decision setting left on this page. The decision audit list is not here:
  every decision is an inline label in Fishball's chat (T08, §8.1).

Admin API: owner-only same-origin routes (`/api/fishball/native/admin/*`) go to the lifecycle
control channel and then to the child admin service. The child applies changes with its own
`settings.mutate`, `credentials.modifyRecord` and `pluginManager` (all rows are in `dsh-base`,
`dsh-base/cordis.patch.yml:20,105,109`). The page never writes the child's files directly.

## 10. Provider sync into the isolated home

**Flow (D26, second amendment of 2026-11-06).** There is no switch and no automatic sync. The
"Model for Fishball" block of the `fishball-instance` Plugins card in the main DSH
(`packages/instance/client.js`) has one button, **Check for new models**. It is the only place a sync
starts; the instance's settings page in the iframe has no sync button.

1. **Fetch once.** A press posts `POST /api/fishball-instance/models/check` (no body), an owner-only
   Fetch route of the instance's main half. The host runs one preview
   (`ProviderSyncCoordinator.preview()`) against the child over the lifecycle wire and answers
   `{checkId, missing: [{id, name, models: [modelId…]}], notOffered: [{id, name, reason}],
   present: n}`. Concurrent presses share the check in flight.
2. **Choose.** The card lists `missing` with one checkbox per entry, all ticked by default. Each
   entry shows the provider's name and its model ids. A collapsed "Not offered (k)" list shows
   `notOffered` with its reasons, and one quiet line counts `present` ("3 already in Fishball").
   With nothing missing the card reads "Nothing new to add" and shows no list. **Add selected** is
   disabled while nothing is ticked. **Cancel** clears the list; the host lets the preview expire.
3. **Write only the chosen ones.** **Add selected** posts `POST /api/fishball-instance/models/add`
   `{checkId, ids}`. The host calls `coordinator.confirm({previewId, ids, confirmed: true})`, which
   already refuses an id outside the preview's `add` group (`invalid-selection`). Only then does it
   read the keys of exactly those entries and send them to the child. The card replaces the list
   with the result line ("Added 2 · 1 failed") and a collapsed Details list of every non-added
   entry with its reason. A partial success is reported per entry and is never rolled back.

**The unit of choice is a provider entry**, not a single model. The engine copies a provider
profile (its endpoint, protocol and model list) and its key as one create-only write, and a key
belongs to the provider, so splitting a provider's models would need a partial-profile write that
the add-only rule does not have.

**How "the instance lacks it" is computed.** It is the preview's `add` group, as the child's
engine (`ProviderSyncEngine.preview`, `src/provider-sync.js`) computes it over the main host's
inventory and the child's own settings and credentials, at the moment of the check:
- the child has no provider with that id → the whole entry is missing (profile and key);
- a built-in route that the child has with no override and no key → only the key is missing
  (the route is adopted first if dormant, as in the rules below);
- the child already has it with the same profile, or already has a key for it → `present` (not
  listed);
- the child has a different profile under the same id → `notOffered` `provider-conflict` (kept,
  never overwritten);
- not copyable (an OAuth login, an unset `apiKeyEnv`, custom headers, a version or schema
  mismatch, no revision) → `notOffered` with its reason.

The entries come from the main DSH's API-key providers only, those with a stored key and those
whose key comes from `apiKeyEnv`. Nothing is stored about a past check: each press computes the
set afresh, so the list always shows only what is missing now.

**Detached or restarted mid-flow.** The preview is bound to the child's wire `connectionId` and
identity. The coordinator is closed with the bridge when the wire goes away.
- During the check: the check fails with its code (`child-sync-disconnected`, `sync-closed`), shown
  inline. The button is disabled, with the hint "Fishball is not running", until the instance is
  `ready` again.
- Between check and Add (child restart, Retry, the instance stopped because the connector was
  disabled, D25, or the instance disabled): Add is refused before any key is read
  (`repreview-required`, `preview-expired` or `sync-closed`). Nothing is written. The card clears
  the list and says "Fishball restarted. Check again." The same happens when the list is older
  than the preview's 5-minute life, or when the main DSH's providers changed in between
  (`repreview-required`).
- During Add: the chosen keys go to the child in one `import` request. If the wire is lost before
  its answer, the host cannot know which writes the child committed. Every entry of that request
  is reported `failed` `result-unknown` and is not retried (the coordinator's existing rule). Writes
  that did commit stay (add-only, create-only). The card says "Check again"; the next check lists
  only what is still missing.
- The instance disabled: its card and routes are gone, and the host closes the coordinator.

**Why (history).** The first slim build had pairing plus preview-and-confirm, which the user found
"a mess". The first 2026-11-06 amendment dropped all choice ("Refresh models" wrote everything at
once). The follow-up added a `providerSync` consent switch. The user then replaced the switch with
this button: "不是加开关，是加个按钮，按下就抓取同步一次，只做增量，抓取本地没有的模型信息，让用户选择加入"
(D26). Pairing stays gone, because the main DSH starts and owns the child over an authenticated
wire. The preview and confirm come back, but only as one list on one card.

Rules that stay (`src/provider-sync.js`, `src/provider-sync-host.js`, unchanged in substance
except the env-key change below):
- API-key providers only. A login (grant record) is never copied; it is reported as
  `oauth-login` ("log in inside Fishball"). Custom headers and any other unknown profile field
  are `unsupported-provider`.
- Env keys (changed 2026-11-06, user decision: "做成可以从main profile处model过去，包含key的配置";
  this reverses the earlier "ambient/env keys are not copied" rule). A provider whose profile names
  its key through `apiKeyEnv` is copied with its key. The child's environment differs, so the
  reference itself is never written there: the main host resolves it in its own process through
  `ctx.credentials.resolve` (the same order pi-ai uses: managed store, process environment, `.env`
  files), and the child stores the value as a plain API-key record in its own `credential-local`
  store, next to a profile without `apiKeyEnv`. Inventory only describes the reference
  (`ctx.credentials.describe`); the value is read only in the coordinator's confirm step. While
  the variable is unset or empty in the main process, the provider is skipped as
  `api-key-env-unset`. An `apiKeyEnv` outside DSH's reference grammar is still refused, as before.
- Additions only: an existing or conflicting provider or key in the child is skipped and kept.
- Re-checks: the coordinator re-reads the source inventory before and after reading records; the
  engine re-checks the child's identity, version, schema, namespace revision and owner generation
  before every write, and the record write is create-only inside the credential lock.
- A child restart between preview and confirm voids the preview (`connectionId` changes).
- Storage is DSH's `credential-local`. Keys travel only main host → wire → child host. The browser
  gets, per provider, `{id, name, models?, outcome?, reason?}` (D26 adds the model ids, so the
  user can see what they choose) and the opaque one-use `checkId`. It never gets a key, a mask, an
  endpoint, a protocol or the name of an environment variable. Nothing is logged, neither keys
  nor the list.
- Built-in routes (added 2026-11-06, user decision): a key entered for a route the adapter ships
  (no override, an API-key sign-in method, a fixed endpoint) is copied if the child has the same
  route with no override and no key. pi-ai serves only routes listed under `providers`, so a
  dormant child route is first adopted the way DSH's Models page does it (`providers.<route> =
  {}`, revision-checked, create-only), then the key is written create-only; an already adopted
  route gets the key only. A route whose endpoint is built from environment variables is not
  copied (the other home's environment differs).
- Schema comparison: `settings.describe()` serialises schemas with Schemastery's process-global
  uids, which differ on every describe and between processes. The host fingerprints the schema
  after renumbering those uids by the library's own rebuild walk, so identical schemas match and
  any real difference still does not (fix of 2026-11-06; before it, every route was skipped as
  `incompatible-owner-or-schema`).
- Incremental: after a full Add, the next check lists nothing ("Nothing new to add"). Concurrent
  Check presses share one check. An Add while another Add runs is refused `sync-busy`; the
  button is disabled while it runs.
- An `unknown` item is never retried in the same Add; the next check previews afresh.

Outcome per chosen provider: `added`, `skipped` (reason, for example lost a race to an entry
created meanwhile) or `failed` (reason). Unchosen entries are not written and are not reported.
A whole-run failure shows inline with "Check again". The button is disabled with a hint while the
instance is not `ready`. One help line under the block says that the child's model catalog
validates what was added, which may read keys set for its other providers (the SDK-global
`modelCatalog` caveat). The added models reach the instance's composer through the child's own
settings change, as an edit on DSH's Models page would.

Removed: `src/provider-sync-channel.js` (the loopback pairing listener), `registerProviderSync`
and its `/api/fishball/provider-sync` owner route in the main row (invite, begin, approve,
finish, close), the old `preview`/`confirm` routes and `ProviderSyncSlot` with its strings. Removed
by D26: the one-step `ChildProviderSync.sync()` and its route `/api/fishball/native/provider-sync/sync`,
the `providerSync` switch, and the upward wire request `providerSync.request`. The service keeps
`check()` (preview, mapped to the browser shape) and `add({checkId, ids})` (confirm) over the same
coordinator.

## 11. Failure modes and UX

| Condition | Main page | Embed | Data |
| --- | --- | --- | --- |
| Child not started (`disabled`) | status Disabled; no embed button | not offered | retained |
| Starting | status Starting; spinner | "Starting Fishball..." then auto-retry once | retained |
| Crashed or exited | status Failed and code; Restart | error card and Retry | retained; inbox queued |
| Child unreachable (auth or port) | Failed `NATIVE_UNAVAILABLE` | error card and Retry | inbox queued |
| Child slow (SSE idle) | — | "Reconnecting..." banner, retries with backoff | session state from the baseline |
| Bridge operation refused | — | inline tool result, not a crash | no retry |
| Main DSH shutting down | — | closed with the page | existing bounded child stop |

No state ever falls back to legacy Fishball, and no error text includes a URL, token or path.

Diagnostics: the child's stderr goes to `<DSH_HOME>/fishball/runtime/child-stderr.log` (private,
0600), next to the code-only `lifecycle.log`. Each file is capped at `RUNTIME_LIMITS.maxLogBytes`
(64 KiB) and rotates once to `child-stderr.log.1`. Lines are redacted before they are written:
Authorization/Bearer values, key/token/secret/password assignments and any long opaque run are
replaced with `[redacted]` (`src/native-runtime/stderr-log.js`). stdout stays discarded.

## 12. Legacy retirement

**Done 2026-11-06 (user: "旧版可以整个删除，直接全面转向新版"; "旧版不用去想怎么兼容").** The
in-process Fishball is deleted, not adapted, and nothing migrates its state:

- Its agent and session (`src/lifecycle.js`, `src/composition.js` and the persona/prompt rows it
  mounted), its private plugin tree and catalog (`src/plugin-catalog.js`, `plugin-defaults.js`,
  `plugin-tools.js`, `plugin-settings.js`, `fishball-packages.js`, `fishball-plugin-manager.js`,
  `builtins.js`, `bundle-rows.js`, `checked-tools.js`, `row-ids.js`, `tool-attribution.js` and its
  `fishball-attribution` row), its context window and compaction (`context-window.js`,
  `context-policy.js`, `compaction.js`), its own requests (`own-requests.js`), plugin sources
  (`sources.js`, `ctx.fishball`), the unchecked-tools notice, the unread count and the welcome card.
- Its outbound tools (message_session, start_session, stop_session, redirect_session) and their
  outbox: the child does that through the bridge's `session.*` operations.
- Why it had to go: with the main row composing again on 0.2.2 (B1), the in-process agent took every
  hand-over note, message_fishball and permission request, set watches and escalated on its own,
  while the child the user sees received nothing (B7). Two Fishballs is not a fallback; it is a bug.
- Main-side UI removed with it (each existed only for the deleted agent): its chat's dock (the
  pile, the grants list and Revoke, the welcome card, the model gate, the managed banner inside its
  chat), its header Settings action and read reporter, the composer model-seat hiding and its own
  row hiding, the Messenger look, and the Plugins page's Fishball tab, "Install for Fishball"
  dialog and the Fishball tag/switch on each plugin's page. The user chose to delete the pile
  (2026-11-06): a card that goes to the user is answered in its own session (the ask_fishball row's
  Allow once / Reject, DSH's question card), and a standing grant is revoked by asking Fishball.
- Session questions and plan reviews (N3, option A, 2026-11-06): the user answers them only in
  their own session, on DSH's question card. The pile's question form went with the pile, so its
  answer path is removed too (`client.js` `answerQuestionCard` and its `questionError.*` copy,
  `QuestionRouter.answerCard`; the main row never served `POST questions/answer`). The card record's
  `place: pile` is therefore unreachable for session questions; it stays in the schema for
  permission cards and Fishball's own `ask_user` card, and `QUESTION_END.pile` stays only so older
  audit rows still parse.
- Kept on the main side, as the "body": the brand and the Fishball view (§7), the settings page
  unchanged (native status, model, child plugins, child settings, brand, question mode, limits),
  Hand over / Take back, the managed-session row marks, the ask_fishball row, and behind them the
  intake ledger, managed registry, watches, approval broker, question router, grants, passes and
  result wording. The four "feature" switches are gone: Hand over, watches and permission requests
  are always on.
- Stored data of the removed agent is not read: its tables are simply no longer declared, and a
  record in a kept table that no longer parses is moved aside (`invalidRecords: 'backup-and-skip'`).

## 13. Risks

1. **Same-origin iframe means no script boundary.** Any main-page plugin can read or drive the
   Fishball UI. The isolation claim is process, data and deployment isolation, not confidentiality
   from the main page. Accepted (D13).
2. **The child's bearer lives in main-process memory.** It is not persisted and rotates per
   instance; a compromised main process already owns both sides.
3. **Loopback port exposure.** The child refuses all requests without the bearer, but any local
   process can still attempt connections; rate limiting and 401 are the only defense.
4. **A DSH core upgrade may move rows we depend on** (`dsh-base` row ids, `profileContext`,
   `agents` and `sessions` contracts). The design pins 0.2.2-rc.1 contracts and keeps rc.3 compatible where the contracts are unchanged.
5. **The running-state fish is blocked on a DSH slot change** (§8.2): while a session runs, DSH
   renders its spinner in place of the plugin slot. Q13 waits for upstream; the idle marker with
   the dots ships now, and no CSS override of DSH's row internals is used.
6. **A purpose-built chat UI is less capable than DSH's** at v1 (markdown, tool cards, plan review,
   attachment previews). It is Fishball-owned, so it can catch up incrementally.
7. **No tests are written here.** Acceptance depends on the separate testing session.
8. **Provider sync writes are not transactional across config and credentials** (already accepted
   in the v1 design); the child adds one more hop, not a new guarantee. Since D26 the user
   chooses the entries to add from a fresh list of what is missing, and a partial success is
   reported per entry.

## 14. Open questions (each needs one answer)

Answered on 2026-11-05; the numbering stays stable and every question now has an answer. The user
accepted the recommended answer for Q1, Q2, Q4, Q8, Q9, Q10, Q11 and Q12; Q3, Q5, Q6, Q7 and Q13
were answered earlier.

- Q1 -> the live card stays only in that managed session's pile on the main DSH; Fishball's chat
  carries a mirror label, not a second answerable card (§4, §8.1).
- Q2 -> refuse with `images-unsupported` before anything is queued; nothing is silently dropped and
  no model is switched (§6.3).
- Q3 -> D13: the user accepts that a main-page plugin can script the same-origin embed.
- Q4 -> the DSH plugin market index for discovery, plus a manual package spec; no fixed recommended
  list (§9).
- Q5 -> D11: the fish layout is the target; the running case waits for DSH (see Q13).
- Q6 -> settled by the Q5 wording "when that toggle is on": Fishball's existing "Use the DeepSeek
  icon" switch.
- Q7 -> settled by the Q5 instruction "Keep the reduced-motion rule": static marker, dots and an
  accessible name.
- Q8 -> every outbound message and every permission, question or escalation decision gets one
  compact label; routine sends are included, and the single-row form keeps the timeline readable
  (§8.1, `DEC-04`).
- Q9 -> OAuth providers are logged in inside the embedded page's own minimal settings area; the
  main settings page never handles OAuth credentials, which stay in the child's own home (§2.3, §9).
- Q10 -> plain modern JavaScript with no build step; a UI change is one file edit in the isolated
  Fishball (§2.1).
- Q11 -> yes: watch-only and send-only are dropped; hand-over with an optional note covers both,
  and a watch-only request becomes a hand-over note (§8.3).
- Q12 -> reloading the page is acceptable: the child stops with the main DSH, so a main restart
  starts a new child and re-mints its bearer (§2.4, §11).
- Q13 -> wait for DSH upstream support; no CSS approximation. T13a ships the idle marker with the
  dots now; T13b is blocked on upstream (§8.2, §15).

## 15. Task breakdown for parallel single-task sessions

Rules for every task: one branch, one deliverable; do not read or write another task's files; the
separate testing session owns all test code; merge before the dependants start. All tasks target
DSH 0.2.2-rc.1; rc.3 compatibility is checked only where the contract is unchanged and never adds
scope. `client.js` is a single DSH client module, so **at most one task per wave may own it**
(marked `[client]`).

### Wave 1 — contract (DONE; one task)

**T01 — Freeze the slim contract and this design `[contract]` — DONE**
- Goal: one place that defines every operation, frame, limit, error code and route both sides use.
- Branch: `feat/slim-contract`, cut from `feat/slim-native-embedded-ui` (current tip).
- Owns and touches nothing else: `src/slim/contract.js`, `src/slim/limits.js`,
  `docs/slim-native-design.md`.
- Provides: envelope v2 (adds `attachment.*`, the full approval/question/prompt/grant answers,
  `session.release` and the decision-label snapshot), the exact operation allowlist from §5.2,
  payload validators for every request, response and event, error codes, the status model,
  `/fishball/embed/*` route names, and the bearer rules.
- Depends: none.
- Acceptance criteria:
  1. `src/slim/contract.js` exports envelope v2, the §5.2 operation allowlist, validators for
     every request, response and event, and the error-code and status constants.
  2. `src/slim/limits.js` exports every numeric limit named in §3.6, §5.2 and §6.2.
  3. Route names and bearer rules are constants in the contract module.
  4. The doc names 0.2.2-rc.1 as the baseline, and every citation is verified against that build.
  5. `node --check` passes on both modules; they import no DSH package and hold no behaviour beyond
     validation and constants.
  6. No test file and no file owned by another task is touched.
- Tests: `CONTRACT-01 envelope rejects an unknown key`; `-02 unknown operation rejected`;
  `-03 oversize frame rejected`; `-04 capability mismatch rejected`.
- Done 2026-11-05: local commits on `feat/slim-contract`; the contract and limits live in the two
  modules named above, and §14 is fully answered.

### Wave 2 — runtime and child app (parallel)

**T02 — Slim child runtime `[host]`**
- Goal: the child boots a base-only profile plus the Fishball app row, and readiness means core
  plus server, not web UI.
- Owns: `src/native-runtime/*` (constants, installation, overlay, index), `native-child.js`.
- Depends: T01. Acceptance: `dsh` 0.2.2-rc.1 starts with the base-only profile, the app row mounts, the
  lifecycle reports ready, stop/restart and the parent-pipe exit path still work, and no
  `webServer` or `webApp` injection remains. The app row itself is T03.
- Tests: `LIFE-01 base-only profile reaches ready`; `-02 missing app row fails loud`; `-03 stop is
  bounded`; `-04 parent exit stops the child`; `-05 snapshot contains the slim app`.

**T03 — Child app, server and embed auth `[child]`**
- Goal: the child serves its page, API and SSE on loopback, accepts only the parent bearer, and
  exposes the embed endpoints.
- Owns: `src/slim/child/app.js`, `server.js`, `auth.js`, `src/slim/ui/shell.html`.
- Depends: T01. It implements the row T02 inserts and the pair is verified together at wave merge;
  no T02 file is edited here.
- Tests: `SRV-01 401 without bearer`; `-02 rotated bearer rejected`; `-03 SSE heartbeat and
  reconnect`; `-04 CSP headers`; `-05 no-store on shell`; `-06 embed endpoints exist`.

### Wave 3 — bridge, embed, admin, reminders (parallel; one client task)

**T04 — Embedded page `[host]` plus `[client]`**
- Goal: the Fishball button opens a panel that frames the child's page through the main origin.
- Revised 2026-11-06 (owner: "display it like a normal session"): the panel is a `main`-slot view in
  DSH's main area instead of a modal, with a sidebar panel-list row by default and a setting for
  the brand button only (§7 has the why). The embed security rules below are unchanged.
- Owns: `src/slim/host/embed.js`, the embed component in `client.js`.
- Depends: T02, T03. Acceptance: the iframe URL has no token; the route rejects non-same-origin and
  unauthenticated requests; SSE streams through; a stopped child yields a 503 error card with
  Retry; no new tab.
- Tests: `EMBED-01 authenticated same-origin document`; `-02 cross-origin rejected`; `-03
  unauthenticated 401`; `-04 SSE passthrough`; `-05 child down 503 and Retry`; `-06 no token in URL
  or page storage`.

**T05 — Bridge v2: sessions and messages `[host]` plus `[child]`**
- Goal: Fishball can list, start, message, redirect, stop, read and watch main-DSH sessions
  through typed operations.
- Owns: `src/slim/host/bridge.js`, `src/slim/child/bridge.js`, child tool definitions.
- Depends: T01, T02. Acceptance: every operation in §5.2 works against a disposable main DSH;
  authorization refuses unmanaged sessions; delivery dedupe and "never retry unconfirmed" hold;
  reading is bounded; starting never creates a folder.
- Tests: `BRIDGE-01 list managed sessions`; `-02 start in an existing folder`; `-03 start refuses a
  missing folder`; `-04 message delivered once`; `-05 unconfirmed is not retried`; `-06 read is
  bounded`; `-07 unmanaged session refused`; `-08 stop leaves the session managed`.

**T10 — Reminders in the child `[child]`**
- Goal: Fishball can create, list, update and delete reminders and see them in its UI.
- Owns: `src/slim/child/reminders.js` (store, delivery, `/api/reminders`, agent tools),
  `src/slim/child/reminder-schedule.js` (timing rules), `src/slim/ui/reminders.js`.
- Depends: T03 and T07 (delivery goes through the chat's `resolveAgent`).
- **Why the child does not mount `dsh-schedule` (fixed 2026-11-06):** on 0.2.1-rc.3/rc.5 the
  `schedule` row hard-injects `sessionController`, which only the Web bundle provides
  (`dsh-api-session-controller` in turn injects `fileUploads` and `workspaceRegistry`), so the row
  stays pending in the base-only child and `/api/reminders` answers 503. A minimal child-local
  `sessionController` would shadow a Web-owned DSH service, and the published service/tool
  contract still differs between rc.3/rc.5 (`list`/`update`/`delete`) and 0.2.2-rc.1
  (`list`/`view`/`edit`), so one HTTP adapter and one tool set cannot cover all three versions.
  The child therefore owns the scheduler and repeats the schedule tool's timing semantics.
- What runs: one JSON store at `<child home>/fishball/reminders.json`, written atomically before
  an operation is acknowledged; a Node timer over active tasks; delivery through T07's
  `resolveAgent` as a `source: { kind: "schedule" }` user message with the schedule service's
  `[SCHEDULE REMINDER]` framing, committed with its receipt only after `sessions.flush()`
  acknowledged the message; the agent tools `schedule_create`, `schedule_list`,
  `schedule_update`, `schedule_delete` with the schedule tool's names and parameters; and the
  `/api/reminders` list/update/cancel API the UI reads. Every durable write (create, update,
  cancel, delivery) notifies the app's `reminders` SSE event.
- Timing: one-shot `after`/`at`, fixed-rate `every` (at least 60 s, aligned to creation or the
  save that changed it), wall-clock `daily`/`weekly` in an explicit IANA zone (a local time that
  does not exist skips that date; a repeated local time fires once at the earlier instant), and
  five-field Vixie `cron` (when both day fields are restricted, either may match). After downtime
  a missed occurrence is delivered once: a one-shot task ends, a recurring task delivers its
  latest missed occurrence and keeps its cadence.
- Acceptance: a reminder created from chat fires once at its time, is listed, and is cancelled;
  no reminder is lost across a child restart.
- Tests: `REM-01 create and fire once`; `-02 list and update and delete`; `-03 survives restart`.

**T11 — Admin relay and child admin service `[host]` plus `[child]`**
- Goal: the main settings page can read and change the child's model, plugins and settings, and
  restart it, without writing the child's files.
- Owns: `src/slim/host/admin.js`, `src/slim/child/admin.js`.
- Depends: T02, T03, **Q4 answered** (where installable plugins come from). Acceptance: list/install/remove/enable/disable hit the child's profile only;
  model change takes effect on the next request; every mutation is revision-checked; refusals are
  typed, not thrown into the page.
- Tests: `ADMIN-01 list the child's plugins`; `-02 install lands in the child profile, not the
  main one`; `-03 model change is applied`; `-04 unknown plugin is refused`; `-05 restart keeps
  data`.

### Wave 4 — images, chat UI, approvals, settings UI, model sync (parallel; one client task)

**T06 — Images and files across the bridge `[host]` plus `[child]`**
- Goal: both directions of §6 work with 0.2.2 limits.
- Owns: `src/slim/attachment-transfer.js`, `src/slim/host/images.js`, `src/slim/child/images.js`,
  the image parts of `src/slim/ui/composer.js`.
- Depends: T05, **Q2 answered** (text-only model). Acceptance: png, jpeg, webp and gif accepted, others refused; 4 MiB and 20-image
  limits enforced on both sides; sha256 verified; no path accepted; text-only model refused with
  `images-unsupported`; files arrive as handle text.
- Tests: `IMG-01 session image reaches the model`; `-02 Fishball image reaches a session`;
  `-03 unsupported type refused`; `-04 oversize refused`; `-05 path argument refused`; `-06 file
  becomes handle text`; `-07 text-only model refused`; `-08 user upload to Fishball`.

**T07 — Fishball chat shell `[child]`**
- Goal: a usable chat page: timeline, streaming text, tool rows, composer, model picker, and the
  read-only composer (D8: no permission control at all).
- Owns: `src/slim/ui/*` except the settings, decision and image parts.
- Depends: T03, T05. Acceptance: a prompt streams into the timeline, tool calls render, the model
  picker changes the next request, the composer is read-only with no permission control.
- Tests: `CHAT-01 send and stream a reply`; `-02 tool row renders`; `-03 model switch`; `-04 no
  permission control in the composer`; `-05 read-only session cannot write`; `-06 reconnect shows
  the session`.

**T09 — Approvals, questions and escalation outcomes `[host]` plus `[child]`**
- Goal: Fishball decides allow, grant, reject or escalate and answers questions, from its own chat;
  and when Fishball needs something from the user, it asks as a card.
- Owns: `src/slim/child/approvals.js`, `src/slim/host/approvals.js`, and Fishball's own question
  cards: `src/own-questions.js` with its provider wiring in `index.js` (the card itself).
- Depends: T05. Acceptance: a live card is answered once with the current offer id; an expired
  offer is refused; an escalation settles with the user's decision and emits `approval.settled`;
  the same rules as today's allowance apply. **Ask User is removed** (user decision 2026-11-05):
  the child mounts no `tool-ask-user` row, so no `ask_user_question` tool reaches Fishball. Its
  `ask_user` tool files one card in the user's pile through `question.ask` and returns at once with
  the card id; the card never expires, the user answers on the card or on the child's copy of it,
  and the answer arrives in Fishball's chat as the `QUESTION_ANSWER` inbox item plus one
  `answers()` row. A card closed without an answer reaches the child as `[card closed …]`.
- Tests: `APPR-01 allow once`; `-02 reject`; `-03 grant then use`; `-04 expired offer`; `-05
  escalation answered by the user`; `-06 question answered`; `-07 disconnect does not lose the
  card`; `-08 no ask_user_question tool in the child`; `-09 ask_user returns at once with the card
  id`; `-10 the card waits with no deadline and the answer comes back as a chat row`; `-11 an
  unanswered card closes with the child's closed line`.
- Revised 2026-11-06 (the user: "你看不到卡片记录的问题这也是个问题"): when the user answers a
  session's card themselves, on the pile card or in that session, Fishball now receives the words
  (the chosen labels or custom text, a permission decision and its note), not only "the user
  answered it". They travel inside the T08 card record's inbox item to the child, which queues
  one notice as Fishball's own turn, as every other inbox item is (`src/slim/child/inbox.js`):
  it wakes an idle Fishball, and a busy turn reads it when that turn ends (7713 N9-b; injected
  without a wake, an idle Fishball saw it only at the user's next message). The session's
  question text is not repeated in the notice: it is that session's words, and read_session shows it.

**T12 — Settings page and one button style `[client]` plus `[host]`**
- Goal: the rebuilt settings page (§9) and the §8.5 restyle of all nine accent buttons.
- Owns: the settings page in `client.js`, the accent token and helper, `src/slim/host/settings-routes.js`.
- Depends: T11, T04, **Q4 answered**. Acceptance: status, model, plugins, settings and restart work end to end
  against a disposable child; every accent button is DSH secondary plus one magenta ring; one
  constant and one CSS class; light and dark checked; no legacy sections.
- Revised 2026-11-06: the Fishball view's Retry is a tenth accent site (`accentButton`, centred in
  the view's error state), and the brand block gains the "Sidebar entry" switch (§7): the
  panel-list row is on by default, off leaves only the top-left button.
- Tests: `SET-01 status and restart`; `-02 model change`; `-03 plugin install and uninstall`; `-04
  refusal shows the typed reason`; `-05 all accent buttons share one ring`; `-06 light, dark and
  focus-visible`; `-07 no legacy section remains`.

**T16 — Provider sync into the child `[host]` plus `[child]`**
- Amended 2026-11-06 (`feat/slim-psync-redesign`): the page flow is now Refresh models → one-step
  sync (§10); the preview/confirm routes and the pairing code are gone.
- Goal: preview and confirm of API-key providers into the child's own home, add-only.
- Owns: `src/slim/child/provider-sync-target.js`, the target wiring in `src/provider-sync-service.js`
  (contract only; no behavior change to preview rules).
- Depends: T02, T11. Acceptance: preview reports metadata and never reads values; confirm writes
  config then credential create-only; conflicts skip; `unknown` is reported and not retried; no
  real key is read in development or tests.
- Tests: `SYNC-01 preview lists add-ready and conflicts`; `-02 confirm adds config`; `-03 existing
  key skipped`; `-04 stale preview refused`; `-05 partial result reported`; `-06 no value in any
  response`.

### Wave 5 — decisions and the row mark (parallel; one client task)

**T08 — Decision labels in Fishball's chat `[child]` plus `[host]` — DONE (2026-11-05)**
- Goal: one inline label per decision at its point in Fishball's timeline, expandable; the trail
  under managed sessions is gone. **The user's later addition (2026-11-05): the decision audit
  list leaves settings for the same inline labels, and cards never expire — they survive a main
  DSH restart and stay visibly closed when their call does not survive it.**
- Owns: `src/slim/child/decisions.js` (the durable label and closure record), the label rules in
  `src/slim/child/approvals.js`, the view in `src/slim/ui/approvals.js`, the new `approval.ran`
  event in `src/slim/contract.js` and `src/slim/host/approvals.js`, the `ran` row in
  `src/approvals.js`, the pile's durable side in `src/pile.js` and `src/store.js`, the restart
  wiring in `index.js` and `src/questions.js`, and in `client.js` the turn-tail removal and the
  settings edit (the audit list out, the question-mode selector kept).
- Depends: T07, T09.
- Built (waves 1–5 already had the label and the merged group):
  1. One label per decision, inline and chronological, merging consecutive labels. Covered kinds:
     allowed, granted, rejected, asked ("asked a question"), question or plan review answered,
     escalated / sent to you, waiting, closed, and — new — "ran on Fishball's one-time approval",
     "ran on your one-time approval" and "ran on Fishball's standing grant". A call that ran on an
     approval already given is not a new decision: `src/approvals.js` reports it as
     `approval.ran`, the relay maps it to the contract's `RAN_VIA`, and the child records one
     label with `outcome.ran` and the time it ran.
  2. Expansion shows the request (tool, session, and now the exact arguments when the host has
     them, marked truncated when cut), Fishball's reason, its answer, the outcome and, for an
     escalation, the user's own decision. The descriptor's optional `arguments` /
     `argumentsStatus` pair is the one contract addition (LIMITS.argumentChars).
  3. The turn tail is gone: `client.js` no longer registers `SLOT.turnTail`, and its tag text,
     tag copy and tag CSS are deleted. T15 removed the tag records and their store.
  4. The settings decision audit list is gone (the old build's list is `client.js`'s
     `makeApprovals`, d67e69f:2794-2816, audit rows at 2809-2814). The `approvalAnswer.*` and
     `approvalOutcome.*` copy and `AUDIT_PASS` went with it. The Auto / Fishball / You question
     mode and its one-line description stay in settings, rendered by `makeSettingsPage`.
     The approvals audit table and `broker.snapshot().recent` remain: T15's removal list named
     only the tag table, so no approvals storage or API is lost.
- Persistence and restart (the user's explicit rule: a card never expires):
  - Pile cards are written while they wait to the plugin's own domain, `fishball.json` table
    `pile` (`{scope, card, filedAt}`) in `$DSH_HOME/storages/fishball.json`, the store the plugin
    already owns (beside the intake domain `fishball_intake`); DSH's storage writes atomically
    (temp file + rename + fsync) in its own queue, and `Pile` never awaits a write. A card leaves
    the store the moment it leaves the pile.
  - Three piles, three scopes: the broker's approval cards (`approvals`), the question router's
    (`questions`) and Fishball's own questions' (`own-questions`); a pile restores only its own
    scope.
  - At start a card is rebuilt into the pile. DSH ends every turn at a restart, so the call it
    waited on no longer exists: the rebuilt card is **visibly closed** (`CARD_END.restarted`,
    "DSH restarted, so the call it waited on ended"), never a lie that it can still be answered.
    `Pile.answer` refuses a restored card, and the broker closes its own at the first live moment
    (so the closure line lands in Fishball's chat). The question router closes the rest after
    `rebuild()`: a continued question DSH still holds is re-filed under the restored card's own
    id and is answerable again; every other question card is closed with the same reason.
    Fishball's own question cards are the exception, and they are **re-adopted**: `ask_user`
    returned at once, so no call died with the restart, and the stored card (questions and all) is
    re-filed under its own id at start, cleared of the detached flag, so the user answers the one
    card on screen and the answer still reaches Fishball's chat.
  - The child keeps its labels and `closed[]` in `<child home>/fishball/decisions.json` (mode
    0600, temp file + rename, queued writes, bounded by `APPROVALS.limits`). A waiting label is
    restored as waiting, its decision id back in `pending`, so the host's later settlement still
    updates it. Closure and answer inbox items made while the child is off the wire wait in the
    relay (bounded), so a restart's closure reaches the child that holds the label.
  - A session's question that reaches the user without Fishball's `to_user` (its answer window
    expired, or its notice was never delivered) gets the same waiting label a `to_user` leaves,
    outcome "left to you, unanswered by Fishball", when its escalation arrives (7713 O1). The
    user's later answer settles that label and a closure ends it, so the question has exactly one
    label in Fishball's chat, as an escalated permission request does.
- Acceptance: each settled decision yields exactly one label; expansion shows the request card and
  Fishball's reply; no label appears in a managed session's turn tail; the user's escalation
  outcome updates the label; a decision the settings list used to show (including a call that ran
  on an approval) appears inline; a card pending at a main restart is rebuilt and then closed with
  the restart reason; labels and closures reappear after a child restart; the slim settings page
  has no decision audit list and still has the question mode.
- Tests: `DEC-01 allow label`; `-02 escalation label updates after the user's answer`; `-03
  question label`; `-04 message label`; `-05 expand shows card and reply`; `-06 no turn-tail tags`;
  `-07 ran-on-a-one-time-approval label`; `-08 pending approval card rebuilt and closed after a
  main restart`; `-09 continued question answerable after a restart, one card only`; `-10 labels
  and closed rows survive a child restart`; `-11 settings keeps the mode and has no audit list`.
- Added 2026-11-06 — card records (the user: "卡片记录如果是session发出的问题，就留一个在提问的session那里；
  然后鱼丸那里留一个卡牌提问记录，设置里面不需要留"):
  1. Why: an answered card left no trace where it was asked. Answers reached Fishball only as
     context for its next step (nothing on screen), and the asking session's log had nothing at
     all. Settings stays without any history (the decision list left it above).
  2. What: one record per card a session raised (question, plan review, permission request) when
     it ends, answered by the user or Fishball, skipped, or closed. Schema `src/slim/card-record.js`
     (`plugin:fishball/card-record`, v1). The main row's owners call `src/card-records.js` at the
     point the answer is taken: `answerApproval` / `answer_prompt` (Fishball), the pile answer and
     the session prompt's answer (the user) in `src/approvals.js`; `#ended` in `src/questions.js`
     (Fishball, or the session's own card; the pile is unreachable for these since N3, §12); `answerCard` in `src/own-questions.js`; and every
     closure through the owners' `cardClosed`.
  3. Where: the asking session's log at that point, and Fishball's chat with the asking session
     named. Two exceptions, the user's decision 2026-11-06: an answer given in the session itself
     gets no session copy (DSH already shows it there), and Fishball's own `ask_user` card has only
     Fishball's copy. Fishball's own answers also get a record, beside the decision label.
  4. How: a DSH plugin record (`appendPluginRecord`). DSH persists, forks and sends it to the
     browser but never projects it into a model request, so neither agent gets extra context. It is
     written at once (queued one microtask, because a card can end inside DSH's own session/event
     publication, which refuses a re-entrant append), even while the session's turn runs. Fishball's
     copy rides the bridge inbox (`RECORD_ITEM`, through the relay's queue and the bridge host's
     unacked queue), not an event: events drop while the child is off the wire, and a record must
     survive that. Fishball's chat is the child's own session (the in-process Fishball is gone,
     §12), so the child appends the record there (`fishballChat.recordCard`); the main row writes
     nothing for Fishball itself.
  5. Rendering: one conversation definition plus a `conversation.chat.node` view in `client.js`,
     DSH's own `DisclosureRow` with its question/shield icons, collapsed to one line and expandable
     to the full card. It works in any DSH session view, so it is the same row on both sides once
     Fishball's chat is DSH's session view (the user's 2026-11-06 direction); nothing is built in the
     custom child UI. Checked against DSH 0.2.1-rc.5 and 0.2.2-rc.1: both have `appendPluginRecord`,
     the wire accepts `ignorable` events, `uiConversation.events.register` and `DisclosureRow`.
  6. Limits: a session that is not loaded when its card closes (a closure at a main start) gets no
     session copy; Fishball's copy still goes out. A late reply to a continued question records no
     words (they are only in that session's log).

**T13a — Sidebar idle marker with dots `[client]`**
- Goal: the §8.2 "ships now" behaviour: the fish in DSH's idle leading slot, green unread / yellow
  needs-action dots, no Fishball mark while the session runs.
- Owns: the row-mark component in `client.js`; a small host feed of per-session state.
- Depends: T05, D11, D13.
- Acceptance: the marker appears only where DSH mounts the leading slot; needs-action beats unread;
  a running row shows only DSH's spinner; reduced-motion is static; the unmanaged row is untouched;
  no CSS is injected against DSH's row internals.
- Tests: `MARK-01 marker in the idle leading slot`; `-02 green unread dot`; `-03 yellow needs-action
  dot beats unread`; `-04 running row shows DSH's spinner only`; `-05 reduced motion static`; `-06
  unmanaged row unchanged`.

### Wave 6 — hand-over (one client task)

**T14 — One hand-over button with a note `[client]` plus `[host]` — DONE (2026-11-05)**
- Goal: §8.3: one button, one optional note, hand over and forward; remove send-only and watch-only.
- Owns: the header and menu components in `client.js`, `src/messaging.js` forward note path,
  `src/watches.js` user-facing entry points.
- Depends: T05, **Q11 answered**. Acceptance: the note is delivered as the user's words outside
  the untrusted block; the session becomes managed; an empty note still hands over; Take back
  still works; the other two buttons and menu items are gone.
- Tests: `HAND-01 hand over with a note`; `-02 hand over without a note`; `-03 note framing is the
  user's words`; `-04 take back`; `-05 no send or watch buttons or menu items`.
- Done 2026-11-05 on `feat/slim-t14` (from `feat/slim-integration` 5b5b94d):
  1. One entry. `client.js` registers the header action, the session-menu item and the dialog
     under `HAND_OVER` (`fishball-hand-over`); the Take back refusal keeps its own overlay id.
     Hand over opens the note dialog and posts the existing forward route (`API.send`,
     `POST /api/fishball/send`); Take back keeps `POST /api/fishball/managed {managed:false}`.
     The dialog's note is optional (empty still confirms) and DSH's plain `primary` confirm is
     kept, as §8.5 lists the send dialog as not restyled.
  2. The send-only and watch-only header actions, menu items, their refusal copy and the unused
     client `api/fishball/watches` request are gone. The watch service, its HTTP route and
     `commands.addWatch` stay (compatibility; §9 says services and routes stay), so no watch can
     be started from the main DSH UI, and T15 decides whether that route is retired.
  3. `src/messaging.js#forward` now records the managed session `by: 'hand-over'`
     (`MANAGED_BY.handOver`) rather than `'send'`; old `send` rows keep their settings label.
     The note bound (`maxMessageBytes`) and the `TEXT.forwarded` framing (the user's words
     outside the untrusted block) are unchanged.
  4. §8.5: the two recommended-plugin buttons (Install, Turn on) now go through the shared
     `accentButton`/`fb-outline` ring; the other seven call sites already did. No filled
     magenta button or `FISHBALL_COLOUR` rule remains, and the switch wrapper still keeps its
     magenta knob.

### Wave 7 — cleanup (one task)

**T15 — Retire the legacy Fishball `[client]` plus `[host]` — DONE (2026-11-05)**
- Goal: §12, after every new path is merged and green.
- Branch: `feat/slim-t15`, cut from `feat/slim-integration` at
  `5b5b94dc6dae47786b51427e2931d9b425353b69`.
- Owns: `index.js`, `cordis.patch.yml`, `package.json` exports, the remaining legacy modules.
- Depends: all.
- Built:
  1. The in-process chat entry is gone from `client.js`: `openFishball`, `fishballOpener`,
     `CHAT_STATUSES`, the `uiWorkspace` service lookup, `API.recovery` and the recovery/status
     buttons are deleted. The brand button and the embed panel open only `/fishball/embed/`; a
     child that is not ready shows its safe state and code plus Retry (`makeEmbedPanel`), never the
     old chat.
  2. The settings page keeps only the slim sections. Deleted its dead legacy renderers and their
     exclusive dependencies: status/recovery (`OFFERED`, `ACTION`), plugins summary, recommended
     list, context window (`CONTEXT_FIELDS`, `CONTEXT_ERRORS`, `WHOLE_NUMBER`, the
     `API.contextWindow` path), hidden tools, plugin sources, and the approvals/managed-session
     list; and `makeProviderSyncSettings` with its `PROVIDER_SYNC_UI` pairing strings. Their
     dictionary entries and now-unused CSS/helpers went too (`MODEL.pickerClass`, `countText`,
     the old model-catalog validators, the unused `API.model`/`API.models` paths).
     `makeNativeSettings`, `makeModelSettings`, `makeChildPlugins`, `makeChildSettings`,
     `makeBrandStyle`, the question mode and the limits form remain. (`ProviderSyncSlot` also
     remained here; the 2026-11-06 redesign removed it, and Refresh models now runs the sync, §10.)
  3. T08's deferred cleanup is complete: `src/tags.js` is deleted; the store no longer defines the
     `tags` table or its record schema; `src/approvals.js` and `src/questions.js` no longer write
     tag records (`TAG_KIND` and `QUESTION_TAG_ANSWER` removed); and the state feed no longer
     publishes `tags`. `answerWords` stays because the child's decision label still carries a
     question answer's words.
  4. `src/recommended.js` stays: `ADMIN_RECOMMENDED` (`src/slim/host/admin.js`) and the
     recommended/welcome view read it.
- Deliberately not touched: the send/watch/hand-over entries and the accent-button CSS (T14), the
  persona and overlay (release prep), and the still-registered welcome card, model gate, managed
  banner and pile, which are live components rather than dead code. `src/native-web.js`'s status
  route stays for the embed panel, and the shared provider-sync engine/route stays for T16. The
  approvals audit table and `broker.snapshot().recent` also stay; the removal list named the tag
  table only.
- Acceptance: no legacy chat route, no tag table, no dead constants or CSS, the plugin still loads
  with only the new rows, and the main DSH is unaffected on restart.
- Tests: `RET-01 no legacy chat surface`; `-02 plugin loads with the new rows`; `-03 restart is
  clean`; `-04 no orphaned storage table`.
- **Follow-up (2026-11-06, `feat/slim-remove-legacy`).** T15 left the in-process `AssistantLifecycle`
  running (`index.js:690`). Once 0.2.2 composed the main row again it took every inbound item (B7),
  so the whole in-process Fishball is now deleted and every main-side entry point routes to the
  child through the ledger and the bridge (§5.2 "Delivery rules", §12). The package patch also
  inserts the `fishball-native-host` row with a PATH-derived Node default (B2,
  `src/native-runtime/node-default.js`), and the preferences no longer wait for anything that can
  fail (B4).

### Wave 8 — blocked on upstream (not scheduled)

**T13b — Fish under the hollow spinner (BLOCKED) `[client]`**
- Goal: the §8.2 target: the fish is the base layer in every managed state, DSH's hollow spinner
  draws above it and the fish shows through, the dots stay top-right, the fish flips, and the orca
  plays 0.2.2's swim in DeepSeek mode.
- Owns: the row-mark component from T13a, extended; no other files.
- Depends: T13a, the **DSH upstream slot change** in §8.2. Blocked: do not start until DSH mounts
  `sidebar.session.row.leading` (or the accessory slot) while running. No `data-row-key` CSS
  approximation. 0.2.2 check: the leading slot is still idle-only; the new
  `sidebar.session.row.trailing` slot is always mounted but sits on the right, so this stays blocked.
- Acceptance: the fish is visible while running through the spinner's hollow centre; the orca swim
  is imported, not copied; reduced-motion is static; no DOM overlay or CSS override of DSH's row
  internals.
- Tests: `MARK-07 fish visible while running under the hollow spinner`; `-08 DeepSeek mode plays the
  imported swim`; `-09 running plus needs-action dot`.

### Dependency graph (summary)

`T01 -> {T02, T03} -> {T04, T05, T10, T11} -> {T06, T07, T09, T12, T16} -> {T08, T13a} -> T14 -> T15`
`T13b <- DSH upstream slot change` (blocked, not scheduled)

T03 implements the row T02 inserts, so the pair is verified together at the end of wave 2. T13a
needs T05; T14 needs T05 plus Q11; T13a and T14 both own `client.js`, so they are split across
waves 5 and 6. T13b is blocked on the upstream slot and starts only after that ships.
`client.js` appears in T04, T12, T13a, T14 and T15 only, one per wave.

## 16. Test plan outline (names only)

- Contract: `CONTRACT-01..04`.
- Lifecycle: `LIFE-01..05`.
- Child server and embed auth: `SRV-01..06`, `EMBED-01..06`.
- Bridge: `BRIDGE-01..08`.
- Chat: `CHAT-01..06`.
- Images: `IMG-01..08`.
- Approvals and questions: `APPR-01..11` (T09; the last four cover Fishball's own card ask).
- Decision labels: `DEC-01..06`, plus `-07..11` for the settings list's kinds and the two
  restarts (T08 below).
- Row mark: `MARK-01..06` (now) and `MARK-07..09` (blocked on upstream).
- Hand-over: `HAND-01..05`.
- Settings: `SET-01..07`.
- Provider sync: `SYNC-01..06`.
- Reminders: `REM-01..03`.
- Retirement: `RET-01..04`.
- End-to-end smoke in a disposable home: `E2E-01 cold start`; `-02 chat and tool call`; `-03
  hand-over and inbound message`; `-04 restart with an open page`; `-05 child crash and Retry`;
  `-06 main DSH shutdown stops the child`.
- Compatibility: `COMPAT-01 0.2.2-rc.1 core boots without the web UI`; `-02 0.2.2 attachment read by
  reference`; `-03 the same contract module runs on rc.3`.

## 17. Development and testing boundary

This document and the tasks above are development work. The testing session runs every named
scenario in a disposable `DSH_HOME`, with a disposable main home and child home, never the user's
real homes, never a real API key, and never a real provider sync with real keys.

## 18. Connector and instance: tasks with test design (revision 2026-11-06)

Base: `feat/slim-integration` at `535a807`, which already contains `feat/slim-remove-legacy`
(e7ed7c3), `fix/slim-022-child` (6b7b750) and `feat/slim-card-record2` (2e96837). Every task below
starts from that base or from its dependencies' merge. One task, one branch, one session.

**Process (TDD, the user's rule of 2026-11-06).** A test-design session writes every task's cases
from this section before any dev session starts, then a test-writing session implements them; the
dev session codes against them without reading the test code. Each task's test design lists:

- **R**: the requirements, as black-box observable behaviour;
- **T**: the ISTQB techniques. **P** = positive tests, **EP** = negative tests by equivalence
  partitioning, **ST** = state transition, **DT** = decision table, **BVA** = boundary value
  analysis;
- **AC**: the acceptance criteria the cases check.

All tests run in disposable homes and on free ports, against DSH **0.2.2-rc.1** and
**0.2.1-rc.5** (the installed versions under `~/Library/Application Support/DSH/data/versions/`,
read-only). Never the user's homes or `:7713`/`:3081`, never a real API key (D21, §17).

**Status (2026-11-06 follow-up).** The user's answers (D22–D25), K1 (`feat/k1-contract`
bb0f756), the spikes SP1–SP3 (`spike/body-soul-sp` 6f393d2) and both test designs
(`test-design/connector` 9e92622, `test-design/instance` c481dbe) are folded in. Their open
questions are answered in §18.5, and nothing in this section waits on the user.

**Rules:** a task touches only its own files; `client.js` belongs to one task per wave; the
contract freeze (K1) merges before any task that uses the new contract operations.

### 18.1 Task table

Revised 2026-11-07 for D28–D30 at `feat/body-soul` 2a1b0c3. Paths are the real ones after M1
(`docs/package-layout.md`); "inst/" is `packages/instance/`, "conn/" is `packages/connector/`.
Done rows keep their original text. Withdrawn rows are listed after the table.

| Task | Part | Owns | Depends | Done when |
| --- | --- | --- | --- | --- |
| **D0** design (this revision) | doc | `docs/slim-native-design.md`, `DESIGN.md` | — | committed on `design/body-soul`; approved by the user |
| **SP** spikes SP1–SP3 — **DONE** (6f393d2) | instance | `spikes/body-soul-sp/`, `docs/spikes/body-soul-sp.md` | D0 | answered; findings in §18.3 |
| **K1** contract v1 freeze — **DONE** (bb0f756) | contract | `src/connector/**`, `docs/connector-contract.md` | D0 | binding API, `fishballConnector` service and version rules defined and validated; no settings ops |
| **K1b** contract corrections — **DONE** (0c3c55f) | contract | `src/connector/contract.js`, `docs/connector-contract.md` | K1 | every §18.6 item done; K1's cases re-pass |
| **M1** repo split into two packages — **DONE** (6a74161) | both | `packages/connector/**`, `packages/instance/**` (moves only), root `package.json` workspaces, both `cordis.patch.yml` | K1b | both packages `node --check` and pack; the old tests pass on the moved files |
| **C1** connector service + no-instance mode — **DONE** (ac39a63) | connector | `packages/connector/index.js`, `src/connector-service.js` (new), `src/intake.js` delivery hook | M1 | §0.4 binding and no-instance table hold |
| **C2** connector settings in DSH's form only, and the one-time migration — **DONE** (474b876) | connector | `src/config.js`, `src/settings-migration.js`, question mode in the row config, `src/preferences.js` and the brand/sidebar-entry routes deleted | C1 | §18.2 C2 holds |
| **C3** connector client: frame, Plugins card, fixed icon, records chunk — **DONE** (ec876df) | connector | `conn/client.js`, `conn/client.records.js`, `conn/assets/connector-icon.svg`, the frame routes in `conn/src/{connector-service,http,constants}.js` | C1, C2 | §18.2 C3 holds |
| **I1** instance binds to the connector, its Plugins card fields — **DONE** (a2471a8, 810c338 as I1b) | instance | `inst/host.js`, `inst/src/host/binding.js`, `inst/client.js`, `inst/src/settings-migration.js` | C1 | auto-attach, re-attach, `connector-missing`, live follow of the connector service |
| **I1c** the rest of I1: attach with `ui`/`status`/`retry`, refused-attach states, status and Retry on the instance's card — **DONE** (2d4b8ea, merged 33c7efb) | instance | `inst/host.js`, `inst/src/host/binding.js`, `inst/src/native-web.js` (`GET /api/fishball-instance/status`, `POST /api/fishball-instance/retry`; the old `/api/fishball/native/status` kept for its readers), `inst/client.js` (status block), `inst/src/slim/host/admin.js`, `inst/src/slim/host/embed.js` (503 codes) | I1 | §18.2 I1c |
| **I2** child launch like the host DSH, and the launch fields leave the form (U1, U2) | instance | `inst/src/native-runtime/{installation,index,constants}.js` (spawn with `process.execPath` and the filtered `process.execArgv`, `RUNTIME_ENV`, `ELECTRON_RUN_AS_NODE=1` under an Electron host, the PATH rule; `verifyNode` and its probe removed); `inst/host.js` (the two fields out of `Config`, `launchSettings`, `LAUNCH_ERROR` and the runtime options); `inst/client.js` (the field part only: `LAUNCH_FIELDS`, the two text fields and their strings); `inst/src/settings-migration.js` (copies only `enabled`); delete `inst/src/native-runtime/node-default.js` | M1 | §18.2 I2 |
| **I6** instance settings view (in the custom page) and the model-sync button | instance | `inst/src/slim/ui/settings.js` (new: status and Restart, model and effort default, plugins, recommended, plugin settings; over the kept admin routes), `inst/src/slim/ui/shell.js` (the `view=settings` switch and the header Settings/Back actions); the "Model for Fishball" block in `inst/client.js`; `inst/src/slim/host/provider-sync-routes.js` (`models/check`, `models/add` instead of `sync`), `inst/src/provider-sync-service.js` (`check`/`add` instead of `sync`); `inst/host.js` (`PLUGIN.ui` gains `settings`) | I1c, I2, I8 | §18.2 I6 |
| **I7** card records in the custom chat | instance | `inst/src/slim/child/chat.js` (project `plugin:fishball/card-record` into entries), `inst/src/slim/ui/records.js` (new: the record row, both languages); the decision labels are not touched (U5) | I8 | §18.2 I7 |
| **I8** restyle the custom chat to DSH's look | instance | `inst/src/slim/ui/{shell.html,shell.css,chat.js,composer.js,approvals.js,reminders.js}`, `inst/src/slim/ui/dsh-tokens.css` (new), `inst/THIRD_PARTY_NOTICES.md` (new) | M1 | §18.2 I8 |
| **I9** two language variants, and the theme follow (U3) | instance | `inst/src/slim/ui/i18n.js` (new: `en` and `zh` dictionaries, the `lang` rule), `inst/src/slim/ui/theme.js` (new: U3's live mirror of the parent's `data-ds-dark-theme`, OS fallback), `inst/src/slim/ui/shell.js` and every ui module's copy moved into the dictionaries, `inst/src/slim/child/chat.js` (a user row's `authorKind` instead of English author text), `inst/src/slim/host/embed.js` (the 503 page follows `lang`) | I6, I7 | §18.2 I9 |
| **K2** contract 1.1: the connector appends `lang` to the framed path (approved, U4; no `theme`, U3) | contract + connector | `conn/contract/contract.js` (minor 1, the parameter names), `docs/connector-contract.md` §1.2, `conn/client.js` (the frame's `src`, reload on a locale or theme change) | C3 | §18.2 K2 |
| **I10** remove the truly dead code | both | delete `inst/src/native-control/**` and its `./native-control` export, the `native-control` copy in `installation.js` `copyChildCode`, the `DEFAULT_CONTROL_LIMITS` import and `control` option in `inst/host.js`; delete `packages/messenger/` and its tests; retire the tests of deleted modules | I2, I6 | §18.2 I10 |
| **E1** end-to-end on both versions | both | test only | I2, I6, I7, I8, I9, I10, K2 | §18.4 scenarios pass |

**Withdrawn by D28 (2026-11-07):** I3 (proxy v2: token-for-cookie exchange, Host/Origin rewrite,
`api/remote.mux` WebSocket pass-through). Only DSH's Web UI needed them; the proxy stays the
bearer proxy of §3, which C3 already frames. I4 (child UI plugin: session-only frame, slot
shadows, `toggleSidebar`). I5 (agent preset `fishball`, workspace registration): the custom chat
creates and resumes its one session itself, and nothing else resumes it, so the preset and the
workspace solve nothing (§0.5). The `[base, web-app]` migration, the `ui-*` and `ui-settings-*`
rows to disable, the `web-runtime` row, the `permission`-row restriction (SP F3: that `/permission`
command reached the session only through DSH's composer, which the custom page does not have) and
the waits for `webServer`, `connection` and `sessionController` (all of old I2). Old I8's
deletions (the custom chat, its server and auth, `decisions.js`, the admin relay); only I10's
dead code goes.

**Kept as they stand:** I6's model-sync button (D26) and its check → choose → add flow, now in its
own files; I7's records requirement, now rendered in the custom chat; the proxy's admission rules
(inst-OQ-11 order, limits of §3.6), unchanged in `embed.js`.

**Dependencies and parallel runs.** I1c is done (33c7efb).

```
I2 ─┬─────────▶ I6 ─┬─▶ I10 ───────┐
I8 ─┴─▶ I7 ─────────┴─▶ I9 ────────┼─▶ E1
K2 ────────────────────────────────┘
(I6 needs I2 and I8; I9 needs I6 and I7. U3 is decided: K2 carries no `theme`, and I9 mirrors the
parent page's attribute.)
```

- Wave A, in parallel now: **I2**, **I8**, **K2**. No shared file: I2 owns `inst/host.js`,
  `inst/client.js` (field part), `settings-migration.js`, `node-default.js` and the runtime; I8
  owns `src/slim/ui/**` and its new files; K2 owns `conn/contract/contract.js`,
  `docs/connector-contract.md` and `conn/client.js`.
- Wave B, in parallel: **I6** (after I2 and I8: it adds to `inst/client.js` and `inst/host.js`
  after I2), **I7** (after I8), **I10** (after I2: `inst/host.js` and `installation.js`). I6 and
  I10 both touch `inst/host.js` in this wave, so I10 waits for I6's merge or takes only its
  `native-control` lines on top of it: **I10 runs after I6**. I6 and I7 own different
  `src/slim/ui/` files; I6 alone `shell.js`.
- Wave C: **I9** after I6 and I7, because it moves every ui module's copy into the dictionaries
  and so owns those files last.
- **E1** last.

File owners per wave: `inst/host.js`: I2 (A), I6 (B), then I10 (after I6). `inst/client.js`: I2
(A, fields), I6 (B, sync block). `inst/src/native-runtime/installation.js`: I2 (A), I10 (after
I6). `inst/src/slim/ui/shell.js`: I8 (A), I6 (B), I9 (C). `inst/src/slim/ui/approvals.js`: I8 (A),
I9 (C). `inst/src/slim/ui/{chat,composer,reminders}.js`: I8 (A), I9 (C).
`inst/src/slim/child/chat.js`: I7 (B). `inst/src/slim/host/embed.js`: I9 (C). `conn/client.js`:
K2 (A).

### 18.2 Test design per task

**SP — spikes (instance). DONE**, see §18.3.

**K1 — contract v1 (contract).**
- R: (1) `attachInstance` accepts a well-formed instance and returns a handle with `detach`.
  (2) It refuses, with the stated code and no side effect: a second instance (`instance-busy`), a
  different contract id or major (`contract-version`), a bad `ui` path (`ui-invalid`), a missing
  transport method (`transport-invalid`), a malformed `id`, `name`, `status`, `retry` or an unknown
  descriptor key (`instance-invalid`). (3) Contract v1 has no settings operation: a request named
  `settings.describe` or `settings.update` is an unknown operation (§18.5 conn-OQ-44). (4) A minor
  version may add only capabilities;
  an unknown optional capability is ignored, an unknown required one refused. (5)
  `docs/connector-contract.md` lists every operation, event, field, limit and error code that the
  module exports.
- T: P (valid attach; each op's minimal and maximal payload); EP (contract id: right / wrong;
  major: equal / lower / higher; minor: equal / lower / higher; ui path: absent / valid /
  relative / scheme / `//host` / with `token=` in query / with `token=` in fragment / with a plain
  fragment (accepted) / `ui: {}` (accepted) / `ui: null` (refused)); BVA (ui path length 512 / 513;
  every §5.2 limit at max and max+1, already in `LIMITS`); DT (attach outcome over {connector has
  an instance} × {major matches} × {ui valid} × {transport complete}).
- AC: every case returns the documented result or code; a refused attach leaves the connector in
  its prior state; a doc-vs-module check finds no name in one and not the other; the §18.6
  corrections are in both the doc and the module.

**K1b — contract corrections (contract).**
- R: every §18.6 item holds in `docs/connector-contract.md` and in `src/connector/contract.js`.
- T: as K1, plus EP for each corrected rule (unknown request operation; handshake shape break /
  unknown required name / unserved required name / no `inbox.push`; `token` in query or fragment,
  any ASCII case, percent-encoded; `ui: {}` / `ui: null`; empty label / empty reason; image
  `total` 0 / 1); ST (attached → closing failure → no-instance → new attach accepted; second
  `detach()` and a stale `onClose` → no change).
- AC: each corrected rule gives its stated frame, code and channel state; the doc-vs-module check
  passes.

**M1 — two packages (both).**
- R: (1) Two packages pack separately with names `fishball-connector` and `fishball-instance`.
  (2) Each bundle patch inserts exactly its own row (`fishball-connector`; `fishball-instance`);
  no row is called `fishball`. (3) The instance declares `peerDependencies: {"fishball-connector":
  "^1"}`, imports only the connector's `./contract` and `./records`, and the connector depends on
  nothing of the instance. (4) Behaviour is unchanged: the existing suite passes on the moved files.
- T: P (pack, install both into a disposable profile, rows present); EP (install connector only;
  instance only; both); DT (installed set × rows mounted × errors).
- AC: connector-only install boots with the `fishball-connector` row and no instance row; both
  boot with both rows; static scans: no import from `packages/connector` into `packages/instance`,
  and none from the instance into the connector other than `./contract` and `./records`. The
  instance-only boot reaching `connector-missing` is I1's AC, not M1's (moves only).

**C1 — connector service and no-instance mode (connector).**
- R: the `fishballConnector` service exists from apply without any instance, with the members
  `attachInstance` and `current()`; the §0.4 no-instance table; queued inputs are delivered once
  each, in global arrival order, on the next attach; a detach mid-delivery re-delivers
  unacknowledged items only; `ask_fishball` with no instance returns `unavailable` at once;
  `maxQueuedInputs` counts every pending item, pushed-but-unacked included, and refuses only
  automated inputs (`session`, `watch`, `system`, `plugin` kinds) with `queue-full`; the user's own
  inputs (`user` kind: a hand-over note, a Take back note) are never refused (§18.5 conn-OQ-03).
- T: P (attach, deliver, ack); ST (states none → attached → detached → attached; events attach,
  transport close, detach, plugin disable; illegal: attach while attached); EP (input kinds:
  message_fishball, ask_fishball, finished notice, hand-over note, Take back, managed release,
  permission request, question); BVA (queue at `maxQueuedInputs` − 1, = , + 1 → `queue-full` for an
  automated input, accepted for a user input); DT (input kind × instance attached × queue full →
  queued / delivered / refused / `unavailable` / offered to user).
- AC: with no instance, every input row of §0.4 behaves as listed; after attach the queued items
  arrive exactly once in order; the 201st `message_fishball` with the default limit 200 is refused
  `queue-full` (a hand-over with a note still succeeds then, and its note is delivered); `current()` reports `null` with no instance and
  the descriptor's `{id, name}` plus the attach count when attached; no approval waits on an
  absent instance.

**C2 — connector settings in DSH's form only, and the migration (connector).**
- R: (1) The connector's settings are exactly the §18.5 conn-OQ-20 field set plus `questionMode`
  (`auto` / `fishball` / `user`), as volatile fields of the `fishball-connector` row, edited only
  in DSH's own Plugins → settings form of that row (the connector's Plugins card renders it from
  `configForms`). (2) No contract path reads or changes them: with an instance attached, a request
  named `settings.describe` or `settings.update` is answered `unsupported-operation` and changes
  nothing. (3) A change applies live, without remounting the row. (4) One-time migration per §0.2:
  values from the old `fishball` row (live form or profile patch) and the stored question mode
  are copied once into an empty `fishball-connector` namespace; invalid fields are skipped; the old
  sources are left unchanged; a second boot copies nothing. (5) There is no brand-style or
  sidebar-entry setting; the routes `POST /api/fishball/brand` and `/api/fishball/sidebar-entry`
  answer 404. (6) Model sync is not a connector setting (D26). The connector's form has no
  sync field or button, and the `fishball-instance` schema has no `providerSync` key. A stored
  `providerSync` value is ignored, and the migration copies none.
- T: P (edit one field, several fields, the question mode); EP (value: whole ≥ min / below min /
  fraction / string; question mode: listed / unlisted; contract request: `settings.describe` /
  `settings.update` / any other unknown name; migration source: live old form / patch only /
  question-mode record only / none / old value invalid); BVA (each field at min − 1, min, min + 1;
  the hourly caps at 0; no maximum exists); ST (migration: not migrated → migrated, never back; a
  second boot is a no-op); DT (new namespace empty × old source present × marker present → copy or
  not).
- AC: every valid edit is visible in the form and in the live behaviour (for example the
  `queue-full` boundary moves with `maxQueuedInputs`); every invalid edit is refused by DSH's form
  and changes nothing; both settings requests over the contract give `unsupported-operation`;
  after migration the new namespace holds the old values and the old patch is byte-identical;
  the two retired routes answer 404; neither row's form has a `providerSync` field (an old stored
  value changes nothing).

**C3 — connector client: opener, Plugins card and fixed icon (connector).**
- R: (1) The sidebar panel-list row (always shown) and the brand button open the Fishball view.
  (2) View outcomes: no instance → "No Fishball instance is attached" and a button that opens DSH's
  Plugins panel; attached with `ui.chat` → an iframe whose `src` is exactly `ui.chat`; attached
  without `ui.chat` → "<name> is attached and has no chat page", no iframe. (3) The view's header
  is the connector's frame (D27, §0.5 "The frame") around whatever page the view shows, the same
  with `ui.chat` and with `ui.settings`. It keeps the title, the state tag, Refresh and "Open in a
  tab" (to the framed path, shown only with one), and adds the unread count and a **Connector
  settings** button. The state tag reads `unattached` with no instance, and "attached" when the
  instance gave no `status`. It shows Retry when the state is `failed` and the instance gave
  `retry`. It reads `status()` once a second while the view is open; a `status()` that throws or
  returns a value outside `STATUS`/`STATUS_CODES` shows `failed` with `NATIVE_UNAVAILABLE`.
  **Connector settings** is shown in every state, no instance included, and calls
  `pluginNavigation.openBundle('fishball-connector')`, which opens DSH's settings form of that
  row. The unread count is the brand mark's count and changes with it. The opener installs no
  `message` listener and acts on no `postMessage` from the iframe. (4) An attach or detach updates
  an open view without a reload.
  (5) The connector's Plugins card holds DSH's limits form (C2) and an "Open instance settings"
  button, shown only when the attached instance registered `ui.settings`; it opens that path
  framed in the Fishball view. (6) The fixed icon, the fish logo built from DSH's
  `FISH_LOGO_PATH` with a wrench badge, is on the sidebar row, the brand button and the Plugins
  card. It keeps the unread count and, on managed session rows, the green and yellow dots, and it
  uses the current text colour in light and dark. (7) Managed-row marks and Hand over keep their
  current behaviour.
- T: P; EP (instance: none / attached without ui / `ui: {}` / chat only / settings only / both;
  status: none / valid / throws / out-of-vocabulary state / out-of-vocabulary code; retry:
  present / absent; framed page: `ui.chat` / `ui.settings`; a `postMessage` from the iframe of
  any shape → ignored); BVA (unread 0 / 1 / the brand's many-cap and cap + 1, shown as on the
  brand); ST (view: empty → framed on attach → empty on detach, without reload; the frame's state
  tag follows `status()` within its 1 s poll); DT (attached × ui.chat × ui.settings × status →
  view, header actions, card button; the Connector settings button is in every rule).
- AC: every DT rule shows its outcome; iframe `src` equals `ui.chat` exactly; the empty states
  never render an iframe; the frame's **Connector settings** opens DSH's form of
  `fishball-connector` with and without an instance, and from the chat and the settings page
  alike; the frame's unread count equals the brand's; a message posted by the iframe changes
  nothing; the icon is identical in the three places; light and dark checked.

**I1 — instance binds to the connector (instance).**
- R: with both plugins enabled the instance attaches after main `appReady` with
  `ui = {chat: '/fishball/embed/', settings: '/fishball/embed/?view=settings'}` and no profile
  edit; each child restart detaches and re-attaches once; without the connector the instance
  status is `connector-missing`, the child does not start, the main boot succeeds, and the
  connector is never installed (D25); disabling the connector at runtime stops the child and
  gives `connector-missing`, and enabling it again starts the instance without a main restart;
  an attach refused `instance-busy` gives `failed` with `NATIVE_INSTANCE_BUSY` and an attach
  refused `contract-version` gives `failed` with `NATIVE_CONTRACT_VERSION`, the child is stopped
  in both and is not restarted by itself (Retry tries again); disabling the instance detaches and
  stops the child. The instance's status and reason show on its own Plugins card in the main DSH.
  The card's launch fields are exactly `enabled`, `nodeExecutable` and `executableSearchPath`
  (no `providerSync`, D26); I6 adds the sync block to the same card. (Done by I1 and I1b; the
  attach descriptor, the refused-attach states, the card's status and Retry, and U1's field change
  are I1c below.)
- T: P; ST (instance: waiting → starting → attached → restarting → attached; → stopped on
  disable; connector-missing as its own state with enable-connector → waiting); EP (connector
  present / absent / disabled later); DT (connector × instance enabled × child healthy → status).
- AC: each transition observable through the instance's Plugins card and the connector's
  `current()` (attach count); no orphan child process after any disable (process list in the
  disposable home).

**I1c — the rest of I1 (instance). DONE (2d4b8ea).** As delivered: `ui` is `{chat}` until I6
adds `settings`; Retry on the card shows while `failed`; the retry route is
`POST /api/fishball-instance/retry`, and `/api/fishball/native/status` stays for its readers; the
launch fields moved to I2 (U1). B1 fix: a channel that ends without `detach()` (a killed child)
keeps the instance's `status()`/`retry()` in the frame (contract §1.3, §9); disabling detaches first.
- R: (1) Every attach passes `ui`, `status` and `retry`; the connector's frame then shows the
  instance's state (`ready` reads "running") instead of "attached", and its Retry appears when the
  state is `failed`. (2) `status()` returns `{state, code}` with `state` in `STATUS` and `code` in
  `STATUS_CODES` or `null`; it never throws. (3) `retry()` restarts the child and resolves when it
  is `ready`; it rejects when the restart ends `failed`. (4) An attach refused `instance-busy`
  gives `failed` / `NATIVE_INSTANCE_BUSY`, one refused `contract-version` gives `failed` /
  `NATIVE_CONTRACT_VERSION`; the child is stopped in both and not restarted by itself; Retry on
  the instance's card tries again. These two codes are the instance's own and appear only on its
  card and status route, never in `status()` (there is no attachment then). (5) The instance's
  Plugins card shows the state and the safe code (and the launch-failure detail when there is
  one), live within 1 s, and a Retry button while the state is `failed`. (6)
  `GET /api/fishball-instance/status` (owner-only Fetch route) answers `{state, code}`;
  `POST /api/fishball-instance/retry` retries and answers the new status. (7) The admin relay's
  `admin.status` answers `connector-missing` as itself, not as `failed`.
- T: P; EP (attach outcome: accepted / `instance-busy` / `contract-version`; state shown: each
  instance state incl. `connector-missing`; Retry: from `failed` / not offered otherwise); ST (failed → Retry → starting → ready; busy-refused → the other instance detaches →
  Retry → attached); DT (connector present × attach outcome × child healthy → card state, frame
  state, Retry offered).
- AC: the frame's tag equals the card's state within the 1 s poll; the stub-busy run of E1-B8b
  ends `failed` / `NATIVE_INSTANCE_BUSY` with no child process; both routes answer as stated; no token, path or key in any status answer.

**I2 — child launch like the host DSH (instance).**
- R: (1) The child process's executable is the main process's `process.execPath`. (2) Its
  arguments start with the main process's `process.execArgv`, in order, without `--inspect*` and
  `--debug-port` flags (Fishball's call, pending the user), followed by the child's own
  arguments. (3) Its environment is the isolated set plus `NODE_OPTIONS` exactly as the main
  process has it (when set), and nothing else of the main environment; `PATH` is the main
  process's absolute entries in order. (4) No `node` is looked up and no version probe runs.
  (5) When the main process is Electron, the child always starts, as a background Node process
  with `ELECTRON_RUN_AS_NODE=1`, detached, with no window and no stdin, whether or not the main
  process has the variable (U2). (6) The `fishball-instance` form has exactly the field `enabled`;
  a stored `nodeExecutable` or `executableSearchPath` changes nothing and logs nothing; the
  one-time migration copies only `enabled` and drops the two old values silently (U1). (7) The
  child profile, its slim migration and the readiness rules stay as they are (§0.5).
- T: P (main under plain Node; main under the DSH-X wrapper, both versions); EP (main runtime:
  plain Node / Electron with `ELECTRON_RUN_AS_NODE=1` / Electron without it; `execArgv`: empty /
  DSH-X's flags / with `--inspect=0` / `--inspect-brk` / `--debug-port=9229`; `NODE_OPTIONS`:
  unset / set; a main variable outside `RUNTIME_ENV` holding a fake key → absent in the child;
  PATH with relative entries → dropped; old stored launch values: none / both / invalid ones → no
  effect); DT (main runtime × `ELECTRON_RUN_AS_NODE` in the main → the child's variable and the
  outcome, always spawned).
- AC: what a test row in the child reports (its `process.execPath`, `process.execArgv` and the
  listed variables) equals the main's, minus the filtered flags, with `ELECTRON_RUN_AS_NODE=1` under every Electron
  host; the fake key is
  absent from the child's environment and logs; no second DSH-X window or GUI process ever starts;
  both versions reach ready under both runtimes.

**I6 — the instance settings view and the model-sync button (instance).**
- R, the view (the custom page at `view=settings`, inside the connector's frame, D27): (0) the
  instance registers `ui.settings = '/fishball/embed/?view=settings'` from this task on. (1) the
  header Settings action opens it and writes `view=settings` with `replaceState`; Back removes the
  parameter; loading `?view=settings` opens it directly; only the first `view` parameter with the
  exact lowercase value `settings` selects it. (2) A status block with the state and Restart
  (`admin.restart`). (3) A model block: the child's default model and reasoning effort
  (`admin.model.get` / `admin.model.set`), with the line "New models from DSH are added from
  Fishball instance → Model for Fishball in DSH's Plugins", plain text, no link and no sync button.
  (4) A plugins block: the child's plugins with enable, disable and remove, install by spec, the
  recommended list with Install, and each plugin's settings (`admin.plugins.*`,
  `admin.settings.*`). (5) No connector value, no control that changes one, no link to the
  connector's form. (6) While the child restarts, "Restarting…" and every control disabled until
  it reconnects. (7) A refusal shows its code inline.
- R, the sync button (D26, §10), on the `fishball-instance` Plugins card in the main DSH: as the
  2026-11-06 text (R4–R9 of that revision): Check fetches once and lists only the missing
  providers, all ticked; Add writes exactly the ticked ones; Cancel writes nothing; per-entry
  results; nothing written from a stale list across a restart, stop or detach; disabled unless
  `ready`; only API-key and `apiKeyEnv` providers; no key, mask, endpoint or variable name in the
  browser, the HAR or a log.
- T: P (each block's main action; check → untick one → add); EP (view parameter: none /
  `settings` / `Settings` / empty / `x` / `settings&view=x` / `x&view=settings`; plugin spec valid
  / unknown / empty; provider kinds and `ids` as in the 2026-11-06 list); BVA (missing entries 0 /
  1 / 5; ticked 0 / 1 / all; list age at the preview life − 1 s / + 1 s); ST (chat ⇄ settings,
  reload keeps the URL's view; card: idle → checking → listed → adding → result; page: ready →
  restarting → ready); DT (instance state × list fresh × ticked count → Check and Add enabled or
  not).
- AC: every block works on both versions; the main manifest, the main credential store and the
  connector config are unchanged by every action; no connector value on the view; light and dark;
  local fixture market index and fake keys only.

**I7 — card records in the custom chat (instance).**
- R: (1) A card record in Fishball's session shows as one compact row at its place in the
  timeline: kind, outcome, who and where, the asking session's title, the time; expanded, the
  questions or the call, the answer, the note, the closure reason. (2) Its words equal the
  connector's `record.*` words in the same language (U6). (3) Fishball's decision labels are
  unchanged: a label and a record for the same card may both show, with no merge, replacement or
  de-duplication (U5). (4) Inbox notices keep their row. (5) Rows survive a child restart and a page reload, with
  no duplicate after a reconnect. (6) Records never enter a model request; a user answer's notice
  still wakes Fishball (7713 N9-b).
- T: P; EP (record kind: permission / question / plan review / own question / closure; optional
  fields present / absent); BVA (texts at their cap and
  the writer's cut marker); ST (written → shown → restart → shown once).
- AC: each kind's row matches the connector's row for the same record (same words, same fields);
  no duplicate after two restarts; the next request's log has no record text.

**I8 — restyle the custom chat to DSH's look (instance).**
- R: (1) The page loads `dsh-tokens.css` and draws every colour, radius, font and shadow from
  `--dsw-*` / `--dsh-*` tokens; no hard-coded colour remains in `shell.css` except the Fishball
  accent ring (D12). (2) Light on `body`, dark on `body[data-ds-dark-theme]`; I8 set that attribute
  from `prefers-color-scheme`. U3 is decided: I9 mirrors the parent page's attribute instead, live,
  with the OS scheme as the fallback for "Open in a tab". (3) The header, the
  conversation, the user bubble, the composer and the buttons use DSH's measures (§0.5 "Chat
  page"). (4) The permanent title and status tag are gone (D27); a lost connection shows the
  "Reconnecting…" banner only while it lasts. (5) Every behaviour of the chat, the approvals rows,
  the reminders list, the pickers and the uploads is unchanged. (6) The page loads no remote or
  DSH-served file, and the CSP is unchanged.
- T: P (screenshot comparison with a main DSH session at the same size, light and dark); EP
  (scheme light / dark; connection up / lost / back); ST (SSE lost → banner → reconnected → no
  banner).
- AC: a token-name check finds every copied name in the installed `dsh-client-ui-theme` of
  0.2.2-rc.1 (and lists any missing in rc.5); the existing chat suite passes unchanged; no colour
  literal outside the accent; no "Fishball" title or status tag in the page DOM.

**I9 — two language variants (instance).**
- R: (1) `?lang=zh` (first `lang` parameter, exact value) shows every string of the chat, the
  settings view, the approvals and reminders rows, the record rows and the proxy's 503 page in
  Chinese; anything else in English. (2) `<html lang>` is `zh-CN` or `en`. (3) The two
  dictionaries have the same keys. (4) Dates and numbers use the page's language. (5) Switching
  the view (chat ⇄ settings) keeps `lang`. (6) Theme (U3): framed, the page's `body` carries
  `data-ds-dark-theme` exactly while the parent's does, and follows a change live with no reload
  (an unsent draft stays); with no reachable parent (own tab, cross-origin) it follows
  `prefers-color-scheme` live; no parent access throws. (7) A failure the child refuses shows the
  page's own words with the refusal code, not the child's English message; a user row's author is
  the child's `authorKind` worded by the page.
- T: P; EP (`lang`: absent / `en` / `zh` / `ZH` / `zh-CN` / empty / two values; parent: same-origin
  / none / cross-origin); ST (chat → settings → chat keeps `lang`; reload keeps it; parent light →
  dark → light); DT (lang × view → language shown).
- AC: a key-set comparison of the two dictionaries finds no difference; a scan of `src/slim/ui/`
  finds no user-visible string outside them; both variants render on both versions.

**K2 — contract 1.1: language on the framed path (approved, U4).**
- R: (1) The connector frames `ui.chat` or `ui.settings` with a `lang` search parameter equal to
  DSH's active locale id (`zh` or `en`), replacing a `lang` the path already has, before any
  fragment; no `theme` parameter (U3 decided the live mirror instead).
  (2) A locale change in the main DSH reloads the framed page with the new value. (3) "Open in a tab" opens
  the same URL. (4) The contract doc states it; the descriptor and its validation are unchanged;
  `CONNECTOR_CONTRACT.minor` is 1; a 1.0 instance still attaches.
- T: P; EP (path with no query / with a query / with `lang` already / with a fragment; locale zh /
  en); ST (change locale while framed → reload with
  the new `lang`).
- AC: the iframe `src` equals the registered path with exactly the stated parameters; no other
  change to C3's behaviour.

**I10 — remove the truly dead code (both).**
- R: `inst/src/native-control/**` and its export, its snapshot copy and its `host.js` import, and
  `packages/messenger/` are gone with their tests; nothing else is deleted.
- T: P (static scan; pack listings); EP (an import of a removed module → none).
- AC: no reference to a removed path; both packages pack; the full suite is green on both
  versions.

**E1 — end to end (both).** §18.4 below, on both DSH versions, in a fresh disposable main home,
under plain Node and under the DSH-X wrapper. E2E-B2 is the D26 flow. E2E-B1, B5 and B6 check the
connector's frame (D27). E2E-B9 is the language variant (D30).

### 18.3 Spike results (SP, `spike/body-soul-sp` 6f393d2)

*2026-11-07: SP1 and SP3 are a record only (D28 withdrew Option A). SP2's facts stand and are why
the child copies `ELECTRON_RUN_AS_NODE` (§0.5 "Child launch"); its recommended search order is
replaced by D28.*

| Spike | Answer | Design change |
| --- | --- | --- |
| SP1 Option A on rc.5 | works on 0.2.1-rc.5 and 0.2.2-rc.1: shell, combos, RPC, `remote.mux`, server-side token exchange, session-only frame, header action, effort pane, and the chosen effort reaches the model | child routes are Connection Fetch routes (R3 closed); the inert hero workspace chip is accepted (F2); `/permission` restricted to `read-only` (F3); `agentOptions` always passed (F4) — all in §0.5 |
| SP2 child Node under DSH.app | the DSH-X wrapper `core/node/node` (Electron 44.7 as Node 24.21) works; `process.execPath` opens a second GUI; Homebrew Node 22.22 is below 0.2.2's `engines.node >=24.9.0` | new default order and `verifyNode` rules (§0.5, I2); R5 and R8 revised |
| SP3 DSH settings in the iframe | reachable only by `⌘⌥,`, and that opens nothing; disabling the ten `ui-settings-*` page rows (keeping `ui-settings`) removes them cleanly and also the preview notice | rows disabled (§0.5); R6 and R7 closed; I6 opens DSH's Plugins page with `layout.selectPanel('plugins')` |

### 18.4 End-to-end scenarios (E1)

`E2E-B1` install both plugins into a clean profile, restart, open Fishball: Fishball's own chat
page in DSH's look (D29), no profile edit, inside the connector's frame showing `running` and the
Connector settings button; the child runs on the main process's executable (D28). `E2E-B2` with two fake API-key providers in the main home, press
**Check for new models** on the `fishball-instance` card. Both are listed; untick one and press
**Add selected**. Only the ticked one is in the instance, and a second check lists only the
other. Then choose its model and an effort in the iframe and send a message: a reply streams. `E2E-B3` hand over a session with a
note; Fishball messages it through its tools. `E2E-B4` a managed session's permission request is
answered by Fishball; the card record appears in both chats. `E2E-B5` change `maxQueuedInputs` in
DSH's own form of `fishball-connector`, reached through the frame's **Connector settings**
button; the queue boundary moves accordingly, and the instance settings page shows no connector
value and no link of its own. `E2E-B6` kill the child: the frame shows
`failed` with `NATIVE_CHILD_EXITED` and Retry, and the instance's card shows the same state and its
own Retry (I1c); Retry restores the session with its history. `E2E-B7` disable the instance: the connector shows
the no-instance state and queues a `message_fishball`; re-enable: it is delivered once. `E2E-B8`
connector alone with a stub instance (a minimal third-party implementation in the test tree that
attaches over the documented contract): session tools and inbox work. `E2E-B9` (D30) with DSH's
language `zh`, the framed chat and settings view are Chinese, and with `en` English (through K2's `lang`;
before K2 merges, the variant is opened by hand with `?lang=zh`).

### 18.5 Resolved test-design questions

Answers to the open questions of `docs/test-design/connector.md` (`test-design/connector`
9e92622, prefix `conn-`) and `docs/test-design/instance.md` (`test-design/instance` c481dbe, prefix
`inst-`). They are design decisions; the test sessions update their cases to them. Entries the
connector design already marked closed are listed once, as confirmed. A contract-doc change named
here is also an item of §18.6.

**Connector (conn-)**

| Id | Decision |
| --- | --- |
| conn-OQ-01 | `ask_fishball` with no instance returns `unavailable` at once, with the existing text "Fishball cannot answer now. Make the call yourself; the user is asked in this session", and nothing is queued. DESIGN.md §7a.5 is right; design §0.4 and contract §9 were wrong to list it with the queued inputs, and both are corrected (§0.4 done here, §18.6 item 9). Why: `ask_fishball` is a blocking ask before a tool call, so a queued answer would come after the call it was about. The connector "works alone" by passing such requests to the user in their own session. The fire-and-forget inputs (`message_fishball`, notices, hand-over notes) are the ones it queues. |
| conn-OQ-02 | Yes: `queue-full` is the one code for every producer that the bound refuses (the tool result's `code`, the HTTP route's `code`). Contract §9 names it (§18.6 item 9). |
| conn-OQ-03 | Every intake item counts, of every kind. The bound refuses only automated items (`session`, `watch`, `system`, `plugin`, `approval`); a `user` item (a hand-over note, a Take back note) is always accepted, even past the bound, so the user's own action never fails because of Fishball's backlog. Hand over and Take back themselves never answer 409 for a full queue. A managed release note (`system`) refused at the bound is logged and the release still stands, as today. |
| conn-OQ-04 | Closed, confirmed. |
| conn-OQ-05 | No. A request the user is asked about in its own session (no instance attached, or at a detach) is settled there and never offered again. The re-offer after a handshake covers only requests still waiting for the instance, and these only exist while one is attached. A request waiting for the instance at a detach goes to its session's prompt at once (§7a.5, "going off while requests wait"). |
| conn-OQ-06, -07, -09, -10, -12, -13 | Closed, confirmed. |
| conn-OQ-08 | Yes. `fishballConnector.current()` returns `null` with no instance, else a frozen `{id, name, attachedAt, attachCount}`, where `attachCount` counts attaches since the connector row was applied. It is read-only and carries no transport. |
| conn-OQ-11 | Closed: `instance-invalid` (K1). |
| conn-OQ-14 | No-ops. A second `detach()`, a stale handle's `detach()` and a stale transport's `onClose` after a newer attach change nothing and do not throw. |
| conn-OQ-15 | The connector calls `transport.close()` on its own dispose, then forgets the instance. The instance sees its `onClose` and goes to `connector-missing` (inst-OQ-02). |
| conn-OQ-16, -17, -18 | Closed, confirmed (no settings operation, D24). |
| conn-OQ-19 | Connector limits have no maximum; the schema bounds only the minimum (§16 of DESIGN.md), and BVA uses min − 1, min, min + 1. Contract lower bounds: `reason` in `approval.answer` with `allow`, `grant` or `reject`, and in `prompt.answer`, `grant.revoke` and `session.release`, is non-empty (the host already requires it, `reason-required`); option `label`, `header`, each `selected[]` label and `title` are non-empty; `selected[]` may be empty only with `custom` present; an image `total` is ≥ 1. The validators add these (§18.6 item 7). |
| conn-OQ-20 | The connector form keeps the fields that connector code reads after the split: `maxQueuedInputs`, `maxActiveWatches`, `maxPendingApprovals`, `approvalAnswerSeconds`, `argumentExcerptBytes`, `maxMessageBytes`, `auditEntriesKept`, `requestUserMessageBytes`, `rationaleChars`, `watchesShown`, `readSessionMessages`, `readSessionBytes`, `forwardExcerptBytes`, `userMessagesListed`, `userMessageExcerptChars`, plus `questionMode`. Removed with no reader left: `maxSourcesPerPlugin`, `maxFishballOnlyPlugins`, `wakeupsPerHour`, `messagesPerHour`, `sessionsPerHour`, `approvalsShown`, `intakeRowsShown`, `outboxShown`, `pluginHistoryShown`, `settingsPromptValueBytes`, `replyCapShare`, `headroomShare`, `minWindowTokens`, `pluginManagerStartMs`, `defaultReplyCapTokens`, `pileMaxHeightVh`. `watchesShown` stays under its name: it also bounds `list_watches`. |
| conn-OQ-21 | Closed: the fixed icon (D22). |
| conn-OQ-22 | The migration carries the limits of conn-OQ-20 and the question mode (store record `settings/questions` → `questionMode`). The old brand and sidebar-entry record is left in the store and ignored. `POST /api/fishball/brand` and `POST /api/fishball/sidebar-entry` are removed (404). |
| conn-OQ-23 | An attached instance without `ui.chat` (no `ui`, `ui: {}`, settings only): the view shows "<name> is attached and has no chat page" and no iframe; the header keeps the state tag and Retry rules. |
| conn-OQ-24 | The entry is a button "Open instance settings" on the connector's own Plugins card (the `plugins.bundle.config` slot of `fishball-connector`), shown only when the attached instance registered `ui.settings`. It opens that path framed in the Fishball view (main area). The limits form is on the same card, above the button, so it is always reachable. The instance's own Plugins card (I1) shows only the instance's main-DSH fields. |
| conn-OQ-25 | The header stays, as the connector's frame (D27): title "Fishball", the state tag (`unattached` with no instance), the unread count, **Connector settings** (always), Refresh (reloads the frame), "Open in a tab" (opens the framed path, only when there is one). The opener polls `status()` once a second while the view is open (no event in v1). Without `status`, the tag reads "attached". Retry shows only when the state is `failed` and the instance gave `retry`; Retry awaits it and shows its rejection as `NATIVE_UNAVAILABLE`. |
| conn-OQ-26 | Yes, without a reload. |
| conn-OQ-27 | I1. M1 is moves only; `connector-missing` is I1's acceptance. |
| conn-OQ-28 | M1's dev session re-points the suite's links to the two packages (`packages/connector`, `packages/instance`), and the test session moves the cases. Cases of retired modules (§0.2 "retired") retire with I8, not with M1. |
| conn-OQ-29 | Only `./contract` and `./records` (§0.2). |
| conn-OQ-30 | Versions are independent; the connector's major equals its contract major; the instance declares `"fishball-connector": "^1"` as a peer dependency. A test checks the peer range against the contract major. |
| conn-OQ-31 | It opens DSH's Plugins panel (`layout.selectPanel('plugins')`) at its list, with no plugin preselected. |
| conn-OQ-32 | Yes, until acked. |
| conn-OQ-33 | Global arrival order across all kinds and sources, by the ledger's creation order. |
| conn-OQ-34 | One item: Hand over posts the forward (`POST /api/fishball/send`), which publishes one `user` item (the user's note, possibly empty, and the session excerpt) and then marks the session managed without a second note (`src/messaging.js` `forward`, `ManagedRegistry.manage`). The `user` change note exists only for Take back. |
| conn-OQ-35 | Closed, confirmed. |
| conn-OQ-36 | The row id is `fishball-connector` (§0.2, with the one-time migration). DSH's Plugins page shows "Fishball connector" for it, and "Fishball instance" for `fishball-instance`. |
| conn-OQ-37 | The icon is built from DSH's `FISH_LOGO_PATH` and `FISH_LOGO_VIEWBOX` (`dsh-client-ui-primitives`) plus a wrench badge at the bottom right, one SVG in `assets/connector-icon.svg` (the package `icon`) and the same drawing in the client. It is on the sidebar row, the brand button and the connector's Plugins card. The unread count stays on the brand and the row, and the green and yellow dots stay on managed session rows (§8.2). It uses `currentColor` with the magenta eye (`--fb-accent`), so light and dark need no second asset. |
| conn-OQ-38 | Closed, confirmed. |
| conn-OQ-39 | Yes: the panel-list row is always shown; the brand button is a second way in. |
| conn-OQ-40 | Confirmed: I6 shows no connector value and edits none (inst-OQ-05), and E2E-B5 is rewritten to change the limit in DSH's own form (§18.4). |
| conn-OQ-41 | Done by this commit: §0.4, §0.7, §18.2 K1 and C2, and §18.4 no longer describe settings over the contract. §7's brand-style and "Sidebar entry" text are superseded by D22. |
| conn-OQ-42 | Yes: contract §0 must list the connector settings as "its limits and question mode" only (§18.6 item 1). |
| conn-OQ-43 | A handshake **shape** break (missing or unknown key, a non-string or empty name, duplicates) fails validation and closes the channel. A well-formed handshake whose `requiredCapabilities` is not a subset of `capabilities`, names an operation unknown to the connector, or names one it does not serve now, is answered with an `error` frame `unsupported-capability`, and the channel stays open for a corrected handshake. A `capabilities` list without `inbox.push` is answered `unsupported-capability` too: the connector cannot deliver. The validator's `knownCapabilities` check moves from payload validation to this answer (§18.6 item 4). |
| conn-OQ-44 | A request whose `operation` is not a v1 operation name (for example `settings.update`) is answered with an `error` frame `unsupported-operation`, and the channel stays open. It is not a validation failure, because a newer minor may add names that an older peer must refuse politely (§2). The frame must otherwise be a valid envelope; its payload is not validated. A known operation outside the welcome stays `unsupported-operation` too (§18.6 item 3). |
| conn-OQ-45 | `transfersPerMessage` is the number of **files** (non-image transfers) per message: 1. Images use one `attachment.put` each, up to `attachmentsPerMessage` (20) hostRefs per message. The doc says so (§18.6 item 8). |
| conn-OQ-46 | `expired`, for a hostRef that is unknown, expired or already consumed, answered on the `session.start`, `session.message` or `session.redirect` that carries it; nothing is sent then (the bridge already throws it, `src/slim/host/images.js:160`). Contract §7 lists it (§18.6 item 8). |
| conn-OQ-47 | The doc gives one signature line per helper with its failure form: every validator and helper **throws** `ContractError` with `.code` (`validateAttachment`, `negotiateContract`, `validateRequest`, `validateResponse`, `validateEvent`, `validateEnvelope`, `requireCapabilities`, `encodeEnvelope`, `decodeEnvelope`); `makeEnvelope` never throws; each returns what §10 names (§18.6 item 10). Module-level cases stay valid. |
| conn-OQ-48 | Yes: after a channel the connector closes because a frame failed validation, or after a handshake timeout, it calls `transport.close()` and returns to no-instance mode, so a new attach is accepted. A refused but well-formed handshake (conn-OQ-43) keeps the channel and the attachment. |
| conn-OQ-49 | Yes: `attachInstance` and `current()`, nothing else. |
| conn-OQ-50 | A `ui` path is refused when its query or its fragment, parsed as URL search parameters, has a parameter named `token` in any ASCII case, after percent-decoding (`?Token=`, `?%74oken=`, `#token=`). `access_token` and other names are accepted: the rule guards DSH's own launch-token name, not every credential spelling (§18.6 item 5). |
| conn-OQ-51 | Unused. |
| conn-OQ-52 | `ui: {}` is accepted, the same as no `ui`. `ui: null` is refused `ui-invalid` (§18.6 item 6). |
| conn-OQ-53 | The opener shows `failed` with `NATIVE_UNAVAILABLE`, and logs the reason once per change. |

**Instance (inst-)**

*2026-11-07 (D28–D30):* inst-OQ-08, -10 (the launch token), -12 (the Option A parts: `remote.mux`,
`plugins/events`, `api/session/uploadFileBinary`), -14 (the rail and DSH's picker), -15, -16, -22
and -23 no longer apply: they were about DSH's Web UI in the child. inst-OQ-04 is replaced by
§0.7 and U1 (the form has only `enabled`; no Node order). inst-OQ-07 stands without the Web
services: a missing core service or app server fails with `NATIVE_START_FAILED`. inst-OQ-11 and
-13 stand for the bearer proxy, without the token rule (there is no launch token; a browser
`token` query is still refused 400). inst-OQ-17 stands for I6's Plugins block, now in the custom
view. inst-OQ-19 is replaced: the custom chat's routes and the admin routes stay (D29); only
`/api/fishball/native/status` (→ `/api/fishball-instance/status`, I1c) and
`/api/fishball/native/provider-sync/sync` (→ `models/check` and `models/add`, I6) go. inst-OQ-20:
"follows within 2 s" becomes "the connector reloads the frame with the new `lang`" (K2).

| Id | Decision |
| --- | --- |
| inst-OQ-01 | The connector's attach state and count: `fishballConnector.current()` (conn-OQ-08). The instance's own status and reason: its Plugins card in the main DSH (the `plugins.bundle.config` slot of `fishball-instance`, rendered by `packages/instance/client.js`), and `GET /api/fishball-instance/status` (owner-only Fetch route, `{state, code}`). The connector's Fishball view is not used when the connector is missing. |
| inst-OQ-02 | Yes: `connector-missing`, the child stopped. Enabling the connector again needs no main restart: the instance's optional `ctx.inject(['fishballConnector'])` sub-scope activates when the service appears, and the instance starts. |
| inst-OQ-03 | `instance-busy` → status `failed`, code `NATIVE_INSTANCE_BUSY`; `contract-version` → `failed`, `NATIVE_CONTRACT_VERSION`. In both the instance stops its child (no attach means nothing can use it) and does not retry by itself; Retry on its card tries again. The two codes join the instance's status codes; they are instance codes, not contract codes. |
| inst-OQ-04 | The main DSH exposes exactly `enabled`, `nodeExecutable` and `executableSearchPath` in the `fishball-instance` form (§0.7), because they are needed before the child exists. The same card has the "Model for Fishball" sync button (D26), an action and not a field; `providerSync` is gone. Runtime limits are fixed constants and are no longer settings. The Node default is SP2's order (§0.5). |
| inst-OQ-05 | I6 shows no connector value at all, and no link to it either (D27): the connector's frame has the **Connector settings** button. |
| inst-OQ-06 | Row ids `fishball-connector` and `fishball-instance`, with the one-time migration of §0.2. Display names "Fishball connector" and "Fishball instance". The assistant keeps the name Fishball: the Fishball view title, the sidebar row "Fishball", the preset id `fishball`, the `session-fishball-` prefix and the wire names `message_fishball`, `ask_fishball`, `ROLE.fishball` stay (contract §0). |
| inst-OQ-07 | Startup timeout 60 s (`startupTimeoutMs`, a fixed constant now), code `NATIVE_TIMEOUT`. A missing required service fails at once with `NATIVE_START_FAILED` (the child reports `MISSING_CAPABILITY`, which the host maps to that safe code). |
| inst-OQ-08 | A malformed manifest (unreadable JSON, or `dsh.profile.bundles` not an array of strings) fails the start with `NATIVE_START_FAILED` and is left unchanged. `dsh-web-app` goes right after `dsh-base`, then the owner bundles in their order. The backup is `package.json.pre-option-a-<UTC stamp>` (exclusive create). A second start finds the manifest already right and makes no backup; only a later change makes a new one. |
| inst-OQ-09 | Failed until Retry; no automatic restart (§11 and the lifecycle rules). |
| inst-OQ-10 | Yes, tests may pre-seed an owner bundle in the child home (the instance keeps owner bundles, inst-OQ-08). The launch token is constant within one child process (`processLaunchToken` keeps one per process owner, `dsh-client-connection/lib/index.js:294`); a restart makes a new one. |
| inst-OQ-11 | Checked in this order, first failure wins: (1) method not GET, HEAD or POST → 405 with `Allow: GET, HEAD, POST`; (2) path: not under `/fishball/embed/`, a `..` segment (decoded or encoded), a backslash, or an absolute URL in the request target → 400; (3) the main DSH's own admission, `connection.requestRejection` → its status (403 for a foreign Host or Origin, 401 for no or expired cookie), so site beats auth as in DSH; `requestRejection` already answers 403 for `Sec-Fetch-Site: cross-site` (`dsh-client-connection/lib/index.js:246`); `same-origin`, `same-site`, `none` (a typed URL, a reload, "Open in a tab") and an absent header are accepted, because DSH's own fence accepts them and the cookie is `SameSite=Strict`, so §3.1's "requires same-origin" is relaxed to "refuses cross-site". (4) a `token` query parameter → 400; (5) a body over its limit → 413; (6) the 33rd concurrent stream → 503 with `Retry-After: 1`; (7) instance not ready → 503 error page. |
| inst-OQ-12 | The §3.3 headers apply to the document response only: `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, and `Content-Security-Policy: frame-ancestors 'self'`. The other CSP directives are dropped, because DSH's own app sets its needs and a stricter policy would break `remote.mux`; assets keep the child's caching headers. Streams: `api/remote.mux` and DSH's SSE route `plugins/events` count toward the 32 concurrent streams; the 30 s idle timeout applies to that SSE route only, not to the WebSocket, which has its own ping. The 8 MiB route is `api/session/uploadFileBinary` (DSH's upload, `dsh-client-file-upload/lib/client.js:62`); every other POST is 1 MiB. `/fishball/embed` without the slash → 308 to `/fishball/embed/`. A browser `token` query → 400 (never forwarded, never stripped silently). |
| inst-OQ-13 | Disabled instance: the route is removed, so 404. Enabled but `connector-missing`, `failed`, `stopped` or starting: 503 with the error page. |
| inst-OQ-14 | Default effort: the catalog entry's `reasoning.defaultEffort`, as DSH's picker sets it (`dsh-client-ui-model-selection/lib/client.js:1184` / `:1201`); without one, the provider default (no effort sent). A chosen effort does not carry over to another model; the new model's default applies. The header action writes `?view=settings` with `replaceState`, and Back removes it. Only the first `view` parameter counts, and only the exact lowercase `settings`; anything else shows the chat. The rail is 56 px ± 1 px. |
| inst-OQ-15 | Blocked by composition, not by key handlers: with the sidebar shadowed and the settings rows disabled, the New Session and Open settings shortcuts do nothing (SP3). The permission-mode command is restricted to `read-only` (SP F3). Tests assert "no effect", not "key consumed". |
| inst-OQ-16 | Archiving Fishball's session is refused while the instance runs (the session reports activity), as the legacy session was. A session found archived at start (archived while the instance was off) is unarchived and resumed, never replaced. The preset is registered in the app row's apply, before the session is created or resumed, and DSH's own controller cannot resume it earlier, because the session is not listed before the workspace attach that follows the preset. |
| inst-OQ-17 | Recommended plugins come from Fishball's own curated list (`src/recommended.js`), not from the market index, so tests need no network; an Install opens DSH's install for the listed spec, and tests point it at a local fixture pack. "Nothing new to add" when the check lists no missing provider (D26; was "Nothing new to sync"). During a restart the page shows "Restarting…" and disables its controls until it reconnects. |
| inst-OQ-18 | Plugin records, never in a model request: card records (`plugin:fishball/card-record`) and inbox notices about refused or failed inbox items (`plugin:fishball/inbox-notice`). Turns or injected messages the model sees: `session`, `user`, `watch`, `approval` and `system` inbox items, and the `tell` text that accompanies a card record. Record texts are cut by their writer to the contract caps (`LIMITS`: 500, 200, 2,000 characters by field) with the marker `…` as the last character; a notice is cut at 8,000 characters with the same marker. |
| inst-OQ-19 | Retired, 404 after I8: under `/fishball/embed/`, `api/health`, `api/chat`, `api/model`, `api/upload`, `api/images/*`, `api/approvals`, `api/approvals/answer`, `api/reminders`, `api/events` (the custom server; DSH's own `api/*` still pass through), and `ui/*`; on the main DSH, `/api/fishball/native/admin/*` and `/api/fishball/native/provider-sync/sync` (replaced by `/api/fishball-instance/models/check` and `/models/add` on the main DSH, D26; there is no child sync route and no upward `providerSync.request`); `/api/fishball/brand` and `/api/fishball/sidebar-entry` (C2). `native-control` has no HTTP endpoint. |
| inst-OQ-20 | Live, without a reload, within 2 s (I9). |
| inst-OQ-21 | Yes: a package in the test tree, installed into the disposable main profile. An instance without `ui` shows conn-OQ-23's outcome. |
| inst-OQ-22 | Blockers. SP1 proved the frame on rc.5, so an I4, I5 or E1 failure on either version blocks the task. |
| inst-OQ-23 | Yes, the same notice and version (`dsh-client-ui-settings-models/lib/client.js:3051-3058` on rc.5). It is retired on both versions by disabling `ui-settings-models` (R7). |

### 18.6 Contract-doc corrections (`docs/connector-contract.md` at `feat/k1-contract` bb0f756)

For one dev session (task K1b), changing the doc and `src/connector/contract.js` together:

- [ ] 1. §0: the connector settings are "its limits and question mode" only; delete "brand icon and
  sidebar entry" (conn-OQ-42, D22).
- [ ] 2. §0 and §11: close the two open points. `instance-invalid` is final (no "(open point,
  §11)" in §1.1 and §7); fragments are accepted (no open-point mark in §1.2); remove §11 or leave it
  empty.
- [ ] 3. §3.1/§3.2: a request whose `operation` is not a v1 name is an `error` frame
  `unsupported-operation` and the channel stays open; `validateEnvelope` no longer throws
  `unsupported-operation` for an unknown name on a request, it returns the envelope with the
  payload unvalidated for the bridge to refuse; responses and events with unknown names still
  close (conn-OQ-44).
- [ ] 4. §3.2: split handshake failures: shape breaks close the channel; a well-formed handshake
  whose required set is not a subset of `capabilities`, names an unknown or unserved operation, or
  whose `capabilities` lacks `inbox.push`, gets `unsupported-capability` and the channel stays
  open. Move `knownCapabilities` out of payload validation (conn-OQ-43).
- [ ] 5. §1.2: the `token` rule covers the query and the fragment, any ASCII case, after
  percent-decoding; `access_token` stays accepted (conn-OQ-50).
- [ ] 6. §1.1: `ui: {}` accepted, `ui: null` refused `ui-invalid` (conn-OQ-52).
- [ ] 7. §4 and §8: lower bounds (conn-OQ-19): non-empty `reason` where the host requires a
  reason, non-empty option `label`, `header`, selected labels and `title`; `selected[]` empty only
  with `custom`; image `total` ≥ 1.
- [ ] 8. §4.4, §7, §8: `transfersPerMessage` is files per message (1), images up to
  `attachmentsPerMessage`; add `expired` as the refusal for an unknown, expired or consumed hostRef,
  answered on the message that carries it (conn-OQ-45, -46).
- [ ] 9. §9: `ask_fishball` and direct calls are not queued (`unavailable` at once, user asked in
  the session); name `queue-full`; state the `user`-kind exemption and the global arrival order;
  connector settings in the form of `fishball-connector` (conn-OQ-01, -02, -03, -33).
- [ ] 10. §1 and §10: document `current()` and its shape (conn-OQ-08, -49); the no-op rule for a
  second or stale `detach()` and a stale `onClose` (conn-OQ-14); the connector's `transport.close()`
  on its dispose and after a closing failure (conn-OQ-15, -48); one signature line per helper with
  "throws `ContractError`" or "never throws" (conn-OQ-47).
- [ ] 11. §5.1: the re-offer after a handshake covers only requests still waiting for an instance;
  a request settled in its own session is never offered again (conn-OQ-05).
- [ ] 12. §0 terms: row ids `fishball-connector` and `fishball-instance`; no row `fishball`
  (inst-OQ-06).
- [x] 13. ~~§1: one browser message, `fishball-connector:open-settings`~~ **Dropped (D27).** The
  frame around the instance's page is the connector's, and its own **Connector settings** button
  opens DSH's form. Contract v1 has no browser message at all. Neither `feat/k1-contract` bb0f756
  nor `feat/k1b-contract` ea4ba85 names one yet, so K1b adds none. It only adds one sentence to
  §1.2: "The connector frames `ui` pages in its own view and exchanges no browser messages with
  them."
- [ ] 14. §1.2 (D27): `ui` pages are shown inside the connector's frame, which shows the
  instance's `status()` state and the connector's unread count. An instance's page should not draw
  its own status or connector controls. This is guidance for third-party instances, not a
  validated rule; nothing in `contract.js` changes for it.

### 18.7 What the test designs now say wrongly (D26, D27; D28–D30 added 2026-11-07)

For the owners of `docs/test-design/connector.md` (`test-design/connector` 9e92622) and
`docs/test-design/instance.md` (`test-design/instance` c481dbe). Each line names the cases, what
they say and what is now right.

**`instance.md`**
- [ ] UD2 (line 16), I6-R5, I6-P-12, I6-AC6: "the main DSH gets only the sync options". Now the
  `fishball-instance` form has exactly `enabled`, `nodeExecutable` and `executableSearchPath`, and
  the card also has the sync button. There is no sync option and no `providerSync` (D26,
  inst-OQ-04).
- [ ] I6-R2, I6-P-01, I6-P-03, I6-P-04, I6-P-05, I6-EP-02, I6-EP-03, I6-BVA-03..05, I6-ST-02,
  I6-ST-03, I6-ST-X2, I6-DT-02, decision-table rule 2, I6-AC3: "Refresh models" on the settings
  page, writing everything in one step, with the line "Synced from DSH: n new · m already". Now
  the settings page has no sync button. The flow is on the `fishball-instance` Plugins card in the
  main DSH: Check for new models → a list of the missing providers with checkboxes → Add selected
  writes only the ticked ones (§10, §18.2 I6 R4–R9). Rewrite these against the new T line of
  §18.2 I6. New cases are needed for untick / none ticked / Cancel / stale `checkId` / an id not in
  the list / a restart between Check and Add / wire lost during Add (`result-unknown`).
- [ ] I6-ST-02: "concurrent clicks share one run". Now concurrent **Check** presses share one
  check; a second **Add** during an Add is refused `sync-busy` (§10).
- [ ] I6-R7, I6-P-11: "the two upward wire requests (`instance.restart`, `providerSync.request`)".
  Now only `instance.restart`; the sync runs on the main DSH from its own card. I6-P-11's "Refresh
  ×2" becomes "Check and Add ×2 on the main card", and its expectation (main manifest, connector
  config and main credential store unchanged) stands.
- [ ] I6-R4, I6-P-01, I6-P-10, I6-BVA-01, I6-BVA-02, I6-AC1: "connector settings absent or
  read-only (OQ-05)". It is decided: absent, with no line or link to them on the page (inst-OQ-05,
  D27). Cases that check a read-only value become "no connector value and no connector link".
- [ ] I4-P-04 precondition "via Refresh models": now "via Check for new models and Add selected on
  the instance's card".
- [ ] I4 (new cases): the child page has no status tag, no unread count, no connector link and
  calls no `parent.postMessage` (§18.2 I4 AC).
- [ ] E1-B2: "Settings page → Refresh models". Now the check → untick → add → check again flow of
  §18.4 E2E-B2, started from the main DSH's card.
- [ ] E1-B5: "the instance page shows it read-only or not at all". Now not at all. The limit is
  reached through the frame's **Connector settings** button.
- [ ] E1-B1, E1-B6: add the frame's state tag (`running`, then `failed` with the code, then
  `running` after Retry).
- [ ] The question at line 771 (`/api/fishball/native/provider-sync/sync` retired): yes, and its
  replacements are the main-side `/api/fishball-instance/models/check` and `/models/add`
  (inst-OQ-19).

**`connector.md`**
- [ ] C3-R7, C3-P-08, C3-EP-08, C3-ST-07: the header is now the connector's frame (D27). Add the
  unread count (equal to the brand's), the `unattached` tag with no instance, and the
  **Connector settings** button.
- [ ] C3-R4, C3-P-06, C3-P-14, C3-EP-01..05, C3-DT-01..05 column "DSH's form reachable": still
  right, and now also reachable from the frame's **Connector settings** in every rule, with and
  without an instance. Add that column, or a case per rule.
- [ ] New C3 cases: the frame wraps `ui.settings` exactly as `ui.chat` (the same tag and buttons);
  a `postMessage` from the iframe of any shape, `{type:'fishball-connector:open-settings'}`
  included, changes nothing; the unread BVA of §18.2 C3.
- [ ] C2 (new case): neither row's form has a `providerSync` field, and a stored old value
  changes nothing (§18.2 C2 R6).
- [ ] Any K1/K1b case written for §18.6 item 13 (`fishball-connector:open-settings`) is
  withdrawn: item 13 is dropped.

**2026-11-07 (D28–D30): obsolete cases in `instance.md`.** Withdrawn means the requirement is gone;
rewrite means the case keeps its idea against the new §18.2 text.

- [ ] **I2 (§4), withdrawn:** I2-R1, R2, R4, R5, R7 with I2-P-01, P-02, P-03, P-04, P-06, I2-EP-01..03,
  I2-BVA-04..06, I2-DT-01..06 and the decision table; I2-AC1..AC3, AC5, AC6. They test the
  `[base, web-app]` migration, the `ui-*` rows, `web-runtime`, the Web readiness services and the
  preview notice. The existing slim-migration tests (`dsh-web-app` dropped, `.pre-slim-` backup)
  stay the coverage for the manifest. **Rewrite:** I2-ST-01..04, I2-ST-X1..X3, I2-BVA-01..03
  (lifecycle and the 60 s bound) stand unchanged; I2-R6 / I2-P-05 / I2-AC4 become "the bearer
  never reaches the disk or logs" (there is no launch token). **New:** the I2 T line of §18.2
  (main runtime × `ELECTRON_RUN_AS_NODE`, `execArgv` filter, `RUNTIME_ENV`, a fake key outside it).
- [ ] **I3 (§5), withdrawn as a task:** the token-exchange and WebSocket cases I3-R3, R9 with
  I3-P-04, I3-EP-16, EP-17, I3-ST-02, ST-03, ST-X1, I3-SEC-02 (child `Set-Cookie`), SEC-04's
  cookie part, SEC-08's upgrade part, I3-BVA-10..12 for `remote.mux`, I3-AC1's WebSocket and
  I3-AC6's re-exchange. **Kept as regression of the existing bearer proxy (no task owns new
  work):** the admission, method, path, limit and 503 cases (I3-P-01..03, P-05..08, I3-EP-01..15,
  EP-18, I3-BVA-01..09, I3-ST-01, ST-04, I3-DT-01..07, I3-SEC-01, 03, 05..07, 09, 10), read with
  "bearer" for "launch token and child cookie", the SSE `api/events` stream for "streams", and
  `api/upload` for the 8 MiB route.
- [ ] **I4 (§6), withdrawn:** every case (I4-R1..R7, I4-P-01..09, I4-EP-01..05, I4-ST-01..05,
  ST-X1, ST-X2, I4-DT-01..04, I4-AC1..AC5). **Moved, rewritten:** the `view` cases (I4-P-07, P-08,
  I4-EP-02..04, I4-ST-01..05, ST-X1, ST-X2) go to I6's view R1 against the custom page; the effort
  cases (I4-P-04..06, I4-EP-01, I4-DT-01..04) stay valid against the custom composer's pickers and
  move to I8's regression; the "no frame chrome, no `postMessage`" case of §18.7 above moves to
  I8.
- [ ] **I5 (§7), withdrawn:** I5-R2, R4, I5-P-02, P-06, I5-DT-02, DT-04, I5-AC5 (preset, workspace,
  DSH's session-controller resume, "Choose workspace"). **Kept, unchanged task-free regression:**
  I5-P-01 without the preset and workspace parts, P-03, P-04, P-05 (rewritten: no DSH RPC exists to
  change the preset; the check is that the custom page has no permission control), P-07,
  I5-ST-01..05, ST-X1, I5-DT-01, DT-03.
- [ ] **I6 (§8):** I6-R3 / P-06..09 / EP-04, EP-05 / ST-04 / DT-03 now target the custom view's
  Plugins block over the admin routes, not DSH's Plugins page. I6-R7 and I6-P-11: the only page
  write to the main DSH is `admin.restart`; there is no upward `instance.restart`. I6-P-12: the
  instance's form has only `enabled` (U1).
- [ ] **I7 (§9):** I7-R2/R3, I7-P-04 "one shared module": now "the same words and fields as the
  connector's row" (U6). U5: a label and a record for the same card both show; no
  de-duplication case.
- [ ] **I8 (§10), withdrawn:** I8-R1, R2, I8-P-01..03, I8-EP-01..04 (deleting the custom chat, the
  admin relay and their routes; D29 keeps them). I8-EP-05 and P-04, P-05 stay as regression.
  I8-P-01..03's static-scan idea moves to I10 for `native-control` and `messenger` only.
- [ ] **I9 (§11), withdrawn:** I9-R1, R2 and I9-P-01, I9-DT-01..06, I9-ST-01..03, I9-AC1, AC2 (the
  iframe follows DSH's theme and language live). **New:** I9's language cases of §18.2 and its
  theme cases (U3 decided: R6); the language live-follow cases become K2's reload cases.
- [ ] **I1 (§3):** I1-EP-04 and I1-EP-05 (`nodeExecutable` explicit or missing) are withdrawn: U1
  removed the field; their idea moves to I2's runtime EP and its "old stored values" case. I1-ST-02's "Fishball view" observation
  of `failed` and Retry needs I1c.
- [ ] **E1 (§12):** E1-B1 "DSH's session view in the iframe" becomes "Fishball's chat page in DSH's
  look"; E1-B2 "choose `fake-effort` and `high`" uses the custom pickers; E1-SEC drops the launch
  token and the child cookie (there are none) and keeps the bearer, the main cookie and the fake
  key; E1-B8c is wrong since conn-OQ-01 (`ask_fishball` is never queued) and must drop the
  `ask_fishball` item. New: E1-B9 (D30).
- [ ] **Open questions (§15):** OQ-08, OQ-10, OQ-12 (Option A parts), OQ-14, OQ-15, OQ-16, OQ-22 and
  OQ-23 are moot; OQ-04 and OQ-20 are replaced (§18.5 note above).

**2026-11-07: `connector.md`.** No C-case is obsolete: C3 is delivered against D27 and unchanged.
K2 is approved (U4), so C3-P-03, C3-P-04, C3-P-05, C3-P-15, C3-ST-01, C3-ST-03 and C3-DT-03/-05
("`src` === `ui.chat` exactly") become "`ui.chat` with exactly the K2 parameters", and K2 gets its
own cases (§18.2 K2).
