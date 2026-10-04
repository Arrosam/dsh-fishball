import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { normalizeMessage, contentDigest, fields, DomainError } from '../src/messages.mjs';
const ref = s => createHash('sha256').update(s).digest('hex');
const endpoint = s => ({ sessionRef: ref(s), generationRef: ref(`${s}-generation`) });
const sender = endpoint('sender'), receiver = endpoint('receiver');
const input = more => ({ taskRef: ref('task'), commandRef: ref('command'), expectedTaskVersion: 1, expectedAuthEpoch: 0, messageRef: ref('message'), receiver, bodyRecordRef: ref('body-record'), bodyDigest: ref('body'), byteLength: 20, sourceRef: ref('source'), eventRef: ref('event'), category: 'status', purposeRef: ref('purpose'), hopLimit: 2, dedupMode: 'unique_id', ...more });
const rejects = (fn, code) => assert.throws(fn, error => error instanceof DomainError && error.code === code && error.message === code);

test('broker normalization is immutable and complete; property order does not change intent', () => {
 const a = normalizeMessage(sender, input());
 assert.ok(Object.isFrozen(a) && Object.isFrozen(a.route.visitedGenerationRefs));
 assert.equal(contentDigest(a), contentDigest(Object.fromEntries(Object.entries(a).reverse())));
 assert.notEqual(contentDigest(a), contentDigest(normalizeMessage(sender, input({ bodyDigest: ref('changed') }))));
 assert.notEqual(contentDigest(a), contentDigest(normalizeMessage(sender, input({ receiver: endpoint('reused') }))));
});
test('bounded relay preserves original source and purpose; rejects tamper, loop and unseen parent', () => {
 const prior = { ...normalizeMessage(sender, input()), state: 'consumed' };
 const nextInput = input({ messageRef: ref('second'), receiver: endpoint('third'), forwardOf: prior.messageRef });
 const second = normalizeMessage(receiver, nextInput, prior);
 assert.deepEqual(second.route.originalSender, sender); assert.equal(second.route.originalPurposeRef, prior.purposeRef);
 assert.equal(second.route.hopCount, 1); assert.deepEqual(second.route.visitedGenerationRefs, [sender.generationRef, receiver.generationRef]);
 rejects(() => normalizeMessage(receiver, { ...nextInput, purposeRef: ref('tampered') }, prior), 'ORIGIN_CONFLICT');
 rejects(() => normalizeMessage(receiver, { ...nextInput, sourceRef: ref('tampered') }, prior), 'ORIGIN_CONFLICT');
 rejects(() => normalizeMessage(receiver, { ...nextInput, receiver: sender }, prior), 'ROUTE_LOOP');
 rejects(() => normalizeMessage(receiver, nextInput, { ...prior, state: 'sent' }), 'FORWARD_NOT_CONSUMED');
 rejects(() => normalizeMessage(receiver, nextInput), 'FORWARD_NOT_FOUND');
});
test('hop and byte ceilings are exact boundaries with no payload flag authority', () => {
 assert.equal(normalizeMessage(sender, input({ byteLength: 65536, hopLimit: 8 })).byteLength, 65536);
 rejects(() => normalizeMessage(sender, input({ byteLength: 65537 })), 'INVALID_INPUT');
 rejects(() => normalizeMessage(sender, input({ hopLimit: 9 })), 'INVALID_INPUT');
 rejects(() => normalizeMessage(sender, input({ approved: true })), 'INVALID_INPUT');
 rejects(() => normalizeMessage(sender, input({ sourceRef: 'sk_synthetic_canary' })), 'INVALID_INPUT');
});
test('session identifier reuse cannot match an earlier receiver generation', () => {
 const prior = { ...normalizeMessage(sender, input()), state: 'consumed' };
 rejects(() => normalizeMessage({ ...receiver, generationRef: ref('new-generation') }, input({ forwardOf: prior.messageRef, receiver: endpoint('third') }), prior), 'FORWARD_NOT_CONSUMED');
});
test('accessors, proxies, symbol/hidden fields and sparse routes fail without executing callbacks', () => {
 let invoked = 0; const evil = input(); Object.defineProperty(evil, 'category', { enumerable: true, get() { invoked++; return 'status'; } });
 rejects(() => normalizeMessage(sender, evil), 'INVALID_INPUT'); assert.equal(invoked, 0);
 const proxied = new Proxy({}, { ownKeys() { invoked++; return []; } });
 rejects(() => fields(proxied, []), 'INVALID_INPUT'); assert.equal(invoked, 0);
 const symbol = input(); symbol[Symbol('approved')] = true; rejects(() => normalizeMessage(sender, symbol), 'INVALID_INPUT');
 const hidden = input(); Object.defineProperty(hidden, 'role', { value: 'owner' }); rejects(() => normalizeMessage(sender, hidden), 'INVALID_INPUT');
 const sparse = new Array(2); rejects(() => contentDigest(sparse), 'INVALID_INPUT');
});

import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RuntimeStore, reference } from '../src/runtime-store.mjs';
import { MessageBroker } from '../src/messages.mjs';
function fixture(t, transport) {
 const dir = mkdtempSync(join(tmpdir(), 'df-messages-')), databasePath = join(dir, 'ledger.db');
 const owner = {}, host = {}, recipient = {}, other = {}, taskRef = reference('task'); let now = 1000;
 const principals = [{ handle: owner, role: 'owner', scope: { ownerId: 'owner', workspaceId: 'workspace' }, sessionRef: ref('main-session'), generationRef: ref('main-generation') }, { handle: host, role: 'host', scope: { ownerId: 'owner', workspaceId: 'workspace' } }, { handle: recipient, role: 'worker', scope: { ownerId: 'owner', workspaceId: 'workspace' }, taskRef, sessionRef: receiver.sessionRef, generationRef: receiver.generationRef }, { handle: other, role: 'owner', scope: { ownerId: 'other', workspaceId: 'workspace' }, sessionRef: ref('other-session'), generationRef: ref('other-generation') }];
 const options = { databasePath, encryptionKey: Buffer.alloc(32, 7), principals, clock: () => now, hostPermission: () => true, forbiddenSecrets: ['sk_synthetic_canary'], limits: { maxActive: 8 } };
 let store = new RuntimeStore(options);
 t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
 store.intake(owner, { taskId: 'task', provider: 'mock', source: 'source', eventId: 'event', commandRef: ref('intake') });
 store.policy(owner, { commandRef: ref('policy'), expectedVersion: 1, limits: {}, modelPolicy: { version: 1, presetRefs: [ref('preset')], catalogEvidenceRef: ref('catalog') } });
 const task = () => store.task(owner, taskRef);
 const bind = command => ({ taskRef, commandRef: ref(command), expectedTaskVersion: task().version, expectedAuthEpoch: task().authEpoch });
 const body = store.putData(owner, { ...bind('body'), kind: 'message', content: 'synthetic bounded message', sourceRef: ref('source') });
 const broker = () => new MessageBroker(store, { hostHandle: host, transport });
 const acceptInput = more => ({ ...bind('accept'), messageRef: ref('message'), recipientHandle: recipient, bodyRecordRef: body.recordRef, bodyDigest: body.digest, byteLength: body.byteLength, sourceRef: ref('source'), eventRef: ref('event'), category: 'status', purposeRef: ref('purpose'), hopLimit: 2, dedupMode: 'unique_id', ...more });
 function approve(record, tag = 'action') {
  const spec = { actionRef: ref(tag), kind: 'write', role: 'worker', targetDigest: record.targetDigest, dataDigest: record.bodyDigest, units: 1, charges: { runtimeMs: 0, usageUnits: 0, costEstimateMicros: 0 }, attemptGroupRef: ref(tag), attemptIndex: 1, resourcePolicyVersion: 2, modelPolicyVersion: 1, model: { presetRef: ref('preset'), modelRef: ref('model'), reasoningRef: ref('reasoning'), catalogEvidenceRef: ref('catalog') }, executor: { mode: 'none', generationRef: ref(`${tag}-executor`), environmentRef: ref('environment'), bindingDigest: ref('binding'), toolsDigest: ref('tools'), permissionPolicyDigest: ref('permissions') } };
  const action = store.planAction(owner, { ...bind(`${tag}-plan`), spec });
  store.grantAction(owner, { ...bind(`${tag}-grant`), actionRef: action.actionRef, actionDigest: action.actionDigest, expiresAt: 2000 });
  return { ...bind(`${tag}-dispatch`), messageRef: record.messageRef, actionRef: action.actionRef, actionDigest: action.actionDigest };
 }
 return { get store() { return store; }, owner, host, recipient, other, taskRef, databasePath, task, bind, body, broker, acceptInput, approve, setTime(value) { now = value; }, reopen() { store.close(); store = new RuntimeStore(options); return store; } };
}
function receipt(record, state) { return { messageRef: record.messageRef, bodyDigest: record.bodyDigest, recipientSessionRef: record.immutableMetadata.recipientSessionRef, recipientGenerationRef: record.immutableMetadata.recipientGenerationRef, state, evidenceRef: ref(`receipt-${state}`) }; }

test('real ledger outbox is exact and atomic; accepted, sent and consumed remain separate', async t => {
 let sends = 0, queries = 0;
 const x = fixture(t, { async send(record, body) { sends++; assert.equal(body.kind, 'message'); assert.equal(body.digest, record.bodyDigest); return receipt(record, 'sent'); }, async query(record) { queries++; return receipt(record, 'consumed'); } });
 const broker = x.broker(), accepted = broker.accept(x.owner, x.acceptInput()); assert.equal(accepted.state, 'accepted'); assert.equal(accepted.claimRef, null);
 assert.equal(x.store.snapshot(x.owner, { taskRef: x.taskRef }).actions.length, 0);
 const command = x.approve(accepted), sent = await broker.dispatch(x.owner, command); assert.equal(sent.message.state, 'sent'); assert.equal(sends, 1);
 assert.ok(sent.message.claimRef && sent.message.reservationRef);
 const repeated = await broker.dispatch(x.owner, command); assert.equal(repeated.dispatched, false); assert.equal(sends, 1);
 assert.equal((await broker.reconcile(x.owner, { taskRef: x.taskRef, messageRef: accepted.messageRef })).state, 'consumed'); assert.equal(queries, 1);
 assert.equal(x.task().status, 'running');
});
test('effect then timeout survives reopen unknown and never blindly resends; cancellation preserves held obligations', async t => {
 let effects = 0;
 const x = fixture(t, { async send() { effects++; throw new Error('sk_synthetic_canary'); }, async query(record) { return receipt(record, 'unknown'); } });
 const accepted = x.broker().accept(x.owner, x.acceptInput()), command = x.approve(accepted);
 assert.equal((await x.broker().dispatch(x.owner, command)).message.state, 'unknown'); assert.equal(effects, 1);
 x.reopen(); assert.equal(x.broker().read(x.owner, x.taskRef, accepted.messageRef).state, 'unknown');
 assert.equal((await x.broker().dispatch(x.owner, command)).dispatched, false); assert.equal(effects, 1);
 assert.equal((await x.broker().reconcile(x.owner, { taskRef: x.taskRef, messageRef: accepted.messageRef })).state, 'unknown');
 const cancelled = x.store.control(x.owner, { ...x.bind('cancel'), kind: 'cancel' }); assert.equal(cancelled.cancellation, 'requested'); assert.equal(cancelled.reservationsHeld, 1);
 assert.equal(x.store.snapshot(x.owner, { taskRef: x.taskRef }).messages[0].state, 'unknown');
 assert.equal(readFileSync(x.databasePath).includes(Buffer.from('sk_synthetic_canary')), false);
});
test('revoke first creates no outbox claim, sender forgery/scoped collision and altered same-ID content fail closed', async t => {
 let calls = 0; const x = fixture(t, { async send(record) { calls++; return receipt(record, 'sent'); }, async query(record) { return receipt(record, 'unknown'); } });
 const accepted = x.broker().accept(x.owner, x.acceptInput()), command = x.approve(accepted);
 x.store.revokeAction(x.owner, { ...x.bind('revoke'), actionRef: command.actionRef, actionDigest: command.actionDigest });
 await assert.rejects(x.broker().dispatch(x.owner, { ...command, ...x.bind('revoked-dispatch') }), error => error.code === 'APPROVAL_INVALID'); assert.equal(calls, 0);
 assert.equal(x.broker().read(x.owner, x.taskRef, accepted.messageRef).claimRef, null);
 assert.throws(() => x.broker().accept({ role: 'owner' }, x.acceptInput()), error => error.code === 'UNAUTHORIZED');
 assert.throws(() => x.broker().read(x.other, x.taskRef, accepted.messageRef), error => ['TASK_NOT_FOUND', 'RECORD_NOT_FOUND'].includes(error.code));
 assert.throws(() => x.broker().accept(x.owner, x.acceptInput({ ...x.bind('conflict'), purposeRef: ref('changed-purpose') })), error => error.code === 'IDEMPOTENCY_CONFLICT');
 assert.throws(() => x.store.putData(x.owner, { ...x.bind('secret'), kind: 'message', content: 'sk_synthetic_canary', sourceRef: ref('source') }), error => error.code === 'SECRET_REJECTED');
});

test('real scoped worker relay preserves origin through two hops without granting general prior body access', async t => {
 const x = fixture(t, { async send(r) { return receipt(r, 'consumed'); }, async query(r) { return receipt(r, 'consumed'); } });
 const third = {}, fourth = {};
 for (const [handle, name] of [[third, 'third'], [fourth, 'fourth']]) x.store.bindExecution(x.host, handle, { taskRef: x.taskRef, role: 'worker', sessionRef: ref(`${name}-session`), generationRef: ref(`${name}-generation`) });
 const first = x.broker().accept(x.owner, x.acceptInput()); await x.broker().dispatch(x.owner, x.approve(first));
 assert.equal(x.store.readData(x.recipient, { taskRef: x.taskRef, recordRef: x.body.recordRef }).content, 'synthetic bounded message');
 const unrelated = x.store.putData(x.owner, { ...x.bind('unrelated-body'), kind: 'message', content: 'unrelated restricted payload', sourceRef: ref('unrelated-source') });
 assert.throws(() => x.store.readData(x.recipient, { taskRef: x.taskRef, recordRef: unrelated.recordRef }), e => e.code === 'UNAUTHORIZED');
 const second = x.broker().accept(x.recipient, x.acceptInput({ ...x.bind('forward-one'), messageRef: ref('second'), recipientHandle: third, forwardOf: first.messageRef })); await x.broker().dispatch(x.owner, x.approve(second, 'second-action'));
 const final = x.broker().accept(third, x.acceptInput({ ...x.bind('forward-two'), messageRef: ref('third-message'), recipientHandle: fourth, forwardOf: second.messageRef }));
 const provenance = x.broker().read(third, x.taskRef, final.messageRef).provenance;
 assert.equal(provenance.route.hopCount, 2); assert.equal(provenance.route.originalSender.sessionRef, ref('main-session')); assert.equal(provenance.route.originalPurposeRef, ref('purpose'));
 assert.throws(() => x.broker().accept(x.recipient, x.acceptInput({ ...x.bind('loop'), messageRef: ref('loop'), recipientHandle: x.owner, forwardOf: first.messageRef })), e => e.code === 'ROUTE_LOOP');
});
test('async double-send window keeps immutable input and one callback; forged receipt cannot confirm consumption', async t => {
 let release; const gate = new Promise(resolve => { release = resolve; }); let sends = 0;
 const x = fixture(t, { async send(r) { sends++; await gate; return { ...receipt(r, 'consumed'), recipientGenerationRef: ref('wrong-generation') }; }, async query(r) { return receipt(r, 'unknown'); } });
 const accepted = x.broker().accept(x.owner, x.acceptInput()), command = x.approve(accepted), pending = x.broker().dispatch(x.owner, command);
 const duplicate = await x.broker().dispatch(x.owner, command); assert.equal(duplicate.dispatched, false); assert.equal(sends, 1);
 command.taskRef = ref('mutated-during-await'); release();
 const result = await pending; assert.equal(result.message.state, 'unknown'); assert.equal(result.message.messageRef, accepted.messageRef);
 assert.equal(x.broker().read(x.owner, x.taskRef, accepted.messageRef).state, 'unknown');
});

test('independent reviewer can report own verification body but cannot send unrelated categories or mint a grant', t => {
 const x = fixture(t, { async send(r) { return receipt(r, 'sent'); }, async query(r) { return receipt(r, 'unknown'); } }), reviewer = {};
 x.store.bindExecution(x.host, reviewer, { taskRef: x.taskRef, role: 'reviewer', generationRef: ref('review-generation'), sessionRef: ref('review-session'), readRecordRefs: [] });
 const data = x.store.putData(reviewer, { ...x.bind('review-result-data'), kind: 'verification', content: 'synthetic independent review outcome', sourceRef: ref('review-material') });
 const accepted = x.broker().accept(reviewer, x.acceptInput({ ...x.bind('review-report'), messageRef: ref('review-report'), recipientHandle: x.owner, bodyRecordRef: data.recordRef, bodyDigest: data.digest, byteLength: data.byteLength, category: 'review_result' })); assert.equal(accepted.state, 'accepted');
 assert.throws(() => x.broker().accept(reviewer, x.acceptInput({ ...x.bind('review-control-forgery'), messageRef: ref('bad-report'), recipientHandle: x.owner, bodyRecordRef: data.recordRef, bodyDigest: data.digest, byteLength: data.byteLength, category: 'control_request' })), e => e.code === 'MESSAGE_CATEGORY_DENIED');
 assert.throws(() => x.store.grantAction(reviewer, { ...x.bind('review-grant'), actionRef: ref('fictional-action'), actionDigest: ref('fictional-spec'), expiresAt: 2000 }), e => e.code === 'UNAUTHORIZED');
});
