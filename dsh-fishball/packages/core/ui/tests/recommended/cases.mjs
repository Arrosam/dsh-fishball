/**
 * Registers the Recommended tab's cases once on the current DSH: the catalogue rows with their
 * checks (./checks.mjs, TC-*) and the independent review rows (./review-checks.mjs, RV-*).
 * Case names: `T-RP <TC|RV id> [DSH <v>] <intent>` (fishball-test-helpers/cases).
 */
import { caseTest } from 'fishball-test-helpers/cases'
import { DSH_RUNTIME, DSH_VERSION } from 'fishball-test-helpers/dsh'
import { CHECKS } from './checks.mjs'
import { RECOMMENDATION_TEST_DATA } from './data.mjs'
import { REVIEW_CHECKS, RV } from './review-checks.mjs'

export function registerRecommendationCases() {
  const data = RECOMMENDATION_TEST_DATA
  const ctx = { sdk: DSH_VERSION, sdkModules: DSH_RUNTIME }
  for (const caseData of data.cases) caseTest(data.feature, caseData.id, caseData.intent, (t) => CHECKS[caseData.id](ctx, t))
  for (const { id, intent } of RV.cases) caseTest(data.feature, id, intent, (t) => REVIEW_CHECKS[id](t))
}
