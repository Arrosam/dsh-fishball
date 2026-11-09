import Schema from '@deepseek-ai/schemastery'
import { validateGrowthBudget } from './constants.js'

/** Final §9 settings, amended by U7/U14/U17/U20 and §2.8. One source for bounds/defaults. */
export const LIMITS = Object.freeze([
  ['maxOutputTokens', 1024, 256, 8192, 'Total deterministic output budget for one turn.'],
  ['contextRolloverTokens', 64_000, 16_000, 200_000, 'Between-turn context rollover threshold.'],
  ['turnGrowthTokens', 10_000, 4_000, 50_000, 'Turn growth headroom; must cover rounded reads, non-read input and output.'],
  ['stallSeconds', 3600, 300, 86_400, 'Default stall interval for a brief.'],
  ['readMaxMessages', 8, 1, 100, 'Maximum messages per read; connector caps still apply.'],
  ['readMaxBytes', 8192, 1024, 1_048_576, 'Maximum serialized bytes per read, including result wrappers.'],
  ['minCheckIntervalSeconds', 60, 60, 86_400, 'Minimum interval between supervision checks.'],
  ['checkTimeoutSeconds', 120, 30, 900, 'Supervision check timeout, not an approval deadline.'],
  ['maxActiveBriefs', 10, 1, 50, 'Maximum briefs not ended.'],
  ['pausedPollSeconds', 30, 10, 300, 'Polling interval for intentional pauses.'],
  ['guardFailures', 3, 1, 10, 'Consecutive failures before handing supervision to Fishball; never a fault-induced stop.'],
  ['guardSeconds', 900, 300, 7200, 'Health threshold without a successful check; hands over rather than halting.'],
  ['maxChecksPerHour', 30, 1, 1000, 'Hourly supervision check cap.'],
  ['maxChecksPerDay', 200, 1, 10_000, 'Daily supervision check cap.'],
  ['maxConcurrentDecisions', 2, 1, 10, 'Concurrent permission decisions across briefs; one per brief.'],
  ['maxQuoteChars', 500, 50, 2048, 'Maximum characters in a card quote.'],
  ['maxCriteria', 20, 1, 100, 'Maximum criteria count.'],
  ['maxCriteriaChars', 8000, 1000, 32_000, 'Maximum criteria characters.'],
  ['auditEntriesKept', 2000, 100, 100_000, 'Non-decision operational audit retention only; never decision history.'],
].map(([field, defaultValue, min, max, description]) => Object.freeze({ field, defaultValue, min, max, description })))

const fields = Schema.object({
  approvalsEnabled: Schema.boolean().default(true).description('Handle permission requests as well as supervision; questions and plan reviews stay with Fishball.'),
  model: Schema.string().default('').description('Provider/model; empty uses the child default model.'),
  reasoningEffort: Schema.string().default('').description('Reasoning effort supported by the selected model.'),
  ...Object.fromEntries(LIMITS.map(({ field, defaultValue, min, max, description }) => [
    field, Schema.natural().min(min).max(max).default(defaultValue).description(description),
  ])),
})

// Validate the whole candidate after field defaults/bounds, using the host's native schema
// resolver (not an apply-only check). Nonvolatile: budgets must change together, on save.
// Model-window validation and persisted-save integration belong to WD-8/WD-12.
export const Config = Schema.transform(fields, validateGrowthBudget, true).default({})
// Preserve the public field schemas for independent field validation and introspection.
Config.dict = fields.dict
