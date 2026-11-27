// C-TOKENS-REVEAL (the connector's settings page: create / notice routes, client.js, the reveal modal; the UI-POLISH-D layout rows of polish-cases.mjs; the R-FIX-CUI rows of cui-cases.mjs); see cases.mjs.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerSettingsPageCases } from './cases.mjs'
import { registerPolishSettingsCases } from './polish-cases.mjs'
import { registerCuiSettingsCases } from './cui-cases.mjs'
import { registerHostFormCases } from './host-form-cases.mjs'
import { registerMultiSettingsCases } from './multi-cases.mjs'

forEachVersion((version) => {
  registerSettingsPageCases(version)
  registerPolishSettingsCases(version)
  registerCuiSettingsCases(version)
  registerMultiSettingsCases(version)
  registerHostFormCases(version)
})
