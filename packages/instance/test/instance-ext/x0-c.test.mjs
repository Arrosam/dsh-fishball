/**
 * W0 / X0-C — the `fishballInstance` service, manager and manager channel
 * (X1, X2, X10, X11; final design §5.1/§5.5/§12.5, U18).
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

  it('XC-DT-01 durable key is observable before the agent queue accepts a waking turn — injected queue failure cannot erase it', async (t) => {
    const key = 'persist-before-queue'
    const queueFailure = new Error('injected agent queue failure')
    let queueCalls = 0
    let persistedAtQueue
    let queueLengthAtInjection
    const h = await bootChild(t, { activate: true, onFollowup(message, agent) {
      queueCalls += 1
      persistedAtQueue = readFileSync(path.join(h.home, U18.notifyFile), 'utf8')
      queueLengthAtInjection = agent.followups.length
      throw queueFailure
    } })
    const service = h.requireInstance()
    // Queue failure propagation is unspecified; the persisted key and absence of a turn are not.
    await notify(service, { dedupeKey: key }).catch(() => {})
    assert.equal(queueCalls, 1, 'injection ran at the real agent followup port')
    assert.equal(queueLengthAtInjection, 0)
    assert.ok(persistedAtQueue?.includes(JSON.stringify(key)), 'the key was on disk before any queue side effect')
    assert.equal(h.manager().followups.length, 0)
    assert.equal(await notifyStatus(service, { dedupeKey: key }), 'duplicate')
    assert.equal(queueCalls, 1, 'retry never reaches the failed queue port again')
  })

  // Three-value BVA around the specified durable key retention cap, using only public notify.
  for (const count of [U18.notifyKeys - 1, U18.notifyKeys, U18.notifyKeys + 1]) {
    it(`XC-BVA-KEYS-${count} newest-key retention at ${count} accepted notices — file and reloaded duplicate behavior agree`, async (t) => {
      const h = await bootChild(t, { activate: true })
      const service = h.requireInstance()
      const keys = Array.from({ length: count }, (_, index) => 'cap-key-' + index)
      for (const dedupeKey of keys) assert.equal(await notifyStatus(service, { dedupeKey }), 'queued')
      assert.equal(h.manager().followups.length, count)
      const file = await readFile(path.join(h.home, U18.notifyFile), 'utf8')
      const lines = file.trimEnd().split('\n')
      assert.equal(lines.length, Math.min(count, U18.notifyKeys), 'file contains only the newest 10000 keys')
      for (const line of lines) assert.doesNotThrow(() => JSON.parse(line), 'store remains valid JSONL')
      const kept = keys.slice(-U18.notifyKeys)
      const firstKept = JSON.stringify(kept[0])
      const newest = JSON.stringify(keys.at(-1))
      assert.ok(file.includes(firstKept))
      assert.ok(file.includes(newest))
      if (count > U18.notifyKeys) assert.equal(file.includes(JSON.stringify(keys[0])), false, 'oldest key is evicted, not newest')
      await h.close()
      const reloaded = await bootChild(t, { home: h.home, activate: true, sessionLogs: h.sessionLogs })
      const fresh = reloaded.requireInstance()
      for (const dedupeKey of [kept[0], keys.at(-1)]) assert.equal(await notifyStatus(fresh, { dedupeKey }), 'duplicate')
      assert.equal(reloaded.manager().followups.length, 0)
      if (count > U18.notifyKeys) {
        assert.equal(await notifyStatus(fresh, { dedupeKey: keys[0] }), 'queued', 'evicted key can notify again after restart')
        assert.equal(reloaded.manager().followups.length, 1)
        assert.equal((await readFile(path.join(h.home, U18.notifyFile), 'utf8')).trimEnd().split('\n').length, U18.notifyKeys)
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

describe('X0-C U18 watchdog-disabled tool send path', () => {
  for (const [index, tool] of ['message_session', 'redirect_session'].entries()) {
    it(`XC-UC-03-M${index + 1} Samuel messages a session directly with watchdog disabled — ${tool} reaches connector unchanged`, async (t) => {
      const h = await bootChild(t, { activate: true, watchdogEnabled: false })
      h.requireInstance()
      const before = h.host.requests.length
      const result = await h.tool(tool, U18.send)
      assert.equal(result.ok, true)
      const operation = tool === 'message_session' ? 'session.message' : 'session.redirect'
      assert.deepEqual(h.host.requests.slice(before).map(({ operation, payload }) => ({ operation, payload })), [{
        operation,
        payload: { sessionId: U18.send.session_id, message: U18.send.message },
      }], 'watchdog-off passes the existing connector payload without rewriting it')
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

describe('X0-C U18 images service sends with watchdog disabled', () => {
  for (const [index, attachments] of [[], undefined].entries()) {
    it(`XC-UC-03-A${index + 1} Samuel sends through images.message without watchdog — ${attachments === undefined ? 'omitted' : 'empty'} attachments preserve exact wire text and delivered result`, async (t) => {
      const h = await bootChild(t, { activate: true, watchdogEnabled: false })
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
