/**
 * Scripted fake model (no network). Conversation requests are recorded and
 * answered from per-session queues; an empty queue answers plain text.
 * Auxiliary calls (session titles, compaction) are answered without touching
 * the queues so they cannot steal a scripted answer.
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { FAKE, RUNTIME } from '../constants.mjs'

const { LlmAdapter } = await import(pathToFileURL(path.join(RUNTIME, '@deepseek-ai/dsh-llm/lib/index.js')).href)

export const model = (globalThis.__fbtestModel ??= {
  requests: [],
  aux: [],
  queues: new Map(),
  queue(sessionId, ...responses) { const q = this.queues.get(sessionId) ?? []; q.push(...responses); this.queues.set(sessionId, q) },
  respond(options) { return this.queues.get(options.sessionId)?.shift() ?? [{ text: 'ok' }] },
})

const textOf = (content) => (Array.isArray(content) ? content.map((b) => b?.text ?? '').join('') : String(content ?? ''))

/** A JSON-safe digest of one request. */
function digest(options) {
  const system = [options.system ?? '', ...(options.messages ?? []).filter((m) => m.role === 'system').map((m) => textOf(m.content))].join('\n')
  return {
    sessionId: options.sessionId ?? null,
    at: Date.now(),
    system,
    tools: (options.tools ?? []).map((t) => ({ name: t.name, parameters: t.parameters })),
    messageCount: (options.messages ?? []).length,
  }
}

/** Build stream chunks from a script: [{text}] or [{tool, args, id}]. */
export function chunksFor(steps) {
  const out = []
  let index = 0
  let toolCalls = false
  for (const step of steps) {
    if (step.text !== undefined) {
      out.push({ type: 'block-start', index, blockType: 'text' }, { type: 'text-delta', index, text: step.text }, { type: 'block-end', index, block: { type: 'text', text: step.text } })
    } else {
      toolCalls = true
      const id = step.id ?? 'call_' + Math.random().toString(36).slice(2, 10)
      const args = JSON.stringify(step.args ?? {})
      out.push({ type: 'block-start', index, blockType: 'tool-call' }, { type: 'tool-call-delta', index, id, name: step.tool, argumentsDelta: args }, { type: 'block-end', index, block: { type: 'tool-call', id, name: step.tool, arguments: args } })
    }
    index++
  }
  out.push({ type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }, { type: 'finish', reason: { kind: toolCalls ? 'tool-calls' : 'stop' } })
  return out
}

export const name = 'fbtest-llm'
export const inject = ['llm']
const info = () => ({ provider: FAKE.provider, id: FAKE.model, name: 'fbtest model', inputModalities: ['text'], context: { contextWindow: 128000 }, defaultMaxTokens: 4096 })

class FakeAdapter extends LlmAdapter {
  providerInfo(provider) { return { id: provider, name: 'fbtest provider' } }
  async listModels() { return [info()] }
  async resolveModel() { return info() }
  async *stream(options) {
    let script
    // FBTEST_FIRST_REQUEST_DELAY_MS holds the first conversation request open, so a test can
    // observe the plugin while Fishball's first-creation setup turn is still running.
    const delayMs = Number(process.env.FBTEST_FIRST_REQUEST_DELAY_MS ?? 0)
    if (!options.purpose && delayMs > 0 && !model.delayedOnce) {
      model.delayedOnce = true
      model.delayStartedAt = Date.now()
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      model.delayReleasedAt = Date.now()
    }
    if (options.purpose) {
      model.aux.push({ sessionId: options.sessionId ?? null, purpose: options.purpose, at: Date.now() })
      script = [{ text: 'fbtest title' }]
    } else {
      model.requests.push(digest(options))
      script = model.respond(options)
    }
    for (const chunk of chunksFor(script)) yield chunk
  }
}

export function apply(ctx) {
  ctx.effect(() => ctx.llm.registerAdapter([FAKE.provider], new FakeAdapter()), 'fbtest adapter')
}
