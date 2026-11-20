/**
 * U-DRAW black-box cases: embed-UI draws, the connector holds every operation and all state
 * (requirements 1.34). One test per row of USE-CASES.md, named
 * `<id> <row> [SDK x] <title> (<spec rows>)`. Techniques, Use Cases first: UC (each flow), EP,
 * BVA, decision tables (each rule) and state transitions (each transition).
 *
 * Level: integration (world.mjs): the real C-EXT and C-UI-BACKEND in the SDK's own Cordis loader,
 * embed-UI's real host entry and browser chunks, fakes of K3 and of DSH's page services. Nothing is
 * launched; nothing touches a DSH home. Requirements, the relayed contract and its 2026-11-16
 * correction are cited per row (constants.mjs). No embed-UI implementation was read.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { caseName } from '../../../../../test/v3/contract/package-boundaries/cases.mjs'
import {
  ATTR, BACKEND, CHILD, CODES, DECIDED, DIAGNOSTIC, EMBED, EXPECT, FIXTURE, HTTP, MARKUP_TAGS, PAGE_HOST, REFUSAL, ROUTE, SERVICE,
  SLOT, TAG, TEXT, TOOL, UI_KEYS, WAIT,
} from './constants.mjs'
import { attrOf, byTag, fishProps, hasBoldId, hostWorld, lightOf, openPage, press, row, sessionProps, subtreeOf, textIn, type, until, withAttr } from './world.mjs'

const S1 = FIXTURE.sessions.s1
const P = FIXTURE
/** A case: its id, row, title and the spec rows it covers (in the name), run on `sdk`. */
const draw = (sdk, id, part, title, specs, fn) => test(caseName(sdk, id, part, title + ' (' + specs + ')'), { timeout: WAIT.testMs }, fn)
export const routePathOf = (key) => BACKEND.routes[key][1]
const relative = (absolute) => absolute.slice(ROUTE.absolutePrefix.length)

// --------------------------------------------------------------------------------------------- worlds

/** Host + page; `principals` are fixture principals (`{online}` per row via `over`), `managed` maps session → principal. */
export async function world(t, sdk, { host: hostOptions = {}, page: pageOptions = {}, principals = [], managed = [] } = {}) {
  const w = await hostWorld(t, sdk, hostOptions)
  if (principals.length || managed.length) w.handover.set({ principals: principals.map(([p, over]) => row(p, over)), managed: managed.map(([sessionId, p]) => ({ sessionId, principal: p })) })
  const page = await openPage(t, w, pageOptions)
  return { w, page }
}
export const online = (p) => [p, { online: true }]
const offline = (p) => [p, { online: false }]

// --------------------------------------------------------------------------------------------- page readers

const isFish = (entry) => entry.options.id === SLOT.fishId
const isMain = (entry) => entry.options.key === SLOT.mainKey
export const mountFish = (page) => page.mount(SLOT.fish, fishProps(), isFish)
export const mountMain = (page) => page.mount(SLOT.main, {}, isMain)
export const mountOverlay = (page) => page.mount(SLOT.overlay)
export const mountHeader = (page, sessionId = S1) => page.mount(SLOT.header, sessionProps(sessionId))
export const mountRowMark = (page, sessionId = S1) => page.mount(SLOT.rowLeading, sessionProps(sessionId))
export const mountRowMenu = (page, sessionId = S1) => page.mount(SLOT.rowMenu, sessionProps(sessionId))
export const one = (nodes, what) => { assert.equal(nodes.length, 1, what + ': ' + nodes.length); return nodes[0] }
const fishNode = (view) => withAttr(view.tree(), ATTR.fishLight)[0]
export const noticeNode = (page) => withAttr(page.tree(), ATTR.notice)[0]
export const alerts = (page) => findRole(page.tree(), ATTR.alert)
export const findRole = (nodes, role) => withAttr(nodes, ATTR.role, role)
export const handOverButtons = (view) => withAttr(view.tree(), ATTR.handOver)
export const manyButtons = (view) => withAttr(view.tree(), ATTR.handOverMany)
export const menuItems = (view) => withAttr(view.tree(), ATTR.menuItemId)
const confirmButton = (page) => withAttr(page.tree(), ATTR.confirm)[0]
const noteField = (page) => byTag(page.tree(), TAG.textarea)[0]

/** Opens the "Handover to…" menu (if closed) and returns its items. */
export async function openMenu(page, view) {
  if (menuItems(view).length === 0) await press(page, one(manyButtons(view), 'Handover to… buttons'))
  return menuItems(view)
}
/** Confirms the note dialog with `note` (typed when given). */
export async function confirmNote(page, note) {
  assert.ok(await page.waitFor(() => confirmButton(page)), 'no note dialog with a confirm button [' + ATTR.confirm + ']')
  if (note !== undefined) await type(page, noteField(page), note)
  await press(page, confirmButton(page))
}
/** The page's POSTs to one backend route, with their JSON bodies. */
export const bodiesOf = (page, key) => page.posts(routePathOf(key)).map((r) => JSON.parse(r.body))
/** Waits for one POST to a backend route (a harness wait). */
export const posted = (page, key, n = EXPECT.once) => page.waitFor(() => page.posts(routePathOf(key)).length >= n)

// --------------------------------------------------------------------------------------------- shared assertions

/** The services answer of `w`: status 200, every key, none of V2's removed flags. */
async function servicesOf(w) {
  const answer = await w.request('GET', ROUTE.services)
  assert.equal(answer.status, HTTP.ok, answer.text)
  assert.deepEqual(ROUTE.servicesKeys.filter((k) => !(k in answer.json)), [], 'services keys: ' + answer.text)
  assert.deepEqual(ROUTE.removedKeys.filter((k) => k in answer.json), [], 'V2 flags still in the services answer')
  return answer.json
}
/** Exactly `errors` connector-missing error lines and `warns` instance-missing warn lines, and no line of either at another level. */
function assertDiagnostics(w, { errors, warns }) {
  assert.equal(w.errors().length, errors, 'connector-missing error lines: ' + JSON.stringify(w.diagnostics(DIAGNOSTIC.connectorMissing)))
  assert.equal(w.warns().length, warns, 'instance-missing warn lines: ' + JSON.stringify(w.diagnostics(DIAGNOSTIC.instanceMissing)))
  assert.equal(w.diagnostics(DIAGNOSTIC.connectorMissing).length, errors, 'connector-missing at another level')
  assert.equal(w.diagnostics(DIAGNOSTIC.instanceMissing).length, warns, 'instance-missing at another level')
}
// Embed-UI's own registrations only: the connector's settings page (a Plugins card) and its marks part
// (DESIGN.md §28) are the connector's; that the marks draw nothing without the backend is MARKS-DT-01 / MARKS-BVA-01.
const assertNothingRegistered = (page) => assert.deepEqual(page.embedDrawn().map((r) => r.slot), [], 'embed-UI registered without a connector')
const assertNoFrame = (view) => assert.deepEqual(byTag(view.tree(), TAG.iframe), [], 'an iframe was drawn')
const assertNoFrameRetry = (page) => assert.deepEqual(withAttr(page.tree(), ATTR.frameRetry), [], 'a Retry button of embed-UI was drawn (#77)')
/** The hint view (Q-G3): the exact text, no iframe, no state tag. */
export function assertHint(view) {
  const hint = one(withAttr(view.tree(), ATTR.noInstance), 'hint nodes')
  assert.ok(textIn(hint).includes(TEXT.hint), 'hint text: ' + JSON.stringify(textIn(hint)))
  assertNoFrame(view)
  assert.deepEqual(withAttr(view.tree(), ATTR.embedState), [], 'a state tag beside the hint')
}
/** The not-ready view (#77): state (+ code) tag, a Retry link to the instance's page, no frame, no hint. */
export async function assertNotReady(page, view, w, status) {
  assert.ok(await page.waitFor(() => withAttr(view.tree(), ATTR.embedState, status.state).length > 0), 'no state tag ' + status.state)
  if (status.code !== null) assert.equal(withAttr(view.tree(), ATTR.embedCode, status.code).length, EXPECT.once, 'no code tag ' + status.code)
  assertNoFrame(view)
  assert.deepEqual(withAttr(view.tree(), ATTR.noInstance), [], 'the hint beside a not-ready child')
  assertNoFrameRetry(page)
  const link = one(withAttr(view.tree(), ATTR.retryLink), 'Retry links')
  assert.equal(textIn(link), TEXT.retry)
  await press(page, link)
  assert.deepEqual(page.navigations, [{ openBundle: CHILD.bundle }], 'the Retry link does not open the instance settings page')
  assert.equal(w.child.retries, EXPECT.none, 'embed-UI retried the child itself')
}
/** The ready view: the iframe src is exactly the last one-time url the locator minted (R-UI-02). */
async function assertFramed(page, view, w) {
  assert.ok(await page.waitFor(() => byTag(view.tree(), TAG.iframe).length > 0), 'no iframe; the view shows ' + JSON.stringify(textIn(view.tree())))
  const frame = one(withAttr(view.tree(), ATTR.frame), 'frames')
  assert.equal(frame.props.src, w.child.admissions.at(-1).url, 'the frame src is not the admit url')
  return frame
}
/** The single Hand over button's text equals `label`, and its light says `isOnline`. */
export function assertSingle(view, p, isOnline) {
  const button = one(handOverButtons(view), 'Hand over buttons')
  assert.equal(attrOf(button, ATTR.target), p.key)
  assert.equal(labelText(button), TEXT.handOverTo(labelOf(p)))
  assertLight(button, isOnline)
  return button
}
/** The visible label of a control without its light's text alternative. */
export const labelText = (node) => textIn(stripLight(node))
/** The node without its light (the element that itself carries [data-fishball-online]), whose text alternative is not the label. */
const stripLight = (node) => ({ ...node, children: (node.children ?? []).filter((c) => typeof c === 'string' || c.props[ATTR.online] === undefined).map((c) => (typeof c === 'string' ? c : stripLight(c))) })
export const labelOf = (p) => (p.name === null ? TEXT.idLabel(p.id) : p.name)
export function assertLight(node, isOnline) {
  assert.deepEqual(lightOf(node), { online: isOnline ? ATTR.yes : ATTR.no, label: isOnline ? TEXT.online : TEXT.offline }, 'light of ' + textIn(node))
}
export const assertBold = (node, p) => assert.equal(hasBoldId(node), p.name === null, 'bold ID: prefix only for a nameless principal (' + JSON.stringify(p.name) + ')')

export function registerUDrawCases(sdk) {
  // ============================================================ Use cases
  draw(sdk, 'UDRAW-UC-01', 'main', 'C + I + U: the window frames the one-time admit url and POSTs opened once', 'UIM-UC-01, R-UI-02, Q-G3, §13.6', async (t) => {
    const { w, page } = await world(t, sdk)
    assert.equal(page.live().filter((r) => r.slot === SLOT.fish && r.id === SLOT.fishId).length, EXPECT.once, 'fish entries')
    const view = await mountMain(page)
    assert.equal(withAttr(view.tree(), ATTR.embed).filter((n) => n.tag === TAG.section).length, EXPECT.once, 'section[data-fishball-embed]')
    await assertFramed(page, view, w)
    assert.equal(withAttr(view.tree(), ATTR.embedState, CHILD.ready.state).length, EXPECT.once, 'no ready state tag')
    assert.ok(await posted(page, 'opened'), 'opened was not POSTed')
    assert.equal(page.posts(routePathOf('opened')).length, EXPECT.once, 'opened POSTs per mount')
    assert.deepEqual(withAttr(view.tree(), ATTR.retryLink), [], 'a Retry link beside a ready child')
  })
  draw(sdk, 'UDRAW-UC-01', 'A1', 'a non-loopback page host: "Open DSH at 127.0.0.1 to use Fishball", no frame, no ticket', 'UIM-UC-01 E4, UIM-EP-02 row 4, R-UI-02', async (t) => {
    const { w, page } = await world(t, sdk, { page: { host: PAGE_HOST.tunnel } })
    const view = await mountMain(page)
    assert.ok(await page.waitFor(() => withAttr(view.tree(), ATTR.hostnameRefused).length > 0), 'no [data-fishball-hostname-refused]')
    assert.ok(textIn(view.tree()).includes(TEXT.refused), 'refusal text: ' + textIn(view.tree()))
    assertNoFrame(view)
    assert.deepEqual(w.child.admissions, [], 'a ticket was minted for a non-loopback host')
  })
  draw(sdk, 'UDRAW-UC-01', 'A2', 'a failed child: its state and code, a Retry link to the instance settings page, no frame, no Retry button', 'UIM-UC-01 E1 amended by #77, R-UI-03', async (t) => {
    const failed = CHILD.notReady.find((c) => c.code !== null)
    const { w, page } = await world(t, sdk, { host: { child: { status: failed } } })
    await assertNotReady(page, await mountMain(page), w, failed)
  })
  draw(sdk, 'UDRAW-UC-01', 'post', 'there is no Retry route: child/retry is not registered', '#77, R-UI-03 amended', async (t) => {
    const { w } = await world(t, sdk)
    assert.ok(!w.connection.paths().includes(ROUTE.retry), 'the retry route is registered')
    assert.equal((await w.request('POST', ROUTE.retry, {})).status, ROUTE.notFound)
    assert.equal(w.child.retries, EXPECT.none)
  })

  // UDRAW-UC-02, UDRAW-UC-03 and UDRAW-EP-04 moved to packages/dsh-connector/tests/marks (DESIGN.md §28: the marks part is dsh-agent-connector's).

  draw(sdk, 'UDRAW-UC-04', 'main', 'an agent notifies → the bubble shows the message as text with count 1; the fish is lit', 'R-FN-01', async (t) => {
    const { w, page } = await world(t, sdk)
    await mountOverlay(page)
    const fish = await mountFish(page)
    await w.call(TOOL.notify, { message: P.message })
    assert.ok(await page.waitFor(() => noticeNode(page)), 'no bubble')
    const notice = noticeNode(page)
    assert.equal(notice.tag, TAG.button, 'the bubble is not a button')
    assert.ok(textIn(notice).includes(P.message))
    assert.equal(textIn(one(withAttr([notice], ATTR.noticeCount), 'count nodes')), EXPECT.firstNotice)
    assert.equal(attrOf(notice, ATTR.noticeImportant), undefined, 'important styling on an ordinary notice')
    assert.equal(attrOf(fishNode(fish), ATTR.fishLight), ATTR.on)
  })
  draw(sdk, 'UDRAW-UC-04', 'A1', 'an important notice → the bubble and the fish are important', 'R-FN-01', async (t) => {
    const { w, page } = await world(t, sdk)
    await mountOverlay(page)
    const fish = await mountFish(page)
    await w.call(TOOL.notify, { message: P.message, important: true })
    assert.ok(await page.waitFor(() => withAttr(page.tree(), ATTR.noticeImportant, ATTR.yes).length > 0), 'no important bubble')
    assert.equal(attrOf(fishNode(fish), ATTR.fishImportant), ATTR.yes)
  })
  draw(sdk, 'UDRAW-UC-04', 'A3', 'clicking the bubble POSTs dismiss and it goes', 'R-FN-01', async (t) => {
    const { w, page } = await world(t, sdk)
    await mountOverlay(page)
    await w.call(TOOL.notify, { message: P.message })
    assert.ok(await page.waitFor(() => noticeNode(page)))
    await press(page, noticeNode(page))
    assert.ok(await posted(page, 'dismiss'))
    assert.ok(await page.waitFor(() => !noticeNode(page)), 'the bubble stayed after the click')
  })
  draw(sdk, 'UDRAW-UC-04', 'A4', 'opening the window clears the bubble', 'R-FN-01, §13.6', async (t) => {
    const { w, page } = await world(t, sdk)
    await mountOverlay(page)
    await w.call(TOOL.notify, { message: P.message })
    assert.ok(await page.waitFor(() => noticeNode(page)))
    await mountMain(page)
    assert.ok(await page.waitFor(() => !noticeNode(page)), 'the bubble stayed after the window opened')
  })
  draw(sdk, 'UDRAW-EP-05', 'message markup', 'a notice with markup is shown as text, never interpreted', 'R-FN-01 (plain text)', async (t) => {
    const { w, page } = await world(t, sdk)
    await mountOverlay(page)
    await w.call(TOOL.notify, { message: P.markupMessage })
    assert.ok(await page.waitFor(() => noticeNode(page)))
    assert.ok(textIn(noticeNode(page)).includes(P.markupMessage), 'the markup text is not shown literally')
    assert.deepEqual(subtreeOf(noticeNode(page)).filter((n) => MARKUP_TAGS.includes(n.tag)).map((n) => n.tag), [])
  })

  draw(sdk, 'UDRAW-UC-05', 'main', 'attention.signal lights the fish; important animates it; opening the window clears it', 'EXT-UC-04 main 2–3, §13.6, R-UI-04', async (t) => {
    const { w, page } = await world(t, sdk)
    const fish = await mountFish(page)
    await w.call(TOOL.signal, { important: true })
    assert.ok(await page.waitFor(() => attrOf(fishNode(fish), ATTR.fishLight) === ATTR.on), 'the fish is not lit')
    assert.equal(attrOf(fishNode(fish), ATTR.fishImportant), ATTR.yes)
    await mountMain(page)
    assert.ok(await page.waitFor(() => attrOf(fishNode(fish), ATTR.fishLight) === ATTR.off), 'the fish stayed lit after the window opened')
  })

  draw(sdk, 'UDRAW-UC-06', 'main', "tools/list holds <alias>.notify, <alias>.attention.signal and <alias>.attention.state, alias from K2", 'EXT-UC-04 main 1, R-EXT-13, R-FN-01', async (t) => {
    const { w } = await world(t, sdk)
    const expected = Object.values(TOOL).map(w.publicName)
    assert.deepEqual(expected.filter((n) => !w.names().includes(n)), [], 'missing: ' + JSON.stringify(w.names()))
  })
  draw(sdk, 'UDRAW-UC-06', 'A1', 'embed-UI disabled → the tools leave tools/list and the latch and the notice reset; enabled → back', 'R-EXT-13, §13.6, R-FN-01, EXT-UC-04', async (t) => {
    const { w } = await world(t, sdk)
    await w.call(TOOL.signal, { important: true })
    await w.call(TOOL.notify, { message: P.message })
    await w.setEmbed(true)
    assert.deepEqual(Object.values(TOOL).map(w.publicName).filter((n) => w.names().includes(n)), [], 'tools stayed after the unload')
    assert.equal(w.backend.snapshot().notice, null, 'the notice outlived embed-UI')
    assert.deepEqual(w.backend.snapshot().light, { on: false, important: false }, 'the latch outlived embed-UI')
    await w.setEmbed(false)
    assert.ok(await until(() => Object.values(TOOL).map(w.publicName).every((n) => w.names().includes(n))), 'the tools did not come back')
  })
  draw(sdk, 'UDRAW-UC-06', 'E1', 'no dshConnectorUi (tools present) → none of the three is listed', 'R-EXT-13, Q-U1', async (t) => {
    const { w } = await world(t, sdk, { host: { ui: false } })
    assert.deepEqual(Object.values(TOOL).map(w.publicName).filter((n) => w.names().includes(n)), [])
  })
  draw(sdk, 'UDRAW-UC-06', 'E2', 'no dshConnectorTools (UI backend present) → embed-UI still loads: no error line, connector true', 'R-EXT-13', async (t) => {
    const { w } = await world(t, sdk, { host: { tools: false } })
    assert.equal((await servicesOf(w)).connector, true)
    assert.deepEqual(w.logs.filter((l) => l.type === DIAGNOSTIC.errorType), [], 'an error was logged without the tools service')
  })

  draw(sdk, 'UDRAW-UC-07', 'main', 'no connector: one connector-missing error and no instance-missing; services {connector: false, ui: {}}; every other route 503; nothing drawn', 'Q-U1, R-UI-09 amended, R-ARCH-04', async (t) => {
    const { w, page } = await world(t, sdk, { host: { ui: false, tools: false } })
    assertDiagnostics(w, { errors: EXPECT.once, warns: EXPECT.none })
    const services = await servicesOf(w)
    assert.deepEqual([services.ok, services.connector, services.ui], [true, false, {}])
    for (const [method, key] of ROUTE.guarded) {
      const answer = await w.request(method, ROUTE[key], method === 'POST' ? { view: CHILD.ready.state, lang: TEXT.langs[0] } : undefined)
      assert.deepEqual([answer.status, answer.json?.ok, answer.json?.code], [REFUSAL.connectorMissing.status, false, REFUSAL.connectorMissing.code], key + ': ' + answer.text)
    }
    assertNothingRegistered(page)
  })
  draw(sdk, 'UDRAW-UC-07', 'A1', 'V2 never deployed (U-WIRE): V2-only service is missing; nothing draws', 'Q-U1, ' + DECIDED.legacy, async (t) => {
    const { w, page } = await world(t, sdk, { host: { ui: false, tools: false, legacy: true } })
    const services = await servicesOf(w)
    assert.deepEqual([services.connector, Object.hasOwn(services, 'legacy')], [false, false])
    assertDiagnostics(w, { errors: EXPECT.once, warns: EXPECT.none })
    assertNothingRegistered(page)
  })

  draw(sdk, 'UDRAW-UC-08', 'main', 'C + U, no instance: one instance-missing warning; fish, marks seats, the prompt and the hint view; the tools contributed', 'UIM-UC-02, R-UI-01, R-UI-08 amended, QD4, Q-G3', async (t) => {
    const { w, page } = await world(t, sdk, { host: { child: null }, principals: [online(P.navigator)] })
    assertDiagnostics(w, { errors: EXPECT.none, warns: EXPECT.once })
    const services = await servicesOf(w)
    assert.deepEqual([services.connector, services.page], [true, false])
    for (const slot of [SLOT.fish, SLOT.main, SLOT.overlay, ...SLOT.connectorSeats]) assert.ok(page.live().some((r) => r.slot === slot), 'nothing in ' + slot)
    const view = await mountMain(page)
    assert.ok(await page.waitFor(() => withAttr(view.tree(), ATTR.noInstance).length > 0), 'no hint')
    assertHint(view)
    assert.ok(await posted(page, 'opened'), 'opening the hint view did not POST opened')
    assert.ok(Object.values(TOOL).map(w.publicName).every((n) => w.names().includes(n)), 'tools not contributed without the instance')
    const header = await mountHeader(page)
    assert.ok(await page.waitFor(() => handOverButtons(header).length > 0), 'no Hand over without the instance')
  })

  // ============================================================ EP-01: availability seen by the host half
  const HOST_ROWS = [
    { row: 1, label: 'UI backend + tools + instance', host: {}, expect: { connector: true, page: true, errors: 0, warns: 0 } },
    { row: 2, label: 'UI backend + tools, no instance', host: { child: null }, expect: { connector: true, page: false, errors: 0, warns: 1 } },
    { row: 3, label: 'UI backend + tools, an instance of apiVersion 2', host: { child: { apiVersion: SERVICE.otherApiVersion } }, expect: { connector: true, page: false, errors: 0, warns: 1 } },
    { row: 4, label: 'UI backend + tools, the instance row disabled', host: { child: { disabled: true } }, expect: { connector: true, page: false, errors: 0, warns: 1 } },
    { row: 5, label: 'nothing', host: { ui: false, tools: false, child: null }, expect: { connector: false, page: false, errors: 1, warns: 0 } },
    { row: 6, label: 'instance only', host: { ui: false, tools: false }, expect: { connector: false, page: true, errors: 1, warns: 0 } },
    { row: 7, label: 'tools + instance, no UI backend', host: { ui: false }, expect: { connector: false, page: true, errors: 1, warns: 0 } },
    { row: 8, label: 'a UI backend of apiVersion 2 + tools + instance', host: { uiApiVersion: SERVICE.otherApiVersion }, expect: { connector: false, page: true, errors: 1, warns: 0 } },
    { row: 9, label: 'UI backend + instance, no tools', host: { tools: false }, expect: { connector: true, page: true, errors: 0, warns: 0 } },
    { row: 10, label: 'V2 dshConnector + instance (legacy)', host: { ui: false, tools: false, legacy: true }, expect: { connector: false, page: true, errors: 1, warns: 0 } },
  ]
  for (const r of HOST_ROWS) {
    draw(sdk, 'UDRAW-EP-01', r.row, `${r.label} → connector ${r.expect.connector}, page ${r.expect.page}; ${r.expect.errors} error / ${r.expect.warns} warning`, 'UIM-EP-01, Q-U1, R-UI-01' + (r.host.legacy ? ', ' + DECIDED.legacy : ''), async (t) => {
      const w = await hostWorld(t, sdk, r.host)
      const services = await servicesOf(w)
      assert.deepEqual({ connector: services.connector, page: services.page }, { connector: r.expect.connector, page: r.expect.page })
      assertDiagnostics(w, { errors: r.expect.errors, warns: r.expect.warns })
      assert.deepEqual(Object.keys(services.routes).sort(), [...ROUTE.routeKeys].sort(), 'routes keys')
      assert.deepEqual(Object.values(services.routes).filter((p) => p.startsWith(ROUTE.absolutePrefix)), [], 'routes are not page-relative')
      if (r.expect.connector) assert.deepEqual(services.ui, Object.fromEntries(UI_KEYS.map((k) => [k, relative(routePathOf(k))])), 'ui routes are not the backend routes, page-relative')
      else assert.deepEqual(services.ui, {}, 'ui routes without a connector')
    })
  }

  // ============================================================ EP-02: what the browser half registers
  const PAGE_ROWS = [
    { row: 1, label: 'full', host: {}, drawn: true },
    { row: 2, label: 'no instance', host: { child: null }, drawn: true },
    { row: 3, label: 'no connector', host: { ui: false, tools: false, child: null }, drawn: false },
    { row: 4, label: 'instance only', host: { ui: false, tools: false }, drawn: false },
    { row: 5, label: 'the services read fails', host: {}, page: { failServices: true }, drawn: false },
  ]
  for (const r of PAGE_ROWS) {
    draw(sdk, 'UDRAW-EP-02', r.row, `${r.label} → ${r.drawn ? 'fish, main, overlay and the marks seats' : 'nothing registered'}`, 'UIM-EP-01, Q-U1, R-UI-08, QD4', async (t) => {
      const { page } = await world(t, sdk, { host: r.host, page: r.page })
      if (!r.drawn) { assertNothingRegistered(page); return }
      assert.ok(page.live().some((x) => x.slot === SLOT.fish && x.id === SLOT.fishId), 'no fish (sidebar.panellist id fishball)')
      assert.ok(page.live().some((x) => x.slot === SLOT.main && x.key === SLOT.mainKey), 'no main entry keyed fishball')
      // DESIGN.md §28: the marks seats are the connector's part (packages/dsh-connector/tests/marks); embed-UI keeps the overlay.
      assert.ok(page.embedDrawn().some((x) => x.slot === SLOT.overlay), 'nothing of embed-UI in ' + SLOT.overlay)
      const fish = await mountFish(page)
      assert.equal(withAttr(fish.tree(), ATTR.fishMark).filter((n) => n.tag === TAG.svg).length, EXPECT.once, 'the fish has no svg[data-fishball-mark]')
    })
  }

  // ============================================================ EP-03: a child that is not ready
  for (const status of CHILD.notReady) {
    draw(sdk, 'UDRAW-EP-03', status.row, `child ${status.state}${status.code ? ' (' + status.code + ')' : ''} → state${status.code ? ' and code' : ''} tag, Retry link, no frame, no hint`, '#77, R-UI-03 amended, Q-G3', async (t) => {
      const { w, page } = await world(t, sdk, { host: { child: { status } } })
      await assertNotReady(page, await mountMain(page), w, status)
    })
  }

  // UDRAW-EP-05 (labels, marks) and UDRAW-BVA-01 (target count) moved to packages/dsh-connector/tests/marks (DESIGN.md §28).

  // ============================================================ EP-06: the page host
  draw(sdk, 'UDRAW-EP-06', 1, 'a page at localhost → the admission names localhost and the frame src is its url', 'UIM-EP-02 row 2, R-UI-02', async (t) => {
    const { w, page } = await world(t, sdk, { page: { host: PAGE_HOST.localhost } })
    await assertFramed(page, await mountMain(page), w)
    assert.equal(w.child.admissions.at(-1).hostname, PAGE_HOST.localhost)
  })

  // ============================================================ EP-07: withdrawn surfaces
  draw(sdk, 'UDRAW-EP-07', 1, 'client.records.js no longer exists, nor client.marks.js', 'Q-G4 = A, R-UI-13 withdrawn, DESIGN.md §28', () => {
    assert.equal(fs.existsSync(path.join(EMBED.clientDir, EMBED.withdrawnChunk)), false)
    for (const file of [EMBED.clientEntry, ...EMBED.chunks]) assert.ok(fs.existsSync(path.join(EMBED.clientDir, file)), 'missing ' + file)
    // DESIGN.md §28: the marks chunk left embed-UI for dsh-agent-connector.
    assert.equal(fs.existsSync(path.join(EMBED.clientDir, EMBED.movedChunk)), false, EMBED.movedChunk + ' is still in embed-UI')
  })
  draw(sdk, 'UDRAW-EP-07', 2, 'no tool.call.toolview and no conversation.chat.node registration', 'Q-G4 = A, Q-U2', async (t) => {
    const { page } = await world(t, sdk, { principals: [online(P.navigator)], managed: [[S1, P.navigator]] })
    assert.deepEqual(page.live().filter((r) => SLOT.withdrawn.includes(r.slot)).map((r) => r.slot), [])
  })
  draw(sdk, 'UDRAW-EP-07', 4, 'no [data-fishball-frame-retry] in the ready window', '#77', async (t) => {
    const { w, page } = await world(t, sdk)
    await assertFramed(page, await mountMain(page), w)
    assertNoFrameRetry(page)
  })
  draw(sdk, 'UDRAW-EP-07', 5, "the 'fishball' locale namespace has English and Chinese, and English holds every relayed label", 'R-UI-10 (labels from locale files), HAND-EP-02 row 7', async (t) => {
    const { page } = await world(t, sdk)
    const dicts = page.dictionaries.filter((d) => d.ns === TEXT.namespace).map((d) => d.dicts)
    assert.ok(dicts.length > 0, 'no fishball namespace registered')
    for (const lang of TEXT.langs) assert.ok(dicts.some((d) => d[lang] && Object.keys(d[lang]).length > 0), 'no ' + lang + ' dictionary')
    const english = new Set(dicts.flatMap((d) => Object.values(d.en ?? {})))
    assert.deepEqual(TEXT.dictionary.filter((s) => !english.has(s)), [], 'English labels missing')
  })

  // ============================================================ BVA
  draw(sdk, 'UDRAW-BVA-02', '1 / 2 / click / 1', 'notice count: 1 after the first, 2 after the second (newer text), none after the click, 1 after the next', 'R-FN-01, UIB-BVA-04', async (t) => {
    const { w, page } = await world(t, sdk)
    await mountOverlay(page)
    const count = () => textIn(withAttr(page.tree(), ATTR.noticeCount)[0] ?? '')
    await w.call(TOOL.notify, { message: P.message })
    assert.ok(await page.waitFor(() => count() === EXPECT.firstNotice), 'count ' + count())
    await w.call(TOOL.notify, { message: P.message2 })
    assert.ok(await page.waitFor(() => count() === EXPECT.secondNotice), 'count ' + count())
    assert.ok(textIn(noticeNode(page)).includes(P.message2) && !textIn(noticeNode(page)).includes(P.message), 'the newer notice did not replace the text')
    await press(page, noticeNode(page))
    assert.ok(await page.waitFor(() => !noticeNode(page)))
    await w.call(TOOL.notify, { message: P.message })
    assert.ok(await page.waitFor(() => count() === EXPECT.firstNotice), 'count after the click ' + count())
  })
  draw(sdk, 'UDRAW-BVA-03', 'appReady', 'diagnostics wait for appReady: 0 lines before it fires, exactly 1 after', 'Q-U1, R-UI-01 (relayed: once the app is ready)', async (t) => {
    const missing = await hostWorld(t, sdk, { ui: false, tools: false, appReady: 'pending' })
    const noInstance = await hostWorld(t, sdk, { child: null, appReady: 'pending' })
    assertDiagnostics(missing, { errors: EXPECT.none, warns: EXPECT.none })
    assertDiagnostics(noInstance, { errors: EXPECT.none, warns: EXPECT.none })
    missing.ready.fire()
    noInstance.ready.fire()
    await until(() => missing.errors().length > 0 && noInstance.warns().length > 0)
    assertDiagnostics(missing, { errors: EXPECT.once, warns: EXPECT.none })
    assertDiagnostics(noInstance, { errors: EXPECT.none, warns: EXPECT.once })
  })
  draw(sdk, 'UDRAW-BVA-03', 'per activation', 'one line per row activation: 1, still 1 after two page opens, 2 after a disable and re-enable', 'Q-U1, R-UI-01', async (t) => {
    const w = await hostWorld(t, sdk, { ui: false, tools: false })
    await openPage(t, w)
    await openPage(t, w)
    assertDiagnostics(w, { errors: EXPECT.once, warns: EXPECT.none })
    await w.setEmbed(true)
    await w.setEmbed(false)
    await until(() => w.errors().length >= EXPECT.twice)
    assert.equal(w.errors().length, EXPECT.perActivation * EXPECT.twice, 'lines after a second activation')
  })
  // UDRAW-BVA-04 (empty note) moved to packages/dsh-connector/tests/marks (DESIGN.md §28).
  draw(sdk, 'UDRAW-BVA-05', '1 / re-render / remount', 'opened is POSTed once per mount: 1, still 1 after a live re-render, 2 after unmount and mount', '§13.6, R-FN-01', async (t) => {
    const { w, page } = await world(t, sdk)
    const view = await mountMain(page)
    assert.ok(await posted(page, 'opened'))
    w.handover.fire()
    await w.call(TOOL.signal, { important: false })
    await page.settle()
    assert.equal(page.posts(routePathOf('opened')).length, EXPECT.once, 'opened again on a re-render')
    await view.unmount()
    await mountMain(page)
    assert.ok(await posted(page, 'opened', EXPECT.twice))
    assert.equal(page.posts(routePathOf('opened')).length, EXPECT.twice)
  })

  // ============================================================ DT-01: the fish
  const FISH_RULES = [
    { rule: 1, cause: 'nothing', act: async () => {}, light: ATTR.off, important: false },
    { rule: 2, cause: 'signal(false)', act: (w) => w.call(TOOL.signal, { important: false }), light: ATTR.on, important: false },
    { rule: 3, cause: 'signal(true)', act: (w) => w.call(TOOL.signal, { important: true }), light: ATTR.on, important: true },
    { rule: 4, cause: 'notify', act: (w) => w.call(TOOL.notify, { message: P.message }), light: ATTR.on, important: false },
    { rule: 5, cause: 'notify(important)', act: (w) => w.call(TOOL.notify, { message: P.message, important: true }), light: ATTR.on, important: true },
  ]
  for (const r of FISH_RULES) {
    draw(sdk, 'UDRAW-DT-01', 'rule ' + r.rule, `${r.cause} → fish light ${r.light}${r.important ? ', important' : ''}`, '§13.6, R-UI-04, R-FN-01, UIB-DT-01', async (t) => {
      const { w, page } = await world(t, sdk)
      const fish = await mountFish(page)
      await r.act(w)
      assert.ok(await page.waitFor(() => attrOf(fishNode(fish), ATTR.fishLight) === r.light), 'fish light ' + attrOf(fishNode(fish), ATTR.fishLight))
      assert.equal(attrOf(fishNode(fish), ATTR.fishImportant), r.important ? ATTR.yes : undefined, 'important flag')
      assert.equal(withAttr(fish.tree(), ATTR.fishMark).length, EXPECT.once, 'no fish mark')
    })
  }

  // ============================================================ DT-02: the main view
  const VIEW_RULES = [
    { rule: 1, label: 'no instance → hint', host: { child: null }, check: (page, view) => page.waitFor(() => withAttr(view.tree(), ATTR.noInstance).length > 0).then(() => assertHint(view)) },
    { rule: 2, label: 'instance, child not ready → state tag and Retry link', host: { child: { status: CHILD.notReady[0] } }, check: (page, view, w) => assertNotReady(page, view, w, CHILD.notReady[0]) },
    { rule: 3, label: 'instance, child ready, loopback → iframe', host: {}, check: async (page, view, w) => { await assertFramed(page, view, w); assert.deepEqual(withAttr(view.tree(), ATTR.noInstance), []); assert.deepEqual(withAttr(view.tree(), ATTR.retryLink), []) } },
    { rule: 4, label: 'instance, child ready, not loopback → refused', host: {}, page: { host: PAGE_HOST.tunnel }, check: async (page, view) => { assert.ok(await page.waitFor(() => withAttr(view.tree(), ATTR.hostnameRefused).length > 0)); assertNoFrame(view) } },
  ]
  for (const r of VIEW_RULES) {
    draw(sdk, 'UDRAW-DT-02', 'rule ' + r.rule, r.label, 'Q-G3, #77, R-UI-02', async (t) => {
      const { w, page } = await world(t, sdk, { host: r.host, page: r.page })
      await r.check(page, await mountMain(page), w)
    })
  }

  // UDRAW-DT-03, UDRAW-ST-01 #3/#4 and UDRAW-ST-02 moved to packages/dsh-connector/tests/marks (DESIGN.md §28).

  // ============================================================ ST-03: the prompt
  draw(sdk, 'UDRAW-ST-03', '#1–#5', 'None → notify → Shown(1) → notify → Shown(2) → click → None → notify → Shown(1) → window opened → None', 'R-FN-01, UIB-ST-02', async (t) => {
    const { w, page } = await world(t, sdk)
    await mountOverlay(page)
    const count = () => textIn(withAttr(page.tree(), ATTR.noticeCount)[0] ?? '')
    assert.equal(noticeNode(page), undefined, '#0 a bubble with no notice')
    await w.call(TOOL.notify, { message: P.message })
    assert.ok(await page.waitFor(() => count() === EXPECT.firstNotice), '#1')
    await w.call(TOOL.notify, { message: P.message2 })
    assert.ok(await page.waitFor(() => count() === EXPECT.secondNotice), '#2')
    await press(page, noticeNode(page))
    assert.ok(await page.waitFor(() => !noticeNode(page)), '#3')
    await w.call(TOOL.notify, { message: P.message })
    assert.ok(await page.waitFor(() => count() === EXPECT.firstNotice), '#4')
    await mountMain(page)
    assert.ok(await page.waitFor(() => !noticeNode(page)), '#5')
  })

  // ============================================================ ST-04: the contribution
  draw(sdk, 'UDRAW-ST-04', '#4', 'the connector row disabled → none of the tools; enabled → back', 'R-EXT-13, EXT-ST-01', async (t) => {
    const w = await hostWorld(t, sdk)
    const all = () => Object.values(TOOL).map(w.publicName)
    await w.setConnector(true)
    assert.deepEqual(all().filter((n) => w.names().includes(n)), [], 'tools while the connector is off')
    await w.setConnector(false)
    assert.ok(await until(() => all().every((n) => w.names().includes(n))), 'the tools did not come back with the connector')
  })
  draw(sdk, 'UDRAW-ST-04', '#5', 'embed-UI loaded before the connector → the tools appear when the connector does', 'R-EXT-13 (follows the services)', async (t) => {
    const w = await hostWorld(t, sdk, { embedFirst: true })
    assert.ok(await until(() => Object.values(TOOL).map(w.publicName).every((n) => w.names().includes(n))), 'tools: ' + JSON.stringify(w.names()))
  })

  // ============================================================ ST-05: the window follows the child
  draw(sdk, 'UDRAW-ST-05', '#1', 'a failed child becomes ready → the window frames it with no reload', 'UIM-UC-01 E1 amended by #77', async (t) => {
    const failed = CHILD.notReady.find((c) => c.code !== null)
    const { w, page } = await world(t, sdk, { host: { child: { status: failed } } })
    const view = await mountMain(page)
    assert.ok(await page.waitFor(() => withAttr(view.tree(), ATTR.retryLink).length > 0))
    w.child.set(CHILD.ready)
    assert.ok(await page.waitFor(() => byTag(view.tree(), TAG.iframe).length > 0, WAIT.followMs), 'the window did not follow the ready child')
    assert.equal(withAttr(view.tree(), ATTR.frame)[0].props.src, w.child.admissions.at(-1).url)
  })
}
