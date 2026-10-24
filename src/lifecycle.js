/**
 * AssistantLifecycle: the one Fishball session (DESIGN §5a, §11).
 *
 * - First start: create the assistant folder, record the new id, create the session with
 *   the never-registered preset id, read-only with approval policy `ask`.
 * - No DSH workspace is registered for the folder. DSH's New Session flow reuses a blank
 *   session that belongs to a workspace and rebinds its preset; for Fishball's session
 *   that fails, and could turn it into a coding session (browser check, P2). Pinned, the
 *   session is still listed at the top of the sidebar.
 * - Every start: resume the recorded session eagerly. A failed resume never creates a
 *   second session silently; the state becomes `recovery` until the user chooses.
 * - After every create or resume, before it is published live, the session is pinned and,
 *   while still blank, its setup turn is started (not awaited).
 * - An archived session is not resumed; archiving it with "stop activity" stops the agent.
 *   DSH announces no unarchive, so after unarchiving the user presses Retry.
 * - While live, the session reports activity, so a plain archive is refused.
 */
import { mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { setApprovalPolicy } from '@deepseek-ai/dsh-user-approval'
import { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { API_CODE, ASSISTANT, ERROR, EVENT, PROJECTION, RECOVERY_ACTION, SETUP_NOTICE, STATUS } from './constants.js'
import { LifecycleStateError, diagnosticOf } from './errors.js'

const WRITER_HELD = 'SessionAlreadyOwnedError'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** The folder the assistant session owns: `$DSH_HOME/fishball/assistant`. */
export const assistantCwd = () => dshHomePath(...ASSISTANT.homeSegments)

/**
 * The published assistant state: detached data only, one shape for every lifecycle.
 * @param status - STATUS value.
 * @param record - the stored assistant record, or null when the store is not open.
 * @param error - ERROR code, or null.
 */
function assistantSnapshot(status, record, error) {
  return {
    status,
    sessionId: record?.sessionId ?? null,
    workspaceId: record?.workspaceId ?? null,
    cwd: assistantCwd(),
    error: error === null ? null : { code: error },
  }
}

/**
 * Stand-in while no assistant lifecycle runs: before the store has opened, or after a core
 * failure (DESIGN §11: stopped with a stated error until DSH restarts). It refuses every
 * recovery request with `unavailable`.
 */
export class InactiveLifecycle {
  #status
  #error
  #record

  /**
   * @param status - STATUS.starting before the store opens, STATUS.failed after a core failure.
   * @param error - ERROR code for a failure, else null.
   * @param record - the stored assistant record when it could be read, else null.
   */
  constructor(status, error = null, record = null) {
    this.#status = status
    this.#error = error
    this.#record = record
  }

  snapshot() {
    return assistantSnapshot(this.#status, this.#record, this.#error)
  }

  recover() {
    return Promise.reject(new LifecycleStateError(API_CODE.unavailable))
  }
}

export class AssistantLifecycle {
  #ctx
  #store
  #composition
  #logger
  #onChange
  #handle
  #status = STATUS.starting
  #error = null
  #queue = Promise.resolve()
  #stopping = false

  /**
   * @param ctx - fishball row context (agents, workspaceRegistry, agentDefaultModel, sessionProjections).
   * @param store - Store with the assistant record.
   * @param composition - AssistantComposition providing `setup()`.
   * @param logger - plugin logger (codes and ids only).
   * @param onChange - called after every state change.
   */
  constructor(ctx, store, composition, logger, onChange) {
    this.#ctx = ctx
    this.#store = store
    this.#composition = composition
    this.#logger = logger
    this.#onChange = onChange
    ctx.on(EVENT.sessionActivity, (request, next) => this.#activity(request, next))
    ctx.on(EVENT.sessionStop, (request) => this.#onStop(request))
    ctx.effect(() => () => { this.#stopping = true }, 'fishball: lifecycle stop flag')
  }

  /** The agent this lifecycle holds: live, or still running its setup turn. */
  get #running() {
    return this.#handle?.agent
  }

  /** The held agent, for work that must run in its idle phase (plugin changes); else undefined. */
  get agent() {
    return this.#running
  }

  snapshot() {
    return assistantSnapshot(this.#status, this.#store.assistant(), this.#error)
  }

  /** Start: resume the recorded session, or create the first one. */
  start() {
    return this.#serial(() => this.#start())
  }

  /**
   * User recovery choice.
   * - retry: resume the recorded session again (also after unarchiving); a no-op while an
   *   agent is held (live, or running its setup turn).
   * - adopt: create and record a new session; only while in recovery.
   * @throws LifecycleStateError when the action does not fit the state.
   */
  recover(action) {
    return this.#serial(async () => {
      if (action === RECOVERY_ACTION.adopt) {
        if (this.#status !== STATUS.recovery) throw new LifecycleStateError(API_CODE.notInRecovery)
        await this.#create()
        return
      }
      if (this.#running !== undefined) return
      await this.#start()
    })
  }

  /** Dispose the live agent (row unload). */
  async stop() {
    this.#stopping = true
    await this.#dispose()
  }

  #serial(task) {
    const run = this.#queue.then(task)
    this.#queue = run.catch(() => {})
    return run
  }

  #set(status, error = null) {
    this.#status = status
    this.#error = error
    this.#onChange()
  }

  async #start() {
    const record = this.#store.assistant()
    if (record.sessionId === null) return this.#create()
    if (this.#ctx.workspaceRegistry.archivedSessionIds.includes(record.sessionId)) return this.#set(STATUS.archived)
    return this.#resume(record.sessionId)
  }

  async #resume(sessionId) {
    for (let attempt = 1; ; attempt++) {
      try {
        this.#handle = await this.#ctx.agents.resume({ resumeSessionId: sessionId, agentOptions: this.#agentOptions(), setup: this.#composition.setup() })
        return this.#goLive(this.#handle.agent)
      } catch (error) {
        // A GUI resume may hold the writer for a moment at boot (spike S7).
        const live = this.#ctx.agents.get(sessionId)
        if (error?.name === WRITER_HELD && attempt < ASSISTANT.resumeAttempts && live === undefined && !this.#stopping) {
          await sleep(ASSISTANT.resumeRetryMs)
          // The row may have unloaded during the pause; resuming on its context would fail.
          if (this.#stopping) return
          continue
        }
        this.#logger.warn('assistant %s could not be resumed (%s)', sessionId, diagnosticOf(error))
        return this.#set(STATUS.recovery, ERROR.resumeFailed)
      }
    }
  }

  async #create() {
    try {
      const cwd = assistantCwd()
      await mkdir(cwd, { recursive: true })
      const sessionId = `${ASSISTANT.sessionIdPrefix}${randomUUID()}`
      // Record the id durably BEFORE the session exists. A crash between creation and this
      // write would otherwise leave an unrecorded assistant, and the next start would
      // create a second one; with the id recorded first, the next start resumes it, or
      // reports recovery if creation never completed.
      await this.#store.setAssistant({ sessionId, workspaceId: null, cwd, createdAt: new Date().toISOString() })
      const composeSetup = this.#composition.setup()
      this.#handle = await this.#ctx.agents.create({
        sessionId,
        meta: { cwd, agentPreset: ASSISTANT.presetId },
        agentOptions: this.#agentOptions(),
        setup: (agentCtx, agent) => {
          // Written before publication, so the very first request already runs read-only
          // with approval policy ask (DESIGN §7; spike S15: the Web default is workspace-write).
          setSandboxMode(agent.session, ASSISTANT.sandboxMode)
          setApprovalPolicy(agent.session, ASSISTANT.approvalPolicy)
          return composeSetup(agentCtx, agent)
        },
      })
    } catch (error) {
      this.#logger.warn('assistant could not be created (%s)', diagnosticOf(error))
      await this.#dispose()
      return this.#set(STATUS.recovery, ERROR.createFailed)
    }
    return this.#goLive(this.#handle.agent)
  }

  /**
   * Make the session presentable, then publish it as live. Both steps are idempotent, so a
   * retry repairs a start that was interrupted between them:
   * - pin it (a quick registry write; a failure is logged, the assistant still runs);
   * - while it is blank, run the setup turn. The status stays `starting` until that turn
   *   ends, but the end is awaited OUTSIDE the serial queue: the turn waits on the model,
   *   and a turn that waits (a slow model, an approval with no browser open) must not hold
   *   recovery or archive handling, which share the queue.
   */
  async #goLive(agent) {
    this.#watchDisposal(agent)
    const registry = this.#ctx.workspaceRegistry
    try {
      if (!registry.pinnedSessionIds.includes(agent.id)) await registry.pinSession(agent.id)
    } catch (error) {
      this.#logger.warn('assistant %s could not be pinned (%s)', agent.id, diagnosticOf(error))
    }
    try {
      if (!this.#isBlank(agent)) return this.#set(STATUS.live)
      this.#setupTurn(agent)
    } catch (error) {
      // The assistant still runs; at worst its composer stays disabled until a restart.
      this.#logger.warn('assistant %s setup turn could not start (%s)', agent.id, diagnosticOf(error))
      return this.#set(STATUS.live)
    }
    this.#set(STATUS.starting)
    const settle = () => {
      // The agent may have been stopped or replaced while the turn ran.
      if (this.#running === agent) this.#set(STATUS.live)
    }
    void agent.whenIdle().then(settle, settle)
  }

  /**
   * Whether no turn has started in the session (DSH's own list metadata decides blankness).
   * @throws when the projection is not registered, rather than guessing.
   */
  #isBlank(agent) {
    const metadata = this.#ctx.sessionProjections.stateOf(agent.session, PROJECTION.sessionListMetadata)
    if (metadata === undefined) throw new Error(`projection ${PROJECTION.sessionListMetadata} is not registered`)
    return metadata.blank
  }

  /** Start the one setup turn (SETUP_NOTICE); steer wakes the idle agent. */
  #setupTurn(agent) {
    const { kind, form, summary, text } = SETUP_NOTICE
    agent.steer(createUserMessage({ content: [{ type: 'text', text }], source: { kind, form, summary } }))
  }

  /**
   * The model route a created or resumed agent starts with: DSH's default selection, as
   * DSH's own session controller passes on both paths. A resumed agent gets no route from
   * its log, so without this its first turn fails with "has no provider/model". A choice
   * made in the chat's model picker still applies per request (DESIGN §6).
   */
  #agentOptions() {
    return this.#ctx.agentDefaultModel.currentSelection()
  }

  /** When something else disposes the agent (an archive with stop), reflect it. */
  #watchDisposal(agent) {
    agent.ctx.on(EVENT.agentDisposed, ({ agent: gone }) => {
      if (gone !== agent || this.#stopping) return
      this.#handle = undefined
      const archived = this.#ctx.workspaceRegistry.archivedSessionIds.includes(agent.id)
      this.#set(archived ? STATUS.archived : STATUS.stopped)
    })
  }

  async #dispose() {
    const handle = this.#handle
    this.#handle = undefined
    if (handle !== undefined) await handle.dispose()
  }

  /** Report the running assistant as active so a plain archive is refused (DESIGN §5a). */
  async #activity(request, next) {
    const rest = await next()
    const live = this.#running
    if (live === undefined || request.sessionId !== live.id) return rest
    return [{ kind: ASSISTANT.activityKind }, ...(rest ?? [])]
  }

  /** An archive with stopActivity: stop the agent and show the archived state. */
  async #onStop(request) {
    const live = this.#running
    if (live === undefined || request.sessionId !== live.id) return
    await this.#serial(async () => {
      await this.#dispose()
      this.#set(STATUS.archived)
    })
  }
}
