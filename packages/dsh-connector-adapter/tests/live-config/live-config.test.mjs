// dsh-connector-adapter live settings (R2, R3); see cases.mjs and USE-CASES.md.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerAdapterLiveConfigCases } from './cases.mjs'

forEachVersion((version) => {
  registerAdapterLiveConfigCases(version)
})
