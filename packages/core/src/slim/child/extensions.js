/** Local X0-C service. Transport adapters own MCP names, authentication and routing. */
import path from 'node:path'
import { open, readFile, rename, writeFile } from 'node:fs/promises'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { appendPluginRecord } from '@deepseek-ai/dsh-session'
import { ContractError, ERROR, OPERATION, validateRequest } from 'dsh-connector/contract'

export const EXT_LIMITS = Object.freeze({ notifyKeys: 10_000, recordTextChars: 8000 })
const EXT = Object.freeze({
  service: 'fishballInstance', file: 'notify-keys.jsonl', mode: 0o600,
  pending: 'pending', accepted: 'accepted', queued: 'queued', held: 'held', duplicate: 'duplicate',
  setup: 'manager.registerSetup', notImplemented: 'not-implemented',
  userMessage: 'user/message', inboxSplice: 'agent/inbox/spliced', turnStart: 'turn/start',
  scopeService: 'fishballBridgeScope', notifyMember: 'manager.notify', ensureMember: 'manager.ensureSession',
  queueUnavailable: 'durable-queue-unavailable', wakeUnsupported: 'pending-wake-unsupported',
  notReady: 'manager-not-ready', closed: 'closed', running: 'running',
})
export const EXTENSION_SERVICE = EXT.service

export class ExtensionError extends Error {
  constructor(code, member) {
    super(`${member}: ${code}`)
    this.name = 'ExtensionError'
    this.code = code
    this.member = member
  }
}

// X0-S replaces this only when supervision is effectively on. Both existing send
// paths already meet at BridgeClient.request; no transport vocabulary is added here.
export const gate = Object.freeze({
  send(_operation, _sessionId) { return { ok: true } },
  prefix(_item) { return '' },
})

/**
 * @typedef {{request(operation: string, payload: object): Promise<object>}} ControlPort
 * @typedef {{text: string, kind?: string, sourceSessionId?: string, images?: object[]}} IntakeItem
 * @typedef {{deliverInbox(items: IntakeItem|IntakeItem[], options?: {skipImages?: boolean}): Promise<{messageId: string}>}} IntakePort
 * These are local domain ports, NOT MCP callables or a push protocol. X0-W
 * supplies scoped control over the retained connector. MCP adapters are deferred
 * to V3; a local receipt promises queue acceptance, not completed model work.
 */

function stub(member, asynchronous = false) {
  const refuse = () => { throw new ExtensionError(EXT.notImplemented, member) }
  return asynchronous ? async () => refuse() : refuse
}
function stubs(area, members, asynchronous = []) {
  return Object.freeze(Object.fromEntries(members.map((member) => [member, stub(`${area}.${member}`, asynchronous.includes(member))])))
}

/** Any insertion is acceptance, including an already consumed/discarded message. */
function observeAcceptance(index, event) {
  if (event.type === EXT.inboxSplice) for (const message of event.data.inserted ?? []) index.ids.add(message.id)
  if (event.type === EXT.userMessage) index.ids.add(event.data.id)
  if (event.data?.notificationId) {
    let ids = index.records.get(event.type)
    if (!ids) index.records.set(event.type, ids = new Set())
    ids.add(event.data.notificationId)
  }
}

export function createExtensions(ctx) {
  const filename = path.join(ctx.get('profileContext').home, EXT.file)
  const logger = ctx.logger?.(EXT.service)
  const registrations = new Set()
  const warned = new Set()
  const notices = new Map()
  const evictable = new Set()
  const held = new Set()
  const releasing = new Set()
  // Seed once per Session object, then fold its synchronous publication stream.
  // Consumed/discarded identities still count as accepted; retain them for the
  // live Session rather than rescanning its growing history for each receipt.
  const acceptance = new WeakMap()
  function indexFor(live) {
    let index = acceptance.get(live.session)
    if (!index) {
      index = { ids: new Set(), records: new Map() }
      for (const event of live.session.snapshotEvents()) observeAcceptance(index, event)
      acceptance.set(live.session, index)
    }
    return index
  }
  function remember(entry) {
    notices.delete(entry.dedupeKey)
    notices.set(entry.dedupeKey, entry)
    evictable.delete(entry.dedupeKey)
    held.delete(entry.dedupeKey)
    if (entry.holding) held.add(entry.dedupeKey)
    if (entry.state === EXT.accepted && !entry.holding) evictable.add(entry.dedupeKey)
  }
  let chat
  let current
  // READY gate (final scope §4 READY): `readiness` is resolved only by this generation's
  // actual child appReady.onReady (markReady). close(), the disposal path a failed or
  // replaced generation also takes, rejects every page-open wait in `releases` at once,
  // whether it is still before ready or joined to an activation a disposed chat may never
  // complete. Per-call releases, each removed when its wait settles, keep no reaction
  // alive for the generation's lifetime, as a shared retirement promise would per POST.
  // One gate per createExtensions call is the generation fence: a restart builds new
  // extensions with a fresh gate, so an old signal can neither ready the new generation
  // nor be inherited by it. No timer: a signal that never fires leaves page-open ensures
  // honestly pending.
  const readiness = Promise.withResolvers()
  const releases = new Set()
  let serial = Promise.resolve()
  let dirty = false
  let linked = false
  let closed = false

  function exclusive(fn) {
    const result = serial.then(fn)
    serial = result.catch(() => {})
    return result
  }
  function persistence() {
    const service = ctx.get('sessionPersistence')
    if (typeof service?.flush !== 'function') throw new ExtensionError(EXT.queueUnavailable, EXT.notifyMember)
    return service
  }
  async function flush() { await persistence().flush() }
  async function syncFile(file) {
    const handle = await open(file, 'r')
    try { await handle.sync() } finally { await handle.close() }
  }
  async function compact() {
    const temp = filename + '.tmp'
    await writeFile(temp, [...notices.values()].map((entry) => JSON.stringify(entry) + '\n').join(''), { mode: EXT.mode })
    await syncFile(temp)
    await rename(temp, filename)
    await syncFile(path.dirname(filename))
    linked = true
    dirty = false
  }
  async function save(entry) {
    // A failed write never becomes success in memory. Reconcile the whole snapshot
    // before another append if an earlier write/rename had an uncertain outcome.
    if (dirty) await compact()
    dirty = true
    const handle = await open(filename, 'a', EXT.mode)
    try {
      await handle.writeFile(JSON.stringify(entry) + '\n')
      await handle.sync()
    } finally { await handle.close() }
    // Appending changes the inode, not its directory entry. Sync the directory
    // only to establish the initial link (and after compaction's rename).
    if (!linked) {
      await syncFile(path.dirname(filename))
      linked = true
    }
    remember(entry)
    dirty = false
    if (evictable.size > EXT_LIMITS.notifyKeys) {
      while (evictable.size > EXT_LIMITS.notifyKeys) {
        const key = evictable.values().next().value
        evictable.delete(key)
        notices.delete(key)
      }
      dirty = true
      await compact()
    }
  }
  async function start() {
    let text
    try { text = await readFile(filename, 'utf8') } catch (error) { if (error.code === 'ENOENT') return; throw error }
    // Only complete JSONL records were committed. An interrupted final append
    // cannot have reached queueing; a lost accepted marker is reconciled by ID.
    const lines = text.split('\n')
    if (lines.pop() !== '') dirty = true
    for (const line of lines) {
      if (!line) continue
      const entry = JSON.parse(line)
      remember(entry)
    }
    if (dirty) await compact()
  }
  function warn(pluginId) {
    if (warned.has(pluginId)) return
    warned.add(pluginId)
    logger?.warn('extension callback failed (%s, %s)', pluginId, EXT.setup)
  }
  async function apply(registration, agentCtx, live) {
    if (registration.disposed || closed) return
    let fiber
    let failed = false
    try {
      // Await the real Cordis fiber, including thenable callbacks. Providers stay in
      // this scope: systemPrompt.context is evaluated by DSH on every assembly,
      // never snapshotted here, and disposal removes tools and dynamic context alike.
      fiber = agentCtx.plugin({ async apply(scope) {
        try { return await registration.fn(scope, live) }
        catch { failed = true; warn(registration.pluginId) }
      } })
      registration.fibers.add(fiber)
      await fiber
    } catch { failed = true; warn(registration.pluginId) }
    finally {
      if (fiber && (failed || registration.disposed || closed)) {
        await fiber.dispose()
        registration.fibers.delete(fiber)
      }
    }
  }
  function registerSetup(pluginId, fn) {
    const registration = { pluginId, fn, fibers: new Set(), disposed: false }
    registrations.add(registration)
    if (current && !current.settingUp) {
      void apply(registration, current.ctx, current.live).catch(() => { warn(pluginId) })
    }
    return () => {
      if (registration.disposed) return
      registration.disposed = true
      registrations.delete(registration)
      for (const fiber of registration.fibers) fiber.dispose()
      registration.fibers.clear()
    }
  }
  async function setup(agentCtx, live) {
    const state = { ctx: agentCtx, live, settingUp: true, published: false }
    current = state
    try {
      for (const registration of registrations) await apply(registration, agentCtx, live)
    } finally { state.settingUp = false }
  }
  function userTexts({ limit, maxChars }) {
    if (!Number.isSafeInteger(limit) || limit < 0 || !Number.isSafeInteger(maxChars) || maxChars < 0) throw new TypeError('userTexts requires nonnegative integer bounds')
    if (!current || limit === 0) return []
    return current.live.session.snapshotEvents().filter((event) => event.type === EXT.userMessage && event.data.source?.kind === 'user').reverse().slice(0, limit).map((event) => {
      const text = (event.data.content ?? []).filter((block) => block.type === 'text').map((block) => block.text).join('')
      let clipped = text.slice(0, maxChars)
      if (/[\uD800-\uDBFF]$/.test(clipped)) clipped = clipped.slice(0, -1)
      return { text: clipped, at: event.time }
    })
  }
  function requirePublished() {
    if (closed) throw new ExtensionError(EXT.closed, EXT.notifyMember)
    // Host setup is composition-only. Awaiting activation here would deadlock
    // publication; driving the unpublished agent would violate the factory contract.
    if (current && !current.published) throw new ExtensionError(EXT.notReady, EXT.notifyMember)
  }
  function pendingMessage(live, id) {
    return [...live.inbox.nextTurn, ...live.inbox.nextStep].some((message) => message.id === id)
  }
  function requireQueue(live) {
    persistence()
    if (!live.inbox || !Array.isArray(live.inbox.nextTurn) || !Array.isArray(live.inbox.nextStep)) {
      throw new ExtensionError(EXT.queueUnavailable, EXT.notifyMember)
    }
  }
  async function accept(live, entry) {
    requireQueue(live)
    if (entry.wake) {
      if (!indexFor(live).ids.has(entry.message.id)) await live.followup(entry.message)
      else if (pendingMessage(live, entry.message.id) && live.status !== EXT.running) {
        // No public wake-existing primitive: replaying followup inserts the same
        // identity twice. Keep pending, expose the gap, and never fake acceptance.
        throw new ExtensionError(EXT.wakeUnsupported, EXT.notifyMember)
      }
      if (!indexFor(live).ids.has(entry.message.id)) throw new ExtensionError(EXT.queueUnavailable, EXT.notifyMember)
      await flush()
    }
    if (entry.record && !indexFor(live).records.get(entry.record.type)?.has(entry.message.id)) {
      appendPluginRecord(live.session, entry.record.type, { ...entry.record.data, notificationId: entry.message.id })
      await flush()
    }
    await save({ ...entry, state: EXT.accepted, holding: !entry.wake })
    return { status: entry.wake ? EXT.queued : EXT.held }
  }
  async function notify(input) {
    requirePublished()
    input = JSON.parse(JSON.stringify(input))
    const live = await chat.activate()
    return exclusive(async () => {
      requireQueue(live)
      let entry = notices.get(input.dedupeKey)
      if (dirty) await compact()
      if (entry?.state === EXT.accepted) return { status: EXT.duplicate }
      if (!entry) {
        const message = createUserMessage({ content: [{ type: 'text', text: input.text }], source: { kind: 'fishball-notice', form: 'plugin', pluginId: input.pluginId } })
        // Snapshot caller-owned data before the first disk await.
        entry = JSON.parse(JSON.stringify({ ...input, message, state: EXT.pending }))
        await save(entry)
      }
      return accept(live, entry)
    })
  }
  /**
   * Create or resume THE manager session without a turn (user decision 7.A, 2026-11-09: the
   * native page needs a real Session before its composer is editable). It joins the chat's
   * single activation, so a page open racing notify/handover/send never makes a second
   * Session. Unlike notify it does not refuse during an unpublished setup: its caller is the
   * page route, never a setup callback, so joining the in-flight activation cannot deadlock.
   * Recovery inside activation may still queue previously pending notices; that is existing
   * work, not a setup turn. READY (final scope §4): activation waits for this generation's
   * actual child appReady signal, so a call before it stays pending and a call after it
   * proceeds without another signal or timer. Waiting here, at request time, never blocks
   * boot or plugin apply, which must settle before appReady can fire. Concurrent waiters are
   * released together and join chat.activate()'s single activation. Disposal refuses pending
   * and in-flight calls at once (route: 503); the activation itself is not cancelled, since
   * the chat owns it and other callers may share it. After each wait `closed` is checked
   * again, so a stale generation never starts an activation or reports one as finished
   * after it was retired. Only this page-open path is gated; notices keep their own
   * existing activation. It is also the only caller that requires the workspace attach
   * (chat.activateAttached; notices and recovery use chat.activate, which logs a failed attach
   * and proceeds, Fishball's decision 2026-11-11): a failed attach rejects here (route 503) and
   * is retried on the next call. Resolves to the live session id; the route validates it rather
   * than coercing it.
   */
  async function ensureSession() {
    refuseClosed()
    await untilRetired(readiness.promise)
    refuseClosed()
    const live = await untilRetired(chat.activateAttached())
    refuseClosed()
    return live.id
  }
  function refuseClosed() {
    if (closed) throw new ExtensionError(EXT.closed, EXT.ensureMember)
  }
  /** Settle like `work`, unless this generation is retired first; then refuse. */
  function untilRetired(work) {
    const release = Promise.withResolvers()
    releases.add(release.reject)
    return Promise.race([work, release.promise]).finally(() => { releases.delete(release.reject) })
  }
  async function recover(live) {
    return exclusive(async () => {
      for (const entry of [...notices.values()]) {
        if (entry.state !== EXT.pending) continue
        try { await accept(live, entry) }
        catch (error) { logger?.warn('notification recovery remains pending (%s)', error?.code ?? error?.name) }
      }
      // Accepted means durable queue acceptance, not completed model work. Detect
      // the restart cut even when the accepted marker itself survived.
      for (const entry of notices.values()) {
        if (entry.wake && entry.state === EXT.accepted && live.status !== EXT.running && live.inbox && pendingMessage(live, entry.message.id)) {
          logger?.warn('notification recovery requires host wake-existing support (%s)', EXT.wakeUnsupported)
        }
      }
    })
  }

  // Stage held identities before an owned idle wake; external wakes defer below.
  // Do not merge them into a new followup identity: a crash between mapping and
  // insertion would otherwise leave no recoverable copy of that followup.
  async function queue(live, message) {
    return exclusive(async () => {
      requireQueue(live)
      // This owned wake path can stage next-step context before the SDK's
      // synchronous first claim. External wakes use the deferred observer below.
      if (live.status !== EXT.running) injectHeld(live)
      await live.followup(message)
      if (!indexFor(live).ids.has(message.id)) throw new ExtensionError(EXT.queueUnavailable, EXT.notifyMember)
      await flush()
      return { messageId: message.id }
    })
  }
  function injectHeld(live) {
    const ids = indexFor(live).ids
    for (const key of held) {
      const entry = notices.get(key)
      if (releasing.has(entry.message.id) || (entry.deliveryId && ids.has(entry.deliveryId))) continue
      if (!ids.has(entry.message.id)) live.inject(entry.message)
      releasing.add(entry.message.id)
      void exclusive(async () => {
        await flush()
        await save({ ...entry, holding: false })
      }).catch(() => { logger?.warn('held notification acceptance could not be persisted') })
        .finally(() => { releasing.delete(entry.message.id) })
    }
  }
  // Session publication forbids reentrant appends. Defer only the injection to
  // the microtask boundary: the first claim may already have happened, so the SDK
  // admits this context on its next step in the same turn, without another wake.
  // Do not put injection behind disk I/O in the serial queue: the turn could end.
  const offTurn = ctx.on('session/event', (session, event) => {
    const index = acceptance.get(session)
    if (index) observeAcceptance(index, event)
    const live = current?.live
    if (closed || session !== live?.session || event.type !== EXT.turnStart || !held.size) return
    queueMicrotask(() => {
      if (closed || current?.live !== live) return
      try { injectHeld(live) }
      catch { logger?.warn('held notification injection failed') }
    })
  })

  function close() {
    closed = true
    for (const release of releases) release(new ExtensionError(EXT.closed, EXT.ensureMember))
    releases.clear()
    offTurn()
    for (const registration of registrations) {
      registration.disposed = true
      for (const fiber of registration.fibers) fiber.dispose()
    }
    registrations.clear()
    current = undefined
  }
  const service = Object.freeze({
    apiVersion: 1,
    manager: Object.freeze({ sessionId: () => chat?.sessionId(), ensureSession, registerSetup, notify, userTexts }),
    chat: Object.freeze({}),
    ui: Object.freeze({}),
    bridge(pluginId, operations) {
      const scope = ctx.get(EXT.scopeService)
      if (typeof scope !== 'function') return stub('bridge')()
      return scope(pluginId, operations)
    },
    inbox: stubs('inbox', ['claim', 'release', 'setBatcher'], ['release']),
    attention: Object.freeze({
      async signal(pluginId, input) {
        if (closed) throw new ContractError(ERROR.disconnected)
        const payload = { ...validateRequest(OPERATION.attentionSignal, input) }
        const scope = ctx.get(EXT.scopeService)
        if (typeof scope !== 'function') throw new ContractError(ERROR.disconnected)
        const port = scope(pluginId, [OPERATION.attentionSignal])
        if (!port.supports(OPERATION.attentionSignal)) throw new ContractError(ERROR.operation)
        // No instance state, retry or reconnect replay: only the connector owns unread.
        return port.request(OPERATION.attentionSignal, payload)
      },
    }),
    sideAgents: stubs('sideAgents', ['open', 'runTurn', 'cancel'], ['open', 'runTurn']),
    approvals: stubs('approvals', ['claim', 'card', 'onSettled', 'answerApproval'], ['answerApproval']),
    supervision: stubs('supervision', ['register', 'onManagedChange', 'endingReason']),
    sessionStarts: stubs('sessionStarts', ['register']),
  })
  return {
    service, start, setup, queue, close,
    async published(live) {
      if (current?.live === live) current.published = true
      await recover(live)
    },
    /** Wire to this generation's appReady.onReady only; inert once closed (or repeated). */
    markReady() { if (!closed) readiness.resolve() },
    async resumePending() {
      if ([...notices.values()].some((entry) => entry.state === EXT.pending || entry.wake)) await chat.activate()
    },
    bind(port) { chat = port },
  }
}
