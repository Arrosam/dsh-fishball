/**
 * Core's standalone self-reorder (Q-S6-1 decided B; R-FB-12; spike V3-S6 round 2 §7.1). A bundle
 * patch reaches only rows an earlier layer inserted, so core must be LAST in `dsh.profile.bundles`
 * (not merely after the instance). DSH's native install appends in install order, so core moves
 * itself once, at its first start in that profile.
 *
 * Public host functions only: dsh-app-boot's `readProfileManifest` / `writeProfileBundles`, under
 * dsh-atomic-write's `withFileLock` on the profile manifest, the lock the plugin manager takes for
 * every change to the same file. The running boot is already composed; the new order applies at the
 * next composition (live with HMR, otherwise at the next start).
 *
 * "Once" (R-FB-12): a local record per profile marks the reorder done. With the record present core
 * never writes the manifest again, so an owner who later moves core earlier is not overruled
 * (R-FB-09, Q20); the check reports `bundle-order` instead.
 */
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { readProfileManifest, writeProfileBundles } from '@deepseek-ai/dsh-app-boot'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { GUARDS } from '../../contracts/constants.js'

const { reorder: OUTCOME, text: TEXT } = GUARDS

/** `dsh.profile.bundles` of a profile manifest, in order (empty when it lists none). */
export const bundlesOf = (manifest) => manifest.dsh?.profile?.bundles ?? []

/** The bundle list with core moved to the end, or undefined when core is absent or already last. */
export function coreLast(bundles) {
  if (!bundles.includes(GUARDS.bundleName) || bundles.at(-1) === GUARDS.bundleName) return undefined
  return [...bundles.filter((name) => name !== GUARDS.bundleName), GUARDS.bundleName]
}

/** The record's content: the outcome, one JSON line. */
const recordLine = (outcome) => JSON.stringify({ outcome }) + GUARDS.record.lineEnd

/** `<DSH home>/fishball/guards/<profile>.reorder.json`. */
const recordPath = (profile) => path.join(profile.home, ...GUARDS.record.directory, profile.name + GUARDS.record.suffix)

async function recorded(file) {
  try {
    await readFile(file)
    return true
  } catch (error) {
    if (error?.code === GUARDS.notFound) return false
    throw error
  }
}

/** A failure's cause for the log: its code, else its name, else the value itself. */
export const reason = (error) => String(error?.code ?? error?.name ?? error)

/**
 * Move core last under the plugin manager's lock.
 * @returns {Promise<'moved'|'unchanged'|undefined>} undefined when core is not a listed bundle
 *   (a hosted child of the V2 copy, or a profile that lists core under no bundle name): nothing to
 *   order, and the one reorder is not used up.
 */
async function moveCoreLast(profile) {
  let outcome
  try {
    await withFileLock(path.join(profile.dir, GUARDS.profileManifest), async () => {
      const manifest = readProfileManifest(GUARDS.diagnostic, profile.dir)
      const bundles = bundlesOf(manifest)
      if (!bundles.includes(GUARDS.bundleName)) return
      const after = coreLast(bundles)
      outcome = OUTCOME.unchanged
      if (after === undefined) return
      writeProfileBundles(profile.dir, manifest, after)
      outcome = OUTCOME.moved
    })
  } catch (error) {
    // A lock release that fails after the manifest was written must not turn `moved` into
    // `failed` (K3: `failed` wrote nothing); any earlier failure wrote nothing and rethrows.
    if (outcome !== OUTCOME.moved) throw error
  }
  return outcome
}

/**
 * Run the one reorder for this profile.
 * @param {{name: string, dir: string, home: string}} profile - DSH's `profileContext`.
 * @param {{warn(format: string, ...args: unknown[]): void}} logger - the row's logger.
 * @returns {Promise<'moved'|'unchanged'|'failed'>} the K3 `ReorderOutcome`. `failed` wrote nothing
 *   and left no record, so a later start tries again; the check keeps reporting `bundle-order`.
 */
export async function reorderOnce(profile, logger) {
  let file
  let outcome
  try {
    file = recordPath(profile)
    if (await recorded(file)) return OUTCOME.unchanged
    outcome = await moveCoreLast(profile)
  } catch (error) {
    logger.warn(TEXT.reorderFailed, reason(error))
    return OUTCOME.failed
  }
  if (outcome === undefined) return OUTCOME.unchanged
  // Recorded after the manifest commit, and apart from it: a record that cannot be written leaves
  // the real outcome standing (the manifest already moved). The next start then finds core last,
  // writes nothing, and records `unchanged`.
  try {
    await writeFileAtomic(file, recordLine(outcome), { mode: GUARDS.record.mode, dirMode: GUARDS.record.directoryMode })
  } catch (error) {
    logger.warn(TEXT.recordFailed, reason(error))
  }
  return outcome
}
