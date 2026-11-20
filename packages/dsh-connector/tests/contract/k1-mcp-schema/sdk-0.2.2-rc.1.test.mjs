// K1 (freeze of dsh-agent-connector/mcp-schema; K-flagged AUTH, NAME, EVT, PLAT, WATCH cases), K1b (request gate, grant dispatch) and K1-MULTI (MULTI-0 server identity) registered for DSH 0.2.2-rc.1; see cases.mjs and k1b-cases.mjs.
import { registerK1AmendCases } from './amend-cases.mjs'
import { registerK1Cases } from './cases.mjs'
import { registerConnToolsContractCases } from './conn-tools-cases.mjs'
import { registerDiscoveryContractCases } from './discovery-cases.mjs'
import { registerReportContractCases } from './report-cases.mjs'
import { registerK1bCases } from './k1b-cases.mjs'
import { registerK1cCases } from './k1c-cases.mjs'
import { registerK1MultiCases } from './multi-cases.mjs'

registerK1Cases('0.2.2-rc.1')
registerK1bCases('0.2.2-rc.1')
registerK1AmendCases('0.2.2-rc.1')
registerK1cCases('0.2.2-rc.1')
registerK1MultiCases('0.2.2-rc.1')
registerConnToolsContractCases('0.2.2-rc.1')
registerDiscoveryContractCases('0.2.2-rc.1')
registerReportContractCases('0.2.2-rc.1')
