/** LOGO-FIX: exercise the installed main row (including its SDK Config) through a profile's
 * persisted patch. A fake brand getter skips the very validation that can prevent cold startup. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { caseName } from '../../contract/package-boundaries/cases.mjs'
import { C } from './constants.mjs'
import { boot } from './subject.mjs'

const FISH = 'fishball'
const WHALE = 'deepseek'
const INVALID = [
  ['null', null], ['empty string', ''], ['unknown', 'orca'], ['wrong case', 'DeepSeek'],
  ['number', 7], ['array', [WHALE]], ['object', { style: WHALE }],
]
const configured = (brandStyle) => ({ brandStyle })
const current = async (host) => (await host.call('snapshot'))?.brand?.style

export function registerBrandConfigCases(sdk) {
  const start = async (t, coreConfig) => {
    const h = await boot(sdk, [C.core], undefined, {}, { coreConfig })
    t.after(() => h.stop())
    return h
  }
  const partitions = [
    ['absent', {}, FISH], [FISH, configured(FISH), FISH], [WHALE, configured(WHALE), WHALE],
    ...INVALID.map(([part, value]) => [part, configured(value), FISH]),
  ]
  for (const [part, raw, expected] of partitions) {
    test(caseName(sdk, 'BRAND-CONFIG-DT-01', part, `cold start with persisted ${part} → ${expected}`), async (t) => {
      assert.equal(await current(await start(t, raw)), expected)
    })
  }
  test(caseName(sdk, 'BRAND-CONFIG-ST-01', 'live', 'malformed persisted edits leave the choice unchanged or at default; later valid edits still work'), async (t) => {
    const h = await start(t, configured(WHALE))
    assert.equal(await current(h), WHALE)
    for (const [part, value] of INVALID) {
      await h.call('setCorePatch', configured(value))
      assert.ok([WHALE, FISH].includes(await current(h)), `after ${part}`)
      // Exercise the same update path in both directions; a no-op reconcile cannot pass.
      for (const valid of [FISH, WHALE]) {
        await h.call('setCorePatch', configured(valid))
        assert.equal(await current(h), valid, `recover after ${part}`)
      }
    }
  })
}
