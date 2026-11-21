/** Host snapshot SSE lifecycle, observed only at the browser transport and rendered slot boundaries. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from '../../../../../test/v3/contract/package-boundaries/cases.mjs'
import { handOverButtons, mountFish, mountHeader, mountOverlay, noticeNode, online, routePathOf, world } from './cases.mjs'
import { ATTR, EXPECT, FIXTURE, TOOL } from './constants.mjs'
import { textIn, withAttr } from './world.mjs'

const VIS = Object.freeze({ visible: 'visible', hidden: 'hidden', missing: 'unsupported', event: 'visibilitychange' })

async function browser(t, sdk, initial, { beforeFrame, ...fixtures } = {}) {
  let change
  const prepareBrowser = ({ document }, frames) => {
    if (initial === VIS.missing) { delete document.hidden; return }
    const events = new EventTarget()
    document.addEventListener = events.addEventListener.bind(events)
    document.removeEventListener = events.removeEventListener.bind(events)
    const set = (state) => Object.assign(document, { hidden: state === VIS.hidden, visibilityState: state })
    set(initial)
    change = (state) => { set(state); events.dispatchEvent(new Event(VIS.event)); frames.dispatch(VIS.event) }
  }
  const { w, page } = await world(t, sdk, { ...fixtures, page: { prepareBrowser, beforeFrame } })
  const fish = await mountFish(page)
  const overlay = await mountOverlay(page)
  const sources = () => page.streams.filter((s) => new URL(s.url).pathname === routePathOf('events'))
  const live = () => sources().filter((s) => !s.closed)
  const sees = (message) => textIn(noticeNode(page) ?? '').includes(message)
  return { w, page, fish, overlay, sources, live, sees,
    notify: (message) => w.call(TOOL.notify, { message }),
    state: async () => (await w.request('GET', routePathOf('state'))).json,
    async change(state) { change(state); await page.settle() },
    async expectMessage(message) { assert.ok(await page.waitFor(() => sees(message)), 'missing notice: ' + message) },
  }
}

// Let the browser's pending timeouts come due once without prescribing the retry interval.
async function runPending(t, page) {
  t.mock.timers.runAll()
  await page.settle()
  t.mock.timers.reset()
}

function terminalError(t, view) {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const [source] = view.live()
  source.close()
  source.deliver('error', {})
}

export function registerVisibilityCases(sdk) {
  const check = (part, title, fn) => test(caseName(sdk, 'UDRAW-VIS', part, title), fn)
  for (const state of [VIS.visible, VIS.missing]) {
    check(state, 'fish and notice share a live backend feed', async (t) => {
      const view = await browser(t, sdk, state)
      await view.notify(FIXTURE.message)
      await view.expectMessage(FIXTURE.message)
      assert.equal(withAttr(view.page.tree(), ATTR.fishLight, ATTR.on).length, EXPECT.once)
      assert.equal(view.live().length, EXPECT.once)
      assert.equal(view.sources().length, EXPECT.once, 'mounting two consumers duplicated the feed')
    })
  }
  check('initially hidden', 'no snapshot socket before first reveal; then current state', async (t) => {
    const view = await browser(t, sdk, VIS.hidden)
    assert.equal(view.sources().length, EXPECT.none, 'a background document opened a snapshot source')
    await view.notify(FIXTURE.message)
    await view.change(VIS.visible)
    await view.expectMessage(FIXTURE.message)
    assert.equal(view.live().length, EXPECT.once)
  })
  check('hide / show', 'each reveal restores hidden changes; stale frames and errors do not disturb the new source', async (t) => {
    const view = await browser(t, sdk, VIS.visible)
    for (const message of [FIXTURE.message, FIXTURE.message2]) {
      const [old] = view.live()
      const before = view.sources().length
      // Use an authentic older backend snapshot as the late SSE message payload.
      const stale = JSON.stringify((await view.state()).state)
      await view.change(VIS.hidden)
      assert.equal(view.live().length, EXPECT.none, 'hide left a snapshot socket open')
      await view.notify(message)
      await view.change(VIS.visible)
      await view.expectMessage(message)
      t.mock.timers.enable({ apis: ['setTimeout'] })
      old.deliver('message', { data: stale })
      old.deliver('error', {})
      await view.page.settle()
      await runPending(t, view.page) // A stale error might queue a duplicate rather than open it immediately.
      assert.ok(view.sees(message), 'a retired source replaced newer backend state')
      assert.equal(view.live().length, EXPECT.once, 'a retired source disturbed the current connection')
      assert.equal(view.sources().length, before + EXPECT.once, 'one reveal created extra sources')
    }
  })
  check('delayed first frame', 'stale notice and ownership actions are unavailable until the resumed state is authoritative', async (t) => {
    let paused = false, held = false
    const gate = Promise.withResolvers()
    const sessionId = FIXTURE.sessions.s1
    const view = await browser(t, sdk, VIS.visible, {
      principals: [online(FIXTURE.navigator)], managed: [[sessionId, FIXTURE.navigator]],
      beforeFrame(url) { if (paused && new URL(url).pathname === routePathOf('events')) { held = true; return gate.promise } },
    })
    const header = await mountHeader(view.page, sessionId)
    const actionable = (node) => Boolean(node?.props.onClick && !node.props.disabled)
    const oldControls = () => ({
      notice: view.sees(FIXTURE.message) && actionable(noticeNode(view.page)),
      takeBack: withAttr(header.tree(), ATTR.takeBack).some(actionable),
    })
    await view.notify(FIXTURE.message)
    await view.expectMessage(FIXTURE.message)
    assert.deepEqual(oldControls(), { notice: true, takeBack: true })
    await view.change(VIS.hidden)
    const result = await view.w.request('POST', routePathOf('takeBack'), { sessionId })
    assert.equal(result.json.ok, true)
    await view.notify(FIXTURE.message2)
    paused = true
    try {
      await view.change(VIS.visible)
      assert.ok(await view.page.waitFor(() => held), 'replacement stream did not receive its backend frame')
      assert.deepEqual(oldControls(), { notice: false, takeBack: false }, 'pre-hide actions still enabled while replacement frame is held')
    } finally { paused = false; gate.resolve() }
    await view.expectMessage(FIXTURE.message2)
    assert.ok(handOverButtons(header).some(actionable), 'Hand over unavailable after authoritative frame')
  })
  check('visible retry', 'a terminally closed source is replaced and subsequent notices are live', async (t) => {
    const view = await browser(t, sdk, VIS.visible)
    terminalError(t, view)
    await view.page.settle()
    await runPending(t, view.page)
    assert.equal(view.live().length, EXPECT.once, 'no single live replacement after terminal error')
    assert.equal(view.sources().length, EXPECT.twice)
    await view.notify(FIXTURE.message2)
    await view.expectMessage(FIXTURE.message2)
  })
  // Re-baselined by entries by window (the user via lead, 2026-11-21): the shell follows the snapshot
  // for the sidebar entries while the page is visible, with no view mounted too.
  check('unsubscribed', 'no view mounted: a visible page keeps one source; hidden → none; shown → exactly one new source; a remount receives the current state and adds none', async (t) => {
    const view = await browser(t, sdk, VIS.visible)
    await view.notify(FIXTURE.message)
    await view.expectMessage(FIXTURE.message)
    await view.fish.unmount()
    await view.overlay.unmount()
    assert.equal(view.live().length, EXPECT.once, 'a visible page dropped the source its sidebar entries follow')
    const before = view.sources().length
    await view.change(VIS.hidden)
    assert.equal(view.live().length, EXPECT.none, 'a hidden page kept a source')
    await view.notify(FIXTURE.message2)
    await view.change(VIS.visible)
    assert.ok(await view.page.waitFor(() => view.live().length === EXPECT.once), 'showing the page did not reopen one source')
    assert.equal(view.sources().length, before + EXPECT.once, 'showing the page opened more than one source')
    await mountOverlay(view.page)
    await view.expectMessage(FIXTURE.message2)
    assert.equal(view.live().length, EXPECT.once)
    assert.equal(view.sources().length, before + EXPECT.once, 'a remount opened another source')
  })
  check('error before hide', 'a pending reconnect does not reopen the hidden page', async (t) => {
    const view = await browser(t, sdk, VIS.visible)
    terminalError(t, view)
    await view.change(VIS.hidden)
    const before = view.sources().length
    await runPending(t, view.page)
    assert.equal(view.sources().length, before, 'a reconnect opened a background snapshot source')
    assert.equal(view.live().length, EXPECT.none)
    await view.notify(FIXTURE.message)
    await view.change(VIS.visible)
    await view.expectMessage(FIXTURE.message)
    assert.equal(view.live().length, EXPECT.once)
  })
}
