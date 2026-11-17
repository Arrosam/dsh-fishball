/**
 * An in-process DSH for the R-FIX-CORE manager rows (F05, F06, F07, F08, F15, F18): the installed
 * SDK's real parts (cordis, session, projections, agent, system prompt, tools, llm, JSONL
 * persistence, checkpoint policy, agent loop, sandbox and approval policies, default model) in this
 * process, with core's manager session and reminders over it. No DSH process is started.
 *
 * Fakes, and only these:
 * - the model adapter (`fbtest-rfix` provider): answers text at once, records every request, can
 *   hold one turn open ("busy"), and can hold its next catalog read (`state.holdNext`) so a case
 *   orders two overlapping model validations;
 * - `profileContext` = `{home}` (the throwaway root), the one host fact the manager reads;
 * - `agents.create` / `agents.resume` may be wrapped by a case (`faults`) to fail one call, exactly
 *   as DSH would answer it (a thrown error of the SDK's own class).
 * Everything observed is public: the manager session's API, the durable session log, the model
 * requests and the reminder store file the reminders module documents.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { INSTANCE, REPO } from '../../../support/constants.mjs'
import { linkContractForSourceRun } from '../../../support/contract-link.mjs'
import { until } from '../../../support/util.mjs'
import { importInstance, importSdk } from '../../../private-skills/support/sdk.mjs'

/** DSH's own package and service names (installed SDK), and the fixture world (test data). */
export const INPROC = Object.freeze({
  cordis: '@deepseek-ai/cordis',
  llm: '@deepseek-ai/dsh-llm',
  persistence: '@deepseek-ai/dsh-session-persistence-jsonl',
  sessionPersistence: '@deepseek-ai/dsh-session-persistence',
  checkpoint: '@deepseek-ai/dsh-session-checkpoint-policy',
  agentLoop: '@deepseek-ai/dsh-agent-loop',
  defaultModel: '@deepseek-ai/dsh-agent-default-model',
  /** 0.2.2's tools service runs calls through a separate executor (the events/bridge worlds load it the same way). */
  executor: '@deepseek-ai/dsh-tool-executor-native',
  plugins: Object.freeze([
    '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-session-projection', '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-system-prompt',
    '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-storage', '@deepseek-ai/dsh-sandbox-policy', '@deepseek-ai/dsh-user-approval',
  ]),
  services: Object.freeze({ agents: 'agents', profileContext: 'profileContext' }),
  provider: 'fbtest-rfix',
  models: Object.freeze({ dshDefault: 'fbtest-rfix-default', a: 'fbtest-rfix-a', b: 'fbtest-rfix-b', c: 'fbtest-rfix-c' }),
  modelText: 'fbtest rfix ok',
  tempPrefix: 'fbtest-rfix-mgr-',
  idle: 'idle',
  userMessage: 'user/message',
  turnEnd: 'turn/end',
  inboxSpliced: 'agent/inbox/spliced',
  userCancel: Object.freeze({ kind: 'user' }),
  disposedCancel: Object.freeze({ kind: 'disposed' }),
  preStep: 'agent/pre-step',
  agentStatus: 'agent/status',
  running: 'running',
  busyText: 'fbtest-rfix busy turn',
  userText: 'fbtest-rfix user turn',
  /** Core's manager modules (their public exports only; JSDoc names them). */
  modules: Object.freeze({
    session: path.join(REPO, 'packages', 'core', 'src', 'manager', 'session.js'),
    reminders: path.join(REPO, 'packages', 'core', 'src', 'manager', 'reminders.js'),
    schedule: path.join(REPO, 'packages', 'core', 'src', 'manager', 'reminder-schedule.js'),
    persona: path.join(REPO, 'packages', 'core', 'src', 'manager', 'persona.js'),
    personaText: path.join(REPO, 'packages', 'core', 'src', 'persona.js'),
  }),
  /** The reminders module's documented store (`<profile home>/fishball/reminders.json`) and its bound. */
  store: Object.freeze({ dir: 'fishball', file: 'reminders.json', maxBytes: 4_194_304 }),
  wait: Object.freeze({ settleMs: 20000, pollMs: 25, quietMs: 600 }),
})

const parts = new Map()
function sdkParts(sdk) {
  if (!parts.has(sdk)) {
    const names = [INPROC.cordis, INPROC.llm, INPROC.persistence, INPROC.sessionPersistence, INPROC.checkpoint, INPROC.agentLoop, INPROC.defaultModel, ...INPROC.plugins]
    parts.set(sdk, Promise.all(names.map((n) => importSdk(sdk, n))).then((mods) => Object.fromEntries(names.map((n, i) => [n, mods[i]]))))
  }
  return parts.get(sdk)
}
/** One of core's manager modules bound to `sdk` (its `@deepseek-ai/*` imports resolve to it). */
export function coreModule(sdk, file) {
  linkContractForSourceRun()
  return importInstance(sdk, path.relative(INSTANCE.dir, file))
}

/** A held promise: `wait()` resolves when `open()` is called. */
export function gate() {
  const opened = Promise.withResolvers()
  return { wait: () => opened.promise, open: () => opened.resolve() }
}

/**
 * The model adapter. `state.holdNext` (a promise), when set, is taken by the next catalog call
 * (`listModels`, `resolveModel` or a `prepareCall` that is not a conversation request) and that
 * call waits on it, so a case can make one model validation slow and leave the next one fast.
 */
function fakeModel(LlmAdapter, state) {
  const info = (id) => ({ provider: INPROC.provider, id, name: id, inputModalities: ['text'] })
  const takeHold = async () => {
    const hold = state.holdNext
    state.holdNext = undefined
    if (hold) await hold
  }
  return new (class extends LlmAdapter {
    providerInfo(id) { return { id, name: id } }
    async listModels() { await takeHold(); return Object.values(INPROC.models).map(info) }
    async resolveModel(_provider, id) { await takeHold(); return info(id) }
    async prepareCall(_provider, id) { return { model: info(id), stream: (options) => this.stream(options, id) } }
    async *stream(options, id) {
      state.requests.push({ model: id ?? options.model, messages: JSON.stringify(options.messages ?? []), system: [options.system ?? '', ...(options.messages ?? []).filter((m) => m.role === 'system').map((m) => JSON.stringify(m.content))].join('\n') })
      if (await state.onRequest?.(options) === 'aborted') return
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: INPROC.modelText } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  })()
}

/**
 * Opens one world in `root` (a fresh one when omitted). Options:
 * - `model()`: core's own Fishball model setting (undefined = unset);
 * - `reminders`: also run core's reminders on the manager (its tools in the manager's scope);
 * - `faults.create(options, base)` / `faults.resume(options, base)`: wrap DSH's agents calls;
 * - `globalPrompt(ctx)`: registers global prompt entries before the manager (F18);
 * - `onRequest(options)`: acts inside a model request; returning `'aborted'` ends it with no answer.
 * `world.close()` closes everything; `t.after` removes the root.
 */
export async function openInproc(t, sdk, options = {}) {
  const tmp = await realpath(os.tmpdir())
  const root = options.root ?? await mkdtemp(path.join(tmp, INPROC.tempPrefix))
  // Teardown: this world closes first, then (when it made the root) the root is removed. One hook,
  // so the order does not depend on node:test's order of `t.after` hooks.
  const cleanups = []
  t.after(async () => {
    for (const fn of cleanups.reverse()) await fn()
    if (options.root !== undefined) return
    assert.ok(path.dirname(root) === tmp && path.basename(root).startsWith(INPROC.tempPrefix), 'refusing to remove ' + root)
    await rm(root, { recursive: true, force: true })
  })
  const p = await sdkParts(sdk)
  const ctx = new p[INPROC.cordis].Context()
  const logs = []
  ctx.logger.exporter({ levels: { default: 3 }, export: (m) => logs.push({ name: m.name, type: m.type, text: m.args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') }) })
  for (const n of INPROC.plugins) await ctx.plugin(p[n].default).await()
  if (typeof ctx.tools.setExecutor === 'function') await ctx.plugin(await importSdk(sdk, INPROC.executor)).await()
  await ctx.plugin(p[INPROC.defaultModel].default, { provider: INPROC.provider, model: INPROC.models.dshDefault }).await()
  await ctx.plugin(p[INPROC.persistence], { root: path.join(root, 'sessions'), compression: 'none' }).await()
  await ctx.plugin(p[INPROC.checkpoint]).await()
  const state = { requests: [], holdNext: undefined, onRequest: options.onRequest }
  ctx.llm.registerAdapter([INPROC.provider], fakeModel(p[INPROC.llm].LlmAdapter, state))
  await ctx.plugin(p[INPROC.agentLoop].default, { agents: [], maxParallelToolCalls: 1 }).await()
  ctx.provide(INPROC.services.profileContext, { home: root })
  options.globalPrompt?.(ctx)

  // DSH's agent service, as the manager reads it (`ctx.get('agents')`), with the case's faults.
  const agents = ctx.get(INPROC.services.agents)
  const calls = { create: [], resume: [] }
  for (const op of ['create', 'resume']) {
    const base = agents[op].bind(agents)
    agents[op] = async (o) => { calls[op].push(o.sessionId ?? o.resumeSessionId); return options.faults?.[op] ? options.faults[op](o, base) : base(o) }
  }

  const sessionMod = await coreModule(sdk, INPROC.modules.session)
  let reminders
  const setupScopes = []
  const manager = sessionMod.createManagerSession(ctx, {
    setup: (agentCtx) => { setupScopes.push(agentCtx); reminders?.registerTools(agentCtx.tools) },
    published: async () => {},
    model: options.model ?? (() => undefined),
  })
  // The order of core's main row (main/index.js): the record is read (`start()`) before the
  // reminders are created, so their startup delivery can resolve the manager.
  await manager.start()
  if (options.reminders) {
    const remindersMod = await coreModule(sdk, INPROC.modules.reminders)
    reminders = remindersMod.createReminders(ctx, { resolveAgent: (id, next) => manager.resolveAgent(id, next) })
  }

  let closed = false
  const world = {
    sdk, root, ctx, p, manager, reminders, logs, calls, state, setupScopes,
    /** The manager's live agent (activating it). */
    activate: () => manager.activate(),
    /** One manager tool run on behalf of the live agent; returns `{isError, json}` of the model-facing text. */
    async tool(name, args) {
      const agent = await manager.activate()
      const callId = 'fbtest-rfix-' + Math.random().toString(36).slice(2)
      const signal = new AbortController().signal
      // 0.2.1's tools service runs one call ({callId, name, arguments}); 0.2.2's runs a batch of
      // model tool-call blocks through its executor ({calls, signal} → {results: [{callId, result}]}).
      const result = typeof agent.ctx.tools.setExecutor === 'function'
        ? (await agent.ctx.tools.execute({ calls: [{ type: 'tool-call', id: callId, name, arguments: JSON.stringify(args) }], signal, agent })).results[0].result
        : await agent.ctx.tools.execute({ callId, name, arguments: args, agent, signal })
      const text = result.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
      let json
      try { json = JSON.parse(text) } catch { json = undefined }
      return { isError: result.isError, text, json }
    },
    storeFile: () => path.join(root, INPROC.store.dir, INPROC.store.file),
    /** The durable session log of the manager (its own JSONL persistence, read through DSH's API). */
    sessionsDir: () => path.join(root, 'sessions'),
    async sessionLog() {
      // The agent's own id: `manager.sessionId()` names the manager only once it joined its
      // workspace, and this world composes no workspace registry.
      const agent = await manager.activate()
      await ctx.sessions.flush(agent.session)
      const reader = await ctx.sessionPersistence.open(agent.id, 'read')
      try { return (await reader.read()).events } finally { await reader.close() }
    },
    /** Admissions (`user/message`) of the manager session carrying `needle`. */
    async admissions(needle) { return (await world.sessionLog()).filter((e) => e.type === INPROC.userMessage && JSON.stringify(e.data).includes(needle)) },
    /** The model of the manager's next request: one user turn, then the model that request used. */
    async nextModel() {
      const agent = await manager.activate()
      const from = state.requests.length
      agent.followup(p[INPROC.llm].freezeMessage({ id: 'fbtest-rfix-u' + from, role: 'user', content: [{ type: 'text', text: INPROC.userText }], source: { kind: 'user' } }))
      await until(() => state.requests.length > from, INPROC.wait.settleMs, INPROC.wait.pollMs)
      await agent.whenIdle()
      return state.requests[from]?.model
    },
    async close() {
      if (closed) return
      closed = true
      reminders?.close()
      manager.close()
      await ctx.fiber.dispose()
    },
  }
  cleanups.push(() => world.close())
  /** Registers `fn` to run at teardown before this world closes (last registered first). */
  world.defer = (fn) => cleanups.push(fn)
  return world
}

/** Waits for `predicate` (a harness wait, not an oracle). */
export const eventually = (predicate, timeoutMs = INPROC.wait.settleMs) => until(predicate, timeoutMs, INPROC.wait.pollMs)
