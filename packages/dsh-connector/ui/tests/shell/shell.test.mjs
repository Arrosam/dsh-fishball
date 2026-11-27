// U-SHELL (UIM-UC-01 integration part, UIM-UC-04 U-SHELL's parts, UIM-EP-01/02, UIM-DT-01 rows 3, 7, 7b, R-EMBED's U-SHELL row); see cases.mjs.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerUShellCases } from './cases.mjs'

forEachVersion((version) => {
  registerUShellCases(version)
})
