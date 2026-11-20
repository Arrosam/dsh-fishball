/**
 * R-FIX-CUI black-box rows of embed-UI's draws for three findings of the connector-UI review
 * (.runtime/reports/review-x-dsh-connector-ui.md):
 * - UI-01 (marks): a subagent child's session header (the header seats, props `sessionId` and DSH's
 *   standard `useSessions(selector)` over `{byId: {[id]: {id, origin, parentId}}}`) shows its ROOT's
 *   state: "Managed by <principal>" and Take back when the root is managed (Take back leaves the
 *   root unmanaged and creates no child entry), the Hand over targets when it is not (a Hand over
 *   from there manages the root). Without `useSessions` the session id itself is used;
 * - UI-06: the window opened before the attention chunk registered still clears: once the chunk
 *   registers, exactly one `opened` POST for that open; rerenders send no more; a remount one more;
 * - UI-07: a bubble already shown follows the sidebar fish without a new notification: hidden →
 *   the corner (left = bottom = 16), shown or moved → beside it (left = right + 8, top = top). It
 *   re-measures on window `resize` and on animation frames while shown; both stop once the bubble
 *   goes or unmounts.
 * Expected outcomes are the requirements the parent relayed for the task. No embed-UI
 * implementation was read.
 *
 * Level: the U-DRAW world (world.mjs): the real backend over a FakeHandover whose `parents` map
 * resolves a child to its root as the real K3 service does (C-ROUTE's rows test that service); the
 * page's chunk loads can be held (UI-06) and its animation frames and window events are scripted
 * (UI-07). Techniques: Decision Table (UI-01: the given session's kind × the root's state ×
 * `useSessions` present), State Transition (UI-06: window open → chunk registers → rerender →
 * remount; UI-07: mark → corner → mark → moved, shown → gone / unmounted).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from '../../contract/package-boundaries/cases.mjs'
import { mountMain, mountOverlay, noticeNode, online, routePathOf, world } from './cases.mjs'
import { ATTR, CUI, EXPECT, FIXTURE, POLISH, SLOT, TOOL, WAIT } from './constants.mjs'
import { placeOf, scriptFish } from './polish-cases.mjs'
import { press, sessionProps, textIn, until, withAttr } from './world.mjs'

const draw = (sdk, id, part, title, fn) => test(caseName(sdk, id, part, title), { timeout: WAIT.testMs }, fn)
const S = CUI.sessions
const P = FIXTURE

// UI-01 (marks: a subagent header acts on its root) moved to test/v3/dsh-connector/marks (DESIGN.md §28).

// ------------------------------------------------------------------------------------------------ UI-06

const openedPosts = (page) => page.posts(routePathOf('opened')).length

function lateAttention(sdk) {
  const id = CUI.id.ui06
  draw(sdk, id, 'ST (window open → attention registers → rerender → remount)', 'the window is mounted while the attention chunk is still loading → no opened POST; the chunk registers → exactly one; rerenders → still one; unmount and mount → two', async (t) => {
    const { w, page } = await world(t, sdk, { page: { holdChunks: [CUI.attentionChunk] } })
    const view = await mountMain(page)
    assert.ok(await page.waitFor(() => view.tree().length > 0), 'harness: the window did not draw before the attention chunk')
    assert.ok(page.isHeld(CUI.attentionChunk), 'harness: the attention chunk was not asked for, or not held')
    assert.equal(openedPosts(page), EXPECT.none, 'harness: opened was POSTed without the attention part')
    await page.releaseChunk(CUI.attentionChunk)
    assert.ok(await page.waitFor(() => openedPosts(page) >= EXPECT.once), 'the open was lost: no opened POST once the attention part registered')
    w.handover.fire()
    await w.call(TOOL.signal, { important: false })
    await page.settle()
    await new Promise((resolve) => setTimeout(resolve, WAIT.quietMs))
    await page.settle()
    assert.equal(openedPosts(page), EXPECT.once, 'opened again on a rerender')
    await view.unmount()
    await mountMain(page)
    assert.ok(await page.waitFor(() => openedPosts(page) >= EXPECT.twice), 'a remount did not POST opened')
    assert.equal(openedPosts(page), EXPECT.twice)
  })
  draw(sdk, id, 'ST (window open → attention registers clears the light)', 'a notice is pending and the fish lit; the window opens before the attention chunk → once it registers the notice is gone', async (t) => {
    const { w, page } = await world(t, sdk, { page: { holdChunks: [CUI.attentionChunk] } })
    await w.call(TOOL.notify, { message: P.message })
    await mountMain(page)
    await page.releaseChunk(CUI.attentionChunk)
    assert.ok(await page.waitFor(() => w.backend.snapshot().notice === null), 'the notice was not cleared by the open: ' + JSON.stringify(w.backend.snapshot().notice))
  })
}

// ------------------------------------------------------------------------------------------------ UI-07

const MARK = (rect) => ({ place: POLISH.place.mark, style: { left: rect.right + POLISH.gapPx, top: rect.top } })
const CORNER = Object.freeze({ place: POLISH.place.corner, style: { left: POLISH.edgePx, bottom: POLISH.edgePx } })
/** Each way the bubble re-measures: one animation frame, or one window resize. */
const MEASURES = Object.freeze([
  ['a frame', (page) => page.frames.runFrame()],
  ['a resize', (page) => page.frames.dispatch(CUI.resize)],
])
/** Re-measures with `measure` until the bubble is at `place`; returns whether it got there. */
const follows = (page, measure, place) => until(async () => { measure(page); await page.settle(); return JSON.stringify(placeOf(page)) === JSON.stringify(place) })

/** The fish visible at POLISH.fishRect, the overlay mounted, one notice shown beside the fish. */
async function shownBeside(t, sdk) {
  const x = await world(t, sdk)
  const fish = { rect: POLISH.fishRect }
  scriptFish(x.page, () => fish.rect)
  const overlay = await mountOverlay(x.page)
  await x.w.call(TOOL.notify, { message: P.message })
  assert.ok(await x.page.waitFor(() => noticeNode(x.page)), 'no bubble')
  assert.deepEqual(placeOf(x.page), MARK(POLISH.fishRect), 'harness: the bubble is not beside the fish')
  return { ...x, fish, overlay }
}
/** No re-measure is left: no resize listener, and no frame queued once the pending one has run. */
async function assertStopped(page, what) {
  page.frames.runFrame()
  await page.settle()
  assert.equal(page.frames.listening(CUI.resize), EXPECT.none, `a resize listener is left after ${what}`)
  assert.equal(page.frames.pending(), EXPECT.none, `animation frames go on after ${what}`)
}

function followFish(sdk) {
  const id = CUI.id.ui07
  for (const [how, measure] of MEASURES) {
    draw(sdk, id, `ST (mark → corner, ${how})`, `a bubble beside the fish; the fish is hidden, no new notification → after ${how} the bubble is at the corner (left = bottom = ${POLISH.edgePx})`, async (t) => {
      const { page, fish } = await shownBeside(t, sdk)
      fish.rect = POLISH.hiddenRect
      assert.ok(await follows(page, measure, CORNER), 'the bubble stayed at its old place: ' + JSON.stringify(placeOf(page)))
    })
    draw(sdk, id, `ST (mark → moved, ${how})`, `the fish moves (no new notification) → after ${how} the bubble is beside it again (left = right + ${POLISH.gapPx}, top = top)`, async (t) => {
      const { page, fish } = await shownBeside(t, sdk)
      fish.rect = CUI.movedRect
      assert.ok(await follows(page, measure, MARK(CUI.movedRect)), 'the bubble did not follow the fish: ' + JSON.stringify(placeOf(page)))
    })
  }
  draw(sdk, id, 'ST (mark → corner → mark)', 'hidden → corner; shown again (no new notification) → beside the fish again', async (t) => {
    const { page, fish } = await shownBeside(t, sdk)
    const [, frame] = MEASURES[0]
    fish.rect = POLISH.hiddenRect
    assert.ok(await follows(page, frame, CORNER))
    fish.rect = POLISH.fishRect
    assert.ok(await follows(page, frame, MARK(POLISH.fishRect)), 'the bubble did not come back beside the fish')
  })
  draw(sdk, id, 'EP (while shown)', 'while a bubble shows, the page listens for window resize and keeps an animation frame queued', async (t) => {
    const { page } = await shownBeside(t, sdk)
    assert.ok(page.frames.listening(CUI.resize) > EXPECT.none, 'no resize listener while the bubble shows')
    page.frames.runFrame()
    await page.settle()
    assert.ok(page.frames.pending() > EXPECT.none, 'no animation frame queued while the bubble shows')
  })
  draw(sdk, id, 'ST (shown → dismissed)', 'the bubble is clicked away → no resize listener is left and the frames stop', async (t) => {
    const { page } = await shownBeside(t, sdk)
    await press(page, noticeNode(page))
    assert.ok(await page.waitFor(() => !noticeNode(page)), 'the bubble stayed')
    await assertStopped(page, 'the bubble went')
  })
  draw(sdk, id, 'ST (shown → unmounted)', 'the overlay unmounts while the bubble shows → no resize listener is left and the frames stop', async (t) => {
    const { page, overlay } = await shownBeside(t, sdk)
    await overlay.unmount()
    await assertStopped(page, 'unmount')
  })
}

/** Every R-FIX-CUI row of the draw suite for `sdk`. */
export function registerCuiDrawCases(sdk) {
  lateAttention(sdk)
  followFish(sdk)
}
