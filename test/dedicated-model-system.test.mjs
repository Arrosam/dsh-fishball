/**
 * Dedicated Fishball model selection: requirement-derived system tests against real DSH HTTP + persistence.
 * The fake adapter is only a network substitute; neither selection policy nor expected outcomes come from production.
 *
 * AC1 Fishball has a dedicated persisted model; old chat/global selections do not count.
 * AC2 Selection is made from Fishball settings, not the ordinary composer model widget.
 * AC3 Missing/pending/failed first selection cannot unlock the composer.
 * AC4 A successful explicit selection unlocks it and ordinary sessions/global defaults remain unchanged.
 *
 * Decision table (composer behavior is checked separately at the client boundary):
 * R1 Fishball, dedicated absent, old/global model present => no dedicated selection.
 * R2 Fishball, first selection rejected => still absent.
 * R3 Fishball, first selection accepted => dedicated model; no global/ordinary mutation.
 * R4 ordinary, Fishball dedicated present/absent => usual model/default behavior.
 *
 * EP: valid model, malformed body, unavailable model/provider. BVA: zero vs first successful explicit selection.
 * ST: absent -> rejection -> absent -> success -> saved -> restart -> saved; saved -> rejection -> saved.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { bootLive, newHome } from './support/host.mjs'
import { HOOK, T, turn } from './support/expect.mjs'
import { MODEL_CASE as C, isSuccess, modelIdentity } from './support/dedicated-model.mjs'

const boot = (home) => bootLive(home, { env: C.env })
const requestOf = async (host, sessionId) => (await turn(host, sessionId, [[{ text: C.text.reply }]], C.text.probe)).requests.at(-C.one)

async function rejectedWithoutChanging(host, body, options) {
  const before = (await host.state()).modelSelection
  const response = await host.post(C.api.select, body, options)
  assert.equal(isSuccess(response), false, 'invalid/failed model selection must not be acknowledged as successful: ' + response.text)
  assert.deepEqual((await host.state()).modelSelection, before, 'rejected selection cannot change dedicated selection')
}

describe('Dedicated Fishball model: real HTTP and host persistence', () => {
  let host
  let home
  let fishball
  before(async () => {
    home = newHome('dedicated-model-system')
    const booted = await boot(home)
    host = booted.host
    fishball = booted.state.sessionId
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('DM-S01 EP/DT R1: an existing chat model and configured global default do not count as explicit selection', T, async () => {
    assert.equal((await host.state()).modelSelection, null, 'new dedicated selection starts absent despite the host default')
    assert.equal((await host.call('selectModel', { sessionId: fishball, model: C.selection.model })).ok, true)
    assert.equal((await host.state()).modelSelection, null, 'a legacy composer selection is not the dedicated Fishball setting')
    await host.stop()
    const restarted = await boot(home)
    host = restarted.host
    assert.equal(restarted.state.sessionId, fishball, 'precondition: reopen the same old chat')
    assert.equal(restarted.state.modelSelection, null, 'restart must not migrate the old chat model into a dedicated selection')
  })

  it('DM-S02 EP: the read-only settings catalog lists selectable fake models without creating a selection', T, async () => {
    const response = await host.get(C.api.models)
    assert.equal(response.status, C.http.ok)
    assert.equal(response.json?.ok, true)
    const catalog = JSON.stringify(response.json?.catalog)
    assert.ok(catalog?.includes(C.selection.provider), 'catalog includes the registered provider')
    assert.ok(catalog?.includes(C.selection.model), 'catalog includes a registered model')
    assert.equal((await host.state()).modelSelection, null, 'reading model options is not explicit selection')
  })

  const invalidBodies = [
    ['missing model', { provider: C.selection.provider }],
    ['empty model', { provider: C.selection.provider, model: '' }],
    ['missing provider', { model: C.selection.model }],
    ['empty provider', { provider: '', model: C.selection.model }],
    ['non-string model', { provider: C.selection.provider, model: C.one }],
    ['unavailable model', C.unavailable],
    ['unavailable provider', C.unknownProvider],
    ['JSON array', [C.selection]],
  ]
  for (const [partition, body] of invalidBodies) {
    it('DM-S03 EP/DT R2: rejected ' + partition + ' cannot establish first selection', T, async () => {
      await rejectedWithoutChanging(host, body)
      assert.equal((await host.state()).modelSelection, null)
    })
  }

  it('DM-S04 BVA 0->1/DT R3-R4: first explicit selection is dedicated, not a DSH default change', T, async () => {
    const ordinary = await host.call('ordinary', { folder: 'dedicated-model-control' })
    assert.equal(ordinary.error, null)
    assert.equal((await host.call('selectModel', { sessionId: ordinary.sessionId, model: C.original.model })).ok, true)
    const oldRequest = await requestOf(host, ordinary.sessionId)
    assert.equal(oldRequest.model, C.original.model)
    const response = await host.post(C.api.select, C.selection)
    assert.equal(response.status, C.http.ok, response.text)
    assert.equal(response.json?.ok, true)
    assert.deepEqual(modelIdentity((await host.state()).modelSelection), C.selection)
    assert.equal((await requestOf(host, fishball)).model, C.selection.model, 'Fishball uses its dedicated selection')
    assert.equal((await requestOf(host, ordinary.sessionId)).model, C.original.model, 'an existing ordinary session is unchanged')
    const next = await host.call('ordinary', { folder: 'dedicated-model-default-control' })
    assert.equal(next.error, null)
    assert.equal((await requestOf(host, next.sessionId)).model, C.original.model, 'new ordinary sessions still use the original DSH default')
  })

  it('DM-S05 ST: failed replacement preserves the last successful dedicated selection', T, async () => {
    await rejectedWithoutChanging(host, C.unavailable)
    assert.deepEqual(modelIdentity((await host.state()).modelSelection), C.selection)
  })

  it('DM-S06 ST: successful dedicated selection persists across host restart despite a different DSH default', T, async () => {
    await host.stop()
    const restarted = await boot(home)
    host = restarted.host
    assert.deepEqual(modelIdentity(restarted.state.modelSelection), C.selection)
    assert.equal(restarted.state.sessionId, fishball)
    assert.equal((await requestOf(host, fishball)).model, C.selection.model, 'restored Fishball routes through its dedicated model')
    const ordinary = await host.call('ordinary', { folder: 'dedicated-model-after-restart' })
    assert.equal(ordinary.error, null)
    assert.equal((await requestOf(host, ordinary.sessionId)).model, C.original.model, 'ordinary host default remains independent after restart')
  })
})
