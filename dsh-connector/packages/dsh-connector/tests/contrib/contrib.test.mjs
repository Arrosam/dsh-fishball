// C-EXT (contribution service registry, calls, emit and quarantine); see cases.mjs.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerCExtAmendCases } from './amend-cases.mjs'
import { registerCExtCases } from './cases.mjs'

forEachVersion((version) => {
  registerCExtCases(version)
  registerCExtAmendCases(version)
})
