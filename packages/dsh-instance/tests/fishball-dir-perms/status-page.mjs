/** The settings page fed by the instance's real status and model-sync routes. */
import assert from 'node:assert/strict'
import { configForm, openPage, trackLocale } from '@dsh-instance/test-helpers/page'
import { primitivesFor } from '@dsh-instance/test-helpers/primitives'
import { fetchRegistry } from '@dsh-instance/test-helpers/routes'
import { PACKAGE_DIR, importInstance } from '../support/instance.mjs'
import { HARNESS, MODULES, STATES, UI } from './constants.mjs'

export async function openStatusPage(t, sdk, { state = STATES.ready, code = null, detail = null, notice = null, lang = UI.langs[0] } = {}) {
  const { registerInstanceRoutes } = await importInstance(sdk, MODULES.routes)
  const { registerProviderSyncRoutes } = await importInstance(sdk, MODULES.syncRoutes)
  const { routes, fetch } = fetchRegistry()
  const ctx = {
    connection: { fetch, requestRejection: () => undefined },
    effect: (fn) => fn(),
    on: () => () => {},
    logger: () => ({ debug() {}, info() {}, warn() {}, error() {} }),
  }
  const world = { status: { state, code, detail }, notice }
  const service = {
    status: () => ({ ...world.status }),
    notice: () => world.notice,
    busy: () => false,
    async retry() {},
    async reconnect() { return { ok: true } },
    async open() { return { ok: false, code: 'not-ready' } },
    providerSync: {
      status: () => ({ state: STATES.ready }),
      async check() { return { ok: true, result: { checkId: 'fbtest', missing: [], notOffered: [], present: 0 } } },
      async add() { return { ok: true, result: { items: [] } } },
    },
  }
  registerInstanceRoutes(ctx, service)
  registerProviderSyncRoutes(ctx, service)

  const { registeredDicts, missingKeys, decorateLocale } = trackLocale()
  const page = await openPage(t, {
    sdk, packageDir: PACKAGE_DIR, id: UI.rowId, entry: MODULES.clientEntry, lang, base: HARNESS.pageBase,
    primitives: (React) => primitivesFor(sdk, React, { modal: true }),
    respond({ method, path, body, headers }) {
      const route = routes.find((r) => r.path === path && r.methods.includes(method))
      if (!route) return new Response('', { status: 404 })
      const url = new URL(path, HARNESS.pageBase)
      return route.fetch(new Request(url, { method, headers: { ...headers, host: url.host, 'sec-fetch-site': 'same-origin' }, body }))
    },
    decorateLocale,
    services() {
      const form = configForm({ enabled: true })
      return {
        configForms: { get: () => form, whileServed: (namespaces, register) => register(new Set(namespaces)) },
        remote: { $on: () => () => {}, pluginManager: { listBundles: async () => ({ ok: true, value: [] }) } },
      }
    },
  })
  const entry = UI.configSlots.flatMap(page.entriesOf).find((e) => String(e.options.key ?? '').startsWith(UI.rowId))
  assert.ok(entry, 'missing settings entry for ' + UI.rowId + '; errors: ' + page.errors.join('; '))
  const tree = await page.mountEntry('page', entry, { view: 'page' })
  return {
    world: { errors: page.errors }, registeredDicts, missingKeys, until: page.until,
    text: page.text,
    byAttr(name, value) {
      return page.find(tree(), (n) => n.props[name] !== undefined && n.props[name] !== false && (value === undefined || String(n.props[name]) === String(value)))
    },
  }
}
