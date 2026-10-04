import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { RuntimeStore, reference } from '../src/runtime-store.mjs';
import { ResultPipeline, normalizeNotificationBinding } from '../src/results.mjs';
import { NotificationService, normalizeNotificationPolicy } from '../src/notifications.mjs';
const ref = text => createHash('sha256').update(text).digest('hex');
const spec = more => ({ enabled: true, timeZone: 'Etc/UTC', quietWindows: [], emergencyKinds: [], mergeKinds: [], mergeWindowMs: 0, minIntervalMs: 0, frequency: { windowMs: 60000, maxClaims: 8 }, ...more });
const report = tag => ({ originalGoalRef: ref('goal'), completedScopeRef: ref(`scope-${tag}`), unfinishedRef: ref('unfinished'), nextStepRef: ref('next'), verificationState: 'not_run', verificationEvidence: [], blockerRefs: [], progressDigest: ref(`progress-${tag}`) });
const code = expected => error => error.code === expected && error.message === expected;
function fixture(t, more = {}, transport = {}) {
 const dir = mkdtempSync(join(tmpdir(), 'df-notification-')), databasePath = join(dir, 'ledger.db');
 const owner = {}, host = {}, other = {}; let now = 1000, sends = 0;
 const principals = [{ handle: owner, role: 'owner', scope: { ownerId: 'owner', workspaceId: 'workspace' } }, { handle: host, role: 'host', scope: { ownerId: 'owner', workspaceId: 'workspace' } }, { handle: other, role: 'owner', scope: { ownerId: 'other', workspaceId: 'workspace' } }];
 const options = { databasePath, encryptionKey: Buffer.alloc(32, 17), principals, clock: () => now, hostPermission: () => true, forbiddenSecrets: ['sk_notification_canary'], limits: { maxActive: 8 } };
 let store = new RuntimeStore(options); const peers = []; t.after(() => { for (const peer of peers) peer.close(); store.close(); rmSync(dir, { recursive: true, force: true }); });
 const taskRef = reference('task');
 const route = { policyRef: ref('notification-policy'), recipientRef: ref('recipient'), channelRef: ref('channel'), mergeKeyRef: ref('merge-key') };
 const receipt = (d, state = 'delivered', extras = {}) => ({ artifactRef: d.artifactRef, artifactVersion: d.artifactVersion, digest: d.digest, recipientRef: d.recipientRef, channelRef: d.channelRef, permissionState: state === 'unknown' ? 'unknown' : 'granted', openability: state === 'unknown' ? 'unknown' : 'verified', observedAt: now, evidenceRef: ref(`receipt-${state}-${now}`), state, ...extras });
 const adapter = { async send(d, data) { sends++; return transport.send ? transport.send(d, data, receipt) : receipt(d); }, async query(d) { return transport.query ? transport.query(d, receipt) : receipt(d); }, async open(d) { return receipt(d); } };
 const pipeline = (s = store) => new ResultPipeline(s, { hostHandle: host, recipientAdapter: adapter, progressPolicy: () => ({ quietUntil: 0, coalesceUntil: 0, allowObstaclesDuringQuiet: false }) });
 const service = (s = store, r = route) => new NotificationService(s, { ...r, resultPipeline: pipeline(s) });
 function intake(id = 'task') { store.intake(owner, { taskId: id, provider: 'mock', source: 'source', eventId: id, commandRef: ref(`intake-${id}`) }); return reference(id); }
 intake(); store.policy(owner, { commandRef: ref('resource-policy'), expectedVersion: 1, limits: {}, modelPolicy: { version: 1, presetRefs: [ref('preset')], catalogEvidenceRef: ref('catalog') } });
 service().configure(owner, { commandRef: ref('notify-policy-1'), expectedRevision: 0, spec: spec(more) });
 const bind = (tag, task = taskRef, s = store) => { const state = s.task(owner, task); return { taskRef: task, commandRef: ref(tag), expectedTaskVersion: state.version, expectedAuthEpoch: state.authEpoch }; };
 function progress(tag, kind = 'milestone', task = taskRef) { return pipeline().progress(owner, { ...bind(`progress-${tag}`, task), progressRef: ref(`p-${tag}`), kind, report: report(tag) }).progress; }
 function action(targetDigest, dataDigest, tag, task = taskRef, role = 'worker') {
  const generationRef = ref(`${tag}-generation`);
  const specification = { actionRef: ref(`action-${tag}`), kind: role === 'review' ? 'review' : 'write', role, targetDigest, dataDigest, units: 1, charges: { runtimeMs: 1, usageUnits: 0, costEstimateMicros: 0 }, attemptGroupRef: ref(`attempt-${tag}`), attemptIndex: 1, resourcePolicyVersion: 2, modelPolicyVersion: 1, model: { presetRef: ref('preset'), modelRef: ref('model'), reasoningRef: ref('reasoning'), catalogEvidenceRef: ref('catalog') }, executor: { mode: 'none', generationRef, environmentRef: ref('environment'), bindingDigest: ref('binding'), toolsDigest: ref('tools'), permissionPolicyDigest: ref('permissions') } };
  const planned = store.planAction(owner, { ...bind(`${tag}-plan`, task), spec: specification }); store.grantAction(owner, { ...bind(`${tag}-grant`, task), actionRef: planned.actionRef, actionDigest: planned.actionDigest, expiresAt: now + 100000 });
  return { ...bind(`${tag}-claim`, task), actionRef: planned.actionRef, actionDigest: planned.actionDigest };
 }
 function release(d, tag = 'released') { return store.settleAction(host, { taskRef: d.intent.taskRef, commandRef: ref(`${tag}-${d.deliveryRef}`), claimRef: d.claimRef, generationRef: d.generationRef, outcome: d.state === 'failed' ? 'failed' : 'completed', evidenceRef: ref(`${tag}-evidence`) }); }
 function prepare(progressRefs, tag = 'notice', task = taskRef) {
  const artifact = service().prepare(owner, { ...bind(`${tag}-write`, task), artifactRef: ref(`artifact-${tag}`), version: 1, progressRefs });
  const reviewer = {}, generationRef = ref(`${tag}-review-generation`); store.bindExecution(host, reviewer, { taskRef: task, role: 'reviewer', generationRef, sessionRef: ref(`${tag}-review-session`), readRecordRefs: [artifact.recordRef] });
  const claim = action(ref(`${tag}-material`), artifact.digest, `${tag}-review`, task, 'review'); store.claimAction(host, claim);
  pipeline().verify(reviewer, { taskRef: task, commandRef: ref(`${tag}-verify`), artifactRef: artifact.artifactRef, version: 1, digest: artifact.digest, verdict: 'passed', evidenceRef: ref(`${tag}-evidence`) });
  const reviewed = store.snapshot(owner, { taskRef: task }).actions.find(a => a.actionRef === claim.actionRef);
  store.settleAction(host, { taskRef: task, commandRef: ref(`${tag}-review-settle`), claimRef: reviewed.claimRef, generationRef: reviewed.generationRef, outcome: 'completed', evidenceRef: ref(`${tag}-review-closed`) });
  return store.artifact(owner, { taskRef: task, artifactRef: artifact.artifactRef });
 }
 function accept(artifact, progressRefs, tag = 'delivery', task = taskRef, extra = {}) { return service().accept(owner, { ...bind(`${tag}-accept`, task), deliveryRef: ref(tag), artifactRef: artifact.artifactRef, artifactVersion: artifact.version, digest: artifact.digest, policyRevision: service().policy(owner).revision, progressRefs, ...extra }); }
 function approve(d, tag = 'send') { return { ...action(d.targetDigest, d.digest, tag, d.intent.taskRef), deliveryRef: d.deliveryRef }; }
 return { owner, host, other, taskRef, route, databasePath, options, service, pipeline, bind, progress, action, prepare, accept, approve, release, receipt, intake, get store() { return store; }, get sends() { return sends; }, setTime(value) { now = value; }, get now() { return now; }, configure(more, tag = 'policy-update') { const current = service().policy(owner); return service().configure(owner, { commandRef: ref(tag), expectedRevision: current.revision, spec: spec(more) }); }, reopen() { store.close(); store = new RuntimeStore(options); }, peer() { const peer = new RuntimeStore(options); peers.push(peer); return peer; } };
}

test('closed explicit policy/binding normalization rejects defaults, booleans, getters and raw diagnostics', () => {
 assert.equal(normalizeNotificationPolicy(spec()).timeZone, 'Etc/UTC');
 const missing = spec(); delete missing.timeZone; assert.throws(() => normalizeNotificationPolicy(missing), code('INVALID_INPUT'));
 for (const malformed of [spec({ emergency: true }), spec({ quietWindows: [{ startMinute: 1, endMinute: 1 }] }), spec({ emergencyKinds: ['obstacle', 'obstacle'] }), spec({ frequency: { windowMs: 0, maxClaims: 1 } }), spec({ quietWindows: new Array(9).fill({ startMinute: 0, endMinute: 1 }) })]) assert.throws(() => normalizeNotificationPolicy(malformed), code('INVALID_INPUT'));
 assert.throws(() => normalizeNotificationPolicy(spec({ timeZone: 'No/SuchZone' })), code('TIMEZONE_INVALID'));
 const getter = spec(); Object.defineProperty(getter, 'enabled', { enumerable: true, get() { throw Error('must not execute'); } }); assert.throws(() => normalizeNotificationPolicy(getter), code('INVALID_INPUT'));
 assert.throws(() => normalizeNotificationBinding({ policyRef: ref('policy'), policyRevision: 1, progressRefs: [ref('p')], mergeKeyRef: ref('group'), emergency: true }), code('INVALID_INPUT'));
 assert.throws(() => normalizeNotificationBinding({ policyRef: ref('policy'), policyRevision: 1, progressRefs: [], mergeKeyRef: ref('group') }), code('INVALID_INPUT'));
});

test('durable pending/merge selection and canonical exact report artifact survive reopen without delivery claims', t => {
 const x = fixture(t, { mergeKinds: ['milestone'], mergeWindowMs: 1000 });
 const a = x.progress('one'); x.setTime(1500); const b = x.progress('two');
 let pending = x.service().pending(x.owner, x.taskRef); assert.deepEqual(pending.batches[0].progressRefs, [a.progressRef, b.progressRef]); assert.equal(pending.batches[0].state, 'coalesced'); assert.equal(pending.notificationDelivered, false);
 x.reopen(); x.setTime(2000); pending = x.service().pending(x.owner, x.taskRef); assert.equal(pending.batches[0].state, 'eligible');
 const artifact = x.prepare([b.progressRef, a.progressRef]); const body = x.store.readData(x.owner, { taskRef: x.taskRef, recordRef: artifact.recordRef }); const manifest = JSON.parse(body.content);
 assert.equal(manifest.progress.length, 2); assert.equal(manifest.progress[0].report.verificationState, 'not_run'); assert.ok(manifest.progress.every(p => p.report.unfinishedRef && p.report.originalGoalRef && p.report.nextStepRef));
 const d = x.accept(artifact, [a.progressRef, b.progressRef]); assert.equal(d.state, 'accepted'); assert.equal(d.claimRef, null); assert.equal(x.sends, 0);
 assert.equal(readFileSync(x.databasePath).includes(Buffer.from(body.content)), false);
 assert.throws(() => x.service().pending(x.other, x.taskRef), code('TASK_NOT_FOUND'));
 assert.throws(() => x.service().pending({ role: 'owner' }, x.taskRef), code('UNAUTHORIZED'));
});

test('quiet start/end and wrap/full-day bounds use owner IANA time and atomic trusted claim time', async t => {
 for (const [name, windows, before, after] of [
  ['half', [{ startMinute: 60, endMinute: 120 }], 3600000, 7200000],
  ['wrap', [{ startMinute: 1380, endMinute: 60 }], 23 * 3600000, 25 * 3600000],
  ['full', [{ startMinute: 0, endMinute: 1440 }], 0, null]
 ]) await t.test(name, async st => {
  const x = fixture(st, { quietWindows: windows }); x.setTime(before); const p = x.progress(name), a = x.prepare([p.progressRef], name), d = x.accept(a, [p.progressRef], `d-${name}`), command = x.approve(d, `s-${name}`);
  assert.equal(x.service().pending(x.owner, x.taskRef).batches[0].state, 'quiet');
  const snapshot = x.store.snapshot(x.owner, { taskRef: x.taskRef });
  await assert.rejects(x.service().dispatch(x.owner, command), code('NOTIFICATION_QUIET')); assert.deepEqual(x.store.snapshot(x.owner, { taskRef: x.taskRef }), snapshot); assert.equal(x.sends, 0);
  if (after !== null) { x.setTime(after); assert.equal(x.service().pending(x.owner, x.taskRef).batches[0].state, 'eligible'); const fresh = x.approve(d, `fresh-${name}`); assert.equal((await x.service().dispatch(x.owner, fresh)).delivery.state, 'delivered'); }
 });
});

test('quiet reads follow DST repeated/missing local minutes without triggering effects', t => {
 const x = fixture(t, { timeZone: 'America/New_York', quietWindows: [{ startMinute: 60, endMinute: 120 }] }); x.progress('dst');
 for (const at of [Date.parse('2026-11-01T05:30:00Z'), Date.parse('2026-11-01T06:30:00Z')]) { x.setTime(at); assert.equal(x.service().pending(x.owner, x.taskRef).batches[0].state, 'quiet'); }
 x.configure({ timeZone: 'America/New_York', quietWindows: [{ startMinute: 120, endMinute: 180 }] }, 'spring');
 x.setTime(Date.parse('2026-03-08T06:59:00Z')); assert.equal(x.service().pending(x.owner, x.taskRef).batches[0].state, 'eligible');
 x.setTime(Date.parse('2026-03-08T07:00:00Z')); assert.equal(x.service().pending(x.owner, x.taskRef).batches[0].state, 'eligible'); assert.equal(x.sends, 0);
});

test('emergency bypasses quiet/merge only, while interval/frequency and disabled policy remain hard', async t => {
 const x = fixture(t, { quietWindows: [{ startMinute: 0, endMinute: 1440 }], emergencyKinds: ['obstacle'], mergeKinds: ['obstacle'], mergeWindowMs: 100000, minIntervalMs: 1000, frequency: { windowMs: 10000, maxClaims: 1 } });
 const p = x.progress('blocked', 'obstacle'), a = x.prepare([p.progressRef]), d = x.accept(a, [p.progressRef]), delivered = (await x.service().dispatch(x.owner, x.approve(d))).delivery; assert.equal(delivered.state, 'delivered'); x.release(delivered);
 x.setTime(1500); const p2 = x.progress('blocked-again', 'obstacle'), a2 = x.prepare([p2.progressRef], 'again'), d2 = x.accept(a2, [p2.progressRef], 'again-delivery');
 await assert.rejects(x.service().dispatch(x.owner, x.approve(d2, 'again-send')), code('NOTIFICATION_INTERVAL'));
 x.setTime(2000); await assert.rejects(x.service().dispatch(x.owner, x.approve(d2, 'frequency-send')), code('NOTIFICATION_FREQUENCY')); assert.equal(x.sends, 1);
 x.configure({ enabled: false, emergencyKinds: ['obstacle'] }); await assert.rejects(x.service().dispatch(x.owner, x.approve(d2, 'stale-send')), code('STALE_NOTIFICATION_POLICY'));
 const d3 = x.accept(a2, [p2.progressRef], 'disabled-delivery'); await assert.rejects(x.service().dispatch(x.owner, x.approve(d3, 'disabled-send')), code('NOTIFICATION_DISABLED'));
});

test('merge wait uses oldest included progress, mixed nonmerge kinds cannot be bulk-dispatched', async t => {
 const x = fixture(t, { mergeKinds: ['milestone'], mergeWindowMs: 1000 });
 const p = x.progress('merge-one'); x.setTime(1500); const p2 = x.progress('merge-two'), a = x.prepare([p.progressRef, p2.progressRef]), d = x.accept(a, [p.progressRef, p2.progressRef]);
 await assert.rejects(x.service().dispatch(x.owner, x.approve(d)), code('NOTIFICATION_COALESCING')); assert.equal(x.sends, 0);
 x.setTime(2000); assert.equal((await x.service().dispatch(x.owner, x.approve(d, 'ready-send'))).delivery.state, 'delivered');
 const final = x.progress('final', 'final'), mixed = x.prepare([p2.progressRef, final.progressRef], 'mixed'), dm = x.accept(mixed, [p2.progressRef, final.progressRef], 'mixed-delivery');
 await assert.rejects(x.service().dispatch(x.owner, x.approve(dm, 'mixed-send')), code('NOTIFICATION_MERGE_DENIED')); assert.equal(x.sends, 1);
});

test('immutable same fact under another progressRef cannot resend, including reopen', async t => {
 const x = fixture(t), p = x.progress('same'), a = x.prepare([p.progressRef]), d = x.accept(a, [p.progressRef]); const delivered = (await x.service().dispatch(x.owner, x.approve(d))).delivery; x.release(delivered);
 const body = x.store.readData(x.owner, { taskRef: x.taskRef, recordRef: p.recordRef }).content;
 const duplicate = x.store.writeProgress(x.owner, { ...x.bind('concurrent-duplicate'), progressRef: ref('duplicate-ref'), kind: 'milestone', content: body });
 x.reopen(); const pending = x.service().pending(x.owner, x.taskRef); assert.equal(pending.candidates.length, 0); assert.equal(pending.suppressed.length, 2);
 const duplicateArtifact = x.prepare([duplicate.progressRef], 'dup'), duplicateDelivery = x.accept(duplicateArtifact, [duplicate.progressRef], 'dup-delivery');
 await assert.rejects(x.service().dispatch(x.owner, x.approve(duplicateDelivery, 'dup-send')), code('NOTIFICATION_DUPLICATE')); assert.equal(x.sends, 1);
});

test('unknown effect holds group across restart, newer progress/policy and query-only reconciliation', async t => {
 let known = false; const x = fixture(t, {}, { async send() { throw Error('sk_notification_canary'); }, async query(d, receipt) { return receipt(d, known ? 'delivered' : 'unknown'); } });
 const p = x.progress('first'), a = x.prepare([p.progressRef]), d = x.accept(a, [p.progressRef]), command = x.approve(d);
 const unknown = (await x.service().dispatch(x.owner, command)).delivery; assert.equal(unknown.state, 'unknown'); assert.equal(x.sends, 1);
 x.setTime(1500); const p2 = x.progress('new'), a2 = x.prepare([p2.progressRef], 'new'), d2 = x.accept(a2, [p2.progressRef], 'new-delivery');
 await assert.rejects(x.service().dispatch(x.owner, x.approve(d2, 'new-send')), code('NOTIFICATION_PENDING'));
 x.configure({}, 'changed-policy'); const d3 = x.accept(a2, [p2.progressRef], 'new-policy-delivery'), newer = x.approve(d3, 'new-policy-send');
 await assert.rejects(x.service().dispatch(x.owner, newer), code('NOTIFICATION_PENDING')); assert.equal(x.sends, 1);
 x.reopen(); x.setTime(2000); assert.equal(x.service().pending(x.owner, x.taskRef).heldDeliveryRef, d.deliveryRef);
 assert.equal((await x.service().dispatch(x.owner, command)).dispatched, false); assert.equal((await x.service().reconcile(x.owner, x.taskRef, d.deliveryRef)).state, 'unknown'); assert.equal(x.sends, 1);
 // Restart adds the stronger task recovery gate while retaining group/fact and
 // resource ownership. Fresh CAS cannot evade that gate or resend the effect.
 await assert.rejects(x.service().dispatch(x.owner, { ...newer, ...x.bind('restart-attempt') }), code('TASK_BLOCKED'));
 const held = x.store.settleAction(x.host, { taskRef: x.taskRef, commandRef: ref('false-release'), claimRef: unknown.claimRef, generationRef: unknown.generationRef, outcome: 'completed', evidenceRef: ref('self-claimed') }); assert.equal(held.reservationHeld, true);
 known = true; x.setTime(3000); const confirmed = await x.service().reconcile(x.owner, x.taskRef, d.deliveryRef); assert.equal(confirmed.state, 'delivered');
 assert.equal(x.service().pending(x.owner, x.taskRef).heldDeliveryRef, d.deliveryRef);
 assert.equal(x.release(confirmed).reservationHeld, false); assert.equal(x.service().pending(x.owner, x.taskRef).heldDeliveryRef, null);
 assert.equal(JSON.stringify(x.service().pending(x.owner, x.taskRef)).includes('sk_notification_canary'), false);
});

test('only a known failed released exact item can be explicitly retried with a fresh approved attempt', async t => {
 let failed = true; const x = fixture(t, {}, { async send(d, data, receipt) { return receipt(d, failed ? 'failed' : 'delivered'); } });
 const p = x.progress('retry'), a = x.prepare([p.progressRef]), d = x.accept(a, [p.progressRef]); const first = (await x.service().dispatch(x.owner, x.approve(d))).delivery;
 assert.equal(first.state, 'failed'); assert.throws(() => x.accept(a, [p.progressRef], 'too-early', x.taskRef, { previousDeliveryRef: d.deliveryRef }), code('RETRY_UNCONFIRMED'));
 x.release(first); const pending = x.service().pending(x.owner, x.taskRef); assert.equal(pending.retryRequired[0].previousDeliveryRef, d.deliveryRef); assert.equal(pending.batches.length, 0);
 const blind = x.accept(a, [p.progressRef], 'blind'); await assert.rejects(x.service().dispatch(x.owner, x.approve(blind, 'blind-send')), code('RETRY_UNCONFIRMED'));
 const retry = x.accept(a, [p.progressRef], 'retry-delivery', x.taskRef, { previousDeliveryRef: d.deliveryRef }); failed = false; x.setTime(2000);
 assert.equal((await x.service().dispatch(x.owner, x.approve(retry, 'retry-send'))).delivery.state, 'delivered'); assert.equal(x.sends, 2);
});

test('stale policy consent and revoke-first/cancel-first leave no notification ownership or callback', async t => {
 for (const kind of ['policy', 'revoke', 'cancel']) await t.test(kind, async st => {
  const x = fixture(st), p = x.progress(kind), a = x.prepare([p.progressRef]), d = x.accept(a, [p.progressRef]), command = x.approve(d);
  if (kind === 'policy') x.configure({ quietWindows: [{ startMinute: 0, endMinute: 1440 }] });
  if (kind === 'revoke') x.store.revokeAction(x.owner, { ...x.bind('revoke'), actionRef: command.actionRef, actionDigest: command.actionDigest });
  if (kind === 'cancel') x.store.control(x.owner, { ...x.bind('cancel'), kind: 'cancel' });
  await assert.rejects(x.service().dispatch(x.owner, { ...command, ...x.bind(`post-${kind}`) }), code({ policy: 'STALE_NOTIFICATION_POLICY', revoke: 'APPROVAL_INVALID', cancel: 'TASK_BLOCKED' }[kind]));
  const snapshot = x.store.snapshot(x.owner, { taskRef: x.taskRef }); assert.equal(snapshot.notifications.length, 0); assert.equal(snapshot.notificationFacts.length, 0); assert.equal(x.sends, 0); assert.equal(snapshot.deliveries[0].state, 'accepted');
 });
});

test('cancel after committed claim holds already unknown ownership; policy pause does not stop otherwise admitted background work', async t => {
 const x = fixture(t, { enabled: false }); const p = x.progress('pause'); const command = x.action(ref('background'), p.digest, 'background'); const background = x.store.claimAction(x.host, command); assert.ok(background.claimRef); assert.equal(x.service().pending(x.owner, x.taskRef).batches[0].state, 'disabled');
 const y = fixture(t, {}, { async send(d) { y.store.control(y.owner, { ...y.bind('cancel-after-claim'), kind: 'cancel' }); throw Error('unknown-after-cancel'); } }); const yp = y.progress('cancel'), a = y.prepare([yp.progressRef]), d = y.accept(a, [yp.progressRef]); const unknown = (await y.service().dispatch(y.owner, y.approve(d))).delivery;
 assert.equal(unknown.state, 'unknown'); assert.equal(y.store.task(y.owner, y.taskRef).status, 'cancel_requested'); assert.equal(y.service().pending(y.owner, y.taskRef).heldDeliveryRef, d.deliveryRef); assert.equal(y.sends, 1); y.reopen(); assert.equal(y.service().pending(y.owner, y.taskRef).heldDeliveryRef, d.deliveryRef);
});

test('same endpoint frequency is atomically shared across tasks and independent process connections', async t => {
 const x = fixture(t, { frequency: { windowMs: 10000, maxClaims: 1 } }), task2 = x.intake('task-two'); const commands = [];
 for (const [task, tag] of [[x.taskRef, 'one'], [task2, 'two']]) { const p = x.progress(tag, 'milestone', task), a = x.prepare([p.progressRef], tag, task), d = x.accept(a, [p.progressRef], `d-${tag}`, task); const c = x.approve(d, tag); const { deliveryRef, ...base } = c; commands.push({ ...base, delivery: { deliveryRef } }); }
 const modulePath = new URL('../src/runtime-store.mjs', import.meta.url).href;
 const script = `import {RuntimeStore} from ${JSON.stringify(modulePath)};const host={};const store=new RuntimeStore({databasePath:process.argv[1],encryptionKey:Buffer.alloc(32,17),principals:[{handle:host,role:'host',scope:{ownerId:'owner',workspaceId:'workspace'}}],clock:()=>1000,hostPermission:()=>true,forbiddenSecrets:['sk_notification_canary'],limits:{maxActive:8}});try{const r=store.claimAction(host,JSON.parse(process.argv[2]));process.stdout.write(JSON.stringify({claimed:!!r.claimRef}));}catch(e){process.stdout.write(JSON.stringify({code:e.code}));}finally{store.close();}`;
 const run = input => new Promise((resolve, reject) => { const child = spawn(process.execPath, ['--input-type=module', '-e', script, x.databasePath, JSON.stringify(input)]); let stdout = '', stderr = ''; child.stdout.on('data', b => stdout += b); child.stderr.on('data', b => stderr += b); child.on('error', reject); child.on('close', status => status === 0 ? resolve(JSON.parse(stdout)) : reject(Error(`child failed: ${status} ${stderr}`))); });
 const outcomes = await Promise.all(commands.map(run)); assert.equal(outcomes.filter(r => r.claimed).length, 1); assert.deepEqual(outcomes.filter(r => !r.claimed).map(r => r.code), ['NOTIFICATION_FREQUENCY']);
 const records = [x.taskRef, task2].map(taskRef => x.store.snapshot(x.owner, { taskRef })); assert.equal(records.reduce((n, s) => n + s.notifications.length, 0), 1); assert.equal(x.service().policy(x.owner).windows[0].count, 1); assert.equal(x.sends, 0);
});

test('manifest byte/progress/route binding rejects arbitrary artifacts, roles and payload emergency flags', t => {
 const x = fixture(t), p = x.progress('bound'), artifact = x.prepare([p.progressRef]);
 const other = x.pipeline().writeArtifact(x.owner, { ...x.bind('wrong-body'), artifactRef: ref('wrong'), version: 1, content: 'sk_notification_canary-ref-only'.replace('sk_notification_canary', 'synthetic') });
 assert.throws(() => x.accept(other, [p.progressRef], 'wrong-delivery'), code('NOTIFICATION_ARTIFACT_MISMATCH'));
 assert.throws(() => x.service().prepare(x.owner, { ...x.bind('no-progress'), artifactRef: ref('missing'), version: 1, progressRefs: [ref('absent')] }), code('PROGRESS_NOT_FOUND'));
 assert.throws(() => x.service().accept(x.owner, { ...x.bind('flag'), deliveryRef: ref('flag'), artifactRef: artifact.artifactRef, artifactVersion: 1, digest: artifact.digest, policyRevision: 1, progressRefs: [p.progressRef], emergency: true }), code('INVALID_INPUT'));
 const reviewer = {}; x.store.bindExecution(x.host, reviewer, { taskRef: x.taskRef, role: 'reviewer', generationRef: ref('only-review'), sessionRef: ref('session'), readRecordRefs: [artifact.recordRef] });
 assert.throws(() => x.service().pending(reviewer, x.taskRef), code('UNAUTHORIZED')); assert.throws(() => x.service().configure(reviewer, { commandRef: ref('self-policy'), expectedRevision: 1, spec: spec() }), code('UNAUTHORIZED'));
});

test('sent remains held, exact interval/window edges require known receipt and actual release', async t => {
 let state = 'sent'; const x = fixture(t, { minIntervalMs: 1000, frequency: { windowMs: 2000, maxClaims: 1 } }, { async send(d, data, receipt) { return receipt(d, state); }, async query(d, receipt) { return receipt(d, 'delivered'); } });
 const p = x.progress('sent'), a = x.prepare([p.progressRef]), d = x.accept(a, [p.progressRef]); const sent = (await x.service().dispatch(x.owner, x.approve(d))).delivery;
 assert.equal(sent.state, 'sent'); assert.equal(x.service().pending(x.owner, x.taskRef).heldDeliveryRef, d.deliveryRef);
 x.setTime(1500); const delivered = await x.service().reconcile(x.owner, x.taskRef, d.deliveryRef); assert.equal(delivered.state, 'delivered'); assert.equal(x.service().pending(x.owner, x.taskRef).heldDeliveryRef, d.deliveryRef); x.release(delivered);
 const p2 = x.progress('boundary'), a2 = x.prepare([p2.progressRef], 'boundary'), d2 = x.accept(a2, [p2.progressRef], 'boundary-delivery');
 x.setTime(1999); await assert.rejects(x.service().dispatch(x.owner, x.approve(d2, 'interval-minus')), code('NOTIFICATION_INTERVAL'));
 x.setTime(2000); await assert.rejects(x.service().dispatch(x.owner, x.approve(d2, 'interval-exact')), code('NOTIFICATION_FREQUENCY'));
 x.setTime(2999); assert.equal(x.service().pending(x.owner, x.taskRef).batches[0].state, 'frequency');
 x.setTime(3000); assert.equal(x.service().pending(x.owner, x.taskRef).batches[0].state, 'eligible'); state = 'delivered'; assert.equal((await x.service().dispatch(x.owner, x.approve(d2, 'window-exact'))).delivery.state, 'delivered'); assert.equal(x.sends, 2);
});

test('an advisory eligible snapshot cannot authorize a later quiet claim, and workers have no notification policy', async t => {
 const x = fixture(t, { quietWindows: [{ startMinute: 60, endMinute: 120 }] }); x.setTime(3599999);
 const p = x.progress('clock-race'), a = x.prepare([p.progressRef]), d = x.accept(a, [p.progressRef]), command = x.approve(d);
 assert.equal(x.service().pending(x.owner, x.taskRef).batches[0].state, 'eligible'); x.setTime(3600000);
 await assert.rejects(x.service().dispatch(x.owner, command), code('NOTIFICATION_QUIET')); assert.equal(x.sends, 0);
 const worker = {}; x.store.bindExecution(x.host, worker, { taskRef: x.taskRef, role: 'worker', generationRef: ref('worker'), sessionRef: ref('worker-session') });
 assert.throws(() => x.service().policy(worker), code('UNAUTHORIZED')); assert.throws(() => x.service().pending(worker, x.taskRef), code('UNAUTHORIZED'));
});

test('oversized merged report manifests reject atomically and preserve the authoritative progress records', t => {
 const x = fixture(t, { mergeKinds: ['milestone'] }), refs = [];
 const verificationEvidence = Array.from({ length: 16 }, (_, index) => ({ evidenceRef: ref(`ev-${index}`), digest: ref(`checked-${index}`), observedAt: 1000 }));
 for (let i = 0; i < 16; i++) {
  const p = x.pipeline().progress(x.owner, { ...x.bind(`large-progress-${i}`), progressRef: ref(`large-${i}`), kind: 'milestone', report: { ...report(`large-${i}`), verificationState: 'passed', verificationEvidence, blockerRefs: Array.from({ length: 16 }, (_, n) => ref(`blocker-${n}`)) } }).progress; refs.push(p.progressRef);
 }
 const before = x.store.snapshot(x.owner, { taskRef: x.taskRef });
 assert.throws(() => x.service().prepare(x.owner, { ...x.bind('oversized-notice'), artifactRef: ref('oversized'), version: 1, progressRefs: refs }), code('INPUT_TOO_LARGE'));
 assert.deepEqual(x.store.snapshot(x.owner, { taskRef: x.taskRef }), before); assert.equal(x.sends, 0);
});


test('dispatch rejects getter/proxy canaries before input dereference or any effect', t => {
 const x = fixture(t); let traps = 0;
 const values = { taskRef: x.taskRef, deliveryRef: ref('d'), actionRef: ref('a'), actionDigest: ref('digest'), ...x.bind('getter-command') };
 const getter = { ...values }; Object.defineProperty(getter, 'taskRef', { enumerable: true, get() { traps++; throw Error('sk_notification_canary'); } });
 assert.throws(() => x.service().dispatch(x.owner, getter), code('INVALID_INPUT'));
 const proxy = new Proxy(values, { get() { traps++; throw Error('sk_notification_canary'); } });
 assert.throws(() => x.service().dispatch(x.owner, proxy), code('INVALID_INPUT')); assert.equal(traps, 0); assert.equal(x.sends, 0);
});
