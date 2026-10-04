import test from 'node:test';
import assert from 'node:assert/strict';
import { dueOccurrences, missedPlan, quietAt, scheduleSpec } from '../src/event-clock.mjs';

const interval = { kind: 'interval', timezone: 'Etc/UTC', anchorAt: 0, intervalMs: 3600000, catchUp: 'coalesce', maxAgeMs: 86400000, maxScanMinutes: 60000 };
const daily = { kind: 'daily', timezone: 'America/New_York', minuteOfDay: 90, weekdays: [0, 1, 2, 3, 4, 5, 6], dstRepeat: 'first', missingTime: 'skip', catchUp: 'coalesce', maxAgeMs: 86400000, maxScanMinutes: 60000 };
const date = value => Date.parse(value);

test('interval cursor uses exact due boundaries and bounded long gaps require review', () => {
  const items = dueOccurrences(interval, 3600000, 10800000);
  assert.deepEqual(items.map(item => item.at), [7200000, 10800000]);
  assert.equal(new Set(items.map(item => item.occurrenceRef)).size, 2);
  assert.equal(dueOccurrences(interval, 0, 3599999).length, 0);
  assert.throws(() => dueOccurrences(interval, 0, 129 * 3600000), { code: 'SCHEDULE_GAP_REQUIRES_REVIEW' });
});

test('daily DST repeated-time policy survives restart cursor between folds', () => {
  const start = date('2026-11-01T04:00:00Z'), end = date('2026-11-01T08:00:00Z');
  const both = dueOccurrences({ ...daily, dstRepeat: 'both' }, start, end);
  assert.deepEqual(both.map(item => new Date(item.at).toISOString()), ['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z']);
  assert.equal(dueOccurrences(daily, start, end).length, 1);
  assert.equal(dueOccurrences(daily, both[0].at, end).length, 0);
  assert.equal(dueOccurrences({ ...daily, dstRepeat: 'skip' }, start, end).length, 0);
});

test('daily missing local time skips deterministically and midnight follows owner timezone', () => {
  assert.equal(dueOccurrences({ ...daily, minuteOfDay: 150 }, date('2026-03-08T04:00:00Z'), date('2026-03-08T09:00:00Z')).length, 0);
  const midnight = { ...daily, timezone: 'Asia/Shanghai', minuteOfDay: 0 };
  const items = dueOccurrences(midnight, date('2026-10-03T15:59:00Z'), date('2026-10-03T16:01:00Z'));
  assert.equal(items.length, 1); assert.equal(items[0].localDate, '2026-10-04');
  assert.equal(items[0].timezone, 'Asia/Shanghai');
});

test('offline missed work coalesces, expires or asks verification before external effects', () => {
  const occurrences = dueOccurrences(interval, 0, 10800000);
  assert.equal(missedPlan(interval, occurrences, 10800000).state, 'coalesced');
  assert.equal(missedPlan(interval, occurrences, 10800000).missedCount, 3);
  assert.equal(missedPlan(interval, occurrences, 10800000, { externalEffect: true }).state, 'verification_required');
  const verify = { ...interval, catchUp: 'verify' }, expired = { ...interval, maxAgeMs: 1 };
  assert.throws(() => missedPlan(verify, occurrences, 10800000), { code: 'OCCURRENCE_INVALID' });
  assert.equal(missedPlan(verify, dueOccurrences(verify, 0, 10800000), 10800000).state, 'verification_required');
  assert.equal(missedPlan(expired, dueOccurrences(expired, 0, 10800000), 10800002).state, 'skipped');
  assert.equal(missedPlan(interval, [], 1).state, 'nothing_due');
});

test('quiet hours cross midnight and explicit emergency exception never pauses work', () => {
  const quiet = { timezone: 'Etc/UTC', startMinute: 22 * 60, endMinute: 7 * 60, emergencyAllowed: false };
  assert.equal(quietAt(date('2026-10-04T23:00:00Z'), quiet), true);
  assert.equal(quietAt(date('2026-10-05T06:59:00Z'), quiet), true);
  assert.equal(quietAt(date('2026-10-05T07:00:00Z'), quiet), false);
  assert.equal(quietAt(date('2026-10-04T23:00:00Z'), quiet, true), true);
  assert.equal(quietAt(date('2026-10-04T23:00:00Z'), { ...quiet, emergencyAllowed: true }, true), false);
});

test('unknown timezone/policies and accessor/proxy inputs fail closed', () => {
  assert.throws(() => scheduleSpec({ ...daily, timezone: 'not/a-timezone' }), { code: 'TIMEZONE_INVALID' });
  for (const config of [
    { timezone: 'No/SuchZone', startMinute: 1, endMinute: 2, emergencyAllowed: false },
    { timezone: 'No/SuchZone', startMinute: 1, endMinute: 1, emergencyAllowed: false },
    { timezone: 'No/SuchZone', startMinute: 1, endMinute: 2, emergencyAllowed: true }
  ]) assert.throws(() => quietAt(1, config, true), { code: 'TIMEZONE_INVALID' });
  assert.throws(() => scheduleSpec({ ...daily, missingTime: 'invented' }), { code: 'SCHEDULE_INVALID' });
  assert.throws(() => scheduleSpec(new Proxy(daily, {})), { code: 'INVALID_INPUT' });
  let accessed = 0;
  assert.throws(() => scheduleSpec({ ...daily, get timezone() { accessed++; return 'Etc/UTC'; } }), { code: 'INVALID_INPUT' });
  assert.throws(() => quietAt(1, { get timezone() { accessed++; return 'Etc/UTC'; }, startMinute: 1, endMinute: 2, emergencyAllowed: false }), { code: 'INVALID_INPUT' });
  assert.throws(() => missedPlan(interval, [], 1, { get externalEffect() { accessed++; return true; } }), { code: 'INVALID_INPUT' });
  assert.equal(accessed, 0);
});

test('missed planning rejects forged metadata, wrong clock bindings and duplicate occurrences', () => {
  const valid = dueOccurrences(interval, 0, 3600000)[0];
  for (const item of [{ at: 123, timezone: 'fabricated', localDate: 'wrong', occurrenceRef: 'not-a-reference' },
    { ...valid, timezone: 'Asia/Shanghai' }, { ...valid, localDate: 'wrong' }, { ...valid, at: valid.at + 1 },
    { ...valid, occurrenceRef: 'a'.repeat(64) }]) {
    assert.throws(() => missedPlan(interval, [item], 7200000), { code: 'OCCURRENCE_INVALID' });
  }
  assert.throws(() => missedPlan(interval, [valid, valid], 7200000), { code: 'OCCURRENCE_INVALID' });
  const plan = missedPlan(interval, [valid], 7200000);
  assert.ok(Object.isFrozen(plan.due));
});

test('unsupported Date instants fail with stable codes before Intl or daily-margin arithmetic', () => {
  for (const value of [Number.MAX_SAFE_INTEGER, 8640000000000000, -1]) {
    for (const spec of [interval, daily]) assert.throws(() => dueOccurrences(spec, value, value), { code: 'TIME_RANGE_INVALID' });
    assert.throws(() => missedPlan(interval, [], value), { code: 'TIME_RANGE_INVALID' });
  }
});
