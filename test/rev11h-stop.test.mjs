/**
 * Revision 11 rev11h on H-STUB: stop and redirect of managed sessions (DESIGN §7a.12, §9 "Fishball's other
 * decisions"; requirements items 28-29; contract 1.1 §4.1 session.stop / session.redirect, §7 session codes;
 * slim §12: the instance now does them through the contract). Fishball is the stub instance; black-box: replies,
 * the session logs, the fake model's requests, the frames the stub receives and stored `decisions` rows. One host
 * (the question stand-in and the scripted stock prompt after the broker); a fresh managed session per case.
 *
 * | id      | technique | requirement | expected |
 * |---------|-----------|-------------|----------|
 * | STP-01  | EP (running turn, nothing pending) | §7a.12; §4.1 | {stopped:true}; the turn ends aborted; idle, still managed; the model script does not continue |
 * | STP-02  | ST (an ask_fishball waiting for the instance) | §7a.12 "its waiting requests … are cancelled" | the call ends aborted; the instance's late approval.answer is expired; the turn ends aborted; still managed |
 * | STP-02b | ST (a direct call waiting for the instance) | §7a.12; §7a.14 "a cancellation as cancelled" | the call ends; approval/decided cancelled in the session; the late answer is expired |
 * | STP-03  | ST (a question waiting for the instance) | §7a.12; §7a.10 | the own card closes; the result is an abort error; the instance's late question.answer is refused |
 * | STP-04  | ST (idle session) | §7a.12 "On an idle session it is a no-op"; §9 outcome idle | {stopped:true}; no new turn end, no model request; still managed |
 * | STP-05  | ST (stopped, then the next message) | §7a.12 | idle until the next message; a session.message then starts a turn that completes |
 * | STP-06  | ST (a message you queued before the stop) | §7a.12 "messages you queued stay parked" | no turn starts for it; it runs at the next wake |
 * | STP-07  | DT (target × refusal) | §4.1 "managed session"; §7 | a session that is yours: not-managed (its turn untouched); taken back: not-managed; Fishball's own: is-fishball; unknown: unknown-session; nothing stopped, nothing audited |
 * | STP-08  | EP (audit, with a reason) | §7a.12 "audited"; §9 | one decisions row action stop, by fishball, for the session, at a time; the reason kept as rationale |
 * | STP-09  | EP (reason optional) | §4.1 `reason?` | without a reason: {stopped:true}, audited |
 * | RDR-01  | EP (running turn) | §7a.12 redirect | {status:'delivered'}; old turn aborted; a new turn reads the instruction as a relay from Fishball and completes; the old script does not continue |
 * | RDR-02  | ST (a waiting ask_fishball, a waiting question) | §7a.12 | their offers end (late answers expired); the own card closes; the new turn runs |
 * | RDR-03  | ST (a message you queued before the redirect) | §7a.12 "Messages you queued before the stop run first" | yours is read first, the instruction after it |
 * | RDR-04  | DT (target × refusal) | §4.1; §7 | as STP-07; the running turn of a session that is yours is untouched; nothing delivered |
 * | RDR-05  | EP (audit) | §7a.12 "audited" | one decisions row action redirect, by fishball |
 * | RDR-06  | EP (idle managed session) | §7a.12 | {status:'delivered'}; the instruction starts a turn |
 * | RDR-07  | BVA (message '' allowed; attachments with an unknown hostRef) | §4.1 "message may be empty"; "expired … and nothing is sent" | '' is delivered; an unknown hostRef is refused expired and the turn is untouched |
 * | ORG-01  | EP (provenance) | §7a.12 "Redirect in the outbox" | a permission request from the redirected turn names Fishball (redirect_session) as its turn's origin, not message_session |
 *
 * Retired:
 * - STP-02's "the card leaves the pile" and the pile-click 409: the pile is deleted (slim §12).
 * - RDR-05's outbox row (kind redirect, delivered): the snapshot no longer carries the outbox (H-STUB facts: no `outbox` key).
 * - OFF-01 (Session messages switched off): the feature switches are gone (slim §12: "The four feature switches are gone").
 * - CAP-01/CAP-02 (messagesPerHour on redirect): `messagesPerHour` was removed with the in-process Fishball (slim §18.5 conn-OQ-20: "Removed with no reader left").
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ASK_FISHBALL, ASK_REASON, ASK_TOOL, RELAY_REDIRECT } from './support/constants.mjs'
import { HOOK, T, callStep, setManaged, step, untrustedBlock } from './support/expect.mjs'
import { stopStub } from './support/instance-stub.mjs'
import { A, Q, QSTUB, bootQ, codeOf, qTools, quiet, tokens, until } from './support/instance-stub-questions.mjs'

const { tok, cid } = tokens('STP')
const RUNNING = QSTUB.agent.running
const ABORTED = QSTUB.turnEnd.aborted
const COMPLETED = QSTUB.turnEnd.completed
/** DSH's approval outcome for a request whose asker was cancelled (§7a.14). */
const CANCELLED = /cancelled/
/** What a stopped tool call's result says (DSH's abort wording). */
const CALL_ABORTED = /abort|cancel/i
/** The origin line a permission request's notice carries (§7a.12 "Redirect in the outbox"). */
const ORIGIN = { redirect: /Fishball \(redirect_session\)/, message: /Fishball \(message_session\)/ }
const UNKNOWN_REF = 'href_fbtest_nowhere'

describe('Revision 11 rev11h on H-STUB: session.stop and session.redirect', () => {
  const ctx = {}
  let q
  before(async () => {
    Object.assign(ctx, await bootQ('rev11h-stop', { approver: true }))
    q = qTools(ctx)
  }, HOOK)
  after(async () => { await stopStub(ctx.booted) }, HOOK)

  /** A fresh managed session with its turn running, held at its first model request. */
  const running = async (label) => q.running(await q.session(label), label)
  const ends = async (sid) => (await q.turnEnds(sid)) ?? []
  /** The stop is ok: {stopped:true}, the turn settles idle and its last end is aborted. */
  async function stoppedAborted(sid, extra) {
    const r = await q.stop(sid, extra)
    assert.deepEqual(r.payload, { stopped: true }, JSON.stringify(r))
    await q.release(sid)
    assert.ok(await q.idle(sid), 'idle')
    assert.equal((await ends(sid)).at(-1), ABORTED)
    assert.ok(await q.isManaged(sid), 'still managed')
    return r
  }
  /** An ask_fishball (or direct call) waiting for the instance; returns its approval offer. */
  async function waitingApproval(sid, label, direct = false) {
    const text = tok(label)
    const id = cid(label)
    await q.free(sid)
    const ask = direct ? callStep({ text }, id) : step(ASK_FISHBALL, { tool: ASK_TOOL, arguments: { text }, quote: [], why: 'why ' + text }, id)
    await q.host().call('driveStart', { sessionId: sid, text: 'work ' + text, script: [ask, [{ text: 'done' }]] })
    const offer = (await q.stub().waitEvent(QSTUB.event.approvalRequest, (p) => p.reason === ASK_REASON(text) || p.reason === 'why ' + text))?.payload
    assert.ok(offer, 'the request reached the instance')
    return { offer, id, text }
  }
  const lateApproval = (sid, offer) => q.stub().op(QSTUB.op.approvalAnswer, { sessionId: sid, approvalId: offer.approvalId, offerId: offer.offerId, answer: { decision: QSTUB.decision.allow, risk: 'low', reason: 'late' } }, sid)

  it('STP-01 session.stop ends a running turn: aborted, idle, still managed', T, async () => {
    const sid = await running('stp01')
    const before = (await ends(sid)).length
    await stoppedAborted(sid)
    assert.equal((await ends(sid)).length, before + 1)
    await quiet()
    assert.equal(await q.modelSaw(sid, QSTUB.neverText + 'stp01'), 0, 'the old script did not continue')
    assert.equal(await q.status(sid), QSTUB.agent.idle, 'stays idle')
  })

  it('STP-02 an ask_fishball waiting for the instance is cancelled', T, async () => {
    const sid = await q.session('stp02')
    const { offer, id } = await waitingApproval(sid, '02')
    await stoppedAborted(sid)
    assert.match((await q.result(sid, id)).text, CALL_ABORTED, 'the ask_fishball call ended aborted')
    assert.equal(codeOf(await lateApproval(sid, offer)), QSTUB.code.expired)
  })

  it('STP-02b a direct call waiting for the instance: its approval settles cancelled', T, async () => {
    const sid = await q.session('stp02b')
    const { offer } = await waitingApproval(sid, '02b', true)
    await stoppedAborted(sid)
    assert.match(JSON.stringify(await q.host().call('approvalEvents', { sessionId: sid })), CANCELLED, 'the approval settled cancelled')
    assert.equal(codeOf(await lateApproval(sid, offer)), QSTUB.code.expired)
  })

  it('STP-03 a question waiting for the instance: the own card closes, the call is aborted, a late answer is refused', T, async () => {
    const sid = await q.session('stp03')
    const text = tok('03')
    const id = cid('03')
    const { card, offer } = await q.ask(sid, text, id, { questions: Q.single(text) })
    await stoppedAborted(sid)
    assert.equal(await q.cardState(sid, card.index), QSTUB.card.closed, 'the session\'s own card closed')
    const result = await q.result(sid, id)
    assert.equal(result.isError, true)
    assert.match(result.text, QSTUB.aborted)
    assert.ok(QSTUB.lateCodes.includes(codeOf(await q.answer(sid, offer.approvalId, { answers: A.single }))), 'the instance cannot answer it any more')
  })

  it('STP-04 stopping an idle managed session changes nothing', T, async () => {
    const sid = await q.session('stp04')
    await q.free(sid)
    const before = (await ends(sid)).length
    const reqs = (await q.host().call('requests', { sessionId: sid })).length
    assert.deepEqual((await q.stop(sid)).payload, { stopped: true })
    await quiet()
    assert.equal((await ends(sid)).length, before, 'no turn end written')
    assert.equal((await q.host().call('requests', { sessionId: sid })).length, reqs, 'no model request')
    assert.equal(await q.status(sid), QSTUB.agent.idle)
    assert.ok(await q.isManaged(sid))
    assert.equal(q.decisions({ sessionId: sid, action: QSTUB.action.stop })[0]?.outcome, QSTUB.outcome.idle, 'audited as a stop that found nothing running')
  })

  it('STP-05 after a stop the session waits for the next message, then runs it', T, async () => {
    const sid = await running('stp05')
    await stoppedAborted(sid)
    await quiet()
    assert.equal(await q.status(sid), QSTUB.agent.idle)
    const text = tok('05')
    assert.ok(((await q.message(sid, text)).payload?.status), 'delivered')
    assert.ok(await until(async () => (await q.modelSaw(sid, text)) > 0, QSTUB.resultWaitMs, QSTUB.pollMs), 'the next message started a turn')
    assert.ok(await q.idle(sid))
    assert.equal((await ends(sid)).at(-1), COMPLETED)
  })

  it('STP-06 a message you queued before the stop stays parked until the next wake', T, async () => {
    const sid = await running('stp06')
    const queued = tok('06q')
    await q.host().call('followup', { sessionId: sid, text: queued })
    await stoppedAborted(sid)
    await quiet()
    assert.equal(await q.status(sid), QSTUB.agent.idle, 'no turn started for the parked message')
    assert.equal(await q.modelSaw(sid, queued), 0, 'the model has not seen it')
    const next = tok('06n')
    assert.ok((await q.message(sid, next)).payload?.status)
    assert.ok(await until(async () => (await q.modelSaw(sid, queued)) > 0 && (await q.modelSaw(sid, next)) > 0, QSTUB.resultWaitMs, QSTUB.pollMs), 'both ran at the wake')
    assert.ok(await q.idle(sid))
  })

  /** Refusals for the not-yours targets (STP-07 / RDR-04): op(sid) must be refused with the code, and nothing audited. */
  async function refusesTargets(op, action) {
    const mine = await q.yours(action + '-yours')
    await q.running(mine, action + '-yours')
    assert.equal(codeOf(await op(mine)), QSTUB.code.notManaged, 'a session that is yours')
    assert.equal(await q.status(mine), RUNNING, 'its turn is untouched')
    await q.release(mine)
    assert.ok(await q.idle(mine))
    assert.equal((await ends(mine)).at(-1), COMPLETED)
    const back = await q.session(action + '-back')
    assert.equal((await setManaged(q.host(), back, false)).status, 200)
    assert.equal(codeOf(await op(back)), QSTUB.code.notManaged, 'taken back')
    const fb = await q.fishballId()
    assert.equal(codeOf(await op(fb)), QSTUB.code.isFishball, 'Fishball\'s own session')
    assert.equal(codeOf(await op(QSTUB.unknownSessionId)), QSTUB.code.unknownSession, 'unknown')
    for (const sid of [mine, back, fb, QSTUB.unknownSessionId]) assert.equal(q.decisions({ sessionId: sid, action }).length, 0, 'not audited: ' + sid)
    return { mine, back }
  }

  it('STP-07 not the instance\'s to stop: yours, taken back, Fishball\'s own, unknown', T, async () => {
    await refusesTargets((sid) => q.stop(sid), QSTUB.action.stop)
  })

  it('STP-08 stop is audited with its reason; STP-09 the reason is optional', T, async () => {
    const a = await running('stp08')
    const reason = 'fbtest reason ' + tok('08')
    await stoppedAborted(a, { reason })
    const rows = q.decisions({ sessionId: a, action: QSTUB.action.stop })
    assert.equal(rows.length, 1, JSON.stringify(rows))
    assert.equal(rows[0].by, QSTUB.by.fishball)
    assert.equal(rows[0].outcome, QSTUB.outcome.ok)
    assert.ok(JSON.stringify(rows[0]).includes(reason), 'the reason is kept')
    assert.ok(!Number.isNaN(Date.parse(rows[0].at)))
    const b = await running('stp09')
    await stoppedAborted(b)
    assert.equal(q.decisions({ sessionId: b, action: QSTUB.action.stop }).length, 1)
  })

  /** A redirect is delivered, the instruction is read in a new turn, and the session settles idle. */
  async function redirected(sid, text) {
    const r = await q.redirect(sid, text)
    assert.deepEqual(r.payload, { status: 'delivered' }, JSON.stringify(r))
    await q.release(sid)
    assert.ok(await until(async () => (await q.modelSaw(sid, text)) > 0, QSTUB.resultWaitMs, QSTUB.pollMs), 'a new turn read the instruction')
    assert.ok(await q.idle(sid))
  }

  it('RDR-01 redirect stops the turn and the instruction starts a new turn from Fishball', T, async () => {
    const sid = await running('rdr01')
    const text = tok('r01') + ' do Y instead'
    await redirected(sid, text)
    assert.deepEqual((await ends(sid)).slice(-2), [ABORTED, COMPLETED])
    const got = (await q.userLog(sid)).filter((m) => m.text.includes(text))
    assert.equal(got.length, 1)
    // The redirect tool is recorded in the relay's source (SOURCE.via.redirect, ORG-01).
    assert.deepEqual(got[0].source, { ...RELAY_REDIRECT, senderSessionId: await q.fishballId() })
    assert.equal(await q.modelSaw(sid, QSTUB.neverText + 'rdr01'), 0, 'the old script did not continue')
    assert.ok(await q.isManaged(sid))
  })

  it('RDR-02 redirect cancels the waiting approval and question, then the new turn runs', T, async () => {
    const a = await q.session('rdr02a')
    const { offer } = await waitingApproval(a, '02a')
    await redirected(a, tok('r02a'))
    assert.equal(codeOf(await lateApproval(a, offer)), QSTUB.code.expired, 'the approval offer ended')
    const b = await q.session('rdr02b')
    const text = tok('02b')
    const { card, offer: qo } = await q.ask(b, text, cid('02b'), { questions: Q.single(text) })
    await redirected(b, tok('r02b'))
    assert.equal(await q.cardState(b, card.index), QSTUB.card.closed, 'the question\'s own card closed')
    assert.ok(QSTUB.lateCodes.includes(codeOf(await q.answer(b, qo.approvalId, { answers: A.single }))), 'the question offer ended')
  })

  it('RDR-03 with a message you queued before it, yours runs first and the instruction after', T, async () => {
    const sid = await running('rdr03')
    const queued = tok('03q')
    await q.host().call('followup', { sessionId: sid, text: queued })
    const instr = tok('03i')
    await redirected(sid, instr)
    assert.ok(await until(async () => (await q.modelSaw(sid, queued)) > 0, QSTUB.resultWaitMs, QSTUB.pollMs), 'both were read')
    assert.ok(await q.idle(sid), 'idle after both turns')
    const log = (await q.userLog(sid)).map((m) => m.text)
    const iq = log.findIndex((t) => t.includes(queued))
    const ii = log.findIndex((t) => t.includes(instr))
    assert.ok(iq >= 0 && ii >= 0, JSON.stringify(log))
    assert.ok(iq < ii, 'the queued message came first')
  })

  it('RDR-04 redirect refuses yours, taken back, Fishball\'s own and unknown; nothing is delivered', T, async () => {
    const text = tok('04')
    const { mine, back } = await refusesTargets((sid) => q.redirect(sid, text), QSTUB.action.redirect)
    assert.equal(await q.modelSaw(mine, text), 0, 'nothing delivered')
    assert.equal(await q.modelSaw(back, text), 0)
  })

  it('RDR-05 redirect is audited', T, async () => {
    const sid = await running('rdr05')
    await redirected(sid, tok('05'))
    const rows = q.decisions({ sessionId: sid, action: QSTUB.action.redirect })
    assert.equal(rows.length, 1, JSON.stringify(rows))
    assert.equal(rows[0].by, QSTUB.by.fishball)
  })

  it('RDR-06 on an idle managed session the instruction simply starts a turn', T, async () => {
    const sid = await q.session('rdr06')
    await q.free(sid)
    await redirected(sid, tok('06'))
    assert.equal((await ends(sid)).at(-1), COMPLETED)
  })

  it('RDR-07 an empty message is delivered; an unknown hostRef is refused expired and nothing is sent', T, async () => {
    const sid = await q.session('rdr07')
    await q.free(sid)
    const before = (await ends(sid)).length
    const refused = await q.stub().op(QSTUB.op.sessionRedirect, { sessionId: sid, message: tok('07r'), attachments: [UNKNOWN_REF] }, sid)
    assert.equal(codeOf(refused), QSTUB.code.expired, JSON.stringify(refused))
    await quiet()
    assert.equal((await ends(sid)).length, before, 'nothing was sent: no turn')
    assert.deepEqual((await q.redirect(sid, '')).payload, { status: 'delivered' }, 'message may be empty')
  })

  it('ORG-01 a permission request from the redirected turn names Fishball (redirect_session) as its origin', T, async () => {
    const sid = await running('org01')
    const text = tok('org')
    await q.host().call('queueMarker', { marker: text, except: await q.fishballId(), script: [callStep({ text }), [{ text: 'done' }]] })
    assert.deepEqual((await q.redirect(sid, text)).payload, { status: 'delivered' })
    await q.release(sid)
    const notice = await until(async () => (await q.notices(text))[0] ?? false, QSTUB.resultWaitMs, QSTUB.pollMs)
    assert.ok(notice, 'the request reached the instance')
    const header = untrustedBlock(notice.text)?.header ?? notice.text
    assert.match(header, ORIGIN.redirect)
    assert.doesNotMatch(header, ORIGIN.message)
    await q.userStop(sid)
  })
})
