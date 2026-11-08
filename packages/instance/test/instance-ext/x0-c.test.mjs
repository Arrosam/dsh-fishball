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
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { bootChild, messageSource, messageText } from '../../../../test/support/instance-ext.mjs'

const MANAGER = 'fishball-fold-notify'
const U18 = Object.freeze({
  notifyFile: 'notify-keys.jsonl',
  notifyKeys: 10_000,
  watchdog: 'fishball-watchdog',
  notice: 'a watchdog notice',
  queueFailure: 'injected agent queue rejection before acceptance',
  pendingKey: 'pending-notice-must-survive-accepted-history-trim',
  handoverKey: 'watchdog-handover:fixture-episode',
  recoveryKey: 'watchdog-recovery:fixture-episode',
  handoverText: 'Watchdog unavailable; Fishball now handles supervision and approvals; no session was stopped.',
  errorName: 'ExtensionError',
  notImplemented: 'not-implemented',
  send: Object.freeze({ session_id: 'session-without-watchdog', message: 'unchanged message 😀' }),
  imageSend: Object.freeze({ sessionId: 'ses-target', message: '  unchanged\nmessage  ' }),
  batch: Object.freeze({ maxItems: 20, maxBytes: 65_536, separator: '\n\n', imageMax: 20, imagePixels: 4_194_304, imageBytes: 4_194_304 }),
})

/** Boot with the manager Session activated (the app row's create setup has run). */
async function live(t) {
  const h = await bootChild(t, { activate: true })
  return { h, service: h.requireInstance() }
}

/** Inject only at the supplied agent boundary; no fake notification/dedupe implementation. */
async function pendingNotice(t, dedupeKey, text = U18.notice) {
  const attempts = []
  let persistedAtQueue
  let queueLengthAtRejection
  let rejectPending = true
  const h = await bootChild(t, { activate: true, onFollowup(message, agent) {
    attempts.push(structuredClone(message))
    if (rejectPending && message.id === attempts[0].id) {
      persistedAtQueue = readFileSync(path.join(h.home, U18.notifyFile), 'utf8')
      queueLengthAtRejection = agent.followups.length
      throw new Error(U18.queueFailure)
    }
  } })
  // Error envelope is not specified; durable retry state and no accepted turn are specified.
  await h.requireInstance().manager.notify({ pluginId: U18.watchdog, dedupeKey, text, wake: true }).catch(() => {})
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

describe('X0-C service surface (X1–X16 stub contract)', () => {
  it('XC-EP-V-01 Samuel continues work with Fishball plugin updates — W0: the app row provides fishballInstance apiVersion 1 with every member', async (t) => {
    const h = await bootChild(t)
    const service = h.requireInstance()
    assert.equal(service.apiVersion, 1)
    for (const member of ['manager', 'chat', 'inbox', 'ui', 'attention', 'bridge', 'sideAgents', 'approvals', 'supervision', 'sessionStarts']) {
      assert.ok(service[member] !== undefined, 'fishballInstance.' + member + ' is missing (X1–X16)')
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

// Only surviving §1 public methods are enumerated; no withdrawn UI APIs are revived.
const STUB_CASES = [
  ['inbox.claim', (s) => s.inbox.claim({ pluginId: MANAGER, kind: 'user', match: () => undefined }, () => {})],
  ['inbox.release', (s) => s.inbox.release('held-key', { deliver: true })],
  ['inbox.setBatcher', (s) => s.inbox.setBatcher(MANAGER, () => {})],
  ['attention.set', (s) => s.attention.set(MANAGER, { unread: 0, importantUnread: 0, latestAt: null })],
  ['sideAgents.open', (s) => s.sideAgents.open({})],
  ['sideAgents.runTurn', (s) => s.sideAgents.runTurn({}, 'decision', {})],
  ['sideAgents.cancel', (s) => s.sideAgents.cancel({})],
  ['approvals.claim', (s) => s.approvals.claim('session-managed', { id: U18.watchdog, name: 'Watchdog', onCard() {} })],
  ['approvals.card', (s) => s.approvals.card('approval-1')],
  ['approvals.onSettled', (s) => s.approvals.onSettled(() => {})],
  ['approvals.answerApproval', (s) => s.approvals.answerApproval({ approvalId: 'approval-1', decision: 'allow', decidedBy: U18.watchdog })],
  ['supervision.register', (s) => s.supervision.register(U18.watchdog)],
  ['supervision.onManagedChange', (s) => s.supervision.onManagedChange(() => {})],
  ['supervision.endingReason', (s) => s.supervision.endingReason()],
  ['sessionStarts.register', (s) => s.sessionStarts.register(U18.watchdog, { parameter: 'watchdog', schema: {}, validate: () => ({ ok: true }), attach: async () => ({ ok: true }) })],
]

describe('X0-C U18 typed stub refusals', () => {
  for (const [index, [member, invoke]] of STUB_CASES.entries()) {
    it(`XC-EP-STUB-${String(index + 1).padStart(2, '0')} Samuel never mistakes an unavailable capability for success — ${member} refuses with typed metadata`, async (t) => {
      const h = await bootChild(t)
      const service = h.requireInstance()
      const [area, method] = member.split('.')
      assert.equal(typeof service[area]?.[method], 'function', 'the designed public stub ' + member + ' is missing')
      // §12.5 does not classify every signature as sync/async: either refusal must retain metadata.
      await assert.rejects(Promise.resolve().then(() => invoke(service)), {
        name: U18.errorName,
        code: U18.notImplemented,
        member,
      })
    })
  }

  it('XC-EP-STUB-16 Samuel never mistakes a scoped connector stub for success — bridge refuses ExtensionError/not-implemented', async (t) => {
    const service = (await bootChild(t)).requireInstance()
    assert.equal(typeof service.bridge, 'function')
    // The top-level bridge signature has no declared <area.member> spelling; do not invent one.
    await assert.rejects(Promise.resolve().then(() => service.bridge(U18.watchdog, ['session.list'])), {
      name: U18.errorName,
      code: U18.notImplemented,
    })
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
    service.manager.registerSetup(MANAGER, () => { throw new Error('setup boom') })
    service.manager.registerSetup('fishball-board', (agentCtx) => {
      agentCtx.tools.register({ name: 'board_after_throw', description: 'board' })
    })
    await h.http('/api/chat')
    assert.ok(h.agentCtxs()[0].ctx.tools.names().includes('board_after_throw'))
    const warningCount = () => h.logs.filter((entry) => entry.level === 'warn').length
    assert.equal(warningCount(), 1, 'the callback failure is logged once')
    h.agentsById.delete(h.manager().id)
    await h.http('/api/chat')
    assert.equal(warningCount(), 1, 'the same plugin/point failure is not logged again on resume')
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
    pluginId: U18.watchdog,
    dedupeKey: 'wd-1',
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
    assert.match(messageText(queued), /a watchdog notice/)
    assert.deepEqual(messageSource(queued), { kind: 'fishball-notice', form: 'plugin', pluginId: 'fishball-watchdog' })
    assert.equal(h.manager().followups.length, 1)
  })

  it('XC-UC-02-A1 Samuel continues work with Fishball plugin updates — W0: wake:false is held and joins the next turn', async (t) => {
    const { h, service } = await live(t)
    const result = await notify(service, { wake: false, text: 'held notice' })
    assert.equal(result.status ?? result, 'held')
    assert.equal(h.manager().followups.length, 0, 'it starts no turn of its own')
    await h.http('/api/chat', { method: 'POST', body: { text: 'next user turn' } })
    const queued = h.manager().followups.map(messageText).join('\n')
    assert.match(queued, /held notice/, 'the held notice is in the next turn')
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

  for (const [kind, dedupeKey] of [['HANDOVER', U18.handoverKey], ['RECOVERY', U18.recoveryKey]]) {
    it(`XC-ST-NOTIFY-${kind} Samuel receives the missing ${kind.toLowerCase()} update after child rows rebuild — pending reservation reuses one message identity`, async (t) => {
      const { h, reservedId } = await pendingNotice(t, dedupeKey, U18.handoverText)
      const service = h.requireInstance()
      await h.close()
      const restarted = await bootChild(t, { home: h.home, activate: true, sessionLogs: h.sessionLogs })
      const reloaded = restarted.requireInstance()
      assert.notEqual(reloaded, service, 'a new service reads the same home')
      const recoveredCount = restarted.manager().followups.length
      assert.ok(recoveredCount === 0 || recoveredCount === 1, 'startup may retry pending work, but never twice')
      assert.equal(await notifyStatus(reloaded, { dedupeKey, text: U18.handoverText }), recoveredCount === 0 ? 'queued' : 'duplicate', 'only an observed accepted recovery can make retry duplicate')
      assert.equal(restarted.manager().followups.length, 1)
      assert.equal(restarted.lastFollowup().id, reservedId, 'restart preserves the reserved identity')
      assert.ok(messageText(restarted.lastFollowup()).includes(U18.handoverText))
      assert.equal(await notifyStatus(reloaded, { dedupeKey, text: U18.handoverText }), 'duplicate')
      assert.equal(restarted.manager().followups.length, 1)
    })
  }

  // Three-value BVA around the specified durable key retention cap, using only public notify.
  for (const count of [U18.notifyKeys - 1, U18.notifyKeys, U18.notifyKeys + 1]) {
    it(`XC-BVA-KEYS-${count} newest-key retention at ${count} accepted notices — file and reloaded duplicate behavior agree`, async (t) => {
      const { h, reservedId } = await pendingNotice(t, U18.pendingKey)
      const service = h.requireInstance()
      const keys = Array.from({ length: count }, (_, index) => 'cap-key-' + index)
      for (const dedupeKey of keys) assert.equal(await notifyStatus(service, { dedupeKey }), 'queued')
      assert.equal(h.manager().followups.length, count)
      const file = await readFile(path.join(h.home, U18.notifyFile), 'utf8')
      for (const line of file.trimEnd().split('\n')) assert.doesNotThrow(() => JSON.parse(line), 'store remains valid JSONL without imposing its field/line layout')
      const kept = keys.slice(-U18.notifyKeys)
      assert.ok(file.includes(JSON.stringify(kept[0])))
      assert.ok(file.includes(JSON.stringify(keys.at(-1))))
      assert.ok(file.includes(JSON.stringify(U18.pendingKey)), 'accepted-history trimming never evicts pending work')
      assert.ok(file.includes(JSON.stringify(reservedId)), 'pending identity survives accepted-history trimming')
      for (const dedupeKey of [kept[0], keys.at(-1)]) assert.equal(await notifyStatus(service, { dedupeKey }), 'duplicate', 'newest accepted-history boundary keys are retained before recovery')
      await h.close()
      const reloaded = await bootChild(t, { home: h.home, activate: true, sessionLogs: h.sessionLogs })
      const fresh = reloaded.requireInstance()
      const startupCalls = reloaded.manager().followups.slice()
      assert.ok(startupCalls.length <= 1, 'startup cannot duplicate the only pending notice')
      if (startupCalls.length) assert.equal(startupCalls[0].id, reservedId, 'only pending identity may be recovered')
      assert.equal(await notifyStatus(fresh, { dedupeKey: keys.at(-1) }), 'duplicate', 'newest accepted key survives pending recovery')
      // Accepting recovered pending work can evict the oldest accepted key at the cap.
      if (startupCalls.length === 0 || count < U18.notifyKeys) {
        assert.equal(await notifyStatus(fresh, { dedupeKey: kept[0] }), 'duplicate')
      }
      assert.equal(reloaded.manager().followups.length, startupCalls.length, 'retained accepted keys never requeue')
      const beforePending = reloaded.manager().followups.length
      assert.equal(await notifyStatus(fresh, { dedupeKey: U18.pendingKey }), startupCalls.length === 0 ? 'queued' : 'duplicate', 'pending work is retryable unless startup already accepted it')
      const pendingMessages = reloaded.manager().followups.filter((message) => message.id === reservedId)
      assert.equal(pendingMessages.length, 1)
      const afterPending = beforePending + (startupCalls.length === 0 ? 1 : 0)
      assert.equal(reloaded.manager().followups.length, afterPending)
      assert.equal(await notifyStatus(fresh, { dedupeKey: U18.pendingKey }), 'duplicate')
      assert.equal(reloaded.manager().followups.length, afterPending)
      if (count > U18.notifyKeys) {
        assert.equal(await notifyStatus(fresh, { dedupeKey: keys[0] }), 'queued', 'evicted accepted key can notify again after restart')
        assert.equal(reloaded.manager().followups.length, afterPending + 1)
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
      assert.match(messageText(h.lastFollowup()), /a watchdog notice/)
    })
  }
})

describe('X0-C U18/U20 effectively-off tool send path', () => {
  for (const watchdogEnabled of [false, true]) {
    for (const [index, tool] of ['message_session', 'redirect_session'].entries()) {
      const id = watchdogEnabled ? `XC-DT-OFF-${tool}` : `XC-UC-03-M${index + 1}`
      it(`${id} Samuel messages a session directly with watchdog ${watchdogEnabled ? 'enabled but unregistered/not ready' : 'disabled'} — ${tool} reaches connector unchanged`, async (t) => {
        const h = await bootChild(t, { activate: true, watchdogEnabled })
        h.requireInstance()
        const before = h.host.requests.length
        const result = await h.tool(tool, U18.send)
        assert.equal(result.ok, true)
        const operation = tool === 'message_session' ? 'session.message' : 'session.redirect'
        assert.deepEqual(h.host.requests.slice(before).map(({ operation, payload }) => ({ operation, payload })), [{
          operation,
          payload: { sessionId: U18.send.session_id, message: U18.send.message },
        }], 'effective-off passes the existing connector payload without rewriting it')
      })
    }
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
it.todo('XC-UC-01-E2 Samuel keeps healthy capabilities when async setup fails — [owner: X0-C] freeze async completion/rejection policy at create/resume/live, log rejected callback once, isolate healthy registration, no disposed contribution leak; no invented await timing')
it.todo('XC-UC-02-E3 Samuel retries after durable queue acceptance lost its receipt — [owners: X0-C/FB-PUSH/X-E2E] reconcile the persisted stable identity against durable queue after rebuild, deliver once; current fake agent has no durable queue ledger')
it.todo('XC-UC-02-E4 Samuel recovers from notification reservation persistence failure — [owner: X0-C] freeze safe store-fault fixture; no accepted success without persistence, recovery retries one stable identity')
it.todo('XC-UC-02-A4 Samuel continues after a quiet notice survived rebuild — [owners: X0-C/X-E2E] durable hold acceptance/recovery adds text once to next user turn, never an independent wake')
it.todo('XC-UC-03-F Samuel keeps working after watchdog failure — [owners: X0-S/X0-A/X0-I/WD-13] immediate whole-plugin Fishball handover, release claims, pass both send paths, no halt/stop, one durable retryable notice')
it.todo('XC-UC-05-M Samuel receives routed updates while controlling sessions over MCP — [owners: MCP-S3/K1/X0-C/X0-W/FB-PUSH] freeze typed local control/intake port names/shapes before W1; no second control API, route before durable queue/wake/ack; no invented transport interface')

/** All U18 observations stay at supplied services, agent queue and connector wire boundaries. */
async function inboxPort(t) {
  const h = await bootChild(t, { activate: true, watchdogEnabled: false })
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

describe('X0-C U18/U20 images service sends with watchdog effectively off', () => {
  for (const watchdogEnabled of [false, true]) {
    for (const [index, attachments] of [[], undefined].entries()) {
      const id = watchdogEnabled ? `XC-DT-OFF-IMAGES-${index + 1}` : `XC-UC-03-A${index + 1}`
      it(`${id} Samuel sends through images.message with watchdog ${watchdogEnabled ? 'enabled but unregistered/not ready' : 'disabled'} — ${attachments === undefined ? 'omitted' : 'empty'} attachments preserve exact wire text and delivered result`, async (t) => {
        const h = await bootChild(t, { activate: true, watchdogEnabled })
        h.requireInstance()
        const images = h.ctx.get('fishballImages')
        assert.equal(typeof images?.message, 'function', 'fishballImages.message is missing')
        const request = { ...U18.imageSend, ...(attachments === undefined ? {} : { attachments }) }
        const original = structuredClone(request)
        const before = h.host.requests.length
        const result = await images.message(request)
        assert.deepEqual(h.host.requests.slice(before).map(({ operation, payload }) => ({ operation, payload })), [{ operation: 'session.message', payload: { ...U18.imageSend, attachments: [] } }])
        assert.deepEqual(result, { status: 'delivered' })
        assert.deepEqual(request, original)
      })
    }
  }

  it('XC-DT-02 images.message returns unconfirmed unchanged and never retries or creates a watch', async (t) => {
    const h = await bootChild(t, { activate: true, watchdogEnabled: false })
    h.requireInstance()
    const images = h.ctx.get('fishballImages')
    assert.equal(typeof images?.message, 'function')
    h.host.responses.set('session.message', { status: 'unconfirmed' })
    const before = h.host.requests.length
    assert.deepEqual(await images.message({ ...U18.imageSend, attachments: [] }), { status: 'unconfirmed' })
    assert.deepEqual(h.host.requests.slice(before).map(({ operation, payload }) => ({ operation, payload })), [{ operation: 'session.message', payload: { ...U18.imageSend, attachments: [] } }])
  })

  it('XC-EP-IMAGE-01 images.message rejects a connector refusal rather than fabricating success', async (t) => {
    const h = await bootChild(t, { activate: true, watchdogEnabled: false })
    h.requireInstance()
    const images = h.ctx.get('fishballImages')
    assert.equal(typeof images?.message, 'function')
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

it.todo('XC-UC-04-A1 Samuel receives images in item/image order — [owner: X0-I/FN-6 image integration] valid attachment.read/model fixture; image preparation failure queues no partial turn; W0 skipImages validates metadata and proves no fetch')
