// K1 (freeze of dsh-agent-connector/mcp-schema; K-flagged AUTH, NAME, EVT, PLAT, WATCH cases), K1b (request gate, grant dispatch) and K1-MULTI (MULTI-0 server identity) registered for DSH 0.2.1-rc.5; see cases.mjs and k1b-cases.mjs.
import { registerK1AmendCases } from './amend-cases.mjs'
import { registerK1Cases } from './cases.mjs'
import { registerK1bCases } from './k1b-cases.mjs'
import { registerK1cCases } from './k1c-cases.mjs'
import { registerK1MultiCases } from './multi-cases.mjs'

registerK1Cases('0.2.1-rc.5')
registerK1bCases('0.2.1-rc.5')
registerK1AmendCases('0.2.1-rc.5')
registerK1cCases('0.2.1-rc.5')
registerK1MultiCases('0.2.1-rc.5')
