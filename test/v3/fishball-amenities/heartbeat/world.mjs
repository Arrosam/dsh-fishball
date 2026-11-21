/**
 * In-process worlds for the fishball-heartbeat cases, built from the installed SDK's real cordis,
 * cordis-plugin-loader, dsh-session and dsh-llm (read only), as the board suite's world does: no DSH
 * process is launched.
 * - the row is packages/fishball-heartbeat/index.js imported bound to the SDK under test
 *   (the board suite's rowModule) and mounted as one loader row, so a config change is a real
 *   cordis reload of the row;
 * - the root context carries DSH's services the row may read: `tools` (a recording GLOBAL
 *   registry, which must stay empty), `profileContext` (a mkdtemp home shared by every world of one
 *   lab, so a restart keeps the saved focus), `sessions` (the SDK's real SessionStore, whose
 *   appends publish cordis 'session/event'), and optionally `appReady`;
 * - the fake core (`fishballInstance`, apiVersion 2 unless a case says otherwise) is provided by its
 *   own fiber, so removing or replacing it emits cordis' 'internal/service' as DSH does. Its X2
 *   `manager.registerSetup(pluginId, fn)` runs fn as a fiber of the manager agent's context (a child
 *   of the root, so it hears 'session/event'), with a scope whose `tools.register` is owned by that
 *   fiber (core's contributing() shape): disposing the registration removes the tool. `live` is
 *   `{id, session}` over a real Session of the store. `manager.notify` records each call and
 *   answers queued, or rejects; with `autoTurn` it then runs the heartbeat turn real core starts
 *   (turn/start, step/start, user/message with the notice source and text, step/end, turn/end);
 * - time is node:test MockTimers on setTimeout and Date (the lead's refinement: the row's timer is
 *   plain setTimeout). Real time only passes in `settle`/`until`, which spin on setImmediate
 *   (not mocked) so the row's fs work and promise chains can finish.
 * - DSH's compaction seam (compact-cases.mjs): a `tokenMeter` whose `measure(session)` answers the
 *   case's `totalTokens` (or is absent, or throws), DSH's preset registry `agentPresets` whose
 *   `serviceFor(agent, 'compaction')` answers a preset-scoped engine, and a host-plane `compaction`
 *   engine; each present only when the case says so. Every `compactNow(agent, signal)` call is
 *   recorded with the engine it reached; a successful one appends DSH's standalone
 *   `compaction/start` … `compaction/end` pair (turn null) as the real engine does. `live.whenIdle()`
 *   resolves at once unless the case holds it (`w.holdIdle()` … `w.releaseIdle()`).
 * Everything observed is public: notify calls (tagged with the fake core's generation, so a
 * replaced core's calls are told apart), the manager scope's tools, the global registry, log
 * records and files under the home. A tool call runs `definition.execute(args, exec)` directly and
 * a throw fails the case: the contract says every refusal is a returned `{ok: false, code}`.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { importSdk } from '../../../private-skills/support/sdk.mjs'
import { rowModule } from '../../fishball-board/peers/subject.mjs'
import { COMPACT, DSH, FIXTURE, HEARTBEAT, SOURCE, TIME, WAIT } from './constants.mjs'

const SERVICE = DSH.services
const EVENT = DSH.event
const json = (value) => JSON.stringify(value)
const OWN_SERVICE_PREFIX = 'fishball'
/** The row as the board suite's rowModule expects it. */
const ROW = Object.freeze({ name: HEARTBEAT.name, entry: HEARTBEAT.entry })
const NOTIFY_MODE = Object.freeze({ queued: 'queued', reject: 'reject' })
export { NOTIFY_MODE }

/** Real-time pause that lets the row's async work run while mocked timers stand still. */
const spin = () => new Promise((resolve) => setImmediate(resolve))
async function settle(ms = WAIT.settleMs) {
  const start = performance.now()
  while (performance.now() - start < ms) await spin()
}
async function until(predicate, ms = WAIT.untilMs) {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > ms) return false
    await spin()
  }
  // A little more time, so a second (wrong) effect of the same cause is seen too.
  await settle()
  return true
}

/** A registry with DSH's `register(definition) → dispose` shape that keeps what is registered. */
function recordingRegistry() {
  const tools = new Map()
  const register = (definition) => {
    tools.set(definition.name, definition)
    return () => { if (tools.get(definition.name) === definition) tools.delete(definition.name) }
  }
  return { tools, register }
}

/** The highest turn number opened in `session`'s log (0 for none): a resumed log continues it. */
const lastTurnStart = (session) => Math.max(0, ...session.snapshotEvents().filter((e) => e.type === DSH.event.turnStart).map((e) => e.data.turn))

/** The service names a row's `inject` declares (a list, or cordis' object form). */
const injectNames = (inject) => (inject === undefined ? [] : Array.isArray(inject) ? inject : Object.keys(inject))
/** Services a case decides to provide or leave out: load() never stubs them. */
const CASE_SERVICES = new Set(Object.values(COMPACT.services))

/** A TokenMeasurement-shaped answer (dsh-token-meter types) whose totalTokens is the case's value. */
const measurement = (session, tokens) => ({
  logRevision: session.snapshotEvents().length,
  baseline: { kind: COMPACT.baselineKind, tokens },
  surfaceDeltaTokens: 0,
  totalTokens: tokens,
  surfaceTokens: tokens,
  nodes: [],
})

/** The compaction failure a throwing engine raises (dsh-compaction ManualCompactionError's shape). */
const compactionError = () => Object.assign(new Error(FIXTURE.compactionMessage), { name: COMPACT.errorName, code: COMPACT.errorCode })

/**
 * The fake meter, preset registry and engines of one world. `meter` {mode, tokens}; `compaction`
 * {preset, host, registry, result}: an engine in the preset group (read through serviceFor), one
 * on the host plane, whether the preset registry exists at all, and what compactNow does.
 */
function compactionSeam(ctx, { meter = {}, compaction = {} }) {
  const { mode: meterMode = COMPACT.meter.present } = meter
  const { preset = true, host = false, registry = true } = compaction
  const seam = { tokens: meter.tokens ?? 0, result: compaction.result ?? COMPACT.result.compacted, measures: [], serviceForCalls: [], calls: [] }
  let compactionSeq = 0
  if (meterMode !== COMPACT.meter.absent) {
    ctx.provide(COMPACT.services.tokenMeter, {
      measure(session) {
        seam.measures.push({ session, at: Date.now() })
        if (meterMode === COMPACT.meter.throws) throw Object.assign(new Error(FIXTURE.meterMessage), { code: FIXTURE.meterCode })
        return measurement(session, seam.tokens)
      },
    })
  }
  /** One successful idle compaction: DSH's standalone marker pair in the agent's log, and its result. */
  function compacted(agent) {
    const compactionId = COMPACT.idPrefix + ++compactionSeq
    const start = agent.session.append(COMPACT.event.start, { compactionId, turn: null })
    const end = agent.session.append(COMPACT.event.end, { compactionId, turn: null })
    return { compactionId, startSeq: start.seq, summarySeq: start.seq, endSeq: end.seq, summary: [], shadowedRange: { start: 0, end: 0 }, shadowedSeqs: [0], shadowedTokenCount: FIXTURE.shadowedTokens }
  }
  const engine = (provider) => ({
    // Not async: the `throws` result must throw synchronously, as a broken engine might.
    compactNow(agent, signal) {
      seam.calls.push({ provider, agent, signal, abortedAtCall: signal?.aborted, at: Date.now() })
      switch (seam.result) {
        case COMPACT.result.throws: throw compactionError()
        case COMPACT.result.reject: return Promise.reject(compactionError())
        case COMPACT.result.nothing: return Promise.resolve(null)
        // Pending until the caller aborts; then rejected with the abort reason, as DSH's engine does.
        case COMPACT.result.hang: return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
        default: return Promise.resolve(compacted(agent))
      }
    },
  })
  const presetEngine = preset ? engine(COMPACT.provider.preset) : undefined
  if (registry) {
    ctx.provide(COMPACT.services.agentPresets, {
      serviceFor(agent, name) {
        seam.serviceForCalls.push({ agent, name })
        return name === COMPACT.services.compaction ? presetEngine : undefined
      },
    })
  }
  if (host) ctx.provide(COMPACT.services.compaction, engine(COMPACT.provider.host))
  return seam
}

/**
 * One lab per test: the fake clock, one home and every world opened over it, closed and removed by
 * `t`'s cleanup (worlds first, then the home).
 */
export async function labFor(t, sdk, { now = TIME.epochMs } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now })
  const root = await realpath(os.tmpdir())
  const dir = await mkdtemp(path.join(root, FIXTURE.tempPrefix))
  const home = path.join(dir, FIXTURE.homeDir)
  fs.mkdirSync(home)
  const worlds = []
  t.after(async () => {
    for (const w of worlds) await w.close()
    const target = await realpath(dir)
    assert.equal(path.dirname(target), root, 'refusing to remove ' + target)
    assert.ok(path.basename(target).startsWith(FIXTURE.tempPrefix), 'refusing to remove ' + target)
    await rm(target, { recursive: true, force: true })
  })
  const sdkModules = await Promise.all([importSdk(sdk, DSH.cordis), importSdk(sdk, DSH.loader), importSdk(sdk, DSH.session), importSdk(sdk, DSH.llm)])
  return {
    home,
    /** Moves the fake clock forward (fires due timers), then lets the row's async work run. */
    async tick(ms) { t.mock.timers.tick(ms); await settle() },
    /** Puts the fake clock at an absolute time without firing timers (a process restarted then, or the clock set back). */
    setTime: (ms) => t.mock.timers.setTime(ms),
    /**
     * A late timer: Date jumps `ms` ahead while no timer runs (a suspended or overloaded process),
     * then the due timers run at once, with Date already past their due time.
     */
    async jump(ms) { t.mock.timers.setTime(Date.now() + ms); t.mock.timers.tick(0); await settle() },
    now: () => Date.now(),
    settle, until,
    async open(options = {}) {
      const w = await openWorld(sdk, sdkModules, home, options)
      worlds.push(w)
      return w
    },
  }
}

/**
 * Options: `core` (the fake instance's apiVersion, or null for none), `appReady` (provide DSH's
 * ready service, fired by `w.ready()`), `managerLive` (false: the manager is created later by
 * `w.startManager()`), `notify` (NOTIFY_MODE), `autoTurn` (run the heartbeat turn after a queued
 * notice), `seedFrom` (`w.snapshot()` of an earlier world: this manager resumes that session, same id and log).
 */
async function openWorld(sdk, [{ Context }, { Loader }, { SessionStore, appendPluginRecord }, { createUserMessage }], home, options) {
  const { core = HEARTBEAT.apiVersion, appReady = false, managerLive = true, notify = NOTIFY_MODE.queued, autoTurn = false, seedFrom } = options
  const ctx = new Context()
  const logs = []
  // An idle gate: while held, live.whenIdle() stays pending (the agent is not idle yet).
  let idleGate
  ctx.logger.exporter({ levels: { default: DSH.allLevels }, export: (m) => logs.push({ name: m.name, type: m.type, text: m.args.map((a) => (typeof a === 'string' ? a : json(a))).join(' ') }) })
  await ctx.plugin(SessionStore)
  await ctx.plugin(Loader)
  const loader = ctx.loader
  const global = recordingRegistry()
  ctx.provide(SERVICE.tools, global)
  ctx.provide(SERVICE.profileContext, { name: FIXTURE.profileName, dir: home, home, cwd: home })
  const seam = compactionSeam(ctx, options)

  const readyListeners = new Set()
  let isReady = false
  if (appReady) {
    ctx.provide(SERVICE.appReady, {
      onReady(listener) {
        if (isReady) { listener(); return () => {} }
        readyListeners.add(listener)
        return () => readyListeners.delete(listener)
      },
    })
  }

  // The manager agent's context: a child of the root, so the row's agent-scoped 'session/event'
  // listener hears the store's appends, as an agent scope in DSH does.
  let agentBase
  await ctx.plugin({ name: 'fbtest-manager-agent', apply: (c) => { agentBase = c } })
  const scopeTools = new Map()
  const manager = { live: undefined, registrations: new Set(), setups: [] }
  const notices = []

  /** One X2 setup fiber: fn(scope, live) with tools owned by the fiber. */
  function runSetup(registration) {
    const fiber = agentBase.plugin({
      name: 'fbtest-x2-' + registration.pluginId,
      apply(scope) {
        const register = (definition) => scope.effect(() => {
          scopeTools.set(definition.name, definition)
          return () => { if (scopeTools.get(definition.name) === definition) scopeTools.delete(definition.name) }
        })
        return registration.fn(scope.extend({ tools: { register } }), manager.live)
      },
    })
    registration.fibers.add(fiber)
  }
  function createManager() {
    const session = seedFrom ? ctx.sessions.create(seedFrom.id, { seed: seedFrom.events }) : ctx.sessions.create()
    manager.live = { id: session.id, session, ctx: agentBase, whenIdle: () => idleGate?.promise ?? Promise.resolve() }
  }
  if (managerLive) createManager()

  /** Appends one turn's opening events: turn/start, and unless `sources` is null (empty turn) step/start and its user/messages. */
  function beginTurn(sources, session) {
    const turn = lastTurnStart(session) + 1
    session.append(EVENT.turnStart, { turn })
    if (sources !== null) {
      session.append(EVENT.stepStart, { turn, step: 1 })
      for (const source of sources) {
        const text = source === SOURCE.heartbeat ? (notices.at(-1)?.text ?? HEARTBEAT.name) : FIXTURE.ascii
        session.append(EVENT.userMessage, createUserMessage({ content: [{ type: DSH.textBlock, text }], source: { ...source } }), DSH.surface)
      }
    }
    return {
      end(reason = DSH.endReason.completed) {
        if (sources !== null) session.append(EVENT.stepEnd, { turn, step: 1 })
        return session.append(EVENT.turnEnd, { turn, reason })
      },
    }
  }
  /** The async face of beginTurn: each append is followed by a settle, as a live loop would pause. */
  async function openTurn(sources, session) {
    const handle = beginTurn(sources, session)
    await settle()
    return { async end(reason) { const event = handle.end(reason); await settle(); return event } }
  }

  let generation = 0
  const makeInstance = (apiVersion, gen) => ({
    apiVersion,
    manager: {
      sessionId: () => manager.live?.id,
      registerSetup(pluginId, fn) {
        const registration = { pluginId, fn, fibers: new Set(), instance: undefined }
        manager.registrations.add(registration)
        manager.setups.push(pluginId)
        if (manager.live) runSetup(registration)
        return () => {
          manager.registrations.delete(registration)
          for (const fiber of registration.fibers) fiber.dispose()
          registration.fibers.clear()
        }
      },
      async notify(input) {
        notices.push({ ...structuredClone(input), at: Date.now(), generation: gen })
        if (notify === NOTIFY_MODE.reject) throw new Error(FIXTURE.rejectMessage)
        // Real core appends the notice as a user/message and starts a turn; here, after the answer.
        if (autoTurn) Promise.resolve().then(() => beginTurn([SOURCE.heartbeat], manager.live.session).end())
        return { status: NOTIFY_MODE.queued }
      },
    },
  })
  let coreFiber
  async function provideCore(apiVersion) {
    const instance = makeInstance(apiVersion, ++generation)
    coreFiber = ctx.plugin({ name: 'fbtest-core', apply: (c) => c.provide(SERVICE.instance, instance) })
    await coreFiber
    await settle()
    return instance
  }
  async function removeCore() {
    await coreFiber?.dispose()
    coreFiber = undefined
    await settle()
  }
  if (core !== null) await provideCore(core)

  let rowId
  let callSeq = 0
  // Every fiber state change (cordis 'internal/status'): a remount of the row shows as states of its
  // fiber, a live settings re-apply (R3) shows none.
  const statuses = []
  ctx.on('internal/status', (fiber) => { statuses.push({ fiber, state: fiber.state }) })
  const w = {
    sdk, ctx, logs, global, notices, scopeTools, manager, seam,
    /** compactNow calls, in order: {provider, agent, signal, abortedAtCall, at}. */
    get compactions() { return seam.calls },
    get measures() { return seam.measures },
    setTokens(tokens) { seam.tokens = tokens },
    setCompactionResult(result) { seam.result = result },
    holdIdle() { let resolve; idleGate = { promise: new Promise((r) => { resolve = r }), resolve: () => resolve() } },
    async releaseIdle() { const gate = idleGate; idleGate = undefined; gate?.resolve(); await settle() },
    get session() { return manager.live?.session },
    get generation() { return generation },
    get live() { return manager.live },
    /** Mounts the row with `config`; the row's own errors stay in its fiber. */
    async load(config = {}) {
      const mod = await rowModule(sdk, ROW)
      for (const name of injectNames(mod.inject)) {
        if (!name.startsWith(OWN_SERVICE_PREFIX) && !CASE_SERVICES.has(name) && ctx.get(name) === undefined) ctx.provide(name, {})
      }
      loader.builtins[ROW.name] = mod
      rowId = await loader.create({ name: DSH.builtinPrefix + ROW.name, config }).catch(() => undefined)
      await loader.await().catch(() => {})
      await settle()
      return mod
    },
    /** A config change: the Loader reloads the row (invalid config may be refused by cordis). */
    async configure(config) {
      await loader.update(rowId, { config }).catch(() => {})
      await loader.await().catch(() => {})
      await settle()
    },
    async disable() {
      await loader.update(rowId, { disabled: true }).catch(() => {})
      await loader.await().catch(() => {})
      await settle()
    },
    active: () => loader.resolve(rowId)?.fiber?.state === DSH.fiberActive,
    /** The row's fiber, and the states it passed through since `from` (an index into the log). */
    fiber: () => loader.resolve(rowId)?.fiber,
    statusMark: () => statuses.length,
    rowStatuses: (from = 0) => statuses.slice(from).filter((s) => s.fiber === loader.resolve(rowId)?.fiber).map((s) => s.state),
    /** One whole turn on the manager (or `session`); `sources` from TURN (null = no step). */
    async turn(sources, { reason, session = manager.live.session } = {}) { return (await openTurn(sources, session)).end(reason) },
    /** Opens a turn left open; `await .end(reason)` closes it. */
    beginTurn: (sources, session = manager.live.session) => openTurn(sources, session),
    otherSession: () => ctx.sessions.create(),
    /** A non-turn record in the manager log (an event core holds and has not delivered in a turn). */
    async pendingRecord(type) { appendPluginRecord(manager.live.session, type, { fbtest: true }); await settle() },
    /** X2 create: the manager comes up after the row registered its setup. */
    async startManager() {
      createManager()
      for (const registration of manager.registrations) runSetup(registration)
      await settle()
    },
    provideCore, removeCore,
    /** Core disposes every X2 registration's fiber (its manager going away), the row's registration staying. */
    async disposeSetups() {
      for (const registration of manager.registrations) {
        for (const fiber of registration.fibers) fiber.dispose()
        registration.fibers.clear()
      }
      await settle()
    },
    /** Closes the turn a resumed log left open (step/end when it entered a step, then turn/end). */
    async closeOpenTurn(reason = DSH.endReason.completed) {
      const session = manager.live.session
      const events = session.snapshotEvents()
      const turn = lastTurnStart(session)
      const opened = events.findLastIndex((e) => e.type === EVENT.turnStart)
      if (events.slice(opened).some((e) => e.type === EVENT.stepStart)) session.append(EVENT.stepEnd, { turn, step: 1 })
      session.append(EVENT.turnEnd, { turn, reason })
      await settle()
    },
    /** Fires DSH's app ready (appReady option). */
    async ready() {
      isReady = true
      for (const listener of [...readyListeners]) listener()
      readyListeners.clear()
      await settle()
    },
    tool: () => scopeTools.get(HEARTBEAT.tool),
    /** One heartbeat_focus call as DSH runs it; `agent` defaults to the manager's live agent. */
    async call(args, agent = manager.live) {
      const definition = scopeTools.get(HEARTBEAT.tool)
      assert.ok(definition, `the manager scope has no ${HEARTBEAT.tool}`)
      const exec = { callId: FIXTURE.callIdPrefix + ++callSeq, name: HEARTBEAT.tool, arguments: args, agent, signal: new AbortController().signal, deferContext() {}, concludeTurn() {} }
      const result = await definition.execute(args, exec)
      await settle()
      return result
    },
    /** The manager session's id and log, for a later world to resume (`seedFrom`). */
    snapshot: () => ({ id: manager.live.id, events: manager.live.session.snapshotEvents() }),
    /** An agent of another session (a managed worker, say). */
    foreignAgent() { const session = ctx.sessions.create(); return { id: session.id, session } },
    linesWith: (needle) => logs.filter((l) => l.text.includes(needle)),
    warnings: () => logs.filter((l) => l.type === DSH.warn),
    /** Warning and error lines: what "logged as a failure" may be. */
    problems: () => logs.filter((l) => DSH.problemLevels.includes(l.type)),
    files: () => fs.readdirSync(home, { recursive: true }).sort(),
    async close() {
      if (w.closed) return
      w.closed = true
      await ctx.fiber.dispose()
    },
  }
  return w
}
