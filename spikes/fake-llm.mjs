/**
 * Fake model adapter for the spikes: answers from the scripted model in
 * globalThis.__fishballSpikeModel and records every request. No network.
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const RUNTIME = process.env.DSH_RUNTIME_ROOT ?? '/Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.2/node_modules'
const { LlmAdapter } = await import(pathToFileURL(path.join(RUNTIME, '@deepseek-ai/dsh-llm/lib/index.js')).href)
const { chunksFor, model, FAKE_PROVIDER, FAKE_MODEL } = await import('./harness.mjs')

export const name = 'fishball-spike-llm'
export const inject = ['llm']
const WINDOW = Number(process.env.SPIKE_CONTEXT_WINDOW ?? 128000)
const info = () => ({ provider: FAKE_PROVIDER, id: FAKE_MODEL, name: 'Spike model', inputModalities: ['text'], context: { contextWindow: WINDOW }, defaultMaxTokens: 4096 })

class SpikeAdapter extends LlmAdapter {
  providerInfo(provider) { return { id: provider, name: 'Spike provider' } }
  async listModels() { return [info()] }
  async resolveModel() { return info() }
  async *stream(options) {
    model.requests.push(options)
    const script = await model.respond(options)
    for (const chunk of Array.isArray(script) && script[0]?.type ? script : chunksFor(script)) yield chunk
  }
}

export function apply(ctx) {
  ctx.effect(() => ctx.llm.registerAdapter([FAKE_PROVIDER], new SpikeAdapter()), 'spike adapter')
}
