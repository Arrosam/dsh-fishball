/**
 * fishball-ui's UI guard rows, read back from its own bundle patch (`cordis.patch.yml`), their one
 * definition, with dsh-app-boot's own patch reader (`loadOverlayPatches`, the dialect DSH composes
 * a bundle patch with, `!!js` included; both SDKs), as core's src/guards/intended.js reads core's.
 * Core's guard check reports these rows when one is enabled again (R-FB-09), through the
 * `UI_GUARDS.service` this row provides (index.js).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { UI_PLUGIN } from './constants.js'

const PATCH_PATH = fileURLToPath(new URL(UI_PLUGIN.patchFile, import.meta.url))
/** A guard row's keys: it only switches another layer's row off (or on, without core). */
const GUARD_KEYS = Object.freeze(['id', 'disabled'])

const isGuardRow = (patch) => typeof patch.id === 'string' && Object.keys(patch).length === GUARD_KEYS.length &&
  GUARD_KEYS.every((key) => Object.hasOwn(patch, key))

/**
 * @param {string} [file] - the patch to read; fishball-ui's own by default.
 * @returns {readonly string[]} the guard rows' ids, in patch order.
 * @throws when the patch cannot be read: fishball-ui's own file is broken.
 */
export function readUiGuardRows(file = PATCH_PATH) {
  return Object.freeze(loadOverlayPatches(UI_PLUGIN.diagnostic, path.resolve(file)).filter(isGuardRow).map((patch) => patch.id))
}
