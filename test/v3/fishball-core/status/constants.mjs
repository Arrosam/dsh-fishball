/**
 * Vocabulary for the F-STATUS cases (USE-CASES.md). Every expected word comes from a requirement or
 * a frozen contract, never from the implementation:
 * - K1 `dsh-connector/mcp-schema`: the link's TargetStatus words (TARGET_STATE, TARGET_CODE), the
 *   loopback names of F-LINK's target rule (HOSTS) and the OAuth error words;
 * - core's contracts (`packages/core/contracts/constants.js`): Connect's states and configuration
 *   codes (CONNECT, connect.d.ts), the guard report's words (GUARDS, guards.d.ts);
 * - the F-STATUS surface relayed by the dev session (2026-11-16): STATUS_MODEL's spellings and the
 *   strip's line kinds, written here once as the contract states them (case F-STATUS-00 checks the
 *   module's exported STATUS_MODEL against them);
 * - DSH's own host vocabulary (service and event names, cordis FiberState) from the installed SDK types.
 * The rest is fixture data and harness timing.
 */
import path from 'node:path'
import { HOSTS, OAUTH_ERROR, TARGET_CODE, TARGET_STATE } from '../../../../packages/dsh-connector/mcp-schema/index.js'
import { CONNECT, GUARDS } from '../../../../packages/core/contracts/constants.js'
import { REPO } from '../../../support/constants.mjs'
import { V3 } from '../../contract/package-boundaries/constants.mjs'

export { CONNECT, OAUTH_ERROR, TARGET_CODE, TARGET_STATE }

/** The F-STATUS "Owns" entries. */
export const SUBJECT = Object.freeze({
  core: path.join(REPO, 'packages', 'core', 'src', 'status', 'index.js'),
  ui: path.join(REPO, 'packages', 'core', 'ui', 'status', 'index.js'),
  factory: 'createStatus',
  reader: 'statusOf',
  model: 'STATUS_MODEL',
  texts: 'STATUS_TEXT',
  view: 'stripView',
})

/** STATUS_MODEL as the relayed contract spells it. */
export const MODEL = Object.freeze({
  fishball: Object.freeze({ on: 'on', off: 'fishball-off' }),
  set: Object.freeze({ ok: 'ok', incomplete: 'plugin-set-incomplete' }),
  reason: Object.freeze({ skipped: 'skipped', failed: 'failed' }),
  // After requirements 1.34–1.41 the only checked set member is the board (R-BND-05).
  members: Object.freeze([V3.board.name]),
  control: Object.freeze({ connect: 'connect', cancel: 'cancel' }),
  serviceName: 'fishballStatus',
  notice: Object.freeze({ pluginId: V3.core.name, guardsKeyPrefix: 'fishball-status:guards:' }),
})

/** The snapshot's members (relayed contract), and the words of its `line`. */
export const SNAPSHOT_KEYS = Object.freeze(['fishball', 'link', 'connect', 'line', 'control', 'guards', 'set', 'contributedTools'])
export const LINE = Object.freeze({
  connected: TARGET_STATE.connected,
  authorizing: CONNECT.state.authorizing,
  needsConfiguration: CONNECT.state.needsConfiguration,
})

/** The strip's line kinds besides the link line (relayed `stripView` contract). */
export const STRIP = Object.freeze({
  guards: GUARDS.status.overridden,
  set: MODEL.set.incomplete,
  tools: 'contributed-tools',
  off: MODEL.fishball.off,
  /** Line order: the link line, then these, each only when present. */
  order: Object.freeze(['link', GUARDS.status.overridden, MODEL.set.incomplete, 'contributed-tools']),
})
export const LANG = Object.freeze({ en: 'en', zh: 'zh', unknown: 'fbtest-xx' })

/** Guard report words (K3 guards.d.ts via core's GUARDS) and fixture lists of overridden guards. */
export const GUARD = Object.freeze({
  ok: Object.freeze({ status: GUARDS.status.ok, overridden: Object.freeze([]) }),
  overridden: (list) => Object.freeze({ status: GUARDS.status.overridden, overridden: Object.freeze([...list]) }),
  first: Object.freeze([GUARDS.code.rowPrefix + V3.instance.name, GUARDS.code.bundleOrder]),
  second: Object.freeze([GUARDS.code.managerTools]),
  /** The notice's list separator (relayed: "overridden guards joined by ', '"). */
  separator: ', ',
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
  ui: GUARDS.pluginName,
  hostedSettings: 'fishball-hosted-settings',
  watchdog: 'fishball-watchdog',
  other: 'fbtest-other-bundle',
})
/** Words no strip line may carry (kinds and texts). */
export const NEVER_SHOWN = Object.freeze([NEVER_REPORTED.ui, NEVER_REPORTED.hostedSettings, NEVER_REPORTED.watchdog, 'watchdog', 'Watchdog'])

/** Fixture rows and entries: the board's row id is its patch's (packages/board/cordis.patch.yml). */
export const FIXTURE = Object.freeze({
  boardRow: V3.board.name,
  boardEntry: 'fbtest-entry-board',
  otherEntry: 'fbtest-entry-other',
  /** Contributed-tool counts: BVA 0, 1 and n. */
  tools: Object.freeze({ none: 0, one: 1, many: 7 }),
  /** Stands in for the number when two counts' texts are compared (singular vs plural). */
  countMark: '#',
  /** Keys a status may never carry (there is no token field anywhere in the status). */
  forbiddenKey: /token|secret|password|authorization/i,
})

/**
 * The strip's reason words in en (dev session amendment 2026-11-16: en 'skipped' / 'failed to
 * start'; zh differs). A count of 1 reads singular in en.
 */
export const REASON_TEXT_EN = Object.freeze({ [MODEL.reason.skipped]: 'skipped', [MODEL.reason.failed]: 'failed to start' })

/** Harness timing (waiting only; none is a product oracle). */
export const WAIT = Object.freeze({ untilMs: 2000, pollMs: 5, settleTicks: 10, quietMs: 50, netSettleMs: 500, probeMs: 30000 })

/** The per-process key probe (key-probe.mjs): a plain Node process, not a DSH host or a hosted child. */
export const PROBE = Object.freeze({ file: path.join(import.meta.dirname, 'key-probe.mjs'), keyLine: /^fbtest-key (.+)$/m, keyLabel: 'fbtest-key' })

/** Owners of the rows this suite cannot run (todo). */
export const LATER = Object.freeze({
  press: 'E2E-CORE / F-UI (pressing the strip control calls connect.begin()/cancel(): the relayed surface has no action method; the page wires it)',
  wire: 'F-WIRE (the status service provided as fishballStatus in a real standalone DSH; PLAT-DT-02 at integration)',
  hosted: 'I-HOST (core in a hosted child: needs a hosted child; none is launched here)',
})
