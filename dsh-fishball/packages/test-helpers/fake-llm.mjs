/**
 * The scripted model (no network): a DSH plugin row that registers an LLM adapter for the provider
 * FAKE.provider. Load it as a row (`{id: FAKE_LLM.row, name: FAKE_LLM_MODULE}`, ./dsh-world does) and
 * drive it through `model`, the one state object of the process (kept on globalThis, so the row DSH
 * loads and a world's own import share it whatever URL each used).
 *
 * Conversation requests are recorded (`model.requests`, a JSON-safe digest each) and answered, in this
 * order, from: the session's queue (`model.queue(sessionId, ...scripts)`), an approval plan, a question
 * plan, a marker script, else FAKE_LLM.plainText ('ok'). Auxiliary calls (titles, compaction; DSH sets
 * `purpose`) are recorded in `model.aux` and answered without touching the queues, so they cannot steal
 * a scripted answer.
 *
 * A script is one response: an array of steps `{text}`, `{tool, args, id?}`, `{tool, rawArgs}` (an
 * unparsable call), `{fail: code}` (an error finish), `{text, finish: 'max-tokens'}`, and `{text,
 * deltas: n, delayMs}` (streamed as n pieces). An argument whose value is exactly REQUEST_PLACEHOLDER
 * becomes the newest permission request id (`apr_<hex>`) of the conversation.
 *
 * The DSH runtime is the one ./runtime names (FBTEST_DSH_RUNTIME, else the current DSH).
 */
import { importRuntime } from './runtime.mjs'

const { LlmAdapter } = await importRuntime('dsh-llm')

/** The scripted provider and its models (test data). */
export const FAKE = Object.freeze({ provider: 'fishball-test', model: 'test-model' })
/** Two more models: `b` with another window, `nowin` reporting none. */
export const FAKE_MODELS = Object.freeze({ b: 'test-model-b', nowin: 'test-model-nowin' })
export const FAKE_WINDOW = Object.freeze({ default: 128000, b: 300000, defaultMaxTokens: 4096 })
/** A scripted argument value replaced with the newest permission request id. */
export const REQUEST_PLACEHOLDER = '$fbtest:last-request-id'
/** This module's file: the row `name` that makes DSH load it. */
export const FAKE_LLM_MODULE = import.meta.filename

/** Environment switches read once at load (a world passes them to its DSH child). */
export const FAKE_LLM_ENV = Object.freeze({
  /** The default model's window; 'none' makes it report none. */
  window: 'FBTEST_MODEL_WINDOW', noWindow: 'none',
  /** JSON `{window, at: 'apply' | 'lookup'}`: the default model's window changes once during boot. */
  windowFlip: 'FBTEST_WINDOW_FLIP',
  /** Milliseconds the first conversation call waits before it is prepared. */
  firstPrepareDelayMs: 'FBTEST_FIRST_PREPARE_DELAY_MS',
  /** Milliseconds the first conversation request is held open. */
  firstRequestDelayMs: 'FBTEST_FIRST_REQUEST_DELAY_MS',
})

export const FAKE_LLM = Object.freeze({
  row: 'fbtest-llm', name: 'fbtest-llm', inject: Object.freeze(['llm']), effectLabel: 'fbtest adapter',
  plainText: 'ok', summaryText: 'fbtest summary', titleText: 'fbtest title', compaction: 'compaction',
  providerName: 'fbtest provider', modelNamePrefix: 'fbtest model ', textModalities: Object.freeze(['text']),
  failureMessage: 'fbtest model failure', lookupFailure: 'fbtest lookup failure for ', lookupHung: 'fbtest lookup hung for ',
  lookupThrow: 'throw', lookupHang: 'hang', lookupHangMs: 60000, maxTokensFinish: 'max-tokens',
  usage: Object.freeze({ inputTokens: 10, outputTokens: 5 }),
  callPrefix: 'call_', approvalPlanPrefix: 'call_plan_', questionPlanPrefix: 'call_qplan_', randomRadix: 36, randomCallChars: 8, randomPlanChars: 6,
  approvalTool: 'answer_approval', questionTool: 'answer_question',
  permissionRequest: /\[permission request (apr_[0-9a-f]+)\]/, questionId: /qst_[\w-]+/, requestId: /apr_[0-9a-f]+/g, noRequest: 'apr_none',
  /** Digest bounds: message-text tail per request, last messages kept one by one, their text tail, an aux call's last user text. */
  textsTail: 60000, lastMessages: 8, lastTextChars: 4000, auxUserChars: 20000,
  roles: Object.freeze({ user: 'user', system: 'system' }),
})

const randomId = (prefix, chars) => prefix + Math.random().toString(FAKE_LLM.randomRadix).slice(2, 2 + chars)
const textOf = (content) => (Array.isArray(content) ? content.map((b) => b?.text ?? '').join('') : String(content ?? ''))
/** Like textOf, but also reads blocks that nest their own content (tool results). */
const deepText = (content) => (Array.isArray(content) ? content.map((b) => b?.text ?? (b?.content !== undefined ? deepText(b.content) : '')).join('') : String(content ?? ''))
const userTexts = (options) => (options.messages ?? []).filter((m) => m.role === FAKE_LLM.roles.user).map((m) => textOf(m.content))

/**
 * One plan kind: a plan `{sessionId, needle, args, callId?}` answers, once, the newest user message of
 * its session that contains `needle` and an id `pattern` finds, with one call of `tool` whose
 * `idArg` is that id. Approval plans answer a permission request, question plans a question.
 */
function answerPlan(plans, options, { pattern, group, tool, idArg, prefix, usedKey }) {
  const users = userTexts(options)
  for (const plan of plans) {
    if (plan.used || plan.sessionId !== options.sessionId) continue
    const found = users.filter((t) => t.includes(plan.needle)).map((t) => pattern.exec(t)).filter(Boolean).at(-1)
    if (!found) continue
    plan.used = { [usedKey]: found[group], at: Date.now() }
    return [{ tool, id: plan.callId ?? randomId(prefix, FAKE_LLM.randomPlanChars), args: { [idArg]: found[group], ...plan.args } }]
  }
  return undefined
}
const APPROVAL_PLAN = Object.freeze({ pattern: FAKE_LLM.permissionRequest, group: 1, tool: FAKE_LLM.approvalTool, idArg: 'request_id', prefix: FAKE_LLM.approvalPlanPrefix, usedKey: 'requestId' })
const QUESTION_PLAN = Object.freeze({ pattern: FAKE_LLM.questionId, group: 0, tool: FAKE_LLM.questionTool, idArg: 'question_id', prefix: FAKE_LLM.questionPlanPrefix, usedKey: 'questionId' })

export const model = (globalThis.__fbtestModel ??= {
  requests: [],
  aux: [],
  queues: new Map(),
  queue(sessionId, ...responses) { const q = this.queues.get(sessionId) ?? []; q.push(...responses); this.queues.set(sessionId, q) },
  respond(options) { return this.queues.get(options.sessionId)?.shift() ?? this.byPlan(options) ?? this.byQuestionPlan(options) ?? this.byMarker(options) ?? [{ text: FAKE_LLM.plainText }] },
  /** Approval plans `{sessionId, needle, args, callId?}`: answered with answer_approval({request_id, ...args}). */
  plans: [],
  /** Question plans `{sessionId, needle, args, callId?}`: answered with answer_question({question_id, ...args}). */
  questionPlans: [],
  byPlan(options) { return answerPlan(this.plans, options, APPROVAL_PLAN) },
  byQuestionPlan(options) { return answerPlan(this.questionPlans, options, QUESTION_PLAN) },
  /**
   * Answers for sessions whose id a test cannot know in advance: `markers.set(marker, {except,
   * script: [...responses], sessions: new Set()})`. A request of a session other than `except` whose
   * user messages contain the marker takes its next scripted response.
   */
  markers: new Map(),
  byMarker(options) {
    const users = userTexts(options).join('\n')
    for (const [marker, entry] of this.markers) {
      if (entry.except === options.sessionId || entry.script.length === 0 || !users.includes(marker)) continue
      entry.sessions.add(options.sessionId)
      return entry.script.shift()
    }
    return undefined
  },
})

/** Total text characters across a request's messages. */
const charsOf = (options) => (options.messages ?? []).reduce((n, m) => n + textOf(m.content).length, 0)

/** A JSON-safe digest of one conversation request. */
function digest(options) {
  const messages = options.messages ?? []
  return {
    sessionId: options.sessionId ?? null,
    at: Date.now(),
    system: [options.system ?? '', ...messages.filter((m) => m.role === FAKE_LLM.roles.system).map((m) => textOf(m.content))].join('\n'),
    tools: (options.tools ?? []).map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })),
    messageCount: messages.length,
    model: options.model ?? null,
    maxTokens: options.maxTokens ?? null,
    chars: charsOf(options),
    texts: messages.map((m) => textOf(m.content)).join('\n').slice(-FAKE_LLM.textsTail),
    /** The last messages one by one (a tool result is told apart from a context message after it). */
    last: messages.slice(-FAKE_LLM.lastMessages).map((m) => ({ role: m.role, source: m.source?.kind ?? null, isError: m.isError ?? null, text: deepText(m.content).slice(-FAKE_LLM.lastTextChars) })),
  }
}

/** A digest of an auxiliary call: purpose, cap and its final user message. */
function auxDigest(options) {
  const last = (options.messages ?? []).filter((m) => m.role === FAKE_LLM.roles.user).at(-1)
  return { sessionId: options.sessionId ?? null, purpose: options.purpose, at: Date.now(), model: options.model ?? null, maxTokens: options.maxTokens ?? null, messageCount: (options.messages ?? []).length, chars: charsOf(options), lastUserText: textOf(last?.content).slice(0, FAKE_LLM.auxUserChars) }
}

function fillPlaceholders(script, options) {
  if (!script.some((s) => s.args && Object.values(s.args).includes(REQUEST_PLACEHOLDER))) return script
  const text = (options.messages ?? []).filter((m) => m.role !== FAKE_LLM.roles.system).map((m) => deepText(m.content)).join('\n')
  const id = [...text.matchAll(FAKE_LLM.requestId)].at(-1)?.[0] ?? FAKE_LLM.noRequest
  return script.map((s) => (s.args ? { ...s, args: Object.fromEntries(Object.entries(s.args).map(([k, v]) => [k, v === REQUEST_PLACEHOLDER ? id : v])) } : s))
}

/** `text` cut into `n` consecutive pieces (the last takes the remainder). */
function splitText(text, n) {
  const size = Math.max(1, Math.ceil(text.length / n))
  const parts = []
  for (let at = 0; at < text.length; at += size) parts.push(text.slice(at, at + size))
  return parts
}

/** DSH stream chunks of one script (see the module comment for the step kinds). */
export function chunksFor(steps) {
  const out = []
  let index = 0
  let toolCalls = false
  let finish = null
  for (const step of steps) {
    if (step.fail !== undefined) { finish = { kind: 'error', failure: { message: FAKE_LLM.failureMessage, code: step.fail } }; continue }
    if (step.finish === FAKE_LLM.maxTokensFinish) finish = { kind: FAKE_LLM.maxTokensFinish }
    if (step.text !== undefined) {
      const parts = step.deltas > 1 ? splitText(step.text, step.deltas) : [step.text]
      out.push({ type: 'block-start', index, blockType: 'text' }, ...parts.map((text) => ({ type: 'text-delta', index, text, ...(step.delayMs ? { fbtestDelayMs: step.delayMs } : {}) })), { type: 'block-end', index, block: { type: 'text', text: step.text } })
    } else {
      toolCalls = true
      const id = step.id ?? randomId(FAKE_LLM.callPrefix, FAKE_LLM.randomCallChars)
      const args = step.rawArgs ?? JSON.stringify(step.args ?? {})
      out.push({ type: 'block-start', index, blockType: 'tool-call' }, { type: 'tool-call-delta', index, id, name: step.tool, argumentsDelta: args }, { type: 'block-end', index, block: { type: 'tool-call', id, name: step.tool, arguments: args } })
    }
    index++
  }
  out.push({ type: 'usage', usage: { ...FAKE_LLM.usage } }, { type: 'finish', reason: finish ?? { kind: toolCalls ? 'tool-calls' : 'stop' } })
  return out
}

export const name = FAKE_LLM.name
export const inject = FAKE_LLM.inject

/**
 * Model windows are mutable (`model.windows[id]`, then `model.adapterHandle.replace([FAKE.provider])`
 * publishes llm/adapters-updated). `model.inputModalities` makes every scripted model take more input
 * kinds (set it before DSH boots).
 */
const envWindow = process.env[FAKE_LLM_ENV.window]
model.windows ??= {
  [FAKE.model]: envWindow === FAKE_LLM_ENV.noWindow ? undefined : Number(envWindow ?? FAKE_WINDOW.default),
  [FAKE_MODELS.b]: FAKE_WINDOW.b,
  [FAKE_MODELS.nowin]: undefined,
}
const info = (id = FAKE.model) => ({
  provider: FAKE.provider, id, name: FAKE_LLM.modelNamePrefix + id, inputModalities: model.inputModalities ?? FAKE_LLM.textModalities,
  ...(model.windows[id] === undefined ? {} : { context: { contextWindow: model.windows[id] } }),
  defaultMaxTokens: FAKE_WINDOW.defaultMaxTokens,
})

/**
 * `model.lookupFailure[id] = 'throw' | 'hang'` makes exact-model lookups (resolveModel) of that model
 * fail or hang until cancelled or `model.lookupHangMs`. Conversation requests bind their model in
 * prepareCall, so a turn still reaches the model.
 */
model.lookupFailure ??= {}
model.lookups ??= 0

const flip = process.env[FAKE_LLM_ENV.windowFlip] ? JSON.parse(process.env[FAKE_LLM_ENV.windowFlip]) : null
function flipWindow() {
  if (!flip || model.flipped) return
  model.flipped = { at: Date.now(), lookupsBefore: model.lookups }
  model.windows[FAKE.model] = flip.window
  model.adapterHandle?.replace([FAKE.provider])
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** The adapter DSH's llm service calls; exported so a case can drive it without a DSH. */
export class FakeAdapter extends LlmAdapter {
  providerInfo(provider) { return { id: provider, name: FAKE_LLM.providerName } }
  async listModels() { return Object.keys(model.windows).map((id) => info(id)) }
  async resolveModel(_provider, id, signal) {
    model.lookups++
    const failure = model.lookupFailure[id]
    if (failure === FAKE_LLM.lookupThrow) throw new Error(FAKE_LLM.lookupFailure + id)
    if (failure === FAKE_LLM.lookupHang) {
      await new Promise((resolve) => { const t = setTimeout(resolve, model.lookupHangMs ?? FAKE_LLM.lookupHangMs); signal?.addEventListener('abort', () => { clearTimeout(t); resolve() }, { once: true }) })
      throw new Error(FAKE_LLM.lookupHung + id)
    }
    const answer = info(id)
    if (flip?.at === 'lookup' && id === FAKE.model) setImmediate(flipWindow)
    return answer
  }
  async prepareCall(_provider, id) {
    const delayMs = Number(process.env[FAKE_LLM_ENV.firstPrepareDelayMs] ?? 0)
    if (delayMs > 0 && !model.prepareDelayed) {
      model.prepareDelayed = { startedAt: Date.now() }
      await wait(delayMs)
      model.prepareDelayed.releasedAt = Date.now()
    }
    return { model: info(id), stream: (options) => this.stream(options) }
  }
  async *stream(options) {
    let script
    const delayMs = Number(process.env[FAKE_LLM_ENV.firstRequestDelayMs] ?? 0)
    if (!options.purpose && delayMs > 0 && !model.delayedOnce) {
      model.delayedOnce = true
      model.delayStartedAt = Date.now()
      await wait(delayMs)
      model.delayReleasedAt = Date.now()
    }
    if (options.purpose) {
      model.aux.push(auxDigest(options))
      // With model.compactionFails a summary call answers no text, which DSH's summarizer rejects.
      script = options.purpose === FAKE_LLM.compaction ? (model.compactionFails ? [] : [{ text: FAKE_LLM.summaryText }]) : [{ text: FAKE_LLM.titleText }]
    } else {
      // model.holdNth (sessionId -> {at, seen}) holds that session's at-th conversation request from then on.
      const nth = model.holdNth?.get(options.sessionId)
      if (nth && ++nth.seen === nth.at) { model.holdNth.delete(options.sessionId); (model.holds ??= new Map()).set(options.sessionId, null) }
      // model.holds (sessionId -> null) holds the session's next request open until a test calls the resolver it leaves there.
      if (model.holds?.has(options.sessionId) && model.holds.get(options.sessionId) === null) {
        await new Promise((resolve) => model.holds.set(options.sessionId, resolve))
      }
      model.requests.push(digest(options))
      script = fillPlaceholders(model.respond(options), options)
    }
    for (const chunk of chunksFor(script)) {
      if (!chunk.fbtestDelayMs) { yield chunk; continue }
      const { fbtestDelayMs, ...plain } = chunk
      await wait(fbtestDelayMs)
      yield plain
    }
  }
}

export function apply(ctx) {
  ctx.effect(() => {
    const handle = ctx.llm.registerAdapter([FAKE.provider], new FakeAdapter())
    // replace() re-commits the same routes, which publishes llm/adapters-updated.
    model.adapterHandle = handle
    if (flip?.at === 'apply') setImmediate(flipWindow)
    return handle
  }, FAKE_LLM.effectLabel)
}
