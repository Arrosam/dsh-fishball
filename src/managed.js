/**
 * ManagedRegistry: which sessions Fishball manages (revision 11, DESIGN §5e, items 1-5).
 *
 * Every session is either yours or managed by Fishball; Fishball's own session is neither.
 * - Durable: `fishball.managed[sessionId]` = { since, by, changedAt } (§9), keyed by the session
 *   the user sees (a subagent belongs to its root). No session is managed at the first start of
 *   revision 11: the table starts empty. A session DSH reports as gone leaves the table at the
 *   next start.
 * - Ways in: start_session, message_session and Send to Fishball call manage() (no note: the
 *   tool's result or your own click already says so); Hand over (your click) calls handOver().
 *   Fishball's answer_prompt calls manage() too (rev11e, the fifth way in; its result says so).
 * - Ways out: Take back (your click) and Fishball's release_session. Hand over, Take back and
 *   release each wake Fishball with one note through the intake ledger (§5e "Notes to Fishball").
 *
 * Tools per session (spike S34): the managed tools are registered in each managed agent's OWN
 * scope layer, through a context Fishball's row owns (createScope with the agent's scope key):
 * - only that agent sees them, so a session that is yours has none and a call there gets DSH's
 *   UNKNOWN_TOOL before any body runs; the registry re-reads visibility on every request, so a
 *   change reaches the next model request, also the next step of a running turn;
 * - the scope belongs to Fishball's plugin fiber, so turning Fishball off removes them everywhere;
 * - scoped registrations end with their agent, so `agent/created` (resume, clear, compaction)
 *   applies them again; subagents are separate agents with their own session ids, which are
 *   never in the table, so they get none (your answer, Q-r11-subagent-tools);
 * - removal calls each register() disposer first, because they undo synchronously, and only
 *   then the asynchronous scope.dispose() (S34: a request assembled while it settled still
 *   listed the tools).
 * Which tools: whatever `managedTools()` returns now (each only while its Fishball plugin runs);
 * sync() re-applies after that may have changed.
 */
import { randomUUID } from 'node:crypto'
import { createScope, scopeOf } from '@deepseek-ai/dsh-scope'
import { createUserMessage, boundContextSummary } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { CHANGED_BY, DECISION_ACTION, DECISION_OK, EVENT, INTAKE_KIND, MANAGED, MANAGED_BY, MANAGED_CHANGE, MANAGED_ERROR, SOURCE } from './constants.js'
import { AuditLog } from './audit.js'
import { describeSession, isSessionGone, rootSessionOf } from './session-info.js'
import { sessionAuthor } from './author.js'
import { untrustedBlock, sessionFields } from './framing.js'
import { diagnosticOf } from './errors.js'

export const MANAGED_TOOL = Object.freeze({ release: 'release_session' })

/** What each change means, and who did it, as the note says (DESIGN §5e item 5). */
const CHANGE_TEXT = Object.freeze({
  [MANAGED_CHANGE.handOver]: 'the user handed this session over to you. It is now managed by you: it has your tools, and its permission requests come to you',
  [MANAGED_CHANGE.takeBack]: 'the user took this session back from you. It is no longer managed: it loses your tools at its next model request, and its permission requests go to the user in that session',
  [MANAGED_CHANGE.release]: 'you released this session (release_session). It is no longer managed: it loses your tools at its next model request, and its permission requests go to the user in that session',
})
/** Who caused each change: your clicks are your inputs (never wake-capped), a release is Fishball's own. */
const CHANGE_KIND = Object.freeze({
  [MANAGED_CHANGE.handOver]: INTAKE_KIND.user,
  [MANAGED_CHANGE.takeBack]: INTAKE_KIND.user,
  [MANAGED_CHANGE.release]: INTAKE_KIND.system,
})

const TEXT = Object.freeze({
  releaseDescription: 'Stop managing a session and hand it back to the user. It loses your tools at its next model request, and its permission requests go to the user in that session again. Use it when the work you handed off is done or the user asks.',
  sessionArg: 'The id of the managed session to release.',
  reasonArg: 'Why you release it, in one sentence (kept in your decisions audit).',
  note: (change, info) => [
    `Fishball notice: ${CHANGE_TEXT[change]}.`,
    'The session\'s title and folder in the untrusted block come from that session, not from the user.',
    untrustedBlock(sessionFields(info)),
  ].join('\n'),
  summary: (change) => `Managed session: ${change}`,
})

const JSON_OUTPUT = Object.freeze({ schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] })
const ok = (fields = {}) => ({ ok: true, ...fields })
const refused = (code) => ({ ok: false, code })

/** A Hand over / Take back / release refusal, with a stable MANAGED_ERROR code. */
export class ManagedError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

export class ManagedRegistry {
  #ctx
  #store
  #logger
  #ledger
  #readLimits
  #assistantId
  #onChange
  #isEnabled
  #managedTools
  #onLeave
  #decisions
  /** Live agent -> { names, undo[] } of its scoped tool registrations (S34). */
  #applied = new Map()
  /** False once the row unloads: nothing is applied after that. */
  #active = true
  /**
   * Every change runs after the previous one: the table records a write only once it is on
   * disk, so two overlapping clicks (a double click, Hand over then Take back, Take back and
   * release_session) would otherwise both see the old state and each send a note (review M1).
   */
  #changes = Promise.resolve()

  /**
   * @param ctx - fishball row context (agents, sessions, sessionController, workspaceRegistry, on, effect).
   * @param store - Store (managed, decisions). @param logger - plugin logger.
   * @param deps.ledger - IntakeLedger (the notes). @param deps.readLimits - () => limits.
   * @param deps.assistantId - () => Fishball's session id. @param deps.onChange - after a change.
   * @param deps.isEnabled - () => whether Session messages runs (Hand over / Take back, release_session).
   * @param deps.managedTools - () => the tool definitions a managed agent has now.
   * @param deps.onLeave - (sessionId, change) => called when a session stops being managed (its waiting
   *   requests then go to you, and its grants end, §5e): change is MANAGED_CHANGE.takeBack or
   *   .release, or undefined for a session DSH no longer finds.
   */
  constructor(ctx, store, logger, { ledger, readLimits, assistantId, onChange, isEnabled, managedTools, onLeave }) {
    this.#ctx = ctx
    this.#store = store
    this.#logger = logger
    this.#ledger = ledger
    this.#readLimits = readLimits
    this.#assistantId = assistantId
    this.#onChange = onChange
    this.#isEnabled = isEnabled
    this.#managedTools = managedTools
    this.#onLeave = onLeave
    this.#decisions = new AuditLog(() => store.decisions, () => readLimits().auditEntriesKept)
    // Unscoped, so it sees every new agent (S34 step 3).
    ctx.on(EVENT.agentCreated, ({ agent }) => this.#syncAgent(agent))
    ctx.on(EVENT.agentDisposed, ({ agent }) => this.#remove(agent))
    ctx.effect(() => {
      this.sync()
      // The scope unwinds with the row anyway; the disposers make it immediate (S34 step 2).
      return () => {
        this.#active = false
        for (const agent of [...this.#applied.keys()]) this.#remove(agent)
      }
    }, 'fishball: managed tools')
  }

  /** Whether this session (the one the user sees; callers pass the root) is managed. */
  isManaged(sessionId) {
    return this.#store.managed.get(sessionId) !== undefined
  }

  /** Managed sessions for the browser (§10e snapshot `managed`). */
  snapshot() {
    return [...this.#store.managed.entries()].map(([sessionId, record]) => ({ sessionId, since: record.since, by: record.by }))
  }

  /**
   * Make a session managed as a side effect of Fishball's start_session / message_session or
   * your Send to Fishball, or of answer_prompt (no note; DESIGN §5e). Already managed: unchanged.
   * @returns whether the session became managed now.
   */
  manage(sessionId, by) {
    return this.#add(rootSessionOf(this.#ctx, sessionId), by)
  }

  /**
   * Your Hand over to Fishball (POST managed {managed: true}).
   * @throws ManagedError(featureOff | isFishball | unknownSession).
   */
  async handOver(sessionId) {
    const root = await this.#checkClick(sessionId)
    const info = await this.#describe(root)
    if (info === undefined) throw new ManagedError(MANAGED_ERROR.unknownSession)
    if (await this.#add(root, MANAGED_BY.handOver)) await this.#note(MANAGED_CHANGE.handOver, info)
  }

  /**
   * Your Take back from Fishball (POST managed {managed: false}). A session that is already
   * yours is unchanged (no note).
   * @throws ManagedError(featureOff | isFishball | unknownSession).
   */
  async takeBack(sessionId) {
    const root = await this.#checkClick(sessionId)
    const info = await this.#describe(root)
    if (info === undefined && !this.isManaged(root)) throw new ManagedError(MANAGED_ERROR.unknownSession)
    if (await this.#drop(root, MANAGED_CHANGE.takeBack)) await this.#note(MANAGED_CHANGE.takeBack, info ?? { id: root, title: '', cwd: null })
  }

  /** Fishball's release_session (scope P; Session messages). */
  registerTools(register) {
    register(defineTool({
      name: MANAGED_TOOL.release,
      description: TEXT.releaseDescription,
      parameters: {
        session_id: { type: 'string', required: true, description: TEXT.sessionArg },
        reason: { type: 'string', required: true, description: TEXT.reasonArg },
      },
      output: JSON_OUTPUT,
      execute: async ({ session_id: sessionId, reason }) => {
        // A call already in flight when Session messages went off (the tool leaves at the apply).
        if (!this.#isEnabled()) return refused(MANAGED_ERROR.featureOff)
        if (sessionId === this.#assistantId()) return refused(MANAGED_ERROR.isFishball)
        if (!(await this.#drop(sessionId, MANAGED_CHANGE.release))) return refused(MANAGED_ERROR.notManaged)
        await this.#audit(sessionId, reason)
        const info = (await this.#describe(sessionId)) ?? { id: sessionId, title: '', cwd: null }
        await this.#note(MANAGED_CHANGE.release, info)
        return ok({ sessionId, managed: false })
      },
    }))
  }

  /** Apply or remove the tools on every live agent (after a plugin's on/off changed). */
  sync() {
    for (const agent of this.#ctx.agents.list()) this.#syncAgent(agent)
  }

  /** Forget sessions DSH reports as gone (DESIGN §9: "removed when DSH no longer finds the session"). */
  async prune() {
    for (const sessionId of [...this.#store.managed.keys()]) {
      if (await isSessionGone(this.#ctx, sessionId)) await this.#drop(sessionId)
    }
  }

  /** The checks every click shares; @returns the session the user sees. */
  async #checkClick(sessionId) {
    if (!this.#isEnabled()) throw new ManagedError(MANAGED_ERROR.featureOff)
    const root = rootSessionOf(this.#ctx, sessionId)
    if (root === this.#assistantId()) throw new ManagedError(MANAGED_ERROR.isFishball)
    return root
  }

  #describe(sessionId) {
    return describeSession(this.#ctx, sessionId, this.#readLimits().forwardExcerptBytes)
  }

  /** Run one change after every earlier one (see #changes); a failed change does not block later ones. */
  #serial(change) {
    const run = this.#changes.then(change)
    this.#changes = run.catch(() => {})
    return run
  }

  /** Record a managed session and give its live agent the tools; @returns whether it changed. */
  #add(sessionId, by) {
    return this.#serial(async () => {
      if (sessionId === this.#assistantId() || this.isManaged(sessionId)) return false
      const now = new Date().toISOString()
      await this.#store.managed.put(sessionId, { since: now, by, changedAt: now })
      this.#syncSession(sessionId)
      this.#onChange()
      return true
    })
  }

  /**
   * Forget a managed session and take the tools from its live agent; @returns whether it changed.
   * @param change - why (MANAGED_CHANGE.takeBack or .release); undefined when DSH no longer finds it.
   */
  #drop(sessionId, change) {
    return this.#serial(async () => {
      if (!this.isManaged(sessionId)) return false
      await this.#store.managed.delete(sessionId)
      this.#syncSession(sessionId)
      this.#onLeave(sessionId, change)
      this.#onChange()
      return true
    })
  }

  #syncSession(sessionId) {
    const agent = this.#ctx.agents.get(sessionId)
    if (agent !== undefined) this.#syncAgent(agent)
  }

  /** Give one agent exactly the tools it should have now (none unless its own session is managed). */
  #syncAgent(agent) {
    const wanted = this.#active && this.isManaged(agent.id) ? this.#managedTools() : []
    const names = wanted.map((tool) => tool.name).sort().join()
    if ((this.#applied.get(agent)?.names ?? '') === names) return
    this.#remove(agent)
    if (wanted.length === 0) return
    // Recorded as each step succeeds, so a failure part-way undoes what was already applied.
    const undo = []
    this.#applied.set(agent, { names, undo })
    try {
      const scope = createScope(this.#ctx, scopeOf(agent.ctx))
      // Kept last, and asynchronous: the synchronous disposers before it undo the tools at once (S34).
      undo.push(() => void Promise.resolve(scope.dispose()).catch((error) => this.#logger.warn('managed tools scope disposal failed (%s)', diagnosticOf(error))))
      for (const tool of wanted) undo.splice(undo.length - 1, 0, scope.ctx.tools.register(tool))
    } catch (error) {
      this.#logger.warn('managed tools for %s failed (%s)', agent.id, diagnosticOf(error))
      this.#remove(agent)
    }
  }

  #remove(agent) {
    const applied = this.#applied.get(agent)
    if (applied === undefined) return
    this.#applied.delete(agent)
    for (const undo of applied.undo) {
      try { undo() } catch (error) { this.#logger.warn('managed tools removal failed (%s)', diagnosticOf(error)) }
    }
  }

  /** One note to Fishball; a refused note (queue full) is logged, the change itself stands. */
  async #note(change, info) {
    const text = TEXT.note(change, info)
    const kind = CHANGE_KIND[change]
    try {
      await this.#ledger.publish({
        kind,
        sourceIdentity: MANAGED.sourcePrefix + info.id,
        // A fresh key per change: a later hand-over of the same session is its own note.
        dedupeKey: randomUUID(),
        message: createUserMessage({ content: [{ type: 'text', text }], source: { ...SOURCE.notice, summary: boundContextSummary(TEXT.summary(change)), author: sessionAuthor(kind, info) } }),
      })
    } catch (error) {
      this.#logger.warn('managed note for %s not delivered (%s)', info.id, diagnosticOf(error))
    }
  }

  /** Fishball's release in its decisions audit (§9; Q-r11-defaults "every Fishball decision audited"). */
  async #audit(sessionId, reason) {
    const rationale = typeof reason === 'string' ? reason.trim().slice(0, this.#readLimits().rationaleChars) : ''
    try {
      await this.#decisions.append({ action: DECISION_ACTION.release, sessionId, by: CHANGED_BY.fishball, ...(rationale ? { rationale } : {}), at: new Date().toISOString(), outcome: DECISION_OK }, [DECISION_ACTION.release])
    } catch (error) {
      this.#logger.warn('decision audit failed (%s)', diagnosticOf(error))
    }
  }
}
