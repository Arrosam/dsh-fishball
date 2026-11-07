/**
 * session.start keeps a session DSH created but could not add to the workspace (DESIGN §5d "Created but
 * not added to the workspace", Q-start-half-made), now over the bridge (H-STUB): the instance sends
 * session.start (contract §4.1), whose reply carries `workspaceError` (`workspace-attach-failed`).
 *
 * Why: for a folder that is a registered DSH workspace, DSH's create makes the session and then adds it
 * to the workspace. When only the second step fails it throws `session/workspace-attach-failed` with
 * `details {sessionId, workspaceId}`; the session exists (DSH shows it under Ungrouped). The connector
 * carries on: names it, sends the first message, makes it managed, and reports workspaceError.
 *
 * Fault injection (support/worker.mjs): `failAttach` makes one workspace's attachSession throw, so DSH's
 * own create really creates the session and throws its real error. `failCreate` replaces
 * sessionController.create with one that throws a given code and details (optionally after really
 * creating the session). startProbe records rename, steer and flush and can make them fail. "The same as
 * a normal start in that workspace" is checked against a normal start made in the same host.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | HM-00 ×2 | EP (control: workspace id, workspace path) | a normal start puts the session in the workspace and has no workspaceError |
 * | HM-01 ×2 | EP (folder form) | reply keys of a normal start plus workspaceError; one failed attach for this session; the session exists, in no workspace, in the workspace's folder; renamed once before the one steer (relay); first message once; managed (by start); it runs its first turn; DSH reports the title |
 * | HM-02 ×2 | DT (rename invalid / fails) | titleError title-invalid / title-failed and workspaceError; delivered |
 * | HM-03 ×2 | DT (notifyWhenFinished set / not set) | watchId and one watch notice after the first turn; none without the flag; workspaceError either way |
 * | HM-04   | ST (half-made start → session.read, session.watch) | the session is related: session.read returns the first message; session.watch gives a watchId |
 * | HM-05 ×2 | EP (flush rejects / answers false) | the same reply as the same start made whole, plus workspaceError; steered once |
 * | HM-06 ×3 | DT (steer throws × rename ok / invalid / fails) | the same reply as the same failed delivery made whole, plus workspaceError; renamed before the steer |
 * | HM-07 ×2 | DT (attach-failed error with only a string sessionId, or with extra details) | carries on as for a real attach failure |
 * | HM-08   | EP (controls) | no workspaceError on a normal start in a workspace, a start in a plain folder, or a failed delivery; no attach failed |
 * | HM-10 ×9 | DT (create fails: other code, near-miss codes, attach code without a string details.sessionId, no code) | an error frame; no first message and no title for a session created anyway; it is not made managed |
 * | HM-30   | EP (no sessionTitle service) | titleError title-unavailable and workspaceError; delivered |
 * | HM-31   | EP (no service, steer throws) | the reply carries the sessionId, titleError title-unavailable and workspaceError |
 *
 * Retired:
 * - HM-11, HM-12, HM-13 ×2: sessionsPerHour went with the in-process agent (slim §12, conn-OQ-20); there is no cap left to count half-made starts against.
 * - The outbox parts of HM-01/02/05/06/10 (recorded, status, errorCode): the outbox went with Fishball's outbound tools (slim §12).
 * - The folder / title / unconfirmed / delivery-failed fields of the old answers: contract §4.1's reply has none of them.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { before, describe, it } from 'node:test'
import { HOOK, T } from './support/expect.mjs'
import { ERROR, G, OPERATION, assertError, assertRelayedOnce, assertRenamedBeforeSteer, assertStarted, eventsOf, orderOf, responseOf, tok, useStubHost, watchesOn, watchNoticesSettled } from './support/instance-stub-start.mjs'
import { until } from './support/util.mjs'

/** A workspace registered in the host, and a switch that makes adding a session to it fail. */
function useWorkspace(w, name) {
  const ws = { id: null, path: null }
  before(async () => { Object.assign(ws, await w.host.call('createWorkspace', { dir: path.join(w.home, 'work', name) })) }, HOOK)
  ws.failing = (on) => w.host.call('failAttach', { workspaceId: ws.id, on })
  /** The folder argument in each form contract §4.1 names. */
  ws.folders = { 'a workspace id': () => ws.id, 'the path of a workspace': () => ws.path }
  return ws
}

/** session.start while adding the new session to `ws` fails; also returns the failing attaches DSH's create made. */
async function halfMade(w, ws, args = {}, probe = null) {
  const seen = (await w.host.call('attachCalls')).length
  await ws.failing(true)
  let answer
  try { answer = await w.start({ folder: ws.id, ...args }, probe) } finally { await ws.failing(false) }
  return { ...answer, attaches: (await w.host.call('attachCalls')).slice(seen) }
}

/** The session exists, lives in the workspace's folder, and is in no workspace (Ungrouped). */
async function assertUngrouped(w, ws, sessionId) {
  assert.ok((await w.sessionIds()).includes(sessionId), 'the session exists')
  assert.equal((await w.host.call('workspaces')).list.some((x) => x.sessionIds.includes(sessionId)), false, 'in no workspace')
  assert.equal(fs.realpathSync((await w.host.call('header', { sessionId })).cwd), fs.realpathSync(ws.path), "in the workspace's folder")
}

/** DSH's create made one failing attach: this session, this workspace. */
const assertOneFailedAttach = (answer, ws) => assert.deepEqual(answer.attaches, [{ workspaceId: ws.id, sessionId: responseOf(answer).sessionId }], 'DSH created the session and failed only to add it')

/** The reply of the same start made whole (the reference), plus workspaceError, and nothing else. */
function assertSameKeysPlusWorkspaceError(answer, normal) {
  const json = responseOf(answer)
  assert.equal(json.workspaceError, G.workspaceError)
  assert.deepEqual(Object.keys(json).sort(), [...Object.keys(responseOf(normal)), 'workspaceError'].sort())
  return json
}

describe('session.start keeps a half-made session (DSH session-title service present)', () => {
  const w = useStubHost('g-hm-main')
  const ws = useWorkspace(w, 'hm-ws')
  const references = new Map()
  /** A normal start in the workspace, per folder form: the reference for what a start reports. */
  const reference = async (form) => {
    if (!references.has(form)) references.set(form, await w.start({ folder: ws.folders[form](), message: tok('hm00') }))
    return references.get(form)
  }

  describe('HM-00 control: a normal start in a registered workspace', () => {
    for (const form of ['a workspace id', 'the path of a workspace']) {
      it(form, T, async () => {
        const normal = await reference(form)
        const json = await assertStarted(w, normal, { cwd: ws.path })
        assert.equal('workspaceError' in json, false)
        assert.ok((await w.host.call('workspaces')).list.find((x) => x.id === ws.id).sessionIds.includes(json.sessionId), 'precondition: this form puts the session in the workspace')
      })
    }
  })

  describe('HM-01 the session is named, given its first message, managed, and reported', () => {
    for (const form of ['a workspace id', 'the path of a workspace']) {
      it(form, T, async () => {
        const normal = await reference(form)
        const marker = tok('hm01')
        await w.host.call('queueMarker', { marker, script: [[{ text: 'half-made session at work' }]] })
        const title = 'Half made ' + form
        const answer = await halfMade(w, ws, { folder: ws.folders[form](), message: marker, title }, {})
        const json = assertSameKeysPlusWorkspaceError(answer, normal)
        await assertStarted(w, answer, { cwd: ws.path })
        assert.equal('titleError' in json, false)
        assert.equal('watchId' in json, false)
        assertOneFailedAttach(answer, ws)
        await assertUngrouped(w, ws, json.sessionId)
        assertRenamedBeforeSteer(answer.events, json.sessionId)
        assert.equal(eventsOf(answer.events, json.sessionId, 'rename')[0].title, title)
        assert.equal(orderOf(answer.events, json.sessionId).filter((t) => t === 'steer').length, 1)
        assert.ok(await until(async () => (await w.host.call('markerState', { marker })).left === 0, G.settleMs, 100), 'it ran its first turn')
        assert.equal(await w.titleOf(json.sessionId), title, 'DSH reports the title')
      })
    }
  })

  describe('HM-02 naming problems still do not stop the session', () => {
    for (const [mode, code] of [[G.probe.renameInvalid, G.titleError.invalid], [G.probe.renameFail, G.titleError.failed]]) {
      it('rename throws (' + mode + ') → ' + code, T, async () => {
        const answer = await halfMade(w, ws, {}, { rename: mode })
        const json = await assertStarted(w, answer, { cwd: ws.path })
        assert.equal(json.workspaceError, G.workspaceError)
        assert.equal(json.titleError, code)
        assertOneFailedAttach(answer, ws)
        assertRenamedBeforeSteer(answer.events, json.sessionId)
      })
    }
  })

  describe('HM-03 the watch from notifyWhenFinished', () => {
    for (const notify of [true, false]) {
      it(notify ? 'notifyWhenFinished: a watch and one notice after its first turn' : 'no flag: no watch', T, async () => {
        const answer = await halfMade(w, ws, notify ? { notifyWhenFinished: true } : {})
        const json = await assertStarted(w, answer, { cwd: ws.path })
        assert.equal(json.workspaceError, G.workspaceError)
        assert.equal('watchError' in json, false)
        if (notify) assert.equal((await watchNoticesSettled(w, json.watchId, 1)).length, 1, 'one notice: ' + JSON.stringify(json))
        else {
          assert.equal('watchId' in json, false)
          assert.deepEqual(await watchesOn(w, json.sessionId), [])
        }
      })
    }
  })

  it('HM-04 the session counts as related afterwards: session.read and session.watch work on it', T, async () => {
    const answer = await halfMade(w, ws)
    const json = await assertStarted(w, answer, { cwd: ws.path })
    const read = responseOf(await w.scoped(OPERATION.sessionRead, json.sessionId, G.read))
    assert.ok(read.messages.some((m) => m.text.includes(answer.call.message)), 'it reads the first message: ' + JSON.stringify(read))
    const watch = responseOf(await w.scoped(OPERATION.sessionWatch, json.sessionId, { mode: G.watchOnce }))
    assert.equal(typeof watch.watchId, 'string', JSON.stringify(watch))
  })

  describe('HM-05 a flush that cannot be confirmed still starts the half-made session, sent once', () => {
    for (const [id, flush] of [['HM-05', G.probe.flushThrow], ['HM-05b', G.probe.flushFalse]]) {
      it(id + ' the flush ' + (flush === G.probe.flushThrow ? 'rejects' : 'answers false'), T, async () => {
        const normal = await w.start({ folder: ws.id }, { flush })
        const answer = await halfMade(w, ws, {}, { flush })
        const json = assertSameKeysPlusWorkspaceError(answer, normal)
        assert.equal(eventsOf(answer.events, json.sessionId, 'steer').length, 1, 'steered once, so never delivered twice')
        await assertRelayedOnce(w, json.sessionId, answer.call.message)
      })
    }
  })

  describe('HM-06 a failed delivery still reports the session, with the half-made marker', () => {
    const rows = [['named', null], ['title-invalid', G.probe.renameInvalid], ['title-failed', G.probe.renameFail]]
    for (const [label, rename] of rows) {
      it(label, T, async () => {
        const normal = await w.start({ folder: ws.id }, { rename, steer: true })
        assert.equal('workspaceError' in responseOf(normal), false, 'a normal failed delivery has no workspaceError')
        const answer = await halfMade(w, ws, {}, { rename, steer: true })
        const json = assertSameKeysPlusWorkspaceError(answer, normal)
        assert.ok((await w.sessionIds()).includes(json.sessionId), 'the session exists')
        assertOneFailedAttach(answer, ws)
        assertRenamedBeforeSteer(answer.events, json.sessionId)
      })
    }
  })

  describe('HM-07 the error is recognized by its code and a string details.sessionId, nothing else', () => {
    const rows = [
      ['details with only the sessionId', {}],
      ['details with more fields than DSH gives', { workspaceId: 'fbtest-other-workspace', extra: 1, nested: { a: [1] } }],
    ]
    for (const [label, details] of rows) {
      it(label, T, async () => {
        await w.host.call('failCreate', { code: G.dshAttachCode, details, createFirst: true })
        let answer
        try { answer = await w.start({ folder: w.folder('hm07') }, {}) } finally { await w.host.call('failCreate', {}) }
        const json = await assertStarted(w, answer)
        assert.equal(json.workspaceError, G.workspaceError)
        assertRenamedBeforeSteer(answer.events, json.sessionId)
      })
    }
  })

  it('HM-08 a start that was whole carries no workspaceError: a workspace, a plain folder, a failed delivery', T, async () => {
    for (const form of Object.keys(ws.folders)) assert.equal('workspaceError' in responseOf(await reference(form)), false, form)
    const attaches = (await w.host.call('attachCalls')).length
    assert.equal('workspaceError' in responseOf(await w.start({ folder: w.folder('hm08') })), false, 'a plain folder')
    assert.equal('workspaceError' in responseOf(await w.start({ folder: w.folder('hm08-failed') }, { steer: true })), false, 'a failed delivery')
    assert.equal((await w.host.call('attachCalls')).length, attaches, 'no attach failed in these')
  })

  describe('HM-10 create fails, but not as a half-made session: refused, nothing sent', () => {
    const ATTACH = G.dshAttachCode
    // createFirst: the wrapper really creates the session first and puts its id in the details; only a
    // recognized error may make the connector carry on with it.
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
        const sessions = await w.sessionIds()
        const made = (await w.host.call('createdByWrapper')).length
        await w.host.call('failCreate', create)
        let answer
        try { answer = await w.start({ folder: ws.id }) } finally { await w.host.call('failCreate', {}) }
        assertError(answer, Object.values(ERROR))
        const orphans = (await w.host.call('createdByWrapper')).slice(made)
        assert.equal((await w.sessionIds()).length, sessions.length + orphans.length, 'the connector created nothing itself')
        for (const id of orphans) {
          assert.deepEqual((await w.received(id, answer.call.message)) ?? [], [], 'a session created anyway got no first message')
          assert.equal(await w.titleOf(id), '', 'and no title')
          assert.equal(await w.managedEntry(id), undefined, 'and is not managed')
        }
      })
    }
  })
})

describe('session.start keeps a half-made session without a DSH sessionTitle service', () => {
  const w = useStubHost('g-hm-none', { env: { FBTEST_NO_SESSION_TITLE: '1' } })
  const ws = useWorkspace(w, 'hm-none-ws')

  it('HM-30 the session is kept; the reply says title-unavailable and workspace-attach-failed', T, async () => {
    assert.equal(await w.host.call('hasSessionTitle'), false, 'precondition: no sessionTitle service')
    const answer = await halfMade(w, ws)
    const json = await assertStarted(w, answer, { cwd: ws.path })
    assert.equal(json.titleError, G.titleError.unavailable)
    assert.equal(json.workspaceError, G.workspaceError)
    assertOneFailedAttach(answer, ws)
    assert.equal(await w.titleOf(json.sessionId), '', 'no title was set')
  })

  it('HM-31 a failed delivery reports the sessionId, titleError title-unavailable and workspaceError', T, async () => {
    const answer = await halfMade(w, ws, {}, { steer: true })
    const json = responseOf(answer)
    assert.ok((await w.sessionIds()).includes(json.sessionId))
    assert.equal(json.titleError, G.titleError.unavailable)
    assert.equal(json.workspaceError, G.workspaceError)
    assertOneFailedAttach(answer, ws)
  })
})
