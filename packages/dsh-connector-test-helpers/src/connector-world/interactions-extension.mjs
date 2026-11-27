/**
 * The interactions suite's extension of the C-WIRE worker (wire/worker.mjs ENV.extension). It runs
 * inside the DSH process and adds only test stand-ins and fixtures, never a connector part:
 * - `bundles()`: the fixture bundle `fbix-tools` (fixture-bundle/), installed before the connector so
 *   its prepended stand-ins (the user's stock prompt and the session's own question card) sit after
 *   the connector's listeners and before DSH's own answerers, and its asking fixture tools;
 * - `overlayRows()`: presets with no tools of their own (bare), with ask_user_question (ask) or its
 *   timed form;
 * - `ops(deps)`: the cases' drivers of those stand-ins and of the scripted model (per-session
 *   scripts, a held request, markers for subagents), and session helpers.
 * Every value is fixture data from constants.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { RUNTIME_ENV } from '../dsh/fake-llm-constants.mjs'
import { IX } from './interactions-constants.mjs'

const RUNTIME = process.env[RUNTIME_ENV]

const hostPkg = (name) => import(pathToFileURL(path.join(RUNTIME, '@deepseek-ai', name, 'lib', 'index.js')).href)

/** The fixture bundle the worker installs before the connector (see fixture-bundle/index.js). */
export const bundles = () => [{ name: IX.fixtureRow.name, dir: path.join(import.meta.dirname, IX.fixtureRow.dir) }]

/** The presets the suite's sessions use (boot overlay rows). */
export function overlayRows() {
  const preset = (id, order, plugins) => ({ id: 'preset-' + id, name: IX.dsh.presetPackage, config: { id, order, plugins } })
  const time = { id: IX.dsh.timeRow, name: IX.dsh.timePackage }
  const ask = (config) => ({ id: IX.dsh.askRow, name: IX.dsh.askPackage, ...(config ? { config } : {}) })
  return [
    preset(IX.preset.bare, IX.preset.order, [time]),
    preset(IX.preset.ask, IX.preset.order + 1, [time, ask()]),
    preset(IX.preset.askTimed, IX.preset.order + 2, [time, ask({ mode: IX.dsh.timedMode, timeout: IX.timedDefaultSeconds })]),
  ]
}

/** The worker ops this suite adds; `deps` are the worker's own helpers (wire/worker.mjs). */
export async function ops({ ctx, model, agentOf, eventSummary, errorInfo, plain, createUserMessage, until, budget }) {
  const { setSandboxMode } = await hostPkg(IX.dsh.sandboxPolicyPackage)
  // The bundle's state (fixture-bundle/index.js keeps it on globalThis: DSH loads it through another URL).
  const store = (globalThis.__fbixFixtures ??= { calls: [], registerErrors: [], stock: [], cards: [], stockMode: IX.stock.hold })
  const kept = new Map()
  const live = (sessionId) => { const a = ctx.agents.get(sessionId); if (!a) throw new Error('no live agent for ' + sessionId); return a }

  const stockView = (s) => ({ ...s, closed: Boolean(s.signal?.aborted) })
  const openCard = (sessionId) => [...store.cards].reverse().find((c) => c.sessionId === sessionId && c.state === IX.card.open)
  const resultsOf = (sessionId) => live(sessionId).session.snapshotEvents().filter((e) => e.type === IX.dsh.toolResult).map((e) => {
    const m = e.data?.message ?? {}
    const text = Array.isArray(m.content) ? m.content.map((b) => b?.text ?? '').join('') : String(m.content ?? '')
    return { callId: m.toolCallId ?? m.callId ?? null, isError: Boolean(m.isError), text }
  })

  /** A scripted dshConnectorSessions delegate (delegate-cases.mjs): verdicts by session id, every request seen. */
  const delegate = (store.delegate ??= { verdicts: new Map(), seen: [], dispose: undefined })

  return {
    /** Registers the scripted delegate `name` (once); `verdict` for `sessionId` (null: stop claiming it; IX.delegate.throws or {throwCode}: it throws). */
    delegateScript({ name, sessionId, verdict }) {
      if (delegate.dispose === undefined) {
        delegate.dispose = ctx.get(IX.delegate.service).delegates.register({
          name,
          claims: (id) => delegate.verdicts.has(id),
          async decide(request) {
            delegate.seen.push(JSON.parse(JSON.stringify(request)))
            const v = delegate.verdicts.get(request.sessionId)
            if (v === IX.delegate.throws) throw new Error(IX.delegate.throws)
            // {throwCode}: the delegate throws an error carrying that `code` (DLG-03's failed rows).
            if (typeof v?.throwCode === 'string') throw Object.assign(new Error(IX.delegate.throws), { code: v.throwCode })
            return v
          },
        })
      }
      if (verdict === null) delegate.verdicts.delete(sessionId)
      else delegate.verdicts.set(sessionId, verdict)
      return true
    },
    delegateSeen: () => delegate.seen,
    /**
     * dshConnectorSessions.start (start-cases.mjs) for `principalKey` with `args`. `after`: 'none' passes
     * no afterManaged; 'record' a recording one; 'throws' / 'rejects' one that records, then throws
     * synchronously / rejects with IX.start.thrown. The recording one waits IX.start.holdMs before it
     * returns, so a first message sent beside it (not after it) would show in the second snapshot.
     * Answers the start's result (or how it threw) and every afterManaged call with what it saw.
     */
    async serviceStart({ principalKey, args, after = IX.start.mode.record }) {
      const service = ctx.get(IX.delegate.service)
      const calls = []
      const snapshot = (sessionId) => {
        const agent = ctx.agents.get(sessionId)
        const events = agent ? agent.session.snapshotEvents() : []
        return {
          manager: service.managerOf(sessionId) ?? null,
          status: agent?.status ?? null,
          userMessages: events.filter((e) => e.type === IX.dsh.userMessage).length,
          requests: model.requests.filter((r) => r.sessionId === sessionId).length,
        }
      }
      const afterManaged = async (sessionId, managed) => {
        const call = { sessionId, managed, at: snapshot(sessionId) }
        calls.push(call)
        if (after === IX.start.mode.throws) throw new Error(IX.start.thrown)
        await new Promise((resolve) => setTimeout(resolve, IX.start.holdMs))
        call.later = snapshot(sessionId)
        if (after === IX.start.mode.rejects) throw new Error(IX.start.thrown)
      }
      // 'throws' must throw synchronously, not as a rejected promise.
      const throwsNow = (sessionId, managed) => { calls.push({ sessionId, managed, at: snapshot(sessionId) }); throw new Error(IX.start.thrown) }
      const input = { principalKey, args, ...(after === IX.start.mode.none ? {} : { afterManaged: after === IX.start.mode.throws ? throwsNow : afterManaged }) }
      try {
        return { value: plain(await service.start(input)), calls }
      } catch (e) {
        return { threw: errorInfo(e), calls }
      }
    },
    /** dshConnectorSessions.startInput as JSON, and whether it (and its nested objects) is frozen. */
    startInput() {
      const s = ctx.get(IX.delegate.service).startInput
      const deepFrozen = (o) => o === null || typeof o !== 'object' || (Object.isFrozen(o) && Object.values(o).every(deepFrozen))
      return { schema: plain(s), frozen: Object.isFrozen(s), deepFrozen: deepFrozen(s), type: typeof s }
    },
    registerErrors: () => store.registerErrors,
    /** A session in a fresh folder on `preset` (no turn). */
    async createIn({ name, preset }) {
      const cwd = path.join(process.env.DSH_HOME, IX.dsh.workDir, name)
      fs.mkdirSync(cwd, { recursive: true })
      const created = await ctx.sessionController.create({ cwd: fs.realpathSync(cwd), ...(preset ? { agentPreset: preset } : {}) })
      await agentOf(created.sessionId)
      return { sessionId: created.sessionId }
    },
    /** A session whose agent handle the worker keeps, so a case can dispose its agent (DUR-01). */
    async createKept({ name, preset }) {
      const cwd = path.join(process.env.DSH_HOME, IX.dsh.workDir, name)
      fs.mkdirSync(cwd, { recursive: true })
      const sessionId = IX.keptPrefix + name
      const handle = await ctx.agents.create({ sessionId, meta: { cwd: fs.realpathSync(cwd), agentPreset: preset }, agentOptions: { provider: IX.fake.provider, model: IX.fake.model } })
      await ctx.sessions.flush(handle.agent.session)
      kept.set(sessionId, handle)
      return { sessionId }
    },
    async disposeKept({ sessionId }) {
      const handle = kept.get(sessionId)
      kept.delete(sessionId)
      if (handle) { await ctx.sessions.flush(handle.agent.session); await handle.dispose() }
      return { live: Boolean(ctx.agents.get(sessionId)) }
    },
    async resume({ sessionId }) { await ctx.sessionController.resolveAgent(sessionId); return { live: Boolean(ctx.agents.get(sessionId)) } },
    /** Steers a user turn whose model answers `script` (one entry per model response); does not wait. */
    async driveStart({ sessionId, text, script = [] }) {
      const agent = await agentOf(sessionId)
      model.queues.delete(sessionId)
      for (const response of script) model.queue(sessionId, response)
      agent.steer(createUserMessage({ content: [{ type: 'text', text }], source: { kind: IX.dsh.userSource } }))
      await until(() => agent.status === IX.dsh.running, budget.turnMs, budget.pollMs)
      return true
    },
    async idle({ sessionId }) { const a = await agentOf(sessionId); return Boolean(await until(() => a.status === IX.dsh.idle, budget.turnMs, budget.pollMs)) },
    status: ({ sessionId }) => ctx.agents.get(sessionId)?.status ?? null,
    /** The GUI's Stop: the running turn ends aborted. */
    cancel({ sessionId }) { const a = ctx.agents.get(sessionId); if (a?.status === IX.dsh.running) a.cancel({ kind: IX.dsh.userSource }); return true },
    results: ({ sessionId }) => resultsOf(sessionId),
    /** The tools (name and parameters) of every model request of a session, in order. */
    requestTools: ({ sessionId }) => model.requests.filter((r) => r.sessionId === sessionId).map((r) => r.tools.map((t) => ({ name: t.name, parameters: t.parameters }))),
    calls: () => store.calls,
    stock: () => store.stock.map(stockView),
    setStock({ mode }) { store.stockMode = mode; return true },
    /** The user clicks Allow once / Reject on the oldest open stock prompt whose reason holds `needle`. */
    releaseStock({ needle, outcome }) {
      const entry = store.stock.find((s) => s.answered === null && !s.signal?.aborted && typeof s.resolve === 'function' && String(s.reason).includes(needle))
      entry?.resolve(outcome)
      return Boolean(entry)
    },
    cards: ({ sessionId } = {}) => plain(store.cards.filter((c) => !sessionId || c.sessionId === sessionId)),
    /** The user answers the session's newest open card. */
    cardAnswer({ sessionId, answers }) {
      const card = openCard(sessionId)
      if (!card) return false
      card.state = IX.card.answered
      card.resolve({ answers })
      return true
    },
    /** The user's Discuss on a plan review (the card rejects cancelled). */
    cardDiscuss({ sessionId }) {
      const card = openCard(sessionId)
      if (!card) return false
      card.state = IX.card.closed
      card.closedCode = IX.card.cancelledCode
      card.reject(Object.assign(new Error(IX.card.cancelledCode), { name: IX.card.errorName, code: IX.card.cancelledCode }))
      return true
    },
    setPolicy({ sessionId, policy }) { ctx.get(IX.dsh.approvalService).setPolicy(live(sessionId), policy); return ctx.get(IX.dsh.approvalService).effectivePolicy(live(sessionId).session) },
    setSandbox({ sessionId, mode }) { setSandboxMode(live(sessionId).session, mode); return true },
    /** `/plan` and `/plan off`, as the user types them. */
    async planCommand({ sessionId, off = false }) {
      const done = await ctx.commands.execute(live(sessionId), off ? IX.dsh.planOff : IX.dsh.planOn, [], new AbortController().signal)
      return done === undefined ? null : plain(done.result)
    },
    /** DSH pins a subagent's policy to never; `on` switches every new agent back to ask (APR-17). */
    askInNewAgents({ on }) {
      store.askOff?.()
      store.askOff = on ? ctx.on(IX.dsh.agentCreated, ({ agent }) => { try { ctx.get(IX.dsh.approvalService).setPolicy(agent, IX.policy.ask) } catch { /* a non-session agent */ } }) : undefined
      return true
    },
    queueMarker({ marker, script, except }) { model.markers.set(marker, { script: [...script], except, sessions: new Set() }); return true },
    markerState({ marker }) { const e = model.markers.get(marker); return e ? { sessions: [...e.sessions], left: e.script.length } : null },
    /** Holds the next model request of a session until releaseHold (a turn in progress). */
    holdNext({ sessionId }) { model.holds ??= new Map(); model.holds.set(sessionId, null); return true },
    isHeld: ({ sessionId }) => typeof model.holds?.get(sessionId) === 'function',
    releaseHold({ sessionId }) { const r = model.holds?.get(sessionId); model.holds?.delete(sessionId); if (typeof r === 'function') r(); return typeof r === 'function' },
    events: ({ sessionId }) => live(sessionId).session.snapshotEvents().map(eventSummary),
    /** Files under DSH's attachment store (X-SEC X-09: a refused put writes nothing). */
    attachmentFiles() {
      const root = path.join(process.env.DSH_HOME, IX.dsh.attachmentsDir)
      if (!fs.existsSync(root)) return 0
      return fs.readdirSync(root, { recursive: true }).filter((f) => fs.statSync(path.join(root, String(f))).isFile()).length
    },
  }
}