// SOURCE ONLY, NOT RUN. Separate root executable lease required.
// Five authorized genuine-public preparation scopes. No native/history/SQL/private
// row fixtures, method replacement, instrumentation or fake receipt/capability.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RuntimeStore as Original6 } from '../original/runtime-store.mjs';
import { RuntimeStore, reference } from '../src/runtime-store.mjs';
import { ContextAssembler } from '../src/context.mjs';
import { MemoryAdapter } from '../src/memory.mjs';

const scope = { ownerId: 'review-preparation-owner', workspaceId: 'review-preparation-workspace' };
const namespaceRef = reference('review-preparation-memory');
const key = Buffer.alloc(32, 53);
const STORE_SECRET = 'synthetic-store-forbidden-term';
const ADAPTER_SECRET = 'synthetic-adapter-forbidden-term';
const rejectsCode = code => error => error?.code === code;

async function withFixture(label, binding, run, forbiddenSecrets = []) {
  const directory = mkdtempSync(join(tmpdir(), 'df-schema7-review-preparation-'));
  const databasePath = join(directory, 'ledger.sqlite');
  const owner = {}, issuer = {}, caller = {}, capability = {};
  let original, store;
  try {
    original = new Original6({ databasePath, encryptionKey: key, clock: () => 1000,
      principals: [{ handle: owner, role: 'owner', scope }] });
    const tasks = {};
    for (const name of ['A', 'B']) tasks[name] = original.intake(owner, {
      taskId: `${label}-${name}`, provider: 'synthetic', source: 'synthetic',
      eventId: `${label}-${name}`, commandRef: reference(`${label}-intake-${name}`),
      goal: 'Prepare the bounded public task input.'
    }).task;
    original.close(); original = null;
    store = new RuntimeStore({ databasePath, encryptionKey: key, clock: () => 1000,
      forbiddenSecrets, principals: [
        { handle: owner, role: 'owner', scope },
        { handle: issuer, role: 'owner', scope, ...(binding.issuer ? { taskRef: tasks.A.taskRef } : {}) },
        { handle: caller, role: 'coordinator', scope, ...(binding.caller ? { taskRef: tasks.A.taskRef } : {}) }
      ], preparationPrincipals: [{ capability, ownerHandle: issuer, namespaceRef }] });
    const callbacks = { tokenize: 0, observer: 0 };
    function adapter(knownSecrets = []) {
      const tokenize = text => { callbacks.tokenize++; return Buffer.byteLength(text); };
      const assembler = new ContextAssembler({ store, tokenize, clock: () => 1000,
        preparationBinding: { capability, handle: caller } });
      return new MemoryAdapter({ store, handle: caller, namespaceRef, knownSecrets,
        contextAssembler: assembler, tokenize, preparationCapability: capability,
        onPreparedCommit(event) {
          assert.equal(event.commitDisposition, 'new'); callbacks.observer++;
        } });
    }
    function request(task, command, terms = []) {
      return { taskRef: task.taskRef, commandRef: reference(`${label}-${command}`),
        expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch, terms, now: 1000 };
    }
    await run({ store, owner, tasks, callbacks, adapter, request });
  } finally {
    original?.close(); store?.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

test('P1 actual taskA-bound issuer denies prepareB before trusted work callbacks', async () => {
  await withFixture('P1', { issuer: true, caller: false }, async f => {
    const memory = f.adapter(), before = f.store.snapshot(f.owner, { taskRef: f.tasks.B.taskRef });
    await assert.rejects(memory.prepareExecutionContext(f.request(f.tasks.B, 'prepare')), rejectsCode('UNAUTHORIZED'));
    assert.deepEqual(f.callbacks, { tokenize: 0, observer: 0 });
    assert.deepEqual(f.store.snapshot(f.owner, { taskRef: f.tasks.B.taskRef }), before);
  });
});

test('P2 actual taskA-bound caller denies prepareB with genuine unbound issuer', async () => {
  await withFixture('P2', { issuer: false, caller: true }, async f => {
    const memory = f.adapter(), before = f.store.snapshot(f.owner, { taskRef: f.tasks.B.taskRef });
    await assert.rejects(memory.prepareExecutionContext(f.request(f.tasks.B, 'prepare')), rejectsCode('UNAUTHORIZED'));
    assert.deepEqual(f.callbacks, { tokenize: 0, observer: 0 });
    assert.deepEqual(f.store.snapshot(f.owner, { taskRef: f.tasks.B.taskRef }), before);
  });
});

test('P3 genuine taskA historical receipt survives original public source/version drift', async () => {
  await withFixture('P3', { issuer: true, caller: true }, async f => {
    const memory = f.adapter(), request = f.request(f.tasks.A, 'prepare');
    const prepared = await memory.prepareExecutionContext(request);
    assert.ok(f.callbacks.tokenize > 0); assert.equal(f.callbacks.observer, 1);
    const drift = f.store.putData(f.owner, { taskRef: f.tasks.A.taskRef,
      commandRef: reference('P3-public-drift'), kind: 'constraints',
      expectedTaskVersion: prepared.task.version, expectedAuthEpoch: prepared.task.authEpoch,
      content: 'Public instruction source changed after the prepared receipt.',
      sourceRef: reference('P3-public-source') });
    assert.ok(drift.task.version > prepared.task.version);
    const before = f.store.snapshot(f.owner, { taskRef: f.tasks.A.taskRef }), calls = { ...f.callbacks };
    assert.deepEqual(await memory.prepareExecutionContext(request), prepared);
    assert.deepEqual(f.callbacks, calls);
    assert.deepEqual(f.store.snapshot(f.owner, { taskRef: f.tasks.A.taskRef }), before);
  });
});

test('S1 actual new adapter secrets reject an otherwise genuine historical request', async () => {
  await withFixture('S1', { issuer: false, caller: false }, async f => {
    const term = 'synthetic-later-forbidden-term', memory = f.adapter([ADAPTER_SECRET]);
    const request = f.request(f.tasks.A, 'prepare', [term]);
    const prepared = await memory.prepareExecutionContext(request);
    assert.ok(f.callbacks.tokenize > 0); assert.equal(f.callbacks.observer, 1);
    const restrictive = f.adapter([term]), calls = { ...f.callbacks };
    const before = f.store.snapshot(f.owner, { taskRef: f.tasks.A.taskRef });
    await assert.rejects(restrictive.prepareExecutionContext(request), rejectsCode('SECRET_REJECTED'));
    assert.deepEqual(f.callbacks, calls);
    assert.deepEqual(f.store.snapshot(f.owner, { taskRef: f.tasks.A.taskRef }), before);
    assert.deepEqual(await memory.prepareExecutionContext(request), prepared);
    assert.deepEqual(f.callbacks, calls);
  }, [STORE_SECRET]);
});

test('S2 actual independent adapter and store secret sets both admit valid requests and reject forbidden terms', async () => {
  await withFixture('S2', { issuer: false, caller: false }, async f => {
    const memory = f.adapter([ADAPTER_SECRET]);
    const before = f.store.snapshot(f.owner, { taskRef: f.tasks.A.taskRef });
    await assert.rejects(memory.prepareExecutionContext(f.request(f.tasks.A, 'store-secret', [STORE_SECRET])), rejectsCode('SECRET_REJECTED'));
    await assert.rejects(memory.prepareExecutionContext(f.request(f.tasks.A, 'adapter-secret', [ADAPTER_SECRET])), rejectsCode('SECRET_REJECTED'));
    assert.deepEqual(f.callbacks, { tokenize: 0, observer: 0 });
    assert.deepEqual(f.store.snapshot(f.owner, { taskRef: f.tasks.A.taskRef }), before);
    const request = f.request(f.tasks.A, 'valid', ['synthetic-admitted-term']);
    const prepared = await memory.prepareExecutionContext(request), calls = { ...f.callbacks };
    assert.ok(calls.tokenize > 0); assert.equal(calls.observer, 1);
    assert.deepEqual(await memory.prepareExecutionContext(request), prepared);
    assert.deepEqual(f.callbacks, calls);
  }, [STORE_SECRET]);
});
