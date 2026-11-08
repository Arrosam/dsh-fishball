/**
 * W0 / X0-C — the `fishballInstance` service, the manager, the chat projector and the manager
 * channel (X1–X3, X10, X11 of docs/plugins/instance-extension-points.md).
 *
 * Observation points: the service the child app row provides, the manager agent's own
 * tool/prompt registrations, `GET /api/chat` over the child's HTTP surface, and the turns the
 * manager agent is queued. No child module is imported for the expectations.
 *
 * Techniques: P (positive), EP (equivalence partitions), DT (decision table), ST (state
 * transitions), BVA (boundary values). Every case names its X point.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bootChild, messageSource, messageText } from '../support/instance-ext.mjs'
import { loadInstance } from '../support/body-soul-env.mjs'

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
  it('XC-P-01 the app row provides fishballInstance apiVersion 1 with every member', async (t) => {
    const h = await bootChild(t)
    const service = h.requireInstance()
    assert.equal(service.apiVersion, 1)
    for (const member of ['manager', 'chat', 'inbox', 'ui', 'attention', 'bridge', 'sideAgents', 'approvals', 'supervision', 'sessionStarts']) {
      assert.ok(service[member] !== undefined, 'fishballInstance.' + member + ' is missing (X1–X16)')
    }
  })

  it('XC-P-02 a registration returns dispose, and a second dispose is a no-op', async (t) => {
    const { h, service } = await live(t)
    const dispose = service.manager.registerSetup(MANAGER, () => {})
    assert.equal(typeof dispose, 'function', 'X2 registerSetup must return dispose')
    dispose()
    dispose()
    assert.equal(h.manager().followups.length, 0, 'a dispose must not queue a turn')
  })

  it('XC-P-03 a throwing X3 projector is logged once per plugin and point and never breaks the chat', async (t) => {
    const { h, service } = await live(t)
    const warnsBefore = h.logs.filter((entry) => entry.level === 'warn').length
    service.chat.registerRecordProjector(MANAGER, 'plugin:fishball-fold-notify/notice', () => {
      throw new Error('projector boom')
    })
    append(h, 'plugin:fishball-fold-notify/notice', { n: 1 })
    append(h, 'plugin:fishball-fold-notify/notice', { n: 2 })
    const page = await h.http('/api/chat')
    assert.equal(page.status, 200, 'the chat page must survive a throwing projector')
    const warnsAfter = h.logs.filter((entry) => entry.level === 'warn').length
    assert.equal(warnsAfter - warnsBefore, 1, 'one log line per (pluginId, point), not per record')
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
  it('XC-DT-01 create: a registration made before the live Session is applied after the persona, in order', async (t) => {
    const h = await bootChild(t, { activate: false })
    const service = h.requireInstance()
    service.manager.registerSetup(MANAGER, (agentCtx) => {
      agentCtx.tools.register({ name: 'fold_notice', description: 'fold' })
      agentCtx.systemPrompt.section({ name: 'fold-section', order: 10, text: 'fold text' })
    })
    await h.http('/api/chat')
    const { ctx } = h.agentCtxs()[0]
    assert.ok(ctx.tools.names().includes('fold_notice'), 'the tool registered on create')
    assert.ok(ctx.sections.has('fold-section'), 'the section registered on create')
    assert.equal(ctx.order.at(-1), 'fold-section', 'registrations run after the persona')
  })

  it('XC-DT-02 resume: the same registration is applied again on agents.resume', async (t) => {
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

  it('XC-DT-03 live: a registration made while the agent is live is applied at once', async (t) => {
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

  it('XC-DT-04 a throwing registration is logged and skipped; a later one still applies', async (t) => {
    const h = await bootChild(t, { activate: false })
    const service = h.requireInstance()
    service.manager.registerSetup(MANAGER, () => { throw new Error('setup boom') })
    service.manager.registerSetup('fishball-board', (agentCtx) => {
      agentCtx.tools.register({ name: 'board_after_throw', description: 'board' })
    })
    await h.http('/api/chat')
    assert.ok(h.agentCtxs()[0].ctx.tools.names().includes('board_after_throw'))
    assert.ok(h.logs.some((entry) => entry.level === 'warn'), 'the throw was logged')
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

  it('XC-ST-02 a registration made during a turn is on the live agent before the next step', async (t) => {
    const { h, service } = await live(t)
    const { ctx } = h.agentCtxs()[0]
    service.manager.registerSetup(MANAGER, (agentCtx) => {
      agentCtx.tools.register({ name: 'fold_midturn', description: 'mid-turn' })
    })
    assert.ok(ctx.tools.names().includes('fold_midturn'), 'SP-X1: visible to the step after the tool result')
  })
})

describe('X0-C X3 chat.registerRecordProjector', () => {
  const TYPE = 'plugin:fishball-fold-notify/notice'

  it('XC-P-04 a projected record becomes a plugin entry with its data', async (t) => {
    const { h, service } = await live(t)
    const data = { n: 7, text: 'fold notice' }
    service.chat.registerRecordProjector(MANAGER, TYPE, (value) => ({ id: 'fold-7', at: 1_700_000_000_700, data: value }))
    append(h, TYPE, data)
    const body = await (await h.http('/api/chat')).json()
    const entry = body.entries.find((candidate) => candidate.kind === 'plugin')
    assert.deepEqual(entry, {
      id: 'fold-7',
      kind: 'plugin',
      plugin: MANAGER,
      at: 1_700_000_000_700,
      data,
    })
  })

  it('XC-EP-03 a type with a foreign prefix is refused and projected by nobody', async (t) => {
    const { h, service } = await live(t)
    service.chat.registerRecordProjector(MANAGER, 'plugin:other-plugin/notice', (value) => ({ id: 'foreign', at: 1, data: value }))
    append(h, 'plugin:other-plugin/notice', { n: 1 })
    const body = await (await h.http('/api/chat')).json()
    assert.equal(body.entries.some((entry) => entry.kind === 'plugin'), false)
  })

  it('XC-EP-04 a projector returning undefined drops the record', async (t) => {
    const { h, service } = await live(t)
    service.chat.registerRecordProjector(MANAGER, TYPE, () => undefined)
    append(h, TYPE, { n: 1 })
    const body = await (await h.http('/api/chat')).json()
    assert.equal(body.entries.some((entry) => entry.kind === 'plugin'), false)
  })

  it('XC-EP-05 text is optional on the projected entry', async (t) => {
    const { h, service } = await live(t)
    service.chat.registerRecordProjector(MANAGER, TYPE, (value) => ({ id: 'no-text', at: 1, data: value }))
    append(h, TYPE, { n: 1 })
    const body = await (await h.http('/api/chat')).json()
    const entry = body.entries.find((candidate) => candidate.kind === 'plugin')
    assert.equal(Object.hasOwn(entry, 'text'), false, 'no text when the projector gives none')
    service.chat.registerRecordProjector('fishball-board', 'plugin:fishball-board/notice', (value) => ({ id: 'with-text', at: 2, data: value, text: 'shown as a plain row' }))
    append(h, 'plugin:fishball-board/notice', { n: 2 })
    const again = await (await h.http('/api/chat')).json()
    const withText = again.entries.find((entry) => entry.id === 'with-text')
    assert.equal(withText.text, 'shown as a plain row')
  })

  it('XC-BVA-01 the record text is capped at EXT_LIMITS.recordTextChars (8000)', async (t) => {
    const { h, service } = await live(t)
    const module = await loadInstance('src/slim/child/extensions.js')
    assert.equal(module.EXT_LIMITS.recordTextChars, 8000, 'the design names 8000 as the cap')
    for (const [name, size] of [['at-cap', 8000], ['over-cap', 8001]]) {
      service.chat.registerRecordProjector(MANAGER, 'plugin:fishball-fold-notify/' + name, (value) => ({ id: name, at: 1, data: value, text: 'x'.repeat(size) }))
      append(h, 'plugin:fishball-fold-notify/' + name, {})
    }
    const body = await (await h.http('/api/chat')).json()
    for (const name of ['at-cap', 'over-cap']) {
      const entry = body.entries.find((candidate) => candidate.id === name)
      assert.ok(entry.text.length <= 8000, name + ' is at most the cap, got ' + entry.text.length)
    }
  })

  it('XC-ST-03 a disposed projector no longer projects', async (t) => {
    const { h, service } = await live(t)
    const dispose = service.chat.registerRecordProjector(MANAGER, TYPE, (value) => ({ id: 'once', at: 1, data: value }))
    append(h, TYPE, { n: 1 })
    assert.equal((await (await h.http('/api/chat')).json()).entries.some((entry) => entry.kind === 'plugin'), true)
    dispose()
    append(h, TYPE, { n: 2 })
    const body = await (await h.http('/api/chat')).json()
    assert.equal(body.entries.filter((entry) => entry.kind === 'plugin').length, 1, 'only the pre-dispose record')
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

  it('XC-DT-05 wake:true is one notice turn with the plugin source', async (t) => {
    const { h, service } = await live(t)
    const result = await notify(service)
    assert.equal(result.status ?? result, 'queued')
    const queued = h.lastFollowup()
    assert.ok(queued, 'one turn was queued')
    assert.match(messageText(queued), /a watchdog notice/)
    assert.deepEqual(messageSource(queued), { kind: 'fishball-notice', form: 'plugin', pluginId: 'fishball-watchdog' })
    assert.equal(h.manager().followups.length, 1)
  })

  it('XC-DT-06 wake:false is held and joins the next turn', async (t) => {
    const { h, service } = await live(t)
    const result = await notify(service, { wake: false, text: 'held notice' })
    assert.equal(result.status ?? result, 'held')
    assert.equal(h.manager().followups.length, 0, 'it starts no turn of its own')
    await h.http('/api/chat', { method: 'POST', body: { text: 'next user turn' } })
    const queued = h.manager().followups.map(messageText).join('\n')
    assert.match(queued, /held notice/, 'the held notice is in the next turn')
  })

  it('XC-DT-07 a duplicate dedupeKey is answered duplicate and starts no second turn', async (t) => {
    const { h, service } = await live(t)
    const first = await notify(service, { dedupeKey: 'same-key' })
    const second = await notify(service, { dedupeKey: 'same-key', text: 'again' })
    assert.equal(first.status ?? first, 'queued')
    assert.equal(second.status ?? second, 'duplicate')
    assert.equal(h.manager().followups.length, 1, 'the duplicate never woke the manager')
    assert.doesNotMatch(h.manager().followups.map(messageText).join('\n'), /again/)
  })

  it('XC-DT-08 wake:true queues whether the manager is idle or busy', async (t) => {
    const { h, service } = await live(t)
    const idle = await notify(service, { dedupeKey: 'idle' })
    assert.equal(idle.status ?? idle, 'queued')
    h.manager().status = 'running'
    const busy = await notify(service, { dedupeKey: 'busy', text: 'while busy' })
    assert.equal(busy.status ?? busy, 'queued')
    assert.equal(h.manager().followups.length, 2)
  })
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

  it('XC-P-05 userTexts returns only user-written texts, newest first', async (t) => {
    const { h, service } = await live(t)
    logMessages(h)
    const texts = service.manager.userTexts({ limit: 10, maxChars: 100 })
    assert.deepEqual(texts.map((item) => item.text), ['newest', 'middle', 'oldest'])
    assert.ok(texts.every((item) => Number.isFinite(item.at)))
  })

  it('XC-BVA-02 limit 0, 1, max and max+1', async (t) => {
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
