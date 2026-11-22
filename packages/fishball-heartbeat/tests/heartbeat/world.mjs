/**
 * In-process worlds for the fishball-heartbeat cases, built from the current DSH's real cordis,
 * cordis-plugin-loader, dsh-session and dsh-llm (read only, fishball-test-helpers/dsh importDsh): no
 * DSH process is launched.
 * - the row is this package's index.js imported bound to the current DSH
 *   (fishball-test-helpers/bind rowModule) and mounted as one loader row, so a config change is a
 *   real cordis reload of the row;
 * - the root context carries DSH's services the row may read: `tools` (a recording GLOBAL
 *   registry, which must stay empty), `profileContext` (a mkdtemp home shared by every world of one
 *   lab, so a restart keeps the saved focus), `sessions` (DSH's real SessionStore, whose
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
 *   A successful compaction writes dsh-compaction-basic's whole record: compaction/start, /summary,
 *   the compact-checkpoint user/message, compaction/end (`appendCompaction`; `w.compactionRecord`
 *   writes the same outside the heartbeat, e.g. the user's /compact with a sourceCommandId).
 * - DSH's pending input (caused-cases.mjs): `w.inject(sources, target)` logs agent/inbox/spliced as
 *   agent.inject (next-step) or followup (next-turn) does (all sources in one splice), `w.reinject`
 *   splices messages that already exist; `w.afterCompaction(sources)` injects on the
 *   microtask after each compaction/end, as fishball-taskboard does. Every stepped turn first claims
 *   what is pending (the whole next-step list, then one next-turn message: a claim splice after
 *   turn/start) and admits it before its own sources, as dsh-agent-loop's preStep does. Pending input
 *   is folded from the log, so a resumed world claims what the earlier one left.
 * Everything observed is public: notify calls (tagged with the fake core's generation, so a
 * replaced core's calls are told apart), the manager scope's tools, the global registry, log
 * records and files under the home. A tool call runs `definition.execute(args, exec)` directly and
 * a throw fails the case: the contract says every refusal is a returned `{ok: false, code}`.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { rowModule } from 'fishball-test-helpers/bind'
import { importDsh } from 'fishball-test-helpers/dsh'
import { settleFor, spin } from 'fishball-test-helpers/wait'
import { COMPACT, DSH, FIXTURE, HEARTBEAT, SOURCE, TIME, WAIT } from './constants.mjs'

const SERVICE = DSH.services
const EVENT = DSH.event
const json = (value) => JSON.stringify(value)
const OWN_SERVICE_PREFIX = 'fishball'
const NOTIFY_MODE = Object.freeze({ queued: 'queued', reject: 'reject' })
export { NOTIFY_MODE }

/** Real-time pause that lets the row's async work run while mocked timers stand still. */
const settle = (ms = WAIT.settleMs) => settleFor(ms)
/**
 * Spins (setImmediate, never mocked) until `predicate()` holds, in real time (performance.now: Date
 * is mocked). Not the helpers' `until`: that one sleeps on setTimeout, which MockTimers stop here.
 */
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

/** The pending-input lists folded from `session`'s agent/inbox/spliced records (dsh-agent-loop's inbox fold). */
function pendingOf(session) {
  const pending = { [DSH.inbox.nextStep]: [], [DSH.inbox.nextTurn]: [] }
  for (const e of session.snapshotEvents()) {
    if (e.type === EVENT.inboxSpliced) pending[e.data.target] = pending[e.data.target].toSpliced(e.data.start, e.data.removedCount ?? 0, ...e.data.inserted)
  }
  return pending
}

/** How much of each list one step claims (dsh-agent-loop Inbox.claim: all of next-step, then one queued turn). */
const CLAIM = Object.freeze([[DSH.inbox.nextStep, Infinity], [DSH.inbox.nextTurn, 1]])

/** Logs one step's claim of the pending input (a removing splice per list) and returns the claimed messages in admission order. */
function claim(session) {
  const pending = pendingOf(session)
  const claimed = []
  for (const [target, most] of CLAIM) {
    const taken = pending[target].slice(0, most)
    if (taken.length === 0) continue
    session.append(EVENT.inboxSpliced, { target, start: 0, removedCount: taken.length, inserted: [] })
    claimed.push(...taken)
  }
  return claimed
}

/** A fresh compaction identity (DSH uses a UUID: worlds resuming one log never repeat one). */
const newCompactionId = () => COMPACT.idPrefix + randomUUID()

/**
 * DSH's compaction records in dsh-compaction-basic's order: compaction/start, compaction/summary,
 * the compact-checkpoint user/message, compaction/end. `sourceCommandId` is the /compact command's;
 * `turn` null is an idle compaction, a number one inside that open turn; `endCompactionId` (a test
 * value only) closes with another compaction's id, so the end matches no start.
 */
function appendCompaction(session, createUserMessage, { compactionId = newCompactionId(), sourceCommandId, turn = null, endCompactionId = compactionId } = {}) {
  const command = sourceCommandId === undefined ? {} : { sourceCommandId }
  const lifecycle = { compactionId, ...command, turn }
  const start = session.append(COMPACT.event.start, lifecycle)
  const summary = session.append(COMPACT.event.summary, { compactionId, ...command, summary: [], shadowedRange: { start: 0, end: 0 }, shadowedSeqs: [], shadowedTokenCount: FIXTURE.shadowedTokens, provider: FIXTURE.compactionProvider, model: FIXTURE.compactionModel })
  const checkpoint = createUserMessage({ content: [{ type: DSH.textBlock, text: FIXTURE.checkpointText }], source: { kind: COMPACT.checkpointKind, compactionId, ...command } })
  session.append(EVENT.userMessage, checkpoint, DSH.surface)
  const end = session.append(COMPACT.event.end, { ...lifecycle, compactionId: endCompactionId })
  return { compactionId, start, summary, end }
}

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
function compactionSeam(ctx, { meter = {}, compaction = {} }, createUserMessage) {
  const { mode: meterMode = COMPACT.meter.present } = meter
  const { preset = true, host = false, registry = true } = compaction
  const seam = { tokens: meter.tokens ?? 0, result: compaction.result ?? COMPACT.result.compacted, measures: [], serviceForCalls: [], calls: [] }
  if (meterMode !== COMPACT.meter.absent) {
    ctx.provide(COMPACT.services.tokenMeter, {
      measure(session) {
        seam.measures.push({ session, at: Date.now() })
        if (meterMode === COMPACT.meter.throws) throw Object.assign(new Error(FIXTURE.meterMessage), { code: FIXTURE.meterCode })
        return measurement(session, seam.tokens)
      },
    })
  }
  /** One successful idle compaction: DSH's standalone records (turn null) in the agent's log, and its result. */
  function compacted(agent) {
    const { compactionId, start, summary, end } = appendCompaction(agent.session, createUserMessage)
    return { compactionId, startSeq: start.seq, summarySeq: summary.seq, endSeq: end.seq, summary: [], shadowedRange: { start: 0, end: 0 }, shadowedSeqs: [0], shadowedTokenCount: FIXTURE.shadowedTokens }
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
export async function labFor(t, { now = TIME.epochMs } = {}) {
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
  const dshModules = await Promise.all([importDsh(DSH.cordis), importDsh(DSH.loader), importDsh(DSH.session), importDsh(DSH.llm)])
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
      const w = await openWorld(dshModules, home, options)
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
async function openWorld([{ Context }, { Loader }, { SessionStore, appendPluginRecord }, { createUserMessage }], home, options) {
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
  const seam = compactionSeam(ctx, options, createUserMessage)

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

  /** One user-role message from `source` (a heartbeat carries the last notice's text). */
  const messageFrom = (source) => {
    const text = source === SOURCE.heartbeat ? (notices.at(-1)?.text ?? HEARTBEAT.name) : FIXTURE.ascii
    return createUserMessage({ content: [{ type: DSH.textBlock, text }], source: { ...source } })
  }
  /** Logs one agent/inbox/spliced appending `inserted` to `target`'s pending list; returns them. */
  function splice(inserted, target, session) {
    session.append(EVENT.inboxSpliced, { target, start: pendingOf(session)[target].length, inserted })
    return inserted
  }
  /** One splice of one new message per source. */
  const inject = (sources, target, session) => splice(sources.map(messageFrom), target, session)
  // fishball-taskboard's reaction: on the microtask after a manager compaction/end, inject its reminder.
  let compactionReaction
  ctx.on('session/event', (session, event) => {
    if (compactionReaction === undefined || session !== manager.live?.session || event.type !== COMPACT.event.end) return
    const { sources, target } = compactionReaction
    Promise.resolve().then(() => inject(sources, target, session))
  })

  /**
   * Appends one turn's opening events: turn/start, and unless `sources` is null (empty turn) the
   * claim of pending input, step/start, the claimed messages and then `sources`' user/messages.
   */
  function beginTurn(sources, session) {
    const turn = lastTurnStart(session) + 1
    session.append(EVENT.turnStart, { turn })
    if (sources !== null) {
      const claimed = claim(session)
      session.append(EVENT.stepStart, { turn, step: 1 })
      for (const message of [...claimed, ...sources.map(messageFrom)]) session.append(EVENT.userMessage, message, DSH.surface)
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
    ctx, logs, global, notices, scopeTools, manager, seam,
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
      const mod = await rowModule(HEARTBEAT.entry)
      for (const name of injectNames(mod.inject)) {
        if (!name.startsWith(OWN_SERVICE_PREFIX) && !CASE_SERVICES.has(name) && ctx.get(name) === undefined) ctx.provide(name, {})
      }
      loader.builtins[HEARTBEAT.name] = mod
      rowId = await loader.create({ name: DSH.builtinPrefix + HEARTBEAT.name, config }).catch(() => undefined)
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
    /** agent.inject (next-step, the default) or followup (next-turn) of one message per source; returns the messages. */
    async inject(sources, target = DSH.inbox.nextStep) { const inserted = inject(sources, target, manager.live.session); await settle(); return inserted },
    /** One splice of messages that already exist (the same ids again, e.g. ones an earlier turn admitted). */
    async reinject(messages, target = DSH.inbox.nextStep) { splice(messages, target, manager.live.session); await settle() },
    /** From now on, inject one message per source into `target` on the microtask after each manager compaction/end (fishball-taskboard). */
    afterCompaction(sources, target = DSH.inbox.nextStep) { compactionReaction = { sources, target } },
    /** The manager's pending input, folded from its log. */
    pending: () => pendingOf(manager.live.session),
    /**
     * DSH's compaction records written by someone other than the heartbeat: `sourceCommandId` for the
     * user's /compact, `inTurn` for one inside the manager's open turn (turn = that turn's number).
     */
    async compactionRecord({ sourceCommandId, inTurn = false, endCompactionId } = {}) {
      const session = manager.live.session
      const record = appendCompaction(session, createUserMessage, { sourceCommandId, turn: inTurn ? lastTurnStart(session) : null, endCompactionId })
      await settle()
      return record
    },
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
