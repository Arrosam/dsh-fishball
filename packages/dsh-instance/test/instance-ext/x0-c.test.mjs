/**
 * W0 / X0-C — local `fishballInstance`, manager/chat and durable intake seams.
 * Pinned requirements 15d6f1f214144db3575f9bc0ba15238b1450c2a7 §5.4/§12.5, U18/U20/U21.
 * Typed W1 control/intake ports await MCP-S3/K1 freeze; no server or push implementation here.
 *
 * Observation points: the service the child app row provides, the manager agent's own
 * tool/prompt registrations, `GET /api/chat` over the child's HTTP surface, and the turns the
 * manager agent is queued. No child module is imported for the expectations.
 *
 * Techniques: EP (equivalence partitions), DT (Decision Table), ST (State
 * transitions), BVA (boundary values), UC (actor-goal flows at the fixture boundary).
 * UC contracts: docs/test-design/instance-ext-w0-core-use-cases.md. Every case names its X point.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { bootChild, messageSource, messageText } from '../../../../test/support/instance-ext.mjs'

// Any plugin ids: registerSetup, notify and bridge take the caller's id as given (X2, X10, X12).
const MANAGER = 'fbtest-plugin'
const U18 = Object.freeze({
  notifyFile: 'notify-keys.jsonl',
  notifyKeys: 10_000,
  retentionSeedKeys: 9_998,
  retentionKeyPrefix: 'cap-key-',
  event: Object.freeze({ splice: 'agent/inbox/spliced', user: 'user/message', turnStart: 'turn/start', turnEnd: 'turn/end', stepStart: 'step/start', stepEnd: 'step/end' }),
  plugin: 'fbtest-other-plugin',
  notice: 'a plugin notice',
  queueFailure: 'injected agent queue rejection before acceptance',
  pendingKey: 'pending-notice-must-survive-accepted-history-trim',
  send: Object.freeze({ session_id: 'session-direct', message: 'unchanged message 😀' }),
  imageSend: Object.freeze({ sessionId: 'ses-target', message: '  unchanged\nmessage  ' }),
  attachmentMethods: Object.freeze(['readImage', 'saveImage', 'saveFile', 'readFileStream']),
  attachmentUseFailure: 'empty image send must not use attachment storage',
  batch: Object.freeze({ maxItems: 20, maxBytes: 65_536, separator: '\n\n', imageMax: 20, imagePixels: 4_194_304, imageBytes: 4_194_304 }),
})

/** Boot with the manager Session activated (the app row's create setup has run). */
async function live(t) {
  const h = await bootChild(t, { activate: true })
  return { h, service: h.requireInstance() }
}

/** Inject only at the supplied agent boundary; no fake notification/dedupe implementation. */
async function pendingNotice(t, dedupeKey, text = U18.notice, { activate = true } = {}) {
  const attempts = []
  let persistedAtQueue
  let queueLengthAtRejection
  let rejectPending = true
  const h = await bootChild(t, { activate, onFollowup(message, agent) {
    attempts.push(structuredClone(message))
    if (rejectPending && message.id === attempts[0].id) {
      persistedAtQueue = readFileSync(path.join(h.home, U18.notifyFile), 'utf8')
      queueLengthAtRejection = agent.followups.length
      throw new Error(U18.queueFailure)
    }
  } })
  // Error envelope is not specified; durable retry state and no accepted turn are specified.
  await h.requireInstance().manager.notify({ pluginId: U18.plugin, dedupeKey, text, wake: true }).catch(() => {})
  assert.equal(attempts.length, 1, 'rejection injected at the actual followup boundary')
  assert.equal(queueLengthAtRejection, 0)
  assert.equal(h.manager().followups.length, 0, 'the rejected attempt was never accepted by the fixture queue')
  const reservedId = attempts[0].id
  assert.equal(typeof reservedId, 'string')
  assert.ok(reservedId.length > 0, 'notification reserves a nonempty message identity')
  assert.equal(typeof persistedAtQueue, 'string', 'notify-keys.jsonl exists before the queue attempt')
  assert.ok(persistedAtQueue.includes(JSON.stringify(dedupeKey)), 'key was persisted before queue attempt')
  assert.ok(persistedAtQueue.includes(JSON.stringify(reservedId)), 'stable identity was persisted with the pending work')
  for (const line of persistedAtQueue.trimEnd().split('\n')) assert.doesNotThrow(() => JSON.parse(line))
  return { h, attempts, reservedId, allowRetry: () => { rejectPending = false } }
}

/** Append one manager-session event, as DSH's session log would hold it. */
function append(h, type, data) {
  h.manager().session.append(type, data)
}

// V3 drops the side-agent, supervision, approval-claim and start-rule members (X13–X16) and the
// inbox claim/batcher stubs (X9) with the plugins that consumed them (REMOVE-WD, design §1.0).
describe('X0-C service surface', () => {
  it('XC-EP-V-01 Samuel continues work with Fishball plugin updates — W0: the app row provides fishballInstance apiVersion 1 with its members', async (t) => {
    const h = await bootChild(t)
    const service = h.requireInstance()
    assert.equal(service.apiVersion, 1)
    for (const member of ['manager', 'chat', 'inbox', 'ui', 'attention', 'bridge']) {
      assert.ok(service[member] !== undefined, 'fishballInstance.' + member + ' is missing')
    }
  })

  it('XC-EP-V-02 Samuel continues work with Fishball plugin updates — W0: a registration returns dispose, and a second dispose is a no-op', async (t) => {
    const { h, service } = await live(t)
    const dispose = service.manager.registerSetup(MANAGER, () => {})
    assert.equal(typeof dispose, 'function', 'X2 registerSetup must return dispose')
    dispose()
    dispose()
    assert.equal(h.manager().followups.length, 0, 'a dispose must not queue a turn')
  })


  it('XC-EP-01 Samuel continues work with Fishball plugin updates — W0: fishballChat stays internal: the plugin-facing service is fishballInstance', async (t) => {
    const h = await bootChild(t)
    assert.equal(h.ctx.get('fishballChat') !== undefined, true, 'the app row keeps its internal port')
    assert.equal(typeof h.requireInstance, 'function')
    assert.equal(h.requireInstance().apiVersion, 1)
    assert.equal(h.requireInstance().chat !== undefined, true, 'the chat point is a member, not the internal port')
    assert.equal(h.requireInstance().chat === h.ctx.get('fishballChat'), false, 'the service must not expose fishballChat itself')
  })

  it('XC-EP-02 Samuel continues work with Fishball plugin updates — W0: X1 reports the manager Session id, not another agent id', async (t) => {
    const { h, service } = await live(t)
    const managerId = h.manager().id
    assert.equal(service.manager.sessionId(), managerId)
    assert.equal(typeof service.manager.sessionId(), 'string')
    assert.notEqual(service.manager.sessionId(), 'session-another-agent')
  })
})

describe('X0-C U18 scoped bridge', () => {
  it('XC-EP-STUB-16 Samuel uses only the scoped connector operations — X12 EP/DT: in-list read delegates; out-of-list list is forbidden locally without a new handshake', async (t) => {
    const scope = Object.freeze({
      allowed: 'session.read',
      denied: 'session.list',
      forbidden: 'forbidden',
      read: Object.freeze({ sessionId: 'scope-session', maxMessages: 1, maxBytes: 1 }),
      list: Object.freeze({ limit: 1 }),
      reply: Object.freeze({ messages: [], truncated: false }),
    })
    const h = await bootChild(t)
    const service = h.requireInstance()
    const handshakes = h.host.handshakes.length
    const client = service.bridge(U18.plugin, [scope.allowed])
    // X12/U9 and X0-W (§1.1, §5.1, §6): membership, not payload validity, decides
    // these EP/DT rows. Both requests are valid per connector contract §4.1.
    const beforeAllowed = h.host.requests.length
    assert.deepEqual(await client.request(scope.allowed, scope.read), scope.reply)
    assert.deepEqual(h.host.requests.slice(beforeAllowed).map(({ operation, payload }) => ({ operation, payload })), [
      { operation: scope.allowed, payload: scope.read },
    ])
    const beforeDenied = h.host.requests.length
    const framesBeforeDenied = h.host.frames.length
    // U9 fixes the refusal code, not a sync/async error envelope or error class.
    const code = await Promise.resolve().then(() => client.request(scope.denied, scope.list)).then(
      (value) => value?.code ?? value,
      (error) => error?.code ?? error,
    )
    assert.equal(code, scope.forbidden)
    assert.equal(h.host.requests.length, beforeDenied, 'out-of-list refusal never reaches the connector')
    assert.equal(h.host.frames.length, framesBeforeDenied, 'no request leaves the child on denial')
    assert.equal(h.host.handshakes.length, handshakes, 'the scoped client reuses the instance handshake')
  })
})

describe('X0-C X2 manager.registerSetup', () => {
  it('XC-UC-01-M Samuel continues work with Fishball plugin updates — W0: create: a registration made before the live Session is applied after the persona, in order', async (t) => {
    const h = await bootChild(t, { activate: false })
    const service = h.requireInstance()
    service.manager.registerSetup(MANAGER, (agentCtx) => {
      agentCtx.tools.register({ name: 'fold_notice', description: 'fold' })
      agentCtx.systemPrompt.section({ name: 'fold-section', order: 10, text: 'fold text' })
    })
    service.manager.registerSetup('fishball-board', (agentCtx) => {
      agentCtx.systemPrompt.section({ name: 'board-section', order: 20, text: 'board text' })
    })
    await h.http('/api/chat')
    const { ctx } = h.agentCtxs()[0]
    assert.ok(ctx.tools.names().includes('fold_notice'), 'the tool registered on create')
    assert.ok(ctx.sections.has('fold-section'), 'the section registered on create')
    assert.deepEqual(ctx.order.slice(-2), ['fold-section', 'board-section'], 'both registrations run after the persona in registration order')
  })

  it('XC-UC-01-A1 Samuel continues work with Fishball plugin updates — W0: resume: the same registration is applied again on agents.resume', async (t) => {
    const h = await bootChild(t, { activate: false })
    const service = h.requireInstance()
    service.manager.registerSetup(MANAGER, (agentCtx) => {
      agentCtx.tools.register({ name: 'fold_resume', description: 'fold' })
    })
    await h.http('/api/chat')
    const managerId = h.manager().id
    h.agentsById.delete(managerId)
    await h.http('/api/chat')
    assert.equal(h.agentCtxs().length, 2, 'the chat resumed through agents.resume')
    assert.ok(h.agentCtxs()[1].ctx.tools.names().includes('fold_resume'), 'the registration ran on resume')
  })

  it('XC-UC-01-A2 Samuel continues work with Fishball plugin updates — W0: live: a registration made while the agent is live is applied at once', async (t) => {
    const { h, service } = await live(t)
    const { ctx } = h.agentCtxs()[0]
    assert.equal(ctx.tools.names().includes('fold_late'), false, 'precondition: not registered')
    service.manager.registerSetup(MANAGER, (agentCtx) => {
      agentCtx.tools.register({ name: 'fold_late', description: 'late' })
      agentCtx.systemPrompt.section({ name: 'fold-late-section', order: 20, text: 'late' })
    })
    assert.ok(ctx.tools.names().includes('fold_late'), 'SP-X1: the live apply takes effect at once')
    assert.ok(ctx.sections.has('fold-late-section'))
  })

  it('XC-UC-01-E1 Samuel continues work with Fishball plugin updates — W0: a throwing registration is logged and skipped; a later one still applies', async (t) => {
    const h = await bootChild(t, { activate: false })
    const service = h.requireInstance()
    const warningCount = () => h.logs.filter((entry) => entry.level === 'warn').length
    // Boot warnings are outside the registered callback's log-once contract.
    const warningsBeforeSetup = warningCount()
    service.manager.registerSetup(MANAGER, () => { throw new Error('setup boom') })
    service.manager.registerSetup('fishball-board', (agentCtx) => {
      agentCtx.tools.register({ name: 'board_after_throw', description: 'board' })
    })
    await h.http('/api/chat')
    assert.ok(h.agentCtxs()[0].ctx.tools.names().includes('board_after_throw'))
    assert.equal(warningCount() - warningsBeforeSetup, 1, 'the callback failure is logged once')
    h.agentsById.delete(h.manager().id)
    await h.http('/api/chat')
    assert.equal(warningCount() - warningsBeforeSetup, 1, 'the same plugin/point failure is not logged again on resume')
    assert.ok(h.agentCtxs()[1].ctx.tools.names().includes('board_after_throw'), 'the healthy registration still applies on resume')
  })

  it('XC-ST-01 Samuel continues work with Fishball plugin updates — W0: registered → applied → disposed → registered again', async (t) => {
    const { h, service } = await live(t)
    const dispose = service.manager.registerSetup(MANAGER, (agentCtx) => {
      agentCtx.tools.register({ name: 'fold_toggle', description: 'toggle' })
      agentCtx.systemPrompt.section({ name: 'fold-toggle-section', order: 30, text: 'toggle' })
    })
    const { ctx } = h.agentCtxs()[0]
    assert.ok(ctx.tools.names().includes('fold_toggle'))
    dispose()
    assert.equal(ctx.tools.names().includes('fold_toggle'), false, 'dispose removes the tool')
    assert.equal(ctx.sections.has('fold-toggle-section'), false, 'dispose removes the section')
    const again = service.manager.registerSetup(MANAGER, (agentCtx) => {
      agentCtx.tools.register({ name: 'fold_again', description: 'again' })
    })
    assert.ok(ctx.tools.names().includes('fold_again'))
    again()
  })

  it('XC-UC-01-A3 Samuel continues work with Fishball plugin updates — W0: registration is immediately visible on a fixture manager marked running', async (t) => {
    const { h, service } = await live(t)
    const { ctx } = h.agentCtxs()[0]
    h.manager().status = 'running'
    service.manager.registerSetup(MANAGER, (agentCtx) => {
      agentCtx.tools.register({ name: 'fold_midturn', description: 'mid-turn' })
    })
    assert.ok(ctx.tools.names().includes('fold_midturn'), 'tool is installed in the running fixture scope; real next-request proof belongs to X-E2E')
  })
})

describe('X0-C X10 manager.notify', () => {
  const notify = (service, overrides = {}) => service.manager.notify({
    pluginId: U18.plugin,
    dedupeKey: 'notice-1',
    text: U18.notice,
    wake: true,
    ...overrides,
  })
  const notifyStatus = async (service, overrides) => {
    const result = await notify(service, overrides)
    return result.status ?? result
  }

  it('XC-UC-02-M Samuel continues work with Fishball plugin updates — W0: wake:true is one notice turn with the plugin source', async (t) => {
    const { h, service } = await live(t)
    const result = await notify(service)
    assert.equal(result.status ?? result, 'queued')
    const queued = h.lastFollowup()
    assert.ok(queued, 'one turn was queued')
    assert.match(messageText(queued), /a plugin notice/)
    assert.deepEqual(messageSource(queued), { kind: 'fishball-notice', form: 'plugin', pluginId: U18.plugin })
    assert.equal(h.manager().followups.length, 1)
  })

  it('XC-UC-02-A1 Samuel continues work with Fishball plugin updates — W0: wake:false is held and joins the next turn', async (t) => {
    const flow = Object.freeze({
      notice: 'held notice XC-UC-02-A1', dedupeKey: 'quiet-busy-XC-UC-02-A1',
      nextUser: 'next user turn XC-UC-02-A1', laterUser: 'later user turn XC-UC-02-A1',
      running: 'running', idle: 'idle', held: 'held', none: 0, once: 1,
      chat: '/api/chat', post: 'POST', sessionEvent: 'session/event',
      turnStart: 'turn/start', stepStart: 'step/start', stepEnd: 'step/end',
      splice: 'agent/inbox/spliced', nextStep: 'next-step', userMessage: 'user/message', surfaceAppend: 'append',
    })
    // One UC/A1, with secondary EP/DT: fresh + quiet + busy => hold, no wake.
    // BVA/ST: zero admissions while held -> one at the next step -> still one later.
    const { h, service } = await live(t)
    const manager = h.manager()
    assert.equal(service.manager.sessionId(), manager.session.id, 'observe the actual manager Session')
    const notices = (messages) => messages.filter((message) => messageText(message).includes(flow.notice))
    const admissions = (events) => events.filter((event) => event.type === flow.userMessage && notices([event.data]).length)
    const insertedNotices = () => notices(manager.session.snapshotEvents().filter((event) => event.type === flow.splice && event.data.target === flow.nextStep).flatMap((event) => event.data.inserted))
    const textOccurrences = (messages) => messages.reduce((count, message) => count + messageText(message).split(flow.notice).length - flow.once, flow.none)
    const injections = []
    const noticeInjections = () => injections.filter(({ message }) => notices([message]).length)
    const inject = manager.inject
    // Delegate unchanged: capture refusals even when SessionStore contains a throwing
    // observer. Never defer/retry injection or bypass the SDK's append guard.
    manager.inject = function (message) {
      const attempt = { message: structuredClone(message) }
      injections.push(attempt)
      try { return inject.call(this, message) }
      catch (error) { attempt.error = error; throw error }
    }
    t.after(() => { manager.inject = inject })
    const steps = []
    let start
    const dispose = h.ctx.on(flow.sessionEvent, (session, event) => {
      if (session !== manager.session) return
      if (event.type === flow.stepStart) start = event
      if (event.type === flow.stepEnd) steps.push({ start, end: event, messages: session.deriveMessages() })
    })
    t.after(dispose)
    async function userStep(text) {
      const response = await h.http(flow.chat, { method: flow.post, body: { text } })
      assert.equal(response.ok, true, 'user-step trigger must be accepted before judging held context')
      await manager.whenIdle()
      assert.ok(steps.at(-flow.once)?.messages.some((message) => messageText(message).includes(text)), 'step-observation unavailable: triggering user text was not admitted to the manager')
    }
    function acceptedInjections() {
      const attempts = noticeInjections()
      const accepted = attempts.filter((attempt) => !attempt.error)
      if (accepted.length === flow.none) assert.deepEqual(attempts.map((attempt) => String(attempt.error)), [], 'inject-refused: manager.inject rejected held context; this is not a followup-only text oracle')
      assert.ok(accepted.length > flow.none, 'inject-path missing: held context must use the supported manager.inject boundary')
      return accepted
    }

    await manager.whenIdle()
    const beforeHold = manager.session.seq
    manager.status = flow.running // Established fixture busy seam, not a real provider turn.
    const result = await notify(service, { wake: false, dedupeKey: flow.dedupeKey, text: flow.notice })
    assert.equal(result.status ?? result, flow.held)
    assert.equal(manager.followups.length, flow.none, 'quiet notice queues no independent followup')
    assert.equal(manager.inbox.nextTurn.length, flow.none, 'quiet notice does not queue an ordinary turn by another path')
    assert.equal(manager.session.snapshotEvents(beforeHold).filter((event) => event.type === flow.turnStart).length, flow.none, 'holding never opens a turn')
    assert.equal(admissions(manager.session.snapshotEvents()).length, flow.none, 'held is not yet admitted model context')

    manager.status = flow.idle
    await userStep(flow.nextUser)
    const accepted = acceptedInjections()
    assert.equal(steps.length, flow.once, 'the first later manager step must see the held notice, not an extra notice turn')
    const [next] = steps
    assert.ok(next.start, 'step-observation unavailable: no matching step/start')
    // SDK agent-loop/lib/index.js: rc.5:800–813,1066–1073; rc.1:564–577,859–866.
    // inject is separate next-step context, then user/message surface admission;
    // deriveMessages is the request history, not the original followup argument.
    const inserted = insertedNotices()
    assert.equal(inserted.length, flow.once, 'one durable next-step insertion, not merely a successful inject call')
    const { message } = accepted.find(({ message }) => message.id === inserted[flow.none].id) ?? {}
    assert.ok(message?.id, 'durable next-step identity must come from a successful supported injection')
    const [admitted] = admissions(manager.session.snapshotEvents())
    assert.equal(admissions(manager.session.snapshotEvents()).length, flow.once, 'one manager-session admission, not merely an inject call')
    assert.equal(admitted.data.id, message.id)
    assert.equal(admitted.surfaceOp, flow.surfaceAppend, 'notice enters the model-visible surface')
    assert.ok(next.start.seq < admitted.seq && admitted.seq < next.end.seq, 'held notice is admitted within the very next manager step')
    assert.deepEqual(notices(next.messages).map((item) => item.id), [message.id], 'next-step model-facing history contains that same notice once')
    assert.equal(textOccurrences(next.messages), flow.once, 'a single message must not repeat the notice text')

    await h.ctx.sessionPersistence.flush()
    assert.deepEqual(admissions(h.sessionLogs.get(manager.id) ?? []).map((event) => event.data.id), [message.id], 'explicit flush makes the single admitted context durable')
    await userStep(flow.laterUser)
    assert.deepEqual(insertedNotices().map((item) => item.id), [message.id], 'later boundary never reinserts the held notice')
    assert.equal(textOccurrences(steps.at(-flow.once).messages), flow.once, 'later context retains one notice, never a replayed copy')
    assert.equal(admissions(manager.session.snapshotEvents()).length, flow.once, 'crossing a later boundary never re-admits held work')
    await h.ctx.sessionPersistence.flush()
    assert.deepEqual(admissions(h.sessionLogs.get(manager.id) ?? []).map((event) => event.data.id), [message.id], 'durable admission remains exactly once after the later step')
  })

  it('XC-UC-02-E1 Samuel continues work with Fishball plugin updates — W0: a duplicate dedupeKey is answered duplicate and starts no second turn', async (t) => {
    const { h, service } = await live(t)
    const first = await notify(service, { dedupeKey: 'same-key' })
    const second = await notify(service, { dedupeKey: 'same-key', text: 'again' })
    assert.equal(first.status ?? first, 'queued')
    assert.equal(second.status ?? second, 'duplicate')
    assert.equal(h.manager().followups.length, 1, 'the duplicate never woke the manager')
    assert.doesNotMatch(h.manager().followups.map(messageText).join('\n'), /again/)
  })

  it('XC-UC-02-E2 Samuel retries an update after child rows reboot on the same home — durable key refuses a second notice turn', async (t) => {
    const sessionLogs = new Map()
    const first = await bootChild(t, { activate: true, sessionLogs })
    const service = first.requireInstance()
    const key = 'survives-child-row-restart'
    assert.equal(await notifyStatus(service, { dedupeKey: key }), 'queued')
    assert.equal(first.manager().followups.length, 1)
    const persisted = await readFile(path.join(first.home, U18.notifyFile), 'utf8')
    assert.ok(persisted.includes(JSON.stringify(key)), 'the documented file contains the queued key')
    append(first, 'user/message', { id: 'retained-session-event', role: 'user', content: [{ type: 'text', text: 'retained user context' }], source: { kind: 'user' } })
    const managerId = first.manager().id
    await first.close()
    const restarted = await bootChild(t, { home: first.home, activate: true, sessionLogs })
    const reloaded = restarted.requireInstance()
    assert.notEqual(reloaded, service, 'the service is rebuilt, not retained by the fixture')
    assert.equal(restarted.manager().id, managerId)
    assert.ok(reloaded.manager.userTexts({ limit: 10, maxChars: 100 }).some((item) => item.text === 'retained user context'), 'fixture DSH log survives the reboot too')
    assert.equal(await notifyStatus(reloaded, { dedupeKey: key }), 'duplicate')
    assert.equal(restarted.manager().followups.length, 0, 'durable duplicate queues nothing in the new child rows')
  })

  it('XC-DT-01 Samuel retries an update after queue rejection — pending key retries its reserved identity, only acceptance makes it duplicate', async (t) => {
    const { h, attempts, reservedId, allowRetry } = await pendingNotice(t, U18.pendingKey)
    const service = h.requireInstance()
    allowRetry()
    assert.equal(await notifyStatus(service, { dedupeKey: U18.pendingKey }), 'queued', 'a pending reservation is not delivered/duplicate')
    assert.equal(attempts.length, 2, 'the retry reaches the supplied agent boundary')
    assert.equal(attempts[1].id, reservedId, 'retry uses the identity persisted before the rejected queue attempt')
    assert.equal(h.manager().followups.length, 1)
    assert.equal(h.lastFollowup().id, reservedId)
    assert.equal(await notifyStatus(service, { dedupeKey: U18.pendingKey }), 'duplicate')
    assert.equal(attempts.length, 2, 'accepted key never queues again')
  })

  /** Bulk setup only: clone storage emitted by a real accepted notice, never a guessed schema. */
  async function seedRetentionHistory(t, keys) {
    const pending = await pendingNotice(t, U18.pendingKey, U18.notice, { activate: false })
    const { h, reservedId } = pending
    const service = h.requireInstance()
    const manager = h.manager()
    await manager.whenIdle()
    const firstNoticeSeq = manager.session.seq
    assert.equal(await notifyStatus(service, { dedupeKey: keys[0] }), 'queued')
    await manager.whenIdle()
    const templateId = h.lastFollowup().id
    await h.ctx.sessionPersistence.flush()
    await h.close()

    // The committed store, not product source, supplies all pending/accepted fields and order.
    // Fail explicitly if its per-notice records cannot be isolated; do not invent a new format.
    const storePath = path.join(h.home, U18.notifyFile)
    const lines = (await readFile(storePath, 'utf8')).trimEnd().split('\n')
    for (const line of lines) JSON.parse(line)
    const keyToken = JSON.stringify(keys[0])
    const firstTemplateLine = lines.findIndex((line) => line.includes(keyToken))
    assert.ok(firstTemplateLine >= 0, 'ordinary notify produced committed key records')
    const prefix = lines.slice(0, firstTemplateLine)
    const template = lines.slice(firstTemplateLine)
    assert.ok(template.every((line) => line.includes(keyToken) && !line.includes(JSON.stringify(U18.pendingKey))), 'accepted notice records form the isolated tail of this two-notice fixture')
    assert.ok(prefix.join('\n').includes(JSON.stringify(reservedId)), 'pending reservation is preserved verbatim')
    assert.ok(template.join('\n').includes(JSON.stringify(templateId)), 'committed accepted records correlate with the real queued identity')

    const events = h.sessionLogs.get(manager.id)
    const history = structuredClone(events.slice(0, firstNoticeSeq))
    const noticeEvents = events.slice(firstNoticeSeq)
    const allowedEvents = Object.values(U18.event)
    assert.ok(noticeEvents.every(({ type, surfaceOp, sourceEventSeqs }) => allowedEvents.includes(type) && (surfaceOp === undefined || surfaceOp === 'append') && sourceEventSeqs === undefined), 'template is one complete ordinary admission, without external sequence references')
    for (const type of [U18.event.turnStart, U18.event.turnEnd, U18.event.user]) assert.equal(noticeEvents.filter((event) => event.type === type).length, 1)
    assert.equal(noticeEvents.find(({ type }) => type === U18.event.user).data.id, templateId)
    assert.equal(noticeEvents.at(-1).type, U18.event.turnEnd)
    const templateTurn = noticeEvents.find(({ type }) => type === U18.event.turnStart).data.turn
    const serializedEvents = JSON.stringify(noticeEvents)
    const seededLines = [...prefix]
    const seededIds = new Set()
    for (const [index, dedupeKey] of keys.entries()) {
      const id = randomUUID()
      seededIds.add(id)
      const replacements = new Map([[keys[0], dedupeKey], [templateId, id]])
      const clone = (json) => JSON.parse(json, (_field, value) => replacements.get(value) ?? value)
      seededLines.push(...template.map((line) => JSON.stringify(clone(line))))
      // Keep the same manager Session and full inbox-splice/admission/closed-turn history.
      // Only opaque message identities and SDK-owned seq/turn counters vary between copies.
      for (const event of clone(serializedEvents)) {
        event.seq = history.length
        if (Object.hasOwn(event.data, 'turn')) event.data.turn = templateTurn + index
        history.push(event)
      }
    }
    assert.equal(seededIds.size, keys.length)
    assert.equal(history.filter(({ type }) => type === U18.event.user).length, keys.length)
    h.sessionLogs.set(manager.id, history)
    await writeFile(storePath, seededLines.join('\n') + '\n')

    // Bulk writes happen only while child rows are closed. Real notify keeps its real fsyncs.
    const queued = []
    const seeded = await bootChild(t, { home: h.home, activate: false, sessionLogs: h.sessionLogs, onFollowup(message) {
      if (message.id === reservedId) throw new Error(U18.queueFailure)
      queued.push(message)
    } })
    for (const dedupeKey of [keys[0], keys.at(-1)]) assert.equal(await notifyStatus(seeded.requireInstance(), { dedupeKey }), 'duplicate', 'seeded history is loaded, not an ignored file')
    assert.equal(queued.length, 0, 'loaded accepted keys do not requeue')
    return { h: seeded, reservedId }
  }

  // §12.5 caps accepted history, not load: 9,998 committed keys + 1/2/3 real notifications.
  for (const count of [U18.notifyKeys - 1, U18.notifyKeys, U18.notifyKeys + 1]) {
    it(`XC-BVA-KEYS-${count} newest-key retention at ${count} accepted notices — file and reloaded duplicate behavior agree`, async (t) => {
      const keys = Array.from({ length: count }, (_, index) => U18.retentionKeyPrefix + index)
      const { h, reservedId } = await seedRetentionHistory(t, keys.slice(0, U18.retentionSeedKeys))
      const service = h.requireInstance()
      const boundaryKeys = keys.slice(U18.retentionSeedKeys)
      for (const dedupeKey of boundaryKeys) assert.equal(await notifyStatus(service, { dedupeKey }), 'queued')
      assert.equal(h.manager().followups.length, boundaryKeys.length, 'only boundary notifications traverse the real queue and per-notification persistence')
      const file = await readFile(path.join(h.home, U18.notifyFile), 'utf8')
      for (const line of file.trimEnd().split('\n')) assert.doesNotThrow(() => JSON.parse(line), 'store remains valid JSONL without imposing its field/line layout')
      const kept = keys.slice(-U18.notifyKeys)
      assert.ok(file.includes(JSON.stringify(kept[0])))
      assert.ok(file.includes(JSON.stringify(keys.at(-1))))
      if (count > U18.notifyKeys) assert.equal(file.includes(JSON.stringify(keys[0])), false, 'oldest accepted key is evicted at the actual 10001 boundary before pending acceptance')
      assert.ok(file.includes(JSON.stringify(U18.pendingKey)), 'accepted-history trimming never evicts pending work')
      assert.ok(file.includes(JSON.stringify(reservedId)), 'pending identity survives accepted-history trimming')
      for (const dedupeKey of [kept[0], keys.at(-1)]) assert.equal(await notifyStatus(service, { dedupeKey }), 'duplicate', 'newest accepted-history boundary keys are retained before recovery')
      await h.close()
      const reloaded = await bootChild(t, { home: h.home, activate: false, sessionLogs: h.sessionLogs })
      const fresh = reloaded.requireInstance()
      // Public retry activates the manager without HTTP; startup may already have accepted it.
      const recoveredStatus = await notifyStatus(fresh, { dedupeKey: U18.pendingKey })
      assert.ok(recoveredStatus === 'queued' || recoveredStatus === 'duplicate', 'pending work retries unless startup already accepted it')
      assert.deepEqual(reloaded.manager().followups.map((message) => message.id), [reservedId], 'restart accepts pending work exactly once with its reserved identity')
      assert.equal(await notifyStatus(fresh, { dedupeKey: keys.at(-1) }), 'duplicate', 'newest accepted key survives pending recovery')
      // Accepting recovered pending work can evict the oldest accepted key at the cap.
      const retainedAfterRecovery = count < U18.notifyKeys ? kept[0] : kept[1]
      assert.equal(await notifyStatus(fresh, { dedupeKey: retainedAfterRecovery }), 'duplicate', 'the retained accepted-history edge survives at most one pending acceptance')
      assert.equal(await notifyStatus(fresh, { dedupeKey: U18.pendingKey }), 'duplicate')
      assert.equal(reloaded.manager().followups.length, 1, 'retained accepted keys never requeue')
      if (count > U18.notifyKeys) {
        assert.equal(await notifyStatus(fresh, { dedupeKey: keys[0] }), 'queued', 'evicted accepted key can notify again after restart')
        assert.equal(reloaded.manager().followups.length, 2)
      }
    })
  }

  // One independent flow per manager state; share the actor action and acceptance checks.
  for (const state of ['idle', 'running']) {
    const flowId = state === 'idle' ? 'XC-UC-02-A2' : 'XC-UC-02-A3'
    it(`${flowId} Samuel gets one Fishball update — W0 fixture: X10 wake:true queues while manager is ${state}`, async (t) => {
      const { h, service } = await live(t)
      h.manager().status = state
      const result = await notify(service, { dedupeKey: state })
      assert.equal(result.status ?? result, 'queued')
      assert.equal(h.manager().followups.length, 1)
      assert.match(messageText(h.lastFollowup()), /a plugin notice/)
    })
  }
})

describe('X0-C U18/U20 direct tool send path', () => {
  for (const [index, tool] of ['message_session', 'redirect_session'].entries()) {
    it(`XC-UC-03-M${index + 1} Samuel messages a session directly — ${tool} reaches connector unchanged`, async (t) => {
      const h = await bootChild(t, { activate: true })
      h.requireInstance()
      const before = h.host.requests.length
      const result = await h.tool(tool, U18.send)
      assert.equal(result.ok, true)
      const operation = tool === 'message_session' ? 'session.message' : 'session.redirect'
      assert.deepEqual(h.host.requests.slice(before).map(({ operation, payload }) => ({ operation, payload })), [{
        operation,
        payload: { sessionId: U18.send.session_id, message: U18.send.message, attachments: [] },
      }], 'the send passes the existing connector payload without rewriting it')
    })
  }
})

describe('X0-C X11 manager.userTexts', () => {
  const userMessage = (id, text) => ({ id, role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } })
  const other = (id, text, source) => ({ id, role: 'user', content: [{ type: 'text', text }], ...(source === undefined ? {} : { source }) })

  function logMessages(h) {
    for (const [id, text] of [['u1', 'oldest'], ['u2', 'middle'], ['u3', 'newest']]) append(h, 'user/message', userMessage(id, text))
    append(h, 'assistant/message', { message: { content: [{ type: 'text', text: 'assistant text' }] } })
    append(h, 'user/message', other('s1', 'a scheduled reminder', { kind: 'schedule' }))
    append(h, 'user/message', other('g1', 'an agent relay', { kind: 'agent-message', form: 'relay' }))
  }

  it('XC-EP-V-05 Samuel continues work with Fishball plugin updates — W0: userTexts returns only user-written texts, newest first', async (t) => {
    const { h, service } = await live(t)
    logMessages(h)
    const texts = service.manager.userTexts({ limit: 10, maxChars: 100 })
    assert.deepEqual(texts.map((item) => item.text), ['newest', 'middle', 'oldest'])
    assert.ok(texts.every((item) => Number.isFinite(item.at)))
  })

  it('XC-BVA-02 Samuel continues work with Fishball plugin updates — W0: limit 0, 1, available count 3 and count+1', async (t) => {
    const { h, service } = await live(t)
    logMessages(h)
    assert.deepEqual(service.manager.userTexts({ limit: 0, maxChars: 100 }), [])
    assert.deepEqual(service.manager.userTexts({ limit: 1, maxChars: 100 }).map((item) => item.text), ['newest'])
    assert.equal(service.manager.userTexts({ limit: 3, maxChars: 100 }).length, 3)
    assert.equal(service.manager.userTexts({ limit: 4, maxChars: 100 }).length, 3, 'a larger limit returns what exists')
  })

  it('XC-BVA-03 Samuel continues work with Fishball plugin updates — W0: maxChars cuts at a surrogate pair without a lone surrogate', async (t) => {
    const { h, service } = await live(t)
    append(h, 'user/message', userMessage('pair', 'ab😀cd'))
    const [item] = service.manager.userTexts({ limit: 1, maxChars: 3 })
    assert.equal(item.text.isWellFormed?.(), true, 'no lone surrogate: ' + JSON.stringify(item.text))
    assert.ok(item.text.length <= 3)
  })
})

it.todo('XC-UC-01-A4 Samuel continues work with Fishball plugin updates — deferred: [owner: X-E2E] register during a real model turn, offer on next request, dispose and omit on following request')
it.todo('XC-UC-01-A5 Samuel keeps current board context in Fishball — [owners: X0-C/X-E2E] approved dynamic systemPrompt.context callback fixture registers on create/resume/live, evaluates current data, dispose removes the contribution without a turn')
it.todo('XC-UC-01-E2 Samuel keeps healthy capabilities when async setup fails — [owner: X0-C] approved A: await setup before create/resume publication; late registration ready after completion; log rejected callback once, isolate healthy registration and fence disposed completion so contributions cannot leak')
it.todo('XC-UC-02-E3 Samuel retries after durable queue acceptance lost its receipt — [owners: X0-C/FB-PUSH/X-E2E] reconcile the persisted stable identity against durable queue after rebuild, deliver once; current fake agent has no durable queue ledger')
it.todo('XC-UC-02-E4 Samuel recovers from notification reservation persistence failure — [owner: X0-C] freeze safe store-fault fixture; no accepted success without persistence, recovery retries one stable identity')
it.todo('XC-UC-02-A4 Samuel continues after a quiet notice survived rebuild — [owners: X0-C/X-E2E] durable hold acceptance/recovery adds text once to next user turn, never an independent wake')
it.todo('XC-UC-05-M Samuel receives routed updates while controlling sessions over MCP — [owners: MCP-S3/K1/X0-C/X0-W/FB-PUSH] freeze typed local control/intake port names/shapes before W1; no second control API, route before durable queue/wake/ack; no invented transport interface')

/** All U18 observations stay at supplied services, agent queue and connector wire boundaries. */
async function inboxPort(t) {
  const h = await bootChild(t, { activate: true })
  h.requireInstance()
  const chat = h.ctx.get('fishballChat')
  assert.equal(typeof chat?.deliverInbox, 'function', 'fishballChat.deliverInbox is missing')
  return { h, chat }
}

function deliveryPromise(chat, items, options) {
  let promise
  assert.doesNotThrow(() => { promise = chat.deliverInbox(items, options) }, 'delivery failures must reject, not throw synchronously')
  assert.equal(typeof promise?.then, 'function', 'deliverInbox returns a promise')
  return promise
}

async function assertBatch(h, chat, items, options) {
  const original = structuredClone(items)
  const before = h.manager().followups.length
  const receipt = await deliveryPromise(chat, items, options)
  const calls = h.manager().followups.slice(before)
  assert.equal(calls.length, 1, 'one batch is one queue call')
  const [message] = calls
  assert.equal(message.role, 'user')
  assert.equal(typeof receipt.messageId, 'string')
  assert.ok(receipt.messageId.length > 0)
  assert.equal(message.id, receipt.messageId)
  assert.deepEqual(message.content, [{ type: 'text', text: items.map((item) => item.text).join(U18.batch.separator) }])
  assert.deepEqual(items, original, 'delivery does not mutate caller items')
  return message
}

async function rejectBatch(h, chat, items, expected, options) {
  const original = structuredClone(items)
  const queueCount = h.manager().followups.length
  const requestCount = h.host.requests.length
  await assert.rejects(deliveryPromise(chat, items, options), expected)
  assert.equal(h.manager().followups.length, queueCount, 'refusal queues no partial batch')
  assert.equal(h.host.requests.length, requestCount, 'validation refusal fetches no images')
  assert.deepEqual(items, original, 'refusal leaves caller input unchanged')
}

const sampleImage = (overrides = {}) => ({ attachmentId: 'image-1', mediaType: 'image/png', width: 1, height: 1, bytes: 1, ...overrides })

/** Enable the real images service; §12.5.1 empty inputs must never touch storage. */
async function imageSendPort(t) {
  const storageCalls = []
  const attachments = Object.fromEntries(U18.attachmentMethods.map((method) => [method, () => {
    storageCalls.push(method)
    assert.fail(U18.attachmentUseFailure)
  }]))
  t.after(() => assert.deepEqual(storageCalls, [], U18.attachmentUseFailure))
  const h = await bootChild(t, { activate: true, attachments })
  h.requireInstance()
  const images = h.ctx.get('fishballImages')
  assert.equal(typeof images?.message, 'function', 'fishballImages.message is missing')
  return { h, images }
}

describe('X0-C U18/U20 images service sends', () => {
  for (const [index, attachments] of [[], undefined].entries()) {
    it(`XC-UC-03-A${index + 1} Samuel sends through images.message — ${attachments === undefined ? 'omitted' : 'empty'} attachments preserve exact wire text and delivered result`, async (t) => {
      const { h, images } = await imageSendPort(t)
      const request = { ...U18.imageSend, ...(attachments === undefined ? {} : { attachments }) }
      const original = structuredClone(request)
      const before = h.host.requests.length
      const result = await images.message(request)
      assert.deepEqual(h.host.requests.slice(before).map(({ operation, payload }) => ({ operation, payload })), [{ operation: 'session.message', payload: { ...U18.imageSend, attachments: [] } }])
      assert.deepEqual(result, { status: 'delivered' })
      assert.deepEqual(request, original)
    })
  }

  it('XC-DT-02 images.message returns unconfirmed unchanged and never retries or creates a watch', async (t) => {
    const { h, images } = await imageSendPort(t)
    h.host.responses.set('session.message', { status: 'unconfirmed' })
    const before = h.host.requests.length
    assert.deepEqual(await images.message({ ...U18.imageSend, attachments: [] }), { status: 'unconfirmed' })
    assert.deepEqual(h.host.requests.slice(before).map(({ operation, payload }) => ({ operation, payload })), [{ operation: 'session.message', payload: { ...U18.imageSend, attachments: [] } }])
  })

  it('XC-EP-IMAGE-01 images.message rejects a connector refusal rather than fabricating success', async (t) => {
    const { h, images } = await imageSendPort(t)
    h.host.fail.add('session.message')
    const before = h.host.requests.length
    await assert.rejects(images.message({ ...U18.imageSend, attachments: [] }), { code: 'operation-failed' })
    assert.equal(h.host.requests.length - before, 1, 'refusal is not retried')
  })
})

describe('X0-C U18 deliverInbox array queue and receipt', () => {
  it('XC-UC-04-M Samuel receives three independently sender-framed updates in one queued message in arrival order', async (t) => {
    const { h, chat } = await inboxPort(t)
    const items = [
      { text: '[from Alice]\n first \n', kind: 'session', sourceSessionId: 'ses-alice' },
      { text: '[from Bob]\nsecond', kind: 'session', sourceSessionId: 'ses-bob' },
      { text: '[system]\nthird', kind: 'system' },
    ]
    const message = await assertBatch(h, chat, items)
    assert.deepEqual(messageSource(message), { kind: 'fishball-notice', form: 'notice' })
    assert.equal(h.manager().status, 'idle', 'receipt does not need a model completion')
  })

  for (const count of [0, 1, 19, 20, 21]) {
    it(`XC-BVA-BATCH-COUNT-${count} array count ${count} obeys the 1–20 item contract without splitting`, async (t) => {
      const { h, chat } = await inboxPort(t)
      const items = Array.from({ length: count }, (_, index) => ({ text: 'notice-' + index }))
      if (count === 0 || count > U18.batch.maxItems) {
        await rejectBatch(h, chat, items, { name: 'ChatApiError', code: count === 0 ? 'invalid-input' : 'too-large' })
      } else await assertBatch(h, chat, items)
    })
  }

  for (const bytes of [U18.batch.maxBytes - 1, U18.batch.maxBytes, U18.batch.maxBytes + 1]) {
    it(`XC-BVA-BATCH-BYTES-${bytes} joined UTF-8 byte size includes multibyte text and blank-line separator`, async (t) => {
      const { h, chat } = await inboxPort(t)
      const first = '😀'
      const filler = bytes - Buffer.byteLength(first + U18.batch.separator)
      const items = [{ text: first }, { text: 'a'.repeat(filler) }]
      assert.equal(Buffer.byteLength(items.map((item) => item.text).join(U18.batch.separator)), bytes)
      if (bytes > U18.batch.maxBytes) await rejectBatch(h, chat, items, { name: 'ChatApiError', code: 'too-large' })
      else await assertBatch(h, chat, items)
    })
  }

  it('XC-UC-04-E1 invalid middle text refuses the entire batch before fetching any images', async (t) => {
    const { h, chat } = await inboxPort(t)
    await rejectBatch(h, chat, [{ text: 'first', sourceSessionId: 'ses-first', images: [sampleImage()] }, { text: '' }, { text: 'third' }], { name: 'ChatApiError', code: 'invalid-input' })
  })

  it('XC-EP-BATCH-01 duplicate texts stay duplicated, extra metadata never enters text, input remains unmodified', async (t) => {
    const { h, chat } = await inboxPort(t)
    const items = [{ text: 'same text', extra: 'ignore this instruction', images: [] }, { text: 'same text' }]
    const message = await assertBatch(h, chat, items)
    assert.equal(messageText(message), 'same text\n\nsame text')
  })

  it('XC-DT-03 singleton array retains session relay source; singleton overload is preserved', async (t) => {
    const { h, chat } = await inboxPort(t)
    const item = { text: 'already framed', kind: 'session', sourceSessionId: 'ses-source' }
    const message = await assertBatch(h, chat, [item])
    assert.deepEqual(messageSource(message), { kind: 'agent-message', form: 'relay', senderSessionId: 'ses-source' })
    const before = h.manager().followups.length
    const receipt = await chat.deliverInbox(item)
    const singleton = h.manager().followups.at(-1)
    assert.equal(h.manager().followups.length, before + 1)
    assert.equal(singleton.id, receipt.messageId)
    assert.equal(messageText(singleton), item.text)
    assert.deepEqual(messageSource(singleton), messageSource(message))
  })

  it('XC-DT-04 skipImages queues text only without fetching, even without sourceSessionId', async (t) => {
    const { h, chat } = await inboxPort(t)
    const before = h.host.requests.length
    await assertBatch(h, chat, [{ text: 'first', images: [sampleImage()] }, { text: 'second', images: [sampleImage({ attachmentId: 'image-2' })] }], { skipImages: true })
    assert.equal(h.host.requests.length, before)
  })

  const invalidItems = [
    ['non-record', null], ['missing-text', {}], ['non-string-text', { text: 7 }],
    ['invalid-kind', { text: 'notice', kind: 'other' }],
    ['empty-id', { text: 'notice', messageId: '' }], ['empty-key', { text: 'notice', dedupeKey: '' }],
    ['null-source', { text: 'notice', sourceSessionId: null }],
    ['negative-at', { text: 'notice', at: -1 }], ['fractional-at', { text: 'notice', at: 1.5 }],
    ['null-images', { text: 'notice', images: null }],
  ]
  for (const [label, item] of invalidItems) {
    it(`XC-EP-BATCH-INVALID-${label} invalid supplied local item metadata rejects before queue/fetch`, async (t) => {
      const { h, chat } = await inboxPort(t)
      await rejectBatch(h, chat, [item], { name: 'ChatApiError', code: 'invalid-input' })
    })
  }

  for (const [label, options] of [['null', null], ['non-boolean-skip', { skipImages: 'yes' }]]) {
    it(`XC-EP-BATCH-OPTIONS-${label} invalid delivery options reject asynchronously without queueing`, async (t) => {
      const { h, chat } = await inboxPort(t)
      await rejectBatch(h, chat, [{ text: 'notice' }], { name: 'ChatApiError', code: 'invalid-input' }, options)
    })
  }

  const invalidImages = [
    ['missing-field', { attachmentId: 'image-1', mediaType: 'image/png', width: 1, height: 1 }],
    ['unsupported-type', sampleImage({ mediaType: 'image/svg+xml' })],
    ['zero-dimension', sampleImage({ width: 0 })],
    ['fractional-dimension', sampleImage({ height: 1.5 })],
    ['unsafe-byte-count', sampleImage({ bytes: Number.MAX_SAFE_INTEGER + 1 })],
  ]
  for (const [label, image] of invalidImages) {
    it(`XC-EP-BATCH-IMAGE-${label} skipImages does not bypass image descriptor validation`, async (t) => {
      const { h, chat } = await inboxPort(t)
      await rejectBatch(h, chat, [{ text: 'notice', images: [image] }], { name: 'ContractError', code: 'invalid-envelope' }, { skipImages: true })
    })
  }

  it('XC-EP-BATCH-IMAGE-source missing source rejects before fetching images when skipImages is false', async (t) => {
    const { h, chat } = await inboxPort(t)
    await rejectBatch(h, chat, [{ text: 'notice', images: [sampleImage()] }], { name: 'ContractError', code: 'invalid-envelope' })
  })

  for (const count of [U18.batch.imageMax - 1, U18.batch.imageMax, U18.batch.imageMax + 1]) {
    it(`XC-BVA-BATCH-IMAGECOUNT-${count} image count is bounded per item and validated while skipped`, async (t) => {
      const { h, chat } = await inboxPort(t)
      const items = [{ text: 'first', images: Array.from({ length: count }, () => sampleImage()) }, { text: 'second', images: [sampleImage()] }]
      if (count > U18.batch.imageMax) await rejectBatch(h, chat, items, { name: 'ContractError', code: 'too-large' }, { skipImages: true })
      else await assertBatch(h, chat, items, { skipImages: true })
    })
  }

  for (const field of ['pixels', 'bytes']) {
    for (const delta of [-1, 0, 1]) {
      const limit = field === 'pixels' ? U18.batch.imagePixels : U18.batch.imageBytes
      const value = limit + delta
      it(`XC-BVA-BATCH-IMAGE-${field}-${value} image ${field} cap applies even when fetches are skipped`, async (t) => {
        const { h, chat } = await inboxPort(t)
        const image = sampleImage(field === 'pixels' ? { width: value, height: 1 } : { bytes: value })
        const items = [{ text: 'notice', images: [image] }]
        if (delta > 0) await rejectBatch(h, chat, items, { name: 'ContractError', code: 'too-large' }, { skipImages: true })
        else await assertBatch(h, chat, items, { skipImages: true })
      })
    }
  }

  it('XC-DT-05 whole-array shape validation precedes item count and never partially delivers', async (t) => {
    const { h, chat } = await inboxPort(t)
    const items = Array.from({ length: U18.batch.maxItems + 1 }, () => ({ text: 'valid' }))
    items[1] = { text: null }
    await rejectBatch(h, chat, items, { name: 'ChatApiError', code: 'invalid-input' })
  })

  it('XC-DT-06 item count precedes joined size and image descriptors', async (t) => {
    const { h, chat } = await inboxPort(t)
    const items = Array.from({ length: U18.batch.maxItems + 1 }, () => ({ text: 'valid' }))
    items[0].images = [{}]
    await rejectBatch(h, chat, items, { name: 'ChatApiError', code: 'too-large' })
  })

  it('XC-DT-07 joined text size precedes image validation and fetches', async (t) => {
    const { h, chat } = await inboxPort(t)
    await rejectBatch(h, chat, [{ text: 'a'.repeat(U18.batch.maxBytes + 1), images: [{}] }], { name: 'ChatApiError', code: 'too-large' })
  })

  it('XC-DT-08 image count precedes malformed descriptors', async (t) => {
    const { h, chat } = await inboxPort(t)
    await rejectBatch(h, chat, [{ text: 'notice', images: Array.from({ length: U18.batch.imageMax + 1 }, () => ({})) }], { name: 'ContractError', code: 'too-large' }, { skipImages: true })
  })
})
