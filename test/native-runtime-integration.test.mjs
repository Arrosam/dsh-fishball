import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable, Writable } from 'node:stream';
import { createHash } from 'node:crypto';
import { DSH_WEB_RUNTIME_ROOT } from '../src/host-probe.mjs';
import { createRuntimePlugin } from '../src/runtime-plugin.mjs';
import { EnvironmentRegistry } from '../src/environment.mjs';
import { RuntimeStore } from '../src/runtime-store.mjs';
import { canonicalDigest } from '../src/runtime-security.mjs';
const d = value => createHash('sha256').update(value).digest('hex');
const root = `${DSH_WEB_RUNTIME_ROOT}/node_modules/@deepseek-ai`;
const { Context } = await import(`${root}/cordis/lib/index.js`);
const { default: SessionStore } = await import(`${root}/dsh-session/lib/index.js`);
const { default: ApprovalService } = await import(`${root}/dsh-user-approval/lib/index.js`);
const { HostConnectionService } = await import(`${root}/dsh-client-connection/lib/index.js`);
const { AgentRegistry } = await import(`${root}/dsh-agent/lib/index.js`);
const { LlmRuntime, LlmAdapter } = await import(`${root}/dsh-llm/lib/index.js`);
const { default: SessionProjectionRegistry } = await import(`${root}/dsh-session-projection/lib/index.js`);
const { default: JsonlSessionPersistence } = await import(`${root}/dsh-session-persistence-jsonl/lib/index.js`);
const { default: SystemPrompt } = await import(`${root}/dsh-system-prompt/lib/index.js`);
const { default: ToolRuntime } = await import(`${root}/dsh-tools/lib/index.js`);
const { default: AgentLoop } = await import(`${root}/dsh-agent-loop/lib/index.js`);

async function productFlow(cancelBeforeQuit) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'df-native-runtime-'))), ctx = new Context(), routes = new Map();
  ctx.logger.exporters?.clear?.(); let plugin, privateReviewer, streams = 0, sequence = 0; const providerInputs = [];
  const databasePath = join(directory, 'ledger.sqlite'), key = Buffer.alloc(32, 17);
  const send = async (operation, input = {}, authenticated = true) => {
    const method = `v1/${operation}`, request = Readable.from([Buffer.from(JSON.stringify({ type: 'client-request', rpcId: 'synthetic-runtime-rpc', method, payload: input }))]);
    Object.assign(request, { method: 'POST', url: `/df-rpc/${method}`, headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'content-type': 'application/json', 'x-synthetic-auth': authenticated ? 'approved' : 'denied' } });
    const parts = [], response = new Writable({ write(bytes, _encoding, done) { parts.push(Buffer.from(bytes)); done(); } }); response.writeHead = code => { response.statusCode = code; };
    await routes.get('/df-rpc').handler(request, response);
    return response.statusCode === 200 ? JSON.parse(Buffer.concat(parts).toString()).result : { ok: false, status: response.statusCode };
  };
  const good = async (operation, input) => { const result = await send(operation, input); assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
  let taskRef;
  const cas = async label => { const snapshot = await good('status', { taskRef }); return { taskRef, commandRef: d(`${label}-${++sequence}`), expectedTaskVersion: snapshot.task.version, expectedAuthEpoch: snapshot.task.authEpoch }; };
  try {
    ctx.provide('webServer', { register(route) { routes.set(route.path, route); return () => routes.delete(route.path); } });
    await ctx.plugin(SessionProjectionRegistry); await ctx.plugin(SessionStore); await ctx.plugin(ApprovalService, { policy: 'never' });
    await ctx.plugin(JsonlSessionPersistence, { root: join(directory, 'sessions'), compression: 'none' });
    await ctx.plugin(AgentRegistry); await ctx.plugin(LlmRuntime);
    class LocalProvider extends LlmAdapter {
      async resolveModel(provider, id) { return { provider, id, name: 'Synthetic local model', reasoning: { efforts: [{ id: 'fixture-effort', name: 'Fixture effort' }] } }; }
      async *stream(options) {
        streams++; assert.equal(options.provider, 'synthetic-provider'); assert.equal(options.model, 'synthetic-model'); assert.equal(options.tools?.length ?? 0, 0);
        providerInputs.push(options.messages.filter(message => message.source?.kind === 'df-context').map(message => ({ id: d(message.id), digest: d(message.content.filter(block => block.type === 'text').map(block => block.text).join('')) })));
        yield { type: 'block-start', index: 0, blockType: 'text' };
        yield { type: 'text-delta', index: 0, text: 'Synthetic native immutable result' };
        yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Synthetic native immutable result' } };
        yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
        yield { type: 'finish', reason: { kind: 'stop' } };
      }
    }
    ctx.llm.registerAdapter(['synthetic-provider'], new LocalProvider());
    await ctx.plugin(SystemPrompt, {}); await ctx.plugin(ToolRuntime, {}); await ctx.plugin(AgentLoop, { agents: [], maxParallelToolCalls: 1 });
    await ctx.plugin({ apply(connectionCtx) { new HostConnectionService(connectionCtx, [], { isAuthenticated: request => request.headers['x-synthetic-auth'] === 'approved' }); } });
    const entry = { environmentRef: d('environment'), workspaceRef: d('synthetic-workspace'), bindingDigest: d('environment-binding'), toolsDigest: d('no-tools'), permissionPolicyDigest: d('synthetic-permission'), root: directory, cwd: directory, provider: 'synthetic-provider', model: 'synthetic-model', reasoningEffort: 'fixture-effort', modelRef: d('model'), reasoningRef: d('reasoning'), presetRef: d('preset') };
    const environments = new EnvironmentRegistry({ entries: [entry], currentState: () => d('current-environment-state') });
    plugin = ctx.plugin(createRuntimePlugin({ identity: () => ({ ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' }), encryptionKey: () => key, hostPermission: () => true,
      runtimeLimits: { maxMetadataBytes: 8192 }, memory: { namespaceRef: d('memory'), tokenize: text => Math.ceil(text.length / 4), byteLimit: 65536, tokenLimit: 16384 },
      worker: { environments, permission: () => true, toolGuard: ({agent,schemas}) => schemas.length === 0 && ctx.tools.schemas(agent).length === 0 }, previewTtlMs: 30000,
      previewResolver: async spec => ({ targetDigest: spec.targetDigest, ...spec.model, environmentRef: entry.environmentRef, bindingDigest: entry.bindingDigest, toolsDigest: entry.toolsDigest, permissionPolicyDigest: entry.permissionPolicyDigest, evidenceRef: d('trusted-concrete-meaning'), targetLabel: spec.kind === 'review' ? 'Independent review of exact synthetic artifact' : 'Owned synthetic local context execution', providerLabel: 'Local deterministic provider', modelLabel: 'Synthetic model', reasoningLabel: 'Fixture effort', presetLabel: 'Synthetic bounded preset', environmentLabel: 'Owned disposable project', cwd: directory, toolNames: [] }),
      reviewerInstaller: api => { privateReviewer = api; return () => { privateReviewer = undefined; }; },
    }), { databasePath }); await plugin;
    assert.deepEqual(Object.keys(ctx.df), ['diagnostics']); assert.equal(ctx.df.diagnostics().capabilities.worker, true);
    const registered = await good('intake', { taskId: 'synthetic-native-runtime', provider: 'fixture', source: 'owner-rpc', eventId: 'first', commandRef: d('intake'), goal: 'Produce a local synthetic result' }); taskRef = registered.task.taskRef;
    await good('revise', { ...await cas('constraints'), reason: 'operator', constraints: 'No tools, external calls or credentials' });
    assert.equal((await send('status', { taskRef }, false)).status, 401);
    assert.equal((await send('prepareContext', { ...await cas('forged-context'), principal: 'owner', terms: [], now: Date.now() })).ok, false);
    await good('policy', { commandRef: d('policy'), expectedVersion: 1, limits: {}, modelPolicy: { version: 1, presetRefs: [d('preset')], catalogEvidenceRef: d('catalog') } });
    const context = await good('prepareContext', { ...await cas('prepare'), terms: [], now: Date.now() });
    const current = await good('status', { taskRef });
    const scoped = await good('detail', { taskRef, recordRef: context.recordRef, expectedTaskVersion: current.task.version, expectedAuthEpoch: current.task.authEpoch });
    const envelope = JSON.parse(scoped.data.content); assert.equal(envelope.materialKind, 'execution_context'); assert.ok(envelope.content.includes('No tools, external calls or credentials')); assert.equal(d(scoped.data.content), context.digest);
    const spec = { actionRef: d('worker-action'), kind: 'write', role: 'worker', targetDigest: d('worker-target'), dataDigest: context.digest, units: 1, charges: { runtimeMs: 10, usageUnits: 2, costEstimateMicros: 0 }, attemptGroupRef: d('worker-attempt'), attemptIndex: 1, resourcePolicyVersion: 2, modelPolicyVersion: 1, model: { presetRef: entry.presetRef, modelRef: entry.modelRef, reasoningRef: entry.reasoningRef, catalogEvidenceRef: d('catalog') }, executor: { mode: 'create', generationRef: d('worker-generation'), environmentRef: entry.environmentRef, bindingDigest: entry.bindingDigest, toolsDigest: entry.toolsDigest, permissionPolicyDigest: entry.permissionPolicyDigest } };
    const plan = await good('plan', { ...await cas('plan'), spec });
    assert.equal((await send('grant', { ...await cas('unpreviewed-grant'), actionRef: plan.actionRef, actionDigest: plan.actionDigest, expiresAt: Date.now() + 60000 })).ok, false);
    const previewCas = await cas('preview'), { commandRef: ignored, ...previewBinding } = previewCas;
    const preview = await good('preview', { ...previewBinding, actionRef: plan.actionRef, actionDigest: plan.actionDigest, recordRef: context.recordRef }); assert.equal(preview.description.data.content, scoped.data.content);
    await good('grant', { ...await cas('grant'), actionRef: plan.actionRef, actionDigest: plan.actionDigest, previewRef: preview.previewRef, expiresAt: Date.now() + 60000 });
    const worker = await good('dispatch', { ...await cas('dispatch'), actionRef: plan.actionRef, actionDigest: plan.actionDigest }); assert.equal(worker.phase, 'ready'); assert.equal(streams, 0);
    const executeInput = { ...await cas('execute'), actionRef: plan.actionRef, actionDigest: plan.actionDigest, claimRef: worker.claimRef, generationRef: worker.generationRef, contextRecordRef: context.recordRef, timeoutMs: 2000 };
    const execution = await good('execute', executeInput); assert.equal(execution.state, 'committed'); assert.equal(streams, 1); assert.deepEqual(providerInputs.flat(), [{ id: d(execution.executionRef), digest: context.digest }]);
    assert.equal((await good('execute', executeInput)).admitted, false); assert.equal(streams, 1);
    const capture = { ...await cas('capture'), actionRef: plan.actionRef, claimRef: worker.claimRef, generationRef: worker.generationRef, executionRef: execution.executionRef, artifactRef: d('result-artifact'), version: 1 };
    assert.equal((await send('captureResult', { ...capture, content: 'Substituted owner proof' })).ok, false);
    const artifact = await good('captureResult', capture); assert.equal(artifact.producerClaimRef, worker.claimRef); assert.equal(artifact.generationRef, worker.generationRef); assert.equal(artifact.verification, null);
    const readback = await good('status', { taskRef }); const resultBody = await good('detail', { taskRef, recordRef: artifact.recordRef, expectedTaskVersion: readback.task.version, expectedAuthEpoch: readback.task.authEpoch });
    assert.equal(artifact.digest, d(resultBody.data.content)); const nativeResult = JSON.parse(resultBody.data.content);
    assert.equal(nativeResult.content, 'Synthetic native immutable result'); assert.equal(nativeResult.contractVersion, 'df.native-result/v1');
    assert.equal(nativeResult.source.executionRef, execution.executionRef); assert.equal(nativeResult.source.inputDigest, context.digest); assert.equal(nativeResult.source.resultDigest, d(nativeResult.content)); assert.equal(nativeResult.source.sessionRef, worker.sessionRef); assert.equal(nativeResult.source.claimRef, worker.claimRef); assert.equal(nativeResult.source.generationRef, worker.generationRef);
    assert.equal((await send('writeArtifact', { ...await cas('owner-producer-spoof'), artifactRef: d('owner-artifact'), version: 1, content: 'Owner bytes', producerClaimRef: worker.claimRef, generationRef: worker.generationRef })).ok, false);
    const requirement = await good('configureAudit', { ...await cas('audit-configure'), auditRef: d('independent-audit'), expectedAuditRevision: 0, artifactRef: artifact.artifactRef, artifactVersion: artifact.version, digest: artifact.digest, material: [{ recordRef: artifact.recordRef, digest: artifact.digest }], policyRef: d('explicit-audit-policy'), blockingSeverities: ['fatal', 'blocking'], maxRepairRounds: 0 });
    assert.equal((await send('report', { verdict: 'passed', evidenceRef: d('payload-proof') })).error.code, 'ENDPOINT_NOT_FOUND');
    assert.equal((await send('complete', await cas('premature-complete'))).ok, false);
    const reviewSpec = { ...spec, actionRef: d('review-action'), kind: 'review', role: 'review', targetDigest: requirement.bindingDigest, dataDigest: artifact.digest, attemptGroupRef: d('review-attempt'), executor: { ...spec.executor, generationRef: d('review-generation') } };
    const reviewPlan = await good('plan', { ...await cas('review-plan'), spec: reviewSpec });
    const { commandRef: unused, ...reviewPreviewBinding } = await cas('review-preview');
    const reviewPreview = await good('preview', { ...reviewPreviewBinding, actionRef: reviewPlan.actionRef, actionDigest: reviewPlan.actionDigest, recordRef: artifact.recordRef });
    await good('grant', { ...await cas('review-grant'), actionRef: reviewPlan.actionRef, actionDigest: reviewPlan.actionDigest, previewRef: reviewPreview.previewRef, expiresAt: Date.now() + 60000 });
    const reviewWorker = await good('dispatch', { ...await cas('review-dispatch'), actionRef: reviewPlan.actionRef, actionDigest: reviewPlan.actionDigest }); assert.equal(reviewWorker.phase, 'ready'); assert.equal(streams, 1);
    privateReviewer.bind({ taskRef, generationRef: reviewWorker.generationRef, sessionRef: reviewWorker.sessionRef, readRecordRefs: [artifact.recordRef] });
    assert.equal(privateReviewer.read({ taskRef, recordRef: artifact.recordRef }).content, resultBody.data.content);
    const verified = privateReviewer.verify({ taskRef, commandRef: d('independent-artifact-verification'), artifactRef: artifact.artifactRef, version: artifact.version, digest: artifact.digest, verdict: 'accepted', evidenceRef: d('private-local-exact-content-check') }); assert.equal(verified.verification.verdict, 'accepted');
    const audit = privateReviewer.audit({ taskRef, auditRef: requirement.auditRef });
    const report = privateReviewer.report({ taskRef, commandRef: d('independent-report'), auditRef: audit.auditRef, artifactVersion: artifact.version, digest: artifact.digest, materialDigest: audit.materialDigest, claimRef: reviewWorker.claimRef, generationRef: reviewWorker.generationRef, coverageRefs: [artifact.recordRef], unexaminedRefs: [], verdict: 'passed', findings: [], evidenceRef: d('private-local-audit-check') }); assert.equal(report.state, 'passed');
    const held = await good('status', { taskRef }); assert.notEqual(held.task.status, 'completed'); assert.equal(held.actions.every(action => action.releaseEvidenceRef === null), true);
    if (cancelBeforeQuit) { const cancelled = await good('control', { ...await cas('cancel'), kind: 'cancel' }); assert.equal(cancelled.workers.every(value => value.phase === 'stopped'), true); assert.equal(ctx.agents.list().length, 0); } else { assert.equal(ctx.agents.list().length, 2); } assert.equal(streams, 1);
    const borrowed = ctx.df, oldReviewer = privateReviewer, disposing = plugin.dispose(); assert.throws(() => borrowed.diagnostics(), { code: 'SERVICE_DISPOSED' }); assert.throws(() => oldReviewer.read({ taskRef, recordRef: artifact.recordRef }), { code: 'SERVICE_DISPOSED' }); await disposing; plugin = undefined; assert.equal(routes.has('/df-rpc'), false); assert.equal(ctx.agents.list().length, 0); assert.equal(streams, 1);
    const owner = {}, reopened = new RuntimeStore({ databasePath, encryptionKey: key, principals: [{ handle: owner, role: 'owner', scope: { ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' } }] });
    try { const after = reopened.snapshot(owner, { taskRef }); assert.equal(after.task.status, cancelBeforeQuit ? 'cancel_requested' : 'recovery_required'); assert.equal(after.workers.every(value => value.phase === 'stopped'), true); assert.equal(after.actions.every(value => value.releaseEvidenceRef === null), true); } finally { reopened.close(); }
  } finally { await plugin?.dispose(); await ctx.fiber.dispose(); rmSync(directory, { recursive: true, force: true }); }
}
test('native authenticated owner prepares, previews, grants and explicitly executes one real local loop; private reviewer and cancel preserve holds', { timeout: 15000 }, () => productFlow(true));
test('actual native plugin quit closes active owned workers after fiber deactivation and reopening retains accountable holds', { timeout: 15000 }, () => productFlow(false));


async function automationFixture(t, { installer, notifications = false } = {}) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'df-native-automation-'))), ctx = new Context(), routes = new Map();
  ctx.logger.exporters?.clear?.();
  t.after(async () => { try { await ctx.fiber.dispose(); } finally { rmSync(directory, { recursive: true, force: true }); } });
  ctx.provide('webServer', { register(route) { routes.set(route.path, route); return () => routes.delete(route.path); } });
  await ctx.plugin(SessionStore); await ctx.plugin(ApprovalService, { policy: 'never' });
  await ctx.plugin({ apply(connectionCtx) { new HostConnectionService(connectionCtx, [], { isAuthenticated: request => request.headers['x-synthetic-auth'] === 'approved' }); } });
  let transportCalls = 0;
  const databasePath = join(directory, 'ledger.sqlite'), key = Buffer.alloc(32, 19);
  const plugin = ctx.plugin(createRuntimePlugin({ identity: () => ({ ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' }), encryptionKey: () => key,
    runtimeLimits: { maxMetadataBytes: 8192 }, automationInstaller: installer,
    ...(notifications ? { results: { recipientAdapter: { send: async () => { transportCalls++; throw new Error('UNAPPROVED_SYNTHETIC_SEND'); }, query: async () => { transportCalls++; throw new Error('UNAPPROVED_SYNTHETIC_QUERY'); }, open: async () => { transportCalls++; throw new Error('UNAPPROVED_SYNTHETIC_OPEN'); } } }, notifications: { policyRef: d('native-notification-policy'), recipientRef: d('native-recipient'), channelRef: d('native-channel'), mergeKeyRef: d('native-merge') } } : {}),
  }), { databasePath }); await plugin;
  const send = async (operation, payload = {}, authenticated = true) => {
    const method = `v1/${operation}`, request = Readable.from([Buffer.from(JSON.stringify({ type: 'client-request', rpcId: 'synthetic-automation-rpc', method, payload }))]);
    Object.assign(request, { method: 'POST', url: `/df-rpc/${method}`, headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'content-type': 'application/json', 'x-synthetic-auth': authenticated ? 'approved' : 'denied' } });
    const parts = [], response = new Writable({ write(bytes, _encoding, done) { parts.push(Buffer.from(bytes)); done(); } }); response.writeHead = code => { response.statusCode = code; };
    await routes.get('/df-rpc').handler(request, response);
    return response.statusCode === 200 ? JSON.parse(Buffer.concat(parts).toString()).result : { ok: false, status: response.statusCode };
  };
  const good = async (operation, payload) => { const result = await send(operation, payload); assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
  return { ctx, plugin, routes, send, good, databasePath, key, transportCalls: () => transportCalls };
}
const nativeSource = (kind, tag, more = {}) => ({ commandRef: d(`${tag}-configure`), sourceRef: d(`${tag}-source`), expectedRevision: 0,
  spec: { kind, identityMode: 'unique_id', enabled: true, adapterRef: d(`${tag}-adapter`), permissionPolicyRef: d(`${tag}-permission`), maxEventAgeMs: 86400000, rate: { windowMs: 60000, maxEvents: 100 }, ...more } });
const nativeSubscription = (tag, source, triggerRef = d(`${tag}-trigger`)) => ({ commandRef: d(`${tag}-subscribe`), sourceRef: source.sourceRef, subscriptionRef: d(`${tag}-subscription`), expectedRevision: 0, expectedSourceRevision: 1, spec: { enabled: true, triggerRef, route: 'new_task' } });

test('trusted native automation installer admits deduplicated ingress and only exact owner approval resolves missed schedule; timers and tokens stop with plugin', { timeout: 10000 }, async t => {
  let api, cleanup = 0, notifications = 0;
  const f = await automationFixture(t, { installer: value => { api = value; return () => { cleanup++; }; } });
  assert.equal(Object.isFrozen(api), true); assert.equal(api.store, undefined); assert.equal(api.owner, undefined); assert.equal(api.hostHandle, undefined);
  assert.equal(f.ctx.df.diagnostics().capabilities.automation, true);
  for (const operation of ['registerEvent', 'ingestEvent', 'registerSchedule', 'tickSchedule', 'createChat']) assert.equal((await f.send(operation, { verified: true })).error.code, 'ENDPOINT_NOT_FOUND');
  const source = nativeSource('webhook', 'private-ingress'), sub = nativeSubscription('private-ingress', source);
  assert.equal((await f.send('configureSource', source, false)).status, 401);
  await f.good('configureSource', source); api.configureSubscription(sub);
  assert.equal((await f.good('source', { sourceRef: source.sourceRef })).revision, 1);
  assert.equal((await f.good('subscription', { subscriptionRef: sub.subscriptionRef })).sourceRef, source.sourceRef);
  assert.equal((await f.good('listSources')).length, 1); assert.equal(api.listSubscriptions().length, 1);
  const issued = { event: { id: 'synthetic-private-event', text: 'Synthetic authenticated native ingress', at: Date.now() } };
  const token = api.registerEvent({ sourceRef: source.sourceRef, subscriptionRef: sub.subscriptionRef, adapterRef: source.spec.adapterRef, providerRef: d('private-provider'), sourceIdentityRef: d('private-original-source'),
    verify: async payload => { if (canonicalDigest(payload) !== canonicalDigest(issued.event)) throw new Error('SYNTHETIC_INVALID_PROOF'); return { providerRef: d('private-provider'), sourceIdentityRef: d('private-original-source'), eventIdRef: d(issued.event.id), observedAt: issued.event.at }; },
    authorize: async () => true, isCurrent: () => true, normalize: payload => ({ goal: payload.text }) });
  assert.deepEqual(Object.keys(token), []);
  const request = { commandRef: d('native-ingress-first'), taskId: 'synthetic-private-task', payload: issued.event };
  await assert.rejects(api.ingestEvent({ ...token }, request));
  const first = await api.ingestEvent(token, request), duplicate = await api.ingestEvent(token, { ...request, commandRef: d('native-ingress-repeat') });
  assert.equal(duplicate.deduplicated, true); assert.equal(first.task.taskRef, duplicate.task.taskRef);
  const receipt = await f.good('eventReceipt', { sourceRef: source.sourceRef, subscriptionRef: sub.subscriptionRef, eventRef: first.eventRef });
  assert.equal(receipt.taskRef, first.task.taskRef); assert.equal((await f.good('listEventReceipts', { sourceRef: source.sourceRef, subscriptionRef: sub.subscriptionRef })).length, 1);
  const scheduleSpec = { kind: 'interval', timezone: 'Etc/UTC', catchUp: 'verify', maxAgeMs: 86400000, maxScanMinutes: 6000, anchorAt: 0, intervalMs: 60000 };
  const scheduleSource = nativeSource('schedule', 'private-schedule'), scheduleSub = nativeSubscription('private-schedule', scheduleSource, canonicalDigest(scheduleSpec));
  api.configureSource(scheduleSource); await f.good('configureSubscription', scheduleSub);
  const schedule = api.registerSchedule({ sourceRef: scheduleSource.sourceRef, subscriptionRef: scheduleSub.subscriptionRef, adapterRef: scheduleSource.spec.adapterRef,
    providerRef: d('private-clock'), sourceIdentityRef: d('private-schedule-original'), spec: scheduleSpec, startAfter: Math.floor(Date.now() / 60000) * 60000 - 180000,
    goal: 'Synthetic missed schedule creates a task only; no effects', externalEffect: true, authorize: async () => true, isCurrent: () => true });
  const pending = await api.tickSchedule(schedule); assert.equal(pending.state, 'verification_required');
  assert.equal((await f.good('list')).length, 1); assert.equal(api.statusSchedule(schedule).cursor, null);
  const approval = { commandRef: d('approve-native-schedule'), sourceRef: scheduleSource.sourceRef, subscriptionRef: scheduleSub.subscriptionRef, expectedSourceRevision: 1, expectedSubscriptionRevision: 1, clockRef: pending.clockRef, expectedCursor: null, planDigest: pending.planDigest };
  assert.equal((await f.send('approveSchedule', { ...approval, planDigest: d('forged-private-plan') })).ok, false);
  await f.good('approveSchedule', approval); assert.equal((await f.good('list')).length, 1);
  const admitted = await api.tickSchedule(schedule); assert.equal(admitted.state, 'admitted'); assert.equal(api.statusSchedule(schedule).pendingVerification, null);
  assert.equal((await f.good('list')).length, 2); assert.equal((await api.tickSchedule(schedule)).state, 'nothing_due');
  api.startSchedule(schedule, { pollMs: 60000, onStatus: () => { notifications++; } }); assert.equal(api.statusSchedule(schedule).polling, true);
  api.stopSchedule(schedule); assert.equal(api.statusSchedule(schedule).polling, false);
  api.startSchedule(schedule, { pollMs: 60000, onStatus: () => { notifications++; } });
  assert.equal(f.ctx.sessions.list().length, 0);
  const disposing = f.plugin.dispose(); assert.throws(() => api.statusSchedule(schedule), { code: 'SERVICE_DISPOSED' }); assert.throws(() => api.listSources(), { code: 'SERVICE_DISPOSED' });
  await disposing; assert.equal(cleanup, 1); assert.equal(notifications, 0); assert.equal(f.routes.has('/df-rpc'), false);
  assert.throws(() => api.ingestEvent(token, request), { code: 'SERVICE_DISPOSED' });
  const owner = {}, reopened = new RuntimeStore({ databasePath: f.databasePath, encryptionKey: f.key, principals: [{ handle: owner, role: 'owner', scope: { ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' } }] });
  try { assert.equal(reopened.listTasks(owner).length, 2); for (const task of reopened.listTasks(owner)) { const snapshot = reopened.snapshot(owner, { taskRef: task.taskRef }); assert.equal(snapshot.actions.length, 0); assert.equal(snapshot.workers.length, 0); } } finally { reopened.close(); }
});

test('private paired chat contract and explicit notification policy are native installation features; asynchronous ingress cannot outlive quit', { timeout: 10000 }, async t => {
  let api, release, cleanup = 0;
  const f = await automationFixture(t, { notifications: true, installer: value => { api = value; return () => { cleanup++; }; } });
  const routeBinding = { pairingRef: d('private-pair'), pairingRevision: 1, principalRef: d('private-paired-owner'), conversationRef: d('original-private-window'), conversationKind: 'private' };
  const source = nativeSource('chat', 'private-chat', { routeBinding }), sub = nativeSubscription('private-chat', source); api.configureSource(source); api.configureSubscription(sub);
  const issued = new Map();
  const issue = (id, kind, intent) => { const payload = { id, text: 'Synthetic private conversation instruction' }; issued.set(id, { digest: canonicalDigest(payload), proof: { providerRef: d('private-chat-provider'), sourceIdentityRef: d('private-chat-original'), eventIdRef: d(id), observedAt: Date.now(), routeBinding, eventKind: kind, ...(intent ? { requestDigest: canonicalDigest(intent) } : {}) } }); return payload; };
  const callbacks = { sourceRef: source.sourceRef, subscriptionRef: sub.subscriptionRef, adapterRef: source.spec.adapterRef, providerRef: d('private-chat-provider'), sourceIdentityRef: d('private-chat-original'),
    verify: async payload => { const issuedPayload = issued.get(payload.id); if (!issuedPayload || issuedPayload.digest !== canonicalDigest(payload)) throw new Error('SYNTHETIC_CHAT_PROOF'); return issuedPayload.proof; }, authorize: async () => true, isCurrent: () => true, normalize: payload => ({ content: payload.text, attachments: [] }), maxAttachments: 0, maxAttachmentBytes: 64 };
  assert.throws(() => api.createChat({ ...callbacks, store: {} }), { code: 'RUNTIME_ADAPTER_INVALID' });
  const chat = api.createChat(callbacks); assert.deepEqual(Object.keys(chat), ['ingest', 'status', 'control', 'readAttachment', 'recipientAdapter', 'dispose']);
  const receipt = await chat.ingest({ commandRef: d('private-chat-ingress'), taskId: 'synthetic-chat-task', payload: issue('native-chat-event', 'message') }), taskRef = receipt.task.taskRef;
  assert.equal((await chat.status({ taskRef, payload: issue('native-chat-status', 'status', { kind: 'status', taskRef }) })).task.taskRef, taskRef);
  const state = (await f.good('status', { taskRef })).task;
  const intent = { kind: 'control', taskRef, expectedTaskVersion: state.version, expectedAuthEpoch: state.authEpoch, control: 'pause' };
  const controlled = await chat.control({ taskRef, expectedTaskVersion: state.version, expectedAuthEpoch: state.authEpoch, kind: 'pause', payload: issue('native-chat-control', 'control', intent) });
  assert.equal(controlled.receipt.control, 'paused'); assert.deepEqual(controlled.workers, []);
  const paused = await f.good('status', { taskRef }); assert.equal(paused.control, 'paused'); assert.equal(paused.task.status, 'queued');
  await assert.rejects(chat.control({ taskRef, expectedTaskVersion: state.version, expectedAuthEpoch: state.authEpoch, kind: 'pause', commandRef: d('json-command'), payload: issue('forged-command', 'control', intent) }));
  assert.throws(() => chat.recipientAdapter(), { code: 'CHAT_DELIVERY_UNAVAILABLE' });
  assert.equal(f.ctx.df.diagnostics().capabilities.notifications, true);
  assert.equal((await f.send('pendingNotifications', { taskRef })).error.code, 'NOTIFICATION_POLICY_UNAVAILABLE');
  const policy = { enabled: true, timeZone: 'Etc/UTC', quietWindows: [], emergencyKinds: [], mergeKinds: [], mergeWindowMs: 0, minIntervalMs: 0, frequency: { windowMs: 60000, maxClaims: 1 } };
  await f.good('configureNotifications', { commandRef: d('explicit-notification-policy'), expectedRevision: 0, spec: policy });
  assert.equal((await f.good('notificationPolicy')).revision, 1);
  const pending = await f.good('pendingNotifications', { taskRef }); assert.equal(pending.notificationDelivered, false); assert.equal(pending.candidates.length, 0); assert.equal(f.transportCalls(), 0);
  const webhook = nativeSource('webhook', 'quit-race'), subscription = nativeSubscription('quit-race', webhook); api.configureSource(webhook); api.configureSubscription(subscription);
  const token = api.registerEvent({ sourceRef: webhook.sourceRef, subscriptionRef: subscription.subscriptionRef, adapterRef: webhook.spec.adapterRef, providerRef: d('race-provider'), sourceIdentityRef: d('race-original'),
    verify: async () => ({ providerRef: d('race-provider'), sourceIdentityRef: d('race-original'), eventIdRef: d('race-event'), observedAt: Date.now() }), authorize: () => new Promise(resolve => { release = resolve; }), isCurrent: () => true, normalize: () => ({ goal: 'This task must never be admitted after quit' }) });
  const inflight = api.ingestEvent(token, { commandRef: d('race-command'), taskId: 'synthetic-race-task', payload: {} });
  await Promise.resolve(); await Promise.resolve(); assert.equal(typeof release, 'function');
  await f.plugin.dispose(); release(true); await assert.rejects(inflight, { code: 'SERVICE_DISPOSED' });
  assert.equal(cleanup, 1); assert.throws(() => chat.ingest({}), { code: 'SERVICE_DISPOSED' }); assert.equal(f.transportCalls(), 0); assert.equal(f.ctx.sessions.list().length, 0);
  const owner = {}, reopened = new RuntimeStore({ databasePath: f.databasePath, encryptionKey: f.key, principals: [{ handle: owner, role: 'owner', scope: { ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' } }] });
  try { assert.equal(reopened.listTasks(owner).length, 1); } finally { reopened.close(); }
});
