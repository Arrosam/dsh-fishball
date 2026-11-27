/**
 * Core's settings page in fishball-test-helpers' scripted DSH page: core's real `client.js` (and the
 * chunk it loads, `client.settings.js`) alone, applied by the current DSH's own Cordis with DSH's
 * own SettingsFormModel / settingsTextField. fishball-ui's client is never loaded here (it is
 * another package): its Fishball-page entries and `view=settings` continuation are integration
 * rows.
 *
 * What this file adds to the scripted page:
 * - core's namespace served at the fixture revision (`core: null` serves nothing);
 * - core's owner-only target routes (SEAM_TARGETS.route, document-relative) answered from
 *   `world.targets` (a TargetsSnapshot, or a function answering `{status, json}` or a promise of
 *   one) and `world.targetAnswers[relativePath](body)` for each POST (default `{ok: true}`); with
 *   `world.targets` undefined they answer 404, as any unserved route;
 * - the handle's `open(view)` / `close()` for core's bundle configuration entry, `field(name)`
 *   (the marked field wrapper and its input), `editField(name, value)`, `entries()` (core's
 *   configuration entries) and `coreValue()` (the namespace's served value).
 */
import { createWorld, loadPage, settle } from 'fishball-test-helpers/scripted-page'
import { findAll } from 'fishball-test-helpers/react-shim'
import { CORE, DSH, FIXTURE, MARK, MULTI_SET, ROUTE, SUBJECT } from './constants.mjs'

export { settle }

/** Core's browser half, the one client these pages run. */
export const CORE_CLIENT = Object.freeze({ id: CORE.moduleId, file: SUBJECT.coreClient })

/**
 * One page world for core's settings page (not loaded yet).
 * @param options.core - core's namespace value, or null for "not served" (default {}).
 * @param options.* - anything fishball-test-helpers/scripted-page createWorld takes (lang, navigation,
 *   omit, remoteSession, chunkFiles, modal, …).
 */
export function coreWorld({ core = {}, ...options } = {}) {
  const world = createWorld({ base: FIXTURE.base, ...options, clients: [CORE_CLIENT] })
  if (core !== null) world.serve(CORE.namespace, core, { revision: FIXTURE.revision })
  world.targets = undefined
  world.targetAnswers = {}
  const listPath = MULTI_SET.rel.list
  world.route(listPath, () => {
    if (world.targets === undefined) return { status: MULTI_SET.http.notFound, text: '' }
    return typeof world.targets === 'function' ? world.targets() : { status: ROUTE.ok, json: world.targets }
  }, { method: ROUTE.get })
  for (const rel of Object.values(MULTI_SET.rel).filter((p) => p !== listPath)) {
    world.route(rel, (call) => {
      if (world.targets === undefined) return { status: MULTI_SET.http.notFound, text: '' }
      const answer = world.targetAnswers[rel]
      return answer === undefined ? { status: ROUTE.ok, json: { ok: true } } : answer(call.json())
    }, { method: ROUTE.post })
  }
  return world
}

/** Load the world's page and add core's handles (see the file comment). */
export async function loadCorePage(t, world) {
  const page = await loadPage(t, world)
  const configTree = () => page.tree()
  return Object.assign(page, {
    open: (view = DSH.view.page) => page.openConfig(CORE.bundle, view),
    close: () => page.closeConfig(),
    entries: () => world.configEntries(CORE.bundle),
    coreValue: () => world.valueOf(CORE.namespace),
    /** The field wrapper of one setting, and the input inside it. */
    field(name) {
      const [wrapper] = page.byAttr(MARK.field, name, configTree())
      const input = wrapper ? findAll([wrapper], (n) => n.tag === 'input')[0] : undefined
      return { wrapper, input }
    },
    async editField(name, value) {
      const { input } = page.field(name)
      if (!input) throw new Error('no input for ' + name)
      await page.edit(input, value)
    },
  })
}

/** A loaded core page; `view` opens its configuration entry (null: nothing is mounted). */
export async function corePage(t, options = {}, view = DSH.view.page) {
  const page = await loadCorePage(t, coreWorld(options))
  if (view) await page.open(view)
  return page
}
