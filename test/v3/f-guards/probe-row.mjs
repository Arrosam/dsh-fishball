/**
 * Test row (in a fixture bundle listed first): looks for core's guard report while DSH boots, so a
 * case can check that nothing is published before app ready (R-FB-09, K3 GuardCheckTrigger).
 * It samples at its own apply and at every `settings/document-updated` until app ready, then once at
 * app ready. Samples live on globalThis because the worker reads them.
 */
import { findReport } from './report.mjs'

export const name = 'fbtest-guard-probe'
export const inject = ['appReady']

const SETTINGS_EVENT = 'settings/document-updated'

export function apply(ctx) {
  const probe = (globalThis.__fbgProbe ??= { ready: false, beforeReady: [], atReady: undefined })
  const sample = async (at) => {
    if (probe.ready) return
    const report = await findReport(ctx)
    probe.beforeReady.push({ at, report })
  }
  void sample('apply')
  ctx.on(SETTINGS_EVENT, () => { void sample(SETTINGS_EVENT) })
  ctx.effect(() => ctx.appReady.onReady(() => { probe.ready = true }), 'fbtest guard probe: app ready')
}
