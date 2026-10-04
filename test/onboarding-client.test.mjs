import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const React = { Fragment: 'fragment', createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(value => value !== false && value != null) }), useSyncExternalStore: (_, get) => get(), useState: () => ['', () => {}], useEffect: () => {} };
const client = require('../src/client-entry.cjs')(name => { assert.equal(name, 'react'); return React; });
const digest = text => createHash('sha256').update(text).digest('hex');
const ok = value => ({ ok: true, value });
const location = '/synthetic-native-profile/df/tasks.sqlite';
const status = (phase = 'setup_required') => ({ phase, executionEnabled: false, storage: { location } });
const plan = (more = {}) => ({ previewRef: digest('preview'), planDigest: digest('plan'), expiresAt: 61000, description: { operation: 'create-local-storage', databaseLocation: location, identityMode: 'native-dsh-owner', encrypted: true, permissions: 'owner-only', externalExecution: false }, ...more });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture({ handle, initial = status(), preview = plan(), clock } = {}) {
  let time = 1000, current = initial; const calls = [];
  const rpc = { async call(channel, endpoint, input, signal) {
    assert.equal(channel, '/df-setup'); calls.push({ channel, endpoint, input, signal });
    if (handle) { const response = await handle(endpoint, input, signal, current); if (response !== undefined) return response; }
    if (endpoint === 'v1/status') return ok(current);
    if (endpoint === 'v1/prepare') return ok(preview);
    if (endpoint === 'v1/confirm') { current = status('ready'); return ok(current); }
    throw new Error('UNEXPECTED_SYNTHETIC_ENDPOINT');
  } };
  return { model: client.createSetupModel(rpc, { clock: clock || (() => time) }), calls, setTime: value => { time = value; }, setStatus: value => { current = value; } };
}
const nodes = node => node && typeof node === 'object' ? [node, ...node.children.flatMap(nodes)] : [];
const text = node => typeof node === 'object' ? node.children.map(text).join(' ') : String(node);
function panel(setupModel) { return client.Panel({ setupModel, model: client.createModel({ call: async () => ok([]) }) }); }
function application(rpc) {
  const registrations = [], callbacks = new Map(), cleanups = [];
  const ctx = { connection: { rpc, state: { subscribe: () => () => {} }, generation: { getSnapshot: () => ({}) } }, layout: {}, slots: { inject(_key, install) { install(); }, register(spec, component) { registrations.push({ spec, component }); return () => {}; } }, effect(install) { const cleanup = install(); if (typeof cleanup === 'function') cleanups.push(cleanup); }, on(event, callback) { callbacks.set(event, callback); } };
  client.apply(ctx);
  const props = registrations.find(value => value.spec.key === 'df').spec.inject();
  return { ...props, reset: () => callbacks.get('connection/reset')(), close: () => cleanups.reverse().forEach(cleanup => cleanup()) };
}

test('setup first load and preview only read exact setup RPC; unchecked consent cannot confirm', async () => {
  const f = fixture(); assert.equal(await f.model.confirm(), false); await f.model.refresh(); await f.model.prepare();
  assert.deepEqual(f.calls.map(value => [value.channel, value.endpoint, value.input]), [['/df-setup', 'v1/status', {}], ['/df-setup', 'v1/prepare', {}]]);
  assert.equal(await f.model.confirm(), false); assert.equal(f.model.canConfirm(), false);
  assert.equal(Object.isFrozen(f.model.getSnapshot().preview.description), true);
  const tree = panel(f.model), elements = nodes(tree);
  assert.equal(text(tree).includes(location), true); assert.equal(text(tree).includes('grants no model, tool, action, recipient or event authority'), true);
  assert.equal(text(tree).includes('Model and action execution are unavailable'), true);
  assert.equal(elements.some(value => value.type === 'button' && text(value) === 'Create task'), false);
  assert.equal(elements.find(value => value.type === 'input' && value.props.type === 'checkbox').props.checked, false);
  assert.equal(elements.find(value => value.type === 'button' && text(value) === 'Confirm local setup').props.disabled, true); f.model.dispose();
});

test('checkbox and separate confirmation control submit only the immutable displayed plan once', async () => {
  const gate = deferred(), f = fixture({ handle: endpoint => endpoint === 'v1/confirm' ? gate.promise : undefined }); await f.model.refresh(); await f.model.prepare();
  nodes(panel(f.model)).find(value => value.type === 'input').props.onChange({ target: { checked: true } });
  const confirm = nodes(panel(f.model)).find(value => value.type === 'button' && text(value) === 'Confirm local setup'); assert.equal(confirm.props.disabled, false);
  const pending = confirm.props.onClick(); assert.equal(await f.model.confirm(), false); assert.equal(f.model.getSnapshot().busy, 'confirm');
  assert.deepEqual(f.calls.at(-1).input, { previewRef: digest('preview'), planDigest: digest('plan'), accept: true });
  assert.equal(f.calls.filter(value => value.endpoint === 'v1/confirm').length, 1);
  assert.equal(nodes(panel(f.model)).some(value => value.type === 'input' && value.props.type === 'checkbox'), false);
  gate.resolve(ok(status('ready'))); assert.equal(await pending, true); assert.equal(f.model.getSnapshot().executionEnabled, false); assert.equal(f.model.getSnapshot().preview, null); f.model.dispose();
});

test('literal checkbox values and expiry boundaries fence confirmation locally', async () => {
  for (const value of [undefined, null, 1, 'true', {}, false]) { const f = fixture(); await f.model.refresh(); await f.model.prepare(); f.model.setAccepted(value); assert.equal(await f.model.confirm(), false); assert.equal(f.calls.some(value => value.endpoint === 'v1/confirm'), false); f.model.dispose(); }
  for (const boundary of [60999, 61000, 61001, 999]) { const f = fixture(); await f.model.refresh(); await f.model.prepare(); f.model.setAccepted(true); f.setTime(boundary); assert.equal(f.model.canConfirm(), boundary === 60999); assert.equal(await f.model.confirm(), boundary === 60999); assert.equal(f.calls.filter(value => value.endpoint === 'v1/confirm').length, boundary === 60999 ? 1 : 0); f.model.dispose(); }
});

test('refresh, new preview and reconnect always erase prior acceptance without confirmation', async () => {
  const f = fixture(); await f.model.refresh(); await f.model.prepare(); f.model.setAccepted(true); await f.model.prepare(); assert.equal(f.model.getSnapshot().accepted, false);
  f.model.setAccepted(true); await f.model.refresh(); assert.equal(f.model.getSnapshot().preview, null); await f.model.prepare(); f.model.setAccepted(true);
  f.model.disconnected(); assert.equal(f.model.getSnapshot().phase, 'offline'); assert.equal(f.model.getSnapshot().accepted, false); await f.model.refresh();
  assert.equal(f.model.getSnapshot().preview, null); assert.equal(f.calls.some(value => value.endpoint === 'v1/confirm'), false); f.model.dispose();
});

test('disconnection aborts pending prepare and late replies cannot publish an earlier plan', async () => {
  const gate = deferred(), f = fixture({ handle: endpoint => endpoint === 'v1/prepare' ? gate.promise : undefined }); await f.model.refresh(); const pending = f.model.prepare();
  f.model.disconnected(); assert.equal(f.calls.at(-1).signal.aborted, true); gate.resolve(ok(plan())); assert.equal(await pending, false);
  assert.equal(f.model.getSnapshot().phase, 'offline'); assert.equal(f.model.getSnapshot().busy, null); assert.equal(f.model.getSnapshot().preview, null); f.model.dispose();
});

test('superseded status and confirmation results cannot replace a new connection snapshot', async () => {
  const read = deferred(); let delayed = true;
  const f = fixture({ handle: endpoint => endpoint === 'v1/status' && delayed ? read.promise : undefined }); const old = f.model.refresh(); delayed = false; await f.model.refresh();
  read.resolve(ok(status('recovery_required'))); await old; assert.equal(f.model.getSnapshot().phase, 'setup_required'); f.model.dispose();
  const commit = deferred(), g = fixture({ handle: endpoint => endpoint === 'v1/confirm' ? commit.promise : undefined }); await g.model.refresh(); await g.model.prepare(); g.model.setAccepted(true); const pending = g.model.confirm();
  g.model.disconnected(); await g.model.refresh(); const latest = g.model.getSnapshot(); commit.resolve(ok(status('ready'))); assert.equal(await pending, false); assert.equal(g.model.getSnapshot(), latest);
  assert.equal(g.calls.filter(value => value.endpoint === 'v1/confirm').length, 1); g.model.dispose();
});

test('uncertain confirm performs status reconciliation only and never repeats initialization', async () => {
  for (const outcome of ['ready', 'recovery_required', 'setup_required']) {
    const f = fixture({ handle: (endpoint, _input, _signal) => { if (endpoint === 'v1/confirm') { f.setStatus(status(outcome)); throw new Error('SYNTHETIC_PRIVATE_CONFIRM_CANARY'); } } });
    await f.model.refresh(); await f.model.prepare(); f.model.setAccepted(true); assert.equal(await f.model.confirm(), false);
    assert.deepEqual(f.calls.map(value => value.endpoint), ['v1/status', 'v1/prepare', 'v1/confirm', 'v1/status']);
    assert.equal(f.model.getSnapshot().phase, outcome); assert.equal(f.model.getSnapshot().accepted, false); assert.equal(f.model.getSnapshot().error, 'RESULT_UNCONFIRMED');
    assert.equal(JSON.stringify(f.model.getSnapshot()).includes('SYNTHETIC_PRIVATE_CONFIRM_CANARY'), false); assert.equal(text(panel(f.model)).includes('SYNTHETIC_PRIVATE_CONFIRM_CANARY'), false);
    assert.equal(await f.model.confirm(), false); assert.equal(f.calls.filter(value => value.endpoint === 'v1/confirm').length, 1); f.model.dispose();
  }
});

test('unload aborts all setup requests and closed references perform no calls', async () => {
  const gate = deferred(), f = fixture({ handle: endpoint => endpoint === 'v1/confirm' ? gate.promise : undefined }); await f.model.refresh(); await f.model.prepare(); f.model.setAccepted(true); const pending = f.model.confirm();
  f.model.dispose(); assert.equal(f.calls.at(-1).signal.aborted, true); const old = f.model.getSnapshot(); gate.resolve(ok(status('ready'))); assert.equal(await pending, false);
  assert.equal(await f.model.refresh(), false); assert.equal(await f.model.prepare(), false); assert.equal(await f.model.confirm(), false); assert.equal(f.model.getSnapshot(), old); assert.equal(f.calls.length, 3);
});

test('closed status projection rejects hostile fields, unexpected semantics and accessors without rendering them', async () => {
  let getterCalls = 0; const accessor = status(); Object.defineProperty(accessor, 'phase', { enumerable: true, get() { getterCalls++; return 'ready'; } });
  const vectors = [null, [], 'ready', { ...status(), privateKey: 'SYNTHETIC_KEY_CANARY' }, { ...status(), executionEnabled: true }, { ...status(), phase: 'configured' }, { ...status(), storage: { location, token: 'SYNTHETIC_KEY_CANARY' } }, { ...status(), reasonCode: 'SYNTHETIC_KEY_CANARY' }, { ...status(), storage: { location: '/synthetic\nCANARY' } }, accessor];
  for (const initial of vectors) { const f = fixture({ initial }); assert.equal(await f.model.refresh(), false); assert.equal(f.model.getSnapshot().phase, 'unavailable'); assert.equal(f.model.getSnapshot().error, 'INVALID_RESPONSE'); assert.equal(f.model.getSnapshot().storage, null); assert.equal(JSON.stringify(f.model.getSnapshot()).includes('SYNTHETIC_KEY_CANARY'), false); f.model.dispose(); }
  assert.equal(getterCalls, 0);
});

test('closed previews reject different targets, authority, TTL, references, unknown secret fields and accessors', async () => {
  let getterCalls = 0; const accessor = plan(); Object.defineProperty(accessor.description, 'encrypted', { enumerable: true, get() { getterCalls++; return true; } });
  const vectors = [plan({ previewRef: digest('preview') + '\n' }), plan({ planDigest: 'A'.repeat(64) }), plan({ expiresAt: 61001 }), plan({ expiresAt: 1000 }), plan({ secret: 'SYNTHETIC_KEY_CANARY' }), ...[{ databaseLocation: '/different' }, { identityMode: 'payload-owner' }, { encrypted: false }, { externalExecution: true }, { permissions: 'shared' }, { token: 'SYNTHETIC_KEY_CANARY' }].map(change => plan({ description: { ...plan().description, ...change } })), accessor];
  for (const preview of vectors) { const f = fixture({ preview }); await f.model.refresh(); assert.equal(await f.model.prepare(), false); assert.equal(f.model.getSnapshot().preview, null); assert.equal(f.model.setAccepted(true), false); assert.equal(await f.model.confirm(), false); assert.equal(f.calls.some(value => value.endpoint === 'v1/confirm'), false); assert.equal(JSON.stringify(f.model.getSnapshot()).includes('SYNTHETIC_KEY_CANARY'), false); f.model.dispose(); }
  assert.equal(getterCalls, 0);
});

test('confirmation extra fields or a changed target are unconfirmed and followed by status only', async () => {
  for (const result of [{ ...status('ready'), credential: 'SYNTHETIC_KEY_CANARY' }, { ...status('ready'), storage: { location: '/different' } }, null]) {
    const f = fixture({ handle: endpoint => endpoint === 'v1/confirm' ? ok(result) : undefined }); await f.model.refresh(); await f.model.prepare(); f.model.setAccepted(true); assert.equal(await f.model.confirm(), false);
    assert.equal(f.model.getSnapshot().phase, 'setup_required'); assert.equal(f.model.getSnapshot().error, 'INVALID_RESPONSE'); assert.equal(f.calls.at(-1).endpoint, 'v1/status'); assert.equal(JSON.stringify(f.model.getSnapshot()).includes('SYNTHETIC_KEY_CANARY'), false); f.model.dispose();
  }
});

test('clock and transport error accessors cannot leak callback prose or wedge pending state', async () => {
  const f = fixture({ clock: () => { throw new Error('SYNTHETIC_CLOCK_CANARY'); } }); await f.model.refresh(); assert.equal(await f.model.prepare(), false); assert.equal(f.model.getSnapshot().busy, null); assert.equal(f.model.getSnapshot().error, 'INVALID_RESPONSE'); assert.equal(Number.isNaN(f.model.now()), true); f.model.dispose();
  let reads = 0; const failure = {}; Object.defineProperty(failure, 'message', { get() { reads++; throw new Error('SYNTHETIC_ERROR_CANARY'); } });
  const g = fixture({ handle() { throw failure; } }); await g.model.refresh(); assert.equal(g.model.getSnapshot().error, 'RESULT_UNCONFIRMED'); assert.equal(reads, 0); assert.equal(JSON.stringify(g.model.getSnapshot()).includes('CANARY'), false); g.model.dispose();
});

test('recovery, unavailable, loading, disconnected and ready phases do not expose setup confirmation', async () => {
  for (const phase of ['recovery_required', 'unavailable', 'ready']) { const f = fixture({ initial: status(phase) }); await f.model.refresh(); assert.equal(await f.model.prepare(), false); assert.equal(f.model.canConfirm(), false); assert.equal(nodes(panel(f.model)).some(value => value.type === 'button' && text(value) === 'Confirm local setup'), false); assert.equal(text(panel(f.model)).includes('Model and action execution are unavailable'), true); f.model.dispose(); }
  const f = fixture(); for (const disconnect of [false, true]) { if (disconnect) f.model.disconnected(); assert.equal(nodes(panel(f.model)).find(value => value.type === 'button' && text(value) === 'Preview local setup').props.disabled, true); } f.model.dispose();
});

test('native application mount and reconnect perform only setup status until actual ready', async () => {
  const calls = []; let phase = 'setup_required';
  const app = application({ async call(channel, endpoint, input) { calls.push({ channel, endpoint, input }); if (channel === '/df-setup') return ok(status(phase)); assert.equal(endpoint, 'v1/list'); return ok([]); } }); await settle();
  assert.deepEqual(calls.map(value => [value.channel, value.endpoint]), [['/df-setup', 'v1/status']]); app.reset(); await settle(); assert.equal(calls.length, 2); assert.equal(calls.some(value => value.endpoint === 'v1/confirm'), false);
  phase = 'ready'; app.reset(); await settle(); assert.equal(app.model.getSnapshot().phase, 'ready'); assert.equal(calls.at(-1).channel, '/df-rpc'); assert.equal(text(client.Panel(app)).includes('Create task'), true); app.close();
});

test('advanced compatibility requires exact pinned status404 signature and a successful original list', async () => {
  const missing = 'transport failure for /df-setup/v1/status: HTTP 404';
  const faults = [missing, missing + ' extra', 'prefix ' + missing, 'transport failure for /df-setup/v1/prepare: HTTP 404', 'transport failure for /df-setup/v1/status: HTTP 401', 'transport failure for /df-setup/v1/status: HTTP 403', 'transport failure for /df-setup/v1/status: HTTP 500', 'network unavailable'];
  for (const message of faults) { const calls = [], app = application({ async call(channel, endpoint) { calls.push({ channel, endpoint }); if (channel === '/df-setup') throw new Error(message); return ok([]); } }); await settle();
    assert.equal(app.setupModel.getSnapshot().routeMissing, message === missing); assert.equal(calls.filter(value => value.channel === '/df-rpc').length, message === missing ? 1 : 0); assert.equal(text(client.Panel(app)).includes('Create task'), message === missing); app.close();
  }
  const app = application({ async call(channel) { if (channel === '/df-setup') throw new Error(missing); return { ok: false, error: { code: 'OPERATOR_REQUIRED' } }; } }); await settle(); assert.equal(text(client.Panel(app)).includes('Create task'), false); assert.equal(app.model.getSnapshot().phase, 'error'); app.close();
});

test('manual setup status refresh fences an earlier advanced list until a fresh successful list', async () => {
  const gate = deferred(); let blocked = false;
  const app = application({ async call(channel) { if (channel === '/df-setup') throw new Error('transport failure for /df-setup/v1/status: HTTP 404'); if (blocked) return gate.promise; return ok([]); } }); await settle(); assert.equal(text(client.Panel(app)).includes('Create task'), true);
  blocked = true; app.reset(); await settle(); assert.equal(text(client.Panel(app)).includes('Create task'), false); gate.resolve(ok([])); await settle(); assert.equal(text(client.Panel(app)).includes('Create task'), true); app.close();
});

test('captured old checkbox and confirm handlers cannot accept or confirm a replacement preview', async () => {
  let generation = 0;
  const f = fixture({ handle: endpoint => endpoint === 'v1/prepare' ? ok(plan({ previewRef: digest(`preview-${++generation}`), planDigest: digest(`plan-${generation}`) })) : undefined });
  await f.model.refresh(); await f.model.prepare(); const oldCheckbox = nodes(panel(f.model)).find(value => value.type === 'input'); oldCheckbox.props.onChange({ target: { checked: true } });
  const oldConfirm = nodes(panel(f.model)).find(value => value.type === 'button' && text(value) === 'Confirm local setup');
  await f.model.prepare(); oldCheckbox.props.onChange({ target: { checked: true } }); assert.equal(f.model.getSnapshot().accepted, false);
  const currentCheckbox = nodes(panel(f.model)).find(value => value.type === 'input'); currentCheckbox.props.onChange({ target: { checked: true } });
  assert.equal(await oldConfirm.props.onClick(), false); assert.equal(f.calls.some(value => value.endpoint === 'v1/confirm'), false); assert.equal(f.model.canConfirm(), true); f.model.dispose();
});

test('observed expiry followed by clock rollback cannot resurrect checked consent', async () => {
  const f = fixture(); await f.model.refresh(); await f.model.prepare(); f.model.setAccepted(true); f.setTime(61000); assert.equal(f.model.canConfirm(), false);
  assert.equal(nodes(panel(f.model)).find(value => value.type === 'input').props.checked, false); f.setTime(60999); assert.equal(f.model.canConfirm(), false); assert.equal(await f.model.confirm(), false); assert.equal(f.calls.some(value => value.endpoint === 'v1/confirm'), false); f.model.dispose();
});

test('a disconnect triggered synchronously by pending-state publication prevents confirmation admission', async () => {
  const f = fixture(); await f.model.refresh(); await f.model.prepare(); f.model.setAccepted(true);
  f.model.subscribe(() => { if (f.model.getSnapshot().busy === 'confirm') f.model.disconnected(); });
  assert.equal(await f.model.confirm(), false); assert.equal(f.calls.some(value => value.endpoint === 'v1/confirm'), false); assert.equal(f.model.getSnapshot().phase, 'offline'); f.model.dispose();
});

test('preview lifetime upper bound uses response time while preserving request-time rollback fencing', async () => {
  const f = fixture({ handle: endpoint => { if (endpoint === 'v1/prepare') { f.setTime(1200); return ok(plan({ expiresAt: 61200 })); } } }); await f.model.refresh(); assert.equal(await f.model.prepare(), true); f.model.setAccepted(true); assert.equal(await f.model.confirm(), true); f.model.dispose();
});
