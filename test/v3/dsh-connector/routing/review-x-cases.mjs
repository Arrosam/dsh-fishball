/**
 * R-FIX-CONNECTOR black-box rows for the deep review's findings on the session domain
 * (.runtime/reports/review-x-dsh-connector.md): F01 grant revocation fails closed, F04 a failed
 * settlement leaves the offer answerable, F05 a failed succession keeps its grants, F08 a reject needs
 * a reason and no risk, F09 the V2 session helpers are gone. Expected outcomes are the requirements
 * the parent relayed for the task (each row names its finding); no domain module body was read.
 *
 * Level: the REAL routing and mailbox (routeWorld: real DSH storage of the SDK under test) with the
 * REAL session domain composed over them (`createSessionDomain`, as C-WIRE composes it: grants,
 * permissions, prompts). DSH is reached only through its approval waterfall on the world's context
 * (a permission request for a shell call whose arguments the session log carries); the DSH services
 * the session port requires are stubs no row reads. A storage seam on the context makes chosen table
 * writes reject, as a backend that refused the write. F01's expiry, discard and sweep rows use the
 * real `createGrants` over an in-memory table with a fake clock and timers.
 *
 * Techniques: State Transition (Active → revoke with a failed delete → Revoked-unstored → retry →
 * Gone; a sweep that failed its delete → handed over again), Decision Table (F08: decision × risk ×
 * reason; F05: where the succession fails), Boundary Value (a grant at its end time and one tick
 * before), Equivalence Partitioning (each way a grant ends).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { APPROVAL_DECISION, EVENT_TYPE, GRANT_KIND, REFUSAL, RISK, SETTLEMENT_OUTCOME, SETTLED_BY } from '../../../../packages/dsh-connector/mcp-schema/index.js'
import { INSTANCE } from '../../../support/constants.mjs'
import { importInstance } from '../../../private-skills/support/sdk.mjs'
import { caseName } from '../../contract/package-boundaries/cases.mjs'
import { resolveRuntimePackages } from '../pairs/subject.mjs'
import { descriptor, pendingOf, quiet, settlementOf, until } from './cases.mjs'
import { FIXTURE, REVIEW_X as RX, WAIT } from './constants.mjs'
import { mailboxPort } from './fakes.mjs'
import { routeWorld } from './subject.mjs'

const T = Object.freeze({ timeout: WAIT.testMs })
const D = RX.dsh
const S = RX.sessions
const row = (sdk, id, part, title, fn) => test(caseName(sdk, id, part, title), T, fn)

// ------------------------------------------------------------------------------------------------
// Modules

const loaded = new Map()
/** A connector module bound to `sdk`, with `names` required as exports. */
function moduleOf(sdk, entry, names = []) {
  const key = sdk + '\0' + entry
  if (!loaded.has(key)) {
    loaded.set(key, (async () => {
      assert.ok(fs.existsSync(entry), `${entry} does not exist`)
      resolveRuntimePackages()
      const mod = await importInstance(sdk, path.relative(INSTANCE.dir, entry))
      for (const name of names) assert.equal(typeof mod[name], 'function', `${path.basename(entry)} exports no ${name}()`)
      return mod
    })())
  }
  return loaded.get(key)
}

// ------------------------------------------------------------------------------------------------
// Seams

const injected = () => Object.assign(new Error(RX.injected), { injected: true })
const TABLE_WRITES = Object.freeze(['put', 'delete', 'update', 'deleteMany'])

/**
 * Wraps `ctx.storageDomain.open` so a row can make chosen table writes reject (the backend refused
 * them; the real table is not touched). `fail({domain, table, op, skip, times})` arms a fault: the
 * first `skip` matching writes pass, the next `times` reject. Returns `{stop, count()}`.
 */
function storageSeam(ctx) {
  const faults = new Set()
  const facility = ctx.storageDomain
  const open = facility.open.bind(facility)
  facility.open = async (spec) => {
    const domain = await open(spec)
    const handles = new Map()
    const wrap = (name) => new Proxy(domain.table(name), {
      get(target, prop) {
        const value = Reflect.get(target, prop, target)
        if (typeof value !== 'function') return value
        if (!TABLE_WRITES.includes(prop)) return value.bind(target)
        return (...args) => {
          const fault = [...faults].find((f) => f.domain === domain.name && f.table === name && f.op === prop)
          if (fault !== undefined) {
            if (fault.skip > 0) fault.skip -= 1
            else if (fault.times > 0) { fault.times -= 1; fault.failed += 1; return Promise.reject(injected()) }
          }
          return value.apply(target, args)
        }
      },
    })
    return new Proxy(domain, {
      get(obj, prop) {
        if (prop === 'table') return (name) => { if (!handles.has(name)) handles.set(name, wrap(name)); return handles.get(name) }
        const value = Reflect.get(obj, prop, obj)
        return typeof value === 'function' ? value.bind(obj) : value
      },
    })
  }
  return {
    fail({ domain, table, op, skip = 0, times = Number.POSITIVE_INFINITY }) {
      const fault = { domain, table, op, skip, times, failed: 0 }
      faults.add(fault)
      return { stop: () => { faults.delete(fault) }, count: () => fault.failed }
    },
    /** The stored records of one table, read past the seam (DSH's own open domain). */
    records: ({ domain, table }) => [...(facility.get(domain)?.table(table).entries() ?? [])],
  }
}

/**
 * The mailbox port routing gets: the routing fakes' port plus C-MAILBOX `stage`, with two switches
 * a row flips: `failSettlement` rejects every `settlement` commit, `failStage` rejects `stage`.
 */
function reviewPort(switches) {
  return (real) => {
    const base = mailboxPort(real)
    return {
      ...base,
      commit: (recipient, draft) => (switches.failSettlement && draft?.type === EVENT_TYPE.settlement ? Promise.reject(injected()) : base.commit(recipient, draft)),
      stage: (...args) => (switches.failStage ? Promise.reject(injected()) : real.stage(...args)),
    }
  }
}

// ------------------------------------------------------------------------------------------------
// The world: routing, mailbox and the session domain

/** Provides each DSH service the session port requires as a stub (no row reads one: no session is ever attached). */
function stubServices(ctx) {
  const stubs = { sessions: { get: () => undefined }, sessionController: {}, agents: { list: () => [] }, workspaceRegistry: { list: () => [] } }
  for (const name of D.services) ctx.provide(name, stubs[name])
}

/**
 * One world for `t`: A (and B) paired, sessions S and T, the session domain composed over the real
 * routing. Returns `{w, d, seam, switches, A, B, call(...)}`.
 */
async function domainWorld(t, sdk) {
  const mod = await moduleOf(sdk, RX.domainEntry, [RX.domainFactory])
  const switches = { failSettlement: false, failStage: false }
  let seam
  const w = await routeWorld(t, sdk, { port: reviewPort(switches), prepare: (ctx) => { seam = storageSeam(ctx); stubServices(ctx) } })
  const d = await mod[RX.domainFactory](w.ctx, { storageDomain: w.helpers, readLimits: () => RX.readLimits, routing: w.routing, logger: w.logger })
  w.beforeClose(() => d.close())
  // Registered after the domain, so it runs first: every call still waiting is aborted before the domain closes.
  const calls = []
  w.beforeClose(() => { for (const c of calls) c.control.abort() })
  const A = w.principal(RX.ids.a)
  const B = w.principal(RX.ids.b)
  for (const s of Object.values(S)) w.session(s)
  let n = 0
  /**
   * A permission request through DSH's approval waterfall for one shell call of `command` in
   * `sessionId`. The stock prompt (the waterfall's `next`) waits until the call is aborted.
   * Returns `{outcome, settled(), control, command}`.
   */
  function call(sessionId, command) {
    n += 1
    const callId = `call_fbtest_rx_${n}`
    const events = [{ type: D.assistantEvent, data: { message: { content: [{ type: D.toolCallBlock, id: callId, name: RX.shellTool, arguments: JSON.stringify({ [RX.shellArgument]: command }) }] } } }]
    const agent = { id: sessionId, session: { snapshotEvents: () => events } }
    const control = new AbortController()
    const stock = () => new Promise((resolve) => control.signal.addEventListener('abort', () => resolve(D.outcome.cancelled), { once: true }))
    const outcome = w.ctx.waterfall(agent, D.approvalWaterfall, { agent, toolName: RX.shellTool, callId, reason: RX.dshReason, signal: control.signal }, stock)
    let done = false
    outcome.then(() => { done = true }, () => { done = true })
    const c = { outcome, settled: () => done, control, command }
    calls.push(c)
    return c
  }
  return { w, d, seam, switches, A, B, call }
}

/** The live offer of `sessionId` whose arguments carry `command`, or undefined. */
const offerFor = (x, sessionId, command) => x.w.routing.liveOffers(sessionId).find((o) => o.descriptor.arguments.includes(command))

/** A call that is offered: the request and its live offer. */
async function asked(x, sessionId, command) {
  const c = x.call(sessionId, command)
  await until(() => offerFor(x, sessionId, command) !== undefined || c.settled(), `an offer for ${command}`)
  const offer = offerFor(x, sessionId, command)
  // The outcome is read only when there is no offer: a message is built eagerly, and the call waits while offered.
  if (offer === undefined) assert.fail(`${command} was not offered (it settled: ${await c.outcome})`)
  return { ...c, offer, approvalId: offer.descriptor.approvalId }
}

/** What a call of `command` in `sessionId` meets now: `covered` (allowed once, no offer) or `offered` (then aborted). */
async function fateOf(x, sessionId, command) {
  const c = x.call(sessionId, command)
  await until(() => c.settled() || offerFor(x, sessionId, command) !== undefined, `${command} to be covered or offered`)
  if (offerFor(x, sessionId, command) !== undefined) {
    c.control.abort()
    return 'offered'
  }
  assert.equal(await c.outcome, D.outcome.allowed, `${command} settled without an offer, but not allowed once`)
  return 'covered'
}

const answer = (x, request, a, principalKey = x.A) => x.d.interactions.answerApproval({ approvalId: request.approvalId, answer: a, principalKey })
const allow = () => ({ decision: APPROVAL_DECISION.allow, risk: RISK.low, reason: RX.allowReason })
const exactGrant = (expiresAt = Date.now() + RX.grantMs) => ({ decision: APPROVAL_DECISION.grant, risk: RISK.low, reason: RX.allowReason, grant: { kind: GRANT_KIND.exact, expiresAt } })

/** A grant of A's for one exact call of `command` in `sessionId` (A manages it): returns `{grantId, command}`. */
async function grantFor(x, sessionId, command) {
  const r = await asked(x, sessionId, command)
  const reply = await answer(x, r, exactGrant())
  assert.equal(reply?.ok, true, `harness: the grant answer was refused: ${JSON.stringify(reply)}`)
  assert.equal(await r.outcome, D.outcome.allowed, 'harness: the granting call did not run')
  assert.equal(await fateOf(x, sessionId, command), 'covered', 'harness: the new grant does not cover its own call')
  return { grantId: reply.grantId, command }
}
async function manage(x, sessionId, key) {
  assert.deepEqual(await x.w.managed.manage(sessionId, key), { ok: true }, 'harness: manage refused')
}
const listed = async (x) => (await x.d.interactions.listGrants()).map((g) => g.grantId)

/** A promise's end as data: `{value}` or `{error}`. */
const ended = (promise) => Promise.resolve(promise).then((value) => ({ value }), (error) => ({ error }))
/** "The operation reports failure": it rejected, or answered `operation-failed`; never a success. */
function assertFailed(end, what) {
  if (end.error !== undefined) return
  assert.equal(end.value?.ok, false, `${what} reported success: ${JSON.stringify(end.value)}`)
  assert.equal(end.value.code, REFUSAL.operationFailed, `${what}: ${JSON.stringify(end.value)}`)
}
const grantDeletes = (x, options = {}) => x.seam.fail({ ...RX.grantsDomain, op: 'delete', ...options })

// ------------------------------------------------------------------------------------------------
// F01 — the domain over real storage

function f01Domain(sdk) {
  row(sdk, 'RX-F01', 'ST (a, b) revoke with a failed delete', 'revoke of A\'s active grant whose durable delete fails → never success (rejects / operation-failed); from then on the grant covers no call and is not listed', async (t) => {
    const x = await domainWorld(t, sdk)
    await manage(x, S.s, x.A)
    const g = await grantFor(x, S.s, RX.command(1))
    const failing = grantDeletes(x)
    const end = await ended(x.d.interactions.revokeGrant({ grantId: g.grantId, reason: RX.reason, principalKey: x.A }))
    assert.ok(failing.count() > 0, 'harness: the revoke never tried to delete the record')
    assertFailed(end, 'the revoke whose delete failed')
    assert.equal(await fateOf(x, S.s, g.command), 'offered', 'the grant still covers its call after a revoke whose delete failed')
    assert.ok(!(await listed(x)).includes(g.grantId), 'grants_list still shows the grant')
  })
  row(sdk, 'RX-F01', 'ST (c) retry after a failed delete', 'a later revoke of the same id, the delete now working → success ({ok: true}); the record is gone from storage; still covers nothing', async (t) => {
    const x = await domainWorld(t, sdk)
    await manage(x, S.s, x.A)
    const g = await grantFor(x, S.s, RX.command(1))
    const failing = grantDeletes(x)
    assertFailed(await ended(x.d.interactions.revokeGrant({ grantId: g.grantId, reason: RX.reason, principalKey: x.A })), 'the first revoke')
    failing.stop()
    assert.deepEqual(await x.d.interactions.revokeGrant({ grantId: g.grantId, reason: RX.reason, principalKey: x.A }), { ok: true })
    assert.deepEqual(x.seam.records(RX.grantsDomain).filter(([k]) => k === g.grantId), [], 'the grant record is still stored')
    assert.equal(await fateOf(x, S.s, g.command), 'offered')
  })
  row(sdk, 'RX-F01', 'ST (d) the successful path', 'revoke with a working delete → {ok: true}; the call is offered again; a second revoke → ended', async (t) => {
    const x = await domainWorld(t, sdk)
    await manage(x, S.s, x.A)
    const g = await grantFor(x, S.s, RX.command(1))
    assert.deepEqual(await x.d.interactions.revokeGrant({ grantId: g.grantId, reason: RX.reason, principalKey: x.A }), { ok: true })
    assert.equal(await fateOf(x, S.s, g.command), 'offered')
    assert.ok(!(await listed(x)).includes(g.grantId))
    assert.deepEqual(await x.d.interactions.revokeGrant({ grantId: g.grantId, reason: RX.reason, principalKey: x.A }), { ok: false, code: REFUSAL.grantEnded })
  })
  row(sdk, 'RX-F01', 'ST (e) end of management with a failed delete', 'Take back sweeps A\'s grant while its delete fails; S handed back to A → the grant still covers nothing and is not listed (never revived)', async (t) => {
    const x = await domainWorld(t, sdk)
    await manage(x, S.s, x.A)
    const g = await grantFor(x, S.s, RX.command(1))
    const failing = grantDeletes(x)
    assert.deepEqual(await x.w.handover.takeBack(S.s), { ok: true })
    await until(() => failing.count() > 0, 'the sweep to try the grant\'s delete')
    await manage(x, S.s, x.A)
    await quiet()
    assert.equal(await fateOf(x, S.s, g.command), 'offered', 'a grant whose sweep delete failed covers again after the session came back')
    assert.ok(!(await listed(x)).includes(g.grantId))
  })
}

// ------------------------------------------------------------------------------------------------
// F01 (e) — createGrants over an in-memory table, fake clock and timers

/** A KvTable (dsh-storage-domain's members) over a Map; `failDeletes` makes `delete` reject. */
class MapTable {
  #rows = new Map()
  failDeletes = false
  deleteCalls = 0
  get(key) { return this.#rows.get(key) }
  entries() { return new Map(this.#rows).entries() }
  keys() { return new Map(this.#rows).keys() }
  get size() { return this.#rows.size }
  async put(key, value) { this.#rows.set(key, value) }
  async delete(key) {
    this.deleteCalls += 1
    if (this.failDeletes) throw injected()
    return this.#rows.delete(key)
  }
  async update(key, fn) { const next = fn(this.#rows.get(key)); this.#rows.set(key, next); return next }
}
/** `{setTimeout, clearTimeout}` that fire only on `runAll()`. */
function fakeTimers() {
  const pending = new Map()
  let id = 0
  return {
    setTimeout: (fn) => { id += 1; pending.set(id, fn); return id },
    clearTimeout: (handle) => { pending.delete(handle) },
    async runAll() { const due = [...pending.values()]; pending.clear(); for (const fn of due) await fn() },
  }
}
/** The real createGrants over a MapTable; A manages S until `manager.set` says otherwise. */
async function grantsUnit(sdk) {
  const mod = await moduleOf(sdk, RX.grantsEntry, [RX.grantsFactory])
  const table = new MapTable()
  const managers = new Map([[S.s, FIXTURE.principal(RX.ids.a)]])
  let now = RX.t0
  const timers = fakeTimers()
  const logger = { warn() {}, info() {}, debug() {}, error() {} }
  const grants = mod[RX.grantsFactory]({ table, managerOf: (s) => managers.get(s), now: () => now, timers, logger })
  const A = FIXTURE.principal(RX.ids.a)
  const args = { [RX.shellArgument]: RX.command(1) }
  const expiresAt = RX.t0 + RX.grantMs
  const id = await grants.create({ sessionId: S.s, principalKey: A, toolName: RX.shellTool, args, spec: { kind: GRANT_KIND.exact, expiresAt } })
  assert.equal(typeof id, 'string', 'harness: create gave no grant id')
  return {
    grants, table, managers, timers, A, args, expiresAt, id,
    setNow: (ms) => { now = ms },
    covers: () => grants.cover(S.s, RX.shellTool, args),
    listedIds: () => grants.list().map((g) => g.grantId),
  }
}

function f01Unit(sdk) {
  row(sdk, 'RX-F01', 'BVA (e) expiry with a failed delete', 'one tick before its end the grant covers; at its end time, its delete failing, it covers nothing and is not listed', async () => {
    const u = await grantsUnit(sdk)
    u.setNow(u.expiresAt - RX.tickMs)
    assert.equal(u.covers(), u.id, 'harness: the grant does not cover before its end')
    u.table.failDeletes = true
    u.setNow(u.expiresAt)
    await u.timers.runAll()
    assert.equal(u.covers(), undefined, 'a grant at its end time still covers')
    assert.ok(!u.listedIds().includes(u.id))
    u.grants.stop()
  })
  row(sdk, 'RX-F01', 'EP (e) discard with a failed delete', 'discard of a grant whose delete fails → the grant covers nothing at once and is not listed', async () => {
    const u = await grantsUnit(sdk)
    u.table.failDeletes = true
    await ended(u.grants.discard(u.id))
    assert.ok(u.table.deleteCalls > 0, 'harness: discard never tried the delete')
    assert.equal(u.covers(), undefined, 'a discarded grant whose delete failed still covers')
    assert.ok(!u.listedIds().includes(u.id))
    u.grants.stop()
  })
  row(sdk, 'RX-F01', 'ST (e) sweep with a failed delete', 'S leaves A\'s management; the end-of-management sweep\'s delete fails; S managed by A again → the grant covers nothing and is not listed', async () => {
    const u = await grantsUnit(sdk)
    u.table.failDeletes = true
    u.managers.delete(S.s)
    await ended(u.grants.endUnmanaged())
    assert.ok(u.table.deleteCalls > 0, 'harness: the sweep never tried the delete')
    u.managers.set(S.s, u.A)
    assert.equal(u.covers(), undefined, 'a swept grant whose delete failed covers again once its session is back')
    assert.ok(!u.listedIds().includes(u.id))
    u.grants.stop()
  })
  row(sdk, 'RX-F01', 'ST (c, unit) revoke retry', 'revoke whose delete fails rejects; the retry with a working delete resolves undefined and removes the record; a third answers ended', async () => {
    const u = await grantsUnit(sdk)
    u.table.failDeletes = true
    assert.ok((await ended(u.grants.revoke(u.id, u.A))).error !== undefined, 'a revoke whose delete failed did not reject')
    assert.equal(u.covers(), undefined)
    u.table.failDeletes = false
    assert.equal(await u.grants.revoke(u.id, u.A), undefined)
    assert.equal(u.table.get(u.id), undefined, 'the record is still stored after the retry')
    assert.equal(await u.grants.revoke(u.id, u.A), REFUSAL.grantEnded)
    u.grants.stop()
  })
}

// ------------------------------------------------------------------------------------------------
// F04 — a failed settlement commit

function f04(sdk) {
  row(sdk, 'RX-F04', 'ST (allow, settlement commit fails, then retry)', 'allow whose settlement commit rejects → failure; the offer stays live and the call waits; the same answer with the mailbox working → accepted, the call allowed once', async (t) => {
    const x = await domainWorld(t, sdk)
    await manage(x, S.s, x.A)
    const r = await asked(x, S.s, RX.command(1))
    x.switches.failSettlement = true
    assertFailed(await ended(answer(x, r, allow())), 'the allow whose settlement failed')
    x.switches.failSettlement = false
    assert.ok(offerFor(x, S.s, r.command), 'the offer left the live offers after a failed settlement')
    await quiet()
    assert.equal(r.settled(), false, 'the permission call ended though nothing settled it')
    assert.equal((await answer(x, r, allow()))?.ok, true, 'the retry of the same answer was refused')
    assert.equal(await r.outcome, D.outcome.allowed)
  })
  row(sdk, 'RX-F04', 'DT (grant, settlement commit fails)', 'grant whose settlement commit rejects → failure; no grant is listed and a later matching call is offered, not covered', async (t) => {
    const x = await domainWorld(t, sdk)
    await manage(x, S.s, x.A)
    const before = await listed(x)
    const r = await asked(x, S.s, RX.command(1))
    x.switches.failSettlement = true
    assertFailed(await ended(answer(x, r, exactGrant())), 'the grant whose settlement failed')
    x.switches.failSettlement = false
    assert.deepEqual(await listed(x), before, 'a grant from the failed answer is listed')
    assert.equal(await fateOf(x, S.s, r.command), 'offered', 'a grant from the failed answer covers a later call')
  })
}

// ------------------------------------------------------------------------------------------------
// F05 — succession and A's grants

/** Everything a failed succession must leave: S (and T) managed by A, A's grants listed and covering. */
async function assertKept(x, sessions, grants) {
  await x.w.routing.afterChanges?.(async () => {})
  await quiet()
  for (const s of sessions) assert.equal(x.w.managed.managerOf(s), x.A, `${s} is not managed by A after the failed succession`)
  const ids = await listed(x)
  for (const [i, g] of grants.entries()) {
    assert.ok(ids.includes(g.grantId), `A's grant on ${sessions[i]} is gone after the failed succession`)
    assert.ok(x.seam.records(RX.grantsDomain).some(([k, r]) => k === g.grantId && r.principalKey === x.A), 'the grant record is not stored as A\'s')
    assert.equal(await fateOf(x, sessions[i], g.command), 'covered', `A's grant on ${sessions[i]} no longer covers A's call`)
  }
}
const committed = async () => ({ ok: true })

function f05(sdk) {
  row(sdk, 'RX-F05', 'DT (stage fails)', 'A → B succession fails at the mailbox staging step → S managed by A again; A\'s grant still stored as A\'s, listed, covering', async (t) => {
    const x = await domainWorld(t, sdk)
    await manage(x, S.s, x.A)
    const g = await grantFor(x, S.s, RX.command(1))
    x.switches.failStage = true
    assert.ok((await ended(x.w.routing.succeedPrincipal(x.A, x.B, committed))).error !== undefined, 'the succession did not fail')
    x.switches.failStage = false
    await assertKept(x, [S.s], [g])
  })
  row(sdk, 'RX-F05', 'DT (caller commit fails)', 'the caller\'s commit rejects → S managed by A again; the grant kept, covering A\'s call', async (t) => {
    const x = await domainWorld(t, sdk)
    await manage(x, S.s, x.A)
    const g = await grantFor(x, S.s, RX.command(1))
    assert.ok((await ended(x.w.routing.succeedPrincipal(x.A, x.B, async () => { throw injected() }))).error !== undefined, 'the succession did not fail')
    await assertKept(x, [S.s], [g])
  })
  row(sdk, 'RX-F05', 'DT (managed put fails partway)', 'S and T managed by A, one grant each; the managed table\'s second write rejects during the move → both still A\'s; both grants kept', async (t) => {
    const x = await domainWorld(t, sdk)
    await manage(x, S.s, x.A)
    await manage(x, S.t, x.A)
    const gs = [await grantFor(x, S.s, RX.command(1)), await grantFor(x, S.t, RX.command(2))]
    const failing = x.seam.fail({ ...RX.managedDomain, op: 'put', skip: 1, times: 1 })
    const end = await ended(x.w.routing.succeedPrincipal(x.A, x.B, committed))
    failing.stop()
    assert.ok(failing.count() > 0, 'harness: the managed move never reached its second write')
    assert.ok(end.error !== undefined || end.value?.ok === false, `the succession reported success: ${JSON.stringify(end.value)}`)
    await assertKept(x, [S.s, S.t], gs)
  })
  row(sdk, 'RX-F05', 'UC (succession succeeds)', 'A → B succeeds → S managed by B; the grant is B\'s (stored as B\'s, listed) and covers the call under B\'s management; no grant ends', async (t) => {
    const x = await domainWorld(t, sdk)
    await manage(x, S.s, x.A)
    const g = await grantFor(x, S.s, RX.command(1))
    const result = await x.w.routing.succeedPrincipal(x.A, x.B, committed)
    assert.equal(result?.ok, true, JSON.stringify(result))
    await x.w.routing.afterChanges?.(async () => {})
    await quiet()
    assert.equal(x.w.managed.managerOf(S.s), x.B)
    assert.ok((await listed(x)).includes(g.grantId), 'the grant ended in a succession')
    assert.ok(x.seam.records(RX.grantsDomain).some(([k, r]) => k === g.grantId && r.principalKey === x.B), 'the grant is not stored as B\'s')
    assert.equal(await fateOf(x, S.s, g.command), 'covered')
  })
}

// ------------------------------------------------------------------------------------------------
// F08 — the decision rules

function f08(sdk) {
  row(sdk, 'RX-F08', 'DT (reject + reason, no risk)', '{decision: reject, reason: "Do not run"} → accepted; the call is rejected; one settlement {rejected, principal} to A', async (t) => {
    const x = await domainWorld(t, sdk)
    await manage(x, S.s, x.A)
    const r = await asked(x, S.s, RX.command(1))
    assert.equal((await answer(x, r, { decision: APPROVAL_DECISION.reject, reason: RX.reason }))?.ok, true)
    assert.equal(await r.outcome, D.outcome.rejected)
    await until(async () => (await pendingOf(x.w, x.A)).some((e) => e.type === EVENT_TYPE.settlement), 'the settlement')
    const settlements = (await pendingOf(x.w, x.A)).filter((e) => e.type === EVENT_TYPE.settlement && e.payload.approvalId === r.approvalId)
    assert.deepEqual(settlements.map((e) => e.payload), [{ approvalId: r.approvalId, outcome: SETTLEMENT_OUTCOME.rejected, by: SETTLED_BY.principal }])
  })
  for (const [label, a, code] of [
    ['reject, no reason, no risk', { decision: APPROVAL_DECISION.reject }, REFUSAL.reasonRequired],
    ['reject, blank reason, no risk', { decision: APPROVAL_DECISION.reject, reason: ' \t ' }, REFUSAL.reasonRequired],
    ['allow, no risk', { decision: APPROVAL_DECISION.allow, reason: RX.allowReason }, REFUSAL.riskRequired],
    ['grant, no risk', (() => { const { risk, ...g } = exactGrant(); void risk; return g })(), REFUSAL.riskRequired],
    ['allow, risk high', { ...allow(), risk: RISK.high }, REFUSAL.allowNeedsLowRisk],
    ['allow, blank reason', { ...allow(), reason: '   ' }, REFUSAL.reasonRequired],
  ]) {
    row(sdk, 'RX-F08', `DT (${label})`, `→ ${code}; the offer stays live and the call waits`, async (t) => {
      const x = await domainWorld(t, sdk)
      await manage(x, S.s, x.A)
      const r = await asked(x, S.s, RX.command(1))
      assert.deepEqual(await answer(x, r, a), { ok: false, code })
      assert.ok(offerFor(x, S.s, r.command), 'a refused answer ended the offer')
      assert.equal(r.settled(), false)
    })
  }
  // prompt_answer keeps its rules: a prompt shows for a session nobody manages (the user's stock prompt).
  for (const [label, a, want] of [
    ['allow, no risk', { decision: APPROVAL_DECISION.allow, reason: RX.allowReason }, { code: REFUSAL.riskRequired }],
    ['allow, risk high', { decision: APPROVAL_DECISION.allow, risk: RISK.high, reason: RX.allowReason }, { code: REFUSAL.allowNeedsLowRisk }],
    ['reject, no risk', { decision: APPROVAL_DECISION.reject, reason: RX.reason }, { outcome: D.outcome.rejected }],
  ]) {
    row(sdk, 'RX-F08', `DT (prompt_answer: ${label})`, want.code ? `→ ${want.code}; the prompt still shows` : 'accepted; the call is rejected', async (t) => {
      const x = await domainWorld(t, sdk)
      const c = x.call(S.t, RX.command(1))
      let prompt
      await until(async () => { prompt = (await x.d.interactions.listPrompts()).find((p) => p.sessionId === S.t); return prompt }, 'the stock prompt to show')
      const reply = await x.d.interactions.answerPrompt({ promptId: prompt.promptId, ...a })
      if (want.code) {
        assert.deepEqual(reply, { ok: false, code: want.code })
        assert.ok((await x.d.interactions.listPrompts()).some((p) => p.promptId === prompt.promptId), 'a refused prompt answer closed the prompt')
      } else {
        assert.equal(reply?.ok, true, JSON.stringify(reply))
        assert.equal(await c.outcome, want.outcome)
      }
    })
  }
}

// ------------------------------------------------------------------------------------------------
// F09 — the V2 session helpers

function f09(sdk) {
  row(sdk, 'RX-F09', 'EP (exports)', `session-info.js exports none of ${RX.removedExports.join(', ')} and still exports ${RX.keptExports.join(', ')}`, async () => {
    const mod = await moduleOf(sdk, RX.sessionInfoEntry)
    for (const name of RX.removedExports) assert.equal(Object.hasOwn(mod, name), false, `session-info.js still exports ${name}`)
    for (const name of RX.keptExports) assert.equal(typeof mod[name], 'function', `session-info.js no longer exports ${name}()`)
  })
}

// ------------------------------------------------------------------------------------------------
// F02 — a settlement commits only for the offer's current holder

function f02Settle(sdk) {
  const offered = async (t) => {
    const w = await routeWorld(t, sdk)
    const A = w.principal(RX.ids.a)
    const B = w.principal(RX.ids.b)
    w.session(S.s)
    assert.deepEqual(await w.managed.manage(S.s, A), { ok: true })
    const d = descriptor(EVENT_TYPE.permission)
    assert.equal((await w.routing.offer(S.s, EVENT_TYPE.permission, d))?.recipient, A, 'harness: the offer did not go to A')
    return { w, A, B, d }
  }
  row(sdk, 'RX-F02', 'DT (settle, another principal answers)', 'A holds the offer; settle naming B as the answering principal → false; nothing settled; the offer is still live, held by A', async (t) => {
    const { w, A, B, d } = await offered(t)
    assert.equal(await w.routing.settle(d.offerId, settlementOf(d.approvalId), { principalKey: B }), false)
    assert.deepEqual(w.routing.liveOffers(S.s).map((o) => [o.principalKey, o.descriptor.offerId]), [[A, d.offerId]])
    assert.deepEqual((await pendingOf(w, A)).filter((e) => e.type === EVENT_TYPE.settlement), [])
    assert.deepEqual((await pendingOf(w, B)).filter((e) => e.type === EVENT_TYPE.settlement), [])
  })
  row(sdk, 'RX-F02', 'DT (settle, the holder answers)', 'settle naming A, the holder → true; one settlement in A\'s mailbox; the offer is no longer live', async (t) => {
    const { w, A, d } = await offered(t)
    assert.equal(await w.routing.settle(d.offerId, settlementOf(d.approvalId), { principalKey: A }), true)
    assert.equal((await pendingOf(w, A)).filter((e) => e.type === EVENT_TYPE.settlement && e.payload.approvalId === d.approvalId).length, 1)
    assert.deepEqual(w.routing.liveOffers(S.s), [])
  })
  row(sdk, 'RX-F02', 'DT (settle, the holder changed)', 'S taken back from A and handed to B while A\'s offer was live → A\'s settle no longer commits for A', async (t) => {
    const { w, A, B, d } = await offered(t)
    assert.deepEqual(await w.handover.takeBack(S.s), { ok: true })
    assert.deepEqual(await w.managed.manage(S.s, B), { ok: true })
    assert.equal(await w.routing.settle(d.offerId, settlementOf(d.approvalId), { principalKey: A }), false)
    assert.deepEqual((await pendingOf(w, A)).filter((e) => e.type === EVENT_TYPE.settlement), [])
  })
}

/** Every R-FIX-CONNECTOR review row of the routing suite for `sdk`. */
export function registerReviewXCases(sdk) {
  f01Domain(sdk)
  f01Unit(sdk)
  f04(sdk)
  f05(sdk)
  f08(sdk)
  f09(sdk)
  f02Settle(sdk)
}
