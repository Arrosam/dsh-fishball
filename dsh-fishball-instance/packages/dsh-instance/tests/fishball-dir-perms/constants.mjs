/**
 * Vocabulary and fixture constants for the fishball directory permission tightening
 * and hosted-record-unreadable status notice suites. Derived strictly from requirements.
 */
import path from 'node:path'

export const TASK = 'FISHBALL-DIR-PERMS'

export const MODULES = Object.freeze({
  files: path.join('src', 'native-runtime', 'files.js'),
  constants: path.join('src', 'native-runtime', 'constants.js'),
  hostedRecord: path.join('src', 'host', 'hosted-record.js'),
  routes: path.join('src', 'host', 'routes.js'),
  syncRoutes: path.join('src', 'host', 'provider-sync-routes.js'),
  clientEntry: 'client.js',
})

export const EXPORTS = Object.freeze({
  files: Object.freeze(['ensureFishballDirectory', 'prepareLayout', 'privateDirectory']),
  constants: Object.freeze(['HOSTED', 'RUNTIME_LIMITS']),
  hostedRecord: Object.freeze(['openHostedRecord']),
  routes: Object.freeze(['registerInstanceRoutes']),
  syncRoutes: Object.freeze(['registerProviderSyncRoutes']),
})

export const CODES = Object.freeze({
  invalidMainHome: 'INVALID_MAIN_HOME',
  unsafeDirectory: 'UNSAFE_DIRECTORY',
  invalidHostedRecord: 'INVALID_HOSTED_RECORD',
  unsafeMetadata: 'UNSAFE_METADATA',
  nativeChildExited: 'NATIVE_CHILD_EXITED',
})

export const NOTICE = Object.freeze({
  recordUnreadable: 'hosted-record-unreadable',
  entryDeleted: 'hosted-entry-deleted',
})

export const LOCALE_KEYS = Object.freeze({
  recordUnreadable: 'notice.hosted-record-unreadable',
  entryDeleted: 'notice.hosted-entry-deleted',
})

export const FILES = Object.freeze({
  fishballDir: 'fishball',
  hostedRecord: 'hosted.json',
  sentinelFile: 'keep.txt',
  sentinelBody: 'fbtest-sentinel',
})

export const MODES = Object.freeze({
  mask: 0o777,
  privateDir: 0o700,
  privateFile: 0o600,
  defaultDir: 0o755,
  ownerReadExecOnly: 0o500,
  /** Modes with (mode & 0o022) === 0: ensureFishballDirectory tightens via (mode & 0o700). */
  tightenable: Object.freeze([
    Object.freeze({ label: '0o755 (group+other rx)', initial: 0o755, expected: 0o700 }),
    Object.freeze({ label: '0o750 (group rx only)', initial: 0o750, expected: 0o700 }),
    Object.freeze({ label: '0o705 (other rx only)', initial: 0o705, expected: 0o700 }),
    Object.freeze({ label: '0o711 (group+other x only)', initial: 0o711, expected: 0o700 }),
    Object.freeze({ label: '0o744 (group+other r only)', initial: 0o744, expected: 0o700 }),
    Object.freeze({ label: '0o740 (group r only)', initial: 0o740, expected: 0o700 }),
    Object.freeze({ label: '0o704 (other r only)', initial: 0o704, expected: 0o700 }),
    Object.freeze({ label: '0o710 (group x only)', initial: 0o710, expected: 0o700 }),
    Object.freeze({ label: '0o701 (other x only)', initial: 0o701, expected: 0o700 }),
    Object.freeze({ label: '0o555 (no owner write -> 0o500 without escalating owner w)', initial: 0o555, expected: 0o500 }),
    Object.freeze({ label: '0o500 (owner rx already private -> stays 0o500)', initial: 0o500, expected: 0o500 }),
  ]),
  /** Owner-writable tightenable modes that prepareLayout must tighten to 0o700. */
  prepareLayoutTightenable: Object.freeze([
    Object.freeze({ label: '0o755', initial: 0o755, expected: 0o700 }),
    Object.freeze({ label: '0o750', initial: 0o750, expected: 0o700 }),
    Object.freeze({ label: '0o711', initial: 0o711, expected: 0o700 }),
    Object.freeze({ label: '0o744', initial: 0o744, expected: 0o700 }),
    Object.freeze({ label: '0o705', initial: 0o705, expected: 0o700 }),
  ]),
  /** Boundary & partition modes with (mode & 0o022) !== 0: refused with UNSAFE_DIRECTORY, untouched. */
  refusedWritable: Object.freeze([
    Object.freeze({ label: '0o720 (boundary: group-write bit only)', mode: 0o720 }),
    Object.freeze({ label: '0o702 (boundary: other-write bit only)', mode: 0o702 }),
    Object.freeze({ label: '0o722 (group-write + other-write only)', mode: 0o722 }),
    Object.freeze({ label: '0o770 (group rwx)', mode: 0o770 }),
    Object.freeze({ label: '0o707 (other rwx)', mode: 0o707 }),
    Object.freeze({ label: '0o775 (group-writable + other rx)', mode: 0o775 }),
    Object.freeze({ label: '0o757 (other-writable + group rx)', mode: 0o757 }),
    Object.freeze({ label: '0o777 (world-writable)', mode: 0o777 }),
    Object.freeze({ label: '0o520 (no owner write + group-write)', mode: 0o520 }),
  ]),
  /** Modes that privateDirectory(dir) must still strictly refuse with UNSAFE_DIRECTORY. */
  privateDirectoryRefused: Object.freeze([
    Object.freeze({ label: '0o755', mode: 0o755 }),
    Object.freeze({ label: '0o750', mode: 0o750 }),
    Object.freeze({ label: '0o711', mode: 0o711 }),
    Object.freeze({ label: '0o720', mode: 0o720 }),
    Object.freeze({ label: '0o702', mode: 0o702 }),
    Object.freeze({ label: '0o775', mode: 0o775 }),
    Object.freeze({ label: '0o777', mode: 0o777 }),
  ]),
  /** Non-private modes for hosted.json that trigger UNSAFE_METADATA. */
  unsafeRecordFiles: Object.freeze([
    Object.freeze({ label: '0o644', mode: 0o644 }),
    Object.freeze({ label: '0o640', mode: 0o640 }),
    Object.freeze({ label: '0o604', mode: 0o604 }),
    Object.freeze({ label: '0o660', mode: 0o660 }),
  ]),
})

export const NON_ABSOLUTE_HOMES = Object.freeze([
  Object.freeze({ label: 'empty string', value: '' }),
  Object.freeze({ label: 'current dot', value: '.' }),
  Object.freeze({ label: 'relative subpath', value: 'relative/dsh-home' }),
  Object.freeze({ label: 'single relative segment', value: 'fishball-home' }),
])

export const ROUTES = Object.freeze({
  status: '/api/dsh-instance/status',
  retry: '/api/dsh-instance/retry',
})

export const STATES = Object.freeze({
  disabled: 'disabled',
  waiting: 'waiting',
  starting: 'starting',
  ready: 'ready',
  failed: 'failed',
})

export const NON_FAILED_STATES = Object.freeze([
  STATES.waiting,
  STATES.disabled,
  STATES.ready,
])

export const UI = Object.freeze({
  rowId: 'dsh-instance',
  configSlots: Object.freeze(['plugins.bundle.config', 'plugins.row.config']),
  attrNotice: 'data-fishball-instance-notice',
  attrState: 'data-fishball-instance-state',
  langs: Object.freeze(['en', 'zh']),
  cjkPattern: /[\u4e00-\u9fff]/,
  latinPattern: /[A-Za-z]/,
})

export const HARNESS = Object.freeze({
  worldParam: 'fbdirrow',
  tempPrefix: 'fbtest-dir-perms-',
  hostOrigin: 'http://127.0.0.1:47123',
  pageBase: 'http://127.0.0.1:47123/',
  runtimeId: 'fbtest-dir-perms-runtime',
  generation: 'fbtest-dir-perms-gen',
  tokens: Object.freeze({ entryPrefix: 'dir-perms-entry-', label: 'Fishball test entry', planted: 'dsht_FBTEST-DIR-PERMS-' }),
  launchToken: 'FBTEST-DIR-PERMS-TOKEN',
  recordWarn: 'hosted record unreadable (%s)',
  validRecordJson: JSON.stringify({ format: 1, instanceId: '11111111-2222-4333-8444-555555555555', entries: [] }),
  corruptJsonPayloads: Object.freeze([
    Object.freeze({ label: 'truncated JSON syntax error', content: '{not-valid-json' }),
    Object.freeze({ label: 'empty file', content: '' }),
    Object.freeze({ label: 'wrong format version', content: JSON.stringify({ format: 99, instanceId: 'x', entries: [] }) }),
    Object.freeze({ label: 'JSON array instead of object', content: '[]' }),
  ]),
  httpOk: 200,
})
