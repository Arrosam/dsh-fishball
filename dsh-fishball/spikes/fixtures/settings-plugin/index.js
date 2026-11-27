/**
 * S30 fixture: a plugin with ordinary and volatile settings. Every apply is recorded in
 * globalThis.__s30 with the config it received, so a spike can tell a remount from a live update.
 */
import Schema from '@deepseek-ai/schemastery'
export const name = 'fishball-spike-settings'
export const Config = Schema.object({
  greeting: Schema.string().default('hi'),
  limit: Schema.natural().default(3),
  live: Schema.string().default('one').volatile(),
})
export function apply(ctx, config) {
  const record = { greeting: config.greeting, limit: config.limit, live: typeof config.live?.get === 'function' ? config.live.get() : config.live }
  ;(globalThis.__s30 ??= []).push(record)
  globalThis.__s30config = config
}
