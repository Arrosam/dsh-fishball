/** ST/decision table: a valid model is not publicly selected until pending context readiness finishes. */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { MODEL_CASE as C, modelIdentity } from './support/dedicated-model.mjs'
import { bootLive, newHome, until } from './support/host.mjs'
import { HOOK, T } from './support/expect.mjs'

describe('Dedicated Fishball model: pending selection remains unavailable to the composer', () => {
  let host
  before(async () => { host = (await bootLive(newHome('dedicated-model-pending'), { env: C.env })).host }, HOOK)
  after(async () => { await host?.stop() }, HOOK)
  it('DM-N01 ST: pending validation cannot publish selection, failed validation stays absent, retry succeeds', T, async () => {
    const stream = await host.sse()
    try {
      assert.ok(await until(() => stream.frames.length > C.zero, C.pending.waitMs, C.pending.pollMs))
      const before = await host.call('lookupCount')
      await host.call('setLookupFailure', { model: C.selection.model, mode: 'hang', hangMs: C.pending.hangMs })
      let completed = false
      const selection = host.post(C.api.select, C.selection).then((response) => { completed = true; return response })
      try {
        assert.ok(await until(async () => await host.call('lookupCount') > before, C.pending.waitMs, C.pending.pollMs), 'model readiness is being evaluated')
        assert.equal(completed, false, 'precondition: Save is still pending')
        assert.equal((await host.state()).modelSelection, null, 'an in-flight first selection is not publicly selected')
        assert.equal(stream.frames.some((frame) => frame.modelSelection != null), false, 'SSE cannot unblock the composer prematurely')
        const response = await selection
        assert.equal(response.json?.ok, false, 'failed lookup cannot be successful selection')
        assert.equal((await host.state()).modelSelection, null, 'failed validation stays unselected')
      } finally {
        await selection
        await host.call('setLookupFailure', { model: C.selection.model, mode: null })
      }
      const retried = await host.post(C.api.select, C.selection)
      assert.equal(retried.status, C.http.ok, retried.text)
      assert.deepEqual(modelIdentity((await host.state()).modelSelection), C.selection)
    } finally { stream.close() }
  })
})
