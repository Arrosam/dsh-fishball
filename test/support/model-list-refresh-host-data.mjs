/** Public-API vocabulary for one isolated dynamic-catalog provider fixture. */
export const HOST_REFRESH = Object.freeze({
  fixture: 'fbtest-model-list-refresh',
  timeoutMs: 120000, ipcTimeoutMs: 10000,
  request: 'fbtest-refresh-request', response: 'fbtest-refresh-response',
  operations: Object.freeze({ catalog: 'catalog', configure: 'configure', defaults: 'defaults' }),
  providers: Object.freeze({ good: 'refresh-dynamic-good', broken: 'refresh-dynamic-broken' }),
  names: Object.freeze({ good: 'Refresh dynamic provider', broken: 'Broken refresh provider' }),
  models: Object.freeze({ first: 'refresh-host-first', next: 'refresh-host-next' }),
  failure: 'synthetic provider catalog failure',
  contextWindow: 128000, defaultMaxTokens: 4096,
  homeLabel: 'model-list-refresh', osHome: 'os-home', agentsHome: 'agents-home',
  event: 'llm/adapters-updated', text: 'text', effort: 'high',
})
