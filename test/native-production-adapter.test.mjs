import test from 'node:test'
import assert from 'node:assert/strict'
import { assertDisposableEnvironment, deferred, bounded } from './native-production-helpers.mjs'
import { carrierPair } from './native-production-control-fixture.mjs'

await assertDisposableEnvironment()
const { createNativeHostAdapter } = await import('../src/native-host-adapter.js')
const { createControlClient } = await import('../src/native-control/index.js')
const HOST = Object.freeze({ id: 'host-local', session: 'managed-target', other: 'unmanaged-target', principal: 'attached-fishball', text: 'explicit managed message', source: 'fishball-native', approval: 'host-pending' })

async function fixture(t, options = {}) {
  let managed = [HOST.session], live = true, archived = false
  const calls = { resolve: [], steer: [], flush: [], factory: [], answers: [] }
  const session = { id: HOST.session }
  const agent = { id: HOST.session, session, steer(message) { calls.steer.push(message) } }
  const ctx = {
    sessions: { get: id => live && id === HOST.session ? session : undefined, flush: async value => { calls.flush.push(value); return true } },
    sessionController: { resolveAgent: async id => { calls.resolve.push(id); return { agent } } },
    workspaceRegistry: { list: () => [{ sessionIds: live ? [HOST.session] : [], path: process.env.TMPDIR }], get archivedSessionIds() { return archived ? [HOST.session] : [] } },
  }
  options.configure?.({ ctx, agent, session, calls })
  const adapter = createNativeHostAdapter(ctx, { hostId: HOST.id, managedSessionIds: () => managed }, {
    createUserMessage: input => { calls.factory.push(input); return { role: 'user', ...input } },
  })
  const [hostCarrier, clientCarrier] = carrierPair([])
  adapter.attach(hostCarrier, { connectionId: 'adapter-test', principalId: options.principal ?? HOST.principal })
  const client = createControlClient({ hostId: HOST.id })
  t.after(() => { client.close(); adapter.close() })
  await client.attach(clientCarrier)
  return { client, adapter, calls, ctx, agent, session,
    unmanaged: () => { managed = [] }, absent: () => { live = false }, archive: () => { archived = true },
  }
}
const send = (f, target = HOST.session, messageId = 'adapter-message') => f.client.request('message.send', target, { messageId, text: HOST.text })
const rejects = callback => assert.rejects(async () => callback())

test('HOST-01 only locally managed live target reaches native steer and durable flush', async t => {
  const f = await fixture(t)
  const result = await send(f)
  assert.equal(result.status, 'delivered')
  assert.deepEqual(f.calls.resolve, [HOST.session])
  assert.equal(f.calls.steer.length, 1)
  assert.deepEqual(f.calls.flush, [f.session])
  assert.equal(f.calls.factory.length, 1)
  assert.deepEqual(f.calls.factory[0].content, [{ type: 'text', text: HOST.text }])
  assert.equal(f.calls.factory[0].source.kind, HOST.source)
  await send(f)
  assert.equal(f.calls.steer.length, 1, 'acknowledged native steer cannot be replayed')
})

for (const state of ['unmanaged', 'absent', 'archived', 'wrong-target']) {
  test('HOST-02 rejects ' + state + ' against live host-local state before agent resolution', async t => {
    const f = await fixture(t)
    if (state === 'unmanaged') f.unmanaged()
    if (state === 'absent') f.absent()
    if (state === 'archived') f.archive()
    await rejects(() => send(f, state === 'wrong-target' ? HOST.other : HOST.session))
    assert.deepEqual(f.calls.resolve, [])
    assert.deepEqual(f.calls.steer, [])
  })
}

test('HOST-03 wrong authenticated principal cannot use adapter', async t => {
  await rejects(() => fixture(t, { principal: 'unrelated-plugin' }))
})

for (const mismatch of ['agent', 'session']) {
  test('HOST-04 resolved ' + mismatch + ' identity cannot substitute another target', async t => {
    const f = await fixture(t, { configure: ({ agent }) => {
      if (mismatch === 'agent') agent.id = HOST.other
      else agent.session = { id: HOST.other }
    } })
    await rejects(() => send(f))
    assert.deepEqual(f.calls.steer, [])
    assert.deepEqual(f.calls.flush, [])
  })
}

for (const disposition of ['unmanaged', 'disconnected']) {
  test('HOST-05 agent resolution race rechecks ' + disposition + ' before steering', async t => {
    const started = deferred(), release = deferred()
    const f = await fixture(t, { configure: ({ ctx, agent }) => {
      ctx.sessionController.resolveAgent = async () => { started.resolve(); await release.promise; return { agent } }
    } })
    const pending = send(f)
    const rejected = rejects(() => pending)
    await bounded(started.promise, 'native agent resolution never began')
    if (disposition === 'unmanaged') f.unmanaged()
    else f.client.close()
    release.resolve()
    await rejected
    assert.deepEqual(f.calls.steer, [])
    assert.deepEqual(f.calls.flush, [])
  })
}

for (const outcome of ['false', 'throw']) {
  test('HOST-06 post-steer flush ' + outcome + ' is unconfirmed and cannot replay side effect', async t => {
    const f = await fixture(t, { configure: ({ ctx }) => {
      ctx.sessions.flush = async () => { if (outcome === 'throw') throw new Error('simulated persistence failure'); return false }
    } })
    assert.equal((await send(f)).status, 'unconfirmed')
    assert.equal((await send(f)).status, 'unconfirmed')
    assert.equal(f.calls.steer.length, 1)
  })
}

test('HOST-04 pre-steer target refusal remains refusal for retries and message reconciliation', async t => {
  const f = await fixture(t, { configure: ({ agent }) => { agent.id = HOST.other } })
  await rejects(() => send(f))
  f.agent.id = HOST.session
  await rejects(() => send(f))
  await rejects(() => f.client.request('message.status', HOST.session, { messageId: 'adapter-message' }))
  assert.equal(f.calls.resolve.length, 1, 'same refused identity cannot trigger another resolution')
  assert.deepEqual(f.calls.steer, [])
  assert.deepEqual(f.calls.flush, [])
})

test('HOST-07 approval answer rechecks management instead of trusting earlier offer', async t => {
  const f = await fixture(t)
  f.adapter.registerApproval({ sessionId: HOST.session, approvalId: HOST.approval, kind: 'approval', prompt: 'Allow?', choices: ['allow', 'reject'], expiresAt: Date.now() + 60000,
    isLive: () => true, answer: answer => { f.calls.answers.push(answer) },
  })
  const { approvals: [offer] } = await f.client.request('approval.list', HOST.session, {})
  f.unmanaged()
  await rejects(() => f.client.request('approval.answer', HOST.session, { approvalId: offer.approvalId, offerId: offer.offerId, answer: { decision: 'allow' } }))
  assert.deepEqual(f.calls.answers, [])
})
