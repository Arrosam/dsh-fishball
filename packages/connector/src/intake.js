/**
 * IntakeLedger: every input for Fishball from the main DSH goes through here (slim §5.2 "Inbox"):
 * a managed session's message_fishball, your hand-over note, a managed-session change, a watch
 * notice, and the notice of a permission request or question waiting for Fishball.
 *
 * Fishball runs in the isolated child, so the ledger is the main side's durable queue in front of
 * the bridge's `inbox.push` (src/slim/host/bridge.js):
 * 1. Bound it before any work: maxQueuedInputs here; maxMessageBytes where the sender's text
 *    enters (src/messaging.js), so Fishball's framing never counts against the sender.
 * 2. Write a durable row (pending), keyed by its source identity plus dedupe key. The same
 *    source and key again is a duplicate.
 * 3. Push it to the child. The child acks only after it queued the turn in Fishball's chat; the
 *    row is then consumed and its body dropped (the digest stays).
 * A child that is down never loses an item: the row stays pending, and a new attachment (a detach
 * and a new attach, the connector row restarted, or the main DSH restarted) gets every pending
 * row again when it is ready. The child dedupes by the row id (the dedupe key), so an item pushed
 * twice is delivered once. Wake-ups belong to the child's own chat now; the in-process wake guard
 * and its hourly cap went with the in-process agent.
 */
import { createHash } from 'node:crypto'
import { INTAKE_ERROR, INTAKE_KIND, INTAKE_OUTCOME, INTAKE_STATUS, INTAKE } from './constants.js'
import { diagnosticOf } from './errors.js'
/** Rows still waiting to be taken by the child (they count toward maxQueuedInputs). */
const OPEN = new Set([INTAKE_STATUS.pending])

/**
 * Kinds the queue bound refuses when it is full (contract §9): every automated one. A `user` item
 * is the user's own note (Hand over, Take back), so the bound never makes that action fail; it
 * is always accepted, even past it (design §18.5 conn-OQ-03).
 */
const BOUNDED_KINDS = new Set(Object.values(INTAKE_KIND).filter((kind) => kind !== INTAKE_KIND.user))

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

/** The text of a message, as maxMessageBytes measures it and as the child receives it. */
const textOf = (message) => message.content.filter((block) => block.type === 'text').map((block) => block.text).join('')

export class IntakeLedger {
  #store
  #logger
  #readLimits
  #onChange
  /** The bridge's inbox.push for the attached host; undefined while no native host is up. */
  #push
  /** Serializes every row change, so a row is never written twice at once. */
  #queue = Promise.resolve()

  /**
   * @param store - Store (intakeItems table).
   * @param logger - plugin logger (codes and ids only, never content).
   * @param options.readLimits - () => current limits.
   * @param options.onChange - called after the queue changed.
   */
  constructor(store, logger, { readLimits, onChange }) {
    this.#store = store
    this.#logger = logger
    this.#readLimits = readLimits
    this.#onChange = onChange
  }

  /**
   * Take one input.
   * @param item.kind - INTAKE_KIND.
   * @param item.sourceIdentity - who sent it, worked out by the host (never from a payload).
   * @param item.sourceSessionId - the main session it is about; the child reads its images and
   *   names its sender from it.
   * @param item.dedupeKey - unique per source; the same pair again is a duplicate.
   * @param item.message - the UserMessage whose text Fishball receives (id minted by the caller).
   * @returns { intakeId, status: 'accepted' | 'duplicate' }; the row is durable on return.
   * @throws IntakeError(tooLarge | queueFull | empty).
   */
  publish({ kind, sourceIdentity, sourceSessionId, dedupeKey, message }) {
    return this.#serial(async () => {
      const intakeId = sha256(sourceIdentity + INTAKE.keySeparator + dedupeKey)
      const table = this.#store.intakeItems
      if (table.get(intakeId) !== undefined) return { intakeId, status: INTAKE_OUTCOME.duplicate }
      if (textOf(message).trim().length === 0) throw new IntakeError(INTAKE_ERROR.empty)
      // The user's own note is never refused by the bound (BOUNDED_KINDS); it still counts.
      if (BOUNDED_KINDS.has(kind) && this.#openCount() >= this.#readLimits().maxQueuedInputs) throw new IntakeError(INTAKE_ERROR.queueFull)
      await table.put(intakeId, {
        kind, sourceIdentity, sourceSessionId, dedupeKey, messageId: message.id, status: INTAKE_STATUS.pending,
        createdAt: new Date().toISOString(), contentDigest: contentDigest(message), message: structuredClone(message),
      })
      this.#onChange()
      this.#send(intakeId)
      return { intakeId, status: INTAKE_OUTCOME.accepted }
    })
  }

  /**
   * An instance is ready (src/slim/host/approvals.js): every pending row goes to it, oldest first.
   * The order is the contract's global arrival order across kinds and sources (§9), so a note
   * written before a message reaches Fishball before that message, as it did on the way in.
   * @param push - (item) => Promise<{acked: true}>, the bridge host's pushInbox.
   */
  attach(push) {
    this.#push = push
    const pending = [...this.#store.intakeItems.entries()].filter(([, row]) => row.status === INTAKE_STATUS.pending)
    pending.sort(([, a], [, b]) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
    for (const [intakeId] of pending) this.#send(intakeId)
  }

  /**
   * The attachment ended (contract §1.3): later rows wait for the next attach instead of being
   * pushed to a channel that closed. Rows already pushed but unacknowledged stay pending, so the
   * next attach re-sends exactly those (§4.5).
   */
  detach() {
    this.#push = undefined
  }

  /** Detached view for the settings page and the row marks: counts and the newest rows (no content). */
  snapshot() {
    const rows = [...this.#store.intakeItems.entries()].map(([intakeId, row]) => ({ intakeId, ...row }))
    rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    const count = (status) => rows.filter((row) => row.status === status).length
    return {
      queued: count(INTAKE_STATUS.pending),
      items: rows.slice(0, this.#readLimits().intakeRowsShown).map(({ intakeId, kind, sourceIdentity, status, createdAt }) => ({ intakeId, kind, sourceIdentity, status, createdAt })),
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

  /**
   * Push one pending row; its ack consumes it. A refusal or a closed host leaves it pending for
   * the next attach (never counted as failed: the child can take it later, unchanged).
   */
  #send(intakeId) {
    const row = this.#store.intakeItems.get(intakeId)
    if (this.#push === undefined || row?.status !== INTAKE_STATUS.pending || row.message === undefined) return
    const item = {
      // The row id is the bridge's dedupe key: one input is delivered once, however often it is pushed.
      messageId: row.messageId, kind: row.kind, sourceSessionId: row.sourceSessionId,
      text: textOf(row.message), images: [], dedupeKey: intakeId, at: Date.parse(row.createdAt),
    }
    let pushed
    try { pushed = Promise.resolve(this.#push(item)) } catch (error) { pushed = Promise.reject(error) }
    pushed.then(
      () => this.#serial(() => this.#update(intakeId, { status: INTAKE_STATUS.consumed, message: undefined })),
      (error) => this.#logger.warn('intake %s waits for the child (%s)', intakeId, diagnosticOf(error)),
    )
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
}
