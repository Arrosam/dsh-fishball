/**
 * R-FIX-CUI black-box rows of the connector's settings page for three findings of the connector-UI
 * review (.runtime/reports/review-x-dsh-connector-ui.md):
 * - UI-03: a scalar field (DSH name, approval port, a limit) holding an unsaved draft while another
 *   editor changes the SAME field does not overwrite it on blur / Enter: nothing is sent, the draft
 *   stays, a role=alert says it was changed elsewhere; a second blur / Enter saves the draft (with
 *   the live revision); Escape discards the draft and shows the live value. A change of a DIFFERENT
 *   field only bumps the revision: the draft saves normally with the live revision;
 * - UI-04: the read-only runtime state (pair rows, approval listener) is re-read while the page is
 *   mounted and visible, with no config change, and not after unmount; a failed read is not
 *   "Not paired": no pair line, and an alert "The connector's status could not be read (<code>)."
 *   with Retry; a successful read removes it; a late answer of an older read never wins;
 * - UI-05: a number field cleared to '' or whitespace is invalid ("Enter a whole number.",
 *   aria-invalid) and sends nothing; explicit 0 still saves for the port; 65535 saves, 65536 and
 *   non-numeric are refused.
 * Expected outcomes are the requirements the parent relayed and the dev session's answers of
 * 2026-11-18 (constants.mjs CUI). No client.js body was read.
 *
 * Level: integration, as polish-cases.mjs: the real client.js in the scripted page (page.mjs), its
 * host form holding the row's other settings and refusing a stale revision, as DSH fences it;
 * GET state answered by a stand-in `state()` port or, per read, by the case (`answerState`).
 * Techniques: Decision Table (UI-03: same field changed × the user's next key), Equivalence
 * Partitioning and Boundary Value (UI-05: the text partitions and the port's bounds; UI-04: the
 * kinds of failed read), State Transition (UI-03 Draft → Conflict → Saved / Discarded; UI-04
 * Unknown → Failed → Known, mounted → unmounted, visible → hidden → visible).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from '../../contract/package-boundaries/cases.mjs'
import { findAll, textOf } from '../../../support/rp-recommend.mjs'
import { CLIENT, CUI, FIXTURE, POLISH, WAIT } from './constants.mjs'
import { click } from './page.mjs'
import { entryRow, openPolished, parents, stateWith } from './polish-cases.mjs'

const T = { timeout: WAIT.testMs }
const row = (sdk, id, part, title, fn) => test(caseName(sdk, id, part, title), T, fn)
const text = (node) => textOf(node).replace(/\s+/g, ' ').trim()
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const ROLE = POLISH.role
const event = (key) => ({ key, preventDefault() {}, stopPropagation() {} })

// ------------------------------------------------------------------------------------------------ a setting field

/** The setting row of `hook` (POLISH.attr.setting) in `view`: its Input, its alerts, and the user's actions. */
function settingField(page, view, hook) {
  const label = () => view.one(POLISH.attr.setting, hook)
  const control = () => findAll([label()], (n) => n.props[CLIENT.primitiveAttr] === POLISH.input)[0]
  const rowNode = () => parents(view.tree()).get(label())
  const act = async (fn) => { fn(control().props); await page.settle() }
  return {
    shown: () => String(control().props.value ?? ''),
    invalid: () => String(control().props['aria-invalid']) === 'true',
    alerts: () => findAll([rowNode()], (n) => n.props[ROLE] === 'alert').map(text),
    type: (value) => act((p) => p.onChange({ target: { value }, currentTarget: { value }, preventDefault() {} })),
    blur: () => act((p) => p.onBlur?.({ target: { value: p.value }, currentTarget: { value: p.value } })),
    key: (key) => act((p) => p.onKeyDown?.(event(key))),
  }
}
const sent = (page) => page.mutations.map((m) => m.ops)
const setOf = (path, value) => [{ op: CLIENT.setOp, path: [...path], value }]
const valueAt = (value, path) => path.reduce((node, key) => node?.[key], value)

/** A page over a world with one token, the row's settings CUI.settings. */
const openSettings = (t, sdk, options = {}) => openPolished(t, sdk, { labels: [FIXTURE.labelA], settings: CUI.settings, ...options })

// ------------------------------------------------------------------------------------------------ UI-03

/** Each scalar kind: its row, path, draft, what another editor saves on it, and an unrelated field another editor changes. */
const SCALARS = Object.freeze([
  Object.freeze({ kind: 'DSH name', hook: CUI.field.dshName, path: CUI.path.dshName, typed: CUI.draft.dshName, value: CUI.draftValue.dshName, other: CUI.other.dshName, unrelated: setOf(CUI.path.port, CUI.other.port) }),
  Object.freeze({ kind: 'approval port', hook: CUI.field.port, path: CUI.path.port, typed: CUI.draft.port, value: CUI.draftValue.port, other: CUI.other.port, unrelated: setOf(CUI.path.dshName, CUI.other.dshName) }),
  Object.freeze({ kind: 'limit', hook: CUI.field.limit, path: CUI.path.limit, typed: CUI.draft.limit, value: CUI.draftValue.limit, other: CUI.other.limit, unrelated: setOf(CUI.path.otherLimit, CUI.other.otherLimit) }),
])
/** The ways a user commits a field (both must behave alike). */
const COMMITS = Object.freeze([['blur', (f) => f.blur()], ['Enter', (f) => f.key(CUI.keys.enter)]])

/** The page with `s`'s field holding the draft and another editor's save of the same field. */
async function conflicted(t, sdk, s) {
  const { page, view } = await openSettings(t, sdk)
  const field = settingField(page, view, s.hook)
  await field.type(s.typed)
  await page.external(setOf(s.path, s.other))
  return { page, view, field }
}
/** The conflict state: nothing sent, the draft still shown, one alert saying it changed elsewhere. */
function assertConflict(page, field, s) {
  assert.deepEqual(sent(page), [], 'a mutation was sent over another editor\'s change')
  assert.equal(field.shown(), s.typed, 'the draft text was lost')
  assert.ok(field.alerts().some((a) => CUI.conflict.test(a)), 'no "changed elsewhere" alert: ' + JSON.stringify(field.alerts()))
  assert.equal(valueAt(page.value(), s.path), s.other, 'the other editor\'s value was overwritten')
}

function scalarConflicts(sdk) {
  const id = CUI.id.ui03
  for (const s of SCALARS) {
    for (const [how, commit] of COMMITS) {
      row(sdk, id, `DT (${s.kind}: same field changed, ${how})`, `draft "${s.typed}"; another editor saves ${JSON.stringify(s.other)} → ${how} sends nothing; the draft stays; a role=alert says it was changed elsewhere`, async (t) => {
        const { page, field } = await conflicted(t, sdk, s)
        await commit(field)
        assertConflict(page, field, s)
      })
      row(sdk, id, `ST (${s.kind}: conflict → ${how} again → saved)`, `after the conflict alert, a second ${how} sends one set of ${s.path.join('.')} = ${JSON.stringify(s.value)} with the live revision; it is saved; the alert goes`, async (t) => {
        const { page, field } = await conflicted(t, sdk, s)
        await commit(field)
        assertConflict(page, field, s)
        const revision = page.revision()
        await commit(field)
        await page.until(() => page.mutations.length > 0)
        assert.deepEqual(sent(page), [setOf(s.path, s.value)])
        assert.equal(page.mutations[0].expected, revision, 'the replace was not fenced by the live revision')
        await page.until(() => valueAt(page.value(), s.path) === s.value)
        assert.ok(!field.alerts().some((a) => CUI.conflict.test(a)), 'the conflict alert stayed after the save')
      })
    }
    row(sdk, id, `ST (${s.kind}: conflict → Escape → discarded)`, `after the conflict alert, Escape discards the draft: nothing sent; the field shows the live ${JSON.stringify(s.other)}; the alert goes`, async (t) => {
      const { page, field } = await conflicted(t, sdk, s)
      await field.blur()
      assertConflict(page, field, s)
      await field.key(CUI.keys.escape)
      assert.deepEqual(sent(page), [])
      assert.equal(field.shown(), String(s.other))
      assert.ok(!field.alerts().some((a) => CUI.conflict.test(a)), 'the conflict alert stayed after Escape')
    })
    row(sdk, id, `ST (${s.kind}: draft → Escape, no conflict)`, 'a draft with no change elsewhere: Escape discards it, nothing is sent, the field shows the saved value', async (t) => {
      const { page, view } = await openSettings(t, sdk)
      const field = settingField(page, view, s.hook)
      await field.type(s.typed)
      await field.key(CUI.keys.escape)
      assert.deepEqual(sent(page), [])
      assert.equal(field.shown(), String(valueAt(CUI.settings, s.path)))
    })
    row(sdk, id, `DT (${s.kind}: another field changed)`, `draft "${s.typed}"; another editor changes ${s.unrelated[0].path.join('.')} only (the revision bumps) → blur saves the draft: one set with the live revision; both changes kept; no alert`, async (t) => {
      const { page, view } = await openSettings(t, sdk)
      const field = settingField(page, view, s.hook)
      await field.type(s.typed)
      await page.external(s.unrelated)
      const revision = page.revision()
      await field.blur()
      await page.until(() => page.mutations.length > 0)
      assert.deepEqual(sent(page), [setOf(s.path, s.value)])
      assert.equal(page.mutations[0].expected, revision, 'the save was not sent with the live revision')
      await page.until(() => valueAt(page.value(), s.path) === s.value)
      assert.equal(valueAt(page.value(), s.unrelated[0].path), s.unrelated[0].value, 'the other editor\'s change was lost')
      assert.deepEqual(field.alerts(), [], 'an alert for a change of another field')
    })
  }
}

// ------------------------------------------------------------------------------------------------ UI-05

function numberInputs(sdk) {
  const id = CUI.id.ui05
  const cases = [[CUI.field.port, CUI.path.port, CUI.portInputs], [CUI.field.limit, CUI.path.limit, CUI.limitInputs]]
  for (const [hook, path, inputs] of cases) {
    for (const c of inputs) {
      const refused = c.saves === null
      row(sdk, id, `${c.part} (${hook})`, `${hook} typed ${JSON.stringify(c.text)} → ${refused ? `"${CUI.invalid}", aria-invalid; blur sends nothing and the field shows the saved value again` : `valid; blur saves ${c.saves}`}`, async (t) => {
        const { page, view } = await openSettings(t, sdk)
        const field = settingField(page, view, hook)
        await field.type(c.text)
        assert.equal(field.invalid(), refused, 'aria-invalid')
        assert.equal(field.alerts().includes(CUI.invalid), refused, 'alerts: ' + JSON.stringify(field.alerts()))
        await field.blur()
        if (refused) {
          await page.settle()
          assert.deepEqual(sent(page), [], 'an invalid field was saved')
          assert.equal(field.shown(), String(valueAt(CUI.settings, path)), 'the field did not revert to the saved value')
          assert.equal(valueAt(page.value(), path), valueAt(CUI.settings, path))
          return
        }
        await page.until(() => page.mutations.length > 0)
        assert.deepEqual(sent(page), [setOf(path, c.saves)])
        await page.until(() => valueAt(page.value(), path) === c.saves)
      })
    }
  }
  row(sdk, id, 'EP (Enter on a cleared port)', 'the port cleared to "" and Enter pressed → nothing sent; the port stays its saved value', async (t) => {
    const { page, view } = await openSettings(t, sdk)
    const field = settingField(page, view, CUI.field.port)
    await field.type('')
    await field.key(CUI.keys.enter)
    assert.deepEqual(sent(page), [])
    assert.equal(valueAt(page.value(), CUI.path.port), CUI.settings.approval.port)
  })
}

// ------------------------------------------------------------------------------------------------ UI-04

/** A state answer of the route's shape: the one token paired as `name` (connected), the listener ok. */
const pairedAs = (name) => stateWith((world) => world.doc.tokens.map((item) => entryRow(item, { paired: true, id: CUI.pairId, name, connected: true })))
const unpaired = stateWith((world) => world.doc.tokens.map((item) => entryRow(item)), { status: POLISH.portInUse, port: POLISH.approvalPort, defaultPort: POLISH.defaultPort })
/** `{ok: true, ...state}` as the route answers it, as a Response. */
const answerOf = (world, state) => Response.json({ ok: true, ...state(world) })
const failedAnswer = () => Response.json(CUI.failure.body, { status: CUI.failure.status })
/** A held answer: `{promise, release(response)}`. */
function held() {
  let release
  const promise = new Promise((resolve) => { release = resolve })
  return { promise, release }
}

/** The token row's pair line (or undefined), the status alerts and their Retry buttons. */
function statusView(page, view) {
  const tokenRow = () => view.find(CLIENT.attr.row)[0]
  const pairLine = () => findAll([tokenRow()], (n) => n.props[POLISH.attr.pair] !== undefined)[0]
  const failures = () => findAll(view.tree(), (n) => n.props[ROLE] === 'alert' && text(n).startsWith(CUI.statusFailed('').split('(')[0]))
  const retry = () => findAll(view.tree(), (n) => n.tag === 'button' && text(n) === CUI.retry)
  const approval = () => view.one(POLISH.attr.approval).props[POLISH.attr.approval]
  return { tokenRow, pairLine, failures, retry, approval }
}
/** The page is in the unknown state: no pair line, no "Not paired" anywhere in the token row. */
function assertUnknown(s) {
  assert.equal(s.pairLine(), undefined, 'a pair line while the state is unknown')
  assert.ok(!text(s.tokenRow()).includes(CUI.notPaired), 'the token row says "Not paired" while the state is unknown')
}

function runtimeState(sdk) {
  const id = CUI.id.ui04
  row(sdk, id, 'ST (refresh with no config change)', `the first read: unpaired, port in use; the connector then pairs and its listener recovers (no config change) → within ${CUI.refreshMs} ms the row shows the paired name and the approval status is ok`, async (t) => {
    let state = unpaired
    const { page, view } = await openSettings(t, sdk, { state: (w) => state(w) })
    const s = statusView(page, view)
    await page.until(() => s.pairLine()?.props[POLISH.attr.pair] === 'unpaired')
    assert.equal(s.approval(), POLISH.portInUse)
    const revision = page.revision()
    state = pairedAs(CUI.pairName.fresh)
    await sleep(CUI.refreshMs)
    await page.settle()
    assert.equal(s.pairLine()?.props[POLISH.attr.pair], POLISH.paired, 'the pair state did not refresh by itself')
    assert.ok(text(s.pairLine()).includes(CUI.pairName.fresh))
    assert.equal(s.approval(), 'ok', 'the approval status did not refresh by itself')
    assert.equal(page.revision(), revision, 'harness: the config changed')
  })
  row(sdk, id, 'ST (mounted → unmounted)', `the state is re-read while mounted (at least one more GET within ${CUI.refreshMs} ms); after the page unmounts no GET state follows for ${CUI.silentMs} ms`, async (t) => {
    const { page, view } = await openSettings(t, sdk, { state: pairedAs(CUI.pairName.old) })
    const first = page.stateReads()
    await sleep(CUI.refreshMs)
    assert.ok(page.stateReads() > first, 'the state was not re-read while mounted')
    view.close()
    await page.settle()
    const atClose = page.stateReads()
    await sleep(CUI.silentMs)
    assert.equal(page.stateReads(), atClose, 'GET state went on after unmount')
  })
  row(sdk, id, 'ST (visible → hidden → visible)', `while document.hidden no GET state follows for ${CUI.silentMs} ms; visible again → a read within ${CUI.refreshMs} ms`, async (t) => {
    const { page } = await openSettings(t, sdk, { state: pairedAs(CUI.pairName.old) })
    await page.setHidden(true)
    const atHide = page.stateReads()
    await sleep(CUI.silentMs)
    assert.equal(page.stateReads(), atHide, 'GET state went on while the page was hidden')
    await page.setHidden(false)
    await sleep(CUI.refreshMs)
    assert.ok(page.stateReads() > atHide, 'the state was not re-read once visible again')
  })
  row(sdk, id, 'EP (first read pending)', 'while the first read is unanswered the token row has no pair line and does not say "Not paired"', async (t) => {
    const hold = held()
    const { page, view } = await openSettings(t, sdk, { state: pairedAs(CUI.pairName.old), answerState: () => hold.promise })
    const s = statusView(page, view)
    await page.settle()
    assertUnknown(s)
    hold.release(failedAnswer())
  })
  const failures = [
    ['500 {ok: false, operation-failed}', () => failedAnswer(), CUI.failure.body.code],
    ['fetch rejects', () => Promise.reject(new TypeError(CUI.notJson)), CUI.requestFailed],
    ['body not JSON', () => new Response(CUI.notJson, { status: 200 }), CUI.requestFailed],
  ]
  for (const [part, answer, code] of failures) {
    row(sdk, id, `EP (failed read: ${part})`, `every read fails → no pair line, no "Not paired"; one alert "${CUI.statusFailed(code)}" with a Retry button`, async (t) => {
      const { page, view } = await openSettings(t, sdk, { state: pairedAs(CUI.pairName.old), answerState: answer })
      const s = statusView(page, view)
      await page.until(() => s.failures().length > 0)
      assertUnknown(s)
      assert.deepEqual(s.failures().map(text).map((x) => x.replace(CUI.retry, '').trim()), [CUI.statusFailed(code)])
      assert.equal(s.retry().length, 1, 'Retry buttons')
    })
  }
  row(sdk, id, 'ST (failed → Retry → known)', 'reads fail; the backend recovers; Retry re-reads at once (before the next poll) → the alert goes and the paired row shows', async (t) => {
    let failing = true
    const { page, view } = await openSettings(t, sdk, { state: pairedAs(CUI.pairName.fresh), answerState: () => (failing ? failedAnswer() : undefined) })
    const s = statusView(page, view)
    await page.until(() => s.retry().length === 1)
    failing = false
    const before = page.stateReads()
    click(s.retry()[0])
    await page.settle()
    assert.ok(page.stateReads() > before, 'Retry did not re-read the state')
    await page.until(() => s.failures().length === 0 && s.pairLine()?.props[POLISH.attr.pair] === POLISH.paired)
    assert.ok(text(s.pairLine()).includes(CUI.pairName.fresh))
  })
  // A late answer of an older read: read #2 (a poll) is held; a newer read #3 answers first; #2's
  // answer then lands. The dev session (2026-11-18): Retry and a config-revision re-read each start a
  // new read even while one is pending.
  const triggers = [
    ['Retry', (n) => (n === 1 ? failedAnswer() : undefined), (page, s) => click(s.retry()[0]), (s) => s.retry().length === 1],
    ['revision re-read', () => undefined, (page) => page.external(setOf(CUI.path.otherLimit, CUI.other.otherLimit)), (s) => s.pairLine() !== undefined],
  ]
  for (const [part, first, trigger, ready] of triggers) {
    row(sdk, id, `ST (stale answer, ${part})`, `a read is held; a newer read (${part}) answers "${CUI.pairName.fresh}"; the held one then answers "${CUI.pairName.old}" → the page keeps "${CUI.pairName.fresh}"`, async (t) => {
      const hold = held()
      let world
      let fresh = false
      // Read #1 (at open, before `world` is known) is the route's own unless `first` answers it.
      const answerState = (n) => first(n) ?? (n === 1 ? undefined : n === 2 ? hold.promise : answerOf(world, pairedAs(fresh ? CUI.pairName.fresh : CUI.pairName.old)))
      const opened = await openSettings(t, sdk, { state: pairedAs(CUI.pairName.old), answerState })
      world = opened.world
      const { page, view } = opened
      const s = statusView(page, view)
      await page.until(() => ready(s) && page.stateReads() >= 2)
      fresh = true
      await trigger(page, s)
      await page.until(() => s.pairLine() !== undefined && text(s.pairLine()).includes(CUI.pairName.fresh))
      hold.release(answerOf(world, pairedAs(CUI.pairName.old)))
      await page.settle()
      assert.ok(text(s.pairLine()).includes(CUI.pairName.fresh), 'an older read\'s late answer overwrote the newer one: ' + text(s.pairLine()))
    })
  }
}

/** Every R-FIX-CUI row of the settings-page suite for `sdk`. */
export function registerCuiSettingsCases(sdk) {
  scalarConflicts(sdk)
  numberInputs(sdk)
  runtimeState(sdk)
}
