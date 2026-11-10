/**
 * Shared observation and fault-injection helpers for the manager-attach black-box suites
 * (packages/instance/test/instance-ext/manager-attach-background.test.mjs).
 *
 * Built only on public contracts: the `fishballInstance` / `fishballChat` services of a bootChild
 * harness, the selected SDK's real WorkspaceRegistry (public API: create / resolveByPath / get /
 * list, Workspace.sessionIds / attachSession) and the `/api/fishball/session` route module.
 * The fault wrapper reads its fault plan at each call, so a case clears a fault between attempts.
 */
import assert from 'node:assert/strict'
import { mkdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { SERVICES } from './instance-ext.mjs'
import { loadInstance } from './body-soul-env.mjs'

export const ATTACH = Object.freeze({
  managerFolder: Object.freeze(['fishball', 'assistant']),
  chatRecord: Object.freeze(['fishball', 'chat.json']),
  route: Object.freeze({ origin: 'http://127.0.0.1:1', path: '/api/fishball/session', ok: 200, unavailable: 503, body: '{}' }),
  unavailableBody: Object.freeze({ code: 'MANAGER_UNAVAILABLE' }),
  fault: Object.freeze({ reject: 'reject', throw: 'throw' }),
  faultMessage: 'injected workspace registry fault (manager-attach suite)',
  warn: 'warn',
})

/** `<home>/fishball/assistant`, canonical; created when missing (the registry canonicalizes it). */
export async function managerFolder(home, { create = true } = {}) {
  const folder = path.join(home, ...ATTACH.managerFolder)
  if (create) await mkdir(folder, { recursive: true })
  return realpath(folder)
}

/** Workspaces of the real registry whose canonical path is `folder`. */
export function workspacesAt(h, folder) {
  return h.workspaces.list().filter((workspace) => workspace.path === folder)
}

/** Every workspace whose sessionIds name `sessionId` (one entry per slot). */
export function memberships(h, sessionId) {
  return h.workspaces.list().flatMap((workspace) => workspace.sessionIds.filter((id) => id === sessionId).map(() => workspace))
}

/** Exactly one workspace over the manager folder, holding the manager once and nowhere else. */
export async function assertAttached(h, sessionId) {
  const folder = await managerFolder(h.home, { create: false })
  const owners = workspacesAt(h, folder)
  assert.equal(owners.length, 1, 'exactly one workspace over ' + folder + '; workspaces: ' + describeWorkspaces(h))
  assert.equal(owners[0].sessionIds.filter((id) => id === sessionId).length, 1, 'the manager is listed once in its workspace: ' + describeWorkspaces(h))
  assert.equal(memberships(h, sessionId).length, 1, 'the manager is in exactly one workspace')
  return owners[0]
}

/** The manager is a member of no workspace at all. */
export function assertUnattached(h, sessionId) {
  assert.deepEqual(memberships(h, sessionId).map(({ path: p }) => p), [], 'the manager stays unattached: ' + describeWorkspaces(h))
}

export function describeWorkspaces(h) {
  return JSON.stringify(h.workspaces.list().map(({ path: p, sessionIds }) => ({ path: p, sessionIds })))
}

/** Distinct session ids the fake agents service ever created or resumed. */
export function sessionIdsSeen(h) {
  return new Set(h.agents.map(({ live }) => live.id))
}

/** The one manager session id the harness saw (fails when there is not exactly one). */
export function onlySessionId(h) {
  const ids = [...sessionIdsSeen(h)]
  assert.equal(ids.length, 1, 'exactly one manager session exists: ' + JSON.stringify(ids))
  return ids[0]
}

/** Settle a promise into {status, value|reason} without letting it throw. */
export async function outcome(promise) {
  try { return { status: 'fulfilled', value: await promise } } catch (reason) { return { status: 'rejected', reason } }
}

/** Warn entries the child's loggers recorded so far. */
export function warnCount(h) {
  return h.logs.filter(({ level }) => level === ATTACH.warn).length
}

/** The documented session route over the live instance of `h`: call('GET'|'POST'). */
export async function routeOf(h) {
  const { registerSessionRoute } = await loadInstance('src/native-runtime/session-route.js')
  const routes = []
  registerSessionRoute({
    on: () => () => {},
    connection: { fetch: { register(route) { routes.push(route); return () => {} } } },
    get: (name) => (name === SERVICES.instance ? h.instance : undefined),
  })
  assert.equal(routes.length, 1)
  return async function call(method) {
    const response = await routes[0].fetch(new Request(ATTACH.route.origin + ATTACH.route.path, { method, ...(method === 'POST' ? { body: ATTACH.route.body } : {}) }))
    return { status: response.status, body: await response.json() }
  }
}

/**
 * A registry replacement over the real one. `faults` keys: `create` (registry.create and
 * initializeDefault), `resolve` (resolveByPath), `attach` (Workspace.attachSession); values
 * ATTACH.fault.reject | ATTACH.fault.throw. Every call is counted in `calls`.
 */
export function faultable(faults = {}) {
  const calls = { create: 0, resolveByPath: 0, initializeDefault: 0, attachSession: 0 }
  function inject(kind) {
    const mode = faults[kind]
    if (mode === ATTACH.fault.throw) return () => { throw new Error(ATTACH.faultMessage + ' (' + kind + ', sync)') }
    if (mode === ATTACH.fault.reject) return () => Promise.reject(new Error(ATTACH.faultMessage + ' (' + kind + ')'))
    return undefined
  }
  function wrapWorkspace(workspace) {
    if (workspace === undefined) return undefined
    return new Proxy(workspace, {
      get(target, prop) {
        if (prop === 'attachSession') return (...args) => { calls.attachSession++; return (inject('attach') ?? target.attachSession.bind(target))(...args) }
        const value = Reflect.get(target, prop, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  }
  const make = (real) => new Proxy(real, {
    get(target, prop) {
      if (prop === 'create' || prop === 'initializeDefault') return (...args) => { calls[prop]++; const fault = inject('create'); if (fault) return fault(); return target[prop](...args).then(wrapWorkspace) }
      if (prop === 'resolveByPath') return (...args) => { calls.resolveByPath++; const fault = inject('resolve'); if (fault) return fault(); return target.resolveByPath(...args).then(wrapWorkspace) }
      if (prop === 'get') return (id) => wrapWorkspace(target.get(id))
      if (prop === 'list') return () => target.list().map(wrapWorkspace)
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  return {
    make,
    calls,
    faults,
    /** Registry writes the child attempted (create + initializeDefault + attachSession). */
    writes: () => calls.create + calls.initializeDefault + calls.attachSession,
    clear() { for (const key of Object.keys(faults)) delete faults[key] },
  }
}

/** Poll with real timers until `check()` holds; bounded, returns the final check value. */
export async function waitFor(check, { budgetMs = 5000, pollMs = 10 } = {}) {
  const deadline = Date.now() + budgetMs
  let value = check()
  while (!value && Date.now() < deadline) { await new Promise((resolve) => setTimeout(resolve, pollMs)); value = check() }
  return value
}
