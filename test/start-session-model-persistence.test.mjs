/**
 * session.start with a model and no effort (contract §4.1 `model?`, `reasoningEffort?`; DESIGN §5d
 * "omitted effort stays omitted so the provider's default is not pinned"), over the bridge (H-STUB):
 * the omission is durable, so after a genuine cold resume the provider still supplies its own default.
 *
 * | id     | technique | expected |
 * |--------|-----------|----------|
 * | SSM-26 ×2 | ST (model-only start → host stops → cold resume) × EP (model with an adapter default effort / without reasoning) | every request after the resume uses the chosen provider/model, with the adapter's default effort (or none); DSH's default model and the connector's settings unchanged |
 *
 * Retired:
 * - The `selected` reply field without reasoningEffort: contract §4.1's reply has no `selected`; the omission is checked on the requests instead.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { T, turn } from './support/expect.mjs'
import { START_MODEL as C, route } from './support/start-session-model.mjs'
import { assertModelStart, useModelHost } from './support/instance-stub-start.mjs'

const cases = [
  { label: 'model with adapter default', model: C.models.analysis, effort: C.effort.default },
  { label: 'model without reasoning', model: C.models.plain, effort: null },
]

for (const scenario of cases) {
  describe('session.start with a model: omitted effort survives a cold resume, ' + scenario.label, () => {
    const w = useModelHost('g-ssm-omission')
    it('SSM-26 ST model-only start → host stops → cold resume: the chosen route persists and no effort is pinned', T, async () => {
      const before = await w.snapshots()
      await w.arm()
      let json
      try { json = await assertModelStart(w, await w.start({ model: route(scenario.model) }), { model: scenario.model, effort: scenario.effort }) } finally { await w.disarm() }
      await w.restart()
      assert.equal(await w.host.call('agentStatus', { sessionId: json.sessionId }), null, 'precondition: the target is cold')
      assert.equal((await w.host.call('resume', { sessionId: json.sessionId })).error, null)
      await w.arm()
      try {
        await turn(w.host, json.sessionId)
        const requests = await w.requests(json.sessionId)
        assert.ok(requests.length)
        for (const r of requests) assert.deepEqual([r.provider, r.model, r.reasoningEffort], [C.provider, scenario.model, scenario.effort])
      } finally { await w.disarm() }
      await w.noMutation(before)
    })
  })
}
