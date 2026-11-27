/**
 * Vocabulary for the C-WIRE black-box cases (v3-tasks.md W4b C-WIRE; design §1.0c, §3.1, §5.5,
 * §5.5a, §5.9 on design/v3-token-reveal; requirements R-ARCH-03, R-CON-10, R-ID-12, R-OA-20,
 * R-ROUTE-04/06, 1.41 Q-G8; the parent's C-WIRE brief R1–R21).
 *
 * Product values come only from:
 * - K1 `dsh-agent-connector/mcp-schema` (paths, scopes, tools, the read roles, limits, codes);
 * - K2 `dsh-agent-connector/tools` (emit refusals);
 * - K3 `host-services/*.d.ts` (service names and refusal codes, restated below as the declarations
 *   spell them);
 * - the surface the dev session relayed (2026-11-16): the settings routes, the UI routes, the row id,
 *   the settings keys and the revocation note's form, restated in SURFACE.
 * Everything else is fixture data or harness timing, which are not product values.
 */
import os from 'node:os'
import path from 'node:path'
import * as K1 from 'dsh-agent-connector/mcp-schema'
import * as K2 from 'dsh-agent-connector/tools'
import { TEST_HOMES } from '../homes.mjs'
import { packageDir } from '../repo.mjs'

export { K1, K2 }

const CONNECTOR_DIR = packageDir('dsh-connector')
const UI_DIR = packageDir('dsh-connector', 'ui')

/** The packages a wire profile links (by folder; the instance is never linked, so no child starts). */
export const PACKAGES = Object.freeze({
  /** npm name dsh-agent-connector (the user, 2026-11-17); the folder and the row id stay dsh-connector. */
  connector: Object.freeze({ name: 'dsh-agent-connector', dir: CONNECTOR_DIR }),
  ui: Object.freeze({ name: 'dsh-connector-ui', dir: UI_DIR }),
  /** The DSH side's library, a plain dependency (never a bundle). */
  libraries: Object.freeze([
    Object.freeze({ name: 'dsh-connector-shared', dir: packageDir('dsh-connector-shared') }),
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
  /** design §5.9 + df9d83d: the settings page's only slot, keyed by its bundle's package name. */
  slot: 'plugins.bundle.config',
  slotKey: 'dsh-agent-connector',
  settings: Object.freeze({
    tokens: 'tokens',
    /** Withdrawn by C-WIRE-2 (the user's q5, "Remove agentToken entirely"): named only to assert they are gone. */
    routing: 'routing',
    agentToken: 'agentToken',
    approval: 'approval',
    port: 'port',
    /** C-WIRE-2 (decision list item 8): approval.dshName, optional, no default. */
    dshName: 'dshName',
    maxQueuedInputs: 'maxQueuedInputs',
    maxMessageBytes: 'maxMessageBytes',
    /**
     * The kept limits and their defaults. C-WIRE-2 (decision list item 9) removed maxActiveWatches,
     * maxPendingApprovals and auditEntriesKept (the user: "No cap on pending approvals"; q6 no audit)
     * and keeps readSessionMessages / readSessionBytes beside these (relayed Config({})).
     */
    limits: Object.freeze({ maxQueuedInputs: 200, argumentExcerptBytes: 8192, maxMessageBytes: 65536, readSessionMessages: 12, readSessionBytes: 12288 }),
    /** C-WIRE-2 (decision list item 9): fields that no longer exist. */
    removed: Object.freeze(['maxPendingApprovals', 'maxActiveWatches', 'watchesShown', 'auditEntriesKept', 'rationaleChars', 'requestUserMessageBytes',
      'forwardExcerptBytes', 'userMessagesListed', 'userMessageExcerptChars', 'questionMode']),
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
  /** GET state (relayed 2026-11-17, C-WIRE-2: no `designated`, the user's q5): `{ok, entries, approval: {status, port, defaultPort}}`. */
  stateKeys: Object.freeze(['approval', 'entries', 'ok']),
  stateEntryKeys: Object.freeze(['connected', 'enabled', 'id', 'key', 'label', 'lastSeenAt', 'name', 'paired']),
  approvalKeys: Object.freeze(['defaultPort', 'port', 'status']),
  /** design §1.0c host-only services. */
  service: Object.freeze({
    handover: 'dshConnectorHandover',
    tools: 'dshConnectorTools',
    tokens: 'dshConnectorTokens',
    ui: 'dshConnectorUi',
    /** The V2 services C-WIRE-2 removed (named only to assert they are gone). */
    v2: 'dshConnector',
    v2SessionState: 'fishballSessionState',
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
  /** cordis FiberState: PENDING waits for a required service (DSH's missing-dependency state), ACTIVE is loaded. */
  fiberPending: 0,
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
  /** A module path: an extension of this worker (extra overlay rows and ops; worker.mjs). */
  extension: 'FBWIRE_EXTENSION',
  on: '1',
})

/** Inclusive structural limit per tools/call, independent of the HTTP body size limit. */
export const MAX_ARGUMENT_ENTRIES = 4096
/** MCP unknown tool: JSON-RPC Invalid params, not a tool execution result. */
export const UNKNOWN_TOOL_CODE = -32602

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
  uiNotify: 'notify', // R-EXT-13: local tool contributed by the linked UI package.
  unknownTool: 'fbtest_unlisted_tool',
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
export const HOMES = Object.freeze({ root: TEST_HOMES })

/** Rows another task or level owns. */
export const LATER = Object.freeze({
  wire2: 'C-WIRE-2 (the V2 approval broker and intake are switched to V3 routing there: message_agent / permission requests become V3 events)',
  movedTo: (file) => 'moved by C-WIRE-2 to packages/dsh-connector/tests/interactions/' + file,
  withdrawnAsk: 'withdrawn by C-WIRE-2: the user (2026-11-16/17) "不给ask_agent工具" — no ask_agent, so no ask round, direct-call hint, quote or pass',
  withdrawnList: 'withdrawn by C-WIRE-2: the user (2026-11-16/17) "list_user_messages is deleted"',
  withdrawnDesignated: 'withdrawn by C-WIRE-2: the user (q5, 2026-11-17) "Remove agentToken entirely" — no designated agent, no no-recipient queue',
  hostedChild: 'I-HOST / X-MATRIX (a launched hosted child; this suite launches none)',
  browser: 'E2E-UI (the real Plugins page in a browser)',
})