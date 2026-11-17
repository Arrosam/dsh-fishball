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

/** A bare `{id, disabled}` patch: one that only switches another layer's row. */
const isSwitchRow = (patch) => Object.keys(patch).length === 2 && typeof patch.id === 'string' && Object.hasOwn(patch, 'disabled')
/** A guard row is exactly `{id, disabled: true}`: a patch that only switches another layer's row off. */
const isGuardRow = (patch) => isSwitchRow(patch) && patch.disabled === true
/**
 * A UI guard row is `{id, disabled: !!js}`: switched off only while fishball-ui is in this DSH
 * (R-FIX-FUI; the patch's comment). The loader's expression node is `{__jsExpr}` (cordis-plugin-loader
 * `isJsExpr`, both SDKs).
 */
const isUiGuardRow = (patch) => isSwitchRow(patch) && typeof patch.disabled?.__jsExpr === 'string'

/** The config of the id patch for `row`, or undefined. */
function configOf(patches, row) {
  return patches.find((patch) => patch.id === row && patch.config !== undefined)?.config
}

/**
 * @param {string} [file] - the patch to read; core's own by default.
 * @returns {{rows: readonly string[], uiRows: readonly string[], policy: readonly {key: string, value: unknown}[]}}
 *   the guarded row ids (session-creating rows, `dsh-instance` and the shipped presets) in patch
 *   order; fishball-ui's UI guard row ids (held only beside fishball-ui) in patch order; and one
 *   intended value per `GUARDS.policy` key (a key list for `keys: true` entries).
 * @throws when the patch cannot be read or a policy row is missing: core's own file is broken.
 */
export function readIntendedGuards(file = PATCH_PATH) {
  const patches = loadOverlayPatches(GUARDS.diagnostic, path.resolve(file))
  const idsOf = (test) => Object.freeze(patches.filter(test).map((patch) => patch.id))
  const rows = idsOf(isGuardRow)
  const uiRows = idsOf(isUiGuardRow)
  const policy = Object.freeze(GUARDS.policy.map((spec) => {
    const config = configOf(patches, spec.row)
    if (config === undefined || !(spec.field in config)) throw new Error(GUARDS.text.missingPolicy(file, spec.row, spec.field))
    const value = config[spec.field]
    return Object.freeze({ key: spec.key, value: spec.keys ? Object.freeze(Object.keys(value)) : value })
  }))
  return Object.freeze({ rows, uiRows, policy })
}
