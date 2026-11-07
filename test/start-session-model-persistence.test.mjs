/** Omitted effort is durable as omission; the provider still supplies model-local defaults after cold resume. */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { NEEDS_INSTANCE_STUB } from './support/constants.mjs'
import { HOOK, T, turn } from './support/expect.mjs'
import { selectionHost, START_MODEL as C, route } from './support/start-session-model.mjs'

const cases = [
  { label: 'model with adapter default', model: C.models.analysis, effort: C.effort.default },
  { label: 'model without reasoning', model: C.models.plain, effort: undefined },
]

for (const scenario of cases) {
  describe('start_session model: omitted effort cold persistence, ' + scenario.label, { skip: NEEDS_INSTANCE_STUB }, () => {
    let w
    before(async () => { w = await selectionHost('start-model-omission-resume') }, HOOK)
    after(async () => { await w?.stop() }, HOOK)
    it('SSM-26 ST model-only start -> host stops -> cold resume: chosen route persists; no effort is invented in selected result', T, async () => {
      const before = await w.snapshots()
      await w.arm()
      const answer = await w.start({ model: route(scenario.model) })
      const sid = await w.assertSuccess(answer, { model: scenario.model, effort: scenario.effort, selectedEffort: null })
      assert.equal(Object.hasOwn(answer.json.selected, 'reasoningEffort'), false)
      const home = w.home
      await w.disarm(); await w.stop()
      w = await selectionHost('start-model-omission-resumed', { home })
      assert.equal(await w.host.call('agentStatus', { sessionId: sid }), null, 'precondition: target genuinely cold')
      assert.equal((await w.host.call('resume', { sessionId: sid })).error, null)
      await w.arm()
      try {
        await turn(w.host, sid)
        const requests = await w.requests(sid)
        assert.ok(requests.length)
        for (const request of requests) {
          assert.equal(request.provider, C.provider)
          assert.equal(request.model, scenario.model)
          assert.equal(request.reasoningEffort, scenario.effort ?? null)
        }
        await w.noMutation(before)
      } finally { await w.disarm() }
    })
  })
}
