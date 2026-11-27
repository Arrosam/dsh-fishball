// R1 live-settings cases (dsh-connector-shared/live-settings); see cases.mjs and USE-CASES.md.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerLiveSettingsCases } from './cases.mjs'

forEachVersion((version) => {
  registerLiveSettingsCases(version)
})
