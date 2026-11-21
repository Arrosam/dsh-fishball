import Schema from '@deepseek-ai/schemastery'
import { TIME } from './constants.js'

// The largest delay setTimeout accepts (2^31 − 1 ms), in whole seconds; a longer one fires at once.
const MAX_TIMER_SECONDS = Math.floor((2 ** 31 - 1) / TIME.millisecondsPerSecond)

/**
 * The user's two settings. Neither has a default: the heartbeat is off until the user sets both
 * (the user's requirement), so an unset field is the off state, not a value to invent. They live
 * only in this row's config, which Fishball's tools cannot write.
 *
 * Each is `.volatile()`: DSH's settings service serves and writes only volatile fields, so this is
 * what puts them on the row's settings page. index.js reads a plain snapshot at apply and re-applies
 * on a live change (src/live-settings.js), so `enabled` and the timer still see numbers.
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
})

export const Config = Schema.object({
  intervalSeconds: Schema.natural().min(SETTINGS.intervalSeconds.min).max(SETTINGS.intervalSeconds.max)
    .description(SETTINGS.intervalSeconds.description).volatile(),
  maxConsecutive: Schema.natural().min(SETTINGS.maxConsecutive.min).description(SETTINGS.maxConsecutive.description).volatile(),
})

/** Both settings present (the schema has already bounded them). */
export const enabled = config => Number.isSafeInteger(config?.intervalSeconds) && Number.isSafeInteger(config?.maxConsecutive)
