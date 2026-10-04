// Independent CLIENT lease: actual held source/emitted factories; all host/RPC,
// authority, task receipts, clocks and React rendering below are explicit doubles.
// This file imports no product core/runtime/composer/native implementation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Script, createContext } from 'node:vm';

const require = createRequire(import.meta.url);
const hash = text => createHash('sha256').update(text).digest('hex');
const ref = name => hash(`independent-client-fixture:${name}`);
const clone = value => structuredClone(value);
const pass = value => ({ ok: true, value });
const fail = code => ({ ok: false, error: { code, message: code, details: {} } });
const defer = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const turn = () => new Promise(resolve => setImmediate(resolve));
const SYSTEM = 'You are a dsh-fishball worker. Use only the approved task context supplied in this turn. Tools and external actions are unavailable.';
const ACCOUNTING = 'df-testing-utf8-byte-units/v1';
const MUTATIONS = new Set(['workerPolicyConfirm', 'prepareContext', 'workerPlan', 'workerGrant', 'workerCreate', 'workerExecute', 'workerCapture', 'workerFinish', 'control']);

// Descriptor-only rendering. No DOM, browser, screenshot, React scheduler or
// keyboard/focus/accessibility acceptance is represented by these objects.
const React = {
  Fragment: 'fragment',
  createElement(type, props, ...children) { return { type, props: props ?? {}, children: children.flat(Infinity).filter(value => value !== null && value !== undefined && value !== false) }; },
  useSyncExternalStore(_subscribe, get) { return get(); },
  useState() { return ['', () => {}]; },
  useEffect() {},
};
const materialize = factory => factory(name => { assert.equal(name, 'react'); return React; });
const sourceFactory = require('../src/client-entry.cjs');
const bundleText = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
let registration;
// Same Node realm preserves the intentionally strict Object/Array prototypes.
new Script(`(function(window) { ${bundleText}\n })`, { filename: 'held-client-bundle-fixture.js' }).runInThisContext()({ __ModuleLoader__: { load(value) { assert.equal(registration, undefined); registration = value; } } });
assert.equal(registration.id, 'dsh-fishball');
const clients = { source: materialize(sourceFactory), bundle: materialize(registration.factory) };

function fixture(client, { digest } = {}) {
  let time = 20000, serial = 0, policyVersion = 4, policyReady = false;
  const calls = [], interceptors = new Map(), tasks = new Map(), mappings = new Map();
  for (const name of ['alpha', 'beta']) tasks.set(ref(name), { ownerRef: ref('owner'), workspaceRef: ref('workspace'), taskRef: ref(name), status: 'running', version: 7, taskVersion: 7, authEpoch: 3, createdAt: 10000, updatedAt: time });
  let selected = ref('alpha');
  const selection = { provider: 'typed-fixture-provider', model: 'typed-fixture-model', agentPreset: 'typed-empty', reasoningEffort: null, maxOutputTokens: 256 };
  const environment = { root: '/synthetic/independent-profile', cwd: '/synthetic/independent-profile/project' };
  const persistence = { directory: '/synthetic/independent-profile/df-sessions', compression: 'none', retention: 'owner-managed', encrypted: false };
  const bounds = { requestBytes: 4096, resultBytes: 128 };
  const charges = { runtimeMs: 800, usageUnits: 4352, costState: 'estimated', costEstimateMicros: 0, costProvenanceRef: ref('synthetic-price') };
  const row = taskRef => tasks.get(taskRef ?? selected);
  const copyTask = taskRef => clone(row(taskRef));
  const change = (taskRef, update) => { const prior = row(taskRef), next = { ...prior, ...update }; next.taskVersion = next.version; tasks.set(prior.taskRef, next); return clone(next); };
  const status = () => ({ enabled: true, phase: policyReady ? 'ready' : 'needs_policy', reasonCode: null, configurationRef: ref('configuration'), policyVersion, selection: clone(selection), environment: clone(environment), persistence: clone(persistence), bounds: clone(bounds), accounting: ACCOUNTING, pricing: 'source_zero', actionsEnabled: policyReady });
  const policyDescription = () => ({ selection: clone(selection), effectiveReasoningEffort: 'fixture-effort', environment: clone(environment), persistence: clone(persistence), bounds: clone(bounds), limits: { queueCapacity: 9, maxActive: 1, maxAttempts: 1, maxTotalAttempts: 1, maxRuntimeMs: 12000, maxUsageUnits: 50000, maxCostEstimateMicros: 0 }, charges: clone(charges), accounting: ACCOUNTING, pricing: 'source_zero', grantTtlMs: 17000, systemPrompt: SYSTEM });
  const ids = taskRef => Object.fromEntries(['action', 'actionDigest', 'context', 'contextDigest', 'claim', 'reservation', 'generation', 'session', 'execution', 'artifact', 'artifactRecord', 'artifactDigest', 'producer', 'input', 'output'].map(key => [key, ref(`${taskRef ?? selected}:${key}`)]));
  const worker = (taskRef, phase = 'ready') => { const i = ids(taskRef); return { taskRef: taskRef ?? selected, actionRef: i.action, actionDigest: i.actionDigest, claimRef: i.claim, reservationRef: i.reservation, generationRef: i.generation, sessionRef: i.session, phase }; };
  const output = 'Typed fixture output: 汉🙂 <script>literal</script>';
  const execution = taskRef => ({ executionRef: ids(taskRef).execution, state: 'committed', cursor: 11, resultDigest: ids(taskRef).output, usage: { state: 'actual', units: 911 + new TextEncoder().encode(output).length, accounting: ACCOUNTING } });
  const artifact = taskRef => { const i = ids(taskRef); return { artifactRef: i.artifact, version: 1, recordRef: i.artifactRecord, digest: i.artifactDigest, producerClaimRef: i.claim, generationRef: i.generation, producerRef: i.producer, verification: null, task: copyTask(taskRef) }; };
  const result = taskRef => { const i = ids(taskRef); return { artifactRef: i.artifact, version: 1, recordRef: i.artifactRecord, digest: i.artifactDigest, source: { taskRef: taskRef ?? selected, actionRef: i.action, actionDigest: i.actionDigest, claimRef: i.claim, generationRef: i.generation, sessionRef: i.session, executionRef: i.execution, inputDigest: i.input, cursor: 11, resultDigest: i.output }, content: output, verification: 'not-reviewed', delivery: 'not-requested' }; };
  const snapshot = taskRef => ({ task: copyTask(taskRef), control: 'active', data: [], actions: [], workers: clone(mappings.get(taskRef) ?? []), artifacts: [], deliveries: [], audits: [], reviews: [], progress: [] });
  function normal(name, input) {
    const t = input.taskRef ?? selected, current = row(t), i = ids(t);
    if (name === 'status' && !input.taskRef) return { phase: 'ready', executionEnabled: false, storage: { location: '/synthetic/independent-profile/df.sqlite' } };
    if (name === 'list') return [...tasks.values()].map(clone);
    if (name === 'status') return snapshot(t);
    if (name === 'workerStatus') return status();
    if (name === 'workerCatalog') return { status: status(), providers: [{ id: selection.provider, name: 'Typed provider fixture' }], models: [{ provider: selection.provider, id: selection.model, name: 'Typed model fixture', reasoningEfforts: [{ id: 'fixture-effort', name: 'Fixture effort' }], defaultEffort: 'fixture-effort', maxOutputTokens: 4096, contextUnits: 135168 }], presets: [{ id: selection.agentPreset, name: 'Typed empty preset', available: true }] };
    if (name === 'workerPolicyPreview') return { previewRef: ref(`policy-preview:${++serial}`), planDigest: ref(`policy-plan:${serial}`), expectedPolicyVersion: input.expectedPolicyVersion, expiresAt: time + 13000, description: policyDescription() };
    if (name === 'workerPolicyConfirm') { policyReady = true; policyVersion++; return { policyVersion, configurationRef: ref('configuration'), status: status() }; }
    if (name === 'prepareContext') { const prior = clone(current); change(t, { version: current.version + 1 }); return { recordRef: i.context, digest: i.contextDigest, kind: 'context', byteLength: 911, cryptoVersion: 2, sourceRef: ref('prepared-source'), task: copyTask(t), sourceTaskVersion: prior.version, sourceAuthEpoch: prior.authEpoch, memory: { namespaceRef: ref(`memory:${t}`), revision: 2 }, inputCounts: { bytes: 601, tokens: 601 }, retainedRefs: [ref('goal-source'), ref('constraint-source')], droppedRefs: [], verification: 'module_prepared_execution_context_only' }; }
    if (name === 'workerPlan') return { actionRef: i.action, actionDigest: i.actionDigest, taskVersion: current.version, authEpoch: current.authEpoch };
    if (name === 'workerPreview') return { previewRef: ref(`action-preview:${++serial}`), taskRef: t, actionRef: i.action, actionDigest: i.actionDigest, taskVersion: current.version, authEpoch: current.authEpoch, expiresAt: time + 11000, description: { kind: 'write', role: 'worker', targetLabel: 'Typed exact approved context; separate idle create and execution; unencrypted owner-managed transcript.', data: { recordRef: i.context, digest: i.contextDigest, kind: 'context', content: 'Typed approved context: 汉🙂 <img src=x onerror=fixture>' }, model: { provider: 'Typed provider', model: 'Typed model', reasoning: 'Fixture effort', preset: 'Typed empty preset' }, toolNames: [], environment: { label: 'Typed scoped environment', cwd: environment.cwd, environmentRef: ref('environment') }, limits: { units: 1, attemptIndex: 1, charges: clone(charges) }, evidenceRef: ref('preview-evidence') } };
    if (name === 'workerGrant') { change(t, { authEpoch: current.authEpoch + 1 }); return { task: copyTask(t), taskVersion: current.version, authEpoch: current.authEpoch + 1, actionRef: i.action, actionDigest: i.actionDigest, expiresAt: input.expiresAt }; }
    if (name === 'workerCreate') { mappings.set(t, [worker(t)]); return { task: copyTask(t), worker: worker(t) }; }
    if (name === 'workerExecute') return { task: copyTask(t), worker: worker(t), execution: execution(t) };
    if (name === 'workerQuery') return { task: copyTask(t), worker: clone(mappings.get(t)?.[0] ?? worker(t)) };
    if (name === 'workerCapture') { change(t, { version: current.version + 1 }); return artifact(t); }
    if (name === 'workerResult') return result(t);
    if (name === 'workerFinish') { mappings.set(t, [worker(t, 'stopped')]); return { task: copyTask(t), claimRef: i.claim, reservationRef: i.reservation, reservationHeld: false, outcome: 'completed', terminalEvidenceRef: ref('terminal-fact'), releaseEvidenceRef: ref('release-fact') }; }
    if (name === 'control') { change(t, { status: input.kind === 'cancel' ? 'cancel_requested' : current.status, authEpoch: current.authEpoch + 1 }); return { task: copyTask(t) }; }
    throw new Error(`Unscripted typed fixture operation: ${name}`);
  }
  const rpc = { async call(channel, endpoint, input, signal) {
    assert.ok(['/df-rpc', '/df-setup'].includes(channel));
    assert.ok(endpoint.startsWith('v1/'));
    const name = endpoint.slice(3), captured = clone(input);
    calls.push({ channel, name, input: captured, signal });
    const reply = () => pass(clone(normal(name, captured)));
    return interceptors.has(name) ? interceptors.get(name)({ channel, name, input: captured, signal, reply }) : reply();
  } };
  const options = { clock: () => time, uuid: () => `independent-click:${++serial}`, digest: digest ?? (async text => hash(text)) };
  // The held ordinary task model itself generates real temporary detail:null
  // snapshots and authoritative read-after-control behavior in this fixture.
  const taskModel = client.createModel(rpc, options);
  const model = client.createWorkerModel(rpc, taskModel, options);
  return { client, rpc, taskModel, model, calls, ids, status, policyDescription, snapshot, worker, execution, artifact, result, row, change, mappings,
    on(name, handler) { interceptors.set(name, handler); }, off(name) { interceptors.delete(name); }, time: () => time, setTime(value) { time = value; },
    async init() { await taskModel.refresh(); assert.equal(taskModel.getSnapshot().detail.task.taskRef, selected); return this; },
    async select(name) { selected = ref(name); await taskModel.select(selected); },
    count(name) { return calls.filter(call => call.name === name).length; },
    mutations() { return calls.filter(call => MUTATIONS.has(call.name)); },
    dispose() { model.dispose(); taskModel.dispose(); },
  };
}
async function policy(f) {
  await f.init(); assert.equal(await f.model.refresh(), true); assert.equal(await f.model.catalog(), true);
  assert.equal(await f.model.previewPolicy(4), true); assert.equal(f.model.setPolicyAccepted(true), true); assert.equal(await f.model.confirmPolicy(), true);
}
async function plan(f) { await policy(f); assert.equal(await f.model.prepareContext(), true); assert.equal(await f.model.plan(), true); }
async function grant(f) { await plan(f); assert.equal(await f.model.previewAction(), true); assert.equal(f.model.setActionAccepted(true), true); assert.equal(await f.model.grant(f.time() + 16000), true); }
async function idle(f) { await grant(f); assert.equal(await f.model.create(), true); }
async function captured(f) { await idle(f); assert.equal(await f.model.execute(), true); assert.equal(await f.model.capture(), true); }
const walk = node => node && typeof node === 'object' && Array.isArray(node.children) ? [node, ...node.children.flatMap(walk)] : [];
const text = node => node && typeof node === 'object' && Array.isArray(node.children) ? node.children.map(text).join(' ') : String(node ?? '');
const panel = f => f.client.Panel({ model: f.taskModel, workerModel: f.model });
const button = (tree, label) => { const values = walk(tree).filter(node => node.type === 'button' && text(node) === label); assert.equal(values.length, 1, label); return values[0]; };
const noRaw = f => assert.equal(JSON.stringify(f.model.getSnapshot()).includes('REJECTED_REPLY_CANARY'), false);
const shape = (input, keys) => assert.deepEqual(Object.keys(input).sort(), [...keys].sort());

for (const [surface, client] of Object.entries(clients)) {
  const add = (id, title, fn) => test(`${id} ${surface}: ${title}`, fn);
  add('C01', 'actual apply, ordinary refresh and reset emit zero implicit worker RPC', async () => {
    const f = fixture(client), events = new Map(), effects = [], registrations = [];
    const ctx = { connection: { rpc: f.rpc, state: { subscribe: () => () => {} }, generation: { getSnapshot: () => ({}) } }, layout: {},
      slots: { inject(_slot, install) { install(); }, register(...args) { registrations.push(args); return () => {}; } },
      effect(install) { effects.push(install()); }, on(name, handler) { events.set(name, handler); } };
    client.apply(ctx); await turn(); await turn();
    assert.equal(registrations.length, 2);
    assert.deepEqual(f.calls.map(call => [call.channel, call.name]), [['/df-setup', 'status'], ['/df-rpc', 'list'], ['/df-rpc', 'status']]);
    const injected = registrations.find(args => args[0].key === 'df')[0].inject();
    client.Panel({ model: injected.model, setupModel: injected.setupModel, workerModel: injected.workerModel });
    events.get('connection/reset')(); await turn(); await turn();
    assert.equal(f.calls.some(call => /^worker|prepareContext/.test(call.name)), false);
    assert.equal(injected.workerModel.getSnapshot().status, null);
    effects.forEach(dispose => dispose?.()); f.dispose();
  });
  add('C02', 'ordered explicit decisions emit exact closed requests and fresh command references', async () => {
    const f = fixture(client); await policy(f);
    assert.deepEqual(f.mutations().map(call => call.name), ['workerPolicyConfirm']);
    await f.model.prepareContext(); await f.model.plan(); await f.model.previewAction();
    assert.equal(await f.model.create(), false); assert.equal(f.count('workerCreate'), 0);
    assert.equal(f.model.setActionAccepted(true), true); await f.model.grant(36000);
    assert.equal(f.count('workerCreate'), 0); await f.model.create(); assert.equal(f.count('workerExecute'), 0);
    await f.model.execute(); assert.equal(f.model.getSnapshot().capture, null); assert.equal(f.count('workerCapture'), 0);
    await f.model.query(); await f.model.capture(); assert.equal(f.model.getSnapshot().result, null); await f.model.loadResult(); await f.model.finish();
    const fields = {
      workerPolicyConfirm: ['previewRef','planDigest','commandRef','expectedPolicyVersion','accept'],
      prepareContext: ['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','terms','now'],
      workerPlan: ['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','contextRecordRef'],
      workerGrant: ['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','actionRef','actionDigest','expiresAt','previewRef','accept'],
      workerCreate: ['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','actionRef','actionDigest'],
      workerExecute: ['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','actionRef','actionDigest','claimRef','generationRef','contextRecordRef'],
      workerQuery: ['taskRef','actionRef','claimRef','generationRef'],
      workerCapture: ['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','actionRef','claimRef','generationRef','executionRef'],
      workerResult: ['taskRef','artifactRef','version','expectedTaskVersion','expectedAuthEpoch'],
      workerFinish: ['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','actionRef','claimRef','generationRef','executionRef'],
    };
    for (const call of f.calls.filter(call => fields[call.name])) shape(call.input, fields[call.name]);
    const mutationCalls = f.mutations(); assert.equal(new Set(mutationCalls.map(call => call.input.commandRef)).size, mutationCalls.length);
    assert.ok(mutationCalls.every(call => /^[a-f0-9]{64}$/.test(call.input.commandRef)));
    assert.deepEqual(mutationCalls.map(call => call.name), ['workerPolicyConfirm','prepareContext','workerPlan','workerGrant','workerCreate','workerExecute','workerCapture','workerFinish']);
    assert.equal(f.calls.find(call => call.name === 'prepareContext').input.expectedTaskVersion, 7);
    assert.equal(f.calls.find(call => call.name === 'workerPlan').input.expectedTaskVersion, 8);
    assert.equal(f.calls.find(call => call.name === 'workerCreate').input.expectedAuthEpoch, 4);
    assert.equal(f.calls.find(call => call.name === 'workerFinish').input.expectedTaskVersion, 9);
    f.dispose();
  });
  add('C03', 'real same-task detail:null refresh preserves context and captured facts; another task clears them', async () => {
    const f = fixture(client); await captured(f); await f.model.loadResult();
    const prior = f.model.getSnapshot(), transient = [];
    const remove = f.taskModel.subscribe(() => { if (f.taskModel.getSnapshot().detail === null) transient.push(f.model.getSnapshot()); });
    const before = f.calls.length; await f.taskModel.refresh(); remove();
    assert.ok(transient.length > 0); for (const value of transient) assert.equal(value.contextRecordRef, prior.contextRecordRef);
    for (const key of ['taskRef','contextRecordRef','action','worker','execution','capture','result']) assert.deepEqual(f.model.getSnapshot()[key], prior[key], key);
    assert.deepEqual(f.calls.slice(before).map(call => call.name), ['list','status']);
    await f.select('beta');
    for (const key of ['contextRecordRef','action','worker','execution','capture','result']) assert.equal(f.model.getSnapshot()[key], null, key);
    assert.equal(f.model.getSnapshot().taskRef, ref('beta')); f.dispose();
  });
  add('C04', 'a captured rendered policy closure cannot accept or confirm replacement material', async () => {
    const f = fixture(client); await f.init(); await f.model.refresh(); await f.model.previewPolicy(4);
    const old = panel(f), checkbox = walk(old).find(node => node.props.id === 'df-worker-policy-accept'), confirm = button(old, 'Confirm worker policy');
    await f.model.previewPolicy(4);
    checkbox.props.onChange({ target: { checked: true } }); assert.equal(f.model.getSnapshot().policyAccepted, false);
    assert.equal(await confirm.props.onClick(), false); assert.equal(f.count('workerPolicyConfirm'), 0);
    for (const value of ['true', 1, [], {}, false]) assert.equal(f.model.setPolicyAccepted(value), false);
    assert.equal(f.model.setPolicyAccepted(true), true); assert.equal(await f.model.confirmPolicy(), true);
    assert.equal(await confirm.props.onClick(), false); assert.equal(f.count('workerPolicyConfirm'), 1); f.dispose();
  });
  add('C05', 'rendered action closure and literal consent remain separate from create and execution', async () => {
    const f = fixture(client); await plan(f); await f.model.previewAction();
    const old = panel(f), checkbox = walk(old).find(node => node.props.id === 'df-worker-action-accept');
    await f.model.previewAction(); checkbox.props.onChange({ target: { checked: true } });
    assert.equal(f.model.getSnapshot().actionAccepted, false);
    for (const value of ['true', 1, {}, false]) { assert.equal(f.model.setActionAccepted(value), false); assert.equal(await f.model.grant(36000), false); }
    assert.equal(f.model.setActionAccepted(true), true); assert.equal(await f.model.grant(36000), true);
    assert.equal(f.model.getSnapshot().actionPreview, null); assert.equal(f.count('workerCreate'), 0); assert.equal(f.count('workerExecute'), 0); f.dispose();
  });
  add('C06', 'expiry equality, rollback and grant TTL boundaries deny stale consent', async () => {
    for (const offset of [13000, -1]) {
      const f = fixture(client); await f.init(); await f.model.refresh(); await f.model.previewPolicy(4); f.model.setPolicyAccepted(true); f.setTime(20000 + offset);
      assert.equal(await f.model.confirmPolicy(), false); assert.equal(f.count('workerPolicyConfirm'), 0); f.dispose();
    }
    const f = fixture(client); await plan(f); await f.model.previewAction(); f.model.setActionAccepted(true);
    assert.equal(await f.model.grant(20000), false); assert.equal(await f.model.grant(37001), false); assert.equal(f.count('workerGrant'), 0);
    assert.equal(await f.model.grant(37000), true); assert.equal(f.count('workerGrant'), 1); f.setTime(37000);
    assert.equal(f.model.canCreate(), false); assert.equal(await f.model.create(), false); f.dispose();
  });
  add('C07', 'task drift during command hashing prevents a request before it reaches RPC', async () => {
    const gate = defer(); let block = false;
    const f = fixture(client, { digest: text => block ? gate.promise : Promise.resolve(hash(text)) }); await plan(f); await f.model.previewAction(); f.model.setActionAccepted(true);
    block = true; const pending = f.model.grant(36000); await turn(); const before = f.count('workerGrant');
    f.change(ref('alpha'), { authEpoch: 30 }); await f.taskModel.refresh(); gate.resolve(ref('late-command'));
    assert.equal(await pending, false); assert.equal(f.count('workerGrant'), before); assert.equal(f.model.getSnapshot().grant, null); f.dispose();
  });
  add('C08', 'pending explicit execution excludes a double click and every competing operation', async () => {
    const f = fixture(client); await idle(f); const gate = defer(); let reply;
    f.on('workerExecute', request => { reply = request.reply(); return gate.promise; });
    const pending = f.model.execute(); await turn();
    assert.equal(await f.model.execute(), false); assert.equal(await f.model.query(), false); assert.equal(await f.model.catalog(), false); assert.equal(await f.model.refresh(), false);
    assert.equal(f.count('workerExecute'), 1); gate.resolve(reply); assert.equal(await pending, true);
    assert.equal(await f.model.execute(), false); assert.equal(f.count('workerExecute'), 1); f.dispose();
  });
  add('C09', 'lost create requires an explicit exact query; ambiguous cached mappings cannot recover it', async () => {
    const f = fixture(client); await grant(f);
    f.on('workerCreate', ({ reply }) => { reply(); throw new Error('REJECTED_REPLY_CANARY'); });
    const start = f.calls.length; assert.equal(await f.model.create(), false); assert.equal(await f.model.create(), false);
    assert.deepEqual(f.calls.slice(start).map(call => call.name), ['workerCreate','list','status','workerStatus']);
    assert.equal(f.model.getSnapshot().uncertain, 'workerCreate'); assert.equal(f.model.getSnapshot().worker, null);
    f.mappings.set(ref('alpha'), [f.worker(ref('alpha')), f.worker(ref('alpha'))]); await f.taskModel.refresh();
    assert.equal(await f.model.query(), false); assert.equal(f.count('workerQuery'), 0);
    f.mappings.set(ref('alpha'), [f.worker(ref('alpha'))]); await f.taskModel.refresh();
    assert.equal(await f.model.query(), true); assert.equal(f.model.getSnapshot().uncertain, null); assert.equal(f.count('workerCreate'), 1); assert.equal(f.count('workerExecute'), 0); noRaw(f); f.dispose();
  });
  add('C10', 'lost execute stays uncertain through refresh and explicit query without another execute', async () => {
    const f = fixture(client); await idle(f); f.on('workerExecute', () => { throw new Error('REJECTED_REPLY_CANARY'); });
    const start = f.calls.length; assert.equal(await f.model.execute(), false);
    assert.deepEqual(f.calls.slice(start).map(call => call.name), ['workerExecute','list','status','workerStatus']);
    await f.model.refresh(); await f.model.query();
    assert.equal(f.model.getSnapshot().uncertain, 'workerExecute'); assert.equal(f.model.getSnapshot().execution, null);
    assert.equal(await f.model.execute(), false); assert.equal(f.count('workerExecute'), 1);
    assert.equal(button(panel(f), 'Execute approved context').props.disabled, true); noRaw(f); f.dispose();
  });
  add('C11', 'unknown typed execution never exposes committed output, capture or finish', async () => {
    const f = fixture(client); await idle(f);
    f.on('workerExecute', ({ reply }) => { const response = reply(); response.value.execution = { executionRef: f.ids().execution, state: 'unknown', cursor: null, resultDigest: null, usage: { state: 'unknown', units: null, accounting: null } }; return response; });
    assert.equal(await f.model.execute(), true); assert.equal(f.model.getSnapshot().execution.state, 'unknown');
    assert.equal(await f.model.capture(), false); assert.equal(await f.model.finish(), false);
    assert.equal(f.count('workerCapture'), 0); assert.equal(f.count('workerFinish'), 0);
    const tree = panel(f); assert.match(text(tree), /Execution outcome is unknown/); assert.equal(button(tree, 'Capture local result').props.disabled, true); f.dispose();
  });
  add('C12', 'cancelled current task allows only explicit factual cleanup and keeps captured text', async () => {
    const f = fixture(client); await captured(f); const execution = clone(f.model.getSnapshot().execution);
    f.change(ref('alpha'), { status: 'cancel_requested', authEpoch: 42 }); await f.taskModel.refresh();
    const tree = panel(f); assert.equal(button(tree, 'Execute approved context').props.disabled, true); assert.equal(button(tree, 'Load captured result').props.disabled, false);
    assert.equal(await f.model.execute(), false); assert.equal(await f.model.query(), true); assert.equal(await f.model.loadResult(), true); assert.equal(await f.model.finish(), true);
    assert.deepEqual(f.model.getSnapshot().execution, execution); assert.equal(f.model.getSnapshot().result.content, f.result().content); assert.equal(f.count('workerExecute'), 1); f.dispose();
  });
  add('C13', 'missing context/action/capture preconditions emit no corresponding effect request', async () => {
    const f = fixture(client); await policy(f);
    for (const [method, endpoint] of [['plan','workerPlan'],['previewAction','workerPreview'],['capture','workerCapture'],['loadResult','workerResult'],['finish','workerFinish']]) {
      assert.equal(await f.model[method](), false, method); assert.equal(f.count(endpoint), 0, endpoint);
    }
    assert.equal(await f.model.create(), false); assert.equal(await f.model.execute(), false); assert.equal(f.count('workerCreate'), 0); assert.equal(f.count('workerExecute'), 0); f.dispose();
  });
  add('C14', 'closed native envelopes reject contradictory, hidden and accessor values without rendering canaries', async () => {
    const builders = [value => ({ ok: 1, value }), value => ({ ok: true, value, error: { code: 'WORKER_DISABLED' } }), value => ({ ok: false, value, error: { code: 'WORKER_DISABLED' } }), () => ({ ok: true }), value => ({ ok: true, value, unexpected: 'REJECTED_REPLY_CANARY' }), value => { const response = pass(value); Object.defineProperty(response, 'hidden', { value: 'REJECTED_REPLY_CANARY' }); return response; }];
    for (const build of builders) { const f = fixture(client); f.on('workerStatus', () => build(f.status())); assert.equal(await f.model.refresh(), false); assert.equal(f.model.getSnapshot().status, null); noRaw(f); f.dispose(); }
    let gets = 0; const f = fixture(client); f.on('workerStatus', () => { const value = f.status(); Object.defineProperty(value.persistence, 'directory', { enumerable: true, get() { gets++; throw new Error('REJECTED_REPLY_CANARY'); } }); return pass(value); });
    assert.equal(await f.model.refresh(), false); assert.equal(gets, 0); noRaw(f); f.dispose();
  });
  add('C15', 'cached status enforces numeric boundaries and denies contradictory ready accounting', async () => {
    const variants = [value => { value.bounds.requestBytes = 511; }, value => { value.bounds.requestBytes = 131073; }, value => { value.bounds.resultBytes = 127; }, value => { value.bounds.resultBytes = 16385; }, value => { value.selection.maxOutputTokens = 127; }, value => { value.selection.maxOutputTokens = 4097; }, value => { value.policyVersion = 0; }, value => { value.actionsEnabled = true; value.phase = 'ready'; value.pricing = 'unknown'; }];
    for (const edit of variants) { const f = fixture(client); f.on('workerStatus', () => { const value = f.status(); edit(value); return pass(value); }); assert.equal(await f.model.refresh(), false); assert.equal(f.model.getSnapshot().status, null); f.dispose(); }
    for (const [requestBytes, resultBytes, maxOutputTokens] of [[512,128,128],[131072,16384,4096]]) { const f = fixture(client); f.on('workerStatus', () => { const value = f.status(); Object.assign(value.bounds, { requestBytes, resultBytes }); value.selection.maxOutputTokens = maxOutputTokens; return pass(value); }); assert.equal(await f.model.refresh(), true); f.dispose(); }
  });
  add('C16', 'owned mapping validation rejects foreign task/action and query identity substitutions', async () => {
    for (const key of ['taskRef','actionRef','actionDigest']) { const f = fixture(client); await grant(f); f.on('workerCreate', ({ reply }) => { const response = reply(); response.value.worker[key] = ref(`foreign:${key}`); return response; }); assert.equal(await f.model.create(), false, key); assert.equal(f.model.getSnapshot().worker, null); assert.equal(f.model.getSnapshot().uncertain, 'workerCreate'); f.dispose(); }
    for (const key of ['claimRef','generationRef','reservationRef','sessionRef']) { const f = fixture(client); await idle(f); const prior = clone(f.model.getSnapshot().worker); f.on('workerQuery', ({ reply }) => { const response = reply(); response.value.worker[key] = ref(`foreign:${key}`); return response; }); assert.equal(await f.model.query(), false, key); assert.deepEqual(f.model.getSnapshot().worker, prior); f.dispose(); }
  });
  add('C17', 'committed/unknown execution usage union rejects contradictory or unsafe facts', async () => {
    const variants = [value => { value.usage.state = 'unknown'; }, value => { value.usage.units = null; }, value => { value.usage.units = -1; }, value => { value.usage.units = Number.MAX_SAFE_INTEGER + 1; }, value => { value.usage.accounting = 'commercial-token-claim'; }, value => { value.cursor = null; }, value => { value.resultDigest = null; }, value => { value.state = 'unknown'; }];
    for (const edit of variants) { const f = fixture(client); await idle(f); f.on('workerExecute', ({ reply }) => { const response = reply(); edit(response.value.execution); return response; }); assert.equal(await f.model.execute(), false); assert.equal(f.model.getSnapshot().execution, null); assert.equal(f.model.getSnapshot().uncertain, 'workerExecute'); assert.equal(f.count('workerCapture'), 0); f.dispose(); }
  });
  add('C18', 'capture refuses foreign source associations, verification claims and extra receipt fields', async () => {
    for (const edit of [value => { value.producerClaimRef = ref('foreign-claim'); }, value => { value.generationRef = ref('foreign-generation'); }, value => { value.task.taskRef = ref('beta'); }, value => { value.verification = 'reviewed'; }, value => { value.rawOutput = 'REJECTED_REPLY_CANARY'; }]) {
      const f = fixture(client); await idle(f); await f.model.execute(); f.on('workerCapture', ({ reply }) => { const response = reply(); edit(response.value); return response; });
      assert.equal(await f.model.capture(), false); assert.equal(f.model.getSnapshot().capture, null); assert.equal(f.model.getSnapshot().result, null); noRaw(f); f.dispose();
    }
  });
  add('C19', 'retained result cannot replace an exact captured association or claim review/delivery', async () => {
    const edits = ['taskRef','actionRef','actionDigest','claimRef','generationRef','sessionRef','executionRef','cursor','resultDigest'].map(key => value => { value.source[key] = key === 'cursor' ? 12 : ref(`foreign:${key}`); });
    edits.push(value => { value.artifactRef = ref('foreign-artifact'); }, value => { value.recordRef = ref('foreign-record'); }, value => { value.digest = ref('foreign-artifact-digest'); }, value => { value.version = 2; }, value => { value.verification = 'reviewed'; }, value => { value.delivery = 'delivered'; });
    for (const edit of edits) { const f = fixture(client); await captured(f); f.on('workerResult', ({ reply }) => { const response = reply(); edit(response.value); response.value.content = 'REJECTED_REPLY_CANARY'; return response; }); assert.equal(await f.model.loadResult(), false); assert.equal(f.model.getSnapshot().result, null); noRaw(f); f.dispose(); }
  });
  add('C20', 'result limits measure complete UTF8 text and render script-looking output inertly', async () => {
    for (const [content, expected] of [['🙂'.repeat(32),true],['🙂'.repeat(32)+'a',false],['汉'.repeat(41)+'12345',true],['汉'.repeat(43),false]]) {
      const f = fixture(client); await captured(f); f.on('workerResult', ({ reply }) => { const response = reply(); response.value.content = content; return response; }); assert.equal(await f.model.loadResult(), expected, new TextEncoder().encode(content).length); assert.equal(f.model.getSnapshot().result?.content ?? null, expected ? content : null); f.dispose();
    }
    const f = fixture(client); await captured(f); await f.model.loadResult(); const tree = panel(f);
    assert.ok(walk(tree).some(node => node.type === 'pre' && node.children.includes(f.result().content)));
    assert.equal(walk(tree).some(node => Object.hasOwn(node.props, 'dangerouslySetInnerHTML')), false);
    assert.match(text(tree), /not reviewed/); assert.match(text(tree), /Delivery not requested/); assert.match(text(tree), /Unencrypted/); assert.match(text(tree), /no model-quality evidence/); f.dispose();
  });
  add('C21', 'truthful held finish retains captured facts and never paints a released worker', async () => {
    const f = fixture(client); await captured(f); await f.model.loadResult(); const prior = f.model.getSnapshot();
    f.on('workerFinish', ({ reply }) => { const response = reply(); response.value.reservationHeld = true; response.value.releaseEvidenceRef = null; return response; });
    assert.equal(await f.model.finish(), true); assert.equal(f.model.getSnapshot().worker.phase, 'unknown');
    assert.deepEqual(f.model.getSnapshot().execution, prior.execution); assert.deepEqual(f.model.getSnapshot().capture, prior.capture); assert.deepEqual(f.model.getSnapshot().result, prior.result);
    assert.equal(f.count('workerExecute'), 1); assert.equal(f.taskModel.getSnapshot().detail.task.status, 'running'); f.dispose();
  });
  add('C22', 'foreign finish receipt cannot stop or replace the owned worker', async () => {
    for (const edit of [value => { value.claimRef = ref('foreign-claim'); }, value => { value.reservationRef = ref('foreign-reservation'); }, value => { value.task.taskRef = ref('beta'); }, value => { value.outcome = 'failed'; }]) {
      const f = fixture(client); await captured(f); const prior = clone(f.model.getSnapshot().worker); f.on('workerFinish', ({ reply }) => { const response = reply(); edit(response.value); return response; }); assert.equal(await f.model.finish(), false); assert.deepEqual(f.model.getSnapshot().worker, prior); assert.equal(f.model.getSnapshot().uncertain, 'workerFinish'); f.dispose();
    }
  });
  add('C23', 'uncertain capture requires reading current facts before another mutation decision', async () => {
    const f = fixture(client); await idle(f); await f.model.execute(); f.on('workerCapture', () => { throw new Error('lost capture reply'); });
    const start = f.calls.length; assert.equal(await f.model.capture(), false);
    assert.deepEqual(f.calls.slice(start).map(call => call.name), ['workerCapture','list','status','workerStatus']);
    assert.equal(f.model.getSnapshot().uncertain, 'workerCapture');
    assert.equal(button(panel(f), 'Capture local result').props.disabled, true, 'uncertain capture must not present immediate retry as available');
    assert.equal(await f.model.capture(), false); assert.equal(f.count('workerCapture'), 1, 'repaired method must refuse before another RPC');
    assert.equal(await f.model.refresh(), true); assert.equal(await f.model.query(), true);
    assert.equal(f.model.getSnapshot().uncertain, 'workerCapture'); assert.equal(f.model.getSnapshot().capture, null);
    assert.equal(button(panel(f), 'Capture local result').props.disabled, true);
    assert.equal(await f.model.capture(), false); assert.equal(f.count('workerCapture'), 1, 'ready-only query is not capture acknowledgement');
    f.dispose();
  });
  add('C24', 'uncertain finish requires reading current facts before another mutation decision', async () => {
    const f = fixture(client); await captured(f); f.on('workerFinish', () => { throw new Error('lost finish reply'); });
    const start = f.calls.length; assert.equal(await f.model.finish(), false);
    assert.deepEqual(f.calls.slice(start).map(call => call.name), ['workerFinish','list','status','workerStatus']);
    assert.equal(f.model.getSnapshot().uncertain, 'workerFinish');
    assert.equal(button(panel(f), 'Finish owned worker').props.disabled, true, 'uncertain finish must not present immediate retry as available');
    assert.equal(await f.model.finish(), false); assert.equal(f.count('workerFinish'), 1, 'repaired method must refuse before another RPC');
    assert.equal(await f.model.refresh(), true); assert.equal(await f.model.query(), true);
    assert.equal(f.model.getSnapshot().uncertain, 'workerFinish'); assert.equal(f.model.getSnapshot().worker.phase, 'ready');
    assert.equal(button(panel(f), 'Finish owned worker').props.disabled, true);
    assert.equal(await f.model.finish(), false); assert.equal(f.count('workerFinish'), 1, 'ready-only query is not finish acknowledgement');
    f.dispose();
  });
  add('C25', 'ordinary cancel paints the authoritative readback and performs no implicit worker operation', async () => {
    const f = fixture(client); await idle(f); const prior = f.taskModel.getSnapshot().detail.task, before = f.calls.length;
    assert.equal(await f.taskModel.control('cancel'), true);
    assert.deepEqual(f.calls.slice(before).map(call => call.name), ['control','list','status']);
    const request = f.calls.find(call => call.name === 'control'); shape(request.input, ['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','kind']);
    assert.equal(request.input.expectedTaskVersion, prior.version); assert.equal(request.input.expectedAuthEpoch, prior.authEpoch);
    assert.equal(f.taskModel.getSnapshot().detail.task.status, 'cancel_requested'); assert.equal(await f.taskModel.control('cancel'), false);
    assert.equal(button(panel(f), 'Execute approved context').props.disabled, true); assert.equal(f.count('workerExecute'), 0); f.dispose();
  });
  add('C26', 'accepted status/catalog/preview/results are detached and deeply immutable', async () => {
    const f = fixture(client); await f.init(); let raw;
    f.on('workerStatus', () => { raw = pass(f.status()); return raw; }); await f.model.refresh();
    const prior = f.model.getSnapshot().status; raw.value.persistence.directory = '/changed/foreign'; raw.value.selection.model = 'changed';
    assert.equal(prior.persistence.directory, '/synthetic/independent-profile/df-sessions'); assert.equal(prior.selection.model, 'typed-fixture-model');
    assert.throws(() => { prior.bounds.resultBytes = 999; }, TypeError); f.off('workerStatus');
    await f.model.catalog(); assert.throws(() => f.model.getSnapshot().catalog.models[0].reasoningEfforts.push({}), TypeError);
    await f.model.previewPolicy(4); assert.throws(() => { f.model.getSnapshot().policyPreview.description.persistence.encrypted = true; }, TypeError); f.dispose();
    const complete = fixture(client); await captured(complete); await complete.model.loadResult(); assert.throws(() => { complete.model.getSnapshot().result.source.claimRef = ref('foreign'); }, TypeError); complete.dispose();
  });
  add('C27', 'disconnect/dispose abort pending reads and prevent late publication or automatic replay', async () => {
    for (const kind of ['disconnected','dispose']) {
      const f = fixture(client); await f.init(); await f.model.refresh(); const gate = defer(); let response, signal, notices = 0;
      f.model.subscribe(() => notices++); f.on('workerCatalog', request => { response = request.reply(); signal = request.signal; return gate.promise; });
      const pending = f.model.catalog(); await turn(); f.model[kind](); const after = f.model.getSnapshot(), count = notices; assert.equal(signal.aborted, true);
      gate.resolve(response); assert.equal(await pending, false); assert.deepEqual(f.model.getSnapshot(), after); assert.equal(notices, count); assert.equal(f.mutations().length, 0); f.dispose();
    }
  });
  add('C28', 'descriptor controls reflect disabled/unavailable/idle/current-output/offline states', async () => {
    const f = fixture(client); await f.init(); let tree = panel(f);
    assert.equal(button(tree, 'Prepare approved context').props.disabled, true); assert.equal(button(tree, 'Execute approved context').props.disabled, true);
    await idle(f); tree = panel(f); assert.equal(button(tree, 'Execute approved context').props.disabled, false); assert.equal(button(tree, 'Capture local result').props.disabled, true);
    await f.model.execute(); tree = panel(f); assert.equal(button(tree, 'Execute approved context').props.disabled, true); assert.equal(button(tree, 'Capture local result').props.disabled, false);
    await f.model.capture(); tree = panel(f); assert.equal(button(tree, 'Capture local result').props.disabled, true); assert.equal(button(tree, 'Load captured result').props.disabled, false);
    await f.model.finish(); tree = panel(f); assert.equal(button(tree, 'Finish owned worker').props.disabled, true);
    f.model.disconnected(); tree = panel(f); for (const label of ['Refresh worker status','Load current worker catalogue','Execute approved context','Query worker','Load captured result','Finish owned worker']) assert.equal(button(tree, label).props.disabled, true, label); f.dispose();
  });
  add('C29', 'stale selected-task reply cannot repopulate old result or scope', async () => {
    const f = fixture(client); await captured(f); const gate = defer(); let reply, signal;
    f.on('workerResult', request => { reply = request.reply(); signal = request.signal; reply.value.content = 'REJECTED_REPLY_CANARY'; return gate.promise; });
    const pending = f.model.loadResult(); await turn(); await f.select('beta'); assert.equal(signal.aborted, true);
    gate.resolve(reply); assert.equal(await pending, false); assert.equal(f.model.getSnapshot().taskRef, ref('beta')); assert.equal(f.model.getSnapshot().result, null); assert.equal(f.model.getSnapshot().worker, null); noRaw(f); f.dispose();
  });
  add('C30', 'same-task version/auth drift clears consent while preserving historical output for explicit reads', async () => {
    const f = fixture(client); await captured(f); await f.model.loadResult(); const prior = f.model.getSnapshot();
    f.change(ref('alpha'), { version: 20, authEpoch: 21 }); await f.taskModel.refresh();
    assert.equal(f.model.getSnapshot().grant, null); assert.equal(f.model.getSnapshot().actionAccepted, false); assert.equal(f.model.getSnapshot().stale, true);
    for (const key of ['contextRecordRef','worker','execution','capture','result']) assert.deepEqual(f.model.getSnapshot()[key], prior[key]);
    assert.equal(await f.model.execute(), false); assert.equal(await f.model.loadResult(), true);
    const latest = f.calls.filter(call => call.name === 'workerResult').at(-1); assert.equal(latest.input.expectedTaskVersion, 20); assert.equal(latest.input.expectedAuthEpoch, 21); assert.equal(f.count('workerExecute'), 1); f.dispose();
  });
  add('C31', 'ordinary foreign-realm response fixture refuses; wire JSON rehydration is the same-realm carrier', async () => {
    const f = fixture(client); const foreign = new Script(`JSON.parse(${JSON.stringify(JSON.stringify(pass(f.status())))})`).runInContext(createContext({}));
    f.on('workerStatus', () => foreign); assert.equal(await f.model.refresh(), false); assert.equal(f.model.getSnapshot().status, null);
    f.on('workerStatus', () => JSON.parse(JSON.stringify(foreign))); assert.equal(await f.model.refresh(), true);
    assert.equal(f.model.getSnapshot().status.phase, 'needs_policy'); assert.equal(f.mutations().length, 0); f.dispose();
  });
}

test('C32 exact source/emitted bundle serialization and lazy module registration', () => {
  const metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(bundleText, `// Generated from src/client-entry.cjs by scripts/build-client.mjs.\nwindow.__ModuleLoader__.load({id:${JSON.stringify(metadata.name)},factory:${sourceFactory.toString()}});\n`);
  let loaded, imports = 0;
  new Script(bundleText).runInContext(createContext({ window: { __ModuleLoader__: { load(value) { assert.equal(loaded, undefined); loaded = value; } } } }));
  assert.equal(imports, 0); const exports = loaded.factory(name => { imports++; assert.equal(name, 'react'); return React; });
  assert.equal(imports, 1); assert.deepEqual(Object.keys(exports).sort(), ['Icon','Panel','apply','createModel','createSetupModel','createWorkerModel','inject'].sort());
  assert.equal(bundleText.includes('document.'), false); assert.equal(bundleText.includes('process.env'), false);
});
