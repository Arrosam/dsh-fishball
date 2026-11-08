/**
 * E1 re-test (P2) — choosing a model in Fishball's chat applies it to the live session.
 *
 * Requirement (the user's E1 report and its fix): on DSH 0.2.1-rc.5 the picker's POST answered
 * `chat-failed` because 0.2.1 has no `Agent.model`; the child must use 0.2.1's own selection seam
 * (`installModelSelection`) behind a capability-checked port, and keep an unexpected failure
 * diagnosable with a `detail` (underlying name, code, message). 0.2.2-rc.1 keeps its Agent model
 * port. The fix also declares `@deepseek-ai/dsh-agent` as a peer dependency, because it imports
 * the seam from the host.
 *
 * Observation point: the chat's own HTTP routes (`GET/POST /api/model`) and the session's model
 * port / scoped-context waterfall, which the test stands in for with the host API's real
 * signatures. The DSH version decides which port exists: the test drives the one the running
 * host offers, so the same cases run on both versions.
 *
 * Techniques: ST (choose → applied → current), DT (valid / unknown / unexpected failure),
 * EP (both host versions, both efforts), BVA (detail length boundary), P (peer declaration).
 *
 * | id | technique | expected |
 * |----|-----------|----------|
 * | P2-ST-01 | ST (choose → current) | POST returns the choice; GET and `currentModel()` report it |
 * | P2-DT-01 | DT (effort) | the effort travels with the choice and can be replaced |
 * | P2-EP-01 | EP (unknown pair) | a typed 400 `model-unavailable`, with no detail |
 * | P2-P-01 | P (unexpected failure) | 500 `chat-failed` + `detail` {name, code, message}, no config |
 * | P2-BVA-01 | BVA (detail length) | a long failure message is clamped, not echoed whole |
 * | P2-P-02 | P (peer dependency) | the package declares `@deepseek-ai/dsh-agent`, the host exports the seam |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { BODY_SOUL } from './support/body-soul-env.mjs'
import { loadInstance } from './support/body-soul-env.mjs'
import { chatHarness } from './support/body-soul-chat.mjs'

const { createChat, CHAT } = await loadInstance('src/slim/child/chat.js')
const hostApi = await import('@deepseek-ai/dsh-agent')
/** 0.2.1 has no AgentModel export; its Agent selects through the scoped-context seam instead. */
const LEGACY = !('AgentModel' in hostApi)
const loadChat = async () => ({ createChat, CHAT })

const PROVIDER = Object.freeze({ id: 'mock', name: 'Mock provider' })
const MODELS = Object.freeze([{ id: 'm1', name: 'Model One' }, { id: 'm2', name: 'Model Two' }])
const EFFORTS = Object.freeze([{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }])
const CHOICE = Object.freeze({ provider: PROVIDER.id, model: 'm2', reasoningEffort: 'high' })

/** The child's model catalog, as DSH's own llm service presents it to the picker. */
const llm = Object.freeze({
  listProviders: () => [PROVIDER],
  listModels: (provider) => (provider === PROVIDER.id ? MODELS : []),
  resolveModelInfo: () => ({ reasoning: { efforts: EFFORTS } }),
  resolveCallConfig: (value) => ({
    provider: value.provider,
    model: value.model,
    ...(value.reasoningEffort === undefined ? {} : { reasoningEffort: value.reasoningEffort }),
  }),
})

/** The Agent's scoped context for 0.2.1: `on(event, fn)` and a waterfall that calls `next`. */
function eventBus() {
  const handlers = new Map()
  return {
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, [])
      handlers.get(event).push(fn)
      return () => {
        const list = handlers.get(event) ?? []
        const index = list.indexOf(fn)
        if (index >= 0) list.splice(index, 1)
      }
    },
    async run(event, args, next) {
      let chain = next
      for (const fn of [...(handlers.get(event) ?? [])].reverse()) {
        const inner = chain
        chain = () => fn(...args, inner)
      }
      return chain()
    },
  }
}

/** A live model port in 0.2.2's Agent.model shape (`current` + `select`). */
function modelPort() {
  let value
  return { current: () => value, select(selection) { value = selection } }
}

/**
 * Run one case on the host's own model path: 0.2.1's scoped-context seam, or 0.2.2's Agent model.
 * `failure` makes the selection write throw, to exercise the unexpected-failure answer.
 */
async function harness(t, { failure, modelMessage } = {}) {
  if (LEGACY) {
    const bus = eventBus()
    const writeFailure = failure === undefined
      ? () => {}
      : () => { throw Object.assign(new Error(modelMessage ?? failure.message), { code: failure.code }) }
    const h = await chatHarness(t, { loadChat, model: null, agentContext: bus, llm, append: writeFailure })
    /** Drive one request through the two waterfalls installModelSelection registered. */
    h.request = async () => {
      const assembled = await bus.run('system-prompt/assemble', [{}, {}], async () => ({ variables: { base: 'x' } }))
      return bus.run('agent/request', [{}], async () => ({ provider: 'inherited', model: 'inherited', temperature: 0.2 }))
    }
    return h
  }
  const port = modelPort()
  const h = await chatHarness(t, { loadChat, model: port, llm })
  if (failure !== undefined) port.select = () => { throw Object.assign(new Error(modelMessage ?? failure.message), { code: failure.code }) }
  h.port = port
  h.request = async () => port.current()
  return h
}

/**
 * The chosen provider/model/effort reached the request; the rest of the resolved config (the
 * stand-in's `temperature`) is preserved, as DSH's own waterfall does.
 */
function assertApplied(request, choice) {
  assert.equal(request.provider, choice.provider)
  assert.equal(request.model, choice.model)
  assert.equal(request.reasoningEffort, choice.reasoningEffort)
}

const post = (h, body) => h.chat.handle(CHAT.modelPath, { method: 'POST', body })
const get = (h) => h.chat.handle(CHAT.modelPath, { method: 'GET' })

describe('P2 the chat applies a model choice on the running DSH host', () => {
  it('P2-ST-01 choosing a model returns it, and the page and request see it', async (t) => {
    const h = await harness(t)
    const answer = await post(h, { ...CHOICE })
    assert.equal(answer.status, 200)
    assert.deepEqual(answer.body.selection, CHOICE)
    assert.deepEqual(h.chat.service.currentModel(), CHOICE)

    const page = await get(h)
    assert.equal(page.status, 200)
    assert.deepEqual(page.body.selection, CHOICE)
    assert.deepEqual(page.body.providers, [PROVIDER])
    assert.deepEqual(page.body.models.map((model) => model.id), ['m1', 'm2'])
    assert.deepEqual(page.body.models[1].efforts, EFFORTS)

    assertApplied(await h.request(), CHOICE)
  })

  it('P2-DT-01 the effort travels with the choice and a lower effort replaces it', async (t) => {
    const h = await harness(t)
    assert.equal((await post(h, { ...CHOICE })).status, 200)
    assertApplied(await h.request(), CHOICE)

    const lower = { provider: PROVIDER.id, model: 'm1', reasoningEffort: 'low' }
    assert.equal((await post(h, lower)).status, 200)
    assert.deepEqual(h.chat.service.currentModel(), lower)
    assertApplied(await h.request(), lower)
  })

  it('P2-EP-01 an unknown model is a typed 400 model-unavailable, without a detail', async (t) => {
    const h = await harness(t)
    const answer = await post(h, { provider: PROVIDER.id, model: 'absent' })
    assert.equal(answer.status, 400)
    assert.equal(answer.body.code, 'model-unavailable')
    assert.equal(Object.hasOwn(answer.body, 'detail'), false)
    assert.equal(h.chat.service.currentModel(), null)
  })

  it('P2-P-01 an unexpected failure keeps the underlying name, code and message in a detail', async (t) => {
    const h = await harness(t, { failure: { code: 'E_FBTEST', message: 'the session log refused the write' } })
    const answer = await post(h, { ...CHOICE })
    assert.equal(answer.status, 500)
    assert.equal(answer.body.code, 'chat-failed')
    assert.equal(answer.body.message, 'The chat operation failed.')
    assert.deepEqual(answer.body.detail, { name: 'Error', code: 'E_FBTEST', message: 'the session log refused the write' })
    // The detail carries no request data or configuration.
    const detail = JSON.stringify(answer.body.detail)
    assert.equal(detail.includes(PROVIDER.id), false)
    assert.equal(detail.includes(CHOICE.model), false)
  })

  it('P2-BVA-01 a very long failure message is clamped in the detail', async (t) => {
    const h = await harness(t, { failure: { code: 'E_LONG', message: 'x'.repeat(1000) } })
    const answer = await post(h, { ...CHOICE })
    assert.equal(answer.status, 500)
    assert.equal(answer.body.detail.code, 'E_LONG')
    assert.ok(answer.body.detail.message.length < 1000, 'the message is clamped')
    assert.ok(answer.body.detail.message.endsWith('…'))
  })

  it('P2-P-02 the instance declares the host agent package it imports', async () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(BODY_SOUL.instance, 'package.json'), 'utf8'))
    assert.equal(manifest.peerDependencies?.['@deepseek-ai/dsh-agent'], '*')
    assert.equal(Object.hasOwn(manifest.dependencies ?? {}, '@deepseek-ai/dsh-agent'), false, 'a peer, not a bundled dependency')
    assert.equal(typeof hostApi.installModelSelection, 'function')
  })
})
