// PROPOSED SOURCE ONLY. Not an active fixture; NOT IMPORTED/RUN.
// Proposed future destination, only after root disposition:
// .runtime/ni6-schema7-core/test/schema7-preparation-escaped-secrets.test.mjs
// Three actual-public cases; no private counters/rows/method replacement/history.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RuntimeStore, reference } from '../src/runtime-store.mjs';
import { ContextAssembler } from '../src/context.mjs';
import { MemoryAdapter } from '../src/memory.mjs';

const scope = { ownerId: 'escaped-secret-owner', workspaceId: 'escaped-secret-workspace' };
const namespaceRef = reference('escaped-secret-memory');
const key = Buffer.alloc(32, 59);
const rejectedSecret = error => error?.code === 'SECRET_REJECTED';

async function actualWarmColdReplay(label, secret) {
  const directory = mkdtempSync(join(tmpdir(), 'df-schema7-escaped-secret-'));
  const databasePath = join(directory, 'ledger.sqlite');
  const callbacks = { tokenize: 0, observer: 0 };
  let store;
  try {
    function open() {
      const owner = {}, coordinator = {}, capability = {};
      store = new RuntimeStore({ databasePath, encryptionKey: key, clock: () => 1000,
        principals: [{ handle: owner, role: 'owner', scope },
          { handle: coordinator, role: 'coordinator', scope }],
        preparationPrincipals: [{ capability, ownerHandle: owner, namespaceRef }] });
      function adapter(knownSecrets) {
        const tokenize = text => { callbacks.tokenize++; return Buffer.byteLength(text); };
        const assembler = new ContextAssembler({ store, tokenize, clock: () => 1000,
          preparationBinding: { capability, handle: coordinator } });
        return new MemoryAdapter({ store, handle: coordinator, namespaceRef, knownSecrets,
          contextAssembler: assembler, tokenize, preparationCapability: capability,
          onPreparedCommit(event) {
            assert.equal(event.commitDisposition, 'new'); callbacks.observer++;
          } });
      }
      return { owner, adapter };
    }
    const warm = open();
    const task = store.intake(warm.owner, { taskId: label, provider: 'synthetic',
      source: 'synthetic', eventId: label, commandRef: reference(`${label}-intake`),
      goal: 'Prepare a bounded genuine task input.' }).task;
    const request = { taskRef: task.taskRef, commandRef: reference(`${label}-prepare`),
      expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch,
      terms: [secret], now: 1000 };
    const admitting = warm.adapter([]), prepared = await admitting.prepareExecutionContext(request);
    assert.ok(callbacks.tokenize > 0); assert.equal(callbacks.observer, 1);
    const restrictive = warm.adapter([secret]), calls = { ...callbacks };
    const warmBefore = store.snapshot(warm.owner, { taskRef: task.taskRef });
    await assert.rejects(restrictive.prepareExecutionContext(request), rejectedSecret);
    assert.deepEqual(callbacks, calls);
    assert.deepEqual(store.snapshot(warm.owner, { taskRef: task.taskRef }), warmBefore);
    assert.deepEqual(await admitting.prepareExecutionContext(request), prepared);
    assert.deepEqual(callbacks, calls);
    store.close(); store = null;

    const cold = open(), coldRestrictive = cold.adapter([secret]);
    const coldBefore = store.snapshot(cold.owner, { taskRef: task.taskRef });
    await assert.rejects(coldRestrictive.prepareExecutionContext(request), rejectedSecret);
    assert.deepEqual(callbacks, calls);
    assert.deepEqual(store.snapshot(cold.owner, { taskRef: task.taskRef }), coldBefore);
    const coldAdmitting = cold.adapter([]);
    assert.deepEqual(await coldAdmitting.prepareExecutionContext(request), prepared);
    assert.deepEqual(callbacks, calls);
  } finally {
    store?.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

test('F06-Q actual quoted term rejects restrictive warm/cold adapter replay', async () => {
  await actualWarmColdReplay('F06-Q', 'synthetic "quoted" term');
});
test('F06-B actual backslash term rejects restrictive warm/cold adapter replay', async () => {
  await actualWarmColdReplay('F06-B', 'synthetic \\ backslash term');
});
test('F06-N actual newline term rejects restrictive warm/cold adapter replay', async () => {
  await actualWarmColdReplay('F06-N', 'synthetic\nnewline term');
});
