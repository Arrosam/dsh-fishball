/**
 * The one place that binds the cases to C-MAILBOX's module (`packages/connector/src/mailbox/`).
 *
 * K1 freezes the `Mailbox` interface (commit, poll, ack, summary, retire, hold, release, drop) and
 * C-HTTP's `HintSink` (index.d.ts). The module's entry (mailbox/index.js) composes it in two steps,
 * and this seam calls both, only here:
 *
 *   openMailboxTables(ctx, { defineDomain, domainTable }) → Promise<{ tables, close }>
 *     ctx            a cordis context with DSH's storage domain service (design §3.4: "one durable
 *                    ledger in its own storage domain"); the module opens its domain through it
 *     defineDomain, domainTable   from `@deepseek-ai/dsh-storage-domain` of the SDK under test
 *   createMailbox({ tables, hints, now }) → Mailbox
 *     hints          the fake HintSink below (C-HTTP's side, faked as the task says)
 *     now            the injected clock, `() => EpochMs`
 *     maxQueuedInputs is not passed, so the K1 default (QUEUE.maxQueuedInputs) applies.
 *   The mailbox has no close; the `close()` from openMailboxTables is awaited before the world goes away.
 *
 * `poll(principalKey, cursor, limit)` with `limit` undefined stands for `inbox_poll` without
 * `limit` (EVT-BVA-01 rows 1–2 "default"): the tool's `limit` is optional, the mailbox serves it.
 *
 * The world is real DSH storage (dsh-storage + dsh-storage-json + dsh-storage-domain of the SDK
 * under test) in a throwaway directory, so `reopen()` is a restart over the same durable files.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { registerHooks } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { INSTANCE } from '../../support/constants.mjs'
import { linkContractForSourceRun } from '../../support/contract-link.mjs'
import { HARNESS, SKILL_SDK } from '../../private-skills/support/constants.mjs'
import { importInstance, importSdk } from '../../private-skills/support/sdk.mjs'
import { DSH, FIXTURE, SUBJECT } from './constants.mjs'

/**
 * Runtime packages outside `@deepseek-ai/` that the mailbox imports (store.js validates its rows
 * with `zod`). DSH ships them in each SDK and a profile resolves them from there, but the repo has
 * no install of its own and sdk.mjs maps only `@deepseek-ai/*`. So, as body-soul-env.mjs does for
 * one runtime, these names resolve from the SDK that tagged the importing module.
 */
const RUNTIME_PACKAGES = Object.freeze(['zod'])

registerHooks({
  resolve(specifier, context, nextResolve) {
    const version = RUNTIME_PACKAGES.includes(specifier) && context.parentURL ? new URL(context.parentURL).searchParams.get(HARNESS.versionTag) : null
    if (!version) return nextResolve(specifier, context)
    return nextResolve(specifier, { ...context, parentURL: pathToFileURL(path.join(SKILL_SDK.versionsDir, version, SKILL_SDK.packageFile)).href })
  },
})

/** mailbox/index.js's two composition entry points (the module's own names, not K1 values). */
const ENTRY = Object.freeze({ openTables: 'openMailboxTables', create: 'createMailbox' })

/** The module's two entry points, bound to `sdk` (its `@deepseek-ai/*` imports resolve to that SDK). */
async function moduleFor(sdk) {
  assert.ok(fs.existsSync(SUBJECT.entry), `${path.relative(process.cwd(), SUBJECT.entry)} does not exist (C-MAILBOX "Owns" packages/connector/src/mailbox/)`)
  linkContractForSourceRun()
  const mod = await importInstance(sdk, path.relative(INSTANCE.dir, SUBJECT.entry))
  for (const name of Object.values(ENTRY)) assert.equal(typeof mod[name], 'function', `mailbox/index.js does not export ${name}()`)
  return { openTables: mod[ENTRY.openTables], create: mod[ENTRY.create] }
}

/**
 * C-HTTP's `HintSink`, faked: it records every `resourceUpdated` call with all its arguments, so a
 * case can count the hints a pair's listen streams would get and see that a hint carries no body.
 */
export class FakeHints {
  calls = []
  resourceUpdated(...args) { this.calls.push(args) }
  /** The hints addressed to `principalKey`. */
  for(principalKey) { return this.calls.filter(([key]) => key === principalKey) }
}

/** An injected clock; `advance` moves it. */
export function fakeClock(start = FIXTURE.epochMs) {
  let ms = start
  return { now: () => ms, advance: (by) => { ms += by } }
}

/** A cordis context with DSH storage over `root`, and the SDK's storage-domain module (its `defineDomain`, `domainTable`). */
async function openStorage(sdk, root) {
  const [cordis, storage, json, domain] = await Promise.all([DSH.cordis, DSH.storage, DSH.storageJson, DSH.storageDomain].map((n) => importSdk(sdk, n)))
  const ctx = new cordis.Context()
  await ctx.plugin(storage.default ?? storage).await()
  await ctx.plugin(json, { root: path.join(root, FIXTURE.storageDir) }).await()
  await ctx.plugin(domain, DSH.domainConfig).await()
  return { ctx, domain }
}

/**
 * One mailbox over real DSH storage in a fresh directory, closed and removed by `t`'s cleanup.
 * Returns `{ mailbox, hints, clock, reopen }`; `reopen()` restarts the mailbox over the same files
 * with the same hint sink and clock and returns the new mailbox (also set on the world).
 */
export async function worldFor(t, sdk) {
  const { openTables, create } = await moduleFor(sdk)
  const root = await mkdtemp(path.join(os.tmpdir(), FIXTURE.tempPrefix))
  const hints = new FakeHints()
  const clock = fakeClock()
  let ctx
  let store
  const world = { hints, clock, mailbox: undefined }
  async function open() {
    const opened = await openStorage(sdk, root)
    ctx = opened.ctx
    store = await openTables(ctx, opened.domain)
    world.mailbox = create({ tables: store.tables, hints, now: clock.now })
    for (const method of SUBJECT.methods) assert.equal(typeof world.mailbox?.[method], 'function', `the mailbox has no ${method}() (K1 Mailbox)`)
    return world.mailbox
  }
  async function shut() {
    await store?.close()
    await ctx?.fiber.dispose()
    store = undefined
    world.mailbox = undefined
  }
  world.reopen = async () => { await shut(); return open() }
  t.after(async () => { await shut(); await rm(root, { recursive: true, force: true }) })
  await open()
  return world
}
