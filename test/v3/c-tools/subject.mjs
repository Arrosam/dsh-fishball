/**
 * The one place that binds the C-TOOLS cases to C-TOOLS' module (`packages/dsh-connector/src/mcp/tools/`).
 *
 * **Assumed surface (Q1, accepted by Fishball 2026-11-14).** The dev session has relayed nothing
 * yet, so this file assumes one factory in the entry, and nothing else of the module is read:
 *
 *   create<…>Tools(ports) → populate(server, caller)   (or `{populate}`)
 *     ports.pairs    K1 PairStore (C-PAIR's real store here)
 *     ports.mailbox  K1 Mailbox (C-MAILBOX's real mailbox here)
 *     ports.managed  K1c ManagedState (C-ROUTE's; faked to its contract below, C-ROUTE is not merged)
 *     ports.domain   the V2 session and approval domain the tools wrap (shape not relayed yet)
 *     ports.now      the injected clock, `() => EpochMs`
 *     ports.logger   a cordis-style logger
 *   populate is handed to C-HTTP's real `createMcpEndpoint({…, populate})` (brief "Seam"), and the
 *   cases talk to it with the installed SDK's stock `@modelcontextprotocol/client` 2.2.0 over real
 *   HTTP, pinned to 2026-07-28. When the dev relays the real ports, only `toolsWorld` changes.
 *
 * **The domain (Fishball's answer to Q2, 2026-11-14).** "Use the connector's real V2 session and
 * approval domain in-process wherever it can be imported without launching a child; where that is
 * impossible, do not fake the rule." The V2 session tools (start, message, read, list) and every
 * offer (`approval_answer`, `question_answer` on a live offer) need a real DSH session controller
 * and a session that raises a permission request, i.e. a DSH host process; this suite launches no
 * child and starts no host. So:
 * - `ports.domain` is a **tripwire**, not a fake: any call on it is recorded (`world.domainCalls`)
 *   and throws. It is used only by rows whose oracle is "the domain was never reached" (an
 *   input-validation refusal, `forbidden` before any lookup, an unknown tool).
 * - Every row that needs a live offer or a real session (PLAT-UC-02, PLAT-ST-01, `sessions_list`
 *   omission) is `test.todo`, owned by C-WIRE or the W3 merge (constants.mjs LATER). The
 *   first-commit-wins rule is never faked.
 * - ManagedState is faked to its K1c contract (one manager per root session, `conflict`,
 *   `not-managed`, `forbidden`), because the cases only need "P manages S1" as a given; no case
 *   asserts this fake's own behaviour.
 *
 * Storage is real DSH storage (dsh-storage + dsh-storage-json + dsh-storage-domain of the SDK under
 * test) in a throwaway directory under the canonical (realpath) temp dir, removed after each case.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { INSTANCE } from '../../support/constants.mjs'
import { linkContractForSourceRun } from '../../support/contract-link.mjs'
import { importInstance } from '../../private-skills/support/sdk.mjs'
import { FakeFailures, FakeVerifier, fakeClock, fakeOriginOf, recordingLogger, sdkClient } from '../c-http/subject.mjs'
import { resolveRuntimePackages, storageContext } from '../c-pair/subject.mjs'
import { FIXTURE, MANAGED_REFUSAL, PROTOCOL, RESOURCE, SCOPE, SUBJECT, WAIT, oauthUrls } from './constants.mjs'

/** C-MAILBOX's two composition entry points (its relayed surface, as test/v3/c-mailbox states it). */
const MAILBOX_ENTRY = Object.freeze({
  file: path.join(INSTANCE.dir, '..', 'dsh-connector', 'src', 'mailbox', 'index.js'),
  openTables: 'openMailboxTables',
  create: 'createMailbox',
})
/** C-PAIR's relayed surface (test/v3/c-pair). */
const PAIR_ENTRY = Object.freeze({ file: path.join(INSTANCE.dir, '..', 'dsh-connector', 'src', 'pairs', 'index.js'), open: 'openPairStore' })
const TEMP_PREFIX = 'fbtest-c-tools-'
const PATH_MCP = new URL(oauthUrls(FIXTURE.urlBase).resource).pathname

const load = async (sdk, file) => {
  assert.ok(fs.existsSync(file), `${file} does not exist`)
  return importInstance(sdk, path.relative(INSTANCE.dir, file))
}

/** The C-TOOLS entry's one factory, bound to `sdk`. */
async function toolsFactory(sdk) {
  const mod = await load(sdk, SUBJECT.entry)
  const names = Object.keys(mod).filter((n) => typeof mod[n] === 'function' && SUBJECT.factory.test(n))
  assert.equal(names.length, 1, `the C-TOOLS entry should export exactly one factory matching ${SUBJECT.factory}; found ${JSON.stringify(names)}`)
  return mod[names[0]]
}

/**
 * K1c ManagedState, faked to its contract (README "Managed state"): at most one manager per
 * session; `manage` of a managed session is `conflict`; `release` is `not-managed` / `forbidden`.
 */
export class FakeManaged {
  #managers = new Map()
  #listeners = new Set()
  managerOf(sessionId) { return this.#managers.get(sessionId) }
  managed() { return [...this.#managers].map(([sessionId, principalKey]) => ({ sessionId, principalKey })) }
  async manage(sessionId, principalKey) {
    if (this.#managers.has(sessionId)) return { ok: false, code: MANAGED_REFUSAL.alreadyManaged }
    this.#managers.set(sessionId, principalKey)
    this.#changed()
    return { ok: true }
  }
  async release(sessionId, principalKey) {
    const manager = this.#managers.get(sessionId)
    if (manager === undefined) return { ok: false, code: MANAGED_REFUSAL.notManaged }
    if (manager !== principalKey) return { ok: false, code: MANAGED_REFUSAL.otherManager }
    this.#managers.delete(sessionId)
    this.#changed()
    return { ok: true }
  }
  onChange(listener) { this.#listeners.add(listener); return () => this.#listeners.delete(listener) }
  #changed() { for (const l of [...this.#listeners]) { try { l() } catch { /* K1c: a throwing listener stops no other */ } } }
}

/**
 * A tripwire for the V2 domain port (Q2): any property chain that is called is recorded in `calls`
 * and throws. A thenable probe (`then`) and symbols answer undefined, so awaiting it is harmless.
 */
function tripwire(calls, trail = []) {
  return new Proxy(function domainPort() {}, {
    get(_, prop) {
      if (prop === 'then' || typeof prop === 'symbol') return undefined
      return tripwire(calls, [...trail, prop])
    },
    apply() {
      const name = trail.join('.')
      calls.push(name)
      throw new Error(`harness: the V2 domain port ${name} was reached`)
    },
  })
}

/**
 * An unfrozen, plain stand-in for `store` that an override may wrap or replace members on.
 * C-PAIR's store is `Object.freeze`d, so its members are non-configurable read-only data
 * properties; a Proxy over it whose `get` answers a different value for one of them breaks the
 * Proxy invariants and every such read throws a TypeError (the F6 row's fake `pair` never ran).
 * Each member found on the store or its prototype chain (short of Object.prototype) becomes an own,
 * configurable accessor here. Methods are bound to the real store so they keep their `this` (private
 * fields included), and other values are read live from the store.
 */
function overridableStore(store) {
  const view = {}
  for (let o = store; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    for (const key of Reflect.ownKeys(o)) {
      if (key === 'constructor' || Object.hasOwn(view, key)) continue
      Object.defineProperty(view, key, {
        configurable: true,
        enumerable: true,
        get: () => {
          const value = Reflect.get(store, key)
          return typeof value === 'function' ? value.bind(store) : value
        },
      })
    }
  }
  return view
}

/** `resources/read dsh-agent://events`, as C-HTTP's suite fakes it (not a C-TOOLS concern). */
const readEvents = async () => ({ contents: [{ uri: RESOURCE.events.uri, mimeType: RESOURCE.events.mimeType, text: JSON.stringify([]) }] })

/**
 * A C-TOOLS world for `t` on `sdk`: real pair store and mailbox over one storage context, the fake
 * ManagedState, the tripwire domain, C-HTTP's real gate and endpoint with C-TOOLS' populate, on
 * loopback. `overridePairs(store)` may wrap the real store (the F6 row's throwing `pair`); it is
 * handed `overridableStore(store)`, not the frozen store itself.
 * Returns {pairs, mailbox, managed, domainCalls, clock, logger, full(id, name), pairOnly(id), connect(token)}.
 */
export async function toolsWorld(t, sdk, { overridePairs } = {}) {
  linkContractForSourceRun()
  resolveRuntimePackages()
  const [createTools, pairsMod, mailboxMod, httpMod] = await Promise.all([
    toolsFactory(sdk), load(sdk, PAIR_ENTRY.file), load(sdk, MAILBOX_ENTRY.file), load(sdk, SUBJECT.httpEntry),
  ])
  const tmp = await realpath(os.tmpdir())
  const root = await mkdtemp(path.join(tmp, TEMP_PREFIX))
  const { ctx, helpers } = await storageContext(sdk, root)
  const opened = await pairsMod[PAIR_ENTRY.open](ctx, helpers, {})
  const tables = await mailboxMod[MAILBOX_ENTRY.openTables](ctx, helpers)
  const clock = fakeClock(FIXTURE.t0)
  const logger = recordingLogger()
  const hints = { resourceUpdated: (...args) => route?.hints?.resourceUpdated(...args) }
  const mailbox = mailboxMod[MAILBOX_ENTRY.create]({ tables: tables.tables, hints, now: clock.now })
  const managed = new FakeManaged()
  const domainCalls = []
  const pairs = overridePairs ? overridePairs(overridableStore(opened.store)) : opened.store
  const made = createTools({ pairs, mailbox, managed, domain: tripwire(domainCalls), now: clock.now, logger })
  const populate = typeof made === 'function' ? made : made?.populate
  assert.equal(typeof populate, 'function', 'the C-TOOLS factory returned no populate(server, caller)')
  domainCalls.length = 0

  const gate = httpMod[SUBJECT.gateFactory]({ host: FIXTURE.loopback, secure: false, trustedHosts: [], approvalPort: () => 0, now: clock.now }, { originOf: fakeOriginOf, logger })
  const verifier = new FakeVerifier()
  const route = await httpMod[SUBJECT.endpointFactory]({
    gate, verifier, failures: new FakeFailures(), pairs, originOf: fakeOriginOf, secure: false, readEvents, populate, now: clock.now, logger,
  })
  const server = http.createServer((req, res) => {
    if (new URL(req.url, FIXTURE.urlBase).pathname === PATH_MCP) return route.handler(req, res)
    res.statusCode = 404
    res.end()
  })
  await new Promise((resolve) => server.listen(0, FIXTURE.loopback, resolve))
  const origin = `http://${FIXTURE.loopback}:${server.address().port}`
  const audience = oauthUrls(origin).resource
  const clients = []

  t.after(async () => {
    await Promise.allSettled(clients.map((c) => c.close()))
    await route.close()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    await opened.close()
    await tables.close()
    await ctx.fiber.dispose()
    // Guard the one recursive delete: only the directory this helper made under the canonical temp dir.
    assert.ok(path.dirname(root) === tmp && path.basename(root).startsWith(TEMP_PREFIX), 'refusing to remove ' + root)
    await rm(root, { recursive: true, force: true })
  })

  const issue = (id, fields) => {
    const token = FIXTURE.accessToken(id)
    verifier.issue(token, Object.freeze({ entryKey: FIXTURE.entry(id), clientId: id, audience, generation: FIXTURE.generation, ...fields }))
    return token
  }
  return {
    pairs: opened.store, mailbox, managed, domainCalls, clock, logger,
    /** A paired principal (real `pair` in the store) with a full access token: {token, principalKey}. */
    async full(id, name) {
      const paired = await opened.store.pair(FIXTURE.entry(id), id, name, clock.now())
      assert.equal(paired.ok, true, `harness: pairing ${id} failed: ${JSON.stringify(paired)}`)
      const { principalKey } = opened.store.pairOf(FIXTURE.entry(id))
      return { token: issue(id, { principalKey, scope: SCOPE.full }), principalKey }
    },
    /** An unpaired entry's pair-only access token (scope `agent:pair`, no principal key). */
    pairOnly: (id) => issue(id, { scope: SCOPE.pair }),
    /** The installed SDK's stock client, pinned to 2026-07-28 and connected with `token`. */
    async connect(token) {
      const { Client, StreamableHTTPClientTransport } = await sdkClient(sdk)
      const client = new Client(FIXTURE.clientInfo, { capabilities: {}, versionNegotiation: { mode: { pin: PROTOCOL.version } } })
      const transport = new StreamableHTTPClientTransport(new URL(audience), { authProvider: { token: async () => token } })
      await client.connect(transport, { timeout: WAIT.ackMs })
      clients.push(client)
      return client
    },
  }
}

/** The installed SDK's MCP error codes (ProtocolErrorCode: the unknown-tool -32602 is InvalidParams). */
export const protocolCodes = async (sdk) => (await sdkClient(sdk)).ProtocolErrorCode
