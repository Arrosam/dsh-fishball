/**
 * Vocabulary of the pages area. Product values come from the requirements: the instance README
 * ("Settings page", "Plugins for Fishball", the states under "Ready"), DSH's plugin-manager README
 * (slot names and keys), DESIGN §28 as quoted by the README (the Restart confirmation). Fixture
 * names are test data. Data hooks (`data-fishball-*`, `data-dsh-instance-*`) are the page's own
 * published handles; `data-fbtest-*` / `data-primitive` are the helpers' stand-in handles.
 */
export const PAGE_UI = Object.freeze({
  id: 'dsh-instance',
  entry: 'client.js',
  chunks: Object.freeze(['client.status.js', 'client.models.js', 'client.fishball.js']),
  base: 'http://127.0.0.1:47000/',
  langs: Object.freeze(['en', 'zh']),
})

/** The instance's routes (README "Settings page", "Plugins for Fishball", "Model sync"). */
export const ROUTE = Object.freeze({
  status: '/api/dsh-instance/status',
  retry: '/api/dsh-instance/retry',
  restart: '/api/dsh-instance/restart',
  reconnect: '/api/dsh-instance/reconnect',
  open: '/api/dsh-instance/open',
  check: '/api/dsh-instance/models/check',
  add: '/api/dsh-instance/models/add',
  plugins: '/api/dsh-instance/plugins',
  use: '/api/dsh-instance/plugins/use',
  uninstall: '/api/dsh-instance/plugins/uninstall',
})

/** The child's states (README "Ready"), plus what the status route answers for a state it cannot read. */
export const STATE = Object.freeze({ disabled: 'disabled', waiting: 'waiting', starting: 'starting', ready: 'ready', stopping: 'stopping', stopped: 'stopped', failed: 'failed', unavailable: 'unavailable' })

/**
 * Restart (README "Settings page"): shown while the instance is on and the child is ready, failed
 * or stopped; disabled while it starts or stops and while a Fishball plugin change runs (busy).
 */
export const RESTART = Object.freeze({
  shown: Object.freeze([STATE.ready, STATE.failed, STATE.stopped]),
  moving: Object.freeze([STATE.starting, STATE.stopping]),
  refusals: Object.freeze(['instance-disabled', 'busy']),
  otherRefusal: 'fbtest-other-refusal',
  /** The confirmation (README; DESIGN §28). */
  en: Object.freeze({ title: 'Restart Fishball?', body: 'Running work in Fishball stops and the Fishball window reloads.', restart: 'Restart', restarting: 'Restarting…', cancel: 'Cancel' }),
  body: '{}',
  attr: 'data-fishball-instance-restart',
  confirmAttr: 'data-fishball-instance-restart-confirm',
})

/** Slots (DSH plugin-manager README "Configuration pages", "Detail page extension points", "Page tabs", Add menu; the shell overlay). */
export const SLOT = Object.freeze({
  bundleConfig: 'plugins.bundle.config',
  rowConfig: 'plugins.row.config',
  tab: 'plugins.tab',
  addActions: 'plugins.add.actions',
  detailActions: 'plugins.detail.actions',
  overlay: 'shell.overlay',
})

/** The bundles the instance owns, which the Host lists as `protected` (README "Plugins for Fishball"). */
export const PROTECTED = Object.freeze(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'fishball-core', 'fishball-ui', 'dsh-instance'])

/** The per-bundle buttons (README "Plugins for Fishball"). */
export const DETAIL = Object.freeze({ uninstall: 'Uninstall from Fishball', use: 'Use in Fishball', install: 'Install to Fishball' })

/** The page's own handles. */
export const HOOK = Object.freeze({
  state: 'data-fishball-instance-state', retry: 'data-fishball-instance-retry',
  open: 'data-dsh-instance-open', reconnect: 'data-dsh-instance-reconnect', target: 'data-dsh-instance-target',
  check: 'data-fishball-model-check', add: 'data-fishball-model-add', entry: 'data-fishball-model-entry',
  tab: 'data-fishball-tab', installOpen: 'data-fishball-install-open',
})

/** The settings page's section headings in page order (README order: actions, model sync, launch). */
export const HEADINGS = Object.freeze({ en: Object.freeze(['Fishball', 'Model for Fishball', 'Launch']), zh: Object.freeze(['Fishball', 'Fishball 的模型', '启动']) })
export const WORDS = Object.freeze({ open: Object.freeze({ en: 'Open Fishball', zh: '打开 Fishball' }), retry: Object.freeze({ en: 'Retry', zh: '重试' }), targetLabel: Object.freeze({ en: 'Remote target', zh: '远程目标' }) })

/** The model sync Check answer: three providers Fishball lacks. */
export const CHECK = Object.freeze({
  checkId: 'fbtest-pages-check',
  missing: Object.freeze([
    Object.freeze({ id: 'fbtest-p1', name: 'Provider One', models: Object.freeze(['m1']) }),
    Object.freeze({ id: 'fbtest-p2', name: 'Provider Two', models: Object.freeze([]) }),
    Object.freeze({ id: 'fbtest-p3', name: 'Provider Three', models: Object.freeze(['m3a', 'm3b']) }),
  ]),
  notOffered: Object.freeze([]),
  present: 0,
})

/** The hosted credential reference the page must never name (README "The hosted token"). */
export const CREDENTIAL_REF = 'DSH_AGENT_TOKEN'

/** The status cadence (README: status has no event; read once a second while mounted and visible). */
export const POLL = Object.freeze({ everyMs: 1000, windowMs: 2500, minReads: 2 })

/** Harness handles of the helpers' stand-ins. */
export const STAND = Object.freeze({ primitive: 'data-primitive', variant: 'data-fbtest-variant' })
