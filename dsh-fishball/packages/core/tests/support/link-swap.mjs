/**
 * A core module graph with core's link (src/link/link.js) swapped for a test's scripted or spying
 * link module, bound to the current DSH: the unit-level wire rows (MULTI-1-FIX retirement, SESSIONS)
 * drive `createTargets` (src/targets/index.js) over a link that never dials. Only the graph imported
 * through `importWithLink` sees the swap (a URL tag marks it); every other import of core, the spy's own
 * import of the real link included, is the ordinary module. `@deepseek-ai/*` imports of the tagged graph
 * resolve from the current DSH, as fishball-test-helpers/bind does for an ordinary import.
 *
 * Owned by the wire area (packages/core/tests/support/ is port-core-wire's).
 */
import { registerHooks } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { DSH_RUNTIME } from 'fishball-test-helpers/dsh'

const SWAP = Object.freeze({ tag: '?fbtest-link-swap=', dshScope: '@deepseek-ai/', manifest: 'package.json', link: path.join('src', 'link', 'link.js') })
const CORE = pathToFileURL(path.join(import.meta.dirname, '..', '..') + path.sep).href
const LINK = new URL(SWAP.link.split(path.sep).join('/'), CORE).href
let counter = 0

/** Import `entry` (a file inside core) with core's link replaced by `spy` (an absolute file). */
export async function importWithLink(entry, spy) {
  const tag = SWAP.tag + ++counter
  const spyUrl = pathToFileURL(spy).href
  const hook = registerHooks({ resolve(specifier, ctx, next) {
    if (!ctx.parentURL?.endsWith(tag)) return next(specifier, ctx)
    if (specifier.startsWith(SWAP.dshScope)) return next(specifier, { ...ctx, parentURL: pathToFileURL(path.join(path.dirname(DSH_RUNTIME), SWAP.manifest)).href })
    const result = next(specifier, ctx)
    if (!result.url.startsWith(CORE)) return result
    return { ...result, url: result.url === LINK ? spyUrl : result.url + tag }
  } })
  try { return await import(pathToFileURL(entry).href + tag) } finally { hook.deregister() }
}
