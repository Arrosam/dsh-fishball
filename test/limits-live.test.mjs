/**
 * Revision 11 rev11-limits: the shown/excerpt fields take effect live, read at their next use
 * (DESIGN §14 rev11-limits "Done when"; §16 "Today's constants"). One host with the scripted approver
 * after Fishball's broker (APPROVER_AFTER_ENV, so permission requests reach Fishball); cases run in
 * order. Each case goes default -> changed -> back to default (state transitions, no restart).
 *
 * | id     | technique | expected |
 * |--------|-----------|----------|
 * | L50    | ST (readSessionMessages 12 -> 3 -> 1 -> 12) | a 16-message session: read_session returns 12, then 3 (newest answer kept), then 1, then 12 |
 * | L51    | ST (readSessionBytes 12288 -> 2000 -> 12288) | about 9 KB of answers: more than 2000 text bytes, then at most 2000, then more than 2000 again |
 * | L52    | ST (watchesShown 50 -> 2 -> 50) | state.watches and list_watches: all watches, then at most 2 with the active one among them, then all again |
 * | L53    | ST (intakeRowsShown 20 -> 2 -> 20) | state.intake.items: >= 3, then exactly 2, then the same count as before |
 * | L54    | ST (outboxShown 20 -> 2 -> 20) | state.outbox.entries: >= 3, then exactly 2, then the same count as before |
 * | L55    | ST (forwardExcerptBytes 3072 -> 100 -> 3072) | a forwarded 500-byte answer: cut to <= 100 bytes (a prefix), then whole again |
 * | L56    | ST (requestUserMessageBytes 2048 -> 100 -> 2048) | latest_user_message of a 300-byte message: cut to <= 100 bytes (a prefix), then whole |
 * | L57    | ST (rationaleChars 500 -> 10 -> 500) | the audit's rationale of a 60-character reason: at most 10 characters (a prefix), then whole |
 * | L58    | ST (approvalsShown 20 -> 5 -> 1 -> 20) | with >= 6 audit entries: state.approvals.recent shows 5, then 1, then all of them (<= 20) |
 * | L59    | ST (no restart) | Fishball is the same agent, never disposed, created once, status live |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { API, APPROVER_AFTER_ENV, ASK_TOOL, ELLIPSIS, LIMITS_R11, OUTCOME, PRESET, STATUS, WATCH_STATUS } from './support/constants.mjs'
import {
  HOOK, T, makeManaged, approvalsNow, askSettled, bytes, fishballCall, fishballMessages, intakeNow, messageFishball, outboxNow, settledIdle, startAsk, turn, untilSeen,
  untrustedBlock, waitRequest, watchesNow,
} from './support/expect.mjs'
import { bootHost, newHome, until } from './support/host.mjs'

let seq = 0
const tok = (label) => 'LIM' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 7)
const D = Object.fromEntries(Object.entries(LIMITS_R11).map(([k, v]) => [k, v.default]))
const LONG = { timeout: 120000 }
/** A cut value without its trailing ellipsis, for the prefix check. */
const bare = (s) => (s.endsWith(ELLIPSIS) ? s.slice(0, -ELLIPSIS.length) : s)

describe('rev11-limits: shown and excerpt fields apply live', () => {
  let host
  let fb
  let agentTag

  const setLimit = async (patch) => { const r = await host.call('settingsUpdate', { patch }); assert.equal(r.ok, true, 'update refused: ' + JSON.stringify(r.error)) }
  const ordinary = async (folder) => (await host.call('ordinary', { preset: PRESET.bare, folder })).sessionId
  const warm = async (folder) => { const sid = await ordinary(folder); await turn(host, sid, [[{ text: 'warm-up' }]], 'first words'); return sid }
  async function toolWatch(sid) {
    const { json } = await fishballCall(host, fb, 'watch_session', { session_id: sid })
    assert.equal(json?.ok, true, JSON.stringify(json))
    return json.watch
  }
  const unwatch = async (id) => assert.equal((await fishballCall(host, fb, 'unwatch_session', { watch_id: id })).json?.ok, true)
  async function readMessages(sid) {
    const { json } = await fishballCall(host, fb, 'read_session', { session_id: sid })
    assert.equal(json?.ok, true, JSON.stringify(json)?.slice(0, 300))
    const msgs = untrustedBlock(json.session)?.fields?.messages
    assert.ok(Array.isArray(msgs), 'messages is a JSON array')
    return msgs
  }
  const textBytes = (msgs) => msgs.reduce((n, m) => n + bytes(m.text), 0)

  before(async () => {
    host = await bootHost(newHome('limits-live'), { env: APPROVER_AFTER_ENV })
    fb = (await host.waitStatus(STATUS.live))?.sessionId
    agentTag = fb ? (await host.call('inspect', { sessionId: fb })).agentTag : null
    await setLimit({ wakeupsPerHour: 0 })
    await settledIdle(host, fb)
    await host.call('setApprover', { outcome: OUTCOME.reject })
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  const watchIds = []

  it('L50 readSessionMessages: 12 by default, then 3, then 1, then 12 again', LONG, async () => {
    const sid = await ordinary('l50')
    let last
    for (let i = 0; i < 8; i++) { last = tok('l50a' + i); await turn(host, sid, [[{ text: last }]], 'user turn ' + i) }
    watchIds.push((await toolWatch(sid)).id)
    assert.equal((await readMessages(sid)).length, D.readSessionMessages, 'default 12 of 16')
    await setLimit({ readSessionMessages: 3 })
    const three = await readMessages(sid)
    assert.equal(three.length, 3)
    assert.ok(three.some((m) => m.role === 'assistant' && m.text.includes(last)), 'the newest answer is kept')
    await setLimit({ readSessionMessages: 1 })
    assert.equal((await readMessages(sid)).length, 1)
    await setLimit({ readSessionMessages: D.readSessionMessages })
    assert.equal((await readMessages(sid)).length, D.readSessionMessages)
  })

  it('L51 readSessionBytes: more than 2000 text bytes by default, at most 2000 at 2000, more again after', LONG, async (t) => {
    const sid = await ordinary('l51')
    for (let i = 0; i < 6; i++) await turn(host, sid, [[{ text: tok('l51a' + i) + 'z'.repeat(1500) }]], 'user turn ' + i)
    watchIds.push((await toolWatch(sid)).id)
    const base = textBytes(await readMessages(sid))
    t.diagnostic('default text bytes ' + base)
    assert.ok(base > 2000 && base <= D.readSessionBytes, 'default: ' + base)
    await setLimit({ readSessionBytes: 2000 })
    const cut = await readMessages(sid)
    assert.ok(textBytes(cut) <= 2000, 'at most 2000 bytes: ' + textBytes(cut))
    await setLimit({ readSessionBytes: D.readSessionBytes })
    assert.equal(textBytes(await readMessages(sid)), base, 'back to the default excerpt')
  })

  it('L52 watchesShown: state and list_watches show at most 2 at 2, the active one among them', LONG, async () => {
    for (const id of watchIds) await unwatch(id)
    for (let i = 0; i < 3; i++) await unwatch((await toolWatch(await warm('l52c' + i))).id)
    const active = await toolWatch(await warm('l52a'))
    const all = (await watchesNow(host)).watches.length
    assert.ok(all >= 6, 'precondition: 6 watches shown by default, got ' + all)
    const listed = async () => { const { json } = await fishballCall(host, fb, 'list_watches', {}); assert.equal(json?.ok, true); return json.watches }
    assert.equal((await listed()).length, all, 'list_watches shows the same at the default')
    await setLimit({ watchesShown: 2 })
    const state = (await watchesNow(host)).watches
    assert.ok(state.length >= 1 && state.length <= 2, 'state shows ' + state.length)
    assert.ok(state.some((w) => w.id === active.id && w.status === WATCH_STATUS.active), 'the active watch is shown')
    const tool = await listed()
    assert.ok(tool.length >= 1 && tool.length <= 2, 'list_watches shows ' + tool.length)
    assert.ok(tool.some((w) => w.id === active.id), 'list_watches shows the active watch')
    await setLimit({ watchesShown: D.watchesShown })
    assert.equal((await watchesNow(host)).watches.length, all)
    assert.equal((await listed()).length, all)
    await unwatch(active.id)
  })

  it('L53 intakeRowsShown: the state shows 2 rows at 2, all again after', LONG, async () => {
    for (let i = 0; i < 3; i++) {
      const sid = await ordinary('l53-' + i)
      await makeManaged(host, fb, sid) // rev11a: only a managed session has message_fishball
      await messageFishball(host, sid, { message: tok('l53') })
      await settledIdle(host, fb)
    }
    const count = (await intakeNow(host)).items.length
    assert.ok(count >= 3, 'precondition: at least 3 rows, got ' + count)
    await setLimit({ intakeRowsShown: 2 })
    assert.equal((await intakeNow(host)).items.length, 2)
    await setLimit({ intakeRowsShown: D.intakeRowsShown })
    assert.equal((await intakeNow(host)).items.length, count)
  })

  it('L54 outboxShown: the state shows 2 entries at 2, all again after', LONG, async () => {
    for (let i = 0; i < 3; i++) {
      const sid = await warm('l54-' + i)
      assert.equal((await fishballCall(host, fb, 'message_session', { session_id: sid, message: tok('l54') })).json?.ok, true)
      await settledIdle(host, sid)
    }
    const count = (await outboxNow(host)).length
    assert.ok(count >= 3, 'precondition: at least 3 entries, got ' + count)
    await setLimit({ outboxShown: 2 })
    assert.equal((await outboxNow(host)).length, 2)
    await setLimit({ outboxShown: D.outboxShown })
    assert.equal((await outboxNow(host)).length, count)
  })

  it('L55 forwardExcerptBytes: a forward carries at most 100 bytes of the answer at 100, the whole answer after', LONG, async () => {
    const target = await ordinary('l55')
    const forward = async () => {
      const head = tok('l55h')
      const answer = head + 'a'.repeat(500 - head.length)
      await turn(host, target, [[{ text: answer }]], 'make an answer')
      await settledIdle(host, fb)
      assert.equal((await host.post(API.send, { sessionId: target, note: '' })).status, 200)
      assert.ok(await untilSeen(host, fb, head), 'the forward reached Fishball')
      const got = await fishballMessages(host, fb, head)
      assert.equal(got.length, 1)
      return { answer, shown: untrustedBlock(got[0].text)?.fields?.last_answer }
    }
    await setLimit({ forwardExcerptBytes: 100 })
    const cut = await forward()
    assert.equal(typeof cut.shown, 'string')
    assert.ok(bytes(cut.shown) <= 100, 'at most 100 bytes: ' + bytes(cut.shown))
    assert.ok(cut.answer.startsWith(bare(cut.shown)), 'a prefix of the answer')
    await setLimit({ forwardExcerptBytes: D.forwardExcerptBytes })
    const whole = await forward()
    assert.equal(whole.shown, whole.answer)
  })

  describe('permission requests', () => {
    let x
    before(async () => { x = await warm('l56-x'); await makeManaged(host, fb, x) }, HOOK) // rev11a: only a managed session's requests reach Fishball
    /** One request from x that Fishball allows (planned); returns the request message. */
    async function allowedAsk(reason, turnText) {
      const text = tok('ask')
      await host.call('planApproval', { sessionId: fb, needle: text, args: { decision: 'allow', risk: 'low', reason } })
      await settledIdle(host, x)
      await startAsk(host, x, ASK_TOOL, { text }, turnText)
      const req = await waitRequest(host, fb, text)
      assert.ok(req, 'a permission request reached Fishball')
      assert.equal((await askSettled(host, text)).outcome, OUTCOME.allow)
      await settledIdle(host, x)
      await settledIdle(host, fb)
      return req
    }

    it('L56 requestUserMessageBytes: the request shows at most 100 bytes of your message at 100, all of it after', LONG, async () => {
      const message = 'q'.repeat(300)
      await setLimit({ requestUserMessageBytes: 100 })
      const cut = (await allowedAsk('fine', message)).block.fields.latest_user_message
      assert.equal(typeof cut, 'string')
      assert.ok(bytes(cut) <= 100, 'at most 100 bytes: ' + bytes(cut))
      assert.ok(message.startsWith(bare(cut)), 'a prefix')
      await setLimit({ requestUserMessageBytes: D.requestUserMessageBytes })
      assert.equal((await allowedAsk('fine', message)).block.fields.latest_user_message, message)
    })

    it('L57 rationaleChars: the audit keeps at most 10 characters of the rationale at 10, all of it after', LONG, async () => {
      const reason = 'R' + 'r'.repeat(58) + 'Z'
      await setLimit({ rationaleChars: 10 })
      await allowedAsk(reason)
      const kept = (await approvalsNow(host)).recent[0].rationale
      assert.equal(typeof kept, 'string')
      assert.ok([...kept].length <= 10, 'at most 10 characters: ' + kept)
      assert.ok(reason.startsWith(bare(kept)), 'a prefix: ' + kept)
      await setLimit({ rationaleChars: D.rationaleChars })
      await allowedAsk(reason)
      assert.equal((await approvalsNow(host)).recent[0].rationale, reason)
    })

    it('L58 approvalsShown: 5 shows 5 audit entries, 1 shows 1, the default all of them again', LONG, async () => {
      while ((await approvalsNow(host)).recent.length < 6) await allowedAsk('more')
      const count = (await approvalsNow(host)).recent.length
      assert.ok(count >= 6 && count <= D.approvalsShown, 'precondition: ' + count)
      await setLimit({ approvalsShown: 5 })
      assert.equal((await approvalsNow(host)).recent.length, 5)
      await setLimit({ approvalsShown: 1 })
      assert.equal((await approvalsNow(host)).recent.length, 1)
      await setLimit({ approvalsShown: D.approvalsShown })
      assert.equal((await approvalsNow(host)).recent.length, count)
    })
  })

  it('L59 none of the changes restarted Fishball', T, async () => {
    const now = await host.call('inspect', { sessionId: fb })
    assert.equal(now.agentTag, agentTag, 'same agent object')
    const events = (await host.call('lifecycle')).filter((e) => e.id === fb)
    assert.equal(events.filter((e) => e.type === 'disposed').length, 0, 'not disposed')
    assert.equal(events.filter((e) => e.type === 'created').length, 1, 'created once')
    assert.equal((await host.state()).status, STATUS.live)
    assert.ok(await until(async () => (await host.call('agentStatus', { sessionId: fb })) === 'idle', 5000, 100))
  })
})
