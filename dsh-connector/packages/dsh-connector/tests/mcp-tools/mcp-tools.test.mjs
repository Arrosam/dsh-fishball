// C-TOOLS (core MCP tools over the V2 domain, result envelope, no watch tools; v3-tasks.md row C-TOOLS); see cases.mjs.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerCToolsCases } from './cases.mjs'
import { registerConnToolsBoundaryCases } from './conn-tools-cases.mjs'
import { registerDiscoveryToolsCases } from './discovery-cases.mjs'

forEachVersion((version) => {
  registerCToolsCases(version)
  registerConnToolsBoundaryCases(version)
  registerDiscoveryToolsCases(version)
})
