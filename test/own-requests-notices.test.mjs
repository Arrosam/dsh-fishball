/**
 * OwnRequests notification regression, derived from the decision/lifecycle contract.
 * The real component is integrated with in-memory storage, intake and agent ports:
 * this makes queue/injection failures deterministic without adding production hooks.
 * The HTTP/card/real-host boundary is covered by rev11f-request.test.mjs OWN-03/07/09.
 *
 * EP/decision table:
 *   Allow + queue works                       -> one approval, no rejection, pass
 *   Allow + queue fails + injection works      -> one approval, no rejection, pass
 *   Allow + queue fails + injection unavailable-> no notice yet; catchUp gives approval
 *   Reject (+/- note, live/offline)            -> one rejection, no wake, no pass
 * BVA: notification counts 0/1/2; pass uses 0/1/2; before/after the owning turn end.
 * ST: waiting -> approved -> used / expired; waiting -> rejected; duplicate answers
 * in each settled state are false and cannot produce a second notification.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { OwnRequests } from '../src/own-requests.js'
import { CLICK, OWN_STATUS } from './support/constants.mjs'
import { assertOwnNotices } from './support/own-request-notices.mjs'
import { textOf, until } from './support/util.mjs'

const CASE = Object.freeze({
  sessionId: 'own-notice-assistant',
  tool: 'demo_echo',
  otherTool: 'other_echo',
  args: Object.freeze({ text: 'notice regression', command: 'original-call' }),
  changedCommand: 'different-call',
  reason: 'Exercise the requested one-time approval',
  note: 'Please leave this request unrun',
  argumentStatus: 'complete',
  event: Object.freeze({ session: 'session/event', start: 'turn/start', message: 'user/message', end: 'turn/end' }),
  turn: 1,
  unrelatedTurn: 2,
  deliveryError: 'controlled notice delivery failure',
  limits: Object.freeze({ rationaleChars: 256, argumentExcerptBytes: 4096, auditEntriesKept: 100 }),
  timeoutMs: 1000,
  pollMs: 1,
})

class MemoryTable extends Map {
  async put(key, record) { this.set(key, structuredClone(record)) }
}

function boundary() {
  const listeners = new Map()
  const store = { ownRequests: new MemoryTable(), decisions: new MemoryTable() }
  const events = []
  const session = { id: CASE.sessionId, snapshotEvents: () => structuredClone(events) }
  const published = []
  const injected = []
  const control = { queueFails: false, injectionFails: false, live: true, wakeAttempts: 0 }
  const agent = { inject(message) {
    if (control.injectionFails) throw new Error(CASE.deliveryError)
    injected.push(message)
  } }
  const own = new OwnRequests({ on(name, listener) { listeners.set(name, listener) } }, store, { warn() {} }, {
    ledger: { async publish(input) {
      control.wakeAttempts++
      if (control.queueFails) throw new Error(CASE.deliveryError)
      published.push(input.message)
    } },
    readLimits: () => CASE.limits,
    assistantId: () => CASE.sessionId,
    agentOf: () => control.live ? agent : undefined,
    onChange() {},
  })
  return {
    own, session, control, published, injected,
    row: (id) => store.ownRequests.get(id),
    notices: (id) => [...published, ...injected].map((message) => ({ id: message.id, text: textOf(message.content) })).filter((message) => message.text.includes(id)),
    file: () => own.file({ toolName: CASE.tool, args: { text: JSON.stringify(CASE.args), status: CASE.argumentStatus, value: CASE.args }, reason: CASE.reason }, () => false),
    emit(type, data) {
      const event = { type, data }
      events.push(event)
      listeners.get(CASE.event.session)(session, event)
    },
  }
}

async function assertDuplicates(b, id, expected) {
  const notices = b.notices(id)
  const wakeAttempts = b.control.wakeAttempts
  for (const decision of [CLICK.allow, CLICK.reject]) assert.equal(await b.own.answer(id, decision), false, 'a settled card cannot be answered again')
  await b.own.catchUp(b.session)
  assert.deepEqual(b.notices(id), notices, 'duplicate answers and catch-up do not notify again')
  assert.equal(b.control.wakeAttempts, wakeAttempts, 'no second wake attempt')
  assert.equal(b.row(id).status, expected)
}

const ALLOW_DELIVERY = Object.freeze([
  { name: 'queue accepts', queueFails: false },
  { name: 'queue fails, live agent accepts', queueFails: true },
])

describe('OwnRequests decision and notification boundary', () => {
  for (const delivery of ALLOW_DELIVERY) it('Allow: ' + delivery.name + '; exactly one approval, no rejection; identical pass used once', async () => {
    const b = boundary()
    Object.assign(b.control, delivery)
    const id = await b.file()
    assert.equal(b.row(id).status, OWN_STATUS.waiting)
    assert.equal(await b.own.answer(id, CLICK.allow), true)
    assert.equal(b.row(id).status, OWN_STATUS.approved)
    assert.deepEqual(b.own.cards(), [])
    assertOwnNotices(b.notices(id), { approved: 1, rejected: 0 })
    await assertDuplicates(b, id, OWN_STATUS.approved)
    assert.equal(await b.own.takePass(CASE.otherTool, CASE.args), undefined, 'another tool has no pass')
    assert.equal(await b.own.takePass(CASE.tool, { ...CASE.args, command: CASE.changedCommand }), undefined, 'changed arguments have no pass')
    assert.equal(b.row(id).status, OWN_STATUS.approved)
    assert.equal(await b.own.takePass(CASE.tool, structuredClone(CASE.args)), id)
    assert.equal(b.row(id).status, OWN_STATUS.used)
    assert.equal(await b.own.takePass(CASE.tool, CASE.args), undefined, 'second use is refused')
    await assertDuplicates(b, id, OWN_STATUS.used)
    assertOwnNotices(b.notices(id), { approved: 1, rejected: 0 })
  })

  for (const unavailable of [
    { name: 'agent offline', live: false, injectionFails: false },
    { name: 'live injection throws', live: true, injectionFails: true },
  ]) it('Allow: both delivery paths fail (' + unavailable.name + '); later catchUp gives only approval', async () => {
    const b = boundary()
    Object.assign(b.control, unavailable, { queueFails: true })
    const id = await b.file()
    assert.equal(await b.own.answer(id, CLICK.allow), true)
    assert.equal(b.row(id).status, OWN_STATUS.approved, 'failed delivery never changes Allow into Reject')
    assertOwnNotices(b.notices(id), { approved: 0, rejected: 0 })
    await assertDuplicates(b, id, OWN_STATUS.approved)
    Object.assign(b.control, { live: true, injectionFails: false })
    await b.own.catchUp(b.session)
    await b.own.catchUp(b.session)
    assert.equal(b.row(id).status, OWN_STATUS.approved)
    assertOwnNotices(b.notices(id), { approved: 1, rejected: 0 })
    assert.equal(await b.own.takePass(CASE.tool, CASE.args), id)
    assert.equal(b.row(id).status, OWN_STATUS.used)
    assertOwnNotices(b.notices(id), { approved: 1, rejected: 0 })
  })

  for (const note of [undefined, CASE.note]) it('Reject: ' + (note ? 'with note' : 'without note') + '; one rejection, no approval or wake, no pass', async () => {
    const b = boundary()
    const id = await b.file()
    assert.equal(await b.own.answer(id, CLICK.reject, note), true)
    assert.equal(b.row(id).status, OWN_STATUS.rejected)
    assertOwnNotices(b.notices(id), { approved: 0, rejected: 1 })
    assert.equal(b.published.length, 0)
    assert.equal(b.control.wakeAttempts, 0, 'Reject preserves the non-waking behavior')
    if (note) assert.ok(b.notices(id)[0].text.includes(note))
    assert.equal(await b.own.takePass(CASE.tool, CASE.args), undefined)
    await assertDuplicates(b, id, OWN_STATUS.rejected)
  })

  it('Reject while offline: catchUp gives one rejection without waking or granting a pass', async () => {
    const b = boundary()
    b.control.live = false
    const id = await b.file()
    assert.equal(await b.own.answer(id, CLICK.reject, CASE.note), true)
    assert.equal(b.row(id).status, OWN_STATUS.rejected)
    assertOwnNotices(b.notices(id), { approved: 0, rejected: 0 })
    b.control.live = true
    await b.own.catchUp(b.session)
    await b.own.catchUp(b.session)
    assertOwnNotices(b.notices(id), { approved: 0, rejected: 1 })
    assert.equal(b.control.wakeAttempts, 0)
    assert.equal(await b.own.takePass(CASE.tool, CASE.args), undefined)
    await assertDuplicates(b, id, OWN_STATUS.rejected)
  })

  it('Unused approval expires exactly at its owning turn end, without a rejection', async () => {
    const b = boundary()
    const id = await b.file()
    assert.equal(await b.own.answer(id, CLICK.allow), true)
    assert.equal(b.row(id).status, OWN_STATUS.approved)
    b.emit(CASE.event.start, { turn: CASE.turn })
    b.emit(CASE.event.message, b.published[0])
    b.emit(CASE.event.end, { turn: CASE.unrelatedTurn })
    await b.own.catchUp(b.session)
    assert.equal(b.row(id).status, OWN_STATUS.approved, 'unrelated turn end does not expire this pass')
    b.emit(CASE.event.end, { turn: CASE.turn })
    assert.ok(await until(() => b.row(id).status === OWN_STATUS.expired, CASE.timeoutMs, CASE.pollMs), 'owning turn ends the unused pass')
    assert.equal(await b.own.takePass(CASE.tool, CASE.args), undefined)
    await assertDuplicates(b, id, OWN_STATUS.expired)
    assertOwnNotices(b.notices(id), { approved: 1, rejected: 0 })
  })
})
