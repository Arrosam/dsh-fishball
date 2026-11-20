// C-MCP-ADAPTER: dsh-connector-adapter black-box cases (USE-CASES.md), registered for DSH 0.2.1-rc.5.
import { registerAdapterCases } from './cases.mjs'
import { registerAdapterXsecCases } from './xsec-cases.mjs'
import { registerAdapterReviewFixCases } from './review-fix-cases.mjs'

registerAdapterCases('0.2.1-rc.5')
registerAdapterXsecCases('0.2.1-rc.5')
registerAdapterReviewFixCases('0.2.1-rc.5')
