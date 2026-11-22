/**
 * The host area's vocabulary. Every value comes from a requirement: the package README ("The hosted
 * token", "Settings page"), the JSDoc contracts of the exports under test (src/host/*.js,
 * src/native-runtime/ticket.js, credential.js, constants.js comments) and the K3 / K3a contracts they
 * restate (dshInstanceChild, dshConnectorTokens, HOSTED_IMPORT). Fixture values are recognisable
 * plants, never real secrets. What other areas share is in ../support/constants.mjs.
 */
import { EXTRA_CREDENTIALS, HOSTED_IMPORT, HOSTED_RECORD, MODULE as SHARED_MODULE, ROW_CONFIG, TOKENS } from '../support/constants.mjs'

export { EXTRA_CREDENTIALS }

/** The package modules the area reaches, relative to the package root. */
export const MODULE = Object.freeze({
  ...SHARED_MODULE,
  childRow: 'child-row.js',
  locator: 'src/host/locator.js',
  hosted: 'src/host/hosted.js',
  record: 'src/host/hosted-record.js',
  routes: 'src/host/routes.js',
  syncRoutes: 'src/host/provider-sync-routes.js',
  syncHost: 'src/lib/provider-sync-host.js',
  syncTarget: 'src/child/provider-sync-target.js',
  ticket: 'src/native-runtime/ticket.js',
  files: 'src/native-runtime/files.js',
})

/** K3a HOSTED_IMPORT names (README "The hosted token"). */
export const IMPORT = Object.freeze({
  ...HOSTED_IMPORT,
  childRow: 'dsh-instance-child',
  targetField: 'targetUrl',
})

/** <DSH_HOME>/fishball/hosted.json (README), private, {format: 1, instanceId, entries, runtime?}. */
export const RECORD = Object.freeze({ ...HOSTED_RECORD, mode: 0o600, format: 1, damaged: 'INVALID_HOSTED_RECORD' })

/** K3 dshInstanceChild (child.d.ts as I-HOST amended it; locator.js JSDoc). */
export const K3 = Object.freeze({
  service: 'dshInstanceChild',
  apiVersion: 1,
  members: Object.freeze(['status', 'onChange', 'origin', 'admit', 'retry', 'reconnect', 'targetStatus', 'agentEntry']),
  state: Object.freeze({ starting: 'starting', ready: 'ready', failed: 'failed', stopped: 'stopped', disabled: 'disabled' }),
  code: Object.freeze({ incompatible: 'PROFILE_INCOMPATIBLE', exited: 'NATIVE_CHILD_EXITED', revoked: 'token-revoked' }),
  withdrawnCode: 'fishball-off',
  views: Object.freeze(['chat', 'settings']),
  langs: Object.freeze(['zh', 'en']),
  entry: TOKENS.entry,
  refusal: Object.freeze({ notReady: 'not-ready', hostname: 'hostname-refused', connectorMissing: 'connector-missing', failed: 'operation-failed', unwritable: 'credentials-unwritable', invalid: 'invalid-request' }),
  tokensService: TOKENS.service,
  tokensApiVersion: TOKENS.apiVersion,
})

/** K3 TargetStatus answers (hosted.js targetStatus, constants.js HOSTED.target). */
export const TARGET = Object.freeze({
  connected: Object.freeze({ state: 'connected', code: null }),
  unset: Object.freeze({ state: 'target-unset', code: null }),
  revoked: Object.freeze({ state: 'token-refused', code: 'token-revoked' }),
})

/** The notice Retry leaves after the user deleted the hosted entry (README, R6 = B). */
export const NOTICE = 'hosted-entry-deleted'
/** The credential client's rejection when no answer can come (credential.js JSDoc). */
export const CHANNEL_UNAVAILABLE = 'CREDENTIAL_CHANNEL_UNAVAILABLE'

/** The loopback names (K3 LoopbackHostname; Q5 = A: [::1] is not served). */
export const HOSTNAME = Object.freeze({
  ipv4: '127.0.0.1',
  localhost: 'localhost',
  ipv6: '[::1]',
  served: Object.freeze(['127.0.0.1', 'localhost']),
  refused: Object.freeze(['fishball.example.com', '192.168.1.20', '127.0.0.2', '0.0.0.0', '']),
  upper: 'LOCALHOST',
})

/** The admission ticket (constants.js TICKET comment; design §4.1). */
export const TICKET = Object.freeze({ ttlMs: 30000, param: 'ticket', path: '/api/dsh-instance/admit', keyBytes: 32 })
/** The admission route's answers (child-row.js registerAdmission JSDoc). */
export const ADMIT = Object.freeze({ seeOther: 303, forbidden: 403, notAllowed: 405, kind: 'exact', noStore: 'no-store', noReferrer: 'no-referrer', landing: (view, lang) => `/#view=${view}&lang=${lang}` })

/** The settings page routes (routes.js JSDoc; README "Settings page"). */
export const ROUTE = Object.freeze({
  status: '/api/dsh-instance/status',
  retry: '/api/dsh-instance/retry',
  restart: '/api/dsh-instance/restart',
  reconnect: '/api/dsh-instance/reconnect',
  open: '/api/dsh-instance/open',
  models: Object.freeze({ check: '/api/dsh-instance/models/check', add: '/api/dsh-instance/models/add' }),
  // fafbb5f: the status answer gained busy (the page disables Restart while a Fishball plugin change runs).
  statusKeys: Object.freeze(['state', 'code', 'detail', 'notice', 'busy']),
  openView: 'chat',
  noStore: 'no-store',
  json: /^application\/json/,
  ok: 200,
  disabled: 'instance-disabled',
})

/** The connector's MCP route the child links to (README; HOSTED.mcpPath). */
export const CONNECTOR_MCP = '/api/agent/mcp'

/** The host row (host.js): its config field, the loader's volatile event, its warn for an unreadable record. */
export const ROW = Object.freeze({
  ...ROW_CONFIG,
  extraTarget: 'targetUrl',
  recordWarn: 'hosted record unreadable (%s)',
  invalidHome: 'INVALID_MAIN_HOME',
  unsafeDirectory: 'UNSAFE_DIRECTORY',
})

/** R-ARCH-05: services that read or write sessions, approvals, questions or prompts. */
export const SESSION_LIKE = /session|approval|question|prompt|^agents?$/i
/** R-HOST-05 / R1: no token or credential-reference setting in the instance's config. */
export const SECRET_LIKE = /token|credential|secret|tokenRef|key/i
/** The 64-hex shape of a lifecycle secret or admission key. */
export const HEX64 = /\b[0-9a-f]{64}\b/i

/** Provider-sync neutral names (design §1.0c) and DSH's default-model row (Q-G7: never written). */
export const SYNC = Object.freeze({ defaultRoute: 'dsh-sync-default', defaultModel: 'dsh-sync-default-model', logger: 'dsh-provider-sync', defaultModelNs: 'agent-default-model' })

export const FIXTURE = Object.freeze({
  instanceId: 'fbtest-host-instance',
  runtimeId: 'fbtest-host-runtime',
  generation: 'fbtest-host-generation',
  otherGeneration: 'fbtest-host-generation-2',
  port: 49321,
  secret: 'fbtest-host-lifecycle-secret',
  otherSecret: 'fbtest-host-lifecycle-secret-2',
  planted: 'dsht_FBTEST-HOST-PLANTED-',
  label: 'Fishball (hosted)',
  entryPrefix: 'fbtest-entry-',
  hostOrigin: 'http://127.0.0.1:47000',
  remote: 'https://remote.example/api/agent/mcp',
  blank: '',
  spaces: '   ',
  launchToken: 'FBTEST-LAUNCH-TOKEN',
  cookie: 'dsh_session=fbtest-cookie; HttpOnly; SameSite=Strict; Path=/',
  t0: 1_800_000_000_000,
  tempPrefix: 'dshi-test-host-',
  /** The client's own request bound in these worlds (an input of the contract, not a test wait). */
  timeoutMs: 5000,
  detail: 'fbtest detail',
  bundle: 'fishball-ui',
})
