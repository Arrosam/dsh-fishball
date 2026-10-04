import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInstalledEvents, createInstalledEvents } from '../src/installed-events.mjs';
import { hash, canonicalDigest } from '../src/runtime-security.mjs';

// These are trusted typed closure doubles, not RuntimeStore/native/package
// proof. They expose every call so boot/read/lifecycle effects are observable.
const owner = { key: 'owner', maxEventAgeMs: 60000, rate: { windowMs: 60000, maxEvents: 4 }, route: 'new_task' };
const schedule = { key: 'daily', maxEventAgeMs: 60000, rate: { windowMs: 60000, maxEvents: 4 }, route: 'new_task',
  spec: { kind: 'interval', timezone: 'Etc/UTC', catchUp: 'verify', maxAgeMs: 60000, maxScanMinutes: 2880, anchorAt: 0, intervalMs: 60000 },
  startAfter: 0, pollMs: 60000, goalTaskRef: hash('template-task'), goalRecordRef: hash('template') };
const selection = () => structuredClone({ enabled: true, ownerIngress: [owner], schedules: [schedule] });
const config = value => ({ selection: value, identity: { ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' }, profile: { dir: '/synthetic/profile', name: 'synthetic' } });

function fixture(options = {}) {
  const calls = [], sources = new Map(), subscriptions = new Map(), pairs = new Map(), schedules = new Map(), commands = new Map(), clocks = new Map();
  let alive = true, failSubscription = false;
  const sourceGoal = { kind: 'goal', recordRef: schedule.goalRecordRef, digest: hash('Synthetic original goal.'), content: 'Synthetic original goal.' };
  function mutation(operation, input, execute) {
    calls.push([operation, input]); const digest = canonicalDigest({ operation, input }), prior = commands.get(input.commandRef);
    if (prior) { if (prior.digest !== digest) throw Object.assign(new Error('IDEMPOTENCY_CONFLICT'), { code: 'IDEMPOTENCY_CONFLICT' }); return structuredClone(prior.receipt); }
    const receipt = execute(); commands.set(input.commandRef, { digest, receipt: structuredClone(receipt) }); return structuredClone(receipt);
  }
  const api = {
    ctx: {}, isAlive: () => alive,
    configureSource: input => mutation('configureSource', input, () => {
      const old = sources.get(input.sourceRef); assert.equal(input.expectedRevision, old?.revision ?? 0);
      const result = { sourceRef: input.sourceRef, revision: input.expectedRevision + 1, spec: structuredClone(input.spec) }; sources.set(input.sourceRef, result); return result;
    }),
    configureLocalSubscription: input => mutation('configureLocalSubscription', input, () => {
      if (failSubscription) throw Object.assign(new Error('STALE_SUBSCRIPTION'), { code: 'STALE_SUBSCRIPTION' });
      assert.equal(sources.get(input.sourceRef).revision, input.expectedSourceRevision);
      const old = subscriptions.get(input.subscriptionRef); assert.equal(input.expectedRevision, old?.revision ?? 0);
      const pairRef = canonicalDigest({ sourceRef: input.sourceRef, subscriptionRef: input.subscriptionRef });
      const result = { sourceRef: input.sourceRef, subscriptionRef: input.subscriptionRef, revision: input.expectedRevision + 1,
        spec: structuredClone(input.spec), localPairRef: pairRef };
      const pair = { contractVersion: 'df.local-source-pair/v1', pairRef, sourceRef: input.sourceRef, sourceRevision: input.expectedSourceRevision,
        sourceSpecDigest: canonicalDigest(sources.get(input.sourceRef).spec), subscriptionRef: input.subscriptionRef,
        subscriptionRevision: result.revision, subscriptionSpecDigest: canonicalDigest(result.spec) };
      subscriptions.set(input.subscriptionRef, result); pairs.set(input.subscriptionRef, pair); return { subscription: result, pair };
    }),
    readLocalSourcePair: input => { calls.push(['pair', input]); const pair = pairs.get(input.subscriptionRef);
      if (!pair) return { pair: null, currentness: 'missing' };
      const source = sources.get(input.sourceRef), subscription = subscriptions.get(input.subscriptionRef);
      return { pair: structuredClone(pair), currentness: source?.revision === pair.sourceRevision && subscription?.revision === pair.subscriptionRevision &&
        canonicalDigest(source.spec) === pair.sourceSpecDigest && canonicalDigest(subscription.spec) === pair.subscriptionSpecDigest ? 'current' : 'stale' };
    },
    source: input => { calls.push(['source', input]); return structuredClone(sources.get(input.sourceRef) ?? null); },
    subscription: input => { calls.push(['subscription', input]); return structuredClone(subscriptions.get(input.subscriptionRef) ?? null); },
    ingestLocalOwnerEvent: input => { calls.push(['ingest', input]); options.onIngest?.(); return { deduplicated: false, taskRef: hash(input.taskId ?? 'supplement') }; },
    eventReceipt: () => null, listEventReceipts: () => [],
    readGoal: input => { calls.push(['readGoal', input]); return structuredClone(sourceGoal); },
    registerSchedule: input => { calls.push(['register', input]); const token = {}; schedules.set(token, { input, polling: false }); options.onRegister?.(); return token; },
    tickSchedule: () => { calls.push(['tick']); },
    readScheduleClock: input => { calls.push(['clock', input]); return structuredClone(clocks.get(input.clockRef) ?? null); },
    statusSchedule: token => { calls.push(['scheduleStatus']); const item = schedules.get(token); return {
      sourceRef: item.input.sourceRef, subscriptionRef: item.input.subscriptionRef, scheduleDigest: canonicalDigest(item.input.spec),
      polling: item.polling, cursor: null, pendingVerification: null }; },
    startSchedule: (token, input) => { calls.push(['start', input]); schedules.get(token).polling = true; schedules.get(token).onStatus = input.onStatus; options.onStart?.(); },
    stopSchedule: token => { calls.push(['stop']); schedules.get(token).polling = false; },
    unregisterSchedule: token => { calls.push(['unregister']); schedules.delete(token); },
    approveSchedule: input => { calls.push(['approve', input]); },
  };
  const factory = createInstalledEvents(config(options.selection ?? selection())), installed = factory.installedAutomationInstaller(api);
  return { api, calls, sources, subscriptions, pairs, schedules, sourceGoal, factory, installed, clocks,
    setAlive: value => { alive = value; }, failSubscription: value => { failSubscription = value; },
    configure: (key = 'owner', extra = {}) => installed.configureLocalAutomation({ key, commandRef: hash(`configure-${key}`), expectedSourceRevision: 0, expectedSubscriptionRevision: 0, enabled: true, ...extra }) };
}

test('closed defaults and detached selections install zero sources, clocks, timers or ingress', () => {
  assert.deepEqual(validateInstalledEvents(undefined), { enabled: false });
  assert.deepEqual(validateInstalledEvents({ enabled: false }), { enabled: false });
  const input = selection(), detached = validateInstalledEvents(input); input.schedules[0].spec.intervalMs = 120000;
  assert.equal(detached.schedules[0].spec.intervalMs, 60000); assert.ok(Object.isFrozen(detached.schedules[0].spec));
  const f = fixture(); assert.equal(f.calls.length, 0);
  assert.equal(f.installed.localAutomationStatus({}).slots.length, 2);
  assert.equal(f.calls.filter(([operation]) => ['register', 'start', 'tick', 'configureSource', 'configureLocalSubscription', 'ingest'].includes(operation)).length, 0);
});

test('selection closes every level, choice count, time/rate bound and goal route', () => {
  const mutations = [
    value => { value.secret = 'x'; }, value => { value.ownerIngress[0].adapterRef = hash('forged'); },
    value => { value.ownerIngress[0].rate.extra = true; }, value => { value.ownerIngress[0].rate.maxEvents = 4097; },
    value => { value.ownerIngress[0].key = 'Bad'; }, value => { value.schedules[0].key = 'owner'; },
    value => { value.schedules[0].route = 'supplement'; }, value => { value.schedules[0].pollMs = 59999; },
    value => { value.schedules[0].pollMs = 86400001; }, value => { delete value.schedules[0].goalRecordRef; },
    value => { value.schedules[0].spec.intervalMs = 59999; }, value => { value.schedules[0].spec.timezone = 'Invented/Zone'; },
    value => { value.schedules = Array.from({ length: 17 }, (_, index) => ({ ...schedule, key: `slot-${index}` })); },
  ];
  for (const mutate of mutations) { const value = selection(); mutate(value); assert.throws(() => validateInstalledEvents(value), { code: 'CONFIG_INVALID' }); }
  assert.throws(() => validateInstalledEvents({ enabled: false, schedules: [] }), { code: 'CONFIG_INVALID' });
});

test('accessors/proxies/symbols/hidden/inherited selections run no registered canary', () => {
  let traps = 0; const accessor = selection(); Object.defineProperty(accessor.ownerIngress[0], 'route', { enumerable: true, get() { traps++; throw new Error('canary'); } });
  const proxy = new Proxy(selection(), { ownKeys() { traps++; throw new Error('canary'); } });
  const hidden = selection(); Object.defineProperty(hidden, 'secret', { value: true });
  const symbol = selection(); symbol[Symbol('proof')] = true;
  for (const value of [accessor, proxy, hidden, symbol, Object.assign(Object.create({ enabled: true }), selection())]) assert.throws(() => validateInstalledEvents(value), { code: 'CONFIG_INVALID' });
  assert.equal(traps, 0);
});

test('private installer is exact, one-use and disabled operations cannot mutate', () => {
  const f = fixture({ selection: { enabled: false } }); assert.equal(f.installed.localAutomationStatus({}).enabled, false);
  assert.throws(() => f.configure(), { code: 'AUTOMATION_DISABLED' }); assert.equal(f.calls.length, 0);
  assert.throws(() => f.factory.installedAutomationInstaller(f.api), { code: 'EVENT_ALREADY_INSTALLED' });
  const factory = createInstalledEvents(config(selection()));
  assert.throws(() => factory.installedAutomationInstaller({ ...f.api, hostHandle: {} }), { code: 'INVALID_INPUT' });
  assert.equal(f.calls.length, 0);
});

test('normal configure derives exact source/route references and acknowledges both CAS writes', () => {
  const f = fixture(), result = f.configure();
  assert.equal(result.sourceRevision, 1); assert.equal(result.subscriptionRevision, 1);
  const source = f.sources.get(result.sourceRef), subscription = f.subscriptions.get(result.subscriptionRef);
  assert.equal(source.spec.kind, 'internal'); assert.equal(source.spec.identityMode, 'unique_id'); assert.equal(subscription.spec.route, 'new_task');
  assert.equal(source.spec.adapterRef, hash('df.native-owner-adapter/v1'));
  assert.equal(f.installed.localAutomationStatus({ key: 'owner' }).slots[0].ready, true);
  const receipt = f.configure(); assert.deepEqual(receipt, result); assert.equal(f.sources.get(result.sourceRef).revision, 1);
  assert.throws(() => f.configure('owner', { targetTaskRef: hash('foreign-target') }), { code: 'INVALID_INPUT' });
});

test('ingress accepts only data IDs/body/current CAS, never time/role/proof fields', () => {
  const f = fixture(); f.configure();
  const input = { key: 'owner', commandRef: hash('event'), eventId: 'event-1', goal: 'Synthetic intended goal.', taskId: 'task-1' };
  f.installed.ingestLocalEvent(input); const request = f.calls.find(([operation]) => operation === 'ingest')[1];
  assert.equal(request.expectedSourceRevision, 1); assert.equal(request.eventIdRef, hash('event-1'));
  assert.ok(!Object.hasOwn(request, 'observedAt')); assert.ok(!Object.hasOwn(request, 'receivedAt'));
  for (const extra of [{ observedAt: 1 }, { role: 'owner' }, { verified: true }, { expectedTaskVersion: 1 }, { taskId: undefined }]) {
    const before = f.calls.length; assert.throws(() => f.installed.ingestLocalEvent({ ...input, ...extra })); assert.equal(f.calls.length, before);
  }
  let traps = 0; const malicious = { ...input }; Object.defineProperty(malicious, 'key', { enumerable: true, get() { traps++; throw new Error('canary'); } });
  assert.throws(() => f.installed.ingestLocalEvent(malicious), { code: 'INVALID_INPUT' }); assert.equal(traps, 0);
});

test('ingress rejects malformed Unicode, blank/oversize/private-key material before trusted ingress', () => {
  const f = fixture(); f.configure();
  for (const goal of ['\ud800', '', ' '.repeat(10), 'é'.repeat(32769), '-----BEGIN PRIVATE KEY-----']) {
    const count = f.calls.filter(([operation]) => operation === 'ingest').length;
    assert.throws(() => f.installed.ingestLocalEvent({ key: 'owner', commandRef: hash('bad-goal'), eventId: 'event', taskId: 'task', goal }));
    assert.equal(f.calls.filter(([operation]) => operation === 'ingest').length, count);
  }
});

test('explicit supplement binds selected current target and forbids caller target/body identity flags', () => {
  const value = selection(); value.ownerIngress[0].route = 'supplement';
  const f = fixture({ selection: value }), targetTaskRef = hash('target'); f.configure('owner', { targetTaskRef });
  const input = { key: 'owner', commandRef: hash('supplement'), eventId: 'update-1', goal: 'Synthetic addition.', expectedTaskVersion: 3, expectedAuthEpoch: 2 };
  f.installed.ingestLocalEvent(input); const request = f.calls.find(([operation]) => operation === 'ingest')[1];
  assert.equal(request.targetTaskRef, targetTaskRef); assert.equal(request.expectedTaskVersion, 3); assert.equal(request.expectedAuthEpoch, 2);
  assert.throws(() => f.installed.ingestLocalEvent({ ...input, targetTaskRef: hash('wrong') }), { code: 'INVALID_INPUT' });
  assert.throws(() => f.installed.ingestLocalEvent({ ...input, taskId: 'new' }), { code: 'INVALID_INPUT' });
});

test('schedule starts explicitly, exact revision/goal guards survive callbacks and stop/restart', () => {
  const f = fixture(); f.configure('daily'); assert.equal(f.schedules.size, 0);
  const start = { key: 'daily', commandRef: hash('start'), expectedSourceRevision: 1, expectedSubscriptionRevision: 1 };
  assert.throws(() => f.installed.startLocalSchedule({ ...start, expectedSourceRevision: 2 }), { code: 'EVENT_CONFIGURATION_STALE' });
  f.installed.startLocalSchedule(start); const entry = [...f.schedules.values()][0];
  assert.equal(entry.input.externalEffect, true); assert.equal(entry.input.goal, f.sourceGoal.content); assert.equal(entry.input.isCurrent({ verified: false }), true);
  f.installed.startLocalSchedule(start); assert.equal(f.schedules.size, 1); assert.equal(f.calls.filter(([name]) => name === 'start').length, 1);
  const oldCallback = entry.onStatus; f.installed.stopLocalSchedule({ key: 'daily', commandRef: hash('stop') });
  assert.equal(entry.input.isCurrent(), false); assert.equal(f.schedules.size, 0);
  f.installed.startLocalSchedule({ ...start, commandRef: hash('restart') }); oldCallback({ state: 'admitted' });
  assert.equal(f.installed.localAutomationStatus({ key: 'daily' }).slots[0].lastState, null);
  f.sourceGoal.content = 'Changed bytes with stale digest.'; assert.equal([...f.schedules.values()][0].input.isCurrent(), false);
  assert.equal(f.installed.localAutomationStatus({ key: 'daily' }).slots[0].ready, false);
});

test('configure seals old schedule before second CAS failure and lifetime ends before cleanup', () => {
  const f = fixture(); f.configure('daily');
  f.installed.startLocalSchedule({ key: 'daily', commandRef: hash('start'), expectedSourceRevision: 1, expectedSubscriptionRevision: 1 });
  const prior = [...f.schedules.values()][0]; f.failSubscription(true);
  assert.throws(() => f.configure('daily', { commandRef: hash('reconfigure'), expectedSourceRevision: 1, expectedSubscriptionRevision: 1 }), { code: 'STALE_SUBSCRIPTION' });
  assert.equal(prior.input.isCurrent(), false); assert.equal(f.schedules.size, 0);
  f.installed.dispose(); f.installed.dispose();
  assert.throws(() => f.installed.localAutomationStatus({}), { code: 'SERVICE_DISPOSED' });
  assert.throws(() => f.installed.ingestLocalEvent({}), { code: 'INVALID_INPUT' });
});

test('registration or start lifetime loss cleans its token and never reschedules', () => {
  let f; f = fixture({ onRegister: () => f.setAlive(false) }); f.configure('daily');
  assert.throws(() => f.installed.startLocalSchedule({ key: 'daily', commandRef: hash('start'), expectedSourceRevision: 1, expectedSubscriptionRevision: 1 }), { code: 'SERVICE_DISPOSED' });
  assert.equal(f.schedules.size, 0); assert.equal(f.calls.filter(([name]) => name === 'start').length, 0);
});

test('scope/profile namespace isolates identical keys and returned diagnostics contain no template prose/path', () => {
  const a = fixture(), b = fixture(); const otherConfig = config(selection()); otherConfig.identity.workspaceId = 'another-workspace';
  const second = createInstalledEvents(otherConfig).installedAutomationInstaller(b.api);
  const first = a.configure(); const other = second.configureLocalAutomation({ key: 'owner', commandRef: hash('configure-other'), expectedSourceRevision: 0, expectedSubscriptionRevision: 0, enabled: true });
  assert.notEqual(first.sourceRef, other.sourceRef); assert.notEqual(first.subscriptionRef, other.subscriptionRef);
  a.configure('daily'); const diagnostic = JSON.stringify(a.installed.localAutomationStatus({}));
  assert.equal(diagnostic.includes(a.sourceGoal.content), false); assert.equal(diagnostic.includes('/synthetic/profile'), false);
});

function storedClock(f, state = {}) {
  const status = f.installed.localAutomationStatus({ key: 'daily' }).slots[0];
  const clock = { sourceRef: status.sourceRef, subscriptionRef: status.subscriptionRef, clockRef: status.clockRef,
    sourceRevision: 1, subscriptionRevision: 1, cursor: 60000, decision: 'verification_required', planDigest: hash('plan'),
    pendingVerification: { through: 120000, planDigest: hash('plan'), approved: false }, ...state };
  f.clocks.set(status.clockRef, clock); return clock;
}

test('stopped/boot clock status preserves exact retained pending facts with zero registration or writes', () => {
  const f = fixture(); f.configure('daily'); const clock = storedClock(f);
  f.calls.length = 0; const status = f.installed.localAutomationStatus({ key: 'daily' }).slots[0];
  assert.equal(status.polling, false); assert.equal(status.clockCurrent, true); assert.equal(status.cursor, 60000);
  assert.deepEqual(status.pendingVerification, clock.pendingVerification); assert.deepEqual(status.clockDecision, { decision: 'verification_required', planDigest: hash('plan') });
  assert.equal(status.clockSourceRevision, 1); assert.equal(status.clockSubscriptionRevision, 1); assert.equal(status.clockReason, null);
  assert.equal(status.nextProposedOccurrence.at, 120000); assert.equal(status.nextProposedOccurrence.timezone, 'Etc/UTC');
  assert.equal(f.schedules.size, 0); assert.equal(f.calls.some(([name]) => ['register', 'start', 'tick', 'configureSource', 'configureLocalSubscription', 'ingest', 'approve'].includes(name)), false);
});

test('configuration failure and stale clock revision preserve independently read historical facts', () => {
  const f = fixture(); const configured = f.configure('daily'); storedClock(f);
  f.sources.get(configured.sourceRef).spec.enabled = false;
  let status = f.installed.localAutomationStatus({ key: 'daily' }).slots[0];
  assert.equal(status.ready, false); assert.equal(status.cursor, 60000); assert.equal(status.clockCurrent, false); assert.equal(status.clockReason, 'CLOCK_NOT_CURRENT');
  f.sources.get(configured.sourceRef).spec.enabled = true; f.sources.get(configured.sourceRef).revision = 2;
  status = f.installed.localAutomationStatus({ key: 'daily' }).slots[0];
  assert.equal(status.clockCurrent, false); assert.equal(status.clockSourceRevision, 1); assert.equal(status.pendingVerification.approved, false);
});

test('missing/corrupt clock history is distinguished and cannot expose unknown fields/prose', () => {
  const f = fixture(); f.configure('daily'); let status = f.installed.localAutomationStatus({ key: 'daily' }).slots[0];
  assert.equal(status.clockCurrent, null); assert.equal(status.clockReason, 'CLOCK_MISSING'); assert.equal(status.cursor, null);
  storedClock(f, { cursor: -1 }); status = f.installed.localAutomationStatus({ key: 'daily' }).slots[0];
  assert.equal(status.clockReason, 'CLOCK_UNAVAILABLE'); assert.equal(status.cursor, null);
  storedClock(f, { secret: 'synthetic canary' }); status = f.installed.localAutomationStatus({ key: 'daily' }).slots[0];
  assert.equal(status.clockReason, 'CLOCK_UNAVAILABLE'); assert.equal(JSON.stringify(status).includes('synthetic canary'), false);
});

test('status rejects descriptor/caller clock proof before reads and late retired-life status never returns', () => {
  const f = fixture(); f.configure('daily');
  const before = f.calls.length; let traps = 0; const value = {};
  Object.defineProperty(value, 'key', { enumerable: true, get() { traps++; throw new Error('canary'); } });
  assert.throws(() => f.installed.localAutomationStatus(value), { code: 'INVALID_INPUT' });
  assert.throws(() => f.installed.localAutomationStatus({ key: 'daily', clockCurrent: true }), { code: 'INVALID_INPUT' });
  assert.equal(traps, 0); assert.equal(f.calls.length, before);
  f.clocks.set(f.installed.localAutomationStatus({ key: 'daily' }).slots[0].clockRef, null);
  // Fresh composition: private callback can retire the host during a read.
  const api = { ...f.api, readScheduleClock: input => { f.setAlive(false); return null; } };
  const installed = createInstalledEvents(config(selection())).installedAutomationInstaller(api);
  assert.throws(() => installed.localAutomationStatus({ key: 'daily' }), { code: 'SERVICE_DISPOSED' });
});

test('a committed ingress receipt cannot publish into a retired life and is never automatically retried', () => {
  let f; f = fixture({ onIngest: () => f.setAlive(false) }); f.configure();
  assert.throws(() => f.installed.ingestLocalEvent({ key: 'owner', commandRef: hash('late-event'), eventId: 'event', taskId: 'task', goal: 'Synthetic goal.' }), { code: 'SERVICE_DISPOSED' });
  assert.equal(f.calls.filter(([name]) => name === 'ingest').length, 1);
  assert.throws(() => f.installed.ingestLocalEvent({ key: 'owner', commandRef: hash('late-event'), eventId: 'event', taskId: 'task', goal: 'Synthetic goal.' }), { code: 'SERVICE_DISPOSED' });
  assert.equal(f.calls.filter(([name]) => name === 'ingest').length, 1);
});

test('lifecycle command identity cannot stop a replacement timer and bounded receipts never evict', () => {
  const f = fixture(); f.configure('daily');
  const start = commandRef => ({ key: 'daily', commandRef, expectedSourceRevision: 1, expectedSubscriptionRevision: 1 });
  const oldStop = { key: 'daily', commandRef: hash('old-stop') };
  f.installed.startLocalSchedule(start(hash('first-start'))); f.installed.stopLocalSchedule(oldStop);
  f.installed.startLocalSchedule(start(hash('second-start')));
  f.installed.stopLocalSchedule(oldStop); assert.equal(f.schedules.size, 1);
  assert.throws(() => f.installed.stopLocalSchedule({ key: 'daily', commandRef: hash('second-start') }), { code: 'IDEMPOTENCY_CONFLICT' });
  f.installed.stopLocalSchedule({ key: 'daily', commandRef: hash('second-stop') });
  for (let index = 0; index < 62; index++) {
    f.installed.startLocalSchedule(start(hash(`bounded-start-${index}`)));
    f.installed.stopLocalSchedule({ key: 'daily', commandRef: hash(`bounded-stop-${index}`) });
  }
  assert.equal(f.schedules.size, 0);
  const count = f.calls.filter(([name]) => name === 'register').length;
  assert.throws(() => f.installed.startLocalSchedule(start(hash('overflow'))), { code: 'EVENT_LIFECYCLE_CAPACITY' });
  assert.equal(f.calls.filter(([name]) => name === 'register').length, count);
  assert.deepEqual(f.installed.stopLocalSchedule(oldStop), { key: 'daily', polling: false });
});

test('source-only commit leaves exact same-recipe pair stale across fresh module composition', () => {
  const f = fixture(), configured = f.configure(); f.failSubscription(true);
  assert.throws(() => f.configure('owner', { commandRef: hash('partial'), expectedSourceRevision: 1, expectedSubscriptionRevision: 1 }), { code: 'STALE_SUBSCRIPTION' });
  assert.equal(f.sources.get(configured.sourceRef).revision, 2); assert.equal(f.subscriptions.get(configured.subscriptionRef).revision, 1);
  const request = { key: 'owner', commandRef: hash('partial-event'), eventId: 'event', taskId: 'task', goal: 'Synthetic goal.' };
  assert.throws(() => f.installed.ingestLocalEvent(request), { code: 'EVENT_PAIR_STALE' });
  const fresh = createInstalledEvents(config(selection())).installedAutomationInstaller(f.api);
  assert.equal(fresh.localAutomationStatus({ key: 'owner' }).slots[0].reason, 'EVENT_PAIR_STALE');
  assert.throws(() => fresh.ingestLocalEvent(request), { code: 'EVENT_PAIR_STALE' });
  assert.equal(f.calls.filter(([name]) => name === 'ingest').length, 0);
  f.failSubscription(false);
  const repaired = fresh.configureLocalAutomation({ key: 'owner', commandRef: hash('explicit-pair'), expectedSourceRevision: 2, expectedSubscriptionRevision: 1, enabled: true });
  assert.equal(repaired.sourceRevision, 3); assert.equal(repaired.subscriptionRevision, 2);
  assert.equal(fresh.localAutomationStatus({ key: 'owner' }).slots[0].ready, true);
});

test('raw missing, stripped marker and changed exact pair cannot provide normal admission', () => {
  for (const mode of ['missing', 'stripped', 'wrong-marker', 'wrong-digest', 'wrong-pair']) {
    const f = fixture(), configured = f.configure();
    const subscription = f.subscriptions.get(configured.subscriptionRef), pair = f.pairs.get(configured.subscriptionRef);
    if (mode === 'missing') { delete subscription.localPairRef; f.pairs.delete(configured.subscriptionRef); }
    if (mode === 'stripped') f.pairs.delete(configured.subscriptionRef);
    if (mode === 'wrong-marker') subscription.localPairRef = hash('copied');
    if (mode === 'wrong-digest') pair.sourceSpecDigest = hash('forged');
    if (mode === 'wrong-pair') pair.sourceRef = hash('foreign');
    const expected = mode === 'missing' ? 'EVENT_PAIR_MISSING' : mode === 'wrong-digest' ? 'EVENT_PAIR_STALE' : 'STORAGE_INVALID';
    assert.throws(() => f.installed.ingestLocalEvent({ key: 'owner', commandRef: hash('wrong-pair-event'), eventId: 'event', taskId: 'task', goal: 'Synthetic goal.' }), { code: expected });
    assert.equal(f.calls.filter(([name]) => name === 'ingest').length, 0);
  }
});

test('scheduled authorization cannot survive pair change and historical clock facts survive stale pair', async () => {
  const f = fixture(), configured = f.configure('daily'); storedClock(f);
  f.installed.startLocalSchedule({ key: 'daily', commandRef: hash('pair-start'), expectedSourceRevision: 1, expectedSubscriptionRevision: 1 });
  const entry = [...f.schedules.values()][0]; assert.equal(await entry.input.authorize({ passed: true }), true);
  f.sources.get(configured.sourceRef).revision = 2;
  assert.equal(entry.input.isCurrent({ verified: true }), false); assert.equal(await entry.input.authorize({ passed: true }), false);
  const status = f.installed.localAutomationStatus({ key: 'daily' }).slots[0];
  assert.equal(status.reason, 'EVENT_PAIR_STALE'); assert.equal(status.ready, false);
  assert.equal(status.cursor, 60000); assert.equal(status.clockCurrent, false); assert.equal(status.pendingVerification.approved, false);
});

test('typed pair closure is required; proxy pair observation runs no trap and cannot dispatch', () => {
  const f = fixture(); f.configure(); const { configureLocalSubscription, ...oldOnly } = f.api;
  assert.throws(() => createInstalledEvents(config(selection())).installedAutomationInstaller({ ...oldOnly, configureSubscription: configureLocalSubscription }), { code: 'INVALID_INPUT' });
  let traps = 0; const proxy = new Proxy({}, { ownKeys() { traps++; throw new Error('canary'); } });
  const fresh = createInstalledEvents(config(selection())).installedAutomationInstaller({ ...f.api, readLocalSourcePair: () => proxy });
  assert.throws(() => fresh.ingestLocalEvent({ key: 'owner', commandRef: hash('proxy-pair'), eventId: 'event', taskId: 'task', goal: 'Synthetic goal.' }), { code: 'INVALID_INPUT' });
  assert.equal(traps, 0); assert.equal(f.calls.filter(([name]) => name === 'ingest').length, 0);
});

test('fixed provider/adapter constant golden digests retain strict caller raw-ID boundaries', () => {
  const f = fixture(); f.configure(); f.configure('daily');
  f.installed.ingestLocalEvent({ key: 'owner', commandRef: hash('golden-ingress'), eventId: 'event:1', taskId: 'task:1', goal: 'Synthetic goal.' });
  const ingress = f.calls.find(([name]) => name === 'ingest')[1];
  assert.equal(ingress.providerRef, hash('df.native-owner-ingress/v1')); assert.equal(ingress.adapterRef, hash('df.native-owner-adapter/v1'));
  f.installed.startLocalSchedule({ key: 'daily', commandRef: hash('golden-start'), expectedSourceRevision: 1, expectedSubscriptionRevision: 1 });
  const entry = [...f.schedules.values()][0]; assert.equal(entry.input.providerRef, hash('df.native-schedule/v1')); assert.equal(entry.input.adapterRef, hash('df.native-schedule-adapter/v1'));
  for (const field of ['eventId', 'taskId']) assert.throws(() => f.installed.ingestLocalEvent({ key: 'owner', commandRef: hash('illegal-id'), eventId: 'event', taskId: 'task', goal: 'Synthetic goal.', [field]: 'df/forged' }), { code: 'INVALID_INPUT' });
});
