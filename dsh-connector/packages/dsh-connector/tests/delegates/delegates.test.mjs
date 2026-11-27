/**
 * dshConnectorSessions delegates (packages/dsh-connector/src/delegates/): the pre-route step of a
 * managed session's permission request (the user, 2026-11-20; 2026-11-21: a claimed request a
 * delegate did not decide goes to the manager as {name, outcome: passed | failed, reason?}, so a
 * judged pass is told from a failure). Techniques: EP over the verdicts, DT over claim × verdict ×
 * withdrawal and over the thrown error's code / name, BVA on the delegate name and the reasons.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { REPO } from 'dsh-connector-test-helpers/legacy'

const { createDelegates, VERDICT } = await import(pathToFileURL(path.join(REPO, 'packages', 'dsh-connector', 'src', 'delegates', 'index.js')).href)
const { DELEGATE_OUTCOME } = await import(pathToFileURL(path.join(REPO, 'packages', 'dsh-connector', 'mcp-schema', 'index.js')).href)
/** The requirement's words (2026-11-21), not the implementation's. */
const OUTCOME = Object.freeze({ passed: 'passed', failed: 'failed' })
const INVALID = 'invalid-verdict'

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

/** decide() with one registered claiming delegate answering `decide`; also returns what was logged. */
async function one(decide) {
  const logger = quietLogger()
  const d = createDelegates({ logger })
  d.register(delegate('watchdog', decide))
  return { result: await d.decide(SID, describe), warned: logger.lines.length }
}

test('EP: K1 exports DELEGATE_OUTCOME = {passed, failed}', () => {
  assert.deepEqual({ ...DELEGATE_OUTCOME }, OUTCOME)
  assert.ok(Object.isFrozen(DELEGATE_OUTCOME))
})

test('EP + BVA: a pass → {name, outcome: passed} with its trimmed reason only when non-empty', async () => {
  for (const [label, answer, expected] of [
    ['no reason', { verdict: VERDICT.pass }, { name: 'watchdog', outcome: OUTCOME.passed }],
    ['empty reason', { verdict: VERDICT.pass, reason: '' }, { name: 'watchdog', outcome: OUTCOME.passed }],
    ['whitespace reason', { verdict: VERDICT.pass, reason: '   ' }, { name: 'watchdog', outcome: OUTCOME.passed }],
    ['non-string reason', { verdict: VERDICT.pass, reason: 7 }, { name: 'watchdog', outcome: OUTCOME.passed }],
    ['one-character reason', { verdict: VERDICT.pass, reason: 'x' }, { name: 'watchdog', outcome: OUTCOME.passed, reason: 'x' }],
    ['padded reason', { verdict: VERDICT.pass, reason: '  high risk  ' }, { name: 'watchdog', outcome: OUTCOME.passed, reason: 'high risk' }],
  ]) {
    const { result, warned } = await one(async () => answer)
    assert.deepEqual(result, expected, label)
    assert.equal(warned, 0, label + ': a pass was logged as a failure')
  }
})

test('EP + BVA: an invalid answer → {name, outcome: failed, reason: invalid-verdict}, logged', async () => {
  for (const [label, answer] of [
    ['undefined', undefined], ['null', null], ['a string', 'allow'], ['a number', 1],
    ['an unknown verdict', { verdict: 'grant', reason: 'x' }], ['no verdict', { reason: 'x' }],
    ['allow with a whitespace reason', { verdict: VERDICT.allow, reason: ' ' }], ['allow with an empty reason', { verdict: VERDICT.allow, reason: '' }],
    ['reject with no reason', { verdict: VERDICT.reject }], ['allow with a non-string reason', { verdict: VERDICT.allow, reason: 5 }],
  ]) {
    const { result, warned } = await one(async () => answer)
    assert.deepEqual(result, { name: 'watchdog', outcome: OUTCOME.failed, reason: INVALID }, label)
    assert.ok(warned > 0, label + ': the failure was not logged')
  }
})

test('DT: a throw → {name, outcome: failed, reason}: its string code, else its string name; logged', async () => {
  const err = (props) => Object.assign(new Error('boom'), props)
  for (const [label, thrown, expected] of [
    ['code and name', err({ code: 'judge-timeout', name: 'JudgeError' }), { reason: 'judge-timeout' }],
    ['code only', err({ code: 'judge-no-answer' }), { reason: 'judge-no-answer' }],
    ['a plain Error (name Error)', new Error('boom'), { reason: 'Error' }],
    ['a TypeError', new TypeError('bad'), { reason: 'TypeError' }],
    ['a non-string code falls back to the name', err({ code: 42, name: 'JudgeError' }), { reason: 'JudgeError' }],
    ['no string code, no string name', { code: 1, name: 2 }, {}],
  ]) {
    const { result, warned } = await one(async () => { throw thrown })
    assert.deepEqual(result, { name: 'watchdog', outcome: OUTCOME.failed, ...expected }, label)
    assert.ok(warned > 0, label + ': the failure was not logged')
  }
  // A thrown non-object has neither a code nor a name: the requirement fixes only that it fails and
  // that any reason is a string (the descriptor's reason is a string).
  const { result: str } = await one(async () => { throw 'boom' })
  assert.deepEqual([str.name, str.outcome], ['watchdog', OUTCOME.failed])
  assert.ok(str.reason === undefined || typeof str.reason === 'string', JSON.stringify(str))
  // A synchronous throw from decide() is a throw too.
  const { result } = await one(() => { throw Object.assign(new Error('sync'), { code: 'judge-failed' }) })
  assert.deepEqual(result, { name: 'watchdog', outcome: OUTCOME.failed, reason: 'judge-failed' })
})

test('DT: no claimant (nothing registered, or no delegate claims) → undefined', async () => {
  assert.equal(await createDelegates({ logger: quietLogger() }).decide(SID, describe), undefined)
  const none = createDelegates({ logger: quietLogger() })
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

test('DT: a delegate withdrawn while deciding no longer decides (allow, pass or throw → undefined); its name is free again', async () => {
  const d = createDelegates({ logger: quietLogger() })
  let release
  const dispose = d.register(delegate('watchdog', () => new Promise((resolve) => { release = resolve })))
  const pending = d.decide(SID, describe)
  await new Promise((r) => setImmediate(r))
  dispose()
  release({ verdict: VERDICT.allow, reason: 'late' })
  assert.equal(await pending, undefined)
  for (const settle of [(res) => res({ verdict: VERDICT.pass, reason: 'late' }), (_res, rej) => rej(Object.assign(new Error('late'), { code: 'judge-failed' }))]) {
    const e = createDelegates({ logger: quietLogger() })
    let go
    const off = e.register(delegate('watchdog', () => new Promise((res, rej) => { go = () => settle(res, rej) })))
    const late = e.decide(SID, describe)
    await new Promise((r) => setImmediate(r))
    off()
    go()
    assert.equal(await late, undefined)
  }
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
