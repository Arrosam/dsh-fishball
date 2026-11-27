// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerUWireCases } from './cases.mjs'

forEachVersion((version) => {
  registerUWireCases(version)
})
