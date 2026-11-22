/** LOGO-FIX: exercise the installed main row (including its SDK Config) through a persisted patch
 * on disk (the home's cordis.patch.yml, written before DSH starts and rewritten + reconciled live).
 * A fake brand getter skips the very validation that can prevent cold startup. */
import assert from 'node:assert/strict'
import { caseTest } from 'fishball-test-helpers/cases'
import { C } from './constants.mjs'
import { bootWire } from './world.mjs'

const FISH = 'fishball'
const WHALE = 'deepseek'
const INVALID = [
  ['null', null], ['empty string', ''], ['unknown', 'orca'], ['wrong case', 'DeepSeek'],
  ['number', 7], ['array', [WHALE]], ['object', { style: WHALE }],
]
const configured = (brandStyle) => ({ brandStyle })
const current = async (host) => (await host.call('snapshot'))?.brand?.style

const corePatch = (config) => [{ id: C.core, name: C.main, config }]
const T = Object.freeze({ timeout: C.budget.boot + C.budget.call })

export function registerBrandConfigCases() {
  const start = async (t, coreConfig) => {
    const h = await bootWire({ homePatch: corePatch(coreConfig) })
    t.after(() => h.stop())
    return h
  }
  const partitions = [
    ['absent', {}, FISH], [FISH, configured(FISH), FISH], [WHALE, configured(WHALE), WHALE],
    ...INVALID.map(([part, value]) => [part, configured(value), FISH]),
  ]
  for (const [part, raw, expected] of partitions) {
    caseTest('BRAND-CONFIG-DT-01', part, `cold start with persisted ${part} → ${expected}`, T, async (t) => {
      assert.equal(await current(await start(t, raw)), expected)
    })
  }
  caseTest('BRAND-CONFIG-ST-01', 'live', 'each malformed live edit falls back to Fishball; later valid edits still work', T, async (t) => {
    const h = await start(t, configured(WHALE))
    assert.equal(await current(h), WHALE)
    for (const [part, value] of INVALID) {
      await h.call('setCorePatch', { config: configured(value) })
      assert.equal(await current(h), FISH, `after ${part}`)
      // Exercise the same update path in both directions; a no-op reconcile cannot pass.
      for (const valid of [FISH, WHALE]) {
        await h.call('setCorePatch', { config: configured(valid) })
        assert.equal(await current(h), valid, `recover after ${part}`)
      }
    }
  })
}