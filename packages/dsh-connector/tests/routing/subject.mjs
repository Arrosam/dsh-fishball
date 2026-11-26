/**
 * The one place that binds the C-ROUTE cases to C-ROUTE's module (`packages/dsh-connector/src/routing/`
 * and `src/handover/`). K1 freezes `Router.recipientFor` and `Presence`, K1c `ManagedState`, K3
 * `dshConnectorHandover`, but no factory and no ports. The dev session has relayed no surface
 * yet (2026-11-14), so this file assumes ONE shape (Fishball 2026-11-14: every port injected; the
 * entry-point shapes accepted as written here). If the module differs, only this file is adapted;
 * no case changes.
 *
 *   openRouting(ctx, {defineDomain, domainTable}, ports) → Promise<Routing>
 *     ctx, helpers   a cordis context with DSH's storage domain, and the SDK's dsh-storage-domain
 *                    helpers (ManagedState and the no-recipient queue are durable, K1c-1, K1c-3)
 *     ports = {
 *       mailbox    K1 `Mailbox` (C-MAILBOX's, real here) plus `onAcked(listener(principalKey,
 *                  receipts)) → dispose`, fired after each successful ack with the acked receipts
 *                  (the `inbox_ack` argument): the room-freed signal that moves held messages in
 *                  (Fishball 2026-11-14 #3; fakes.mjs mailboxPort)
 *       pairs      K1 `PairStore` (list, pairOf, byPrincipal, onChange; fake)
 *       tokens     K1 `TokenRegistry` (get, list in native-settings order, onRevoked; fake). An
 *                  entry's enabled state is `get(entryKey).enabled`. Routing no longer subscribes
 *                  to `onRevoked` (C-REVOKE step 1): a revocation ends management through
 *                  `endPrincipal`, which C-REVOKE's own handler calls
 *       presence   K1 `Presence` (isConnected, onChange; fake; CONNECTED = an open listen stream)
 *       settings   `{get() → {maxQueuedInputs?: number}, onChange(fn) → dispose}`: the live
 *                  `maxQueuedInputs` (unset = QUEUE.maxQueuedInputs). C-WIRE-2: no
 *                  `routing.agentToken` (the user, q5: "Remove agentToken entirely")
 *       sessions   the session source (Fishball 2026-11-14 #7; binding it to DSH is C-WIRE's):
 *                  `exists(sessionId) → boolean`, `onTurnFinished(fn(sessionId, {running, queued}))
 *                  → dispose`, `onState(fn(sessionId, {running, pendingInteraction})) → dispose`.
 *                  Session ids are root ids (K1c-1: the caller resolves the root)
 *       logger     a cordis-style logger {debug, info, warn, error}
 *       now        the injected clock, `() => EpochMs`
 *     }
 *   Routing = {
 *     router      K1 `Router`
 *     managed     K1c `ManagedState`
 *     handover    K3 `DshConnectorHandover` (the object `provide` provides)
 *     provide(ctx)                provides `handover` as `dshConnectorHandover` on `ctx`
 *     messageAgent(sessionId, {text, images}) → Promise<{ok: true} | {ok: false, code: 'queue-full' | 'not-managed'}>
 *                                 the `message_agent` tool's routing: one `message` to the
 *                                 session's manager (connected or not); `not-managed` for a
 *                                 session nobody manages, nothing committed or held (C-WIRE-2:
 *                                 no designated agent, no no-recipient queue; the user's q5).
 *                                 `askAgent` is gone (the user: "不给ask_agent工具")
 *     offer(sessionId, type, descriptor) → Promise<{recipient: PrincipalKey, eventId} | NoRecipient>
 *                                 the approval hook: a `permission`, `question` or `plan-review`
 *                                 of the session, `descriptor` the K1 offer descriptor (its
 *                                 `offerId` is the event's offer and correlation id). C-ROUTE
 *                                 commits it and keeps the live-offer ledger whose offers
 *                                 `ManagedState.release` retires (Fishball 2026-11-14 #2)
 *     settle(offerId, settlement) → Promise<boolean>
 *                                 an offer's or ask's outcome: one `settlement` (correlationId =
 *                                 offerId) to the pair that held it; a waiting ask gets
 *                                 `{ok: true, settlement}`; false (nothing) when the offer is not live
 *                                 (routing/index.js JSDoc; on the managed chain, merge review fix 1)
 *     withdraw(offerId) → Promise<boolean>
 *                                 the session's call ended: the offer is retired `withdrawn`
 *     escalate(offerId) → Promise<boolean>
 *                                 C-WIRE-2: the offer goes to the user's stock prompt; it leaves
 *                                 the live offers, the user's later answer (settle) settles it to
 *                                 the same pair; if its session leaves management first it is
 *                                 dropped with no retirement
 *     onLeft(fn(offers)) → dispose
 *                                 C-WIRE-2: fires once after each end of management (release,
 *                                 Take back, revocation) that retired at least one offer, with
 *                                 `[{offerId, sessionId, type}]` (they go to the user's prompt)
 *     endPrincipal(entryKey, {freshRetirements}) → Promise<{principalKey, sessions, offers}>
 *                                 C-REVOKE step 1: ends the entry's principal's management and
 *                                 retires its live offers `revoked` (packages/dsh-connector/tests/revocation)
 *     close() → Promise<void>     before the storage goes away
 *   }
 *
 * The world is real DSH storage of the SDK under test in a throwaway directory under the OS temp
 * directory, with the real C-MAILBOX over it, so `reopen()` is a connector restart over the same
 * files. The pair store, tokens, presence, settings and sessions are fakes (fakes.mjs).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { INSTANCE } from '../../../../test/support/constants.mjs'
import { importInstance, importSdk } from '../../../../test/private-skills/support/sdk.mjs'
import { DSH } from '../pairs/constants.mjs'
import { resolveRuntimePackages, storageContext } from '../pairs/subject.mjs'
import { FIXTURE, HANDOVER, MANAGED_STATE_METHODS, QUEUE, SUBJECT } from './constants.mjs'
import { FakePairs, FakePresence, FakeSessions, FakeSettings, FakeTokens, fakeClock, mailboxPort, recordingLogger } from './fakes.mjs'

/** `entry` bound to `sdk`, with `names` required as functions; `owner` names the task for the message. */
async function moduleOf(sdk, entry, names, owner) {
  assert.ok(fs.existsSync(entry), `${path.relative(process.cwd(), entry)} does not exist (${owner})`)
  resolveRuntimePackages()
  const mod = await importInstance(sdk, path.relative(INSTANCE.dir, entry))
  for (const name of names) assert.equal(typeof mod[name], 'function', `${path.basename(path.dirname(entry))}/index.js exports no ${name}()`)
  return mod
}

/** A HintSink that records calls (the unit worlds; the end-to-end world passes C-HTTP's). */
function recordingHints() {
  const calls = []
  return { calls, resourceUpdated: (...args) => { calls.push(args) } }
}

/**
 * `routing` as the cases drive it: every member is the module's own, methods bound to it so private
 * state keeps working. (C-WIRE-2 removed the `askAgent` wrapper: the user, "不给ask_agent工具".)
 */
function routingDriver(routing) {
  return new Proxy(routing, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

/**
 * One C-ROUTE world for `t`: real storage and mailbox, fake ports, the routing module opened.
 * Supply `sessions` to use a real session source over a fake DSH host instead of injecting reports.
 * `hints` defaults to a recording HintSink; `port` builds the mailbox port C-ROUTE is given over
 * the real mailbox (default fakes.mjs mailboxPort; gatedMailboxPort for a slow commit). `prepare(ctx)`
 * runs on each storage context before any table opens (R-FIX-CONNECTOR review rows: a write seam, and
 * the DSH services the session domain needs). Cleaned up by `t`.
 */
export async function routeWorld(t, sdk, { hints = recordingHints(), port = mailboxPort, prepare = () => {}, sessions = new FakeSessions() } = {}) {
  const [route, mail] = await Promise.all([
    moduleOf(sdk, SUBJECT.entry, [SUBJECT.open], 'C-ROUTE "Owns" packages/dsh-connector/src/routing/'),
    moduleOf(sdk, SUBJECT.mailboxEntry, [SUBJECT.mailboxOpen, SUBJECT.mailboxCreate], 'C-MAILBOX, merged in W2'),
  ])
  const root = await mkdtemp(path.join(fs.realpathSync(os.tmpdir()), FIXTURE.tempPrefix))
  const ports = {
    pairs: new FakePairs(), tokens: new FakeTokens(), presence: new FakePresence(), settings: new FakeSettings(),
    sessions, logger: recordingLogger(), clock: fakeClock(),
  }
  let open
  const start = async () => {
    const { ctx, helpers } = await storageContext(sdk, root)
    prepare(ctx)
    const tables = await mail[SUBJECT.mailboxOpen](ctx, helpers)
    // C-WIRE-2 (relayed 2026-11-17): the bound is the mailbox's own, read at each commit, as C-WIRE passes
    // `() => limits().maxQueuedInputs`; here the live FakeSettings value (unset = the K1 default).
    const real = mail[SUBJECT.mailboxCreate]({ tables: tables.tables, hints, now: ports.clock.now, maxQueuedInputs: () => ports.settings.get().maxQueuedInputs ?? QUEUE.maxQueuedInputs })
    const mailbox = port(real)
    const routing = await route[SUBJECT.open](ctx, helpers, {
      mailbox, pairs: ports.pairs, tokens: ports.tokens, presence: ports.presence, settings: ports.settings,
      sessions: ports.sessions, logger: ports.logger, now: ports.clock.now,
    })
    for (const m of SUBJECT.members) assert.ok(routing?.[m] !== undefined, `openRouting's result has no ${m}`)
    assert.equal(typeof routing.router.recipientFor, 'function', 'router has no recipientFor() (K1 Router)')
    for (const m of MANAGED_STATE_METHODS) assert.equal(typeof routing.managed[m], 'function', `managed has no ${m}() (K1c ManagedState)`)
    assert.equal(routing.handover.apiVersion, HANDOVER.apiVersion, 'handover.apiVersion is not 1 (K3)')
    return { ctx, helpers, tables, real, mailbox, routing, driver: routingDriver(routing) }
  }
  /** Run first at each stop, newest first: whatever a row built over this world's context closes before it. */
  const closers = []
  const stop = async () => {
    if (open === undefined) return
    for (const close of closers.splice(0).reverse()) await close()
    const { ctx, tables, routing } = open
    open = undefined
    await routing.close?.()
    await tables.close()
    await ctx.fiber.dispose()
  }
  t.after(async () => {
    await stop()
    // Guard the one recursive delete: only the directory this helper made under the OS temp dir.
    assert.ok(path.dirname(root) === fs.realpathSync(os.tmpdir()) && path.basename(root).startsWith(FIXTURE.tempPrefix), 'refusing to remove ' + root)
    await rm(root, { recursive: true, force: true })
  })
  open = await start()

  const keys = new Set()
  const world = {
    ...ports,
    hints,
    /** The routing object as the cases drive it (routingDriver). */
    get routing() { return open.driver },
    get router() { return open.routing.router },
    get managed() { return open.routing.managed },
    get handover() { return open.routing.handover },
    /** The mailbox port C-ROUTE was given. */
    get mailbox() { return open.mailbox },
    /** C-MAILBOX itself, for reading and for the cases' own commits. */
    get realMailbox() { return open.real },
    /** Every principal key the world has made (for "count entries in every mailbox"). */
    keys,
    /** A connector restart over the same files: the routing module and the mailbox close and open again. */
    async reopen() { await stop(); open = await start() },
    /**
     * A token entry with id `id`, enabled; `paired` binds it (with `name`); `connected` opens its
     * listen stream. Returns the key the handover
     * service lists it under: its principal key when paired, else its entry key. An unpaired entry
     * has no principal key yet (C-PAIR mints one only when it binds), so its key is the opaque
     * EntryKey (K3 handover.d.ts; ROUTE-EP-01 rows 3 and 7).
     */
    principal(id, { name = null, paired = true, connected = false } = {}) {
      const entryKey = ports.tokens.add(id)
      const key = FIXTURE.principal(id)
      // `keys` names mailboxes, so it keeps the principal key even while unpaired: that is where
      // mail lands once the entry is bound later (as ROUTE-EP-01 row 7 does).
      keys.add(key)
      if (paired) ports.pairs.bind(id, name)
      if (connected) ports.presence.connect(key)
      return paired ? key : entryKey
    },
    /** A session of this DSH. */
    session: (id) => ports.sessions.add(id),
    /** The storage context and the SDK's storage-domain helpers routing was opened on. */
    get ctx() { return open.ctx },
    get helpers() { return open.helpers },
    /** `close()` runs before routing closes at the next stop (the row's own modules over `ctx`). */
    beforeClose: (close) => { closers.push(close) },
  }
  return world
}

/** A bare cordis context of `sdk`, standing for one DSH process (HAND-EP-01: who can reach the service); disposed by `t`. */
export async function cordisContext(t, sdk) {
  const cordis = await importSdk(sdk, DSH.cordis)
  const ctx = new cordis.Context()
  t.after(() => ctx.fiber.dispose())
  return ctx
}
