/**
 * Manager workspace attach: page path vs background activations, and a moved child home.
 * Black-box from the requirements (parent's brief, with its correction of R2/R4; R5 dropped).
 *
 * R1 Page path requires the attach: attach fails -> ensureSession rejects, POST 503; attach later
 *    succeeds -> POST 200 with the same manager id; never a second session.
 * R2 Background activations (fishballChat deliverInbox / notify / recordCard / applyModel /
 *    resolveAgent(managerId)) do NOT block on the attach: with the attach failing each proceeds
 *    (resolves, its work lands in the manager session), the failure is logged (warn), the manager
 *    stays a member of no workspace, and X1 `manager.sessionId()` stays undefined, so GET reads
 *    {sessionId:null} (X1 reports the manager only once attached).
 * R3 The next page open (GET null -> POST) retries the attach: POST 503 while the fault persists;
 *    once cleared POST 200 with the same id, sessionId() = id, membership, exactly one session.
 * R4 Moved child home: the stored session cwd (<homeA>/fishball/assistant) no longer exists or no
 *    longer matches <homeB>/fishball/assistant. No permanent failure: ensureSession resolves the
 *    SAME id, POST 200 repeatedly, background activations proceed, sessionId()/GET report the id,
 *    the workspace over the CURRENT folder exists, no new session. Boundaries: home not moved
 *    (normal attach), stored folder spelled through a symlink (normal attach).
 *
 * Observation points: bootChild (real child rows, the selected SDK's real WorkspaceRegistry,
 * public API only), the fishballInstance / fishballChat services, the harness's child logger
 * records, and the session-route module over the live instance (system path).
 *
 * Techniques: EP (equivalence partitions), BVA (boundary values), DT (decision table),
 * ST (state transitions). Every case names its technique and requirement.
 */
import assert from 'node:assert/strict'
import { chmod, cp, realpath, rename, symlink } from 'node:fs/promises'
import path from 'node:path'
import { describe, it } from 'node:test'
import { bootChild, messageText, seedStoredHeader, tempDir } from '../../../../test/support/instance-ext.mjs'
import { createFakeWorkspaceRegistry } from '../../../../test/support/workspace-registry.mjs'
import {
  ATTACH, assertAttached, assertUnattached, describeWorkspaces, faultable, managerFolder, memberships,
  onlySessionId, outcome, routeOf, sessionIdsSeen, waitFor, warnCount, workspacesAt,
} from '../../../../test/support/manager-attach.mjs'

const C = Object.freeze({
  inboxText: 'background inbox item (manager-attach)',
  noticeText: 'background notice (manager-attach)',
  tellText: 'the user answered a card (manager-attach)',
  noticeType: 'plugin:fishball/inbox-notice',
  cardType: 'plugin:fishball/card-record',
  card: Object.freeze({ v: 1, id: 'rec-manager-attach-1', cardId: 'apr_ma1', kind: 'permission', at: 1_700_000_000_000, by: 'user', place: 'pile', outcome: 'allowed', from: Object.freeze({ sessionId: 'session-asker', title: 'Asking session' }) }),
  selection: Object.freeze({ provider: 'mock', model: 'm1' }),
  llm: Object.freeze({ provider: Object.freeze({ id: 'mock', name: 'Mock' }), model: Object.freeze({ id: 'm1', name: 'Model One' }) }),
  nextSentinel: 'resolveAgent-next-was-called',
  prefix: Object.freeze({ moved: 'fbtest-mab-moved-', alias: 'fbtest-mab-alias-', copy: 'fbtest-mab-copy-' }),
  movedHome: 'home',
  aliasName: 'home-link',
  repeats: Object.freeze({ one: 1, two: 2, three: 3 }),
  pluginNotice: Object.freeze({
    // Any plugin id: manager.notify takes the caller's id as given (X10).
    pluginId: 'fbtest-plugin',
    text: 'plugin notice through manager.notify (manager-attach R5)',
    dedupeKey: Object.freeze({ wake: 'mab-r5-notice-wake', held: 'mab-r5-notice-held' }),
  }),
  notReadyCode: 'manager-not-ready',
  mode: Object.freeze({ untraversable: 0o000, owner: 0o700 }),
  rootUid: 0,
})

// ---------------------------------------------------------------------------------------------
// Harness additions
// ---------------------------------------------------------------------------------------------

/**
 * Give every manager agent the version-neutral model port the chat applies a selection through
 * (Agent.model current/select, the same stand-in e1-p2 uses) and a model catalog, so
 * applyModel is observable on both SDKs. Only the fake agent is extended; the SDK is untouched.
 */
function withModelPort(harness) {
  const agents = harness.ctx.get('agents')
  for (const key of ['create', 'resume']) {
    const original = agents[key]
    agents[key] = (options) => original({
      ...options,
      async setup(agentCtx, live) {
        let current
        live.model = { current: () => current, select(selection) { current = selection } }
        if (typeof agentCtx.on !== 'function') agentCtx.on = () => () => {}
        return options.setup?.(agentCtx, live)
      },
    })
  }
  harness.ctx.provide('llm', {
    listProviders: () => [C.llm.provider],
    listModels: (provider) => (provider === C.llm.provider.id ? [C.llm.model] : []),
    resolveModelInfo: () => ({}),
    resolveCallConfig: (value) => value,
  })
}

/** Boot a child over a fault-injecting wrapper of the real registry. */
async function faultyChild(t, plan, options = {}) {
  const fault = faultable({ ...plan })
  const h = await bootChild(t, { configure: withModelPort, workspaceRegistry: fault.make, ...options })
  return { h, fault, service: h.requireInstance(), call: await routeOf(h) }
}

/**
 * A manager persisted before this boot and attached nowhere: boot 1 runs over a throwaway
 * in-memory registry, so the home's durable SDK registry (initialized empty in boot 1) never
 * learns the session. Resolves {home, id, sessionLogs, header}.
 */
async function legacyManager(t) {
  const sessionLogs = new Map()
  const legacy = await bootChild(t, { sessionLogs, workspaceRegistry: () => createFakeWorkspaceRegistry({ headerOf: (sid) => legacy.sessionHeaders.get(sid) }) })
  const id = await legacy.requireInstance().manager.ensureSession()
  const header = structuredClone(legacy.sessionHeaders.get(id))
  await legacy.close()
  return { home: legacy.home, id, sessionLogs, header }
}

/** Every event the manager session holds. */
function events(h, id) {
  return h.agentsById.get(id)?.session.snapshotEvents() ?? []
}

/** Followup texts queued to the manager session `id`. */
function followupTexts(h, id) {
  return (h.agentsById.get(id)?.followups ?? []).map(messageText)
}

// ---------------------------------------------------------------------------------------------
// Background activations: decision table of entry point -> its observable work
// ---------------------------------------------------------------------------------------------

/**
 * Each row: run(h, ctx) performs the activation; proof(h, id, result) asserts its work landed in
 * the manager session `id`. `needsId` rows activate through the known manager id (resolveAgent),
 * so they run over a legacy (persisted, unattached) manager.
 */
const ACTIVATIONS = [
  {
    name: 'deliverInbox(item)',
    run: (h) => h.chat.deliverInbox({ text: C.inboxText }),
    proof(h, id, result) {
      assert.equal(typeof result?.messageId, 'string', 'deliverInbox returns its receipt')
      assert.ok(followupTexts(h, id).includes(C.inboxText), 'the inbox item is queued as a turn in the manager session')
    },
  },
  {
    name: 'notify(text)',
    run: (h) => h.chat.notify(C.noticeText),
    proof(h, id) {
      const notices = events(h, id).filter(({ type, data }) => type === C.noticeType && data?.text === C.noticeText)
      assert.equal(notices.length, 1, 'one notice record appended to the manager session')
    },
  },
  {
    name: 'recordCard(data) without tell',
    run: (h) => h.chat.recordCard(structuredClone(C.card)),
    proof(h, id) {
      const cards = events(h, id).filter(({ type, data }) => type === C.cardType && data?.id === C.card.id)
      assert.equal(cards.length, 1, 'one card record appended to the manager session')
      assert.deepEqual(followupTexts(h, id), [], 'no tell -> no turn')
    },
  },
  {
    name: 'recordCard(data, tell)',
    run: (h) => h.chat.recordCard(structuredClone(C.card), C.tellText),
    proof(h, id) {
      assert.equal(events(h, id).filter(({ type, data }) => type === C.cardType && data?.id === C.card.id).length, 1, 'card record appended')
      assert.ok(followupTexts(h, id).includes(C.tellText), 'the tell text is queued as a turn')
    },
  },
  {
    name: 'applyModel(selection)',
    run: (h) => h.chat.applyModel({ ...C.selection }),
    proof(h, id) {
      assert.ok(h.agentsById.has(id), 'the manager session is live')
      assert.deepEqual({ ...h.chat.currentModel() }, { ...C.selection }, 'the selection is applied to the live manager')
    },
  },
  {
    name: 'resolveAgent(managerId, next)',
    needsId: true,
    run: (h, { id, nextCalls }) => h.chat.resolveAgent(id, async () => { nextCalls.push(id); return C.nextSentinel }),
    proof(h, id, result, { nextCalls }) {
      assert.equal(result?.id, id, 'resolveAgent resolves the live manager agent')
      assert.equal(result, h.agentsById.get(id), 'the very live agent of the manager session')
      assert.deepEqual(nextCalls, [], 'the manager id is owned here: next is not called')
    },
  },
]

/** Run one activation row on `h`; resolves {result, id, extra}. `knownId` for needsId rows. */
async function runActivation(h, row, knownId) {
  const extra = { id: knownId, nextCalls: [] }
  const settled = await outcome(row.run(h, extra))
  return { settled, extra }
}

/** Boot for a row: fresh child, or a legacy unattached manager when the row needs its id. */
async function bootForRow(t, row, plan) {
  if (!row.needsId) return { ...(await faultyChild(t, plan)), knownId: undefined }
  const legacy = await legacyManager(t)
  return { ...(await faultyChild(t, plan, { home: legacy.home, sessionLogs: legacy.sessionLogs })), knownId: legacy.id }
}

/** Attach-fault partitions (DT conditions): which registry step fails, and how. */
const FAULTS = [
  ['workspace.attachSession rejects', { attach: ATTACH.fault.reject }],
  ['registry.create rejects', { create: ATTACH.fault.reject }],
]
const SYNC_FAULTS = [
  ['workspace.attachSession throws synchronously', { attach: ATTACH.fault.throw }],
  ['registry.create throws synchronously', { create: ATTACH.fault.throw }],
]

// ---------------------------------------------------------------------------------------------
// R1. Page path still requires the attach
// ---------------------------------------------------------------------------------------------

describe('R1. page path (ensureSession / POST) requires the attach', () => {
  for (const [label, plan] of [...FAULTS, ...SYNC_FAULTS]) {
    it(`MAB-R1-01 DT (R1): ${label} -> ensureSession rejects and POST 503; cleared -> POST 200, same id, one session`, async (t) => {
      const { h, fault, service, call } = await faultyChild(t, plan)
      const ensured = await outcome(service.manager.ensureSession())
      assert.equal(ensured.status, 'rejected', 'page-open ensure must fail while the attach fails (got ' + JSON.stringify(ensured.value) + ')')
      const failed = await call('POST')
      assert.equal(failed.status, ATTACH.route.unavailable)
      assert.deepEqual(failed.body, ATTACH.unavailableBody)
      assert.ok(sessionIdsSeen(h).size <= 1, 'never two manager sessions')
      fault.clear()
      const ok = await call('POST')
      assert.equal(ok.status, ATTACH.route.ok)
      assert.equal(ok.body.sessionId, onlySessionId(h), 'the retry answers the one manager session')
      await assertAttached(h, ok.body.sessionId)
    })
  }

  it('MAB-R1-02 BVA (R1): two failing POSTs, then two successful POSTs -> one id throughout, one session', async (t) => {
    const { h, fault, call } = await faultyChild(t, { attach: ATTACH.fault.reject })
    assert.equal((await call('POST')).status, ATTACH.route.unavailable)
    assert.equal((await call('POST')).status, ATTACH.route.unavailable)
    assert.ok(fault.calls.attachSession >= 2, 'each POST re-ran the attach (calls: ' + fault.calls.attachSession + ')')
    fault.clear()
    const first = await call('POST')
    const second = await call('POST')
    assert.equal(first.status, ATTACH.route.ok)
    assert.deepEqual(second, first, 'the next POST answers the same id')
    assert.equal(onlySessionId(h), first.body.sessionId)
    await assertAttached(h, first.body.sessionId)
  })

  it('MAB-R1-03 ST (R1): persisted unattached manager + failing attach -> POST 503; cleared -> POST 200 with the persisted id', async (t) => {
    const legacy = await legacyManager(t)
    const { h, fault, call } = await faultyChild(t, { attach: ATTACH.fault.reject }, { home: legacy.home, sessionLogs: legacy.sessionLogs })
    assert.equal((await call('POST')).status, ATTACH.route.unavailable)
    fault.clear()
    const ok = await call('POST')
    assert.equal(ok.status, ATTACH.route.ok)
    assert.equal(ok.body.sessionId, legacy.id, 'resumed, not created')
    assert.deepEqual([...sessionIdsSeen(h)], [legacy.id])
    await assertAttached(h, legacy.id)
  })
})

// ---------------------------------------------------------------------------------------------
// R2. Background activations do not block on the attach
// ---------------------------------------------------------------------------------------------

describe('R2. background activations proceed while the attach fails', () => {
  for (const row of ACTIVATIONS) {
    for (const [label, plan] of FAULTS) {
      it(`MAB-R2-01 DT (R2): ${row.name} with ${label} -> resolves, work lands, warn logged, unattached, sessionId() undefined, GET null`, async (t) => {
        const { h, fault, service, call, knownId } = await bootForRow(t, row, plan)
        const warnsBefore = warnCount(h)
        const { settled, extra } = await runActivation(h, row, knownId)
        assert.equal(settled.status, 'fulfilled', 'the background activation must not fail on the attach: ' + (settled.reason?.stack ?? settled.reason))
        const id = onlySessionId(h)
        if (knownId !== undefined) assert.equal(id, knownId, 'the persisted manager was resumed')
        row.proof(h, id, settled.value, extra)
        assert.ok(await waitFor(() => fault.writes() > 0), 'the activation tried to ensure/attach the workspace (the fault applied): ' + JSON.stringify(fault.calls))
        assert.ok(await waitFor(() => warnCount(h) > warnsBefore), 'the attach failure is logged as a warning through the child logger')
        assertUnattached(h, id)
        assert.equal(service.manager.sessionId(), undefined, 'X1 reports the manager only once attached')
        assert.deepEqual(await call('GET'), { status: ATTACH.route.ok, body: { sessionId: null } }, 'GET reads null while unattached')
      })
    }
  }

  for (const [label, plan] of SYNC_FAULTS) {
    it(`MAB-R2-02 EP (R2): deliverInbox with ${label} -> still resolves and queues the turn; unattached`, async (t) => {
      const { h, service } = await faultyChild(t, plan)
      const settled = await outcome(h.chat.deliverInbox({ text: C.inboxText }))
      assert.equal(settled.status, 'fulfilled', 'a synchronous registry throw must not fail the background activation: ' + (settled.reason?.stack ?? settled.reason))
      const id = onlySessionId(h)
      assert.ok(followupTexts(h, id).includes(C.inboxText))
      assertUnattached(h, id)
      assert.equal(service.manager.sessionId(), undefined)
    })
  }

  it('MAB-R2-03 EP (R2): workspaceRegistry service missing -> deliverInbox still queues the turn; sessionId() undefined', async (t) => {
    const h = await bootChild(t, { workspaceRegistry: () => undefined })
    const settled = await outcome(h.chat.deliverInbox({ text: C.inboxText }))
    assert.equal(settled.status, 'fulfilled', 'a missing registry must not block a background activation: ' + (settled.reason?.stack ?? settled.reason))
    assert.ok(followupTexts(h, onlySessionId(h)).includes(C.inboxText))
    assert.equal(h.requireInstance().manager.sessionId(), undefined)
  })

  for (const row of ACTIVATIONS) {
    it(`MAB-R2-04 DT (R2, no-fault column): ${row.name} on a healthy registry -> work lands and the manager is attached`, async (t) => {
      const { h, service, call, knownId } = await bootForRow(t, row, {})
      const { settled, extra } = await runActivation(h, row, knownId)
      assert.equal(settled.status, 'fulfilled', String(settled.reason?.stack ?? settled.reason))
      const id = onlySessionId(h)
      row.proof(h, id, settled.value, extra)
      // Every activation ensures the workspace and attaches; with no fault the attach succeeds.
      assert.ok(await waitFor(() => memberships(h, id).length === 1), 'attached after a healthy background activation: ' + describeWorkspaces(h))
      await assertAttached(h, id)
      assert.equal(service.manager.sessionId(), id)
      assert.deepEqual((await call('GET')).body, { sessionId: id })
    })
  }

  it('MAB-R2-05 BVA (R2): three background activations with the attach failing -> all resolve, one session, three turns, unattached', async (t) => {
    const { h, service } = await faultyChild(t, { attach: ATTACH.fault.reject })
    const texts = Array.from({ length: C.repeats.three }, (_, index) => C.inboxText + ' #' + index)
    for (const text of texts) assert.equal((await outcome(h.chat.deliverInbox({ text }))).status, 'fulfilled')
    const id = onlySessionId(h)
    for (const text of texts) assert.ok(followupTexts(h, id).includes(text), 'queued: ' + text)
    assertUnattached(h, id)
    assert.equal(service.manager.sessionId(), undefined)
  })

  it('MAB-R2-06 ST (R2/R1): concurrent ensureSession + deliverInbox under a failing attach -> ensure rejects, delivery resolves, one session', async (t) => {
    const { h, service } = await faultyChild(t, { attach: ATTACH.fault.reject })
    const [ensured, delivered] = await Promise.all([outcome(service.manager.ensureSession()), outcome(h.chat.deliverInbox({ text: C.inboxText }))])
    assert.equal(ensured.status, 'rejected', 'the page path still requires the attach')
    assert.equal(delivered.status, 'fulfilled', 'the background path does not: ' + (delivered.reason?.stack ?? delivered.reason))
    const id = onlySessionId(h)
    assert.ok(followupTexts(h, id).includes(C.inboxText))
    assertUnattached(h, id)
  })
})

// ---------------------------------------------------------------------------------------------
// R3. The next page open retries the attach after a background activation
// ---------------------------------------------------------------------------------------------

describe('R3. after a background activation, the page open (GET null -> POST) retries the attach', () => {
  for (const row of ACTIVATIONS) {
    it(`MAB-R3-01 ST (R3): ${row.name} under a fault -> GET null -> POST 503 -> fault cleared -> POST 200 same id, attached, one session`, async (t) => {
      const { h, fault, service, call, knownId } = await bootForRow(t, row, { attach: ATTACH.fault.reject })
      assert.equal((await runActivation(h, row, knownId)).settled.status, 'fulfilled')
      const id = onlySessionId(h)
      // The page reads GET first; null means "no session", so it POSTs.
      assert.deepEqual((await call('GET')).body, { sessionId: null })
      const attachesBefore = fault.calls.attachSession
      const failed = await call('POST')
      assert.equal(failed.status, ATTACH.route.unavailable, 'the POST surfaces the persisting attach error: ' + JSON.stringify(failed.body))
      assert.deepEqual(failed.body, ATTACH.unavailableBody)
      assert.ok(fault.calls.attachSession > attachesBefore, 'the POST retried the attach')
      assertUnattached(h, id)
      fault.clear()
      const ok = await call('POST')
      assert.equal(ok.status, ATTACH.route.ok)
      assert.equal(ok.body.sessionId, id, 'the same manager id')
      assert.equal(service.manager.sessionId(), id)
      assert.deepEqual((await call('GET')).body, { sessionId: id })
      await assertAttached(h, id)
      assert.equal(onlySessionId(h), id, 'exactly one session in total')
    })
  }

  for (const count of [C.repeats.one, C.repeats.three]) {
    it(`MAB-R3-02 BVA (R3): ${count} background activation(s) under a fault, fault cleared, then one POST -> 200, attached, one session`, async (t) => {
      const { h, fault, call } = await faultyChild(t, { create: ATTACH.fault.reject })
      for (let index = 0; index < count; index++) assert.equal((await outcome(h.chat.deliverInbox({ text: C.inboxText + ' #' + index }))).status, 'fulfilled')
      const id = onlySessionId(h)
      fault.clear()
      const ok = await call('POST')
      assert.equal(ok.status, ATTACH.route.ok)
      assert.equal(ok.body.sessionId, id)
      await assertAttached(h, id)
      assert.equal(sessionIdsSeen(h).size, 1)
    })
  }

  it('MAB-R3-03 ST (R3): after the successful POST, a further background activation keeps the one membership and the id', async (t) => {
    const { h, fault, service, call } = await faultyChild(t, { attach: ATTACH.fault.reject })
    await h.chat.deliverInbox({ text: C.inboxText })
    fault.clear()
    const { body } = await call('POST')
    await h.chat.notify(C.noticeText)
    assert.equal(service.manager.sessionId(), body.sessionId)
    await assertAttached(h, body.sessionId)
    assert.equal(onlySessionId(h), body.sessionId)
  })
})

// ---------------------------------------------------------------------------------------------
// R4. Moved child home
// ---------------------------------------------------------------------------------------------

/**
 * Create the manager under homeA, close, then relocate homeA to homeB (`relocate`: rename or
 * copy) and give homeB the stored session header (its cwd still names <homeA>/fishball/assistant,
 * as DSH's persisted header would: a resume restores the stored cwd). Resolves
 * {homeA, homeB, id, sessionLogs, storedCwd}.
 */
async function relocatedManager(t, relocate) {
  const sessionLogs = new Map()
  const first = await bootChild(t, { sessionLogs })
  const id = await first.requireInstance().manager.ensureSession()
  const header = structuredClone(first.sessionHeaders.get(id))
  await first.close()
  const homeA = first.home
  assert.equal(path.resolve(header.cwd), path.join(homeA, ...ATTACH.managerFolder), 'precondition: the stored cwd is <homeA>/fishball/assistant')
  const homeB = path.join(await tempDir(t, relocate === 'copy' ? C.prefix.copy : C.prefix.moved), C.movedHome)
  if (relocate === 'copy') await cp(homeA, homeB, { recursive: true })
  else await rename(homeA, homeB)
  seedStoredHeader(homeB, header)
  return { homeA, homeB, id, sessionLogs, storedCwd: header.cwd }
}

/** Common R4 expectations after the activation(s) on homeB. */
async function assertMovedHomeHealthy(h, id) {
  assert.deepEqual([...sessionIdsSeen(h)], [id], 'no new session was created')
  const current = await managerFolder(h.home, { create: false })
  assert.equal(workspacesAt(h, current).length, 1, 'the workspace over the CURRENT folder <homeB>/fishball/assistant exists: ' + describeWorkspaces(h))
  // The DSH SDK cannot change a session's cwd, and Workspace.attachSession validates the stored
  // header cwd against the workspace path, so the manager cannot become a member of the current
  // folder's workspace; it counts as attached without membership.
  assert.equal(workspacesAt(h, current)[0].sessionIds.includes(id), false, 'no membership is possible (SDK limit)')
}

describe('R4. moved child home: no permanent failure, same manager', () => {
  it('MAB-R4-01 ST (R4): home renamed -> ensureSession resolves the same id; POST 200 x3; GET id; workspace over the current folder', async (t) => {
    const moved = await relocatedManager(t, 'rename')
    const h = await bootChild(t, { home: moved.homeB, sessionLogs: moved.sessionLogs })
    const service = h.requireInstance()
    const ensured = await outcome(service.manager.ensureSession())
    assert.equal(ensured.status, 'fulfilled', 'a moved home is not a permanent failure: ' + (ensured.reason?.stack ?? ensured.reason))
    assert.equal(ensured.value, moved.id, 'the SAME manager is resumed')
    assert.equal(h.agentsById.get(moved.id)?.session.header.cwd, moved.storedCwd, 'precondition: the live header still names the old folder')
    const call = await routeOf(h)
    for (let index = 0; index < C.repeats.three; index++) {
      assert.deepEqual(await call('POST'), { status: ATTACH.route.ok, body: { sessionId: moved.id } }, 'POST #' + (index + 1))
    }
    assert.equal(service.manager.sessionId(), moved.id, 'counts as attached: X1 reports the id')
    assert.deepEqual(await call('GET'), { status: ATTACH.route.ok, body: { sessionId: moved.id } })
    await assertMovedHomeHealthy(h, moved.id)
  })

  it('MAB-R4-02 ST (R4): home renamed -> background activation first proceeds, then sessionId()/GET report the id and POST 200', async (t) => {
    const moved = await relocatedManager(t, 'rename')
    const h = await bootChild(t, { home: moved.homeB, sessionLogs: moved.sessionLogs })
    const settled = await outcome(h.chat.deliverInbox({ text: C.inboxText }))
    assert.equal(settled.status, 'fulfilled', String(settled.reason?.stack ?? settled.reason))
    assert.ok(followupTexts(h, moved.id).includes(C.inboxText), 'the item is queued in the SAME manager session')
    assert.equal(h.requireInstance().manager.sessionId(), moved.id)
    const call = await routeOf(h)
    assert.deepEqual((await call('GET')).body, { sessionId: moved.id })
    assert.deepEqual(await call('POST'), { status: ATTACH.route.ok, body: { sessionId: moved.id } })
    await assertMovedHomeHealthy(h, moved.id)
  })

  for (const row of ACTIVATIONS.filter(({ needsId }) => !needsId)) {
    it(`MAB-R4-03 DT (R4): home renamed -> ${row.name} proceeds in the same manager session`, async (t) => {
      const moved = await relocatedManager(t, 'rename')
      const h = await bootChild(t, { home: moved.homeB, sessionLogs: moved.sessionLogs, configure: withModelPort })
      const { settled, extra } = await runActivation(h, row)
      assert.equal(settled.status, 'fulfilled', String(settled.reason?.stack ?? settled.reason))
      row.proof(h, moved.id, settled.value, extra)
      await assertMovedHomeHealthy(h, moved.id)
    })
  }

  it('MAB-R4-04 DT (R4): home renamed -> resolveAgent(managerId) resolves the live manager; next not called', async (t) => {
    const moved = await relocatedManager(t, 'rename')
    const h = await bootChild(t, { home: moved.homeB, sessionLogs: moved.sessionLogs })
    const row = ACTIVATIONS.find(({ needsId }) => needsId)
    const { settled, extra } = await runActivation(h, row, moved.id)
    assert.equal(settled.status, 'fulfilled', String(settled.reason?.stack ?? settled.reason))
    row.proof(h, moved.id, settled.value, extra)
    await assertMovedHomeHealthy(h, moved.id)
  })

  it('MAB-R4-05 EP (R4): home copied (old folder still exists, but differs) -> same id, POST 200, workspace over the current folder', async (t) => {
    const copied = await relocatedManager(t, 'copy')
    const h = await bootChild(t, { home: copied.homeB, sessionLogs: copied.sessionLogs })
    const ensured = await outcome(h.requireInstance().manager.ensureSession())
    assert.equal(ensured.status, 'fulfilled', 'a stored folder that no longer matches is not a permanent failure: ' + (ensured.reason?.stack ?? ensured.reason))
    assert.equal(ensured.value, copied.id)
    assert.deepEqual(await (await routeOf(h))('POST'), { status: ATTACH.route.ok, body: { sessionId: copied.id } })
    await assertMovedHomeHealthy(h, copied.id)
  })

  it('MAB-R4-06 BVA (R4, not moved): same home, persisted unattached manager -> resumed and attached normally (membership)', async (t) => {
    const legacy = await legacyManager(t)
    const h = await bootChild(t, { home: legacy.home, sessionLogs: legacy.sessionLogs })
    assert.deepEqual(memberships(h, legacy.id), [], 'precondition: attached nowhere')
    assert.equal(await h.requireInstance().manager.ensureSession(), legacy.id)
    await assertAttached(h, legacy.id)
    assert.deepEqual([...sessionIdsSeen(h)], [legacy.id])
  })

  it('MAB-R4-07 BVA (R4, not moved): same home, background activation of a persisted unattached manager -> attached normally', async (t) => {
    const legacy = await legacyManager(t)
    const h = await bootChild(t, { home: legacy.home, sessionLogs: legacy.sessionLogs })
    await h.chat.deliverInbox({ text: C.inboxText })
    assert.ok(followupTexts(h, legacy.id).includes(C.inboxText))
    assert.ok(await waitFor(() => memberships(h, legacy.id).length === 1), 'attached: ' + describeWorkspaces(h))
    await assertAttached(h, legacy.id)
    assert.equal(h.requireInstance().manager.sessionId(), legacy.id)
  })

  it('MAB-R4-08 EP (R4, symlink): stored cwd spelled through a symlink of the same home -> attached normally', async (t) => {
    const legacy = await legacyManager(t)
    const alias = path.join(await tempDir(t, C.prefix.alias), C.aliasName)
    await symlink(legacy.home, alias)
    const aliasCwd = path.join(alias, ...ATTACH.managerFolder)
    seedStoredHeader(legacy.home, { ...legacy.header, cwd: aliasCwd })
    const h = await bootChild(t, { home: legacy.home, sessionLogs: legacy.sessionLogs })
    assert.equal(await h.requireInstance().manager.ensureSession(), legacy.id)
    assert.equal(h.agentsById.get(legacy.id)?.session.header.cwd, aliasCwd, 'precondition: the live header names the symlinked spelling')
    const workspace = await assertAttached(h, legacy.id)
    assert.equal(workspace.path, await managerFolder(h.home, { create: false }), 'the canonical current folder holds the manager')
    assert.deepEqual(await (await routeOf(h))('POST'), { status: ATTACH.route.ok, body: { sessionId: legacy.id } })
  })

  it('MAB-R4-09 ST (R4): moved home under a create fault -> POST 503 (a real registry fault still surfaces); cleared -> 200 same id', async (t) => {
    const moved = await relocatedManager(t, 'rename')
    const fault = faultable({ create: ATTACH.fault.reject })
    const h = await bootChild(t, { home: moved.homeB, sessionLogs: moved.sessionLogs, workspaceRegistry: fault.make })
    const call = await routeOf(h)
    assert.equal((await call('POST')).status, ATTACH.route.unavailable, 'the current folder\'s workspace could not be ensured')
    fault.clear()
    assert.deepEqual(await call('POST'), { status: ATTACH.route.ok, body: { sessionId: moved.id } })
    await assertMovedHomeHealthy(h, moved.id)
  })
})


// ---------------------------------------------------------------------------------------------
// R5. Plugin notices (X0-C manager.notify) are background; an unresolvable old folder
// ---------------------------------------------------------------------------------------------

/**
 * Fail the page POST under a rejecting attach, then send one plugin notice through the X0-C
 * service. Resolves {h, fault, service, call, failed, settled}.
 */
async function noticeAfterFailedPost(t, { wake, dedupeKey }) {
  const { h, fault, service, call } = await faultyChild(t, { attach: ATTACH.fault.reject })
  const failed = await call('POST')
  const { pluginId, text } = C.pluginNotice
  const settled = await outcome(service.manager.notify({ pluginId, dedupeKey, text, wake }))
  return { h, fault, service, call, failed, settled }
}

/** The notice fulfilled; a `manager-not-ready` (or any) rejection is named in the message. */
function assertNoticeFulfilled(settled) {
  const reason = settled.reason
  const named = reason?.code === C.notReadyCode ? C.notReadyCode + ': ' : ''
  assert.equal(settled.status, 'fulfilled', 'a plugin notice is a background activation and must not fail on the attach: ' + named + (reason?.stack ?? reason))
}

describe('R5. plugin notices do not block on the attach; an untraversable old home is not a permanent failure', () => {
  it('MAB-R5-01 ST (R-PAGE + R-BG): POST 503 -> notify(wake:true) fulfils, text queued in the one session, unattached; cleared -> POST 200 same id', async (t) => {
    const { h, fault, service, call, failed, settled } = await noticeAfterFailedPost(t, { wake: true, dedupeKey: C.pluginNotice.dedupeKey.wake })
    assert.deepEqual(failed, { status: ATTACH.route.unavailable, body: { ...ATTACH.unavailableBody } }, 'the page path requires the attach')
    assertNoticeFulfilled(settled)
    const id = onlySessionId(h)
    assert.ok(followupTexts(h, id).some((text) => text.includes(C.pluginNotice.text)), 'the notice text is queued as a followup in the manager session: ' + JSON.stringify(followupTexts(h, id)))
    assertUnattached(h, id)
    assert.equal(service.manager.sessionId(), undefined, 'X1 reports the manager only once attached')
    fault.clear()
    assert.deepEqual(await call('POST'), { status: ATTACH.route.ok, body: { sessionId: id } }, 'the retry answers the same manager id')
    assert.equal(onlySessionId(h), id, 'still one manager session')
  })

  it('MAB-R5-02 ST (R-BG): POST 503 -> notify(wake:false) fulfils, one session, still unattached', async (t) => {
    const { h, service, failed, settled } = await noticeAfterFailedPost(t, { wake: false, dedupeKey: C.pluginNotice.dedupeKey.held })
    assert.equal(failed.status, ATTACH.route.unavailable)
    assertNoticeFulfilled(settled)
    // The failed POST already created the one manager session; the notice must not add another.
    assertUnattached(h, onlySessionId(h))
    assert.equal(service.manager.sessionId(), undefined, 'X1 reports the manager only once attached')
  })

  it('MAB-R5-03 EP (R-MOVED, untraversable old home): ensureSession same id, POST 200 x2, workspace over the current folder', async (t) => {
    if (process.getuid?.() === C.rootUid) { t.skip('root traverses a 0o000 directory'); return }
    const copied = await relocatedManager(t, 'copy')
    // The old home's tempDir cleanup was registered first and after-hooks run in registration
    // order (a throwing hook stops the rest), so the body restores the mode in `finally`, before
    // that cleanup; the t.after registration covers an abort and is a no-op once restored.
    let restored = false
    const restore = async () => { if (!restored) { restored = true; await chmod(copied.homeA, C.mode.owner) } }
    t.after(restore)
    await chmod(copied.homeA, C.mode.untraversable)
    try {
      await assert.rejects(realpath(copied.storedCwd), 'precondition: the stored old folder no longer resolves')
      const h = await bootChild(t, { home: copied.homeB, sessionLogs: copied.sessionLogs })
      const ensured = await outcome(h.requireInstance().manager.ensureSession())
      assert.equal(ensured.status, 'fulfilled', 'an untraversable old folder is not a permanent failure: ' + (ensured.reason?.stack ?? ensured.reason))
      assert.equal(ensured.value, copied.id, 'the SAME manager is resumed')
      const call = await routeOf(h)
      for (let index = 0; index < C.repeats.two; index++) {
        assert.deepEqual(await call('POST'), { status: ATTACH.route.ok, body: { sessionId: copied.id } }, 'POST #' + (index + 1))
      }
      await assertMovedHomeHealthy(h, copied.id)
    } finally {
      await restore()
    }
  })
})
