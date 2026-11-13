/**
 * The one place that binds the cases to C-MAILBOX's module (`packages/connector/src/mailbox/`).
 *
 * K1 freezes the `Mailbox` interface (commit, poll, ack, summary, retire, hold, release, drop) and
 * C-HTTP's `HintSink` (index.d.ts), but no factory. This seam assumes one, and only here:
 *
 *   <create|open>…Mailbox({ ctx, storageDomain, hints, now }) → Mailbox | Promise<Mailbox>
 *     ctx            a cordis context with DSH's storage domain service (design §3.4: "one durable
 *                    ledger in its own storage domain")
 *     storageDomain  the same service, for a factory that takes it directly
 *     hints          the fake HintSink below (C-HTTP's side, faked as the task says)
 *     now            the injected clock, `() => EpochMs`
 *   an optional `close()` on the mailbox is awaited before the world goes away.
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
import os from 'node:os'
import path from 'node:path'
import { INSTANCE } from '../../support/constants.mjs'
import { linkContractForSourceRun } from '../../support/contract-link.mjs'
import { importInstance, importSdk } from '../../private-skills/support/sdk.mjs'
import { DSH, FIXTURE, SUBJECT } from './constants.mjs'

/** The module's factory, bound to `sdk` (its `@deepseek-ai/*` imports resolve to that SDK). */
async function factoryFor(sdk) {
  assert.ok(fs.existsSync(SUBJECT.entry), `${path.relative(process.cwd(), SUBJECT.entry)} does not exist (C-MAILBOX "Owns" packages/connector/src/mailbox/)`)
  linkContractForSourceRun()
  const mod = await importInstance(sdk, path.relative(INSTANCE.dir, SUBJECT.entry))
  const names = Object.keys(mod).filter((n) => typeof mod[n] === 'function' && SUBJECT.factoryName.test(n))
  assert.equal(names.length, 1, `mailbox/index.js should export exactly one mailbox factory (${SUBJECT.factoryName}); found ${JSON.stringify(names)}`)
  return mod[names[0]]
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

async function openStorage(sdk, root) {
  const [cordis, storage, json, domain] = await Promise.all([DSH.cordis, DSH.storage, DSH.storageJson, DSH.storageDomain].map((n) => importSdk(sdk, n)))
  const ctx = new cordis.Context()
  await ctx.plugin(storage.default ?? storage).await()
  await ctx.plugin(json, { root: path.join(root, FIXTURE.storageDir) }).await()
  await ctx.plugin(domain, DSH.domainConfig).await()
  return ctx
}

/**
 * One mailbox over real DSH storage in a fresh directory, closed and removed by `t`'s cleanup.
 * Returns `{ mailbox, hints, clock, reopen }`; `reopen()` restarts the mailbox over the same files
 * with the same hint sink and clock and returns the new mailbox (also set on the world).
 */
export async function worldFor(t, sdk) {
  const factory = await factoryFor(sdk)
  const root = await mkdtemp(path.join(os.tmpdir(), FIXTURE.tempPrefix))
  const hints = new FakeHints()
  const clock = fakeClock()
  let ctx
  const world = { hints, clock, mailbox: undefined }
  async function open() {
    ctx = await openStorage(sdk, root)
    world.mailbox = await factory({ ctx, storageDomain: ctx.storageDomain, hints, now: clock.now })
    for (const method of SUBJECT.methods) assert.equal(typeof world.mailbox?.[method], 'function', `the mailbox has no ${method}() (K1 Mailbox)`)
    return world.mailbox
  }
  async function shut() {
    await world.mailbox?.close?.()
    await ctx?.fiber.dispose()
    world.mailbox = undefined
  }
  world.reopen = async () => { await shut(); return open() }
  t.after(async () => { await shut(); await rm(root, { recursive: true, force: true }) })
  await open()
  return world
}
