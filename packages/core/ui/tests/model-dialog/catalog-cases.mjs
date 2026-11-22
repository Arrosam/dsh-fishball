/**
 * R-FIX-FUI F4 black-box rows: the model dialog reads DSH's catalog on every opening.
 * Component level: fishball-ui's real client alone in the scripted page (../support/b-model.mjs `modelPage`), with a
 * scripted `remote.session.modelCatalog()` whose answers the case settles by hand.
 *
 * Techniques:
 * - State transition CAT-ST-01…: closed → open (read) → closed → open (read again, catalog B);
 *   open → closed while the read is pending → the late answer changes nothing; pending → loading;
 *   failed → Try again → read again → ready;
 * - EP CAT-EP-01: a failed read is a refused answer `{ok:false}` or a rejection;
 * - BVA CAT-BVA-01: reads counted at 1 per opening (two openings → exactly two reads).
 */
import assert from 'node:assert/strict'
import { caseTest } from 'fishball-test-helpers/cases'
import { textOf } from 'fishball-test-helpers/react-shim'
import { settle } from 'fishball-test-helpers/scripted-page'
import { CATALOG, MODEL, modelPage } from '../support/b-model.mjs'

const RETRY = Object.freeze({ ...MODEL.retry, stateHook: MODEL.dialogHook })
/** One test group of the named models (fixture ids). */
const GROUP = Object.freeze({ id: 'fbtest-p', name: 'Fbtest Provider', modelPrefix: 'fbtest-m' })
const catalogOf = (names) => ({ ...CATALOG.wire, groups: [{ id: GROUP.id, name: GROUP.name, models: names.map((name, i) => ({ id: GROUP.modelPrefix + i, name })) }] })
const A = Object.freeze(['Fbtest Catalog A One', 'Fbtest Catalog A Two'])
const B = Object.freeze(['Fbtest Catalog B Only'])

/** A `modelCatalog()` whose every call waits until the case answers it (`answer(i, value)` / `fail(i)`). */
function scriptedCatalog() {
  const calls = []
  const fn = () => new Promise((resolve, reject) => { calls.push({ resolve, reject }) })
  return {
    fn, calls,
    async answer(i, names) { calls[i].resolve({ ok: true, value: catalogOf(names) }); await settle() },
    async refuse(i) { calls[i].resolve(CATALOG.refusal); await settle() },
    async reject(i) { calls[i].reject(new Error(CATALOG.rejection)); await settle() },
  }
}
const choiceNames = (p) => p.choiceButtons().map((n) => textOf(n))
const dialogState = (p) => p.dialogState()
const alertsOf = (p) => p.alerts()
/** Dismiss, close the page and open it again: one new opening. */
async function reopen(p) {
  await p.press(p.control(MODEL.dismiss))
  await p.closePage()
  await p.openPage()
}

export function registerCatalogCases() {
  const t = (id, row, title, fn) => caseTest(id, row, title, fn)
  t('CAT-ST-01', 'A then B', 'open (catalog A) → closed → opened again with DSH now answering catalog B: B\'s models, none of A\'s', async (c) => {
    const s = scriptedCatalog()
    const p = await modelPage(c, { modelCatalog: s.fn })
    assert.equal(s.calls.length, 1, 'first opening: reads')
    await s.answer(0, A)
    assert.ok(A.every((n) => choiceNames(p).some((x) => x.includes(n))), 'precondition: A shown')
    await reopen(p)
    assert.equal(s.calls.length, 2, 'the reopening did not read the catalog again')
    await s.answer(1, B)
    const names = choiceNames(p)
    assert.ok(B.every((n) => names.some((x) => x.includes(n))), 'B not shown: ' + JSON.stringify(names))
    assert.equal(names.some((x) => A.some((n) => x.includes(n))), false, 'A still shown')
  })
  t('CAT-BVA-01', 'one read per opening', 'two openings → exactly two reads; re-renders and window focus while open read nothing more', async (c) => {
    const s = scriptedCatalog()
    const p = await modelPage(c, { modelCatalog: s.fn })
    await s.answer(0, A)
    p.world.dispatchWindow(MODEL.focus)
    p.world.shim.rerender()
    await settle()
    assert.equal(s.calls.length, 1)
    await reopen(p)
    await s.answer(1, A)
    assert.equal(s.calls.length, 2)
  })
  t('CAT-ST-02', 'reopen paints loading', 'catalog A shown → reopened, the new read pending: the first paint is loading, no model of A', async (c) => {
    const s = scriptedCatalog()
    const p = await modelPage(c, { modelCatalog: s.fn })
    await s.answer(0, A)
    await reopen(p)
    assert.equal(dialogState(p), RETRY.loading)
    assert.deepEqual(choiceNames(p), [], 'the previous catalog is painted')
  })
  t('CAT-ST-03', 'pending → loading', 'while the first read is pending the dialog shows loading and no choice', async (c) => {
    const s = scriptedCatalog()
    const p = await modelPage(c, { modelCatalog: s.fn })
    assert.ok(p.dialogs().length, 'no dialog')
    assert.equal(dialogState(p), RETRY.loading)
    assert.deepEqual(choiceNames(p), [])
  })
  t('CAT-ST-04', 'late answer after close', 'read pending → the dialog closes (page closed) → the read answers: nothing changes (no dialog, no state update of an unmounted component)', async (c) => {
    const s = scriptedCatalog()
    const p = await modelPage(c, { modelCatalog: s.fn })
    await p.closePage()
    assert.equal(p.dialogs().length, 0, 'precondition: closed')
    const stale = p.world.staleUpdates
    await s.answer(0, A)
    assert.equal(p.dialogs().length, 0)
    assert.equal(p.world.staleUpdates, stale, 'a state update after close')
    await p.openPage()
    assert.equal(s.calls.length, 2, 'the next opening did not read again')
    assert.equal(dialogState(p), RETRY.loading, 'the late answer was kept for the next opening')
  })
  t('CAT-ST-04', 'late answer after reopen', 'read 1 pending → closed → reopened (read 2) → read 1 answers A, read 2 answers B: only B is shown', async (c) => {
    const s = scriptedCatalog()
    const p = await modelPage(c, { modelCatalog: s.fn })
    await p.closePage()
    await p.openPage()
    assert.equal(s.calls.length, 2)
    await s.answer(0, A)
    assert.equal(choiceNames(p).some((x) => A.some((n) => x.includes(n))), false, 'a late read of an earlier opening was shown')
    await s.answer(1, B)
    assert.ok(B.every((n) => choiceNames(p).some((x) => x.includes(n))))
  })
  for (const lang of MODEL.langs) {
    for (const [how, fail] of [['refused', (s) => s.refuse(0)], ['rejects', (s) => s.reject(0)]]) {
      t('CAT-EP-01', `${how} ${lang}`, `(${lang}) the read ${how} → the failed alert and a [${RETRY.hook}] button ${JSON.stringify(RETRY.label[lang])}; pressing it reads again; its success shows the models and no alert`, async (c) => {
        const s = scriptedCatalog()
        const p = await modelPage(c, { lang, modelCatalog: s.fn })
        await fail(s)
        const alerts = alertsOf(p)
        assert.equal(alerts.length, 1, 'alerts ' + JSON.stringify(alerts.map(textOf)))
        const retry = p.nodes().filter((n) => n.props[RETRY.hook] !== undefined && n.props[RETRY.hook] !== false)
        assert.equal(retry.length, 1, 'no retry button')
        assert.equal(textOf(retry[0]).trim(), RETRY.label[lang])
        await p.press(retry.find((n) => n.tag === MODEL.button) ?? retry[0])
        assert.equal(s.calls.length, 2, 'Try again did not read again')
        assert.equal(dialogState(p), RETRY.loading, 'no loading while the retry is pending')
        await s.answer(1, A)
        assert.ok(A.every((n) => choiceNames(p).some((x) => x.includes(n))), 'models not shown after the retry')
        assert.deepEqual(alertsOf(p), [])
      })
    }
  }
  t('CAT-EP-01', 'retry fails again', 'failed → Try again → fails again → the alert and Try again stay', async (c) => {
    const s = scriptedCatalog()
    const p = await modelPage(c, { modelCatalog: s.fn })
    await s.refuse(0)
    await p.press(p.nodes().find((n) => n.props[RETRY.hook] !== undefined && n.tag === MODEL.button))
    await s.refuse(1)
    assert.equal(p.nodes().filter((n) => n.props[RETRY.hook] !== undefined && n.tag === MODEL.button).length, 1)
    assert.equal(alertsOf(p).length, 1)
  })
}
