// SOURCE ONLY. Trusted composition; never accepted as an RPC authority field.
export const cloudAdmission = Object.freeze({
  costEstimateMicros: 1000000,
  authorizationRef: 'fb5a5178e165a1e40427bae17953baa6cac46f3446035d22a24e1510da3be4cb',
});
export const bounds = Object.freeze({ calls: 6, active: 1, liveWindowMs: 480000,
  interruptWindowMs: 90000, rpcWindowMs: 75000, cleanupWindowMs: 15000,
  requestBytes: 32768, resultBytes: 16384, outputTokens: 512,
  forwardedOutputBytes: 2048, goalBytes: 8192, usageUnits: 33280,
  aggregateRuntimeMs: 360000, aggregateUsageUnits: 199680,
  aggregateAdmissionMicros: 6000000 });
export function installedConfig({ data, environment, directory }) {
  return { databasePath: `${data}/runtime.sqlite`, hostTarget: 'dsh-web-0.2.1-alpha.1',
    limits: { maxMetadataBytes: 4096, maxActive: 1, maxAttempts: 1, maxTasks: 6, queueCapacity: 6 },
    memory: { enabled: true, byteLimit: 16384, tokenLimit: 8192 },
    worker: { enabled: true,
      selection: { provider: 'df-approved-ollama', model: 'deepseek-v4.1-flash:cloud',
        agentPreset: 'df-ollama-empty', reasoningEffort: 'ollama-think-off', maxOutputTokens: 512 },
      environment: { root: environment, cwd: environment },
      persistence: { directory, compression: 'none', retention: 'owner-managed' },
      bounds: { requestBytes: 32768, resultBytes: 16384 },
      policy: { maxRuntimeMs: 360000, maxUsageUnits: 199680, maxCostEstimateMicros: 6000000 },
      charges: { runtimeMs: 60000, usageUnits: 33280 }, previewTtlMs: 60000, grantTtlMs: 60000 } };
}
