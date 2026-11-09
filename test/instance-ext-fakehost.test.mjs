/**
 * Independent fake-host contract regressions; expectations come from installed SDK declarations,
 * not the fixture implementation or product code. Run once per FBTEST_DSH_RUNTIME.
 *
 * SDK sources on both supported hosts:
 * - dsh-agent/lib/types/runtime-types.d.ts: followup owns next-turn; inject owns next-step/no wake.
 * - dsh-agent-loop/lib/types/inbox.d.ts: claim returns next-step before one queued next-turn.
 * - dsh-session/lib/types/types.d.ts: turn/start precedes claim; readers flush before storage reads.
 * - dsh-session/lib/types/index.d.ts: immutable messages, real plugin records, append reentrancy.
 *
 * h.driveTurn() is a deliberately model-free admission boundary, not evidence of a model reply.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bootChild } from './support/instance-ext.mjs'
import { resolveOfficialSDK } from './support/provider-sync-sdk.mjs'

resolveOfficialSDK()
const { appendPluginRecord } = await import('@deepseek-ai/dsh-session')

const CASE = Object.freeze({
  count: Object.freeze({ none: 0, one: 1 }),
  source: Object.freeze({ kind: 'user' }),
  role: 'user',
  block: 'text',
  contextId: 'fakehost-context-identity',
  promptId: 'fakehost-followup-identity',
  originalText: 'identified model-facing fixture input',
  changedText: 'caller mutation after acceptance',
  event: Object.freeze({
    splice: 'agent/inbox/spliced',
    start: 'turn/start',
    end: 'turn/end',
    user: 'user/message',
    assistant: 'assistant/message',
    attempt: 'assistant/attempt',
    request: 'llm/request',
  }),
  target: Object.freeze({ turn: 'next-turn', step: 'next-step' }),
  record: Object.freeze({ outer: 'plugin:fakehost/outer', nested: 'plugin:fakehost/nested', payload: Object.freeze({ accepted: true }) }),
})

const message = (id) => ({ id, role: CASE.role, content: [{ type: CASE.block, text: CASE.originalText }], source: { ...CASE.source } })
const ids = (messages) => messages.map(({ id }) => id)
const events = (agent) => agent.session.snapshotEvents()
const userMessages = (agent) => events(agent).filter(({ type }) => type === CASE.event.user).map(({ data }) => data)
const turnStarts = (agent) => events(agent).filter(({ type }) => type === CASE.event.start)
const modelEvents = (agent) => events(agent).filter(({ type }) => [CASE.event.assistant, CASE.event.attempt, CASE.event.request].includes(type))

describe('Independent fake host follows SDK input and session contracts', () => {
  it('FH-DT-01 followup wakes next-turn while inject remains next-step context; admission preserves identities without a fake model', async (t) => {
    const h = await bootChild(t, { activate: true })
    const agent = h.manager()
    const context = message(CASE.contextId)
    const prompt = message(CASE.promptId)
    const original = structuredClone([context, prompt])
    const startsBefore = turnStarts(agent).length
    agent.inject(context)
    assert.deepEqual(ids(agent.inbox.nextStep), [CASE.contextId])
    assert.deepEqual(agent.inbox.nextTurn, [])
    assert.equal(turnStarts(agent).length, startsBefore, 'idle inject never opens a turn')
    agent.followup(prompt)
    context.content[CASE.count.none].text = CASE.changedText
    prompt.content[CASE.count.none].text = CASE.changedText
    const claimed = await h.driveTurn(agent)
    assert.deepEqual(claimed, original, 'context precedes the ordinary followup, with accepted identity/source/content')
    assert.deepEqual(agent.inbox.nextStep, [])
    assert.deepEqual(agent.inbox.nextTurn, [])
    assert.deepEqual(userMessages(agent).slice(-original.length), original)
    assert.deepEqual(modelEvents(agent), [], 'admission does not fabricate assistant output or call a provider')
  })

  it('FH-ST-02 turn/start is observable before pending input is claimed, and claim precedes user-message admission', async (t) => {
    const h = await bootChild(t, { activate: true })
    const agent = h.manager()
    const observed = []
    const remove = h.ctx.on('session/event', (session, event) => {
      if (session !== agent.session) return
      observed.push({ type: event.type, nextStep: ids(agent.inbox.nextStep), nextTurn: ids(agent.inbox.nextTurn) })
    })
    t.after(remove)
    agent.inject(message(CASE.contextId))
    agent.followup(message(CASE.promptId))
    await h.driveTurn(agent)
    const start = observed.findIndex(({ type }) => type === CASE.event.start)
    const admitted = observed.findIndex(({ type }) => type === CASE.event.user)
    const end = observed.findIndex(({ type }) => type === CASE.event.end)
    assert.ok(start >= CASE.count.none)
    assert.deepEqual(observed[start].nextStep, [CASE.contextId])
    assert.deepEqual(observed[start].nextTurn, [CASE.promptId])
    assert.ok(admitted > start, 'user-message admission belongs to the already open turn')
    assert.ok(end > admitted)
    assert.deepEqual(observed[admitted].nextStep, [])
    assert.deepEqual(observed[admitted].nextTurn, [])
  })

  it('FH-ST-03 explicit SDK flush snapshot survives a simulated crash before disposal with pending context and committed message identity', async (t) => {
    let sessionLogs = new Map()
    const first = await bootChild(t, { activate: true, sessionLogs })
    const context = message(CASE.contextId)
    const firstAgent = first.manager()
    firstAgent.inject(context)
    await first.ctx.sessions.flush(firstAgent.session)
    const durable = structuredClone(sessionLogs.get(firstAgent.id))
    assert.ok(Array.isArray(durable), 'flush makes the fixture persistence seed available')
    assert.ok(durable.some(({ type, data }) => type === CASE.event.splice && data.target === CASE.target.step && data.inserted.some(({ id }) => id === CASE.contextId)))
    // SDK orderly disposal cancels pending work. Replay the independently retained flush image
    // instead: this models a crash after that checkpoint, not a successful graceful shutdown.
    const crashCheckpoint = structuredClone(sessionLogs)
    await first.close()
    sessionLogs = crashCheckpoint
    const restarted = await bootChild(t, { home: first.home, activate: true, sessionLogs })
    const agent = restarted.manager()
    assert.equal(agent.id, firstAgent.id)
    assert.deepEqual(agent.inbox.nextStep, [context], 'resume reconstructs pending context rather than losing it')
    assert.deepEqual(agent.inbox.nextTurn, [])
    agent.followup(message(CASE.promptId))
    await restarted.driveTurn(agent)
    await restarted.ctx.sessions.flush(agent.session)
    const committed = sessionLogs.get(agent.id).filter(({ type }) => type === CASE.event.user).map(({ data }) => data)
    assert.deepEqual(ids(committed), [CASE.contextId, CASE.promptId])
    assert.deepEqual(modelEvents(agent), [])
  })

  it('FH-EP-04 real SDK plugin records are accepted, but a reentrant observer append is refused without corrupting the log', async (t) => {
    const h = await bootChild(t, { activate: true })
    const agent = h.manager()
    const session = agent.session
    const before = events(agent)
    let nestedError
    let outerObserved = CASE.count.none
    const remove = h.ctx.on('session/event', (subject, event) => {
      if (subject !== session || event.type !== CASE.record.outer) return
      outerObserved += CASE.count.one
      try { appendPluginRecord(session, CASE.record.nested, CASE.record.payload) } catch (error) { nestedError = error }
    })
    t.after(remove)
    appendPluginRecord(session, CASE.record.outer, CASE.record.payload)
    const appended = events(agent).slice(before.length)
    assert.equal(outerObserved, CASE.count.one)
    assert.ok(nestedError instanceof Error, 'live SDK Session rejects append publication reentrancy')
    assert.equal(appended.length, CASE.count.one)
    assert.equal(appended[CASE.count.none].type, CASE.record.outer)
    assert.equal(appended[CASE.count.none].ignorable, true)
    assert.deepEqual(appended[CASE.count.none].data, CASE.record.payload)
    assert.deepEqual(events(agent).slice(CASE.count.none, before.length), before)
    assert.deepEqual(modelEvents(agent), [])
  })

  it('FH-DT-05 next-step input joins the open turn while another followup owns its own ordinary turn', async (t) => {
    const value = Object.freeze({ secondPromptId: 'fakehost-second-followup', first: 0, second: 1 })
    const h = await bootChild(t, { activate: true })
    const agent = h.manager()
    const startsBefore = turnStarts(agent).length
    const usersBefore = userMessages(agent).length
    agent.followup(message(CASE.promptId))
    agent.inject(message(CASE.contextId))
    agent.followup(message(value.secondPromptId))
    await h.driveTurn(agent)
    const admitted = events(agent)
    let turn
    const owners = new Map()
    for (const event of admitted) {
      if (event.type === CASE.event.start) turn = event.data.turn
      if (event.type === CASE.event.user) owners.set(event.data.id, turn)
    }
    const starts = turnStarts(agent).slice(startsBefore)
    assert.equal(starts.length, value.second + CASE.count.one)
    assert.equal(owners.get(CASE.contextId), starts[value.first].data.turn)
    assert.equal(owners.get(CASE.promptId), starts[value.first].data.turn)
    assert.equal(owners.get(value.secondPromptId), starts[value.second].data.turn)
    assert.deepEqual(ids(userMessages(agent).slice(usersBefore)), [CASE.promptId, CASE.contextId, value.secondPromptId])
    assert.deepEqual(agent.inbox.nextStep, [])
    assert.deepEqual(agent.inbox.nextTurn, [])
    assert.deepEqual(modelEvents(agent), [])
  })

  it('FH-ST-06 cancelling an active turn before admission removes pending input without a user message or fake model reply', async (t) => {
    const value = Object.freeze({ cause: Object.freeze({ kind: 'user' }), aborted: 'aborted', canceled: 'canceled', secondPromptId: 'fakehost-canceled-followup' })
    const h = await bootChild(t, { activate: true })
    const agent = h.manager()
    const usersBefore = userMessages(agent)
    // SDK followup claims its first batch synchronously, then yields before admission.
    // Input arriving after that claim is still pending and must be durably canceled.
    agent.followup(message(CASE.promptId))
    agent.inject(message(CASE.contextId))
    agent.followup(message(value.secondPromptId))
    agent.cancel(value.cause)
    await h.driveTurn(agent)
    assert.deepEqual(agent.inbox.nextStep, [])
    assert.deepEqual(agent.inbox.nextTurn, [])
    assert.deepEqual(userMessages(agent), usersBefore)
    const canceled = events(agent).filter(({ type, data }) => type === CASE.event.splice && data.outcome === value.canceled)
    assert.deepEqual(canceled.map(({ data }) => data.target), [CASE.target.step, CASE.target.turn])
    assert.equal(events(agent).filter(({ type }) => type === CASE.event.end).at(-CASE.count.one).data.reason.kind, value.aborted)
    assert.deepEqual(modelEvents(agent), [])
  })

  it('FH-ST-07 async setup gates Agent publication and create resolution on both SDK versions', async (t) => {
    const value = Object.freeze({ sessionId: 'fakehost-gated-setup' })
    const h = await bootChild(t, { activate: true })
    const entered = Promise.withResolvers()
    const released = Promise.withResolvers()
    let settled = false
    const creating = h.ctx.get('agents').create({
      sessionId: value.sessionId,
      async setup() {
        entered.resolve()
        await released.promise
      },
    })
    creating.then(() => { settled = true }, () => { settled = true })
    t.after(() => released.resolve())
    await entered.promise
    // rc.1 announces Session before setup, unlike rc.5; only the common Agent gate is asserted.
    assert.equal(h.ctx.get('agents').get(value.sessionId), undefined)
    assert.equal(settled, false)
    released.resolve()
    const handle = await creating
    assert.equal(h.ctx.get('agents').get(value.sessionId), handle.agent)
    assert.equal(handle.agent.id, value.sessionId)
    assert.deepEqual(modelEvents(handle.agent), [])
  })

  it('FH-ST-08 orderly published-agent disposal persists pending cancellation rather than crash-replaying it', async (t) => {
    const value = Object.freeze({ canceled: 'canceled' })
    const sessionLogs = new Map()
    const first = await bootChild(t, { activate: true, sessionLogs })
    const agent = first.manager()
    agent.inject(message(CASE.contextId))
    await first.ctx.sessions.flush(agent.session)
    await first.close()
    const saved = sessionLogs.get(agent.id)
    const cancellation = saved.filter(({ type, data }) => type === CASE.event.splice && data.outcome === value.canceled)
    assert.equal(cancellation.length, CASE.count.one)
    assert.equal(cancellation[CASE.count.none].data.target, CASE.target.step)
    const restarted = await bootChild(t, { home: first.home, activate: true, sessionLogs })
    assert.deepEqual(restarted.manager().inbox.nextStep, [])
    assert.deepEqual(restarted.manager().inbox.nextTurn, [])
    assert.deepEqual(userMessages(restarted.manager()), [])
    assert.deepEqual(modelEvents(restarted.manager()), [])
  })
})
