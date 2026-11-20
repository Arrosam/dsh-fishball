/**
 * ICON-SET rows of embed-UI's fish (the user, 2026-11-18: the wrench under Fishball is the
 * connector's icon and goes; ../../contract/package-boundaries/icon-set.mjs). The sidebar Fishball
 * row's `svg[data-fishball-mark]` and every managed-session row mark draw the plain fish: exactly
 * the FishMark body path and its eye path, no wrench (`data-fishball-wrench`) and no badge (no ring,
 * chip, glyph group or any other drawing element). The fish keeps its unread wag, its running flip
 * and its light dot (criterion 6: only the wrench changes). The wag, flip and dot hooks are the ones
 * the page drew before ICON-SET, pinned here as unchanged.
 *
 * Techniques:
 * - State transition over the sidebar fish: off (plain) → signal(important) → lit, wag, dot
 *   (still plain) → window opened → off, no dot (still plain);
 * - Decision table over the fish's light (rules: nothing, signal, signal(important), notify,
 *   notify(important)) × the drawing: every rule keeps exactly body + eye;
 * (The managed-row rows moved to packages/dsh-connector/tests/marks, where they pin V1's fish since 2026-11-21.)
 * - EP over every surface the page draws (fish, main, overlay, header, row seats, menu): no element
 *   carries the old wrench hook.
 * Rows that fail on the old design: its sidebar fish carried the wrench badge after the eye.
 *
 * Level: integration, the world of cases.mjs (world.mjs).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from '../../../../../test/v3/contract/package-boundaries/cases.mjs'
import { FISH, WRENCH } from '../../../../../test/v3/contract/package-boundaries/icon-set.mjs'
import { mountFish, mountMain, mountOverlay, world } from './cases.mjs'
import { ATTR, FIXTURE, SLOT, TAG, TOOL, WAIT } from './constants.mjs'
import { attrOf, byTag, sessionProps, subtreeOf, withAttr } from './world.mjs'

const S1 = FIXTURE.sessions.s1
const draw = (sdk, id, part, title, fn) => test(caseName(sdk, id, part, title), { timeout: WAIT.testMs }, fn)
/** The fish's animation and dot hooks as the page drew them before ICON-SET (unchanged by it). */
const KEEP = Object.freeze({ wag: 'fb-wag', flip: 'fb-flip', dot: 'data-fishball-dot', rowState: 'data-fishball-row-state', running: 'running', idle: 'idle' })
const ID = Object.freeze({ st: 'ICON-DRAW-ST-01', dt: 'ICON-DRAW-DT-01', rows: 'ICON-DRAW-EP-01', hook: 'ICON-DRAW-EP-02' })
const TRAILING = 'sidebar.session.row.trailing'
const classesOf = (node) => String(node?.props.className ?? '').split(/\s+/).filter(Boolean)

/** The one `svg[data-fishball-mark]` under `nodes`: exactly body then eye, nothing else drawn, no wrench hook. */
function assertPlainFish(nodes, what) {
  const marks = withAttr(nodes, ATTR.fishMark).filter((n) => n.tag === TAG.svg)
  assert.equal(marks.length, 1, `${what}: svg[${ATTR.fishMark}] count`)
  const [svg] = marks
  const drawn = subtreeOf(svg).slice(1).filter((n) => typeof n !== 'string')
  assert.deepEqual(drawn.map((n) => [n.tag, n.props.d]), [['path', FISH.body], ['path', FISH.eye]], `${what}: the fish draws more or other than its body and eye`)
  assert.deepEqual(withAttr(nodes, WRENCH.attr), [], `${what}: an element carries ${WRENCH.attr}`)
  return svg
}
const fishOf = (view) => withAttr(view.tree(), ATTR.fishLight)[0]
const dotsOf = (view) => withAttr(view.tree(), KEEP.dot)
/** A DSH useSessionStatus selector hook over one Session's `running` fact (dsh-client-ui-session SessionStatus). */
const statusHook = (sessionId, running) => {
  const snapshot = new Map([[sessionId, { running, pendingInteraction: undefined, completionUnread: false }]])
  return (select = (v) => v) => select(snapshot)
}

export function registerIconDrawCases(sdk) {
  // ---------------------------------------------------------------- the sidebar fish's states
  draw(sdk, ID.st, 'off → lit(important) → opened', 'the sidebar fish is plain (body + eye, no wrench, no badge) when off; lit and important it wags and shows its dot, still plain; opening the window turns it off and drops the dot, still plain', async (t) => {
    const { w, page } = await world(t, sdk)
    const fish = await mountFish(page)
    let svg = assertPlainFish(fish.tree(), 'off')
    assert.equal(attrOf(fishOf(fish), ATTR.fishLight), ATTR.off)
    assert.ok(!classesOf(svg).includes(KEEP.wag), 'the fish wags with nothing unread')
    assert.deepEqual(dotsOf(fish), [], 'a light dot with the light off')
    await w.call(TOOL.signal, { important: true })
    assert.ok(await page.waitFor(() => attrOf(fishOf(fish), ATTR.fishLight) === ATTR.on), 'the fish did not light')
    svg = assertPlainFish(fish.tree(), 'lit')
    assert.ok(await page.waitFor(() => classesOf(withAttr(fish.tree(), ATTR.fishMark)[0]).includes(KEEP.wag)), 'the important fish lost its wag: ' + classesOf(svg))
    assert.equal(dotsOf(fish).length, 1, 'the lit fish lost its light dot')
    await mountMain(page)
    assert.ok(await page.waitFor(() => attrOf(fishOf(fish), ATTR.fishLight) === ATTR.off), 'opening the window did not turn the fish off')
    assertPlainFish(fish.tree(), 'opened')
    assert.deepEqual(dotsOf(fish), [], 'the dot stayed after the window opened')
  })

  // ---------------------------------------------------------------- the light × the drawing
  const RULES = [
    { rule: 1, cause: 'nothing', act: async () => {}, lit: false, wag: false },
    { rule: 2, cause: 'signal(false)', act: (w) => w.call(TOOL.signal, { important: false }), lit: true, wag: false },
    { rule: 3, cause: 'signal(true)', act: (w) => w.call(TOOL.signal, { important: true }), lit: true, wag: true },
    { rule: 4, cause: 'notify', act: (w) => w.call(TOOL.notify, { message: FIXTURE.message }), lit: true, wag: false },
    { rule: 5, cause: 'notify(important)', act: (w) => w.call(TOOL.notify, { message: FIXTURE.message, important: true }), lit: true, wag: true },
  ]
  for (const r of RULES) {
    draw(sdk, ID.dt, 'rule ' + r.rule, `${r.cause} → the sidebar fish is exactly body + eye; dot ${r.lit ? 'shown' : 'none'}, wag ${r.wag ? 'on' : 'off'}`, async (t) => {
      const { w, page } = await world(t, sdk)
      const fish = await mountFish(page)
      await r.act(w)
      assert.ok(await page.waitFor(() => attrOf(fishOf(fish), ATTR.fishLight) === (r.lit ? ATTR.on : ATTR.off)), 'the light did not settle')
      assert.ok(await page.waitFor(() => classesOf(withAttr(fish.tree(), ATTR.fishMark)[0]).includes(KEEP.wag) === r.wag), 'wag ' + classesOf(withAttr(fish.tree(), ATTR.fishMark)[0]))
      assertPlainFish(fish.tree(), r.cause)
      assert.equal(dotsOf(fish).length, r.lit ? 1 : 0, 'light dots')
    })
  }

  // ICON-DRAW-EP-01 (the managed-row marks) moved to packages/dsh-connector/tests/marks (MARKS-EP-05/06), where they pin V1's fish.

  // ---------------------------------------------------------------- no surface carries the wrench hook
  draw(sdk, ID.hook, 'every surface', `no element of the fish, window, overlay, header, row seats or row menu carries ${WRENCH.attr}`, async (t) => {
    const { w, page } = await world(t, sdk, { principals: [[FIXTURE.navigator, { online: true }]], managed: [[S1, FIXTURE.navigator]] })
    await w.call(TOOL.notify, { message: FIXTURE.message, important: true })
    await mountFish(page)
    await mountOverlay(page)
    for (const slot of [SLOT.header, SLOT.rowLeading, SLOT.rowMenu, TRAILING]) await page.mount(slot, { ...sessionProps(S1), useSessionStatus: statusHook(S1, true) })
    const view = await mountMain(page)
    assert.ok(await page.waitFor(() => byTag(view.tree(), TAG.iframe).length > 0), 'no window frame')
    assert.ok(withAttr(page.tree(), ATTR.fishMark).length >= 1, 'the sidebar fish was not drawn')
    assert.ok(withAttr(page.tree(), ATTR.managedRow).length >= 1, 'no row mark was drawn')
    assert.deepEqual(withAttr(page.tree(), WRENCH.attr).map((n) => n.tag), [], 'an element carries the old wrench hook')
  })
}
