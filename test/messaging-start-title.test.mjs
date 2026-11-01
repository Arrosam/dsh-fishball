/**
 * start_session names the session it starts (DESIGN 5d, Q-start-title; requirements R1-R7 of the fix).
 *
 * Why: DSH's automatic title reads only user-source messages, and start_session's first message is a relay, so
 * the new session had no title. Fishball now names it through DSH's optional `sessionTitle` service.
 *
 * Fault injection: the worker's probe (support/worker.mjs startProbe) wraps the host's own methods for the
 * sessions created while it is armed. It records rename, the first steer and the flushes in order, and can make
 * rename throw the real SessionTitleInvalidError or a plain Error, make the steer throw, or make the flush after
 * the steer fail. It is the only way to reach the failure answers black-box (CASES.md A54, A55).
 *
 * Host A: DSH's session-title service is present. Host B: order of the checks and the hourly cap. Host C: DSH
 * booted without its session-title row, so there is no `sessionTitle` service.
 *
 * | id      | technique | req | expected |
 * |---------|-----------|-----|----------|
 * | SST-01  | EP (schema) | R1 | start_session: folder, title, message required strings, notify_when_finished optional boolean; its description mentions the title |
 * | SST-01b | EP (schema) | R7 | message_session keeps session_id and message required plus the optional notify_when_finished: no title |
 * | SST-02  | ST (created → renamed → steered → flushed) | R3, R4 | rename once, with the live session of the new id and the title as given, before the one steer; the steer carries the relay source naming Fishball; a flush follows; ok with sessionId, folder, title; the outbox records the start as before |
 * | SST-03 ×4 | EP (what DSH keeps) + BVA (length) | R3 | rename gets the title exactly as given; the answer's title is what DSH returned (whitespace collapsed; cut at DSH's cap); DSH reports the same title |
 * | SST-03b | ST | R3 | the title stays after the new session's first turn |
 * | SST-03c ×3 | BVA (1 visible character, 1 unit above whitespace) | R2, R3 | 'x', ' x ', and a lone no-break-space-padded character name the session |
 * | SST-03d ×3 | EP (visible text mixed with invisible characters) | R2, R3 | accepted; DSH strips the invisible characters from the kept title |
 * | SST-04 ×2 | EP (rename throws the real SessionTitleInvalidError / a plain Error) | R5 | ok, titleError title-invalid / title-failed, no title key, session created, message delivered and recorded; a warning is logged for title-failed |
 * | SST-05 ×4 | DT (rename outcome × notify_when_finished) | R6 | the watch (or none) and the title fields combine; one notice after the first turn |
 * | SST-05b | ST (first turn fails at once) | R6 | still one notice, reason error, with the title in the answer |
 * | SST-06  | EP (flush after the steer throws) | R6 | ok, unconfirmed true, title present; the message steered once; outbox unconfirmed |
 * | SST-06b | EP (flush answers false: no durability listener took part) | R6 | same as SST-06 |
 * | SST-07 ×3 | DT (steer throws × rename outcome) | R6 | delivery-failed with sessionId and the title outcome (title, or titleError), no folder; rename happened once, before; outbox failed |
 * | SST-08  | EP (message_session, live and cold targets) | R7 | rename is never called; the targets' titles are unchanged |
 * | ORD-01 ×3 | DT (message) | R2 | empty (empty, whitespace) and too-large win over a bad title and a bad folder |
 * | ORD-02 ×17 | EP (title) × DT | R2 | '', spaces, line breaks, Unicode spaces, and titles DSH's normalizeSessionTitle reduces to empty (zero-width space, bidi marks, control characters, escape sequences, any mix): no-title; missing/number/null/array/object: no-title or a tool error; nothing created or recorded; beats a bad folder |
 * | ORD-03 ×2 | DT (title ok × folder) | R2 | no-folder, not-absolute |
 * | ORD-04  | ST (sessionsPerHour 1) | R2 | after all the refusals above a valid start still succeeds: none counted |
 * | ORD-05 ×5 | DT (cap spent × other checks) | R2 | hourly-cap beats the folder and loses to the message and the title checks |
 * | UNA-01  | EP (no sessionTitle service) | R5 | ok, titleError title-unavailable, no title key; message delivered and recorded |
 * | UNA-02  | DT (no service × notify_when_finished) | R6 | the watch is merged in with titleError |
 * | UNA-03 ×2 | DT (no service × empty / invisible title) | R2 | no-title: the title is checked whether or not the service exists |
 * | UNA-04  | EP (steer throws, no sessionTitle service) | R6 | delivery-failed with sessionId and titleError title-unavailable, no folder |
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, it } from 'node:test'
import { LIMITS, P5_CODE, PRESET, RELAY, RUNTIME, TITLE, WATCH_SUMMARY } from './support/constants.mjs'
import { T, fishballCall, noticesSettled, settledIdle, toolSchema, turn, watchesOn } from './support/expect.mjs'
import { until } from './support/host.mjs'
import { TOOL, TOOL_ERROR, assertDelivered, assertFailedDelivery, assertRefused, assertRenamedBeforeSteer, assertTitleError, eventsOf, orderOf, tok, useHost } from './support/start-session.mjs'

// DSH's own title normalizer: R2 refuses every title it reduces to empty. Used here only to check that the
// test inputs sit on the right side of that line; the expected titles below are written out by hand.
const { normalizeSessionTitle } = await import(pathToFileURL(path.join(RUNTIME, '@deepseek-ai', 'dsh-session-title', 'lib', 'index.js')).href)
const emptyTitle = (title) => normalizeSessionTitle(title, Number.MAX_SAFE_INTEGER) === ''

describe('start_session names the session (DSH session-title service present)', () => {
  const w = useHost('sst-main', { limits: { sessionsPerHour: 0 } })

  it('SST-01 start_session takes folder, title and message (required) and notify_when_finished (optional); the description mentions the title', T, async () => {
    const req = (await turn(w.host, w.fb, [[{ text: 'list tools' }]])).requests.at(-1)
    const schema = toolSchema(req, TOOL)
    assert.deepEqual(Object.keys(schema.properties ?? {}).sort(), ['folder', 'message', 'notify_when_finished', 'title'])
    assert.deepEqual([...schema.required].sort(), ['folder', 'message', 'title'])
    for (const name of ['folder', 'title', 'message']) assert.equal(schema.properties[name].type, 'string', name)
    assert.equal(schema.properties.notify_when_finished.type, 'boolean')
    assert.match(req.tools.find((t) => t.name === TOOL).description ?? '', /title/i)
  })

  it('SST-01b message_session is unchanged: no title', T, async () => {
    const req = (await turn(w.host, w.fb, [[{ text: 'list tools' }]])).requests.at(-1)
    const schema = toolSchema(req, 'message_session')
    assert.deepEqual(Object.keys(schema.properties ?? {}).sort(), ['message', 'notify_when_finished', 'session_id'])
    assert.deepEqual([...schema.required].sort(), ['message', 'session_id'])
  })

  it('SST-02 the session is created, renamed once, then given the first message, which is flushed', T, async () => {
    const title = 'Quarterly report'
    const answer = await w.start({ title, folder: w.folder('sst02') }, {})
    const { json, call, events } = answer
    assert.equal(json?.ok, true, JSON.stringify(json))
    assert.equal(json.folder, call.folder)
    assert.equal(json.title, title)
    assert.equal('titleError' in json, false)
    const sessionId = json.sessionId
    assert.equal(typeof sessionId, 'string')
    assertRenamedBeforeSteer(events, sessionId)
    const [rename] = eventsOf(events, sessionId, 'rename')
    assert.equal(rename.title, title, 'the title exactly as given')
    assert.equal(rename.liveSession, true, "the live session object of the new id (ctx.sessions.get returns it)")
    const order = orderOf(events, sessionId)
    assert.equal(order.filter((t) => t === 'steer').length, 1, 'the first message is steered once')
    assert.ok(order.lastIndexOf('flush') > order.indexOf('steer'), 'flushed after the steer: ' + order)
    assert.deepEqual(eventsOf(events, sessionId, 'steer')[0].source, { ...RELAY, senderSessionId: w.fb })
    await assertDelivered(w, answer)
    assert.equal(await w.titleOf(sessionId), title, 'DSH reports the title')
  })

  describe('SST-03 the answer carries the title DSH kept', () => {
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
        const { json, events } = answer
        assert.equal(json?.ok, true, JSON.stringify(json))
        const [rename] = eventsOf(events, json.sessionId, 'rename')
        assert.equal(rename.title, input, 'rename gets the title exactly as given')
        assert.equal(json.title, rename.returned, "the answer's title is the one DSH's snapshot returned")
        if (expected !== null) assert.equal(json.title, expected)
        else {
          assert.ok(json.title.length > 0 && json.title.length < input.length, 'cut: ' + json.title.length)
          assert.equal(json.title, input.slice(0, json.title.length))
        }
        assert.equal(await w.titleOf(json.sessionId), json.title, 'DSH reports the same title')
      })
    }
  })

  it('SST-03b the title stays after the new session has run its first turn', T, async () => {
    const title = 'Keep this name'
    const { json } = await w.start({ title })
    assert.equal(json?.ok, true, JSON.stringify(json))
    assert.ok(await settledIdle(w.host, json.sessionId), 'the new session ran its first turn')
    assert.equal(await w.titleOf(json.sessionId), title, "neither DSH's automatic title nor anything else replaced it")
  })

  describe('SST-03c titles at the lower boundary of what counts as a title', () => {
    // One visible character is the smallest title; surrounding whitespace is not part of the title DSH keeps.
    for (const [label, input, expected] of [['one character', 'x', 'x'], ['one character with spaces around', ' x ', 'x'], ['one character between Unicode spaces', ' 　x　', 'x']]) {
      it(label, T, async () => {
        const { json } = await w.start({ title: input })
        assert.equal(json?.ok, true, JSON.stringify(json))
        assert.equal(json.title, expected)
        assert.equal('titleError' in json, false)
      })
    }
  })

  describe('SST-03d visible text mixed with invisible characters is accepted; DSH strips the invisible ones', () => {
    // Zero-width space and bidi marks, control characters and escape sequences vanish; the rest of the title stays.
    const rows = [
      ['a zero-width space inside a word', 'a\u200bb', 'ab'],
      ['bidi marks and a word joiner around text', '\u202eRelease\u200e \u2060plan\u202c', 'Release plan'],
      ['control characters and an escape sequence', '\u0007Report\u001b[31m ready\u001b[0m\u0000', 'Report ready'],
    ]
    for (const [label, input, expected] of rows) {
      it(label, T, async () => {
        assert.equal(emptyTitle(input), false, 'precondition: DSH keeps visible text')
        const { json, events } = await w.start({ title: input }, {})
        assert.equal(json?.ok, true, JSON.stringify(json))
        assert.equal(eventsOf(events, json.sessionId, 'rename')[0].title, input, 'rename gets the title exactly as given')
        assert.equal(json.title, expected)
        assert.equal('titleError' in json, false)
      })
    }
  })

  describe('SST-04 naming problems never stop the session', () => {
    it('SST-04 control: a start that names the session logs no warning', T, async () => {
      const logBefore = (await w.host.call('loggedProblems')).length
      const { json } = await w.start({ folder: w.folder('sst04-control') })
      assert.equal(json?.ok, true, JSON.stringify(json))
      assert.deepEqual(await w.host.call('loggedProblems', { since: logBefore }), [])
    })

    // 'invalid' makes rename throw the real SessionTitleInvalidError, 'fail' a plain Error.
    for (const [mode, code] of [['invalid', TITLE.invalid], ['fail', TITLE.failed]]) {
      it('rename throws (' + mode + ') → ' + code, T, async () => {
        const logBefore = (await w.host.call('loggedProblems')).length
        const answer = await w.start({ folder: w.folder('sst04-' + mode) }, { rename: mode })
        assertTitleError(answer, code)
        const { json, events } = answer
        assertRenamedBeforeSteer(events, json.sessionId)
        await assertDelivered(w, answer)
        if (mode === 'fail') {
          const problems = await w.host.call('loggedProblems', { since: logBefore })
          assert.ok(problems.some((p) => p.type === 'warn'), 'a warning is logged: ' + JSON.stringify(problems))
        }
      })
    }
  })

  describe('SST-05 the watch from notify_when_finished and the title fields combine', () => {
    // Decision table: rename outcome (ok, invalid) × flag (set, not set).
    const rows = [
      ['named, no flag', null, false],
      ['named, flag', null, true],
      ['title-invalid, no flag', 'invalid', false],
      ['title-invalid, flag', 'invalid', true],
    ]
    for (const [label, rename, notify] of rows) {
      it(label, T, async () => {
        const answer = await w.start({ ...(notify ? { notify_when_finished: true } : {}), folder: w.folder('sst05') }, { rename })
        const { json, call } = answer
        if (rename) assertTitleError(answer, TITLE.invalid)
        else {
          assert.equal(json?.ok, true, JSON.stringify(json))
          assert.equal(json.title, call.title)
          assert.equal('titleError' in json, false)
        }
        if (notify) {
          assert.equal(json.watch?.targetSessionId, json.sessionId, 'a watch on the new session: ' + JSON.stringify(json))
          assert.deepEqual(json.watch.createdBy, { kind: 'assistant' })
          assert.equal('watchError' in json, false)
          assert.equal((await noticesSettled(w.host, w.fb, json.watch.id, 1)).length, 1, 'one notice after its first turn')
        } else {
          assert.equal('watch' in json, false)
          assert.equal((await watchesOn(w.host, json.sessionId)).length, 0)
        }
        await assertDelivered(w, answer)
      })
    }

    it('SST-05b a first turn that fails at once is still reported once (reason error)', T, async () => {
      const message = tok('sst05b')
      await w.host.call('queueMarker', { marker: message, except: w.fb, script: [[{ fail: 'FBTEST_FATAL' }]] })
      const { json } = await w.start({ message, notify_when_finished: true })
      assert.equal(json?.ok, true, JSON.stringify(json))
      assert.equal(json.title, TITLE.plain)
      assert.ok(json.watch, 'a watch: ' + JSON.stringify(json))
      const notices = await noticesSettled(w.host, w.fb, json.watch.id, 1)
      assert.equal(notices.length, 1, 'the immediate turn end is reported')
      assert.equal(notices[0].source.summary, WATCH_SUMMARY('error'))
    })
  })

  describe('SST-06 a flush that cannot be confirmed still answers ok, unconfirmed', () => {
    // 'throw': the flush after the steer rejects. 'false': no durability listener took part.
    for (const [id, flush] of [['SST-06', 'throw'], ['SST-06b', 'false']]) {
      it(id + ' the flush ' + (flush === 'throw' ? 'rejects' : 'answers false'), T, async () => {
        const answer = await w.start({ folder: w.folder('sst06-' + flush) }, { flush })
        const { json, call, events } = answer
        assert.equal(json?.ok, true, JSON.stringify(json))
        assert.equal(json.unconfirmed, true)
        assert.equal(json.title, call.title, 'the title fields are included')
        assert.equal('titleError' in json, false)
        assert.equal(json.folder, call.folder)
        assert.equal(eventsOf(events, json.sessionId, 'steer').length, 1, 'steered once, so never delivered twice')
        await assertDelivered(w, answer, 'unconfirmed')
      })
    }
  })

  describe('SST-07 a failed delivery is refused delivery-failed with the sessionId and the title outcome, but no folder', () => {
    // Decision table: rename outcome (ok, throws the real SessionTitleInvalidError, throws a plain Error) with the steer throwing.
    const rows = [['named', null, null], ['title-invalid', 'invalid', TITLE.invalid], ['title-failed', 'fail', TITLE.failed]]
    for (const [label, rename, titleError] of rows) {
      it(label, T, async () => {
        const answer = await w.start({ folder: w.folder('sst07-' + label) }, { rename, steer: true })
        await assertFailedDelivery(w, answer, titleError)
        assertRenamedBeforeSteer(answer.events, answer.json.sessionId)
      })
    }
  })

  it('SST-08 message_session never calls rename and leaves the titles alone', T, async () => {
    const live = (await w.host.call('ordinary', { preset: PRESET.bare, folder: 'sst08-live' })).sessionId
    const cold = 'session-fbtest-cold-sst08'
    await w.host.call('seedBlankSession', { sessionId: cold, cwd: path.join(w.home, 'work', 'sst08-cold'), agentPreset: PRESET.bare })
    const titleBefore = await w.titleOf(live)
    await settledIdle(w.host, w.fb)
    await w.host.call('startProbe', {})
    try {
      for (const target of [live, cold]) {
        const message = tok('sst08')
        const { json } = await fishballCall(w.host, w.fb, 'message_session', { session_id: target, message })
        assert.equal(json?.ok, true, JSON.stringify(json))
        assert.ok(await until(async () => ((await w.received(target, message)) ?? []).length === 1, 10000, 100), 'delivered to ' + target)
      }
      assert.deepEqual((await w.host.call('probeEvents')).filter((e) => e.type === 'rename'), [], 'rename was never called')
    } finally { await w.host.call('stopProbe') }
    await settledIdle(w.host, live)
    assert.equal(await w.titleOf(live), titleBefore)
    assert.equal(await w.titleOf(cold), '', 'the resumed session still has no title')
  })
})

describe('start_session order of checks: message, title, hourly cap, folder', () => {
  const w = useHost('sst-order', { limits: { sessionsPerHour: 1 } })

  describe('ORD-01 the message is checked first', () => {
    // Everything else is wrong too: a bad title, a missing folder (the cap is still free here).
    const rows = [
      ['an empty message', '', P5_CODE.empty],
      ['a whitespace message', ' \n\t ', P5_CODE.empty],
      ['a too-large message', 'a'.repeat(LIMITS.maxMessageBytes.default + 1), P5_CODE.tooLarge],
    ]
    for (const [label, message, code] of rows) {
      it(label + ' → ' + code, T, async (t) => {
        await assertRefused(w, { message, title: '', folder: w.missing() }, [code], t)
      })
    }
  })

  describe('ORD-02 a title that is missing, not a string, empty, only whitespace or empty after normalizing is refused no-title', () => {
    // The folder is missing in every row: the title is checked before the folder. Strings must give no-title;
    // for the other types DSH validates arguments against the schema first and may answer a tool error (A51).
    // The invisible-only rows are exactly the titles DSH's normalizeSessionTitle reduces to empty.
    const strict = [TITLE.refused]
    const lenient = [TITLE.refused, TOOL_ERROR]
    const rows = [
      ['an empty title', '', strict],
      ['a title of spaces', '   ', strict],
      ['a title of line breaks and tabs', '\n\t\r\n', strict],
      ['a title of Unicode spaces', '\u00a0\u2003\u3000', strict],
      ['a zero-width space', '\u200b', strict],
      ['a left-to-right mark', '\u200e', strict],
      ['bidi overrides', '\u202e\u202c', strict],
      ['a word joiner and a byte order mark', '\u2060\ufeff', strict],
      ['control characters', '\u0000\u0007\u001f\u007f\u009f', strict],
      ['a colour escape sequence', '\u001b[31m\u001b[0m', strict],
      ['an operating-system-command escape sequence', '\u001b]0;hidden\u0007', strict],
      ['whitespace around invisible characters', ' \u200b\n\u202e\t ', strict],
    ]
    for (const [label, title, codes] of rows) {
      it(label + ' → ' + codes.join(' or '), T, async (t) => {
        assert.equal(emptyTitle(title), true, 'precondition: DSH reduces this title to empty')
        await assertRefused(w, { title, folder: w.missing() }, codes, t)
      })
    }
    // Not strings: DSH's argument check comes first, so a tool error is as good as no-title.
    const notStrings = [['no title', undefined], ['a number', 7], ['null', null], ['an array', ['title']], ['an object', { text: 'title' }]]
    for (const [label, title] of notStrings) {
      it(label + ' → ' + lenient.join(' or '), T, async (t) => {
        await assertRefused(w, { title, folder: w.missing() }, lenient, t)
      })
    }
  })

  describe('ORD-03 with a good title the folder is checked', () => {
    for (const [label, folder, code] of [['a missing folder', () => w.missing(), P5_CODE.noFolder], ['a relative path', () => 'work/start-here', P5_CODE.notAbsolute]]) {
      it(label + ' → ' + code, T, async (t) => { await assertRefused(w, { folder: folder() }, [code], t) })
    }
  })

  it('ORD-04 none of the refusals so far counted toward sessionsPerHour (1): a valid start still succeeds', T, async () => {
    const answer = await w.start()
    assert.equal(answer.json?.ok, true, JSON.stringify(answer.json))
    assert.equal(answer.json.title, TITLE.plain)
  })

  describe('ORD-05 with the hourly cap spent', () => {
    const rows = [
      ['a good call', {}, P5_CODE.hourlyCap],
      ['a good call with a missing folder (cap before folder)', { folder: () => w.missing() }, P5_CODE.hourlyCap],
      ['a bad title with a missing folder (title before cap)', { title: '', folder: () => w.missing() }, TITLE.refused],
      ['an empty message with a bad title (message before title)', { message: '', title: '' }, P5_CODE.empty],
      ['a too-large message with a bad title (message before title)', { message: 'a'.repeat(LIMITS.maxMessageBytes.default + 1), title: '' }, P5_CODE.tooLarge],
    ]
    for (const [label, args, code] of rows) {
      it(label + ' → ' + code, T, async (t) => {
        const resolved = Object.fromEntries(Object.entries(args).map(([k, v]) => [k, typeof v === 'function' ? v() : v]))
        await assertRefused(w, resolved, [code], t)
      })
    }
  })
})

describe('start_session without a DSH sessionTitle service', () => {
  const w = useHost('sst-none', { env: { FBTEST_NO_SESSION_TITLE: '1' }, limits: { sessionsPerHour: 0 } })

  it('UNA-01 the session starts, the message is delivered and recorded, and the answer says title-unavailable', T, async () => {
    assert.equal(await w.host.call('hasSessionTitle'), false, 'precondition: no sessionTitle service')
    const answer = await w.start({ folder: w.folder('una01') })
    assertTitleError(answer, TITLE.unavailable)
    await assertDelivered(w, answer)
    assert.equal(await w.titleOf(answer.json.sessionId), '', 'no title was set')
  })

  it('UNA-02 notify_when_finished still adds the watch next to titleError', T, async () => {
    const answer = await w.start({ notify_when_finished: true })
    assertTitleError(answer, TITLE.unavailable)
    assert.equal(answer.json.watch?.targetSessionId, answer.json.sessionId, JSON.stringify(answer.json))
    assert.equal((await noticesSettled(w.host, w.fb, answer.json.watch.id, 1)).length, 1, 'one notice after the first turn')
  })

  describe('UNA-03 a title that is empty is refused no-title even though titles cannot be set', () => {
    for (const [label, title] of [['an empty title', ''], ['a zero-width space', '\u200b']]) {
      it(label, T, async (t) => { await assertRefused(w, { title }, [TITLE.refused], t) })
    }
  })

  it('UNA-04 a failed delivery is refused with the sessionId and titleError title-unavailable, but no folder', T, async () => {
    const answer = await w.start({ folder: w.folder('una04') }, { steer: true })
    await assertFailedDelivery(w, answer, TITLE.unavailable)
  })
})
