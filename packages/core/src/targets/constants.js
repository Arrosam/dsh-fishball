/**
 * Values of core's target collection (task MULTI-1; PLAN-MULTI §3–§5; MULTI-0 freeze
 * `contracts/targets.d.ts`). The frozen values are `contracts/constants.js` `TARGETS` (ids, keys,
 * credentials, tool names, storage) and `fishball-shared/ui-seam` `SEAM_TARGETS` (states, kinds,
 * routes, refusals); what is here is the module's own: its log lines and its route's HTTP words.
 */
export const TARGET_LOG = Object.freeze({
  name: 'fishball-core-targets',
  failed: '%s failed (%s)',
  load: 'reading the target records',
  save: 'saving a target record',
  forget: 'deleting a removed target\'s token material',
  binding: 'tool %s is not offered: its name is bound to another target or endpoint',
  reconcile: 'reconciling a target\'s ask cards',
  intake: 'taking a polled event',
  page: 'taking a polled page',
})

/** The target routes' HTTP words (SEAM_TARGETS.route; the ask routes use the same codes). */
export const TARGET_HTTP = Object.freeze({
  ok: 200,
  badRequest: 400,
  notFound: 404,
  conflict: 409,
  unavailable: 503,
  requestBody: 'buffered',
  headers: Object.freeze({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }),
  /** The `ConnectBegin` members each outcome carries besides `outcome` (connect.d.ts); any other outcome is not answered. */
  beginMembers: Object.freeze({
    authorized: Object.freeze([]),
    'approval-url': Object.freeze(['url']),
    'needs-configuration': Object.freeze(['code']),
  }),
  /** A Connect press that threw: answered 503 with this code only, never the error's text (it could name a credential detail). */
  unavailableCode: 'CONNECT_UNAVAILABLE',
})

/** Programming errors (TypeError) of the collection's in-process members. */
export const TARGET_MISUSE = Object.freeze({
  record: 'fishball-core targets: malformed target record',
  binding: 'fishball-core targets: malformed tool binding',
})
