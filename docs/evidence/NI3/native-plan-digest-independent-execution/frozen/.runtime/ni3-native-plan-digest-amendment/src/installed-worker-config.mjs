import { isAbsolute, resolve, dirname, basename } from 'node:path';
import { lstatSync, realpathSync } from 'node:fs';
import { types } from 'node:util';
import { BootstrapError } from './config.mjs';

const invalid = () => { throw new BootstrapError('CONFIG_INVALID'); };
export function workerChoiceRecord(value, fields) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  if (keys.length !== fields.length || keys.some(key => typeof key !== 'string' || !fields.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value'))) invalid();
  return value;
}
function integer(value, min, max) { if (!Number.isSafeInteger(value) || value < min || value > max) invalid(); return value; }
function text(value, max) {
  if (typeof value !== 'string' || !value.isWellFormed() || !value.length || value.trim() !== value || /[\x00-\x1f\x7f]/.test(value) || Buffer.byteLength(value) > max) invalid();
  return value;
}
function path(value) { text(value, 1024); if (!isAbsolute(value) || resolve(value) !== value) invalid(); return value; }
function ownedDirectory(value) {
  path(value);
  const fact = lstatSync(value);
  if (!fact.isDirectory() || fact.isSymbolicLink() || fact.uid !== process.getuid() || realpathSync(value) !== value) invalid();
  return value;
}
const disabled = Object.freeze({ enabled: false });
export function validateInstalledWorker(input) {
  try {
    if (input === undefined) return disabled;
    // Inspect descriptors before even the discriminator can execute a getter.
    if (!input || typeof input !== 'object' || types.isProxy(input) || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) invalid();
    const descriptor = Object.getOwnPropertyDescriptor(input, 'enabled');
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalid();
    if (descriptor.value === false) { workerChoiceRecord(input, ['enabled']); return disabled; }
    if (descriptor.value !== true) invalid();
    workerChoiceRecord(input, ['enabled', 'selection', 'environment', 'persistence', 'bounds', 'policy', 'charges', 'previewTtlMs', 'grantTtlMs']);
    const { selection, environment, persistence, bounds, policy, charges } = input;
    workerChoiceRecord(selection, ['provider', 'model', 'agentPreset', 'reasoningEffort', 'maxOutputTokens']);
    workerChoiceRecord(environment, ['root', 'cwd']);
    workerChoiceRecord(persistence, ['directory', 'compression', 'retention']);
    workerChoiceRecord(bounds, ['requestBytes', 'resultBytes']);
    workerChoiceRecord(policy, ['maxRuntimeMs', 'maxUsageUnits', 'maxCostEstimateMicros']);
    workerChoiceRecord(charges, ['runtimeMs', 'usageUnits']);
    const selected = Object.freeze({ provider: text(selection.provider, 128), model: text(selection.model, 256), agentPreset: text(selection.agentPreset, 128), reasoningEffort: selection.reasoningEffort === null ? null : text(selection.reasoningEffort, 128), maxOutputTokens: integer(selection.maxOutputTokens, 128, 4096) });
    const root = ownedDirectory(environment.root), cwd = ownedDirectory(environment.cwd);
    if (cwd !== root && !cwd.startsWith(root + '/')) invalid();
    const directory = path(persistence.directory);
    if (!/^df-sessions(?:-[a-z0-9][a-z0-9-]{0,31})?$/.test(basename(directory)) || !['none', 'zstd'].includes(persistence.compression) || persistence.retention !== 'owner-managed') invalid();
    const checkedBounds = Object.freeze({ requestBytes: integer(bounds.requestBytes, 512, 131072), resultBytes: integer(bounds.resultBytes, 128, 16384) });
    const checkedPolicy = Object.freeze({ maxRuntimeMs: integer(policy.maxRuntimeMs, 1, 3600000), maxUsageUnits: integer(policy.maxUsageUnits, 1, 100000000), maxCostEstimateMicros: integer(policy.maxCostEstimateMicros, 0, 100000000) });
    const checkedCharges = Object.freeze({ runtimeMs: integer(charges.runtimeMs, 1, 60000), usageUnits: integer(charges.usageUnits, 1, 100000000) });
    if (checkedCharges.runtimeMs > checkedPolicy.maxRuntimeMs || checkedCharges.usageUnits > checkedPolicy.maxUsageUnits || checkedCharges.usageUnits < checkedBounds.requestBytes + selected.maxOutputTokens) invalid();
    return Object.freeze({ enabled: true, selection: selected, environment: Object.freeze({ root, cwd }), persistence: Object.freeze({ directory, compression: persistence.compression, retention: persistence.retention }), bounds: checkedBounds, policy: checkedPolicy, charges: checkedCharges, previewTtlMs: integer(input.previewTtlMs, 1, 60000), grantTtlMs: integer(input.grantTtlMs, 1, 60000) });
  } catch { invalid(); }
}

export function validateWorkerStorageSelection(worker, databasePath) {
  if (!worker.enabled) return;
  if (dirname(worker.persistence.directory) !== dirname(databasePath) || resolve(databasePath) !== databasePath) invalid();
}
