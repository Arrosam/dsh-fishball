/**
 * The guards core intends, read from core's own bundle patch (`packages/core/cordis.patch.yml`),
 * which is their one definition (v3-tasks W1 rules). The patch is parsed with dsh-app-boot's own
 * patch reader (`loadOverlayPatches`, the same YAML dialect DSH uses for a bundle's patch, both
 * SDKs), so the check reads exactly what DSH composes, `!!js` rows included.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { GUARDS } from '../../contracts/constants.js'

const PATCH_PATH = fileURLToPath(new URL(GUARDS.patchFile, import.meta.url))

/** A guard row is exactly `{id, disabled: true}`: a patch that only switches another layer's row off. */
function isGuardRow(patch) {
  const keys = Object.keys(patch)
  return keys.length === 2 && typeof patch.id === 'string' && patch.disabled === true
}

/** The config of the id patch for `row`, or undefined. */
function configOf(patches, row) {
  return patches.find((patch) => patch.id === row && patch.config !== undefined)?.config
}

/**
 * @param {string} [file] - the patch to read; core's own by default.
 * @returns {{rows: readonly string[], policy: readonly {key: string, value: unknown}[]}} the guarded
 *   row ids (session-creating rows, `fishball-instance` and the shipped presets) in patch order, and
 *   one intended value per `GUARDS.policy` key (a key list for `keys: true` entries).
 * @throws when the patch cannot be read or a policy row is missing: core's own file is broken.
 */
export function readIntendedGuards(file = PATCH_PATH) {
  const patches = loadOverlayPatches(GUARDS.diagnostic, path.resolve(file))
  const rows = Object.freeze(patches.filter(isGuardRow).map((patch) => patch.id))
  const policy = Object.freeze(GUARDS.policy.map((spec) => {
    const config = configOf(patches, spec.row)
    if (config === undefined || !(spec.field in config)) throw new Error(GUARDS.text.missingPolicy(file, spec.row, spec.field))
    const value = config[spec.field]
    return Object.freeze({ key: spec.key, value: spec.keys ? Object.freeze(Object.keys(value)) : value })
  }))
  return Object.freeze({ rows, policy })
}
