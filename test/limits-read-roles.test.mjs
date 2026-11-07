/**
 * session.read's bounds with labelled messages (contract §4.1, §8; DESIGN §5c, §16 "readSessionMessages",
 * "readSessionBytes"; conn-OQ-20). The instance names its bounds in each request
 * (`{sessionId, maxMessages, maxBytes}`) and the connector cuts the reply to fit; the bounds count message
 * text only, whatever label (role, author) the message has. The connector keeps the settings
 * `readSessionMessages` (default 12) and `readSessionBytes` (default 12288) because its code reads them
 * (conn-OQ-20). **Reading** (DESIGN §16: "Messages read_session returns", "Bytes read_session returns";
 * contract §0: the connector's limits are its own): a reply never holds more than the setting, whatever
 * the request asks, and a change applies to the next read without a restart. Messages are appended into
 * a managed blank session's log (support/worker.mjs injectUserMessage).
 *
 * | id      | technique | requirement | expected |
 * |---------|-----------|-------------|----------|
 * | LRR-01  | ST + BVA (maxMessages 12 → 3 → 1 → 12; 15 labelled messages) | contract §4.1 | the newest 12 / 3 / 1 / 12, in order, roles and authors intact |
 * | LRR-02  | BVA (maxBytes 2048 / 3072 / 12288; 4 messages of exactly 1024 bytes with 300-character labels) | contract §4.1 | the newest 2 / 3 / all 4: labels are not counted |
 * | LRR-03  | BVA (maxBytes 2047; the same 4 messages) | contract §4.1 | at most 2047 bytes of text; the newest whole with its label |
 * | LRR-04  | BVA (maxBytes 2048; one 5000-byte message from another session) | contract §4.1 | one entry, label kept, a prefix ending with an ellipsis, at most 2048 bytes |
 * | LRR-05  | ST + BVA (readSessionMessages 3 → 12, request 12) | DESIGN §16; conn-OQ-20 (Reading) | at most 3 messages while the setting is 3 (the newest, labels intact); the newest 12 again after it is back at 12, no restart |
 * | LRR-06  | BVA (readSessionBytes 2048, request 12288; the 4 messages of LRR-02) | DESIGN §16; conn-OQ-20 (Reading) | the newest 2 (2048 bytes of text); all 4 again at 12288 |
 *
 * LRR-05 and LRR-06 are skipped as an open question (MSGF.skip.readSettingsCap): the Reading above is not settled by the docs.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ROLE } from 'fishball-connector/contract'
import { ELLIPSIS, LIMITS_R11 } from './support/constants.mjs'
import { HOOK, T } from './support/expect.mjs'
import { bootStub, stopStub } from './support/instance-stub.mjs'
import { MSGF, blankManaged, bytes, expectedAuthor, fishballId, inject, notice, padded, readOk, relay, roleOf, setLimit, textBytes, tok } from './support/instance-stub-messaging.mjs'

const DEFAULT = { maxMessages: LIMITS_R11.readSessionMessages.default, maxBytes: LIMITS_R11.readSessionBytes.default }
const SIZE = 1024
/** [text, source] → the label a read must give it. */
const labelOf = (fb) => ([text, source]) => ({ role: roleOf(source, fb), text, ...(expectedAuthor(source, fb) ? { author: expectedAuthor(source, fb) } : {}) })
/** A read's messages reduced to what labelOf names (author only where the reading fixes it). */
const labelsOfRead = (messages, wanted) => messages.map((m, i) => ({ role: m.role, text: m.text, ...(wanted[i]?.author !== undefined ? { author: m.author } : {}) }))

describe('session.read bounds with labelled messages', () => {
  let booted
  let host
  let stub
  let fb
  /** A related blank session holding these [text, source] rows; returns its id. */
  async function holding(name, rows) {
    const sessionId = await blankManaged(host, name)
    for (const [text, source] of rows) await inject(host, sessionId, text, source)
    return sessionId
  }
  /** Read and compare with the labels of the expected rows. */
  async function assertRead(sessionId, bounds, rows, label) {
    const wanted = rows.map(labelOf(fb))
    const { messages } = await readOk(stub, sessionId, bounds)
    assert.deepEqual(labelsOfRead(messages, wanted), wanted, label)
  }
  /** One message per label in turn: user, Fishball's relay, another session's relay, a notice, runtime context. */
  const fifteen = () => Array.from({ length: 15 }, (_, i) => [tok('lrr1n' + i), [{ kind: 'user' }, relay(fb), relay(MSGF.otherSession), notice('goal'), { kind: 'runtime-context' }][i % 5]])
  /** Four messages of exactly 1024 bytes with labels far longer than the text bound's unit. */
  const four = () => Array.from({ length: 4 }, (_, i) => [padded(tok('lrr2n' + i), SIZE), i % 2 === 0 ? { kind: 'fbtest-kind-' + 'k'.repeat(300) } : relay(MSGF.otherSession + '-' + 's'.repeat(300))])

  before(async () => {
    booted = await bootStub('lrr')
    ;({ host, stub } = booted)
    fb = await fishballId(host)
  }, HOOK)
  after(() => stopStub(booted), HOOK)

  it('LRR-01 maxMessages: 12, then 3, then 1, then 12 again, labels intact', T, async () => {
    const rows = fifteen()
    const sessionId = await holding('lrr-01', rows)
    for (const n of [DEFAULT.maxMessages, 3, 1, DEFAULT.maxMessages]) await assertRead(sessionId, { ...DEFAULT, maxMessages: n }, rows.slice(-n), 'maxMessages ' + n)
  })

  it('LRR-02 maxBytes counts text only: 2048 keeps 2 messages of 1024, 3072 keeps 3, the default keeps all 4', T, async () => {
    const rows = four()
    const sessionId = await holding('lrr-02', rows)
    for (const [maxBytes, kept] of [[2 * SIZE, 2], [3 * SIZE, 3], [DEFAULT.maxBytes, 4]]) await assertRead(sessionId, { ...DEFAULT, maxBytes }, rows.slice(-kept), 'maxBytes ' + maxBytes)
  })

  it('LRR-03 maxBytes one below two messages: at most that many bytes of text, the newest whole', T, async () => {
    const rows = four()
    const sessionId = await holding('lrr-03', rows)
    const maxBytes = 2 * SIZE - 1
    const { messages } = await readOk(stub, sessionId, { ...DEFAULT, maxBytes })
    assert.ok(messages.length >= 1)
    assert.ok(textBytes(messages) <= maxBytes, 'text bytes ' + textBytes(messages))
    const newest = labelOf(fb)(rows.at(-1))
    assert.deepEqual(labelsOfRead([messages.at(-1)], [newest])[0], newest, 'the newest message whole, with its label')
  })

  it('LRR-04 a message longer than maxBytes is cut with an ellipsis and keeps its label', T, async () => {
    const head = tok('lrr4') + ' '
    const sessionId = await holding('lrr-04', [[head + 'a'.repeat(5000 - bytes(head)), relay(MSGF.otherSession)]])
    const maxBytes = 2 * SIZE
    const { messages } = await readOk(stub, sessionId, { ...DEFAULT, maxBytes })
    assert.equal(messages.length, 1)
    const [m] = messages
    assert.equal(m.role, ROLE.agent)
    assert.equal(m.author, MSGF.otherSession)
    assert.ok(m.text.startsWith(head) && m.text.endsWith(ELLIPSIS))
    assert.ok(bytes(m.text) <= maxBytes, 'bytes ' + bytes(m.text))
  })

  it('LRR-05 readSessionMessages caps every read, and a change applies to the next read', { ...T, skip: MSGF.skip.readSettingsCap }, async () => {
    const rows = fifteen()
    const sessionId = await holding('lrr-05', rows)
    const CAP = 3
    await setLimit(host, { readSessionMessages: CAP })
    try {
      await assertRead(sessionId, DEFAULT, rows.slice(-CAP), 'readSessionMessages ' + CAP + ' with a request for ' + DEFAULT.maxMessages)
    } finally { await setLimit(host, { readSessionMessages: DEFAULT.maxMessages }) }
    await assertRead(sessionId, DEFAULT, rows.slice(-DEFAULT.maxMessages), 'back to the default')
  })

  it('LRR-06 readSessionBytes caps every read: 2048 keeps the newest 2 of 1024, the default all 4', { ...T, skip: MSGF.skip.readSettingsCap }, async () => {
    const rows = four()
    const sessionId = await holding('lrr-06', rows)
    await setLimit(host, { readSessionBytes: 2 * SIZE })
    try {
      await assertRead(sessionId, DEFAULT, rows.slice(-2), 'readSessionBytes ' + 2 * SIZE + ' with a request for ' + DEFAULT.maxBytes)
    } finally { await setLimit(host, { readSessionBytes: DEFAULT.maxBytes }) }
    await assertRead(sessionId, DEFAULT, rows, 'back to the default')
  })
})
