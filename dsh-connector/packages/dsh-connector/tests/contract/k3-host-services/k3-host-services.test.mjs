// K3 (freeze of the host-only service contracts and core's settings-section extension point) and K3-MULTI (MULTI-0 target declarations, targets-cases.mjs); see cases.mjs.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerK3Cases } from './cases.mjs'
import { registerK3MultiCases } from './targets-cases.mjs'

forEachVersion((version) => {
  registerK3Cases(version)
  registerK3MultiCases(version)
})
