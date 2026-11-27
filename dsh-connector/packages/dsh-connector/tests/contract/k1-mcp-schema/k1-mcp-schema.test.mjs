// K1 (freeze of dsh-agent-connector/mcp-schema; K-flagged AUTH, NAME, EVT, PLAT, WATCH cases), K1b (request gate, grant dispatch) and K1-MULTI (MULTI-0 server identity); see cases.mjs and k1b-cases.mjs.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerK1AmendCases } from './amend-cases.mjs'
import { registerK1Cases } from './cases.mjs'
import { registerConnToolsContractCases } from './conn-tools-cases.mjs'
import { registerDiscoveryContractCases } from './discovery-cases.mjs'
import { registerReportContractCases } from './report-cases.mjs'
import { registerHighRiskContractCases } from './high-risk-cases.mjs'
import { registerDelegateOutcomeContractCases } from './delegate-outcome-cases.mjs'
import { registerK1bCases } from './k1b-cases.mjs'
import { registerK1cCases } from './k1c-cases.mjs'
import { registerK1MultiCases } from './multi-cases.mjs'

forEachVersion((version) => {
  registerK1Cases(version)
  registerK1bCases(version)
  registerK1AmendCases(version)
  registerK1cCases(version)
  registerK1MultiCases(version)
  registerConnToolsContractCases(version)
  registerDiscoveryContractCases(version)
  registerReportContractCases(version)
  registerDelegateOutcomeContractCases(version)
  registerHighRiskContractCases(version)
})
