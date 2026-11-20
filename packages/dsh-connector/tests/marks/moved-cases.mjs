/**
 * The marks part's black-box rows that lived in the U-DRAW suite before DESIGN.md §28 (2026-11-20):
 * Hand over / Take back in the session header and the row menu, "Managed by <agent>", the managed
 * row mark, their labels and lights, refusals, and a subagent header acting on its root (R-FIX-CUI
 * UI-01). Moved here unchanged in intent; their ids and spec rows are kept so the history reads on.
 * Since §28 the part is dsh-agent-connector's browser half, so the page here loads the connector's
 * client entry (world.mjs default) and the hooks are data-dsh-connector-* (R4).
 *
 * Cases (technique → rows):
 * | Id | Technique | What |
 * |---|---|---|
 * | UDRAW-UC-02 main / A1 / A2 | UC | one target button → note → handOver; two targets → "Handover to…" menu; row menu items |
 * | UDRAW-UC-03 main / A1 | UC | Take back in the header and the row menu |
 * | UDRAW-EP-04 handOver × 4, takeBack × 3 | EP | each refusal code → alert with that code |
 * | UDRAW-EP-05 rows 2, 2a, 3, 3a, 4, 6, 8, mark named / nameless | EP | labels, bold ID:, lights, markup as text, row mark label |
 * | UDRAW-BVA-01 0 / 1 / 2 / 3 | BVA | target count → no control / button / dropdown; row menu matches |
 * | UDRAW-BVA-04 empty note | BVA | empty note → '' or omitted |
 * | UDRAW-DT-03 rules 1–4 | DT | managed × targets → header and row menu |
 * | UDRAW-ST-01 #3 / #4, UDRAW-ST-02 #1–#5 | ST | live follow, cancelled dialog, a target's light lifecycle |
 * | RFC-UI01 (5 rows) | DT, ST | a subagent header shows and acts on its root |
 * | HAND-UC-02 main 3 (from U-WIRE) | ST | Managed –Take back (real route)→ Unmanaged: mark gone, Hand over back |
 *
 * Level: integration, the U-DRAW world (packages/dsh-connector/ui/tests/draw/world.mjs).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from '../../../../test/v3/contract/package-boundaries/cases.mjs'
import {
  alerts, assertBold, assertLight, assertSingle, bodiesOf, confirmNote, findRole, handOverButtons, labelOf, labelText, manyButtons, menuItems,
  mountHeader, mountOverlay, mountRowMark, mountRowMenu, one, online, openMenu, posted, routePathOf, world,
} from '../../ui/tests/draw/cases.mjs'
import { hostWorld, lightOf, openPage, press, row, sessionProps, subtreeOf, textIn, withAttr } from '../../ui/tests/draw/world.mjs'
import { ATTR, BACKEND, CODES, EXPECT, FIXTURE, MARKUP_TAGS, SLOT, TEXT, WAIT } from './constants.mjs'

const S1 = FIXTURE.sessions.s1
const P = FIXTURE
const offline = (p) => [p, { online: false }]
const draw = (sdk, id, part, title, specs, fn) => test(caseName(sdk, id, part, title + ' (' + specs + ', DESIGN.md §28)'), { timeout: WAIT.testMs }, fn)
const drawCui = (sdk, id, part, title, fn) => test(caseName(sdk, id, part, title + ' (DESIGN.md §28)'), { timeout: WAIT.testMs }, fn)
const CUI = Object.freeze({ id: Object.freeze({ ui01: 'RFC-UI01' }), sessions: Object.freeze({ root: FIXTURE.sessions.s1, child: 'fbtest-draw-child', grandchild: 'fbtest-draw-grandchild' }), subagentOrigin: 'subagent' })
const S = CUI.sessions

export function registerMovedMarksCases(sdk) {
  draw(sdk, 'UDRAW-UC-02', 'main', 'one target: "Hand over to Navigator" → note dialog → POST handOver {sessionId, principalKey, note} → the session shows its mark and Take back, live', 'HAND-UC-01 A1, R-UI-10, R-UI-05', async (t) => {
    const { w, page } = await world(t, sdk, { principals: [online(P.navigator)] })
    await mountOverlay(page)
    const header = await mountHeader(page)
    const mark = await mountRowMark(page)
    assert.ok(await page.waitFor(() => handOverButtons(header).length > 0), 'no Hand over button')
    await press(page, assertSingle(header, P.navigator, true))
    await confirmNote(page, P.note)
    assert.ok(await posted(page, 'handOver'), 'handOver was not POSTed')
    assert.deepEqual(bodiesOf(page, 'handOver'), [{ sessionId: S1, principalKey: P.navigator.key, note: P.note }])
    assert.deepEqual(w.handover.calls.handOver, [[S1, P.navigator.key, P.note]])
    assert.ok(await page.waitFor(() => withAttr(header.tree(), ATTR.takeBack).length > 0), 'no Take back after the hand over (no live refresh)')
    assert.ok(textIn(one(withAttr(header.tree(), ATTR.managedBy), 'managed-by')).includes(P.navigator.name))
    assert.equal(one(withAttr(mark.tree(), ATTR.managedRow, S1), 'row marks').props[ATTR.ariaLabel], TEXT.managedBy(P.navigator.name))
    assert.deepEqual(handOverButtons(header), [], 'Hand over beside Take back')
  })
  draw(sdk, 'UDRAW-UC-02', 'A1', 'two targets: "Handover to…" menu, one item per target (id = key); picking ID: agent-x hands over to it', 'HAND-UC-01 main, R-UI-10, R-NAME-08', async (t) => {
    const { w, page } = await world(t, sdk, { principals: [online(P.navigator), online(P.nameless)] })
    await mountOverlay(page)
    const header = await mountHeader(page)
    assert.ok(await page.waitFor(() => manyButtons(header).length > 0), 'no Handover to… button')
    assert.equal(labelText(manyButtons(header)[0]), TEXT.handoverMany)
    const items = await openMenu(page, header)
    assert.deepEqual(items.map((i) => i.props[ATTR.menuItemId]), [P.navigator.key, P.nameless.key])
    await press(page, items[1])
    await confirmNote(page)
    assert.ok(await posted(page, 'handOver'))
    assert.deepEqual(w.handover.calls.handOver.map((c) => c.slice(0, 2)), [[S1, P.nameless.key]])
  })
  draw(sdk, 'UDRAW-UC-02', 'A2', "the session row's menu offers one Hand over item per target with the same label, and it hands over", 'HAND-UC-01, R-UI-10', async (t) => {
    const { w, page } = await world(t, sdk, { principals: [online(P.navigator), offline(P.nameless)] })
    await mountOverlay(page)
    const menu = await mountRowMenu(page)
    assert.ok(await page.waitFor(() => findRole(menu.tree(), ATTR.menuitem).length >= EXPECT.twice), 'row menu items')
    const items = findRole(menu.tree(), ATTR.menuitem)
    assert.deepEqual(items.map(labelText), [TEXT.handOverTo(P.navigator.name), TEXT.handOverTo(TEXT.idLabel(P.nameless.id))])
    await press(page, items[0])
    await confirmNote(page)
    assert.ok(await posted(page, 'handOver'))
    assert.deepEqual(w.handover.calls.handOver.map((c) => c.slice(0, 2)), [[S1, P.navigator.key]])
  })
  for (const code of CODES.handOver) {
    draw(sdk, 'UDRAW-EP-04', 'handOver ' + code, `the backend refuses handOver with ${code} → an alert with that code; the session stays unmanaged`, 'HAND-DT-01, R-UI-10', async (t) => {
      const { w, page } = await world(t, sdk, { principals: [online(P.navigator)] })
      w.handover.script.handOver = code === BACKEND.code.operationFailed ? { rejects: new Error(P.failure) } : { ok: false, code }
      await mountOverlay(page)
      const header = await mountHeader(page)
      assert.ok(await page.waitFor(() => handOverButtons(header).length > 0))
      await press(page, handOverButtons(header)[0])
      await confirmNote(page)
      assert.ok(await page.waitFor(() => withAttr(alerts(page), ATTR.refusal, code).length > 0), 'no alert ' + code + '; alerts: ' + JSON.stringify(alerts(page).map((a) => a.props)))
      assert.deepEqual(withAttr(header.tree(), ATTR.takeBack), [], 'Take back after a refusal')
    })
  }

  draw(sdk, 'UDRAW-UC-03', 'main', 'a managed session: managed-by label and Take back; one click POSTs takeBack {sessionId}; the Hand over control comes back, live', 'HAND-UC-02, R-UI-05, R-UI-10', async (t) => {
    const { w, page } = await world(t, sdk, { principals: [online(P.navigator)], managed: [[S1, P.navigator]] })
    const header = await mountHeader(page)
    assert.ok(await page.waitFor(() => withAttr(header.tree(), ATTR.takeBack).length > 0), 'no Take back')
    assert.ok(textIn(one(withAttr(header.tree(), ATTR.managedBy), 'managed-by')).includes(P.navigator.name))
    const takeBack = one(withAttr(header.tree(), ATTR.takeBack), 'Take back buttons')
    assert.equal(textIn(takeBack), TEXT.takeBack)
    await press(page, takeBack)
    assert.ok(await posted(page, 'takeBack'))
    assert.deepEqual(bodiesOf(page, 'takeBack'), [{ sessionId: S1 }])
    assert.deepEqual(w.handover.calls.takeBack, [[S1]])
    assert.ok(await page.waitFor(() => handOverButtons(header).length > 0), 'Hand over did not come back')
  })
  draw(sdk, 'UDRAW-UC-03', 'A1', "the row menu offers Take back for a managed session, and no Hand over item", 'HAND-UC-02, R-UI-10', async (t) => {
    const { page } = await world(t, sdk, { principals: [online(P.navigator)], managed: [[S1, P.navigator]] })
    const menu = await mountRowMenu(page)
    assert.ok(await page.waitFor(() => findRole(menu.tree(), ATTR.menuitem).length > 0))
    assert.deepEqual(findRole(menu.tree(), ATTR.menuitem).map(textIn), [TEXT.takeBack])
  })
  for (const code of CODES.takeBack) {
    draw(sdk, 'UDRAW-EP-04', 'takeBack ' + code, `the backend refuses takeBack with ${code} → an alert with that code`, 'HAND-DT-02', async (t) => {
      const { w, page } = await world(t, sdk, { principals: [online(P.navigator)], managed: [[S1, P.navigator]] })
      w.handover.script.takeBack = code === BACKEND.code.operationFailed ? { rejects: new Error(P.failure) } : { ok: false, code }
      // A real page always mounts shell.overlay; an alert may be drawn there or beside the control.
      await mountOverlay(page)
      const header = await mountHeader(page)
      assert.ok(await page.waitFor(() => withAttr(header.tree(), ATTR.takeBack).length > 0))
      await press(page, withAttr(header.tree(), ATTR.takeBack)[0])
      assert.ok(await page.waitFor(() => withAttr(alerts(page), ATTR.refusal, code).length > 0), 'no alert ' + code)
    })
  }

  // ============================================================ EP-05 / BVA-01: the Hand over control and its labels
  const LABEL_ROWS = [
    { row: 'HAND-EP-02 row 2', p: P.navigator, on: true },
    { row: 'HAND-EP-02 row 2a', p: P.navigator, on: false },
    { row: 'HAND-EP-02 row 3', p: P.nameless, on: true },
    { row: 'HAND-EP-02 row 3a', p: P.idNamed, on: true },
    { row: 'HAND-EP-02 row 6 (named Fishball)', p: P.fishball, on: false },
  ]
  for (const r of LABEL_ROWS) {
    draw(sdk, 'UDRAW-EP-05', r.row, `one target ${JSON.stringify(r.p.name)} (${r.on ? 'online' : 'offline'}) → "${TEXT.handOverTo(labelOf(r.p))}", bold ID: only when nameless, light ${r.on ? 'green' : 'red'}`, 'R-UI-10, R-NAME-08', async (t) => {
      const { page } = await world(t, sdk, { principals: [[r.p, { online: r.on }]] })
      const header = await mountHeader(page)
      assert.ok(await page.waitFor(() => handOverButtons(header).length > 0), 'no Hand over button')
      assertBold(assertSingle(header, r.p, r.on), r.p)
    })
  }
  draw(sdk, 'UDRAW-EP-05', 'HAND-EP-02 row 4', 'two targets: the menu rows read "Navigator" (green) and bold "ID:" agent-x (red)', 'R-UI-10, R-NAME-08', async (t) => {
    const { page } = await world(t, sdk, { principals: [online(P.navigator), offline(P.nameless)] })
    const header = await mountHeader(page)
    assert.ok(await page.waitFor(() => manyButtons(header).length > 0))
    const items = await openMenu(page, header)
    assert.deepEqual(items.map(labelText), [P.navigator.name, TEXT.idLabel(P.nameless.id)])
    assertLight(items[0], true)
    assertLight(items[1], false)
    assertBold(items[0], P.navigator)
    assertBold(items[1], P.nameless)
  })
  draw(sdk, 'UDRAW-EP-05', 'HAND-EP-02 row 6', 'no label reads "Hand over to Fishball" when no principal is named Fishball', 'R-UI-10', async (t) => {
    const { page } = await world(t, sdk, { principals: [online(P.navigator), online(P.nameless)] })
    const header = await mountHeader(page)
    const menu = await mountRowMenu(page)
    assert.ok(await page.waitFor(() => manyButtons(header).length > 0))
    await openMenu(page, header)
    assert.ok(!textIn(page.tree()).includes(TEXT.fishballLabel), 'a "Hand over to Fishball" label: ' + textIn(menu.tree()))
  })
  draw(sdk, 'UDRAW-EP-05', 'HAND-EP-02 row 8', 'a name with markup is shown as text in the button and the mark', 'R-UI-10, R-NAME-05', async (t) => {
    const { page } = await world(t, sdk, { principals: [online(P.markup)], managed: [[FIXTURE.sessions.s2, P.markup]] })
    const header = await mountHeader(page)
    const mark = await mountRowMark(page, FIXTURE.sessions.s2)
    assert.ok(await page.waitFor(() => handOverButtons(header).length > 0))
    assert.equal(labelText(handOverButtons(header)[0]), TEXT.handOverTo(P.markup.name))
    assert.equal(one(withAttr(mark.tree(), ATTR.managedRow, FIXTURE.sessions.s2), 'marks').props[ATTR.ariaLabel], TEXT.managedBy(P.markup.name))
    assert.deepEqual([...subtreeOf({ children: header.tree() }), ...subtreeOf({ children: mark.tree() })].filter((n) => MARKUP_TAGS.includes(n.tag)).map((n) => n.tag), [], 'markup was interpreted')
  })
  for (const p of [P.navigator, P.nameless]) {
    draw(sdk, 'UDRAW-EP-05', 'mark ' + (p.name === null ? 'nameless' : 'named'), `a session managed by ${labelOf(p)} → row mark "Managed by ${labelOf(p)}"; header label`, 'R-UI-05, R-NAME-05, R-NAME-08', async (t) => {
      const { page } = await world(t, sdk, { principals: [online(p)], managed: [[S1, p]] })
      const mark = await mountRowMark(page)
      const header = await mountHeader(page)
      assert.ok(await page.waitFor(() => withAttr(mark.tree(), ATTR.managedRow, S1).length > 0), 'no row mark')
      assert.equal(withAttr(mark.tree(), ATTR.managedRow, S1)[0].props[ATTR.ariaLabel], TEXT.managedBy(labelOf(p)))
      assert.ok(await page.waitFor(() => withAttr(header.tree(), ATTR.managedBy).length > 0))
      assert.equal(textIn(withAttr(header.tree(), ATTR.managedBy)[0]).includes(labelOf(p)), true, 'header label')
      assertBold(withAttr(header.tree(), ATTR.managedBy)[0], p)
    })
  }
  for (const [count, principals] of [[0, []], [1, [online(P.navigator)]], [2, [online(P.navigator), offline(P.nameless)]], [3, [online(P.navigator), offline(P.nameless), online(P.idNamed)]]]) {
    draw(sdk, 'UDRAW-BVA-01', count, `${count} target(s) → ${count === 0 ? 'no control' : count === 1 ? 'one button' : 'a dropdown of ' + count + ' in targets order'}; the row menu matches`, 'HAND-EP-02 rows 1, 2, 4, 5, R-UI-10', async (t) => {
      const { page } = await world(t, sdk, { principals })
      const header = await mountHeader(page)
      const menu = await mountRowMenu(page)
      await page.waitFor(() => handOverButtons(header).length + manyButtons(header).length > 0, count === 0 ? WAIT.quietMs : WAIT.settleMs)
      assert.equal(handOverButtons(header).length, count === 1 ? 1 : 0, 'single buttons')
      assert.equal(manyButtons(header).length, count >= 2 ? 1 : 0, 'Handover to… buttons')
      if (count >= 2) assert.deepEqual((await openMenu(page, header)).map((i) => i.props[ATTR.menuItemId]), principals.map(([p]) => p.key))
      assert.equal(findRole(menu.tree(), ATTR.menuitem).length, count, 'row menu items')
    })
  }

  draw(sdk, 'UDRAW-BVA-04', 'empty note', 'confirming without a note hands over with an empty or omitted note', 'R-UI-10, K3 handOver note', async (t) => {
    const { w, page } = await world(t, sdk, { principals: [online(P.navigator)] })
    await mountOverlay(page)
    const header = await mountHeader(page)
    assert.ok(await page.waitFor(() => handOverButtons(header).length > 0))
    await press(page, handOverButtons(header)[0])
    await confirmNote(page)
    assert.ok(await posted(page, 'handOver'))
    const [call] = w.handover.calls.handOver
    assert.deepEqual(call.slice(0, 2), [S1, P.navigator.key])
    assert.ok(call[2] === undefined || call[2] === P.emptyNote, 'note ' + JSON.stringify(call[2]))
  })

  // ============================================================ DT-03: the session controls
  const CONTROL_RULES = [
    { rule: 1, principals: [], managed: [], header: { single: 0, many: 0, takeBack: 0 }, menu: [] },
    { rule: 2, principals: [online(P.navigator)], managed: [], header: { single: 1, many: 0, takeBack: 0 }, menu: [TEXT.handOverTo(P.navigator.name)] },
    { rule: 3, principals: [online(P.navigator), online(P.nameless)], managed: [], header: { single: 0, many: 1, takeBack: 0 }, menu: [TEXT.handOverTo(P.navigator.name), TEXT.handOverTo(TEXT.idLabel(P.nameless.id))] },
    { rule: 4, principals: [online(P.navigator), online(P.nameless)], managed: [[S1, P.navigator]], header: { single: 0, many: 0, takeBack: 1 }, menu: [TEXT.takeBack] },
  ]
  for (const r of CONTROL_RULES) {
    draw(sdk, 'UDRAW-DT-03', 'rule ' + r.rule, `managed ${r.managed.length > 0}, ${r.principals.length} target(s) → header ${JSON.stringify(r.header)}, row menu ${JSON.stringify(r.menu)}`, 'R-UI-10, R-UI-05, HAND-EP-02', async (t) => {
      const { page } = await world(t, sdk, { principals: r.principals, managed: r.managed })
      const header = await mountHeader(page)
      const menu = await mountRowMenu(page)
      const shown = () => ({ single: handOverButtons(header).length, many: manyButtons(header).length, takeBack: withAttr(header.tree(), ATTR.takeBack).length })
      await page.waitFor(() => JSON.stringify(shown()) === JSON.stringify(r.header), r.menu.length === 0 ? WAIT.quietMs : WAIT.settleMs)
      assert.deepEqual(shown(), r.header)
      assert.deepEqual(findRole(menu.tree(), ATTR.menuitem).map(labelText), r.menu)
    })
  }

  // ============================================================ ST-01: one session's control
  draw(sdk, 'UDRAW-ST-01', '#3', 'another tab hands the session over → the header turns to Take back with no reload', 'HAND-UC-01 E4, R-UI-10 live', async (t) => {
    const { w, page } = await world(t, sdk, { principals: [online(P.navigator)] })
    const header = await mountHeader(page)
    assert.ok(await page.waitFor(() => handOverButtons(header).length > 0))
    w.handover.set({ managed: [{ sessionId: S1, principal: P.navigator }] })
    assert.ok(await page.waitFor(() => withAttr(header.tree(), ATTR.takeBack).length > 0), 'the header did not follow the backend')
  })
  draw(sdk, 'UDRAW-ST-01', '#4', 'the note dialog closed without confirming → no POST', 'R-UI-10', async (t) => {
    const { w, page } = await world(t, sdk, { principals: [online(P.navigator)] })
    await mountOverlay(page)
    const header = await mountHeader(page)
    assert.ok(await page.waitFor(() => handOverButtons(header).length > 0))
    await press(page, handOverButtons(header)[0])
    assert.ok(await page.waitFor(() => findRole(page.tree(), ATTR.dialog).length > 0), 'no dialog')
    await press(page, withAttr(page.tree(), 'data-fbtest-modal-close')[0])
    assert.deepEqual(page.posts(routePathOf('handOver')), [])
    assert.deepEqual(w.handover.calls.handOver, [])
  })

  // ============================================================ ST-02: a target's light
  draw(sdk, 'UDRAW-ST-02', '#1–#5', 'paired → listed red; listens → green; disconnects → red, stays; disabled → removed; renamed → new label; no reload', 'HAND-ST-02 #1, 2, 3, 5, 8, HAND-UC-03 A1–A3', async (t) => {
    const { w, page } = await world(t, sdk, { principals: [online(P.navigator)] })
    const header = await mountHeader(page)
    assert.ok(await page.waitFor(() => handOverButtons(header).length > 0))
    const itemOf = (key) => menuItems(header).find((i) => i.props[ATTR.menuItemId] === key)
    const lightNow = async (key) => { await openMenu(page, header); return itemOf(key) && lightOf(itemOf(key))?.online }
    w.handover.set({ principals: [row(P.navigator, { online: true }), row(P.indexer, { online: false })] })
    assert.ok(await page.waitFor(() => manyButtons(header).length > 0), '#1 no dropdown after a pairing')
    assert.equal(await lightNow(P.indexer.key), ATTR.no, '#1 the new row is not red')
    w.handover.patch(P.indexer.key, { online: true })
    assert.ok(await page.waitFor(async () => (await lightNow(P.indexer.key)) === ATTR.yes), '#2 not green')
    w.handover.patch(P.indexer.key, { online: false })
    assert.ok(await page.waitFor(async () => (await lightNow(P.indexer.key)) === ATTR.no), '#3 not red')
    w.handover.patch(P.navigator.key, { name: P.renamed })
    assert.ok(await page.waitFor(async () => { await openMenu(page, header); return labelText(itemOf(P.navigator.key)) === P.renamed }), '#5 the label did not follow the rename')
    w.handover.patch(P.indexer.key, { enabled: false })
    assert.ok(await page.waitFor(() => handOverButtons(header).length > 0 && manyButtons(header).length === 0), '#4 the disabled row stayed')
  })
  marks(sdk)
  drawCui(sdk, 'HAND-UC-02', 'main 3', 'mark disappears and S1 shows Hand over again through real takeback route', async (t) => {
    const w = await hostWorld(t, sdk)
    const p = FIXTURE.navigator
    const sessionId = FIXTURE.sessions.s1
    w.handover.set({ principals: [row(p, { online: true })], managed: [{ sessionId, principal: p }] })
    const page = await openPage(t, w)
    const header = await page.mount(SLOT.header, sessionProps(sessionId))
    const mark = await page.mount(SLOT.rowLeading, sessionProps(sessionId))
    assert.ok(await page.waitFor(() => withAttr(header.tree(), ATTR.takeBack).length === EXPECT.once))
    assert.equal(withAttr(mark.tree(), ATTR.managedRow, sessionId).length, EXPECT.once)
    await press(page, withAttr(header.tree(), ATTR.takeBack)[0])
    assert.ok(await page.waitFor(() => withAttr(header.tree(), ATTR.handOver).length === EXPECT.once))
    assert.deepEqual(withAttr(mark.tree(), ATTR.managedRow), [])
    assert.deepEqual(withAttr(header.tree(), ATTR.takeBack), [])
    assert.deepEqual(page.posts(BACKEND.routes.takeBack[1]).map((q) => JSON.parse(q.body)), [{ sessionId }])
    assert.deepEqual(w.handover.calls.takeBack.map((args) => args[0]), [sessionId])
  })
}

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
    drawCui(sdk, id, `DT (${part} header, root managed)`, `R managed by Navigator → the ${part}'s header says "Managed by Navigator" and offers Take back, no Hand over`, async (t) => {
      const { page } = await treeWorld(t, sdk, { managed: true })
      const header = await headerOf(page, sessionId)
      assert.ok(await page.waitFor(() => takeBacks(header).length > 0), 'no Take back in the child\'s header while its root is managed')
      assert.ok(managedBy(header).some((n) => textIn(n).includes(P.navigator.name)), 'no "Managed by Navigator"')
      assert.deepEqual(handOverButtons(header), [], 'Hand over offered under a managed root')
    })
  }
  drawCui(sdk, id, 'ST (child header: Take back)', 'R managed; Take back in the child\'s header → R is unmanaged, no child entry exists; the header offers Hand over again', async (t) => {
    const { w, page } = await treeWorld(t, sdk, { managed: true })
    const header = await headerOf(page, S.child)
    assert.ok(await page.waitFor(() => takeBacks(header).length > 0), 'no Take back')
    await press(page, takeBacks(header)[0])
    assert.ok(await page.waitFor(() => page.posts(routePathOf('takeBack')).length > 0), 'Take back was not POSTed')
    assert.ok(await page.waitFor(() => managedIds(w).length === 0), 'a session is still managed: ' + JSON.stringify(managedIds(w)))
    assert.ok(await page.waitFor(() => handOverButtons(header).length > 0), 'the Hand over control did not come back')
  })
  drawCui(sdk, id, 'ST (child header: Hand over)', 'R unmanaged → the child\'s header offers "Hand over to Navigator"; Hand over → R is managed by Navigator (no child entry); the header then shows "Managed by Navigator" and Take back', async (t) => {
    const { w, page } = await treeWorld(t, sdk)
    const header = await headerOf(page, S.child)
    assert.ok(await page.waitFor(() => handOverButtons(header).length > 0), 'no Hand over in the child\'s header')
    await press(page, handOverButtons(header)[0])
    await confirmNote(page, P.note)
    assert.ok(await page.waitFor(() => managedIds(w).length > 0), 'nothing was handed over')
    assert.deepEqual(managedIds(w), [S.root])
    assert.ok(await page.waitFor(() => takeBacks(header).length > 0), 'the child\'s header does not follow its root\'s new manager')
  })
  drawCui(sdk, id, 'DT (child header, no useSessions)', 'without useSessions the session id itself is used: R managed → the child\'s header offers Hand over and no "Managed by"; R\'s own header shows Take back', async (t) => {
    const { page } = await treeWorld(t, sdk, { managed: true })
    const child = await headerOf(page, S.child, false)
    const root = await headerOf(page, S.root, false)
    assert.ok(await page.waitFor(() => takeBacks(root).length > 0), 'the root\'s header has no Take back')
    assert.ok(await page.waitFor(() => handOverButtons(child).length > 0), 'the child\'s header has no Hand over without useSessions')
    assert.deepEqual(managedBy(child), [])
  })
  drawCui(sdk, id, 'DT (root header)', 'R\'s own header with useSessions (R has no parent) → "Managed by Navigator" and Take back, as before', async (t) => {
    const { page } = await treeWorld(t, sdk, { managed: true })
    const header = await headerOf(page, S.root)
    assert.ok(await page.waitFor(() => takeBacks(header).length > 0))
    assert.ok(managedBy(header).some((n) => textIn(n).includes(P.navigator.name)))
  })
}

