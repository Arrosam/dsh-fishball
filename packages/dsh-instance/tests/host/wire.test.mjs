/**
 * The `mcp-credential` channel (credential.js JSDoc; README "The hosted token"): the host's client
 * asks `probe` (does the child hold the reserved parent credential, by DSH's own describe /
 * describeRecord) and `import {value}` (write DSH_AGENT_TOKEN once); the child's receiver answers
 * each once. A request with no answer in its bound, on a closed transport or after close() rejects
 * CREDENTIAL_CHANNEL_UNAVAILABLE. The bound is driven by mocked timers (no real wait).
 *
 * Techniques: EP over the store (probe), the frame classes (valid / invalid / malformed), the
 * client's failure classes (timeout / close / closed); BVA of the bound (a reply 1 ms inside it).
 */
import assert from 'node:assert/strict'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { parseJson as parseFrame, textOf } from '@dsh-instance/test-helpers/json'
import { drain, settle, until } from '@dsh-instance/test-helpers/wait'
import { extraCredentialsOf, fakeChildCredentials, plantedExtraCredentials, seedExtraCredentials } from '../support/fakes.mjs'
import { CHANNEL_UNAVAILABLE, EXTRA_CREDENTIALS, FIXTURE, IMPORT, K3 } from './constants.mjs'
import { credentialPair } from './worlds.mjs'

eachSdk((sdk) => {
  for (const [title, opts, expected] of [
    ['nothing stored', {}, false],
    ['DSH_AGENT_TOKEN configured', { ref: true }, true],
    ['only fishball-core/hosted-agent configured', { record: true }, true],
    ['both configured', { ref: true, record: true }, true],
  ]) {
    caseTest(sdk, 'WIRE', 'probe', `probe() with ${title} → ${expected}`, async (t) => {
      const p = await credentialPair(t, sdk, { credentials: fakeChildCredentials(opts) })
      assert.equal(await p.client.probe(), expected)
    })
  }
  caseTest(sdk, 'WIRE', 'frames', 'frames are JSON {id, op} / {id, op: import, value}; replies {id, ok: true, present?}; the probe frame carries no value', async (t) => {
    const p = await credentialPair(t, sdk)
    await p.client.probe()
    await p.client.importToken(FIXTURE.planted + 'f')
    const sent = p.wire.frames.toChild.map(parseFrame)
    assert.deepEqual(sent.map((f) => f.op), [IMPORT.ops.probe, IMPORT.ops.import])
    assert.equal('value' in sent[0], false)
    assert.equal(sent[1].value, FIXTURE.planted + 'f')
    const replies = p.wire.frames.toHost.map(parseFrame)
    assert.deepEqual(replies.map((r) => [r.id, r.ok]), sent.map((f) => [f.id, true]))
    assert.equal(replies[0].present, false)
  })
  caseTest(sdk, 'WIRE', 'import', 'importToken(value) → {ok: true}; the child store holds it under DSH_AGENT_TOKEN', async (t) => {
    const p = await credentialPair(t, sdk)
    assert.deepEqual(await p.client.importToken(FIXTURE.planted + 'i'), { ok: true })
    assert.equal(p.credentials.refs.get(IMPORT.credentialRef), FIXTURE.planted + 'i')
  })
  caseTest(sdk, 'WIRE', 'import', 'a store that cannot write → {ok: false, code: credentials-unwritable}', async (t) => {
    const p = await credentialPair(t, sdk, { credentials: fakeChildCredentials({ failSet: true }) })
    assert.deepEqual(await p.client.importToken(FIXTURE.planted + 'u'), { ok: false, code: K3.refusal.unwritable })
  })
  for (const [title, frame] of [
    ['an import with an empty value', { id: 'fb-1', op: IMPORT.ops.import, value: '' }],
    ['an import with a non-string value', { id: 'fb-2', op: IMPORT.ops.import, value: 42 }],
    ['an import with no value', { id: 'fb-3', op: IMPORT.ops.import }],
    ['an unknown op', { id: 'fb-4', op: 'unset' }],
  ]) {
    caseTest(sdk, 'WIRE', 'invalid', `the receiver answers ${title} with {ok: false, code: invalid-request} and writes nothing`, async (t) => {
      const p = await credentialPair(t, sdk)
      p.wire.host.send(JSON.stringify(frame))
      await until(() => p.wire.frames.toHost.length === 1)
      assert.deepEqual(p.wire.frames.toHost.map(parseFrame), [{ id: frame.id, ok: false, code: K3.refusal.invalid }])
      assert.deepEqual([p.credentials.calls.set, p.credentials.calls.unset], [[], []])
    })
  }
  caseTest(sdk, 'WIRE', 'invalid', 'malformed JSON is ignored: no reply, no write', async (t) => {
    const p = await credentialPair(t, sdk)
    p.wire.host.send('{not json')
    // A valid probe after it is answered, so the receiver had its turn at the malformed frame.
    assert.equal(await p.client.probe(), false)
    assert.equal(p.wire.frames.toHost.length, 1)
    assert.deepEqual(p.credentials.calls.set, [])
  })
  for (const [title, act] of [['probe()', (c) => c.probe()], ['importToken()', (c) => c.importToken(FIXTURE.planted + 't')]]) {
    caseTest(sdk, 'WIRE', 'timeout', `${title} with no reply within timeoutMs rejects CREDENTIAL_CHANNEL_UNAVAILABLE`, async (t) => {
      t.mock.timers.enable({ apis: ['setTimeout'] })
      const p = await credentialPair(t, sdk, { receiver: false })
      const out = settle(() => act(p.client))
      await until(() => p.wire.frames.toChild.length === 1)
      t.mock.timers.tick(FIXTURE.timeoutMs)
      assert.equal((await out).error?.code, CHANNEL_UNAVAILABLE)
    })
    caseTest(sdk, 'WIRE', 'close', `${title} pending when the transport closes rejects CREDENTIAL_CHANNEL_UNAVAILABLE`, async (t) => {
      const p = await credentialPair(t, sdk, { receiver: false })
      const pending = settle(() => act(p.client))
      await until(() => p.wire.frames.toChild.length === 1)
      p.wire.lose()
      assert.equal((await pending).error?.code, CHANNEL_UNAVAILABLE)
    })
    caseTest(sdk, 'WIRE', 'closed', `${title} after close() rejects CREDENTIAL_CHANNEL_UNAVAILABLE`, async (t) => {
      const p = await credentialPair(t, sdk)
      p.client.close()
      assert.equal((await settle(() => act(p.client))).error?.code, CHANNEL_UNAVAILABLE)
    })
  }
  caseTest(sdk, 'WIRE', 'timeout', 'BVA: a reply 1 ms inside timeoutMs resolves (the wait is not shorter than asked)', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const p = await credentialPair(t, sdk, { receiver: false })
    p.wire.child.onMessage((text) => { const f = parseFrame(text); setTimeout(() => p.wire.child.send(JSON.stringify({ id: f.id, ok: true, present: true })), FIXTURE.timeoutMs - 1) })
    const out = settle(() => p.client.probe())
    await until(() => p.wire.frames.toChild.length === 1)
    await drain()
    t.mock.timers.tick(FIXTURE.timeoutMs - 1)
    await drain()
    t.mock.timers.tick(1)
    assert.deepEqual(await out, { value: true })
  })
  caseTest(sdk, 'HOST-EP-02', 5, 'the value is never in an answer, an error or a reply the credential client or receiver produces', async (t) => {
    const p = await credentialPair(t, sdk, { credentials: fakeChildCredentials({ failSet: true }) })
    const value = FIXTURE.planted + 'log'
    const out = await settle(() => p.client.importToken(value))
    assert.equal(textOf([out.value, out.error?.message, out.error?.stack]).includes(value), false)
    assert.equal(p.wire.frames.toHost.join('').includes(value), false)
  })
  caseTest(sdk, 'MULTI-2', 'host wire EP reserved-only probe', "the receiver answers absent with only extra targets' credentials and imports only into the reserved parent reference", async (t) => {
    const credentials = fakeChildCredentials()
    seedExtraCredentials(credentials)
    const p = await credentialPair(t, sdk, { credentials })
    assert.equal(await p.client.probe(), false)
    assert.deepEqual(await p.client.importToken(FIXTURE.planted), { ok: true })
    assert.equal(await p.client.probe(), true)
    assert.deepEqual(credentials.calls.set, [[IMPORT.credentialRef, FIXTURE.planted]])
    assert.deepEqual(extraCredentialsOf(credentials), plantedExtraCredentials())
    const wireText = [...p.wire.frames.toChild, ...p.wire.frames.toHost].join('\n')
    assert.ok(EXTRA_CREDENTIALS.every((entry) => !wireText.includes(entry.value)))
  })
})
