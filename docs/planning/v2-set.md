# SET: the slim Fishball settings panel in the child (V2)

Delivers the SET row of [final V2 scope §4](<v2-final-scope.md#L154>) and
[instance-extension-points §11.8](<../plugins/instance-extension-points.md#L1459-L1479>). Cases:
[SET cases](<../test-design/v2-origin-lite-set-cases.md#L159-L227>).

## User decisions this follows

- Keep our settings page, slimmed: status, Restart, the effective Read Only line, and links that
  open the child DSH's own Settings and Plugins pages.
- **Model sync is main-only (the user's decision of 2026-11-11, superseding SET 8e9a658's child
  sync):** "不允许子实例发起模型同步，只能主实例主动同步给子实例，也就是放在connector那". The child
  never starts a sync. Only the owner's click in the main DSH's "Model for Fishball" block on the
  `fishball-instance` Plugins card does. The child's panel shows a read-only note pointing there.
- Plugin toggles and plugin settings live on DSH's native Plugins page. "现在的UI不要改，原来怎么配置插件现在就还怎么配置":
  the main DSH's `fishball-instance` Plugins card is unchanged, and so are its "Model for Fishball" block and routes.
- Bundled plugins: V2 ships none ("第二版的附带插件也全都放到第三版"), so no Remove button is
  hidden. The CSS rule of §11.10 moves to V3 with bundled placement.
- Model sync (main card only): one button fetches once and is incremental. The block lists only
  what the instance lacks, and the user ticks which to add. Only API-key providers are offered, and keys stay in
  `credential-local`. Existing and conflicting entries are skipped, and partial success is reported per entry.
- A failed write or restart that the user can reach is shown honestly; none is reported as success.

## Public behaviour (contract for tests)

### Child UI package `child-web/fishball-settings/` (child only)

- **Row.** It is mounted by its own launch-overlay row `fishball-settings`, and never in the main DSH.
  - Its host half (`index.js`) needs `nativeRuntime` and `connection`.
  - Its browser half (`client.js`, id `fishball-settings`) needs `slots`, `layout`, `locale`; `pluginNavigation` is read with `ctx.get`.
- **Panel.** A native `main` panel with id `fishball-settings`; the root carries `data-fishball-settings`. It shows, in this order:
  1. **Status.** This is the main card's own status line, the same component and words: state tag, safe code, the reason
     text, and Retry while `failed` (`data-fishball-instance-state`, `data-fishball-instance-retry`).
     Below it is a **Restart** button (`data-fishball-settings-restart`).
     - Restart posts `api/fishball-instance/restart` and reads "Restarting…" while the request runs.
     - A refusal shows the code in an alert (`data-fishball-settings-restart-error`). Restart can be pressed again.
     - A restart that ran but ended `failed` updates the status line. It also shows the alert with the failure code.
     - A lost connection keeps "Restarting…", because the child being restarted is this page's own
       server. The connector's frame reloads the page when the new child attaches.
  2. **Model sync note.** One read-only line (`data-fishball-settings-model-sync-note`), with no button or link:
     "New models from DSH are added in the main DSH: Plugins → Fishball instance → Model for Fishball."
     The panel has no sync control and no `data-fishball-model-*` element, and it never posts `models/check` or `models/add`.
  3. **Read Only line.** One line (`data-fishball-settings-readonly`) explaining that Fishball runs read-only in its
     instance and that this is fixed.
  4. **Links.** Two buttons (`data-fishball-settings-open="settings"` and `="plugins"`):
     - Settings opens the child's native Settings dialog through the page's Settings launcher. Closing the dialog returns to this panel.
     - Plugins opens DSH's native Plugins page (`pluginNavigation.openList()`, or `layout.selectPanel('plugins')`).
       Fishball's own navigation button returns to the conversation.
- **No other controls.** There is no model sync control, no model/effort picker, no plugin list or toggle, no plugin
  settings form, no recommendation list, no Watchdog control, no question-mode or answer-seconds
  control, and no permission picker.
- **Entry points.**
  - A session header action (`conversation.session.header.actions`, id `fishball-settings`,
    `data-fishball-settings-entry`) opens the panel.
  - The `view=settings` continuation in `location.hash` opens it once per page load. It opens at load.
    It opens once more when the Fishball page first marks its conversation ready (`data-fishball-session`
    on `<html>`), because LITE's one-time manager selection (`dev/v2-lite` e7e3423) closes panels.
    That second open happens only while no other panel is open, so a choice the user made meanwhile stands.
    Nothing re-opens it after that.
- **Language.** en/zh follow the child's active locale.

### Child Fetch routes (owner-only, the child's native admission)

These are the same paths and answer shapes as the main card's routes, so the shared UI is unchanged:

| Route | Answer |
|---|---|
| `GET api/fishball-instance/status` | `{state, code}`. `{state: 'unavailable', code: null}` while the relay to the main host is down |
| `POST api/fishball-instance/retry` | `{state, code}` after the main host's Retry (a restart only from `failed`) |
| `POST api/fishball-instance/restart` | `{ok:true,result:{state,code}}` or `{ok:false,error:{code}}` |

There is no `models/check` or `models/add` route in the child. DSH's Fetch registry answers 404 for
those paths. They exist only as the main DSH's owner routes behind the main card.

### Settings relay (child → main), `src/slim/settings-relay.js`

- **Transport.** A payload channel `instance-settings` on the authenticated lifecycle wire, beside
  `control`, `admin` and `provider-sync`. Requests flow child → main; the main host answers.
- **Request frame:** `{v: 1, id, op, payload}`, where `op` is one of `status`, `retry`, `restart`; every op takes `{}`.
  - An invalid frame is answered `invalid-request` when it carries an id, and dropped otherwise.
    That covers the former `check` and `add` ops: they are unknown ops, refused before any handler
    runs. The main end has no sync handler at all.
- **Reply frame:** `{v: 1, id, ok: true, result}` or `{v: 1, id, ok: false, error: {code}}`.
- **Main host.**
  - `status`, `retry` and `restart` answer the instance's public `{state, code}`; restart is queued like every other start and stop.
  - No key, endpoint, path or token ever crosses toward the child page.
- **Child client.** Each request has a time bound. A detached, closed or timed-out request answers
  a typed refusal and is never retried.
  - Bounds come from existing limits:
    - status gets the lifecycle request bound;
    - Retry and Restart get the stop plus startup bounds.
  - A request that could not be sent answers `settings-relay-unavailable`. One whose wire closed answers `settings-relay-disconnected`.
- **Main end.**
  - It replies only on the wire a request came in on. A request still running across a child restart is never answered to the new generation.
  - In-flight requests are bounded by the lifecycle wire's pending bound; beyond it, a request is refused `settings-relay-unavailable`.
- **Exports:**
  - `SETTINGS_RELAY`: `channel`, `version`, `op`, `code`, `limits`.
  - `createSettingsRelayServer(handlers)` → `{attach(transport), close()}`.
    - `handlers` is `{status, retry, restart}`. Each may be async and answers the op's result.
      Any other key is ignored and never called.
    - A throwing handler answers `{ok:false, error:{code:'settings-relay-failed'}}`.
  - `createSettingsRelayClient({timeoutMs?})` → `{attach(transport), close(), request(op, payload)}`.
    - `request` always resolves `{ok, result|error}`.
    - Codes: `settings-relay-unavailable` (no transport), `settings-relay-disconnected`,
      `settings-relay-timeout`, `settings-relay-closed`, `invalid-request` (bad op/payload, refused locally).
  - The transport is `{send(string), onMessage(fn) → dispose, onClose(fn) → dispose}`, as for the admin channel.
- **Child row** `child-web/fishball-settings/index.js`: exports `name`, `inject`, `apply(ctx)`.
  `apply` registers the child Fetch routes above on `ctx.connection.fetch` and attaches the client via
  `ctx.nativeRuntime.onInstanceSettingsTransport(listener)`.
- **Launch overlay** inserts the row `{id: 'fishball-settings', name: <snapshot>/child-web/fishball-settings/index.js}`
  after `fishball-page`. The snapshot copy places the instance's `client.js` at
  `child-web/fishball-settings/client.instance.js`. The panel loads that file as its package-local chunk
  (`require.async('./client.instance.js')`), so the status line comes from one source file
  in both processes. That chunk's `shared` export has no `ModelSync`.

## Remaining limits

- **Not proven here: browser behaviour on both SDKs.** That covers panel rendering, the `view=settings` open order against
  the page's first manager selection, the Settings dialog through the launcher, and Plugins
  navigation and return. These are post-merge `:7713` E2E.
- **Settings link.** No public service opens native Settings. The single `settings.launcher` slot owner
  (LITE's `fishball-page`) holds the only `openSettings` callback, so the link presses that
  launcher's button, looked up on each press. When the launcher is absent, the panel shows an alert instead.
- **Child-side authority (decided 2026-11-11 for model sync).** The user chose "main only" for
  model sync. 8e9a658's `childInitiatedSync` entry point in `host.js`, the relay's `check`/`add`
  ops and the child's `models/check|add` routes are removed rather than gated. A gate would leave a
  child-reachable path to the main DSH's provider inventory whose safety rests on one check. With
  no op and no handler, nothing on the lifecycle wire lets code in the child reach it. That is a
  wire boundary only: child plugins run as the same OS user, which no relay rule can fence.
  It is back to the pre-SET rule: only an owner click on the main card starts a sync
  (slim-native-design §10). Still open: any code in the child process can call the relay's
  status, Retry and Restart as the panel does. That includes a plugin the user installed into
  the child. These are lifecycle requests only and copy nothing. A restart does end an Add the
  owner started on the main card, which then reports `failed` `result-unknown` per entry.
- **Chunk delivery.** The shared source registers as the panel's chunk by its own script URL
  (`document.currentScript`). That holds for the default DSH bundle loader in both SDKs.
  A deployment `__DSH_TRANSPORT__.loadBundle` that inserts no `<script>` leaves the panel on its
  "could not be loaded" message with Retry. It also registers a stray `fishball-instance` factory in the child.
- **Baseline guard.** On this branch's base, the old fishball-page guard (`panels: ['plugins']`) closes any other
  panel at once. LITE's e7e3423 removes that guard. Until INTEGRATE merges LITE, the panel opens and closes immediately.
- **Race outcome (fixed here, main card).** A chosen provider whose key the child gained between Check and
  Add was reported `failed` `key-not-saved`; it is now `skipped` `provider-exists`, per §10. The kept key is never overwritten.
- **Plugins → back.** DSH's Plugins page has no back link to this panel; Fishball's navigation button
  returns to the conversation, and the header action reopens the panel.
