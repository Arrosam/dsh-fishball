// C-WIRE (the wired connector row in a real DSH: settings, routes, services, tokens, MCP end to end) registered for DSH 0.2.2-rc.1; see cases.mjs.
import { registerWireCases } from './cases.mjs'

registerWireCases('0.2.2-rc.1')

import { registerMultiNameCases } from './multi-name-cases.mjs'
registerMultiNameCases('0.2.2-rc.1')

import { registerMultiWireCases } from './multi-cases.mjs'
registerMultiWireCases('0.2.2-rc.1')

import { registerDiscoveryWireCases } from './discovery-cases.mjs'
registerDiscoveryWireCases('0.2.2-rc.1')
