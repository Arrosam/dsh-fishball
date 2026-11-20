/**
 * The marks part after DESIGN.md §28 ("Hand over" row; the user's decisions of 2026-11-20): Hand over /
 * Take back, "Managed by <agent>" and the managed row mark are dsh-agent-connector's browser half (R1),
 * dsh-connector-ui draws none of it (R2), the look is neutral (R3), the hooks and names are the
 * connector's (R4), nothing draws or errs without the connector's UI backend (R5), and embed-UI loads
 * the connector's browser entry first, warns once and registers nothing if it cannot, with one
 * snapshot stream per page (R6). Expected outcomes come from those requirements and the names the
 * lead confirmed (2026-11-20); no implementation was read.
 *
 * Cases (technique → rows):
 * | Id | Technique | Rows |
 * |---|---|---|
 * | MARKS-DT-01 rules 1–5 | Decision table | connector client C × embed-UI U × UI backend B → marks entries (C ∧ B) or none; no page error |
 * | MARKS-EP-01 ids | EP (slot) | header.actions, header.utilities, row menu → dsh-connector-hand-over; shell.overlay → dsh-connector-hand-over-notice; row leading / trailing → dsh-connector-managed; no fishball-hand-over / fishball-managed |
 * | MARKS-EP-02 owner | EP (package) | every marks entry comes from the connector's chunk client.marks.js; embed-UI's chunks are its shell and attention only (R2) |
 * | MARKS-EP-03 en / zh | EP (language) × BVA (targets 1 / 2) | "Hand over to {name}" / "Handover to…" / "Take back" / "Managed by {name}"; 交给 {name} / 交给… / 收回 / 由 {name} 管理; namespace dsh-connector-marks |
 * | MARKS-EP-04 hooks | EP (surface) | header, row menu, row mark, note dialog: every hook is data-dsh-connector-*, every class of the part dshc-*; no data-fishball-* or fb-* |
 * | MARKS-EP-05 icon idle / running | EP (row state) | the row mark draws V1's fish (dsh-fishball v0.1.0 FISH_MARK: exactly body in currentColor + eye in #EC0A6E; no tile, no wrench); running → dshc-flip; idle → none |
 * | MARKS-EP-06 icon surfaces | EP (surface) | only the row seats draw the fish: header, row menu and overlay draw none, and no element carries data-fishball-mark |
 * | MARKS-ST-01 | State transition | Unmanaged –Hand over (no embed-UI)→ Managed: mark + Take back –Take back→ Unmanaged |
 * | MARKS-BVA-01 R5 | BVA (backend present / absent) | absent → no marks entry, no POST, no page error or warning, no error log line |
 * | MARKS-R6 entry missing | EP (load result) | connector entry fails → exactly one 'part unavailable' warn from embed-UI's row, nothing registered by either |
 * | MARKS-R6 one stream | BVA (packages per page: 1 / 2) | both packages mounted → exactly one snapshot stream |
 *
 * EP-05 / EP-06 changed on 2026-11-21 (the user: after "Hand over to Fishball" the mark goes back
 * to V1's fish, dsh-fishball tag v0.1.0 assets/icon.svg and client.js FISH_MARK), replacing
 * DESIGN.md §28's connector icon. The fish's values are V1's, restated in V1_FISH below.
 *
 * Level: integration, the U-DRAW world (../../dsh-connector-ui/draw/world.mjs).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from '../../../../test/v3/contract/package-boundaries/cases.mjs'
import { confirmNote, handOverButtons, manyButtons, mountFish, mountHeader, mountOverlay, mountRowMark, mountRowMenu, one, online, routePathOf, world } from '../../ui/tests/draw/cases.mjs'
import { attrOf, byTag, press, sessionProps, subtreeOf, textIn, withAttr } from '../../ui/tests/draw/world.mjs'
import { ATTR, FISH, FIXTURE, MARKS, PRESENCE, SLOT, TAG, TEXT, WAIT, WRENCH } from './constants.mjs'

const S1 = FIXTURE.sessions.s1
const P = FIXTURE
const CHUNK = 'client.marks.js'
const CONNECTOR_ID = 'dsh-agent-connector'
const EMBED_ID = 'dsh-connector-ui'
const SVG_PATH = 'path'
const row = (sdk, id, part, title, fn) => test(caseName(sdk, id, part, title), { timeout: WAIT.testMs }, fn)
const classesOf = (node) => String(node?.props?.className ?? '').split(/\s+/).filter(Boolean)
const nodesOf = (view) => subtreeOf({ props: {}, children: view.tree() }).slice(1).filter((n) => typeof n !== 'string')
const statusHook = (sessionId, running) => (select = (v) => v) => select(new Map([[sessionId, { running, pendingInteraction: undefined, completionUnread: false }]]))
const streamsOf = (page) => page.streams.filter((s) => new URL(s.url).pathname === routePathOf('events'))
const labelOf = (p) => (p.name === null ? TEXT.idLabel(p.id) : p.name)
/** Every surface of the part for S1 (header, row menu) and S2 (managed: header, both row seats). */
async function mountAll(page) {
  const S2 = P.sessions.s2
  const status = (id) => ({ ...sessionProps(id), useSessionStatus: statusHook(id, true) })
  return [
    await mountOverlay(page), await mountHeader(page), await mountRowMenu(page), await mountHeader(page, S2),
    await page.mount(SLOT.rowLeading, sessionProps(S2)), await page.mount(SLOT.rowTrailing, status(S2)),
  ]
}
const fullWorld = (t, sdk, page = {}) => world(t, sdk, { principals: [online(P.navigator), [P.nameless, { online: false }]], managed: [[P.sessions.s2, P.navigator]], page })
/** V1's fish colours (dsh-fishball v0.1.0 client.js FISH_MARK): the body takes the text colour, the eye is magenta. */
const V1_FISH = Object.freeze({ viewBox: '0 0 24 24', bodyFill: 'currentColor', eyeFill: '#EC0A6E' })
const drawnIn = (svg) => subtreeOf(svg).slice(1).filter((n) => typeof n !== 'string')
/** The svg is the plain Fishball fish: exactly its body and eye paths, nothing else. */
const isPlainFish = (svg) => {
  const drawn = drawnIn(svg)
  return drawn.length === 2 && drawn.every((n) => n.tag === SVG_PATH) && drawn[0].props.d === FISH.body && drawn[1].props.d === FISH.eye
}
/** The svg draws V1's fish: its body and eye in V1's colours, and nothing else (no tile, ring, chip or wrench). */
function assertV1Fish(svg, what) {
  assert.ok(isPlainFish(svg), what + ': not exactly the fish body + eye: ' + JSON.stringify(drawnIn(svg).map((n) => n.tag)))
  assert.equal(svg.props.viewBox, V1_FISH.viewBox, what + ': viewBox')
  const [body, eye] = drawnIn(svg)
  assert.equal(body.props.fill, V1_FISH.bodyFill, what + ': body colour')
  assert.equal(eye.props.fill, V1_FISH.eyeFill, what + ': eye colour')
  assert.ok(drawnIn(svg).every((n) => !WRENCH.paths.includes(n.props.d)), what + ': the connector\'s wrench is drawn')
}
/** Every marks entry, mounted on its surfaces with a managed session and a target in the props, renders no element. */
async function assertDrawsNothing(page) {
  const views = await mountAll(page)
  const drawn = views.slice(1).flatMap((v) => v.tree()).filter((n) => typeof n !== 'string')
  const isMarks = (e) => Object.values(MARKS.ids).includes(e.options.id)
  const overlay = page.entries(SLOT.overlay).some(isMarks) ? (await page.mount(SLOT.overlay, {}, isMarks)).tree() : []
  assert.deepEqual([...drawn, ...overlay].map((n) => n.tag), [], 'the part drew without the UI backend')
}

export function registerMarksCases(sdk) {
  // ---------------------------------------------------------------- DT-01: who draws the marks
  for (const r of PRESENCE) {
    row(sdk, 'MARKS-DT-01', 'rule ' + r.rule, `${r.label} → ${r.marks ? 'the marks part registers' : 'no marks entry'}; no page error`, async (t) => {
      const host = r.backend ? {} : { ui: false, tools: false }
      const { page } = await world(t, sdk, { host, principals: r.backend ? [online(P.navigator)] : [], page: { connector: r.connector, embed: r.embed } })
      assert.deepEqual(page.errors, [], 'page errors')
      // R5 says the part draws nothing: an entry may stay registered as long as it renders nothing.
      if (!r.marks) { await assertDrawsNothing(page); return }
      for (const slot of SLOT.connectorSeats) assert.ok(page.marks().some((x) => x.slot === slot), 'no marks entry in ' + slot)
      const header = await mountHeader(page)
      assert.ok(await page.waitFor(() => handOverButtons(header).length > 0), 'no Hand over in the header')
    })
  }

  // ---------------------------------------------------------------- EP-01 / EP-02: ids and owner
  row(sdk, 'MARKS-EP-01', 'ids', 'slot entry ids: dsh-connector-hand-over (header seats, row menu), dsh-connector-hand-over-notice (shell.overlay), dsh-connector-managed (row seats); no fishball-* id', async (t) => {
    const { page } = await fullWorld(t, sdk)
    const ids = (slot) => page.live().filter((x) => x.slot === slot).map((x) => x.id)
    for (const slot of [SLOT.headerActions, SLOT.headerUtilities, SLOT.rowMenu]) assert.ok(ids(slot).includes(MARKS.ids.handOver), slot + ': ' + JSON.stringify(ids(slot)))
    assert.ok(ids(SLOT.overlay).includes(MARKS.ids.notice), 'shell.overlay: ' + JSON.stringify(ids(SLOT.overlay)))
    assert.ok(ids(SLOT.rowLeading).includes(MARKS.ids.managed), 'row leading: ' + JSON.stringify(ids(SLOT.rowLeading)))
    assert.deepEqual(page.live().filter((x) => MARKS.oldIds.includes(x.id)).map((x) => x.slot + '#' + x.id), [], 'old embed-UI ids')
  })
  row(sdk, 'MARKS-EP-02', 'owner', "the marks part is the connector's chunk client.marks.js; embed-UI loads no marks chunk and draws nothing in the marks' seats (R1, R2)", async (t) => {
    const { page } = await fullWorld(t, sdk)
    assert.deepEqual(page.chunkOwners.filter((c) => c.file === CHUNK).map((c) => c.owner), [CONNECTOR_ID], 'who loaded ' + CHUNK)
    assert.deepEqual(page.embedDrawn().filter((x) => SLOT.connectorSeats.includes(x.slot)).map((x) => x.slot + '#' + x.id), [], 'embed-UI still draws in the marks seats')
  })

  // ---------------------------------------------------------------- EP-03: words, en and zh
  for (const lang of TEXT.langs) {
    const W = MARKS.words[lang]
    row(sdk, 'MARKS-EP-03', lang, `${lang}: "${MARKS.fill(W.handOverTo, P.navigator.name)}", "${W.handOverMany}", "${W.takeBack}", "${MARKS.fill(W.managedBy, P.navigator.name)}"; namespace ${MARKS.namespace}`, async (t) => {
      const one1 = await world(t, sdk, { principals: [online(P.navigator)], managed: [[P.sessions.s2, P.navigator]], page: { lang } })
      const single = await mountHeader(one1.page)
      assert.ok(await one1.page.waitFor(() => handOverButtons(single).length > 0), 'no Hand over')
      assert.ok(textIn(handOverButtons(single)[0]).includes(MARKS.fill(W.handOverTo, P.navigator.name)), 'button: ' + textIn(handOverButtons(single)[0]))
      const managed = await mountHeader(one1.page, P.sessions.s2)
      assert.ok(await one1.page.waitFor(() => withAttr(managed.tree(), ATTR.takeBack).length > 0), 'no Take back')
      assert.equal(textIn(withAttr(managed.tree(), ATTR.takeBack)[0]), W.takeBack)
      assert.equal(textIn(withAttr(managed.tree(), ATTR.managedBy)[0]), MARKS.fill(W.managedBy, P.navigator.name))
      const mark = await mountRowMark(one1.page, P.sessions.s2)
      assert.ok(await one1.page.waitFor(() => withAttr(mark.tree(), ATTR.managedRow).length > 0), 'no row mark')
      assert.equal(withAttr(mark.tree(), ATTR.managedRow)[0].props[ATTR.ariaLabel], MARKS.fill(W.managedBy, P.navigator.name))
      const two = await world(t, sdk, { principals: [online(P.navigator), online(P.indexer)], page: { lang } })
      const many = await mountHeader(two.page)
      assert.ok(await two.page.waitFor(() => manyButtons(many).length > 0), 'no several-targets control')
      assert.equal(textIn(manyButtons(many)[0]), W.handOverMany)
      const dicts = one1.page.dictionaries.filter((d) => d.ns === MARKS.namespace)
      assert.ok(dicts.some((d) => Object.values(d.dicts[lang] ?? {}).includes(W.handOverTo)), 'no ' + MARKS.namespace + ' dictionary in ' + lang)
    })
  }

  // ---------------------------------------------------------------- EP-04: hooks and classes
  row(sdk, 'MARKS-EP-04', 'hooks', 'every hook of the header, row menu, row marks and note dialog is data-dsh-connector-*, every class dshc-*; none is data-fishball-* or fb-*', async (t) => {
    const { page } = await fullWorld(t, sdk)
    const views = await mountAll(page)
    assert.ok(await page.waitFor(() => views.some((v) => withAttr(v.tree(), ATTR.handOver).length + withAttr(v.tree(), ATTR.handOverMany).length > 0)), 'no Hand over drawn')
    await press(page, withAttr(views[2].tree(), ATTR.handOver)[0])
    assert.ok(await page.waitFor(() => withAttr(page.tree(), ATTR.confirm).length > 0), 'no note dialog [' + ATTR.confirm + ']')
    // The overlay seat also holds embed-UI's own notice (data-fishball-*, unchanged by R2): read the part's surfaces and its dialog only.
    const dialog = withAttr(page.tree(), ATTR.role, ATTR.dialog)
    const nodes = views.slice(1).flatMap(nodesOf).concat(dialog.flatMap((d) => subtreeOf(d)).filter((n) => typeof n !== 'string'))
    const old = nodes.flatMap((n) => Object.keys(n.props).filter((k) => k.startsWith(MARKS.oldHookPrefix)))
    assert.deepEqual([...new Set(old)], [], 'old data-fishball-* hooks')
    const own = views.slice(1).flatMap(nodesOf).flatMap((n) => classesOf(n))
    assert.deepEqual([...new Set(own.filter((c) => c.startsWith(MARKS.oldClassPrefix)))], [], 'old fb-* classes')
    assert.ok(own.some((c) => c.startsWith(MARKS.classPrefix)), 'no dshc-* class on the part')
    for (const hook of [ATTR.handOver, ATTR.target, ATTR.online, ATTR.takeBack, ATTR.managedBy, ATTR.managedRow, ATTR.rowState, ATTR.confirm]) {
      assert.ok(nodes.some((n) => n.props[hook] !== undefined), 'no element carries ' + hook)
    }
  })

  // ---------------------------------------------------------------- EP-05 / EP-06: the icon
  for (const running of [false, true]) {
    const state = running ? MARKS.rowState.running : MARKS.rowState.idle
    row(sdk, 'MARKS-EP-05', 'icon ' + state, `a managed row ${state} → its mark draws V1's fish (body + magenta eye, no wrench)${running ? ' and flips (dshc-flip)' : ', not flipping'}`, async (t) => {
      const { page } = await world(t, sdk, { principals: [online(P.navigator)], managed: [[S1, P.navigator]] })
      const view = await page.mount(running ? SLOT.rowTrailing : SLOT.rowLeading, { ...sessionProps(S1), useSessionStatus: statusHook(S1, running) })
      assert.ok(await page.waitFor(() => withAttr(view.tree(), ATTR.managedRow, S1).length > 0), 'no row mark')
      const mark = withAttr(view.tree(), ATTR.managedRow, S1)[0]
      assert.equal(attrOf(mark, ATTR.rowState), state, 'row state')
      const svg = one(byTag([mark], TAG.svg), 'svg in the row mark')
      assertV1Fish(svg, state)
      assert.equal(subtreeOf(mark).some((n) => classesOf(n).includes(MARKS.flip)), running, 'flip class ' + MARKS.flip)
    })
  }
  row(sdk, 'MARKS-EP-06', 'icon surfaces', 'only the row seats draw the fish; header, row menu and overlay draw none; no element carries the sidebar fish hook', async (t) => {
    const { page } = await fullWorld(t, sdk)
    const views = await mountAll(page)
    assert.ok(await page.waitFor(() => views.some((v) => withAttr(v.tree(), ATTR.managedRow).length > 0)), 'no row mark')
    // A row seat's view is the one holding a managed row mark; every other surface must draw no fish.
    const isRowSeat = (v) => withAttr(v.tree(), ATTR.managedRow).length > 0
    const fishIn = (list) => list.flatMap((v) => byTag(v.tree(), TAG.svg)).filter(isPlainFish)
    assert.equal(fishIn(views.filter((v) => !isRowSeat(v))).length, 0, 'a header, menu or overlay surface draws the fish')
    assert.ok(fishIn(views.filter(isRowSeat)).length > 0, 'no row seat draws the fish')
    assert.deepEqual(views.flatMap((v) => withAttr(v.tree(), ATTR.fishMark)), [], 'a part element carries ' + ATTR.fishMark)
  })

  // ---------------------------------------------------------------- ST-01: without embed-UI
  row(sdk, 'MARKS-ST-01', 'no embed-UI', 'only the connector: Unmanaged –Hand over→ Managed (row mark, Managed by, Take back) –Take back→ Unmanaged (R1)', async (t) => {
    const { w, page } = await world(t, sdk, { principals: [online(P.navigator)], page: { embed: false } })
    await mountOverlay(page)
    const header = await mountHeader(page)
    const mark = await mountRowMark(page)
    assert.ok(await page.waitFor(() => handOverButtons(header).length > 0), 'no Hand over without embed-UI')
    await press(page, handOverButtons(header)[0])
    await confirmNote(page, P.note)
    assert.ok(await page.waitFor(() => withAttr(header.tree(), ATTR.takeBack).length > 0), 'no Take back after Hand over')
    assert.deepEqual(w.handover.calls.handOver, [[S1, P.navigator.key, P.note]])
    assert.ok(textIn(withAttr(header.tree(), ATTR.managedBy)[0]).includes(labelOf(P.navigator)))
    assert.ok(await page.waitFor(() => withAttr(mark.tree(), ATTR.managedRow, S1).length > 0), 'no row mark')
    await press(page, withAttr(header.tree(), ATTR.takeBack)[0])
    assert.ok(await page.waitFor(() => handOverButtons(header).length > 0 && withAttr(mark.tree(), ATTR.managedRow).length === 0), 'not unmanaged after Take back')
    assert.deepEqual(w.handover.calls.takeBack, [[S1]])
  })

  // ---------------------------------------------------------------- BVA-01: R5, no UI backend
  for (const embed of [false, true]) {
    row(sdk, 'MARKS-BVA-01', embed ? 'with embed-UI' : 'connector only', `no connector UI backend${embed ? ' (embed-UI loaded)' : ''} → the part registers nothing, POSTs nothing, logs no error (R5)`, async (t) => {
      const { w, page } = await world(t, sdk, { host: { ui: false, tools: false }, page: { embed } })
      await assertDrawsNothing(page)
      assert.deepEqual(page.requests.filter((r) => r.method === 'POST'), [], 'POSTs')
      assert.deepEqual(page.errors, [], 'page console errors')
      assert.deepEqual(page.logs.filter((l) => l.type === MARKS.errorType), [], 'page error log lines')
      assert.deepEqual(page.logs.filter((l) => l.name !== EMBED_ID && l.type === MARKS.warnType), [], "the connector's part warned")
      assert.deepEqual(w.logs.filter((l) => l.type === MARKS.errorType && !l.text.includes('connector-missing')), [], 'host error lines besides embed-UI\'s connector-missing')
    })
  }

  // ---------------------------------------------------------------- R6: load order, failure and one stream
  row(sdk, 'MARKS-R6', 'entry missing', "the connector's browser entry fails to load → embed-UI logs exactly one 'part unavailable' warning and nothing is registered", async (t) => {
    const { page } = await world(t, sdk, { principals: [online(P.navigator)], page: { connector: false } })
    assert.deepEqual(page.live().map((x) => x.slot + '#' + (x.id ?? x.key)), [], 'registered without the connector entry')
    const warns = page.logsWith(MARKS.warnType, MARKS.unavailable)
    assert.equal(warns.length, 1, "'part unavailable' warnings: " + JSON.stringify(warns))
    assert.deepEqual(page.logs.filter((l) => l.type === MARKS.errorType), [], 'error log lines')
  })
  for (const both of [false, true]) {
    row(sdk, 'MARKS-R6', both ? 'one stream (both)' : 'one stream (connector only)', `${both ? 'both packages' : 'the connector alone'}, fish, overlay, header, row mark and row menu mounted → exactly one snapshot stream`, async (t) => {
      const { page } = await fullWorld(t, sdk, { embed: both })
      if (both) await mountFish(page)
      await mountAll(page)
      assert.ok(await page.waitFor(() => streamsOf(page).some((s) => s.readyState === 1)), 'no open snapshot stream')
      assert.equal(streamsOf(page).length, 1, 'snapshot streams opened: ' + streamsOf(page).length)
    })
  }
}
