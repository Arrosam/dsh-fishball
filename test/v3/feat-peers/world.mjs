/**
 * One DSH for the FEAT-PEERS cases, built in-process from the installed SDK's real cordis,
 * cordis-plugin-loader and dsh-session (read only), as the C-EXT world does: no DSH process and no
 * Fishball child is launched.
 * - each feature plugin is its package's row (subject.mjs) mounted as a loader row, so "boot ok" is
 *   the row's fiber reaching ACTIVE with no load error;
 * - DSH's services the rows read are provided on the root context: `tools` (a recording global
 *   registry), `profileContext` (a throwaway home), `sessions` (the SDK's real SessionStore). Every
 *   other name a row's own `inject` declares gets an inert stand-in, because a real DSH provides
 *   all its services and a row must not stay pending for want of one;
 * - `core: true` adds a fake `fishballInstance` (K3 `apiVersion: 1`) with the X1/X2/X8/X9 members:
 *   X1 `manager.sessionId()` names a real session of the SessionStore; X2 `registerSetup` runs each
 *   setup as its own fiber on a separate agent context whose `tools` and `systemPrompt` are the
 *   manager scope; X8 `attention.signal` is the fake core attention member (Q-14), recording every
 *   call and answering `attention` (`ATTENTION.accepted` or `ATTENTION.refused`); X9 `inbox` only
 *   accepts registrations.
 * Everything observed is public: log records, the registries, the session's plugin records, the
 * fake member's calls and the files under the home.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { importSdk } from '../../private-skills/support/sdk.mjs'
import { ATTENTION, DSH, FIXTURE, INSTANCE_API_VERSION } from './constants.mjs'
import { rowModule, runTool } from './subject.mjs'

const json = (value) => JSON.stringify(value)
const SERVICE = DSH.services
const OWN_SERVICE_PREFIX = 'fishball'

/** A registry with DSH's `register(definition) → dispose` shape that keeps what is registered. */
function recordingRegistry() {
  const tools = new Map()
  return {
    tools,
    register(definition) {
      tools.set(definition.name, definition)
      return () => { if (tools.get(definition.name) === definition) tools.delete(definition.name) }
    },
  }
}

/** The manager's agent scope: tools plus the agent-scoped prompt sections and contexts (X2). */
function managerScope() {
  const registry = recordingRegistry()
  const sections = new Map()
  const contexts = new Map()
  const keep = (map) => (entry) => { map.set(entry.name, entry); return () => map.delete(entry.name) }
  return {
    registry, sections, contexts,
    systemPrompt: { section: keep(sections), context: keep(contexts), getSectionOrder: (name) => name, suppressRuntimeContext() {} },
  }
}

/** The service names a row's `inject` declares (a list, or cordis' object form). */
function injectNames(inject) {
  if (inject === undefined) return []
  return Array.isArray(inject) ? inject : Object.keys(inject)
}

/**
 * A world in a fresh canonical temp root, closed and removed by `t`'s cleanup.
 * Options: `core` (a fake fishballInstance), `attention` (its member's answer).
 */
export async function worldFor(t, sdk, { core = false, attention = ATTENTION.accepted } = {}) {
  const root = await realpath(os.tmpdir())
  const dir = await mkdtemp(path.join(root, FIXTURE.tempPrefix))
  let world
  t.after(async () => {
    await world?.close()
    const target = await realpath(dir)
    assert.equal(path.dirname(target), root, 'refusing to remove ' + target)
    assert.ok(path.basename(target).startsWith(FIXTURE.tempPrefix), 'refusing to remove ' + target)
    await rm(target, { recursive: true, force: true })
  })
  world = await openWorld(sdk, dir, { core, attention })
  return world
}

async function openWorld(sdk, dir, { core, attention }) {
  const [{ Context }, { Loader }, { SessionStore, pluginRecordOf }] = await Promise.all([importSdk(sdk, DSH.cordis), importSdk(sdk, DSH.loader), importSdk(sdk, DSH.session)])
  const home = path.join(dir, FIXTURE.homeDir)
  fs.mkdirSync(home)
  const ctx = new Context()
  const logs = []
  ctx.logger.exporter({ levels: { default: DSH.allLevels }, export: (m) => logs.push({ name: m.name, type: m.type, text: m.args.map((a) => (typeof a === 'string' ? a : json(a))).join(' ') }) })
  await ctx.plugin(SessionStore)
  await ctx.plugin(Loader)
  const loader = ctx.loader
  const global = recordingRegistry()
  ctx.provide(SERVICE.tools, global)
  ctx.provide(SERVICE.profileContext, { name: FIXTURE.profileName, dir: home, home, cwd: home })

  const manager = { session: ctx.sessions.create(), scope: managerScope(), setups: [], agentCtx: undefined }
  manager.agent = { id: manager.session.id, session: manager.session }
  const signals = []
  const instance = {
    apiVersion: INSTANCE_API_VERSION,
    manager: {
      sessionId: () => manager.session.id,
      async ensureSession() { return manager.session.id },
      /** X2: each setup is its own fiber on the manager's agent context; `dispose` removes it. */
      registerSetup(pluginId, fn) {
        manager.setups.push(pluginId)
        const fiber = manager.agentCtx.plugin({ apply: (scope) => fn(scope, manager.agent) })
        return () => fiber.dispose()
      },
    },
    attention: {
      async signal(pluginId, intent) {
        signals.push({ pluginId, intent: structuredClone(intent) })
        return structuredClone(attention)
      },
    },
    inbox: { claim: () => () => {}, release: async () => {}, setBatcher: () => () => {} },
  }
  if (core) {
    manager.agentCtx = new Context()
    manager.agentCtx.provide(SERVICE.tools, manager.scope.registry)
    manager.agentCtx.provide('systemPrompt', manager.scope.systemPrompt)
    ctx.provide(SERVICE.instance, instance)
  }

  const rows = new Map()
  let callSeq = 0
  const world = {
    sdk, home, ctx, logs, global, manager, signals,
    /** Mounts `plugin`'s row; returns its loader entry id (the row's errors stay in its fiber). */
    async load(plugin) {
      const mod = await rowModule(sdk, plugin)
      for (const name of injectNames(mod.inject)) {
        if (!name.startsWith(OWN_SERVICE_PREFIX) && ctx.get(name) === undefined) ctx.provide(name, {})
      }
      loader.builtins[plugin.name] = mod
      const id = await loader.create({ name: DSH.builtinPrefix + plugin.name })
      rows.set(plugin.name, id)
      await loader.await().catch(() => {})
      return id
    },
    /** Whether `plugin`'s row is up: its fiber ACTIVE ("boot ok"). */
    active: (plugin) => loader.resolve(rows.get(plugin.name))?.fiber?.state === DSH.fiberActive,
    linesWith: (needle) => logs.filter((l) => l.text.includes(needle)),
    /** Every file under the home, relative ("does nothing" leaves it empty). */
    files: () => fs.readdirSync(home, { recursive: true }).sort(),
    /** One manager tool call by the manager's agent. */
    call(name, args) {
      const definition = manager.scope.registry.tools.get(name)
      assert.ok(definition, `the manager scope has no ${name}`)
      const exec = { callId: FIXTURE.callIdPrefix + ++callSeq, name, arguments: args, agent: manager.agent, signal: new AbortController().signal, deferContext() {}, concludeTurn() {} }
      return runTool(definition, args, exec)
    },
    /** The manager session's plugin records whose type starts with `prefix`. */
    records: (prefix) => manager.session.snapshotEvents().map((e) => pluginRecordOf(e)).filter((r) => r?.type.startsWith(prefix)),
    readFile: (parts) => {
      const file = path.join(home, ...parts)
      return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
    },
    async close() {
      await ctx.fiber.dispose()
      await manager.agentCtx?.fiber.dispose()
    },
  }
  return world
}
