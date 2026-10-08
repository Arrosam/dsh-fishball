import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { isAbsolute, resolve } from 'node:path';
import { realpathSync, statSync } from 'node:fs';
import { contextText } from './context.mjs';

export class WorkerError extends Error {
  constructor(code) { super(code); this.name = 'WorkerError'; this.code = code; }
}
export const workerFail = code => { throw new WorkerError(code); };
export const workerDigest = (...parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
export function workerRecord(value, keys, required = keys) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) workerFail('WORKER_INVALID');
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).some(key => typeof key !== 'string' || !keys.includes(key) || !fields[key].enumerable || !Object.hasOwn(fields[key], 'value')) || required.some(key => !Object.hasOwn(fields, key))) workerFail('WORKER_INVALID');
}
export function workerRef(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) workerFail('WORKER_INVALID');
  return value;
}
export function workerInteger(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) workerFail('WORKER_INVALID');
  return value;
}
const tokens = new WeakMap();
const handoffs = new WeakMap();

// Constructor entries are trusted process configuration. A JSON record, digest,
// or environment ref never becomes a capability. No cwd or model configuration
// appears in outward metadata; inspect is for trusted adapter composition only.
export class EnvironmentRegistry {
  #entries = new Map(); #current; #clock; #secrets;
  constructor({ entries, currentState, clock = Date.now, knownSecrets = [] } = {}) {
    if (!Array.isArray(entries) || types.isProxy(entries) || entries.length < 1 || entries.length > 32 || typeof currentState !== 'function' || typeof clock !== 'function') workerFail('ENVIRONMENT_CONFIG');
    contextText('', knownSecrets);
    this.#current = currentState; this.#clock = clock; this.#secrets = [...knownSecrets];
    for (const entry of entries) {
      workerRecord(entry, ['environmentRef', 'workspaceRef', 'bindingDigest', 'toolsDigest', 'permissionPolicyDigest', 'cwd', 'root', 'provider', 'model', 'reasoningEffort', 'modelRef', 'reasoningRef', 'presetRef'], ['environmentRef', 'workspaceRef', 'bindingDigest', 'toolsDigest', 'permissionPolicyDigest', 'cwd', 'root', 'provider', 'model', 'modelRef', 'reasoningRef', 'presetRef']);
      for (const key of ['environmentRef', 'workspaceRef', 'bindingDigest', 'toolsDigest', 'permissionPolicyDigest', 'modelRef', 'reasoningRef', 'presetRef']) workerRef(entry[key]);
      for (const key of ['provider', 'model']) { contextText(entry[key], this.#secrets, 256); if (!entry[key]) workerFail('ENVIRONMENT_CONFIG'); }
      if (entry.reasoningEffort !== undefined) { contextText(entry.reasoningEffort, this.#secrets, 128); if (!entry.reasoningEffort) workerFail('ENVIRONMENT_CONFIG'); }
      try {
        if (typeof entry.root !== 'string' || typeof entry.cwd !== 'string' || !isAbsolute(entry.root) || !isAbsolute(entry.cwd)) workerFail('ENVIRONMENT_CONFIG');
        const root = realpathSync(entry.root), cwd = realpathSync(entry.cwd);
        if (!statSync(cwd).isDirectory() || cwd !== root && !cwd.startsWith(root + '/') || resolve(entry.cwd) !== cwd || resolve(entry.root) !== root) workerFail('ENVIRONMENT_CONFIG');
        if (this.#entries.has(entry.environmentRef)) workerFail('ENVIRONMENT_CONFIG');
        this.#entries.set(entry.environmentRef, Object.freeze({ ...entry, root, cwd }));
      } catch { workerFail('ENVIRONMENT_CONFIG'); }
    }
  }
  bind(spec, task) {
    workerRecord(spec, ['actionRef', 'kind', 'role', 'targetDigest', 'dataDigest', 'units', 'charges', 'attemptGroupRef', 'attemptIndex', 'resourcePolicyVersion', 'modelPolicyVersion', 'executor', 'model'], ['executor', 'model']);
    workerRecord(task, ['ownerRef', 'workspaceRef', 'taskRef', 'status', 'version', 'taskVersion', 'authEpoch', 'createdAt', 'updatedAt'], ['workspaceRef', 'taskRef', 'version', 'authEpoch']);
    const executor = spec?.executor, model = spec?.model;
    if (!executor || !model) workerFail('ENVIRONMENT_UNAVAILABLE');
    workerRecord(executor, ['mode', 'generationRef', 'sessionRef', 'environmentRef', 'bindingDigest', 'toolsDigest', 'permissionPolicyDigest'], ['generationRef', 'environmentRef', 'bindingDigest', 'toolsDigest', 'permissionPolicyDigest']);
    workerRecord(model, ['modelRef', 'reasoningRef', 'presetRef', 'catalogEvidenceRef'], ['modelRef', 'reasoningRef', 'presetRef']);
    const entry = this.#entries.get(executor.environmentRef);
    if (!entry || task.workspaceRef !== entry.workspaceRef || executor.bindingDigest !== entry.bindingDigest || executor.toolsDigest !== entry.toolsDigest || executor.permissionPolicyDigest !== entry.permissionPolicyDigest || model.modelRef !== entry.modelRef || model.reasoningRef !== entry.reasoningRef || model.presetRef !== entry.presetRef) workerFail('ENVIRONMENT_MISMATCH');
    let state;
    try { state = this.#current(Object.freeze({ environmentRef: entry.environmentRef, workspaceRef: entry.workspaceRef })); workerRef(state); }
    catch { workerFail('ENVIRONMENT_UNAVAILABLE'); }
    const token = Object.freeze({});
    tokens.set(token, { registry: this, entry, state, taskRef: workerRef(task.taskRef), generationRef: workerRef(executor.generationRef), version: workerInteger(task.version, 1), authEpoch: workerInteger(task.authEpoch) });
    return token;
  }
  inspect(token, callback) {
    const bound = tokens.get(token);
    if (!bound || bound.registry !== this || typeof callback !== 'function') workerFail('ENVIRONMENT_UNAVAILABLE');
    return callback(bound.entry);
  }
  assertCurrent(token) {
    const bound = tokens.get(token);
    if (!bound || bound.registry !== this) workerFail('ENVIRONMENT_UNAVAILABLE');
    let state;
    try { state = this.#current(Object.freeze({ environmentRef: bound.entry.environmentRef, workspaceRef: bound.entry.workspaceRef })); }
    catch { workerFail('ENVIRONMENT_UNAVAILABLE'); }
    if (state !== bound.state) workerFail('ENVIRONMENT_STALE');
    return bound.state;
  }
  bindCurrentTask(token, task) {
    this.assertCurrent(token);
    workerRecord(task, ['ownerRef', 'workspaceRef', 'taskRef', 'status', 'version', 'taskVersion', 'authEpoch', 'createdAt', 'updatedAt'], ['workspaceRef', 'taskRef', 'version', 'authEpoch']);
    const bound = tokens.get(token);
    if (task.taskRef !== bound.taskRef || task.workspaceRef !== bound.entry.workspaceRef) workerFail('ENVIRONMENT_MISMATCH');
    bound.version = workerInteger(task.version, 1); bound.authEpoch = workerInteger(task.authEpoch);
  }
  handoff(token, input) {
    workerRecord(input, ['targetEnvironmentRef', 'reason', 'steps', 'resumeCondition', 'expiresAt', 'taskVersion', 'authEpoch', 'actionDigest', 'claimRef', 'generationRef']);
    for (const key of ['targetEnvironmentRef', 'actionDigest', 'claimRef', 'generationRef']) workerRef(input[key]);
    for (const key of ['reason', 'steps', 'resumeCondition']) { contextText(input[key], this.#secrets, 4096); if (!input[key]) workerFail('WORKER_INVALID'); }
    workerInteger(input.expiresAt, 1); workerInteger(input.taskVersion, 1); workerInteger(input.authEpoch, 0);
    const bound = tokens.get(token); this.assertCurrent(token);
    if (!this.#entries.has(input.targetEnvironmentRef) || this.#entries.get(input.targetEnvironmentRef).workspaceRef !== bound.entry.workspaceRef || input.generationRef !== bound.generationRef || input.taskVersion !== bound.version || input.authEpoch !== bound.authEpoch || input.expiresAt <= this.#clock()) workerFail('HANDOFF_STALE');
    const handoff = Object.freeze({ ...input, taskRef: bound.taskRef, sourceEnvironmentRef: bound.entry.environmentRef, sourceStateRef: bound.state, state: 'pending' });
    handoffs.set(handoff, { registry: this, token });
    return handoff;
  }
  validateHandoff(token, handoff, task, verifiedTargetStateRef) {
    workerRecord(handoff, ['targetEnvironmentRef', 'reason', 'steps', 'resumeCondition', 'expiresAt', 'taskVersion', 'authEpoch', 'actionDigest', 'claimRef', 'generationRef', 'taskRef', 'sourceEnvironmentRef', 'sourceStateRef', 'state']);
    this.assertCurrent(token); workerRef(verifiedTargetStateRef);
    workerRecord(task, ['ownerRef', 'workspaceRef', 'taskRef', 'status', 'version', 'taskVersion', 'authEpoch', 'createdAt', 'updatedAt'], ['workspaceRef', 'taskRef', 'version', 'authEpoch']);
    if (handoffs.get(handoff)?.registry !== this || handoffs.get(handoff)?.token !== token) workerFail('HANDOFF_UNVERIFIED');
    const bound = tokens.get(token), target = this.#entries.get(handoff.targetEnvironmentRef);
    let actual;
    try { actual = target && this.#current(Object.freeze({ environmentRef: target.environmentRef, workspaceRef: target.workspaceRef })); } catch { workerFail('HANDOFF_STALE'); }
    if (handoff.state !== 'pending' || handoff.expiresAt <= this.#clock() || task.taskRef !== handoff.taskRef || task.version !== handoff.taskVersion || task.authEpoch !== handoff.authEpoch || handoff.sourceStateRef !== bound.state || handoff.sourceEnvironmentRef !== bound.entry.environmentRef || target?.workspaceRef !== bound.entry.workspaceRef || actual !== verifiedTargetStateRef) workerFail('HANDOFF_STALE');
    // Successful validation is evidence only. It grants neither permission nor
    // execution; fresh intent, owner consent and atomic claim remain necessary.
    return Object.freeze({ targetEnvironmentRef: target.environmentRef, targetStateRef: actual, state: 'verified' });
  }
}
