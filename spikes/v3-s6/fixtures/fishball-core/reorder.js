/**
 * V3-S6 probe (the user's decision Q-S6-1 = B): core moves its own bundle to the END of
 * `dsh.profile.bundles`, so its patch applies after every other bundle (fishball-instance included).
 * Bundle patches apply in list order, and a patch on a row not yet inserted is skipped, so only the
 * last position guarantees that every guard row exists when core's patch runs.
 *
 * Public host APIs only: dsh-app-boot's readProfileManifest / writeProfileBundles, under the
 * dsh-atomic-write lock the plugin manager takes on the same file (dsh-plugin-manager `change`).
 * The current boot's composition is already fixed; the new order applies at the next composition.
 */
import path from 'node:path'
import { readProfileManifest, writeProfileBundles } from '@deepseek-ai/dsh-app-boot'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'

const SELF = 'fishball-core'
const MANIFEST = 'package.json'
const DIAGNOSTIC = 'dsh'

/** The bundle list with core moved to the end, or undefined when core is already last (or absent). */
export function orderedBundles(bundles) {
  if (!bundles.includes(SELF) || bundles.at(-1) === SELF) return undefined
  return [...bundles.filter((name) => name !== SELF), SELF]
}

/** Move core last in the running profile. @returns {before, after} or {before, unchanged: true}. */
export async function ensureCoreLast(profileContext) {
  const dir = profileContext.dir
  return withFileLock(path.join(dir, MANIFEST), async () => {
    const manifest = readProfileManifest(DIAGNOSTIC, dir)
    const before = manifest.dsh?.profile?.bundles ?? []
    const after = orderedBundles(before)
    if (after === undefined) return { before, unchanged: true }
    writeProfileBundles(dir, manifest, after)
    return { before, after }
  })
}
