// C-HTTP (MCP route, check order, exposure, limits, per-principal streams, the RequestGate; v3-tasks.md row C-HTTP) registered for DSH 0.2.1-rc.5; see cases.mjs.
import { registerCHttpAmendCases } from './amend-cases.mjs'
import { registerCHttpCases } from './cases.mjs'

registerCHttpCases('0.2.1-rc.5')
registerCHttpAmendCases('0.2.1-rc.5')
