/**
 * Values of the core + ui patch rows. Sources: fishball-ui's interface (F-UI, relayed 2026-11-16) as
 * re-baselined by R-FIX-FUI F2 (Q-G2 = A, the user 2026-11-18: the UI guard rows and the notice row live in
 * core's patch) and 117cb2a2 (fishball-ui is core's ./ui/ component; its rows are core's plain rows), F-WIRE
 * (eight UI guard rows, ui-model-selection last: "Hide it. Only core's settings choose the model"), E-FIX-3
 * B7 (DSH's Preview Notice only in a hosted child), fishball-shared's ui-seam and core's contracts. Copied
 * from the old test/v3/fishball-ui/package constants (no implementation read).
 */
import path from 'node:path'

export const ROWS = Object.freeze({
  /** The UI-only guard rows, in this order, each a bare {id, disabled: true}. */
  guards: Object.freeze(['ui-subagent', 'ui-schedule', 'ui-permission', 'ui-agent-preset', 'entry-customization', 'ui-open-in-app', 'ui-sidebar-terminal', 'ui-model-selection']),
  /** The UI component rows core's patch inserts, id → module file inside fishball-ui. */
  component: Object.freeze({ 'fishball-ui': 'index.js', 'fishball-page': path.join('fishball-page', 'index.js'), 'fishball-recommend-plugins': path.join('fishball-recommend-plugins', 'index.js') }),
  /** The withdrawn row (117cb2a2: the client logs core-missing; no row). */
  coreMissing: 'fishball-ui-core-missing',
  /** fishball-ui's own sub-packages, folder → package name, each with its own ./client. */
  subPackages: Object.freeze({ 'fishball-page': 'fishball-page', 'fishball-recommend-plugins': 'fishball-recommend-plugins' }),
})
export const CORE_SPLIT = Object.freeze({
  guards: Object.freeze(['schedule', 'open-in-app', 'terminal-controller', 'dsh-instance']),
  shippedPresets: Object.freeze(['preset-standard', 'preset-ptc', 'preset-cordis', 'preset-minimal']),
  ownPreset: 'preset-fishball',
  reorderRow: Object.freeze({ id: 'fishball-core-guards', file: path.join('src', 'guards', 'row.js') }),
  /** Files core no longer has (the UI lives in core's ui/ folder since 117cb2a2). */
  gone: Object.freeze(['client.asks.js', path.join('src', 'recommended.js')]),
  movedExport: 'UI_SEAM',
})
/** EP over profileContext.startedBundles (R-FIX-FUI F2): the UI guard rows read the same for every list. */
export const STARTED = Object.freeze([
  ['empty list (BVA: no bundle)', Object.freeze([])],
  ['fishball-ui alone', Object.freeze(['fishball-ui'])],
  ['fishball-core alone', Object.freeze(['fishball-core'])],
  ['ui among others', Object.freeze(['fbtest-other', 'fishball-core', 'fishball-ui'])],
  ['a near name (fishball-ui-x)', Object.freeze(['fishball-ui-x'])],
])
export const NOTICE = Object.freeze({
  row: 'ui-settings-general', field: 'welcomeNoticeVersion', version: '2026-09-28.1', childRow: 'dsh-instance-child', ownerValue: 'fbtest-owner-ack',
  /** DSH's own copy version (dsh-client-ui-settings-models WELCOME_NOTICE_VERSION), read again as a drift check. */
  source: Object.freeze({ pkg: 'dsh-client-ui-settings-models', file: path.join('lib', 'client.js'), pattern: /WELCOME_NOTICE_VERSION\s*=\s*["'`]([^"'`]+)["'`]/ }),
})
const childInsert = Object.freeze({ insert: Object.freeze([Object.freeze({ id: NOTICE.childRow, name: 'fbtest-child-row', config: Object.freeze({ targetUrl: '' }) })]) })
/** EP over profileContext.overlays: [label, overlays, inserts the child row]. */
export const OVERLAYS = Object.freeze([
  ['no overlay (BVA: empty list)', Object.freeze([]), false],
  ['one overlay inserting dsh-instance-child (the hosted launch)', Object.freeze([childInsert]), true],
  ['the child row inserted after other patches, beside another inserted row', Object.freeze([
    Object.freeze({ id: 'hmr', disabled: true }),
    Object.freeze({ insert: Object.freeze([Object.freeze({ id: 'fbtest-lifecycle', name: 'fbtest-lifecycle' }), ...childInsert.insert]) }),
  ]), true],
  ['an overlay inserting other rows only', Object.freeze([Object.freeze({ insert: Object.freeze([Object.freeze({ id: 'fbtest-other-row', name: 'fbtest-other-row' })]) })]), false],
  ['an overlay inserting a near id (dsh-instance-child-x)', Object.freeze([Object.freeze({ insert: Object.freeze([Object.freeze({ id: NOTICE.childRow + '-x', name: 'fbtest-x' })]) })]), false],
  ['an overlay that patches (does not insert) a row with that id', Object.freeze([Object.freeze({ id: NOTICE.childRow, disabled: false })]), false],
])
/** fishball-shared's ui-seam (UI-UC-07 E1): SEAM_STATUS key → [core contracts export, member]. */
export const SEAM_DRIFT = Object.freeze({ link: Object.freeze(['LINK', 'state']), connect: Object.freeze(['CONNECT', 'state']) })
/** Core's browser entry and the one chunk it loads (UI-UC-08). */
export const CORE_CLIENT = Object.freeze({ file: 'client.js', moduleId: 'fishball-core', chunks: Object.freeze(['./client.settings.js']), partName: (file) => 'fbtest stand-in part ' + file, base: 'http://fishball-core.test/' })
