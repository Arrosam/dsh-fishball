/**
 * Integration worlds of the C-UI-BACKEND cases.
 *
 * 1. `contribWorld` — the real contribution service (C-EXT `createContributions`) in a real Cordis
 *    loader of the SDK under test, as test/v3/dsh-connector/contrib/world.mjs builds it:
 *    - the connector is a loader row (`cordis:` built-in) whose apply starts C-EXT and the UI
 *      backend, provides `dshConnectorTools` and (through `backend.provide`) `dshConnectorUi` on that
 *      row's context, and closes the backend when the row goes;
 *    - embed-UI is a real package named `dsh-connector-ui` (a package.json and an entry module)
 *      loaded as its own loader row by file URL, so its identity is its loader entry's package
 *      (R-EXT-03). Its apply opens an inject sub-scope on both services, as a real one does, and
 *      calls `ui.contribute((def) => tools.register(def))` inside an effect of that scope, so
 *      unloading it ends the contribution;
 *    - the K3 hand-over service is a FakeHandover; the K1 mailbox and router are inert, as no
 *      case emits.
 * 2. `routeWorld` (the C-ROUTE suite's world, reused as is) gives a real K3 hand-over service over
 *    fake pairs, tokens and presence; `routedBackend` puts the UI backend on it.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { INSTANCE } from '../../../support/constants.mjs'
import { importInstance, importSdk } from '../../../private-skills/support/sdk.mjs'
import { routeWorld } from '../routing/subject.mjs'
import { DSH, FIXTURE, K2, SUBJECT, SURFACE } from './constants.mjs'
import { FakeCtx, FakeHandover, recordingLogger } from './fakes.mjs'
import { createBackend, uiModule } from './subject.mjs'

const TOOLS = K2.TOOLS_API.service
const json = (value) => JSON.stringify(value)
const hooks = (globalThis[Symbol.for(FIXTURE.hookKey)] ??= new Map())
let worldCounter = 0

async function contributionsModule(sdk) {
  assert.ok(fs.existsSync(SUBJECT.contribEntry), 'the C-EXT module does not exist')
  return importInstance(sdk, path.relative(INSTANCE.dir, SUBJECT.contribEntry))
}

/** Inert K1 ports: no UI case emits an event. */
const inertMailbox = Object.freeze({ commit: async () => ({ ok: false, code: K2.EMIT_REFUSAL.queueFull }), retire: async () => ({ retired: false }), retireContributor: async () => {} })
const inertRouter = Object.freeze({ recipientFor: () => ({ recipient: null, fallback: K2.EMIT_REFUSAL.noAgent }) })

/** The connector row's context for `backend.provide`: Cordis's effect and provide, a recording fetch registry. */
function hostCtx(cctx) {
  const ctx = new FakeCtx()
  ctx.effect = (fn) => cctx.effect(fn)
  ctx.provide = (name, value) => cctx.provide(name, value)
  return ctx
}

/**
 * A world in a fresh temp root, closed and removed by `t`'s cleanup. `embed: false` leaves the
 * embed-UI package out (R-EXT-13: no dsh-connector-ui).
 */
export async function contribWorld(t, sdk, { embed = true } = {}) {
  const root = await mkdtemp(path.join(fs.realpathSync(os.tmpdir()), FIXTURE.tempPrefix))
  let world
  t.after(async () => {
    await world?.close()
    assert.ok(path.dirname(root) === fs.realpathSync(os.tmpdir()) && path.basename(root).startsWith(FIXTURE.tempPrefix), 'refusing to remove ' + root)
    await rm(root, { recursive: true, force: true })
  })
  world = await openContribWorld(sdk, root)
  if (embed) await world.addEmbed()
  return world
}

async function openContribWorld(sdk, root) {
  const [{ Context }, { Loader }, contrib, ui] = await Promise.all([importSdk(sdk, DSH.cordis), importSdk(sdk, DSH.loader), contributionsModule(sdk), uiModule(sdk)])
  const ctx = new Context()
  await ctx.plugin(Loader)
  const loader = ctx.loader
  const worldId = String(++worldCounter)
  const handover = new FakeHandover()
  const logger = recordingLogger()

  const world = {
    sdk, root, loader, handover, logger, ui,
    registry: undefined,
    backend: undefined,
    host: undefined,
    /** `scope`: embed-UI's live inject sub-scope (its `dshConnectorTools` is embed-UI's own), else undefined. */
    embed: { activations: 0, contributions: 0, entryId: undefined, scope: undefined },
    /** A second contribution from embed-UI's own scope (UIB-ST-03 #8): `contribute`'s dispose. */
    contributeAgain: () => world.embed.scope[SURFACE.serviceName].contribute((def) => world.embed.scope[TOOLS].register(def)),
    names: () => world.registry?.list().map((tool) => tool.name) ?? [],
    /** The public name of a UI tool, from K2 (never hard-coded). */
    publicName: (local) => K2.publicNameOf(K2.namespaceOf(SURFACE.uiPackage), local),
    /** One contributed `tools/call` by the fixture caller: the CallToolResult, or `undefined` (unknown tool). */
    call: (local, args) => world.registry.call(world.publicName(local), args, { principal: FIXTURE.caller }),
    async addEmbed() {
      const dir = path.join(root, FIXTURE.pluginsDir, SURFACE.uiPackage)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'package.json'), json({ name: SURFACE.uiPackage, version: FIXTURE.version, type: 'module', main: 'index.mjs' }))
      fs.writeFileSync(path.join(dir, 'index.mjs'), `export function apply(ctx, config) { return globalThis[Symbol.for(${json(FIXTURE.hookKey)})].get(config.world)(ctx, config) }\n`)
      world.embed.entryId = await loader.create({ name: pathToFileURL(path.join(dir, 'index.mjs')).href, config: { world: worldId } })
      await loader.await()
    },
    async disableEmbed() { await loader.update(world.embed.entryId, { disabled: true }); await loader.await() },
    async enableEmbed() { await loader.update(world.embed.entryId, { disabled: null }); await loader.await() },
    async close() {
      hooks.delete(worldId)
      await ctx.fiber.dispose()
    },
  }

  // Embed-UI's apply: an optional dependency on both services, contributing from its own scope.
  hooks.set(worldId, (cctx) => {
    world.embed.activations++
    cctx.inject([TOOLS, SURFACE.serviceName], (scope) => {
      world.embed.contributions++
      world.embed.scope = scope
      scope.effect(() => () => { if (world.embed.scope === scope) world.embed.scope = undefined })
      scope.effect(() => scope[SURFACE.serviceName].contribute((def) => scope[TOOLS].register(def)))
    })
  })

  loader.builtins.connector = {
    name: FIXTURE.connectorRow,
    apply(cctx) {
      const contributions = contrib[SUBJECT.contribFactory]({
        mailbox: inertMailbox, router: inertRouter, sessionExists: () => false, onToolsChanged: () => {}, logger: cctx.logger(FIXTURE.connectorRow),
      })
      contributions.provide(cctx)
      const backend = createBackend(ui, { handover, logger })
      const host = hostCtx(cctx)
      backend.provide(host)
      cctx.effect(() => () => backend.close())
      Object.assign(world, { registry: contributions, backend, host })
    },
  }
  world.connectorId = await loader.create({ name: DSH.builtinPrefix + 'connector' })
  await loader.await()
  return world
}

/** The UI backend over the real K3 hand-over service of a C-ROUTE world; closed by `t`. */
export async function routedBackend(t, sdk) {
  const mod = await uiModule(sdk)
  const w = await routeWorld(t, sdk)
  const backend = createBackend(mod, { handover: w.handover, logger: recordingLogger() })
  const ctx = new FakeCtx()
  backend.provide(ctx)
  t.after(() => { backend.close(); ctx.dispose() })
  return { w, mod, backend, ctx }
}
