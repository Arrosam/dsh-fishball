/**
 * One DSH for the fishball-taskboard cases, built in-process from the current DSH's real parts
 * (fishball-test-helpers/dsh importDsh): cordis, cordis-plugin-loader, dsh-session's SessionStore,
 * dsh-storage with dsh-storage-json and dsh-storage-domain over a temp root (ctx.storage.domain). The
 * row is mounted as a loader row (fishball-test-helpers/bind rowModule).
 * The fakes stand only for the host services the surface names:
 * - connection.fetch.register(route) → dispose: a recording registry; a case calls a route's
 *   fetch(request) with a real WHATWG Request;
 * - fishballInstance (apiVersion 2), provided by its own fiber so a case can remove it, with
 *   manager.sessionId(), manager.registerSetup(pluginId, fn) and manager.notify(input).
 *   registerSetup runs fn as its own fiber on the manager's agent context (a child of the root, so
 *   root events reach it), with a scope whose tools.register(definition) → dispose is tied to that
 *   fiber, as core's X2 scope is; live is scoped to a real Session of the root's SessionStore;
 * - appReady (optional): onReady(fn) → dispose, fired by the case.
 * The manager's agent context is not a fake: it is a dsh-scope scope (createScope, keyed by the live
 * agent) minted from a host plugin that injects the current DSH's real SystemPrompt service, so
 * agentCtx.systemPrompt.section() lands in the
 * manager's own layer and dies with the setup fiber. resume() is core's resume: the generation's
 * scope is disposed, a new live agent (same session) gets a new scope, and every registered setup
 * runs again on it.
 * Everything observed is public: the routes' Responses, the tools' values, the fakes' calls and the
 * log records.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { rowModule } from 'fishball-test-helpers/bind'
import { DSH_VERSION, importDsh } from 'fishball-test-helpers/dsh'
import { spin } from 'fishball-test-helpers/wait'
import { DSH, FIXTURE, INSTANCE, NOTIFY, ROUTE, SUBJECT, TOOL, WAIT } from './constants.mjs'
import { runTool, runToolRaw } from './subject.mjs'

const json = (value) => JSON.stringify(value)

/** A few event-loop turns: lets a settled promise's tail (and a deferred inject) run before a read. */
export async function turns() {
  for (let i = 0; i < WAIT.immediateTurns; i += 1) await spin()
}


/** Reads SSE frames ("data: <json>\n\n") from a Response; next() waits for one frame. */
export function frames(response, controller) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const take = () => {
    const end = buffer.indexOf(ROUTE.frameEnd)
    if (end < 0) return undefined
    const frame = buffer.slice(0, end)
    buffer = buffer.slice(end + ROUTE.frameEnd.length)
    const lines = frame.split(ROUTE.lineEnd)
    const eventPrefix = 'event:'
    const event = lines.find((line) => line.startsWith(eventPrefix))?.slice(eventPrefix.length).trim() ?? ''
    const data = lines.filter((line) => line.startsWith(ROUTE.framePrefix)).map((line) => line.slice(ROUTE.framePrefix.length)).join(ROUTE.lineEnd)
    return { event, data }
  }
  let pending
  const read = () => (pending ??= reader.read().then((chunk) => { pending = undefined; return chunk }))
  /** The next frame's JSON, or undefined when none arrives within timeoutMs. */
  async function nextFrame(timeoutMs = WAIT.frameMs, event) {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const frame = take()
      if (frame !== undefined) {
        if (frame.data !== '' && (event === undefined || frame.event === event)) return { event: frame.event, body: JSON.parse(frame.data) }
        continue
      }
      const left = deadline - Date.now()
      if (left <= 0) return undefined
      const chunk = await Promise.race([read(), new Promise((resolve) => setTimeout(resolve, left, { timeout: true }))])
      if (chunk.timeout) continue
      if (chunk.done) return undefined
      buffer += decoder.decode(chunk.value, { stream: true })
    }
  }
  return {
    next: async (timeoutMs) => (await nextFrame(timeoutMs, ''))?.body,
    nextFrame,
    close: () => { controller.abort(); return reader.cancel().catch(() => {}) },
  }
}

/** A recording connection.fetch registry. */
function fetchRegistry() {
  const routes = new Set()
  return {
    routes,
    register(route) {
      routes.add(route)
      return () => { routes.delete(route) }
    },
  }
}

/**
 * A world in a fresh canonical temp root, closed and removed by t's cleanup. Options:
 * core (provide the fake fishballInstance at once), apiVersion, appReady (provide the fake), and
 * configureHost(ctx, instance) for extra host capabilities; createAgent(ctx) for model-facing cases.
 */
export async function worldFor(t, { core = true, apiVersion = INSTANCE.apiVersion, appReady = false, configureHost, createAgent, moduleFor = () => rowModule(SUBJECT.entry) } = {}) {
  const tmp = await realpath(os.tmpdir())
  const root = await mkdtemp(path.join(tmp, FIXTURE.tempPrefix))
  const mod = await moduleFor()
  const parts = Object.fromEntries(await Promise.all([DSH.cordis, DSH.loader, DSH.session, DSH.storage, DSH.storageJson, DSH.storageDomain, DSH.systemPrompt, DSH.scope].map(async (n) => [n, await importDsh(n)])))
  const world = { dsh: DSH_VERSION, root, mod, logs: [], notifyMode: NOTIFY.queued, notices: [], setups: [], noManager: false }
  let host
  t.after(async () => {
    await host?.close()
    for (const dir of fs.readdirSync(root, { recursive: true, withFileTypes: true }).filter((d) => d.isDirectory())) fs.chmodSync(path.join(dir.parentPath ?? dir.path, dir.name), FIXTURE.writableMode)
    assert.ok(path.dirname(root) === tmp && path.basename(root).startsWith(FIXTURE.tempPrefix), 'refusing to remove ' + root)
    await rm(root, { recursive: true, force: true })
  })

  async function open() {
    const ctx = new parts[DSH.cordis].Context()
    ctx.logger.exporter({ levels: { default: DSH.allLevels }, export: (m) => world.logs.push({ name: m.name, type: m.type, text: m.args.map((a) => (typeof a === 'string' ? a : json(a))).join(' ') }) })
    await ctx.plugin(parts[DSH.session].SessionStore)
    await ctx.plugin(parts[DSH.loader].Loader)
    await ctx.plugin(parts[DSH.storage].default)
    await ctx.plugin(parts[DSH.storageJson], { root: path.join(root, FIXTURE.domainDir) })
    await ctx.plugin(parts[DSH.storageDomain], { backend: DSH.jsonBackend, routes: {} })
    await ctx.plugin(parts[DSH.systemPrompt].SystemPrompt, {})
    // A scope inherits the dependency API of the plugin that mints it (dsh-scope createScope).
    let agentHost
    await ctx.plugin({ name: FIXTURE.agentHost, inject: [DSH.services.systemPrompt], apply: (c) => { agentHost = c } })
    const fetch = fetchRegistry()
    ctx.provide(DSH.services.connection, { fetch })
    const ready = { listeners: new Set() }
    if (appReady) ctx.provide(DSH.services.appReady, { onReady(fn) { ready.listeners.add(fn); return () => { ready.listeners.delete(fn) } } })

    const realAgent = await createAgent?.(ctx)
    const session = realAgent?.session ?? ctx.sessions.create()
    /** One manager generation: a live agent object of the one session and its agent scope. */
    const mint = () => {
      const live = { id: session.id, session }
      return { live, scope: parts[DSH.scope].createScope(agentHost, live) }
    }
    let generation = realAgent ? { live: realAgent, scope: { ctx: realAgent.ctx } } : mint()
    const scopeTools = new Map()
    const fibers = new Set()
    const registrations = new Set()
    /** X2: the registration's fn runs as its own fiber on the current generation's agent context. */
    function applySetup(registration) {
      const { live, scope: agentScope } = generation
      const fiber = agentScope.ctx.plugin({
        apply: (scope) => registration.fn(scope.extend({ tools: {
          register(definition) {
            return scope.effect(() => {
              scopeTools.set(definition.name, definition)
              return () => { if (scopeTools.get(definition.name) === definition) scopeTools.delete(definition.name) }
            })
          },
        } }), live),
      })
      registration.fibers.add(fiber)
      fibers.add(fiber)
    }
    const instance = {
      apiVersion,
      manager: {
        sessionId: () => (world.noManager ? undefined : session.id),
        /** X2: fn runs as its own fiber on the manager's agent context; dispose removes it. */
        registerSetup(pluginId, fn) {
          world.setups.push(pluginId)
          const registration = { fn, fibers: new Set() }
          registrations.add(registration)
          applySetup(registration)
          return () => {
            registrations.delete(registration)
            const owned = [...registration.fibers]
            for (const fiber of owned) fibers.delete(fiber)
            return Promise.all(owned.map((fiber) => fiber.dispose()))
          }
        },
        async notify(input) {
          world.notices.push(structuredClone(input))
          if (world.notifyMode === NOTIFY.reject) throw new Error('fbtest: notify refused (closed)')
          return { status: world.notifyMode }
        },
      },
    }
    await configureHost?.(ctx, instance)
    let coreFiber
    const loader = ctx.loader
    loader.builtins[SUBJECT.name] = mod
    let rowId
    let callSeq = 0
    const agent = { id: session.id, session }
    host = {
      ctx, fetch, session, agent, scopeTools,
      get live() { return generation.live },
      /** Core's resume: the old generation's scope (and its setup fibers) goes, every setup runs on a new one. */
      async resume() {
        const previous = generation
        await previous.scope.dispose()
        for (const registration of registrations) { for (const fiber of registration.fibers) fibers.delete(fiber); registration.fibers.clear() }
        generation = mint()
        for (const registration of registrations) applySetup(registration)
        await world.settle()
        return previous.live
      },
      /** The sections the real SystemPrompt assembles for a scope key (null: the global view). */
      async promptSections(key) {
        const assembly = await ctx.get(DSH.services.systemPrompt).assemble(key === null ? {} : { scope: key })
        return assembly.sections
      },
      async addCore() { coreFiber = ctx.plugin({ apply: (c) => { c.provide(DSH.services.instance, instance) } }); await coreFiber; await world.settle() },
      async removeCore() { await coreFiber?.dispose(); coreFiber = undefined; await world.settle() },
      async loadRow() { rowId = await loader.create({ name: DSH.builtinPrefix + SUBJECT.name }); await loader.await().catch(() => {}); await world.settle() },
      async removeRow() { loader.remove(rowId); await loader.await().catch(() => {}); await world.settle() },
      active: () => loader.resolve(rowId)?.fiber?.state === DSH.fiberActive,
      fireReady: () => { for (const fn of [...ready.listeners]) fn() },
      async settle() { await Promise.all([...fibers].map((f) => Promise.resolve(f).catch(() => {}))); await turns() },
      call: (name, args, as, run = runTool) => {
        const definition = scopeTools.get(name)
        assert.ok(definition, 'the manager scope has no ' + name)
        const exec = { callId: FIXTURE.callIdPrefix + ++callSeq, name, arguments: args, agent: as, signal: new AbortController().signal, deferContext() {}, concludeTurn() {} }
        return run(definition, args, exec)
      },
      async close() { await ctx.fiber.dispose() },
    }
    if (core) await host.addCore()
    await host.loadRow()
  }

  // The current DSH's parts, read through on each access (a restart replaces them).
  for (const [key, read] of Object.entries({ ctx: () => host.ctx, session: () => host.session, live: () => host.live, agent: () => host.agent })) {
    Object.defineProperty(world, key, { get: read, enumerable: true })
  }
  Object.assign(world, {
    addCore: () => host.addCore(),
    removeCore: () => host.removeCore(),
    removeRow: () => host.removeRow(),
    active: () => host.active(),
    fireReady: () => host.fireReady(),
    settle: () => host.settle(),
    /** Core's resume of the manager session; returns the previous generation's live agent. */
    resume: () => host.resume(),
    /** The assembled sections of the manager's current scope, of another scope key, or (null) the global view. */
    promptSections: (key = host.live) => host.promptSections(key),
    /** Registers a section in the global layer for the rest of the DSH's life. */
    globalSection: (section) => { host.ctx.get(DSH.services.systemPrompt).section(section) },
    /** One tool call by the manager's agent. */
    call: (name, args) => host.call(name, args, host.agent),
    /** One tool call by `as` (another agent, or undefined for a call with no agent). */
    callAs: (as, name, args) => host.call(name, args, as),
    /** One call by the manager whose rejection the case asserts (DSH's own argument refusal). */
    callRaw: (name, args) => host.call(name, args, host.agent, runToolRaw),
    /** The tool names in DSH's sense: what the manager scope holds now. */
    toolNames: () => [...host.scopeTools.keys()].sort(),
    /** Lines whose text contains needle. */
    linesWith: (needle) => world.logs.filter((l) => l.text.includes(needle)),
    /** Another real Session of the same store. */
    otherSession: () => host.ctx.sessions.create(),
    /** Closes the whole DSH and opens a new one over the same root (a restart). */
    async restart() { await host.close(); await open() },
    /** The route registered for path and method. */
    route(pathname, method) {
      const found = [...host.fetch.routes].filter((r) => r.path === pathname && (r.methods === undefined || r.methods.includes(method)))
      assert.equal(found.length, 1, 'one ' + method + ' ' + pathname + ' route is registered (found ' + found.length + ')')
      return found[0]
    },
    /** Calls the route with a real Request; returns {status, body}. body is JSON (or a string as is). */
    async fetch(method, pathname, body) {
      const init = { method }
      if (body !== undefined) Object.assign(init, { body: typeof body === 'string' ? body : json(body), headers: { [ROUTE.contentType]: ROUTE.json } })
      const response = await world.route(pathname, method).fetch(new Request(ROUTE.origin + pathname, init))
      const text = await response.text()
      await turns()
      return { status: response.status, body: text === '' ? undefined : JSON.parse(text) }
    },
    /** Opens the SSE route; the stream is closed by t's cleanup. */
    async events(tc) {
      const controller = new AbortController()
      const response = await world.route(ROUTE.events, ROUTE.get).fetch(new Request(ROUTE.origin + ROUTE.events, { method: ROUTE.get, signal: controller.signal }))
      const reader = frames(response, controller)
      tc.after(() => reader.close())
      return reader
    },
    /** taskboard_read's value (the board as Fishball sees it). */
    read: () => host.call(TOOL.read, {}, host.agent),
    /** Makes every folder of the domain root read-only: the next write fails (EACCES). */
    breakStorage() {
      const dirs = [path.join(root, FIXTURE.domainDir), ...fs.readdirSync(path.join(root, FIXTURE.domainDir), { recursive: true, withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(d.parentPath ?? d.path, d.name))]
      for (const dir of dirs) fs.chmodSync(dir, FIXTURE.readOnlyMode)
      try { fs.writeFileSync(path.join(dirs.at(-1), FIXTURE.tempPrefix), ''); return false } catch { return true }
    },
  })
  await open()
  return world
}