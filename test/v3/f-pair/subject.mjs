/**
 * The one place that binds the F-PAIR cases to F-PAIR's module (`packages/core/src/identity/`).
 * K1, K2 and K3 freeze no JS entry for it, and the dev session has relayed no surface yet
 * (2026-11-15; spec question 1 to Fishball). This file assumes ONE shape; if the module differs,
 * only this file is adapted and no case changes.
 *
 *   generateId() → string                     R-ID-10: `fb-` + 16 lowercase base32
 *   checkId(value) → {ok: true} | {ok: false, code: 'id-invalid'}   R-ID-02 (the settings validator)
 *   IDENTITY_DEFAULTS.name                    R-NAME-03: 'Fishball' (settings rows are F-WIRE's)
 *   PAIRING_STATE.{noRecord, paired, warnMatch, warnMismatch, needToken, needId, idMismatch, tokenRefused}
 *                                             AUTH-ST-03's states
 *   PAIRING_CHOICE.{continue, newToken}       R-ID-07's two choices
 *   createPairing({target, tokenRef, credentials, settings, records, sdk, logger}) → Pairing
 *     target()      the target MCP URL (standalone `target.url`; hosted: the instance's)
 *     tokenRef()    the opaque token reference (Q-9: standalone `target.tokenRef`; hosted: the
 *                   entry's non-secret key)
 *     credentials   {resolve(ref) → Promise<string | undefined>} (design §6.3, per connection)
 *     settings      {get(key), set(key, value), onChange(fn(key)) → dispose} over `identity.id`,
 *                   `identity.name`, `target.url`, `target.tokenRef`; core writes `identity.id`
 *                   once when it generates it (R-ID-10 "at first start")
 *     records       {get(key), set(key, record), delete(key)}: the non-secret paired records,
 *                   keyed by core (R-ID-07: per target and token reference)
 *     sdk           the `@modelcontextprotocol/client` module (as F-LINK's createLink)
 *     logger        {debug, info, warn, error}
 *   Pairing = {
 *     start(), stop() → Promise<void>
 *     status() → K3 TargetStatus {state, code}
 *     view() → {state: PAIRING_STATE value,
 *               warning: null | {idMatches, name, lastSeenAt, choices: PAIRING_CHOICE values[]},
 *               nameClash: null | {code: 'name-taken' | 'name-invalid', nameInUse: string | null}}
 *     choose(choice) → Promise<void>    the user's choice on the warning (the tick is the page's)
 *   }
 *
 * The world emulates DSH's settings save: a saved `identity.id` passes core's `checkId` first, and
 * a refused value leaves the previous one (R-ID-02, AUTH-EP-03 row 2c); then `onChange` fires.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { INSTANCE } from '../../support/constants.mjs'
import { linkContractForSourceRun } from '../../support/contract-link.mjs'
import { until } from '../../support/util.mjs'
import { importInstance } from '../../private-skills/support/sdk.mjs'
import { mcpClient } from '../k1/schema-module.mjs'
import { FakePairs, startFakeConnector } from './fake-connector.mjs'
import { HARNESS, IDENTITY, SETTING, SUBJECT, mcpUrl } from './constants.mjs'

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
  const mod = await importInstance(sdk, path.relative(INSTANCE.dir, SUBJECT.entry))
  for (const name of [SUBJECT.factory, SUBJECT.generateId, SUBJECT.checkId]) assert.equal(typeof mod[name], 'function', `identity/index.js exports no ${name}()`)
  for (const name of [SUBJECT.defaults, SUBJECT.states, SUBJECT.choices]) assert.equal(typeof mod[name], 'object', `identity/index.js exports no ${name}`)
  return mod
}

/** A recording logger: every line, so a case can show no secret was logged. */
function recordingLogger() {
  const lines = []
  const at = (level) => (...args) => { lines.push({ level, text: args.map((a) => (typeof a === 'string' ? a : String(a?.stack ?? JSON.stringify(a)))).join(' ') }) }
  return { lines, debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error') }
}

/** DSH-like settings: values, a validated save and change listeners. */
function fakeSettings(mod, initial) {
  // An `undefined` initial value means "not set" (R-ID-10: the id is generated at first start).
  const values = new Map(Object.entries(initial).filter(([, v]) => v !== undefined))
  const listeners = new Set()
  const fire = (key) => { for (const fn of [...listeners]) fn(key) }
  return {
    get: (key) => values.get(key),
    /** Core's own write (the generated id). */
    set: (key, value) => { values.set(key, value); fire(key) },
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    /** The user's save, through core's validator for `identity.id` (R-ID-02). */
    save(key, value) {
      if (key === IDENTITY.idKey) {
        const checked = mod[SUBJECT.checkId](value)
        if (!checked.ok) return checked
      }
      values.set(key, value)
      fire(key)
      return { ok: true }
    },
    /** Offline edit with no notification (a change made while core was stopped). */
    edit: (key, value) => { values.set(key, value) },
  }
}

/** The paired-record store (a fake of the storage core is given). */
function fakeRecords() {
  const map = new Map()
  return {
    get: (key) => map.get(key),
    set: (key, record) => { map.set(key, structuredClone(record)) },
    delete: (key) => { map.delete(key) },
    /** Every record as plain data (oracle reads). */
    all: () => [...map.entries()].map(([key, value]) => ({ key, value })),
    get size() { return map.size },
  }
}

/**
 * One pairing world: a fake connector, fake settings / credentials / records, and core's pairing.
 * @param {import('node:test').TestContext} t
 * @param {string} sdk
 * @param {{entries: Array<{entryKey, secret, enabled?}>, refs: Record<string, string | undefined>,
 *   settings: object, store?: object, now?: () => number, extraTokenFields?: object, start?: boolean}} options
 *   `refs` maps token references to stored values (the credential store); `settings` holds the
 *   initial `identity.*` and `target.tokenRef` (the URL is the fake's); `store` defaults to FakePairs.
 */
export async function pairingWorld(t, sdk, { entries, refs, settings = {}, store = new FakePairs(), now, extraTokenFields, start = true }) {
  const mod = await identityModule(sdk)
  const f = await startFakeConnector({ store, entries, now, extraTokenFields })
  defer(t, () => f.stop())
  const credentialValues = new Map(Object.entries(refs))
  const s = fakeSettings(mod, { [SETTING.url]: mcpUrl(f.port), ...settings })
  const records = fakeRecords()
  const logger = recordingLogger()
  const client = await mcpClient(sdk)
  let pairing
  const open = () => mod[SUBJECT.factory]({
    target: () => s.get(SETTING.url),
    tokenRef: () => s.get(SETTING.tokenRef),
    credentials: { resolve: async (ref) => credentialValues.get(ref) },
    settings: s,
    records,
    sdk: client,
    logger,
  })
  const stop = async () => { if (pairing !== undefined) { const p = pairing; pairing = undefined; await p.stop() } }
  defer(t, stop)
  const world = {
    mod,
    f,
    settings: s,
    records,
    logger,
    state: (key) => mod[SUBJECT.states][key],
    choice: (key) => mod[SUBJECT.choices][key],
    get pairing() { return pairing },
    view: () => pairing.view(),
    status: () => pairing.status(),
    async start() { pairing = open(); await pairing.start() },
    stop,
    /** Core stops and starts again over the same settings and records (a restart of the DSH). */
    async restart() { await stop(); await world.start() },
    /** Stores a value under a reference in the credential store (the user's action). */
    setCredential: (ref, value) => { credentialValues.set(ref, value) },
    /** Waits until the pairing view reports AUTH-ST-03 state `key`. */
    async untilView(key, timeoutMs = HARNESS.settleMs) {
      const want = world.state(key)
      await until(() => pairing?.view()?.state === want, timeoutMs, HARNESS.pollMs)
      assert.equal(pairing?.view()?.state, want, `pairing state after ${timeoutMs} ms: ${JSON.stringify(pairing?.view())} (status ${JSON.stringify(pairing?.status())})`)
      return pairing.view()
    },
    /** Waits until core reports target state `state`. */
    async untilStatus(state, timeoutMs = HARNESS.settleMs) {
      await until(() => pairing?.status()?.state === state, timeoutMs, HARNESS.pollMs)
      assert.equal(pairing?.status()?.state, state, `target status after ${timeoutMs} ms: ${JSON.stringify(pairing?.status())} (view ${JSON.stringify(pairing?.view())})`)
      return pairing.status()
    },
  }
  if (start) await world.start()
  return world
}

/** Waits until `predicate()` holds (harness wait only). */
export const untilTrue = (predicate, timeoutMs = HARNESS.settleMs) => until(predicate, timeoutMs, HARNESS.pollMs)
