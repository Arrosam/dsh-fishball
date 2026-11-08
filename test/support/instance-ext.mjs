/**
 * In-process child harness for the `fishballInstance` extension points (W0).
 *
 * It boots the child rows of `packages/instance/src/slim/child` exactly in the order the launch
 * overlay uses (`session-tools`, `approvals`, `app`, `inbox`, `admin`) over a fake Cordis
 * context, and attaches a fake main host transport to the child's own bridge. That makes the
 * public surfaces of the design the observation points:
 * - the `fishballInstance` service the app row provides (X1–X16);
 * - the child's tools and their real bridge requests (X16, X19);
 * - the child's HTTP surface (`/api/chat`, `/api/ui-extensions`, UI files);
 * - the inbox items the main host pushes and their ack frames (X9, X19 hand-over line).
 *
 * The harness derives its expectations from `docs/plugins/instance-extension-points.md`, never
 * from the child implementation. DSH host packages resolve from `FBTEST_DSH_RUNTIME`; the
 * default is the version the rest of the body-soul suite uses.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tempPath } from './temp-path.mjs'
import path from 'node:path'
import { linkContractForSourceRun } from './contract-link.mjs'
import { loadConnector, loadInstance } from './body-soul-env.mjs'

linkContractForSourceRun()

const contract = await loadConnector('contract/index.js')
const { CONNECTOR_CONTRACT, ENVELOPE, INBOX_KIND, OPERATIONS, OPERATION, SIDE, decodeEnvelope, encodeEnvelope, makeEnvelope } = contract

export { CONNECTOR_CONTRACT, ENVELOPE, INBOX_KIND, OPERATION, SIDE, contract }

const HOST = Object.freeze({ id: 'host-instance-ext', instanceId: 'host-instance-1' })
const SERVICES = Object.freeze({
  instance: 'fishballInstance',
  chat: 'fishballChat',
  bridge: 'fishballBridge',
  approvals: 'fishballApprovals',
  app: 'fishballApp',
  images: 'fishballImages',
})
export { SERVICES }

/**
 * Every home this suite creates is a throwaway directory under /private/tmp (the user's rule);
 * `FBTEST_INSTANCE_EXT_TMP` moves it, but it must still be an absolute throwaway root.
 */
export const TEMP_ROOT = tempPath(process.env.FBTEST_INSTANCE_EXT_TMP ?? '/private/tmp', { allowRoot: true })

/** One throwaway directory under TEMP_ROOT, removed when the test ends. */
export async function tempDir(t, prefix = 'fbtest-instance-ext-') {
  if (!prefix || path.basename(prefix) !== prefix) throw new Error('invalid temp prefix ' + prefix)
  const root = tempPath(TEMP_ROOT, { allowRoot: true })
  const dir = await mkdtemp(tempPath(path.join(root, prefix), { root }))
  t.after(async () => {
    const target = tempPath(dir, { root })
    if (path.dirname(target) !== root || !path.basename(target).startsWith(prefix)) throw new Error('unexpected temp dir ' + dir)
    await rm(target, { recursive: true, force: true })
  })
  return dir
}

const tempHome = (t) => tempDir(t)

/** The Cordis-like child context: service lookup, provision, effects, events and the host rows. */
function createContext({ home, tools, nativeRuntime, services }) {
  const provided = new Map()
  const listeners = new Map()
  const effects = []
  const logs = []
  const logger = (name) => ({
    info() {},
    debug() {},
    warn(...args) { logs.push({ name, level: 'warn', args }) },
    error(...args) { logs.push({ name, level: 'error', args }) },
  })
  const ctx = {
    get: (name) => (provided.has(name) ? provided.get(name) : services[name]),
    provide(name, value) {
      provided.set(name, value)
      return () => { if (provided.get(name) === value) provided.delete(name) }
    },
    effect(execute) {
      const dispose = execute()
      effects.push(dispose)
      return dispose
    },
    logger,
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(fn)
      return () => listeners.get(event)?.delete(fn)
    },
    emit(event, ...args) { for (const fn of [...(listeners.get(event) ?? [])]) fn(...args) },
    tools,
    nativeRuntime,
    plugin: (plugin, config) => applyPlugin(ctx, plugin, config),
  }
  return { ctx, provided, listeners, effects, logs }
}

/** Cordis's ctx.plugin({apply}) / ctx.plugin(fn): run it once and return its disposer. */
function applyPlugin(ctx, plugin, config) {
  let dispose
  if (typeof plugin === 'function') dispose = plugin(ctx, config)
  else if (plugin && typeof plugin.apply === 'function') dispose = plugin.apply(ctx, config)
  else throw new TypeError('unsupported plugin in the fake context')
  let done = false
  return {
    dispose() {
      if (done) return
      done = true
      if (typeof dispose === 'function') dispose()
    },
  }
}

/** The child's global tool registry: register returns a disposer, a name is unique. */
function createTools(track) {
  const map = new Map()
  const restrictions = []
  return {
    map,
    restrictions,
    restrict(...args) { restrictions.push(args); return () => { restrictions.pop() } },
    schemas() { return [...map.values()].map((definition) => ({ name: definition.name, parameters: definition.parameters })) },
    register(definition) {
      const name = definition?.name
      if (typeof name !== 'string' || name === '') throw new TypeError('a tool needs a name')
      if (map.has(name)) throw new Error('duplicate tool ' + name)
      map.set(name, definition)
      const dispose = () => { if (map.get(name) === definition) map.delete(name) }
      if (track !== undefined) track(dispose)
      return dispose
    },
    definitions() { return [...map.values()] },
    get(name) { return map.get(name) },
    names() { return [...map.keys()] },
  }
}

/** One agent-scoped context; X2 registrations and dispose are observed here. */
function createAgentCtx(agent) {
  /** The effect list of the registration currently applying; Cordis disposes it as one fiber. */
  let current = undefined
  const baseFiber = { disposers: [] }
  const track = (dispose) => {
    ;(current ?? baseFiber).disposers.push(dispose)
    return dispose
  }
  const tools = createTools(track)
  const sections = new Map()
  const contexts = new Map()
  const order = []
  const systemPrompt = {
    section(entry) {
      const name = entry?.name
      if (typeof name !== 'string') throw new TypeError('a prompt section needs a name')
      sections.set(name, entry)
      order.push(name)
      const dispose = () => sections.delete(name)
      return track(dispose)
    },
    context(entry) {
      const name = entry?.name
      if (typeof name !== 'string') throw new TypeError('a prompt context needs a name')
      contexts.set(name, entry)
      order.push(name)
      const dispose = () => contexts.delete(name)
      return track(dispose)
    },
    getSectionOrder(name) { return name },
    suppressRuntimeContext() {},
  }
  const agentCtx = {
    tools,
    systemPrompt,
    effect(execute) {
      const dispose = execute()
      return track(dispose)
    },
    /** Cordis's ctx.plugin: one fiber per registration; its registrations are its effects. */
    plugin(plugin, config) {
      const fiber = { disposers: [] }
      const previous = current
      current = fiber
      let returned
      try {
        if (typeof plugin === 'function') returned = plugin(agentCtx, config)
        else if (plugin && typeof plugin.apply === 'function') returned = plugin.apply(agentCtx, config)
        else throw new TypeError('unsupported plugin in the fake agent context')
      } finally {
        current = previous
      }
      let done = false
      return {
        dispose() {
          if (done) return
          done = true
          if (typeof returned === 'function') { try { returned() } catch { /* disposed by the fiber too */ } }
          for (const dispose of fiber.disposers.splice(0).reverse()) { try { dispose() } catch { /* already gone */ } }
        },
      }
    },
    agent,
    sections,
    contexts,
    order,
    toolsRegistered: tools,
    baseFiber,
  }
  return agentCtx
}

/** The minimum live shape the child reads: id, status, followup, session log and model port. */
function createLiveAgent(sessionId, { events = [], onFollowup, onAppend } = {}) {
  const log = structuredClone(events)
  const live = {
    id: sessionId,
    status: 'idle',
    followups: [],
    followup(message) {
      // Observe/inject at the agent port, before a turn becomes visible in the fixture queue.
      const result = onFollowup?.(message, live)
      live.followups.push(message)
      return result
    },
    cancel() { live.cancelled = true },
    session: {
      id: sessionId,
      appended: log,
      append(type, data) {
        log.push({ seq: log.length + 1, time: 1_700_000_000_000 + log.length + 1, type, data })
        onAppend?.(structuredClone(log))
      },
      snapshotEvents: () => structuredClone(log),
    },
  }
  return live
}

/**
 * The child's fake host: it answers the bridge handshake and every request with a contract-shaped
 * success payload, records what actually left the child, and pushes inbox items and events.
 */
export function createFakeHost({ capabilities } = {}) {
  const served = capabilities ?? Object.keys(OPERATIONS)
  const requests = []
  const handshakes = []
  const inboxAcks = []
  const frames = []
  const raw = []
  const fail = new Set()
  // Public host reply injection: preserve the child's real bridge request/response path.
  const responses = new Map()
  const sessions = []
  let send
  let onClose
  let requestSeq = 0
  const pending = new Map()

  const transport = {
    send(encoded) {
      frames.push(encoded)
      let parsed
      try { parsed = JSON.parse(encoded) } catch { parsed = undefined }
      if (parsed !== undefined) raw.push(parsed)
      // K1's instance.attention is not in the frozen contract yet; the fake host still records
      // it and answers its acceptance so an implementation that sends it does not hang.
      if (parsed?.operation === 'instance.attention' && parsed.type === ENVELOPE.type.request) {
        requests.push({ operation: parsed.operation, payload: parsed.payload, sessionId: parsed.sessionId })
        send?.(JSON.stringify({ ...parsed, type: ENVELOPE.type.response, payload: { accepted: true } }))
        return
      }
      let frame
      try { frame = decodeEnvelope(encoded, { receivingSide: SIDE.main, expectedHostId: HOST.id }) } catch { return }
      if (frame.type === ENVELOPE.type.request && frame.operation === ENVELOPE.handshake) {
        handshakes.push(frame)
        reply(frame, ENVELOPE.type.response, {
          capabilities: served,
          hostInstanceId: HOST.instanceId,
        })
        return
      }
      if (frame.type === ENVELOPE.type.request) {
        requests.push({ operation: frame.operation, payload: frame.payload, sessionId: frame.sessionId })
        const answer = answerFor(frame)
        if (answer === undefined) { replyError(frame, 'operation-failed'); return }
        reply(frame, ENVELOPE.type.response, answer)
        return
      }
      if (frame.type === ENVELOPE.type.response || frame.type === ENVELOPE.type.error) {
        const wait = pending.get(frame.requestId)
        if (wait !== undefined) {
          pending.delete(frame.requestId)
          wait(frame)
        }
      }
    },
    onMessage(fn) { send = fn; return () => { send = undefined } },
    onClose(fn) { onClose = fn; return () => { onClose = undefined } },
    close() { if (onClose !== undefined) onClose() },
  }

  function answerFor(frame) {
    if (fail.has(frame.operation)) return undefined
    if (responses.has(frame.operation)) return responses.get(frame.operation)
    const payload = frame.payload
    switch (frame.operation) {
      case OPERATION.sessionList: return { sessions: sessions.map((session) => ({ ...session })) }
      case OPERATION.sessionStart: return { sessionId: 'session-from-start', managed: false }
      case OPERATION.sessionMessage:
      case OPERATION.sessionRedirect: return { status: 'delivered' }
      case OPERATION.sessionStop: return { stopped: true }
      case OPERATION.sessionRead: return { messages: [], truncated: false }
      case OPERATION.sessionWatch: return { watchId: 'watch-1' }
      case OPERATION.sessionWatches: return { watches: [] }
      case OPERATION.sessionUnwatch: return { ok: true }
      case OPERATION.sessionRelease: return { sessionId: payload.sessionId, managed: false }
      case OPERATION.approvalList: return { approvals: [] }
      case OPERATION.approvalAnswer: return { accepted: true }
      case OPERATION.questionAnswer: return { accepted: true }
      case OPERATION.questionAsk: return { questionId: 'question-1' }
      case OPERATION.questionAnswerOwn: return { accepted: true }
      case OPERATION.promptList: return { prompts: [] }
      case OPERATION.promptAnswer: return { promptId: payload.promptId, decision: payload.decision, managed: true }
      case OPERATION.grantList: return { grants: [] }
      case OPERATION.grantRevoke: return { grantId: payload.grantId, revoked: true }
      case OPERATION.attachmentPut: return { hostRef: 'hostref-' + payload.transferId, expiresAt: 1_800_000_000_000 }
      case OPERATION.attachmentRead: return { attachmentId: payload.attachmentId, mediaType: 'image/png', total: 1, sha256: '0'.repeat(64), chunks: ['AA=='] }
      default: return undefined
    }
  }

  function reply(request, type, payload) {
    const envelope = makeEnvelope(HOST.id, request.sessionId, request.requestId, type, request.operation, payload)
    send?.(encodeEnvelope(envelope, HOST.id))
  }

  function replyError(request, code) {
    const envelope = makeEnvelope(HOST.id, request.sessionId, request.requestId, ENVELOPE.type.error, request.operation, { code })
    send?.(encodeEnvelope(envelope, HOST.id))
  }

  /** Push one inbox item to the child; resolves with the child's answer frame. */
  function inbox(item) {
    const requestId = 'host-inbox-' + (++requestSeq)
    const payload = {
      messageId: item.messageId ?? 'msg-' + requestSeq,
      kind: item.kind,
      sourceSessionId: item.sourceSessionId ?? 'session-source',
      text: item.text ?? '',
      images: item.images ?? [],
      dedupeKey: item.dedupeKey ?? 'dedupe-' + requestSeq,
      at: item.at ?? Date.now(),
      ...(item.expiresAt === undefined ? {} : { expiresAt: item.expiresAt }),
      ...(item.title === undefined ? {} : { title: item.title }),
      ...(item.watchId === undefined ? {} : { watchId: item.watchId }),
    }
    // The contract's inbox.push is exact: the extra marker fields are part of the item text,
    // not the frame, so they are removed before encoding.
    for (const extra of ['expiresAt', 'title', 'watchId']) delete payload[extra]
    const encoded = encodeEnvelope(makeEnvelope(HOST.id, null, requestId, ENVELOPE.type.request, OPERATION.inboxPush, payload), HOST.id)
    return new Promise((resolve) => {
      pending.set(requestId, (frame) => { inboxAcks.push({ item: payload, frame }); resolve(frame) })
      send?.(encoded)
    })
  }

  /** Push a main-to-child event (approval.request, approval.settled, ...). */
  function event(operation, payload, sessionId = null) {
    const envelope = makeEnvelope(HOST.id, sessionId, 'host-event-' + (++requestSeq), ENVELOPE.type.event, operation, payload)
    send?.(encodeEnvelope(envelope, HOST.id))
  }

  /** An unknown operation is recorded, not answered; the child's own validator decides its fate. */
  function rawAttention(operation, payload) {
    const requestId = 'host-raw-' + (++requestSeq)
    const frame = { version: ENVELOPE.version, hostId: HOST.id, sessionId: null, requestId, type: ENVELOPE.type.request, operation, payload }
    requests.push({ operation, payload, sessionId: null })
    send?.(JSON.stringify(frame))
    return requestId
  }

  return { transport, requests, handshakes, inboxAcks, frames, raw, fail, responses, sessions, inbox, event, rawAttention, served }
}

/**
 * Boot the child rows over a fake context. `activate: true` reads `/api/chat`, which activates
 * Fishball's manager Session (and runs X2's create setup) before a case starts.
 * `sessionLogs` optionally retains fake DSH session events across child-row restarts;
 * `onFollowup` observes/injects at the agent queue port, before the turn is recorded.
 * `attachments` opts into the host attachment peripheral; other callers keep no store.
 */
export async function bootChild(t, { activate = false, attachments = undefined, configure, home: existingHome, watchdogEnabled = true, extraBundles = [], sessionLogs = new Map(), onFollowup } = {}) {
  const home = tempPath(existingHome ?? await tempHome(t))
  const profileDir = tempPath(path.join(home, 'profiles', 'fishball'), { root: home })
  await mkdir(profileDir, { recursive: true })
  const profileFile = tempPath(path.join(profileDir, 'package.json'), { root: home })
  const profileBundles = ['@deepseek-ai/dsh-base', ...(watchdogEnabled ? ['fishball-watchdog'] : []), ...extraBundles]
  await writeFile(tempPath(profileFile, { root: home }), JSON.stringify({ name: 'fishball', private: true, dsh: { profile: { bundles: profileBundles } } }, null, 2) + '\n')
  const tools = createTools()
  const agents = []
  const agentsById = new Map()
  const bundles = [
    { name: '@deepseek-ai/dsh-base', version: '0.2.2', enabled: true, installed: true, removable: false },
    ...['fishball-fold-notify', 'fishball-board', 'fishball-watchdog'].map((name) => ({ name, version: '0.1.0-alpha.0', enabled: true, installed: true, removable: true })),
  ]
  const pluginManager = {
    async listBundles() { return bundles.map((bundle) => ({ ...bundle })) },
    async installBundle(spec) {
      const name = typeof spec === 'string' ? spec : spec?.name
      if (bundles.some((bundle) => bundle.name === name)) return { application: 'failed', error: { code: 'already-installed' } }
      bundles.push({ name, version: '0.0.1', enabled: true, installed: true, removable: true })
      return { application: 'applied', bundle: name }
    },
    async removeBundle(name) {
      const index = bundles.findIndex((bundle) => bundle.name === name)
      if (index < 0) return { application: 'failed', error: { code: 'unknown-plugin' } }
      bundles.splice(index, 1)
      return { application: 'applied' }
    },
    async setBundleEnabled(name, enabled) {
      const bundle = bundles.find((candidate) => candidate.name === name)
      if (bundle === undefined) return { application: 'failed', error: { code: 'unknown-plugin' } }
      if (bundle.canFail === true) return { application: 'failed', error: { code: 'operation-failed' } }
      bundle.enabled = enabled
      // U7: DSH's own enable state IS the child profile's dsh.profile.bundles (no gateOn file).
      const manifest = JSON.parse(await readFile(profileFile, 'utf8'))
      const listed = new Set(manifest.dsh?.profile?.bundles ?? [])
      if (enabled) listed.add(name)
      else listed.delete(name)
      manifest.dsh = { ...(manifest.dsh ?? {}), profile: { ...(manifest.dsh?.profile ?? {}), bundles: [...listed] } }
      await writeFile(tempPath(profileFile, { root: home }), JSON.stringify(manifest, null, 2) + '\n')
      return { application: 'applied' }
    },
  }
  const settings = {
    writable: true,
    describe() { return [] },
    async mutate() { return { applied: true } },
  }
  const services = {
    profileContext: { home, name: 'fishball', dir: profileDir },
    pluginManager,
    settings,
    sessionQuery: {
      async readSession(id) {
        const agent = agentsById.get(id)
        return { events: structuredClone(agent?.session.snapshotEvents?.() ?? sessionLogs.get(id) ?? []) }
      },
    },
    agentDefaultModel: { currentSelection: () => undefined },
    sandboxPolicy: { resolve: () => ({ mode: 'read-only' }) },
    llm: { listProviders: () => [], listModels: () => [], resolveModelInfo: () => ({}), resolveCallConfig: (value) => value },
    // The image service is optional at the app row; without a store an upload is refused.
    attachments,
  }
  // A caller may retain this map across child-row boots, just as DSH retains session logs.
  // It is fixture-owned persistence only; no extension state is reconstructed by the harness.
  function activateAgent(options, sessionId) {
    const live = createLiveAgent(sessionId, {
      events: sessionLogs.get(sessionId) ?? [],
      onAppend: (events) => sessionLogs.set(sessionId, events),
      onFollowup,
    })
    const agentCtx = createAgentCtx(live)
    if (typeof options.setup === 'function') options.setup(agentCtx, live)
    agents.push({ live, agentCtx, options })
    agentsById.set(live.id, live)
    return { agent: live }
  }
  const agentsService = {
    async create(options) { return activateAgent(options, options.sessionId) },
    async resume(options) { return activateAgent(options, options.resumeSessionId) },
    get: (id) => agentsById.get(id),
  }
  services.agents = agentsService
  const nativeRuntime = {
    hostId: HOST.id,
    control: undefined,
    admin: undefined,
    onControlTransport(callback) { nativeRuntime.control = callback; return () => { if (nativeRuntime.control === callback) nativeRuntime.control = undefined } },
    onAdminTransport(callback) { nativeRuntime.admin = callback; return () => { if (nativeRuntime.admin === callback) nativeRuntime.admin = undefined } },
  }
  const context = createContext({ home, tools, nativeRuntime, services })
  const { ctx } = context
  // The admin row reads ctx.settings / ctx.pluginManager / ctx.llm as services, not through get().
  ctx.settings = settings
  ctx.pluginManager = pluginManager
  ctx.llm = services.llm
  // AttachmentStore is also the documented direct Cordis property (`ctx.attachments`).
  ctx.attachments = attachments
  const rowDisposers = []
  const rows = {}
  async function applyRow(name, modulePath) {
    const row = await loadInstance(modulePath)
    rows[name] = row
    const dispose = await row.apply(ctx)
    if (typeof dispose === 'function') rowDisposers.push(dispose)
    return row
  }

  // The overlay's order: the session tools provide fishballBridge, approvals consumes it, the
  // app row provides the chat and fishballApp, then the inbox and admin rows.
  await applyRow('sessionTools', 'src/slim/child/session-tools.js')
  await applyRow('approvals', 'src/slim/child/approvals.js')
  await applyRow('app', 'src/slim/child/app.js')
  if (process.env.FBTEST_DEBUG_HARNESS) console.error('chat service before inbox:', Object.keys(ctx.get(SERVICES.chat) ?? {}), 'provided:', [...context.provided.keys()])
  await applyRow('inbox', 'src/slim/child/inbox.js')
  const admin = await loadInstance('src/slim/child/admin.js')
  rows.admin = admin
  if (typeof nativeRuntime.onAdminTransport === 'function') {
    const adminDispose = admin.apply(ctx)
    if (typeof adminDispose === 'function') rowDisposers.push(adminDispose)
  }

  const host = createFakeHost()
  if (nativeRuntime.control !== undefined) nativeRuntime.control(host.transport, { hostId: HOST.id })
  const bridge = ctx.get(SERVICES.bridge)
  const deadline = Date.now() + 5000
  while (!bridge?.status?.ready && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10))

  // The admin row's endpoint attaches when the host's admin transport arrives.
  let adminTransport
  const adminReplies = []
  const adminPending = new Map()
  function adminRequest(operation, payload) {
    const codec = adminCodec
    const frame = codec.request(operation, payload)
    const encoded = codec.encode(frame)
    return new Promise((resolve) => {
      adminPending.set(frame.id, resolve)
      adminTransport.message(encoded)
    })
  }
  let adminCodec
  if (nativeRuntime.admin !== undefined) {
    adminCodec = admin.createAdminCodec()
    adminTransport = {
      send: (encoded) => {
        const frame = adminCodec.decode(encoded)
        adminReplies.push(frame)
        const wait = adminPending.get(frame.id)
        if (wait !== undefined) { adminPending.delete(frame.id); wait(frame) }
      },
      onMessage(fn) { adminTransport.message = fn; return () => { adminTransport.message = undefined } },
      onClose(fn) { adminTransport.closed = fn; return () => { adminTransport.closed = undefined } },
      close() { adminTransport.closed?.() },
    }
    nativeRuntime.admin(adminTransport)
  }

  const chat = ctx.get(SERVICES.chat)
  if (activate) {
    const app = ctx.get(SERVICES.app)
    assert.ok(app, 'fishballApp is not provided by the child app row')
    const page = await fetch(app.origin + '/api/chat', { headers: { authorization: 'Bearer ' + app.bearer } })
    assert.equal(page.status, 200, 'the manager chat page failed to activate: ' + (await page.text()))
  }

  const harness = {
    ctx,
    home,
    tools,
    agents,
    agentsById,
    sessionLogs,
    host,
    logs: context.logs,
    context,
    rows,
    bridge,
    chat,
    get instance() { return ctx.get(SERVICES.instance) },
    get app() { return ctx.get(SERVICES.app) },
    get approvals() { return ctx.get(SERVICES.approvals) },
    requireInstance() {
      const service = ctx.get(SERVICES.instance)
      assert.ok(service, 'fishballInstance is not provided by the child app row (X0-C)')
      return service
    },
    /** Run one registered child tool. */
    async tool(name, args) {
      const definition = tools.get(name)
      assert.ok(definition, 'the child did not register the tool ' + name)
      return definition.execute(args)
    },
    /** One admin wire request, as the settings page sends it. */
    async admin(operation, payload) {
      assert.ok(adminTransport, 'the admin row did not attach an admin transport')
      const frame = adminCodec.request(operation, payload)
      return new Promise((resolve) => {
        adminPending.set(frame.id, resolve)
        adminTransport.message(adminCodec.encode(frame))
      })
    },
    bundles,
    pluginManager,
    profileDir,
    profileFile,
    async profileBundles() {
      const manifest = JSON.parse(await readFile(profileFile, 'utf8'))
      return manifest.dsh?.profile?.bundles ?? []
    },
    async setBundleEnabled(name, enabled) {
      return pluginManager.setBundleEnabled(name, enabled)
    },
    nativeRuntime,
    adminReplies,
    /** Replace the main host transport, as a child reconnect does. */
    async reconnect({ capabilities } = {}) {
      harness.host.transport.close()
      const next = createFakeHost({ capabilities })
      nativeRuntime.control(next.transport, { hostId: HOST.id })
      const untilReady = Date.now() + 5000
      while (!bridge?.status?.ready && Date.now() < untilReady) await new Promise((resolve) => setTimeout(resolve, 10))
      assert.equal(bridge?.status?.ready, true, 'the bridge did not re-handshake')
      harness.host = next
      return next
    },
    /** The agent-scoped contexts X2 built, in creation order. */
    agentCtxs() { return agents.map((entry) => ({ agent: entry.live, ctx: entry.agentCtx })) },
    /** The live agent of the manager Session (the chat's first created Session). */
    manager() {
      const manager = agents[0]?.live
      assert.ok(manager, 'the manager Session was not created (activate the chat first)')
      return manager
    },
    async http(pathname, { method = 'GET', body, bearer = true, headers = {} } = {}) {
      const app = ctx.get(SERVICES.app)
      assert.ok(app, 'fishballApp is not provided by the child app row')
      const answer = await fetch(app.origin + pathname, {
        method,
        headers: {
          ...(bearer ? { authorization: 'Bearer ' + app.bearer } : {}),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...headers,
        },
        ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
      })
      return answer
    },
    /** The manager's next queued turn, as the fake agent received it. */
    lastFollowup() {
      return agents[0]?.live.followups.at(-1)
    },
    async close() {
      if (harness.closed === true) return
      harness.closed = true
      for (const dispose of rowDisposers.reverse()) { try { await dispose() } catch { /* already gone */ } }
      for (const dispose of context.effects.reverse()) { try { await dispose() } catch { /* already gone */ } }
    },
  }
  if (typeof configure === 'function') await configure(harness)
  t.after(() => harness.close())
  return harness
}

/**
 * The text of a user/assistant message's content, joined. The bridge and chat pass DSH message
 * objects, whose content is a block list; a notice turn's source names the plugin.
 */
export function messageText(message) {
  if (typeof message === 'string') return message
  const content = message?.content ?? []
  if (typeof content === 'string') return content
  return content.map((block) => (block?.type === 'text' ? block.text : '')).join('')
}

/** The source of one queued turn, as the child chat sets it. */
export function messageSource(message) {
  return message?.source
}

/** Files under `root` whose text contains `needle`; used only to locate a documented store. */
export async function filesContaining(root, needle) {
  const { readdir, readFile, stat } = await import('node:fs/promises')
  const found = []
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) { await walk(file); continue }
      if (!entry.isFile()) continue
      try {
        const info = await stat(file)
        if (info.size > 2 * 1024 * 1024) continue
        const text = await readFile(file, 'utf8')
        if (text.includes(needle)) found.push(file)
      } catch { /* unreadable is not a match */ }
    }
  }
  await walk(root)
  return found
}

/** Wait until `check` returns a truthy value, or fail with `label` after the budget. */
export async function until(check, label, { timeoutMs = 5000, intervalMs = 10 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await check()
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error('timed out waiting for ' + label)
}
