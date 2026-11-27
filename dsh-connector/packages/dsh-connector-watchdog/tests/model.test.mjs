/**
 * Unit cases for Watchdog's dedicated model selection (src/model.js): parsing, routability checks
 * (never silently falling back to DSH's default model), and applying a model to both DSH 0.2.2+
 * (`agent.model.select`) and DSH 0.2.1 (`installModelSelection` with `prepend: true`).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { JUDGE_FAILURE, SIDE } from '../src/constants.js'
import { applyAgentModel, readModelSelection, sameModelSelection, validateModelSelection } from '../src/model.js'

function fakeLogger() {
  const warnings = []
  return { warnings, warn: (...args) => warnings.push(args) }
}

function fakeCtx(llm) {
  return { get: (name) => (name === 'llm' ? llm : undefined) }
}

function fakeLlm({
  providers = [{ id: 'cheap' }],
  models = { cheap: [{ id: 'mini' }, { id: 'mini-reason' }] },
  infos = { 'cheap/mini-reason': { reasoning: { efforts: [{ id: 'low' }, { id: 'high' }] } } },
  resolve = async (req) => ({ ...req }),
} = {}) {
  return {
    listProviders: () => providers,
    listModels: async (provider) => models[provider] ?? [],
    resolveModelInfo: async (provider, model) => infos[`${provider}/${model}`],
    resolveCallConfig: resolve,
  }
}

test('EP: readModelSelection normalizes complete choices and treats unset/incomplete/whitespace as undefined', () => {
  assert.equal(readModelSelection(undefined), undefined)
  assert.equal(readModelSelection(null), undefined)
  assert.equal(readModelSelection({}), undefined)
  assert.equal(readModelSelection({ provider: 'cheap' }), undefined)
  assert.equal(readModelSelection({ model: 'mini' }), undefined)
  assert.equal(readModelSelection({ provider: '  ', model: 'mini' }), undefined)
  assert.equal(readModelSelection({ provider: 'cheap', model: '  ' }), undefined)
  assert.deepEqual(readModelSelection({ provider: ' cheap ', model: ' mini ' }), { provider: 'cheap', model: 'mini' })
  assert.deepEqual(readModelSelection({ provider: 'cheap', model: 'mini', reasoningEffort: '   ' }), { provider: 'cheap', model: 'mini' })
  assert.deepEqual(readModelSelection({ provider: 'cheap', model: 'mini-reason', reasoningEffort: ' low ' }), {
    provider: 'cheap', model: 'mini-reason', reasoningEffort: 'low',
  })
})

test('EP: sameModelSelection compares provider, model and optional reasoningEffort', () => {
  assert.equal(sameModelSelection({ provider: 'a', model: 'm' }, { provider: 'a', model: 'm' }), true)
  assert.equal(sameModelSelection({ provider: 'a', model: 'm', reasoningEffort: 'low' }, { provider: 'a', model: 'm', reasoningEffort: 'low' }), true)
  assert.equal(sameModelSelection({ provider: 'a', model: 'm', reasoningEffort: 'low' }, { provider: 'a', model: 'm' }), false)
  assert.equal(sameModelSelection({ provider: 'a', model: 'm' }, { provider: 'a', model: 'm2' }), false)
  assert.equal(sameModelSelection(undefined, { provider: 'a', model: 'm' }), false)
})

test('DT: validateModelSelection accepts routable models and rejects any unroutable or silently-substituted model with JUDGE_FAILURE.failed', async () => {
  const logger = fakeLogger()
  await validateModelSelection(fakeCtx(fakeLlm()), { provider: 'cheap', model: 'mini' }, logger)
  await validateModelSelection(fakeCtx(fakeLlm()), { provider: 'cheap', model: 'mini-reason', reasoningEffort: 'low' }, logger)
  assert.equal(logger.warnings.length, 0)

  const failing = [
    ['unset model', fakeCtx(fakeLlm()), undefined],
    ['missing llm service', fakeCtx(undefined), { provider: 'cheap', model: 'mini' }],
    ['removed provider', fakeCtx(fakeLlm({ providers: [] })), { provider: 'cheap', model: 'mini' }],
    ['removed model', fakeCtx(fakeLlm({ models: { cheap: [] } })), { provider: 'cheap', model: 'mini' }],
    ['unsupported reasoning effort', fakeCtx(fakeLlm()), { provider: 'cheap', model: 'mini-reason', reasoningEffort: 'max' }],
    ['effort on non-reasoning model', fakeCtx(fakeLlm()), { provider: 'cheap', model: 'mini', reasoningEffort: 'low' }],
    ['silent provider substitution', fakeCtx(fakeLlm({ resolve: async () => ({ provider: 'expensive', model: 'mini' }) })), { provider: 'cheap', model: 'mini' }],
    ['silent model substitution', fakeCtx(fakeLlm({ resolve: async () => ({ provider: 'cheap', model: 'frontier' }) })), { provider: 'cheap', model: 'mini' }],
    ['silent effort substitution', fakeCtx(fakeLlm({ resolve: async () => ({ provider: 'cheap', model: 'mini-reason', reasoningEffort: 'high' }) })), { provider: 'cheap', model: 'mini-reason', reasoningEffort: 'low' }],
    ['resolveCallConfig throws', fakeCtx(fakeLlm({ resolve: async () => { throw new Error('missing key') } })), { provider: 'cheap', model: 'mini' }],
  ]
  for (const [label, ctx, selection] of failing) {
    const log = fakeLogger()
    await assert.rejects(() => validateModelSelection(ctx, selection, log), (err) => err?.code === JUDGE_FAILURE.failed, label)
    assert.equal(log.warnings.length, 1, label + ': logged warning')
  }
})

test('EP: applyAgentModel uses agent.model.select directly on DSH 0.2.2+', async () => {
  const selected = []
  const agent = { model: { select: (s) => selected.push(s) } }
  const target = { provider: 'cheap', model: 'mini', reasoningEffort: 'low' }
  await applyAgentModel(agent, target)
  assert.deepEqual(selected, [target])
})

test('ST: applyAgentModel on DSH 0.2.1 installs prepended hook once, avoids duplicate events on resume, and switches on live model changes', async () => {
  const events = []
  const hooks = []
  let installedRef
  const agent = {
    ctx: { on: (name, listener, options) => { hooks.push({ name, options }); return () => {} } },
    session: {
      snapshotEvents: () => [...events],
      append: (type, data) => events.push({ type, data }),
    },
  }
  const install = async (ctxLike, ref) => {
    installedRef = ref
    ctxLike.on('agent/request', () => {}, {})
  }

  // Brand-new side session: appends model/selection and installs prepended hook once.
  const first = { provider: 'cheap', model: 'mini' }
  await applyAgentModel(agent, first, { install })
  assert.equal(hooks.length, 1)
  assert.equal(hooks[0].options.prepend, true)
  assert.deepEqual(installedRef.current, first)
  assert.deepEqual(events, [{ type: SIDE.modelSelectionEvent, data: first }])

  // Same selection again on live agent: no duplicate event or second hook.
  await applyAgentModel(agent, first, { install })
  assert.equal(hooks.length, 1)
  assert.equal(events.length, 1)

  // Live switch to another model (with reasoningEffort): appends once and updates ref.
  const second = { provider: 'cheap', model: 'mini-reason', reasoningEffort: 'low' }
  await applyAgentModel(agent, second, { install })
  assert.equal(hooks.length, 1)
  assert.deepEqual(installedRef.current, second)
  assert.deepEqual(events.at(-1), { type: SIDE.modelSelectionEvent, data: second })

  // Switch back to omitting reasoningEffort: appends and clears effort.
  await applyAgentModel(agent, first, { install })
  assert.deepEqual(installedRef.current, first)
  assert.deepEqual(events.at(-1), { type: SIDE.modelSelectionEvent, data: first })

  // Resumed agent (new instance) whose log already ends on `first`: no extra event appended, ref seeded.
  let resumedRef
  const resumedAgent = {
    ctx: { on: () => () => {} },
    session: {
      snapshotEvents: () => [{ type: SIDE.requestHeaderEvent, data: { header: { config: first } } }],
      append: () => { throw new Error('must not append unchanged selection') },
    },
  }
  await applyAgentModel(resumedAgent, first, { install: async (_ctx, ref) => { resumedRef = ref } })
  assert.deepEqual(resumedRef.current, first)
})
