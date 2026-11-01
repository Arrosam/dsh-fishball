/**
 * Tag records (DESIGN §9 `tags`, §7a.3 "Tags", spike S37): one per answer Fishball gave on a
 * permission request, shown in the asking turn's tail ("Asked Fishball" plus the answer, or
 * "Sent to you").
 *
 * A turn-tail entry knows its turn's start and end seq but not its call ids, so each record
 * carries the seq of the asking call's `tool/call` event; the browser shows the records whose
 * seq lies inside the turn. Records are durable (your answer Q-r11-tag-store), so old turns keep
 * their tags after a restart, and are kept to auditEntriesKept, oldest dropped first, as the
 * audit lists are (Q-r11-tag-bound). A turn whose records were dropped shows none.
 */
import { AuditLog } from './audit.js'
import { diagnosticOf } from './errors.js'

export class TagRecords {
  #log
  #readLimits
  #logger
  #onChange

  /**
   * @param store - Store (its `tags` table). @param readLimits - () => limits (auditEntriesKept).
   * @param deps.logger - plugin logger; deps.onChange - called after a record is added.
   */
  constructor(store, readLimits, { logger, onChange }) {
    this.#log = new AuditLog(() => store.tags, () => readLimits().auditEntriesKept)
    this.#readLimits = readLimits
    this.#logger = logger
    this.#onChange = onChange
  }

  /**
   * Record one answer. A failed write is logged, never thrown: a missing tag must not undo the answer.
   * @param tag - { sessionId (the session the user sees), callId?, seq, answer, kind: TAG_KIND }.
   */
  async add({ sessionId, callId, seq, answer, kind }) {
    try {
      await this.#log.append({ sessionId, ...(callId === undefined ? {} : { callId }), seq, answer, kind, at: new Date().toISOString() }, [kind])
      this.#onChange()
    } catch (error) {
      this.#logger.warn('tag record failed (%s)', diagnosticOf(error))
    }
  }

  /** The kept records for the browser, newest first. */
  snapshot() {
    return this.#log.recent(this.#readLimits().auditEntriesKept).map(({ key, sessionId, callId, seq, answer, kind }) => ({ key, sessionId, callId: callId ?? null, seq, answer, kind }))
  }
}
