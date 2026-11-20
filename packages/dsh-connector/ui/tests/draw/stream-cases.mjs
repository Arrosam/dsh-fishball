/** Page ownership of the connector snapshot SSE: transport observations plus rendered subscriber state. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from '../../../../../test/v3/contract/package-boundaries/cases.mjs'
import { fakeTimers } from '../../../tests/oauth-web/fakes.mjs'
import { mountFish, mountOverlay, online, routePathOf, world } from './cases.mjs'
import { ATTR, FIXTURE, SLOT, WAIT } from './constants.mjs'
import { openPage, sessionProps, withAttr } from './world.mjs'

const row = (sdk, part, title, fn) => test(caseName(sdk, 'UDRAW-STREAM', part, title), { timeout: WAIT.testMs }, fn)
const path = routePathOf('events')
const sources = (page) => page.streams.filter((s) => new URL(s.url).pathname === path)
const live = (page) => sources(page).filter((s) => !s.closed)
const requests = (page) => page.requests.filter((r) => r.stream && r.path === path).length
const mountHeader = (page) => page.mount(SLOT.header, sessionProps(FIXTURE.sessions.s1))
const managed = (w) => w.handover.set({ managed: [{ sessionId: FIXTURE.sessions.s1, principal: FIXTURE.navigator }] })
const has = (view, attr) => withAttr(view.tree(), attr).length > 0
async function open(page) {
  assert.ok(await page.waitFor(() => live(page).some((s) => s.readyState === 1)), 'no open connector event stream')
  assert.equal(live(page).length, 1, 'subscribers own more than one connector event stream')
}
// Advance all currently scheduled delays, including browser-native SSE and any app-owned backoff.
async function passDeadlines(clock, page) {
  for (const ms of new Set(clock.delays())) clock.fire(ms)
  await page.settle()
}

export function registerStreamCases(sdk) {
  row(sdk, 'sharing', 'sidebar, notice and header share one connection; a remaining subscriber still follows changes', async (t) => {
    const { w, page } = await world(t, sdk, { principals: [online(FIXTURE.navigator)] })
    const fish = await mountFish(page)
    const overlay = await mountOverlay(page)
    const header = await mountHeader(page)
    await open(page)
    assert.equal(requests(page), 1, 'extra event GETs while mounting subscribers')
    await fish.unmount()
    await overlay.unmount()
    managed(w)
    assert.ok(await page.waitFor(() => has(header, ATTR.takeBack)), 'remaining header stopped receiving snapshots')
    assert.equal(requests(page), 1, 'removing sibling subscribers replaced the shared stream')
  })

  row(sdk, 'last unmount', 'last unmount closes the stream; visibility alone cannot reopen an idle page', async (t) => {
    const clock = fakeTimers()
    const { page } = await world(t, sdk, { page: { timers: clock } })
    const fish = await mountFish(page)
    await open(page)
    await fish.unmount()
    assert.equal(live(page).length, 0, 'held the connector stream with no mounted subscribers')
    const before = requests(page)
    page.setHidden(true); page.setHidden(false)
    await passDeadlines(clock, page)
    assert.equal(requests(page), before, 'visibility or pending timer reconnected an idle page')
    await mountFish(page)
    await open(page)
    assert.equal(requests(page), before + 1, 'new first mount did not restore exactly one stream')
  })

  row(sdk, 'hidden mount', 'an initially hidden page with mounted subscribers waits until visible', async (t) => {
    const { page } = await world(t, sdk, { page: { hidden: true } })
    await mountFish(page)
    await mountOverlay(page)
    assert.equal(requests(page), 0, 'opened the connector stream while initially hidden')
    page.setHidden(false)
    await open(page)
    assert.equal(requests(page), 1)
  })

  row(sdk, 'two pages', 'each visible page owns its stream; hiding one releases only its stream and showing it catches up', async (t) => {
    const { w, page } = await world(t, sdk, { principals: [online(FIXTURE.navigator)] })
    const other = await openPage(t, w)
    const header = await mountHeader(page)
    const peer = await mountHeader(other)
    await open(page); await open(other)
    assert.ok(await page.waitFor(() => has(header, ATTR.handOver) && has(peer, ATTR.handOver)), 'missing initial snapshot')
    page.setHidden(true)
    await page.settle()
    assert.equal(live(page).length, 0, 'hidden document retained its connector stream')
    const peerGets = requests(other)
    managed(w)
    assert.ok(await other.waitFor(() => has(peer, ATTR.takeBack)), 'hiding the first page interrupted the visible peer')
    assert.equal(requests(other), peerGets, 'hiding one page replaced the other page’s stream')
    const before = requests(page)
    page.setHidden(false)
    await open(page)
    assert.ok(await page.waitFor(() => has(header, ATTR.takeBack) && !has(header, ATTR.handOver)), 'resumed header never picked up the change made while hidden')
    assert.equal(requests(page), before + 1, 'restoring visibility opened redundant streams')
  })

  row(sdk, 'pending retry', 'network drops → reconnect pending → hidden: no GET at retry deadline; visible again restores current state', async (t) => {
    const clock = fakeTimers()
    const { w, page } = await world(t, sdk, { principals: [online(FIXTURE.navigator)], page: { timers: clock } })
    const header = await mountHeader(page)
    await open(page)
    assert.ok(await page.waitFor(() => has(header, ATTR.handOver)), 'missing initial snapshot')
    await live(page)[0].loseConnection()
    await page.settle()
    const before = requests(page)
    page.setHidden(true)
    managed(w)
    await passDeadlines(clock, page)
    assert.equal(requests(page), before, 'a reconnect GET fired while hidden')
    assert.equal(live(page).length, 0, 'hidden page retained an EventSource during backoff')
    page.setHidden(false)
    await open(page)
    assert.ok(await page.waitFor(() => has(header, ATTR.takeBack)), 'failed to recover snapshot after interrupted reconnect')
    await passDeadlines(clock, page)
    assert.equal(requests(page), before + 1, 'stale reconnect duplicated the restored stream')
  })
}
