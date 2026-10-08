import { BootstrapError, record, validateConfig } from './config.mjs';
import { splitNormalWorkerSelection } from './normal-native-selection.mjs';
import { validateInstalledAudit } from './installed-audit.mjs';
import { validateInstalledEvents } from './installed-events.mjs';
import { validateInstalledResults } from './installed-results.mjs';
import { validateInstalledWorker, validateWorkerStorageSelection } from './installed-worker-config.mjs';

export function validateInstalledConfig(input) {
  try {
    record(input, ['databasePath', 'hostTarget', 'limits', 'memory', 'worker', 'audit', 'automation', 'results']);
    const { memory: supplied, worker: suppliedWorker, audit: suppliedAudit, automation: suppliedAutomation, results: suppliedResults, ...baseInput } = input;
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
    const {worker,continuation} = splitNormalWorkerSelection(suppliedWorker,memory.enabled);
    if (worker.enabled && (!memory.enabled || base.limits.maxMetadataBytes !== 4096 || !Object.hasOwn(baseInput.limits ?? {}, 'maxMetadataBytes'))) throw new BootstrapError('CONFIG_INVALID');
    validateWorkerStorageSelection(worker, base.databasePath);
    if(Object.hasOwn(input,'audit')&&suppliedAudit===undefined)throw new BootstrapError('CONFIG_INVALID');
    const audit=validateInstalledAudit(suppliedAudit);
    if(audit.enabled){
      if(!worker.enabled||audit.resultByteLimit>worker.bounds.resultBytes)throw new BootstrapError('CONFIG_INVALID');
      for(const role of [audit.review,audit.repair].filter(Boolean))if(role.charges.runtimeMs>worker.policy.maxRuntimeMs||role.charges.usageUnits>worker.policy.maxUsageUnits||role.charges.usageUnits<worker.bounds.requestBytes+role.selection.maxOutputTokens)throw new BootstrapError('CONFIG_INVALID');
    }
    if (Object.hasOwn(input, 'automation') && suppliedAutomation === undefined || Object.hasOwn(input, 'results') && suppliedResults === undefined) throw new BootstrapError('CONFIG_INVALID');
    const automation = validateInstalledEvents(suppliedAutomation), results = validateInstalledResults(suppliedResults);
    // Results need actual native current facts and independently captured audit
    // provenance. Enabling them never expands the explicitly accepted policy.
    if (results.enabled && (!worker.enabled || !audit.enabled || results.admission.units > 1 || results.admission.runtimeMs > worker.policy.maxRuntimeMs || results.admission.usageUnits > worker.policy.maxUsageUnits)) throw new BootstrapError('CONFIG_INVALID');
    return Object.freeze({ ...base, memory, worker:Object.freeze({...worker,...(suppliedWorker&&Object.hasOwn(suppliedWorker,'continuation')?{continuation:continuation??Object.freeze({enabled:false})}:{})}), audit, automation, results });
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
