import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RuntimeStore } from '../src/runtime-store.mjs';
import { hash, canonicalDigest } from '../src/runtime-security.mjs';
import { EventRouter } from '../src/events.mjs';
import { ScheduleDriver } from '../src/scheduler.mjs';
import { ChatAdapter, chatChannel } from '../src/chat.mjs';
import { ResultPipeline } from '../src/results.mjs';

// Independent module oracles: real encrypted SQLite, synthetic privately issued
// provider facts and explicit fake timer jobs. No Web, account or model effect.
const secret = 'DF-EVENT-INDEPENDENT-SYNTHETIC-SECRET';
const h = value => hash(`event-independent-${value}`);
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function fixture(t, { kind = 'webhook', now = 1000000, spec = {} } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'df-event-independent-'));
  const owner = {}, host = {}, foreignOwner = {}, state = { now, serial: 0, current: true, permission: true, alive: true, verifies: 0 };
  const scope = { ownerId: 'independent-event-owner', workspaceId: 'independent-event-workspace' };
  const config = { databasePath: join(directory, 'ledger.sqlite'), encryptionKey: Buffer.alloc(32, 91),
    principals: [{ handle: owner, role: 'owner', scope }, { handle: host, role: 'host', scope },
      { handle: foreignOwner, role: 'owner', scope: { ...scope, ownerId: 'other-event-owner' } }],
    limits: { maxActive: 8 }, clock: () => state.now, hostPermission: () => true, forbiddenSecrets: [secret] };
  let store = new RuntimeStore(config);
  const systems = [], issued = new Map();
  const refs = { sourceRef: h('source'), subscriptionRef: h('subscription'), adapterRef: h('adapter'), providerRef: h('provider'), sourceIdentityRef: h('original-source') };
  const route = { pairingRef: h('pairing'), pairingRevision: 1, principalRef: h('paired-principal'), conversationRef: h('private-window'),
    conversationKind: 'private', threadRef: h('thread') };
  const command = () => h(`command-${++state.serial}`);
  const sourceSpec = { kind, identityMode: 'unique_id', enabled: true, adapterRef: refs.adapterRef, permissionPolicyRef: h('permission'),
    maxEventAgeMs: 10000000, rate: { windowMs: 60000, maxEvents: 128 }, ...(kind === 'chat' ? { routeBinding: route } : {}), ...spec };
  store.configureSource(owner, { commandRef: command(), sourceRef: refs.sourceRef, expectedRevision: 0, spec: sourceSpec });
  store.configureSubscription(owner, { commandRef: command(), ...refsForSubscription(refs), expectedRevision: 0, expectedSourceRevision: 1,
    spec: { enabled: true, triggerRef: h('trigger'), route: 'new_task' } });
  const issue = ({ id, content = 'Private synthetic instruction.', eventKind = 'message', intent, attachments = [], proof = {} } = {}) => {
    const serial = ++state.serial, payload = { ticket: `issued-${serial}`, body: content };
    issued.set(payload.ticket, { digest: canonicalDigest(payload), normalized: { content, attachments }, goal: content,
      proof: { providerRef: refs.providerRef, sourceIdentityRef: refs.sourceIdentityRef, eventIdRef: h(id ?? `event-${serial}`), observedAt: state.now,
        ...(kind === 'chat' ? { routeBinding: { ...route }, eventKind, ...(intent ? { requestDigest: canonicalDigest(intent) } : {}) } : {}), ...proof } });
    return payload;
  };
  const verify = payload => {
    state.verifies++; const issuedFact = issued.get(payload.ticket);
    if (!issuedFact || issuedFact.digest !== canonicalDigest(payload)) throw Error(secret);
    return issuedFact.proof;
  };
  const makeRouter = () => {
    const router = new EventRouter({ store, hostHandle: host, clock: () => state.now, isAlive: () => state.alive, knownSecrets: [secret] });
    systems.push(router); return router;
  };
  const f = { state, config, owner, host, foreignOwner, route, refs, sourceSpec, issued, command, issue, verify,
    get store() { return store; }, makeRouter,
    registration: extra => ({ ...refs, verify, authorize: () => state.permission, isCurrent: () => state.current,
      normalize: payload => ({ goal: issued.get(payload.ticket).goal }), ...extra }),
    input: (payload = issue()) => ({ commandRef: command(), taskId: `private-task-${++state.serial}`, payload }),
    bind: (taskRef) => { const task = store.task(owner, taskRef); return { taskRef, commandRef: command(), expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch }; },
    updateSource: changes => store.configureSource(owner, { commandRef: command(), sourceRef: refs.sourceRef,
      expectedRevision: store.source(host, { sourceRef: refs.sourceRef }).revision, spec: { ...sourceSpec, ...changes } }),
    updateSubscription: changes => { const previous = store.subscription(host, { subscriptionRef: refs.subscriptionRef });
      return store.configureSubscription(owner, { commandRef: command(), ...refsForSubscription(refs), expectedRevision: previous.revision,
        expectedSourceRevision: store.source(host, { sourceRef: refs.sourceRef }).revision, spec: { ...previous.spec, ...changes } }); },
    reopen: () => { systems.forEach(item => item.dispose()); store.close(); store = new RuntimeStore(config); },
    retain: item => { systems.push(item); return item; } };
  t.after(() => { systems.forEach(item => item.dispose()); try { store.close(); } finally { rmSync(directory, { recursive: true, force: true }); } });
  return f;
}
const refsForSubscription = refs => ({ sourceRef: refs.sourceRef, subscriptionRef: refs.subscriptionRef });
const unchangedIngress = f => { assert.equal(f.store.listTasks(f.owner).length, 0); assert.equal(f.store.source(f.host, { sourceRef: f.refs.sourceRef }).rateCount, 0); };
function sizedPayload(f, payload, bytes) {
  payload.body = '🌲"\n\\'.repeat(16);
  payload.body += 'x'.repeat(bytes - Buffer.byteLength(JSON.stringify(payload)));
  assert.equal(Buffer.byteLength(JSON.stringify(payload)), bytes);
  f.issued.get(payload.ticket).digest = canonicalDigest(payload);
  return payload;
}

function chatFixture(t, options = {}) {
  const f = fixture(t, { kind: 'chat' });
  f.store.policy(f.owner, { commandRef: f.command(), expectedVersion: 1, limits: {}, modelPolicy: { version: 1, presetRefs: [h('preset')], catalogEvidenceRef: h('catalog') } });
  const receipt = (record, state = 'unknown') => ({ artifactRef: record.artifactRef, artifactVersion: record.artifactVersion, digest: record.digest,
    recipientRef: record.recipientRef, channelRef: record.channelRef, state, permissionState: state === 'delivered' ? 'granted' : 'unknown',
    openability: state === 'delivered' ? 'verified' : 'unknown', observedAt: f.state.now, evidenceRef: h(`receipt-${state}-${f.state.now}`) });
  const make = () => {
    const router = f.makeRouter();
    const chat = f.retain(new ChatAdapter({ store: f.store, hostHandle: f.host, router, ...f.refs,
      clock: () => f.state.now, isAlive: () => f.state.alive, knownSecrets: [secret], maxAttachments: 2, maxAttachmentBytes: 64,
      verify: f.verify, authorize: options.authorize ?? (() => f.state.permission), isCurrent: () => f.state.current && f.state.permission,
      normalize: payload => f.issued.get(payload.ticket).normalized,
      attachmentReader: options.attachmentReader ?? (() => ({ bytes: Buffer.from('abcdef'), permissionState: 'granted', observedAt: f.state.now, evidenceRef: h('reader-evidence') })),
      outbound: { authorize: options.deliveryAuthorize ?? (() => f.state.permission), isCurrent: () => f.state.current,
        send: options.send ?? (({ record }) => receipt(record)), query: options.query ?? (({ record }) => receipt(record)), open: ({ record }) => receipt(record, 'delivered') } }));
    return { router, chat };
  };
  Object.assign(f, make());
  f.make = make;
  f.ingest = extra => f.chat.ingest(f.input(f.issue(extra)));
  f.descriptor = extra => ({ attachmentRef: h('attachment'), sourceRef: f.refs.sourceRef, routeDigest: canonicalDigest(f.route),
    digest: hash(Buffer.from('abcdef')), byteLength: 6, name: 'synthetic.txt', mediaType: 'text/plain', permissionState: 'granted',
    observedAt: f.state.now, expiresAt: f.state.now + 10000, evidenceRef: h('attachment-proof'), ...extra });
  f.pipeline = () => new ResultPipeline(f.store, { hostHandle: f.host, recipientAdapter: f.chat.recipientAdapter() });
  f.action = (taskRef, targetDigest, dataDigest, kind = 'write', generationRef = h(`generation-${++f.state.serial}`)) => {
    const action = f.store.planAction(f.owner, { ...f.bind(taskRef), spec: { actionRef: f.command(), kind, role: kind === 'review' ? 'review' : 'worker',
      targetDigest, dataDigest, units: 1, charges: { runtimeMs: 0, usageUnits: 0, costState: 'estimated', costEstimateMicros: 1 },
      attemptGroupRef: f.command(), attemptIndex: 1, resourcePolicyVersion: 2, modelPolicyVersion: 1,
      model: { presetRef: h('preset'), modelRef: h('model'), reasoningRef: h('reasoning'), catalogEvidenceRef: h('catalog') },
      executor: { mode: 'none', generationRef, environmentRef: h('environment'), bindingDigest: h('binding'), toolsDigest: h('tools'), permissionPolicyDigest: h('permissions') } } });
    f.store.grantAction(f.owner, { ...f.bind(taskRef), actionRef: action.actionRef, actionDigest: action.actionDigest, expiresAt: f.state.now + 100000 });
    return action;
  };
  f.delivery = taskRef => {
    const pipeline = f.pipeline();
    const artifact = pipeline.writeArtifact(f.owner, { ...f.bind(taskRef), artifactRef: f.command(), version: 1, content: 'Independently reviewed synthetic result.' });
    const reviewer = {}, generationRef = f.command();
    f.store.bindExecution(f.host, reviewer, { taskRef, role: 'reviewer', generationRef, sessionRef: f.command(), readRecordRefs: [artifact.recordRef] });
    const review = f.action(taskRef, h('review-target'), artifact.digest, 'review', generationRef);
    const claim = f.store.claimAction(f.host, { ...f.bind(taskRef), actionRef: review.actionRef, actionDigest: review.actionDigest });
    pipeline.verify(reviewer, { taskRef, commandRef: f.command(), artifactRef: artifact.artifactRef, version: artifact.version, digest: artifact.digest, verdict: 'passed', evidenceRef: h('review-proof') });
    f.store.settleAction(f.host, { taskRef, commandRef: f.command(), claimRef: claim.claimRef, generationRef, outcome: 'completed', evidenceRef: h('known-review-stop') });
    const delivery = pipeline.acceptDelivery(f.owner, { ...f.bind(taskRef), deliveryRef: f.command(), artifactRef: artifact.artifactRef,
      artifactVersion: artifact.version, digest: artifact.digest, recipientRef: f.route.principalRef,
      channelRef: chatChannel({ providerRef: f.refs.providerRef, sourceIdentityRef: f.refs.sourceIdentityRef, route: f.route }) });
    const action = f.action(taskRef, delivery.targetDigest, delivery.digest);
    return { delivery, input: { ...f.bind(taskRef), deliveryRef: delivery.deliveryRef, actionRef: action.actionRef, actionDigest: action.actionDigest } };
  };
  return f;
}

function scheduleFixture(t, options = {}) {
  const f = fixture(t, { kind: 'schedule', now: options.now ?? 180001 });
  const spec = { kind: 'interval', timezone: 'Etc/UTC', catchUp: 'coalesce', maxAgeMs: 1000000,
    maxScanMinutes: 6000, anchorAt: 0, intervalMs: 60000, ...options.spec };
  f.updateSubscription({ triggerRef: canonicalDigest(spec) });
  let next = 0; const jobs = new Map();
  const timers = { set: (callback, delay) => { const id = ++next; jobs.set(id, { callback, delay }); return id; }, clear: id => jobs.delete(id) };
  const make = () => {
    const router = f.makeRouter();
    const driver = f.retain(new ScheduleDriver({ store: f.store, hostHandle: f.host, router, clock: () => f.state.now,
      isAlive: () => f.state.alive, timers }));
    const registration = { ...f.refs, spec, startAfter: options.startAfter ?? 0, goal: 'Explicit local scheduled instruction.',
      externalEffect: options.externalEffect ?? false, authorize: options.authorize ?? (() => f.state.permission), isCurrent: () => f.state.current };
    return { driver, registration, token: driver.register(registration) };
  };
  Object.assign(f, make()); Object.assign(f, { jobs, timers, spec, make }); return f;
}

test('independent event registrations enforce 128 opaque entries and share 32 pending authenticate/ingest slots', async t => {
  const f = fixture(t), router = f.makeRouter(), gate = defer(); let calls = 0;
  const registration = f.registration({ verify: async payload => { calls++; await gate.promise; return f.verify(payload); } });
  const tokens = Array.from({ length: 128 }, () => router.register(registration));
  assert.throws(() => router.register(registration), { code: 'EVENT_ADAPTER_CAPACITY' });
  router.unregister(tokens[127]); const replacement = router.register(registration);
  await assert.rejects(router.authenticate({ ...replacement }, f.issue()), { code: 'EVENT_ADAPTER_INVALID' });
  const pending = Array.from({ length: 31 }, () => router.authenticate(tokens[0], f.issue()));
  pending.push(router.ingest(tokens[0], f.input()));
  await assert.rejects(router.authenticate(tokens[0], f.issue()), { code: 'EVENT_ADAPTER_BUSY' });
  await assert.rejects(router.ingest(tokens[0], f.input()), { code: 'EVENT_ADAPTER_BUSY' });
  assert.equal(calls, 32); unchangedIngress(f); gate.resolve();
  const values = await Promise.all(pending); assert.equal(values.at(-1).deduplicated, false);
  assert.equal(f.store.listTasks(f.owner).length, 1);
  assert.equal((await router.authenticate(replacement, f.issue())).source.sourceRef, f.refs.sourceRef);
});

test('independent event final currentness is synchronous strict true, errors stay redacted and pending slots release', async t => {
  for (const mode of ['promise', 'string', 'throw', 'proof-provider', 'proof-accessor']) await t.test(mode, async t => {
    const f = fixture(t), router = f.makeRouter(); let traps = 0, normalized = 0;
    const token = router.register(f.registration({ isCurrent: () => {
      if (mode === 'promise') return Promise.resolve(true); if (mode === 'string') return 'true'; if (mode === 'throw') throw Error(secret); return true;
    }, verify: payload => {
      const proof = f.verify(payload);
      if (mode === 'proof-provider') return { ...proof, providerRef: h('wrong-provider') };
      if (mode === 'proof-accessor') { const bad = { ...proof }; Object.defineProperty(bad, 'observedAt', { enumerable: true, get() { traps++; throw Error(secret); } }); return bad; }
      return proof;
    }, normalize: () => { normalized++; return { goal: 'Should not normalize.' }; } }));
    for (let index = 0; index < 33; index++) await assert.rejects(router.ingest(token, f.input()), error => {
      assert.ok(!error.stack.includes(secret)); assert.notEqual(error.code, 'EVENT_ADAPTER_BUSY'); return true;
    });
    assert.equal(traps, 0); assert.equal(normalized, 0); unchangedIngress(f);
  });
});

test('independent event authenticate and ingress serialized UTF-8 boundary includes escaping and rejects N+1 before verification', async t => {
  for (const bytes of [65535, 65536, 65537]) await t.test(String(bytes), async t => {
    const f = fixture(t), router = f.makeRouter(), token = router.register(f.registration());
    const payload = sizedPayload(f, f.issue(), bytes);
    if (bytes <= 65536) {
      const authenticated = await router.authenticate(token, payload);
      assert.equal(authenticated.payload.body, payload.body); assert.equal(Object.isFrozen(authenticated.payload), true);
      assert.equal(f.state.verifies, 1); unchangedIngress(f);
      const admitted = await router.ingest(token, f.input(payload));
      assert.equal(f.state.verifies, 2); assert.equal(f.store.listTasks(f.owner).length, 1);
      assert.equal(f.store.readData(f.owner, { taskRef: admitted.task.taskRef, recordRef: admitted.goalRecordRef }).content, 'Private synthetic instruction.');
      assert.equal(f.store.snapshot(f.owner, { taskRef: admitted.task.taskRef }).actions.length, 0);
    } else {
      await assert.rejects(router.authenticate(token, payload)); await assert.rejects(router.ingest(token, f.input(payload)));
      assert.equal(f.state.verifies, 0); unchangedIngress(f);
    }
  });
});

test('independent event expiry is rechecked after normalization await and secret callback output cannot reach persistence', async t => {
  for (const mode of [99, 100, 101, 'secret']) await t.test(String(mode), async t => {
    const f = fixture(t), router = f.makeRouter(), reached = defer(), gate = defer(); f.updateSource({ maxEventAgeMs: 100 });
    const token = router.register(f.registration({ normalize: async payload => { reached.resolve(); await gate.promise; return { goal: mode === 'secret' ? secret : payload.body }; } }));
    const input = f.input(), pending = router.ingest(token, input); await reached.promise;
    if (typeof mode === 'number') f.state.now += mode;
    gate.resolve();
    if (mode === 99 || mode === 100) assert.equal((await pending).deduplicated, false);
    else { await assert.rejects(pending, error => {
      assert.equal(error.code, mode === 'secret' ? 'EVENT_NORMALIZATION_FAILED' : 'EVENT_EXPIRED');
      assert.ok(!error.stack.includes(secret)); return true;
    }); unchangedIngress(f); }
  });
});

test('independent event normalizer await preserves captured payload and fences revoke/unregister/dispose before the ledger lock', async t => {
  for (const mode of ['capture', 'revoke', 'unregister', 'dispose', 'current']) await t.test(mode, async t => {
    const f = fixture(t), router = f.makeRouter(), reached = defer(), gate = defer();
    const token = router.register(f.registration({ normalize: async payload => { reached.resolve(); await gate.promise; return { goal: payload.body }; } }));
    const input = f.input(), original = input.payload.body, pending = router.ingest(token, input); await reached.promise;
    input.payload.body = 'Changed after trusted callbacks began.';
    if (mode === 'revoke') f.updateSource({ enabled: false });
    if (mode === 'unregister') router.unregister(token); if (mode === 'dispose') router.dispose(); if (mode === 'current') f.state.current = false;
    gate.resolve();
    if (mode === 'capture') { const receipt = await pending;
      assert.equal(f.store.readData(f.owner, { taskRef: receipt.task.taskRef, recordRef: receipt.goalRecordRef }).content, original);
    } else { await assert.rejects(pending); unchangedIngress(f); }
  });
});

test('independent event re-registration of the same provider identity under a new source cannot mint a second task or quota', async t => {
  const f = fixture(t), router = f.makeRouter(), token = router.register(f.registration()), payload = f.issue({ id: 'durable-provider-id' });
  const first = await router.ingest(token, f.input(payload));
  const sourceRef = h('replacement-source'), subscriptionRef = h('replacement-subscription');
  f.store.configureSource(f.owner, { commandRef: f.command(), sourceRef, expectedRevision: 0, spec: f.sourceSpec });
  f.store.configureSubscription(f.owner, { commandRef: f.command(), sourceRef, subscriptionRef, expectedRevision: 0, expectedSourceRevision: 1,
    spec: { enabled: true, triggerRef: h('replacement-trigger'), route: 'new_task' } });
  const moved = router.register(f.registration({ sourceRef, subscriptionRef }));
  const duplicate = await router.ingest(moved, f.input(payload));
  assert.equal(duplicate.deduplicated, true); assert.equal(duplicate.task.taskRef, first.task.taskRef);
  assert.equal(f.store.listTasks(f.owner).length, 1); assert.equal(f.store.source(f.host, { sourceRef }).rateCount, 0);
  assert.equal(f.store.source(f.host, { sourceRef: f.refs.sourceRef }).rateCount, 1);
  f.reopen(); assert.equal(f.store.listTasks(f.owner).length, 1);
});

test('independent chat simultaneous exact provider control replies apply once; changing intent or chosen command never broadens authority', async t => {
  const f = chatFixture(t), { task } = await f.ingest(), input = { taskRef: task.taskRef, expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch, kind: 'pause' };
  const payload = f.issue({ id: 'one-control-id', eventKind: 'control', intent: { ...input, kind: 'control', control: input.kind } });
  const [a, b] = await Promise.all([f.chat.control({ ...input, payload }), f.chat.control({ ...input, payload })]);
  assert.equal(a.task.version, b.task.version); assert.equal(a.task.version, task.version + 1);
  assert.equal(f.store.snapshot(f.owner, { taskRef: task.taskRef }).control, 'paused');
  const verifies = f.state.verifies;
  await assert.rejects(f.chat.control({ ...input, payload, commandRef: f.command() }), { code: 'INVALID_INPUT' });
  assert.equal(f.state.verifies, verifies);
  await assert.rejects(f.chat.control({ ...input, kind: 'cancel', payload }), { code: 'CHAT_REQUEST_BINDING' });
  const current = f.store.task(f.owner, task.taskRef), resume = { taskRef: current.taskRef, expectedTaskVersion: current.version, expectedAuthEpoch: current.authEpoch, kind: 'resume' };
  await assert.rejects(f.chat.control({ ...resume, payload: f.issue({ id: 'one-control-id', eventKind: 'control', intent: { ...resume, kind: 'control', control: 'resume' } }) }), { code: 'IDEMPOTENCY_CONFLICT' });
  assert.equal(f.store.task(f.owner, task.taskRef).version, current.version);
});

test('independent chat status/control/attachment capture their 64KiB payload separately from exact request bindings', async t => {
  for (const kind of ['status', 'control', 'attachment']) for (const bytes of [65535, 65536, 65537]) await t.test(`${kind}:${bytes}`, async t => {
    let reads = 0;
    const f = chatFixture(t, { attachmentReader: () => { reads++; return { bytes: Buffer.from('abcdef'), permissionState: 'granted', observedAt: f.state.now, evidenceRef: h('bounded-reader') }; } });
    const descriptor = f.descriptor(), { task } = await f.ingest({ attachments: [descriptor] });
    const intent = kind === 'status' ? { kind, taskRef: task.taskRef } : kind === 'attachment' ? { kind, taskRef: task.taskRef, attachmentRef: descriptor.attachmentRef }
      : { kind, taskRef: task.taskRef, expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch, control: 'pause' };
    const payload = sizedPayload(f, f.issue({ eventKind: kind, intent }), bytes);
    const input = { taskRef: task.taskRef, payload, ...(kind === 'attachment' ? { attachmentRef: descriptor.attachmentRef } : {}),
      ...(kind === 'control' ? { expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch, kind: 'pause' } : {}) };
    const verifies = f.state.verifies;
    if (bytes <= 65536) {
      const result = await f.chat[kind === 'attachment' ? 'readAttachment' : kind](input);
      assert.equal(f.state.verifies, verifies + 1);
      if (kind === 'status') assert.equal(result.task.taskRef, task.taskRef);
      if (kind === 'control') assert.equal(f.store.snapshot(f.owner, { taskRef: task.taskRef }).control, 'paused');
      if (kind === 'attachment') { assert.equal(result.bytes.toString(), 'abcdef'); assert.equal(reads, 1); }
    } else {
      await assert.rejects(f.chat[kind === 'attachment' ? 'readAttachment' : kind](input));
      assert.equal(f.state.verifies, verifies); assert.equal(reads, 0);
      assert.equal(f.store.task(f.owner, task.taskRef).version, task.version);
      assert.equal(f.store.snapshot(f.owner, { taskRef: task.taskRef }).control, 'active');
    }
  });
});

test('independent chat conflicting attachment descriptors in two authenticated event records stop before any download', async t => {
  let reads = 0; const f = chatFixture(t, { attachmentReader: () => { reads++; throw Error('unexpected reader'); } });
  const descriptor = f.descriptor(), first = await f.ingest({ attachments: [descriptor] });
  f.updateSubscription({ route: 'supplement', targetTaskRef: first.task.taskRef });
  await f.ingest({ content: 'Fresh supplementary instruction.', attachments: [{ ...descriptor, name: 'different-material.txt', digest: hash(Buffer.from('xxxxxx')) }] });
  const intent = { kind: 'attachment', taskRef: first.task.taskRef, attachmentRef: descriptor.attachmentRef };
  await assert.rejects(f.chat.readAttachment({ taskRef: first.task.taskRef, attachmentRef: descriptor.attachmentRef,
    payload: f.issue({ eventKind: 'attachment', intent }) }), { code: 'CHAT_ATTACHMENT_CONFLICT' });
  assert.equal(reads, 0); assert.equal(f.store.listTasks(f.owner).length, 1);
});

test('independent chat attachment reads exact native view slots, copies bytes and ignores hostile view properties', async t => {
  let traps = 0; const backing = Buffer.from(`${secret}:abcdef:outside`), offset = Buffer.byteLength(secret) + 1;
  const view = new Uint8Array(backing.buffer, backing.byteOffset + offset, 6);
  for (const property of ['buffer', 'byteOffset', 'byteLength']) Object.defineProperty(view, property, { get() { traps++; throw Error(secret); } });
  const f = chatFixture(t, { attachmentReader: () => ({ bytes: view, permissionState: 'granted', observedAt: f.state.now, evidenceRef: h('view-proof') }) });
  const descriptor = f.descriptor(), { task } = await f.ingest({ attachments: [descriptor] });
  const intent = { kind: 'attachment', taskRef: task.taskRef, attachmentRef: descriptor.attachmentRef };
  const result = await f.chat.readAttachment({ taskRef: task.taskRef, attachmentRef: descriptor.attachmentRef, payload: f.issue({ eventKind: 'attachment', intent }) });
  assert.equal(result.bytes.toString(), 'abcdef'); assert.equal(traps, 0);
  result.bytes[0] = 0; assert.equal(backing.subarray(offset, offset + 6).toString(), 'abcdef');
  assert.equal(readFileSync(f.config.databasePath).includes(Buffer.from('abcdef')), false);
});

test('independent chat attachment expiry is exclusive and late private invalidation exposes no bytes', async t => {
  for (const mode of ['before', 'exact', 'after', 'revoke', 'dispose', 'secret']) await t.test(mode, async t => {
    const reached = defer(), gate = defer(); let reads = 0;
    const f = chatFixture(t, { attachmentReader: async () => { reads++; reached.resolve(); return gate.promise; } });
    const body = mode === 'secret' ? Buffer.from(secret) : Buffer.from('abcdef');
    const descriptor = f.descriptor({ digest: hash(body), byteLength: body.length });
    const { task } = await f.ingest({ attachments: [descriptor] });
    const intent = { kind: 'attachment', taskRef: task.taskRef, attachmentRef: descriptor.attachmentRef };
    const pending = f.chat.readAttachment({ taskRef: task.taskRef, attachmentRef: descriptor.attachmentRef, payload: f.issue({ eventKind: 'attachment', intent }) });
    await reached.promise;
    if (mode === 'before') f.state.now = descriptor.expiresAt - 1;
    if (mode === 'exact') f.state.now = descriptor.expiresAt;
    if (mode === 'after') f.state.now = descriptor.expiresAt + 1;
    if (mode === 'revoke') f.state.current = false; if (mode === 'dispose') f.chat.dispose();
    gate.resolve({ bytes: body, permissionState: 'granted', observedAt: 1000000, evidenceRef: h('download-proof') });
    if (mode === 'before') assert.equal((await pending).bytes.toString(), 'abcdef');
    else await assert.rejects(pending, error => { assert.ok(!error.stack.includes(secret)); return true; });
    assert.equal(reads, 1); assert.equal(f.store.listTasks(f.owner).length, 1);
  });
});

test('independent chat outbound permission await cannot inherit a reconfigured route; already admitted outbox stays unknown-held', async t => {
  const reached = defer(), gate = defer(); let sends = 0;
  const f = chatFixture(t, { deliveryAuthorize: async () => { reached.resolve(); return gate.promise; }, send: () => { sends++; throw Error(secret); } });
  const { task } = await f.ingest(), item = f.delivery(task.taskRef), pipeline = f.pipeline();
  const pending = pipeline.dispatch(f.owner, item.input); await reached.promise;
  f.updateSource({ routeBinding: { ...f.route, conversationRef: h('different-window') } }); gate.resolve(true);
  const result = await pending; assert.equal(result.delivery.state, 'unknown'); assert.equal(sends, 0);
  const action = f.store.snapshot(f.owner, { taskRef: task.taskRef }).actions.find(row => row.actionRef === item.input.actionRef);
  assert.ok(action.reservationRef); assert.equal(action.releaseEvidenceRef, null);
  f.reopen(); Object.assign(f, f.make());
  assert.equal((await f.pipeline().dispatch(f.owner, item.input)).dispatched, false); assert.equal(sends, 0);
  assert.equal(f.store.task(f.owner, task.taskRef).status, 'recovery_required');
});

test('independent schedule registration and explicit timer cadence enforce their exact capacity and boundary values', async t => {
  const f = scheduleFixture(t), tokens = [f.token];
  for (let index = 1; index < 32; index++) tokens.push(f.driver.register(f.registration));
  assert.throws(() => f.driver.register(f.registration), { code: 'SCHEDULE_CAPACITY' });
  f.driver.unregister(tokens.pop()); f.driver.register(f.registration);
  for (const pollMs of [59999, 86400001]) assert.throws(() => f.driver.start(f.token, { pollMs, onStatus: () => {} }), { code: 'INVALID_INPUT' });
  for (const pollMs of [60000, 86400000]) {
    f.driver.start(f.token, { pollMs, onStatus: () => {} }); assert.equal(f.jobs.size, 1);
    assert.equal([...f.jobs.values()][0].delay, pollMs); f.driver.stop(f.token); assert.equal(f.jobs.size, 0);
  }
  unchangedIngress(f); await assert.rejects(f.driver.tick({ ...f.token }), { code: 'SCHEDULE_REGISTRATION_INVALID' });
});

test('independent schedule stop/unregister/dispose fences a fired timer awaiting permission before any durable admission', async t => {
  for (const mode of ['stop', 'restart', 'unregister', 'dispose']) await t.test(mode, async t => {
    const reached = defer(), gate = defer(), statuses = [];
    const f = scheduleFixture(t, { authorize: async () => { reached.resolve(); return gate.promise; } });
    f.driver.start(f.token, { pollMs: 60000, onStatus: value => statuses.push(value) });
    const [id, job] = [...f.jobs.entries()][0]; f.jobs.delete(id); const pending = job.callback(); await reached.promise;
    await assert.rejects(f.driver.tick(f.token), { code: 'SCHEDULE_BUSY' });
    if (mode === 'restart') {
      f.driver.stop(f.token); f.driver.start(f.token, { pollMs: 60000, onStatus: value => statuses.push(value) });
    } else f.driver[mode](...(mode === 'dispose' ? [] : [f.token]));
    gate.resolve(true); await pending;
    unchangedIngress(f); assert.equal(f.jobs.size, mode === 'restart' ? 1 : 0); assert.equal(statuses.length, 0);
    if (mode === 'restart') {
      const [newId, newJob] = [...f.jobs.entries()][0]; f.jobs.delete(newId); await newJob.callback();
      assert.equal(f.store.listTasks(f.owner).length, 1); assert.equal(f.jobs.size, 1); assert.equal(statuses.length, 1);
    } else if (mode === 'stop') {
      assert.equal((await f.driver.tick(f.token)).state, 'admitted');
      assert.equal(f.store.listTasks(f.owner).length, 1); assert.equal(f.jobs.size, 0);
    }
  });
});

test('independent schedule a callback already queued when stop clears its timer cannot begin authentication or reschedule', async t => {
  let calls = 0; const f = scheduleFixture(t, { authorize: () => { calls++; return true; } }), statuses = [];
  f.driver.start(f.token, { pollMs: 60000, onStatus: value => statuses.push(value) });
  const job = [...f.jobs.values()][0]; f.driver.stop(f.token); assert.equal(f.jobs.size, 0);
  await job.callback(); unchangedIngress(f); assert.equal(calls, 0); assert.equal(statuses.length, 0); assert.equal(f.jobs.size, 0);
});

test('independent schedule persisted approved plan cannot cross a subscription revision after reopen', async t => {
  const f = scheduleFixture(t, { spec: { catchUp: 'verify' } }), pending = await f.driver.tick(f.token);
  const approval = { commandRef: f.command(), ...refsForSubscription(f.refs), expectedSourceRevision: 1, expectedSubscriptionRevision: 2,
    clockRef: pending.clockRef, expectedCursor: null, planDigest: pending.planDigest };
  assert.throws(() => f.store.approveEventClock(f.foreignOwner, approval), { code: 'STALE_SOURCE' });
  assert.equal(f.store.eventClock(f.host, { ...refsForSubscription(f.refs), clockRef: pending.clockRef }).pendingVerification.approved, false);
  f.store.approveEventClock(f.owner, approval); f.reopen(); Object.assign(f, f.make());
  const old = f.store.eventClock(f.host, { ...refsForSubscription(f.refs), clockRef: pending.clockRef });
  assert.equal(old.pendingVerification.approved, true);
  f.updateSubscription({ triggerRef: canonicalDigest(f.spec) });
  await assert.rejects(f.driver.tick(f.token), { code: 'SCHEDULE_PLAN_STALE' });
  const retained = f.store.eventClock(f.host, { ...refsForSubscription(f.refs), clockRef: pending.clockRef });
  assert.deepEqual(retained, old); unchangedIngress(f);
});
