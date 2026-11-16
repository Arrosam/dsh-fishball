/**
 * `fishballInstance.manager` (X1, X1a, X2, X10, X11; V3 F-WIRE, was the V2 child's X0-C service in
 * src/slim/child/extensions.js). Only the manager member lives here: the main row composes the
 * service object (apiVersion, events, ui, bridge) around it. Transport adapters own MCP names,
 * authentication and routing.
 */
import path from 'node:path'
import { open, readFile, rename, writeFile } from 'node:fs/promises'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { appendPluginRecord } from '@deepseek-ai/dsh-session'

const MANAGER_SERVICE = Object.freeze({
  /** Accepted notification keys kept for dedupe before the oldest are compacted away. */
  notifyKeys: 10_000,
  logger: 'fishballInstance',
  file: 'notify-keys.jsonl', fileMode: 0o600, encoding: 'utf8', tempSuffix: '.tmp', missingFile: 'ENOENT',
  services: Object.freeze({ profileContext: 'profileContext', persistence: 'sessionPersistence' }),
  /** A notice's durable states, and the receipts notify() resolves to. */
  state: Object.freeze({ pending: 'pending', accepted: 'accepted' }),
  receipt: Object.freeze({ queued: 'queued', held: 'held', duplicate: 'duplicate' }),
  /** DSH session events this service folds; `running` is the agent status of a turn in flight. */
  event: Object.freeze({ userMessage: 'user/message', inboxSplice: 'agent/inbox/spliced', turnStart: 'turn/start', sessionEvent: 'session/event' }),
  running: 'running',
  /** A plugin notice's message source: Fishball's own notice, never the user's words. */
  noticeSource: Object.freeze({ kind: 'fishball-notice', form: 'plugin' }),
  userSourceKind: 'user',
  textBlock: 'text',
  /** ExtensionError codes and members. */
  code: Object.freeze({
    queueUnavailable: 'durable-queue-unavailable', wakeUnsupported: 'pending-wake-unsupported',
    notReady: 'manager-not-ready', closed: 'closed',
  }),
  member: Object.freeze({ setup: 'manager.registerSetup', notify: 'manager.notify', ensure: 'manager.ensureSession' }),
  boundsMessage: 'userTexts requires nonnegative integer bounds',
})

export class ExtensionError extends Error {
  constructor(code, member) {
    super(`${member}: ${code}`)
    this.name = 'ExtensionError'
    this.code = code
    this.member = member
  }
}

/** Any insertion is acceptance, including an already consumed/discarded message. */
function observeAcceptance(index, event) {
  const { event: EVENT } = MANAGER_SERVICE
  if (event.type === EVENT.inboxSplice) for (const message of event.data.inserted ?? []) index.ids.add(message.id)
  if (event.type === EVENT.userMessage) index.ids.add(event.data.id)
  if (event.data?.notificationId) {
    let ids = index.records.get(event.type)
    if (!ids) index.records.set(event.type, ids = new Set())
    ids.add(event.data.notificationId)
  }
}

/**
 * Create the manager service over one row context.
 *
 * @param {object} ctx - the owning row's Cordis context (`get`, `on`, optional `logger`).
 * @returns {{manager: Readonly<object>, setup(agentCtx: object, live: object): Promise<void>,
 *   published(live: object): Promise<void>, start(): Promise<void>, close(): void,
 *   markReady(): void, resumePending(): Promise<void>,
 *   bind(session: {activate: Function, activateAttached: Function, sessionId: Function}): void}}
 *   setup and published are the manager session's options of the same names; bind takes that
 *   session (src/manager/session.js) before anything activates it.
 */
export function createManagerService(ctx) {
  const { state: STATE, receipt: RECEIPT, code: CODE, member: MEMBER } = MANAGER_SERVICE
  const filename = path.join(ctx.get(MANAGER_SERVICE.services.profileContext).home, MANAGER_SERVICE.file)
  const logger = ctx.logger?.(MANAGER_SERVICE.logger)
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
    if (entry.state === STATE.accepted && !entry.holding) evictable.add(entry.dedupeKey)
  }
  let session
  let current
  // READY gate (final scope §4 READY): `readiness` is resolved only by this generation's
  // actual appReady.onReady (markReady). close(), the disposal path a failed or replaced
  // generation also takes, rejects every page-open wait in `releases` at once, whether it is
  // still before ready or joined to an activation a disposed session may never complete.
  // Per-call releases, each removed when its wait settles, keep no reaction alive for the
  // generation's lifetime, as a shared retirement promise would per POST. One gate per
  // createManagerService call is the generation fence: a restart builds a new service with a
  // fresh gate, so an old signal can neither ready the new generation nor be inherited by it.
  // No timer: a signal that never fires leaves page-open ensures honestly pending.
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
    const service = ctx.get(MANAGER_SERVICE.services.persistence)
    if (typeof service?.flush !== 'function') throw new ExtensionError(CODE.queueUnavailable, MEMBER.notify)
    return service
  }
  async function flush() { await persistence().flush() }
  async function syncFile(file) {
    const handle = await open(file, 'r')
    try { await handle.sync() } finally { await handle.close() }
  }
  async function compact() {
    const temp = filename + MANAGER_SERVICE.tempSuffix
    await writeFile(temp, [...notices.values()].map((entry) => JSON.stringify(entry) + '\n').join(''), { mode: MANAGER_SERVICE.fileMode })
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
    const handle = await open(filename, 'a', MANAGER_SERVICE.fileMode)
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
    if (evictable.size > MANAGER_SERVICE.notifyKeys) {
      while (evictable.size > MANAGER_SERVICE.notifyKeys) {
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
    try { text = await readFile(filename, MANAGER_SERVICE.encoding) } catch (error) { if (error.code === MANAGER_SERVICE.missingFile) return; throw error }
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
    logger?.warn('extension callback failed (%s, %s)', pluginId, MEMBER.setup)
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
    if (!Number.isSafeInteger(limit) || limit < 0 || !Number.isSafeInteger(maxChars) || maxChars < 0) throw new TypeError(MANAGER_SERVICE.boundsMessage)
    if (!current || limit === 0) return []
    return current.live.session.snapshotEvents().filter((event) => event.type === MANAGER_SERVICE.event.userMessage && event.data.source?.kind === MANAGER_SERVICE.userSourceKind).reverse().slice(0, limit).map((event) => {
      const text = (event.data.content ?? []).filter((block) => block.type === MANAGER_SERVICE.textBlock).map((block) => block.text).join('')
      let clipped = text.slice(0, maxChars)
      if (/[\uD800-\uDBFF]$/.test(clipped)) clipped = clipped.slice(0, -1)
      return { text: clipped, at: event.time }
    })
  }
  function requirePublished() {
    if (closed) throw new ExtensionError(CODE.closed, MEMBER.notify)
    // Host setup is composition-only. Awaiting activation here would deadlock
    // publication; driving the unpublished agent would violate the factory contract.
    if (current && !current.published) throw new ExtensionError(CODE.notReady, MEMBER.notify)
  }
  function pendingMessage(live, id) {
    return [...live.inbox.nextTurn, ...live.inbox.nextStep].some((message) => message.id === id)
  }
  function requireQueue(live) {
    persistence()
    if (!live.inbox || !Array.isArray(live.inbox.nextTurn) || !Array.isArray(live.inbox.nextStep)) {
      throw new ExtensionError(CODE.queueUnavailable, MEMBER.notify)
    }
  }
  async function accept(live, entry) {
    requireQueue(live)
    if (entry.wake) {
      if (!indexFor(live).ids.has(entry.message.id)) await live.followup(entry.message)
      else if (pendingMessage(live, entry.message.id) && live.status !== MANAGER_SERVICE.running) {
        // No public wake-existing primitive: replaying followup inserts the same
        // identity twice. Keep pending, expose the gap, and never fake acceptance.
        throw new ExtensionError(CODE.wakeUnsupported, MEMBER.notify)
      }
      if (!indexFor(live).ids.has(entry.message.id)) throw new ExtensionError(CODE.queueUnavailable, MEMBER.notify)
      await flush()
    }
    if (entry.record && !indexFor(live).records.get(entry.record.type)?.has(entry.message.id)) {
      appendPluginRecord(live.session, entry.record.type, { ...entry.record.data, notificationId: entry.message.id })
      await flush()
    }
    // A notice without a wake is held: injectHeld below admits it at the next turn's start.
    await save({ ...entry, state: STATE.accepted, holding: !entry.wake })
    return { status: entry.wake ? RECEIPT.queued : RECEIPT.held }
  }
  async function notify(input) {
    requirePublished()
    input = JSON.parse(JSON.stringify(input))
    const live = await session.activate()
    return exclusive(async () => {
      requireQueue(live)
      let entry = notices.get(input.dedupeKey)
      if (dirty) await compact()
      if (entry?.state === STATE.accepted) return { status: RECEIPT.duplicate }
      if (!entry) {
        const message = createUserMessage({ content: [{ type: MANAGER_SERVICE.textBlock, text: input.text }], source: { ...MANAGER_SERVICE.noticeSource, pluginId: input.pluginId } })
        // Snapshot caller-owned data before the first disk await.
        entry = JSON.parse(JSON.stringify({ ...input, message, state: STATE.pending }))
        await save(entry)
      }
      return accept(live, entry)
    })
  }
  /**
   * Create or resume THE manager session without a turn (user decision 7.A, 2026-11-09: the
   * native page needs a real Session before its composer is editable). It joins the session's
   * single activation, so a page open racing notify never makes a second Session. Unlike notify
   * it does not refuse during an unpublished setup: its caller is the page route, never a setup
   * callback, so joining the in-flight activation cannot deadlock. Recovery inside activation
   * may still queue previously pending notices; that is existing work, not a setup turn. READY
   * (final scope §4): activation waits for this generation's actual appReady signal, so a call
   * before it stays pending and a call after it proceeds without another signal or timer.
   * Waiting here, at request time, never blocks boot or plugin apply, which must settle before
   * appReady can fire. Concurrent waiters are released together and join the session's single
   * activation. Disposal refuses pending and in-flight calls at once (route: 503); the
   * activation itself is not cancelled, since the session owns it and other callers may share
   * it. After each wait `closed` is checked again, so a stale generation never starts an
   * activation or reports one as finished after it was retired. Only this page-open path is
   * gated; notices keep their own existing activation. It is also the only caller that requires
   * the workspace attach (session.activateAttached; notices and recovery use session.activate,
   * which logs a failed attach and proceeds, Fishball's decision 2026-11-11): a failed attach
   * rejects here (route 503) and is retried on the next call. Resolves to the live session id;
   * the route validates it rather than coercing it.
   */
  async function ensureSession() {
    refuseClosed()
    await untilRetired(readiness.promise)
    refuseClosed()
    const live = await untilRetired(session.activateAttached())
    refuseClosed()
    return live.id
  }
  function refuseClosed() {
    if (closed) throw new ExtensionError(CODE.closed, MEMBER.ensure)
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
        if (entry.state !== STATE.pending) continue
        try { await accept(live, entry) }
        catch (error) { logger?.warn('notification recovery remains pending (%s)', error?.code ?? error?.name) }
      }
      // Accepted means durable queue acceptance, not completed model work. Detect
      // the restart cut even when the accepted marker itself survived.
      for (const entry of notices.values()) {
        if (entry.wake && entry.state === STATE.accepted && live.status !== MANAGER_SERVICE.running && live.inbox && pendingMessage(live, entry.message.id)) {
          logger?.warn('notification recovery requires host wake-existing support (%s)', CODE.wakeUnsupported)
        }
      }
    })
  }

  // Admit held notices into the turn that is starting. Do not merge them into a new followup
  // identity: a crash between mapping and insertion would otherwise leave no recoverable copy.
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
  const offTurn = ctx.on(MANAGER_SERVICE.event.sessionEvent, (eventSession, event) => {
    const index = acceptance.get(eventSession)
    if (index) observeAcceptance(index, event)
    const live = current?.live
    if (closed || eventSession !== live?.session || event.type !== MANAGER_SERVICE.event.turnStart || !held.size) return
    queueMicrotask(() => {
      if (closed || current?.live !== live) return
      try { injectHeld(live) }
      catch { logger?.warn('held notification injection failed') }
    })
  })

  function close() {
    closed = true
    for (const release of releases) release(new ExtensionError(CODE.closed, MEMBER.ensure))
    releases.clear()
    offTurn()
    for (const registration of registrations) {
      registration.disposed = true
      for (const fiber of registration.fibers) fiber.dispose()
    }
    registrations.clear()
    current = undefined
  }
  const manager = Object.freeze({ sessionId: () => session?.sessionId(), ensureSession, registerSetup, notify, userTexts })
  return {
    manager, start, setup, close,
    async published(live) {
      if (current?.live === live) current.published = true
      await recover(live)
    },
    /** Wire to this generation's appReady.onReady only; inert once closed (or repeated). */
    markReady() { if (!closed) readiness.resolve() },
    async resumePending() {
      if ([...notices.values()].some((entry) => entry.state === STATE.pending || entry.wake)) await session.activate()
    },
    bind(port) { session = port },
  }
}
