/**
 * Revision 11 rev11a: yours or managed (DESIGN §5b, §5e, §7a.1, §9, §10e; requirements items 1-5), with the
 * user's amendment: in rev11a the per-agent registration holds message_fishball only, and the ways in built
 * and tested are start_session, message_session, Hand over and Send to Fishball (answer_prompt is rev11e).
 * Host boots with FBTEST_APPROVER_AFTER=1: the scripted answerer stands in for a session's own stock prompt
 * AFTER Fishball's broker, and the root registers the asking tool fbtest_ask. The fake model records each
 * request's tools and system text. One host; the cases run in order and each uses its own sessions.
 * Expected values come from the requirements (CASES.md "Revision 11 rev11a cases"), never the implementation.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | MGD-01  | EP (first start, new install) | snapshot managed is [] |
 * | MGD-02 ×2 | EP (yours: bare / standard preset) | no request has message_fishball or any tool named *fishball*; no "Fishball" in system text, tool schemas or messages |
 * | MGD-03  | EP (yours, Fishball live, Permission requests on) | the request reaches its own stock prompt at once; no permission message, zero Fishball model steps, no new intake item |
 * | MGD-04  | ST (yours –Hand over→ managed) | 200 ok; entry {sessionId, since, by:'hand-over'}; exactly one note (fishball/managed/<id>) naming the folder and the user, read by Fishball; next request has message_fishball; next permission request reaches Fishball, not the stock prompt |
 * | MGD-05  | ST (yours –Send to Fishball→ managed) | 200; entry by 'send'; no managed note (only hand-over, take-back, release send one); next request has message_fishball; next permission request reaches Fishball |
 * | MGD-06  | ST (yours –message_session→ managed) | ok; entry by 'message'; no managed note; the turn that reads the message already has message_fishball; next permission request reaches Fishball |
 * | MGD-07  | ST (none –start_session→ managed) | ok; entry by 'start'; no managed note; every request of the new session has message_fishball; its permission request reaches Fishball; the order is create → rename (the title) → managed (`since`) → first message steered |
 * | MGD-08  | ST (managed –Take back→ yours) | 200; entry gone; one note naming the folder and the user; next request has no message_fishball and no "Fishball"; permission request to the stock prompt, zero Fishball steps |
 * | MGD-09  | ST (managed –release_session→ yours) | ok; entry gone; one note naming the folder; next request has no message_fishball; permission request to the stock prompt, zero Fishball steps |
 * | MGD-10  | DT (message_fishball × yours / managed) | yours: tool error UNKNOWN_TOOL, no body runs (no relay, no intake item); managed: {ok:true, note:'Delivered to Fishball.'}, one relay attributed to it, intake item session/<id> |
 * | MGD-11 ×5 | DT (route × Fishball's own / unknown session) | hand over or take back Fishball: 409 is-fishball; message_session(Fishball) is-fishball; unknown id (managed true / false): 409 unknown-session; Fishball never listed and never gets message_fishball |
 * | MGD-12 ×8 | EP (bad body) | invalid JSON, array, {}, missing managed, missing sessionId, managed 'true', sessionId 1, sessionId '' → 400 bad-body; nothing changes |
 * | MGD-13 ×3 | EP (watch route / watch_session / read_session) | none makes a session managed: no entry, no message_fishball |
 * | MGD-14  | EP (subagent of a managed session) | the parent's requests have message_fishball, the child's requests have none |
 * | MGD-15 ×2 | ST (Hand over / Take back while a turn is held at step 1) | step 1's request is as before; step 2 of the same turn has (hand over) / lacks (take back) message_fishball |
 * | MGD-16  | EP | the client bundle carries "Hand over to Fishball" and "Take back from Fishball" |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import {
  API, APPROVER_AFTER_ENV, ASK_REASON, ASK_TOOL, FISHBALL_WORD, FORWARD_HEADER, IDENTITY, INBOUND_TOOL, MANAGED_API, MANAGED_BY, MANAGED_CODE, MANAGED_ENTRY_KEYS,
  MANAGED_LABELS, NOTE_TEXT, NOTICE, OUTCOME, P5_CODE, PRESET, RELAY, RELEASE_TOOL, STATUS, TITLE, UNKNOWN_TOOL_TEXT, WATCH_API,
} from './support/constants.mjs'
import {
  HOOK, T, askSettled, callScript, callTool, fishballCall, fishballClientBundle, fishballMessages, intakeNow, managedEntry, managedItems, managedNow, messageFishball,
  requestMessages, setManaged, settledIdle, startAsk, toolNames, turn, untilSeen, waitRequest,
} from './support/expect.mjs'
import { bootHost, newHome, sleep, until } from './support/host.mjs'

let seq = 0
const tok = (label) => 'MGD' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 7)
/** A pass-through reaches the stock prompt at once; a request routed to Fishball would wait for it first. */
const AT_ONCE_MS = 1000
/** How long "nothing happened" is watched for. */
const QUIET_MS = 1200
/** Who changed management: the note's words and its intake kind (§5e item 5; user clicks are your inputs). */
const BY_USER = { text: /\buser\b/i, kind: 'user' }
const BY_FISHBALL = { text: /Fishball/, kind: 'system' }
const hasInbound = (req) => toolNames(req).includes(INBOUND_TOOL)
const sinceMs = (since) => (typeof since === 'number' ? since : Date.parse(since))

describe('Revision 11 rev11a: yours or managed, and the ways in and out', () => {
  let host
  let home
  let fb
  const seenFor = async (text) => (await host.call('approvals', {})).filter((a) => a.reason === ASK_REASON(text))
  const fbRequestCount = async () => (await host.call('requests', { sessionId: fb })).length

  /** A session the user starts (DSH's own controller), with one plain turn behind it. */
  async function userSession(folder, preset = PRESET.bare) {
    const sid = (await host.call('ordinary', { preset, folder })).sessionId
    await turn(host, sid, [[{ text: 'hello' }]], 'first words')
    const cwd = (await host.call('header', { sessionId: sid })).cwd
    return { sid, cwd }
  }
  /** The tools of a session's next model request (one plain turn). */
  const nextRequest = async (sid) => (await turn(host, sid, [[{ text: 'next' }]])).requests.at(-1)

  /** Fishball's management notes about the session in folder cwd (not permission requests, not forwards). */
  async function notesAbout(cwd) {
    const events = (await host.call('inspect', { sessionId: fb, events: true })).events ?? []
    return events.filter((e) => e.type === 'user/message' && e.source?.kind === NOTICE.kind && e.text.includes(cwd) && !e.text.startsWith('[permission request') && !e.text.startsWith(FORWARD_HEADER))
  }
  const noteCounts = async (sid, cwd) => ({ items: (await managedItems(host, sid)).length, notes: (await notesAbout(cwd)).length })

  /** Exactly one new note about sid, read by Fishball (it woke), whose text names the folder and matches who. */
  async function expectOneNote(sid, cwd, before, who) {
    assert.ok(await until(async () => (await managedItems(host, sid)).length > before.items, 8000, 100), 'a note item ' + 'fishball/managed/' + sid)
    assert.ok(await until(async () => (await managedItems(host, sid)).every((i) => i.status === 'consumed'), 10000, 100), 'Fishball read the note (it woke)')
    await sleep(QUIET_MS)
    await settledIdle(host, fb)
    assert.equal((await managedItems(host, sid)).length, before.items + 1, 'exactly one note item')
    const notes = await notesAbout(cwd)
    assert.equal(notes.length, before.notes + 1, 'exactly one note message naming the folder')
    assert.match(notes.at(-1).text, who.text, 'the note says who did it: ' + notes.at(-1).text.slice(0, 600))
    // Your clicks are your inputs (kind user); Fishball's release is a notice of its own (kind system).
    assert.equal((await managedItems(host, sid)).at(0)?.kind, who.kind, 'intake kind says who did it')
    return notes.at(-1)
  }
  /** Fishball's own ways in send no note (item 5 lists only hand-over, take-back and release). */
  async function expectNoNote(sid, cwd, before) {
    await sleep(QUIET_MS)
    await settledIdle(host, fb)
    assert.equal((await managedItems(host, sid)).length, before.items, 'no fishball/managed note item')
    assert.equal((await notesAbout(cwd)).length, before.notes, 'no management note message')
  }

  /** The snapshot entry: exactly {sessionId, since, by}, with by and a since taken at the change. */
  async function expectEntry(sid, by, t0) {
    const e = await managedEntry(host, sid)
    assert.ok(e, sid + ' listed in managed: ' + JSON.stringify(await managedNow(host)))
    assert.deepEqual(Object.keys(e).sort(), MANAGED_ENTRY_KEYS)
    assert.equal(e.by, by)
    const since = sinceMs(e.since)
    assert.ok(Number.isFinite(since), 'since is a time: ' + e.since)
    assert.ok(since >= t0 - 2000 && since <= Date.now() + 2000, 'since at the change: ' + e.since)
  }

  /** A permission request from sid reaches its own stock prompt at once, with no Fishball step and nothing in the intake. */
  async function expectStock(sid) {
    await settledIdle(host, fb)
    await settledIdle(host, sid)
    const text = tok('stock')
    const fbBefore = await fbRequestCount()
    const intake = await intakeNow(host)
    const ids = intake.items.map((i) => i.intakeId)
    await startAsk(host, sid, ASK_TOOL, { text })
    const done = await askSettled(host, text, 5000)
    assert.equal(done?.outcome, OUTCOME.reject, "the stock prompt's answer is the session's outcome")
    const seen = await seenFor(text)
    assert.equal(seen.length, 1, 'the stock prompt was asked once')
    assert.equal(seen[0].sessionId, sid)
    assert.ok(seen[0].at - done.askedAt < AT_ONCE_MS, 'at once: ' + (seen[0].at - done.askedAt) + ' ms')
    await sleep(QUIET_MS)
    assert.deepEqual(await requestMessages(host, fb, text), [], 'Fishball is not told')
    assert.equal(await fbRequestCount(), fbBefore, 'zero Fishball model steps')
    const now = await intakeNow(host)
    assert.deepEqual(now.items.filter((i) => !ids.includes(i.intakeId)), [], 'nothing new in Fishball\'s intake')
    assert.equal(now.queued, intake.queued)
    await settledIdle(host, sid)
  }
  /** A permission request from sid reaches Fishball (a permission request message naming sid) and not the stock prompt. */
  async function expectFishball(sid) {
    await settledIdle(host, fb)
    await settledIdle(host, sid)
    const text = tok('tofb')
    await startAsk(host, sid, ASK_TOOL, { text })
    const req = await waitRequest(host, fb, text)
    assert.ok(req, 'a permission request reached Fishball')
    assert.equal(req.block?.fields?.session_id, sid)
    assert.deepEqual(await seenFor(text), [], 'not at the stock prompt while Fishball decides')
    // Stop the waiting call so the session is free again (Fishball's fake model only answers 'ok').
    await host.call('cancel', { sessionId: sid })
    await askSettled(host, text)
    await settledIdle(host, sid)
    await settledIdle(host, fb)
  }
  /** Nothing in a request mentions Fishball: no tool named after it, no word in the system text, tool schemas or messages. */
  function assertNoMention(req, label) {
    for (const n of toolNames(req)) assert.equal(/fishball/i.test(n), false, label + ' has tool ' + n)
    assert.equal(FISHBALL_WORD.test(req.system), false, label + ' system text mentions Fishball: ' + req.system.slice(Math.max(0, req.system.search(FISHBALL_WORD) - 200), req.system.search(FISHBALL_WORD) + 200))
    assert.equal(FISHBALL_WORD.test(JSON.stringify(req.tools)), false, label + ' tool schemas mention Fishball')
  }

  before(async () => {
    home = newHome('managed-ways')
    host = await bootHost(home, { env: APPROVER_AFTER_ENV })
    fb = (await host.waitStatus(STATUS.live))?.sessionId
    await settledIdle(host, fb)
    await host.call('setApprover', { outcome: OUTCOME.reject })
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('MGD-01 no session is managed at the first start', T, async () => {
    assert.deepEqual(await managedNow(host), [])
  })

  for (const preset of [PRESET.bare, PRESET.standard]) {
    it('MGD-02 a session you start (' + preset + ') has no Fishball tool and nothing mentions Fishball', T, async () => {
      const { sid } = await userSession('mgd02-' + preset, preset)
      await nextRequest(sid)
      const reqs = await host.call('requests', { sessionId: sid })
      assert.ok(reqs.length >= 2)
      for (const [i, r] of reqs.entries()) {
        assert.equal(hasInbound(r), false, 'request ' + i + ' lists ' + INBOUND_TOOL)
        assertNoMention(r, 'request ' + i)
        // The standard preset quotes the checkout's own AGENTS.md (the test homes sit inside this repository); that is
        // the test environment's text, not Fishball's, so those workspace-instruction blocks are left out.
        const texts = r.texts.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, (b) => (b.includes('Instructions from: AGENTS.md') ? '' : b))
        assert.equal(FISHBALL_WORD.test(texts), false, 'request ' + i + ' messages mention Fishball: ' + texts.slice(Math.max(0, texts.search(FISHBALL_WORD) - 300), texts.search(FISHBALL_WORD) + 300))
      }
      assert.equal(await managedEntry(host, sid), undefined)
    })
  }

  it('MGD-03 your session\'s permission request reaches its own stock prompt and costs Fishball nothing', T, async () => {
    const { sid } = await userSession('mgd03')
    await expectStock(sid)
  })

  const handed = {}
  it('MGD-04 Hand over: managed by hand-over, one note from the user, the tool and the requests go to Fishball', T, async () => {
    Object.assign(handed, await userSession('mgd04'))
    const { sid, cwd } = handed
    const before = await noteCounts(sid, cwd)
    const t0 = Date.now()
    const r = await setManaged(host, sid, true)
    assert.equal(r.status, 200, r.text)
    assert.equal(r.json?.ok, true, r.text)
    await expectEntry(sid, MANAGED_BY.handOver, t0)
    await expectOneNote(sid, cwd, before, BY_USER)
    assert.ok(hasInbound(await nextRequest(sid)), 'next request has ' + INBOUND_TOOL)
    await expectFishball(sid)
  })

  it('MGD-05 Send to Fishball: managed by send, no management note, the tool and the requests go to Fishball', T, async () => {
    const { sid, cwd } = await userSession('mgd05')
    const before = await noteCounts(sid, cwd)
    const t0 = Date.now()
    const r = await host.post(API.send, { sessionId: sid, note: '' })
    assert.equal(r.status, 200, r.text)
    await expectEntry(sid, MANAGED_BY.send, t0)
    assert.ok(await until(async () => (await intakeNow(host)).items.some((i) => i.sourceIdentity === IDENTITY.forward(sid) && i.status === 'consumed'), 10000, 100), 'the forward itself arrived and was read')
    await expectNoNote(sid, cwd, before)
    assert.ok(hasInbound(await nextRequest(sid)), 'next request has ' + INBOUND_TOOL)
    await expectFishball(sid)
  })

  const messaged = {}
  it('MGD-06 message_session: managed by message before delivery, no note, requests go to Fishball', T, async () => {
    Object.assign(messaged, await userSession('mgd06'))
    const { sid, cwd } = messaged
    const before = await noteCounts(sid, cwd)
    const text = tok('06') + ' please look'
    const t0 = Date.now()
    const { json } = await fishballCall(host, fb, 'message_session', { session_id: sid, message: text })
    assert.equal(json?.ok, true, JSON.stringify(json))
    await expectEntry(sid, MANAGED_BY.message, t0)
    assert.ok(await until(async () => (await host.call('requestsContaining', { needle: text })).some((r) => r.sessionId === sid), 10000, 100), 'the target read it')
    await settledIdle(host, sid)
    const reading = (await host.call('requests', { sessionId: sid })).filter((r) => r.texts.includes(text))
    assert.ok(reading.length > 0)
    assert.ok(hasInbound(reading[0]), 'the request that reads the message already has ' + INBOUND_TOOL)
    await expectNoNote(sid, cwd, before)
    await expectFishball(sid)
  })

  it('MGD-07 start_session: the new session is managed by start, every request has the tool, its requests go to Fishball', T, async () => {
    const folder = path.join(home, 'work', 'mgd07')
    fs.mkdirSync(folder, { recursive: true })
    const marker = tok('07')
    await host.call('queueMarker', { marker, except: fb, script: [[{ text: 'started' }]] })
    const t0 = Date.now()
    // The probe stamps the title's rename and the first steer, so the managed entry's `since` can be placed between them.
    await host.call('startProbe', {})
    let json
    let events
    try {
      ;({ json } = await fishballCall(host, fb, 'start_session', { folder, title: TITLE.plain, message: marker + ' build it' }))
      events = await host.call('probeEvents')
    } finally { await host.call('stopProbe') }
    assert.equal(json?.ok, true, JSON.stringify(json))
    assert.equal(json.title, TITLE.plain)
    const sid = json.sessionId
    await expectEntry(sid, MANAGED_BY.start, t0)
    // Rev11: the title is set first, the session is made managed next, and only then is the first message delivered.
    const rename = events.find((e) => e.type === 'rename' && e.sessionId === sid)
    const steer = events.find((e) => e.type === 'steer' && e.sessionId === sid)
    const since = sinceMs((await managedEntry(host, sid)).since)
    assert.ok(rename && steer, 'the probe saw the rename and the steer: ' + JSON.stringify(events))
    assert.ok(rename.at <= since && since <= steer.at, 'create → rename → managed → first message: rename ' + rename.at + ', since ' + since + ', steer ' + steer.at)
    assert.ok(await until(async () => (await host.call('markerState', { marker })).left === 0, 10000, 100), 'the new session ran a turn')
    await settledIdle(host, sid)
    const cwd = (await host.call('header', { sessionId: sid })).cwd
    await expectNoNote(sid, cwd, { items: 0, notes: 0 })
    const reqs = await host.call('requests', { sessionId: sid })
    assert.ok(reqs.length > 0)
    for (const r of reqs) assert.ok(hasInbound(r), 'a request of the started session lacks ' + INBOUND_TOOL)
    await expectFishball(sid)
  })

  it('MGD-08 Take back: yours again, one note from the user, the tool gone, requests to the stock prompt', T, async () => {
    const { sid, cwd } = handed
    assert.ok(await managedEntry(host, sid), 'precondition: managed (MGD-04)')
    const before = await noteCounts(sid, cwd)
    const r = await setManaged(host, sid, false)
    assert.equal(r.status, 200, r.text)
    assert.equal(r.json?.ok, true, r.text)
    assert.equal(await managedEntry(host, sid), undefined, 'no longer listed')
    await expectOneNote(sid, cwd, before, BY_USER)
    const req = await nextRequest(sid)
    assert.equal(hasInbound(req), false, 'next request still lists ' + INBOUND_TOOL)
    assertNoMention(req, 'after take back')
    await expectStock(sid)
  })

  it('MGD-09 release_session: yours again, one note, the tool gone, requests to the stock prompt', T, async (t) => {
    const { sid, cwd } = messaged
    assert.ok(await managedEntry(host, sid), 'precondition: managed (MGD-06)')
    const before = await noteCounts(sid, cwd)
    const { json, result } = await fishballCall(host, fb, RELEASE_TOOL, { session_id: sid, reason: 'fbtest: the work is done' })
    assert.equal(result.isError, false, result.text)
    assert.equal(json?.ok, true, result.text)
    assert.equal(await managedEntry(host, sid), undefined, 'no longer listed')
    const note = await expectOneNote(sid, cwd, before, BY_FISHBALL)
    t.diagnostic('release note: ' + note.text.slice(0, 400))
    assert.equal(hasInbound(await nextRequest(sid)), false, 'next request still lists ' + INBOUND_TOOL)
    await expectStock(sid)
  })

  describe('MGD-10 message_fishball: yours versus managed', () => {
    it('from a session that is yours: UNKNOWN_TOOL and no body runs', T, async () => {
      const { sid } = await userSession('mgd10-yours')
      const text = tok('10y')
      const { result } = await callTool(host, sid, INBOUND_TOOL, { message: text })
      assert.equal(result.isError, true, result.text)
      assert.match(result.text, UNKNOWN_TOOL_TEXT)
      await sleep(QUIET_MS)
      await settledIdle(host, fb)
      assert.deepEqual(await fishballMessages(host, fb, text), [], 'nothing delivered')
      assert.equal((await intakeNow(host)).items.some((i) => i.sourceIdentity === IDENTITY.session(sid)), false, 'no intake item for the caller')
    })
    it('from a managed session: delivered as in P5', T, async () => {
      const { sid } = await userSession('mgd10-managed')
      assert.equal((await setManaged(host, sid, true)).status, 200)
      await settledIdle(host, fb)
      const text = tok('10m')
      const { json } = await messageFishball(host, sid, { message: text })
      assert.deepEqual(json, { ok: true, note: NOTE_TEXT.delivered })
      assert.ok(await untilSeen(host, fb, text), 'Fishball read it')
      const got = await fishballMessages(host, fb, text)
      assert.equal(got.length, 1)
      assert.equal(got[0].source?.kind, RELAY.kind)
      assert.equal(got[0].source?.senderSessionId, sid)
      assert.ok((await intakeNow(host)).items.some((i) => i.sourceIdentity === IDENTITY.session(sid)), 'intake item session/<id>')
    })
  })

  describe('MGD-11 Fishball\'s own session and unknown sessions', () => {
    it('hand over Fishball\'s own session: 409 is-fishball', T, async () => {
      const r = await setManaged(host, fb, true)
      assert.equal(r.status, 409, r.text)
      assert.equal(r.json?.code, MANAGED_CODE.isFishball)
      assert.equal(await managedEntry(host, fb), undefined)
    })
    it('take back Fishball\'s own session: 409 is-fishball', T, async () => {
      const r = await setManaged(host, fb, false)
      assert.equal(r.status, 409, r.text)
      assert.equal(r.json?.code, MANAGED_CODE.isFishball)
    })
    it('Fishball messaging itself: is-fishball, never managed, never given message_fishball', T, async () => {
      const { json } = await fishballCall(host, fb, 'message_session', { session_id: fb, message: tok('11self') })
      assert.deepEqual(json, { ok: false, code: P5_CODE.isFishball })
      assert.equal(await managedEntry(host, fb), undefined)
      const reqs = await host.call('requests', { sessionId: fb })
      for (const r of reqs) assert.equal(hasInbound(r), false, 'a Fishball request lists ' + INBOUND_TOOL)
    })
    for (const managed of [true, false]) {
      it('unknown session, managed ' + managed + ': 409 unknown-session', T, async () => {
        const before = await managedNow(host)
        const r = await setManaged(host, 'session-fbtest-no-such-mgd11', managed)
        assert.equal(r.status, 409, r.text)
        assert.equal(r.json?.code, MANAGED_CODE.unknownSession)
        assert.deepEqual(await managedNow(host), before)
      })
    }
  })

  describe('MGD-12 bad bodies are refused at the boundary', () => {
    let sid
    before(async () => { sid = (await userSession('mgd12')).sid }, HOOK)
    const rows = [
      ['invalid JSON', () => ['{"sessionId":', { raw: true }]],
      ['an array', () => [[sid, true]]],
      ['an empty object', () => [{}]],
      ['managed missing', () => [{ sessionId: sid }]],
      ['sessionId missing', () => [{ managed: true }]],
      ['managed as the string "true"', () => [{ sessionId: sid, managed: 'true' }]],
      ['sessionId a number', () => [{ sessionId: 1, managed: true }]],
      ['sessionId empty', () => [{ sessionId: '', managed: true }]],
    ]
    for (const [label, args] of rows) {
      it(label + ' → 400 bad-body', T, async () => {
        const before = await managedNow(host)
        const r = await host.post(MANAGED_API, ...args())
        assert.equal(r.status, 400, r.text)
        assert.equal(r.json?.code, P5_CODE.badBody)
        assert.deepEqual(await managedNow(host), before)
        assert.equal(await managedEntry(host, sid), undefined)
      })
    }
  })

  describe('MGD-13 watching and reading do not make a session managed', () => {
    it('"Tell Fishball when finished" (watch route)', T, async () => {
      const { sid } = await userSession('mgd13-route')
      const r = await host.post(WATCH_API.add, { sessionId: sid })
      assert.equal(r.status, 200, r.text)
      await settledIdle(host, fb)
      assert.equal(await managedEntry(host, sid), undefined)
      assert.equal(hasInbound(await nextRequest(sid)), false)
    })
    it('watch_session, then read_session', T, async () => {
      const { sid } = await userSession('mgd13-tool')
      const w = await fishballCall(host, fb, 'watch_session', { session_id: sid })
      assert.equal(w.json?.ok, true, w.result.text)
      assert.equal(await managedEntry(host, sid), undefined, 'not managed after watch_session')
      const rd = await fishballCall(host, fb, 'read_session', { session_id: sid })
      assert.equal(rd.json?.ok, true, rd.result.text)
      assert.equal(await managedEntry(host, sid), undefined, 'not managed after read_session')
      assert.equal(hasInbound(await nextRequest(sid)), false)
      await expectStock(sid)
    })
  })

  it('MGD-14 a subagent of a managed session has no message_fishball', T, async () => {
    const { sid } = await userSession('mgd14', PRESET.standard)
    assert.equal((await setManaged(host, sid, true)).status, 200)
    await settledIdle(host, fb)
    const marker = tok('14sub')
    await host.call('queueMarker', { marker, except: sid, script: [[{ text: 'sub done' }]] })
    const r = await turn(host, sid, [[{ tool: 'subagent', args: { description: 'fbtest sub', prompt: marker + ' please' } }], [{ text: 'parent done' }]])
    assert.equal(r.results[0]?.isError, false, 'subagent ran: ' + r.results[0]?.text)
    assert.ok(await until(async () => (await host.call('markerState', { marker })).left === 0, 15000, 100), 'the subagent made a request')
    const child = (await host.call('markerState', { marker })).sessions[0]
    assert.ok(child && child !== sid, 'a child session: ' + child)
    for (const p of r.requests) assert.ok(hasInbound(p), 'the managed parent has ' + INBOUND_TOOL)
    const childReqs = await host.call('requests', { sessionId: child })
    assert.ok(childReqs.length > 0)
    for (const c of childReqs) assert.equal(hasInbound(c), false, 'the child lists ' + INBOUND_TOOL)
  })

  describe('MGD-15 a change mid-turn reaches the next step of the same turn', () => {
    /** Hold the turn's step-1 request (its tools are already assembled), change management, release; returns the turn's requests. */
    async function heldTurn(sid, managed) {
      await settledIdle(host, sid)
      const before = (await host.call('requests', { sessionId: sid })).length
      await host.call('holdNext', { sessionId: sid })
      await host.call('driveStart', { sessionId: sid, text: 'mid-turn ' + managed, script: [[{ tool: 'demo_echo', args: { text: 'step 1' } }], [{ text: 'step 2 done' }]] })
      assert.ok(await until(() => host.call('isHeld', { sessionId: sid }), 5000, 50), 'precondition: step 1 is held')
      let r
      try { r = await setManaged(host, sid, managed) } finally { await host.call('releaseHold', { sessionId: sid }) }
      assert.equal(r.status, 200, r.text)
      assert.ok(await host.call('waitIdle', { sessionId: sid }), 'the turn ended')
      await settledIdle(host, fb)
      return (await host.call('requests', { sessionId: sid })).slice(before)
    }
    let sid
    it('Hand over during step 1: step 2 has the tool', T, async () => {
      sid = (await userSession('mgd15')).sid
      const reqs = await heldTurn(sid, true)
      assert.equal(reqs.length, 2, 'two steps')
      assert.equal(hasInbound(reqs[0]), false, 'step 1 was assembled before the hand-over')
      assert.ok(hasInbound(reqs[1]), 'step 2 has ' + INBOUND_TOOL)
    })
    it('Take back during step 1: step 2 lacks the tool', T, async () => {
      assert.ok(await managedEntry(host, sid), 'precondition: managed')
      const reqs = await heldTurn(sid, false)
      assert.equal(reqs.length, 2, 'two steps')
      assert.ok(hasInbound(reqs[0]), 'step 1 was assembled before the take-back')
      assert.equal(hasInbound(reqs[1]), false, 'step 2 lacks ' + INBOUND_TOOL)
    })
  })

  it('MGD-16 the client bundle has Hand over and Take back', T, async (t) => {
    const bundle = await fishballClientBundle(host)
    assert.ok(bundle.found, 'index references dsh-fishball/client.js')
    assert.equal(bundle.status, 200)
    assert.ok(bundle.text.includes(MANAGED_LABELS.handOver), MANAGED_LABELS.handOver)
    assert.ok(bundle.text.includes(MANAGED_LABELS.takeBack), MANAGED_LABELS.takeBack)
    t.diagnostic('bundle names ' + MANAGED_API + ': ' + bundle.text.includes(MANAGED_API))
  })

  it('MGD-17 (diagnostic) unspecified transitions: hand over twice, take back a session that is yours', T, async (t) => {
    const { sid, cwd } = await userSession('mgd17')
    const twice = []
    for (let i = 0; i < 2; i++) { twice.push((await setManaged(host, sid, true)).status); await settledIdle(host, fb) }
    t.diagnostic('hand over twice: ' + JSON.stringify(twice) + ', notes ' + JSON.stringify(await noteCounts(sid, cwd)) + ', by ' + (await managedEntry(host, sid))?.by)
    const { sid: mine } = await userSession('mgd17-mine')
    const back = await setManaged(host, mine, false)
    t.diagnostic('take back a session that is yours: ' + back.status + ' ' + back.text.slice(0, 200))
    const rel = await fishballCall(host, fb, RELEASE_TOOL, { session_id: mine, reason: 'fbtest' })
    t.diagnostic('release a session that is yours: ' + rel.result.text.slice(0, 200))
    assert.equal(await managedEntry(host, mine), undefined, 'still yours')
  })
})
