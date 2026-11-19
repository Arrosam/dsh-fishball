/**
 * Spike instance-ext only: a no-network model adapter loaded as an overlay row in a throwaway home.
 * Every request is recorded on globalThis.__spx (tool names, purpose, the serialized messages) and
 * answered from a per-session script queue; compaction and title requests get a short summary.
 * The adapter base class comes from the DSH version under test (SPX_NM).
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const FAKE = Object.freeze({ provider: 'spx-fake', model: 'spx-model', maxTokens: 1024 })
const { LlmAdapter } = await import(pathToFileURL(path.join(process.env.SPX_NM, '@deepseek-ai', 'dsh-llm', 'lib', 'index.js')).href)
const state = (globalThis.__spx ??= { requests: [], queues: new Map() })
const window = () => Number(process.env.SPX_WINDOW ?? 128000)
const info = () => ({ provider: FAKE.provider, id: FAKE.model, name: 'SPX model', inputModalities: ['text'], context: { contextWindow: window() }, defaultMaxTokens: FAKE.maxTokens })

function* text(value) {
  yield { type: 'block-start', index: 0, blockType: 'text' }
  yield { type: 'text-delta', index: 0, text: value }
  yield { type: 'block-end', index: 0, block: { type: 'text', text: value } }
}

class SpxAdapter extends LlmAdapter {
  providerInfo(provider) { return { id: provider, name: 'SPX provider' } }
  async listModels() { return [info()] }
  async resolveModel() { return info() }
  async *stream(options) {
    state.requests.push({ sessionId: options.sessionId, purpose: options.purpose ?? null, tools: (options.tools ?? []).map((t) => t.name), body: JSON.stringify(options.messages ?? []) + (options.system ?? '') })
    const step = options.purpose === undefined ? state.queues.get(options.sessionId)?.shift() : undefined
    if (step?.tool !== undefined) {
      const args = JSON.stringify(step.args ?? {})
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: step.id, name: step.tool, argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: step.id, name: step.tool, arguments: args } }
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    yield* text(options.purpose === undefined ? (step?.text ?? 'ok') : 'short summary')
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'spx-fake-llm'
export const inject = ['llm']
export function apply(ctx) {
  ctx.effect(() => ctx.llm.registerAdapter([FAKE.provider], new SpxAdapter()), 'spx fake adapter')
}
export { FAKE }
