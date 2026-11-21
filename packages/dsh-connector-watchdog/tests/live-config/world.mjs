/**
 * The watchdog live-config world: the real row (packages/dsh-connector-watchdog/index.js, bound to
 * the SDK under test) mounted as one loader row on the SDK's real cordis + cordis-plugin-loader, so a
 * settings change is `loader.update(id, {config})` exactly as DSH's settings service commits it.
 * The root carries the services the implementer relayed as the row's surface: `sessionController`
 * (required, unread), `profileContext` (a temp home: briefs.json lives under it), and fake
 * `dshConnectorSessions` (a session the fixture principal manages, an empty bounded read that is
 * recorded, a Stop that is recorded) and `dshConnectorTools` (records the registered tools).
 * Time is node:test MockTimers on setTimeout and Date (the row uses the global timers); real time
 * passes only in `settle`, which spins on setImmediate.
 * A patrol is observed as one `sessions.read` call: the patrol reads the session's new messages
 * with `{maxMessages: readMaxMessages, maxBytes: readMaxBytes}`, and with none it judges nothing.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { INSTANCE } from '../../../../test/support/constants.mjs'
import { importInstance, importSdk } from '../../../../test/private-skills/support/sdk.mjs'
import { caseName } from '../../../../test/v3/contract/package-boundaries/cases.mjs'
import { FIXTURE, SDK, TIME, WAIT, WATCHDOG } from './constants.mjs'

export const caseTest = (sdk, id, row, title, fn) => test(caseName(sdk, id, row, title), { timeout: WAIT.testMs }, fn)
export const rowModule = (sdk) => importInstance(sdk, path.relative(INSTANCE.dir, WATCHDOG.entry))

const spin = () => new Promise((resolve) => setImmediate(resolve))
async function settle() { for (let i = 0; i < WAIT.settleRounds; i++) await spin() }

/** A stored brief in briefs.json's relayed shape. */
export const storedBrief = (sessionId, { paused = false } = {}) => ({
  sessionId, principalKey: FIXTURE.principal.key, purpose: FIXTURE.purpose, scope: '', paused, watermark: 0, sideSessionId: null, briefedAt: TIME.epochMs,
})

/**
 * Opens a world. `briefs`: records written to briefs.json before the row starts (a restart with
 * stored briefs).
 */
export async function watchdogWorld(t, sdk, { config = {}, briefs } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: TIME.epochMs })
  const root = await realpath(os.tmpdir())
  const home = await mkdtemp(path.join(root, FIXTURE.tempPrefix))
  if (briefs !== undefined) {
    const dir = path.join(home, WATCHDOG.store.dir)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, WATCHDOG.store.file), JSON.stringify({ version: WATCHDOG.store.version, briefs }))
  }
  const [{ Context }, { Loader }, mod] = await Promise.all([importSdk(sdk, SDK.cordis), importSdk(sdk, SDK.loader), rowModule(sdk)])
  const ctx = new Context()
  const logs = []
  ctx.logger.exporter({ levels: { default: 3 }, export: (m) => logs.push({ name: m.name, type: m.type, text: m.args.map(String).join(' ') }) })
  await ctx.plugin(Loader)
  const reads = []
  const stops = []
  const tools = new Map()
  const delegates = new Set()
  ctx.provide(WATCHDOG.inject, {})
  ctx.provide(WATCHDOG.services.profile, { name: 'fbtest', home, dir: home, cwd: home })
  ctx.provide(WATCHDOG.services.sessions, {
    apiVersion: WATCHDOG.services.apiVersion,
    delegates: { register(d) { delegates.add(d); return () => delegates.delete(d) } },
    rootOf: (id) => id,
    managerOf: () => FIXTURE.principal.key,
    async read(input) { reads.push({ ...input, at: Date.now() }); return { messages: [], truncated: false } },
    async stop(input) { stops.push(input) },
  })
  ctx.provide(WATCHDOG.services.tools, {
    apiVersion: WATCHDOG.services.apiVersion,
    register(def) { tools.set(def.name, def); return () => { if (tools.get(def.name) === def) tools.delete(def.name) } },
    emit: async () => ({ ok: true, eventId: 'fbtest-event' }),
    mine: () => [...tools.keys()].map((name) => ({ name, publicName: WATCHDOG.name + '.' + name, state: 'active' })),
  })
  ctx.loader.builtins[WATCHDOG.name] = mod
  const id = await ctx.loader.create({ name: SDK.builtinPrefix + WATCHDOG.name, config })
  await ctx.loader.await().catch(() => {})
  await settle()
  t.after(async () => {
    await ctx.fiber.dispose()
    const target = await realpath(home)
    assert.ok(path.basename(target).startsWith(FIXTURE.tempPrefix) && path.dirname(target) === root, 'refusing to remove ' + target)
    await rm(target, { recursive: true, force: true })
  })
  const fiber = () => ctx.loader.resolve(id)?.fiber
  const w = {
    mod, ctx, logs, reads, stops, tools, delegates, home, fiber,
    active: () => fiber()?.state === SDK.fiberActive,
    async configure(next) {
      await ctx.loader.update(id, { config: next }).catch(() => {})
      await ctx.loader.await().catch(() => {})
      await settle()
    },
    async tick(ms) { t.mock.timers.tick(ms); await settle() },
    /** One of Watchdog's tools as the connector would run it for the fixture principal. */
    async call(name, args) {
      const def = tools.get(name)
      assert.ok(def, 'no tool ' + name + ' registered: ' + [...tools.keys()])
      const result = await def.execute(args, { principal: FIXTURE.principal, protocolVersion: FIXTURE.protocolVersion, signal: new AbortController().signal })
      await settle()
      return result
    },
    /** The patrols (reads) of one session since `from` (an index into reads). */
    patrolsOf: (sessionId, from = 0) => reads.slice(from).filter((r) => r.sessionId === sessionId),
  }
  return w
}
