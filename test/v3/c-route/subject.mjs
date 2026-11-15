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
 *                  entry's enabled state is `get(entryKey).enabled`; `onRevoked` ends the
 *                  entry's management in W3 (Fishball 2026-11-14 #1)
 *       presence   K1 `Presence` (isConnected, onChange; fake; CONNECTED = an open listen stream)
 *       settings   `{get() → {agentToken?: EntryKey, maxQueuedInputs?: number}, onChange(fn) →
 *                  dispose}`: the live `routing.agentToken` and `maxQueuedInputs` (unset =
 *                  QUEUE.maxQueuedInputs)
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
 *     messageAgent(sessionId, {text, images}) → Promise<{ok: true} | {ok: false, code: 'queue-full'}>
 *                                 the `message_agent` tool's routing (R-ROUTE-03, K1c-3)
 *     askAgent(sessionId, descriptor) → Promise
 *                                 `ask_agent`, `descriptor` a full K1 ask descriptor
 *                                 (EVENT_PAYLOAD_SHAPES.ask: approvalId, offerId, kind, prompt, …).
 *                                 The cases pass `{question}`; the world's `routing` builds the
 *                                 descriptor from it (askDescriptor below). Resolves
 *                                 `{ok: false, code: 'unavailable'}` at once with no connected
 *                                 recipient; else commits one `ask` offer
 *                                 and stays pending until it is answered (C-TOOLS answers it)
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
import { APPROVAL_KIND } from '../../../packages/dsh-connector/contract/contract.js'
import { INSTANCE } from '../../support/constants.mjs'
import { importInstance, importSdk } from '../../private-skills/support/sdk.mjs'
import { DSH } from '../c-pair/constants.mjs'
import { resolveRuntimePackages, storageContext } from '../c-pair/subject.mjs'
import { FIXTURE, HANDOVER, MANAGED_STATE_METHODS, OFFER_ID, SUBJECT, formatOfferId } from './constants.mjs'
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
 * The driver's own fixture for ask descriptors. The approval ids get their own prefix so they never
 * collide with the offer descriptors cases.mjs numbers from FIXTURE.offerPrefix.
 */
const ASK_FIXTURE = Object.freeze({ approvalPrefix: FIXTURE.offerPrefix + 'ask-' })
let askCounter = 0
/**
 * A K1 ask descriptor (shapes.js `descriptor`, timer-free) built from the cases' `{question}`: an
 * `ask` is an approval-kind request with no `questions`, so the question is its prompt, title and
 * reason (as cases.mjs fills its offer descriptors), stamped by the world's clock.
 */
function askDescriptor({ question }, now) {
  const approvalId = ASK_FIXTURE.approvalPrefix + ++askCounter
  return {
    approvalId, offerId: formatOfferId(approvalId, OFFER_ID.firstRevision), kind: APPROVAL_KIND.approval, prompt: question,
    choices: [], title: question, at: now(), toolName: FIXTURE.toolName, callId: null, reason: question, quotes: [],
  }
}
/**
 * `routing` as the cases drive it: every member is the module's own (methods bound to it, so
 * private state keeps working), except `askAgent`, which takes the cases' `{question}` and
 * passes the module a full ask descriptor.
 */
function routingDriver(routing, now) {
  const askAgent = (sessionId, ask) => routing.askAgent(sessionId, askDescriptor(ask, now))
  return new Proxy(routing, {
    get(target, prop) {
      if (prop === 'askAgent') return askAgent
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

/**
 * One C-ROUTE world for `t`: real storage and mailbox, fake ports, the routing module opened.
 * `hints` defaults to a recording HintSink; `port` builds the mailbox port C-ROUTE is given over
 * the real mailbox (default fakes.mjs mailboxPort; gatedMailboxPort for a slow commit). Cleaned up by `t`.
 */
export async function routeWorld(t, sdk, { hints = recordingHints(), port = mailboxPort } = {}) {
  const [route, mail] = await Promise.all([
    moduleOf(sdk, SUBJECT.entry, [SUBJECT.open], 'C-ROUTE "Owns" packages/dsh-connector/src/routing/'),
    moduleOf(sdk, SUBJECT.mailboxEntry, [SUBJECT.mailboxOpen, SUBJECT.mailboxCreate], 'C-MAILBOX, merged in W2'),
  ])
  const root = await mkdtemp(path.join(fs.realpathSync(os.tmpdir()), FIXTURE.tempPrefix))
  const ports = {
    pairs: new FakePairs(), tokens: new FakeTokens(), presence: new FakePresence(), settings: new FakeSettings(),
    sessions: new FakeSessions(), logger: recordingLogger(), clock: fakeClock(),
  }
  let open
  const start = async () => {
    const { ctx, helpers } = await storageContext(sdk, root)
    const tables = await mail[SUBJECT.mailboxOpen](ctx, helpers)
    const real = mail[SUBJECT.mailboxCreate]({ tables: tables.tables, hints, now: ports.clock.now })
    const mailbox = port(real)
    const routing = await route[SUBJECT.open](ctx, helpers, {
      mailbox, pairs: ports.pairs, tokens: ports.tokens, presence: ports.presence, settings: ports.settings,
      sessions: ports.sessions, logger: ports.logger, now: ports.clock.now,
    })
    for (const m of SUBJECT.members) assert.ok(routing?.[m] !== undefined, `openRouting's result has no ${m}`)
    assert.equal(typeof routing.router.recipientFor, 'function', 'router has no recipientFor() (K1 Router)')
    for (const m of MANAGED_STATE_METHODS) assert.equal(typeof routing.managed[m], 'function', `managed has no ${m}() (K1c ManagedState)`)
    assert.equal(routing.handover.apiVersion, HANDOVER.apiVersion, 'handover.apiVersion is not 1 (K3)')
    return { ctx, tables, real, mailbox, routing, driver: routingDriver(routing, ports.clock.now) }
  }
  const stop = async () => {
    if (open === undefined) return
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
    /** The routing object as the cases drive it (routingDriver: `askAgent` takes `{question}`). */
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
     * listen stream; `designated` makes it `routing.agentToken`. Returns the key the handover
     * service lists it under: its principal key when paired, else its entry key. An unpaired entry
     * has no principal key yet (C-PAIR mints one only when it binds), so its key is the opaque
     * EntryKey (K3 handover.d.ts; ROUTE-EP-01 rows 3 and 7).
     */
    principal(id, { name = null, paired = true, connected = false, designated = false } = {}) {
      const entryKey = ports.tokens.add(id)
      const key = FIXTURE.principal(id)
      // `keys` names mailboxes, so it keeps the principal key even while unpaired: that is where
      // mail lands once the entry is bound later (as ROUTE-EP-01 row 7 does).
      keys.add(key)
      if (paired) ports.pairs.bind(id, name)
      if (connected) ports.presence.connect(key)
      if (designated) ports.settings.set({ agentToken: entryKey })
      return paired ? key : entryKey
    },
    /** A session of this DSH. */
    session: (id) => ports.sessions.add(id),
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
