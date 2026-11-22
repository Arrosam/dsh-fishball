// fishball-core's events area, registered once on the current DSH (fishball-test-helpers/dsh DSH_VERSION):
// the interception service, the acceptance ledger and the one wake (events/cases.mjs), with the
// R-FIX-CORE rows (rfix.mjs), MULTI-1 (multi.mjs, retired.mjs) and wake batching (batch.mjs).
import { registerInterceptCases } from './events/cases.mjs'

registerInterceptCases()
