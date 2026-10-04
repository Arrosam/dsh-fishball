import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { DSH_WEB_RUNTIME_ROOT } from '../src/host-probe.mjs';
import { NativeAdapter, probeWorkerHost } from '../src/native-adapter.mjs';
import { WorkerManager } from '../src/worker.mjs';
import { RuntimeStore } from '../src/runtime-store.mjs';
import { MessageBroker } from '../src/messages.mjs';
import { EnvironmentRegistry, workerDigest as d } from '../src/environment.mjs';
const root = `${DSH_WEB_RUNTIME_ROOT}/node_modules/@deepseek-ai`;
const { Context } = await import(`${root}/cordis/lib/index.js`);
const { default: SessionStore, Session } = await import(`${root}/dsh-session/lib/index.js`);
const { default: ApprovalService } = await import(`${root}/dsh-user-approval/lib/index.js`);
const { AgentRegistry } = await import(`${root}/dsh-agent/lib/index.js`);
const { LlmRuntime, LlmAdapter } = await import(`${root}/dsh-llm/lib/index.js`);
const { default: SessionProjectionRegistry } = await import(`${root}/dsh-session-projection/lib/index.js`);
const { default: SystemPrompt } = await import(`${root}/dsh-system-prompt/lib/index.js`);
const { default: ToolRuntime } = await import(`${root}/dsh-tools/lib/index.js`);
const { default: AgentLoop } = await import(`${root}/dsh-agent-loop/lib/index.js`);

async function fixture({ actualLoop = false, deterministicStream = false, messageAdmission = () => true } = {}) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'df-native-')));
  const ctx = new Context(); ctx.logger.exporters?.clear?.();
  if (actualLoop) await ctx.plugin(SessionProjectionRegistry);
  await ctx.plugin(SessionStore); await ctx.plugin(ApprovalService, { policy: 'never' });
  await ctx.plugin(AgentRegistry); await ctx.plugin(LlmRuntime);
  let streams = 0, creates = 0, resumes = 0, allowed = true, state = d('state'), injects = 0; const requests = [];
  class MockProvider extends LlmAdapter {
    async resolveModel(provider, model) { return { provider, id: model, name: model, reasoning: { efforts: [{ id: 'fixture-effort', name: 'Fixture' }] } }; }
    async *stream(options) {
      streams++; if (!deterministicStream) throw new Error('MOCK_STREAM_MUST_NOT_BE_CALLED');
      requests.push(options.messages.filter(message => message.role === 'user' && typeof message.id === 'string').map(message => ({ messageRef: d(message.id), sourceKind: message.source?.kind, sourceForm: message.source?.form, bodyDigest: createHash('sha256').update(message.content.filter(block => block.type === 'text').map(block => block.text).join('')).digest('hex') })));
      assert.equal(options.provider, 'synthetic-provider'); assert.equal(options.model, 'synthetic-model'); assert.equal(options.tools?.length ?? 0, 0);
      yield { type: 'block-start', index: 0, blockType: 'text' };
      yield { type: 'text-delta', index: 0, text: 'Synthetic local result' };
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Synthetic local result' } };
      yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
      yield { type: 'finish', reason: { kind: 'stop' } };
    }
  }
  ctx.llm.registerAdapter(['synthetic-provider'], new MockProvider());
  const factory = {
    async createAgent(ownerCtx, options) {
      creates++;
      const session = Session.create(options.sessionId);
      const agent = { id: options.sessionId, session, status: 'idle', ctx: ownerCtx, options: options.agentOptions, inject() { injects++; }, cancel() { agent.status = 'idle'; }, whenIdle: async () => {} };
      const commit = await options.setup?.(ownerCtx, agent); commit?.commit();
      const detachSession = ownerCtx.sessions.enter(session), detachAgent = ownerCtx.agents.enter(agent, undefined);
      ownerCtx.sessions.announce(session, 'startup'); await ownerCtx.agents.announce(agent, 'startup');
      let disposed = false;
      const dispose = async () => { if (disposed) return; disposed = true; detachAgent(); detachSession(); };
      ownerCtx.effect(() => dispose);
      return { agent, dispose };
    },
    async resume(ownerCtx, options) {
      resumes++;
      // Mock persistence is deliberately separate from real AgentLoop proof.
      return this.createAgent(ownerCtx, { ...options, sessionId: options.resumeSessionId });
    },
  };
  if (actualLoop) {
    await ctx.plugin(SystemPrompt, {});
    await ctx.plugin(ToolRuntime, {});
    await ctx.plugin(AgentLoop, { agents: [], maxParallelToolCalls: 1 });
  } else ctx.agents.setFactory(factory);
  const entry = { environmentRef: d('env'), workspaceRef: createHash('sha256').update('synthetic-workspace').digest('hex'), bindingDigest: d('binding'), toolsDigest: d('tools'), permissionPolicyDigest: d('permission'), root: directory, cwd: directory, provider: 'synthetic-provider', model: 'synthetic-model', reasoningEffort: 'fixture-effort', modelRef: d('model'), reasoningRef: d('reasoning'), presetRef: d('preset') };
  const environments = new EnvironmentRegistry({ entries: [entry], currentState: () => state });
  const task = { taskRef: d('task'), workspaceRef: entry.workspaceRef, version: 1, authEpoch: 0 };
  const spec = { actionRef: d('action'), kind: 'write', role: 'worker', targetDigest: d('target'), dataDigest: d('data'), units: 1, charges: {runtimeMs: 1, usageUnits: 0, costEstimateMicros: 0}, attemptGroupRef: d('group'), attemptIndex: 1, resourcePolicyVersion: 2, modelPolicyVersion: 1, executor: { mode: 'create', generationRef: d('gen'), environmentRef: entry.environmentRef, bindingDigest: entry.bindingDigest, toolsDigest: entry.toolsDigest, permissionPolicyDigest: entry.permissionPolicyDigest }, model: { catalogEvidenceRef: d('catalog'), modelRef: entry.modelRef, reasoningRef: entry.reasoningRef, presetRef: entry.presetRef } };
  const adapter = new NativeAdapter(ctx, { environments, permission: () => allowed, messageAdmission });
  return { ctx, adapter, environments, task, spec, requests: () => structuredClone(requests), injected: () => injects, stats: () => ({ creates, resumes, streams }), deny: () => { allowed = false; }, change: () => { state = d('changed'); }, close: async () => { await ctx.fiber.dispose(); rmSync(directory, { recursive: true }); } };
}

test('exact public services create owned session; created/ready/running/cancel/stopped are separate, zero stream calls', async () => {
  const f = await fixture();
  try {
    assert.equal(probeWorkerHost(f.ctx).nativeWorker, 'public-interfaces');
    const ticket = await f.adapter.prepare(f.spec, f.task, d('digest'));
    assert.equal(f.adapter.query(ticket).phase, 'unknown');
    f.adapter.bindClaim(ticket, {actionRef:d('action'),claimRef:d('claim'),reservationRef:d('reservation'),actionDigest:d('digest'),generationRef:d('gen')},()=>true);
    const created = await f.adapter.create(ticket); assert.equal(created.phase, 'created');
    assert.equal(f.adapter.query(ticket).phase, 'ready');
    const agent = f.ctx.agents.get(`df-${d('gen')}`); agent.status = 'running';
    assert.equal(f.adapter.query(ticket).phase, 'running');
    assert.equal((await f.adapter.cancel(ticket)).phase, 'cancel_requested');
    assert.equal(f.adapter.query(ticket).phase, 'ready', 'idle is not terminal');
    assert.equal((await f.adapter.dispose(ticket)).phase, 'stopped');
    assert.equal(f.ctx.sessions.list().length, 0);
    assert.deepEqual(f.stats(), { creates: 1, resumes: 0, streams: 0 });
    await assert.rejects(f.adapter.create(ticket), { code: 'WORKER_ALREADY_SUBMITTED' });
  } finally { await f.close(); }
});
test('native default permission, changed environment, exact model effort and session binding fail before create', async () => {
  const f = await fixture();
  try {
    const denied = new NativeAdapter(f.ctx, { environments: f.environments });
    await assert.rejects(denied.prepare(f.spec, f.task, d('digest')), { code: 'HOST_PERMISSION_DENIED' });
    await assert.rejects(f.adapter.prepare({ ...f.spec, executor: { ...f.spec.executor, sessionRef: d('wrong-session') } }, f.task, d('digest')), { code: 'SESSION_MISMATCH' });
    const ticket = await f.adapter.prepare(f.spec, f.task, d('digest')); f.change();
    await assert.rejects(f.adapter.create(ticket), { code: 'ENVIRONMENT_STALE' });
    assert.equal(f.stats().creates, 0); assert.equal(f.stats().streams, 0);
  } finally { await f.close(); }
});
test('resume requires trusted original session binding and unload closes borrowed adapter immediately', async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.adapter.prepare({ ...f.spec, executor: { ...f.spec.executor, mode: 'resume', sessionRef: d('session') } }, f.task, d('digest')), { code: 'SESSION_UNAVAILABLE' });
    const ticket = await f.adapter.prepare(f.spec, f.task, d('digest'));
    const closing = f.ctx.fiber.dispose();
    assert.throws(() => f.adapter.query(ticket), { code: 'WORKER_DISPOSED' });
    await closing;
  } finally { await f.close(); }
});
test('native creation requires opaque claimed ticket and fresh synchronous publication guard', async () => {
  const f = await fixture();
  try {
    const ticket = await f.adapter.prepare(f.spec, f.task, d('digest'));
    await assert.rejects(f.adapter.create(ticket), { code: 'WORKER_CLAIM_REQUIRED' });
    let current = true;
    f.adapter.bindClaim(ticket, { actionRef: d('action'), claimRef: d('claim'), reservationRef: d('reservation'), actionDigest: d('digest'), generationRef: d('gen') }, () => current);
    current = false;
    await assert.rejects(f.adapter.create(ticket), { code: 'WORKER_CLAIM_STALE' });
    assert.equal(f.stats().creates, 0);
    await assert.rejects(f.adapter.prepare(new Proxy(f.spec, {}), f.task, d('digest')), { code: 'WORKER_INVALID' });
  } finally { await f.close(); }
});
test('actual native event stream dedups offsets; missing frames retain uncertainty and omit synthetic content', async () => {
  const f = await fixture();
  try {
    const ticket = await f.adapter.prepare(f.spec, f.task, d('digest'));
    f.adapter.bindClaim(ticket, { actionRef: d('action'), claimRef: d('claim'), reservationRef: d('reservation'), actionDigest: d('digest'), generationRef: d('gen') }, () => true);
    await f.adapter.create(ticket);
    const agent = f.ctx.agents.get(`df-${d('gen')}`), observed = [];
    f.adapter.observe(ticket, receipt => observed.push(receipt));
    const emit = frame => f.ctx.emit('agent/assistant-stream', { agent, frame });
    emit({ type: 'start', revision: 1, attemptId: 'synthetic-attempt', turn: 1, step: 1 });
    emit({ type: 'chunk', revision: 2, attemptId: 'synthetic-attempt', index: 0, time: 0, chunk: { type: 'text-delta', text: 'SYNTHETIC_STREAM_SECRET' } });
    emit({ type: 'chunk', revision: 2, attemptId: 'synthetic-attempt', index: 0, time: 0, chunk: { type: 'text-delta', text: 'SYNTHETIC_STREAM_SECRET' } });
    assert.equal(f.adapter.streamState(ticket).count, 1);
    emit({ type: 'chunk', revision: 3, attemptId: 'synthetic-attempt', index: 2, time: 0, chunk: {} });
    assert.equal(f.adapter.streamState(ticket).state, 'unknown');
    assert.equal(observed.at(-1).phase, 'unknown');
    assert.equal(JSON.stringify([observed, f.adapter.streamState(ticket)]).includes('SYNTHETIC_STREAM_SECRET'), false);
    assert.equal(f.stats().streams, 0);
    await f.adapter.dispose(ticket);
  } finally { await f.close(); }
});
test('native message transport queues once without wakeup or consumption claim; validates exact recipient and bytes', async () => {
  const f = await fixture();
  try {
    const ticket = await f.adapter.prepare(f.spec, f.task, d('digest'));
    f.adapter.bindClaim(ticket, { actionRef: d('action'), claimRef: d('claim'), reservationRef: d('reservation'), actionDigest: d('digest'), generationRef: d('gen') }, () => true);
    const created = await f.adapter.create(ticket), content = 'synthetic context';
    const digest = createHash('sha256').update(content).digest('hex');
    const record = { taskRef: f.task.taskRef, state: 'outbox_committed', messageRef: d('message'), bodyDigest: digest, byteLength: Buffer.byteLength(content), claimRef: d('message-claim'), reservationRef: d('message-reservation'), generationRef: d('message-generation'), immutableMetadata: { recipientSessionRef: created.sessionRef, recipientGenerationRef: d('gen') } };
    const body = { kind: 'message', content, digest }, transport = f.adapter.transport();
    assert.equal((await transport.send(record, body)).state, 'sent'); assert.equal(f.injected(), 1);
    assert.equal((await transport.query(record)).state, 'unknown');
    await assert.rejects(transport.send(record, body), { code: 'MESSAGE_ALREADY_SUBMITTED' });
    await assert.rejects(transport.send({ ...record, messageRef: d('bad-body') }, { ...body, content: 'changed' }), { code: 'MESSAGE_BODY_INVALID' });
    await assert.rejects(transport.send({ ...record, immutableMetadata: { ...record.immutableMetadata, recipientGenerationRef: d('wrong-gen') } }, body), { code: 'MESSAGE_RECIPIENT_UNAVAILABLE' });
    assert.equal(f.stats().streams, 0);
    await f.adapter.dispose(ticket);
  } finally { await f.close(); }
});
test('resume uses exact trusted original ID on genuine public registry API with mock persistence', async () => {
  const f = await fixture();
  try {
    const nativeId = 'synthetic-original-session';
    const adapter = new NativeAdapter(f.ctx, { environments: f.environments, permission: () => true, resolveSession: () => nativeId });
    const spec = { ...f.spec, executor: { ...f.spec.executor, mode: 'resume', sessionRef: createHash('sha256').update(nativeId).digest('hex') } };
    const ticket = await adapter.prepare(spec, f.task, d('digest'));
    adapter.bindClaim(ticket, { actionRef: d('action'), claimRef: d('claim'), reservationRef: d('reservation'), actionDigest: d('digest'), generationRef: d('gen') }, () => true);
    assert.equal((await adapter.resume(ticket)).phase, 'created');
    assert.equal(adapter.query(ticket).phase, 'ready'); assert.equal(f.stats().resumes, 1);
    await adapter.dispose(ticket);
  } finally { await f.close(); }
});
test('genuine pinned AgentLoop owns idle worker creation and ordered cancellation/disposal without model or tools', async () => {
  const f = await fixture({ actualLoop: true });
  try {
    const ticket = await f.adapter.prepare(f.spec, f.task, d('digest'));
    f.adapter.bindClaim(ticket, { actionRef: d('action'), claimRef: d('claim'), reservationRef: d('reservation'), actionDigest: d('digest'), generationRef: d('gen') }, () => true);
    assert.equal((await f.adapter.create(ticket)).phase, 'created');
    assert.equal(f.adapter.query(ticket).phase, 'ready');
    assert.equal(f.ctx.agents.list().length, 1);
    assert.equal((await f.adapter.cancel(ticket)).phase, 'cancel_requested');
    assert.equal((await f.adapter.dispose(ticket)).phase, 'stopped');
    assert.equal(f.ctx.agents.list().length, 0); assert.equal(f.ctx.sessions.list().length, 0);
    assert.deepEqual(f.stats(), { creates: 0, resumes: 0, streams: 0 });
  } finally { await f.close(); }
});
test('native handoff retains bound original claim and safe context; no permission or environment switch is minted', async () => {
  const f = await fixture();
  try {
    const ticket = await f.adapter.prepare(f.spec, f.task, d('digest'));
    f.adapter.bindClaim(ticket, { actionRef: d('action'), claimRef: d('claim'), reservationRef: d('reservation'), actionDigest: d('digest'), generationRef: d('gen') }, () => true);
    const input = { targetEnvironmentRef: d('env'), reason: 'Synthetic operator action needed', steps: 'Inspect synthetic state', resumeCondition: 'Verified exact current state', expiresAt: Date.now() + 1000, taskVersion: 2, authEpoch: 1, actionDigest: d('digest'), claimRef: d('claim'), generationRef: d('gen') };
    const handoff = f.adapter.handoff(ticket, input, { ...f.task, version: 2, authEpoch: 1 });
    assert.equal(handoff.state, 'pending'); assert.equal(handoff.actionDigest, d('digest'));
    assert.equal(handoff.cwd, undefined); assert.equal(f.stats().creates, 0);
    assert.throws(() => f.adapter.handoff(ticket, { ...input, claimRef: d('wrong-claim') }, f.task, d('digest')), { code: 'WORKER_MAPPING_MISMATCH' });
    f.change(); assert.throws(() => f.adapter.handoff(ticket, input, f.task), { code: 'ENVIRONMENT_STALE' });
  } finally { await f.close(); }
});
test('actual SQLite intent/claim and genuine AgentLoop integrate; pending encrypted handoff and stop remain accountable', async () => {
  const f = await fixture({ actualLoop: true }), owner = {}, host = {};
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'df-native-ledger-')));
  const store = new RuntimeStore({ databasePath: join(directory, 'ledger.sqlite'), encryptionKey: Buffer.alloc(32, 7), principals: [{ handle: owner, role: 'owner', scope: { ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' } }, { handle: host, role: 'host', scope: { ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' } }], hostPermission: () => true });
  const manager = new WorkerManager({ store, hostHandle: host, adapter: f.adapter });
  try {
    const task = store.intake(owner, { taskId: 'synthetic-native-task', provider: 'fixture', source: 'source', eventId: 'event', commandRef: d('intake') }).task;
    store.policy(owner, { commandRef: d('policy'), expectedVersion: 1, limits: {}, modelPolicy: { version: 1, presetRefs: [d('preset')], catalogEvidenceRef: d('catalog') } });
    const planned = store.planAction(owner, { taskRef: task.taskRef, commandRef: d('plan'), expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch, spec: f.spec });
    const grant = store.grantAction(owner, { taskRef: task.taskRef, actionRef: planned.actionRef, actionDigest: planned.actionDigest, commandRef: d('grant'), expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch, expiresAt: Date.now() + 60000 });
    const started = await manager.dispatch(owner, { taskRef: task.taskRef, actionRef: planned.actionRef, actionDigest: planned.actionDigest, commandRef: d('dispatch'), expectedTaskVersion: grant.taskVersion, expectedAuthEpoch: grant.authEpoch });
    assert.equal(started.phase, 'ready'); assert.equal(store.snapshot(owner, { taskRef: task.taskRef }).actions[0].actionDigest, planned.actionDigest);
    const current = store.task(owner, task.taskRef);
    const handoff = manager.handoff(owner, { taskRef: task.taskRef, actionRef: planned.actionRef, claimRef: started.claimRef, generationRef: started.generationRef, commandRef: d('handoff'), expectedTaskVersion: current.version, expectedAuthEpoch: current.authEpoch, targetEnvironmentRef: d('env'), reason: 'Synthetic operator step required', steps: 'Inspect synthetic snapshot', resumeCondition: 'Revalidate current exact task and environment', expiresAt: Date.now() + 60000 });
    assert.equal(handoff.state, 'pending'); assert.equal(handoff.reason, undefined);
    assert.equal(store.readData(owner, { taskRef: task.taskRef, recordRef: handoff.recordRef }).kind, 'branch');
    assert.equal(store.snapshot(owner, { taskRef: task.taskRef }).actions[0].releaseEvidenceRef, null);
    const beforeCancel=store.task(owner,task.taskRef);
    const cancelled = await manager.cancel(owner, { taskRef: task.taskRef, commandRef: d('cancel'), expectedTaskVersion: beforeCancel.version, expectedAuthEpoch: beforeCancel.authEpoch });
    assert.equal(cancelled.workers[0].phase, 'stopped');
    assert.equal(store.snapshot(owner, { taskRef: task.taskRef }).actions[0].releaseEvidenceRef, null);
    const stopped = store.snapshot(owner, { taskRef: task.taskRef }).workers[0];
    assert.equal(stopped.handoff.state, 'pending');
    const known = store.settleAction(host, { taskRef: task.taskRef, claimRef: started.claimRef, generationRef: started.generationRef, commandRef: d('settle-with-pending-handoff'), outcome: 'terminated', evidenceRef: d('known-no-effects'), terminalEvidenceRef: stopped.terminalEvidenceRef });
    assert.equal(known.reservationHeld, true, 'pending handoff is an independent accountable obligation');
    assert.equal(f.ctx.agents.list().length, 0); assert.equal(f.ctx.sessions.list().length, 0); assert.equal(f.stats().streams, 0);
  } finally { await manager.close(); store.close(); rmSync(directory, { recursive: true }); await f.close(); }
});

test('actual store→worker→broker→native inject uses current message grant and exact live recipient, zero model calls', async () => {
  const owner = {}, host = {}, recipient = {}; let store, cancelBeforeInject = false;
  const f = await fixture({ messageAdmission(message, worker) {
    if (cancelBeforeInject) { const task = store.task(owner, message.taskRef); store.control(owner, { taskRef: task.taskRef, commandRef: d('vertical-cancel'), expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch, kind: 'cancel' }); }
    store.assertMessageCurrent(host, message); store.assertWorkerOwned(host, worker); return true;
  } });
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'df-native-message-ledger-')));
  store = new RuntimeStore({ databasePath: join(directory, 'ledger.sqlite'), encryptionKey: Buffer.alloc(32, 7), limits: { maxActive: 8 }, principals: [{ handle: owner, role: 'owner', scope: { ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' }, sessionRef: d('owner-session'), generationRef: d('owner-generation') }, { handle: host, role: 'host', scope: { ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' } }], hostPermission: () => true });
  const manager = new WorkerManager({ store, hostHandle: host, adapter: f.adapter });
  try {
    const task = store.intake(owner, { taskId: 'synthetic-message-task', provider: 'fixture', source: 'source', eventId: 'event', commandRef: d('vertical-intake') }).task;
    const bind = command => { const now = store.task(owner, task.taskRef); return { taskRef: task.taskRef, commandRef: d(command), expectedTaskVersion: now.version, expectedAuthEpoch: now.authEpoch }; };
    store.policy(owner, { commandRef: d('vertical-policy'), expectedVersion: 1, limits: {}, modelPolicy: { version: 1, presetRefs: [d('preset')], catalogEvidenceRef: d('catalog') } });
    const action = store.planAction(owner, { ...bind('vertical-worker-plan'), spec: f.spec });
    store.grantAction(owner, { ...bind('vertical-worker-grant'), actionRef: action.actionRef, actionDigest: action.actionDigest, expiresAt: Date.now() + 60000 });
    const worker = await manager.dispatch(owner, { ...bind('vertical-worker-dispatch'), actionRef: action.actionRef, actionDigest: action.actionDigest });
    store.bindExecution(host, recipient, { taskRef: task.taskRef, role: 'worker', sessionRef: worker.sessionRef, generationRef: worker.generationRef });
    const broker = new MessageBroker(store, { hostHandle: host, transport: f.adapter.transport() });
    function prepareMessage(tag) {
      const body = store.putData(owner, { ...bind(`${tag}-body`), kind: 'message', content: 'Synthetic separately approved context', sourceRef: d('vertical-source') });
      const accepted = broker.accept(owner, { ...bind(`${tag}-accept`), messageRef: d(`${tag}-message`), recipientHandle: recipient, bodyRecordRef: body.recordRef, bodyDigest: body.digest, byteLength: body.byteLength, sourceRef: d('vertical-source'), eventRef: d(`${tag}-event`), category: 'context', purposeRef: d('vertical-purpose'), hopLimit: 2, dedupMode: 'unique_id' });
      const spec = { ...f.spec, actionRef: d(`${tag}-action`), targetDigest: accepted.targetDigest, dataDigest: body.digest, attemptGroupRef: d(`${tag}-group`), charges: { runtimeMs: 0, usageUnits: 0, costEstimateMicros: 0 }, executor: { ...f.spec.executor, mode: 'none', generationRef: d(`${tag}-generation`) } };
      const planned = store.planAction(owner, { ...bind(`${tag}-plan`), spec });
      store.grantAction(owner, { ...bind(`${tag}-grant`), actionRef: planned.actionRef, actionDigest: planned.actionDigest, expiresAt: Date.now() + 60000 });
      return { ...bind(`${tag}-dispatch`), messageRef: accepted.messageRef, actionRef: planned.actionRef, actionDigest: planned.actionDigest };
    }
    const command = prepareMessage('first');
    assert.throws(() => store.assertClaimCurrent(host, { taskRef: task.taskRef, claimRef: worker.claimRef, generationRef: worker.generationRef, actionDigest: action.actionDigest }), { code: 'CLAIM_REVOKED' }, 'new message grant advances epoch');
    const delivered = await broker.dispatch(owner, command); assert.equal(delivered.message.state, 'sent'); assert.equal(f.injected(), 1); assert.equal(f.stats().streams, 0);
    assert.equal((await broker.dispatch(owner, command)).dispatched, false); assert.equal(f.injected(), 1);
    assert.equal((await broker.reconcile(owner, { taskRef: task.taskRef, messageRef: command.messageRef })).state, 'unknown', 'queue acceptance never establishes consumption');
    assert.throws(() => store.assertWorkerOwned(host, { taskRef: task.taskRef, workerClaimRef: worker.claimRef, generationRef: worker.generationRef, sessionRef: d('wrong-session') }), { code: 'WORKER_UNAVAILABLE' });
    const second = prepareMessage('second'); cancelBeforeInject = true;
    const denied = await broker.dispatch(owner, second); assert.equal(denied.message.state, 'unknown'); assert.equal(f.injected(), 1, 'cancel committed after claim but before inject retains outbox and blocks native delivery');
    assert.equal(store.snapshot(owner, { taskRef: task.taskRef }).actions.every(a => a.releaseEvidenceRef === null), true);
  } finally { await manager.close(); store.close(); rmSync(directory, { recursive: true }); await f.close(); }
});

test('message native admission defaults deny even for a live owned worker and well-formed queued body', async () => {
  const f = await fixture();
  try {
    const adapter = new NativeAdapter(f.ctx, { environments: f.environments, permission: () => true });
    const ticket = await adapter.prepare(f.spec, f.task, d('digest'));
    adapter.bindClaim(ticket, { actionRef: d('action'), claimRef: d('claim'), reservationRef: d('reservation'), actionDigest: d('digest'), generationRef: d('gen') }, () => true);
    const created = await adapter.create(ticket), content = 'Synthetic denied message', digest = createHash('sha256').update(content).digest('hex');
    await assert.rejects(adapter.transport().send({ taskRef: f.task.taskRef, state: 'outbox_committed', messageRef: d('message'), bodyDigest: digest, byteLength: Buffer.byteLength(content), claimRef: d('message-claim'), reservationRef: d('message-reservation'), generationRef: d('message-generation'), immutableMetadata: { recipientSessionRef: created.sessionRef, recipientGenerationRef: created.generationRef } }, { kind: 'message', content, digest }), { code: 'MESSAGE_ADMISSION_DENIED' });
    assert.equal(f.injected(), 0); assert.equal(f.stats().streams, 0); await adapter.dispose(ticket);
  } finally { await f.close(); }
});

test('genuine AgentLoop observable local deterministic stream commits session facts with one scoped claim, no external calls', async () => {
  const f = await fixture({ actualLoop: true, deterministicStream: true }), owner = {}, host = {};
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'df-local-loop-ledger-')));
  const store = new RuntimeStore({ databasePath: join(directory, 'ledger.sqlite'), encryptionKey: Buffer.alloc(32, 9), principals: [{ handle: owner, role: 'owner', scope: { ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' } }, { handle: host, role: 'host', scope: { ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' } }], hostPermission: () => true });
  const manager = new WorkerManager({ store, hostHandle: host, adapter: f.adapter });
  const status = [], frames = [], events = [], errors = []; let timer;
  f.ctx.on('agent/status', ({ agent }) => status.push(agent.status));
  f.ctx.on('agent/error', () => errors.push('NATIVE_ERROR'));
  f.ctx.on('agent/assistant-stream', ({ frame }) => frames.push({ type: frame.type, index: frame.index, revision: frame.revision, outcome: frame.outcome?.kind, seq: frame.outcome?.seq }));
  f.ctx.on('session/event', (_session, event) => events.push({ type: event.type, seq: event.seq, ...(event.type === 'user/message' && typeof event.data?.id === 'string' ? { messageRef: d(event.data.id) } : {}) }));
  try {
    const task = store.intake(owner, { taskId: 'synthetic-local-loop', provider: 'fixture', source: 'source', eventId: 'event', commandRef: d('local-loop-intake') }).task;
    store.policy(owner, { commandRef: d('local-loop-policy'), expectedVersion: 1, limits: {}, modelPolicy: { version: 1, presetRefs: [d('preset')], catalogEvidenceRef: d('catalog') } });
    const planned = store.planAction(owner, { taskRef: task.taskRef, commandRef: d('local-loop-plan'), expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch, spec: f.spec });
    const grant = store.grantAction(owner, { taskRef: task.taskRef, actionRef: planned.actionRef, actionDigest: planned.actionDigest, commandRef: d('local-loop-grant'), expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch, expiresAt: Date.now() + 60000 });
    const worker = await manager.dispatch(owner, { taskRef: task.taskRef, actionRef: planned.actionRef, actionDigest: planned.actionDigest, commandRef: d('local-loop-dispatch'), expectedTaskVersion: grant.taskVersion, expectedAuthEpoch: grant.authEpoch });
    const agent = f.ctx.agents.get(`df-${worker.generationRef}`);
    agent.send({ id: 'synthetic-local-turn', role: 'user', content: [{ type: 'text', text: 'Synthetic local task' }], source: { kind: 'df-fixture', form: 'local' } }, 'next-turn', true);
    await Promise.race([agent.whenIdle(), new Promise((_resolve, reject) => { timer = setTimeout(() => { agent.cancel({ kind: 'user' }, { keepInbox: false }); reject(new Error('LOCAL_LOOP_TIMEOUT_UNKNOWN')); }, 2000); })]);
    clearTimeout(timer);
    assert.deepEqual(errors, []); assert.equal(f.stats().streams, 1); assert.equal(agent.status, 'idle'); assert.deepEqual(status, ['running', 'idle']);
    assert.equal(frames[0].type, 'start'); const committed = frames.find(frame => frame.type === 'end' && frame.outcome === 'committed'); assert.ok(committed);
    assert.ok(events.some(event => event.type === 'assistant/message' && event.seq === committed.seq));
    assert.equal(events.filter(event => event.type === 'user/message' && event.messageRef === d('synthetic-local-turn')).length, 1, 'one explicit input; native runtime context is a separate user record'); assert.equal(events.filter(event => event.type === 'assistant/message').length, 1);
    const current = await manager.query(owner, { taskRef: task.taskRef, actionRef: planned.actionRef, claimRef: worker.claimRef, generationRef: worker.generationRef });
    assert.equal(current.phase, 'ready'); assert.equal(current.sessionRef, worker.sessionRef);
    const snapshot = store.snapshot(owner, { taskRef: task.taskRef }); assert.equal(snapshot.actions[0].actionDigest, planned.actionDigest); assert.ok(snapshot.workers[0].cursor >= committed.seq); assert.equal(snapshot.task.status, 'running', 'local driver quiescence does not complete the task'); assert.equal(snapshot.actions[0].releaseEvidenceRef, null);
  } finally { clearTimeout(timer); await manager.close(); store.close(); rmSync(directory, { recursive: true }); await f.close(); }
});

test('genuine store→worker→broker→AgentLoop consumes exact approved scoped message only after explicit local wakeup', async () => {
  const owner = {}, host = {}, recipient = {}; let store, timer;
  const f = await fixture({ actualLoop: true, deterministicStream: true, messageAdmission(message, worker) { store.assertMessageCurrent(host, message); store.assertWorkerOwned(host, worker); return true; } });
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'df-broker-loop-ledger-')));
  store = new RuntimeStore({ databasePath: join(directory, 'ledger.sqlite'), encryptionKey: Buffer.alloc(32, 17), limits: { maxActive: 8 }, principals: [{ handle: owner, role: 'owner', scope: { ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' }, sessionRef: d('broker-loop-owner-session'), generationRef: d('broker-loop-owner-generation') }, { handle: host, role: 'host', scope: { ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' } }], hostPermission: () => true });
  const manager = new WorkerManager({ store, hostHandle: host, adapter: f.adapter }), inputs = [], frames = [], errors = [];
  f.ctx.on('session/event', (session, event) => { if (event.type === 'user/message' && typeof event.data.id === 'string') inputs.push({ sessionRef: createHash('sha256').update(session.id).digest('hex'), messageRef: d(event.data.id), seq: event.seq, bodyDigest: createHash('sha256').update(event.data.content.filter(block => block.type === 'text').map(block => block.text).join('')).digest('hex'), sourceKind: event.data.source?.kind, sourceForm: event.data.source?.form }); });
  f.ctx.on('agent/assistant-stream', ({ frame }) => frames.push({ type: frame.type, outcome: frame.outcome?.kind, seq: frame.outcome?.seq }));
  f.ctx.on('agent/error', () => errors.push('NATIVE_ERROR'));
  try {
    const task = store.intake(owner, { taskId: 'synthetic-broker-loop', provider: 'fixture', source: 'source', eventId: 'event', commandRef: d('broker-loop-intake') }).task;
    const bind = command => { const now = store.task(owner, task.taskRef); return { taskRef: task.taskRef, commandRef: d(command), expectedTaskVersion: now.version, expectedAuthEpoch: now.authEpoch }; };
    store.policy(owner, { commandRef: d('broker-loop-policy'), expectedVersion: 1, limits: {}, modelPolicy: { version: 1, presetRefs: [d('preset')], catalogEvidenceRef: d('catalog') } });
    const action = store.planAction(owner, { ...bind('broker-loop-worker-plan'), spec: f.spec });
    store.grantAction(owner, { ...bind('broker-loop-worker-grant'), actionRef: action.actionRef, actionDigest: action.actionDigest, expiresAt: Date.now() + 60000 });
    const worker = await manager.dispatch(owner, { ...bind('broker-loop-worker-dispatch'), actionRef: action.actionRef, actionDigest: action.actionDigest });
    store.bindExecution(host, recipient, { taskRef: task.taskRef, role: 'worker', sessionRef: worker.sessionRef, generationRef: worker.generationRef });
    const broker = new MessageBroker(store, { hostHandle: host, transport: f.adapter.transport() });
    const body = store.putData(owner, { ...bind('broker-loop-body'), kind: 'message', content: 'Synthetic approved scoped task context', sourceRef: d('broker-loop-source') });
    const accepted = broker.accept(owner, { ...bind('broker-loop-accept'), messageRef: d('broker-loop-message'), recipientHandle: recipient, bodyRecordRef: body.recordRef, bodyDigest: body.digest, byteLength: body.byteLength, sourceRef: d('broker-loop-source'), eventRef: d('broker-loop-event'), category: 'context', purposeRef: d('broker-loop-purpose'), hopLimit: 2, dedupMode: 'unique_id' });
    const spec = { ...f.spec, actionRef: d('broker-loop-message-action'), targetDigest: accepted.targetDigest, dataDigest: body.digest, attemptGroupRef: d('broker-loop-message-attempt'), charges: { runtimeMs: 0, usageUnits: 0, costEstimateMicros: 0 }, executor: { ...f.spec.executor, mode: 'none', generationRef: d('broker-loop-message-generation') } };
    const planned = store.planAction(owner, { ...bind('broker-loop-message-plan'), spec });
    store.grantAction(owner, { ...bind('broker-loop-message-grant'), actionRef: planned.actionRef, actionDigest: planned.actionDigest, expiresAt: Date.now() + 60000 });
    const dispatch = { ...bind('broker-loop-message-dispatch'), messageRef: accepted.messageRef, actionRef: planned.actionRef, actionDigest: planned.actionDigest };
    const queued = await broker.dispatch(owner, dispatch); assert.equal(queued.message.state, 'sent'); assert.equal(f.stats().streams, 0);
    assert.equal(inputs.filter(input => input.messageRef === d(accepted.messageRef)).length, 0, 'native injection is queued without driver consumption');
    const agent = f.ctx.agents.get(`df-${worker.generationRef}`);
    // Explicitly authorized local fixture wakeup; production transport never
    // wakes a provider merely because its inbox accepted a message.
    agent.send({ id: 'synthetic-broker-loop-wakeup', role: 'user', content: [{ type: 'text', text: 'Synthetic fixture wakeup' }], source: { kind: 'df-fixture', form: 'local' } }, 'next-turn', true);
    await Promise.race([agent.whenIdle(), new Promise((_resolve, reject) => { timer = setTimeout(() => { agent.cancel({ kind: 'user' }, { keepInbox: false }); reject(new Error('LOCAL_BROKER_LOOP_TIMEOUT_UNKNOWN')); }, 2000); })]); clearTimeout(timer);
    assert.deepEqual(errors, []); assert.equal(f.stats().streams, 1); assert.equal(agent.status, 'idle');
    const consumption = inputs.filter(input => input.messageRef === d(accepted.messageRef)); assert.equal(consumption.length, 1); assert.equal(consumption[0].sessionRef, worker.sessionRef); assert.equal(consumption[0].bodyDigest, body.digest); assert.equal(consumption[0].sourceKind, 'df-relay'); assert.equal(consumption[0].sourceForm, 'relay');
    const providerInputs = f.requests().flat().filter(input => input.messageRef === d(accepted.messageRef)); assert.equal(providerInputs.length, 1); assert.equal(providerInputs[0].bodyDigest, body.digest); assert.equal(providerInputs[0].sourceKind, 'df-relay');
    assert.ok(frames.some(frame => frame.type === 'end' && frame.outcome === 'committed'));
    assert.equal(store.getMessage(owner, { taskRef: task.taskRef, messageRef: accepted.messageRef }).state, 'sent', 'observed native input alone is not an automatic production consumption receipt');
    const consumptionEvidence = d(JSON.stringify({ taskRef: task.taskRef, workerClaimRef: worker.claimRef, generationRef: worker.generationRef, messageRef: accepted.messageRef, bodyDigest: body.digest, observation: consumption[0] }));
    const consumed = store.messageObservation(host, { taskRef: task.taskRef, messageRef: accepted.messageRef, commandRef: d('broker-loop-observed-consumption'), claimRef: queued.message.claimRef, generationRef: queued.message.generationRef, state: 'consumed', evidenceRef: consumptionEvidence });
    assert.equal(consumed.state, 'consumed'); assert.equal((await broker.dispatch(owner, dispatch)).dispatched, false); assert.equal(f.stats().streams, 1);
    const snapshot = store.snapshot(owner, { taskRef: task.taskRef }); assert.equal(snapshot.actions.find(a => a.actionRef === planned.actionRef).actionDigest, planned.actionDigest); assert.equal(snapshot.workers.find(w => w.claimRef === worker.claimRef).generationRef, worker.generationRef); assert.notEqual(snapshot.task.status, 'completed'); assert.equal(snapshot.actions.every(a => a.releaseEvidenceRef === null), true);
  } finally { clearTimeout(timer); await manager.close(); store.close(); rmSync(directory, { recursive: true }); await f.close(); }
});
