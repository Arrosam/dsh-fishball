/**
 * Standing grants (DESIGN §7a.8, §9 `grants`, requirements items 17-19; rev11d).
 *
 * Fishball creates a grant only as an answer to a request (answer_approval decision `grant`, with
 * allow's code rules; the broker checks the spec with checkGrant). Calls a grant covers run
 * without waking Fishball: the broker asks cover() before any notice.
 * - Kinds: an exact call (same session, tool and arguments, by digest of the canonical JSON, may
 *   repeat), or a command prefix for the shell tools in GRANT.commandArgument only, matched on the
 *   raw command text, so `npm test*` also covers `npm test && git push` (an accepted risk).
 * - Every grant needs an end time in the future; there is no longest lifetime and no cap on how
 *   many are active (Q-r11-grant-bounds).
 * - Ending: at the end time (a timer, and also any match or start that finds it past), your Revoke,
 *   Fishball's revoke_grant, the session taken back or released, or the session gone from DSH.
 * - Paused, not ended, while Fishball is not live or Permission requests is off (Q-r11-grants-off):
 *   the broker does not ask cover() then, so the calls go to the session's stock prompt; the end
 *   time does not move.
 * - Durable: grants survive a restart until they end. Ended grants are kept to auditEntriesKept,
 *   newest first, as the audit lists are. Each grant counts its uses and its last use.
 * Creating and revoking leave `decisions` rows (Q-r11-audit-user: your Revoke too).
 */
import { randomUUID } from 'node:crypto'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { APPROVAL, CHANGED_BY, DECISION_ACTION, DECISION_OK, GRANT, GRANT_END, GRANT_ERROR, GRANT_KIND, GRANT_STATUS, MANAGED_CHANGE } from './constants.js'
import { AuditLog } from './audit.js'
import { argumentsDigest } from './passes.js'
import { diagnosticOf } from './errors.js'
import { JSON_OUTPUT, ok, refused } from './tool-results.js'

export const GRANT_TOOL = Object.freeze({ list: 'list_grants', revoke: 'revoke_grant' })

/** How each way of ending is stored; a session DSH no longer finds ends `ended` with no endedBy (§11). */
const END_STATUS = Object.freeze({
  [GRANT_END.user]: GRANT_STATUS.revoked,
  [GRANT_END.fishball]: GRANT_STATUS.revoked,
  [GRANT_END.expiry]: GRANT_STATUS.expired,
  [GRANT_END.takeBack]: GRANT_STATUS.ended,
  [GRANT_END.release]: GRANT_STATUS.ended,
})
/** How a session leaving management ends its grants (§5e); a session DSH no longer finds has no change. */
const END_BY_CHANGE = Object.freeze({ [MANAGED_CHANGE.takeBack]: GRANT_END.takeBack, [MANAGED_CHANGE.release]: GRANT_END.release })
/** Who revoked, as a decisions row names them. */
const REVOKED_BY = Object.freeze({ [GRANT_END.user]: CHANGED_BY.user, [GRANT_END.fishball]: CHANGED_BY.fishball })

const TEXT = Object.freeze({
  listDescription: 'List your active standing grants: for each, its id, session, tool, kind (an exact call, or a command prefix), end time, how often it was used, and whether it is paused (while you are not live or Permission requests is off).',
  revokeDescription: 'End one of your standing grants before its end time, e.g. when the user narrows or withdraws the allowance it relied on. Its session\'s calls then come to you again.',
  grantIdArg: 'The grant id (grt_…), from list_grants or your answer_approval.',
  reasonArg: 'Why you revoke it, in one sentence (kept in your decisions audit).',
})

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** The command text a prefix grant matches for this call, or undefined for a tool that has none. */
export function commandTextOf(toolName, args) {
  if (!Object.hasOwn(GRANT.commandArgument, toolName) || !isPlainObject(args)) return undefined
  const text = args[GRANT.commandArgument[toolName]]
  return typeof text === 'string' ? text : undefined
}

/** A prefix as Fishball wrote it, without the one trailing wildcard that is only notation. */
const prefixOf = (text) => (text.endsWith(GRANT.wildcard) ? text.slice(0, -GRANT.wildcard.length) : text)

/**
 * Check Fishball's grant against the call it answers (the §7a.3 code rules for `grant`, §7a.8).
 * Pure: the caller has already checked allow's rules (low risk, a reason, complete arguments).
 * @param spec - answer_approval's `grant`: { kind, prefix?, expires_at }.
 * @param call - { toolName, args }: the asking call; a prefix comes from its command text (§9).
 * @param nowMs - the current time.
 * @returns { error: GRANT_ERROR } or { kind, prefix?, expiresAt } (expiresAt as ISO time).
 */
export function checkGrant(spec, { toolName, args }, nowMs) {
  if (!isPlainObject(spec) || !Object.values(GRANT_KIND).includes(spec.kind)) return { error: GRANT_ERROR.invalid }
  if (spec.expires_at === undefined || spec.expires_at === null || spec.expires_at === '') return { error: GRANT_ERROR.expiresRequired }
  const endsMs = typeof spec.expires_at === 'string' ? Date.parse(spec.expires_at) : Number.NaN
  if (Number.isNaN(endsMs)) return { error: GRANT_ERROR.expiresInvalid }
  if (endsMs <= nowMs) return { error: GRANT_ERROR.expiresPast }
  const expiresAt = new Date(endsMs).toISOString()
  if (spec.kind === GRANT_KIND.exact) return spec.prefix === undefined ? { kind: spec.kind, expiresAt } : { error: GRANT_ERROR.invalid }
  if (!Object.hasOwn(GRANT.commandArgument, toolName)) return { error: GRANT_ERROR.prefixNotShell }
  const prefix = typeof spec.prefix === 'string' ? prefixOf(spec.prefix) : ''
  if (prefix.trim().length === 0) return { error: GRANT_ERROR.prefixEmpty }
  if (!(commandTextOf(toolName, args) ?? '').startsWith(prefix)) return { error: GRANT_ERROR.prefixNotInCall }
  return { kind: spec.kind, prefix, expiresAt }
}

/** Whether a stored grant covers this call (its session and tool already match). */
function matches(record, toolName, args) {
  if (record.kind === GRANT_KIND.exact) return record.argumentsDigest === argumentsDigest(args)
  return (commandTextOf(toolName, args) ?? '').startsWith(record.prefix)
}

export class Grants {
  #store
  #logger
  #readLimits
  #isPaused
  #onChange
  #decisions
  #timer
  /** Writes run one after another, so a use count or an end is never lost to an interleaved write. */
  #changes = Promise.resolve()

  /**
   * @param store - Store (`grants` and `decisions`). @param logger - plugin logger.
   * @param deps.readLimits - () => limits (auditEntriesKept, rationaleChars).
   * @param deps.isPaused - () => whether grants are paused now (Fishball not live, or Permission requests off).
   * @param deps.onChange - called after any grant changes (the state feed publishes).
   */
  constructor(store, logger, { readLimits, isPaused, onChange }) {
    this.#store = store
    this.#logger = logger
    this.#readLimits = readLimits
    this.#isPaused = isPaused
    this.#onChange = onChange
    this.#decisions = new AuditLog(() => store.decisions, () => readLimits().auditEntriesKept)
  }

  /**
   * At start (§11 "Restart"): a grant whose end time passed while DSH was down ends as expired,
   * and one whose session is no longer managed ends too (its end was not written); then the
   * timer is armed for the next end time.
   * @param isManaged - (sessionId) => whether Fishball manages that session.
   */
  async reconcile(isManaged) {
    const now = Date.now()
    for (const [id, record] of this.#active()) {
      if (Date.parse(record.expiresAt) <= now) await this.#end(id, GRANT_END.expiry)
      else if (!isManaged(record.sessionId)) await this.#end(id, undefined)
    }
    this.#arm()
  }

  /** Stop the expiry timer (the row unloads). */
  stop() {
    clearTimeout(this.#timer)
  }

  /** A fresh grant id, minted before the grant is written so the request's audit row can name it. */
  mintId() {
    return GRANT.idPrefix + randomUUID().replace(/-/g, '')
  }

  /**
   * Write one grant Fishball created, and its `decisions` row.
   * @param grant - { id, sessionId, toolName, kind, prefix?, args, expiresAt, requestId, rationale }:
   *   checked by checkGrant; `args` gives an exact grant its digest and is not stored.
   */
  async create({ id, sessionId, toolName, kind, prefix, args, expiresAt, requestId, rationale }) {
    const now = new Date().toISOString()
    const text = rationale.slice(0, this.#readLimits().rationaleChars)
    await this.#serial(() => this.#store.grants.put(id, {
      sessionId, kind, toolName,
      ...(kind === GRANT_KIND.exact ? { argumentsDigest: argumentsDigest(args) } : { prefix }),
      createdAt: now, expiresAt, requestId, ...(text ? { rationale: text } : {}), uses: 0, status: GRANT_STATUS.active,
    }))
    this.#arm()
    this.#onChange()
    await this.#decide({ action: DECISION_ACTION.grant, sessionId, by: CHANGED_BY.fishball, target: id, rationale: text })
  }

  /**
   * The active grant that covers this call, if any. A grant found past its end time ends here
   * (§9: "expired ones end at the next start or match") and covers nothing. The caller asks only
   * while grants are not paused.
   * @param sessionId - the session the user sees. @param args - the parsed arguments, or undefined.
   * @returns { id, record } or undefined.
   */
  cover(sessionId, toolName, args) {
    if (args === undefined) return undefined
    const now = Date.now()
    for (const [id, record] of this.#active()) {
      if (record.sessionId !== sessionId || record.toolName !== toolName) continue
      if (Date.parse(record.expiresAt) <= now) {
        void this.#end(id, GRANT_END.expiry).catch(this.#warn('grant expiry'))
        continue
      }
      if (matches(record, toolName, args)) return { id, record }
    }
    return undefined
  }

  /** Count one covered call (§7a.8: how often it was used, and when last). A write failure is logged. */
  async use(id) {
    try {
      await this.#serial(async () => {
        const record = this.#store.grants.get(id)
        if (record !== undefined) await this.#store.grants.put(id, { ...record, uses: record.uses + 1, lastUsedAt: new Date().toISOString() })
      })
      this.#onChange()
    } catch (error) {
      this.#warn('grant use count')(error)
    }
  }

  /**
   * Revoke one grant: your Revoke (GRANT_END.user) or Fishball's revoke_grant (GRANT_END.fishball).
   * Either leaves a `decisions` row.
   * @returns undefined when revoked, else GRANT_ERROR.unknown or GRANT_ERROR.ended.
   */
  async revoke(id, by, reason) {
    const record = this.#store.grants.get(id)
    if (record === undefined) return GRANT_ERROR.unknown
    if (record.status !== GRANT_STATUS.active) return GRANT_ERROR.ended
    // One whose end time just passed is already over: it ends as expired, not as revoked.
    if (Date.parse(record.expiresAt) <= Date.now()) {
      await this.#end(id, GRANT_END.expiry)
      return GRANT_ERROR.ended
    }
    if (!(await this.#end(id, by))) return GRANT_ERROR.ended
    const rationale = typeof reason === 'string' ? reason.trim().slice(0, this.#readLimits().rationaleChars) : ''
    await this.#decide({ action: DECISION_ACTION.revoke, sessionId: record.sessionId, by: REVOKED_BY[by], target: id, rationale })
    return undefined
  }

  /**
   * End every active grant of a session that left management (§5e, item 19).
   * @param change - MANAGED_CHANGE.takeBack or .release; undefined when DSH no longer finds the session.
   */
  async endSession(sessionId, change) {
    const endedBy = change === undefined ? undefined : END_BY_CHANGE[change]
    for (const [id, record] of this.#active()) if (record.sessionId === sessionId) await this.#end(id, endedBy)
  }

  /** Active grants for the browser (§10e "Active grants beside the pile"), newest first. */
  snapshot() {
    const paused = this.#isPaused()
    return this.#newestFirst().map(([grantId, record]) => ({
      grantId, sessionId: record.sessionId, toolName: record.toolName, kind: record.kind, prefix: record.prefix ?? null,
      createdAt: record.createdAt, expiresAt: record.expiresAt, uses: record.uses, lastUsedAt: record.lastUsedAt ?? null, paused,
    }))
  }

  /** Fishball's list_grants and revoke_grant (scope P; its Permission requests plugin). */
  registerTools(register) {
    register(defineTool({
      name: GRANT_TOOL.list,
      description: TEXT.listDescription,
      parameters: {},
      output: JSON_OUTPUT,
      execute: async () => ok({
        grants: this.snapshot().map((grant) => ({
          grant_id: grant.grantId, session_id: grant.sessionId, tool: grant.toolName, kind: grant.kind,
          ...(grant.prefix === null ? {} : { prefix: grant.prefix }), expires_at: grant.expiresAt, uses: grant.uses,
          ...(grant.lastUsedAt === null ? {} : { last_used_at: grant.lastUsedAt }), paused: grant.paused,
        })),
      }),
    }))
    register(defineTool({
      name: GRANT_TOOL.revoke,
      description: TEXT.revokeDescription,
      parameters: {
        grant_id: { type: 'string', required: true, description: TEXT.grantIdArg },
        reason: { type: 'string', required: true, description: TEXT.reasonArg },
      },
      output: JSON_OUTPUT,
      execute: async ({ grant_id: id, reason }) => {
        const code = await this.revoke(id, GRANT_END.fishball, reason)
        return code === undefined ? ok({ grantId: id, revoked: true }) : refused(code)
      },
    }))
  }

  /** [id, record] of every active grant. */
  #active() {
    return [...this.#store.grants.entries()].filter(([, record]) => record.status === GRANT_STATUS.active)
  }

  #newestFirst() {
    return this.#active().sort(([, a], [, b]) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
  }

  /**
   * End one active grant once, keep the ended ones to auditEntriesKept, and re-arm the timer.
   * @param endedBy - a GRANT_END, or undefined for a session DSH no longer finds (`ended`, §11).
   * @returns whether it was still active.
   */
  async #end(id, endedBy) {
    const ended = await this.#serial(async () => {
      const record = this.#store.grants.get(id)
      if (record === undefined || record.status !== GRANT_STATUS.active) return false
      const status = endedBy === undefined ? GRANT_STATUS.ended : END_STATUS[endedBy]
      await this.#store.grants.put(id, { ...record, status, ...(endedBy === undefined ? {} : { endedBy }), endedAt: new Date().toISOString() })
      await this.#pruneEnded()
      return true
    })
    if (ended) {
      this.#arm()
      this.#onChange()
    }
    return ended
  }

  /** Ended grants beyond auditEntriesKept leave, oldest end first; active ones always stay. */
  async #pruneEnded() {
    const ended = [...this.#store.grants.entries()].filter(([, record]) => record.status !== GRANT_STATUS.active)
      .sort(([, a], [, b]) => (a.endedAt < b.endedAt ? 1 : a.endedAt > b.endedAt ? -1 : 0))
    for (const [id] of ended.slice(this.#readLimits().auditEntriesKept)) await this.#store.grants.delete(id)
  }

  /**
   * One timer for the nearest end time. setTimeout cannot wait longer than APPROVAL.maxTimerMs
   * (about 24.8 days), and grants have no longest lifetime, so a far end time is reached in steps.
   */
  #arm() {
    clearTimeout(this.#timer)
    const next = Math.min(...this.#active().map(([, record]) => Date.parse(record.expiresAt)))
    if (!Number.isFinite(next)) return
    this.#timer = setTimeout(() => void this.#expireDue().catch(this.#warn('grant expiry')), Math.min(Math.max(0, next - Date.now()), APPROVAL.maxTimerMs))
    this.#timer.unref?.()
  }

  async #expireDue() {
    const now = Date.now()
    for (const [id, record] of this.#active()) if (Date.parse(record.expiresAt) <= now) await this.#end(id, GRANT_END.expiry)
    this.#arm()
  }

  #serial(change) {
    const run = this.#changes.then(change)
    this.#changes = run.catch(() => {})
    return run
  }

  /** One `decisions` row; a failed write is logged, the grant change itself stands. */
  async #decide({ action, sessionId, by, target, rationale }) {
    try {
      await this.#decisions.append({ action, sessionId, by, target, ...(rationale ? { rationale } : {}), at: new Date().toISOString(), outcome: DECISION_OK }, [action])
      this.#onChange()
    } catch (error) {
      this.#warn('decision audit')(error)
    }
  }

  #warn(label) {
    return (error) => this.#logger.warn('%s failed (%s)', label, diagnosticOf(error))
  }
}
