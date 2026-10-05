import { types } from 'node:util';
import { exact, ref, integer, canonical, canonicalDigest, normalizedSpec } from './runtime-security.mjs';
import { workerFail } from './environment.mjs';

const deny = () => workerFail('HOST_PERMISSION_DENIED');
const fullFields = ['ownerRef', 'workspaceRef', 'taskRef', 'actionRef', 'actionDigest', 'taskVersion', 'authEpoch', 'spec'];
const minimalFields = ['taskRef', 'generationRef', 'environmentRef', 'bindingDigest', 'toolsDigest', 'permissionPolicyDigest'];
const syncFunction = f => typeof f === 'function' && !types.isProxy(f) && !types.isAsyncFunction(f) && !types.isGeneratorFunction(f);
const same = (a, b) => canonical(a) === canonical(b);
const detached = v => JSON.parse(canonical(v));
const frozen = v => { const copy = detached(v); const freeze = x => { if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); } return x; }; return freeze(copy); };

// One dispatcher for one original NativeAdapter/WorkerManager. Contributions
// are source closures, never owner configuration or alternate native managers.
// The locked full callback deliberately performs no public store transaction.
export class NativeContributions {
  #contributions = new Set(); #registrations = new WeakSet(); #rows = new Map(); #tokens = new WeakMap(); #agents = new WeakMap();
  #readTask; #assertOwner; #verifyClaim; #active = true; #started = false; #matching = false; #reentered = false;
  constructor(options) {
    exact(options, ['readCurrentTask', 'assertOwnerCurrent', 'verifyClaimBinding']);
    if (Object.values(options).some(f => !syncFunction(f))) deny();
    this.#readTask = options.readCurrentTask; this.#assertOwner = options.assertOwnerCurrent; this.#verifyClaim = options.verifyClaimBinding;
  }
  #current() { if (!this.#active || this.#assertOwner() !== true) deny(); }
  register(value) {
    this.#current(); if (this.#started || this.#contributions.size >= 2 || this.#registrations.has(value)) deny();
    exact(value, ['matchesSpec', 'matchesFull', 'environments', 'toolGuard', 'nativeHooks']);
    if (![value.matchesSpec, value.matchesFull, value.toolGuard].every(syncFunction)) deny();
    exact(value.environments, ['bind', 'inspect', 'assertCurrent']);
    if (!Object.values(value.environments).every(syncFunction)) deny();
    exact(value.nativeHooks, ['setupAgent', 'commitAgent', 'bindExecution', 'validateResult']);
    if (Object.values(value.nativeHooks).some(f => typeof f !== 'function' || types.isProxy(f))) deny();
    const c = Object.freeze({ ...value, environments: Object.freeze({ ...value.environments }), nativeHooks: Object.freeze({ ...value.nativeHooks }) });
    this.#registrations.add(value); this.#contributions.add(c); return c;
  }
  #select(spec, taskRef) {
    this.#current();
    const matches = [];
    for (const c of this.#contributions) {
      const out = c.matchesSpec(spec, taskRef);
      if (out !== true && out !== false) deny();
      if (out) matches.push(c);
    }
    if (matches.length !== 1) deny(); return matches[0];
  }
  #row(taskRef, generationRef) {
    this.#current(); const row = this.#rows.get(`${taskRef}:${generationRef}`);
    if (!row || this.#select(row.spec, taskRef) !== row.contribution) deny();
    if (row.contribution.environments.assertCurrent(row.environment) !== row.sourceRef) deny();
    return row;
  }
  #full(record) {
    canonical(record); exact(record, fullFields);
    for (const k of fullFields.filter(k => !['spec', 'taskVersion', 'authEpoch'].includes(k))) ref(record[k]);
    integer(record.taskVersion, 1); integer(record.authEpoch);
    const spec = normalizedSpec(record.spec);
    this.#current();
    const row = this.#rows.get(`${record.taskRef}:${spec.executor.generationRef}`);
    // The authentic audit environment assertion reads the public store. This
    // locked route must not enter #row, environment assertions or any native
    // hook. Only retained source-private origin and synchronous full matching
    // may run here; ordinary minimal/bind/claim checks still use #row outside.
    if (!row || this.#select(row.spec, record.taskRef) !== row.contribution) deny();
    if (record.ownerRef !== row.ownerRef || record.workspaceRef !== row.workspaceRef || record.actionRef !== row.spec.actionRef || record.actionDigest !== row.actionDigest || !same(spec, row.spec)) deny();
    // This matcher is the source's real full denial. No fallback selection,
    // private mapping or successful native permission can override false.
    const witness = Object.freeze({ environment: row.environment, sourceRef: row.sourceRef });
    // Root authenticates this exact opaque token/current source and then the
    // unchanged original full matcher. Neither refs nor a native boolean are
    // a substitute. These source closures must perform no public transaction.
    if (row.contribution.matchesFull(record, witness) !== true) deny();
    this.#current(); return true;
  }
  hostPermission = record => {
    if (this.#matching) { this.#reentered = true; return false; }
    this.#matching = true; this.#reentered = false;
    try { return this.#full(record) === true && !this.#reentered; }
    catch { return false; }
    finally { this.#matching = false; }
  };
  #minimal(record) {
    canonical(record); exact(record, [...minimalFields, 'claimRef', 'actionDigest'], minimalFields);
    for (const v of Object.values(record)) ref(v);
    const row = this.#row(record.taskRef, record.generationRef);
    for (const k of minimalFields.filter(k => k !== 'taskRef')) if (record[k] !== row.spec.executor[k]) deny();
    if (row.claim) {
      exact(record, [...minimalFields, 'claimRef', 'actionDigest']);
      if (record.claimRef !== row.claim.claimRef || record.actionDigest !== row.actionDigest) deny();
    } else exact(record, minimalFields);
    // Outside the core's transaction: derive scope/version only from current
    // original scoped state; never forward the six/eight native fields as full.
    const task = detached(this.#readTask(record.taskRef));
    if (task.taskRef !== row.taskRef || task.ownerRef !== row.ownerRef || task.workspaceRef !== row.workspaceRef) deny();
    return this.hostPermission(Object.freeze({ ownerRef: task.ownerRef, workspaceRef: task.workspaceRef, taskRef: task.taskRef, actionRef: row.spec.actionRef, actionDigest: row.actionDigest, taskVersion: task.version, authEpoch: task.authEpoch, spec: detached(row.spec) }));
  }
  claimBinding = binding => {
    this.#current(); canonical(binding);
    exact(binding, ['taskRef', 'actionRef', 'actionDigest', 'claimRef', 'reservationRef', 'generationRef', 'sessionRef', 'spec']);
    const row = this.#row(binding.taskRef, binding.generationRef);
    if (row.claim || binding.actionRef !== row.spec.actionRef || binding.actionDigest !== row.actionDigest || binding.sessionRef !== row.spec.executor.sessionRef || !same(binding.spec, row.spec)) deny();
    ref(binding.claimRef); ref(binding.reservationRef);
    // Root's original scoped action/claim/reservation check is mandatory.
    // Detached callback labels alone never authenticate this transition.
    if (this.#verifyClaim(binding) !== true) deny(); this.#current();
    row.claim = Object.freeze(detached(binding)); return true;
  };
  worker = Object.freeze({
    environments: Object.freeze({
      bind: (spec, task) => {
        this.#current(); spec = frozen(normalizedSpec(spec)); task = frozen(task);
        const c = this.#select(spec, task.taskRef), key = `${task.taskRef}:${spec.executor.generationRef}`;
        if (this.#rows.has(key) || this.#rows.size >= 1000) deny(); this.#started = true;
        const environment = c.environments.bind(spec, task), token = Object.freeze({});
        const sourceRef = ref(c.environments.assertCurrent(environment));
        const row = { contribution: c, environment, sourceRef, spec, actionDigest: canonicalDigest(spec), taskRef: ref(task.taskRef), ownerRef: ref(task.ownerRef), workspaceRef: ref(task.workspaceRef), claim: null };
        // Retain the map before returning from bind, before original #permit.
        this.#rows.set(key, row); this.#tokens.set(token, row); return token;
      },
      inspect: (token, callback) => { const row = this.#tokens.get(token); if (!row || this.#row(row.taskRef, row.spec.executor.generationRef) !== row) deny(); return row.contribution.environments.inspect(row.environment, callback); },
      assertCurrent: token => { const row = this.#tokens.get(token); if (!row || this.#row(row.taskRef, row.spec.executor.generationRef) !== row) deny(); return row.contribution.environments.assertCurrent(row.environment); },
    }),
    permission: record => { try { return this.#minimal(record) === true; } catch { return false; } },
    toolGuard: record => {
      try {
        this.#current(); const owned = this.#agents.get(record.agent), row = this.#row(record.taskRef, record.generationRef);
        if (!owned || owned.row !== row || !row.claim || record.claimRef !== row.claim.claimRef) return false;
        return row.contribution.toolGuard(record) === true;
      } catch { return false; }
    },
    resolveSession: undefined,
  });
  nativeHooks = Object.freeze({
    setupAgent: async (agentCtx, agent, binding) => {
      const row = this.#row(binding.taskRef, binding.generationRef);
      if (!row.claim || !same(binding.spec, row.spec) || binding.claimRef !== row.claim.claimRef || binding.actionDigest !== row.actionDigest || this.#agents.has(agent)) deny();
      await row.contribution.nativeHooks.setupAgent(agentCtx, agent, binding);
      this.#current(); if (this.#row(binding.taskRef, binding.generationRef) !== row) deny();
      this.#agents.set(agent, { row, binding: detached(binding) });
    },
    commitAgent: (agentCtx, agent, binding) => { this.#current(); const owned = this.#agents.get(agent); if (!owned || !same(owned.binding, binding)) deny(); return owned.row.contribution.nativeHooks.commitAgent(agentCtx, agent, binding) === true; },
    bindExecution: (agent, execution, body) => { this.#current(); const owned = this.#agents.get(agent); if (!owned || this.#row(execution.taskRef, execution.generationRef) !== owned.row || execution.claimRef !== owned.row.claim?.claimRef || execution.actionDigest !== owned.row.actionDigest) deny(); return owned.row.contribution.nativeHooks.bindExecution(agent, execution, body) === true; },
    validateResult: async (agent, result) => { this.#current(); const owned = this.#agents.get(agent); if (!owned || this.#row(result.taskRef, result.generationRef) !== owned.row || result.claimRef !== owned.row.claim?.claimRef) deny(); const out = await owned.row.contribution.nativeHooks.validateResult(agent, result); this.#current(); this.#row(result.taskRef, result.generationRef); return out; },
  });
  seal() { this.#active = false; this.#rows.clear(); this.#contributions.clear(); }
}
