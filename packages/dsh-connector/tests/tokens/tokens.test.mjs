// C-TOKENS-REVEAL (token registry: create / createHosted reveal once, digest-only records, token-duplicate, revocation signal); see cases.mjs.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerTokenCases } from './cases.mjs'

forEachVersion((version) => {
  registerTokenCases(version)
})
