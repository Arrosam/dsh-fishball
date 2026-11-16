/**
 * Core's guard row (design §5a.2): core's bundle patch inserts it (`cordis.patch.yml`) beside the
 * guard rows. It provides `fishballGuards` (index.js): the standalone self-reorder and the
 * `guards-overridden` report, which also covers the UI guard rows of fishball-ui's own patch when
 * fishball-ui is installed (R-FB-09, check.js). It is core's one path row, so DSH resolves its host
 * imports through core's manifest (its peers) and serves core's own `./client` for it once; every
 * other core row is a package subpath (`fishball-core/...`), which is no client source.
 *
 * Until F-UI this module was `ui/patch/index.js`, row `fishball-ui`; that name is now the
 * fishball-ui package's.
 */
import { GUARDS } from '../../contracts/constants.js'
import { createGuards } from './index.js'

export const name = GUARDS.pluginName

/** Every service the guards read is looked up, never injected: a missing one is "nothing to check". */
export function apply(ctx) {
  ctx.provide(GUARDS.serviceName, createGuards(ctx))
}
