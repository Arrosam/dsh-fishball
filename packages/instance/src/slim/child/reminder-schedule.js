/**
 * Reminder rule arithmetic for the slim child's own scheduler (§15 T10).
 *
 * DSH's `@deepseek-ai/dsh-schedule` Service cannot mount in a base-only child: 0.2.1-rc.3/rc.5
 * hard-inject `sessionController`, a Web-bundle service, and the Service's own API changed
 * between rc.3/rc.5 (`list`/`update`/`delete`) and 0.2.2-rc.1 (`list`/`view`/`edit`). The child
 * therefore owns its tasks (reminders.js) and repeats the schedule tool's timing here, in plain
 * JavaScript with no build step (§2.1, Q10): one-shot `after`/`at`, fixed-rate `every`,
 * wall-clock `daily`/`weekly`, and five-field `cron`.
 *
 * A wall-clock rule is interpreted in its explicit IANA zone with the schedule tool's documented
 * rules: a local time that does not exist (a spring-forward gap) skips that date, and a repeated
 * local time (a fall-back overlap) fires once at the earlier instant. Every function takes the
 * wall clock as an argument, so this module holds no timer and stays pure.
 *
 * The record shape matches the schedule service's durable record (`kind` plus the timing fields
 * that kind selects) so `reminders.js` can store it as-is and the T10 view model keeps the same
 * fields the slim UI already reads.
 */

/** The timing discriminants; every stored record carries exactly one. */
export const KIND = Object.freeze({
  after: 'after',
  at: 'at',
  every: 'every',
  daily: 'daily',
  weekly: 'weekly',
  cron: 'cron',
})

/** Kinds that repeat; the other two deliver once and end. */
const RECURRING = Object.freeze([KIND.every, KIND.daily, KIND.weekly, KIND.cron])

/** Stable typed codes; the API maps them to 400 and the tools return them unchanged. */
export const RULE_ERROR = Object.freeze({
  prompt: 'invalid_prompt',
  selector: 'invalid_selector',
  rule: 'invalid_rule',
  timeZone: 'invalid_time_zone',
  notFuture: 'not_future',
  timeRange: 'time_out_of_range',
  frequency: 'frequency_too_high',
})

/**
 * Every boundary this module enforces. The title and interval bounds are the schedule tool's
 * published limits; the search horizons mirror its "a rule either matches inside the calendar's
 * repeat window or never matches" bound (400 proleptic Gregorian years).
 */
const LIMIT = Object.freeze({
  titleChars: 120,
  minEverySeconds: 60,
  wallClockSearchDays: 16,
  cronHorizonYears: 400,
  daysPerYear: 366,
  dayMs: 86_400_000,
  secondMs: 1_000,
  offsetProbeMs: 172_800_000,
  millisecondDigits: 3,
})

/** The schedule tool's published title bound, also stated in the model-facing description. */
export const TITLE_MAX_CHARS = LIMIT.titleChars

/** The schedule tool's published minimum fixed-rate interval, also stated in its description. */
export const MIN_EVERY_SECONDS = LIMIT.minEverySeconds

/** The four-digit-year UTC range a stored target must stay inside. */
const RANGE = Object.freeze({
  min: utcTime({ year: 1, month: 1, day: 1 }),
  max: utcTime({ year: 9999, month: 12, day: 31, hour: 23, minute: 59, second: 59, millisecond: 999 }),
})

/** Clock and calendar bounds a selector may name. */
const CLOCK = Object.freeze({ hoursPerDay: 24, minutesPerHour: 60, secondsPerMinute: 60, weekdaysPerWeek: 7 })

const MESSAGE = Object.freeze({
  title: 'title is required and must be non-empty after trimming.',
  titleLength: `title must be at most ${LIMIT.titleChars} characters.`,
  prompt: 'prompt must be non-empty after trimming.',
  selector: 'exactly one timing selector is allowed.',
  afterSeconds: 'after_seconds must be a positive whole number of seconds.',
  everySeconds: `every_seconds must be a whole number of seconds, at least ${LIMIT.minEverySeconds}.`,
  time: 'time must be HH:mm:ss with optional 1-3 fractional digits.',
  timeZone: 'time_zone must be UTC or an IANA Area/Location name.',
  weekdays: 'weekdays must be a non-empty set of ISO weekdays from 1 (Monday) through 7 (Sunday).',
  at: 'at must be an RFC 3339 instant with an offset, or a local date, time and time_zone.',
  atGap: 'at names a local time that does not exist in that zone.',
  notFuture: 'the target must be in the future.',
  cron: 'cron.expression must contain exactly five whitespace-separated fields: minute hour day-of-month month day-of-week.',
  cronField: 'a cron field is malformed or outside its range.',
  outOfRange: 'no future occurrence is representable for this rule.',
})

/** The timing fields one stored record carries, in the order the schedule view lists them. */
export const TIMING_FIELDS = Object.freeze({
  [KIND.after]: Object.freeze(['afterSeconds']),
  [KIND.at]: Object.freeze([]),
  [KIND.every]: Object.freeze(['everySeconds']),
  [KIND.daily]: Object.freeze(['time', 'timeZone']),
  [KIND.weekly]: Object.freeze(['time', 'timeZone', 'weekdays']),
  [KIND.cron]: Object.freeze(['expression', 'timeZone']),
})

/** A typed rule refusal; reminders.js answers 400 and the agent tools return `{code, message}`. */
export class ScheduleRuleError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ScheduleRuleError'
    this.code = code
  }
}

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
const fail = (code, message) => { throw new ScheduleRuleError(code, message) }

/** Build a UTC instant without Date.UTC's 1900 offset for years below 100. */
function utcTime(parts) {
  const date = new Date(Date.UTC(2000, parts.month - 1, parts.day, parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0, parts.millisecond ?? 0))
  date.setUTCFullYear(parts.year)
  return date.getTime()
}

/** The plain calendar date parts of one UTC instant. */
function utcDate(instant) {
  const date = new Date(instant)
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

/** ISO weekday, Monday 1 through Sunday 7, of one plain date. */
function weekdayOf(date) {
  return ((new Date(utcTime(date)).getUTCDay() + 6) % 7) + 1
}

/** Shift a plain date by whole days without leaving the Gregorian calendar. */
function shiftDate(date, days) {
  return utcDate(utcTime({ ...date, hour: 12 }) + days * LIMIT.dayMs)
}

/** One comparable integer per plain date. */
const dateKey = (date) => date.year * 10_000 + date.month * 100 + date.day

const ZONE_FORMATTERS = new Map()

/**
 * The Intl formatter of one zone. Intl owns the zone database; an unknown zone throws RangeError,
 * which is the only validation a zone name needs here.
 */
function formatterFor(zone) {
  let formatter = ZONE_FORMATTERS.get(zone)
  if (formatter === undefined) {
    try {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: LIMIT.millisecondDigits,
      })
    } catch {
      fail(RULE_ERROR.timeZone, MESSAGE.timeZone)
    }
    ZONE_FORMATTERS.set(zone, formatter)
  }
  return formatter
}

/** One instant's wall-clock parts in a zone. */
function localParts(instant, zone) {
  const parts = {}
  for (const part of formatterFor(zone).formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = part.value
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Some ICU builds render midnight as 24 even under h23; both name the same local instant.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    millisecond: Number(parts.fractionalSecond ?? 0),
  }
}

/** The zone's offset from UTC at one instant, in milliseconds. */
function zoneOffset(instant, zone) {
  const parts = localParts(instant, zone)
  return utcTime(parts) - instant
}

function sameLocal(instant, target, zone) {
  const parts = localParts(instant, zone)
  return parts.year === target.year && parts.month === target.month && parts.day === target.day
    && parts.hour === target.hour && parts.minute === target.minute
    && parts.second === target.second && parts.millisecond === target.millisecond
}

/**
 * The UTC instant of one local wall-clock time in a zone, or undefined when that local time does
 * not exist (a spring-forward gap). An overlap yields the earlier instant: probing both sides of
 * the transition finds every candidate the zone maps to the requested wall clock.
 */
function instantOfLocal(target, zone) {
  const guess = utcTime(target)
  const offsets = new Set()
  for (const probe of [guess - LIMIT.offsetProbeMs, guess, guess + LIMIT.offsetProbeMs]) offsets.add(zoneOffset(probe, zone))
  const candidates = []
  for (const offset of offsets) {
    const candidate = guess - offset
    if (!candidates.includes(candidate) && sameLocal(candidate, target, zone)) candidates.push(candidate)
  }
  return candidates.length === 0 ? undefined : Math.min(...candidates)
}

/** The plain local date of one instant. */
const localDate = (instant, zone) => {
  const parts = localParts(instant, zone)
  return { year: parts.year, month: parts.month, day: parts.day }
}

const iso = (instant) => new Date(instant).toISOString()

function assertInstant(instant) {
  if (!Number.isFinite(instant) || instant < RANGE.min || instant > RANGE.max) fail(RULE_ERROR.timeRange, MESSAGE.outOfRange)
  return instant
}

/** Validate and trim a task name. */
export function normalizeTitle(value) {
  if (typeof value !== 'string' || value.trim() === '') fail(RULE_ERROR.prompt, MESSAGE.title)
  const title = value.trim()
  if (title.length > LIMIT.titleChars) fail(RULE_ERROR.prompt, MESSAGE.titleLength)
  return title
}

/** Validate and trim a reminder prompt. */
export function normalizePrompt(value) {
  if (typeof value !== 'string' || value.trim() === '') fail(RULE_ERROR.prompt, MESSAGE.prompt)
  return value.trim()
}

const TIME_TEXT = /^(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/

/** Parse and normalize one local clock time to HH:mm:ss.SSS. */
function normalizeTime(value) {
  const match = typeof value === 'string' ? TIME_TEXT.exec(value) : null
  if (match === null) fail(RULE_ERROR.rule, MESSAGE.time)
  const hour = Number(match[1])
  const minute = Number(match[2])
  const second = Number(match[3])
  if (hour >= CLOCK.hoursPerDay || minute >= CLOCK.minutesPerHour || second >= CLOCK.secondsPerMinute) fail(RULE_ERROR.rule, MESSAGE.time)
  const millisecond = match[4] === undefined ? 0 : Number(match[4].padEnd(LIMIT.millisecondDigits, '0'))
  const pad = (value) => String(value).padStart(2, '0')
  return {
    hour,
    minute,
    second,
    millisecond,
    text: `${pad(hour)}:${pad(minute)}:${pad(second)}.${String(millisecond).padStart(LIMIT.millisecondDigits, '0')}`,
  }
}

/** Validate a UTC or IANA zone name; the stored spelling is kept so a view reads it back. */
function normalizeZone(value) {
  if (typeof value !== 'string' || value === '' || value.trim() !== value) fail(RULE_ERROR.timeZone, MESSAGE.timeZone)
  formatterFor(value)
  return value
}

/** Validate the explicit ISO weekday set of a weekly rule. */
function normalizeWeekdays(value) {
  if (!Array.isArray(value) || value.length === 0) fail(RULE_ERROR.rule, MESSAGE.weekdays)
  const days = new Set()
  for (const day of value) {
    if (!Number.isInteger(day) || day < 1 || day > CLOCK.weekdaysPerWeek) fail(RULE_ERROR.rule, MESSAGE.weekdays)
    days.add(day)
  }
  return Object.freeze([...days].sort((left, right) => left - right))
}

const INTEGER_TEXT = /^(?:0|[1-9]\d*)$/
/** Cron fields tolerate leading zeros ("05"), unlike the API's canonical integer query values. */
const CRON_NUMBER = /^\d+$/
const AT_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/
const DATE_TEXT = /^(\d{4})-(\d{2})-(\d{2})$/

function integerOf(value, code, message) {
  if (!Number.isSafeInteger(value) || value < 0) fail(code, message)
  return value
}

/** Parse one strict ISO calendar date. */
function dateOfText(value) {
  const match = typeof value === 'string' ? DATE_TEXT.exec(value) : null
  if (match === null) return undefined
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
  const roundTrip = utcDate(utcTime({ ...date, hour: 12 }))
  return dateKey(roundTrip) === dateKey(date) ? date : undefined
}

/** Resolve an absolute selector to one instant, requiring an explicit offset or zone. */
function instantOfAt(value, now) {
  let instant
  if (typeof value === 'string') {
    if (!AT_INSTANT.test(value)) fail(RULE_ERROR.rule, MESSAGE.at)
    instant = Date.parse(value)
  } else if (isRecord(value)) {
    const keys = Object.keys(value)
    if (keys.length !== 3 || keys.some((key) => key !== 'date' && key !== 'time' && key !== 'timeZone')) fail(RULE_ERROR.rule, MESSAGE.at)
    const date = dateOfText(value.date)
    if (date === undefined) fail(RULE_ERROR.rule, MESSAGE.at)
    const time = normalizeTime(value.time)
    const zone = normalizeZone(value.timeZone)
    instant = instantOfLocal({ ...date, ...time }, zone)
    if (instant === undefined) fail(RULE_ERROR.rule, MESSAGE.atGap)
  } else {
    fail(RULE_ERROR.rule, MESSAGE.at)
  }
  assertInstant(instant)
  if (instant <= now) fail(RULE_ERROR.notFuture, MESSAGE.notFuture)
  return instant
}

/**
 * One normalized timing selector. The caller supplies the discriminant and that kind's fields;
 * every value is validated here, so a stored or updated rule is always complete.
 */
function timingOf(value) {
  if (!isRecord(value)) fail(RULE_ERROR.selector, MESSAGE.selector)
  switch (value.kind) {
    case KIND.after: {
      const afterSeconds = integerOf(value.afterSeconds, RULE_ERROR.rule, MESSAGE.afterSeconds)
      if (afterSeconds < 1) fail(RULE_ERROR.rule, MESSAGE.afterSeconds)
      return Object.freeze({ kind: KIND.after, afterSeconds })
    }
    case KIND.at:
      return Object.freeze({ kind: KIND.at, at: value.at })
    case KIND.every: {
      const everySeconds = integerOf(value.everySeconds, RULE_ERROR.rule, MESSAGE.everySeconds)
      if (everySeconds < LIMIT.minEverySeconds) fail(RULE_ERROR.frequency, MESSAGE.everySeconds)
      return Object.freeze({ kind: KIND.every, everySeconds })
    }
    case KIND.daily: {
      const time = normalizeTime(value.time)
      return Object.freeze({ kind: KIND.daily, time, timeZone: normalizeZone(value.timeZone) })
    }
    case KIND.weekly:
      return Object.freeze({
        kind: KIND.weekly,
        time: normalizeTime(value.time),
        timeZone: normalizeZone(value.timeZone),
        weekdays: normalizeWeekdays(value.weekdays),
      })
    case KIND.cron: {
      if (typeof value.expression !== 'string') fail(RULE_ERROR.rule, MESSAGE.cron)
      return Object.freeze({ kind: KIND.cron, expression: parseCronExpression(value.expression).expression, timeZone: normalizeZone(value.timeZone) })
    }
    default:
      return fail(RULE_ERROR.selector, MESSAGE.selector)
  }
}

/** Whether a stored record's kind repeats. */
export const isRecurring = (kind) => RECURRING.includes(kind)

/** The normalized selector of one stored record; it re-arms a paused recurring task. */
export function timingOfRecord(record) {
  switch (record.kind) {
    case KIND.after: return Object.freeze({ kind: KIND.after, afterSeconds: record.afterSeconds })
    case KIND.at: return Object.freeze({ kind: KIND.at, at: record.scheduledAt })
    case KIND.every: return Object.freeze({ kind: KIND.every, everySeconds: record.everySeconds })
    case KIND.daily: return Object.freeze({ kind: KIND.daily, time: record.time, timeZone: record.timeZone })
    case KIND.weekly: return Object.freeze({ kind: KIND.weekly, time: record.time, timeZone: record.timeZone, weekdays: record.weekdays })
    case KIND.cron: return Object.freeze({ kind: KIND.cron, expression: record.expression, timeZone: record.timeZone })
    default: return fail(RULE_ERROR.rule, MESSAGE.selector)
  }
}

/**
 * Validate one rule and compute its next strictly future target.
 *
 * @param {{ id: string, title: string, prompt: string, timing: object, now: number }} input
 * @returns {object} the frozen durable record this scheduler stores.
 */
export function recordFor(input) {
  const { id, title, prompt, timing, now } = input ?? {}
  if (typeof id !== 'string' || id === '') throw new TypeError('fishball-native-reminders: a reminder id is required')
  if (!Number.isSafeInteger(now)) throw new TypeError('fishball-native-reminders: now must be epoch milliseconds')
  const rule = timingOf(timing)
  const record = {
    id,
    kind: rule.kind,
    title: normalizeTitle(title),
    prompt: normalizePrompt(prompt),
    scheduledAt: iso(targetOf(rule, now)),
  }
  if (rule.kind === KIND.after) record.afterSeconds = rule.afterSeconds
  if (rule.kind === KIND.every) record.everySeconds = rule.everySeconds
  if (rule.kind === KIND.daily || rule.kind === KIND.weekly) {
    record.time = rule.time.text
    record.timeZone = rule.timeZone
  }
  if (rule.kind === KIND.weekly) record.weekdays = rule.weekdays
  if (rule.kind === KIND.cron) {
    record.expression = rule.expression
    record.timeZone = rule.timeZone
  }
  return Object.freeze(record)
}

/** The first target of one rule, strictly after `now`. */
function targetOf(rule, now) {
  switch (rule.kind) {
    case KIND.after:
      return assertInstant(now + rule.afterSeconds * LIMIT.secondMs)
    case KIND.at:
      return instantOfAt(rule.at, now)
    case KIND.every:
      return assertInstant(now + rule.everySeconds * LIMIT.secondMs)
    case KIND.daily: {
      const target = nextDailyOccurrence(rule.time, rule.timeZone, now)
      return assertInstant(target)
    }
    case KIND.weekly: {
      const target = nextWeeklyOccurrence(rule.time, rule.timeZone, rule.weekdays, now)
      return assertInstant(target)
    }
    case KIND.cron: {
      const target = nextCronOccurrence(parseCronExpression(rule.expression), rule.timeZone, now)
      if (target === undefined) fail(RULE_ERROR.timeRange, MESSAGE.outOfRange)
      return assertInstant(target)
    }
    default:
      return fail(RULE_ERROR.selector, MESSAGE.selector)
  }
}

/** The first occurrence strictly after `now`; a gap skips its date. */
function nextWallClockOccurrence(time, zone, now, accepts) {
  const start = localDate(now, zone)
  for (let offset = 0; offset <= LIMIT.wallClockSearchDays; offset += 1) {
    const date = shiftDate(start, offset)
    if (!accepts(date)) continue
    const candidate = instantOfLocal({ ...date, ...time }, zone)
    if (candidate !== undefined && candidate > now) return candidate
  }
  return undefined
}

/** The latest occurrence at or before `now`, never before the committed floor. */
function latestWallClockOccurrence(time, zone, now, floor, accepts) {
  const start = localDate(now, zone)
  for (let offset = 0; offset <= LIMIT.wallClockSearchDays; offset += 1) {
    const date = shiftDate(start, -offset)
    if (!accepts(date)) continue
    const candidate = instantOfLocal({ ...date, ...time }, zone)
    if (candidate !== undefined && candidate <= now) return Math.max(candidate, floor)
  }
  return floor
}

const everyDate = () => true
const weekdayOfDate = (weekdays) => (date) => weekdays.includes(weekdayOf(date))

/** The first daily occurrence strictly after `now`; a gap skips its date. */
function nextDailyOccurrence(time, zone, now) {
  return nextWallClockOccurrence(time, zone, now, everyDate) ?? fail(RULE_ERROR.timeRange, MESSAGE.outOfRange)
}

/** The first weekly occurrence on a selected weekday strictly after `now`. */
function nextWeeklyOccurrence(time, zone, weekdays, now) {
  return nextWallClockOccurrence(time, zone, now, weekdayOfDate(weekdays)) ?? fail(RULE_ERROR.timeRange, MESSAGE.outOfRange)
}

/** One daily/weekly decision: the latest missed occurrence and the next future target. */
function wallClockAdvance(time, zone, now, floor, accepts) {
  const occurrence = latestWallClockOccurrence(time, zone, now, floor, accepts)
  const next = nextWallClockOccurrence(time, zone, now, accepts)
  return Object.freeze(next === undefined
    ? { occurrenceAt: iso(occurrence) }
    : { occurrenceAt: iso(occurrence), nextScheduledAt: iso(next) })
}

/**
 * Resolve one due recurring record to its latest missed occurrence and its next future target.
 * A task after downtime therefore delivers once, for the occurrence the user most recently
 * missed, and keeps the same cadence afterwards.
 *
 * @param {object} record - the stored recurring record.
 * @param {number} now - decision time in epoch milliseconds, at or after `scheduledAt`.
 * @returns {{ occurrenceAt: string, nextScheduledAt?: string }}
 */
export function advance(record, now) {
  if (!isRecord(record) || typeof record.kind !== 'string') throw new TypeError('fishball-native-reminders: a stored reminder record is required')
  if (!Number.isSafeInteger(now)) throw new TypeError('fishball-native-reminders: now must be epoch milliseconds')
  const floor = Date.parse(record.scheduledAt)
  switch (record.kind) {
    case KIND.after:
    case KIND.at:
      return Object.freeze({ occurrenceAt: record.scheduledAt })
    case KIND.every: {
      const interval = record.everySeconds * LIMIT.secondMs
      const ticks = Math.max(0, Math.floor((now - floor) / interval))
      const occurrence = floor + ticks * interval
      const next = occurrence + interval
      return Object.freeze(next > RANGE.max
        ? { occurrenceAt: iso(occurrence) }
        : { occurrenceAt: iso(occurrence), nextScheduledAt: iso(next) })
    }
    case KIND.daily:
      return wallClockAdvance(normalizeTime(record.time), record.timeZone, now, floor, everyDate)
    case KIND.weekly:
      return wallClockAdvance(normalizeTime(record.time), record.timeZone, now, floor, weekdayOfDate(normalizeWeekdays(record.weekdays)))
    case KIND.cron: {
      const parsed = parseCronExpression(record.expression)
      const occurrence = latestCronOccurrence(parsed, record.timeZone, now, floor)
      const next = nextCronOccurrence(parsed, record.timeZone, now)
      return Object.freeze(next === undefined
        ? { occurrenceAt: iso(occurrence) }
        : { occurrenceAt: iso(occurrence), nextScheduledAt: iso(next) })
    }
    default:
      return fail(RULE_ERROR.rule, MESSAGE.selector)
  }
}

/**
 * Decode one stored record at the durable boundary. Unknown extra fields are dropped; a record
 * that cannot be interpreted is undefined, so one damaged row never stops the others loading.
 */
export function decodeRecord(value) {
  try {
    if (!isRecord(value) || !Object.hasOwn(TIMING_FIELDS, value.kind)) return undefined
    if (typeof value.id !== 'string' || value.id === '') return undefined
    if (typeof value.title !== 'string' || value.title === '' || value.title.trim() !== value.title) return undefined
    if (typeof value.prompt !== 'string' || value.prompt === '' || value.prompt.trim() !== value.prompt) return undefined
    if (typeof value.scheduledAt !== 'string' || !Number.isFinite(Date.parse(value.scheduledAt))) return undefined
    const record = { id: value.id, kind: value.kind, title: value.title, prompt: value.prompt, scheduledAt: value.scheduledAt }
    if (value.kind === KIND.after) {
      record.afterSeconds = integerOf(value.afterSeconds, RULE_ERROR.rule, MESSAGE.afterSeconds)
      if (record.afterSeconds < 1) return undefined
    }
    if (value.kind === KIND.every) {
      record.everySeconds = integerOf(value.everySeconds, RULE_ERROR.rule, MESSAGE.everySeconds)
      if (record.everySeconds < LIMIT.minEverySeconds) return undefined
    }
    if (value.kind === KIND.daily || value.kind === KIND.weekly) {
      record.time = normalizeTime(value.time).text
      record.timeZone = normalizeZone(value.timeZone)
    }
    if (value.kind === KIND.weekly) record.weekdays = normalizeWeekdays(value.weekdays)
    if (value.kind === KIND.cron) {
      record.expression = parseCronExpression(value.expression).expression
      record.timeZone = normalizeZone(value.timeZone)
    }
    return Object.freeze(record)
  } catch {
    return undefined
  }
}

// ── five-field Vixie cron ──────────────────────────────────────────────────────────────────────

/** Minute 0-59, hour 0-23, day-of-month 1-31, month 1-12, day-of-week 0-7 (0 and 7 are Sunday). */
const CRON_FIELDS = Object.freeze([
  Object.freeze({ name: 'minute', min: 0, max: 59 }),
  Object.freeze({ name: 'hour', min: 0, max: 23 }),
  Object.freeze({ name: 'day-of-month', min: 1, max: 31 }),
  Object.freeze({ name: 'month', min: 1, max: 12 }),
  Object.freeze({ name: 'day-of-week', min: 0, max: 7 }),
])

const CRON_TEXT = /^[0-9*,\/-]+$/

/** Every matched value of one cron field, with Vixie's leading-star flag preserved. */
function parseCronField(raw, spec) {
  if (!CRON_TEXT.test(raw)) fail(RULE_ERROR.rule, MESSAGE.cronField)
  const values = new Set()
  for (const part of raw.split(',')) {
    const pieces = part.split('/')
    if (pieces.length > 2) fail(RULE_ERROR.rule, MESSAGE.cronField)
    const [base, stepText] = pieces
    const step = stepText === undefined ? 1 : (CRON_NUMBER.test(stepText) ? Number(stepText) : Number.NaN)
    if (!Number.isSafeInteger(step) || step < 1) fail(RULE_ERROR.rule, MESSAGE.cronField)
    let start
    let end
    if (base === '*') {
      start = spec.min
      end = spec.max
    } else if (base.includes('-')) {
      const bounds = base.split('-')
      if (bounds.length !== 2 || !CRON_NUMBER.test(bounds[0]) || !CRON_NUMBER.test(bounds[1])) fail(RULE_ERROR.rule, MESSAGE.cronField)
      start = Number(bounds[0])
      end = Number(bounds[1])
    } else {
      if (!CRON_NUMBER.test(base)) fail(RULE_ERROR.rule, MESSAGE.cronField)
      start = Number(base)
      end = start
    }
    if (start < spec.min || end > spec.max || start > end) fail(RULE_ERROR.rule, MESSAGE.cronField)
    for (let value = start; value <= end; value += step) values.add(value)
  }
  if (values.size === 0) fail(RULE_ERROR.rule, MESSAGE.cronField)
  const star = raw.startsWith('*')
  if (spec.name === 'day-of-week') {
    const normalized = new Set([...values].map((value) => value % 7))
    return Object.freeze({ values: Object.freeze([...normalized].sort((left, right) => left - right)), star })
  }
  return Object.freeze({ values: Object.freeze([...values].sort((left, right) => left - right)), star })
}

/** Parse and validate one five-field expression; no per-run canonical rewriting is needed. */
function parseCronExpression(expression) {
  if (typeof expression !== 'string' || expression === '' || expression.trim() !== expression) fail(RULE_ERROR.rule, MESSAGE.cron)
  const fields = expression.split(/\s+/)
  if (fields.length !== 5) fail(RULE_ERROR.rule, MESSAGE.cron)
  const parsed = fields.map((field, index) => parseCronField(field, CRON_FIELDS[index]))
  const times = []
  for (const hour of parsed[1].values) for (const minute of parsed[0].values) times.push(Object.freeze({ hour, minute }))
  return Object.freeze({
    expression: fields.join(' '),
    minutes: parsed[0].values,
    hours: parsed[1].values,
    daysOfMonth: parsed[2].values,
    months: parsed[3].values,
    daysOfWeek: parsed[4].values,
    dayOfMonthStar: parsed[2].star,
    dayOfWeekStar: parsed[4].star,
    times: Object.freeze(times.sort((left, right) => left.hour - right.hour || left.minute - right.minute)),
  })
}

/**
 * Vixie's day rule: a bare star makes the other field decide, two stepped/restricted fields
 * match either one, and a star-led stepped field still restricts its own values.
 */
function cronDateMatches(parsed, date) {
  if (!parsed.months.includes(date.month)) return false
  const dayOfMonth = parsed.daysOfMonth.includes(date.day)
  const dayOfWeek = parsed.daysOfWeek.includes(weekdayOf(date) % 7)
  // A bare star always matches, so the AND below degrades to the other field exactly as Vixie's
  // DOM_STAR/DOW_STAR test does; a stepped star still restricts its own values.
  if (parsed.dayOfMonthStar || parsed.dayOfWeekStar) return dayOfMonth && dayOfWeek
  return dayOfMonth || dayOfWeek
}

/** The first cron occurrence strictly after the floor. */
function nextCronOccurrence(parsed, zone, floor) {
  let date = localDate(floor, zone)
  const horizon = dateKey(shiftDate(date, LIMIT.cronHorizonYears * LIMIT.daysPerYear))
  while (dateKey(date) <= horizon) {
    if (!parsed.months.includes(date.month)) {
      date = date.month === 12 ? { year: date.year + 1, month: 1, day: 1 } : { year: date.year, month: date.month + 1, day: 1 }
      continue
    }
    if (cronDateMatches(parsed, date)) {
      for (const time of parsed.times) {
        const candidate = instantOfLocal({ ...date, hour: time.hour, minute: time.minute, second: 0, millisecond: 0 }, zone)
        if (candidate !== undefined && candidate > floor) return candidate
      }
    }
    date = shiftDate(date, 1)
  }
  return undefined
}

/** The latest cron occurrence at or before `now`, never before the committed floor. */
function latestCronOccurrence(parsed, zone, now, floor) {
  let date = localDate(now, zone)
  const floorDate = localDate(floor, zone)
  const horizon = dateKey(shiftDate(date, -LIMIT.cronHorizonYears * LIMIT.daysPerYear))
  while (dateKey(date) >= dateKey(floorDate) && dateKey(date) >= horizon) {
    if (!parsed.months.includes(date.month)) {
      date = shiftDate({ year: date.year, month: date.month, day: 1 }, -1)
      continue
    }
    if (cronDateMatches(parsed, date)) {
      for (let index = parsed.times.length - 1; index >= 0; index -= 1) {
        const time = parsed.times[index]
        const candidate = instantOfLocal({ ...date, hour: time.hour, minute: time.minute, second: 0, millisecond: 0 }, zone)
        if (candidate !== undefined && candidate <= now) return Math.max(candidate, floor)
      }
    }
    date = shiftDate(date, -1)
  }
  return floor
}
