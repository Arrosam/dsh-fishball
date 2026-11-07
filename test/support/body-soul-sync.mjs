/**
 * The model-sync harness for body-soul I6 (design §10): the main-side bridge
 * (createChildProviderSync) talks over an in-memory wire to the child's real provider-sync
 * endpoint (src/slim/child/provider-sync-target.js), whose engine runs over the existing engine
 * fixture's fake child host (test/support/provider-sync-engine.mjs: in-memory settings and a real
 * official credential store in a throwaway home). The source side is a fake main host whose
 * inventory the test plants and whose key records live in a second official store.
 *
 * Observations: the fake child host's `calls` (inventory reads, provider additions, key imports)
 * and this harness's `sourceReads` (keys read on the main side). Planted values that must never
 * reach an answer: every generated key (asserted by the official stores' assertNoLeak), the
 * planted endpoint, the key mask and a planted environment-variable name.
 */
import assert from 'node:assert/strict'
import { CASE, clone, engineFixture, inventory, provider } from './provider-sync-engine.mjs'
import { officialCredentials } from './provider-sync-official.mjs'
import { loadInstance } from './body-soul-env.mjs'

export const SYNC_IDS = Object.freeze({ ...CASE.ids, plantedEnv: 'planted-env-provider' })
export const SYNC_PLANTED = Object.freeze({
  endpoint: CASE.profile.baseURL,
  mask: CASE.mask,
  envName: 'FBTEST_PLANTED_API_KEY_ENV',
  protocol: CASE.profile.api,
})
/** The preview's life (§10 "the preview's 5-minute life"). */
export const PREVIEW_LIFE_MS = 5 * 60 * 1000

/** One in-memory wire: the main end and the child end, delivered asynchronously like a socket. */
function wire() {
  const handlers = { main: { message: new Set(), close: new Set() }, child: { message: new Set(), close: new Set() } }
  let open = true
  const end = (self, other) => ({
    send(encoded) { if (!open) throw new Error('wire closed'); queueMicrotask(() => { if (open) for (const fn of handlers[other].message) fn(encoded) }) },
    onMessage(fn) { handlers[self].message.add(fn); return () => handlers[self].message.delete(fn) },
    onClose(fn) { handlers[self].close.add(fn); return () => handlers[self].close.delete(fn) },
  })
  return {
    main: end('main', 'child'),
    child: end('child', 'main'),
    /** The wire is lost: both ends hear onClose. */
    lose() { if (!open) return; open = false; for (const side of ['main', 'child']) for (const fn of [...handlers[side].close]) fn() },
  }
}

/** Default main inventory: two missing, one present, one conflict, one not offered with a planted env name. */
function defaultSource() {
  return inventory(CASE.source, [
    provider(SYNC_IDS.add),
    provider(SYNC_IDS.second),
    provider(SYNC_IDS.exists),
    provider(SYNC_IDS.conflict),
    provider(SYNC_IDS.plantedEnv, { profile: { ...clone(CASE.profile), apiKeyEnv: SYNC_PLANTED.envName } }),
  ])
}
function defaultTarget() {
  return inventory(CASE.target, [
    provider(SYNC_IDS.exists),
    provider(SYNC_IDS.conflict, { profile: { ...clone(CASE.profile), baseURL: 'https://other.example.invalid/v1' } }),
  ])
}

export async function syncHarness(t, { source = defaultSource(), target = defaultTarget(), now = Date.now() } = {}) {
  const { createChildProviderSync } = await loadInstance('src/provider-sync-service.js')
  const { createProviderSyncTarget, createProviderSyncTargetEndpoint } = await loadInstance('src/slim/child/provider-sync-target.js')
  const child = await engineFixture(t, source, target)
  // The engine fixture's clock starts in 2023 with a 1 s plan life; put it far enough ahead that
  // the main side's own preview life (§10, five minutes) is the one that decides expiry.
  child.state.now = now + 10 * PREVIEW_LIFE_MS
  const sourceCredentials = await officialCredentials()
  t.after(() => sourceCredentials.close())
  for (const entry of source.providers) await sourceCredentials.seed(entry.id, sourceCredentials.record())
  const sourceReads = []
  const sourceState = { inventory: clone(source) }
  const sourceHost = {
    async inventory() { return clone(sourceState.inventory) },
    async readRecord(id) { sourceReads.push(id); return sourceCredentials.read(id) },
  }
  const childTarget = createProviderSyncTarget({ engine: child.engine })
  const sync = createChildProviderSync({ identity: clone(CASE.source), createHost: async () => sourceHost })
  t.after(() => sync.close())
  const endpoints = []
  let current
  /** Attach a fresh wire: the first start, or a child restart (a new connection). */
  function connect() {
    const link = wire()
    const endpoint = createProviderSyncTargetEndpoint({ target: childTarget })
    endpoint.attach(link.child)
    endpoints.push(endpoint)
    sync.attach(link.main, { instanceId: 'fbtest-instance' })
    current = link
    return link
  }
  t.after(() => { for (const endpoint of endpoints) endpoint.close() })
  connect()

  /** Every observable answer is checked for planted values before a test reads it. */
  function assertClean(value) {
    const text = JSON.stringify(value)
    sourceCredentials.assertNoLeak(text)
    child.credentials.assertNoLeak(text)
    for (const [name, planted] of Object.entries(SYNC_PLANTED)) assert.equal(text.includes(planted), false, 'planted ' + name + ' reached the answer')
    return value
  }
  /** A gate the fake child host waits on at its n-th inventory read (to hold a check or an add mid-flight). */
  function holdInventoryAt(n) {
    let release
    const gate = new Promise((resolve) => { release = resolve })
    let reached
    const arrived = new Promise((resolve) => { reached = resolve })
    child.state.inventoryHook = async (count) => { if (count === n) { reached(); await gate } }
    return { arrived, release: () => release() }
  }
  return {
    sync, child, sourceReads, sourceState, connect, holdInventoryAt,
    lose: () => current.lose(),
    check: async () => assertClean(await sync.check()),
    add: async (payload) => assertClean(await sync.add(payload)),
    assertClean,
    writes: () => ({ additions: child.calls.additions.map((a) => a.id), imports: child.calls.imports.map((i) => i.id) }),
  }
}

/** A stand-in for the instance row's context, enough for registerProviderSyncRoutes. */
export function routeContext({ crossSiteStatus = 403 } = {}) {
  const routes = new Map()
  const ctx = {
    connection: {
      requestRejection: ({ headers }) => ((typeof headers.get === 'function' ? headers.get('sec-fetch-site') : headers['sec-fetch-site']) === 'cross-site' ? crossSiteStatus : undefined),
      fetch: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } },
    },
    effect(fn) { const dispose = fn(); return dispose },
  }
  return { ctx, routes }
}

/** POST one body to a registered route through its Fetch handler; answers {status, json, text}. */
export async function post(routes, path, body, headers = { 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' }) {
  const route = routes.get(path)
  if (route === undefined) throw new Error('route not registered: ' + path)
  const response = await route.fetch(new Request('http://dsh.internal' + path, { method: 'POST', headers, body }))
  const text = await response.text()
  let json
  try { json = JSON.parse(text) } catch { json = undefined }
  return { status: response.status, json, text }
}
