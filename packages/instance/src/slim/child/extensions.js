/** Local X0-C service. Transport adapters own MCP names, authentication and routing. */
import path from 'node:path'
import { appendFile, open, readFile, rename, writeFile } from 'node:fs/promises'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { appendPluginRecord } from '@deepseek-ai/dsh-session'
import { ContractError, ERROR, OPERATION, validateRequest } from '../contract.js'

export const EXT_LIMITS = Object.freeze({ notifyKeys: 10_000, recordTextChars: 8000 })
const EXT = Object.freeze({
  service: 'fishballInstance', file: 'notify-keys.jsonl', mode: 0o600,
  pending: 'pending', accepted: 'accepted', queued: 'queued', held: 'held', duplicate: 'duplicate',
  setup: 'manager.registerSetup', notImplemented: 'not-implemented',
  userMessage: 'user/message', inboxSplice: 'agent/inbox/spliced', turnStart: 'turn/start',
  scopeService: 'fishballBridgeScope', notifyMember: 'manager.notify',
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
function acceptedIds(live) {
  const ids = new Set()
  for (const event of live.session.snapshotEvents()) {
    if (event.type === EXT.inboxSplice) for (const message of event.data.inserted ?? []) ids.add(message.id)
    if (event.type === EXT.userMessage) ids.add(event.data.id)
  }
  return ids
}

export function createExtensions(ctx) {
  const filename = path.join(ctx.get('profileContext').home, EXT.file)
  const logger = ctx.logger?.(EXT.service)
  const registrations = new Set()
  const warned = new Set()
  const notices = new Map()
  let chat
  let current
  let serial = Promise.resolve()
  let dirty = false
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
    dirty = false
  }
  async function save(entry) {
    // A failed write never becomes success in memory. Reconcile the whole snapshot
    // before another append if an earlier write/rename had an uncertain outcome.
    if (dirty) await compact()
    dirty = true
    await appendFile(filename, JSON.stringify(entry) + '\n', { mode: EXT.mode })
    await syncFile(filename)
    await syncFile(path.dirname(filename))
    notices.delete(entry.dedupeKey)
    notices.set(entry.dedupeKey, entry)
    dirty = false
    const accepted = [...notices.values()].filter((item) => item.state === EXT.accepted && !item.holding)
    if (accepted.length > EXT_LIMITS.notifyKeys) {
      for (const item of accepted.slice(0, accepted.length - EXT_LIMITS.notifyKeys)) notices.delete(item.dedupeKey)
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
      notices.delete(entry.dedupeKey)
      notices.set(entry.dedupeKey, entry)
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
      if (!acceptedIds(live).has(entry.message.id)) await live.followup(entry.message)
      else if (pendingMessage(live, entry.message.id) && live.status !== EXT.running) {
        // No public wake-existing primitive: replaying followup inserts the same
        // identity twice. Keep pending, expose the gap, and never fake acceptance.
        throw new ExtensionError(EXT.wakeUnsupported, EXT.notifyMember)
      }
      if (!acceptedIds(live).has(entry.message.id)) throw new ExtensionError(EXT.queueUnavailable, EXT.notifyMember)
      await flush()
    }
    if (entry.record && !live.session.snapshotEvents().some((event) => event.type === entry.record.type && event.data?.notificationId === entry.message.id)) {
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

  // Held notices retain their own stable identities and are injected at turn/start.
  // Do not merge them into a new followup identity: a crash between mapping and
  // insertion would otherwise leave no recoverable copy of that followup.
  async function queue(live, message) {
    return exclusive(async () => {
      requireQueue(live)
      await live.followup(message)
      if (!acceptedIds(live).has(message.id)) throw new ExtensionError(EXT.queueUnavailable, EXT.notifyMember)
      await flush()
      return { messageId: message.id }
    })
  }
  // A scheduler or steering input can wake the manager without chat.queue. The
  // host emits turn/start synchronously before its first inbox claim; only this
  // synchronous promotion can join that turn without starting an extra one.
  const offTurn = ctx.on('session/event', (session, event) => {
    const live = current?.live
    if (closed || session.id !== live?.id || event.type !== EXT.turnStart) return
    const ids = acceptedIds(live)
    for (const entry of notices.values()) {
      if (!entry.holding) continue
      if (entry.deliveryId && ids.has(entry.deliveryId)) continue
      if (!ids.has(entry.message.id)) live.inject(entry.message)
      void exclusive(async () => {
        await flush()
        await save({ ...entry, holding: false })
      }).catch(() => { logger?.warn('held notification acceptance could not be persisted') })
    }
  })

  function close() {
    closed = true
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
    manager: Object.freeze({ sessionId: () => chat?.sessionId(), registerSetup, notify, userTexts }),
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
    async resumePending() {
      if ([...notices.values()].some((entry) => entry.state === EXT.pending || entry.wake)) await chat.activate()
    },
    bind(port) { chat = port },
  }
}
