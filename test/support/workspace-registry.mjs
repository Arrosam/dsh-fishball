/**
 * Workspace registries for child harnesses (manager workspace attach, user decision 7.A fix).
 *
 * Every manager activation now ensures `workspaceRegistry.create(<manager folder>)` and
 * `attachSession(<manager id>)`, and a missing registry is an activation error, so a harness
 * that composes the child chat must provide one. Two forms, both honouring the public
 * `@deepseek-ai/dsh-workspace` contract (create(path,title?) idempotent per canonical path,
 * resolveByPath, get, list; Workspace.sessionIds / attachSession validating the header cwd):
 * - `startWorkspaceRegistry`: the SELECTED SDK's real WorkspaceRegistry over its real storage
 *   hub, JSON backend and domain form, with a fixture session-persistence listing.
 * - `createFakeWorkspaceRegistry`: a small in-memory registry for harnesses without a
 *   SessionStore (body-soul-chat); `headerOf(id)` supplies the session header it validates.
 * The `@deepseek-ai/*` imports resolve through the FBTEST_DSH_RUNTIME hooks, which the caller's
 * loadInstance/loadConnector have installed before this module is imported.
 */
import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'

const REGISTRY = Object.freeze({
  service: 'workspaceRegistry',
  backend: 'json',
})

/**
 * Start the real registry. `sessions` is the live SessionStore; `storedHeaders()` lists the
 * headers the fixture persistence holds (the registry's bootstrap and attach validation read it).
 * Resolves `{ registry, dispose }`.
 */
export async function startWorkspaceRegistry({ root, sessions, storedHeaders }) {
  const { Context } = await import('@deepseek-ai/cordis')
  const { default: Storage } = await import('@deepseek-ai/dsh-storage')
  const storageJson = await import('@deepseek-ai/dsh-storage-json')
  const storageDomain = await import('@deepseek-ai/dsh-storage-domain')
  const { WorkspaceRegistry } = await import('@deepseek-ai/dsh-workspace')
  const context = new Context()
  await context.plugin(Storage)
  await context.plugin(storageJson, { root })
  await context.plugin(storageDomain, { backend: REGISTRY.backend })
  context.provide('sessionPersistence', { async list() { return storedHeaders().map((header) => ({ header })) } })
  context.provide('sessions', sessions)
  // The fiber settles once the Service's init has finished (checked on both SDKs) and rejects
  // with init's own error, so a failed start reports its cause instead of an exhausted poll.
  await context.plugin(WorkspaceRegistry)
  const registry = context.get(REGISTRY.service)
  if (registry === undefined) throw new Error('the SDK WorkspaceRegistry did not start')
  return { registry, dispose: () => context.fiber.dispose() }
}

/** Canonical directory path, as the SDK's create/resolveByPath compute it. */
async function canonicalDirectory(target) {
  if (typeof target !== 'string' || !path.isAbsolute(target)) throw new TypeError('workspace path is not fully qualified: ' + target)
  const canonical = await realpath(target)
  if (!(await stat(canonical)).isDirectory()) throw new Error('not a directory: ' + canonical)
  return canonical
}

/** In-memory registry with the public shape; `headerOf(id)` returns a session header or undefined. */
export function createFakeWorkspaceRegistry({ headerOf }) {
  const workspaces = []
  let counter = 0
  function entity(canonical, title) {
    const sessionIds = []
    const now = new Date().toISOString()
    return {
      id: 'workspace-fake-' + ++counter,
      path: canonical,
      title: title ?? path.basename(canonical),
      createdAt: now,
      updatedAt: now,
      get sessionIds() { return Object.freeze([...sessionIds]) },
      async setTitle(next) { this.title = next },
      async attachSession(sessionId) {
        if (sessionIds.includes(sessionId)) return
        const cwd = headerOf(sessionId)?.cwd
        if (typeof cwd !== 'string') throw new Error(`cannot validate session '${sessionId}': no header cwd`)
        if (await canonicalDirectory(cwd) !== canonical) throw new Error(`session '${sessionId}' cwd differs from workspace path '${canonical}'`)
        sessionIds.unshift(sessionId)
      },
      async detachSession(sessionId) { const at = sessionIds.indexOf(sessionId); if (at >= 0) sessionIds.splice(at, 1) },
      async status() { try { await canonicalDirectory(canonical); return 'ok' } catch { return 'missing-dir' } },
    }
  }
  return {
    workspaces,
    async create(target, title) {
      const canonical = await canonicalDirectory(target)
      const existing = workspaces.find((workspace) => workspace.path === canonical)
      if (existing !== undefined) return existing
      const created = entity(canonical, title)
      workspaces.unshift(created)
      return created
    },
    async resolveByPath(target) {
      const canonical = await canonicalDirectory(target)
      return workspaces.find((workspace) => workspace.path === canonical)
    },
    get: (id) => workspaces.find((workspace) => workspace.id === id),
    list: () => [...workspaces],
  }
}
