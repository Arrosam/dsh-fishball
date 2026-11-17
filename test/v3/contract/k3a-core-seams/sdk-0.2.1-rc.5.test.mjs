// K3a (core's own MCP-surface copy, hosted-import names, Connect, the fishball-ui seam) registered for DSH 0.2.1-rc.5; see cases.mjs.
// K3a-TARGET (E-FIX-1 B1: the hosted target visible through DSH's settings service); see settings-target.mjs.
import { registerK3aCases } from './cases.mjs'
import { registerSettingsTargetCases } from './settings-target.mjs'

registerK3aCases('0.2.1-rc.5')
registerSettingsTargetCases('0.2.1-rc.5')
