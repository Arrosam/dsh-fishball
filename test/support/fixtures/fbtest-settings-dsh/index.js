/** P12 fixture: a plugin on in DSH with a Config, so only the "shared with DSH" rule refuses its settings. */
import Schema from '@deepseek-ai/schemastery'
import { settingsRow } from '../../fixture-tools.mjs'

export const name = 'fbtest-settings-dsh'
export const Config = Schema.object({
  greeting: Schema.string().default('hi'),
  count: Schema.natural().default(1),
})
export const apply = settingsRow('fbtest-settings-dsh', 'fbtest-settings-dsh')
