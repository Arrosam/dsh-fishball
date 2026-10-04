import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { Foundation, FoundationError } from '../src/foundation.mjs';
import { legacySchemaSql } from '../src/ledger.mjs';

// Independently authored risk-based checks. Only synthetic data, temporary
// local stores and the installed public no-profile Cordis fixture are used.
const moduleUrl = new URL('../src/foundation.mjs', import.meta.url).href;
const scope = Object.freeze({ ownerId: 'review-owner', workspaceId: 'review-workspace' });
const digest = value => createHash('sha256').update(value).digest('hex');
const evidenceDigest = digest('synthetic-independent-evidence');
const request = (actionId = 'action', expectedVersion = 1, overrides = {}) => ({
  actionId, kind: 'fixture', targetDigest: digest('synthetic-target'),
  dataDigest: digest('synthetic-data'), limits: { units: 1 }, expectedVersion, ...overrides,
});
const ingress = (taskId = 'task', eventId = taskId, overrides = {}) => ({
  taskId, provider: 'fixture', source: 'independent-source', eventId, ...overrides,
});
function fixture(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'bubbles-independent-'));
  const databasePath = join(directory, 'ledger.sqlite');
  const capability = {};
  let currentTime = 1000;
  const core = new Foundation({ databasePath, clock: () => currentTime,
    hostPermission: () => true, trustedOperators: [{ scope, capability }], ...options });
  t.after(() => { core.close(); rmSync(directory, { recursive: true, force: true }); });
  return { core, capability, databasePath, directory, time: value => { currentTime = value; } };
}
function prepare(core, capability, taskId = 'task', actionId = 'action', expiresAt = 2000, spec = {}) {
  core.intake(scope, ingress(taskId));
  core.requestAction(scope, taskId, request(actionId, 1, spec));
  approve(core, capability, scope, taskId, actionId, 1, expiresAt);
}
function approve(core, capability, boundScope, taskId, actionId, expectedVersion, expiresAt) {
  return core.grant(capability, boundScope, taskId, actionId, {
    expectedVersion, expectedAuthEpoch: core.getTask(boundScope, taskId).authEpoch, expiresAt,
  });
}
function code(fn, expected) {
  assert.throws(fn, error => {
    assert.ok(error instanceof FoundationError, 'stable redacted core error');
    assert.equal(error.message, error.code);
    assert.ok((Array.isArray(expected) ? expected : [expected]).includes(error.code), error.code);
    return true;
  });
}
function sql(databasePath, query, ...parameters) {
  const db = new DatabaseSync(databasePath);
  try { return db.prepare(query).all(...parameters); } finally { db.close(); }
}
function execute(databasePath, statement, ...parameters) {
  const db = new DatabaseSync(databasePath);
  try { db.prepare(statement).run(...parameters); } finally { db.close(); }
}
function reserved(databasePath) {
  return sql(databasePath, 'SELECT coalesce(sum(units),0) AS count FROM reservations')[0].count;
}
async function processRace(t, databasePath, operations) {
  const children = operations.map(operation => {
    const source = `
      import { Foundation } from ${JSON.stringify(moduleUrl)};
      const scope=${JSON.stringify(scope)}, capability={};
      const core=new Foundation({databasePath:process.argv[1], clock:()=>1000, hostPermission:()=>true,
        trustedOperators:[{scope,capability}]});
      process.send({ready:true});
      process.once('message',()=>{
        let result;
        try { const value=(()=>{${operation}})(); result={accepted:true,value}; }
        catch(error) { result={accepted:false,code:error.code}; }
        core.close(); process.send(result); process.disconnect();
      });
    `;
    const child = spawn(process.execPath, ['--input-type=module', '-e', source, databasePath], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    t.after(() => child.kill());
    let stderr = '';
    child.stderr.on('data', data => { stderr += data; });
    const receive = () => new Promise((resolve, reject) => {
      const message = value => { cleanup(); resolve(value); };
      const exit = exitCode => { cleanup(); reject(new Error(`race child exited ${exitCode}: ${stderr}`)); };
      const cleanup = () => { child.off('message', message); child.off('exit', exit); };
      child.once('message', message); child.once('exit', exit);
    });
    return { child, receive, ready: receive() };
  });
  assert.deepEqual(await Promise.all(children.map(child => child.ready)), operations.map(() => ({ ready: true })));
  const results = children.map(child => child.receive());
  for (const { child } of children) child.send('go');
  return Promise.all(results);
}

test('independent: expiry partitions before, exactly at and after the boundary', async t => {
  for (const at of [1999, 2000, 2001]) await t.test(`now=${at}; expiresAt=2000`, t => {
    const f = fixture(t);
    prepare(f.core, f.capability);
    f.time(at);
    if (at < 2000) {
      assert.equal(f.core.claim(scope, 'task', 'action', { expectedVersion: 1 }).action.state, 'dispatch_intent');
      assert.equal(reserved(f.databasePath), 1);
    } else {
      const before = f.core.exportTask(scope, 'task');
      code(() => f.core.claim(scope, 'task', 'action', { expectedVersion: 1 }), 'APPROVAL_INVALID');
      assert.deepEqual(f.core.exportTask(scope, 'task'), before);
      assert.equal(reserved(f.databasePath), 0);
    }
  });
});

test('independent: capability identity, owner/workspace/task and authority epochs cannot be spoofed', t => {
  const f = fixture(t);
  f.core.intake(scope, ingress());
  f.core.requestAction(scope, 'task', request());
  for (const fake of [{}, { verified: true, isOwner: true }, null, 'owner', new Proxy({}, {})]) {
    code(() => f.core.grant(fake, scope, 'task', 'action', { expectedVersion: 1, expectedAuthEpoch: 0, expiresAt: 2000 }), 'UNAUTHORIZED');
  }
  for (const otherScope of [
    { ...scope, ownerId: 'other-owner' }, { ...scope, workspaceId: 'other-workspace' },
  ]) {
    code(() => f.core.grant(f.capability, otherScope, 'task', 'action', { expectedVersion: 1, expectedAuthEpoch: 0, expiresAt: 2000 }), 'UNAUTHORIZED');
    code(() => f.core.getTask(otherScope, 'task'), 'TASK_NOT_FOUND');
    code(() => f.core.exportTask(otherScope, 'task'), 'TASK_NOT_FOUND');
    assert.deepEqual(f.core.listTasks(otherScope), []);
    code(() => f.core.claim(otherScope, 'task', 'action', { expectedVersion: 1 }), 'TASK_NOT_FOUND');
    code(() => f.core.cancel(otherScope, 'task', { expectedVersion: 1 }), 'TASK_NOT_FOUND');
    code(() => f.core.transition(otherScope, 'task', { expectedVersion: 1, status: 'blocked', reason: 'fixture' }), 'TASK_NOT_FOUND');
    code(() => f.core.requestAction(otherScope, 'task', request('cross-action')), 'TASK_NOT_FOUND');
    code(() => f.core.revoke(f.capability, otherScope, 'task', 'action'), 'UNAUTHORIZED');
    code(() => f.core.deleteTask(f.capability, otherScope, 'task', { expectedVersion: 1 }), 'UNAUTHORIZED');
    code(() => f.core.settle(otherScope, 'task', 'action', { claimId: '00000000-0000-0000-0000-000000000000', outcome: 'completed', evidenceDigest }), 'TASK_NOT_FOUND');
  }
  code(() => f.core.claim(scope, 'task', 'action', { expectedVersion: 1 }), 'APPROVAL_INVALID');
  approve(f.core, f.capability, scope, 'task', 'action', 1, 2000);
  f.core.requestAction(scope, 'task', request('other-action'));
  approve(f.core, f.capability, scope, 'task', 'other-action', 1, 2000);
  code(() => f.core.claim(scope, 'task', 'action', { expectedVersion: 1 }), 'APPROVAL_INVALID');
  assert.equal(reserved(f.databasePath), 0);
  assert.equal(f.core.claim(scope, 'task', 'other-action', { expectedVersion: 1 }).action.state, 'dispatch_intent');
});

test('independent: each exact approval binding rejects a one-field store mismatch atomically', async t => {
  const mutations = [
    ['target_digest', digest('different-target')], ['data_digest', digest('different-data')],
    ['units', 2], ['kind', 'repair'], ['task_version', 2], ['auth_epoch', 0], ['revoked', 1],
  ];
  for (const [column, value] of mutations) await t.test(column, t => {
    const f = fixture(t);
    prepare(f.core, f.capability);
    // Controlled corruption of a synthetic grant checks every durable binding;
    // no application API permits these post-approval mutations.
    execute(f.databasePath, `UPDATE grants SET ${column}=?`, value);
    const before = f.core.exportTask(scope, 'task');
    code(() => f.core.claim(scope, 'task', 'action', { expectedVersion: 1 }), 'APPROVAL_INVALID');
    assert.deepEqual(f.core.exportTask(scope, 'task'), before);
    assert.equal(reserved(f.databasePath), 0);
  });
});

test('independent: revoked or superseded consent cannot re-grant authority by replaying an old response', t => {
  const f = fixture(t);
  f.core.intake(scope, ingress());
  f.core.requestAction(scope, 'task', request());
  const consent = Object.freeze({ expectedVersion: 1, expectedAuthEpoch: 0, expiresAt: 2000 });
  f.core.grant(f.capability, scope, 'task', 'action', consent);
  f.core.revoke(f.capability, scope, 'task', 'action');
  const afterRevoke = f.core.exportTask(scope, 'task');
  code(() => f.core.grant(f.capability, scope, 'task', 'action', consent), 'STALE_AUTHORITY');
  assert.deepEqual(f.core.exportTask(scope, 'task'), afterRevoke);
  code(() => f.core.claim(scope, 'task', 'action', { expectedVersion: 1 }), 'APPROVAL_INVALID');
  const fresh = { expectedVersion: 1, expectedAuthEpoch: 2, expiresAt: 2000 };
  f.core.grant(f.capability, scope, 'task', 'action', fresh);
  code(() => f.core.grant(f.capability, scope, 'task', 'action', fresh), 'STALE_AUTHORITY');
  code(() => f.core.grant(f.capability, scope, 'task', 'action', { expectedVersion: 1, expiresAt: 2000 }), 'INVALID_INPUT');
  assert.equal(f.core.claim(scope, 'task', 'action', { expectedVersion: 1 }).action.state, 'dispatch_intent');
});

test('independent: missing, asynchronous, uncertain and throwing host permission fails closed', async t => {
  for (const result of [false, undefined, null, 'true', Promise.resolve(true)]) await t.test(String(result), t => {
    const f = fixture(t, { hostPermission: () => result });
    prepare(f.core, f.capability);
    const before = f.core.exportTask(scope, 'task');
    code(() => f.core.claim(scope, 'task', 'action', { expectedVersion: 1 }), 'HOST_DENIED');
    assert.deepEqual(f.core.exportTask(scope, 'task'), before);
    assert.equal(reserved(f.databasePath), 0);
  });
  await t.test('throwing synthetic secret', t => {
    const f = fixture(t, { hostPermission: () => { throw new Error('sk_live_SYNTHETIC_PERMISSION_SECRET'); } });
    prepare(f.core, f.capability);
    code(() => f.core.claim(scope, 'task', 'action', { expectedVersion: 1 }), 'HOST_DENIED');
    assert.equal(reserved(f.databasePath), 0);
  });
});

test('independent: permission callback receives only immutable approved references and digests', t => {
  let actual;
  const f = fixture(t, { hostPermission: value => { actual = value; return true; } });
  prepare(f.core, f.capability);
  f.core.claim(scope, 'task', 'action', { expectedVersion: 1 });
  assert.deepEqual(Object.keys(actual).sort(), ['actionRef', 'authEpoch', 'dataDigest', 'kind', 'limits', 'ownerRef', 'targetDigest', 'taskRef', 'taskVersion', 'workspaceRef'].sort());
  assert.ok(Object.isFrozen(actual));
  assert.ok(Object.isFrozen(actual.limits));
  assert.equal(actual.ownerRef, digest(scope.ownerId));
  assert.equal(actual.workspaceRef, digest(scope.workspaceId));
  assert.equal(actual.taskRef, digest('task'));
  assert.equal(actual.actionRef, digest('action'));
});

test('independent: revoke/cancel ordering, unknown results and late evidence preserve reservations and authority', async t => {
  for (const operation of ['revoke', 'cancel']) await t.test(`${operation} before claim`, t => {
    const f = fixture(t);
    prepare(f.core, f.capability);
    if (operation === 'revoke') f.core.revoke(f.capability, scope, 'task', 'action');
    else f.core.cancel(scope, 'task', { expectedVersion: 1 });
    code(() => f.core.claim(scope, 'task', 'action', { expectedVersion: f.core.getTask(scope, 'task').version }), operation === 'revoke' ? 'APPROVAL_INVALID' : 'TASK_TERMINAL');
    assert.equal(reserved(f.databasePath), 0);
  });
  for (const operation of ['revoke', 'cancel']) await t.test(`${operation} after claim`, t => {
    const f = fixture(t, { limits: { maxActive: 1 } });
    prepare(f.core, f.capability);
    const claim = f.core.claim(scope, 'task', 'action', { expectedVersion: 1 });
    if (operation === 'revoke') f.core.revoke(f.capability, scope, 'task', 'action');
    else f.core.cancel(scope, 'task', { expectedVersion: claim.task.version });
    assert.equal(reserved(f.databasePath), 1);
    const epoch = f.core.getTask(scope, 'task').authEpoch;
    const unknown = f.core.settle(scope, 'task', 'action', { claimId: claim.claimId, outcome: 'unknown', evidenceDigest });
    assert.equal(unknown.reservationHeld, true);
    assert.equal(reserved(f.databasePath), 1);
    assert.equal(unknown.task.authEpoch, epoch);
    code(() => f.core.deleteTask(f.capability, scope, 'task', { expectedVersion: unknown.task.version }), 'RESERVATION_HELD');
    f.core.close();
    const reopened = new Foundation({ databasePath: f.databasePath, limits: { maxActive: 1 }, clock: () => 1500,
      hostPermission: () => true, trustedOperators: [{ scope, capability: f.capability }] });
    t.after(() => reopened.close());
    assert.equal(reserved(f.databasePath), 1);
    const final = reopened.settle(scope, 'task', 'action', { claimId: claim.claimId, outcome: 'completed', evidenceDigest });
    assert.equal(final.task.authEpoch, epoch);
    assert.notEqual(final.task.status, 'completed', 'newer revocation/cancellation cannot be erased by a late result');
    if (operation === 'cancel') assert.equal(final.task.status, 'cancel_requested');
    assert.equal(reserved(f.databasePath), 0, 'actual completion evidence can release the slot');
    code(() => reopened.settle(scope, 'task', 'action', { claimId: claim.claimId, outcome: 'completed', evidenceDigest }), 'STALE_CLAIM');
  });
});

test('independent: confirmed termination closes a cancel request; effect completion does not roll it back', t => {
  const f = fixture(t);
  prepare(f.core, f.capability);
  const claimed = f.core.claim(scope, 'task', 'action', { expectedVersion: 1 });
  f.core.cancel(scope, 'task', { expectedVersion: claimed.task.version });
  assert.equal(f.core.settle(scope, 'task', 'action', { claimId: claimed.claimId, outcome: 'terminated', evidenceDigest }).task.status, 'cancelled');
  assert.equal(reserved(f.databasePath), 0);
  code(() => f.core.transition(scope, 'task', { expectedVersion: 4, status: 'queued', reason: 'progress' }), 'TASK_TERMINAL');
});

test('independent: real concurrent processes serialize revoke/cancel versus dispatch without lost reservations', { timeout: 15000 }, async t => {
  for (const operation of ['revoke', 'cancel']) await t.test(operation, async t => {
    const f = fixture(t);
    prepare(f.core, f.capability);
    const authority = operation === 'revoke'
      ? `return core.revoke(capability,scope,'task','action');`
      : `try{return core.cancel(scope,'task',{expectedVersion:core.getTask(scope,'task').version});}
         catch(error){if(error.code!=='STALE_VERSION')throw error;return core.cancel(scope,'task',{expectedVersion:core.getTask(scope,'task').version});}`;
    const [claim, control] = await processRace(t, f.databasePath, [
      `return core.claim(scope,'task','action',{expectedVersion:1});`, authority,
    ]);
    assert.equal(control.accepted, true);
    const exported = f.core.exportTask(scope, 'task');
    assert.equal(exported.grants[0].revoked, 1);
    assert.equal(exported.task.authEpoch, 2);
    if (claim.accepted) {
      assert.equal(exported.actions[0].state, 'dispatch_intent');
      assert.equal(exported.actions[0].attempts, 1);
      assert.equal(reserved(f.databasePath), 1);
      assert.equal(exported.task.status, operation === 'cancel' ? 'cancel_requested' : 'running');
    } else {
      assert.ok(['APPROVAL_INVALID', 'STALE_VERSION', 'TASK_TERMINAL'].includes(claim.code), claim.code);
      assert.equal(exported.actions[0].state, 'requested');
      assert.equal(exported.actions[0].attempts, 0);
      assert.equal(reserved(f.databasePath), 0);
      assert.equal(exported.task.status, operation === 'cancel' ? 'cancelled' : 'queued');
    }
    f.core.close();
    const reopened = new Foundation({ databasePath: f.databasePath, clock: () => 1500 });
    t.after(() => reopened.close());
    assert.equal(reserved(f.databasePath), claim.accepted ? 1 : 0);
    if (claim.accepted) assert.equal(reopened.exportTask(scope, 'task').actions[0].state, 'unknown');
  });
});

test('independent: complete source identity deduplicates, distinct scopes/events remain independent and tombstones persist', t => {
  const f = fixture(t);
  const first = f.core.intake(scope, ingress('same-task', 'same-event'));
  assert.equal(first.deduplicated, false);
  assert.equal(f.core.intake(scope, ingress('renamed-task', 'same-event')).task.taskRef, first.task.taskRef);
  for (const [index, other] of [
    [{ ...scope, ownerId: 'other-owner' }, {}], [{ ...scope, workspaceId: 'other-workspace' }, {}],
    [scope, { provider: 'other-provider' }], [scope, { source: 'other-source' }], [scope, { eventId: 'other-event' }],
  ].entries()) {
    const [otherScope, fields] = other;
    assert.equal(f.core.intake(otherScope, ingress(`independent-${index}`, 'same-event', fields)).deduplicated, false);
  }
  f.core.deleteTask(f.capability, scope, 'same-task', { expectedVersion: 1 });
  f.core.close();
  const reopened = new Foundation({ databasePath: f.databasePath });
  t.after(() => reopened.close());
  const duplicate = reopened.intake(scope, ingress('new-task', 'same-event'));
  assert.equal(duplicate.deduplicated, true);
  assert.equal(duplicate.task.status, 'deleted');
  code(() => reopened.intake(scope, ingress('same-task', 'new-event')), 'TASK_EXISTS');
  assert.equal(reopened.exportTask(scope, 'same-task').deletionScope, 'local-ledger-tombstone');
});

test('independent: queue, total tombstone, action and history growth obey N-1/N/N+1', async t => {
  await t.test('queue capacity 2', t => {
    const f = fixture(t, { limits: { queueCapacity: 2 } });
    f.core.intake(scope, ingress('one'));
    assert.equal(f.core.listTasks(scope).length, 1);
    f.core.intake(scope, ingress('two'));
    assert.equal(f.core.listTasks(scope).length, 2);
    code(() => f.core.intake(scope, ingress('three')), 'QUEUE_FULL');
    assert.equal(f.core.intake(scope, ingress('one')).deduplicated, true, 'dedup requires no new queue capacity');
  });
  await t.test('tombstones count against maxTasks 2', t => {
    const f = fixture(t, { limits: { maxTasks: 2, queueCapacity: 2, maxActive: 1 } });
    f.core.intake(scope, ingress('one'));
    f.core.deleteTask(f.capability, scope, 'one', { expectedVersion: 1 });
    f.core.intake(scope, ingress('two'));
    f.core.deleteTask(f.capability, scope, 'two', { expectedVersion: 1 });
    code(() => f.core.intake(scope, ingress('three')), 'TASK_LIMIT');
    assert.equal(f.core.listTasks(scope).length, 2);
  });
  await t.test('actions capacity 2', t => {
    const f = fixture(t, { limits: { maxActionsPerTask: 2 } });
    f.core.intake(scope, ingress());
    f.core.requestAction(scope, 'task', request('one'));
    f.core.requestAction(scope, 'task', request('two'));
    code(() => f.core.requestAction(scope, 'task', request('three')), 'ACTION_LIMIT');
    assert.equal(f.core.exportTask(scope, 'task').actions.length, 2);
  });
  await t.test('history capacity 3 and grant rollback', t => {
    const f = fixture(t, { limits: { maxEventsPerTask: 3 } });
    prepare(f.core, f.capability);
    const before = f.core.exportTask(scope, 'task');
    code(() => f.core.revoke(f.capability, scope, 'task', 'action'), 'HISTORY_LIMIT');
    assert.deepEqual(f.core.exportTask(scope, 'task'), before, 'epoch/revocation must roll back with failed history append');
    code(() => f.core.claim(scope, 'task', 'action', { expectedVersion: 1 }), 'HISTORY_LIMIT');
    assert.equal(reserved(f.databasePath), 0, 'failed history append must roll back dispatch intent and reservation');
  });
});

test('independent: metadata byte size at N-1/N/N+1 is checked before any intake writes', async t => {
  for (const size of [511, 512, 513]) await t.test(`${size} UTF-8 bytes; limit=512`, t => {
    const f = fixture(t, { limits: { maxMetadataBytes: 512 } });
    const largeScope = { ownerId: 'o'.repeat(100), workspaceId: 'w'.repeat(100) };
    const input = ingress('t'.repeat(100), 'e', { provider: 'p'.repeat(50), source: 's' });
    const padding = size - Buffer.byteLength(JSON.stringify({ scope: largeScope, ...input }));
    input.source = 's'.repeat(1 + padding);
    assert.ok(input.source.length <= 128);
    assert.equal(Buffer.byteLength(JSON.stringify({ scope: largeScope, ...input })), size);
    if (size <= 512) assert.equal(f.core.intake(largeScope, input).deduplicated, false);
    else code(() => f.core.intake(largeScope, input), 'INPUT_TOO_LARGE');
    assert.equal(f.core.listTasks(largeScope).length, size <= 512 ? 1 : 0);
  });
});

test('independent: identifier and digest equivalence partitions enforce their exact length and alphabet boundaries', async t => {
  for (const length of [0, 1, 127, 128, 129]) await t.test(`identifier length ${length}`, t => {
    const f = fixture(t);
    const candidate = 'x'.repeat(length);
    if (length >= 1 && length <= 128) assert.equal(f.core.intake(scope, ingress(candidate)).task.taskRef, digest(candidate));
    else code(() => f.core.intake(scope, ingress(candidate)), 'INVALID_INPUT');
  });
  await t.test('all identifier positions reject forbidden or non-string values', t => {
    const f = fixture(t);
    for (const candidate of ['.leading-dot', 'line\nbreak', 'non-ascii-é', '', null, 1, {}]) {
      for (const field of ['taskId', 'provider', 'source', 'eventId']) code(() => f.core.intake(scope, ingress('task', 'event', { [field]: candidate })), 'INVALID_INPUT');
      for (const field of ['ownerId', 'workspaceId']) code(() => f.core.intake({ ...scope, [field]: candidate }, ingress()), 'INVALID_INPUT');
    }
    assert.equal(f.core.listTasks(scope).length, 0);
  });
  await t.test('target/data digest 63/64/65 and canonical lowercase hex', t => {
    const f = fixture(t);
    f.core.intake(scope, ingress());
    for (const field of ['targetDigest', 'dataDigest']) for (const value of ['a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), 'A'.repeat(64), null, 64]) {
      code(() => f.core.requestAction(scope, 'task', request('invalid-action', 1, { [field]: value })), 'INVALID_INPUT');
    }
    assert.equal(f.core.requestAction(scope, 'task', request('valid-action', 1, { targetDigest: 'a'.repeat(64), dataDigest: 'b'.repeat(64) })).state, 'requested');
    for (const units of [0, -1, 1.5, 3, NaN, Infinity, '1', null]) code(() => f.core.requestAction(scope, 'task', request('invalid-units', 1, { limits: { units } })), 'INVALID_INPUT');
    assert.equal(f.core.exportTask(scope, 'task').actions.length, 1);
  });
});

test('independent: hard history limits reserve capacity for cancellation/recovery/evidence and reject excess dispatch', async t => {
  await t.test('capacity 8 refuses dispatch with insufficient revocation/recovery capacity', t => {
    const f = fixture(t, { limits: { maxEventsPerTask: 8 } });
    prepare(f.core, f.capability);
    const before = f.core.exportTask(scope, 'task');
    code(() => f.core.claim(scope, 'task', 'action', { expectedVersion: 1 }), 'HISTORY_LIMIT');
    assert.deepEqual(f.core.exportTask(scope, 'task'), before);
    assert.equal(reserved(f.databasePath), 0);
  });
  await t.test('capacity 9 preserves revocation and reconciles admitted work within the cap', t => {
    const f = fixture(t, { limits: { maxEventsPerTask: 9 } });
    prepare(f.core, f.capability);
    const claim = f.core.claim(scope, 'task', 'action', { expectedVersion: 1 });
    const before = f.core.exportTask(scope, 'task');
    assert.equal(before.history.length, 4);
    f.core.revoke(f.capability, scope, 'task', 'action');
    const revoked = f.core.exportTask(scope, 'task');
    assert.equal(revoked.task.authEpoch, 2);
    assert.equal(revoked.history.length, 5);
    for (let repeat = 0; repeat < 10; repeat++) f.core.revoke(f.capability, scope, 'task', 'action');
    assert.deepEqual(f.core.exportTask(scope, 'task'), revoked, 'repeated revocation is idempotent and cannot consume recovery capacity');
    f.core.cancel(scope, 'task', { expectedVersion: 2 });
    f.core.close();
    const reopened = new Foundation({ databasePath: f.databasePath, limits: { maxEventsPerTask: 9 }, clock: () => 1500 });
    t.after(() => reopened.close());
    const recovered = reopened.exportTask(scope, 'task');
    assert.equal(recovered.history.length, 7);
    assert.equal(recovered.task.status, 'cancel_requested');
    assert.equal(reserved(f.databasePath), 1);
    for (let repeat = 0; repeat < 10; repeat++) {
      reopened.settle(scope, 'task', 'action', { claimId: claim.claimId, outcome: 'unknown', evidenceDigest: digest(`uncertain-${repeat}`) });
      reopened.recover();
      reopened.cancel(scope, 'task', { expectedVersion: recovered.task.version });
    }
    assert.deepEqual(reopened.exportTask(scope, 'task'), recovered, 'repeated uncertainty does not consume protected history or overwrite evidence');
    reopened.settle(scope, 'task', 'action', { claimId: claim.claimId, outcome: 'completed', evidenceDigest });
    assert.equal(reserved(f.databasePath), 0);
    reopened.transition(scope, 'task', { expectedVersion: recovered.task.version, status: 'cancelled', reason: 'operator' });
    const final = reopened.exportTask(scope, 'task');
    assert.equal(final.history.length, 9);
    assert.equal(final.task.status, 'cancelled');
    assert.equal(final.actions[0].state, 'completed', 'the completed effect remains a separate fact');
  });
});

test('independent: review/repair kinds consume common active units and each kind attempt budget', t => {
  const f = fixture(t, { limits: { maxActive: 2, maxAttempts: 2 } });
  prepare(f.core, f.capability, 'review-task', 'review-action', 2000, { kind: 'review', limits: { units: 2 } });
  const review = f.core.claim(scope, 'review-task', 'review-action', { expectedVersion: 1 });
  prepare(f.core, f.capability, 'repair-task', 'repair-action', 2000, { kind: 'repair' });
  code(() => f.core.claim(scope, 'repair-task', 'repair-action', { expectedVersion: 1 }), 'ACTIVE_FULL');
  f.core.revoke(f.capability, scope, 'review-task', 'review-action');
  f.core.settle(scope, 'review-task', 'review-action', { claimId: review.claimId, outcome: 'failed', evidenceDigest });
  approve(f.core, f.capability, scope, 'review-task', 'review-action', 2, 2000);
  const second = f.core.claim(scope, 'review-task', 'review-action', { expectedVersion: 2 });
  f.core.revoke(f.capability, scope, 'review-task', 'review-action');
  f.core.settle(scope, 'review-task', 'review-action', { claimId: second.claimId, outcome: 'terminated', evidenceDigest });
  approve(f.core, f.capability, scope, 'review-task', 'review-action', 3, 2000);
  code(() => f.core.claim(scope, 'review-task', 'review-action', { expectedVersion: 3 }), 'ATTEMPT_LIMIT');
  assert.equal(reserved(f.databasePath), 0);
  assert.equal(f.core.claim(scope, 'repair-task', 'repair-action', { expectedVersion: 1 }).action.kind, 'repair');
});

test('independent: raw token-shaped identifiers and injected errors never reach DB/export/diagnostics', async t => {
  const canary = 'sk_live_SYNTHETIC_SECRET_0123456789';
  const secretScope = { ownerId: `${canary}_owner`, workspaceId: `${canary}_workspace` };
  const capability = {};
  const f = fixture(t, { fixtureMode: true, trustedOperators: [{ scope: secretScope, capability }] });
  const taskId = `${canary}_task`, actionId = `${canary}_action`;
  f.core.intake(secretScope, { taskId, provider: `${canary}_provider`, source: `${canary}_source`, eventId: `${canary}_event` });
  f.core.requestAction(secretScope, taskId, request(actionId));
  approve(f.core, capability, secretScope, taskId, actionId, 1, 2000);
  const actual = await f.core.dispatchFixture(secretScope, taskId, actionId, { expectedVersion: 1 }, () => { throw new Error(canary); });
  assert.equal(actual.action.state, 'unknown');
  const outputs = [actual, f.core.exportTask(secretScope, taskId), f.core.diagnostics()];
  for (const fn of [
    () => f.core.intake(secretScope, { ...ingress(), rawPayload: canary }),
    () => f.core.requestAction(secretScope, taskId, { ...request('bad'), credential: canary }),
    () => f.core.transition(secretScope, taskId, { expectedVersion: 3, status: 'blocked', reason: canary }),
  ]) {
    try { fn(); assert.fail('untrusted secret field was accepted'); } catch (error) {
      assert.ok(error instanceof FoundationError);
      outputs.push({ name: error.name, code: error.code, message: error.message });
    }
  }
  assert.equal(JSON.stringify(outputs).includes(canary), false);
  f.core.close();
  for (const name of readdirSync(f.directory)) assert.equal(readFileSync(join(f.directory, name)).includes(Buffer.from(canary)), false, name);
});

test('independent: accessors, proxies, symbols and hidden fields reject without executing untrusted getters', t => {
  const f = fixture(t);
  f.core.intake(scope, ingress());
  let getterCalls = 0;
  const accessorScope = Object.defineProperty({ workspaceId: scope.workspaceId }, 'ownerId', {
    enumerable: true, get() { getterCalls++; throw new Error('sk_live_SYNTHETIC_GETTER_SECRET'); },
  });
  for (const fn of [
    () => f.core.getTask(accessorScope, 'task'),
    () => f.core.intake(accessorScope, ingress('new-task')),
    () => f.core.listTasks(new Proxy(scope, { get() { getterCalls++; throw new Error('synthetic-proxy-secret'); } })),
    () => f.core.cancel(scope, 'task', { expectedVersion: 1, [Symbol('synthetic-secret')]: true }),
    () => f.core.cancel(scope, 'task', Object.defineProperty({ expectedVersion: 1 }, 'rawPayload', { value: 'synthetic-secret' })),
  ]) code(fn, 'INVALID_INPUT');
  assert.equal(getterCalls, 0, 'rejected records must not invoke getters or proxy traps');
  const before = readdirSync(f.directory);
  for (const options of [
    { databasePath: join(f.directory, 'invalid.sqlite'), rawPayload: 'synthetic-secret' },
    Object.defineProperty({}, 'databasePath', { enumerable: true, get() { getterCalls++; throw new Error('synthetic-secret'); } }),
    { databasePath: join(f.directory, 'invalid.sqlite'), limits: { maxActive: 1, [Symbol('synthetic-secret')]: 1 } },
  ]) code(() => new Foundation(options), 'INVALID_INPUT');
  assert.equal(getterCalls, 0);
  assert.deepEqual(readdirSync(f.directory), before, 'invalid constructor must not create a store');
});

test('independent: immutable limits and private authority cannot be overwritten through instance fields', async t => {
  const f = fixture(t, { hostPermission: () => false });
  prepare(f.core, f.capability);
  assert.throws(() => { f.core.limits = { maxActive: 999 }; }, TypeError);
  f.core.hostPermission = () => true;
  f.core.operators = new WeakMap([[{}, `${digest(scope.ownerId)}:${digest(scope.workspaceId)}`]]);
  f.core.fixtureMode = true;
  code(() => f.core.claim(scope, 'task', 'action', { expectedVersion: 1 }), 'HOST_DENIED');
  await assert.rejects(f.core.dispatchFixture(scope, 'task', 'action', { expectedVersion: 1 }, () => ({ outcome: 'completed', evidenceDigest })), { code: 'FIXTURE_DISABLED', message: 'FIXTURE_DISABLED' });
});

test('independent: migration failure, incomplete/future schema and backup collision preserve source bytes', async t => {
  for (const scenario of ['migration-failure', 'incomplete', 'future', 'backup-collision', 'orphan-foreign-key', 'invalid-row']) await t.test(scenario, t => {
    const directory = mkdtempSync(join(tmpdir(), 'bubbles-independent-schema-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const databasePath = join(directory, 'ledger.sqlite');
    const db = new DatabaseSync(databasePath);
    db.exec(legacySchemaSql);
    if (scenario === 'orphan-foreign-key') db.exec('PRAGMA foreign_keys=OFF');
    if (scenario === 'incomplete') db.exec('DROP TABLE events');
    if (scenario === 'future') db.exec('PRAGMA user_version=3');
    if (scenario === 'orphan-foreign-key') db.prepare('INSERT INTO ingress VALUES(?,?,?,?,?,?,?)').run(digest(scope.ownerId), digest(scope.workspaceId), digest('provider'), digest('source'), digest('event'), digest('missing-task'), 1000);
    if (scenario === 'invalid-row') db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?)').run(digest(scope.ownerId), digest(scope.workspaceId), digest('task'), 'unrecognized-state', 1, 0, 1000, 1000);
    db.close();
    if (scenario === 'backup-collision') {
      const backup = new DatabaseSync(`${databasePath}.schema-1.backup`);
      backup.exec('PRAGMA user_version=9');
      backup.close();
    }
    const original = readFileSync(databasePath);
    const priorBackup = existsSync(`${databasePath}.schema-1.backup`) ? readFileSync(`${databasePath}.schema-1.backup`) : null;
    code(() => new Foundation({ databasePath, fixtureMode: true,
      ...(scenario === 'migration-failure' ? { migrationFault: () => { throw new Error('synthetic-migration-secret'); } } : {}),
    }), scenario === 'future' ? 'SCHEMA_FUTURE' : scenario === 'incomplete' ? 'SCHEMA_UNSUPPORTED' : ['orphan-foreign-key', 'invalid-row'].includes(scenario) ? 'STORAGE_INVALID' : 'STORAGE_UNAVAILABLE');
    assert.deepEqual(readFileSync(databasePath), original);
    if (scenario === 'migration-failure') {
      assert.deepEqual(readFileSync(`${databasePath}.schema-1.backup`), original);
      assert.equal(sql(`${databasePath}.schema-1.backup`, 'PRAGMA integrity_check')[0].integrity_check, 'ok');
      assert.equal(sql(`${databasePath}.schema-1.backup`, 'PRAGMA user_version')[0].user_version, 1);
    }
    if (priorBackup) assert.deepEqual(readFileSync(`${databasePath}.schema-1.backup`), priorBackup);
    if (['orphan-foreign-key', 'invalid-row'].includes(scenario)) assert.equal(existsSync(`${databasePath}.schema-1.backup`), false, 'invalid source is rejected before backup or mutation');
  });
});

test('independent: supported schema1 migration preserves actual acknowledged task/history/provenance in a recoverable backup', t => {
  const directory = mkdtempSync(join(tmpdir(), 'bubbles-independent-migration-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const databasePath = join(directory, 'legacy.sqlite');
  const db = new DatabaseSync(databasePath);
  const keys = [digest(scope.ownerId), digest(scope.workspaceId), digest('task')];
  db.exec(legacySchemaSql);
  db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?)').run(...keys, 'queued', 1, 0, 1000, 1000);
  db.prepare('INSERT INTO ingress VALUES(?,?,?,?,?,?,?)').run(...keys.slice(0, 2), digest('fixture'), digest('independent-source'), digest('event'), keys[2], 1000);
  db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?,?,?)').run(...keys, 1, 1, 'queued', 'intake', 1000);
  db.close();
  const original = readFileSync(databasePath);
  const migrated = new Foundation({ databasePath, clock: () => 1500 });
  t.after(() => migrated.close());
  const exported = migrated.exportTask(scope, 'task');
  assert.equal(exported.schemaVersion, 2);
  assert.equal(exported.task.version, 1);
  assert.equal(exported.task.status, 'queued');
  assert.equal(exported.ingress[0].eventRef, digest('event'));
  assert.deepEqual(exported.history.map(row => ({ ...row })), [{ sequence: 1, version: 1, status: 'queued', reason: 'intake', at: 1000 }]);
  const backupPath = `${databasePath}.schema-1.backup`;
  assert.deepEqual(readFileSync(backupPath), original);
  assert.equal(sql(backupPath, 'PRAGMA integrity_check')[0].integrity_check, 'ok');
  assert.equal(sql(backupPath, 'PRAGMA user_version')[0].user_version, 1);
  assert.equal(sql(backupPath, 'SELECT count(*) AS count FROM tasks')[0].count, 1);
});

test('independent: stale versions and terminal progress preserve authoritative history', t => {
  const f = fixture(t);
  f.core.intake(scope, ingress());
  const blocked = f.core.transition(scope, 'task', { expectedVersion: 1, status: 'blocked', reason: 'fixture' });
  assert.equal(blocked.version, 2);
  const before = f.core.exportTask(scope, 'task');
  for (const expectedVersion of [1, 3]) code(() => f.core.transition(scope, 'task', { expectedVersion, status: 'queued', reason: 'progress' }), 'STALE_VERSION');
  assert.deepEqual(f.core.exportTask(scope, 'task'), before);
  f.core.transition(scope, 'task', { expectedVersion: 2, status: 'failed', reason: 'fixture' });
  const terminal = f.core.exportTask(scope, 'task');
  code(() => f.core.transition(scope, 'task', { expectedVersion: 3, status: 'queued', reason: 'progress' }), 'TASK_TERMINAL');
  assert.deepEqual(f.core.exportTask(scope, 'task'), terminal);
});

test('independent: clock exceptions/nonfinite time fail closed with stable codes', t => {
  const f = fixture(t);
  for (const clock of [() => { throw new Error('sk_live_SYNTHETIC_CLOCK_SECRET'); }, () => NaN, () => Infinity, () => -1, () => Promise.resolve(1000)]) {
    code(() => new Foundation({ databasePath: f.databasePath, clock }), 'CLOCK_UNAVAILABLE');
  }
  assert.equal(f.core.listTasks(scope).length, 0);
});

// Open the contender before acquiring the lock; constructor recovery must not
// account for the delay being tested. IPC is only a barrier, not a storage mock.
test('independent: grant expiry is rechecked after acquiring a real contended SQLite transaction', { timeout: 10000 }, async t => {
  const f = fixture(t, { clock: Date.now });
  prepare(f.core, f.capability, 'task', 'action', Date.now() + 60000);
  const source = `
    import { Foundation } from ${JSON.stringify(moduleUrl)};
    const core = new Foundation({ databasePath: process.argv[1], hostPermission: () => true });
    process.send({ ready: true });
    process.on('message', message => {
      if (message !== 'claim') return;
      process.send({ started: Date.now() });
      let result;
      try { core.claim(${JSON.stringify(scope)}, 'task', 'action', { expectedVersion: 1 }); result = { accepted: true }; }
      catch (error) { result = { accepted: false, code: error.code }; }
      core.close(); process.send(result); process.disconnect();
    });
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source, f.databasePath], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  t.after(() => child.kill());
  let stderr = '';
  child.stderr.on('data', data => { stderr += data; });
  const message = () => new Promise((resolve, reject) => {
    const received = value => { cleanup(); resolve(value); };
    const exited = exitCode => { cleanup(); reject(new Error(`contender exited ${exitCode}: ${stderr}`)); };
    const cleanup = () => { child.off('message', received); child.off('exit', exited); };
    child.once('message', received); child.once('exit', exited);
  });
  assert.deepEqual(await message(), { ready: true });
  const expiresAt = Date.now() + 400;
  approve(f.core, f.capability, scope, 'task', 'action', 1, expiresAt);
  const blocker = new DatabaseSync(f.databasePath);
  t.after(() => { try { blocker.close(); } catch {} });
  blocker.exec('BEGIN IMMEDIATE');
  const started = message();
  child.send('claim');
  const start = await started;
  assert.ok(start.started < expiresAt, 'contender starts with an unexpired grant');
  const finished = message();
  await new Promise(resolve => setTimeout(resolve, Math.max(1, expiresAt - Date.now() + 80)));
  blocker.exec('COMMIT');
  const actual = await finished;
  assert.deepEqual(actual, { accepted: false, code: 'APPROVAL_INVALID' });
  assert.equal(reserved(f.databasePath), 0);
  assert.equal(f.core.getTask(scope, 'task').status, 'queued');
});

test('independent: actual public Cordis rejects malicious identity adapters and keeps uncertainty through ten reloads', { timeout: 30000 }, () => {
  const desktopRoot = '/Applications/DSH Desktop.app/Contents/Resources/app';
  const indexUrl = new URL('../src/index.mjs', import.meta.url).href;
  const source = `
    import assert from 'node:assert/strict';
    import { mkdtempSync, rmSync, existsSync } from 'node:fs';
    import { tmpdir } from 'node:os';
    import { join } from 'node:path';
    import { createPlugin } from ${JSON.stringify(indexUrl)};
    import { Foundation } from ${JSON.stringify(moduleUrl)};
    const { Context } = await import(${JSON.stringify(pathToFileURL(`${desktopRoot}/node_modules/@deepseek-ai/cordis/lib/index.js`).href)});
    const { default: SessionStore } = await import(${JSON.stringify(pathToFileURL(`${desktopRoot}/node_modules/@deepseek-ai/dsh-session/lib/index.js`).href)});
    const { default: ApprovalService } = await import(${JSON.stringify(pathToFileURL(`${desktopRoot}/node_modules/@deepseek-ai/dsh-user-approval/lib/index.js`).href)});
    const directory = mkdtempSync(join(tmpdir(), 'bubbles-independent-host-'));
    const ctx = new Context();
    ctx.logger.exporters.clear?.();
    const scope = ${JSON.stringify(scope)};
    try {
      await ctx.plugin(SessionStore); await ctx.plugin(ApprovalService, { policy: 'never' });
      let invalidIndex = 0;
      for (const identity of [() => undefined, () => { throw Error('synthetic-identity-secret'); }, async () => scope,
        () => ({ ...scope, verified: true }), () => Object.defineProperty({ workspaceId: 'w' }, 'ownerId', { get() { throw Error('synthetic-getter-secret'); } })]) {
        const databasePath = join(directory, 'denied-' + invalidIndex++ + '.sqlite');
        const fiber = ctx.plugin(createPlugin({ identity }), { databasePath });
        await assert.rejects(async () => { await fiber; }, error => {
          assert.equal(error.message.includes('synthetic-identity-secret'), false);
          assert.equal(error.message.includes('synthetic-getter-secret'), false);
          return /IDENTITY_UNAVAILABLE/.test(error.message);
        });
        assert.equal(ctx.bubbles, undefined);
        assert.equal(existsSync(databasePath), false);
        await fiber.dispose();
      }
      const databasePath = join(directory, 'uncertain.sqlite'), capability = {};
      const core = new Foundation({ databasePath, hostPermission: () => true, trustedOperators: [{ scope, capability }], limits: { maxActive: 1 } });
      core.intake(scope, ${JSON.stringify(ingress())});
      core.requestAction(scope, 'task', ${JSON.stringify(request())});
      core.grant(capability, scope, 'task', 'action', { expectedVersion: 1, expectedAuthEpoch: 0, expiresAt: Date.now() + 60000 });
      core.claim(scope, 'task', 'action', { expectedVersion: 1 }); core.close();
      const baseline = ctx.registry.size;
      for (let cycle = 0; cycle < 10; cycle++) {
        const mutableScope = { ...scope };
        let identityCalls = 0;
        const fiber = ctx.plugin(createPlugin({ identity: () => { identityCalls++; return mutableScope; } }), { databasePath, limits: { maxActive: 1 } });
        await fiber;
        const held = ctx.bubbles;
        mutableScope.ownerId = 'changed-owner'; mutableScope.workspaceId = 'changed-workspace';
        assert.equal(held.getTask('task').status, 'recovery_required');
        assert.equal(held.exportTask('task').actions[0].state, 'unknown');
        assert.equal(held.exportTask('task').actions[0].attempts, 1);
        for (const field of ['ownerId','workspaceId','scope','principal','verified','isOwner']) {
          assert.throws(() => held.intake({ ...${JSON.stringify(ingress())}, [field]: 'synthetic-forged-identity' }), { code: 'INPUT_INVALID' });
        }
        assert.equal(held.grant, undefined); assert.equal(held.revoke, undefined); assert.equal(held.foundation, undefined);
        assert.throws(() => held.deleteTask('task', { expectedVersion: held.getTask('task').version }), { code: 'OPERATOR_UNAVAILABLE' });
        assert.equal(identityCalls, 1, 'activation identity is validated and copied once');
        assert.equal(ctx.sessions.list().length, 0);
        await fiber.dispose();
        for (const fn of Object.values(held)) assert.throws(() => fn(), { code: 'SERVICE_DISPOSED' });
        assert.equal(ctx.bubbles, undefined); assert.equal(ctx.registry.size, baseline);
      }
      const reopened = new Foundation({ databasePath, hostPermission: () => true, trustedOperators: [{ scope, capability }], limits: { maxActive: 1 } });
      try {
        reopened.intake(scope, ${JSON.stringify(ingress('second'))});
        reopened.requestAction(scope, 'second', ${JSON.stringify(request('second-action'))});
        reopened.grant(capability, scope, 'second', 'second-action', { expectedVersion: 1, expectedAuthEpoch: 0, expiresAt: Date.now() + 60000 });
        assert.throws(() => reopened.claim(scope, 'second', 'second-action', { expectedVersion: 1 }), { code: 'ACTIVE_FULL' });
      } finally { reopened.close(); }
      console.log(JSON.stringify({ passed: true, reloads: 10, heldReservations: 1, inferenceCalls: 0 }));
    } finally { await ctx.fiber.dispose(); rmSync(directory, { recursive: true, force: true }); }
  `;
  const result = spawnSync(`${desktopRoot}/node_modules/node/bin/node`, ['--input-type=module', '-e', source], { encoding: 'utf8', timeout: 25000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.deepEqual(JSON.parse(result.stdout.trim().split('\n').at(-1)), { passed: true, reloads: 10, heldReservations: 1, inferenceCalls: 0 });
});
