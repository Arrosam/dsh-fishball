/** State transitions at official publication/GUI boundaries; no production source inspected. */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { NEEDS_INSTANCE_STUB } from './support/constants.mjs'
import { HOOK, T, turn } from './support/expect.mjs'
import { until } from './support/host.mjs'
import { selectionHost, START_MODEL as C, route } from './support/start-session-model.mjs'

const chosen = { provider: C.provider, model: C.models.fast, reasoningEffort: C.effort.wrongModel }
const startSelection = { model: route(C.models.analysis), reasoning_effort: C.effort.last }

describe('start_session model: existing and later GUI-selection authority', { skip: NEEDS_INSTANCE_STUB }, () => {
  let w
  before(async () => { w = await selectionHost('start-model-gui-races') }, HOOK)
  after(async () => { await w?.stop() }, HOOK)
  it('SSM-24 ST GUI selects between create publication and return: refuse existing pending selection; do not overwrite it or send message', T, async () => {
    await w.arm({ externalSelection: chosen })
    try {
      const answer = await w.start({ ...startSelection, notify_when_finished: true })
      const sid = await w.assertFailedCreated(answer)
      const events = await w.events()
      assert.equal(events.some(item => item.type === 'select' && item.selection?.model === C.models.analysis), false, 'Fishball cannot overwrite a preexisting GUI pending selection')
      const saves = events.filter(item => item.type === 'default-save')
      assert.equal(saves.length, 1, 'only the independent GUI selection may save DSH default')
      assert.deepEqual(saves[0].selection, chosen)
      assert.ok(events.some(item => item.type === 'external-selection-end' && item.sessionId === sid))
    } finally { await w.disarm() }
  })
  it('SSM-25 ST successful start -> first header -> GUI switches: later requests follow GUI, not stale initial bridge', T, async () => {
    await w.arm()
    try {
      const answer = await w.start(startSelection)
      const sid = await w.assertSuccess(answer, { model: C.models.analysis, effort: C.effort.last })
      const switched = await w.probe('guiSelection', { sessionId: sid, ...chosen })
      assert.deepEqual(switched.selected, chosen)
      const afterSwitch = (await w.events()).length
      await turn(w.host, sid)
      const requests = (await w.events()).slice(afterSwitch).filter(item => item.type === 'request' && item.sessionId === sid && !item.purpose)
      assert.ok(requests.length)
      for (const request of requests) { assert.equal(request.provider, chosen.provider); assert.equal(request.model, chosen.model); assert.equal(request.reasoningEffort, chosen.reasoningEffort) }
    } finally { await w.disarm() }
  })
  it('SSM-27 ST GUI changes while first assembly awaits: captured first request stays A, following request adopts B', T, async () => {
    await w.arm({ holdAssembly: true })
    try {
      const answer = await w.start(startSelection)
      assert.equal(answer.json?.ok, true, answer.result?.text)
      const sid = answer.json.sessionId
      assert.equal(await until(async () => await w.probe('heldAssembly'), C.fixture.timeoutMs), sid, 'first target assembly is deterministically suspended')
      const switched = await w.probe('guiSelection', { sessionId: sid, ...chosen })
      assert.deepEqual(switched.selected, chosen)
      assert.equal(await w.probe('releaseAssembly'), true)
      await w.wait(sid)
      const first = (await w.requests(sid))[0]
      assert.equal(first.provider, C.provider); assert.equal(first.model, C.models.analysis); assert.equal(first.reasoningEffort, C.effort.last)
      const afterFirst = (await w.events()).length
      await turn(w.host, sid)
      const later = (await w.events()).slice(afterFirst).filter(item => item.type === 'request' && item.sessionId === sid && !item.purpose)
      assert.ok(later.length)
      for (const request of later) { assert.equal(request.provider, chosen.provider); assert.equal(request.model, chosen.model); assert.equal(request.reasoningEffort, chosen.reasoningEffort) }
    } finally { await w.probe('releaseAssembly'); await w.disarm() }
  })
})
