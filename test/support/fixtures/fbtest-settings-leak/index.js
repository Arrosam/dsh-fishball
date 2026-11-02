/** P12 fixture: a Fishball-only plugin whose invalid patch config holds a secret in the rejected value. */
import Schema from '@deepseek-ai/schemastery'
import { settingsRow } from '../../fixture-tools.mjs'

export const name = 'fbtest-settings-leak'
export const Config = Schema.object({
  pin: Schema.natural().role('secret'),
  note: Schema.natural().default(1),
})
export const apply = settingsRow('fbtest-settings-leak', 'fbtest-settings-leak')
