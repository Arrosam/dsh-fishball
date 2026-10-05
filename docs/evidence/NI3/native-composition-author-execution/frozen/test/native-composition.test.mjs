import test from 'node:test';
import assert from 'node:assert/strict';
import { ApprovalPreview } from '../src/approval-preview.mjs';
import { WorkerManager } from '../src/worker.mjs';
import { NativeContributions } from '../src/native-contributions.mjs';
import { canonical, canonicalDigest, hash } from '../src/runtime-security.mjs';
import { validateAuditInputPair, approvedInputSource } from '../src/audit-input-pair.mjs';

// T-level discriminators only: these typed stores/adapters are not native,
// original encrypted data, authentic collector, model-quality or installation
// evidence. The held original D/N/P and full NI3 families remain unexecuted.
function auditFixture({ padding = 0, paddingUnit = 'x', purpose = 'audit_review', readPair, resolve } = {}) {
  const owner = {}, host = {}, taskRef = hash('task'), artifactRef = hash('artifact'), contextRecordRef = hash('context'), artifactRecordRef = hash('artifact-record'), auditRef = hash('audit'), recordRef = hash('input');
  const context = 'C' + paddingUnit.repeat(padding), artifactContent = 'Original synthetic artifact.';
  const material = [{ recordRef: contextRecordRef, digest: hash(context) }, { recordRef: artifactRecordRef, digest: hash(artifactContent) }].sort((a, b) => a.recordRef.localeCompare(b.recordRef));
  const materialDigest = canonicalDigest(material), artifactDigest = hash(artifactContent), policyRef = hash('audit-policy');
  const binding = { ownerRef: hash('owner'), workspaceRef: hash('workspace'), taskRef, auditRef, auditRevision: 1, artifactRef, artifactVersion: 1, digest: artifactDigest, material, policyRef, blockingSeverities: ['blocking'], maxRepairRounds: 1, round: 0, semanticRevision: 1 };
  const bindingDigest = canonicalDigest(binding), previousReportRef = purpose === 'audit_repair' ? hash('unknown-report') : null;
  const body = { contractVersion: 'df.audit-input/v1', purpose, ownerRef: binding.ownerRef, workspaceRef: binding.workspaceRef, taskRef, auditRef, auditRevision: 1, round: purpose === 'audit_repair' ? 1 : 0, semanticRevision: 1, artifact: { artifactRef, version: 1, recordRef: artifactRecordRef, digest: artifactDigest }, bindingDigest, materialDigest, policy: { policyRef, blockingSeverities: ['blocking'], maxRepairRounds: 1 }, material: material.map(m => ({ ...m, kind: m.recordRef === contextRecordRef ? 'context' : 'artifact', content: m.recordRef === contextRecordRef ? context : artifactContent })), contextRecordRef, contextDigest: hash(context), previousReport: previousReportRef ? { reportRef: previousReportRef, state: 'unknown' } : null, responseContract: 'df.audit-response/v1' };
  const content = canonical(body), digest = hash(content), kind = purpose === 'audit_review' ? 'review' : 'repair';
  const spec = { actionRef: hash('action'), kind, role: kind, targetDigest: bindingDigest, dataDigest: artifactDigest, units: 1, charges: { runtimeMs: 1000, usageUnits: 100000, costState: 'estimated', costEstimateMicros: 0, costProvenanceRef: hash('source') }, attemptGroupRef: hash('group'), attemptIndex: 1, resourcePolicyVersion: 2, modelPolicyVersion: 1, model: { presetRef: hash('preset'), modelRef: hash('model'), reasoningRef: hash('reasoning'), catalogEvidenceRef: hash('catalog') }, executor: { mode: 'create', generationRef: hash('generation'), sessionRef: hash('df-' + hash('generation')), environmentRef: hash('environment'), bindingDigest: hash('environment-binding'), toolsDigest: hash('tools'), permissionPolicyDigest: hash('permission') }, executionInput: { recordRef, digest, purpose, auditRef, bindingDigest, materialDigest, ...(previousReportRef ? { previousReportRef } : {}) } };
  const task = { ownerRef: binding.ownerRef, workspaceRef: binding.workspaceRef, taskRef, version: 3, authEpoch: 1, status: 'active' };
  const association = { contractVersion: 'df.audit-input-association/v1', ownerRef: task.ownerRef, workspaceRef: task.workspaceRef, taskRef, auditRef, auditRevision: 1, round: body.round, purpose, recordRef, digest, byteLength: Buffer.byteLength(content), bindingDigest, materialDigest, artifactRef, artifactVersion: 1, artifactDigest, semanticRevision: 1, sourceTaskVersion: 2, sourceAuthEpoch: 0, contextRecordRef, contextDigest: hash(context), previousReportRef, material, inputByteLimit: 65536, resultByteLimit: 4096, createdAt: 500 };
  const data = { recordRef, digest, kind: 'context', sourceRef: auditRef, taskVersion: 2, authEpoch: 0, generationRef: null, createdAt: 500, byteLength: association.byteLength, cryptoVersion: 2, sourceTaskVersion: 2, sourceAuthEpoch: 0, semanticRevision: 1, auditInputRef: recordRef, content };
  const pair = { association, data }, actionDigest = canonicalDigest({ ownerRef: task.ownerRef, workspaceRef: task.workspaceRef, taskRef, taskVersion: 2, authEpoch: 0, spec });
  const snapshot = { task, control: 'active', semanticRevision: 1, policy: { version: 2, modelPolicy: { version: 1, catalogEvidenceRef: spec.model.catalogEvidenceRef, presetRefs: [spec.model.presetRef] } }, actions: [{ actionRef: spec.actionRef, actionDigest, state: 'requested', spec }], audits: [{ ...binding, bindingDigest, materialDigest, contextRecordRef, contextDigest: hash(context), reportRef: previousReportRef }], artifacts: [{ artifactRef, version: 1, recordRef: artifactRecordRef, digest: artifactDigest }], data: material };
  const labels = { targetDigest: spec.targetDigest, ...spec.model, ...Object.fromEntries(['environmentRef', 'bindingDigest', 'toolsDigest', 'permissionPolicyDigest'].map(k => [k, spec.executor[k]])), evidenceRef: hash('evidence'), targetLabel: 'Explicit synthetic audit', providerLabel: 'Local', modelLabel: 'Deterministic unknown', reasoningLabel: 'deterministic', presetLabel: 'Empty', environmentLabel: 'Owned', cwd: '/tmp/synthetic', toolNames: [] };
  let grants = 0, pairReads = 0;
  const store = { snapshot: () => structuredClone(snapshot), readData: () => structuredClone(data), grantAction: (_, input) => { grants++; return { actionRef: input.actionRef, actionDigest: input.actionDigest, task: structuredClone(task) }; } };
  const boundary = new ApprovalPreview({ store, ownerHandle: owner, ttlMs: 5000, clock: () => 1000, resolve: resolve ?? (() => structuredClone(labels)), readAuditInput: readPair ?? (() => { pairReads++; return structuredClone(pair); }) });
  const input = { taskRef, actionRef: spec.actionRef, actionDigest, recordRef, expectedTaskVersion: 3, expectedAuthEpoch: 1 };
  const grant = preview => ({ ...input, commandRef: hash('grant'), expiresAt: 4000, previewRef: preview.previewRef });
  const grantInput = preview => { const { recordRef: ignored, ...out } = grant(preview); return out; };
  return { owner, host, task, spec, pair, snapshot, store, labels, boundary, input, grant: grantInput, grants: () => grants, pairReads: () => pairReads };
}

function routerFixture(f, { denyFull = false, overlap = false } = {}) {
  const events = [], fullRecords = []; let current = true, claimed = false, boundDigest;
  const router = new NativeContributions({ readCurrentTask: () => { events.push('read-current-task'); return f.task; }, assertOwnerCurrent: () => current, verifyClaimBinding: binding => { events.push('verify-original-claim'); return claimed && binding.claimRef === hash('claim') && binding.reservationRef === hash('reservation'); } });
  const contribution = () => ({ matchesSpec: (spec, taskRef) => taskRef === f.task.taskRef && canonical(spec) === canonical(f.spec), matchesFull: record => { fullRecords.push(structuredClone(record)); return !denyFull && record.actionDigest === f.input.actionDigest; }, environments: { bind: (spec, task, originalDigest) => { events.push('source-bind'); boundDigest = originalDigest; return {}; }, inspect: (_, callback) => callback({ provider: 'source-owned', model: 'fixture' }), assertCurrent: () => hash('current-source') }, toolGuard: () => false, nativeHooks: { setupAgent: () => {}, commitAgent: () => true, bindExecution: () => true, validateResult: () => true } });
  router.register(contribution()); if (overlap) router.register(contribution());
  const minimal = { taskRef: f.task.taskRef, ...Object.fromEntries(['generationRef', 'environmentRef', 'bindingDigest', 'toolsDigest', 'permissionPolicyDigest'].map(k => [k, f.spec.executor[k]])) };
  const claim = { taskRef: f.task.taskRef, actionRef: f.spec.actionRef, actionDigest: f.input.actionDigest, claimRef: hash('claim'), reservationRef: hash('reservation'), generationRef: f.spec.executor.generationRef, sessionRef: f.spec.executor.sessionRef, spec: f.spec };
  return { router, minimal, claim, events, fullRecords, boundDigest: () => boundDigest, setClaimed: () => { claimed = true; }, lose: () => { current = false; } };
}

test('NC1: pre-prepare mapping, exact full8, authentic postclaim order and unchanged false veto', () => {
  const f = auditFixture(), r = routerFixture(f);
  assert.equal(r.router.worker.permission(r.minimal), false);
  const token = r.router.worker.environments.bind(f.spec, f.task, f.input.actionDigest);
  assert.equal(r.boundDigest(), f.input.actionDigest);
  assert.equal(r.router.worker.permission(r.minimal), true);
  assert.equal(r.events[0], 'source-bind');
  assert.deepEqual(Object.keys(r.fullRecords[0]).sort(), ['ownerRef', 'workspaceRef', 'taskRef', 'actionRef', 'actionDigest', 'taskVersion', 'authEpoch', 'spec'].sort());
  assert.equal(r.fullRecords[0].taskVersion, 3);
  assert.equal(r.router.worker.permission({ ...r.minimal, claimRef: hash('claim'), actionDigest: f.input.actionDigest }), false);
  assert.throws(() => r.router.claimBinding(r.claim), { code: 'HOST_PERMISSION_DENIED' });
  r.setClaimed(); assert.equal(r.router.claimBinding(r.claim), true);
  assert.equal(r.router.worker.permission(r.minimal), false);
  assert.equal(r.router.worker.permission({ ...r.minimal, claimRef: hash('claim'), actionDigest: f.input.actionDigest }), true);
  assert.equal(r.router.worker.permission({ ...r.minimal, claimRef: hash('other'), actionDigest: f.input.actionDigest }), false);
  assert.equal(r.router.worker.toolGuard({ agent: {}, ...r.minimal, claimRef: hash('claim'), schemas: [] }), false);
  r.lose(); assert.throws(() => r.router.worker.environments.assertCurrent(token));
  const denied = routerFixture(f, { denyFull: true }); denied.router.worker.environments.bind(f.spec, f.task, f.input.actionDigest);
  assert.equal(denied.router.worker.permission(denied.minimal), false);
  assert.throws(() => routerFixture(f, { overlap: true }).router.worker.environments.bind(f.spec, f.task, f.input.actionDigest));
});

test('NC1-D01: retain original scoped planned digest, never spec-only/current-CAS recomputation; wrong or absent refs deny', () => {
  const f = auditFixture();
  assert.equal(f.input.actionDigest, canonicalDigest({ ownerRef: f.task.ownerRef, workspaceRef: f.task.workspaceRef, taskRef: f.task.taskRef, taskVersion: 2, authEpoch: 0, spec: f.spec }));
  assert.notEqual(f.input.actionDigest, canonicalDigest(f.spec));
  assert.notEqual(f.input.actionDigest, canonicalDigest({ ownerRef: f.task.ownerRef, workspaceRef: f.task.workspaceRef, taskRef: f.task.taskRef, taskVersion: 3, authEpoch: 1, spec: f.spec }));
  for (const value of [undefined, null, 'not-a-ref']) {
    const bad = routerFixture(f);
    assert.throws(() => bad.router.worker.environments.bind(f.spec, f.task, value));
    assert.deepEqual(bad.events, []); assert.deepEqual(bad.fullRecords, []);
    assert.equal(bad.router.worker.permission(bad.minimal), false);
  }
  const wrong = routerFixture(f), wrongDigest = canonicalDigest({ ownerRef: f.task.ownerRef, workspaceRef: f.task.workspaceRef, taskRef: hash('other-task'), taskVersion: 2, authEpoch: 0, spec: f.spec });
  wrong.router.worker.environments.bind(f.spec, f.task, wrongDigest);
  assert.equal(wrong.boundDigest(), wrongDigest);
  assert.equal(wrong.router.worker.permission(wrong.minimal), false); // original full matcher veto
  assert.equal(wrong.fullRecords[0].actionDigest, wrongDigest);
  assert.equal(wrong.router.hostPermission({ ownerRef: f.task.ownerRef, workspaceRef: f.task.workspaceRef, taskRef: f.task.taskRef, actionRef: f.spec.actionRef, actionDigest: f.input.actionDigest, taskVersion: 3, authEpoch: 1, spec: f.spec }), false);
  assert.equal(wrong.events.includes('verify-original-claim'), false);
});

test('NC1-L01: locked full uses the source-private token witness, never transactionful environment currentness', () => {
  // The lock marker is an interface discriminator, not an actual encrypted
  // ledger/public-host oracle. Root must hold the real transaction-free source
  // closures independently; the original audit assertion remains transactionful.
  for (const mode of ['valid', 'missing', 'mismatched', 'withdrawn', 'full-false', 'full-throw', 'full-nontrue', 'full-reentry']) {
    const f = auditFixture(), sourceRef = hash('locked-original-source'), originalToken = Object.freeze({}), witnesses = new WeakMap();
    const calls = { environment: 0, transactionAttempts: 0, readTask: 0, claim: 0, hooks: 0, full: 0 };
    let locked = false, sourceAvailable = true;
    const full = Object.freeze({ ownerRef: f.task.ownerRef, workspaceRef: f.task.workspaceRef, taskRef: f.task.taskRef, actionRef: f.spec.actionRef, actionDigest: f.input.actionDigest, taskVersion: 3, authEpoch: 1, spec: f.spec });
    const router = new NativeContributions({
      assertOwnerCurrent: () => true,
      readCurrentTask: () => { calls.readTask++; if (locked) throw Error('public-task-read-under-lock'); return f.task; },
      verifyClaimBinding: () => { calls.claim++; if (locked) throw Error('claim-read-under-lock'); return true; },
    });
    router.register({
      matchesSpec: (spec, taskRef) => sourceAvailable && taskRef === f.task.taskRef && canonical(spec) === canonical(f.spec),
      matchesFull: (actual, witness) => {
        calls.full++; assert.deepEqual(actual, full);
        if (!witness || !Object.isFrozen(witness) || Object.keys(witness).sort().join(',') !== 'environment,sourceRef' || witness.environment !== originalToken || witnesses.get(witness.environment) !== witness.sourceRef) return false;
        if (mode === 'full-false') return false;
        if (mode === 'full-throw') throw Error('real-full-denial');
        if (mode === 'full-nontrue') return 1;
        if (mode === 'full-reentry') { assert.equal(router.hostPermission(actual), false); return true; }
        return true;
      },
      environments: {
        bind: () => { witnesses.set(originalToken, sourceRef); return originalToken; },
        inspect: (_, callback) => callback({}),
        assertCurrent: token => { calls.environment++; assert.equal(token, originalToken); if (locked) { calls.transactionAttempts++; throw Error('ordinary-audit-snapshot-under-lock'); } return sourceRef; },
      },
      toolGuard: () => false,
      nativeHooks: { setupAgent: () => { calls.hooks++; }, commitAgent: () => { calls.hooks++; return true; }, bindExecution: () => { calls.hooks++; return true; }, validateResult: () => { calls.hooks++; return true; } },
    });
    const token = router.worker.environments.bind(f.spec, f.task, f.input.actionDigest);
    assert.equal(calls.environment, 1);
    if (mode === 'missing') witnesses.delete(originalToken);
    if (mode === 'mismatched') witnesses.set(originalToken, hash('different-source'));
    if (mode === 'withdrawn') sourceAvailable = false;
    locked = true;
    assert.equal(router.hostPermission(full), mode === 'valid');
    assert.equal(calls.environment, 1); assert.equal(calls.transactionAttempts, 0); assert.equal(calls.readTask, 0); assert.equal(calls.claim, 0); assert.equal(calls.hooks, 0);
    // The ordinary source/environment path still performs its original check.
    if (mode === 'valid') { assert.throws(() => router.worker.environments.assertCurrent(token), /ordinary-audit-snapshot-under-lock/); assert.equal(calls.transactionAttempts, 1); }
    const { taskVersion: ignored, ...withoutVersion } = full;
    assert.equal(router.hostPermission(withoutVersion), false);
  }
});

test('NC3: distinct artifact/input digests; whole pair drift at prepare and grant; unsafe callback pairs', async () => {
  const f = auditFixture(), preview = await f.boundary.prepare(f.input);
  assert.notEqual(f.spec.dataDigest, f.pair.data.digest);
  assert.equal(preview.description.data.digest, f.pair.data.digest);
  assert.equal(preview.description.data.content, f.pair.data.content);
  await f.boundary.grant(f.grant(preview)); assert.equal(f.grants(), 1);
  for (const stage of ['prepare', 'grant']) {
    let release, calls = 0;
    const d = auditFixture({ resolve: async () => { if (++calls === (stage === 'prepare' ? 1 : 2)) await new Promise(r => { release = r; }); return structuredClone(d.labels); } });
    let pending;
    if (stage === 'prepare') pending = d.boundary.prepare(d.input);
    else { const p = await d.boundary.prepare(d.input); pending = d.boundary.grant(d.grant(p)); }
    d.pair.association.resultByteLimit--; // same content digest; legal metadata drift
    release(); await assert.rejects(pending); assert.equal(d.grants(), 0);
  }
  let traps = 0;
  const getterPair = {}; Object.defineProperty(getterPair, 'association', { enumerable: true, get() { traps++; throw Error('getter'); } });
  const proxyPair = new Proxy({}, { getPrototypeOf() { traps++; throw Error('proxy'); } });
  for (const pair of [getterPair, proxyPair, Promise.resolve({}), { association: {}, data: {}, then() { traps++; } }]) {
    const u = auditFixture({ readPair: () => pair }); await assert.rejects(u.boundary.prepare(u.input)); assert.equal(u.grants(), 0);
  }
  assert.equal(traps, 0);
  const missing = auditFixture();
  const absent = new ApprovalPreview({ store: missing.store, ownerHandle: missing.owner, ttlMs: 5000, clock: () => 1000, resolve: () => missing.labels });
  await assert.rejects(absent.prepare(missing.input), { code: 'PREVIEW_UNAVAILABLE' });
  const ordinary = auditFixture();
  delete ordinary.spec.executionInput; ordinary.spec.kind = 'write'; ordinary.spec.role = 'worker'; ordinary.spec.dataDigest = ordinary.pair.data.digest;
  ordinary.snapshot.actions[0].actionDigest = canonicalDigest({ ownerRef: ordinary.task.ownerRef, workspaceRef: ordinary.task.workspaceRef, taskRef: ordinary.task.taskRef, taskVersion: 2, authEpoch: 0, spec: ordinary.spec }); ordinary.input.actionDigest = ordinary.snapshot.actions[0].actionDigest;
  let ordinaryPairReads = 0;
  const ordinaryPreview = new ApprovalPreview({ store: ordinary.store, ownerHandle: ordinary.owner, ttlMs: 5000, clock: () => 1000, resolve: () => ordinary.labels, readAuditInput: () => { ordinaryPairReads++; throw Error('ordinary-must-ignore'); } });
  await ordinaryPreview.prepare(ordinary.input); assert.equal(ordinaryPairReads, 0);
  assert.deepEqual(approvedInputSource({ executionRef: hash('ordinary-execution'), taskRef: ordinary.task.taskRef, claimRef: hash('ordinary-claim'), generationRef: ordinary.spec.executor.generationRef, contextRecordRef: ordinary.pair.data.recordRef, actionDigest: ordinary.input.actionDigest, dataDigest: ordinary.pair.data.digest }), { kind: 'df-context', form: 'local' });
});

test('NC3: complete consent wire65535/65536 fits;65537 has no usable token and releases pending capacity', async () => {
  const base = auditFixture({ padding: 5000, paddingUnit: '雪"\\' });
  const measured = await base.boundary.prepare(base.input), bytes = Buffer.byteLength(JSON.stringify({ ok: true, value: measured }));
  const needed = 65536 - bytes;
  assert.ok(needed > 0 && needed < 28000);
  function padLabels(f, extra) {
    // Distribute across legal labels without exceeding any4096-byte bound.
    for (const k of ['targetLabel', 'providerLabel', 'modelLabel', 'reasoningLabel', 'presetLabel', 'environmentLabel', 'cwd']) {
      const n = Math.min(extra, 4096 - Buffer.byteLength(f.labels[k])); f.labels[k] += 'z'.repeat(n); extra -= n;
    }
    assert.equal(extra, 0);
  }
  for (const delta of [-1, 0, 1]) {
    const f = auditFixture({ padding: 5000, paddingUnit: '雪"\\' }); padLabels(f, needed + delta);
    if (delta <= 0) {
      const p = await f.boundary.prepare(f.input); assert.equal(Buffer.byteLength(JSON.stringify({ ok: true, value: p })), 65536 + delta);
      await f.boundary.grant(f.grant(p)); assert.equal(f.grants(), 1);
    } else {
      for (let i = 0; i < 65; i++) await assert.rejects(f.boundary.prepare(f.input), { code: 'PREVIEW_UNAVAILABLE' });
      assert.equal(f.grants(), 0);
      await assert.rejects(f.boundary.grant({ ...f.grant(measured), previewRef: hash('overflow-token') }), { code: 'PREVIEW_STALE' });
    }
  }
});

function managerFixture({ booleanFacts = false, denyClaim = false, captureAckLost = false, denySettlement = false, purpose = 'audit_review' } = {}) {
  const f = auditFixture({ purpose }), observations = [], effects = [], ticket = {}, state = { phase: 'prepared', execution: null, result: null, facts: null, capture: null, captureInput: null }, counts = { creates: 0, sends: 0, collections: 0, captureCalls: 0, settles: 0 };
  const action = f.snapshot.actions[0], claimRef = hash('claim'), reservationRef = hash('reservation');
  const worker = () => ({ taskRef: f.task.taskRef, actionRef: f.spec.actionRef, actionDigest: f.input.actionDigest, claimRef, reservationRef, generationRef: f.spec.executor.generationRef, sessionRef: f.spec.executor.sessionRef, phase: state.phase === 'stopped' ? 'stopped' : 'ready', cursor: 0, evidenceRef: hash('native-receipt') });
  const store = { ...f.store,
    claimAction: (_, input) => { effects.push('claim'); if (purpose === 'audit_repair') assert.deepEqual(input.auditRepair, { auditRef: f.spec.executionInput.auditRef, previousReportRef: f.spec.executionInput.previousReportRef, round: 1, evidenceRef: hash('repair-lineage') }); action.claimRef = claimRef; return { ...worker(), task: f.task }; },
    workerObservation: (_, input) => { observations.push(input); effects.push('observation'); return input; },
    assertClaimCurrent: () => true, control: () => {},
    readAuditInput: () => structuredClone(f.pair),
    beginAuditExecution: (_, input) => { effects.push('begin'); const a = f.pair.association; const execution = { executionRef: hash('execution'), taskRef: input.taskRef, actionRef: input.actionRef, actionDigest: input.actionDigest, claimRef, generationRef: input.generationRef, sessionRef: f.spec.executor.sessionRef, inputRecordRef: input.inputRecordRef, inputDigest: a.digest, dataDigest: f.spec.dataDigest, auditRef: a.auditRef, bindingDigest: a.bindingDigest, materialDigest: a.materialDigest, purpose: a.purpose, semanticRevision: a.semanticRevision, state: 'intent_committed', deduplicated: false }; if (state.execution) return { ...state.execution, state: 'dispatch_intent', deduplicated: true }; state.execution = execution; return execution; },
    assertExecutionCurrent: () => { effects.push('consume'); return { ...state.execution, state: 'dispatch_intent', admitted: true }; },
    captureAuditResult: (_, input) => {
      counts.captureCalls++; effects.push('capture');
      if (state.captureInput) assert.deepEqual(input, state.captureInput);
      else { state.captureInput = structuredClone(input); const a = f.pair.association; state.capture = { contractVersion: 'df.audit-result-association/v1', ownerRef: f.task.ownerRef, workspaceRef: f.task.workspaceRef, taskRef: f.task.taskRef, resultRef: input.executionRef, recordRef: hash('captured-data'), digest: hash(input.content), byteLength: Buffer.byteLength(input.content), inputDigest: a.digest, inputRecordRef: a.recordRef, executionRef: input.executionRef, actionRef: f.spec.actionRef, actionDigest: f.input.actionDigest, claimRef, generationRef: input.generationRef, sessionRef: input.sessionRef, auditRef: a.auditRef, bindingDigest: a.bindingDigest, materialDigest: a.materialDigest, purpose: a.purpose, inputCursor: input.inputCursor, cursor: input.cursor, evidenceRef: input.evidenceRef, state: 'captured', createdAt: 1000, deduplicated: false }; if (captureAckLost) { captureAckLost = false; throw Error('source-publisher-ack-lost'); } }
      return structuredClone(state.capture);
    },
    settleAction: () => { counts.settles++; effects.push('settle'); if (denySettlement) throw Error('settle-denied'); return { claimRef, generationRef: f.spec.executor.generationRef, reservationHeld: false }; },
  };
  const adapter = { prepare: async () => ticket, bindClaim: () => { effects.push('claim-binding'); if (denyClaim) throw Error('authentic-binding-denied'); }, observe: () => () => {}, create: async () => { counts.creates++; effects.push('create'); state.phase = 'ready'; return worker(); }, resume: async () => { throw Error('unexpected'); }, query: () => worker(), cancel: async () => worker(), dispose: async () => { state.phase = 'stopped'; return worker(); },
    executeAuditInput: async (_, execution, body, consume) => { assert.notEqual(execution.dataDigest, execution.inputDigest); assert.equal(body.digest, execution.inputDigest); assert.deepEqual(approvedInputSource(execution), { kind: 'df-audit-input', form: 'local' }); const admission = consume(); assert.equal(admission.admitted, true); counts.sends++; effects.push('send'); const content = purpose === 'audit_review' ? canonical({ contractVersion: 'df.audit-response/v1', bindingDigest: execution.bindingDigest, materialDigest: execution.materialDigest, inputDigest: execution.inputDigest, verdict: 'unknown', coverageRefs: [], unexaminedRefs: f.pair.association.material.map(m => m.recordRef).sort(), findings: [] }) : 'Synthetic local repair; approved audit input SHA-256: ' + execution.inputDigest + '.'; state.result = { ...execution, content, digest: hash(content), inputCursor: 1, cursor: 3 }; return { executionRef: execution.executionRef, state: 'committed', worker: worker() }; },
    validateResult: async () => { counts.collections++; if (booleanFacts) return true; state.facts = { usageUnits: 1000, evidenceRef: hash('persisted-facts'), resultDigest: state.result.digest, inputCursor: 1, executionRef: state.result.executionRef }; return state.facts; },
    readResult: () => structuredClone(state.result),
    finishExecution: async () => { effects.push('stop'); state.phase = 'stopped'; return { worker: worker(), usageUnits: 1000, evidenceRef: hash('finish') }; },
  };
  const manager = new WorkerManager({ store, hostHandle: f.host, adapter });
  const dispatch = { taskRef: f.task.taskRef, actionRef: f.spec.actionRef, actionDigest: f.input.actionDigest, commandRef: hash('dispatch'), expectedTaskVersion: 3, expectedAuthEpoch: 1, ...(purpose === 'audit_repair' ? { auditRepair: { auditRef: f.spec.executionInput.auditRef, previousReportRef: f.spec.executionInput.previousReportRef, round: 1, evidenceRef: hash('repair-lineage') } } : {}) };
  const execute = { taskRef: f.task.taskRef, actionRef: f.spec.actionRef, actionDigest: f.input.actionDigest, claimRef, generationRef: f.spec.executor.generationRef, inputRecordRef: f.pair.association.recordRef, commandRef: hash('execute'), expectedTaskVersion: 3, expectedAuthEpoch: 1 };
  const outer = { taskRef: f.task.taskRef, actionRef: f.spec.actionRef, claimRef, generationRef: f.spec.executor.generationRef, executionRef: hash('execution'), commandRef: hash('exact-source-child-capture'), expectedTaskVersion: 3, expectedAuthEpoch: 1 };
  return { ...f, manager, dispatch, execute, outer, counts, observations, effects, state };
}

test('NC2: actual-shaped collector facts required; boolean alone cannot capture or finish; query observations counted separately', async () => {
  const f = managerFixture({ booleanFacts: true }); await f.manager.dispatch(f.owner, f.dispatch); await f.manager.executeAuditInput(f.owner, f.execute);
  await assert.rejects(f.manager.validateAuditResult(f.owner, f.outer));
  assert.throws(() => f.manager.captureValidatedAuditResult(f.owner, f.outer));
  await assert.rejects(f.manager.finishExecution(f.owner, f.outer));
  const before = { ...f.counts }, n = f.observations.length;
  f.manager.query(f.owner, { taskRef: f.task.taskRef, actionRef: f.spec.actionRef, claimRef: f.outer.claimRef, generationRef: f.outer.generationRef });
  assert.deepEqual(f.counts, before); assert.ok(f.observations.length > n);
  assert.equal(f.counts.captureCalls, 0); assert.equal(f.counts.settles, 0);
});

test('NC4: original begin/consume/send once; lost capture receipt reconciles exact child without recollect; stopped denial holds', async () => {
  const f = managerFixture({ captureAckLost: true, denySettlement: true });
  await f.manager.dispatch(f.owner, f.dispatch); await f.manager.executeAuditInput(f.owner, f.execute);
  assert.ok(f.effects.indexOf('claim') < f.effects.indexOf('create'));
  assert.ok(f.effects.indexOf('consume') < f.effects.indexOf('send'));
  const second = await f.manager.executeAuditInput(f.owner, f.execute); assert.equal(second.admitted, false); assert.equal(f.counts.sends, 1);
  const validated = await f.manager.validateAuditResult(f.owner, f.outer), response = JSON.parse(validated.result.content);
  assert.equal(response.verdict, 'unknown'); assert.deepEqual(response.coverageRefs, []); assert.deepEqual(response.findings, []); assert.deepEqual(response.unexaminedRefs, f.pair.association.material.map(m => m.recordRef).sort());
  assert.throws(() => f.manager.captureValidatedAuditResult(f.owner, f.outer), /source-publisher-ack-lost/);
  await assert.rejects(f.manager.finishExecution(f.owner, { ...f.outer, commandRef: hash('finish') })); assert.equal(f.state.phase, 'ready');
  assert.throws(() => f.manager.captureValidatedAuditResult(f.owner, { ...f.outer, commandRef: hash('changed-command') }));
  const receipt = f.manager.captureValidatedAuditResult(f.owner, f.outer); assert.equal(receipt.resultRef, f.outer.executionRef); assert.equal(f.counts.collections, 1); assert.equal(f.counts.captureCalls, 2); assert.equal(f.counts.sends, 1);
  await assert.rejects(f.manager.finishExecution(f.owner, { ...f.outer, commandRef: hash('finish') })); assert.equal(f.state.phase, 'stopped'); assert.equal(f.counts.settles, 1);
  await assert.rejects(f.manager.finishExecution(f.owner, { ...f.outer, commandRef: hash('finish') })); assert.equal(f.counts.settles, 1);
});

test('NC4: repair lineage is forwarded into original claim; claim-binding refusal never creates or sends', async () => {
  const repair = managerFixture({ purpose: 'audit_repair' }); await repair.manager.dispatch(repair.owner, repair.dispatch); await repair.manager.executeAuditInput(repair.owner, repair.execute);
  const validation = await repair.manager.validateAuditResult(repair.owner, repair.outer);
  assert.equal(Buffer.byteLength(validation.result.content), 119);
  const denied = managerFixture({ denyClaim: true }); await assert.rejects(denied.manager.dispatch(denied.owner, denied.dispatch));
  assert.ok(denied.effects.includes('claim')); assert.ok(denied.observations.some(r => r.phase === 'submitted')); assert.equal(denied.counts.creates, 0); assert.equal(denied.counts.sends, 0); assert.equal(denied.counts.settles, 0);
});
