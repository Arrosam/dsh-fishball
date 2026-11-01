/**
 * Permission-request provenance (DESIGN 7a): "Session started by" and "its current turn started by", for every kind of
 * source that can start a session or a turn. Regression for the read_session fix: the approvals provenance now shares
 * one classification rule with read_session's labels (Q-read-roles) and its behaviour must not change, so these cases
 * were also run against the version before the fix (see CASES.md A151) and give the same answers there.
 *
 * Values (DESIGN 7a): started by 'the user' | 'Fishball (start_session)' | 'another agent or a notice' | 'unknown';
 * turn started by 'the user' | 'Fishball (message_session)' | 'another agent or a notice' | 'unknown'.
 * A session's first message decides who started it; the latest message that started a turn decides the turn.
 *
 * The host boots with FBTEST_APPROVER_AFTER=1 (as approvals-broker): the scripted answerer stands in for the browser
 * prompt and the root registers the asking tool fbtest_ask. Fishball's model answers each request through a plan.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | PRV-01 ×9 | DT (source of the message that starts the turn; the session was started by the user) | started by 'the user'; turn by: the user for kind user (also with an rpc id), Fishball (message_session) for a relay from Fishball, otherwise 'another agent or a notice' |
 * | PRV-02 ×9 | DT (source of the session's first message, which is also its first turn) | started by: the user, Fishball (start_session) for a relay from Fishball, otherwise 'another agent or a notice' or 'unknown'; turn by as in PRV-01 |
 * | PRV-03  | EP (the user typed after a relay from Fishball) | the turn the user started is 'the user' again; the session was still started by Fishball |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { APPROVER_AFTER_ENV, ASK_TOOL, OUTCOME, PRESET, STARTED_BY, STARTED_BY_OTHER, TURN_BY } from './support/constants.mjs'
import { HOOK, T, askSettled, makeManaged, settledIdle, startAsk, turn, waitRequest } from './support/expect.mjs'
import { bootHost, newHome } from './support/host.mjs'
import { tok } from './support/start-session.mjs'

const OTHER_SESSION = 'session-fbtest-another-agent'
const provenance = (text) => /Session started by: (.*?); its current turn started by: (.*?)\.?$/m.exec(text)?.slice(1) ?? [null, null]
const relay = (senderSessionId) => ({ kind: 'agent-message', form: 'relay', senderSessionId })
const notice = (kind) => ({ kind, form: 'notice', summary: 'fbtest ' + kind })

describe('Permission-request provenance by source kind', () => {
  let host
  let fb
  /** Sources that can start a session or a turn: [label, (fishballId) => source, the turn label they give]. */
  const sources = [
    ['a user source', () => ({ kind: 'user' }), TURN_BY.user],
    ["DSH's user-rpc source (kind user with an rpc id)", () => ({ kind: 'user', rpcId: 'fbtest-rpc-1', clientTimeZone: 'Pacific/Auckland' }), TURN_BY.user],
    ['a relay from Fishball', (fbId) => relay(fbId), TURN_BY.fishball],
    ['a relay from another session', () => relay(OTHER_SESSION), TURN_BY.other],
    ['a relay from a session whose id extends the Fishball id', (fbId) => relay(fbId + 'x'), TURN_BY.other],
    ['a Fishball notice', () => notice('fishball-notice'), TURN_BY.other],
    ['a goal round', () => notice('goal'), TURN_BY.other],
    ['a schedule', () => notice('schedule'), TURN_BY.other],
    ['a made-up plugin kind', () => ({ kind: 'fbtest-plugin-kind' }), TURN_BY.other],
  ]

  before(async () => {
    host = await bootHost(newHome('approvals-provenance'), { env: APPROVER_AFTER_ENV })
    fb = (await host.waitStatus('live'))?.sessionId
    await settledIdle(host, fb)
    await host.call('setApprover', { outcome: OUTCOME.reject })
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  const planEscalate = (text) => host.call('planApproval', { sessionId: fb, needle: text, args: { decision: 'escalate', risk: 'high', reason: 'x' } })
  /** The session asks for permission in a turn started by `source`; returns who started the session and the turn, as Fishball is told. */
  async function ask(sid, source, label) {
    const text = tok('prv')
    await planEscalate(text)
    await startAsk(host, sid, ASK_TOOL, { text }, label + ' ' + text, source)
    const req = await waitRequest(host, fb, text)
    assert.ok(req, 'a permission request reached Fishball')
    const [started, turnBy] = provenance(req.block.header)
    await askSettled(host, text)
    await settledIdle(host, sid)
    return { started, turnBy, req }
  }
  // Revision 11 (rev11a): only a managed session's permission requests reach Fishball (DESIGN 7a.1), so each session is
  // handed over to Fishball first. Who started it is decided by its first message, not by how it became managed.
  const blank = async (folder) => {
    const sid = (await host.call('ordinary', { preset: PRESET.bare, folder })).sessionId
    await makeManaged(host, fb, sid)
    return sid
  }
  const startedByUser = async (folder) => { const sid = await blank(folder); await turn(host, sid, [[{ text: 'hello' }]], 'first words'); return sid }

  describe('PRV-01 a turn started by this source, in a session the user started', () => {
    sources.forEach(([label, source, turnBy], i) => {
      it(label + ' → turn by ' + turnBy, T, async () => {
        const sid = await startedByUser('prv-01-' + i)
        const got = await ask(sid, source(fb), 'turn words')
        assert.equal(got.started, STARTED_BY.user, 'the user typed its first message')
        assert.equal(got.turnBy, turnBy)
      })
    })
  })

  describe('PRV-02 the session\'s first message has this source', () => {
    sources.forEach(([label, source, turnBy], i) => {
      it(label, T, async () => {
        const sid = await blank('prv-02-' + i)
        const src = source(fb)
        const got = await ask(sid, src, 'first words')
        if (src.kind === 'user') assert.equal(got.started, STARTED_BY.user)
        else if (src.senderSessionId === fb) assert.equal(got.started, STARTED_BY.fishball)
        else assert.ok(STARTED_BY_OTHER.includes(got.started), 'started by: ' + got.started)
        assert.equal(got.turnBy, turnBy)
      })
    })
  })

  it('PRV-03 after a relay from Fishball the user types: the new turn is the user\'s, the session is still Fishball\'s', T, async () => {
    const sid = await blank('prv-03')
    const first = await ask(sid, relay(fb), 'first words')
    assert.equal(first.started, STARTED_BY.fishball)
    const second = await ask(sid, { kind: 'user' }, 'the user now types')
    assert.equal(second.started, STARTED_BY.fishball, 'still started by Fishball')
    assert.equal(second.turnBy, TURN_BY.user)
  })
})
