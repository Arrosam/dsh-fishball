// U-DRAW (embed-UI draws, the connector holds the state: window, hint, Retry link, marks, Hand over / Take back, fish light, notify prompt, contributed tools) registered for DSH 0.2.1-rc.5; the ICON-SET plain-fish rows; the R-FIX-CUI rows of cui-cases.mjs; see cases.mjs, icon-cases.mjs and USE-CASES.md.
import { registerUDrawCases } from './cases.mjs'
import { registerUDrawPolishCases } from './polish-cases.mjs'
import { registerIconDrawCases } from './icon-cases.mjs'
import { registerCuiDrawCases } from './cui-cases.mjs'

registerUDrawCases('0.2.1-rc.5')
registerUDrawPolishCases('0.2.1-rc.5')
registerIconDrawCases('0.2.1-rc.5')
registerCuiDrawCases('0.2.1-rc.5')
