/**
 * FEAT-PEERS black-box cases (.runtime/reports/v3-w3-briefs.md "Test-session brief (FEAT-PEERS)";
 * v3-tasks.md row FEAT-PEERS, wave W3). Written from the requirements (R-FB-06, R-BRD-01/02),
 * the cases (docs/test-design/v3/11-platform.md PLAT-EP-04 row 1, PLAT-UC-06, PLAT-BVA-01), and
 * the contracts (K3 `fishballInstance`, X1/X2 and §12.6/§12.7 of
 * docs/plugins/instance-extension-points.md). No file of the board package (packages/board/ then)
 * outside package.json, README.md and cordis.patch.yml was read. Board is V3's only feature plugin (REMOVE-WD, design
 * §1.0), so the other plugins' rows (EXT-UC-04 A1, PLAT-EP-04 rows 2 and 4, PEERS-DT-01) are gone.
 *
 * **The user dropped the board export (2026-11-15).** There is no `board_export` tool and no export
 * on uninstall; uninstalling the board deletes its data. So PLAT-UC-06 E2 (the standalone
 * `board_export` manager tool and its README note) and E1 (the hosted uninstall offer, which Q-23
 * had moved to I-HOST) have no row here, and the brief's oracle "`board_export` is a manager tool
 * in standalone mode" is dropped. R-BRD-02 and R-HOST-02's export clause need the matching edit
 * (a spec gap reported to Fishball). Every other board rule stands.
 *
 * Techniques, Use Cases first: UC (PLAT-UC-06 main and A1: one test per flow), EP (PLAT-EP-04 row
 * 1, plus PEERS-EP-01, the "with a fake fishballInstance" partition the brief's seam names) and BVA
 * (PLAT-BVA-01 rows 1–3). No case of this task has states to walk, so there is no ST row. PEERS-*
 * ids are this suite's own.
 *
 * Level: integration, in-process (world.mjs): the board's real row on a loader of the current DSH,
 * with and without a fake `fishballInstance` (`apiVersion: 1`) and a fake clock for the board
 * (node:test MockTimers on `Date`). No DSH process and no child is launched. The board over core's
 * real instance would need fishball-core beside it: not this package's tests (see PEERS-EP-01 below).
 *
 * Oracles:
 * - "boot ok" = the row's fiber is ACTIVE; "does nothing beyond logging" = no tool in DSH's global
 *   registry and no file under the home (R-FB-06);
 * - "visible" = `board_search`'s `onBoard` (§12.7: the id is in the visibility projection);
 *   "archived" = not on the board and still found by `board_search`;
 * - "no record is deleted" = the archive file only grows: every earlier read is a prefix of the
 *   later one (§12.6, append-only).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from 'fishball-test-helpers/cases'
import { BOARD, CORE_MISSING, FIXTURE, PLUGIN, RETENTION, WAIT } from './constants.mjs'
import { fakeClock } from './subject.mjs'
import { worldFor } from './world.mjs'

const T = { timeout: WAIT.testMs }
const ID = Object.freeze({ uc06: 'PLAT-UC-06', ep04: 'PLAT-EP-04', ep01: 'PEERS-EP-01', bva01: 'PLAT-BVA-01' })

/** One test per case row on the current DSH: `<ID> <row> [DSH <version>] <title>`. */
function row(id, part, title, fn) { test(caseName(id, part, title), T, fn) }

// ------------------------------------------------------------------------------------------------
// Board helpers

/** A board world with core: the fake clock started, the board loaded and its tools in the manager scope. */
async function boardWorld(t) {
  const clock = fakeClock(t, FIXTURE.epochMs)
  const w = await worldFor(t, { core: true })
  await w.load(PLUGIN.board)
  assert.ok(w.active(PLUGIN.board), 'the board row is up')
  return { w, clock }
}

/** Creates one open card and marks it done; returns its id (§3.2: create, then a transition). */
async function doneCard(w, n) {
  const title = FIXTURE.title(n)
  const created = await w.call(BOARD.tool.write, { cards: [{ title, status: BOARD.status.inProgress }] })
  const card = created?.cards?.find((c) => c.title === title)
  assert.ok(card?.id, 'board_write created the card: ' + JSON.stringify(created))
  const done = await w.call(BOARD.tool.write, { cards: [{ id: card.id, title, status: BOARD.status.done }] })
  assert.equal(done?.cards?.find((c) => c.id === card.id)?.status, BOARD.status.done, 'the card is done: ' + JSON.stringify(done))
  return card.id
}

/** The card's `board_search` hit by the fixture keyword; fails when the search finds no hit. */
async function hitOf(w, id) {
  const result = await w.call(BOARD.tool.search, { query: FIXTURE.keyword })
  assert.equal(result?.ok, true, 'board_search succeeded: ' + JSON.stringify(result))
  const hit = result.results.find((h) => h.card?.id === id)
  assert.ok(hit, `board_search finds ${id} by keyword`)
  return hit
}

/** Asserts the archive grew from `before` without losing a byte, and returns the new text. */
function archiveKept(w, before) {
  const now = w.readFile(BOARD.archive)
  assert.ok(now.startsWith(before), 'the archive lost no record (append-only)')
  return now
}

// ------------------------------------------------------------------------------------------------
// Feature plugins without core

/** Loads `plugins` in a DSH without core; asserts each is up, logs exactly one core-missing line and does nothing else. */
async function withoutCore(t, plugins) {
  const w = await worldFor(t)
  for (const plugin of plugins) await w.load(plugin)
  for (const plugin of plugins) assert.ok(w.active(plugin), `${plugin.name} booted (its row is active)`)
  const lines = w.linesWith(CORE_MISSING)
  assert.equal(lines.length, plugins.length, `one ${CORE_MISSING} line per plugin: ${JSON.stringify(lines)}`)
  assert.deepEqual([...w.global.tools.keys()], [], 'no tool registered')
  assert.deepEqual(w.files(), [], 'no file written')
}

export function registerFeatPeersCases() {
  // ============================================================================================
  // Use Cases

  // PLAT-UC-06 main: done → visible for 30 days → archived → found by keyword; nothing deleted.
  row(ID.uc06, 'main', 'a done item stays visible for 30 days, is then archived, and board_search finds it by keyword; no record deleted', async (t) => {
    const { w, clock } = await boardWorld(t)
    const id = await doneCard(w, 1)
    let archive = archiveKept(w, '')
    assert.equal((await hitOf(w, id)).onBoard, true, 'visible right after done')
    clock.advance(RETENTION.windowMs - RETENTION.secondMs)
    assert.equal((await hitOf(w, id)).onBoard, true, 'visible during the 30 days')
    archive = archiveKept(w, archive)
    clock.advance(RETENTION.secondMs)
    assert.equal((await hitOf(w, id)).onBoard, false, 'archived at 30 days')
    archive = archiveKept(w, archive)
    clock.advance(RETENTION.yearMs)
    assert.equal((await hitOf(w, id)).onBoard, false, 'stays archived, still found a year later')
    assert.ok(archiveKept(w, archive).includes(id), 'the archive still holds the card')
  })

  // PLAT-UC-06 A1: cleared early → archived at once, still searchable.
  row(ID.uc06, 'A1', 'a done item cleared early is archived at once and stays searchable; no record deleted', async (t) => {
    const { w, clock } = await boardWorld(t)
    const id = await doneCard(w, 1)
    const archive = archiveKept(w, '')
    const cleared = await w.call(BOARD.tool.write, { cards: [{ id, clear: true }] })
    assert.notEqual(cleared?.ok, false, 'clearing a done card is accepted: ' + JSON.stringify(cleared))
    assert.equal((await hitOf(w, id)).onBoard, false, 'archived at once')
    clock.advance(RETENTION.dayMs)
    assert.equal((await hitOf(w, id)).onBoard, false, 'stays archived inside the 30 days')
    assert.ok(archiveKept(w, archive).includes(id), 'the archive still holds the card')
  })

  // PLAT-UC-06 E1 and E2 (the export offer and `board_export`): dropped by the user, no row (header).

  // ============================================================================================
  // Equivalence Partitioning: PLAT-EP-04 (row 3 is F-STATUS's)

  row(ID.ep04, 1, 'board only, no core: one fishball-core-missing line; boot ok', (t) => withoutCore(t, [PLUGIN.board]))

  // PEERS-EP-01: the other partition of the seam: a fake fishballInstance is present.
  for (const plugin of [PLUGIN.board]) {
    row(ID.ep01, 1, `${plugin.name} with a fake fishballInstance (apiVersion 1): no fishball-core-missing line; boot ok; it registers its manager setup`, async (t) => {
      const w = await worldFor(t, { core: true })
      await w.load(plugin)
      assert.ok(w.active(plugin), `${plugin.name} booted`)
      assert.deepEqual(w.linesWith(CORE_MISSING), [], `no ${CORE_MISSING} line`)
      assert.ok(w.manager.setups.includes(plugin.name), `${plugin.name} registered its manager setup under its package name (X2)`)
    })
  }
  // PEERS-EP-01 row 3 (the board over core's real fishballInstance) was a todo for F-WIRE. It is not
  // ported: it needs fishball-core beside the board (an integration row, not this package's), and the
  // board is shelved (SHELVE-BOARD) and binds apiVersion 1 while core is at 2 (DESIGN.md, the
  // amenities release row), so no such row is planned.

  // ============================================================================================
  // Boundary Value Analysis: PLAT-BVA-01 (day = 86 400 s; archived at exactly 30 d, Q-24)
  // instance-extension-points.md §12.6 "Tests" says the opposite at the edge (on board at 30 d,
  // off at + 1 ms). The brief follows the case (Q-24), so row 2 expects archived; the conflict is
  // reported as a spec gap.

  for (const value of RETENTION.bva) {
    row(ID.bva01, value.row, `${value.label} since done: ${value.onBoard ? 'visible' : 'archived'}; searchable`, async (t) => {
      const { w, clock } = await boardWorld(t)
      const id = await doneCard(w, value.row)
      const archive = archiveKept(w, '')
      clock.advance(value.sinceDoneMs)
      assert.equal((await hitOf(w, id)).onBoard, value.onBoard, value.onBoard ? 'visible' : 'archived')
      archiveKept(w, archive)
    })
  }
}
