// WD-LIVE (the real dsh-connector-watchdog on a real DSH); see cases.mjs.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerWatchdogLiveCases } from './cases.mjs'

forEachVersion((version) => {
  registerWatchdogLiveCases(version)
})
