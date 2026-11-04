/** Dedicated loopback capability: EP malformed/SSRF; ST bilateral pairing, timeout, close and no retries. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomBytes } from 'node:crypto'
import http from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import { CASE as C, assertRejected, clone, outcome } from './support/provider-sync-engine.mjs'
import { officialCredentials } from './support/provider-sync-official.mjs'

const CHANNEL = Object.freeze({ ttlMs: 1000, timeoutMs: 40, testTimeoutMs: 5000, inventory: 'inventory', import: 'import', rejected: ['resolve', 'readRecord', 'set', 'unset', 'session', 'shell'], badInvitations: ['', '{}', '[]', 'null', '{', 'https://example.invalid', 'http://169.254.169.254/'], maxRequestProbe: 2 * 1024 * 1024, capabilityBytes: 32, contentType: 'application/json', wireBegin: 'begin' })
async function channels(t, targetHandle = async () => ({ accepted: true }), options = {}) {
  const { ProviderSyncChannel } = await import('../src/provider-sync-channel.js')
  const credentials = await officialCredentials()
  t.after(() => credentials.close())
  const calls = { source: [], target: [] }
  const source = new ProviderSyncChannel({ identity: clone(C.source), handle: async (action) => { calls.source.push(action); return { accepted: true } }, ttlMs: CHANNEL.ttlMs, timeoutMs: CHANNEL.timeoutMs, ...options })
  const target = new ProviderSyncChannel({ identity: clone(C.target), handle: async (...args) => { calls.target.push(args[0]); return targetHandle(...args) }, ttlMs: CHANNEL.ttlMs, timeoutMs: CHANNEL.timeoutMs, ...options })
  t.after(async () => { await source.close(); await target.close() })
  await source.start()
  await target.start()
  const post = async (invitation, { body = '{}', authorization = 'Bearer ' + invitation.capability, headers = {}, method = 'POST' } = {}) => new Promise((resolve, reject) => {
    const request = http.request(invitation.url, { method, headers: { 'content-type': CHANNEL.contentType, authorization, ...headers } }, (response) => {
      let text = ''
      response.setEncoding('utf8').on('data', (chunk) => { text += chunk })
      response.on('end', () => resolve({ status: response.statusCode, text }))
    })
    request.on('error', (error) => ['EPIPE', 'ECONNRESET'].includes(error.code) ? resolve({ status: 413, text: '' }) : reject(error))
    request.end(body)
  })
  const pair = async () => {
    const pending = await source.beginPair(target.invitation())
    await target.approvePair(pending.pairId)
    return source.finishPair(pending.pairId)
  }
  return { source, target, calls, pair, credentials, post }
}

test('PS-T01 ST: two pages must explicitly pair before the dedicated channel accepts requests', { timeout: CHANNEL.testTimeoutMs }, async (t) => {
  const fixture = await channels(t)
  const pending = await fixture.source.beginPair(fixture.target.invitation())
  assert.deepEqual(pending.identity, C.target)
  assert.equal(fixture.calls.target.length, 0)
  assertRejected(await outcome(() => fixture.source.finishPair(pending.pairId)))
  assert.equal(fixture.calls.target.length, 0)
  await fixture.target.approvePair(pending.pairId)
  const peer = await fixture.source.finishPair(pending.pairId)
  assert.deepEqual(peer.identity, C.target)
  assert.deepEqual(await peer.request(CHANNEL.inventory, {}), { accepted: true })
  assert.deepEqual(fixture.calls.target, [CHANNEL.inventory])
})

test('PS-T02 ST: invitation and approval are one-time and reject replay', { timeout: CHANNEL.testTimeoutMs }, async (t) => {
  const fixture = await channels(t)
  const text = fixture.target.invitation()
  const pending = await fixture.source.beginPair(text)
  await fixture.target.approvePair(pending.pairId)
  await fixture.source.finishPair(pending.pairId)
  assertRejected(await outcome(() => fixture.source.beginPair(text)))
  assert.equal(fixture.calls.target.length, 0)
})

for (const text of CHANNEL.badInvitations) test('PS-T03 EP: malformed/non-capability invitation is rejected without application requests', { timeout: CHANNEL.testTimeoutMs }, async (t) => {
  const fixture = await channels(t)
  assertRejected(await outcome(() => fixture.source.beginPair(text)))
  assert.equal(fixture.calls.source.length + fixture.calls.target.length, 0)
})

for (const action of CHANNEL.rejected) test('PS-T04 DT: paired capability cannot become a credential/session bridge for ' + action, { timeout: CHANNEL.testTimeoutMs }, async (t) => {
  const fixture = await channels(t)
  const peer = await fixture.pair()
  assertRejected(await outcome(() => peer.request(action, {})))
  assert.equal(fixture.calls.target.length, 0)
})

test('PS-T05 ST: close revokes existing paired peer capabilities', { timeout: CHANNEL.testTimeoutMs }, async (t) => {
  const fixture = await channels(t)
  const peer = await fixture.pair()
  await fixture.target.close()
  assertRejected(await outcome(() => peer.request(CHANNEL.import, {})))
  assert.equal(fixture.calls.target.length, 0)
})

test('PS-T06 ST: handler failures are redacted and never replay an import', { timeout: CHANNEL.testTimeoutMs }, async (t) => {
  let failure
  const fixture = await channels(t, async () => { throw failure })
  failure = new Error(fixture.credentials.opaque())
  const peer = await fixture.pair()
  const result = await outcome(() => peer.request(CHANNEL.import, {}))
  fixture.credentials.assertNoLeak(result)
  assertRejected(result)
  assert.deepEqual(fixture.calls.target, [CHANNEL.import])
})

test('PS-T07 ST: timeout aborts an operation and never automatically retries side effects', { timeout: CHANNEL.testTimeoutMs }, async (t) => {
  let aborted = false
  const fixture = await channels(t, async (_action, _payload, _identity, context) => {
    await new Promise((resolve) => context.signal.addEventListener('abort', () => { aborted = true; resolve() }, { once: true }))
    return { aborted: true }
  })
  const peer = await fixture.pair()
  assertRejected(await outcome(() => peer.request(CHANNEL.import, {})))
  await delay(CHANNEL.timeoutMs)
  assert.equal(aborted, true)
  assert.deepEqual(fixture.calls.target, [CHANNEL.import])
})

test('PS-T08 ST: TTL-expired pairing invitation cannot establish a peer', { timeout: CHANNEL.testTimeoutMs }, async (t) => {
  const fixture = await channels(t, async () => ({}), { ttlMs: CHANNEL.timeoutMs })
  const text = fixture.target.invitation()
  await delay(CHANNEL.timeoutMs * 2)
  assertRejected(await outcome(() => fixture.source.beginPair(text)))
  assert.equal(fixture.calls.target.length, 0)
})

for (const [label, options, expected] of [
  ['missing bearer', { authorization: '' }, 403],
  ['wrong bearer', { authorization: 'Bearer invalid' }, 403],
  ['browser Origin', { headers: { origin: 'http://127.0.0.1' } }, 403],
  ['fetch metadata', { headers: { 'sec-fetch-site': 'same-origin' } }, 403],
  ['host alias', { headers: { host: 'localhost' } }, 403],
  ['wrong content type', { headers: { 'content-type': 'text/plain' } }, 403],
  ['malformed JSON', { body: '{' }, 400],
  ['unknown envelope', { body: '{}' }, 400],
  ['oversized body', { body: 'x'.repeat(CHANNEL.maxRequestProbe) }, 413],
]) test('PS-T09 DT: dedicated ingress rejects ' + label + ' before application dispatch', { timeout: CHANNEL.testTimeoutMs }, async (t) => {
  const fixture = await channels(t)
  const invitation = JSON.parse(fixture.target.invitation())
  const response = await fixture.post(invitation, options)
  assert.equal(response.status, expected)
  assert.equal(fixture.calls.target.length, 0)
})

test('PS-T10 security: public status exposes neither invitation URL nor capability', { timeout: CHANNEL.testTimeoutMs }, async (t) => {
  const fixture = await channels(t)
  const invitation = JSON.parse(fixture.target.invitation())
  const serialized = JSON.stringify(fixture.target.status())
  assert.equal(serialized.includes(invitation.capability), false)
  assert.equal(serialized.includes(invitation.url), false)
})

test('PS-T11 ST: a valid invitation bearer is not sufficient to invoke an operation before approval', { timeout: CHANNEL.testTimeoutMs }, async (t) => {
  const fixture = await channels(t)
  const invitation = JSON.parse(fixture.target.invitation())
  const pairCapability = randomBytes(CHANNEL.capabilityBytes).toString('hex')
  const begin = await fixture.post(invitation, { body: JSON.stringify({ kind: CHANNEL.wireBegin, identity: C.source, capability: pairCapability }) })
  assert.equal(begin.status, 200)
  const pending = JSON.parse(begin.text).result
  const response = await fixture.post(invitation, { authorization: 'Bearer ' + pairCapability, body: JSON.stringify({ kind: 'operation', pairId: pending.pairId, sequence: 1, action: CHANNEL.import, payload: {} }) })
  assert.equal(response.status, 409)
  assert.equal(fixture.calls.target.length, 0)
})

for (const [label, unsafeURL] of [
  ['external DNS', 'http://example.invalid:12345/provider-sync/v1'],
  ['metadata IP', 'http://169.254.169.254:80/provider-sync/v1'],
  ['unspecified listener', 'http://0.0.0.0:12345/provider-sync/v1'],
  ['loopback alias', 'http://localhost:12345/provider-sync/v1'],
  ['URL credentials', 'http://user:pass@127.0.0.1:12345/provider-sync/v1'],
  ['query', 'http://127.0.0.1:12345/provider-sync/v1?token=forbidden'],
  ['fragment', 'http://127.0.0.1:12345/provider-sync/v1#forbidden'],
  ['wrong path', 'http://127.0.0.1:12345/session'],
  ['TLS scheme', 'https://127.0.0.1:12345/provider-sync/v1'],
]) test('PS-T12 EP SSRF: structured invitation rejects ' + label + ' before connecting', { timeout: CHANNEL.testTimeoutMs }, async (t) => {
  const fixture = await channels(t)
  const invitation = JSON.parse(fixture.target.invitation())
  invitation.url = unsafeURL
  const result = await outcome(() => fixture.source.beginPair(JSON.stringify(invitation)))
  assertRejected(result)
  assert.equal(result.error.code?.includes('invalid'), true, 'unsafe destination must be rejected as invalid rather than attempted and timed out')
  assert.equal(fixture.calls.target.length, 0)
})

test('PS-T13 ST: paired operation sequence is single-use and rejects authenticated replay without re-dispatch', { timeout: CHANNEL.testTimeoutMs }, async (t) => {
  const fixture = await channels(t)
  const invitation = JSON.parse(fixture.target.invitation())
  const capability = randomBytes(CHANNEL.capabilityBytes).toString('hex')
  const begin = await fixture.post(invitation, { body: JSON.stringify({ kind: CHANNEL.wireBegin, identity: C.source, capability }) })
  assert.equal(begin.status, 200)
  const pending = JSON.parse(begin.text).result
  await fixture.target.approvePair(pending.pairId)
  const authorization = 'Bearer ' + capability
  const finish = await fixture.post(invitation, { authorization, body: JSON.stringify({ kind: 'finish', pairId: pending.pairId }) })
  assert.equal(finish.status, 200)
  const body = JSON.stringify({ kind: 'operation', pairId: pending.pairId, sequence: 1, action: CHANNEL.import, payload: {} })
  const first = await fixture.post(invitation, { authorization, body })
  assert.equal(first.status, 200)
  const replay = await fixture.post(invitation, { authorization, body })
  assert.equal([400, 409].includes(replay.status), true, 'authenticated sequence replay must be rejected')
  assert.deepEqual(fixture.calls.target, [CHANNEL.import])
})
