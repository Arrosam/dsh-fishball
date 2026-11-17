/**
 * One Fishball DSH for the F-ASKCARD cases, from the installed SDK's real parts: cordis, the storage
 * hub, dsh-storage-json and dsh-storage-domain (the cards' table), and, for the system rows, the
 * session, tools and agent loop with a scripted model, so `ask_user` runs as a real DSH tool. The
 * only fakes are:
 * - core's link, to the seam's two members (`onPoll`, `callTool`) and K1 shapes only;
 * - the model adapter (it answers in text, or calls one scripted tool);
 * - the Fetch registry the routes register on (`ctx.connection.fetch.register`), as the seam names it.
 * Everything observed is public: the service, the tool's result, the link's calls, the routes'
 * `Response`s and DSH's tool result message.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { importSdk } from '../../../private-skills/support/sdk.mjs'
import { until } from '../../../support/util.mjs'
import {
  ANSWER, APPROVAL_KIND, ARGUMENTS_STATUS, ASK_TOOL, CONNECTOR_OK, DECISION_KIND, DECISION_KIND_OF, DSH, EVENT_TYPE, FIXTURE, OFFER_ID, RECONCILE, RETIREMENT_REASON, ROUTE,
  SETTLED_BY, SETTLEMENT_OUTCOME, TOOL, WAIT,
} from './constants.mjs'
import { asksModule, exported } from './subject.mjs'

const json = (value) => JSON.stringify(value)
const digest = (payload) => createHash(FIXTURE.hashAlgorithm).update(json(payload)).digest(FIXTURE.hashEncoding)

// ------------------------------------------------------------------------------------ K1 events

let sequence = 0
/** One K1 mailbox event (mcp-schema `mailboxEvent`) of `type` with `payload`. */
function mailboxEvent(type, payload, extra = {}) {
  sequence += 1
  return {
    eventId: FIXTURE.eventPrefix + sequence, mailboxGeneration: FIXTURE.generation, sequence, type,
    at: FIXTURE.askedAt + FIXTURE.eventAtOffsetMs, sourceSessionId: null, correlationId: null,
    payload, payloadDigest: digest(payload), ...extra,
  }
}

let asks = 0
/**
 * A K1 offer event of `type` from `sourceSessionId`, its payload the V2 descriptor: an `ask` by
 * default, or a `permission` (card-able since F-FIX, the user 2026-11-17: "Permission requests
 * become cards"), or a `question` / `plan-review` (never card-able; their descriptor kind and
 * decision kind are K1's `question`, DECISION_KIND_OF).
 */
export function askEvent({
  title = FIXTURE.title, choices = [], sourceSessionId = FIXTURE.askingSession, type = EVENT_TYPE.ask,
  reason = FIXTURE.reason, argumentsText, argumentsStatus,
} = {}) {
  asks += 1
  const approvalId = FIXTURE.approvalPrefix + asks
  const decisionKind = DECISION_KIND_OF[type] ?? DECISION_KIND.approval
  const descriptor = {
    approvalId, offerId: undefined, kind: decisionKind === DECISION_KIND.question ? APPROVAL_KIND.question : APPROVAL_KIND.approval,
    prompt: FIXTURE.question + FIXTURE.numberSeparator + asks, choices: [...choices], title,
    at: FIXTURE.askedAt + asks, toolName: FIXTURE.toolName, callId: null, reason, quotes: [],
    // K1's descriptor: `arguments` and `argumentsStatus` are optional members (mcp-schema shapes.js).
    ...(argumentsText === undefined ? {} : { arguments: argumentsText }),
    ...(argumentsStatus === undefined ? {} : { argumentsStatus }),
  }
  return offerEvent(type, descriptor, sourceSessionId, OFFER_ID.firstRevision)
}
/** One offer event for `descriptor` at `revision` (its offer id is `<approvalId>.r<revision>`). */
function offerEvent(type, descriptor, sourceSessionId, revision) {
  const offerId = descriptor.approvalId + OFFER_ID.separator + revision
  return mailboxEvent(type, { ...descriptor, offerId }, {
    sourceSessionId, correlationId: offerId, offer: { offerId, revision, decisionKind: DECISION_KIND_OF[type] ?? DECISION_KIND.approval },
  })
}
/**
 * A re-offer of `event` (F-FIX): a new event of the same type, the same approvalId and session, a
 * NEW offerId (the next revision), and its own prompt, so the replaced record is seen to change.
 */
export function reofferOf(event, revision = event.offer.revision + 1) {
  return offerEvent(event.type, { ...event.payload, prompt: event.payload.prompt + FIXTURE.reofferSuffix + revision }, event.sourceSessionId, revision)
}
/** The same event delivered again (a replay: the same eventId and offerId). */
export const replayOf = (event) => structuredClone(event)
/** A `settlement` naming `approvalId` (R-CON-06: settled elsewhere). */
export const settlementOf = (approvalId) => mailboxEvent(EVENT_TYPE.settlement, { approvalId, outcome: SETTLEMENT_OUTCOME.allowed, by: SETTLED_BY.user })
/** A `retirement` withdrawing the event `retiredEventId`. */
export const retirementOf = (retiredEventId) => mailboxEvent(EVENT_TYPE.retirement, { retiredEventId, reason: RETIREMENT_REASON.withdrawn })
/** The offer id an ask is filed by. */
export const offerOf = (event) => event.offer.offerId

/**
 * The card K3 (ask-card.d.ts as amended by F-FIX) and the requirements expect for an offer event:
 * `arguments` / `argumentsStatus` from the descriptor or null; `reason` the descriptor's, null when
 * empty or blank (the user, 2026-11-17: "Show arguments and reason"); Reject only when the
 * arguments are not complete.
 */
export function expectedCard(event, state) {
  const d = event.payload
  const status = d.argumentsStatus ?? null
  return {
    approvalId: d.approvalId, offerId: d.offerId, sessionId: event.sourceSessionId,
    sessionTitle: d.title === FIXTURE.emptyTitle ? null : d.title, question: d.prompt,
    arguments: d.arguments ?? null, argumentsStatus: status,
    reason: typeof d.reason === 'string' && d.reason.trim() !== '' ? d.reason : null,
    choices: status === null || status === ARGUMENTS_STATUS.complete ? [...ANSWER.choices] : [ANSWER.reject], askedAt: d.at, state,
  }
}

// ------------------------------------------------------------------------------------ the link

/**
 * Core's link, faked to the seam: `onPoll(fn)` and `callTool(name, args)`. `poll(events)` delivers
 * one K1 `inbox_poll` result to every listener and waits for what each returns. `answers` is a
 * queue of what `approval_answer` does next: a structuredContent, `{reject: error}`, or
 * `{hold: promise}` (the call waits on it, then answers CONNECTOR_OK).
 */
export class FakeLink {
  #listeners = new Set()
  constructor() {
    this.calls = []
    this.answers = []
    /**
     * `approvals_list` answers by session id: a structuredContent or `{reject: error}`. A session
     * with no entry answers `{ok: true, approvals: []}` (no live request). Never taken from `answers`.
     */
    this.approvals = new Map()
    this.subscriptions = 0
  }
  get listeners() { return this.#listeners.size }
  onPoll(fn) {
    this.subscriptions += 1
    this.#listeners.add(fn)
    return () => { this.#listeners.delete(fn) }
  }
  /** Delivers one page; returns what each listener resolved with (R-FIX-CORE F12: the failed ids). */
  async poll(...events) {
    const page = { ok: true, events: structuredClone(events), nextCursor: String(events.at(-1)?.sequence ?? 0), hasMore: false }
    const results = []
    for (const fn of [...this.#listeners]) results.push(await fn(page))
    await turns()
    return results
  }
  async callTool(name, args) {
    this.calls.push({ name, args: structuredClone(args) })
    if (name === TOOL.approvalsList) {
      const listed = this.approvals.get(args?.sessionId) ?? { ok: true, approvals: [] }
      if (listed.reject !== undefined) throw listed.reject
      // `{hold, then}`: the call waits on `hold`, then answers `then` (a reconcile racing a re-offer).
      if (listed.hold !== undefined) { await listed.hold; return structuredClone(listed.then) }
      return structuredClone(listed)
    }
    const next = this.answers.shift()
    if (next?.reject !== undefined) throw next.reject
    // `{hold, then?}`: the call waits on `hold`, then answers `then` (default CONNECTOR_OK).
    if (next?.hold !== undefined) { await next.hold; return next.then ?? { ...CONNECTOR_OK } }
    return next ?? { ...CONNECTOR_OK }
  }
  /** The `approval_answer` calls core sent. */
  sent() { return this.calls.filter((c) => c.name === TOOL.approvalAnswer) }
  /** The session ids of the `approvals_list` calls core sent, in order. */
  listed() { return this.calls.filter((c) => c.name === TOOL.approvalsList).map((c) => c.args) }
}

/** A few event-loop turns: lets a settled promise's tail run before a negative oracle reads. */
export async function turns() {
  for (let i = 0; i < WAIT.immediateTurns; i += 1) await new Promise((resolve) => setImmediate(resolve))
}

/** Waits until `signature()` has not changed for WAIT.quietMs (at most WAIT.settleMs): a harness wait, not an oracle. */
async function quiet(signature) {
  let last = signature()
  let since = Date.now()
  await until(() => {
    const now = signature()
    if (now !== last) { last = now; since = Date.now() }
    return Date.now() - since >= WAIT.quietMs
  }, WAIT.settleMs, WAIT.pollMs)
}

// ------------------------------------------------------------------------------------ the world

const parts = new Map()
function sdkParts(sdk) {
  if (!parts.has(sdk)) {
    const names = [...new Set([DSH.cordis, DSH.llm, DSH.storage, DSH.storageDomain, DSH.storageJson, DSH.persistence, DSH.checkpoint, DSH.agentLoop, ...DSH.sdkPlugins])]
    parts.set(sdk, Promise.all(names.map((n) => importSdk(sdk, n))).then((mods) => Object.fromEntries(names.map((n, i) => [n, mods[i]]))))
  }
  return parts.get(sdk)
}

async function newRoot() {
  return mkdtemp(path.join(await realpath(os.tmpdir()), FIXTURE.tempPrefix))
}

/**
 * A cordis context with the storage domain over `root`, and, with `agent`, a Fishball agent whose
 * model calls `script`'s tools in order. Returns `{ctx, agent?, closers}`.
 */
async function openHost(sdk, root, { agent: withAgent, script }) {
  const p = await sdkParts(sdk)
  const ctx = new p[DSH.cordis].Context()
  const closers = [() => ctx.fiber.dispose()]
  const plugins = withAgent ? DSH.sdkPlugins : [DSH.storage]
  for (const n of plugins) await ctx.plugin(p[n].default).await()
  await ctx.plugin(p[DSH.storageJson], { root: path.join(root, FIXTURE.dirs.domain) }).await()
  await ctx.plugin(p[DSH.storageDomain], { backend: DSH.jsonBackend, routes: {} }).await()
  if (!withAgent) return { ctx, closers }

  if (typeof ctx.tools.setExecutor === 'function') await ctx.plugin(await importSdk(sdk, DSH.executor)).await()
  await ctx.plugin(p[DSH.persistence], { root: path.join(root, FIXTURE.dirs.sessions), compression: DSH.noCompression }).await()
  await ctx.plugin(p[DSH.checkpoint]).await()
  let callSeq = 0
  const requests = []
  const { LlmAdapter } = p[DSH.llm]
  class FakeModel extends LlmAdapter {
    async *stream(options) {
      requests.push(structuredClone(options.messages))
      const last = options.messages.at(-1)
      const call = last?.role === DSH.toolRole ? undefined : script.shift()
      if (call !== undefined) {
        const block = { type: DSH.block.toolCall, id: FIXTURE.callId + ++callSeq, name: call.name, arguments: json(call.args) }
        yield { type: DSH.chunk.start, index: 0, blockType: DSH.block.toolCall }
        yield { type: DSH.chunk.end, index: 0, block }
        yield { type: DSH.chunk.finish, reason: { kind: DSH.finish.toolCalls } }
        return
      }
      yield { type: DSH.chunk.start, index: 0, blockType: DSH.block.text }
      yield { type: DSH.chunk.end, index: 0, block: { type: DSH.block.text, text: FIXTURE.modelText } }
      yield { type: DSH.chunk.finish, reason: { kind: DSH.finish.stop } }
    }
  }
  ctx.llm.registerAdapter([FIXTURE.provider], new FakeModel())
  await ctx.plugin(p[DSH.agentLoop].default, { agents: [], maxParallelToolCalls: 1 }).await()
  const cwd = path.join(root, FIXTURE.dirs.cwd)
  fs.mkdirSync(cwd, { recursive: true })
  const handle = await ctx.agentLoop.createAgent(ctx, {
    sessionId: FIXTURE.managerSession, agentOptions: { provider: FIXTURE.provider, model: FIXTURE.model }, meta: { cwd },
  })
  closers.push(() => handle.dispose())
  return { ctx, agent: handle.agent, closers, requests, freezeMessage: p[DSH.llm].freezeMessage }
}

/** The KvTable's write methods (dsh-storage-domain), the ones `tableFault` may fail (R-FIX-CORE F12). */
const TABLE_WRITES = Object.freeze(['put', 'update', 'delete'])
/** `table` with `fault({op, args})` asked before each write: a truthy answer makes that write reject. */
function faultyTable(table, fault) {
  return new Proxy(table, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target)
      if (typeof value !== 'function') return value
      if (!TABLE_WRITES.includes(prop)) return value.bind(target)
      return async (...args) => {
        if (fault({ op: prop, args })) throw Object.assign(new Error('fbtest-rfix EIO card table'), { code: 'EIO' })
        return value.apply(target, args)
      }
    },
  })
}

/**
 * The world of one case: the module over a real cards table and a fake link. `t.after` closes it
 * and removes its root. `agent: true` also registers `tool` in the DSH tool runtime of a real
 * Fishball agent. `restart()` closes everything and opens a new store over the same table.
 * `tableFault({op, args})` (R-FIX-CORE F12): a truthy answer makes that card-table write reject.
 */
export async function worldFor(t, sdk, { agent = false, module, tableFault } = {}) {
  const root = await newRoot()
  // `module`: another build of the module to open first (the pre-F-FIX one, subject.mjs); a case
  // sets `world.mod` before `restart()`, which then opens that build over the same table.
  const mod = module ?? await asksModule(sdk)
  let closers = []
  const closeAll = async () => { while (closers.length > 0) await closers.pop()() }
  t.after(async () => {
    await closeAll()
    assert.ok(root.startsWith(await realpath(os.tmpdir())) && path.basename(root).startsWith(FIXTURE.tempPrefix), 'refusing to remove ' + root)
    await rm(root, { recursive: true, force: true })
  })

  const script = []
  const world = { sdk, root, mod, script }
  async function open() {
    const host = await openHost(sdk, root, { agent, script })
    closers = [...host.closers]
    const opened = await exported(world.mod, 'open')(host.ctx, await importSdk(sdk, DSH.storageDomain))
    closers.push(() => opened.close())
    const link = new FakeLink()
    const table = tableFault === undefined ? opened.table : faultyTable(opened.table, tableFault)
    const asksOf = exported(world.mod, 'create')({ link, table, logger: host.ctx.logger(FIXTURE.loggerName) })
    // A case may close the store itself (ASK-UC-06); cleanup then does not close it a second time.
    let asksClosed = false
    const closeAsks = async () => { if (!asksClosed) { asksClosed = true; await asksOf.close() } }
    closers.push(closeAsks)
    world.closeAsks = closeAsks
    // Called on the module's own object: the member may hold private state.
    world.reconcile = () => {
      assert.equal(typeof asksOf[RECONCILE.member], 'function', `createAsks() returned no ${RECONCILE.member}()`)
      return asksOf[RECONCILE.member]()
    }
    if (agent) closers.push(host.ctx.tools.register(asksOf.tool))
    const { service, tool, close } = asksOf
    Object.assign(world, { ctx: host.ctx, agent: host.agent, requests: host.requests, freezeMessage: host.freezeMessage, link, table: opened.table, service, tool, close })
  }
  await open()

  let turn = 0
  Object.assign(world, {
    /** Closes the store, the domain and the DSH, then opens all of them again over the same root. */
    async restart() { await closeAll(); await open() },
    /**
     * Delivers one `inbox_poll` page, then waits until `list()` has not changed for WAIT.quietMs:
     * a store may write its table (a disk write) after the poll listener returns.
     */
    async poll(...events) {
      const results = await world.link.poll(...events)
      await quiet(() => json(world.service.list()))
      return results
    },
    /** Polls `events`, then files the first one's offer with the tool. */
    async file(event, ...more) {
      await world.poll(event, ...more)
      return world.tool.execute({ [ASK_TOOL.arg]: offerOf(event) })
    },
    card: (approvalId) => world.service.list().find((c) => c.approvalId === approvalId),
    /**
     * One Fishball turn; the model calls `ask_user` with `args` when given, else answers in text.
     * Returns the tool result message DSH handed the model (undefined without a call).
     */
    async fishballTurn(args) {
      if (args !== undefined) script.push({ name: ASK_TOOL.name, args })
      const from = world.requests.length
      const id = FIXTURE.userId + ++turn
      const content = [{ type: DSH.block.text, text: FIXTURE.userText }]
      world.agent.followup(world.freezeMessage({ id, role: DSH.userRole, content, source: DSH.userSource }))
      const ok = await until(async () => {
        await world.agent.whenIdle()
        return world.requests.length > from && world.agent.status === DSH.idle && script.length === 0
      }, WAIT.settleMs, WAIT.pollMs)
      assert.ok(ok, 'timed out waiting for Fishball\'s turn')
      return world.requests.slice(from).flat().findLast((m) => m.role === DSH.toolRole)
    },
  })
  return world
}

// ------------------------------------------------------------------------------------ the routes

/**
 * `registerAskRoutes` over a fake Fetch registry: `routes` by path, and how many of their
 * disposers ran. `managerSessionId` is the K3 function form.
 */
export function routesFor(world, managerSessionId = () => FIXTURE.managerSession) {
  const routes = new Map()
  let disposed = 0
  const ctx = { connection: { fetch: { register(route) { routes.set(route.path, route); return () => { disposed += 1 } } } } }
  const dispose = exported(world.mod, 'routes')(ctx, { service: world.service, managerSessionId })
  return { routes, dispose, disposed: () => disposed }
}

/** A `Request` for one route. */
export function request(route, method, body) {
  const init = { method }
  if (body !== undefined) Object.assign(init, { body: typeof body === 'string' ? body : json(body), headers: { [ROUTE.contentType]: FIXTURE.jsonType } })
  return new Request(FIXTURE.origin + route, init)
}

/** Reads SSE frames (`data: <json>\n\n`) from a Response body; `next()` waits for one frame. */
export function frames(response) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let done = false
  async function next(timeoutMs = WAIT.frameMs) {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const end = buffer.indexOf(ROUTE.frameEnd)
      if (end >= 0) {
        const frame = buffer.slice(0, end)
        buffer = buffer.slice(end + ROUTE.frameEnd.length)
        const data = frame.split(ROUTE.lineEnd).filter((l) => l.startsWith(ROUTE.framePrefix)).map((l) => l.slice(ROUTE.framePrefix.length)).join(ROUTE.lineEnd)
        if (data !== '') return JSON.parse(data)
        continue
      }
      if (done) return undefined
      const left = deadline - Date.now()
      if (left <= 0) throw new Error('timed out waiting for an SSE frame') // harness wait, not an oracle
      const chunk = await Promise.race([reader.read(), new Promise((resolve) => setTimeout(resolve, left, { timeout: true }))])
      if (chunk.timeout) continue
      if (chunk.done) done = true
      else buffer += decoder.decode(chunk.value, { stream: true })
    }
  }
  /** Whether the stream ends within the wait (the server closed it). */
  async function ends(timeoutMs = WAIT.frameMs) {
    const deadline = Date.now() + timeoutMs
    while (!done && Date.now() < deadline) {
      const chunk = await Promise.race([reader.read(), new Promise((resolve) => setTimeout(resolve, deadline - Date.now(), { timeout: true }))])
      if (chunk.timeout) break
      if (chunk.done) done = true
    }
    return done
  }
  return { next, ends, cancel: () => reader.cancel().catch(() => {}) }
}
