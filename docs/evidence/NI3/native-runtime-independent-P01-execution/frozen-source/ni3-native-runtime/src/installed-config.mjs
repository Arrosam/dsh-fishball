import { BootstrapError, record, validateConfig } from './config.mjs';
import { validateInstalledAudit } from './installed-audit.mjs';
import { validateInstalledWorker, validateWorkerStorageSelection } from './installed-worker-config.mjs';

export function validateInstalledConfig(input) {
  try {
    record(input, ['databasePath', 'hostTarget', 'limits', 'memory', 'worker', 'audit']);
    const { memory: supplied, worker: suppliedWorker, audit: suppliedAudit, ...baseInput } = input;
    const base = validateConfig(baseInput);
    let memory = Object.freeze({ enabled: false });
    if (Object.hasOwn(input, 'memory')) {
      record(supplied, ['enabled', 'byteLimit', 'tokenLimit']);
      if (!Object.hasOwn(supplied, 'enabled')) throw new BootstrapError('CONFIG_INVALID');
      if (supplied.enabled === false) {
        if (Object.keys(supplied).length !== 1) throw new BootstrapError('CONFIG_INVALID');
      } else {
        if (supplied.enabled !== true || Object.keys(supplied).length !== 3 ||
            !Number.isSafeInteger(supplied.byteLimit) || supplied.byteLimit < 1 || supplied.byteLimit > 65536 ||
            !Number.isSafeInteger(supplied.tokenLimit) || supplied.tokenLimit < 1 || supplied.tokenLimit > 131072) throw new BootstrapError('CONFIG_INVALID');
        memory = Object.freeze({ enabled: true, byteLimit: supplied.byteLimit, tokenLimit: supplied.tokenLimit });
      }
    }
    if (Object.hasOwn(input, 'worker') && suppliedWorker === undefined) throw new BootstrapError('CONFIG_INVALID');
    const worker = validateInstalledWorker(suppliedWorker);
    if (worker.enabled && (!memory.enabled || base.limits.maxMetadataBytes !== 4096 || !Object.hasOwn(baseInput.limits ?? {}, 'maxMetadataBytes'))) throw new BootstrapError('CONFIG_INVALID');
    validateWorkerStorageSelection(worker, base.databasePath);
    if(Object.hasOwn(input,'audit')&&suppliedAudit===undefined)throw new BootstrapError('CONFIG_INVALID');
    const audit=validateInstalledAudit(suppliedAudit);
    if(audit.enabled){
      if(!worker.enabled||audit.resultByteLimit>worker.bounds.resultBytes)throw new BootstrapError('CONFIG_INVALID');
      for(const role of [audit.review,audit.repair].filter(Boolean))if(role.charges.runtimeMs>worker.policy.maxRuntimeMs||role.charges.usageUnits>worker.policy.maxUsageUnits||role.charges.usageUnits<worker.bounds.requestBytes+role.selection.maxOutputTokens)throw new BootstrapError('CONFIG_INVALID');
    }
    return Object.freeze({ ...base, memory, worker, audit });
  } catch (error) {
    throw error instanceof BootstrapError ? error : new BootstrapError('CONFIG_INVALID');
  }
}

export const Config = Object.freeze({ '~standard': Object.freeze({
  version: 1, vendor: 'df',
  validate(value) {
    try { return { value: validateInstalledConfig(value) }; }
    catch (error) { return { issues: [{ message: error.code }] }; }
  },
}) });
