import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { DSH_WEB_RUNTIME_ROOT } from '../src/host-probe.mjs';
const require = createRequire(import.meta.url), factory = require('../src/client-entry.cjs');
const d = text => createHash('sha256').update(text).digest('hex');
const React = { Fragment: 'fragment', createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(v => v !== false && v != null) }), useSyncExternalStore: (_, get) => get(), useState: () => ['', () => {}], useEffect: () => {} };
const client = factory(name => { assert.equal(name, 'react'); return React; });
const options = { clock: () => 1700, uuid: () => 'synthetic-command', digest: async text => d(text) };
const task = (tag = 'A', more = {}) => ({ taskRef: d(tag), status: 'running', version: 4, authEpoch: 2, updatedAt: 1000, ...more });
const snapshot = value => ({ task: value, control: 'active', data: [{ recordRef: d(`goal-${value.taskRef}`), kind: 'goal' }], actions: [], workers: [], artifacts: [] });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const success = value => ({ ok: true, value });
function fixture() {
  let current = task(); const calls = [];
  const rpc = { async call(channel, endpoint, input, signal) {
    calls.push({ channel, endpoint, input, signal }); assert.equal(channel, '/df-rpc');
    if (endpoint === 'v1/list') return success([current]);
    if (endpoint === 'v1/status') return success(snapshot(current));
    if (endpoint === 'v1/detail') { assert.equal(input.expectedTaskVersion, current.version); assert.equal(input.expectedAuthEpoch, current.authEpoch); return success({ task: current, data: { recordRef: input.recordRef, content: '明确的合成任务 <script>not executable</script>', digest: d('goal') } }); }
    if (endpoint === 'v1/control') { assert.equal(input.expectedTaskVersion, current.version); assert.equal(input.expectedAuthEpoch, current.authEpoch); current = task('A', { version: current.version + 1, authEpoch: current.authEpoch + 1, status: input.kind === 'cancel' ? 'cancel_requested' : 'running' }); return success({ cancellation: 'requested' }); }
    throw new Error('UNEXPECTED_ENDPOINT');
  } };
  return { model: client.createModel(rpc, options), rpc, calls, current: () => current };
}
function nodes(node) { return node && typeof node === 'object' ? [node, ...node.children.flatMap(nodes)] : []; }
function text(node) { return typeof node === 'object' ? node.children.map(text).join(' ') : String(node); }

test('native RPC list and scoped immutable detail paint one current CAS snapshot', async () => {
  const f = fixture(); await f.model.refresh(); const s = f.model.getSnapshot();
  assert.equal(s.phase, 'ready'); assert.equal(s.stale, false); assert.equal(s.records[0].content.includes('<script>'), true);
  assert.equal(s.tasks[0].version, s.detail.task.version); assert.equal(s.updatedAt, 1700);
  assert.deepEqual(f.calls.map(c => c.endpoint), ['v1/list', 'v1/status', 'v1/detail']);
  const tree = client.Panel({ model: f.model }), elements = nodes(tree);
  assert.equal(elements.some(n => n.type === 'nav' && n.props['aria-label'] === 'Tasks'), true);
  assert.equal(elements.some(n => n.type === 'label' && n.props.htmlFor === 'df-goal'), true);
  assert.equal(elements.some(n => n.props.dangerouslySetInnerHTML), false);
  assert.equal(text(tree).includes('明确的合成任务'), true); f.model.dispose();
});
test('cancel double-click admits one exact CAS request; authoritative readback remains cancellation requested', async () => {
  const f = fixture(); await f.model.refresh(); const gate = deferred(), original = f.rpc.call;
  f.rpc.call = async (...args) => args[1] === 'v1/control' ? (await gate.promise, original(...args)) : original(...args);
  const pending = f.model.control('cancel'); assert.equal(await f.model.control('cancel'), false); gate.resolve(); assert.equal(await pending, true);
  const controls = f.calls.filter(c => c.endpoint === 'v1/control'); assert.equal(controls.length, 1);
  assert.deepEqual(controls[0].input, { taskRef: d('A'), commandRef: d('synthetic-command'), expectedTaskVersion: 4, expectedAuthEpoch: 2, kind: 'cancel' });
  assert.equal(f.model.getSnapshot().detail.task.status, 'cancel_requested'); assert.equal(f.model.getSnapshot().tasks[0].version, 5);
  assert.equal(await f.model.control('cancel'), false); f.model.dispose();
});
test('native CAS rejection does not retry mutation or expose arbitrary error prose', async () => {
  const f = fixture(); await f.model.refresh(); let writes = 0;
  f.rpc.call = async () => { writes++; return { ok: false, error: { code: 'STALE_VERSION', message: 'SYNTHETIC_SECRET' } }; };
  assert.equal(await f.model.control('pause'), false); assert.equal(writes, 1);
  assert.equal(f.model.getSnapshot().stale, true); assert.equal(f.model.getSnapshot().detail.task.version, 4);
  assert.equal(text(client.Panel({ model: f.model })).includes('SYNTHETIC_SECRET'), false);
  assert.equal(await f.model.control('pause'), false); f.model.dispose();
});
test('disconnect invalidates a pending mutation and aborts its native request without a false readback', async () => {
  const f = fixture(); await f.model.refresh(); const gate = deferred(); let signal, reads = 0;
  f.rpc.call = async (_, endpoint, _input, abort) => { if (endpoint === 'v1/control') { signal = abort; return gate.promise; } reads++; return success([]); };
  const pending = f.model.control('pause'); await Promise.resolve(); await Promise.resolve(); f.model.disconnected(); assert.equal(signal.aborted, true);
  gate.resolve(success({})); assert.equal(await pending, false); assert.equal(reads, 0); assert.equal(f.model.getSnapshot().stale, true); assert.equal(f.model.getSnapshot().phase, 'offline'); f.model.dispose();
});
test('late selected task details cannot replace a newer task or a disposed panel', async () => {
  const a = task('A'), b = task('B'), delayed = deferred(); let delay = false;
  const rpc = { async call(_, endpoint, input) {
    if (endpoint === 'v1/list') return success([a, b]);
    if (endpoint === 'v1/status') return delay && input.taskRef === a.taskRef ? delayed.promise : success({ ...snapshot(input.taskRef === a.taskRef ? a : b), data: [] });
  } };
  const model = client.createModel(rpc, options); await model.refresh(); delay = true;
  const old = model.select(a.taskRef); await model.select(b.taskRef); delayed.resolve(success({ ...snapshot(a), data: [] })); await old;
  assert.equal(model.getSnapshot().selected, b.taskRef); assert.equal(model.getSnapshot().detail.task.taskRef, b.taskRef);
  const state = model.getSnapshot(); model.dispose(); await model.refresh(); assert.equal(model.getSnapshot(), state);
});
test('terminal, recovery, stale and offline controls stay disabled; action hashes cannot grant informed approval', () => {
  for (const status of ['completed', 'cancelled', 'recovery_required']) {
    const s = { tasks: [task('A', { status })], detail: { ...snapshot(task('A', { status })), actions: [{ actionRef: d('action'), actionDigest: d('digest'), spec: { role: 'worker', units: 1 } }], control: 'paused' }, records: [], phase: 'ready', stale: false, busy: false, updatedAt: 1000, error: null };
    const tree = client.Panel({ model: { subscribe() {}, getSnapshot: () => s } }); const buttons = nodes(tree).filter(n => n.type === 'button');
    assert.equal(buttons.find(n => text(n) === 'Continue').props.disabled, true);
    assert.equal(buttons.some(n => /Grant|Approve/.test(text(n))), false);
    assert.equal(text(tree).includes('concrete target and data preview'), true);
  }
});
// rc.2 no longer installs @deepseek-ai/dsh-client-ui-slots as a Node package: it is a
// dsh-web-frontend devDependency bundled into the shipped Web asset, which the runner
// exposes to client plugins via the module loader. Evaluate exactly that shipped,
// digest-pinned SlotCore class (its only free binding is a frozen empty array) in an
// isolated VM context instead of substituting a fake slot registry.
const SLOT_CORE_ASSET = 'dsh-web-frontend/dist/assets/index-CN7NIWNw.js';
const SLOT_CORE_ASSET_SHA256 = '4bc914bfbb6adbdd63953a29f63835eb7127defd2a973149d64cdab489f1a9a5';
const SLOT_CORE_SOURCE_SHA256 = 'bfd13a9e63180481d13341bc319a22245384da104e18146881cb8db4aa927206';
async function shippedSlotCore() {
  const [{ readFileSync }, vm] = await Promise.all([import('node:fs'), import('node:vm')]);
  const asset = readFileSync(`${DSH_WEB_RUNTIME_ROOT}/node_modules/@deepseek-ai/${SLOT_CORE_ASSET}`, 'utf8'); assert.equal(d(asset), SLOT_CORE_ASSET_SHA256);
  const exported = 'SlotCore:$I,SlotOwnershipError:', marker = 'i1=Object.freeze([]);var $I=class{', start = asset.indexOf(marker);
  assert.equal(asset.split(exported).length, 2); assert.equal(asset.split(marker).length, 2);
  let depth = 0, end; for (let i = start + marker.length - 1; i < asset.length; i++) { if (asset[i] === '{') depth++; else if (asset[i] === '}' && !--depth) { end = i + 1; break; } }
  const source = `const ${asset.slice(start, end)}; $I;`; assert.equal(d(source), SLOT_CORE_SOURCE_SHA256);
  return vm.runInNewContext(source, { queueMicrotask }, { filename: 'dsh-client-ui-slots/SlotCore (shipped rc.2 asset)' });
}
test('native SlotCore registrations are additive and release with the owning fixture context', async () => {
  const SlotCore = await shippedSlotCore();
  const { Context } = await import(`${DSH_WEB_RUNTIME_ROOT}/node_modules/@deepseek-ai/cordis/lib/index.js`);
  const core = new SlotCore(), ctx = new Context(); ctx.logger.exporters?.clear?.();
  const removeRoot = core.register({ name: 'root', children: { main: { kind: 'keyed', scope: 'root' }, 'sidebar.panellist': { kind: 'list', scope: 'root' } } }, () => {});
  ctx.provide('connection', { rpc: { call: async () => success([]) }, state: { subscribe: () => () => {} } }); ctx.provide('layout', {}); ctx.provide('uiWorkspace', { openSession() {} });
  ctx.provide('slots', { inject: (_key, fn) => ctx.effect(fn), register: (spec, component) => core.register(spec, component) });
  const fiber = ctx.plugin({ inject: client.inject, apply(ownerCtx) { client.apply({ connection: ownerCtx.connection, layout: ownerCtx.layout, uiWorkspace: ownerCtx.uiWorkspace, slots: { inject: (_key, fn) => ownerCtx.effect(fn), register: (spec, component) => core.register(spec, component) }, effect: ownerCtx.effect.bind(ownerCtx), on: ownerCtx.on.bind(ownerCtx) }); } }); await fiber;
  assert.equal(core.entries('main').length, 1); assert.equal(core.entries('main')[0].options.key, 'df'); assert.equal(core.entries('sidebar.panellist').length, 1);
  await fiber.dispose(); assert.equal(core.entries('main').length, 0); assert.equal(core.entries('sidebar.panellist').length, 0); assert.equal(core.entries('root').length, 1);
  removeRoot(); await ctx.fiber.dispose();
});

import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable, Writable } from 'node:stream';
import { createRuntimePlugin } from '../src/runtime-plugin.mjs';
import { RuntimeStore } from '../src/runtime-store.mjs';
import { ApprovalPreview } from '../src/approval-preview.mjs';
import { installOperatorBridge } from '../src/operator-bridge.mjs';
test('client model crosses genuine public native owner RPC framing into encrypted runtime and controls', async () => {
  const root = `${DSH_WEB_RUNTIME_ROOT}/node_modules/@deepseek-ai`;
  const { Context } = await import(`${root}/cordis/lib/index.js`);
  const { default: SessionStore } = await import(`${root}/dsh-session/lib/index.js`);
  const { default: ApprovalService } = await import(`${root}/dsh-user-approval/lib/index.js`);
  const { HostConnectionService } = await import(`${root}/dsh-client-connection/lib/index.js`);
  const directory = mkdtempSync(join(tmpdir(), 'df-native-client-')), ctx = new Context(), routes = new Map(); ctx.logger.exporters?.clear?.();
  let count = 0;
  const model = client.createModel({ async call(channel, endpoint, payload) {
    const request = Readable.from([Buffer.from(JSON.stringify({ type: 'client-request', rpcId: 'synthetic-client-rpc', method: endpoint, payload }))]);
    Object.assign(request, { method: 'POST', url: `${channel}/${endpoint}`, headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'content-type': 'application/json', 'x-synthetic-auth': 'approved' } });
    const parts = [], response = new Writable({ write(chunk, _encoding, done) { parts.push(Buffer.from(chunk)); done(); } }); response.writeHead = status => { response.statusCode = status; };
    await routes.get(channel).handler(request, response); assert.equal(response.statusCode, 200); return JSON.parse(Buffer.concat(parts).toString()).result;
  } }, { ...options, uuid: () => `synthetic-command-${++count}` });
  try {
    ctx.provide('webServer', { register(route) { routes.set(route.path, route); return () => routes.delete(route.path); } });
    await ctx.plugin(SessionStore); await ctx.plugin(ApprovalService, { policy: 'never' });
    await ctx.plugin({ apply(connectionCtx) { new HostConnectionService(connectionCtx, [], {isAuthenticated:request => request.headers['x-synthetic-auth'] === 'approved',authenticateApi:()=>undefined}); } });
    const plugin = ctx.plugin(createRuntimePlugin({ identity: () => ({ ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' }), encryptionKey: () => Buffer.alloc(32, 3) }), { databasePath: join(directory, 'ledger.sqlite') }); await plugin;
    await model.refresh(); assert.equal(model.getSnapshot().tasks.length, 0);
    assert.equal(await model.intake('Synthetic owner task meaning 中文'), true);
    assert.equal(model.getSnapshot().records[0].content, 'Synthetic owner task meaning 中文');
    assert.equal(await model.control('pause'), true); assert.equal(model.getSnapshot().detail.control, 'paused');
    assert.equal(await model.control('resume'), true); assert.equal(model.getSnapshot().detail.control, 'active');
    assert.equal(await model.control('cancel'), true); assert.equal(model.getSnapshot().detail.task.status, 'cancel_requested');
    assert.equal(model.getSnapshot().tasks[0].version, model.getSnapshot().detail.task.version); assert.equal(ctx.sessions.list().length, 0);
    model.dispose(); await plugin.dispose(); assert.equal(routes.has('/df-rpc'), false);
  } finally { model.dispose(); await ctx.fiber.dispose(); rmSync(directory, { recursive: true, force: true }); }
});

test('connection loss during async command digest cannot submit control or intake under a new epoch', async () => {
  for (const kind of ['control', 'intake']) {
    const f = fixture(), gate = deferred(); const model = client.createModel(f.rpc, { ...options, digest: () => gate.promise });
    await model.refresh(); const pending = kind === 'control' ? model.control('pause') : model.intake('Synthetic goal'); model.disconnected(); gate.resolve(d('command'));
    assert.equal(await pending, false); assert.equal(f.calls.some(call => ['v1/control', 'v1/intake'].includes(call.endpoint)), false);
    assert.equal(model.getSnapshot().phase, 'offline'); assert.equal(model.getSnapshot().stale, true); model.dispose();
  }
});
test('client rejects trailing newline references before task selection or mutation', async () => {
  const model = client.createModel({ call: async () => success([task('A', { taskRef: `${d('A')}\n` })]) }, options);
  await model.refresh(); assert.equal(model.getSnapshot().phase, 'error'); assert.equal(model.getSnapshot().tasks.length, 0); assert.equal(await model.control('pause'), false); model.dispose();
});

test('throwing intake command source is redacted and clears busy for a later explicit attempt', async () => {
  const f = fixture(); let fail = true, writes = 0; const original = f.rpc.call;
  f.rpc.call = async (...args) => { if (args[1] === 'v1/intake') { writes++; return success({ task: f.current() }); } return original(...args); };
  const model = client.createModel(f.rpc, { ...options, uuid: () => { if (fail) throw new Error('CLIENT-INDEPENDENT-SYNTHETIC-CANARY'); return 'synthetic-recovered-command'; } });
  await model.refresh(); assert.equal(await model.intake('Synthetic goal'), false);
  assert.equal(writes, 0); assert.equal(model.getSnapshot().busy, false); assert.equal(model.getSnapshot().error, 'RESULT_UNCONFIRMED');
  assert.equal(JSON.stringify(model.getSnapshot()).includes('CLIENT-INDEPENDENT-SYNTHETIC-CANARY'), false);
  fail = false; assert.equal(await model.intake('Synthetic explicit retry'), true); assert.equal(writes, 1); assert.equal(model.getSnapshot().busy, false); model.dispose();
});

function previewFixture({ response = value => value, digest = async value => d(value), previewGate } = {}) {
  let now = 1700, current = task(), grants = 0; const calls = [];
  const content = 'Exact synthetic context 中文', data = { recordRef: d('approval-record'), kind: 'context', content, digest: d(content) };
  const action = { actionRef: d('approval-action'), actionDigest: d('approval-spec'), state: 'requested', claimRef: null, spec: { kind: 'write', role: 'worker', units: 1, attemptIndex: 1, dataDigest: data.digest, charges: { runtimeMs: 20, usageUnits: 10, costEstimateMicros: 100 }, executor: { environmentRef: d('approval-env') } } };
  const preview = () => ({ previewRef: d('approved-preview'), taskRef: current.taskRef, actionRef: action.actionRef, actionDigest: action.actionDigest, taskVersion: current.version, authEpoch: current.authEpoch, expiresAt: now + 1000, description: { kind: 'write', role: 'worker', targetLabel: 'Synthetic owned session execution', data: { ...data }, model: { provider: 'Synthetic local provider', model: 'Synthetic model', reasoning: 'Fixture effort', preset: 'Synthetic preset' }, toolNames: [], environment: { label: 'Synthetic project', cwd: '/tmp/synthetic-project', environmentRef: action.spec.executor.environmentRef }, limits: { units: 1, attemptIndex: 1, charges: { ...action.spec.charges } }, evidenceRef: d('preview-evidence') } });
  const model = client.createModel({ async call(channel, endpoint, input) {
    calls.push({ channel, endpoint, input });
    if (endpoint === 'v1/list') return success([current]);
    if (endpoint === 'v1/status') return success({ ...snapshot(current), data: [{ recordRef: data.recordRef, kind: data.kind }], actions: [action] });
    if (endpoint === 'v1/detail') return success({ task: current, data });
    if (endpoint === 'v1/preview') { if (previewGate) await previewGate.promise; return success(response(preview())); }
    if (endpoint === 'v1/grant') { grants++; assert.equal(input.previewRef, d('approved-preview')); current = { ...current, version: current.version + 1, authEpoch: current.authEpoch + 1 }; return success({ authEpoch: current.authEpoch, taskVersion: current.version }); }
    throw new Error('UNEXPECTED_ENDPOINT');
  } }, { ...options, clock: () => now, digest });
  return { model, action, data, calls, grants: () => grants, advance: value => { now = value; } };
}
test('client displays exact trusted preview before one explicit expiry grant; grant does not start work', async () => {
  const f = previewFixture(); await f.model.refresh(); assert.equal(await f.model.grantAction(f.action.actionRef), false);
  assert.equal(await f.model.previewAction(f.action.actionRef), true); assert.equal(f.grants(), 0);
  const tree = client.Panel({ model: f.model }); assert.ok(text(tree).includes('Synthetic owned session execution')); assert.ok(text(tree).includes('Exact synthetic context 中文')); assert.ok(text(tree).includes('Synthetic local provider')); assert.ok(text(tree).includes('Choose an explicit approval expiry'));
  assert.equal(nodes(tree).find(node => node.type === 'input' && node.props.type === 'datetime-local').props.value, '', 'approval duration has no selected default');
  assert.equal(await f.model.grantAction(f.action.actionRef, 9000), true); assert.equal(f.grants(), 1);
  const grant = f.calls.find(call => call.endpoint === 'v1/grant').input;
  assert.equal(grant.expiresAt, 9000); assert.equal(grant.expectedTaskVersion, 4); assert.equal(grant.expectedAuthEpoch, 2); assert.equal(grant.actionDigest, f.action.actionDigest);
  assert.equal(f.calls.some(call => /execute|send|dispatch/.test(call.endpoint)), false); assert.equal(f.model.getSnapshot().detail.task.authEpoch, 3); assert.deepEqual(f.model.getSnapshot().previews, {}); f.model.dispose();
});
test('wrong preview scope, data, concrete environment, limit or token never enables client grant', async () => {
  const corruptions = [p => ({ ...p, taskRef: d('foreign') }), p => ({ ...p, actionDigest: d('wrong') }), p => ({ ...p, previewRef: 'payload-owner' }), p => ({ ...p, description: { ...p.description, data: { ...p.description.data, digest: d('changed') } } }), p => ({ ...p, description: { ...p.description, data: { ...p.description.data, content: 'Changed unapproved prose' } } }), p => ({ ...p, description: { ...p.description, environment: { ...p.description.environment, environmentRef: d('wrong') } } }), p => ({ ...p, description: { ...p.description, limits: { ...p.description.limits, units: 2 } } }), p => ({ ...p, description: { ...p.description, targetLabel: '' } })];
  for (const response of corruptions) { const f = previewFixture({ response }); await f.model.refresh(); assert.equal(await f.model.previewAction(f.action.actionRef), false); assert.equal(await f.model.grantAction(f.action.actionRef, 9000), false); assert.equal(f.grants(), 0); f.model.dispose(); }
});
test('expired, disconnected or superseded preview cannot grant or paint newer owner material', async () => {
  const f = previewFixture(); await f.model.refresh(); await f.model.previewAction(f.action.actionRef); f.advance(2700); assert.equal(await f.model.grantAction(f.action.actionRef, 9000), false); assert.equal(f.grants(), 0); f.model.dispose();
  const gate = deferred(), g = previewFixture({ previewGate: gate }); await g.model.refresh(); const pending = g.model.previewAction(g.action.actionRef); g.model.disconnected(); gate.resolve(); assert.equal(await pending, false); assert.deepEqual(g.model.getSnapshot().previews, {}); assert.equal(g.model.getSnapshot().phase, 'offline'); assert.equal(await g.model.grantAction(g.action.actionRef, 9000), false); g.model.dispose();
  const digestGate = deferred(), h = previewFixture({ digest: () => digestGate.promise }); await h.model.refresh(); await h.model.previewAction(h.action.actionRef); const grant = h.model.grantAction(h.action.actionRef, 9000); h.model.disconnected(); digestGate.resolve(d('command')); assert.equal(await grant, false); assert.equal(h.grants(), 0); h.model.dispose();
});

test('client concrete preview and explicit grant cross genuine native RPC into scoped encrypted store; forged token cannot grant', async () => {
  const root = `${DSH_WEB_RUNTIME_ROOT}/node_modules/@deepseek-ai`;
  const { Context } = await import(`${root}/cordis/lib/index.js`), { HostConnectionService } = await import(`${root}/dsh-client-connection/lib/index.js`);
  const directory = mkdtempSync(join(tmpdir(), 'df-preview-client-')), owner = {}, ctx = new Context(), routes = new Map(); ctx.logger.exporters?.clear?.();
  const store = new RuntimeStore({ databasePath: join(directory, 'ledger.sqlite'), encryptionKey: Buffer.alloc(32, 8), principals: [{ handle: owner, role: 'owner', scope: { ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' } }], hostPermission: () => true });
  let bridge, boundary, model, forge = true, count = 0;
  try {
    const task = store.intake(owner, { taskId: 'synthetic-preview-task', provider: 'fixture', source: 'source', eventId: 'event', commandRef: d('preview-intake') }).task;
    const data = store.putData(owner, { taskRef: task.taskRef, commandRef: d('preview-context'), kind: 'context', content: 'Exact synthetic target instructions 中文', sourceRef: d('preview-source'), expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch });
    const policy = store.policy(owner, { commandRef: d('preview-policy'), expectedVersion: 1, limits: {}, modelPolicy: { version: 1, presetRefs: [d('preset')], catalogEvidenceRef: d('catalog') } });
    const spec = { actionRef: d('preview-action'), kind: 'write', role: 'worker', targetDigest: d('preview-target'), dataDigest: data.digest, units: 1, charges: { runtimeMs: 10, usageUnits: 5, costState: 'unknown' }, attemptGroupRef: d('preview-group'), attemptIndex: 1, resourcePolicyVersion: policy.version, modelPolicyVersion: 1, model: { presetRef: d('preset'), modelRef: d('model'), reasoningRef: d('reasoning'), catalogEvidenceRef: d('catalog') }, executor: { mode: 'create', generationRef: d('preview-generation'), environmentRef: d('preview-env'), bindingDigest: d('preview-binding'), toolsDigest: d('preview-tools'), permissionPolicyDigest: d('preview-permission') } };
    const action = store.planAction(owner, { taskRef: task.taskRef, commandRef: d('preview-plan'), expectedTaskVersion: data.task.version, expectedAuthEpoch: data.task.authEpoch, spec });
    boundary = new ApprovalPreview({ store, ownerHandle: owner, ttlMs: 30000, resolve: async current => ({ targetDigest: current.targetDigest, ...current.model, environmentRef: current.executor.environmentRef, bindingDigest: current.executor.bindingDigest, toolsDigest: current.executor.toolsDigest, permissionPolicyDigest: current.executor.permissionPolicyDigest, evidenceRef: d('trusted-preview-evidence'), targetLabel: 'Owned synthetic local execution', providerLabel: 'Local mock provider', modelLabel: 'Synthetic model', reasoningLabel: 'Fixture effort', presetLabel: 'Synthetic preset', environmentLabel: 'Synthetic project', cwd: directory, toolNames: [] }) });
    ctx.provide('webServer', { register(route) { routes.set(route.path, route); return () => routes.delete(route.path); } });
    await ctx.plugin({ apply(connectionCtx) { new HostConnectionService(connectionCtx, [], {isAuthenticated:request => request.headers['x-synthetic-auth'] === 'approved',authenticateApi:()=>undefined}); } });
    bridge = installOperatorBridge({ connection: ctx.connection, operations: {
      list: () => store.listTasks(owner), status: input => store.snapshot(owner, input),
      detail: input => ({ task: store.task(owner, input.taskRef), data: store.readData(owner, { taskRef: input.taskRef, recordRef: input.recordRef }) }),
      preview: input => boundary.prepare(input), grant: input => boundary.grant(input),
    } });
    model = client.createModel({ async call(channel, endpoint, payload) {
      const request = Readable.from([Buffer.from(JSON.stringify({ type: 'client-request', rpcId: 'synthetic-preview-rpc', method: endpoint, payload }))]);
      Object.assign(request, { method: 'POST', url: `${channel}/${endpoint}`, headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'content-type': 'application/json', 'x-synthetic-auth': 'approved' } });
      const parts = [], response = new Writable({ write(chunk, _encoding, done) { parts.push(Buffer.from(chunk)); done(); } }); response.writeHead = code => { response.statusCode = code; };
      await routes.get(channel).handler(request, response); assert.equal(response.statusCode, 200);
      const result = JSON.parse(Buffer.concat(parts).toString()).result;
      if (endpoint === 'v1/preview' && forge && result.ok) result.value.previewRef = d('forged-well-formed-token');
      return result;
    } }, { clock: Date.now, uuid: () => `synthetic-preview-command-${++count}`, digest: async text => d(text) });
    await model.refresh(); assert.equal(await model.previewAction(action.actionRef), true);
    assert.equal(await model.grantAction(action.actionRef, Date.now() + 60000), false);
    assert.equal(store.snapshot(owner, { taskRef: task.taskRef }).actions[0].state, 'requested');
    forge = false; await model.refresh(); assert.equal(await model.previewAction(action.actionRef), true);
    assert.equal(model.getSnapshot().previews[action.actionRef].description.data.content, 'Exact synthetic target instructions 中文');
    assert.equal(model.getSnapshot().previews[action.actionRef].description.limits.charges.costState, 'unknown');
    assert.equal(await model.grantAction(action.actionRef, Date.now() + 60000), true);
    const granted = store.snapshot(owner, { taskRef: task.taskRef }); assert.equal(granted.actions[0].state, 'requested'); assert.equal(granted.task.authEpoch, data.task.authEpoch + 1); assert.equal(Object.hasOwn(granted.actions[0], 'claimRef'), false); assert.equal(granted.workers.length, 0);
    model.disconnected(); assert.equal(await model.grantAction(action.actionRef, Date.now() + 60000), false);
  } finally { model?.dispose(); bridge?.dispose(); boundary?.dispose(); await ctx.fiber.dispose(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('preview grant digest failure is redacted, clears busy and performs no native mutation', async () => {
  const f = previewFixture({ digest: async () => { throw new Error('CLIENT-PREVIEW-SYNTHETIC-CANARY'); } });
  await f.model.refresh(); assert.equal(await f.model.previewAction(f.action.actionRef), true);
  assert.equal(await f.model.grantAction(f.action.actionRef, 9000), false); assert.equal(f.grants(), 0); assert.equal(f.model.getSnapshot().busy, false);
  assert.equal(JSON.stringify(f.model.getSnapshot()).includes('CLIENT-PREVIEW-SYNTHETIC-CANARY'), false); f.model.dispose();
});
