/**
 * MSG-PAGING and MSG-STREAM (the lead, 2026-11-21): on the Fishball page, fishball-page's hidden
 * assistant replies must not break DSH's chat scrolling or paging, and the page keeps working through a
 * long streamed reply. Same world and browser as ./cases.mjs (a real standalone DSH with fishball-core,
 * whose patch carries fishball-ui's fishball-page, and DSH's real web UI in headless Chromium), on a home
 * of its own. Input is trusted: wheel steps on DSH's scrollport and, where DSH waits for it, a click on
 * DSH's own "Load earlier" control (see pageOnce: 0.2.2-rc.3 also pages by itself at the history edge). Ported from
 * test/v3/fishball-core/message-user/paging.mjs.
 *
 * | Case | Technique | Checks |
 * |---|---|---|
 * | MSG-PAGING-EP-00 | precondition | the first window holds fewer than 40 messages; "Load earlier" offered; after paging, wheel input reaches the top |
 * | MSG-PAGING-ST-01 | ST newest window → each older page → all | message rows the newest contiguous run in call order, all visible; at the end all 40, no "Load earlier" |
 * | MSG-PAGING-ST-02 | ST, BVA ±2px | the topmost fully visible message row keeps its offset while and 2 s after each page arrives |
 * | MSG-PAGING-EP-01 | EP, ±0.5px | every hidden reply seat is 0×0 and the gap around it equals the gap with the seats taken out |
 * | MSG-PAGING-EP-02 | EP | no uncaught page exception names Fishball's code while scrolling and paging |
 * | MSG-STREAM-ST-01 | ST running (400 deltas, 10 ms apart) | the streamed reply grows, never visible, never has height; the message before it visible throughout; both at the end |
 * | MSG-STREAM-ST-02 | ST running → completed → opened | replies hidden behind a closed enabled control; a trusted click shows the streamed reply complete |
 * | MSG-STREAM-EP-01 | EP | no uncaught page exception names Fishball's code during the stream |
 */
import assert from 'node:assert/strict'
import { after } from 'node:test'
import { chromeBinary, stopBrowser } from 'fishball-test-helpers/browser'
import { caseTest } from 'fishball-test-helpers/cases'
import { scenario } from 'fishball-test-helpers/dsh-world'
import { sleep } from 'fishball-test-helpers/wait'
import { pageWorld } from '../support/world.mjs'
import { BUDGET, HOME, PAGE, PAGING, SKIP_NO_CHROME, STREAM, TOOL } from './constants.mjs'
import { managerSession, openFishballPage, show } from './facts.mjs'

const allMessages = Array.from({ length: PAGING.turns }, (_, i) => PAGING.message(i))
const texts = (v) => v.messages.map((m) => m.text)
const ours = (list) => list.filter((e) => STREAM.ours.test(e.text) || STREAM.ours.test(e.url ?? ''))

/** The topmost message row fully inside the scrollport. */
const anchorOf = (v) => v.messages.find((m) => m.visible && m.y >= 0 && m.y + m.height <= v.clientHeight) ?? null

/**
 * One older page, by DSH's own trigger. DSH 0.2.2-rc.1 loads older history only from a click on its
 * "Load earlier" control; 0.2.2-rc.3 also prepends a page by itself once wheel input brings the history
 * edge near (its control then reads "Loading earlier"). So the scrollport is wheeled up one step at a
 * time until a page grows the window, or the top is reached with "Load earlier" offered, which is then
 * clicked. The anchor is the topmost message row fully on screen in the last viewport before the window
 * grew. When the growth came within a wheel step, that row's expected place is moved by the step's own
 * scroll (the user's input, not DSH's prepend): the case checks only what the prepend adds.
 */
async function pageOnce(tab) {
  let v = await tab.viewport()
  const start = v.messages.length
  const grown = (x) => x.messages.length > start
  let last = v
  let shift = 0
  let clicked = null
  for (let i = 0; i < PAGING.wheelSteps && clicked === null; i++) {
    if (grown(v) || v.older?.disabled) { clicked = true; break }
    if (v.scrollTop <= 0 && v.older !== null) { clicked = await tab.clickLoadOlder(); break }
    const step = await tab.wheelUp()
    if (step === 0) { clicked = 'the wheel stopped before DSH\'s history edge'; break }
    const next = await tab.viewport()
    if (grown(next)) shift = step
    else last = next
    v = next
  }
  const found = anchorOf(last)
  const anchor = found && { ...found, y: found.y + shift }
  const samples = []
  const begin = Date.now()
  let arrivedAt = grown(v) ? Date.now() : null
  while (Date.now() - begin < PAGING.arriveMs) {
    const now = await tab.viewport()
    samples.push({ at: Date.now() - begin, scrollTop: now.scrollTop, count: now.messages.length, anchorY: now.messages.find((m) => m.text === anchor?.text)?.y ?? null })
    if (arrivedAt === null && grown(now)) arrivedAt = Date.now()
    if (arrivedAt !== null && Date.now() - arrivedAt >= PAGING.settleMs) break
    await sleep(PAGING.sampleMs)
  }
  return { clicked: clicked ?? 'the wheel step budget ran out', anchor, shift, after: (await tab.viewport()).messages, samples, arrived: arrivedAt !== null }
}

/** Samples of the conversation while a long reply streams, until the turn's final reply is drawn. */
async function sampleStream(tab) {
  const samples = []
  const start = Date.now()
  while (Date.now() - start < STREAM.budgetMs) {
    const s = await tab.snapshot()
    const reply = s.rows.find((r) => r.text.startsWith(STREAM.start))
    samples.push({ at: Date.now() - start, page: s.page, length: reply?.length ?? null, visible: reply?.visible ?? null, height: reply?.height ?? null,
      messages: s.rows.filter((r) => r.kind === PAGE.kinds.message && r.text.startsWith(STREAM.prefix)).map((r) => [r.text, r.visible]) })
    if (s.rows.some((r) => r.text === STREAM.final)) break
    await sleep(STREAM.sampleMs)
  }
  return samples
}

export function registerPagingCases() {
  const browser = Boolean(chromeBinary())
  after(stopBrowser)
  const facts = scenario(HOME.paging, [
    async (boot, f) => {
      if (!browser) return
      const h = await boot()
      const id = await managerSession(h)
      for (let i = 0; i < PAGING.turns; i++) {
        await h.call('turn', { sessionId: id, scripts: [
          [{ text: PAGING.pre(i) }, { tool: TOOL.name, args: { [TOOL.parameter]: allMessages[i] }, id: PAGING.callPrefix + i }],
          [{ text: PAGING.final(i) }],
        ] })
      }
      const { tab, opened } = await openFishballPage(h, (s) => s.rows.some((r) => r.text === allMessages.at(-1)) && s.controls.length > 0)
      f.opened = opened
      f.first = await tab.viewport()
      f.pages = []
      for (let p = 0; p < PAGING.maxPages && (await tab.viewport()).older; p++) {
        f.pages.push(await pageOnce(tab))
        if (!f.pages.at(-1).arrived) break
      }
      f.toTop = await tab.scrollToTop()
      f.atTop = await tab.viewport()
      f.done = await tab.viewport()
      f.gaps = await tab.gaps()
      f.pagingExceptions = tab.exceptions()

      // STREAM: a long streamed reply between two messages, sampled while it streams.
      const words = Array.from({ length: STREAM.words }, (_, i) => STREAM.word(i)).join(' ')
      const streamed = [STREAM.start, words, STREAM.end].join(' ')
      await h.call('startTurn', { sessionId: id, scripts: [
        [{ tool: TOOL.name, args: { [TOOL.parameter]: STREAM.before }, id: STREAM.callPrefix + 1 }],
        [{ text: streamed, deltas: STREAM.deltas, delayMs: STREAM.delayMs }, { tool: TOOL.name, args: { [TOOL.parameter]: STREAM.after }, id: STREAM.callPrefix + 2 }],
        [{ text: STREAM.final }],
      ] })
      f.streamSamples = await sampleStream(tab)
      await h.call('idle', { sessionId: id })
      f.streamDone = await tab.until((s) => { const t = s.rows.find((r) => r.text === STREAM.before)?.turn; return t !== undefined && s.controls.some((c) => c.turn === t) })
      f.streamTurn = f.streamDone.rows.find((r) => r.text === STREAM.before)?.turn ?? null
      f.streamClick = await tab.clickControl(f.streamTurn)
      f.streamOpen = await tab.until((s) => s.controls.find((c) => c.turn === f.streamTurn)?.open === true)
      f.streamed = streamed
      f.exceptions = tab.exceptions()
      await tab.close()
    },
  ], pageWorld())
  const read = async (...keys) => {
    const f = await facts()
    for (const key of keys) if (f[key] === undefined) throw f.error ?? new Error('fact ' + key + ' was not collected')
    return f
  }
  const pageTest = (id, title, fn) => caseTest(id, '', title, browser ? { timeout: BUDGET.caseMs } : { skip: SKIP_NO_CHROME }, fn)

  pageTest('MSG-PAGING-EP-00', `precondition: ${PAGING.turns} turns open on the newest window only; DSH offers "Load earlier"`, async () => {
    const f = await read('first', 'atTop')
    assert.equal(f.opened?.page, true, 'not the Fishball page')
    assert.ok(f.first.messages.length > 0 && f.first.messages.length < PAGING.turns, 'the first window holds ' + f.first.messages.length + ' of ' + PAGING.turns + ' turns')
    assert.ok(f.first.older, 'no Load earlier control: ' + show(f.first))
    assert.equal(f.toTop, true, 'wheel input never reached the top: ' + show({ scrollTop: f.atTop.scrollTop }))
  })
  pageTest('MSG-PAGING-ST-01', 'each older page keeps the message rows in call order, contiguous up to the newest, all visible; at the end every turn\'s message is there', async () => {
    const f = await read('first', 'pages', 'done')
    assert.deepEqual(texts(f.first), allMessages.slice(-f.first.messages.length), 'first window')
    assert.ok(f.pages.length >= 1, 'no older page was loaded')
    for (const [i, p] of f.pages.entries()) {
      assert.equal(p.clicked, true, 'page ' + (i + 1) + ': ' + p.clicked)
      assert.equal(p.arrived, true, 'page ' + (i + 1) + ' never arrived')
      assert.deepEqual(p.after.map((m) => m.text), allMessages.slice(-p.after.length), 'page ' + (i + 1) + ' order')
      assert.deepEqual(p.after.filter((m) => !m.visible).map((m) => m.text), [], 'page ' + (i + 1) + ' hidden message rows')
    }
    assert.deepEqual(texts(f.done), allMessages, 'after every page')
    assert.equal(f.done.older, null, 'DSH still offers Load earlier')
  })
  pageTest('MSG-PAGING-ST-02', `the anchor row on screen stays put (within ${PAGING.anchorTolerancePx}px) while and after each older page arrives`, async () => {
    const f = await read('pages')
    assert.ok(f.pages.length >= 1, 'no older page was loaded')
    for (const [i, p] of f.pages.entries()) {
      assert.ok(p.anchor, 'page ' + (i + 1) + ': no message row fully on screen before the click')
      const ys = p.samples.map((s) => s.anchorY)
      assert.equal(ys.filter((y) => y === null).length, 0, 'page ' + (i + 1) + ': the anchor left the document: ' + show(p.samples))
      const drift = Math.max(...ys.map((y) => Math.abs(y - p.anchor.y)))
      assert.ok(drift <= PAGING.anchorTolerancePx, `page ${i + 1}: ${p.anchor.text} moved by ${drift}px (from ${p.anchor.y}): ${show(p.samples.map((s) => [s.at, s.count, s.scrollTop, s.anchorY]))}`)
    }
  })
  pageTest('MSG-PAGING-EP-01', `a hidden reply seat takes no space (0×0 box) and leaves no extra gap: the rows around it are as far apart as with the seat taken out (within ${PAGING.gapTolerancePx}px)`, async () => {
    const f = await read('gaps')
    assert.ok(f.gaps.seats.length >= PAGING.turns, 'precondition: hidden replies, ' + f.gaps.seats.length)
    assert.deepEqual(f.gaps.seats.filter((s) => s.height > 0 || s.width > 0), [], 'seats with a box')
    assert.deepEqual(f.gaps.pairs.filter((p) => Math.abs(p.withSeat - p.withoutSeat) > PAGING.gapTolerancePx), [], 'seats that change the gap between their neighbours')
  })
  pageTest('MSG-PAGING-EP-02', 'no uncaught exception from Fishball\'s code while scrolling and paging', async () => {
    const f = await read('pagingExceptions')
    assert.deepEqual(ours(f.pagingExceptions), [])
  })

  pageTest('MSG-STREAM-ST-01', `a long streamed reply (${STREAM.deltas} deltas) stays hidden and takes no space while it streams; the messages around it are drawn at once and stay visible`, async () => {
    const f = await read('streamSamples')
    const streaming = f.streamSamples.filter((s) => s.length !== null)
    assert.ok(streaming.length >= STREAM.minSamples, 'precondition: the reply was seen streaming in ' + streaming.length + ' samples')
    assert.ok(new Set(streaming.map((s) => s.length)).size >= STREAM.minLengths, 'precondition: the reply grew while sampled: ' + show(streaming.map((s) => s.length)))
    assert.deepEqual(streaming.filter((s) => s.visible || s.height > 0).map((s) => [s.at, s.length, s.height]), [], 'the reply showed while streaming')
    assert.ok(f.streamSamples.every((s) => s.page), 'the page mark went away')
    const seenBefore = streaming.map((s) => s.messages.find(([t]) => t === STREAM.before))
    assert.ok(seenBefore.every((m) => m && m[1]), 'the message before the stream was not drawn or not visible during it: ' + show(seenBefore))
    assert.deepEqual(f.streamSamples.at(-1).messages, [[STREAM.before, true], [STREAM.after, true]], 'the messages at the end of the stream')
  })
  pageTest('MSG-STREAM-ST-02', 'after the stream the page still works: replies folded behind a closed control, the control opens them, the streamed reply is complete', async () => {
    const f = await read('streamDone', 'streamTurn', 'streamOpen')
    const replies = (s) => s.rows.filter((r) => r.turn === f.streamTurn && r.kind === PAGE.kinds.reply && r.part === PAGE.response)
    const control = f.streamDone.controls.find((c) => c.turn === f.streamTurn)
    assert.deepEqual({ open: control?.open, disabled: control?.disabled }, { open: false, disabled: false }, 'precondition: ' + show(control))
    assert.deepEqual(replies(f.streamDone).filter((r) => r.visible).map((r) => r.text.slice(0, 30)), [], 'visible replies after the stream')
    assert.deepEqual(f.streamDone.rows.filter((r) => r.turn === f.streamTurn && r.kind === PAGE.kinds.message).map((r) => [r.text, r.visible]), [[STREAM.before, true], [STREAM.after, true]])
    assert.equal(f.streamClick, true, 'the control could not be clicked: ' + f.streamClick)
    const open = replies(f.streamOpen)
    assert.deepEqual(open.map((r) => r.visible), [true, true], 'the control did not show the replies')
    assert.ok(open[0].length >= f.streamed.length, 'the streamed reply is not complete when shown: ' + open[0].length + ' of ' + f.streamed.length + ' characters')
  })
  pageTest('MSG-STREAM-EP-01', 'no uncaught exception from Fishball\'s code during the stream', async () => {
    const f = await read('exceptions')
    assert.deepEqual(ours(f.exceptions), [])
  })
}
