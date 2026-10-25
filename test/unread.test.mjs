/**
 * Unread replies from Fishball (R1-R8). Written from the requirements only; the expected values never
 * come from the implementation. Case ids and techniques are also listed in CASES.md ("Unread replies").
 *
 * Technique: EP = equivalence partitioning, BVA = boundary values, DT = decision table, ST = state transition.
 *
 * | id          | technique | req | expected |
 * |-------------|-----------|-----|----------|
 * | UNR-01      | EP        | R1  | GET state and every SSE frame carry unread = {count} with a non-negative integer |
 * | UNR-02      | EP (oracle) | R2 | a fresh home's count equals the number of non-blank assistant/message events in Fishball's log |
 * | UNR-03 ×4   | BVA (1, 2, 3, 5 replies in one turn) | R2 | count = n |
 * | UNR-04 ×10  | DT (message content x count) | R2, R3 | non-blank text block: +1; tool-call only, '' and whitespace-only text: +0 |
 * | UNR-05      | EP (user message, turn events) | R3 | a turn whose only assistant message is blank adds 0 |
 * | UNR-06      | EP (other sessions) | R3 | replies of an ordinary session and of a subagent do not change the count |
 * | UNR-07      | EP (real flow) | R2 | another session's message_fishball wakes Fishball; its one reply adds 1 |
 * | UNR-10      | EP (body {}) | R4 | 200 {ok:true,state}; count 0 in the answer and in GET state |
 * | UNR-11 ×2   | EP (other objects) | R4 | {extra:1} and {count:5} also answer 200 and give 0 |
 * | UNR-12 ×8   | DT (body kind) | R4 | malformed, empty, array, string, number, null, true: 400 {ok:false,code:'bad-body'}; count unchanged |
 * | UNR-13      | ST (0 -read-> 0) | R4 | 200, no new frame on the stream |
 * | UNR-14      | ST (n -read-> 0 -reply-> 1) | R4 | replies after a read count from 0 |
 * | UNR-15      | EP (no cookie) | R4 | not 200; count unchanged |
 * | UNR-20      | ST (SSE, 3 replies) | R7 | the stream shows 0,1,2,3 in order |
 * | UNR-21      | ST (SSE, read) | R7 | a frame with 0 follows a read |
 * | UNR-22      | ST (reply then read, x5) | R7 | each pair shows 1 then 0; the count never exceeds 1; ends 0 |
 * | UNR-23      | ST (3 replies, read, 1 reply) | R7 | 0,1,2,3,0,1 and a final count of 1 |
 * | UNR-30      | ST (restart) | R5 | the count and the stored record {sessionId,count,changedAt} survive a restart |
 * | UNR-31      | ST (read, restart) | R5 | 0 after a restart; record count 0 |
 * | UNR-32 ×9   | BVA (stored count 0,1,2,98,99,100,101,1e6,MAX_SAFE) | R1, R5 | the state shows the stored count |
 * | UNR-33 ×2   | BVA (99 -reply-> 100, 100 -reply-> 101) | R2 | the count passes the pill boundary |
 * | UNR-34      | EP (no record) | R5, R6 | count 0 |
 * | UNR-35      | EP (record for another session) | R6 | count 0; later replies and a restart keep counting for the current session |
 * | UNR-36      | EP (record with count 0) | R5 | count 0; a reply gives 1 |
 * | UNR-40      | ST (recovery retry, same session) | R5, R6 | the count is kept |
 * | UNR-41      | ST (recovery adopt, new session) | R6 | the count is not the old session's; it equals the new session's own replies; survives a restart |
 * | UNR-50      | EP (client bundle) | R8  | the served bundle carries data-fishball-badge, 'Open Fishball' and prefers-reduced-motion (the rest of R8 is manual, A96) |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { API, INBOUND_TOOL, PRESET, STATUS, STORE, UNREAD, UNREAD_UI, assistantDir } from './support/constants.mjs'
import { HOOK, T, callScript, fishballClientBundle, moveArtifacts, settledIdle, turn } from './support/expect.mjs'
import { bootHost, bootLive, newHome, sleep, until } from './support/host.mjs'

// ---- helpers ----
const QUIET_MS = 400
const countNow = async (host) => (await host.state()).unread.count
/** Wait until the count is `want` (or the wait ends); returns the last count. */
async function waitCount(host, want, ms = 6000) {
  let last
  await until(async () => (last = await countNow(host)) === want, ms, 50)
  return last
}
/** The count is `want` and stays there for a moment (no late extra or missing reply). */
async function expectCount(host, want, label = '') {
  assert.equal(await waitCount(host, want), want, label + ' (wait)')
  await sleep(QUIET_MS)
  assert.equal(await countNow(host), want, label + ' (stable)')
}
async function resetUnread(host, fb) {
  await settledIdle(host, fb)
  const res = await host.post(API.read, {})
  assert.equal(res.status, 200, res.text)
  await expectCount(host, 0, 'after read')
}
/** One assistant message made of the given blocks: {text} or {tool}. */
const toolStep = { tool: 'list_plugins', args: {} }
const blank = [{ text: '' }]
/** n replies in one turn: n-1 messages with text and a tool call, then a closing text message. */
const nReplies = (n) => [...Array.from({ length: n - 1 }, (_v, i) => [{ text: 'reply ' + i }, toolStep]), [{ text: 'last reply' }]]
/** The non-blank assistant messages in a live session's log (the oracle for R2). */
async function repliesInLog(host, sessionId) {
  const events = (await host.call('inspect', { sessionId, events: true })).events ?? []
  return events.filter((e) => e.type === 'assistant/message' && String(e.text ?? '').trim() !== '').length
}
/** Consecutive duplicates removed: the order in which the count changed. */
const sequenceOf = (frames) => frames.map((f) => f.unread?.count).filter((n) => n !== undefined).reduce((a, n) => (a.at(-1) === n ? a : [...a, n]), [])
const readStore = (home) => JSON.parse(fs.readFileSync(STORE.file(home), 'utf8'))
const record = (home) => readStore(home).tables?.unread?.[UNREAD.key]
function editStore(home, edit) {
  const doc = readStore(home)
  doc.tables ??= {}
  edit(doc)
  fs.writeFileSync(STORE.file(home), JSON.stringify(doc, null, 2))
}
const seedUnread = (home, sessionId, count) => editStore(home, (d) => { d.tables[UNREAD.table] = { [UNREAD.key]: { sessionId, count, changedAt: new Date().toISOString() } } })
const storedSession = (home) => readStore(home).global.sessionId

// ---- R1-R3, R4, R7 on one shared host ----
describe('Unread: counting, read route, stream', () => {
  let host
  let fb
  let bare
  let std

  before(async () => {
    const booted = await bootLive(newHome('unread'))
    host = booted.host
    fb = booted.state?.sessionId
    bare = (await host.call('ordinary', { preset: PRESET.bare, folder: 'unread-bare' })).sessionId
    std = (await host.call('ordinary', { preset: PRESET.standard, folder: 'unread-std' })).sessionId
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  // UNR-02 has to run before any read, so it comes first.
  it('UNR-02 a fresh home counts exactly the non-blank assistant messages in Fishball\'s log', T, async () => {
    await settledIdle(host, fb)
    const replies = await repliesInLog(host, fb)
    assert.equal(await waitCount(host, replies), replies, 'count equals the replies already made (setup turn)')
  })

  it('UNR-01 GET state and every SSE frame carry unread = {count} with a non-negative integer', T, async () => {
    const s = await host.state()
    assert.deepEqual(Object.keys(s.unread), UNREAD.keys)
    assert.ok(Number.isInteger(s.unread.count) && s.unread.count >= 0, JSON.stringify(s.unread))
    const stream = await host.sse()
    try {
      assert.ok(await until(() => stream.frames.length > 0, 3000, 20), 'first frame')
      await resetUnread(host, fb)
      await turn(host, fb, nReplies(2))
      await expectCount(host, 2)
      for (const f of stream.frames) {
        assert.deepEqual(Object.keys(f.unread ?? {}), UNREAD.keys, JSON.stringify(f.unread))
        assert.ok(Number.isInteger(f.unread.count) && f.unread.count >= 0)
      }
      assert.equal(stream.frames.at(-1).unread.count, 2)
    } finally { stream.close() }
  })

  for (const n of [1, 2, 3, 5]) {
    it('UNR-03 ' + n + ' replies in one turn add ' + n, T, async () => {
      await resetUnread(host, fb)
      const r = await turn(host, fb, nReplies(n))
      assert.equal(r.assistantTexts.length, n, 'precondition: the turn made ' + n + ' assistant messages')
      await expectCount(host, n)
    })
  }

  const rows = [
    ['one non-empty text', [[{ text: 'hello' }]], 1, 1],
    ['single character with padding " a "', [[{ text: ' a ' }]], 1, 1],
    ['text and a tool call in one message', [[{ text: 'checking' }, toolStep], blank], 2, 1],
    ['a blank block then a non-empty block in one message', [[{ text: '' }, { text: 'x' }]], 1, 1],
    ['two non-empty text blocks in one message', [[{ text: 'one' }, { text: 'two' }]], 1, 1],
    ['a tool call only (then a blank closing message)', [[toolStep], blank], 2, 0],
    ['an empty text', [blank], 1, 0],
    ['whitespace only: space', [[{ text: ' ' }]], 1, 0],
    ['whitespace only: newline, tab and spaces', [[{ text: '\n\t  \n' }]], 1, 0],
    ['a blank text and a tool call in one message', [[{ text: '   ' }, toolStep], blank], 2, 0],
  ]
  for (const [label, script, messages, delta] of rows) {
    it('UNR-04 ' + label + ' adds ' + delta, T, async () => {
      await resetUnread(host, fb)
      const r = await turn(host, fb, script)
      assert.equal(r.assistantTexts.length, messages, 'precondition: assistant messages made: ' + JSON.stringify(r.assistantTexts))
      await expectCount(host, delta)
    })
  }

  it('UNR-05 a user message and the turn events add nothing when the answer is blank', T, async () => {
    await resetUnread(host, fb)
    const r = await turn(host, fb, [blank], 'a long, non-empty user message that Fishball answers with nothing')
    assert.ok(r.userLengths.some((n) => n > 0), 'precondition: a non-empty user message was logged')
    assert.deepEqual(r.turnEnds.length > 0, true, 'precondition: turn events were logged')
    await expectCount(host, 0)
  })

  it('UNR-06 replies in an ordinary session and in a subagent do not count', T, async () => {
    await resetUnread(host, fb)
    await turn(host, bare, nReplies(3))
    await turn(host, std, nReplies(2))
    const marker = 'UNRMARK' + Math.random().toString(36).slice(2, 8)
    await host.call('queueMarker', { marker, except: std, script: [[{ text: 'subagent says hello' }]] })
    const r = await turn(host, std, [[{ tool: 'subagent', args: { description: 'unread sub', prompt: marker + ' please' } }], [{ text: 'parent done' }]])
    assert.equal(r.results[0]?.isError, false, 'precondition: subagent started: ' + r.results[0]?.text)
    assert.ok(await until(async () => (await host.call('markerState', { marker })).left === 0, 15000, 100), 'precondition: the subagent answered')
    await settledIdle(host, fb)
    await expectCount(host, 0)
  })

  it('UNR-07 a message from another session wakes Fishball and its one reply adds 1', T, async () => {
    await resetUnread(host, fb)
    const text = 'unread relay ' + Math.random().toString(36).slice(2, 8)
    await turn(host, bare, callScript(INBOUND_TOOL, { message: text }))
    await expectCount(host, 1, 'Fishball answered the relay once')
  })

  it('UNR-10 read with {} answers 200 {ok:true,state} and sets the count to 0', T, async () => {
    await resetUnread(host, fb)
    await turn(host, fb, nReplies(3))
    await expectCount(host, 3)
    const res = await host.post(API.read, {})
    assert.equal(res.status, 200, res.text)
    assert.equal(res.json?.ok, true)
    assert.equal(res.json?.state?.unread?.count, 0)
    assert.equal(res.json?.state?.status, STATUS.live)
    await expectCount(host, 0)
  })

  for (const body of [{ extra: 1 }, { count: 5 }]) {
    it('UNR-11 read with the object ' + JSON.stringify(body) + ' gives 0', T, async () => {
      await resetUnread(host, fb)
      await turn(host, fb, nReplies(2))
      await expectCount(host, 2)
      const res = await host.post(API.read, body)
      assert.equal(res.status, 200, res.text)
      assert.equal(res.json?.ok, true)
      await expectCount(host, 0)
    })
  }

  const badBodies = [['malformed JSON', '{', true], ['an empty body', '', true], ['an array', '[]', true], ['an array holding an object', '[{}]', true], ['a string', '"read"', true], ['a number', '1', true], ['null', 'null', true], ['true', 'true', true]]
  for (const [label, body, raw] of badBodies) {
    it('UNR-12 read with ' + label + ' answers 400 bad-body and keeps the count', T, async () => {
      await resetUnread(host, fb)
      await turn(host, fb, nReplies(2))
      await expectCount(host, 2)
      const res = await host.post(API.read, body, { raw })
      assert.equal(res.status, 400, res.text)
      assert.deepEqual(res.json, { ok: false, code: 'bad-body' })
      await expectCount(host, 2, 'unchanged')
    })
  }

  it('UNR-13 a read at count 0 succeeds and publishes no new frame', T, async () => {
    await resetUnread(host, fb)
    await settledIdle(host, fb)
    const stream = await host.sse()
    try {
      assert.ok(await until(() => stream.frames.length > 0, 3000, 20))
      await sleep(500)
      const before = stream.frames.length
      const res = await host.post(API.read, {})
      assert.equal(res.status, 200, res.text)
      assert.equal(res.json?.ok, true)
      assert.equal(res.json?.state?.unread?.count, 0)
      await sleep(1500)
      assert.equal(stream.frames.length, before, 'no frame after a read at 0: ' + JSON.stringify(stream.frames.slice(before)))
    } finally { stream.close() }
  })

  it('UNR-14 replies after a read count from 0 again', T, async () => {
    await resetUnread(host, fb)
    await turn(host, fb, nReplies(2))
    await expectCount(host, 2)
    assert.equal((await host.post(API.read, {})).status, 200)
    await expectCount(host, 0)
    await turn(host, fb, nReplies(1))
    await expectCount(host, 1)
  })

  it('UNR-15 read without the browser cookie is refused and changes nothing', T, async () => {
    await resetUnread(host, fb)
    await turn(host, fb, nReplies(2))
    await expectCount(host, 2)
    const res = await fetch(host.origin + API.read, { method: 'POST', headers: { origin: host.origin, 'content-type': 'application/json' }, body: '{}' })
    await res.text()
    assert.notEqual(res.status, 200)
    await expectCount(host, 2)
  })

  it('UNR-20 the stream shows each step of the count in order: 0, 1, 2, 3', T, async () => {
    await resetUnread(host, fb)
    const stream = await host.sse()
    try {
      assert.ok(await until(() => stream.frames.length > 0, 3000, 20))
      await turn(host, fb, nReplies(3))
      await expectCount(host, 3)
      assert.deepEqual(sequenceOf(stream.frames), [0, 1, 2, 3])
    } finally { stream.close() }
  })

  it('UNR-21 a read publishes a frame with 0', T, async () => {
    await resetUnread(host, fb)
    await turn(host, fb, nReplies(2))
    await expectCount(host, 2)
    const stream = await host.sse()
    try {
      assert.ok(await until(() => stream.frames.length > 0, 3000, 20))
      assert.equal(stream.frames[0].unread.count, 2)
      assert.equal((await host.post(API.read, {})).status, 200)
      assert.ok(await until(() => stream.frames.some((f) => f.unread?.count === 0), 5000, 20), 'a frame with 0 arrives')
      assert.deepEqual(sequenceOf(stream.frames), [2, 0])
    } finally { stream.close() }
  })

  it('UNR-22 a reply and a read back to back are applied in order, five times', T, async () => {
    await resetUnread(host, fb)
    const stream = await host.sse()
    try {
      assert.ok(await until(() => stream.frames.length > 0, 3000, 20))
      for (let i = 0; i < 5; i++) {
        await turn(host, fb, nReplies(1))
        assert.equal((await host.post(API.read, {})).status, 200)
      }
      await expectCount(host, 0)
      const seq = sequenceOf(stream.frames)
      assert.deepEqual(seq, [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], 'nothing lost, nothing double counted')
    } finally { stream.close() }
  })

  it('UNR-23 3 replies, a read, then 1 reply gives 0,1,2,3,0,1 and ends at 1', T, async () => {
    await resetUnread(host, fb)
    const stream = await host.sse()
    try {
      assert.ok(await until(() => stream.frames.length > 0, 3000, 20))
      await turn(host, fb, nReplies(3))
      assert.equal((await host.post(API.read, {})).status, 200)
      await turn(host, fb, nReplies(1))
      await expectCount(host, 1)
      assert.deepEqual(sequenceOf(stream.frames), [0, 1, 2, 3, 0, 1])
    } finally { stream.close() }
  })
})

// ---- R5, R6: persistence and stored-state edges (one home, many restarts) ----
describe('Unread: persistence across restarts', () => {
  let host
  let home
  let fb

  /** Stop DSH, let a change run on the stored file, boot again and wait until Fishball is live and quiet. */
  async function restart(change) {
    await host.stop()
    change?.()
    host = await bootHost(home)
    const st = await host.waitStatus(STATUS.live)
    assert.equal(st?.status, STATUS.live, 'state: ' + JSON.stringify(st))
    await settledIdle(host, fb)
    return st
  }

  before(async () => {
    home = newHome('unread-persist')
    const booted = await bootLive(home)
    host = booted.host
    fb = booted.state?.sessionId
    await resetUnread(host, fb)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('UNR-30 the count and the stored record survive a restart', T, async () => {
    await turn(host, fb, nReplies(3))
    await expectCount(host, 3)
    assert.ok(await until(() => record(home)?.count === 3, 5000, 100), 'record stored: ' + JSON.stringify(record(home)))
    const rec = record(home)
    assert.deepEqual(Object.keys(rec).sort(), UNREAD.recordKeys)
    assert.equal(rec.sessionId, fb)
    assert.equal(typeof rec.changedAt, 'string')
    assert.ok(!Number.isNaN(Date.parse(rec.changedAt)), 'changedAt is a date: ' + rec.changedAt)
    const st = await restart()
    assert.equal(st.sessionId, fb)
    assert.equal(st.unread.count, 3)
    await expectCount(host, 3, 'after restart')
  })

  it('UNR-31 a read survives a restart as 0', T, async () => {
    assert.equal((await host.post(API.read, {})).status, 200)
    await expectCount(host, 0)
    assert.ok(await until(() => (record(home)?.count ?? 0) === 0, 5000, 100), 'a stored record, if any, says 0: ' + JSON.stringify(record(home)))
    await restart()
    await expectCount(host, 0, 'after restart')
  })

  for (const stored of [0, 1, 2, 98, 99, 100, 101, 1000000, Number.MAX_SAFE_INTEGER]) {
    it('UNR-32 a stored count of ' + stored + ' is shown', T, async () => {
      const st = await restart(() => seedUnread(home, fb, stored))
      assert.equal(st.unread.count, stored)
      const stream = await host.sse()
      try {
        assert.ok(await until(() => stream.frames.length > 0, 3000, 20))
        assert.equal(stream.frames[0].unread.count, stored, 'first frame')
      } finally { stream.close() }
      await expectCount(host, stored)
    })
  }

  for (const [from, to] of [[99, 100], [100, 101]]) {
    it('UNR-33 a reply takes the stored ' + from + ' to ' + to, T, async () => {
      await restart(() => seedUnread(home, fb, from))
      await turn(host, fb, nReplies(1))
      await expectCount(host, to)
    })
  }

  it('UNR-34 a store without an unread record gives 0', T, async () => {
    await restart(() => editStore(home, (d) => { delete d.tables[UNREAD.table] }))
    await expectCount(host, 0)
  })

  it('UNR-35 a record for another session is not applied, and current-session counting goes on', T, async () => {
    await restart(() => seedUnread(home, 'session-fishball-someone-else', 7))
    await expectCount(host, 0, 'foreign record')
    await turn(host, fb, nReplies(2))
    await expectCount(host, 2)
    await restart()
    await expectCount(host, 2, 'after restart')
  })

  it('UNR-36 a stored record with count 0 gives 0, and a reply gives 1', T, async () => {
    await restart(() => seedUnread(home, fb, 0))
    await expectCount(host, 0)
    await turn(host, fb, nReplies(1))
    await expectCount(host, 1)
  })
})

// ---- R5, R6: recovery (retry keeps the session, adopt replaces it) ----
describe('Unread: recovery', () => {
  let host
  let home
  let oldId

  before(async () => {
    home = newHome('unread-recovery')
    const booted = await bootLive(home)
    host = booted.host
    oldId = booted.state?.sessionId
    await resetUnread(host, oldId)
    await turn(host, oldId, nReplies(7))
    await expectCount(host, 7)
    assert.ok(await until(() => record(home)?.count === 7, 5000, 100), 'record stored')
    await host.stop()
    assert.ok(moveArtifacts(home, oldId, 'away').length > 0, 'precondition: the session store had the session')
    host = await bootHost(home)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('UNR-40 a retry that resumes the same session keeps the count', T, async () => {
    const st = await host.waitStatus(STATUS.recovery)
    assert.equal(st?.status, STATUS.recovery, 'state: ' + JSON.stringify(st))
    assert.ok(Number.isInteger(st.unread?.count) && st.unread.count >= 0, 'R1 holds in recovery: ' + JSON.stringify(st.unread))
    moveArtifacts(home, oldId, 'back')
    const res = await host.post(API.recovery, { action: 'retry' })
    assert.equal(res.status, 200, res.text)
    const live = await host.waitStatus(STATUS.live)
    assert.equal(live?.sessionId, oldId)
    await settledIdle(host, oldId)
    await expectCount(host, 7)
  })

  it('UNR-41 an adopted new session starts from its own replies, not the old count, and keeps them across a restart', T, async () => {
    await host.stop()
    fs.rmSync(path.join(home, 'aside'), { recursive: true, force: true })
    moveArtifacts(home, oldId, 'away')
    host = await bootHost(home)
    assert.equal((await host.waitStatus(STATUS.recovery))?.status, STATUS.recovery)
    const res = await host.post(API.recovery, { action: 'adopt' })
    assert.equal(res.status, 200, res.text)
    const st = await host.waitStatus(STATUS.live)
    const fresh = st.sessionId
    assert.notEqual(fresh, oldId)
    await settledIdle(host, fresh)
    const own = await repliesInLog(host, fresh)
    assert.notEqual(own, 7, 'precondition: the new session\'s own replies differ from the old count')
    assert.equal(await waitCount(host, own), own, 'count is the new session\'s own replies, never the old 7')
    await turn(host, fresh, nReplies(2))
    await expectCount(host, own + 2)
    await host.stop()
    host = await bootHost(home)
    const again = await host.waitStatus(STATUS.live)
    assert.equal(again.sessionId, fresh)
    await settledIdle(host, fresh)
    await expectCount(host, own + 2, 'after restart')
  })
})

// ---- R8: the browser half ----
describe('Unread: client bundle', () => {
  let host
  before(async () => { host = (await bootLive(newHome('unread-client'))).host }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('UNR-50 the served client bundle carries the badge attribute, the brand label and a reduced-motion rule', T, async () => {
    const bundle = await fishballClientBundle(host)
    assert.equal(bundle.found, true, 'the bundle is linked from the index')
    assert.equal(bundle.status, 200)
    for (const needle of [UNREAD_UI.badgeAttr, UNREAD_UI.openLabel, UNREAD_UI.reducedMotion]) assert.ok(bundle.text.includes(needle), 'bundle lacks ' + JSON.stringify(needle))
  })
})
