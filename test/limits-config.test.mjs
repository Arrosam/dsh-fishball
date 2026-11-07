/**
 * Revision 11 rev11-limits (DESIGN §14 "Revision 11 delivery plan" row rev11-limits; §16 "Hard-coded
 * limits moved to config"): the sixteen new fields of the fishball row's config, as DSH's settings
 * service (the form DSH's Plugins page draws) describes and edits them. One host; cases run in order.
 * Expected values come from §16's tables only. C2 (conn-OQ-20, 474b876) keeps six of the sixteen in the
 * fishball-connector row; the other ten went with the in-process agent (slim §12). L9-L11 (Fishball's
 * own set_plugin_settings, its tools' parameters, its session never remounted) are retired with it.
 *
 * | id     | technique                     | expected |
 * |--------|-------------------------------|----------|
 * | L1     | EP (form)                     | the settings schema has a field for each of the 6 kept names and the 7 original ones; rebuilt with Schemastery it resolves {} to every documented default |
 * | L1b    | EP (removed fields)           | none of the 10 removed rev11-limits names is a form field |
 * | L2     | EP (value, nothing saved)     | the settings value shows each kept field at its default; the 7 original at theirs |
 * | L3     | EP (existing install: saved config without the new fields) | after saving one old field, the saved row config has none of the 6 names, and the value still shows each default |
 * | L4 ×6  | BVA (min: 1)                  | accepted; value shows min; saved in the profile patch |
 * | L5 ×24 | BVA (min-1: 0) / EP (negative -1, fraction min+0.5, string "5") | refused; patch file and value unchanged |
 * | L6     | BVA (large: 10 × default, all 6 at once) | accepted; value shows them |
 * | L7     | ST (changed -> defaults)      | one update with all 6 defaults is accepted; value shows them |
 * | L8     | EP (schema min)               | the rebuilt schema refuses min-1 and min+0.5 for each kept field and accepts min |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { LIMITS, LIMITS_R11, LIMITS_R11_REMOVED, ROW_ID } from './support/constants.mjs'
import { HOOK, Schema, T, readPatch, savedRowConfig } from './support/expect.mjs'
import { bootLive, newHome, until } from './support/host.mjs'

const NEW = Object.keys(LIMITS_R11)
const DEFAULTS = Object.fromEntries(Object.entries(LIMITS_R11).map(([k, v]) => [k, v.default]))
const OLD_DEFAULTS = Object.fromEntries(Object.entries(LIMITS).map(([k, v]) => [k, v.default]))
/** L5 inputs per field, from its minimum (1 for every kept field). */
const invalidFor = (min) => [
  ['L5 min-1', min - 1],
  ['L5 negative', -1],
  ['L5 non-integer', min + 0.5],
  ['L5 string', '5'],
]

/**
 * The field names of a Schemastery form as toJSON() gives it: {uid, refs}, where refs[uid] is the root
 * and nested schemas are referenced by uid. Objects contribute their dict keys; intersections and
 * unions contribute their members' keys.
 */
function formKeys(json) {
  const refs = json?.refs ?? {}
  const node = (x) => (typeof x === 'number' || typeof x === 'string' ? refs[x] : x)
  const keys = new Set()
  const walk = (x, depth = 0) => {
    const s = node(x)
    if (!s || depth > 8) return
    for (const k of Object.keys(s.dict ?? {})) keys.add(k)
    for (const m of s.list ?? []) walk(m, depth + 1)
    if (s.inner !== undefined && s.type !== 'array' && s.type !== 'dict') walk(s.inner, depth + 1)
  }
  walk(json?.uid !== undefined ? json.uid : json)
  return [...keys]
}

describe('rev11-limits: the kept fields in the fishball-connector row config', () => {
  let host
  let home

  before(async () => {
    home = newHome('limits-config')
    host = (await bootLive(home)).host
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  const value = async () => (await host.call('settingsDescribe'))?.value ?? {}
  async function expectAccepted(patch) {
    const r = await host.call('settingsUpdate', { patch })
    assert.equal(r.ok, true, 'update refused: ' + JSON.stringify(r.error))
    const v = await value()
    for (const [k, x] of Object.entries(patch)) assert.equal(v[k], x, 'settings value ' + k)
    const saved = savedRowConfig(home) ?? {}
    for (const [k, x] of Object.entries(patch)) assert.equal(saved[k], x, 'saved row config ' + k)
  }

  it('L1 the settings form has the 6 kept fields and the 7 original ones, with the documented defaults', T, async () => {
    // The row's form is described once its entry is active; poll briefly rather than read it once.
    let json
    await until(async () => { json = await host.call('settingsSchema', { ns: ROW_ID }); return formKeys(json).length > 0 }, 5000, 100)
    assert.ok(json, 'the fishball-connector row has a settings form')
    const keys = formKeys(json)
    for (const k of NEW) assert.ok(keys.includes(k), 'form field ' + k + ' (form has ' + keys.join(', ') + ')')
    for (const k of Object.keys(LIMITS)) assert.ok(keys.includes(k), 'existing form field ' + k)
    const resolved = new Schema(json)({})
    for (const [k, d] of Object.entries(DEFAULTS)) assert.equal(resolved[k], d, 'schema default of ' + k)
  })

  it('L1b none of the removed rev11-limits fields is in the form', T, async () => {
    const keys = formKeys(await host.call('settingsSchema', { ns: ROW_ID }))
    for (const k of Object.keys(LIMITS_R11_REMOVED)) assert.equal(keys.includes(k), false, 'removed field ' + k + ' is still a form field')
  })

  it('L2 the settings value shows each new field at its default (nothing saved yet)', T, async () => {
    const v = await value()
    for (const [k, d] of Object.entries(DEFAULTS)) assert.equal(v[k], d, 'value ' + k)
    for (const [k, d] of Object.entries(OLD_DEFAULTS)) assert.equal(v[k], d, 'existing value ' + k)
  })

  it('L3 an install whose saved config lacks the new fields reads today\'s values', T, async () => {
    await expectAccepted({ maxQueuedInputs: OLD_DEFAULTS.maxQueuedInputs + 1 })
    const saved = savedRowConfig(home) ?? {}
    for (const k of NEW) assert.equal(Object.hasOwn(saved, k), false, 'precondition: the saved config has no ' + k)
    const v = await value()
    for (const [k, d] of Object.entries(DEFAULTS)) assert.equal(v[k], d, 'value ' + k)
    await expectAccepted({ maxQueuedInputs: OLD_DEFAULTS.maxQueuedInputs })
  })

  for (const field of NEW) {
    it('L4 ' + field + ' accepts its minimum ' + LIMITS_R11[field].min, T, async () => {
      await expectAccepted({ [field]: LIMITS_R11[field].min })
    })
  }

  for (const field of NEW) {
    for (const [label, bad] of invalidFor(LIMITS_R11[field].min)) {
      it(label + ' ' + field + ' = ' + JSON.stringify(bad) + ' is refused and the old value stays', T, async () => {
        const fileBefore = readPatch(home)
        const before = await value()
        const r = await host.call('settingsUpdate', { patch: { [field]: bad } })
        assert.equal(r.ok, false, 'update must be refused')
        assert.equal(readPatch(home), fileBefore, 'profile patch unchanged')
        assert.deepEqual(await value(), before, 'settings value unchanged')
      })
    }
  }

  it('L6 large whole numbers (ten times each default) are accepted for all 6 at once', T, async () => {
    await expectAccepted(Object.fromEntries(NEW.map((k) => [k, DEFAULTS[k] * 10])))
  })

  it('L7 the defaults are accepted again in one update', T, async () => {
    await expectAccepted(DEFAULTS)
  })

  it('L8 the form itself refuses min-1 and min+0.5 and accepts min for each new field', T, async () => {
    const form = new Schema(await host.call('settingsSchema', { ns: ROW_ID }))
    for (const k of NEW) {
      const { min } = LIMITS_R11[k]
      assert.throws(() => form({ [k]: min - 1 }), k + ' = ' + (min - 1) + ' must not validate')
      assert.throws(() => form({ [k]: min + 0.5 }), k + ' = ' + (min + 0.5) + ' must not validate')
      assert.equal(form({ [k]: min })[k], min, k + ' = ' + min + ' validates')
    }
  })
})
