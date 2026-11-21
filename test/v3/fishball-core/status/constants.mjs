/**
 * Vocabulary for the F-STATUS cases (USE-CASES.md). Every expected word comes from a requirement or
 * a frozen contract, never from the implementation:
 * - K1 `dsh-agent-connector/mcp-schema`: the link's TargetStatus words (TARGET_STATE, TARGET_CODE), the
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
import { HOSTS, OAUTH_ERROR, TARGET_CODE, TARGET_STATE } from '../../../fixtures/dsh-connector-contract/mcp-schema/index.js'
import { CONNECT, GUARDS } from '../../../../packages/core/contracts/constants.js'
import { REPO } from '../../../support/constants.mjs'
import { SHELVED_BOARD, V3 } from '../../contract/package-boundaries/constants.mjs'

export { CONNECT, OAUTH_ERROR, TARGET_CODE, TARGET_STATE }

/** The F-STATUS "Owns" entries. */
export const SUBJECT = Object.freeze({
  core: path.join(REPO, 'packages', 'core', 'src', 'status', 'index.js'),
  /** F-UI moved the strip view, unchanged, into fishball-ui (src/status/). */
  ui: path.join(REPO, 'packages', 'fishball-ui', 'src', 'status', 'index.js'),
  factory: 'createStatus',
  reader: 'statusOf',
  model: 'STATUS_MODEL',
  texts: 'STATUS_TEXT',
  view: 'stripView',
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
  notice: Object.freeze({ pluginId: V3.core.name, guardsKeyPrefix: 'fishball-status:guards:' }),
})
/**
 * GENTLE-TOOLS: STATUS_MODEL.notice also has `toolsKeyPrefix`; its spelling was not relayed, so
 * F-STATUS-00 checks it is a non-empty string other than the guards prefix, and the members above exactly.
 */
export const TOOLS_KEY_PREFIX = 'toolsKeyPrefix'

/** The snapshot's members (relayed contract), and the words of its `line`. */
/** MULTI-0 `StatusSnapshot`: the global parts, `targets`, and LOGO-BUTTON's normalized `brand`. */
export const SNAPSHOT_KEYS = Object.freeze(['fishball', 'guards', 'set', 'targets', 'brand'])
export const WITHDRAWN_KEYS = Object.freeze(['link', 'connect', 'line', 'control', 'contributedTools'])
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
/** Why rows that asserted fishball-ui's stripView output or a withdrawn scalar port no longer run here. */
export const WITHDRAWN_ROW = Object.freeze({
  strip: 'withdrawn from core by MULTI-0 / MULTI-3 (the lead, 2026-11-18): fishball-ui\'s stripView output is fishball-ui\'s (test/v3/fishball-ui); core rows assert only core\'s snapshot and stripLine',
  target: 'withdrawn by MULTI-0: the status has no target() port (core\'s target.url setting is withdrawn); each TargetView carries its own url and line',
  bridge: 'withdrawn by MULTI-0: the status has no bridge port; contributedTools is a TargetView field (MULTI-STATUS-EP-01 checks it is forwarded, zero included)',
})
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
// GENTLE-TOOLS (the user, 2026-11-21): K3 GuardReport gained `extraManagerTools` (sorted, unique; [] when
// none, also with status ok), so every fixture report carries it; `overridden(list)` alone gives [].
export const GUARD = Object.freeze({
  ok: Object.freeze({ status: GUARDS.status.ok, overridden: Object.freeze([]), extraManagerTools: Object.freeze([]) }),
  overridden: (list, extras = []) => Object.freeze({ status: GUARDS.status.overridden, overridden: Object.freeze([...list]), extraManagerTools: Object.freeze([...extras]) }),
  first: Object.freeze([GUARDS.code.rowPrefix + V3.instance.name, GUARDS.code.bundleOrder]),
  second: Object.freeze([GUARDS.code.managerTools]),
  /** The notice's list separator (relayed: "overridden guards joined by ', '"). */
  separator: ', ',
})

/**
 * GENTLE-TOOLS (the lead's relayed requirement, 2026-11-21): the once-only notice about the manager's
 * extra tools. Spellings are the requirement's: the record file, its one-line JSON, the list separator,
 * the manager-tools guard code (K3) and the words the gentle text must not use. Tool names are
 * fixture data (sorted as written: alpha < beta < gamma).
 */
export const TOOLS = Object.freeze({
  names: Object.freeze({ a: 'fbtest_tool_alpha', b: 'fbtest_tool_beta', c: 'fbtest_tool_gamma' }),
  code: GUARDS.code.managerTools,
  /** A guard code beside manager-tools in a refresh that keeps the same extras (K3 `bundle-order`). */
  other: GUARDS.code.bundleOrder,
  /** `<profileContext.home>/fishball/manager-tools.json`: one JSON line {"announced": [sorted]} + "\n". */
  record: Object.freeze({ dir: 'fishball', file: 'manager-tools.json', key: 'announced', eol: '\n' }),
  separator: ', ',
  /** The notice is informational: never "guards are overridden", never "guarantees weaker". */
  harsh: Object.freeze([/overridden/i, /weaker/i, /guarantee/i]),
  profileName: 'fbtest-profile',
  homePrefix: 'fbtest-status-tools-',
  /** Malformed record contents (EP): each counts as nothing announced. */
  malformed: Object.freeze({
    'not JSON': '{oops',
    'empty file': '',
    'announced not a list': '{"announced":"fbtest_tool_alpha"}\n',
    'no announced member': '{}\n',
    'a JSON list': '["fbtest_tool_alpha"]\n',
    'JSON null': 'null\n',
  }),
  /** Harness wait for "nothing more happens" around file I/O (no product oracle). */
  quietMs: 150,
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
  /** dsh-app-boot's profile-context service ({home, name}; types/profile-context.d.ts, both SDKs). */
  profileContext: 'profileContext',
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
  ui: V3.ui.name,
  hostedSettings: 'fishball-hosted-settings',
  watchdog: 'fishball-watchdog',
  other: 'fbtest-other-bundle',
})
/** Words no strip line may carry (kinds and texts). */
export const NEVER_SHOWN = Object.freeze([NEVER_REPORTED.ui, NEVER_REPORTED.hostedSettings, NEVER_REPORTED.watchdog, 'watchdog', 'Watchdog'])

/**
 * SHELVE-BOARD (the user, 2026-11-18): "fishball-board先从这次release中移除，我要改的地方太多了。先封存，
 * 留到下一批再说。所以不要预留在子实例的Fishball内。" The board in these rows is a stand-in: a fake
 * BundleInfo only named fishball-board, with one row of the same id, as F-WIRE's stand-in fixture
 * (wire/fixtures/fishball-board) has. packages/board is never read or loaded. `mention` is REL-PACK's
 * one board-mention rule: no snapshot set and no strip line may match it.
 */
export const BOARD = Object.freeze({
  name: SHELVED_BOARD.pkg.name,
  row: SHELVED_BOARD.pkg.name,
  entry: 'fbtest-entry-board',
  mention: SHELVED_BOARD.mention,
})

/** Fixture rows and entries. */
export const FIXTURE = Object.freeze({
  otherEntry: 'fbtest-entry-other',
  /**
   * A made-up set member for the strip's set-line mechanism (kept for a later member): core checks
   * none now, so only a hand-built snapshot can carry a missing member.
   */
  laterMember: 'fbtest-later-member',
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

/**
 * UI-POLISH-F (.runtime/reports/ui-polish-f/SPEC.md §2): the status card `stripView(snapshot, lang)`
 * now returns beside `lines` and `control` (`card: {state, title, badge, toolsHint, openApproval}`),
 * and the hooks of the drawn card. Every word is SPEC.md's.
 */
/** SPEC §2: the status card's decision table, by first-line kind. */
export const UI_CARD = Object.freeze({
  root: 'data-fishball-strip',
  state: 'data-fishball-strip-state',
  badgeHook: 'data-fishball-strip-badge',
  lineHook: 'data-fishball-strip-line',
  controlHook: 'data-fishball-strip-control',
  approvalHook: 'data-fishball-strip-approval',
  /** kind → [card.state, badge en, badge zh, StateDot state]. */
  table: Object.freeze({
    connected: Object.freeze(['connected', 'Connected', '已连接', 'done']),
    'target-unset': Object.freeze(['unset', 'Not set', '未设置', 'idle']),
    'needs-authorization': Object.freeze(['disconnected', 'Not connected', '未连接', 'idle']),
    authorizing: Object.freeze(['connecting', 'Connecting', '连接中', 'ongoing']),
    'needs-configuration': Object.freeze(['attention', 'Needs setup', '需要配置', 'warning']),
    'target-unreachable': Object.freeze(['failed', 'Failed', '失败', 'error']),
    'token-refused': Object.freeze(['failed', 'Failed', '失败', 'error']),
    failed: Object.freeze(['failed', 'Failed', '失败', 'error']),
    'fishball-off': Object.freeze(['off', 'Off', '已关闭', 'idle']),
  }),
  /** "any other kind" partition (fixture word, never a product kind). */
  otherKind: 'fbtest-unknown-kind',
  otherRow: Object.freeze(['failed', 'Failed', '失败', 'error']),
  title: Object.freeze({ en: 'Target DSH', zh: '目标 DSH', off: 'Fishball' }),
  toolsHint: Object.freeze({ en: "Contributed tools offered to Fishball's model", zh: '提供给 Fishball 模型的贡献工具' }),
  openApproval: Object.freeze({ en: 'Open the approval page', zh: '打开授权页面' }),
  /** The tools chip text (BVA 0, 1, 2). */
  tools: Object.freeze({
    en: (n) => (n === 1 ? '1 contributed tool' : `${n} contributed tools`),
    zh: (n) => `${n} 个贡献工具`,
  }),
  toolsKind: 'contributed-tools',
  /** The chip's aria-label joins its text and the hint with this (SPEC §2: `<chip text> · <toolsHint>`). */
  chipSeparator: ' · ',
  /** BVA of the chip: 0, 1 (singular in en), 2. */
  toolsBva: Object.freeze([0, 1, 2]),
  offKind: 'fishball-off',
  cardKeys: Object.freeze(['state', 'title', 'badge', 'toolsHint', 'openApproval']),
  control: Object.freeze({ connect: Object.freeze({ en: 'Connect', zh: '连接', variant: 'primary' }), cancel: Object.freeze({ en: 'Cancel', zh: '取消', variant: 'outline' }) }),
  approval: Object.freeze({ target: '_blank', rel: 'noopener noreferrer' }),
})

