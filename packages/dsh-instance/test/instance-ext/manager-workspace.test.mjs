/**
 * Manager workspace attach (user decision 7.A, bug fix), black-box from the requirement:
 * the page-open ensure creates or resumes THE manager session without a model call AND attaches
 * it to a child workspace over the manager's folder (`<profileContext.home>/fishball/assistant`),
 * so native ui-conversation resolves the session's workspace title and the composer is not inert.
 *
 * Observation points (public contracts only):
 * - `fishballInstance.manager.ensureSession()` / `sessionId()` (X1, X1a) through the real child
 *   rows (bootChild), whose default `workspaceRegistry` is the SELECTED SDK's real
 *   WorkspaceRegistry (test/support/workspace-registry.mjs), read through its public API;
 * - the `/api/fishball/session` route module (session-route.js) over the live instance;
 * - the page client (client.js in node:vm) driven over that real route (system path).
 * Fault injection wraps the real registry: `create`, `resolveByPath` or `Workspace.attachSession`
 * reject or throw, or the service is missing. The wrapper counts calls (read-only GET proof).
 *
 * Server contract (parent's correction): `sessionId()` (and so GET) reports the id only once the
 * activation, including its workspace attach, succeeded; an attach failure fails every page-open
 * ensure (background activations proceed: manager-attach-background.test.mjs); the next ensure
 * retries the attach without a second session or a second workspace. The frozen page flow stays: GET first, POST only on {sessionId:null}.
 *
 * Techniques: EP (equivalence partitions), BVA (boundary values), DT (decision table),
 * ST (state transitions). Each case names its technique.
 */
import assert from 'node:assert/strict'
import { readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, it } from 'node:test'
import { bootChild, seedStoredHeader, tempDir } from '../../../../test/support/instance-ext.mjs'
import { createFakeWorkspaceRegistry } from '../../../../test/support/workspace-registry.mjs'
import {
  faultable, managerFolder, memberships, outcome, routeOf, sessionIdsSeen, workspacesAt,
} from '../../../../test/support/manager-attach.mjs'
import { loadPage, settle } from './page-open-session-page.mjs'

const C = Object.freeze({
  chatRecord: Object.freeze(['fishball', 'chat.json']),
  route: Object.freeze({ origin: 'http://127.0.0.1:1', path: '/api/fishball/session', ok: 200, unavailable: 503, body: '{}' }),
  unavailableBody: Object.freeze({ code: 'MANAGER_UNAVAILABLE' }),
  turnEvents: Object.freeze(['turn/start', 'step/start', 'user/message', 'assistant/message']),
  fault: Object.freeze({ reject: 'reject', throw: 'throw' }),
  preTitle: 'pre-existing manager workspace',
  legacyId: 'session-legacy-manager-1',
  unavailableText: 'Fishball session unavailable',
  concurrency: Object.freeze({ two: 2, many: 10 }),
})

// ---------------------------------------------------------------------------------------------
// Observation helpers
// ---------------------------------------------------------------------------------------------

/**
 * Contract point 1 + 3: exactly one workspace over the manager folder, the session listed in it
 * exactly once and in no other workspace, and its title resolves (the composer is not inert).
 */
async function assertAttached(h, sessionId) {
  const folder = await managerFolder(h.home, { create: false })
  const owners = workspacesAt(h, folder)
  assert.equal(owners.length, 1, 'exactly one workspace over the manager folder ' + folder + '; workspaces: ' + JSON.stringify(h.workspaces.list().map(({ path: p, sessionIds }) => ({ path: p, sessionIds }))))
  const [workspace] = owners
  assert.equal(workspace.sessionIds.filter((id) => id === sessionId).length, 1, 'the manager is listed exactly once in its workspace')
  const slots = memberships(h, sessionId)
  assert.equal(slots.length, 1, 'the manager is in exactly one workspace\'s sessionIds')
  assert.equal(slots[0].id, workspace.id)
  assert.equal(typeof workspace.title, 'string')
  assert.ok(workspace.title.length > 0, 'the session\'s workspace resolves a title')
  assert.equal((await h.workspaces.resolveByPath(folder))?.id, workspace.id, 'resolveByPath(manager folder) names that workspace')
  return workspace
}

/** The live manager's header cwd, canonical. */
async function headerFolder(h, sessionId) {
  const cwd = h.agentsById.get(sessionId)?.session.header.cwd
  assert.equal(typeof cwd, 'string', 'the manager session has a header cwd')
  return realpath(cwd)
}

/** Contract point 6: ensuring never starts a turn and never queues a message. */
function assertNoTurn(h) {
  const types = h.agents.flatMap(({ live }) => live.session.snapshotEvents().map(({ type }) => type))
  for (const type of C.turnEvents) assert.ok(!types.includes(type), 'no ' + type + ' event during ensure')
  assert.equal(h.agents.reduce((count, { live }) => count + live.followups.length, 0), 0, 'no message queued')
  for (const { live } of h.agents) assert.equal(live.status, 'idle', 'the manager agent is idle (no model call)')
}

// ---------------------------------------------------------------------------------------------
// W. Real SDK registry: attach on page-open ensure (contract points 1, 3, 6)
// ---------------------------------------------------------------------------------------------

describe('W. page-open ensure attaches the manager to its folder\'s workspace (real SDK registry)', () => {
  it('W-01 ST: fresh child -> ensure creates one workspace over <home>/fishball/assistant holding the manager', async (t) => {
    const h = await bootChild(t)
    assert.deepEqual(h.workspaces.list(), [], 'fresh child: no workspace before ensure')
    const id = await h.requireInstance().manager.ensureSession()
    assert.equal(typeof id, 'string')
    const workspace = await assertAttached(h, id)
    assert.equal(workspace.path, await managerFolder(h.home, { create: false }), 'canonical path is the realpath of the manager folder')
    assert.equal(await headerFolder(h, id), workspace.path, 'the session header cwd is the workspace path')
    assert.equal(h.workspaces.list().length, 1, 'no other workspace was created')
    assert.equal(sessionIdsSeen(h).size, 1)
  })

  it('W-02 ST: sessionId() is undefined before ensure and the attached id after it', async (t) => {
    const h = await bootChild(t)
    const service = h.requireInstance()
    assert.equal(service.manager.sessionId(), undefined)
    const id = await service.manager.ensureSession()
    assert.equal(service.manager.sessionId(), id)
    await assertAttached(h, id)
  })

  it('W-03 ST: no model call during ensure (no turn, no message, agent idle)', async (t) => {
    const h = await bootChild(t)
    await h.requireInstance().manager.ensureSession()
    assertNoTurn(h)
  })

  it('W-04 ST: three sequential ensures -> same id, one workspace, listed once', async (t) => {
    const h = await bootChild(t)
    const service = h.requireInstance()
    const ids = [await service.manager.ensureSession(), await service.manager.ensureSession(), await service.manager.ensureSession()]
    assert.equal(new Set(ids).size, 1)
    await assertAttached(h, ids[0])
    assert.equal(h.workspaces.list().length, 1)
  })

  for (const count of [C.concurrency.two, C.concurrency.many]) {
    it(`W-05 BVA: ${count} concurrent ensures -> one session, one workspace, listed once`, async (t) => {
      const h = await bootChild(t)
      const service = h.requireInstance()
      const ids = await Promise.all(Array.from({ length: count }, () => service.manager.ensureSession()))
      assert.equal(new Set(ids).size, 1)
      assert.equal(sessionIdsSeen(h).size, 1)
      await assertAttached(h, ids[0])
      assert.equal(h.workspaces.list().length, 1)
      assertNoTurn(h)
    })
  }

  it('W-06 DT: a workspace for the folder created beforehand (empty) is reused, not duplicated', async (t) => {
    const h = await bootChild(t)
    const before = await h.workspaces.create(await managerFolder(h.home), C.preTitle)
    const id = await h.requireInstance().manager.ensureSession()
    const workspace = await assertAttached(h, id)
    assert.equal(workspace.id, before.id, 'the existing workspace holds the manager')
    assert.equal(workspace.title, C.preTitle, 'its title is untouched')
    assert.equal(h.workspaces.list().length, 1)
  })

  it('W-07 DT: an unrelated workspace (the home folder) never receives the manager', async (t) => {
    const h = await bootChild(t)
    const unrelated = await h.workspaces.create(h.home)
    const id = await h.requireInstance().manager.ensureSession()
    await assertAttached(h, id)
    assert.deepEqual([...h.workspaces.get(unrelated.id).sessionIds], [], 'the unrelated workspace stays empty')
    assert.equal(h.workspaces.list().length, 2, 'only the manager folder\'s workspace was added')
  })

  it('W-08 DT: a workspace spelled through a symlink of the folder is the same canonical workspace', async (t) => {
    const h = await bootChild(t)
    const folder = await managerFolder(h.home)
    const { symlink } = await import('node:fs/promises')
    const alias = path.join(await tempDir(t, 'fbtest-mws-alias-'), 'assistant-link')
    await symlink(folder, alias)
    const before = await h.workspaces.create(alias)
    assert.equal(before.path, folder)
    const id = await h.requireInstance().manager.ensureSession()
    assert.equal((await assertAttached(h, id)).id, before.id)
  })

  it('W-09 ST: restart (same home, logs, registry) with the session already attached -> resumed, still once', async (t) => {
    const sessionLogs = new Map()
    const first = await bootChild(t, { sessionLogs })
    const id = await first.requireInstance().manager.ensureSession()
    await assertAttached(first, id)
    await first.close()
    const second = await bootChild(t, { home: first.home, sessionLogs })
    assert.equal((await second.workspaces.resolveByPath(await managerFolder(second.home, { create: false })))?.sessionIds.includes(id), true, 'precondition: durably attached')
    const again = await second.requireInstance().manager.ensureSession()
    assert.equal(again, id, 'the same manager is resumed')
    await assertAttached(second, id)
    assert.equal(second.workspaces.list().length, 1)
    assertNoTurn(second)
  })

  it('W-10 ST: the chat record names the attached manager as {"sessionId": id}', async (t) => {
    const h = await bootChild(t)
    const id = await h.requireInstance().manager.ensureSession()
    const record = JSON.parse(await readFile(path.join(h.home, ...C.chatRecord), 'utf8'))
    assert.equal(record.sessionId, id)
  })
})

// ---------------------------------------------------------------------------------------------
// R. Resumed manager that was never attached (contract point 2)
// ---------------------------------------------------------------------------------------------

describe('R. a resumed, never-attached manager is attached at page-open ensure', () => {
  it('R-01 ST: legacy manager (persisted, attached nowhere) -> resume attaches it; no second session', async (t) => {
    // Boot 1 runs over a throwaway in-memory registry, so the home's durable SDK registry never
    // learns the session: that is a manager persisted before the fix (chat.json + session log).
    const sessionLogs = new Map()
    const legacy = await bootChild(t, { sessionLogs, workspaceRegistry: () => createFakeWorkspaceRegistry({ headerOf: (sid) => legacy.sessionHeaders.get(sid) }) })
    const id = await legacy.requireInstance().manager.ensureSession()
    await legacy.close()
    const second = await bootChild(t, { home: legacy.home, sessionLogs })
    assert.deepEqual(memberships(second, id), [], 'precondition: the persisted manager is in no workspace')
    assert.equal(JSON.parse(await readFile(path.join(second.home, ...C.chatRecord), 'utf8')).sessionId, id, 'precondition: chat.json names it')
    const again = await second.requireInstance().manager.ensureSession()
    assert.equal(again, id, 'resumed, not created')
    assert.equal(sessionIdsSeen(second).size, 1)
    await assertAttached(second, id)
    assertNoTurn(second)
  })

  it('R-02 ST: a hand-written chat record {"sessionId"} over a stored header with the folder cwd is resumed and attached', async (t) => {
    // A donor child supplies a real SDK-shaped session log; the target home only gets the
    // record, the stored header (cwd = manager folder) and that log under the legacy id.
    const donor = await bootChild(t)
    const donorId = await donor.requireInstance().manager.ensureSession()
    await donor.close()
    const home = await tempDir(t, 'fbtest-mws-legacy-')
    const folder = await managerFolder(home)
    // Start the home's durable registry once with an empty history first: its one-time history
    // bootstrap would otherwise group the stored header into a workspace by itself, which is not
    // the product's attach (a pre-fix manager was stored after the registry initialized).
    await (await bootChild(t, { home })).close()
    const donorHeader = donor.sessionHeaders.get(donorId)
    seedStoredHeader(home, { ...donorHeader, id: C.legacyId, cwd: folder })
    const sessionLogs = new Map([[C.legacyId, structuredClone(donor.sessionLogs.get(donorId) ?? [])]])
    await writeFile(path.join(home, ...C.chatRecord), JSON.stringify({ sessionId: C.legacyId }))
    const h = await bootChild(t, { home, sessionLogs })
    assert.deepEqual(memberships(h, C.legacyId), [], 'precondition: the stored manager is in no workspace')
    const id = await h.requireInstance().manager.ensureSession()
    assert.equal(id, C.legacyId, 'the recorded manager is resumed')
    assert.deepEqual([...sessionIdsSeen(h)], [C.legacyId], 'no new session was created')
    await assertAttached(h, C.legacyId)
    assertNoTurn(h)
  })

  it('R-03 DT: resumed manager + a workspace already over its folder (empty) -> attached into that one', async (t) => {
    const sessionLogs = new Map()
    const legacy = await bootChild(t, { sessionLogs, workspaceRegistry: () => createFakeWorkspaceRegistry({ headerOf: (sid) => legacy.sessionHeaders.get(sid) }) })
    const id = await legacy.requireInstance().manager.ensureSession()
    await legacy.close()
    const second = await bootChild(t, { home: legacy.home, sessionLogs })
    const before = await second.workspaces.create(await managerFolder(second.home), C.preTitle)
    assert.equal(await second.requireInstance().manager.ensureSession(), id)
    assert.equal((await assertAttached(second, id)).id, before.id)
    assert.equal(second.workspaces.list().length, 1)
  })
})

// ---------------------------------------------------------------------------------------------
// F. Attach failures surface as errors; retry recovers (contract point 4, parent's correction)
// ---------------------------------------------------------------------------------------------

/** Decision table: which registry step fails, and how. */
const FAULTS = [
  ['registry.create rejects', { create: C.fault.reject }],
  ['registry.create throws synchronously', { create: C.fault.throw }],
  ['workspace.attachSession rejects', { attach: C.fault.reject }],
  ['workspace.attachSession throws synchronously', { attach: C.fault.throw }],
]

describe('F. attach failure fails the activation; retry attaches without duplicates', () => {
  it('F-01 DT: workspaceRegistry missing -> ensureSession rejects, sessionId() undefined, POST 503, GET null', async (t) => {
    const h = await bootChild(t, { workspaceRegistry: () => undefined })
    const service = h.requireInstance()
    const result = await outcome(service.manager.ensureSession())
    assert.equal(result.status, 'rejected', 'a missing registry is an error, never a silent success: ' + JSON.stringify(result.value))
    assert.equal(service.manager.sessionId(), undefined, 'no id is reported for an unattached manager')
    const call = await routeOf(h)
    const post = await call('POST')
    assert.equal(post.status, C.route.unavailable)
    assert.deepEqual(post.body, C.unavailableBody)
    const get = await call('GET')
    assert.equal(get.status, C.route.ok)
    assert.deepEqual(get.body, { sessionId: null })
  })

  for (const [label, plan] of FAULTS) {
    it(`F-02 DT/ST: ${label} -> ensure rejects; cleared -> retry attaches; one session, one workspace`, async (t) => {
      const fault = faultable({ ...plan })
      const h = await bootChild(t, { workspaceRegistry: fault.make })
      const service = h.requireInstance()
      const failed = await outcome(service.manager.ensureSession())
      assert.equal(failed.status, 'rejected', 'the attach fault surfaced (got ' + JSON.stringify(failed.value) + ')')
      assert.equal(service.manager.sessionId(), undefined, 'sessionId() stays undefined after a failed attach')
      assert.ok(fault.calls.create + fault.calls.initializeDefault + fault.calls.attachSession + fault.calls.resolveByPath > 0, 'the activation used the workspace registry')
      assertNoTurn(h)
      fault.clear()
      const id = await service.manager.ensureSession()
      assert.equal(service.manager.sessionId(), id)
      assert.equal(sessionIdsSeen(h).size, 1, 'the retry did not create a second session')
      await assertAttached(h, id)
      assert.equal(h.workspaces.list().length, 1, 'the retry did not create a second workspace')
      assertNoTurn(h)
    })
  }

  it('F-03 ST: concurrent callers during a failing activation all reject (fails for every caller)', async (t) => {
    const fault = faultable({ attach: C.fault.reject })
    const h = await bootChild(t, { workspaceRegistry: fault.make })
    const service = h.requireInstance()
    const results = await Promise.all(Array.from({ length: C.concurrency.many }, () => outcome(service.manager.ensureSession())))
    assert.deepEqual(results.map(({ status }) => status), Array(C.concurrency.many).fill('rejected'))
    assert.ok(sessionIdsSeen(h).size <= 1, 'never two manager sessions')
    assert.equal(service.manager.sessionId(), undefined)
  })

  it('F-04 BVA: two failed attempts then success -> one session, one workspace, listed once', async (t) => {
    const fault = faultable({ attach: C.fault.reject })
    const h = await bootChild(t, { workspaceRegistry: fault.make })
    const service = h.requireInstance()
    assert.equal((await outcome(service.manager.ensureSession())).status, 'rejected')
    assert.equal((await outcome(service.manager.ensureSession())).status, 'rejected', 'the second attempt re-ran the attach and failed again')
    assert.ok(fault.calls.attachSession >= 2, 'each attempt retried the attach (calls: ' + fault.calls.attachSession + ')')
    fault.clear()
    const id = await service.manager.ensureSession()
    assert.equal(sessionIdsSeen(h).size, 1)
    await assertAttached(h, id)
    assert.equal(workspacesAt(h, await managerFolder(h.home, { create: false })).length, 1)
  })

  it('F-05 ST: resumed legacy manager with a failing attach -> rejects; retry attaches the same id', async (t) => {
    const sessionLogs = new Map()
    const legacy = await bootChild(t, { sessionLogs, workspaceRegistry: () => createFakeWorkspaceRegistry({ headerOf: (sid) => legacy.sessionHeaders.get(sid) }) })
    const id = await legacy.requireInstance().manager.ensureSession()
    await legacy.close()
    const fault = faultable({ attach: C.fault.reject })
    const second = await bootChild(t, { home: legacy.home, sessionLogs, workspaceRegistry: fault.make })
    const service = second.requireInstance()
    assert.equal((await outcome(service.manager.ensureSession())).status, 'rejected')
    assert.equal(service.manager.sessionId(), undefined)
    fault.clear()
    assert.equal(await service.manager.ensureSession(), id)
    assert.deepEqual([...sessionIdsSeen(second)], [id])
    await assertAttached(second, id)
  })

  it('F-06 ST: route under an attach fault: POST 503, GET null; cleared: POST 200 {id}, GET {id}', async (t) => {
    const fault = faultable({ create: C.fault.reject })
    const h = await bootChild(t, { workspaceRegistry: fault.make })
    const call = await routeOf(h)
    const failed = await call('POST')
    assert.equal(failed.status, C.route.unavailable, 'never a silent 200: ' + JSON.stringify(failed.body))
    assert.deepEqual(failed.body, C.unavailableBody)
    assert.deepEqual((await call('GET')).body, { sessionId: null }, 'GET reads null after the failed attach')
    fault.clear()
    const ok = await call('POST')
    assert.equal(ok.status, C.route.ok)
    assert.equal(typeof ok.body.sessionId, 'string')
    await assertAttached(h, ok.body.sessionId)
    const get = await call('GET')
    assert.equal(get.status, C.route.ok)
    assert.deepEqual(get.body, { sessionId: ok.body.sessionId })
    assert.equal(sessionIdsSeen(h).size, 1)
  })

  it('F-07 EP: a fault in resolveByPath (if the child looks up first) also surfaces, then recovers', async (t) => {
    const fault = faultable({ resolve: C.fault.reject })
    const h = await bootChild(t, { workspaceRegistry: fault.make })
    const service = h.requireInstance()
    const first = await outcome(service.manager.ensureSession())
    if (fault.calls.resolveByPath === 0) {
      // resolveByPath is not part of this child's attach path: the fault cannot apply, and the
      // activation must then simply have attached.
      assert.equal(first.status, 'fulfilled')
      await assertAttached(h, first.value)
      return
    }
    assert.equal(first.status, 'rejected', 'a failing lookup is never a silent success')
    fault.clear()
    await assertAttached(h, await service.manager.ensureSession())
  })
})

// ---------------------------------------------------------------------------------------------
// G. GET stays read-only (contract point 5)
// ---------------------------------------------------------------------------------------------

describe('G. GET /api/fishball/session never creates, never creates a workspace, never attaches', () => {
  it('G-01 ST: fresh child, GET x3 -> {sessionId:null}; no session, no workspace, no registry write', async (t) => {
    const fault = faultable()
    const h = await bootChild(t, { workspaceRegistry: fault.make })
    const call = await routeOf(h)
    for (let index = 0; index < 3; index++) {
      const answer = await call('GET')
      assert.equal(answer.status, C.route.ok)
      assert.deepEqual(answer.body, { sessionId: null })
    }
    assert.equal(h.agents.length, 0, 'GET created no session')
    assert.deepEqual(h.workspaces.list(), [], 'GET created no workspace')
    assert.equal(fault.writes(), 0, 'GET made no registry write: ' + JSON.stringify(fault.calls))
  })

  it('G-02 ST: resumable never-attached manager on disk: GET -> null and attaches nothing', async (t) => {
    const sessionLogs = new Map()
    const legacy = await bootChild(t, { sessionLogs, workspaceRegistry: () => createFakeWorkspaceRegistry({ headerOf: (sid) => legacy.sessionHeaders.get(sid) }) })
    const id = await legacy.requireInstance().manager.ensureSession()
    await legacy.close()
    const fault = faultable()
    const second = await bootChild(t, { home: legacy.home, sessionLogs, workspaceRegistry: fault.make })
    const call = await routeOf(second)
    assert.deepEqual((await call('GET')).body, { sessionId: null }, 'not activated yet: GET reports no id')
    assert.equal(second.agents.length, 0, 'GET resumed nothing')
    assert.deepEqual(memberships(second, id), [], 'GET attached nothing')
    assert.equal(fault.writes(), 0)
  })

  it('G-03 ST: after an attach failure, GET x2 stays null and re-runs no attach', async (t) => {
    const fault = faultable({ attach: C.fault.reject })
    const h = await bootChild(t, { workspaceRegistry: fault.make })
    const call = await routeOf(h)
    assert.equal((await call('POST')).status, C.route.unavailable)
    const counted = { ...fault.calls }
    const agentsBefore = h.agents.length
    fault.clear()
    assert.deepEqual((await call('GET')).body, { sessionId: null })
    assert.deepEqual((await call('GET')).body, { sessionId: null })
    assert.deepEqual(fault.calls, counted, 'GET made no registry call at all')
    assert.equal(h.agents.length, agentsBefore, 'GET created or resumed nothing')
    const id = h.agents[0]?.live.id
    if (id !== undefined) assert.deepEqual(memberships(h, id), [], 'GET attached nothing')
  })

  it('G-04 ST: after a successful ensure, GET reports the attached id and writes nothing more', async (t) => {
    const fault = faultable()
    const h = await bootChild(t, { workspaceRegistry: fault.make })
    const call = await routeOf(h)
    const { body } = await call('POST')
    const counted = { ...fault.calls }
    assert.deepEqual((await call('GET')).body, body)
    assert.deepEqual(fault.calls, counted)
    await assertAttached(h, body.sessionId)
  })
})

// ---------------------------------------------------------------------------------------------
// P. System path: page client over the real route and child (frozen page flow)
// ---------------------------------------------------------------------------------------------

/**
 * loadPage's responder backed by the real route of `h`; `answered` lists the settled answers, so
 * a case waits for the page's request to finish instead of guessing at a render state.
 */
function realResponder(call) {
  const answered = []
  const respond = async ({ method }) => { const answer = await call(method); answered.push({ method, ...answer }); return answer }
  return { respond, answered }
}

/** `METHOD status null|id|code` of one answered page request. */
function summary({ method, status, body }) {
  const value = body.code ?? (body.sessionId === null ? 'null' : 'id')
  return method + ' ' + status + ' ' + value
}

/** Wait until `count` page requests have been answered, then let the page apply them. */
async function answeredAtLeast(responder, count) {
  await waitFor(() => responder.answered.length >= count)
  await settle()
}

describe('P. page client over the real child: opens a blank, attached, typeable manager session', () => {
  it('P-01 ST: page open on a fresh child -> GET null, one POST, opens the attached manager; no turn', async (t) => {
    const h = await bootChild(t)
    const responder = realResponder(await routeOf(h))
    const page = loadPage({ respond: responder.respond })
    t.after(() => page.dispose())
    await answeredAtLeast(responder, 2)
    assert.deepEqual(responder.answered.map(summary), ['GET 200 null', 'POST 200 id'], 'GET null, then one successful POST')
    assert.equal(page.posts().length, 1)
    assert.equal(page.opened.length, 1, 'the page opened the manager session')
    await assertAttached(h, page.opened[0])
    assertNoTurn(h)
    assert.deepEqual(page.statuses(), [])
  })

  it('P-02 ST: attach fails at page open -> unavailable + Retry; fault cleared, Retry -> GET null -> POST -> opened', async (t) => {
    const fault = faultable({ attach: C.fault.reject })
    const h = await bootChild(t, { workspaceRegistry: fault.make })
    const responder = realResponder(await routeOf(h))
    const page = loadPage({ respond: responder.respond })
    t.after(() => page.dispose())
    await answeredAtLeast(responder, 2)
    assert.deepEqual(responder.answered.map(summary), ['GET 200 null', 'POST 503 MANAGER_UNAVAILABLE'])
    assert.deepEqual(page.opened, [], 'nothing opened while the attach fails')
    assert.ok(page.statuses().includes(C.unavailableText))
    assert.ok(page.retry(), 'Retry shown')
    fault.clear()
    const postsBefore = page.posts().length
    page.retry().props.onClick()
    await answeredAtLeast(responder, 4)
    assert.deepEqual(responder.answered.slice(2).map(summary), ['GET 200 null', 'POST 200 id'], 'Retry: GET reads null after the failed attach, then POST re-runs it')
    assert.equal(page.posts().length, postsBefore + 1, 'Retry read GET null and POSTed once, re-running the attach')
    assert.equal(page.opened.length, 1)
    await assertAttached(h, page.opened[0])
    assert.equal(sessionIdsSeen(h).size, 1)
    assert.deepEqual(page.statuses(), [])
  })
})

/** Poll host-side (real timers, never the page's) until `check()` holds; bounded. */
async function waitFor(check, { budgetMs = 10000, pollMs = 10 } = {}) {
  const deadline = Date.now() + budgetMs
  while (!check() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, pollMs))
}
