/**
 * P12 smoke fixture: one setting of each kind the plugin manager draws (and one it does not),
 * plus a secret. Each apply records the config it received in globalThis.__managerDemo.
 */
import Schema from '@deepseek-ai/schemastery'
export const name = 'fishball-spike-manager-demo'
export const Config = Schema.object({
  greeting: Schema.string().default('hi').description('Greeting the demo uses'),
  limit: Schema.natural().min(1).max(10).default(3).description('How many results to keep'),
  enabled: Schema.boolean().default(true).description('Whether the demo answers'),
  mode: Schema.union(['fast', 'careful']).default('fast').description('How it works'),
  token: Schema.string().role('secret').description('API token'),
  live: Schema.string().default('one').volatile().description('A live setting'),
  tags: Schema.array(String).default([]).description('Labels'),
  servers: Schema.array(Schema.object({ host: Schema.string(), port: Schema.natural() })).default([]).description('Servers (not drawn by the form)'),
})
export function apply(ctx, config) {
  ;(globalThis.__managerDemo ??= []).push({ greeting: config.greeting, limit: config.limit, mode: config.mode, hasToken: typeof config.token === 'string' && config.token.length > 0 })
}
