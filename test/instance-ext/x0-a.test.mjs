/**
 * W0 / X0-A — the approval seam and the escalation card (X15).
 *
 * Observation points: the `fishballInstance.approvals` members, the bridge requests the child
 * sends, the manager's `answer_approval` tool, and the durable decision record the child loads.
 *
 * Techniques: DT, EP, ST, P. Every case names its X point.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, it } from 'node:test'
import { bootChild, tempDir } from '../support/instance-ext.mjs'

const SID = 'session-asker'
const APPROVAL = 'apr_1'
const OFFER = 'off_1'
const DELEGATE = { id: 'fishball-watchdog', name: 'Watchdog', onCard() {} }

async function live(t, options) {
  const h = await bootChild(t, { activate: true, ...options })
  return { h, service: h.requireInstance() }
}

function descriptor(changes = {}) {
  return {
    approvalId: APPROVAL,
    offerId: OFFER,
    kind: 'approval',
    prompt: 'Allow bash?',
    choices: ['allow', 'reject'],
    expiresAt: Date.now() + 60_000,
    title: 'Asking session',
    at: Date.now(),
    toolName: 'bash',
    callId: 'call-1',
    reason: 'needs to list files',
    quotes: [],
    ...changes,
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20))
const approvalRequests = (h) => h.host.requests.filter((request) => request.operation === 'approval.answer')

describe('X0-A X15 approval seam', () => {
  it('XA-DT-01 a second delegate gets owner-busy', async (t) => {
    const { h, service } = await live(t)
    const first = service.approvals.setDelegate(DELEGATE)
    assert.equal(typeof first, 'function')
    const second = service.approvals.setDelegate({ ...DELEGATE, id: 'fishball-board' })
    assert.deepEqual(second, { code: 'owner-busy' })
    first()
  })

  it('XA-DT-02 the delegate sees every offered approval through onCard', async (t) => {
    const { h, service } = await live(t)
    const seen = []
    service.approvals.setDelegate({ ...DELEGATE, onCard: (card) => seen.push(card) })
    const card = descriptor()
    h.host.event('approval.request', card)
    await tick()
    assert.equal(seen.length, 1)
    assert.equal(seen[0].approvalId, APPROVAL)
    assert.equal(seen[0].kind, 'approval')
  })

  it('XA-P-01 card() and onSettled expose the live request and its outcome', async (t) => {
    const { h, service } = await live(t)
    const settled = []
    service.approvals.onSettled((event) => settled.push(event))
    h.host.event('approval.request', descriptor())
    await tick()
    const card = service.approvals.card(APPROVAL)
    assert.equal(card.approvalId, APPROVAL)
    h.host.event('approval.settled', { approvalId: APPROVAL, decision: 'allow', by: 'user' })
    await tick()
    assert.equal(service.approvals.card(APPROVAL), undefined)
    assert.equal(settled.length, 1)
    assert.equal(settled[0].decision, 'allow')
  })

  it('XA-DT-03 a delegate grant is refused delegate-no-grant and reaches no connector', async (t) => {
    const { h, service } = await live(t)
    h.host.event('approval.request', descriptor())
    await tick()
    const before = approvalRequests(h).length
    const result = await service.approvals.answerApproval({
      approvalId: APPROVAL,
      offerId: OFFER,
      decision: 'grant',
      reason: 'ok',
      grant: { kind: 'exact', expiresAt: Date.now() + 60_000 },
      decidedBy: { kind: 'watchdog', id: 'fishball-watchdog', name: 'Watchdog' },
    })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'delegate-no-grant')
    assert.equal(approvalRequests(h).length, before, 'the refusal is local')
  })

  it('XA-DT-04 the manager grant on a supervised session is refused grant-off-supervised', async (t) => {
    const { h, service } = await live(t)
    service.approvals.supervised([SID])
    h.host.event('approval.request', descriptor(), SID)
    await tick()
    const result = await h.tool('answer_approval', {
      request_id: APPROVAL,
      decision: 'grant',
      reason: 'ok',
      grant: { kind: 'exact', expires_at: new Date(Date.now() + 60_000).toISOString() },
    })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'grant-off-supervised')
  })

  it('XA-DT-05 the manager grant on an unsupervised session is allowed', async (t) => {
    const { h, service } = await live(t)
    service.approvals.supervised([])
    h.host.event('approval.request', descriptor(), SID)
    await tick()
    const result = await h.tool('answer_approval', {
      request_id: APPROVAL,
      decision: 'grant',
      reason: 'ok',
      grant: { kind: 'exact', expires_at: new Date(Date.now() + 60_000).toISOString() },
    })
    assert.notEqual(result.code, 'grant-off-supervised')
  })

  it('XA-EP-01 an old label without decidedBy loads as manager-decided', async (t) => {
    const home = await mkdtempHome(t)
    await mkdir(path.join(home, 'fishball'), { recursive: true })
    const old = {
      decisionId: 'dec-old', kind: 'approval', sessionId: SID, title: 'Old', at: 1,
      request: {}, answer: 'allow', outcome: 'allow', settled: { decision: 'allow', by: 'user', at: 2 }, waiting: false,
    }
    await writeFile(path.join(home, 'fishball', 'decisions.json'), JSON.stringify({ labels: [old], closed: [] }))
    const h = await bootChild(t, { activate: true, home })
    const labels = h.requireInstance().approvals.labels()
    assert.equal(labels.length, 1)
    assert.notEqual(labels[0].decidedBy?.kind, 'watchdog', 'never loaded as a watchdog decision')
  })
})

async function mkdtempHome(t) {
  return tempDir(t, 'fbtest-instance-ext-approval-')
}
