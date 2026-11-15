/**
 * The Connect route (requirement 5) with a fake DSH `ctx`: the one seam between these cases and
 * `packages/core/src/settings/index.js`'s `registerSettingsRoutes(ctx)`. The fake records the
 * registration (`ctx.connection.fetch.register`) and answers `ctx.get(name)` from a map the test may
 * change between requests, so "looked up per request, never cached" is observable.
 */
import { pathToFileURL } from 'node:url'
import { DSH, FIXTURE, ROUTE, SUBJECT } from './constants.mjs'

/** A `fishballInstance` whose `ui.connect` answers with `status` / `begin` (each may be a function that throws). */
export function instanceWith({ apiVersion = ROUTE.apiVersion, status, begin } = {}) {
  const calls = { status: 0, begin: [] }
  const service = {
    apiVersion,
    ui: {
      connect: {
        status() { calls.status += 1; return typeof status === 'function' ? status() : status },
        async begin(...args) { calls.begin.push(args); return typeof begin === 'function' ? begin() : begin },
        cancel() {},
        onChange: () => () => {},
      },
    },
  }
  return { service, calls }
}

/** Register the route once with a fake ctx. Resolves to {routes, services, gets, request(method, body?)}. */
export async function routeWorld(services = {}) {
  const mod = await import(pathToFileURL(SUBJECT.route).href)
  const register = mod[SUBJECT.routeExport]
  if (typeof register !== 'function') throw new Error(`${SUBJECT.route} exports no ${SUBJECT.routeExport}`)
  const routes = []
  const gets = []
  const live = new Map(Object.entries(services))
  const ctx = {
    connection: { fetch: { register(route) { routes.push(route); return () => {} } } },
    get(name) { gets.push(name); return live.get(name) },
    effect(fn) { return fn() },
    logger: () => ({ warn() {}, info() {}, debug() {}, error() {} }),
  }
  await register(ctx)
  const request = async (method, body) => {
    const route = routes.find((r) => r.path === ROUTE.path)
    if (!route) throw new Error('no route registered at ' + ROUTE.path)
    const response = await route.fetch(new Request(new URL(ROUTE.path, FIXTURE.base), { method, body }))
    const text = await response.text()
    let json
    try { json = JSON.parse(text) } catch { json = undefined }
    return { status: response.status, headers: response.headers, text, json }
  }
  return {
    routes, gets, request,
    setInstance(value) { if (value === undefined) live.delete(DSH.service.instance); else live.set(DSH.service.instance, value) },
  }
}
