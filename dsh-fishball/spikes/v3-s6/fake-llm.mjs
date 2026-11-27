/** V3-S6 fake model: answers 'done' to every request and records it. No network. */
import { FAKE, sdkPkg } from './harness.mjs'

const { LlmAdapter } = await sdkPkg('dsh-llm')
export const name = 'fishball-s6-llm'
export const inject = ['llm']
const info = () => ({ provider: FAKE.provider, id: FAKE.model, name: 'Spike model', inputModalities: ['text'], context: { contextWindow: 128000 }, defaultMaxTokens: 4096 })
const TEXT = 'done'

class SpikeAdapter extends LlmAdapter {
  providerInfo(provider) { return { id: provider, name: 'Spike provider' } }
  async listModels() { return [info()] }
  async resolveModel() { return info() }
  async *stream(options) {
    // Declared tools arrive in `tools` (and, folded, in `toolHistory.tools`); both are recorded.
    const names = new Set([...(options.toolHistory?.tools ?? []), ...(options.tools ?? [])].map((tool) => tool.name))
    ;(globalThis.__s6Requests ??= []).push({ sessionId: options.sessionId, tools: [...names] })
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: TEXT }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: TEXT } }
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export function apply(ctx) {
  ctx.effect(() => ctx.llm.registerAdapter([FAKE.provider], new SpikeAdapter()), 'spike adapter')
}
