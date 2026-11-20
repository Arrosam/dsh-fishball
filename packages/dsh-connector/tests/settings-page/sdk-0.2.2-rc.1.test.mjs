// C-TOKENS-REVEAL (the connector's settings page: create / notice routes, client.js, the reveal modal; the UI-POLISH-D layout rows of polish-cases.mjs; the R-FIX-CUI rows of cui-cases.mjs) registered for DSH 0.2.2-rc.1; see cases.mjs.
import { registerSettingsPageCases } from './cases.mjs'
import { registerPolishSettingsCases } from './polish-cases.mjs'
import { registerCuiSettingsCases } from './cui-cases.mjs'

registerSettingsPageCases('0.2.2-rc.1')
registerPolishSettingsCases('0.2.2-rc.1')
registerCuiSettingsCases('0.2.2-rc.1')

import { registerMultiSettingsCases } from './multi-cases.mjs'
registerMultiSettingsCases('0.2.2-rc.1')
