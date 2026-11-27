/**
 * Vocabulary of the readiness and first-install sync cases. Values come from the README ("Ready",
 * "Model sync", "The child": the child web listens on 127.0.0.1 with an OS port) and the JSDoc of
 * loopbackOrigin / childReadiness / readyHealth / createInitialSync, never from their bodies.
 */
import { ROW_CONFIG } from '../support/constants.mjs'

/** The host row the first-install sync case applies (host.js; its fake context's answers). */
export const ROW = Object.freeze({
  ...ROW_CONFIG,
  childOrigin: 'http://127.0.0.1:43129',
  webOrigin: 'http://127.0.0.1:43000',
  ticket: 'ticket',
})

export const READY = Object.freeze({
  origin: 'http://127.0.0.1:43129',
  unsafe: 'UNSAFE_CHILD_ORIGIN',
  missing: 'MISSING_CAPABILITY',
  notReady: 'NOT_READY',
  /** Every value loopbackOrigin must refuse (JSDoc: `http://127.0.0.1:<port>` exactly, root slash allowed). */
  invalidOrigins: Object.freeze([
    ['https', 'https://127.0.0.1:43129'], ['remote', 'http://example.org:43129'],
    ['localhost', 'http://localhost:43129'], ['ipv6', 'http://[::1]:43129'],
    ['no-port', 'http://127.0.0.1'], ['path', 'http://127.0.0.1:43129/admit'],
    ['username', 'http://user@127.0.0.1:43129'], ['password', 'http://user:pass@127.0.0.1:43129'],
    ['query', 'http://127.0.0.1:43129/?a=1'], ['fragment', 'http://127.0.0.1:43129/#a'],
    ['number', 43129], ['object', {}], ['null', null], ['empty', ''],
    ['port-above-range', 'http://127.0.0.1:65536'],
  ]),
  /** BVA: the port's ends and the root slash. */
  validOrigins: Object.freeze(['http://127.0.0.1:1', 'http://127.0.0.1:65535', 'http://127.0.0.1:43129/']),
  /** Core services readiness must never read (README: generic DSH signals only). */
  coreServices: Object.freeze(['fishballStatus', 'fishballInstance']),
  /** I-READY removed these payload channels (wire.js JSDoc); 'unknown' stands for any other. */
  removedChannels: Object.freeze(['control', 'admin', 'instance-settings', 'unknown']),
  /** The retained payload channels and the transport each one publishes. */
  retainedChannels: Object.freeze([['provider-sync', 'providerSyncTransport'], ['mcp-credential', 'credentialTransport']]),
  sentinel: 'sentinel',
})

/** Files and texts I-READY removed from the package (README: no dsh-connector peer, no V2 readiness). */
export const REMOVED = Object.freeze({
  connectorPeer: 'dsh-agent-connector',
  nativeWeb: 'native-web.js',
  files: Object.freeze(['src/slim', 'src/settings-migration.js', 'src/child/admin.js', 'native-web.js', 'src/native-web.js']),
  sourceText: Object.freeze(['fishballApp', '/api/health', 'authenticated-app']),
  connectorImport: /(?:from\s*|import\s*\(|require\s*\()\s*['"](?:dsh-agent-connector|dsh-connector)(?:\/[^'"]*)?['"]/,
  hostText: Object.freeze(['storageDomain', 'settings-migration', '/api/fishball/native/status', '/api/fishball/native/admin/']),
  /** Folders that are not production code. */
  skipDirs: Object.freeze(['tests', 'test', 'node_modules', 'bundled', '.git']),
})

/** The first-install model sync (README "Model sync"; initial-sync.js JSDoc). */
export const INITSYNC = Object.freeze({
  file: 'initial-model-sync.json',
  prefix: 'dshi-initsync-',
  checkId: 'check-sentinel',
  codes: Object.freeze({ failed: 'child-sync-failed', outcomeFailed: 'failed' }),
  refused: 'CHECK_REFUSED', addRefused: 'ADD_REFUSED', thrown: 'SYNC_THROWN',
  /** Provider names, keys and engine reasons: never logged. */
  privateText: 'PRIVATE-provider-name-key-error-message',
  providers: Object.freeze([
    { id: 'provider-b', name: 'PRIVATE-provider-name-key-error-message', models: ['model-b'] },
    { id: 'provider-a', name: 'PRIVATE-provider-name-key-error-message', models: ['model-a', 'model-c'] },
    { id: 'provider-c', name: 'PRIVATE-provider-name-key-error-message', models: [] },
  ]),
  outcomes: Object.freeze(['added', 'skipped', 'failed']),
  /** BVA over the missing providers: none, one, many. */
  counts: Object.freeze([0, 1, 3]),
})
