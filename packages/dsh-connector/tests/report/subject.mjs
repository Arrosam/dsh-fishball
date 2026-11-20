/**
 * Binds the CONN-REPORT integration rows to the session source (src/wire/sessions.js
 * createSessionSource(ctx)), over a fake of the DSH ctx members that interface reads, as relayed:
 * - ctx.on(name, fn) → disposer: 'session/event' (session, event), 'agent/status' ({agent}),
 *   'subagent/end' ({parentSessionId, id});
 * - ctx.sessions.get(id) → {id, header, snapshotEvents()}: a subagent's header is
 *   {origin: 'subagent', parentSession}, followed to the root;
 * - ctx.agents.get(id) / ctx.agents.list() → {id, status, inbox: {nextTurn, nextStep, hasPending}, session};
 * - ctx.get('jobs') (optional) → {list(owner) → [{id, status, owner}], events.subscribe(filter, fn) → disposer}.
 * The fake fires each DSH edge in DSH's order and keeps the state a listener reads at that moment.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { INSTANCE } from '../../../../test/support/constants.mjs'
import { importInstance } from '../../../../test/private-skills/support/sdk.mjs'
import { resolveRuntimePackages } from '../pairs/subject.mjs'
import { DSH, SUBJECT, WAIT } from './constants.mjs'

const loaded = new Map()
export function sourceModule(sdk) {
  if (!loaded.has(sdk)) {
    loaded.set(sdk, (async () => {
      assert.ok(fs.existsSync(SUBJECT.entry), SUBJECT.entry + ' does not exist')
      resolveRuntimePackages()
      const mod = await importInstance(sdk, path.relative(INSTANCE.dir, SUBJECT.entry))
      assert.equal(typeof mod[SUBJECT.factory], 'function', 'sessions.js exports no ' + SUBJECT.factory)
      return mod
    })())
  }
  return loaded.get(sdk)
}

export const settle = () => new Promise((resolve) => setTimeout(resolve, WAIT.settleMs))

/** A fake DSH ctx: sessions, agents, jobs, and the three event names. */
export class FakeDsh {
  #listeners = new Map()
  #jobListeners = new Set()
  sessionsById = new Map()
  agentsById = new Map()
  jobsById = new Map()
  subscriptions = { live: 0 }
  #turn = 0
  constructor({ jobs = true } = {}) {
    const self = this
    this.ctx = {
      on: (name, fn) => self.#on(name, fn),
      sessions: { get: (id) => self.sessionsById.get(id) },
      agents: { get: (id) => self.agentsById.get(id), list: () => [...self.agentsById.values()] },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      get: (name) => (name === DSH.jobs.service && jobs ? self.jobService : undefined),
    }
    this.jobService = {
      list: (owner) => [...self.jobsById.values()].filter((j) => owner === undefined || j.owner === owner).map((j) => ({ ...j })),
      events: {
        subscribe: (_filter, fn) => {
          self.#jobListeners.add(fn)
          self.subscriptions.live += 1
          let done = false
          return () => { if (!done) { done = true; self.#jobListeners.delete(fn); self.subscriptions.live -= 1 } }
        },
      },
    }
    if (jobs) this.ctx.jobs = this.jobService
  }
  #on(name, fn) {
    if (!this.#listeners.has(name)) this.#listeners.set(name, new Set())
    this.#listeners.get(name).add(fn)
    this.subscriptions.live += 1
    let done = false
    return () => { if (!done) { done = true; this.#listeners.get(name).delete(fn); this.subscriptions.live -= 1 } }
  }
  #emit(name, ...args) { for (const fn of [...(this.#listeners.get(name) ?? [])]) fn(...args) }

  /** A session (and its live agent, idle) with `header`. */
  add(id, header = DSH.userHeader()) {
    const events = []
    const session = { id, header, snapshotEvents: () => events.map((e) => structuredClone(e)), events }
    this.sessionsById.set(id, session)
    this.agentsById.set(id, { id, status: DSH.status.idle, inbox: { nextTurn: [], nextStep: [], hasPending: false }, session })
    return id
  }
  child(id, parent) { return this.add(id, DSH.subagentHeader(parent)) }
  agent(id) { return this.agentsById.get(id) }
  /** The session's log gets an assistant message whose text blocks are `texts`. */
  say(id, ...texts) {
    this.sessionsById.get(id).events.push({ type: DSH.sessionEvent.assistant, data: { message: { role: 'assistant', content: texts.map((text) => ({ type: DSH.textBlock, text })) } } })
  }
  /** A user message in the log (never a final message). */
  userSays(id, text) {
    this.sessionsById.get(id).events.push({ type: DSH.sessionEvent.user, data: { message: { role: 'user', content: [{ type: DSH.textBlock, text }] } } })
  }
  #status(id, status) {
    const agent = this.agent(id)
    agent.status = status
    this.#emit(DSH.event.status, { agent })
  }
  /** A turn starts: the agent runs, then turn/start is logged. */
  start(id) {
    this.#turn += 1
    this.#status(id, DSH.status.running)
    const event = { type: DSH.sessionEvent.turnStart, data: { turn: this.#turn } }
    this.sessionsById.get(id).events.push(event)
    this.#emit(DSH.event.session, this.sessionsById.get(id), event)
  }
  /** The turn ends with `reason` (DSH TurnEndReason); unless `staysRunning`, the agent goes idle afterwards. */
  end(id, reason = DSH.reason.completed(), { staysRunning = false } = {}) {
    const event = { type: DSH.sessionEvent.turnEnd, data: { turn: this.#turn, reason } }
    this.sessionsById.get(id).events.push(event)
    this.#emit(DSH.event.session, this.sessionsById.get(id), event)
    if (!staysRunning) this.#status(id, DSH.status.idle)
  }
  /** One whole turn whose model said `text` (if any). */
  turn(id, text, reason) { this.start(id); if (text !== undefined) this.say(id, text); this.end(id, reason) }
  /** Input queued for the agent's next turn (or step), or none. */
  queue(id, { nextTurn = [], nextStep = [] } = {}) {
    const agent = this.agent(id)
    agent.inbox = { nextTurn, nextStep, hasPending: nextTurn.length + nextStep.length > 0 }
  }
  /** A subagent run of `id` (child of `parent`) ended: its agent goes idle, then subagent/end. */
  subagentEnds(id, parent) {
    if (this.agent(id).status !== DSH.status.idle) this.#status(id, DSH.status.idle)
    this.#emit(DSH.event.subagentEnd, { parentSessionId: parent, id })
  }
  /** A job of `owner` registers with `status`. */
  job(jobId, owner, status = DSH.jobs.running) {
    this.jobsById.set(jobId, { id: jobId, owner, status })
    for (const fn of [...this.#jobListeners]) fn({ type: DSH.jobs.registered, job: { ...this.jobsById.get(jobId) } })
  }
  stopping(jobId) { this.jobsById.get(jobId).status = DSH.jobs.stopping }
  /** The job settles (completed by default) and the registry announces it. */
  jobSettles(jobId, status = DSH.jobs.completed) {
    const job = this.jobsById.get(jobId)
    job.status = status
    for (const fn of [...this.#jobListeners]) fn({ type: DSH.jobs.settled, job: { ...job }, cause: 'producer', awaited: false })
  }
}

/** A world: the fake DSH, the source over it, and every report the one listener heard: [[rootId, facts]]. */
export async function reportWorld(t, sdk, options) {
  const mod = await sourceModule(sdk)
  const dsh = new FakeDsh(options)
  const source = mod[SUBJECT.factory](dsh.ctx)
  for (const m of SUBJECT.members) assert.equal(typeof source?.[m], 'function', 'the session source has no ' + m + '()')
  const heard = []
  const dispose = source.onTurnFinished((rootId, facts) => { heard.push([rootId, structuredClone(facts)]) })
  t.after(() => { if (typeof dispose === 'function') dispose() })
  return { dsh, source, heard, dispose }
}
