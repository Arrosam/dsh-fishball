// U-DRAW (embed-UI draws, the connector holds the state: window, hint, Retry link, marks, Hand over / Take back, fish light, notify prompt, contributed tools); the ICON-SET plain-fish rows; the R-FIX-CUI rows of cui-cases.mjs; see cases.mjs, icon-cases.mjs and USE-CASES.md.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerFrameReadyCases } from './frame-ready-cases.mjs'
import { registerUDrawCases } from './cases.mjs'
import { registerUDrawPolishCases } from './polish-cases.mjs'
import { registerIconDrawCases } from './icon-cases.mjs'
import { registerCuiDrawCases } from './cui-cases.mjs'
import { registerCheckingCases } from './checking-cases.mjs'
import { registerStreamCases } from './stream-cases.mjs'
import { registerVisibilityCases } from './visibility-cases.mjs'
import { registerWindowDrawCases } from './window-cases.mjs'

forEachVersion((version) => {
  registerStreamCases(version)
  registerCheckingCases(version)
  registerUDrawCases(version)
  registerFrameReadyCases(version)
  registerUDrawPolishCases(version)
  registerIconDrawCases(version)
  registerCuiDrawCases(version)
  registerVisibilityCases(version)
  registerWindowDrawCases(version)
})
