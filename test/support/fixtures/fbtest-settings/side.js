/** P12 fixture: the second row of fbtest-settings. It has no Config, so it has no settings form. */
import { settingsRow } from '../../fixture-tools.mjs'

export const name = 'fbtest-settings-side'
export const apply = settingsRow('fbtest-settings', 'fbtest-settings-side')
