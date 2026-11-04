/** Isolated fake adapter only: all catalog aggregation/error behavior belongs to DSH. */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { RUNTIME } from '../../support/constants.mjs'
import { HOST_REFRESH as C } from '../../support/model-list-refresh-host-data.mjs'
const { LlmAdapter } = await import(pathToFileURL(path.join(RUNTIME, '@deepseek-ai/dsh-llm/lib/index.js')).href)
const clone = value => JSON.parse(JSON.stringify(value))
export const inject = ['llm', 'sessionController', 'agentDefaultModel']
export const name = C.fixture
export function apply(ctx) {
  let models = [C.models.first]
  let broken = false
  const info = (provider, id) => ({ provider, id, name: id, inputModalities: [C.text], context: { contextWindow: C.contextWindow }, defaultMaxTokens: C.defaultMaxTokens, reasoning: { efforts: [{ id: C.effort, name: C.effort }] } })
  class DynamicAdapter extends LlmAdapter {
    providerInfo(id) { return { id, name: id === C.providers.good ? C.names.good : C.names.broken } }
    async listModels(provider) {
      if (broken && provider === C.providers.broken) throw new Error(C.failure)
      return provider === C.providers.good ? models.map(id => info(provider, id)) : []
    }
    async resolveModel(provider, id) { return info(provider, id) }
  }
  ctx.effect(() => ctx.llm.registerAdapter(Object.values(C.providers), new DynamicAdapter()))
  const operations = {
    [C.operations.catalog]() { return ctx.sessionController.modelCatalog() },
    [C.operations.defaults]() { return ctx.agentDefaultModel.currentSelection() },
    [C.operations.configure](next) { models = next.models; broken = next.broken; ctx.emit(C.event); return true },
  }
  const listener = async message => {
    if (message?.type !== C.request) return
    try { process.send({ type: C.response, id: message.id, ok: true, value: clone(await operations[message.op](message.args ?? {})) }) }
    catch (error) { process.send({ type: C.response, id: message.id, ok: false, error: String(error) }) }
  }
  process.on('message', listener)
  ctx.effect(() => () => process.off('message', listener))
}
