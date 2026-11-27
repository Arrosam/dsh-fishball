/**
 * MARKS-MULTI: the marks part with several agents on one DSH (several Fishball instances, or other
 * paired principals). The request (the lead, 2026-11-21): every surface names each agent by its own
 * name, keyed by its own principal key, never another agent's, and never the first one's for all.
 * Expected values come from R-UI-10 ("Hand over to <name>", the "Handover to…" dropdown listing each
 * target with its light, in the connector's order), R-UI-05 / R-NAME-05 ("Managed by <agent>"),
 * R-NAME-08 (a nameless agent is bold "ID:" and its id) and K3 (the request carries the target's
 * key). No implementation was read for the expected values.
 *
 * The dialog while the snapshot changes (decided here, reported to the lead): the agent chosen is
 * its principal key (it is what the confirm posts). A rename of that agent while the dialog is open
 * shows the new name, because names are unique but not stable (set_name): with the open-time name,
 * a swap (the chosen agent renamed, another taking its old name) would leave the title naming an
 * agent the confirm does not hand over to. Another agent going offline or away changes nothing. The
 * chosen agent going away keeps its last words and the confirm's refusal (no-agent) is shown.
 *
 * Cases (technique → rows):
 * | Id | Technique | Rows |
 * |---|---|---|
 * | MARKS-MULTI EP 2 / 3 targets | EP × BVA (targets 2 / 3) | header dropdown: one item per target, its key, its own label and light, in order; row menu: one "Hand over to <label>" per target with its key and light |
 * | MARKS-MULTI DT pick #1–#3 (row menu, header) | DT (surface × chosen index) | dialog title "Hand over to <chosen>"; confirm posts the chosen key; then "Managed by <chosen>" (header, data key, row mark) |
 * | MARKS-MULTI ST rename / swap / other offline / other removed / chosen removed | ST (dialog open → snapshot changes → confirm) | title follows the chosen key's row; the confirm posts the chosen key; chosen removed → last words, no-agent alert |
 *
 * Level: integration, the U-DRAW world (packages/dsh-connector/ui/tests/draw/world.mjs).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from 'dsh-connector-test-helpers/cases'
import { alerts, bodiesOf, confirmNote, findRole, labelOf, labelText, manyButtons, mountHeader, mountOverlay, mountRowMark, mountRowMenu, one, openMenu, posted, world } from '../../ui/tests/draw/cases.mjs'
import { lightOf, press, row, textIn, withAttr } from '../../ui/tests/draw/world.mjs'
import { ATTR, FIXTURE, MULTI, TEXT, WAIT } from './constants.mjs'

const P = FIXTURE
const S1 = P.sessions.s1
const NO_AGENT = 'no-agent'
const draw = (sdk, part, title, fn) => test(caseName(sdk, MULTI.id, part, title), { timeout: WAIT.testMs }, fn)
/** Fixture targets: Navigator online, Indexer offline, nameless agent-x online (R-NAME-08). */
const THREE = Object.freeze([[P.navigator, true], [P.indexer, false], [P.nameless, true]])
const at = (list, count) => list.slice(0, count)
const principalsOf = (list) => list.map(([p, on]) => [p, { online: on }])
const lightWords = (on) => ({ online: on ? ATTR.yes : ATTR.no, label: on ? TEXT.online : TEXT.offline })
/** The open dialog and its title (the fake Modal draws its title first). */
const dialogOf = (page) => findRole(page.tree(), ATTR.dialog)[0]
const titleOf = (page) => textIn(dialogOf(page)?.children?.[0] ?? '')

/** The two surfaces a user picks an agent from: the row menu's items, the header's dropdown. */
const SURFACES = Object.freeze([
  ['row menu', async (page) => {
    const menu = await mountRowMenu(page)
    assert.ok(await page.waitFor(() => findRole(menu.tree(), ATTR.menuitem).length > 0), 'no row menu items')
    return () => findRole(menu.tree(), ATTR.menuitem)
  }],
  ['header', async (page) => {
    const header = await mountHeader(page)
    assert.ok(await page.waitFor(() => manyButtons(header).length > 0), 'no "Handover to…" dropdown')
    await openMenu(page, header)
    return () => withAttr(header.tree(), ATTR.menuItemId)
  }],
])
const [ROW_MENU] = SURFACES

/** Opens the dialog for target `index` from `surface`; returns the world. */
async function opened(t, sdk, list, index, [, pick] = ROW_MENU) {
  const x = await world(t, sdk, { principals: principalsOf(list) })
  await mountOverlay(x.page)
  const items = await pick(x.page)
  await press(x.page, items()[index])
  assert.ok(await x.page.waitFor(() => dialogOf(x.page)), 'no dialog')
  return x
}

export function registerMultiMarksCases(sdk) {
  for (const count of [2, 3]) {
    const list = at(THREE, count)
    draw(sdk, `EP ${count} targets`, `${count} agents → the dropdown and the row menu list each one with its own key, label and light, in order`, async (t) => {
      const { page } = await world(t, sdk, { principals: principalsOf(list) })
      const header = await mountHeader(page)
      const menu = await mountRowMenu(page)
      assert.ok(await page.waitFor(() => manyButtons(header).length > 0 && findRole(menu.tree(), ATTR.menuitem).length === count), 'controls not drawn')
      const dropdown = await openMenu(page, header)
      assert.deepEqual(dropdown.map((i) => i.props[ATTR.menuItemId]), list.map(([p]) => p.key), 'dropdown keys')
      assert.deepEqual(dropdown.map(labelText), list.map(([p]) => labelOf(p)), 'dropdown labels')
      assert.deepEqual(dropdown.map(lightOf), list.map(([, on]) => lightWords(on)), 'dropdown lights')
      const items = findRole(menu.tree(), ATTR.menuitem)
      assert.deepEqual(items.map((i) => i.props[ATTR.target]), list.map(([p]) => p.key), 'row menu keys')
      assert.deepEqual(items.map(labelText), list.map(([p]) => TEXT.handOverTo(labelOf(p))), 'row menu labels')
      assert.deepEqual(items.map(lightOf), list.map(([, on]) => lightWords(on)), 'row menu lights')
    })
  }

  for (const surface of SURFACES) {
    THREE.forEach(([chosen], index) => {
      draw(sdk, `DT pick #${index + 1} (${surface[0]})`, `3 agents, the ${surface[0]} picks ${labelOf(chosen)} → dialog "${TEXT.handOverTo(labelOf(chosen))}"; confirm posts its key; "${TEXT.managedBy(labelOf(chosen))}" in the header and the row mark`, async (t) => {
        const { w, page } = await opened(t, sdk, THREE, index, surface)
        assert.equal(titleOf(page), TEXT.handOverTo(labelOf(chosen)), 'dialog title')
        const header = await mountHeader(page)
        const mark = await mountRowMark(page)
        await confirmNote(page, P.note)
        assert.ok(await posted(page, 'handOver'), 'no POST')
        assert.deepEqual(bodiesOf(page, 'handOver'), [{ sessionId: S1, principalKey: chosen.key, note: P.note }])
        assert.ok(await page.waitFor(() => withAttr(header.tree(), ATTR.managedBy).length > 0), 'no "Managed by"')
        const managedBy = one(withAttr(header.tree(), ATTR.managedBy), 'managed-by labels')
        assert.equal(textIn(managedBy), TEXT.managedBy(labelOf(chosen)))
        assert.equal(managedBy.props[ATTR.managedBy], chosen.key, 'managed-by key')
        assert.ok(await page.waitFor(() => withAttr(mark.tree(), ATTR.managedRow, S1).length > 0), 'no row mark')
        assert.equal(withAttr(mark.tree(), ATTR.managedRow, S1)[0].props[ATTR.ariaLabel], TEXT.managedBy(labelOf(chosen)))
        assert.deepEqual(w.handover.managed().map((m) => [m.sessionId, m.principal.key]), [[S1, chosen.key]])
      })
    })
  }

  // ---------------------------------------------------------------- the dialog while the snapshot changes
  const chosen = P.indexer
  const CHOSEN = THREE.findIndex(([p]) => p === chosen)
  const CHANGES = [
    { part: 'rename', what: `${chosen.name} renamed "${MULTI.renamed}"`, title: MULTI.renamed,
      apply: (w) => w.handover.patch(chosen.key, { name: MULTI.renamed }) },
    { part: 'swap', what: `${chosen.name} renamed "${MULTI.renamed}", then Navigator renamed "${chosen.name}"`, title: MULTI.renamed,
      apply: (w) => { w.handover.patch(chosen.key, { name: MULTI.renamed }); w.handover.patch(P.navigator.key, { name: chosen.name }) } },
    { part: 'other offline', what: 'Navigator goes offline', title: chosen.name,
      apply: (w) => w.handover.patch(P.navigator.key, { online: false }) },
    { part: 'other removed', what: 'Navigator disabled', title: chosen.name,
      apply: (w) => w.handover.patch(P.navigator.key, { enabled: false }) },
  ]
  for (const c of CHANGES) {
    draw(sdk, `ST ${c.part}`, `dialog open for ${chosen.name}; ${c.what} → title "${TEXT.handOverTo(c.title)}"; confirm posts ${chosen.name}'s key`, async (t) => {
      const { w, page } = await opened(t, sdk, THREE, CHOSEN)
      c.apply(w)
      assert.ok(await page.waitFor(() => titleOf(page) === TEXT.handOverTo(c.title)), 'title: ' + titleOf(page))
      await confirmNote(page)
      assert.ok(await posted(page, 'handOver'), 'no POST')
      assert.deepEqual(bodiesOf(page, 'handOver').map((b) => b.principalKey), [chosen.key])
    })
  }
  draw(sdk, 'ST chosen removed', `dialog open for ${chosen.name}; ${chosen.name} disabled → title stays "${TEXT.handOverTo(chosen.name)}"; confirm posts its key; the refusal ${NO_AGENT} is shown`, async (t) => {
    const { w, page } = await opened(t, sdk, THREE, CHOSEN)
    w.handover.patch(chosen.key, { enabled: false })
    // The real service answers no-agent for a key whose entry is not enabled and paired (K3).
    w.handover.script.handOver = { ok: false, code: NO_AGENT }
    await page.settle()
    assert.equal(titleOf(page), TEXT.handOverTo(chosen.name), 'title')
    await confirmNote(page)
    assert.ok(await page.waitFor(() => withAttr(alerts(page), ATTR.refusal, NO_AGENT).length > 0), 'no ' + NO_AGENT + ' alert')
    assert.deepEqual(bodiesOf(page, 'handOver').map((b) => b.principalKey), [chosen.key])
  })
}
