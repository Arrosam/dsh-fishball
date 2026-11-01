/**
 * Revision 11 rev11-limits (DESIGN §14 "Revision 11 delivery plan" row rev11-limits; §16 "Hard-coded
 * limits moved to config"): the sixteen new fields of the fishball row's config, as DSH's settings
 * service (the form DSH's Plugins page draws) describes and edits them. One host; cases run in order.
 * Expected values come from §16's tables only.
 *
 * | id     | technique                     | expected |
 * |--------|-------------------------------|----------|
 * | L1     | EP (form)                     | the settings schema has a field for each of the 16 new names and still the 12 existing ones; rebuilt with Schemastery it resolves {} to every documented default |
 * | L2     | EP (value, nothing saved)     | the settings value shows each new field at its default; the 12 existing at theirs |
 * | L3     | EP (existing install: saved config without the new fields) | after saving one old field, the saved row config has none of the 16 new names, and the value still shows each default |
 * | L4 ×16 | BVA (min = 1)                 | accepted; value shows 1; saved in the profile patch |
 * | L5 ×64 | BVA (min-1 = 0) / EP (negative -1, fraction 1.5, string "5") | refused; patch file and value unchanged |
 * | L6     | BVA (large: 10 × default, all 16 at once) | accepted; value shows them |
 * | L7     | ST (changed -> defaults)      | one update with all 16 defaults is accepted; value shows them |
 * | L8     | EP (schema min)               | the rebuilt schema refuses 0 and 1.5 for each new field and accepts 1 |
 * | L9     | DT (tool x Fishball's own config) | set_plugin_settings on dsh-fishball's row is refused before any prompt; the value is unchanged |
 * | L10    | EP (Fishball's tools)         | no tool in Fishball's request takes a parameter named after any limit field |
 * | L11    | ST (live -updates-> live)     | none of the updates remounted Fishball: same agent, not disposed, created once, status live |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { LIMITS, LIMITS_R11, OUTCOME, PACKAGE_NAME, ROW_ID, SETTINGS_TOOLS, STATUS } from './support/constants.mjs'
import { HOOK, Schema, T, fishballTool, readPatch, savedRowConfig, settledIdle } from './support/expect.mjs'
import { bootLive, newHome, until } from './support/host.mjs'

const NEW = Object.keys(LIMITS_R11)
const DEFAULTS = Object.fromEntries(Object.entries(LIMITS_R11).map(([k, v]) => [k, v.default]))
const OLD_DEFAULTS = Object.fromEntries(Object.entries(LIMITS).map(([k, v]) => [k, v.default]))
const INVALID = [['L5 min-1', 0], ['L5 negative', -1], ['L5 non-integer', 1.5], ['L5 string', '5']]

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

describe('rev11-limits: the new fields in the fishball row config', () => {
  let host
  let home
  let fb
  let agentTag

  before(async () => {
    home = newHome('limits-config')
    const booted = await bootLive(home)
    host = booted.host
    fb = booted.state?.sessionId
    agentTag = fb ? (await host.call('inspect', { sessionId: fb })).agentTag : null
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

  it('L1 the settings form has the 16 new fields and the 12 existing ones, with the documented defaults', T, async () => {
    // The row's form is described once its entry is active; poll briefly rather than read it once.
    let json
    await until(async () => { json = await host.call('settingsSchema', { ns: ROW_ID }); return formKeys(json).length > 0 }, 5000, 100)
    assert.ok(json, 'the fishball row has a settings form')
    const keys = formKeys(json)
    for (const k of NEW) assert.ok(keys.includes(k), 'form field ' + k + ' (form has ' + keys.join(', ') + ')')
    for (const k of Object.keys(LIMITS)) assert.ok(keys.includes(k), 'existing form field ' + k)
    const resolved = new Schema(json)({})
    for (const [k, d] of Object.entries(DEFAULTS)) assert.equal(resolved[k], d, 'schema default of ' + k)
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
    it('L4 ' + field + ' accepts its minimum 1', T, async () => {
      await expectAccepted({ [field]: LIMITS_R11[field].min })
    })
  }

  for (const field of NEW) {
    for (const [label, bad] of INVALID) {
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

  it('L6 large whole numbers (ten times each default) are accepted for all 16 at once', T, async () => {
    await expectAccepted(Object.fromEntries(NEW.map((k) => [k, DEFAULTS[k] * 10])))
  })

  it('L7 the defaults are accepted again in one update', T, async () => {
    await expectAccepted(DEFAULTS)
  })

  it('L8 the form itself refuses 0 and 1.5 and accepts 1 for each new field', T, async () => {
    const form = new Schema(await host.call('settingsSchema', { ns: ROW_ID }))
    for (const k of NEW) {
      assert.throws(() => form({ [k]: 0 }), k + ' = 0 must not validate')
      assert.throws(() => form({ [k]: 1.5 }), k + ' = 1.5 must not validate')
      assert.equal(form({ [k]: 1 })[k], 1, k + ' = 1 validates')
    }
  })

  it('L9 set_plugin_settings cannot change Fishball\'s own limits', T, async () => {
    await settledIdle(host, fb)
    const before = await value()
    const r = await fishballTool(host, fb, SETTINGS_TOOLS.set, { plugin: PACKAGE_NAME, row: ROW_ID, values: { readSessionMessages: 1, minWindowTokens: 1 }, reason: 'fbtest limits' }, OUTCOME.allow)
    assert.equal(r.json?.ok, false, 'refused: ' + r.result?.text?.slice(0, 300))
    assert.equal(r.approvals.length, 0, 'refused before any prompt')
    assert.deepEqual(await value(), before, 'value unchanged')
  })

  it('L10 no Fishball tool takes a parameter named after a limit field', T, async () => {
    const req = (await host.call('requests', { sessionId: fb })).at(-1)
    assert.ok(req?.tools?.length > 0, 'precondition: Fishball has tools')
    const names = [...NEW, ...Object.keys(LIMITS)]
    for (const t of req.tools) {
      const params = JSON.stringify(t.parameters ?? {})
      for (const n of names) assert.equal(params.includes('"' + n + '"'), false, t.name + ' takes ' + n)
    }
  })

  it('L11 no update remounted or recreated Fishball\'s session', T, async () => {
    const now = await host.call('inspect', { sessionId: fb })
    assert.equal(now.live, true)
    assert.equal(now.agentTag, agentTag, 'same agent object')
    const events = (await host.call('lifecycle')).filter((e) => e.id === fb)
    assert.equal(events.filter((e) => e.type === 'disposed').length, 0, 'not disposed')
    assert.equal(events.filter((e) => e.type === 'created').length, 1, 'created once')
    assert.equal((await host.state()).status, STATUS.live)
  })
})
