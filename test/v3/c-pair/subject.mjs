/**
 * The one place that binds the C-PAIR cases to C-PAIR's module (`packages/connector/src/pairs/`).
 * The surface is the one Fishball relayed from the dev session (2026-11-14), and nothing else of
 * the module is read:
 *
 * - `openPairStore(ctx, {defineDomain, domainTable}, {logger?})` → `Promise<{store, close}>`, where
 *   `ctx` carries DSH's `storageDomain` and `store` implements K1's `PairStore` (index.d.ts);
 * - `powerOf(pair, clientId)` (pure) → `{scope: 'fishball'}` or `{scope: 'fishball:pair', reason:
 *   'not-paired' | 'id-mismatch'}`: the live scope of R-ID-03 that C-OAUTH and C-HTTP apply to an
 *   access token of `clientId`. An unbound entry has no pair, so its `pair` is `undefined`.
 *
 * The store runs in a real DSH storage domain (dsh-storage over dsh-storage-json in a throwaway
 * root) of the SDK under test, so "durably" (R-ID-03) is a close and reopen of the same files.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { registerHooks } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { INSTANCE } from '../../support/constants.mjs'
import { HARNESS, SKILL_SDK } from '../../private-skills/support/constants.mjs'
import { importInstance, importSdk } from '../../private-skills/support/sdk.mjs'
import { DSH, FIXTURE, SUBJECT } from './constants.mjs'

let hooked = false
/**
 * The per-SDK resolver (sdk.mjs) binds only `@deepseek-ai/*` to the SDK; the connector also imports
 * runtime packages DSH ships outside that scope (`zod`), which the repository does not install.
 * This hook resolves those few names from the same SDK version as the importing, tagged module.
 */
export function resolveRuntimePackages() {
  if (hooked) return
  hooked = true
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const version = context.parentURL === undefined ? null : new URL(context.parentURL).searchParams.get(HARNESS.versionTag)
      if (version === null || !DSH.runtimePackages.includes(specifier)) return nextResolve(specifier, context)
      return nextResolve(specifier, { ...context, parentURL: pathToFileURL(path.join(SKILL_SDK.versionsDir, version, SKILL_SDK.packageFile)).href })
    },
  })
}

/** C-PAIR's entry bound to one SDK, with the two exports the cases use required. */
export async function pairsModule(sdk) {
  assert.ok(fs.existsSync(SUBJECT.entry), `${path.relative(process.cwd(), SUBJECT.entry)} does not exist (C-PAIR "Owns" packages/connector/src/pairs/)`)
  resolveRuntimePackages()
  const mod = await importInstance(sdk, path.relative(INSTANCE.dir, SUBJECT.entry))
  for (const name of [SUBJECT.open, SUBJECT.power]) assert.equal(typeof mod[name], 'function', `the C-PAIR entry exports no ${name}()`)
  return mod
}

/** One DSH storage stack of `sdk` over `root`: the cordis context a connector row would have. */
async function storageContext(sdk, root) {
  const [cordis, storage, json, domain] = await Promise.all([DSH.cordis, DSH.storage, DSH.storageJson, DSH.storageDomain].map((n) => importSdk(sdk, n)))
  const ctx = new cordis.Context()
  await ctx.plugin(storage.default ?? storage).await()
  await ctx.plugin(json, { root: path.join(root, FIXTURE.domainDir) }).await()
  await ctx.plugin(domain, { backend: DSH.backend, routes: {} }).await()
  return { ctx, helpers: { defineDomain: domain.defineDomain, domainTable: domain.domainTable } }
}

/**
 * A pair store in a fresh root, closed and removed by `t`'s cleanup:
 * `{store, power(entryKey, clientId), reopen(), snapshot()}`. `reopen()` closes the store and
 * opens the same files again (a connector restart); `store` then names the new one.
 * @param {import('node:test').TestContext} t
 */
export async function pairWorld(t, sdk) {
  const mod = await pairsModule(sdk)
  const root = await mkdtemp(path.join(os.tmpdir(), FIXTURE.tempPrefix))
  let open
  const start = async () => {
    const { ctx, helpers } = await storageContext(sdk, root)
    const opened = await mod[SUBJECT.open](ctx, helpers, {})
    return { ctx, ...opened }
  }
  const stop = async () => {
    if (open === undefined) return
    const { ctx, close } = open
    open = undefined
    await close()
    await ctx.fiber.dispose()
  }
  t.after(async () => {
    await stop()
    // Guard the one recursive delete: only the directory this helper created under the OS temp dir.
    assert.ok(path.dirname(root) === os.tmpdir() && path.basename(root).startsWith(FIXTURE.tempPrefix), 'refusing to remove ' + root)
    await rm(root, { recursive: true, force: true })
  })
  open = await start()
  const world = {
    get store() { return open.store },
    /** The live power of an access token of `clientId` on `entryKey` (R-ID-03: evaluated now). */
    power: (entryKey, clientId) => mod[SUBJECT.power](open.store.pairOf(entryKey), clientId),
    async reopen() { await stop(); open = await start() },
    /** Every pair as plain data, to show that a refusal changed nothing. */
    snapshot: () => JSON.parse(JSON.stringify(open.store.list())),
  }
  return world
}
