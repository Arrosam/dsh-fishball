/**
 * Watchdog's behaviour, over injected ports so the cases can drive it without a DSH (notes §2–§3;
 * the user's decisions of 2026-11-20):
 * - Fishball's four tools (`watchdog_brief`, `_refine`, `_pause`, `_resume`) are data operations
 *   that start no run. Only the session's current manager may use them;
 * - the permission delegate: Watchdog `claims` a session it holds an unpaused brief for, from the
 *   principal that still manages it; each request is judged against the purpose and the scope
 *   (allow → one call, reject only when beyond the purpose and dangerous, anything else → pass to
 *   the manager; escalation to the user is deferred, so high risk passes too);
 * - the patrol: one timer per supervised session, `minCheckIntervalSeconds` apart, never moved by a
 *   refine. A patrol with no new messages since the watermark judges nothing (no tokens spent);
 * - drift, found by either: the session's turn is stopped (it still takes the manager's messages)
 *   and the manager gets `dsh-connector-amenities.drift` (the user: "Emit a contributed event to
 *   Fishball and suspend the session").
 * No failure design (notes §2.6): a judgement that throws, times out or answers nonsense is a pass,
 * and a failed patrol is logged and tried again at the next tick.
 *
 * @param deps.store - store.js
 * @param deps.services - `() => {sessions, emit} | undefined`: the connector's `dshConnectorSessions`
 *   and the bound `dshConnectorTools.emit`, while both are there
 * @param deps.judge - judge.js `{judge(brief, prompt, signal) → Promise<{verdict, reason}>}`
 * @param deps.config - `{minCheckIntervalSeconds, readMaxMessages, readMaxBytes, checkTimeoutSeconds}`
 * @param deps.timers - `{setTimeout, clearTimeout}`; @param deps.now - epoch ms; @param deps.logger - `{warn}`
 * @param deps.defer - runs a function after the current request is answered (setImmediate)
 */
import { CODE, DRIFT_EVENT, DURING, JUDGE, LOG, TEXT, TOOL, VERDICT, WATCHDOG } from './constants.js'

const MS_PER_SECOND = 1000
const ok = (data) => Object.freeze({ ok: true, data })
const refused = (code) => Object.freeze({ ok: false, code })
const trimmed = (value) => (typeof value === 'string' ? value.trim() : '')
const PASS = Object.freeze({ verdict: VERDICT.pass })
const clip = (text, chars) => ([...text].length <= chars ? text : [...text].slice(0, chars - 1).join('') + '…')

export function createWatchdog({ store, services, judge, config, timers = globalThis, now = Date.now, logger, defer = setImmediate }) {
  const warn = (line, error) => logger.warn(LOG.format, WATCHDOG.name, line, error?.code ?? error?.name ?? String(error))
  /** sessionId → patrol timer. */
  const patrols = new Map()
  let closed = false

  // ------------------------------------------------------------------ supervision
  /** The brief Watchdog acts on for a root session now: unpaused and still from its manager. */
  function activeBrief(sessionId) {
    const brief = store.get(sessionId)
    if (brief === undefined || brief.paused) return undefined
    const manager = services()?.sessions.managerOf(sessionId)
    return manager === brief.principalKey ? brief : undefined
  }

  /**
   * The supervised session's messages since the watermark, as one prompt section, and the new
   * watermark. The read keeps the newest messages, so a `truncated` read whose oldest kept message
   * is still new says older new ones were left out.
   */
  async function newMessages(brief) {
    const read = await services().sessions.read({ sessionId: brief.sessionId, maxMessages: config.readMaxMessages, maxBytes: config.readMaxBytes })
    const fresh = read.messages.filter((message) => message.seq > brief.watermark)
    const watermark = fresh.reduce((max, message) => Math.max(max, message.seq), brief.watermark)
    const text = fresh.map((message) => JUDGE.message(message.role, message.text)).join('\n')
    const cut = read.truncated && fresh.length === read.messages.length && fresh.length > 0
    return { count: fresh.length, watermark, section: JUDGE.messages(text) + (cut ? '\n' + JUDGE.truncated : '') }
  }

  /** One judgement under `checkTimeoutSeconds`, joined with the caller's signal. */
  async function judged(brief, rules, section, extra, signal) {
    const timeout = AbortSignal.timeout(config.checkTimeoutSeconds * MS_PER_SECOND)
    const joined = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
    const prompt = [JUDGE.intro, JUDGE.purpose(brief.purpose), JUDGE.scope(brief.scope), section, ...(extra === undefined ? [] : [extra]), rules].join('\n\n')
    return judge.judge(brief, prompt, joined)
  }

  /** Drift: stop the turn and tell the manager. Each step is logged on failure; neither undoes the other. */
  async function drifted(brief, during, reason) {
    const { sessions, emit } = services() ?? {}
    try { await sessions?.stop({ sessionId: brief.sessionId }) } catch (error) { warn(LOG.stopFailed, error) }
    const sent = await emit?.({
      event: DRIFT_EVENT.name, sessionId: brief.sessionId,
      payload: { sessionId: brief.sessionId, during, reason },
      summary: clip(TEXT.drift(during, reason), DRIFT_EVENT.summaryChars),
    }).catch((error) => ({ ok: false, code: error?.code ?? error?.name }))
    if (sent?.ok !== true) warn(LOG.emitRefused, sent?.code ?? 'no-service')
  }

  /** The delegate's `decide` (host-services/sessions.d.ts): see the module comment. */
  async function decide(request, { signal } = {}) {
    const brief = activeBrief(request.sessionId)
    if (brief === undefined) return PASS
    try {
      const fresh = await newMessages(brief)
      const answer = await judged(brief, JUDGE.permissionRules, fresh.section, JUDGE.permission(request.descriptor), signal)
      await store.update(brief.sessionId, { watermark: fresh.watermark })
      const reason = trimmed(answer?.reason)
      if (answer?.verdict === VERDICT.drifted && reason !== '') {
        // Stopped only once this request is answered: Stop aborts the request's own signal, and an
        // aborted request is "cancelled" (no settlement, no reason for the agent), not this reject.
        defer(() => { void drifted(brief, DURING.permission, reason) })
        return Object.freeze({ verdict: VERDICT.reject, reason })
      }
      if ((answer?.verdict === VERDICT.allow || answer?.verdict === VERDICT.reject) && reason !== '') return Object.freeze({ verdict: answer.verdict, reason })
      return PASS
    } catch (error) {
      warn(LOG.judgeFailed, error)
      return PASS
    }
  }

  // ------------------------------------------------------------------ patrol
  function disarm(sessionId) {
    timers.clearTimeout(patrols.get(sessionId))
    patrols.delete(sessionId)
  }
  /** One timer per supervised session, from now (brief, resume, start). */
  function arm(sessionId) {
    disarm(sessionId)
    if (closed) return
    const timer = timers.setTimeout(() => { void patrol(sessionId) }, config.minCheckIntervalSeconds * MS_PER_SECOND)
    timer?.unref?.()
    patrols.set(sessionId, timer)
  }
  async function patrol(sessionId) {
    disarm(sessionId)
    const stored = store.get(sessionId)
    if (closed || stored === undefined || stored.paused) return
    try {
      const brief = activeBrief(sessionId)
      if (brief === undefined) return
      const fresh = await newMessages(brief)
      // Nothing new happened: nothing to judge, no tokens spent.
      if (fresh.count === 0) return
      const answer = await judged(brief, JUDGE.patrolRules, fresh.section, undefined, undefined)
      await store.update(sessionId, { watermark: fresh.watermark })
      const reason = trimmed(answer?.reason)
      if (answer?.verdict === VERDICT.drifted && reason !== '') await drifted(brief, DURING.patrol, reason)
    } catch (error) {
      warn(LOG.patrolFailed, error)
    } finally {
      const after = store.get(sessionId)
      if (!closed && after !== undefined && !after.paused && !patrols.has(sessionId)) arm(sessionId)
    }
  }

  // ------------------------------------------------------------------ Fishball's tools
  /**
   * The root session a manager names, if `principalKey` manages it; else the refusal.
   * @returns `{sessionId}` or `{refusal}`
   */
  function managedBy(sessionId, principalKey) {
    const sessions = services()?.sessions
    if (sessions === undefined || typeof sessionId !== 'string' || sessionId === '') return { refusal: refused(CODE.forbidden) }
    const root = sessions.rootOf(sessionId)
    return sessions.managerOf(root) === principalKey ? { sessionId: root } : { refusal: refused(CODE.forbidden) }
  }
  /** The caller's own brief of a session it manages (a brief from an earlier manager is not its). */
  function ownBrief(sessionId, principalKey) {
    const managed = managedBy(sessionId, principalKey)
    if (managed.refusal !== undefined) return managed
    const brief = store.get(managed.sessionId)
    return brief === undefined || brief.principalKey !== principalKey ? { refusal: refused(CODE.notBriefed) } : { brief }
  }
  const view = (brief) => ({ sessionId: brief.sessionId, purpose: brief.purpose, scope: brief.scope, paused: brief.paused })

  async function brief({ sessionId, purpose, scope }, principalKey) {
    const managed = managedBy(sessionId, principalKey)
    if (managed.refusal !== undefined) return managed.refusal
    if (trimmed(purpose) === '') return refused(CODE.emptyPurpose)
    const existing = store.get(managed.sessionId)
    if (existing?.principalKey === principalKey) return refused(CODE.conflict)
    // A brief of an earlier manager is replaced: it no longer speaks for anyone.
    const record = {
      sessionId: managed.sessionId, principalKey, purpose: trimmed(purpose), scope: trimmed(scope), paused: false,
      watermark: -1, sideSessionId: null, briefedAt: now(),
    }
    await store.put(record)
    arm(managed.sessionId)
    return ok(view(record))
  }

  async function refine({ sessionId, purpose, scope }, principalKey) {
    const own = ownBrief(sessionId, principalKey)
    if (own.refusal !== undefined) return own.refusal
    if (purpose === undefined && scope === undefined) return refused(CODE.nothingToRefine)
    if (purpose !== undefined && trimmed(purpose) === '') return refused(CODE.emptyPurpose)
    const change = { ...(purpose === undefined ? {} : { purpose: trimmed(purpose) }), ...(scope === undefined ? {} : { scope: trimmed(scope) }) }
    return ok(view(await store.update(own.brief.sessionId, change)))
  }

  /** "Pause stops the session first" (notes §3). */
  async function pause({ sessionId }, principalKey) {
    const own = ownBrief(sessionId, principalKey)
    if (own.refusal !== undefined) return own.refusal
    await services().sessions.stop({ sessionId: own.brief.sessionId })
    disarm(own.brief.sessionId)
    return ok(view(await store.update(own.brief.sessionId, { paused: true })))
  }

  async function resume({ sessionId }, principalKey) {
    const own = ownBrief(sessionId, principalKey)
    if (own.refusal !== undefined) return own.refusal
    const updated = await store.update(own.brief.sessionId, { paused: false })
    arm(own.brief.sessionId)
    return ok(view(updated))
  }

  const handlers = Object.freeze({ [TOOL.brief]: brief, [TOOL.refine]: refine, [TOOL.pause]: pause, [TOOL.resume]: resume })

  return Object.freeze({
    /** Arms a patrol for every unpaused stored brief (a restart keeps supervising). */
    start() { for (const stored of store.list()) if (!stored.paused) arm(stored.sessionId) },
    delegate: Object.freeze({ name: WATCHDOG.delegate, claims: (sessionId) => activeBrief(sessionId) !== undefined, decide }),
    /** `(toolName, args, principalKey) → ContributedResult` */
    call: (toolName, args, principalKey) => handlers[toolName](args ?? {}, principalKey),
    /** For the cases: fire a patrol now. */
    patrol,
    close() {
      closed = true
      for (const sessionId of [...patrols.keys()]) disarm(sessionId)
    },
  })
}
