/**
 * P12 fixture: a Fishball-only plugin whose Config has a string, a bounded natural number, a
 * switch, a choice of constants, a secret, a volatile field, a nested group, a list of text and
 * a list of objects (a kind the form cannot draw). Every apply records the config it received
 * (support/fixture-tools.mjs settingsRow), so a test sees what reached the plugin.
 * A greeting of 'boom' makes apply throw, so a valid saved value can still fail to mount.
 */
import Schema from '@deepseek-ai/schemastery'
import { SETTINGS_FIXTURE } from '../../constants.mjs'
import { settingsRow } from '../../fixture-tools.mjs'

export const name = 'fbtest-settings'
export const Config = Schema.object({
  greeting: Schema.string().default('hi').description('Greeting text'),
  limit: Schema.natural().min(1).max(10).default(3).description('A bounded number'),
  enabled: Schema.boolean().default(false),
  mode: Schema.union(['fast', 'slow']).default('fast'),
  token: Schema.string().role('secret').default(''),
  live: Schema.string().default('one').volatile(),
  nested: Schema.object({ a: Schema.string().default('x'), b: Schema.natural().default(1) }),
  tags: Schema.array(Schema.string()).default(['a', 'b']),
  servers: Schema.array(Schema.object({ host: Schema.string(), port: Schema.natural() })).default([]),
  // A secret inside a nested group: "any secret field in values" covers it too (DESIGN §10d).
  auth: Schema.object({ user: Schema.string().default('u'), key: Schema.string().role('secret').default('') }),
  // A list of objects holding secrets: a path above them is refused to Fishball, and no value shown carries them.
  accounts: Schema.array(Schema.object({ name: Schema.string(), secret: Schema.string().role('secret') })).default([]),
})
export const apply = settingsRow('fbtest-settings', 'fbtest-settings', (config) => config.greeting === SETTINGS_FIXTURE.failGreeting)
