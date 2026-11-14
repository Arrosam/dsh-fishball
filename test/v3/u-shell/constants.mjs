/**
 * Vocabulary for the U-SHELL cases (v3-tasks.md W3 U-SHELL; .runtime/reports/v3-w3-briefs.md
 * "U-SHELL test brief", F2, O6, Q-7): UIM-EP-01, UIM-EP-02, UIM-UC-04 (U-SHELL's parts), UIM-UC-01
 * (integration part), UIM-DT-01 rows 3, 7, 7b and R-EMBED's U-SHELL row.
 *
 * Every value comes from docs/test-design/v3/10-embed-ui-matrix.md, v3-requirements.md (R-UI-01…12,
 * R-ARCH-02/04, R-HOST-06, S4-Q1 A), v3-design.md §4.1–§4.2 and the K3 freeze
 * (packages/connector/host-services/*.d.ts and README.md, packages/connector/tools/index.d.ts), or
 * from the brief. No embed-UI implementation was read.
 */
import path from 'node:path'
import { REPO } from '../../support/constants.mjs'

/** The three host-only services embed-UI follows at runtime (K3 README, design §4.2). */
export const SERVICE = Object.freeze({
  child: 'fishballChild',
  handover: 'fishballConnectorHandover',
  tools: 'fishballConnectorTools',
})
/** K3: every host-only service has apiVersion 1; any other value counts as absent (UIM-EP-01 #5). */
export const API_VERSION = Object.freeze({ current: 1, older: 2 })

/** R-UI-01 / design §4.2: the one diagnostic embed-UI logs without a usable locator. */
export const DIAGNOSTIC = 'instance-missing'

/**
 * R-UI-02 / K3 `LoopbackHostname`: the frame may use exactly these names. A WHATWG URL's hostname is
 * lower-case, so `LOCALHOST` is `localhost` (UIM-EP-02 row 5, K: case-normalised).
 */
export const LOOPBACK = Object.freeze(['127.0.0.1', 'localhost', '[::1]'])
/** R-UI-02 (S4-Q1 A): the text shown instead of a frame for any other name (en; zh is P-3, open). */
export const REFUSAL_TEXT = 'Open DSH at 127.0.0.1 to use Fishball'

/**
 * UIM-EP-02 rows: how the scripted main page is opened. `header` is the raw `Host` the page's
 * requests carry (a case variant stays as typed); `expected` is the frame host's name.
 */
export const PAGE_NAME = Object.freeze({
  ipv4: Object.freeze({ row: 1, display: '127.0.0.1', header: '127.0.0.1', expected: '127.0.0.1' }),
  localhost: Object.freeze({ row: 2, display: 'localhost', header: 'localhost', expected: 'localhost' }),
  ipv6: Object.freeze({ row: 3, display: '[::1]', header: '[::1]', expected: '[::1]' }),
  tunnel: Object.freeze({ row: 4, display: 'fishball-tunnel.example', header: 'fishball-tunnel.example', expected: null }),
  upper: Object.freeze({ row: 5, display: 'LOCALHOST', header: 'LOCALHOST', expected: 'localhost' }),
  /**
   * BVA on the name set: DSH's own trust fence takes any 127/8 address as loopback, but the frame
   * takes exactly the three names (K3 `LoopbackHostname`, "exactly"), so the neighbour of 127.0.0.1
   * is refused like a tunnel name.
   */
  edge: Object.freeze({ row: '4 (BVA)', display: '127.0.0.2', header: '127.0.0.2', expected: null }),
})
/** The address the scripted page's requests really go to (the host DSH listens on loopback). */
export const LISTEN_IP = '127.0.0.1'

/** Host-DSH slots (S4 §2.2, R-UI-11, design §4.2; dsh-client-ui-sidebar / -tool slot contracts). */
export const SLOT = Object.freeze({
  /** The sidebar Fishball entry (the fish): the one Fishball entry (R-UI-11). */
  entry: 'sidebar.panellist',
  /** DSH's own brand: never used by embed-UI (R-UI-11). */
  brand: Object.freeze(['sidebar.brand.mark', 'sidebar.brand.name']),
  /** The Fishball page: the `main` entry keyed `fishball` (frame view, status, Retry; S4 §2.2). */
  main: 'main',
  pageKey: 'fishball',
  /** Seats of managed marks and Hand over / Take back (S4 §2.2): U-MARKS' parts, absent without the hand-over service. */
  marks: Object.freeze(['conversation.session.header.actions', 'sidebar.workspaces.session.menu.item', 'sidebar.session.row.leading', 'sidebar.session.row.trailing']),
  /** The Plugins card (R-HOST-07: the model-sync trigger lives there). */
  card: Object.freeze(['plugins.bundle.config', 'plugins.row.config']),
  /** DSH's tool row; embed-UI's `ask_fishball` view, if any, is read-only (R-UI-12, R-UI-13). */
  toolview: 'tool.call.toolview',
})
export const ASK_TOOL = 'ask_fishball'
/** R-UI-12: no answer control. These are the element kinds through which a user could answer. */
export const CONTROL = Object.freeze({ tags: Object.freeze(['button', 'input', 'textarea', 'select', 'form']), roles: Object.freeze(['button', 'checkbox', 'radio', 'menuitem']), handler: 'onClick' })
/** V2's answer route for a pending `ask_fishball` row (rev11c PILE_API), which the main DSH loses (R-UI-12). */
export const V2_ANSWER_ROUTE = 'api/fishball/requests/answer'
/** R-UI-03 / design §4.2: the Retry control's label (en). */
export const RETRY_LABEL = 'Retry'

/** K3 `ChildState`, `LifecycleCode`, `TargetState`, `TargetCode`, `AdmitView`, `AdmitLang`, `AdmitErrorCode`. */
export const CHILD = Object.freeze({
  ready: 'ready',
  failed: 'failed',
  exited: 'NATIVE_CHILD_EXITED',
  unreachable: Object.freeze({ state: 'target-unreachable', code: 'TARGET_UNREACHABLE' }),
  connected: 'connected',
  views: Object.freeze(['chat', 'settings']),
  langs: Object.freeze({ en: 'en', zh: 'zh' }),
  refused: Object.freeze({ hostname: 'hostname-refused', notReady: 'not-ready' }),
  /** The child port the fake locator reports (child.d.ts's own example, `http://localhost:49152`). */
  port: 49152,
})

/**
 * embed-UI's host routes (relayed by Fishball from dev/v3-u-shell `096da986`; design §4.2 "its own
 * authenticated DSH Fetch routes for status, Retry, admission and model sync"): owner-only JSON.
 * `admit`'s body is exactly `{view, lang}`; the hostname is the request's own `Host`.
 */
export const ROUTE = Object.freeze({
  services: '/api/fishball-embed-ui/services',
  status: '/api/fishball-embed-ui/child/status',
  retry: '/api/fishball-embed-ui/child/retry',
  admit: '/api/fishball-embed-ui/child/admit',
  modelsCheck: '/api/fishball-embed-ui/child/models/check',
  modelsAdd: '/api/fishball-embed-ui/child/models/add',
  /** The `child/*` routes: each answers `instance-missing` without a usable locator. */
  child: Object.freeze(['status', 'retry', 'admit', 'modelsCheck', 'modelsAdd']),
  servicesKeys: Object.freeze(['ok', 'page', 'handover', 'tools', 'legacy', 'routes']),
  statusKeys: Object.freeze(['ok', 'status', 'target']),
})
/** The routes' refusals (relayed): HTTP status and code. */
export const ROUTE_REFUSAL = Object.freeze({
  hostname: Object.freeze({ status: 409, code: 'hostname-refused' }),
  notReady: Object.freeze({ status: 409, code: 'not-ready' }),
  invalid: Object.freeze({ status: 400, code: 'invalid-request' }),
  missing: Object.freeze({ status: 503, code: 'instance-missing' }),
})
export const HTTP_OK = 200
/** Hosts that name a loopback host only after URL parsing: userinfo and a path (relayed: refused as hostname-refused). */
export const HOST_TRICK = Object.freeze({ userinfo: 'fishball-tunnel.example@localhost', path: 'localhost/fbtest' })

/**
 * The host half restates the K3/K2 values (Fishball: K3 is types only, and K2's runtime module is
 * absent in row 7); a row checks they equal the contracts. Only the exported data is read.
 */
export const HOST_CONSTANTS = Object.freeze({
  file: path.join(REPO, 'packages', 'embed-ui', 'src', 'host', 'constants.js'),
  tools: path.join(REPO, 'packages', 'connector', 'tools', 'constants.js'),
})

/** The fake host-only services (fake-services.mjs) and what they record. */
export const FAKE = Object.freeze({
  module: path.join(import.meta.dirname, 'fake-services.mjs'),
  name: 'fbtest-u-shell-fakes',
  /** The record file (JSON lines) lives outside the DSH home, so the home sweep never meets it. */
  recordEnv: 'FBU_RECORD',
  rowPrefix: 'fbtest-u-shell-',
  recorder: 'recorder',
  /** Cordis logger level that lets every message through (debug is 3; cordis lib/index.js Logger). */
  allLevels: 3,
  ticketPrefix: 'fbu-ticket-',
  ticketBytes: 12,
  ticketParam: 'ticket',
  admitPath: '/fbtest-admit',
  syncRefused: 'fbtest-sync-off',
  eventPrefix: 'fbtest-event-',
  kind: Object.freeze({ started: 'started', log: 'log', admit: 'admit', retry: 'retry', sync: 'sync', register: 'register', handover: 'handover' }),
})

/** A ready local child with a connected target (UIM-DT-01 row 7 / 8). */
const READY = Object.freeze({ apiVersion: API_VERSION.current, status: Object.freeze({ state: CHILD.ready, code: null }), targetStatus: Object.freeze({ state: CHILD.connected, code: null }) })
const CONNECTOR = Object.freeze({ handover: Object.freeze({}), tools: Object.freeze({}) })
/**
 * One host per scenario and SDK process: which fakes it provides (UIM-EP-01 columns). `disabled`
 * inserts the row switched off, as a disabled instance row provides no service (UIM-EP-01 #6).
 */
export const SCENARIO = Object.freeze({
  none: Object.freeze({ label: 'none', services: Object.freeze({}) }),
  child: Object.freeze({ label: 'child', services: Object.freeze({ child: READY }) }),
  connector: Object.freeze({ label: 'conn', services: CONNECTOR }),
  all: Object.freeze({ label: 'all', services: Object.freeze({ child: READY, ...CONNECTOR }) }),
  older: Object.freeze({ label: 'older', services: Object.freeze({ child: Object.freeze({ ...READY, apiVersion: API_VERSION.older }) }) }),
  disabled: Object.freeze({ label: 'off', services: Object.freeze({ child: Object.freeze({ ...READY, disabled: true }), ...CONNECTOR }) }),
  down: Object.freeze({ label: 'down', services: Object.freeze({ child: Object.freeze({ ...READY, status: Object.freeze({ state: CHILD.failed, code: CHILD.exited }) }) }) }),
  /** Every service, embed-UI NOT installed (UIM-UC-04 A2: DSH's generic rows only). */
  noEmbed: Object.freeze({ label: 'noembed', embed: false, services: Object.freeze({ child: READY, ...CONNECTOR }) }),
  blank: Object.freeze({ label: 'blank', services: Object.freeze({ child: Object.freeze({ ...READY, status: Object.freeze({ state: CHILD.ready, code: CHILD.unreachable.code }), targetStatus: CHILD.unreachable }) }) }),
})

/** The host DSH (support/host.mjs worker): embed-UI linked; the connector and instance bundles deselected, so no child is launched. */
export const HOST = Object.freeze({
  pluginOff: Object.freeze({ FBTEST_PLUGIN: 'off' }),
  /** DSH reads `<DSH_HOME>/cordis.patch.yml` after the profile patch (dsh-app-boot readProfilePatches, both SDKs). */
  homePatch: 'cordis.patch.yml',
  /** The browser-trust fence's row (dsh-web-app cordis.patch.yml, both SDKs): the tunnel name is a trusted host of it. */
  connectionRow: 'connection',
  urlLine: /dsh web: (http\S+)/,
  tokenParam: 'token',
})

/** U-SHELL's split (brief F2, Q-7): flat parts beside the entry, no folders (DSH serves only flat chunks). */
export const SPLIT = Object.freeze({
  clientDir: Object.freeze(['src', 'client']),
  entry: 'client.js',
  parts: Object.freeze(['client.shell.js', 'client.marks.js', 'client.attention.js', 'client.records.js']),
  /** dsh-client-modules CLIENT_CHUNK (0.2.1-rc.5 and 0.2.2-rc.1, brief F2). */
  chunk: /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/,
  /** O6: the status line link keeps its name and target; its target at the task's base commit. */
  statusLink: 'client.status.js',
  /** The link's target at the task's base commit `eeb90f66` (`git cat-file -p eeb90f66:packages/embed-ui/src/client/client.status.js`). */
  statusTarget: '../../../instance/src/child-settings/client.status.js',
})

/** Integration rows boot host DSHs; they run at integration only (the same switch as R-EMBED's). */
export const INTEGRATION = Object.freeze({
  env: 'FBTEST_V3_INTEGRATION',
  on: '1',
  skip: 'runs at integration (boots a host DSH with fake host-only services; set FBTEST_V3_INTEGRATION=1)',
  homeLabel: 'v3-u-shell',
  recordPrefix: 'fbtest-v3-u-shell-',
})

/** Harness budgets (waiting only; none is a product oracle). */
export const BUDGET = Object.freeze({ readyMs: 60000, pollMs: 250, quietMs: 3000, sweepFileBytes: 4 * 1024 * 1024, maxRedirects: 5 })

/** Owners of the rows U-SHELL cannot check (v3-tasks.md W4–W6, brief "Seam"). */
export const LATER = Object.freeze({
  marks: 'U-MARKS (managed marks, Hand over / Take back from the hand-over service)',
  attn: 'U-ATTN (the fish and its attention dots, embed-UI attention tools contributed)',
  records: 'U-RECORDS (inline read-only ask_fishball and permission records)',
  askCard: "F-ASKCARD (an undecidable ask shows in Fishball's own page)",
  child: "X-MATRIX / E2E-UI (a real child: the page loads, cookie redemption, ticket replay; I-HOST's real locator)",
  e2e: 'E2E-UI (W6 browser flows: frame reload, the model-sync control on the Plugins page)',
  relay: 'X-MATRIX (row 7: no traffic over the lifecycle wire other than lifecycle)',
})
