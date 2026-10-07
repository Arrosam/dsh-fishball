import { exact, canonicalDigest, integer } from './runtime-security.mjs';

export class ScheduleError extends Error {
  constructor(code) { super(code); this.name = 'ScheduleError'; this.code = code; }
}
const fail = code => { throw new ScheduleError(code); };
const MINUTE = 60000, DAY = 86400000;
const DATE_LIMIT = 8640000000000000, MARGIN = 26 * 3600000;
function instant(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > DATE_LIMIT - MARGIN) fail('TIME_RANGE_INVALID');
  return value;
}
function formatter(timezone) {
  if (typeof timezone !== 'string' || timezone.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(timezone)) fail('TIMEZONE_INVALID');
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  } catch { fail('TIMEZONE_INVALID'); }
}
function local(format, at) {
  let values;
  try { values = Object.fromEntries(format.formatToParts(at).map(part => [part.type, part.value])); }
  catch { fail('TIME_RANGE_INVALID'); }
  return { date: `${values.year}-${values.month}-${values.day}`, minute: Number(values.hour) * 60 + Number(values.minute),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(values.weekday) };
}

// Every behavior-affecting policy is explicit caller configuration. This pure
// clock proposes due instants; only a guarded ledger transaction may admit work.
export function scheduleSpec(value) {
  const common = ['kind', 'timezone', 'catchUp', 'maxAgeMs', 'maxScanMinutes'];
  exact(value, [...common, 'anchorAt', 'intervalMs', 'minuteOfDay', 'weekdays', 'dstRepeat', 'missingTime'], common);
  formatter(value.timezone);
  if (!['skip', 'coalesce', 'verify'].includes(value.catchUp)) fail('SCHEDULE_INVALID');
  integer(value.maxAgeMs, 0, 365 * DAY); integer(value.maxScanMinutes, 2880, 60000);
  if (value.kind === 'interval') {
    exact(value, [...common, 'anchorAt', 'intervalMs']);
    instant(value.anchorAt); integer(value.intervalMs, MINUTE, 365 * DAY);
  } else if (value.kind === 'daily') {
    exact(value, [...common, 'minuteOfDay', 'weekdays', 'dstRepeat', 'missingTime']);
    integer(value.minuteOfDay, 0, 1439);
    // canonicalDigest validates array descriptors without running accessors.
    canonicalDigest(value.weekdays);
    if (!Array.isArray(value.weekdays) || value.weekdays.length < 1 || value.weekdays.length > 7 ||
        new Set(value.weekdays).size !== value.weekdays.length) fail('SCHEDULE_INVALID');
    for (const day of value.weekdays) integer(day, 0, 6);
    if (!['first', 'both', 'skip'].includes(value.dstRepeat) || value.missingTime !== 'skip') fail('SCHEDULE_INVALID');
  } else fail('SCHEDULE_INVALID');
  const copy = JSON.parse(JSON.stringify(value));
  if (copy.weekdays) Object.freeze(copy.weekdays);
  return Object.freeze(copy);
}

export function dueOccurrences(input, after, through) {
  const spec = scheduleSpec(input); instant(after); instant(through);
  if (through < after) fail('SCHEDULE_INVALID');
  const digest = canonicalDigest(spec), format = formatter(spec.timezone);
  const occurrence = at => Object.freeze({ at, timezone: spec.timezone, localDate: local(format, at).date,
    occurrenceRef: canonicalDigest({ scheduleDigest: digest, at }) });
  if (spec.kind === 'interval') {
    const first = Math.max(0, Math.floor((after - spec.anchorAt) / spec.intervalMs) + 1);
    const last = Math.floor((through - spec.anchorAt) / spec.intervalMs);
    if (last - first + 1 > 128) fail('SCHEDULE_GAP_REQUIRES_REVIEW');
    const output = [];
    for (let n = first; n <= last; n++) output.push(occurrence(spec.anchorAt + n * spec.intervalMs));
    return Object.freeze(output);
  }
  // Scan enough on both sides to identify repeated local times independently
  // of the cursor. Restarting between folds cannot treat the second as first.
  const begin = Math.floor((after - MARGIN) / MINUTE) * MINUTE;
  const end = Math.ceil((through + MARGIN) / MINUTE) * MINUTE;
  if ((end - begin) / MINUTE > spec.maxScanMinutes) fail('SCHEDULE_GAP_REQUIRES_REVIEW');
  const candidates = new Map();
  for (let at = begin; at <= end; at += MINUTE) {
    const view = local(format, at);
    if (view.minute !== spec.minuteOfDay || !spec.weekdays.includes(view.weekday)) continue;
    const matches = candidates.get(view.date) ?? [];
    matches.push(at); candidates.set(view.date, matches);
  }
  const output = [];
  for (const matches of candidates.values()) {
    const chosen = spec.dstRepeat === 'both' ? matches : spec.dstRepeat === 'skip' && matches.length > 1 ? [] : [matches[0]];
    for (const at of chosen) if (at > after && at <= through) output.push(occurrence(at));
  }
  output.sort((a, b) => a.at - b.at);
  if (output.length > 128) fail('SCHEDULE_GAP_REQUIRES_REVIEW');
  return Object.freeze(output);
}

export function missedPlan(input, occurrences, now, options = {}) {
  exact(options, ['externalEffect'], []);
  const externalEffect = options.externalEffect === undefined ? false : options.externalEffect;
  const spec = scheduleSpec(input); instant(now);
  canonicalDigest(occurrences);
  if (!Array.isArray(occurrences) || occurrences.length > 128 || typeof externalEffect !== 'boolean') fail('SCHEDULE_INVALID');
  if (!occurrences.length) return Object.freeze({ state: 'nothing_due', missedCount: 0, due: null });
  const format = formatter(spec.timezone), digest = canonicalDigest(spec), seen = new Set(), verified = [];
  for (const item of occurrences) {
    exact(item, ['at', 'timezone', 'localDate', 'occurrenceRef']); instant(item.at);
    const view = local(format, item.at), expected = canonicalDigest({ scheduleDigest: digest, at: item.at });
    if (item.at > now || item.timezone !== spec.timezone || item.localDate !== view.date || item.occurrenceRef !== expected || seen.has(expected)) fail('OCCURRENCE_INVALID');
    const eligible = spec.kind === 'interval' ? item.at >= spec.anchorAt && (item.at - spec.anchorAt) % spec.intervalMs === 0 :
      item.at > 0 && dueOccurrences(spec, item.at - 1, item.at).some(candidate => candidate.occurrenceRef === expected);
    if (!eligible) fail('OCCURRENCE_INVALID');
    seen.add(expected); verified.push(Object.freeze({ ...item }));
  }
  const newest = verified.sort((a, b) => b.at - a.at)[0];
  if (spec.catchUp === 'skip' || now - newest.at > spec.maxAgeMs) return Object.freeze({ state: 'skipped', missedCount: occurrences.length, due: newest });
  if (externalEffect || spec.catchUp === 'verify') return Object.freeze({ state: 'verification_required', missedCount: occurrences.length, due: newest });
  return Object.freeze({ state: 'coalesced', missedCount: occurrences.length, due: newest });
}

export function quietAt(at, config, emergency = false) {
  exact(config, ['timezone', 'startMinute', 'endMinute', 'emergencyAllowed']);
  const { timezone, startMinute, endMinute, emergencyAllowed } = config;
  instant(at); integer(startMinute, 0, 1439); integer(endMinute, 0, 1439);
  if (typeof emergencyAllowed !== 'boolean' || typeof emergency !== 'boolean') fail('SCHEDULE_INVALID');
  const format = formatter(timezone);
  if (emergency && emergencyAllowed || startMinute === endMinute) return false;
  const minute = local(format, at).minute;
  return startMinute < endMinute ? minute >= startMinute && minute < endMinute : minute >= startMinute || minute < endMinute;
}
