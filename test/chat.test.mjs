import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RuntimeStore } from '../src/runtime-store.mjs';
import { hash, canonicalDigest } from '../src/runtime-security.mjs';
import { EventRouter } from '../src/events.mjs';
import { ChatAdapter, chatChannel } from '../src/chat.mjs';
import { ResultPipeline } from '../src/results.mjs';

function fixture(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'df-chat-contract-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const owner = {}, host = {}, other = {}, scope = { ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' };
  let now = 1000000, current = true, connected = true, permission = true, serial = 0, verifies = 0;
  const config = { databasePath: join(directory, 'ledger.sqlite'), encryptionKey: Buffer.alloc(32, 28),
    principals: [{ handle: owner, role: 'owner', scope }, { handle: host, role: 'host', scope },
      { handle: other, role: 'owner', scope: { ownerId: 'synthetic-other-owner', workspaceId: scope.workspaceId } }],
    limits: { maxActive: 8 }, clock: () => now, hostPermission: () => true, forbiddenSecrets: ['synthetic-private-sentinel'] };
  let store = new RuntimeStore(config); t.after(() => store.close());
  const sourceRef = hash('chat-source'), subscriptionRef = hash('chat-subscription'), adapterRef = hash('chat-adapter'),
    providerRef = hash('unselected-synthetic-provider'), sourceIdentityRef = hash('original-provider-source');
  let route = { pairingRef: hash('pairing'), pairingRevision: 1, principalRef: hash('paired-owner'),
    conversationRef: hash('original-private-window'), threadRef: hash('original-thread'), conversationKind: 'private' };
  const sourceSpec = () => ({ kind: 'chat', identityMode: 'unique_id', enabled: true, adapterRef,
    permissionPolicyRef: hash('private-pair-policy'), maxEventAgeMs: 10000,
    rate: { windowMs: 60000, maxEvents: options.maxEvents ?? 100 }, routeBinding: route });
  store.configureSource(owner, { commandRef: hash('source-create'), sourceRef, expectedRevision: 0, spec: sourceSpec() });
  store.configureSubscription(owner, { commandRef: hash('sub-create'), sourceRef, subscriptionRef, expectedRevision: 0,
    expectedSourceRevision: 1, spec: { enabled: true, triggerRef: hash('message-trigger'), route: 'new_task' } });
  store.policy(owner, { commandRef: hash('model-policy'), expectedVersion: 1, limits: {},
    modelPolicy: { version: 1, presetRefs: [hash('preset')], catalogEvidenceRef: hash('catalog') } });
  const issued = new Map(), systems = [];
  const issue = (eventKind = 'message', extra = {}) => {
    const id = extra.id ?? `event-${++serial}`, payload = { id, text: extra.content ?? 'Original paired instruction.', ...(extra.payload ?? {}) };
    issued.set(id, { payloadDigest: canonicalDigest(payload), normalized: { content: payload.text, attachments: extra.attachments ?? [] },
      proof: { providerRef, sourceIdentityRef, eventIdRef: hash(id), observedAt: extra.observedAt ?? now,
        routeBinding: extra.route ?? route, eventKind, ...(extra.intent ? { requestDigest: canonicalDigest(extra.intent) } : {}) } });
    return payload;
  };
  const descriptor = (more = {}) => ({ attachmentRef: hash('attachment'), sourceRef, routeDigest: canonicalDigest(route),
    digest: hash(Buffer.from('abcdef')), byteLength: 6, name: 'synthetic.txt', mediaType: 'text/plain',
    permissionState: 'granted', observedAt: now, expiresAt: now + 10000, evidenceRef: hash('trusted-attachment-access'), ...more });
  const receipt = (record, state = 'delivered', more = {}) => ({ artifactRef: record.artifactRef, artifactVersion: record.artifactVersion,
    digest: record.digest, recipientRef: record.recipientRef, channelRef: record.channelRef, state,
    permissionState: state === 'delivered' ? 'granted' : 'unknown', openability: state === 'delivered' ? 'verified' : 'unknown',
    observedAt: now, evidenceRef: hash('receipt-' + state + '-' + now), ...more });
  const make = () => {
    const router = new EventRouter({ store, hostHandle: host, clock: () => now, isAlive: () => current, knownSecrets: config.forbiddenSecrets });
    const chat = new ChatAdapter({ store, hostHandle: host, router, sourceRef, subscriptionRef, adapterRef, providerRef, sourceIdentityRef,
      maxAttachments: 2, maxAttachmentBytes: 64, knownSecrets: config.forbiddenSecrets, clock: () => now, isAlive: () => current,
      verify: async payload => { verifies++; const record = issued.get(payload.id);
        if (!record || record.payloadDigest !== canonicalDigest(payload)) throw new Error('untrusted transport'); return record.proof; },
      authorize: options.authorize ?? (async () => permission), isCurrent: () => current && permission,
      normalize: async payload => issued.get(payload.id).normalized,
      attachmentReader: options.attachmentReader ?? (async () => ({ bytes: Buffer.from('abcdef'), permissionState: 'granted', observedAt: now, evidenceRef: hash('download-access') })),
      outbound: { authorize: options.deliveryAuthorize ?? (async () => permission), isCurrent: () => connected && current,
        send: options.send ?? (async ({ record }) => receipt(record)), query: options.query ?? (async ({ record }) => receipt(record)),
        open: options.open ?? (async ({ record }) => receipt(record)) } });
    systems.push({ router, chat }); return { router, chat };
  };
  t.after(() => { for (const item of systems) { item.chat.dispose(); item.router.dispose(); } });
  const f = { ...make(), owner, host, other, scope, config, sourceRef, subscriptionRef, providerRef, sourceIdentityRef, issue, descriptor, receipt,
    get store() { return store; }, get route() { return route; }, setNow: value => { now = value; }, setCurrent: value => { current = value; },
    setConnected: value => { connected = value; }, setPermission: value => { permission = value; }, verifies: () => verifies,
    updateRoute: changes => { route = { ...route, ...changes }; return store.configureSource(owner, { commandRef: hash('route-' + ++serial),
      sourceRef, expectedRevision: store.source(host, { sourceRef }).revision, spec: sourceSpec() }); },
    disable: () => store.configureSource(owner, { commandRef: hash('disable-' + ++serial), sourceRef,
      expectedRevision: store.source(host, { sourceRef }).revision, spec: { ...sourceSpec(), enabled: false } }),
    ingest: extra => { const payload = issue('message', extra); return f.chat.ingest({ commandRef: hash('ingest-' + ++serial), taskId: 'chat-task-' + serial, payload }); },
    bind: (taskRef, tag) => { const task = store.task(owner, taskRef); return { taskRef, commandRef: hash(tag), expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch }; },
    pipeline: () => new ResultPipeline(store, { hostHandle: host, recipientAdapter: f.chat.recipientAdapter() }),
    reopen: () => { for (const item of systems) { item.chat.dispose(); item.router.dispose(); } store.close(); store = new RuntimeStore(config); Object.assign(f, make()); } };
  f.action = (taskRef, tag, targetDigest, dataDigest, kind = 'write', generationRef = hash(tag + '-generation')) => {
    const spec = { actionRef: hash(tag), kind, role: kind === 'review' ? 'review' : 'worker', targetDigest, dataDigest,
      units: 1, charges: { runtimeMs: 0, usageUnits: 0, costState: 'estimated', costEstimateMicros: 1 }, attemptGroupRef: hash(tag), attemptIndex: 1,
      resourcePolicyVersion: 2, modelPolicyVersion: 1,
      model: { presetRef: hash('preset'), modelRef: hash('model'), reasoningRef: hash('reasoning'), catalogEvidenceRef: hash('catalog') },
      executor: { mode: 'none', generationRef, environmentRef: hash('environment'), bindingDigest: hash('binding'), toolsDigest: hash('tools'), permissionPolicyDigest: hash('permissions') } };
    const action = store.planAction(owner, { ...f.bind(taskRef, tag + '-plan'), spec });
    store.grantAction(owner, { ...f.bind(taskRef, tag + '-grant'), actionRef: action.actionRef, actionDigest: action.actionDigest, expiresAt: now + 100000 }); return action;
  };
  f.artifact = taskRef => {
    const artifact = f.pipeline().writeArtifact(owner, { ...f.bind(taskRef, 'artifact-write-' + ++serial), artifactRef: hash('artifact-' + serial), version: 1, content: 'Reviewed synthetic result.' });
    const reviewer = {}, generationRef = hash('review-generation-' + serial);
    store.bindExecution(host, reviewer, { taskRef, role: 'reviewer', generationRef, sessionRef: hash('review-session-' + serial), readRecordRefs: [artifact.recordRef] });
    const action = f.action(taskRef, 'review-' + serial, hash('review-material'), artifact.digest, 'review', generationRef);
    const claim = store.claimAction(host, { ...f.bind(taskRef, 'review-claim-' + serial), actionRef: action.actionRef, actionDigest: action.actionDigest });
    f.pipeline().verify(reviewer, { taskRef, commandRef: hash('review-report-' + serial), artifactRef: artifact.artifactRef,
      version: artifact.version, digest: artifact.digest, verdict: 'passed', evidenceRef: hash('review-evidence') });
    store.settleAction(host, { taskRef, commandRef: hash('review-settle-' + serial), claimRef: claim.claimRef, generationRef,
      outcome: 'completed', evidenceRef: hash('review-stopped') });
    return store.artifact(owner, { taskRef, artifactRef: artifact.artifactRef });
  };
  f.delivery = (taskRef, artifact, extra = {}) => f.pipeline().acceptDelivery(owner, { ...f.bind(taskRef, 'delivery-accept-' + ++serial),
    deliveryRef: hash('delivery-' + serial), artifactRef: artifact.artifactRef, artifactVersion: artifact.version, digest: artifact.digest,
    recipientRef: route.principalRef, channelRef: chatChannel({ providerRef, sourceIdentityRef, route }), ...extra });
  f.dispatch = (taskRef, delivery) => { const action = f.action(taskRef, 'send-' + ++serial, delivery.targetDigest, delivery.digest);
    return { ...f.bind(taskRef, 'dispatch-' + serial), deliveryRef: delivery.deliveryRef, actionRef: action.actionRef, actionDigest: action.actionDigest }; };
  return f;
}

test('paired contract admission stores encrypted original route/material, deduplicates, and survives reopen', async t => {
  const f = fixture(t), payload = f.issue(), input = { commandRef: hash('intake'), taskId: 'one-task', payload };
  const first = await f.chat.ingest(input), duplicate = await f.chat.ingest({ ...input, commandRef: hash('redelivery'), taskId: 'other-task' });
  assert.equal(duplicate.deduplicated, true); assert.equal(duplicate.task.taskRef, first.task.taskRef); assert.equal(f.store.listTasks(f.owner).length, 1);
  const data = f.store.readData(f.owner, { taskRef: first.task.taskRef, recordRef: first.goalRecordRef });
  assert.equal(JSON.parse(data.content).content, payload.text); assert.equal(data.digest, first.goalDigest);
  assert.equal(readFileSync(f.config.databasePath).includes(Buffer.from(payload.text)), false); f.reopen();
  const taskRef = first.task.taskRef, statusPayload = f.issue('status', { intent: { kind: 'status', taskRef } });
  assert.equal((await f.chat.status({ taskRef, payload: statusPayload })).task.taskRef, taskRef);
  assert.equal(f.store.eventReceipt(f.host, { sourceRef: f.sourceRef, subscriptionRef: f.subscriptionRef, eventRef: first.eventRef }).goalDigest, first.goalDigest);
});

test('payload owner, forward, group and cross-task claims never replace admitted private pairing', async t => {
  const f = fixture(t), first = await f.ingest(), taskRef = first.task.taskRef;
  await assert.rejects(f.chat.status({ taskRef, payload: { id: 'not-issued', owner: true, verified: true, forwarded: true } }));
  const wrongRoute = { ...f.route, conversationRef: hash('another-window') };
  const payload = f.issue('status', { route: wrongRoute, intent: { kind: 'status', taskRef } });
  await assert.rejects(f.chat.status({ taskRef, payload }), { code: 'ROUTE_MISMATCH' });
  await assert.rejects(f.chat.status({ taskRef: hash('other-task'), payload: f.issue('status', { intent: { kind: 'status', taskRef } }) }), { code: 'CHAT_REQUEST_BINDING' });
  f.updateRoute({ conversationKind: 'group' });
  await assert.rejects(f.chat.status({ taskRef, payload: f.issue('status', { intent: { kind: 'status', taskRef } }) }));
  assert.equal(f.store.task(f.owner, taskRef).version, first.task.version);
});

test('new pairing revision or private window cannot inherit history; rate-only revision preserves original access', async t => {
  const f = fixture(t), { task } = await f.ingest(), taskRef = task.taskRef;
  f.updateRoute({}); assert.equal((await f.chat.status({ taskRef, payload: f.issue('status', { intent: { kind: 'status', taskRef } }) })).task.taskRef, taskRef);
  f.updateRoute({ pairingRevision: 2 });
  await assert.rejects(f.chat.status({ taskRef, payload: f.issue('status', { intent: { kind: 'status', taskRef } }) }), { code: 'ROUTE_MISMATCH' });
  f.updateRoute({ conversationRef: hash('new-window') });
  await assert.rejects(f.chat.status({ taskRef, payload: f.issue('status', { intent: { kind: 'status', taskRef } }) }), { code: 'ROUTE_MISMATCH' });
  assert.equal(f.store.listTasks(f.owner).length, 1);
});

test('authenticated edits/deletes and same-ID replacement cannot rewrite an admitted instruction', async t => {
  const f = fixture(t), id = 'immutable-message', first = await f.ingest({ id });
  for (const eventKind of ['edit', 'delete']) await assert.rejects(f.chat.ingest({ commandRef: hash(eventKind), taskId: eventKind,
    payload: f.issue(eventKind, { id, content: 'A changed provider event.' }) }), { code: 'EVENT_MUTATION_DENIED' });
  await assert.rejects(f.ingest({ id, content: 'A changed provider event.' }), { code: 'IDEMPOTENCY_CONFLICT' });
  assert.equal(f.store.task(f.owner, first.task.taskRef).version, first.task.version); assert.equal(f.store.listTasks(f.owner).length, 1);
});

test('private control proof binds exact task/version/kind and provider identity deduplicates control', async t => {
  const f = fixture(t), { task } = await f.ingest(), input = { taskRef: task.taskRef, expectedTaskVersion: task.version,
    expectedAuthEpoch: task.authEpoch, kind: 'pause' };
  const payload = f.issue('control', { intent: { ...input, kind: 'control', control: input.kind } });
  await assert.rejects(f.chat.control({ ...input, kind: 'cancel', payload }), { code: 'CHAT_REQUEST_BINDING' });
  const first = await f.chat.control({ ...input, payload }), duplicate = await f.chat.control({ ...input, payload });
  assert.equal(first.task.version, duplicate.task.version); assert.equal(f.store.snapshot(f.owner, { taskRef: task.taskRef }).control, 'paused');
  await assert.rejects(f.chat.control({ ...input, kind: 'grant', payload }), { code: 'CHAT_CONTROL_INVALID' });
  await assert.rejects(f.chat.control({ ...input, payload, owner: true }));
});

test('source revoke, auth loss and unload close asynchronous control without a late state mutation', async t => {
  for (const mode of ['disable', 'permission', 'dispose']) await t.test(mode, async t => {
    let release, delayed = false; const f = fixture(t, { authorize: async () => delayed ? new Promise(resolve => { release = resolve; }) : true });
    const { task } = await f.ingest(); delayed = true;
    const intent = { kind: 'control', control: 'cancel', taskRef: task.taskRef, expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch };
    const pending = f.chat.control({ taskRef: task.taskRef, kind: 'cancel', expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch,
      payload: f.issue('control', { intent }) }); await Promise.resolve(); await Promise.resolve(); assert.equal(typeof release, 'function');
    if (mode === 'disable') f.disable(); if (mode === 'permission') f.setPermission(false); if (mode === 'dispose') f.chat.dispose();
    release(true); await assert.rejects(pending); assert.equal(f.store.task(f.owner, task.taskRef).version, task.version);
    assert.equal(f.store.snapshot(f.owner, { taskRef: task.taskRef }).control, 'active');
  });
});

test('attachment descriptors and exact bytes are bound to admitted source/task and remain verifiable after reopen', async t => {
  const f = fixture(t), descriptor = f.descriptor(), { task } = await f.ingest({ attachments: [descriptor] }); f.reopen();
  const intent = { kind: 'attachment', taskRef: task.taskRef, attachmentRef: descriptor.attachmentRef };
  const result = await f.chat.readAttachment({ taskRef: task.taskRef, attachmentRef: descriptor.attachmentRef, payload: f.issue('attachment', { intent }) });
  assert.equal(result.bytes.toString(), 'abcdef'); assert.equal(result.digest, descriptor.digest); assert.equal(result.byteLength, 6);
  assert.equal(readFileSync(f.config.databasePath).includes(Buffer.from('abcdef')), false);
  await assert.rejects(f.chat.readAttachment({ ...intent, payload: f.issue('attachment', { intent }), localPath: '/synthetic/path' }));
});

test('unknown paths, descriptor quotas/digests/access and expiration refuse without a partial task', async t => {
  for (const variant of ['path', 'bytes', 'scope', 'access', 'expired', 'duplicate', 'count']) await t.test(variant, async t => {
    const f = fixture(t), a = f.descriptor(); let attachments = [a];
    if (variant === 'path') attachments = [{ ...a, localPath: '/synthetic/path' }];
    if (variant === 'bytes') attachments = [{ ...a, byteLength: 65 }];
    if (variant === 'scope') attachments = [{ ...a, sourceRef: hash('foreign-source') }];
    if (variant === 'access') attachments = [{ ...a, permissionState: 'unknown' }];
    if (variant === 'expired') attachments = [{ ...a, expiresAt: a.observedAt }];
    if (variant === 'duplicate') attachments = [a, a];
    if (variant === 'count') attachments = [a, { ...a, attachmentRef: hash('a2') }, { ...a, attachmentRef: hash('a3') }];
    await assert.rejects(f.ingest({ attachments })); assert.equal(f.store.listTasks(f.owner).length, 0);
  });
});

test('owner-created context labels cannot mint trusted provider attachment proof', async t => {
  const f = fixture(t), { task } = await f.ingest(), forged = f.descriptor();
  f.store.putData(f.owner, { ...f.bind(task.taskRef, 'context-label'), kind: 'context', sourceRef: f.sourceRef,
    content: JSON.stringify({ contractVersion: 'df.chat-input/v1', sourceRef: f.sourceRef, subscriptionRef: f.subscriptionRef,
      routeDigest: canonicalDigest(f.route), content: 'Owner supplied prose.', attachments: [forged] }) });
  const intent = { kind: 'attachment', taskRef: task.taskRef, attachmentRef: forged.attachmentRef };
  await assert.rejects(f.chat.readAttachment({ taskRef: task.taskRef, attachmentRef: forged.attachmentRef,
    payload: f.issue('attachment', { intent }) }), { code: 'CHAT_ATTACHMENT_UNAVAILABLE' });
});

test('attachment provider mismatch, expiry and revoked permission after awaited download disclose no bytes', async t => {
  for (const mode of ['digest', 'revoke', 'expire']) await t.test(mode, async t => {
    let release, entered; const reached = new Promise(resolve => { entered = resolve; });
    const f = fixture(t, { attachmentReader: () => new Promise(resolve => { release = resolve; entered(); }) }), a = f.descriptor();
    const { task } = await f.ingest({ attachments: [a] }), intent = { kind: 'attachment', taskRef: task.taskRef, attachmentRef: a.attachmentRef };
    const pending = f.chat.readAttachment({ taskRef: task.taskRef, attachmentRef: a.attachmentRef, payload: f.issue('attachment', { intent }) });
    await reached; assert.equal(typeof release, 'function');
    if (mode === 'revoke') f.setPermission(false);
    if (mode === 'expire') f.setNow(a.expiresAt);
    release({ bytes: Buffer.from(mode === 'digest' ? 'xxxxxx' : 'abcdef'), permissionState: 'granted', observedAt: 1000000, evidenceRef: hash('read-proof') });
    await assert.rejects(pending); assert.equal(f.store.listTasks(f.owner).length, 1);
  });
});

test('outbound contract uses original private channel and separates sent, delivered and current access', async t => {
  let sent = 0; const f = fixture(t, { send: async ({ record }) => { sent++; return f.receipt(record, 'sent'); },
    query: async ({ record }) => f.receipt(record), open: async ({ record }) => f.receipt(record, 'failed', { permissionState: 'revoked', openability: 'failed' }) });
  const { task } = await f.ingest(), artifact = f.artifact(task.taskRef), delivery = f.delivery(task.taskRef, artifact), command = f.dispatch(task.taskRef, delivery);
  const result = await f.pipeline().dispatch(f.owner, command); assert.equal(result.delivery.state, 'sent'); assert.equal(sent, 1);
  f.setNow(1000001); assert.equal((await f.pipeline().reconcile(f.owner, task.taskRef, delivery.deliveryRef)).state, 'delivered');
  f.setNow(1000002); const access = await f.pipeline().currentAccess(f.owner, task.taskRef, delivery.deliveryRef);
  assert.equal(access.state, 'delivered'); assert.equal(access.currentAccess.permissionState, 'denied'); assert.equal(access.observations[0].state, 'sent');
  assert.equal(f.store.task(f.owner, task.taskRef).status, 'running'); assert.equal(sent, 1);
});

test('unknown send across reopen retains ownership and requires reconciliation before any retry', async t => {
  let sends = 0; const f = fixture(t, { send: async () => { sends++; throw new Error('synthetic-private-sentinel'); },
    query: async ({ record }) => f.receipt(record, 'unknown') });
  const { task } = await f.ingest(), delivery = f.delivery(task.taskRef, f.artifact(task.taskRef)), command = f.dispatch(task.taskRef, delivery);
  const result = await f.pipeline().dispatch(f.owner, command); assert.equal(result.delivery.state, 'unknown'); f.reopen();
  assert.equal((await f.pipeline().dispatch(f.owner, command)).dispatched, false); assert.equal(sends, 1);
  f.setNow(1000001); assert.equal((await f.pipeline().reconcile(f.owner, task.taskRef, delivery.deliveryRef)).state, 'unknown');
  assert.throws(() => f.pipeline().retryFailed(f.owner, { ...f.bind(task.taskRef, 'unsafe-retry'), deliveryRef: hash('retry'),
    previousDeliveryRef: delivery.deliveryRef, artifactRef: delivery.artifactRef, artifactVersion: delivery.artifactVersion,
    digest: delivery.digest, recipientRef: delivery.recipientRef, channelRef: delivery.channelRef }), { code: 'RETRY_UNCONFIRMED' });
  const held = f.store.snapshot(f.owner, { taskRef: task.taskRef }).actions.find(a => a.actionRef === command.actionRef);
  assert.ok(held.reservationRef); assert.equal(held.releaseEvidenceRef, null);
  const reconciliation = f.store.settleAction(f.host, { taskRef: task.taskRef, commandRef: hash('still-unknown'),
    claimRef: held.claimRef, generationRef: held.spec.executor.generationRef, outcome: 'unknown', evidenceRef: hash('query-unresolved') });
  assert.equal(reconciliation.reservationHeld, true);
});

test('wrong channel or disconnected outbound adapter performs zero callbacks and retains visible uncertainty', async t => {
  for (const mode of ['channel', 'disconnect']) await t.test(mode, async t => {
    let sends = 0; const f = fixture(t, { send: async ({ record }) => { sends++; return f.receipt(record); } });
    const { task } = await f.ingest(), delivery = f.delivery(task.taskRef, f.artifact(task.taskRef),
      mode === 'channel' ? { channelRef: hash('another-window') } : {}), command = f.dispatch(task.taskRef, delivery);
    if (mode === 'disconnect') f.setConnected(false);
    const result = await f.pipeline().dispatch(f.owner, command); assert.equal(result.delivery.state, 'unknown'); assert.equal(sends, 0);
    assert.equal((await f.pipeline().dispatch(f.owner, command)).dispatched, false);
  });
});

test('source rate refusal and malformed/secret payloads leave no partial task', async t => {
  const f = fixture(t, { maxEvents: 1 }); await f.ingest(); await assert.rejects(f.ingest(), { code: 'RATE_LIMIT' });
  const before = f.verifies(); let getterCalls = 0;
  const payload = { id: 'accessor' }; Object.defineProperty(payload, 'text', { enumerable: true, get() { getterCalls++; return 'hidden'; } });
  for (const candidate of [payload, new Proxy({ id: 'proxy' }, {}), { id: 'secret', text: 'synthetic-private-sentinel' }, { id: 'unicode', text: '\ud800' }]) {
    await assert.rejects(f.chat.ingest({ commandRef: hash('bad'), taskId: 'bad', payload: candidate }));
  }
  assert.equal(getterCalls, 0); assert.equal(f.verifies(), before); assert.equal(f.store.listTasks(f.owner).length, 1);
});
