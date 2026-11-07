/**
 * start_session keeps a session DSH created but could not add to the workspace (DESIGN 5d "Created but not added to
 * the workspace", Q-start-half-made; requirement 2 of the fix).
 *
 * Why: for a folder that is a registered DSH workspace, DSH's create makes the session and then adds it to the
 * workspace. When only the second step fails it throws `session/workspace-attach-failed` with
 * `details {sessionId, workspaceId}`; the session exists (DSH shows it under Ungrouped). start_session used to forget it.
 *
 * Fault injection (support/worker.mjs): `failAttach` makes one workspace's attachSession throw, so DSH's own create
 * really creates the session and throws its real error. `failCreate` replaces sessionController.create with one that
 * throws a given code and details (optionally after really creating the session), for the failures that must NOT be
 * treated as a half-made session. The startProbe of messaging-start-title records rename, steer and flush and can make
 * them fail. Every expected value below comes from the requirement; "the same as a normal start in that workspace" is
 * checked against a normal start made in the same host (the reference), not against a literal.
 *
 * Host A: DSH's session-title service present, no cap. Host B: sessionsPerHour 2. Host C: no sessionTitle service.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | HM-00   | EP (control) | a normal start in a workspace (id, path) puts the session in it and has no workspaceError |
 * | HM-01 ×2 | EP (folder form: workspace id, path of the workspace) | ok; sessionId; folder and keys as a normal start plus workspaceError 'workspace-attach-failed'; one failed attach for this session; the session exists, in no workspace; renamed once before the one steer (relay from Fishball); first message delivered once; outbox `start`, delivered, targetSessionId; it runs its first turn; DSH reports the title |
 * | HM-02 ×2 | DT (rename invalid / fails) | ok with titleError title-invalid / title-failed, no title key, workspaceError; delivered and recorded |
 * | HM-03 ×2 | DT (notify_when_finished set / not set) | the watch (createdBy assistant) and one notice after the first turn; none without the flag; workspaceError either way |
 * | HM-04   | ST (half-made start → read_session, watch_session) | the session is related: read_session ok with the first message; watch_session ok |
 * | HM-05 ×2 | EP (flush rejects / answers false) | ok, unconfirmed true, workspaceError, title; steered once; outbox unconfirmed |
 * | HM-06 ×3 | DT (steer throws × rename ok / invalid / fails) | delivery-failed with sessionId, the title outcome, workspaceError, no folder; keys as a normal failed delivery plus workspaceError; outbox failed with errorCode |
 * | HM-07 ×2 | DT (attach-failed error with only a string sessionId, or with extra details) | carries on as for a real attach failure |
 * | HM-08   | EP (controls) | no workspaceError on a normal start in a workspace, a start in a plain folder, or a normal failed delivery |
 * | HM-10 ×9 | DT (create fails: other code, near-miss codes, attach code without a string details.sessionId, no code) | `{ok:false, code:'delivery-failed'}`; nothing recorded; no first message to a session created anyway; not counted (cap 2) |
 * | HM-11   | ST (cap 2: after HM-10) | a half-made start succeeds: none of HM-10 counted |
 * | HM-12   | ST (cap 2) | a half-made start whose delivery fails is refused delivery-failed with workspaceError |
 * | HM-13 ×2 | ST (cap 2 spent by HM-11, HM-12) | the next start (normal, and half-made) is refused hourly-cap, creating nothing: both half-made starts counted |
 * | HM-30   | EP (no sessionTitle service) | ok, titleError title-unavailable, workspaceError, delivered and recorded |
 * | HM-31   | EP (no service, steer throws) | delivery-failed with sessionId, titleError title-unavailable, workspaceError, no folder |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { before, describe, it } from 'node:test'
import { HALF_MADE, P5_CODE, RELAY, TITLE, NEEDS_INSTANCE_STUB } from './support/constants.mjs'
import { HOOK, T, fishballCall, noticesSettled, outboxNow, untrustedBlock, watchesOn } from './support/expect.mjs'
import { until } from './support/host.mjs'
import { assertDelivered, assertFailedDelivery, assertRenamedBeforeSteer, eventsOf, orderOf, tok, useHost } from './support/start-session.mjs'

/** A workspace registered in the host, and a switch that makes adding a session to it fail (DSH's real create then throws). */
function useWorkspace(w, name) {
  const ws = { id: null, path: null }
  before(async () => { Object.assign(ws, await w.host.call('createWorkspace', { dir: path.join(w.home, 'work', name) })) }, HOOK)
  ws.failing = (on) => w.host.call('failAttach', { workspaceId: ws.id, on })
  /** The folder argument in each form the requirement names. */
  ws.folders = { 'a workspace id': () => ws.id, 'the path of a workspace': () => ws.path }
  return ws
}

/** start_session while adding the new session to `ws` fails; also returns the failing attaches DSH's create made. */
async function halfMade(w, ws, args = {}, probe = null) {
  const seen = (await w.host.call('attachCalls')).length
  await ws.failing(true)
  let answer
  try { answer = await w.start({ folder: ws.id, ...args }, probe) } finally { await ws.failing(false) }
  return { ...answer, attaches: (await w.host.call('attachCalls')).slice(seen) }
}

/** The session exists, lives in the workspace's folder, and is in no workspace (DSH lists it under Ungrouped). */
async function assertUngrouped(w, ws, sessionId) {
  assert.ok((await w.host.call('allSessions')).some((s) => s.id === sessionId), 'the session exists')
  assert.equal((await w.host.call('workspaces')).list.some((x) => x.sessionIds.includes(sessionId)), false, 'in no workspace')
  const header = await w.host.call('header', { sessionId })
  assert.equal(fs.realpathSync(header.cwd), fs.realpathSync(ws.path), "in the workspace's folder")
}

/** The failing attach DSH's create made is the one the requirement describes: one attempt, this session, this workspace. */
const assertOneFailedAttach = (answer, ws) => assert.deepEqual(answer.attaches, [{ workspaceId: ws.id, sessionId: answer.json.sessionId }], 'DSH created the session and failed only to add it')

/** An ok answer for a half-made start: the folder and fields of the same start made whole (the reference), plus workspaceError, and nothing else. */
function assertHalfMadeAnswer(answer, ws, normal) {
  const { json } = answer
  assert.equal(json?.ok, true, JSON.stringify(json))
  assert.equal(json.workspaceError, HALF_MADE.workspaceError)
  assert.equal(typeof json.sessionId, 'string')
  assert.equal(json.folder, normal.json.folder, 'the same folder a normal start reports')
  assert.deepEqual(Object.keys(json).sort(), [...Object.keys(normal.json), 'workspaceError'].sort())
  assertOneFailedAttach(answer, ws)
}

describe('start_session keeps a half-made session (DSH session-title service present)', { skip: NEEDS_INSTANCE_STUB }, () => {
  const w = useHost('hm-main', { limits: { sessionsPerHour: 0 } })
  const ws = useWorkspace(w, 'hm-ws')
  /** A normal start in the workspace, per folder form: the reference for what a start reports and leaves. */
  const references = new Map()
  const reference = async (form) => {
    if (!references.has(form)) references.set(form, await w.start({ folder: ws.folders[form](), message: tok('hm00') }))
    return references.get(form)
  }

  describe('HM-00 control: a normal start in a registered workspace', () => {
    for (const form of ['a workspace id', 'the path of a workspace']) {
      it(form, T, async () => {
        const normal = await reference(form)
        assert.equal(normal.json?.ok, true, JSON.stringify(normal.json))
        assert.equal('workspaceError' in normal.json, false, 'no workspaceError on a normal start')
        const joined = (await w.host.call('workspaces')).list.find((x) => x.id === ws.id)
        assert.ok(joined.sessionIds.includes(normal.json.sessionId), 'precondition: this folder form puts the session in the workspace')
      })
    }
  })

  describe('HM-01 the session is named, given its first message, recorded, and reported', () => {
    for (const form of ['a workspace id', 'the path of a workspace']) {
      it(form, T, async () => {
        const normal = await reference(form)
        const marker = tok('hm01')
        await w.host.call('queueMarker', { marker, except: w.fb, script: [[{ text: 'half-made session at work' }]] })
        const title = 'Half made ' + form
        const answer = await halfMade(w, ws, { folder: ws.folders[form](), message: marker, title }, {})
        assertHalfMadeAnswer(answer, ws, normal)
        const { json, events } = answer
        assert.equal(json.title, title)
        assert.equal('titleError' in json, false)
        assert.equal('watch' in json, false)
        await assertUngrouped(w, ws, json.sessionId)
        assertRenamedBeforeSteer(events, json.sessionId)
        assert.equal(eventsOf(events, json.sessionId, 'rename')[0].title, title, 'the title exactly as given')
        assert.equal(orderOf(events, json.sessionId).filter((t) => t === 'steer').length, 1, 'the first message is steered once')
        assert.deepEqual(eventsOf(events, json.sessionId, 'steer')[0].source, { ...RELAY, senderSessionId: w.fb })
        await assertDelivered(w, answer, 'delivered', normal.json.folder)
        assert.ok(await until(async () => (await w.host.call('markerState', { marker })).left === 0, 10000, 100), 'the new session ran its first turn')
        assert.equal(await w.titleOf(json.sessionId), title, 'DSH reports the title')
        assert.equal((await watchesOn(w.host, json.sessionId)).length, 0)
      })
    }
  })

  describe('HM-02 naming problems still do not stop the session', () => {
    // rename throws the real SessionTitleInvalidError ('invalid') or a plain Error ('fail').
    for (const [mode, code] of [['invalid', TITLE.invalid], ['fail', TITLE.failed]]) {
      it('rename throws (' + mode + ') → ' + code, T, async () => {
        const normal = await reference('a workspace id')
        const answer = await halfMade(w, ws, {}, { rename: mode })
        const { json } = answer
        assert.equal(json?.ok, true, JSON.stringify(json))
        assert.equal(json.workspaceError, HALF_MADE.workspaceError)
        assert.equal(json.titleError, code)
        assert.equal('title' in json, false, 'no title key next to titleError')
        assert.equal(json.folder, normal.json.folder)
        assertOneFailedAttach(answer, ws)
        assertRenamedBeforeSteer(answer.events, json.sessionId)
        await assertDelivered(w, answer, 'delivered', normal.json.folder)
      })
    }
  })

  describe('HM-03 the watch from notify_when_finished', () => {
    for (const notify of [true, false]) {
      it(notify ? 'notify_when_finished: a watch on the new session and one notice after its first turn' : 'no flag: no watch', T, async () => {
        const answer = await halfMade(w, ws, notify ? { notify_when_finished: true } : {})
        const { json } = answer
        assert.equal(json?.ok, true, JSON.stringify(json))
        assert.equal(json.workspaceError, HALF_MADE.workspaceError)
        if (notify) {
          assert.equal(json.watch?.targetSessionId, json.sessionId, 'a watch on the new session: ' + JSON.stringify(json))
          assert.deepEqual(json.watch.createdBy, { kind: 'assistant' })
          assert.equal('watchError' in json, false)
          assert.equal((await noticesSettled(w.host, w.fb, json.watch.id, 1)).length, 1, 'one notice after its first turn')
        } else {
          assert.equal('watch' in json, false)
          assert.equal((await watchesOn(w.host, json.sessionId)).length, 0)
        }
      })
    }
  })

  it('HM-04 the session counts as related afterwards: read_session and watch_session work on it', T, async () => {
    const answer = await halfMade(w, ws)
    const { json, call } = answer
    assert.equal(json?.ok, true, JSON.stringify(json))
    const read = (await fishballCall(w.host, w.fb, 'read_session', { session_id: json.sessionId })).json
    assert.equal(read?.ok, true, JSON.stringify(read))
    const block = untrustedBlock(read.session)
    assert.equal(block.fields.session_id, json.sessionId)
    assert.ok(block.fields.messages.some((m) => m.text === call.message), 'it reads the first message')
    const watch = (await fishballCall(w.host, w.fb, 'watch_session', { session_id: json.sessionId })).json
    assert.equal(watch?.ok, true, JSON.stringify(watch))
    assert.equal(watch.watch.targetSessionId, json.sessionId)
  })

  describe('HM-05 a flush that cannot be confirmed still answers ok, unconfirmed', () => {
    for (const [id, flush] of [['HM-05', 'throw'], ['HM-05b', 'false']]) {
      it(id + ' the flush ' + (flush === 'throw' ? 'rejects' : 'answers false'), T, async () => {
        // The same unconfirmed start made whole is the reference for the answer's fields (unconfirmed, and the note that comes with it).
        const normal = await w.start({ folder: ws.id }, { flush })
        assert.equal(normal.json?.unconfirmed, true, JSON.stringify(normal.json))
        const answer = await halfMade(w, ws, {}, { flush })
        const { json, call, events } = answer
        assertHalfMadeAnswer(answer, ws, normal)
        assert.equal(json.unconfirmed, true)
        assert.equal(json.title, call.title)
        assert.equal(eventsOf(events, json.sessionId, 'steer').length, 1, 'steered once, so never delivered twice')
        await assertDelivered(w, answer, 'unconfirmed', normal.json.folder)
      })
    }
  })

  describe('HM-06 a failed delivery is refused delivery-failed, with the half-made marker', () => {
    // Decision table: rename outcome (ok, real SessionTitleInvalidError, plain Error) with the steer throwing.
    const rows = [['named', null, null], ['title-invalid', 'invalid', TITLE.invalid], ['title-failed', 'fail', TITLE.failed]]
    for (const [label, rename, titleError] of rows) {
      it(label, T, async () => {
        // The same failed delivery with no attach failure is the reference for the refusal's fields.
        const normal = await w.start({ folder: ws.id }, { rename, steer: true })
        await assertFailedDelivery(w, normal, titleError)
        assert.equal('workspaceError' in normal.json, false, 'a normal failed delivery has no workspaceError')
        const answer = await halfMade(w, ws, {}, { rename, steer: true })
        await assertFailedDelivery(w, answer, titleError)
        assert.equal(answer.json.workspaceError, HALF_MADE.workspaceError)
        assert.deepEqual(Object.keys(answer.json).sort(), [...Object.keys(normal.json), 'workspaceError'].sort())
        assertOneFailedAttach(answer, ws)
        assertRenamedBeforeSteer(answer.events, answer.json.sessionId)
        assert.equal((await w.outboxFor(answer.json.sessionId)).targetSessionId, answer.json.sessionId)
      })
    }
  })

  describe('HM-07 the error is recognized by its code and a string details.sessionId, nothing else', () => {
    // The wrapper really creates the session through DSH's create, then throws the error with these details.
    const rows = [
      ['details with only the sessionId', {}],
      ['details with more fields than DSH gives', { workspaceId: 'fbtest-other-workspace', extra: 1, nested: { a: [1] } }],
    ]
    for (const [label, details] of rows) {
      it(label, T, async () => {
        await w.host.call('failCreate', { code: HALF_MADE.dshCode, details, createFirst: true })
        let answer
        try { answer = await w.start({ folder: w.folder('hm07') }, {}) } finally { await w.host.call('failCreate', {}) }
        const { json, call } = answer
        assert.equal(json?.ok, true, JSON.stringify(json))
        assert.equal(json.workspaceError, HALF_MADE.workspaceError)
        assert.equal(json.folder, call.folder)
        assert.equal(json.title, call.title)
        assertRenamedBeforeSteer(answer.events, json.sessionId)
        await assertDelivered(w, answer)
      })
    }
  })

  it('HM-08 a start that was whole carries no workspaceError: a workspace, a plain folder, a normal failed delivery', T, async () => {
    for (const form of ['a workspace id', 'the path of a workspace']) assert.equal('workspaceError' in (await reference(form)).json, false, form)
    const attaches = (await w.host.call('attachCalls')).length
    const plain = await w.start({ folder: w.folder('hm08') })
    assert.equal(plain.json?.ok, true, JSON.stringify(plain.json))
    assert.equal('workspaceError' in plain.json, false, 'a plain folder')
    const failed = await w.start({ folder: w.folder('hm08-failed') }, { steer: true })
    assert.equal(failed.json?.ok, false)
    assert.equal('workspaceError' in failed.json, false, 'a normal failed delivery')
    assert.equal((await w.host.call('attachCalls')).length, attaches, 'no attach failed in these')
  })
})

describe('start_session: other failures of create, and the hourly cap (sessionsPerHour 2)', { skip: NEEDS_INSTANCE_STUB }, () => {
  const w = useHost('hm-cap', { limits: { sessionsPerHour: 2 } })
  const ws = useWorkspace(w, 'hm-cap-ws')

  describe('HM-10 create fails, but not as a half-made session: refused delivery-failed, nothing recorded, not counted', () => {
    const ATTACH = HALF_MADE.dshCode
    // createFirst: the wrapper really creates the session first and puts its id in the details, so Fishball is told of a
    // session that exists; only a recognized error may make it carry on.
    const rows = [
      ['a different code', { code: 'session/fbtest-other', details: { workspaceId: 'w' }, createFirst: true }],
      ['the attach code in upper case', { code: ATTACH.toUpperCase(), createFirst: true }],
      ['the attach code with a suffix', { code: ATTACH + '-x', createFirst: true }],
      ['the attach code with no details', { code: ATTACH }],
      ['the attach code, details without a sessionId', { code: ATTACH, details: { workspaceId: 'w' } }],
      ['the attach code, a numeric sessionId', { code: ATTACH, details: { sessionId: 7, workspaceId: 'w' } }],
      ['the attach code, a null sessionId', { code: ATTACH, details: { sessionId: null, workspaceId: 'w' } }],
      ['the attach code, an object sessionId', { code: ATTACH, details: { sessionId: { id: 'x' }, workspaceId: 'w' } }],
      ['an error with no code', { code: null }],
    ]
    for (const [label, create] of rows) {
      it(label, T, async () => {
        const outbox = await outboxNow(w.host)
        const sessions = await w.sessionCount()
        const made = (await w.host.call('createdByWrapper')).length
        await w.host.call('failCreate', create)
        let answer
        try { answer = await w.start({ folder: ws.id }) } finally { await w.host.call('failCreate', {}) }
        assert.deepEqual(answer.json, { ok: false, code: P5_CODE.deliveryFailed })
        assert.deepEqual(await outboxNow(w.host), outbox, 'not recorded')
        const orphans = (await w.host.call('createdByWrapper')).slice(made)
        assert.equal(await w.sessionCount(), sessions + orphans.length, 'Fishball created nothing itself')
        for (const id of orphans) {
          assert.deepEqual((await w.received(id, answer.call.message)) ?? [], [], 'a session created anyway got no first message')
          assert.equal(await w.titleOf(id), '', 'and no title')
        }
      })
    }
  })

  it('HM-11 none of those was counted: a half-made start succeeds (1 of 2)', T, async () => {
    const answer = await halfMade(w, ws)
    assert.equal(answer.json?.ok, true, JSON.stringify(answer.json))
    assert.equal(answer.json.workspaceError, HALF_MADE.workspaceError)
  })

  it('HM-12 a half-made start whose delivery fails is refused delivery-failed with workspaceError (2 of 2)', T, async () => {
    const answer = await halfMade(w, ws, {}, { steer: true })
    await assertFailedDelivery(w, answer, null)
    assert.equal(answer.json.workspaceError, HALF_MADE.workspaceError)
  })

  describe('HM-13 both half-made starts were counted: the cap is spent', () => {
    it('a normal start is refused hourly-cap, creating nothing', T, async () => {
      const sessions = await w.sessionCount()
      const outbox = await outboxNow(w.host)
      const { json } = await w.start({ folder: w.folder('hm13') })
      assert.deepEqual(json, { ok: false, code: P5_CODE.hourlyCap })
      assert.equal(await w.sessionCount(), sessions)
      assert.deepEqual(await outboxNow(w.host), outbox)
    })
    it('a start that would be half-made is refused hourly-cap before DSH creates anything', T, async () => {
      const sessions = await w.sessionCount()
      const attaches = (await w.host.call('attachCalls')).length
      const answer = await halfMade(w, ws)
      assert.deepEqual(answer.json, { ok: false, code: P5_CODE.hourlyCap })
      assert.equal(await w.sessionCount(), sessions)
      assert.equal((await w.host.call('attachCalls')).length, attaches)
    })
  })
})

describe('start_session keeps a half-made session without a DSH sessionTitle service', { skip: NEEDS_INSTANCE_STUB }, () => {
  const w = useHost('hm-none', { env: { FBTEST_NO_SESSION_TITLE: '1' }, limits: { sessionsPerHour: 0 } })
  const ws = useWorkspace(w, 'hm-none-ws')

  it('HM-30 the session is kept; the answer says title-unavailable and workspace-attach-failed', T, async () => {
    assert.equal(await w.host.call('hasSessionTitle'), false, 'precondition: no sessionTitle service')
    const normal = await w.start({ folder: ws.id })
    const answer = await halfMade(w, ws)
    const { json } = answer
    assert.equal(json?.ok, true, JSON.stringify(json))
    assert.equal(json.titleError, TITLE.unavailable)
    assert.equal('title' in json, false)
    assert.equal(json.workspaceError, HALF_MADE.workspaceError)
    assert.equal(json.folder, normal.json.folder)
    assertOneFailedAttach(answer, ws)
    await assertDelivered(w, answer, 'delivered', normal.json.folder)
    assert.equal(await w.titleOf(json.sessionId), '', 'no title was set')
  })

  it('HM-31 a failed delivery is refused with the sessionId, titleError title-unavailable and workspaceError, but no folder', T, async () => {
    const answer = await halfMade(w, ws, {}, { steer: true })
    await assertFailedDelivery(w, answer, TITLE.unavailable)
    assert.equal(answer.json.workspaceError, HALF_MADE.workspaceError)
    assertOneFailedAttach(answer, ws)
  })
})
