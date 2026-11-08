/**
 * Messaging and starting sessions over the bridge (H-STUB): the instance's session.message,
 * session.redirect, session.stop and session.start (contract §4.1, §3.3, §7; slim-native-design §5.2;
 * DESIGN §5d, §7a.12; docs/test-design/connector.md K1-P-14, K1-EP-52, K1-EP-53). The old P5 M6-M8
 * cases drove Fishball's in-process message_session / start_session tools; the stub now sends the
 * contract requests.
 *
 * | id     | technique | req | expected |
 * |--------|-----------|-----|----------|
 * | OUT-01 | EP (live idle managed target) | §4.1, DESIGN §5d | `{status:'delivered'}` and nothing else; one relay message naming Fishball's session with the text verbatim; the target runs a turn that reads it; the text is not in /api/fishball/state |
 * | OUT-02 | ST (cold managed target → resumed) | §5.2 "live or resumable" | delivered; the stored session becomes live with its own preset (header unchanged, fbtest-bare tool set) and runs |
 * | OUT-02b | EP (flush after the steer fails) | §4.1 "never retried" | `{status:'unconfirmed'}`; the message was steered once and the session has it once |
 * | OUT-03 ×4 | DT (target) | §4.1, §7 | unknown id → unknown-session; a session that is not managed → not-managed; Fishball's own session → is-fishball; an archived managed session → an error frame; nothing delivered |
 * | OUT-03b | BVA (empty message) | §4.1 "message may be empty" | an empty message is accepted and delivered |
 * | OUT-04 | EP (managed target whose preset cannot be resumed) | §7 | an error frame; nothing delivered |
 * | OUT-05 | EP (absolute existing folder) | §4.1, DESIGN §5d | `{sessionId, managed:true}`; one new session in that folder with DSH's default preset; managed (by start); its requests list message_fishball and not the removed outbound tools; the first message is a relay and the session runs; no workspace registered |
 * | OUT-06 | EP (workspace id) | §4.1 | the new session belongs to that workspace |
 * | OUT-06b | EP (workspace id, folder deleted) | §4.1 "never creates folders" | an error frame; the folder is not created; no session |
 * | OUT-07 ×6 | DT (folder) | §4.1, §3.1 | no folder key and '' break the exact-key / non-empty rules (the channel closes); a missing path, a file, a relative path and an unknown non-path value are refused with an error frame; nothing created, the folder never created |
 * | OUT-09 ×2 | DT (notifyWhenFinished on start / message) | §4.1 | the reply carries watchId (never watchError next to it); one watch notice (inbox kind watch) after the target's turn ends |
 * | OUT-10 | ST (running → stop → idle) | §4.1, DESIGN §7a.12 | `{stopped:true}`; the turn ends aborted; the session stays managed |
 * | OUT-10b | EP (stop on an idle managed session) | DESIGN §7a.12 "no-op" | `{stopped:true}` |
 * | OUT-11 | ST (running → redirect → new turn) | §4.1, DESIGN §7a.12 | `{status:'delivered'}`; the running turn ends aborted, the message arrives as a relay and runs as a new turn |
 * | OUT-12 ×2 | DT (redirect / stop × not managed) | §4.1 | not-managed; nothing sent, the session not stopped |
 * | K1-P-14 | ST (settled → repeat) | §3.3 | the identical request with the same requestId gets the same reply; the target has the message once |
 * | K1-EP-53 ×2 | DT (same id, other op / other payload) | §3.3 | conflict; the session is not stopped and gets no second message |
 * | K1-EP-52 | ST (running → repeat) | §3.3 | the second frame of a session.start still running gets duplicate-request; one session is created |
 * | K1-EP-52b | ST (running → repeat) | §3.3 "one requestId has one terminal reply" | the original request still gets a `response` with the created sessionId (any order relative to the repeat's duplicate-request) |
 * | OUT-13 ×6 | BVA + EP (maxMessageBytes: at the bound / one byte over, ASCII and 2-byte; session.message and session.start) | contract §4.1, §8 | at 65,536 bytes: delivered / started and relayed; at 65,537: limit-exceeded, nothing delivered or created |
 * | OUT-CAP | EP | slim §12, conn-OQ-20 | /api/fishball/state limits have no messagesPerHour or sessionsPerHour |
 *
 * Retired:
 * - OUT-03 empty / whitespace message: contract §4.1 allows an empty message (OUT-03b).
 * - The old reading that maxMessageBytes does not bound a bridge message: contract 1.1 §4.1 and §8 name it
 *   for session.start and session.message; OUT-13 checks the bound (65,536 accepted, 65,537 refused).
 * - OUT-08: the outbox went with Fishball's outbound tools (slim §12); /api/fishball/state has no outbox.
 * - CAP-01..CAP-06: messagesPerHour / sessionsPerHour / the outbox bounds went with the in-process agent (slim §12, conn-OQ-20); OUT-CAP checks they are gone.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { before, describe, it } from 'node:test'
import { DELIVERY } from 'fishball-connector/contract'
import { INBOUND_TOOL, LIMITS, OUTBOUND_TOOLS, PRESET, RELAY } from './support/constants.mjs'
import { HOOK, T, toolNames } from './support/expect.mjs'
import { ENVELOPE, STUB, handOver, userSession } from './support/instance-stub.mjs'
import { ERROR, G, OPERATION, assertError, assertNothingStarted, assertOnlyKeys, assertRelayedOnce, assertStarted, responseOf, sendTwice, tok, useStubHost, watchNoticesSettled } from './support/instance-stub-start.mjs'
import { until } from './support/util.mjs'

const ANY_ERROR = Object.values(ERROR)
/** The removed outbound tools must not reach a started session's model. */
const REMOVED_TOOLS = OUTBOUND_TOOLS

describe('bridge session.message, redirect, stop and start', () => {
  const w = useStubHost('g-out')
  let target
  let fishball
  const requestsWith = (needle) => w.host.call('requestsContaining', { needle })
  const ranTurn = (sessionId, needle) => until(async () => (await requestsWith(needle)).some((r) => r.sessionId === sessionId), G.settleMs, 100)
  /** A turn held at its model request, so stop / redirect find it running. */
  const running = async (sessionId) => {
    await w.host.call('holdNext', { sessionId })
    await w.host.call('driveStart', { sessionId, text: tok('busy') })
    assert.ok(await until(() => w.host.call('isHeld', { sessionId }), G.settleMs, 50), 'precondition: a turn is running')
  }
  const turnEnds = (sessionId) => w.host.call('turnEnds', { sessionId })

  before(async () => {
    target = await w.managedSession('out-target')
    fishball = (await w.state()).sessionId
  }, HOOK)

  it('OUT-01 session.message delivers one relay message and the target runs', T, async () => {
    const text = tok('out01') + ' please do X'
    const json = responseOf(await w.message(target, text))
    assert.deepEqual(json, { status: DELIVERY.delivered })
    assert.ok(await ranTurn(target, text), 'the target ran a turn that read it')
    await assertRelayedOnce(w, target, text)
    assert.equal(JSON.stringify(await w.state()).includes(text), false, 'no message text in the state')
  })

  /** A stored managed session with no live agent (seeded, then handed over). */
  const coldManaged = async (id, agentPreset = PRESET.bare) => {
    await w.host.call('seedBlankSession', { sessionId: id, cwd: path.join(w.home, 'work', id), agentPreset })
    assert.equal((await handOver(w.host, id)).status, 200)
    return id
  }

  it('OUT-02 a cold managed target is resumed with its own preset and runs', T, async () => {
    const id = await coldManaged('session-fbtest-cold-out02')
    assert.equal(await w.host.call('agentStatus', { sessionId: id }), null, 'precondition: not live')
    const text = tok('out02')
    assert.equal(responseOf(await w.message(id, text)).status, DELIVERY.delivered)
    assert.ok(await ranTurn(id, text), 'it ran a turn')
    assert.equal((await w.host.call('header', { sessionId: id })).agentPreset, PRESET.bare)
    const req = (await w.host.call('requests', { sessionId: id })).at(-1)
    assert.equal(toolNames(req).includes('read'), false, 'fbtest-bare tool set, not the standard preset')
    assert.ok(toolNames(req).includes(INBOUND_TOOL))
  })

  it('OUT-02b a flush that cannot be confirmed answers unconfirmed, and the message is not sent again', T, async () => {
    const text = tok('out02b')
    // startProbe wraps only agents created while it is armed: a cold target is resumed (a new agent) inside it.
    const sid = await coldManaged('session-fbtest-cold-out02b')
    await w.host.call('startProbe', { flush: G.probe.flushThrow })
    let reply
    let events
    try {
      reply = await w.message(sid, text)
      events = await w.host.call('probeEvents')
    } finally { await w.host.call('stopProbe') }
    assert.deepEqual(responseOf(reply), { status: DELIVERY.unconfirmed })
    assert.equal(events.filter((e) => e.type === 'steer' && e.sessionId === sid).length, 1, 'steered once')
    await assertRelayedOnce(w, sid, text)
  })

  describe('OUT-03 session.message refusals', () => {
    let archivedId
    let unmanaged
    before(async () => {
      unmanaged = await userSession(w.host, 'out-unmanaged')
      archivedId = await w.managedSession('out-archived')
      assert.equal((await w.host.call('archive', { sessionId: archivedId, stopActivity: true })).ok, true)
    }, HOOK)
    const rows = [
      ['an unknown id', () => 'session-fbtest-no-such', [ERROR.unknownSession]],
      ['a session that is not managed', () => unmanaged, [ERROR.notManaged]],
      ["Fishball's own session", () => fishball, [ERROR.isFishball]],
      // DESIGN §5d: an archived target is refused; contract §7 names no archived frame code.
      ['an archived managed session', () => archivedId, ANY_ERROR],
    ]
    for (const [label, id, codes] of rows) {
      it(label + ' → ' + (codes === ANY_ERROR ? 'an error frame' : codes.join('|')) + ', nothing delivered', T, async () => {
        const text = tok('out03')
        assertError(await w.message(id(), text), codes)
        await new Promise((resolve) => setTimeout(resolve, G.quietMs))
        assert.deepEqual((await w.received(id(), text)) ?? [], [])
      })
    }
  })

  it('OUT-03b an empty message is accepted (title and message may be empty)', T, async () => {
    assert.equal(responseOf(await w.message(target, '')).status, DELIVERY.delivered)
  })

  it('OUT-04 a managed target that cannot be resumed is refused with an error frame', T, async () => {
    const id = await coldManaged('session-fbtest-badpreset-out04', G.noSuchPreset)
    const text = tok('out04')
    assertError(await w.message(id, text), ANY_ERROR)
    assert.equal((await requestsWith(text)).length, 0, 'nothing ran')
  })

  it('OUT-05 session.start creates one managed session in the folder and gives it the first message', T, async () => {
    const folder = w.folder('start-here')
    const workspacesBefore = (await w.host.call('workspaces')).list.length
    const sessionsBefore = await w.sessionIds()
    const marker = tok('out05')
    await w.host.call('queueMarker', { marker, script: [[{ text: 'started and working' }]] })
    const answer = await w.start({ folder, message: marker + ' build it' })
    const json = await assertStarted(w, answer)
    assert.deepEqual((await w.sessionIds()).filter((s) => !sessionsBefore.includes(s)), [json.sessionId], 'exactly one new session')
    assert.equal((await w.host.call('header', { sessionId: json.sessionId })).agentPreset, await w.host.call('defaultPreset'), "DSH's default preset")
    assert.ok(await until(async () => (await w.host.call('markerState', { marker })).left === 0, G.settleMs, 100), 'the new session ran a turn')
    for (const r of await w.host.call('requests', { sessionId: json.sessionId })) {
      assert.ok(toolNames(r).includes(INBOUND_TOOL), 'a managed session has message_fishball')
      for (const n of REMOVED_TOOLS) assert.equal(toolNames(r).includes(n), false, n)
    }
    assert.equal((await w.host.call('workspaces')).list.length, workspacesBefore, 'no workspace registered')
  })

  it('OUT-06 session.start with a workspace id starts the session in that workspace', T, async () => {
    const ws = await w.host.call('createWorkspace', { dir: path.join(w.home, 'work', 'ws-start') })
    const json = await assertStarted(w, await w.start({ folder: ws.id }), { cwd: ws.path })
    assert.ok((await w.host.call('workspaces')).list.find((x) => x.id === ws.id).sessionIds.includes(json.sessionId))
  })

  it('OUT-06b a workspace whose folder was deleted is refused and the folder is not created', T, async () => {
    const dir = path.join(w.home, 'work', 'ws-deleted')
    const ws = await w.host.call('createWorkspace', { dir })
    fs.rmdirSync(dir)
    const sessions = await w.sessionIds()
    assertError(await w.start({ folder: ws.id }), [ERROR.unknownSession])
    assert.equal(fs.existsSync(dir), false, 'the folder is not created')
    assert.deepEqual(await w.sessionIds(), sessions)
  })

  describe('OUT-07 session.start folder refusals', () => {
    // closes: the payload breaks the exact-key or non-empty rule (contract §3.1, §4.1), so the frame
    // fails validation and the channel closes; otherwise the connector answers an error frame.
    // Contract §4.1's codes: a folder that is neither a workspace id nor an absolute path is forbidden;
    // an absolute path that is not an existing directory is unknown-session. A shape break closes (§3.1).
    const rows = [
      ['no folder key', () => undefined, true],
      ['an empty folder', () => '', true],
      ['an absolute path that does not exist', () => w.missing(), false, ERROR.unknownSession],
      ['an absolute path that is a file', () => path.join(w.home, 'fbtest.overlay.yml'), false, ERROR.unknownSession],
      ['a relative path', () => 'work/start-here', false, ERROR.forbidden],
      ['an unknown non-path value', () => G.notAWorkspace, false, ERROR.forbidden],
    ]
    for (const [label, folder, closes, code] of rows) {
      it(label + ' → ' + (closes ? 'the channel closes' : 'an error frame ' + code), T, async () => {
        const sessions = await w.sessionIds()
        const answer = await w.start({ folder: folder() })
        if (closes) assert.equal(answer.type, 'none', 'no reply: ' + JSON.stringify(answer))
        else assertError(answer, [code])
        await assertNothingStarted(w, sessions)
      })
    }
  })

  describe('OUT-09 notifyWhenFinished sets the watch and reports the turn once', () => {
    const rows = [
      ['on session.start', async () => { const a = await w.start({ notifyWhenFinished: true }); return responseOf(a) }],
      ['on session.message', async () => responseOf(await w.message(target, tok('out09'), { notifyWhenFinished: true }))],
    ]
    for (const [label, send] of rows) {
      it(label, T, async () => {
        const json = await send()
        assert.equal(typeof json.watchId, 'string', JSON.stringify(json))
        assert.equal('watchError' in json, false)
        assertOnlyKeys(json, [...G.startKeys, ...G.messageKeys])
        const notices = await watchNoticesSettled(w, json.watchId, 1)
        assert.equal(notices.length, 1, 'one notice after the turn')
        assert.ok(notices[0].text.includes(G.watchFinished))
      })
    }
  })

  it('OUT-10 session.stop ends the running turn; the session stays managed', T, async () => {
    const sid = await w.managedSession('out-stop')
    await running(sid)
    assert.deepEqual(responseOf(await w.stop(sid, { reason: 'enough' })), { stopped: true })
    await w.host.call('releaseHold', { sessionId: sid })
    assert.ok(await until(async () => (await turnEnds(sid)).at(-1) === G.aborted, G.settleMs, 50), 'the turn ends aborted: ' + JSON.stringify(await turnEnds(sid)))
    assert.ok(await w.managedEntry(sid), 'still managed')
  })

  it('OUT-10b session.stop on an idle managed session answers stopped', T, async () => {
    assert.deepEqual(responseOf(await w.stop(target)), { stopped: true })
  })

  it('OUT-11 session.redirect stops the running turn and sends the message as a new turn', T, async () => {
    const sid = await w.managedSession('out-redirect')
    await running(sid)
    const text = tok('out11') + ' do this instead'
    assert.deepEqual(responseOf(await w.redirect(sid, text)), { status: DELIVERY.delivered })
    await w.host.call('releaseHold', { sessionId: sid })
    assert.ok(await ranTurn(sid, text), 'the instruction ran as a new turn')
    assert.ok((await turnEnds(sid)).includes(G.aborted), 'the running turn was aborted')
    await assertRelayedOnce(w, sid, text, { via: 'redirect' })
  })

  describe('OUT-12 redirect and stop refuse a session that is not managed', () => {
    let unmanaged
    before(async () => { unmanaged = await userSession(w.host, 'out-12') }, HOOK)
    it('session.redirect → not-managed, nothing sent', T, async () => {
      const text = tok('out12')
      assertError(await w.redirect(unmanaged, text), [ERROR.notManaged])
      assert.deepEqual((await w.received(unmanaged, text)) ?? [], [])
    })
    it('session.stop → not-managed', T, async () => {
      const ends = await turnEnds(unmanaged)
      assertError(await w.stop(unmanaged), [ERROR.notManaged])
      assert.deepEqual(await turnEnds(unmanaged), ends)
    })
  })

  describe('K1-P-14 / K1-EP-53 one requestId has one terminal reply', () => {
    const requestId = tok('r1')
    const once = tok('once')
    let first
    it('K1-P-14 a settled repeat gets the remembered reply and is not delivered twice', T, async () => {
      first = await w.message(target, once, {}, { requestId })
      const again = await w.message(target, once, {}, { requestId })
      assert.equal(first.type, 'response')
      assert.deepEqual(again, first)
      await assertRelayedOnce(w, target, once)
    })
    it('K1-EP-53 the same id for session.stop → conflict; the session is not stopped', T, async () => {
      assert.ok(first, 'precondition: K1-P-14 ran')
      const ends = await turnEnds(target)
      assertError(await w.stop(target, {}, { requestId }), [ERROR.conflict])
      assert.deepEqual(await turnEnds(target), ends)
    })
    it('K1-EP-53 the same id for session.message with another text → conflict; no second message', T, async () => {
      const other = tok('other')
      assertError(await w.message(target, other, {}, { requestId }), [ERROR.conflict])
      await new Promise((resolve) => setTimeout(resolve, G.quietMs))
      assert.deepEqual(await w.received(target, other), [])
      await assertRelayedOnce(w, target, once)
    })
  })

  it('K1-EP-52 a repeat of a session.start still running gets duplicate-request; one session is created', T, async (t) => {
    const sessions = await w.sessionIds()
    const message = tok('k1ep52')
    const payload = { folder: w.folder('dup'), title: G.title, message, attachments: [] }
    const { requestId, replies } = await sendTwice(w, OPERATION.sessionStart, payload)
    assert.deepEqual(replies.filter((r) => r.type === 'error').map((r) => r.payload), [{ code: ERROR.duplicate }], 'the repeat: ' + JSON.stringify(replies))
    const created = (await w.sessionIds()).filter((s) => !sessions.includes(s))
    assert.equal(created.length, 1, 'one session')
    await assertRelayedOnce(w, created[0], message)
    // The first request's own response is K1-EP-52b's assertion.
    t.diagnostic('replies for the requestId while running: ' + replies.map((r) => r.type).join(', '))
    // §3.3: once settled, the same request gets the remembered reply, never a second start.
    const settled = await w.op(OPERATION.sessionStart, payload, null, { requestId })
    assert.equal(responseOf(settled).sessionId, created[0], 'the remembered reply names the one session: ' + JSON.stringify(settled))
    assert.deepEqual((await w.sessionIds()).filter((s) => !sessions.includes(s)), created, 'still one session')
    await assertRelayedOnce(w, created[0], message)
  })

  it('K1-EP-52b the original of a repeated session.start still gets its own response with the created sessionId', T, async () => {
    const sessions = await w.sessionIds()
    const { requestId } = await sendTwice(w, OPERATION.sessionStart, { folder: w.folder('dup-b'), title: G.title, message: tok('k1ep52b'), attachments: [] })
    // §3.3 "one requestId has one terminal reply": the repeat's duplicate-request must not take the
    // place of the original's reply, which succeeded. Any order relative to that error is accepted.
    const responseFor = async () => (await w.stub.received()).find((f) => f.requestId === requestId && f.type === ENVELOPE.type.response)
    const response = await until(responseFor, STUB.replyTimeoutMs, STUB.pollMs)
    const created = (await w.sessionIds()).filter((s) => !sessions.includes(s))
    assert.equal(created.length, 1, 'one session')
    assert.ok(response, 'a response for ' + requestId + '; received only: ' + JSON.stringify((await w.stub.received()).filter((f) => f.requestId === requestId).map((f) => [f.type, f.payload])))
    assert.equal(response.payload.sessionId, created[0])
  })

  describe('OUT-13 a message body at maxMessageBytes (65,536 bytes)', () => {
    const MAX = LIMITS.maxMessageBytes.default
    /** A body of exactly n UTF-8 bytes, starting with the marker so a case can find it. */
    const body = (marker, n, unit = 'a') => {
      const fill = n - Buffer.byteLength(marker)
      const text = marker + (unit === 'a' ? 'a'.repeat(fill) : 'é'.repeat(Math.floor(fill / 2)) + (fill % 2 === 1 ? 'a' : ''))
      assert.equal(Buffer.byteLength(text), n, 'precondition: exactly ' + n + ' bytes')
      return text
    }
    /** Nothing with this marker reached the target after a quiet period. */
    const notDelivered = async (sid, marker) => {
      await new Promise((resolve) => setTimeout(resolve, G.quietMs))
      assert.deepEqual((await w.received(sid, marker)) ?? [], [], 'not delivered')
    }
    /** The worker summarizes a user message to its first 12,000 characters, so a 64 KiB body is checked by
     * length, that prefix and the source (assertRelayedOnce compares the whole text and cannot find it). */
    const SUMMARY_CHARS = 12000
    const assertWholeRelay = async (sessionId, text) => {
      const head = text.slice(0, SUMMARY_CHARS)
      const found = await until(async () => {
        const all = (await w.host.call('userMessages', { sessionId })) ?? []
        const mine = all.filter((m) => m.textLength === text.length && m.text === head)
        return mine.length ? mine : false
      }, G.settleMs, STUB.pollMs)
      assert.ok(found, 'the whole message reached ' + sessionId)
      assert.equal(found.length, 1, 'exactly one copy')
      assert.deepEqual(found[0].source, { ...RELAY, senderSessionId: (await w.state()).sessionId, via: 'message' })
    }
    let sid
    before(async () => { sid = await w.managedSession('out13-target') }, HOOK)

    it('session.message at the bound is delivered whole (ASCII)', T, async () => {
      const text = body(tok('out13a'), MAX)
      assert.deepEqual(responseOf(await w.message(sid, text)), { status: DELIVERY.delivered })
      await assertWholeRelay(sid, text)
    })

    it('session.message one byte over is refused limit-exceeded and nothing is delivered', T, async () => {
      const marker = tok('out13b')
      assertError(await w.message(sid, body(marker, MAX + 1)), [ERROR.limit])
      await notDelivered(sid, marker)
    })

    it('session.message at the bound counts bytes, not characters (2-byte text)', T, async () => {
      const text = body(tok('out13c'), MAX, 'é')
      assert.deepEqual(responseOf(await w.message(sid, text)), { status: DELIVERY.delivered })
      await assertWholeRelay(sid, text)
    })

    it('session.message one byte over with 2-byte text is refused and nothing is delivered', T, async () => {
      const marker = tok('out13d')
      assertError(await w.message(sid, body(marker, MAX + 1, 'é')), [ERROR.limit])
      await notDelivered(sid, marker)
    })

    it('session.start at the bound starts the session and delivers its first message whole', T, async () => {
      const text = body(tok('out13e'), MAX)
      const json = await assertStarted(w, await w.start({ folder: w.folder('out13-start-ok'), message: text, title: 'size ' + tok('s') }), { relay: false })
      assert.equal(typeof json.sessionId, 'string')
      await assertWholeRelay(json.sessionId, text)
    })

    it('session.start one byte over is refused limit-exceeded and creates nothing', T, async () => {
      const sessions = await w.sessionIds()
      assertError(await w.start({ folder: w.folder('out13-start-bad'), message: body(tok('out13f'), MAX + 1) }), [ERROR.limit])
      await assertNothingStarted(w, sessions)
    })
  })

  it('OUT-CAP the hourly caps are gone from the connector limits', T, async () => {
    const limits = (await w.state()).limits
    for (const removed of G.removedCaps) assert.equal(Object.hasOwn(limits, removed), false, removed)
  })
})
