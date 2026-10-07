import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { createNativeFixture, physical, sha, isRef, assertRefs } from './native-host-fixture.mjs';
import { createClientFixture, elements, textOf } from './client-wire-fixture.mjs';

// SOURCE ONLY. No command has been run. One unexpected failure makes every
// later leaf explicitly STOPPED_AFTER_FIRST_FAILURE; no automatic retry.
let stopped = false;
function leaf(id, callback) {
  test(id, { concurrency: false, timeout: 120000 }, async t => {
    if (stopped) { t.skip('STOPPED_AFTER_FIRST_FAILURE'); return; }
    try { await callback(t); }
    catch (error) { stopped = true; throw error; }
  });
}
async function native(t, id, operation) {
  const f = await createNativeFixture(id);
  try { return await operation(f); }
  finally {
    try { await f.close(); }
    finally { t.diagnostic(JSON.stringify({ id, syntheticRoot: f.dir, rpcCalls: f.rpcCalls.length,
      requests: f.requests.length, textEffects: f.requests.reduce((n,r) => n + r.chunks.filter(c => c.type === 'text-delta').length, 0),
      iteratorNext: f.requests.reduce((n,r) => n + r.nextCalls, 0), iteratorReturn: f.requests.reduce((n,r) => n + r.returnCalls, 0),
      sessionEvents: f.events.length, publicReaders: f.readerCounts })); }
  }
}
async function client(id, options, operation) {
  const f = createClientFixture(id, options);
  try { return await operation(f); } finally { f.dispose(); }
}
function textEffects(f) { return f.requests.reduce((n,r) => n + r.chunks.filter(c => c.type === 'text-delta').length, 0); }
function completeStreams(f, count) {
  assert.equal(f.requests.length, count); assert.equal(textEffects(f), count);
  for (const row of f.requests) {
    assert.deepEqual(row.chunks.map(c => c.type), ['text-delta', 'usage', 'finish']);
    assert.equal(row.chunks[2].reason.kind, 'stop'); assert.equal(row.errors.length, 0);
    assert.equal(row.options.tools?.length ?? 0, 0);
  }
}
function claims(snapshot, count) {
  const admitted = snapshot.actions.filter(a => a.claimRef !== null);
  assert.equal(admitted.length, count); assert.equal(new Set(admitted.map(a => a.claimRef)).size, count);
  assert.equal(new Set(admitted.map(a => a.spec.executor.generationRef)).size, count);
  return admitted;
}
async function readUnknownReport(f, taskRef, role, worker, completed, reports) {
  const response = JSON.parse(completed.text);
  assert.deepEqual(Object.keys(response).sort(), ['bindingDigest', 'contractVersion', 'coverageRefs', 'findings', 'inputDigest', 'materialDigest', 'unexaminedRefs', 'verdict']);
  assert.equal(response.contractVersion, 'df.audit-response/v1'); assert.equal(response.verdict, 'unknown');
  assert.equal(response.bindingDigest, role.body.bindingDigest); assert.equal(response.materialDigest, role.body.materialDigest); assert.equal(response.inputDigest, sha(role.preview.description.data.content));
  assert.deepEqual(response.coverageRefs, []); assert.deepEqual(response.findings, []);
  assert.deepEqual(response.unexaminedRefs, role.body.material.map(item => item.recordRef).sort());
  const audit = await f.ok('audit', { taskRef, auditRef: role.body.auditRef });
  assert.equal(audit.reports.length, reports);
  const report = audit.reports.find(r => r.claimRef === worker.claimRef); assert.ok(report);
  assert.equal(report.verdict, 'unknown'); assert.equal(report.generationRef, worker.generationRef);
  assert.equal(report.digest, role.body.artifact.digest); assert.equal(report.artifactVersion, role.body.artifact.version);
  assert.equal(report.bindingDigest, role.body.bindingDigest); assert.equal(report.materialDigest, role.body.materialDigest);
  assert.deepEqual(report.coverageRefs, []); assert.deepEqual(report.unexaminedRefs, response.unexaminedRefs); assert.deepEqual(report.findings, []);
  assert.ok(isRef(report.reportRef)); assert.notEqual(audit.state, 'passed');
  return { audit, report };
}
async function review(f, producer, requirement, reportCount = 1) {
  const role = await f.prepareRole(producer.taskRef, requirement, 'audit_review');
  const worker = await f.createRole(producer.taskRef, role);
  // Native prerequisite for C06: actual current public snapshot mapping.
  const snapshot = await f.snapshot(producer.taskRef);
  const projected = snapshot.workers.find(w => w.claimRef === worker.claimRef); assert.ok(projected);
  assertRefs(projected, ['actionRef', 'actionDigest', 'claimRef', 'reservationRef', 'generationRef', 'sessionRef']);
  for (const field of ['actionRef', 'actionDigest', 'claimRef', 'reservationRef', 'generationRef', 'sessionRef']) assert.equal(projected[field], worker[field]);
  const completed = await f.completeRole(producer.taskRef, role, worker);
  return { role, worker, completed, ...await readUnknownReport(f, producer.taskRef, role, worker, completed, reportCount) };
}
function conservedUncertainty(f, marker) {
  assert.equal(f.audit.getSnapshot().uncertain, marker);
  assert.equal(f.audit.getSnapshot().stale, true);
  assert.equal(f.audit.getSnapshot().accepted, false);
  assert.equal(f.audit.getSnapshot().preview, null);
}
async function blockedMutations(f) {
  const before = f.calls.length;
  assert.equal(await f.audit.create(), false); assert.equal(await f.audit.execute(), false);
  assert.equal(f.calls.length, before);
}

leaf('NRI-L01 genuine producer and original unknown review', async t => native(t, 'L01', async f => {
  const producer = await f.producer();
  const requirement = await f.configure(producer.taskRef, producer.context, producer.capture);
  const reviewer = await review(f, producer, requirement);
  assert.notEqual(reviewer.worker.claimRef, producer.worker.claimRef);
  assert.notEqual(reviewer.worker.generationRef, producer.worker.generationRef);
  assert.notEqual(reviewer.worker.sessionRef, producer.worker.sessionRef);
  const snapshot = await f.snapshot(producer.taskRef); claims(snapshot, 2);
  assert.equal(snapshot.artifacts.length, 1); assert.equal(snapshot.artifacts[0].producerClaimRef, producer.worker.claimRef);
  assert.notEqual(snapshot.task.status, 'completed'); completeStreams(f, 2);
}));

leaf('NRI-L02 genuine unknown review repair and fresh unknown review', async t => native(t, 'L02', async f => {
  const producer = await f.producer();
  const requirement = await f.configure(producer.taskRef, producer.context, producer.capture);
  const first = await review(f, producer, requirement);
  const current = await f.snapshot(producer.taskRef), repairRequirement = current.audits.find(a => a.auditRef === requirement.auditRef);
  assert.equal(repairRequirement.reportRef, first.report.reportRef);
  const role = await f.prepareRole(producer.taskRef, repairRequirement, 'audit_repair');
  assert.equal(role.body.previousReport.reportRef, first.report.reportRef);
  const worker = await f.createRole(producer.taskRef, role);
  const completed = await f.completeRole(producer.taskRef, role, worker);
  assert.equal(completed.text, `Synthetic local repair; approved audit input SHA-256: ${sha(role.preview.description.data.content)}.`);
  const repairedSnapshot = await f.snapshot(producer.taskRef);
  const repaired = repairedSnapshot.artifacts.find(a => a.artifactRef === producer.capture.artifactRef && a.version === 2); assert.ok(repaired);
  assert.equal(repaired.producerClaimRef, worker.claimRef); assert.equal(repaired.generationRef, worker.generationRef);
  assert.equal(repaired.digest, sha(completed.text));
  const nextRequirement = await f.configure(producer.taskRef, producer.context, repaired, repairedSnapshot.audits.find(a => a.auditRef === requirement.auditRef));
  const second = await review(f, producer, nextRequirement, 2);
  assert.deepEqual(second.audit.reports.find(report => report.reportRef === first.report.reportRef), first.report);
  assert.equal(second.role.body.artifact.version, 2); assert.equal(second.role.body.artifact.digest, repaired.digest);
  const snapshot = await f.snapshot(producer.taskRef), admitted = claims(snapshot, 4);
  assert.equal(new Set(admitted.map(a => a.spec.executor.sessionRef)).size, 4);
  assert.equal(snapshot.artifacts.length, 2); assert.notEqual(snapshot.task.status, 'completed'); completeStreams(f, 4);
}));

leaf('NRI-P01 original owner revoke before review dispatch', async t => native(t, 'P01', async f => {
  const producer = await f.producer();
  const requirement = await f.configure(producer.taskRef, producer.context, producer.capture);
  const role = await f.prepareRole(producer.taskRef, requirement, 'audit_review');
  const before = await f.snapshot(producer.taskRef);
  await f.ok('revoke', { ...await f.cas(producer.taskRef, 'original-owner-revoke'), actionRef: role.plan.actionRef, actionDigest: role.plan.actionDigest });
  const refused = await f.rpc('dispatchAudit', { ...await f.cas(producer.taskRef, 'refused-review-dispatch'), actionRef: role.plan.actionRef, actionDigest: role.plan.actionDigest });
  assert.equal(refused.ok, false);
  assert.ok(['GRANT_REQUIRED', 'GRANT_EXPIRED', 'HOST_PERMISSION_DENIED', 'PERMISSION_DENIED', 'AUDIT_ALREADY_SUBMITTED', 'AUDIT_STALE', 'AUDIT_SOURCE_STALE', 'WORKER_SOURCE_UNAVAILABLE'].includes(refused.error.code), refused.error.code);
  const after = await f.snapshot(producer.taskRef); claims(after, 1);
  assert.deepEqual(after.artifacts, before.artifacts); assert.equal(after.workers.length, before.workers.length);
  assert.equal(after.actions.find(a => a.actionRef === role.plan.actionRef).claimRef, null);
  assert.equal(ctxAbsent(f, role), true); completeStreams(f, 1);
}));
function ctxAbsent(f, role) { const generation = role.plan.generationRef ?? null;
  return generation === null ? f.ctx.agents.list().length === 0 : f.ctx.agents.get('df-' + generation) === undefined; }

async function abortedReview(t, id, position) {
  return native(t, id, async f => {
    const producer = await f.producer();
    const requirement = await f.configure(producer.taskRef, producer.context, producer.capture);
    const role = await f.prepareRole(producer.taskRef, requirement, 'audit_review');
    const worker = await f.createRole(producer.taskRef, role);
    const controller = new AbortController(), barrier = f.armAbort(worker, controller, position);
    const refused = await f.executeRole(producer.taskRef, role, worker, controller);
    assert.equal(refused.ok, false); assert.equal(refused.error.code, 'REQUEST_ABORTED'); assert.equal(barrier.hits, 1);
    const snapshot = await f.snapshot(producer.taskRef); claims(snapshot, 2);
    assert.equal(snapshot.actions.find(a => a.claimRef === worker.claimRef).releaseEvidenceRef, null);
    assert.equal(snapshot.artifacts.length, 1);
    const audit = await f.ok('audit', { taskRef: producer.taskRef, auditRef: requirement.auditRef }); assert.equal(audit.reports.length, 0);
    assert.equal(f.requests.length, 2); const partial = f.requests[1];
    assert.equal(partial.options.model, 'df-testing-review-v1');
    assert.equal(partial.chunks.filter(c => c.type === 'text-delta').length, position === 'before' ? 0 : 1);
    assert.equal(partial.chunks.filter(c => c.type === 'usage' || c.type === 'finish' && c.reason.kind === 'stop').length, 0);
    assert.ok(partial.errors.includes('REQUEST_ABORTED'));
    const disposal = await f.disposeChildAndObserve([worker]);
    assert.deepEqual(disposal.map(v => v.drainedWriterObserved), [true]);
    t.diagnostic(JSON.stringify({ id, beforeDisposal: 'review-claim-held-no-report', iteratorReturn: partial.returnCalls,
      deniedIteratorErrors: partial.errors, originalManagerDisposal: disposal, finalRelease: 'NOT_CLAIMED' }));
  });
}
leaf('NRI-S01 original RPC abort before first lazy provider effect', t => abortedReview(t, 'S01', 'before'));
leaf('NRI-S02 original RPC abort after first genuine deterministic delta', t => abortedReview(t, 'S02', 'after'));

test('NRI-D01 original shared opaque directory token across three runtime roles', {
  skip: 'NOT_AUTHORED: original runtime directoryBinding/allocation token has no public observation point; independently resolved token cannot prove its identity.',
}, () => assert.fail('D01 is not an executable case'));

leaf('NRI-D02 original source refuses unexpected preclaim leaf', async t => native(t, 'D02', async f => {
  const initial = await f.initialize(), plan = await f.prepareProducer(initial.taskRef, initial.context);
  assert.equal(existsSync(f.directory), false);
  mkdirSync(f.directory, { mode: 0o700 }); const before = physical(f.directory);
  const refused = await f.rpc('workerCreate', { ...await f.cas(initial.taskRef, 'unexpected-leaf-create'), actionRef: plan.actionRef, actionDigest: plan.actionDigest });
  assert.equal(refused.ok, false); assert.equal(refused.error.code, 'WORKER_SOURCE_UNAVAILABLE');
  const snapshot = await f.snapshot(initial.taskRef); claims(snapshot, 0);
  assert.deepEqual(physical(f.directory), before); assert.equal(f.ctx.agents.list().length, 0); assert.equal(f.ctx.sessions.list().length, 0);
  assert.equal(f.requests.length, 0); assert.equal(textEffects(f), 0);
}));

leaf('NRI-D03 original source refuses replaced owned allocation inode', async t => native(t, 'D03', async f => {
  const initial = await f.initialize(), plan = await f.prepareProducer(initial.taskRef, initial.context);
  const worker = await f.createProducer(initial.taskRef, plan);
  assert.equal(physical(f.directory).mode, 0o700);
  const retained = f.replaceOwnedLeaf();
  const refused = await f.rpc('workerExecute', { ...await f.cas(initial.taskRef, 'replaced-leaf-execute'), actionRef: plan.actionRef, actionDigest: plan.actionDigest, claimRef: worker.claimRef, generationRef: worker.generationRef, contextRecordRef: initial.context.recordRef });
  assert.equal(refused.ok, false); assert.equal(refused.error.code, 'WORKER_SOURCE_UNAVAILABLE');
  const snapshot = await f.snapshot(initial.taskRef); claims(snapshot, 1);
  assert.equal(snapshot.actions.find(a => a.claimRef === worker.claimRef).releaseEvidenceRef, null);
  assert.equal(f.requests.length, 0); assert.equal(textEffects(f), 0);
  assert.deepEqual(physical(retained.retained), retained.before); assert.deepEqual(physical(f.directory), retained.after);
  const disposal = await f.disposeChildAndObserve([worker], false);
  t.diagnostic(JSON.stringify({ id: 'D03', originalManagerDisposal: disposal,
    writerDrain: 'HOLD: replaced public path cannot prove retained original writer drain', release: 'NOT_CLAIMED' }));
}));

leaf('NRI-T01 public facts resolver refuses foreign empty directory token', async t => native(t, 'T01', async f => {
  const initial = await f.initialize();
  await assert.rejects(f.foreignTokenFacts(), error => error.code === 'WORKER_SOURCE_UNAVAILABLE');
  const snapshot = await f.snapshot(initial.taskRef); claims(snapshot, 0);
  assert.equal(existsSync(f.directory), false); assert.equal(f.requests.length, 0); assert.equal(f.ctx.agents.list().length, 0); assert.equal(f.ctx.sessions.list().length, 0);
}));

leaf('NRI-C01 disabled audit card remains visible with usable worker and no artifact', async () => client('C01', { enabled: false, captured: false }, async f => {
  assert.equal(await f.audit.refresh(), true); assert.equal(f.audit.getSnapshot().status.enabled, false);
  const tree = f.panel(), nodes = elements(tree);
  const audit = nodes.find(n => n.props['aria-label'] === 'Native independent audit'); assert.ok(audit);
  assert.match(textOf(audit), /Native audit is disabled\./);
  assert.equal(nodes.some(n => n.type === 'button' && textOf(n) === 'Configure captured artifact audit'), false);
  const prepare = nodes.find(n => n.type === 'button' && textOf(n) === 'Prepare approved context'); assert.ok(prepare); assert.equal(prepare.props.disabled, false);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].name, 'auditStatus');
}));

leaf('NRI-C02 lost execute and disconnect retain uncertainty through exact readonly query', async () => client('C02', { execute: 'pending' }, async f => {
  await f.planned(); assert.equal(await f.audit.create(), true);
  const executing = f.audit.execute(), pending = await f.whenPending('executeAudit');
  f.audit.disconnected(); assert.equal(pending.signal.aborted, true); conservedUncertainty(f, 'executeAudit');
  f.settle('executeAudit', true); assert.equal(await executing, false);
  assert.equal(f.audit.canQuery(), true); assert.equal(await f.audit.query(), true); conservedUncertainty(f, 'executeAudit');
  assert.equal(f.audit.getSnapshot().worker.phase, 'unknown'); assert.equal(f.audit.getSnapshot().execution, null);
  await blockedMutations(f); assert.equal(f.calls.filter(c => c.name === 'executeAudit').length, 1); assert.equal(f.calls.filter(c => c.name === 'auditQuery').length, 1);
}));

leaf('NRI-C03 query refuses changed valid generation without replacing original mapping', async () => client('C03', { queryForeignGeneration: true }, async f => {
  await f.planned(); assert.equal(await f.audit.create(), true); assert.equal(await f.audit.execute(), false);
  const before = f.audit.getSnapshot().worker;
  assert.equal(await f.audit.query(), false); assert.equal(f.audit.getSnapshot().error, 'INVALID_RESPONSE');
  assert.deepEqual(f.audit.getSnapshot().worker, before); conservedUncertainty(f, 'executeAudit'); await blockedMutations(f);
}));

leaf('NRI-C04 task change refuses late original query mapping', async () => client('C04', { query: 'pending' }, async f => {
  await f.planned(); assert.equal(await f.audit.create(), true); assert.equal(await f.audit.execute(), false);
  const querying = f.audit.query(); await f.whenPending('auditQuery');
  const next = f.replaceTask(); f.settle('auditQuery'); assert.equal(await querying, false);
  assert.notEqual(next.taskRef, f.ids.taskRef); assert.equal(f.audit.getSnapshot().worker, null); assert.equal(f.audit.getSnapshot().action, null);
  assert.equal(f.audit.canQuery(), false); const before = f.calls.length; assert.equal(await f.audit.query(), false); assert.equal(f.calls.length, before);
}));

leaf('NRI-C05 pending dispatch disconnect captures unknown outcome before abort', async () => client('C05', { dispatch: 'pending' }, async f => {
  await f.planned(); const creating = f.audit.create(), pending = await f.whenPending('dispatchAudit');
  f.audit.disconnected(); assert.equal(pending.signal.aborted, true); conservedUncertainty(f, 'dispatchAudit');
  f.settle('dispatchAudit'); assert.equal(await creating, false); assert.equal(f.audit.getSnapshot().worker, null);
  conservedUncertainty(f, 'dispatchAudit'); await blockedMutations(f);
  assert.equal(f.calls.filter(c => c.name === 'dispatchAudit').length, 1);
}));

leaf('NRI-C06 exactly one fresh matching worker permits readonly unknown-dispatch query', async () => client('C06', { dispatch: 'lost', candidateCount: 1 }, async f => {
  await f.planned(); assert.equal(await f.audit.create(), false); conservedUncertainty(f, 'dispatchAudit'); assert.equal(f.audit.getSnapshot().worker, null);
  assert.equal(f.audit.canQuery(), true); assert.equal(await f.audit.query(), true);
  const worker = f.audit.getSnapshot().worker; assert.equal(worker.claimRef, f.ids.claimRef); assert.equal(worker.generationRef, f.ids.generationRef); assert.equal(worker.phase, 'unknown');
  conservedUncertainty(f, 'dispatchAudit'); await blockedMutations(f);
  assert.equal(f.calls.filter(c => c.name === 'dispatchAudit').length, 1); assert.equal(f.calls.filter(c => c.name === 'auditQuery').length, 1);
}));

leaf('NRI-C07 zero fresh matching workers refuses query without RPC or cleared uncertainty', async () => client('C07', { dispatch: 'lost', candidateCount: 0 }, async f => {
  await f.planned(); assert.equal(await f.audit.create(), false); assert.equal(f.audit.canQuery(), false);
  const before = f.calls.length; assert.equal(await f.audit.query(), false); assert.equal(f.calls.length, before);
  assert.equal(f.audit.getSnapshot().error, 'AUDIT_COLLECTION_UNAVAILABLE'); assert.equal(f.audit.getSnapshot().worker, null);
  conservedUncertainty(f, 'dispatchAudit'); await blockedMutations(f);
}));

leaf('NRI-C08 two fresh matching workers refuses arbitrary candidate selection', async () => client('C08', { dispatch: 'lost', candidateCount: 2 }, async f => {
  await f.planned(); assert.equal(await f.audit.create(), false); assert.equal(f.audit.canQuery(), false);
  const before = f.calls.length; assert.equal(await f.audit.query(), false); assert.equal(f.calls.length, before);
  assert.equal(f.audit.getSnapshot().error, 'AUDIT_COLLECTION_UNAVAILABLE'); assert.equal(f.audit.getSnapshot().worker, null);
  conservedUncertainty(f, 'dispatchAudit'); await blockedMutations(f);
}));
