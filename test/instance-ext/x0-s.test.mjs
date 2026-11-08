/**
 * W0 / X0-S — supervision, the start rule and the send gate (X14, X16, X19).
 *
 * Observation points: the `fishballInstance.supervision` and `.sessionStarts` services, the
 * `start_session` / `message_session` / `redirect_session` tools the child registers, the fake
 * main host's request log (a refused send reaches no connector request), the manager's turns and
 * the child's own persisted supervision file.
 *
 * Techniques: DT (the gate and the start rule), ST (the brief state machine), EP, BVA, P.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { writeFile } from 'node:fs/promises'
import { bootChild, filesContaining, messageText } from '../support/instance-ext.mjs'
import { loadInstance } from '../support/body-soul-env.mjs'

const OWNER = 'fishball-watchdog'
const SID = 'session-managed-1'
const BRIEF = 'brief-1'
const GATE_REFUSALS = ['watchdog-brief-required', 'watchdog-unavailable', 'supervision-paused', 'store-unavailable']

async function live(t, options) {
  const h = await bootChild(t, { activate: true, ...options })
  return { h, service: h.requireInstance() }
}

async function register(h, pluginId = OWNER) {
  const service = h.requireInstance()
  return service.supervision.register(pluginId)
}

/** The public send paths: both tools, and the one request path the image sends use too. */
async function sendTool(h, name = 'message_session', sid = SID) {
  return h.tool(name, { session_id: sid, message: 'hello' })
}

async function sendBridge(h, sid = SID) {
  try {
    await h.bridge.request('session.message', { sessionId: sid, message: 'image send', attachments: [] })
    return { ok: true }
  } catch (error) {
    return { ok: false, code: error?.code }
  }
}

const sentTo = (h, sid = SID) => h.host.requests.filter((request) => request.operation === 'session.message' && request.payload.sessionId === sid)

describe('X0-S X14 supervision state', () => {
  it('XS-P-01 register returns set, clear, handedOver and dispose', async (t) => {
    const { h } = await live(t)
    const reg = await register(h)
    for (const member of ['set', 'clear', 'dispose']) assert.equal(typeof reg[member], 'function', 'supervision.register().' + member)
    assert.ok(reg.handedOver !== undefined, 'handedOver is exposed')
    reg.dispose()
  })

  it('XS-ST-01 none → active → paused → active → halted; each state gates a send', async (t) => {
    const { h } = await live(t)
    const reg = await register(h)
    assert.deepEqual((await sendTool(h)).code, 'watchdog-brief-required', 'gate on with no state: no active brief')
    reg.set(SID, 'active', BRIEF)
    assert.equal((await sendTool(h)).ok, true, 'active is sendable')
    reg.set(SID, 'paused', BRIEF)
    assert.deepEqual((await sendTool(h)).code, 'supervision-paused')
    reg.set(SID, 'active', BRIEF)
    assert.equal((await sendTool(h)).ok, true, 'resume unlocks the send')
    reg.set(SID, 'halted', BRIEF)
    assert.deepEqual((await sendTool(h)).code, 'supervision-paused')
    reg.dispose()
  })

  it('XS-ST-02 clear removes the entry; onManagedChange reports release and take-back', async (t) => {
    const { h, service } = await live(t)
    const changes = []
    service.supervision.onManagedChange((change) => changes.push(change))
    const reg = await register(h)
    reg.set(SID, 'active', BRIEF)
    reg.clear(SID)
    assert.deepEqual((await sendTool(h)).code, 'watchdog-brief-required', 'a cleared session has no active brief')
    assert.equal(changes.length, 1)
    assert.equal(changes[0].sessionId, SID)
    assert.equal(changes[0].managed, false)
    reg.dispose()
  })

  it('XS-P-02 endingReason is hand-over or failure, undefined while registered', async (t) => {
    const { h, service } = await live(t)
    assert.equal(service.supervision.endingReason(), undefined, 'no registrant yet')
    const reg = await register(h)
    assert.equal(service.supervision.endingReason(), undefined, 'registered')
    reg.dispose()
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(service.supervision.endingReason(), 'failure', 'a disposal without the user intent is plugin-gone')
  })
})

describe('X0-S X14 hand-over and re-enable (§2.4)', () => {
  async function handOver(h, reg) {
    const op = h.rows.admin.ADMIN_OPERATION
    const snapshot = await h.admin(op.pluginsGet, {})
    assert.equal(snapshot.ok, true)
    const disabled = await h.admin(op.pluginDisable, { name: OWNER, inventoryRevision: snapshot.result.inventoryRevision })
    assert.equal(disabled.ok, true, JSON.stringify(disabled))
    reg.dispose()
    await new Promise((resolve) => setTimeout(resolve, 20))
    return disabled
  }

  it('XS-ST-03 the user disable hands the sessions over: gate off, one notice, no stop', async (t) => {
    const { h } = await live(t)
    const reg = await register(h)
    reg.set(SID, 'paused', BRIEF)
    const noticesBefore = h.manager().followups.length
    await handOver(h, reg)
    assert.equal(h.host.requests.some((request) => request.operation === 'session.stop'), false, 'hand-over stops nothing')
    assert.equal((await sendTool(h)).ok, true, 'the gate is off after hand-over')
    const notices = h.manager().followups.slice(noticesBefore).map(messageText).join('\n')
    assert.match(notices, new RegExp(SID), 'one notice lists the handed-over session')
    assert.match(notices, /paused/, 'the notice carries the state')
    assert.equal(h.manager().followups.length - noticesBefore, 1, 'exactly one notice')
    assert.equal(reg.handedOver.length, 1, 'the entry moved to handedOver')
  })

  it('XS-ST-04 re-enable makes the kept briefs dormant; sends refuse until resumed', async (t) => {
    const { h } = await live(t)
    const first = await register(h)
    first.set(SID, 'paused', BRIEF)
    await handOver(h, first)
    const noticesBefore = h.manager().followups.length
    const second = await register(h)
    await new Promise((resolve) => setTimeout(resolve, 20))
    const refused = await sendTool(h)
    assert.deepEqual(refused.code, 'watchdog-brief-required', 'a dormant brief has no active brief')
    assert.equal(refused.briefId, BRIEF, 'the result names the dormant brief')
    const notices = h.manager().followups.slice(noticesBefore).map(messageText).join('\n')
    assert.match(notices, /watchdog_resume/, 'the notice tells Fishball how to resume')
    assert.equal(h.host.requests.some((request) => request.operation === 'session.stop'), false, 're-enable stops nothing')
    second.set(SID, 'active', BRIEF)
    assert.equal((await sendTool(h)).ok, true, 'watchdog_resume unlocks the send')
    second.dispose()
  })

  it('XS-DT-01 disposals: intent → hand-over; no intent → the grace guard', async (t) => {
    const { h, service } = await live(t)
    t.mock.timers.enable({ apis: ['setTimeout'] })
    h.host.sessions.push({ sessionId: SID, title: 'managed', workspaceId: null, running: true, pendingInteraction: false })
    const reg = await register(h)
    reg.set(SID, 'active', BRIEF)
    reg.dispose()
    assert.equal(service.supervision.endingReason(), 'failure')
    assert.deepEqual((await sendTool(h)).code, 'watchdog-unavailable', 'gateOn stays true without a registrant')
    await t.mock.timers.tickAsync(30_000)
    assert.ok(h.host.requests.some((request) => request.operation === 'session.stop'), 'the guard stops a running managed session')
    t.mock.timers.reset()
  })

  it('XS-BVA-01 re-register at 29 s cancels the guard; 30 s and 31 s fire it', async (t) => {
    for (const [seconds, stopped] of [[29, false], [30, true], [31, true]]) {
      const { h } = await live(t)
      t.mock.timers.enable({ apis: ['setTimeout'] })
      h.host.sessions.push({ sessionId: SID, title: 'managed', workspaceId: null, running: true, pendingInteraction: false })
      const reg = await register(h)
      reg.set(SID, 'active', BRIEF)
      reg.dispose()
      if (seconds === 29) await register(h)
      await t.mock.timers.tickAsync(seconds * 1000)
      assert.equal(h.host.requests.some((request) => request.operation === 'session.stop'), stopped, seconds + 's')
      t.mock.timers.reset()
      await h.close()
    }
  })
})

describe('X0-S X16 start rule (§2.3)', () => {
  function owner(overrides = {}) {
    return {
      parameter: { type: 'json', description: 'the required watchdog brief', required: true },
      schema: { type: 'object', properties: { goal: { type: 'string' } }, required: ['goal'] },
      validate: (arg) => (typeof arg?.goal === 'string' && arg.goal !== '' ? { ok: true } : { code: 'invalid-brief:goal' }),
      attach: async () => ({ ok: true, briefId: BRIEF }),
      ...overrides,
    }
  }

  it('XS-DT-02 the start_session schema gains a required watchdog parameter only while an owner is registered', async (t) => {
    const { h } = await live(t)
    assert.equal(h.tools.get('start_session').parameters.watchdog, undefined, 'v1 schema before an owner')
    const dispose = h.requireInstance().sessionStarts.register(OWNER, owner())
    const withOwner = h.tools.get('start_session')
    assert.ok(withOwner.parameters.watchdog, 'one more parameter')
    assert.equal(withOwner.parameters.watchdog.required, true, 'and it is required')
    dispose()
    assert.equal(h.tools.get('start_session').parameters.watchdog, undefined, 'removed again on dispose')
  })

  it('XS-DT-03 a missing watchdog argument is refused before any session starts', async (t) => {
    const { h } = await live(t)
    h.requireInstance().sessionStarts.register(OWNER, owner())
    const result = await h.tool('start_session', { folder: '/tmp/work', title: 't', message: 'm' })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'watchdog-brief-required')
    assert.equal(h.host.requests.some((request) => request.operation === 'session.start'), false, 'no session started')
  })

  it('XS-DT-04 an invalid watchdog argument returns the owner validate code and starts nothing', async (t) => {
    const { h } = await live(t)
    h.requireInstance().sessionStarts.register(OWNER, owner())
    const result = await h.tool('start_session', { folder: '/tmp/work', title: 't', message: 'm', watchdog: { goal: '' } })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'invalid-brief:goal')
    assert.equal(h.host.requests.some((request) => request.operation === 'session.start'), false)
  })

  it('XS-DT-05 valid + start ok + attach ok returns the brief and is sendable at once', async (t) => {
    const { h } = await live(t)
    let attached
    h.requireInstance().sessionStarts.register(OWNER, owner({ attach: async (sessionId, arg) => { attached = { sessionId, arg }; return { ok: true, briefId: BRIEF } } }))
    const result = await h.tool('start_session', { folder: '/tmp/work', title: 't', message: 'm', watchdog: { goal: 'watch it' } })
    assert.equal(result.ok, true)
    assert.equal(result.sessionId, 'session-from-start')
    assert.deepEqual(result.watchdog, { briefId: BRIEF })
    assert.equal(attached.sessionId, 'session-from-start')
    assert.deepEqual(attached.arg, { goal: 'watch it' })
    assert.equal((await sendTool(h, 'message_session', 'session-from-start')).ok, true, 'supervision.set(active) already ran')
  })

  it('XS-DT-06 attach failed → watchdog-assign-failed and the session is stopped', async (t) => {
    const { h } = await live(t)
    h.requireInstance().sessionStarts.register(OWNER, owner({ attach: async () => ({ ok: false, code: 'store-unavailable' }) }))
    const result = await h.tool('start_session', { folder: '/tmp/work', title: 't', message: 'm', watchdog: { goal: 'x' } })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'watchdog-assign-failed')
    assert.equal(result.sessionId, 'session-from-start')
    assert.equal(result.stopped, true)
    assert.ok(h.host.requests.some((request) => request.operation === 'session.stop'), 'the coupling rule stops it')
  })

  it('XS-DT-07 attach failed and stop failed → stopped:false, the session stays managed', async (t) => {
    const { h } = await live(t)
    h.requireInstance().sessionStarts.register(OWNER, owner({ attach: async () => ({ ok: false, code: 'store-unavailable' }) }))
    h.host.fail.add('session.stop')
    const result = await h.tool('start_session', { folder: '/tmp/work', title: 't', message: 'm', watchdog: { goal: 'x' } })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'watchdog-assign-failed')
    assert.equal(result.stopped, false)
    assert.equal(result.sessionId, 'session-from-start')
  })

  it('XS-DT-08 attach timeout → watchdog-assign-failed and a stop attempt', async (t) => {
    const { h } = await live(t)
    h.requireInstance().sessionStarts.register(OWNER, owner({ attach: () => new Promise(() => {}) }))
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const pending = h.tool('start_session', { folder: '/tmp/work', title: 't', message: 'm', watchdog: { goal: 'x' } })
    await t.mock.timers.tickAsync(30_001)
    const result = await pending
    assert.equal(result.ok, false)
    assert.equal(result.code, 'watchdog-assign-failed')
    assert.ok(h.host.requests.some((request) => request.operation === 'session.stop'))
    t.mock.timers.reset()
  })

  it('XS-DT-09 a failed start answers as today and attaches nothing', async (t) => {
    const { h } = await live(t)
    let attached = false
    h.requireInstance().sessionStarts.register(OWNER, owner({ attach: async () => { attached = true; return { ok: true, briefId: BRIEF } } }))
    h.host.fail.add('session.start')
    const result = await h.tool('start_session', { folder: '/tmp/work', title: 't', message: 'm', watchdog: { goal: 'x' } })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'operation-failed')
    assert.equal(attached, false)
    assert.equal(h.host.requests.some((request) => request.operation === 'session.stop'), false)
  })

  it('XS-P-03 SESSION_STARTS.attachTimeoutMs is the bridge request timeout, 30 s', async (t) => {
    const module = await loadInstance('src/slim/child/ext/session-starts.js')
    assert.equal(module.SESSION_STARTS.attachTimeoutMs, 30_000)
  })
})

describe('X0-S X19 send gate (§2.5)', () => {
  it('XS-DT-10 the gate table: gate × brief state → send result', async (t) => {
    const { h, service } = await live(t)
    // Off from the start: no registrant, no gateOn.
    assert.equal((await sendTool(h)).ok, true, 'off → allowed')
    assert.equal((await sendTool(h, 'redirect_session')).ok, true, 'redirect is a send operation too')

    const reg = service.supervision.register(OWNER)
    assert.deepEqual((await sendTool(h)).code, 'watchdog-brief-required', 'on, no brief')
    reg.set(SID, 'active', BRIEF)
    assert.equal((await sendTool(h)).ok, true, 'on, active')
    reg.set(SID, 'paused', BRIEF)
    assert.deepEqual((await sendTool(h)).code, 'supervision-paused', 'on, paused')
    reg.set(SID, 'halted', BRIEF)
    assert.deepEqual((await sendTool(h)).code, 'supervision-paused', 'on, halted')
    reg.set(SID, 'dormant', BRIEF)
    const dormant = await sendTool(h)
    assert.deepEqual(dormant.code, 'watchdog-brief-required', 'on, dormant')
    assert.equal(dormant.briefId, BRIEF)
    reg.dispose()
  })

  it('XS-DT-11 gateOn true with no registrant refuses watchdog-unavailable', async (t) => {
    const { h, service } = await live(t)
    const reg = service.supervision.register(OWNER)
    reg.set(SID, 'active', BRIEF)
    reg.dispose()
    const result = await sendTool(h)
    assert.deepEqual(result.code, 'watchdog-unavailable')
  })

  it('XS-DT-12 each refused send reaches no connector request', async (t) => {
    const { h, service } = await live(t)
    const reg = service.supervision.register(OWNER)
    reg.set(SID, 'paused', BRIEF)
    const before = h.host.requests.length
    await sendTool(h)
    await sendTool(h, 'redirect_session')
    await sendBridge(h)
    assert.equal(h.host.requests.length, before, 'nothing left the child')
  })

  it('XS-DT-13 the image path goes through the same gate', async (t) => {
    const { h, service } = await live(t)
    const reg = service.supervision.register(OWNER)
    reg.set(SID, 'paused', BRIEF)
    assert.deepEqual((await sendBridge(h)).code, 'supervision-paused')
    reg.set(SID, 'active', BRIEF)
    assert.equal((await sendBridge(h)).ok, true)
  })

  it('XS-EP-01 the not-gated actions pass with the gate on and no brief', async (t) => {
    const { h, service } = await live(t)
    const reg = service.supervision.register(OWNER)
    reg.set(SID, 'active', BRIEF)
    reg.clear(SID) // gate stays on, no brief for SID
    const calls = [
      ['list_sessions', {}],
      ['read_session', { session_id: SID }],
      ['watch_session', { session_id: SID }],
      ['list_watches', {}],
      ['unwatch_session', { watch_id: 'watch-1' }],
      ['answer_approval', { session_id: SID, approval_id: 'a1', offer_id: 'o1', decision: 'allow', reason: 'ok' }],
      ['answer_question', { session_id: SID, question_id: 'q1', answers: [{ id: 'q1', selected: ['yes'] }] }],
      ['answer_prompt', { session_id: SID, prompt_id: 'p1', decision: 'allow', reason: 'ok' }],
      ['ask_user', { questions: [{ question: 'which?' }] }],
      ['list_grants', {}],
      ['revoke_grant', { grant_id: 'g1', reason: 'done' }],
      ['release_session', { session_id: SID, reason: 'done' }],
      ['stop_session', { session_id: SID }],
    ]
    for (const [name, args] of calls) {
      const result = await h.tool(name, args)
      assert.notEqual(GATE_REFUSALS.includes(result?.code), true, name + ' must not be gated, got ' + result?.code)
    }
  })

  it('XS-DT-14 the hand-over line is prepended to user and session items without an active brief', async (t) => {
    const { h, service } = await live(t)
    service.supervision.register(OWNER)
    const before = h.manager().followups.length
    const ack = await h.host.inbox({ kind: 'user', text: 'the user handed this over', sourceSessionId: SID })
    assert.equal(ack.payload?.acked, true)
    assert.equal(h.manager().followups.length, before + 1, 'the item still queues its turn')
    const turn = messageText(h.manager().followups.at(-1))
    assert.match(turn, /watchdog_brief/)
    assert.match(turn, new RegExp(SID))
    const ackAgain = await h.host.inbox({ kind: 'session', text: 'a message from the session', sourceSessionId: SID })
    assert.equal(ackAgain.payload?.acked, true)
    assert.match(messageText(h.manager().followups.at(-1)), /watchdog_brief/)
  })

  it('XS-DT-15 the hand-over line is absent with an active brief, with the gate off, and on other kinds', async (t) => {
    const { h, service } = await live(t)
    assert.equal((await h.host.inbox({ kind: 'user', text: 'gate off', sourceSessionId: SID })).payload?.acked, true)
    assert.doesNotMatch(messageText(h.manager().followups.at(-1)), /watchdog_brief/, 'gate off')
    const reg = service.supervision.register(OWNER)
    reg.set(SID, 'active', BRIEF)
    await h.host.inbox({ kind: 'user', text: 'active brief', sourceSessionId: SID })
    assert.doesNotMatch(messageText(h.manager().followups.at(-1)), /watchdog_brief/, 'active brief')
    reg.clear(SID)
    for (const kind of ['watch', 'system', 'approval']) {
      await h.host.inbox({ kind, text: 'a ' + kind + ' item', sourceSessionId: SID })
      assert.doesNotMatch(messageText(h.manager().followups.at(-1)), /watchdog_brief/, kind + ' item')
    }
  })

  it('XS-ST-05 the per-session state machine gates one send at every state', async (t) => {
    const { h, service } = await live(t)
    const reg = service.supervision.register(OWNER)
    assert.deepEqual((await sendTool(h)).code, 'watchdog-brief-required', 'no brief')
    reg.set(SID, 'active', BRIEF)
    assert.equal((await sendTool(h)).ok, true, 'active after watchdog_brief')
    reg.set(SID, 'paused', BRIEF)
    assert.deepEqual((await sendTool(h)).code, 'supervision-paused', 'paused')
    reg.set(SID, 'active', BRIEF)
    assert.equal((await sendTool(h)).ok, true, 'resumed')
    reg.set(SID, 'dormant', BRIEF)
    assert.deepEqual((await sendTool(h)).code, 'watchdog-brief-required', 'dormant')
    reg.set(SID, 'active', BRIEF)
    assert.equal((await sendTool(h)).ok, true, 'watchdog_resume unlocks it')
    reg.dispose()
  })

  it('XS-BVA-02 a send immediately after set(active) is allowed, after set(paused) refused', async (t) => {
    const { h, service } = await live(t)
    const reg = service.supervision.register(OWNER)
    reg.set(SID, 'active', BRIEF)
    assert.equal((await sendTool(h)).ok, true)
    reg.set(SID, 'paused', BRIEF)
    assert.deepEqual((await sendTool(h)).code, 'supervision-paused')
    reg.dispose()
  })

  it('XS-BVA-03 gateOn absent is off; true is on; false is the hand-over; corrupt refuses store-unavailable', async (t) => {
    // Absent: no registrant.
    const first = await live(t)
    assert.equal((await sendTool(first.h)).ok, true, 'absent gateOn = v1 behaviour')
    // True: a registrant sets it.
    const second = await live(t)
    second.service.supervision.register(OWNER)
    assert.deepEqual((await sendTool(second.h)).code, 'watchdog-brief-required', 'true gateOn')
    // False: the user disable writes it.
    const third = await live(t)
    const reg = third.service.supervision.register(OWNER)
    reg.set(SID, 'paused', BRIEF)
    const op = third.h.rows.admin.ADMIN_OPERATION
    const snapshot = await third.h.admin(op.pluginsGet, {})
    await third.h.admin(op.pluginDisable, { name: OWNER, inventoryRevision: snapshot.result.inventoryRevision })
    reg.dispose()
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal((await sendTool(third.h)).ok, true, 'false gateOn allows sends')
    // Corrupt: locate the documented supervision file and break it.
    const files = await filesContaining(third.h.home, '"gateOn"')
    assert.equal(files.length >= 1, true, 'the supervision file records gateOn')
    await writeFile(files[0], '{not json')
    await third.h.close()
    const fourth = await bootChild(t, { activate: true, home: third.h.home })
    const result = await sendTool(fourth)
    assert.deepEqual(result.code, 'store-unavailable', 'a corrupt store refuses sends')
    await fourth.close()
  })
})
