// K1 (freeze of fishball-connector/mcp-schema; K-flagged AUTH, NAME, EVT, PLAT, WATCH cases) and K1b (request gate, grant dispatch) registered for DSH 0.2.1-rc.5; see cases.mjs and k1b-cases.mjs.
import { registerK1AmendCases } from './amend-cases.mjs'
import { registerK1Cases } from './cases.mjs'
import { registerK1bCases } from './k1b-cases.mjs'

registerK1Cases('0.2.1-rc.5')
registerK1bCases('0.2.1-rc.5')
registerK1AmendCases('0.2.1-rc.5')
