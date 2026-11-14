/**
 * The one seam through which Watchdog reads the frozen words of fishball-core's contracts (task
 * WD-ROUTE; Fishball's decisions 2026-11-15): K3's `contracts/constants.js` (`INTERCEPT`) and K1's
 * `mcp-schema` (`EVENT_TYPE`) as core exports its vendored copy.
 *
 * Imported dynamically, never statically: Watchdog loads in a DSH without core (R-FB-06), where these
 * modules do not resolve, so they are read only once a compatible `fishballInstance` was found. A
 * failed import with core present is a Watchdog `load` failure (R-WD-07).
 *
 * Each module is tried by package name first (`fishball-core/...`, how a DSH profile, where core is
 * installed beside Watchdog, resolves it) and only when that resolution fails, by the sibling path
 * in this repository. That is I-PLACE's checkout rule (v3-w3-briefs.md, I-PLACE note 7: "in a
 * checkout, placement reads the sibling workspace folders"): in a checkout `packages/watchdog` is
 * not a workspace and nothing links `fishball-core` beside it. The sibling path means something only
 * in a checkout: installed, it would point into another package's folder, and then fails as a load
 * failure, which is the right outcome for a profile whose core lacks these exports. Only the
 * resolution of the name is tried (`import.meta.resolve`); once it resolves, its import's own errors
 * are rethrown, so a broken core module is never masked by the fallback.
 */
const MODULES = Object.freeze({
  contracts: Object.freeze({ name: 'fishball-core/contracts', sibling: '../../../core/contracts/constants.js' }),
  mcpSchema: Object.freeze({ name: 'fishball-core/mcp-schema', sibling: '../../../core/vendor/mcp-schema/index.js' }),
})
/** Node's codes for "the package name does not resolve here" (absent, or that subpath not exported). */
const UNRESOLVED = Object.freeze(['ERR_MODULE_NOT_FOUND', 'ERR_PACKAGE_PATH_NOT_EXPORTED'])

/** The URL of `name` from here, or of the sibling path when the name itself does not resolve. */
function locate({ name, sibling }) {
  try { return import.meta.resolve(name) } catch (error) {
    if (!UNRESOLVED.includes(error?.code)) throw error
    return new URL(sibling, import.meta.url).href
  }
}
const importCore = async (module) => import(locate(module))

let loading

/**
 * @returns {Promise<{INTERCEPT: object, EVENT_TYPE: object}>} K3's interception values and K1's
 *   event types. One import per process; a failed import is retried at the next call.
 */
export function loadContract() {
  loading ??= Promise.all([importCore(MODULES.contracts), importCore(MODULES.mcpSchema)])
    .then(([{ INTERCEPT }, { EVENT_TYPE }]) => Object.freeze({ INTERCEPT, EVENT_TYPE }))
    .catch((error) => { loading = undefined; throw error })
  return loading
}
