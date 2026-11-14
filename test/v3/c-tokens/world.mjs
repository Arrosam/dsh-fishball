/**
 * One connector-side DSH for the C-TOKENS cases, from the installed SDK's real parts: cordis, the
 * launch-environment snapshot DSH's boot provides, the stock local credential store
 * (dsh-credentials-local, the default composition's `ctx.credentials`), dsh-storage over
 * dsh-storage-json with dsh-storage-domain, and a cordis logger exporter. Fakes, and only these:
 * - the launching environment is a fixture snapshot (AUTH-EP-04 row 3: "value set in environment only");
 * - an *unwritable* store (AUTH-UC-01 E2) is the stock store whose `describe` says `writable: false`
 *   and whose `set` refuses, the two facts the credential seam documents for writability;
 * - every `set` / `unset` the store receives is recorded, so "nothing is written" is observable.
 * Everything observed is public: `ctx.credentials`, the registry's K1 answers, the logger's records
 * and the files under the world's root. No product module is read or imitated.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { importSdk } from '../../private-skills/support/sdk.mjs'
import { sleep, until } from '../../support/util.mjs'
import { DSH, FIXTURE, WAIT } from './constants.mjs'
import { makeSubject } from './subject.mjs'

const parts = new Map()
/** The SDK parts, imported once per SDK. */
function sdkParts(sdk) {
  if (!parts.has(sdk)) {
    const names = [DSH.cordis, DSH.credentialsLocal, DSH.launchEnvironment, DSH.storage, DSH.storageJson, DSH.storageDomain]
    parts.set(sdk, Promise.all(names.map((n) => importSdk(sdk, n))).then((mods) => Object.fromEntries(names.map((n, i) => [n, mods[i]]))))
  }
  return parts.get(sdk)
}

/**
 * The stock local store, with the connector's writes recorded and, when `gate.unwritable`, refused.
 * A write made while `gate.user` is set is the user's own edit of their store: neither recorded nor
 * refused (the user can always edit the file; R-TOK-08 "the user has already set a value").
 */
function recordingStore(Local, writes, gate) {
  class Store extends Local {
    async describe(ref) {
      const info = await super.describe(ref)
      return gate.unwritable ? { ...info, writable: false } : info
    }
    async set(ref, value) {
      if (!gate.user) {
        writes.push({ op: 'set', ref, value })
        if (gate.unwritable) throw new Error('fbtest: this credential store is not writable')
      }
      return super.set(ref, value)
    }
    async unset(ref) {
      if (!gate.user) {
        writes.push({ op: 'unset', ref })
        if (gate.unwritable) throw new Error('fbtest: this credential store is not writable')
      }
      return super.unset(ref)
    }
  }
  Store.Config = Local.Config
  return Store
}

/**
 * A user-set token value of exactly `chars` code points: the leak marker, then `seed` (so two
 * entries' values differ), padded, ending in `last`. Values of 17 or more characters carry the marker.
 */
export function userValue(chars, { last = FIXTURE.pad, seed = '' } = {}) {
  if (chars <= 0) return ''
  return [...(FIXTURE.marker + seed + FIXTURE.pad.repeat(chars))].slice(0, chars - 1).join('') + last
}

/**
 * Opens a world in `root`. `env` is the launching environment (`{REF: value}`); `stored` values are
 * written to the credential file before the store starts (the user set them beforehand);
 * `removed` refs are unset by the user before the registry starts (a credential-store edit made
 * while the connector was down); `unwritable` makes the store refuse writes.
 */
export async function openWorld(sdk, root, { env = {}, stored = {}, removed = [], unwritable = false } = {}) {
  const p = await sdkParts(sdk)
  const ctx = new p[DSH.cordis].Context()
  const logs = []
  ctx.logger.exporter({
    levels: { default: DSH.allLevels },
    export: (m) => logs.push({ name: m.name, type: m.type, text: m.args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a) ?? String(a))).join(' ') }),
  })
  const env_ = p[DSH.launchEnvironment]
  ctx.provide(env_.DSH_LAUNCH_ENVIRONMENT_KEY, env_.createLaunchEnvironmentSnapshot([{ source: DSH.processLayer, values: env }]))

  const credentialsFile = path.join(root, p[DSH.credentialsLocal].CREDENTIALS_FILENAME)
  const writes = []
  const gate = { unwritable, user: false }
  const Store = recordingStore(p[DSH.credentialsLocal].LocalCredentialProvider, writes, gate)
  await ctx.plugin(Store, { path: credentialsFile, dshHome: root, watch: false }).await()
  /** The user's own edit of their credential store, outside the connector. */
  const asUser = async (write) => {
    gate.user = true
    try { await write() } finally { gate.user = false }
  }
  // Values the user stored before the connector ran.
  for (const [ref, value] of Object.entries(stored)) await asUser(() => ctx.credentials.set(ref, value))
  for (const ref of removed) await asUser(() => ctx.credentials.unset(ref))

  await ctx.plugin(p[DSH.storage].default ?? p[DSH.storage]).await()
  await ctx.plugin(p[DSH.storageJson], { root: path.join(root, FIXTURE.domainDir) }).await()
  await ctx.plugin(p[DSH.storageDomain], { backend: 'json', routes: {} }).await()

  const world = {
    ctx, logs, writes, root, credentialsFile,
    logger: ctx.logger('fbtest-c-tokens'),
    /** The value `ref` resolves to now, or undefined. */
    resolve: async (ref) => (await ctx.credentials.resolve(ref))?.value,
    /** The source layer of `ref`'s value (`file`, `env`, …), or undefined. */
    source: async (ref) => (await ctx.credentials.resolve(ref))?.source,
    /** The user changes or removes a value in their own credential store (outside the connector). */
    userSets: (ref, value) => asUser(() => ctx.credentials.set(ref, value)),
    userUnsets: (ref) => asUser(() => ctx.credentials.unset(ref)),
    async close() {
      await world.registry?.close?.()
      await ctx.fiber.dispose()
    },
  }
  world.registry = await makeSubject(sdk, world)
  return world
}

/**
 * A world in a fresh temp root, closed and removed by `t`'s cleanup. `world.restart(next)` is a
 * connector restart: this world's DSH stops and a new one starts over the same root (credential
 * file and storage domain), with the same launching environment and store kind; `next.removed`
 * are the user's unsets while it was down. It returns the new world, whose registry has not been
 * fed any settings yet.
 */
export async function worldFor(t, sdk, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), FIXTURE.tempPrefix))
  let world
  t.after(async () => {
    await world?.close()
    assert.ok(path.basename(root).startsWith(FIXTURE.tempPrefix), 'refusing to remove ' + root)
    await rm(root, { recursive: true, force: true })
  })
  const open = async (opts) => {
    world = await openWorld(sdk, root, opts)
    world.restart = async ({ removed } = {}) => {
      await world.close()
      // `stored` is not replayed: those values are already in the credential file.
      return open({ env: options.env, unwritable: options.unwritable, removed })
    }
    return world
  }
  return open(options)
}

/** Polls `predicate` until it is truthy (WAIT.eventuallyMs); returns its last value. */
export const eventually = (predicate) => until(predicate, WAIT.eventuallyMs, WAIT.pollMs)
/** Watches `predicate` for WAIT.quietMs and returns whether it stayed falsy the whole time. */
export async function staysFalse(predicate) {
  const end = Date.now() + WAIT.quietMs
  while (Date.now() < end) {
    if (await predicate()) return false
    await sleep(WAIT.pollMs)
  }
  return !(await predicate())
}

/** Every file under `dir` except `skip`, as `[relative path, text]`. */
function filesUnder(dir, skip) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { recursive: true })
    .map((f) => path.join(dir, String(f)))
    .filter((f) => f !== skip && fs.statSync(f).isFile())
    .map((f) => [path.relative(dir, f), fs.readFileSync(f, 'latin1')])
}

/**
 * R-TOK-04: where `value` appears outside the credential store: the logger's records, every other
 * file under the world's root (the storage domain included), and every registry answer.
 */
export function leaksOf(world, value) {
  const hits = []
  for (const l of world.logs) if (l.text.includes(value)) hits.push('log: ' + l.name)
  for (const [file, text] of filesUnder(world.root, world.credentialsFile)) if (text.includes(value)) hits.push('file: ' + file)
  const answers = JSON.stringify(world.registry.list()) + JSON.stringify(world.registry.list().map((e) => world.registry.get(e.entryKey)))
  if (answers.includes(value)) hits.push('registry answer')
  return hits
}
