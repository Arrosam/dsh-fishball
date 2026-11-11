/** V3-S6 stand-in for the host row: records that it started (a nested child would start here). */
export const name = 'fishball-instance'
export function apply() { (globalThis.__s6 ??= { checks: [] }).instanceStarted = true }
