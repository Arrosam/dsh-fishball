/**
 * One connector-side DSH for the C-TOKENS-REVEAL cases, from the installed SDK's real parts: cordis,
 * the launch-environment snapshot DSH's boot provides, the stock local credential store
 * (dsh-credentials-local, the default composition's `ctx.credentials`), dsh-storage over
 * dsh-storage-json with dsh-storage-domain, and a cordis logger exporter.
 *
 * The registry must never use `ctx.credentials` (R-TOK-04, R1: no value on the host at all); the
 * store is there so that "the host credential store holds no token value" is observable: every
 * `set` / `unset` it receives is recorded, and its file is swept like every other file.
 *
 * Fakes, and only these (C-WIRE owns the real ones):
 * - the settings document: `world.doc.tokens`, the connector's native `tokens` list
 *   (`{label, enabled, key}[]`). `world.save(list)` is the user's save of it (through DSH's form or
 *   a hand edit of the document): it writes the list and feeds it to `apply` with the settings
 *   reason. `world.restart()` keeps the document (it is DSH's file);
 * - the K1d `SettingsWriter` (`addToken`, `removeToken`; C-WIRE-2 withdrew `setDesignated`, the user's q5): it writes the document,
 *   then awaits `apply` of the new list, and resolves only after that, or rejects when that sync
 *   refuses it (index.d.ts) or when `world.failSaves` is set (a failed save; nothing is written);
 * - `restoreTokens(previous)`: writes `previous` back into the document and, as C-WIRE's
 *   `settings/document-updated` would, feeds it to `apply` again later (the echo). It never awaits
 *   that `apply`, because it runs inside the registry's queue (relayed surface).
 * Everything observed is public: the registry's answers, the SettingsWriter calls, the logger's
 * records, the credential store's writes, and the files and records under the world's root.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { SKILL_SDK } from '../../../private-skills/support/constants.mjs'
import { importSdk } from '../../../private-skills/support/sdk.mjs'
import { sleep, until } from '../../../support/util.mjs'
import { DSH, FIXTURE, STORE, TOKEN_VALUE, WAIT } from './constants.mjs'
import { makeSubject, syncReason } from './subject.mjs'

const parts = new Map()
/** The SDK parts, imported once per SDK. */
function sdkParts(sdk) {
  if (!parts.has(sdk)) {
    const names = [DSH.cordis, DSH.credentialsLocal, DSH.launchEnvironment, DSH.storage, DSH.storageJson, DSH.storageDomain]
    parts.set(sdk, Promise.all(names.map((n) => importSdk(sdk, n))).then((mods) => Object.fromEntries(names.map((n, i) => [n, mods[i]]))))
  }
  return parts.get(sdk)
}

/** The stock local store, with every write it receives recorded. */
function recordingStore(Local, writes) {
  class Store extends Local {
    async set(ref, value) { writes.push({ op: 'set', ref }); return super.set(ref, value) }
    async unset(ref) { writes.push({ op: 'unset', ref }); return super.unset(ref) }
  }
  Store.Config = Local.Config
  return Store
}

/** Hex SHA-256 of a value (K1 TOKEN_VALUE.digestAlgorithm; the record's encoding, STORE). */
export const digestOf = (value) => createHash(TOKEN_VALUE.digestAlgorithm).update(value).digest(STORE.digestEncoding)

/**
 * The records domain opened by the test itself (to stage a store edited by hand, or one a W2
 * build left), with a schema that accepts any record: the layout is the relayed one (STORE).
 */
async function stagingDomain(sdk, p, ctx, version) {
  const z = createRequire(path.join(SKILL_SDK.versionsDir, sdk, DSH.packageFile))(DSH.zod)
  const { defineDomain, domainTable } = p[DSH.storageDomain]
  const spec = defineDomain({ name: STORE.domain, version, layout: STORE.layout, tables: { [STORE.table]: domainTable(z.any()) } })
  return ctx.storageDomain.open(spec)
}

/**
 * Opens a world over `root` and the shared settings `doc`. `stage(table)` runs before the
 * registry exists, on the records table opened at `stageVersion` (default STORE.version), then the
 * domain is closed again. The registry is then built and fed `doc.tokens` with the start reason.
 */
export async function openWorld(sdk, root, doc, { stage, stageVersion = STORE.version } = {}) {
  const p = await sdkParts(sdk)
  const ctx = new p[DSH.cordis].Context()
  const logs = []
  ctx.logger.exporter({
    levels: { default: DSH.allLevels },
    export: (m) => logs.push({ name: m.name, type: m.type, text: m.args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a) ?? String(a))).join(' ') }),
  })
  const env = p[DSH.launchEnvironment]
  ctx.provide(env.DSH_LAUNCH_ENVIRONMENT_KEY, env.createLaunchEnvironmentSnapshot([{ source: DSH.processLayer, values: {} }]))
  const credentialsFile = path.join(root, p[DSH.credentialsLocal].CREDENTIALS_FILENAME)
  const credentialWrites = []
  await ctx.plugin(recordingStore(p[DSH.credentialsLocal].LocalCredentialProvider, credentialWrites), { path: credentialsFile, dshHome: root, watch: false }).await()
  await ctx.plugin(p[DSH.storage].default ?? p[DSH.storage]).await()
  await ctx.plugin(p[DSH.storageJson], { root: path.join(root, FIXTURE.domainDir) }).await()
  await ctx.plugin(p[DSH.storageDomain], { backend: DSH.backend, routes: {} }).await()
  if (stage) {
    const domain = await stagingDomain(sdk, p, ctx, stageVersion)
    try { await stage(domain.table(STORE.table)) } finally { await domain.close() }
  }

  const echoes = []
  const world = {
    ctx, logs, root, doc, credentialsFile, credentialWrites, echoes,
    /** Every SettingsWriter call, in order. */
    settingsCalls: [],
    /** Every list handed to restoreTokens. */
    restored: [],
    /** When set, every SettingsWriter call rejects before writing (a failed save). */
    failSaves: false,
    /** Records seen by addToken at the moment it was called: proves the record came first (§5.2 step 2). */
    recordAtAdd: [],
    logger: ctx.logger('fbtest-c-tokens'),
    /** The records table as plain `[key, record]` pairs (empty when the domain is not open). */
    records() {
      const table = ctx.storageDomain.get(STORE.domain)?.table(STORE.table)
      return table === undefined ? [] : [...table.entries()]
    },
    /**
     * The records that stand for an entry: the relayed record has a `removed` flag, so a record
     * marked removed is not a live one (whether a delete drops or marks it is the module's choice;
     * either way R-TOK-09 requires the digest gone, which the cases check over every record).
     */
    liveRecords: () => world.records().filter(([, r]) => r?.[STORE.removedField] !== true),
    /** The live record whose digest is the value's, if any. */
    recordOfValue: (value) => world.liveRecords().find(([, r]) => r?.[STORE.digestField] === digestOf(value)),
    /** The user's save of the tokens list (DSH's form or a hand edit): written, then synced. */
    async save(list) {
      doc.tokens = list
      return world.registry.apply(list, syncReason(sdk).settings)
    },
    /** Waits until every restore echo has been synced. */
    async settled() {
      while (echoes.length) await echoes.shift()
    },
    async close() {
      await world.settled().catch(() => {})
      await world.registry?.close?.()
      await ctx.fiber.dispose()
    },
  }

  /**
   * SettingsWriter (K1d): calls run one after another, in call order; each writes the document,
   * then resolves only after the registry's sync of that save, and rejects if the sync refuses it.
   */
  let chain = Promise.resolve()
  const writeThenSync = (call, next) => {
    world.settingsCalls.push(call)
    const run = chain.then(async () => {
      if (world.failSaves) throw new Error(FIXTURE.failedSave)
      const list = next(doc.tokens)
      doc.tokens = list
      const result = await world.registry.apply(list, syncReason(sdk).settings)
      if (result?.ok !== true) throw Object.assign(new Error(FIXTURE.failedSave), { code: result?.code })
    })
    chain = run.catch(() => {})
    return run
  }
  const recordOfKey = (key) => world.liveRecords().find(([k, r]) => k === key || r?.entryKey === key)
  const settings = {
    addToken(item) {
      world.recordAtAdd.push(recordOfKey(item?.key))
      return writeThenSync({ op: 'addToken', item }, (tokens) => [...tokens, item])
    },
    removeToken: (entryKey) => writeThenSync({ op: 'removeToken', entryKey }, (tokens) => tokens.filter((i) => i.key !== entryKey)),
  }
  world.recordOfKey = recordOfKey
  const restoreTokens = (previous) => {
    world.restored.push(previous)
    doc.tokens = previous
    // C-WIRE's write-back comes back as `settings/document-updated` later; never awaited here.
    echoes.push(new Promise((resolve) => setImmediate(resolve)).then(() => world.registry.apply(previous, syncReason(sdk).settings)))
  }
  world.registry = await makeSubject(sdk, { ctx, logger: world.logger, settings, restoreTokens })
  /** Every revocation signal (K1 onRevoked), recorded from before the start sync. */
  world.revocations = []
  world.registry.onRevoked((entryKey, kind, generation) => world.revocations.push({ entryKey, kind, generation }))
  world.startResult = await world.registry.apply(doc.tokens, syncReason(sdk).start)
  return world
}

/**
 * A world in a fresh temp root, closed and removed by `t`'s cleanup. `doc` is the settings
 * document the connector starts with. `world.restart(options)` is a connector restart over the same
 * root and document (`options.stage` edits the records store by hand while it is down).
 */
export async function worldFor(t, sdk, { tokens = [], ...options } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), FIXTURE.tempPrefix))
  const doc = { tokens }
  let world
  t.after(async () => {
    await world?.close()
    assert.ok(path.dirname(root) === os.tmpdir() && path.basename(root).startsWith(FIXTURE.tempPrefix), 'refusing to remove ' + root)
    await rm(root, { recursive: true, force: true })
  })
  const open = async (opts) => {
    world = await openWorld(sdk, root, doc, opts)
    world.restart = async (next = {}) => {
      await world.close()
      return open(next)
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

/** Every file under `dir`, as `[relative path, text]`. */
function filesUnder(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { recursive: true })
    .map((f) => path.join(dir, String(f)))
    .filter((f) => fs.statSync(f).isFile())
    .map((f) => [path.relative(dir, f), fs.readFileSync(f, 'latin1')])
}

/** Every registry answer that could carry a value: list, get of each entry, and the notice. */
export const answersOf = (world) => JSON.stringify([world.registry.list(), world.registry.list().map((e) => world.registry.get(e.entryKey)), world.registry.notice() ?? null])

/**
 * R-TOK-04, R1: where `needle` (a value, or a RegExp of one) appears: the logger's records, every
 * file under the world's root (records, the host credential store's file), every registry answer,
 * the settings document, every SettingsWriter call and every restored list.
 */
export function leaksOf(world, needle) {
  const has = (text) => (typeof needle === 'string' ? text.includes(needle) : needle.test(text))
  const hits = []
  for (const l of world.logs) if (has(l.text)) hits.push('log: ' + l.name)
  for (const [file, text] of filesUnder(world.root)) if (has(text)) hits.push('file: ' + file)
  if (has(answersOf(world))) hits.push('registry answer')
  if (has(JSON.stringify(world.doc))) hits.push('settings document')
  if (has(JSON.stringify(world.settingsCalls))) hits.push('SettingsWriter call')
  if (has(JSON.stringify(world.restored))) hits.push('restoreTokens list')
  return hits
}
