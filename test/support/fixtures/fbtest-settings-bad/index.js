/** P12 fixture: a Fishball-only plugin whose own patch config fails its schema (DESIGN §10d "Checking"). */
import Schema from '@deepseek-ai/schemastery'
import { settingsRow } from '../../fixture-tools.mjs'

export const name = 'fbtest-settings-bad'
export const Config = Schema.object({
  name: Schema.string().required(),
  size: Schema.natural().default(2),
})
export const apply = settingsRow('fbtest-settings-bad', 'fbtest-settings-bad')
