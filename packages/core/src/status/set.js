/**
 * Standalone set completeness (design §8.2; R-BND-05, TQ-17; PLAT-DT-02 as amended by 1.34–1.41).
 *
 * "Missing" means **enabled but skipped or failed to load**; a member that is not installed, or
 * that the owner switched off, is not reported (TQ-17: core alone is a full Fishball DSH). It reads
 * DSH's own answers only:
 * - `pluginManager.listBundles()`: `enabled` is "selected in the profile manifest", and an `error`
 *   on an enabled bundle "means its layer was skipped" (dsh-plugin-manager types, both SDKs). That
 *   covers an incompatible `engines.dsh` and a package that cannot be resolved or read, which DSH's
 *   boot skips as well (`loadProfileDirectory` `skippedBundles`). So a bundle the profile selects
 *   but whose package is gone (`not-bundle`) is skipped, not "not installed": the owner chose it.
 *   Not selected (`enabled: false`) or not listed is "not installed";
 * - `loader.entries()`: a member whose layer loaded fails to load when one of its live rows (not
 *   disabled) ends in cordis `FiberState.FAILED`, or has no fiber once its import settled: the
 *   loader catches an import error, logs it and leaves the entry without a fiber (`Entry._init`,
 *   both SDKs). A row with no live entry is not counted: the owner may have switched it off with
 *   a patch, which is the owner's choice like a disabled bundle.
 * Rows are classified after their import and lifecycle work settles (`Entry._initTask`,
 * `Fiber.await()`), because `plugin-manager/changed` fires when a live change returns, while a
 * newly enabled row may still be loading. In a hosted child the instance blocks the start on an
 * enabled skipped member instead (§8.1), so this check finds nothing there; it runs the same in
 * both modes.
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

/** The live (not disabled) loader entries of a bundle's rows. */
const liveRows = (bundle, entries) => (bundle.rows ?? [])
  .map((row) => (row.entryId === undefined ? undefined : entries.get(row.entryId)))
  .filter((entry) => entry !== undefined && !entry.disabled)

/** Waits until a row's import and lifecycle work settled; a startup error is read from `state` instead. */
async function settled(entry) {
  await entry._initTask?.catch(() => {})
  if (typeof entry.fiber?.await === 'function') await entry.fiber.await().catch(() => {})
}

const failedRow = (entry) => entry.fiber === undefined || entry.fiber.state === STATUS_MODEL.fiberFailed

/** One member's finding, or undefined when it is fine, absent or off. */
async function finding(bundle, entries) {
  if (bundle === undefined || !bundle.enabled) return undefined
  if (bundle.error !== undefined) return Object.freeze({ name: bundle.name, reason: REASON.skipped, code: bundle.error.code ?? null })
  const rows = liveRows(bundle, entries)
  await Promise.all(rows.map(settled))
  if (rows.some(failedRow)) return Object.freeze({ name: bundle.name, reason: REASON.failed, code: null })
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
  const found = await Promise.all(STATUS_MODEL.members.map((name) => finding(bundles.find((bundle) => bundle.name === name), entries)))
  const missing = Object.freeze(found.filter((item) => item !== undefined))
  return Object.freeze({ status: missing.length === 0 ? SET.ok : SET.incomplete, missing })
}
