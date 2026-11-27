/**
 * fishball-ui.connections: the Fishball page's ONE live connection (R1–R8, README.md beside this
 * file), at the component level: fishball-ui's real client and parts alone in the scripted page with
 * one EventSource stand-in; the readers are mounted and unmounted as DSH renders them.
 *
 * The rows that need a second package are integration rows, not here: fishball-taskboard's tab on
 * the carrier (CONN-TB-*) needs fishball-taskboard's browser half beside fishball-ui, and the system
 * rows (CONN-SYS-*) need a booted DSH with fishball-core, fishball-ui and fishball-taskboard.
 * No product file is read: every expectation is the requirement's.
 */
import assert from 'node:assert/strict'
import { caseTest } from 'fishball-test-helpers/cases'
import { browserZone } from '../support/page-stream.mjs'
import { CARRIER, CLIENT, COUNT, FIXTURE, NO_WARNING, READERS } from './constants.mjs'
import { fishballPage } from './page.mjs'

const show = (v) => JSON.stringify(v)
const query = (lang, zone = browserZone()) => '?' + new URLSearchParams({ [CARRIER.langParam]: lang, [CARRIER.tzParam]: zone })
const last = (list) => list.at(-1)

export function registerConnectionCases() {
  const t = caseTest
  /** R1/R2 at one moment: exactly `n` carriers open and no other source ever made. */
  const assertCarriers = (p, n, why) => {
    assert.equal(p.carriers().length, n, `${why}: open carriers ${show(p.paths())}`)
    assert.deepEqual(p.others(), [], `${why}: a retired per-view route was opened`)
  }
  const assertNoBudgetWarning = (p) => assert.deepEqual(p.console().filter((line) => line.startsWith(NO_WARNING.prefix) || NO_WARNING.word.test(line)), [], 'a connection-budget warning was logged (R8)')

  // ------------------------------------------------------------------ R1/R2 decision table: which readers are mounted
  t('CONN-DT-01', 'none', 'no reader mounted (the brand shell unmounted, nothing else) → no carrier, no EventSource at all', async (c) => {
    const p = await fishballPage(c, { readers: [] })
    assertCarriers(p, 0, 'no reader')
    assert.deepEqual(p.paths(), [])
  })
  for (const reader of READERS) {
    t('CONN-DT-01', reader + ' alone', `only the ${reader} mounted → exactly one EventSource, the carrier ${CARRIER.path}; none to ${CARRIER.retired.join(', ')}`, async (c) => {
      const p = await fishballPage(c, { readers: [reader] })
      assertCarriers(p, COUNT.fishball, reader)
      assert.equal(p.open().length, COUNT.fishball, show(p.paths()))
    })
  }
  t('CONN-DT-01', 'every reader', 'brand, sidebar targets and ask dock all mounted → exactly one EventSource (the carrier), made once', async (c) => {
    const p = await fishballPage(c)
    assert.deepEqual(p.mounted().sort(), [...READERS].sort())
    assertCarriers(p, COUNT.fishball, 'every reader')
    assert.equal(p.open().length, COUNT.fishball)
    assert.equal(p.madeCarriers().length, 1, 'the carrier was opened more than once')
    assertNoBudgetWarning(p)
  })

  // ------------------------------------------------------------------ R1: the carrier URL (EP: the two UI languages)
  for (const lang of CARRIER.langs) {
    t('CONN-EP-01', 'url ' + lang, `(${lang}) the carrier is page-relative ${CARRIER.relative}?lang=${lang}&tz=<the browser's IANA zone>`, async (c) => {
      const p = await fishballPage(c, { lang })
      const [carrier] = p.carriers()
      assert.ok(carrier, 'no carrier: ' + show(p.paths()))
      const url = new URL(carrier.url, p.world.base)
      assert.equal(url.href, new URL(CARRIER.relative + query(lang), p.world.base).href, 'not page-relative or not lang/tz')
      assert.equal(url.searchParams.get(CARRIER.langParam), lang)
      assert.equal(url.searchParams.get(CARRIER.tzParam), browserZone())
    })
  }

  // ------------------------------------------------------------------ R2 boundary: the number of amenity topics
  for (const n of COUNT.topics) {
    t('CONN-BVA-01', n + ' topics', `every reader mounted plus ${n} amenity topic subscriber(s) of fishballPageStream → still exactly one carrier, never reopened`, async (c) => {
      const p = await fishballPage(c)
      const members = []
      for (let i = 0; i < n; i++) members.push(await p.subscribe(FIXTURE.topic(i)))
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
    const p = await fishballPage(c, { readers: [] })
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
    const p = await fishballPage(c, { readers: ['dock'] })
    await p.unmount('dock')
    assertCarriers(p, 0, 'after the last reader left')
    await p.mount('sidebar')
    assertCarriers(p, 1, 'after a new first reader')
    assert.equal(p.madeSinceStart(), 1)
  })
  t('CONN-ST-03', 'leaving the Fishball page', 'brand and sidebar targets mounted; <html data-fishball-page> removed (the page left) → the carrier closes; the mark back → one carrier again', async (c) => {
    const p = await fishballPage(c, { readers: ['brand', 'sidebar'] })
    assertCarriers(p, 1, 'on the page')
    await p.setPageMark(false)
    assertCarriers(p, 0, 'after leaving the page')
    await p.setPageMark(true)
    assertCarriers(p, 1, 'back on the page')
  })
  t('CONN-ST-04', 'service alone', 'no reader mounted; one fishballPageStream subscriber → the carrier opens; it unsubscribes → the carrier closes', async (c) => {
    const p = await fishballPage(c, { readers: [] })
    const m = await p.subscribe(FIXTURE.topic(0))
    assertCarriers(p, 1, 'one subscriber')
    m.off()
    await p.settle()
    assertCarriers(p, 0, 'after the only subscriber left')
  })
  for (const [from, to] of [['en', 'zh'], ['zh', 'en']]) {
    t('CONN-ST-05', `language ${from} → ${to}`, `every reader mounted, UI language ${from} → ${to}: the old carrier is closed and exactly one carrier is open on lang=${to}`, async (c) => {
      const p = await fishballPage(c, { lang: from })
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
    const p = await fishballPage(c, { readers: [] })
    const a = await p.subscribe(FIXTURE.topic(0))
    const b = await p.subscribe(FIXTURE.topic(1))
    await p.push(FIXTURE.topic(0), FIXTURE.frame(0))
    assert.deepEqual(a.frames, [FIXTURE.frame(0)])
    assert.deepEqual(b.frames, [])
  })
  t('CONN-EP-02', 'every member of a topic', 'two members of one topic each get each frame', async (c) => {
    const p = await fishballPage(c, { readers: [] })
    const a = await p.subscribe(FIXTURE.topic(0))
    const b = await p.subscribe(FIXTURE.topic(0))
    await p.push(FIXTURE.topic(0), FIXTURE.frame(0, 1))
    await p.push(FIXTURE.topic(0), FIXTURE.frame(0, 2))
    assert.deepEqual(a.frames, [FIXTURE.frame(0, 1), FIXTURE.frame(0, 2)])
    assert.deepEqual(b.frames, a.frames)
  })
  t('CONN-ST-06', 'late joiner', 'a member joining after the topic\'s frame arrived gets that last frame at once, and no source is opened for it', async (c) => {
    const p = await fishballPage(c, { readers: ['dock'] })
    const early = await p.subscribe(FIXTURE.topic(0))
    await p.push(FIXTURE.topic(0), FIXTURE.frame(0, 1))
    await p.push(FIXTURE.topic(0), FIXTURE.frame(0, 2))
    const late = await p.subscribe(FIXTURE.topic(0))
    assert.deepEqual(late.frames, [FIXTURE.frame(0, 2)], 'not the last frame at once')
    assert.equal(p.madeCarriers().length, 1)
    assert.equal(early.frames.length, 2)
  })
  t('CONN-ST-07', 'unsubscribed member', 'a member that unsubscribed gets no later frame and no later health', async (c) => {
    const p = await fishballPage(c, { readers: ['dock'] })
    const m = await p.subscribe(FIXTURE.topic(0))
    m.off()
    await p.push(FIXTURE.topic(0), FIXTURE.frame(0))
    await p.fail(false)
    assert.deepEqual(m.frames, [])
    assert.deepEqual(m.health, [])
  })
  // EP: wire data that is not a {topic, frame} message for the member's topic.
  const INVALID = [['not JSON', '{oops'], ['null', 'null'], ['an array', '[]'], ['no topic', show({ frame: FIXTURE.frame(0, 9) })], ['a non-string topic', show({ topic: 7, frame: FIXTURE.frame(0, 9) })], ['another topic', show({ topic: FIXTURE.topic(99), frame: FIXTURE.frame(0, 9) })]]
  for (const [label, raw] of INVALID) {
    t('CONN-EP-03', label, `a wire message that is ${label} gives the member nothing; its last good frame stays and the carrier stays open`, async (c) => {
      const p = await fishballPage(c, { readers: [] })
      const m = await p.subscribe(FIXTURE.topic(0))
      await p.push(FIXTURE.topic(0), FIXTURE.frame(0, 1))
      await p.pushRaw(raw)
      assert.deepEqual(m.frames, [FIXTURE.frame(0, 1)])
      assertCarriers(p, 1, 'after ' + label)
      const late = await p.subscribe(FIXTURE.topic(0))
      assert.deepEqual(late.frames, [FIXTURE.frame(0, 1)], 'the last good frame was replaced')
    })
  }

  // ------------------------------------------------------------------ R5: health is the carrier's, told to every member
  for (const [word, closed] of [[CLIENT.health.stale, false], [CLIENT.health.closed, true]]) {
    t('CONN-ST-08', word, `the carrier errors ${closed ? 'with readyState CLOSED' : 'while retrying (CONNECTING)'} → every member of every topic is told '${word}'; the next frame of any topic → '${CLIENT.health.live}' to all`, async (c) => {
      // Every reader: the Reconnect control is drawn by a reader that shows the carrier's health.
      const p = await fishballPage(c)
      const a = await p.subscribe(FIXTURE.topic(0))
      const b = await p.subscribe(FIXTURE.topic(1))
      await p.push(FIXTURE.topic(0), FIXTURE.frame(0))
      await p.fail(closed)
      assert.equal(last(a.health), word, show(a.health))
      assert.equal(last(b.health), word, show(b.health))
      if (closed) await p.press(p.nodes().find((n) => n.props[CLIENT.retry] !== undefined))
      await p.push(FIXTURE.topic(1), FIXTURE.frame(1))
      assert.equal(last(a.health), CLIENT.health.live, 'a member of the other topic stayed ' + show(a.health))
      assert.equal(last(b.health), CLIENT.health.live, show(b.health))
    })
  }
  t('CONN-ST-09', 'Reconnect', 'closed → Reconnect ([data-fishball-stream-retry]): the old source closed, one fresh carrier open, members read stale (not closed) until the next frame, then live', async (c) => {
    const p = await fishballPage(c)
    const m = await p.subscribe(FIXTURE.topic(0))
    await p.push(FIXTURE.topic(0), FIXTURE.frame(0))
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
    await p.push(FIXTURE.topic(0), FIXTURE.frame(0, 1))
    assert.equal(last(m.health), CLIENT.health.live)
    assert.deepEqual(last(m.frames), FIXTURE.frame(0, 1))
  })

  // ------------------------------------------------------------------ R8: no budget warning, even far past the old budget
  t('CONN-EP-04', 'no budget warning', 'every reader, 20 topics, a language change and a Reconnect → nothing logs a connection-budget warning', async (c) => {
    const p = await fishballPage(c)
    for (let i = 0; i < COUNT.manyTopics; i++) await p.subscribe(FIXTURE.topic(i))
    await p.setLang('zh')
    await p.fail(true)
    const retry = p.nodes().find((n) => n.props[CLIENT.retry] !== undefined)
    if (retry) await p.press(retry)
    assertCarriers(p, 1, 'at the end')
    assertNoBudgetWarning(p)
  })
}
