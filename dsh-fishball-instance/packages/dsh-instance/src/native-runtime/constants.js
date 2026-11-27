/** dsh-instance's package name, which is also its row id (host.js PLUGIN.name, design §0.2, D22). */
export const INSTANCE_PACKAGE = 'dsh-instance'

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
  groupOtherMask: 0o077,
  groupOtherWriteMask: 0o022,
  secretBytes: 32,
  marker: 'owner.json',
  // Uninstall renames the runtime root to `runtime.removing-<uuid>` beside it before deleting it
  // (files.js removeRuntime), so the runtime path is never left half-deleted.
  retiredRootInfix: '.removing-',
  secret: 'control.secret',
  active: 'active.json',
  pid: 'pid.json',
  endpoint: 'endpoint.json',
  // The main process that wrote a launch record (index.js launch). A record whose child never
  // announced itself can only be retired once this process is provably gone, so an interrupted
  // launch no longer blocks every later start (files.js removeInterruptedLaunch, 2026-11-23).
  writerPid: 'writerPid',
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

/** Every refusal of `uninstall.js` starts so; what follows tells the user what to do. */
const UNINSTALL_REFUSED = 'Nothing was removed from {path} ({code}). '
const CHILD_STATE_UNKNOWN = 'CHILD_STATE_UNKNOWN'
/** Why the child's state is unknown. Each cause has its own remedy (the user's split, E-FIX-1). */
const STATE_UNKNOWN_CAUSE = Object.freeze({ noPidRecord: 'NO_PID_RECORD', probeFailed: 'PS_UNAVAILABLE' })
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
  // The recorded child is alive: DSH has not been quit yet.
  childRunning: 'CHILD_RUNNING',
  // Whether the recorded child runs cannot be checked: it has no pid record, or `/bin/ps` cannot
  // be run or answers unreadably (E-FIX-1, B8). It is refused the same way, but quitting DSH and
  // retrying cannot help, so it has its own code, and a message per cause. The cause travels as the
  // error's message, which is always one of these fixed names, never a path or a value from a file.
  childStateUnknown: CHILD_STATE_UNKNOWN,
  stateUnknownCause: STATE_UNKNOWN_CAUSE,
  // Not LIFETIME's codes: those are the child process's own exit; these are the command's.
  exitCode: Object.freeze({ done: 0, refused: 1, usage: 2 }),
  message: Object.freeze({
    usage: 'Usage: node uninstall.js [--home <DSH_HOME>]\nQuit DSH first, then run this before removing dsh-instance.\n',
    removed: 'Removed the Fishball instance data: {path}\n',
    absent: 'Nothing to remove: {path} does not exist.\n',
    // The codes are listed in the README ("Uninstall"); the most common is CHILD_RUNNING.
    refused: UNINSTALL_REFUSED + 'Quit DSH, wait a few seconds and run it again.\n',
    // The refusals with their own text, by code and then cause; any other refusal gets `refused`.
    // A missing pid record is permanent, so its remedy is the user's own deletion of the folder (the
    // user's rule for uninstall: "在说明里写清楚，用户自己删那个文件夹（推荐）").
    refusedBy: Object.freeze({
      [CHILD_STATE_UNKNOWN]: Object.freeze({
        [STATE_UNKNOWN_CAUSE.probeFailed]: UNINSTALL_REFUSED + 'Could not check whether the Fishball child still runs: /bin/ps could not be run. If /bin/ps cannot be run here (in a sandbox, say), quit DSH and run this command where it works.\n',
        [STATE_UNKNOWN_CAUSE.noPidRecord]: UNINSTALL_REFUSED + "The Fishball child's state cannot be confirmed: its launch record is missing. Stop DSH, check that no Fishball child process is left running, then delete {path} yourself.\n",
      }),
    }),
  }),
})

const CHECKOUT_PACKAGES = 'packages'
const FISHBALL_COMPONENT = 'dsh-fishball'
const FISHBALL_PACKAGES = `${FISHBALL_COMPONENT}/${CHECKOUT_PACKAGES}`
const AMENITIES_COMPONENT = 'amenities'

/**
 * Placement of the plugin set into the child profile (R-BND-01/02/03, R-HOST-01, design §8.1;
 * bundled-placement note `f71717e` P3 + 3a). The set's source is chosen at every child start:
 * - opt-in live development links the profile directly to the explicitly selected checkout;
 * - otherwise a packed instance (REL-PACK: `bundled/<name>-<version>.tgz` for every set member, at this
 *   instance's own version) installs the set with DSH's own plugin manager, by exact npm spec first
 *   and offline from those tarballs when the registry fails, and only when the profile lacks that
 *   exact version (the user's answers to REL-PACK Q2-Q4, 2026-11-17; placement.js installPackedSet);
 * - a checkout copies each member, at every start and before the profile loads, to
 *   `<profile>/vendor/<name>` and `<profile>/node_modules/<name>` with
 *   `dependencies[name] = file:./vendor/<name>`, so DSH resolves it as a profile package and a later
 *   pnpm operation in the child keeps it (I-PLACE probe, both SDKs).
 * The host never imports the set: its source packages are read as files (R-BND-01).
 */
export const PLACEMENT = Object.freeze({
  /**
   * The bundles, in the order they are appended to `dsh.profile.bundles` after every other bundle:
   * fishball-core last, so its guard patch reaches every row the others insert (R-FB-12).
   * `directory` names the legacy workspace folder; `monorepoDirectory` is relative to the monorepo
   * root. A packed instance ships the member as `bundled/<tarball(name, version)>` instead
   * (REL-PACK output, never committed; Q-22). The hosted set is `fishball-amenities` (umbrella bundling `fishball-board`,
   * `fishball-heartbeat`, `fishball-taskboard`) and `fishball-core` (which includes `fishball-ui`),
   * installed together on child setup (the user, 2026-11-23).
   */
  bundles: Object.freeze([
    Object.freeze({ name: 'fishball-amenities', directory: 'fishball-amenities', monorepoDirectory: `${AMENITIES_COMPONENT}/fishball-amenities` }),
    Object.freeze({ name: 'fishball-core', directory: 'core', monorepoDirectory: `${FISHBALL_PACKAGES}/core` }),
  ]),
  /** The set's former UI bundle, still held by children an earlier instance set up (CHILD_OWN_BUNDLES). */
  retiredBundle: 'fishball-ui',
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
   * (fishball-ui, then fishball-core last); the bundle order above is separate.
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
   * `fetchTimeout` bounds one registry request by the plugin manager's own lookup bound
   * (PluginManager.Config inspectTimeoutMs), so a network that drops packets fails like a refused
   * one instead of waiting pnpm's 60 s default; the run also takes the start's abort signal, so a
   * start that times out or is stopped cancels it and frees the profile lock. The registry run uses
   * the main DSH's scrubbed environment and so the user's own registry, proxy and mirror settings,
   * as any DSH plugin install does; the offline fallback needs none of them.
   */
  install: Object.freeze({
    order: Object.freeze(['fishball-amenities', 'fishball-core']),
    operations: '@deepseek-ai/dsh-plugin-manager/operations',
    manager: '@deepseek-ai/dsh-plugin-manager',
    command: 'add',
    execution: 'service',
    spec: (name, version) => name + '@' + version,
    noRetries: Object.freeze({ npm_config_fetch_retries: '0' }),
    fetchTimeout: 'npm_config_fetch_timeout',
    offline: '--offline',
    succeeded: 0,
  }),
  parent: '..',
  checkout: Object.freeze({
    overrideEnv: 'FISHBALL_REPO',
    packages: CHECKOUT_PACKAGES,
    fishballComponent: FISHBALL_COMPONENT,
    fishballPackages: FISHBALL_PACKAGES,
    // The instance package sits at <root>/dsh-fishball-instance/packages/dsh-instance.
    workspaceRoot: '../../..',
    libraries: Object.freeze([
      Object.freeze({ name: 'fishball-board', directory: 'fishball-board', monorepoDirectory: `${AMENITIES_COMPONENT}/board` }),
      Object.freeze({ name: 'fishball-consultant', directory: 'fishball-consultant', monorepoDirectory: `${AMENITIES_COMPONENT}/consultant` }),
      Object.freeze({ name: 'fishball-heartbeat', directory: 'fishball-heartbeat', monorepoDirectory: `${AMENITIES_COMPONENT}/heartbeat` }),
      Object.freeze({ name: 'fishball-shared', directory: 'shared', monorepoDirectory: `${FISHBALL_PACKAGES}/shared` }),
      Object.freeze({ name: 'fishball-taskboard', directory: 'fishball-taskboard', monorepoDirectory: `${AMENITIES_COMPONENT}/taskboard` }),
    ]),
  }),
  vendor: 'vendor',
  modules: 'node_modules',
  manifest: 'package.json',
  dependency: (name) => 'file:./vendor/' + name,
  live: Object.freeze({
    protocol: 'link:',
    invalid: 'INVALID_FISHBALL_LIVE_REPO',
    pathRequired: 'fishballLiveRepo must be an absolute path to a Fishball checkout.',
    unavailable: (directory) => 'fishballLiveRepo does not provide the expected checkout directory: ' + directory,
  }),
  // The record of the names placed so far (3a): a name is switched on only at its first placement.
  // It lives in the child profile, so a profile deleted by hand starts over with the set on.
  record: 'fishball-placement.json',
  recordFormat: 1,
  temporaryInfix: '.placing-',
  retiredInfix: '.previous-',
  // A `files` entry may hold `*` within its last path segment only (as the libraries' `*.js`).
  wildcard: '*',
  // A `files` entry starting with `!` excludes that path (file or folder), as npm pack does
  // (fishball-core's `!ui/tests/`, e07228ff); it is never a source the package must hold.
  negation: '!',
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
  installFailed: (detail) => 'The Fishball plugins could not be installed from the registry or from the bundled tarballs (' + detail + ')',
  // R-BND-03: an enabled bundle that DSH skips blocks the start; the status names it and DSH's
  // reason. One line, because the host's launch detail keeps only the first line (launch-detail.js).
  incompatible: (skipped) => 'Enabled bundles cannot load: ' + skipped.map(({ packageName, reason }) => packageName + ' (' + String(reason).replace(/\s+/g, ' ').trim() + ')').join('; '),
})

/**
 * The instance's refusal words, each defined once (I-HOST); the vocabularies below name them.
 * - `notReady`, `hostnameRefused`: K3 `AdmitErrorCode` (child.d.ts), also Reconnect's and Open's;
 * - `connectorMissing`, `unwritable`: Reconnect's (K3 `ReconnectRefusalCode`);
 * - `failed`: K3's shared `operation-failed` (a service threw; nothing is echoed);
 * - `invalid`: a request outside its closed shape.
 */
export const REFUSAL = Object.freeze({
  notReady: 'not-ready',
  hostnameRefused: 'hostname-refused',
  connectorMissing: 'connector-missing',
  unwritable: 'credentials-unwritable',
  failed: 'operation-failed',
  invalid: 'invalid-request',
  // Restart (the settings page's Restart button) while the instance is switched off: nothing runs to restart.
  disabled: 'instance-disabled',
})

/**
 * The bundles of the child profile the instance itself owns, which the Fishball tab neither lists
 * nor uninstalls (design §28; lead, 2026-11-20: one constant for them): the child's base bundles
 * (RUNTIME.profile.bundles, restored by installation.js at every start), the placed Fishball set
 * (PLACEMENT.bundles, re-placed at every start by placement.js) and dsh-instance itself. Removing
 * any of them from the child's bundle list would be undone at the next start anyway. `fishball-ui`
 * is no longer placed (it became fishball-core's own UI row), but earlier instances installed and
 * selected it as a bundle, and existing children still hold it (the user's child, 2026-11-20); it
 * stays protected so the tab neither lists that leftover nor offers to remove a part of Fishball.
 * The Fishball
 * tab reads the list from the Host (GET /api/dsh-instance/plugins `protected`), so the browser
 * keeps no copy.
 */
export const CHILD_OWN_BUNDLES = Object.freeze([
  ...RUNTIME.profile.bundles,
  ...PLACEMENT.bundles.map((bundle) => bundle.name),
  PLACEMENT.retiredBundle,
  INSTANCE_PACKAGE,
])

/** HOSTED.retire's own word for a record with no successor (named once, used twice there). */
const NO_SUCCESSOR = 'no-successor'

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
 *   the instance's stable id and the old entry of an unfinished succession (host/hosted-record.js);
 * - `retire`: the reinstall succession's K3 answers and log lines (I-SUCCEED);
 * - `notice`: the instance's status-page notices — `entryDeleted` after Retry found the hosted entry
 *   deleted (R6 = B), and `recordUnreadable` when `hosted.json` could not be opened or created;
 * - `reconnect`: its refusals (K3 `ReconnectRefusalCode`).
 */
export const HOSTED = Object.freeze({
  credentialRef: 'DSH_AGENT_TOKEN',
  savedRecord: 'fishball-core/hosted-agent',
  childRow: 'dsh-instance-child',
  targetField: 'targetUrl',
  entryField: 'hostedEntryKey',
  bindingRecord: 'dsh-instance/hosted-parent',
  bindingKind: 'grant',
  hostTokenRecordPrefix: 'dsh-instance/hosted-',
  reconnect: Object.freeze({
    rebound: 'rebound', paired: 'paired', stored: 'stored',
    unconfirmed: 'pairing-not-confirmed', rebindUnconfirmed: 'rebind-not-confirmed',
    entryDisabled: 'hosted-entry-disabled', unavailable: 'hosted-binding-unavailable',
    settleMs: 5000, pollMs: 100,
  }),
  channel: 'mcp-credential',
  op: Object.freeze({ probe: 'probe', import: 'import', bind: 'bind-hosted', recover: 'recover-hosted' }),
  code: Object.freeze({
    unavailable: 'CREDENTIAL_CHANNEL_UNAVAILABLE',
    record: 'INVALID_HOSTED_RECORD',
  }),
  /** DSH's credential document lock wait (dsh-credentials-local DOCUMENT_LOCK_WAIT_MS, 0.2.1-rc.5 and 0.2.2-rc.1). */
  credentialLockWaitMs: 30000,
  record: Object.freeze({ file: 'hosted.json', format: 1 }),
  notice: Object.freeze({
    entryDeleted: 'hosted-entry-deleted',
    recordUnreadable: 'hosted-record-unreadable',
  }),
  /** Logged (code only, never a value) when the record could not keep a key the child stored. */
  bindFailed: 'hosted binding not applied (%s)',
  recordWriteFailed: 'hosted record not written (%s); the child holds the token',
  /** The host's own connector endpoint the child links to (K1 `PATHS.mcp`, restated: the instance does not import the connector). */
  mcpPath: '/api/agent/mcp',
  tokensService: 'dshConnectorTokens',
  apiVersion: 1,
  entryState: Object.freeze({ enabled: 'enabled', disabled: 'disabled', deleted: 'deleted' }),
  /**
   * Reinstall succession (I-SUCCEED; hosted.js `attempt`): K3 `RetireRefusalCode` words, restated
   * because the instance imports no connector module (as `entryState`), and one word of its own.
   * - `unpaired` (`successor-unpaired`): waits for the connector's next pair change, and each start;
   * - `final`: `unknown-entry` (an entry was deleted: never a reinstall, R-HOST-10) and `not-hosted`
   *   (not this instance's, or already succeeded) end it; `operation-failed` is not final: K3
   *   "the instance retries at its next start";
   * - `noSuccessor`: the instance's own word, logged when the newest entry is the old one itself;
   * - the logs carry a code only, never an entry key or a value.
   */
  retire: Object.freeze({
    unpaired: 'successor-unpaired',
    noSuccessor: NO_SUCCESSOR,
    final: Object.freeze(['unknown-entry', 'not-hosted', NO_SUCCESSOR]),
    droppedLog: 'hosted succession dropped (%s)',
    pendingLog: 'hosted succession not finished (%s); it is retried at the next start',
  }),
  /**
   * K3 `TargetStatus` answers (K1 `TARGET_STATE` / `TARGET_CODE` words, restated because the
   * instance imports no connector module; the K3 suite checks them): see hosted.js targetStatus.
   */
  target: Object.freeze({
    connected: Object.freeze({ state: 'connected', code: null }),
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
 * The `child-model` channel of the lifecycle wire: lets the main host's onboarding wizard read
 * the child's model catalog and `fishball-core`'s `model` selection, and save a chosen model,
 * through generic DSH services in `child-row.js` (no Fishball code imported).
 */
export const CHILD_MODEL = Object.freeze({
  channel: 'child-model',
  settingsNamespace: 'fishball-core',
  path: Object.freeze(['model']),
  mutateOp: 'set',
  catalogService: 'sessionController',
  op: Object.freeze({ read: 'read', set: 'set' }),
  code: Object.freeze({
    unavailable: 'CHILD_MODEL_CHANNEL_UNAVAILABLE',
    notReady: REFUSAL.notReady,
    namespaceMissing: 'namespace-missing',
    invalidModel: 'invalid-model',
    writeFailed: 'write-failed',
  }),
})

/**
 * First-run onboarding completion marker under `<home>/fishball/runtime`, so `uninstall.js`
 * removes it along with the runtime tree and a reinstall starts onboarding fresh.
 */
export const ONBOARDING = Object.freeze({
  file: 'onboarding.json',
  format: 1,
  outcome: Object.freeze({ completed: 'completed', skipped: 'skipped', preconfigured: 'preconfigured' }),
  /** Outcomes accepted by `complete()` and `POST /api/dsh-instance/onboarding/complete`. */
  completeOutcomes: Object.freeze(['completed', 'skipped']),
  writeFailedLog: 'onboarding marker write failed (%s)',
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
