/** Standalone host-boundary probe: never replaces Fishball policy or edits session JSONL. */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { RUNTIME } from '../../support/constants.mjs'
import { model as scripted, chunksFor } from '../../support/fixtures/fake-llm.mjs'
import { START_MODEL as C } from '../../support/start-session-model-data.mjs'

const host = (name, file = 'index.js') => import(pathToFileURL(path.join(RUNTIME, '@deepseek-ai', name, 'lib', file)).href)
const { LlmAdapter, LlmError, createUserMessage } = await host('dsh-llm')
const { Session } = await host('dsh-session')
const clone = value => JSON.parse(JSON.stringify(value))
export const inject = ['llm', 'sessionController', 'sessions', 'agentDefaultModel']
export const name = 'fbtest-start-session-model'

export function apply(ctx) {
  let armed = null
  let dynamic = false
  let events = []
  const targets = new Set()
  const selected = new Set()
  let flushFailed = false
  let heldAssembly = null
  let assemblyRelease = null
  const append = (type, value = {}) => { if (armed) events.push({ type, ...clone(value) }) }
  const info = id => ({ provider: C.provider, id, name: id, inputModalities: ['text'],
    context: { contextWindow: C.contextWindow }, defaultMaxTokens: C.maxTokens,
    ...(id === C.models.plain ? {} : { reasoning: { efforts: (id === C.models.fast ? C.efforts.fast : dynamic ? C.efforts.dynamic : C.efforts.analysis).map(id => ({ id, name: id })), ...(id === C.models.fast ? {} : { defaultEffort: C.effort.default }) } }),
  })
  class SelectionAdapter extends LlmAdapter {
    providerInfo(id) { return { id, name: C.provider } }
    async listModels() { return Object.values(C.models).map(info) }
    async resolveModel(_provider, id) { return info(id) }
    async prepareCall(_provider, id) { return { model: info(id), stream: options => this.stream(options) } }
    async *stream(options) {
      const script = options.purpose ? [{ text: C.text.reply }] : scripted.respond(options)
      yield* chunksFor(script)
    }
  }
  ctx.effect(() => ctx.llm.registerAdapter([C.provider], new SelectionAdapter()))

  // Wrap only official host API boundaries. The public Session prototype also
  // reaches plugin-owned session selection without coupling to Fishball internals.
  function wrap(object, key, factory) {
    const own = Object.getOwnPropertyDescriptor(object, key)
    const original = object[key]
    object[key] = factory(original)
    ctx.effect(() => () => { if (own) Object.defineProperty(object, key, own); else delete object[key] })
  }
  wrap(ctx.sessionController, 'create', original => async function (...args) {
    const result = await original.apply(this, args)
    if (armed) {
      targets.add(result.sessionId); append('created', result)
      if (armed.externalSelection) {
        append('external-selection-start', { sessionId: result.sessionId })
        await ctx.sessionController.selectModel({ sessionId: result.sessionId, ...armed.externalSelection })
        append('external-selection-end', { sessionId: result.sessionId })
      }
    }
    return result
  })
  wrap(ctx.sessionController, 'modelCatalog', original => async function (...args) {
    append('catalog')
    if (armed?.catalog) throw new Error(C.failure.catalog)
    return original.apply(this, args)
  })
  wrap(ctx.llm, 'resolveCallConfig', original => async function (config, ...rest) {
    append('resolve', { config })
    if (armed?.resolve && config.provider === C.provider) throw new LlmError(C.failure.resolve, C.failure.code)
    const resolved = await original.call(this, config, ...rest)
    if (armed?.substitute && config.provider === C.provider) return { ...resolved, ...armed.substitute }
    return resolved
  })
  wrap(Session.prototype, 'append', original => function (type, value, ...rest) {
    if (armed && type === C.event.selection) {
      append('select', { sessionId: this.id, selection: value })
      if (armed.selection && targets.has(this.id)) throw new Error(C.failure.selection)
    }
    const result = original.call(this, type, value, ...rest)
    if (armed && type === C.event.selection && targets.has(this.id)) selected.add(this.id)
    return result
  })
  wrap(ctx.sessions, 'flush', original => async function (session, ...rest) {
    if (targets.has(session.id)) {
      append('flush', { sessionId: session.id, selected: selected.has(session.id) })
      if (armed?.flush && selected.has(session.id) && !flushFailed) {
        flushFailed = true
        if (armed.flush === C.failure.false) return false
        throw new Error(C.failure.flush)
      }
    }
    const result = await original.call(this, session, ...rest)
    if (targets.has(session.id)) append('flushed', { sessionId: session.id, result })
    return result
  })
  wrap(ctx.agentDefaultModel, 'saveSelection', original => async function (selection) {
    append('default-save', { selection })
    return original.call(this, selection)
  })
  ctx.on('agent/created', ({ agent }) => {
    // Registered before target selectors: a one-shot downstream await exposes
    // switches after first-assembly snapshot but before its request is admitted.
    let assemblyHeld = false
    agent.ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
      if (armed?.holdAssembly && targets.has(agent.id) && !assemblyHeld) {
        assemblyHeld = true; heldAssembly = agent.id
        append('assembly-held', { sessionId: agent.id })
        await new Promise(resolve => { assemblyRelease = resolve })
        heldAssembly = null; assemblyRelease = null
      }
      return next()
    })
    if (armed?.externalWake) {
      agent.steer(createUserMessage({ content: [{ type: 'text', text: C.text.external }], source: { kind: 'user' } }))
    }
    const original = agent.steer
    agent.steer = function (message, ...rest) {
      if (targets.has(agent.id)) append('steer', { sessionId: agent.id, source: message.source })
      return original.call(this, message, ...rest)
    }
  })
  ctx.on('llm/stream', async function* (options, next) {
    append('request', { sessionId: options.sessionId ?? null, provider: options.provider, model: options.model, reasoningEffort: options.reasoningEffort ?? null, purpose: options.purpose ?? null })
    yield* next()
  })
  const operations = {
    arm(options) { armed = options; events = []; targets.clear(); selected.clear(); flushFailed = false; return true },
    read() { return events },
    disarm() { armed = null; assemblyRelease?.(); heldAssembly = null; return true },
    heldAssembly() { return heldAssembly },
    releaseAssembly() { const release = assemblyRelease; release?.(); return Boolean(release) },
    dynamic({ on }) { dynamic = on; ctx.emit('llm/adapters-updated'); return true },
    defaults() { return ctx.agentDefaultModel.currentSelection() },
    guiSelection(request) { return ctx.sessionController.selectModel(request) },
    catalog() { return ctx.sessionController.modelCatalog() },
  }
  const listener = async message => {
    if (message?.type !== C.ipc.request) return
    try {
      const result = await operations[message.op](message.args ?? {})
      process.send({ type: C.ipc.response, id: message.id, ok: true, value: clone(result) })
    } catch (error) { process.send({ type: C.ipc.response, id: message.id, ok: false, error: String(error) }) }
  }
  process.on('message', listener)
  ctx.effect(() => () => process.off('message', listener))
}
