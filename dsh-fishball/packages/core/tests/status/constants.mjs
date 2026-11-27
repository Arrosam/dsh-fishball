/**
 * Vocabulary for the F-STATUS cases (USE-CASES.md). Every expected word comes from a requirement or
 * a frozen contract, never from the implementation:
 * - K1 `dsh-agent-connector/mcp-schema` (vendored as fishball-test-helpers/connector-contract/mcp-schema): the link's TargetStatus words (TARGET_STATE, TARGET_CODE), the
 *   loopback names of F-LINK's target rule (HOSTS) and the OAuth error words;
 * - core's contracts (`packages/core/contracts/constants.js`): Connect's states and configuration
 *   codes (CONNECT, connect.d.ts);
 * - the F-STATUS surface relayed by the dev session (2026-11-16): STATUS_MODEL's spellings and the
 *   strip's line kinds, written here once as the contract states them (case F-STATUS-00 checks the
 *   module's exported STATUS_MODEL against them);
 * - DSH's own host vocabulary (service and event names, cordis FiberState) from the installed SDK types.
 * The rest is fixture data and harness timing.
 */
import path from 'node:path'
import { HOSTS, OAUTH_ERROR, TARGET_CODE, TARGET_STATE } from 'fishball-test-helpers/connector-contract/mcp-schema'
import { CONNECT } from '../../contracts/constants.js'

/** fishball-core's folder (tests/status/ is two levels below it). */
const PACKAGE_DIR = path.join(import.meta.dirname, '..', '..')

export { CONNECT, OAUTH_ERROR, TARGET_CODE, TARGET_STATE }

/** The F-STATUS "Owns" entries. */
export const SUBJECT = Object.freeze({
  core: path.join(PACKAGE_DIR, 'src', 'status', 'index.js'),
  factory: 'createStatus',
  reader: 'statusOf',
  model: 'STATUS_MODEL',
  /** MULTI-0 (targets.d.ts `TargetView.line`): core's pure per-target rule `stripLine(link, url, connect)` → {line, control}. */
  line: 'stripLine',
})

/** STATUS_MODEL as the relayed contract spells it. */
export const MODEL = Object.freeze({
  fishball: Object.freeze({ on: 'on', off: 'fishball-off' }),
  set: Object.freeze({ ok: 'ok', incomplete: 'plugin-set-incomplete' }),
  reason: Object.freeze({ skipped: 'skipped', failed: 'failed' }),
  // SHELVE-BOARD (the user, 2026-11-18): fishball-board is shelved from 1.0.0-alpha.1, so the board,
  // the only member after requirements 1.34–1.41 (R-BND-05), left the check. No member remains; the
  // check's mechanism is kept for a later member.
  members: Object.freeze([]),
  control: Object.freeze({ connect: 'connect', cancel: 'cancel' }),
  serviceName: 'fishballStatus',
})
/** The snapshot's members (relayed contract), and the words of its `line`. */
/** MULTI-0 `StatusSnapshot`: the global parts, `targets`, and LOGO-BUTTON's normalized `brand`. */
export const SNAPSHOT_KEYS = Object.freeze(['fishball', 'set', 'targets', 'brand'])
export const WITHDRAWN_KEYS = Object.freeze(['link', 'connect', 'line', 'control', 'contributedTools', 'guards'])
/** TargetsSnapshot fixtures (test data shaped as targets.d.ts; the status forwards them unchanged). */
const view = (targetId, extra = {}) => Object.freeze({
  targetId, endpointEpoch: 'e-' + 'a'.repeat(16), serverName: null, name: null, kind: 'remote', url: 'https://fishball-target.example.test/mcp',
  order: 1, duplicateSuffix: null, state: 'not-set', connecting: false, link: Object.freeze({ state: 'target-unset', code: null }),
  connect: null, line: Object.freeze({ kind: 'target-unset', code: null }), control: null,
  pairing: Object.freeze({ state: 'unpaired', warning: null, choices: Object.freeze([]), nameIssue: null }),
  identity: 'pending', contributedTools: null, removable: true, urlEditable: true, ...extra,
})
export const TARGETS_SNAPSHOT = Object.freeze({
  empty: Object.freeze({ version: 1, targets: Object.freeze([]) }),
  one: Object.freeze({ version: 1, targets: Object.freeze([view('t-' + 'a'.repeat(16))]) }),
  two: Object.freeze({ version: 1, targets: Object.freeze([view('t-' + 'a'.repeat(16)), view('t-' + 'b'.repeat(16), { order: 2, contributedTools: 0 })]) }),
  connected: Object.freeze({ version: 1, targets: Object.freeze([view('t-' + 'a'.repeat(16), { state: 'connected', link: Object.freeze({ state: 'connected', code: null }), line: Object.freeze({ kind: 'connected', code: null }), contributedTools: 3 })]) }),
})
export const LINE = Object.freeze({
  connected: TARGET_STATE.connected,
  authorizing: CONNECT.state.authorizing,
  needsConfiguration: CONNECT.state.needsConfiguration,
})

/** Link statuses (K1 TargetStatus, REM-DT-01). */
const status = (state, code = null) => Object.freeze({ state, code })
export const LINK_STATUS = Object.freeze({
  connected: status(TARGET_STATE.connected),
  unset: status(TARGET_STATE.unset),
  insecure: status(TARGET_STATE.unset, TARGET_CODE.insecure),
  invalid: status(TARGET_STATE.unset, TARGET_CODE.invalid),
  unreachable: status(TARGET_STATE.unreachable, TARGET_CODE.unreachable),
  incompatible: status(TARGET_STATE.unreachable, TARGET_CODE.incompatible),
  refused: status(TARGET_STATE.refused, TARGET_CODE.refused),
  revoked: status(TARGET_STATE.refused, TARGET_CODE.revoked),
})
/** Connect statuses (connect.d.ts ConnectStatus). */
export const CONNECT_STATUS = Object.freeze({
  needsAuthorization: status(CONNECT.state.needsAuthorization),
  authorizing: status(CONNECT.state.authorizing),
  authorized: status(CONNECT.state.authorized),
  needsConfiguration: status(CONNECT.state.needsConfiguration, CONNECT.configuration.metadataUrlMissing),
  failedGrant: status(CONNECT.state.failed, OAUTH_ERROR.invalidGrant),
  failedDenied: status(CONNECT.state.failed, OAUTH_ERROR.accessDenied),
  failedBare: status(CONNECT.state.failed),
})

/**
 * Target URLs (F-LINK's rule as relayed: non-blank http(s) URL, http only to loopback
 * 127.0.0.1/localhost/[::1], no userinfo). `secret` is planted in a userinfo URL: it must never
 * appear in the status or the strip.
 */
export const SECRET = 'fbtest-status-secret-7f3a'
export const TARGET = Object.freeze({
  usable: Object.freeze({
    https: 'https://fishball-target.example.test/mcp',
    ...Object.fromEntries(HOSTS.loopbackNames.map((host) => [host, `${HOSTS.loopbackScheme}//${host}:7811/mcp`])),
  }),
  unusable: Object.freeze({
    empty: '',
    blank: '   ',
    plainHttpRemote: `${HOSTS.loopbackScheme}//fishball-target.example.test/mcp`,
    // BVA next to the loopback names: one address off is not loopback by name.
    nearLoopbackV4: `${HOSTS.loopbackScheme}//127.0.0.2:7811/mcp`,
    nearLoopbackV6: `${HOSTS.loopbackScheme}//[::2]:7811/mcp`,
    userinfo: `${HOSTS.remoteScheme}//fbtest:${SECRET}@fishball-target.example.test/mcp`,
    otherScheme: 'ftp://fishball-target.example.test/mcp',
    notUrl: 'fishball target',
  }),
})

/** DSH host vocabulary (installed SDK types: dsh-app-boot, dsh-plugin-manager, cordis-plugin-loader, dsh-settings). */
export const HOST = Object.freeze({
  appReady: 'appReady',
  pluginManager: 'pluginManager',
  loader: 'loader',
  changed: 'plugin-manager/changed',
  settingsUpdated: 'settings/document-updated',
  /** PluginChange.reason and a settings namespace/revision (event arguments, fixture values). */
  changeReason: 'bundle',
  settingsNamespace: 'fishball-core',
  settingsRevision: 2,
  /** cordis FiberState (a const enum, so not importable): LOADING, ACTIVE and FAILED (lib/types/fiber.d.ts, both SDKs). */
  fiberLoading: 1,
  fiberActive: 2,
  fiberFailed: 3,
  /** dsh-plugin-manager ManagementError codes used as fixtures. */
  incompatible: 'incompatible-version',
  operationError: 'operation-error',
  /** Selected but its package cannot be resolved or read (DSH's boot skips it: loadProfileDirectory skippedBundles). */
  notBundle: 'not-bundle',
  /** Cordis logger message type of `warn` (captured through the logger exporter). */
  warn: 'warn',
  allLevels: 3,
})

/** Bundles that are never reported (Q-G1, HOST-DT-03 rule 10, R-FB-07 withdrawn) and an ordinary other bundle. */
export const NEVER_REPORTED = Object.freeze({
  /** The fishball-ui bundle (Q-G1: core shows no hint about it, present or missing; F-UI). */
  ui: 'fishball-ui',
  hostedSettings: 'fishball-hosted-settings',
  watchdog: 'fishball-watchdog',
  other: 'fbtest-other-bundle',
})

/**
 * SHELVE-BOARD (the user, 2026-11-18): "fishball-board先从这次release中移除，我要改的地方太多了。先封存，
 * 留到下一批再说。所以不要预留在子实例的Fishball内。" The board in these rows is a stand-in: a fake
 * BundleInfo only named fishball-board, with one row of the same id, as F-WIRE's stand-in fixture
 * (wire/fixtures/fishball-board) has. packages/board is never read or loaded. `mention` is REL-PACK's
 * one board-mention rule: no snapshot set and no strip line may match it.
 */
export const BOARD = Object.freeze({
  name: 'fishball-board',
  row: 'fishball-board',
  entry: 'fbtest-entry-board',
  /** REL-PACK's board-mention rule (SHELVE-BOARD), restated here: the release check that owned it is not this package's. */
  mention: /fishball-board|(?<![a-z])board(?![a-z])/i,
})

/** Fixture rows and entries. */
export const FIXTURE = Object.freeze({
  otherEntry: 'fbtest-entry-other',
  /** How many snapshots the "reading changes nothing" postcondition reads. */
  tools: Object.freeze({ many: 7 }),
  /** Keys a status may never carry (there is no token field anywhere in the status). */
  forbiddenKey: /token|secret|password|authorization/i,
})

/** Harness timing (waiting only; none is a product oracle). */
export const WAIT = Object.freeze({ untilMs: 2000, pollMs: 5, settleTicks: 10, quietMs: 50, netSettleMs: 500 })
