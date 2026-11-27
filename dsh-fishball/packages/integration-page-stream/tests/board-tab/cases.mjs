/**
 * fishball-taskboard's Task board tab beside fishball-ui on one page (DESIGN §34 "Browser": the
 * client service `fishballPageStream` is the amenities' way in; fishball-taskboard falls back to its own
 * `/api/fishball-taskboard/events` only where that service is absent). Old fishball-ui.connections R6,
 * CONN-TB-01…05.
 *
 * Techniques: EP (fishballPageStream present / absent; the frame a board / null / a string), ST (the
 * tab hidden → frame → shown; mounted → unmounted), BVA (one tab / two tabs → one carrier).
 * Level: component (scripted page; no DSH process). Values: constants.mjs TB_PAGE.
 */
import assert from 'node:assert/strict'
import { caseTest } from 'fishball-test-helpers/cases'
import { CARRIER, TB_PAGE, TOPIC } from '../constants.mjs'
import { boardPage } from '../support/board-page.mjs'

const show = (v) => JSON.stringify(v)
const first = TB_PAGE.boardOf([TB_PAGE.titles.first])
/** One carrier and nothing else (no retired per-view route) ever opened. */
function assertOneCarrier(p, why) {
  assert.equal(p.carriers().length, 1, why + ': open ' + show(p.paths()))
  assert.deepEqual(p.others(), [], why + ': another route was opened')
}

export function registerBoardTabCases() {
  caseTest('CONN-TB-01', 'rides the carrier', "with fishballPageStream present the Task board tab opens no connection of its own and draws the board the carrier's fishball-taskboard topic sends", async (t) => {
    const p = await boardPage(t)
    assert.ok(p.service(), 'precondition: fishball-ui provides ' + TB_PAGE.client)
    await p.mountBoard(0)
    assertOneCarrier(p, 'board alone')
    await p.push(TOPIC.taskboard, first)
    assert.ok(p.text().includes(TB_PAGE.titles.first), 'the carrier frame is not drawn: ' + p.text().slice(0, 200))
    await p.push(TOPIC.taskboard, TB_PAGE.boardOf([TB_PAGE.titles.first, TB_PAGE.titles.second], 2))
    assert.ok(p.text().includes(TB_PAGE.titles.second), 'a later frame is not drawn')
  })
  caseTest('CONN-TB-02', 'no visibility gating', 'the Task board tab hidden (tab.visible false, sidebar collapsed) → the carrier stays and is not reopened; a frame sent while hidden is drawn when shown again', async (t) => {
    const p = await boardPage(t)
    await p.mountBoard(0)
    await p.push(TOPIC.taskboard, first)
    const made = p.madeCarriers().length
    await p.setVisible(0, false)
    assertOneCarrier(p, 'hidden')
    await p.push(TOPIC.taskboard, TB_PAGE.boardOf([TB_PAGE.titles.hidden], 2))
    await p.setVisible(0, true)
    assertOneCarrier(p, 'shown again')
    assert.equal(p.madeCarriers().length, made, 'hiding or showing the tab reopened the carrier')
    assert.ok(p.text().includes(TB_PAGE.titles.hidden), 'the frame sent while hidden is not drawn')
  })
  caseTest('CONN-TB-03', 'two tabs', 'two Task board tabs mounted → one carrier; both draw each frame', async (t) => {
    const p = await boardPage(t)
    await p.mountBoard(0)
    await p.mountBoard(1)
    assertOneCarrier(p, 'two tabs')
    await p.push(TOPIC.taskboard, first)
    for (const id of [0, 1]) assert.ok(p.text(id).includes(TB_PAGE.titles.first), 'tab ' + id)
  })
  for (const [label, frame] of TB_PAGE.invalid) {
    caseTest('CONN-TB-04', 'invalid frame ' + label, `a fishball-taskboard frame that is ${label} keeps the last good board drawn`, async (t) => {
      const p = await boardPage(t)
      await p.mountBoard(0)
      await p.push(TOPIC.taskboard, first)
      await p.push(TOPIC.taskboard, frame)
      assert.ok(p.text().includes(TB_PAGE.titles.first), 'the last good board is gone: ' + p.text().slice(0, 200))
    })
  }
  caseTest('CONN-TB-05', 'standalone fallback', `without fishball-ui (no fishballPageStream) the Task board tab opens its own ${TB_PAGE.events} and no carrier; unmounted → closed`, async (t) => {
    const p = await boardPage(t, { withUi: false })
    assert.equal(p.service(), undefined, 'precondition: no ' + TB_PAGE.client)
    await p.mountBoard(0)
    assert.deepEqual(p.paths(), [TB_PAGE.events])
    assert.equal(p.carriers().length, 0, 'a carrier ' + CARRIER.path + ' was opened')
    await p.unmountBoard(0)
    assert.deepEqual(p.paths(), [])
  })
}
