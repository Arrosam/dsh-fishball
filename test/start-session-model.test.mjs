/**
 * session.start with a model and an effort (DESIGN §5d "Model and effort", docs/start-session-model-validation.md),
 * now over the bridge (H-STUB): the instance sends session.start {model?, reasoningEffort?} (contract §4.1)
 * instead of Fishball's in-process start_session tool. A real throwaway DSH host with the
 * start-session-model fixture (a network-free adapter `start-selection-probe` and probes on the official
 * host boundaries); no production source inspected.
 *
 * EP: valid / unknown / malformed routes, unsupported or model-specific efforts, absent options.
 * BVA: empty versus first non-empty route/effort; first/last dynamically ordered effort.
 * DT: model × effort × notify; catalog / resolve / apply / flush outcomes × creation state.
 * ST: validate → create → select → flush → first message → multiple requests → cold resume; a refusal
 *     before creation creates nothing; a created failure sends nothing and sets no watch.
 *
 * | id     | technique | expected |
 * |--------|-----------|----------|
 * | SSM-02 | DT (neither option) | the legacy path: started, every request on DSH's default model, no catalog lookup, no selection |
 * | SSM-03 ×2 | BVA (first / last effort) | the first and later requests use the chosen provider/model and effort; no default saved |
 * | SSM-04 | DT (model only) | the adapter's default effort is what requests carry; nothing pinned |
 * | SSM-05 | DT (model without reasoning) | valid alone; requests carry no effort |
 * | SSM-06 | DT (model + effort + notify) | started on the chosen route; watchId |
 * | SSM-07 | EP (isolation) | a new ordinary session still uses DSH's default |
 * | SSM-08 | EP (dynamic catalog) | a new opaque effort is accepted once the catalog lists it; an unknown one is refused before creation |
 * | SSM-09 | ST (stop → cold resume) | the selection survives a genuine host stop/start; the first request after the resume uses it |
 * | SSM-10 ×6 | EP/BVA (invalid route: blank, missing provider, missing model, bare id, unknown provider, unknown model) | refused before creation with an error frame; nothing created, defaults unchanged |
 * | SSM-10b | BVA (empty route) | `model` is non-empty (§4.1): the frame fails validation, the channel closes, nothing created |
 * | SSM-11 ×4 | EP/BVA (effort: blank, case mismatch, another model's, on a model without reasoning) | refused before creation |
 * | SSM-11b | BVA (empty effort) | `reasoningEffort` is non-empty: the channel closes, nothing created |
 * | SSM-12 | DT (effort alone) | refused before creation: an effort requires a model |
 * | SSM-13 ×6 | EP (non-string model / effort) | the frame fails validation: the channel closes, nothing created |
 * | SSM-20 ×2 | EP (catalog / resolve rejects) | refused before creation |
 * | SSM-20b ×3 | DT (adapter silently substitutes model / provider / effort) | refused before creation: fail closed |
 * | SSM-21 ×3 | DT (apply rejects, selection flush rejects / false) | refused; the created session got no first message, made no request, has no watch |
 * | SSM-23 | ST (the created target wakes on its own before selection) | refused; no first message from Fishball; the independent message stays; no watch |
 *
 * Retired:
 * - SSM-01: the start_session tool schema and the dedicated Fishball model went with the in-process agent (slim §12); the request shape is the contract's (§4.1), exercised in SSM-10b/11b/13.
 * - The availableModels / availableReasoningEfforts lists of SSM-08/10/11: an error frame carries exactly {code} (contract §3.1, §7), so the choices cannot travel; the refusal itself is kept.
 * - The exact old codes (invalid-model, invalid-reasoning-effort, model-required, model-unavailable, model-selection-failed): not in the contract's ERROR list (§7); each refusal is checked as an error frame with a contract code.
 * - SSM-14, SSM-22: sessionsPerHour went with the in-process agent (slim §12, conn-OQ-20).
 * - The outbox parts of SSM-02..SSM-23: the outbox went with Fishball's outbound tools (slim §12).
 * - The `selected` reply field: contract §4.1's reply has no such field; the selection is checked on the target's requests.
 * - SSM-07's dedicated Fishball model: the in-process Fishball's model selection is gone (slim §12).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ERROR } from 'fishball-connector/contract'
import { FAKE } from './support/constants.mjs'
import { T, turn } from './support/expect.mjs'
import { START_MODEL as C, route } from './support/start-session-model.mjs'
import { armedStart, assertModelStart, assertRefusedBeforeCreate, assertSelectionRefused, assertStarted, useModelHost, watchesOn } from './support/instance-stub-start.mjs'

const selection = (model = C.models.analysis, effort) => ({ model: route(model), ...(effort === undefined ? {} : { reasoningEffort: effort }) })

describe('session.start with a model: integrated real throwaway DSH host', () => {
  const w = useModelHost('g-ssm-system')

  it('SSM-02 DT neither option: the legacy path, DSH default route, no catalog lookup or selection', T, async () => {
    const before = await w.snapshots()
    const answer = await armedStart(w, {}, { catalog: true })
    const json = await assertStarted(w, answer)
    assert.equal(answer.events.some((e) => e.type === 'catalog'), false, 'the legacy path needs no model discovery')
    assert.equal(answer.events.some((e) => e.type === 'select' && e.sessionId === json.sessionId), false)
    await w.arm()
    try {
      await turn(w.host, json.sessionId)
      for (const r of await w.requests(json.sessionId)) assert.equal(r.model, FAKE.model)
    } finally { await w.disarm() }
    await w.noMutation(before)
  })

  for (const effort of [C.effort.first, C.effort.last]) {
    it('SSM-03 BVA effort ' + effort + ': the first and later requests use the chosen route and effort', T, async () => {
      const before = await w.snapshots()
      await w.arm()
      try {
        const message = C.text.message + ' ' + effort
        await w.host.call('queueMarker', { marker: message, script: [[{ tool: 'demo_echo', args: { text: message } }], [{ text: C.text.reply }]] })
        const json = await assertModelStart(w, await w.start({ ...selection(C.models.analysis, effort), message }), { model: C.models.analysis, effort })
        await turn(w.host, json.sessionId)
        const requests = await w.requests(json.sessionId)
        assert.ok(requests.length >= 2, 'several requests')
        for (const r of requests) { assert.equal(r.model, C.models.analysis); assert.equal(r.reasoningEffort, effort) }
        assert.equal((await w.events()).some((e) => e.type === 'default-save'), false, 'no default saved, not even for a moment')
      } finally { await w.disarm() }
      await w.noMutation(before)
    })
  }

  it("SSM-04 DT model only: the adapter's default effort is what requests carry", T, async () => {
    const before = await w.snapshots()
    await w.arm()
    try { await assertModelStart(w, await w.start(selection()), { model: C.models.analysis, effort: C.effort.default }) } finally { await w.disarm() }
    await w.noMutation(before)
  })

  it('SSM-05 DT a model without reasoning: valid alone, requests carry no effort', T, async () => {
    await w.arm()
    try { await assertModelStart(w, await w.start(selection(C.models.plain)), { model: C.models.plain }) } finally { await w.disarm() }
  })

  it('SSM-06 DT model, effort and notify: started on the chosen route, with a watch', T, async () => {
    await w.arm()
    try {
      const answer = await w.start({ ...selection(C.models.fast, C.effort.wrongModel), notifyWhenFinished: true })
      const json = await assertModelStart(w, answer, { model: C.models.fast, effort: C.effort.wrongModel })
      assert.equal(typeof json.watchId, 'string', JSON.stringify(json))
      assert.equal((await watchesOn(w, json.sessionId)).length, 1)
    } finally { await w.disarm() }
  })

  it("SSM-07 isolation: a new ordinary session still uses DSH's default", T, async () => {
    const before = await w.snapshots()
    await w.arm()
    try {
      await assertModelStart(w, await w.start(selection()), { model: C.models.analysis, effort: C.effort.default })
      const ordinary = await w.host.call('ordinary', { folder: 'selection-control' })
      await turn(w.host, ordinary.sessionId)
      assert.equal((await w.requests(ordinary.sessionId)).at(-1).model, FAKE.model)
    } finally { await w.disarm() }
    await w.noMutation(before)
  })

  it('SSM-08 a dynamic catalog effort is accepted once listed; an unknown one is refused', T, async () => {
    await w.probe('dynamic', { on: true })
    try {
      await assertRefusedBeforeCreate(w, selection(C.models.analysis, 'not-an-effort'))
      await w.arm()
      try { await assertModelStart(w, await w.start(selection(C.models.analysis, C.effort.dynamic)), { model: C.models.analysis, effort: C.effort.dynamic }) } finally { await w.disarm() }
    } finally { await w.probe('dynamic', { on: false }) }
  })

  it('SSM-09 ST the selection survives a genuine host stop/start and the first request after a cold resume', T, async () => {
    await w.arm()
    let json
    try { json = await assertModelStart(w, await w.start(selection(C.models.analysis, C.effort.last)), { model: C.models.analysis, effort: C.effort.last }) } finally { await w.disarm() }
    const before = await w.snapshots()
    await w.restart()
    assert.equal(await w.host.call('agentStatus', { sessionId: json.sessionId }), null, 'precondition: the target is cold')
    assert.equal((await w.host.call('resume', { sessionId: json.sessionId })).error, null)
    await w.arm()
    try {
      await turn(w.host, json.sessionId)
      const [first] = await w.requests(json.sessionId)
      assert.ok(first, 'a request after the resume')
      assert.deepEqual([first.provider, first.model, first.reasoningEffort], [C.provider, C.models.analysis, C.effort.last])
    } finally { await w.disarm() }
    await w.noMutation(before)
  })
})

describe('session.start with a model: validation EP/BVA', () => {
  const w = useModelHost('g-ssm-invalid')
  const routes = [['blank', ' '], ['missing provider', '/' + C.models.analysis], ['missing model', C.provider + '/'], ['bare id', C.models.fast], ['unknown provider', 'unknown-provider/model'], ['unknown model', route('unavailable-model')]]
  for (const [label, model] of routes) {
    it('SSM-10 EP/BVA invalid route ' + label + ' is refused invalid-decision before creation', T, async () => { await assertRefusedBeforeCreate(w, { model }, { codes: ERROR.invalidDecision }) })
  }
  it('SSM-10b BVA an empty route breaks the non-empty rule: the channel closes', T, async () => { await assertRefusedBeforeCreate(w, { model: '' }, { closes: true }) })

  const efforts = [['blank', C.models.analysis, ' '], ['case mismatch', C.models.analysis, 'SKIM'], ["another model's effort", C.models.analysis, C.effort.wrongModel], ['an effort on a model without reasoning', C.models.plain, C.effort.first]]
  for (const [label, model, effort] of efforts) {
    it('SSM-11 EP/BVA effort ' + label + ' is refused invalid-decision before creation', T, async () => { await assertRefusedBeforeCreate(w, selection(model, effort), { codes: ERROR.invalidDecision }) })
  }
  it('SSM-11b BVA an empty effort breaks the non-empty rule: the channel closes', T, async () => { await assertRefusedBeforeCreate(w, selection(C.models.analysis, ''), { closes: true }) })

  it('SSM-12 DT an effort alone needs an explicit model: invalid-decision', T, async () => { await assertRefusedBeforeCreate(w, { reasoningEffort: C.effort.first }, { codes: ERROR.invalidDecision }) })

  for (const [key, value] of [['model', null], ['model', 1], ['model', {}], ['reasoningEffort', null], ['reasoningEffort', false], ['reasoningEffort', []]]) {
    it('SSM-13 EP non-string ' + key + ' ' + JSON.stringify(value) + ': the channel closes, nothing created', T, async () => {
      await assertRefusedBeforeCreate(w, { ...selection(), [key]: value }, { closes: true })
    })
  }
})

describe('session.start with a model: host failure decision table', () => {
  const w = useModelHost('g-ssm-failures')
  for (const [boundary, codes] of [['catalog', ERROR.featureOff], ['resolve', Object.values(ERROR)]]) {
    it('SSM-20 EP ' + boundary + ' rejects: refused before creation' + (boundary === 'catalog' ? ' feature-off' : ''), T, async () => {
      await assertRefusedBeforeCreate(w, selection(), { arm: { [boundary]: true }, codes })
    })
  }
  for (const [label, substitute] of [['model', { model: C.models.fast }], ['provider', { provider: FAKE.provider }], ['explicit effort', { reasoningEffort: C.effort.last }]]) {
    it('SSM-20b DT the adapter silently substitutes the ' + label + ': fail closed', T, async () => {
      await assertRefusedBeforeCreate(w, selection(C.models.analysis, C.effort.first), { arm: { substitute } })
    })
  }
  for (const [label, fault] of [['apply rejects', { selection: true }], ['the selection flush rejects', { flush: 'throw' }], ['the selection flush answers false', { flush: 'false' }]]) {
    it('SSM-21 DT ' + label + ': refused; the created session got nothing and has no watch', T, async () => {
      const before = await w.snapshots()
      await assertSelectionRefused(w, await armedStart(w, { ...selection(), notifyWhenFinished: true }, fault))
      await w.noMutation(before)
    })
  }
})

describe('session.start with a model: the created target wakes on its own first', () => {
  const w = useModelHost('g-ssm-wake-race')
  it('SSM-23 ST the target wakes before selection: refused, no Fishball message, the independent one stays, no watch', T, async () => {
    const before = await w.snapshots()
    const answer = await armedStart(w, { ...selection(), notifyWhenFinished: true }, { externalWake: true })
    const sid = await assertSelectionRefused(w, answer)
    assert.ok((await w.waitReceived(sid, C.text.external)).length, 'the independent message is not erased')
    await w.noMutation(before)
  })
})
