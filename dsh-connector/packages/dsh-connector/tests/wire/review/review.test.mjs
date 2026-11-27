// Requirements-only C-WIRE review rows; identical registration on both supported SDKs.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerReviewCases } from './cases.mjs'
import { registerAddedReviewCases } from './added-cases.mjs'

forEachVersion((version) => {
  registerReviewCases(version)
  registerAddedReviewCases(version)
})
