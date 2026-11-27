// C-HTTP (MCP route, check order, exposure, limits, per-principal streams, the RequestGate; v3-tasks.md row C-HTTP); see cases.mjs.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerCHttpAmendCases } from './amend-cases.mjs'
import { registerCHttpCases } from './cases.mjs'
import { registerXsecHttpCases } from './xsec-cases.mjs'
import { registerReviewXHttpCases } from './review-x-cases.mjs'
import { registerMultiHttpCases } from './multi-cases.mjs'
import { registerMultiHttpResourceCases } from './multi-resource-cases.mjs'

forEachVersion((version) => {
  registerCHttpCases(version)
  registerCHttpAmendCases(version)
  registerXsecHttpCases(version)
  registerReviewXHttpCases(version)
  registerMultiHttpCases(version)
  registerMultiHttpResourceCases(version)
})
