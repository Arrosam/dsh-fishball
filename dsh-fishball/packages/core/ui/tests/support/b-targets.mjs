/**
 * MULTI-3 vocabulary and fixtures of the sidebar DSH targets, the per-target frame and the ask card's
 * source (port-ui-b; shared by the model-dialog, contrast and package rows). Sources, and only these:
 * the MULTI-3 requirements A–G the lead relayed (2026-11-18) and its follow-up the same day (MULTI-0
 * review fixes 1249c517: the `SEAM_TARGETS.http` statuses, the withdrawn K3a Connect routes, the
 * empty state's settings button), PLAN-MULTI (docs/planning/v3-multi-dsh.md §3, §5, §6.4, Q01–Q12),
 * the frozen contracts (fishball-core contracts/targets.d.ts, ask-card.d.ts, ui.d.ts) and
 * fishball-shared's ui-seam (`SEAM_TARGETS`, `SEAM_STATUS`, through ./seam.mjs, which re-exports it:
 * a nested package may use its parent's dependencies). No value is read from the implementation.
 *
 * `viewModule()` binds fishball-ui's pure frame module (`src/status/index.js`: targetsView,
 * TARGET_LINE, STATUS_TEXT) and its pairing view (`src/pairing/index.js`: pairingView) to the
 * current DSH; only their exports are read. `targetView(i, overrides)` / `snapshotOf(targets,
 * globals)` are core's `TargetView` and status snapshot as the contracts shape them.
 */
import assert from 'node:assert/strict'
import { importBound } from 'fishball-test-helpers/bind'
import { PAGE_STREAM } from './page-stream.mjs'
import { STATE as PAIR_STATE, coreView } from './pairing.mjs'
import { SEAM_STATUS, SEAM_TARGETS } from './seam.mjs'
import { UI } from './ui-page.mjs'

export { SEAM_STATUS, SEAM_TARGETS }

/** Requirement B: the pure frame module and its exports. */
export const SUBJECT = Object.freeze({
  view: UI.file('src', 'status', 'index.js'),
  exports: Object.freeze({ view: 'targetsView', line: 'TARGET_LINE', text: 'STATUS_TEXT' }),
  pairing: UI.file('src', 'pairing', 'index.js'),
  pairingExport: 'pairingView',
})

/**
 * UI-POLISH-F SPEC §2's line kinds (the strip card's table, fishball-core status rows): kind →
 * [card state, badge en, badge zh, StateDot]. Only the kinds are used now: they are the words core's
 * `stripLine` emits, which a target's `line.kind` carries (targets.d.ts).
 */
export const LINE_KIND = Object.freeze(['connected', 'target-unset', 'needs-authorization', 'authorizing', 'needs-configuration', 'target-unreachable', 'token-refused', 'failed', SEAM_STATUS.fishball.off])

/** Requirement B: the frame's shape and its words. */
export const FRAME = Object.freeze({
  keys: Object.freeze(['on', 'title', 'empty', 'notices', 'targets', 'words', 'brandStyle']),
  // `sessions`: the running managed sessions under the row (sessions rows), additive.
  targetKeys: Object.freeze(['targetId', 'kind', 'name', 'placeholder', 'state', 'badge', 'url', 'lines', 'control', 'retry', 'pairing', 'sessions']),
  notice: Object.freeze({ off: SEAM_STATUS.fishball.off, guards: SEAM_STATUS.guards.overridden, set: SEAM_STATUS.set.incomplete }),
  /** Review amendment (b): no `url` line; the URL is the view's `url` field, drawn in `[data-fishball-target-url]`. */
  lineOrder: Object.freeze(['why', 'contributed-tools', 'identity']),
  /** Q01's placeholders, chosen by URL (review amendment (a)): no URL → unset, a URL → unnamed, whatever the state. */
  placeholder: Object.freeze({
    unset: Object.freeze({ en: 'Not set', zh: '未设置' }),
    unnamed: Object.freeze({ en: 'Name unavailable', zh: '名字未知' }),
  }),
  /** The empty list text starts with this (requirement B: "No DSH target yet…"). */
  emptyStart: Object.freeze({ en: 'No DSH target yet' }),
  /** The control labels: the strip's Connect / Cancel copy, unchanged (UI-POLISH-F SPEC §2). */
  control: Object.freeze({ connect: Object.freeze({ en: 'Connect', zh: '连接' }), cancel: Object.freeze({ en: 'Cancel', zh: '取消' }) }),
  retryWord: 'Retry',
  /** LOGO-BUTTON: the frame's normalized logo theme (ui-seam SEAM_BRAND). */
  brand: Object.freeze({ fishball: 'fishball', deepseek: 'deepseek' }),
  langs: Object.freeze(['en', 'zh']),
})

/** The kinds core's rule emits as a target line: every SPEC §2 kind but `fishball-off`, a notice now. */
export const KNOWN_LINE = Object.freeze(LINE_KIND.filter((kind) => kind !== SEAM_STATUS.fishball.off))

/** Requirement C and the follow-up: the sidebar, its routes. */
export const SIDEBAR = Object.freeze({
  slot: 'sidebar.workspaces',
  /** DSH's own workspace browser registers at 0; fishball-page's fail-closed Empty shadow at -1. */
  dshPriority: 0,
  emptyShadowPriority: -1,
  pageMark: 'data-fishball-page',
  /** The image-loop fix (2026-11-22): the sidebar's frames arrive on the page's one connection under 'strip'. */
  streamPath: PAGE_STREAM.path,
  streamTopic: PAGE_STREAM.topic.strip,
  askTopic: PAGE_STREAM.topic.asks,
  dockSlot: 'conversation.input.dock',
  routePath: Object.freeze({ connect: SEAM_TARGETS.route.connect, cancel: SEAM_TARGETS.route.cancel, retry: SEAM_TARGETS.route.retry, pairing: SEAM_TARGETS.route.pairing }),
  /** The K3a routes the follow-up withdraws: the sidebar never posts to them. */
  withdrawn: Object.freeze(['/api/fishball/connect', '/api/fishball/connect/cancel']),
  refusedHook: 'data-fishball-target-refused',
  urlHook: 'data-fishball-target-url',
  detailsHook: 'data-fishball-target-details',
  /** Review amendment (d): Connect answering needs-configuration is a refusal with this sentence (and the code). */
  needsConfiguration: Object.freeze({ outcome: 'needs-configuration', en: 'Connect needs configuration in Fishball settings first.', zh: '请先在 Fishball 设置中完成连接配置。' }),
  pairingFailedHook: 'data-fishball-pairing-failed',
  settingsHook: 'data-fishball-target-settings',
  alertRole: 'alert',
  coreBundle: 'fishball-core',
  pluginsPanel: 'plugins',
  approvalOutcome: 'approval-url',
  approvalLabel: Object.freeze({ en: 'Open the approval page', zh: '打开授权页面' }),
  newTab: '_blank',
  dialogRoles: Object.freeze(['dialog', 'alertdialog']),
  overlaySlot: 'shell.overlay',
  ownerProps: Object.freeze({ wide: true }),
  rowExpanded: 'aria-expanded',
})

/** Requirement E and the follow-up: the ask card. */
export const ASK_SOURCE = Object.freeze({
  slot: SIDEBAR.dockSlot,
  answerPath: '/api/fishball/asks/answer',
  eventsTopic: PAGE_STREAM.topic.asks,
  bodyKeys: Object.freeze(['handle', 'choice', 'text']),
  /** Review amendment (f): the source is a visually hidden prefix and the name as text. */
  sourcePrefix: Object.freeze({ en: 'DSH:', zh: 'DSH：' }),
  unnamed: FRAME.placeholder.unnamed,
  expired: 'expired',
})

/** Requirement D: what the conversation input dock no longer holds. */
export const DOCK_GONE = Object.freeze({ stripId: 'fishball-strip', pairingHook: 'data-fishball-pairing', pairingStream: 'api/fishball/pairing' })

/**
 * The follow-up's answers to an action: [label, answer, refused?, code shown?]. `answer` is what the
 * page's fetch answers (`'reject'` = no answer at all). 200 with `ok: false` is a refusal too.
 */
export const ANSWERS = Object.freeze([
  ['200 ok', Object.freeze({ status: SEAM_TARGETS.http.ok, json: Object.freeze({ ok: true }) }), false, null],
  ['200 ok:false', Object.freeze({ status: SEAM_TARGETS.http.ok, json: Object.freeze({ ok: false, code: 'fbtest-refusal-200' }) }), true, 'fbtest-refusal-200'],
  ['400', Object.freeze({ status: SEAM_TARGETS.http.badRequest, json: Object.freeze({ ok: false, code: 'invalid-arguments' }) }), true, 'invalid-arguments'],
  ['404', Object.freeze({ status: SEAM_TARGETS.http.notFound, json: Object.freeze({ ok: false, code: SEAM_TARGETS.refusal.unknownTarget }) }), true, SEAM_TARGETS.refusal.unknownTarget],
  ['409', Object.freeze({ status: SEAM_TARGETS.http.conflict, json: Object.freeze({ ok: false, code: 'fbtest-conflict' }) }), true, 'fbtest-conflict'],
  ['503', Object.freeze({ status: SEAM_TARGETS.http.unavailable, json: Object.freeze({ code: SEAM_TARGETS.unavailableCode }) }), true, SEAM_TARGETS.unavailableCode],
  ['409 no code', Object.freeze({ status: SEAM_TARGETS.http.conflict, text: '' }), true, null],
  ['network', 'reject', true, null],
])
export const answerOf = (label) => ANSWERS.find(([l]) => l === label)

/** Test data only. */
export const FIXTURE = Object.freeze({
  epoch: 'e-aaaaaaaaaaaaaaaa',
  ids: Object.freeze(['t-aaaaaaaaaaaaaaaa', 't-bbbbbbbbbbbbbbbb', 't-cccccccccccccccc']),
  url: (i) => `https://fbtest-target-${i}.example.test/api/agent/mcp`,
  names: Object.freeze({
    plain: 'Office-DSH',
    suffixed: 'Office-DSH (2)',
    unicode: '办公室-DSH',
    markup: '<b>x</b>',
    long: 'L'.repeat(200) + '-DSH',
    empty: '',
  }),
  zones: Object.freeze(['Pacific/Auckland', 'America/Los_Angeles']),
  approvalUrl: 'https://dsh.test/api/agent/oauth/authorize?state=fbtest-multi',
  unsafeApprovalUrl: 'javascript:alert(1)',
  unsafeScheme: 'javascript',
  unknownState: 'fbtest-unknown-state',
  unknownLine: 'fbtest-unknown-line',
  unknownBrand: 'orca',
  otherCaseBrand: 'DeepSeek',
  code: 'fbtest-code-17',
  many: 40,
  tools: 3,
  handles: Object.freeze(['fbtest-handle-a', 'fbtest-handle-b']),
  approvalId: 'ap-1',
  managerSession: 'fbtest-fishball',
  mountKey: 'fbtest-targets-',
  /** A sentence is longer than its code by at least this many characters (follow-up: "a sentence, the code appended"). */
  sentenceMargin: 10,
})

export const plain = (v) => JSON.parse(JSON.stringify(v))

/** fishball-ui's frame and pairing views, bound to the current DSH (only their exports are read). */
export async function viewModule() {
  const view = await importBound(SUBJECT.view)
  const pairing = await importBound(SUBJECT.pairing)
  for (const name of Object.values(SUBJECT.exports)) assert.notEqual(view[name], undefined, `fishball-ui src/status/index.js exports no ${name}`)
  assert.equal(typeof pairing[SUBJECT.pairingExport], 'function', 'fishball-ui src/pairing/index.js exports no pairingView')
  return { targetsView: view[SUBJECT.exports.view], TARGET_LINE: view[SUBJECT.exports.line], STATUS_TEXT: view[SUBJECT.exports.text], pairingView: pairing[SUBJECT.pairingExport] }
}

/** One core `TargetView` (targets.d.ts); `name` defaults to a unique name per index. */
export function targetView(i, overrides = {}) {
  const name = Object.hasOwn(overrides, 'name') ? overrides.name : `${FIXTURE.names.plain}-${i}`
  return {
    targetId: FIXTURE.ids[i] ?? `t-fbtest${String(i).padStart(10, 'a')}`,
    endpointEpoch: FIXTURE.epoch,
    serverName: name,
    name,
    kind: SEAM_TARGETS.kind.remote,
    url: FIXTURE.url(i),
    order: i + 1,
    duplicateSuffix: null,
    state: SEAM_TARGETS.state.connected,
    connecting: false,
    link: { state: SEAM_STATUS.link.connected, code: null },
    connect: null,
    line: { kind: SEAM_STATUS.link.connected, code: null },
    control: null,
    pairing: coreView(PAIR_STATE.paired),
    identity: SEAM_TARGETS.identity.live,
    contributedTools: FIXTURE.tools,
    removable: true,
    urlEditable: true,
    ...overrides,
  }
}

/** Core's status snapshot with the targets beside the global members (SEAM_TARGETS' comment). */
export const snapshotOf = (targets, { fishball = SEAM_STATUS.fishball.on, guards = null, set = null, brand } = {}) => ({
  fishball, guards, set, targets: { version: SEAM_TARGETS.snapshotVersion, targets }, ...(brand === undefined ? {} : { brand }),
})

/** One frame from the real view: `targets` in `lang`, in the first fixture zone. */
export async function frameOf(targets, lang = FRAME.langs[0], globals) {
  return (await viewModule()).targetsView(snapshotOf(targets, globals), lang, FIXTURE.zones[0])
}
