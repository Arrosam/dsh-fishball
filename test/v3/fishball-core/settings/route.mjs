/**
 * The Node seams between these cases and `packages/core/src/settings/index.js`: the pure target
 * rule (`effectiveTarget`, `hasInstanceTarget`), and the Connect route (requirement 5),
 * `registerSettingsRoutes(ctx)`, with a fake DSH `ctx`. The fake records the
 * registration (`ctx.connection.fetch.register`) and answers `ctx.get(name)` from a map the test may
 * change between requests, so "looked up per request, never cached" is observable.
 */
import { pathToFileURL } from 'node:url'
import { BEGIN_VIA, DSH, FIXTURE, ROUTE, SUBJECT } from './constants.mjs'
import { logRecorder } from '../link/log-privacy.mjs'

/**
 * A `fishballInstance` whose `ui.connect` answers with `status` / `begin` / `cancel` (each may be a
 * function, which may throw or return a rejecting promise). A `begin` function is called as it is,
 * so its synchronous throw stays synchronous; a `begin` value is answered as a resolved promise.
 * `via` (F-FIX-3) adds core's route-only begin (`connect[BEGIN_VIA](via)`, link/connect.js) the same way.
 */
export function instanceWith({ apiVersion = ROUTE.apiVersion, status, begin, cancel, via } = {}) {
  const calls = { status: 0, begin: [], cancel: 0, via: [] }
  const answer = (value) => (typeof value === 'function' ? value() : Promise.resolve(value))
  const connect = {
    status() { calls.status += 1; return typeof status === 'function' ? status() : status },
    begin(...args) { calls.begin.push(args); return answer(begin) },
    cancel() { calls.cancel += 1; return typeof cancel === 'function' ? cancel() : undefined },
    onChange: () => () => {},
  }
  if (via !== undefined) connect[BEGIN_VIA] = (...args) => { calls.via.push(args); return answer(via) }
  return { service: { apiVersion, ui: { connect } }, calls }
}

/** The pure target-precedence rule `{effectiveTarget, hasInstanceTarget}` of the same module. */
export async function targetRule() {
  const mod = await import(pathToFileURL(SUBJECT.route).href)
  const rule = { effective: mod[SUBJECT.targetExports.effective], hasInstance: mod[SUBJECT.targetExports.hasInstance] }
  for (const [key, name] of Object.entries(SUBJECT.targetExports)) {
    if (typeof rule[key] !== 'function') throw new Error(`${SUBJECT.route} exports no ${name}`)
  }
  return rule
}

/**
 * Register the route once with a fake ctx. Resolves to {routes, services, gets, log, request(method, body?, path?)}.
 * F-FIX-3 options: `logger: false` gives a ctx with no `logger` member; otherwise `ctx.logger(name)`
 * records every call in `log` (log-privacy.mjs). `callbackFor` is passed to `registerSettingsRoutes`;
 * `cancel` also registers `registerConnectCancelRoute(ctx)`.
 */
export async function routeWorld(services = {}, { logger = true, callbackFor, cancel = false } = {}) {
  const mod = await import(pathToFileURL(SUBJECT.route).href)
  const register = mod[SUBJECT.routeExport]
  if (typeof register !== 'function') throw new Error(`${SUBJECT.route} exports no ${SUBJECT.routeExport}`)
  const routes = []
  const gets = []
  const log = logRecorder()
  const live = new Map(Object.entries(services))
  const ctx = {
    connection: { fetch: { register(route) { routes.push(route); return () => {} } } },
    get(name) { gets.push(name); return live.get(name) },
    effect(fn) { return fn() },
    ...(logger ? { logger: log.of } : {}),
  }
  await register(ctx, ...(callbackFor === undefined ? [] : [{ callbackFor }]))
  if (cancel) {
    if (typeof mod[SUBJECT.cancelExport] !== 'function') throw new Error(`${SUBJECT.route} exports no ${SUBJECT.cancelExport}`)
    await mod[SUBJECT.cancelExport](ctx)
  }
  const request = async (method, body, at = ROUTE.path) => {
    const route = routes.find((r) => r.path === at)
    if (!route) throw new Error('no route registered at ' + at)
    const response = await route.fetch(new Request(new URL(at, FIXTURE.base), { method, body }))
    const text = await response.text()
    let json
    try { json = JSON.parse(text) } catch { json = undefined }
    return { status: response.status, headers: response.headers, text, json }
  }
  return {
    routes, gets, log, request,
    setInstance(value) { if (value === undefined) live.delete(DSH.service.instance); else live.set(DSH.service.instance, value) },
  }
}
