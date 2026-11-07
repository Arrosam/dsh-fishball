/**
 * R-CONFIG: safety limits in the fishball-connector row config, edited live through ctx.settings.
 * C2 (conn-OQ-20, 474b876): the row keeps only the 15 limits the connector still reads; the
 * in-process agent's fields (sources, Fishball-only plugins, hourly caps, context window, plugin
 * manager, outbox, pile height) went with it (slim §12). CFG-09 (Fishball's session never
 * remounted) is retired: there is no in-process session to remount.
 *
 * | id     | technique          | requirement                                        | expected |
 * |--------|--------------------|----------------------------------------------------|----------|
 * | CFG-01 | EP (defaults)      | 15 fields (7 + rev11-limits' 6 + rev11b's 2) with their defaults | settings value and state.limits equal the default table; applies live |
 * | CFG-02 | BVA (min valid)    | each field accepts its minimum (1) | update ok; state.limits shows it; saved in the profile patch |
 * | CFG-03 | BVA (min - 1)      | 0 is rejected                      | update throws; patch file and live value unchanged |
 * | CFG-04 | EP (negative)      | -1 rejected for ">= 1" fields                       | rejected; unchanged |
 * | CFG-05 | EP (non-integer)   | 1.5 / 0.5 rejected                                 | rejected; unchanged |
 * | CFG-06 | EP (wrong type)    | a string ("5", "x") rejected                        | rejected; unchanged |
 * | CFG-07 | BVA (large)        | no upper bound: 1000000 accepted                   | update ok; state shows it |
 * | CFG-08 | EP (default again) | the default value is accepted after a change       | update ok; state shows the default |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { LIMITS, LIMITS_R11, LIMITS_R11B } from './support/constants.mjs'
import { HOOK, T, readPatch, savedRowConfig } from './support/expect.mjs'
import { bootLive, newHome } from './support/host.mjs'

// The default table after C2: the 7 original fields the connector still reads, the 6 kept rev11-limits fields
// and rev11b's userMessagesListed and userMessageExcerptChars (packages/connector config, conn-OQ-20).
const DEFAULTS = Object.fromEntries(Object.entries({ ...LIMITS, ...LIMITS_R11, ...LIMITS_R11B }).map(([k, v]) => [k, v.default]))

/** Invalid values, labelled by partition: every kept limit has the minimum 1 (the hourly caps with 0 are gone). */
function invalidValues() {
  return [['CFG-03 min-1', 0], ['CFG-04 negative', -1], ['CFG-05 non-integer', 1.5], ['CFG-06 string', '5']]
}

describe('R-CONFIG limits', () => {
  let host
  let home

  before(async () => {
    home = newHome('config')
    host = (await bootLive(home)).host
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  /** Apply one valid patch and check the live state, the saved patch and the unchanged session. */
  async function expectAccepted(patch) {
    const r = await host.call('settingsUpdate', { patch })
    assert.equal(r.ok, true, 'update refused: ' + JSON.stringify(r.error))
    const limits = (await host.state()).limits
    for (const [k, v] of Object.entries(patch)) assert.equal(limits[k], v, 'state.limits.' + k)
    const saved = savedRowConfig(home) ?? {}
    for (const [k, v] of Object.entries(patch)) assert.equal(saved[k], v, 'saved row config ' + k)
  }

  it('CFG-01 defaults: all 15 limit fields with the documented defaults, editable live', T, async () => {
    const d = await host.call('settingsDescribe')
    assert.ok(d, 'settings entry "fishball-connector" exists')
    assert.equal(d.applies, 'live')
    for (const [k, v] of Object.entries(DEFAULTS)) assert.equal(d.value?.[k], v, 'settings value ' + k)
    assert.deepEqual((await host.state()).limits, DEFAULTS)
  })

  for (const field of Object.keys(LIMITS)) {
    it('CFG-02 ' + field + ' accepts its minimum ' + LIMITS[field].min, T, async () => {
      await expectAccepted({ [field]: LIMITS[field].min })
    })
  }

  for (const field of Object.keys(LIMITS)) {
    for (const [label, value] of invalidValues()) {
      it(label + ' ' + field + ' = ' + JSON.stringify(value) + ' is rejected and nothing changes', T, async () => {
        const fileBefore = readPatch(home)
        const liveBefore = (await host.state()).limits
        const describedBefore = (await host.call('settingsDescribe')).value
        const r = await host.call('settingsUpdate', { patch: { [field]: value } })
        assert.equal(r.ok, false, 'update must throw')
        assert.equal(readPatch(home), fileBefore, 'profile patch unchanged')
        assert.deepEqual((await host.state()).limits, liveBefore, 'live limits unchanged')
        assert.deepEqual((await host.call('settingsDescribe')).value, describedBefore, 'settings value unchanged')
      })
    }
  }

  it('CFG-07 a large whole number is accepted (no upper bound)', T, async () => {
    await expectAccepted({ maxQueuedInputs: 1000000 })
  })

  it('CFG-08 the defaults are accepted again in one update', T, async () => {
    await expectAccepted(DEFAULTS)
    assert.deepEqual((await host.state()).limits, DEFAULTS)
  })
})
