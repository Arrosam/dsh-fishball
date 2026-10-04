import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { runtimeFiles, runtimePaths, checkPrivateFile } from './runtime-web.mjs';
const origin = 'http://127.0.0.1:3080', d = value => createHash('sha256').update(value).digest('hex');
async function request(url, options) {
  try { return await fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(5000) }); }
  catch { throw new Error('RUNTIME_FIXTURE_HTTP_UNAVAILABLE'); }
}
export async function runRuntimeSmoke(cycle, expectedPid) {
  assert.ok(Number.isSafeInteger(expectedPid) && expectedPid > 1, 'SMOKE_PID_INVALID');
  assert.ok(['initial', 'restart'].includes(cycle), 'SMOKE_CYCLE_INVALID');
  let state;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try { state = JSON.parse(readFileSync(runtimeFiles.state, 'utf8')); if (state.phase === 'active' && state.pid === expectedPid) break; } catch {}
    await setTimeout(100);
  }
  assert.equal(state?.phase, 'active', 'RUNTIME_FIXTURE_NOT_ACTIVE'); assert.equal(state.pid, expectedPid, 'RUNTIME_FIXTURE_PID_MISMATCH'); assert.equal(state.loads, state.unloads + 1, 'RUNTIME_FIXTURE_LIFETIME_INVALID');
  assert.equal(state.hostSupported, true); assert.equal(state.runtimeExport, 'src/runtime-plugin.mjs:createRuntimePlugin');
  assert.equal(state.loopback, true); assert.equal(state.port, 3080); assert.equal(state.sessions, 0);
  for (const key of ['inferenceAttempts', 'recipientAttempts', 'toolAttempts']) assert.equal(state[key], 0);
  assert.equal(state.modelProviders, 0);
  assert.deepEqual(Object.keys(state.capabilities).sort(), ['automation', 'delivery', 'memory', 'notifications', 'preview', 'reviewer', 'worker']);
  assert.equal(Object.values(state.capabilities).every(value => value === true), true);
  checkPrivateFile(runtimeFiles.access); checkPrivateFile(runtimeFiles.key, 32); checkPrivateFile(runtimeFiles.auth);
  let cookie;
  try {
    const privateAccess = JSON.parse(readFileSync(runtimeFiles.access, 'utf8')), url = new URL(privateAccess.url);
    assert.equal(url.origin, origin); assert.equal(url.pathname, '/'); assert.equal(url.searchParams.size, 1); assert.equal(url.searchParams.has('token'), true);
    const exchange = await request(url.href, {});
    assert.equal(exchange.status, 303, 'NATIVE_TOKEN_EXCHANGE_UNAVAILABLE'); assert.equal(exchange.headers.get('location'), './');
    cookie = exchange.headers.get('set-cookie')?.split(';')[0]; assert.ok(cookie, 'NATIVE_COOKIE_UNAVAILABLE');
    const call = async (endpoint, payload = {}, mode = 'owner') => {
      const response = await request(`${origin}/df-rpc/v1/${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: mode === 'cross-origin' ? 'http://synthetic.invalid' : origin, ...(mode === 'anonymous' ? {} : { cookie: mode === 'forged' ? 'df-synthetic=forged' : cookie }) }, body: JSON.stringify({ type: 'client-request', rpcId: 'synthetic-runtime-web', method: `v1/${endpoint}`, payload }) });
      if (mode !== 'owner') return response.status;
      assert.equal(response.status, 200, 'NATIVE_OWNER_RPC_UNAVAILABLE');
      let result; try { result = (await response.json()).result; } catch { throw new Error('NATIVE_RPC_RESPONSE_INVALID'); }
      if (!result?.ok) throw new Error('NATIVE_RUNTIME_OPERATION_UNAVAILABLE');
      return result.value;
    };
    assert.equal(await call('list', {}, 'anonymous'), 401); assert.equal(await call('list', {}, 'forged'), 401); assert.equal(await call('list', {}, 'cross-origin'), 403);
    const before = await call('list'); assert.equal(before.length, cycle === 'initial' ? 0 : 1);
    const input = { taskId: 'runtime-web-synthetic-task', provider: 'synthetic-native-http', source: 'runtime-web-fixture', eventId: 'synthetic-fixed-event', goal: 'Synthetic owned runtime lifecycle; no model, tool or external effects.' };
    const first = await call('intake', { ...input, commandRef: d(`runtime-web-${cycle}-first`) });
    assert.equal(first.deduplicated, cycle === 'restart');
    const duplicate = await call('intake', { ...input, commandRef: d(`runtime-web-${cycle}-duplicate`) }); assert.equal(duplicate.deduplicated, true);
    let snapshot = await call('status', { taskRef: first.task.taskRef });
    const goal = snapshot.data.find(value => value.kind === 'goal'); assert.ok(goal);
    const detail = await call('detail', { taskRef: snapshot.task.taskRef, recordRef: goal.recordRef, expectedTaskVersion: snapshot.task.version, expectedAuthEpoch: snapshot.task.authEpoch });
    assert.equal(d(detail.data.content), d(input.goal));
    if (cycle === 'initial') {
      const prepared = await call('prepareContext', { taskRef: snapshot.task.taskRef, commandRef: d('runtime-web-context'), expectedTaskVersion: snapshot.task.version, expectedAuthEpoch: snapshot.task.authEpoch, terms: [], now: Date.now() });
      snapshot = await call('status', { taskRef: snapshot.task.taskRef });
      const preparedDetail = await call('detail', { taskRef: snapshot.task.taskRef, recordRef: prepared.recordRef, expectedTaskVersion: snapshot.task.version, expectedAuthEpoch: snapshot.task.authEpoch });
      assert.equal(d(preparedDetail.data.content), prepared.digest);
      const protectedContext = JSON.parse(preparedDetail.data.content);
      assert.equal(protectedContext.materialKind, 'execution_context'); assert.equal(protectedContext.content.includes(input.goal), true);
      await call('control', { taskRef: snapshot.task.taskRef, commandRef: d('runtime-web-pause'), expectedTaskVersion: snapshot.task.version, expectedAuthEpoch: snapshot.task.authEpoch, kind: 'pause' });
      await call('configureSource', { commandRef: d('runtime-web-source'), sourceRef: d('runtime-web-source'), expectedRevision: 0, spec: { kind: 'internal', identityMode: 'unique_id', enabled: false, adapterRef: d('runtime-web-adapter'), permissionPolicyRef: d('runtime-web-deny-permission'), maxEventAgeMs: 0, rate: { windowMs: 1000, maxEvents: 0 } } });
    }
    snapshot = await call('status', { taskRef: first.task.taskRef });
    assert.equal(snapshot.control, 'paused'); assert.equal(snapshot.task.status, 'queued'); assert.equal(snapshot.actions.length, 0); assert.equal(snapshot.workers.length, 0); assert.equal(snapshot.executions.length, 0);
    assert.equal((await call('list')).length, 1); assert.equal((await call('listSources')).length, 1); assert.deepEqual(await call('listSchedulePlans'), []);
    const memory = await call('memoryRead'); assert.ok(memory);
    const final = JSON.parse(readFileSync(runtimeFiles.state, 'utf8')); assert.equal(final.pid, expectedPid); assert.equal(final.phase, 'active');
    for (const key of ['inferenceAttempts', 'recipientAttempts', 'toolAttempts']) assert.equal(final[key], 0);
    const contexts = snapshot.data.filter(value => value.kind === 'context'); assert.equal(contexts.length, 1);
    const report = { result: 'passed', cycle, pid: state.pid, target: state.target, runtimeExport: state.runtimeExport, hostSupported: true, capabilities: state.capabilities, nativeAuthentication: { tokenExchange: 303, anonymous: 401, forged: 401, crossOrigin: 403, operatorRpc: 200 }, firstDeduplicated: first.deduplicated, duplicateDeduplicated: true, entries: 1, taskRef: snapshot.task.taskRef, taskVersion: snapshot.task.version, authEpoch: snapshot.task.authEpoch, status: snapshot.task.status, control: snapshot.control, sources: 1, protectedContexts: 1, contextRecordRef: contexts[0].recordRef, contextDigest: contexts[0].digest, actions: 0, workers: 0, executions: 0, sessions: 0, inferenceAttempts: 0, toolAttempts: 0, recipientAttempts: 0, modelReadiness: state.modelReadiness, timestamp: new Date().toISOString() };
    writeFileSync(`${runtimePaths.evidence}/${cycle}-smoke.json`, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    return report;
  } finally { cookie = undefined; }
}
if (process.argv[1]?.endsWith('/runtime-web-smoke.mjs')) {
  try { console.log(JSON.stringify(await runRuntimeSmoke(process.argv[2], Number(process.argv[3])))); }
  catch { console.error('RUNTIME_WEB_SMOKE_FAILED'); process.exitCode = 1; }
}
