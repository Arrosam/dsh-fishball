/**
 * MULTI-3 vocabulary (the sidebar DSH targets, the per-target strip frame, the ask card's source and
 * handle, the restyled narrow navigation). Sources, and only these: the MULTI-3 requirements A–G the
 * lead relayed (2026-11-18), its follow-up of the same day (MULTI-0's review fixes 1249c517: the
 * `SEAM_TARGETS.http` statuses, the withdrawn K3a Connect routes, the empty state's settings button),
 * PLAN-MULTI (docs/planning/v3-multi-dsh.md §3, §5, §6.4, Q01–Q12), the frozen contracts
 * (packages/core/contracts/targets.d.ts, ask-card.d.ts, ui.d.ts) and fishball-shared's ui-seam
 * (`SEAM_TARGETS`, `SEAM_STATUS`, imported, never restated). No value is read from the
 * implementation, which these rows never read.
 */
import path from 'node:path'
import { SEAM_STATUS, SEAM_TARGETS } from '../../../../packages/shared/ui-seam.js'
import { V3 } from '../../contract/package-boundaries/constants.mjs'
import { UI_CARD } from '../../fishball-core/status/constants.mjs'

export { SEAM_STATUS, SEAM_TARGETS }

/** Requirement B: the pure frame module and its exports. */
export const SUBJECT = Object.freeze({
  view: path.join(V3.ui.dir, 'src', 'status', 'index.js'),
  exports: Object.freeze({ view: 'targetsView', line: 'TARGET_LINE', text: 'STATUS_TEXT' }),
  pairing: path.join(V3.ui.dir, 'src', 'pairing', 'index.js'),
  pairingExport: 'pairingView',
})

/** Requirement B: the frame's shape and its words. */
export const FRAME = Object.freeze({
  keys: Object.freeze(['on', 'title', 'empty', 'notices', 'targets', 'words', 'brandStyle']),
  // `sessions`: the running managed sessions under the row (sessions-cases.mjs), additive.
  targetKeys: Object.freeze(['targetId', 'kind', 'name', 'placeholder', 'state', 'badge', 'url', 'lines', 'control', 'retry', 'pairing', 'sessions']),
  notice: Object.freeze({ off: SEAM_STATUS.fishball.off, guards: SEAM_STATUS.guards.overridden, set: SEAM_STATUS.set.incomplete }),
  /**
   * The line kinds, in their order (`contributed-tools` only for an integer count, zero included).
   * Review amendment (b): no `url` line; the URL is the view's `url` field, drawn in details in
   * `[data-fishball-target-url]`.
   */
  lineOrder: Object.freeze(['why', 'contributed-tools', 'identity']),
  /** Q01's placeholders, chosen by URL (review amendment (a), SEAM_TARGETS.placeholder): no URL → unset, a URL → unnamed, whatever the state. */
  placeholder: Object.freeze({
    unset: Object.freeze({ en: 'Not set', zh: '未设置' }),
    unnamed: Object.freeze({ en: 'Name unavailable', zh: '名字未知' }),
  }),
  /** The empty list text starts with this (requirement B: "No DSH target yet…"). */
  emptyStart: Object.freeze({ en: 'No DSH target yet' }),
  /** The control labels: the strip's Connect / Cancel copy, unchanged (UI-POLISH-F SPEC §2). */
  control: Object.freeze({ connect: Object.freeze({ en: 'Connect', zh: '连接' }), cancel: Object.freeze({ en: 'Cancel', zh: '取消' }) }),
  langs: Object.freeze(['en', 'zh']),
})

/**
 * The known words of `TargetView.line.kind` the frame translates: the kinds core's `stripLine` emits,
 * as UI-POLISH-F SPEC §2's table lists them (the target's line is exactly that rule's line,
 * targets.d.ts `line`); `fishball-off` is a notice now, not a target line. Core's rule never emits
 * Connect `authorized` as a line kind (the lead, 2026-11-18), so it is an unlisted word: shown verbatim.
 */
export const KNOWN_LINE = Object.freeze(Object.keys(UI_CARD.table).filter((kind) => kind !== SEAM_STATUS.fishball.off))

/** Requirement C and the follow-up: the sidebar, its routes and the ask answer route. */
export const SIDEBAR = Object.freeze({
  slot: 'sidebar.workspaces',
  /** DSH's own workspace browser registers at 0; fishball-page's fail-closed Empty shadow at -1. */
  dshPriority: 0,
  emptyShadowPriority: -1,
  pageMark: 'data-fishball-page',
  streamPath: '/api/fishball/strip',
  route: SEAM_TARGETS.route,
  routePath: Object.freeze({
    connect: SEAM_TARGETS.route.connect, cancel: SEAM_TARGETS.route.cancel, retry: SEAM_TARGETS.route.retry, pairing: SEAM_TARGETS.route.pairing,
  }),
  /** The K3a routes the follow-up withdraws: the sidebar never posts to them. */
  withdrawn: Object.freeze(['/api/fishball/connect', '/api/fishball/connect/cancel']),
  refusedHook: 'data-fishball-target-refused',
  urlHook: 'data-fishball-target-url',
  /** Review amendment (d): Connect answering needs-configuration is a refusal with this sentence (and the code). */
  needsConfiguration: Object.freeze({ outcome: 'needs-configuration', en: 'Connect needs configuration in Fishball settings first.', zh: '请先在 Fishball 设置中完成连接配置。' }),
  pairingFailedHook: 'data-fishball-pairing-failed',
  settingsHook: 'data-fishball-target-settings',
  alertRole: 'alert',
  settingsLabel: Object.freeze({ en: 'Fishball settings', zh: 'Fishball 设置' }),
  coreBundle: 'fishball-core',
  pluginsPanel: 'plugins',
  approvalOutcome: 'approval-url',
  approvalLabel: Object.freeze({ en: 'Open the approval page', zh: '打开授权页面' }),
  dialogRoles: Object.freeze(['dialog', 'alertdialog']),
  overlaySlot: 'shell.overlay',
  ownerProps: Object.freeze({ wide: true }),
})

/** Requirement E and the follow-up: the ask card. */
export const ASK = Object.freeze({
  slot: 'conversation.input.dock',
  answerPath: '/api/fishball/asks/answer',
  eventsPath: '/api/fishball/asks/events',
  hook: 'data-fishball-ask',
  choiceHook: 'data-fishball-ask-choice',
  bodyKeys: Object.freeze(['handle', 'choice', 'text']),
  /** Review amendment (f): the badge word, lowercase in en. */
  voided: Object.freeze({ en: 'voided', zh: '已作废' }),
  /** Review amendment (f): the source is a visually hidden prefix and the name as text. */
  sourcePrefix: Object.freeze({ en: 'DSH:', zh: 'DSH：' }),
  unnamed: FRAME.placeholder.unnamed,
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
  unknownState: 'fbtest-unknown-state',
  unknownLine: 'fbtest-unknown-line',
  code: 'fbtest-code-17',
  many: 40,
  handles: Object.freeze(['fbtest-handle-a', 'fbtest-handle-b']),
  approvalId: 'ap-1',
  reason: 'fbtest reason text',
  managerSession: 'fbtest-fishball',
  mountKey: 'fbtest-targets-',
})

/** Why a row of an earlier task no longer runs (one reason per withdrawn behaviour). */
export const WITHDRAWN = Object.freeze({
  strip: 'withdrawn by MULTI-3 (D03, requirement D: no chat-top status card; the per-target status is in the sidebar target list)',
  pairingCard: 'withdrawn by MULTI-3 (requirement D: the pairing dock card is replaced by pairing inside target details)',
  pairingRoute: 'withdrawn by MULTI-3 (requirement D; the lead 2026-11-18): the pairing routes /api/fishball/pairing and /choose are removed; pairing posts per target to /api/fishball/targets/pairing',
  connectRoutes: 'withdrawn by MULTI-0 review S6 (1249c517): /api/fishball/connect and /connect/cancel are withdrawn; the sidebar uses /api/fishball/targets/*',
  needsCore: 'MULTI-1 (core serves /api/fishball/targets/* per SEAM_TARGETS.http; not on dev/v3-multi-3 until integration)',
  tray: 'withdrawn by MULTI-3 (requirement F, PLAN-MULTI §6.4: no Fishball tray; the narrow bar is DSH\'s real sidebar restyled)',
})
