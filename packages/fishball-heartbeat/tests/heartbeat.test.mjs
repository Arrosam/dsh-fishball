// fishball-heartbeat's heartbeat row, registered once on the current DSH (fishball-test-helpers/dsh DSH_VERSION):
// the timer, count and focus tool (heartbeat/cases.mjs), its live settings (heartbeat/live-cases.mjs),
// compaction on cooling (heartbeat/compact-cases.mjs) and what its own compaction causes (heartbeat/caused-cases.mjs).
import { registerHeartbeatCases } from './heartbeat/cases.mjs'
import { registerHeartbeatCausedCases } from './heartbeat/caused-cases.mjs'
import { registerHeartbeatCompactCases } from './heartbeat/compact-cases.mjs'
import { registerHeartbeatLiveCases } from './heartbeat/live-cases.mjs'

registerHeartbeatCases()
registerHeartbeatLiveCases()
registerHeartbeatCompactCases()
registerHeartbeatCausedCases()
