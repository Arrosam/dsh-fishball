/**
 * An append-only audit list in one storage table, keeping the newest entries (DESIGN §9:
 * plugin changes, the outbox, later approvals). Keys start with the time, so they sort by
 * age; a per-process counter keeps two entries of one millisecond apart.
 */
import { compoundKey } from './keys.js'
import { DECISION_OK } from './constants.js'
import { diagnosticOf } from './errors.js'

/** Width of the counter segment (sorts as text). */
const SEQ_DIGITS = 8

export class AuditLog {
  #table
  #keep
  #seq = 0

  /**
   * @param table - () => KvTable (read on each call: the store owns the handle).
   * @param keep - () => how many entries to keep (the live auditEntriesKept limit).
   */
  constructor(table, keep) {
    this.#table = table
    this.#keep = keep
  }

  /**
   * Append one entry and drop the oldest beyond the limit.
   * @param record - the entry; `at` (ISO time) leads its key.
   * @param tags - extra key segments that make the key readable (e.g. plugin and action).
   * @returns the entry's key.
   */
  async append(record, tags = []) {
    const table = this.#table()
    const key = compoundKey([record.at, String(this.#seq++).padStart(SEQ_DIGITS, '0'), ...tags])
    await table.put(key, record)
    const keys = [...table.keys()].sort()
    for (const old of keys.slice(0, Math.max(0, keys.length - this.#keep()))) await table.delete(old)
    return key
  }

  /** Entries, newest first, at most `limit`. */
  recent(limit) {
    return [...this.#table().entries()].sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, limit).map(([key, record]) => ({ key, ...record }))
  }

  /** Entries whose `at` is at or after `since` (ISO time) and that match `filter`. */
  countSince(since, filter = () => true) {
    let count = 0
    for (const [, record] of this.#table().entries()) if (record.at >= since && filter(record)) count++
    return count
  }
}

/**
 * Append one row to Fishball's `decisions` audit (§9). The reason is trimmed and cut to
 * `rationaleChars`, and left out when empty. A failed write is logged: the decision itself stands.
 * @param log - AuditLog over store.decisions. @param logger - plugin logger.
 */
export async function recordDecision(log, logger, { action, sessionId, by, reason, rationaleChars, outcome = DECISION_OK }) {
  const rationale = typeof reason === 'string' ? reason.trim().slice(0, rationaleChars) : ''
  try {
    await log.append({ action, sessionId, by, ...(rationale ? { rationale } : {}), at: new Date().toISOString(), outcome }, [action])
  } catch (error) {
    logger.warn('decision audit failed (%s)', diagnosticOf(error))
  }
}
