/**
 * Revision 11 rev11b: the managed agent's three tools, list_user_messages, and its two config fields, on the
 * H-STUB harness (DESIGN §7a.2, §5e, §16 "Revision 11's new limits"; conn-OQ-20 (the connector form keeps
 * both fields); slim-native-design §12). The in-process Fishball is gone, so "nothing reached Fishball" is now
 * "the attached instance received nothing", a relay from Fishball is the instance's `session.message`
 * (contract §4.1), and "applied without a restart" is "the connector stays live with the same attachment".
 * One host; cases run in order and each builds its own sessions. Expected values come from the requirements.
 *
 * Retired:
 * LUM-04: the in-process Fishball session and its own tools are deleted (slim-native-design §12); the instance has its own tool list
 *
 * | id      | technique | requirement | expected |
 * |---------|-----------|-------------|----------|
 * | LUM-01  | EP (managed session) | §7a.2, §5e | its next model request lists message_fishball, ask_fishball and list_user_messages |
 * | LUM-02 ×2 | EP (yours: ask_fishball / list_user_messages) | §7a.2 | neither in its request; calling either is DSH's UNKNOWN_TOOL error; no body runs (no frame reaches the instance) |
 * | LUM-03  | ST (managed –Take back→ yours) | §5e | the next request has none of the three tools |
 * | LUM-05  | EP (sources: user, user-rpc form, the instance's relay, fishball-notice, runtime-context, another session's) | §7a.2 | only the user-typed messages of that session: {ok:true, messages:[{id, at, excerpt}]} with exactly those keys, DSH message ids, ISO times, newest first |
 * | LUM-06 ×2 | BVA (userMessagesListed 20: 20 / 21 messages) | §16 | 20 → all 20; 21 → 20, the newest (the oldest left out) |
 * | LUM-07  | BVA (userMessagesListed 1) | §16 | only the newest; applied without a restart (connector live, the same attachment) |
 * | LUM-08 ×2 | BVA (userMessageExcerptChars 1000: 1000 / 1001 chars of 2-byte text) | §16 | 1000 → the whole text; 1001 → at most 1000 characters, a prefix (an ellipsis allowed) |
 * | LUM-09  | BVA (userMessageExcerptChars 1) | §16 | every excerpt at most 1 character; applied without a restart |
 * | LUM-10  | EP (config) | §16, conn-OQ-20 | both fields in the fishball-connector row's form with defaults 20 and 1000, in the settings value and in state.limits |
 * | LUM-11 ×4 | BVA (min 1: 1 accepted, 0 refused, per field) | §16 "Rules" | 1 accepted and shown in state.limits; 0 refused, the value stays |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ASK_FISHBALL, ASK_TOOL, LIMITS_R11B, LIST_USER_MESSAGES, MANAGED_TOOLS, NOTICE, PRESET, ROW_ID, STATUS, UNKNOWN_TOOL_TEXT, USER_RPC_SOURCE } from './support/constants.mjs'
import { HOOK, Schema, T, settledIdle, toolNames, turn } from './support/expect.mjs'
import { ASK_STUB, askHost, askTools, stopAsk, tokens } from './support/instance-stub-ask.mjs'
import { OPERATION, sessionCall, takeBack, userSession } from './support/instance-stub.mjs'
import { until } from './support/util.mjs'

const { tok, cid } = tokens('LUM')
const DEFAULTS = Object.fromEntries(Object.entries(LIMITS_R11B).map(([k, v]) => [k, v.default]))
/** 2-byte characters, so a cut by bytes and a cut by characters give different results. */
const chars = (n) => 'é'.repeat(n)
/** The keys of one listed message (§7a.2: "the message id, its time and a short excerpt"). */
const MESSAGE_KEYS = ['at', 'excerpt', 'id']
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/
/** An excerpt may end with an ellipsis when it is cut. */
const TRAILING_ELLIPSIS = /…$/

describe('Revision 11 rev11b: the managed tools and list_user_messages', () => {
  let ctx
  let t
  const host = () => ctx.host
  const nextRequest = async (sid) => (await turn(host(), sid, [[{ text: 'next' }]])).requests.at(-1)
  /** The session's user-typed messages from DSH's log (kind 'user', with or without an rpc id), oldest first. */
  const typed = async (sid) => (await host().call('userMessageLog', { sessionId: sid })).filter((m) => m.kind === 'user')
  /** list_user_messages called in a turn of sid (that turn's message is the newest user message); returns the parsed answer. */
  async function list(sid, text = 'list my messages') {
    const { json, result } = await sessionCall(host(), sid, LIST_USER_MESSAGES, {}, { text })
    assert.equal(result.isError, false, result.text)
    return json
  }
  /** A managed session with exactly n user-typed messages once the calling turn starts (setup turn + n-2 plain turns). */
  async function sessionWith(folder, n, textOf = (i) => 'plain ' + i) {
    const sid = await t.session(folder)
    for (let i = 2; i < n; i++) await turn(host(), sid, [[{ text: 'ok' }]], textOf(i))
    return sid
  }
  /** The connector is still live with the same instance attachment (a setting applied without a restart). */
  async function sameAttachment(attachCount) {
    const s = await host().state()
    assert.equal(s.status, STATUS.live)
    assert.equal(s.instance?.attached, true)
    assert.equal(s.instance?.attachCount, attachCount, 'the instance was not attached again')
  }

  before(async () => {
    ctx = await askHost('rev11b-list')
    t = askTools(ctx, { tok, cid })
  }, HOOK)
  after(() => stopAsk(ctx), HOOK)

  let managed
  it("LUM-01 a managed session's model request lists all three tools", T, async () => {
    managed = await t.session('lum01')
    const names = toolNames(await nextRequest(managed))
    for (const n of MANAGED_TOOLS) assert.ok(names.includes(n), n + ' in ' + names.join(', '))
  })

  for (const [tool, args] of [[ASK_FISHBALL, { tool: ASK_TOOL, arguments: { text: 'LUM02' }, quote: [], why: 'LUM02 why' }], [LIST_USER_MESSAGES, {}]]) {
    it('LUM-02 a session that is yours calling ' + tool + ' gets UNKNOWN_TOOL and no body runs', T, async () => {
      const sid = await userSession(host(), 'lum02-' + tool, PRESET.bare)
      const names = toolNames(await nextRequest(sid))
      assert.equal(names.includes(tool), false, tool + ' listed for a session that is yours')
      const framesBefore = await t.frameCount()
      const { result } = await sessionCall(host(), sid, tool, args)
      assert.equal(result.isError, true, result.text)
      assert.match(result.text, UNKNOWN_TOOL_TEXT)
      await t.quiet()
      assert.equal(await t.frameCount(), framesBefore, 'nothing reached the instance')
    })
  }

  it('LUM-03 after Take back the session has none of the three tools', T, async () => {
    const sid = await t.session('lum03')
    const r = await takeBack(host(), sid)
    assert.equal(r.status, 200, r.text)
    const names = toolNames(await nextRequest(sid))
    for (const n of MANAGED_TOOLS) assert.equal(names.includes(n), false, n + ' still listed')
  })

  it('LUM-05 only the messages you typed in that session, with DSH ids and times, newest first', T, async () => {
    const sid = await t.session('lum05')
    const other = await t.session('lum05-other')
    // A relay from the instance (session.message) lands in the session as a message the user did not type.
    const relayText = tok('relay')
    const sent = await ctx.stub.op(OPERATION.sessionMessage, { sessionId: sid, message: relayText, attachments: [] }, sid)
    assert.ok(sent.payload?.status, 'precondition: relay sent ' + JSON.stringify(sent))
    await until(async () => (await host().call('userMessageLog', { sessionId: sid })).some((m) => m.text.includes(relayText)), ASK_STUB.offerWaitMs, 100)
    await settledIdle(host(), sid)
    // A Fishball notice in that session, and a message from the web prompt (DSH's user-rpc source: kind user with an rpc id).
    const noticeText = tok('notice')
    await host().call('driveStart', { sessionId: sid, text: noticeText, source: { ...NOTICE, summary: 'fbtest notice' } })
    await t.waitIdle(sid)
    await settledIdle(host(), sid)
    const rpcText = tok('rpc')
    await host().call('driveStart', { sessionId: sid, text: rpcText, source: USER_RPC_SOURCE })
    await t.waitIdle(sid)
    await settledIdle(host(), sid)
    const listText = tok('list')
    const answer = await list(sid, listText)
    const log = await host().call('userMessageLog', { sessionId: sid })
    const expected = log.filter((m) => m.kind === 'user').reverse()
    assert.ok(expected.some((m) => m.rpcId === USER_RPC_SOURCE.rpcId), 'precondition: the user-rpc message is in the log')
    assert.equal(answer?.ok, true, JSON.stringify(answer))
    assert.deepEqual(answer.messages.map((m) => m.id), expected.map((m) => m.id), 'exactly the user-typed messages, newest first')
    assert.deepEqual(answer.messages.map((m) => m.excerpt), expected.map((m) => m.text), 'short texts are whole')
    assert.equal(answer.messages[0].excerpt, listText, "the calling turn's own message is the newest")
    for (const m of answer.messages) {
      assert.deepEqual(Object.keys(m).sort(), MESSAGE_KEYS)
      assert.match(m.at, ISO_TIME, 'ISO time: ' + m.at)
    }
    const times = answer.messages.map((m) => Date.parse(m.at))
    assert.deepEqual(times, [...times].sort((a, b) => b - a), 'newest first by time')
    const excerpts = answer.messages.map((m) => m.excerpt).join('\n')
    for (const [label, text] of [['relay', relayText], ['notice', noticeText]]) assert.equal(excerpts.includes(text), false, 'the ' + label + ' is not listed')
    const nonTyped = log.filter((m) => m.kind !== 'user').map((m) => m.id)
    assert.equal(answer.messages.some((m) => nonTyped.includes(m.id)), false, 'no relay, notice or runtime-context message')
    const otherIds = (await host().call('userMessageLog', { sessionId: other })).map((m) => m.id)
    assert.equal(answer.messages.some((m) => otherIds.includes(m.id)), false, 'no message of another session')
  })

  for (const n of [DEFAULTS.userMessagesListed, DEFAULTS.userMessagesListed + 1]) {
    it('LUM-06 ' + n + ' messages typed: list_user_messages returns ' + Math.min(n, DEFAULTS.userMessagesListed) + ', the newest', ASK_STUB.long, async () => {
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
    const attachCount = (await host().state()).instance.attachCount
    await t.setLimit({ userMessagesListed: LIMITS_R11B.userMessagesListed.min })
    try {
      assert.equal((await host().state()).limits?.userMessagesListed, LIMITS_R11B.userMessagesListed.min, 'state.limits shows 1')
      const text = tok('07')
      const answer = await list(managed, text)
      assert.equal(answer.messages.length, 1)
      assert.equal(answer.messages[0].excerpt, text)
      await sameAttachment(attachCount)
    } finally { await t.setLimit({ userMessagesListed: DEFAULTS.userMessagesListed }) }
  })

  let excerptSession
  const long = { at: chars(DEFAULTS.userMessageExcerptChars), over: chars(DEFAULTS.userMessageExcerptChars + 1) }
  it('LUM-08 a 1000-character message is listed whole, a 1001-character one is cut to at most 1000', T, async () => {
    excerptSession = await t.session('lum08')
    await turn(host(), excerptSession, [[{ text: 'ok' }]], long.at)
    await turn(host(), excerptSession, [[{ text: 'ok' }]], long.over)
    const answer = await list(excerptSession)
    const byText = Object.fromEntries((await typed(excerptSession)).map((m) => [m.text, m.id]))
    const excerptOf = (text) => answer.messages.find((m) => m.id === byText[text])?.excerpt
    assert.equal(excerptOf(long.at), long.at, 'exactly at the limit: whole')
    const cut = excerptOf(long.over)
    assert.ok(typeof cut === 'string', 'the 1001-character message is listed')
    assert.ok([...cut].length <= DEFAULTS.userMessageExcerptChars, 'at most 1000 characters: ' + [...cut].length)
    assert.notEqual(cut, long.over)
    assert.ok(long.over.startsWith(cut.replace(TRAILING_ELLIPSIS, '')), 'a prefix of the message')
  })

  it('LUM-09 userMessageExcerptChars 1: every excerpt at most one character, applied without a restart', T, async () => {
    const attachCount = (await host().state()).instance.attachCount
    const min = LIMITS_R11B.userMessageExcerptChars.min
    await t.setLimit({ userMessageExcerptChars: min })
    try {
      assert.equal((await host().state()).limits?.userMessageExcerptChars, min)
      const answer = await list(excerptSession, 'xy')
      assert.ok(answer.messages.length >= 4, 'first words, the two long ones and this turn: ' + answer.messages.length)
      for (const m of answer.messages) assert.ok([...m.excerpt].length <= min, 'excerpt ' + JSON.stringify(m.excerpt))
      await sameAttachment(attachCount)
    } finally { await t.setLimit({ userMessageExcerptChars: DEFAULTS.userMessageExcerptChars }) }
  })

  it('LUM-10 both fields are in the limits form with their defaults, in the settings value and in state.limits', T, async () => {
    let json
    await until(async () => { json = await host().call('settingsSchema', { ns: ROW_ID }); return json }, ASK_STUB.offerWaitMs, 100)
    const resolved = new Schema(json)({})
    const value = (await host().call('settingsDescribe'))?.value ?? {}
    const limits = (await host().state()).limits ?? {}
    for (const [k, d] of Object.entries(DEFAULTS)) {
      assert.equal(resolved[k], d, 'form default of ' + k)
      assert.equal(value[k], d, 'settings value of ' + k)
      assert.equal(limits[k], d, 'state.limits.' + k)
    }
  })

  for (const field of Object.keys(LIMITS_R11B)) {
    it('LUM-11 ' + field + ': the minimum 1 is accepted', T, async () => {
      await t.setLimit({ [field]: LIMITS_R11B[field].min })
      assert.ok(await until(async () => (await host().state()).limits?.[field] === LIMITS_R11B[field].min, ASK_STUB.offerWaitMs, 50))
      await t.setLimit({ [field]: DEFAULTS[field] })
    })
    it('LUM-11 ' + field + ': 0 is refused and the value stays', T, async () => {
      const r = await host().call('settingsUpdate', { patch: { [field]: LIMITS_R11B[field].min - 1 } })
      assert.equal(r.ok, false, 'refused')
      assert.equal((await host().call('settingsDescribe'))?.value?.[field], DEFAULTS[field])
    })
  }
})
