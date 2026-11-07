/**
 * P5 M6-M8: Fishball's own message_session and start_session, and the outbox in the state.
 *
 * | id     | technique | req | expected |
 * |--------|-----------|-----|----------|
 * | OUT-01 | EP (live idle target) | M6, M8 | {ok:true, sessionId, title}; one relay message from Fishball's session with the text verbatim; the target runs a turn that reads it; one outbox entry kind message, delivered, with a digest and never the text |
 * | OUT-02 | ST (cold target → resumed) | M6 | the stored session becomes live with its own preset (header unchanged; its request has the fbtest-bare tool set) and runs a turn |
 * | OUT-03 ×7 | DT + BVA (maxMessageBytes 64) | M6 | '' and whitespace: empty; 65 bytes: too-large (64 accepted); Fishball's id: is-fishball; unknown id: unknown-session; archived: archived; none recorded in the outbox; nothing delivered |
 * | OUT-04 | EP (target whose preset cannot be resumed) | M6, M8 | {ok:false, code:'delivery-failed'}; the outbox records status failed, errorCode delivery-failed |
 * | OUT-05 | EP (absolute existing folder) | M7, M8 | {ok:true, sessionId, folder}; one new session in that folder with DSH's default preset; its requests list message_fishball and not message_session/start_session; the first message is a relay from Fishball and the session runs; no workspace is registered; outbox kind start with folder |
 * | OUT-06 | EP (workspace id) | M7 | the new session belongs to that workspace |
 * | OUT-06b | EP (workspace id, folder deleted) | M7 review | no-folder; the folder is not created; nothing recorded |
 * | OUT-07 ×9 | DT (folder × message) | M7 | missing folder: no-folder or a tool error (A51); '' → no-folder; missing path → no-folder, not created; a file → no-folder; relative → not-absolute; unknown non-path → not-absolute or no-folder (A52); '' message → empty; too large → too-large; nothing created or recorded |
 * | OUT-08 | EP | M8 | outbox entries have the documented keys and enums, newest first |
 *
 * Caps (own host, so the hourly counts start at zero):
 * | CAP-01 | BVA (messagesPerHour 2) | M6 | the 1st and 2nd are delivered, the 3rd answers hourly-cap and is not recorded |
 * | CAP-02 | BVA (sessionsPerHour 1) | M7 | the 1st start is delivered, the 2nd answers hourly-cap and creates no session |
 * | CAP-03 | EP (0 = no cap) | M6, M7 | with both caps 0, further sends and starts succeed |
 * | CAP-04 | BVA (auditEntriesKept 1 < messagesPerHour 3) | M6 review | the cap still counts every delivery of the hour: with 3 delivered in the hour (one more than before), the next is refused although only 1 entry is kept |
 * | CAP-05 | BVA (21 entries) | M8 | the state lists at most 20 entries, newest first |
 * | CAP-06 | BVA (auditEntriesKept 2) | M8 | after one more send, at most 2 entries remain, including the newest |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { INBOUND_TOOL, LIMITS, OUTBOUND_TOOLS, OUTBOX_KEYS, OUTBOX_OPTIONAL, P5_CODE, PRESET, RELAY, SENTINEL_PRESET, STATE_LIST_MAX, TITLE, NEEDS_INSTANCE_STUB } from './support/constants.mjs'
import { HOOK, T, fishballCall, jsonOf, outboxNow, settledIdle, toolNames, turn } from './support/expect.mjs'
import { bootLive, newHome, until } from './support/host.mjs'

let seq = 0
const tok = (label) => 'TOK' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 8)

/** Messages a target session received from Fishball containing needle (null while it is not live). */
async function received(host, sessionId, needle) {
  const msgs = await host.call('userMessages', { sessionId })
  return msgs ? msgs.filter((m) => m.text.includes(needle)) : null
}
const stateText = async (host) => JSON.stringify(await host.state())

describe('P5 message_session and start_session', { skip: NEEDS_INSTANCE_STUB }, () => {
  let host
  let home
  let fb
  let target
  const setLimit = async (patch) => { const r = await host.call('settingsUpdate', { patch }); assert.equal(r.ok, true, JSON.stringify(r.error)) }
  const send = (session_id, message) => fishballCall(host, fb, 'message_session', { session_id, message })
  // Every start_session needs a title (the title cases themselves are in messaging-start-title.test.mjs).
  const start = (args) => fishballCall(host, fb, 'start_session', { title: TITLE.plain, ...args })

  before(async () => {
    home = newHome('msg-out')
    const booted = await bootLive(home)
    host = booted.host
    fb = booted.state?.sessionId
    target = (await host.call('ordinary', { preset: PRESET.bare, folder: 'out-target' })).sessionId
    await settledIdle(host, fb)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('OUT-01 message_session delivers one relay message from Fishball and the target runs', T, async () => {
    const text = tok('out01') + ' please do X'
    const { json } = await send(target, text)
    assert.equal(json?.ok, true, JSON.stringify(json))
    assert.equal(json.sessionId, target)
    assert.equal(typeof json.title, 'string')
    assert.ok(await until(async () => (await host.call('requestsContaining', { needle: text })).some((r) => r.sessionId === target), 10000, 100), 'the target ran a turn that read it')
    const got = await received(host, target, text)
    assert.equal(got.length, 1)
    assert.deepEqual(got[0].source, { ...RELAY, senderSessionId: fb })
    assert.ok(got[0].text.includes(text), 'verbatim')
    const entry = (await outboxNow(host))[0]
    assert.equal(entry.kind, 'message')
    assert.equal(entry.targetSessionId, target)
    assert.equal(entry.status, 'delivered')
    assert.equal(typeof entry.messageDigest, 'string')
    assert.equal((await stateText(host)).includes(text.slice(0, 12)), false, 'no message text in state')
  })

  it('OUT-02 a cold target is resumed with its own preset and runs', T, async () => {
    const id = 'session-fbtest-cold-out02'
    await host.call('seedBlankSession', { sessionId: id, cwd: path.join(home, 'work', 'cold'), agentPreset: PRESET.bare })
    assert.equal(await host.call('agentStatus', { sessionId: id }), null, 'precondition: not live')
    const text = tok('out02')
    const { json } = await send(id, text)
    assert.equal(json?.ok, true, JSON.stringify(json))
    assert.equal(json.sessionId, id)
    assert.ok(await until(async () => (await host.call('requestsContaining', { needle: text })).some((r) => r.sessionId === id), 10000, 100), 'it ran a turn')
    assert.equal((await host.call('header', { sessionId: id })).agentPreset, PRESET.bare)
    const req = (await host.call('requests', { sessionId: id })).at(-1)
    assert.equal(toolNames(req).includes('read'), false, 'fbtest-bare tool set, not the standard preset')
    assert.ok(toolNames(req).includes(INBOUND_TOOL))
  })

  describe('OUT-03 message_session refusals', () => {
    let archivedId
    before(async () => {
      archivedId = (await host.call('ordinary', { preset: PRESET.bare, folder: 'out-archived' })).sessionId
      assert.equal((await host.call('archive', { sessionId: archivedId, stopActivity: true })).ok, true)
      await setLimit({ maxMessageBytes: 64 })
    }, HOOK)
    after(async () => { await setLimit({ maxMessageBytes: LIMITS.maxMessageBytes.default }) }, HOOK)
    const rows = [
      ['an empty message', () => [target, ''], P5_CODE.empty],
      ['a whitespace message', () => [target, ' \n '], P5_CODE.empty],
      ['a 65-byte message', () => [target, 'a'.repeat(65)], P5_CODE.tooLarge],
      ["Fishball's own id", () => [fb, 'hi'], P5_CODE.isFishball],
      ['an unknown id', () => ['session-fbtest-no-such', 'hi'], P5_CODE.unknownSession],
      ['an archived target', () => [archivedId, 'hi'], P5_CODE.archived],
    ]
    for (const [label, args, code] of rows) {
      it(label + ' → ' + code + ', not recorded', T, async () => {
        const before = await outboxNow(host)
        const { json } = await send(...args())
        assert.deepEqual(json, { ok: false, code })
        assert.deepEqual(await outboxNow(host), before)
      })
    }
    it('a 64-byte message (= limit) is delivered', T, async () => {
      const text = (tok('out03') + 'é'.repeat(40)).slice(0, 30)
      const padded = text + 'a'.repeat(64 - Buffer.byteLength(text))
      assert.equal(Buffer.byteLength(padded), 64)
      assert.equal((await send(target, padded)).json?.ok, true)
    })
  })

  it('OUT-04 a target that cannot be resumed answers delivery-failed and is recorded as failed', T, async () => {
    const id = 'session-fbtest-badpreset-out04'
    await host.call('seedBlankSession', { sessionId: id, cwd: path.join(home, 'work', 'bad'), agentPreset: 'fbtest-no-such-preset' })
    const { json } = await send(id, tok('out04'))
    assert.deepEqual(json, { ok: false, code: P5_CODE.deliveryFailed })
    const entry = (await outboxNow(host))[0]
    assert.equal(entry.targetSessionId, id)
    assert.equal(entry.kind, 'message')
    assert.equal(entry.status, 'failed')
    assert.equal(entry.errorCode, P5_CODE.deliveryFailed)
  })

  it('OUT-05 start_session creates one ordinary session in the folder and gives it the first message', T, async () => {
    const folder = path.join(home, 'work', 'start-here')
    fs.mkdirSync(folder, { recursive: true })
    const workspacesBefore = (await host.call('workspaces')).list.length
    const sessionsBefore = (await host.call('allSessions')).map((s) => s.id)
    const marker = tok('out05')
    await host.call('queueMarker', { marker, except: fb, script: [[{ text: 'started and working' }]] })
    const { json } = await start({ folder, message: marker + ' build it' })
    assert.equal(json?.ok, true, JSON.stringify(json))
    assert.equal(json.folder, folder)
    const created = (await host.call('allSessions')).filter((s) => !sessionsBefore.includes(s.id))
    assert.deepEqual(created.map((s) => s.id), [json.sessionId], 'exactly one new session')
    const header = await host.call('header', { sessionId: json.sessionId })
    assert.equal(fs.realpathSync(header.cwd), fs.realpathSync(folder))
    assert.equal(header.agentPreset, await host.call('defaultPreset'), "DSH's default preset")
    assert.notEqual(header.agentPreset, SENTINEL_PRESET)
    assert.ok(await until(async () => (await host.call('markerState', { marker })).left === 0, 10000, 100), 'the new session ran a turn')
    for (const r of await host.call('requests', { sessionId: json.sessionId })) {
      assert.ok(toolNames(r).includes(INBOUND_TOOL))
      for (const n of OUTBOUND_TOOLS) assert.equal(toolNames(r).includes(n), false, n)
      assert.equal(r.system.includes('You are Fishball'), false)
    }
    const got = await received(host, json.sessionId, marker)
    assert.equal(got.length, 1)
    assert.deepEqual(got[0].source, { ...RELAY, senderSessionId: fb })
    assert.equal((await host.call('workspaces')).list.length, workspacesBefore, 'no workspace registered')
    const entry = (await outboxNow(host))[0]
    assert.equal(entry.kind, 'start')
    assert.equal(entry.targetSessionId, json.sessionId)
    assert.equal(entry.folder, folder)
    assert.equal(entry.status, 'delivered')
  })

  it('OUT-06 start_session with a workspace id starts the session in that workspace', T, async () => {
    const ws = await host.call('createWorkspace', { dir: path.join(home, 'work', 'ws-start') })
    const { json } = await start({ folder: ws.id, message: tok('out06') })
    assert.equal(json?.ok, true, JSON.stringify(json))
    const w = (await host.call('workspaces')).list.find((x) => x.id === ws.id)
    assert.ok(w.sessionIds.includes(json.sessionId), 'the session belongs to the workspace')
    assert.equal(fs.realpathSync((await host.call('header', { sessionId: json.sessionId })).cwd), fs.realpathSync(ws.path))
  })

  it('OUT-06b a workspace whose folder was deleted is refused no-folder and the folder is not created', T, async () => {
    const dir = path.join(home, 'work', 'ws-deleted')
    const ws = await host.call('createWorkspace', { dir })
    fs.rmdirSync(dir)
    const sessions = (await host.call('allSessions')).length
    const before = await outboxNow(host)
    const { json } = await start({ folder: ws.id, message: tok('out06b') })
    assert.deepEqual(json, { ok: false, code: P5_CODE.noFolder })
    assert.equal(fs.existsSync(dir), false, 'the folder is not created')
    assert.equal((await host.call('allSessions')).length, sessions)
    assert.deepEqual(await outboxNow(host), before)
  })

  describe('OUT-07 start_session refusals', () => {
    const missing = () => path.join(home, 'work', 'never-created')
    const file = () => path.join(home, 'fbtest.overlay.yml')
    const rows = [
      ['a missing folder', () => ({ message: 'x' }), [P5_CODE.noFolder, 'tool-error']],
      ['an empty folder', () => ({ folder: '', message: 'x' }), [P5_CODE.noFolder]],
      ['a path that does not exist', () => ({ folder: missing(), message: 'x' }), [P5_CODE.noFolder]],
      ['a path that is a file', () => ({ folder: file(), message: 'x' }), [P5_CODE.noFolder]],
      ['a relative path', () => ({ folder: 'work/start-here', message: 'x' }), [P5_CODE.notAbsolute]],
      ['an unknown non-path value', () => ({ folder: 'fbtest-no-such-workspace', message: 'x' }), [P5_CODE.notAbsolute, P5_CODE.noFolder]],
      ['an empty message', () => ({ folder: home, message: '' }), [P5_CODE.empty]],
      ['a whitespace message', () => ({ folder: home, message: '   ' }), [P5_CODE.empty]],
      ['a too-large message', () => ({ folder: home, message: 'a'.repeat(LIMITS.maxMessageBytes.default + 1) }), [P5_CODE.tooLarge]],
    ]
    for (const [label, args, codes] of rows) {
      it(label + ' → ' + codes.join(' or '), T, async (t) => {
        const sessions = (await host.call('allSessions')).length
        const before = await outboxNow(host)
        const { json, result } = await start(args())
        const code = result.isError ? 'tool-error' : json?.code
        if (result.isError) t.diagnostic('answered with a tool error: ' + result.text.slice(0, 200))
        assert.ok(codes.includes(code), 'got ' + result.text.slice(0, 300))
        if (!result.isError) assert.equal(json.ok, false)
        assert.equal((await host.call('allSessions')).length, sessions, 'no session created')
        assert.deepEqual(await outboxNow(host), before, 'not recorded')
        assert.equal(fs.existsSync(missing()), false, 'the folder is never created')
      })
    }
  })

  it('OUT-08 outbox entries have the documented shape, newest first, without message text', T, async () => {
    const entries = await outboxNow(host)
    assert.ok(entries.length >= 4)
    for (const e of entries) {
      const keys = Object.keys(e)
      for (const k of OUTBOX_KEYS) assert.ok(keys.includes(k), 'key ' + k)
      for (const k of keys) assert.ok(OUTBOX_KEYS.includes(k) || OUTBOX_OPTIONAL.includes(k), 'unexpected key ' + k)
      assert.ok(['message', 'start'].includes(e.kind))
      assert.ok(['delivered', 'failed', 'unconfirmed'].includes(e.status), e.status)
      assert.ok(!Number.isNaN(Date.parse(e.at)))
      if (e.kind === 'start') assert.equal(typeof e.folder, 'string')
    }
    const times = entries.map((e) => Date.parse(e.at))
    for (let i = 1; i < times.length; i++) assert.ok(times[i - 1] >= times[i], 'newest first')
  })
})

describe('P5 hourly caps and outbox bounds', { skip: NEEDS_INSTANCE_STUB }, () => {
  let host
  let home
  let fb
  let target
  const setLimit = async (patch) => { const r = await host.call('settingsUpdate', { patch }); assert.equal(r.ok, true, JSON.stringify(r.error)) }
  const send = (message) => fishballCall(host, fb, 'message_session', { session_id: target, message })
  /** Several message_session calls in one Fishball response; returns the parsed answers. */
  async function sendMany(n) {
    await settledIdle(host, fb)
    const calls = Array.from({ length: n }, (_, i) => ({ tool: 'message_session', args: { session_id: target, message: tok('many' + i) } }))
    const r = await turn(host, fb, [calls, [{ text: 'sent' }]])
    return r.results.map(jsonOf)
  }

  before(async () => {
    home = newHome('msg-caps')
    const booted = await bootLive(home)
    host = booted.host
    fb = booted.state?.sessionId
    target = (await host.call('ordinary', { preset: PRESET.bare, folder: 'cap-target' })).sessionId
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('CAP-01 messagesPerHour 2: the third send in the hour is refused and not recorded', T, async () => {
    await setLimit({ messagesPerHour: 2 })
    assert.equal((await send(tok('cap1a'))).json?.ok, true)
    assert.equal((await send(tok('cap1b'))).json?.ok, true, 'at the cap minus one')
    const before = await outboxNow(host)
    const third = tok('cap1c')
    assert.deepEqual((await send(third)).json, { ok: false, code: P5_CODE.hourlyCap })
    assert.deepEqual(await outboxNow(host), before)
    assert.equal((await received(host, target, third)).length, 0)
  })

  it('CAP-02 sessionsPerHour 1: the second start in the hour is refused and creates nothing', T, async () => {
    await setLimit({ sessionsPerHour: 1 })
    const folder = path.join(home, 'work', 'cap-start')
    fs.mkdirSync(folder, { recursive: true })
    assert.equal((await fishballCall(host, fb, 'start_session', { folder, title: TITLE.plain, message: tok('cap2a') })).json?.ok, true)
    const sessions = (await host.call('allSessions')).length
    assert.deepEqual((await fishballCall(host, fb, 'start_session', { folder, title: TITLE.plain, message: tok('cap2b') })).json, { ok: false, code: P5_CODE.hourlyCap })
    assert.equal((await host.call('allSessions')).length, sessions)
  })

  it('CAP-03 a cap of 0 means no cap', T, async () => {
    await setLimit({ messagesPerHour: 0, sessionsPerHour: 0 })
    assert.equal((await send(tok('cap3a'))).json?.ok, true)
    assert.equal((await send(tok('cap3b'))).json?.ok, true)
    assert.equal((await fishballCall(host, fb, 'start_session', { folder: path.join(home, 'work', 'cap-start'), title: TITLE.plain, message: tok('cap3c') })).json?.ok, true)
  })

  it('CAP-04 the hourly cap keeps counting when auditEntriesKept is lower than the cap', T, async () => {
    // 4 messages were delivered this hour (CAP-01 2, CAP-03 2). Cap 5: one more is allowed, then refused.
    await setLimit({ auditEntriesKept: 1, messagesPerHour: 5 })
    assert.equal((await send(tok('cap4a'))).json?.ok, true, 'the fifth in the hour')
    assert.ok((await outboxNow(host)).length <= 1, 'only one entry kept')
    assert.deepEqual((await send(tok('cap4b'))).json, { ok: false, code: P5_CODE.hourlyCap })
    await setLimit({ auditEntriesKept: LIMITS.auditEntriesKept.default, messagesPerHour: 0 })
  })

  it('CAP-05 the state lists at most 20 outbox entries, newest first', T, async () => {
    const answers = await sendMany(STATE_LIST_MAX + 1)
    assert.ok(answers.every((a) => a?.ok === true), JSON.stringify(answers.find((a) => a?.ok !== true)))
    const entries = await outboxNow(host)
    assert.equal(entries.length, STATE_LIST_MAX)
    const times = entries.map((e) => Date.parse(e.at))
    for (let i = 1; i < times.length; i++) assert.ok(times[i - 1] >= times[i])
  })

  it('CAP-06 auditEntriesKept 2 keeps at most 2 entries, including the newest', T, async () => {
    await setLimit({ auditEntriesKept: 2 })
    const { json } = await send(tok('cap6'))
    assert.equal(json?.ok, true)
    const entries = await outboxNow(host)
    assert.ok(entries.length <= 2, 'entries ' + entries.length)
    const newest = entries[0]
    assert.equal(newest.targetSessionId, target)
    assert.ok(Date.now() - Date.parse(newest.at) < 30000, 'the newest entry is the last send')
    await setLimit({ auditEntriesKept: LIMITS.auditEntriesKept.default })
  })
})
