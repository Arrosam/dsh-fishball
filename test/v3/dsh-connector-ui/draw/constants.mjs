/**
 * Vocabulary for the U-DRAW cases (USE-CASES.md). Every literal the cases and the world use lives
 * here, grouped by where it comes from:
 * - the requirements and the user's words (labels, the hint, the refusal text, the diagnostics);
 * - the observable contract the dev session relayed for U-DRAW (2026-11-16: routes, answers, data
 *   attributes, slots, the locale namespace) and its correction of the same day (the V2
 *   `dshConnector` fallback and the `legacy` flag are removed (V2 never deployed, U-WIRE));
 * - K2 (`dsh-connector/tools`, read at runtime) and K3 (`host-services/*.d.ts`, restated);
 * - the C-UI-BACKEND suite's relayed surface (its SURFACE, reused, never restated);
 * - fixture data and harness timing, which are not product values.
 * No embed-UI implementation was read.
 */
import path from 'node:path'
import { REPO } from '../../../support/constants.mjs'
import { K2, K3, SURFACE as BACKEND } from '../../dsh-connector/ui/constants.mjs'
import { CHILD as SHELL_CHILD, LOOPBACK, REFUSAL_TEXT, ROUTE as SHELL_ROUTE, ROUTE_REFUSAL as SHELL_REFUSAL } from '../shell/constants.mjs'

export { BACKEND, K2, K3, LOOPBACK, REFUSAL_TEXT }

/** The package under test: its host entry, its client folder and its loader identity. */
export const EMBED = Object.freeze({
  name: 'dsh-connector-ui',
  hostEntry: path.join(REPO, 'packages', 'dsh-connector-ui', 'index.js'),
  clientDir: path.join(REPO, 'packages', 'dsh-connector-ui', 'src', 'client'),
  clientEntry: 'client.js',
  /** The relayed flat chunks; client.records.js is withdrawn (Q-G4 = A). */
  // I-HOST: client.instance.js (the instance card) became the instance's own client.models.js.
  chunks: Object.freeze(['client.shell.js', 'client.marks.js', 'client.attention.js']),
  withdrawnChunk: 'client.records.js',
  /** The module id every file registers with `__ModuleLoader__.load`. */
  moduleId: 'dsh-connector-ui',
  /** The graph revision the fake module table hands the chunk loader (any value: no cache here). */
  rev: 'fbtest-draw',
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
  header: 'conversation.session.header.actions',
  rowMenu: 'sidebar.workspaces.session.menu.item',
  /** Q-G4 = A: embed-UI registers neither (no inline records). */
  withdrawn: Object.freeze(['tool.call.toolview', 'conversation.chat.node']),
  /** The seats only the connector UI backend feeds (marks, Hand over, the prompt). */
  connectorSeats: Object.freeze(['sidebar.session.row.leading', 'conversation.session.header.actions', 'sidebar.workspaces.session.menu.item']),
  /** Session-scoped slots: the renderer hands the Session id to `inject(key)` (dsh-client-ui-conversation slot contract). */
  sessionScoped: Object.freeze(['conversation.session.header.actions']),
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
  managedRow: 'data-fishball-managed-row',
  managedBy: 'data-fishball-managed-by',
  takeBack: 'data-fishball-take-back',
  handOver: 'data-fishball-hand-over',
  handOverMany: 'data-fishball-hand-over-many',
  target: 'data-fishball-target',
  online: 'data-fishball-online',
  confirm: 'data-fishball-hand-over-confirm',
  refusal: 'data-fishball-refusal',
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
  dictionary: Object.freeze(['Hand over to {name}', 'Handover to…', 'Take back', 'Managed by {name}', 'online', 'offline', 'Retry', "No Fishball child instance is running here. Open your Fishball instance's own page."]),
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
