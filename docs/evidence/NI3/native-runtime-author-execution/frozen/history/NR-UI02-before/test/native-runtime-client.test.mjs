import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

// Exact candidate public client factory. No DB/native services/DOM/network,
// provider or source replacement. RPC replies below are explicit wire doubles.
const require = createRequire(import.meta.url);
const client = require('../src/client-entry.cjs')(() => ({ createElement() {} }));
const R = text => createHash('sha256').update(text).digest('hex');
const ok = value => ({ ok: true, value });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const turn = () => new Promise(resolve => setImmediate(resolve));
const systemPrompt = 'You are a dsh-fishball worker. Use only the approved task context supplied in this turn. Tools and external actions are unavailable.';
function fixture(t, handle = () => undefined) {
  let task = { taskRef: R('task'), status: 'running', version: 1, authEpoch: 0, updatedAt: 1000 }, serial = 0;
  const listeners = new Set(), calls = [];
  const contextRecordRef = R('context');
  const taskModel = {
    getSnapshot: () => ({ stale: false, detail: { task, audits: [], data: [{ recordRef: contextRecordRef, digest: R('context-content') }] } }),
    subscribe(f) { listeners.add(f); return () => listeners.delete(f); },
    async refresh() { calls.push({ name: 'task-refresh' }); return true; },
  };
  const description = {
    selection: { provider: 'df-testing-local', model: 'df-testing-worker-v1', agentPreset: 'empty', reasoningEffort: 'deterministic', maxOutputTokens: 128 },
    effectiveReasoningEffort: 'deterministic', environment: { root: '/synthetic/profile', cwd: '/synthetic/profile' },
    persistence: { directory: '/synthetic/profile/df-sessions', compression: 'none', retention: 'owner-managed', encrypted: false },
    bounds: { requestBytes: 131072, resultBytes: 2048 },
    limits: { queueCapacity: 32, maxActive: 1, maxAttempts: 1, maxTotalAttempts: 1, maxRuntimeMs: 60000, maxUsageUnits: 600000, maxCostEstimateMicros: 0 },
    charges: { runtimeMs: 1000, usageUnits: 135168, costState: 'estimated', costEstimateMicros: 0, costProvenanceRef: R('source') },
    accounting: 'df-testing-utf8-byte-units/v1', pricing: 'source_zero', grantTtlMs: 60000, systemPrompt,
  };
  const status = { enabled: false, ready: false, reason: 'disabled', bounds: null };
  const rpc = { async call(channel, name, payload, signal) {
    calls.push({ channel, name, payload, signal });
    const handled = await handle({ channel, name, payload, signal });
    if (handled !== undefined) return handled;
    if (name === 'v1/auditStatus') return ok({ ...status });
    if (name === 'v1/workerPolicyPreview') return ok({ previewRef: R('policy-preview'), planDigest: R('policy-plan'), expiresAt: 31000, expectedPolicyVersion: 1, description: structuredClone(description) });
    throw Error('unexpected fixture endpoint: ' + name);
  } };
  const options = { clock: () => 1000, uuid: () => 'command-' + (++serial), digest: async text => R(text) };
  const worker = client.createWorkerModel(rpc, taskModel, options);
  const capturedWorker = { getSnapshot: () => ({ contextRecordRef, capture: { artifactRef: R('artifact'), version: 1, digest: R('artifact-content'), recordRef: R('artifact-record') } }) };
  const audit = client.createAuditModel(rpc, taskModel, capturedWorker, options);
  t.after(() => { worker.dispose(); audit.dispose(); });
  const external = changes => { task = { ...task, ...changes }; for (const f of [...listeners]) f(); };
  external({}); // Establish current selection before any deferred operation.
  return { worker, audit, calls, description, status, external, task: () => task };
}

test('disabled audit producer policy accepts its exact old fields while missing fields extras and malformed auditRoles refuse', async t => {
  const f = fixture(t);
  assert.equal(Object.hasOwn(f.description, 'auditRoles'), false);
  assert.equal(await f.worker.previewPolicy(1), true);
  assert.equal(f.worker.getSnapshot().policyPreview.description.limits.maxTotalAttempts, 1);
  assert.equal(Object.hasOwn(f.worker.getSnapshot().policyPreview.description, 'auditRoles'), false);
  assert.equal(f.calls.length, 1);
  assert.equal(f.worker.setPolicyAccepted(true), true);
  for (const key of Object.keys(f.description)) {
    const missing = fixture(t, ({ name }) => {
      if (name !== 'v1/workerPolicyPreview') return;
      const description = structuredClone(f.description); delete description[key];
      return ok({ previewRef: R('preview'), planDigest: R('plan'), expiresAt: 31000, expectedPolicyVersion: 1, description });
    });
    assert.equal(await missing.worker.previewPolicy(1), false, 'required old field: ' + key);
    assert.equal(missing.worker.getSnapshot().error, 'INVALID_RESPONSE');
    assert.equal(missing.worker.getSnapshot().policyPreview, null);
  }
  for (const change of [{ extraField: 'unexpected' }, { auditRoles: null }, { auditRoles: {} }, { auditRoles: { review: {} } }]) {
    const malformed = fixture(t, ({ name }) => name === 'v1/workerPolicyPreview' ? ok({ previewRef: R('preview'), planDigest: R('plan'), expiresAt: 31000, expectedPolicyVersion: 1, description: { ...structuredClone(f.description), ...change } }) : undefined);
    assert.equal(await malformed.worker.previewPolicy(1), false);
    assert.equal(malformed.worker.getSnapshot().error, 'INVALID_RESPONSE');
    assert.equal(malformed.worker.getSnapshot().policyPreview, null);
  }
  assert.equal(f.calls.some(c => /Confirm|Grant|Create|Execute/.test(c.name)), false);
});

test('audit delayed refresh suppresses an external revision response and releases busy for explicit fresh status', async t => {
  const gate = deferred(); let first = true;
  const f = fixture(t, ({ name }) => { if (name === 'v1/auditStatus' && first) { first = false; return gate.promise; } });
  const pending = f.audit.refresh(); await turn();
  assert.equal(f.audit.getSnapshot().busy, 'auditStatus');
  f.external({ version: 2 }); assert.equal(f.audit.getSnapshot().stale, true);
  assert.equal(await f.audit.refresh(), false, 'no overlapping same-connection request while old operation holds busy');
  gate.resolve(ok({ enabled: true, ready: true, reason: 'stale-result', bounds: null })); await pending;
  assert.equal(f.audit.getSnapshot().status, null, 'stale status cannot publish');
  assert.equal(f.audit.getSnapshot().busy, null);
  assert.equal(await f.audit.refresh(), true);
  assert.equal(f.audit.getSnapshot().status.enabled, false);
  assert.equal(f.calls.filter(c => c.name === 'v1/auditStatus').length, 2);
});

test('audit delayed configure suppresses external auth drift and releases busy without replaying mutation', async t => {
  const gate = deferred(), f = fixture(t, ({ name }) => name === 'v1/configureAudit' ? gate.promise : undefined);
  const pending = f.audit.configure(); await turn();
  assert.equal(f.audit.getSnapshot().busy, 'configureAudit');
  assert.equal(f.calls.filter(c => c.name === 'v1/configureAudit').length, 1);
  f.external({ authEpoch: 1 });
  assert.equal(await f.audit.configure(), false, 'busy prevents another same-connection mutation');
  gate.resolve(ok({ auditRef: R('stale-requirement'), auditRevision: 1 }));
  assert.equal(await pending, false);
  assert.equal(f.audit.getSnapshot().requirement, null);
  assert.equal(f.audit.getSnapshot().busy, null);
  assert.equal(f.audit.getSnapshot().stale, true);
  assert.equal(await f.audit.refresh(), true);
  assert.equal(f.calls.filter(c => c.name === 'v1/configureAudit').length, 1);
  assert.equal(f.calls.some(c => c.name === 'task-refresh'), false, 'stale mutation is neither accepted nor replayed');
});

test('audit old connection cleanup cannot clear a new refresh busy or publish its stale result', async t => {
  const old = deferred(), current = deferred(); let calls = 0;
  const f = fixture(t, ({ name }) => name === 'v1/auditStatus' ? (++calls === 1 ? old.promise : current.promise) : undefined);
  const oldRequest = f.audit.refresh(); await turn();
  const oldSignal = f.calls[0].signal;
  f.audit.disconnected(); assert.equal(oldSignal.aborted, true);
  const newRequest = f.audit.refresh(); await turn();
  assert.equal(f.audit.getSnapshot().busy, 'auditStatus');
  old.resolve(ok({ enabled: true, ready: true, reason: 'old-connection', bounds: null }));
  assert.equal(await oldRequest, false);
  assert.equal(f.audit.getSnapshot().status, null);
  assert.equal(f.audit.getSnapshot().busy, 'auditStatus', 'old finally leaves new connection request owned');
  current.resolve(ok({ ...f.status })); assert.equal(await newRequest, true);
  assert.equal(f.audit.getSnapshot().busy, null);
  assert.equal(f.audit.getSnapshot().status.enabled, false);
  assert.equal(f.calls.filter(c => c.name === 'v1/auditStatus').length, 2);
});
