/**
 * Permission-request provenance on the H-STUB harness (DESIGN §7a.2 "What Fishball is given", §7a.14 "provenance
 * from positive evidence"): "Session started by" and "its current turn started by", for every kind of source that
 * can start a session or a turn. The instance reads them in the request's `approval` inbox item (the notice's
 * trusted header); the descriptor (contract §5.1) carries no provenance.
 *
 * Values (DESIGN 7a): started by 'the user' | 'Fishball (start_session)' | 'another agent or a notice' | 'unknown';
 * turn started by 'the user' | 'Fishball (message_session)' | 'another agent or a notice' | 'unknown'.
 * A session's first message decides who started it; the latest message that started a turn decides the turn.
 * "From Fishball" is a relay whose sender is the instance's own session as the connector names it
 * (`/api/fishball/state` sessionId; the relay source `session.message` gives).
 *
 * The host boots with FBTEST_APPROVER_AFTER=1: the scripted stock prompt sits after the broker and the root
 * registers the asking tool fbtest_ask. The stub sends each request to the user (escalate) once it has read it.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | PRV-01 ×9 | DT (source of the message that starts the turn; the session was started by the user) | started by 'the user'; turn by: the user for kind user (also with an rpc id), Fishball (message_session) for a relay from Fishball, otherwise 'another agent or a notice' |
 * | PRV-02 ×9 | DT (source of the session's first message, which is also its first turn) | started by: the user, Fishball (start_session) for a relay from Fishball, otherwise 'another agent or a notice' or 'unknown'; turn by as in PRV-01 |
 * | PRV-04 ×14 | DT (source of a later message; the user typed 'first words' earlier) | the item's latest_user_message is the later message for kind user (also with an rpc id) and 'first words' for every other source, including relays with a null, numeric or missing sender |
 * | PRV-03  | EP (the user typed after a relay from Fishball) | the turn the user started is 'the user' again; the session was still started by Fishball |
 */
import assert from 'node:assert/strict'
import { after, afterEach, before, describe, it } from 'node:test'
import { PRESET, STARTED_BY, STARTED_BY_OTHER, TURN_BY } from './support/constants.mjs'
import { HOOK, T, turn } from './support/expect.mjs'
import { handOver, stopStub } from './support/instance-stub.mjs'
import { bootApprovals, clearSession, escalateAndSettle, requestFor, tok } from './support/instance-stub-approvals.mjs'

const OTHER_SESSION = 'session-fbtest-another-agent'
const relay = (senderSessionId) => ({ kind: 'agent-message', form: 'relay', senderSessionId })
const notice = (kind) => ({ kind, form: 'notice', summary: 'fbtest ' + kind })

describe('Permission-request provenance by source kind (H-STUB)', () => {
  let booted
  let host
  let fb
  const used = []
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
    booted = await bootApprovals('approvals-provenance')
    host = booted.host
    fb = booted.fbId
  }, HOOK)
  after(() => stopStub(booted), HOOK)
  afterEach(async () => { for (const sid of used.splice(0)) await clearSession(host, sid) }, HOOK)

  /** The session asks for permission in a turn started by `source`; returns who started the session and the turn, as the instance is told. */
  async function ask(sid, source, label) {
    used.push(sid)
    const text = tok('prv')
    const turnText = label + ' ' + text
    const req = await requestFor(booted, sid, text, { turnText, source })
    await escalateAndSettle(booted, req, text)
    await clearSession(host, sid)
    return { started: req.item.started, turnBy: req.item.turnBy, req, turnText }
  }
  // Only a managed session's permission requests reach the instance (DESIGN 7a.1), so each session is handed over
  // first. Who started it is decided by its first message, not by how it became managed.
  async function blank(folder) {
    const sid = (await host.call('ordinary', { preset: PRESET.bare, folder })).sessionId
    const r = await handOver(host, sid)
    assert.equal(r.status, 200, 'precondition: hand over ' + r.text)
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

  describe('PRV-04 the request\'s latest user message is the last message DSH recorded as typed by the user', () => {
    // The user typed 'first words' first. A later message counts only when its source is a DSH user source (kind user).
    const more = [
      ['a relay with a null sender', () => ({ kind: 'agent-message', form: 'relay', senderSessionId: null })],
      ['a relay with a numeric sender', () => ({ kind: 'agent-message', form: 'relay', senderSessionId: 7 })],
      ['a relay with no sender', () => ({ kind: 'agent-message', form: 'relay' })],
      ["'User' (upper case)", () => ({ kind: 'User' })],
      ["'user ' (trailing space)", () => ({ kind: 'user ' })],
    ]
    for (const [label, source] of [...sources.map(([l, src]) => [l, src]), ...more]) {
      it(label, T, async () => {
        const sid = await startedByUser('prv-04-' + label.replace(/\W+/g, '-'))
        const src = source(fb)
        const got = await ask(sid, src, 'latest words')
        assert.equal(got.req.item.fields.latest_user_message, src.kind === 'user' ? got.turnText : 'first words')
      })
    }
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
