/**
 * Oracle values of fishball-shared's `./ui-seam` cases, taken from the requirements and the old
 * suites' oracles only, never from ui-seam.js:
 * - UI-UC-07 (test/v3/fishball-ui/package constants `SEAM`, interface item 7): `UI_SEAM`, `UI_GUARDS`,
 *   `SEAM_STATUS`'s own words (F-STATUS `STATUS_MODEL`: fishball, set, reason, control);
 * - SEAM_STATUS's restated K3/K3a words: `LINK.state` (K3 host-services oracle `targetStates`),
 *   `CONNECT.state` (K3a oracle `states`), `GUARDS.status` (K3 `GuardReport.status`);
 * - `UI_STATUS.service`: F-STATUS `STATUS_MODEL.serviceName`; `UI_INSTANCE.service`: K3 `fishballInstance`;
 * - `SEAM_PAIRING`: the pairing words of R-FIX-FUI F1 (K3a `ui.pairing`, F-PAIR `PAIRING_STATE`, `CHOICE`, name refusals);
 * - `SEAM_BRAND`: LOGO-BUTTON / BRAND-UC-06 and DESIGN.md (brand row: `brandStyle`, Fishball or DeepSeek, default Fishball);
 * - `SEAM_TARGETS`: K3a-MULTI's oracle (MULTI-0 freeze, README rows "Public state", "Routes", "Ask
 *   handle", and the MULTI-1 list amendment: GET `/api/fishball/targets`, 200 TargetsSnapshot);
 * - `SEAM_PAGE_STREAM`: DESIGN.md §34 (one owner-only SSE route `/api/fishball/page/events?lang=&tz=`,
 *   messages `{topic, frame}`, `fishballInstance.page.register` additive in apiVersion 2, topics
 *   `asks` and `strip`, the client service `fishballPageStream`, one Fishball connection per page).
 */
import path from 'node:path'

/** fishball-shared's own folder (tests/ui-seam/ → the package root). */
const PACKAGE_DIR = path.join(import.meta.dirname, '..', '..')

export const SUBJECT = Object.freeze({
  /** The published specifier (by name, the package's own export). */
  specifier: 'fishball-shared/ui-seam',
  exportKey: './ui-seam',
  exportFile: './ui-seam.js',
  file: path.join(PACKAGE_DIR, 'ui-seam.js'),
  manifest: path.join(PACKAGE_DIR, 'package.json'),
})

/** The documented exports of ./ui-seam (its module header lists each one). */
export const EXPORTS = Object.freeze(['UI_SEAM', 'UI_STATUS', 'UI_GUARDS', 'UI_INSTANCE', 'SEAM_PAIRING', 'SEAM_STATUS', 'SEAM_BRAND', 'SEAM_TARGETS', 'SEAM_PAGE_STREAM'])

/** R-FB-06's word: the one line fishball-ui logs without core. */
const CORE_MISSING = 'fishball-core-missing'

export const UI_SEAM = Object.freeze({ member: 'ui', coreMissing: CORE_MISSING })
export const UI_GUARDS = Object.freeze({ service: 'fishballUiGuards' })
export const UI_STATUS = Object.freeze({ service: 'fishballStatus' })
/**
 * UI_INSTANCE: the service name is K3's. Its `apiVersion` is checked only for its type: the value
 * the module holds (1) is not the instance's current version (contracts index.d.ts: 2 since
 * MULTI-0), and core's own constants say no reader uses it any more ("reported to MULTI-0"). No
 * requirement fixes it today, so these tests do not pin it (port-shared-failures.md).
 */
export const UI_INSTANCE = Object.freeze({ service: 'fishballInstance', keys: Object.freeze(['service', 'apiVersion']) })

export const SEAM_STATUS = Object.freeze({
  keys: Object.freeze(['fishball', 'set', 'reason', 'control', 'link', 'connect', 'guards']),
  words: Object.freeze({
    fishball: Object.freeze({ on: 'on', off: 'fishball-off' }),
    set: Object.freeze({ ok: 'ok', incomplete: 'plugin-set-incomplete' }),
    reason: Object.freeze({ skipped: 'skipped', failed: 'failed' }),
    control: Object.freeze({ connect: 'connect', cancel: 'cancel' }),
    link: Object.freeze({ connected: 'connected', unreachable: 'target-unreachable', refused: 'token-refused', unset: 'target-unset' }),
    connect: Object.freeze({
      needsConfiguration: 'needs-configuration', needsAuthorization: 'needs-authorization', authorizing: 'authorizing', authorized: 'authorized', failed: 'failed',
    }),
    guards: Object.freeze({ ok: 'ok', overridden: 'guards-overridden' }),
  }),
})

export const SEAM_PAIRING = Object.freeze({
  state: Object.freeze({
    unpaired: 'unpaired', paired: 'paired', warnMatch: 'warn-match', warnMismatch: 'warn-mismatch', needToken: 'need-token', needId: 'need-id', idMismatch: 'id-mismatch',
  }),
  choice: Object.freeze({ continue: 'continue', newTokenAndId: 'new-token-and-id', newToken: 'new-token' }),
  nameRefusal: Object.freeze({ nameTaken: 'name-taken', nameInvalid: 'name-invalid' }),
})

export const SEAM_BRAND = Object.freeze({
  setting: 'brandStyle',
  default: 'fishball',
  style: Object.freeze({ fishball: 'fishball', deepseek: 'deepseek' }),
})

const TARGETS_ROUTE = '/api/fishball/targets'
export const SEAM_TARGETS = Object.freeze({
  values: Object.freeze({
    snapshotVersion: 1,
    member: 'targets',
    state: Object.freeze({ connected: 'connected', connecting: 'connecting', failed: 'failed', notSet: 'not-set' }),
    kind: Object.freeze({ parent: 'parent', remote: 'remote' }),
    identity: Object.freeze({ pending: 'pending', live: 'live', unsupported: 'unsupported', stale: 'stale' }),
    placeholder: Object.freeze({ unnamed: 'name-unavailable', unset: 'not-set' }),
    route: Object.freeze({
      list: TARGETS_ROUTE,
      read: 'GET',
      connect: TARGETS_ROUTE + '/connect',
      cancel: TARGETS_ROUTE + '/cancel',
      retry: TARGETS_ROUTE + '/retry',
      pairing: TARGETS_ROUTE + '/pairing',
      add: TARGETS_ROUTE + '/add',
      remove: TARGETS_ROUTE + '/remove',
      url: TARGETS_ROUTE + '/url',
      method: 'POST',
      targetIdField: 'targetId',
      fields: Object.freeze({ url: 'url', choice: 'choice', confirmed: 'confirmed' }),
    }),
    http: Object.freeze({ ok: 200, badRequest: 400, notFound: 404, conflict: 409, unavailable: 503 }),
    unavailableCode: 'TARGETS_UNAVAILABLE',
    ask: Object.freeze({ handleField: 'handle', voided: 'voided' }),
    refusal: Object.freeze({ unknownTarget: 'unknown-target', targetDuplicate: 'target-duplicate', targetReserved: 'target-reserved', confirmationRequired: 'confirmation-required' }),
  }),
  routeBase: TARGETS_ROUTE,
  actionPrefix: TARGETS_ROUTE + '/',
  /** The POST action routes (README "Routes"). */
  actions: Object.freeze(['connect', 'cancel', 'retry', 'pairing', 'add', 'remove', 'url']),
  /** The route keys that are not action paths. */
  routeMeta: Object.freeze(['list', 'read', 'method', 'targetIdField', 'fields']),
  /** Word groups whose words must differ within the group. */
  wordGroups: Object.freeze(['state', 'kind', 'identity', 'placeholder', 'refusal']),
  /** The MULTI-0 withdrawn K3a routes (review S6): no seam route names them. */
  withdrawn: Object.freeze(['/api/fishball/connect', '/api/fishball/connect/cancel']),
})

export const SEAM_PAGE_STREAM = Object.freeze({
  values: Object.freeze({
    perPage: 1,
    route: '/api/fishball/page/events',
    apiVersion: 2,
    langParameter: 'lang',
    zoneParameter: 'tz',
    field: Object.freeze({ topic: 'topic', frame: 'frame' }),
    member: 'page',
    topic: Object.freeze({ asks: 'asks', strip: 'strip' }),
    client: 'fishballPageStream',
  }),
  /** BVA around §34's count: "one Fishball connection" per page, whatever it draws. */
  perPageBounds: Object.freeze([Object.freeze({ row: 1, value: 0, ok: false }), Object.freeze({ row: 2, value: 1, ok: true }), Object.freeze({ row: 3, value: 2, ok: false })]),
  /** §34: the older per-view routes stay for other readers; the page stream is none of them. */
  olderRoutes: Object.freeze(['/api/fishball/strip', '/api/fishball/asks/events']),
})

/**
 * "Data only" (UI-UC-07): a module both sides load imports nothing. The source is read with comments
 * blanked; any static import, re-export `from` or dynamic import/require is an import.
 */
export const DATA_ONLY = Object.freeze({
  blockComment: /\/\*[\s\S]*?\*\//g,
  lineComment: /^\s*\/\/.*$/gm,
  importForms: Object.freeze([/^\s*import\b/m, /\bexport\s[^;]*?\bfrom\s*['"]/, /\bimport\s*\(/, /\brequire\s*\(/]),
  functionType: 'function',
})
