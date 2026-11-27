// C-MCP-ADAPTER: dsh-connector-adapter black-box cases (USE-CASES.md),.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerAdapterCases } from './cases.mjs'
import { registerAdapterXsecCases } from './xsec-cases.mjs'
import { registerAdapterReviewFixCases } from './review-fix-cases.mjs'

forEachVersion((version) => {
  registerAdapterCases(version)
  registerAdapterXsecCases(version)
  registerAdapterReviewFixCases(version)
})
