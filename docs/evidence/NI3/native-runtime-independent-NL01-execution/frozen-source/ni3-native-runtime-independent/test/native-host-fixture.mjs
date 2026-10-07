import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Context } from '../../dsh-web/node_modules/@deepseek-ai/cordis/lib/index.js';
import Loader from '../../dsh-web/node_modules/@deepseek-ai/cordis-plugin-loader/lib/index.js';
import Sessions from '../../dsh-web/node_modules/@deepseek-ai/dsh-session/lib/index.js';
import Agents from '../../dsh-web/node_modules/@deepseek-ai/dsh-agent/lib/index.js';
import Projections from '../../dsh-web/node_modules/@deepseek-ai/dsh-session-projection/lib/index.js';
import Llm from '../../dsh-web/node_modules/@deepseek-ai/dsh-llm/lib/index.js';
import SystemPrompt from '../../dsh-web/node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js';
import Tools from '../../dsh-web/node_modules/@deepseek-ai/dsh-tools/lib/index.js';
import Approval from '../../dsh-web/node_modules/@deepseek-ai/dsh-user-approval/lib/index.js';
import Presets from '../../dsh-web/node_modules/@deepseek-ai/dsh-agent-preset-registry/lib/index.js';
import WebServer from '../../dsh-web/node_modules/@deepseek-ai/dsh-host-webserver/lib/index.js';
import { HostConnectionService } from '../../dsh-web/node_modules/@deepseek-ai/dsh-client-connection/lib/index.js';
import { resolveInstalledWorkerFacts } from '../../ni3-native-runtime/src/installed-worker-facts.mjs';

export const sha = value => createHash('sha256').update(value).digest('hex');
export const isRef = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, '../ni3-native-runtime');
const shaTarget = path => sha(readFileSync(resolve(target, path)));
assert.equal(shaTarget('src/runtime-plugin.mjs'), '16d2ba6d3bbc4c1c566dd3625a875966e537fe13fe7f198541975754270274ab');
assert.equal(shaTarget('src/client-entry.cjs'), 'cd703f820c1d2a02d5d4586922d39c25291843ec9f025c13b526c6acd87f14c0');
assert.equal(shaTarget('src/installed-audit.mjs'), '066f55c30d0044d2cab2a2823d6e3d90af504889ab6afc50efdf1f65692c637c');
assert.equal(process.version, 'v22.22.2');

export function assertRefs(value, fields) { for (const field of fields) assert.ok(isRef(value[field]), field); }
export function physical(path) {
  const stat = lstatSync(path);
  return { dev: stat.dev, ino: stat.ino, uid: stat.uid, mode: stat.mode & 0o777, directory: stat.isDirectory(), link: stat.isSymbolicLink() };
}
const syntheticDirectory = path => { mkdirSync(path, { mode: 0o700 }); assert.equal(physical(path).mode, 0o700); return path; };

export async function createNativeFixture(id) {
  const dataRoot = resolve(root, 'fixtures');
  if (!existsSync(dataRoot)) syntheticDirectory(dataRoot);
  const dir = mkdtempSync(resolve(dataRoot, `${id}-`));
  assert.equal(physical(dir).mode, 0o700);
  const profileDir = syntheticDirectory(resolve(dir, 'profile'));
  const workspace = syntheticDirectory(resolve(profileDir, 'workspace'));
  const parent = syntheticDirectory(resolve(profileDir, 'storage'));
  const directory = resolve(parent, 'df-sessions');
  const profile = Object.freeze({ dir: profileDir, name: `nri-${id.toLowerCase()}` });
  const selection = model => ({ provider: 'df-testing-local', model, agentPreset: 'nri-independent-empty', reasoningEffort: 'deterministic', maxOutputTokens: 4096 });
  const workerChoice = { enabled: true, selection: selection('df-testing-worker-v1'),
    environment: { root: workspace, cwd: workspace },
    persistence: { directory, compression: 'none', retention: 'owner-managed' },
    bounds: { requestBytes: 32768, resultBytes: 4096 },
    policy: { maxRuntimeMs: 60000, maxUsageUnits: 160000, maxCostEstimateMicros: 0 },
    charges: { runtimeMs: 15000, usageUnits: 40000 }, previewTtlMs: 60000, grantTtlMs: 60000 };
  const auditChoice = { enabled: true, inputByteLimit: 16384, resultByteLimit: 4096,
    maxPrivateReviewers: 1, blockingSeverities: ['blocking', 'fatal'], maxRepairRounds: 1, maxTotalAttempts: 4,
    review: { selection: selection('df-testing-review-v1'), charges: { runtimeMs: 15000, usageUnits: 40000 } },
    repair: { selection: selection('df-testing-repair-v1'), charges: { runtimeMs: 15000, usageUnits: 40000 } } };
  const config = { databasePath: resolve(parent, 'ledger.sqlite'),
    limits: { queueCapacity: 4, maxActive: 1, maxAttempts: 1, maxTasks: 4,
      maxActionsPerTask: 8, maxEventsPerTask: 128, maxMetadataBytes: 4096 },
    memory: { enabled: true, byteLimit: 16384, tokenLimit: 16384 }, worker: workerChoice, audit: auditChoice };
  const ctx = new Context();
  ctx.baseUrl = pathToFileURL(resolve(target, 'package.json')).href;
  ctx.provide('profileContext', profile);
  const requests = [], events = [], handlers = new Map(), readerCounts = { stat: 0, openRead: 0, read: 0, closeRead: 0, openWrite: 0, closeWrite: 0 };
  const rpcCalls = [], nativeIds = new Set();
  let serial = 0, abortBarrier = null, installedFiber, rootDisposed = false, childDisposed = false, closed = false;
  const command = label => sha(`${id}\u0000${label}\u0000${++serial}`);
  const originalRegister = HostConnectionService.prototype.register;
  // Public registration observer. Preserve the original service, owner,
  // channel, handler and registration effect. It grants no new authority.
  HostConnectionService.prototype.register = function (...args) {
    const result = Reflect.apply(originalRegister, this, args);
    const [owner, channel, handler] = args;
    assert.ok(owner instanceof Context);
    assert.ok(['/df-setup', '/df-rpc'].includes(channel));
    assert.equal(typeof handler, 'function');
    assert.equal(handlers.has(channel), false);
    handlers.set(channel, handler);
    return result;
  };
  const install = async (plugin, value) => { const fiber = ctx.plugin(plugin, value); await fiber; assert.equal(fiber.state, 2); return fiber; };
  try {
    await install(Projections);
    await install(Sessions);
    await install(Approval, { policy: 'never' });
    await install(Agents);
    await install(Llm);
    await install(SystemPrompt, { includeHarnessIdentity: false, includeRuntimeContext: false });
    await install(Tools, { mode: 'native', maxParallelSubCalls: 1 });
    new WebServer(ctx, { host: '127.0.0.1', port: 0, compression: 'none' });
    await install({ name: 'nri-independent-original-connection', inject: ['webServer'],
      apply(connectionCtx) { new HostConnectionService(connectionCtx, [], undefined); } });
    await install(Loader, { baseUrl: ctx.baseUrl });
    await install(Presets, { default: 'nri-independent-empty' });
    await ctx.agentPresets.register({ id: 'nri-independent-empty', name: 'Independent empty tools', plugins: [] });
    ctx.on('session/event', (session, event) => {
      assert.ok(events.length < 512);
      events.push({ sessionId: session.id, event });
    }, { global: true });
    ctx.on('tools/execute', (_execution, next) => {
      assert.fail('Unexpected native tool effect');
      return next();
    }, { global: true, prepend: true });
    // Original public event middleware. Every iterator operation forwards
    // the identical arguments to the same original iterator. No chunk,
    // usage, transcript, result, carrier, permission or currentness is supplied.
    ctx.on('llm/stream', (options, next) => {
      assert.ok(requests.length < 4);
      assert.equal(options.provider, 'df-testing-local');
      assert.ok(['df-testing-worker-v1', 'df-testing-review-v1', 'df-testing-repair-v1'].includes(options.model));
      assert.equal(options.maxTokens, 4096);
      assert.equal(options.reasoningEffort, 'deterministic');
      assert.equal(options.tools?.length ?? 0, 0);
      assert.equal(options.toolHistory?.tools?.length ?? 0, 0);
      assert.equal(options.toolHistory?.updates?.length ?? 0, 0);
      assert.ok(nativeIds.has(options.sessionId));
      const row = { options, chunks: [], nextCalls: 0, returnCalls: 0, throwCalls: 0, errors: [] };
      requests.push(row);
      const iterator = next()[Symbol.asyncIterator]();
      const barrier = abortBarrier?.sessionId === options.sessionId ? abortBarrier : null;
      return {
        [Symbol.asyncIterator]() { return this; },
        async next(...args) {
          assert.ok(++row.nextCalls <= 4);
          if (barrier?.position === 'before' && row.nextCalls === 1) { barrier.hits++; barrier.controller.abort(); }
          try {
            const step = await Reflect.apply(iterator.next, iterator, args);
            if (!step.done) { assert.ok(row.chunks.length < 3); row.chunks.push(step.value); }
            if (barrier?.position === 'after' && step.value?.type === 'text-delta' && barrier.hits === 0) {
              barrier.hits++; barrier.controller.abort();
            }
            return step;
          } catch (error) { row.errors.push(error?.code ?? null); throw error; }
        },
        async return(...args) {
          row.returnCalls++; assert.ok(row.returnCalls <= 1);
          assert.equal(typeof iterator.return, 'function');
          try { return await Reflect.apply(iterator.return, iterator, args); }
          catch (error) { row.errors.push(error?.code ?? null); throw error; }
        },
        async throw(...args) {
          row.throwCalls++; assert.ok(row.throwCalls <= 1);
          assert.equal(typeof iterator.throw, 'function');
          try { return await Reflect.apply(iterator.throw, iterator, args); }
          catch (error) { row.errors.push(error?.code ?? null); throw error; }
        },
      };
    }, { global: true, prepend: true });
    for (const row of [
      { name: '@deepseek-ai/dsh-session-persistence-jsonl', config: { root: directory, compression: 'none' } },
      { name: '@deepseek-ai/dsh-agent-loop', config: { agents: [], maxParallelToolCalls: 1 } },
      { name: 'dsh-fishball/testing-provider', config: {} },
      { name: 'dsh-fishball/installed', config },
    ]) { const entryId = await ctx.loader.create(row); await ctx.loader.await(); const entry = ctx.loader.resolve(entryId); await entry.fiber; assert.equal(entry.fiber.state, 2); if (row.name === 'dsh-fishball/installed') installedFiber = entry.fiber; }
    assert.equal(ctx.webServer.server, undefined); // Original open/listen is never called.
    assert.equal(handlers.size, 1); assert.ok(handlers.has('/df-setup'));
    assert.equal(existsSync(directory), false);
    assert.equal(ctx.agents.list().length, 0); assert.equal(ctx.sessions.list().length, 0);
    assert.deepEqual(ctx.tools.schemas(), []);
  } catch (error) {
    HostConnectionService.prototype.register = originalRegister;
    await ctx.fiber.dispose(); rootDisposed = true;
    throw error;
  }
  async function rpc(name, value, controller = new AbortController(), channel = '/df-rpc') {
    assert.ok(rpcCalls.length < 96);
    const handler = handlers.get(channel); assert.equal(typeof handler, 'function');
    rpcCalls.push({ name, channel, input: structuredClone(value) });
    return handler(`v1/${name}`, value, controller.signal, ctx.connection.operator);
  }
  async function ok(name, value, controller, channel) {
    const out = await rpc(name, value, controller, channel);
    assert.equal(out.ok, true, `${id}:${name}:${out.error?.code ?? 'missing success'}`);
    return out.value;
  }
  async function snapshot(taskRef) { return ok('status', { taskRef }); }
  async function cas(taskRef, label) { const snap = await snapshot(taskRef); return { taskRef, commandRef: command(label), expectedTaskVersion: snap.task.version, expectedAuthEpoch: snap.task.authEpoch }; }
  async function initialize() {
    const preview = await ok('prepare', {}, undefined, '/df-setup');
    assert.equal(preview.description.operation, 'create-local-storage');
    assert.equal(preview.description.externalExecution, false);
    const confirmed = await ok('confirm', { previewRef: preview.previewRef, planDigest: preview.planDigest, accept: true }, undefined, '/df-setup');
    assert.equal(confirmed.phase, 'ready');
    assert.equal(handlers.size, 2);
    const catalog = await ok('workerCatalog', {});
    assert.deepEqual(catalog.providers.map(p => p.id), ['df-testing-local']);
    assert.equal(catalog.models.length, 3);
    const policy = await ok('workerPolicyPreview', { expectedPolicyVersion: catalog.status.policyVersion });
    assert.equal(policy.description.limits.maxActive, 1); assert.equal(policy.description.limits.maxAttempts, 1); assert.equal(policy.description.limits.maxTotalAttempts, 4);
    assert.equal(policy.description.pricing, 'source_zero');
    assert.equal(policy.description.persistence.encrypted, false);
    assert.deepEqual(Object.keys(policy.description.auditRoles).sort(), ['repair', 'review']);
    await ok('workerPolicyConfirm', { previewRef: policy.previewRef, planDigest: policy.planDigest, commandRef: command('policy-confirm'), expectedPolicyVersion: policy.expectedPolicyVersion, accept: true });
    assert.equal(existsSync(directory), false);
    const intake = await ok('intake', { taskId: `${id}-synthetic-task`, provider: 'nri-independent', source: 'synthetic-local', eventId: `${id}-event`, commandRef: command('intake'), goal: 'Produce one bounded synthetic local artifact for independent audit.' });
    const context = await ok('prepareContext', { ...await cas(intake.task.taskRef, 'context'), terms: [], now: Date.now() });
    assert.equal(context.verification, 'module_prepared_execution_context_only');
    return { taskRef: intake.task.taskRef, context };
  }
  async function prepareProducer(taskRef, context) {
    const plan = await ok('workerPlan', { ...await cas(taskRef, 'producer-plan'), contextRecordRef: context.recordRef });
    const current = await snapshot(taskRef);
    const preview = await ok('workerPreview', { taskRef, actionRef: plan.actionRef, actionDigest: plan.actionDigest, recordRef: context.recordRef, expectedTaskVersion: current.task.version, expectedAuthEpoch: current.task.authEpoch });
    assert.equal(preview.description.data.digest, context.digest);
    assert.equal(preview.description.role, 'worker'); assert.deepEqual(preview.description.toolNames, []);
    await ok('workerGrant', { ...await cas(taskRef, 'producer-grant'), actionRef: plan.actionRef, actionDigest: plan.actionDigest, previewRef: preview.previewRef, expiresAt: Date.now() + 45000, accept: true });
    return plan;
  }
  async function createProducer(taskRef, plan) {
    const created = await ok('workerCreate', { ...await cas(taskRef, 'producer-create'), actionRef: plan.actionRef, actionDigest: plan.actionDigest });
    const worker = created.worker;
    assertRefs(worker, ['actionRef', 'actionDigest', 'claimRef', 'reservationRef', 'generationRef', 'sessionRef']);
    assert.equal(worker.taskRef, taskRef); assert.equal(worker.actionRef, plan.actionRef); assert.equal(worker.phase, 'ready');
    const nativeId = 'df-' + worker.generationRef; nativeIds.add(nativeId);
    assert.equal(ctx.agents.get(nativeId).session, ctx.sessions.get(nativeId));
    assert.equal(requests.length, 0);
    return worker;
  }
  async function readTranscript(worker) {
    const id = 'df-' + worker.generationRef, backend = ctx.sessionPersistence;
    readerCounts.stat++; const stat = await backend.stat(id);
    assert.ok(stat && stat.sizeBytes <= 1048576);
    readerCounts.openRead++; const reader = await backend.open(id, 'read');
    try { assert.equal(reader.id, id); assert.equal(reader.header.id, id); assert.equal(reader.header.isSeeded, false); assert.equal(reader.inheritedEventCount, 0);
      readerCounts.read++; const log = await reader.read(0, 128);
      assert.ok(log.events.length <= 128); log.events.forEach((event, index) => assert.equal(event.seq, index));
      assert.equal(log.events.filter(event => ['developer/message', 'tool/result', 'assistant/attempt'].includes(event.type)).length, 0);
      return log.events;
    } finally { readerCounts.closeRead++; await reader.close(); }
  }
  async function completeProducer(taskRef, context, plan, worker) {
    const executed = await ok('workerExecute', { ...await cas(taskRef, 'producer-execute'), actionRef: plan.actionRef, actionDigest: plan.actionDigest, claimRef: worker.claimRef, generationRef: worker.generationRef, contextRecordRef: context.recordRef });
    assert.equal(executed.execution.state, 'committed'); assert.equal(executed.execution.usage.state, 'actual'); assert.equal(executed.execution.usage.accounting, 'df-testing-utf8-byte-units/v1');
    const capture = await ok('workerCapture', { ...await cas(taskRef, 'producer-capture'), actionRef: plan.actionRef, claimRef: worker.claimRef, generationRef: worker.generationRef, executionRef: executed.execution.executionRef });
    const current = await snapshot(taskRef);
    const result = await ok('workerResult', { taskRef, artifactRef: capture.artifactRef, version: 1, expectedTaskVersion: current.task.version, expectedAuthEpoch: current.task.authEpoch });
    assert.equal(capture.producerClaimRef, worker.claimRef); assert.equal(capture.generationRef, worker.generationRef); assert.equal(capture.version, 1);
    assert.equal(result.source.executionRef, executed.execution.executionRef); assert.equal(result.source.claimRef, worker.claimRef); assert.equal(result.source.inputDigest, context.digest); assert.equal(sha(result.content), result.source.resultDigest);
    assert.equal(result.verification, 'not-reviewed'); assert.equal(result.delivery, 'not-requested');
    const transcript = await readTranscript(worker);
    const users = transcript.filter(e => e.type === 'user/message'), answers = transcript.filter(e => e.type === 'assistant/message');
    assert.equal(users.length, 1); assert.equal(answers.length, 1); assert.equal(users[0].data.id, executed.execution.executionRef);
    assert.equal(answers[0].seq, executed.execution.cursor); assert.equal(answers[0].data.message.content[0].text, result.content);
    assert.equal(answers[0].data.usage.totalTokens, executed.execution.usage.units);
    const finished = await ok('workerFinish', { ...await cas(taskRef, 'producer-finish'), actionRef: plan.actionRef, claimRef: worker.claimRef, generationRef: worker.generationRef, executionRef: executed.execution.executionRef });
    assert.equal(finished.claimRef, worker.claimRef); assert.equal(finished.outcome, 'completed'); assert.equal(finished.reservationHeld, false); assertRefs(finished, ['terminalEvidenceRef', 'releaseEvidenceRef']);
    assert.equal(ctx.agents.get('df-' + worker.generationRef), undefined); assert.equal(ctx.sessions.get('df-' + worker.generationRef), undefined);
    return { worker, executed, capture, result, finished, transcript };
  }
  async function producer() { const initial = await initialize(); const plan = await prepareProducer(initial.taskRef, initial.context); const worker = await createProducer(initial.taskRef, plan); return { ...initial, plan, ...await completeProducer(initial.taskRef, initial.context, plan, worker) }; }
  async function configure(taskRef, context, capture, existing = null) {
    const requirement = await ok('configureAudit', { ...await cas(taskRef, 'audit-configure'), auditRef: existing?.auditRef ?? command('audit-id'), expectedAuditRevision: existing?.auditRevision ?? 0, artifactRef: capture.artifactRef, artifactVersion: capture.version, digest: capture.digest, contextRecordRef: context.recordRef,
      material: [{ recordRef: context.recordRef, digest: context.digest }, { recordRef: capture.recordRef, digest: capture.digest }].sort((a,b) => a.recordRef.localeCompare(b.recordRef)) });
    return requirement;
  }
  async function prepareRole(taskRef, requirement, purpose) {
    const prepared = await ok('prepareAuditInput', { ...await cas(taskRef, purpose + '-input'), auditRef: requirement.auditRef, expectedAuditRevision: requirement.auditRevision, purpose, round: purpose === 'audit_review' ? requirement.round : requirement.round + 1,
      ...(purpose === 'audit_repair' ? { previousReportRef: requirement.reportRef } : {}) });
    const plan = await ok('planAuditAction', { ...await cas(taskRef, purpose + '-plan'), auditRef: requirement.auditRef, inputRecordRef: prepared.recordRef, purpose });
    const current = await snapshot(taskRef);
    const preview = await ok('auditPreview', { taskRef, actionRef: plan.actionRef, actionDigest: plan.actionDigest, recordRef: prepared.recordRef, expectedTaskVersion: current.task.version, expectedAuthEpoch: current.task.authEpoch });
    const body = JSON.parse(preview.description.data.content);
    assert.equal(sha(preview.description.data.content), prepared.digest); assert.equal(body.purpose, purpose); assert.equal(body.taskRef, taskRef); assert.equal(body.auditRef, requirement.auditRef);
    assert.equal(body.artifact.digest, requirement.digest); assert.deepEqual(preview.description.toolNames, []);
    for (const item of body.material) assert.equal(sha(item.content), item.digest);
    await ok('auditGrant', { ...await cas(taskRef, purpose + '-grant'), actionRef: plan.actionRef, actionDigest: plan.actionDigest, previewRef: preview.previewRef, expiresAt: Date.now() + 45000, accept: true });
    return { prepared, plan, preview, body };
  }
  async function createRole(taskRef, role) {
    const out = await ok('dispatchAudit', { ...await cas(taskRef, role.body.purpose + '-create'), actionRef: role.plan.actionRef, actionDigest: role.plan.actionDigest });
    const worker = out.worker ?? out;
    assertRefs(worker, ['actionRef', 'actionDigest', 'claimRef', 'reservationRef', 'generationRef', 'sessionRef']);
    assert.equal(worker.taskRef, taskRef); assert.equal(worker.actionRef, role.plan.actionRef); assert.equal(worker.actionDigest, role.plan.actionDigest);
    nativeIds.add('df-' + worker.generationRef);
    return worker;
  }
  async function executeRole(taskRef, role, worker, controller) {
    return rpc('executeAudit', { ...await cas(taskRef, role.body.purpose + '-execute'), actionRef: role.plan.actionRef, actionDigest: role.plan.actionDigest, claimRef: worker.claimRef, generationRef: worker.generationRef, inputRecordRef: role.prepared.recordRef }, controller);
  }
  async function completeRole(taskRef, role, worker) {
    const out = await executeRole(taskRef, role, worker); assert.equal(out.ok, true, out.error?.code);
    const execution = out.value.execution ?? out.value; assert.ok(isRef(execution.executionRef));
    const transcript = await readTranscript(worker);
    const users = transcript.filter(e => e.type === 'user/message'), answers = transcript.filter(e => e.type === 'assistant/message');
    assert.equal(users.length, 1); assert.equal(answers.length, 1); assert.equal(users[0].data.id, execution.executionRef);
    assert.equal(users[0].data.content[0].text, role.preview.description.data.content);
    assert.equal(users[0].data.source.kind, 'df-audit-input'); assert.notEqual(answers[0].data.interrupted, true);
    assert.ok(answers[0].data.usage.totalTokens > 0); assert.equal(answers[0].data.usage.totalTokens, answers[0].data.usage.inputTokens + answers[0].data.usage.outputTokens);
    const collection = await ok('collectAuditResult', { ...await cas(taskRef, role.body.purpose + '-collect'), actionRef: role.plan.actionRef, claimRef: worker.claimRef, generationRef: worker.generationRef, executionRef: execution.executionRef });
    const finished = await ok('auditFinish', { ...await cas(taskRef, role.body.purpose + '-finish'), actionRef: role.plan.actionRef, claimRef: worker.claimRef, generationRef: worker.generationRef, executionRef: execution.executionRef });
    assert.equal(finished.claimRef, worker.claimRef); assert.equal(finished.outcome, 'completed'); assert.equal(finished.reservationHeld, false); assertRefs(finished, ['terminalEvidenceRef', 'releaseEvidenceRef']);
    assert.equal(ctx.agents.get('df-' + worker.generationRef), undefined); assert.equal(ctx.sessions.get('df-' + worker.generationRef), undefined);
    return { execution, transcript, collection, finished, text: answers[0].data.message.content[0].text };
  }
  async function disposeChildAndObserve(workers, writerProbe = true) {
    assert.equal(childDisposed, false); childDisposed = true;
    await installedFiber.dispose();
    const observations = [];
    for (const worker of workers) {
      const id = 'df-' + worker.generationRef;
      assert.equal(ctx.agents.get(id), undefined); assert.equal(ctx.sessions.get(id), undefined);
      let writerClosed = null;
      if (writerProbe) { readerCounts.openWrite++; const handle = await ctx.sessionPersistence.open(id, 'write');
        try { assert.equal(handle.id, id); assert.equal(handle.access, 'write'); writerClosed = true; }
        finally { readerCounts.closeWrite++; await handle.close(); } }
      observations.push({ sessionRef: worker.sessionRef, agentAbsent: true, sessionAbsent: true, drainedWriterObserved: writerClosed });
    }
    return observations;
  }
  return Object.freeze({ id, ctx, dir, profile, directory, workerChoice, requests, events, rpcCalls, readerCounts,
    command, rpc, ok, snapshot, cas, initialize, prepareProducer, createProducer, producer, configure, prepareRole, createRole, executeRole, completeRole, readTranscript, disposeChildAndObserve,
    armAbort(worker, controller, position) { assert.equal(abortBarrier, null); assert.ok(['before', 'after'].includes(position)); abortBarrier = { sessionId: 'df-' + worker.generationRef, controller, position, hits: 0 }; return abortBarrier; },
    async foreignTokenFacts() {
      const children = [...ctx.registry.values()].filter(runtime => runtime.name === 'dsh-fishball').flatMap(runtime => [...runtime.fibers]).filter(fiber => fiber.parent.fiber === installedFiber && fiber.state === 2);
      assert.equal(children.length, 1);
      return resolveInstalledWorkerFacts({ ctx: children[0].ctx, choice: workerChoice, profile,
        isAlive: () => children[0].state === 2 && children[0].uid !== null, directoryBinding: Object.freeze({}) });
    },
    replaceOwnedLeaf() { const before = physical(directory); assert.equal(before.directory, true); assert.equal(before.link, false); const retained = directory + '-retained-original'; assert.equal(existsSync(retained), false); renameSync(directory, retained); syntheticDirectory(directory); const after = physical(directory); assert.notEqual(after.ino, before.ino); assert.deepEqual(physical(retained), before); return { before, after, retained }; },
    async close() { if (closed) return; closed = true; try { if (!rootDisposed) { await ctx.fiber.dispose(); rootDisposed = true; } }
      finally { HostConnectionService.prototype.register = originalRegister; } },
  });
}
