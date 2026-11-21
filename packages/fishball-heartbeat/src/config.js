import Schema from '@deepseek-ai/schemastery'
import { TIME } from './constants.js'

// The largest delay setTimeout accepts (2^31 − 1 ms), in whole seconds; a longer one fires at once.
const MAX_TIMER_SECONDS = Math.floor((2 ** 31 - 1) / TIME.millisecondsPerSecond)

/**
 * The user's settings. They live only in this row's config, which Fishball's tools cannot write.
 * The two timer settings have no default: the heartbeat is off until the user sets both (the
 * user's requirement), so an unset field is the off state, not a value to invent. The compaction
 * threshold has one (the user's requirement, 2026-11-21: 256K) and plays no part in on/off.
 */
const SETTINGS = Object.freeze({
  intervalSeconds: Object.freeze({
    min: 1,
    max: MAX_TIMER_SECONDS,
    description: 'Seconds without any Fishball turn before a heartbeat turn is sent. Set it below your model\'s cache lifetime. Leave empty to turn heartbeats off.',
  }),
  maxConsecutive: Object.freeze({
    min: 1,
    description: 'Heartbeat turns allowed in a row with no other turn between them; after that the cache is left to cool until the next real turn. Leave empty to turn heartbeats off.',
  }),
  compactThresholdTokens: Object.freeze({
    // 256K in DSH's own reading of K: its model settings parse "256K" as 256 × 1000
    // (dsh-client-ui-settings-models CAPACITY_SCALE), and model windows are quoted the same way.
    default: 256_000,
    description: 'When heartbeats stop and the cache is left to cool, Fishball\'s context is compacted once first if it is longer than this many tokens.',
  }),
})

export const Config = Schema.object({
  intervalSeconds: Schema.natural().min(SETTINGS.intervalSeconds.min).max(SETTINGS.intervalSeconds.max)
    .description(SETTINGS.intervalSeconds.description),
  maxConsecutive: Schema.natural().min(SETTINGS.maxConsecutive.min).description(SETTINGS.maxConsecutive.description),
  compactThresholdTokens: Schema.natural().default(SETTINGS.compactThresholdTokens.default)
    .description(SETTINGS.compactThresholdTokens.description),
})

/** Both timer settings present (the schema has already bounded them); the threshold never decides this. */
export const enabled = config => Number.isSafeInteger(config?.intervalSeconds) && Number.isSafeInteger(config?.maxConsecutive)
