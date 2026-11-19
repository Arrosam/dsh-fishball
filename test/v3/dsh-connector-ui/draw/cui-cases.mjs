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
import { confirmNote, handOverButtons, mountMain, mountOverlay, noticeNode, online, routePathOf, world } from './cases.mjs'
import { ATTR, CUI, EXPECT, FIXTURE, POLISH, SLOT, TOOL, WAIT } from './constants.mjs'
import { placeOf, scriptFish } from './polish-cases.mjs'
import { press, sessionProps, textIn, until, withAttr } from './world.mjs'

const draw = (sdk, id, part, title, fn) => test(caseName(sdk, id, part, title), { timeout: WAIT.testMs }, fn)
const S = CUI.sessions
const P = FIXTURE

// ------------------------------------------------------------------------------------------------ UI-01

/** DSH's sessions store as `useSessions(selector)` reads it: R, its child C and C's child G. */
const SESSIONS = Object.freeze({
  byId: Object.freeze({
    [S.root]: Object.freeze({ id: S.root }),
    [S.child]: Object.freeze({ id: S.child, origin: CUI.subagentOrigin, parentId: S.root }),
    [S.grandchild]: Object.freeze({ id: S.grandchild, origin: CUI.subagentOrigin, parentId: S.child }),
  }),
})
const useSessions = (select = (state) => state) => select(SESSIONS)

/** A world whose hand-over service knows R's tree; `managed` makes Navigator manage R. */
async function treeWorld(t, sdk, { managed = false } = {}) {
  const x = await world(t, sdk, { principals: [online(P.navigator)], managed: managed ? [[S.root, P.navigator]] : [] })
  x.w.handover.parents = new Map([[S.child, S.root], [S.grandchild, S.child]])
  await mountOverlay(x.page)
  return x
}
/** The header of `sessionId`, with DSH's `useSessions` unless `withSessions` is false. */
const headerOf = (page, sessionId, withSessions = true) => page.mount(SLOT.header, { ...sessionProps(sessionId), ...(withSessions ? { useSessions } : {}) })
const takeBacks = (view) => withAttr(view.tree(), ATTR.takeBack)
const managedBy = (view) => withAttr(view.tree(), ATTR.managedBy)
const managedIds = (w) => w.handover.managed().map((m) => m.sessionId).sort()

function marks(sdk) {
  const id = CUI.id.ui01
  for (const [part, sessionId] of [['child', S.child], ['grandchild', S.grandchild]]) {
    draw(sdk, id, `DT (${part} header, root managed)`, `R managed by Navigator → the ${part}'s header says "Managed by Navigator" and offers Take back, no Hand over`, async (t) => {
      const { page } = await treeWorld(t, sdk, { managed: true })
      const header = await headerOf(page, sessionId)
      assert.ok(await page.waitFor(() => takeBacks(header).length > 0), 'no Take back in the child\'s header while its root is managed')
      assert.ok(managedBy(header).some((n) => textIn(n).includes(P.navigator.name)), 'no "Managed by Navigator"')
      assert.deepEqual(handOverButtons(header), [], 'Hand over offered under a managed root')
    })
  }
  draw(sdk, id, 'ST (child header: Take back)', 'R managed; Take back in the child\'s header → R is unmanaged, no child entry exists; the header offers Hand over again', async (t) => {
    const { w, page } = await treeWorld(t, sdk, { managed: true })
    const header = await headerOf(page, S.child)
    assert.ok(await page.waitFor(() => takeBacks(header).length > 0), 'no Take back')
    await press(page, takeBacks(header)[0])
    assert.ok(await page.waitFor(() => page.posts(routePathOf('takeBack')).length > 0), 'Take back was not POSTed')
    assert.ok(await page.waitFor(() => managedIds(w).length === 0), 'a session is still managed: ' + JSON.stringify(managedIds(w)))
    assert.ok(await page.waitFor(() => handOverButtons(header).length > 0), 'the Hand over control did not come back')
  })
  draw(sdk, id, 'ST (child header: Hand over)', 'R unmanaged → the child\'s header offers "Hand over to Navigator"; Hand over → R is managed by Navigator (no child entry); the header then shows "Managed by Navigator" and Take back', async (t) => {
    const { w, page } = await treeWorld(t, sdk)
    const header = await headerOf(page, S.child)
    assert.ok(await page.waitFor(() => handOverButtons(header).length > 0), 'no Hand over in the child\'s header')
    await press(page, handOverButtons(header)[0])
    await confirmNote(page, P.note)
    assert.ok(await page.waitFor(() => managedIds(w).length > 0), 'nothing was handed over')
    assert.deepEqual(managedIds(w), [S.root])
    assert.ok(await page.waitFor(() => takeBacks(header).length > 0), 'the child\'s header does not follow its root\'s new manager')
  })
  draw(sdk, id, 'DT (child header, no useSessions)', 'without useSessions the session id itself is used: R managed → the child\'s header offers Hand over and no "Managed by"; R\'s own header shows Take back', async (t) => {
    const { page } = await treeWorld(t, sdk, { managed: true })
    const child = await headerOf(page, S.child, false)
    const root = await headerOf(page, S.root, false)
    assert.ok(await page.waitFor(() => takeBacks(root).length > 0), 'the root\'s header has no Take back')
    assert.ok(await page.waitFor(() => handOverButtons(child).length > 0), 'the child\'s header has no Hand over without useSessions')
    assert.deepEqual(managedBy(child), [])
  })
  draw(sdk, id, 'DT (root header)', 'R\'s own header with useSessions (R has no parent) → "Managed by Navigator" and Take back, as before', async (t) => {
    const { page } = await treeWorld(t, sdk, { managed: true })
    const header = await headerOf(page, S.root)
    assert.ok(await page.waitFor(() => takeBacks(header).length > 0))
    assert.ok(managedBy(header).some((n) => textIn(n).includes(P.navigator.name)))
  })
}

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
  marks(sdk)
  lateAttention(sdk)
  followFish(sdk)
}
