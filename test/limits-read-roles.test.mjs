/**
 * Revision 11: read_session's bounds are the settings `readSessionMessages` (default 12) and `readSessionBytes`
 * (default 12288), and they count message text only, whatever label the message has (DESIGN 5c, 14 "rev11-limits",
 * 16 "Hard-coded limits moved to config"; the read_session roles of Q-read-roles). limits-live L50/L51 cover the
 * settings with plain answers; these cases cover them with labelled messages (fishball, agent with `from`, context with
 * `source`), appended into a blank session's log (support/worker.mjs injectUserMessage). A change applies to the next
 * read without a restart.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | LRR-01  | ST + BVA (readSessionMessages 12 -> 3 -> 1 -> 12; 15 labelled messages) | the newest 12 / 3 / 1 / 12, in order, labels intact |
 * | LRR-02  | BVA (readSessionBytes 2048; 4 messages of exactly 1024 bytes with 300-character labels) | the newest 2 (2048 bytes): labels are not counted; at 3072 the newest 3; back at 12288 all 4 |
 * | LRR-03  | BVA (readSessionBytes 2047; the same 4 messages) | at most 2047 bytes of text; the newest whole with its label |
 * | LRR-04  | BVA (readSessionBytes 2048; one 5000-byte message from another session) | one entry, label kept, a prefix ending with an ellipsis, at most 2048 bytes |
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LIMITS_R11, READ_ROLE, NEEDS_INSTANCE_STUB } from './support/constants.mjs'
import { T } from './support/expect.mjs'
import { readHelpers } from './support/read-session.mjs'
import { tok, useHost } from './support/start-session.mjs'

const OTHER_SESSION = 'session-fbtest-another-agent'
const ELLIPSIS = '…'
const bytes = (s) => Buffer.byteLength(s)
const textBytes = (messages) => messages.reduce((n, m) => n + bytes(m.text), 0)
const padded = (token, n) => token + 'a'.repeat(n - bytes(token))
const relay = (senderSessionId) => ({ kind: 'agent-message', form: 'relay', senderSessionId })

describe('read_session bounds from the settings, with labelled messages', { skip: NEEDS_INSTANCE_STUB }, () => {
  const w = useHost('lrr', {})
  const h = readHelpers(w)
  const DEFAULT = { messages: LIMITS_R11.readSessionMessages.default, bytes: LIMITS_R11.readSessionBytes.default }

  /** Appends one message per label in turn (user, Fishball's relay, another session's relay, a notice, no source). */
  async function inject15(sessionId) {
    const kinds = [
      [{ kind: 'user' }, (text) => ({ role: READ_ROLE.user, text })],
      [relay(w.fb), (text) => ({ role: READ_ROLE.fishball, text })],
      [relay(OTHER_SESSION), (text) => ({ role: READ_ROLE.agent, from: OTHER_SESSION, text })],
      [{ kind: 'goal', form: 'notice', summary: 's' }, (text) => ({ role: READ_ROLE.context, source: 'goal', text })],
      [undefined, (text) => ({ role: READ_ROLE.context, text })],
    ]
    const sent = []
    for (let i = 0; i < 15; i++) {
      const [source, build] = kinds[i % kinds.length]
      const text = tok('lrr1n' + i)
      await h.inject(sessionId, text, source, source === undefined)
      sent.push(build(text))
    }
    return sent
  }

  it('LRR-01 readSessionMessages: 12 by default, then 3, then 1, then 12 again, labels intact', T, async () => {
    const sessionId = await h.blank('lrr-01')
    const sent = await inject15(sessionId)
    assert.deepEqual(await h.read(sessionId), sent.slice(-DEFAULT.messages), 'the default')
    for (const n of [3, 1]) {
      await w.setLimit({ readSessionMessages: n })
      assert.deepEqual(await h.readRelated(sessionId), sent.slice(-n), 'readSessionMessages ' + n)
    }
    await w.setLimit({ readSessionMessages: DEFAULT.messages })
    assert.deepEqual(await h.readRelated(sessionId), sent.slice(-DEFAULT.messages), 'back to the default')
  })

  /** Four messages of exactly 1024 bytes with labels far longer than the text bound's unit. */
  async function inject4(sessionId) {
    const longKind = 'fbtest-kind-' + 'k'.repeat(300)
    const longSender = OTHER_SESSION + '-' + 's'.repeat(300)
    const sent = []
    for (let i = 0; i < 4; i++) {
      const text = padded(tok('lrr2n' + i), 1024)
      if (i % 2 === 0) { await h.inject(sessionId, text, { kind: longKind }); sent.push({ role: READ_ROLE.context, source: longKind, text }) } else { await h.inject(sessionId, text, relay(longSender)); sent.push({ role: READ_ROLE.agent, from: longSender, text }) }
    }
    return sent
  }

  it('LRR-02 readSessionBytes counts text only: 2048 keeps 2 messages of 1024, 3072 keeps 3, the default keeps all 4', T, async () => {
    const sessionId = await h.blank('lrr-02')
    const sent = await inject4(sessionId)
    await w.setLimit({ readSessionBytes: 2048 })
    assert.deepEqual(await h.read(sessionId), sent.slice(-2))
    await w.setLimit({ readSessionBytes: 3072 })
    assert.deepEqual(await h.readRelated(sessionId), sent.slice(-3))
    await w.setLimit({ readSessionBytes: DEFAULT.bytes })
    assert.deepEqual(await h.readRelated(sessionId), sent)
  })

  it('LRR-03 readSessionBytes one below two messages: at most that many bytes of text, the newest whole', T, async () => {
    const sessionId = await h.blank('lrr-03')
    const sent = await inject4(sessionId)
    await w.setLimit({ readSessionBytes: 2047 })
    try {
      const messages = await h.read(sessionId)
      assert.ok(messages.length >= 1)
      assert.ok(textBytes(messages) <= 2047, 'text bytes ' + textBytes(messages))
      assert.deepEqual(messages.at(-1), sent.at(-1), 'the newest message whole, with its label')
    } finally { await w.setLimit({ readSessionBytes: DEFAULT.bytes }) }
  })

  it('LRR-04 a message longer than readSessionBytes is cut with an ellipsis and keeps its label', T, async () => {
    const sessionId = await h.blank('lrr-04')
    const head = tok('lrr4') + ' '
    await h.inject(sessionId, head + 'a'.repeat(5000 - bytes(head)), relay(OTHER_SESSION))
    await w.setLimit({ readSessionBytes: 2048 })
    try {
      const messages = await h.read(sessionId)
      assert.equal(messages.length, 1)
      const [m] = messages
      assert.equal(m.role, READ_ROLE.agent)
      assert.equal(m.from, OTHER_SESSION)
      assert.ok(m.text.startsWith(head) && m.text.endsWith(ELLIPSIS))
      assert.ok(bytes(m.text) <= 2048, 'bytes ' + bytes(m.text))
    } finally { await w.setLimit({ readSessionBytes: DEFAULT.bytes }) }
  })
})
