/**
 * Independent black-box UIM-DT-01 C-WIRE coverage: the real connector row, reached through DSH's
 * public root-service boundary. The wire fixture installs no dsh-instance, so no hosted child runs.
 *
 * Techniques: Decision Table (connector installed), State Transition (boot → app ready), and EP
 * (the runner's two SDKs). BVA is not applicable: service provision has no ordered input boundary.
 * The atReady snapshot must be captured inside the app-ready callback, never after a polling wait.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { caseName } from '../../contract/package-boundaries/cases.mjs'
import { scenario } from '../../dsh-connector/wire/world.mjs'
import { BUDGET, FIXTURE, MESSAGE, ROW, UI_CONTRACT, WORKER } from './constants.mjs'

export function registerUiWireCases(sdk) {
  // DESIGN.md §2: "Ordinary Cordis services stay process-global".
  // docs/planning/v3-design.md §4.2: "Host half" looks up services "at runtime (`ctx.get`, or a
  // `ctx.inject([...])` sub-scope)". C-WIRE requirement (user brief): "real dsh-connector row
  // provides dshConnectorUi service at app ready on both SDKs".
  describe(caseName(sdk, ROW.id, ROW.part, ROW.title), () => {
    it(ROW.provision, { timeout: BUDGET.testMs }, async () => {
      const w = await scenario(sdk, FIXTURE.scenario)
      assert.equal(await w.call(WORKER.ready), true, MESSAGE.ready)
      const row = await w.call(WORKER.row)
      assert.equal(row.present, true, MESSAGE.row)
      assert.equal(row.active, true, MESSAGE.active)

      // A later live lookup could pass after the ready boundary; assert the frozen observation.
      const service = w.dsh.atReady.services[UI_CONTRACT.serviceName]
      assert.equal(service?.present, true, MESSAGE.service)
      assert.equal(service?.apiVersion, UI_CONTRACT.apiVersion, MESSAGE.version)
    })
  })
}
