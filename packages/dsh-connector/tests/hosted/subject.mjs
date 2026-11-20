/**
 * The one place that binds the C-SUCCEED cases to the modules. The hosted surface is the one the dev
 * session relayed (succeed-brief.md, its Amendment 1 and the phase-3 contract after the independent
 * review, 2026-11-16); nothing else of the module is read:
 *
 *   openHostedStore(ctx, {defineDomain, domainTable}) → Promise<{table, close}>   (domain dsh_connector_hosted)
 *   createHostedTokens(ports) → {service, resume(), close()}   (phase 3: C-WIRE calls `resume` once at start)
 *     ports = {table, tokens, pairs, routing, writer, notes, settings, timers, logger}
 *   service: K3 DshConnectorTokens, frozen {apiVersion, createHosted, entryState, retire, onChange}   (onChange: K3 amendment I-SUCCEED, the user's Q1 = C, 2026-11-17)
 *   HOSTED_SERVICE {name, apiVersion}, HOSTED_TIMING {retryMs}, HOSTED_ENTRY_STATE, RETIRE_REFUSAL,
 *   SUCCESSION_NOTE {text(label)}, HostedServiceError
 *
 * Every other module is REAL, opened as its own suite opens it, over one real DSH storage stack of the
 * SDK under test in a throwaway directory:
 * - C-PAIR `openPairStore` (packages/dsh-connector/tests/pairs), C-MAILBOX `openMailboxTables` + `createMailbox`,
 *   C-TOKENS `createTokenRegistry` (packages/dsh-connector/tests/tokens), C-ROUTE `openRouting` with the
 *   routing suite's fakes for presence, settings and sessions (packages/dsh-connector/tests/routing), and
 *   the routing suite's mailboxPort (plus the C-MAILBOX member `stage`, phase 3; it replaced
 *   Amendment 1's `transferReversible`).
 * - Fakes (fakes.mjs): the K1d SettingsWriter over the world's settings document (its saves go
 *   through the real registry's sync), the K1d SessionNotes, the timers, and the write-failure seam
 *   over every storage domain and every port call.
 * `reopen()` is a connector restart over the same files and the same settings document; it does not
 * call `resume()` (a row calls `world.resume()` itself, as C-WIRE does once at start).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { INSTANCE, REPO } from '../../../../test/support/constants.mjs'
import { linkContractForSourceRun } from '../../../../test/support/contract-link.mjs'
import { importInstance } from '../../../../test/private-skills/support/sdk.mjs'
import { SUBJECT as PAIRS } from '../pairs/constants.mjs'
import { resolveRuntimePackages, storageContext } from '../pairs/subject.mjs'
import { MANAGED_STATE_METHODS, SUBJECT as ROUTING } from '../routing/constants.mjs'
import { FakePresence, FakeSessions, FakeSettings, fakeClock, mailboxPort, recordingLogger } from '../routing/fakes.mjs'
import { SUBJECT as TOKENS } from '../tokens/constants.mjs'
import { DOMAIN, FIXTURE, SUBJECT } from './constants.mjs'
import { FakeNotes, FakeTimers, FakeWriter, Seam, seamMailbox, seamStorage } from './fakes.mjs'

const loaded = new Map()
/** One module bound to `sdk`, with `names` required as exports; `owner` names the task for the message. */
function moduleOf(sdk, entry, names, owner) {
  const key = sdk + '\0' + entry
  if (!loaded.has(key)) {
    loaded.set(key, (async () => {
      assert.ok(fs.existsSync(entry), `${path.relative(REPO, entry)} does not exist (${owner})`)
      linkContractForSourceRun()
      resolveRuntimePackages()
      const mod = await importInstance(sdk, path.relative(INSTANCE.dir, entry))
      for (const name of names) assert.ok(mod[name] !== undefined, `${path.relative(REPO, entry)} exports no ${name}`)
      return mod
    })())
  }
  return loaded.get(key)
}

/** The hosted module bound to `sdk` (its relayed exports required). */
export const hostedModule = (sdk) => moduleOf(sdk, SUBJECT.entry, [SUBJECT.open, SUBJECT.create, ...SUBJECT.values], SUBJECT.owner)

const modules = (sdk) => Promise.all([
  hostedModule(sdk),
  moduleOf(sdk, ROUTING.entry, [ROUTING.open], 'C-ROUTE packages/dsh-connector/src/routing/'),
  moduleOf(sdk, ROUTING.mailboxEntry, [ROUTING.mailboxOpen, ROUTING.mailboxCreate], 'C-MAILBOX packages/dsh-connector/src/mailbox/'),
  moduleOf(sdk, PAIRS.entry, [PAIRS.open], 'C-PAIR packages/dsh-connector/src/pairs/'),
  moduleOf(sdk, TOKENS.entry, [TOKENS.factory, TOKENS.syncReason], 'C-TOKENS packages/dsh-connector/src/tokens/'),
]).then(([hosted, route, mail, pairs, tokens]) => ({ hosted, route, mail, pairs, tokens }))

/** A recording HintSink. */
const recordingHints = () => {
  const calls = []
  return { calls, resourceUpdated: (...args) => { calls.push(args) } }
}

/**
 * One C-SUCCEED world for `t` (cleaned up by `t`). See the file comment. `world.hosted` etc. are the
 * steps the cases use to build HOST-UC-03's preconditions.
 */
export async function succeedWorld(t, sdk) {
  const mods = await modules(sdk)
  const root = await mkdtemp(path.join(fs.realpathSync(os.tmpdir()), FIXTURE.tempPrefix))
  const seam = new Seam()
  const doc = { tokens: [] }
  const ports = {
    presence: new FakePresence(), settings: new FakeSettings(), sessions: new FakeSessions(), logger: recordingLogger(),
    clock: fakeClock(), timers: new FakeTimers(), hints: recordingHints(),
  }
  ports.notes = new FakeNotes(seam)
  let open
  const echoes = []
  const syncReason = mods.tokens[TOKENS.syncReason]
  ports.writer = new FakeWriter(seam, { doc, settings: ports.settings, apply: (list) => open.registry.apply(list, syncReason.settings) })

  const start = async () => {
    const { ctx, helpers } = await storageContext(sdk, root)
    seamStorage(ctx, seam)
    const pairs = await mods.pairs[PAIRS.open](ctx, helpers, {})
    const tables = await mods.mail[ROUTING.mailboxOpen](ctx, helpers)
    const real = mods.mail[ROUTING.mailboxCreate]({ tables: tables.tables, hints: ports.hints, now: ports.clock.now })
    assert.equal(typeof real[SUBJECT.stagedTransfer], 'function', `the C-MAILBOX mailbox has no ${SUBJECT.stagedTransfer}() (phase 3)`)
    const base = mailboxPort(real)
    base[SUBJECT.stagedTransfer] = (...a) => real[SUBJECT.stagedTransfer](...a)
    base.transfer = (...a) => real.transfer(...a)
    const mailbox = seamMailbox(base, seam)
    // restoreTokens runs inside the registry's queue: its write-back echo comes later, never awaited there (C-TOKENS world).
    const restoreTokens = (previous) => {
      doc.tokens = previous
      echoes.push(new Promise((resolve) => setImmediate(resolve)).then(() => opened.registry.apply(previous, syncReason.settings)))
    }
    const opened = { ctx, pairs, tables, real, mailbox }
    opened.registry = await mods.tokens[TOKENS.factory]({ ctx, logger: ports.logger, settings: ports.writer, restoreTokens })
    open = opened
    const started = await opened.registry.apply(doc.tokens, syncReason.start)
    assert.equal(started?.ok, true, `harness: the token registry refused the start sync: ${JSON.stringify(started)}`)
    opened.routing = await mods.route[ROUTING.open](ctx, helpers, {
      mailbox, pairs: pairs.store, tokens: opened.registry, presence: ports.presence, settings: ports.settings,
      sessions: ports.sessions, logger: ports.logger, now: ports.clock.now,
    })
    for (const m of SUBJECT.routingMembers) assert.equal(typeof opened.routing?.[m], 'function', `openRouting's result has no ${m}()`)
    for (const m of MANAGED_STATE_METHODS) assert.equal(typeof opened.routing.managed?.[m], 'function', `managed has no ${m}() (K1c)`)
    opened.store = await mods.hosted[SUBJECT.open](ctx, helpers)
    assert.ok(opened.store?.table !== undefined && typeof opened.store.close === 'function', 'openHostedStore resolved no {table, close}')
    opened.made = mods.hosted[SUBJECT.create]({
      table: opened.store.table, tokens: opened.registry, pairs: pairs.store, routing: opened.routing, writer: ports.writer,
      notes: ports.notes, settings: ports.settings, timers: ports.timers, logger: ports.logger,
    })
    assert.ok(opened.made?.service !== undefined, 'createHostedTokens returned no service')
    for (const m of SUBJECT.made.filter((n) => n !== 'service')) assert.equal(typeof opened.made[m], 'function', `createHostedTokens' result has no ${m}() (phase 3)`)
    return opened
  }
  const stop = async () => {
    if (open === undefined) return
    const o = open
    open = undefined
    while (echoes.length) await echoes.shift().catch(() => {})
    await o.made?.close()
    await o.store?.close()
    await o.routing?.close?.()
    await o.tables.close()
    await o.registry?.close?.()
    await o.pairs.close()
    await o.ctx.fiber.dispose()
  }
  t.after(async () => {
    await stop()
    // Guard the one recursive delete: only the directory this helper made under the OS temp dir.
    assert.ok(path.dirname(root) === fs.realpathSync(os.tmpdir()) && path.basename(root).startsWith(FIXTURE.tempPrefix), 'refusing to remove ' + root)
    await rm(root, { recursive: true, force: true })
  })
  open = await start()

  const keys = new Set()
  const sessionIds = new Set()
  const world = {
    ...ports, seam, doc, keys, sessionIds, root,
    mod: mods.hosted,
    get service() { return open.made.service },
    get pairs() { return open.pairs.store },
    get registry() { return open.registry },
    get routing() { return open.routing },
    get managed() { return open.routing.managed },
    get handover() { return open.routing.handover },
    /** C-MAILBOX itself (reads and the cases' own commits); `mailbox` is the port routing was given. */
    get realMailbox() { return open.real },
    get mailbox() { return open.mailbox },
    /** A connector restart over the same files and settings document. */
    async reopen() { await stop(); open = await start() },
    /** The hosted domain's records as plain `[key, record]` pairs. */
    hostedRecords() {
      const domain = open.ctx.storageDomain.get(DOMAIN.hosted)
      return domain === undefined ? [] : [...domain.table(DOMAIN.hostedTable).entries()]
    },
    /**
     * Whether a hosted record names `entryKey` (relayed: `{entryKey → instanceId}`; the record key or a
     * record field `entryKey` may carry it, the layout is the module's).
     */
    hasHostedRecord: (entryKey) => world.hostedRecordOf(entryKey) !== undefined,
    /** The hosted record naming `entryKey` (see hasHostedRecord), or undefined. */
    hostedRecordOf: (entryKey) => world.hostedRecords().find(([k, r]) => k === entryKey || r?.entryKey === entryKey)?.[1],
    /**
     * A damaged store: the hosted record of `entryKey` is lost while the token entry stays. Deleted
     * through DSH's own open domain runtime, not through the module (and not journaled by the seam).
     */
    async loseHostedRecord(entryKey) {
      const table = open.ctx.storageDomain.get(DOMAIN.hosted).table(DOMAIN.hostedTable)
      const keys = [...table.entries()].filter(([k, r]) => k === entryKey || r?.entryKey === entryKey).map(([k]) => k)
      assert.ok(keys.length > 0, 'harness: no hosted record to lose')
      for (const k of keys) await table.delete(k)
    },
    /**
     * A crash snapshot (R-FIX-CONNECTOR F03): the hosted record of `entryKey` rewritten with `patch`
     * through DSH's own open domain runtime, not through the module (and not journaled by the seam).
     */
    async patchHostedRecord(entryKey, patch) {
      const table = open.ctx.storageDomain.get(DOMAIN.hosted).table(DOMAIN.hostedTable)
      const found = [...table.entries()].find(([k, r]) => k === entryKey || r?.entryKey === entryKey)
      assert.ok(found, 'harness: no hosted record to patch')
      await table.put(found[0], { ...found[1], ...patch })
    },
    /** Closes the hosted service only (createHostedTokens' `close`), as the connector's stop does first. */
    closeService: () => open.made.close(),
    /** createHostedTokens' `resume()`, as C-WIRE calls it once at start (phase 3). */
    resume: () => open.made.resume(),
    /** The user's save of the tokens list (as through DSH's form): written, then synced. */
    async save(list) {
      doc.tokens = list
      return open.registry.apply(list, syncReason.settings)
    },
    /** Every value createHosted resolved in this world (for the leak sweeps; never printed). */
    values: [],
    /** The service's createHosted for `instance`, required to succeed; returns the entry key. */
    async hostedEntry(instance = FIXTURE.instance) {
      const made = await open.made.service.createHosted(instance)
      assert.equal(typeof made?.entryKey, 'string', `harness: createHosted gave no entry: ${JSON.stringify(Object.keys(made ?? {}))}`)
      world.values.push(made.value)
      return made.entryKey
    },
    /** A user-made entry (the settings page's New token, C-TOKENS `create`), required to succeed. */
    async userEntry(label = FIXTURE.userLabel) {
      const made = await open.registry.create(label)
      assert.equal(typeof made?.entryKey, 'string', 'harness: create gave no entry')
      return made.entryKey
    },
    /** `pair` on `entryKey` with `id` and `name`; the principal connects (opens its listen stream). Returns `{result, key}`. */
    async pair(entryKey, id, name) {
      const result = await open.pairs.store.pair(entryKey, id, name, ports.clock.now())
      assert.equal(result?.ok, true, `harness: pair refused: ${JSON.stringify(result)}`)
      const key = open.pairs.store.pairOf(entryKey).principalKey
      keys.add(key)
      ports.presence.connect(key)
      return { result, key }
    },
    principalOf: (entryKey) => open.pairs.store.pairOf(entryKey)?.principalKey,
    session(id) { sessionIds.add(id); return ports.sessions.add(id) },
    async manage(sessionId, key) {
      assert.deepEqual(await open.routing.managed.manage(sessionId, key), { ok: true }, 'harness: manage refused')
    },
    /** The live offers of every session the world made, as plain data: `{sessionId: [{principalKey, offerId}]}`. */
    liveOffers() {
      const out = {}
      for (const s of [...sessionIds].sort()) out[s] = open.routing.liveOffers(s).map((o) => ({ principalKey: o.principalKey, offerId: o.descriptor?.offerId }))
      return out
    },
  }
  return world
}
