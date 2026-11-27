// fishball-core's wire area, registered once on the current DSH (fishball-test-helpers/dsh DSH_VERSION):
// core's package surface and core alone in a real DSH (wire/cases.mjs), MULTI-1 targets (multi.mjs),
// lifecycle (lifecycle.mjs), retirement (retirement.mjs), running sessions (running-sessions*.mjs),
// the brand config (brand-config.mjs) and the wake batch (batch.mjs). See wire/README.md.
import { registerWireCases } from './wire/cases.mjs'

import './wire/permission-handoff.mjs'
import './wire/guard-override-silence.mjs'

registerWireCases()
