/**
 * One Fishball DSH for the F-INTERCEPT cases, built from the current DSH's real parts (cordis,
 * session, projections, JSONL persistence with the stock checkpoint policy, storage domain, agent
 * loop, logger) as spike V3-S2 did (`a499141`, probe.mjs). Fakes, and only these:
 * - the model adapter: answers at once, can hold a turn open ("busy") and records every request;
 * - core's link (K1 shapes only): one durable mailbox file with `inbox_poll`, `inbox_ack`, the
 *   `dsh-agent://events` hint and a log of every other tool call (an interceptor's answer);
 * - the interceptor plugins: real cordis plugins whose registration is an effect of their fiber, so
 *   switching a plugin off is disposing its fiber.
 * Everything observed is public: tool calls at the link, the DSH session logs, the model requests
 * and the records the logger exporter receives. No product module is read or imitated.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ANSWERABLE_TYPES, DECISION_KIND_OF, OFFER_ID, REFUSAL, RESOURCE, formatOfferId } from 'fishball-test-helpers/connector-contract/mcp-schema'
import { importDsh } from 'fishball-test-helpers/dsh'
import { until } from 'fishball-test-helpers/wait'
import { dshParts } from '../support/events-dsh.mjs'
import { CONTRIBUTED_TYPE_PREFIX, DSH, EVENT_TYPE, FIXTURE, TOOL, WAIT } from './constants.mjs'
import { makeSubject } from './subject.mjs'

const json = (value) => JSON.stringify(value)
const durableWrite = (file, text, append = false) => {
  if (append) fs.appendFileSync(file, text); else fs.writeFileSync(file, text)
  const fd = fs.openSync(file, 'r+')
  try { fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
}
export const readLines = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [])

/** A throwaway root under the OS temp directory. */
export const newRoot = () => mkdtemp(path.join(os.tmpdir(), FIXTURE.tempPrefix))
export const removeRoot = (root) => rm(root, { recursive: true, force: true })

/**
 * One K1 mailbox event (mcp-schema `mailboxEvent`). The marker is in its id and payload, so every
 * trace of it (an admission, a model request, a log record) can be found by text.
 */
export function makeEvent(type, n, { sourceSessionId = FIXTURE.watchedSession, secret, payload: override } = {}) {
  const marker = FIXTURE.marker + n
  const text = marker + ' ' + type
  const answerable = ANSWERABLE_TYPES.includes(type)
  const offerId = answerable ? formatOfferId(marker.toLowerCase().replace(/[^a-z0-9]/g, ''), OFFER_ID.firstRevision) : undefined
  const descriptor = () => ({
    approvalId: marker, offerId, kind: DECISION_KIND_OF[type], prompt: text, choices: [], title: text, at: Date.now(),
    toolName: FIXTURE.marker, callId: null, reason: text, quotes: [],
  })
  // K1 payload shapes (mcp-schema shapes.js EVENT_PAYLOAD_SHAPES); WAKE-BATCH added the types past
  // message / notice / permission. turn-finished is the WAKE-BATCH shape (requirement 7), `payload` overrides it.
  const session = sourceSessionId ?? FIXTURE.watchedSession
  const payloads = {
    [EVENT_TYPE.message]: () => ({ text, images: [] }),
    [EVENT_TYPE.notice]: () => ({ code: FIXTURE.marker.toLowerCase(), text }),
    [EVENT_TYPE.permission]: descriptor,
    [EVENT_TYPE.question]: descriptor,
    [EVENT_TYPE.planReview]: descriptor,
    [EVENT_TYPE.ask]: descriptor,
    [EVENT_TYPE.turnFinished]: () => ({ sessionId: session, outcome: FIXTURE.outcome.completed, finalMessage: { text, truncated: false } }),
    [EVENT_TYPE.state]: () => ({ sessionId: session, running: false, pendingInteraction: false }),
    [EVENT_TYPE.settlement]: () => ({ approvalId: marker, outcome: FIXTURE.settled.outcome, by: FIXTURE.settled.by }),
    [EVENT_TYPE.retirement]: () => ({ retiredEventId: marker, reason: FIXTURE.retired }),
    [EVENT_TYPE.handover]: () => ({ sessionId: session, note: text }),
    [EVENT_TYPE.takeback]: () => ({ sessionId: session, note: text }),
  }
  const contributed = type.startsWith(CONTRIBUTED_TYPE_PREFIX)
  // A contributed type names its namespace and event (`contributed:<namespace>.<event>`, K2).
  const [namespace, ...rest] = type.slice(CONTRIBUTED_TYPE_PREFIX.length).split('.')
  const payload = override ?? (contributed ? { namespace, event: rest.join('.'), data: { text }, summary: text } : payloads[type]())
  if (secret !== undefined) payload.secretField = secret
  const event = {
    eventId: marker, mailboxGeneration: FIXTURE.generation, sequence: n, type, at: Date.now(),
    sourceSessionId, correlationId: offerId ?? null, payload,
  }
  if (answerable) event.offer = { offerId, revision: OFFER_ID.firstRevision, decisionKind: DECISION_KIND_OF[type] }
  return { ...event, payloadDigest: createHash('sha256').update(json(payload)).digest('hex'), marker }
}
export const contributedType = () => CONTRIBUTED_TYPE_PREFIX + FIXTURE.contributed

/**
 * Core's link, faked to K1's tool shapes over one durable file, so a restarted world sees the same
 * mailbox. `hooks` lets a crash-window scenario act inside a call (before it is applied).
 */
class FakeLink {
  #listeners = new Set()
  constructor(file, hooks = {}) {
    this.file = file
    this.hooks = hooks
    this.calls = []
    if (!fs.existsSync(file)) this.#save({ events: [], acked: {}, ackCalls: 0, answers: [] })
  }
  #load() { return JSON.parse(fs.readFileSync(this.file, 'utf8')) }
  #save(state) { durableWrite(this.file, json(state)) }
  state() { return this.#load() }
  /** Commit one event to the mailbox and send the listen hint (connector side, R-EVT-04). */
  publish(event) {
    const state = this.#load()
    if (!state.events.some((e) => e.eventId === event.eventId)) state.events.push(event)
    this.#save(state)
    this.hint()
  }
  /** WAKE-BATCH: commit several events in order, then one listen hint (one poll sees them all). */
  publishAll(events) {
    const state = this.#load()
    for (const event of events) if (!state.events.some((e) => e.eventId === event.eventId)) state.events.push(event)
    this.#save(state)
    this.hint()
  }
  hint() { for (const listener of this.#listeners) listener({ uri: RESOURCE.events.uri }) }
  onResourceUpdated(listener) {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }
  async callTool(name, args = {}) {
    this.calls.push({ name, args, at: Date.now() })
    await this.hooks[name]?.(args, this)
    const state = this.#load()
    if (name === TOOL.inboxPoll) {
      const events = state.events.filter((e) => !state.acked[e.eventId]).map(({ marker, ...e }) => e)
      return { ok: true, events, nextCursor: String(events.at(-1)?.sequence ?? 0), hasMore: false }
    }
    if (name === TOOL.inboxAck) {
      state.ackCalls += 1
      const receipts = args.receipts ?? []
      const known = receipts.every((r) => state.events.some((e) => e.eventId === r.eventId && e.payloadDigest === r.payloadDigest))
      if (!known) { this.#save(state); return { ok: false, code: REFUSAL.unknownEvent } }
      if (this.hooks.loseAck !== true) for (const r of receipts) state.acked[r.eventId] = (state.acked[r.eventId] ?? 0) + 1
      this.#save(state)
      return { ok: true, acked: receipts.length }
    }
    state.answers.push({ name, args })
    this.#save(state)
    return { ok: true }
  }
  acked(eventId) { return (this.#load().acked[eventId] ?? 0) > 0 }
  answers() { return this.#load().answers }
}

/** The current DSH's parts of one Fishball DSH, imported once per process. */
let parts
const dshPartsOnce = () => (parts ??= dshParts([DSH.cordis, DSH.llm, DSH.storageDomain, DSH.storageJson, DSH.persistence, DSH.checkpoint, DSH.agentLoop, ...DSH.sdkPlugins]))

/** The durable files of one session's JSONL artifact directory under `root` (empty when absent). */
function sessionDirs(root, sessionId) {
  const sessions = path.join(root, FIXTURE.files.sessions)
  if (!fs.existsSync(sessions)) return []
  // jsonl persistence keeps `<sessions>/<project key>/<session id>/`; the fixture ids need no encoding.
  return fs.readdirSync(sessions).map((p) => path.join(sessions, p, sessionId)).filter((d) => fs.existsSync(d))
}
export const sessionLogFiles = (root, sessionId) =>
  sessionDirs(root, sessionId).flatMap((d) => fs.readdirSync(d).filter((f) => f.endsWith(FIXTURE.logSuffix)).map((f) => path.join(d, f)))
/** Whether `sessionId`'s durable log on disk holds a `user/message` line carrying `marker`. */
export const durablyAdmitted = (root, sessionId, marker) =>
  sessionLogFiles(root, sessionId).some((f) => fs.readFileSync(f, 'utf8').split('\n').some((l) => l.includes(json(DSH.userMessage)) && l.includes(marker)))
/**
 * Clears a closed session: removes its artifact directory and the world's "created" marker, so the
 * next open creates an empty session with the same id (decision 2026-11-14 4: a cleared log).
 */
export function forgetSession(root, sessionId) {
  const dirs = sessionDirs(root, sessionId)
  assert.ok(dirs.length > 0, 'harness: no session directory to clear for ' + sessionId)
  for (const dir of dirs) {
    assert.ok(dir.startsWith(path.join(root, FIXTURE.files.sessions) + path.sep), 'refusing to remove ' + dir)
    fs.rmSync(dir, { recursive: true, force: true })
  }
  fs.rmSync(path.join(root, FIXTURE.files.created) + '.' + sessionId, { force: true })
}

/**
 * Open (or reopen after a crash) the Fishball DSH in `root`, start core's events module on it and
 * return the world. `model.onRequest(texts)` may act inside a model request (hold it, crash).
 * `fishballSession` is the session the Fishball agent runs in (decision 2026-11-14 4: a replaced
 * session); `seam` goes to subject.mjs (its optional fault and timing hooks).
 */
export async function openWorld(root, { linkHooks, onRequest, otherSession = false, plugins = [], onOpen, seam, fishballSession = FIXTURE.fishballSession, secondTarget = false } = {}) {
  const p = await dshPartsOnce()
  const ctx = new p[DSH.cordis].Context()
  const logs = []
  ctx.logger.exporter({ levels: { default: DSH.allLevels }, export: (m) => logs.push({ name: m.name, type: m.type, text: m.args.map((a) => (typeof a === 'string' ? a : json(a))).join(' ') }) })
  for (const n of DSH.sdkPlugins) await ctx.plugin(p[n].default).await()
  if (typeof ctx.tools.setExecutor === 'function') await ctx.plugin((await importDsh(DSH.executor))).await()
  const file = (key) => path.join(root, FIXTURE.files[key])
  await ctx.plugin(p[DSH.storageJson], { root: file('domain') }).await()
  await ctx.plugin(p[DSH.storageDomain], { backend: 'json', routes: {} }).await()
  await ctx.plugin(p[DSH.persistence], { root: file('sessions'), compression: 'none' }).await()
  await ctx.plugin(p[DSH.checkpoint]).await()

  const requests = []
  const { LlmAdapter, freezeMessage } = p[DSH.llm]
  class FakeModel extends LlmAdapter {
    async *stream(options) {
      const texts = json(options.messages)
      requests.push(texts)
      durableWrite(file('model'), json({ pid: process.pid, texts }) + '\n', true)
      // An aborted request (the user's Stop) ends with no answer; DSH closes the turn itself.
      if (await onRequest?.(texts, options) === ABORTED) return
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: FIXTURE.modelText } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  ctx.llm.registerAdapter([FIXTURE.provider], new FakeModel())
  await ctx.plugin(p[DSH.agentLoop].default, { agents: [], maxParallelToolCalls: 1 }).await()

  const agentOptions = { provider: FIXTURE.provider, model: FIXTURE.model }
  const handles = new Map()
  async function sessionAgent(sessionId) {
    const created = file('created') + '.' + sessionId
    const handle = fs.existsSync(created)
      ? await ctx.agentLoop.resume(ctx, { resumeSessionId: sessionId, agentOptions })
      : await ctx.agentLoop.createAgent(ctx, { sessionId, agentOptions, meta: { cwd: root } })
    await ctx.sessions.flush(handle.agent.session)
    durableWrite(created, sessionId)
    handles.set(sessionId, handle)
    return handle.agent
  }
  const agent = await sessionAgent(fishballSession)
  const other = otherSession ? await sessionAgent(FIXTURE.otherSession) : undefined

  const link = new FakeLink(file('connector'), linkHooks)
  // MULTI-1: a second target's own mailbox (its own durable file), polled as SOURCE.b.
  const second = secondTarget ? new FakeLink(file('connectorB'), linkHooks) : undefined
  const core = await makeSubject({ ctx, agent, link, second, seam })

  /** A plugin with its own fiber; its registrations are effects, so `off()` disposes them. */
  async function plugin({ pluginId, registrations, handler }) {
    const seen = []
    const fiber = ctx.plugin({
      name: pluginId,
      apply(pctx) {
        for (const registration of registrations) {
          // Not async: a handler that throws synchronously must reach core as a throw, not a rejection.
          pctx.effect(() => core.intercept({ pluginId, ...registration }, (event, ctl) => {
            seen.push({ event, ctl })
            return handler(event, ctl, seen.length)
          }))
        }
      },
    })
    await fiber
    return { pluginId, seen, fiber, off: () => fiber.dispose() }
  }
  const loaded = []

  /** Every event of one session's durable log. */
  async function sessionLog(sessionId = fishballSession) {
    const live = handles.get(sessionId)?.agent
    if (live) await ctx.sessions.flush(live.session)
    const reader = await ctx.sessionPersistence.open(sessionId, 'read')
    try { return (await reader.read()).events } finally { await reader.close() }
  }
  const userMessage = (text, id) => freezeMessage({ id, role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } })

  const world = {
    root, ctx, agent, other, link, second, core, logs, requests, file, sessionLog, userMessage, plugin, loaded,
    /** Admissions (durable `user/message`) of the Fishball session that carry `marker`: its wakes. */
    async admissions(marker, sessionId) {
      return (await sessionLog(sessionId)).filter((e) => e.type === DSH.userMessage && json(e.data).includes(marker))
    },
    /** Any trace of `marker` in a session's durable log (messages, notices, tool results). */
    async traces(marker, sessionId) {
      return (await sessionLog(sessionId)).filter((e) => json(e).includes(marker))
    },
    modelRequestsWith: (marker) => requests.filter((t) => t.includes(marker)),
    logsWith: (needle) => logs.filter((l) => l.text.includes(needle)),
    /** Waits until nothing changes at the link, the model and the logs, and every agent is idle. */
    async settle() {
      const signature = () => json([link.calls.length, requests.length, logs.length, agent.status, other?.status])
      let last = signature()
      let since = Date.now()
      await until(async () => {
        await agent.whenIdle()
        await other?.whenIdle()
        const now = signature()
        if (now !== last) { last = now; since = Date.now() }
        return Date.now() - since >= WAIT.quietMs && agent.status === DSH.idle
      }, WAIT.settleMs, WAIT.pollMs)
    },
    async close() {
      await core.close()
      for (const handle of handles.values()) await handle.dispose()
      await ctx.fiber.dispose()
    },
  }
  // The caller holds the world before core starts: a crash hook may fire inside start's first poll.
  onOpen?.(world)
  // Plugins that load with core register before it starts (subject.mjs).
  for (const spec of plugins) loaded.push(await plugin(spec))
  await core.start()
  return world
}

/** A world in a fresh root, closed and removed by `t`'s cleanup. */
export async function worldFor(t, options) {
  const root = await newRoot()
  let world
  t.after(async () => { await world?.close(); await removeRoot(root) })
  world = await openWorld(root, options)
  return world
}

/** What a model hook returns for a request the user's Stop aborted. */
export const ABORTED = Symbol('aborted')

/** A turn the model holds open until `release()` or the user's Stop (Fishball "busy"). */
export function busyGate() {
  const reached = Promise.withResolvers()
  const released = Promise.withResolvers()
  let held = false
  return {
    onRequest: async (texts, options) => {
      // Only the busy turn's first request is held; later requests of the same history answer at once.
      if (held || !texts.includes(FIXTURE.busyText)) return undefined
      held = true
      reached.resolve()
      const aborted = new Promise((resolve) => options.signal?.addEventListener('abort', () => resolve(ABORTED), { once: true }))
      return Promise.race([released.promise, aborted])
    },
    reached: reached.promise,
    release: () => released.resolve(),
  }
}

/** Starts the held busy turn and waits until its model request is in flight. */
export async function startBusy(world, gate) {
  world.agent.followup(world.userMessage(FIXTURE.busyText, FIXTURE.busyId))
  await gate.reached
}

/**
 * WAKE-BATCH: a fake clock for core's injected timers (seam `timers`, relayed 2026-11-21:
 * `{setTimeout(fn, ms) → handle, clearTimeout(handle)}`). Time stands still until `advance(ms)`;
 * a timer already due (a 0 ms one) fires on its own, as a real clock would fire it at once.
 */
export function fakeClock() {
  let now = 0
  let seq = 0
  const pending = new Map()
  const fire = () => {
    const due = [...pending].filter(([, t]) => t.due <= now).sort((a, b) => a[1].due - b[1].due || a[0] - b[0])
    for (const [id, t] of due) if (pending.delete(id)) t.fn()
  }
  return {
    timers: Object.freeze({
      setTimeout(fn, ms = 0) {
        const id = ++seq
        pending.set(id, { fn, due: now + Math.max(0, Number(ms) || 0) })
        setImmediate(fire)
        const handle = { id, unref: () => handle, ref: () => handle, hasRef: () => false }
        return handle
      },
      clearTimeout(handle) { pending.delete(handle?.id ?? handle) },
    }),
    /** Timers set and neither fired nor cleared. */
    pending: () => pending.size,
    advance(ms) { now += ms; fire() },
  }
}

/** Waits for `predicate` (a harness wait, not an oracle) and fails with `what`. */
export async function eventually(predicate, what) {
  const ok = await until(predicate, WAIT.settleMs, WAIT.pollMs)
  assert.ok(ok, 'timed out: ' + what)
  return ok
}
