/**
 * Vocabulary for the F-SETTINGS cases (README.md in this folder): core's own settings page on DSH's
 * Plugins page, its write-only token field and Connect control, the two entries on the Fishball page,
 * the `view=settings` continuation, and the Node Connect route.
 *
 * Sources, and only these: the user's words of 2026-11-16 (requirements 1.34 item 4: "hosted
 * setting去掉，fishball的setting留在fishball里的fishball core插件的设置页内。可以在fishball对外暴露的UI中
 * 打开dsh的自带设置，或者直接跳转到fishball core的设置。"), the F-SETTINGS acceptance criteria relayed by
 * Fishball (2026-11-16), R-FB-03 / R-FB-02 as amended by 1.33 and 1.34, design §5.4 and §6.3a, the
 * frozen contracts `packages/core/contracts/{constants.js,connect.d.ts,link.d.ts,ui.d.ts}`, and DSH's
 * public client contracts on both SDKs (dsh-client-ui-plugin-manager slot-contract.d.ts,
 * dsh-client-ui-settings config-form.d.ts, dsh-client-ui-conversation slots.d.ts). Every product
 * value the contracts own is imported from them, never restated. No value comes from F-SETTINGS'
 * implementation (packages/core/client.settings.js, packages/core/src/settings/**), which these cases
 * never read.
 */
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { REPO } from '../../../support/constants.mjs'
import { CONNECT, GUARDS, HOSTED_IMPORT, TARGETS } from '../../../../packages/core/contracts/constants.js'
import { SEAM_STATUS, SEAM_TARGETS } from '../../../../packages/shared/ui-seam.js'
import { SDK } from '../../contract/package-boundaries/constants.mjs'

export { CONNECT, HOSTED_IMPORT }

/**
 * F-FIX-3 (Fishball, 2026-11-17): a throw behind the Connect routes is logged as one
 * `warn(LINK_SAVE.text.failed, CONNECT_ROUTE.connectFailed, code)` on `ctx.logger(LINK_SAVE.logger)`.
 * The format, the reason and the logger name are imported from their owners, as the requirement
 * says, never restated. `BEGIN_VIA` is the route-only begin key (link/connect.js exports it for the
 * route alone): a press whose page origin picks a web callback calls `connect[BEGIN_VIA](via)`.
 */
export { LINK_SAVE } from '../../../../packages/core/src/link/constants.js'
// MULTI-0 withdrew `/api/fishball/connect` and its module (`registerSettingsRoutes`); its log
// vocabulary may be gone with it, so it is read through a namespace (a missing export fails only
// the rows that use it). BEGIN_VIA stays link/connect.js's.
import * as SETTINGS_CONSTANTS from '../../../../packages/core/src/settings/constants.js'
export const CONNECT_ROUTE = SETTINGS_CONSTANTS.CONNECT_ROUTE
export { BEGIN_VIA } from '../../../../packages/core/src/link/connect.js'

/**
 * The files under test: core's browser entry, its settings chunk, and the Node route module; and,
 * since F-UI (interface items 8–9), fishball-ui's browser entry, whose entries chunk holds the two
 * Fishball-page entries and the `view=settings` continuation that were core's.
 */
export const SUBJECT = Object.freeze({
  coreClient: path.join(REPO, 'packages', 'core', 'client.js'),
  uiClient: path.join(REPO, 'packages', 'fishball-ui', 'client.js'),
  entriesChunkName: 'client.entries.js',
  /** The entries' locale namespace (F-UI interface item 8). */
  entriesLocale: 'fishball-ui-entries',
  chunk: path.join(REPO, 'packages', 'core', 'client.settings.js'),
  chunkName: 'client.settings.js',
  /** The chunk's one export (requirement 10). */
  pluginExport: 'settingsPlugin',
  route: process.env.FBTEST_F_SETTINGS_ROUTE ?? path.join(REPO, 'packages', 'core', 'src', 'settings', 'index.js'),
  routeExport: 'registerSettingsRoutes',
  /** The strip's Cancel route, from the same module (F-WIRE; F-FIX-3 logs its throws). */
  cancelExport: 'registerConnectCancelRoute',
  /** The target-precedence rule, pure, from the same module (Fishball's decision, 2026-11-16). */
  targetExports: Object.freeze({ effective: 'effectiveTarget', hasInstance: 'hasInstanceTarget' }),
})

/**
 * Core's identities on DSH's Plugins page. Equal strings, separate meanings: the bundle's package
 * name (the `plugins.bundle.config` key and `openBundle`'s argument, GUARDS.bundleName) and the
 * profile row whose settings namespace the page edits (requirement 1: "core's row `fishball-core`").
 */
export const CORE = Object.freeze({
  bundle: GUARDS.bundleName,
  namespace: 'fishball-core',
  /** The browser module id both core scripts register under (requirement 10). */
  moduleId: GUARDS.bundleName,
})
/** fishball-ui's browser module id (F-UI interface item 8); the entries are its part since F-UI. */
export const UI = Object.freeze({ moduleId: 'fishball-ui' })
/** Which clients a scripted page loads: both (a Fishball DSH with fishball-ui), or core's alone. */
export const CLIENTS = Object.freeze({ both: 'both', coreOnly: 'core-only', uiOnly: 'ui-only' })
/** The header-action ids and orders of the two entries (F-UI interface item 8, unchanged from F-SETTINGS). */
export const ENTRY_ACTION = Object.freeze({
  fishball: Object.freeze({ id: 'fishball-core-settings', order: 90 }),
  dsh: Object.freeze({ id: 'fishball-dsh-settings', order: 91 }),
})

/** The child-side namespace and field the instance writes the hosted target to (HOSTED_IMPORT). */
export const INSTANCE_TARGET = HOSTED_IMPORT.targetSetting

/**
 * The form's settings (requirement 2), in their required order, with the path each one has inside
 * the nested namespace value. The token field is not a setting: it writes a credential.
 */
const FIELD = (name) => Object.freeze({ name, path: Object.freeze(name.split('.')) })
export const FIELDS = Object.freeze({
  url: FIELD('target.url'),
  metadata: FIELD(CONNECT.setting),
  id: FIELD('identity.id'),
  name: FIELD('identity.name'),
})
/** The token field's marker value (the relayed marker list). */
export const TOKEN_FIELD = 'token'
/** Requirement 2: field order on the page, by marker value. */
export const FIELD_ORDER = Object.freeze([FIELDS.url.name, TOKEN_FIELD, FIELDS.metadata.name, FIELDS.id.name, FIELDS.name.name])

/** The observable markers F-SETTINGS exposes (relayed 2026-11-16). */
export const MARK = Object.freeze({
  page: 'data-fishball-core-settings',
  field: 'data-fishball-setting',
  instanceTarget: 'data-fishball-instance-target',
  connect: 'data-fishball-connect',
  connectState: 'data-fishball-connect-state',
  connectBegin: 'data-fishball-connect-begin',
  entry: 'data-fishball-settings-entry',
  entries: Object.freeze({ fishball: 'fishball', dsh: 'dsh' }),
  alertRole: 'alert',
  /** The Connect state word for "no usable answer" (requirement 4). */
  unavailable: 'unavailable',
  /** Markers of the REMOVED slim panel (requirement 9): none may appear any more. */
  removed: Object.freeze(['data-fishball-settings', 'data-fishball-settings-readonly', 'data-fishball-settings-open']),
})

/** DSH slots and services the page meets (DSH's own contracts, both SDKs). */
export const DSH = Object.freeze({
  slot: Object.freeze({
    bundleConfig: 'plugins.bundle.config',
    headerActions: 'conversation.session.header.actions',
    main: 'main',
  }),
  /** `PluginConfigViewProps.view`. */
  view: Object.freeze({ summary: 'summary', page: 'page' }),
  /** The Plugins page's panel id (dsh-client-ui-plugin-manager PANEL_ID). */
  pluginsPanel: 'plugins',
  /** DSH's native Settings launcher as fishball-page portals it (requirement 7). */
  launcherClass: 'fishball-settings-launcher',
  launcherSelector: '.fishball-settings-launcher',
  /** fishball-page's ready mark on `<html>` (requirement 8). */
  sessionMark: 'data-fishball-session',
  service: Object.freeze({
    navigation: 'pluginNavigation',
    instance: GUARDS.services.instance,
    /** Requirement 9: the withdrawn extension point. */
    removedSections: 'fishballSettingsSections',
  }),
  /** The services a Fishball page offers (DSH's own composition); pluginNavigation is optional. */
  services: Object.freeze(['slots', 'layout', 'locale', 'configForms', 'remote', 'remote.credentials']),
  /** The credentials Remote namespace as its own service (dsh-api-gateway `remote.<namespace>`). */
  remoteCredentials: 'remote.credentials',
  /**
   * E-FIX-3 (B5): the session Remote namespace as its own service, the Remote service's own name
   * and namespace member, and the `property` of the tracker Cordis's `Service` constructor gives
   * every service (cordis lib/index.js, both SDKs: `{associate: name, property: 'ctx'}`).
   */
  remoteSession: 'remote.session',
  remoteName: 'remote',
  sessionNamespace: 'session',
  trackerProperty: 'ctx',
  /** The removed slim panel's `main` slot key (requirement 9). */
  removedPanelKey: 'fishball-settings',
  /** ConfigFormSnapshot.status. */
  status: Object.freeze({ ready: 'ready', unavailable: 'unavailable', loading: 'loading' }),
  op: Object.freeze({ set: 'set', unset: 'unset' }),
  locales: Object.freeze(['en', 'zh']),
  focus: 'focus',
})

/** Requirement 4 and 5: the Connect route. */
export const ROUTE = Object.freeze({
  path: '/api/fishball/connect',
  /** The page requests it document-relative (requirement 4). */
  relative: 'api/fishball/connect',
  methods: Object.freeze(['GET', 'POST']),
  requestBody: 'buffered',
  get: 'GET',
  post: 'POST',
  /** The strip's Cancel route (F-WIRE): POST only, answering the status after `cancel()`. */
  cancelPath: '/api/fishball/connect/cancel',
  credentials: 'same-origin',
  cache: 'no-store',
  unavailable: Object.freeze({ status: 503, body: Object.freeze({ code: 'CONNECT_UNAVAILABLE' }) }),
  ok: 200,
  cacheControl: 'cache-control',
  noStore: 'no-store',
  contentType: 'content-type',
  json: 'application/json',
  /** `fishballInstance.apiVersion` the route accepts (requirement 5). */
  apiVersion: 1,
})

/** `ConnectBegin.outcome` words (connect.d.ts). */
export const OUTCOME = Object.freeze({ authorized: 'authorized', approval: 'approval-url', configuration: 'needs-configuration' })
/** `window.open` arguments for an approval URL (requirement 4). */
export const OPEN = Object.freeze({ target: '_blank', features: 'noopener' })

/** Requirement 8: the continuation fragment. */
export const CONTINUATION = Object.freeze({ settings: '#view=settings' })

/** Test data (fixtures only; never product values). */
export const FIXTURE = Object.freeze({
  /** Document bases: at the origin root, and under a sub-path (document-relative routes follow it). */
  base: 'http://fishball.test/',
  subBase: 'http://fishball.test/child/page/',
  targetUrl: 'https://x/api/agent/mcp',
  storedUrl: 'https://stored.test/api/agent/mcp',
  metadataUrl: 'https://owner.test/fishball/client.json',
  storedMetadataUrl: 'https://owner.test/old/client.json',
  coreId: 'fbtest-core',
  coreName: 'Navigator',
  storedName: 'Old name',
  instanceUrl: 'https://host.test/api/agent/mcp',
  /** A second instance value, for "the instance's value changes". */
  otherInstanceUrl: 'https://host2.test/api/agent/mcp',
  approvalUrl: 'https://dsh.test/api/agent/oauth/authorize?state=fbtest',
  revision: 7,
  /** A wrong but well-formed status word (the "any other answer" partition). */
  bogusState: 'fbtest-not-a-state',
  nonJson: '<html>not json</html>',
  routeError: 'fbtest route failure detail',
})

/**
 * E-FIX-3 (B5, relayed by Fishball 2026-11-17): the "Fishball's model" select of core's settings
 * page over DSH's catalog (`remote.session.modelCatalog()` → `{ok, value: {groups: [{id, name,
 * models: [{id, name, reasoning?: {efforts: [{id, name}]}}]}]}}`, both SDKs). The page lists one
 * option per model, or one per reasoning effort of a model that has efforts. The words are the
 * requirement's own (`none` was relayed in English only, so only `failed` is checked in zh).
 */
export const MODEL_SELECT = Object.freeze({
  failed: Object.freeze({ en: 'The models could not be read.', zh: '无法读取模型。' }),
  none: Object.freeze({ en: 'No model is configured in this DSH yet.' }),
  select: 'select',
  option: 'option',
  /** The base commit the mutating-test check loads the chunk from (the commit before E-FIX-3). */
  baseRef: 'c4845000',
  baseChunk: 'packages/core/client.settings.js',
  tempPrefix: 'fbtest-efix3-base-',
})
const model = (id, name, efforts) => Object.freeze({ id, name, ...(efforts ? { reasoning: Object.freeze({ efforts: Object.freeze(efforts.map(([eid, ename]) => Object.freeze({ id: eid, name: ename }))) }) } : {}) })
const group = (id, name, models) => Object.freeze({ id, name, models: Object.freeze(models) })
/** Catalog fixtures (test data): names are unique substrings so an option is told apart by its text. */
export const CATALOG = Object.freeze({
  /** BVA: no group at all. */
  empty: Object.freeze({ groups: Object.freeze([]) }),
  /** BVA: one group with one model, no efforts → exactly one model option. */
  one: Object.freeze({ groups: Object.freeze([group('fbtest-p1', 'Fbtest Provider One', [model('m-solo', 'Fbtest Solo Model')])]) }),
  /** EP: two groups, plain models and a model with two reasoning efforts. */
  mixed: Object.freeze({
    groups: Object.freeze([
      group('fbtest-p1', 'Fbtest Provider One', [model('m-alpha', 'Fbtest Alpha Model'), model('m-beta', 'Fbtest Beta Model')]),
      group('fbtest-p2', 'Fbtest Provider Two', [model('m-think', 'Fbtest Thinker Model', [['e-quick', 'Fbtest Quick Effort'], ['e-deep', 'Fbtest Deep Effort']])]),
    ]),
  }),
})
/** What a test makes `modelCatalog()` do: answer the catalog, answer `{ok:false}`, or reject. */
export const CATALOG_ANSWER = Object.freeze({ ok: 'ok', refused: 'refused', rejects: 'rejects' })

/** A token value made fresh per call, so no secret is a literal of this folder. */
export const freshToken = () => 'fbtest-token-' + randomBytes(18).toString('base64url')

/** Harness waits only; never a product oracle. */
export const HARNESS = Object.freeze({ settleRounds: 80, waitMs: 1500, pollMs: 15 })

export const runtimeOf = (sdk) => path.join(SDK.versionsDir, sdk, 'node_modules')
export const frontendAssetsOf = (sdk) => path.join(SDK.versionsDir, sdk, 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist', 'assets')
export const CORDIS_ENTRY = path.join('@deepseek-ai', 'cordis', 'lib', 'index.js')
/** Cordis fiber states the page reads (cordis lib/types/fiber.d.ts, both SDKs). */
export const FIBER = Object.freeze({ failed: 3 })
export const STATUS_EVENT = 'internal/status'

/**
 * Why rows elsewhere that assert the removed slim panel, its Read Only line and Open Plugins link,
 * or the `fishballSettingsSections` extension point are withdrawn (requirement 9). One reason, so
 * every withdrawn row cites the same decision.
 */
export const WITHDRAWN = 'withdrawn: requirements 1.34 item 4 (fishball-hosted-settings removed; core\'s settings are its own Plugins-page settings) and R-HOST-11 withdrawn; F-SETTINGS, test/v3/fishball-core/settings'

/** UI-POLISH-F (.runtime/reports/ui-polish-f/SPEC.md §5, §7): the header entries' accessible names and the Connect card. */
export const POLISH_ENTRIES = Object.freeze({
  hook: 'data-fishball-settings-entry',
  labels: Object.freeze({
    en: Object.freeze({ fishball: 'Fishball settings', dsh: 'DSH settings' }),
    zh: Object.freeze({ fishball: 'Fishball 设置', dsh: 'DSH 设置' }),
  }),
  side: 'bottom',
  haspopup: 'dialog',
  /**
   * Glyphs (SPEC §5, revised): sliders for Fishball settings, gear for DSH settings. DSH's icon
   * exports name them (dsh-web-frontend primitives: IconSlidersTwoOutline*, IconSettingsOutline*).
   */
  glyph: Object.freeze({ fishball: /^IconSliders/, dsh: /^IconSettings/ }),
})

/** SPEC §7: the Connect section's visible heading (the existing connectTitle text) and its button's look. */
export const POLISH_CONNECT = Object.freeze({
  section: 'section', heading: Object.freeze({ en: 'Connect', zh: '连接' }), headingTag: 'h3',
  /** SPEC §7 (revised): the Connect button is primary while the state is needs-authorization or failed, outline otherwise. */
  primaryIn: Object.freeze([CONNECT.state.needsAuthorization, CONNECT.state.failed]), primary: 'primary', otherwise: 'outline',
})

/**
 * MULTI-1: core's settings page as a list of targets (PLAN-MULTI §3.1 "Core settings supports
 * add/remove/edit URL, per-target token entry, Connect/cancel/retry …, all actions address stable
 * targetId"; SEAM_TARGETS.route). The markers are the ones the implementer relayed (2026-11-18); the
 * page reads and acts only through SEAM_TARGETS' routes, document-relative.
 */
const SEAM_TARGETS_CONTROL = SEAM_STATUS.control
const relative = (p) => p.replace(/^\//, '')
export const MULTI_SET = Object.freeze({
  snapshotVersion: SEAM_TARGETS.snapshotVersion,
  route: SEAM_TARGETS.route,
  http: SEAM_TARGETS.http,
  refusal: SEAM_TARGETS.refusal,
  /** The list route first (GET), then every POST route. */
  relative: Object.freeze([SEAM_TARGETS.route.list, SEAM_TARGETS.route.connect, SEAM_TARGETS.route.cancel, SEAM_TARGETS.route.retry, SEAM_TARGETS.route.pairing, SEAM_TARGETS.route.add, SEAM_TARGETS.route.remove, SEAM_TARGETS.route.url].map(relative)),
  rel: Object.freeze(Object.fromEntries(Object.entries(SEAM_TARGETS.route).filter(([, v]) => typeof v === 'string' && v.startsWith('/')).map(([k, v]) => [k, relative(v)]))),
  mark: Object.freeze({
    list: 'data-fishball-targets',
    card: 'data-fishball-target',
    state: 'data-fishball-target-state',
    begin: 'data-fishball-connect-begin',
    cancel: 'data-fishball-target-cancel',
    retry: 'data-fishball-target-retry',
    remove: 'data-fishball-target-remove',
    url: 'data-fishball-target-url',
    addUrl: 'data-fishball-target-add-url',
    add: 'data-fishball-target-add',
    confirm: 'data-fishball-confirm',
  }),
  /** Fixture targets (test data shaped as targets.d.ts TargetView). */
  view: (targetId, extra = {}) => Object.freeze({
    targetId, endpointEpoch: 'e-' + 'a'.repeat(16), serverName: null, name: null, kind: SEAM_TARGETS.kind.remote, url: FIXTURE.targetUrl,
    order: 1, duplicateSuffix: null, state: SEAM_TARGETS.state.notSet, connecting: false, link: Object.freeze({ state: 'target-unset', code: null }),
    connect: Object.freeze({ state: CONNECT.state.needsAuthorization, code: null }), line: Object.freeze({ kind: CONNECT.state.needsAuthorization, code: null }), control: SEAM_TARGETS_CONTROL.connect,
    pairing: Object.freeze({ state: 'unpaired', warning: null, choices: Object.freeze([]), nameIssue: null }),
    identity: SEAM_TARGETS.identity.pending, contributedTools: null, removable: true, urlEditable: true, ...extra,
  }),
  /** Element words the rows look for (HTML tag names, input types, ARIA role of DSH's Modal). */
  tag: Object.freeze({ button: 'button', input: 'input', password: 'password', dialog: 'dialog' }),
  control: SEAM_TARGETS_CONTROL,
  state: SEAM_TARGETS.state,
  unavailableCode: SEAM_TARGETS.unavailableCode,
  /** K3a URL refusals (core's LINK.code). */
  code: Object.freeze({ insecure: 'target-insecure', invalid: 'target-invalid' }),
  idA: 't-' + 'a'.repeat(16),
  idB: 't-' + 'b'.repeat(16),
  parentId: TARGETS.parentId,
  newUrl: 'https://new.test/api/agent/mcp',
  /** The withdrawn rows' reason (one decision for every row that asserted the scalar page). */
  withdrawn: 'withdrawn by MULTI-0 (targets.d.ts, ui.d.ts; contracts README "Version moves"): the scalar target.url field, the one token field for DSH_AGENT_TOKEN, GET/POST /api/fishball/connect and registerSettingsRoutes/effectiveTarget are gone; successors MULTI-SET-* (per-target cards over SEAM_TARGETS routes)',
})

/**
 * MULTI-1: the SET3 / UIPF-CORE rows whose oracle MULTI-0 withdrew (the scalar `target.url` field,
 * the one `DSH_AGENT_TOKEN` token field of the page, the single Connect block over GET/POST
 * `/api/fishball/connect`, `registerSettingsRoutes` / `registerConnectCancelRoute` /
 * `effectiveTarget`, and the instance line beside a user URL). Listed by id and row part (`*` = every
 * part); each is registered skipped with MULTI_SET.withdrawn and its successor below.
 */
export const WITHDRAWN_MULTI = Object.freeze({
  'SET3-UC-01': Object.freeze(['main 3', 'A4']),
  'SET3-UC-02': Object.freeze(['main 1', 'main 2-3', 'A2', 'E1']),
  'SET3-EP-01': Object.freeze(['1 new', '2 padded', '3 blank', '4 empty', '5 never stored']),
  'SET3-UC-03': Object.freeze(['*']), 'SET3-EP-02': Object.freeze(['*']), 'SET3-BVA-01': Object.freeze(['*']), 'SET3-DT-01': Object.freeze(['1', '2', '3', '4', '5']), 'SET3-ST-02': Object.freeze(['*']),
  'SET3-UC-04': Object.freeze(['*']), 'SET3-EP-03': Object.freeze(['*']), 'SET3-EP-04': Object.freeze(['*']), 'SET3-ST-03': Object.freeze(['*']), 'SET3-BVA-03': Object.freeze(['presses']),
  'SET3-UC-05': Object.freeze(['*']), 'SET3-EP-06': Object.freeze(['*']), 'SET3-BVA-02': Object.freeze(['*']), 'SET3-DT-05': Object.freeze(['*']), 'SET3-EP-09': Object.freeze(['*']), 'SET3-DT-07': Object.freeze(['*']), 'SET3-BVA-05': Object.freeze(['*']), 'SET3-ST-06': Object.freeze(['*']),
  'SET3-UC-06': Object.freeze(['*']), 'SET3-EP-07': Object.freeze(['*']), 'SET3-UC-11': Object.freeze(['*']), 'SET3-DT-06': Object.freeze(['*']), 'SET3-BVA-04': Object.freeze(['*']), 'SET3-EP-08': Object.freeze(['*']), 'SET3-ST-05': Object.freeze(['*']),
  'SET3-ST-01': Object.freeze(['3']),
  'UIPF-CORE-DT-01': Object.freeze(['*']), 'UIPF-CORE-EP-01': Object.freeze(['connect heading en', 'connect heading zh', 'sections en', 'sections zh']),
})
export const isWithdrawnMulti = (id, row) => { const parts = WITHDRAWN_MULTI[id]; return parts !== undefined && (parts.includes('*') || parts.includes(String(row))) }
