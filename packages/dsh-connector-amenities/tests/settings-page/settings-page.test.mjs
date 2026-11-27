// dsh-connector-amenities settings pages (R4, R5); see cases.mjs and USE-CASES.md.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerUmbrellaPageCases } from './cases.mjs'

forEachVersion((version) => {
  registerUmbrellaPageCases(version)
})
