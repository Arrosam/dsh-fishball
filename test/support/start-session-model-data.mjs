/** Test-owned EP/BVA/DT vocabulary, independent of production feature constants. */
export const START_MODEL = Object.freeze({
  provider: 'start-selection-probe',
  models: Object.freeze({ analysis: 'route/analysis-v1', fast: 'fast-v1', plain: 'plain-v1' }),
  effort: Object.freeze({ default: 'reflect', first: 'skim', last: 'deep-search', dynamic: 'future-effort', wrongModel: 'instant' }),
  efforts: Object.freeze({ analysis: ['skim', 'reflect', 'deep-search'], fast: ['instant'], dynamic: ['skim', 'reflect', 'deep-search', 'future-effort'] }),
  contextWindow: 128000,
  maxTokens: 4096,
  text: Object.freeze({ title: 'Selected target', message: 'start-session model boundary probe', reply: 'selection fixture reply', external: 'independent external wake probe' }),
  event: Object.freeze({ selection: 'model/selection' }),
  error: Object.freeze({ model: 'invalid-model', effort: 'invalid-reasoning-effort', required: 'model-required', unavailable: 'model-unavailable', selection: 'model-selection-failed', cap: 'hourly-cap' }),
  failure: Object.freeze({ catalog: 'probe: catalog rejected', resolve: 'probe: model validation rejected', selection: 'probe: selection rejected', flush: 'probe: selection flush rejected', false: 'false', code: 'INVALID_CONFIG' }),
  ipc: Object.freeze({ request: 'start-model-probe', response: 'start-model-probe-reply' }),
  fixture: Object.freeze({ name: 'fbtest-start-session-model', timeoutMs: 40000 }),
  api: Object.freeze({ select: '/api/fishball/model' }),
})
export const route = model => START_MODEL.provider + '/' + model
