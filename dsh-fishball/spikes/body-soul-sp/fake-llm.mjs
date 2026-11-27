/**
 * SP spike only: a no-network model adapter loaded inside the throwaway child DSH.
 * The model declares reasoning efforts so DSH's composer shows its effort pane, and every
 * request reports the effort it carried to the launcher over the IPC channel (never a file).
 * The adapter base class comes from the DSH version under test (SP_DSH_NODE_MODULES).
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const FAKE = Object.freeze({
  provider: 'sp-fake',
  model: 'sp-model',
  contextWindow: 128000,
  maxTokens: 4096,
  efforts: Object.freeze([{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }]),
  defaultEffort: 'high',
})
const { LlmAdapter } = await import(pathToFileURL(path.join(process.env.SP_DSH_NODE_MODULES, '@deepseek-ai', 'dsh-llm', 'lib', 'index.js')).href)

const info = () => ({
  provider: FAKE.provider, id: FAKE.model, name: 'SP model', inputModalities: ['text'],
  context: { contextWindow: FAKE.contextWindow }, defaultMaxTokens: FAKE.maxTokens,
  reasoning: { efforts: FAKE.efforts.map((effort) => ({ ...effort })), defaultEffort: FAKE.defaultEffort },
})

class SpAdapter extends LlmAdapter {
  providerInfo(provider) { return { id: provider, name: 'SP provider' } }
  async listModels() { return [info()] }
  async resolveModel() { return info() }
  async *stream(options) {
    const effort = options.reasoningEffort ?? null
    process.send?.({ type: 'llm', model: options.model, reasoningEffort: effort })
    const text = `SP reply (effort=${effort})`
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'sp-fake-llm'
export const inject = ['llm']
export function apply(ctx) {
  ctx.effect(() => ctx.llm.registerAdapter([FAKE.provider], new SpAdapter()), 'sp fake adapter')
}
export { FAKE }
