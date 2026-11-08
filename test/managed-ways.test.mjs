/**
 * Yours or managed, and the ways in and out (DESIGN §5b, §5e, §9, §10e; contract §4.1, §4.5, §9; slim §8.3, §12),
 * on the H-STUB harness: the instance is the fake `fbtest-stub-instance`, which reaches the connector only through the
 * contract. The in-process Fishball session is gone (slim §12), so what Fishball did by its own tools is now the stub's
 * contract request (session.start / session.message / session.release), and "Fishball was told" is an `inbox.push` the
 * stub received, or an `approval.request` event. Host boots with FBTEST_APPROVER_AFTER=1: the scripted answerer stands
 * in for a session's own stock prompt after the connector's broker, and the root registers the asking tool fbtest_ask.
 * One host; the cases run in order and each uses its own sessions; the no-instance cases detach the stub and come last.
 * Expected values come from the requirements, never the implementation.
 *
 * | id      | technique | requirement | expected |
 * |---------|-----------|-------------|----------|
 * | MGD-01  | EP (first start) | §5e "existing sessions" | snapshot managed is [] |
 * | MGD-02 ×2 | EP (yours: bare / standard preset) | §5e item 3 | no request has a managed tool or any tool named *fishball*; no "Fishball" in system text, tool schemas or messages |
 * | MGD-03  | EP (yours, instance attached) | §5e item 3, contract §9 | its permission request reaches its own stock prompt at once; nothing offered to the instance, no new intake item |
 * | MGD-04  | ST (yours –Hand over→ managed) | §5e, §10e, contract §4.5 | 200 ok; entry {sessionId, title, since, by:'hand-over'}; exactly one `user` item naming the session, its folder and the user, acked; next request has the three managed tools; next permission request is offered to the instance |
 * | MGD-05  | ST (yours –Hand over with a note→ managed) | slim §8.3, conn-OQ-34, C1-DT-04 | 200; entry by 'hand-over'; exactly one `user` item that carries the note outside the untrusted block; tools; requests to the instance |
 * | MGD-06 ×2 | DT (session.message × yours / managed) | contract §4.1 (managed session) | yours: error not-managed, nothing delivered, still yours; managed: {status:'delivered'}, delivered once as a relay from the instance's session, entry unchanged, the reading turn has the tools |
 * | MGD-07  | ST (none –session.start→ managed) | contract §4.1, §5e | {sessionId, managed:true}; entry by 'start'; no note; every request of the new session has the tools; its permission request goes to the instance; create → rename (the title) → managed (`since`) → first message |
 * | MGD-08  | ST (managed –Take back→ yours) | §5e item 4, contract §4.5 | 200; entry gone; one `user` note naming the folder and the user; next request has no managed tool and no "Fishball"; permission request to the stock prompt |
 * | MGD-09  | ST (managed –session.release→ yours) | contract §4.1, §4.5 | {sessionId, managed:false}; entry gone; one `system` note naming the folder; next request has no managed tool; permission request to the stock prompt |
 * | MGD-09b ×6 | DT/BVA (session.release refusals and reason length) | contract §4.1, §8 (reasonChars 500) | yours: not-managed; the instance's own session: is-fishball; unknown id: unknown-session; reason 500 chars: accepted; reason '': error reason-required (§4.1 names it); 501 chars: refused (an error frame or a validation close, §3.1), no response; the session stays managed |
 * | MGD-10 ×2 | DT (message_fishball × yours / managed) | §5e "tools per session", contract §4.5 | yours: UNKNOWN_TOOL, no inbox item; managed: {ok:true, note:'Delivered to Fishball.'}, one `session` item from it |
 * | MGD-11 ×5 | DT (route × the instance's own / unknown session) | §10e, contract §4.1 | Hand over / Take back of the instance's own session: 409 is-fishball; session.message to it: is-fishball; unknown id (managed true / false): 409 unknown-session; the own session is never listed |
 * | MGD-12 ×8 | EP (bad body) | §10e | invalid JSON, array, {}, missing managed, missing sessionId, managed 'true', sessionId 1, sessionId '' → 400 bad-body; nothing changes |
 * | MGD-13 ×2 | EP (session.watch / session.read on a session that is yours) | §5e "Reading", contract §4.1 (related session), §7 WATCH_ERROR | watch: a response with watchError not-related; read: an error frame; neither makes the session managed; no tool |
 * | MGD-14  | EP (subagent of a managed session) | §5e "Subagents" | the parent's requests have the tools, the child's have none |
 * | MGD-15 ×2 | ST (Hand over / Take back while a turn is held at step 1) | §5e "tools per session" | step 1's request is as before; step 2 of the same turn has (hand over) / lacks (take back) the tools |
 * | MGD-16  | EP (client bundle) | §10e, slim §8.3 | carries "Hand over to Fishball" and "Take back from Fishball"; no "Send to Fishball" or "Tell Fishball when finished" button |
 * | MGD-17  | diagnostic | — | unspecified transitions: hand over twice, take back a session that is yours |
 * | MGD-18  | BVA (queue bound 2, no instance) | contract §9, C1-BVA-06, conn-OQ-03 | a third message_fishball is refused queue-full; Hand over with a note and Take back still answer 200 and change management; after the attach the four items arrive in arrival order, each once; a release whose `system` note meets the full bound still stands |
 *
 * Retired:
 * - MGD-05 (by 'send'): Hand over with a note posts the forward route, which records by hand-over (slim §8.3, T14 item 3); there is no separate send tag.
 * - MGD-06 (message makes managed): session.message serves managed sessions only (contract §4.1) and refuses one that is yours with not-managed, so messaging is no longer a way in.
 * - MGD-13 (watch route): "Tell Fishball when finished" and its route are gone (slim §8.3: watch-only dropped).
 * - MGD-11 (Fishball never gets message_fishball): Fishball's own model requests and agent no longer exist in the main DSH (slim §12).
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { DELIVERY, ERROR, WATCH_ERROR, WATCH_MODE } from 'fishball-connector/contract'
import { FISHBALL_WORD, MANAGED_BY, MANAGED_CODE, MANAGED_TOOLS, NOTE_TEXT, P5_CODE, PRESET, RELAY, UNKNOWN_TOOL_TEXT } from './support/constants.mjs'
import { HOOK, T, fishballClientBundle, settledIdle, toolNames, turn, untrustedBlock } from './support/expect.mjs'
import { KIND, OPERATION, STUB, handOver, messageFishball, quietPushes, stopStub, takeBack, userSession } from './support/instance-stub.mjs'
import {
  MANAGED_STUB, bootManaged, detachStub, entryOf, expectEntry, expectNoNote, expectOneNote, expectStock, expectToInstance, folderIn, handOverWithNote, hasTool,
  managedNow, notesAbout, messageSession, nextRequest, noteRows, postManaged, reattach, release, scoped, setLimit, startSession,
} from './support/instance-stub-managed.mjs'
import { sleep, until } from './support/util.mjs'

let seq = 0
const tok = (label) => 'MGD' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 7)
/** The queue bound of MGD-18 (C1-BVA-06: limit 2, two message_fishball open). */
const QUEUE_BOUND = 2
const QUEUE_DEFAULT = 200
const QUEUE_FULL = P5_CODE.queueFull
const hasAll = (req) => MANAGED_TOOLS.every((n) => hasTool(req, n))
const hasAny = (req) => MANAGED_TOOLS.some((n) => hasTool(req, n))

describe('yours or managed, and the ways in and out (H-STUB)', () => {
  let booted
  let host
  let stub
  let fb

  /** A session the user starts, with one plain turn behind it; returns its id and folder. */
  async function yours(folder, preset = PRESET.bare) {
    const sid = await userSession(host, folder, preset)
    return { sid, cwd: (await host.call('header', { sessionId: sid })).cwd }
  }
  /** Nothing in a request mentions Fishball: no tool named after it, no word in the system text or tool schemas. */
  function assertNoMention(req, label) {
    for (const n of toolNames(req)) assert.equal(/fishball/i.test(n), false, label + ' has tool ' + n)
    for (const n of MANAGED_TOOLS) assert.equal(hasTool(req, n), false, label + ' has ' + n)
    assert.equal(FISHBALL_WORD.test(req.system), false, label + ' system text mentions Fishball: ' + req.system.slice(Math.max(0, req.system.search(FISHBALL_WORD) - 200), req.system.search(FISHBALL_WORD) + 200))
    assert.equal(FISHBALL_WORD.test(JSON.stringify(req.tools)), false, label + ' tool schemas mention Fishball')
  }
  const count = async (sid) => (await notesAbout(stub, sid)).length

  before(async () => {
    booted = await bootManaged('managed-ways')
    ;({ host, stub, fb } = booted)
  }, HOOK)
  after(() => stopStub(booted), HOOK)

  it('MGD-01 no session is managed at the first start', T, async () => {
    assert.deepEqual(await managedNow(host), [])
  })

  for (const preset of [PRESET.bare, PRESET.standard]) {
    it('MGD-02 a session you start (' + preset + ') has no Fishball tool and nothing mentions Fishball', T, async () => {
      const { sid } = await yours('mgd02-' + preset, preset)
      await nextRequest(host, sid)
      const reqs = await host.call('requests', { sessionId: sid })
      assert.ok(reqs.length >= 2)
      for (const [i, r] of reqs.entries()) {
        assertNoMention(r, 'request ' + i)
        // A workspace-instruction block that quotes some AGENTS.md above the temp home is the environment's text, not Fishball's.
        const texts = r.texts.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, (b) => (b.includes('Instructions from: AGENTS.md') ? '' : b))
        assert.equal(FISHBALL_WORD.test(texts), false, 'request ' + i + ' messages mention Fishball: ' + texts.slice(Math.max(0, texts.search(FISHBALL_WORD) - 300), texts.search(FISHBALL_WORD) + 300))
      }
      assert.equal(await entryOf(host, sid), undefined)
    })
  }

  it('MGD-03 your session\'s permission request reaches its own stock prompt and is not offered to the instance', T, async () => {
    const { sid } = await yours('mgd03')
    await expectStock(booted, sid)
  })

  const handed = {}
  it('MGD-04 Hand over: managed by hand-over, one user note, the tools, and the requests go to the instance', T, async () => {
    Object.assign(handed, await yours('mgd04'))
    const { sid, cwd } = handed
    const before = await count(sid)
    const t0 = Date.now()
    const r = await handOver(host, sid)
    assert.equal(r.status, 200, r.text)
    assert.equal(r.json?.ok, true, r.text)
    await expectEntry(host, sid, MANAGED_BY.handOver, t0)
    await expectOneNote(stub, sid, before, KIND.user, MANAGED_STUB.byUser, cwd)
    assert.ok(await until(async () => (await noteRows(host, sid)).every((i) => i.status === 'consumed'), MANAGED_STUB.publishMs, 100), 'the instance acked the note')
    assert.ok(hasAll(await nextRequest(host, sid)), 'next request has ' + MANAGED_TOOLS)
    await expectToInstance(booted, sid)
  })

  it('MGD-05 Hand over with a note: managed by hand-over, one user item with the note as your words, the tools and the requests', T, async () => {
    const { sid } = await yours('mgd05')
    const note = tok('note') + ' watch it and tell me when it is done'
    const before = await count(sid)
    const t0 = Date.now()
    const r = await handOverWithNote(host, sid, note)
    assert.equal(r.status, 200, r.text)
    await expectEntry(host, sid, MANAGED_BY.handOver, t0)
    await until(async () => (await count(sid)) > before, MANAGED_STUB.publishMs, 100)
    await sleep(MANAGED_STUB.quietMs)
    const items = (await notesAbout(stub, sid)).slice(before)
    assert.equal(items.length, 1, 'one item, no second management note (conn-OQ-34): ' + JSON.stringify(items.map((i) => i.text.slice(0, 120))))
    assert.equal(items[0].kind, KIND.user)
    const block = untrustedBlock(items[0].text)
    assert.ok(block?.header.includes(note), 'the note is outside the untrusted block: ' + items[0].text.slice(0, 400))
    assert.equal(block.inner.includes(note), false, 'not inside it')
    assert.ok(hasAll(await nextRequest(host, sid)), 'next request has ' + MANAGED_TOOLS)
    await expectToInstance(booted, sid)
  })

  const messaged = {}
  describe('MGD-06 session.message serves managed sessions only', () => {
    it('to a session that is yours: not-managed, nothing delivered, still yours', T, async () => {
      const { sid } = await yours('mgd06-yours')
      const text = tok('06y')
      const r = await messageSession(stub, sid, text)
      assert.equal(r.type, 'error', JSON.stringify(r))
      assert.equal(r.payload.code, ERROR.notManaged)
      await sleep(MANAGED_STUB.quietMs)
      assert.deepEqual((await host.call('userMessages', { sessionId: sid })).filter((m) => m.text.includes(text)), [], 'not delivered')
      assert.equal(await entryOf(host, sid), undefined)
      assert.equal(hasAny(await nextRequest(host, sid)), false)
    })
    it('to a managed session: delivered once as a relay, the entry unchanged, the reading turn has the tools', T, async () => {
      Object.assign(messaged, await yours('mgd06'))
      const { sid } = messaged
      assert.equal((await handOver(host, sid)).status, 200)
      const entry = await entryOf(host, sid)
      const before = await count(sid)
      const text = tok('06m') + ' please look'
      const r = await messageSession(stub, sid, text)
      assert.equal(r.type, 'response', JSON.stringify(r))
      assert.equal(r.payload.status, DELIVERY.delivered)
      assert.ok(await until(async () => (await host.call('requestsContaining', { needle: text })).some((x) => x.sessionId === sid), STUB.waitMs, 100), 'the target read it')
      await settledIdle(host, sid)
      const got = (await host.call('userMessages', { sessionId: sid })).filter((m) => m.text.includes(text))
      assert.equal(got.length, 1, 'delivered once')
      assert.deepEqual(got[0].source, { ...RELAY, senderSessionId: fb }, 'a relay from the instance\'s session')
      const reading = (await host.call('requests', { sessionId: sid })).filter((x) => x.texts.includes(text))
      assert.ok(reading.length > 0 && hasAll(reading[0]), 'the request that reads the message has ' + MANAGED_TOOLS)
      assert.deepEqual(await entryOf(host, sid), entry, 'by and since unchanged')
      await expectNoNote(stub, sid, before)
    })
  })

  it('MGD-07 session.start: managed:true, by start, every request has the tools, its requests go to the instance, rename → managed → message', T, async () => {
    const marker = tok('07')
    await host.call('queueMarker', { marker, except: null, script: [[{ text: 'started' }]] })
    const t0 = Date.now()
    const { reply, events, call } = await startSession(booted, { folder: folderIn(booted.home, 'mgd07'), title: 'Mgd07 started', message: marker + ' build it', probe: {} })
    assert.equal(reply.type, 'response', JSON.stringify(reply))
    assert.deepEqual(Object.keys(reply.payload).sort(), ['managed', 'sessionId'])
    assert.equal(reply.payload.managed, true)
    const sid = reply.payload.sessionId
    const entry = await expectEntry(host, sid, MANAGED_BY.start, t0)
    assert.equal(entry.title, call.title)
    const rename = events.find((e) => e.type === 'rename' && e.sessionId === sid)
    const steer = events.find((e) => e.type === 'steer' && e.sessionId === sid)
    assert.ok(rename && steer, 'the probe saw the rename and the steer: ' + JSON.stringify(events))
    const since = Date.parse(entry.since)
    assert.ok(rename.at <= since && since <= steer.at, 'create → rename → managed → first message: rename ' + rename.at + ', since ' + since + ', steer ' + steer.at)
    assert.ok(await until(async () => (await host.call('markerState', { marker })).left === 0, STUB.waitMs, 100), 'the new session ran a turn')
    await settledIdle(host, sid)
    await expectNoNote(stub, sid, 0)
    const reqs = await host.call('requests', { sessionId: sid })
    assert.ok(reqs.length > 0)
    for (const r of reqs) assert.ok(hasAll(r), 'a request of the started session lacks ' + MANAGED_TOOLS)
    await expectToInstance(booted, sid)
  })

  it('MGD-08 Take back: yours again, one user note, the tools gone, requests to the stock prompt', T, async () => {
    const { sid, cwd } = handed
    assert.ok(await entryOf(host, sid), 'precondition: managed (MGD-04)')
    const before = await count(sid)
    const r = await takeBack(host, sid)
    assert.equal(r.status, 200, r.text)
    assert.equal(r.json?.ok, true, r.text)
    assert.equal(await entryOf(host, sid), undefined, 'no longer listed')
    await expectOneNote(stub, sid, before, KIND.user, MANAGED_STUB.byUser, cwd)
    assertNoMention(await nextRequest(host, sid), 'after take back')
    await expectStock(booted, sid)
  })

  it('MGD-09 session.release: yours again, one system note, the tools gone, requests to the stock prompt', T, async () => {
    const { sid, cwd } = messaged
    assert.ok(await entryOf(host, sid), 'precondition: managed (MGD-06)')
    const before = await count(sid)
    const r = await release(stub, sid)
    assert.equal(r.type, 'response', JSON.stringify(r))
    assert.deepEqual(r.payload, { sessionId: sid, managed: false })
    assert.equal(await entryOf(host, sid), undefined, 'no longer listed')
    await expectOneNote(stub, sid, before, KIND.system, MANAGED_STUB.byInstance, cwd)
    assert.equal(hasAny(await nextRequest(host, sid)), false, 'next request still lists a managed tool')
    await expectStock(booted, sid)
  })

  describe('MGD-09b session.release refusals and the reason bound', () => {
    it('a session that is yours: not-managed', T, async () => {
      const { sid } = await yours('mgd09b-yours')
      const r = await release(stub, sid)
      assert.equal(r.payload?.code, ERROR.notManaged, JSON.stringify(r))
    })
    it('the instance\'s own session: is-fishball', T, async () => {
      const r = await release(stub, fb)
      assert.equal(r.payload?.code, ERROR.isFishball, JSON.stringify(r))
    })
    it('an unknown session: unknown-session', T, async () => {
      const r = await release(stub, MANAGED_STUB.unknownSession)
      assert.equal(r.payload?.code, ERROR.unknownSession, JSON.stringify(r))
    })
    it('a reason of exactly 500 characters is accepted', T, async () => {
      const { sid } = await yours('mgd09b-500')
      assert.equal((await handOver(host, sid)).status, 200)
      const r = await release(stub, sid, 'r'.repeat(MANAGED_STUB.reasonChars))
      assert.deepEqual(r.payload, { sessionId: sid, managed: false }, JSON.stringify(r))
    })
    it('an empty reason → reason-required, and the session stays managed', T, async () => {
      const { sid } = await yours('mgd09b-0')
      assert.equal((await handOver(host, sid)).status, 200)
      const r = await release(stub, sid, '')
      assert.deepEqual({ type: r.type, payload: r.payload }, { type: 'error', payload: { code: ERROR.reasonRequired } }, 'contract §4.1 names reason-required for a release without a reason')
      assert.equal((await entryOf(host, sid))?.by, MANAGED_BY.handOver, 'still managed')
      if (!(await host.state()).instance.attached) await reattach(booted)
    })
    // Above the 500-character bound the payload either gets an error frame or fails validation, which closes the
    // channel (contract §3.1, §8); either way no response comes. The stub attaches again after a closed channel.
    it('a reason of 501 characters is refused and the session stays managed', T, async (t) => {
      const { sid } = await yours('mgd09b-501')
      assert.equal((await handOver(host, sid)).status, 200)
      const r = await release(stub, sid, 'r'.repeat(MANAGED_STUB.reasonChars + 1))
      t.diagnostic('reply: ' + JSON.stringify(r))
      assert.notEqual(r.type, 'response', 'refused: ' + JSON.stringify(r))
      assert.equal((await entryOf(host, sid))?.by, MANAGED_BY.handOver, 'still managed')
      if (!(await host.state()).instance.attached) await reattach(booted)
    })
  })

  describe('MGD-10 message_fishball: yours versus managed', () => {
    it('from a session that is yours: UNKNOWN_TOOL and nothing reaches the instance', T, async () => {
      const { sid } = await yours('mgd10-yours')
      const { result } = await messageFishball(host, sid, { message: tok('10y') })
      assert.equal(result.isError, true, result.text)
      assert.match(result.text, UNKNOWN_TOOL_TEXT)
      await expectNoNote(stub, sid, 0)
    })
    it('from a managed session: delivered, one session item from it', T, async () => {
      const { sid } = await yours('mgd10-managed')
      assert.equal((await handOver(host, sid)).status, 200)
      await until(async () => (await count(sid)) > 0, STUB.waitMs, 100)
      const before = await count(sid)
      const text = tok('10m')
      const { json } = await messageFishball(host, sid, { message: text })
      assert.deepEqual(json, { ok: true, note: NOTE_TEXT.delivered })
      const item = await stub.waitPush(text, { kind: KIND.session })
      assert.ok(item, 'a session item')
      assert.equal(item.sourceSessionId, sid)
      await expectNoNote(stub, sid, before + 1)
    })
  })

  describe('MGD-11 the instance\'s own session and unknown sessions', () => {
    for (const [label, change] of [['hand over', handOver], ['take back', takeBack]]) {
      it(label + ' the instance\'s own session: 409 is-fishball', T, async () => {
        const r = await change(host, fb)
        assert.equal(r.status, 409, r.text)
        assert.equal(r.json?.code, MANAGED_CODE.isFishball)
        assert.equal(await entryOf(host, fb), undefined)
      })
    }
    it('session.message to the instance\'s own session: is-fishball, never listed', T, async () => {
      const r = await messageSession(stub, fb, tok('11self'))
      assert.equal(r.payload?.code, ERROR.isFishball, JSON.stringify(r))
      assert.equal(await entryOf(host, fb), undefined)
    })
    for (const managed of [true, false]) {
      it('unknown session, managed ' + managed + ': 409 unknown-session', T, async () => {
        const before = await managedNow(host)
        const r = await postManaged(host, { sessionId: MANAGED_STUB.unknownSession, managed })
        assert.equal(r.status, 409, r.text)
        assert.equal(r.json?.code, MANAGED_CODE.unknownSession)
        assert.deepEqual(await managedNow(host), before)
      })
    }
  })

  describe('MGD-12 bad bodies are refused at the boundary', () => {
    let sid
    before(async () => { sid = (await yours('mgd12')).sid }, HOOK)
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
        const r = await postManaged(host, ...args())
        assert.equal(r.status, 400, r.text)
        assert.equal(r.json?.code, P5_CODE.badBody)
        assert.deepEqual(await managedNow(host), before)
        assert.equal(await entryOf(host, sid), undefined)
      })
    }
  })

  describe('MGD-13 watching and reading do not make a session managed', () => {
    const reads = {
      'session.watch': (sid) => scoped(stub, OPERATION.sessionWatch, { sessionId: sid, mode: WATCH_MODE.once }),
      'session.read': (sid) => scoped(stub, OPERATION.sessionRead, { sessionId: sid, maxMessages: 1, maxBytes: 1000 }),
    }
    for (const [name, op] of Object.entries(reads)) {
      it(name + ' on a session that is yours', T, async (t) => {
        const { sid } = await yours('mgd13-' + name)
        const r = await op(sid)
        t.diagnostic(name + ': ' + JSON.stringify(r))
        // A session that is yours and was never watched, messaged or forwarded is not related (contract §4.1).
        // A watch reports its own refusal in the response's watchError (§4.1, WATCH_ERROR not-related); a read
        // has no such field, so it is an ordinary error frame.
        if (name === 'session.watch') assert.deepEqual([r.type, r.payload?.watchError], ['response', WATCH_ERROR.notRelated], 'not related: ' + JSON.stringify(r))
        else assert.equal(r.type, 'error', 'refused: ' + JSON.stringify(r))
        assert.equal(await entryOf(host, sid), undefined, 'not managed after ' + name)
        assert.equal(hasAny(await nextRequest(host, sid)), false)
      })
    }
  })

  it('MGD-14 a subagent of a managed session has no managed tool', T, async () => {
    const { sid } = await yours('mgd14', PRESET.standard)
    assert.equal((await handOver(host, sid)).status, 200)
    const marker = tok('14sub')
    await host.call('queueMarker', { marker, except: sid, script: [[{ text: 'sub done' }]] })
    const r = await turn(host, sid, [[{ tool: 'subagent', args: { description: 'fbtest sub', prompt: marker + ' please' } }], [{ text: 'parent done' }]])
    assert.equal(r.results[0]?.isError, false, 'subagent ran: ' + r.results[0]?.text)
    assert.ok(await until(async () => (await host.call('markerState', { marker })).left === 0, 15000, 100), 'the subagent made a request')
    const child = (await host.call('markerState', { marker })).sessions[0]
    assert.ok(child && child !== sid, 'a child session: ' + child)
    for (const p of r.requests) assert.ok(hasAll(p), 'the managed parent has ' + MANAGED_TOOLS)
    const childReqs = await host.call('requests', { sessionId: child })
    assert.ok(childReqs.length > 0)
    for (const c of childReqs) assert.equal(hasAny(c), false, 'the child lists a managed tool')
  })

  describe('MGD-15 a change mid-turn reaches the next step of the same turn', () => {
    /** Hold the turn's step-1 request (its tools are already assembled), change management, release; returns the turn's requests. */
    async function heldTurn(sid, change) {
      await settledIdle(host, sid)
      const before = (await host.call('requests', { sessionId: sid })).length
      await host.call('holdNext', { sessionId: sid })
      await host.call('driveStart', { sessionId: sid, text: 'mid-turn', script: [[{ tool: 'demo_echo', args: { text: 'step 1' } }], [{ text: 'step 2 done' }]] })
      assert.ok(await until(() => host.call('isHeld', { sessionId: sid }), 5000, 50), 'precondition: step 1 is held')
      let r
      try { r = await change(host, sid) } finally { await host.call('releaseHold', { sessionId: sid }) }
      assert.equal(r.status, 200, r.text)
      assert.ok(await host.call('waitIdle', { sessionId: sid }), 'the turn ended')
      return (await host.call('requests', { sessionId: sid })).slice(before)
    }
    let sid
    it('Hand over during step 1: step 2 has the tools', T, async () => {
      sid = (await yours('mgd15')).sid
      const reqs = await heldTurn(sid, handOver)
      assert.equal(reqs.length, 2, 'two steps')
      assert.equal(hasAny(reqs[0]), false, 'step 1 was assembled before the hand-over')
      assert.ok(hasAll(reqs[1]), 'step 2 has ' + MANAGED_TOOLS)
    })
    it('Take back during step 1: step 2 lacks the tools', T, async () => {
      assert.ok(await entryOf(host, sid), 'precondition: managed')
      const reqs = await heldTurn(sid, takeBack)
      assert.equal(reqs.length, 2, 'two steps')
      assert.ok(hasAll(reqs[0]), 'step 1 was assembled before the take-back')
      assert.equal(hasAny(reqs[1]), false, 'step 2 lacks the tools')
    })
  })

  it('MGD-16 the client bundle has one Hand over and Take back, and no send or watch button', T, async () => {
    const bundle = await fishballClientBundle(host)
    assert.ok(bundle.found, 'index references fishball-connector/client.js')
    assert.equal(bundle.status, 200)
    assert.ok(bundle.text.includes(MANAGED_STUB.labels.handOver), MANAGED_STUB.labels.handOver)
    assert.ok(bundle.text.includes(MANAGED_STUB.labels.takeBack), MANAGED_STUB.labels.takeBack)
    for (const gone of MANAGED_STUB.labels.gone) assert.equal(bundle.text.includes(gone), false, 'slim §8.3 removed ' + gone)
  })

  it('MGD-17 (diagnostic) unspecified transitions: hand over twice, take back a session that is yours', T, async (t) => {
    const { sid } = await yours('mgd17')
    const twice = [(await handOver(host, sid)).status, (await handOver(host, sid)).status]
    await sleep(MANAGED_STUB.quietMs)
    t.diagnostic('hand over twice: ' + JSON.stringify(twice) + ', items ' + (await count(sid)) + ', by ' + (await entryOf(host, sid))?.by)
    const { sid: mine } = await yours('mgd17-mine')
    const back = await takeBack(host, mine)
    t.diagnostic('take back a session that is yours: ' + back.status + ' ' + back.text.slice(0, 120))
    assert.equal(await entryOf(host, mine), undefined, 'still yours')
  })

  it('MGD-18 at the queue bound only automated items are refused; your notes and a release still stand', MANAGED_STUB.long, async () => {
    const { sid: s1 } = await yours('mgd18-s1')
    assert.equal((await handOver(host, s1)).status, 200)
    const { sid: s2 } = await yours('mgd18-s2')
    await quietPushes(stub)
    await detachStub(booted)
    await setLimit(host, { maxQueuedInputs: QUEUE_BOUND })
    try {
      const sent = [tok('m1'), tok('m2')]
      for (const message of sent) assert.equal((await messageFishball(host, s1, { message })).json?.ok, true, 'queued under the bound')
      const third = await messageFishball(host, s1, { message: tok('m3') })
      assert.equal(third.json?.code, QUEUE_FULL, 'the third automated item is refused: ' + third.result.text)
      const note = tok('note')
      const h = await handOverWithNote(host, s2, note)
      assert.equal(h.status, 200, 'Hand over never fails for a full queue: ' + h.text)
      assert.equal((await entryOf(host, s2))?.by, MANAGED_BY.handOver)
      const b = await takeBack(host, s2)
      assert.equal(b.status, 200, 'Take back never fails for a full queue: ' + b.text)
      assert.equal(await entryOf(host, s2), undefined)
      // The stub acks nothing on the next connection, so the four items stay open and the bound stays full while the
      // instance releases s1: its `system` note is refused at the bound (logged), and the release still stands.
      await stub.ackPolicy(0)
      await reattach(booted)
      assert.ok(await until(async () => (await stub.pushes()).length > 0, STUB.waitMs, 100), 'delivery started')
      const rel = await release(stub, s1)
      assert.deepEqual(rel.payload, { sessionId: s1, managed: false }, JSON.stringify(rel))
      assert.equal(await entryOf(host, s1), undefined)
      // A new connection that acks everything gets every open item again, in arrival order, each once.
      await stub.ackPolicy(null)
      await detachStub(booted)
      await reattach(booted)
      await until(async () => (await stub.pushes()).length >= 4, STUB.waitMs, 100)
      await quietPushes(stub)
      const got = (await stub.pushes()).map((f) => f.payload)
      assert.deepEqual(got.map((p) => [p.kind, p.sourceSessionId]), [[KIND.session, s1], [KIND.session, s1], [KIND.user, s2], [KIND.user, s2]], 'four items in arrival order, each once, no release note: ' + JSON.stringify(got.map((p) => p.kind + ':' + p.text.slice(0, 60))))
      assert.ok(got[0].text.includes(sent[0]) && got[1].text.includes(sent[1]))
      assert.ok(got[2].text.includes(note), 'the hand-over note carries your note')
    } finally {
      await stub.ackPolicy(null)
      await setLimit(host, { maxQueuedInputs: QUEUE_DEFAULT })
    }
  })
})
