// New selected realm only. This reference identifies the frozen source selection;
// it is not wire-carried operator authority, a price, or a billing settlement.
export const AC_SHA256 = 'c00192b717d9a8c0979e8924a680f7cbb483601cca9d7d41c0805f03840c4b78';
export const cloudAdmission = Object.freeze({ costEstimateMicros: 1000000,
  authorizationRef: AC_SHA256 });
export const GOAL = 'For this authorized synthetic DF test, return exactly DF_ONE_CALL_READY. Do not request tools, memory writes, or further steps.';
export const bounds = Object.freeze({ controlHTTP: 35, dfRPC: 30, metadataHTTP: 3,
  modelPOST: 1, tasks: 1, workerExecute: 1, issuedPermits: 1,
  requestBytes: 32768, resultBytes: 16384, outputTokens: 512, usageUnits: 33280,
  controlRequestBytes: 65536, controlResponseBytes: 1048576,
  metadataResponseBytes: 1048576, sessionBytes: 1048576, sessionEvents: 128,
  bootMs: 30000, httpMs: 5000, executeHTTPMs: 75000, providerMs: 60000,
  workMs: 135000, cleanupMs: 15000, outerProcessMs: 150000,
  observationFiles: 8, observationBytes: 16384,
  retainedFiles: 32, retainedDirectories: 20, retainedBytes: 33554432 });
export function installedConfig({ data, environment, directory }) {
  return { databasePath: `${data}/runtime.sqlite`, hostTarget: 'dsh-web-0.2.1-alpha.1',
    limits: { maxMetadataBytes: 4096, maxActive: 1, maxAttempts: 1,
      maxTasks: 1, queueCapacity: 1, maxActionsPerTask: 16, maxEventsPerTask: 128 },
    memory: { enabled: true, byteLimit: 16384, tokenLimit: 8192 },
    worker: { enabled: true,
      selection: { provider: 'df-approved-ollama', model: 'deepseek-v4.1-flash:cloud',
        agentPreset: 'df-ollama-empty', reasoningEffort: 'ollama-think-off', maxOutputTokens: 512 },
      environment: { root: environment, cwd: environment },
      persistence: { directory, compression: 'none', retention: 'owner-managed' },
      bounds: { requestBytes: 32768, resultBytes: 16384 },
      policy: { maxRuntimeMs: 60000, maxUsageUnits: 33280, maxCostEstimateMicros: 1000000 },
      charges: { runtimeMs: 60000, usageUnits: 33280 },
      previewTtlMs: 60000, grantTtlMs: 60000 } };
}
