/**
 * Vocabulary for the U-DRAW cases (USE-CASES.md). Every literal the cases and the world use lives
 * here, grouped by where it comes from:
 * - the requirements and the user's words (labels, the hint, the refusal text, the diagnostics);
 * - the observable contract the dev session relayed for U-DRAW (2026-11-16: routes, answers, data
 *   attributes, slots, the locale namespace) and its correction of the same day (the V2
 *   `dshConnector` fallback and the `legacy` flag are removed (V2 never deployed, U-WIRE));
 * - K2 (`dsh-agent-connector/tools`, read at runtime) and K3 (`host-services/*.d.ts`, restated);
 * - the C-UI-BACKEND suite's relayed surface (its SURFACE, reused, never restated);
 * - fixture data and harness timing, which are not product values.
 * No embed-UI implementation was read.
 */
import path from 'node:path'
import { REPO } from '../../../../../test/support/constants.mjs'
import { K2, K3, SURFACE as BACKEND } from '../../../tests/ui/constants.mjs'
import { CHILD as SHELL_CHILD, LOOPBACK, REFUSAL_TEXT, ROUTE as SHELL_ROUTE, ROUTE_REFUSAL as SHELL_REFUSAL } from '../shell/constants.mjs'

export { BACKEND, K2, K3, LOOPBACK, REFUSAL_TEXT }

/**
 * The package under test: its host entry, its client folder and its loader identity. Since the
 * connector + UI combine (df9d83d) embed-UI is the inner package packages/dsh-connector/ui (its
 * package.json, name dsh-connector-ui), inserted by the connector's cordis.patch.yml as ./ui/index.js.
 */
const EMBED_DIR = path.join(REPO, 'packages', 'dsh-connector', 'ui')
export const EMBED = Object.freeze({
  name: 'dsh-connector-ui',
  dir: EMBED_DIR,
  hostEntry: path.join(EMBED_DIR, 'index.js'),
  clientDir: path.join(EMBED_DIR, 'src', 'client'),
  clientEntry: 'client.js',
  /**
   * The relayed flat chunks; client.records.js is withdrawn (Q-G4 = A). DESIGN.md §28 (2026-11-20):
   * client.marks.js left embed-UI for dsh-agent-connector (CONNECTOR_CLIENT.chunks).
   */
  // I-HOST: client.instance.js (the instance card) became the instance's own client.models.js.
  chunks: Object.freeze(['client.shell.js', 'client.attention.js']),
  /** DESIGN.md §28: the marks chunk embed-UI no longer ships. */
  movedChunk: 'client.marks.js',
  withdrawnChunk: 'client.records.js',
  /** The module id every file registers with `__ModuleLoader__.load`. */
  moduleId: 'dsh-connector-ui',
  /** The graph revision the fake module table hands the chunk loader (any value: no cache here). */
  rev: 'fbtest-draw',
})

/**
 * dsh-agent-connector's browser entry (package.json exports ./client = client.js; dsh.client), which
 * since DESIGN.md §28 carries the marks part as its chunk client.marks.js, and exports `ui`, the
 * helpers over the UI backend. Embed-UI loads it first (its dsh.client.external), so one page holds
 * both graph entries; the connector entry comes first in the graph.
 */
export const CONNECTOR_CLIENT = Object.freeze({
  moduleId: 'dsh-agent-connector',
  dir: path.join(REPO, 'packages', 'dsh-connector'),
  entry: 'client.js',
  chunks: Object.freeze(['client.marks.js']),
})

/**
 * The marks part (DESIGN.md §28 "Hand over" row; the user's decisions of 2026-11-20, R1–R6): its
 * slot entry ids, its locale namespace, its words (en / zh templates, `{name}` the principal
 * label), its hook and class prefixes, the running row mark's flip class (lead's relay 2026-11-20),
 * and embed-UI's one warning when the connector's browser entry cannot load.
 */
export const MARKS = Object.freeze({
  ids: Object.freeze({ handOver: 'dsh-connector-hand-over', notice: 'dsh-connector-hand-over-notice', managed: 'dsh-connector-managed' }),
  /** The ids embed-UI used before §28: no registration may carry them now (R2). */
  oldIds: Object.freeze(['fishball-hand-over', 'fishball-managed']),
  namespace: 'dsh-connector-marks',
  words: Object.freeze({
    en: Object.freeze({ handOverTo: 'Hand over to {name}', handOverMany: 'Handover to…', takeBack: 'Take back', managedBy: 'Managed by {name}' }),
    zh: Object.freeze({ handOverTo: '交给 {name}', handOverMany: '交给…', takeBack: '收回', managedBy: '由 {name} 管理' }),
  }),
  fill: (template, name) => template.replace('{name}', name),
  hookPrefix: 'data-dsh-connector-',
  classPrefix: 'dshc-',
  oldHookPrefix: 'data-fishball-',
  oldClassPrefix: 'fb-',
  flip: 'dshc-flip',
  rowState: Object.freeze({ running: 'running', idle: 'idle' }),
  /** R6: embed-UI's row logger line when the connector's browser entry fails to load. */
  unavailable: 'part unavailable',
  warnType: 'warn',
  errorType: 'error',
})

/** K3 / C-UI-BACKEND / K2 service names and the one usable apiVersion (Q-U1, K3). */
export const SERVICE = Object.freeze({
  ui: BACKEND.serviceName,
  tools: K2.TOOLS_API.service,
  child: 'dshInstanceChild',
  /** V2 never deployed (U-WIRE): this service is only a negative fixture. */
  legacy: 'dshConnector',
  connection: 'connection',
  appReady: 'appReady',
  apiVersion: 1,
  /** Any other apiVersion counts as absent (UIM-EP-01 #5). */
  otherApiVersion: 2,
})

/** The diagnostics (Q-U1, R-UI-01) and the cordis logger levels they are written at. */
export const DIAGNOSTIC = Object.freeze({
  connectorMissing: 'connector-missing',
  instanceMissing: 'instance-missing',
  errorType: 'error',
  warnType: 'warn',
  /** cordis LoggerLevel.DEBUG: the exporter takes every level. */
  allLevels: 3,
})

/** Embed-UI's host routes (relayed). `retry` must NOT be registered any more (#77, R-UI-03 amended). */
export const ROUTE = Object.freeze({
  services: SHELL_ROUTE.services,
  status: SHELL_ROUTE.status,
  admit: SHELL_ROUTE.admit,
  retry: SHELL_ROUTE.retry,
  /**
   * `routes` keys of the services answer, page-relative. I-HOST (QD1 = B, Q-G7) moved model sync to
   * the instance's own settings page, so embed-UI's child/models/* routes are gone.
   */
  routeKeys: Object.freeze(['services', 'status', 'admit']),
  /** The routes that answer connector-missing without a usable connector: every one but services. */
  guarded: Object.freeze([['GET', 'status'], ['POST', 'admit']]),
  /** Keys the services answer has (no legacy flag: V2 never deployed (U-WIRE)). */
  servicesKeys: Object.freeze(['ok', 'connector', 'page', 'routes', 'ui']),
  /** V2's availability flags the services answer no longer carries (U-DRAW brief). */
  removedKeys: Object.freeze(['legacy', 'handover', 'tools']),
  /** A page-relative path has no leading slash. */
  absolutePrefix: '/',
  /** Where a route answers a missing method or path (the fake route table, not a product value). */
  notFound: 404,
  methodNotAllowed: 405,
})
/** The backend's route keys, as the services answer's `ui` carries them. */
export const UI_KEYS = Object.freeze(Object.keys(BACKEND.routes))

export const HTTP = Object.freeze({ ok: 200, unavailable: 503, json: 'application/json' })
export const REFUSAL = Object.freeze({
  connectorMissing: Object.freeze({ status: HTTP.unavailable, code: DIAGNOSTIC.connectorMissing }),
  instanceMissing: SHELL_REFUSAL.missing,
})

/** The admit request the window sends (K3 AdmitView / AdmitLang) and the fake locator's answer. */
export const ADMIT = Object.freeze({
  views: SHELL_CHILD.views,
  langs: SHELL_CHILD.langs,
  port: SHELL_CHILD.port,
  path: '/fbtest-draw-admit',
  ticketParam: 'ticket',
  ticketPrefix: 'fbtest-draw-ticket-',
})

/** K3 ChildState / LifecycleCode values the window is tested with (EP-03). */
export const CHILD = Object.freeze({
  ready: Object.freeze({ state: 'ready', code: null }),
  notReady: Object.freeze([
    Object.freeze({ row: 1, state: 'stopped', code: null }),
    Object.freeze({ row: 2, state: 'failed', code: 'NATIVE_CHILD_EXITED' }),
    Object.freeze({ row: 3, state: 'starting', code: null }),
    Object.freeze({ row: 4, state: 'waiting', code: null }),
    Object.freeze({ row: 5, state: 'stopping', code: null }),
    Object.freeze({ row: 6, state: 'disabled', code: 'NATIVE_DISABLED' }),
  ]),
  connectedTarget: Object.freeze({ state: 'connected', code: null }),
  /** The bundle the Retry link opens (#77: the instance's own settings page). */
  bundle: 'dsh-instance',
})

/** Page hosts (R-UI-02): the page's own `Host` decides the frame host. */
export const PAGE_HOST = Object.freeze({
  loopback: '127.0.0.1',
  localhost: 'localhost',
  tunnel: 'fishball-tunnel.example',
  port: 43123,
  scheme: 'http://',
})

/** The browser half's slots and keys (relayed; DSH slot contracts of both SDKs). */
export const SLOT = Object.freeze({
  fish: 'sidebar.panellist',
  fishId: 'fishball',
  main: 'main',
  mainKey: 'fishball',
  overlay: 'shell.overlay',
  rowLeading: 'sidebar.session.row.leading',
  /**
   * The session header's two seats (UI-FIX-D, 2026-11-18): "Managed by <principal>" stays
   * title-adjacent in header.actions; Hand over / Handover to… / Take back moved to DSH's
   * right-aligned header.utilities. Cases mount both as the one header DSH draws.
   */
  header: Object.freeze(['conversation.session.header.actions', 'conversation.session.header.utilities']),
  headerActions: 'conversation.session.header.actions',
  headerUtilities: 'conversation.session.header.utilities',
  rowMenu: 'sidebar.workspaces.session.menu.item',
  rowTrailing: 'sidebar.session.row.trailing',
  /** The Plugins page's card seats: the connector's own settings page registers there whatever the backend. */
  cards: Object.freeze(['plugins.bundle.config', 'plugins.row.config']),
  /** Q-G4 = A: embed-UI registers neither (no inline records). */
  withdrawn: Object.freeze(['tool.call.toolview', 'conversation.chat.node']),
  /**
   * The marks part's seats (UI-FIX-D adds header.utilities). DESIGN.md §28: dsh-agent-connector's
   * browser half fills them, embed-UI no longer does (R1, R2).
   */
  connectorSeats: Object.freeze(['sidebar.session.row.leading', 'conversation.session.header.actions', 'conversation.session.header.utilities', 'sidebar.workspaces.session.menu.item']),
  /** Session-scoped slots: the renderer hands the Session id to `inject(key)` (dsh-client-ui-conversation slot contract). */
  sessionScoped: Object.freeze(['conversation.session.header.actions', 'conversation.session.header.utilities']),
  /** The sidebar row's icon size the owner passes (dsh-client-ui-sidebar SidebarPanelIconOwnerProps). */
  fishSize: 16,
})

/** The client services the browser half uses (relayed). */
export const CLIENT_SERVICE = Object.freeze(['slots', 'locale', 'configForms', 'pluginNavigation', 'layout'])

/** The relayed data attributes and roles. */
export const ATTR = Object.freeze({
  fishLight: 'data-fishball-fish-light',
  fishImportant: 'data-fishball-fish-important',
  fishMark: 'data-fishball-mark',
  on: 'on',
  off: 'off',
  yes: 'true',
  no: 'false',
  embed: 'data-fishball-embed',
  embedState: 'data-fishball-embed-state',
  embedCode: 'data-fishball-embed-code',
  frame: 'data-fishball-embed-frame',
  retryLink: 'data-fishball-retry-link',
  frameRetry: 'data-fishball-frame-retry',
  hostnameRefused: 'data-fishball-hostname-refused',
  noInstance: 'data-fishball-no-instance',
  notice: 'data-fishball-notice',
  noticeCount: 'data-fishball-notice-count',
  noticeImportant: 'data-fishball-notice-important',
  // DESIGN.md §28 (2026-11-20, R4): the marks part is dsh-agent-connector's; its hooks are data-dsh-connector-*.
  managedRow: 'data-dsh-connector-managed-row',
  rowState: 'data-dsh-connector-row-state',
  managedBy: 'data-dsh-connector-managed-by',
  takeBack: 'data-dsh-connector-take-back',
  handOver: 'data-dsh-connector-hand-over',
  handOverMany: 'data-dsh-connector-hand-over-many',
  target: 'data-dsh-connector-target',
  online: 'data-dsh-connector-online',
  confirm: 'data-dsh-connector-hand-over-confirm',
  refusal: 'data-dsh-connector-refusal',
  role: 'role',
  alert: 'alert',
  menuitem: 'menuitem',
  dialog: 'dialog',
  ariaLabel: 'aria-label',
  /** The fake Menu's item marker (world.mjs), carrying the item id the Menu was given. */
  menuItemId: 'data-fbtest-menu-item',
})
/** Host elements the cases look for. */
export const TAG = Object.freeze({ iframe: 'iframe', section: 'section', svg: 'svg', strong: 'strong', button: 'button', textarea: 'textarea', a: 'a' })
/** Element kinds a markup name would turn into if it were interpreted (HAND-EP-02 row 8). */
export const MARKUP_TAGS = Object.freeze(['b', 'script', 'i', 'img'])

/** English copy (requirements and the relayed dictionary). `{name}` is the principal label. */
export const TEXT = Object.freeze({
  hint: "No Fishball child instance is running here. Open your Fishball instance's own page.",
  refused: REFUSAL_TEXT,
  retry: 'Retry',
  takeBack: 'Take back',
  handoverMany: 'Handover to…',
  handOverTo: (label) => 'Hand over to ' + label,
  managedBy: (label) => 'Managed by ' + label,
  idPrefix: 'ID:',
  idLabel: (id) => 'ID: ' + id,
  online: 'online',
  offline: 'offline',
  fishballLabel: 'Hand over to Fishball',
  /** The relayed dictionary's English templates (values; their keys are the package's own). */
  // DESIGN.md §28: the Hand over words left the 'fishball' namespace with the marks part (MARKS.words).
  dictionary: Object.freeze(['Retry', "No Fishball child instance is running here. Open your Fishball instance's own page."]),
  namespace: 'fishball',
  langs: Object.freeze(['en', 'zh']),
})

/** Refusal codes the backend answers (K3 from the declaration; the backend's own `invalid-request` / `operation-failed`). */
export const CODES = Object.freeze({
  handOver: Object.freeze([...K3.handOverCodes, BACKEND.code.operationFailed]),
  takeBack: Object.freeze([...K3.takeBackCodes, BACKEND.code.operationFailed]),
})

/** The three contributed tools (R-EXT-13, R-FN-01, §13.6). */
export const TOOL = BACKEND.tools

/** Fixture principals `[key, name, id]` and sessions. Not product values. */
const principal = (key, name, id) => Object.freeze({ key, name, id })
export const FIXTURE = Object.freeze({
  navigator: principal('fbtest-draw-pk-nav', 'Navigator', 'agent-nav'),
  nameless: principal('fbtest-draw-pk-x', null, 'agent-x'),
  /** A principal NAMED "ID: agent-y" by hand (HAND-EP-02 row 3a): plain text, no bold. */
  idNamed: principal('fbtest-draw-pk-y', 'ID: agent-y', 'agent-y'),
  markup: principal('fbtest-draw-pk-m', '<b>x</b><script>fbtest()</script>', 'agent-m'),
  fishball: principal('fbtest-draw-pk-f', 'Fishball', 'fishball-f'),
  indexer: principal('fbtest-draw-pk-i', 'Indexer', 'agent-i'),
  renamed: 'Cartographer',
  sessions: Object.freeze({ s1: 'fbtest-draw-s1', s2: 'fbtest-draw-s2' }),
  title: 'fbtest draw session',
  note: 'fbtest draw note: please watch the build',
  emptyNote: '',
  message: 'Build 42 finished',
  message2: 'Build 43 failed',
  markupMessage: '<b>bold</b> **not markdown** <script>fbtest()</script>',
  caller: Object.freeze({ key: 'fbtest-draw-caller', name: 'Caller' }),
  failure: 'fbtest draw: the hand-over service failed',
  hookKey: 'fbtest.u-draw.worlds',
  connectorRow: 'fbtest-draw-connector',
  instanceRow: 'fbtest-draw-instance',
  builtinPrefix: 'cordis:',
})

/** Expected counts, each named for its meaning. */
export const EXPECT = Object.freeze({
  none: 0,
  once: 1,
  twice: 2,
  firstNotice: '1',
  secondNotice: '2',
  /** A row activation logs a diagnostic at most once (relayed). */
  perActivation: 1,
  toolCount: 3,
})

/** Installed SDK packages the world is built from (read only). */
export const DSH = Object.freeze({
  cordis: '@deepseek-ai/cordis',
  loader: '@deepseek-ai/cordis-plugin-loader',
  react: 'react',
  reactDom: 'react-dom',
  primitives: '@deepseek-ai/dsh-client-ui-primitives',
})

/** Harness timing only (waiting, never an oracle). */
export const WAIT = Object.freeze({
  settleRounds: 40,
  pollMs: 20,
  settleMs: 5000,
  /** The window follows a child that becomes ready by itself (polling or a stream; ST-05). */
  followMs: 20000,
  quietMs: 300,
  testMs: 60000,
})

/** The dev session's decisions this suite relies on, cited by the rows that use them. */
export const DECIDED = Object.freeze({
  legacy: 'dev correction 2026-11-16: V2 never deployed (U-WIRE): a V2-only dshConnector is absent for Q-U1',
})

/**
 * UI-POLISH-D rows (polish-cases.mjs; the requirements relayed 2026-11-18, the developer's notes of
 * that day): the hint's lead line, the not-ready lead line per K3 state, the window header's fish,
 * the state tag's StateDot, the Refresh icon and where the notify bubble sits. `frameState` are the
 * page's own state words (its dictionary, en and zh) that fill `{state}`.
 */
export const POLISH = Object.freeze({
  id: Object.freeze({ hint: 'UIPD-DRAW-HINT', notReady: 'UIPD-DRAW-NOTREADY', chrome: 'UIPD-DRAW-CHROME', place: 'UIPD-DRAW-PLACE' }),
  noInstanceTitle: Object.freeze({ en: "Fishball isn't running here", zh: 'Fishball 不在这里运行' }),
  noInstance: Object.freeze({ en: TEXT.hint, zh: '此处没有正在运行的 Fishball 子实例。请打开你的 Fishball 实例自己的页面。' }),
  notReady: Object.freeze({ en: (state) => `Fishball isn't ready (${state}).`, zh: (state) => `Fishball 尚未就绪（${state}）。` }),
  frameState: Object.freeze({
    en: Object.freeze({ disabled: 'disabled', waiting: 'waiting', starting: 'starting', stopping: 'stopping', stopped: 'stopped', failed: 'failed', ready: 'running' }),
    zh: Object.freeze({ disabled: '已禁用', waiting: '等待中', starting: '启动中', stopping: '停止中', stopped: '已停止', failed: '失败', ready: '运行中' }),
  }),
  /** The safe details' leading words (unchanged): "State <code>state</code>", "Code <code>code</code>". */
  details: Object.freeze({ en: Object.freeze({ state: 'State', code: 'Code' }), zh: Object.freeze({ state: '状态', code: '代码' }) }),
  viewTitle: 'Fishball',
  refresh: Object.freeze({ en: 'Refresh', zh: '刷新' }),
  primitiveAttr: 'data-primitive',
  stateDot: 'StateDot',
  warningIcon: /Warning/,
  refreshIcon: /Refresh/,
  ariaHidden: 'aria-hidden',
  code: 'code',
  header: 'header',
  /** data-fishball-notice-place values, and the placement the requirements give each. */
  placeAttr: 'data-fishball-notice-place',
  place: Object.freeze({ mark: 'mark', corner: 'corner' }),
  edgePx: 16,
  gapPx: 8,
  /** Where the scripted sidebar fish sits on screen (fixture), and its hidden state (width 0). */
  fishRect: Object.freeze({ left: 4, top: 120, right: 20, bottom: 136, width: 16, height: 16, x: 4, y: 120 }),
  hiddenRect: Object.freeze({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }),
  /** The hooks a page could find the sidebar fish by (the relayed data attributes). */
  fishSelectors: Object.freeze(['data-fishball-fish-light', 'data-fishball-mark']),
})

/**
 * R-FIX-CUI rows (cui-cases.mjs; .runtime/reports/review-x-dsh-connector-ui.md UI-01 marks, UI-06,
 * UI-07). Fixture data and DSH's words only: a subagent child's session summary as DSH's standard
 * `useSessions(selector)` hook gives it (`{byId: {[id]: {id, origin, parentId}}}`,
 * dsh-api-session-controller SessionListState / SessionSummary, both SDKs), the attention chunk
 * file, the window event the bubble re-measures on, and a second on-screen place of the fish.
 */
export const CUI = Object.freeze({
  id: Object.freeze({ ui01: 'RFC-UI01', ui06: 'RFC-UI06', ui07: 'RFC-UI07' }),
  /** Root R (FIXTURE.sessions.s1), its child C, C's child G. */
  sessions: Object.freeze({ root: FIXTURE.sessions.s1, child: 'fbtest-draw-child', grandchild: 'fbtest-draw-grandchild' }),
  subagentOrigin: 'subagent',
  attentionChunk: 'client.attention.js',
  resize: 'resize',
  /** The fish moved down and right (the sidebar re-laid out). */
  movedRect: Object.freeze({ left: 40, top: 300, right: 56, bottom: 316, width: 16, height: 16, x: 40, y: 300 }),
})
