/**
 * `fishballConnectorHandover` (task C-ROUTE; K3 `host-services/handover.d.ts`; design §3.6;
 * R-CON-11, R-ROUTE-05, R-UI-05, R-UI-10; HAND-DT-01, HAND-DT-02, HAND-EP-01).
 *
 * A host-only Cordis service of this process: it is provided on a context and has no MCP tool, no
 * HTTP route and no token (HAND-EP-01). It exposes exactly K3's members, so it has no session read,
 * approval or answer power.
 *
 * Who is listed (K3 `handover.d.ts` `HandoverPrincipal`, `principals()`: "every token entry of the
 * connector"): every entry `TokenRegistry.list()` lists, paired or not.
 * - A paired entry's `key` is its pair's K1 `PrincipalKey`, the key `managed()` and `handOver` use.
 * - An unpaired entry's `key` is its opaque K1 `EntryKey`, with `id: null`, `name: null`,
 *   `paired: false` and `online: false` (it has no pair, so no listen stream). `handOver` with it
 *   answers `no-fishball` (K3 DECIDED #11), because no pair has that principal key.
 * So an entry's `key` changes exactly once, from its EntryKey to its PrincipalKey, when it pairs;
 * K3's "stable for the life of the token entry" holds from pairing on (Fishball 2026-11-14; K3's
 * note at the W3 merge, DECIDED #W3-3). A pair's key never changes while the entry lives (R-ID-09).
 * Neither is ever a token value, a ref or a label (K3, HAND-EP-01 row 5). The Hand over control
 * itself shows only `enabled && paired` entries (K3, R-UI-10); that filter is embed-UI's.
 *
 * Order: the order of the entries in the connector's native settings list (K3 README, PROPOSED),
 * which `TokenRegistry.list()` follows; a rename, a connection change or a pairing never moves one.
 */
import { EVENT_TYPE, RETIREMENT_REASON } from '../../mcp-schema/index.js'
import { checkedFields } from '../routing/support.js'
import { HANDOVER_REFUSAL, HANDOVER_SERVICE, MISUSE, NO_NOTE } from './constants.js'

const refusal = (code) => Object.freeze({ ok: false, code })

/**
 * The `handover` / `takeback` draft of a session, checked before any change is made, so the event
 * a stored change owes can only fail on storage (`managed.js` follow-ups).
 * @throws TypeError for a note that is not a string (K3 `note?: string`: a caller bug, as K3 #17)
 */
function noteDraft(type, sessionId, note) {
  if (typeof note !== 'string') throw new TypeError(MISUSE.note)
  return checkedFields(type, { sourceSessionId: sessionId, correlationId: null, payload: { sessionId, note } })
}

/**
 * @param {object} deps
 * @param deps.managed - the managed-state owner (`../routing/managed.js`: `state`, `assign`, `end`)
 * @param deps.produce - the routing module's one commit path (`(subject, draft) => Promise`)
 * @param deps.pairs - K1 `PairStore`; @param deps.tokens - K1 `TokenRegistry`; @param deps.presence - K1 `Presence`
 * @param deps.designatedEntry - `() => EntryKey | undefined`: `routing.fishballToken` now
 * @param deps.sessionExists - `(sessionId) => boolean | Promise<boolean>`
 * @param deps.changes - the routing module's listener set (`add`), fired on every K3 change
 * @returns `{service, provide(ctx)}`
 */
export function createHandover({ managed, produce, pairs, tokens, presence, designatedEntry, sessionExists, changes }) {
  const principalRef = (pair) => Object.freeze({ key: pair.principalKey, name: pair.name, id: pair.id })

  /**
   * The pair `principalKey` names, if its entry is listed, enabled and paired now (R-ROUTE-05).
   * Any other value, a non-string or an EntryKey of an unpaired entry included, names no pair: K3's
   * `no-fishball`, never a throw (K3: refusals are data).
   */
  function eligible(principalKey) {
    const pair = typeof principalKey === 'string' ? pairs.byPrincipal(principalKey) : undefined
    return pair !== undefined && tokens.get(pair.entryKey)?.enabled === true ? pair : undefined
  }
  let provided = false

  const service = Object.freeze({
    apiVersion: HANDOVER_SERVICE.apiVersion,

    managed() {
      return Object.freeze(managed.state.managed().flatMap(({ sessionId, principalKey }) => {
        const pair = pairs.byPrincipal(principalKey)
        // A manager whose pair is gone is ended by its revocation; until then it is not shown with a
        // stale name. C-SUCCEED: a succession must move such sessions in the same step, or they
        // vanish from the marks between `PairStore.succeed` and the move.
        return pair === undefined ? [] : [Object.freeze({ sessionId, principal: principalRef(pair) })]
      }))
    },

    principals() {
      const designated = designatedEntry()
      return Object.freeze(tokens.list().map((entry) => {
        const pair = pairs.pairOf(entry.entryKey)
        const common = { enabled: entry.enabled, designated: designated === entry.entryKey }
        if (pair === undefined) return Object.freeze({ key: entry.entryKey, name: null, id: null, online: false, ...common, paired: false })
        return Object.freeze({ key: pair.principalKey, name: pair.name, id: pair.id, online: presence.isConnected(pair.principalKey), ...common, paired: true })
      }))
    },

    onChange: (fn) => changes.add(fn),

    async handOver(sessionId, principalKey, note = NO_NOTE) {
      if (typeof sessionId !== 'string' || !(await sessionExists(sessionId))) return refusal(HANDOVER_REFUSAL.unknownSession)
      const draft = noteDraft(EVENT_TYPE.handover, sessionId, note)
      let pair
      const result = await managed.assign(sessionId, principalKey, {
        // Checked inside the managed step, after `conflict` (K3 order), against a racing disable.
        admit: () => ((pair = eligible(principalKey)) === undefined ? refusal(HANDOVER_REFUSAL.noFishball) : undefined),
        // One `handover`, to the new manager, offline or not (it waits in its mailbox; HAND-DT-01 rule 5).
        then: () => produce({ type: EVENT_TYPE.handover, sessionId }, draft),
      })
      return result.ok ? Object.freeze({ ok: true, principal: principalRef(pair) }) : result
    },

    async takeBack(sessionId, note = NO_NOTE) {
      if (typeof sessionId !== 'string' || !(await sessionExists(sessionId))) return refusal(HANDOVER_REFUSAL.unknownSession)
      const draft = noteDraft(EVENT_TYPE.takeback, sessionId, note)
      // The `takeback` goes to the pair that managed it until now (R-EVS-03), committed before its
      // offers are retired; the same retirement rule as release (Fishball 2026-11-14).
      const result = await managed.end(sessionId, {
        reason: RETIREMENT_REASON.released,
        then: (manager) => produce({ type: EVENT_TYPE.takeback, sessionId, followsPrincipal: manager }, draft),
      })
      return result.ok ? Object.freeze({ ok: true }) : refusal(HANDOVER_REFUSAL.notManaged)
    },
  })

  return Object.freeze({
    service,
    /**
     * Provides the service on `ctx` (the connector row) until that context unloads. Once per
     * routing module, as C-EXT's `provide`: a second call throws instead of serving the same state twice.
     */
    provide(ctx) {
      if (provided) throw new Error(MISUSE.provideTwice)
      provided = true
      return ctx.effect(() => {
        const dispose = ctx.provide(HANDOVER_SERVICE.name, service)
        return () => { dispose?.() }
      }, HANDOVER_SERVICE.label)
    },
  })
}
