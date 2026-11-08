import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { CASE, loadRuntime, createRoot, empty } from './fixtures/runtime-isolation-transport-support.mjs';
import { installNetworkTripwire } from './fixtures/runtime-isolation-support.mjs';

// Independent requirements-only proof: direct same-process carriers, NOT IPC,
// browser ClientSessions/UI, OS isolation or a credential/account bridge.
const selected = process.env.DSH_RUNTIME_ROOT;
test('public rc.3 private gateway transport boundary', {
  skip: selected === undefined ? 'opt in with DSH_RUNTIME_ROOT pointing to installed node_modules' : false,
  timeout: CASE.timeout,
}, async t => {
  assert.ok(selected.trim(), 'DSH_RUNTIME_ROOT must not be empty');
  const runtime = await loadRuntime(selected);
  const guard = installNetworkTripwire();
  t.after(() => { guard.restore(); assert.deepEqual(guard.attempts, []); });
  const parent = fileURLToPath(new URL('../.runtime/', import.meta.url));
  await mkdir(parent, { recursive: true });
  const scratch = await mkdtemp(join(parent, 'runtime-isolation-transport-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const host = await createRoot(runtime, CASE.host, join(scratch, CASE.host));
  t.after(() => host.dispose());
  const privateRoot = await createRoot(runtime, CASE.private, join(scratch, CASE.private));
  t.after(() => privateRoot.dispose());
  const privateValue = { root: CASE.private, value: CASE.text };

  await t.test('invoke, stream and uplink route only to private controller; host observers are live', async () => {
    assert.deepEqual(await host.invoke('invoke', { value: CASE.text }), { root: CASE.host, value: CASE.text });
    const baseline = structuredClone(host.observed);
    assert.deepEqual(await privateRoot.invoke('invoke', { value: CASE.text }), privateValue);
    assert.deepEqual(await privateRoot.rpc(CASE.namespace + '/invoke', { args: { value: CASE.text } }), { ok: true, value: privateValue });
    const uplink = async function* () { yield 'uplink'; };
    const stream = await privateRoot.ctx.typertGateway.stream({ namespace: CASE.namespace, method: 'stream',
      args: { value: CASE.text }, peer: privateRoot.peer, uplink: uplink() });
    assert.deepEqual(await Array.fromAsync(stream), [privateValue, { root: CASE.private, value: 'uplink' }]);
    assert.deepEqual(host.observed, baseline);
    assert.equal(privateRoot.observed.calls.length, 3);
    assert.deepEqual(privateRoot.observed.events, [CASE.text, CASE.text]);
    await assert.rejects(privateRoot.invoke('stream', { value: CASE.text }), { code: 'gateway/signature-invalid' });
  });

  await t.test('no answerer fails closed even when host has an allowing plugin', async () => {
    host.ctx.on('approval/request', () => 'allowed-once');
    assert.equal(await host.invoke('approve'), 'allowed-once');
    const baseline = structuredClone(host.observed);
    assert.equal(await privateRoot.invoke('approve'), 'unavailable');
    assert.deepEqual(host.observed, baseline);
    const audit = privateRoot.journal.slice(-2);
    assert.deepEqual(audit.map(event => event.type), ['approval/asked', 'approval/decided']);
    assert.equal(audit[1].data.outcome, 'unavailable');
    assert.equal(audit[0].data.id, audit[1].data.id);
  });

  await t.test('real remote event assembly returns approval directly through private connection', async () => {
    await privateRoot.mountRemotes();
    const control = new AbortController();
    t.after(() => control.abort());
    const events = await privateRoot.ctx.typertGateway.wireStream.open(runtime.wire.REMOTE_EVENT_STREAM_ENDPOINT,
      runtime.wire.REMOTE_EVENT_STREAM_PAYLOAD, empty(), privateRoot.peer, control.signal);
    const iterator = events[Symbol.asyncIterator]();
    const ready = (await iterator.next()).value;
    assert.equal(ready.type, 'ready');
    assert.equal(privateRoot.ctx.typertGateway.hasLiveClient(), true);
    const baseline = structuredClone(host.observed);
    const approval = privateRoot.invoke('approve');
    const frame = (await iterator.next()).value;
    assert.equal(frame.type, 'waterfall');
    assert.equal(frame.event, 'approval/request');
    assert.equal(frame.agentId, privateRoot.agent.id);
    assert.equal(frame.request.toolName, CASE.namespace);
    assert.equal(Object.hasOwn(frame.request, 'agent'), false);
    const result = await privateRoot.rpc(runtime.wire.REMOTE_EVENT_RESULT_ENDPOINT, { args: {
      clientId: ready.clientId, eventId: frame.eventId,
      outcome: { kind: 'result', value: 'allowed-once' },
    } });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(await approval, 'allowed-once');
    assert.deepEqual(host.observed, baseline);
    control.abort();
    await iterator.return();
    assert.equal(privateRoot.ctx.typertGateway.hasLiveClient(), false);
  });
});
