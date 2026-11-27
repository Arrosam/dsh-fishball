// Package icons across every plugin package of this repository; see cases.mjs.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerPackageIconCases } from './cases.mjs'

forEachVersion((version) => {
  registerPackageIconCases(version)
})
