// R-EMBED (PLAT-EP-03 rows 1, 3, 5; HOST-EP-03 row 5; definition of done); see cases.mjs.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerEmbedCases } from './cases.mjs'

forEachVersion((version) => {
  registerEmbedCases(version)
})
