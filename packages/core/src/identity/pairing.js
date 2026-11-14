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
 * | 4 | present | `fishball` | work, no `pair` (R-ID-05) |
 * | 5 | present | `fishball:pair` | hold: a new token is needed (R-ID-10), no `pair` |
 * | 6 | present | (refused) | the link reports `token-refused` / `token-revoked` and retries |
 * | 8 | warning open | — | the link is held before its first request: nothing reaches the target |
 * | 9 | — | — | `client_credentials` only (the link's provider), state from `scope` and `pair` only (R-OA-18) |
 *
 * A held state keys on what it was decided for, and a later attempt with other values decides
 * again: a warning, `need-id` and `id-mismatch` on (target origin, token reference, fishball id);
 * `need-token` on (target origin, token reference) only, so a new id alone never brings the old
 * token back (AUTH-UC-05 A2 "core stops using the old token"). The caller (F-WIRE) calls
 * `link.reconnect()` after a settings change, as for the link itself.
 *
 * Names (R-NAME-03, NAME-DT-03): `pair` carries `identity.name`. After every connect, and on
 * `nameChanged()`, `set_name` is called when the requested name is neither the connector's name
 * nor the name the connector last answered for. Both are kept in the record (`name`, `asked`), so a
 * change made while the link was down is sent after the reconnect (NAME-UC-02 A2), while a refused
 * name is not sent again until the setting changes. A refusal keeps the connector's name and is
 * reported as `nameIssue`, also after a restart.
 *
 * A record write that fails after a successful `pair` fails the attempt; the retry's `pair` then
 * answers `already-paired` with `idMatches: true`, and the user's Continue restores the record.
 */
import { REFUSAL, SCOPE, TOOL, principalLabel } from '../link/schema.js'
import { STATUS, createLink } from '../link/index.js'
import { CHOICE, CHOICES_OF, CHOICE_REFUSAL, HELD_STATES, HOLD_STATUS, MISUSE, NAME_SOURCE, PAIRING_STATE } from './constants.js'
import { requestedName, sameName } from './identity.js'

/** A `pair` answer the decision table has no row for: the attempt fails and is retried. */
export class PairingFailed extends Error {}

const NAME_REFUSALS = Object.freeze([REFUSAL.nameTaken, REFUSAL.nameInvalid])

/** The values a held state applies to (see the module comment). */
const holdKeyOf = (state, attempt) => JSON.stringify(state === PAIRING_STATE.needToken
  ? [attempt.origin, attempt.ref ?? null]
  : [attempt.origin, attempt.ref ?? null, attempt.clientId])

/** The `pair` arguments: the requested name, or none for a cleared name (R-NAME-06). */
const pairArgs = (name) => (name === null ? {} : { name })

/**
 * @typedef {object} PairingView what the Fishball page shows (`pairing.state()`)
 * @property {string} state one of PAIRING_STATE
 * @property {object | null} warning `already-paired`'s `bound` and `advice` while a warning is open
 * @property {readonly string[]} choices the warning's choices (CHOICES_OF), else empty
 * @property {{source: string, code: string, inUse: object} | null} nameIssue a refused name: where
 *   it came from (NAME_SOURCE), `name-taken` / `name-invalid`, and the name in use as
 *   `principalLabel` gives it (`{name}` or `{prefix: 'ID: ', id}`)
 */

/**
 * @param {object} options the link's options (`target`, `credentials` with its `ref`, `sdk`,
 *   `fetch`, timers), plus:
 * @param {{get: Function, put: Function}} options.records the paired records (`createRecords`)
 * @param {() => unknown} options.name the `identity.name` setting as stored (`requestedName` reads it)
 * @param {() => number} [options.now] epoch milliseconds, for the record's `pairedAt`
 * @param {(options: object) => object} [options.createLink] defaults to the link's own
 */
export function createPairing({ records, name, now = Date.now, createLink: makeLink = createLink, ...linkOptions }) {
  const listeners = new Set()
  let view = Object.freeze({ state: PAIRING_STATE.unpaired, warning: null, choices: Object.freeze([]), nameIssue: null })
  let holdKey
  // The attempt the gate last admitted: the name sync reads and writes its record.
  let admitted
  let warned
  let nameSync = Promise.resolve()

  const emit = () => {
    for (const fn of [...listeners]) {
      try { fn(view) } catch { /* a listener is the caller's code; it cannot break pairing */ }
    }
  }
  const update = (changes) => {
    view = Object.freeze({ ...view, ...changes })
    emit()
  }
  const enter = (state, attempt, warning = null) => {
    holdKey = HELD_STATES.includes(state) ? holdKeyOf(state, attempt) : undefined
    update({ state, warning, choices: CHOICES_OF[state] ?? Object.freeze([]) })
  }
  /** The name refusal a record shows for the requested name, or `null` (see the module comment). */
  const issueOf = (record, wanted) => {
    const asked = record.asked
    if (sameName(wanted, record.name) || asked?.name !== wanted || asked.refused === null) return null
    return Object.freeze({ source: asked.source, code: asked.refused, inUse: principalLabel(record.name, record.id) })
  }
  const showName = (record) => update({ nameIssue: issueOf(record, requestedName(name())) })
  /** The record of `attempt` with the connector's answer to the name `asked` for from `source`. */
  const answered = (record, asked, source, held, refused) => ({ ...record, name: held, asked: Object.freeze({ name: asked, source, refused }) })
  const refusedName = (code) => (NAME_REFUSALS.includes(code) ? code : null)

  const newRecord = (attempt, held) => ({ origin: attempt.origin, ref: attempt.ref, id: attempt.clientId, name: held, pairedAt: now() })

  const isHeld = (attempt) => HELD_STATES.includes(view.state) && holdKey === holdKeyOf(view.state, attempt)

  async function pair(attempt, call) {
    const wanted = requestedName(name())
    const result = await call(TOOL.pair, pairArgs(wanted))
    if (result?.ok === true) {
      const refused = result.nameAssigned === false ? refusedName(result.nameRefused) : null
      const record = answered(newRecord(attempt, result.name), wanted, NAME_SOURCE.pair, result.name, refused)
      await records.put(record)
      admitted = attempt
      enter(PAIRING_STATE.paired, attempt)
      showName(record)
      return null
    }
    if (result?.code === REFUSAL.alreadyPaired) {
      warned = Object.freeze({ attempt, bound: result.bound })
      const state = result.bound?.idMatches === true ? PAIRING_STATE.warnMatch : PAIRING_STATE.warnMismatch
      enter(state, attempt, Object.freeze({ ...result.bound, advice: result.advice }))
      return HOLD_STATUS
    }
    if (result?.code === REFUSAL.idTaken) {
      enter(PAIRING_STATE.needId, attempt)
      return HOLD_STATUS
    }
    throw new PairingFailed(result?.code ?? MISUSE.pairResult)
  }

  /** The link's pairing gate (link.js `PairingGate`). */
  const gate = Object.freeze({
    hold(attempt) {
      if (isHeld(attempt)) return HOLD_STATUS
      // Other values than the hold was decided for (or no hold): the record decides again.
      const state = records.get(attempt.origin, attempt.ref) === undefined ? PAIRING_STATE.unpaired : PAIRING_STATE.paired
      if (view.state !== state) enter(state, attempt)
      return null
    },
    async admit(attempt, { scope, call }) {
      const record = records.get(attempt.origin, attempt.ref)
      if (record === undefined) return pair(attempt, call)
      if (scope === SCOPE.pair) {
        enter(PAIRING_STATE.idMismatch, attempt)
        return HOLD_STATUS
      }
      admitted = attempt
      if (view.state !== PAIRING_STATE.paired) enter(PAIRING_STATE.paired, attempt)
      showName(record)
      return null
    },
    paired: async (attempt) => records.get(attempt.origin, attempt.ref) !== undefined,
  })

  const link = makeLink({ ...linkOptions, gate })

  /** One `set_name` when the module comment's rule asks for it; queued, never concurrent. */
  async function syncNameOnce() {
    const attempt = admitted
    const record = attempt && records.get(attempt.origin, attempt.ref)
    if (record === undefined || link.status() !== STATUS.connected) return
    const wanted = requestedName(name())
    showName(record)
    if (sameName(wanted, record.name) || record.asked?.name === wanted) return
    let result
    try {
      result = await link.callTool(TOOL.setName, { name: wanted })
    } catch {
      // Unknown whether it arrived: the record is unchanged, so the next connect asks again.
      return
    }
    const ok = result?.ok === true
    const refused = ok ? null : refusedName(result?.code)
    // Any other answer (`disconnected` included) changes nothing; the next connect asks again.
    if (!ok && refused === null) return
    const next = answered(record, wanted, NAME_SOURCE.setName, ok ? result.name : record.name, refused)
    await records.put(next)
    showName(next)
  }
  const syncName = () => {
    nameSync = nameSync.then(syncNameOnce, syncNameOnce).catch(() => {})
    return nameSync
  }

  link.onStatus((status) => { if (status === STATUS.connected) void syncName() })

  return Object.freeze({
    /** Core's link, with this pairing as its gate. Start it with `link.start()`. */
    link,
    /** @returns {PairingView} */
    state: () => view,
    /** Calls `fn(view)` after each change of `state()`. Returns its disposer. */
    onChange(fn) {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
    /**
     * The `identity.name` setting changed (R-NAME-03): sends `set_name` now when connected,
     * otherwise after the next connect. Resolves once that call settled.
     */
    nameChanged: () => syncName(),
    /**
     * One of the warning's choices (R-ID-07; AUTH-ST-03 rows 3–5).
     * - `continue` with `{confirmed: true}` (the box "No other Fishball or agent uses this id with
     *   this token" ticked): writes the record, sends no `pair`, and reconnects the link;
     * - `new-token-and-id` / `new-token`: core stops using this token until its reference changes.
     * @returns {Promise<{ok: true} | {ok: false, code: string}>} a refusal changes nothing
     */
    async choose(choice, { confirmed = false } = {}) {
      if (!view.choices.includes(choice)) return Object.freeze({ ok: false, code: CHOICE_REFUSAL.notOffered })
      if (choice === CHOICE.continue) {
        if (confirmed !== true) return Object.freeze({ ok: false, code: CHOICE_REFUSAL.notConfirmed })
        const { attempt, bound } = warned
        // The connector holds the bound pair's name; the name sync after the reconnect asks for ours.
        await records.put(newRecord(attempt, bound.name ?? null))
        enter(PAIRING_STATE.paired, attempt)
        link.reconnect()
      } else {
        enter(PAIRING_STATE.needToken, warned.attempt)
      }
      return Object.freeze({ ok: true })
    },
  })
}
