/**
 * Revision 11, R4 (regression): list_user_messages, the managed sessions' tool, still lists only messages the user typed
 * (DSH source kind `user`, with or without an rpc id). Fishball's relays, other sessions' relays, notices and other
 * context are excluded (DESIGN 7a.2). The classification of a message's source is now one rule shared with read_session
 * and the permission requests (Q-read-roles), so this table pins the tool's answer for every kind of source, including
 * the near-misses of the word `user` and the sources a relay can carry. rev11b-list LUM-05 covers the common cases; these
 * add the rest. The messages are appended into a managed session's log without a turn (support/worker.mjs
 * injectUserMessage), so the only user-typed messages in it are the ones listed here and the setup turn's.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | LUS-01 ×2 | DT (source kind user: plain, with an rpc id) | listed |
 * | LUS-02 ×15 | DT (relay from Fishball / another session / null, numeric or missing sender; fishball-notice, goal, schedule, runtime-context, user-approval, user-question-reply, a made-up kind, `User`, `user `, an empty source object) | not listed |
 * | LUS-03  | EP | exactly the typed messages, newest first, with the DSH ids the log gives, and nothing else listed |
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LIST_USER_MESSAGES, NOTICE, USER_RPC_SOURCE } from './support/constants.mjs'
import { T, jsonOf, managedSession, turn } from './support/expect.mjs'
import { readHelpers } from './support/read-session.mjs'
import { tok, useHost } from './support/start-session.mjs'

const OTHER_SESSION = 'session-fbtest-another-agent'
const relay = (senderSessionId) => ({ kind: 'agent-message', form: 'relay', senderSessionId })
const notice = (kind) => ({ kind, form: 'notice', summary: 'fbtest ' + kind })

describe('Revision 11 R4: list_user_messages lists only what the user typed', () => {
  const w = useHost('lus', {})
  const h = readHelpers(w)
  // A message with no source at all is not in the table: DSH's agent loop cannot run a turn over one (it throws reading
  // the source's kind), and the tool is called inside a turn. read_session's table covers it (ROL-06).
  /** [label, source, typed], built once Fishball's session id is known. */
  const rows = (fb) => [
    ['a user source', { kind: 'user' }, true],
    ["DSH's user-rpc form (kind user with an rpc id)", USER_RPC_SOURCE, true],
    ['a relay from Fishball', relay(fb), false],
    ['a relay from another session', relay(OTHER_SESSION), false],
    ['a relay with a null sender', { kind: 'agent-message', form: 'relay', senderSessionId: null }, false],
    ['a relay with a numeric sender', { kind: 'agent-message', form: 'relay', senderSessionId: 7 }, false],
    ['a relay with no sender', { kind: 'agent-message', form: 'relay' }, false],
    ['a Fishball notice', { ...NOTICE, summary: 'fbtest notice' }, false],
    ['a goal round', notice('goal'), false],
    ['a schedule', notice('schedule'), false],
    ['runtime context', { kind: 'runtime-context', form: 'snapshot', sections: [{ name: 'x', text: 'y' }] }, false],
    ["a kind that starts with 'user' (user-approval)", { kind: 'user-approval' }, false],
    ["a kind that starts with 'user' (user-question-reply)", { kind: 'user-question-reply' }, false],
    ['a made-up plugin kind', { kind: 'fbtest-plugin-kind' }, false],
    ["'User' (upper case)", { kind: 'User' }, false],
    ["'user ' (trailing space)", { kind: 'user ' }, false],
    ['an empty source object', {}, false],
  ]
  const labels = rows('stand-in').map((r) => [r[0], r[2]])
  let injected // [{ label, text, typed }]
  let answer
  let log

  async function listFrom(sessionId, text) {
    const r = await turn(w.host, sessionId, [[{ tool: LIST_USER_MESSAGES, args: {}, id: 'call_' + tok('lus') }], [{ text: 'done' }]], text)
    assert.equal(r.results.length, 1, JSON.stringify(r.results))
    assert.equal(r.results[0].isError, false, r.results[0].text)
    return jsonOf(r.results[0])
  }

  it('LUS-00 the tool answers for a managed session whose log holds one message per source', T, async () => {
    const sessionId = await managedSession(w.host, w.fb, 'lus')
    injected = []
    for (const [label, source, typed] of rows(w.fb)) {
      const text = tok('lus') + ' ' + label
      await h.inject(sessionId, text, source)
      injected.push({ label, text, typed })
    }
    await w.host.call('flush', { sessionId })
    answer = await listFrom(sessionId, tok('lusq') + ' list my messages')
    log = await w.host.call('userMessageLog', { sessionId })
    assert.equal(answer?.ok, true, JSON.stringify(answer))
  })

  labels.forEach(([label, typed], i) => {
    it((typed ? 'LUS-01 ' : 'LUS-02 ') + label + (typed ? ' → listed' : ' → not listed'), T, () => {
      const { text } = injected[i]
      assert.equal(answer.messages.some((m) => m.excerpt.includes(text)), typed)
    })
  })

  it('LUS-03 exactly the typed messages, newest first, with DSH\'s ids', T, () => {
    const expected = log.filter((m) => m.kind === 'user').reverse()
    assert.deepEqual(answer.messages.map((m) => m.id), expected.map((m) => m.id))
    assert.deepEqual(answer.messages.map((m) => m.excerpt), expected.map((m) => m.text))
    // The setup turn's message, the two typed rows and the calling turn's own message.
    assert.equal(answer.messages.length, 2 + injected.filter((r) => r.typed).length)
  })
})
