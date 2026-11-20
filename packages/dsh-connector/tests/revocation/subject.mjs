/**
 * The one place that binds the C-REVOKE cases to their modules. Step 1 (cases.mjs): the REAL C-ROUTE routing
 * module and the REAL C-MAILBOX, opened exactly as the C-ROUTE suite opens them
 * (packages/dsh-connector/tests/routing/subject.mjs `routeWorld`: real DSH storage of the SDK under test,
 * fake pairs, tokens, presence, settings and sessions), with this suite's journaling mailbox port
 * (fakes.mjs revocationPort).
 *
 * The step-1 surface (relayed by the dev session, C-REVOKE step 1):
 *   routing.endPrincipal(entryKey, {freshRetirements}) → Promise<Readonly<{principalKey: string | undefined,
 *       sessions: readonly string[], offers: readonly Readonly<{offerId, sessionId, type}>[]}>>
 *     TypeError synchronously when `entryKey` is not a non-empty string, or the options object is
 *     missing / `freshRetirements` is not a boolean. The principal is the entry's current pair, or
 *     the pair it was last seen bound to when that pair was removed in the same settings sync.
 * C-WIRE-2 (the user: "不给ask_agent工具"): `askDropped` and `liveAsksOf` are gone; nothing makes an ask.
 * Routing no longer subscribes to `tokens.onRevoked`; C-REVOKE step 2 calls `endPrincipal` from its
 * own handler. In this suite the cases play C-REVOKE's sequencing themselves (hold / endPrincipal /
 * release for a disable; endPrincipal / drop for a delete).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { INSTANCE } from '../../../../test/support/constants.mjs'
import { importInstance } from '../../../../test/private-skills/support/sdk.mjs'
import { resolveRuntimePackages } from '../pairs/subject.mjs'
import { lateAckPort, recordingLogger } from '../routing/fakes.mjs'
import { routeWorld } from '../routing/subject.mjs'
import { MISUSE, PORT, REVOKE_SUBJECT, SURFACE } from './constants.mjs'
import { FakeTimers, PortCalls, revocationPort } from './fakes.mjs'

/**
 * One C-REVOKE world for `t` (cleaned up by `t`): routeWorld with the journaling port. `lateAck`:
 * the port's `onAcked` fires only on `w.mailbox.announceAcks()` (the C-ROUTE suite's lateAckPort),
 * so an offer can be acked in the mailbox while routing's ledger still thinks it pending.
 */
export async function revocationWorld(t, sdk, { lateAck = false } = {}) {
  const port = lateAck ? (real) => revocationPort(real, lateAckPort) : revocationPort
  const w = await routeWorld(t, sdk, { port })
  for (const m of Object.values(SURFACE)) assert.equal(typeof w.routing[m], 'function', `openRouting's result has no ${m}() (C-REVOKE step 1)`)
  return w
}

// ------------------------------------------------------------------------------------------------
// Step 2: the revocation module (handler-cases.mjs)
//
// The surface relayed by the dev session (revoke-brief.md and its amendments 1–3):
//   import { createRevocation, REVOCATION_TIMING, REVOCATION_NOTE } from 'src/revocation/index.js'
//   createRevocation(ports) → { start(): Promise<void>, close(): Promise<void> }
//   ports = { tokens (K1 TokenRegistry), routing ({endPrincipal}),
//     mailbox (K1 Mailbox + expireHolds(at)), pairs (K1 PairStore), closeEntry(entryKey),
//     settings ({get, onChange}), writer (K1d SettingsWriter: addToken, removeToken), notes (K1d SessionNotes),
//     now, timers ({setTimeout, clearTimeout}), logger ({warn, …}) }
// C-WIRE-2 (relayed 2026-11-17): no `cards` port (routing hands every retired offer to the user itself,
// routing.onLeft), no askDropped / liveAsksOf ("不给ask_agent工具"), no setDesignated (q5, "Remove
// agentToken entirely"). The rows observe the offers to the user through routing.onLeft, journaled as PORT.card.
//   REVOCATION_TIMING.expirySweepMs, .retryMs; REVOCATION_NOTE.text (English, model-facing).
// C-WIRE builds the module before the token registry's start sync and calls start() after it.

/** The module's entry bound to `sdk`: its factory and its two exported constants. */
async function revocationModule(sdk) {
  const entry = REVOKE_SUBJECT.entry
  assert.ok(fs.existsSync(entry), `${path.relative(process.cwd(), entry)} does not exist (C-REVOKE step 2 "Owns" packages/dsh-connector/src/revocation/)`)
  resolveRuntimePackages()
  const mod = await importInstance(sdk, path.relative(INSTANCE.dir, entry))
  assert.equal(typeof mod[REVOKE_SUBJECT.factory], 'function', `revocation/index.js exports no ${REVOKE_SUBJECT.factory}()`)
  for (const name of [REVOKE_SUBJECT.timing, REVOKE_SUBJECT.note]) assert.equal(typeof mod[name], 'object', `revocation/index.js exports no ${name}`)
  return { create: mod[REVOKE_SUBJECT.factory], timing: mod[REVOKE_SUBJECT.timing], note: mod[REVOKE_SUBJECT.note] }
}

/**
 * The ports the module gets, over the C-REVOKE world `w` (real routing and mailbox, the C-ROUTE
 * suite's fakes for tokens, pairs and settings). Every call goes through `calls` (fakes.mjs
 * PortCalls). Each port reads the world's members lazily, so a connector restart (`w.reopen()`)
 * reaches the new routing and mailbox.
 * - mailbox: `hold`, `release` and `drop` go through the journaling port routing was given (its
 *   journal records the drop, so "every retirement before the drop" reads one journal); `expireHolds`
 *   is the real mailbox's; every other K1 member reads the real mailbox unrecorded;
 * - writer: `addToken` / `removeToken` only record (C-WIRE-2: no `setDesignated`, the user's q5);
 * - notes: K1d SessionNotes, rejecting for a session that does not exist;
 * - closeEntry: `closeEntry` (C-HTTP's, for the end-to-end row) or a recorder.
 */
function portsOf(w, calls, { closeEntry = () => {}, timers, logger }) {
  const reads = Object.fromEntries(REVOKE_SUBJECT.mailboxReads.map((m) => [m, (...a) => w.realMailbox[m](...a)]))
  return {
    tokens: w.tokens,
    routing: {
      endPrincipal: calls.wrap(PORT.endPrincipal, (...a) => w.routing.endPrincipal(...a)),
    },
    mailbox: {
      ...reads,
      hold: calls.wrap(PORT.hold, (...a) => w.mailbox.hold(...a)),
      release: calls.wrap(PORT.release, (...a) => w.mailbox.release(...a)),
      drop: calls.wrap(PORT.drop, (...a) => w.mailbox.drop(...a)),
      expireHolds: calls.wrap(PORT.expireHolds, (...a) => w.realMailbox.expireHolds(...a)),
    },
    pairs: {
      list: () => w.pairs.list(),
      pairOf: (k) => w.pairs.pairOf(k),
      byPrincipal: (k) => w.pairs.byPrincipal(k),
      onChange: (fn) => w.pairs.onChange(fn),
      remove: calls.wrap(PORT.remove, (k) => w.pairs.remove(k)),
    },
    closeEntry: calls.wrapSync(PORT.closeEntry, closeEntry),
    settings: w.settings,
    writer: {
      addToken: calls.wrap(PORT.addToken, async () => {}),
      removeToken: calls.wrap(PORT.removeToken, async () => {}),
    },
    notes: {
      system: calls.wrap(PORT.note, async (sessionId) => { if (!w.sessions.exists(sessionId)) throw new Error(MISUSE.failure) }),
    },
    now: w.clock.now,
    timers,
    logger,
  }
}

/**
 * One C-REVOKE step-2 world for `t`: revocationWorld (real routing and mailbox over real DSH storage
 * of `sdk`) plus the revocation module over portsOf. The module is created (unless `create` is
 * false: the row builds its world first, then calls `createRevocation()`) and, unless `start` is
 * false, started. Added members:
 *   calls          the PortCalls journal and its drivers (failNext, gateNext)
 *   timers         the FakeTimers the module was given (over the world's fake clock)
 *   revLogger      the module's recording logger (`lines` of {level, text})
 *   TIMING, NOTE   the module's REVOCATION_TIMING and REVOCATION_NOTE
 *   revocation     the current module object
 *   createRevocation()            a new module over the same ports (the previous one must be closed)
 *   closeRevocation()             closes the current module once
 *   restartRevocation({reopen})   closes it, optionally restarts the connector's routing and mailbox
 *                                 (`w.reopen()`), then creates and starts a new module
 * Teardown order: the module closes first (every gate opened), then the routing world goes, so the
 * module never outlives the storage (node:test runs `after` hooks in registration order, so the
 * routing world's hooks are collected here and run after the module's close).
 */
export async function revocationModuleWorld(t, sdk, { closeEntry, create: createNow = true, start = true } = {}) {
  const mod = await revocationModule(sdk)
  const hooks = []
  let current
  let closed = true
  const close = async () => { if (closed) return; closed = true; await current.close() }
  const calls = new PortCalls()
  t.after(async () => {
    calls.openAll()
    await close()
    for (const hook of hooks) await hook()
  })
  const w = await revocationWorld({ after: (fn) => { hooks.push(fn) } }, sdk)
  // The offers an end of management hands to the user (routing.onLeft, C-WIRE-2), recorded as the
  // `cards.toUser` port calls were: one journal entry per offer, in the order routing reports them.
  hooks.unshift(w.routing.onLeft((offers) => { for (const offer of offers) calls.record(PORT.card, offer) }))
  const timers = new FakeTimers(w.clock)
  const logger = recordingLogger()
  const ports = portsOf(w, calls, { closeEntry, timers, logger })
  const create = () => {
    assert.ok(closed, 'a second revocation module was created while one is open')
    current = mod.create(ports)
    for (const m of REVOKE_SUBJECT.methods) assert.equal(typeof current?.[m], 'function', `createRevocation's result has no ${m}()`)
    closed = false
    return current
  }
  Object.assign(w, {
    calls, timers, revLogger: logger, TIMING: mod.timing, NOTE: mod.note,
    get revocation() { return current },
    createRevocation: create,
    closeRevocation: close,
    async restartRevocation({ reopen = false } = {}) {
      await close()
      if (reopen) await w.reopen()
      await create().start()
    },
  })
  if (createNow) {
    create()
    if (start) await current.start()
  }
  return w
}
