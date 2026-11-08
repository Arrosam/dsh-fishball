/** Local X0-C service. Transport adapters own MCP names, authentication and routing. */
import path from 'node:path'
import { appendFile, open, readFile, rename, writeFile } from 'node:fs/promises'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { appendPluginRecord } from '@deepseek-ai/dsh-session'

export const EXT_LIMITS = Object.freeze({ notifyKeys: 10_000, recordTextChars: 8000 })
const EXT = Object.freeze({
  service: 'fishballInstance', file: 'notify-keys.jsonl', mode: 0o600,
  pending: 'pending', accepted: 'accepted', queued: 'queued', held: 'held', duplicate: 'duplicate',
  setup: 'manager.registerSetup', notImplemented: 'not-implemented',
  userMessage: 'user/message', inboxSplice: 'agent/inbox/spliced', turnStart: 'turn/start',
  separator: '\n\n',
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
 * These are local domain ports, NOT MCP callables or a push protocol. X0-W/K1
 * supplies scoped control; FB-PUSH routes before invoking intake and acknowledges
 * only its fulfilled durable receipt. K1 freezes wire schemas after MCP-S3.
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
  async function flush() { await ctx.get('sessionPersistence')?.flush() }
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
  function apply(registration, agentCtx, live) {
    let completion = Promise.resolve()
    let failed = false
    const fiber = agentCtx.plugin({ apply(scope) {
      try {
        const result = registration.fn(scope, live)
        completion = Promise.resolve(result).catch(() => { failed = true; warn(registration.pluginId) })
        return result instanceof Promise ? completion : result
      } catch {
        failed = true
        warn(registration.pluginId)
      }
    } })
    registration.fibers.add(fiber)
    // Cordis fibers are thenable; the local fixture is not. Await callback work as
    // well, rather than mistaking fiber creation for async setup completion.
    return Promise.resolve(fiber).then(() => completion).catch(() => { failed = true; warn(registration.pluginId) }).finally(async () => {
      if (failed || registration.disposed || closed) await fiber.dispose()
    })
  }
  function registerSetup(pluginId, fn) {
    const registration = { pluginId, fn, fibers: new Set(), disposed: false }
    registrations.add(registration)
    if (current && !current.settingUp) void apply(registration, current.ctx, current.live)
    return () => {
      if (registration.disposed) return
      registration.disposed = true
      registrations.delete(registration)
      for (const fiber of registration.fibers) fiber.dispose()
      registration.fibers.clear()
    }
  }
  async function setup(agentCtx, live) {
    const state = { ctx: agentCtx, live, settingUp: true }
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
      return { text: clipped, at: event.at }
    })
  }
  async function notify(input) {
    // Activate outside the store lock: setup callbacks may themselves notify.
    const live = current?.settingUp ? current.live : await chat.activate()
    return exclusive(async () => {
      let entry = notices.get(input.dedupeKey)
      if (dirty) await compact()
      if (entry?.state === EXT.accepted) return { status: EXT.duplicate }
      if (!entry) {
        const message = createUserMessage({ content: [{ type: 'text', text: input.text }], source: { kind: 'fishball-notice', form: 'plugin', pluginId: input.pluginId } })
        entry = { ...input, message, state: EXT.pending }
        await save(entry)
      }
      if (entry.wake) {
        if (!acceptedIds(live).has(entry.message.id)) await live.followup(entry.message)
        await flush()
      }
      if (entry.record && !live.session.snapshotEvents().some((event) => event.type === entry.record.type && event.data?.notificationId === entry.message.id)) {
        appendPluginRecord(live.session, entry.record.type, { ...entry.record.data, notificationId: entry.message.id })
        await flush()
      }
      await save({ ...entry, state: EXT.accepted, holding: !entry.wake })
      return { status: entry.wake ? EXT.queued : EXT.held }
    })
  }

  // Held notices stay in our durable store until a waking message owns them. The
  // mapping is reserved before queueing, so receipt loss can be reconciled by ID.
  async function queue(live, message) {
    return exclusive(async () => {
      const ids = acceptedIds(live)
      const held = [...notices.values()].filter((entry) => entry.holding)
      const include = []
      for (const entry of held) {
        if (ids.has(entry.message.id) || (entry.deliveryId && ids.has(entry.deliveryId))) {
          await flush()
          await save({ ...entry, holding: false })
        } else include.push(entry)
      }
      const content = include.map((entry) => entry.text).join(EXT.separator)
      if (content) message = { ...message, content: [...message.content, { type: 'text', text: content }] }
      for (const entry of include) await save({ ...entry, deliveryId: message.id })
      await live.followup(message)
      await flush()
      for (const entry of include) await save({ ...entry, holding: false, deliveryId: message.id })
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
    bridge: stub('bridge'),
    inbox: stubs('inbox', ['claim', 'release', 'setBatcher'], ['release']),
    attention: stubs('attention', ['set']),
    sideAgents: stubs('sideAgents', ['open', 'runTurn', 'cancel'], ['open', 'runTurn']),
    approvals: stubs('approvals', ['claim', 'card', 'onSettled', 'answerApproval'], ['answerApproval']),
    supervision: stubs('supervision', ['register', 'onManagedChange', 'endingReason']),
    sessionStarts: stubs('sessionStarts', ['register']),
  })
  return { service, start, setup, queue, close, bind(port) { chat = port } }
}
