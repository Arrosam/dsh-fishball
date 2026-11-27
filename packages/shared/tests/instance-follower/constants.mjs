/**
 * Oracle values of fishball-shared's `./instance-follower` cases. Sources, never instance-follower.js's
 * code:
 * - fishball-shared README and DESIGN.md §33 ("Shared helper": followInstance / reportCoreMissing, how
 *   each amenity binds to a compatible `fishballInstance` and reports a missing core once);
 * - the extension points §1 (docs/history/plugins/instance-extension-points.md): one versioned service,
 *   `fishballInstance`; "a missing service or an older `apiVersion` is 'older instance'": nothing attached;
 * - R-FB-06: without core a row logs one `fishball-core-missing` line, once per load, at DSH's app ready
 *   (`appReady.onReady`; a late listener is called at once), or at load on a host without `appReady`;
 * - the old suites that observed it through the amenities: fishball-heartbeat HB-EP-02 rows 1–7
 *   (absent, apiVersion 1, appReady, late, removed, replaced), fishball-taskboard TB-EP-08 rows 1–5,
 *   fishball-board PLAT-EP-04 row 1 / PEERS-EP-01 row 1;
 * - the module's documented signatures (its JSDoc): `followInstance(ctx, {service, apiVersion,
 *   serviceEvent}, attach) → {attached()}`, `attach(instance) → dispose`;
 *   `reportCoreMissing(ctx, {appReady}, binding, warn)`.
 */

/** The service contract every amenity hands the follower (DSH's and core's names). */
export const HOST = Object.freeze({
  service: 'fishballInstance',
  /** Cordis' service-change event (both supported SDKs). */
  serviceEvent: 'internal/service',
  appReady: 'appReady',
})

/** The apiVersions the amenities bind: fishball-board 1 (its frozen contract), heartbeat and taskboard 2 (MULTI-0). */
export const API = Object.freeze({ board: 1, current: 2 })

/**
 * EP over the instance a row meets (host apiVersion = API.current). `instance`: null for no service,
 * otherwise the fake's apiVersion (or ABSENT_VERSION for a fake without the member).
 */
export const ABSENT_VERSION = Symbol('no apiVersion member')
export const PARTITIONS = Object.freeze([
  Object.freeze({ row: 1, label: 'no fishballInstance', instance: null, attached: false }),
  Object.freeze({ row: 2, label: 'a compatible instance (same apiVersion)', instance: API.current, attached: true }),
  Object.freeze({ row: 3, label: 'an older instance (lower apiVersion)', instance: API.board, attached: false }),
  Object.freeze({ row: 4, label: 'a newer instance (higher apiVersion)', instance: API.current + 1, attached: false }),
  Object.freeze({ row: 5, label: 'an instance without apiVersion', instance: ABSENT_VERSION, attached: false }),
])

/** BVA on apiVersion around each version the amenities bind: v − 1, v, v + 1; only v attaches. */
export const BOUNDS = Object.freeze(Object.values(API).flatMap((host) => [
  Object.freeze({ host, instance: host - 1, attached: false }),
  Object.freeze({ host, instance: host, attached: true }),
  Object.freeze({ host, instance: host + 1, attached: false }),
]))

/** Fixture names (test values, not product ones). */
export const FIXTURE = Object.freeze({
  row: 'fbtest-amenity-row',
  core: 'fbtest-core',
  otherService: 'fbtestOtherService',
})
