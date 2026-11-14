/**
 * The one place that binds the F-PAIR cases to F-PAIR's module (`packages/core/src/identity/`).
 * The surface is the one Fishball relayed from the dev session (2026-11-15, `dev/v3-f-pair` at
 * `ed5f2b75`); nothing else of the module is read:
 *
 *   createPairing({records, name, now?, createLink?, target, credentials, sdk})
 *     → {link, state(), onChange(fn), nameChanged(), choose(choice, {confirmed})}
 *     credentials()  → {clientId, secret, ref}; `ref` is required with a secret (else TypeError)
 *     link           core's link with the pairing gate (F-LINK's `status`, `start`, `stop`,
 *                    `reconnect`, `callTool`)
 *     state()        → {state, warning, choices, nameIssue}
 *     choose()       never rejects: {ok: true} | {ok: false, code: 'not-confirmed' | 'not-offered' | 'not-saved'}
 *   openRecords(ctx, {defineDomain, domainTable}) → Promise<{table, close}> (a DSH KvTable), and
 *     createRecords(table) → the injected records port {get(origin, ref), put(record),
 *     declined(origin, ref), decline(origin, ref, at)}, keyed by (origin, ref); a record is
 *     {origin, ref, id, name | null, pairedAt, asked?}
 *   generateId(), acceptId(next, prev) → {ok: true, id} | {ok: false, code: 'id-invalid', id: prev},
 *   requestedName(setting): absent → "Fishball", '' → null
 *   constants IDENTITY, PAIRING_STATE, CHOICE, CHOICES_OF, CHOICE_REFUSAL, NO_CHOICES, SCOPE_LIST
 *
 * Fishball's answers of 2026-11-15 (relayed from the dev):
 * - `name` is a getter of the raw `identity.name` setting (`undefined` when absent); core applies
 *   `requestedName` itself;
 * - the caller tells core about a changed `target.url`, `target.tokenRef` or `identity.id` with
 *   `link.reconnect()`, and about a changed `identity.name` with `nameChanged()`;
 * - `state().warning` is `{...bound, advice, inUse}` (K1's `bound`, `inUse` = K1 `principalLabel`
 *   of the bound name and id); `nameIssue` is `{source: 'pair' | 'set_name', code, inUse}`.
 *
 * The world plays F-WIRE's part: DSH-like settings whose `identity.id` save goes through
 * `acceptId` (a refused value leaves the previous one, R-ID-02), the credential store, and the
 * records port in real DSH storage of the SDK under test (dsh-storage over dsh-storage-json in a
 * throwaway root), so `restart()` is a DSH restart over the same files.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { INSTANCE } from '../../support/constants.mjs'
import { linkContractForSourceRun } from '../../support/contract-link.mjs'
import { until } from '../../support/util.mjs'
import { importInstance } from '../../private-skills/support/sdk.mjs'
import { mcpClient } from '../k1/schema-module.mjs'
import { resolveRuntimePackages, storageContext } from '../c-pair/subject.mjs'
import { FakePairs, startFakeConnector } from './fake-connector.mjs'
import { HARNESS, IDENTITY, RELAYED, SETTING, SUBJECT, mcpUrl } from './constants.mjs'

const stacks = new WeakMap()
/** Registers `fn` to run after the test, last registered first (the pairing stops before its fake). */
export function defer(t, fn) {
  if (!stacks.has(t)) {
    const stack = []
    stacks.set(t, stack)
    t.after(async () => { while (stack.length > 0) await stack.pop()() })
  }
  stacks.get(t).push(fn)
}

/** F-PAIR's entry bound to one SDK, with the exports the cases use required. */
export async function identityModule(sdk) {
  assert.ok(fs.existsSync(SUBJECT.entry), `${path.relative(process.cwd(), SUBJECT.entry)} does not exist (F-PAIR "Owns" packages/core/src/identity/)`)
  linkContractForSourceRun()
  resolveRuntimePackages()
  const mod = await importInstance(sdk, path.relative(INSTANCE.dir, SUBJECT.entry))
  for (const name of SUBJECT.functions) assert.equal(typeof mod[name], 'function', `identity/index.js exports no ${name}()`)
  for (const name of SUBJECT.constants) assert.equal(typeof mod[name], 'object', `identity/index.js exports no ${name}`)
  return mod
}

/** DSH-like settings: values, a validated save and change listeners. */
function fakeSettings(mod, initial) {
  // An `undefined` initial value means "not set".
  const values = new Map(Object.entries(initial).filter(([, v]) => v !== undefined))
  const listeners = new Set()
  return {
    get: (key) => values.get(key),
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    /**
     * The user's save, answered `{ok: true}` or `{ok: false, code}`; `identity.id` goes through
     * core's `acceptId` first (R-ID-02), and a refused value leaves the previous one.
     */
    save(key, value) {
      if (key === IDENTITY.idKey) {
        const { ok, code } = mod[SUBJECT.acceptId](value, values.get(key))
        if (!ok) return { ok, code }
      }
      values.set(key, value)
      for (const fn of [...listeners]) fn(key)
      return { ok: true }
    },
    /** An edit made while core was stopped (no notification). */
    edit: (key, value) => { values.set(key, value) },
  }
}

/** Every file under `dir` as one string (the leak oracle reads the stored records raw). */
const treeText = (dir) => (fs.existsSync(dir)
  ? fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => fs.readFileSync(path.join(e.parentPath, e.name), 'utf8')).join('\n')
  : '')

/**
 * One pairing world: a fake connector, fake settings and credential store, the real records port
 * in DSH storage, and core's pairing over core's own link.
 * @param {import('node:test').TestContext} t
 * @param {string} sdk
 * @param {{entries: Array<{entryKey, secret, enabled?}>, refs: Record<string, string | undefined>,
 *   settings: object, store?: object, now?: () => number, extraTokenFields?: object, start?: boolean}} options
 *   `refs` maps token references to stored values; `settings` holds the initial `identity.*` and
 *   `target.tokenRef` (the URL is the fake's); `store` defaults to FakePairs.
 */
export async function pairingWorld(t, sdk, { entries, refs, settings = {}, store = new FakePairs(), now, extraTokenFields, start = true }) {
  const mod = await identityModule(sdk)
  const tmp = fs.realpathSync(os.tmpdir())
  const root = await mkdtemp(path.join(tmp, HARNESS.tempPrefix))
  defer(t, async () => {
    // Guard the one recursive delete: only the directory this helper created under the OS temp dir.
    assert.ok(path.dirname(root) === tmp && path.basename(root).startsWith(HARNESS.tempPrefix), 'refusing to remove ' + root)
    await rm(root, { recursive: true, force: true })
  })
  const f = await startFakeConnector({ store, entries, now, extraTokenFields })
  defer(t, () => f.stop())
  const credentialValues = new Map(Object.entries(refs))
  const s = fakeSettings(mod, { [SETTING.url]: mcpUrl(f.port), ...settings })
  const client = await mcpClient(sdk)
  let open

  async function openAll() {
    // R-ID-10 "generated at first start": the settings row is F-WIRE's, so the world plays it with
    // core's `generateId` and keeps the value, as DSH keeps a saved setting across restarts.
    if (s.get(IDENTITY.idKey) === undefined) s.edit(IDENTITY.idKey, mod[SUBJECT.generateId]())
    const { ctx, helpers } = await storageContext(sdk, root)
    const opened = await mod[SUBJECT.openRecords](ctx, helpers)
    const records = mod[SUBJECT.createRecords](opened.table)
    const pairing = mod[SUBJECT.factory]({
      records,
      name: () => s.get(IDENTITY.nameKey),
      ...(now === undefined ? {} : { now }),
      target: () => s.get(SETTING.url),
      credentials: async () => {
        const ref = s.get(SETTING.tokenRef)
        return { clientId: s.get(IDENTITY.idKey), secret: credentialValues.get(ref), ref }
      },
      sdk: client,
    })
    const unlisten = s.onChange((key) => {
      if (key === IDENTITY.nameKey) pairing.nameChanged()
      else pairing.link.reconnect()
    })
    open = { ctx, opened, records, pairing, unlisten }
    await pairing.link.start()
  }
  async function closeAll() {
    if (open === undefined) return
    const { ctx, opened, pairing, unlisten } = open
    open = undefined
    unlisten()
    await pairing.link.stop()
    await opened.close()
    await ctx.fiber.dispose()
  }
  defer(t, closeAll)

  const world = {
    mod,
    f,
    settings: s,
    get pairing() { return open?.pairing },
    /** `state()` of the pairing: {state, warning, choices, nameIssue}. */
    view: () => open?.pairing.state(),
    /** K3 TargetStatus of core's link. */
    status: () => open?.pairing.link.status(),
    /** The relayed word of an AUTH-ST-03 state / an R-ID-07 choice / a choice refusal. */
    state: (key) => RELAYED.state[key],
    choice: (key) => RELAYED.choice[key],
    /** The user's choice on the warning; `confirmed` is the page's tick. */
    choose: (key, confirmed = true) => open.pairing.choose(RELAYED.choice[key], { confirmed }),
    start: openAll,
    stop: closeAll,
    /** A DSH restart: core and its storage close, then open again over the same files. */
    async restart() { await closeAll(); await openAll() },
    /** The target's origin, the records' first key (R-ID-07: per target and token reference). */
    origin: () => new URL(s.get(SETTING.url)).origin,
    /** The paired record of (this target, `ref`), or undefined (read through the records port). */
    record: async (ref = s.get(SETTING.tokenRef)) => (await open.records.get(world.origin(), ref)) ?? undefined,
    /** The records of this target under every reference the world knows, present ones only. */
    async records() {
      const found = []
      for (const ref of Object.keys(refs)) { const r = await world.record(ref); if (r !== undefined) found.push(r) }
      return found
    },
    /** Stores a value under a reference in the credential store (the user's action). */
    setCredential: (ref, value) => { credentialValues.set(ref, value) },
    /** Everything core stored, raw (the records' storage files). */
    storedText: () => treeText(root),
    /** Waits until the pairing reports AUTH-ST-03 state `key`. */
    async untilView(key, timeoutMs = HARNESS.settleMs) {
      const want = world.state(key)
      await until(() => world.view()?.state === want, timeoutMs, HARNESS.pollMs)
      assert.equal(world.view()?.state, want, `pairing state after ${timeoutMs} ms: ${JSON.stringify(world.view())} (status ${JSON.stringify(world.status())})`)
      return world.view()
    },
    /** Waits until core's link reports target state `state`. */
    async untilStatus(state, timeoutMs = HARNESS.settleMs) {
      await until(() => world.status()?.state === state, timeoutMs, HARNESS.pollMs)
      assert.equal(world.status()?.state, state, `target status after ${timeoutMs} ms: ${JSON.stringify(world.status())} (pairing ${JSON.stringify(world.view())})`)
      return world.status()
    },
  }
  if (start) await openAll()
  return world
}

/**
 * Core's `identity.id` check of one value (R-ID-02), as `{ok: true}` or `{ok: false, code}`:
 * `acceptId(value, previous)` with a valid previous id; the `id` it answers is dropped here (the
 * "previous id stays" oracle reads it through the world's settings save).
 */
export async function checkId(sdk, value, previous) {
  const { ok, code } = (await identityModule(sdk))[SUBJECT.acceptId](value, previous)
  return ok ? { ok } : { ok, code }
}

/** Waits until `predicate()` holds (harness wait only). */
export const untilTrue = (predicate, timeoutMs = HARNESS.settleMs) => until(predicate, timeoutMs, HARNESS.pollMs)
