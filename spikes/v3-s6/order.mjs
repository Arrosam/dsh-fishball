/**
 * V3-S6 scenario D (order): compose the SDK's own bundle layers with core before and after another
 * bundle whose row core disables, using the SDK's composeEntries (the boot's applyEntryPatches).
 * Records the effective `disabled` and the warnings composition emits. Env: SDK=<version>.
 */
import path from 'node:path'
import { record, sdkPkg } from './harness.mjs'

const boot = await sdkPkg('dsh-app-boot')
const FIXTURES = path.join(import.meta.dirname, 'fixtures')
const layer = (name) => boot.loadOverlayPatches('dsh', path.join(FIXTURES, name, 'cordis.patch.yml'))
const ORDERS = Object.freeze({ coreFirst: ['fishball-core', 'fishball-instance'], coreLast: ['fishball-instance', 'fishball-core'] })
const outcome = {}
for (const [label, order] of Object.entries(ORDERS)) {
  const warnings = []
  const rows = boot.composeEntries([order.flatMap(layer)], (line) => warnings.push(line))
  outcome[label] = { order, instanceDisabled: rows.find((row) => row.id === 'fishball-instance')?.disabled ?? null, warnings }
}
record('order', outcome)
process.exit(0)
