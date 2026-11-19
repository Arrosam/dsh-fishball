/**
 * Values of core's target collection (task MULTI-1; PLAN-MULTI §3–§5; MULTI-0 freeze
 * `contracts/targets.d.ts`). The frozen values are `contracts/constants.js` `TARGETS` (ids, keys,
 * credentials, tool names, storage) and `fishball-shared/ui-seam` `SEAM_TARGETS` (states, kinds,
 * routes, refusals); what is here is the module's own: its log lines and its route's HTTP words.
 */
export const TARGET_LOG = Object.freeze({
  name: 'fishball-core-targets',
  failed: '%s failed (%s)',
  save: 'saving a target record',
  saveBinding: 'saving a tool-name binding',
  forget: 'deleting a removed target\'s token material',
  binding: 'tool %s is not offered: its name is bound to another target or endpoint',
  reconcile: 'reconciling a target\'s ask cards',
  void: 'voiding a retired target\'s ask cards',
  intake: 'taking a polled event',
  page: 'taking a polled page',
  parentDuplicate: 'the instance points the parent at an endpoint an added target already has; both connect to it',
})

/** The target routes' own HTTP words (the statuses and the unavailable code are `SEAM_TARGETS.http`). */
export const TARGET_HTTP = Object.freeze({
  requestBody: 'buffered',
  headers: Object.freeze({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }),
  /** The `ConnectBegin` members each outcome carries besides `outcome` (connect.d.ts); any other outcome is not answered. */
  beginMembers: Object.freeze({
    authorized: Object.freeze([]),
    'approval-url': Object.freeze(['url']),
    'needs-configuration': Object.freeze(['code']),
  }),
})

/** Programming errors (TypeError) of the collection's in-process members. */
export const TARGET_MISUSE = Object.freeze({
  record: 'fishball-core targets: malformed target record',
  binding: 'fishball-core targets: malformed tool binding',
})
