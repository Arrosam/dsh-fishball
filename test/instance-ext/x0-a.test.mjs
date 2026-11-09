/**
 * W0 / X0-A (server half) — the approvals seam and per-session claims (X15, §2.6).
 *
 * Observation points: `fishballInstance.approvals` (claim, card, onSettled, answerApproval), the
 * manager's `answer_approval` tool, bridge requests, open cards and reached-layer ordinary
 * transcript entries (U17/§12.4). There is no retained decision-label/closed-card store.
 * Connector tool-result/card clearing and rendered attribution remain K2/PANELS TODOs.
 *
 * Techniques: DT (routing and decisions), EP (claim acceptance), ST (claim lifecycle), P.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, it } from 'node:test'
import { bootChild, messageText, tempDir } from '../support/instance-ext.mjs'

const OWNER = 'fishball-watchdog'
const SID = 'session-asker'
const OTHER = 'session-other'
const BRIEF = 'brief-1'
const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms))

async function live(t, options) {
  const h = await bootChild(t, { activate: true, ...options })
  return { h, service: h.requireInstance() }
}

/** One live card descriptor; the envelope's sessionId carries the target session. */
function descriptor(changes = {}) {
  return {
    approvalId: 'apr_1',
    offerId: 'off_1',
    kind: 'approval',
    prompt: 'Allow bash?',
    choices: ['allow', 'reject'],
    title: 'Asking session',
    at: Date.now(),
    toolName: 'bash',
    callId: 'call-1',
    reason: 'needs to list files',
    quotes: [],
    ...changes,
  }
}

const seenBy = (list) => (card) => list.push(card)
const approvalRequests = (h) => h.host.requests.filter((request) => request.operation === 'approval.answer')
const managerHistory = (h) => JSON.stringify(h.manager().session.snapshotEvents())
const managerTurns = (h) => h.manager().followups.map(messageText).join('\n')

/** U17 removes labels, not necessarily an old empty compatibility accessor. */
function noRetainedLabels(service) {
  assert.deepEqual(service.approvals.labels?.() ?? [], [], 'no retained decision-attribution labels')
}

/** X14 must hold a session before X15 can claim it. */
function supervise(service) {
  return service.supervision.register(OWNER)
}

function claim(h, service, sessionId, onCard = () => {}) {
  return service.approvals.claim(sessionId, { id: OWNER, name: 'Watchdog', onCard })
}

describe('X0-A X15 claim acceptance (EP)', () => {
  it('XA-P-01 a claim returns a release function; card() and onSettled are exposed', async (t) => {
    const { h, service } = await live(t)
    const reg = supervise(service)
    reg.set(SID, 'active', BRIEF)
    const release = claim(h, service, SID)
    assert.equal(typeof release, 'function')
    const settled = []
    service.approvals.onSettled((event) => settled.push(event))
    h.host.event('approval.request', descriptor(), SID)
    await tick()
    assert.equal(service.approvals.card('apr_1')?.approvalId, 'apr_1')
    h.host.event('approval.settled', { approvalId: 'apr_1', decision: 'allow', by: 'user' })
    await tick()
    assert.equal(service.approvals.card('apr_1'), undefined)
    assert.equal(settled.length, 1)
    release()
    reg.dispose()
  })

  it('XA-EP-01 active, paused and halted are claimable', async (t) => {
    const { service } = await live(t)
    const reg = supervise(service)
    for (const [sid, state] of [[SID, 'active'], [OTHER, 'paused'], ['session-halted', 'halted']]) {
      reg.set(sid, state, BRIEF)
      const release = claim(null, service, sid)
      assert.equal(typeof release, 'function', state + ' is claimable')
      release()
    }
    reg.dispose()
  })

  it('XA-EP-02 none, dormant and cleared are refused not-supervised', async (t) => {
    const { service } = await live(t)
    const reg = supervise(service)
    assert.deepEqual(claim(null, service, 'session-none'), { code: 'not-supervised' })
    reg.set(SID, 'dormant', BRIEF)
    assert.deepEqual(claim(null, service, SID), { code: 'not-supervised' }, 'dormant')
    reg.set(OTHER, 'active', BRIEF)
    reg.clear(OTHER)
    assert.deepEqual(claim(null, service, OTHER), { code: 'not-supervised' }, 'cleared')
    reg.dispose()
  })

  it('XA-EP-03 a second claim on one session gets owner-busy', async (t) => {
    const { service } = await live(t)
    const reg = supervise(service)
    reg.set(SID, 'active', BRIEF)
    const first = claim(null, service, SID)
    const second = claim(null, service, SID)
    assert.deepEqual(second, { code: 'owner-busy' })
    first()
    reg.dispose()
  })

  it('XA-EP-04 two sessions are independent: each card reaches only its own claimant', async (t) => {
    const { h, service } = await live(t)
    const reg = supervise(service)
    reg.set(SID, 'active', BRIEF)
    reg.set(OTHER, 'active', BRIEF)
    const first = []
    const second = []
    claim(h, service, SID, seenBy(first))
    claim(h, service, OTHER, seenBy(second))
    h.host.event('approval.request', descriptor({ approvalId: 'apr-one' }), SID)
    h.host.event('approval.request', descriptor({ approvalId: 'apr-two', offerId: 'off-2' }), OTHER)
    await tick()
    assert.deepEqual(first.map((card) => card.approvalId), ['apr-one'])
    assert.deepEqual(second.map((card) => card.approvalId), ['apr-two'])
    reg.dispose()
  })
})

describe('X0-A X15 claim lifecycle (ST)', () => {
  it('XA-ST-01 active → paused/halted keep the claim; dormant or clear drops it; the next card goes to Fishball', async (t) => {
    const { h, service } = await live(t)
    const reg = supervise(service)
    reg.set(SID, 'active', BRIEF)
    const seen = []
    claim(h, service, SID, seenBy(seen))
    h.host.event('approval.request', descriptor({ approvalId: 'apr-a' }), SID)
    await tick()
    assert.equal(seen.length, 1, 'active: claimed')
    reg.set(SID, 'paused', BRIEF)
    h.host.event('approval.request', descriptor({ approvalId: 'apr-p', offerId: 'off-p' }), SID)
    await tick()
    assert.equal(seen.length, 2, 'paused: still claimed (U8)')
    reg.set(SID, 'halted', BRIEF)
    h.host.event('approval.request', descriptor({ approvalId: 'apr-h', offerId: 'off-h' }), SID)
    await tick()
    assert.equal(seen.length, 3, 'halted: still claimed (U8)')
    reg.set(SID, 'dormant', BRIEF)
    h.host.event('approval.request', descriptor({ approvalId: 'apr-d', offerId: 'off-d' }), SID)
    await tick()
    assert.equal(seen.length, 3, 'dormant: the instance dropped the claim')
    reg.set(SID, 'active', BRIEF)
    claim(h, service, SID, seenBy(seen))
    reg.clear(SID)
    h.host.event('approval.request', descriptor({ approvalId: 'apr-c', offerId: 'off-c' }), SID)
    await tick()
    assert.equal(seen.length, 3, 'clear: dropped')
    reg.dispose()
  })

  it('XA-ST-02 release() drops the claim; the next card goes to Fishball', async (t) => {
    const { h, service } = await live(t)
    const reg = supervise(service)
    reg.set(SID, 'active', BRIEF)
    const seen = []
    const release = claim(h, service, SID, seenBy(seen))
    release()
    h.host.event('approval.request', descriptor(), SID)
    await tick()
    assert.equal(seen.length, 0)
    reg.dispose()
  })

  it('XA-ST-03 U17 an open card settles once and is cleared, not retained as a closed card', async (t) => {
    const { h, service } = await live(t)
    const reg = supervise(service)
    reg.set(SID, 'active', BRIEF)
    claim(h, service, SID)
    h.host.event('approval.request', descriptor(), SID)
    await tick()
    assert.ok(service.approvals.card('apr_1'))
    h.host.event('approval.settled', { approvalId: 'apr_1', decision: 'reject', by: 'user' })
    await tick()
    assert.equal(service.approvals.card('apr_1'), undefined)
    h.host.event('approval.settled', { approvalId: 'apr_1', decision: 'reject', by: 'user' })
    await tick()
    assert.equal(service.approvals.card('apr_1'), undefined, 'repeated settlement cannot restore a closed card')
    noRetainedLabels(service)
    reg.dispose()
  })
})

describe('X0-A §2.6 routing table', () => {
  const RULES = [
    { state: 'none', claimed: false, target: 'fishball' },
    { state: 'active', claimed: true, target: 'watchdog' },
    { state: 'paused', claimed: true, target: 'watchdog' },
    { state: 'halted', claimed: true, target: 'watchdog' },
    { state: 'dormant', claimed: false, target: 'fishball' },
  ]

  it('XA-DT-01 X14 state × claim → the card goes to the watchdog or to Fishball', async (t) => {
    for (const rule of RULES) {
      const { h, service } = await live(t)
      const reg = supervise(service)
      const seen = []
      if (rule.state !== 'none') reg.set(SID, rule.state, BRIEF)
      if (rule.claimed) claim(h, service, SID, seenBy(seen))
      h.host.event('approval.request', descriptor(), SID)
      await tick()
      assert.equal(seen.length, rule.target === 'watchdog' ? 1 : 0, rule.state + ' → ' + rule.target)
      reg.dispose()
      await h.close()
    }
  })

  it('XA-DT-02 enabled but not registered, and disabled, route cards to Fishball', async (t) => {
    const enabled = await live(t)
    enabled.h.host.event('approval.request', descriptor(), SID)
    await tick()
    assert.equal(enabled.service.approvals.card('apr_1')?.approvalId, 'apr_1', 'enabled, no registrant, no claim → Fishball')
    await enabled.h.close()
    const disabled = await live(t, { watchdogEnabled: false })
    disabled.h.host.event('approval.request', descriptor(), SID)
    await tick()
    assert.equal(disabled.service.approvals.card('apr_1')?.approvalId, 'apr_1', 'disabled → Fishball')
  })
})

describe('X0-A X15 decisions', () => {
  it('XA-DT-03 a decidedBy answer on a card of an unclaimed session is refused and reaches no connector', async (t) => {
    const { h, service } = await live(t)
    const reg = supervise(service)
    reg.set(SID, 'active', BRIEF)
    // The card is live but this caller has claimed no session.
    h.host.event('approval.request', descriptor(), SID)
    await tick()
    const before = approvalRequests(h).length
    const result = await service.approvals.answerApproval({
      approvalId: 'apr_1', offerId: 'off_1', decision: 'allow', reason: 'ok',
      decidedBy: { kind: 'watchdog', id: OWNER, name: 'Watchdog' },
    })
    assert.equal(result.ok, false)
    assert.equal(approvalRequests(h).length, before, 'the refusal is local')
    reg.dispose()
  })

  it('XA-DT-04 a claimed session accepts a decidedBy allow; a grant is delegate-no-grant', async (t) => {
    const { h, service } = await live(t)
    const reg = supervise(service)
    reg.set(SID, 'active', BRIEF)
    claim(h, service, SID)
    h.host.event('approval.request', descriptor(), SID)
    await tick()
    const allowed = await service.approvals.answerApproval({
      approvalId: 'apr_1', offerId: 'off_1', decision: 'allow', reason: 'ok',
      decidedBy: { kind: 'watchdog', id: OWNER, name: 'Watchdog' },
    })
    assert.notEqual(allowed.code, 'delegate-no-grant')
    h.host.event('approval.request', descriptor({ approvalId: 'apr_2', offerId: 'off_2' }), SID)
    await tick()
    const granted = await service.approvals.answerApproval({
      approvalId: 'apr_2', offerId: 'off_2', decision: 'grant', reason: 'ok',
      grant: { kind: 'exact', expiresAt: Date.now() + 60_000 },
      decidedBy: { kind: 'watchdog', id: OWNER, name: 'Watchdog' },
    })
    assert.equal(granted.ok, false)
    assert.equal(granted.code, 'delegate-no-grant')
    reg.dispose()
  })

  it('XA-DT-05 the manager grant on a claimed session is grant-off-supervised; on an unclaimed one it is not', async (t) => {
    const { h, service } = await live(t)
    const reg = supervise(service)
    reg.set(SID, 'active', BRIEF)
    reg.set(OTHER, 'active', BRIEF)
    claim(h, service, SID)
    h.host.event('approval.request', descriptor(), SID)
    h.host.event('approval.request', descriptor({ approvalId: 'apr_other', offerId: 'off_other' }), OTHER)
    await tick()
    const grant = { kind: 'exact', expires_at: new Date(Date.now() + 60_000).toISOString() }
    const claimed = await h.tool('answer_approval', { request_id: 'apr_1', decision: 'grant', reason: 'ok', grant })
    assert.equal(claimed.ok, false)
    assert.equal(claimed.code, 'grant-off-supervised')
    const unclaimed = await h.tool('answer_approval', { request_id: 'apr_other', decision: 'grant', reason: 'ok', grant })
    assert.notEqual(unclaimed.code, 'grant-off-supervised')
    reg.dispose()
  })

  it('XA-EP-05 U17 legacy labels and closed/retired cards are not restored or imported into Fishball history', async (t) => {
    const home = await tempDir(t, 'fbtest-instance-ext-approval-')
    await mkdir(path.join(home, 'fishball'), { recursive: true })
    const old = {
      decisionId: 'dec-old', kind: 'approval', sessionId: SID, title: 'legacy-label-do-not-import', at: 1,
      request: {}, answer: 'allow', outcome: 'allow', settled: { decision: 'allow', by: 'user', at: 2 }, waiting: false,
    }
    // Exercise the existing legacy input only; U17 specifies no replacement storage filename.
    await writeFile(path.join(home, 'fishball', 'decisions.json'), JSON.stringify({
      labels: [old], closed: [{ ...descriptor(), ...old }], retired: [{ ...old, approvalId: 'apr-retired' }],
    }))
    const h = await bootChild(t, { activate: true, home })
    const service = h.requireInstance()
    noRetainedLabels(service)
    assert.equal(service.approvals.card('apr_1'), undefined)
    assert.equal(service.approvals.card('apr-retired'), undefined)
    assert.doesNotMatch(managerHistory(h) + managerTurns(h), /legacy-label-do-not-import/)
    const page = await h.http('/api/chat')
    assert.doesNotMatch(await page.text(), /legacy-label-do-not-import/, 'legacy labels do not become transcript entries')
  })
})


describe('X0-A U17 reached-layer settlement records (server boundary)', () => {
  it('XA-DT-06 watchdog-only settlement clears the instance card without a Fishball record or wake', async (t) => {
    const { h, service } = await live(t)
    const reg = supervise(service)
    reg.set(SID, 'active', BRIEF)
    const handled = []
    claim(h, service, SID, seenBy(handled))
    const settled = []
    service.approvals.onSettled((event) => settled.push(event))
    h.host.event('approval.request', descriptor(), SID)
    await tick()
    assert.equal(handled.length, 1, 'watchdog actually handled this request')
    const beforeHistory = managerHistory(h)
    const beforeTurns = h.manager().followups.length
    const answer = await service.approvals.answerApproval({
      approvalId: 'apr_1', offerId: 'off_1', decision: 'allow', reason: 'allowed by the existing permission rules',
      decidedBy: { kind: 'watchdog', id: OWNER, name: 'Watchdog' },
    })
    assert.notEqual(answer.ok, false)
    assert.equal(approvalRequests(h).at(-1)?.payload.decision, 'allow', 'normal connector answer path')
    for (let delivery = 0; delivery < 2; delivery++) {
      h.host.event('approval.settled', { approvalId: 'apr_1', decision: 'allow', by: 'fishball' })
      await tick()
    }
    assert.equal(service.approvals.card('apr_1'), undefined)
    noRetainedLabels(service)
    assert.equal(managerHistory(h), beforeHistory, 'unreached Fishball transcript receives no automatic decision')
    assert.equal(h.manager().followups.length, beforeTurns, 'no Fishball wake or held automatic import')
    assert.equal(settled.length, 1, 'repeated settlement does not duplicate the callback')
    reg.dispose()
  })

  it('XA-DT-07 a user settlement reaching Fishball records attribution and wakes it once under repeated delivery', async (t) => {
    const { h, service } = await live(t)
    h.host.event('approval.request', descriptor(), SID)
    await tick()
    await h.tool('answer_approval', { request_id: 'apr_1', decision: 'escalate', reason: 'Samuel must decide' })
    const beforeTurns = h.manager().followups.length
    h.host.event('approval.settled', { approvalId: 'apr_1', decision: 'allow', by: 'user' })
    await tick()
    assert.equal(service.approvals.card('apr_1'), undefined)
    assert.equal(h.manager().followups.length, beforeTurns + 1, 'one waking resolution note for the user decision')
    const onceHistory = managerHistory(h)
    const onceTurns = managerTurns(h)
    assert.match(onceHistory + onceTurns, /\[approval apr_1\] decided by user: allow/, 'ordinary reached-layer result carries attribution')
    noRetainedLabels(service)
    h.host.event('approval.settled', { approvalId: 'apr_1', decision: 'allow', by: 'user' })
    await tick()
    assert.equal(managerHistory(h), onceHistory, 'no duplicate transcript record')
    assert.equal(managerTurns(h), onceTurns, 'no duplicate resolution turn')
    assert.equal(service.approvals.card('apr_1'), undefined)
  })
})

// Defined continuations of the approval story; not claims of W0 UI/real-session coverage.
it.todo('XA-UC-SETTLE-M Samuel answers an escalated request — deferred: [K2/PANELS] normal requesting-tool result returns; pile/session/Fishball/user-result cards clear immediately and never return on repeated callbacks or reload')
it.todo('XA-UC-HISTORY-M Samuel can find a reached decision later — deferred: [PANELS/WD-9/WD-10] each reached layer records once with transcript attribution, watchdog-only never imports automatically, claim without handling adds no watchdog history')
it.todo('XA-UC-HISTORY-A Samuel continues after compaction — deferred: [PANELS/WD-8] decision leaves model context but remains searchable in reached transcripts; reload restores neither cards nor retained labels; explicit watchdog_decisions pull alone may return watchdog-only history')
