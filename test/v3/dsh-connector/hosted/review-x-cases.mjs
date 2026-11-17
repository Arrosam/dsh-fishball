/**
 * R-FIX-CONNECTOR black-box rows for review finding F03 (.runtime/reports/review-x-dsh-connector.md;
 * R-HOST-09 all or nothing). The old hosted record is marked `succeededBy` before `PairStore.succeed`,
 * the commit point for the name and the pair. Expected outcomes are the relayed requirement:
 * - prepared crash (the mark is stored, the old pair still holds its name): a new hosted service
 *   over that state calling `resume()` does not remove the old token (`writer.removeToken(old)` is
 *   never called) and does not delete the old pair; it clears the mark, so a following
 *   `retire(old, new)` is accepted (not `not-hosted`) and completes: the name on the successor, the
 *   old token removed, the old hosted record gone;
 * - committed crash (the old pair is gone, the mark is still stored): `resume()` still finishes it:
 *   the old token removed and the old hosted record deleted;
 * - a crash after the managed sessions moved but before the mark (no mark; the sessions are already
 *   the successor's): the next `retire` completes: every session the successor's, the name moved.
 *
 * Level: the suite's C-SUCCEED world (subject.mjs): the real hosted, pairs, mailbox, tokens and
 * routing modules over real DSH storage. A crash is a connector restart (`reopen()`) over the
 * persisted state of the boundary; the boundary's state is written through DSH's own storage
 * handles (`patchHostedRecord`), as the suite's damaged-store rows do, or reached by a real
 * succession whose post-commit cleanup fails. Techniques: State Transition (Prepared / Committed /
 * Moved-unmarked → restart → resume → retire).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from '../../contract/package-boundaries/cases.mjs'
import { CALL, DOMAIN, FIXTURE, K3, PORT, REVIEW_X as RX, SUBJECT, WAIT } from './constants.mjs'
import { afterCommit, callStep } from './fakes.mjs'
import { succeedWorld } from './subject.mjs'

const T = Object.freeze({ timeout: WAIT.testMs })
const { ids: ID, names: NAME, sessions: S } = FIXTURE
const OK = Object.freeze({ ok: true })
const row = (sdk, part, title, fn) => test(caseName(sdk, RX.id, part, title), T, async (t) => fn(await succeedWorld(t, sdk), t))

/** Eo (hosted, fb-old, "Navigator") managing S1 and S2, and En (hosted, fb-new, nameless: name-taken). */
async function pairOfEntries(w) {
  const eo = await w.hostedEntry()
  const old = (await w.pair(eo, ID.old, NAME.navigator)).key
  for (const s of [S.s1, S.s2]) { w.session(s); await w.manage(s, old) }
  const en = await w.hostedEntry()
  const succ = (await w.pair(en, ID.new, NAME.navigator)).key
  assert.equal(w.pairs.pairOf(en).name, null, 'harness: the successor took the name before the succession')
  return { eo, en, old, succ }
}
const removals = (w, entryKey) => w.writer.of(CALL.removeToken).filter((c) => c.entryKey === entryKey).length

/** The succession done in full: the name on En, Eo's token, pair and hosted record gone, every session En's. */
function assertDone(w, u) {
  assert.equal(w.pairs.pairOf(u.en)?.name, NAME.navigator, 'the name is not on the successor')
  assert.equal(w.pairs.pairOf(u.eo), undefined, 'the old pair is still there')
  assert.ok(!w.doc.tokens.some((i) => i.key === u.eo), 'the old token is still in the settings')
  assert.equal(w.registry.get(u.eo), undefined, 'the old entry is still in the registry')
  assert.ok(!w.hasHostedRecord(u.eo), 'the old hosted record is still stored')
  for (const s of [S.s1, S.s2]) assert.equal(w.managed.managerOf(s), u.succ, `${s} is not the successor's`)
}

export function registerReviewXHostedCases(sdk) {
  row(sdk, 'ST (prepared crash → resume)', 'mark stored, old pair still named: after a restart resume() removes no token, keeps the old pair and its name, and clears the mark', async (w) => {
    const u = await pairOfEntries(w)
    await w.patchHostedRecord(u.eo, { [SUBJECT.succeededBy]: u.en })
    await w.reopen()
    await w.resume()
    assert.equal(removals(w, u.eo), 0, 'resume() removed the old token of a succession that never committed')
    assert.ok(w.doc.tokens.some((i) => i.key === u.eo), 'the old token left the settings')
    assert.equal(w.pairs.pairOf(u.eo)?.name, NAME.navigator, 'the old pair or its name is gone')
    assert.equal(w.hostedRecordOf(u.eo)?.[SUBJECT.succeededBy], undefined, 'resume() left the prepared mark')
    assert.equal(w.service.entryState(u.eo), K3.states.enabled)
  })
  row(sdk, 'ST (prepared crash → resume → retire)', 'after that resume(), retire(Eo, En) is accepted ({ok: true}, not not-hosted) and completes: name moved, old token removed, old hosted record gone', async (w) => {
    const u = await pairOfEntries(w)
    await w.patchHostedRecord(u.eo, { [SUBJECT.succeededBy]: u.en })
    await w.reopen()
    await w.resume()
    assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
    assertDone(w, u)
  })
  row(sdk, 'ST (committed crash → resume)', 'PairStore.succeed committed, then every removeToken failed until the restart (mark kept): resume() removes the old token and deletes the old hosted record', async (w) => {
    const u = await pairOfEntries(w)
    const failing = w.seam.failEvery(afterCommit(DOMAIN.pairs, callStep(PORT.writer, CALL.removeToken)))
    try {
      assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
      assert.equal(w.pairs.pairOf(u.eo), undefined, 'harness: the commit did not remove the old pair')
      assert.equal(w.hostedRecordOf(u.eo)?.[SUBJECT.succeededBy], u.en, 'harness: no mark kept after the commit')
      await w.reopen()
    } finally { failing.stop() }
    await w.resume()
    assert.ok(!w.doc.tokens.some((i) => i.key === u.eo), 'resume() did not remove the old token')
    assert.ok(!w.hasHostedRecord(u.eo), 'resume() did not delete the old hosted record')
  })
  row(sdk, 'ST (sessions moved, no mark → retire)', 'a crash after the managed sessions moved but before the mark: the next retire(Eo, En) completes: every session the successor\'s, the name moved, Eo gone', async (w) => {
    const u = await pairOfEntries(w)
    // The persisted state at that boundary: S1 and S2 managed by En's principal, nothing else moved.
    for (const s of [S.s1, S.s2]) {
      assert.deepEqual(await w.managed.release(s, u.old), { ok: true }, 'harness: release refused')
      await w.manage(s, u.succ)
    }
    await w.reopen()
    await w.resume()
    assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
    assertDone(w, u)
  })
}
