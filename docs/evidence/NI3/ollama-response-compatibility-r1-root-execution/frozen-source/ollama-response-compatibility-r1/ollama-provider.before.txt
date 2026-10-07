// Source candidate only. Importing this module registers nothing and sends nothing.
// Public original DSH LlmAdapter; no replacement loop, session, assembler, or runtime.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { types } from 'node:util';
import { LlmAdapter, LlmRuntime, LlmError, attributionHeaders, isAgentLoopRequest }
  from '../dsh-web/node_modules/@deepseek-ai/dsh-llm/lib/index.js';
import { AgentRegistry } from '../dsh-web/node_modules/@deepseek-ai/dsh-agent/lib/index.js';
import { Context } from '../dsh-web/node_modules/@deepseek-ai/cordis/lib/index.js';

export const PROVIDER = 'df-approved-ollama';
export const MODEL = 'deepseek-v4.1-flash:cloud';
export const ENDPOINT = 'http://127.0.0.1:11434/api/chat';
export const LIMITS = Object.freeze({ calls: 6, concurrent: 1, requestBytes: 32768,
  responseBytes: 98304, outputBytes: 16384, outputTokens: 512, timeoutMs: 60000,
  messages: 24, blocksPerMessage: 32 });
const RETRY = Object.freeze({ mode: 'normal', maxRetries: 0, retryableCodes: [],
  initialDelayMs: 500, maxDelayMs: 10000, jitterRatio: 0 });
const hash = value => createHash('sha256').update(value).digest('hex');
const reject = code => { throw new LlmError(code, code); };
const copy = value => structuredClone(value);
const info = () => ({ provider: PROVIDER, id: MODEL, name: MODEL,
  description: 'Owner-authorized exact cloud model through existing loopback Ollama; billing unknown',
  inputModalities: ['text'], context: { contextWindow: 1048576 },
  defaultMaxTokens: LIMITS.outputTokens,
  reasoning: { efforts: [{ id: 'ollama-think-off', name: 'Thinking disabled (observed false)' }],
    defaultEffort: 'ollama-think-off' } });

function exactRoute(provider, model = MODEL) {
  if (provider !== PROVIDER || model !== MODEL) reject('OLLAMA_EXACT_ROUTE_REQUIRED');
}
function text(value, max = LIMITS.requestBytes) {
  if (typeof value !== 'string' || !value.isWellFormed() || Buffer.byteLength(value) > max)
    reject('OLLAMA_INVALID_TEXT');
  return value;
}
function safeInteger(value, max = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= 0 && value <= max;
}
function assertObservedCatalog() {
  const bytes = readFileSync(new URL('../ollama-approved-model-readonly-approved-2026-10-07/observations.json', import.meta.url));
  // SHA is filled from the pre-existing authorized read-only evidence in source-pins.json.
  const pins = JSON.parse(readFileSync(new URL('./source-pins.json', import.meta.url), 'utf8'));
  if (hash(bytes) !== pins.catalogEvidence.sha256) reject('OLLAMA_CATALOG_EVIDENCE_CHANGED');
  const observed = JSON.parse(bytes);
  const show = observed.observations.find(row => row.path === '/api/show');
  if (observed.endpoint !== 'http://127.0.0.1:11434' || observed.exactModel !== MODEL ||
      show?.httpStatus !== 200 || !show.selectedModelDetails?.capabilities?.includes('completion'))
    reject('OLLAMA_EXACT_MODEL_UNOBSERVED');
  const thinkingBytes = readFileSync(new URL('../ollama-approved-model-readonly-approved-2026-10-07/show-thinking-metadata.json', import.meta.url));
  if (hash(thinkingBytes) !== pins.thinkingEvidence.sha256) reject('OLLAMA_THINKING_EVIDENCE_CHANGED');
  const thinking = JSON.parse(thinkingBytes);
  if (thinking.exactRequestedModel !== MODEL || thinking.httpStatus !== 200 ||
      thinking.responseSha256 !== show.responseSha256 || !thinking.thinking?.values?.includes(false) ||
      thinking.modelInfo?.['deepseek_v41.context_length'] !== 1048576)
    reject('OLLAMA_THINKING_UNOBSERVED');
}

function wireRequest(options) {
  if (!options || types.isProxy(options) || Object.getPrototypeOf(options) !== Object.prototype)
    reject('OLLAMA_INVALID_REQUEST');
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(options))) {
    if (!['provider','model','reasoningEffort','maxTokens','messages','tools','toolHistory','signal','sessionId','system','temperature','stop','purpose'].includes(key) ||
        !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) reject('OLLAMA_INVALID_REQUEST');
  }
  exactRoute(options.provider, options.model);
  // Exact /api/show advertises false. This bounded text-only integration exposes
  // only that supported value; it does not guess low/high/max equivalence to DSH.
  if (options.reasoningEffort !== 'ollama-think-off' || options.temperature !== undefined ||
      options.stop !== undefined || options.purpose !== undefined || options.system !== undefined)
    reject('OLLAMA_UNSUPPORTED_OPTION');
  const cap = options.maxTokens ?? LIMITS.outputTokens;
  if (!Number.isSafeInteger(cap) || cap < 1 || cap > LIMITS.outputTokens)
    reject('OLLAMA_OUTPUT_TOKEN_BOUND');
  if (options.tools !== undefined && (!Array.isArray(options.tools) || options.tools.length))
    reject('OLLAMA_TOOLS_FORBIDDEN');
  if (options.toolHistory !== undefined && (!Array.isArray(options.toolHistory.tools) ||
      options.toolHistory.tools.length || !Array.isArray(options.toolHistory.updates) ||
      options.toolHistory.updates.length)) reject('OLLAMA_TOOL_HISTORY_FORBIDDEN');
  if (!Array.isArray(options.messages) || !options.messages.length ||
      options.messages.length > LIMITS.messages) reject('OLLAMA_MESSAGE_BOUND');
  const messages = options.messages.map((message, position) => {
    if (!['system', 'user', 'assistant'].includes(message.role) ||
        message.role === 'system' && position !== 0 || !Array.isArray(message.content) ||
        message.content.length > LIMITS.blocksPerMessage) reject('OLLAMA_UNSUPPORTED_MESSAGE');
    const out = { role: message.role, content: '' };
    for (const block of message.content) {
      if (block.type === 'text') out.content += text(block.text);
      else if (block.type === 'reasoning' && message.role === 'assistant')
        out.thinking = (out.thinking ?? '') + text(block.text);
      else reject('OLLAMA_UNSUPPORTED_CONTENT');
    }
    text(out.content); if (out.thinking !== undefined) text(out.thinking);
    return out;
  });
  // Deliberately non-streaming upstream: response bytes are bounded before any
  // canonical DSH block is emitted; the original DSH assembler handles our chunks.
  const body = JSON.stringify({ model: MODEL, messages, tools: [], stream: false, think: false,
    options: { num_predict: cap } });
  if (Buffer.byteLength(body) > LIMITS.requestBytes) reject('OLLAMA_REQUEST_BOUND');
  return { body, cap };
}

async function boundedBody(response) {
  const size = response.headers.get('content-length');
  if (size !== null && (!/^\d+$/.test(size) || Number(size) > LIMITS.responseBytes))
    reject('OLLAMA_RESPONSE_BOUND');
  if (!response.body) reject('OLLAMA_RESPONSE_MISSING');
  const reader = response.body.getReader();
  const parts = []; let count = 0, finished = false;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) { finished = true; break; }
      count += item.value.byteLength;
      if (count > LIMITS.responseBytes) reject('OLLAMA_RESPONSE_BOUND');
      parts.push(Buffer.from(item.value));
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts, count));
  } finally {
    // A stuck cancel keeps the generator and its admission slot unresolved. It
    // never establishes remote termination or releases a durable DF reservation.
    if (!finished) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function usageOf(response) {
  const prompt = response.prompt_eval_count, output = response.eval_count;
  if (prompt === undefined && output === undefined) return undefined;
  if (!safeInteger(prompt) || !safeInteger(output)) reject('OLLAMA_INVALID_USAGE');
  // Prompt count includes cached input; canonical DSH counts are disjoint.
  const cached = response.prompt_eval_cached_count;
  if (cached !== undefined && (!safeInteger(cached) || cached > prompt)) reject('OLLAMA_INVALID_USAGE');
  const total = prompt + output;
  if (!Number.isSafeInteger(total)) reject('OLLAMA_INVALID_USAGE');
  return { inputTokens: prompt - (cached ?? 0), outputTokens: output, totalTokens: total,
    ...(cached === undefined ? {} : { cacheReadTokens: cached }) };
}

export class ApprovedOllamaAdapter extends LlmAdapter {
  #admit; #initiator; #onResult; #bindCurrent; #alive = true; #calls = 0; #active; #blocked = false; #audit = [];
  constructor({ admit, initiator, onResult, bindCurrent }) {
    super();
    if (typeof admit !== 'function' || typeof initiator !== 'function') reject('OLLAMA_ADMISSION_REQUIRED');
    if (typeof onResult !== 'function') reject('OLLAMA_RESULT_BINDING_REQUIRED');
    if(typeof bindCurrent!=='function')reject('OLLAMA_CURRENTNESS_BINDING_REQUIRED');
    this.#bindCurrent=bindCurrent;
    this.#admit = admit; this.#initiator = initiator; this.#onResult = onResult; assertObservedCatalog();
  }
  providerInfo(provider) { exactRoute(provider); return { id: PROVIDER, name: 'Approved existing Ollama' }; }
  providerRetryPolicy(provider) { exactRoute(provider); return RETRY; }
  async listModels(provider) { exactRoute(provider); return [info()]; }
  async resolveModel(provider, model, signal) {
    exactRoute(provider, model); signal?.throwIfAborted(); assertObservedCatalog(); return info();
  }
  async prepareCall(provider, model, signal) {
    return { model: await this.resolveModel(provider, model, signal), stream: options => this.stream(options) };
  }
  audit() { return copy({ attempted: this.#calls, active: Boolean(this.#active),
    uncertainHold: this.#blocked, billing: 'unknown', calls: this.#audit }); }
  close() { this.#alive = false; this.#active?.abort(); }
  async *stream(options) {
    const { body, cap } = wireRequest(options);
    if (!this.#alive || this.#blocked || this.#active || this.#calls >= LIMITS.calls)
      reject('OLLAMA_ADMISSION_CLOSED');
    options.signal?.throwIfAborted();
    if (!isAgentLoopRequest(options)) reject('OLLAMA_ORIGINAL_LOOP_REQUIRED');
    const agent = this.#initiator();
    if (!agent || options.sessionId !== agent.session.id || agent.options.provider !== PROVIDER ||
        agent.options.model !== MODEL) reject('OLLAMA_ORIGINAL_AGENT_REQUIRED');
    // Trusted original DF composition supplies this synchronous assertion. It
    // must verify the durable execution, exact context digest, permission/grant,
    // task/version and this exact original agent; payload claims never suffice.
    const permitted = this.#admit({ agent, options, bodyDigest: hash(body), requestBytes: Buffer.byteLength(body) });
    if (types.isPromise(permitted)) { permitted.catch(() => {}); reject('OLLAMA_SYNC_ADMISSION_REQUIRED'); }
    if (permitted !== true) reject('OLLAMA_DF_ADMISSION_DENIED');
    options.signal?.throwIfAborted();
    const capturedCurrent=this.#bindCurrent({agent,options});
    if(typeof capturedCurrent!=='function')reject('OLLAMA_CURRENTNESS_BINDING_REQUIRED');
    let refusal;
    const assertEmissionCurrent=()=>{
      if(refusal)throw refusal;
      try{if(capturedCurrent()!==true)reject('OLLAMA_CURRENTNESS_REFUSED');}
      catch(error){refusal=error;throw error;}
    };
    assertEmissionCurrent();
    const guardedChunk=function*(chunk){assertEmissionCurrent();yield chunk;assertEmissionCurrent();};
    const controller = new AbortController(); this.#active = controller;
    const signal = options.signal === undefined ? controller.signal : AbortSignal.any([options.signal, controller.signal]);
    const record = { call: ++this.#calls, requestBytes: Buffer.byteLength(body), bodyDigest: hash(body),
      state: 'dispatch_attempted', remoteOutcome: 'unknown', billing: 'unknown' };
    this.#audit.push(record);
    const timer = setTimeout(() => controller.abort(), LIMITS.timeoutMs);
    try {
      const response = await fetch(ENDPOINT, { method: 'POST', redirect: 'error',
        headers: { ...attributionHeaders(), 'content-type': 'application/json', accept: 'application/json' },
        body, signal });
      assertEmissionCurrent();
      record.httpStatus = response.status;
      if (!response.ok) { await response.body?.cancel(); reject('OLLAMA_HTTP_FAILURE'); }
      const raw = await boundedBody(response);
      assertEmissionCurrent();
      signal.throwIfAborted();
      let result;
      try { result = JSON.parse(raw); } catch { reject('OLLAMA_INVALID_JSON'); }
      if (!result || result.error !== undefined || result.done !== true || result.model !== MODEL ||
          result.message?.role !== 'assistant') reject('OLLAMA_INVALID_RESPONSE');
      record.remoteOutcome = 'completed';
      if (result.message.tool_calls !== undefined && (!Array.isArray(result.message.tool_calls) ||
          result.message.tool_calls.length)) reject('OLLAMA_UNSOLICITED_TOOL_CALL');
      const content = text(result.message.content, LIMITS.outputBytes);
      const thinking = result.message.thinking === undefined ? '' : text(result.message.thinking, LIMITS.outputBytes);
      if (thinking) reject('OLLAMA_THINK_FALSE_VIOLATION');
      if (Buffer.byteLength(content) + Buffer.byteLength(thinking) > LIMITS.outputBytes)
        reject('OLLAMA_OUTPUT_BOUND');
      const usage = usageOf(result);
      if (usage && usage.outputTokens > cap) reject('OLLAMA_OUTPUT_TOKEN_BOUND');
      const finish = result.done_reason === 'stop' ? { kind: 'stop' } :
        result.done_reason === 'length' ? { kind: 'max-tokens' } : undefined;
      if (!finish) reject('OLLAMA_UNKNOWN_FINISH_REASON');
      if (!content && !thinking) reject('EMPTY_RESPONSE');
      record.state = 'response_validated'; record.resultDigest = hash(content);
      record.outputBytes = Buffer.byteLength(content); record.thinkingBytes = Buffer.byteLength(thinking);
      if (usage) record.tokenUsage = copy(usage);
      if (this.#onResult({ agent, options, usage, resultDigest: hash(content), outputBytes: record.outputBytes,
          remoteOutcome: record.remoteOutcome, requestBytes: record.requestBytes }) !== true)
        reject('OLLAMA_RESULT_BINDING_DENIED');
      assertEmissionCurrent();
      let index = 0;
      for (const [kind, value] of [['reasoning', thinking], ['text', content]]) {
        if (!value) continue;
        yield* guardedChunk({ type: 'block-start', index, blockType: kind });
        yield* guardedChunk({ type: kind === 'reasoning' ? 'reasoning-delta' : 'text-delta', index, text: value });
        yield* guardedChunk({ type: 'block-end', index, block: { type: kind, text: value } }); index++;
      }
      if (usage) yield* guardedChunk({ type: 'usage', usage });
      yield* guardedChunk({ type: 'finish', reason: finish }); assertEmissionCurrent(); record.state = 'chunks_completed';
    } catch (error) {
      // Sticky refusal propagates without a fresh model/error chunk.
      if(refusal)throw refusal;
      assertEmissionCurrent();
      // Never expose upstream bodies, headers, prompts, thinking, credentials,
      // stack traces, or network error messages through durable failure facts.
      record.state = signal.aborted ? 'local_abort' : 'local_failure';
      const code = signal.aborted ? 'OLLAMA_ABORTED' : error instanceof LlmError ? error.failure.code : 'OLLAMA_TRANSPORT_FAILURE';
      record.failureCode = code;
      yield* guardedChunk({ type: 'finish', reason: { kind: signal.aborted ? 'aborted' : 'error', failure: { code, message: code } } });
    } finally {
      clearTimeout(timer); controller.abort();
      // Abort closes only the local transport. Unknown cloud completion keeps
      // this realm blocked; actual DF ledger cleanup/reconciliation owns holds.
      if (record.remoteOutcome !== 'completed') this.#blocked = true;
      this.#active = undefined;
      // Local cleanup is factual only; refusal still blocks final completion.
      assertEmissionCurrent();
    }
  }
}

export function createApprovedOllamaPlugin({ admit, onResult, bindCurrent } = {}) {
  // No wire config exposes the trusted authorizer or selects a model/endpoint.
  const authorize = admit ?? (() => false);
  return { name: 'df-approved-ollama', inject: ['llm', 'agents'], apply(ctx) {
    if (!(ctx instanceof Context) || !(ctx.reflect.get('llm') instanceof LlmRuntime) ||
        !(ctx.reflect.get('agents') instanceof AgentRegistry)) reject('OLLAMA_ORIGINAL_HOST_REQUIRED');
    const adapter = new ApprovedOllamaAdapter({ admit: authorize, onResult: onResult ?? (() => false),
      bindCurrent: bindCurrent ?? (() => () => false),
      initiator: () => ctx.reflect.get('agents').currentInitiator() });
    const registration = ctx.reflect.get('llm').registerAdapter([PROVIDER], adapter);
    ctx.effect(() => () => { adapter.close(); registration(); }, 'df.approved-ollama');
    return adapter;
  } };
}
// Dormant unless explicitly installed in a reviewed, fresh synthetic realm.
// Even then the default denies inference until trusted DF composition binds it.
export default createApprovedOllamaPlugin();
