/**
 * The main row's settings (F-WIRE; F-SETTINGS `SETTINGS`, K3a `CONNECT.setting`, `FISHBALL_MODEL`).
 * PTC is selected at manager composition, not hot-switched. The other settings are volatile:
 * saves from core's settings page or instance onboarding take effect without a restart. DSH's
 * loader commits a volatile-only change into the running fiber's references and emits
 * `loader/volatile-update` (cordis-plugin-loader, both SDKs), and the row reads each value live
 * through `valueAt`. The nested shape is the one every design text uses
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
 *
 * WAKE: `wake.quietWindowSeconds`, `wake.maxBatch` and `wake.classes` (event type → `wake` |
 * `silent`), the batching of events to Fishball, written by core's settings page. Read at each
 * event, so a save applies to the next event without a restart.
 */
import Schema from '@deepseek-ai/schemastery'
import { SEAM_BRAND } from 'fishball-shared/ui-seam'
import { WAKE } from '../../contracts/constants.js'
import { MANAGER_PTC } from '../manager/ptc.js'

const text = () => Schema.string().volatile()
/** A whole number of at least `min`; an absent or invalid stored value reads as `fallback` (`loose`). */
const wholeAtLeast = (min, fallback) => Schema.natural().min(min).default(fallback).loose().volatile()

export const Config = Schema.object({
  [MANAGER_PTC.setting]: Schema.boolean().default(MANAGER_PTC.default),
  connect: Schema.object({ clientMetadataUrl: text() }),
  identity: Schema.object({ id: text(), name: text() }),
  model: Schema.object({ provider: Schema.string(), model: Schema.string(), reasoningEffort: Schema.string() }).volatile(),
  // An invalid stored value is presentation, not a reason to abort core's startup.
  [SEAM_BRAND.setting]: Schema.string().loose().volatile(),
  // WAKE: the batching of events to Fishball (events/delivery.js). One field per listed event type,
  // so a word that is no class reads as that type's own default (`loose`) and the others keep
  // theirs; the delivery list checks the values again at its own boundary (events/wake.js).
  wake: Schema.object({
    quietWindowSeconds: wholeAtLeast(WAKE.bounds.quietWindowSeconds, WAKE.defaults.quietWindowSeconds),
    maxBatch: wholeAtLeast(WAKE.bounds.maxBatch, WAKE.defaults.maxBatch),
    classes: Schema.object(Object.fromEntries(Object.entries(WAKE.defaults.classes)
      .map(([type, word]) => [type, Schema.union(Object.values(WAKE.class)).default(word).loose()]))).volatile(),
  }),
})

/**
 * A volatile field arrives as a live reference (`.get()`); a plain value (a direct construction)
 * reads the same. A reference met along the path is read too, so a path may go inside a volatile
 * object (`wake.classes.<type>`).
 */
export function valueAt(config, path) {
  const live = (node) => (node !== null && typeof node === 'object' && typeof node.get === 'function' ? node.get() : node)
  return path.reduce((node, key) => live(live(node)?.[key]), config)
}
