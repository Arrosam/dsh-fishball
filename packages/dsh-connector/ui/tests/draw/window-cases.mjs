/**
 * Entries by window: what the browser half draws (the user's requirements 1–5 and contracts B, D;
 * 2026-11-21). The main DSH's sidebar (slot sidebar.panellist, above Plugins at order 0 and Tasks at
 * 10) shows one entry per connected agent that has a window this DSH can open, decided by
 * capability: embed-UI offers the hosted child's `agentEntry()` to the connector's UI backend, which
 * lists the enabled, paired, online agents whose entry an offered source claims. Entry i (snapshot
 * order) is id `fishball:<key>`, order -10 + i * 0.01, label = the name with its first character
 * capitalised (`ID: <id>` when nameless); it opens the main entry with the same key, whose header
 * title is the label. The attention light and the bubble's mark sit on the first entry only. While
 * the snapshot is unknown (hidden tab, a dropped stream not yet back) the entries stay as they are.
 * Written from the requirements and the contracts; no file under src/ was read.
 *
 * Techniques: BVA (0, 1, 2 entries; the orders), EP (capability vs identity; the label's first
 * character: lower, capitalised, non-ASCII, one character, digit, nameless; an older locator, an
 * empty or null agentEntry), Decision table (online × enabled × paired × claimed), State transition
 * (online / offline, offer / dispose, rename, a newer hosted entry, the instance going, hidden /
 * shown, stream dropped / back).
 *
 * Level: integration, the U-DRAW world (world.mjs): the real UI backend over FakeHandover and the
 * fake pair store, embed-UI's real host entry and browser chunks on a scripted page.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from '../../../../../test/v3/contract/package-boundaries/cases.mjs'
import { FISH } from '../../../../../test/v3/contract/package-boundaries/icon-set.mjs'
import { fakeTimers } from '../../../tests/oauth-web/fakes.mjs'
import { FakePairStore } from '../../../tests/ui/fakes.mjs'
import { assertFramed, fishEntries, mainEntries, mountFish, mountMain, mountOverlay, noticeNode, routePathOf } from './cases.mjs'
import { ATTR, EXPECT, FIXTURE, SLOT, TAG, TEXT, TOOL, WAIT, WINDOW } from './constants.mjs'
import { attrOf, byTag, hostWorld, openPage, row, subtreeOf, textIn, withAttr } from './world.mjs'

const ID = Object.freeze({ bva: 'WIN-DRAW-BVA-01', cap: 'WIN-DRAW-EP-01', label: 'WIN-DRAW-EP-02', src: 'WIN-DRAW-EP-03', dt: 'WIN-DRAW-DT-01', light: 'WIN-DRAW-DT-02', st: 'WIN-DRAW-ST-01', unknown: 'WIN-DRAW-ST-02', open: 'WIN-DRAW-UC-01' })
const draw = (sdk, id, part, title, fn) => test(caseName(sdk, id, part, title), { timeout: WAIT.testMs }, fn)
const F = FIXTURE
const A1 = WINDOW.agent(1, 'fishball2')
const A2 = WINDOW.agent(2, 'Navigator')
/** The label rule as the user gave it (requirement 3). */
const labelOf = (p) => (p.name === null ? TEXT.idLabel(p.id) : p.name.charAt(0).toUpperCase() + p.name.slice(1))
/** An entry's label as DSH's sidebar resolves it (a string, or a function of the entry's locale). */
const labelOfEntry = (e) => (typeof e.options.label === 'function' ? e.options.label() : e.options.label)
const ids = (page) => fishEntries(page).map((e) => e.options.id)
const labels = (page) => fishEntries(page).map(labelOfEntry)
const mainKeys = (page) => mainEntries(page).map((e) => e.options.key)
const embedSlots = (page) => page.embedDrawn().filter((r) => r.slot === SLOT.fish || r.slot === SLOT.main)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/**
 * A host with `agents` = [[principal, rowOver]]: the first is the hosted agent (paired under the
 * entry the child holds, so embed-UI's source claims it), each later one is paired under its own
 * entry and claimed by a second source straight on the backend (another row with a window here).
 * `claimOthers: false` leaves the later ones unclaimed.
 */
async function windowsWorld(t, sdk, { agents = [[A1, { online: true }]], host = {}, page: pageOptions = {}, claimOthers = true } = {}) {
  const w = await hostWorld(t, sdk, { windowAgent: false, ...host })
  agents.forEach(([p], i) => w.pairs.bind(p, i === 0 ? F.hostedEntry : FakePairStore.entryOf(p.key)))
  w.handover.set({ principals: agents.map(([p, over]) => ({ key: p.key, name: p.name, id: p.id, online: false, enabled: true, paired: true, ...over })) })
  const others = agents.slice(1).map(([p]) => FakePairStore.entryOf(p.key))
  const second = claimOthers && others.length ? w.offerWindows(others) : undefined
  const page = await openPage(t, w, pageOptions)
  return { w, page, second }
}
const expectEntries = async (page, keys, what) => {
  const want = keys.map(WINDOW.id)
  assert.ok(await page.waitFor(() => same(ids(page), want) && same(mainKeys(page), want)), `${what}: sidebar ${JSON.stringify(ids(page))}, main ${JSON.stringify(mainKeys(page))}`)
}
/** The plain fish: an svg drawing exactly the FishMark body and eye. */
const plainFish = (nodes) => byTag(nodes, TAG.svg).some((svg) => same(subtreeOf(svg).slice(1).filter((n) => typeof n !== 'string').map((n) => n.props.d), [FISH.body, FISH.eye]))
/** The window's header shows exactly `label` as a text run. */
const headerTitle = (view, label) => { const header = byTag(view.tree(), 'header')[0]; return Boolean(header) && subtreeOf(header).some((n) => textIn(n) === label) }

export function registerWindowDrawCases(sdk) {
  // ---------------------------------------------------------------- BVA: how many entries
  draw(sdk, ID.bva, '0 (no agent)', 'no connected agent → no sidebar.panellist entry and no main entry from embed-UI (no hint entry either)', async (t) => {
    const { w, page } = await windowsWorld(t, sdk, { agents: [] })
    await page.settle()
    assert.deepEqual(w.backend.snapshot().windows, [])
    assert.deepEqual(embedSlots(page).map((r) => r.slot + '#' + (r.id ?? r.key)), [])
  })
  draw(sdk, ID.bva, '0 (no instance)', 'a connected agent but no instance (no dshInstanceChild) → no entry, no main entry, no hint entry', async (t) => {
    const { page } = await windowsWorld(t, sdk, { host: { child: null } })
    await page.settle()
    assert.deepEqual(embedSlots(page).map((r) => r.slot + '#' + (r.id ?? r.key)), [])
  })
  draw(sdk, ID.bva, '1', `one window-capable agent → one entry fishball:<key>, order ${WINDOW.order(0)}, its label; one main entry with the same key`, async (t) => {
    const { page } = await windowsWorld(t, sdk)
    await expectEntries(page, [A1.key], 'one entry')
    const [entry] = fishEntries(page)
    assert.equal(entry.options.order, WINDOW.order(0))
    assert.equal(labelOfEntry(entry), labelOf(A1))
    assert.equal(embedSlots(page).filter((r) => r.slot === SLOT.fish).length, EXPECT.once, 'more than one embed-UI sidebar entry')
  })
  draw(sdk, ID.bva, '2', `two window-capable agents → two entries in snapshot order with orders ${WINDOW.order(0)} and ${WINDOW.order(1)}, both before Plugins (${WINDOW.plugins}) and Tasks (${WINDOW.tasks})`, async (t) => {
    const { page } = await windowsWorld(t, sdk, { agents: [[A1, { online: true }], [A2, { online: true }]] })
    await expectEntries(page, [A1.key, A2.key], 'two entries')
    const orders = fishEntries(page).map((e) => e.options.order)
    assert.deepEqual(orders, [WINDOW.order(0), WINDOW.order(1)])
    assert.ok(orders.every((o) => o < WINDOW.plugins && o < WINDOW.tasks), 'an entry sorts after Plugins or Tasks: ' + orders)
    assert.deepEqual(labels(page), [labelOf(A1), labelOf(A2)])
  })
  draw(sdk, ID.bva, '2 (order)', 'the second source\'s agent listed first in principals() → it is entry 0 (order -10), the hosted one entry 1', async (t) => {
    const { w, page } = await windowsWorld(t, sdk, { agents: [[A1, { online: true }], [A2, { online: true }]] })
    await expectEntries(page, [A1.key, A2.key], 'two entries')
    w.handover.set({ principals: w.handover.principals().reverse() })
    await expectEntries(page, [A2.key, A1.key], 'the new order')
    assert.deepEqual(fishEntries(page).map((e) => [e.options.id, e.options.order]), [[WINDOW.id(A2.key), WINDOW.order(0)], [WINDOW.id(A1.key), WINDOW.order(1)]])
  })

  // ---------------------------------------------------------------- EP: capability, not identity
  draw(sdk, ID.cap, 'Fishball without a window', 'a connected agent named "Fishball" whose entry no source claims → no entry; the claimed agent beside it has one', async (t) => {
    const { page } = await windowsWorld(t, sdk, { agents: [[A2, { online: true }], [F.fishball, { online: true }]], claimOthers: false })
    await expectEntries(page, [A2.key], 'only the claimed agent')
  })
  draw(sdk, ID.cap, 'non-Fishball with a window', 'a connected agent that is not a Fishball (Navigator), claimed by a source → it gets an entry labelled "Navigator"', async (t) => {
    const { page } = await windowsWorld(t, sdk, { agents: [[A2, { online: true }]] })
    await expectEntries(page, [A2.key], 'the non-Fishball entry')
    assert.deepEqual(labels(page), [labelOf(A2)])
  })

  // ---------------------------------------------------------------- EP: the host half's source (contract B)
  for (const [part, agentEntry] of [['null', null], ['empty string', ''], ['older locator (no agentEntry)', WINDOW.absent], ['another entry', WINDOW.otherEntry]]) {
    draw(sdk, ID.src, part, `the locator's agentEntry is ${part} → the hosted agent is not claimed: no entry`, async (t) => {
      const { w, page } = await windowsWorld(t, sdk, { host: { child: { agentEntry } } })
      await page.settle()
      assert.deepEqual(w.backend.snapshot().windows, [])
      assert.deepEqual(ids(page), [])
    })
  }
  draw(sdk, ID.src, 'follows onChange', 'agentEntry null → no entry; the child records the agent\'s entry (onChange) → its entry appears; a newer entry nobody is paired under → it goes', async (t) => {
    const { w, page } = await windowsWorld(t, sdk, { host: { child: { agentEntry: null } } })
    await expectEntries(page, [], 'no entry yet')
    w.child.setAgentEntry(F.hostedEntry)
    await expectEntries(page, [A1.key], 'the entry after the record')
    w.child.setAgentEntry(WINDOW.otherEntry)
    await expectEntries(page, [], 'no entry after a newer unpaired entry')
  })
  draw(sdk, ID.src, 'instance goes / comes', 'the instance row switched off → the offer is disposed and the entry goes; on again → it comes back', async (t) => {
    const { w, page } = await windowsWorld(t, sdk)
    await expectEntries(page, [A1.key], 'the entry')
    await w.setInstance(true)
    await expectEntries(page, [], 'no entry without the instance')
    assert.deepEqual(w.backend.snapshot().windows, [])
    await w.setInstance(false)
    await expectEntries(page, [A1.key], 'the entry back with the instance')
  })

  // ---------------------------------------------------------------- DT: connected = online, enabled, paired
  for (const [rule, title, over] of [[1, 'online, enabled, paired', { online: true }], [2, 'offline', { online: false }], [3, 'disabled', { online: true, enabled: false }], [4, 'unpaired', { online: true, paired: false }]]) {
    const listed = rule === 1
    draw(sdk, ID.dt, 'rule ' + rule, `the claimed agent ${title} → ${listed ? 'one entry' : 'no entry'}`, async (t) => {
      const { page } = await windowsWorld(t, sdk, { agents: [[A1, over]] })
      await expectEntries(page, listed ? [A1.key] : [], title)
    })
  }

  // ---------------------------------------------------------------- EP: the label
  for (const [part, name, label] of WINDOW.labels) {
    draw(sdk, ID.label, part, `name ${JSON.stringify(name)} → label ${JSON.stringify(label)} on the entry and as the window's header title`, async (t) => {
      const { w, page } = await windowsWorld(t, sdk, { agents: [[WINDOW.agent(9, name), { online: true }]] })
      await expectEntries(page, [WINDOW.agent(9, name).key], 'the entry')
      assert.equal(labelOfEntry(fishEntries(page)[0]), label)
      const view = await mountMain(page)
      await assertFramed(page, view, w)
      assert.ok(await page.waitFor(() => headerTitle(view, label)), 'the header does not show ' + JSON.stringify(label) + ': ' + textIn(byTag(view.tree(), 'header')))
    })
  }
  draw(sdk, ID.label, 'nameless', `a nameless agent → "${TEXT.idLabel(WINDOW.namelessId)}" (not capitalised), entry and header`, async (t) => {
    const nameless = { ...WINDOW.agent(8, null), id: WINDOW.namelessId }
    const { w, page } = await windowsWorld(t, sdk, { agents: [[nameless, { online: true }]] })
    await expectEntries(page, [nameless.key], 'the entry')
    assert.equal(labelOfEntry(fishEntries(page)[0]), TEXT.idLabel(WINDOW.namelessId))
    const view = await mountMain(page)
    await assertFramed(page, view, w)
    assert.ok(await page.waitFor(() => headerTitle(view, TEXT.idLabel(WINDOW.namelessId))), 'the header does not show the ID label')
  })

  // ---------------------------------------------------------------- UC: each entry opens its own window
  draw(sdk, ID.open, 'two windows', 'two entries → two main entries keyed as the entries; each window\'s header shows its own entry\'s label', async (t) => {
    const { page } = await windowsWorld(t, sdk, { agents: [[A1, { online: true }], [A2, { online: true }]] })
    await expectEntries(page, [A1.key, A2.key], 'two entries')
    for (const [i, p] of [A1, A2].entries()) {
      const view = await mountMain(page, i)
      assert.ok(await page.waitFor(() => headerTitle(view, labelOf(p))), `window ${i} header: ${textIn(byTag(view.tree(), 'header'))}`)
      await view.unmount()
    }
  })

  // ---------------------------------------------------------------- DT: the attention light sits on the first entry
  draw(sdk, ID.light, 'first only', 'two entries, signal(important) → the first entry\'s fish is lit (data-fishball-fish-light on, its dot); the second is the plain fish with no light, no dot', async (t) => {
    const { w, page } = await windowsWorld(t, sdk, { agents: [[A1, { online: true }], [A2, { online: true }]] })
    await expectEntries(page, [A1.key, A2.key], 'two entries')
    const first = await mountFish(page, 0)
    const second = await mountFish(page, 1)
    assert.equal(withAttr(first.tree(), ATTR.fishLight).length, EXPECT.once, 'the first entry has no light mark')
    assert.deepEqual(withAttr(second.tree(), ATTR.fishLight), [], 'the second entry carries the light mark')
    assert.ok(plainFish(second.tree()), 'the second entry is not the plain fish')
    await w.call(TOOL.signal, { important: true })
    assert.ok(await page.waitFor(() => attrOf(withAttr(first.tree(), ATTR.fishLight)[0], ATTR.fishLight) === ATTR.on), 'the first fish did not light')
    assert.deepEqual(withAttr(second.tree(), ATTR.fishLight), [], 'the second entry gained the light')
    assert.deepEqual(withAttr(second.tree(), 'data-fishball-dot'), [], 'the second entry shows a light dot')
  })
  draw(sdk, ID.light, 'moves with the order', 'the light is on whichever entry is first: the agents swap places → the new first entry carries the light mark, the other is plain', async (t) => {
    const { w, page } = await windowsWorld(t, sdk, { agents: [[A1, { online: true }], [A2, { online: true }]] })
    await expectEntries(page, [A1.key, A2.key], 'two entries')
    w.handover.set({ principals: w.handover.principals().reverse() })
    await expectEntries(page, [A2.key, A1.key], 'swapped')
    const first = await mountFish(page, 0)
    const second = await mountFish(page, 1)
    assert.equal(withAttr(first.tree(), ATTR.fishLight).length, EXPECT.once, 'the new first entry has no light mark')
    assert.deepEqual(withAttr(second.tree(), ATTR.fishLight), [], 'the new second entry carries the light mark')
  })
  draw(sdk, ID.light, 'one entry', 'one entry → it carries the light mark; notify lights it and the bubble shows', async (t) => {
    const { w, page } = await windowsWorld(t, sdk)
    await expectEntries(page, [A1.key], 'one entry')
    await mountOverlay(page)
    const fish = await mountFish(page)
    await w.call(TOOL.notify, { message: F.message })
    assert.ok(await page.waitFor(() => noticeNode(page)), 'no bubble')
    assert.ok(await page.waitFor(() => attrOf(withAttr(fish.tree(), ATTR.fishLight)[0], ATTR.fishLight) === ATTR.on), 'the entry did not light')
  })

  // ---------------------------------------------------------------- ST: live changes
  draw(sdk, ID.st, 'offline → online', 'one agent: offline → no entry; comes online → its entry; goes offline → the entry goes; no reload', async (t) => {
    const { w, page } = await windowsWorld(t, sdk, { agents: [[A1, { online: false }]] })
    await expectEntries(page, [], 'offline')
    w.handover.patch(A1.key, { online: true })
    await expectEntries(page, [A1.key], 'online')
    w.handover.patch(A1.key, { online: false })
    await expectEntries(page, [], 'offline again')
  })
  draw(sdk, ID.st, 'one → two → one', 'a second capable agent comes online → two entries (the first unchanged); the first goes offline → the second becomes entry 0 (order -10)', async (t) => {
    const { w, page } = await windowsWorld(t, sdk, { agents: [[A1, { online: true }], [A2, { online: false }]] })
    await expectEntries(page, [A1.key], 'one entry')
    w.handover.patch(A2.key, { online: true })
    await expectEntries(page, [A1.key, A2.key], 'two entries')
    w.handover.patch(A1.key, { online: false })
    await expectEntries(page, [A2.key], 'the second alone')
    assert.equal(fishEntries(page)[0].options.order, WINDOW.order(0))
  })
  draw(sdk, ID.st, 'source offered / disposed', 'an agent with a window from a second source: disposed → its entry goes; the hosted entry stays', async (t) => {
    const { page, second } = await windowsWorld(t, sdk, { agents: [[A1, { online: true }], [A2, { online: true }]] })
    await expectEntries(page, [A1.key, A2.key], 'two entries')
    second.dispose()
    await expectEntries(page, [A1.key], 'the hosted entry only')
  })
  draw(sdk, ID.st, 'rename', 'a rename → the entry is re-labelled and the open window\'s header shows the new label', async (t) => {
    const { w, page } = await windowsWorld(t, sdk)
    await expectEntries(page, [A1.key], 'the entry')
    const view = await mountMain(page)
    await assertFramed(page, view, w)
    const renamed = { ...A1, name: F.renamed.toLowerCase() }
    w.pairs.rename(A1.key, renamed.name)
    w.handover.patch(A1.key, { name: renamed.name })
    assert.ok(await page.waitFor(() => labels(page)[0] === labelOf(renamed)), 'the entry label: ' + labels(page))
    assert.ok(await page.waitFor(() => headerTitle(view, labelOf(renamed))), 'the header: ' + textIn(byTag(view.tree(), 'header')))
  })

  // ---------------------------------------------------------------- ST: unknown snapshot keeps the entries
  draw(sdk, ID.unknown, 'hidden', 'the tab hidden → the entries stay as they were while agents change; shown → the next frame decides', async (t) => {
    const { w, page } = await windowsWorld(t, sdk, { agents: [[A1, { online: true }], [A2, { online: false }]] })
    await expectEntries(page, [A1.key], 'one entry')
    page.setHidden(true)
    await page.settle()
    w.handover.patch(A1.key, { online: false })
    w.handover.patch(A2.key, { online: true })
    await page.settle()
    assert.deepEqual(ids(page), [WINDOW.id(A1.key)], 'the entries changed while the snapshot was unknown')
    page.setHidden(false)
    await expectEntries(page, [A2.key], 'after the next frame')
  })
  draw(sdk, ID.unknown, 'stream dropped', 'the events stream drops (reconnect pending) → the entries stay; the stream back → the next frame decides', async (t) => {
    const clock = fakeTimers()
    const { w, page } = await windowsWorld(t, sdk, { page: { timers: clock } })
    await expectEntries(page, [A1.key], 'one entry')
    const events = () => page.streams.filter((s) => new URL(s.url).pathname === routePathOf('events') && !s.closed)
    assert.ok(await page.waitFor(() => events().some((s) => s.readyState === 1)), 'no open events stream')
    await events()[0].loseConnection()
    await page.settle()
    w.handover.patch(A1.key, { online: false })
    await page.settle()
    assert.deepEqual(ids(page), [WINDOW.id(A1.key)], 'the entry went while the stream was down')
    for (const ms of new Set(clock.delays())) clock.fire(ms)
    await expectEntries(page, [], 'after the stream came back')
  })
}
