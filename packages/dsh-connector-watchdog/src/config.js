/**
 * Watchdog's settings. `minCheckIntervalSeconds` is the notes' row (§3: default 1740, inclusive
 * 60–86400; one timer per supervised session, a refine never moves it). The read and judgement
 * bounds are the withdrawn Fishball design's rows (fishball-watchdog src/config.js: readMaxMessages,
 * readMaxBytes, checkTimeoutSeconds), kept as they were.
 *
 * Every field is `.volatile()`: DSH's settings service serves and writes only volatile fields, so
 * this is what puts them on the row's settings page. index.js reads a plain snapshot at apply and
 * re-applies on a live change (dsh-connector-shared/live-settings), so the core still sees numbers.
 */
import Schema from '@deepseek-ai/schemastery'

export const LIMITS = Object.freeze([
  ['minCheckIntervalSeconds', 1740, 60, 86_400, 'Seconds between two patrol checks of one supervised session.'],
  ['readMaxMessages', 8, 1, 100, 'Most new messages one judgement reads; the connector\'s caps still apply.'],
  ['readMaxBytes', 8192, 1024, 1_048_576, 'Most UTF-8 bytes of new messages one judgement reads.'],
  ['checkTimeoutSeconds', 120, 30, 900, 'How long one judgement may take; a late one passes the request to the manager.'],
].map(([field, defaultValue, min, max, description]) => Object.freeze({ field, defaultValue, min, max, description })))

export const Config = Schema.object(Object.fromEntries(LIMITS.map(({ field, defaultValue, min, max, description }) => [
  field, Schema.natural().min(min).max(max).default(defaultValue).description(description).volatile(),
])))
