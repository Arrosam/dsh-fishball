/**
 * Core's pairing (task F-PAIR; design §5.8 "fishball-core's flow"; R-ID-05, R-ID-07, R-ID-10,
 * R-ID-13, R-OA-18, R-OA-19, R-NAME-03, R-HOST-10; cases AUTH-UC-05, AUTH-DT-06, AUTH-ST-03,
 * NAME-UC-02, NAME-DT-03). It creates core's link with itself as the link's pairing gate.
 *
 * Decision table (AUTH-DT-06), evaluated by the gate once the link has listed tools, before it
 * listens:
 * | Rule | Record | Granted scope | Action |
 * | --- | --- | --- | --- |
 * | 1, 2, 3, 7, 10 | absent | any | `pair({name})`: ok → write the record, work; `already-paired` → warning (match or mismatch); `id-taken` → need a new id |
 * | 1a | absent, a Connect grant | any | `pair({name})`: `already-paired` with `idMatches: true` → write the record, work (below) |
 * | 4 | present | holds `agent` | work, no `pair` (R-ID-05) |
 * | 5 | present | `agent:pair` (anything without `agent`) | hold: a new token is needed (R-ID-10), no `pair` |
 * | 6 | present | (refused) | the link reports `token-refused` / `token-revoked`, and retries (no hold) |
 * | 8 | warning open | — | the link is held before its first request: nothing reaches the target |
 * | 9 | — | — | state from `scope` and `pair` only (R-OA-18), for a token and a Connect grant alike |
 *
 * Rule 1a (F-LINK-SAVE; R13, R-OA-22, design §6.3a): Connect passes core's id as `agent_id`, and the
 * approval page binds the entry to it before the code is issued, so core's `pair` right after
 * Connect finds its own binding. That is not another Fishball's, so no warning: core writes the
 * record with the page's name. A name the page set stands; an empty one gets core's name with
 * `set_name` after the connect (design §6.3a "when the page left it empty").
 *
 * A held state keys on what it was decided for, and a later attempt with other values decides
 * again (a new id or token is the user's answer, Fishball's decision 2026-11-15, question 6): a
 * warning, `need-id` and `id-mismatch` on (target origin, credential id, fishball id).
 * `need-token` is a declined record of (target origin, credential id), so a new id alone never
 * brings the old token back, nor does a restart (AUTH-UC-05 A2 "core stops using the old token";
 * question 5). The credential id is F-LINK-SAVE's non-secret id of the token or grant (decided
 * item 13: token references are gone); a token keeps its id once saved, so saving never re-pairs.
 * The caller (F-WIRE) calls `link.reconnect()` after a settings change, as for the
 * link itself.
 *
 * Decisions run one at a time, in attempt order, and only the latest attempt changes the view: an
 * attempt overtaken while it waited on `pair` or a record write leaves what it learnt in the
 * records (a `pair` that succeeded is a fact) and changes nothing else.
 *
 * A successful `pair` is kept in memory until its record is written. A failed write fails the
 * attempt, and the retry writes the kept record instead of calling `pair` again (R-ID-05). Only a
 * restart between the two loses it; that retry's `pair` answers `already-paired` with
 * `idMatches: true`, and the user's Continue restores the record.
 *
 * Names (R-NAME-03, NAME-DT-03): `pair` carries `identity.name`. `nameChanged()` sends `set_name`
 * unless the requested name already is the connector's, at once when connected, else after the
 * next connect. After any other connect, `set_name` is sent only when the requested name is
 * neither the connector's name nor the name the connector last answered for. Both are kept in the
 * record (`name`, `asked`), so a change made while the link was down is sent after the reconnect
 * (NAME-UC-02 A2), while a refused name is not sent at every reconnect. A refusal keeps the
 * connector's name and is reported as `nameIssue`, also after a restart.
 */
import { MCP } from '../../contracts/constants.js'
import { principalLabel } from '../link/schema.js'
import { CREDENTIAL_KIND, STATUS, createLink, emitIsolated, subscribe } from '../link/index.js'
import {
  CHOICE, CHOICES_OF, CHOICE_REFUSAL, HELD_STATES, HOLD_STATUS, MISUSE, NAME_SOURCE, NO_CHOICES, PAIRING_STATE, SCOPE_LIST,
} from './constants.js'
import { requestedName, sameName } from './identity.js'

/** A `pair` answer the decision table has no row for: the attempt fails and is retried. */
export class PairingFailed extends Error {}

const NAME_REFUSALS = Object.freeze([MCP.refusal.nameTaken, MCP.refusal.nameInvalid])

/** The values a record and most holds apply to: (target origin, credential id, fishball id). */
const pairKeyOf = (attempt) => JSON.stringify([attempt.origin, attempt.ref, attempt.clientId])


/** The `pair` arguments: the requested name, or none for a cleared name (R-NAME-06). */
const pairArgs = (name) => (name === null ? {} : { name })

/** Whether a granted scope list holds the full scope `MCP.scope.full` (RFC 6749 §3.3; R-OA-04). */
const isFull = (scope) => typeof scope === 'string' && scope.split(SCOPE_LIST.separator).includes(MCP.scope.full)

const refusedName = (code) => (NAME_REFUSALS.includes(code) ? code : null)

const refusal = (code) => Object.freeze({ ok: false, code })
const OK = Object.freeze({ ok: true })

/**
 * The link's credentials, with the credential id required: records and holds key on it, so a
 * missing one would put every credential of a target under one key. A missing id is a programming
 * error of the caller; the link reports it as a failed attempt.
 */
const withRef = (credentials) => async (target) => {
  const value = await credentials(target)
  if ((value?.secret || value?.authProvider !== undefined) && typeof value.ref !== 'string') throw new TypeError(MISUSE.ref)
  return value
}

/** Rule 1a: `already-paired` answered for a Connect grant whose page bound core's own id. */
const ownPageBinding = (attempt, result) => attempt.kind === CREDENTIAL_KIND.grant && result?.bound?.idMatches === true

/**
 * @typedef {object} PairingView what the Fishball page shows (`pairing.state()`)
 * @property {string} state one of PAIRING_STATE
 * @property {object | null} warning while a warning is open: `already-paired`'s `bound` fields,
 *   its `advice`, and `inUse`, the bound pair as `principalLabel` gives it (R-NAME-08)
 * @property {readonly string[]} choices the warning's choices (CHOICES_OF), else empty
 * @property {{source: string, code: string, inUse: object} | null} nameIssue a refused name: where
 *   it came from (NAME_SOURCE), `name-taken` / `name-invalid`, and the name in use as
 *   `principalLabel` gives it (`{name}` or `{prefix: 'ID: ', id}`)
 */

/**
 * @param {object} options the link's options (`target`, `credentials` with its `ref`, `sdk`,
 *   `fetch`, `logger`, timers), plus:
 * @param {{get: Function, put: Function, declined: Function, decline: Function}} options.records
 *   the identity records (`createRecords`)
 * @param {() => unknown} options.name the `identity.name` setting as stored (`requestedName` reads it)
 * @param {() => number} [options.now] epoch milliseconds, for the record's `pairedAt`
 * @param {(options: object) => object} [options.createLink] defaults to the link's own
 */
export function createPairing({ records, name, now = Date.now, createLink: makeLink = createLink, ...linkOptions }) {
  const listeners = new Set()
  let view = Object.freeze({ state: PAIRING_STATE.unpaired, warning: null, choices: NO_CHOICES, nameIssue: null })
  let holdKey
  // The latest attempt (the one the view follows) and the one the gate last admitted (whose record
  // the name sync reads and writes).
  let latest
  let admitted
  let warned
  // Successful `pair` results whose record is not written yet, by pairKeyOf.
  const unwritten = new Map()
  let decisions = Promise.resolve()
  let nameSync = Promise.resolve()
  // `nameChanged()` came while no name sync could run: the next connect sends regardless of `asked`.
  let nameChangePending = false

  const update = (changes) => {
    view = Object.freeze({ ...view, ...changes })
    emitIsolated(listeners, view)
  }
  const enter = (state, attempt, warning = null) => {
    holdKey = HELD_STATES.includes(state) ? pairKeyOf(attempt) : undefined
    update({ state, warning, choices: CHOICES_OF[state] ?? NO_CHOICES })
  }
  /** The name refusal a record shows for the requested name, or `null` (see the module comment). */
  const issueOf = (record, wanted) => {
    const asked = record.asked
    if (sameName(wanted, record.name) || asked?.name !== wanted || asked.refused === null) return null
    return Object.freeze({ source: asked.source, code: asked.refused, inUse: principalLabel(record.name, record.id) })
  }
  const showName = (record) => update({ nameIssue: record === undefined ? null : issueOf(record, requestedName(name())) })
  /** `record` with the connector's name `held` and its answer to the name `asked` for from `source`. */
  const answered = (record, asked, source, held, refused) => ({ ...record, name: held, asked: Object.freeze({ name: asked, source, refused }) })
  const newRecord = (attempt, held) => ({ origin: attempt.origin, ref: attempt.ref, id: attempt.clientId, name: held, pairedAt: now() })

  const stored = (attempt) => records.get(attempt.origin, attempt.ref)
  const isHeld = (attempt) => HELD_STATES.includes(view.state) && holdKey === pairKeyOf(attempt)
  const isLatest = (attempt) => attempt === latest

  /** Writes a successful `pair`'s record, kept in `unwritten` until the write succeeds. */
  async function writePaired(attempt, record) {
    const key = pairKeyOf(attempt)
    unwritten.set(key, record)
    await records.put(record)
    unwritten.delete(key)
  }

  /** The attempt is admitted with `record`: the view follows only for the latest attempt. */
  function work(attempt, record) {
    if (!isLatest(attempt)) return HOLD_STATUS
    admitted = attempt
    if (view.state !== PAIRING_STATE.paired) enter(PAIRING_STATE.paired, attempt)
    showName(record)
    return null
  }

  async function pair(attempt, call) {
    const wanted = requestedName(name())
    const result = await call(MCP.tools.pair, pairArgs(wanted))
    if (result?.ok === true) {
      const held = result.name ?? null
      const refused = result.nameAssigned === false ? refusedName(result.nameRefused) : null
      const record = answered(newRecord(attempt, held), wanted, NAME_SOURCE.pair, held, refused)
      await writePaired(attempt, record)
      return work(attempt, record)
    }
    if (result?.code === MCP.refusal.alreadyPaired && ownPageBinding(attempt, result)) {
      const held = result.bound.name ?? null
      const base = newRecord(attempt, held)
      // A name the page set is the user's: recorded as asked-for, so the name sync leaves it.
      const record = held === null ? base : answered(base, wanted, NAME_SOURCE.pair, held, null)
      await writePaired(attempt, record)
      return work(attempt, record)
    }
    if (!isLatest(attempt)) return HOLD_STATUS
    if (result?.code === MCP.refusal.alreadyPaired) {
      const bound = result.bound ?? {}
      warned = Object.freeze({ attempt, bound })
      const state = bound.idMatches === true ? PAIRING_STATE.warnMatch : PAIRING_STATE.warnMismatch
      enter(state, attempt, Object.freeze({ ...bound, advice: result.advice, inUse: principalLabel(bound.name ?? null, bound.boundId) }))
      return HOLD_STATUS
    }
    if (result?.code === MCP.refusal.idTaken) {
      enter(PAIRING_STATE.needId, attempt)
      return HOLD_STATUS
    }
    throw new PairingFailed(result?.code ?? MISUSE.pairResult)
  }

  async function decide(attempt, { scope, call }) {
    const kept = unwritten.get(pairKeyOf(attempt))
    if (kept !== undefined) await writePaired(attempt, kept)
    const record = stored(attempt)
    if (record === undefined) return pair(attempt, call)
    if (!isFull(scope)) {
      if (isLatest(attempt)) enter(PAIRING_STATE.idMismatch, attempt)
      return HOLD_STATUS
    }
    return work(attempt, record)
  }

  /** The link's pairing gate (link.js `PairingGate`). */
  const gate = Object.freeze({
    hold(attempt) {
      latest = attempt
      if (records.declined(attempt.origin, attempt.ref)) {
        if (view.state !== PAIRING_STATE.needToken || !isHeld(attempt)) enter(PAIRING_STATE.needToken, attempt)
        return HOLD_STATUS
      }
      if (isHeld(attempt)) return HOLD_STATUS
      // Other values than the hold was decided for (or no hold): the record decides again, and a
      // name issue of other values is not this one's.
      const record = stored(attempt)
      const state = record === undefined ? PAIRING_STATE.unpaired : PAIRING_STATE.paired
      if (view.state !== state) enter(state, attempt)
      if (admitted === undefined || pairKeyOf(admitted) !== pairKeyOf(attempt)) {
        admitted = undefined
        showName(record)
      }
      return null
    },
    admit(attempt, session) {
      const next = decisions.then(() => decide(attempt, session))
      decisions = next.catch(() => {})
      return next
    },
    paired: async (attempt) => stored(attempt) !== undefined || unwritten.has(pairKeyOf(attempt)),
  })

  const link = makeLink({ ...linkOptions, credentials: withRef(linkOptions.credentials), gate })

  /** One `set_name` when the module comment's rule asks for it; queued, never concurrent. */
  async function syncNameOnce(forced) {
    const attempt = admitted
    const record = attempt && stored(attempt)
    if (record === undefined || link.status() !== STATUS.connected) {
      if (forced) nameChangePending = true
      return
    }
    const force = forced || nameChangePending
    nameChangePending = false
    const wanted = requestedName(name())
    showName(record)
    if (sameName(wanted, record.name) || (!force && record.asked?.name === wanted)) return
    let result
    try {
      result = await link.callTool(MCP.tools.setName, { name: wanted })
    } catch {
      // Unknown whether it arrived: the record is unchanged, so the next connect asks again.
      if (force) nameChangePending = true
      return
    }
    const ok = result?.ok === true
    const refused = ok ? null : refusedName(result?.code)
    if (!ok && refused === null) {
      // Any other answer (`disconnected` included) changes nothing; the next connect asks again.
      if (force) nameChangePending = true
      return
    }
    const next = answered(record, wanted, NAME_SOURCE.setName, ok ? result.name ?? null : record.name, refused)
    await records.put(next)
    showName(next)
  }
  const syncName = (forced) => {
    nameSync = nameSync.then(() => syncNameOnce(forced)).catch(() => {})
    return nameSync
  }

  link.onStatus((status) => { if (status === STATUS.connected) void syncName(false) })

  return Object.freeze({
    /** Core's link, with this pairing as its gate. Start it with `link.start()`. */
    link,
    /** @returns {PairingView} */
    state: () => view,
    /** Calls `fn(view)` after each change of `state()`. Returns its disposer. */
    onChange: (fn) => subscribe(listeners, fn),
    /**
     * The `identity.name` setting changed (R-NAME-03): sends `set_name` now when connected,
     * otherwise after the next connect. Resolves once that call settled; never rejects.
     */
    nameChanged: () => syncName(true),
    /**
     * One of the warning's choices (R-ID-07; AUTH-ST-03 rows 3–5).
     * - `continue` with `{confirmed: true}` (the box "No other Fishball or agent uses this id with
     *   this token" ticked): writes the record, sends no `pair`, and reconnects the link;
     * - `new-token-and-id` / `new-token`: core stops using this credential until another one comes.
     * @returns {Promise<{ok: true} | {ok: false, code: string}>} never rejects; a refusal changes
     *   nothing (`not-offered`, `not-confirmed`, or `not-saved` when its record write failed)
     */
    async choose(choice, { confirmed = false } = {}) {
      if (!view.choices.includes(choice)) return refusal(CHOICE_REFUSAL.notOffered)
      const { attempt, bound } = warned
      const isContinue = choice === CHOICE.continue
      if (isContinue && confirmed !== true) return refusal(CHOICE_REFUSAL.notConfirmed)
      try {
        // Continue: the connector holds the bound pair's name; the name sync after the reconnect
        // asks for ours. A new token: the declined record keeps core off this token for good.
        await (isContinue ? records.put(newRecord(attempt, bound.name ?? null)) : records.decline(attempt.origin, attempt.ref, now()))
      } catch {
        return refusal(CHOICE_REFUSAL.notSaved)
      }
      enter(isContinue ? PAIRING_STATE.paired : PAIRING_STATE.needToken, attempt)
      if (isContinue) link.reconnect()
      return OK
    },
  })
}
