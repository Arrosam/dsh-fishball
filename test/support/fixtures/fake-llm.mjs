/**
 * Scripted fake model (no network). Conversation requests are recorded and
 * answered from per-session queues; an empty queue answers plain text.
 * Auxiliary calls (session titles, compaction) are answered without touching
 * the queues so they cannot steal a scripted answer.
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { FAKE, FAKE_MODELS, FAKE_WINDOW, RUNTIME } from '../constants.mjs'

const { LlmAdapter } = await import(pathToFileURL(path.join(RUNTIME, '@deepseek-ai/dsh-llm/lib/index.js')).href)

export const model = (globalThis.__fbtestModel ??= {
  requests: [],
  aux: [],
  queues: new Map(),
  queue(sessionId, ...responses) { const q = this.queues.get(sessionId) ?? []; q.push(...responses); this.queues.set(sessionId, q) },
  respond(options) { return this.queues.get(options.sessionId)?.shift() ?? this.byPlan(options) ?? this.byMarker(options) ?? [{ text: 'ok' }] },
  /**
   * P7: a permission request wakes Fishball before a test could queue an answer, so Fishball's model
   * answers from the request text: a plan {sessionId, needle, args, callId} answers the newest
   * '[permission request apr_…]' user message containing needle once, with answer_approval(args)
   * and request_id taken from that message.
   */
  plans: [],
  byPlan(options) {
    const users = (options.messages ?? []).filter((m) => m.role === 'user').map((m) => textOf(m.content))
    for (const plan of this.plans) {
      if (plan.used || plan.sessionId !== options.sessionId) continue
      const text = users.filter((t) => t.includes(plan.needle)).map((t) => /\[permission request (apr_[0-9a-f]+)\]/.exec(t)).filter(Boolean).at(-1)
      if (!text) continue
      plan.used = { requestId: text[1], at: Date.now() }
      return [{ tool: 'answer_approval', id: plan.callId ?? 'call_plan_' + Math.random().toString(36).slice(2, 8), args: { request_id: text[1], ...plan.args } }]
    }
    return undefined
  },
  /**
   * P5: answers for sessions whose id a test cannot know in advance (subagents, sessions Fishball
   * starts). A request of another session than `except` whose user messages contain a registered
   * marker takes that marker's next scripted answer. Context snapshots may follow the message, so
   * every user message is searched, not only the last one.
   */
  markers: new Map(),
  byMarker(options) {
    const users = (options.messages ?? []).filter((m) => m.role === 'user').map((m) => textOf(m.content)).join('\n')
    for (const [marker, entry] of this.markers) {
      if (entry.except === options.sessionId || entry.script.length === 0 || !users.includes(marker)) continue
      entry.sessions.add(options.sessionId)
      return entry.script.shift()
    }
    return undefined
  },
})

const textOf = (content) => (Array.isArray(content) ? content.map((b) => b?.text ?? '').join('') : String(content ?? ''))

/** A JSON-safe digest of one request. */
function digest(options) {
  const system = [options.system ?? '', ...(options.messages ?? []).filter((m) => m.role === 'system').map((m) => textOf(m.content))].join('\n')
  return {
    sessionId: options.sessionId ?? null,
    at: Date.now(),
    system,
    // description: lets a test check what the model is told about a tool (start_session mentions the title).
    tools: (options.tools ?? []).map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })),
    messageCount: (options.messages ?? []).length,
    // P4: the reply cap and route each request carried.
    model: options.model ?? null,
    maxTokens: options.maxTokens ?? null,
    chars: charsOf(options),
    // P5: the tail of every message's text, so a test can tell whether an input reached the model.
    texts: (options.messages ?? []).map((m) => textOf(m.content)).join('\n').slice(-TEXTS_TAIL),
  }
}

/** P5: characters of message text kept per request digest (bounded for the P4 load tests). */
const TEXTS_TAIL = 60000

/** P4: total text characters across a request's messages (does a long user message reach the model?). */
const charsOf = (options) => (options.messages ?? []).reduce((n, m) => n + textOf(m.content).length, 0)

/** P4: digest of an auxiliary call (compaction summary, title): purpose, cap and its final user message. */
function auxDigest(options) {
  const last = (options.messages ?? []).filter((m) => m.role === 'user').at(-1)
  return { sessionId: options.sessionId ?? null, purpose: options.purpose, at: Date.now(), model: options.model ?? null, maxTokens: options.maxTokens ?? null, messageCount: (options.messages ?? []).length, chars: charsOf(options), lastUserText: textOf(last?.content).slice(0, 20000) }
}

/**
 * Build stream chunks from a script: [{text}] or [{tool, args, id}].
 * P6: {fail: code} ends the response with an error finish (a code DSH's retry does not retry, so
 * the turn ends 'error'); {text, finish: 'max-tokens'} ends it at the output ceiling ('max-tokens').
 */
export function chunksFor(steps) {
  const out = []
  let index = 0
  let toolCalls = false
  let finish = null
  for (const step of steps) {
    if (step.fail !== undefined) { finish = { kind: 'error', failure: { message: 'fbtest model failure', code: step.fail } }; continue }
    if (step.finish === 'max-tokens') finish = { kind: 'max-tokens' }
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
  out.push({ type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }, { type: 'finish', reason: finish ?? { kind: toolCalls ? 'tool-calls' : 'stop' } })
  return out
}

export const name = 'fbtest-llm'
export const inject = ['llm']

/**
 * P4: model windows are mutable so a test can change them (llm/adapters-updated) or route
 * Fishball to another model. FBTEST_MODEL_WINDOW sets the default model's window
 * ('none' = the model reports no window). FAKE_MODELS.b has another window, .nowin none.
 */
const envWindow = process.env.FBTEST_MODEL_WINDOW
model.windows ??= {
  [FAKE.model]: envWindow === 'none' ? undefined : Number(envWindow ?? FAKE_WINDOW.default),
  [FAKE_MODELS.b]: FAKE_WINDOW.b,
  [FAKE_MODELS.nowin]: undefined,
}
const info = (id = FAKE.model) => ({
  provider: FAKE.provider, id, name: 'fbtest model ' + id, inputModalities: ['text'],
  ...(model.windows[id] === undefined ? {} : { context: { contextWindow: model.windows[id] } }),
  defaultMaxTokens: FAKE_WINDOW.defaultMaxTokens,
})

/**
 * P4 C10: a model lookup a test makes fail ('throw') or hang until cancelled or LOOKUP_HANG_MS
 * ('hang'). Only exact-model lookups (resolveModel) fail: conversation requests bind their model
 * in prepareCall, so a turn still reaches the model.
 */
model.lookupFailure ??= {}
model.lookups ??= 0
const LOOKUP_HANG_MS = 60000

/**
 * P4 C15: FBTEST_WINDOW_FLIP='{"window":W,"at":"apply"|"lookup"}' changes the default model's
 * window once during boot: on the tick after the adapter registers ('apply'), or right after
 * the first exact-model lookup has answered with the old window ('lookup'). The change is
 * announced with llm/adapters-updated.
 */
const flip = process.env.FBTEST_WINDOW_FLIP ? JSON.parse(process.env.FBTEST_WINDOW_FLIP) : null
function flipWindow() {
  if (!flip || model.flipped) return
  model.flipped = { at: Date.now(), lookupsBefore: model.lookups }
  model.windows[FAKE.model] = flip.window
  model.adapterHandle?.replace([FAKE.provider])
}

class FakeAdapter extends LlmAdapter {
  providerInfo(provider) { return { id: provider, name: 'fbtest provider' } }
  async listModels() { return Object.keys(model.windows).map((id) => info(id)) }
  async resolveModel(_provider, id, signal) {
    model.lookups++
    const failure = model.lookupFailure[id]
    if (failure === 'throw') throw new Error('fbtest lookup failure for ' + id)
    if (failure === 'hang') {
      await new Promise((resolve) => { const t = setTimeout(resolve, model.lookupHangMs ?? LOOKUP_HANG_MS); signal?.addEventListener('abort', () => { clearTimeout(t); resolve() }, { once: true }) })
      throw new Error('fbtest lookup hung for ' + id)
    }
    const answer = info(id)
    if (flip?.at === 'lookup' && id === FAKE.model) setImmediate(flipWindow)
    return answer
  }
  async prepareCall(_provider, id) {
    // P4 C7: FBTEST_FIRST_PREPARE_DELAY_MS holds the first conversation call before its request is
    // prepared and logged, so a test can save while no request has measured Fishball's prompt.
    const delayMs = Number(process.env.FBTEST_FIRST_PREPARE_DELAY_MS ?? 0)
    if (delayMs > 0 && !model.prepareDelayed) {
      model.prepareDelayed = { startedAt: Date.now() }
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      model.prepareDelayed.releasedAt = Date.now()
    }
    return { model: info(id), stream: (options) => this.stream(options) }
  }
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
      model.aux.push(auxDigest(options))
      // P4 C12: with compactionFails a summary call answers no text, which DSH's summarizer rejects.
      script = options.purpose === 'compaction' ? (model.compactionFails ? [] : [{ text: 'fbtest summary' }]) : [{ text: 'fbtest title' }]
    } else {
      // P4: a test can hold one conversation request open (a turn in progress) until it releases it.
      if (model.holds?.has(options.sessionId) && model.holds.get(options.sessionId) === null) {
        await new Promise((resolve) => model.holds.set(options.sessionId, resolve))
      }
      model.requests.push(digest(options))
      script = model.respond(options)
    }
    for (const chunk of chunksFor(script)) yield chunk
  }
}

export function apply(ctx) {
  ctx.effect(() => {
    const handle = ctx.llm.registerAdapter([FAKE.provider], new FakeAdapter())
    // P4: replace() re-commits the same routes, which publishes llm/adapters-updated.
    model.adapterHandle = handle
    if (flip?.at === 'apply') setImmediate(flipWindow)
    return handle
  }, 'fbtest adapter')
}
