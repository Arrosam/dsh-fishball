/**
 * Test row (FBTEST_BOOT_LOG=1, inserted by the worker's overlay): records every log line from its
 * own apply on, at every level, so a case can see a line logged during boot. DSH commits app ready
 * inside runProfile, before any exporter the worker can add after runProfile resolves, and Cordis's
 * own buffer keeps only the levels its logger lets through (0.2.1-rc.5 drops warnings there).
 * The exporter belongs to the root logger service, so it sees every plugin's logger. Lines live on
 * globalThis because the worker reads them.
 */
const ALL_LEVELS = 3

export const name = 'fbtest-boot-log'

export function apply(ctx) {
  const lines = (globalThis.__fbtestBootLog ??= [])
  ctx.logger.exporter({
    levels: { default: ALL_LEVELS },
    export: ({ sn, ts, name: logger, type, args }) => {
      lines.push({ sn, at: ts, name: logger, type, text: args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ') })
    },
  })
}
