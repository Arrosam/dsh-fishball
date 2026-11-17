/**
 * Vocabulary for the I-HOST cases. Every value comes from the requirements (v3-requirements at
 * `design/v3-token-reveal`: R-HOST-01…10, R-BND-01…04, R-ARCH-05, R-ARCH-10, R-FB-10/12/14), design
 * §1.0, §1.0b, §1.0c, §4.1, §5.4, §6.1, §6.2, the frozen K3 / K3a contracts
 * (packages/dsh-connector/host-services/*.d.ts as I-HOST amends them, packages/core/contracts
 * HOSTED_IMPORT), the user's decisions for this task (R1, R6 = B, R8/R11, Q-B2, Q-G3, Q-G7, QD1 = B,
 * I-HOST Q1…Q7) or the seam the dev session relayed (RELAYED). None comes from an implementation.
 */
import path from 'node:path'
import { V3 } from '../../contract/package-boundaries/constants.mjs'

/** The seam the I-HOST dev session relayed (2026-11-16). Only subject.mjs and cases.mjs's binding read it. */
export const RELAYED = Object.freeze({
  modules: Object.freeze({
    host: 'host.js',
    childRow: 'child-row.js',
    locator: path.join('src', 'host', 'locator.js'),
    hosted: path.join('src', 'host', 'hosted.js'),
    record: path.join('src', 'host', 'hosted-record.js'),
    routes: path.join('src', 'host', 'routes.js'),
    ticket: path.join('src', 'native-runtime', 'ticket.js'),
    credential: path.join('src', 'native-runtime', 'credential.js'),
    constants: path.join('src', 'native-runtime', 'constants.js'),
    runtime: path.join('src', 'native-runtime', 'index.js'),
    admin: path.join('src', 'child', 'admin.js'),
    syncTarget: path.join('src', 'child', 'provider-sync-target.js'),
    syncRoutes: path.join('src', 'host', 'provider-sync-routes.js'),
  }),
  exports: Object.freeze({
    locator: 'createChildLocator',
    hosted: Object.freeze(['createHostedToken', 'childTargetUrl']),
    record: 'openHostedRecord',
    routes: 'registerInstanceRoutes',
    ticket: Object.freeze(['admissionKey', 'mintTicket', 'verifyTicket', 'createTicketRedeemer']),
    credential: Object.freeze(['createCredentialClient', 'createCredentialReceiver']),
    admission: 'registerAdmission',
    overlay: 'launchOverlay',
  }),
  /**
   * `<mainHome>/fishball/hosted.json` (beside the runtime tree, dev ba1fecd5), mode 0600,
   * `{format: 1, instanceId: <uuid>, entries: [...], runtime?}` newest last; written at once when missing.
   * I-SUCCEED (Q3 = A): `runtime` is the child runtime id the newest entry was created under.
   */
  record: Object.freeze({ dirs: Object.freeze(['fishball']), file: 'hosted.json', mode: 0o600, format: 1, key: 'entries', idKey: 'instanceId', runtimeKey: 'runtime', damaged: 'INVALID_HOSTED_RECORD' }),
  /** The credential client's rejection when no answer can come (dev 2026-11-16). */
  channelUnavailable: 'CREDENTIAL_CHANNEL_UNAVAILABLE',
  /** Invalid admit input (a view or lang outside K3; dev ba1fecd5, documented in child.d.ts). */
  invalidRequest: 'invalid-request',
  /** The receiver's refusals. */
  receiver: Object.freeze({ unwritable: 'credentials-unwritable', invalid: 'invalid-request' }),
  /** The notice a Retry records after a delete (R6 = B). */
  notice: 'hosted-entry-deleted',
  /** The constant names in src/native-runtime/constants.js the cases read. */
  constantNames: Object.freeze({ ticket: 'TICKET', loopback: 'LOOPBACK', placement: 'PLACEMENT' }),
  /** Ticket TICKET values (brief). */
  ticket: Object.freeze({ ttlMs: 30000, param: 'ticket', path: '/api/dsh-instance/admit' }),
  /** Open Fishball's view (Q7; dev 4884fa15: LOOPBACK.openView). */
  openView: 'chat',
  /** The admission redirect: 303 to `/#view=<view>&lang=<lang>`. */
  admit: Object.freeze({ seeOther: 303, forbidden: 403, notAllowed: 405, kind: 'exact', landing: (view, lang) => `/#view=${view}&lang=${lang}` }),
  /** HMAC-SHA256 output length of admissionKey (bytes). */
  keyBytes: 32,
})

/** The instance's settings page routes (owner-only DSH Fetch, JSON, no-store). */
export const ROUTE = Object.freeze({
  prefix: '/api/dsh-instance/',
  status: '/api/dsh-instance/status',
  retry: '/api/dsh-instance/retry',
  reconnect: '/api/dsh-instance/reconnect',
  open: '/api/dsh-instance/open',
  models: Object.freeze({ check: '/api/dsh-instance/models/check', add: '/api/dsh-instance/models/add' }),
  statusKeys: Object.freeze(['state', 'code', 'detail', 'notice']),
  noStore: 'no-store',
  json: /^application\/json/,
  ok: 200,
  hostHeader: 'host',
})

/** K3 child.d.ts (as amended by I-HOST). */
export const K3 = Object.freeze({
  service: 'dshInstanceChild',
  apiVersion: 1,
  members: Object.freeze(['apiVersion', 'status', 'onChange', 'origin', 'admit', 'retry', 'reconnect', 'targetStatus', 'providerSync']),
  state: Object.freeze({ starting: 'starting', ready: 'ready', failed: 'failed', stopped: 'stopped' }),
  code: Object.freeze({ incompatible: 'PROFILE_INCOMPATIBLE', exited: 'NATIVE_CHILD_EXITED', unreachable: 'TARGET_UNREACHABLE', revoked: 'token-revoked' }),
  /** Withdrawn by Q4 (R-FB-10 amended by 1.39). */
  withdrawnCode: 'fishball-off',
  target: Object.freeze({ connected: 'connected', unreachable: 'target-unreachable', refused: 'token-refused', unset: 'target-unset' }),
  admitError: Object.freeze({ hostname: 'hostname-refused', notReady: 'not-ready' }),
  reconnect: Object.freeze({ notReady: 'not-ready', connectorMissing: 'connector-missing', remote: 'target-remote', failed: 'operation-failed', unwritable: 'credentials-unwritable' }),
  views: Object.freeze(['chat', 'settings']),
  langs: Object.freeze(['zh', 'en']),
  entry: Object.freeze({ enabled: 'enabled', disabled: 'disabled', deleted: 'deleted' }),
})

/** The loopback names (S4-Q1 A; Q5 = A: `[::1]` is not served). */
export const HOSTNAME = Object.freeze({
  ipv4: '127.0.0.1',
  localhost: 'localhost',
  ipv6: '[::1]',
  served: Object.freeze(['127.0.0.1', 'localhost']),
  /** EP: names that are not loopback (a tunnel, a LAN name, another 127/8 address, the any-address, blank). */
  refused: Object.freeze(['fishball.example.com', '192.168.1.20', '127.0.0.2', '0.0.0.0', '']),
  upper: 'LOCALHOST',
})

/** K3a HOSTED_IMPORT (packages/core/contracts/constants.js): the names the instance's child-side row writes. */
export const IMPORT = Object.freeze({
  credentialRef: 'DSH_AGENT_TOKEN',
  childRow: 'dsh-instance-child',
  targetField: 'targetUrl',
  savedRecord: 'fishball-core/hosted-agent',
  channel: 'mcp-credential',
  ops: Object.freeze({ probe: 'probe', import: 'import' }),
})

/** The connector's MCP route (design §1.0c). */
export const CONNECTOR_MCP = '/api/agent/mcp'

/**
 * Q2: the order the instance appends its placed bundles, core last (R-BND-01 default set).
 * Re-baselined (SHELVE-BOARD, was board, ui, core): fishball-ui then fishball-core. The user,
 * 2026-11-18: "fishball-board先从这次release中移除，我要改的地方太多了。先封存，留到下一批再说。
 * 所以不要预留在子实例的Fishball内。" `shelved` is never placed, installed, bundled or recorded.
 */
export const PLACEMENT = Object.freeze({
  bundles: Object.freeze([V3.ui.name, V3.core.name]),
  shelved: V3.board.name,
  uiDirectory: 'fishball-ui',
  library: V3.shared.name,
  vendor: 'vendor',
  manifest: 'package.json',
})

/** R-ARCH-10 / user decision: the Fishball-side packages no dsh-instance file may import. */
export const FISHBALL_SIDE = Object.freeze([V3.core.name, V3.ui.name, V3.board.name, V3.shared.name])

/** HOST-EP-01 row 3 (R-ARCH-05): services that read or write sessions, approvals, questions or prompts. */
export const SESSION_LIKE = /session|approval|question|prompt|^agents?$/i
/** R-HOST-05 / R1: no token or credential-reference setting anywhere in the instance's config. */
export const SECRET_LIKE = /token|credential|secret|tokenRef|key/i
/** The 64-hex shape of a lifecycle secret or admission key (the dev's correction: none in any overlay row). */
export const HEX64 = /\b[0-9a-f]{64}\b/i
export const ADMISSION_KEY_FIELD = 'admissionKey'

/** QD1 = B: the instance's own settings page. */
export const PAGE = Object.freeze({
  entry: 'client.js',
  chunks: Object.freeze(['client.status.js', 'client.models.js']),
  childRow: 'child-row.js',
  slot: 'plugins.row.config',
  platform: 'web',
  clientExport: './client',
})

/** The modules moved by I-HOST (brief "Exported surface"). */
export const MOVED = Object.freeze({
  present: Object.freeze([
    [V3.instance, path.join('src', 'child', 'provider-sync-target.js')],
    [V3.instance, 'child-row.js'],
    [V3.instance, 'client.js'],
    [V3.instance, 'client.status.js'],
    [V3.instance, 'client.models.js'],
    [V3.core, path.join('src', 'session', 'route.js')],
    [V3.connector, path.join('host-services', 'ui.d.ts')],
  ]),
  absent: Object.freeze([
    [V3.core, path.join('src', 'slim', 'child', 'admin.js')],
    [V3.core, path.join('src', 'slim', 'child', 'provider-sync-target.js')],
    [V3.instance, path.join('src', 'native-runtime', 'session-route.js')],
    [V3.instance, path.join('src', 'child-settings')],
    [V3.embed, path.join('src', 'client', 'client.instance.js')],
    [V3.embed, path.join('src', 'client', 'client.status.js')],
    ...['admin-protocol', 'provider-sync', 'provider-sync-codec', 'provider-sync-host', 'redact'].map((m) => [V3.shared, m + '.js']),
  ]),
  /** Core's patch rows and exports that left with the child halves. */
  coreRowsGone: Object.freeze(['fishball-native-admin', 'fishball-native-provider-sync']),
  coreExportsGone: Object.freeze(['./slim/admin', './slim/provider-sync-target']),
  /** fishball-core publishes the manager-session route itself. */
  sessionRow: Object.freeze({ id: 'fishball-core-session', name: 'fishball-core/session-route', export: './session-route', file: './src/session/route.js', register: 'registerSessionRoute' }),
  /** The admin service has no hook into core any more. */
  adminHooks: Object.freeze(['applyModel', 'currentModel']),
})

/**
 * provider-sync-host.js neutral names (design §1.0c). C-WIRE-2 (R-ARCH-08 strict: its only user is the
 * instance) moved it from dsh-connector-shared to dsh-instance/src/lib/.
 */
export const SYNC_HOST = Object.freeze({
  file: path.join(V3.instance.dir, 'src', 'lib', 'provider-sync-host.js'),
  constant: 'PROVIDER_SYNC_HOST',
  defaultRoute: 'dsh-sync-default',
  defaultModel: 'dsh-sync-default-model',
  logger: 'dsh-provider-sync',
  /** The DSH row that holds the default model (dsh-web-app, both SDKs); sync never writes it (Q-G7). */
  defaultModelNs: 'agent-default-model',
})

/** K3 freeze added by I-HOST: dshConnectorUi. */
export const UI_FREEZE = Object.freeze({
  file: path.join(V3.connector.dir, 'host-services', 'ui.d.ts'),
  readme: path.join(V3.connector.dir, 'host-services', 'README.md'),
  index: path.join(V3.connector.dir, 'host-services', 'index.d.ts'),
  child: path.join(V3.connector.dir, 'host-services', 'child.d.ts'),
  service: 'dshConnectorUi',
  routes: Object.freeze(['state', 'events', 'handover', 'takeback', 'notice/dismiss', 'opened'].map((r) => '/api/dsh-connector/ui/' + r)),
  snapshot: Object.freeze(['marks', 'targets', 'attention', 'notice', 'light']),
})

/** Fixtures: planted values and ids (recognisable, never a real secret). */
export const FIXTURE = Object.freeze({
  instanceId: 'fbtest-ihost-instance',
  /** I-SUCCEED (the user's Q3 = A): the child runtime id `runtimeId()` answers; one runtime for every I-HOST row. */
  runtimeId: 'fbtest-ihost-runtime',
  generation: 'fbtest-ihost-generation',
  otherGeneration: 'fbtest-ihost-generation-2',
  port: 49321,
  otherPort: 49322,
  secret: 'fbtest-ihost-lifecycle-secret',
  otherSecret: 'fbtest-ihost-lifecycle-secret-2',
  /** A planted hosted value prefix; the fake connector appends a counter. */
  planted: 'dsht_FBTEST-IHOST-PLANTED-',
  label: 'Fishball (hosted)',
  entryPrefix: 'fbtest-entry-',
  hostOrigin: 'http://127.0.0.1:47000',
  remote: 'https://remote.example/api/agent/mcp',
  blank: '',
  spaces: '   ',
  launchToken: 'FBTEST-LAUNCH-TOKEN',
  cookie: 'dsh_session=fbtest-cookie; HttpOnly; SameSite=Strict; Path=/',
  t0: 1_800_000_000_000,
  tempPrefix: 'fbtest-ihost-',
  /** Harness waits (never a product oracle). */
  shortTimeoutMs: 60,
  longTimeoutMs: 5000,
  settleMs: 20,
  detail: 'fbtest detail',
})

/** Rows that need a real hosted child (this suite launches no process). */
export const SKIP = Object.freeze({
  hosted: (id) => `needs a hosted child (${id})`,
  hostRow: (id) => `needs the host row applied in a host DSH with a hosted child (${id})`,
  uninstall: 'needs a hosted child (HOST-UC-06 A2 / HOST-ST-01 row 10: the uninstall CLI is a child process; this suite launches none)',
  exportOffer: 'withdrawn: the board archive export no longer exists (board_export and the uninstall export dropped in W3, packages/board/src/store.js); leftover recorded by the I-HOST dev session',
})

/**
 * UI-POLISH-D rows of the instance's own settings page (page.mjs, polish-cases.mjs; the requirements
 * relayed 2026-11-18 and the developer's note of that day). Words are the page's dictionary values
 * the requirements quote; hooks are the page's unchanged data attributes.
 */
export const PAGE_POLISH = Object.freeze({
  id: Object.freeze({ sections: 'UIPD-INST-SECTIONS', retry: 'UIPD-INST-RETRY', sync: 'UIPD-INST-SYNC' }),
  langs: Object.freeze(['en', 'zh']),
  /** The three h3 headings in page order: the actions card (`actions`), model sync, Launch. */
  headings: Object.freeze({ en: Object.freeze(['Fishball', 'Model for Fishball', 'Launch']), zh: Object.freeze(['Fishball', 'Fishball 的模型', '启动']) }),
  placeholder: Object.freeze({ en: 'This DSH\'s connector', zh: '本 DSH 的连接器' }),
  targetLabel: Object.freeze({ en: 'Remote target', zh: '远程目标' }),
  retryWords: Object.freeze({ en: 'Retry', zh: '重试' }),
  openWords: Object.freeze({ en: 'Open Fishball', zh: '打开 Fishball' }),
  /** EP over the instance states the status route can answer (CHILD_STATE): only `failed` shows Retry. */
  states: Object.freeze(['disabled', 'waiting', 'starting', 'ready', 'stopping', 'stopped', 'failed']),
  failed: 'failed',
  ready: 'ready',
  attr: Object.freeze({
    target: 'data-dsh-instance-target', open: 'data-dsh-instance-open', reconnect: 'data-dsh-instance-reconnect',
    state: 'data-fishball-instance-state', retry: 'data-fishball-instance-retry',
    check: 'data-fishball-model-check', add: 'data-fishball-model-add', entry: 'data-fishball-model-entry', sync: 'data-fishball-model-sync',
  }),
  /** Harness handles: the fake Button keeps the variant it was given (never a product marker). */
  variantAttr: 'data-fbtest-variant',
  primitiveAttr: 'data-primitive',
  primary: 'primary',
  stateDot: 'StateDot',
  checkbox: 'Checkbox',
  input: 'Input',
  iconPrefix: 'Icon',
  base: 'http://127.0.0.1:47000/',
  /** The model sync check's fixture answer: three providers Fishball lacks. */
  check: Object.freeze({
    checkId: 'fbtest-polish-check',
    missing: Object.freeze([
      Object.freeze({ id: 'fbtest-p1', name: 'Provider One', models: Object.freeze(['m1']) }),
      Object.freeze({ id: 'fbtest-p2', name: 'Provider Two', models: Object.freeze([]) }),
      Object.freeze({ id: 'fbtest-p3', name: 'Provider Three', models: Object.freeze(['m3a', 'm3b']) }),
    ]),
    notOffered: Object.freeze([]),
    present: 0,
  }),
  settleRounds: 40,
  pollMs: 20,
  waitMs: 5000,
})

/**
 * R-FIX-INSTANCE (relayed 2026-11-18) rows F01, F05, F06, F07, F08 (fix-cases.mjs). Values come from
 * the findings' requirements; product words this file already names are reused.
 * - `row`: the host row (host.js) the row-level cases apply over a fake ctx and a fake runtime
 *   (row.mjs): its config fields, the loader event after a volatile change, its warn for an
 *   unreadable hosted record, and the main-home proof's codes (F08).
 * - `filesModule`: the new F08 export of src/native-runtime/files.js.
 */
export const RFI = Object.freeze({
  task: 'R-FIX-INSTANCE',
  /** Harness: the URL parameter that binds host.js to one row world, and the global map of worlds (row.mjs). */
  worldParam: 'fbrow',
  worldsKey: 'fbtest.dsh-instance.rfi-row-worlds',
  /** The runtime module host.js imports, which row.mjs replaces for a row world. */
  runtimeModule: /\/src\/native-runtime\/index\.js$/,
  row: Object.freeze({
    enabled: 'enabled',
    target: IMPORT.targetField,
    volatileUpdate: 'loader/volatile-update',
    recordWarn: 'hosted record unreadable (%s)',
    warnLevel: 'warn',
    tokensService: 'dshConnectorTokens',
  }),
  files: Object.freeze({ entry: path.join('src', 'native-runtime', 'files.js'), export: 'fishballDirectory' }),
  code: Object.freeze({ invalidHome: 'INVALID_MAIN_HOME', unsafeDirectory: 'UNSAFE_DIRECTORY', interrupted: 'START_INTERRUPTED' }),
  /** The record folder's name under the main home (RELAYED.record.dirs). */
  fishball: RELAYED.record.dirs[0],
  /** What a scripted credential client's import does: no answer (the client rejects channel-unavailable), or a definite answer. */
  answer: Object.freeze({
    none: 'unanswered',
    ok: Object.freeze({ ok: true }),
    refused: Object.freeze({ ok: false, code: RELAYED.receiver.unwritable }),
    refusedOther: Object.freeze({ ok: false, code: RELAYED.receiver.invalid }),
  }),
  /** Fixture names: an outside folder a link points to, an alias of a main home, its target. */
  fixture: Object.freeze({ real: 'real-home', alias: 'alias-home', outside: 'outside', child: 'home', ancestor: 'ancestor-link', oldEntry: 'fbtest-old-entry', olderEntry: 'fbtest-older-entry' }),
  /** Harness waits (never a product oracle). */
  wait: Object.freeze({ testMs: 30000, pollMs: 10, readyMs: 5000, quietMs: 150, predecessorMs: 300 }),
})
