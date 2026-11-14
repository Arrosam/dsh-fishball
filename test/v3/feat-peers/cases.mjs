/**
 * FEAT-PEERS black-box cases (.runtime/reports/v3-w3-briefs.md "Test-session brief (FEAT-PEERS)";
 * v3-tasks.md row FEAT-PEERS, wave W3). Written from the requirements (R-FB-06, R-BRD-01/02,
 * R-FN-01, R-EXT-13, R-UI-04), the cases (docs/test-design/v3/11-platform.md PLAT-EP-04 rows 1, 2,
 * 4, PLAT-UC-06, PLAT-BVA-01; 07-contributors.md EXT-UC-04 A1), and the contracts (K3
 * `fishballInstance`, X1/X2/X8/X9 and §12.6/§12.7 of docs/plugins/instance-extension-points.md,
 * K1 REFUSAL). No file of packages/board/ or packages/fold-notify/ outside package.json, README.md
 * and cordis.patch.yml was read.
 *
 * **The user dropped the board export (2026-11-15).** There is no `board_export` tool and no export
 * on uninstall; uninstalling the board deletes its data. So PLAT-UC-06 E2 (the standalone
 * `board_export` manager tool and its README note) and E1 (the hosted uninstall offer, which Q-23
 * had moved to I-HOST) have no row here, and the brief's oracle "`board_export` is a manager tool
 * in standalone mode" is dropped. R-BRD-02 and R-HOST-02's export clause need the matching edit
 * (a spec gap reported to Fishball). Every other board and fold-notify rule stands.
 *
 * Techniques, Use Cases first: UC (PLAT-UC-06 main and A1, EXT-UC-04 A1: one test per flow), EP
 * (PLAT-EP-04 rows 1, 2, 4, plus PEERS-EP-01, the "with a fake fishballInstance" partition the
 * brief's seam names), BVA (PLAT-BVA-01 rows 1–3) and DT (PEERS-DT-01: the attention answer ×
 * importance, R-FN-01's "nothing else changes"). No case of this task has states to walk, so there
 * is no ST row. PEERS-* ids are this suite's own.
 *
 * Level: integration, in-process (world.mjs): each plugin's real row on a loader of the SDK under
 * test, with and without a fake `fishballInstance` (`apiVersion: 1`), a fake clock for the board
 * (node:test MockTimers on `Date`), and a fake core attention member (X8) for fold-notify. No DSH
 * process and no child is launched. The real core over a real link is F-WIRE's (todo rows).
 *
 * Oracles:
 * - "boot ok" = the row's fiber is ACTIVE; "does nothing beyond logging" = no tool in DSH's global
 *   registry and no file under the home (R-FB-06);
 * - "visible" = `board_search`'s `onBoard` (§12.7: the id is in the visibility projection);
 *   "archived" = not on the board and still found by `board_search`;
 * - "no record is deleted" = the archive file only grows: every earlier read is a prefix of the
 *   later one (§12.6, append-only);
 * - "nothing else changes" (R-FN-01, EXT-UC-04 A1) = a world whose attention member refuses ends
 *   exactly like one whose member accepts: the same tool result, records, files, attention calls
 *   and manager tools, the per-notice id, time and call id aside. Log lines are left out: a
 *   diagnostic line about the refusal is not a change the requirement names.
 */
import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import test from 'node:test'
import { caseName } from '../shared/cases.mjs'
import { ATTENTION, BOARD, CORE_MISSING, FIXTURE, FOLD, LATER, PLUGIN, RETENTION, WAIT } from './constants.mjs'
import { fakeClock } from './subject.mjs'
import { worldFor } from './world.mjs'

const T = { timeout: WAIT.testMs }
const ID = Object.freeze({ uc06: 'PLAT-UC-06', uc04: 'EXT-UC-04', ep04: 'PLAT-EP-04', ep01: 'PEERS-EP-01', bva01: 'PLAT-BVA-01', dt01: 'PEERS-DT-01' })

/** One test per case row, named as every V3 suite names them; `todo` names the owning task. */
function row(sdk, id, part, title, fn, todo) {
  const name = caseName(sdk, id, part, title)
  if (todo !== undefined) test.todo(`${name} — TODO ${todo}`)
  else test(name, T, fn)
}

// ------------------------------------------------------------------------------------------------
// Board helpers

/** A board world with core: the fake clock started, the board loaded and its tools in the manager scope. */
async function boardWorld(t, sdk) {
  const clock = fakeClock(t, FIXTURE.epochMs)
  const w = await worldFor(t, sdk, { core: true })
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
// Fold-notify helpers

/** Drops the per-notice values (id, time, call id) that differ between any two calls. */
function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).filter(([k]) => !FOLD.volatile.includes(k)).map(([k, v]) => [k, stable(v)]))
}

/** One fold-notify world with core whose attention member answers `attention`; one `notify_user` call; its whole outcome. */
async function foldOutcome(t, sdk, attention, important) {
  const w = await worldFor(t, sdk, { core: true, attention })
  await w.load(PLUGIN.fold)
  assert.ok(w.active(PLUGIN.fold), 'the fold-notify row is up')
  const result = await w.call(FOLD.tool, { message: FIXTURE.notice, important })
  await sleep(WAIT.quietMs)
  return {
    result: stable(result),
    records: stable(w.records(FOLD.recordPrefix).map((r) => ({ type: r.type, data: r.data }))),
    files: w.files(),
    signals: w.signals,
    tools: [...w.manager.scope.registry.tools.keys()].sort(),
  }
}

// ------------------------------------------------------------------------------------------------
// Feature plugins without core

/** Loads `plugins` in a DSH without core; asserts each is up, logs exactly one core-missing line and does nothing else. */
async function withoutCore(t, sdk, plugins) {
  const w = await worldFor(t, sdk)
  for (const plugin of plugins) await w.load(plugin)
  for (const plugin of plugins) assert.ok(w.active(plugin), `${plugin.name} booted (its row is active)`)
  const lines = w.linesWith(CORE_MISSING)
  assert.equal(lines.length, plugins.length, `one ${CORE_MISSING} line per plugin: ${JSON.stringify(lines)}`)
  assert.deepEqual([...w.global.tools.keys()], [], 'no tool registered')
  assert.deepEqual(w.files(), [], 'no file written')
}

export function registerFeatPeersCases(sdk) {
  // ============================================================================================
  // Use Cases

  // PLAT-UC-06 main: done → visible for 30 days → archived → found by keyword; nothing deleted.
  row(sdk, ID.uc06, 'main', 'a done item stays visible for 30 days, is then archived, and board_search finds it by keyword; no record deleted', async (t) => {
    const { w, clock } = await boardWorld(t, sdk)
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
  row(sdk, ID.uc06, 'A1', 'a done item cleared early is archived at once and stays searchable; no record deleted', async (t) => {
    const { w, clock } = await boardWorld(t, sdk)
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

  // EXT-UC-04 A1: without embed-UI the attention call is refused unsupported-operation; nothing else changes.
  row(sdk, ID.uc04, 'A1', 'without embed-UI fold-notify\'s attention call gets unsupported-operation and nothing else changes', async (t) => {
    const accepted = await foldOutcome(t, sdk, ATTENTION.accepted, true)
    const refused = await foldOutcome(t, sdk, ATTENTION.refused, true)
    assert.ok(refused.signals.length >= 1, 'fold-notify made its attention call')
    for (const call of refused.signals) assert.equal(call.pluginId, PLUGIN.fold.name, 'the call names fold-notify (X8 pluginId)')
    assert.ok(refused.signals.some((call) => call.intent?.important === true), 'an important notice signals {important: true} (EXT-UC-04 step 2)')
    assert.deepEqual(refused, accepted, 'the refused answer changed nothing else')
  })
  row(sdk, ID.uc04, 'A1 end to end', 'through core\'s real X8 member and the façade to a connector with no embed-UI: unsupported-operation, nothing else changes', null, LATER.fWireAttention)

  // ============================================================================================
  // Equivalence Partitioning: PLAT-EP-04 (row 3 is F-STATUS's)

  row(sdk, ID.ep04, 1, 'board only, no core: one fishball-core-missing line; boot ok', (t) => withoutCore(t, sdk, [PLUGIN.board]))
  row(sdk, ID.ep04, 2, 'fold-notify only, no core: one fishball-core-missing line; boot ok', (t) => withoutCore(t, sdk, [PLUGIN.fold]))
  // Row 4 splits by owner: board's and fold-notify's part runs here; Watchdog's line is WD-ROUTE's.
  row(sdk, ID.ep04, '4 (board, fold-notify)', 'all three, no core: board and fold-notify boot and their two lines are among the lines logged', async (t) => {
    const w = await worldFor(t, sdk)
    for (const plugin of [PLUGIN.board, PLUGIN.fold, PLUGIN.watchdog]) await w.load(plugin)
    for (const plugin of [PLUGIN.board, PLUGIN.fold]) assert.ok(w.active(plugin), `${plugin.name} booted`)
    const lines = w.linesWith(CORE_MISSING).length
    assert.ok(lines >= 2 && lines <= 3, `two ${CORE_MISSING} lines from board and fold-notify, plus at most Watchdog's: ${lines}`)
  })
  row(sdk, ID.ep04, '4 (three lines)', 'all three, no core: three fishball-core-missing lines and Watchdog boots', null, 'WD-ROUTE (fishball-watchdog\'s runtime lookup and its fishball-core-missing line; then the full row is withoutCore(board, fold-notify, watchdog))')

  // PEERS-EP-01: the other partition of the seam: a fake fishballInstance is present.
  for (const plugin of [PLUGIN.board, PLUGIN.fold]) {
    row(sdk, ID.ep01, plugin === PLUGIN.board ? 1 : 2, `${plugin.name} with a fake fishballInstance (apiVersion 1): no fishball-core-missing line; boot ok; it registers its manager setup`, async (t) => {
      const w = await worldFor(t, sdk, { core: true })
      await w.load(plugin)
      assert.ok(w.active(plugin), `${plugin.name} booted`)
      assert.deepEqual(w.linesWith(CORE_MISSING), [], `no ${CORE_MISSING} line`)
      assert.ok(w.manager.setups.includes(plugin.name), `${plugin.name} registered its manager setup under its package name (X2)`)
    })
  }
  row(sdk, ID.ep01, 3, 'board and fold-notify over core\'s real fishballInstance in a Fishball DSH: no line; boot ok', null, LATER.fWireBoard)

  // ============================================================================================
  // Boundary Value Analysis: PLAT-BVA-01 (day = 86 400 s; archived at exactly 30 d, Q-24)
  // instance-extension-points.md §12.6 "Tests" says the opposite at the edge (on board at 30 d,
  // off at + 1 ms). The brief follows the case (Q-24), so row 2 expects archived; the conflict is
  // reported as a spec gap.

  for (const value of RETENTION.bva) {
    row(sdk, ID.bva01, value.row, `${value.label} since done: ${value.onBoard ? 'visible' : 'archived'}; searchable`, async (t) => {
      const { w, clock } = await boardWorld(t, sdk)
      const id = await doneCard(w, value.row)
      const archive = archiveKept(w, '')
      clock.advance(value.sinceDoneMs)
      assert.equal((await hitOf(w, id)).onBoard, value.onBoard, value.onBoard ? 'visible' : 'archived')
      archiveKept(w, archive)
    })
  }

  // ============================================================================================
  // Decision Table: PEERS-DT-01, importance × attention answer (R-FN-01, X8, fold-notify design §3)
  //
  // | rule | important | answer   | expected                                                                |
  // | 1    | true      | accepted | notified; one record, important true; signal {important: true}          |
  // | 2    | true      | refused  | as rule 1 (the refusal changes nothing else)                            |
  // | 3    | false     | accepted | notified; one record, important false; every signal {important: false}  |
  // | 4    | false     | refused  | as rule 3                                                               |

  const rules = [
    { rule: 1, important: true, answer: 'accepted' },
    { rule: 2, important: true, answer: 'refused' },
    { rule: 3, important: false, answer: 'accepted' },
    { rule: 4, important: false, answer: 'refused' },
  ]
  for (const { rule, important, answer } of rules) {
    row(sdk, ID.dt01, rule, `important ${important}, attention ${answer}: notified, one record of that importance, signals of that importance${answer === 'refused' ? ', the same as accepted' : ''}`, async (t) => {
      const outcome = await foldOutcome(t, sdk, ATTENTION[answer], important)
      assert.equal(outcome.result?.notified, true, 'notify_user notified: ' + JSON.stringify(outcome.result))
      assert.equal(outcome.result.important, important)
      assert.equal(outcome.records.length, 1, 'one notice record in Fishball\'s session')
      assert.equal(outcome.records[0].data?.important, important)
      assert.ok(outcome.signals.length >= 1, 'fold-notify made its attention call')
      for (const call of outcome.signals) assert.deepEqual(call, { pluginId: PLUGIN.fold.name, intent: { important } })
      if (answer === 'refused') assert.deepEqual(outcome, await foldOutcome(t, sdk, ATTENTION.accepted, important), 'the refusal changed nothing else')
    })
  }
}
