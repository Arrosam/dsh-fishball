/**
 * fishball-core's extension of the fishball-test-helpers DSH world (dsh-world `extension`): the child
 * side. Loaded in the booted DSH's process; adds core's ops on top of the world's base ops. Every op
 * reads a public surface only: core's published services (`fishballInstance`, `fishballStatus`, K3
 * `contracts/index.d.ts`, `ui.d.ts`), DSH's settings, plugin manager and credential services, the
 * scripted model's request digests and the session log. The parent side is ./core-world.mjs.
 *
 * Owned by the wire area (packages/core/tests/support/ is port-core-wire's).
 *
 * The home-level patch: when FBTEST_CORE_HOME_PATCH (a JSON patch list) is set, it is written to the
 * home's `cordis.patch.yml` before DSH starts. DSH reads that file at every start and at every
 * reconcile (dsh-app-boot readProfilePatches: bundle patches, the profile patch, the home patch, the
 * launch overlays), so a row there is an on-disk row the owner edited, as the profile patch would be.
 * The profile's own patch cannot be written before the first start (the profile folder does not exist
 * yet, and the world initializes it only when it is missing). `setHomePatch` rewrites the same file and
 * reconciles, as DSH's config editor does after a file edit.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { importRuntime, RUNTIME } from 'fishball-test-helpers/runtime'
import { until } from 'fishball-test-helpers/wait'
import { CORE_WORLD } from './core-world-names.mjs'

const N = CORE_WORLD

// Before DSH starts: the home patch the parent asked for (see the module comment).
const homePatchFile = path.join(fs.realpathSync(process.env.DSH_HOME), N.patchFile)
if (process.env[N.env.homePatch]) fs.writeFileSync(homePatchFile, process.env[N.env.homePatch])

/** Seed the same writable profile document DSH settings will mutate; keep its edits on restart. */
export async function prepare({ profileDir, firstStart }) {
  const initial = process.env[N.env.profileConfig]
  if (!firstStart || initial === undefined) return
  const file = path.join(profileDir, N.patchFile)
  const { parseDocument, isMap, isSeq } = await import(pathToFileURL(path.join(RUNTIME, N.yaml)).href)
  const doc = parseDocument(fs.existsSync(file) ? fs.readFileSync(file, N.encoding) : '[]')
  if (doc.errors.length) throw doc.errors[0]
  if (!isSeq(doc.contents)) throw new Error('Expected a profile patch sequence')
  const row = doc.contents.items.findLastIndex((item) => isMap(item) && item.get('id') === N.core && !item.has('insert'))
  const config = JSON.parse(initial)
  if (row < 0) doc.add({ id: N.core, config })
  else for (const [key, value] of Object.entries(config)) doc.setIn([row, 'config', key], value)
  fs.writeFileSync(file, String(doc))
}

const shape = (value, depth = 0) => value == null ? null : typeof value === 'function' ? N.functionWord : typeof value !== 'object' || depth > N.shapeDepth ? typeof value : Object.fromEntries(Object.keys(value).map((k) => [k, shape(value[k], depth + 1)]))
const thrown = (e) => ({ thrown: String(e?.message ?? e) })

export function ready({ ctx }) {
  return Boolean(ctx.get(N.services.instance) && ctx.get(N.services.status))
}

export function ops({ ctx, model, world }) {
  const instance = () => ctx.get(N.services.instance)
  const managerId = () => instance()?.manager?.sessionId() ?? null
  async function ensure() { await instance().manager.ensureSession(); return managerId() }
  const managerAgent = (sessionId) => ctx.agents.get(sessionId)
  /** One manager turn; answers the raw request digests of that turn (tools with descriptions). */
  async function managerRequests(scripts = []) {
    const id = await ensure()
    const before = model.requests.length
    await world.turn(id, scripts)
    return model.requests.slice(before).filter((r) => r.sessionId === id)
  }
  /** Rewrites the home patch and lets DSH reconcile the profile from disk (its config editor's path). */
  async function setHomePatch(patch, rowId) {
    fs.writeFileSync(homePatchFile, JSON.stringify(patch))
    const { loadProfileDirectory, readProfilePatches, reconcileProfilePatches } = await importRuntime(N.appBoot)
    const context = ctx.profileContext
    await reconcileProfilePatches(ctx.root, readProfilePatches(N.dshName, context, loadProfileDirectory(N.dshName, context.dir, context.installAnchor)), N.dshName, [rowId])
  }
  const setCore = (enabled) => ctx.pluginManager.setBundleEnabled(N.core, enabled)
  return {
    shape: () => ({ apiVersion: instance()?.apiVersion, shape: shape(instance()) }),
    /** ensureSession twice: the id after each, and every live session id. */
    async ensure() { const a = await ensure(); const b = await ensure(); return { a, b, id: managerId(), ids: ctx.agents.list().map((x) => x.session.id) } },
    managerId,
    snapshot: () => ctx.get(N.services.status)?.snapshot() ?? null,
    guards: () => instance()?.ui?.guards?.report() ?? null,
    managerTeamMode({ sessionId }) {
      if (!ctx.agentTeams) return null
      const agent = managerAgent(sessionId)
      return { enabled: ctx.agentTeams.isEnabled(agent), registered: ctx.tools.schemas(agent).map((t) => t.name) }
    },
    async setManagerTeamMode({ sessionId, enabled }) {
      const agent = managerAgent(sessionId)
      await ctx.agentTeams.setEnabled(agent, enabled)
      return ctx.agentTeams.isEnabled(agent)
    },
    async registerGuardProbe({ sessionId, name, description }) {
      const { defineTool } = await importRuntime(N.tools)
      managerAgent(sessionId).ctx.tools.register(defineTool({
        name, description, parameters: {},
        output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
        execute: () => description,
      }))
    },
    /** The manager's tools as its model sees them in one turn, and DSH's global view (no scope key). */
    async tools() { const [first] = await managerRequests(); return { local: first?.tools.map((t) => t.name) ?? [], global: ctx.tools.schemas().map((t) => t.name) } },
    async managerTools() { const [first] = await managerRequests(); return first?.tools.map((t) => ({ name: t.name, description: t.description })) ?? [] },
    async managerSystem() { const [first] = await managerRequests(); return first?.system ?? '' },
    /** The requests of one manager turn (digests), e.g. the system prompt and the model. */
    async managerTurn({ scripts } = {}) { return (await managerRequests(scripts)).map((r) => ({ model: r.model, system: r.system, tools: r.tools.map((t) => t.name) })) },
    /** The model calls `tool` once in a manager turn; the tool-role message the next request carries. */
    async managerCall({ tool, args, id }) {
      const requests = await managerRequests([[{ tool, args, ...(id === undefined ? {} : { id }) }]])
      return { offered: requests[0]?.tools.map((t) => t.name) ?? [], result: requests[1]?.last.filter((m) => m.role === N.toolRole).at(-1) ?? null }
    },
    async managerInboxIds() { return world.ops.inboxIds({ sessionId: await ensure() }) },
    /** Core's own messages in the manager's log (source kind fishball-event), each {id, text, time}, and its turn starts. */
    async managerDeliveries() { const { messages, turns } = await world.ops.userMessages({ sessionId: await ensure(), kind: N.eventSource }); return { deliveries: messages, turns } },
    /**
     * DESIGN §29: a batch message's source lists every record it carries
     * (`{kind: 'fishball-event', events: [{key, eventId, type, targetId}]}`); each delivery's id and records.
     */
    async managerEventBatches() {
      const events = await world.logEvents(await ensure())
      return events.filter((e) => e.type === N.userMessage && e.data?.source?.kind === N.eventSource).map((e) => ({ id: e.data.id, records: e.data.source.events ?? null }))
    },
    async presets({ sessionId }) {
      const registry = ctx.agentPresets
      const agent = await world.agentOf(sessionId)
      const supported = typeof registry.presetForSession === 'function'
      return { defaultId: registry.defaultId, supported, preset: supported ? registry.presetForSession(agent.session) : null }
    },
    // ---- the target collection, asks, bridge and attention (ui.targets, ui.asks, bridge, attention)
    targets: () => instance()?.ui.targets.list() ?? null,
    async targetAction({ op, args }) { return instance().ui.targets[op](...args) },
    async askCards() { return instance().ui.asks.list() },
    async askAnswer({ handle, answer }) { return instance().ui.asks.answer(handle, answer) },
    async bridgeCall({ pluginId, names, target, name, args }) {
      const b = instance().bridge(pluginId, names, target)
      const supports = b.supports(name)
      let result
      try { result = await b.call(name, args) } catch (e) { result = thrown(e) }
      return { supports, result }
    },
    async attention({ pluginId, input, target }) { try { return await instance().attention.signal(pluginId, input, target) } catch (e) { return thrown(e) } },
    // ---- core off / on, DSH shutdown (times, so a later request is a leak)
    async disableCoreAt() { await setCore(false); return Date.now() },
    async enableCore() { await setCore(true); return Boolean(await until(() => instance()?.ui?.targets, N.budget.readyMs, N.budget.pollMs)) },
    async shutdownAt() { await world.ops.shutdown(); return Date.now() },
    /** An add() raced with core's close in one turn: the add's settled result and the close time. */
    async addThenDisable({ url }) {
      const added = instance().ui.targets.add(url).then((r) => r, thrown)
      const closed = setCore(false).then(() => Date.now())
      const [result, at] = await Promise.all([added, closed])
      return { result, at }
    },
    // ---- the home patch: core's own row config, the hosted stand-in row's live URL
    async setCorePatch({ config }) { await setHomePatch([{ id: N.core, name: N.main, config }], N.core); return true },
    async setChildUrl({ url, rowName }) {
      await setHomePatch([{ insert: [{ id: N.childRow, name: rowName, config: { [N.childField]: url } }] }], N.childRow)
      return Boolean(await until(() => ctx.settings.describe().find((r) => r.ns === N.childRow)?.value?.[N.childField] === url, N.budget.readyMs, N.budget.pollMs))
    },
  }
}