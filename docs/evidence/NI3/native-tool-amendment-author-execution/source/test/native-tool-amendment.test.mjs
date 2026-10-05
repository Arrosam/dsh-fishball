import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createInstalledAudit } from '../src/installed-audit.mjs';
import { runInstalledWorkerInvocation } from '../src/installed-invocation.mjs';

// New AUTHOR fixture, independently written from existing installer tests.
// All callbacks, source/claim/grant/input projections and agents are T-level
// doubles. No DB/store/native package/service/session/provider is constructed.
const sha = value => createHash('sha256').update(value).digest('hex');
const encode = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(encode).join(',')}]`
    : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${encode(value[key])}`).join(',')}}`;
const digest = value => sha(encode(value));
const ref = name => sha(`ni3-tool-fixture:${name}`);
const clone = value => JSON.parse(JSON.stringify(value));
const directory = realpathSync(fileURLToPath(new URL('../../../', import.meta.url)));
const roleChoice = () => ({ selection: { provider: 'typed-role-double', model: 'typed-role-double', agentPreset: 'typed-empty-double', reasoningEffort: null, maxOutputTokens: 128 }, charges: { runtimeMs: 100, usageUnits: 20000 } });

function inertApi(counter) {
  const unavailable = () => { counter.effects++; throw Error('Unexpected source effect'); };
  return { ctx: {}, snapshotOwner: unavailable, readOwnerData: unavailable, currentPolicy: unavailable,
    planOwnerAction: unavailable, prepareOwnerPreview: unavailable, grantOwnerPreview: unavailable,
    readProtectedContextFacts: unavailable, readCapturedProducerFacts: unavailable,
    readAuditActionFacts: unavailable, readAuditInput: unavailable, configureOwnerAudit: unavailable,
    prepareOwnerAuditInput: unavailable, assertNativeRequestCurrent: unavailable,
    composeNativeAudit: unavailable, subscribeRuntimeReceipts() { counter.subscriptions++; return () => counter.unsubscriptions++; }, isAlive: () => true };
}

function fixture(t, { omitted = false, purpose = 'audit_review', source = () => true } = {}) {
  const scope = { ownerRef: sha('tool-owner'), workspaceRef: sha('tool-workspace'), taskRef: ref('task') };
  const task = { ...scope, version: 10, authEpoch: 2 };
  const selection = { enabled: true, inputByteLimit: 16384, resultByteLimit: 8192, maxPrivateReviewers: 1, blockingSeverities: ['blocking'], maxRepairRounds: 1, maxTotalAttempts: 4, review: roleChoice(), repair: roleChoice() };
  const workerConfig = { enabled: true, selection: roleChoice().selection, charges: roleChoice().charges,
    environment: { root: directory, cwd: directory }, persistence: { directory: join(directory, 'df-sessions'), compression: 'none', retention: 'owner-managed' },
    bounds: { requestBytes: 16384, resultBytes: 16384 }, policy: { maxRuntimeMs: 1000, maxUsageUnits: 100000, maxCostEstimateMicros: 0 }, previewTtlMs: 60000, grantTtlMs: 60000 };
  const ids = Object.fromEntries(['context','artifact','artifact-data','audit','input','source','namespace','catalog','preset','model','reasoning','configuration','native','environment','binding','tools','permission','cost','policy','producer-claim','producer-gen','producer-session','producer-exec'].map(name => [name, ref(name)]));
  const contextBody = { contractVersion: 'df.execution-context/v1', materialKind: 'execution_context', sourceScope: scope, sourceTaskVersion: 1, sourceAuthEpoch: 0, generatedAt: 1,
    sourceRefs: [ids.source], sourceProvenance: [{ recordRef: ids.source, digest: sha('goal'), taskVersion: 1, authEpoch: 0, createdAt: 1 }], memory: { namespaceRef: ids.namespace, revision: 0, provenance: [] },
    ledgerSnapshotDigest: ref('snapshot'), content: 'goal', inputCounts: { bytes: 4, tokens: 1 }, retainedRefs: [], droppedRefs: [], verification: 'module_prepared_execution_context_only' };
  const contextContent = JSON.stringify(contextBody);
  const context = { recordRef: ids.context, digest: sha(contextContent), kind: 'context', sourceRef: ids.source, sourceTaskVersion: 1, sourceAuthEpoch: 0, semanticRevision: 1, cryptoVersion: 2, content: contextContent };
  const artifact = { artifactRef: ids.artifact, version: 1, recordRef: ids['artifact-data'], digest: sha('artifact'), producerClaimRef: ids['producer-claim'], generationRef: ids['producer-gen'] };
  const artifactData = { recordRef: artifact.recordRef, digest: artifact.digest, kind: 'artifact', content: 'artifact' };
  const material = [context, artifactData].map(({ recordRef, digest }) => ({ recordRef, digest })).sort((a,b) => a.recordRef.localeCompare(b.recordRef));
  const requirement = { ...scope, auditRef: ids.audit, auditRevision: 1, artifactRef: ids.artifact, artifactVersion: 1, digest: artifact.digest, semanticRevision: 1, round: 0, material, materialDigest: digest(material),
    policyRef: ids.policy, blockingSeverities: ['blocking'], maxRepairRounds: 1, contextRecordRef: ids.context, reportRef: purpose === 'audit_repair' ? ref('previous-report') : null };
  const binding = { ...scope, auditRef: ids.audit, auditRevision: 1, artifactRef: ids.artifact, artifactVersion: 1, digest: artifact.digest, material, policyRef: ids.policy, blockingSeverities: ['blocking'], maxRepairRounds: 1, round: 0, semanticRevision: 1 };
  requirement.bindingDigest = digest(binding);
  const body = { contractVersion: 'df.audit-input/v1', purpose, ...scope, auditRef: ids.audit, auditRevision: 1, round: purpose === 'audit_repair' ? 1 : 0, semanticRevision: 1,
    artifact: { artifactRef: ids.artifact, version: 1, recordRef: artifact.recordRef, digest: artifact.digest }, bindingDigest: requirement.bindingDigest, materialDigest: requirement.materialDigest,
    policy: { policyRef: ids.policy, blockingSeverities: ['blocking'], maxRepairRounds: 1 }, material: material.map(meta => ({ ...meta, kind: meta.recordRef === context.recordRef ? 'context' : 'artifact', content: meta.recordRef === context.recordRef ? contextContent : 'artifact' })),
    contextRecordRef: ids.context, contextDigest: context.digest, previousReport: requirement.reportRef ? { reportRef: requirement.reportRef } : null, responseContract: 'df.audit-response/v1' };
  const inputContent = JSON.stringify(body);
  const association = { contractVersion: 'df.audit-input-association/v1', ...scope, taskRef: task.taskRef, auditRef: ids.audit, auditRevision: 1, round: body.round, purpose,
    recordRef: ids.input, digest: sha(inputContent), byteLength: Buffer.byteLength(inputContent), bindingDigest: requirement.bindingDigest, materialDigest: requirement.materialDigest,
    artifactRef: ids.artifact, artifactVersion: 1, artifactDigest: artifact.digest, semanticRevision: 1, sourceTaskVersion: 1, sourceAuthEpoch: 0, contextRecordRef: ids.context, contextDigest: context.digest,
    previousReportRef: requirement.reportRef, material, inputByteLimit: 16384, resultByteLimit: 8192, createdAt: 2 };
  const inputData = { recordRef: ids.input, digest: association.digest, kind: 'context', sourceRef: ids.audit, taskVersion: 1, authEpoch: 0, generationRef: null, createdAt: 2, byteLength: association.byteLength,
    cryptoVersion: 2, sourceTaskVersion: 1, sourceAuthEpoch: 0, semanticRevision: 1, auditInputRef: ids.input, content: inputContent };
  const policy = { version: 2, limits: { maxActive: 1, maxAttempts: 1, maxTotalAttempts: 4, maxRuntimeMs: 1000, maxUsageUnits: 100000 }, modelPolicy: { version: 2, catalogEvidenceRef: ids.catalog, presetRefs: [ids.preset] } };
  const facts = { configurationRef: ids.configuration, nativeSourceRef: ids.native, resourcePolicyVersion: 2, modelPolicyVersion: 2, presetRef: ids.preset, modelRef: ids.model, reasoningRef: ids.reasoning, catalogEvidenceRef: ids.catalog,
    environmentRef: ids.environment, bindingDigest: ids.binding, toolsDigest: ids.tools, permissionPolicyDigest: ids.permission, effectiveReasoningEffort: null, accounting: 'typed-double-only', pricing: 'source_zero', costProvenanceRef: ids.cost };
  const state = { task, semanticRevision: 1, control: 'active', artifacts: [artifact], audits: [requirement], actions: [], data: material, policy };
  const counts = { plan: 0, grant: 0, compose: 0, dispatch: 0, source: 0, opaque: 0 };
  const f = { task, ids, state, facts, policy, counts, alive: true, transport: true, source, installed: null, worker: null, hooks: null, agent: null, initial: null, row: null };
  let listener;
  const api = {
    ctx: {}, isAlive: () => f.alive,
    subscribeRuntimeReceipts(fn) { listener = fn; return () => { listener = null; }; },
    snapshotOwner: () => clone(state), currentPolicy: () => clone(policy), readAuditActionFacts: () => clone(facts),
    readAuditInput: () => clone({ association, data: inputData }),
    readOwnerData: ({ recordRef }) => clone(recordRef === ids.context ? context : artifactData),
    readProtectedContextFacts: () => ({ recordRef: ids.context, digest: context.digest, kind: 'context', byteLength: Buffer.byteLength(contextContent), cryptoVersion: 2,
      originSourceRef: ids.source, sourceTaskVersion: 1, sourceAuthEpoch: 0, memory: { namespaceRef: ids.namespace, revision: 0 }, taskRef: task.taskRef, taskVersion: task.version, authEpoch: task.authEpoch, semanticRevision: 1, configurationRef: ids.configuration, nativeSourceRef: ids.native }),
    readCapturedProducerFacts: () => ({ taskRef: task.taskRef, artifactRef: ids.artifact, artifactVersion: 1, recordRef: artifact.recordRef, digest: artifact.digest, producerClaimRef: artifact.producerClaimRef, generationRef: artifact.generationRef,
      sessionRef: ids['producer-session'], executionRef: ids['producer-exec'], inputDigest: context.digest, cursor: 2, resultDigest: artifact.digest, configurationRef: ids.configuration, nativeSourceRef: ids.native }),
    planOwnerAction(v) { counts.plan++; const receipt = { actionRef: v.spec.actionRef, actionDigest: digest(v.spec), task: clone(task) }; state.actions.push({ ...receipt, spec: clone(v.spec) }); return receipt; },
    prepareOwnerPreview: () => ({ previewRef: ref('preview') }),
    grantOwnerPreview(v) { counts.grant++; const { previewRef, ...input } = v; const receipt = { actionDigest: v.actionDigest, task: clone(task) }; listener({ operation: 'grant', input, receipt }); return receipt; },
    configureOwnerAudit() { throw Error('Unexpected configure'); }, prepareOwnerAuditInput() { throw Error('Unexpected prepare'); }, assertNativeRequestCurrent: () => true,
    composeNativeAudit({ worker, nativeHooks }) {
      counts.compose++; f.worker = worker; f.hooks = nativeHooks;
      const noEffect = () => { throw Error('Unexpected native effect'); };
      return { async dispatch(v) {
        counts.dispatch++; const action = state.actions.find(a => a.actionRef === v.actionRef), spec = action.spec;
        const claimRef = ref('claim');
        f.row = worker.environments.bind(spec, task).row;
        const agent = { id: `df-${spec.executor.generationRef}` };
        Object.defineProperty(agent, 'toJSON', { get() { counts.opaque++; throw Error('Opaque agent inspected'); } });
        Object.defineProperty(agent, 'secret', { get() { counts.opaque++; throw Error('Opaque agent inspected'); } });
        f.agent = agent;
        nativeHooks.setupAgent({}, agent, { taskRef: task.taskRef, actionRef: spec.actionRef, actionDigest: action.actionDigest, claimRef, generationRef: spec.executor.generationRef, sessionRef: spec.executor.sessionRef, options: {}, spec });
        f.record = Object.freeze({ agent, taskRef: task.taskRef, generationRef: spec.executor.generationRef, claimRef, toolsDigest: spec.executor.toolsDigest, permissionPolicyDigest: spec.executor.permissionPolicyDigest, schemas: Object.freeze([]) });
        f.initial = worker.toolGuard(f.record);
        return { worker: { taskRef: task.taskRef, actionRef: spec.actionRef, actionDigest: action.actionDigest, claimRef, generationRef: spec.executor.generationRef, sessionRef: spec.executor.sessionRef } };
      }, executeApprovedInput: noEffect, query: noEffect, sessionLink: noEffect, collectAuditResult: noEffect, finishExecution: noEffect, dispose() {} };
    },
  };
  if (!omitted) api.nativeToolGuard = record => { counts.source++; f.seen = record; return f.source(record); };
  f.installed = createInstalledAudit({ selection, identity: { ownerId: 'tool-owner', workspaceId: 'tool-workspace' }, profile: { dir: directory, name: 'typed-double' }, worker: workerConfig }).installedAuditInstaller(api);
  t.after(() => f.installed.dispose());
  const guard = { assertCurrent: () => f.transport };
  const cas = () => ({ taskRef: task.taskRef, expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch });
  f.enter = fn => runInstalledWorkerInvocation(api.ctx, guard.assertCurrent, fn);
  f.check = (record = f.record) => f.enter(() => f.worker.toolGuard(record));
  f.revoke = () => listener({ operation: 'revoke', input: { taskRef: task.taskRef }, receipt: {} });
  f.start = async () => {
    f.plan = await f.installed.operations.planAuditAction({ ...cas(), commandRef: ref('plan'), auditRef: ids.audit, inputRecordRef: ids.input, purpose }, guard);
    const action = { ...cas(), actionRef: f.plan.actionRef, actionDigest: f.plan.actionDigest };
    await f.installed.operations.auditPreview({ ...action, recordRef: ids.input }, guard);
    await f.installed.operations.auditGrant({ ...action, commandRef: ref('grant'), previewRef: ref('preview'), accept: true, expiresAt: Date.now() + 50000 }, guard);
    await f.installed.operations.dispatchAudit({ ...action, commandRef: ref('dispatch') }, guard);
    return f;
  };
  return f;
}

test('NT01 old17 disabled and omitted callback remain valid; supplied false remains denial', async t => {
  const counter = { effects: 0, subscriptions: 0, unsubscriptions: 0 };
  const installer = createInstalledAudit({ selection: undefined, identity: { ownerId: 'tool-owner', workspaceId: 'tool-workspace' }, profile: { dir: directory, name: 'typed-double' }, worker: undefined });
  const disabled = installer.installedAuditInstaller(inertApi(counter));
  assert.deepEqual(Object.keys(disabled).sort(), ['hostPermission','previewResolver','previewTtlMs','operations','status','dispose'].sort());
  assert.equal(disabled.hostPermission({}), false); disabled.dispose(); disabled.dispose();
  assert.deepEqual(counter, { effects: 0, subscriptions: 1, unsubscriptions: 1 });
  for (const options of [{ omitted: true }, { source: () => false }]) {
    const f = await fixture(t, options).start();
    assert.equal(f.initial, false); assert.equal(await f.check(), false);
    assert.equal(f.counts.source, options.omitted ? 0 : 2);
    assert.deepEqual([f.counts.plan,f.counts.grant,f.counts.compose,f.counts.dispatch], [1,1,1,1]);
  }
});

test('NT02 unsafe eighteenth descriptors/functions reject before subscriptions or traps', () => {
  const counter = { effects: 0, subscriptions: 0, unsubscriptions: 0, traps: 0 };
  const installer = createInstalledAudit({ selection: undefined, identity: { ownerId: 'tool-owner', workspaceId: 'tool-workspace' }, profile: { dir: directory, name: 'typed-double' }, worker: undefined });
  const proxy = new Proxy(() => true, { get() { counter.traps++; throw Error('Trap'); }, apply() { counter.traps++; throw Error('Trap'); } });
  for (const value of [undefined, null, true, proxy, async () => true, function* () { yield true; }, async function* () { yield true; }]) {
    assert.throws(() => installer.installedAuditInstaller({ ...inertApi(counter), nativeToolGuard: value }));
  }
  const getter = inertApi(counter);
  Object.defineProperty(getter, 'nativeToolGuard', { enumerable: true, get() { counter.traps++; return () => true; } });
  assert.throws(() => installer.installedAuditInstaller(getter));
  const wrapped = new Proxy(inertApi(counter), { ownKeys() { counter.traps++; throw Error('Trap'); } });
  assert.throws(() => installer.installedAuditInstaller(wrapped));
  assert.deepEqual(counter, { effects: 0, subscriptions: 0, unsubscriptions: 0, traps: 0 });
});

test('NT03 exact opaque input survives initial setup and recorded claim in both roles', async t => {
  for (const purpose of ['audit_review','audit_repair']) {
    const f = fixture(t, { purpose }); let pending = false;
    f.source = record => { pending ||= f.row.slot.claimRef === null; assert.strictEqual(record, f.record); assert.strictEqual(record.agent, f.agent); return true; };
    await f.start(); assert.equal(f.initial, true); assert.equal(pending, true);
    assert.equal(f.row.slot.claimRef, f.record.claimRef); assert.equal(await f.check(), true);
    assert.strictEqual(f.seen, f.record); assert.equal(f.counts.opaque, 0);
    assert.equal(Object.isFrozen(f.agent), false);
    const before = f.counts.source;
    for (const record of [Object.freeze({ ...f.record, claimRef: undefined }), Object.freeze(Object.fromEntries(Object.entries(f.record).filter(([key]) => key !== 'claimRef'))), Object.freeze({ ...f.record, claimRef: ref('foreign') })]) assert.equal(await f.check(record), false);
    assert.equal(f.counts.source, before);
  }
});

test('NT04 literal synchronous boolean only, without Promise/Proxy/thenable inspection', async t => {
  const f = await fixture(t).start(); let traps = 0;
  const proxy = new Proxy({}, { get() { traps++; throw Error('Trap'); }, getPrototypeOf() { traps++; throw Error('Trap'); } });
  const thenable = Object.defineProperty({}, 'then', { get() { traps++; throw Error('Trap'); } });
  for (const value of [false, 1, 'true', {}, new Boolean(true), undefined, null, Promise.resolve(true), proxy, thenable]) { f.source = () => value; assert.equal(await f.check(), false); }
  f.source = () => { throw Error('Source refuses'); }; assert.equal(await f.check(), false);
  f.source = () => true; assert.equal(await f.check(), true); assert.equal(traps, 0);
});

test('NT05 hostile input and old/foreign generation deny before callback without traps', async t => {
  const f = await fixture(t).start(); let traps = 0; const before = f.counts.source;
  const proxy = new Proxy({}, { ownKeys() { traps++; throw Error('Trap'); }, get() { traps++; throw Error('Trap'); } });
  const getter = { ...f.record }; Object.defineProperty(getter, 'agent', { enumerable: true, get() { traps++; throw Error('Trap'); } });
  const schemas = []; Object.defineProperty(schemas, 'extra', { enumerable: true, get() { traps++; throw Error('Trap'); } }); Object.freeze(schemas);
  const cases = [proxy, Object.freeze(getter), Object.freeze({ ...f.record, agent: proxy }), Object.freeze({ ...f.record, agent: { id: f.agent.id } }),
    Object.freeze({ ...f.record, schemas: Object.freeze(['tool']) }), Object.freeze({ ...f.record, schemas: [] }), Object.freeze({ ...f.record, schemas }), { ...f.record }, Object.freeze({ ...f.record, extra: true })];
  for (const key of ['taskRef','generationRef','claimRef','toolsDigest','permissionPolicyDigest']) cases.push(Object.freeze({ ...f.record, [key]: ref(`foreign-${key}`) }));
  for (const record of cases) assert.equal(await f.check(record), false);
  assert.equal(f.counts.source, before); assert.equal(traps, 0); assert.equal(f.counts.opaque, 0);
  const claim = f.row.slot.claimRef; f.row.slot.claimRef = ref('old-claim'); assert.equal(await f.check(), false); f.row.slot.claimRef = claim;
  f.state.actions[0].spec.role = 'worker'; assert.equal(await f.check(), false); assert.equal(f.counts.source, before);
});

test('NT06 lifetime/currentness withdrawal during callback and reentry deny outer call', async t => {
  const mutations = [f => { f.alive = false; }, f => f.installed.dispose(), f => f.revoke(), f => { f.state.control = 'cancelled'; },
    f => { f.policy.version++; }, f => { f.facts.nativeSourceRef = ref('replacement-source'); }, f => { f.task.authEpoch++; },
    f => { f.row.grant = { ...f.row.grant, expiresAt: 0 }; }, f => { f.row.slot.ended = true; }, f => { f.row.slot.finishInput = {}; }];
  for (const mutate of mutations) {
    const f = await fixture(t).start(); const before = [f.counts.plan,f.counts.grant,f.counts.compose,f.counts.dispatch];
    f.source = () => { mutate(f); return true; }; assert.equal(await f.check(), false);
    assert.deepEqual([f.counts.plan,f.counts.grant,f.counts.compose,f.counts.dispatch], before);
  }
  const reentrant = await fixture(t).start();
  reentrant.source = record => { assert.equal(reentrant.worker.toolGuard(record), false); return true; };
  assert.equal(await reentrant.check(), false);
  reentrant.source = () => true; assert.equal(await reentrant.check(), true);
  const transport = await fixture(t).start();
  transport.source = () => { transport.transport = false; return true; };
  await assert.rejects(transport.check(), error => error.code === 'SERVICE_DISPOSED');
  assert.equal(transport.worker.toolGuard(transport.record), false);
  assert.deepEqual([transport.counts.plan,transport.counts.grant,transport.counts.compose,transport.counts.dispatch], [1,1,1,1]);
});
