/**
 * fishball-ui.connections: the Fishball page's ONE live connection (R1–R8, USE-CASES.md beside this
 * file). Two levels:
 * - component (page.mjs): fishball-ui's real client and parts, and fishball-taskboard's real browser
 *   half, in the F-SETTINGS scripted page with one EventSource stand-in; the readers are mounted and
 *   unmounted as DSH renders them;
 * - system (system.mjs): a real standalone DSH with core, fishball-ui and fishball-taskboard installed,
 *   its carrier route read from Node (R3/R4), and DSH's real web UI in headless Chromium (R1/R2/R7;
 *   skipped without Chromium, as the other page suites are).
 * No product file is read: every expectation is the requirement's.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { after, test } from 'node:test'
import { caseTest, caseName } from '../../contract/package-boundaries/cases.mjs'
import { chromeBinary } from '../../../v2-page-cases/lite-browser.mjs'
import { scenario } from '../../fishball-core/manager/subject.mjs'
import { FISHBALL_MODEL, MODEL } from '../../fishball-core/manager/constants.mjs'
import { stopBrowser } from '../../fishball-core/message-user/page.mjs'
import { browserZone } from '../model-dialog/targets.mjs'
import { BUDGET, CARRIER, CLIENT, COUNT, FIXTURE, NO_WARNING, TASKBOARD, TOPIC, UI, WORLD_EXTENSION } from './constants.mjs'
import { boardOnlyPage, fishballPage } from './page.mjs'
import { openPage, openWire } from './system.mjs'

const show = (v) => JSON.stringify(v)
const READERS = Object.freeze(['brand', 'sidebar', 'dock', 'board'])
const query = (lang, zone = browserZone()) => '?' + new URLSearchParams({ [CARRIER.langParam]: lang, [CARRIER.tzParam]: zone })
const last = (list) => list.at(-1)

export function registerConnectionCases(sdk) {
  registerComponentCases(sdk)
  registerSystemCases(sdk)
}

// ============================================================================ component level
function registerComponentCases(sdk) {
  const t = (id, row, title, fn) => caseTest(sdk, id, row, title, fn)
  /** R1/R2 at one moment: exactly `n` carriers open and no other source ever made. */
  const assertCarriers = (p, n, why) => {
    assert.equal(p.carriers().length, n, `${why}: open carriers ${show(p.paths())}`)
    assert.deepEqual(p.others(), [], `${why}: a retired per-view route was opened`)
  }
  const assertNoBudgetWarning = (p) => assert.deepEqual(p.console().filter((line) => line.startsWith(NO_WARNING.prefix) || NO_WARNING.word.test(line)), [], 'a connection-budget warning was logged (R8)')

  // ------------------------------------------------------------------ R1/R2 decision table: which readers are mounted
  t('CONN-DT-01', 'none', 'no reader mounted (the brand shell unmounted, nothing else) → no carrier, no EventSource at all', async (c) => {
    const p = await fishballPage(c, sdk, { readers: [] })
    assertCarriers(p, 0, 'no reader')
    assert.deepEqual(p.paths(), [])
  })
  for (const reader of READERS) {
    t('CONN-DT-01', reader + ' alone', `only the ${reader} mounted → exactly one EventSource, the carrier ${CARRIER.path}; none to ${CARRIER.retired.join(', ')}`, async (c) => {
      const p = await fishballPage(c, sdk, { readers: [reader] })
      assertCarriers(p, COUNT.fishball, reader)
      assert.equal(p.open().length, COUNT.fishball, show(p.paths()))
    })
  }
  t('CONN-DT-01', 'every reader', 'brand, sidebar targets, ask dock and Task board tab all mounted → exactly one EventSource (the carrier), made once', async (c) => {
    const p = await fishballPage(c, sdk)
    assert.deepEqual(p.mounted().sort(), [...READERS].sort())
    assertCarriers(p, COUNT.fishball, 'every reader')
    assert.equal(p.open().length, COUNT.fishball)
    assert.equal(p.madeCarriers().length, 1, 'the carrier was opened more than once')
    assertNoBudgetWarning(p)
  })

  // ------------------------------------------------------------------ R1: the carrier URL (EP: the two UI languages)
  for (const lang of CARRIER.langs) {
    t('CONN-EP-01', 'url ' + lang, `(${lang}) the carrier is page-relative ${CARRIER.relative}?lang=${lang}&tz=<the browser's IANA zone>`, async (c) => {
      const p = await fishballPage(c, sdk, { lang })
      const [carrier] = p.carriers()
      assert.ok(carrier, 'no carrier: ' + show(p.paths()))
      const url = new URL(carrier.url, p.world.base)
      assert.equal(url.href, new URL(CARRIER.relative + query(lang), p.world.base).href, 'not page-relative or not lang/tz')
      assert.equal(url.searchParams.get(CARRIER.langParam), lang)
      assert.equal(url.searchParams.get(CARRIER.tzParam), browserZone())
    })
  }

  // ------------------------------------------------------------------ R2 boundary: the number of amenity topics
  for (const n of [...COUNT.topics, COUNT.manyTopics]) {
    t('CONN-BVA-01', n + ' topics', `every reader mounted plus ${n} amenity topic subscriber(s) of fishballPageStream → still exactly one carrier, never reopened`, async (c) => {
      const p = await fishballPage(c, sdk)
      const members = []
      for (let i = 0; i < n; i++) members.push(await p.subscribe(TOPIC.fake(i)))
      assertCarriers(p, COUNT.fishball, n + ' topics')
      assert.equal(p.madeCarriers().length, 1, 'a topic subscription opened another carrier')
      for (const m of members) m.off()
      await p.settle()
      assertCarriers(p, COUNT.fishball, 'after the topics left')
      assert.equal(p.madeCarriers().length, 1, 'a topic leaving reopened the carrier')
      assertNoBudgetWarning(p)
    })
  }

  // ------------------------------------------------------------------ R2/R5 state transitions: readers come and go
  t('CONN-ST-01', 'mount one by one, unmount one by one', 'readers mount one at a time and then leave one at a time: one carrier from the first reader until the last leaves, the same source throughout; after the last, none', async (c) => {
    const p = await fishballPage(c, sdk, { readers: [] })
    for (const reader of READERS) {
      await p.mount(reader)
      assertCarriers(p, 1, 'after mounting ' + reader)
    }
    for (const reader of READERS) {
      await p.unmount(reader)
      assertCarriers(p, p.mounted().length > 0 ? 1 : 0, 'after unmounting ' + reader)
    }
    assert.equal(p.madeSinceStart(), 1, 'mounting or unmounting a reader reopened the carrier')
    assert.deepEqual(p.paths(), [], 'a source stayed open after the last reader left')
  })
  t('CONN-ST-02', 'last leaves → first comes again', 'the last reader left (carrier closed) → a reader mounts again: one new carrier opens', async (c) => {
    const p = await fishballPage(c, sdk, { readers: ['dock'] })
    await p.unmount('dock')
    assertCarriers(p, 0, 'after the last reader left')
    await p.mount('sidebar')
    assertCarriers(p, 1, 'after a new first reader')
    assert.equal(p.madeSinceStart(), 1)
  })
  t('CONN-ST-03', 'leaving the Fishball page', 'brand and sidebar targets mounted; <html data-fishball-page> removed (the page left) → the carrier closes; the mark back → one carrier again', async (c) => {
    const p = await fishballPage(c, sdk, { readers: ['brand', 'sidebar'] })
    assertCarriers(p, 1, 'on the page')
    await p.setPageMark(false)
    assertCarriers(p, 0, 'after leaving the page')
    await p.setPageMark(true)
    assertCarriers(p, 1, 'back on the page')
  })
  t('CONN-ST-04', 'service alone', 'no reader mounted; one fishballPageStream subscriber → the carrier opens; it unsubscribes → the carrier closes', async (c) => {
    const p = await fishballPage(c, sdk, { readers: [] })
    const m = await p.subscribe(TOPIC.fake(0))
    assertCarriers(p, 1, 'one subscriber')
    m.off()
    await p.settle()
    assertCarriers(p, 0, 'after the only subscriber left')
  })
  for (const [from, to] of [['en', 'zh'], ['zh', 'en']]) {
    t('CONN-ST-05', `language ${from} → ${to}`, `every reader mounted, UI language ${from} → ${to}: the old carrier is closed and exactly one carrier is open on lang=${to}`, async (c) => {
      const p = await fishballPage(c, sdk, { lang: from })
      const old = p.carriers()
      await p.setLang(to)
      assert.ok(old.every((s) => s.closed), 'the old-language carrier stayed open')
      assertCarriers(p, 1, 'after the language change')
      assert.equal(new URL(p.carriers()[0].url, p.world.base).searchParams.get(CARRIER.langParam), to)
      assert.equal(p.madeCarriers().length, 2, 'not exactly one replacement')
    })
  }

  // ------------------------------------------------------------------ R5: frames to members
  t('CONN-EP-02', 'routing by topic', 'two topics: a message for topic A reaches A\'s member only, with the frame unwrapped', async (c) => {
    const p = await fishballPage(c, sdk, { readers: [] })
    const a = await p.subscribe(TOPIC.fake(0))
    const b = await p.subscribe(TOPIC.fake(1))
    await p.push(TOPIC.fake(0), FIXTURE.fakeFrame(0))
    assert.deepEqual(a.frames, [FIXTURE.fakeFrame(0)])
    assert.deepEqual(b.frames, [])
  })
  t('CONN-EP-02', 'every member of a topic', 'two members of one topic each get each frame', async (c) => {
    const p = await fishballPage(c, sdk, { readers: [] })
    const a = await p.subscribe(TOPIC.fake(0))
    const b = await p.subscribe(TOPIC.fake(0))
    await p.push(TOPIC.fake(0), FIXTURE.fakeFrame(0, 1))
    await p.push(TOPIC.fake(0), FIXTURE.fakeFrame(0, 2))
    assert.deepEqual(a.frames, [FIXTURE.fakeFrame(0, 1), FIXTURE.fakeFrame(0, 2)])
    assert.deepEqual(b.frames, a.frames)
  })
  t('CONN-ST-06', 'late joiner', 'a member joining after the topic\'s frame arrived gets that last frame at once, and no source is opened for it', async (c) => {
    const p = await fishballPage(c, sdk, { readers: ['dock'] })
    const early = await p.subscribe(TOPIC.fake(0))
    await p.push(TOPIC.fake(0), FIXTURE.fakeFrame(0, 1))
    await p.push(TOPIC.fake(0), FIXTURE.fakeFrame(0, 2))
    const late = await p.subscribe(TOPIC.fake(0))
    assert.deepEqual(late.frames, [FIXTURE.fakeFrame(0, 2)], 'not the last frame at once')
    assert.equal(p.madeCarriers().length, 1)
    assert.equal(early.frames.length, 2)
  })
  t('CONN-ST-07', 'unsubscribed member', 'a member that unsubscribed gets no later frame and no later health', async (c) => {
    const p = await fishballPage(c, sdk, { readers: ['dock'] })
    const m = await p.subscribe(TOPIC.fake(0))
    m.off()
    await p.push(TOPIC.fake(0), FIXTURE.fakeFrame(0))
    await p.fail(false)
    assert.deepEqual(m.frames, [])
    assert.deepEqual(m.health, [])
  })
  // EP: wire data that is not a {topic, frame} message for the member's topic.
  const INVALID = [['not JSON', '{oops'], ['null', 'null'], ['an array', '[]'], ['no topic', show({ frame: FIXTURE.fakeFrame(0, 9) })], ['a non-string topic', show({ topic: 7, frame: FIXTURE.fakeFrame(0, 9) })], ['another topic', show({ topic: TOPIC.fake(99), frame: FIXTURE.fakeFrame(0, 9) })]]
  for (const [label, raw] of INVALID) {
    t('CONN-EP-03', label, `a wire message that is ${label} gives the member nothing; its last good frame stays and the carrier stays open`, async (c) => {
      const p = await fishballPage(c, sdk, { readers: [] })
      const m = await p.subscribe(TOPIC.fake(0))
      await p.push(TOPIC.fake(0), FIXTURE.fakeFrame(0, 1))
      await p.pushRaw(raw)
      assert.deepEqual(m.frames, [FIXTURE.fakeFrame(0, 1)])
      assertCarriers(p, 1, 'after ' + label)
      const late = await p.subscribe(TOPIC.fake(0))
      assert.deepEqual(late.frames, [FIXTURE.fakeFrame(0, 1)], 'the last good frame was replaced')
    })
  }

  // ------------------------------------------------------------------ R5: health is the carrier's, told to every member
  for (const [word, closed] of [[CLIENT.health.stale, false], [CLIENT.health.closed, true]]) {
    t('CONN-ST-08', word, `the carrier errors ${closed ? 'with readyState CLOSED' : 'while retrying (CONNECTING)'} → every member of every topic is told '${word}'; the next frame of any topic → '${CLIENT.health.live}' to all`, async (c) => {
      // Every reader: the Reconnect control is drawn by a reader that shows the carrier's health.
      const p = await fishballPage(c, sdk)
      const a = await p.subscribe(TOPIC.fake(0))
      const b = await p.subscribe(TOPIC.fake(1))
      await p.push(TOPIC.fake(0), FIXTURE.fakeFrame(0))
      await p.fail(closed)
      assert.equal(last(a.health), word, show(a.health))
      assert.equal(last(b.health), word, show(b.health))
      if (closed) await p.press(p.nodes().find((n) => n.props[CLIENT.retry] !== undefined))
      await p.push(TOPIC.fake(1), FIXTURE.fakeFrame(1))
      assert.equal(last(a.health), CLIENT.health.live, 'a member of the other topic stayed ' + show(a.health))
      assert.equal(last(b.health), CLIENT.health.live, show(b.health))
    })
  }
  t('CONN-ST-09', 'Reconnect', 'closed → Reconnect ([data-fishball-stream-retry]): the old source closed, one fresh carrier open, members read stale (not closed) until the next frame, then live', async (c) => {
    const p = await fishballPage(c, sdk)
    const m = await p.subscribe(TOPIC.fake(0))
    await p.push(TOPIC.fake(0), FIXTURE.fakeFrame(0))
    const old = p.carriers()
    await p.fail(true)
    assert.equal(last(m.health), CLIENT.health.closed)
    const retry = p.nodes().filter((n) => n.props[CLIENT.retry] !== undefined)
    assert.ok(retry.length > 0, 'no Reconnect control while closed')
    await p.press(retry[0])
    assert.ok(old.every((s) => s.closed), 'the old source stayed open')
    assertCarriers(p, 1, 'after Reconnect')
    assert.equal(p.madeCarriers().length, 2)
    assert.equal(last(m.health), CLIENT.health.stale, 'not stale until a frame: ' + show(m.health))
    await p.push(TOPIC.fake(0), FIXTURE.fakeFrame(0, 1))
    assert.equal(last(m.health), CLIENT.health.live)
    assert.deepEqual(last(m.frames), FIXTURE.fakeFrame(0, 1))
  })

  // ------------------------------------------------------------------ R6: fishball-taskboard on the carrier
  const firstBoard = TASKBOARD.boardOf([TASKBOARD.titles.first])
  t('CONN-TB-01', 'rides the carrier', 'with fishballPageStream present the Task board tab opens no connection of its own and draws the board the carrier\'s fishball-taskboard topic sends', async (c) => {
    const p = await fishballPage(c, sdk, { readers: ['board'] })
    assertCarriers(p, 1, 'board alone')
    await p.push(TOPIC.taskboard, firstBoard)
    assert.ok(p.boardText().includes(TASKBOARD.titles.first), 'the board did not draw the carrier frame: ' + p.boardText().slice(0, 200))
    await p.push(TOPIC.taskboard, TASKBOARD.boardOf([TASKBOARD.titles.first, TASKBOARD.titles.second], 2))
    assert.ok(p.boardText().includes(TASKBOARD.titles.second), 'a later frame was not drawn')
  })
  t('CONN-TB-02', 'no visibility gating', 'the Task board tab alone, hidden (tab.visible false, sidebar collapsed) → the carrier stays open and is not reopened; a frame sent while hidden is drawn when shown again', async (c) => {
    const p = await fishballPage(c, sdk, { readers: ['board'] })
    await p.push(TOPIC.taskboard, firstBoard)
    await p.setBoardVisible(0, false)
    assertCarriers(p, 1, 'hidden')
    await p.push(TOPIC.taskboard, TASKBOARD.boardOf([TASKBOARD.titles.hidden], 2))
    await p.setBoardVisible(0, true)
    assertCarriers(p, 1, 'shown again')
    assert.equal(p.madeCarriers().length, 1, 'hiding or showing the tab reopened the carrier')
    assert.ok(p.boardText().includes(TASKBOARD.titles.hidden), 'the frame sent while hidden is not drawn')
  })
  t('CONN-TB-03', 'two tabs', 'two Task board tabs mounted → one carrier; both draw each frame', async (c) => {
    const p = await fishballPage(c, sdk, { readers: ['board'] })
    await p.mountBoard(1)
    assertCarriers(p, 1, 'two tabs')
    await p.push(TOPIC.taskboard, firstBoard)
    for (const id of [0, 1]) assert.ok(p.boardText(id).includes(TASKBOARD.titles.first), 'tab ' + id)
  })
  for (const [label, frame] of [['null', null], ['a string', 'fbtest-not-a-board']]) {
    t('CONN-TB-04', 'invalid frame ' + label, `a fishball-taskboard frame that is ${label} keeps the last good board drawn`, async (c) => {
      const p = await fishballPage(c, sdk, { readers: ['board'] })
      await p.push(TOPIC.taskboard, firstBoard)
      await p.push(TOPIC.taskboard, frame)
      assert.ok(p.boardText().includes(TASKBOARD.titles.first), 'the last good board is gone: ' + p.boardText().slice(0, 200))
    })
  }
  t('CONN-TB-05', 'standalone fallback', `without fishball-ui (no fishballPageStream) the Task board tab opens its own ${TASKBOARD.events} and no carrier; unmounted → closed`, async (c) => {
    const p = await boardOnlyPage(c, sdk)
    assert.equal(p.service(), undefined, 'precondition: no fishballPageStream')
    await p.mountBoard(0)
    assert.deepEqual(p.paths(), [TASKBOARD.events])
    assert.equal(p.carriers().length, 0)
    await p.unmountBoard(0)
    assert.deepEqual(p.paths(), [])
  })

  // ------------------------------------------------------------------ R8: no budget warning, even far past the old budget
  t('CONN-EP-04', 'no budget warning', 'every reader, 20 topics, a language change and a Reconnect → nothing logs a connection-budget warning', async (c) => {
    const p = await fishballPage(c, sdk)
    for (let i = 0; i < COUNT.manyTopics; i++) await p.subscribe(TOPIC.fake(i))
    await p.setLang('zh')
    await p.fail(true)
    const retry = p.nodes().find((n) => n.props[CLIENT.retry] !== undefined)
    if (retry) await p.press(retry)
    assertCarriers(p, 1, 'at the end')
    assertNoBudgetWarning(p)
  })
}

// ============================================================================ system level
function registerSystemCases(sdk) {
  const browser = Boolean(chromeBinary())
  after(stopBrowser)
  const zone = browserZone()
  const facts = scenario('fbconn-' + sdk.replace(/\W/g, '-'), sdk, [
    async (boot, f) => {
      const h = await boot()
      f.manager = (await h.request('/api/fishball/session', { method: 'POST', body: {} })).json?.sessionId
      if (typeof f.manager !== 'string') throw new Error('no manager session')
      await h.call('mutate', { ops: [{ op: 'set', path: [...FISHBALL_MODEL.path], value: MODEL.routable }] })
      await h.call('idle', { sessionId: f.manager })
      f.face = await h.call('pageFace')

      // R3: the registration contract.
      f.badTopics = {}
      for (const [label, topic] of [['empty', ''], ['number', 7], ['null', null]]) f.badTopics[label] = await h.call('pageRegisterRaw', { topic, provider: 'ok' })
      f.badProviders = {}
      for (const shape of ['none', 'null', 'string', 'noFrame', 'noOnChange', 'frameNotFn']) f.badProviders[shape] = await h.call('pageRegisterRaw', { topic: TOPIC.fake('bad-' + shape), provider: shape })
      f.first = await h.call('pageRegister', { topic: TOPIC.fake(0), value: FIXTURE.fakeFrame(0) })
      f.duplicate = await h.call('pageRegister', { topic: TOPIC.fake(0), value: FIXTURE.fakeFrame(0, 1) })
      f.builtinDuplicate = {}
      for (const name of [TOPIC.asks, TOPIC.strip, TOPIC.taskboard]) f.builtinDuplicate[name] = await h.call('pageRegister', { topic: name, value: null })

      // R4: one carrier read from Node (en), then changes, then a second carrier (zh).
      const en = await openWire(h, query('en', zone))
      f.wireStatus = { status: en.status, type: en.type }
      await en.wait((m) => [TOPIC.asks, TOPIC.strip, TOPIC.taskboard, TOPIC.fake(0)].every((topic) => m.some((x) => x?.topic === topic)))
      await sleepQuiet()
      f.atOpen = [...en.messages]
      f.board = (await h.request(TASKBOARD.board)).json
      f.urls = await h.call('pageUrls', { topic: TOPIC.fake(0) })
      await h.call('pageChange', { topic: TOPIC.fake(0), value: FIXTURE.fakeFrame(0, 1) })
      await en.wait((m) => m.filter((x) => x?.topic === TOPIC.fake(0)).length >= 2)
      await h.call('pageTouch', { topic: TOPIC.fake(0) })
      await h.call('pageChange', { topic: TOPIC.fake(0), value: FIXTURE.fakeFrame(0, 1) })
      await sleepQuiet()
      f.afterChange = en.of(TOPIC.fake(0)).map((m) => m.frame)
      f.late = await h.call('pageRegister', { topic: TOPIC.fake(1), value: FIXTURE.fakeFrame(1) })
      await en.wait((m) => m.some((x) => x?.topic === TOPIC.fake(1)))
      f.lateFrames = en.of(TOPIC.fake(1)).map((m) => m.frame)
      await h.call('pageThrow', { topic: TOPIC.fake(1), throws: true })
      await h.call('pageChange', { topic: TOPIC.fake(1), value: FIXTURE.fakeFrame(1, 1) })
      await h.call('pageChange', { topic: TOPIC.fake(0), value: FIXTURE.fakeFrame(0, 2) })
      await en.wait((m) => m.some((x) => x?.topic === TOPIC.fake(0) && x.frame?.n === 2))
      await sleepQuiet()
      f.throwing = { thrower: en.of(TOPIC.fake(1)).map((m) => m.frame), other: en.of(TOPIC.fake(0)).map((m) => m.frame) }
      const zh = await openWire(h, query('zh', zone))
      await zh.wait((m) => m.some((x) => x?.topic === TOPIC.strip) && m.some((x) => x?.topic === TOPIC.fake(0)))
      await sleepQuiet()
      f.zhAtOpen = [...zh.messages]
      await h.call('pageThrow', { topic: TOPIC.fake(1), throws: false })
      await h.call('pageDispose', { topic: TOPIC.fake(0) })
      await h.call('pageChange', { topic: TOPIC.fake(0), value: FIXTURE.fakeFrame(0, 3) })
      await h.call('pageChange', { topic: TOPIC.fake(1), value: FIXTURE.fakeFrame(1, 2) })
      await en.wait((m) => m.some((x) => x?.topic === TOPIC.fake(1) && x.frame?.n === 2))
      await sleepQuiet()
      f.afterDispose = en.of(TOPIC.fake(0)).map((m) => m.frame)
      f.allMessages = [...en.messages, ...zh.messages]
      await en.close()
      await zh.close()
      await h.call('pageDisposeAll')
      if (!browser) return

      // R1/R2/R7: DSH's real page, every panel, 0 → 1 → 5 amenity topics, the Task board shown and hidden.
      const page = await openPage(h)
      f.pageReady = await page.ready()
      const counts = {}
      const measure = async (label) => { counts[label] = await page.settled((s) => s.fishball.length >= COUNT.fishball) }
      await measure('topics 0')
      await h.call('pageRegister', { topic: TOPIC.fake('p0'), value: FIXTURE.fakeFrame(0) })
      await measure('topics 1')
      for (let i = 1; i < COUNT.topics.at(-1); i++) await h.call('pageRegister', { topic: TOPIC.fake('p' + i), value: FIXTURE.fakeFrame(i) })
      await measure('topics 5')
      f.boardOpened = await page.openTaskBoard()
      await measure('Task board shown')
      f.send = await page.send(UI.text)
      f.imageAttached = await page.attachImage()
      f.imageSend = await page.send(UI.imageText)
      await measure('after the sends')
      f.collapsed = await page.collapseRight()
      await measure('Task board hidden')
      await h.call('pageDisposeAll')
      await measure('topics withdrawn')
      f.counts = counts
      f.ever = page.ever()
      f.pageConsole = page.console()
      f.origin = h.origin
      await page.close()
    },
  ], { env: { FBTEST_WORLD_EXTENSION: WORLD_EXTENSION } })
  const read = async (...keys) => {
    const f = await facts()
    for (const key of keys) if (f[key] === undefined) throw f.error ?? new Error('fact ' + key + ' was not collected')
    return f
  }
  const wireTest = (id, row, title, fn) => test(caseName(sdk, id, row, title), fn)
  const pageTest = (id, row, title, fn) => test(caseName(sdk, id, row, title), browser ? {} : { skip: 'no Chromium binary (the LITE rows skip so too)' }, fn)

  // ------------------------------------------------------------------ R3: the Host registration
  wireTest('CONN-SYS-EP-01', 'face', `ctx.get('${TOPIC.service}') is apiVersion ${TOPIC.apiVersion} with page.register a function; register answers a dispose function`, async () => {
    const f = await read('face', 'first')
    assert.deepEqual(f.face, { apiVersion: TOPIC.apiVersion, register: 'function' })
    assert.deepEqual(f.first, { ok: true, dispose: 'function' })
  })
  for (const label of ['empty', 'number', 'null']) {
    wireTest('CONN-SYS-EP-02', 'topic ' + label, `a topic that is ${label === 'empty' ? 'the empty string' : 'a ' + label} → TypeError`, async () => {
      const f = await read('badTopics')
      assert.equal(f.badTopics[label]?.name, 'TypeError', show(f.badTopics[label]))
    })
  }
  for (const shape of ['none', 'null', 'string', 'noFrame', 'noOnChange', 'frameNotFn']) {
    wireTest('CONN-SYS-EP-03', 'provider ' + shape, `a provider that is ${shape} (not {frame(url), onChange(fn)}) → TypeError`, async () => {
      const f = await read('badProviders')
      assert.equal(f.badProviders[shape]?.name, 'TypeError', show(f.badProviders[shape]))
    })
  }
  wireTest('CONN-SYS-EP-04', 'duplicate', 'registering a topic name already registered throws (a fake topic twice, and each built-in name)', async () => {
    const f = await read('duplicate', 'builtinDuplicate')
    assert.equal(f.duplicate.ok, false, show(f.duplicate))
    for (const [name, answer] of Object.entries(f.builtinDuplicate)) assert.equal(answer.ok, false, name + ': ' + show(answer))
  })

  // ------------------------------------------------------------------ R4: the wire
  wireTest('CONN-SYS-UC-01', 'open', `GET ${CARRIER.path}?lang&tz → 200 text/event-stream; at open exactly one {topic, frame} message per registered topic (asks, strip, fishball-taskboard and the fake one)`, async () => {
    const f = await read('wireStatus', 'atOpen')
    assert.equal(f.wireStatus.status, 200)
    assert.match(String(f.wireStatus.type), /^text\/event-stream/)
    for (const m of f.atOpen) assert.deepEqual(Object.keys(m ?? {}).sort(), [...TOPIC.wireKeys], 'not {topic, frame}: ' + show(m))
    const topics = f.atOpen.map((m) => m.topic).sort()
    assert.deepEqual(topics, [TOPIC.asks, TOPIC.taskboard, TOPIC.fake(0), TOPIC.strip].sort(), 'not one message per topic')
  })
  wireTest('CONN-SYS-EP-05', 'built-in frames', 'asks frame is {managerSessionId: the manager, cards: []}; fishball-taskboard frame equals GET /api/fishball-taskboard/board; strip frame carries on and brandStyle', async () => {
    const f = await read('atOpen', 'board', 'manager')
    const frameOf = (topic) => f.atOpen.find((m) => m.topic === topic)?.frame
    assert.equal(frameOf(TOPIC.asks)?.managerSessionId, f.manager)
    assert.ok(Array.isArray(frameOf(TOPIC.asks)?.cards), show(frameOf(TOPIC.asks)))
    assert.deepEqual(frameOf(TOPIC.taskboard), f.board)
    assert.equal(typeof frameOf(TOPIC.strip)?.on, 'boolean', show(frameOf(TOPIC.strip)))
    assert.ok(Object.hasOwn(frameOf(TOPIC.strip) ?? {}, 'brandStyle'), 'no brandStyle in the strip frame')
  })
  wireTest('CONN-SYS-EP-06', 'frame(url)', 'a provider is asked frame(url) with the carrier\'s request URL: its path and the lang and tz it was opened with', async () => {
    const f = await read('urls')
    assert.ok(f.urls.length > 0, 'frame(url) was never called')
    const url = new URL(f.urls[0])
    assert.equal(url.pathname, CARRIER.path)
    assert.equal(url.searchParams.get(CARRIER.langParam), 'en')
    assert.equal(url.searchParams.get(CARRIER.tzParam), zone)
  })
  wireTest('CONN-SYS-EP-07', 'strip in the language', 'the strip frame is drawn in the carrier\'s language: the zh carrier\'s strip frame differs from the en one', async () => {
    const f = await read('atOpen', 'zhAtOpen')
    const en = f.atOpen.find((m) => m.topic === TOPIC.strip)?.frame
    const zh = f.zhAtOpen.find((m) => m.topic === TOPIC.strip)?.frame
    assert.ok(en && zh, 'a strip frame is missing')
    assert.notDeepEqual(zh, en)
  })
  wireTest('CONN-SYS-ST-01', 'change, no repeat', 'onChange with a new value → one message with it; onChange with the same value (told twice) → no message', async () => {
    const f = await read('afterChange')
    assert.deepEqual(f.afterChange, [FIXTURE.fakeFrame(0), FIXTURE.fakeFrame(0, 1)])
  })
  wireTest('CONN-SYS-ST-02', 'registered while open', 'a topic registered while the carrier is open is sent to it at once', async () => {
    const f = await read('late', 'lateFrames')
    assert.equal(f.late.ok, true)
    assert.deepEqual(f.lateFrames, [FIXTURE.fakeFrame(1)])
  })
  wireTest('CONN-SYS-ST-03', 'a throwing provider', 'a provider whose frame() throws: that topic is skipped, the carrier stays and another topic\'s change still arrives; a carrier opened meanwhile still sends the other topics', async () => {
    const f = await read('throwing', 'zhAtOpen')
    assert.deepEqual(f.throwing.thrower, [FIXTURE.fakeFrame(1)], 'the throwing topic sent something')
    assert.deepEqual(f.throwing.other.at(-1), FIXTURE.fakeFrame(0, 2), 'the other topic stopped')
    const zhTopics = f.zhAtOpen.map((m) => m.topic)
    assert.ok([TOPIC.asks, TOPIC.strip, TOPIC.taskboard, TOPIC.fake(0)].every((topic) => zhTopics.includes(topic)), show(zhTopics))
    assert.equal(zhTopics.includes(TOPIC.fake(1)), false, 'the throwing topic was sent at open')
  })
  wireTest('CONN-SYS-ST-04', 'disposed topic', 'after its dispose a topic sends nothing more, while another still does', async () => {
    const f = await read('afterDispose')
    assert.equal(f.afterDispose.some((frame) => frame?.n === 3), false, show(f.afterDispose))
  })

  // ------------------------------------------------------------------ R1/R2/R7: DSH's real page
  pageTest('CONN-SYS-DT-01', 'constant count', `DSH's real Fishball page with every panel: 0, 1, 5 amenity topics, the Task board shown, after two sends, the Task board hidden, topics withdrawn → each time exactly ${COUNT.origin} EventSources to the origin (DSH's /plugins/events and the carrier), ${COUNT.fishball} of them Fishball's`, async () => {
    const f = await read('counts', 'pageReady')
    assert.equal(f.pageReady, true, 'the Fishball page with DSH\'s composer never appeared')
    for (const [label, split] of Object.entries(f.counts)) {
      assert.equal(split.fishball.length, COUNT.fishball, label + ': ' + show(split))
      assert.equal(split.fishball[0].split('?')[0], CARRIER.path, label + ': ' + show(split))
      assert.equal(split.origin.length, COUNT.origin, label + ': ' + show(split))
      assert.ok(split.origin.some((p) => COUNT.dshStream.test(p.split('?')[0])), label + ': no DSH /plugins/events ' + show(split))
      assert.deepEqual(split.other, [], label)
    }
  })
  pageTest('CONN-SYS-ST-05', 'never reopened', 'over the whole page life (topics registered and withdrawn, Task board opened and hidden, sends) the carrier was opened once, and no retired route was ever opened', async () => {
    const f = await read('ever')
    const paths = f.ever.map((u) => new URL(u).pathname)
    assert.deepEqual(paths.filter((p) => CARRIER.retired.includes(p)), [], show(f.ever))
    assert.equal(paths.filter((p) => p === CARRIER.path).length, 1, show(f.ever))
    assert.ok(f.ever.filter((u) => new URL(u).pathname === CARRIER.path).every((u) => new URL(u).searchParams.get(CARRIER.tzParam) === zone && new URL(u).searchParams.has(CARRIER.langParam)), show(f.ever))
  })
  pageTest('CONN-SYS-UC-02', 'send', `every panel mounted and the Task board tab open: a text send from DSH's composer reaches the model and the composer leaves its sending state (no [data-sending], editor empty) within ${BUDGET.sendMs} ms`, async () => {
    const f = await read('send', 'boardOpened')
    assert.equal(f.boardOpened, true, String(f.boardOpened))
    assert.equal(f.send.received, true, 'the model never received the send: ' + show(f.send))
    assert.equal(f.send.left, true, 'the composer stayed sending: ' + show(f.send.state))
    assert.equal(f.send.carries, true, 'no model request of the send carries its text')
  })
  pageTest('CONN-SYS-UC-03', 'send with an image', `the same with an image attached through the composer's file input: the model receives it and the composer leaves its sending state within ${BUDGET.sendMs} ms`, async () => {
    const f = await read('imageSend', 'imageAttached')
    assert.equal(f.imageAttached, true, 'the image never reached the composer: ' + show(f.imageAttached))
    assert.equal(f.imageSend.received, true, 'the model never received the send: ' + show(f.imageSend))
    assert.equal(f.imageSend.left, true, 'the composer stayed sending: ' + show(f.imageSend.state))
    assert.equal(f.imageSend.carries, true, 'no model request of the send carries its text')
  })
  pageTest('CONN-SYS-EP-08', 'no budget warning', 'the page logs no connection-budget warning', async () => {
    const f = await read('pageConsole')
    assert.deepEqual(f.pageConsole.filter((l) => l.text.startsWith(NO_WARNING.prefix) || NO_WARNING.word.test(l.text)), [])
  })
}

/** Waits a quiet moment so a message that should NOT arrive has had its chance. */
const sleepQuiet = () => new Promise((resolve) => setTimeout(resolve, BUDGET.quietMs))