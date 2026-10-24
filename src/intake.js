/**
 * IntakeLedger: every input that wakes Fishball, other than your own chat messages, goes
 * through here (DESIGN §5b): messages from other sessions, sessions you forward, Fishball
 * notices, and later plugin events and watch notices.
 *
 * For each item:
 * 1. Bound it before any work: maxQueuedInputs here; maxMessageBytes where the sender's text
 *    enters (src/messaging.js), so Fishball's framing never counts against the sender.
 * 2. Write a durable row (pending), keyed by its source identity plus dedupe key, holding the
 *    message with an id minted in advance. The same source and key again is a duplicate.
 * 3. Deliver it to the live agent with steer (an idle Fishball starts a turn; a running turn
 *    takes it at its next step), then flush the session and mark the row accepted, recording
 *    the session it was delivered to. The message body is kept until Fishball reads it (or it
 *    is discarded or fails), then dropped; its digest stays.
 * 4. Follow agent/inbox/claimed (consumed) and agent/inbox/discarded (discarded).
 *
 * Restart: open rows are checked against the inbox and the log by message id before anything
 * is resent (at-least-once, deduplicated by id; never replayed blindly). An accepted row of the
 * SAME session that is in neither is delivered again: DSH can drop pending steering when a
 * turn is interrupted by a quit (P5 test DUR-01). One accepted for an older session (before an
 * adopt) is discarded. Discards DSH reports while Fishball is stopping are not recorded,
 * because a quit is not your choice to clear the inbox.
 *
 * Wake guard (spike S10): DSH's resume does not wake a pending inbox, and the turn-retirement
 * gap can strand a message. When Fishball is idle with one of our items still in its inbox,
 * the item is removed and steered again (same message, same id), which wakes it. DSH reports
 * that removal as a discard; the guard's own removals are not recorded as one (review H1).
 * The guard runs each time Fishball goes idle and also retries rows still pending: a
 * delivery that failed is retried then, not only at the next restart (review M1).
 *
 * Wake limit (wakeupsPerHour): an input other than yours that would start a turn from idle
 * counts as a wake-up. Over the cap it is parked in the inbox without waking (still durable,
 * accepted), and the wake guard wakes Fishball once the hour allows; a turn that starts for
 * another reason (your message) takes parked items too. Wake-ups are counted per process, so
 * a restart starts a fresh hour.
 */
import { createHash } from 'node:crypto'
import { INTAKE_ERROR, INTAKE_KIND, INTAKE_OUTCOME, INTAKE_STATUS, AGENT_IDLE, EVENT, INTAKE, HOUR_MS } from './constants.js'
import { diagnosticOf } from './errors.js'
/** Rows still waiting to be read by Fishball (they count toward maxQueuedInputs). */
const OPEN = new Set([INTAKE_STATUS.pending, INTAKE_STATUS.accepted])
/** Kinds whose wake-ups are not capped: you yourself acted ("Send to Fishball"). */
const UNCAPPED = new Set([INTAKE_KIND.user])
const INBOX_TARGET = Object.freeze({ step: 'next-step' })
const USER_MESSAGE_EVENT = 'user/message'

/** An input the ledger refused, with a stable INTAKE_ERROR code. */
export class IntakeError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

/** Full SHA-256 hex (path-safe; no truncation, so a key collision is not a practical concern). */
const sha256 = (text) => createHash('sha256').update(text).digest('hex')

/** Digest of a message's content, kept after the body is dropped (DESIGN §9). */
const contentDigest = (message) => sha256(JSON.stringify(message.content))

/** The text of a message, as maxMessageBytes measures it. */
const textOf = (message) => message.content.filter((block) => block.type === 'text').map((block) => block.text).join('')

export class IntakeLedger {
  #ctx
  #store
  #logger
  #readLimits
  #onChange
  #agentOf = () => undefined
  /** Serializes every row change and delivery, so a message is never delivered twice at once. */
  #queue = Promise.resolve()
  /** Times of wake-ups this hour (per process). */
  #wakes = []
  /** Message ids the wake guard is removing and steering again: their discard is not real. */
  #rewaking = new Set()
  /** Set while the row unloads: inbox discards during shutdown are not your choice. */
  #stopping = false
  /**
   * Message ids a turn has claimed (recorded synchronously in the claim event). Between the
   * claim and the user/message event a message is in neither the inbox nor the log; a pass
   * that ran then would deliver it again or call it lost (review N1).
   */
  #claimed = new Set()
  #wakeTimer

  /**
   * @param ctx - fishball row context (sessions).
   * @param store - Store (intakeItems table).
   * @param logger - plugin logger (codes and ids only, never content).
   * @param options.readLimits - () => current limits.
   * @param options.onChange - called after the queue changed.
   */
  constructor(ctx, store, logger, { readLimits, onChange }) {
    this.#ctx = ctx
    this.#store = store
    this.#logger = logger
    this.#readLimits = readLimits
    this.#onChange = onChange
    ctx.effect(() => () => clearTimeout(this.#wakeTimer), 'fishball: intake wake timer')
  }

  /** The assistant agent, once the lifecycle exists. */
  set agentOf(provider) {
    this.#agentOf = provider
  }

  /**
   * Take one input.
   * @param item.kind - INTAKE_KIND.
   * @param item.sourceIdentity - who sent it, worked out by the host (never from a payload).
   * @param item.dedupeKey - unique per source; the same pair again is a duplicate.
   * @param item.message - the UserMessage to deliver (id minted by the caller).
   * @returns { intakeId, status: 'accepted' | 'duplicate' }; the row is durable on return.
   * @throws IntakeError(tooLarge | queueFull | empty).
   */
  publish({ kind, sourceIdentity, dedupeKey, message }) {
    return this.#serial(async () => {
      const intakeId = sha256(sourceIdentity + INTAKE.keySeparator + dedupeKey)
      const table = this.#store.intakeItems
      if (table.get(intakeId) !== undefined) return { intakeId, status: INTAKE_OUTCOME.duplicate }
      if (textOf(message).trim().length === 0) throw new IntakeError(INTAKE_ERROR.empty)
      // maxMessageBytes bounds the SENDER's text, checked where it enters (messaging, later
      // plugin sources); Fishball's own framing and bounded excerpts are not counted.
      if (this.#openCount() >= this.#readLimits().maxQueuedInputs) throw new IntakeError(INTAKE_ERROR.queueFull)
      await table.put(intakeId, {
        kind, sourceIdentity, dedupeKey, messageId: message.id, status: INTAKE_STATUS.pending,
        attempts: 0, createdAt: new Date().toISOString(), contentDigest: contentDigest(message), message: structuredClone(message),
      })
      this.#onChange()
      await this.#deliver(intakeId)
      return { intakeId, status: INTAKE_OUTCOME.accepted }
    })
  }

  /**
   * After the assistant goes live (start, retry, adopt): settle every open row against the
   * agent's inbox and log, deliver what is still pending, and wake for stranded items.
   * Accepted rows are settled only here, when no turn has run yet in this agent (review N1).
   */
  reconcile() {
    return this.#serial(async () => {
      const logged = this.#loggedIds()
      for (const [intakeId, row] of [...this.#store.intakeItems.entries()]) {
        if (row.status === INTAKE_STATUS.pending) await this.#deliver(intakeId, logged)
        else if (row.status === INTAKE_STATUS.accepted) await this.#settleAccepted(intakeId, row, logged)
      }
      this.#wakeGuard()
    })
  }

  /** The idle pass: deliver pending rows again (failed earlier), then the wake guard. */
  #idlePass() {
    return this.#serial(async () => {
      const logged = this.#loggedIds()
      for (const [intakeId, row] of [...this.#store.intakeItems.entries()]) {
        if (row.status === INTAKE_STATUS.pending) await this.#deliver(intakeId, logged)
      }
      this.#wakeGuard()
    })
  }

  /** The row is unloading (call before the assistant is disposed). */
  stopping() {
    this.#stopping = true
  }

  /**
   * Agent setup: follow the inbox, and whenever Fishball goes idle retry pending rows and run
   * the wake guard.
   */
  installAgent(agentCtx, agent) {
    agentCtx.on(EVENT.inboxClaimed, ({ message }) => {
      this.#claimed.add(message.id)
      void this.#mark(message.id, INTAKE_STATUS.consumed)
    })
    agentCtx.on(EVENT.inboxDiscarded, ({ message }) => {
      // The guard's own inbox.remove() emits this synchronously; so does a quit. Neither is a
      // real discard (a quit's dropped steering is delivered again after the restart).
      if (!this.#rewaking.has(message.id) && !this.#stopping) void this.#mark(message.id, INTAKE_STATUS.discarded)
    })
    agentCtx.on(EVENT.agentStatus, ({ agent: changed, status }) => {
      if (changed === agent && status === AGENT_IDLE) void this.#idlePass()
    })
  }

  /**
   * Whether a kept row came from or was about this session (read_session relatedness): its
   * source identity is one of the session prefixes plus the id (rows pruned beyond
   * auditEntriesKept no longer count).
   * @param prefixes - source identity prefixes naming a session (src/messaging.js SOURCE_ID).
   */
  hasSource(sessionId, prefixes) {
    const identities = new Set(prefixes.map((prefix) => prefix + sessionId))
    for (const [, row] of this.#store.intakeItems.entries()) if (identities.has(row.sourceIdentity)) return true
    return false
  }

  /** Detached view for the settings page: counts and the newest rows (no message content). */
  snapshot() {
    const rows = [...this.#store.intakeItems.entries()].map(([intakeId, row]) => ({ intakeId, ...row }))
    rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    const count = (status) => rows.filter((row) => row.status === status).length
    return {
      queued: count(INTAKE_STATUS.pending) + count(INTAKE_STATUS.accepted),
      failed: count(INTAKE_STATUS.failed),
      wakeupsThisHour: this.#recentWakes().length,
      items: rows.slice(0, INTAKE.snapshotRows).map(({ intakeId, kind, sourceIdentity, status, createdAt, errorCode }) => ({ intakeId, kind, sourceIdentity, status, createdAt, errorCode: errorCode ?? null })),
    }
  }

  #serial(task) {
    const run = this.#queue.then(task)
    this.#queue = run.catch(() => {})
    return run
  }

  #openCount() {
    let count = 0
    for (const [, row] of this.#store.intakeItems.entries()) if (OPEN.has(row.status)) count++
    return count
  }

  /** Whether the agent's inbox still holds a message id. */
  #inInbox(agent, messageId) {
    return agent.inbox.nextStep.some((m) => m.id === messageId) || agent.inbox.nextTurn.some((m) => m.id === messageId)
  }

  /**
   * Ids of user messages a turn took: in the session log, or claimed in this process (read
   * once per pass; one copy of the log, not one per row).
   */
  #loggedIds() {
    const ids = new Set(this.#claimed)
    const agent = this.#agentOf()
    if (agent === undefined) return ids
    for (const event of agent.session.snapshotEvents()) if (event.type === USER_MESSAGE_EVENT && event.data?.id !== undefined) ids.add(event.data.id)
    return ids
  }

  /** Deliver one pending row, if Fishball is live. Never throws: a failure is recorded. */
  async #deliver(intakeId, logged = this.#loggedIds()) {
    const agent = this.#agentOf()
    const row = this.#store.intakeItems.get(intakeId)
    if (agent === undefined || row?.status !== INTAKE_STATUS.pending) return
    if (this.#inInbox(agent, row.messageId)) return this.#accept(intakeId, agent)
    if (logged.has(row.messageId)) return this.#update(intakeId, { status: INTAKE_STATUS.consumed, message: undefined })
    try {
      if (agent.status !== AGENT_IDLE) agent.steer(row.message)
      else if (this.#mayWake(row.kind)) { this.#countWake(row.kind); agent.steer(row.message) }
      else { agent.send(row.message, INBOX_TARGET.step, false); this.#armWakeTimer() }
      if (!(await this.#ctx.sessions.flush(agent.session))) throw new Error('session persistence did not acknowledge the input')
      await this.#accept(intakeId, agent)
    } catch (error) {
      this.#logger.warn('intake %s could not be delivered (%s)', intakeId, diagnosticOf(error))
      // Steered but not flushed: the message is in the inbox; the next pass accepts it from
      // there instead of counting a failure (review M1).
      if (this.#inInbox(agent, row.messageId)) return
      const attempts = row.attempts + 1
      const failed = attempts >= INTAKE.maxAttempts
      await this.#update(intakeId, failed ? { status: INTAKE_STATUS.failed, attempts, message: undefined, errorCode: INTAKE_ERROR.deliveryFailed } : { attempts })
    }
  }

  /** Mark a row accepted in this agent's session (its message stays until it is read). */
  #accept(intakeId, agent) {
    return this.#update(intakeId, { status: INTAKE_STATUS.accepted, deliveredTo: agent.id, acceptedAt: new Date().toISOString() })
  }

  /**
   * An accepted row (restart, idle pass): still in the inbox, read (in the log), from an older
   * session (discarded: an adopted session does not inherit it), or lost from this session's
   * inbox (delivered again, same message and id).
   */
  async #settleAccepted(intakeId, row, logged) {
    const agent = this.#agentOf()
    if (agent === undefined || this.#inInbox(agent, row.messageId)) return
    if (logged.has(row.messageId)) return this.#update(intakeId, { status: INTAKE_STATUS.consumed, message: undefined })
    // Delivered to another assistant session (before an adopt), or recorded without the session
    // or the message: it cannot be shown to be this session's, so it is not delivered again.
    if (row.deliveredTo !== agent.id || row.message === undefined) return this.#update(intakeId, { status: INTAKE_STATUS.discarded, message: undefined })
    await this.#update(intakeId, { status: INTAKE_STATUS.pending })
    await this.#deliver(intakeId, logged)
  }

  /** Mark the row holding messageId (inbox events). */
  #mark(messageId, status) {
    return this.#serial(async () => {
      for (const [intakeId, row] of this.#store.intakeItems.entries()) {
        if (row.messageId === messageId && OPEN.has(row.status)) return this.#update(intakeId, { status, message: undefined })
      }
    })
  }

  /** Replace fields of one row (undefined removes a field), then prune finished rows. */
  async #update(intakeId, fields) {
    const table = this.#store.intakeItems
    const row = table.get(intakeId)
    if (row === undefined) return
    const next = { ...row, ...fields }
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]
    await table.put(intakeId, next)
    if (!OPEN.has(next.status)) await this.#prune()
    this.#onChange()
  }

  /** Keep the newest auditEntriesKept finished rows; open rows are never pruned. */
  async #prune() {
    const table = this.#store.intakeItems
    const finished = [...table.entries()].filter(([, row]) => !OPEN.has(row.status)).sort(([, a], [, b]) => (a.createdAt < b.createdAt ? -1 : 1))
    const excess = finished.length - this.#readLimits().auditEntriesKept
    for (const [intakeId] of finished.slice(0, Math.max(0, excess))) await table.delete(intakeId)
  }

  #recentWakes() {
    const since = Date.now() - HOUR_MS
    this.#wakes = this.#wakes.filter((time) => time > since)
    return this.#wakes
  }

  #mayWake(kind) {
    const cap = this.#readLimits().wakeupsPerHour
    return UNCAPPED.has(kind) || cap === 0 || this.#recentWakes().length < cap
  }

  #countWake(kind) {
    if (!UNCAPPED.has(kind)) this.#wakes.push(Date.now())
  }

  /** Run the wake guard when the oldest wake-up of this hour expires. */
  #armWakeTimer() {
    if (this.#wakeTimer !== undefined) return
    const oldest = this.#recentWakes()[0] ?? Date.now()
    this.#wakeTimer = setTimeout(() => { this.#wakeTimer = undefined; this.#wakeGuard() }, Math.max(0, oldest + HOUR_MS - Date.now()))
  }

  /**
   * While Fishball is idle with one of our accepted items still in its inbox, remove it and
   * steer the same message again: one steer wakes it, and the turn takes the rest.
   */
  #wakeGuard() {
    const agent = this.#agentOf()
    if (agent === undefined || agent.status !== AGENT_IDLE) return
    const ours = new Map([...this.#store.intakeItems.entries()].filter(([, row]) => row.status === INTAKE_STATUS.accepted).map(([, row]) => [row.messageId, row]))
    const stranded = [...agent.inbox.nextStep, ...agent.inbox.nextTurn].filter((message) => ours.has(message.id))
    if (stranded.length === 0) return
    // Any item that may wake now (yours first: they are never capped); one wake takes them all.
    const waking = stranded.find((message) => UNCAPPED.has(ours.get(message.id).kind)) ?? stranded.find((message) => this.#mayWake(ours.get(message.id).kind))
    if (waking === undefined) return this.#armWakeTimer()
    this.#rewaking.add(waking.id)
    try {
      if (!agent.inbox.remove(waking.id)) return
      this.#countWake(ours.get(waking.id).kind)
      agent.steer(waking)
    } catch (error) {
      this.#logger.warn('intake wake failed (%s)', diagnosticOf(error))
    } finally {
      this.#rewaking.delete(waking.id)
    }
  }
}
