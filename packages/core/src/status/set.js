/**
 * Standalone set completeness (design §8.2; R-BND-05, TQ-17; PLAT-DT-02 as amended by 1.34–1.41).
 *
 * "Missing" means **enabled but skipped or failed to load**; a member that is not installed, or
 * that the owner switched off, is not reported (TQ-17: core alone is a full Fishball DSH). It reads
 * DSH's own answers only:
 * - `pluginManager.listBundles()`: `enabled` is "selected in the profile manifest", and an `error`
 *   on an enabled bundle "means its layer was skipped" (dsh-plugin-manager types, both SDKs). That
 *   covers an incompatible `engines.dsh` and an unreadable package (DSH skips it at boot, §8.2);
 * - `loader.entries()`: a member whose layer loaded but one of whose rows sits in cordis
 *   `FiberState.FAILED` failed to load. A row with no live entry is not counted: the owner may have
 *   switched that row off with a patch, which is the owner's choice like a disabled bundle.
 * In a hosted child the instance blocks the start on an enabled skipped member instead (§8.1), so
 * this check finds nothing there; it runs the same in both modes.
 */
import { STATUS_MODEL } from './constants.js'

const { reason: REASON, set: SET } = STATUS_MODEL

/** The live loader entries by id (`Entry.id`, the id `BundleRowInfo.entryId` names). */
function entriesById(loader) {
  const byId = new Map()
  if (typeof loader?.entries !== 'function') return byId
  for (const entry of loader.entries()) byId.set(entry.id, entry)
  return byId
}

const failedRow = (bundle, entries) => (bundle.rows ?? []).some((row) => {
  const entry = row.entryId === undefined ? undefined : entries.get(row.entryId)
  return entry !== undefined && !entry.disabled && entry.fiber?.state === STATUS_MODEL.fiberFailed
})

/** One member's finding, or undefined when it is fine, absent or off. */
function finding(bundle, entries) {
  if (bundle === undefined || !bundle.enabled) return undefined
  if (bundle.error !== undefined) return Object.freeze({ name: bundle.name, reason: REASON.skipped, code: bundle.error.code ?? null })
  if (failedRow(bundle, entries)) return Object.freeze({ name: bundle.name, reason: REASON.failed, code: null })
  return undefined
}

/**
 * @param {{listBundles(): Promise<Array<object>>}} pluginManager DSH's plugin manager service
 * @param {{entries(): Iterable<object>} | undefined} loader the Cordis loader
 * @returns {Promise<{status: string, missing: ReadonlyArray<{name: string, reason: string, code: string | null}>}>}
 */
export async function checkSet(pluginManager, loader) {
  const bundles = await pluginManager.listBundles()
  const entries = entriesById(loader)
  const missing = Object.freeze(STATUS_MODEL.members
    .map((name) => finding(bundles.find((bundle) => bundle.name === name), entries))
    .filter((item) => item !== undefined))
  return Object.freeze({ status: missing.length === 0 ? SET.ok : SET.incomplete, missing })
}
