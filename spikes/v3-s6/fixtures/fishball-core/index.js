/** V3-S6 probe: fishball-core's app row. Publishes the guard report and records each check's trigger. */
import { effectiveGuards } from './guards.js'

export const name = 'fishball-core'
export const inject = ['loader', 'appReady']
const TRIGGERS = Object.freeze(['settings/document-updated', 'loader/config-update', 'plugin-manager/changed'])

export function apply(ctx, config) {
  const probe = (globalThis.__s6 ??= { checks: [] })
  probe.ctx = ctx
  probe.config = config
  const check = (trigger) => {
    const report = effectiveGuards(ctx)
    probe.checks.push({ trigger, at: Date.now(), status: report.status, overridden: report.overridden })
    probe.last = report
  }
  probe.check = check
  ctx.effect(() => ctx.appReady.onReady(() => check('app-ready')), 'fishball-core: app ready check')
  for (const event of TRIGGERS) ctx.on(event, () => queueMicrotask(() => check(event)))
}
