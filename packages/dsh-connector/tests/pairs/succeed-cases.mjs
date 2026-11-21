/**
 * C-PAIR cases for `PairStore.succeed(oldEntryKey, successorEntryKey)` (K1 amendment after W2;
 * index.d.ts `PairStore.succeed`, `SucceedResult`; README NAME-ST-01 rows 8–9, DECIDED #W2-2).
 * Requirements R-NAME-07, R-HOST-09; HOST-UC-03 step 3 (the name part) and E2.
 *
 * Techniques, in this order: Use Case (HOST-UC-03's name flow), Decision Table (K1-AMEND-2: one test
 * per rule of {old paired?, successor paired?, same entry?} × {old named?, successor named?}) and
 * State Transition (NAME-ST-01 rows 8–9, listeners, durability, a race).
 *
 * Level: the real store over a real DSH storage domain (subject.mjs), as cases.mjs. "Nothing
 * changes" is the pair snapshot and no onChange notification.
 */
import assert from 'node:assert/strict'
import { assertGeneratedName, assertNameRefused, assertPairedGenerated, assertUniqueNames, at, bind, bindNameless, changes, row, setName } from './cases.mjs'
import { FIXTURE, REFUSAL, SUCCEED, principalLabel, succeedRefusal } from './constants.mjs'

const E = FIXTURE.entry
const CASE = Object.freeze({ hostUc03: 'HOST-UC-03', dt: 'K1-AMEND-2', nameSt01: 'NAME-ST-01' })
/** Entry numbers: the old entry, its successor, a third principal. */
const OLD = 1
const NEW = 2
const THIRD = 3
const FOURTH = 4

/** The successor pair as `succeed` must leave it: its own identity, the old name (or null). */
const successorAfter = (before, name) => ({ ...before, name })
/** `succeed` on the entries `oldN` → `newN`. */
const succeed = (w, oldN = OLD, newN = NEW) => w.store.succeed(E(oldN), E(newN))
/**
 * HOST-UC-03's precondition: Eo named "Navigator"; En paired with the same name, so refused and
 * named by the generator (the user's decision, 2026-11-21; before it, nameless).
 */
async function navigatorWorld(w) {
  const old = await bind(w, OLD, SUCCEED.oldId, SUCCEED.navigator)
  assertNameRefused(await w.store.pair(E(NEW), SUCCEED.newId, SUCCEED.navigator, at()), SUCCEED.newId, REFUSAL.nameTaken)
  return { old, successor: w.store.pairOf(E(NEW)) }
}
/** The old pair is gone as `remove` leaves it: no pair, no principal, id and name free. */
async function assertOldGone(w, old) {
  assert.equal(w.store.pairOf(old.entryKey), undefined, 'the old entry still has a pair')
  assert.equal(w.store.byPrincipal(old.principalKey), undefined, 'the old principal is still found')
  assert.ok(!w.store.list().some((p) => p.principalKey === old.principalKey || p.entryKey === old.entryKey), 'list() still holds the old pair')
}
/** A refused or no-op succeed: exactly `expected`, every pair unchanged, no notification. */
async function assertNoChange(w, call, expected) {
  const before = w.snapshot()
  const notified = changes(w)
  const result = await call()
  if (expected !== undefined) assert.deepEqual(result, expected)
  assert.deepEqual(w.snapshot(), before, 'nothing changes')
  assert.equal(notified.count, 0, 'no notification without a change')
  notified.off()
  return result
}

function useCase(sdk) {
  const uc = (part, title, fn) => row(sdk, CASE.hostUc03, part, title, fn)
  uc('main step 1 (name)', 'En pairs with the name Eo holds: paired with a generated name, nameRefused name-taken', async (w) => {
    const { successor } = await navigatorWorld(w)
    assertGeneratedName(successor.name)
  })
  uc('main step 3 (name)', 'succeed(Eo, En): one step; En is named "Navigator", Eo is gone; the name was never on two pairs', async (w) => {
    const { old, successor } = await navigatorWorld(w)
    const result = await succeed(w)
    assert.deepEqual(result, { ok: true, pair: successorAfter(successor, SUCCEED.navigator) })
    assert.deepEqual(w.store.pairOf(E(NEW)), successorAfter(successor, SUCCEED.navigator))
    await assertOldGone(w, old)
    assertUniqueNames(w)
  })
  uc('A1', 'Eo held only the name: after succeed En is shown as Navigator, not ID: fb-new', async (w) => {
    await navigatorWorld(w)
    await succeed(w)
    assert.deepEqual(principalLabel(w.store.pairOf(E(NEW)).name, SUCCEED.newId), principalLabel(SUCCEED.navigator, SUCCEED.newId))
  })
  // E2 (an injected storage failure in the succession step changes nothing) runs in packages/dsh-connector/tests/hosted (C-SUCCEED).
  uc('post', 'durable: after a restart En is still Navigator, Eo is gone, and nobody else can take Navigator', async (w) => {
    const { old, successor } = await navigatorWorld(w)
    await succeed(w)
    await w.reopen()
    assert.deepEqual(w.store.pairOf(E(NEW)), successorAfter(successor, SUCCEED.navigator))
    await assertOldGone(w, old)
    await bind(w, THIRD, SUCCEED.thirdId)
    assert.deepEqual(await setName(w, THIRD, SUCCEED.navigatorLower), { ok: false, code: REFUSAL.nameTaken })
  })
}

function decisionTable(sdk) {
  const dt = (rule, title, fn) => row(sdk, CASE.dt, rule, title, fn)

  dt('1', 'successor unpaired, old paired → successor-unpaired; the old pair keeps its id and name; no notification', async (w) => {
    await bind(w, OLD, SUCCEED.oldId, SUCCEED.navigator)
    await assertNoChange(w, () => succeed(w), { ok: false, code: succeedRefusal() })
    assert.equal(w.store.pairOf(E(OLD)).name, SUCCEED.navigator)
  })
  dt('1 (both unpaired)', 'successor and old unpaired → successor-unpaired; nothing changes', async (w) => {
    await assertNoChange(w, () => succeed(w), { ok: false, code: succeedRefusal() })
  })
  dt('2', 'old never paired, successor named → ok; nothing changes: the successor keeps its own name (DECIDED #W2-2)', async (w) => {
    await bind(w, NEW, SUCCEED.newId, SUCCEED.successorOwnName)
    const result = await assertNoChange(w, () => succeed(w))
    assert.equal(result?.ok, true, JSON.stringify(result))
    // `pair` may be absent here (no principal, nothing moved); when present it is the unchanged successor.
    if (result.pair !== undefined) assert.deepEqual(result.pair, w.store.pairOf(E(NEW)))
    assert.equal(w.store.pairOf(E(NEW)).name, SUCCEED.successorOwnName)
  })
  dt('2 (successor nameless)', 'old never paired, successor nameless (page bind, no name) → ok; the successor stays nameless', async (w) => {
    await bindNameless(w, NEW, SUCCEED.newId)
    const result = await assertNoChange(w, () => succeed(w))
    assert.equal(result?.ok, true, JSON.stringify(result))
    assert.equal(w.store.pairOf(E(NEW)).name, null)
  })
  dt('3', 'both paired, old named, successor with a generated name → ok, pair = successor named with the old name; own id, key, pairedAt', async (w) => {
    const old = await bind(w, OLD, SUCCEED.oldId, SUCCEED.navigator, at(FIXTURE.t1Offset))
    const successor = await bind(w, NEW, SUCCEED.newId, undefined, at(FIXTURE.t2Offset))
    assert.deepEqual(await succeed(w), { ok: true, pair: successorAfter(successor, SUCCEED.navigator) })
    await assertOldGone(w, old)
  })
  dt('4', 'both paired, old named, successor named → the successor\'s own name is replaced; its former name is free', async (w) => {
    await bind(w, OLD, SUCCEED.oldId, SUCCEED.navigator)
    const successor = await bind(w, NEW, SUCCEED.newId, SUCCEED.successorOwnName)
    assert.deepEqual(await succeed(w), { ok: true, pair: successorAfter(successor, SUCCEED.navigator) })
    await bind(w, THIRD, SUCCEED.thirdId)
    assert.deepEqual(await setName(w, THIRD, SUCCEED.successorOwnName), { ok: true, name: SUCCEED.successorOwnName }, 'the successor\'s former name is not free')
  })
  // Since the user's decision of 2026-11-21 a lack of a name no longer moves: the connector leaves no
  // pair nameless, so a nameless old pair (one still awaiting its first name call) leaves the
  // successor's own name in place.
  dt('5', 'both paired, old nameless (page bind, no name), successor named → the successor keeps its own name', async (w) => {
    const old = await bindNameless(w, OLD, SUCCEED.oldId)
    const successor = await bind(w, NEW, SUCCEED.newId, SUCCEED.successorOwnName)
    assert.deepEqual(await succeed(w), { ok: true, pair: successorAfter(successor, SUCCEED.successorOwnName) })
    await assertOldGone(w, old)
    await bind(w, THIRD, SUCCEED.thirdId)
    assert.deepEqual(await setName(w, THIRD, SUCCEED.successorOwnName), { ok: false, code: REFUSAL.nameTaken }, 'the successor still holds its name')
  })
  dt('6', 'both paired, both nameless (page binds, no name) → ok, the successor stays nameless; the old pair is gone', async (w) => {
    const old = await bindNameless(w, OLD, SUCCEED.oldId)
    const successor = await bindNameless(w, NEW, SUCCEED.newId)
    assert.deepEqual(await succeed(w), { ok: true, pair: successorAfter(successor, null) })
    await assertOldGone(w, old)
  })
  dt('7', 'both paired, the successor from the approval page: its clientIdUrl and redirectUri stay its own', async (w) => {
    await bind(w, OLD, SUCCEED.oldId, SUCCEED.navigator)
    const bound = await w.store.bindFromPage(E(NEW), SUCCEED.newId, undefined, FIXTURE.client, at())
    assert.equal(bound.ok, true, JSON.stringify(bound))
    const successor = w.store.pairOf(E(NEW))
    assert.deepEqual(await succeed(w), { ok: true, pair: successorAfter(successor, SUCCEED.navigator) })
    assert.equal(w.store.pairOf(E(NEW)).clientIdUrl, FIXTURE.client.clientIdUrl)
    assert.equal(w.store.pairOf(E(NEW)).redirectUri, FIXTURE.client.redirectUri)
  })
  for (const [rule, title, setup] of [
    ['8', 'both keys the same paired entry', (w) => bind(w, OLD, SUCCEED.oldId, SUCCEED.navigator)],
    ['8 (unpaired)', 'both keys the same unpaired entry', () => undefined],
  ]) {
    dt(rule, `${title} → throws TypeError (a caller bug); nothing changes`, async (w) => {
      await setup(w)
      const before = w.snapshot()
      await assert.rejects(async () => succeed(w, OLD, OLD), TypeError)
      assert.deepEqual(w.snapshot(), before)
    })
  }
  dt('after (id freed)', 'after succeed the old id is free: a new entry pairs with it', async (w) => {
    await bind(w, OLD, SUCCEED.oldId, SUCCEED.navigator)
    await bind(w, NEW, SUCCEED.newId)
    await succeed(w)
    assertPairedGenerated(await w.store.pair(E(THIRD), SUCCEED.oldId, undefined, at()), SUCCEED.oldId)
  })
  dt('after (name held)', 'after succeed the moved name is held by the successor: a third principal\'s set_name of it (any case) → name-taken; pair with it → a generated name, name-taken', async (w) => {
    await bind(w, OLD, SUCCEED.oldId, SUCCEED.navigator)
    await bind(w, NEW, SUCCEED.newId)
    await succeed(w)
    await bind(w, THIRD, SUCCEED.thirdId)
    assert.deepEqual(await setName(w, THIRD, SUCCEED.navigatorLower), { ok: false, code: REFUSAL.nameTaken })
    assertNameRefused(await w.store.pair(E(FOURTH), SUCCEED.oldId, SUCCEED.navigator, at()), SUCCEED.oldId, REFUSAL.nameTaken)
    assertUniqueNames(w)
  })
}

function stateTransitions(sdk) {
  const st = (n, title, fn) => row(sdk, CASE.nameSt01, n, title, fn)
  st('8', 'Named(generated) (successor) → retire succeeds → the old principal\'s state (Named(old)), moved in the same step', async (w) => {
    const { successor } = await navigatorWorld(w)
    const notified = changes(w)
    await succeed(w)
    assert.equal(notified.count, 1, 'listeners run once after the change')
    notified.off()
    assert.deepEqual(w.store.pairOf(E(NEW)), successorAfter(successor, SUCCEED.navigator))
  })
  st('8 (old nameless)', 'Named(generated) (successor) → retire succeeds with a nameless old principal (page bind) → the successor keeps its generated name, never ID: <id>', async (w) => {
    await bindNameless(w, OLD, SUCCEED.oldId)
    const { name } = await bind(w, NEW, SUCCEED.newId)
    assertGeneratedName(name)
    await succeed(w)
    assert.deepEqual(principalLabel(w.store.pairOf(E(NEW)).name, SUCCEED.newId), { name })
  })
  st('9', 'Nameless (successor) → retire fails (successor-unpaired) → nothing moves: the old principal keeps its name', async (w) => {
    const old = await bind(w, OLD, SUCCEED.oldId, SUCCEED.navigator)
    await assertNoChange(w, () => w.store.succeed(E(OLD), E(THIRD)), { ok: false, code: succeedRefusal() })
    assert.deepEqual(w.store.pairOf(E(OLD)), old)
  })
  st('9 (retry)', 'after a refused succeed, the successor pairs and a retry moves the name', async (w) => {
    await bind(w, OLD, SUCCEED.oldId, SUCCEED.navigator)
    await w.store.succeed(E(OLD), E(NEW))
    const successor = await bind(w, NEW, SUCCEED.newId)
    assert.deepEqual(await succeed(w), { ok: true, pair: successorAfter(successor, SUCCEED.navigator) })
  })
  st('9 (repeat)', 'a second succeed of the same pair of entries: the old entry is now unpaired → ok and nothing changes', async (w) => {
    await navigatorWorld(w)
    await succeed(w)
    const result = await assertNoChange(w, () => succeed(w))
    assert.equal(result?.ok, true, JSON.stringify(result))
  })
  st('race', `succeed races a third principal's set_name of the old name (${SUCCEED.raceRounds} rounds): the folded name is never on two pairs`, async (w) => {
    for (let round = 0; round < SUCCEED.raceRounds; round += 1) {
      const base = round * FOURTH
      const name = SUCCEED.navigator + round
      await bind(w, base + OLD, SUCCEED.oldId + round, name)
      await bind(w, base + NEW, SUCCEED.newId + round)
      await bind(w, base + THIRD, SUCCEED.thirdId + round)
      const [succeeded] = await Promise.all([succeed(w, base + OLD, base + NEW), setName(w, base + THIRD, name.toLowerCase())])
      assert.equal(succeeded.ok, true, `round ${round}: ${JSON.stringify(succeeded)}`)
      assertUniqueNames(w)
    }
  })
}

/** The `succeed` cases on one SDK. */
export function registerCPairSucceedCases(sdk) {
  useCase(sdk)
  decisionTable(sdk)
  stateTransitions(sdk)
}
