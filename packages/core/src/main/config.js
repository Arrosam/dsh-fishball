/**
 * The main row's settings (F-WIRE; F-SETTINGS `SETTINGS`, K3a `CONNECT.setting`, `FISHBALL_MODEL`).
 * Every field is volatile, so a save in core's settings page (or the model dialog) reaches the
 * running row without a restart: DSH's loader commits a volatile-only change into the running
 * fiber's references and emits `loader/volatile-update` (cordis-plugin-loader, both SDKs), and the
 * row reads each value live through `valueAt`. The nested shape is the one every design text uses
 * (`connect.clientMetadataUrl`, `identity.id`, `identity.name`, `model`). MULTI-1 removed
 * `target.url`: the targets are core's own records (src/targets/), added on the settings page.
 *
 * `model`'s fields are optional in the schema: an absent `model` must parse (it means "this DSH's
 * default model"), and schemastery applies an object's required fields to an absent value too.
 * Whether a stored selection is complete and routable is the manager session's rule
 * (src/manager/session.js), which reads an incomplete one as unset.
 *
 * LOGO-BUTTON: `brandStyle` is the sidebar logo's theme, a plain top-level field because DSH's
 * config form writes a scalar field by name (core's settings page's control uses
 * `form.set(SEAM_BRAND.setting, …)`). Absent means `SEAM_BRAND.default`; the status snapshot
 * normalizes an unknown stored word the same way, so an old or hand-written value cannot change the
 * art outside the two offered choices.
 */
import Schema from '@deepseek-ai/schemastery'
import { SEAM_BRAND } from 'fishball-shared/ui-seam'

const text = () => Schema.string().volatile()

export const Config = Schema.object({
  connect: Schema.object({ clientMetadataUrl: text() }),
  identity: Schema.object({ id: text(), name: text() }),
  model: Schema.object({ provider: Schema.string(), model: Schema.string(), reasoningEffort: Schema.string() }).volatile(),
  [SEAM_BRAND.setting]: Schema.string().volatile(),
})

/** A volatile field arrives as a live reference (`.get()`); a plain value (a direct construction) reads the same. */
export function valueAt(config, path) {
  const raw = path.reduce((node, key) => node?.[key], config)
  return raw !== null && typeof raw === 'object' && typeof raw.get === 'function' ? raw.get() : raw
}
