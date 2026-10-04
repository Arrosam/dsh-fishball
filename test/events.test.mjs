import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RuntimeStore, reference } from '../src/runtime-store.mjs';
import { hash } from '../src/runtime-security.mjs';
import { EventRouter } from '../src/events.mjs';

function fixture(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'df-events-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const owner = {}, host = {}, scope = { ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' };
  let now = 1000000, current = true, authenticated = true, allowed = true, verifies = 0;
  const config = { databasePath: join(directory, 'ledger.sqlite'), encryptionKey: Buffer.alloc(32, 7),
    principals: [{ handle: owner, role: 'owner', scope }, { handle: host, role: 'host', scope }],
    clock: () => now, hostPermission: () => true, forbiddenSecrets: ['private-synthetic-secret-sentinel'] };
  const store = new RuntimeStore(config); t.after(() => store.close());
  const sourceRef = hash('source'), subscriptionRef = hash('subscription'), adapterRef = hash('adapter'), providerRef = hash('provider'), sourceIdentityRef = hash('original-provider-source');
  const sourceSpec = { kind: 'webhook', identityMode: 'unique_id', enabled: true, adapterRef, permissionPolicyRef: hash('permission-policy'), maxEventAgeMs: 10000, rate: { windowMs: 60000, maxEvents: 100 } };
  store.configureSource(owner, { commandRef: hash('source-create'), sourceRef, expectedRevision: 0, spec: sourceSpec });
  store.configureSubscription(owner, { commandRef: hash('subscription-create'), subscriptionRef, sourceRef, expectedRevision: 0, expectedSourceRevision: 1,
    spec: { enabled: true, triggerRef: hash('trigger'), route: 'new_task' } });
  const router = new EventRouter({ store, hostHandle: host, clock: () => now, knownSecrets: config.forbiddenSecrets }); t.after(() => router.dispose());
  const token = router.register({ sourceRef, subscriptionRef, adapterRef, providerRef, sourceIdentityRef,
    verify: options.verify ?? (async payload => { verifies++; if (!authenticated) throw new Error('private callback detail'); return { providerRef, sourceIdentityRef, eventIdRef: reference(payload.id), observedAt: payload.observedAt }; }),
    authorize: options.authorize ?? (async () => allowed), isCurrent: () => current,
    normalize: options.normalize ?? (async payload => ({ goal: payload.body })) });
  const input = (id = 'event-1', extra = {}) => ({ commandRef: hash('command-' + id), taskId: 'task-' + id,
    payload: { id, observedAt: 999990, body: 'Original synthetic instruction that stays encrypted.' }, ...extra });
  const updateSource = spec => store.configureSource(owner, { commandRef: hash('source-update-' + JSON.stringify(spec)), sourceRef, expectedRevision: store.source(host, { sourceRef }).revision, spec });
  return { store, router, token, owner, host, config, sourceRef, subscriptionRef, adapterRef, providerRef, sourceIdentityRef, sourceSpec, input, updateSource,
    verifies: () => verifies, setNow: value => { now = value; }, setCurrent: value => { current = value; }, setAuth: value => { authenticated = value; }, setAllowed: value => { allowed = value; } };
}

test('verified ingress commits encrypted task and complete identity once, survives reopen and does not consume duplicate quota', async t => {
  const f = fixture(t), first = await f.router.ingest(f.token, f.input());
  assert.equal(first.deduplicated, false); assert.equal(first.identityLimit, 'complete_event_identity');
  const duplicate = await f.router.ingest(f.token, { ...f.input(), commandRef: hash('later-delivery'), taskId: 'another-task' });
  assert.equal(duplicate.deduplicated, true); assert.equal(duplicate.task.taskRef, first.task.taskRef);
  assert.equal(f.store.listTasks(f.owner).length, 1); assert.equal(f.store.source(f.host, { sourceRef: f.sourceRef }).rateCount, 1);
  const data = f.store.listData(f.owner, { taskRef: first.task.taskRef });
  assert.equal(f.store.readData(f.owner, { taskRef: first.task.taskRef, recordRef: data[0].recordRef }).content, f.input().payload.body);
  assert.equal(readFileSync(f.config.databasePath).includes(Buffer.from(f.input().payload.body)), false);
  f.store.close(); const reopen = new RuntimeStore(f.config); t.after(() => reopen.close());
  const receipt = reopen.eventReceipt(f.host, { sourceRef: f.sourceRef, subscriptionRef: f.subscriptionRef, eventRef: first.eventRef });
  assert.equal(receipt.taskRef, first.task.taskRef); assert.equal(receipt.eventDigest, first.eventDigest);
  assert.notEqual(receipt.task.status, 'completed'); assert.equal(reopen.listTasks(f.owner).length, 1);
});

test('same identity with edited content conflicts instead of replacing task intent', async t => {
  const f = fixture(t), first = await f.router.ingest(f.token, f.input()), version = first.task.version;
  await assert.rejects(f.router.ingest(f.token, { ...f.input(), commandRef: hash('edit'), payload: { ...f.input().payload, body: 'Changed instruction' } }), { code: 'IDEMPOTENCY_CONFLICT' });
  assert.equal(f.store.task(f.owner, first.task.taskRef).version, version); assert.equal(f.store.listTasks(f.owner).length, 1);
});

test('caller payload is captured before await; source revocation or callback currentness closes admission', async t => {
  for (const mode of ['mutate', 'revoke', 'currentness', 'unload']) {
    await t.test(mode, async t => {
      let resume;
      const f = fixture(t, { authorize: async () => { await new Promise(resolve => { resume = resolve; }); return true; } });
      const input = f.input(), pending = f.router.ingest(f.token, input);
      await Promise.resolve(); await Promise.resolve(); assert.equal(typeof resume, 'function');
      if (mode === 'mutate') input.payload.body = 'Uncaptured replacement';
      if (mode === 'revoke') f.updateSource({ ...f.sourceSpec, enabled: false });
      if (mode === 'currentness') f.setCurrent(false);
      if (mode === 'unload') f.router.dispose();
      resume();
      if (mode === 'mutate') {
        const receipt = await pending, row = f.store.listData(f.owner, { taskRef: receipt.task.taskRef })[0];
        assert.equal(f.store.readData(f.owner, { taskRef: receipt.task.taskRef, recordRef: row.recordRef }).content, 'Original synthetic instruction that stays encrypted.');
      } else { await assert.rejects(pending); assert.equal(f.store.listTasks(f.owner).length, 0); }
    });
  }
});

test('identity flags, group claims and copied registration objects cannot replace private verifier admission', async t => {
  const f = fixture(t); f.setAuth(false);
  await assert.rejects(f.router.ingest(f.token, { ...f.input(), payload: { ...f.input().payload, owner: true, signed: true, groupOwner: true } }), { code: 'EVENT_AUTHENTICATION_FAILED' });
  await assert.rejects(f.router.ingest({ ...f.token }, f.input()), { code: 'EVENT_ADAPTER_INVALID' });
  assert.equal(f.store.listTasks(f.owner).length, 0);
  f.setAuth(true); f.setAllowed('true');
  await assert.rejects(f.router.ingest(f.token, f.input()), { code: 'EVENT_PERMISSION_DENIED' });
});

test('bad descriptors, malformed Unicode and known secrets reject before verification/persistence', async t => {
  const f = fixture(t); let getterCalls = 0;
  const payload = { ...f.input().payload }; Object.defineProperty(payload, 'body', { enumerable: true, get() { getterCalls++; return 'Hidden replacement'; } });
  for (const candidate of [payload, new Proxy(f.input().payload, {}), { ...f.input().payload, body: '\ud800' }, { ...f.input().payload, body: 'private-synthetic-secret-sentinel' }]) {
    await assert.rejects(f.router.ingest(f.token, { ...f.input(), payload: candidate }));
  }
  assert.equal(getterCalls, 0); assert.equal(f.verifies(), 0); assert.equal(f.store.listTasks(f.owner).length, 0);
});

test('expired, future and rate overflow fail with no partial task/quota commit', async t => {
  const f = fixture(t);
  for (const observedAt of [0, 1000001]) await assert.rejects(f.router.ingest(f.token, { ...f.input(), payload: { ...f.input().payload, observedAt } }));
  assert.equal(f.store.source(f.host, { sourceRef: f.sourceRef }).rateCount, 0);
  f.updateSource({ ...f.sourceSpec, rate: { windowMs: 60000, maxEvents: 1 } });
  const first = await f.router.ingest(f.token, f.input());
  await assert.rejects(f.router.ingest(f.token, f.input('event-2')), { code: 'RATE_LIMIT' });
  assert.equal(f.store.listTasks(f.owner).length, 1); assert.equal(f.store.task(f.owner, first.task.taskRef).version, 1);
  assert.equal(f.store.source(f.host, { sourceRef: f.sourceRef }).rateCount, 1);
});

test('a registration with another source subscription cannot admit its privately verified event', async t => {
  const f = fixture(t);
  const foreignSource = hash('foreign-source'), foreignSubscription = hash('foreign-subscription');
  f.store.configureSource(f.owner, { commandRef: hash('foreign-source-create'), sourceRef: foreignSource, expectedRevision: 0, spec: f.sourceSpec });
  f.store.configureSubscription(f.owner, { commandRef: hash('foreign-sub-create'), sourceRef: foreignSource, subscriptionRef: foreignSubscription,
    expectedRevision: 0, expectedSourceRevision: 1, spec: { enabled: true, triggerRef: hash('trigger'), route: 'new_task' } });
  const token = f.router.register({ sourceRef: f.sourceRef, subscriptionRef: foreignSubscription, adapterRef: f.adapterRef,
    providerRef: f.providerRef, sourceIdentityRef: f.sourceIdentityRef, verify: () => ({ providerRef: f.providerRef,
      sourceIdentityRef: f.sourceIdentityRef, eventIdRef: hash('event'), observedAt: 999990 }),
    authorize: () => true, isCurrent: () => true, normalize: () => ({ goal: 'Bounded event.' }) });
  await assert.rejects(f.router.ingest(token, f.input()), { code: 'ROUTE_MISMATCH' });
  assert.equal(f.store.listTasks(f.owner).length, 0); assert.equal(f.store.source(f.host, { sourceRef: f.sourceRef }).rateCount, 0);
});

test('missing provider identity is explicitly degraded to same command, without guaranteed resend deduplication', async t => {
  let f;
  f = fixture(t, { verify: async payload => ({ providerRef: f.providerRef, sourceIdentityRef: f.sourceIdentityRef, observedAt: payload.observedAt }) });
  f.updateSource({ ...f.sourceSpec, identityMode: 'unavailable' });
  const first = await f.router.ingest(f.token, f.input()); assert.equal(first.identityLimit, 'same_command_only');
  const same = await f.router.ingest(f.token, f.input()); assert.equal(same.deduplicated, true);
  const next = await f.router.ingest(f.token, { ...f.input(), commandRef: hash('different-command'), taskId: 'different-task' });
  assert.equal(next.deduplicated, false); assert.equal(f.store.listTasks(f.owner).length, 2);
});

test('subscription changes cannot replay a complete original provider event into a new task', async t => {
  const f = fixture(t), first = await f.router.ingest(f.token, f.input());
  const secondSubscriptionRef = hash('second-subscription');
  f.store.configureSubscription(f.owner, { commandRef: hash('second-subscription'), sourceRef: f.sourceRef, subscriptionRef: secondSubscriptionRef, expectedRevision: 0, expectedSourceRevision: 1, spec: { enabled: true, triggerRef: hash('trigger2'), route: 'new_task' } });
  const token = f.router.register({ sourceRef: f.sourceRef, subscriptionRef: secondSubscriptionRef, adapterRef: f.adapterRef, providerRef: f.providerRef, sourceIdentityRef: f.sourceIdentityRef,
    verify: async payload => ({ providerRef: f.providerRef, sourceIdentityRef: f.sourceIdentityRef, eventIdRef: reference(payload.id), observedAt: payload.observedAt }), authorize: async () => true, isCurrent: () => true, normalize: async payload => ({ goal: payload.body }) });
  const replay = await f.router.ingest(token, { ...f.input(), commandRef: hash('different-subscription-command'), taskId: 'other-route-task' });
  assert.equal(replay.deduplicated, true); assert.equal(replay.task.taskRef, first.task.taskRef); assert.equal(f.store.listTasks(f.owner).length, 1);
});
