// R-FIX-REDACT (the redactor's credential, value-form, Bearer, opaque-run and merge rules); see cases.md and cases.mjs.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerRedactCases } from './cases.mjs'

forEachVersion((version) => {
  registerRedactCases(version)
})
