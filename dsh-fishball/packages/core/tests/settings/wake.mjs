/**
 * WAKE-BATCH settings rows (the user-approved design relayed 2026-11-21, item 4): core's own settings
 * page shows the quiet window (whole seconds ≥ 0), the max batch (whole number ≥ 1) and the class
 * (wake / silent) of each listed event type, with the defaults when nothing is stored; a valid value is
 * written to core's namespace at the nested path; an out-of-bounds value is refused on the page.
 *
 * Page contract relayed by the lead (2026-11-21): `<input type=number data-fishball-wake-setting=
 * "quietWindowSeconds" | "maxBatch">` commits on change when valid, otherwise shows an inline
 * `role=alert` error and writes nothing; `<select data-fishball-wake-class="<type>">` with options
 * `wake` / `silent` writes at once on change; neither uses the shared Save. The oracle is the stored
 * nested value (`wake.quietWindowSeconds`, `wake.maxBatch`, `wake.classes[type]`), not the op shape.
 *
 * Also the Node half: core's `Config` (src/main/config.js, the row's schema) declares the fields
 * volatile (live, item 4) and falls back to the defaults for an unusable stored value. It is imported
 * with fishball-test-helpers/bind, so its schemastery is the current DSH's.
 *
 * Techniques: EP (each listed type's control; stored vs absent), BVA (window −1 / 0 / 1 / 1.5; max
 * batch 0 / 1 / 2 / 1.5), Decision Table (valid × invalid input → written / alert).
 */
import assert from 'node:assert/strict'
import { importBound } from 'fishball-test-helpers/bind'
import { caseTest } from 'fishball-test-helpers/cases'
import { CORE, SUBJECT, WAKE_REQUIRED as R } from './constants.mjs'
import { corePage, settle } from './page.mjs'

const MARK = Object.freeze({ setting: 'data-fishball-wake-setting', klass: 'data-fishball-wake-class', alert: 'alert' })
const FIELD = Object.freeze({ window: 'quietWindowSeconds', maxBatch: 'maxBatch' })
const TYPES = Object.freeze([...R.wake, R.drift, ...R.silent])
const CLASS = R.class
const show = (v) => JSON.stringify(v)

/** Core's client alone: the wake controls are core's page. */
const pageOf = (t, core = {}) => corePage(t, { core })
const inputOf = (page, field) => {
  const nodes = page.byAttr(MARK.setting, field)
  assert.equal(nodes.length, 1, `expected one [${MARK.setting}="${field}"]`)
  assert.equal(nodes[0].tag, 'input', field + ' is not an input')
  assert.equal(nodes[0].props.type, 'number', field + ' is not a number input')
  return nodes[0]
}
const selectOf = (page, type) => {
  const nodes = page.byAttr(MARK.klass, type)
  assert.equal(nodes.length, 1, `expected one [${MARK.klass}="${type}"]`)
  assert.equal(nodes[0].tag, 'select', type + ' is not a select')
  return nodes[0]
}
const change = async (node, value) => { node.props.onChange?.({ target: { value }, currentTarget: { value } }); await settle() }
const stored = (page) => page.coreValue()?.wake
const alerts = (page) => page.alerts()

export function registerWakeSettingCases() {
  const t = (id, row, title, fn) => caseTest(id, row, title, fn)

  // ============================================================== EP: the controls and their defaults
  t('WAKE-SET-EP-01', 'defaults', 'with nothing stored the page shows window 10, max batch 20 and each listed type\'s default class', async (c) => {
    const page = await pageOf(c)
    assert.equal(String(inputOf(page, FIELD.window).props.value), String(R.quietWindowSeconds))
    assert.equal(String(inputOf(page, FIELD.maxBatch).props.value), String(R.maxBatch))
    for (const type of TYPES) {
      const select = selectOf(page, type)
      const options = page.find((n) => n.tag === 'option', [select]).map((o) => String(o.props.value)).sort()
      assert.deepEqual(options, [CLASS.silent, CLASS.wake].sort(), type + ' options')
      assert.equal(select.props.value, R.silent.includes(type) ? CLASS.silent : CLASS.wake, type)
    }
  })
  t('WAKE-SET-EP-01', 'stored', 'stored values are shown: window 3, max batch 5, message silent, state wake', async (c) => {
    const page = await pageOf(c, { wake: { quietWindowSeconds: 3, maxBatch: 5, classes: { message: 'silent', state: 'wake' } } })
    assert.equal(String(inputOf(page, FIELD.window).props.value), '3')
    assert.equal(String(inputOf(page, FIELD.maxBatch).props.value), '5')
    assert.equal(selectOf(page, 'message').props.value, CLASS.silent)
    assert.equal(selectOf(page, 'state').props.value, CLASS.wake)
  })

  // ============================================================== BVA / DT: the two numbers
  for (const [field, value, ok] of [
    [FIELD.window, '-1', false], [FIELD.window, '0', true], [FIELD.window, '1', true], [FIELD.window, '1.5', false], [FIELD.window, 'x', false],
    [FIELD.maxBatch, '0', false], [FIELD.maxBatch, '1', true], [FIELD.maxBatch, '2', true], [FIELD.maxBatch, '1.5', false], [FIELD.maxBatch, '-3', false],
  ]) {
    t('WAKE-SET-BVA-01', `${field} ${value}`, `${field} typed ${show(value)} → ${ok ? 'one write; wake.' + field + ' stored as the number ' + value : 'an inline alert, nothing written'}`, async (c) => {
      const page = await pageOf(c)
      await change(inputOf(page, field), value)
      if (ok) {
        assert.equal(page.world.mutations.length, 1, 'writes ' + show(page.world.mutations))
        assert.equal(page.world.mutations[0].ns, CORE.namespace)
        assert.strictEqual(stored(page)?.[field], Number(value), 'stored ' + show(page.coreValue()))
        assert.equal(page.coreValue()[`wake.${field}`], undefined, 'written as a dotted top-level key, not the nested path')
        assert.deepEqual(alerts(page), [], 'an alert for a valid value')
      } else {
        assert.deepEqual(page.world.mutations, [], 'an out-of-bounds value was written')
        assert.ok(alerts(page).length > 0, 'no inline alert for ' + show(value))
      }
    })
  }

  // ============================================================== EP: each class control writes at once
  for (const type of TYPES) {
    const to = R.silent.includes(type) ? CLASS.wake : CLASS.silent
    t('WAKE-SET-EP-02', type, `choosing ${to} for ${type} writes at once (no Save): wake.classes[${type}] = ${to}, every other type keeps its class`, async (c) => {
      const page = await pageOf(c)
      await change(selectOf(page, type), to)
      assert.equal(page.world.mutations.length, 1, 'writes ' + show(page.world.mutations))
      const classes = stored(page)?.classes ?? {}
      assert.equal(classes[type], to, 'stored ' + show(page.coreValue()))
      for (const other of TYPES.filter((x) => x !== type && classes[x] !== undefined)) {
        assert.equal(classes[other], R.silent.includes(other) ? CLASS.silent : CLASS.wake, other + ' changed')
      }
    })
  }

  // ============================================================== Node: core's Config (live and normalized)
  const config = () => importBound(SUBJECT.config)
  // A field may be one live reference holding a map (`wake.classes`): read the reference with
  // valueAt, then index the map, as a reader of a volatile object does.
  const read = (mod, raw, at) => {
    const [field, ...inside] = at.length > 2 ? [at.slice(0, 2), ...at.slice(2)] : [at]
    return inside.reduce((node, key) => node?.[key], mod.valueAt(mod.Config(raw), field))
  }
  t('WAKE-SET-CFG-01', 'volatile', 'the three wake fields are volatile in core\'s Config (a change applies without a restart)', async () => {
    const { Config } = await config()
    const wake = Config.dict?.wake
    assert.ok(wake, 'Config has no wake field')
    for (const field of [FIELD.window, FIELD.maxBatch, 'classes']) {
      const node = wake.dict?.[field]
      assert.ok(node, 'Config.wake has no ' + field)
      // Volatile itself, under a volatile parent, or (a map) with every member volatile.
      const members = Object.values(node.dict ?? {})
      const volatile = node.meta?.volatile === true || wake.meta?.volatile === true || (members.length > 0 && members.every((m) => m.meta?.volatile === true))
      assert.ok(volatile, 'wake.' + field + ' is not volatile')
    }
  })
  for (const [row, raw, at, expected] of [
    ['absent window', {}, ['wake', FIELD.window], R.quietWindowSeconds],
    ['absent max batch', {}, ['wake', FIELD.maxBatch], R.maxBatch],
    ['window 0', { wake: { quietWindowSeconds: 0 } }, ['wake', FIELD.window], 0],
    ['window −1', { wake: { quietWindowSeconds: -1 } }, ['wake', FIELD.window], R.quietWindowSeconds],
    ['window 1.5', { wake: { quietWindowSeconds: 1.5 } }, ['wake', FIELD.window], R.quietWindowSeconds],
    ['max batch 1', { wake: { maxBatch: 1 } }, ['wake', FIELD.maxBatch], 1],
    ['max batch 0', { wake: { maxBatch: 0 } }, ['wake', FIELD.maxBatch], R.maxBatch],
    ['class silent', { wake: { classes: { message: 'silent' } } }, ['wake', 'classes', 'message'], 'silent'],
    ['class unknown word', { wake: { classes: { message: 'loud' } } }, ['wake', 'classes', 'message'], 'wake'],
    ['class absent', {}, ['wake', 'classes', 'state'], 'silent'],
  ]) {
    t('WAKE-SET-CFG-02', row, `Config(${show(raw)}) reads ${at.join('.')} = ${show(expected)} (bad stored values fall back to the default)`, async () => {
      let got
      try { got = read(await config(), raw, at) } catch (error) { assert.fail('Config refused ' + show(raw) + ': ' + error.message) }
      assert.strictEqual(got, expected)
    })
  }
}
