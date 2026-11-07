/**
 * I7 — card records in the custom chat, and I9 R7's `authorKind` on user rows
 * (docs/slim-native-design.md §0.5 "Records", §0.9 U5/U6, §18.2 I7 and I9 R7; contract
 * card-record.js for the record's v1 fields).
 * Observation points:
 * - the child chat's GET /api/chat entries (createChat(ctx).handle(CHAT.path, {method:'GET'}))
 *   over a stand-in sessionQuery log, and its live `session/event` relay (subscribe);
 * - createRecordRow(document, record, i18n) of src/slim/ui/records.js with a small fake document
 *   (test/support/body-soul-chat.mjs). The real page's layout is the browser phase.
 *
 * | id | technique | expected |
 * |----|-----------|----------|
 * | I9-AK-01 | EP | user/message with source.kind `user` → entry authorKind `user` |
 * | I9-AK-02 | EP | source.kind `schedule` → `schedule` |
 * | I9-AK-03 | EP | source.kind `agent-message` / `fishball-notice` / unknown → `other` |
 * | I9-AK-04 | EP | no source → `other` |
 * | I9-AK-05 | P | no user entry carries an English `author` text field |
 * | I9-AK-06 | P | the live relay publishes the same authorKind |
 * | I7-P-01 | P | one `plugin:fishball/card-record` event → one `record` entry carrying the record data unchanged |
 * | I7-ST-01 | ST (written → re-delivered) | the same record id appended twice → one entry, at its first place |
 * | I7-EP-01 | EP | two records with different ids → two entries, in log order |
 * | I7-EP-02 | EP | a record with no id / a wrong version → no record entry — todo (the design states no rule) |
 * | I7-R3-01 | P (U5) | a record beside an inbox notice: both rows stay (no merge) |
 * | I7-ROW-EP-01..05 | EP (kind) | permission / question / plan review / own question / closure: the title is the connector's `record.*` word (en, zh) |
 * | I7-ROW-EP-06 | EP (optional fields absent) | a minimal record of each kind: no `undefined`, `null`, `NaN`, `Invalid Date` or raw `record.` key in the text |
 * | I7-ROW-EP-07 | EP (optional fields present) | every label shown is the connector's word (from, tool, arguments, reason, answer, note, closed) |
 * | I7-ROW-P-01 | P | the outcome word is the connector's `record.outcome.*` word, en and zh |
 * | I7-ROW-P-02 | P | who and where use the connector's `record.by.*` / `record.place.*` words |
 * | I7-ROW-BVA-01 | BVA | a text at the writer's cap ending in the cut marker `…` is shown whole, marker included |
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { connectorRecordWords, loadConnector, loadInstance } from './support/body-soul-env.mjs'
import { CHAT_EVENT, chatHarness, fakeDocument } from './support/body-soul-chat.mjs'

const loadChat = () => loadInstance('src/slim/child/chat.js')
const { ENTRY_KIND } = await loadChat()
const { createRecordRow } = await loadInstance('src/slim/ui/records.js')
const { createI18n } = await loadInstance('src/slim/ui/i18n.js')
const { CARD_RECORD } = await loadConnector('contract/card-record.js')
const WORDS = connectorRecordWords()
const K = CARD_RECORD

const userMessage = (id, source, text = 'hello') => ({ id, role: 'user', content: [{ type: 'text', text }], ...(source === undefined ? {} : { source }) })
/** A complete v1 record (contract card-record.js field list); `changes` overrides or removes (undefined) fields. */
function record(changes = {}) {
  const base = {
    v: K.version, id: 'rec-1', cardId: 'apr_1', kind: K.kind.permission, at: 1_700_000_000_000, by: K.by.user, place: K.place.pile,
    outcome: K.outcome.allowed, from: { sessionId: 'session-asker', title: 'Asking session' },
    tool: 'shell', reason: 'needs to list files', arguments: '{"cmd":"ls"}', argumentsStatus: 'complete', note: 'ok by me',
  }
  const value = { ...base, ...changes }
  for (const [key, v] of Object.entries(value)) if (v === undefined) delete value[key]
  return value
}

describe('I9 R7 user rows carry authorKind, not author text', () => {
  for (const [id, source, expected] of [
    ['I9-AK-01', { kind: 'user' }, 'user'],
    ['I9-AK-02', { kind: 'schedule' }, 'schedule'],
    ['I9-AK-03a', { kind: 'agent-message', form: 'relay' }, 'other'],
    ['I9-AK-03b', { kind: 'fishball-notice', form: 'notice' }, 'other'],
    ['I9-AK-03c', { kind: 'fbtest-future-kind' }, 'other'],
    ['I9-AK-04', undefined, 'other'],
  ]) {
    it(id + ' source.kind ' + (source?.kind ?? 'absent') + ' → authorKind ' + expected, async (t) => {
      const h = await chatHarness(t, { loadChat })
      h.commit(CHAT_EVENT.user, userMessage('m1', source))
      const [entry] = await h.entries()
      assert.equal(entry.kind, ENTRY_KIND.user)
      assert.equal(entry.authorKind, expected)
      assert.equal(Object.hasOwn(entry, 'author'), false, 'I9-AK-05: no English author text')
    })
  }
  it('I9-AK-06 the live relay publishes the same authorKind', async (t) => {
    const h = await chatHarness(t, { loadChat })
    await h.entries() // activates the session, so live events for it are relayed
    const published = h.live({ seq: 9, time: 1, type: CHAT_EVENT.user, data: userMessage('m9', { kind: 'schedule' }) })
    const entry = published.find((frame) => frame.type === 'entry')?.entry
    assert.equal(entry?.authorKind, 'schedule')
    assert.equal(Object.hasOwn(entry, 'author'), false)
  })
})

describe('I7 the chat projects card records', () => {
  it('I7-P-01 one card-record event → one record entry with the data unchanged', async (t) => {
    const h = await chatHarness(t, { loadChat })
    const data = record()
    h.commit(CHAT_EVENT.cardRecord, data)
    const entries = await h.entries()
    const records = entries.filter((e) => e.kind === ENTRY_KIND.record)
    assert.equal(records.length, 1)
    assert.deepEqual(records[0].record, data)
  })
  it('I7-ST-01 the same record id appended twice (re-delivered) → one entry, at its first place', async (t) => {
    const h = await chatHarness(t, { loadChat })
    h.commit(CHAT_EVENT.cardRecord, record())
    h.commit(CHAT_EVENT.user, userMessage('between', { kind: 'user' }))
    h.commit(CHAT_EVENT.cardRecord, record())
    const entries = await h.entries()
    assert.deepEqual(entries.map((e) => e.kind), [ENTRY_KIND.record, ENTRY_KIND.user])
  })
  it('I7-EP-01 two records with different ids → two entries in log order', async (t) => {
    const h = await chatHarness(t, { loadChat })
    h.commit(CHAT_EVENT.cardRecord, record({ id: 'rec-a' }))
    h.commit(CHAT_EVENT.cardRecord, record({ id: 'rec-b', kind: K.kind.question, tool: undefined }))
    const records = (await h.entries()).filter((e) => e.kind === ENTRY_KIND.record)
    assert.deepEqual(records.map((e) => e.record.id), ['rec-a', 'rec-b'])
  })
  it('I7-EP-02 a record without an id or with another version', { todo: 'open question: the design states no outcome for a malformed v1 record in the custom chat' }, () => {})
  it('I7-R3-01 a record and an inbox notice both stay (no merge, U5)', async (t) => {
    const h = await chatHarness(t, { loadChat })
    h.commit('plugin:fishball/inbox-notice', { text: 'a notice' })
    h.commit(CHAT_EVENT.cardRecord, record())
    const kinds = (await h.entries()).map((e) => e.kind)
    assert.deepEqual(kinds, [ENTRY_KIND.notice, ENTRY_KIND.record])
  })
})

describe('I7 the record row (createRecordRow, fake document)', () => {
  const BAD = /undefined|null|NaN|Invalid Date|record\.[a-z]/
  const kinds = [
    ['I7-ROW-EP-01 permission', record(), 'record.permission'],
    ['I7-ROW-EP-02 question', record({ kind: K.kind.question, cardId: 'qst_1', outcome: K.outcome.answered, tool: undefined, reason: undefined, arguments: undefined, argumentsStatus: undefined, note: undefined, questions: [{ header: 'Pick', question: 'Which one?', options: ['A', 'B'] }], answer: 'A' }), 'record.question'],
    ['I7-ROW-EP-03 plan review', record({ kind: K.kind.planReview, cardId: 'prm_1', outcome: K.outcome.rejected, tool: undefined, reason: undefined, arguments: undefined, argumentsStatus: undefined, questions: [{ question: 'Approve the plan?' }], note: 'too broad' }), 'record.plan-review'],
    ['I7-ROW-EP-04 own question', record({ kind: K.kind.question, cardId: 'oqn_1', own: true, by: K.by.user, place: K.place.session, outcome: K.outcome.skipped, tool: undefined, reason: undefined, arguments: undefined, argumentsStatus: undefined, note: undefined, questions: [{ question: 'Shall I go on?' }] }), 'record.own'],
    ['I7-ROW-EP-05 closure', record({ kind: K.kind.question, cardId: 'qst_2', by: undefined, place: undefined, outcome: K.outcome.closed, tool: undefined, reason: undefined, arguments: undefined, argumentsStatus: undefined, note: undefined, questions: [{ question: 'Still there?' }], closed: 'The session ended' }), 'record.question'],
  ]
  for (const lang of ['en', 'zh']) {
    const i18n = createI18n(lang)
    for (const [name, data, titleKey] of kinds) {
      it(name + ' (' + lang + '): title is the connector\'s word, outcome word shown, nothing undefined', () => {
        const row = createRecordRow(fakeDocument, data, i18n)
        const text = row.textContent
        const title = [...row.walk()].find((el) => el.tagName === 'SUMMARY')?.childNodes[0]?.textContent
        assert.equal(title, WORDS[lang][titleKey])
        assert.ok(text.includes(WORDS[lang]['record.outcome.' + data.outcome]), 'I7-ROW-P-01 outcome word')
        if (data.by !== undefined) assert.ok(text.includes(WORDS[lang]['record.by.' + data.by]), 'I7-ROW-P-02 who')
        if (data.place !== undefined) assert.ok(text.includes(WORDS[lang]['record.place.' + data.place]), 'I7-ROW-P-02 where')
        assert.doesNotMatch(text, BAD)
      })
    }
    it('I7-ROW-EP-06 minimal records of each kind show no undefined/null (' + lang + ')', () => {
      for (const kind of Object.values(K.kind)) {
        const minimal = { v: K.version, id: 'min-' + kind, cardId: 'c', kind, at: 1_700_000_000_000, outcome: K.outcome.closed }
        assert.doesNotMatch(createRecordRow(fakeDocument, minimal, i18n).textContent, BAD, kind)
      }
    })
    it('I7-ROW-EP-07 every label shown is the connector\'s word (' + lang + ')', () => {
      const full = record({ answer: 'yes', closed: 'gone', questions: [{ header: 'H', question: 'Q?' }] })
      const text = createRecordRow(fakeDocument, full, i18n).textContent
      for (const key of ['record.from', 'record.tool', 'record.reason', 'record.answer', 'record.note', 'record.closed']) assert.ok(text.includes(WORDS[lang][key]), key)
    })
  }
  it('I7-ROW-EP-06b a record at an unparsable time shows no Invalid Date', () => {
    assert.doesNotMatch(createRecordRow(fakeDocument, record({ at: 'not-a-time' }), createI18n('en')).textContent, BAD)
  })
  it('I7-ROW-BVA-01 a text cut by its writer (ends in …) is shown whole', () => {
    const cut = 'x'.repeat(499) + '…'
    assert.ok(createRecordRow(fakeDocument, record({ reason: cut }), createI18n('en')).textContent.includes(cut))
  })
})
