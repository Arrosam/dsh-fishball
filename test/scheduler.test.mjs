import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RuntimeStore } from '../src/runtime-store.mjs';
import { hash, canonicalDigest } from '../src/runtime-security.mjs';
import { EventRouter } from '../src/events.mjs';
import { ScheduleDriver } from '../src/scheduler.mjs';

function fixture(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'df-scheduler-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const owner = {}, host = {}, scope = { ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' };
  let now = options.now ?? 180001, alive = true, permission = true;
  const config = { databasePath: join(directory, 'ledger.sqlite'), encryptionKey: Buffer.alloc(32, 14),
    principals: [{ handle: owner, role: 'owner', scope }, { handle: host, role: 'host', scope }], clock: () => now, hostPermission: () => true };
  let store = new RuntimeStore(config); t.after(() => store.close());
  const spec = { kind: 'interval', timezone: 'Etc/UTC', catchUp: 'coalesce', maxAgeMs: 10000,
    maxScanMinutes: 6000, anchorAt: 0, intervalMs: 60000, ...options.spec };
  if (spec.kind === 'daily') { delete spec.anchorAt; delete spec.intervalMs; }
  const sourceRef = hash('source'), subscriptionRef = hash('subscription'), adapterRef = hash('schedule-adapter');
  const sourceSpec = { kind: 'schedule', identityMode: 'unique_id', enabled: true, adapterRef,
    permissionPolicyRef: hash('permission'), maxEventAgeMs: 86400000, rate: { windowMs: 60000, maxEvents: options.maxEvents ?? 100 } };
  store.configureSource(owner, { commandRef: hash('source-create'), sourceRef, expectedRevision: 0, spec: sourceSpec });
  store.configureSubscription(owner, { commandRef: hash('sub-create'), sourceRef, subscriptionRef,
    expectedRevision: 0, expectedSourceRevision: 1, spec: { enabled: true, triggerRef: canonicalDigest(spec), route: 'new_task' } });
  const systems = [];
  const make = () => {
    const router = new EventRouter({ store, hostHandle: host, clock: () => now, isAlive: () => alive });
    const driver = new ScheduleDriver({ store, hostHandle: host, router, clock: () => now, isAlive: () => alive,
      ...(options.timers ? { timers: options.timers } : {}) });
    const registration = { sourceRef, subscriptionRef, adapterRef, providerRef: hash('local-schedule-clock'),
      sourceIdentityRef: hash('original-schedule-source'), spec, startAfter: options.startAfter ?? 0,
      goal: 'Run this encrypted synthetic scheduled task.', externalEffect: options.externalEffect ?? false,
      authorize: options.authorize ?? (async () => permission), isCurrent: () => alive && permission };
    const token = driver.register(registration); systems.push({ router, driver });
    return { driver, token, registration };
  };
  t.after(() => { for (const { router, driver } of systems) { driver.dispose(); router.dispose(); } });
  const f = { ...make(), owner, host, config, sourceRef, subscriptionRef, sourceSpec, spec, make,
    get store() { return store; }, setNow: value => { now = value; }, setAlive: value => { alive = value; },
    setPermission: value => { permission = value; }, updateSource: update => store.configureSource(owner, {
      commandRef: hash('source-update-' + JSON.stringify(update)), sourceRef,
      expectedRevision: store.source(host, { sourceRef }).revision, spec: { ...sourceSpec, ...update } }),
    reopen: () => { for (const { router, driver } of systems) { driver.dispose(); router.dispose(); }
      store.close(); store = new RuntimeStore(config); const next = make(); Object.assign(f, next); } };
  return f;
}

test('coalesced due ingress and cursor survive restart; no worker or effect is admitted by a clock', async t => {
  const f = fixture(t), first = await f.driver.tick(f.token);
  assert.equal(first.state, 'admitted'); assert.equal(first.missedCount, 3); assert.equal(first.scheduledAt, 180000);
  assert.equal(f.driver.status(f.token).cursor, 180000); assert.equal(f.store.listTasks(f.owner).length, 1);
  const snapshot = f.store.snapshot(f.owner, { taskRef: first.receipt.task.taskRef });
  assert.equal(snapshot.actions.length, 0); assert.equal(snapshot.workers.length, 0); assert.equal(snapshot.task.status, 'queued');
  assert.equal(readFileSync(f.config.databasePath).includes(Buffer.from(f.registration.goal)), false);
  f.reopen(); assert.equal((await f.driver.tick(f.token)).state, 'nothing_due');
  assert.equal(f.store.listTasks(f.owner).length, 1);
  f.setNow(240000); const next = await f.driver.tick(f.token);
  assert.equal(next.state, 'admitted'); assert.equal(next.scheduledAt, 240000); assert.equal(f.store.listTasks(f.owner).length, 2);
});

test('missed verification is durable and only the exact private owner approval permits one ingress', async t => {
  const f = fixture(t, { spec: { catchUp: 'verify' } }), pending = await f.driver.tick(f.token);
  assert.equal(pending.state, 'verification_required'); assert.equal(f.driver.status(f.token).cursor, null);
  assert.equal(f.store.listTasks(f.owner).length, 0); f.reopen();
  assert.equal((await f.driver.tick(f.token)).planDigest, pending.planDigest);
  const approval = { commandRef: hash('approve'), sourceRef: f.sourceRef, subscriptionRef: f.subscriptionRef,
    expectedSourceRevision: 1, expectedSubscriptionRevision: 1, clockRef: pending.clockRef, expectedCursor: null, planDigest: pending.planDigest };
  assert.throws(() => f.store.approveEventClock(f.host, approval), { code: 'UNAUTHORIZED' });
  assert.throws(() => f.store.approveEventClock(f.owner, { ...approval, planDigest: hash('forged-plan') }), { code: 'VERIFICATION_REQUIRED' });
  assert.equal(f.store.listTasks(f.owner).length, 0); f.store.approveEventClock(f.owner, approval);
  const admitted = await f.driver.tick(f.token); assert.equal(admitted.state, 'admitted');
  assert.equal(f.driver.status(f.token).pendingVerification, null); assert.equal(f.store.listTasks(f.owner).length, 1);
  assert.equal((await f.driver.tick(f.token)).state, 'nothing_due');
});

test('external-effect classification forces verification even under coalesce; approval still launches no effect', async t => {
  const f = fixture(t, { externalEffect: true }), pending = await f.driver.tick(f.token);
  assert.equal(pending.state, 'verification_required'); assert.equal(f.store.listTasks(f.owner).length, 0);
  f.store.approveEventClock(f.owner, { commandRef: hash('owner-verify'), sourceRef: f.sourceRef, subscriptionRef: f.subscriptionRef,
    expectedSourceRevision: 1, expectedSubscriptionRevision: 1, clockRef: pending.clockRef, expectedCursor: null, planDigest: pending.planDigest });
  const result = await f.driver.tick(f.token);
  assert.equal(f.store.snapshot(f.owner, { taskRef: result.receipt.task.taskRef }).actions.length, 0);
});

test('skip and max-age expiry durably advance with no task or automatic catch-up', async t => {
  for (const spec of [{ catchUp: 'skip' }, { maxAgeMs: 0 }]) await t.test(JSON.stringify(spec), async t => {
    const f = fixture(t, { spec }); const result = await f.driver.tick(f.token);
    assert.equal(result.state, 'skipped'); assert.equal(result.missedCount, 3);
    assert.equal(f.driver.status(f.token).cursor, 180000); assert.equal(f.store.listTasks(f.owner).length, 0);
    f.reopen(); assert.equal((await f.driver.tick(f.token)).state, 'nothing_due'); assert.equal(f.store.listTasks(f.owner).length, 0);
  });
});

test('rate refusal keeps an approved missed plan and cursor intact for explicit reconciliation', async t => {
  const f = fixture(t, { spec: { catchUp: 'verify' }, maxEvents: 0 }), pending = await f.driver.tick(f.token);
  f.store.approveEventClock(f.owner, { commandRef: hash('owner-verify'), sourceRef: f.sourceRef, subscriptionRef: f.subscriptionRef,
    expectedSourceRevision: 1, expectedSubscriptionRevision: 1, clockRef: pending.clockRef, expectedCursor: null, planDigest: pending.planDigest });
  await assert.rejects(f.driver.tick(f.token), { code: 'RATE_LIMIT' });
  const clock = f.driver.status(f.token); assert.equal(clock.cursor, null); assert.equal(clock.pendingVerification.approved, true);
  assert.equal(f.store.listTasks(f.owner).length, 0); assert.equal(f.store.source(f.host, { sourceRef: f.sourceRef }).rateCount, 0);
});

test('source revision and revocation cannot inherit or approve an older missed-plan decision', async t => {
  const f = fixture(t, { spec: { catchUp: 'verify' } }), pending = await f.driver.tick(f.token);
  f.updateSource({ rate: { windowMs: 60000, maxEvents: 99 } });
  await assert.rejects(f.driver.tick(f.token), { code: 'SCHEDULE_PLAN_STALE' });
  assert.throws(() => f.store.approveEventClock(f.owner, { commandRef: hash('old-approve'), sourceRef: f.sourceRef,
    subscriptionRef: f.subscriptionRef, expectedSourceRevision: 1, expectedSubscriptionRevision: 1,
    clockRef: pending.clockRef, expectedCursor: null, planDigest: pending.planDigest }), { code: 'STALE_SOURCE' });
  f.updateSource({ enabled: false }); await assert.rejects(f.driver.tick(f.token), { code: 'SOURCE_DISABLED' });
  assert.equal(f.store.listTasks(f.owner).length, 0);
});

test('clock rollback and an over128 occurrence gap refuse without resetting a durable cursor', async t => {
  const f = fixture(t); await f.driver.tick(f.token); const before = f.driver.status(f.token).cursor;
  f.setNow(before - 1); await assert.rejects(f.driver.tick(f.token), { code: 'SCHEDULE_CLOCK_ROLLBACK' });
  f.setNow(before + 129 * 60000); await assert.rejects(f.driver.tick(f.token), { code: 'SCHEDULE_GAP_REQUIRES_REVIEW' });
  assert.equal(f.driver.status(f.token).cursor, before); assert.equal(f.store.listTasks(f.owner).length, 1);
});

test('an explicit future start remains idle through its boundary and admits only a later occurrence', async t => {
  const f = fixture(t, { now: 59999, startAfter: 60000 });
  assert.equal((await f.driver.tick(f.token)).state, 'not_started'); assert.equal(f.driver.status(f.token).cursor, null);
  f.setNow(60000); assert.equal((await f.driver.tick(f.token)).state, 'nothing_due');
  f.setNow(60001); assert.equal((await f.driver.tick(f.token)).state, 'nothing_due');
  f.setNow(120000); assert.equal((await f.driver.tick(f.token)).scheduledAt, 120000);
  assert.equal(f.store.listTasks(f.owner).length, 1);
});

test('two independent driver instances race one durable occurrence into one task', async t => {
  const f = fixture(t), other = f.make();
  const [a, b] = await Promise.all([f.driver.tick(f.token), other.driver.tick(other.token)]);
  assert.equal(a.state, 'admitted'); assert.equal(b.state, 'admitted');
  assert.equal(a.receipt.task.taskRef, b.receipt.task.taskRef); assert.equal([a.receipt.deduplicated, b.receipt.deduplicated].filter(Boolean).length, 1);
  assert.equal(f.store.listTasks(f.owner).length, 1); assert.equal(f.store.source(f.host, { sourceRef: f.sourceRef }).rateCount, 1);
});

test('permission, unload and source-disable races across asynchronous authentication admit nothing', async t => {
  for (const mode of ['permission', 'unload', 'disable']) await t.test(mode, async t => {
    let release; const f = fixture(t, { authorize: () => new Promise(resolve => { release = resolve; }) });
    const pending = f.driver.tick(f.token); await Promise.resolve(); await Promise.resolve();
    assert.equal(typeof release, 'function');
    if (mode === 'permission') f.setPermission(false);
    if (mode === 'unload') f.driver.dispose();
    if (mode === 'disable') f.updateSource({ enabled: false });
    release(true); await assert.rejects(pending); assert.equal(f.store.listTasks(f.owner).length, 0);
    assert.equal(f.store.source(f.host, { sourceRef: f.sourceRef }).rateCount, 0);
  });
});

test('host-scoped timer starts only on explicit request, uses bounded cadence, and cannot survive quit', async t => {
  let next = 0; const jobs = new Map(), cleared = [];
  const timers = { set: (callback, delay) => { const id = ++next; jobs.set(id, { callback, delay }); return id; },
    clear: id => { cleared.push(id); jobs.delete(id); } };
  const f = fixture(t, { timers }), statuses = [];
  assert.equal(jobs.size, 0); assert.throws(() => f.driver.start(f.token, { pollMs: 59999, onStatus: value => statuses.push(value) }));
  f.driver.start(f.token, { pollMs: 60000, onStatus: value => statuses.push(value) });
  assert.equal(jobs.size, 1); assert.equal(jobs.get(1).delay, 60000); assert.equal(f.store.listTasks(f.owner).length, 0);
  const job = jobs.get(1); jobs.delete(1); await job.callback(); assert.equal(statuses[0].state, 'admitted'); assert.equal(jobs.size, 1);
  f.driver.dispose(); assert.equal(jobs.size, 0); assert.equal(cleared.length, 1);
  await assert.rejects(f.driver.tick(f.token), { code: 'SERVICE_DISPOSED' });
});

test('a failed status observer cannot turn admitted work into a second blocked notification', async t => {
  const jobs = new Map(); let serial = 0, observations = 0;
  const f = fixture(t, { timers: { set: (callback, delay) => { const id = ++serial; jobs.set(id, { callback, delay }); return id; }, clear: id => jobs.delete(id) } });
  f.driver.start(f.token, { pollMs: 60000, onStatus: result => { observations++; assert.equal(result.state, 'admitted'); throw new Error('observer unavailable'); } });
  const job = jobs.get(1); jobs.delete(1); await job.callback();
  assert.equal(observations, 1); assert.equal(f.store.listTasks(f.owner).length, 1); assert.equal(jobs.size, 1);
  f.setAlive(false); const late = jobs.get(2); jobs.delete(2); await late.callback();
  assert.equal(observations, 1); assert.equal(jobs.size, 0);
});

test('copied registration, mutated policy and invalid binding cannot create private schedule authority', async t => {
  const f = fixture(t), copied = { ...f.token };
  await assert.rejects(f.driver.tick(copied), { code: 'SCHEDULE_REGISTRATION_INVALID' });
  f.registration.goal = 'Changed after registration'; f.spec.intervalMs = 120000;
  const result = await f.driver.tick(f.token); const data = f.store.listData(f.owner, { taskRef: result.receipt.task.taskRef })[0];
  assert.equal(f.store.readData(f.owner, { taskRef: result.receipt.task.taskRef, recordRef: data.recordRef }).content, 'Run this encrypted synthetic scheduled task.');
  assert.throws(() => f.driver.register({ ...f.registration, externalEffect: 'true' }));
});

test('actual IANA fold planning plus durable restart does not repeat the first daily occurrence', async t => {
  const stamp = text => Date.parse(text);
  const f = fixture(t, { now: stamp('2026-11-01T05:31:00Z'), startAfter: stamp('2026-11-01T05:00:00Z'),
    spec: { kind: 'daily', timezone: 'America/New_York', catchUp: 'coalesce', maxAgeMs: 3600000,
      maxScanMinutes: 6000, minuteOfDay: 90, weekdays: [0], dstRepeat: 'first', missingTime: 'skip' } });
  const first = await f.driver.tick(f.token); assert.equal(first.scheduledAt, stamp('2026-11-01T05:30:00Z'));
  f.reopen(); f.setNow(stamp('2026-11-01T06:31:00Z'));
  assert.equal((await f.driver.tick(f.token)).state, 'nothing_due'); assert.equal(f.store.listTasks(f.owner).length, 1);
  assert.equal(f.driver.status(f.token).timezone, 'America/New_York');
});
