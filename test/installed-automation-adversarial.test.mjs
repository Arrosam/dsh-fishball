import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createInstalledEvents, validateInstalledEvents } from '../src/installed-events.mjs';

// Independent T-level carrier tests. Maps and tokens below are explicit doubles,
// not signed SQLite/native/persistence/atomic-approval proof. No native service,
// RuntimeStore, real timer, provider, tool or recipient is instantiated.
const sha = text => createHash('sha256').update(text, 'utf8').digest('hex');
const orderedJSON = value => JSON.stringify(value, (_key, item) => {
  if (item && !Array.isArray(item) && typeof item === 'object') {
    return Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]));
  }
  return item;
});
const cd = value => sha(orderedJSON(value));
const copy = value => structuredClone(value);
const err = code => Object.assign(new Error(code), { code });
const expectCode = (run, code) => assert.throws(run, value => value?.code === code);
const MAX_TIME = 8640000000000000;
const MAX_START = MAX_TIME - 26 * 3600000;
const GOLD = Object.freeze({
  ownerProvider: 'b960e0b40a240752061358f4c0fd41f539a9f6617be51817828d218d917938eb',
  scheduleProvider: 'eccfcc2ce7a2c5037bc87d284bb90ecce80b170861192474aa4d167cd3c9010c',
  ownerAdapter: '0ec951d014497ba9434e9ca998b7f24fe0180e8f11d00c0ab600e1bb5519dadd',
  scheduleAdapter: 'd69ec23f51766004a74305c805798a03f7f4661e77fff730c2e45ec4e621adb5',
});
const IDENTITY = Object.freeze({ ownerId: 'ni4-istqb-owner', workspaceId: 'ni4-istqb-workspace' });
const PROFILE = Object.freeze({ dir: '/synthetic/ni4-istqb-profile', name: 'synthetic-ni4' });
const OWNER = Object.freeze({ key: 'intake', maxEventAgeMs: 90000,
  rate: { windowMs: 120000, maxEvents: 3 }, route: 'new_task' });
const SCHEDULE = Object.freeze({ key: 'agenda', maxEventAgeMs: 180000,
  rate: { windowMs: 240000, maxEvents: 2 }, route: 'new_task',
  spec: { kind: 'interval', timezone: 'Etc/UTC', catchUp: 'verify', maxAgeMs: 180000,
    maxScanMinutes: 2880, anchorAt: 0, intervalMs: 60000 },
  startAfter: 0, pollMs: 60000, goalTaskRef: sha('T-template-task'), goalRecordRef: sha('T-template-record') });
const choice = () => copy({ enabled: true, ownerIngress: [OWNER], schedules: [SCHEDULE] });
const MUTATIONS = new Set(['sourceWrite', 'pairWrite', 'ingress', 'register', 'start', 'stop', 'unregister', 'tick', 'approve']);

function memory() {
  return { sources: new Map(), subscriptions: new Map(), pairs: new Map(), clocks: new Map(), commands: new Map(),
    goal: { taskRef: SCHEDULE.goalTaskRef, recordRef: SCHEDULE.goalRecordRef, kind: 'goal',
      content: 'T-only explicitly selected immutable goal.', digest: sha('T-only explicitly selected immutable goal.') } };
}

function carrier(options = {}) {
  const selected = copy(options.selection ?? choice()), retained = options.retained ?? memory();
  const calls = [], registrations = new Map(), ownedTimers = new Set();
  const lifetime = { alive: true }, faults = {}, hooks = {};
  const log = (op, input) => calls.push({ op, input });
  function command(op, input, body) {
    log(op, copy(input));
    const fingerprint = cd({ op, input }), old = retained.commands.get(input.commandRef);
    if (old) {
      if (old.fingerprint !== fingerprint) throw err('IDEMPOTENCY_CONFLICT');
      return copy(old.result);
    }
    const result = body();
    retained.commands.set(input.commandRef, { fingerprint, result: copy(result) });
    return copy(result);
  }
  function rawPair(input) {
    const pair = retained.pairs.get(cd(input));
    if (!pair) return { pair: null, currentness: 'missing' };
    const source = retained.sources.get(input.sourceRef), subscription = retained.subscriptions.get(input.subscriptionRef);
    const current = source?.revision === pair.sourceRevision && subscription?.revision === pair.subscriptionRevision &&
      source?.spec && subscription?.spec && cd(source.spec) === pair.sourceSpecDigest && cd(subscription.spec) === pair.subscriptionSpecDigest;
    return { pair: copy(pair), currentness: current ? 'current' : 'stale' };
  }
  const api = {
    ctx: Object.freeze({ fixtureLevel: 'T' }),
    isAlive: () => lifetime.alive,
    configureSource: input => command('sourceWrite', input, () => {
      if (faults.sourceWrite) throw err(faults.sourceWrite);
      const old = retained.sources.get(input.sourceRef);
      if ((old?.revision ?? 0) !== input.expectedRevision) throw err('STALE_SOURCE');
      const result = { sourceRef: input.sourceRef, revision: input.expectedRevision + 1, spec: copy(input.spec) };
      retained.sources.set(input.sourceRef, result); hooks.afterSourceWrite?.(result); return result;
    }),
    configureLocalSubscription: input => command('pairWrite', input, () => {
      if (faults.pairWrite) throw err(faults.pairWrite);
      const source = retained.sources.get(input.sourceRef), old = retained.subscriptions.get(input.subscriptionRef);
      if (!source || source.revision !== input.expectedSourceRevision) throw err('STALE_SOURCE');
      if ((old?.revision ?? 0) !== input.expectedRevision) throw err('STALE_SUBSCRIPTION');
      const pairRef = cd({ sourceRef: input.sourceRef, subscriptionRef: input.subscriptionRef });
      const subscription = { sourceRef: input.sourceRef, subscriptionRef: input.subscriptionRef,
        revision: input.expectedRevision + 1, spec: copy(input.spec), localPairRef: pairRef };
      const pair = { contractVersion: 'df.local-source-pair/v1', pairRef, sourceRef: input.sourceRef,
        sourceRevision: source.revision, sourceSpecDigest: cd(source.spec), subscriptionRef: input.subscriptionRef,
        subscriptionRevision: subscription.revision, subscriptionSpecDigest: cd(subscription.spec) };
      retained.subscriptions.set(input.subscriptionRef, subscription); retained.pairs.set(pairRef, pair);
      hooks.afterPairWrite?.(subscription, pair); return { subscription, pair };
    }),
    source: input => { log('sourceRead', copy(input)); if (faults.sourceRead) throw err(faults.sourceRead);
      const result = copy(retained.sources.get(input.sourceRef) ?? null); hooks.afterSourceRead?.(); return result; },
    subscription: input => { log('subscriptionRead', copy(input)); if (faults.subscriptionRead) throw err(faults.subscriptionRead);
      return copy(retained.subscriptions.get(input.subscriptionRef) ?? null); },
    readLocalSourcePair: input => { log('pairRead', copy(input)); if (faults.pairRead) throw err(faults.pairRead);
      return hooks.pairRead ? hooks.pairRead(input, rawPair(input)) : rawPair(input); },
    readGoal: input => { log('goalRead', copy(input)); if (faults.goalRead) throw err(faults.goalRead);
      const result = copy(retained.goal); hooks.afterGoalRead?.(); return result; },
    ingestLocalOwnerEvent: input => { log('ingress', copy(input)); hooks.afterIngress?.();
      return { taskRef: sha(input.taskId ?? 'T-existing-supplement-task'), deduplicated: false }; },
    eventReceipt: input => { log('eventRead', input); return null; },
    listEventReceipts: input => { log('eventListRead', input); return []; },
    registerSchedule: input => {
      if (faults.register) throw err(faults.register);
      const token = Object.freeze({ T: 'owned-token', index: registrations.size });
      log('register', input); registrations.set(token, { input, token, polling: false, onStatus: null });
      hooks.afterRegister?.(token); return token;
    },
    startSchedule: (token, input) => {
      log('start', { token, pollMs: input.pollMs });
      const registration = registrations.get(token); assert.ok(registration, 'fake carrier received an unknown token');
      registration.polling = true; registration.onStatus = input.onStatus; ownedTimers.add(token);
      hooks.afterStart?.(token); if (faults.start) throw err(faults.start);
    },
    stopSchedule: token => { log('stop', token); ownedTimers.delete(token);
      const entry = registrations.get(token); if (entry) entry.polling = false;
      if (faults.stop) throw err(faults.stop); },
    unregisterSchedule: token => { log('unregister', token); ownedTimers.delete(token); registrations.delete(token); },
    tickSchedule: token => { log('tick', token); throw err('T_NO_TICK_AUTHORIZED'); },
    statusSchedule: token => { log('timerRead', token); const entry = registrations.get(token);
      if (!entry) throw err('T_UNKNOWN_TOKEN');
      return hooks.timerRead ? hooks.timerRead(entry) : { sourceRef: entry.input.sourceRef,
        subscriptionRef: entry.input.subscriptionRef, scheduleDigest: cd(entry.input.spec), polling: entry.polling }; },
    readScheduleClock: input => { log('clockRead', copy(input)); if (faults.clockRead) throw err(faults.clockRead);
      const clock = copy(retained.clocks.get(input.clockRef) ?? null); return hooks.clockRead ? hooks.clockRead(input, clock) : clock; },
    approveSchedule: input => { log('approve', input); throw err('T_NO_APPROVAL_AUTHORIZED'); },
  };
  const identity = copy(options.identity ?? IDENTITY), profile = copy(options.profile ?? PROFILE);
  const factory = createInstalledEvents({ selection: selected, identity, profile });
  const installed = factory.installedAutomationInstaller(api);
  const configure = (key = 'intake', changes = {}) => installed.configureLocalAutomation({ key,
    commandRef: sha(`T-configure-${key}`), expectedSourceRevision: 0, expectedSubscriptionRevision: 0, enabled: true, ...changes });
  const start = (command = 'T-start') => installed.startLocalSchedule({ key: 'agenda', commandRef: sha(command),
    expectedSourceRevision: 1, expectedSubscriptionRevision: 1 });
  const status = (key = 'agenda') => installed.localAutomationStatus({ key }).slots[0];
  const ingress = changes => installed.ingestLocalEvent({ key: 'intake', commandRef: sha('T-owner-event'),
    eventId: 'event.1', taskId: 'task.1', goal: 'T-only intended owner goal.', ...changes });
  const writes = () => calls.filter(call => MUTATIONS.has(call.op));
  return { selected, retained, calls, api, lifetime, faults, hooks, factory, installed, registrations, ownedTimers,
    configure, start, status, ingress, writes, count: op => calls.filter(call => call.op === op).length,
    entry: () => [...registrations.values()][0] };
}

function clockFor(f, values = {}) {
  const slot = f.status();
  const clock = { sourceRef: slot.sourceRef, subscriptionRef: slot.subscriptionRef, clockRef: slot.clockRef,
    sourceRevision: 1, subscriptionRevision: 1, cursor: 60000, decision: 'verification_required', planDigest: sha('T-plan'),
    pendingVerification: { through: 120000, planDigest: sha('T-plan'), approved: false }, ...values };
  f.retained.clocks.set(slot.clockRef, copy(clock)); return clock;
}

test('T N4-01 / N4S-01: disabled and enabled boot/status perform zero writes or timer work', () => {
  for (const selection of [{ enabled: false }, { enabled: true, ownerIngress: [], schedules: [] }, choice()]) {
    const f = carrier({ selection }); assert.deepEqual(f.writes(), []);
    for (let n = 0; n < 3; n++) f.installed.localAutomationStatus({});
    assert.deepEqual(f.writes(), []); assert.equal(f.ownedTimers.size, 0); assert.equal(f.registrations.size, 0);
    assert.equal(f.retained.commands.size, 0); assert.equal(f.retained.sources.size, 0); assert.equal(f.retained.pairs.size, 0);
  }
  assert.deepEqual(validateInstalledEvents(undefined), { enabled: false });
});

const boundRows = [
  ['key length31', v => { v.ownerIngress[0].key = 'a'.repeat(31); }, true],
  ['key length32', v => { v.ownerIngress[0].key = 'a'.repeat(32); }, true],
  ['key length33', v => { v.ownerIngress[0].key = 'a'.repeat(33); }, false],
  ['owner count15', v => { v.ownerIngress = Array.from({ length: 15 }, (_, n) => ({ ...copy(OWNER), key: `o-${n}` })); }, true],
  ['owner count16', v => { v.ownerIngress = Array.from({ length: 16 }, (_, n) => ({ ...copy(OWNER), key: `o-${n}` })); }, true],
  ['owner count17', v => { v.ownerIngress = Array.from({ length: 17 }, (_, n) => ({ ...copy(OWNER), key: `o-${n}` })); }, false],
  ['cross-list duplicate', v => { v.schedules[0].key = v.ownerIngress[0].key; }, false],
  ['age zero', v => { v.ownerIngress[0].maxEventAgeMs = 0; }, true],
  ['age maximum', v => { v.ownerIngress[0].maxEventAgeMs = MAX_TIME; }, true],
  ['age maximum+1', v => { v.ownerIngress[0].maxEventAgeMs = MAX_TIME + 1; }, false],
  ['rate window zero', v => { v.ownerIngress[0].rate.windowMs = 0; }, false],
  ['rate max4095', v => { v.ownerIngress[0].rate.maxEvents = 4095; }, true],
  ['rate max4096', v => { v.ownerIngress[0].rate.maxEvents = 4096; }, true],
  ['rate max4097', v => { v.ownerIngress[0].rate.maxEvents = 4097; }, false],
  ['poll59999', v => { v.schedules[0].pollMs = 59999; }, false],
  ['poll60000', v => { v.schedules[0].pollMs = 60000; }, true],
  ['poll86400000', v => { v.schedules[0].pollMs = 86400000; }, true],
  ['poll86400001', v => { v.schedules[0].pollMs = 86400001; }, false],
  ['start maximum', v => { v.schedules[0].startAfter = MAX_START; }, true],
  ['start maximum+1', v => { v.schedules[0].startAfter = MAX_START + 1; }, false],
  ['schedule supplement', v => { v.schedules[0].route = 'supplement'; }, false],
];
for (const [name, change, allowed] of boundRows) test(`T N4-01/08: selected boundary ${name}`, () => {
  const input = choice(); change(input);
  if (allowed) { const result = validateInstalledEvents(input); assert.ok(Object.isFrozen(result)); }
  else expectCode(() => validateInstalledEvents(input), 'CONFIG_INVALID');
});

test('T N4-01/02: closed descriptor/proxy inputs run zero traps; choices are detached', () => {
  let traps = 0;
  const accessor = choice(); Object.defineProperty(accessor.ownerIngress[0], 'route', { enumerable: true, get() { traps++; return 'new_task'; } });
  const proxy = new Proxy(choice(), { ownKeys() { traps++; throw err('TRAP'); }, get() { traps++; throw err('TRAP'); } });
  const hidden = choice(); Object.defineProperty(hidden.schedules[0], 'proof', { value: true });
  const inherited = Object.assign(Object.create({ proof: true }), choice());
  const symbol = choice(); symbol.ownerIngress[0][Symbol('proof')] = true;
  const sparse = choice(); sparse.ownerIngress.length = 2;
  for (const input of [accessor, proxy, hidden, inherited, symbol, sparse]) expectCode(() => validateInstalledEvents(input), 'CONFIG_INVALID');
  assert.equal(traps, 0);
  const input = choice(), factory = createInstalledEvents({ selection: input, identity: copy(IDENTITY), profile: copy(PROFILE) });
  input.ownerIngress[0].key = 'replacement'; input.schedules[0].pollMs = 86400000;
  const f = carrier(), installed = factory.installedAutomationInstaller(f.api);
  assert.deepEqual(installed.localAutomationStatus({}).slots.map(x => x.key), ['intake', 'agenda']);
  assert.deepEqual(f.writes(), []);
});

test('T N4-01/02: installer rejects generic fallback/extra handles and is one-use', () => {
  const f = carrier(); expectCode(() => f.factory.installedAutomationInstaller(f.api), 'EVENT_ALREADY_INSTALLED');
  const factory = () => createInstalledEvents({ selection: choice(), identity: copy(IDENTITY), profile: copy(PROFILE) });
  const { configureLocalSubscription, ...withoutTypedPair } = f.api;
  expectCode(() => factory().installedAutomationInstaller({ ...withoutTypedPair, configureSubscription: configureLocalSubscription }), 'INVALID_INPUT');
  expectCode(() => factory().installedAutomationInstaller({ ...f.api, hostHandle: {} }), 'INVALID_INPUT');
  expectCode(() => factory().installedAutomationInstaller({ ...f.api, readScheduleClock: null }), 'EVENT_CAPABILITY_UNAVAILABLE');
  assert.deepEqual(f.writes(), []);
});

test('T N4I-01/02/04: all fixed literal goldens and independent canonical scoped identities', () => {
  const f = carrier(), owner = f.configure(), schedule = f.configure('agenda'); f.ingress(); f.start();
  const request = f.calls.find(c => c.op === 'ingress').input, registered = f.entry().input;
  assert.equal(request.providerRef, GOLD.ownerProvider); assert.equal(request.adapterRef, GOLD.ownerAdapter);
  assert.equal(registered.providerRef, GOLD.scheduleProvider); assert.equal(registered.adapterRef, GOLD.scheduleAdapter);
  assert.equal(f.retained.sources.get(owner.sourceRef).spec.adapterRef, GOLD.ownerAdapter);
  assert.equal(f.retained.sources.get(schedule.sourceRef).spec.adapterRef, GOLD.scheduleAdapter);
  const namespace = cd(['df.installed-events/v1', IDENTITY.ownerId, IDENTITY.workspaceId, PROFILE.dir, PROFILE.name]);
  assert.equal(owner.sourceRef, cd([namespace, 'owner', 'intake', 'source']));
  assert.equal(owner.subscriptionRef, cd([namespace, 'owner', 'intake', 'subscription']));
  assert.equal(request.sourceIdentityRef, cd([namespace, 'owner', 'intake', 'origin']));
  assert.equal(schedule.sourceRef, cd([namespace, 'schedule', 'agenda', 'source']));
  assert.notEqual(GOLD.ownerProvider, cd('df.native-owner-ingress/v1'));
  assert.equal(f.count('tick'), 0); assert.equal(f.count('approve'), 0); f.installed.dispose();
});

test('T N4P-01: two separately acknowledged CAS writes use exact closed derived bodies', () => {
  const f = carrier(), result = f.configure(); const writes = f.writes();
  assert.deepEqual(writes.map(c => c.op), ['sourceWrite', 'pairWrite']);
  assert.equal(writes[0].input.commandRef, cd([sha('T-configure-intake'), 'source']));
  assert.equal(writes[1].input.commandRef, cd([sha('T-configure-intake'), 'subscription']));
  assert.equal(writes[1].input.expectedSourceRevision, result.sourceRevision);
  assert.deepEqual(Object.keys(writes[1].input).sort(), ['commandRef', 'expectedRevision', 'expectedSourceRevision', 'sourceRef', 'spec', 'subscriptionRef'].sort());
  assert.equal(f.status('intake').ready, true); const duplicate = f.configure(); assert.deepEqual(duplicate, result);
  assert.equal(f.retained.sources.get(result.sourceRef).revision, 1);
});

for (const failure of ['STALE_SUBSCRIPTION', 'EVENT_LIMIT', 'STORAGE_UNAVAILABLE']) test(`T N4P-02: source succeeds, second CAS ${failure}, fresh composition stays stale`, () => {
  const f = carrier(), original = f.configure(); f.faults.pairWrite = failure;
  expectCode(() => f.configure('intake', { commandRef: sha(`T-partial-${failure}`), expectedSourceRevision: 1,
    expectedSubscriptionRevision: 1 }), failure);
  assert.equal(f.retained.sources.get(original.sourceRef).revision, 2);
  assert.equal(f.retained.subscriptions.get(original.subscriptionRef).revision, 1);
  expectCode(() => f.ingress(), 'EVENT_PAIR_STALE');
  const fresh = carrier({ retained: f.retained });
  assert.equal(fresh.status('intake').reason, 'EVENT_PAIR_STALE'); expectCode(() => fresh.ingress(), 'EVENT_PAIR_STALE');
  assert.equal(f.count('ingress') + fresh.count('ingress'), 0);
  assert.deepEqual(fresh.writes(), []); assert.equal(fresh.ownedTimers.size, 0);
});

test('T N4P-02: first CAS failure and lifetime retirement never fabricate second acknowledgement', () => {
  const failed = carrier(); failed.faults.sourceWrite = 'STALE_SOURCE'; expectCode(() => failed.configure(), 'STALE_SOURCE');
  assert.equal(failed.count('pairWrite'), 0); assert.equal(failed.retained.sources.size, 0);
  const retired = carrier(); retired.hooks.afterSourceWrite = () => { retired.lifetime.alive = false; };
  expectCode(() => retired.configure(), 'SERVICE_DISPOSED'); assert.equal(retired.count('sourceWrite'), 1);
  assert.equal(retired.retained.sources.size, 1); assert.equal(retired.count('pairWrite'), 0); assert.equal(retired.retained.pairs.size, 0);
});

const pairRows = [
  ['current', () => {}, null],
  ['raw missing', (f, refs) => { delete f.retained.subscriptions.get(refs.subscriptionRef).localPairRef;
    f.retained.pairs.delete(cd({ sourceRef: refs.sourceRef, subscriptionRef: refs.subscriptionRef })); }, 'EVENT_PAIR_MISSING'],
  ['stripped pair with pointer', (f, refs) => { f.retained.pairs.delete(cd({ sourceRef: refs.sourceRef, subscriptionRef: refs.subscriptionRef })); }, 'STORAGE_INVALID'],
  ['copied forward pointer', (f, refs) => { f.retained.subscriptions.get(refs.subscriptionRef).localPairRef = sha('foreign-pair'); }, 'STORAGE_INVALID'],
  ['unavailable currentness', f => { f.hooks.pairRead = (_i, value) => ({ ...value, currentness: 'unavailable' }); }, 'STORAGE_INVALID'],
  ['stale marker observation', f => { f.hooks.pairRead = (_i, value) => ({ ...value, currentness: 'stale' }); }, 'EVENT_PAIR_STALE'],
  ['wrong contract version', f => { f.hooks.pairRead = (_i, value) => ({ ...value, pair: { ...value.pair, contractVersion: 'df.local-source-pair/v2' } }); }, 'STORAGE_INVALID'],
  ['foreign route ref', f => { f.hooks.pairRead = (_i, value) => ({ ...value, pair: { ...value.pair, sourceRef: sha('foreign-source') } }); }, 'STORAGE_INVALID'],
  ['wrong exact spec digest', f => { f.hooks.pairRead = (_i, value) => ({ ...value, pair: { ...value.pair, subscriptionSpecDigest: sha('foreign-spec') } }); }, 'EVENT_PAIR_STALE'],
  ['extra authority bit', f => { f.hooks.pairRead = (_i, value) => ({ ...value, pair: { ...value.pair, ready: true } }); }, 'INVALID_INPUT'],
];
for (const [name, change, refusal] of pairRows) test(`T N4P-04/05: normal pair decision ${name}`, () => {
  const f = carrier(), refs = f.configure(); change(f, refs);
  if (refusal) { expectCode(() => f.ingress(), refusal); assert.equal(f.count('ingress'), 0); }
  else { f.ingress(); assert.equal(f.count('ingress'), 1); }
  assert.equal(f.count('register'), 0); assert.equal(f.count('approve'), 0);
});

test('T N4P-01/04: hostile pair observations reject without invoking getters/proxy traps', () => {
  for (const kind of ['getter', 'proxy']) {
    const f = carrier(); f.configure(); let traps = 0;
    f.hooks.pairRead = (_input, value) => {
      if (kind === 'proxy') return new Proxy(value, { ownKeys() { traps++; throw err('TRAP'); } });
      Object.defineProperty(value.pair, 'sourceSpecDigest', { enumerable: true, get() { traps++; throw err('TRAP'); } }); return value;
    };
    expectCode(() => f.ingress(), 'INVALID_INPUT'); assert.equal(traps, 0); assert.equal(f.count('ingress'), 0);
  }
});

for (const field of ['eventId', 'taskId']) {
  for (const [name, value, accepted] of [['127', 'a'.repeat(127), true], ['128', 'a'.repeat(128), true],
    ['129', 'a'.repeat(129), false], ['legal punctuation', 'A9_:-.z', true], ['slash', 'df/forged', false],
    ['fixed provider label', 'df.native-owner-ingress/v1', false], ['leading punctuation', '_a', false],
    ['space', 'a b', false], ['Unicode', 'event界', false]]) {
    test(`T N4I-03: raw ${field} ${name}`, () => {
      const f = carrier(); f.configure(); const count = f.calls.length;
      if (accepted) { f.ingress({ [field]: value }); const input = f.calls.find(c => c.op === 'ingress').input;
        assert.equal(field === 'eventId' ? input.eventIdRef : input.taskId, field === 'eventId' ? sha(value) : value); }
      else { expectCode(() => f.ingress({ [field]: value }), 'INVALID_INPUT'); assert.equal(f.calls.length, count); }
    });
  }
}

for (const [name, goal, accepted] of [['ASCII65535', 'x'.repeat(65535), true], ['ASCII65536', 'x'.repeat(65536), true],
  ['ASCII65537', 'x'.repeat(65537), false], ['CJK65535', '界'.repeat(21845), true],
  ['CJK65536', `${'界'.repeat(21845)}x`, true], ['CJK65537', `${'界'.repeat(21845)}xx`, false],
  ['astral65536', '😀'.repeat(16384), true], ['astral65537', `${'😀'.repeat(16384)}x`, false]]) {
  test(`T N4-08: typed goal UTF-8 string boundary ${name}`, () => {
    const f = carrier(); f.configure(); const before = f.count('ingress');
    if (accepted) { f.ingress({ goal }); assert.equal(f.count('ingress'), before + 1);
      assert.equal(f.calls.find(c => c.op === 'ingress').input.goal, goal); }
    else { expectCode(() => f.ingress({ goal }), 'INPUT_TOO_LARGE'); assert.equal(f.count('ingress'), before); }
  });
}

test('T N4-06/08: blank/secret/malformed goals and echoed authority refuse before binding', () => {
  const f = carrier(); f.configure();
  for (const changes of [{ goal: ' ' }, { goal: '\u0000' }, { goal: '\ud800' }, { goal: '-----BEGIN PRIVATE KEY-----' },
    { receivedAt: 1 }, { verified: true }, { providerRef: GOLD.ownerProvider }, { expectedTaskVersion: 1 }]) {
    const before = f.calls.length; assert.throws(() => f.ingress(changes)); assert.equal(f.calls.length, before);
  }
  assert.equal(f.count('ingress'), 0);
});

test('T N4-06: closed new-task and supplement union derives target from configured route', () => {
  const selection = choice(); selection.ownerIngress[0].route = 'supplement';
  const f = carrier({ selection }), target = sha('T-selected-existing-task'); f.configure('intake', { targetTaskRef: target });
  const input = { key: 'intake', commandRef: sha('T-supplement'), eventId: 'update-1', goal: 'T-selected supplement.', expectedTaskVersion: 7, expectedAuthEpoch: 3 };
  f.installed.ingestLocalEvent(input); const request = f.calls.find(c => c.op === 'ingress').input;
  assert.equal(request.targetTaskRef, target); assert.equal(request.expectedTaskVersion, 7); assert.equal(request.expectedAuthEpoch, 3);
  assert.equal(Object.hasOwn(request, 'taskId'), false); assert.equal(Object.hasOwn(request, 'observedAt'), false);
  for (const extra of [{ taskId: 'new-task' }, { targetTaskRef: sha('wrong-target') }, { passed: true }]) {
    const before = f.count('ingress'); expectCode(() => f.installed.ingestLocalEvent({ ...input, ...extra }), 'INVALID_INPUT'); assert.equal(f.count('ingress'), before);
  }
});

test('T N4S-01/02: idle clock projection detaches exact retained facts, never registers or writes', () => {
  const f = carrier(); f.configure('agenda'); const clock = clockFor(f); f.calls.length = 0;
  const status = f.status(); assert.equal(status.polling, false); assert.equal(status.cursor, clock.cursor);
  assert.equal(status.clockCurrent, true); assert.deepEqual(status.clockDecision, { decision: clock.decision, planDigest: clock.planDigest });
  assert.deepEqual(status.pendingVerification, clock.pendingVerification); assert.ok(Object.isFrozen(status.pendingVerification));
  assert.deepEqual(f.writes(), []); assert.equal(f.count('timerRead'), 0); assert.equal(f.registrations.size, 0);
  assert.equal(f.ownedTimers.size, 0); assert.equal(JSON.stringify(status).includes(PROFILE.dir), false);
  expectCode(() => f.installed.localAutomationStatus({ key: 'agenda', clockCurrent: true }), 'INVALID_INPUT');
});

const statusRows = [
  ['complete current pair', () => {}, true, null],
  ['source missing', (f, refs) => { f.retained.sources.delete(refs.sourceRef); }, false, 'EVENT_NOT_CONFIGURED'],
  ['subscription missing', (f, refs) => { f.retained.subscriptions.delete(refs.subscriptionRef); }, false, 'EVENT_NOT_CONFIGURED'],
  ['source disabled', (f, refs) => { f.retained.sources.get(refs.sourceRef).spec.enabled = false; }, false, 'EVENT_DISABLED'],
  ['subscription disabled', (f, refs) => { f.retained.subscriptions.get(refs.subscriptionRef).spec.enabled = false; }, false, 'EVENT_DISABLED'],
  ['recipe mismatch', (f, refs) => { f.retained.sources.get(refs.sourceRef).spec.rate.maxEvents++; }, false, 'ROUTE_MISMATCH'],
  ['same recipe source revision', (f, refs) => { f.retained.sources.get(refs.sourceRef).revision++; }, false, 'EVENT_PAIR_STALE'],
  ['source read unavailable', f => { f.faults.sourceRead = 'T_UNAVAILABLE'; }, false, 'EVENT_UNAVAILABLE'],
];
for (const [name, change, current, reason] of statusRows) test(`T N4S-03/04: history/currentness decision ${name}`, () => {
  const f = carrier(), refs = f.configure('agenda'); const original = clockFor(f); change(f, refs); f.calls.length = 0;
  const value = f.status(); assert.equal(value.ready, current); assert.equal(value.reason, reason);
  assert.equal(value.clockCurrent, current); assert.equal(value.clockReason, current ? null : 'CLOCK_NOT_CURRENT');
  assert.equal(value.cursor, original.cursor); assert.deepEqual(value.pendingVerification, original.pendingVerification);
  assert.deepEqual(f.writes(), []); assert.equal(f.count('clockRead'), 1);
});

const clockRows = [
  ['missing', () => null, 'CLOCK_MISSING'],
  ['cursor negative', c => ({ ...c, cursor: -1 }), 'CLOCK_UNAVAILABLE'],
  ['cursor maximum+1', c => ({ ...c, cursor: MAX_TIME + 1 }), 'CLOCK_UNAVAILABLE'],
  ['wrong route', c => ({ ...c, sourceRef: sha('T-foreign-clock') }), 'CLOCK_UNAVAILABLE'],
  ['invalid decision', c => ({ ...c, decision: 'delivered' }), 'CLOCK_UNAVAILABLE'],
  ['secret extra field', c => ({ ...c, prose: 'T_PRIVATE_CLOCK_CANARY' }), 'CLOCK_UNAVAILABLE'],
  ['one approval field', c => ({ ...c, pendingVerification: { ...c.pendingVerification, approvedAt: 120000 } }), 'CLOCK_UNAVAILABLE'],
  ['invalid pending boolean', c => ({ ...c, pendingVerification: { ...c.pendingVerification, approved: 'true' } }), 'CLOCK_UNAVAILABLE'],
  ['historical revision', c => ({ ...c, sourceRevision: 2 }), 'CLOCK_NOT_CURRENT'],
];
for (const [name, build, reason] of clockRows) test(`T N4S-03/09: clock projection decision ${name}`, () => {
  const f = carrier(); f.configure('agenda'); const initial = clockFor(f); f.retained.clocks.set(initial.clockRef, build(initial));
  f.calls.length = 0; const status = f.status(); assert.equal(status.clockReason, reason);
  assert.equal(status.clockRef, initial.clockRef); assert.deepEqual(f.writes(), []);
  if (reason === 'CLOCK_NOT_CURRENT') { assert.equal(status.cursor, initial.cursor); assert.equal(status.clockCurrent, false); }
  else { assert.equal(status.cursor, null); assert.equal(status.pendingVerification, null); assert.equal(status.clockCurrent, null); }
  assert.equal(JSON.stringify(status).includes('T_PRIVATE_CLOCK_CANARY'), false);
});

test('T N4S-03: unavailable/corrupt/proxy clock is not fabricated missing history', () => {
  const f = carrier(); f.configure('agenda'); clockFor(f); let traps = 0;
  f.faults.clockRead = 'T_STORAGE_INVALID'; assert.equal(f.status().clockReason, 'CLOCK_UNAVAILABLE'); delete f.faults.clockRead;
  f.hooks.clockRead = (_i, value) => new Proxy(value, { ownKeys() { traps++; throw err('TRAP'); } });
  assert.equal(f.status().clockReason, 'CLOCK_UNAVAILABLE'); assert.equal(traps, 0);
  const before = f.calls.length, hostile = {}; Object.defineProperty(hostile, 'key', { enumerable: true, get() { traps++; return 'agenda'; } });
  expectCode(() => f.installed.localAutomationStatus(hostile), 'INVALID_INPUT'); assert.equal(traps, 0); assert.equal(f.calls.length, before);
});

test('T N4S-09: exact independent interval proposal is advisory and clock maximum stays bounded', () => {
  const selection = choice(); selection.schedules[0].spec.anchorAt = 45600; selection.schedules[0].spec.intervalMs = 90000;
  const f = carrier({ selection }); f.configure('agenda'); clockFor(f, { pendingVerification: null, decision: 'ingested' }); f.calls.length = 0;
  const proposal = f.status().nextProposedOccurrence;
  assert.deepEqual(proposal, { at: 135600, timezone: 'Etc/UTC', localDate: '1970-01-01',
    occurrenceRef: cd({ scheduleDigest: cd(selection.schedules[0].spec), at: 135600 }) });
  assert.deepEqual(f.writes(), []); clockFor(f, { cursor: MAX_TIME, pendingVerification: null, decision: 'skipped' });
  const upper = f.status(); assert.equal(upper.cursor, MAX_TIME); assert.equal(upper.nextProposedOccurrence, null);
});

test('T N4-10/14: explicit timer tokens are owned and duplicate commands never create another timer', () => {
  const f = carrier(); f.configure('agenda'); const foreign = Object.freeze({ T: 'foreign' }); f.ownedTimers.add(foreign);
  f.start(); const first = f.entry(); f.start(); assert.equal(f.count('register'), 1); assert.equal(f.count('start'), 1);
  expectCode(() => f.start('T-other-start'), 'SCHEDULE_ALREADY_RUNNING'); assert.equal(f.count('register'), 1);
  f.installed.stopLocalSchedule({ key: 'agenda', commandRef: sha('T-stop') });
  assert.equal(first.input.isCurrent(), false); assert.equal(f.ownedTimers.has(first.token), false); assert.equal(f.ownedTimers.has(foreign), true);
  f.installed.dispose(); assert.equal(f.ownedTimers.has(foreign), true); assert.equal(f.count('stop'), 1); assert.equal(f.count('unregister'), 1);
});

const guardRows = [
  ['source revision changes', f => { const refs = f.status(); f.retained.sources.get(refs.sourceRef).revision++; }],
  ['subscription revision changes', f => { const refs = f.status(); f.retained.subscriptions.get(refs.subscriptionRef).revision++; }],
  ['pair observation goes stale', f => { f.hooks.pairRead = (_i, value) => ({ ...value, currentness: 'stale' }); }],
  ['selected template changes', f => { f.retained.goal.content = 'T-changed template.'; f.retained.goal.digest = sha(f.retained.goal.content); }],
  ['lifetime retires', f => { f.lifetime.alive = false; }],
];
for (const [name, change] of guardRows) test(`T N4-07/14 / N4P-07: captured guards after await ${name}`, async () => {
  const f = carrier(); f.configure('agenda'); f.start(); const entry = f.entry();
  assert.equal(entry.input.authorize({ verified: true }), true); assert.equal(entry.input.isCurrent({ passed: true }), true);
  let resume; const boundary = new Promise(resolve => { resume = resolve; });
  const late = (async () => { await boundary; return { permitted: entry.input.authorize({ verified: true }), current: entry.input.isCurrent({ passed: true }) }; })();
  change(f); resume(); assert.deepEqual(await late, { permitted: false, current: false });
  entry.onStatus({ state: 'admitted' }); assert.equal(f.count('ingress'), 0); assert.equal(f.count('tick'), 0);
  if (f.lifetime.alive) assert.equal(f.status().lastState, null);
  f.installed.dispose();
});

test('T N4-10: unchanged immutable goal survives unrelated procedural template metadata', async () => {
  const f = carrier(); f.configure('agenda'); f.start(); const entry = f.entry();
  await Promise.resolve(); f.retained.goal.taskVersion = 99;
  assert.equal(entry.input.isCurrent(), true); assert.equal(entry.input.authorize(), true); f.installed.dispose();
});

test('T N4-14: old callbacks after stop/restart cannot overwrite replacement state or timer', async () => {
  const f = carrier(); f.configure('agenda'); f.start(); const old = f.entry();
  const oldStop = { key: 'agenda', commandRef: sha('T-old-stop') }; f.installed.stopLocalSchedule(oldStop); f.start('T-replacement');
  const replacement = f.entry(); replacement.onStatus({ state: 'nothing_due' });
  await Promise.resolve(); old.onStatus({ state: 'admitted' });
  assert.equal(old.input.isCurrent(), false); assert.equal(f.status().lastState, 'nothing_due');
  f.installed.stopLocalSchedule(oldStop); assert.equal(f.ownedTimers.has(replacement.token), true);
  assert.equal(f.count('register'), 2); assert.equal(f.count('stop'), 1); f.installed.dispose();
});

test('T N4-14: registration/start lifetime loss and post-start failure clean only owned tokens', () => {
  for (const phase of ['register', 'start', 'startThrow']) {
    const f = carrier(); f.configure('agenda');
    if (phase === 'register') f.hooks.afterRegister = () => { f.lifetime.alive = false; };
    if (phase === 'start') f.hooks.afterStart = () => { f.lifetime.alive = false; };
    if (phase === 'startThrow') f.faults.start = 'T_START_UNAVAILABLE';
    expectCode(() => f.start(), phase === 'startThrow' ? 'T_START_UNAVAILABLE' : 'SERVICE_DISPOSED');
    assert.equal(f.registrations.size, 0); assert.equal(f.ownedTimers.size, 0); assert.equal(f.count('unregister'), 1);
    assert.equal(f.count('start'), phase === 'register' ? 0 : 1);
  }
});

test('T N4-03/14: reconfiguration seals timer before second CAS failure; history remains read-only', () => {
  const f = carrier(); f.configure('agenda'); const history = clockFor(f); f.start(); const old = f.entry(); f.faults.pairWrite = 'STALE_SUBSCRIPTION';
  expectCode(() => f.configure('agenda', { commandRef: sha('T-partial-schedule'), expectedSourceRevision: 1,
    expectedSubscriptionRevision: 1 }), 'STALE_SUBSCRIPTION');
  assert.equal(old.input.isCurrent(), false); assert.equal(f.registrations.size, 0); assert.equal(f.ownedTimers.size, 0);
  f.calls.length = 0; const status = f.status(); assert.equal(status.reason, 'EVENT_PAIR_STALE');
  assert.equal(status.cursor, history.cursor); assert.equal(status.clockCurrent, false); assert.deepEqual(f.writes(), []);
});

test('T N4-14/15: callback descriptors cannot leak raw errors; valid callback state is separate from history', () => {
  const f = carrier(); f.configure('agenda'); const history = clockFor(f); f.start(); const entry = f.entry(); let traps = 0;
  const status = {}; Object.defineProperty(status, 'state', { enumerable: true, get() { traps++; throw err('T_PRIVATE_CALLBACK_CANARY'); } });
  entry.onStatus(status); assert.equal(traps, 0); assert.equal(f.status().lastState, 'admission_blocked');
  entry.onStatus({ state: 'delivered', secret: 'T_PRIVATE_CALLBACK_CANARY' }); assert.equal(f.status().lastState, 'admission_blocked');
  entry.onStatus({ state: 'admitted' }); const displayed = f.status(); assert.equal(displayed.lastState, 'admitted');
  assert.equal(displayed.cursor, history.cursor); assert.equal(displayed.pendingVerification.approved, false);
  assert.equal(JSON.stringify(displayed).includes('T_PRIVATE_CALLBACK_CANARY'), false); assert.equal(f.count('tick'), 0); f.installed.dispose();
});

test('T N4S-10 / N4-07: retirement inside read/ingress never publishes into another lifetime', () => {
  const reader = carrier(); reader.configure('agenda'); clockFor(reader);
  reader.hooks.clockRead = (_i, value) => { reader.lifetime.alive = false; return value; };
  expectCode(() => reader.status(), 'SERVICE_DISPOSED'); assert.equal(reader.count('register'), 0);
  const producer = carrier(); producer.configure(); producer.hooks.afterIngress = () => { producer.lifetime.alive = false; };
  expectCode(() => producer.ingress(), 'SERVICE_DISPOSED'); assert.equal(producer.count('ingress'), 1);
  expectCode(() => producer.ingress(), 'SERVICE_DISPOSED'); assert.equal(producer.count('ingress'), 1);
  const fresh = carrier({ retained: producer.retained }); assert.equal(fresh.status('intake').ready, true);
  expectCode(() => producer.installed.localAutomationStatus({}), 'SERVICE_DISPOSED'); assert.equal(fresh.count('ingress'), 0);
});

test('T N4-08/14: lifecycle127/128/129 capacity never evicts or mutates on refusal', () => {
  const f = carrier(); f.configure('agenda');
  for (let index = 0; index < 63; index++) {
    f.start(`T-cap-start-${index}`); f.installed.stopLocalSchedule({ key: 'agenda', commandRef: sha(`T-cap-stop-${index}`) });
  }
  f.start('T-cap-127'); assert.equal(f.registrations.size, 1);
  const stop128 = { key: 'agenda', commandRef: sha('T-cap-128') }; f.installed.stopLocalSchedule(stop128); assert.equal(f.registrations.size, 0);
  const before = f.writes().length; expectCode(() => f.start('T-cap-129'), 'EVENT_LIFECYCLE_CAPACITY'); assert.equal(f.writes().length, before);
  f.installed.stopLocalSchedule({ key: 'agenda', commandRef: sha('T-cap-stop-0') }); assert.equal(f.writes().length, before);
  assert.equal(f.count('register'), 64); assert.equal(f.count('unregister'), 64); assert.equal(f.ownedTimers.size, 0); f.installed.dispose();
});

test('T N4-14: disposal seals all guards first and unregisters every owned token despite one stop failure', () => {
  const selection = choice(); selection.schedules.push({ ...copy(SCHEDULE), key: 'second' });
  const f = carrier({ selection }); f.configure('agenda'); f.configure('second'); f.start();
  f.installed.startLocalSchedule({ key: 'second', commandRef: sha('T-second-start'), expectedSourceRevision: 1, expectedSubscriptionRevision: 1 });
  const entries = [...f.registrations.values()]; f.faults.stop = 'T_STOP_UNAVAILABLE';
  expectCode(() => f.installed.dispose(), 'EVENT_DISPOSAL_UNAVAILABLE');
  assert.equal(f.count('stop'), 2); assert.equal(f.count('unregister'), 2); assert.equal(f.registrations.size, 0); assert.equal(f.ownedTimers.size, 0);
  for (const entry of entries) { assert.equal(entry.input.authorize(), false); entry.onStatus({ state: 'admitted' }); }
  const count = f.calls.length; f.installed.dispose(); assert.equal(f.calls.length, count);
  expectCode(() => f.status(), 'SERVICE_DISPOSED'); assert.equal(f.count('ingress'), 0);
});
