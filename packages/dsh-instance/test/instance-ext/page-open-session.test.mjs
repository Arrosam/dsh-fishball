/**
 * Page-open manager Session (dev/v2-page-open-session), black-box from the requirements.
 *
 * A. `/api/fishball/session` route module (registerSessionRoute) over a fake route context.
 * B. `fishballInstance.manager.ensureSession()` through the real child app/chat path (bootChild,
 *    whose fake agents service counts create/resume and records followups and session events),
 *    plus one fake-chat-port case bound via createExtensions().bind().
 * C. The browser page client.js loaded in node:vm with minimal fakes (page-open-session-page.mjs).
 *
 * Techniques: EP (equivalence partitions), BVA (boundary values), DT (decision table),
 * ST (state transitions). Each case names its technique.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bootChild, messageText } from '../../../../test/support/instance-ext.mjs'
import { loadCore, loadInstance } from '../../../../test/support/body-soul-env.mjs'
import { loadPage, settle } from './page-open-session-page.mjs'

const ROUTE = Object.freeze({
  path: '/api/fishball/session',
  origin: 'http://127.0.0.1:1',
  event: 'connection/request',
  service: 'fishballInstance',
  unavailable: Object.freeze({ code: 'MANAGER_UNAVAILABLE' }),
  notAllowed: Object.freeze({ code: 'METHOD_NOT_ALLOWED' }),
  allow: 'GET, POST',
  secret: 'secret-detail-must-not-leak',
})
const ID = 'session-manager-1'
// Any plugin id: manager.notify takes the caller's id as given (X10).
const NOTICE_PLUGIN = 'fbtest-plugin'

// ---------------------------------------------------------------------------------------------
// A. Route module
// ---------------------------------------------------------------------------------------------

/** A fake route context; `instance` is what ctx.get('fishballInstance') returns. */
async function routeHarness(instance) {
  const { registerSessionRoute } = await loadInstance('src/native-runtime/session-route.js')
  const handlers = new Map()
  const routes = []
  const lookups = []
  const ctx = {
    on(event, handler) { handlers.set(event, handler); return () => handlers.delete(event) },
    connection: { fetch: { register(route) { routes.push(route); return () => {} } } },
    get(name) { lookups.push(name); return name === ROUTE.service ? instance : undefined },
  }
  registerSessionRoute(ctx)
  assert.equal(routes.length, 1, 'exactly one fetch route is registered')
  const route = routes[0]
  async function call(method, suffix = '') {
    const response = await route.fetch(new Request(ROUTE.origin + ROUTE.path + suffix, { method, ...(method === 'POST' ? { body: '{}' } : {}) }))
    const text = await response.text()
    return { status: response.status, headers: response.headers, text, body: text === '' ? undefined : JSON.parse(text) }
  }
  /** Drive the waterfall handler; resolves with {next, status, headers, body}. */
  async function waterfall(method, url = ROUTE.path) {
    const handler = handlers.get(ROUTE.event)
    assert.equal(typeof handler, 'function', 'a connection/request handler is registered')
    const result = { next: 0, status: undefined, headers: {}, chunks: [] }
    const response = {
      statusCode: 200,
      writeHead(status, headers) { result.status = status; Object.assign(result.headers, lower(headers)); return response },
      setHeader(name, value) { result.headers[name.toLowerCase()] = value },
      end(chunk) { if (chunk !== undefined) result.chunks.push(String(chunk)); result.ended = true; if (result.status === undefined) result.status = response.statusCode },
      write(chunk) { result.chunks.push(String(chunk)) },
    }
    await handler({ method, url, headers: {} }, response, () => { result.next++ })
    const text = result.chunks.join('')
    return { ...result, text, body: text === '' ? undefined : JSON.parse(text) }
  }
  return { route, call, waterfall, lookups }
}

function lower(headers = {}) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]))
}

/** A manager service with counting spies. */
function managerService({ apiVersion = 1, sessionId = () => undefined, ensureSession } = {}) {
  const calls = { sessionId: 0, ensureSession: 0 }
  const manager = {
    sessionId: typeof sessionId === 'function' ? (...args) => { calls.sessionId++; return sessionId(...args) } : sessionId,
  }
  if (ensureSession !== undefined) {
    manager.ensureSession = typeof ensureSession === 'function' ? (...args) => { calls.ensureSession++; return ensureSession(...args) } : ensureSession
  }
  return { service: { apiVersion, manager }, calls }
}

function assertJsonHeaders(headers) {
  assert.match(headers.get('content-type') ?? '', /^application\/json/)
  assert.equal(headers.get('cache-control'), 'no-store')
}

function assertUnavailable(answer) {
  assert.equal(answer.status, 503)
  assert.deepEqual(answer.body, ROUTE.unavailable)
  assertJsonHeaders(answer.headers)
  assert.ok(!answer.text.includes(ROUTE.secret), 'error details are never serialized')
}

describe('A. route registration', () => {
  it('A-01 EP: path is /api/fishball/session and methods are exactly GET and POST', async () => {
    const { route } = await routeHarness(managerService().service)
    assert.equal(route.path, ROUTE.path)
    assert.deepEqual([...route.methods].sort(), ['GET', 'POST'])
    assert.equal(typeof route.fetch, 'function')
  })
})

describe('A. GET (read-only)', () => {
  it('A-02 EP: a live string id -> 200 {sessionId}', async () => {
    const { service } = managerService({ sessionId: () => ID, ensureSession: async () => 'other' })
    const { call } = await routeHarness(service)
    const answer = await call('GET')
    assert.equal(answer.status, 200)
    assert.deepEqual(answer.body, { sessionId: ID })
    assertJsonHeaders(answer.headers)
  })

  it('A-03 BVA: undefined manager id -> 200 {sessionId:null}', async () => {
    const { service } = managerService({ sessionId: () => undefined })
    const answer = await (await routeHarness(service)).call('GET')
    assert.equal(answer.status, 200)
    assert.deepEqual(answer.body, { sessionId: null })
    assertJsonHeaders(answer.headers)
  })

  it('A-04 ST: GET never calls ensureSession (null and live ids)', async () => {
    for (const value of [undefined, ID]) {
      const { service, calls } = managerService({ sessionId: () => value, ensureSession: async () => ID })
      const { call } = await routeHarness(service)
      await call('GET')
      await call('GET')
      assert.equal(calls.ensureSession, 0, 'GET must never create a session')
    }
  })

  it('A-05 BVA: a query string is ignored for GET', async () => {
    const { service } = managerService({ sessionId: () => ID })
    const answer = await (await routeHarness(service)).call('GET', '?x=1')
    assert.equal(answer.status, 200)
    assert.deepEqual(answer.body, { sessionId: ID })
  })

  // DT: service / apiVersion / sessionId member / outcome -> 503.
  const getUnavailable = [
    ['service missing', undefined],
    ['apiVersion 0 (BVA below)', managerService({ apiVersion: 0, sessionId: () => ID }).service],
    ['apiVersion 2 (BVA above)', managerService({ apiVersion: 2, sessionId: () => ID }).service],
    ['apiVersion "1" (EP wrong type)', managerService({ apiVersion: '1', sessionId: () => ID }).service],
    ['sessionId not a function', managerService({ sessionId: ID }).service],
    ['manager missing', { apiVersion: 1 }],
    ['sessionId throws', managerService({ sessionId: () => { throw new Error(ROUTE.secret) } }).service],
    ['returns empty string (BVA)', managerService({ sessionId: () => '' }).service],
    ['returns blank string', managerService({ sessionId: () => '   ' }).service],
    ['returns a number', managerService({ sessionId: () => 42 }).service],
    ['returns null', managerService({ sessionId: () => null }).service],
    ['returns an object', managerService({ sessionId: () => ({ id: ID }) }).service],
  ]
  for (const [label, service] of getUnavailable) {
    it(`A-06 DT/EP: GET with ${label} -> 503 MANAGER_UNAVAILABLE`, async () => {
      assertUnavailable(await (await routeHarness(service)).call('GET'))
    })
  }

  it('A-07 BVA: a one-character id is valid', async () => {
    const answer = await (await routeHarness(managerService({ sessionId: () => 'x' }).service)).call('GET')
    assert.equal(answer.status, 200)
    assert.deepEqual(answer.body, { sessionId: 'x' })
  })
})

describe('A. POST (ensure)', () => {
  it('A-08 EP: POST calls ensureSession once and returns 200 {sessionId}', async () => {
    const { service, calls } = managerService({ sessionId: () => undefined, ensureSession: async () => ID })
    const answer = await (await routeHarness(service)).call('POST')
    assert.equal(answer.status, 200)
    assert.deepEqual(answer.body, { sessionId: ID })
    assertJsonHeaders(answer.headers)
    assert.equal(calls.ensureSession, 1)
  })

  it('A-09 ST: repeated POST returns the same id each time (idempotent through the manager)', async () => {
    const { service, calls } = managerService({ ensureSession: async () => ID })
    const { call } = await routeHarness(service)
    const first = await call('POST')
    const second = await call('POST')
    assert.deepEqual(first.body, { sessionId: ID })
    assert.deepEqual(second.body, { sessionId: ID })
    assert.equal(calls.ensureSession, 2)
  })

  it('A-10 BVA: POST with a query string still ensures', async () => {
    const { service } = managerService({ ensureSession: async () => ID })
    const answer = await (await routeHarness(service)).call('POST', '?a=b')
    assert.equal(answer.status, 200)
    assert.deepEqual(answer.body, { sessionId: ID })
  })

  it('A-11 BVA: POST resolving a one-character id -> 200', async () => {
    const answer = await (await routeHarness(managerService({ ensureSession: async () => 'x' }).service)).call('POST')
    assert.equal(answer.status, 200)
    assert.deepEqual(answer.body, { sessionId: 'x' })
  })

  // DT: service / apiVersion / ensureSession member / outcome -> 503.
  const postUnavailable = [
    ['service missing', () => undefined],
    ['apiVersion 0 (BVA)', () => managerService({ apiVersion: 0, ensureSession: async () => ID }).service],
    ['apiVersion 2 (BVA)', () => managerService({ apiVersion: 2, ensureSession: async () => ID }).service],
    ['ensureSession missing', () => managerService({ sessionId: () => ID }).service],
    ['ensureSession not a function', () => managerService({ ensureSession: ID }).service],
    ['ensureSession rejects', () => managerService({ ensureSession: async () => { throw new Error(ROUTE.secret) } }).service],
    ['ensureSession throws synchronously', () => managerService({ ensureSession: () => { throw new Error(ROUTE.secret) } }).service],
    ['resolves empty string (BVA)', () => managerService({ ensureSession: async () => '' }).service],
    ['resolves blank string', () => managerService({ ensureSession: async () => ' \t ' }).service],
    ['resolves undefined', () => managerService({ ensureSession: async () => undefined }).service],
    ['resolves null', () => managerService({ ensureSession: async () => null }).service],
    ['resolves a number', () => managerService({ ensureSession: async () => 7 }).service],
    ['resolves an object', () => managerService({ ensureSession: async () => ({ id: ID }) }).service],
  ]
  for (const [label, make] of postUnavailable) {
    it(`A-12 DT/EP: POST with ${label} -> 503 MANAGER_UNAVAILABLE`, async () => {
      assertUnavailable(await (await routeHarness(make())).call('POST'))
    })
  }

  it('A-13 DT: POST does not succeed from sessionId() alone when ensureSession is missing', async () => {
    const { service } = managerService({ sessionId: () => ID })
    assertUnavailable(await (await routeHarness(service)).call('POST'))
  })
})

describe('A. other methods and paths (waterfall)', () => {
  for (const method of ['PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
    it(`A-14 EP: ${method} on the route -> 405 METHOD_NOT_ALLOWED, Allow: GET, POST`, async () => {
      const { service, calls } = managerService({ sessionId: () => ID, ensureSession: async () => ID })
      const answer = await (await routeHarness(service)).waterfall(method)
      assert.equal(answer.next, 0)
      assert.equal(answer.status, 405)
      assert.deepEqual(answer.body, ROUTE.notAllowed)
      assert.equal(answer.headers.allow, ROUTE.allow)
      assert.match(String(answer.headers['content-type']), /^application\/json/)
      assert.equal(answer.headers['cache-control'], 'no-store')
      assert.equal(calls.ensureSession, 0)
    })
  }

  it('A-15 EP: HEAD on the route -> 405 with Allow: GET, POST', async () => {
    const answer = await (await routeHarness(managerService().service)).waterfall('HEAD')
    assert.equal(answer.next, 0)
    assert.equal(answer.status, 405)
    assert.equal(answer.headers.allow, ROUTE.allow)
  })

  it('A-16 BVA: PUT with a query string is still the route -> 405', async () => {
    const answer = await (await routeHarness(managerService().service)).waterfall('PUT', ROUTE.path + '?q=1')
    assert.equal(answer.status, 405)
    assert.equal(answer.next, 0)
  })

  for (const method of ['GET', 'POST']) {
    it(`A-17 DT: ${method} on the route is not answered by the waterfall (next)`, async () => {
      const answer = await (await routeHarness(managerService().service)).waterfall(method)
      assert.equal(answer.next, 1)
      assert.equal(answer.status, undefined)
    })
  }

  for (const url of ['/api/fishball/sessions', '/api/fishball', '/api/fishball/session/x', '/api/chat', '/']) {
    it(`A-18 EP/BVA: other path ${url} -> next()`, async () => {
      const answer = await (await routeHarness(managerService().service)).waterfall('PUT', url)
      assert.equal(answer.next, 1)
      assert.equal(answer.status, undefined)
    })
  }
})

// ---------------------------------------------------------------------------------------------
// B. manager.ensureSession through the real child app/chat path
// ---------------------------------------------------------------------------------------------

const TURN_EVENTS = Object.freeze(['user/message', 'turn/start'])

/** Session events of every agent, by type. */
function eventTypes(h) {
  return h.agents.flatMap((entry) => entry.live.session.snapshotEvents().map((event) => event.type))
}

describe('B. ensureSession through the chat activation', () => {
  it('B-01 ST: fresh child -> ensureSession creates one session and resolves its live id', async (t) => {
    const h = await bootChild(t)
    const service = h.requireInstance()
    assert.equal(service.manager.sessionId(), undefined, 'no session before ensure (fresh state)')
    assert.equal(h.agents.length, 0)
    const id = await service.manager.ensureSession()
    assert.equal(typeof id, 'string')
    assert.ok(id.trim().length > 0)
    assert.equal(h.agents.length, 1, 'exactly one manager session')
    assert.equal(id, h.manager().id)
    assert.equal(service.manager.sessionId(), id)
  })

  it('B-02 ST: no turn and no model call when the session is ensured', async (t) => {
    const h = await bootChild(t)
    await h.requireInstance().manager.ensureSession()
    assert.equal(h.manager().followups.length, 0, 'no message queued')
    for (const type of TURN_EVENTS) assert.ok(!eventTypes(h).includes(type), `no ${type} event`)
  })

  it('B-03 ST: a turn starts only when a message is sent after ensure', async (t) => {
    // The shared fake agent has its own inbox since b5a99ac but no user/message acceptance, and the
    // harness provides no sessionPersistence; this case adds exactly those so a real send can be
    // accepted. Replacing the inbox would break the fake agent's teardown (inbox.clear).
    const attempts = []
    const h = await bootChild(t, {
      configure: (harness) => { harness.ctx.provide('sessionPersistence', { async flush() {} }) },
      onFollowup: (message, agent) => {
        attempts.push({ text: messageText(message), agent: agent.id })
        agent.session.append('user/message', { id: message.id })
      },
    })
    const id = await h.requireInstance().manager.ensureSession()
    assert.equal(attempts.length, 0, 'ensure queued nothing')
    const sent = await h.http('/api/chat', { method: 'POST', body: { text: 'hello manager' } })
    assert.ok(sent.status < 300, 'send accepted: ' + sent.status + ' ' + (await sent.clone().text()))
    assert.equal(h.agents.length, 1, 'the send reused the ensured session')
    assert.ok(attempts.some((entry) => entry.agent === id && /hello manager/.test(entry.text)), 'the sent message became the turn')
  })

  it('B-04 ST: repeated ensure after creation returns the same id and creates nothing', async (t) => {
    const h = await bootChild(t)
    const service = h.requireInstance()
    const first = await service.manager.ensureSession()
    const second = await service.manager.ensureSession()
    const third = await service.manager.ensureSession()
    assert.equal(second, first)
    assert.equal(third, first)
    assert.equal(h.agents.length, 1)
    assert.equal(h.manager().followups.length, 0)
  })

  it('B-05 BVA: two concurrent ensure calls share one activation', async (t) => {
    const h = await bootChild(t)
    const service = h.requireInstance()
    const [a, b] = await Promise.all([service.manager.ensureSession(), service.manager.ensureSession()])
    assert.equal(a, b)
    assert.equal(h.agents.length, 1, 'never two manager sessions')
  })

  it('B-06 BVA: many (10) concurrent ensure calls share one activation', async (t) => {
    const h = await bootChild(t)
    const service = h.requireInstance()
    const ids = await Promise.all(Array.from({ length: 10 }, () => service.manager.ensureSession()))
    assert.equal(new Set(ids).size, 1)
    assert.equal(h.agents.length, 1)
  })

  it('B-07 DT: concurrent ensure + notify(wake) share one activation', async (t) => {
    const h = await bootChild(t)
    const service = h.requireInstance()
    const notice = service.manager.notify({ pluginId: NOTICE_PLUGIN, dedupeKey: 'page-open-1', text: 'a notice', wake: true })
    const [id, outcome] = await Promise.allSettled([service.manager.ensureSession(), notice])
    assert.equal(id.status, 'fulfilled', 'ensure resolved: ' + (id.reason?.message ?? ''))
    assert.equal(h.agents.length, 1, 'never two manager sessions (notify outcome: ' + (outcome.status === 'rejected' ? outcome.reason?.message : 'ok') + ')')
    assert.equal(id.value, h.manager().id)
  })

  it('B-08 DT: notify first then ensure (reverse order) share one activation', async (t) => {
    const h = await bootChild(t)
    const service = h.requireInstance()
    const ensure = service.manager.ensureSession()
    const notice = service.manager.notify({ pluginId: NOTICE_PLUGIN, dedupeKey: 'page-open-2', text: 'a notice', wake: true })
    const [outcome, id] = await Promise.allSettled([notice, ensure])
    assert.equal(id.status, 'fulfilled')
    assert.equal(h.agents.length, 1, 'never two manager sessions (notify outcome: ' + (outcome.status === 'rejected' ? outcome.reason?.message : 'ok') + ')')
  })

  it('B-09 ST: ensure after the chat page already activated returns the existing id', async (t) => {
    const h = await bootChild(t, { activate: true })
    const existing = h.manager().id
    const id = await h.requireInstance().manager.ensureSession()
    assert.equal(id, existing)
    assert.equal(h.agents.length, 1)
  })

  it('B-10 ST: reading sessionId alone never creates (lazy creation unchanged)', async (t) => {
    const h = await bootChild(t)
    const service = h.requireInstance()
    assert.equal(service.manager.sessionId(), undefined)
    assert.equal(service.manager.sessionId(), undefined)
    assert.equal(h.agents.length, 0)
  })

  it('B-11 ST: after ensure on a fresh child, a restart (same home and logs) resumes instead of creating a second id', async (t) => {
    const sessionLogs = new Map()
    const first = await bootChild(t, { sessionLogs })
    const id = await first.requireInstance().manager.ensureSession()
    await first.close()
    const second = await bootChild(t, { home: first.home, sessionLogs })
    const again = await second.requireInstance().manager.ensureSession()
    assert.equal(again, id, 'the same manager session is resumed')
    assert.equal(second.agents.length, 1)
  })

  it('B-12 EP: ensureSession is a function on the apiVersion 1 manager', async (t) => {
    const h = await bootChild(t)
    const service = h.requireInstance()
    assert.equal(service.apiVersion, 1)
    assert.equal(typeof service.manager.ensureSession, 'function')
    const pending = service.manager.ensureSession()
    assert.equal(typeof pending.then, 'function', 'returns a promise')
    await pending
  })
})

describe('B. ensureSession over a fake chat port (createExtensions().bind)', () => {
  /**
   * A chat port whose activate is counted and resolves after a tick, like a real activation.
   * `activateAttached()` (the page path's member) delegates to the same `activate()`.
   */
  function port() {
    let live
    let inflight
    const counts = { activate: 0, created: 0 }
    const chat = {
      counts,
      sessionId: () => live?.id,
      activate() {
        counts.activate++
        if (live) return Promise.resolve(live)
        inflight ??= new Promise((resolve) => setImmediate(() => { counts.created++; live = { id: ID, followup() {} }; resolve(live) }))
        return inflight
      },
      activateAttached: () => chat.activate(),
    }
    return chat
  }

  it('B-13 EP: ensureSession resolves the id the bound port activated', async (t) => {
    const { createExtensions } = await loadCore('src/slim/child/extensions.js')
    const { mkdtemp, rm } = await import('node:fs/promises')
    const home = await mkdtemp('/private/tmp/fbtest-page-open-')
    t.after(() => rm(home, { recursive: true, force: true }))
    const ext = createExtensions({ on: () => () => {}, effect: (execute) => execute(), get: (name) => (name === 'profileContext' ? { home } : undefined), logger: () => ({ info() {}, warn() {}, error() {}, debug() {} }) })
    const chat = port()
    ext.bind(chat)
    // READY precondition: the app row delivers the child's appReady.onReady as markReady(); this
    // direct construction has no app row, so the case delivers that signal itself.
    ext.markReady()
    const [a, b] = await Promise.all([ext.service.manager.ensureSession(), ext.service.manager.ensureSession()])
    assert.equal(a, ID)
    assert.equal(b, ID)
    assert.ok(chat.counts.activate >= 1, 'goes through chat.activate')
    assert.equal(chat.counts.created, 1)
  })
})

// ---------------------------------------------------------------------------------------------
// C. Browser page client.js
// ---------------------------------------------------------------------------------------------

const UNAVAILABLE_TEXT = 'Fishball session unavailable'
const PAGE_ROUTE = '/api/fishball/session'

/** Scripted responder: per-method queues of {status, body}; the last entry repeats. */
function script(plan) {
  const used = { GET: 0, POST: 0 }
  return ({ method }) => {
    const list = plan[method] ?? [{ status: 405, body: { code: 'METHOD_NOT_ALLOWED' } }]
    const entry = list[Math.min(used[method]++, list.length - 1)]
    return entry
  }
}
const ok = (sessionId) => ({ status: 200, body: { sessionId } })
const down = { status: 503, body: { code: 'MANAGER_UNAVAILABLE' } }

describe('C. fishball page opens the manager session', () => {
  it('C-01 ST: GET null -> one POST -> openSession(id); route is api/fishball/session', async () => {
    const page = loadPage({ respond: script({ GET: [ok(null)], POST: [ok(ID)] }) })
    await settle()
    assert.ok(page.gets().length >= 1)
    assert.equal(page.gets()[0].pathname, PAGE_ROUTE)
    assert.equal(page.posts().length, 1, 'exactly one POST')
    assert.equal(page.posts()[0].pathname, PAGE_ROUTE)
    assert.deepEqual(page.opened, [ID])
    assert.deepEqual(page.statuses(), [], 'no unavailable state')
    page.dispose()
  })

  it('C-02 EP: GET returns an id -> no POST, opens that id', async () => {
    const page = loadPage({ respond: script({ GET: [ok(ID)], POST: [ok('should-not-be-used')] }) })
    await settle()
    assert.equal(page.posts().length, 0)
    assert.deepEqual(page.opened, [ID])
    page.dispose()
  })

  it('C-03 DT: GET 503 -> unavailable + Retry, no POST', async () => {
    const page = loadPage({ respond: script({ GET: [down], POST: [ok(ID)] }) })
    await settle()
    assert.equal(page.posts().length, 0, 'a 503 GET is not "no session"; it must not ensure')
    assert.deepEqual(page.opened, [])
    assert.ok(page.statuses().includes(UNAVAILABLE_TEXT))
    assert.ok(page.retry(), 'Retry button shown')
    page.dispose()
  })

  it('C-04 DT: GET null -> POST 503 -> unavailable + Retry', async () => {
    const page = loadPage({ respond: script({ GET: [ok(null)], POST: [down] }) })
    await settle()
    assert.equal(page.posts().length, 1)
    assert.deepEqual(page.opened, [])
    assert.ok(page.statuses().includes(UNAVAILABLE_TEXT))
    assert.ok(page.retry())
    page.dispose()
  })

  it('C-05 ST: after POST 503, sessions.list notifications and focus never POST again', async () => {
    const page = loadPage({ respond: script({ GET: [ok(null)], POST: [down] }) })
    await settle()
    assert.equal(page.posts().length, 1)
    for (let index = 0; index < 3; index++) { page.notifySessionsList(); await settle() }
    page.focus(); await settle()
    page.focus(); await settle()
    assert.equal(page.posts().length, 1, 'no automatic re-POST')
    assert.ok(page.statuses().includes(UNAVAILABLE_TEXT))
    page.dispose()
  })

  it('C-06 ST: after GET 503, later notifications/focus re-read but never POST', async () => {
    const page = loadPage({ respond: script({ GET: [down, ok(null), ok(null)], POST: [ok(ID)] }) })
    await settle()
    page.notifySessionsList(); await settle()
    page.focus(); await settle()
    assert.equal(page.posts().length, 0, 'POST only from page apply or Retry')
    page.dispose()
  })

  it('C-07 ST: Retry after POST 503 repeats GET and (null) POSTs once, then opens', async () => {
    const page = loadPage({ respond: script({ GET: [ok(null)], POST: [down, ok(ID)] }) })
    await settle()
    const getsBefore = page.gets().length
    page.retry().props.onClick()
    await settle()
    assert.ok(page.gets().length > getsBefore, 'Retry repeats GET')
    assert.equal(page.posts().length, 2, 'exactly one more POST')
    assert.deepEqual(page.opened, [ID])
    assert.deepEqual(page.statuses(), [])
    page.dispose()
  })

  it('C-08 ST: Retry after GET 503 with GET now returning an id -> no POST, opens', async () => {
    const page = loadPage({ respond: script({ GET: [down, ok(ID)], POST: [ok('unused')] }) })
    await settle()
    page.retry().props.onClick()
    await settle()
    assert.equal(page.posts().length, 0)
    assert.deepEqual(page.opened, [ID])
    page.dispose()
  })

  it('C-09 ST: Retry after GET 503 with GET now null -> exactly one POST', async () => {
    const page = loadPage({ respond: script({ GET: [down, ok(null)], POST: [ok(ID)] }) })
    await settle()
    page.retry().props.onClick()
    await settle()
    assert.equal(page.posts().length, 1)
    assert.deepEqual(page.opened, [ID])
    page.dispose()
  })

  it('C-10 ST: once opened, later notifications and focus never POST', async () => {
    const page = loadPage({ respond: script({ GET: [ok(null), ok(ID)], POST: [ok(ID)] }) })
    await settle()
    page.notifySessionsList(); await settle()
    page.focus(); await settle()
    assert.equal(page.posts().length, 1)
    page.dispose()
  })

  it('C-11 EP: no polling timers (setTimeout/setInterval) across apply, failure and Retry', async () => {
    const page = loadPage({ respond: script({ GET: [ok(null)], POST: [down, ok(ID)] }) })
    await settle()
    page.notifySessionsList(); await settle()
    page.retry().props.onClick(); await settle()
    assert.equal(page.timers.setInterval, 0)
    assert.equal(page.timers.setTimeout, 0)
    page.dispose()
  })

  it('C-12 BVA: two Retry presses while unavailable POST at most once each', async () => {
    const page = loadPage({ respond: script({ GET: [ok(null)], POST: [down, down, down] }) })
    await settle()
    page.retry().props.onClick(); await settle()
    page.retry().props.onClick(); await settle()
    assert.equal(page.posts().length, 3, 'one initial + one per Retry')
    assert.ok(page.statuses().includes(UNAVAILABLE_TEXT))
    page.dispose()
  })
})
