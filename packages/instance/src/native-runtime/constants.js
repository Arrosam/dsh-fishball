export const RUNTIME = Object.freeze({
  format: 1,
  protocol: 'fishball-lifecycle/1',
  packageName: '@deepseek-ai/dsh',
  profileName: 'fishball',
  // The slim child is the DSH core only: the app row supplies the transport and UI (§2.1).
  profile: Object.freeze({
    bundles: Object.freeze(['@deepseek-ai/dsh-base']),
    // Earlier attached runtimes created this profile with the Web bundle, and initProfile never
    // rewrites an existing manifest. The slim child must not run that Web UI, so its bundle is
    // dropped on start; every bundle the owner installed later is kept (§2.1, §2.3).
    legacyBundle: '@deepseek-ai/dsh-web-app',
    manifest: 'package.json',
    // The migration keeps the replaced manifest beside it as `package.json.pre-slim-<UTC time>`,
    // so a rollback to the old build can restore its bundles from the child home itself.
    manifestBackupInfix: '.pre-slim-',
  }),
  codeSnapshotPrefix: '.fishball-native-',
  // The connector's contract package inside the snapshot (M1): the child's shims import
  // `fishball-connector/contract`, and Node finds it in the snapshot's own node_modules.
  contractPackage: Object.freeze({ name: 'fishball-connector', directory: 'contract', modules: 'node_modules', manifest: 'package.json' }),
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
  // The child's stderr (B6), bounded by RUNTIME_LIMITS.maxLogBytes; the previous file is kept
  // once under the rotated suffix, so at most two caps of disk are used.
  stderrLog: 'child-stderr.log',
  rotatedLogSuffix: '.1',
  // Readiness is the base core plus the app server (§2.3). The old gate waited for webServer,
  // webApp, connection and sessionController, which only the Web UI bundle supplies.
  requiredServices: Object.freeze(['agents', 'sessions', 'tools', 'profileContext', 'appExit', 'appReady']),
  // The app row publishes {`origin`, `bearer`} here while it boots, before appReady, and removes
  // it when the listener closes (T03). Absent while starting; readiness probes it once (§2.3).
  appService: 'fishballApp',
  capabilities: Object.freeze({ authenticatedApp: 'authenticated-app', lifecycle: 'lifecycle-v1', control: 'control-transport-v1' }),
  // A ready child reporting any of these can never recover by polling again.
  fatalStartupCodes: Object.freeze(['CHILD_IDENTITY_MISMATCH', 'MISSING_CAPABILITY', 'UNSAFE_APP_ORIGIN', 'INVALID_APP_ACCESS', 'INVALID_APP_BEARER']),
})

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
  runtimeEnv: Object.freeze(['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS']),
  // An Electron main process (process.versions.electron) has an Electron binary as execPath. With
  // this variable it runs as a windowless Node process; without it, it would open a second app
  // window. So it is always set for an Electron host, never refused.
  electronAsNode: Object.freeze({ name: 'ELECTRON_RUN_AS_NODE', value: '1' }),
  // Debugger flags are dropped from execArgv: a port the main DSH already holds would stop the
  // child from starting. Prefixes: `--inspect` also covers --inspect-brk, --inspect-wait,
  // --inspect-port and --inspect-publish-uid. No other flag is touched.
  debugFlagPrefixes: Object.freeze(['--inspect', '--debug-port']),
  // The debugger flags whose value Node keeps as the next execArgv item when written without `=`
  // (`--inspect-port 0` is two items); that value is dropped with its flag.
  debugFlagsWithValue: Object.freeze(['--inspect-port', '--debug-port', '--inspect-publish-uid']),
})

/**
 * The app row's loopback surface (§2.3, §3.2): the origin it listens on and the bearer it minted.
 * The bearer stays opaque to the lifecycle — the app decides authentication — but it becomes an
 * Authorization header value, so a value that is not header-safe is refused before the probe.
 */
export const APP_ACCESS = Object.freeze({
  protocol: 'http:',
  documentPath: '/',
  // A 256-bit token is 32 raw bytes; its hex, base64 and base64url text forms are 32 to 64 bytes.
  // The range accepts every standard encoding without fixing one for the app row.
  minBearerBytes: 32,
  maxBearerBytes: 64,
  headerUnsafe: /[^\x21-\x7e]/,
})

export function appAccess(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_APP_ACCESS')
  const { origin, bearer } = value
  let url
  try { url = new URL(origin) } catch { fail('INVALID_APP_ACCESS') }
  // The browser never addresses the child port (§3.1); the main-side broker is the only client.
  if (url.protocol !== APP_ACCESS.protocol || url.hostname !== RUNTIME.host || !url.port || url.username || url.password || url.pathname !== APP_ACCESS.documentPath || url.search || url.hash) fail('UNSAFE_APP_ORIGIN')
  if (typeof bearer !== 'string' || APP_ACCESS.headerUnsafe.test(bearer)) fail('INVALID_APP_BEARER')
  const bytes = Buffer.byteLength(bearer, 'utf8')
  if (bytes < APP_ACCESS.minBearerBytes || bytes > APP_ACCESS.maxBearerBytes) fail('INVALID_APP_BEARER')
  return Object.freeze({ origin: url.origin, bearer })
}

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
    usage: 'Usage: node uninstall.js [--home <DSH_HOME>]\nQuit DSH first, then run this before removing fishball-instance.\n',
    removed: 'Removed the Fishball instance data: {path}\n',
    absent: 'Nothing to remove: {path} does not exist.\n',
    // The codes are listed in the README ("Uninstall"); the most common is CHILD_RUNNING.
    refused: 'Nothing was removed from {path} ({code}). Quit DSH, wait a few seconds and run it again.\n',
  }),
})

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
