// Independent typed source/emitted-bundle carrier vectors. No DOM, browser,
// native authentication, HTTP, filesystem setup, provider or model execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const React = { Fragment: 'fragment', createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(value => value !== false && value != null) }), useSyncExternalStore: (_subscribe, get) => get(), useState: initial => [initial, () => {}], useEffect: () => {} };
const materialize = factory => factory(name => { assert.equal(name, 'react'); return React; });
const source = materialize(require('../src/client-entry.cjs'));
let registration;
new Function('window', readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'))({ __ModuleLoader__: { load(value) { assert.equal(registration, undefined); registration = value; } } });
assert.equal(registration.id, 'dsh-fishball'); const generated = materialize(registration.factory);
const hex = text => createHash('sha256').update(text).digest('hex');
const missing = code => `transport failure for /df-setup/v1/status: HTTP ${code}`;
const ok = value => ({ ok: true, value });
const status = phase => ({ phase, executionEnabled: false, storage: { location: '/synthetic-native-profile/df-data/runtime.sqlite' } });
const task = name => ({ taskRef: hex(name), status: 'queued', version: 1, authEpoch: 0, updatedAt: 1000 });
// Mirrors the actual owner snapshot (RuntimeStore emits executions since aab7e6f; the
// 4fea280 Panel renders them for owner-finish recovery).
const detail = value => ({ task: value, control: 'active', data: [], actions: [], workers: [], artifacts: [], deliveries: [], audits: [], reviews: [], progress: [], executions: [] });
const gate = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const drain = () => new Promise(resolve => setImmediate(resolve));
const text = value => value && typeof value === 'object' ? value.children.map(text).join(' ') : String(value);
const visible = app => text(app.panel()).includes('Create task');
const canary = 'SYNTHETIC_405_PRIVATE_CANARY';
const noEffects = calls => assert.equal(calls.some(call => /prepare|confirm|grant|dispatch|execute|intake|control/.test(call.endpoint)), false);

function application(client, handler) {
  const calls = [], registrations = [], events = new Map(), cleanups = [], stateListeners = new Set(); let generation = {};
  const rpc = { async call(channel, endpoint, input, signal) { calls.push({ channel, endpoint, input: structuredClone(input), signal }); return handler(channel, endpoint, input, signal); } };
  client.apply({
    connection: { rpc, generation: { getSnapshot: () => generation }, state: { subscribe(fn) { stateListeners.add(fn); return () => stateListeners.delete(fn); } } }, layout: {},
    slots: { inject(_slot, install) { install(); }, register(spec, component) { registrations.push({ spec, component }); return () => {}; } },
    effect(install) { const cleanup = install(); if (typeof cleanup === 'function') cleanups.push(cleanup); }, on(name, fn) { events.set(name, fn); },
  });
  const props = registrations.find(value => value.spec.key === 'df').spec.inject();
  return { ...props, calls, panel: () => client.Panel(props), reset() { generation = {}; events.get('connection/reset')(); }, offline() { generation = null; for (const fn of stateListeners) fn(); }, close() { for (const fn of cleanups.splice(0).reverse()) fn(); } };
}
function safe(app) { assert.equal(JSON.stringify(app.setupModel.getSnapshot()).includes(canary), false); assert.equal(text(app.panel()).includes(canary), false); }

for (const [label, client] of [['source', source], ['generated', generated]]) {
  test(`independent exact carrier ${label} 404/405 require fresh coherent nonempty task readback and confer no consent`, async () => {
    for (const code of [404, 405]) {
      const current = task(`native-${code}`), app = application(client, (channel, endpoint, input) => {
        if (channel === '/df-setup') throw new Error(missing(code));
        if (endpoint === 'v1/list') { assert.deepEqual(input, {}); return ok([current]); }
        assert.equal(endpoint, 'v1/status'); assert.deepEqual(input, { taskRef: current.taskRef }); return ok(detail(current));
      });
      await drain(); assert.equal(app.setupModel.getSnapshot().routeMissing, true); assert.equal(app.model.getSnapshot().stale, false); assert.equal(app.model.getSnapshot().selected, current.taskRef); assert.equal(visible(app), true);
      assert.equal(app.setupModel.canConfirm(), false); assert.equal(app.setupModel.setAccepted(true), false); assert.equal(await app.setupModel.prepare(), false); assert.equal(await app.setupModel.confirm(), false);
      assert.deepEqual(app.calls.map(value => [value.channel, value.endpoint]), [['/df-setup', 'v1/status'], ['/df-rpc', 'v1/list'], ['/df-rpc', 'v1/status']]); noEffects(app.calls); app.close();
    }
  });

  test(`independent exact carrier ${label} signature/prototype/accessor/wire negatives cannot start a fallback list`, async () => {
    let getterCalls = 0;
    const accessor = Object.defineProperty({}, 'message', { get() { getterCalls++; throw new Error(canary); } });
    const inherited = Object.create({ message: missing(405) });
    const faults = [
      new Error(missing(405) + ' '), new Error(' ' + missing(405)), new Error(missing(405) + '\r\n'), new Error(missing(405).replace('HTTP', 'http')),
      new Error(missing(405).replace(': HTTP', ':\u00a0HTTP')), new Error(missing(405).replace('405', '0405')), new Error(missing(405).replace('405', '4050')),
      new Error('transport failure for /df-setup/v1/confirm: HTTP 405'), new Error('transport failure for /df-rpc/v1/status: HTTP 405'),
      ...[401, 403, 500, 503].map(code => new Error(missing(code))), new Error('network timeout ' + canary), missing(405), accessor, inherited,
      { ok: false, error: { code: missing(405), message: missing(405) } }, { ok: false, error: { code: 'OPERATOR_REQUIRED', message: missing(405) } },
      { ok: true, value: status('ready'), error: { code: missing(405) } }, ok({ ...status('ready'), extra: canary }), ok([]),
    ];
    for (const fault of faults) {
      const app = application(client, channel => { if (channel !== '/df-setup') { assert.fail('invalid signature cannot call task RPC'); } if (fault instanceof Error || typeof fault === 'string' || fault === accessor || fault === inherited) throw fault; return fault; });
      await drain(); assert.equal(app.setupModel.getSnapshot().routeMissing, false); assert.equal(visible(app), false); assert.equal(app.calls.length, 1); safe(app); noEffects(app.calls); app.close();
    }
    assert.equal(getterCalls, 0);
  });

  test(`independent exact carrier ${label} original list needs literal successful envelope and bounded valid task metadata`, async () => {
    const current = task('valid-list');
    const faults = [ok(null), ok('ready'), ok({ tasks: [] }), ok([{}]), ok([{ ...current, version: 0 }]), ok([{ ...current, authEpoch: -1 }]), ok([{ ...current, status: 'unknown' }]), ok(Array(1001).fill(current)),
      { ok: false, error: { code: 'OPERATOR_REQUIRED' } }, { ok: 1, value: [] }, { ok: 'true', value: [] }, { ok: true, value: [], error: { code: 'OPERATOR_REQUIRED' } }];
    for (const result of faults) {
      const app = application(client, channel => { if (channel === '/df-setup') throw new Error(missing(405)); return result; });
      await drain(); assert.equal(app.setupModel.getSnapshot().routeMissing, true); assert.equal(app.model.getSnapshot().stale, true, 'malformed success cannot satisfy the fresh-list gate'); assert.equal(visible(app), false); assert.equal(app.calls.length, 2); noEffects(app.calls); app.close();
    }
  });

  test(`independent exact carrier ${label} native-client disconnect state or disposal aborts pending list without late publication`, async () => {
    for (const operation of ['offline', 'close']) {
      const receipt = gate(), app = application(client, channel => { if (channel === '/df-setup') throw new Error(missing(405)); return receipt.promise; });
      await drain(); assert.equal(app.model.getSnapshot().phase, 'loading'); assert.equal(visible(app), false); const request = app.calls.at(-1);
      app[operation](); assert.equal(request.signal.aborted, true); const setup = app.setupModel.getSnapshot(), model = app.model.getSnapshot(); receipt.resolve(ok([])); await drain();
      assert.equal(app.setupModel.getSnapshot(), setup); assert.equal(app.model.getSnapshot(), model); assert.equal(visible(app), false); noEffects(app.calls); app.close();
    }
  });

  test(`independent exact carrier ${label} newest required/recovery/unavailable status fences an earlier advanced list`, async () => {
    for (const phase of ['setup_required', 'recovery_required', 'unavailable']) {
      let first = true; const receipt = gate(), app = application(client, channel => { if (channel === '/df-setup') { if (first) throw new Error(missing(405)); return ok(status(phase)); } return receipt.promise; });
      await drain(); first = false; app.reset(); await drain(); const latest = app.setupModel.getSnapshot(); assert.equal(latest.phase, phase); assert.equal(latest.routeMissing, false);
      receipt.resolve(ok([])); await drain(); assert.equal(app.setupModel.getSnapshot(), latest); assert.equal(app.model.getSnapshot().stale, true); assert.equal(visible(app), false); assert.equal(app.calls.filter(value => value.channel === '/df-rpc').length, 1); noEffects(app.calls); app.close();
    }
  });

  test(`independent exact carrier ${label} superseded status and list generations cannot publish or overwrite newer task`, async () => {
    const oldStatus = gate(); let statuses = 0;
    const a = application(client, channel => { assert.equal(channel, '/df-setup'); return ++statuses === 1 ? oldStatus.promise : ok(status('setup_required')); });
    await drain(); a.reset(); await drain(); const latest = a.setupModel.getSnapshot(); oldStatus.reject(new Error(missing(405))); await drain();
    assert.equal(a.setupModel.getSnapshot(), latest); assert.equal(latest.phase, 'setup_required'); assert.equal(a.calls.filter(value => value.channel === '/df-rpc').length, 0); noEffects(a.calls); a.close();
    const oldList = gate(), oldTask = task('old-generation-task'), newTask = task('current-generation-task'); let lists = 0;
    const b = application(client, (channel, endpoint, input) => { if (channel === '/df-setup') throw new Error(missing(405)); if (endpoint === 'v1/list') return ++lists === 1 ? oldList.promise : ok([newTask]); assert.deepEqual(input, { taskRef: newTask.taskRef }); return ok(detail(newTask)); });
    await drain(); const firstList = b.calls.find(value => value.endpoint === 'v1/list'); b.reset(); await drain(); assert.equal(firstList.signal.aborted, true); const current = b.model.getSnapshot();
    assert.equal(current.selected, newTask.taskRef); assert.equal(visible(b), true); oldList.resolve(ok([oldTask])); await drain(); assert.equal(b.model.getSnapshot(), current); assert.equal(b.model.getSnapshot().selected, newTask.taskRef); noEffects(b.calls); b.close();
  });

  test(`independent exact carrier ${label} uncertain confirm followed by exact405 readback never acquires refresh-only fallback`, async () => {
    let statuses = 0; const preview = { previewRef: hex('explicit-405-preview'), planDigest: hex('explicit-405-plan'), expiresAt: Date.now() + 60000, description: { operation: 'create-local-storage', databaseLocation: status('setup_required').storage.location, identityMode: 'native-dsh-owner', encrypted: true, permissions: 'owner-only', externalExecution: false } };
    const app = application(client, (channel, endpoint) => {
      assert.equal(channel, '/df-setup', 'uncertain setup must not call advanced task route');
      if (endpoint === 'v1/status') { if (++statuses > 1) throw new Error(missing(405)); return ok(status('setup_required')); }
      if (endpoint === 'v1/prepare') return ok(preview);
      assert.equal(endpoint, 'v1/confirm'); throw new Error('transport failure for /df-setup/v1/confirm: HTTP 405');
    });
    await drain(); assert.equal(await app.setupModel.prepare(), true); assert.equal(app.setupModel.setAccepted(true), true); assert.equal(await app.setupModel.confirm(), false);
    assert.equal(app.setupModel.getSnapshot().routeMissing, false); assert.equal(app.setupModel.getSnapshot().preview, null); assert.equal(app.setupModel.getSnapshot().accepted, false); assert.equal(visible(app), false);
    assert.equal(await app.setupModel.confirm(), false); assert.equal(app.calls.filter(value => value.endpoint === 'v1/confirm').length, 1); assert.equal(app.calls.filter(value => value.endpoint === 'v1/status').length, 2); app.close();
  });

  test(`independent exact carrier ${label} previously validated advanced tasks do not survive newer status auth or malformed failure`, async () => {
    for (const failure of [new Error('OPERATOR_REQUIRED'), new Error(missing(403)), ok({ ...status('ready'), extra: canary })]) {
      let phase = 'initial'; const app = application(client, channel => { if (channel === '/df-setup') { if (phase === 'initial') throw new Error(missing(405)); if (failure instanceof Error) throw failure; return failure; } return ok([]); });
      await drain(); assert.equal(visible(app), true); phase = 'changed'; app.reset(); await drain();
      assert.equal(app.setupModel.getSnapshot().routeMissing, false); assert.equal(app.model.getSnapshot().stale, true); assert.equal(visible(app), false); assert.equal(app.calls.filter(value => value.channel === '/df-rpc').length, 1); safe(app); noEffects(app.calls); app.close();
    }
  });

  test(`independent exact carrier ${label} synchronous close on missing-route publication prevents the follow-on RPC`, async () => {
    const app = application(client, channel => { if (channel === '/df-setup') throw new Error(missing(405)); assert.fail('closed client cannot start list'); });
    app.setupModel.subscribe(() => { if (app.setupModel.getSnapshot().routeMissing) app.close(); });
    await drain(); assert.equal(app.calls.length, 1); assert.equal(visible(app), false); noEffects(app.calls); app.close();
  });
}
