/**
 * R-CONFIG: safety limits in the fishball row config, edited live through ctx.settings.
 *
 * | id     | technique          | requirement                                        | expected |
 * |--------|--------------------|----------------------------------------------------|----------|
 * | CFG-01 | EP (defaults)      | 31 fields (12 + rev11-limits' 16 + rev11b's 2 + rev11c's 1) with their defaults | settings value and state.limits equal the default table; applies live |
 * | CFG-02 | BVA (min valid)    | each field accepts its minimum (1, or 0 for hourly caps) | update ok; state.limits shows it; saved in the profile patch |
 * | CFG-03 | BVA (min - 1)      | 0 for ">= 1" fields, -1 for hourly caps is rejected | update throws; patch file and live value unchanged |
 * | CFG-04 | EP (negative)      | -1 rejected for ">= 1" fields                       | rejected; unchanged |
 * | CFG-05 | EP (non-integer)   | 1.5 / 0.5 rejected                                 | rejected; unchanged |
 * | CFG-06 | EP (wrong type)    | a string ("5", "x") rejected                        | rejected; unchanged |
 * | CFG-07 | BVA (large)        | no upper bound: 1000000 accepted                   | update ok; state shows it |
 * | CFG-08 | EP (default again) | the default value is accepted after a change       | update ok; state shows the default |
 * | CFG-09 | State (live -update-> live) | updates never remount Fishball's session  | same agent object; no agent/created or agent/disposed for it; status live |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { LIMITS, LIMITS_R11, LIMITS_R11B, LIMITS_R11C, STATUS } from './support/constants.mjs'
import { HOOK, T, readPatch, savedRowConfig } from './support/expect.mjs'
import { bootLive, newHome } from './support/host.mjs'

// rev11-limits: the default table is the 12 original fields plus the 16 moved from constants (DESIGN §16, §3 `Config`);
// rev11b adds userMessagesListed and userMessageExcerptChars (§16 "Revision 11's new limits"); rev11c adds pileMaxHeightVh (default 45).
const DEFAULTS = Object.fromEntries(Object.entries({ ...LIMITS, ...LIMITS_R11, ...LIMITS_R11B, ...LIMITS_R11C }).map(([k, v]) => [k, v.default]))

/** Invalid values per field, labelled by partition. */
function invalidValues(field) {
  return LIMITS[field].min === 0
    ? [['CFG-03 min-1', -1], ['CFG-05 non-integer', 0.5], ['CFG-06 string', 'x']]
    : [['CFG-03 min-1', 0], ['CFG-04 negative', -1], ['CFG-05 non-integer', 1.5], ['CFG-06 string', '5']]
}

describe('R-CONFIG limits', () => {
  let host
  let home
  let sid
  let agentTag

  before(async () => {
    home = newHome('config')
    const booted = await bootLive(home)
    host = booted.host
    sid = booted.state?.sessionId
    agentTag = sid ? (await host.call('inspect', { sessionId: sid })).agentTag : null
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

  it('CFG-01 defaults: all 31 limit fields with the documented defaults, editable live', T, async () => {
    const d = await host.call('settingsDescribe')
    assert.ok(d, 'settings entry "fishball" exists')
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
    for (const [label, value] of invalidValues(field)) {
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

  it('CFG-09 no update remounted or recreated Fishball\'s session', T, async () => {
    const now = await host.call('inspect', { sessionId: sid })
    assert.equal(now.live, true)
    assert.equal(now.agentTag, agentTag, 'same agent object')
    const events = (await host.call('lifecycle')).filter((e) => e.id === sid)
    assert.equal(events.filter((e) => e.type === 'disposed').length, 0, 'not disposed')
    assert.equal(events.filter((e) => e.type === 'created').length, 1, 'created once, at first start')
    assert.equal((await host.state()).status, STATUS.live)
  })
})
