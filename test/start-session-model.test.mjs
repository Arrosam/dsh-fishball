/**
 * Requirement-derived real-host tests (no production selection/messaging source inspected).
 * EP: valid/unknown/malformed routes, unsupported or model-specific efforts, absent options.
 * BVA: empty versus first nonempty route/effort; first/last dynamically ordered effort.
 * DT: model x effort x notify; catalog/resolve/apply/flush outcomes x creation state.
 * ST: validate -> create -> select -> flush -> first message -> multiple requests -> cold resume;
 *     validation refusal leaves cap untouched; created failures consume it, are audited, and never watched.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { T, HOOK, turn, toolSchema, watchesOn, outboxNow } from './support/expect.mjs'
import { FAKE, NEEDS_INSTANCE_STUB } from './support/constants.mjs'
import { selectionHost, START_MODEL as C, route } from './support/start-session-model.mjs'

const selection = (model = C.models.analysis, effort) => ({ model: route(model), ...(effort === undefined ? {} : { reasoning_effort: effort }) })
const requested = async (w, sid) => (await w.events()).filter(event => event.type === 'request' && event.sessionId === sid && !event.purpose)

describe('start_session model: integrated real throwaway DSH host', { skip: NEEDS_INSTANCE_STUB }, () => {
  let w
  before(async () => { w = await selectionHost('start-model-system') }, HOOK)
  after(async () => { await w?.stop() }, HOOK)
  it('SSM-01 schema retains legacy required fields and exposes only optional model/effort additions; no set_session_model tool', T, async () => {
    const response = await turn(w.host, w.fb)
    const request = response.requests.at(-1)
    const schema = toolSchema(request, 'start_session')
    assert.deepEqual(Object.keys(schema.properties).sort(), ['folder', 'message', 'model', 'notify_when_finished', 'reasoning_effort', 'title'])
    assert.deepEqual([...schema.required].sort(), ['folder', 'message', 'title'])
    for (const key of ['model', 'reasoning_effort']) assert.equal(schema.properties[key].type, 'string')
    assert.equal(schema.properties.notify_when_finished.type, 'boolean')
    assert.equal(request.tools.some(item => item.name === 'set_session_model'), false)
    const unchanged = toolSchema(request, 'message_session')
    assert.deepEqual(Object.keys(unchanged.properties).sort(), ['message', 'notify_when_finished', 'session_id'])
  })
  it('SSM-02 DT neither option: exact legacy result, global route, no catalog/resolve/local selection required', T, async () => {
    const before = await w.snapshots()
    await w.arm({ catalog: true })
    try {
      const answer = await w.start()
      const sid = await w.assertSuccess(answer, { model: FAKE.model, selected: false })
      assert.equal((await w.events()).some(item => item.type === 'catalog'), false, 'legacy path must not require model discovery')
      assert.equal((await w.events()).some(item => item.type === 'select' && item.sessionId === sid), false)
      await w.noMutation(before)
    } finally { await w.disarm() }
  })
  for (const effort of [C.effort.first, C.effort.last]) {
    it('SSM-03 BVA first/last effort ' + effort + ': first and later requests use chosen full provider/model and effort', T, async () => {
      const before = await w.snapshots()
      await w.arm()
      try {
        const message = C.text.message + effort
        await w.host.call('queueMarker', { marker: message, except: w.fb, script: [[{ tool: 'demo_echo', args: { text: message } }], [{ text: C.text.reply }]] })
        const answer = await w.start({ ...selection(C.models.analysis, effort), message })
        const sid = await w.assertSuccess(answer, { model: C.models.analysis, effort })
        assert.ok((await requested(w, sid)).length >= 2, 'target first turn has multiple model requests')
        await turn(w.host, sid)
        for (const request of await requested(w, sid)) { assert.equal(request.model, C.models.analysis); assert.equal(request.reasoningEffort, effort) }
        await w.noMutation(before)
        assert.equal((await w.events()).some(item => item.type === 'default-save'), false, 'not even transient default saves')
      } finally { await w.disarm() }
    })
  }
  it('SSM-04 DT model only: adapter default effort materializes in requests; selected result preserves omission', T, async () => {
    const before = await w.snapshots()
    await w.arm()
    try {
      const answer = await w.start(selection())
      await w.assertSuccess(answer, { model: C.models.analysis, effort: C.effort.default, selectedEffort: null })
      await w.noMutation(before)
    } finally { await w.disarm() }
  })
  it('SSM-05 DT model without reasoning: valid alone, request has no effort', T, async () => {
    await w.arm()
    try { await w.assertSuccess(await w.start(selection(C.models.plain)), { model: C.models.plain }) } finally { await w.disarm() }
  })
  it('SSM-06 DT model plus effort plus notify: watch is retained on successful start', T, async () => {
    await w.arm()
    try {
      const answer = await w.start({ ...selection(C.models.fast, C.effort.wrongModel), notify_when_finished: true })
      const sid = await w.assertSuccess(answer, { model: C.models.fast, effort: C.effort.wrongModel })
      assert.ok(answer.json.watch?.id, answer.result?.text)
      assert.ok((await watchesOn(w.host, sid)).length)
    } finally { await w.disarm() }
  })
  it('SSM-07 isolation: explicit dedicated Fishball model remains unchanged; new ordinary sessions still use DSH default', T, async () => {
    const dedicated = await w.host.post(C.api.select, { provider: FAKE.provider, model: w.dedicatedModel })
    assert.equal(dedicated.json?.ok, true, dedicated.text)
    const before = await w.snapshots()
    await w.arm()
    try {
      await w.assertSuccess(await w.start(selection()), { model: C.models.analysis, effort: C.effort.default, selectedEffort: null })
      const ordinary = await w.host.call('ordinary', { folder: 'selection-control' })
      await turn(w.host, ordinary.sessionId)
      assert.equal((await requested(w, ordinary.sessionId)).at(-1).model, FAKE.model)
      assert.equal((await requested(w, w.fb)).at(-1).model, w.dedicatedModel)
      await w.noMutation(before)
    } finally { await w.disarm() }
  })
  it('SSM-08 dynamic catalog choices include new opaque effort without universal enum', T, async () => {
    await w.probe('dynamic', { on: true })
    await w.arm()
    try {
      await w.failedBeforeCreate(selection(C.models.analysis, 'not-an-effort'), C.error.effort, 'availableReasoningEfforts', C.efforts.dynamic)
      await w.assertSuccess(await w.start(selection(C.models.analysis, C.effort.dynamic)), { model: C.models.analysis, effort: C.effort.dynamic })
    } finally { await w.disarm(); await w.probe('dynamic', { on: false }) }
  })
  it('SSM-09 ST durable selection survives genuine host stop/start and first request after cold resume', T, async () => {
    await w.arm()
    const answer = await w.start(selection(C.models.analysis, C.effort.last))
    const sid = await w.assertSuccess(answer, { model: C.models.analysis, effort: C.effort.last })
    const before = await w.snapshots()
    const home = w.home
    await w.disarm(); await w.stop()
    w = await selectionHost('start-model-resume', { home })
    assert.equal(await w.host.call('agentStatus', { sessionId: sid }), null, 'precondition: target really is cold')
    assert.equal((await w.host.call('resume', { sessionId: sid })).error, null)
    await w.arm()
    try {
      await turn(w.host, sid)
      const requests = await requested(w, sid)
      assert.ok(requests.length)
      assert.equal(requests[0].provider, C.provider); assert.equal(requests[0].model, C.models.analysis); assert.equal(requests[0].reasoningEffort, C.effort.last)
      await w.noMutation(before)
    } finally { await w.disarm() }
  })
})

describe('start_session model: validation EP/BVA and dynamic error choices', { skip: NEEDS_INSTANCE_STUB }, () => {
  let w
  before(async () => { w = await selectionHost('start-model-invalid', { limits: { sessionsPerHour: 1 } }) }, HOOK)
  after(async () => { await w?.stop() }, HOOK)
  for (const [label, model] of [['empty', ''], ['blank', ' '], ['missing provider', '/' + C.models.analysis], ['missing model', C.provider + '/'], ['bare id', C.models.fast], ['unknown provider', 'unknown-provider/model'], ['unknown model', route('unavailable-model')]]) {
    it('SSM-10 EP/BVA invalid route ' + label + ' rejected with dynamic full-model choices', T, async () => {
      await w.arm()
      try {
        const catalog = await w.probe('catalog')
        const choices = catalog.groups.flatMap(group => group.models.map(model => group.id + '/' + model.id))
        await w.failedBeforeCreate({ model }, C.error.model, 'availableModels', choices)
      } finally { await w.disarm() }
    })
  }
  for (const [label, model, effort, choices] of [['empty', C.models.analysis, '', C.efforts.analysis], ['blank', C.models.analysis, ' ', C.efforts.analysis], ['case mismatch', C.models.analysis, 'SKIM', C.efforts.analysis], ['another model effort', C.models.analysis, C.effort.wrongModel, C.efforts.analysis], ['effort on nonreasoning model', C.models.plain, C.effort.first, []]]) {
    it('SSM-11 EP/BVA effort ' + label + ' uses only chosen model choices', T, async () => {
      await w.arm()
      try { await w.failedBeforeCreate(selection(model, effort), C.error.effort, 'availableReasoningEfforts', choices) } finally { await w.disarm() }
    })
  }
  it('SSM-12 DT effort alone always requires explicit model, never the DSH or Fishball default', T, async () => {
    await w.arm()
    try { await w.failedBeforeCreate({ reasoning_effort: C.effort.first }, C.error.required) } finally { await w.disarm() }
  })
  for (const [key, value] of [['model', null], ['model', 1], ['model', {}], ['reasoning_effort', null], ['reasoning_effort', false], ['reasoning_effort', []]]) {
    it('SSM-13 EP non-string ' + key + ' ' + JSON.stringify(value) + ' rejected without side effects', T, async () => {
      const before = { sessions: await w.created(), state: await w.snapshots(), outbox: await outboxNow(w.host) }
      const answer = await w.start({ ...selection(), [key]: value })
      assert.ok(answer.result?.isError || answer.json?.ok === false, answer.result?.text)
      assert.deepEqual(await w.created(), before.sessions); assert.deepEqual(await outboxNow(w.host), before.outbox); await w.noMutation(before.state)
    })
  }
  it('SSM-14 ST validation refusals consume zero hourly slots; a first valid start still succeeds', T, async () => {
    await w.arm()
    try { await w.assertSuccess(await w.start(selection()), { model: C.models.analysis, effort: C.effort.default, selectedEffort: null }) } finally { await w.disarm() }
  })
})

describe('start_session model: host failure decision table and created-failure hourly accounting', { skip: NEEDS_INSTANCE_STUB }, () => {
  let w
  before(async () => { w = await selectionHost('start-model-failures', { limits: { sessionsPerHour: 3 } }) }, HOOK)
  after(async () => { await w?.stop() }, HOOK)
  for (const boundary of ['catalog', 'resolve']) {
    it('SSM-20 EP ' + boundary + ' rejection: clear error, no target creation/message/watch/default changes', T, async () => {
      await w.arm({ [boundary]: true })
      try { await w.failedBeforeCreate(selection(), C.error.unavailable) } finally { await w.disarm() }
    })
  }
  for (const [label, substitute] of [['model', { model: C.models.fast }], ['provider', { provider: FAKE.provider }], ['explicit effort', { reasoningEffort: C.effort.last }]]) {
    it('SSM-20b DT adapter silently substitutes ' + label + ': fail closed instead of accepting fallback', T, async () => {
      await w.arm({ substitute })
      try { await w.failedBeforeCreate(selection(C.models.analysis, C.effort.first), C.error.unavailable) } finally { await w.disarm() }
    })
  }
  for (const [label, fault] of [['apply rejects', { selection: true }], ['selection flush rejects', { flush: 'throw' }], ['selection flush false', { flush: 'false' }]]) {
    it('SSM-21 DT ' + label + ': return created sessionId, no first message, failed audit, no watch; slot consumed', T, async () => {
      const before = await w.snapshots()
      await w.arm(fault)
      try {
        const answer = await w.start({ ...selection(), notify_when_finished: true })
        await w.assertFailedCreated(answer)
        await w.noMutation(before)
      } finally { await w.disarm() }
    })
  }
  it('SSM-22 BVA cap 3/3: all created-but-failed starts counted; fourth is refused before creating target', T, async () => {
    await w.arm()
    try { await w.failedBeforeCreate(selection(), C.error.cap) } finally { await w.disarm() }
  })
})

describe('start_session model: published-creation external wake race', { skip: NEEDS_INSTANCE_STUB }, () => {
  let w
  before(async () => { w = await selectionHost('start-model-wake-race') }, HOOK)
  after(async () => { await w?.stop() }, HOOK)
  it('SSM-23 ST created target independently wakes before selection: refuse with identity, never send Fishball message or install watch', T, async () => {
    await w.arm({ externalWake: true })
    try {
      const before = await w.snapshots()
      const answer = await w.start({ ...selection(), notify_when_finished: true })
      assert.equal(answer.json?.ok, false, answer.result?.text)
      assert.equal(answer.json.code, C.error.selection, answer.result?.text)
      const sid = answer.json.sessionId
      assert.ok(sid); await w.wait(sid)
      const messages = await w.host.call('userMessages', { sessionId: sid })
      assert.equal(messages.some(item => item.text === answer.call.message), false, 'cannot send our first message after losing initial-idle claim')
      assert.ok(messages.some(item => item.text === C.text.external), 'independent external message is not erased')
      assert.deepEqual(await watchesOn(w.host, sid), [])
      const audit = (await outboxNow(w.host)).find(item => item.targetSessionId === sid)
      assert.equal(audit?.status, 'failed')
      await w.noMutation(before)
    } finally { await w.disarm() }
  })
})
