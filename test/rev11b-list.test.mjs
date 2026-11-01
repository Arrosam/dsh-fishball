/**
 * Revision 11 rev11b: the managed agent's three tools, list_user_messages, and its two config fields
 * (DESIGN §14 row rev11b, §7a.2, §5e, §16 "Revision 11's new limits"; requirements item 6).
 * Host boots with FBTEST_APPROVER_AFTER=1 (the scripted answerer stands in for a session's stock prompt
 * after the broker; the root registers the asking tool fbtest_ask). One host; cases run in order and each
 * builds its own sessions. Expected values come from the requirements (CASES.md "Revision 11 rev11b
 * cases"), never the implementation.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | LUM-01  | EP (managed session) | its next model request lists message_fishball, ask_fishball and list_user_messages |
 * | LUM-02 ×2 | EP (yours: ask_fishball / list_user_messages) | neither in its request; calling either is DSH's UNKNOWN_TOOL error; no body runs (no permission notice, no Fishball step) |
 * | LUM-03  | ST (managed –Take back→ yours) | the next request has none of the three tools |
 * | LUM-04  | EP (Fishball's own session) | its request has neither ask_fishball nor list_user_messages |
 * | LUM-05  | EP (sources: user, user-rpc form, relay, fishball-notice, runtime-context, another session's) | only the user-typed messages of that session: {ok:true, messages:[{id, at, excerpt}]} with exactly those keys, DSH message ids, ISO times, newest first |
 * | LUM-06 ×2 | BVA (userMessagesListed 20: 20 / 21 messages) | 20 → all 20; 21 → 20, the newest (the oldest left out) |
 * | LUM-07  | BVA (userMessagesListed 1) | only the newest; applied without a restart (same Fishball agent, live) |
 * | LUM-08 ×2 | BVA (userMessageExcerptChars 1000: 1000 / 1001 chars of 2-byte text) | 1000 → the whole text; 1001 → at most 1000 characters, a prefix (an ellipsis allowed) |
 * | LUM-09  | BVA (userMessageExcerptChars 1) | every excerpt at most 1 character; applied without a restart |
 * | LUM-10  | EP (config) | both fields in the fishball row's form with defaults 20 and 1000, in the settings value and in state.limits |
 * | LUM-11 ×4 | BVA (min 1: 1 accepted, 0 refused, per field) | 1 accepted and shown in state.limits; 0 refused, the value stays |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  APPROVER_AFTER_ENV, ASK_FISHBALL, ASK_TOOL, INBOUND_TOOL, LIMITS_R11B, LIST_USER_MESSAGES, MANAGED_TOOLS, NOTICE, OUTCOME, PRESET, ROW_ID,
  STATUS, UNKNOWN_TOOL_TEXT, USER_RPC_SOURCE,
} from './support/constants.mjs'
import { HOOK, Schema, T, callTool, fishballCall, jsonOf, managedSession, requestMessages, setManaged, settledIdle, toolNames, turn } from './support/expect.mjs'
import { bootHost, newHome, sleep, until } from './support/host.mjs'

let seq = 0
const tok = (label) => 'LUM' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 7)
const DEFAULTS = Object.fromEntries(Object.entries(LIMITS_R11B).map(([k, v]) => [k, v.default]))
/** How long "nothing happened" is watched for. */
const QUIET_MS = 1000
/** 2-byte characters, so a cut by bytes and a cut by characters give different results. */
const chars = (n) => 'é'.repeat(n)
const LONG = { timeout: 120000 }

describe('Revision 11 rev11b: the managed tools and list_user_messages', () => {
  let host
  let fb
  const setLimit = async (patch) => { const r = await host.call('settingsUpdate', { patch }); assert.equal(r.ok, true, JSON.stringify(r.error)); return r }
  const nextRequest = async (sid) => (await turn(host, sid, [[{ text: 'next' }]])).requests.at(-1)
  /** The session's user-typed messages from DSH's log (kind 'user', with or without an rpc id), oldest first. */
  const typed = async (sid) => (await host.call('userMessageLog', { sessionId: sid })).filter((m) => m.kind === 'user')
  /** list_user_messages called in a turn of sid (that turn's message is the newest user message); returns the parsed answer. */
  async function list(sid, text = 'list my messages') {
    const r = await turn(host, sid, [[{ tool: LIST_USER_MESSAGES, args: {}, id: 'call_' + tok('list') }], [{ text: 'done' }]], text)
    assert.equal(r.results.length, 1, JSON.stringify(r.results))
    assert.equal(r.results[0].isError, false, r.results[0].text)
    return jsonOf(r.results[0])
  }
  /** A managed session with exactly n user-typed messages once the calling turn starts (setup turn + n-2 plain turns). */
  async function sessionWith(folder, n, textOf = (i) => 'plain ' + i) {
    const sid = await managedSession(host, fb, folder)
    for (let i = 2; i < n; i++) await turn(host, sid, [[{ text: 'ok' }]], textOf(i))
    return sid
  }

  before(async () => {
    host = await bootHost(newHome('rev11b-list'), { env: APPROVER_AFTER_ENV })
    fb = (await host.waitStatus(STATUS.live))?.sessionId
    await settledIdle(host, fb)
    await host.call('setApprover', { outcome: OUTCOME.reject })
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  let managed
  it('LUM-01 a managed session\'s model request lists all three tools', T, async () => {
    managed = await managedSession(host, fb, 'lum01')
    const names = toolNames(await nextRequest(managed))
    for (const n of MANAGED_TOOLS) assert.ok(names.includes(n), n + ' in ' + names.join(', '))
  })

  for (const [tool, args] of [[ASK_FISHBALL, { tool: ASK_TOOL, arguments: { text: 'LUM02' }, quote: [], why: 'LUM02 why' }], [LIST_USER_MESSAGES, {}]]) {
    it('LUM-02 a session that is yours calling ' + tool + ' gets UNKNOWN_TOOL and no body runs', T, async () => {
      const sid = (await host.call('ordinary', { preset: PRESET.bare, folder: 'lum02-' + tool })).sessionId
      await turn(host, sid, [[{ text: 'hello' }]], 'first words')
      const names = toolNames(await nextRequest(sid))
      assert.equal(names.includes(tool), false, tool + ' listed for a session that is yours')
      await settledIdle(host, fb)
      const fbBefore = (await host.call('requests', { sessionId: fb })).length
      const noticesBefore = (await requestMessages(host, fb)).length
      const { result } = await callTool(host, sid, tool, args)
      assert.equal(result.isError, true, result.text)
      assert.match(result.text, UNKNOWN_TOOL_TEXT)
      await sleep(QUIET_MS)
      assert.equal((await requestMessages(host, fb)).length, noticesBefore, 'no permission notice')
      assert.equal((await host.call('requests', { sessionId: fb })).length, fbBefore, 'zero Fishball steps')
    })
  }

  it('LUM-03 after Take back the session has none of the three tools', T, async () => {
    const sid = await managedSession(host, fb, 'lum03')
    const r = await setManaged(host, sid, false)
    assert.equal(r.status, 200, r.text)
    await settledIdle(host, fb)
    const names = toolNames(await nextRequest(sid))
    for (const n of MANAGED_TOOLS) assert.equal(names.includes(n), false, n + ' still listed')
  })

  it('LUM-04 Fishball\'s own session has neither ask_fishball nor list_user_messages', T, async () => {
    await settledIdle(host, fb)
    const names = toolNames((await turn(host, fb, [[{ text: 'ok' }]], 'anything?')).requests.at(-1))
    assert.equal(names.includes(ASK_FISHBALL), false)
    assert.equal(names.includes(LIST_USER_MESSAGES), false)
    assert.equal(names.includes(INBOUND_TOOL), false)
  })

  it('LUM-05 only the messages you typed in that session, with DSH ids and times, newest first', T, async () => {
    const sid = await managedSession(host, fb, 'lum05')
    const other = await managedSession(host, fb, 'lum05-other')
    // A relay from Fishball (message_session) lands in the session as a message the user did not type.
    const relayText = tok('relay')
    const sent = await fishballCall(host, fb, 'message_session', { session_id: sid, message: relayText })
    assert.equal(sent.json?.ok, true, 'precondition: relay sent ' + JSON.stringify(sent.json))
    await until(async () => (await host.call('userMessageLog', { sessionId: sid })).some((m) => m.text.includes(relayText)), 8000, 100)
    await settledIdle(host, sid)
    // A Fishball notice in that session, and a message from the web prompt (DSH's user-rpc source: kind user with an rpc id).
    const noticeText = tok('notice')
    await host.call('driveStart', { sessionId: sid, text: noticeText, source: { ...NOTICE, summary: 'fbtest notice' } })
    await host.call('waitIdle', { sessionId: sid })
    await settledIdle(host, sid)
    const rpcText = tok('rpc')
    await host.call('driveStart', { sessionId: sid, text: rpcText, source: USER_RPC_SOURCE })
    await host.call('waitIdle', { sessionId: sid })
    await settledIdle(host, sid)
    const listText = tok('list')
    const answer = await list(sid, listText)
    const log = await host.call('userMessageLog', { sessionId: sid })
    const expected = log.filter((m) => m.kind === 'user').reverse()
    assert.ok(expected.some((m) => m.rpcId === USER_RPC_SOURCE.rpcId), 'precondition: the user-rpc message is in the log')
    assert.equal(answer?.ok, true, JSON.stringify(answer))
    assert.deepEqual(answer.messages.map((m) => m.id), expected.map((m) => m.id), 'exactly the user-typed messages, newest first')
    assert.deepEqual(answer.messages.map((m) => m.excerpt), expected.map((m) => m.text), 'short texts are whole')
    assert.equal(answer.messages[0].excerpt, listText, 'the calling turn\'s own message is the newest')
    for (const m of answer.messages) {
      assert.deepEqual(Object.keys(m).sort(), ['at', 'excerpt', 'id'])
      assert.match(m.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/, 'ISO time: ' + m.at)
    }
    const times = answer.messages.map((m) => Date.parse(m.at))
    assert.deepEqual(times, [...times].sort((a, b) => b - a), 'newest first by time')
    const excerpts = answer.messages.map((m) => m.excerpt).join('\n')
    for (const [label, text] of [['relay', relayText], ['notice', noticeText]]) assert.equal(excerpts.includes(text), false, 'the ' + label + ' is not listed')
    const nonTyped = log.filter((m) => m.kind !== 'user').map((m) => m.id)
    assert.equal(answer.messages.some((m) => nonTyped.includes(m.id)), false, 'no relay, notice or runtime-context message')
    const otherIds = (await host.call('userMessageLog', { sessionId: other })).map((m) => m.id)
    assert.equal(answer.messages.some((m) => otherIds.includes(m.id)), false, 'no message of another session')
  })

  for (const n of [DEFAULTS.userMessagesListed, DEFAULTS.userMessagesListed + 1]) {
    it('LUM-06 ' + n + ' messages typed: list_user_messages returns ' + Math.min(n, DEFAULTS.userMessagesListed) + ', the newest', LONG, async () => {
      const sid = await sessionWith('lum06-' + n, n)
      const answer = await list(sid, 'calling turn ' + n)
      const log = await typed(sid)
      assert.equal(log.length, n, 'precondition: exactly ' + n + ' messages typed')
      const want = log.slice().reverse().slice(0, DEFAULTS.userMessagesListed).map((m) => m.id)
      assert.deepEqual(answer.messages.map((m) => m.id), want)
      if (n > DEFAULTS.userMessagesListed) assert.equal(answer.messages.some((m) => m.id === log[0].id), false, 'the oldest is left out')
    })
  }

  it('LUM-07 userMessagesListed 1: only the newest, applied without a restart', T, async () => {
    const tag = (await host.call('inspect', { sessionId: fb })).agentTag
    await setLimit({ userMessagesListed: 1 })
    try {
      assert.equal((await host.state()).limits?.userMessagesListed, 1, 'state.limits shows 1')
      const text = tok('07')
      const answer = await list(managed, text)
      assert.equal(answer.messages.length, 1)
      assert.equal(answer.messages[0].excerpt, text)
      const after = await host.call('inspect', { sessionId: fb })
      assert.equal(after.agentTag, tag, 'Fishball\'s agent was not replaced')
      assert.equal((await host.state()).status, STATUS.live)
    } finally { await setLimit({ userMessagesListed: DEFAULTS.userMessagesListed }) }
  })

  let excerptSession
  const long = { at: chars(DEFAULTS.userMessageExcerptChars), over: chars(DEFAULTS.userMessageExcerptChars + 1) }
  it('LUM-08 a 1000-character message is listed whole, a 1001-character one is cut to at most 1000', T, async () => {
    excerptSession = await managedSession(host, fb, 'lum08')
    await turn(host, excerptSession, [[{ text: 'ok' }]], long.at)
    await turn(host, excerptSession, [[{ text: 'ok' }]], long.over)
    const answer = await list(excerptSession)
    const byText = Object.fromEntries((await typed(excerptSession)).map((m) => [m.text, m.id]))
    const excerptOf = (text) => answer.messages.find((m) => m.id === byText[text])?.excerpt
    assert.equal(excerptOf(long.at), long.at, 'exactly at the limit: whole')
    const cut = excerptOf(long.over)
    assert.ok(typeof cut === 'string', 'the 1001-character message is listed')
    assert.ok([...cut].length <= DEFAULTS.userMessageExcerptChars, 'at most 1000 characters: ' + [...cut].length)
    assert.notEqual(cut, long.over)
    assert.ok(long.over.startsWith(cut.replace(/…$/, '')), 'a prefix of the message')
  })

  it('LUM-09 userMessageExcerptChars 1: every excerpt at most one character, applied without a restart', T, async () => {
    const tag = (await host.call('inspect', { sessionId: fb })).agentTag
    await setLimit({ userMessageExcerptChars: 1 })
    try {
      assert.equal((await host.state()).limits?.userMessageExcerptChars, 1)
      const answer = await list(excerptSession, 'xy')
      assert.ok(answer.messages.length >= 4)
      for (const m of answer.messages) assert.ok([...m.excerpt].length <= 1, 'excerpt ' + JSON.stringify(m.excerpt))
      assert.equal((await host.call('inspect', { sessionId: fb })).agentTag, tag, 'Fishball\'s agent was not replaced')
    } finally { await setLimit({ userMessageExcerptChars: DEFAULTS.userMessageExcerptChars }) }
  })

  it('LUM-10 both fields are in the limits form with their defaults, in the settings value and in state.limits', T, async () => {
    let json
    await until(async () => { json = await host.call('settingsSchema', { ns: ROW_ID }); return json }, 5000, 100)
    const resolved = new Schema(json)({})
    const value = (await host.call('settingsDescribe'))?.value ?? {}
    const limits = (await host.state()).limits ?? {}
    for (const [k, d] of Object.entries(DEFAULTS)) {
      assert.equal(resolved[k], d, 'form default of ' + k)
      assert.equal(value[k], d, 'settings value of ' + k)
      assert.equal(limits[k], d, 'state.limits.' + k)
    }
  })

  for (const field of Object.keys(LIMITS_R11B)) {
    it('LUM-11 ' + field + ': the minimum 1 is accepted', T, async () => {
      await setLimit({ [field]: LIMITS_R11B[field].min })
      assert.ok(await until(async () => (await host.state()).limits?.[field] === LIMITS_R11B[field].min, 5000, 50))
      await setLimit({ [field]: DEFAULTS[field] })
    })
    it('LUM-11 ' + field + ': 0 is refused and the value stays', T, async () => {
      const r = await host.call('settingsUpdate', { patch: { [field]: LIMITS_R11B[field].min - 1 } })
      assert.equal(r.ok, false, 'refused')
      assert.equal((await host.call('settingsDescribe'))?.value?.[field], DEFAULTS[field])
    })
  }
})
