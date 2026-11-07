/**
 * Revision 11 rev11h: stop_session and redirect_session (DESIGN §7a.12, §9 "Fishball's other decisions", §11, §14 row
 * rev11h, §16 Q-r11-stop, Q-r11-stop-cap, Q-r11-redirect-order; requirements items 28-29, done-when 9; S34).
 * Black-box: tool results, the snapshot, the session logs, stored `decisions` rows and the fake model's requests.
 * One host (rev11g's, so ask_user_question has its stand-in card); a fresh managed session per case.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | STP-01  | EP (running turn, no pending item) | ok; the turn ends aborted; the session is idle, still managed; the model script does not continue |
 * | STP-02  | ST (pending approval card) | the card leaves; the call's result is an abort error; the turn ends aborted; a later click answers 409 expired |
 * | STP-03  | ST (pending question) | the pile card leaves, the own card closes, the result is ASK_ABORTED, a late answer is refused |
 * | STP-04  | ST (idle session) | ok; no new turn end, no model request; still managed |
 * | STP-05  | ST (stopped, then next message) | idle until the next message; a message from Fishball then starts a turn that completes |
 * | STP-06  | ST (queued message before the stop) | no turn starts for it; it runs at the next wake |
 * | STP-07  | DT (target × refusal) | not yours: not-managed (never managed / taken back); Fishball's own: is-fishball; unknown id refused; nothing stopped, nothing audited |
 * | STP-08  | EP (audit) | one decisions row action stop, by fishball, for the session; the reason (optional) is kept as rationale |
 * | STP-09  | EP (reason optional) | with and without reason both ok |
 * | RDR-01  | EP (running turn) | ok; old turn aborted; a new turn starts with the instruction as a relay from Fishball and completes |
 * | RDR-02  | ST (pending approval and question) | their cards leave; the new turn runs |
 * | RDR-03  | ST (queued message before the redirect) | the user's message is read first, Fishball's instruction after it |
 * | RDR-04  | DT (target × refusal) | as STP-07; the running turn of a session that is yours is untouched; nothing delivered |
 * | RDR-05  | EP (audit) | one decisions row action redirect, by fishball |
 * | RDR-06  | EP (idle managed session) | ok; the instruction starts a turn |
 * | CAP-01  | BVA (messagesPerHour 2; stop is uncapped, redirect counts) | redirect, redirect ok; third answers hourly-cap and delivers nothing; stop_session still ok (6 in a row); message_session shares the count |
 * | CAP-02  | BVA (messagesPerHour 0 = no cap) | redirects keep succeeding |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { API, ASK_TOOL, LIMITS, OWN_PLUGINS, P5_CODE, PILE_API, RELAY, TURN_BY, NEEDS_INSTANCE_STUB } from './support/constants.mjs'
import { HOOK, T, callScript, outboxNow, callStep, waitRequest, fishballCall, makeManaged, managedEntry, setManaged, settledIdle, storedRows } from './support/expect.mjs'
import { A, MODES, cardId, qHost, qTools, refused, tokens, until } from './support/rev11g.mjs'

const { tok, cid } = tokens('STP')
const STOP = 'stop_session'
const REDIRECT = 'redirect_session'
const AT_ONCE = 5000
const QUIET = 1500

describe('Revision 11 rev11h: stop_session and redirect_session', { skip: NEEDS_INSTANCE_STUB }, () => {
  let ctx
  let q
  let t
  const host = () => ctx.host
  const decisions = (sid, action) => storedRows(ctx.home, 'decisions').filter((d) => d.sessionId === sid && d.action === action)
  const turnEnds = (sid) => host().call('turnEnds', { sessionId: sid })
  const status = (sid) => host().call('agentStatus', { sessionId: sid })
  const stop = (sid, extra = {}) => fishballCall(host(), ctx.fb, STOP, { session_id: sid, ...extra })
  const redirect = (sid, message) => fishballCall(host(), ctx.fb, REDIRECT, { session_id: sid, message })
  const modelSaw = async (sid, needle) => (await host().call('requestsContaining', { needle })).filter((r) => r.sessionId === sid).length
  const idle = (sid) => until(async () => (await status(sid)) === 'idle', 15000, 50)
  /** A managed session whose turn is running and held at its first model request. */
  async function running(label) {
    const sid = await q.session(label)
    await q.free(sid)
    await host().call('holdNext', { sessionId: sid })
    await host().call('driveStart', { sessionId: sid, text: 'work ' + label, script: [[{ text: 'never ' + label }]] })
    assert.ok(await until(() => host().call('isHeld', { sessionId: sid }), 10000, 50), 'the turn is running, held at the model')
    return sid
  }
  const release = (sid) => host().call('releaseHold', { sessionId: sid }).catch(() => {})
  const userLog = async (sid) => (await host().call('userMessages', { sessionId: sid })) ?? []

  before(async () => {
    ctx = await qHost('rev11h-stop')
    q = qTools(ctx, { tok, cid })
    t = q.t
  }, HOOK)
  after(async () => { await ctx.host?.stop() }, HOOK)

  it('STP-01 stop_session ends a running turn: aborted, idle, still managed', T, async () => {
    const sid = await running('stp01')
    const before = (await turnEnds(sid)).length
    const r = await stop(sid)
    await release(sid)
    assert.equal(r.json?.ok, true, r.result?.text)
    assert.equal(r.json?.stopped, true, 'a turn was running')
    assert.equal(decisions(sid, 'stop')[0]?.outcome, 'ok')
    assert.ok(await idle(sid), 'idle')
    const ends = await turnEnds(sid)
    assert.equal(ends.length, before + 1)
    assert.equal(ends.at(-1), 'aborted')
    assert.ok(await managedEntry(host(), sid), 'still managed')
    await new Promise((r2) => setTimeout(r2, QUIET))
    assert.equal(await modelSaw(sid, 'never stp01'), 0)
    assert.equal(await status(sid), 'idle', 'stays idle')
  })

  it('STP-02 a pending approval is cancelled: the card leaves and the call is aborted', T, async () => {
    const sid = await q.session('stp02')
    const id = cid('02')
    const { requestId } = await t.escalated(sid, tok('02'), id)
    const r = await stop(sid)
    assert.equal(r.json?.ok, true, r.result?.text)
    assert.ok(await until(async () => !((await host().state()).pile ?? []).some((c) => c.requestId === requestId), 10000, 50), 'the card left the pile')
    assert.ok(await idle(sid), 'idle')
    assert.equal((await turnEnds(sid)).at(-1), 'aborted')
    assert.match((await q.result(sid, id)).text, /abort|cancel/i, 'the ask_fishball call ended aborted')
    const click = await host().post(PILE_API.answer, { requestId, decision: 'allow' }).catch(() => null)
    if (click) assert.equal(click.status, 409, click.text)
    assert.ok(await managedEntry(host(), sid), 'still managed')
  })

  it('STP-02b a direct call waiting for Fishball: its approval settles cancelled', T, async () => {
    const sid = await q.session('stp02b')
    const text = tok('02b')
    await q.free(sid)
    await host().call('driveStart', { sessionId: sid, script: [callStep({ text }, cid('02b')), [{ text: 'done' }]] })
    assert.ok(await waitRequest(host(), ctx.fb, text), 'the call reached Fishball')
    assert.equal((await stop(sid)).json?.ok, true)
    assert.ok(await idle(sid))
    assert.equal((await turnEnds(sid)).at(-1), 'aborted')
    assert.match(JSON.stringify(await host().call('approvalEvents', { sessionId: sid })), /cancelled/, 'the approval settled cancelled')
    assert.ok(await managedEntry(host(), sid))
  })

  it('STP-03 a pending question settles ASK_ABORTED: both cards leave and a late answer is refused', T, async () => {
    const sid = await q.session('stp03')
    await q.mode(MODES.user) // User mode: the question is a pile card at once
    const text = tok('03')
    const id = cid('03')
    await q.ask(sid, text, id)
    const qid = await q.questionId(text)
    const card = await q.pileCard(sid)
    assert.ok(card, 'the question is in the pile')
    const r = await stop(sid)
    assert.equal(r.json?.ok, true, r.result?.text)
    assert.ok(await q.noPileCard(sid), 'the pile card left')
    assert.equal((await q.cards(sid)).at(-1).state, 'closed', "the session's own card closed")
    const result = await q.result(sid, id)
    assert.match(result.text, /ASK_ABORTED|aborted/i)
    assert.ok(await idle(sid))
    assert.equal((await turnEnds(sid)).at(-1), 'aborted')
    assert.equal(refused(await q.fbAnswer({ question_id: qid, answers: A.single })), true, 'Fishball cannot answer it any more')
    const late = await q.route({ questionId: cardId(card), answers: A.single })
    assert.equal(late.status, 409, late.text)
    assert.ok(await managedEntry(host(), sid))
  })

  it('STP-04 stopping an idle managed session changes nothing', T, async () => {
    const sid = await q.session('stp04')
    await q.free(sid)
    const ends = (await turnEnds(sid)).length
    const reqs = (await host().call('requests', { sessionId: sid })).length
    const r = await stop(sid)
    assert.equal(r.json?.ok, true, r.result?.text)
    assert.equal(r.json?.stopped, false, 'nothing was running')
    assert.equal(decisions(sid, 'stop')[0]?.outcome, 'idle')
    await new Promise((r2) => setTimeout(r2, QUIET))
    assert.equal((await turnEnds(sid)).length, ends, 'no turn end written')
    assert.equal((await host().call('requests', { sessionId: sid })).length, reqs, 'no model request')
    assert.equal(await status(sid), 'idle')
    assert.ok(await managedEntry(host(), sid))
  })

  it('STP-05 after a stop the session waits for the next message, then runs it', T, async () => {
    const sid = await running('stp05')
    assert.equal((await stop(sid)).json?.ok, true)
    await release(sid)
    assert.ok(await idle(sid))
    await new Promise((r2) => setTimeout(r2, QUIET))
    assert.equal(await status(sid), 'idle')
    const text = tok('05')
    const sent = await fishballCall(host(), ctx.fb, 'message_session', { session_id: sid, message: text })
    assert.equal(sent.json?.ok, true, JSON.stringify(sent.json))
    assert.ok(await until(async () => (await modelSaw(sid, text)) > 0, 10000, 100), 'the next message started a turn')
    assert.ok(await idle(sid))
    assert.equal((await turnEnds(sid)).at(-1), 'completed')
  })

  it('STP-06 a message you queued before the stop stays parked until the next wake', T, async () => {
    const sid = await running('stp06')
    const queued = tok('06q')
    await host().call('followup', { sessionId: sid, text: queued })
    assert.equal((await stop(sid)).json?.ok, true)
    await release(sid)
    assert.ok(await idle(sid))
    await new Promise((r2) => setTimeout(r2, QUIET))
    assert.equal(await status(sid), 'idle', 'no turn started for the parked message')
    assert.equal(await modelSaw(sid, queued), 0, 'the model has not seen it')
    const next = tok('06n')
    assert.equal((await fishballCall(host(), ctx.fb, 'message_session', { session_id: sid, message: next })).json?.ok, true)
    assert.ok(await until(async () => (await modelSaw(sid, queued)) > 0 && (await modelSaw(sid, next)) > 0, 15000, 100), 'both ran at the wake')
    assert.ok(await idle(sid))
  })

  it('STP-07 not yours to stop: a session that is yours, taken back, Fishball\'s own or unknown', T, async () => {
    const mine = await q.yours('stp07-yours')
    await host().call('holdNext', { sessionId: mine })
    await host().call('driveStart', { sessionId: mine, text: 'mine running', script: [[{ text: 'mine done' }]] })
    assert.ok(await until(() => host().call('isHeld', { sessionId: mine }), 10000, 50))
    const r = await stop(mine)
    assert.equal(r.json?.ok, false, 'refused')
    assert.equal(r.json?.code, 'not-managed')
    assert.equal(await status(mine), 'running', 'its turn is untouched')
    await release(mine)
    assert.ok(await idle(mine))
    assert.equal((await turnEnds(mine)).at(-1), 'completed')
    assert.equal(decisions(mine, 'stop').length, 0, 'not audited')

    const back = await q.session('stp07-back')
    assert.equal((await setManaged(host(), back, false)).status, 200)
    assert.equal((await stop(back)).json?.code, 'not-managed')

    const own = await stop(ctx.fb)
    assert.equal(own.json?.ok, false)
    assert.equal(own.json?.code, P5_CODE.isFishball)
    const unknown = await stop('ses_fbtest_nothing')
    assert.equal(unknown.json?.ok, false, JSON.stringify(unknown.json))
    assert.equal(decisions(ctx.fb, 'stop').length, 0)
  })

  it('STP-08 stop is audited with its reason; STP-09 the reason is optional', T, async () => {
    const a = await running('stp08')
    const reason = 'fbtest reason ' + tok('08')
    assert.equal((await stop(a, { reason })).json?.ok, true)
    await release(a)
    const rows = decisions(a, 'stop')
    assert.equal(rows.length, 1, JSON.stringify(rows))
    assert.equal(rows[0].by, 'fishball')
    assert.ok(JSON.stringify(rows[0]).includes(reason), 'the reason is kept')
    assert.ok(!Number.isNaN(Date.parse(rows[0].at)))
    const b = await running('stp09')
    assert.equal((await stop(b)).json?.ok, true, 'ok without a reason')
    await release(b)
    assert.equal(decisions(b, 'stop').length, 1)
  })

  it('RDR-01 redirect stops the turn and the instruction starts a new turn from Fishball', T, async () => {
    const sid = await running('rdr01')
    const text = tok('r01') + ' do Y instead'
    const r = await redirect(sid, text)
    await release(sid)
    assert.equal(r.json?.ok, true, r.result?.text)
    assert.ok(await until(async () => (await modelSaw(sid, text)) > 0, 15000, 100), 'a new turn read the instruction')
    assert.ok(await idle(sid))
    const ends = await turnEnds(sid)
    assert.deepEqual(ends.slice(-2), ['aborted', 'completed'])
    const got = (await userLog(sid)).filter((m) => m.text.includes(text))
    assert.equal(got.length, 1)
    assert.deepEqual(got[0].source, { ...RELAY, senderSessionId: ctx.fb })
    assert.equal(await modelSaw(sid, 'never rdr01'), 0, 'the old script did not continue')
    assert.ok(await managedEntry(host(), sid))
  })

  it('RDR-02 redirect cancels the waiting approval and question, then the new turn runs', T, async () => {
    const a = await q.session('rdr02a')
    const { requestId } = await t.escalated(a, tok('02a'), cid('02a'))
    const ta = tok('r02a')
    assert.equal((await redirect(a, ta)).json?.ok, true)
    assert.ok(await until(async () => !((await host().state()).pile ?? []).some((c) => c.requestId === requestId), 10000, 50), 'approval card left')
    assert.ok(await until(async () => (await modelSaw(a, ta)) > 0, 15000, 100))
    assert.ok(await idle(a))

    const b = await q.session('rdr02b')
    await q.mode(MODES.user)
    const text = tok('02b')
    await q.ask(b, text, cid('02b'))
    assert.ok(await q.pileCard(b))
    const tb = tok('r02b')
    assert.equal((await redirect(b, tb)).json?.ok, true)
    assert.ok(await q.noPileCard(b), 'question card left')
    assert.equal((await q.cards(b)).at(-1).state, 'closed')
    assert.ok(await until(async () => (await modelSaw(b, tb)) > 0, 15000, 100))
    assert.ok(await idle(b))
  })

  it('RDR-03 with a message you queued before it, yours runs first and Fishball\'s instruction after', T, async () => {
    const sid = await running('rdr03')
    const queued = tok('03q')
    await host().call('followup', { sessionId: sid, text: queued })
    const instr = tok('03i')
    assert.equal((await redirect(sid, instr)).json?.ok, true)
    await release(sid)
    assert.ok(await until(async () => (await modelSaw(sid, queued)) > 0 && (await modelSaw(sid, instr)) > 0, 20000, 100), 'both were read')
    assert.ok(await idle(sid), 'idle after both turns')
    const log = (await userLog(sid)).map((m) => m.text)
    const iq = log.findIndex((x) => x.includes(queued))
    const ii = log.findIndex((x) => x.includes(instr))
    assert.ok(iq >= 0 && ii >= 0, JSON.stringify(log))
    assert.ok(iq < ii, 'the queued message came first')
  })

  it('RDR-04 redirect refuses a session that is yours, taken back, Fishball\'s own or unknown', T, async () => {
    const mine = await q.yours('rdr04-yours')
    await host().call('holdNext', { sessionId: mine })
    await host().call('driveStart', { sessionId: mine, text: 'mine running', script: [[{ text: 'mine done' }]] })
    assert.ok(await until(() => host().call('isHeld', { sessionId: mine }), 10000, 50))
    const text = tok('04')
    const r = await redirect(mine, text)
    assert.equal(r.json?.ok, false)
    assert.equal(r.json?.code, 'not-managed')
    assert.equal(await status(mine), 'running', 'turn untouched')
    await release(mine)
    assert.ok(await idle(mine))
    assert.equal(await modelSaw(mine, text), 0, 'nothing delivered')
    assert.equal(decisions(mine, 'redirect').length, 0)

    const back = await q.session('rdr04-back')
    assert.equal((await setManaged(host(), back, false)).status, 200)
    assert.equal((await redirect(back, text)).json?.code, 'not-managed')
    const own = await redirect(ctx.fb, text)
    assert.equal(own.json?.ok, false)
    assert.equal(own.json?.code, P5_CODE.isFishball)
    assert.equal((await redirect('ses_fbtest_nothing', text)).json?.ok, false)
    assert.equal(await modelSaw(back, text), 0)
  })

  it('RDR-05 redirect is audited', T, async () => {
    const sid = await running('rdr05')
    assert.equal((await redirect(sid, tok('05'))).json?.ok, true)
    await release(sid)
    assert.ok(await idle(sid))
    const rows = decisions(sid, 'redirect')
    assert.equal(rows.length, 1, JSON.stringify(rows))
    assert.equal(rows[0].by, 'fishball')
    const out = (await outboxNow(host())).find((e) => e.targetSessionId === sid)
    assert.equal(out?.kind, 'redirect', 'its own outbox kind')
    assert.equal(out?.status, 'delivered')
  })

  it('RDR-06 on an idle managed session the instruction simply starts a turn', T, async () => {
    const sid = await q.session('rdr06')
    await q.free(sid)
    const text = tok('06')
    const r = await redirect(sid, text)
    assert.equal(r.json?.ok, true, r.result?.text)
    assert.ok(await until(async () => (await modelSaw(sid, text)) > 0, 15000, 100))
    assert.ok(await idle(sid))
    assert.equal((await turnEnds(sid)).at(-1), 'completed')
  })

  it('ORG-01 a permission request from the redirected turn names redirect_session as its origin', T, async () => {
    const sid = await running('org01')
    const text = tok('org')
    await host().call('queueMarker', { marker: text, except: ctx.fb, script: callScript(ASK_TOOL, { text }) })
    assert.equal((await redirect(sid, text)).json?.ok, true)
    await release(sid)
    const req = await waitRequest(host(), ctx.fb, text)
    assert.ok(req, 'the request reached Fishball')
    const header = req.block.header
    assert.match(header, /Fishball \(redirect_session\)/)
    assert.doesNotMatch(header, /Fishball \(message_session\)/)
    await t.stop(sid)
  })

  it('OFF-01 with Session messages off, neither tool works and nothing is stopped', T, async () => {
    const sid = await running('off01')
    const toggle = async (on) => {
      const r = await host().post(API.plugins, { plugin: OWN_PLUGINS.messages.key, on })
      assert.equal(r.status, 200, r.text)
      assert.ok(await until(async () => (await host().state()).features?.messages === on, 10000, 100), 'features.messages ' + on)
    }
    await toggle(false)
    try {
      const text = tok('off')
      for (const [name, r] of [[STOP, await stop(sid)], [REDIRECT, await redirect(sid, text)]]) {
        const refusedNow = r.json?.code === 'feature-off' || r.result?.isError === true
        assert.ok(refusedNow, name + ' refused: ' + r.result?.text)
        assert.notEqual(r.json?.ok, true, name)
      }
      assert.equal(await status(sid), 'running', 'the turn was not stopped')
      assert.equal(await modelSaw(sid, text), 0)
    } finally { await toggle(true) }
    await release(sid)
    await t.stop(sid)
    assert.equal(decisions(sid, 'stop').length + decisions(sid, 'redirect').length, 0, 'nothing audited')
  })
})

describe('Revision 11 rev11h: hourly cap', { skip: NEEDS_INSTANCE_STUB }, () => {
  let ctx
  let q
  const host = () => ctx.host
  const setLimit = (patch) => q.t.setLimit(patch)
  const stop = (sid) => fishballCall(host(), ctx.fb, STOP, { session_id: sid })
  const redirect = (sid, message) => fishballCall(host(), ctx.fb, REDIRECT, { session_id: sid, message })
  const modelSaw = async (sid, needle) => (await host().call('requestsContaining', { needle })).filter((r) => r.sessionId === sid).length
  const settle = async (sid) => { await until(async () => (await host().call('agentStatus', { sessionId: sid })) === 'idle', 15000, 50) }

  before(async () => {
    ctx = await qHost('rev11h-cap')
    q = qTools(ctx, { tok, cid })
  }, HOOK)
  after(async () => { await ctx.host?.stop() }, HOOK)

  it('CAP-01 messagesPerHour 2: redirect counts (third refused), stop_session never does', T, async () => {
    const sid = await q.session('cap01')
    await setLimit({ messagesPerHour: 2 })
    const a = tok('a')
    assert.equal((await redirect(sid, a)).json?.ok, true, 'the 1st')
    await settle(sid)
    const b = tok('b')
    assert.equal((await redirect(sid, b)).json?.ok, true, 'at the cap minus one')
    await settle(sid)
    const c = tok('c')
    const third = await redirect(sid, c)
    assert.deepEqual(third.json, { ok: false, code: P5_CODE.hourlyCap })
    await new Promise((r) => setTimeout(r, QUIET))
    assert.equal(await modelSaw(sid, c), 0, 'nothing delivered')
    const viaMessage = await fishballCall(host(), ctx.fb, 'message_session', { session_id: sid, message: tok('d') })
    assert.equal(viaMessage.json?.code, P5_CODE.hourlyCap, 'message_session shares the count')
    for (let i = 0; i < 6; i++) assert.equal((await stop(sid)).json?.ok, true, 'stop ' + i + ' is not capped')
    assert.equal(storedRows(ctx.home, 'decisions').filter((d) => d.sessionId === sid && d.action === 'stop').length, 6, 'each stop audited')
  })

  it('CAP-02 messagesPerHour 0 means no cap for redirect', T, async () => {
    const sid = await q.session('cap02')
    await setLimit({ messagesPerHour: 0 })
    for (let i = 0; i < 3; i++) {
      assert.equal((await redirect(sid, tok('n' + i))).json?.ok, true, 'redirect ' + i)
      await settle(sid)
    }
    await setLimit({ messagesPerHour: LIMITS.messagesPerHour.default })
  })
})
