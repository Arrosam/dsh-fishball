/** V3-S6 stand-in feature: an ordinary bundle row that only records that it started. */
export const name = 'fishball-watchdog'
export function apply() { (globalThis.__s6 ??= { checks: [] }).watchdogStarted = true }
