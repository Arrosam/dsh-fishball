/**
 * P11 R4: the author of every intake message, read from Fishball's session log (user/message source).
 * One host with the source fixtures (FBTEST_SOURCES=1) and DSH's title cap raised to 1024 bytes
 * (FBTEST_TITLE_MAX_BYTES), so titles longer than the 200-byte author bound exist. Session titles are
 * set through DSH's own rename (worker op renameSession) and checked with DSH's title service first.
 * Permission requests and Fishball's notes about them are in messenger-author-approvals.test.mjs.
 *
 * | id     | technique | expected |
 * |--------|-----------|----------|
 * | AUT-01 | EP (message_fishball from S) | source = {agent-message, relay, senderSessionId: S, author: {kind:'session', name: S's title, seed: S}}; text and block unchanged; a markup-like title is the name verbatim |
 * | AUT-02 | EP (a subagent of S calls it) | author {kind:'session', name: S's title, seed: S} (the root session, not the child) |
 * | AUT-03 | EP (POST send for S) | source = {fishball-notice, notice, 'The user forwarded a session', author: {kind:'user', name: S's title, seed: S}} |
 * | AUT-05 | EP (a watched session S finished) | source = {fishball-notice, notice, 'A watched session finished (completed)', author: {kind:'watch', name: S's title, seed: S}} |
 * | AUT-06 | EP (plugin source, identity I, title X) | source = {fishball-notice, notice, 'Plugin event: "X"', author: {kind:'plugin', name: X, seed: I}} |
 * | AUT-07 ×2 | BVA (source title exactly 200 bytes: ASCII / 4-byte emoji) | name is the whole title |
 * | AUT-08 | EP (unchecked-tools notice) | author exactly {kind:'system'} |
 * | AUT-09 ×9 | BVA + EP (title bytes × character width) | 199, 200 ASCII; 66 CJK + 2 ASCII = 200; 50 emoji = 200; 100 'é' = 200: whole. 201 ASCII; 67 CJK = 201; 51 emoji = 204; 100 'é' + 1 ASCII = 201: cut to at most 200 bytes, ending with '…', a prefix of the title, no broken character |
 * | AUT-10 | EP (empty title: the session's only turn came from a relay) | author {kind:'session', seed: S}; the key name is absent |
 * | AUT-11 | ST (title A -message-> rename to B -message->) | the first message still says A, the second says B |
 * | AUT-12 | EP (Send to Fishball, title 250 bytes) | the cut rule also applies to the user author |
 * | AUT-13 | EP (sweep of Fishball's log) | every author has only kind/name/seed, a known kind, string values, a name of at most 200 bytes; every relay and every notice but the setup message has one |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  API, AUTHOR_KEYS, AUTHOR_KIND, AUTHOR_NAME_MAX_BYTES, ELLIPSIS, FIXTURE_BUNDLE, FIXTURE_UNCHECKED, FORWARD_HEADER, FORWARD_SUMMARY, INBOUND_TOOL, NOTICE,
  PRESET, RELAY, RELAY_HEADER, SETUP_SOURCE, SOURCE_BUNDLES, SOURCE_IDENTITY, SOURCE_SUMMARY, SOURCES_ENV, STATUS, TITLE_ENV, WATCH_API, WATCH_STATUS, WATCH_SUMMARY,
} from './support/constants.mjs'
import {
  HOOK, T, callScript, fishballMessages, messageFishball, noticesSettled, pluginNotices, publish, register, settle, settledIdle, turn, untilSeen, untrustedBlock, watchesOn,
} from './support/expect.mjs'
import { bootHost, newHome, until } from './support/host.mjs'

const A = SOURCE_BUNDLES.profile
const LA = A.rows.a.label
let seq = 0
const tok = (label) => 'TOK' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 8)
const bytes = (s) => Buffer.byteLength(s, 'utf8')

/** R4: a cut name is at most 200 bytes, ends with '…', is a prefix of the title and splits no character. */
function assertCutName(name, title, label) {
  assert.equal(typeof name, 'string', label + ': a name')
  assert.ok(bytes(name) <= AUTHOR_NAME_MAX_BYTES, label + ': at most 200 bytes, got ' + bytes(name))
  assert.ok(name.endsWith(ELLIPSIS), label + ': ends with the ellipsis: ' + JSON.stringify(name.slice(-8)))
  const prefix = name.slice(0, -ELLIPSIS.length)
  assert.ok(title.startsWith(prefix), label + ': a prefix of the title')
  assert.equal(Buffer.from(name, 'utf8').toString('utf8'), name, label + ': no broken character')
  assert.equal(/[\uD800-\uDBFF]$/.test(prefix), false, label + ': no half of a surrogate pair before the ellipsis')
}

describe('P11 authors of intake messages', () => {
  let host
  let fb
  const setLimit = async (patch) => { const r = await host.call('settingsUpdate', { patch }); assert.equal(r.ok, true, JSON.stringify(r.error)) }
  const rename = async (sid, title) => {
    const r = await host.call('renameSession', { sessionId: sid, title })
    assert.equal(r.ok, true, 'rename: ' + JSON.stringify(r.error))
    assert.equal(await host.call('sessionTitle', { sessionId: sid }), title, 'precondition: DSH reports the title as given')
  }
  /** An ordinary session with one finished turn, renamed to title. */
  const named = async (folder, title, preset = PRESET.bare) => {
    const sid = (await host.call('ordinary', { preset, folder })).sessionId
    await turn(host, sid, [[{ text: 'warm-up' }]])
    await rename(sid, title)
    return sid
  }
  /** sid calls message_fishball with a fresh token; returns Fishball's one message for it. */
  const relayed = async (sid, label) => {
    const text = tok(label)
    const { json } = await messageFishball(host, sid, { message: text })
    assert.equal(json?.ok, true, JSON.stringify(json))
    assert.ok(await untilSeen(host, fb, text), 'Fishball read it')
    const got = await fishballMessages(host, fb, text)
    assert.equal(got.length, 1, 'one message')
    return { ...got[0], sent: text }
  }

  before(async () => {
    host = await bootHost(newHome('messenger-author'), { env: { ...SOURCES_ENV, ...TITLE_ENV } })
    const st = await host.waitStatus(STATUS.live)
    assert.equal(st?.status, STATUS.live, 'precondition: live')
    fb = st.sessionId
    // A profile-enabled DSH plugin starts off in Fishball; its sources are disabled until the user turns it on.
    assert.equal((await host.post(API.plugins, { plugin: A.name, on: true })).status, 200, 'precondition: fbtest-source on for Fishball')
    await settle(host)
    // cap 0: every input wakes Fishball, so nothing is parked.
    await setLimit({ wakeupsPerHour: 0 })
    await settledIdle(host, fb)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('AUT-01 message_fishball: author kind session with the sender\'s title, on the unchanged relay source', T, async () => {
    const title = 'Alpha "quoted" <b>bold</b> & co'
    const s = await named('aut-01', title)
    const m = await relayed(s, 'aut01')
    assert.deepEqual(m.source, { ...RELAY, senderSessionId: s, author: { kind: AUTHOR_KIND.session, name: title, seed: s } })
    assert.ok(m.text.startsWith(RELAY_HEADER), 'the text is unchanged: ' + m.text.slice(0, 120))
    const block = untrustedBlock(m.text)
    assert.equal(block?.fields.session_id, s)
    assert.equal(block.fields.message, m.sent)
  })

  it('AUT-02 a subagent\'s message_fishball names its root session as the author', T, async () => {
    const title = 'Parent ' + tok('t')
    const std = await named('aut-02', title, PRESET.standard)
    const marker = tok('aut02sub')
    const text = tok('aut02')
    await host.call('queueMarker', { marker, except: std, script: [[{ tool: INBOUND_TOOL, args: { message: text } }], [{ text: 'sub done' }]] })
    const r = await turn(host, std, [[{ tool: 'subagent', args: { description: 'fbtest sub', prompt: marker + ' please' } }], [{ text: 'parent done' }]])
    assert.equal(r.results[0]?.isError, false, 'precondition: the subagent started: ' + r.results[0]?.text)
    assert.ok(await until(async () => (await host.call('markerState', { marker })).left === 0, 15000, 100), 'precondition: the subagent ran its script')
    const child = (await host.call('markerState', { marker })).sessions[0]
    assert.notEqual(child, std)
    assert.ok(await untilSeen(host, fb, text))
    const got = await fishballMessages(host, fb, text)
    assert.equal(got.length, 1)
    assert.deepEqual(got[0].source.author, { kind: AUTHOR_KIND.session, name: title, seed: std })
    assert.equal(got[0].source.senderSessionId, std)
  })

  it('AUT-03 Send to Fishball: author kind user with the forwarded session\'s title', T, async () => {
    const title = 'Forwarded ' + tok('t')
    const s = await named('aut-03', title)
    const last = tok('aut03answer')
    await turn(host, s, [[{ text: last }]])
    const res = await host.post(API.send, { sessionId: s, note: '' })
    assert.equal(res.status, 200, res.text)
    assert.ok(await untilSeen(host, fb, last), 'Fishball read the forward')
    const got = await fishballMessages(host, fb, last)
    assert.equal(got.length, 1)
    assert.deepEqual(got[0].source, { ...NOTICE, summary: FORWARD_SUMMARY, author: { kind: AUTHOR_KIND.user, name: title, seed: s } })
    assert.ok(got[0].text.startsWith(FORWARD_HEADER), 'the text is unchanged')
  })

  it('AUT-05 a watch notice: author kind watch with the watched session\'s title', T, async () => {
    const title = 'Watched ' + tok('t')
    const s = await named('aut-05', title)
    await settledIdle(host, fb)
    const res = await host.post(WATCH_API.add, { sessionId: s })
    assert.equal(res.status, 200, res.text)
    const watch = (await watchesOn(host, s)).find((w) => w.status === WATCH_STATUS.active)
    assert.ok(watch, 'precondition: an active watch')
    await turn(host, s, [[{ text: tok('aut05answer') }]])
    const got = await noticesSettled(host, fb, watch.id, 1)
    assert.equal(got.length, 1)
    assert.deepEqual(got[0].source, { kind: 'fishball-notice', form: 'notice', summary: WATCH_SUMMARY('completed'), author: { kind: AUTHOR_KIND.watch, name: title, seed: s } })
  })

  /** Register a source with this title on fbtest-source (src-a), publish one event, return its notice and identity. */
  async function pluginEvent(id, title) {
    const r = await register(host, LA, { id, title }, id)
    assert.equal(r.ok, true, 'precondition: registered: ' + JSON.stringify(r.error))
    await settledIdle(host, fb)
    const body = tok('body')
    const p = await publish(host, id, { dedupeKey: tok('key'), title: tok('title'), body })
    assert.equal(p.ok, true, JSON.stringify(p.error))
    assert.ok(await untilSeen(host, fb, body), 'Fishball read the event')
    const got = await pluginNotices(host, fb, body)
    assert.equal(got.length, 1)
    return { notice: got[0], identity: SOURCE_IDENTITY(A.name, A.rows.a.id, id) }
  }

  it('AUT-06 a plugin source event: author kind plugin with the source title and identity', T, async () => {
    const title = 'Messenger author source'
    const { notice, identity } = await pluginEvent('aut-main', title)
    assert.deepEqual(notice.source, { ...NOTICE, summary: SOURCE_SUMMARY(title), author: { kind: AUTHOR_KIND.plugin, name: title, seed: identity } })
  })

  for (const [label, title] of [['200 ASCII bytes', 'p'.repeat(200)], ['200 bytes of 4-byte emoji', '😀'.repeat(50)]]) {
    it('AUT-07 a source title of exactly ' + label + ' is the whole name', T, async () => {
      assert.equal(bytes(title), AUTHOR_NAME_MAX_BYTES, 'precondition')
      const { notice, identity } = await pluginEvent('aut-' + (title.startsWith('p') ? 'ascii' : 'emoji'), title)
      assert.deepEqual(notice.source.author, { kind: AUTHOR_KIND.plugin, name: title, seed: identity })
    })
  }

  it('AUT-08 the unchecked-tools notice: author exactly {kind: system}', T, async () => {
    const isUnchecked = (m) => m.source?.kind === NOTICE.kind && m.text.includes('set_plugin_enabled') && FIXTURE_UNCHECKED.every((n) => m.text.includes(n))
    const notices = async () => (await fishballMessages(host, fb, 'set_plugin_enabled')).filter(isUnchecked)
    assert.equal((await notices()).length, 0, 'precondition: none yet')
    assert.equal((await host.post(API.plugins, { plugin: FIXTURE_BUNDLE.name, on: true })).status, 200)
    await settle(host)
    assert.ok(await until(async () => (await notices()).length >= 1, 15000, 200), 'a notice after the change applied')
    await settledIdle(host, fb)
    const got = await notices()
    assert.equal(got.length, 1)
    assert.deepEqual(got[0].source.author, { kind: AUTHOR_KIND.system })
    assert.deepEqual(Object.keys(got[0].source.author), ['kind'])
    assert.equal(got[0].source.form, NOTICE.form, 'the source keeps its fields')
  })

  describe('AUT-09 the 200-byte name bound (message_fishball)', () => {
    let s
    before(async () => { s = await named('aut-09', 'Bound start') }, HOOK)
    const cases = [
      ['199 ASCII bytes', 'a'.repeat(199), false],
      ['200 ASCII bytes', 'a'.repeat(200), false],
      ['201 ASCII bytes', 'a'.repeat(201), true],
      ['66 CJK characters and 2 ASCII = 200 bytes', '中'.repeat(66) + 'ab', false],
      ['67 CJK characters = 201 bytes', '中'.repeat(67), true],
      ['50 emoji = 200 bytes', '😀'.repeat(50), false],
      ['51 emoji = 204 bytes', '😀'.repeat(51), true],
      ['100 two-byte characters = 200 bytes', 'é'.repeat(100), false],
      ['100 two-byte characters and 1 ASCII = 201 bytes', 'é'.repeat(100) + 'z', true],
    ]
    for (const [label, title, cut] of cases) {
      it('AUT-09 a title of ' + label + (cut ? ' is cut with …' : ' is kept whole'), T, async (t) => {
        await rename(s, title)
        const m = await relayed(s, 'aut09')
        const author = m.source.author
        assert.equal(author?.kind, AUTHOR_KIND.session)
        assert.equal(author.seed, s)
        if (!cut) { assert.equal(author.name, title); return }
        t.diagnostic('cut name: ' + bytes(author.name) + ' bytes')
        assertCutName(author.name, title, label)
      })
    }
  })

  it('AUT-10 a session without a title: the author has no name key', T, async () => {
    const other = (await host.call('ordinary', { preset: PRESET.bare, folder: 'aut-10-other' })).sessionId
    const s = (await host.call('ordinary', { preset: PRESET.bare, folder: 'aut-10' })).sessionId
    const text = tok('aut10')
    // Its only turn starts from a relay, so DSH never derives a title (titles come from the user's messages).
    await host.call('driveStart', { sessionId: s, text: 'relay words', script: callScript(INBOUND_TOOL, { message: text }), source: { ...RELAY, senderSessionId: other } })
    assert.ok(await host.call('waitIdle', { sessionId: s }))
    assert.equal(await host.call('sessionTitle', { sessionId: s }), '', 'precondition: the session has no title')
    assert.ok(await untilSeen(host, fb, text))
    const got = await fishballMessages(host, fb, text)
    assert.equal(got.length, 1)
    assert.deepEqual(got[0].source.author, { kind: AUTHOR_KIND.session, seed: s })
    assert.equal(Object.hasOwn(got[0].source.author, 'name'), false, 'name is absent, not empty')
  })

  it('AUT-11 a later rename does not change a stored message\'s author', T, async () => {
    const first = 'Before ' + tok('t')
    const second = 'After ' + tok('t')
    const s = await named('aut-11', first)
    const m1 = await relayed(s, 'aut11a')
    await rename(s, second)
    const m2 = await relayed(s, 'aut11b')
    assert.equal(m2.source.author?.name, second)
    const again = await fishballMessages(host, fb, m1.sent)
    assert.equal(again.length, 1)
    assert.equal(again[0].source.author?.name, first, 'the stored message keeps the title it arrived with')
  })

  it('AUT-12 Send to Fishball cuts a 250-byte title the same way', T, async () => {
    const title = 'b'.repeat(250)
    const s = await named('aut-12', title)
    const last = tok('aut12answer')
    await turn(host, s, [[{ text: last }]])
    assert.equal((await host.post(API.send, { sessionId: s, note: '' })).status, 200)
    assert.ok(await untilSeen(host, fb, last))
    const author = (await fishballMessages(host, fb, last))[0]?.source.author
    assert.equal(author?.kind, AUTHOR_KIND.user)
    assert.equal(author.seed, s)
    assertCutName(author.name, title, '250 bytes')
  })

  it('AUT-13 every author in Fishball\'s log is well formed; every relay and notice but the setup message has one', T, async () => {
    const events = (await host.call('inspect', { sessionId: fb, events: true })).events ?? []
    const messages = events.filter((e) => e.type === 'user/message')
    let seen = 0
    for (const m of messages) {
      const src = m.source ?? {}
      const label = JSON.stringify(src).slice(0, 200)
      const isSetup = src.kind === SETUP_SOURCE.kind && src.summary === SETUP_SOURCE.summary
      const isIntake = (src.kind === RELAY.kind && src.form === RELAY.form) || (src.kind === NOTICE.kind && !isSetup)
      if (isIntake) assert.ok(src.author, 'an author on ' + label)
      if (!src.author) continue
      seen++
      const a = src.author
      for (const k of Object.keys(a)) assert.ok(AUTHOR_KEYS.includes(k), 'unknown author key ' + k + ' on ' + label)
      assert.ok(Object.values(AUTHOR_KIND).includes(a.kind), 'kind ' + a.kind)
      for (const k of ['name', 'seed']) if (Object.hasOwn(a, k)) assert.equal(typeof a[k], 'string', k + ' on ' + label)
      if (Object.hasOwn(a, 'name')) {
        assert.ok(a.name.length > 0, 'a present name is not empty: ' + label)
        assert.ok(bytes(a.name) <= AUTHOR_NAME_MAX_BYTES, 'name bound: ' + label)
      }
    }
    assert.ok(seen >= 10, 'authors were seen: ' + seen)
  })
})
