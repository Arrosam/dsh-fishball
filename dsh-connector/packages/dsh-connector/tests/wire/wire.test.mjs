// C-WIRE (the wired connector row in a real DSH: settings, routes, services, tokens, MCP end to end); see cases.mjs.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerWireCases } from './cases.mjs'
import { registerMultiNameCases } from './multi-name-cases.mjs'
import { registerMultiWireCases } from './multi-cases.mjs'
import { registerDiscoveryWireCases } from './discovery-cases.mjs'
import { registerTaskboardCheckTurnCases } from './taskboard-check-turn-cases.mjs'

forEachVersion((version) => {
  registerWireCases(version)
  registerMultiNameCases(version)
  registerMultiWireCases(version)
  registerDiscoveryWireCases(version)
  registerTaskboardCheckTurnCases(version)
})
