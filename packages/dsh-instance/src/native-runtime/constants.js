export const RUNTIME = Object.freeze({
  format: 1,
  protocol: 'fishball-lifecycle/1',
  packageName: '@deepseek-ai/dsh',
  profileName: 'fishball',
  profile: Object.freeze({
    bundles: Object.freeze(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']),
    manifest: 'package.json',
    // Preserve exact old bytes before restoring native composition; never overwrite a backup.
    manifestBackupInfix: '.pre-native-web-',
    manifestBackupSeparator: '-',
  }),
  codeSnapshotPrefix: '.fishball-native-',
  // The snapshot holds only the instance's own lifecycle code (Q-5): the lifecycle row, the
  // child-side row and the parent-watch preload the launch imports by path (index.js), each with
  // the relative-import closure of its module. The plugin set is placed bundles (PLACEMENT), never
  // snapshot code. `src/lib/provider-sync-host.js` is an entry of its own because the child-side
  // row imports it lazily (src/child/provider-sync-target.js), and the closure reads static imports
  // only (PLACEMENT.specifiers); it moved here from dsh-connector-shared (R-ARCH-08 strict: the
  // instance is its only user), where it was placed as a library.
  snapshot: Object.freeze({ lifecycle: 'native-child.js', childRow: 'child-row.js', entries: Object.freeze(['src/native-runtime/parent-watch.js', 'src/lib/provider-sync-host.js']) }),
  host: '127.0.0.1',
  socketName: 'control.sock',
  socketPathBytes: 100,
  privateDirectoryMode: 0o700,
  privateFileMode: 0o600,
  secretBytes: 32,
  marker: 'owner.json',
  // Uninstall renames the runtime root to `runtime.removing-<uuid>` beside it before deleting it
  // (files.js removeRuntime), so the runtime path is never left half-deleted.
  retiredRootInfix: '.removing-',
  secret: 'control.secret',
  active: 'active.json',
  pid: 'pid.json',
  endpoint: 'endpoint.json',
  log: 'lifecycle.log',
  // The only shape a log line's `reason` may have: an error code identifier (files.js lifecycleLog).
  logReason: /^[A-Z][A-Z0-9_]{0,63}$/,
  // A start failure that carried no code of its own (index.js startInternal).
  startFailedCode: 'START_FAILED',
  // The child's stderr (B6), bounded by RUNTIME_LIMITS.maxLogBytes; the previous file is kept
  // once under the rotated suffix, so at most two caps of disk are used.
  stderrLog: 'child-stderr.log',
  rotatedLogSuffix: '.1',
  /**
   * The lifecycle wire's operations (child.js answers them, index.js asks): `health`; `attach`, the
   * host's one connection, which publishes the provider-sync and mcp-credential transports; `stop`.
   */
  operation: Object.freeze({ health: 'health', attach: 'attach', stop: 'stop' }),
  /**
   * I-READY: readiness is generic DSH signals only (F-WIRE, 2026-11-16: core offers the instance no
   * readiness signal, R-ARCH-10, R-FB-10 as amended by 1.39 and K3 child.d.ts: "the instance
   * reports only generic child states"). A child is `ready` when these base services are mounted,
   * its `appReady` has fired, and its web server listens with the child-side row's admission route
   * registered (child-row.js publishWeb). No core service is read and no HTTP probe is made.
   */
  requiredServices: Object.freeze(['agents', 'sessions', 'tools', 'profileContext', 'appExit', 'appReady']),
  /**
   * What a ready child reports beside the services: the admission route is up (the frame can be
   * admitted, design §4.1) and the lifecycle wire speaks this protocol.
   */
  capabilities: Object.freeze({ admission: 'ticket-admission-v1', lifecycle: 'lifecycle-v1' }),
  /** The health answer's states, the child's own words (index.js reads `ready` only). */
  healthState: Object.freeze({ ready: 'ready', starting: 'starting' }),
  // A ready child reporting any of these can never recover by polling again.
  fatalStartupCodes: Object.freeze(['CHILD_IDENTITY_MISMATCH', 'MISSING_CAPABILITY', 'UNSAFE_CHILD_ORIGIN']),
})

/** What a ready child's health answer lists (child.js); the host requires every one (index.js readyHealth). */
export const READY_CAPABILITIES = Object.freeze([...RUNTIME.requiredServices, RUNTIME.capabilities.admission, RUNTIME.capabilities.lifecycle])

/**
 * How the child is launched (D28, design §0.5 "Child launch": "主DSH怎么启动，fishball就怎么
 * 启动"): with the main process's own `process.execPath` and `process.execArgv`, and these runtime
 * variables of its environment. There is no `node` lookup, no version probe and no launch setting:
 * the executable is the one already running DSH. Under DSH-X (Electron 44 run as Node) execArgv
 * carries `--use-system-ca`, `--max-http-header-size` and DSH-X's two `--import` hooks, and
 * NODE_OPTIONS its worker-thread `--require` hook (DSH.app core/server.js dshArgs, dshEnv).
 */
export const HOST_LAUNCH = Object.freeze({
  // Copied from the main process only when set; nothing else of its environment reaches the
  // child (no key, token or DSH_X_* variable, D6). DSH-X's NODE_OPTIONS also names its
  // instance-link hook, which stays inert because the child never gets DSH_X_INSTANCE_LINK.
  // ELECTRON_RUN_AS_NODE is deliberately not listed (B5, §0.5, §18.2 I2 R3): a plain-Node main
  // that happens to carry it must not pass it on; only electronAsNode below sets it.
  runtimeEnv: Object.freeze(['NODE_OPTIONS']),
  // An Electron main process (process.versions.electron) has an Electron binary as execPath. With
  // this variable it runs as a windowless Node process; without it, it would open a second app
  // window. So it is always set for an Electron host, never refused, and set for no other host.
  electronAsNode: Object.freeze({ name: 'ELECTRON_RUN_AS_NODE', value: '1' }),
  // Debugger flags are dropped from execArgv: a port the main DSH already holds would stop the
  // child from starting. Prefixes: `--inspect` also covers --inspect-brk, --inspect-wait,
  // --inspect-port and --inspect-publish-uid. No other flag is touched.
  debugFlagPrefixes: Object.freeze(['--inspect', '--debug-port']),
  // The debugger flags whose value Node keeps as the next execArgv item when written without `=`
  // (`--inspect-port 0` is two items); that value is dropped with its flag.
  debugFlagsWithValue: Object.freeze(['--inspect-port', '--debug-port', '--inspect-publish-uid']),
})

// rc.3 grants the entire host tree 5000 ms; native cleanup must finish sooner.
export const LIFETIME = Object.freeze({
  parentFd: 3, shutdownTimeoutMs: 4000, forceAfterMs: 2500,
  childExitTimeoutMs: 3000, successExitCode: 0, failureExitCode: 1,
  gracefulSignal: 'SIGTERM', forceSignal: 'SIGKILL',
  registryKey: 'dsh-fishball.native-lifecycle.v1',
})

/**
 * The uninstall cleanup command, `uninstall.js` (design §0.10, Q3). Neither DSH 0.2.1-rc.5 nor
 * 0.2.2-rc.1 runs plugin code on removal: the Plugins page disposes the row as a disable does, then
 * runs `pnpm remove` (no lifecycle script), and `dsh plugin remove` only runs pnpm. So the user
 * runs this command with DSH quit and before removing the package.
 */
export const UNINSTALL = Object.freeze({
  homeFlag: '--home',
  // DSH's own home rule (dsh-home-paths `resolveDshHome`, identical in 0.2.1-rc.5 and 0.2.2-rc.1):
  // a given path, else a non-blank $DSH_HOME, else ~/.dsh, with a leading `~` expanded. It is
  // repeated because the command runs under plain Node from the profile, where DSH's packages do
  // not resolve (DSH profiles install no peers: autoInstallPeers false).
  homeEnv: 'DSH_HOME',
  defaultHomeDirectory: '.dsh',
  tilde: '~',
  tildePrefixes: Object.freeze(['~/', '~\\']),
  // The recorded child is alive or its state is unknown: DSH has not been quit yet.
  childRunning: 'CHILD_RUNNING',
  // Not LIFETIME's codes: those are the child process's own exit; these are the command's.
  exitCode: Object.freeze({ done: 0, refused: 1, usage: 2 }),
  message: Object.freeze({
    usage: 'Usage: node uninstall.js [--home <DSH_HOME>]\nQuit DSH first, then run this before removing dsh-instance.\n',
    removed: 'Removed the Fishball instance data: {path}\n',
    absent: 'Nothing to remove: {path} does not exist.\n',
    // The codes are listed in the README ("Uninstall"); the most common is CHILD_RUNNING.
    refused: 'Nothing was removed from {path} ({code}). Quit DSH, wait a few seconds and run it again.\n',
  }),
})

/**
 * Placement of the plugin set into the child profile (R-BND-01/02/03, R-HOST-01, design §8.1;
 * bundled-placement note `f71717e` P3 + 3a). The set's source is chosen at every child start:
 * - a packed instance (REL-PACK: `bundled/<name>-<version>.tgz` for every set member, at this
 *   instance's own version) installs the set with DSH's own plugin manager, by exact npm spec first
 *   and offline from those tarballs when the registry fails, and only when the profile lacks that
 *   exact version (the user's answers to REL-PACK Q2-Q4, 2026-11-17; placement.js installPackedSet);
 * - a checkout copies each member, at every start and before the profile loads, to
 *   `<profile>/vendor/<name>` and `<profile>/node_modules/<name>` with
 *   `dependencies[name] = file:./vendor/<name>`, so DSH resolves it as a profile package and a later
 *   pnpm operation in the child keeps it (I-PLACE probe, both SDKs).
 * The libraries (`shared`) are copied in both cases. The host never resolves or loads the set: its
 * sources are data inside dsh-instance's own folder (R-BND-01).
 */
export const PLACEMENT = Object.freeze({
  /**
   * The bundles, in the order they are appended to `dsh.profile.bundles` after every other bundle:
   * fishball-core last, so its guard patch reaches every row the others insert (R-FB-12).
   * `directory` names a set member's sibling workspace folder `../<directory>` in a checkout; a
   * packed instance ships it as `bundled/<tarball(name, version)>` instead (REL-PACK output, never
   * committed; Q-22). The set is core, fishball-ui and board (requirements 1.39 R-BND-01: "the
   * default set is `fishball-core`, `fishball-ui` and `fishball-board`").
   */
  bundles: Object.freeze([
    Object.freeze({ name: 'fishball-board', directory: 'board' }),
    // fishball-ui before core (I-HOST, the user's answer Q2 = A): its guard rows target DSH's base
    // rows, which precede every plugin bundle, so they hold in any order, while core's own guard
    // check reports `bundle-order` unless core is last.
    Object.freeze({ name: 'fishball-ui', directory: 'fishball-ui' }),
    Object.freeze({ name: 'fishball-core', directory: 'core' }),
  ]),
  /**
   * The library placed beside the bundles, never listed as a bundle (R-ARCH-08, one per side,
   * requirements 1.40): dsh-connector-shared, the instance's bundled dependency that its placed
   * lifecycle code and child-side row import, resolved through the instance's own dependency graph.
   * A placed bundle's own libraries (its `bundleDependencies`, as core's fishball-shared) are
   * resolved from the bundle's folder instead (placement.js bundledLibraries). The connector's V2
   * `./contract` export is no longer placed (I-READY: V2 was never deployed, and no instance code
   * imports it, R-ARCH-10).
   */
  shared: 'dsh-connector-shared',
  bundledField: 'bundleDependencies',
  // Node's code for a package that a resolver cannot find (createRequire().resolve).
  unresolved: 'MODULE_NOT_FOUND',
  // A packed instance's folder of set tarballs; its presence selects the install path.
  packed: 'bundled',
  // npm pack's file name for an unscoped package, as REL-PACK writes the set into `bundled/`.
  tarball: (name, version) => name + '-' + version + '.tgz',
  /**
   * The packed set's install (REL-PACK item 5). `order` is the order the user gave for the add
   * (fishball-ui, then fishball-board, then fishball-core last); the bundle order above is separate.
   * DSH's own plugin-manager operation runs pnpm in the child profile under the profile lock, with
   * the plugin manager's default limits (PluginManager.Config) and the installation's own pnpm
   * (profileContext.packageManager, when DSH supplies one). `activateNewBundles: false` because DSH
   * would append new bundles in dependency-name order, putting core before fishball-ui;
   * placeBundles writes the order itself. `noRetries` turns pnpm's fetch retries off through the
   * run's environment: pnpm retries an unreachable registry for about 70 s per request (measured,
   * pnpm 10.33), and the plugin manager first runs one `pnpm view` per spec, which ignores a
   * `--config.fetch-retries` flag; three specs then took 211 s, past the 60 s start bound, so the
   * tarball fallback would never run. With it a dead registry fails in about a second. The
   * environment reaches both the lookups and the add (operations.js runProfilePnpm `options.env`).
   */
  install: Object.freeze({
    order: Object.freeze(['fishball-ui', 'fishball-board', 'fishball-core']),
    operations: '@deepseek-ai/dsh-plugin-manager/operations',
    manager: '@deepseek-ai/dsh-plugin-manager',
    command: 'add',
    execution: 'service',
    spec: (name, version) => name + '@' + version,
    noRetries: Object.freeze({ npm_config_fetch_retries: '0' }),
    offline: '--offline',
    succeeded: 0,
  }),
  parent: '..',
  vendor: 'vendor',
  modules: 'node_modules',
  manifest: 'package.json',
  dependency: (name) => 'file:./vendor/' + name,
  // The record of the names placed so far (3a): a name is switched on only at its first placement.
  // It lives in the child profile, so a profile deleted by hand starts over with the set on.
  record: 'fishball-placement.json',
  recordFormat: 1,
  temporaryInfix: '.placing-',
  retiredInfix: '.previous-',
  // A `files` entry may hold `*` within its last path segment only (as the libraries' `*.js`).
  wildcard: '*',
  wildcardPattern: '[^/]*',
  regexSpecial: /[.+?^${}()|[\]\\]/g,
  regexEscape: '\\$&',
  script: '.js',
  // Relative static imports (`import … from './x.js'`, `export … from`, bare `import './x.js'`) whose
  // targets are copied with a module: a placed or snapshot module must find every relative import.
  // One statement per line is read (`^`, as the source style has it); a second import on the same
  // line, or a relative dynamic `import()`, would be missed, and the copied row would then fail to
  // load in the child, loudly. The one relative dynamic import a copied module has
  // (src/child/provider-sync-target.js → src/lib/provider-sync-host.js) is a snapshot entry itself.
  specifiers: /^\s*(?:(?:import|export)\s[^'";]*?\sfrom\s*|import\s*)['"](\.{1,2}\/[^'"]+)['"]/gm,
  code: Object.freeze({ missing: 'PLACEMENT_SOURCE_UNAVAILABLE', unsafe: 'UNSAFE_PLACEMENT_SOURCE', unsafeDirectory: 'UNSAFE_DIRECTORY', record: 'INVALID_PLACEMENT_RECORD', incompatible: 'PROFILE_INCOMPATIBLE', installFailed: 'PLACEMENT_INSTALL_FAILED' }),
  /** The NativeRuntimeError field naming the first skipped bundle of an `incompatible` refusal (K3 `ChildStatus.plugin`). */
  pluginField: 'plugin',
  // installPackedSet's refusal detail: the missing tarball, or the plugin manager's diagnostic log of the failed offline add.
  installFailed: (where) => 'The Fishball plugins could not be installed from the registry or from ' + where,
  // R-BND-03: an enabled bundle that DSH skips blocks the start; the status names it and DSH's
  // reason. One line, because the host's launch detail keeps only the first line (launch-detail.js).
  incompatible: (skipped) => 'Enabled bundles cannot load: ' + skipped.map(({ packageName, reason }) => packageName + ' (' + String(reason).replace(/\s+/g, ' ').trim() + ')').join('; '),
})

/**
 * The instance's refusal words, each defined once (I-HOST); the vocabularies below name them.
 * - `notReady`, `hostnameRefused`: K3 `AdmitErrorCode` (child.d.ts), also Reconnect's and Open's;
 * - `connectorMissing`, `targetRemote`, `unwritable`: Reconnect's (K3 `ReconnectRefusalCode`);
 * - `failed`: K3's shared `operation-failed` (a service threw; nothing is echoed);
 * - `invalid`: a request outside its closed shape.
 */
export const REFUSAL = Object.freeze({
  notReady: 'not-ready',
  hostnameRefused: 'hostname-refused',
  connectorMissing: 'connector-missing',
  targetRemote: 'target-remote',
  unwritable: 'credentials-unwritable',
  failed: 'operation-failed',
  invalid: 'invalid-request',
})

/**
 * The hosted token's set-up (I-HOST; design §5.4; requirements 1.28 R1, 1.39, 1.41 Q-G6; K3a
 * `HOSTED_IMPORT` names, of which this is the instance's own copy: the two sides share no code,
 * and `test/v3/contract/k3a-core-seams` checks both copies are equal).
 * - `credentialRef`: the child credential reference the import writes (`DSH_AGENT_TOKEN`, the
 *   user's `dsh-agent-token` in DSH's reference grammar);
 * - `savedRecord`: the record core saves an accepted hosted token into; with the reference it
 *   answers "the child holds a credential", by DSH's own `credentials` service alone;
 * - `childRow`: the child-side row's id, which is also the settings namespace of `targetUrl`;
 * - `channel`: the lifecycle wire's payload channel for the probe and the one import;
 * - `op`: its two requests; `code`: the client's rejection and the record's refusal;
 * - `credentialLockWaitMs`: the import's extra bound: the child's `credentials.set` writes under
 *   DSH's credential document lock, so the import waits that long plus the lifecycle request
 *   bound (host.js); the probe keeps the lifecycle request bound;
 * - `record`: the host's non-secret list of the hosted entry keys it created, newest last, with
 *   the instance's stable id (host/hosted-record.js);
 * - `notice`: the instance's one notice, after Retry found the hosted entry deleted (R6 = B);
 * - `reconnect`: its refusals (K3 `ReconnectRefusalCode`).
 */
export const HOSTED = Object.freeze({
  credentialRef: 'DSH_AGENT_TOKEN',
  savedRecord: 'fishball-core/hosted-agent',
  childRow: 'dsh-instance-child',
  targetField: 'targetUrl',
  channel: 'mcp-credential',
  op: Object.freeze({ probe: 'probe', import: 'import' }),
  code: Object.freeze({
    unavailable: 'CREDENTIAL_CHANNEL_UNAVAILABLE',
    record: 'INVALID_HOSTED_RECORD',
  }),
  /** DSH's credential document lock wait (dsh-credentials-local DOCUMENT_LOCK_WAIT_MS, 0.2.1-rc.5 and 0.2.2-rc.1). */
  credentialLockWaitMs: 30000,
  record: Object.freeze({ file: 'hosted.json', format: 1 }),
  notice: Object.freeze({ entryDeleted: 'hosted-entry-deleted' }),
  /** Logged (code only, never a value) when the record could not keep a key the child stored. */
  recordWriteFailed: 'hosted record not written (%s); the child holds the token',
  /** The host's own connector endpoint the child links to (K1 `PATHS.mcp`, restated: the instance does not import the connector). */
  mcpPath: '/api/agent/mcp',
  tokensService: 'dshConnectorTokens',
  apiVersion: 1,
  entryState: Object.freeze({ enabled: 'enabled', disabled: 'disabled', deleted: 'deleted' }),
  /**
   * K3 `TargetStatus` answers (K1 `TARGET_STATE` / `TARGET_CODE` words, restated because the
   * instance imports no connector module; the K3 suite checks them): see hosted.js targetStatus.
   */
  target: Object.freeze({
    connected: Object.freeze({ state: 'connected', code: null }),
    remote: Object.freeze({ state: 'target-unreachable', code: 'TARGET_UNREACHABLE' }),
    unset: Object.freeze({ state: 'target-unset', code: null }),
    revoked: Object.freeze({ state: 'token-refused', code: 'token-revoked' }),
  }),
})

/**
 * The one automatic model-list sync of a newly created child (the user, 2026-11-16: "instance初次安装
 * 时同步一次"; src/host/initial-sync.js). `file` is its done-marker in the runtime folder
 * (`<home>/fishball/runtime`), so an uninstall, which removes that folder, lets a reinstalled child
 * sync once more. The marker is written only after a completed check and, when something was
 * missing, a completed add; a failed attempt is logged by code and tried again at the next start.
 * Both rules were decided by Fishball under the user's rule.
 */
export const INITIAL_SYNC = Object.freeze({
  file: 'initial-model-sync.json',
  format: 1,
  failedLog: 'initial model sync failed (%s)',
  itemFailedLog: 'initial model sync: some providers were not added (%s)',
})

/**
 * The frame's single-use admission ticket (design §4.1; spike V3-S4 `b9809b7` F1). An HMAC over
 * `{gen, aud, view, lang, exp, nonce}` with a key both ends derive from the lifecycle secret they
 * already hold (`control.secret`), so no key travels in a launch overlay. Valid while
 * `now < exp`. Redeemed once by the child-side row at `path`, which mints the child's own login
 * cookie through DSH's public `connection.authorizeIndex` and answers 303 to the page.
 */
export const TICKET = Object.freeze({
  ttlMs: 30000,
  param: 'ticket',
  path: '/api/dsh-instance/admit',
  keyLabel: 'dsh-instance admission v1',
  algorithm: 'sha256',
  nonceBytes: 16,
  encoding: 'base64url',
  separator: '.',
  /** The page the redeemed ticket opens, with the view and language as a fragment (fishball-page reads `view` and `lang`). */
  landing: '/',
  fragment: Object.freeze({ view: 'view', lang: 'lang' }),
})

/** The child's lifecycle states (K3 `ChildState`, V2 STATUS), the host row's and the locator's one vocabulary. */
export const CHILD_STATE = Object.freeze({ disabled: 'disabled', waiting: 'waiting', starting: 'starting', ready: 'ready', stopping: 'stopping', stopped: 'stopped', failed: 'failed' })
/**
 * The host row's status codes (K3 `LifecycleCode`, as I-HOST amended it: no `fishball-off`).
 * Since I-HOST removed the V2 connector binding (user decision 2026-11-16: "现在第二版根本没有实际部署的
 * 情况，把它当作一次发布前的设计变更，第三版其实就是第一版"), these are the instance's own words and no
 * V2 binding code remains.
 */
export const LIFECYCLE_CODE = Object.freeze({
  failed: 'NATIVE_START_FAILED', stop: 'NATIVE_STOP_FAILED', exited: 'NATIVE_CHILD_EXITED', unavailable: 'NATIVE_UNAVAILABLE',
  timeout: 'NATIVE_TIMEOUT', disabled: 'NATIVE_DISABLED', invalidMainHome: 'INVALID_MAIN_HOME', incompatible: 'PROFILE_INCOMPATIBLE',
})
/** Every state and code the instance itself reports (its settings page, src/host/routes.js publicStatus). */
export const INSTANCE_STATES = Object.freeze(Object.values(CHILD_STATE))
export const INSTANCE_CODES = Object.freeze(Object.values(LIFECYCLE_CODE))
/** The locator's K3 `apiVersion`. */
export const LOCATOR = Object.freeze({ service: 'dshInstanceChild', apiVersion: 1 })

/**
 * The locator's hostnames (K3 `LoopbackHostname`). The child's web server listens on
 * `RUNTIME.host`, so it serves `127.0.0.1` and `localhost`; `[::1]` is refused `not-ready` (the
 * user's answer Q5 = A: no second listener is designed).
 */
export const LOOPBACK = Object.freeze({
  served: Object.freeze(['127.0.0.1', 'localhost']),
  all: Object.freeze(['127.0.0.1', 'localhost', '[::1]']),
  views: Object.freeze(['chat', 'settings']),
  /** The view the instance page's Open Fishball admits: the child's Fishball page (Q-G3; the user's answer Q7 = A). */
  openView: 'chat',
  langs: Object.freeze(['zh', 'en']),
})

/** The child web origin's fixed parts (loopbackOrigin); the host is RUNTIME.host. */
const CHILD_ORIGIN = Object.freeze({ protocol: 'http:', root: '/', queryMark: '?', fragmentMark: '#' })
/**
 * The child web's own origin (I-READY): `http://127.0.0.1:<port>` exactly, as the child's
 * `webServer.getOrigin()` answers it for the launch's `--host 127.0.0.1 --port 0` (with or without
 * its root slash). The locator rewrites only its hostname (locator.js), so anything else would
 * send a frame somewhere the child does not listen.
 * @returns {string} the origin, without a trailing slash
 * @throws {NativeRuntimeError} `UNSAFE_CHILD_ORIGIN` for any other value
 */
export function loopbackOrigin(value) {
  let url
  try { url = new URL(value) } catch { fail('UNSAFE_CHILD_ORIGIN') }
  if (typeof value !== 'string' || url.protocol !== CHILD_ORIGIN.protocol || url.hostname !== RUNTIME.host || !url.port || url.username || url.password || url.pathname !== CHILD_ORIGIN.root || url.search || url.hash || value.includes(CHILD_ORIGIN.queryMark) || value.includes(CHILD_ORIGIN.fragmentMark)) fail('UNSAFE_CHILD_ORIGIN')
  return url.origin
}
export const RUNTIME_LIMITS = Object.freeze({
  startupTimeoutMs: 60000,
  stopTimeoutMs: 15000,
  requestTimeoutMs: 5000,
  pollIntervalMs: 100,
  maxFrameBytes: 1024 * 1024,
  maxPendingRequests: 64,
  maxLogBytes: 64 * 1024,
  maxMetadataBytes: 64 * 1024,
  maxConnections: 4,
})

export class NativeRuntimeError extends Error {
  constructor(code, message = code) { super(message); this.name = 'NativeRuntimeError'; this.code = code }
}
export const fail = (code, message) => { throw new NativeRuntimeError(code, message) }
export function runtimeLimits(overrides = {}) {
  const limits = { ...RUNTIME_LIMITS, ...overrides }
  for (const [name, value] of Object.entries(limits)) {
    if (!(name in RUNTIME_LIMITS) || !Number.isSafeInteger(value) || value <= 0) fail('INVALID_LIMIT', 'Invalid lifecycle limit.')
  }
  return Object.freeze(limits)
}
