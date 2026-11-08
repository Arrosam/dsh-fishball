/**
 * W0 / X0-C — the `fishballInstance` service, the manager, X3's reduced record-type rule and the
 * manager channel (X1, X2, X10, X11 and X3's type rule; §5.5 U10).
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
import { bootChild, messageSource, messageText } from '../../../../test/support/instance-ext.mjs'

const MANAGER = 'fishball-fold-notify'

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
  it('XC-EP-V-01 the app row provides fishballInstance apiVersion 1 with every member', async (t) => {
    const h = await bootChild(t)
    const service = h.requireInstance()
    assert.equal(service.apiVersion, 1)
    for (const member of ['manager', 'chat', 'inbox', 'ui', 'attention', 'bridge', 'sideAgents', 'approvals', 'supervision', 'sessionStarts']) {
      assert.ok(service[member] !== undefined, 'fishballInstance.' + member + ' is missing (X1–X16)')
    }
  })

  it('XC-EP-V-02 a registration returns dispose, and a second dispose is a no-op', async (t) => {
    const { h, service } = await live(t)
    const dispose = service.manager.registerSetup(MANAGER, () => {})
    assert.equal(typeof dispose, 'function', 'X2 registerSetup must return dispose')
    dispose()
    dispose()
    assert.equal(h.manager().followups.length, 0, 'a dispose must not queue a turn')
  })


  it('XC-EP-01 fishballChat stays internal: the plugin-facing service is fishballInstance', async (t) => {
    const h = await bootChild(t)
    assert.equal(h.ctx.get('fishballChat') !== undefined, true, 'the app row keeps its internal port')
    assert.equal(typeof h.requireInstance, 'function')
    assert.equal(h.requireInstance().apiVersion, 1)
    assert.equal(h.requireInstance().chat !== undefined, true, 'the chat point is a member, not the internal port')
    assert.equal(h.requireInstance().chat === h.ctx.get('fishballChat'), false, 'the service must not expose fishballChat itself')
  })

  it('XC-EP-02 X1 reports the manager Session id, not another agent id', async (t) => {
    const { h, service } = await live(t)
    const managerId = h.manager().id
    assert.equal(service.manager.sessionId(), managerId)
    assert.equal(typeof service.manager.sessionId(), 'string')
    assert.notEqual(service.manager.sessionId(), 'session-another-agent')
  })
})

describe('X0-C X2 manager.registerSetup', () => {
  it('XC-UC-01-M create: a registration made before the live Session is applied after the persona, in order', async (t) => {
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

  it('XC-UC-01-A1 resume: the same registration is applied again on agents.resume', async (t) => {
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

  it('XC-UC-01-A2 live: a registration made while the agent is live is applied at once', async (t) => {
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

  it('XC-UC-01-E1 a throwing registration is logged and skipped; a later one still applies', async (t) => {
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

  it('XC-ST-01 registered → applied → disposed → registered again', async (t) => {
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

  it('XC-UC-01-A3 registration is immediately visible on a fixture manager marked running', async (t) => {
    const { h, service } = await live(t)
    const { ctx } = h.agentCtxs()[0]
    h.manager().status = 'running'
    service.manager.registerSetup(MANAGER, (agentCtx) => {
      agentCtx.tools.register({ name: 'fold_midturn', description: 'mid-turn' })
    })
    assert.ok(ctx.tools.names().includes('fold_midturn'), 'tool is installed in the running fixture scope; real next-request proof belongs to X-E2E')
  })
})

describe('X0-C X3 chat.registerRecordProjector', () => {
  const TYPE = 'plugin:fishball-fold-notify/notice'


  it('XC-EP-V-06 a type in the plugin\'s own prefix is accepted; dispose removes the registration', async (t) => {
    const { service } = await live(t)
    const dispose = service.chat.registerRecordProjector(MANAGER, 'plugin:fishball-fold-notify/notice', () => undefined)
    assert.equal(typeof dispose, 'function', 'X3 keeps only the record-type rule (U10)')
    dispose()
    dispose()
  })

  it('XC-EP-03 a type with a foreign plugin prefix is refused', async (t) => {
    const { service } = await live(t)
    let refused
    try {
      refused = service.chat.registerRecordProjector(MANAGER, 'plugin:other-plugin/notice', () => undefined)
    } catch (error) {
      refused = error
    }
    assert.notEqual(typeof refused, 'function', 'a foreign prefix is not accepted (the only X3 rule left, U10)')
    const dispose = service.chat.registerRecordProjector(MANAGER, 'plugin:fishball-fold-notify/notice', () => undefined)
    assert.equal(typeof dispose, 'function', 'a valid registration still works after the refusal')
    dispose()
  })




})

describe('X0-C X10 manager.notify', () => {
  const notify = (service, overrides = {}) => service.manager.notify({
    pluginId: 'fishball-watchdog',
    dedupeKey: 'wd-1',
    text: 'a watchdog notice',
    wake: true,
    ...overrides,
  })

  it('XC-UC-02-M wake:true is one notice turn with the plugin source', async (t) => {
    const { h, service } = await live(t)
    const result = await notify(service)
    assert.equal(result.status ?? result, 'queued')
    const queued = h.lastFollowup()
    assert.ok(queued, 'one turn was queued')
    assert.match(messageText(queued), /a watchdog notice/)
    assert.deepEqual(messageSource(queued), { kind: 'fishball-notice', form: 'plugin', pluginId: 'fishball-watchdog' })
    assert.equal(h.manager().followups.length, 1)
  })

  it('XC-UC-02-A1 wake:false is held and joins the next turn', async (t) => {
    const { h, service } = await live(t)
    const result = await notify(service, { wake: false, text: 'held notice' })
    assert.equal(result.status ?? result, 'held')
    assert.equal(h.manager().followups.length, 0, 'it starts no turn of its own')
    await h.http('/api/chat', { method: 'POST', body: { text: 'next user turn' } })
    const queued = h.manager().followups.map(messageText).join('\n')
    assert.match(queued, /held notice/, 'the held notice is in the next turn')
  })

  it('XC-UC-02-E1 a duplicate dedupeKey is answered duplicate and starts no second turn', async (t) => {
    const { h, service } = await live(t)
    const first = await notify(service, { dedupeKey: 'same-key' })
    const second = await notify(service, { dedupeKey: 'same-key', text: 'again' })
    assert.equal(first.status ?? first, 'queued')
    assert.equal(second.status ?? second, 'duplicate')
    assert.equal(h.manager().followups.length, 1, 'the duplicate never woke the manager')
    assert.doesNotMatch(h.manager().followups.map(messageText).join('\n'), /again/)
  })

  // One independent flow per manager state; share the actor action and acceptance checks.
  for (const state of ['idle', 'running']) {
    const flowId = state === 'idle' ? 'XC-UC-02-A2' : 'XC-UC-02-A3'
    it(`${flowId} X10 wake:true queues while manager is ${state}`, async (t) => {
      const { h, service } = await live(t)
      h.manager().status = state
      const result = await notify(service, { dedupeKey: state })
      assert.equal(result.status ?? result, 'queued')
      assert.equal(h.manager().followups.length, 1)
      assert.match(messageText(h.lastFollowup()), /a watchdog notice/)
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

  it('XC-EP-V-05 userTexts returns only user-written texts, newest first', async (t) => {
    const { h, service } = await live(t)
    logMessages(h)
    const texts = service.manager.userTexts({ limit: 10, maxChars: 100 })
    assert.deepEqual(texts.map((item) => item.text), ['newest', 'middle', 'oldest'])
    assert.ok(texts.every((item) => Number.isFinite(item.at)))
  })

  it('XC-BVA-02 limit 0, 1, available count 3 and count+1', async (t) => {
    const { h, service } = await live(t)
    logMessages(h)
    assert.deepEqual(service.manager.userTexts({ limit: 0, maxChars: 100 }), [])
    assert.deepEqual(service.manager.userTexts({ limit: 1, maxChars: 100 }).map((item) => item.text), ['newest'])
    assert.equal(service.manager.userTexts({ limit: 3, maxChars: 100 }).length, 3)
    assert.equal(service.manager.userTexts({ limit: 4, maxChars: 100 }).length, 3, 'a larger limit returns what exists')
  })

  it('XC-BVA-03 maxChars cuts at a surrogate pair without a lone surrogate', async (t) => {
    const { h, service } = await live(t)
    append(h, 'user/message', userMessage('pair', 'ab😀cd'))
    const [item] = service.manager.userTexts({ limit: 1, maxChars: 3 })
    assert.equal(item.text.isWellFormed?.(), true, 'no lone surrogate: ' + JSON.stringify(item.text))
    assert.ok(item.text.length <= 3)
  })
})

it.todo('XC-UC-01-A4 [owner: X-E2E] register during a real model turn, offer on next request, dispose and omit on following request')
it.todo('XC-UC-02-E2 [owner: X-E2E] restart the child and retry a durable dedupeKey without a second notice turn')
