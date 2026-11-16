/**
 * Vocabulary for the C-WIRE black-box cases (v3-tasks.md W4b C-WIRE; design §1.0c, §3.1, §5.5,
 * §5.5a, §5.9 on design/v3-token-reveal; requirements R-ARCH-03, R-CON-10, R-ID-12, R-OA-20,
 * R-ROUTE-04/06, 1.41 Q-G8; the parent's C-WIRE brief R1–R21).
 *
 * Product values come only from:
 * - K1 `dsh-connector/mcp-schema` (paths, scopes, tools, the read roles, limits, codes);
 * - K2 `dsh-connector/tools` (emit refusals);
 * - K3 `host-services/*.d.ts` (service names and refusal codes, restated below as the declarations
 *   spell them);
 * - the surface the dev session relayed (2026-11-16): the settings routes, the UI routes, the row id,
 *   the settings keys and the revocation note's form, restated in SURFACE.
 * Everything else is fixture data or harness timing, which are not product values.
 */
import os from 'node:os'
import path from 'node:path'
import * as K1 from '../../../../packages/dsh-connector/mcp-schema/index.js'
import * as K2 from '../../../../packages/dsh-connector/tools/index.js'
import { REPO } from '../../../support/constants.mjs'

export { K1, K2 }

const CONNECTOR_DIR = path.join(REPO, 'packages', 'dsh-connector')
const UI_DIR = path.join(REPO, 'packages', 'dsh-connector-ui')

/** The packages a wire profile links (by folder; the instance is never linked, so no child starts). */
export const PACKAGES = Object.freeze({
  connector: Object.freeze({ name: 'dsh-connector', dir: CONNECTOR_DIR }),
  ui: Object.freeze({ name: 'dsh-connector-ui', dir: UI_DIR }),
  /** The two libraries, plain dependencies (never bundles). */
  libraries: Object.freeze([
    Object.freeze({ name: 'dsh-connector-shared', dir: path.join(REPO, 'packages', 'dsh-connector-shared') }),
    Object.freeze({ name: 'fishball-shared', dir: path.join(REPO, 'packages', 'shared') }),
  ]),
})

/** Static files a case reads (PLAT-EP-03 row 1, R1, R16). */
export const FILES = Object.freeze({
  manifest: path.join(CONNECTOR_DIR, 'package.json'),
  client: path.join(CONNECTOR_DIR, 'client.js'),
  settingsPageConstants: path.join(CONNECTOR_DIR, 'src', 'settings-page', 'constants.js'),
  uiConstants: path.join(CONNECTOR_DIR, 'src', 'ui', 'constants.js'),
  revocation: path.join(CONNECTOR_DIR, 'src', 'revocation', 'index.js'),
  uiManifest: path.join(UI_DIR, 'package.json'),
  uiClientDir: path.join(UI_DIR, 'src', 'client'),
  uiHostDir: path.join(UI_DIR, 'src', 'host'),
})

/**
 * The relayed surface (dev session, 2026-11-16, through Fishball; see the file header). The paths
 * are restated here, so a renamed route fails a row.
 */
export const SURFACE = Object.freeze({
  rowId: 'dsh-connector',
  engines: '>=0.2.1-rc.5',
  clientPlatform: 'web',
  clientEntry: 'client.js',
  /** design §5.9: the settings page's only slot and its `<package>#<row id>` key. */
  slot: 'plugins.row.config',
  slotKey: 'dsh-connector#dsh-connector',
  settings: Object.freeze({
    tokens: 'tokens',
    routing: 'routing',
    agentToken: 'agentToken',
    approval: 'approval',
    port: 'port',
    maxQueuedInputs: 'maxQueuedInputs',
    maxMessageBytes: 'maxMessageBytes',
    /** V2's kept limits and their defaults (test/support LIMITS; R2: "stay with their defaults"). */
    limits: Object.freeze({ maxQueuedInputs: 200, maxActiveWatches: 50, maxPendingApprovals: 8, argumentExcerptBytes: 8192, maxMessageBytes: 65536, auditEntriesKept: 500 }),
    itemKeys: Object.freeze(['enabled', 'key', 'label']),
    portMin: 0,
    portMax: 65535,
  }),
  route: Object.freeze({
    create: '/api/dsh-connector/tokens/create',
    notice: '/api/dsh-connector/tokens/notice',
    state: '/api/dsh-connector/settings/state',
    uiState: '/api/dsh-connector/ui/state',
    uiHandOver: '/api/dsh-connector/ui/handover',
    uiTakeBack: '/api/dsh-connector/ui/takeback',
    uiPrefix: '/api/dsh-connector/ui/',
  }),
  /** GET state (relayed 2026-11-16): `{ok, entries, approval: {status, port, defaultPort}, designated}`. */
  stateKeys: Object.freeze(['approval', 'designated', 'entries', 'ok']),
  stateEntryKeys: Object.freeze(['connected', 'enabled', 'id', 'key', 'label', 'lastSeenAt', 'name', 'paired']),
  approvalKeys: Object.freeze(['defaultPort', 'port', 'status']),
  /** design §1.0c host-only services. */
  service: Object.freeze({
    handover: 'dshConnectorHandover',
    tools: 'dshConnectorTools',
    tokens: 'dshConnectorTokens',
    ui: 'dshConnectorUi',
    v2: 'dshConnector',
  }),
  apiVersion: 1,
  /** K3 handover.d.ts / tokens.d.ts codes and states (types-only declarations, restated). */
  k3: Object.freeze({
    unknownSession: 'unknown-session',
    hostedLabel: 'Fishball (hosted)',
    entryState: Object.freeze({ enabled: 'enabled', disabled: 'disabled', deleted: 'deleted' }),
    hostedFields: Object.freeze(['entryKey', 'label', 'value']),
  }),
  approvalStatusOk: 'ok',
  /** Q4 (dev 2026-11-16): the revocation note reaches the session's next turn as a user/message of this source kind. */
  noteSourceKind: 'dsh-connector-note',
  noteExport: 'REVOCATION_NOTE',
  /** embed-UI's availability route (U-SHELL); R16: no `legacy` field once the V3 connector is loaded. */
  uiServicesRoute: '/api/dsh-connector-ui/services',
  legacyField: 'legacy',
  connectorMissing: 'connector-missing',
})

/** HTTP's own words (RFC 9110/9111) and DSH's browser fence markers. */
export const HTTP = Object.freeze({
  ok: 200,
  badRequest: 400,
  contentType: 'content-type',
  cacheControl: 'cache-control',
  json: /^application\/json\b/i,
  noStore: /\bno-store\b/i,
  formType: 'application/x-www-form-urlencoded',
  sameOrigin: Object.freeze({ 'sec-fetch-site': 'same-origin' }),
  basic: 'Basic',
})

/** DSH's own rows and vocabulary the worker uses (installed SDK, both versions). */
export const DSH = Object.freeze({
  profile: 'fbwire',
  defaultModelRow: 'agent-default-model',
  fakeLlmRow: 'fbwire-llm',
  readyProbeRow: 'fbwire-ready-probe',
  webBundle: '@deepseek-ai/dsh-web-app',
  activityEvent: 'api-session/activity',
  settingsWriteMethods: Object.freeze(['update', 'replace', 'mutate']),
  promptMode: 'steer',
  homePatch: 'cordis.patch.yml',
  urlLine: /dsh web: (http\S+)/,
  tokenParam: 'token',
  fiberActive: 2,
  /** cordis LoggerLevel.DEBUG: every line. */
  allLevels: 3,
})

/** The worker's environment switches. */
export const ENV = Object.freeze({
  /** JSON: extra bundles to link at the first boot ([{name, dir}]). */
  link: 'FBWIRE_LINK',
  /** JSON: the connector row's base config for this boot (written into the home patch). */
  rowConfig: 'FBWIRE_ROW_CONFIG',
  /** JSON: fixture contributor bundles ([{name, dir}]) linked at first boot. */
  contributors: 'FBWIRE_CONTRIBUTORS',
  /** `on`: the connector is not installed (R16: embed-UI with no local connector). */
  noConnector: 'FBWIRE_NO_CONNECTOR',
  /** The base profile without dsh-web-app: no HTTP listener is expected. */
  noWebApp: 'FBWIRE_NO_WEB_APP',
  on: '1',
})

/** Fixture data: not product values. */
export const FIXTURE = Object.freeze({
  homeLabel: 'v3-c-wire',
  tempPrefix: 'fbtest-c-wire-',
  clientInfo: Object.freeze({ name: 'fbtest-c-wire', version: '0.0.0' }),
  label: Object.freeze({ a: 'Agent A', b: 'Agent B', c: 'Agent C', hand: 'Typed by hand', copy: 'Agent A (copy)' }),
  handKey: 'fbtest-wire-hand-key',
  id: Object.freeze({ a: 'wire-agent-a', b: 'wire-agent-b', c: 'wire-agent-c' }),
  name: Object.freeze({ a: 'Navigator', renamed: 'Pathfinder' }),
  unknownSession: 'session-fbtest-wire-no-such-session',
  instanceId: 'fbtest-wire-instance',
  remoteRedirect: 'https://remote.example/cb',
  remoteClientId: 'https://remote.example/cimd.json',
  remoteClientName: 'Remote Fishball',
  folder: 'wire-work',
  title: 'fbtest wire title',
  reason: 'fbtest wire reason',
  /** A 1×1 transparent PNG (attachment_put). */
  png: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  pngType: 'image/png',
  /** The fake model's second model (support FAKE / FAKE_MODELS.b), as a `<provider>/<model>` route session_start picks. */
  otherModel: 'test-model-b',
  otherRoute: 'fishball-test/test-model-b',
  smallLimit: 64,
  burst: 10,
  message: 'fbtest wire message from the principal',
  userText: 'fbtest wire user turn',
  contributorName: 'fbtest-wire-contrib',
  contributorEvent: 'pinged',
  /** A tunnel name for DSH's --trusted-host (R6: a request through another origin port). */
  tunnelHost: 'wire-tunnel.example',
  tunnelPort: 8443,
  pad: 'n',
  euro: '\u20ac',
})

/** Harness timing (waiting only; none is a product oracle). */
export const BUDGET = Object.freeze({
  bootMs: 120000,
  readyMs: 60000,
  pollMs: 100,
  quietMs: 1500,
  testMs: 240000,
  stopMs: 20000,
  rpcMs: 20000,
  turnMs: 30000,
})

/** Where the throwaway homes live: canonical, outside any Git tree (the brief's environment). */
export const HOMES = Object.freeze({ root: process.env.FBTEST_TEST_HOMES ?? path.join(os.tmpdir(), 'fbtest-' + process.pid, '.runtime', 'test-homes') })

/** Rows another task or level owns. */
export const LATER = Object.freeze({
  wire2: 'C-WIRE-2 (the V2 approval broker and intake are switched to V3 routing there: message_agent / permission requests become V3 events)',
  hostedChild: 'I-HOST / X-MATRIX (a launched hosted child; this suite launches none)',
  browser: 'E2E-UI (the real Plugins page in a browser)',
})
