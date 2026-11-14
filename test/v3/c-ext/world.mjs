/**
 * One connector DSH for the C-EXT cases, built from the installed SDK's real cordis and
 * cordis-plugin-loader (read only), as spike V3-S5's probe 1 did (`8f2788e`):
 * - the connector is a loader row (`cordis:` built-in) whose apply starts C-EXT's module
 *   (subject.mjs), so disabling, restarting or reconfiguring that row is a connector unload, reload
 *   or setting change;
 * - every contributor is a real package (a `package.json` with name and version, and an entry
 *   module) loaded as its own loader row by file URL, so its identity is its loader entry's package
 *   (R-EXT-03, S5 I3), and disable / restart / remove are the loader calls DSH itself ends in;
 * - each contributor opens the service in an inject sub-scope, as a real one does, and registers its
 *   tools there; its tools' behaviour is scripted per case.
 * Fakes, and only these, of the frozen K1 interfaces C-EXT talks to: the mailbox (`Mailbox`) and the
 * router (`Router`); plus the session set, the clock and the principals the endpoint would pass. The fakes follow
 * K1's contracts and record every call; nothing in them imitates C-EXT.
 * Everything observed is public: the service's results, the registry's MCP face, the K1 calls the
 * fakes record, and the records the logger exporter receives.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { importSdk } from '../../private-skills/support/sdk.mjs'
import { SKILL_SDK } from '../../private-skills/support/constants.mjs'
import { until } from '../../support/util.mjs'
import { DSH, FIXTURE, K1, K2, WAIT } from './constants.mjs'
import { contributionsModule, startContributions } from './subject.mjs'

const SERVICE = K2.TOOLS_API.service
const json = (value) => JSON.stringify(value)
const hooks = (globalThis[Symbol.for(FIXTURE.hookKey)] ??= new Map())
let worldCounter = 0

/** One SDK's MCP core (the spec-shape oracle; 2.2.0 on both hosts). */
export const mcpCore = (sdk) => import(pathToFileURL(path.join(SKILL_SDK.versionsDir, sdk, SKILL_SDK.nodeModules, DSH.mcpCore.pkg, DSH.mcpCore.entry)).href)

/** K1 `Mailbox`: one ledger per recipient pair; a commit records the hint K1 says it sends. */
class FakeMailbox {
  boxes = new Map()
  commits = []
  hints = []
  retirements = []
  #seq = 0
  box(pk) {
    if (!this.boxes.has(pk)) this.boxes.set(pk, [])
    return this.boxes.get(pk)
  }
  pending(pk) { return this.box(pk).filter((e) => e.state === 'pending') }
  /** Every event C-EXT committed, in any mailbox (fillers excluded). */
  contributed() { return this.commits.map((c) => c.event) }
  /** Set to make the next commit reject (a failing port, decision 2026-11-14: `queue-full`). */
  failNext = false
  /** K1 CommitResult: `duplicate` for a pending same-contributor `dedupeKey`, `queue-full` past maxQueuedInputs. */
  async commit(recipient, draft) {
    if (this.failNext) {
      this.failNext = false
      throw new Error(FIXTURE.marker)
    }
    const pending = this.pending(recipient)
    const namespace = draft.payload?.namespace
    if (draft.dedupeKey !== undefined && pending.some((e) => e.dedupeKey === draft.dedupeKey && e.payload?.namespace === namespace)) return { ok: false, code: K2.EMIT_REFUSAL.duplicate }
    if (pending.length >= K1.QUEUE.maxQueuedInputs) return { ok: false, code: K1.REFUSAL.queueFull }
    const event = { ...structuredClone(draft), eventId: FIXTURE.marker + 'ev-' + ++this.#seq, recipient, state: 'pending' }
    this.box(recipient).push(event)
    this.commits.push({ recipient, event })
    this.hints.push({ recipient, uri: K1.RESOURCE.events.uri })
    return { ok: true, eventId: event.eventId }
  }
  /** A pending event of another producer, to fill a queue (EXT-DT-01 rule 7). */
  fill(recipient, count) {
    for (let i = 0; i < count; i++) this.box(recipient).push({ type: FIXTURE.fillerType, eventId: FIXTURE.marker + 'fill-' + i, state: 'pending', payload: {} })
  }
  /** What a client's `inbox_ack` does to one event. */
  ackEvent(pk, eventId) {
    const event = this.box(pk).find((e) => e.eventId === eventId)
    assert.ok(event, 'harness: no event ' + eventId)
    event.state = 'acked'
  }
  async ack(pk, receipts) {
    for (const r of receipts) this.ackEvent(pk, r.eventId)
    return { ok: true, acked: receipts.length }
  }
  /** K1: replaces a **pending** event by a `retirement` naming it; an acked one stays. */
  async retire(pk, eventId, reason) {
    this.retirements.push({ pk, eventId, reason })
    const event = this.box(pk).find((e) => e.eventId === eventId)
    if (event?.state !== 'pending') return
    event.state = 'retired'
    this.box(pk).push({ type: K1.EVENT_TYPE.retirement, eventId: eventId + '-retired', correlationId: eventId, reason, state: 'pending' })
  }
  /** Every `retirement` event naming `eventId`, in any mailbox. */
  retirementsOf(eventId) { return [...this.boxes.values()].flat().filter((e) => e.type === K1.EVENT_TYPE.retirement && e.correlationId === eventId) }
  /** Whether `eventId` is still in `pk`'s mailbox as acked (it stayed with its client). */
  isAcked(pk, eventId) { return this.box(pk).find((e) => e.eventId === eventId)?.state === 'acked' }
  async summary(pk) { return { pending: this.pending(pk).length, headSequence: this.#seq, mailboxGeneration: FIXTURE.marker } }
  async poll(pk) { return { ok: true, events: this.pending(pk), nextCursor: String(this.#seq), hasMore: false } }
  async hold() {}
  async release() {}
  async drop() { return { droppedAsks: [] } }
}

/** K1 `Router` for contributor events (R-EXT-17): the session's manager, else the designated pair. */
class FakeRouter {
  designated = FIXTURE.pairs.d.principalKey
  managed = new Map([[FIXTURE.session.managed, FIXTURE.pairs.e2.principalKey]])
  subjects = []
  recipientFor(subject) {
    this.subjects.push(subject)
    const recipient = (subject.sessionId && this.managed.get(subject.sessionId)) || this.designated
    return recipient ? { recipient } : { recipient: null, fallback: 'no-fishball' }
  }
}


/** A held tool behaviour: resolves when released, or with `onAbort` when its signal fires. */
export function gate() {
  const reached = Promise.withResolvers()
  const released = Promise.withResolvers()
  return {
    reached: reached.promise,
    release: (result) => released.resolve(result),
    behaviour: (_args, call) => {
      reached.resolve(call)
      return Promise.race([released.promise, new Promise((resolve) => call.signal.addEventListener('abort', () => resolve({ ok: true, data: {} }), { once: true }))])
    },
  }
}

export const ok = (data = {}) => ({ ok: true, data })
const okBehaviour = () => ok()

/** A contributor package and its activations. */
class Contributor {
  calls = []
  behaviour = {}
  registrations = new Map()
  activations = 0
  scopes = 0
  svc = undefined
  live = false
  constructor(world, pkg, { tools, declaredName, onService, definition }) {
    Object.assign(this, { world, pkg, tools, declaredName, onService, extra: definition })
    this.dir = path.join(world.root, FIXTURE.pluginsDir, String(world.contributors.size))
  }
  /** A definition of `name` whose execute records the call and runs the scripted behaviour. */
  tool(name, overrides = {}) {
    const contributor = this
    return {
      name, description: FIXTURE.description, inputSchema: FIXTURE.inputSchema, codes: [FIXTURE.declaredCode], ...this.extra?.(name),
      async execute(args, call) {
        contributor.calls.push({ name, args, call })
        return (contributor.behaviour[name] ?? okBehaviour)(args, call)
      },
      ...overrides,
    }
  }
  /** `svc.register(def)` → `{dispose}` or `{code}` (a ToolContributionError); any other throw fails the case. */
  register(def, svc = this.svc) {
    try {
      return { dispose: svc.register(def) }
    } catch (error) {
      assert.equal(error?.name, 'ToolContributionError', 'register threw something other than a ToolContributionError: ' + error)
      return { code: error.code }
    }
  }
  /** `svc.emit(event)`; a refusal is a returned code, so a throw (sync or async) fails the case. */
  emit(event, svc = this.svc) { return svc.emit(event) }
  get fiber() { return this.world.loader.resolve(this.entryId).fiber }
}

/**
 * A world in a fresh temp root, closed and removed by `t`'s cleanup. Options: `connector` (false:
 * no connector row, EXT-ST-01 #11), `designated` (null: no designated Fishball).
 */
export async function worldFor(t, sdk, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), FIXTURE.tempPrefix))
  let world
  t.after(async () => {
    await world?.close()
    assert.ok(path.basename(root).startsWith(FIXTURE.tempPrefix), 'refusing to remove ' + root)
    await rm(root, { recursive: true, force: true })
  })
  world = await openWorld(sdk, root, options)
  return world
}

async function openWorld(sdk, root, { connector = true, designated } = {}) {
  const [{ Context, Service }, { Loader }] = await Promise.all([importSdk(sdk, DSH.cordis), importSdk(sdk, DSH.loader)])
  const mod = connector ? await contributionsModule(sdk) : undefined
  const ctx = new Context()
  const logs = []
  ctx.logger.exporter({ levels: { default: DSH.allLevels }, export: (m) => logs.push({ name: m.name, type: m.type, text: m.args.map((a) => (typeof a === 'string' ? a : json(a))).join(' ') }) })
  await ctx.plugin(Loader)
  const loader = ctx.loader
  const worldId = String(++worldCounter)
  const clock = { now: FIXTURE.epochMs, advance(ms) { this.now += ms } }
  const mailbox = new FakeMailbox()
  const router = new FakeRouter()
  if (designated === null) router.designated = null
  /** The principals' current names, as the endpoint reads them from the pair store (R-EXT-10). */
  const principalNames = new Map(Object.values(FIXTURE.pairs).map((p) => [p.principalKey, p.name]))
  const sessions = new Set([FIXTURE.session.managed, FIXTURE.session.unmanaged])

  const world = {
    sdk, root, ctx, Context, Service, loader, logs, clock, mailbox, router, principalNames, sessions,
    contributors: new Map(),
    registry: undefined,
    listChanges: 0,
    connectorActivations: 0,
    /** The contributed tools as `tools/list` would list them; none while no connector is up. */
    list: () => world.registry?.list() ?? [],
    names: () => world.list().map((tool) => tool.name),
    listed: (name) => world.names().includes(name),
    /** One `tools/call` by `pair`'s principal, `{key, name}` as the endpoint passes it. */
    call: (pair, name, args, signal) => world.registry.call({ key: pair.principalKey, name: principalNames.get(pair.principalKey) }, name, args, signal),
    logsWith: (needle) => logs.filter((l) => l.text.includes(needle)),
    /** Adds a contributor package and loads its row; `tools` are registered on every activation. */
    async add(pkg, { tools = [FIXTURE.tool.lookup], declaredName, onService, definition, version = FIXTURE.version } = {}) {
      const c = new Contributor(world, pkg, { tools, declaredName, onService, definition })
      world.contributors.set(c.dir, c)
      fs.mkdirSync(c.dir, { recursive: true })
      fs.writeFileSync(path.join(c.dir, 'package.json'), json({ name: pkg, ...(version === null ? {} : { version }), type: 'module', main: 'index.mjs' }))
      const nameExport = declaredName === undefined ? '' : `export const name = ${json(declaredName)}\n`
      fs.writeFileSync(path.join(c.dir, 'index.mjs'), `${nameExport}export function apply(ctx, config) { return globalThis[Symbol.for(${json(FIXTURE.hookKey)})].get(config.world)(ctx, config) }\n`)
      c.entryId = await loader.create({ name: pathToFileURL(path.join(c.dir, 'index.mjs')).href, config: { world: worldId, contributor: c.dir } })
      await loader.await()
      return c
    },
    async disable(c) { await loader.update(c.entryId, { disabled: true }); await loader.await() },
    async enable(c) { await loader.update(c.entryId, { disabled: null }); await loader.await() },
    async restart(c) { await c.fiber.restart(); await loader.await() },
    async uninstall(c) { loader.remove(c.entryId); await loader.await() },
    /** Starts a disable without awaiting it (the owner fiber is disposing, EXT-ST-01 #8b). */
    beginDisable(c) { return loader.update(c.entryId, { disabled: true }) },
    async disableConnector() { await loader.update(world.connectorId, { disabled: true }); await loader.await() },
    async enableConnector() { await loader.update(world.connectorId, { disabled: null }); await loader.await() },
    async restartConnector() { await loader.resolve(world.connectorId).fiber.restart(); await loader.await() },
    async reconfigureConnector(config) { await loader.update(world.connectorId, { config }); await loader.await() },
    /** Waits until the registry reported a list change after `before`. */
    async listChangedSince(before) {
      return until(() => world.listChanges > before, WAIT.settleMs, WAIT.pollMs)
    },
    async close() {
      hooks.delete(worldId)
      await ctx.fiber.dispose()
    },
  }

  hooks.set(worldId, (cctx, config) => {
    const c = world.contributors.get(config.contributor)
    c.activations++
    // The contributor's optional dependency: a sub-scope that activates while the service exists.
    cctx.inject([SERVICE], (scope) => {
      c.svc = scope[SERVICE]
      c.scopes++
      c.live = true
      scope.effect(() => () => { c.live = false })
      for (const name of c.tools) c.registrations.set(name, c.register(c.tool(name)))
      c.onService?.(scope, c)
    })
  })

  if (connector) {
    loader.builtins.connector = {
      name: FIXTURE.connectorRow,
      apply(cctx) {
        world.connectorActivations++
        world.registry = startContributions(mod, cctx, {
          mailbox, router, sessionExists: (id) => sessions.has(id), onToolsChanged: () => { world.listChanges++ }, logger: cctx.logger(FIXTURE.connectorRow), now: () => clock.now,
        })
      },
    }
    world.connectorId = await loader.create({ name: DSH.builtinPrefix + 'connector' })
    await loader.await()
  }
  return world
}

/** Waits for `predicate` (a harness wait, not an oracle) and fails with `what`. */
export async function eventually(predicate, what) {
  assert.ok(await until(predicate, WAIT.settleMs, WAIT.pollMs), 'timed out: ' + what)
}
