/**
 * Vocabulary for the Onboarding test suites (Parts 2, 3, and 4) in `dsh-fishball-instance`.
 * Every product constant comes strictly from the public requirements and contracts; no
 * implementation source was inspected.
 */

export const CHILD_MODEL_CONTRACT = Object.freeze({
  channel: 'child-model',
  settingsNamespace: 'fishball-core',
  path: Object.freeze(['model']),
  op: Object.freeze({
    read: 'read',
    set: 'set',
  }),
  code: Object.freeze({
    unavailable: 'CHILD_MODEL_CHANNEL_UNAVAILABLE',
    notReady: 'not-ready',
    namespaceMissing: 'namespace-missing',
    invalidModel: 'invalid-model',
    writeFailed: 'write-failed',
  }),
  errorCode: 'CHILD_MODEL_CHANNEL_UNAVAILABLE',
})

export const ONBOARDING_CONTRACT = Object.freeze({
  file: 'onboarding.json',
  format: 1,
  outcome: Object.freeze({
    completed: 'completed',
    skipped: 'skipped',
    preconfigured: 'preconfigured',
  }),
})

export const ONBOARDING_ROUTES = Object.freeze({
  state: '/api/dsh-instance/onboarding/state',
  model: '/api/dsh-instance/onboarding/model',
  complete: '/api/dsh-instance/onboarding/complete',
})

export const INSTANCE_ROUTES = Object.freeze({
  status: '/api/dsh-instance/status',
  modelsCheck: '/api/dsh-instance/models/check',
  modelsAdd: '/api/dsh-instance/models/add',
  pluginsList: '/api/dsh-instance/plugins',
  pluginsInspect: '/api/dsh-instance/plugins/inspect',
  pluginsInstall: '/api/dsh-instance/plugins/install',
})

export const HTTP = Object.freeze({
  ok: 200,
  badRequest: 400,
  forbidden: 403,
  maxBodyBytes: 16384,
  operationFailed: 'operation-failed',
  foreignOrigin: 'https://evil.example',
  host: '127.0.0.1:47011',
  origin: 'http://127.0.0.1:47011',
})

export const PORTAL = Object.freeze({
  serviceName: 'dshConnectorUiPortal',
  apiVersion: 1,
})

export const WATCHDOG_NS = 'dsh-connector-watchdog'

export const MEMORY_PLUGINS = Object.freeze([
  'meow-memory',
  '@a9i5k4/dsh-auto-memory',
  '@zilliz/memsearch-dsh',
  'billion-context',
])

export const BILLION_CONTEXT = 'billion-context'

export const UI_ATTR = Object.freeze({
  root: 'data-fishball-onboarding',
  step: 'data-onboarding-step',
  syncButton: 'data-onboarding-sync-button',
  modelChoice: 'data-onboarding-model-choice',
  modelSaved: 'data-onboarding-model-saved',
  next: 'data-onboarding-next',
  back: 'data-onboarding-back',
  skipAll: 'data-onboarding-skip-all',
  watchdogState: 'data-onboarding-watchdog-state',
  watchdogSelect: 'data-onboarding-watchdog-select',
  watchdogSaved: 'data-onboarding-watchdog-saved',
  memoryItem: 'data-onboarding-memory-item',
  memoryPkg: 'data-onboarding-memory-pkg',
  memoryInstall: 'data-onboarding-memory-install',
  welcome: 'data-onboarding-welcome',
  start: 'data-onboarding-start',
  testFrame: 'data-fbtest-onboarding-frame',
})

export const UI_STEP = Object.freeze({
  fishballModel: 'fishball-model',
  watchdog: 'watchdog',
  memory: 'memory',
  welcome: 'welcome',
})

export const WATCHDOG_STATE = Object.freeze({
  ready: 'ready',
  missing: 'missing',
  disabled: 'disabled',
  error: 'error',
  unsupported: 'unsupported',
})

export const TERMINAL_INSTANCE_STATES = Object.freeze(['failed', 'disabled', 'stopped'])

export const LANGS = Object.freeze(['en', 'zh'])

export const FIXTURE = Object.freeze({
  tempPrefix: 'fbtest-v3-onboarding-',
  shortTimeoutMs: 60,
  longTimeoutMs: 2000,
  waitMs: 3000,
  pollMs: 20,
  settleRounds: 40,
  pageBase: 'http://127.0.0.1:47011/',
  rowId: 'dsh-instance',
  entryFile: 'client.js',
  windowTitle: 'Fishball',
  modelA: Object.freeze({ provider: 'deepseek', model: 'deepseek-chat' }),
  modelB: Object.freeze({ provider: 'openai', model: 'gpt-5', reasoningEffort: 'high' }),
  catalog: Object.freeze({
    groups: Object.freeze([
      Object.freeze({
        id: 'deepseek',
        name: 'DeepSeek',
        models: Object.freeze([
          Object.freeze({ id: 'deepseek-chat', name: 'DeepSeek Chat' }),
          Object.freeze({
            id: 'deepseek-reasoner',
            name: 'DeepSeek Reasoner',
            reasoning: Object.freeze({
              efforts: Object.freeze([
                Object.freeze({ id: 'medium', name: 'Medium' }),
                Object.freeze({ id: 'high', name: 'High' }),
              ]),
            }),
          }),
        ]),
      }),
      Object.freeze({
        id: 'openai',
        name: 'OpenAI',
        models: Object.freeze([
          Object.freeze({
            id: 'gpt-5',
            name: 'GPT-5',
            reasoning: Object.freeze({
              efforts: Object.freeze([
                Object.freeze({ id: 'low', name: 'Low' }),
                Object.freeze({ id: 'high', name: 'High' }),
              ]),
            }),
          }),
        ]),
      }),
    ]),
  }),
  syncedCatalog: Object.freeze({
    groups: Object.freeze([
      Object.freeze({
        id: 'anthropic',
        name: 'Anthropic',
        models: Object.freeze([
          Object.freeze({ id: 'claude-sonnet-4', name: 'Claude Sonnet 4' }),
        ]),
      }),
    ]),
  }),
  missingProviders: Object.freeze([
    Object.freeze({ id: 'anthropic-main', name: 'Anthropic' }),
    Object.freeze({ id: 'openai-main', name: 'OpenAI' }),
  ]),
  checkId: 'fbtest-check-1',
})
