/**
 * dshConnectorSessions delegates (packages/dsh-connector/src/delegates/): the pre-route step of a
 * managed session's permission request (the user, 2026-11-20). Techniques: EP over the verdicts, DT
 * over claim × verdict × withdrawal, BVA on the delegate name.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { REPO } from '../../../../test/support/constants.mjs'

const { createDelegates, VERDICT } = await import(pathToFileURL(path.join(REPO, 'packages', 'dsh-connector', 'src', 'delegates', 'index.js')).href)

const SID = 'session-1'
const DESCRIPTOR = Object.freeze({ approvalId: 'apr_1', toolName: 'bash' })
const quietLogger = () => { const lines = []; return { lines, warn: (...args) => lines.push(args) } }
const describe = async () => DESCRIPTOR
const delegate = (name, decide, claims = () => true) => ({ name, claims, decide })

test('EP: allow and reject decide; the answer carries the delegate name and the trimmed reason', async () => {
  for (const verdict of [VERDICT.allow, VERDICT.reject]) {
    const d = createDelegates({ logger: quietLogger() })
    d.register(delegate('watchdog', async () => ({ verdict, reason: '  in scope  ' })))
    assert.deepEqual(await d.decide(SID, describe), { name: 'watchdog', verdict, reason: 'in scope' })
  }
})

test('EP: pass, an empty reason, an unknown verdict, a throw and no claimant all go to the manager', async () => {
  const logger = quietLogger()
  const answers = [async () => ({ verdict: VERDICT.pass }), async () => ({ verdict: VERDICT.allow, reason: ' ' }), async () => ({ verdict: 'grant', reason: 'x' }), async () => { throw new Error('boom') }, async () => undefined]
  for (const decide of answers) {
    const d = createDelegates({ logger })
    d.register(delegate('watchdog', decide))
    assert.equal(await d.decide(SID, describe), undefined)
  }
  const none = createDelegates({ logger })
  none.register(delegate('watchdog', async () => ({ verdict: VERDICT.allow, reason: 'x' }), () => false))
  assert.equal(await none.decide(SID, describe), undefined)
})

test('DT: the first claimant is the only one asked; a throwing claims() is skipped', async () => {
  const asked = []
  const d = createDelegates({ logger: quietLogger() })
  d.register(delegate('broken', async () => ({ verdict: VERDICT.reject, reason: 'no' }), () => { throw new Error('claims') }))
  d.register(delegate('first', async (req) => { asked.push(['first', req]); return { verdict: VERDICT.allow, reason: 'ok' } }))
  d.register(delegate('second', async () => { asked.push(['second']); return { verdict: VERDICT.reject, reason: 'no' } }))
  assert.equal((await d.decide(SID, describe)).name, 'first')
  assert.deepEqual(asked, [['first', { sessionId: SID, descriptor: DESCRIPTOR }]])
})

test('DT: a delegate withdrawn while deciding no longer decides; its name is free again', async () => {
  const d = createDelegates({ logger: quietLogger() })
  let release
  const dispose = d.register(delegate('watchdog', () => new Promise((resolve) => { release = resolve })))
  const pending = d.decide(SID, describe)
  await new Promise((r) => setImmediate(r))
  dispose()
  release({ verdict: VERDICT.allow, reason: 'late' })
  assert.equal(await pending, undefined)
  assert.doesNotThrow(() => d.register(delegate('watchdog', async () => ({ verdict: VERDICT.pass }))))
})

test('BVA: names [a-z][a-z0-9-]{0,47}; a taken name and a closed registry throw', () => {
  const d = createDelegates({ logger: quietLogger() })
  const noop = async () => ({ verdict: VERDICT.pass })
  assert.doesNotThrow(() => d.register(delegate('a', noop)))
  assert.doesNotThrow(() => d.register(delegate('b' + 'x'.repeat(47), noop)))
  for (const name of ['', 'B', '1a', 'b' + 'x'.repeat(48), 'has space']) assert.throws(() => d.register(delegate(name, noop)), TypeError, name)
  assert.throws(() => d.register({ name: 'nofn', claims: () => true }), TypeError)
  assert.throws(() => d.register(delegate('a', noop)), /registered already/)
  d.close()
  assert.throws(() => d.register(delegate('c', noop)), /closing/)
})
