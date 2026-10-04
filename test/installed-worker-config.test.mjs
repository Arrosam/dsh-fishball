import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateInstalledConfig, Config } from '../src/installed-config.mjs';
import { validateInstalledWorker } from '../src/installed-worker-config.mjs';

function fixture(t) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'df-ni2-config-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'workspace'));
  const worker = { enabled: true, selection: { provider: 'df-testing-local', model: 'df-testing-worker-v1', agentPreset: 'empty', reasoningEffort: null, maxOutputTokens: 128 }, environment: { root: join(root, 'workspace'), cwd: join(root, 'workspace') }, persistence: { directory: join(root, 'vault', 'df-sessions'), compression: 'none', retention: 'owner-managed' }, bounds: { requestBytes: 512, resultBytes: 128 }, policy: { maxRuntimeMs: 3600000, maxUsageUnits: 100000000, maxCostEstimateMicros: 100000000 }, charges: { runtimeMs: 1000, usageUnits: 135168 }, previewTtlMs: 1000, grantTtlMs: 1000 };
  const input = { databasePath: join(root, 'vault', 'runtime.sqlite'), memory: { enabled: true, byteLimit: 65536, tokenLimit: 8192 }, limits: { maxMetadataBytes: 4096 }, worker };
  return { root, worker, input };
}
function invalid(input) {
  assert.throws(() => validateInstalledConfig(input), error => error.code === 'CONFIG_INVALID' && error.message === 'CONFIG_INVALID');
  assert.deepEqual(Config['~standard'].validate(input), { issues: [{ message: 'CONFIG_INVALID' }] });
}
test('omitted and exact disabled worker retain memory/base meanings and perform no path work', t => {
  const { input, root } = fixture(t), base = { databasePath: input.databasePath };
  assert.deepEqual(validateInstalledConfig(base).worker, { enabled: false });
  assert.deepEqual(validateInstalledConfig({ ...base, worker: { enabled: false } }), validateInstalledConfig(base));
  assert.equal(validateInstalledWorker(undefined), validateInstalledWorker({ enabled: false }));
  for (const worker of [null, undefined, {}, false, [], { enabled: 0 }, { enabled: 'false' }, { enabled: false, selection: {} }]) invalid({ ...base, worker });
  assert.equal(existsSync(join(root, 'vault')), false);
});
test('enabled worker requires explicit memory and existing 4096 metadata ceiling; closed detached nested choices', t => {
  const { input, worker, root } = fixture(t);
  for (const altered of [{ ...input, memory: { enabled: false } }, { ...input, memory: undefined }, { ...input, limits: undefined }, { ...input, limits: { maxMetadataBytes: 1024 } }]) invalid(altered);
  const value = validateInstalledConfig(input), expected = structuredClone(worker);
  worker.selection.model = 'changed'; worker.policy.maxUsageUnits = 1; worker.bounds.resultBytes = 1;
  assert.deepEqual(value.worker, expected);
  for (const nested of Object.values(value.worker)) if (nested && typeof nested === 'object') assert.ok(Object.isFrozen(nested));
  assert.ok(Object.isFrozen(value.worker));
  assert.equal(existsSync(join(root, 'vault')), false);
});
test('all worker numeric boundary classes with resource/request cross-checks', async t => {
  const { input } = fixture(t);
  const domains = [['selection','maxOutputTokens',128,4096],['bounds','requestBytes',512,131072],['bounds','resultBytes',128,16384],['policy','maxRuntimeMs',1,3600000],['policy','maxUsageUnits',1,100000000],['policy','maxCostEstimateMicros',0,100000000],['charges','runtimeMs',1,60000],['charges','usageUnits',1,100000000],[null,'previewTtlMs',1,60000],[null,'grantTtlMs',1,60000]];
  for (const [parent,key,min,max] of domains) {
    const change = value => { const request = structuredClone(input); (parent ? request.worker[parent] : request.worker)[key] = value; return request; };
    for (const value of [min - 1,max + 1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER + 1,'1',true]) invalid(change(value));
    for (const value of [min,max]) await t.test(`${parent ?? 'worker'}.${key} boundary ${value}`, () => {
      const request = change(value);
      if (parent === 'policy' && key === 'maxRuntimeMs') request.worker.charges.runtimeMs = value === 1 ? 1 : 60000;
      if (parent === 'policy' && key === 'maxUsageUnits' && value === 1 || parent === 'charges' && key === 'usageUnits' && value === 1) { invalid(request); return; }
      if (parent === 'charges' && key === 'usageUnits') request.worker.policy.maxUsageUnits = 100000000;
      assert.equal((parent ? validateInstalledConfig(request).worker[parent] : validateInstalledConfig(request).worker)[key], value);
    });
  }
  const charge = input.worker.bounds.requestBytes + input.worker.selection.maxOutputTokens;
  invalid({ ...input, worker: { ...input.worker, charges: { runtimeMs: 1, usageUnits: charge - 1 } } });
  assert.equal(validateInstalledConfig({ ...input, worker: { ...input.worker, charges: { runtimeMs: 1, usageUnits: charge } } }).worker.charges.usageUnits, charge);
  invalid({ ...input, worker: { ...input.worker, policy: { ...input.worker.policy, maxRuntimeMs: 999 } } });
  invalid({ ...input, worker: { ...input.worker, policy: { ...input.worker.policy, maxUsageUnits: 135167 } } });
});
test('worker objects refuse getters/proxies/hidden/symbol/inherited/unknown authority without executing them', t => {
  const { input } = fixture(t); let calls = 0;
  for (const key of ['selection','environment','persistence','bounds','policy','charges']) {
    for (const value of [Object.assign(Object.create(null),input.worker[key]),Object.assign(Object.create({}),input.worker[key]),new Proxy(input.worker[key], { getPrototypeOf() { calls++; throw Error('PRIVATE_CANARY'); } }),{...input.worker[key],proof:true},Object.defineProperty({...input.worker[key]},'hidden',{value:true}),{...input.worker[key],[Symbol('PRIVATE_CANARY')]:true}]) invalid({ ...input, worker: { ...input.worker, [key]: value } });
    const descriptor = Object.defineProperty({},Object.keys(input.worker[key])[0],{enumerable:true,get() { calls++; throw Error('PRIVATE_CANARY'); }});
    invalid({ ...input, worker: { ...input.worker, [key]: descriptor } });
  }
  for (const worker of [new Proxy(input.worker,{ownKeys() {calls++;throw Error('PRIVATE_CANARY');}}),Object.assign(Object.create(null),input.worker),Object.defineProperty({},'enabled',{enumerable:true,get(){calls++;throw Error('PRIVATE_CANARY');}}),{...input.worker,identity:{}},{...input.worker,permission:()=>true}]) invalid({ ...input, worker });
  const revoked = Proxy.revocable(input.worker,{}); revoked.revoke(); invalid({...input,worker:revoked.proxy});
  assert.equal(calls,0);
});
test('exact text caps, effort/null, persistence choices and closed worker records', t => {
  const { input } = fixture(t);
  for (const [key,max] of [['provider',128],['model',256],['agentPreset',128],['reasoningEffort',128]]) {
    for (const value of ['', ' ', ' trim', 'trim ', 'x\n', '\ud800', 'a'.repeat(max + 1), '🙂'.repeat(max / 4 + 1), {}, 1]) invalid({ ...input, worker: { ...input.worker, selection: { ...input.worker.selection, [key]: value } } });
    assert.equal(validateInstalledConfig({ ...input, worker: { ...input.worker, selection: { ...input.worker.selection, [key]: '🙂'.repeat(max / 4) } } }).worker.selection[key], '🙂'.repeat(max / 4));
  }
  for (const compression of ['none','zstd']) assert.equal(validateInstalledConfig({...input,worker:{...input.worker,persistence:{...input.worker.persistence,compression}}}).worker.persistence.compression,compression);
  for (const [key,value] of [['compression','gzip'],['retention','automatic'],['retention',true]]) invalid({...input,worker:{...input.worker,persistence:{...input.worker.persistence,[key]:value}}});
  for (const key of Object.keys(input.worker)) { const worker = structuredClone(input.worker); delete worker[key]; invalid({...input,worker}); }
  for (const key of ['selection','environment','persistence','bounds','policy','charges']) for (const field of Object.keys(input.worker[key])) { const worker = structuredClone(input.worker); delete worker[key][field]; invalid({...input,worker}); }
});
test('canonical owned workspace and exact sibling persistence selection refuse aliases/escapes without files', t => {
  const { input, root } = fixture(t);
  mkdirSync(join(root,'workspace','child')); symlinkSync(input.worker.environment.root,join(root,'alias'));
  assert.equal(validateInstalledConfig({...input,worker:{...input.worker,environment:{...input.worker.environment,cwd:join(root,'workspace','child')}}}).worker.environment.cwd,join(root,'workspace','child'));
  for (const environment of [{root:join(root,'alias'),cwd:join(root,'alias')},{root:input.worker.environment.root,cwd:root},{root:input.worker.environment.root,cwd:join(root,'absent')},{root:input.worker.environment.root+'/',cwd:input.worker.environment.cwd},{root:'relative',cwd:'relative'}]) invalid({...input,worker:{...input.worker,environment}});
  for (const directory of [join(root,'df-sessions'),join(root,'vault','runtime.sqlite'),join(root,'vault','df-sessions-'),join(root,'vault','df-sessions-A'),join(root,'vault','df-sessions-'+ 'a'.repeat(33)),join(root,'vault','df-sessions')+'/',join(root,'vault','x','..','df-sessions')]) {
    // join normalizes dot components; supply the alias explicitly below.
    if (directory === input.worker.persistence.directory) continue;
    invalid({...input,worker:{...input.worker,persistence:{...input.worker.persistence,directory}}});
  }
  invalid({...input,worker:{...input.worker,persistence:{...input.worker.persistence,directory:join(root,'vault')+'/x/../df-sessions'}}});
  assert.equal(existsSync(join(root,'vault')),false);
});
