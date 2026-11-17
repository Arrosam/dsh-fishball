/**
 * Standing grants (design §7a.8 as V3 keeps it; task C-WIRE-2, ported from the V2 `src/grants.js`).
 * A principal creates one only by answering a permission offer with `grant` (allow's rules plus a
 * valid grant); later calls it covers run without an offer.
 * - Kinds: an exact call (same session, tool and arguments, by digest of the canonical JSON, any
 *   key order), or a command prefix for the shell tools in GRANT.commandArgument only, matched on
 *   the raw command text, so `npm test` also covers `npm test && git push` (an accepted risk).
 * - Every grant ends: at its end time (a timer, and any match that finds it past), `grant_revoke`,
 *   or its session leaving management (Take back, `session_release`, revocation). No longest
 *   lifetime and no cap on how many are active (the user's answers, Q-r11-grant-bounds).
 * - Never paused: a grant covers whether its managing agent is connected or not (the user's answer,
 *   2026-11-17: "Still covers"); `paused` is always false.
 * - Durable: active grants survive a restart until they end. An ended grant's record is deleted at
 *   once: V3 keeps no audit (the user's answer, 2026-11-17: delete the V2 audit). Its id is kept in
 *   memory for the connector's life, so a second `grant_revoke` answers `ended` (V2's word) and not
 *   `unknown`; after a restart it is `unknown`, as the offer desk's settled set is (Q2, 2026-11-14).
 */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { GRANT_KIND, REFUSAL } from '../../mcp-schema/index.js'
import { diagnosticOf } from '../errors.js'
import { serialChain } from '../routing/support.js'
import { argumentsDigest } from './call-log.js'
import { GRANT, GRANT_STORE, LOG, REQUEST_ID } from './constants.js'

const record = z.object({
  sessionId: z.string().min(1),
  toolName: z.string().min(1),
  kind: z.enum(Object.values(GRANT_KIND)),
  argumentsDigest: z.string().optional(),
  prefix: z.string().optional(),
  createdAt: z.number().int(),
  expiresAt: z.number().int(),
  uses: z.number().int().nonnegative(),
  lastUsedAt: z.number().int().optional(),
})

/** Opens the grants' durable table (one storage domain of the connector). */
export async function openGrantStore(ctx, { defineDomain, domainTable }) {
  const domain = await ctx.storageDomain.open(defineDomain({
    name: GRANT_STORE.domain, version: GRANT_STORE.version, layout: GRANT_STORE.layout,
    tables: { [GRANT_STORE.table]: domainTable(record) },
  }))
  return { table: domain.table(GRANT_STORE.table), close: () => domain.close() }
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** The command text a prefix grant matches for this call, or undefined for a tool that has none. */
function commandTextOf(toolName, args) {
  if (!Object.hasOwn(GRANT.commandArgument, toolName) || !isPlainObject(args)) return undefined
  const text = args[GRANT.commandArgument[toolName]]
  return typeof text === 'string' ? text : undefined
}

/** A prefix as written, without the one trailing wildcard that is only notation. */
const prefixOf = (text) => (text.endsWith(GRANT.wildcard) ? text.slice(0, -GRANT.wildcard.length) : text)

/**
 * The grant spec checked against the call it answers (§7a.3 rules for `grant`). The payload rules
 * (mcp/tools/payload-rules.js) already checked its shape, end time and prefix bound; this checks
 * what needs the call: a prefix only for a shell tool, and taken from this call's command.
 * @returns `{error}` (a K1 REFUSAL code) or `{kind, prefix?, expiresAt}`
 */
export function checkGrant(spec, { toolName, args }) {
  if (spec.kind === GRANT_KIND.exact) return { kind: spec.kind, expiresAt: spec.expiresAt }
  if (!Object.hasOwn(GRANT.commandArgument, toolName)) return { error: REFUSAL.prefixNotShellTool }
  const prefix = prefixOf(spec.prefix)
  if (prefix.trim().length === 0) return { error: REFUSAL.prefixEmpty }
  if (!(commandTextOf(toolName, args) ?? '').startsWith(prefix)) return { error: REFUSAL.prefixNotInCall }
  return { kind: spec.kind, prefix, expiresAt: spec.expiresAt }
}

/** Whether a stored grant covers this call (its session and tool already match). */
function matches(stored, toolName, args) {
  if (stored.kind === GRANT_KIND.exact) return stored.argumentsDigest === argumentsDigest(args)
  return (commandTextOf(toolName, args) ?? '').startsWith(stored.prefix)
}

/**
 * @param {object} deps
 * @param deps.table - the grants table (`openGrantStore`)
 * @param deps.managerOf - K1c `ManagedState.managerOf`: a grant belongs to its session's manager
 * @param {() => number} deps.now - epoch ms
 * @param deps.timers - `{setTimeout, clearTimeout}`, the globals by default
 * @param deps.logger - `{warn}`
 */
export function createGrants({ table, managerOf, now, timers = globalThis, logger }) {
  const warn = (line) => (error) => logger.warn(LOG.format, line, diagnosticOf(error))
  // Writes run one after another, so a use count or an end is never lost to an interleaved write.
  const serial = serialChain()
  /** Ids of grants that ended in this connector life (see the module comment). */
  const ended = new Set()
  let timer
  let stopped = false
  const entries = () => [...table.entries()]

  function arm() {
    timers.clearTimeout(timer)
    if (stopped) return
    // A loop, not Math.min(...all): any number of grants may be active (no cap).
    let next = Number.POSITIVE_INFINITY
    for (const [, stored] of entries()) next = Math.min(next, stored.expiresAt)
    if (!Number.isFinite(next)) return
    timer = timers.setTimeout(() => { void expireDue().catch(warn(LOG.grantExpiryFailed)) }, Math.min(Math.max(0, next - now()), GRANT.maxTimerMs))
    timer?.unref?.()
  }

  /** Ends the listed grants (one failed delete does not stop the others), then re-arms. */
  async function endAll(ids) {
    try {
      for (const id of ids) {
        ended.add(id)
        await serial(() => table.delete(id)).catch(warn(LOG.grantWriteFailed))
      }
    } finally {
      arm()
    }
  }
  const expireDue = () => endAll(entries().filter(([, stored]) => stored.expiresAt <= now()).map(([id]) => id))

  return Object.freeze({
    /** At start: a grant whose end passed while DSH was down, or whose session is unmanaged, ends; then the timer is armed. */
    async reconcile() {
      await endAll(entries().filter(([, stored]) => stored.expiresAt <= now() || managerOf(stored.sessionId) === undefined).map(([id]) => id))
    },

    /**
     * Writes one grant for a managed session, before the offer is settled, so an answer never
     * names a grant a failed write lost. Inside the write queue the session must still be managed.
     * @returns the grant id, or undefined when the session left management meanwhile
     */
    async create({ sessionId, toolName, args, spec }) {
      const id = REQUEST_ID.grant + randomUUID().replace(REQUEST_ID.uuidSeparator, '')
      const written = await serial(async () => {
        if (managerOf(sessionId) === undefined) return false
        await table.put(id, {
          sessionId, toolName, kind: spec.kind,
          ...(spec.kind === GRANT_KIND.exact ? { argumentsDigest: argumentsDigest(args) } : { prefix: spec.prefix }),
          createdAt: now(), expiresAt: spec.expiresAt, uses: 0,
        })
        return true
      })
      if (written) arm()
      return written ? id : undefined
    },

    /** A grant whose offer ended before the answer reached it: it never took effect. */
    discard: (id) => endAll([id]),

    /**
     * The grant id that covers this call, or undefined. A grant found past its end ends here and
     * covers nothing. A covered call counts one use (a failed count is logged; the call still runs).
     */
    cover(sessionId, toolName, args) {
      if (args === undefined) return undefined
      for (const [id, stored] of entries()) {
        if (stored.sessionId !== sessionId || stored.toolName !== toolName) continue
        if (stored.expiresAt <= now()) { void endAll([id]); continue }
        if (!matches(stored, toolName, args)) continue
        void serial(async () => {
          const current = table.get(id)
          if (current !== undefined) await table.put(id, { ...current, uses: current.uses + 1, lastUsedAt: now() })
        }).catch(warn(LOG.grantWriteFailed))
        return id
      }
      return undefined
    },

    /** `grant_revoke`: `unknown` for an id never issued here, `ended` for one already over. */
    async revoke(id) {
      const stored = table.get(id)
      if (stored === undefined) return ended.has(id) ? REFUSAL.grantEnded : REFUSAL.grantUnknown
      await endAll([id])
      // One whose end time had passed was already over: it ends here, as an expiry, not a revoke.
      return stored.expiresAt <= now() ? REFUSAL.grantEnded : undefined
    },

    /**
     * Every grant of a session nobody manages ends (§5e): run on each managed-state change, so
     * Take back, `session_release` and a revocation all end them, and handing the session over
     * again does not revive them. Read in the write queue, after any grant still being written.
     */
    endUnmanaged: () => serial(async () => entries().filter(([, stored]) => managerOf(stored.sessionId) === undefined).map(([id]) => id)).then(endAll),

    /** `grants_list`'s rows (K1 `grantSummary`), newest first; never paused (see the module comment). */
    list: () => entries().filter(([, stored]) => stored.expiresAt > now()).sort(([, a], [, b]) => b.createdAt - a.createdAt).map(([grantId, stored]) => Object.freeze({
      grantId, sessionId: stored.sessionId, toolName: stored.toolName, kind: stored.kind,
      ...(stored.kind === GRANT_KIND.prefix ? { prefix: stored.prefix } : {}),
      expiresAt: stored.expiresAt, uses: stored.uses, ...(stored.lastUsedAt === undefined ? {} : { lastUsedAt: stored.lastUsedAt }), paused: false,
    })),

    /** The session of a grant this connector holds, or undefined (grant_revoke's authority check). */
    sessionOf: (id) => table.get(id)?.sessionId,

    stop() {
      stopped = true
      timers.clearTimeout(timer)
    },
  })
}
