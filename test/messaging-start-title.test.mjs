/**
 * session.start names the session it starts (DESIGN §5d "Title", Q-start-title; requirements R1-R7 of
 * the fix), now over the bridge (H-STUB): the instance sends session.start (contract §4.1) instead of
 * Fishball's in-process start_session tool.
 *
 * Why: DSH's automatic title reads only user-source messages, and the first message is a relay, so the
 * new session would have no title. The connector names it through DSH's optional `sessionTitle`
 * service right after creation, before the first turn.
 *
 * Fault injection: the worker's probe (support/worker.mjs startProbe) records rename, the first steer
 * and the flushes of sessions created while it is armed, and can make rename throw the real
 * SessionTitleInvalidError or a plain Error, make the steer throw, or make the flush after the steer fail.
 *
 * Contract §4.1 changes two rules of the old tool: `title` and `message` may be empty strings, and the
 * reply is `{sessionId, managed, titleError?, workspaceError?, watchId? or watchError?}` (no title, no
 * folder). A title with no visible characters therefore starts the session with a titleError (DESIGN
 * §5d: "DSH refuses the title" → titleError, "the session still starts"); the contract wins over the
 * old `no-title` refusal (contract §0: "Where those decisions and the design differ, the decisions win").
 *
 * Host A: DSH's session-title service present. Host C: DSH without its session-title row.
 *
 * | id      | technique | req | expected |
 * |---------|-----------|-----|----------|
 * | SST-02  | ST (created → renamed → steered → flushed) | R3, R4 | rename once, with the live session of the new id and the title as given, before the one steer; the steer carries the relay source; a flush follows; `{sessionId, managed:true}`, no titleError; DSH reports the title |
 * | SST-03 ×4 | EP (what DSH keeps) + BVA (length) | R3 | rename gets the title exactly as given; DSH reports the kept title (whitespace collapsed; cut at DSH's cap) |
 * | SST-03b | ST | R3 | the title stays after the new session's first turn |
 * | SST-03c ×3 | BVA (1 visible character) | R2, R3 | 'x', ' x ', a no-break-space-padded character name the session 'x' |
 * | SST-03d ×3 | EP (visible text mixed with invisible characters) | R2, R3 | accepted; DSH strips the invisible characters |
 * | SST-04 ×2 | EP (rename throws SessionTitleInvalidError / a plain Error) | R5 | started, titleError title-invalid / title-failed; message delivered; a warning is logged for title-failed |
 * | SST-05 ×4 | DT (rename outcome × notifyWhenFinished) | R6 | watchId (or none) and titleError combine; one watch notice after the first turn |
 * | SST-05b | ST (first turn fails at once) | R6 | still one watch notice, reason error |
 * | SST-06 ×2 | EP (flush after the steer throws / answers false) | R6 | started; the message steered once (never sent twice) |
 * | SST-07 ×3 | DT (steer throws × rename outcome) | R6 | the reply carries the sessionId and the title outcome; rename happened once, before the steer; the session exists |
 * | SST-08  | EP (session.message, live and cold managed targets) | R7 | rename is never called; titles unchanged |
 * | ORD-02 ×12 | EP (empty or invisible-only title) × BVA | R2 + contract §4.1 | the session starts (title may be empty); titleError title-invalid; DSH keeps no title |
 * | ORD-02b ×5 | EP (title not a string or missing) | contract §3.1 | the frame fails validation: the channel closes, nothing is created |
 * | ORD-03 ×2 | DT (title ok × folder) | R2 | a missing folder and a relative path are refused with an error frame, nothing created |
 * | UNA-01  | EP (no sessionTitle service) | R5 | started, titleError title-unavailable; message delivered; no title set |
 * | UNA-02  | DT (no service × notifyWhenFinished) | R6 | watchId next to titleError; one watch notice |
 * | UNA-03 ×2 | DT (no service × empty / invisible title) | R2 | started, titleError title-unavailable (the service is missing whatever the title) |
 * | UNA-04  | EP (steer throws, no service) | R6 | the reply carries the sessionId and titleError title-unavailable |
 *
 * Retired:
 * - SST-01, SST-01b: start_session / message_session were the in-process Fishball's tools (slim §12); the request shape is the contract's exact-key payload, checked in ORD-02b.
 * - ORD-01 ×3: an empty message is allowed on the bridge (contract §4.1) and maxMessageBytes is not a bridge bound (§8), so there is no message check to order.
 * - ORD-04, ORD-05 ×5: sessionsPerHour went with the in-process agent (slim §12, conn-OQ-20).
 * - The outbox parts of SST-02/04/06/07 (status delivered / unconfirmed / failed): the outbox went with Fishball's outbound tools (slim §12).
 * - The title / folder / unconfirmed / delivery-failed fields of the old answers: contract §4.1's reply has none of them.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, it } from 'node:test'
import { PRESET, RUNTIME } from './support/constants.mjs'
import { T } from './support/expect.mjs'
import { handOver } from './support/instance-stub.mjs'
import { ERROR, G, assertError, assertNothingStarted, assertRelayedOnce, assertRenamedBeforeSteer, assertStarted, eventsOf, orderOf, responseOf, tok, useStubHost, watchNoticesSettled } from './support/instance-stub-start.mjs'
import { until } from './support/util.mjs'

// DSH's own title normalizer: used only to check that the test inputs sit on the right side of
// "empty after normalizing"; the expected titles below are written out by hand.
const { normalizeSessionTitle } = await import(pathToFileURL(path.join(RUNTIME, '@deepseek-ai', 'dsh-session-title', 'lib', 'index.js')).href)
const emptyTitle = (title) => normalizeSessionTitle(title, Number.MAX_SAFE_INTEGER) === ''

// DSH's client-module registry warns once, at a time of its own, about the fixture layout. It has
// nothing to do with titles, so the log checks leave it out.
const UNRELATED_LOGGERS = ['client-module-registry']
const loggedCount = async (w) => (await w.host.call('loggedProblems')).length
const problemsSince = async (w, since) => (await w.host.call('loggedProblems', { since })).filter((p) => !UNRELATED_LOGGERS.includes(p.name))

/** Started, with this titleError and no other title field (contract §4.1 has no title in the reply). */
async function assertTitleError(w, answer, code) {
  const json = await assertStarted(w, answer)
  assert.equal(json.titleError, code)
  return json
}
/** Started and named: no titleError, DSH reports `title`. */
async function assertNamed(w, answer, title) {
  const json = await assertStarted(w, answer)
  assert.equal('titleError' in json, false, JSON.stringify(json))
  assert.equal(await w.titleOf(json.sessionId), title, 'DSH reports the title')
  return json
}
/** A start whose steer failed: the reply names the created session and the title outcome. */
async function assertSteerFailed(w, answer, titleError) {
  const json = responseOf(answer)
  assert.equal(typeof json.sessionId, 'string', JSON.stringify(json))
  assert.ok((await w.sessionIds()).includes(json.sessionId), 'the session exists')
  if (titleError) assert.equal(json.titleError, titleError)
  else assert.equal('titleError' in json, false, JSON.stringify(json))
  return json
}
/** The empty / invisible-only titles: each is one DSH reduces to empty (R2). */
const EMPTY_TITLES = [
  ['an empty title', ''],
  ['a title of spaces', '   '],
  ['a title of line breaks and tabs', '\n\t\r\n'],
  ['a title of Unicode spaces', '\u00a0\u2003\u3000'],
  ['a zero-width space', '\u200b'],
  ['a left-to-right mark', '\u200e'],
  ['bidi overrides', '\u202e\u202c'],
  ['a word joiner and a byte order mark', '\u2060\ufeff'],
  ['control characters', '\u0000\u0007\u001f\u007f\u009f'],
  ['a colour escape sequence', '\u001b[31m\u001b[0m'],
  ['an operating-system-command escape sequence', '\u001b]0;hidden\u0007'],
  ['whitespace around invisible characters', ' \u200b\n\u202e\t '],
]

describe('session.start names the session (DSH session-title service present)', () => {
  const w = useStubHost('g-sst-main')

  it('SST-02 the session is created, renamed once, then given the first message, which is flushed', T, async () => {
    const title = 'Quarterly report'
    const answer = await w.start({ title, folder: w.folder('sst02') }, {})
    const json = await assertNamed(w, answer, title)
    const { events } = answer
    assertRenamedBeforeSteer(events, json.sessionId)
    const [rename] = eventsOf(events, json.sessionId, 'rename')
    assert.equal(rename.title, title, 'the title exactly as given')
    assert.equal(rename.liveSession, true, 'the live session object of the new id')
    const order = orderOf(events, json.sessionId)
    assert.equal(order.filter((t) => t === 'steer').length, 1, 'steered once')
    assert.ok(order.lastIndexOf('flush') > order.indexOf('steer'), 'flushed after the steer: ' + order)
  })

  describe('SST-03 DSH keeps the normalized title', () => {
    // DSH collapses whitespace runs and trims (normalizeSessionTitle) and cuts at its byte cap (80 in dsh-base).
    const rows = [
      ['a plain title', 'Build the report', 'Build the report'],
      ['edge and inner whitespace', '  Fix   the\tbuild \n now  ', 'Fix the build now'],
      ['non-ASCII text', 'Überprüfung der Konfiguration 配置检查', 'Überprüfung der Konfiguration 配置检查'],
      ["a title longer than DSH's cap", 'x'.repeat(300), null],
    ]
    for (const [label, input, expected] of rows) {
      it(label, T, async () => {
        const answer = await w.start({ title: input }, {})
        const json = await assertStarted(w, answer)
        assert.equal('titleError' in json, false)
        const [rename] = eventsOf(answer.events, json.sessionId, 'rename')
        assert.equal(rename.title, input, 'rename gets the title exactly as given')
        const kept = await w.titleOf(json.sessionId)
        assert.equal(kept, rename.returned, 'DSH reports what its rename returned')
        if (expected !== null) assert.equal(kept, expected)
        else {
          assert.ok(kept.length > 0 && kept.length < input.length, 'cut: ' + kept.length)
          assert.equal(kept, input.slice(0, kept.length))
        }
      })
    }
  })

  it('SST-03b the title stays after the new session has run its first turn', T, async () => {
    const title = 'Keep this name'
    const json = await assertNamed(w, await w.start({ title }), title)
    assert.ok(await until(async () => (await w.host.call('agentStatus', { sessionId: json.sessionId })) === 'idle', G.settleMs, 100))
    assert.equal(await w.titleOf(json.sessionId), title, 'nothing replaced it')
  })

  describe('SST-03c titles at the lower boundary', () => {
    for (const [label, input] of [['one character', 'x'], ['one character with spaces around', ' x '], ['one character between Unicode spaces', ' 　x　']]) {
      it(label, T, async () => { await assertNamed(w, await w.start({ title: input }), 'x') })
    }
  })

  describe('SST-03d visible text mixed with invisible characters is accepted; DSH strips the invisible ones', () => {
    const rows = [
      ['a zero-width space inside a word', 'a\u200bb', 'ab'],
      ['bidi marks and a word joiner around text', '\u202eRelease\u200e \u2060plan\u202c', 'Release plan'],
      ['control characters and an escape sequence', '\u0007Report\u001b[31m ready\u001b[0m\u0000', 'Report ready'],
    ]
    for (const [label, input, expected] of rows) {
      it(label, T, async () => {
        assert.equal(emptyTitle(input), false, 'precondition: DSH keeps visible text')
        const answer = await w.start({ title: input }, {})
        const json = await assertNamed(w, answer, expected)
        assert.equal(eventsOf(answer.events, json.sessionId, 'rename')[0].title, input)
      })
    }
  })

  describe('SST-04 naming problems never stop the session', () => {
    it('SST-04 control: a start that names the session logs no warning', T, async () => {
      const logBefore = await loggedCount(w)
      await assertNamed(w, await w.start({ folder: w.folder('sst04-control') }), G.title)
      assert.deepEqual(await problemsSince(w, logBefore), [])
    })
    for (const [mode, code] of [[G.probe.renameInvalid, G.titleError.invalid], [G.probe.renameFail, G.titleError.failed]]) {
      it('rename throws (' + mode + ') → ' + code, T, async () => {
        const logBefore = await loggedCount(w)
        const answer = await w.start({ folder: w.folder('sst04-' + mode) }, { rename: mode })
        const json = await assertTitleError(w, answer, code)
        assertRenamedBeforeSteer(answer.events, json.sessionId)
        if (mode === G.probe.renameFail) {
          const problems = await problemsSince(w, logBefore)
          assert.ok(problems.some((p) => p.type === 'warn'), 'a warning is logged: ' + JSON.stringify(problems))
        }
      })
    }
  })

  describe('SST-05 the watch from notifyWhenFinished and the title outcome combine', () => {
    const rows = [
      ['named, no flag', null, false],
      ['named, flag', null, true],
      ['title-invalid, no flag', G.probe.renameInvalid, false],
      ['title-invalid, flag', G.probe.renameInvalid, true],
    ]
    for (const [label, rename, notify] of rows) {
      it(label, T, async () => {
        const answer = await w.start({ notifyWhenFinished: notify ? true : undefined, folder: w.folder('sst05') }, { rename })
        const json = rename ? await assertTitleError(w, answer, G.titleError.invalid) : await assertNamed(w, answer, G.title)
        assert.equal('watchError' in json, false)
        if (notify) {
          assert.equal(typeof json.watchId, 'string', JSON.stringify(json))
          assert.equal((await watchNoticesSettled(w, json.watchId, 1)).length, 1, 'one notice after the first turn')
        } else assert.equal('watchId' in json, false)
      })
    }

    it('SST-05b a first turn that fails at once is still reported once (reason error)', T, async () => {
      const message = tok('sst05b')
      await w.host.call('queueMarker', { marker: message, script: [[{ fail: 'FBTEST_FATAL' }]] })
      const json = responseOf(await w.start({ message, notifyWhenFinished: true }))
      assert.equal(typeof json.watchId, 'string', JSON.stringify(json))
      const notices = await watchNoticesSettled(w, json.watchId, 1)
      assert.equal(notices.length, 1, 'the immediate turn end is reported')
      assert.ok(notices[0].text.includes(G.finishedReason('error')), notices[0].text)
    })
  })

  describe('SST-06 a flush that cannot be confirmed still starts the session, sent once', () => {
    for (const [id, flush] of [['SST-06', G.probe.flushThrow], ['SST-06b', G.probe.flushFalse]]) {
      it(id + ' the flush ' + (flush === G.probe.flushThrow ? 'rejects' : 'answers false'), T, async () => {
        const answer = await w.start({ folder: w.folder('sst06-' + flush) }, { flush })
        const json = await assertNamed(w, answer, G.title)
        assert.equal(eventsOf(answer.events, json.sessionId, 'steer').length, 1, 'steered once, so never delivered twice')
      })
    }
  })

  describe('SST-07 a failed delivery still reports the session and the title outcome', () => {
    const rows = [['named', null, null], ['title-invalid', G.probe.renameInvalid, G.titleError.invalid], ['title-failed', G.probe.renameFail, G.titleError.failed]]
    for (const [label, rename, titleError] of rows) {
      it(label, T, async () => {
        const answer = await w.start({ folder: w.folder('sst07-' + label) }, { rename, steer: true })
        const json = await assertSteerFailed(w, answer, titleError)
        assertRenamedBeforeSteer(answer.events, json.sessionId)
      })
    }
  })

  it('SST-08 session.message never calls rename and leaves the titles alone', T, async () => {
    const live = await w.managedSession('sst08-live')
    const cold = 'session-fbtest-cold-sst08'
    await w.host.call('seedBlankSession', { sessionId: cold, cwd: path.join(w.home, 'work', 'sst08-cold'), agentPreset: PRESET.bare })
    assert.equal((await handOver(w.host, cold)).status, 200)
    const titleBefore = await w.titleOf(live)
    await w.host.call('startProbe', {})
    try {
      for (const target of [live, cold]) {
        const message = tok('sst08')
        responseOf(await w.message(target, message))
        await assertRelayedOnce(w, target, message)
      }
      assert.deepEqual((await w.host.call('probeEvents')).filter((e) => e.type === 'rename'), [], 'rename was never called')
    } finally { await w.host.call('stopProbe') }
    assert.equal(await w.titleOf(live), titleBefore)
    assert.equal(await w.titleOf(cold), '', 'the resumed session still has no title')
  })

  describe('ORD-02 a title that is empty after normalizing still starts the session, untitled (title may be empty)', () => {
    for (const [label, title] of EMPTY_TITLES) {
      it(label + ' → started, titleError ' + G.titleError.invalid, T, async () => {
        assert.equal(emptyTitle(title), true, 'precondition: DSH reduces this title to empty')
        const json = await assertTitleError(w, await w.start({ title }), G.titleError.invalid)
        assert.equal(await w.titleOf(json.sessionId), '', 'no title kept')
      })
    }
  })

  describe('ORD-02b a title that is missing or not a string breaks the exact payload: the channel closes', () => {
    for (const [label, title] of [['no title', undefined], ['a number', 7], ['null', null], ['an array', ['title']], ['an object', { text: 'title' }]]) {
      it(label, T, async () => {
        const sessions = await w.sessionIds()
        const answer = await w.start({ title, folder: w.missing() })
        assert.equal(answer.type, 'none', JSON.stringify(answer))
        await assertNothingStarted(w, sessions)
      })
    }
  })

  describe('ORD-03 with a good title the folder is checked', () => {
    for (const [label, folder] of [['a missing folder', () => w.missing()], ['a relative path', () => 'work/start-here']]) {
      it(label + ' → an error frame', T, async () => {
        const sessions = await w.sessionIds()
        assertError(await w.start({ folder: folder() }), Object.values(ERROR))
        await assertNothingStarted(w, sessions)
      })
    }
  })
})

describe('session.start without a DSH sessionTitle service', () => {
  const w = useStubHost('g-sst-none', { env: { FBTEST_NO_SESSION_TITLE: '1' } })

  it('UNA-01 the session starts, the message is delivered, and the reply says title-unavailable', T, async () => {
    assert.equal(await w.host.call('hasSessionTitle'), false, 'precondition: no sessionTitle service')
    const json = await assertTitleError(w, await w.start({ folder: w.folder('una01') }), G.titleError.unavailable)
    assert.equal(await w.titleOf(json.sessionId), '', 'no title was set')
  })

  it('UNA-02 notifyWhenFinished still adds the watch next to titleError', T, async () => {
    const json = await assertTitleError(w, await w.start({ notifyWhenFinished: true }), G.titleError.unavailable)
    assert.equal(typeof json.watchId, 'string', JSON.stringify(json))
    assert.equal((await watchNoticesSettled(w, json.watchId, 1)).length, 1, 'one notice after the first turn')
  })

  describe('UNA-03 an empty title still starts the session; titles cannot be set at all', () => {
    for (const [label, title] of [['an empty title', ''], ['a zero-width space', '\u200b']]) {
      it(label, T, async () => { await assertTitleError(w, await w.start({ title }), G.titleError.unavailable) })
    }
  })

  it('UNA-04 a failed delivery reports the sessionId and titleError title-unavailable', T, async () => {
    await assertSteerFailed(w, await w.start({ folder: w.folder('una04') }, { steer: true }), G.titleError.unavailable)
  })
})
