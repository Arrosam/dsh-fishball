/**
 * IX-UC-08 (USE-CASES.md): a dshConnectorSessions delegate decides a managed session's permission
 * request before its manager (the user, 2026-11-20: a generic connector hook for Watchdog; "yes send
 * settlements"; 2026-11-21: an undecided claimed request's offer carries delegate {name, outcome,
 * reason?}). On a real DSH with a scripted delegate (extension.mjs `delegateScript`).
 * Techniques: UC, EP, DT.
 */
import assert from 'node:assert/strict'
import { EVENT_TYPE, IX, SETTLED_BY, SETTLEMENT_OUTCOME } from './constants.mjs'
import { row } from './rows.mjs'
import { argsFor, cid, decided, eventually, free, listed, managed, ofType, pending, principal, quiet, resultsOf, session, step, stockFor, tok, waitEvents, world } from './subject.mjs'

const D = IX.delegate

/** Drives one asking call in `sid` and returns its text and call id (no permission event is awaited). */
async function drive(w, sid) {
  await free(w, sid)
  const text = tok('dlg')
  const id = cid('dlg')
  await w.call('driveStart', { sessionId: sid, text: tok('user'), script: [step(IX.fixture.askTool, argsFor(IX.fixture.askTool, text), id), [{ text: 'done' }]] })
  return { text, id }
}
const delegateSettlement = (client, toolName) => waitEvents(client, (e) => ofType(e, EVENT_TYPE.settlement).find((s) => s.payload.by === SETTLED_BY.delegate && s.payload.delegate?.toolName === toolName), 'a delegate settlement')

export function registerDelegateCases(sdk) {
  row(sdk, 'DLG-01', 'UC + EP (allow)', 'the call runs; no permission offer; one settlement {allowed, by delegate, delegate {name, toolName, reason}} to the manager; the delegate saw the K1 descriptor', async (t) => {
    const w = await world(sdk)
    const p = await principal(t, w)
    const sid = await managed(w, p)
    await w.call('delegateScript', { name: D.name, sessionId: sid, verdict: { verdict: 'allow', reason: ' in scope ' } })
    const r = await drive(w, sid)
    assert.equal((await decided(w, r.text, sid)).outcome, IX.outcome.allowed)
    const s = await delegateSettlement(p.client, IX.fixture.askTool)
    assert.equal(s.sourceSessionId, sid)
    assert.deepEqual([s.payload.outcome, s.payload.delegate], [SETTLEMENT_OUTCOME.allowed, { name: D.name, toolName: IX.fixture.askTool, reason: 'in scope' }])
    assert.deepEqual(ofType(await pending(p.client), EVENT_TYPE.permission).filter((e) => e.payload.reason === IX.fixture.reason(r.text)), [])
    const seen = (await w.call('delegateSeen')).at(-1)
    assert.equal(seen.sessionId, sid)
    assert.equal(seen.descriptor.approvalId, s.payload.approvalId)
    assert.equal(seen.descriptor.reason, IX.fixture.reason(r.text))
    await w.call('delegateScript', { name: D.name, sessionId: sid, verdict: null })
    await free(w, sid)
  })

  row(sdk, 'DLG-02', 'EP (reject)', 'the call is rejected; the agent reads the managing-agent wording with the reason; settlement {rejected, by delegate}', async (t) => {
    const w = await world(sdk)
    const p = await principal(t, w)
    const sid = await managed(w, p)
    await w.call('delegateScript', { name: D.name, sessionId: sid, verdict: { verdict: 'reject', reason: 'beyond the purpose and dangerous' } })
    const r = await drive(w, sid)
    assert.equal((await decided(w, r.text, sid)).outcome, IX.outcome.rejected)
    assert.equal((await delegateSettlement(p.client, IX.fixture.askTool)).payload.outcome, SETTLEMENT_OUTCOME.rejected)
    await w.call('idle', { sessionId: sid })
    const [result] = await resultsOf(w, sid, r.id)
    assert.ok(result?.text.includes('beyond the purpose and dangerous'), JSON.stringify(result))
    await w.call('delegateScript', { name: D.name, sessionId: sid, verdict: null })
  })

  // DT over the delegate's answer → the offer's `delegate` (the user, 2026-11-21: a judged pass is told from a failure).
  const OFFERED = [
    ['pass, no reason', { verdict: 'pass' }, { name: D.name, outcome: D.outcome.passed }],
    ['pass with a padded reason', { verdict: 'pass', reason: '  high risk  ' }, { name: D.name, outcome: D.outcome.passed, reason: 'high risk' }],
    ['a plain throw (its name)', D.throws, { name: D.name, outcome: D.outcome.failed, reason: 'Error' }],
    ['a throw with a code', { throwCode: 'judge-timeout' }, { name: D.name, outcome: D.outcome.failed, reason: 'judge-timeout' }],
    ['an unknown verdict', { verdict: 'grant', reason: 'x' }, { name: D.name, outcome: D.outcome.failed, reason: D.invalidVerdict }],
    ['allow with an empty reason', { verdict: 'allow', reason: ' ' }, { name: D.name, outcome: D.outcome.failed, reason: D.invalidVerdict }],
  ]
  row(sdk, 'DLG-03', 'DT (pass / throw / invalid → manager, with delegate {outcome})', 'each leaves the request to the manager: one permission offer whose descriptor (and approvals_list row) carries delegate {name, outcome passed | failed, reason?}; no delegate settlement', async (t) => {
    const w = await world(sdk)
    const p = await principal(t, w)
    for (const [label, verdict, expected] of OFFERED) {
      const sid = await managed(w, p)
      await w.call('delegateScript', { name: D.name, sessionId: sid, verdict })
      const r = await drive(w, sid)
      const offer = await waitEvents(p.client, (e) => ofType(e, EVENT_TYPE.permission).find((x) => x.payload.reason === IX.fixture.reason(r.text)), 'a permission offer: ' + label)
      assert.deepEqual(offer.payload.delegate, expected, label)
      const row = (await listed(p, sid)).find((x) => x.approvalId === offer.payload.approvalId)
      assert.deepEqual(row?.delegate, expected, label + ': approvals_list')
      await quiet()
      assert.equal(ofType(await pending(p.client), EVENT_TYPE.settlement).filter((s) => s.sourceSessionId === sid).length, 0, label)
      await w.call('delegateScript', { name: D.name, sessionId: sid, verdict: null })
      await free(w, sid)
    }
  })

  row(sdk, 'DLG-05', 'EP (no delegate claims)', 'a managed session no delegate claims → the offer and its approvals_list row carry no delegate field', async (t) => {
    const w = await world(sdk)
    const p = await principal(t, w)
    const sid = await managed(w, p)
    const r = await drive(w, sid)
    const offer = await waitEvents(p.client, (e) => ofType(e, EVENT_TYPE.permission).find((x) => x.payload.reason === IX.fixture.reason(r.text)), 'a permission offer')
    assert.equal('delegate' in offer.payload, false, JSON.stringify(offer.payload))
    const row = (await listed(p, sid)).find((x) => x.approvalId === offer.payload.approvalId)
    assert.ok(row, 'not listed')
    assert.equal('delegate' in row, false, JSON.stringify(row))
    await free(w, sid)
  })

  row(sdk, 'DLG-04', 'DT (unmanaged)', 'an unmanaged session never reaches a delegate: the stock prompt shows', async () => {
    const w = await world(sdk)
    const sid = await session(w)
    const before = (await w.call('delegateSeen')).length
    await w.call('delegateScript', { name: D.name, sessionId: sid, verdict: { verdict: 'allow', reason: 'x' } })
    const r = await drive(w, sid)
    assert.ok(await eventually(async () => (await stockFor(w, r.text)).length > 0), 'no stock prompt')
    assert.equal((await w.call('delegateSeen')).length, before)
    await w.call('delegateScript', { name: D.name, sessionId: sid, verdict: null })
    await free(w, sid)
  })
}
