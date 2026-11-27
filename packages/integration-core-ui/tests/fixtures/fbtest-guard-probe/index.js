/**
 * Probe row (guards fixture, installed before core): samples core's guard report (fishballInstance
 * ui.guards.report(), contracts ui.d.ts) at its own apply and at every settings/document-updated until
 * DSH's app ready, so a case sees whether anything was published before app ready (R-FB-09).
 */
export const name = 'fbtest-guard-probe'
export const inject = ['appReady']
const SETTINGS_EVENT = 'settings/document-updated'
const report = (ctx) => { try { return ctx.get('fishballInstance')?.ui?.guards?.report() ?? null } catch { return null } }

export function apply(ctx) {
  const probe = (globalThis.__fbgProbe ??= { ready: false, beforeReady: [] })
  const sample = (at) => { if (!probe.ready) probe.beforeReady.push({ at, report: report(ctx) }) }
  sample('apply')
  ctx.on(SETTINGS_EVENT, () => sample(SETTINGS_EVENT))
  ctx.effect(() => ctx.appReady.onReady(() => { probe.ready = true }), 'fbtest guard probe: app ready')
}
