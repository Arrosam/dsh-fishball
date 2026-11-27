/**
 * The one place that binds the F-LINK-SAVE cases to the code under test, and the world they run in.
 * The surface is the one the dev session relayed (2026-11-16); nothing else of the module is read:
 *
 *   createLinkCredentials(ctx, {target, clientId, clientMetadataUrl, sdk?, fetch?, now?, timers?})
 *     → {credentials, connect, onChange(fn) → dispose, dispose()}
 *   ctx: {credentials, authorization, on(event, fn) → dispose, logger?(name)}  (DSH's own services)
 *   credentials  passed as createPairing's `credentials` (F-PAIR, packages/core/src/identity/)
 *   connect      K3a FishballConnect: status(), onChange(fn), begin(), cancel()
 *   onChange(fn) the link should reconnect; the world calls `link.reconnect()` from it, as F-WIRE does
 *
 * The world plays F-WIRE's part: DSH-like settings (target URL, `connect.clientMetadataUrl`,
 * `identity.id`, `identity.name`), core's pairing (F-PAIR's `createPairing` over its real records
 * port in real DSH storage) and the link it owns. DSH's services are real, per SDK: the local
 * credential store (`.credentials.yaml` in a throwaway root) and `dsh-authorization`, composed by
 * fishball-test-helpers/dsh-host `openHost` on the current DSH. The connector is
 * fishball-test-helpers/fake-connector `startConnectFake` (FakePairs / RetirablePairs: K1's rules;
 * the old suite's C-PAIR store reuse went with the connector, 6b7c53bf). `restart()` closes everything and opens it again over the
 * same files, as a DSH restart does. The instance's part (the hosted import, its Reconnect) is a
 * plain `ctx.credentials.set(DSH_AGENT_TOKEN, value)`, which is all the contract lets it do.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { importBound } from 'fishball-test-helpers/bind'
import { cleanups, logText, openHost, tempRoot } from 'fishball-test-helpers/dsh-host'
import { startConnectFake } from 'fishball-test-helpers/fake-connector'
import { until } from 'fishball-test-helpers/wait'
import { storageContext } from '../identity/storage.mjs'
import { identityModule } from '../identity/subject.mjs'
import { mcpClient } from '../link/link-driver.mjs'
import { TARGETS } from '../support/targets-oracle.mjs'
import { CONNECT, EVENT, FIXTURE, HARNESS, HOSTED_IMPORT, IDENTITY, RELAYED, RFIX, SUBJECT } from './constants.mjs'
import { leakHits, sweepableHome } from './leaks.mjs'

/** The parent target on one fixed endpoint epoch (test data in the frozen grammar). */
export const PARENT_SOURCE = Object.freeze({ targetId: TARGETS.parentId, endpointEpoch: TARGETS.epoch.prefix + TARGETS.epoch.alphabet[0].repeat(TARGETS.epoch.randomChars) })

const CREDENTIALS_PACKAGE = 'dsh-credentials'

/** F-LINK-SAVE's entry bound to the current DSH, with the relayed factory required. */
export async function linkSaveModule() {
  assert.ok(fs.existsSync(SUBJECT.entry), `${SUBJECT.entry} does not exist yet (owned by ${SUBJECT.task})`)
  const mod = await importBound(SUBJECT.entry)
  for (const name of [SUBJECT.factory, SUBJECT.names]) assert.notEqual(mod[name], undefined, `${path.basename(SUBJECT.entry)} exports no ${name}`)
  return mod
}

/** Waits until `predicate()` holds (harness wait only); returns its last value. */
export const untilTrue = (predicate, timeoutMs = HARNESS.settleMs) => until(predicate, timeoutMs, HARNESS.pollMs)

/**
 * One F-LINK-SAVE world. Options:
 * - `cimd`: the `connect.clientMetadataUrl` setting (default FIXTURE.cimd.valid; an explicit `undefined` = unset);
 * - `name`: the raw `identity.name` setting (`undefined` = absent);
 * - `host`: the loopback name of the target URL (FIXTURE.host.first);
 * - `skewMs`: core's clock runs this far ahead of real time (`w.skew(ms)` moves it later; R14 rows);
 * - `start`: open core at once (default true);
 * - `noSdk`: E-FIX-3, open core WITHOUT the `sdk` option, so it loads its MCP client itself (only
 *   `createLinkCredentials`; the pairing's link keeps the SDK's client);
 * - `logger`: E-FIX-3, `(name) => logger` core gets as `ctx.logger` instead of DSH's (a recorder).
 * @param {import('node:test').TestContext} t
 */
export async function linkSaveWorld(t, options = {}) {
  // MULTI-1: `source` is the target this world's credentials belong to (default the parent on a
  // fixed epoch); `w.source` may be replaced before a restart (a new epoch).
  const { name, host = FIXTURE.host.first, start = true, noSdk = false, logger } = options
  let source = options.source ?? PARENT_SOURCE
  // An explicit `cimd: undefined` is the unset setting, so the default applies only when the key is absent.
  const cimd = Object.hasOwn(options, 'cimd') ? options.cimd : FIXTURE.cimd.valid
  const clock = { skewMs: 0 }
  const scope = cleanups(t)
  const root = tempRoot(scope, HARNESS.tempPrefix)
  const f = await startConnectFake()
  scope.defer(() => f.stop())
  const mod = await linkSaveModule()
  const pairingMod = await identityModule()
  const client = await mcpClient()
  const settings = new Map(Object.entries({
    target: f.url(host),
    cimd,
    [IDENTITY.idKey]: FIXTURE.coreId,
    [IDENTITY.nameKey]: name,
  }).filter(([, v]) => v !== undefined))

  /** Every log line of every host the world opened (a restart opens a new one). */
  const logs = []
  /** DSH credential events, in order, across restarts: `{event, subject}`. */
  const events = []
  let open
  let host_
  let names
  let credentialsFileName

  /** The DSH half alone (store and authorization); core is opened over it by `openCore`. */
  async function openDsh() {
    host_ = await openHost(root)
    credentialsFileName = path.basename(host_.credentialsFile)
    const { credentialRef, credentialKey, credentialKeyScope } = host_.parts[CREDENTIALS_PACKAGE]
    names = {
      ref: credentialRef(HOSTED_IMPORT.credentialRef),
      userRef: credentialRef(FIXTURE.userRef),
      hosted: credentialKey(...HOSTED_IMPORT.savedRecord.key.split('/')),
      // R-FIX-CORE F01: the pending reference's origin binding (RFIX.pendingTokenOrigin).
      pendingOrigin: credentialKey(...RFIX.pendingTokenOrigin.split('/')),
      scopeOf: credentialKeyScope,
    }
    host_.ctx.on(EVENT.referenceUpdated, (ref) => events.push({ event: EVENT.referenceUpdated, subject: String(ref) }))
    host_.ctx.on(EVENT.recordUpdated, (key) => events.push({ event: EVENT.recordUpdated, subject: String(key) }))
  }

  async function openCore() {
    const ctx = {
      credentials: host_.ctx.credentials,
      authorization: host_.ctx.authorization,
      on: (event, fn) => host_.ctx.on(event, fn),
      logger: logger ?? ((loggerName) => host_.ctx.logger(loggerName)),
    }
    // MULTI-1 seam (relayed 2026-11-18): `names` = credentialNames({targetId, endpointEpoch}). This
    // world is the hosted parent (its reserved names, link.d.ts) on one fixed endpoint epoch.
    const made = mod[SUBJECT.factory](ctx, {
      names: mod[SUBJECT.names](source),
      target: () => settings.get('target'),
      clientId: () => settings.get(IDENTITY.idKey),
      clientMetadataUrl: () => settings.get('cimd'),
      ...(noSdk ? {} : { sdk: client }),
      now: () => Date.now() + clock.skewMs,
    })
    for (const member of SUBJECT.members) assert.notEqual(made?.[member], undefined, `${SUBJECT.factory}() returned no ${member}`)
    for (const member of SUBJECT.connectMembers) assert.equal(typeof made.connect[member], 'function', `connect has no ${member}()`)
    const storage = await storageContext(root)
    const opened = await pairingMod.openRecords(storage.ctx, storage.helpers)
    const records = pairingMod.createRecords(opened.table, source)
    const pairing = pairingMod.createPairing({
      records,
      name: () => settings.get(IDENTITY.nameKey),
      target: () => settings.get('target'),
      credentials: made.credentials,
      sdk: client,
    })
    const reconnects = { count: 0 }
    const connectChanges = []
    const unwatch = made.onChange(() => { reconnects.count += 1; pairing.link.reconnect() })
    const unconnect = made.connect.onChange((status) => connectChanges.push(status))
    open = { made, storage, opened, pairing, unwatch, unconnect, reconnects, connectChanges }
    await pairing.link.start()
  }

  async function closeCore() {
    if (open === undefined) return
    const o = open
    open = undefined
    o.unwatch?.()
    o.unconnect?.()
    await o.pairing.link.stop()
    await o.made.dispose()
    await o.opened.close()
    await o.storage.ctx.fiber.dispose()
  }
  async function closeDsh() {
    if (host_ === undefined) return
    logs.push(...host_.logs)
    host_.logs.length = 0
    await host_.close()
    host_ = undefined
  }
  scope.defer(async () => { await closeCore(); await closeDsh() })
  await openDsh()

  const credentials = () => host_.ctx.credentials
  const w = {
    f, root, settings, events, mod,
    get source() { return source },
    set source(next) { source = next },
    /** The current source's credential names, from core's own credentialNames (relayed seam). */
    targetNames: () => mod[SUBJECT.names](source),
    get ctx() { return host_.ctx },
    get core() { return open?.made },
    get connect() { return open?.made.connect },
    get pairing() { return open?.pairing },
    get link() { return open?.pairing.link },
    get reconnects() { return open?.reconnects.count ?? 0 },
    get connectChanges() { return open?.connectChanges ?? [] },
    names: () => names,
    /** The target's origin now. */
    origin: () => new URL(settings.get('target')).origin,
    start: openCore,
    stop: closeCore,
    /** The user changes the target URL; F-WIRE tells the link (F-PAIR: `link.reconnect()`). */
    retarget(url) { settings.set('target', url); w.link.reconnect() },
    /** The user changes `identity.name`; F-WIRE tells the pairing. */
    rename(value) { settings.set(IDENTITY.nameKey, value); w.pairing.nameChanged() },
    /** Core's clock jumps `ms` ahead (R14). */
    skew(ms) { clock.skewMs += ms },
    /** Another connector at another origin, stopped after the test. */
    async otherConnector() { const other = await startConnectFake(); scope.defer(() => other.stop()); return other },
    /** A DSH restart: core and DSH close, then open again over the same files. */
    async restart() { await closeCore(); await closeDsh(); await openDsh(); await openCore() },

    // ---------------------------------------------------------------- DSH state (public reads only)
    /** The instance's hosted import / Reconnect: the token value goes into DSH_AGENT_TOKEN. */
    importToken: (value) => credentials().set(names.ref, value),
    /** The reference's current value (undefined when unset). */
    refValue: async () => (await credentials().resolve(names.ref))?.value,
    refConfigured: async () => (await credentials().describe(names.ref)).configured,
    hosted: () => credentials().readRecord(names.hosted),
    hostedConfigured: async () => (await credentials().describeRecord(names.hosted)).configured,
    /** "The child holds a credential" (link.d.ts), answered by DSH alone. */
    holdsCredential: async () => (await w.refConfigured()) || (await w.hostedConfigured()),
    /** Every stored record under core's scope that is not the hosted copy: Connect's grants. */
    async grants() {
      const all = await credentials().listRecords()
      const own = all.filter((e) => names.scopeOf(e.key) === CONNECT.grantRecordScope && String(e.key) !== HOSTED_IMPORT.savedRecord.key)
      return Promise.all(own.map(async (e) => ({ key: String(e.key), kind: e.kind, record: await credentials().readRecord(e.key) })))
    },
    /** Every stored record key (all scopes). */
    recordKeys: async () => (await credentials().listRecords()).map((e) => String(e.key)),
    /** The writes of `key` (a record) seen since event index `from`. */
    recordWrites: (key, from = 0) => events.slice(from).filter((e) => e.event === EVENT.recordUpdated && e.subject === key).length,
    /** Whether the record's (opaque) payload holds `value` anywhere (the contract: the value is inside it). */
    holdsValue: (record, value) => record !== undefined && JSON.stringify(record.payload ?? null).includes(value),

    // ---------------------------------------------------------------- core's state
    status: () => w.link?.status(),
    view: () => w.pairing?.state(),
    connectStatus: () => w.connect?.status(),
    async untilStatus(state, timeoutMs = HARNESS.settleMs) {
      await untilTrue(() => w.status()?.state === state, timeoutMs)
      assert.equal(w.status()?.state, state, `link status after ${timeoutMs} ms: ${JSON.stringify(w.status())} (pairing ${JSON.stringify(w.view())}, connect ${JSON.stringify(w.connectStatus())})`)
      return w.status()
    },
    async untilConnect(state, timeoutMs = HARNESS.settleMs) {
      await untilTrue(() => w.connectStatus()?.state === state, timeoutMs)
      assert.equal(w.connectStatus()?.state, state, `Connect status after ${timeoutMs} ms: ${JSON.stringify(w.connectStatus())}; changes seen ${JSON.stringify(w.connectChanges)} (link ${JSON.stringify(w.status())})`)
      return w.connectStatus()
    },
    async untilView(key, timeoutMs = HARNESS.settleMs) {
      const want = RELAYED.state[key]
      await untilTrue(() => w.view()?.state === want, timeoutMs)
      assert.equal(w.view()?.state, want, `pairing state after ${timeoutMs} ms: ${JSON.stringify(w.view())} (link ${JSON.stringify(w.status())})`)
      return w.view()
    },

    // ---------------------------------------------------------------- leak sweep (R-SEC-02)
    /**
     * Where any value the fake issued or saw appears outside the credential store: every log line,
     * the link, pairing and Connect statuses and changes, the settings, everything under the
     * world's root except the credentials file (core's pairing records included), and the temp
     * HOME. `everywhere` values may not appear in the credentials file either (Connect never sees
     * the connector token the owner typed on the approval page).
     */
    leaks({ everywhere = [] } = {}) {
      const allLogs = [...logs, ...(host_?.logs ?? [])]
      const places = {
        logs: logText(allLogs),
        status: JSON.stringify(w.status() ?? null),
        view: JSON.stringify(w.view() ?? null),
        connect: JSON.stringify(w.connectStatus() ?? null),
        connectChanges: JSON.stringify(w.connectChanges),
        settings: JSON.stringify([...settings]),
      }
      const store = path.join(root, credentialsFileName)
      return [
        ...leakHits(w.f.planted, { places, dirs: [root, ...sweepableHome()], allowed: [store] }),
        ...leakHits(new Set(everywhere), { places: { credentials: fs.existsSync(store) ? fs.readFileSync(store, 'latin1') : '' } }),
      ]
    },
  }
  if (start) await openCore()
  return w
}
